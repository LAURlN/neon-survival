/**
 * Hand-tuned values.
 *
 * Everything in game-data.json (enemy stats, XP curve, what each spell level /
 * trait / passive / artifact changes) comes from the original game's tables.
 * The numbers below could not be recovered that way, so they are our own
 * design values - tweak freely.
 *
 * World units are roughly CSS pixels at 1x zoom on a phone.
 */

export const GAME = {
  /** Player */
  playerHp: 100,
  playerSpeed: 150,
  playerRadius: 11,
  baseAtk: 100,
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
  /** How many different active spells can be owned at once. */
  maxSpells: 8,
};

export interface SpellTuning {
  key: string;
  color: string;
  /** Short card text for learning the spell. */
  desc: string;
  /** Base stats before any upgrade. `dmg` is a multiple of ATK. */
  base: Record<string, number>;
}

/** Keyed by the spell id used in game-data.json. */
export const SPELLS: Record<number, SpellTuning> = {
  1: { key: 'bolt', color: '#e9f2ff', desc: 'Fires bolts at the nearest enemy.',
       base: { dmg: 1.3, num: 1, cd: 0.85, speed: 640, size: 6 } },
  2: { key: 'fireball', color: '#ff8a3c', desc: 'Launches an explosive projectile.',
       base: { dmg: 1.4, num: 1, cd: 3.2, speed: 380, size: 62 } },
  3: { key: 'spirit', color: '#7dffd0', desc: 'Summons a spirit that fires homing shards.',
       base: { dmg: 0.7, num: 1, cd: 1.3, speed: 460 } },
  4: { key: 'satellite', color: '#9fd0ff', desc: 'An orb circles you, damaging what it touches.',
       base: { dmg: 0.8, num: 1, speed: 2.9, size: 13, orbit: 82, rehit: 0.4 } },
  5: { key: 'nova', color: '#9ae8ff', desc: 'An icy blast around you that freezes enemies.',
       base: { dmg: 1.1, cd: 6.5, size: 120, freeze: 1.6 } },
  6: { key: 'shield', color: '#ffe9a8', desc: 'A shield that blocks one hit, then recharges.',
       base: { max: 1, cd: 15, charge: 1 } },
  7: { key: 'thunder', color: '#fff48a', desc: 'Lightning strikes nearby enemies.',
       base: { dmg: 1.5, num: 1, cd: 3.0, size: 46 } },
  8: { key: 'zone', color: '#8fb8ff', desc: 'An electric field around you damages enemies repeatedly.',
       base: { dmg: 0.3, size: 92, interval: 0.5 } },
  9: { key: 'tsunami', color: '#5aa9ff', desc: 'Waves sweep across the field, pushing enemies back.',
       base: { dmg: 0.9, num: 3, cd: 8.5, size: 150, speed: 330 } },
  10: { key: 'meteor', color: '#ff6a3a', desc: 'A meteor falls on a random location.',
        base: { dmg: 3.2, num: 1, cd: 5.5, size: 86, delay: 0.75, interval: 0.3 } },
  11: { key: 'cloak', color: '#c9b8ff', desc: 'Briefly become untouchable and move faster.',
        base: { cd: 20, dur: 3, speed: 50, dmg: 2.5, size: 130 } },
  12: { key: 'cyclone', color: '#c9f0e0', desc: 'A growing whirlwind that drifts outward.',
        base: { dmg: 0.38, num: 1, cd: 7.5, size: 40, dur: 4.5, growth: 9, interval: 0.3, speed: 60 } },
  13: { key: 'shock', color: '#b3a1ff', desc: 'Releases a bolt of electricity in a random direction.',
        base: { dmg: 1.2, num: 1, cd: 2.6, size: 16, range: 300 } },
  14: { key: 'arma', color: '#ff4a4a', desc: 'Removes every enemy on the field.',
        base: { cd: 90, bossDmg: 25 } },
  15: { key: 'incin', color: '#ff7a2e', desc: 'Breathes a stream of fire at the nearest enemy.',
        base: { dmg: 0.32, num: 6, cd: 3.2, size: 15, range: 230, interval: 0.07 } },
  16: { key: 'ebolt', color: '#7df9ff', desc: 'Fires a slow projectile that passes through enemies.',
        base: { dmg: 0.85, num: 1, cd: 3.2, size: 13, dur: 2.2, speed: 210, rehit: 0.6 } },
  17: { key: 'blizzard', color: '#cfeeff', desc: 'Ice shards rain around you and freeze enemies.',
        base: { dmg: 0.7, num: 8, cd: 8, size: 48, interval: 0.16, radius: 250, freeze: 0.7 } },
  18: { key: 'ray', color: '#ff8af0', desc: 'A beam that pierces everything in its path.',
        base: { dmg: 0.45, num: 1, cd: 4.2, size: 12, dur: 0.9, interval: 0.2, range: 900 } },
  19: { key: 'circle', color: '#ffd76a', desc: 'Amplifies your ATK by 20% for a while.',
        base: { cd: 20, dur: 6, effect: 20 } },
  20: { key: 'lava', color: '#ff5a1f', desc: 'Creates a pool of lava that burns enemies inside.',
        base: { dmg: 0.45, num: 1, cd: 6.5, size: 68, dur: 4.2, interval: 0.5 } },
  21: { key: 'flash', color: '#ffffff', desc: 'A sudden burst of force on a nearby enemy.',
        base: { dmg: 2.2, num: 1, cd: 3.6, size: 54 } },
};

