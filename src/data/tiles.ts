/**
 * Every tile that can be placed on the circuit board.
 *
 * A tile is pure data: `op` names the behaviour (implemented once in
 * circuit/board.ts) and the remaining fields are that behaviour's parameters.
 * To add a tile that reuses an existing behaviour, add an entry here and
 * nothing else. Rarity decides where it drops: 0-1 from level-ups, 2+ from
 * data caches. Legendary tiles (4) are what a boss cache offers.
 */
import type { Element, Mode, Shape } from '../circuit/spark';

export type TileOp =
  | 'source' | 'mirror' | 'split' | 'boost' | 'bank' | 'and' | 'join' | 'switch' | 'threshold'
  | 'sense' | 'delay' | 'element' | 'shape' | 'mode' | 'count' | 'emit';

export type TileCat = 'source' | 'route' | 'boost' | 'logic' | 'element' | 'shape' | 'mode' | 'emit';

export interface TileDef {
  id: string;
  name: string;
  glyph: string;
  rarity: number;
  cat: TileCat;
  desc: string;
  op: TileOp;
  /** 'dir': four facings, 'flip': two states. Tiles without it ignore rotation. */
  turn?: 'dir' | 'flip';
  /** How many copies one level-up / cache pick grants. */
  bundle?: number;
  /** Relative drop weight within its rarity. */
  weight?: number;

  // ---- behaviour parameters (meaning depends on `op`) ----
  /** source: energy per spark. threshold: energy needed to pass. */
  energy?: number;
  /** source: board ticks between sparks. boost: recharge ticks. delay: ticks held. */
  ticks?: number;
  /** source: what makes it fire. */
  trigger?: 'clock' | 'kill' | 'hurt' | 'move';
  /** split / boost / bank / and / emit: energy multiplier. */
  mult?: number;
  /** split: outputs (2 = sideways, 3 = sideways + straight). bank: sparks banked. boost: boosts allowed per spark. */
  n?: number;
  /** boost: chance (0-1) that the boost happens at all. */
  chance?: number;
  /** emit: fraction of the energy that carries on past the emitter. */
  echo?: number;
  /** emit: fire this many times in quick succession. */
  repeat?: number;
  /** sense: the condition that lets a spark pass straight. */
  when?: 'near' | 'moving';
  element?: Element | 'random';
  shape?: Shape;
  mode?: Mode;
}

export const RARITY = [
  { name: 'Common', color: '#c8d3e6', weight: 0 },
  { name: 'Uncommon', color: '#7dff9a', weight: 0 },
  { name: 'Rare', color: '#6edcff', weight: 60 },
  { name: 'Epic', color: '#c58cff', weight: 30 },
  { name: 'Legendary', color: '#ffb347', weight: 4 },
];

export const CAT_LABEL: Record<TileCat, string> = {
  source: 'Source', route: 'Routing', boost: 'Boost', logic: 'Logic', element: 'Element', shape: 'Shape',
  mode: 'Type', emit: 'Emitter',
};

/** Board ticks per second; a spark crosses one cell per tick. */
export const TICKS_PER_SEC = 10;

