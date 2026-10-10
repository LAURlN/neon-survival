import type { Projectile } from '../types';
import { Spell } from './spell';

/** Explosive projectile. Traits: Big Bang (first shot bigger), Toxic Gas (lingering cloud). */
export class Fireball extends Spell {
  protected cast() {
    const { g } = this;
    const p = g.player;
    if (!g.nearest(p.x, p.y, g.viewR * 0.9)) return false;
    const n = this.num();
    for (let i = 0; i < n; i++) {
      g.after(i * 0.18, () => {
        const target = i === 0 ? g.nearest(p.x, p.y) : g.randomEnemy();
        const angle = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(p.mvy, p.mvx);
        this.fire(angle, i === 0 && this.has(371) ? 1.5 : 1);
      });
    }
  }

  private fire(angle: number, big: number) {
    const { g } = this;
    const speed = this.base('speed');
    const radius = this.size() * big;
    const dmg = this.dmg(big);
    const boom = (x: number, y: number) => {
      g.explode(x, y, radius, dmg, this.key, this.color, { knockback: 60 });
      if (this.has(372)) {
        g.addZone({ x, y, r: radius * 1.15, life: 0.95, interval: 0.3, t: 0.3, dmg: dmg * 0.5,
                    src: this.key, color: '#9be36a', style: 'pool', grow: radius * 0.3 });
      }
    };
    let exploded = false;
    g.spawnProjectile({
      x: g.player.x, y: g.player.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      // The projectile itself deals no damage - the explosion does.
      r: 9 * big, dmg: 0, src: this.key, color: this.color, style: 'orb', life: 1.6,
      pierce: g.stats.flat('fireball.pierce'),
      onHit: (e) => {
        exploded = true;
        boom(e.x, e.y);
      },
      onEnd: (proj: Projectile) => {
        if (!exploded) boom(proj.x, proj.y);
      },
    });
  }
}
