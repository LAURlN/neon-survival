/**
 * The circuit board: an unbounded grid of tiles, the player's stock of spare
 * tiles, and the sparks travelling across it.
 *
 * Ten times a second every spark moves one cell. A spark flies straight until
 * it enters a tile; the tile's `op` decides what happens to it. A spark that
 * reaches an emitter is handed to `fire`, which turns it into a weapon.
 * The board knows nothing about the game world - it only reads `sense` and
 * `rate`, and reports through `fire`.
 */
import { START, TICKS_PER_SEC, TILES, type TileDef } from '../data/tiles';
import { WEAPONS } from '../data/weapons';
import { pick } from '../engine/math';
import { ELEMENTS, cloneSpark, newSpark, type Spark } from './spark';

/** Facing index -> cell offset: up, right, down, left. */
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

const TICK = 1 / TICKS_PER_SEC;
/** How long an AND gate waits for the second spark, in ticks. */
const AND_WINDOW = 4;
const MAX_SPARKS = 300;

export interface Tile {
  def: TileDef;
  x: number;
  y: number;
  /** Facing (0-3) for 'dir' tiles, 0/1 for 'flip' tiles. */
  rot: number;
  key: string;
  /** Sources: progress towards the next spark, and queued event sparks. */
  charge: number;
  pending: number;
  /** Tick at which the tile can act again. */
  ready: number;
  /** Sparks held by capacitors and AND gates, and when the first one arrived. */
  store: Spark[];
  storeT: number;
  toggle: boolean;
  /** 1 when a spark just touched it, decays in the editor. */
  flash: number;
  /** Emitters: name and energy of the last weapon fired. */
  label: string;
  lastEnergy: number;
}

export const cellKey = (x: number, y: number) => `${x},${y}`;

export class Board {
  readonly tiles = new Map<string, Tile>();
  /** Spare tiles, by tile id. */
  readonly inventory = new Map<string, number>();
  sparks: Spark[] = [];
  tick = 0;
  /** Multiplier on how long clocked sources take (the global cooldown stat). */
  rate = 1;
  /** World conditions the sensor gates read; the game refreshes these. */
  sense = { near: false, moving: false };
  /** Called for every emission; `shot` counts up for emitters that fire more than once. */
  fire: (s: Spark, tile: Tile, shot: number) => void = () => {};
  /** Bumped whenever the layout or the inventory changes. */
  version = 0;

  private acc = 0;
  private bounds = { x0: 0, y0: 0, x1: 0, y1: 0 };

  /** A board set up for the start of a run. */
  static starter(): Board {
    const b = new Board();
    for (const t of START.board) b.set(t.x, t.y, t.id, t.rot);
    for (const id in START.inventory) b.give(id, START.inventory[id]);
    return b;
  }

  // ---- inventory & layout --------------------------------------------------

  give(id: string, n = 1) {
    this.inventory.set(id, (this.inventory.get(id) ?? 0) + n);
    this.version++;
  }

  spare(id: string): number {
    return this.inventory.get(id) ?? 0;
  }

  /** Total number of tiles waiting to be placed. */
  get spares(): number {
    let n = 0;
    for (const v of this.inventory.values()) n += v;
    return n;
  }

  at(x: number, y: number): Tile | undefined {
    return this.tiles.get(cellKey(x, y));
  }

  private set(x: number, y: number, id: string, rot: number): Tile {
    const key = cellKey(x, y);
    const tile: Tile = { def: TILES[id], x, y, rot, key, charge: 0, pending: 0, ready: 0, store: [], storeT: 0,
                         toggle: false, flash: 0, label: '', lastEnergy: 0 };
    this.tiles.set(key, tile);
    this.changed();
    return tile;
  }

  /** Move one spare tile onto an empty cell. */
  place(x: number, y: number, id: string, rot = 0): Tile | null {
    if (this.at(x, y) || this.spare(id) <= 0) return null;
    this.inventory.set(id, this.spare(id) - 1);
    return this.set(x, y, id, rot);
  }

