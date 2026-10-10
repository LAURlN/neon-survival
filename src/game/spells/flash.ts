import { Spell } from './spell';

/** Sudden bursts on nearby enemies. Traits: Wipeout (lethal centre), Ragnarok (wider reach). */
export class FlashShock extends Spell {
  protected cast() {
    const { g } = this;
    const reach = g.viewR * (this.has(543) ? 0.95 : 0.5);
    if (!g.randomEnemy(reach)) return false;
    const n = this.num();
    for (let i = 0; i < n; i++) {
      g.after(i * 0.07, () => {
        const { x, y } = g.randomTarget(reach);
        const radius = this.size();
        g.mark(x, y, radius, this.color, 0.12);
        g.after(0.12, () => {
          g.explode(x, y, radius, this.dmg(), this.key, this.color);
          // Wipeout: the core deals 10x additional damage.
          if (this.has(542)) g.explode(x, y, radius * 0.25, this.dmg(10), this.key, this.color, { quiet: true });
        });
      });
    }
  }
}
