/**
 * Everything the player owns (spells, passives, artifacts) and the logic that
 * builds level-up / chest choices. Every choice is an `Offer`; the UI just
 * shows them and calls `apply`.
 */
import { VOCAB } from '../data/theme';
import { GAME, GRADES } from '../data/tuning';
import { pickWeighted, shuffle } from '../engine/math';
import {
  ARTIFACTS, PASSIVES, SPELL_BY_ID, SPELL_DEFS, describeEffects,
  type ArtifactDef, type PassiveDef, type SpellDef, type TraitDef,
} from './content';
import type { Game } from './game';
import { SPELL_CLASSES } from './spells';
import type { Spell } from './spells/spell';
import type { Effect } from './stats';

export interface Offer {
  title: string;
  /** Small line under the title: "New", "Lv 2 → 3", grade name... */
  tag: string;
  lines: string[];
  color: string;
  /** Applies the choice. May return follow-up offers (e.g. trait selection). */
  apply(): Offer[] | void;
}

export class Progression {
  readonly spells = new Map<number, Spell>();
  readonly passives = new Map<number, number>();
  readonly artifacts: ArtifactDef[] = [];
  /** Listeners for mana orb pickups (Armageddon's Doom Prophet). */
  readonly manaOrbHooks: (() => void)[] = [];

  constructor(private readonly g: Game) {}

  onManaOrb() {
    for (const fn of this.manaOrbHooks) fn();
  }

  // ---- applying upgrades ---------------------------------------------------

  learnSpell(id: number): Spell {
    const def = SPELL_BY_ID.get(id)!;
    const spell = new SPELL_CLASSES[def.key](def, this.g);
    this.spells.set(id, spell);
    spell.onChange();
    return spell;
  }

  private applyEffects(effects: readonly Effect[]) {
    this.g.stats.applyAll(effects);
    for (const [id, value] of effects) {
      // "Increase current level by N" grants the level-ups right away.
      if (id === 105) {
        this.g.level += value;
        this.g.pendingLevelUps += value;
      }
    }
    for (const s of this.spells.values()) s.onChange();
  }

  private levelUpSpell(spell: Spell, trait?: TraitDef) {
    spell.level++;
    if (trait) {
      spell.traits.add(trait.id);
      this.applyEffects(trait.effects);
    } else {
      this.applyEffects(spell.def.levels[spell.level - 2] ?? []);
    }
  }

  // ---- building offers -----------------------------------------------------

  private spellOffer(def: SpellDef): Offer {
    const owned = this.spells.get(def.id);
    if (!owned) {
      return { title: def.name, tag: VOCAB.newSpell, lines: [def.desc], color: def.color,
               apply: () => void this.learnSpell(def.id) };
    }
    const next = owned.level + 1;
    const traitIndex = def.traitLevels.indexOf(next);
    const group = traitIndex >= 0 ? def.traitGroups[traitIndex] : [];
    if (group.length > 0) {
      return {
        title: def.name, tag: `Lv ${owned.level} → ${next}`, lines: [VOCAB.chooseTrait], color: def.color,
        apply: () => group.map((t) => this.traitOffer(owned, t)),
      };
    }
    const effects = def.levels[next - 2] ?? [];
    const lines = describeEffects(effects);
    return { title: def.name, tag: `Lv ${owned.level} → ${next}`, lines: lines.length ? lines : ['Level up'],
             color: def.color, apply: () => this.levelUpSpell(owned) };
  }

  private traitOffer(spell: Spell, trait: TraitDef): Offer {
    const lines = [...(trait.text ? [trait.text] : []), ...describeEffects(trait.effects)];
    return { title: trait.name, tag: `${spell.def.name} ${VOCAB.trait}`, lines, color: spell.def.color,
             apply: () => this.levelUpSpell(spell, trait) };
  }

  private overLevelOffer(spell: Spell): Offer {
    const def = spell.def;
    return {
      title: def.name, tag: `Mastery +${spell.overLevel + 1}`, lines: describeEffects(def.overLevel),
      color: def.color,
      apply: () => {
        spell.overLevel++;
        this.applyEffects(def.overLevel);
      },
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

  private healOffer(): Offer {
    return { title: 'Repair', tag: 'Nothing left to install', lines: ['Restore 30% HP'], color: '#7dff9a',
             apply: () => this.g.player.heal(this.g.player.maxHp * 0.3) };
  }

  /** Choices for a level-up. */
  levelOffers(): Offer[] {
    const pool: { offer: () => Offer; weight: number }[] = [];
    const canLearn = this.spells.size < GAME.maxSpells;
    for (const def of SPELL_DEFS) {
      const owned = this.spells.get(def.id);
      if (!owned) {
        if (canLearn) pool.push({ offer: () => this.spellOffer(def), weight: 2 });
      } else if (owned.level < def.maxLevel) {
        pool.push({ offer: () => this.spellOffer(def), weight: 3 });
      } else if (def.overLevel.length > 0) {
        pool.push({ offer: () => this.overLevelOffer(owned), weight: 1 });
      }
    }
    for (const def of PASSIVES) {
      if ((this.passives.get(def.id) ?? 0) < def.maxLevel) pool.push({ offer: () => this.passiveOffer(def), weight: 2 });
    }

    const offers: Offer[] = [];
    while (offers.length < GAME.choices && pool.length > 0) {
      const chosen = pickWeighted(pool, (p) => p.weight);
      pool.splice(pool.indexOf(chosen), 1);
      offers.push(chosen.offer());
    }
    return offers.length ? offers : [this.healOffer()];
  }

  /** Choices for a treasure chest. */
  chestOffers(): Offer[] {
    const owned = new Set(this.artifacts.map((a) => a.id));
    const pool = ARTIFACTS.filter((a) => !owned.has(a.id));
    const offers: Offer[] = [];
    while (offers.length < GAME.choices && pool.length > 0) {
      const chosen = pickWeighted(pool, (a) => GRADES[a.grade].weight);
      pool.splice(pool.indexOf(chosen), 1);
      offers.push(this.artifactOffer(chosen));
    }
    return offers.length ? shuffle(offers) : [this.healOffer()];
  }
}
