import { Spell } from './spell';

/** Burning pools. Traits: Melt (stacking vulnerability), Magma Eruption (one vast pool). */
export class LavaZone extends Spell {
  protected cast() {
    const { g } = this;
    const count = this.num();
    const merged = this.has(535);
    const n = merged ? 1 : count;
    const radius = this.size() * (merged ? 1 + 0.3 * (count - 1) : 1);

    for (let i = 0; i < n; i++) {
      g.after(i * 0.15, () => {
        const spot = g.randomTarget(g.viewR * 0.55);
        g.addZone({
          ...spot, r: radius, life: this.dur(), interval: this.base('interval'), dmg: this.dmg(),
          src: this.key, color: this.color, style: 'pool',
          onHit: this.has(533) ? (e) => void (e.melt = Math.min(30, e.melt + 5)) : undefined,
        });
      });
    }
  }
}