/**
 * Traits we have behaviour for (or that are purely numeric). A trait from the
 * data file is only offered if it is listed here. The text is the part of the
 * trait that is NOT a plain stat change; stat changes are appended automatically.
 */
export const TRAITS: Record<number, string> = {
  362: 'Bolts pierce every enemy.',
  363: 'Bolts split into three and explode.',
  364: 'Fires at two additional targets.',
  365: '',
  366: 'Bolts are fired in random directions.',
  371: 'The first Fireball of each cast is 1.5× larger and stronger.',
  372: 'The explosion lingers and damages enemies three times.',
  380: '',
  381: 'Blades appear directly on their target.',
  389: 'Rotation speed surges up to 3× and back.',
  390: 'Satellites orbit in two rings.',
  391: 'All Satellites merge into one giant orb that hits every 0.3s.',
  398: 'Freezes enemies for longer.',
  399: 'Explodes three times, each 1.5× larger and stronger.',
  400: 'Stuns instead of freezing.',
  407: '',
  408: 'Recharges two shields at once.',
  409: 'A broken shield leaves a damaging field that follows you.',
  416: 'Strikes one to three times in a row.',
  417: 'Strikes random locations with a larger explosion.',
  418: 'All strikes merge into a single massive bolt.',
  425: '',
  426: 'Every 4th hit stuns the enemy.',
  427: 'Becomes an expanding ring of fire that hits once per pulse.',
  434: 'Waves arrive from every direction at once and freeze.',
  435: 'Waves come from the direction you are moving.',
  436: '',
  443: 'Lands instantly and leaves a burning crater.',
  444: '',
  445: 'All Meteors merge into one enormous impact.',
  452: '',
  453: 'Explodes around you when the cloak ends.',
  454: 'Kills while cloaked heal you; +33% mana while cloaked.',
  461: '',
  462: 'Shrinks instead of growing and fires sparks in random directions.',
  463: 'Stationary vortexes that grow extremely fast.',
  470: 'Chains one to three times in a row.',
  472: 'Always aims at the nearest enemy.',
  479: 'Enemies spawned in the next 20s have up to 40% less HP.',
  480: 'Every 4th cast fully heals you.',
  481: 'Each mana orb reduces the remaining cooldown by 1%.',
  488: 'Each flame is stronger than the last (up to ×4 damage).',
  489: 'Leaves two burning patches on every cast.',
  490: 'Also breathes fire to both sides.',
  497: 'Bolts return to you when they expire.',
  498: 'Bolts hit every 0.3s.',
  499: 'Bolts spread in all directions and explode for double damage.',
  506: 'While active, all enemies slow by 3% per second.',
  507: 'Fewer, far heavier shards.',
  508: 'Each shard explodes twice but no longer freezes.',
  515: 'A second ray fires in the opposite direction.',
  516: 'Rays sweep around you.',
  517: 'Rays fire in random directions and last far longer.',
  524: 'While active, all magic cooldowns are 15% shorter.',
  525: 'Creates 5 mana orbs when cast.',
  526: 'Doubles the ATK amplification.',
  533: 'Burning enemies take up to 30% more damage.',
  534: '',
  535: 'All pools merge into one vast lake of lava.',
  542: 'The centre of the burst deals massive bonus damage.',
  543: 'Bursts appear over a much wider area.',
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
