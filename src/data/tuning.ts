/**
 * Hand-tuned values.
 *
 * Enemy stats, the XP curve and what each upgrade / cyberware item changes come
 * from game-data.json. The numbers below are our own design values - tweak
 * freely. Circuit tiles and weapons have their own files (tiles.ts, weapons.ts).
 *
 * World units are roughly CSS pixels at 1x zoom on a phone.
 */

export const GAME = {
  /** Player */
  playerHp: 100,
  playerSpeed: 150,
  playerRadius: 11,
  baseAtk: 100,
  /** Damage per point of spark energy, as a percentage of ATK (10 energy = 1.3x ATK). */
  energyDamage: 13,
  baseCrit: 3,
  baseCritMult: 150,
  pickupRange: 95,
  /** Shard pickup motion: hop-away speed, acceleration towards the player, top speed. */
  pickupPop: 150,
  pickupAccel: 1500,
  pickupMaxSpeed: 780,
  hitInvuln: 0.45,
  /** Enemy `speed` stat (9..34) -> world units per second. */
  enemySpeedScale: 2.8,
  /** Rusher enemies: lunge at `lungeSpeed`x for `lungeTime`s when within `lungeRange`. */
  lungeRange: 190,
  lungeSpeed: 2.1,
  lungeTime: 0.55,
  lungeCooldown: 2.4,
  /** Enemy HP growth per minute survived: hp * (1 + a*m + b*m^2). */
  enemyHpGrowth: [0.1, 0.012],
  enemyAtkGrowth: 0.03,
  /** Hard cap on live enemies, for performance. */
  maxEnemies: 420,
  /** Kill counts at which a treasure chest drops; after the list, every `chestEvery` kills. */
  chestKills: [40, 130, 280, 480, 720],
  chestEvery: 320,
  /** Life orb drop chance per kill (%), and how much max HP it restores (%). */
  lifeOrbChance: 0.9,
  lifeOrbHeal: 20,
  /** Options shown on level up / chest. */
  choices: 3,
  /** Chance (%) that one of the level-up choices is a stat upgrade instead of a tile. */
  upgradeOfferChance: 45,
  /** A hostile within this distance counts as "close" for proximity gates. */
  nearRange: 150,
  /** Movement speed multiplier while chilled. */
  chillSlow: 0.5,
};

/** Enemy spawn timeline. `ids` are enemy ids from game-data.json. */
export interface Wave {
  /** Starts at this minute. */
  from: number;
  /** Seconds between spawn batches. */
  every: number;
  /** Enemies per batch. */
  batch: number;
  ids: number[];
  /** Elite spawned once at the start of the wave. */
  elite?: number;
}

export const WAVES: Wave[] = [
  { from: 0, every: 1.3, batch: 2, ids: [1] },
  { from: 1, every: 1.2, batch: 3, ids: [1, 1, 6], elite: 24 },
  { from: 2, every: 1.1, batch: 3, ids: [1, 6, 6, 8] },
  { from: 3, every: 1.0, batch: 4, ids: [6, 7, 8, 11], elite: 24 },
  { from: 4, every: 0.95, batch: 5, ids: [6, 11, 12, 31] },
  { from: 5, every: 0.9, batch: 6, ids: [11, 12, 13, 32], elite: 29 },
  { from: 6, every: 0.85, batch: 7, ids: [11, 13, 14, 18, 32] },
  { from: 7, every: 0.8, batch: 8, ids: [14, 16, 17, 19], elite: 29 },
  { from: 8, every: 0.75, batch: 9, ids: [16, 18, 19, 21, 23] },
  { from: 9, every: 0.7, batch: 10, ids: [17, 21, 22, 23], elite: 33 },
  { from: 10, every: 0.7, batch: 11, ids: [21, 22, 23, 26, 34] },
  { from: 12, every: 0.65, batch: 12, ids: [22, 26, 27, 28, 34], elite: 33 },
  { from: 14, every: 0.6, batch: 13, ids: [26, 27, 28, 34, 18] },
];

/** A boss appears every `every` minutes, cycling through `ids`. */
export const BOSSES = { every: 5, ids: [41, 42, 43, 45, 46] };

/** Artifact grade -> drop weight and card colour. */
export const GRADES: Record<number, { name: string; weight: number; color: string }> = {
  1: { name: 'Normal', weight: 40, color: '#c8c8c8' },
  2: { name: 'Rare', weight: 30, color: '#6edcff' },
  3: { name: 'Epic', weight: 18, color: '#c58cff' },
  4: { name: 'Special', weight: 8, color: '#ffb347' },
  5: { name: 'Legendary', weight: 4, color: '#ff6464' },
};
