import { TAU } from '../../engine/math';
import { Spell } from './spell';

/** Orbs orbit the player and damage on contact. Always active (no cooldown). */
export class Satellite extends Spell {
  private angle = 0;
  private orbs: { x: number; y: number; r: number }[] = [];

  update(dt: number) {
    const { g } = this;
    const p = g.player;
    const fused = this.has(391);
    const count = this.num();
    const n = fused ? 1 : count;

    let speed = this.stat('speed', -70);
    // Anti-Gravity: rotation speed swells to 3x and back.
    if (this.has(389)) speed *= 2 + Math.sin(g.time * 1.3);
    this.angle += speed * dt;

    const radius = this.size() * (fused ? 1 + count * 0.6 : 1);
    const dmg = this.dmg(fused ? count : 1);
    const rehit = fused ? 0.3 : this.base('rehit');
    const orbit = this.base('orbit') * (fused ? 1.25 : 1);

    this.orbs.length = 0;
    for (let i = 0; i < n; i++) {
      // Will-o-the-Wisp: every other orb rides an outer ring, spinning the other way.
      const outer = this.has(390) && i % 2 === 1;
      const a = (outer ? -this.angle * 0.8 : this.angle) + (i / n) * TAU;
      const d = orbit * (outer ? 1.7 : 1);
      const x = p.x + Math.cos(a) * d;
      const y = p.y + Math.sin(a) * d;
      this.orbs.push({ x, y, r: radius });
      g.grid.query(x, y, radius, (e) => {
        if (e.dead || (e.hitT.sat ?? 0) > g.time) return;
        e.hitT.sat = g.time + rehit;
        g.hit(e, dmg, this.key);
      });
    }
  }

  protected cast() {}

  draw(ctx: CanvasRenderingContext2D) {
    for (const o of this.orbs) {
      ctx.fillStyle = this.color;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * 1.6, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * 0.45, 0, TAU);
      ctx.fill();
    }
  }
}
