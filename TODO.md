# Water Drop Survivor — Development TODO / Roadmap

> This file exists so that any future AI session (Copilot Chat or Copilot Agent) can pick up
> where we left off, even after memory is cleared. READ THIS FIRST.

## Current State (as of March 2026)
- Game is a browser-based survivor/roguelike built with THREE.js
- Game currently WORKS after a rollback — but is messy
- `js/main.js` was 1.09MB and has been split into modules (this PR)
- The game uses global scope (no ES modules) — all functions/vars are on window

## 🧪 SANDBOX 2.0 — **MAIN PRODUCTION GAME**
**MANDATORY: Sandbox 2.0 is NOW the official game. DO NOT modify the old map.**

### What is Sandbox 2.0?
- **File**: `sandbox.html` — The main production game environment
- **Engine**: Engine 2.0 with PBR rendering (`js/engine2.js`)
- **Core Loop**: `js/sandbox-loop.js` — The primary game animation loop
- **Ground**: 200x200 arena with center spawn hole + mossy brick texture (WORKING ✅)
- **Systems**: Full gore/blood systems, settings UI, level-up modal with LVL UP cards
- **Purpose**: This is the LIVE GAME — all development happens here

### Why Sandbox 2.0?
1. **Production-ready** — Fully optimized with 120 FPS target
2. **Engine 2.0 features** — PBR ground, spawn animations, modern rendering
3. **Complete game loop** — Wave spawning, boss encounters, quest integration
4. **Strict performance** — Object pooling, InstancedMesh rendering, zero GC spikes

### Performance Standards
✅ **Object Pooling Enforced**: All entities use pre-allocated pools
✅ **InstancedMesh Rendering**: Blood, particles, repeated geometry
✅ **120 FPS Target**: 8.33ms frame budget maintained
✅ **Zero GC Spikes**: No `new` allocations during gameplay

### CRITICAL RULES FOR ALL FUTURE AI AGENTS
1. **Work only on the live Sandbox 2.0 game**: `sandbox.html` is the production entry point, and edits may include any scripts/systems it uses (for example `js/sandbox-loop.js`, `js/engine2.js`, quest/level-up/UI systems, boss systems, and other scripts loaded by `sandbox.html`)
2. **NEVER touch deprecated old-map files**: `index.html`, `world-gen.js`, `game-loop.js` and other old-map-only files are DEPRECATED unless a task explicitly says otherwise
3. **Maintain object pooling**: Pre-allocate all objects, reuse from pools
4. **Preserve InstancedMesh**: All repeated geometry must use instanced rendering
5. **Test performance**: Run performance audits, maintain 120 FPS
6. **Keep UI theme**: Annunaki/occult style (cyan/purple/gold)

### Ground Texture Status
✅ **CONFIRMED WORKING** as of 2026-03-23:
- Texture file exists: `assets/textures/mossy_brick_diff_4k.jpg` (11MB, 4096x4096)
- Fallback chain working: Primary → `ground/color.jpg` → UUID fallback → procedural
- Engine 2.0 successfully loads and applies texture
- Console confirms: `[Engine2] ✓ Successfully loaded: assets/textures/mossy_brick_diff_4k.jpg`
- Material configured with 20x20 repeat, anisotropic filtering, sRGB color space

### Features from PR #725 (Merged)
✅ Settings modal structure with Camp-themed UI
✅ gore-simulator.js script loading (fixed missing script)
✅ Settings UI components: graphics mode, quality presets, particle effects toggle
✅ Blood/gore rendering: bullet holes, blood particles, gore chunks

### Sandbox 2.0 Landmarks (Engine 2.0)
✅ UFO crash site with glowing engine lights at position (-50, 25) — northwest area (IN SANDBOX 2.0 ✓)
✅ Companion egg near UFO (quest objective) (IN SANDBOX 2.0 ✓)
✅ Annunaki obelisk at position (25, -35) — southwest region with energy effects (IN SANDBOX 2.0 ✓)
✅ Lake with waterfall at position (30, -30) — southeast area (IN SANDBOX 2.0 ✓)

All landmarks above are NOW in Sandbox 2.0 via js/engine2.js with full animations in js/sandbox-loop.js

### World Features (Main Game - index.html)
These exist in the MAIN game (world-gen.js), NOT in Sandbox 2.0:
- ✅ Enhanced reflective lake with physics material
- ✅ Pyramid structures
- ✅ Ancient ruins and decorative props

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