const defs: TileDef[] = [
  // ---- basic building blocks: level-ups --------------------------------------
  { id: 'reactor', name: 'Reactor', glyph: '⚡', rarity: 1, cat: 'source', op: 'source', turn: 'dir', weight: 0.5,
    energy: 10, ticks: 6, trigger: 'clock', desc: 'Throws a 10-energy spark every 0.6 s.' },
  { id: 'emitter', name: 'Emitter', glyph: '◉', rarity: 0, cat: 'emit', op: 'emit', weight: 1.2,
    desc: 'Fires the spark that reaches it as a weapon.' },
  { id: 'mirror', name: 'Mirror', glyph: '╱', rarity: 0, cat: 'route', op: 'mirror', turn: 'flip', bundle: 3, weight: 2,
    desc: 'Bounces sparks 90°.' },
  { id: 'splitter', name: 'Splitter', glyph: '◁▷', rarity: 0, cat: 'route', op: 'split', n: 2, mult: 0.5, bundle: 2,
    desc: 'Two sparks out sideways at half energy each.' },
  { id: 'amp', name: 'Amplifier', glyph: '✚', rarity: 0, cat: 'boost', op: 'boost', mult: 1.5, ticks: 10, n: 1, weight: 1.6,
    desc: '×1.5 energy, once per spark. Needs 1 s to recharge.' },
  { id: 'bank', name: 'Capacitor', glyph: '▣', rarity: 0, cat: 'boost', op: 'bank', turn: 'dir', n: 3, mult: 1.25,
    desc: 'Banks 3 sparks and releases one with their energy ×1.25. The bonus applies once per spark.' },
  { id: 'delay', name: 'Buffer', glyph: '◷', rarity: 0, cat: 'logic', op: 'delay', ticks: 3, bundle: 2, weight: 0.6,
    desc: 'Holds each spark for 0.3 s. Use it to line sparks up.' },
  { id: 'join', name: 'OR Gate', glyph: '⊕', rarity: 0, cat: 'logic', op: 'join', turn: 'dir', bundle: 2, weight: 0.8,
    desc: 'Sends sparks from any side out through its arrow.' },
  { id: 'and', name: 'AND Gate', glyph: '&', rarity: 1, cat: 'logic', op: 'and', turn: 'dir', mult: 1.3,
    desc: 'Two sparks within 0.4 s fuse into one at ×1.3 (once per spark). A lone spark is lost.' },
  { id: 'switch', name: 'Flip-Flop', glyph: '⇄', rarity: 1, cat: 'logic', op: 'switch',
    desc: 'Sends sparks left and right in turn, at full energy.' },
  { id: 'threshold', name: 'Comparator', glyph: '≥', rarity: 1, cat: 'logic', op: 'threshold', turn: 'dir', energy: 25,
    desc: 'Sparks of 25+ energy pass straight. Weaker ones leave through the arrow.' },
  { id: 'near', name: 'Proximity Gate', glyph: '◎', rarity: 1, cat: 'logic', op: 'sense', turn: 'dir', when: 'near',
    desc: 'Passes straight while a hostile is close. Otherwise sparks leave through the arrow.' },
  { id: 'motion', name: 'Motion Gate', glyph: '➠', rarity: 1, cat: 'logic', op: 'sense', turn: 'dir', when: 'moving',
    desc: 'Passes straight while you move. Otherwise sparks leave through the arrow.' },

  { id: 'fire', name: 'Igniter', glyph: '♨', rarity: 1, cat: 'element', op: 'element', element: 'fire',
    desc: 'FIRE: hits set hostiles burning for 60% extra damage over 3 s.' },
  { id: 'shock', name: 'Arc Coil', glyph: 'ϟ', rarity: 1, cat: 'element', op: 'element', element: 'shock',
    desc: 'SHOCK: hits often arc to two nearby hostiles at half damage.' },
  { id: 'cryo', name: 'Cryo Cell', glyph: '❄', rarity: 1, cat: 'element', op: 'element', element: 'cryo',
    desc: 'CRYO: hits slow hostiles and sometimes freeze them solid.' },
  { id: 'acid', name: 'Acid Vat', glyph: '☣', rarity: 1, cat: 'element', op: 'element', element: 'acid',
    desc: 'ACID: every hit makes the hostile take 5% more damage (up to 50%).' },

  { id: 's-arrow', name: 'Arrow Shaper', glyph: '➤', rarity: 0, cat: 'shape', op: 'shape', shape: 'arrow', weight: 0.4,
    desc: 'ARROW shape: a plain shot. Full power.' },
  { id: 's-beam', name: 'Beam Shaper', glyph: '═', rarity: 1, cat: 'shape', op: 'shape', shape: 'beam',
    desc: 'BEAM shape: hits everything along a line.' },
  { id: 's-seeker', name: 'Seeker Shaper', glyph: '▲', rarity: 1, cat: 'shape', op: 'shape', shape: 'seeker',
    desc: 'SEEKER shape: finds its own target.' },
  { id: 's-bomb', name: 'Bomb Shaper', glyph: '●', rarity: 1, cat: 'shape', op: 'shape', shape: 'bomb',
    desc: 'BOMB shape: explodes over an area.' },

  { id: 'm-aim', name: 'Aim Core', glyph: '⌖', rarity: 0, cat: 'mode', op: 'mode', mode: 'aim', weight: 0.4,
    desc: 'AIMED type: launched from you at the nearest hostile.' },
  { id: 'm-loose', name: 'Spin Core', glyph: '✺', rarity: 1, cat: 'mode', op: 'mode', mode: 'loose',
    desc: 'LOOSE type: launched from you in a turning pattern, unaimed. Hits harder.' },
  { id: 'm-orbit', name: 'Orbit Core', glyph: '◌', rarity: 1, cat: 'mode', op: 'mode', mode: 'orbit',
    desc: 'ORBIT type: circles you for a while.' },
  { id: 'm-sky', name: 'Sky Core', glyph: '☄', rarity: 1, cat: 'mode', op: 'mode', mode: 'sky',
    desc: 'SKY type: lands on a random spot nearby. Hits hardest.' },
  { id: 'm-lock', name: 'Lock Core', glyph: '⊹', rarity: 1, cat: 'mode', op: 'mode', mode: 'lock',
    desc: 'LOCK type: appears right on the nearest hostile. Never misses, hits softer.' },

  // ---- special blocks: data caches --------------------------------------------
  { id: 'overdrive', name: 'Overdrive Amp', glyph: '✚', rarity: 2, cat: 'boost', op: 'boost', mult: 2.1, ticks: 20, n: 1,
    desc: '×2.1 energy, once per spark. Needs 2 s to recharge.' },
  { id: 'prism', name: 'Prism', glyph: '⟁', rarity: 2, cat: 'route', op: 'split', n: 3, mult: 0.45,
    desc: 'Three sparks out — straight and both sides — at 45% each (a third each on repeat passes).' },
  { id: 'multi', name: 'Duplicator', glyph: '⧉', rarity: 2, cat: 'boost', op: 'count', mult: 0.75, n: 4,
    desc: '+1 projectile, each at 75% energy. A spark can carry at most 4 projectiles.' },
  { id: 'lens', name: 'Crit Lens', glyph: '◈', rarity: 2, cat: 'boost', op: 'boost', mult: 2.5, chance: 0.3, n: 1,
    desc: 'One roll per spark: 30% chance to multiply it by ×2.5. No recharge.' },
  { id: 'quick', name: 'Pulse Reactor', glyph: '⚡', rarity: 2, cat: 'source', op: 'source', turn: 'dir', energy: 6, ticks: 3,
    trigger: 'clock', desc: 'Throws a 6-energy spark every 0.3 s.' },
  { id: 'pain', name: 'Pain Tap', glyph: '♥', rarity: 2, cat: 'source', op: 'source', turn: 'dir', energy: 70, ticks: 5,
    trigger: 'hurt', desc: 'Throws a 70-energy spark whenever you are hit.' },
  { id: 'dynamo', name: 'Dynamo', glyph: '⚙', rarity: 2, cat: 'source', op: 'source', turn: 'dir', energy: 8, ticks: 3,
    trigger: 'move', desc: 'Throws an 8-energy spark every 0.3 s, but only while you move.' },
  { id: 'twin', name: 'Twin Emitter', glyph: '◉', rarity: 2, cat: 'emit', op: 'emit', mult: 0.7, repeat: 2,
    desc: 'Fires twice, each shot at 70%.' },
  { id: 'heavy', name: 'Heavy Reactor', glyph: '⚡', rarity: 3, cat: 'source', op: 'source', turn: 'dir', energy: 28, ticks: 12,
    trigger: 'clock', desc: 'Throws a 28-energy spark every 1.2 s.' },
  { id: 'superbank', name: 'Supercapacitor', glyph: '▣', rarity: 3, cat: 'boost', op: 'bank', turn: 'dir', n: 5, mult: 1.6,
    desc: 'Banks 5 sparks and releases one with their energy ×1.6. The bonus applies once per spark.' },
  { id: 'resonator', name: 'Resonator', glyph: '∿', rarity: 3, cat: 'boost', op: 'boost', mult: 1.25, n: 4,
    desc: '×1.25 every time a spark passes, up to 4 times. No recharge. The one tile that rewards a loop.' },
  { id: 'echo', name: 'Echo Emitter', glyph: '◉', rarity: 3, cat: 'emit', op: 'emit', echo: 0.6,
    desc: 'Fires, then lets the spark carry on at 60% energy.' },
  { id: 'killtap', name: 'Kill Tap', glyph: '☠', rarity: 3, cat: 'source', op: 'source', turn: 'dir', energy: 14, ticks: 5,
    trigger: 'kill', desc: 'Throws a 14-energy spark when you kill (up to 2 per second).' },
  { id: 'chaos', name: 'Chaos Lens', glyph: '✹', rarity: 3, cat: 'element', op: 'element', element: 'random', mult: 1.3,
    desc: 'Gives each spark a random element and ×1.3 energy (the energy once per spark).' },
  { id: 'fusion', name: 'Fusion Core', glyph: '☢', rarity: 4, cat: 'source', op: 'source', turn: 'dir', energy: 45, ticks: 10,
    trigger: 'clock', desc: 'Throws a 45-energy spark every second.' },
  { id: 'cloner', name: 'Cloner', glyph: '⧓', rarity: 4, cat: 'route', op: 'split', n: 2, mult: 1,
    desc: 'Two sparks out sideways at FULL energy each (half each on repeat passes).' },
  { id: 'hyper', name: 'Hyper Amp', glyph: '✚', rarity: 4, cat: 'boost', op: 'boost', mult: 3, ticks: 10, n: 1,
    desc: '×3 energy, once per spark. Needs 1 s to recharge.' },
  { id: 'tesseract', name: 'Tesseract Cell', glyph: '▣', rarity: 4, cat: 'boost', op: 'bank', turn: 'dir', n: 2, mult: 1.8,
    desc: 'Banks 2 sparks and releases one with their energy ×1.8. The bonus applies once per spark.' },
  { id: 'trinity', name: 'Trinity Emitter', glyph: '◉', rarity: 4, cat: 'emit', op: 'emit', mult: 0.65, repeat: 3,
    desc: 'Fires three times, each shot at 65%.' },
  { id: 'omni', name: 'Singularity Emitter', glyph: '◉', rarity: 4, cat: 'emit', op: 'emit', mult: 1.6,
    desc: 'Fires at ×1.6 power.' },
];

// U+FE0E asks for the plain text form of symbols that phones would otherwise draw as colour emoji.
for (const d of defs) d.glyph += '︎';

export const TILES: Record<string, TileDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const TILE_LIST = defs;

/** What a fresh run starts with: tiles already on the board, and spares in the inventory. */
export const START = {
  board: [
    { id: 'reactor', x: 0, y: 0, rot: 1 },
    { id: 'emitter', x: 3, y: 0, rot: 0 },
  ],
  inventory: { mirror: 2, amp: 1 } as Record<string, number>,
};
