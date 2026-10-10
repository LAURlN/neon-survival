import { TAU } from '../../engine/math';
import { Spell } from './spell';

/** Damaging field around the player. Traits: EMP (stun every 4th hit), Fire Aura (pulsing ring). */
export class ElectricZone extends Spell {
  private tick = 0;

  private get radius() {
    return this.size();
  }

  update(dt: number) {
    const { g } = this;
    const p = g.player;
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick += this.stat('interval', -80);

    if (this.has(427)) {
      g.explode(p.x, p.y, this.radius * 1.5, this.dmg(), this.key, '#ff8a3c');
      return;
    }
    const dmg = this.dmg();
    g.grid.query(p.x, p.y, this.radius, (e) => {
      if (e.dead) return;
      if (this.has(426) && ++e.hits % 4 === 0) g.freeze(e, 0.7);
      g.hit(e, dmg, this.key);
    });
  }

  protected cast() {}

  draw(ctx: CanvasRenderingContext2D) {
    if (this.has(427)) return;
    const p = this.g.player;
    const r = this.radius;
    ctx.fillStyle = this.color;
    ctx.globalAlpha = 0.1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -this.g.time * 40;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}
