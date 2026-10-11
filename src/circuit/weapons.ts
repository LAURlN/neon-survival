/**
 * Turns an emitted spark into a weapon. One function per shape × type pair,
 * keyed "shape.mode"; names and power values are in data/weapons.ts.
 *
 * Every weapon talks to the world through the Game helpers only, and passes
 * `c.onHit` along so the spark's element applies to whatever it hits.
 */
import { GAME } from '../data/tuning';
import { WEAPONS } from '../data/weapons';
import type { Sfx } from '../engine/audio';
import { TAU, chance, rand } from '../engine/math';
import type { Game } from '../game/game';
import type { Enemy, Projectile } from '../game/types';
import { ELEMENT_COLOR, type Element, type Shape, type Spark } from './spark';

/** Everything a weapon needs to know about the shot it is firing. */
interface Shot {
  g: Game;
  /** Projectiles to fire. */
  n: number;
  /** Damage of one hit. */
  dmg: number;
  /** Damage source key, "shape.mode". */
  src: string;
  color: string;
  /** Global area and duration multipliers. */
  size: number;
  dur: number;
  onHit?: (e: Enemy) => void;
}

const SFX: Record<Shape, Sfx> = { arrow: 'shoot', beam: 'laser', seeker: 'dart', bomb: 'launch' };

/** What a spark's element does to an enemy it hits. */
function elementHook(g: Game, element: Element, dmg: number): ((e: Enemy) => void) | undefined {
  switch (element) {
    case 'fire':
      return (e) => {
        e.burn = Math.max(e.burn, dmg * 0.2);
        e.burnT = 3;
      };
    case 'shock':
      return (e) => {
        if (!chance(30)) return;
        let jumps = 0;
        g.grid.query(e.x, e.y, 130, (o) => {
          if (o === e || o.dead || jumps >= 2) return;
          jumps++;
          g.lightning(e.x, e.y, o.x, o.y, ELEMENT_COLOR.shock, 0.15, 2);
          g.hit(o, dmg * 0.5, 'arc');
        });
      };
    case 'cryo':
      return (e) => {
        e.chill = 2.5;
        if (chance(12)) g.freeze(e, 1);
      };
    case 'acid':
      return (e) => {
        e.melt = Math.min(50, e.melt + 5);
      };
    default:
      return undefined;
  }
}

// ---- shared helpers ---------------------------------------------------------

/** Angle from the player to the nearest hostile, fanned out for multi-shots. */
function aim(c: Shot, i: number, step: number): number {
  const p = c.g.player;
  const e = c.g.nearest(p.x, p.y);
  const a = e ? Math.atan2(e.y - p.y, e.x - p.x) : Math.atan2(p.mvy, p.mvx);
  return a + (i - (c.n - 1) / 2) * step;
}

/** The slowly turning direction that unaimed weapons fire along. */
const spin = (c: Shot) => c.g.time * 2.6;

/** A uniformly random spot on screen around the player. */
function skyPoint(c: Shot) {
  const p = c.g.player;
  const a = rand(0, TAU);
  const d = Math.sqrt(Math.random()) * Math.min(c.g.viewW, c.g.viewH) * 0.48;
  return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
}

/** The `n` hostiles closest to the player. */
function nearestN(c: Shot, n: number): Enemy[] {
  const p = c.g.player;
  const skip = new Set<Enemy>();
  for (let i = 0; i < n; i++) {
    const e = c.g.nearest(p.x, p.y, c.g.viewR, skip);
    if (!e) break;
    skip.add(e);
  }
  return [...skip];
}

function bolt(c: Shot, angle: number, speed: number, extra: Partial<Projectile> = {}): Projectile {
  const p = c.g.player;
  return c.g.spawnProjectile({ x: p.x, y: p.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, dmg: c.dmg,
                               src: c.src, color: c.color, onHit: c.onHit, ...extra });
}

/** A projectile that circles the player. `tick` may take over (return true) to stop the orbiting. */
function orbiter(c: Shot, i: number, radius: number, life: number, extra: Partial<Projectile>,
                 tick?: (pr: Projectile) => boolean): Projectile {
  let a = spin(c) + (i / c.n) * TAU;
  let free = false;
  const p = c.g.player;
  return c.g.spawnProjectile({
    x: p.x + Math.cos(a) * radius, y: p.y + Math.sin(a) * radius, vx: 0, vy: 0, dmg: c.dmg, src: c.src,
    color: c.color, life, style: 'orb', onHit: c.onHit,
    update: (pr, dt, g) => {
      if (free) return;
      a += 4.2 * dt;
      pr.x = g.player.x + Math.cos(a) * radius;
      pr.y = g.player.y + Math.sin(a) * radius;
      if (tick?.(pr)) free = true;
    },
    ...extra,
  });
}

