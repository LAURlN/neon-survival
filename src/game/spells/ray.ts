import { TAU, rand } from '../../engine/math';
import { Spell } from './spell';

/** Piercing beams. Traits: Reflect (opposite ray), Disintegration Ray (sweeps), Electromagnetic Burst. */
export class ArcaneRay extends Spell {
  protected cast() {
    const { g } = this;
    const p = g.player;
    const burst = this.has(517);
    const target = g.nearest(p.x, p.y, g.viewR);
    if (!target && !burst) return false;

    const n = this.num();
    const aim = target ? Math.atan2(target.y - p.y, target.x - p.x) : 0;
    const sweep = this.has(516);
    const life = this.dur() * (sweep ? 1.6 : 1);
    const interval = burst ? 0.5 : this.stat('interval', -80);

    for (let i = 0; i < n; i++) {
      const angle = burst ? rand(0, TAU) : sweep ? aim + (i / n) * TAU : aim + (i - (n - 1) / 2) * 0.2;
      const angles = this.has(515) ? [angle, angle + Math.PI] : [angle];
      for (const a of angles) {
        g.addBeam({ angle: a, life, interval, dmg: this.dmg(), src: this.key, color: this.color,
                    width: this.size(), len: this.base('range'), spin: sweep ? 2.2 : 0 });
      }
    }
  }
}
