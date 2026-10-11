/**
 * A spark is the packet of energy that travels across the circuit board.
 * Besides its energy it carries three properties, and together they decide
 * which weapon an emitter turns it into:
 *
 *   element - what a hit does on top of damage
 *   shape   - what the thing that hits looks like and how it connects
 *   mode    - (called "type" in the UI) where it appears and how it travels
 */
export type Element = 'none' | 'fire' | 'shock' | 'cryo' | 'acid';
export type Shape = 'arrow' | 'beam' | 'seeker' | 'bomb';
export type Mode = 'aim' | 'loose' | 'orbit' | 'sky' | 'lock';

export const ELEMENTS: Element[] = ['fire', 'shock', 'cryo', 'acid'];

export const ELEMENT_COLOR: Record<Element, string> = {
  none: '#5ff4ff', fire: '#ff7a3c', shock: '#ffe93c', cryo: '#9adfff', acid: '#9dff3c',
};

export interface Spark {
  /** Board cell, and the cell it came from (for drawing between ticks). */
  x: number;
  y: number;
  px: number;
  py: number;
  dx: number;
  dy: number;
  energy: number;
  element: Element;
  shape: Shape;
  mode: Mode;
  /** Projectiles fired per emission. */
  count: number;
  age: number;
  /** Ticks left to wait on the current tile (Buffer). */
  wait: number;
  /** How often each boosting tile has already acted on this spark, by tile key. */
  seen: Map<string, number>;
}

export const newSpark = (x: number, y: number, dx: number, dy: number, energy: number): Spark => ({
  x, y, px: x, py: y, dx, dy, energy, element: 'none', shape: 'arrow', mode: 'aim', count: 1, age: 0, wait: 0,
  seen: new Map(),
});

export const cloneSpark = (s: Spark): Spark => ({ ...s, seen: new Map(s.seen) });
