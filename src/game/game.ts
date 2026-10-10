/**
 * One run of the game: owns all world state and the per-frame update.
 * Spells talk to the world exclusively through the helpers on this class
 * (hit / explode / spawnProjectile / addZone / addBeam / after / fx...).
 */
import { GAME } from '../data/tuning';
import { Grid } from '../engine/grid';
import type { Input } from '../engine/input';
import { TAU, chance, clamp, dist2, distToSegment2, rand } from '../engine/math';
import { xpForLevel } from './content';
import { Director } from './director';
import { Player } from './player';
import { Progression } from './progression';
import { StatSheet } from './stats';
import type { Beam, Enemy, Fx, Pickup, PickupKind, Projectile, Zone } from './types';

export interface ExplodeOpts {
  freeze?: number;
  knockback?: number;
  /** Skip the default ring / burst visuals. */
  quiet?: boolean;
}

export class Game {
  time = 0;
  kills = 0;
  level = 1;
  xp = 0;
  over = false;

  readonly stats = new StatSheet();
  readonly player: Player;
  readonly progression: Progression;
  readonly director: Director;

  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  beams: Beam[] = [];
  pickups: Pickup[] = [];
  fx: Fx[] = [];
  readonly grid = new Grid<Enemy>(72);

  /** Half-diagonal of the visible area in world units; set by the renderer. */
  viewR = 520;
  viewW = 400;
  viewH = 700;

  /** Level-ups / chests waiting for the player to choose; the UI drains these. */
  pendingLevelUps = 0;
  pendingChests = 0;

  /** Temporary modifiers that spells switch on and off. */
  buffs = { atkAmp: 0, cdMult: 1, manaMult: 1, enemySlow: 0, enemyHpCut: 0 };

  /** Total damage dealt per spell key, shown on the result screen. */
  damageBy = new Map<string, number>();
  shake = 0;

  private timers: { t: number; fn: () => void }[] = [];
  private nextChestAt = GAME.chestKills[0];
  private chestIndex = 0;
  private textBudget = 0;

  constructor(readonly input: Input) {
    this.player = new Player(this);
    this.progression = new Progression(this);
    this.director = new Director(this);
    this.progression.learnSpell(1); // Everyone starts with Magic Bolt.
    // Like the original, a few orbs wait around the start position.
    for (let i = 0; i < 10; i++) {
      const a = rand(0, TAU);
      const d = rand(90, 240);
      this.drop('mana', Math.cos(a) * d, Math.sin(a) * d, 5);
    }
  }

  // ---- derived stats -------------------------------------------------------

  get atk(): number {
    const s = this.stats;
    return GAME.baseAtk * s.mult('atk') * s.mult('atkAmp') * (1 + this.buffs.atkAmp / 100);
  }

  /** Multiplier applied to every spell cooldown. */
  get cooldownMult(): number {
    return this.stats.mult('cd', -75) * this.buffs.cdMult;
  }

  get xpNeeded(): number {
    return xpForLevel(this.level);
  }

  // ---- frame update --------------------------------------------------------

  update(dt: number) {
    if (this.over) return;
    this.time += dt;
    this.textBudget = 10;
    this.shake = Math.max(0, this.shake - dt * 30);

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      if ((tm.t -= dt) <= 0) {
        this.timers[i] = this.timers[this.timers.length - 1];
        this.timers.pop();
        tm.fn();
      }
    }

    this.player.update(dt);
    this.director.update(dt);
    this.grid.rebuild(this.enemies);
    this.updateEnemies(dt);
    for (const spell of this.progression.spells.values()) spell.update(dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateBeams(dt);
    this.updatePickups(dt);
    this.updateFx(dt);

    const manaRegen = this.stats.flat('manaRegen');
    if (manaRegen) this.gainXp((this.xpNeeded * manaRegen * dt) / 100, false);

    this.enemies = compact(this.enemies);
    this.projectiles = compact(this.projectiles);
    this.zones = compact(this.zones);
    this.beams = compact(this.beams);
    this.pickups = compact(this.pickups);
  }

  /** Run `fn` after `delay` seconds of game time. */
  after(delay: number, fn: () => void) {
    this.timers.push({ t: delay, fn });
  }

