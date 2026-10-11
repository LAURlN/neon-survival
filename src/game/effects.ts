/**
 * Effect table: maps the numeric effect ids used by the data file to stat keys.
 *
 * An upgrade or cyberware item is only offered to the player if every effect
 * id it uses appears here - see `isSupported` in content.ts - so adding an
 * entry to this table is all it takes to unlock more of the data file.
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

// ---- global stats ----------------------------------------------------------
def(4, 'atk', 'pct', 'ATK');
def(129, 'atk', 'pmul', 'ATK');
def(16, 'atkAmp', 'pct', 'ATK amplification');
def(76, 'atkAmp', 'pmul', 'ATK amplification');
def(6, 'cd', 'pct', 'Reactor cycle time', -1);
def(8, 'size', 'pct', 'Weapon area');
def(9, 'size', 'pct', 'Weapon area', -1);
def(77, 'size', 'pmul', 'Weapon area');
def(10, 'dur', 'pct', 'Weapon duration');
def(14, 'crit', 'flat', 'Critical rate', 1, '%');
def(15, 'critMult', 'flat', 'Critical multiplier', 1, '%');
def(17, 'allDmg', 'pct', 'Weapon damage');
def(20, 'maxHp', 'pct', 'Max HP');
def(21, 'maxHp', 'pct', 'Max HP', -1);
def(23, 'dmgTaken', 'pct', 'Damage taken', -1);
def(24, 'regen', 'flat', 'HP regen per sec', 0.01, '%');
def(25, 'evasion', 'flat', 'Evasion', 1, '%');
def(30, 'move', 'pct', 'Movement speed');
def(36, 'orbHeal', 'pct', 'Repair kit recovery');
def(38, 'mana', 'pct', 'Data acquisition');
def(40, 'pickup', 'pct', 'Item pickup range');
def(54, 'enemyHp', 'pct', 'Hostile max HP');
def(55, 'enemySpeed', 'pct', 'Hostile movement speed');
def(75, 'freezeDur', 'pct', 'Freeze duration');
// Special artifact behaviours, implemented in game.ts / player.ts.
def(49, 'revive', 'flat', 'Revives', 1);
def(53, 'hitCap', 'flat', 'Max damage per hit (of max HP)', 1, '%');
def(67, 'manaRegen', 'flat', 'Data gained per sec', 0.01, '%');
def(82, 'execute', 'flat', 'Delete hostiles below HP', 1, '%');
def(93, 'guillotine', 'flat', 'Bonus damage to hostiles above 75% HP', 1, '%');
def(105, 'bonusLevel', 'flat', 'Current level', 1);
def(118, 'killExplode', 'flat', 'Explosion chance on kill', 1, '%');

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
