/**
 * Movement input: a floating virtual joystick (touch / mouse drag anywhere on
 * the canvas) plus WASD / arrow keys. Exposes a normalised direction vector.
 */
export class Input {
  /** Movement direction, length 0..1. */
  dx = 0;
  dy = 0;

  /** Joystick state in CSS pixels, for drawing. */
  stick = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
  readonly stickRadius = 56;

  private keys = new Set<string>();
  private pointerId: number | null = null;

  constructor(target: HTMLElement) {
    target.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());
  }

  reset() {
    this.keys.clear();
    this.pointerId = null;
    this.stick.active = false;
  }

  private onDown = (e: PointerEvent) => {
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.stick.active = true;
    this.stick.ox = this.stick.x = e.clientX;
    this.stick.oy = this.stick.y = e.clientY;
    e.preventDefault();
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    const s = this.stick;
    s.x = e.clientX;
    s.y = e.clientY;
    // Drag the origin along once the thumb leaves the ring, so reversing is instant.
    const dx = s.x - s.ox;
    const dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    if (d > this.stickRadius) {
      s.ox = s.x - (dx / d) * this.stickRadius;
      s.oy = s.y - (dy / d) * this.stickRadius;
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.stick.active = false;
  };

  /** Call once per frame before reading dx / dy. */
  poll() {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;

    if (x !== 0 || y !== 0) {
      const d = Math.hypot(x, y);
      x /= d;
      y /= d;
    } else if (this.stick.active) {
      const s = this.stick;
      const jx = s.x - s.ox;
      const jy = s.y - s.oy;
      const d = Math.hypot(jx, jy);
      const dead = 6;
      if (d > dead) {
        const m = Math.min(1, (d - dead) / (this.stickRadius - dead));
        x = (jx / d) * m;
        y = (jy / d) * m;
      }
    }
    this.dx = x;
    this.dy = y;
  }
}
