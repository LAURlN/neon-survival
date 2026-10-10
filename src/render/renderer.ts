/**
 * Canvas renderer. Everything is drawn procedurally (no image assets), so a
 * new enemy or effect only needs a few lines here.
 */
import type { Input } from '../engine/input';
import { TAU, clamp, hash2 } from '../engine/math';
import type { Game } from '../game/game';
import type { Enemy, Fx, Pickup, Projectile, Zone } from '../game/types';

const GROUND = '#30353a';
const GROUND_DARK = '#292d32';
const GROUND_LIGHT = '#394047';
const INK = '#0c0e10';

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  zoom = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    // The short side of the screen always shows about 430 world units.
    this.zoom = clamp(Math.min(this.w, this.h) / 430, 0.7, 1.7);
  }

  draw(g: Game, input: Input) {
    const { ctx, w, h, zoom } = this;
    const p = g.player;
    g.viewW = w / zoom;
    g.viewH = h / zoom;
    g.viewR = Math.hypot(g.viewW, g.viewH) / 2;

    const shakeX = g.shake ? (Math.random() - 0.5) * g.shake : 0;
    const shakeY = g.shake ? (Math.random() - 0.5) * g.shake : 0;
    const camX = p.x + shakeX;
    const camY = p.y + shakeY;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = GROUND;
    ctx.fillRect(0, 0, w, h);

    // World space: origin at the centre of the screen, following the player.
    ctx.setTransform(this.dpr * zoom, 0, 0, this.dpr * zoom, (this.dpr * w) / 2, (this.dpr * h) / 2);
    ctx.translate(-camX, -camY);

    const left = camX - g.viewW / 2;
    const top = camY - g.viewH / 2;
    const visible = (x: number, y: number, r: number) =>
      x + r > left && x - r < left + g.viewW && y + r > top && y - r < top + g.viewH;

    this.drawGround(left, top, g.viewW, g.viewH);
    for (const z of g.zones) if (visible(z.x, z.y, z.r)) this.drawZone(z, g.time);
    for (const f of g.fx) if (f.kind === 'mark') this.drawFx(f);
    for (const it of g.pickups) if (visible(it.x, it.y, 14)) this.drawPickup(it, g.time);
    for (const e of g.enemies) if (visible(e.x, e.y, e.r + 4)) this.drawEnemy(e, p.x, p.y);
    for (const s of g.progression.spells.values()) s.draw(ctx);
    this.drawPlayer(g);
    this.drawBeams(g);
    for (const pr of g.projectiles) if (visible(pr.x, pr.y, (pr.halfWidth ?? pr.r) + 10)) this.drawProjectile(pr);
    for (const f of g.fx) if (f.kind !== 'mark') this.drawFx(f);
    this.drawBossBars(g);

    // Screen space overlays.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawVignette(g);
    this.drawStick(input);
  }

  // ---- world ---------------------------------------------------------------

  private drawGround(left: number, top: number, vw: number, vh: number) {
    const { ctx } = this;
    const cell = 140;
    const x0 = Math.floor(left / cell);
    const y0 = Math.floor(top / cell);
    const x1 = Math.floor((left + vw) / cell);
    const y1 = Math.floor((top + vh) / cell);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const h = hash2(cx, cy);
        const px = cx * cell + hash2(cx + 91, cy) * cell;
        const py = cy * cell + hash2(cx, cy + 57) * cell;
        if (h < 0.45) {
          // Dark patch.
          ctx.fillStyle = GROUND_DARK;
          ctx.beginPath();
          ctx.ellipse(px, py, 18 + h * 60, 10 + h * 30, h * 6, 0, TAU);
          ctx.fill();
        } else if (h < 0.75) {
          // Pebbles.
          ctx.fillStyle = GROUND_LIGHT;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(px + hash2(cx + i, cy - i) * 30, py + hash2(cx - i, cy + i) * 30, 1.5 + i, 0, TAU);
            ctx.fill();
          }
        } else if (h < 0.9) {
          // Crack.
          ctx.strokeStyle = GROUND_DARK;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + 18, py + 9 - h * 20);
          ctx.lineTo(px + 34, py + 4);
          ctx.stroke();
        }
      }
    }
  }

  private drawEnemy(e: Enemy, px: number, py: number) {
    const { ctx } = this;
    const frozen = e.frozen > 0;
    const squash = frozen ? 0 : Math.sin(e.wobble * 7) * 0.06;
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : frozen ? '#5b87a8' : INK;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, e.r * (1 + squash), e.r * (1 - squash), 0, 0, TAU);
    ctx.fill();

    if (e.kind !== 'normal') {
      ctx.strokeStyle = e.kind === 'boss' ? '#ff4a4a' : '#c58cff';
      ctx.lineWidth = e.kind === 'boss' ? 3 : 2;
      ctx.stroke();
    }
    if (e.flash > 0) return;

    // Eyes look at the player.
    const d = Math.hypot(px - e.x, py - e.y) || 1;
    const ex = ((px - e.x) / d) * e.r * 0.3;
    const ey = ((py - e.y) / d) * e.r * 0.3;
    const nx = -ey * 0.9;
    const ny = ex * 0.9;
    const eye = Math.max(1.4, e.r * 0.14);
    ctx.fillStyle = e.kind === 'boss' ? '#ff6b6b' : '#e8ecef';
    ctx.beginPath();
    ctx.arc(e.x + ex + nx, e.y + ey + ny, eye, 0, TAU);
    ctx.arc(e.x + ex - nx, e.y + ey - ny, eye, 0, TAU);
    ctx.fill();
  }

  private drawPlayer(g: Game) {
    const { ctx } = this;
    const p = g.player;
    const blink = p.invuln > 0 && !p.cloaked && Math.floor(g.time * 20) % 2 === 0;
    ctx.globalAlpha = p.cloaked ? 0.35 : blink ? 0.5 : 1;

    // Shadow, cloak, hood.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.r * 0.9, p.r, p.r * 0.4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.strokeStyle = '#e8ecef';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - p.r * 1.25);
    ctx.quadraticCurveTo(p.x + p.r * 1.3, p.y, p.x + p.r * 0.95, p.y + p.r);
    ctx.lineTo(p.x - p.r * 0.95, p.y + p.r);
    ctx.quadraticCurveTo(p.x - p.r * 1.3, p.y, p.x, p.y - p.r * 1.25);
    ctx.fill();
    ctx.stroke();

    // Staff with a glowing tip, on the side the player faces.
    const side = p.mvx >= 0 ? 1 : -1;
    const sx = p.x + side * p.r * 1.25;
    ctx.beginPath();
    ctx.moveTo(sx, p.y + p.r);
    ctx.lineTo(sx, p.y - p.r * 1.3);
    ctx.stroke();
    ctx.fillStyle = '#9fd0ff';
    ctx.beginPath();
    ctx.arc(sx, p.y - p.r * 1.5, 3, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // HP bar.
    const bw = 34;
    const frac = clamp(p.hp / p.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(p.x - bw / 2, p.y + p.r + 8, bw, 4);
    ctx.fillStyle = frac > 0.3 ? '#e2504c' : '#ff2a2a';
    ctx.fillRect(p.x - bw / 2, p.y + p.r + 8, bw * frac, 4);
  }

  private drawPickup(it: Pickup, time: number) {
    const { ctx } = this;
    const bob = Math.sin(time * 4 + it.x) * 1.5;
    const y = it.y + bob;
    if (it.kind === 'mana') {
      const s = it.value >= 40 ? 8 : it.value >= 8 ? 6 : 4.5;
      ctx.fillStyle = it.value >= 40 ? '#ffd76a' : it.value >= 8 ? '#7df9ff' : '#7db6ff';
      ctx.beginPath();
      ctx.moveTo(it.x, y - s);
      ctx.lineTo(it.x + s * 0.75, y);
      ctx.lineTo(it.x, y + s);
      ctx.lineTo(it.x - s * 0.75, y);
      ctx.fill();
    } else if (it.kind === 'life') {
      ctx.fillStyle = '#7dff9a';
      ctx.fillRect(it.x - 2, y - 6, 4, 12);
      ctx.fillRect(it.x - 6, y - 2, 12, 4);
    } else if (it.kind === 'chest') {
      ctx.fillStyle = '#ffd76a';
      ctx.globalAlpha = 0.25 + Math.sin(time * 5) * 0.1;
      ctx.beginPath();
      ctx.arc(it.x, y, 20, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#8a5a22';
      ctx.fillRect(it.x - 10, y - 7, 20, 14);
      ctx.fillStyle = '#ffd76a';
      ctx.fillRect(it.x - 10, y - 2, 20, 3);
      ctx.fillRect(it.x - 2, y - 4, 4, 7);
    } else {
      ctx.strokeStyle = '#ff8af0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(it.x, y, 6, Math.PI, 0);
      ctx.stroke();
    }
  }

  private drawProjectile(p: Projectile) {
    const { ctx } = this;
    const sp = Math.hypot(p.vx, p.vy) || 1;
    const dx = p.vx / sp;
    const dy = p.vy / sp;
    ctx.fillStyle = ctx.strokeStyle = p.color;

    switch (p.style) {
      case 'bolt':
      case 'spark':
      case 'shard': {
        const len = p.style === 'spark' ? 8 : 16;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = p.r * 2.4;
        ctx.beginPath();
        ctx.moveTo(p.x - dx * len, p.y - dy * len);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = p.r;
        ctx.beginPath();
        ctx.moveTo(p.x - dx * len * 0.6, p.y - dy * len * 0.6);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.lineCap = 'butt';
        break;
      }
      case 'flame':
        ctx.globalAlpha = clamp(p.life * 2.2, 0, 0.75);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1.6 - p.life), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      case 'wave': {
        const hw = p.halfWidth ?? 60;
        ctx.lineCap = 'round';
        for (const [off, alpha, width] of [[-14, 0.25, 16], [0, 0.85, 7]] as const) {
          ctx.globalAlpha = alpha;
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(p.x + dx * off - dy * hw, p.y + dy * off + dx * hw);
          ctx.quadraticCurveTo(p.x + dx * (off + 26), p.y + dy * (off + 26),
                               p.x + dx * off + dy * hw, p.y + dy * off - dx * hw);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.lineCap = 'butt';
        break;
      }
      default:
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 1.7, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.45, 0, TAU);
        ctx.fill();
    }
  }

  private drawZone(z: Zone, time: number) {
    const { ctx } = this;
    const fade = clamp(z.life * 3, 0, 1) * clamp((z.maxLife - z.life) * 6, 0.3, 1);
    ctx.fillStyle = ctx.strokeStyle = z.color;
    if (z.style === 'tornado') {
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = fade * (0.7 - i * 0.18);
        const r = z.r * (1 - i * 0.28);
        const a = time * (9 - i * 2) + i * 2;
        ctx.beginPath();
        ctx.arc(z.x, z.y, r, a, a + Math.PI * 1.3);
        ctx.stroke();
      }
    } else {
      ctx.globalAlpha = fade * (z.style === 'field' ? 0.16 : 0.26);
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = fade * 0.7;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (z.style === 'pool') {
        // A few bubbles so pools read as liquid.
        ctx.globalAlpha = fade * 0.5;
        for (let i = 0; i < 4; i++) {
          const a = i * 1.7 + time * 0.6;
          const d = z.r * (0.25 + 0.15 * i);
          ctx.beginPath();
          ctx.arc(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, 3 + ((time * 3 + i) % 3), 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawBeams(g: Game) {
    const { ctx } = this;
    ctx.lineCap = 'round';
    for (const b of g.beams) {
      const fade = clamp(b.life * 5, 0, 1);
      const ex = b.x + Math.cos(b.angle) * b.len;
      const ey = b.y + Math.sin(b.angle) * b.len;
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = 0.3 * fade;
      ctx.lineWidth = b.width * 2.2;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.globalAlpha = 0.9 * fade;
      ctx.lineWidth = b.width * 0.6;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  }

  private drawFx(f: Fx) {
    const { ctx } = this;
    const t = clamp(f.life / f.maxLife, 0, 1);
    ctx.fillStyle = ctx.strokeStyle = f.color;
    switch (f.kind) {
      case 'ring':
        ctx.globalAlpha = t;
        ctx.lineWidth = 1 + 4 * t;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1 - t * 0.35), 0, TAU);
        ctx.stroke();
        break;
      case 'burst':
        ctx.globalAlpha = t * 0.55;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1.1 - t * 0.5), 0, TAU);
        ctx.fill();
        break;
      case 'mark':
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1 - t), 0, TAU);
        ctx.fill();
        break;
      case 'lightning': {
        const pts = f.pts!;
        ctx.lineJoin = 'round';
        for (const [alpha, width, color] of [[0.35, f.r * 3, f.color], [1, f.r, '#ffffff']] as const) {
          ctx.globalAlpha = alpha * t;
          ctx.lineWidth = width;
          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.moveTo(pts[0], pts[1]);
          for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
          ctx.stroke();
        }
        break;
      }
      case 'text':
        ctx.globalAlpha = clamp(t * 2, 0, 1);
        ctx.font = `700 ${f.r}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(f.text!, f.x, f.y);
        ctx.fillText(f.text!, f.x, f.y);
        break;
    }
    ctx.globalAlpha = 1;
  }

  private drawBossBars(g: Game) {
    const { ctx } = this;
    for (const e of g.enemies) {
      if (e.kind === 'normal' || e.dead) continue;
      const bw = e.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - bw / 2, e.y - e.r - 10, bw, 4);
      ctx.fillStyle = e.kind === 'boss' ? '#ff4a4a' : '#c58cff';
      ctx.fillRect(e.x - bw / 2, e.y - e.r - 10, bw * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
  }

  // ---- screen --------------------------------------------------------------

  private drawVignette(g: Game) {
    const { ctx, w, h } = this;
    const p = g.player;
    const low = 1 - clamp(p.hp / p.maxHp / 0.35, 0, 1);
    const alpha = Math.max(low * 0.35, p.hurt > 0 ? 0.35 : 0);
    if (alpha <= 0.01) return;
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    grad.addColorStop(0, 'rgba(255,0,0,0)');
    grad.addColorStop(1, `rgba(255,30,30,${alpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  private drawStick(input: Input) {
    const s = input.stick;
    if (!s.active) return;
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, input.stickRadius, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 22, 0, TAU);
    ctx.fill();
  }
}
