/**
 * Uniform spatial hash. Rebuilt every frame from the live enemy list, then
 * used for every "who is near this point" query (projectiles, areas, separation).
 */
export interface GridItem {
  x: number;
  y: number;
  r: number;
}

export class Grid<T extends GridItem> {
  private cells = new Map<number, T[]>();
  private pool: T[][] = [];

  constructor(private readonly cell = 64) {}

  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  rebuild(items: readonly T[]) {
    for (const list of this.cells.values()) {
      list.length = 0;
      this.pool.push(list);
    }
    this.cells.clear();
    for (const it of items) {
      const k = this.key(Math.floor(it.x / this.cell), Math.floor(it.y / this.cell));
      let list = this.cells.get(k);
      if (!list) {
        list = this.pool.pop() ?? [];
        this.cells.set(k, list);
      }
      list.push(it);
    }
  }

  /** Calls `fn` for every item whose circle overlaps the query circle. */
  query(x: number, y: number, r: number, fn: (item: T) => void) {
    // Items are bucketed by centre, so widen the search by the largest radius we expect.
    const pad = r + 70;
    const x0 = Math.floor((x - pad) / this.cell);
    const x1 = Math.floor((x + pad) / this.cell);
    const y0 = Math.floor((y - pad) / this.cell);
    const y1 = Math.floor((y + pad) / this.cell);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.cells.get(this.key(cx, cy));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const it = list[i];
          const dx = it.x - x;
          const dy = it.y - y;
          const rr = r + it.r;
          if (dx * dx + dy * dy <= rr * rr) fn(it);
        }
      }
    }
  }
}
