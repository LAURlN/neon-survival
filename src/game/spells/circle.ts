import { TAU, rand } from '../../engine/math';
import { Spell } from './spell';

/** Temporary ATK amplification. Traits: Unleash Mana, Material Synthesis, Great Magic Circle. */
export class MagicCircle extends Spell {
  private active = 0;

  update(dt: number) {
    if (this.active > 0 && (this.active -= dt) <= 0) {
      this.g.buffs.atkAmp = 0;
      this.g.buffs.cdMult = 1;
    }
    super.update(dt);
  }

  protected cast() {
    const { g } = this;
    const p = g.player;
    this.active = this.dur();
    g.buffs.atkAmp = this.stat('effect') * (this.has(526) ? 2 : 1);
    if (this.has(524)) g.buffs.cdMult = 0.85;
    g.ring(p.x, p.y, 70, this.color, 0.5);
    if (this.has(525)) {
      for (let i = 0; i < 5; i++) {
        const a = rand(0, TAU);
        g.drop('mana', p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 60, 8);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.active <= 0) return;
    const p = this.g.player;
    const t = this.g.time;
    ctx.strokeStyle = this.color;
    ctx.globalAlpha = Math.min(0.7, this.active);
    ctx.lineWidth = 1.5;
    for (const [r, dir] of [[46, 1], [36, -1]] as const) {
      ctx.setLineDash([14, 6]);
      ctx.lineDashOffset = t * 30 * dir;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}
