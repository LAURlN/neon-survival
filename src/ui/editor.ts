/**
 * The circuit editor: a full-screen view of the board with the spare tiles in
 * a tray underneath. The game is paused while it is open, but the board keeps
 * ticking silently so the player can watch sparks run through what they build.
 *
 *   tray tile, then empty cell   place
 *   placed tile                  select; tap again to turn it
 *   drag / pinch / wheel         pan and zoom (the board has no edges)
 *   right-click, Remove button   back into the tray
 */
import { Board, DIRS, type Tile } from '../circuit/board';
import { ELEMENT_COLOR, type Spark } from '../circuit/spark';
import { CAT_LABEL, RARITY, TILE_LIST, type TileCat, type TileDef } from '../data/tiles';
import { MODE_INFO } from '../data/weapons';
import type { Sfx } from '../engine/audio';
import { TAU, clamp } from '../engine/math';

const CAT_COLOR: Record<TileCat, string> = {
  source: '#ffe93c', route: '#e6f1ff', boost: '#ff9a3c', logic: '#b48cff', element: '#ff7a3c', shape: '#ff2bd6',
  mode: '#3dffea', emit: '#5ff4ff',
};
const FONT = "ui-monospace, 'Cascadia Mono', 'Roboto Mono', Consolas, monospace";

const tileColor = (d: TileDef) =>
  d.cat === 'element' && d.element && d.element !== 'random' ? ELEMENT_COLOR[d.element] : CAT_COLOR[d.cat];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

export class BoardEditor {
  /** UI sound hook. */
  sfx: (name: Sfx) => void = () => {};

  private readonly root = document.getElementById('editor')!;
  private readonly canvas = el('canvas');
  private readonly ctx = this.canvas.getContext('2d')!;
  private readonly info = el('div', 'ed-text');
  private readonly turnBtn = el('button', 'ed-act', '⟳ Turn');
  private readonly removeBtn = el('button', 'ed-act', '✕ Remove');
  private readonly tray = el('div', 'ed-tray');

  private board: Board | null = null;
  private onClose: () => void = () => {};
  /** Centre of the view in board cells, and pixels per cell. */
  private cam = { x: 0, y: 0, s: 58 };
  /** Tray tile waiting to be placed, and the placed tile that is selected. */
  private pick: string | null = null;
  private sel: Tile | null = null;
  private trayVersion = -1;

  private pointers = new Map<number, { x: number; y: number }>();
  private moved = 0;
  private pinch = 0;
  private raf = 0;
  private last = 0;

