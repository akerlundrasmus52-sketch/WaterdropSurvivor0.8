# 💧 Waterdrop Survivor

**Version 0.5.1 alpha playable**

A browser-based THREE.js survivor/roguelike game.

---

## 🎮 Project Overview

- **Waterdrop Survivor** — browser-based THREE.js survivor/roguelike game
- No ES modules — everything runs via `<script>` tags in `index.html` sharing global scope
- THREE.js loaded from CDN (v0.176.0)
- Game state saved to localStorage
- Player controls a blue water droplet fighting waves of enemies

---

## 🏗️ Architecture (After Code Split)

The original monolithic `main.js` (1.09MB) was split into ~15 smaller files to get each under GitHub's file size limit. The files load in this order in `index.html`:

**Pre-existing helper files (load first):**

```
THREE.js CDN → loading.js → debug.js → state.js → utils.js → audio.js
→ weapons.js → enemies.js → combat.js → player.js → world.js → ui.js
→ renderer.js → blood-system.js → spawn-sequence.js → camp-world.js
→ harvesting.js → rage-combat.js → ui-calibration.js → idle-*.js files
```

**Split game files (from old main.js), in load order:**

| File | Size | Contents |
|---|---|---|
| `js/main.js` | ~22KB | Game state variables, animation, pause, day/night |
| `js/player-class.js` | ~51KB | Player class |
| `js/enemy-class.js` | ~117KB | DroneTurret + Enemy classes |
| `js/projectile-classes.js` | ~65KB | Projectile, SwordSlash, IceSpear, Meteor, ObjectPool, Particle |
| `js/gem-classes.js` | ~26KB | ExpGem, GoldCoin, Chest |
| `js/save-system.js` | ~83KB | Save/load, achievements, gear |
| `js/camp-skill-system.js` | ~93KB | Camp buildings, skill tree, training |
| `js/quest-system.js` | ~110KB | Quests, account, chat, companion, camp screen |
| `js/world-gen.js` | ~113KB | 3D world generation |
| `js/game-screens.js` | ~136KB | `init()`, menus, wave spawning, effects |
| `js/level-up-system.js` | ~44KB | Level-up modal, upgrade cards |
| `js/game-hud.js` | ~48KB | HUD, minimap, combo counter, NPC dialogue |
| `js/game-over-reset.js` | ~37KB | Game over screen, `resetGame()` |
| `js/input-system.js` | ~13KB | Input handling (joystick, keyboard, gamepad) |
| `js/game-loop.js` | ~98KB | Main `animate()` loop, performance logging, FPS watchdog |

### 📁 Full File Structure

```
├── index.html                — Main HTML + script load order
├── TODO.md                   — Development roadmap
├── README.md                 — This file
├── css/                      — Stylesheets
├── docs/                     — Documentation
├── js/
│   ├── main.js               — Game state variables & module aliases
│   ├── player-class.js       — Player class
│   ├── enemy-class.js        — DroneTurret + Enemy classes
│   ├── projectile-classes.js — Projectiles
│   ├── gem-classes.js        — ExpGem, GoldCoin, Chest
│   ├── save-system.js        — Save/load, achievements, gear
│   ├── camp-skill-system.js  — Camp buildings, skill tree
│   ├── quest-system.js       — Quests, companion, camp screen
│   ├── world-gen.js          — 3D world generation
│   ├── game-screens.js       — init(), menus, wave spawning
│   ├── level-up-system.js    — Level-up modal
│   ├── game-hud.js           — HUD, minimap, combo, NPC
│   ├── game-over-reset.js    — Game over, reset
│   ├── input-system.js       — Input handling
│   ├── game-loop.js          — Main animate() loop
│   ├── camp-world.js         — 3D camp hub world
│   └── world.js              — World/environment constants (COLORS)
```

---

## 🐛 Bugs Fixed (March 1, 2026) — Session Summary

### PR #466 — Fix game boot failure caused by unsafe cross-file `spawnParticles` reassignment
- `game-loop.js` had top-level parse-time code referencing `spawnParticles` from `game-screens.js` that would throw a ReferenceError before `init()` could run
- Fixed by using `window.spawnParticles` with `typeof` guard

### PR #467 — Fix game init failures after monolithic main.js split
- `audio.js`: Bare `new AudioContext()` at top level crashes on mobile → wrapped in try-catch
- `game-screens.js`: `updateBackgroundMusic()` in `init()` throws if audio failed → guarded with `typeof`
- `game-loop.js`: `init()` catch block didn't set `gameModuleReady` → now sets it + shows menu fallback
- `loading.js`: `saveData.storyQuests.welcomeShown` crashes if undefined → optional chaining

