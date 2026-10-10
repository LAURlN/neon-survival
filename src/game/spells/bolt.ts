import { TAU, rand } from '../../engine/math';
import type { Enemy } from '../types';
import { Spell } from './spell';

/** Fires bolts at the nearest enemy. Traits: pierce, split, extra targets, random spray. */
export class MagicBolt extends Spell {
  protected cast() {
    const { g } = this;
    const p = g.player;
    const spray = this.has(366);
    const targets: (Enemy | null)[] = [];
    if (!spray) {
      const seen = new Set<Enemy>();
      const count = 1 + g.stats.flat('bolt.targets');
      for (let i = 0; i < count; i++) {
        const e = g.nearest(p.x, p.y, g.viewR * 0.9, seen);
        if (!e) break;
        seen.add(e);
        targets.push(e);
      }
      if (targets.length === 0) return false;
    } else {
      targets.push(null);
    }

    const n = this.num();
    for (const target of targets) {
      for (let i = 0; i < n; i++) {
        g.after(i * (spray ? 0.03 : 0.07), () => {
          const angle = target && !target.dead
            ? Math.atan2(target.y - p.y, target.x - p.x)
            : spray ? rand(0, TAU) : Math.atan2(p.mvy, p.mvx);
          this.fire(angle);
        });
      }
    }
  }

  private fire(angle: number) {
    const { g } = this;
    const speed = this.stat('speed');
    const dmg = this.dmg();
    g.spawnProjectile({
      x: g.player.x, y: g.player.y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      r: this.size(), dmg, src: this.key, color: this.color, style: 'bolt', life: 1.4,
      pierce: this.has(362) ? Infinity : 0,
      onHit: this.has(363)
        ? (e, proj) => {
            // Fireworks: explode, then split into three sparks.
            g.explode(e.x, e.y, 40 * g.stats.mult('size'), dmg * 0.6, this.key, this.color);
            const baseAngle = Math.atan2(proj.vy, proj.vx);
            for (const off of [-0.5, 0, 0.5]) {
              g.spawnProjectile({
                x: e.x, y: e.y, vx: Math.cos(baseAngle + off) * speed, vy: Math.sin(baseAngle + off) * speed,
                r: 4, dmg: dmg * 0.5, src: this.key, color: this.color, style: 'spark', life: 0.5,
                hit: new Set([e]),
              });
            }
          }
        : undefined,
    });
  }
}
