import { TAU, distToSegment2, rand, randInt } from '../../engine/math';
import { Spell } from './spell';

/** A line of electricity. Traits: Chain Lightning (repeats), Superconductivity (aims at enemies). */
export class ElectricShock extends Spell {
  protected cast() {
    const { g } = this;
    const aimed = this.has(472);
    if (aimed && !g.nearest(g.player.x, g.player.y, this.base('range'))) return false;
    const n = this.num();
    const repeats = this.has(470) ? randInt(1, 3) : 1;
    for (let rep = 0; rep < repeats; rep++) {
      for (let i = 0; i < n; i++) g.after(rep * 0.16 + i * (aimed ? 0.08 : 0.03), () => this.strike(aimed));
    }
  }

  private strike(aimed: boolean) {
    const { g } = this;
    const p = g.player;
    const target = aimed ? g.randomEnemy(this.base('range')) : null;
    const angle = target ? Math.atan2(target.y - p.y, target.x - p.x) : rand(0, TAU);
    const len = this.base('range');
    const width = this.size();
    const ex = p.x + Math.cos(angle) * len;
    const ey = p.y + Math.sin(angle) * len;
    g.lightning(p.x, p.y, ex, ey, this.color, 0.2, Math.max(2.5, width / 5));
    const dmg = this.dmg();
    g.grid.query((p.x + ex) / 2, (p.y + ey) / 2, len / 2 + width, (e) => {
      if (distToSegment2(e.x, e.y, p.x, p.y, ex, ey) <= (width + e.r) ** 2) g.hit(e, dmg, this.key);
    });
  }
}
