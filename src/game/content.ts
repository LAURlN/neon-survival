/**
 * Typed view over game-data.json (enemies, XP curve, upgrades, cyberware),
 * plus the rule that decides which upgrades are playable.
 */
import raw from '../data/game-data.json';
import { ARTIFACT_THEME, PASSIVE_THEME } from '../data/theme';
import { GRADES } from '../data/tuning';
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

const data = raw as unknown as {
  xp: number[];
  enemies: EnemyDef[];
  passives: PassiveDef[];
  artifacts: ArtifactDef[];
};

/** An upgrade is playable only if we know what every one of its effects does. */
export const isSupported = (effects: readonly Effect[]) =>
  effects.length > 0 && effects.every(([id]) => id in EFFECTS);

export const XP_TABLE = data.xp;
export const ENEMIES = new Map(data.enemies.map((e) => [e.id, e]));
export const PASSIVES = data.passives
  .filter((p) => isSupported(p.effects))
  .map((p) => ({ ...p, name: PASSIVE_THEME[p.id] ?? p.name }));
export const ARTIFACTS = data.artifacts
  .filter((a) => isSupported(a.effects) && a.grade in GRADES)
  .map((a) => ({ ...a, name: ARTIFACT_THEME[a.id] ?? a.name }));

/** Data needed to go from `level` to `level + 1`. */
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