### PR #468 — Fix BloodSystem THREE.js load guard + camp auto-activation on death
- `BloodSystem.init()` crashes if THREE.js CDN failed → added `typeof` guard
- `gameOver()` was calling `CampWorld.enter()` with no-op callbacks → removed; camp only via explicit button

### PR #469 — Fix: Show main menu after loading instead of auto-routing to camp
- `showMenuAfterLoading()` had 3-branch routing that always resolved to camp → replaced with simple main menu display

### PR #470 — Fix: always show main menu after loading — remove camp auto-jump
- Confirmed and re-applied the camp routing fix in `loading.js` + verified `game-screens.js` `init()` doesn't show screens

---

## ✅ Current Status

### Fixed
- ✅ Game boots properly after the 15-file split
- ✅ Loading screen → main menu (no more camp auto-jump)
- ✅ AudioContext crash on mobile/restricted environments
- ✅ BloodSystem safe if THREE.js CDN fails
- ✅ Death screen no longer auto-activates camp world
- ✅ Cross-file `spawnParticles` reference safe
- ✅ `gameModuleReady` always gets set even if `init()` fails

### ⚠️ Possibly Still Needs Work
- The `showComicInfoBox` welcome popup ("Welcome Dropplet" with yellow Continue button) — callback may still not work properly when entering camp for the first time
- Story quest modal timing — the story-quest-modal in `loading.js` may still interfere if storyQuests data isn't populated
- Full gameplay testing needed — menu works, but need to verify: Start Game → actual gameplay → enemies spawn → combat works → death screen → camp access
- Mobile touch controls — joystick/touch input might need testing after the split
- Save/load — localStorage save/load should be verified after the split
- Camp sub-screens (quest hall, skill tree, armory, training hall, forge, companion house, achievements, inventory) — need verification

---

## ⚡ Important Notes for Future Copilot Sessions

> **⚡ WORKFLOW NOTE:** When working on this repo, ALWAYS push PRs directly without asking for confirmation first. The owner has approved this workflow to reduce costs. Only stop and ask if something looks seriously wrong or risky. Just push the PR — if the owner doesn't want it, they'll let you know.

> **🔧 TECHNICAL NOTE:** All JS files share global scope via `<script>` tags. No ES modules. Script load ORDER in `index.html` matters — if you add a new file, it must go in the right position. Always use `typeof` guards for cross-file function calls. Wrap risky top-level code in try-catch to prevent halting script execution.

> **💰 COST NOTE:** Keep PRs comprehensive — fix as many things as possible per PR. The owner is on a tight budget. Don't split fixes into multiple small PRs when one big one will do.

---

## 📝 Dev Notes — Conversation Log (2026-03-01)

### 🎮 Can I Sell an AI-Assisted Game on Steam?

**Yes, it is 100% legal.** The game creator (timmiee) is the designer, director, and creative lead. AI (GitHub Copilot) is a development tool — like Photoshop, Unity, or any other tool.

**Steam's policy (updated January 2026):**

| Use Case | Disclosure Needed? |
|---|---|
| AI coding tools (Copilot, etc.) | **NO** — explicitly exempt |
| AI-generated art/music/text players see | **YES** — must disclose on store page |
| AI for behind-the-scenes workflow | **NO** |

**Key takeaway:** Using AI to write code does NOT require disclosure. If AI-generated art/sprites are used in-game, just check the disclosure box on Steam. Totally legal, just transparent.

**Steam Early Access fee:** $100 USD (one-time).

---

### 🎨 Visual Upgrade Plan — AI Art → Sprite Sheets → Into the Game

#### What the Game Currently Uses (All Procedural 3D — No Art Assets)

| Thing | Current Look |
|---|---|
| **Player** | Blue `SphereGeometry` (water droplet shape) |
| **Enemies** | Colored spheres, capsules, octahedrons — just shapes |
| **Ground** | Flat `PlaneGeometry` with single color (`0x2D5A1A`) |
| **Trees** | Cone + cylinder (basic shapes) |
| **Buildings** | Boxes with colored materials |
| **Camp** | Flat dark brown plane with dirt circles |

No textures, no sprites, no pixel art — everything is programmatic geometry.

#### The Upgrade Workflow

**Step 1: Screenshot current game elements**
Take screenshots of enemies, player, ground, etc. for reference.

**Step 2: Use AI image tools to generate new art**
Free/cheap options:
- **Microsoft Copilot Image Creator** (free with Bing/Edge)
- **Leonardo.ai** (free tier)
- **Pixlr / Photopea** (free browser editors to clean up)