  // ---- enemies -------------------------------------------------------------

  private updateEnemies(dt: number) {
    const p = this.player;
    const slow = 1 - clamp(this.buffs.enemySlow, 0, 0.8);
    const speedMult = this.stats.mult('enemySpeed', -80) * slow;
    const farLimit = (this.viewR * 2.1) ** 2;

    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash -= dt;
      e.touchT -= dt;
      e.wobble += dt;

      let dx = p.x - e.x;
      let dy = p.y - e.y;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2) || 1;
      dx /= d;
      dy /= d;

      // Stragglers left far behind re-enter from the edge of the screen.
      if (d2 > farLimit && e.kind !== 'boss') {
        const a = Math.atan2(p.mvy, p.mvx) + rand(-1.2, 1.2);
        e.x = p.x + Math.cos(a) * (this.viewR + 40);
        e.y = p.y + Math.sin(a) * (this.viewR + 40);
        continue;
      }

      if (e.frozen > 0) {
        e.frozen -= dt;
      } else {
        let sp = e.speed * speedMult;
        // Rushers (trait 2) alternate between creeping and dashing.
        if (e.def.traits.includes(2)) {
          e.dashT -= dt;
          if (e.dashT < -0.9) e.dashT = rand(1.6, 2.6);
          sp *= e.dashT < 0 ? 2.4 : 0.55;
        }
        e.x += dx * sp * dt;
        e.y += dy * sp * dt;
      }

      if (e.kx || e.ky) {
        e.x += e.kx * dt;
        e.y += e.ky * dt;
        const k = Math.exp(-8 * dt);
        e.kx *= k;
        e.ky *= k;
        if (Math.abs(e.kx) + Math.abs(e.ky) < 2) e.kx = e.ky = 0;
      }

