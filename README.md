# 0.2-NewVersion-Waterdrop-
Version 0.5.1 alpha playable

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
texture.repeat.set(1/4, 1); // 4 frames
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

### 📁 Current File Structure

```
├── index.html          — Main HTML + script load order
├── TODO.md             — Development roadmap
├── README.md           — This file
├── css/                — Stylesheets
├── docs/               — Documentation
├── js/
│   ├── main.js         — Game state variables & module aliases
│   ├── player-class.js — Player class
│   ├── enemy-class.js  — DroneTurret + Enemy classes
│   ├── projectile-classes.js — Projectiles
│   ├── gem-classes.js  — ExpGem, GoldCoin, Chest
│   ├── save-system.js  — Save/load, achievements, gear
│   ├── camp-skill-system.js — Camp buildings, skill tree
│   ├── quest-system.js — Quests, companion, camp screen
│   ├── world-gen.js    — 3D world generation
│   ├── game-screens.js — init(), menus, wave spawning
│   ├── level-up-system.js — Level-up modal
│   ├── game-hud.js     — HUD, minimap, combo, NPC
│   ├── game-over-reset.js — Game over, reset
│   ├── input-system.js — Input handling
│   ├── game-loop.js    — Main animate() loop
│   ├── camp-world.js   — 3D camp hub world
│   └── world.js        — World/environment constants (COLORS)
```

---

*Last updated: 2026-03-01*