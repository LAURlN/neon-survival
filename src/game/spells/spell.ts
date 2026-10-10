/**
 * Base class for active spells.
 *
 * A spell reads its numbers through the helpers below, which combine the
 * hand-tuned base value (tuning.ts) with whatever the stat sheet has
 * accumulated for `<key>.<stat>`. To add a spell: subclass, implement `cast`,
 * register it in spells/index.ts and give it an entry in tuning.ts.
 */
import type { Sfx } from '../../engine/audio';
import type { SpellDef } from '../content';
import type { Game } from '../game';

/** Sound played when a spell fires. Spells not listed are silent (their explosions speak for them). */
const CAST_SFX: Record<string, Sfx> = {
  bolt: 'shoot', fireball: 'launch', spirit: 'dart', nova: 'cryo', tsunami: 'wave', cloak: 'buff',
  cyclone: 'wave', arma: 'purge', incin: 'flame', ebolt: 'launch', blizzard: 'cryo', ray: 'laser',
  circle: 'buff', lava: 'flame',
};

export abstract class Spell {
  level = 1;
  /** Number of repeatable max-level bonuses taken. */
  overLevel = 0;
  readonly traits = new Set<number>();
  /** Seconds until the next cast. */
  protected timer = 0.3;
  /** Cooldown used for the HUD ring; 0 for spells that are always on. */
  lastCooldown = 0;

  constructor(readonly def: SpellDef, protected readonly g: Game) {}

  get key() {
    return this.def.key;
  }
  get color() {
    return this.def.color;
  }

  /** Base value from tuning.ts. */
  protected base(stat: string): number {
    return this.def.base[stat] ?? 0;
  }

  has(traitId: number) {
    return this.traits.has(traitId);
  }

  /** Damage of one hit. */
  dmg(scale = 1): number {
    const s = this.g.stats;
    return this.g.atk * this.base('dmg') * s.mult(`${this.key}.dmg`) * s.mult('allDmg') * scale;
  }

  /** Projectile / strike count. */
  num(): number {
    return Math.max(1, Math.round(this.g.stats.value(`${this.key}.num`, this.base('num'))));
  }

  cooldown(): number {
    const s = this.g.stats;
    const own = this.base('cd') * s.mult(`${this.key}.cd`, -85) + s.flat(`${this.key}.cdSec`);
    return Math.max(0.08, own * this.g.cooldownMult);
  }

  /** Area / projectile size, affected by "all magic size". */
  size(stat = 'size'): number {
    const s = this.g.stats;
    return this.base(stat) * s.mult(`${this.key}.size`, -80) * s.mult('size', -80);
  }

  /** Duration, affected by "all magic duration". */
  dur(stat = 'dur'): number {
    const s = this.g.stats;
    return this.base(stat) * s.mult(`${this.key}.dur`, -80) * s.mult('dur', -80);
  }

  /** Any other per-spell stat with no global counterpart. */
  stat(stat: string, minPct = -90): number {
    return this.g.stats.value(`${this.key}.${stat}`, this.base(stat), minPct);
  }

  /** Fraction of the cooldown remaining, for the HUD (0 = ready). */
  get cooldownLeft(): number {
    return this.lastCooldown > 0 ? Math.max(0, this.timer / this.lastCooldown) : 0;
  }

  update(dt: number) {
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.cast() === false) {
        this.timer = 0.15; // Nothing to do (no target) - retry shortly.
      } else {
        const sfx = CAST_SFX[this.key];
        if (sfx) this.g.sound(sfx);
        this.lastCooldown = this.cooldown();
        this.timer += this.lastCooldown;
        if (this.timer < 0) this.timer = 0;
      }
    }
  }

  /** Called when the cooldown elapses. Return false to retry almost immediately. */
  protected abstract cast(): boolean | void;

  /** Called after any upgrade to this spell (level, trait, over-level). */
  onChange(): void {}

  /** Draw persistent visuals in world space (satellites, auras...). */
  draw(_ctx: CanvasRenderingContext2D): void {}
}

export type SpellClass = new (def: SpellDef, g: Game) => Spell;