      // Contact with the player.
      const reach = e.r + p.r;
      if (d < reach && !p.cloaked) {
        e.x = p.x - dx * reach;
        e.y = p.y - dy * reach;
        if (e.touchT <= 0 && e.frozen <= 0) {
          e.touchT = 0.8;
          p.takeDamage(e.atk);
        }
      }
    }

    // Soft separation so enemies form a crowd instead of a single stack.
    for (const e of this.enemies) {
      if (e.dead || e.kind === 'boss') continue;
      this.grid.query(e.x, e.y, e.r * 0.6, (o) => {
        if (o === e || o.dead) return;
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const overlap = (e.r + o.r) * 0.8 - d;
        if (overlap > 0) {
          const push = Math.min(overlap, 60 * dt) * (o.kind === 'boss' ? 1 : 0.5);
          e.x += (dx / d) * push;
          e.y += (dy / d) * push;
        }
      });
    }
  }

  /** Deal damage to an enemy. All player damage goes through here. */
  hit(e: Enemy, dmg: number, src: string, canCrit = true) {
    if (e.dead || dmg <= 0) return;
    const s = this.stats;
    let d = dmg;
    if (e.melt) d *= 1 + e.melt / 100;
    const guillotine = s.flat('guillotine');
    if (guillotine && e.hp >= e.maxHp * 0.75) d *= 1 + guillotine / 100;
    let crit = false;
    if (canCrit && chance(GAME.baseCrit + s.flat('crit') + s.flat(`${src}.crit`))) {
      crit = true;
      d *= (GAME.baseCritMult + s.flat('critMult')) / 100;
    }

    e.hp -= d;
    e.flash = 0.09;
    this.damageBy.set(src, (this.damageBy.get(src) ?? 0) + Math.min(d, e.hp + d));

    if (this.textBudget > 0 && (crit || Math.random() < 0.35)) {
      this.textBudget--;
      this.fx.push({ kind: 'text', x: e.x + rand(-6, 6), y: e.y - e.r, r: crit ? 15 : 11, life: 0.55,
                     maxLife: 0.55, color: crit ? '#ffd23c' : '#ffffff', text: String(Math.round(d)) });
    }

    const execute = s.flat('execute');
    if (execute && e.kind !== 'boss' && e.hp > 0 && e.hp < (e.maxHp * execute) / 100) e.hp = 0;
    if (e.hp <= 0) this.kill(e);
  }

  /** Apply freeze / stun, respecting the enemy's status resistance. */
  freeze(e: Enemy, seconds: number) {
    const t = seconds * this.stats.mult('freezeDur') * (1 - e.def.resist / 100);
    if (t > e.frozen) e.frozen = t;
  }

  kill(e: Enemy) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    this.burst(e.x, e.y, e.r * 1.3, '#11151a', 0.35);

    if (e.kind === 'boss') {
      for (let i = 0; i < 24; i++) this.drop('mana', e.x + rand(-70, 70), e.y + rand(-70, 70), e.def.mana / 24);
      this.drop('chest', e.x, e.y, 1);
      this.shake = 10;
    } else {
      this.drop('mana', e.x, e.y, e.def.mana);
      if (e.kind === 'elite') this.drop('chest', e.x, e.y, 1);
      else if (chance(GAME.lifeOrbChance)) this.drop('life', e.x + 10, e.y, 1);
      else if (chance(0.12)) this.drop('magnet', e.x + 10, e.y, 1);
    }

    if (this.kills >= this.nextChestAt) {
      this.drop('chest', e.x, e.y, 1);
      this.chestIndex++;
      this.nextChestAt = GAME.chestKills[this.chestIndex] ?? this.nextChestAt + GAME.chestEvery;
    }

    const boom = this.stats.flat('killExplode');
    if (boom && chance(boom)) {
      const { x, y } = e;
      this.after(0.05, () => this.explode(x, y, 70, this.atk * 0.75, 'artifact', '#ffb347'));
    }
    this.player.onKill();
  }

  /** Instant area damage. */
  explode(x: number, y: number, r: number, dmg: number, src: string, color: string, opts: ExplodeOpts = {}) {
    if (!opts.quiet) {
      this.ring(x, y, r, color, 0.3);
      this.burst(x, y, r * 0.8, color, 0.22);
    }
    this.grid.query(x, y, r, (e) => {
      if (e.dead) return;
      if (opts.freeze) this.freeze(e, opts.freeze);
      if (opts.knockback && e.kind !== 'boss') {
        const d = Math.hypot(e.x - x, e.y - y) || 1;
        e.kx += ((e.x - x) / d) * opts.knockback;
        e.ky += ((e.y - y) / d) * opts.knockback;
      }
      this.hit(e, dmg, src);
    });
  }

  /** Nearest live enemy to a point within `maxR`, optionally skipping some. */
  nearest(x: number, y: number, maxR = this.viewR, skip?: Set<Enemy>): Enemy | null {
    let best: Enemy | null = null;
    let bestD = maxR * maxR;
    for (const e of this.enemies) {
      if (e.dead || skip?.has(e)) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** A random live enemy within `maxR` of the player. */
  randomEnemy(maxR = this.viewR * 0.8): Enemy | null {
    const p = this.player;
    const r2 = maxR * maxR;
    let found: Enemy | null = null;
    let n = 0;
    for (const e of this.enemies) {
      if (e.dead || dist2(p.x, p.y, e.x, e.y) > r2) continue;
      // Reservoir sampling: uniform pick without building a list.
      if (Math.random() * ++n < 1) found = e;
    }
    return found;
  }

  /** A random point near the player, biased towards enemies when there are any. */
  randomTarget(maxR = this.viewR * 0.7): { x: number; y: number } {
    const e = this.randomEnemy(maxR);
    if (e) return { x: e.x, y: e.y };
    const a = rand(0, TAU);
    const d = rand(60, maxR);
    return { x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d };
  }

  // ---- projectiles / zones / beams ----------------------------------------

  spawnProjectile(p: Partial<Projectile> & Pick<Projectile, 'x' | 'y' | 'vx' | 'vy' | 'dmg' | 'src'>): Projectile {
    const proj: Projectile = {
      r: 6, pierce: 0, life: 2, color: '#fff', style: 'bolt', hit: new Set(), dead: false, ...p,
    };
    this.projectiles.push(proj);
    return proj;
  }

  addZone(z: Partial<Zone> & Pick<Zone, 'x' | 'y' | 'r' | 'life' | 'dmg' | 'src'>): Zone {
    const zone: Zone = {
      interval: 0.5, t: 0, color: '#fff', style: 'pool', vx: 0, vy: 0, grow: 0, dead: false,
      maxLife: z.life, ...z,
    };
    this.zones.push(zone);
    return zone;
  }

  addBeam(b: Partial<Beam> & Pick<Beam, 'angle' | 'life' | 'dmg' | 'src'>): Beam {
    const beam: Beam = {
      x: this.player.x, y: this.player.y, len: 900, width: 12, interval: 0.2, t: 0, color: '#fff',
      spin: 0, dead: false, maxLife: b.life, ...b,
    };
    this.beams.push(beam);
    return beam;
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.update?.(p, dt, this);

      if (p.homing) {
        if (p.homing.dead) p.homing = this.nearest(p.x, p.y, 400);
        if (p.homing) {
          const sp = Math.hypot(p.vx, p.vy);
          const want = Math.atan2(p.homing.y - p.y, p.homing.x - p.x);
          let cur = Math.atan2(p.vy, p.vx);
          let diff = ((want - cur + Math.PI * 3) % TAU) - Math.PI;
          cur += clamp(diff, -9 * dt, 9 * dt);
          p.vx = Math.cos(cur) * sp;
          p.vy = Math.sin(cur) * sp;
        }
      }
      if (p.drag) {
        const k = Math.pow(p.drag, dt);
        p.vx *= k;
        p.vy *= k;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      const reach = p.halfWidth ?? p.r;
      // Wide projectiles collide as a line segment perpendicular to their travel.
      let ax = 0, ay = 0, bx = 0, by = 0;
      if (p.halfWidth) {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const nx = -p.vy / sp;
        const ny = p.vx / sp;
        ax = p.x + nx * p.halfWidth; ay = p.y + ny * p.halfWidth;
        bx = p.x - nx * p.halfWidth; by = p.y - ny * p.halfWidth;
      }

      this.grid.query(p.x, p.y, reach, (e) => {
        if (p.dead || e.dead) return;
        if (p.halfWidth && distToSegment2(e.x, e.y, ax, ay, bx, by) > (p.r + e.r) ** 2) return;
        if (p.rehit) {
          const key = `p:${p.src}`;
          if ((e.hitT[key] ?? 0) > this.time) return;
          e.hitT[key] = this.time + p.rehit;
        } else {
          if (p.hit.has(e)) return;
          p.hit.add(e);
        }
        if (p.freeze) this.freeze(e, p.freeze);
        if (p.knockback && e.kind !== 'boss') {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          e.kx += (p.vx / sp) * p.knockback;
          e.ky += (p.vy / sp) * p.knockback;
        }
        this.hit(e, p.dmg, p.src);
        p.onHit?.(e, p, this);
        if (!p.rehit && p.pierce-- <= 0) p.dead = true;
      });

      if (p.life <= 0) p.dead = true;
      if (p.dead) p.onEnd?.(p, this);
    }
  }

  private updateZones(dt: number) {
    const pl = this.player;
    for (const z of this.zones) {
      if (z.dead) continue;
      if (z.follow) {
        z.x = pl.x;
        z.y = pl.y;
      } else {
        z.x += z.vx * dt;
        z.y += z.vy * dt;
      }
      z.r = Math.max(4, z.r + z.grow * dt);
      z.life -= dt;
      z.t -= dt;
      if (z.t <= 0) {
        z.t += z.interval;
        z.onTick?.(z, this);
        this.grid.query(z.x, z.y, z.r, (e) => {
          if (e.dead) return;
          if (z.freeze) this.freeze(e, z.freeze);
          this.hit(e, z.dmg, z.src);
          z.onHit?.(e, z, this);
        });
      }
      if (z.life <= 0) z.dead = true;
    }
  }

  private updateBeams(dt: number) {
    const pl = this.player;
    for (const b of this.beams) {
      if (b.dead) continue;
      b.x = pl.x;
      b.y = pl.y;
      b.angle += b.spin * dt;
      b.life -= dt;
      b.t -= dt;
      if (b.t <= 0) {
        b.t += b.interval;
        const ex = b.x + Math.cos(b.angle) * b.len;
        const ey = b.y + Math.sin(b.angle) * b.len;
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (distToSegment2(e.x, e.y, b.x, b.y, ex, ey) <= (b.width + e.r) ** 2) this.hit(e, b.dmg, b.src);
        }
      }
      if (b.life <= 0) b.dead = true;
    }
  }

  // ---- pickups & XP --------------------------------------------------------

  drop(kind: PickupKind, x: number, y: number, value: number) {
    // Keep the orb count bounded: past the cap, fold new mana into an existing orb.
    if (kind === 'mana' && this.pickups.length > 450) {
      const other = this.pickups[Math.floor(Math.random() * this.pickups.length)];
      if (other.kind === 'mana' && !other.dead) {
        other.value += value;
        return;
      }
    }
    this.pickups.push({ kind, x, y, value, pulled: false, age: 0, dead: false });
  }

  private updatePickups(dt: number) {
    const p = this.player;
    const range = GAME.pickupRange * this.stats.mult('pickup');
    const range2 = range * range;
    for (const it of this.pickups) {
      if (it.dead) continue;
      it.age += dt;
      const d2 = dist2(p.x, p.y, it.x, it.y);
      if (!it.pulled && d2 < range2 && it.kind !== 'chest') it.pulled = true;
      if (it.pulled) {
        const d = Math.sqrt(d2) || 1;
        const sp = 420 + it.age * 200;
        it.x += ((p.x - it.x) / d) * sp * dt;
        it.y += ((p.y - it.y) / d) * sp * dt;
      }
      if (d2 < (p.r + 12) ** 2) {
        it.dead = true;
        this.collect(it);
      }
    }
  }

  private collect(it: Pickup) {
    const p = this.player;
    if (it.kind === 'mana') {
      this.gainXp(it.value);
      this.progression.onManaOrb();
    } else if (it.kind === 'life') {
      p.heal((p.maxHp * GAME.lifeOrbHeal * this.stats.mult('orbHeal')) / 100);
      this.ring(p.x, p.y, 40, '#7dff9a', 0.4);
    } else if (it.kind === 'chest') {
      this.pendingChests++;
    } else {
      for (const o of this.pickups) if (o.kind === 'mana') o.pulled = true;
      this.ring(p.x, p.y, this.viewR, '#9fd0ff', 0.6);
    }
  }

  gainXp(amount: number, scaled = true) {
    this.xp += scaled ? amount * this.stats.mult('mana') * this.buffs.manaMult : amount;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      this.pendingLevelUps++;
    }
  }

  // ---- visual effects ------------------------------------------------------

  ring(x: number, y: number, r: number, color: string, life = 0.3) {
    this.fx.push({ kind: 'ring', x, y, r, life, maxLife: life, color });
  }

  burst(x: number, y: number, r: number, color: string, life = 0.25) {
    this.fx.push({ kind: 'burst', x, y, r, life, maxLife: life, color });
  }

  /** Telegraph circle that fills up over `life` seconds. */
  mark(x: number, y: number, r: number, color: string, life: number) {
    this.fx.push({ kind: 'mark', x, y, r, life, maxLife: life, color });
  }

  lightning(x1: number, y1: number, x2: number, y2: number, color: string, life = 0.18, width = 3) {
    const pts = [x1, y1];
    const segs = Math.max(3, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 28));
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      pts.push(x1 + (x2 - x1) * t + rand(-12, 12), y1 + (y2 - y1) * t + rand(-12, 12));
    }
    pts.push(x2, y2);
    this.fx.push({ kind: 'lightning', x: x1, y: y1, r: width, life, maxLife: life, color, pts });
  }

  private updateFx(dt: number) {
    for (const f of this.fx) {
      f.life -= dt;
      if (f.kind === 'text') f.y -= 34 * dt;
    }
    if (this.fx.length > 0 && this.fx.some((f) => f.life <= 0)) this.fx = this.fx.filter((f) => f.life > 0);
    if (this.fx.length > 500) this.fx.splice(0, this.fx.length - 500);
  }
}

/** Remove dead entries in place-ish (returns the same array when nothing died). */
function compact<T extends { dead: boolean }>(arr: T[]): T[] {
  let j = 0;
  for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
  arr.length = j;
  return arr;
}
