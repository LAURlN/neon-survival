import { TAU, rand } from '../../engine/math';
import { Spell } from './spell';

/** Growing whirlwinds. Traits: Electric Orb (shrinks, fires sparks), Void (stationary, fast growth). */
export class Cyclone extends Spell {
  protected cast() {
    const { g } = this;
    const p = g.player;
    const n = this.num();
    const orb = this.has(462);
    const still = this.has(463);
    const life = this.dur();
    const size = this.size();

    for (let i = 0; i < n; i++) {
      g.after(still ? i * 0.2 : 0, () => {
        const angle = rand(0, TAU);
        const start = still ? g.randomTarget(g.viewR * 0.6) : { x: p.x, y: p.y };
        const speed = still ? 0 : this.base('speed');
        const dmg = this.dmg();
        g.addZone({
          ...start, r: orb ? size * 1.6 : size, life, interval: this.base('interval'), dmg,
          src: this.key, color: orb ? '#b3a1ff' : this.color, style: 'tornado',
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          grow: orb ? (-size * 1.2) / life : this.stat('growth') * g.stats.mult('size'),
          onTick: orb
            ? (z) => {
                const a = rand(0, TAU);
                g.spawnProjectile({ x: z.x, y: z.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, r: 5,
                                    dmg, src: this.key, color: '#b3a1ff', style: 'spark', life: 0.9, pierce: 1 });
              }
            : undefined,
        });
      });
    }
  }
}
