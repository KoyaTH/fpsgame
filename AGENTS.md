# Repository Guidelines

## Project Structure & Module Organization

This is a small browser-based free-for-all FPS. The Node/Socket.IO server lives
in `server.js`; it serves `public/` and owns the authoritative match state,
players, spawning, damage, and voting. Client files are deliberately plain
JavaScript (no bundler):

- `public/index.html` loads the UI and external browser libraries.
- `public/game.js` handles Three.js rendering, input, HUD, and socket events.
- `public/constants.js` defines client weapon metadata and selectable loadouts.
- `public/maps.js` builds client map geometry and collision obstacles.
- `public/style.css` contains all visual styling.

Keep shared gameplay values aligned between `server.js` and the corresponding
client files. For example, a weapon added to `WEAPONS` must be valid on both
server and client, and a map ID needs server spawn data plus a client builder.

### Critical Server/Client Sync Points

The following data must stay in sync between `server.js` and the client:

- **Weapons** (`WEAPONS`): server holds authoritative damage/ammo/fireRate;
  `public/constants.js` holds visual metadata (colors, barrelLength). Adding a
  weapon requires updating both files plus `WEAPON_CHOICES` in
  `public/constants.js` and the loadout picker in `public/index.html`.
- **Maps** (`MAPS`): `server.js` defines spawn points; `public/maps.js` builds
  the geometry and collision obstacles. A new map needs server spawn data plus
  a client builder function. The server loads `public/maps.js` directly at
  startup (`lib/mapObstacles.js`) to get the same AABBs and moves any spawn
  that falls inside an obstacle to the nearest clear point — no generated
  file to keep in sync. `maps.js` may only use the THREE subset shimmed there.
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