Example prompts:
- *"Pixel art sprite sheet for a cute water droplet character, 4 frames walking animation, top-down view, transparent background, 64x64 per frame"*
- *"Pixel art sprite sheet of a cute spider enemy, 4 walking frames, transparent background"*
- *"Seamless tileable grass texture, pixel art style, soft green with small flowers, 128x128"*

**Step 3: Upload sprite sheets to repo**
Put them in an `assets/textures/` or `assets/sprites/` folder.

**Step 4: Ask Copilot to create a PR that swaps the code**
The coding agent replaces procedural geometry with textured sprites:

Before:
```js
const bodyGeo = new THREE.SphereGeometry(0.55, 16, 12);
const bodyMat = new THREE.MeshPhongMaterial({ color: 0x29b6f6 });
```

After:
```js
const texture = new THREE.TextureLoader().load('assets/player-sheet.png');
testure.repeat.set(1/4, 1); // 4 frames
const spriteMat = new THREE.SpriteMaterial({ map: texture });
const playerSprite = new THREE.Sprite(spriteMat);
```

#### Priority List — Biggest Visual Impact First

1. 🌍 **Ground texture** — seamless tileable grass/dirt (replaces flat green — HUGE difference)
2. 💧 **Player sprite sheet** — cute water drop with idle + walk + attack frames
3. 👾 **Enemy sprite sheets** — one per enemy type (spider, bug, slime, etc.)
4. 🌲 **Tree/bush sprites** — replace cone-cylinder trees
5. 🏠 **Building sprites** — for camp buildings

#### Art Style Options
- **Pixel art** — retro, clean, easy to generate with AI
- **Soft/cute style** (like Crazy Fox on iPhone) — smooth, detailed, more polished
- Either can work with the current Three.js engine

---

### 🖼️ How to Create Sprites — Step-by-Step Guide

#### The Problem
The game has no image files — everything (player, enemies, ground) is built from code using basic 3D shapes. To make it look good, we need actual art (sprite sheets with animations).

#### What Copilot CAN and CAN'T Do

| Copilot CAN ✅ | Copilot CAN'T ❌ |
|---|---|
| Write perfect prompts for image AI tools | Generate actual images |
| Write all code to load & animate sprites | Draw or paint anything |
| Create PRs that swap geometry → sprites | Edit image files |
| Tell you exact sizes, frame counts, formats | Use Photoshop for you |

#### How to Show AI Your Current Character

**Option A — Screenshot the game:**
1. Open the game in browser
2. Zoom in on the player/enemy you want to upgrade
3. Screenshot and crop tight around the character
4. Save as PNG

**Option B — Describe it (if game is broken):**
The player is: *"A cute round blue water droplet, light blue (#4FC3F7), translucent/shiny, small white highlight on upper left, slightly oval (taller than wide), small ground shadow underneath"*

#### Free AI Image Tools

| Tool | Cost | Best For |
|---|---|---|
| **Bing Image Creator** (copilot.microsoft.com) | Free | Quick concepts |
| **Leonardo.ai** | Free tier (150 tokens/day) | Sprite sheets, pixel art |
| **PixVerse / Krea.ai** | Free tiers | Variations & styles |

#### Copy-Paste Prompts for Each Game Element

**Player character sprite sheet:**
> *"2D pixel art sprite sheet of a cute round blue water droplet character, transparent shiny body, white highlight reflection. Show 16 frames in a 4x4 grid: Row 1: idle animation (4 frames, gentle bounce), Row 2: walking right (4 frames), Row 3: running right (4 frames), Row 4: death animation (4 frames, splashing into water). Transparent background, 64x64 pixels per frame, clean pixel art style, top-down 3/4 view"*

**Player character design only (to get the look right first):**
> *"Cute round blue water droplet game character, light blue translucent body with white shiny highlight spot, small happy eyes, pixel art style, transparent background, game asset"*

**If uploading a screenshot as reference:**
> *"Create a pixel art sprite sheet based on this character. Keep the same blue water droplet design but make it detailed pixel art. 4 rows: idle (4 frames), walk (4 frames), run (4 frames), death/splash (4 frames). 64x64 per frame, transparent background"*

**Ground texture:**
> *"Seamless tileable pixel art grass ground texture, soft green with small details, flowers, pebbles, top-down view, 256x256 pixels"*

