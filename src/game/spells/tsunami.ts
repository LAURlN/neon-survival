import { TAU, rand } from '../../engine/math';
import { Spell } from './spell';

/** Wide waves sweep across the field. Traits: Pole (all directions + freeze), Siren's Song. */
export class Tsunami extends Spell {
  protected cast() {
    const { g } = this;
    const p = g.player;
    const n = this.num();
    const pole = this.has(434);
    const siren = this.has(435);
    const base = rand(0, TAU);

    for (let i = 0; i < n; i++) {
      g.after(pole ? 0 : i * 0.35, () => {
        // Direction of travel: evenly spread (Pole), along movement (Siren), or alternating sides.
        let angle: number;
        if (pole) angle = base + (i / n) * TAU;
        else if (siren) angle = Math.atan2(p.mvy, p.mvx) + rand(-0.35, 0.35);
        else angle = (i % 2 === 0 ? 0 : Math.PI) + rand(-0.25, 0.25);

        const speed = this.base('speed');
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        // Siren's waves start at the player; the rest start off-screen and cross it.
        const back = siren ? 20 : g.viewR + 40;
        const side = siren ? 0 : rand(-0.35, 0.35) * g.viewH;
        g.spawnProjectile({
          x: p.x - dx * back - dy * side, y: p.y - dy * back + dx * side,
          vx: dx * speed, vy: dy * speed,
          r: 16, halfWidth: this.size(), dmg: this.dmg(), src: this.key, color: this.color, style: 'wave',
          pierce: Infinity, knockback: 150, life: (back + g.viewR + 80) / speed,
          freeze: pole ? 0.9 : 0,
        });
      });
    }
  }
}
