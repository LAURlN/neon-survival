import { lerp, rand } from '../../engine/math';
import { Spell } from './spell';

/** A stream of flame towards the nearest enemy. Traits: Flamestrike, Pyromaniac, Cerberus Flame. */
export class Incineration extends Spell {
  protected cast() {
    const { g } = this;
    const p = g.player;
    const n = this.num();
    const range = this.stat('range');
    const spread = 0.2 * g.stats.mult('incin.width', -80);
    const sides = this.has(490) ? [0, Math.PI / 2, -Math.PI / 2] : [0];
    const target = g.nearest(p.x, p.y, range * 1.5);
    if (!target) return false;
    const facing = Math.atan2(target.y - p.y, target.x - p.x);

    for (let i = 0; i < n; i++) {
      g.after(i * this.base('interval'), () => {
        // Flamestrike: each flame is stronger than the last.
        const t = n > 1 ? i / (n - 1) : 1;
        const power = this.has(488) ? lerp(1, 4, t) : 1;
        const grow = this.has(488) ? lerp(1, 1.5, t) : 1;
        for (const side of sides) {
          const a = facing + side + rand(-spread, spread);
          const speed = range / 0.55;
          g.spawnProjectile({
            x: p.x, y: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
            r: this.size() * grow, dmg: this.dmg(power), src: this.key, color: this.color, style: 'flame',
            pierce: Infinity, life: 0.55, drag: 0.35,
          });
        }
      });
    }

    if (this.has(489)) {
      for (const off of [-0.45, 0.45]) {
        const a = facing + off;
        g.addZone({ x: p.x + Math.cos(a) * range * 0.55, y: p.y + Math.sin(a) * range * 0.55,
                    r: this.size() * 3, life: 2.6, interval: 0.4, dmg: this.dmg(), src: this.key,
                    color: this.color, style: 'pool' });
      }
    }
  }
}
