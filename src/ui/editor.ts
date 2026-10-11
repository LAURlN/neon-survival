/**
 * The circuit editor: a full-screen view of the board with the spare tiles in
 * a tray underneath. The game and the real circuit are frozen while it is open.
 * What moves on screen is a demo copy of the layout, so the player can watch
 * sparks run through what they build without charging anything up for free.
 *
 *   tray tile, then empty cell   place
 *   placed tile                  select; tap again to turn it
 *   drag / pinch / wheel         pan and zoom (the board has no edges)
 *   right-click, Remove button   back into the tray
 *   Select, then drag            mark an area to cut, copy or delete; Paste puts it back
 *   Loadouts                     save the whole layout under a name, load it in any run
 *
 * Copying never creates tiles: pasting and loading place only what the tray holds.
 */
import { Board, DIRS, type Tile, type TileSpot } from '../circuit/board';
import { ELEMENT_COLOR, type Spark } from '../circuit/spark';
import { CAT_LABEL, RARITY, TILE_LIST, type TileCat, type TileDef } from '../data/tiles';
import { MODE_INFO } from '../data/weapons';
import type { Sfx } from '../engine/audio';
import { TAU, clamp } from '../engine/math';

const CAT_COLOR: Record<TileCat, string> = {
  source: '#ffe93c', route: '#e6f1ff', boost: '#ff9a3c', tune: '#7dd3ff', logic: '#b48cff', element: '#ff7a3c', shape: '#ff2bd6',
  mode: '#3dffea', emit: '#5ff4ff',
};
const LOADOUT_KEY = 'neon-survival:loadouts';

interface Loadout {
  name: string;
  tiles: TileSpot[];
}

