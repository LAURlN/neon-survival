import { Spell } from './spell';

/** Delayed heavy impact. Traits: Volcanic Eruption (instant + crater), Asteroid (one huge meteor). */
export class Meteor extends Spell {
  protected cast() {
    const { g } = this;
    const count = this.num();
    const asteroid = this.has(445);
    const n = asteroid ? 1 : count;
    const radius = this.size() * (asteroid ? 1 + 0.5 * (count - 1) : 1);
    const gap = this.stat('interval', -80);

    for (let i = 0; i < n; i++) {
      g.after(i * gap, () => {
        const { x, y } = g.randomTarget(g.viewR * 0.6);
        const delay = this.has(443) ? 0.05 : this.base('delay');
        g.mark(x, y, radius, this.color, delay);
        g.after(delay, () => {
          g.explode(x, y, radius, this.dmg(), this.key, this.color, { knockback: 90 });
          g.shake = Math.max(g.shake, asteroid ? 9 : 4);
          if (this.has(443)) {
            g.addZone({ x, y, r: radius * 0.85, life: 3, interval: 0.5, t: 0.5, dmg: this.dmg(0.25),
                        src: this.key, color: this.color, style: 'pool' });
          }
        });
      });
    }
  }
}
