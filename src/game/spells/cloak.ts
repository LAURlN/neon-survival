import { Spell } from './spell';

/** Briefly untouchable and faster. Traits: Space Warp (explosion at the end), Soul Harvest. */
export class Cloaking extends Spell {
  private active = 0;

  update(dt: number) {
    if (this.active > 0 && (this.active -= dt) <= 0) this.end();
    super.update(dt);
  }

  protected cast() {
    const { g } = this;
    const p = g.player;
    this.active = this.dur();
    p.cloaked = true;
    p.speedBuff += this.base('speed');
    g.ring(p.x, p.y, 40, this.color, 0.35);
    if (this.has(454)) {
      g.buffs.manaMult = 1.33;
      p.onKillHook = () => p.heal(p.maxHp * 0.001);
    }
  }

  private end() {
    const { g } = this;
    const p = g.player;
    p.cloaked = false;
    p.speedBuff -= this.base('speed');
    p.invuln = Math.max(p.invuln, 0.3);
    p.onKillHook = null;
    g.buffs.manaMult = 1;
    if (this.has(453)) {
      g.explode(p.x, p.y, this.size(), this.dmg(), this.key, this.color, { knockback: 200 });
    }
  }
}
