/** Decides what spawns and when, following the wave table in tuning.ts. */
import { ENEMY_COLORS } from '../data/theme';
import { BOSSES, GAME, WAVES, type Wave } from '../data/tuning';
import { TAU, clamp, pick, rand } from '../engine/math';
import { makeBoss } from './boss';
import { ENEMIES } from './content';
import type { Game } from './game';
import type { Enemy, EnemyKind } from './types';

export class Director {
  private timer = 1.5;
  private wave: Wave = WAVES[0];
  bossesSpawned = 0;
  private shardTimer = 1;
  private chestTimer = GAME.wildChestFirst;
  /** Shown by the HUD for a few seconds when a boss arrives. */
  announce = { text: '', t: 0 };

  constructor(private readonly g: Game) {}

  update(dt: number) {
    const g = this.g;
    const minute = g.time / 60;
    this.announce.t -= dt;

    this.scatter(dt, minute);

    // Advance to the latest wave whose start time has passed.
    let current = WAVES[0];
    for (const w of WAVES) if (w.from <= minute) current = w;
    if (current !== this.wave) {
      this.wave = current;
      if (current.elite) this.spawn(current.elite, 'elite');
    }

    if (minute >= (this.bossesSpawned + 1) * BOSSES.every) {
      const id = BOSSES.ids[this.bossesSpawned % BOSSES.ids.length];
      const boss = this.spawn(id, 'boss');
      if (boss) {
        boss.boss = makeBoss(this.bossesSpawned);
        this.announce = { text: `${boss.boss.name} inbound`, t: 3.5 };
        g.shake = 8;
        g.sound('boss');
      }
      this.bossesSpawned++;
    }

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer += this.wave.every;
      // Past the last scripted wave the batches keep growing.
      const extra = Math.max(0, Math.floor((minute - WAVES[WAVES.length - 1].from) / 2));
      for (let i = 0; i < this.wave.batch + extra; i++) {
        if (g.enemies.length >= GAME.maxEnemies) break;
        this.spawn(pick(this.wave.ids), 'normal');
      }
    }
  }

  /** Pick up a saved run: bosses already met stay met, and the current wave does not re-announce itself. */
  resume(bossesSpawned: number) {
    this.bossesSpawned = bossesSpawned;
    const minute = this.g.time / 60;
    for (const w of WAVES) if (w.from <= minute) this.wave = w;
  }

  /** Shards and caches that appear without anything being killed. */
  private scatter(dt: number, minute: number) {
    const g = this.g;
    const p = g.player;
    if ((this.shardTimer -= dt) <= 0) {
      this.shardTimer += GAME.wildShardEvery;
      const a = rand(0, TAU);
      const d = g.viewR * rand(0.45, 1.1);
      const value = GAME.wildShardValue * (1 + GAME.wildShardGrowth * minute);
      for (let i = 0; i < GAME.wildShardCluster; i++) {
        g.drop('mana', p.x + Math.cos(a) * d + rand(-26, 26), p.y + Math.sin(a) * d + rand(-26, 26), value);
      }
    }
    if ((this.chestTimer -= dt) <= 0) {
      this.chestTimer += GAME.wildChestEvery;
      const a = Math.atan2(p.mvy, p.mvx) + rand(-1.1, 1.1);
      const d = g.viewR + rand(40, 160);
      g.drop('chest', p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 1);
    }
  }

  /** An ordinary hostile of the current wave. */
  minionId(): number {
    return pick(this.wave.ids);
  }

  /** Spawn an enemy just off screen, or at `at` if given. */
  spawn(id: number, kind: EnemyKind, at?: { x: number; y: number }): Enemy | null {
    const def = ENEMIES.get(id);
    if (!def) return null;
    const g = this.g;
    const minute = g.time / 60;
    const [a, b] = GAME.enemyHpGrowth;

    const diff = g.difficulty;
    let hp = def.hp * diff.hp * (1 + diff.growth * (a * minute + b * minute * minute)) * g.stats.mult('enemyHp', -80);
    hp *= 1 - g.buffs.enemyHpCut;
    if (kind === 'boss') hp *= 1 + Math.floor(this.bossesSpawned / BOSSES.ids.length) * 1.5;

    const angle = rand(0, TAU);
    const dist = g.viewR + 50 + rand(0, 60);
    const e: Enemy = {
      def, kind,
      color: kind === 'boss' ? '#ff2e4d' : ENEMY_COLORS[def.id % ENEMY_COLORS.length],
      shape: def.id % 5,
      x: at?.x ?? g.player.x + Math.cos(angle) * dist,
      y: at?.y ?? g.player.y + Math.sin(angle) * dist,
      r: clamp(7 + Math.sqrt(def.hp) * 0.55, 10, 62),
      hp, maxHp: hp,
      atk: def.atk * (1 + GAME.enemyAtkGrowth * minute),
      speed: def.speed * GAME.enemySpeedScale * rand(0.92, 1.08), speedMul: 1,
      frozen: 0, kx: 0, ky: 0, flash: 0, touchT: 0, hitT: {}, hits: 0, melt: 0, burn: 0, burnT: 0, burnAcc: 0, chill: 0,
      dashT: rand(0, 2), wobble: rand(0, 10), dead: false,
    };
    g.enemies.push(e);
    return e;
  }
}
