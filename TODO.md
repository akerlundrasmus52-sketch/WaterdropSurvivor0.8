# Water Drop Survivor — Development TODO / Roadmap

> This file exists so that any future AI session (Copilot Chat or Copilot Agent) can pick up
> where we left off, even after memory is cleared. READ THIS FIRST.

## Current State (as of March 2026)
- Game is a browser-based survivor/roguelike built with THREE.js
- Game currently WORKS after a rollback — but is messy
- `js/main.js` was 1.09MB and has been split into modules (this PR)
- The game uses global scope (no ES modules) — all functions/vars are on window

## ✅ COMPLETED
- [x] Split `js/main.js` into smaller organized module files
- [x] Move .md clutter files to `docs/` folder
- [x] Game works in current rollback state
- [x] **Fix THREE.js → Blood System load order**: Added early-return guard (`if (typeof THREE === 'undefined') return;`) in `blood-system.js` `init()` and a `typeof THREE !== 'undefined'` pre-check in the `BloodSystem.init()` call in `game-screens.js`. Load order verified: THREE.js CDN → scene creation → `BloodSystem.init()` in game init.
- [x] **Fix blood system efficiency**: Added safety guard to prevent init when THREE.js is unavailable. Existing `if (_scene) return;` guard prevents double-initialization. Ring-buffer and typed arrays already in use.
- [x] **Re-apply THREE.js read fix**: BloodSystem now checks `typeof THREE !== 'undefined'` before initializing, ensuring it only reads THREE after it is ready.
- [x] **Stop camp from auto-triggering on death**: Removed `CampWorld.enter()` call from `gameOver()`. Death screen now shows over the game scene; camp is only activated when player explicitly clicks "Go to Camp".
- [x] **Keep existing camp menus**: All menu-based camp functionality preserved. Only the auto-activation on death was removed.

## 🔥 HIGH PRIORITY — Fix Next
- [x] **Fix THREE.js → Blood System load order** — *(completed, see above)*
- [x] **Fix blood system efficiency** — *(completed, see above)*
- [x] **Re-apply THREE.js read fix** — *(completed, see above)*

## 🟡 MEDIUM PRIORITY — Camp System
- [x] **Stop camp from auto-triggering on death** — *(completed, see above)*
- [x] **Keep existing camp menus** — *(completed, see above)*
- [ ] **Prepare camp menus for real camp**: Eventually the menu-based camp will be replaced by a real interactive camp world (using camp-world.js). The menus should still be accessible from the real camp (e.g., clicking a building opens the menu). For now, keep menus as they are but make them modular enough to plug into the real camp later.
- [ ] **Camp-world.js integration**: `js/camp-world.js` (81KB) contains a 3D camp world. This needs to be connected as the actual camp experience, with buildings that open the existing menu screens.

## 🟢 LOWER PRIORITY — Future Features
- [ ] **Performance optimizations**: Continue lag reduction work that was in progress before rollback
- [ ] **CSS cleanup**: `css/styles.css` is 133KB — could be split or cleaned up
- [ ] **Animation improvements**: Player/enemy animations (currently simple shapes)
- [ ] **More enemy types and boss mechanics**
- [ ] **Deeper character building**: More skills, more gear, more progression

## 📁 File Structure Reference
```
index.html          — Main HTML shell + UI markup (~40KB)
css/styles.css      — All styles (~133KB)
js/
  main.js           — Was 1.09MB, now split into modules below (~22KB)
  player-class.js   — Player class (~51KB)
  enemy-class.js    — DroneTurret + Enemy classes (~117KB)
  projectile-classes.js — Projectile, SwordSlash, IceSpear, Meteor, ObjectPool, Particle (~65KB)
  gem-classes.js    — ExpGem, GoldCoin, Chest classes (~26KB)
  save-system.js    — Save/load, achievements, SSB events, gear (~83KB)
  camp-skill-system.js — Camp buildings, skill tree, training (~93KB)
  quest-system.js   — Quests, account, chat, companion, camp screen (~110KB)
  world-gen.js      — 3D world generation (createWorld) (~113KB)
  game-screens.js   — init(), menus, wave spawning, effects (~136KB)
  level-up-system.js — Level-up modal, upgrade cards (~44KB)
  game-hud.js       — HUD, minimap, combo, NPC dialogue (~48KB)
  game-over-reset.js — Game over screen, reset game (~37KB)
  input-system.js   — Input handling (~13KB)
  game-loop.js      — Main animate() loop, starts game (~98KB)
  blood-system.js   — Blood/gore effects (already separate)
  camp-world.js     — 3D camp world (already separate, 81KB)
  audio.js          — Sound system (already separate)
  rage-combat.js    — Rage combat system (already separate)
  ... other existing files
docs/               — Old summary/implementation .md files (moved from root)
```

## 🔧 Technical Notes
- No ES modules — everything is global scope via `<script>` tags
- THREE.js loaded from CDN (three.min.js, non-module build) in index.html
- Game state saved to localStorage
- Blood system depends on THREE.js being loaded first
- Camp system currently menu-based, will become 3D world later
- index.html loads scripts in dependency order — check this if things break
- All top-level `let`/`const`/`class` declarations in classic scripts share the global lexical environment, so they're accessible across script files
