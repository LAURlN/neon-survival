import { TAU } from '../../engine/math';
import { Spell } from './spell';

/** Charges that each absorb one hit. Trait: Destruction Field (damaging field on break). */
export class Shield extends Spell {
  onChange() {
    this.g.player.onShieldBreak = () => {
      if (!this.has(409)) return;
      const { g } = this;
      g.addZone({ x: g.player.x, y: g.player.y, r: 95 * g.stats.mult('size'), life: 1.25, interval: 0.3,
                  dmg: g.atk * 0.9 * g.stats.mult('allDmg'), src: this.key, color: this.color,
                  style: 'field', follow: true });
    };
  }

  private get max() {
    return Math.round(this.stat('max'));
  }

  update(dt: number) {
    const p = this.g.player;
    if (p.shields >= this.max) {
      this.lastCooldown = 0;
      this.timer = this.cooldown();
      return;
    }
    this.lastCooldown = this.cooldown();
    this.timer = Math.min(this.timer, this.lastCooldown) - dt;
    if (this.timer <= 0) {
      p.shields = Math.min(this.max, p.shields + Math.round(this.stat('charge')));
      this.timer = this.lastCooldown;
    }
  }

  protected cast() {}

  draw(ctx: CanvasRenderingContext2D) {
    const p = this.g.player;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    for (let i = 0; i < p.shields; i++) {
      ctx.globalAlpha = 0.85 - i * 0.15;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 19 + i * 5, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
