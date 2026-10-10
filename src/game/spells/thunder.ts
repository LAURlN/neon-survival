import { randInt } from '../../engine/math';
import { Spell } from './spell';

/** Lightning strikes. Traits: Thunderclap (repeats), Lightning Explosion, Judgment (one huge bolt). */
export class Thunderstorm extends Spell {
  protected cast() {
    const { g } = this;
    if (!this.has(417) && !g.randomEnemy()) return false;
    const n = this.num();
    const repeats = this.has(416) ? randInt(1, 3) : 1;

    for (let rep = 0; rep < repeats; rep++) {
      if (this.has(418)) {
        g.after(rep * 0.25, () => this.strike(this.size() * (1 + 0.2 * (n - 1)), true));
        continue;
      }
      for (let i = 0; i < n; i++) {
        g.after(rep * 0.25 + i * 0.1, () => this.strike(this.size() * (this.has(417) ? 1.5 : 1), false));
      }
    }
  }

  private strike(radius: number, heavy: boolean) {
    const { g } = this;
    const e = this.has(417) ? null : g.randomEnemy();
    const { x, y } = e ?? g.randomTarget();
    g.lightning(x + 30, y - g.viewH, x, y, this.color, 0.2, heavy ? 7 : 3);
    g.explode(x, y, radius, this.dmg(), this.key, this.color);
    if (heavy) {
      // Judgment: half damage in a wider ring around the impact.
      g.explode(x, y, radius * 1.8, this.dmg(0.5), this.key, this.color, { quiet: true });
      g.shake = Math.max(g.shake, 6);
    }
  }
}
