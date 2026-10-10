/**
 * Typed view over game-data.json joined with the hand-tuned values, plus the
 * rule that decides which upgrades are playable.
 */
import raw from '../data/game-data.json';
import { PASSIVE_THEME, SPELL_THEME, TRAIT_THEME } from '../data/theme';
import { GRADES, SPELLS, TRAITS, type SpellTuning } from '../data/tuning';
import { EFFECTS, describeEffect } from './effects';
import type { Effect } from './stats';

export interface EnemyDef {
  id: number;
  name: string;
  mana: number;
  atk: number;
  hp: number;
  resist: number;
  speed: number;
  size: number;
  traits: number[];
}

export interface TraitDef {
  id: number;
  name: string;
  effects: Effect[];
  text: string;
}

export interface SpellDef extends SpellTuning {
  id: number;
  name: string;
  maxLevel: number;
  /** Levels at which a trait is chosen instead of a fixed upgrade. */
  traitLevels: number[];
  /** Fixed upgrades; index 0 is level 2. */
  levels: Effect[][];
  /** Repeatable bonus once the spell is at max level. */
  overLevel: Effect[];
  /** One group of options per trait level. */
  traitGroups: TraitDef[][];
}

export interface PassiveDef {
  id: number;
  name: string;
  maxLevel: number;
  effects: Effect[];
}

export interface ArtifactDef {
  id: number;
  name: string;
  grade: number;
  effects: Effect[];
}

interface RawSpell {
  id: number;
  name: string;
  maxLevel: number;
  traitLevels: number[];
  levels: (Effect | null)[];
  overLevel: Effect[];
  traits: { id: number; name: string; effects: Effect[] }[];
}

const data = raw as unknown as {
  xp: number[];
  enemies: EnemyDef[];
  spells: RawSpell[];
  passives: PassiveDef[];
  artifacts: ArtifactDef[];
};

/** An upgrade is playable only if we know what every one of its effects does. */
export const isSupported = (effects: readonly Effect[]) =>
  effects.length > 0 && effects.every(([id]) => id in EFFECTS);

function buildSpell(r: RawSpell): SpellDef {
  // The table lists either every level explicitly, or one or two effects that
  // repeat on every non-trait level.
  const explicit = r.levels.slice(2).some((e) => e !== null);
  const repeating = r.levels.slice(0, 2).filter((e): e is Effect => e !== null);
  const levels: Effect[][] = [];
  for (let lv = 2; lv <= r.maxLevel; lv++) {
    if (r.traitLevels.includes(lv)) levels.push([]);
    else if (explicit) levels.push(r.levels[lv - 2] ? [r.levels[lv - 2]!] : []);
    else levels.push(repeating);
  }

  const playable = r.traits
    .filter((t) => t.id in TRAITS && t.effects.every(([id]) => id in EFFECTS))
    .map((t) => ({ ...t, name: TRAIT_THEME[t.id]?.[0] ?? t.name, text: TRAIT_THEME[t.id]?.[1] ?? TRAITS[t.id] }));
  // Traits come in groups of three, one group per trait level.
  const traitGroups = r.traitLevels.map((_, i) => {
    const ids = r.traits.slice(i * 3, i * 3 + 3).map((t) => t.id);
    return playable.filter((t) => ids.includes(t.id));
  });

  const tuning = SPELLS[r.id];
  // Every spell has a theme entry; it supplies the display name, text and colour.
  return { ...tuning, ...SPELL_THEME[tuning.key], id: r.id, maxLevel: r.maxLevel, traitLevels: r.traitLevels,
           levels, overLevel: r.overLevel.filter(([id]) => id in EFFECTS), traitGroups };
}

export const XP_TABLE = data.xp;
export const ENEMIES = new Map(data.enemies.map((e) => [e.id, e]));
export const SPELL_DEFS = data.spells.filter((s) => s.id in SPELLS).map(buildSpell);
export const SPELL_BY_ID = new Map(SPELL_DEFS.map((s) => [s.id, s]));
export const PASSIVES = data.passives
  .filter((p) => isSupported(p.effects))
  .map((p) => ({ ...p, name: PASSIVE_THEME[p.id] ?? p.name }));
export const ARTIFACTS = data.artifacts.filter((a) => isSupported(a.effects) && a.grade in GRADES);

/** Mana needed to go from `level` to `level + 1`. */
export function xpForLevel(level: number): number {
  const t = XP_TABLE;
  return level < t.length ? t[level] : t[t.length - 1] * Math.pow(1.1, level - t.length + 1);
}

/** Card text for a list of effects. */
export function describeEffects(effects: readonly Effect[]): string[] {
  const lines: string[] = [];
  for (const [id, v] of effects) {
    const line = describeEffect(id, v);
    if (line) lines.push(line);
  }
  return lines;
}
