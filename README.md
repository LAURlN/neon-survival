# Neon Survival

A browser survival game, playable on a phone, where you do not pick weapons - you **wire them**. Energy
sparks run across a circuit board you build during the run, and whatever reaches an emitter is fired as a
weapon.

**Play:** https://laurln.github.io/neon-survival/

Drag anywhere to move (or WASD / arrow keys). Level up to collect tiles, then tap `⌬` (or press `E`) to
open the circuit and place them. `Esc` / `P` pauses, `♪` mutes.

> Started as an unofficial fan remake of *Magic Survival* and still uses numeric balance data (enemies,
> XP curve, stat upgrades, cyberware) derived from that game's tables. It contains **no assets from it**:
> all graphics are drawn procedurally and all sound is synthesised at runtime. Not affiliated with or
> endorsed by the original developer.

## The circuit

- **Reactors** throw sparks in a straight line, ten board cells per second. A spark flies until it enters a
  tile or leaves the board. The board has no edges.
- Tiles change the spark: route it (mirror, splitter, gates), make it stronger (amplifier, capacitor), or
  set one of its three properties.
- An **emitter** fires the spark. Its **shape** (arrow, beam, seeker, bomb) and **type** (aimed, loose,
  orbit, sky, lock) pick one of 20 weapons; its **element** (fire, shock, cryo, acid) adds an effect to
  every hit; its energy is the damage.
- You own a limited number of each tile. Level-ups give basic tiles (and sometimes a stat upgrade); data
  caches give special tiles with stronger or unique behaviour, and cyberware.

| | Count | Where |
|---|---|---|
| Tiles | 46 (26 basic, 14 special, 6 legendary) | `src/data/tiles.ts` |
| Bosses | 4 attack patterns, one every 5 minutes, each drops a legendary cache | `src/game/boss.ts`, `BOSSES` in `tuning.ts` |
| Weapons | 20 (4 shapes × 5 types) | `src/data/weapons.ts`, `src/circuit/weapons.ts` |
| Elements | 4 | `src/circuit/weapons.ts` |
| Stat upgrades / cyberware | 9 / 53 | `game-data.json`, filtered by `src/game/effects.ts` |
| Enemies | 29 | `game-data.json` |

## Development

```bash
npm install
npm run dev      # dev server, also reachable from a phone on the same network
npm run build    # typecheck + production build into dist/
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

`window.game` is exposed in the browser console for poking at a live run, e.g.
`game.board.give('fusion')`.

`prototypes/` holds the five standalone build-system concepts this design was chosen from (open
`prototypes/index.html` through the dev server). They are not part of the build.

## How it is put together

```
src/
  data/
    tiles.ts         every circuit tile, as data
    weapons.ts       the shape × type weapon matrix: names and power
    tuning.ts        hand-tuned game values: player, waves, drop rates
    theme.ts         display names and vocabulary
    game-data.json   enemy stats, XP curve, upgrades, cyberware (generated, do not edit)
  circuit/
    spark.ts         what a spark is: energy + element, shape, type
    board.ts         the board simulation: tiles, inventory, sparks, one handler per tile behaviour
    weapons.ts       one function per weapon, plus what each element does on hit
  engine/            input (virtual joystick), audio (WebAudio synth), spatial grid, math helpers
  game/
    game.ts          world state, update loop, damage, projectiles / zones / beams, pickups
    director.ts      enemy spawning
    player.ts        movement, HP, damage taken
    boss.ts          boss attack patterns
    progression.ts   what level-ups and data caches offer
    effects.ts       effect id -> stat key table for upgrades and cyberware
    stats.ts         StatSheet: folds [effectId, value] pairs into flat / pct / mul buckets
    content.ts       typed view of game-data.json
  render/renderer.ts all world drawing (procedural, no image assets)
  ui/
    ui.ts            DOM HUD and overlay screens
    editor.ts        the circuit editor
```

The board knows nothing about the game world: it reads `sense` and `rate`, and reports each emission
through `fire`. Weapons know nothing about the board: they get a spark and call the helpers on `Game`
(`hit`, `explode`, `strikeLine`, `spawnProjectile`, `addZone`, `addBeam`, `after`, ...).

### Adding things

- **A tile that reuses a behaviour** (a stronger amplifier, a faster reactor, a 4-way splitter) - one
  entry in `src/data/tiles.ts`. `rarity` 0-1 drops from level-ups, 2+ from data caches.
- **A tile with a new behaviour** - add a name to `TileOp`, a `case` in `Board.enter` in
  `src/circuit/board.ts`, then the entry in `tiles.ts`.
- **A new condition for sensor gates** - add a field to `Board.sense`, set it in `Game.update`.
- **A new source trigger** (like "on kill") - call `board.trigger('...')` where it happens.
- **A weapon shape or type** - add it to the union in `spark.ts`, give it a row / column in
  `data/weapons.ts`, one function per new pair in `FIRE` in `circuit/weapons.ts`, and a setter tile.
- **An element** - add it to `spark.ts` (type, colour) and a case in `elementHook` in `circuit/weapons.ts`.
- **Balance** - weapon `power` in `data/weapons.ts`, tile numbers in `data/tiles.ts`, everything else in
  `data/tuning.ts` (`energyDamage` scales all circuit damage at once).
- **More cyberware** - add the missing effect ids to `src/game/effects.ts`; an item becomes available
  once every effect id it uses is known.
- **A boss pattern** - add it to `BossPattern` and `BOSSES` in `tuning.ts`, and a `case` in `updateBoss`.
- **Sound** - add a case to `AudioEngine.play` in `src/engine/audio.ts` and call `game.sound('name')`.

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

The game now only uses part of what that recovered: enemy stats, the XP curve, and the `(effectId, value)`
lists of the stat upgrades and cyberware. The spawn timeline and everything about the circuit are our own.

The original APK and anything extracted from it are deliberately git-ignored and are not part of this
repository.
