# Repository Guidelines

## Project Structure & Module Organization

This is a small browser-based free-for-all FPS. The Node/Socket.IO server lives
in `server.js`; it serves `public/` and owns the authoritative match state,
players, spawning, damage, and voting. Client files are deliberately plain
JavaScript (no bundler):

- `public/index.html` loads the UI and external browser libraries.
- `public/constants.js` defines client weapon metadata (spread, recoil, stats),
  selectable loadouts (`WEAPON_CHOICES`) and `MAP_INFO`.
- `public/maps.js` builds client map geometry and collision obstacles.
- `public/textures.js` procedural canvas textures (`userData.surface`) and sky.
- `public/weapons.js` 3D weapon models plus rendered preview images of weapons
  and maps (loadout cards, hotbar, killfeed, vote screen).
- `public/characterOptions.js` customization palettes/options, defaults and
  `sanitizeCharacter`; shared: loaded as a script and `require`d by the server.
- `public/character.js` third-person player model (merged vertex-colored
  segments, cached one-mesh weapons), two-bone arm IK onto each weapon's grip
  and support points, all remote animations and the customization 3D preview.
- `public/audio.js` synthesized sounds; `public/effects.js` pooled particles,
  decals, tracers, muzzle flashes and corpses.
- `public/ui.js` DOM-only HUD/menus; `public/game.js` rendering, movement
  (bhop/slide/crouch), grapple rope physics, shooting and socket events.
- `public/style.css` contains all visual styling.

Scripts are classic (not modules) and share one global scope, loaded in the
order listed in `index.html`: never declare the same top-level name twice.

Keep shared gameplay values aligned between `server.js` and the corresponding
client files. For example, a weapon added to `WEAPONS` must be valid on both
server and client, and a map ID needs server spawn data plus a client builder.

### Critical Server/Client Sync Points

The following data must stay in sync between `server.js` and the client:

- **Weapons** (`WEAPONS`): server holds authoritative damage/ammo/fireRate;
  `public/constants.js` repeats ammo/fireRate/reload/pellets and adds feel
  (spread, recoil, ADS FOV, moveSpeed, stats). Adding a weapon requires both
  files, `LOADOUT_CHOICES` (server) / `WEAPON_CHOICES` (client), a model case in
  `buildWeaponModel` and a sound profile in `SHOT_PROFILES`.
- **Character**: `join` sends `character`; `changeCharacter` (throttled to 1/s)
  is rebroadcast as `playerCharacter`; `publicPlayer` includes `character`.
  New options go in `characterOptions.js` plus a case in `character.js`
  (`headBoxes`/`torsoBoxes`). Reloads are rebroadcast as `playerReload`
  `{ id, weaponKey, duration }` so others see the animation. Hold poses per
  weapon class live in `HOLD_POSES`; a new weapon may need a `WEAPON_GRIPS` entry.
- **Shots**: `shoot` sends `{ hits: [{ id, head }], ends: [{ x, y, z }] }`,
  one entry per pellet (max `pellets`); the server sums damage per target.
- **Maps** (`MAPS`): `server.js` defines spawn points; `public/maps.js` builds
  the geometry and collision obstacles. A new map needs server spawn data plus
  a client builder function. The server loads `public/maps.js` directly at
  startup (`lib/mapObstacles.js`) to get the same AABBs and moves any spawn
  that falls inside an obstacle to the nearest clear point — no generated
  file to keep in sync. `maps.js` may only use the THREE subset shimmed there.
  On the client, `loadMap` merges static map meshes that share a material into
  one batch (`batchStaticMeshes` in `game.js`); originals leave the scene but
  stay in `obstacles` for collision/raycast. Mark a mesh that animates with
  `userData.noBatch = true`.
- **Network timing**: the server sends `state` snapshots at 60Hz from a
  drift-corrected loop (`snapshotLoop`); clients send `move` at 60Hz. The
  client measures the real snapshot interval/jitter and adapts its
  interpolation delay (`net.interpDelay`, 40–150 ms), so changing the server
  rate needs no client change. Ping uses the `latency` event with an ack.
  Rates come from env vars `STATE_HZ` / `MOVE_HZ` (10–60, default 60); the
  move rate reaches the client in `init.net.moveHz`. The shooter's hitmarker,
  hit sound and blood are shown locally on fire (`predictHitFeedback`);
  `playerDamaged` then only adds the damage number for that hit.
- **Graphics settings**: `userSettings.graphics` (presets in `GFX_PRESETS`,
  applied by `applyGraphicsSettings`). Anti-aliasing recreates the renderer;
  effects quality lives in `effects.js` (`setEffectsQuality`).
- **Eye height**: `EYE_HEIGHT` in `server.js` must match `PLAYER_HEIGHT` in
  `public/game.js`.
- **Respawn sequence**: every spawn bumps `spawnSeq`; the client sends it with
  `move` and the server drops packets from an older life.
- **Regen timing**: `REGEN_DELAY_MS` / `REGEN_PER_SECOND` in `server.js` must
  match the client-side health regen logic in `public/game.js`.

## Game State Machine

The match cycles through states: `waiting` → `playing` → `ended` → `voting` →
`playing` (loop). The server owns this state in the `game` object. Client code
should react to the corresponding socket events (`matchStarted`, `matchTime`,
`matchEnded`, `voteStart`) rather than tracking its own authoritative state.

## Socket Event Conventions

Event names are short, camelCase, and consistent on both sides (e.g.
`joinGame`, `playerMove`, `playerShoot`, `playerDamage`, `respawned`,
`loadoutChanged`, `vote`). When adding a new event, define the payload shape
once and reuse it on both server and client.

## Build, Test, and Development Commands

Install dependencies with `npm install`. Start the local server with
`npm start`, then open the URL printed by Node (normally `http://localhost:3000`).
Use two browser windows or profiles to exercise multiplayer behavior.

There is no build step, test runner, linter, or formatter configured. Do not
commit `node_modules/`; `package-lock.json` should accompany dependency changes.

## Coding Style & Naming Conventions

Use 2-space indentation, semicolons, single-quoted strings, and `const` by
default; use `let` only for reassigned values. Match the existing camelCase
style for variables/functions (`randomSpawn`, `myLoadout`) and UPPER_SNAKE_CASE
for fixed configuration (`MATCH_DURATION`, `WEAPONS`). Keep socket event names
short and consistent between both sides (for example, `joinGame`).

Prefer small helper functions for rendering or game rules. Preserve the section
comments in the larger JavaScript files so gameplay code remains navigable.

**Language**: UI strings, comments, and user-facing text are written in
Portuguese (pt-BR). Keep new UI text and comments in Portuguese to match.

## Testing Guidelines

Validate changes manually: join two clients, select each relevant loadout, test
movement/collision, firing/reload/damage, respawn, and map voting as applicable.
Watch the server terminal and browser console for errors. If automated tests are
introduced, add a package script and keep test files next to the behavior or in
`test/`, using descriptive names such as `weapons.test.js`.

## Commit & Pull Request Guidelines

This checkout has no accessible Git history, so no repository-specific commit
format can be inferred. Use concise imperative subjects, such as
`Add desert map spawn validation`. Keep commits focused. Pull requests should
explain gameplay impact, list manual checks performed, link related issues, and
include screenshots or a short recording for visual/UI changes.
