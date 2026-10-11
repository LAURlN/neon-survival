/**
 * Boss behaviour. A boss is an ordinary enemy with a `boss` state attached;
 * its pattern decides what it does on top of walking at the player. Patterns
 * and their numbers are listed in `BOSSES` in tuning.ts.
 */
import { BOSSES, type BossPattern } from '../data/tuning';
import { TAU } from '../engine/math';
import type { Game } from './game';
import type { Enemy } from './types';

export interface BossState {
  pattern: BossPattern;
  name: string;
  /** Seconds until the next thing happens. */
  t: number;
  /** True while an attack is being telegraphed. */
  winding: boolean;
  /** Locked charge direction. */
  ax: number;
  ay: number;
}

const WARN = '#ff2e4d';

export function makeBoss(index: number): BossState {
  const pattern = BOSSES.patterns[index % BOSSES.patterns.length];
  return { pattern, name: BOSSES.names[pattern], t: 3, winding: false, ax: 0, ay: 0 };
}

export function updateBoss(g: Game, e: Enemy, dt: number) {
  const b = e.boss!;
  const p = g.player;
  if ((b.t -= dt) > 0) return;

  switch (b.pattern) {
    // Stops, shows the line it will take, then lunges along it.
    case 'charger':
      if (!b.winding) {
        const d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
        b.ax = (p.x - e.x) / d;
        b.ay = (p.y - e.y) / d;
        b.winding = true;
        b.t = BOSSES.chargeWindup;
        e.speedMul = 0;
        const reach = BOSSES.chargeSpeed / 8; // knockback velocity decays at 8/s
        g.fx.push({ kind: 'lightning', x: e.x, y: e.y, r: 3, life: b.t, maxLife: b.t, color: WARN,
                    pts: [e.x, e.y, e.x + b.ax * reach, e.y + b.ay * reach] });
      } else {
        e.kx = b.ax * BOSSES.chargeSpeed;
        e.ky = b.ay * BOSSES.chargeSpeed;
        e.speedMul = 1;
        b.winding = false;
        b.t = BOSSES.chargeEvery;
        g.sound('wave');
      }
      break;

    // Calls a ring of ordinary hostiles around itself.
    case 'summoner':
      b.t = BOSSES.summonEvery;
      g.ring(e.x, e.y, e.r + 70, e.color, 0.5);
      for (let i = 0; i < BOSSES.summonCount; i++) {
        const a = (i / BOSSES.summonCount) * TAU;
        g.director.spawn(g.director.minionId(), 'normal', { x: e.x + Math.cos(a) * (e.r + 40), y: e.y + Math.sin(a) * (e.r + 40) });
      }
      break;

    // Marks a circle around itself, then detonates it.
    case 'pulsar':
      if (!b.winding) {
        b.winding = true;
        b.t = BOSSES.pulseWindup;
        e.speedMul = 0;
        g.mark(e.x, e.y, BOSSES.pulseRadius, WARN, b.t);
      } else {
        b.winding = false;
        b.t = BOSSES.pulseEvery;
        e.speedMul = 1;
        g.ring(e.x, e.y, BOSSES.pulseRadius, WARN, 0.4);
        g.burst(e.x, e.y, BOSSES.pulseRadius * 0.8, WARN, 0.3);
        g.sound('boom', 2);
        g.shake = Math.max(g.shake, 6);
        if (Math.hypot(p.x - e.x, p.y - e.y) < BOSSES.pulseRadius + p.r) p.takeDamage(e.atk * BOSSES.pulseDamage);
      }
      break;

    // Does nothing special while alive; see onBossDeath.
    case 'hive':
      b.t = 60;
      break;
  }
}

export function onBossDeath(g: Game, e: Enemy) {
  if (e.boss?.pattern !== 'hive') return;
  for (let i = 0; i < BOSSES.hiveElites; i++) {
    const a = (i / BOSSES.hiveElites) * TAU;
    g.director.spawn(BOSSES.hiveEliteId, 'elite', { x: e.x + Math.cos(a) * 50, y: e.y + Math.sin(a) * 50 });
  }
}
