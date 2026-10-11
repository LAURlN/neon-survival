/**
 * What the player is offered on a level-up or from a data cache, and what
 * taking it does. Every choice is an `Offer`; the UI just shows them and
 * calls `apply`.
 *
 *   level-up   -> basic circuit tiles, and sometimes a stat upgrade
 *   data cache -> special circuit tiles, and a piece of cyberware
 *   boss cache -> legendary circuit tiles
 */
import { VOCAB } from '../data/theme';
import { CAT_LABEL, RARITY, TILE_LIST, type TileDef } from '../data/tiles';
import { GAME, GRADES } from '../data/tuning';
import { chance, pickWeighted, shuffle } from '../engine/math';
import { ARTIFACTS, PASSIVES, describeEffects, type ArtifactDef, type PassiveDef } from './content';
import type { Game } from './game';
import type { Effect } from './stats';

export interface Offer {
  title: string;
  /** Small line under the title: "New", "Lv 2 → 3", rarity... */
  tag: string;
  lines: string[];
  color: string;
  /** Glyph for the card badge; defaults to the title's initials. */
  icon?: string;
  /** Applies the choice. May return follow-up offers. */
  apply(): Offer[] | void;
}

/** Take up to `n` different entries from `pool`, weighted. */
function draw<T>(pool: T[], n: number, weight: (t: T) => number): T[] {
  const rest = [...pool];
  const out: T[] = [];
  while (out.length < n && rest.length > 0) {
    const chosen = pickWeighted(rest, weight);
    rest.splice(rest.indexOf(chosen), 1);
    out.push(chosen);
  }
  return out;
}

export class Progression {
  readonly passives = new Map<number, number>();
  readonly artifacts: ArtifactDef[] = [];

  constructor(private readonly g: Game) {}

  private applyEffects(effects: readonly Effect[]) {
    this.g.stats.applyAll(effects);
    for (const [id, value] of effects) {
      // "Increase current level by N" grants the level-ups right away.
      if (id === 105) {
        this.g.level += value;
        this.g.pendingLevelUps += value;
      }
    }
  }

  // ---- building offers -----------------------------------------------------

  private tileOffer(def: TileDef): Offer {
    const n = def.bundle ?? 1;
    const rarity = RARITY[def.rarity];
    return {
      title: n > 1 ? `${def.name} ×${n}` : def.name, tag: `${rarity.name} · ${CAT_LABEL[def.cat]} tile`,
      lines: [def.desc], color: rarity.color, icon: def.glyph,
      apply: () => this.g.board.give(def.id, n),
    };
  }

  private passiveOffer(def: PassiveDef): Offer {
    const lv = this.passives.get(def.id) ?? 0;
    return {
      title: def.name, tag: lv ? `${VOCAB.passive} Lv ${lv} → ${lv + 1}` : VOCAB.newPassive,
      lines: describeEffects(def.effects), color: '#64ff32',
      apply: () => {
        this.passives.set(def.id, lv + 1);
        this.applyEffects(def.effects);
      },
    };
  }

  private artifactOffer(def: ArtifactDef): Offer {
    const grade = GRADES[def.grade];
    return {
      title: def.name, tag: `${grade.name} ${VOCAB.artifact}`, lines: describeEffects(def.effects), color: grade.color,
      apply: () => {
        this.artifacts.push(def);
        this.applyEffects(def.effects);
      },
    };
  }

  /** Choices for a level-up: basic tiles, with a stat upgrade mixed in about half the time. */
  levelOffers(): Offer[] {
    const basics = TILE_LIST.filter((t) => t.rarity <= 1);
    const upgrades = PASSIVES.filter((p) => (this.passives.get(p.id) ?? 0) < p.maxLevel);
    const withUpgrade = upgrades.length > 0 && chance(GAME.upgradeOfferChance);
    // Uncommon tiles (elements, shapes, types, gates) turn up less often than plain building blocks.
    const tiles = draw(basics, GAME.choices - (withUpgrade ? 1 : 0), (t) => (t.weight ?? 1) * (t.rarity ? 0.6 : 1));
    const offers = tiles.map((t) => this.tileOffer(t));
    if (withUpgrade) offers.push(this.passiveOffer(draw(upgrades, 1, () => 1)[0]));
    return offers;
  }

  /** Choices for the cache a boss drops: legendary tiles only. */
  legendaryOffers(): Offer[] {
    return draw(TILE_LIST.filter((t) => t.rarity === 4), GAME.choices, (t) => t.weight ?? 1).map((t) => this.tileOffer(t));
  }

  /** Choices for a data cache: special tiles, plus one piece of cyberware. */
  chestOffers(): Offer[] {
    const owned = new Set(this.artifacts.map((a) => a.id));
    const cyberware = draw(ARTIFACTS.filter((a) => !owned.has(a.id)), 1, (a) => GRADES[a.grade].weight);
    const specials = TILE_LIST.filter((t) => t.rarity >= 2);
    const tiles = draw(specials, GAME.choices - cyberware.length, (t) => RARITY[t.rarity].weight * (t.weight ?? 1));
    return shuffle([...tiles.map((t) => this.tileOffer(t)), ...cyberware.map((a) => this.artifactOffer(a))]);
  }
}
