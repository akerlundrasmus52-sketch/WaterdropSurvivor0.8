# Modular Split Tracker

This document tracks the extraction of code from `js/game.js` into separate module files.

## Extracted Modules

### `js/audio.js` (~379 lines extracted)
- **Type**: Regular `<script>` tag (no `import`/`export`)
- **Exposes**: `window.GameAudio`
- **Contents**:
  - `audioCtx` — Web Audio API context
  - `musicOscillators`, `musicGain`, `currentMusicLevel` — background music state
  - `initMusic()` — initialise music gain node
  - `updateBackgroundMusic()` — stop all background music (removed per requirements)
  - `playSound(type)` — all synthesized sound effects (shoot, hit, levelup, upgrade, waterdrop, multikill, splash, collect, coin, coinDrop, dash, sword, doublebarrel, meteor)
  - `droneOscillator`, `droneGain` — drone hum state
  - `startDroneHum()` — start continuous drone oscillator
  - `stopDroneHum()` — fade out and stop drone oscillator
- **Dependency note**: `playSound`/`startDroneHum` read `window.gameSettings.soundEnabled` (game.js exposes `gameSettings` on `window` after defining it).

### `js/utils.js` (~50 lines extracted)
- **Type**: Regular `<script>` tag
- **Exposes**: `window.GameUtils`
- **Contents**:
  - `getRarityColor(rarity)` — maps rarity tier to CSS hex colour string
  - `getChestTierForCombo(comboCount)` — returns chest tier name for a combo count
  - `getAccountLevelXPRequired(level)` — linear XP formula (level × 100)
  - `KILL_CAM_CONSTANTS` — constants object for kill-cam behaviour
  - `getRandomKillMessage()` — picks a random kill message string

### `js/state.js` (~10 lines)
- **Type**: Regular `<script>` tag
- **Exposes**: `window.GameState`
- **Contents**: Initialises `window.GameState = {}` as a namespace placeholder for future incremental state migration. Actual state variables remain in `game.js` (module scope) due to THREE.js dependencies and complex mutable-reference semantics.

## Changes to `js/game.js`
- Added destructured aliases at top (after `import * as THREE from 'three'`):
  ```js
  const { playSound, initMusic, updateBackgroundMusic, startDroneHum, stopDroneHum } = window.GameAudio;
  const audioCtx = window.GameAudio.audioCtx;
  const { getRarityColor, getChestTierForCombo, getAccountLevelXPRequired, KILL_CAM_CONSTANTS, getRandomKillMessage } = window.GameUtils;
  ```
- Added `window.gameSettings = gameSettings;` immediately after `gameSettings` is defined (~line 548).
- Removed ~380-line audio section (lines 42–420 of original).
- Removed `getRarityColor`, `getChestTierForCombo`, `getAccountLevelXPRequired`, `KILL_CAM_CONSTANTS`, and `getRandomKillMessage` from their original locations.

## Changes to `index.html`
Added three `<script>` tags before `<script type="module" src="js/game.js">`:
```html
<script src="js/state.js"></script>
<script src="js/utils.js"></script>
<script src="js/audio.js"></script>
```

## Line Count Summary
| File | Before | After | Delta |
|------|--------|-------|-------|
| `js/game.js` | 17 603 | ~17 194 | −409 |
| `js/audio.js` | — | ~280 | +280 |
| `js/utils.js` | — | ~50 | +50 |
| `js/state.js` | — | ~10 | +10 |

Net reduction in `game.js`: **409 lines (~2.3%)**.  
The audio and utility extractions represent the safest, self-contained sections. Further state extraction is deferred due to the complex mutable-reference problem with module-scoped variables that get reassigned during game resets.
