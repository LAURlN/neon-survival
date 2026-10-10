/** Decides what spawns and when, following the wave table in tuning.ts. */
import { ENEMY_COLORS } from '../data/theme';
import { BOSSES, GAME, WAVES, type Wave } from '../data/tuning';
import { TAU, clamp, pick, rand } from '../engine/math';
import { ENEMIES } from './content';
import type { Game } from './game';
import type { Enemy, EnemyKind } from './types';

export class Director {
  private timer = 1.5;
  private wave: Wave = WAVES[0];
  private bossesSpawned = 0;
  /** Shown by the HUD for a few seconds when a boss arrives. */
  announce = { text: '', t: 0 };

  constructor(private readonly g: Game) {}

  update(dt: number) {
    const g = this.g;
    const minute = g.time / 60;
    this.announce.t -= dt;

    // Advance to the latest wave whose start time has passed.
    let current = WAVES[0];
    for (const w of WAVES) if (w.from <= minute) current = w;
    if (current !== this.wave) {
      this.wave = current;
      if (current.elite) this.spawn(current.elite, 'elite');
    }

    if (minute >= (this.bossesSpawned + 1) * BOSSES.every) {
      const id = BOSSES.ids[this.bossesSpawned % BOSSES.ids.length];
      this.bossesSpawned++;
      const boss = this.spawn(id, 'boss');
      if (boss) {
        this.announce = { text: `${boss.def.name} approaches`, t: 3.5 };
        g.shake = 8;
        g.sound('boss');
      }
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

  spawn(id: number, kind: EnemyKind): Enemy | null {
    const def = ENEMIES.get(id);
    if (!def) return null;
    const g = this.g;
    const minute = g.time / 60;
    const [a, b] = GAME.enemyHpGrowth;

    let hp = def.hp * (1 + a * minute + b * minute * minute) * g.stats.mult('enemyHp', -80);
    hp *= 1 - g.buffs.enemyHpCut;
    if (kind === 'boss') hp *= 1 + Math.floor(this.bossesSpawned / BOSSES.ids.length) * 1.5;

    const angle = rand(0, TAU);
    const dist = g.viewR + 50 + rand(0, 60);
    const e: Enemy = {
      def, kind,
      color: kind === 'boss' ? '#ff2e4d' : ENEMY_COLORS[def.id % ENEMY_COLORS.length],
      shape: def.id % 5,
      x: g.player.x + Math.cos(angle) * dist,
      y: g.player.y + Math.sin(angle) * dist,
      r: clamp(7 + Math.sqrt(def.hp) * 0.55, 10, 62),
      hp, maxHp: hp,
      atk: def.atk * (1 + GAME.enemyAtkGrowth * minute),
      speed: def.speed * GAME.enemySpeedScale * rand(0.92, 1.08),
      frozen: 0, kx: 0, ky: 0, flash: 0, touchT: 0, hitT: {}, hits: 0, melt: 0,
      dashT: rand(0.5, 2.5), wobble: rand(0, 10), dead: false,
    };
    g.enemies.push(e);
    return e;
  }
}
