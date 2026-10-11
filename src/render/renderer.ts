/**
 * Canvas renderer - neon / cyberpunk look, drawn entirely in code.
 *
 * Glow is done with cached radial-gradient sprites blended additively
 * ("lighter"), which is far cheaper on phones than canvas shadowBlur.
 */
import type { Input } from '../engine/input';
import { TAU, clamp, hash2 } from '../engine/math';
import type { Game } from '../game/game';
import type { Enemy, Fx, Pickup, Projectile, Zone } from '../game/types';

const BG = '#06070e';
const BODY = '#0b0d18';
const CYAN = '#5ff4ff';
const MAGENTA = '#ff2bd6';
const FONT = "ui-monospace, 'Cascadia Mono', 'Roboto Mono', Menlo, Consolas, monospace";

/** Unit polygons for enemy bodies, pointing along +x. */
const SHAPES: number[][] = [
  [1, 0, -0.7, 0.85, -0.35, 0, -0.7, -0.85], // dart
  [1, 0, 0, 1, -1, 0, 0, -1], // diamond
  [1, 0, 0.5, 0.87, -0.5, 0.87, -1, 0, -0.5, -0.87, 0.5, -0.87], // hexagon
  [0.9, 0.55, 0.2, 0.95, -0.9, 0.6, -0.9, -0.6, 0.2, -0.95, 0.9, -0.55], // slab
  [1, 0, 0.3, 0.45, 0.3, 1, -0.8, 0.7, -0.5, 0, -0.8, -0.7, 0.3, -1, 0.3, -0.45], // crab
];

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  zoom = 1;

  private glowCache = new Map<string, HTMLCanvasElement>();
  /** Recent player positions for the motion trail. */
  private trail: number[] = [];

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

  /** Soft radial glow sprite for a colour, created once. */
  private glowSprite(color: string): HTMLCanvasElement {
    let c = this.glowCache.get(color);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, color);
      grad.addColorStop(0.25, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.9;
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      // Fade the mid-tones so the falloff reads as light, not a disc.
      g.globalCompositeOperation = 'destination-in';
      const fall = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      fall.addColorStop(0, 'rgba(0,0,0,1)');
      fall.addColorStop(0.3, 'rgba(0,0,0,0.45)');
      fall.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = fall;
      g.fillRect(0, 0, 64, 64);
      this.glowCache.set(color, c);
    }
    return c;
  }

  private glow(x: number, y: number, r: number, color: string, alpha = 1) {
    if (alpha <= 0.01) return;
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.glowSprite(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  draw(g: Game, input: Input) {
    const { ctx, w, h, zoom } = this;
    const p = g.player;
    g.viewW = w / zoom;
    g.viewH = h / zoom;
    g.viewR = Math.hypot(g.viewW, g.viewH) / 2;

    const camX = p.x + (g.shake ? (Math.random() - 0.5) * g.shake : 0);
    const camY = p.y + (g.shake ? (Math.random() - 0.5) * g.shake : 0);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    // World space: origin at the centre of the screen, following the player.
    ctx.setTransform(this.dpr * zoom, 0, 0, this.dpr * zoom, (this.dpr * w) / 2, (this.dpr * h) / 2);
    ctx.translate(-camX, -camY);

    const left = camX - g.viewW / 2;
    const top = camY - g.viewH / 2;
    const visible = (x: number, y: number, r: number) =>
      x + r > left && x - r < left + g.viewW && y + r > top && y - r < top + g.viewH;

    this.drawGround(left, top, g.viewW, g.viewH, g.time);

    // Everything luminous is blended additively.
    ctx.globalCompositeOperation = 'lighter';
    this.glow(p.x, p.y, 300, '#1c4f8a', 0.5); // pool of light around the player
    for (const z of g.zones) if (visible(z.x, z.y, z.r)) this.drawZone(z, g.time);
    for (const f of g.fx) if (f.kind === 'mark') this.drawFx(f);
    for (const it of g.pickups) if (visible(it.x, it.y, 20)) this.drawPickup(it, g.time, p.x, p.y);

    ctx.globalCompositeOperation = 'source-over';
    for (const e of g.enemies) if (visible(e.x, e.y, e.r + 14)) this.drawEnemy(e, p.x, p.y, g.time);
    this.drawBars(g);

    this.drawPlayer(g);

    ctx.globalCompositeOperation = 'lighter';
    this.drawBeams(g);
    for (const pr of g.projectiles) if (visible(pr.x, pr.y, (pr.halfWidth ?? pr.r) + 20)) this.drawProjectile(pr);
    for (const f of g.fx) if (f.kind !== 'mark' && f.kind !== 'text') this.drawFx(f);
    ctx.globalCompositeOperation = 'source-over';
    for (const f of g.fx) if (f.kind === 'text') this.drawFx(f);

    // Screen space overlays.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawVignette(g);
    this.drawStick(input);
  }

  /** Backdrop for the title screen: the street grid drifting by. */
  drawIdle(time: number) {
    const { ctx, w, h, zoom } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    const camX = time * 30;
    const camY = time * 18;
    ctx.setTransform(this.dpr * zoom, 0, 0, this.dpr * zoom, (this.dpr * w) / 2, (this.dpr * h) / 2);
    ctx.translate(-camX, -camY);
    this.drawGround(camX - w / zoom / 2, camY - h / zoom / 2, w / zoom, h / zoom, time);
    ctx.globalCompositeOperation = 'lighter';
    this.glow(camX, camY, 320, '#1c4f8a', 0.6);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- world ---------------------------------------------------------------

  /** Neon street grid with scattered floor markings. */
  private drawGround(left: number, top: number, vw: number, vh: number, time: number) {
    const { ctx } = this;
    const minor = 60;
    const right = left + vw;
    const bottom = top + vh;

    // Minor and major grid lines, batched into two paths.
    for (const [every, color, width] of [[minor, 'rgba(60,110,190,0.10)', 1], [minor * 4, 'rgba(80,170,255,0.20)', 1.5]] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let x = Math.floor(left / every) * every; x < right; x += every) {
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
      }
      for (let y = Math.floor(top / every) * every; y < bottom; y += every) {
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
      }
      ctx.stroke();
    }

    // Floor markings, deterministic per cell.
    const cell = minor * 4;
    for (let cy = Math.floor(top / cell); cy * cell < bottom; cy++) {
      for (let cx = Math.floor(left / cell); cx * cell < right; cx++) {
        const hsh = hash2(cx, cy);
        const x = cx * cell;
        const y = cy * cell;
        // Glowing intersection node, gently pulsing.
        const pulse = 0.35 + 0.25 * Math.sin(time * 1.5 + hsh * 20);
        ctx.fillStyle = hsh < 0.5 ? `rgba(95,244,255,${pulse})` : `rgba(255,43,214,${pulse * 0.8})`;
        ctx.fillRect(x - 2, y - 2, 4, 4);

        if (hsh < 0.3) {
          // Circuit trace.
          const ox = x + minor * (1 + Math.floor(hsh * 10) % 2);
          const oy = y + minor;
          ctx.strokeStyle = 'rgba(95,244,255,0.16)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(ox + minor, oy);
          ctx.lineTo(ox + minor * 1.5, oy + minor * 0.5);
          ctx.lineTo(ox + minor * 1.5, oy + minor * 1.5);
          ctx.stroke();
          ctx.fillStyle = 'rgba(95,244,255,0.3)';
          ctx.fillRect(ox - 3, oy - 3, 6, 6);
          ctx.fillRect(ox + minor * 1.5 - 3, oy + minor * 1.5 - 3, 6, 6);
        } else if (hsh < 0.5) {
          // Marked tile.
          ctx.strokeStyle = 'rgba(255,43,214,0.16)';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + minor * 2 + 6, y + minor + 6, minor - 12, minor - 12);
          ctx.fillStyle = 'rgba(255,43,214,0.04)';
          ctx.fillRect(x + minor * 2 + 6, y + minor + 6, minor - 12, minor - 12);
        } else if (hsh < 0.62) {
          // Hazard stripes.
          ctx.strokeStyle = 'rgba(255,210,60,0.13)';
          ctx.lineWidth = 5;
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            ctx.moveTo(x + minor + i * 16, y + minor * 3);
            ctx.lineTo(x + minor + i * 16 + 14, y + minor * 3 - 14);
          }
          ctx.stroke();
        }
      }
    }
  }

  private drawEnemy(e: Enemy, px: number, py: number, time: number) {
    const { ctx } = this;
    const frozen = e.frozen > 0;
    const color = frozen ? '#9ae8ff' : e.color;
    const angle = Math.atan2(py - e.y, px - e.x);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const pulse = frozen ? 1 : 1 + Math.sin(e.wobble * 7) * 0.05;
    const r = e.r * pulse;

    // Under-glow.
    ctx.globalCompositeOperation = 'lighter';
    this.glow(e.x, e.y, r * 2.1, color, e.kind === 'normal' ? 0.28 : 0.45);
    ctx.globalCompositeOperation = 'source-over';

    const pts = SHAPES[e.shape];
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      const x = e.x + (pts[i] * cos - pts[i + 1] * sin) * r;
      const y = e.y + (pts[i] * sin + pts[i + 1] * cos) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    // Small hostiles flash solid white when hit; big ones only brighten, or they would strobe.
    const flash = e.flash > 0;
    ctx.fillStyle = flash ? (e.kind === 'normal' ? '#ffffff' : '#3a2140') : frozen ? '#12303f' : BODY;
    ctx.fill();
    ctx.strokeStyle = flash ? '#ffffff' : color;
    ctx.lineWidth = e.kind === 'boss' ? 3.5 : e.kind === 'elite' ? 2.8 : 1.8;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Sensor "eye" towards the player.
    if (!flash || e.kind !== 'normal') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(e.x + cos * r * 0.3, e.y + sin * r * 0.3, Math.max(1.6, r * 0.2), 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(e.x + cos * r * 0.3, e.y + sin * r * 0.3, Math.max(0.8, r * 0.08), 0, TAU);
      ctx.fill();
    }

    // Elites and bosses carry a rotating targeting ring.
    if (e.kind !== 'normal') {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.7;
      ctx.setLineDash([r * 0.5, r * 0.35]);
      ctx.lineDashOffset = time * 30;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 1.35, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  private drawPlayer(g: Game) {
    const { ctx } = this;
    const p = g.player;
    const blink = p.invuln > 0 && !p.cloaked && Math.floor(g.time * 20) % 2 === 0;
    const alpha = p.cloaked ? 0.35 : blink ? 0.5 : 1;

    // Motion trail.
    const tr = this.trail;
    // A new run teleports the player; do not draw a streak across the map.
    if (tr.length && Math.hypot(tr[tr.length - 2] - p.x, tr[tr.length - 1] - p.y) > 120) tr.length = 0;
    tr.push(p.x, p.y);
    if (tr.length > 24) tr.splice(0, 2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 2; i < tr.length; i += 2) {
      ctx.strokeStyle = CYAN;
      ctx.globalAlpha = (i / tr.length) * 0.35 * alpha;
      ctx.lineWidth = (i / tr.length) * 7;
      ctx.beginPath();
      ctx.moveTo(tr[i - 2], tr[i - 1]);
      ctx.lineTo(tr[i], tr[i + 1]);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    this.glow(p.x, p.y, 34, CYAN, 0.55 * alpha);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;

    // Hooded runner: dark coat with a neon outline and a visor.
    const r = p.r;
    ctx.fillStyle = BODY;
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r * 1.35);
    ctx.lineTo(p.x + r * 0.95, p.y - r * 0.2);
    ctx.lineTo(p.x + r * 0.8, p.y + r);
    ctx.lineTo(p.x - r * 0.8, p.y + r);
    ctx.lineTo(p.x - r * 0.95, p.y - r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Visor follows the movement direction.
    ctx.strokeStyle = MAGENTA;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    const vx = p.x + p.mvx * r * 0.25;
    const vy = p.y - r * 0.45 + p.mvy * r * 0.15;
    ctx.beginPath();
    ctx.moveTo(vx - r * 0.38, vy);
    ctx.lineTo(vx + r * 0.38, vy);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;

    // HP bar.
    const bw = 36;
    const frac = clamp(p.hp / p.maxHp, 0, 1);
    const by = p.y + r + 9;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(p.x - bw / 2 - 1, by - 1, bw + 2, 5);
    ctx.fillStyle = frac > 0.5 ? '#3dffb0' : frac > 0.25 ? '#ffd23c' : '#ff2e4d';
    ctx.fillRect(p.x - bw / 2, by, bw * frac, 3);
  }

  private drawPickup(it: Pickup, time: number, px: number, py: number) {
    const { ctx } = this;
    // Resting pickups bob; ones in flight do not, so their path stays clean.
    const y = it.pulled ? it.y : it.y + Math.sin(time * 4 + it.x) * 1.5;
    if (it.kind === 'mana') {
      const big = it.value >= 40;
      const mid = it.value >= 8;
      // Pop in when dropped.
      const pop = Math.min(1, it.age / 0.18);
      const s = (big ? 6.5 : mid ? 5 : 3.6) * (pop < 1 ? pop * (2 - pop) * 1.15 : 1);
      const color = big ? '#ffd23c' : mid ? '#3dffea' : '#4da3ff';
      if (it.pulled && it.speed > 60) {
        // Streak behind a shard that is flying in.
        const d = Math.hypot(px - it.x, py - y) || 1;
        const len = Math.min(26, it.speed * 0.035);
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = s * 0.9;
        ctx.beginPath();
        ctx.moveTo(it.x, y);
        ctx.lineTo(it.x - ((px - it.x) / d) * len, y - ((py - y) / d) * len);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineCap = 'butt';
      }
      this.glow(it.x, y, s * 3.2, color, 0.6);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(it.x, y - s);
      ctx.lineTo(it.x + s * 0.7, y);
      ctx.lineTo(it.x, y + s);
      ctx.lineTo(it.x - s * 0.7, y);
      ctx.fill();
    } else if (it.kind === 'life') {
      this.glow(it.x, y, 20, '#3dffb0', 0.7);
      ctx.fillStyle = '#3dffb0';
      ctx.fillRect(it.x - 2, y - 7, 4, 14);
      ctx.fillRect(it.x - 7, y - 2, 14, 4);
    } else if (it.kind === 'chest') {
      this.glow(it.x, y, 38 + Math.sin(time * 5) * 5, '#ffd23c', 0.75);
      ctx.strokeStyle = '#ffd23c';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(it.x - 10, y - 8, 20, 16);
      ctx.strokeStyle = MAGENTA;
      ctx.beginPath();
      ctx.moveTo(it.x - 10, y - 1);
      ctx.lineTo(it.x + 10, y - 1);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(it.x - 2, y - 3, 4, 5);
    } else {
      this.glow(it.x, y, 22, MAGENTA, 0.7);
      ctx.strokeStyle = MAGENTA;
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
        const len = p.style === 'spark' ? 10 : 22;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = p.r * 2.2;
        ctx.beginPath();
        ctx.moveTo(p.x - dx * len, p.y - dy * len);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.5, p.r * 0.6);
        ctx.beginPath();
        ctx.moveTo(p.x - dx * len * 0.5, p.y - dy * len * 0.5);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.lineCap = 'butt';
        this.glow(p.x, p.y, p.r * 3.5, p.color, 0.8);
        break;
      }
      case 'flame':
        this.glow(p.x, p.y, p.r * (3.4 - p.life * 2.5), p.color, clamp(p.life * 2.4, 0, 0.8));
        this.glow(p.x, p.y, p.r * 1.2, '#fff2c0', clamp(p.life * 2, 0, 0.6));
        break;
      case 'wave': {
        const hw = p.halfWidth ?? 60;
        ctx.lineCap = 'round';
        for (const [off, alpha, width, color] of [[-22, 0.12, 22, p.color], [-10, 0.3, 12, p.color], [0, 0.95, 4, '#ffffff']] as const) {
          ctx.globalAlpha = alpha;
          ctx.lineWidth = width;
          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.moveTo(p.x + dx * off - dy * hw, p.y + dy * off + dx * hw);
          ctx.quadraticCurveTo(p.x + dx * (off + 30), p.y + dy * (off + 30),
                               p.x + dx * off + dy * hw, p.y + dy * off - dx * hw);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.lineCap = 'butt';
        break;
      }
      default:
        this.glow(p.x, p.y, p.r * 3.2, p.color, 0.9);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.55, 0, TAU);
        ctx.fill();
    }
  }

  private drawZone(z: Zone, time: number) {
    const { ctx } = this;
    const fade = clamp(z.life * 3, 0, 1) * clamp((z.maxLife - z.life) * 6, 0.3, 1);
    ctx.strokeStyle = z.color;
    if (z.style === 'tornado') {
      this.glow(z.x, z.y, z.r * 1.3, z.color, fade * 0.3);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = fade * (0.9 - i * 0.18);
        const r = z.r * (1 - i * 0.22);
        const a = time * (10 - i * 2) * (i % 2 ? -1 : 1) + i * 2;
        ctx.beginPath();
        ctx.arc(z.x, z.y, r, a, a + Math.PI * 1.2);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    } else {
      this.glow(z.x, z.y, z.r * 1.25, z.color, fade * (z.style === 'field' ? 0.25 : 0.42));
      ctx.globalAlpha = fade * 0.9;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, TAU);
      ctx.stroke();
      // Inner rotating dashes sell it as an active hazard.
      ctx.globalAlpha = fade * 0.55;
      ctx.setLineDash([z.r * 0.3, z.r * 0.22]);
      ctx.lineDashOffset = time * 40;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r * 0.72, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }

  private drawBeams(g: Game) {
    const { ctx } = this;
    ctx.lineCap = 'round';
    for (const b of g.beams) {
      const fade = clamp(b.life * 5, 0, 1);
      const flicker = 0.85 + Math.random() * 0.15;
      const ex = b.x + Math.cos(b.angle) * b.len;
      const ey = b.y + Math.sin(b.angle) * b.len;
      for (const [alpha, width, color] of [[0.18, b.width * 3.4, b.color], [0.5, b.width * 1.5, b.color], [1, b.width * 0.45, '#ffffff']] as const) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha * fade * flicker;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
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
        ctx.lineWidth = 1 + 5 * t;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1 - t * 0.4), 0, TAU);
        ctx.stroke();
        break;
      case 'burst':
        this.glow(f.x, f.y, f.r * (1.9 - t * 0.7), f.color, t * 0.9);
        this.glow(f.x, f.y, f.r * 0.7 * t, '#ffffff', t * 0.8);
        break;
      case 'spark': {
        ctx.globalAlpha = t;
        ctx.lineWidth = f.r;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x - f.vx! * 0.035, f.y - f.vy! * 0.035);
        ctx.stroke();
        ctx.lineCap = 'butt';
        break;
      }
      case 'mark':
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        // Crosshair that closes in as the strike lands.
        ctx.beginPath();
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          ctx.moveTo(f.x + ax * f.r * (0.3 + t * 0.7), f.y + ay * f.r * (0.3 + t * 0.7));
          ctx.lineTo(f.x + ax * f.r * t * 0.6, f.y + ay * f.r * t * 0.6);
        }
        ctx.stroke();
        this.glow(f.x, f.y, f.r * (1 - t) * 1.2, f.color, 0.35);
        break;
      case 'lightning': {
        const pts = f.pts!;
        ctx.lineJoin = 'round';
        for (const [alpha, width, color] of [[0.3, f.r * 4, f.color], [0.6, f.r * 1.8, f.color], [1, f.r * 0.7, '#ffffff']] as const) {
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
        ctx.font = `700 ${f.r}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(f.text!, f.x, f.y);
        ctx.fillText(f.text!, f.x, f.y);
        break;
    }
    ctx.globalAlpha = 1;
  }

  /** HP bars for elites and bosses. */
  private drawBars(g: Game) {
    const { ctx } = this;
    for (const e of g.enemies) {
      if (e.kind === 'normal' || e.dead) continue;
      const bw = e.r * 2;
      const y = e.y - e.r * 1.35 - 9;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(e.x - bw / 2 - 1, y - 1, bw + 2, 5);
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x - bw / 2, y, bw * clamp(e.hp / e.maxHp, 0, 1), 3);
    }
  }

  // ---- screen --------------------------------------------------------------

  private drawVignette(g: Game) {
    const { ctx, w, h } = this;
    const p = g.player;
    const low = 1 - clamp(p.hp / p.maxHp / 0.35, 0, 1);
    const alpha = Math.max(low * 0.4 * (0.75 + 0.25 * Math.sin(g.time * 6)), p.hurt > 0 ? 0.45 : 0);
    if (alpha <= 0.01) return;
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
    grad.addColorStop(0, 'rgba(255,0,60,0)');
    grad.addColorStop(1, `rgba(255,20,70,${alpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  private drawStick(input: Input) {
    const s = input.stick;
    if (!s.active) return;
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(95,244,255,0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, input.stickRadius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(95,244,255,0.25)';
    ctx.strokeStyle = 'rgba(95,244,255,0.9)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 20, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}