  /** Take a tile off the board and back into the inventory. */
  remove(x: number, y: number): boolean {
    const t = this.at(x, y);
    if (!t) return false;
    this.tiles.delete(t.key);
    this.give(t.def.id);
    this.changed();
    return true;
  }

  turn(x: number, y: number): boolean {
    const t = this.at(x, y);
    if (!t || !t.def.turn) return false;
    t.rot = (t.rot + 1) % (t.def.turn === 'dir' ? 4 : 2);
    this.version++;
    return true;
  }

  /** Make this board's layout match `src`, keeping the state of every tile that did not change. */
  copyLayout(src: Board) {
    for (const [key, t] of this.tiles) if (src.tiles.get(key)?.def !== t.def) this.tiles.delete(key);
    for (const o of src.tiles.values()) (this.tiles.get(o.key) ?? this.set(o.x, o.y, o.def.id, o.rot)).rot = o.rot;
    this.rate = src.rate;
    this.changed();
  }

  private changed() {
    const b = this.bounds;
    b.x0 = b.y0 = Infinity;
    b.x1 = b.y1 = -Infinity;
    for (const t of this.tiles.values()) {
      b.x0 = Math.min(b.x0, t.x); b.x1 = Math.max(b.x1, t.x);
      b.y0 = Math.min(b.y0, t.y); b.y1 = Math.max(b.y1, t.y);
    }
    this.version++;
  }

  /** Cells covered by tiles (inclusive); sparks die once they leave it. */
  get extent() {
    return this.bounds;
  }

  // ---- simulation ----------------------------------------------------------

  /** Queue a spark on every source that listens for this event. */
  trigger(kind: 'kill' | 'hurt') {
    for (const t of this.tiles.values()) {
      if (t.def.op === 'source' && t.def.trigger === kind) t.pending = Math.min(t.pending + 1, 2);
    }
  }

  /** Fraction of the current tick that has elapsed, for drawing sparks between cells. */
  get frac(): number {
    return this.acc / TICK;
  }

  /** Advance the board. With `silent`, emitters only update their labels (the editor's demo board). */
  update(dt: number, silent = false) {
    this.acc += dt;
    while (this.acc >= TICK) {
      this.acc -= TICK;
      this.step(silent);
    }
  }

  private step(silent: boolean) {
    this.tick++;
    for (const t of this.tiles.values()) {
      const d = t.def;
      if (d.op !== 'source') continue;
      let go = false;
      if (d.trigger === 'clock' || (d.trigger === 'move' && this.sense.moving)) {
        const period = (d.ticks ?? 6) * this.rate;
        if (++t.charge >= period) {
          t.charge -= period;
          go = true;
        }
      } else if (t.pending > 0 && this.tick >= t.ready) {
        t.pending--;
        t.ready = this.tick + (d.ticks ?? 1);
        go = true;
      }
      if (go && this.sparks.length < MAX_SPARKS) {
        const [dx, dy] = DIRS[t.rot];
        this.sparks.push(newSpark(t.x, t.y, dx, dy, d.energy ?? 10));
        t.flash = 1;
      }
    }

    const b = this.bounds;
    const next: Spark[] = [];
    for (const s of this.sparks) {
      s.px = s.x;
      s.py = s.y;
      if (s.wait > 0) {
        s.wait--;
        next.push(s);
        continue;
      }
      s.x += s.dx;
      s.y += s.dy;
      if (++s.age > 160 || s.energy < 0.5) continue;
      if (s.x < b.x0 - 1 || s.x > b.x1 + 1 || s.y < b.y0 - 1 || s.y > b.y1 + 1) continue;
      const t = this.tiles.get(cellKey(s.x, s.y));
      if (!t) next.push(s);
      else {
        t.flash = 1;
        this.enter(t, s, next, silent);
      }
    }
    this.sparks = next;
  }

