1| # 💧 Water Drop Survivor

A 3D roguelike survival game built with Three.js where you play as a water droplet fighting to survive waves of enemies.

## 🎮 How to Play

1. Open `index.html` in a modern browser (Chrome, Firefox, Edge)
2. Click **START GAME** to begin a run
3. Survive enemy waves, level up, and collect loot
4. When you die, return to **Camp** to spend gold and unlock upgrades
5. Each run makes you stronger — keep pushing!

## 🕹️ Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Move | WASD / Arrow Keys | Virtual Joystick (left side) |
| Interact (Camp) | E | Tap ENTER button |
| Menu | ESC / ☰ button | ☰ button |

## ✨ Features

- **3D Combat** — Unique weapons with fire, ice, lightning, and physical damage types
- **Blood & Gore System** — 50,000-particle physics-based blood with exit wounds, drag trails, and ground stains
- **Headshot System** — Decapitations with flying heads and blood spray
- **Elemental Deaths** — Fire chars enemies, ice shatters them, lightning blackens them
- **3D Camp World** — Walk around a cozy campfire hub between runs, talk to Benny the Janitor, visit buildings
- **Progression System** — Gold, skill trees, gear, quests, and account leveling
- **Camp Buildings** — Forge, Quest Hall, Skill Tree, Gear Locker, and more
- **Harvesting** — Gather resources from nodes in the game world
- **Day/Night Cycle** — Dynamic lighting with dawn, day, dusk, and night phases
- **Rage Combat** — Build rage for devastating attacks
- **Story Quests** — Follow the storyline through quest chains

## 🏗️ Architecture

```
├── index.html              # Main game page
├── css/styles.css          # All game styling (141 KB)
├── js/
│   ├── main.js             # Core game engine (Three.js module)
│   ├── camp-world.js       # 3D walkable camp hub
│   ├── blood-system.js     # Advanced blood particle physics
│   ├── rage-combat.js      # Rage meter and combat system
│   ├── enemies.js          # Enemy definitions and AI
│   ├── weapons.js          # Weapon system
│   ├── harvesting.js       # Resource gathering
│   ├── world.js            # Game world configuration
│   ├── renderer.js         # Renderer settings
│   ├── state.js            # Game state management
│   ├── audio.js            # Sound system
│   ├── ui.js               # UI helpers
│   ├── debug.js            # Debug/diagnostic tools
│   └── ... (idle systems, loading, etc.)
└── docs/                   # Implementation docs and summaries
```

## 🛠️ Tech Stack

- **Three.js** (v0.176.0) — 3D rendering engine
- **Vanilla JavaScript** — No frameworks, pure JS
- **HTML5 / CSS3** — UI and styling

## 👤 Credits

Made by **Timmy Durell** aka **TimmieTooth**

## 📄 License

All rights reserved.
Version 0.5.1 alpha playable 