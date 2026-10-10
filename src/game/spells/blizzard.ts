import { TAU, rand } from '../../engine/math';
import { Spell } from './spell';

/** Ice shards rain around the player. Traits: Sub-Zero (global slow), Shooting Star, Conflagration. */
export class Blizzard extends Spell {
  /** Seconds the current storm keeps going (for Sub-Zero). */
  private active = 0;

  update(dt: number) {
    const b = this.g.buffs;
    if (this.active > 0) {
      this.active -= dt;
      if (this.has(506)) b.enemySlow = this.active > 0 ? Math.min(0.6, b.enemySlow + 0.03 * dt) : 0;
    }
    super.update(dt);
  }

  protected cast() {
    const { g } = this;
    const p = g.player;
    const n = this.num();
    const gap = this.stat('interval', -80);
    const reach = this.stat('radius', -80);
    const burn = this.has(508);
    const color = burn ? '#ff9a4a' : this.color;
    this.active = n * gap + 0.5;

    for (let i = 0; i < n; i++) {
      g.after(i * gap, () => {
        // Half the shards seek an enemy, the rest scatter.
        let spot = Math.random() < 0.5 ? g.randomEnemy(reach) : null;
        const a = rand(0, TAU);
        const d = Math.sqrt(Math.random()) * reach;
        const x = spot ? spot.x : p.x + Math.cos(a) * d;
        const y = spot ? spot.y : p.y + Math.sin(a) * d;
        const radius = this.size();
        const delay = this.has(507) ? 0.6 : 0.3;
        g.mark(x, y, radius, color, delay);
        g.after(delay, () => {
          g.explode(x, y, radius, this.dmg(), this.key, color, { freeze: burn ? 0 : this.base('freeze') });
          if (burn) g.after(0.18, () => g.explode(x, y, radius, this.dmg(0.9), this.key, color));
        });
      });
    }
  }
}