  /** Apply a tile to a spark that just entered it; survivors are pushed onto `out`. */
  private enter(t: Tile, s: Spark, out: Spark[], silent: boolean) {
    const d = t.def;
    const face = () => {
      [s.dx, s.dy] = DIRS[t.rot];
    };
    switch (d.op) {
      case 'source':
        return; // Sources are solid.
      case 'mirror':
        [s.dx, s.dy] = t.rot ? [s.dy, s.dx] : [-s.dy, -s.dx];
        break;
      case 'split': {
        const mult = d.mult ?? 0.5;
        for (const side of [1, -1]) {
          const c = cloneSpark(s);
          c.dx = -s.dy * side;
          c.dy = s.dx * side;
          c.energy *= mult;
          out.push(c);
        }
        if (d.n !== 3) return;
        s.energy *= mult;
        break;
      }
      case 'boost': {
        const used = s.seen.get(t.key) ?? 0;
        if (used < (d.n ?? 1) && this.tick >= t.ready) {
          s.seen.set(t.key, used + 1);
          if (d.chance === undefined || Math.random() < d.chance) {
            s.energy *= d.mult ?? 1;
            t.ready = this.tick + (d.ticks ?? 0);
          }
        }
        break;
      }
      case 'bank':
        t.store.push(s);
        if (t.store.length < (d.n ?? 3)) return;
        out.push(this.merge(t, d.mult ?? 1));
        return;
      case 'and':
        if (t.store.length > 0 && this.tick - t.storeT <= AND_WINDOW) {
          t.store.push(s);
          out.push(this.merge(t, d.mult ?? 1));
        } else {
          t.store = [s];
          t.storeT = this.tick;
        }
        return;
      case 'join':
        // A spark arriving head-on to the arrow would bounce straight back; let it through instead.
        if (DIRS[t.rot][0] !== -s.dx || DIRS[t.rot][1] !== -s.dy) face();
        break;
      case 'switch': {
        t.toggle = !t.toggle;
        const side = t.toggle ? 1 : -1;
        [s.dx, s.dy] = [-s.dy * side, s.dx * side];
        break;
      }
      case 'threshold':
        if (s.energy < (d.energy ?? 0)) face();
        break;
      case 'sense':
        if (!this.sense[d.when ?? 'near']) face();
        break;
      case 'delay':
        s.wait = d.ticks ?? 1;
        break;
      case 'element':
        s.element = d.element === 'random' ? pick(ELEMENTS) : d.element ?? 'none';
        if (d.mult && !s.seen.has(t.key)) {
          s.seen.set(t.key, 1);
          s.energy *= d.mult;
        }
        break;
      case 'shape':
        s.shape = d.shape ?? 'arrow';
        break;
      case 'mode':
        s.mode = d.mode ?? 'aim';
        break;
      case 'count':
        if (s.count < (d.n ?? 4)) {
          s.count++;
          s.energy *= d.mult ?? 1;
        }
        break;
      case 'emit': {
        const shot = cloneSpark(s);
        shot.energy *= d.mult ?? 1;
        t.label = WEAPONS[s.shape][s.mode].name;
        t.lastEnergy = shot.energy;
        if (!silent) for (let i = 0; i < (d.repeat ?? 1); i++) this.fire(shot, t, i);
        if (!d.echo) return;
        s.energy *= d.echo;
        break;
      }
    }
    out.push(s);
  }

  /** Fuse the sparks a tile is holding into one, leaving through the tile's arrow. */
  private merge(t: Tile, mult: number): Spark {
    const best = t.store.reduce((a, b) => (b.energy > a.energy ? b : a));
    const m = cloneSpark(best);
    m.energy = 0;
    for (const s of t.store) {
      m.energy += s.energy * mult;
      m.count = Math.max(m.count, s.count);
      for (const [k, v] of s.seen) m.seen.set(k, Math.max(m.seen.get(k) ?? 0, v));
    }
    t.store = [];
    m.x = m.px = t.x;
    m.y = m.py = t.y;
    [m.dx, m.dy] = DIRS[t.rot];
    m.age = 0;
    m.wait = 0;
    return m;
  }
}
