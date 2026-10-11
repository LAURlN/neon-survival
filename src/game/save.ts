/**
 * Saving and resuming a run.
 *
 * A save is a checkpoint of everything the player has earned - time, level,
 * the circuit, the tray, upgrades, cyberware - not a snapshot of the screen.
 * Hostiles, shots and loose pickups are not stored: a resumed run starts with
 * a clear field at the same point on the clock and the spawns pick up from there.
 */
import type { TileSpot } from '../circuit/board';
import { DIFFICULTIES } from '../data/tuning';
import type { Input } from '../engine/input';
import { ARTIFACTS, PASSIVES } from './content';
import { Game } from './game';

const KEY = 'neon-survival:run';
const VERSION = 1;

export interface SaveData {
  v: number;
  difficulty: string;
  time: number;
  kills: number;
  level: number;
  xp: number;
  hp: number;
  revivesUsed: number;
  /** Choices earned but not made yet: level-ups, caches, legendary caches. */
  pending: [number, number, number];
  tiles: TileSpot[];
  inventory: [string, number][];
  passives: [number, number][];
  artifacts: number[];
  bossesSpawned: number;
  chestIndex: number;
  nextChestAt: number;
  damage: [string, number][];
}

export function snapshot(g: Game): SaveData {
  return {
    v: VERSION, difficulty: g.difficulty.id, time: g.time, kills: g.kills, level: g.level, xp: g.xp,
    hp: g.player.hp, revivesUsed: g.player.revivesUsed,
    pending: [g.pendingLevelUps, g.pendingChests, g.pendingLegendary],
    tiles: g.board.layout(), inventory: [...g.board.inventory].filter(([, n]) => n > 0),
    passives: [...g.progression.passives], artifacts: g.progression.artifacts.map((a) => a.id),
    bossesSpawned: g.director.bossesSpawned, chestIndex: g.chestIndex, nextChestAt: g.nextChestAt,
    damage: [...g.damageBy],
  };
}

/** Rebuild a run from a save. */
export function restore(input: Input, d: SaveData): Game {
  const g = new Game(input, DIFFICULTIES.find((x) => x.id === d.difficulty) ?? DIFFICULTIES[0]);
  g.time = d.time;
  g.kills = d.kills;
  g.level = d.level;
  g.xp = d.xp;
  [g.pendingLevelUps, g.pendingChests, g.pendingLegendary] = d.pending;
  g.chestIndex = d.chestIndex;
  g.nextChestAt = d.nextChestAt;
  g.damageBy = new Map(d.damage);
  g.pickups.length = 0;
  g.board.restore(d.tiles, d.inventory);

  // Stats are rebuilt by applying the effects again - straight to the sheet, so
  // one-off side effects (like "gain a level") do not happen a second time.
  for (const [id, lv] of d.passives) {
    const def = PASSIVES.find((p) => p.id === id);
    if (!def) continue;
    g.progression.passives.set(id, lv);
    for (let i = 0; i < lv; i++) g.stats.applyAll(def.effects);
  }
  for (const id of d.artifacts) {
    const def = ARTIFACTS.find((a) => a.id === id);
    if (!def) continue;
    g.progression.artifacts.push(def);
    g.stats.applyAll(def.effects);
  }

  g.player.hp = Math.min(d.hp, g.player.maxHp);
  g.player.revivesUsed = d.revivesUsed;
  g.player.invuln = 2;
  g.director.resume(d.bossesSpawned);
  return g;
}

export function saveRun(g: Game) {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot(g)));
  } catch {
    // Private browsing or full storage: the run just is not resumable.
  }
}

export function loadRun(): SaveData | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SaveData | null;
    return d && d.v === VERSION && Array.isArray(d.tiles) ? d : null;
  } catch {
    return null;
  }
}

export function clearRun() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
