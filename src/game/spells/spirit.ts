import { TAU } from '../../engine/math';
import { Spell } from './spell';

/** Spirits hover around you and fire homing shards. Trait: Magic Blade (instant strike). */
export class Spirit extends Spell {
  private spin = 0;

  private position(i: number, n: number) {
    const a = this.spin + (i / n) * TAU;
    const p = this.g.player;
    return { x: p.x + Math.cos(a) * 30, y: p.y - 6 + Math.sin(a) * 18 };
  }

  update(dt: number) {
    this.spin += dt * 1.4;
    super.update(dt);
  }

  protected cast() {
    const { g } = this;
    const n = this.num();
    if (!g.nearest(g.player.x, g.player.y, g.viewR * 0.85)) return false;
    for (let i = 0; i < n; i++) {
      g.after(i * 0.06, () => {
        const from = this.position(i, n);
        const target = g.randomEnemy(g.viewR * 0.75) ?? g.nearest(from.x, from.y);
        if (!target) return;
        if (this.has(381)) {
          g.lightning(target.x - 22, target.y - 22, target.x + 22, target.y + 22, this.color, 0.14, 4);
          g.hit(target, this.dmg(), this.key);
          return;
        }
        const angle = Math.atan2(target.y - from.y, target.x - from.x);
        const speed = this.base('speed');
        g.spawnProjectile({
          x: from.x, y: from.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          r: 5, dmg: this.dmg(), src: this.key, color: this.color, style: 'shard', life: 1.6, homing: target,
        });
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const n = this.num();
    ctx.fillStyle = this.color;
    for (let i = 0; i < n; i++) {
      const { x, y } = this.position(i, n);
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, TAU);
      ctx.fill();
    }
  }
}
