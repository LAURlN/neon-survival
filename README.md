# Neon Survival

An unofficial, from-scratch browser remake of the mobile game *Magic Survival* with a cyberpunk skin,
playable on a phone.

**Play:** https://laurln.github.io/neon-survival/

Drag anywhere to move (or WASD / arrow keys). Programs fire on their own. Collect data shards to level up
and install new programs; open data caches for cyberware. `Esc` / `P` pauses, `♪` mutes.

> Fan project, not affiliated with or endorsed by the original developer. It contains **no assets from
> the original game**: all graphics are drawn procedurally, all sound is synthesised at runtime and all
> text is generated. Only numeric
> balance data and short names are derived from the original's data tables.

## What is in it

| | Count | Source |
|---|---|---|
| Active spells | 21 (all) | level-by-level upgrades from the original tables; base values hand-tuned |
| Spell traits | 61 of 66 | effects from the original tables; behaviour re-implemented |
| Passives | 9 of 10 | original tables |
| Artifacts | 76 of 182 | original tables (those made only of effects we implement) |
| Enemies | 29 | HP / ATK / speed / mana from the original tables |
| XP curve | 128 levels | original table |

Not implemented yet: classes, magic combinations (fusions), synergies, research, zones, the 5 remaining
traits, meta-progression.

## Development

```bash
npm install
npm run dev      # dev server, also reachable from a phone on the same network
npm run build    # typecheck + production build into dist/
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

`window.game` is exposed in the browser console for poking at a live run.

## How it is put together

```
src/
  data/
    game-data.json   numbers distilled from the original's tables (generated, do not edit)
    tuning.ts        everything hand-tuned: base spell stats, waves, drop rates
    theme.ts         the cyberpunk skin: display names, card text, colours, vocabulary
  engine/            input (virtual joystick), audio (WebAudio synth), spatial grid, math helpers
  game/
    effects.ts       effect id -> stat key table
    stats.ts         StatSheet: folds [effectId, value] pairs into flat / pct / mul buckets
    content.ts       typed view of the data + "is this upgrade playable" rule
    game.ts          world state, update loop, damage, projectiles / zones / beams, pickups
    director.ts      enemy spawning
    player.ts        movement, HP, shields, damage taken
    progression.ts   what the player owns and how level-up / chest offers are built
    spells/          one file per spell + registry (index.ts)
  render/renderer.ts all drawing (procedural, no image assets)
  ui/ui.ts           DOM HUD and overlay screens
```

The design mirrors the original's: **every upgrade is a list of `[effectId, value]` pairs**. A spell level,
a trait, a passive and an artifact are all the same thing as far as the code is concerned. Gameplay code
never inspects upgrades; it only reads stats such as `fireball.dmg` or `cd` from the `StatSheet`.

### Adding things

- **Unlock more artifacts / passives** - add the missing effect ids to `src/game/effects.ts`. An upgrade
  becomes available automatically once every effect id it uses is known. For effects that need behaviour
  (not just a number), read the stat where it matters, e.g. `stats.flat('execute')` in `Game.hit`.
- **Unlock a trait** - add its id and text to `TRAITS` in `tuning.ts` and handle `this.has(id)` in the
  spell's file.
- **Add a spell** - subclass `Spell` in `src/game/spells/`, register it in `spells/index.ts`, add its base
  stats to `SPELLS` in `tuning.ts` and its effect ids to `effects.ts`.
- **Balance** - `src/data/tuning.ts`.
- **Re-skin** - `src/data/theme.ts` holds every player-facing name and colour (code and data keep the
  original identifiers, e.g. the key `bolt` is shown as "Pulse Shot"); `src/style.css` styles the UI.
- **Sound** - add a case to `AudioEngine.play` in `src/engine/audio.ts` and call `game.sound('name')`.
  Spell cast sounds are mapped in `CAST_SFX` in `spells/spell.ts`. The music is the step sequencer in
  `scheduleStep`.
- **New enemy look or effect** - `src/render/renderer.ts`.

## Reverse-engineering notes

The original is a Unity (2022.3) IL2CPP build. The pipeline in `tools/` is:

1. Unpack the XAPK / APK (plain zip files).
2. `Il2CppDumper` on `libil2cpp.so` + `global-metadata.dat` gives class, field and method names
   (`tools/extract/split_dump.py` isolates the game's own assembly).
3. `tools/extract/survey.py` (UnityPy) dumps the `TextAsset`s. The balance data lives in CSV tables:
   `Dictionary_UnitStat`, `Dictionary_AllStat`, `*_Dictionary_Ability`, `..._Class`, `..._MagicCom`,
   `..._Synergy`.
4. `tools/extract/effects.py` infers what each effect id means by matching ids and values against the
   description text across all tables.
5. `tools/build-data.py <extracted text dir> src/data/game-data.json` distils the tables into the data
   file the game ships.

What that recovered: enemy stats, the XP curve, and for every spell / trait / passive / artifact the exact
`(effectId, value)` list. What it did not: base spell values (damage, cooldown at level 1) and the spawn
timeline are assigned in native code, so those are our own values in `tuning.ts`. Spell *behaviour* is
re-implemented from the names of the fields and coroutines plus the in-game descriptions.

The original APK and anything extracted from it are deliberately git-ignored and are not part of this
repository.
