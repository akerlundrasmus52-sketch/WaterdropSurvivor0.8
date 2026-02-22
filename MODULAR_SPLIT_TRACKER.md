# game.js Modular Split — Tracking Document

Use this to resume work if context/memory is lost. Just paste this issue link to any new Copilot chat session:
> "Continue the game.js modular split for timmiee/0.2-NewVersion-Waterdrop-. See MODULAR_SPLIT_TRACKER.md in the repo root."

## Status

### Phase 1: Foundation (THIS PR)
- [x] Extract `js/state.js` — shared game state via `window.GameState`
- [x] Extract `js/utils.js` — utility functions via `window.GameUtils`
- [x] Extract `js/audio.js` — audio system via `window.GameAudio`
- [x] Update `index.html` script loading order
- [x] Update all references in `game.js`

### Phase 2: Game Systems (Next PR)
- [x] Extract `js/weapons.js` — weapon definitions & logic via `window.GameWeapons`
- [x] Extract `js/enemies.js` — enemy types & AI via `window.GameEnemies`
- [x] Extract `js/combat.js` — damage, projectiles, hit detection via `window.GameCombat`
- [x] Extract `js/player.js` — player movement & stats via `window.GamePlayer`

### Phase 3: Environment & Glue (Final PR)
- [ ] Extract `js/world.js` — terrain, environment via `window.GameWorld`
- [ ] Extract `js/ui.js` — HUD, menus, modals via `window.GameUI`
- [ ] Extract `js/renderer.js` — Three.js scene setup via `window.GameRenderer`
- [ ] Rename remaining `game.js` → `main.js` (init & game loop only)
- [ ] Final cleanup and verification

## Architecture Pattern
- NO ES modules / import / export (browser `<script>` tag loading)
- Global namespace pattern: `window.GameState`, `window.GameUtils`, etc.
- Scripts loaded in dependency order in index.html
- Each module can reference other modules via their global namespace

## Phase 1 Implementation Notes

### `js/audio.js` (~395 lines)
Extracted: all Web Audio API code — `audioCtx`, `initMusic`, `updateBackgroundMusic`, `playSound`, `droneOscillator`/`droneGain`, `startDroneHum`, `stopDroneHum`. Exposes `window.GameAudio`. References `window.gameSettings.soundEnabled` (game.js exposes `gameSettings` on `window` after defining it).

### `js/utils.js` (~50 lines)
Extracted: pure utility functions — `getRarityColor`, `getChestTierForCombo`, `getAccountLevelXPRequired`, `KILL_CAM_CONSTANTS`, `getRandomKillMessage`. Exposes `window.GameUtils`.

### `js/state.js` (~10 lines)
Initialises `window.GameState = {}` as a namespace placeholder. Actual state variables remain in `game.js` module scope due to THREE.js dependencies and complex mutable-reference semantics; incremental property migration planned for Phase 2+.

### `js/game.js` changes
- Destructured aliases added at top so all existing call sites continue to work unchanged:
  ```js
  const { playSound, initMusic, updateBackgroundMusic, startDroneHum, stopDroneHum } = window.GameAudio;
  const audioCtx = window.GameAudio.audioCtx;
  const { getRarityColor, getChestTierForCombo, getAccountLevelXPRequired, KILL_CAM_CONSTANTS, getRandomKillMessage } = window.GameUtils;
  ```
- `window.gameSettings = gameSettings;` added after gameSettings is defined so audio.js can read `soundEnabled`.
- ~430 lines removed from game.js (audio section + utility functions).

## Phase 2 Implementation Notes

### `js/weapons.js` (~35 lines)
Extracted: `getDefaultWeapons()` factory (returns fresh mutable weapons-state object), `WEAPON_UPGRADES`
config table. Exposes `window.GameWeapons`. In game.js: `const weapons = getDefaultWeapons()` replaces
the inline object literal; `const UPGRADES = WEAPON_UPGRADES` replaces its inline definition.

### `js/enemies.js` (~80 lines)
Extracted: `ENEMY_TYPES` constants (type-index map for all 11 enemy types) and `getEnemyBaseStats()`
factory that returns the per-type HP/speed/flags/damage object. Exposes `window.GameEnemies`.
In game.js: `Object.assign(this, getEnemyBaseStats(...))` in the Enemy constructor replaces the
50-line if-else stat block. THREE.js geometry/mesh creation remains in game.js due to renderer deps.

### `js/combat.js` (~35 lines)
Extracted: `calculateArmorReduction(amount, armorPercent)` (used by Player.takeDamage) and
`calculateEnemyArmorReduction(amount, armorFraction)` (used by Enemy.takeDamage for MiniBoss armor).
Exposes `window.GameCombat`. All combat execution logic (projectiles, hit loops) remains in game.js
due to deep THREE.js / scene-graph dependencies.

### `js/player.js` (~55 lines)
Extracted: `getDefaultPlayerStats(baseExpReq)` factory that returns the full mutable playerStats
object for a new run. Exposes `window.GamePlayer`. In game.js: `const playerStats = getDefaultPlayerStats(GAME_CONFIG.baseExpReq)` replaces the 42-line inline object literal.
The Player class (THREE.js mesh creation, movement, input) remains in game.js.

### `js/game.js` changes
- Destructured aliases added:
  ```js
  const { getDefaultWeapons, WEAPON_UPGRADES } = window.GameWeapons;
  const { ENEMY_TYPES, getEnemyBaseStats } = window.GameEnemies;
  const { calculateArmorReduction, calculateEnemyArmorReduction } = window.GameCombat;
  const { getDefaultPlayerStats } = window.GamePlayer;
  ```
- ~60 lines removed (playerStats object, weapons object, UPGRADES object, Enemy stat block).