/** An inclusive rectangle of board cells. */
interface Area {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function readLoadouts(): Loadout[] {
  try {
    const list = JSON.parse(localStorage.getItem(LOADOUT_KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeLoadouts(list: Loadout[]) {
  try {
    localStorage.setItem(LOADOUT_KEY, JSON.stringify(list));
  } catch {
    // Private browsing: loadouts just don't persist.
  }
}

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
  private readonly tools = el('div', 'ed-tools');
  private readonly panel = el('div', 'ed-panel');
  private readonly toolBtn: Record<string, HTMLButtonElement> = {};

  private board: Board | null = null;
  /** Copy of the layout that runs while the editor is open; never fires and is thrown away on close. */
  private demo = new Board();
  private demoVersion = -1;
  private demoT = 0;
  private onClose: () => void = () => {};
  /** Centre of the view in board cells, and pixels per cell. */
  private cam = { x: 0, y: 0, s: 58 };
  /** Tray tile waiting to be placed, and the placed tile that is selected. */
  private pick: string | null = null;
  private sel: Tile | null = null;
  private trayVersion = -1;
  /** 'edit' places and turns tiles, 'select' drags out an area, 'paste' waits for a cell to paste at. */
  private mode: 'edit' | 'select' | 'paste' = 'edit';
  private area: Area | null = null;
  private dragFrom: [number, number] | null = null;
  /** Copied tiles, relative to the top-left corner of the area they came from. */
  private clip: TileSpot[] = [];
  /** Cell under the mouse, for the paste preview. */
  private hover: [number, number] | null = null;
  /** One-off message shown in the info line until the next action. */
  private note = '';

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
    const tool = (id: string, label: string, run: () => void) => {
      const b = el('button', 'ed-tool', label);
      b.addEventListener('click', run);
      this.toolBtn[id] = b;
      this.tools.append(b);
    };
    tool('select', 'Select', () => this.setMode(this.mode === 'select' ? 'edit' : 'select'));
    tool('cut', 'Cut', () => this.copyArea(true));
    tool('copy', 'Copy', () => this.copyArea(false));
    tool('paste', 'Paste', () => this.setMode(this.mode === 'paste' ? 'edit' : 'paste'));
    tool('delete', 'Delete', () => this.deleteArea());
    tool('loadouts', 'Loadouts', () => this.showLoadouts());
    this.panel.hidden = true;
    this.root.append(top, this.tools, this.canvas, bar, this.tray, this.panel);

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
      if (this.pointers.size === 1) {
        this.moved = 0;
        if (this.mode === 'select' && e.button === 0) {
          this.dragFrom = this.cell(e);
          this.stretch(this.dragFrom);
        }
      } else {
        this.pinch = this.spread();
        this.dragFrom = null;
      }
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) {
        this.hover = this.cell(e);
        return;
      }
      if (this.pointers.size === 1) {
        // In select mode one finger stretches the area; two fingers still pan and zoom.
        if (this.dragFrom) this.stretch(this.cell(e));
        else {
          this.cam.x -= (e.clientX - p.x) / this.cam.s;
          this.cam.y -= (e.clientY - p.y) / this.cam.s;
        }
        this.moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
      }
      if (this.pointers.size === 2) {
        this.cam.x -= (e.clientX - p.x) / this.cam.s / 2;
        this.cam.y -= (e.clientY - p.y) / this.cam.s / 2;
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
      if (this.dragFrom) {
        this.dragFrom = null;
        this.refresh();
      } else if (this.pointers.size === 0 && this.moved < 10 && e.type === 'pointerup' && e.button === 0) {
        if (this.mode === 'paste') this.paste(...this.cell(e));
        else this.tap(...this.cell(e));
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => (this.hover = null));
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
      if (!this.panel.hidden) {
        // Typing a loadout name: only Escape means anything to the editor.
        if (e.code === 'Escape') this.panel.hidden = true;
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.code === 'KeyC') this.copyArea(false);
      else if (ctrl && e.code === 'KeyX') this.copyArea(true);
      else if (ctrl && e.code === 'KeyV') this.setMode('paste');
      else if (e.code === 'KeyS') this.setMode(this.mode === 'select' ? 'edit' : 'select');
      else if (e.code === 'KeyR') this.turn();
      else if (e.code === 'Delete' || e.code === 'Backspace') this.area ? this.deleteArea() : this.remove();
      else if (e.code === 'Escape' && this.mode !== 'edit') this.setMode('edit');
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
    this.mode = 'edit';
    this.area = null;
    this.dragFrom = null;
    this.note = '';
    this.panel.hidden = true;
    this.trayVersion = -1;
    this.demo = new Board();
    this.demoVersion = -1;
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
    this.note = '';
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

  // ---- areas, clipboard, loadouts ---------------------------------------------

  private setMode(mode: 'edit' | 'select' | 'paste') {
    if (mode === 'paste' && this.clip.length === 0) return;
    this.mode = mode;
    this.sel = null;
    this.note = '';
    if (mode !== 'select') this.dragFrom = null;
    if (mode === 'edit') this.area = null;
    this.sfx('ui');
    this.refresh();
  }

  /** Grow the area from where the drag started to `to`. */
  private stretch(to: [number, number]) {
    const from = this.dragFrom ?? to;
    this.area = { x0: Math.min(from[0], to[0]), y0: Math.min(from[1], to[1]),
                  x1: Math.max(from[0], to[0]), y1: Math.max(from[1], to[1]) };
  }

  private inArea(): Tile[] {
    const a = this.area;
    if (!a || !this.board) return [];
    return [...this.board.tiles.values()].filter((t) => t.x >= a.x0 && t.x <= a.x1 && t.y >= a.y0 && t.y <= a.y1);
  }

  /** Copy the tiles in the area to the clipboard; with `cut`, also lift them back into the tray. */
  private copyArea(cut: boolean) {
    const tiles = this.inArea();
    if (tiles.length === 0) return;
    const a = this.area!;
    this.clip = tiles.map((t) => ({ id: t.def.id, x: t.x - a.x0, y: t.y - a.y0, rot: t.rot }));
    if (cut) for (const t of tiles) this.board!.remove(t.x, t.y);
    this.note = `${cut ? 'Cut' : 'Copied'} ${tiles.length} tile${tiles.length > 1 ? 's' : ''}. Press Paste, then tap where the top-left corner goes.`;
    this.sfx('select');
    this.refresh();
  }

  private deleteArea() {
    const tiles = this.inArea();
    if (tiles.length === 0) return;
    for (const t of tiles) this.board!.remove(t.x, t.y);
    this.note = `Moved ${tiles.length} tile${tiles.length > 1 ? 's' : ''} back to the tray.`;
    this.sfx('ui');
    this.refresh();
  }

  /** Put the clipboard down with its top-left corner at (x, y), as far as the tray allows. */
  private paste(x: number, y: number) {
    const placed = this.board!.placeAll(this.clip, x, y);
    const missing = this.clip.length - placed;
    this.note = `Pasted ${placed} of ${this.clip.length} tiles.` +
                (missing ? ` ${missing} skipped: no spare tile, or the cell was taken.` : '');
    this.mode = 'edit';
    this.area = null;
    this.sfx(placed ? 'select' : 'ui');
    this.refresh();
  }

  /** Swap the whole board for a saved layout. Tiles the tray cannot supply are left out. */
  private loadLoadout(l: Loadout) {
    const board = this.board!;
    for (const t of [...board.tiles.values()]) board.remove(t.x, t.y);
    const placed = board.placeAll(l.tiles);
    const b = board.extent;
    if (placed) {
      this.cam.x = (b.x0 + b.x1) / 2;
      this.cam.y = (b.y0 + b.y1) / 2;
    }
    this.panel.hidden = true;
    this.setMode('edit');
    this.note = `Loaded "${l.name}": placed ${placed} of ${l.tiles.length} tiles.` +
                (placed < l.tiles.length ? ' The rest are tiles you do not own in this run.' : '');
    this.refresh();
  }

  private showLoadouts() {
    const list = readLoadouts();
    const name = el('input', 'ed-name');
    name.maxLength = 24;
    name.placeholder = 'Name';
    name.value = `Loadout ${list.length + 1}`;
    const save = el('button', 'ed-act', 'Save current');
    save.addEventListener('click', () => {
      const tiles = this.board!.layout();
      if (tiles.length === 0) return;
      const entry = { name: name.value.trim() || `Loadout ${list.length + 1}`, tiles };
      // Saving under an existing name replaces it.
      writeLoadouts([...list.filter((l) => l.name !== entry.name), entry]);
      this.sfx('select');
      this.showLoadouts();
    });
    const row = el('div', 'ed-row');
    row.append(name, save);

    const rows = list.map((l) => {
      const r = el('div', 'ed-row');
      const load = el('button', 'ed-act', 'Load');
      load.addEventListener('click', () => this.loadLoadout(l));
      const del = el('button', 'ed-act', '✕');
      del.addEventListener('click', () => {
        writeLoadouts(list.filter((o) => o !== l));
        this.sfx('ui');
        this.showLoadouts();
      });
      r.append(el('span', '', `${l.name} · ${l.tiles.length} tiles`), load, del);
      return r;
    });

    const close = el('button', 'ed-act', 'Close');
    close.addEventListener('click', () => (this.panel.hidden = true));
    this.panel.replaceChildren(
      el('h2', '', 'LOADOUTS'),
      el('p', 'ed-hint', 'A loadout is a blueprint. Loading it clears the board and places every tile of it that you own in this run.'),
      row,
      ...(rows.length ? rows : [el('p', 'ed-hint', 'Nothing saved yet.')]),
      close,
    );
    this.panel.hidden = false;
    this.sfx('ui');
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

    const count = this.inArea().length;
    this.toolBtn.select.classList.toggle('on', this.mode === 'select');
    this.toolBtn.paste.classList.toggle('on', this.mode === 'paste');
    this.toolBtn.cut.disabled = this.toolBtn.copy.disabled = this.toolBtn.delete.disabled = count === 0;
    this.toolBtn.paste.disabled = this.clip.length === 0;

    const d = this.sel?.def ?? TILE_LIST.find((t) => t.id === this.pick);
    this.info.replaceChildren();
    if (this.note) this.info.append(el('div', '', this.note));
    else if (this.mode === 'paste') {
      this.info.append(el('div', '', `Tap the cell where the top-left corner of the ${this.clip.length} copied tiles should go.`));
    } else if (this.mode === 'select') {
      const a = this.area;
      this.info.append(el('div', '', a
        ? `Area ${a.x1 - a.x0 + 1} × ${a.y1 - a.y0 + 1} with ${count} tile${count === 1 ? '' : 's'}. Cut, Copy or Delete it.`
        : 'Drag across the board to mark an area. Use two fingers to pan.'));
    } else if (d) {
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
    this.step(dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Advance and redraw once; lets tests drive the editor without animation frames. */
  step(dt: number) {
    const board = this.board;
    if (!board) return;
    const demo = this.demo;
    if (this.demoVersion !== board.version) {
      this.demoVersion = board.version;
      demo.copyLayout(board);
    }
    // The demo pretends the triggers happen, so event sources and sensor gates show what they would do.
    demo.sense.near = demo.sense.moving = true;
    const before = Math.floor(this.demoT);
    this.demoT += dt;
    if (Math.floor(this.demoT) !== before) {
      demo.trigger('kill');
      if (before % 3 === 0) demo.trigger('hurt');
    }
    demo.update(dt, true);
    this.draw(dt);
  }

  private draw(dt: number) {
    const board = this.demo;
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

    // Selected area, and where a paste would land.
    const frame = (a: Area, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(sx(a.x0 - 0.5) + 1, sy(a.y0 - 0.5) + 1, (a.x1 - a.x0 + 1) * s - 2, (a.y1 - a.y0 + 1) * s - 2);
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = color;
      ctx.fillRect(sx(a.x0 - 0.5), sy(a.y0 - 0.5), (a.x1 - a.x0 + 1) * s, (a.y1 - a.y0 + 1) * s);
      ctx.globalAlpha = 1;
    };
    if (this.area) frame(this.area, '#ffffff');
    if (this.mode === 'paste' && this.hover) {
      const [hx, hy] = this.hover;
      for (const c of this.clip) frame({ x0: hx + c.x, y0: hy + c.y, x1: hx + c.x, y1: hy + c.y }, '#ffd23c');
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

    if (t.key === this.sel?.key) {
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
    const r = (3 + Math.sqrt(sp.energy) * 0.9) * Math.sqrt(sp.size) * (s / 58);
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
