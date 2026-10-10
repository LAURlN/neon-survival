import { dist2 } from '../../engine/math';
import { Spell } from './spell';

/** Wipes the field. Traits: Apocalypse (weaker reinforcements), Rapture (heal), Doom Prophet. */
export class Armageddon extends Spell {
  private casts = 0;

  constructor(...args: ConstructorParameters<typeof Spell>) {
    super(...args);
    // Doom Prophet: every mana orb shaves 1% off the remaining cooldown.
    this.g.progression.manaOrbHooks.push(() => {
      if (this.has(481)) this.timer *= 0.99;
    });
  }

  update(dt: number) {
    // Apocalypse's HP reduction fades back to zero over 20 seconds.
    const b = this.g.buffs;
    if (b.enemyHpCut > 0) b.enemyHpCut = Math.max(0, b.enemyHpCut - (0.4 / 20) * dt);
    super.update(dt);
  }

  protected cast() {
    const { g } = this;
    const p = g.player;
    if (g.enemies.length === 0) return false;
    const reach = (g.viewR * 1.2) ** 2;
    g.ring(p.x, p.y, g.viewR, this.color, 0.7);
    g.burst(p.x, p.y, g.viewR, '#ffffff', 0.35);
    g.shake = 12;
    for (const e of g.enemies) {
      if (e.dead || dist2(p.x, p.y, e.x, e.y) > reach) continue;
      if (e.kind === 'boss') g.hit(e, (e.maxHp * this.base('bossDmg')) / 100, this.key, false);
      else g.hit(e, e.hp + 1, this.key, false);
    }
    if (this.has(479)) g.buffs.enemyHpCut = 0.4;
    if (this.has(480) && ++this.casts % 4 === 0) p.heal(p.maxHp);
  }
}