**Enemy — Spider (type 15, Daddy Longlegs):**
> *"Pixel art sprite sheet of a brown daddy longlegs spider enemy, 8 thin legs, small round body. 4x4 grid: idle (4 frames), walk (4 frames), attack (4 frames), death (4 frames). 64x64 per frame, transparent background, top-down 3/4 view"*

**Enemy — Bug Ranged (type 12):**
> *"Pixel art sprite sheet of a dark olive green insect enemy with compound eyes, bug-like body. 4x4 grid: idle, walk, shoot, death. 64x64 per frame, transparent background"*

**Enemy — Flying Boss (type 11):**
> *"Pixel art sprite sheet of a large dark magenta flying boss enemy, menacing wings, glowing eyes. 4x4 grid: idle hover, swoop attack, special attack, death. 128x128 per frame, transparent background"*

**Trees:**
> *"Pixel art top-down 3/4 view tree sprite, green leafy canopy, brown trunk, soft detailed style, transparent background, 128x128"*

#### How to Clean Up AI-Generated Sprites

AI sheets sometimes aren't perfectly aligned. Fix with free tools:
1. Go to **Photopea.com** (free, browser-based, works like Photoshop)
2. Open the AI-generated sprite sheet
3. Make sure each frame is the same size (64x64 or 128x128)
4. Make sure background is transparent (delete white/colored bg)
5. Save as PNG with transparency

#### How to Get Them Into the Game

1. Create folder in repo: `assets/sprites/`
2. Upload sprite sheet PNGs there
3. Come back to Copilot and say: **"Create a PR to replace the player sphere with the sprite sheet at assets/sprites/player-sheet.png"**
4. Copilot coding agent writes all the animation code and swaps it in
5. Repeat for each enemy, ground texture, trees, etc.

#### Sprite Sheet Format Requirements

| Property | Value |
|---|---|
| **Frame size** | 64x64 px (characters) or 128x128 px (bosses/large) |
| **Grid layout** | 4 columns × 4 rows (16 frames) |
| **Row 1** | Idle animation (4 frames) |
| **Row 2** | Walk/move animation (4 frames) |
| **Row 3** | Attack animation (4 frames) |
| **Row 4** | Death animation (4 frames) |
| **Background** | Transparent (PNG) |
| **File format** | PNG |
| **Naming** | `player-sheet.png`, `enemy-spider-sheet.png`, etc. |

---

### 🔧 Current Fix in Progress

**PR being created by Copilot Coding Agent:**
Fix broken game after JS file split (PR #464) — restore full loading → menu → gameplay flow.

**What it fixes:**
1. All cross-file function/variable references across 15 split JS files
2. `init()` → `setupMenus()` → `gameModuleReady` pipeline
3. Blood system load order (HIGH PRIORITY)
4. Full game flow: loading screen → main menu → START GAME → gameplay
5. Game loop (`animate()`) running without undefined reference errors

**Constraints:**
- Keep split file structure (no merging back)
- Keep `<script>` tag architecture (no ES modules)
- Fix load order + add `window.*` exposures where needed

---

### 🎮 All 17 Enemy Types (For Sprite Reference)

| Type | Name | Current Shape | Color | Notes |
|---|---|---|---|---|
| 0 | Basic Square | Box | Hot Pink `#FF69B4` | Basic melee |
| 1 | Triangle | Cone | Gold `#FFD700` | Fast |
| 2 | Round | Sphere | Purple `#9370DB` | Tanky |
| 3 | Ranged | Octahedron | — | Shoots projectiles |
| 4 | Tank | Large sphere | — | Slow, high HP |
| 5 | Flying | Octahedron | — | Hovers at y=2 |
| 6 | Splitter | — | — | Splits on death |
| 7 | Shield | — | — | Has shield phase |
| 8 | Charger | — | — | Charges at player |
| 9 | Summoner | — | — | Spawns minions |
| 10 | Bug Melee | Dodecahedron | Dark green | Forest biome |
| 11 | Flying Boss | Large octahedron | Dark magenta `#8B008B` | Boss, scale 1.8x, y=5 |
| 12 | Bug Ranged | Capsule | Dark olive `#556B2F` | Insect with compound eyes |
| 13 | Bug Slow | Large sphere | Very dark green `#2F4F2F` | Armored beetle |
| 14 | Bug Fast | Small octahedron | Yellow-green `#9ACD32` | Small flying dart bug |
| 15 | Daddy Longlegs | Small sphere + 8 legs | Brown `#8B4513` | Spider with 8 thin legs |
| 16 | Sweeping Swarm | Tiny octahedron | Amber `#FFAA00` | Fast small swarm |

---

*Last updated: 2026-03-01*