  constructor() {
    const done = el('button', 'btn primary ed-done', 'DONE');
    done.addEventListener('click', () => this.close());
    const top = el('div', 'ed-top');
    top.append(el('h2', '', 'CIRCUIT'), done);
    const bar = el('div', 'ed-info');
    bar.append(this.info, this.turnBtn, this.removeBtn);
    this.root.append(top, this.canvas, bar, this.tray);

    this.turnBtn.addEventListener('click', () => this.turn());
    this.removeBtn.addEventListener('click', () => this.remove());

    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        // Not every pointer can be captured; panning then simply stops at the canvas edge.
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) this.moved = 0;
      else this.pinch = this.spread();
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (this.pointers.size === 1) {
        this.cam.x -= (e.clientX - p.x) / this.cam.s;
        this.cam.y -= (e.clientY - p.y) / this.cam.s;
        this.moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 2) {
        const d = this.spread();
        this.zoom(d / (this.pinch || d));
        this.pinch = d;
        this.moved = 99;
      }
    });
    const up = (e: PointerEvent) => {
      if (!this.pointers.delete(e.pointerId)) return;
      if (this.pointers.size === 0 && this.moved < 10 && e.type === 'pointerup' && e.button === 0) this.tap(...this.cell(e));
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const [x, y] = this.cell(e);
      this.sel = this.board?.at(x, y) ?? null;
      this.remove();
    });
    // Capture phase, and swallowed: while the editor is open no other key handler should react.
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      e.stopImmediatePropagation();
      if (e.code === 'KeyR') this.turn();
      else if (e.code === 'Delete' || e.code === 'Backspace') this.remove();
      else if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'KeyE') this.close();
    }, true);
    window.addEventListener('resize', () => this.isOpen && this.resize());
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open(board: Board, onClose: () => void) {
    this.board = board;
    this.onClose = onClose;
    this.root.hidden = false;
    this.sel = null;
    this.pick = null;
    this.trayVersion = -1;
    this.pointers.clear();
    const b = board.extent;
    this.cam.x = (b.x0 + b.x1) / 2;
    this.cam.y = (b.y0 + b.y1) / 2;
    this.resize();
    this.refresh();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  close() {
    if (!this.isOpen) return;
    cancelAnimationFrame(this.raf);
    this.root.hidden = true;
    this.board = null;
    this.sfx('ui');
    this.onClose();
  }

  // ---- interaction ---------------------------------------------------------

  private spread() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private zoom(factor: number) {
    this.cam.s = clamp(this.cam.s * factor, 30, 110);
  }

  /** Board cell under a pointer event. */
  private cell(e: MouseEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [Math.round((e.clientX - r.left - r.width / 2) / this.cam.s + this.cam.x),
            Math.round((e.clientY - r.top - r.height / 2) / this.cam.s + this.cam.y)];
  }

  private tap(x: number, y: number) {
    const board = this.board!;
    const t = board.at(x, y);
    if (t) {
      if (this.sel === t) this.turn();
      else {
        this.sel = t;
        this.sfx('ui');
      }
    } else if (this.pick && board.spare(this.pick) > 0) {
      this.sel = board.place(x, y, this.pick);
      this.sfx('select');
    } else this.sel = null;
    this.refresh();
  }

  private turn() {
    if (this.sel && this.board!.turn(this.sel.x, this.sel.y)) this.sfx('ui');
    this.refresh();
  }

  private remove() {
    if (this.sel && this.board!.remove(this.sel.x, this.sel.y)) {
      this.pick = this.sel.def.id;
      this.sfx('ui');
    }
    this.sel = null;
    this.refresh();
  }

  /** Bring the tray, the info line and the buttons in line with the current state. */
  private refresh() {
    const board = this.board!;
    if (this.trayVersion !== board.version) {
      this.trayVersion = board.version;
      this.tray.replaceChildren();
      for (const d of TILE_LIST) {
        const n = board.spare(d.id);
        if (n <= 0) continue;
        const chip = el('button', 'ed-tile');
        chip.dataset.id = d.id;
        chip.style.setProperty('--c', tileColor(d));
        chip.style.setProperty('--r', RARITY[d.rarity].color);
        chip.append(el('b', '', d.glyph), el('span', '', d.name), el('i', '', `×${n}`));
        chip.addEventListener('click', () => {
          this.pick = d.id;
          this.sel = null;
          this.sfx('ui');
          this.refresh();
        });
        this.tray.append(chip);
      }
      if (!this.tray.childElementCount) this.tray.append(el('div', 'ed-empty', 'No spare tiles. Level up or open a data cache to get more.'));
    }
    if (this.pick && board.spare(this.pick) <= 0) this.pick = null;
    for (const chip of this.tray.children) chip.classList.toggle('on', (chip as HTMLElement).dataset.id === this.pick);

    const d = this.sel?.def ?? TILE_LIST.find((t) => t.id === this.pick);
    this.info.replaceChildren();
    if (d) {
      const head = el('b', '', `${d.glyph} ${d.name}`);
      head.style.color = tileColor(d);
      const tag = el('small', '', ` ${RARITY[d.rarity].name} · ${CAT_LABEL[d.cat]}`);
      tag.style.color = RARITY[d.rarity].color;
      this.info.append(head, tag, el('div', '', this.sel ? d.desc : `${d.desc} Tap an empty cell to place it.`));
    } else {
      this.info.append(el('div', '', 'Pick a tile below, then tap a cell. Tap a placed tile to select it, again to turn it. Drag to pan.'));
    }
    this.turnBtn.disabled = !this.sel?.def.turn;
    this.removeBtn.disabled = !this.sel;
  }

  // ---- drawing -------------------------------------------------------------

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
  }

  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.board) return;
    this.board.update(dt, true);
    this.draw(dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Advance and redraw once; lets tests drive the editor without animation frames. */
  step(dt: number) {
    this.board?.update(dt, true);
    this.draw(dt);
  }

  private draw(dt: number) {
    const board = this.board!;
    const { ctx, cam } = this;
    const dpr = this.canvas.width / (this.canvas.getBoundingClientRect().width || 1);
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    const s = cam.s;
    const sx = (x: number) => (x - cam.x) * s + w / 2;
    const sy = (y: number) => (y - cam.y) * s + h / 2;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#070912';
    ctx.fillRect(0, 0, w, h);

    // Grid lines run between cells.
    ctx.strokeStyle = '#131a2e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(cam.x - w / 2 / s); x <= cam.x + w / 2 / s + 1; x++) {
      ctx.moveTo(sx(x - 0.5), 0);
      ctx.lineTo(sx(x - 0.5), h);
    }
    for (let y = Math.floor(cam.y - h / 2 / s); y <= cam.y + h / 2 / s + 1; y++) {
      ctx.moveTo(0, sy(y - 0.5));
      ctx.lineTo(w, sy(y - 0.5));
    }
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of board.tiles.values()) {
      t.flash = Math.max(0, t.flash - dt * 4);
      this.drawTile(t, sx(t.x), sy(t.y), s, board);
    }

    ctx.globalCompositeOperation = 'lighter';
    const k = board.frac;
    for (const sp of board.sparks) this.drawSpark(sp, sx(sp.px + (sp.x - sp.px) * k), sy(sp.py + (sp.y - sp.py) * k), s);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  private drawTile(t: Tile, cx: number, cy: number, s: number, board: Board) {
    const { ctx } = this;
    const d = t.def;
    const color = tileColor(d);
    const half = s / 2 - 3;
    const resting = d.op === 'boost' && board.tick < t.ready;

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0c1020';
    ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
    ctx.globalAlpha = 0.1 + t.flash * 0.3;
    ctx.fillStyle = color;
    ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
    ctx.globalAlpha = resting ? 0.4 : 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = d.cat === 'emit' ? 3 : 1.5;
    ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);

    // Special tiles carry a corner flag in their rarity colour.
    if (d.rarity >= 2) {
      ctx.fillStyle = RARITY[d.rarity].color;
      ctx.beginPath();
      ctx.moveTo(cx + half, cy - half);
      ctx.lineTo(cx + half - s * 0.24, cy - half);
      ctx.lineTo(cx + half, cy - half + s * 0.24);
      ctx.fill();
    }

    ctx.fillStyle = ctx.strokeStyle = color;
    if (d.op === 'mirror') {
      const m = s * 0.26;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - m, cy + (t.rot ? -m : m));
      ctx.lineTo(cx + m, cy + (t.rot ? m : -m));
      ctx.stroke();
    } else {
      ctx.font = `700 ${Math.round(s * 0.36)}px ${FONT}`;
      ctx.fillText(d.glyph, cx, cy - s * 0.07);
    }

    if (s >= 44) {
      const sub = d.op === 'bank' ? `${t.store.length}/${d.n}` : d.op === 'emit' && t.label ? t.label : d.name;
      ctx.font = `${Math.max(7, Math.round(s * 0.135))}px ${FONT}`;
      ctx.fillStyle = d.op === 'emit' && t.label ? '#ffffff' : '#8291b5';
      ctx.fillText(sub, cx, cy + s * 0.3, s - 10);
    }

    if (d.turn === 'dir') {
      const [dx, dy] = DIRS[t.rot];
      ctx.save();
      ctx.translate(cx + dx * (half + 1), cy + dy * (half + 1));
      ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(s * 0.12, 0);
      ctx.lineTo(-s * 0.05, s * 0.12);
      ctx.lineTo(-s * 0.05, -s * 0.12);
      ctx.fill();
      ctx.restore();
    }

    if (t === this.sel) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - half - 3, cy - half - 3, half * 2 + 6, half * 2 + 6);
    }
    ctx.globalAlpha = 1;
  }

  /** A spark is drawn as its shape, in its element's colour, sized by its energy. */
  private drawSpark(sp: Spark, x: number, y: number, s: number) {
    const { ctx } = this;
    const r = (3 + Math.sqrt(sp.energy) * 0.9) * (s / 58);
    const color = ELEMENT_COLOR[sp.element];
    ctx.fillStyle = ctx.strokeStyle = color;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(sp.dy, sp.dx));
    ctx.beginPath();
    if (sp.shape === 'bomb') ctx.arc(0, 0, r, 0, TAU);
    else if (sp.shape === 'beam') ctx.rect(-r * 1.6, -r * 0.35, r * 3.2, r * 0.7);
    else if (sp.shape === 'seeker') {
      ctx.moveTo(r * 1.3, 0);
      ctx.lineTo(-r, r);
      ctx.lineTo(-r, -r);
    } else {
      ctx.moveTo(r * 1.4, 0);
      ctx.lineTo(-r, r * 0.9);
      ctx.lineTo(-r * 0.3, 0);
      ctx.lineTo(-r, -r * 0.9);
    }
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(8, Math.round(s * 0.17))}px ${FONT}`;
    const tag = (sp.mode === 'aim' ? '' : MODE_INFO[sp.mode].glyph + ' ') + Math.round(sp.energy) + (sp.count > 1 ? `×${sp.count}` : '');
    ctx.fillText(tag, x, y - r - s * 0.16);
  }
}
