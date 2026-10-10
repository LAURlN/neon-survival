import { Spell } from './spell';

/** Icy blast around the player. Traits: Ice Age (triple blast), Earthquake (stun). */
export class FrostNova extends Spell {
  protected cast() {
    const { g } = this;
    const p = g.player;
    const quake = this.has(400);
    const color = quake ? '#d9b382' : this.color;
    const blasts = this.has(399) ? 3 : 1;
    for (let i = 0; i < blasts; i++) {
      const scale = Math.pow(1.5, i);
      g.after(i * 0.28, () => {
        g.explode(p.x, p.y, this.size() * scale, this.dmg(scale), this.key, color, {
          freeze: this.base('freeze'), knockback: quake ? 120 : 0,
        });
        if (quake) g.shake = Math.max(g.shake, 6);
      });
    }
  }
}
