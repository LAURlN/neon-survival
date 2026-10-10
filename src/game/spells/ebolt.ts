import { TAU } from '../../engine/math';
import { Spell } from './spell';

/** Slow piercing orbs. Traits: Charged Particle (returns), Spark (ticks), Flare (radial + explodes). */
export class EnergyBolt extends Spell {
  protected cast() {
    const { g } = this;
    const p = g.player;
    const flare = this.has(499);
    const target = g.nearest(p.x, p.y, g.viewR * 0.8);
    if (!target && !flare) return false;

    const n = this.num();
    const aim = target ? Math.atan2(target.y - p.y, target.x - p.x) : 0;
    const speed = this.stat('speed');
    const life = this.dur();
    const size = this.size();
    const dmg = this.dmg();

    for (let i = 0; i < n; i++) {
      // Flare: an even ring. Otherwise a fan centred on the target.
      const angle = flare ? (i / n) * TAU : aim + (i - (n - 1) / 2) * 0.22;
      let returning = false;
      g.spawnProjectile({
        x: p.x, y: p.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        r: size, dmg, src: this.key, color: this.color, style: 'orb', pierce: Infinity, life,
        rehit: this.has(498) ? 0.3 : undefined,
        update: this.has(497)
          ? (proj) => {
              if (returning || proj.life > life / 2) return;
              returning = true;
              proj.hit.clear();
              proj.homing = null;
              const a = Math.atan2(p.y - proj.y, p.x - proj.x);
              proj.vx = Math.cos(a) * speed;
              proj.vy = Math.sin(a) * speed;
            }
          : undefined,
        onEnd: flare
          ? (proj) => g.explode(proj.x, proj.y, size * 4, dmg * 2, this.key, this.color)
          : undefined,
      });
    }
  }
}
