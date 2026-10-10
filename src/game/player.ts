import { GAME } from '../data/tuning';
import { chance } from '../engine/math';
import type { Game } from './game';

export class Player {
  x = 0;
  y = 0;
  readonly r = GAME.playerRadius;
  hp = GAME.playerHp;
  /** Unit vector of the last movement direction (never zero). */
  mvx = 0;
  mvy = -1;
  moving = false;
  /** Seconds of invulnerability left (after a hit, or while cloaked). */
  invuln = 0;
  /** Set by the Cloaking spell: enemies pass through and cannot hit. */
  cloaked = false;
  /** Bonus movement speed in percent, set by spells. */
  speedBuff = 0;
  /** Charges that absorb one hit each, managed by the Shield spell. */
  shields = 0;
  revivesUsed = 0;
  /** Red flash timer for the renderer. */
  hurt = 0;
  /** Called when a shield charge is consumed. */
  onShieldBreak: (() => void) | null = null;
  /** Called on every kill (Cloaking's Soul Harvest hooks this). */
  onKillHook: (() => void) | null = null;

  constructor(private readonly g: Game) {}

  get maxHp(): number {
    return Math.max(1, GAME.playerHp * this.g.stats.mult('maxHp', -90));
  }

  get speed(): number {
    return GAME.playerSpeed * this.g.stats.mult('move', -70) * (1 + this.speedBuff / 100);
  }

  update(dt: number) {
    const { input, stats } = this.g;
    this.moving = input.dx !== 0 || input.dy !== 0;
    if (this.moving) {
      const d = Math.hypot(input.dx, input.dy);
      this.mvx = input.dx / d;
      this.mvy = input.dy / d;
      this.x += input.dx * this.speed * dt;
      this.y += input.dy * this.speed * dt;
    }
    this.invuln -= dt;
    this.hurt -= dt;

    const regen = stats.flat('regen');
    if (regen > 0) this.heal((this.maxHp * regen * dt) / 100);
    if (this.hp > this.maxHp) this.hp = this.maxHp;
  }

  heal(amount: number) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  takeDamage(raw: number) {
    const { g } = this;
    if (this.invuln > 0 || this.cloaked || g.over) return;
    const s = g.stats;
    if (chance(Math.min(75, s.flat('evasion')))) {
      g.fx.push({ kind: 'text', x: this.x, y: this.y - 22, r: 11, life: 0.5, maxLife: 0.5, color: '#9fd0ff', text: 'miss' });
      this.invuln = 0.2;
      return;
    }
    if (this.shields > 0) {
      this.shields--;
      this.invuln = GAME.hitInvuln;
      g.ring(this.x, this.y, 34, '#ffe066', 0.3);
      g.sparks(this.x, this.y, '#ffe066', 10, 220);
      g.sound('shield');
      this.onShieldBreak?.();
      return;
    }

    let dmg = raw * s.mult('dmgTaken', -90);
    const cap = s.flat('hitCap');
    if (cap) dmg = Math.min(dmg, (this.maxHp * cap) / 100);
    this.hp -= dmg;
    this.invuln = GAME.hitInvuln;
    this.hurt = 0.25;
    g.sound('hurt');
    g.sparks(this.x, this.y, '#ff2e4d', 8, 200);
    g.shake = Math.max(g.shake, 5);

    if (this.hp <= 0) {
      if (this.revivesUsed < s.flat('revive')) {
        this.revivesUsed++;
        this.hp = this.maxHp * 0.5;
        this.invuln = 2;
        g.explode(this.x, this.y, 260, g.atk * 5, 'artifact', '#ffffff', { knockback: 500 });
      } else {
        this.hp = 0;
        g.over = true;
      }
    }
  }

  onKill() {
    this.onKillHook?.();
  }
}
