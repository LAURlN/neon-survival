import type { EnemyDef } from './content';
import type { Game } from './game';

export type EnemyKind = 'normal' | 'elite' | 'boss';

export interface Enemy {
  def: EnemyDef;
  kind: EnemyKind;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  atk: number;
  speed: number;
  /** Seconds of freeze / stun remaining (cannot move or attack). */
  frozen: number;
  /** Knockback velocity, decays quickly. */
  kx: number;
  ky: number;
  /** White hit-flash timer. */
  flash: number;
  /** Time until this enemy can damage the player again. */
  touchT: number;
  /** Per-source "next allowed hit" timestamps, for things that re-hit on an interval. */
  hitT: Record<string, number>;
  /** Counters used by traits (EMP hits, melt stacks). */
  hits: number;
  melt: number;
  /** Rusher enemies dash periodically. */
  dashT: number;
  wobble: number;
  dead: boolean;
}

export type ProjectileStyle = 'bolt' | 'orb' | 'shard' | 'flame' | 'wave' | 'spark';

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  /** Stat key of the spell that fired it (for crit and damage tracking). */
  src: string;
  /** Remaining enemies it can pass through; Infinity pierces everything. */
  pierce: number;
  life: number;
  color: string;
  style: ProjectileStyle;
  /** Enemies already hit (ignored when `rehit` is set). */
  hit: Set<Enemy>;
  /** If set, the same enemy can be hit again after this many seconds. */
  rehit?: number;
  /** Steer towards this enemy. */
  homing?: Enemy | null;
  /** Half-width for wide "wave" projectiles (collides as a line, not a circle). */
  halfWidth?: number;
  knockback?: number;
  freeze?: number;
  /** Velocity multiplier per second (< 1 slows down). */
  drag?: number;
  onHit?(e: Enemy, p: Projectile, g: Game): void;
  /** Called when the projectile expires or runs out of pierce. */
  onEnd?(p: Projectile, g: Game): void;
  update?(p: Projectile, dt: number, g: Game): void;
  dead: boolean;
}

export type ZoneStyle = 'aura' | 'pool' | 'tornado' | 'ring' | 'frost' | 'field';

export interface Zone {
  x: number;
  y: number;
  r: number;
  life: number;
  maxLife: number;
  /** Seconds between damage ticks. */
  interval: number;
  t: number;
  dmg: number;
  src: string;
  color: string;
  style: ZoneStyle;
  /** Stays centred on the player. */
  follow?: boolean;
  vx: number;
  vy: number;
  /** Radius change per second. */
  grow: number;
  freeze?: number;
  onHit?(e: Enemy, z: Zone, g: Game): void;
  onTick?(z: Zone, g: Game): void;
  dead: boolean;
}

export interface Beam {
  x: number;
  y: number;
  angle: number;
  len: number;
  width: number;
  life: number;
  maxLife: number;
  interval: number;
  t: number;
  dmg: number;
  src: string;
  color: string;
  /** Radians per second. */
  spin: number;
  dead: boolean;
}

export type PickupKind = 'mana' | 'life' | 'chest' | 'magnet';

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  value: number;
  /** Being pulled towards the player. */
  pulled: boolean;
  age: number;
  dead: boolean;
}

export interface Fx {
  kind: 'ring' | 'burst' | 'lightning' | 'text' | 'spark' | 'mark';
  x: number;
  y: number;
  r: number;
  life: number;
  maxLife: number;
  color: string;
  text?: string;
  /** Polyline for lightning, world coordinates. */
  pts?: number[];
  vx?: number;
  vy?: number;
}
