/**
 * Effect table: maps the numeric effect ids used by the data file to stat keys.
 *
 * The ids are the original game's (each spell owns a block of ids, ids >= 851
 * are the "x N" multiplier variants). An upgrade is only offered to the player
 * if every effect id it uses appears here - see `isSupported` in content.ts -
 * so adding an entry to this table is all it takes to unlock more content.
 */
export type EffectKind = 'flat' | 'pct' | 'mul' | 'pmul' | 'flag';

export interface EffectDef {
  key: string;
  kind: EffectKind;
  /** Multiplier applied to the raw value (-1 turns "decrease by N%" into -N). */
  scale: number;
  /** Human-readable name of the stat, used to generate card text. */
  label: string;
  /** Unit shown after the number for flat stats. */
  unit?: string;
  /** Hidden from generated descriptions (behaviour flags). */
  hidden?: boolean;
}

export const EFFECTS: Record<number, EffectDef> = {};

const def = (id: number, key: string, kind: EffectKind, label: string, scale = 1, unit = '') => {
  EFFECTS[id] = { key, kind, scale, label, unit };
};
const flag = (id: number, key: string) => {
  EFFECTS[id] = { key, kind: 'flag', scale: 1, label: key, hidden: true };
};

// ---- global stats ----------------------------------------------------------
def(4, 'atk', 'pct', 'ATK');
def(129, 'atk', 'pmul', 'ATK');
def(16, 'atkAmp', 'pct', 'ATK amplification');
def(76, 'atkAmp', 'pmul', 'ATK amplification');
def(6, 'cd', 'pct', 'All magic cooldown', -1);
def(8, 'size', 'pct', 'All magic size');
def(9, 'size', 'pct', 'All magic size', -1);
def(77, 'size', 'pmul', 'All magic size');
def(10, 'dur', 'pct', 'All magic duration');
def(14, 'crit', 'flat', 'Critical rate', 1, '%');
def(15, 'critMult', 'flat', 'Critical multiplier', 1, '%');
def(17, 'allDmg', 'pct', 'All magic damage');
def(20, 'maxHp', 'pct', 'Max HP');
def(21, 'maxHp', 'pct', 'Max HP', -1);
def(23, 'dmgTaken', 'pct', 'Damage taken', -1);
def(24, 'regen', 'flat', 'HP regen per sec', 0.01, '%');
def(25, 'evasion', 'flat', 'Evasion', 1, '%');
def(30, 'move', 'pct', 'Movement speed');
def(36, 'orbHeal', 'pct', 'Life orb recovery');
def(38, 'mana', 'pct', 'Mana acquisition');
def(40, 'pickup', 'pct', 'Item pickup range');
def(54, 'enemyHp', 'pct', 'Enemy max HP');
def(55, 'enemySpeed', 'pct', 'Enemy movement speed');
def(75, 'freezeDur', 'pct', 'Freeze duration');
// Special artifact behaviours, implemented in game.ts / player.ts.
def(49, 'revive', 'flat', 'Revives', 1);
def(53, 'hitCap', 'flat', 'Max damage per hit (of max HP)', 1, '%');
def(67, 'manaRegen', 'flat', 'Mana gained per sec', 0.01, '%');
def(82, 'execute', 'flat', 'Instakill enemies below HP', 1, '%');
def(93, 'guillotine', 'flat', 'Bonus damage to enemies above 75% HP', 1, '%');
def(105, 'bonusLevel', 'flat', 'Current level', 1);
def(118, 'killExplode', 'flat', 'Explosion chance on kill', 1, '%');

// ---- per-spell stats -------------------------------------------------------
// Shorthand builders for the stat names every spell shares.
type Row = [id: number, stat: string, kind: EffectKind, scale?: number];
const STAT_LABEL: Record<string, string> = {
  dmg: 'damage',
  num: 'count',
  cd: 'cooldown',
  cdSec: 'cooldown',
  size: 'size',
  dur: 'duration',
  speed: 'speed',
  pierce: 'penetration',
  crit: 'critical rate',
  interval: 'interval',
  targets: 'extra targets',
  max: 'max charges',
  charge: 'charges per cooldown',
  effect: 'effect',
  range: 'range',
  width: 'width',
  radius: 'creation radius',
  growth: 'growth speed',
};
const UNIT: Record<string, string> = { crit: '%', effect: '%', cdSec: 's' };

