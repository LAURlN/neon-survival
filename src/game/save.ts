/**
 * Saving and resuming a run.
 *
 * A save holds everything the player has earned - time, level, the circuit,
 * the tray, upgrades, cyberware - plus where the player, every hostile and
 * every pickup is, so reloading the page cannot be used to escape a bad spot.
 * Only shots in flight and lingering zones are not stored.
 */
import type { TileSpot } from '../circuit/board';
import type { BossState } from './boss';
import type { EnemyKind, PickupKind } from './types';
import { DIFFICULTIES } from '../data/tuning';
import type { Input } from '../engine/input';
import { ARTIFACTS, PASSIVES } from './content';
import { Game } from './game';

const KEY = 'neon-survival:run';
const VERSION = 2;

const KINDS: EnemyKind[] = ['normal', 'elite', 'boss'];

/** One hostile: [enemy id, kind index, x, y, hp, max hp, atk, speed, acid stacks, boss state]. */
type SavedEnemy = [number, number, number, number, number, number, number, number, number, BossState | null];
/** One pickup: [kind, x, y, value]. */
type SavedPickup = [PickupKind, number, number, number];

const round = (n: number) => Math.round(n * 10) / 10;

export interface SaveData {
  v: number;
  difficulty: string;
  time: number;
  kills: number;
  level: number;
  xp: number;
  hp: number;
  revivesUsed: number;
  /** Player position and facing. */
  pos: [number, number, number, number];
  enemies: SavedEnemy[];
  pickups: SavedPickup[];
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
    pos: [round(g.player.x), round(g.player.y), g.player.mvx, g.player.mvy],
    enemies: g.enemies.filter((e) => !e.dead).map((e) => [
      e.def.id, KINDS.indexOf(e.kind), round(e.x), round(e.y), round(e.hp), round(e.maxHp), round(e.atk), round(e.speed),
      e.melt, e.boss ?? null,
    ]),
    pickups: g.pickups.filter((p) => !p.dead).map((p) => [p.kind, round(p.x), round(p.y), round(p.value)]),
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
  for (const [kind, x, y, value] of d.pickups) g.drop(kind, x, y, value);

  const p = g.player;
  [p.x, p.y, p.mvx, p.mvy] = d.pos;
  for (const [id, kind, x, y, hp, maxHp, atk, speed, melt, boss] of d.enemies) {
    const e = g.director.spawn(id, KINDS[kind] ?? 'normal', { x, y });
    if (!e) continue;
    Object.assign(e, { hp, maxHp, atk, speed, melt });
    if (boss) {
      e.boss = boss;
      // A boss caught mid wind-up finishes it; one that was standing still for it must not stay frozen.
      e.speedMul = boss.winding ? 0 : 1;
    }
  }
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
    return d && d.v === VERSION && Array.isArray(d.tiles) && Array.isArray(d.enemies) ? d : null;
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
