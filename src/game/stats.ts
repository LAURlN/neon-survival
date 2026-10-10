/**
 * The stat sheet: every upgrade in the game (spell level, trait, passive,
 * artifact) is a list of `[effectId, value]` pairs that gets folded into this
 * sheet. Gameplay code never looks at upgrades directly - it only reads stats.
 *
 * Each stat key has three buckets:
 *   flat - added to the base value        (e.g. +1 projectile)
 *   pct  - summed percentage modifiers    (e.g. +50% damage, -15% cooldown)
 *   mul  - multiplied "X" modifiers       (e.g. damage x2)
 *
 *   final = (base + flat) * (1 + pct / 100) * mul
 */
import { EFFECTS, type EffectKind } from './effects';

interface Bucket {
  flat: number;
  pct: number;
  mul: number;
}

export type Effect = [id: number, value: number];

export class StatSheet {
  private buckets = new Map<string, Bucket>();
  /** Bumped on every change so cached derived values can be invalidated. */
  version = 0;

  private bucket(key: string): Bucket {
    let b = this.buckets.get(key);
    if (!b) {
      b = { flat: 0, pct: 0, mul: 1 };
      this.buckets.set(key, b);
    }
    return b;
  }

  add(key: string, kind: EffectKind, amount: number) {
    const b = this.bucket(key);
    if (kind === 'flat' || kind === 'flag') b.flat += amount;
    else if (kind === 'pct') b.pct += amount;
    else b.mul *= amount;
    this.version++;
  }

  /** Apply one `[effectId, value]` pair. Unknown ids are ignored. */
  apply([id, value]: Effect) {
    const def = EFFECTS[id];
    if (!def) return;
    let amount = value * def.scale;
    // "X" multipliers are stored either as 2 (= x2) or as 150 (= x1.5).
    if (def.kind === 'mul') amount = value >= 100 ? value / 100 : value;
    // "pmul" is a percentage that multiplies instead of stacking additively.
    else if (def.kind === 'pmul') amount = 1 + (value * def.scale) / 100;
    this.add(def.key, def.kind, amount);
  }

  applyAll(effects: readonly Effect[]) {
    for (const e of effects) this.apply(e);
  }

  /** Sum of flat bonuses. */
  flat(key: string): number {
    return this.buckets.get(key)?.flat ?? 0;
  }

  /** Raw percentage sum. */
  pct(key: string): number {
    return this.buckets.get(key)?.pct ?? 0;
  }

  /** Multiplier from pct and mul buckets; `minPct` floors the percentage part. */
  mult(key: string, minPct = -95): number {
    const b = this.buckets.get(key);
    if (!b) return 1;
    return (1 + Math.max(minPct, b.pct) / 100) * b.mul;
  }

  /** (base + flat) * multiplier. */
  value(key: string, base: number, minPct = -95): number {
    return (base + this.flat(key)) * this.mult(key, minPct);
  }

  has(key: string): boolean {
    return this.flat(key) > 0;
  }
}
