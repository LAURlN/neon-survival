/**
 * The weapon matrix: every shape × type pair is its own weapon.
 *
 * `power` scales the weapon's damage per hit; the damage of one point of
 * energy at power 1 is `GAME.energyDamage` in tuning.ts. It is the product of what the shape and the type are
 * worth: things that hit many targets or cannot miss pay for it, things that
 * are hard to land are paid back. The behaviours live in circuit/weapons.ts.
 */
import type { Mode, Shape } from '../circuit/spark';

export interface WeaponDef {
  name: string;
  desc: string;
  power: number;
}

export const SHAPE_INFO: Record<Shape, { name: string; glyph: string; color: string }> = {
  arrow: { name: 'Arrow', glyph: '➤', color: '#5ff4ff' },
  beam: { name: 'Beam', glyph: '═', color: '#ff2bd6' },
  seeker: { name: 'Seeker', glyph: '▲', color: '#6dffb0' },
  bomb: { name: 'Bomb', glyph: '●', color: '#ff9a3c' },
};

export const MODE_INFO: Record<Mode, { name: string; glyph: string }> = {
  aim: { name: 'Aimed', glyph: '⌖' },
  loose: { name: 'Loose', glyph: '✺' },
  orbit: { name: 'Orbit', glyph: '◌' },
  sky: { name: 'Sky', glyph: '☄' },
  lock: { name: 'Lock', glyph: '⊹' },
};

export const WEAPONS: Record<Shape, Record<Mode, WeaponDef>> = {
  arrow: {
    aim: { name: 'Pulse Shot', power: 1, desc: 'A fast shot at the nearest hostile.' },
    loose: { name: 'Spiral', power: 0.7, desc: 'Three piercing shots in a turning pinwheel.' },
    orbit: { name: 'Satellite', power: 0.4, desc: 'A node that circles you, cutting what it touches.' },
    sky: { name: 'Needle Rain', power: 0.9, desc: 'Four needles strike random spots.' },
    lock: { name: 'Snipe', power: 0.75, desc: 'An instant hit on the nearest hostile.' },
  },
  beam: {
    aim: { name: 'Lance', power: 0.6, desc: 'A beam through everything towards the nearest hostile.' },
    loose: { name: 'Sweeper', power: 0.2, desc: 'A beam that sweeps around you.' },
    orbit: { name: 'Halo', power: 0.3, desc: 'A ring of energy around you that keeps burning.' },
    sky: { name: 'Sky Pillar', power: 0.4, desc: 'A pillar of light scorches a random spot.' },
    lock: { name: 'Crossfire', power: 0.5, desc: 'Two beams cross on the nearest hostile.' },
  },
  seeker: {
    aim: { name: 'Hunter Dart', power: 0.85, desc: 'A homing dart.' },
    loose: { name: 'Swarm', power: 0.4, desc: 'Three darts scatter, then hunt.' },
    orbit: { name: 'Sentinel', power: 1.15, desc: 'A drone that circles you and dives at whatever comes close.' },
    sky: { name: 'Wisp', power: 1.3, desc: 'A hunter appears somewhere nearby and finds prey.' },
    lock: { name: 'Ricochet', power: 0.6, desc: 'Hits the nearest hostile, then jumps to two more.' },
  },
  bomb: {
    aim: { name: 'Grenade', power: 0.65, desc: 'An explosive lobbed at the nearest hostile.' },
    loose: { name: 'Mine', power: 1.1, desc: 'A proximity mine dropped at your feet.' },
    orbit: { name: 'Orbital Mine', power: 0.95, desc: 'A charge that circles you until something touches it.' },
    sky: { name: 'Kinetic Strike', power: 1.7, desc: 'A heavy slug drops on a random spot.' },
    lock: { name: 'Detonate', power: 0.7, desc: 'An explosion centred on the nearest hostile.' },
  },
};

/** Display name for a damage source key ("bomb.sky", "burn", ...). */
export function sourceName(src: string): string {
  const [shape, mode] = src.split('.') as [Shape, Mode];
  if (WEAPONS[shape]?.[mode]) return WEAPONS[shape][mode].name;
  return src === 'burn' ? 'Burn' : src === 'arc' ? 'Arc' : 'Cyberware';
}

export function sourceColor(src: string): string {
  const shape = src.split('.')[0] as Shape;
  return SHAPE_INFO[shape]?.color ?? (src === 'burn' ? '#ff7a3c' : src === 'arc' ? '#ffe93c' : '#ffb347');
}