export const SPELL_NAMES: Record<string, string> = {};

function spell(key: string, name: string, rows: Row[]) {
  SPELL_NAMES[key] = name;
  for (const [id, stat, kind, scale = 1] of rows) {
    if (kind === 'flag') flag(id, `${key}.${stat}`);
    else def(id, `${key}.${stat}`, kind, `${name} ${STAT_LABEL[stat] ?? stat}`, scale, UNIT[stat] ?? '');
  }
}

spell('bolt', 'Magic Bolt', [
  [151, 'dmg', 'pct'], [153, 'num', 'flat'], [156, 'split', 'flag'], [157, 'cdSec', 'flat', 0.01],
  [158, 'cd', 'pct', -1], [159, 'cd', 'pct'], [164, 'size', 'mul'], [170, 'crit', 'flat'],
  [171, 'targets', 'flat'], [851, 'dmg', 'mul'], [853, 'num', 'mul'], [862, 'speed', 'mul'],
]);
spell('fireball', 'Fireball', [
  [181, 'dmg', 'pct'], [182, 'dmg', 'pct', -1], [183, 'pierce', 'flat'], [184, 'num', 'flat'],
  [187, 'size', 'pct'], [194, 'cd', 'pct', -1], [197, 'bigBang', 'flag'],
]);
spell('thunder', 'Thunderstorm', [
  [211, 'dmg', 'pct'], [213, 'num', 'flat'], [214, 'num', 'pct'], [219, 'cd', 'pct', -1],
  [220, 'size', 'pct'], [911, 'dmg', 'mul'], [920, 'cd', 'mul'],
]);
spell('shield', 'Shield', [
  [231, 'max', 'flat'], [233, 'cd', 'pct', -1], [234, 'cd', 'pct'], [235, 'charge', 'flat'],
]);
spell('tsunami', 'Tsunami', [
  [251, 'dmg', 'pct'], [253, 'num', 'flat'], [254, 'num', 'pct'], [255, 'num', 'pct', -1],
  [256, 'size', 'pct'], [259, 'cd', 'pct', -1], [260, 'cd', 'pct'], [951, 'dmg', 'mul'],
]);
spell('spirit', 'Spirit', [
  [271, 'dmg', 'pct'], [273, 'num', 'flat'], [274, 'num', 'pct'], [281, 'cd', 'pct', -1],
  [287, 'crit', 'flat'], [971, 'dmg', 'mul'],
]);
spell('zone', 'Electric Zone', [
  [291, 'dmg', 'pct'], [293, 'size', 'pct'], [296, 'interval', 'pct', -1], [991, 'dmg', 'mul'],
  [995, 'interval', 'mul'],
]);
spell('satellite', 'Satellite', [
  [306, 'dmg', 'pct'], [308, 'num', 'flat'], [309, 'num', 'pct'], [311, 'speed', 'pct'],
  [312, 'speed', 'pct', -1], [314, 'size', 'pct', -1], [1008, 'num', 'mul'],
]);
spell('meteor', 'Meteor', [
  [321, 'dmg', 'pct'], [322, 'dmg', 'pct', -1], [323, 'num', 'flat'], [324, 'size', 'pct'],
  [325, 'size', 'pct', -1], [327, 'cd', 'pct', -1], [1021, 'dmg', 'mul'], [1023, 'num', 'mul'],
  [1028, 'cd', 'mul'], [1036, 'interval', 'pct', -1],
]);
spell('cloak', 'Cloaking', [
  [352, 'dur', 'pct'], [358, 'warp', 'flag'], [359, 'harvest', 'flag'], [360, 'harvestHeal', 'flag'],
]);
spell('nova', 'Frost Nova', [
  [371, 'dmg', 'pct'], [375, 'size', 'pct'], [376, 'size', 'pct', -1], [378, 'cd', 'pct', -1],
  [379, 'size', 'pct'], [1071, 'dmg', 'mul'], [1079, 'cd', 'mul'],
]);
spell('cyclone', 'Cyclone', [
  [391, 'dmg', 'pct'], [393, 'num', 'flat'], [395, 'size', 'pct'], [396, 'dur', 'pct', -1],
  [397, 'size', 'pct'], [406, 'cd', 'pct', -1], [1091, 'dmg', 'mul'], [1099, 'growth', 'mul'],
  [1107, 'cd', 'mul'],
]);
spell('shock', 'Electric Shock', [
  [421, 'dmg', 'pct'], [424, 'num', 'flat'], [426, 'num', 'pct'], [431, 'cd', 'pct', -1],
  [1121, 'dmg', 'mul'], [1128, 'size', 'mul'],
]);
spell('arma', 'Armageddon', [[443, 'cd', 'pct', -1], [447, 'apocalypse', 'flag'], [448, 'prophet', 'flag']]);
spell('incin', 'Incineration', [
  [461, 'dmg', 'pct'], [463, 'num', 'flat'], [464, 'num', 'pct'], [465, 'width', 'pct', -1],
  [468, 'size', 'pct'], [470, 'range', 'pct'], [472, 'cd', 'pct', -1], [1169, 'num', 'pct', -1],
]);
spell('ebolt', 'Energy Bolt', [
  [481, 'dmg', 'pct'], [482, 'dmg', 'pct', -1], [483, 'size', 'pct'], [485, 'num', 'flat'],
  [486, 'num', 'pct'], [490, 'speed', 'pct'], [493, 'cd', 'pct', -1], [1188, 'dur', 'mul'],
]);
spell('blizzard', 'Blizzard', [
  [511, 'dmg', 'pct'], [513, 'num', 'flat'], [514, 'num', 'pct'], [515, 'num', 'pct', -1],
  [519, 'cd', 'pct', -1], [522, 'interval', 'pct', -1], [523, 'subZero', 'flag'], [1211, 'dmg', 'mul'],
  [1216, 'size', 'mul'], [1221, 'interval', 'mul'], [1223, 'radius', 'pct', -1],
]);
spell('ray', 'Arcane Ray', [
  [531, 'dmg', 'pct'], [533, 'num', 'flat'], [534, 'num', 'pct'], [542, 'cd', 'pct', -1],
  [543, 'cd', 'pct'], [545, 'interval', 'pct', -1], [1231, 'dmg', 'mul'], [1237, 'dur', 'mul'],
]);
spell('circle', 'Magic Circle', [
  [561, 'effect', 'flat'], [563, 'dur', 'pct'], [566, 'cd', 'pct', -1], [567, 'cd', 'pct'],
  [568, 'unleash', 'flag'], [569, 'synthesis', 'flag'],
]);
spell('lava', 'Lava Zone', [
  [581, 'dmg', 'pct'], [583, 'num', 'flat'], [586, 'size', 'pct', -1], [587, 'size', 'pct'],
  [588, 'dur', 'pct', -1], [590, 'cd', 'pct', -1], [591, 'cd', 'pct'], [592, 'melt', 'flag'],
  [1281, 'dmg', 'mul'], [1283, 'num', 'mul'],
]);
spell('flash', 'Flash Shock', [
  [601, 'dmg', 'pct'], [603, 'num', 'flat'], [606, 'size', 'pct'], [607, 'size', 'pct', -1],
  [609, 'cd', 'pct', -1], [611, 'core', 'flag'], [1310, 'cd', 'mul'],
]);

/** One line of card text for an `[effectId, value]` pair, or null if hidden / unknown. */
export function describeEffect(id: number, value: number): string | null {
  const d = EFFECTS[id];
  if (!d || d.hidden) return null;
  const fmt = (n: number) => String(Math.round(n * 100) / 100);
  if (d.kind === 'mul') return `${d.label} ×${fmt(value >= 100 ? value / 100 : value)}`;
  if (d.kind === 'pmul') return `${d.label} ×${fmt(1 + (value * d.scale) / 100)}`;
  const v = value * d.scale;
  const sign = v >= 0 ? '+' : '−';
  if (d.kind === 'pct') return `${d.label} ${sign}${fmt(Math.abs(v))}%`;
  return `${d.label} ${sign}${fmt(Math.abs(v))}${d.unit ?? ''}`;
}
