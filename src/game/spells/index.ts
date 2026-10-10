/** Spell registry: maps the `key` from tuning.ts to its implementation. */
import { Armageddon } from './arma';
import { Blizzard } from './blizzard';
import { MagicBolt } from './bolt';
import { MagicCircle } from './circle';
import { Cloaking } from './cloak';
import { Cyclone } from './cyclone';
import { EnergyBolt } from './ebolt';
import { Fireball } from './fireball';
import { FlashShock } from './flash';
import { Incineration } from './incin';
import { LavaZone } from './lava';
import { Meteor } from './meteor';
import { FrostNova } from './nova';
import { ArcaneRay } from './ray';
import { Satellite } from './satellite';
import { Shield } from './shield';
import { ElectricShock } from './shock';
import type { SpellClass } from './spell';
import { Spirit } from './spirit';
import { Thunderstorm } from './thunder';
import { Tsunami } from './tsunami';
import { ElectricZone } from './zone';

export const SPELL_CLASSES: Record<string, SpellClass> = {
  bolt: MagicBolt,
  fireball: Fireball,
  spirit: Spirit,
  satellite: Satellite,
  nova: FrostNova,
  shield: Shield,
  thunder: Thunderstorm,
  zone: ElectricZone,
  tsunami: Tsunami,
  meteor: Meteor,
  cloak: Cloaking,
  cyclone: Cyclone,
  shock: ElectricShock,
  arma: Armageddon,
  incin: Incineration,
  ebolt: EnergyBolt,
  blizzard: Blizzard,
  ray: ArcaneRay,
  circle: MagicCircle,
  lava: LavaZone,
  flash: FlashShock,
};