/** Explosion carrying the shot's element. */
function boom(c: Shot, x: number, y: number, r: number, knockback = 0) {
  c.g.explode(x, y, r * c.size, c.dmg, c.src, c.color, { knockback, onHit: c.onHit });
}

function each(c: Shot, fn: (i: number) => void) {
  for (let i = 0; i < c.n; i++) fn(i);
}

// ---- the matrix -------------------------------------------------------------

const FIRE: Record<string, (c: Shot) => void> = {
  // Aimed: leaves the player towards the nearest hostile.
  'arrow.aim': (c) => each(c, (i) => bolt(c, aim(c, i, 0.13), 640)),
  'beam.aim': (c) => each(c, (i) => {
    const p = c.g.player;
    const a = aim(c, i, 0.16);
    c.g.strikeLine(p.x, p.y, p.x + Math.cos(a) * 520, p.y + Math.sin(a) * 520, 9, c.dmg, c.src, c.color, c.onHit);
  }),
  'seeker.aim': (c) => each(c, (i) => {
    const p = c.g.player;
    bolt(c, aim(c, i, 0.5), 380, { homing: c.g.nearest(p.x, p.y), life: 2.5, style: 'shard', r: 5 });
  }),
  'bomb.aim': (c) => each(c, (i) => {
    bolt(c, aim(c, i, 0.3), 340, { dmg: 0, life: 0.85, r: 9, style: 'orb', onHit: undefined,
                                   onEnd: (pr) => boom(c, pr.x, pr.y, 70) });
  }),

  // Loose: leaves the player along a turning direction, no aiming.
  'arrow.loose': (c) => each(c, (i) => {
    for (let k = 0; k < 3; k++) bolt(c, spin(c) + (k * TAU) / 3 + i * 0.35, 520, { pierce: 1, r: 5 });
  }),
  'beam.loose': (c) => each(c, (i) => {
    c.g.addBeam({ angle: spin(c) + (i * TAU) / c.n, life: 0.9 * c.dur, spin: 5, len: 300 * c.size, width: 8,
                  interval: 0.15, dmg: c.dmg, src: c.src, color: c.color, onHit: c.onHit });
  }),
  'seeker.loose': (c) => each(c, () => {
    for (let k = 0; k < 3; k++) {
      let age = 0;
      bolt(c, rand(0, TAU), 260, { life: 2.2, style: 'shard', r: 4,
        update: (pr, dt, g) => {
          if ((age += dt) > 0.25 && !pr.homing) pr.homing = g.nearest(pr.x, pr.y, 420);
        } });
    }
  }),
  'bomb.loose': (c) => each(c, (i) => {
    const p = c.g.player;
    const off = i ? 28 : 0;
    c.g.spawnProjectile({ x: p.x + rand(-off, off), y: p.y + rand(-off, off), vx: 0, vy: 0, dmg: 0, src: c.src,
                          color: c.color, life: 9, r: 11, style: 'orb', onEnd: (pr) => boom(c, pr.x, pr.y, 80) });
  }),

  // Orbit: circles the player.
  'arrow.orbit': (c) => each(c, (i) => orbiter(c, i, 80, 4 * c.dur, { r: 9, rehit: 0.35, pierce: Infinity })),
  'beam.orbit': (c) => each(c, (i) => {
    const p = c.g.player;
    c.g.addZone({ x: p.x, y: p.y, r: 95 * c.size * (1 + 0.35 * i), life: 1.2 * c.dur, interval: 0.3, dmg: c.dmg,
                  src: c.src, color: c.color, style: 'ring', follow: true, onHit: c.onHit });
  }),
  'seeker.orbit': (c) => each(c, (i) => {
    orbiter(c, i, 58, 5 * c.dur, { r: 6, style: 'shard' }, (pr) => {
      const e = c.g.nearest(pr.x, pr.y, 170);
      if (!e) return false;
      const a = Math.atan2(e.y - pr.y, e.x - pr.x);
      pr.vx = Math.cos(a) * 440;
      pr.vy = Math.sin(a) * 440;
      pr.homing = e;
      pr.life = Math.min(pr.life, 2);
      return true;
    });
  }),
  'bomb.orbit': (c) => each(c, (i) => {
    orbiter(c, i, 66, 5 * c.dur, { dmg: 0, r: 10, onHit: undefined, onEnd: (pr) => boom(c, pr.x, pr.y, 68) });
  }),

  // Sky: lands on a random spot.
  'arrow.sky': (c) => each(c, (i) => {
    for (let k = 0; k < 4; k++) {
      c.g.after(i * 0.03 + k * 0.06, () => {
        const pt = skyPoint(c);
        c.g.lightning(pt.x + rand(-24, 24), pt.y - 220, pt.x, pt.y, c.color, 0.14, 2);
        c.g.ring(pt.x, pt.y, 30 * c.size, c.color, 0.2);
        c.g.explode(pt.x, pt.y, 30 * c.size, c.dmg, c.src, c.color, { quiet: true, onHit: c.onHit });
      });
    }
  }),
  'beam.sky': (c) => each(c, () => {
    const pt = skyPoint(c);
    c.g.mark(pt.x, pt.y, 50 * c.size, c.color, 0.35);
    c.g.after(0.35, () => {
      c.g.addZone({ x: pt.x, y: pt.y, r: 50 * c.size, life: 1.2 * c.dur, interval: 0.2, dmg: c.dmg, src: c.src,
                    color: c.color, style: 'pool', onHit: c.onHit });
    });
  }),
  'seeker.sky': (c) => each(c, () => {
    const pt = skyPoint(c);
    const e = c.g.nearest(pt.x, pt.y, 500);
    const a = e ? Math.atan2(e.y - pt.y, e.x - pt.x) : rand(0, TAU);
    c.g.ring(pt.x, pt.y, 22, c.color, 0.25);
    c.g.spawnProjectile({ x: pt.x, y: pt.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, dmg: c.dmg, src: c.src,
                          color: c.color, homing: e, life: 2.5, r: 6, style: 'shard', onHit: c.onHit });
  }),
  'bomb.sky': (c) => each(c, () => {
    const pt = skyPoint(c);
    c.g.mark(pt.x, pt.y, 100 * c.size, c.color, 0.6);
    c.g.after(0.6, () => {
      boom(c, pt.x, pt.y, 100, 220);
      c.g.shake = Math.max(c.g.shake, 4);
    });
  }),

  // Lock: appears on the nearest hostile. Wasted if there is none.
  'arrow.lock': (c) => {
    const p = c.g.player;
    for (const e of nearestN(c, c.n)) {
      c.g.lightning(p.x, p.y, e.x, e.y, c.color, 0.12, 2);
      c.g.hit(e, c.dmg, c.src);
      c.onHit?.(e);
    }
  },
  'beam.lock': (c) => {
    for (const e of nearestN(c, c.n)) {
      const len = 140 * c.size;
      for (const a of [spin(c), spin(c) + Math.PI / 2]) {
        const dx = Math.cos(a) * len;
        const dy = Math.sin(a) * len;
        c.g.strikeLine(e.x - dx, e.y - dy, e.x + dx, e.y + dy, 8, c.dmg, c.src, c.color, c.onHit);
      }
    }
  },
  'seeker.lock': (c) => {
    const skip = new Set<Enemy>();
    for (const first of nearestN(c, c.n)) {
      let from: { x: number; y: number } = c.g.player;
      let cur: Enemy | null = first;
      for (let hop = 0; hop < 3 && cur; hop++) {
        skip.add(cur);
        c.g.lightning(from.x, from.y, cur.x, cur.y, c.color, 0.16, 2.5);
        c.g.hit(cur, c.dmg, c.src);
        c.onHit?.(cur);
        from = cur;
        cur = c.g.nearest(cur.x, cur.y, 170, skip);
      }
    }
  },
  'bomb.lock': (c) => {
    for (const e of nearestN(c, c.n)) boom(c, e.x, e.y, 72);
  },
};

/** Fire the weapon a spark describes. */
export function fireWeapon(g: Game, s: Spark) {
  const src = `${s.shape}.${s.mode}`;
  const dmg = ((s.energy * GAME.energyDamage) / 100) * g.atk * g.stats.mult('allDmg') * WEAPONS[s.shape][s.mode].power;
  FIRE[src]({
    g, n: s.count, dmg, src, color: ELEMENT_COLOR[s.element], size: g.stats.mult('size', -80),
    dur: g.stats.mult('dur', -80), onHit: elementHook(g, s.element, dmg),
  });
  g.sound(SFX[s.shape]);
}
