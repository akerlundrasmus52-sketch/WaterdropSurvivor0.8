# 🧪 SANDBOX 2.0 — COMPREHENSIVE GUIDE

**Last Updated**: 2026-03-24

## 📋 CRITICAL RULES FOR ALL AI AGENTS

### ⚠️ DO NOT MODIFY OLD MAP FILES FOR SANDBOX 2.0

**Sandbox 2.0 has its own dedicated files. The old map is ONLY for the full game (index.html).**

- ❌ **DO NOT** add Sandbox 2.0 features to `js/world-gen.js`
- ❌ **DO NOT** add Sandbox 2.0 features to `js/game-loop.js`
- ❌ **DO NOT** modify spawn-sequence.js for Sandbox 2.0 (it's for old game only)
- ✅ **DO** add all Sandbox 2.0 features to `js/engine2.js` (landmarks) and `js/sandbox-loop.js` (animation)
- ✅ **DO** test in `sandbox.html` first, then verify in `index.html`

---

## 📁 FILE STRUCTURE

### Sandbox 2.0 Core Files

```
/sandbox.html                 ← Entry point for Sandbox 2.0
/js/engine2.js                ← Engine 2.0 arena + landmarks
/js/sandbox-loop.js           ← Sandbox game loop + animations
```

### Old Map Files (DO NOT USE FOR SANDBOX 2.0)

```
/index.html                   ← Full game entry point
/js/world-gen.js              ← Old map world generation (18m gold obelisk is here)
/js/game-loop.js              ← Full game loop
/js/spawn-sequence.js         ← Underground elevator animation (old game only)
```

### Shared Systems (Used by Both)

```
/js/blood-system-v2.js        ← Blood physics system
/js/gore-simulator.js         ← Gore simulation
/js/trauma-system.js          ← Wound/damage system
/js/settings-ui.js            ← Settings modal
/js/save-system.js            ← LocalStorage persistence
/css/styles.css               ← Shared stylesheet
```

---

## 🗺️ SANDBOX 2.0 LANDMARKS

### 1. UFO Crash Site
- **Location**: (-50, 25)
- **Components**:
  - Metallic disc with dome
  - 6 glowing engine lights (cyan/teal, animated pulsing)
  - Crash crater
  - Companion egg nearby (cyan glow, 0.7 radius sphere)
- **Animation**: Engine lights pulse with phase offsets
- **File**: `js/engine2.js:400-507`

### 2. Black Annunaki Obelisk with Eye of Horus
- **Location**: (25, -35)
- **Size**: 8.1m height (55% smaller than old 18m gold obelisk)
- **Components**:
  - **Main shaft**: Black cylinder (color: 0x1a1a1a) with 4 sides
  - **Pyramidion cap**: Gold cone (color: 0xFFD700)
  - **Eye of Horus symbols**: Golden symbols on all 4 faces at mid-height
    - Almond-shaped eye outline
    - Circular pupil
    - Lower curve marking
    - Spiral tail on right side
  - **Energy crystal**: Cyan octahedron at apex (0.36 radius)
  - **Energy rings**: 3 rotating tori around obelisk
  - **Pylons**: 4 stone pillars with cyan crystals (distance: 3.15 units)
  - **Base platform**: 3-level stepped stone pedestal
  - **Ground marker**: Ring (3.6-4.05 radius) with 8 rune blocks
- **Lights**:
  - Top light: Cyan, intensity 3, range 13.5
  - Base light: Gold, intensity 1.5, range 6.75
- **Animation**:
  - Crystal rotates on Y-axis + oscillates on X-axis
  - Rings rotate at different speeds with phase offsets
  - Lights pulse in intensity
  - Pylon crystals pulse in sync
- **File**: `js/engine2.js:508-758`

### 3. Reflective Lake (NO WATERFALL)
- **Location**: (30, -30)
- **Components**:
  - **Lake**: 8-unit radius circle with PBR material (clearcoat, reflectivity 0.9)
  - **Shore**: Sandy ring (7.5-10 radius, beige color 0xC2B280)
  - **Sparkles**: 10 white circles on lake surface (animated opacity + scale)
- **Animation**: Sparkles pulse and scale with sine waves
- **Note**: Waterfall was removed per user request (2026-03-24)
- **File**: `js/engine2.js:760-835`

---

## 🎨 GROUND & SPAWN HOLE

### Ground Plane
- **Size**: 200x200 units
- **Texture**: PBR mossy brick (`assets/textures/mossy_brick_diff_4k.jpg`)
- **Fallback chain**:
  1. `mossy_brick_diff_4k.jpg` (11MB, 4096x4096) — PRIMARY
  2. `assets/textures/ground/color.jpg` — FALLBACK 1
  3. `654811F9-1760-4A74-B977-73ECB1A92913.png` — FALLBACK 2
  4. Procedural stone texture (warm grey/brown) — FALLBACK 3
- **Material**: MeshStandardMaterial
  - Color: 0xFFFFFF (white base for natural texture)
  - Roughness: 0.85
  - Metalness: 0.02
  - 20x20 texture repeat
  - Anisotropic filtering: 16x
- **File**: `js/engine2.js:65-192`

### Spawn Hole
- **Location**: Center (0, 0, 0)
- **Radius**: 3 units
- **Rim**: Torus with weathered stone material (dark brown 0x4A3C2E)
- **Inner ring**: Darker torus for depth illusion (0x2A1F1A)
- **Purpose**: Visual marker for player spawn location
- **Note**: Sandbox 2.0 does NOT use spawn-sequence.js elevator animation (that's for old game)
- **File**: `js/engine2.js:274-386`

---

## 🎮 UI & SETTINGS

### Settings Button (Eye of Horus)
- **Symbol**: 𓂀 (Unicode Eye of Horus character)
- **Style**: Gold color (0xFFD700), circular button, top-right corner
- **Hover**: Scales to 1.1x, border brightens
- **Function**: Opens settings modal (graphics, audio, controls)
- **File**: `sandbox.html:62-93`, `sandbox.html:221`

### Settings Modal
- **Theme**: Camp-themed with wooden textures
- **Features**:
  - Auto-Aim toggle (requires skill tree unlock)
  - Control type (touch/keyboard/gamepad)
  - Sound effects toggle
  - Background music toggle
  - **Graphics Mode**: Auto vs Manual
    - **Auto**: Adaptive FPS booster (adjusts quality based on performance)
    - **Manual**: User-controlled quality presets (ultra-low to ultra)
  - Particle Effects toggle (blood/gore)
  - Go to Camp button
  - Reset Progress button
  - Hard Reset Account button
  - UI Customization (drag & resize HUD)
- **File**: `sandbox.html:395-465`, `js/settings-ui.js`

---

## 🩸 BLOOD & GORE SYSTEMS

All three systems are fully functional in Sandbox 2.0:

### 1. Blood System V2 (`js/blood-system-v2.js`)
- **Object pools**:
  - 800 blood drops (InstancedMesh)
  - 400 mist particles (InstancedMesh)
  - 30 flesh/slime chunks
  - 150 ground decals
  - 8 wounds per enemy
  - 12 arterial streams
- **Physics**: Gravity (-9.81), viscosity, bounce, coalesce
- **Per-Enemy Anatomy**: 5 internal organs with HP and bleed rates
- **Weapon Profiles**: 18 weapon-specific gore configurations

### 2. Gore Simulator (`js/gore-simulator.js`)
- **Max objects**: 600 blood drops, 200 decals, 12 wounds/enemy, 300 mist, 60 chunks, 20 streams
- **Weapon-specific gore profiles** for all weapons
- **Features**: Dismemberment, splatter patterns, mesh deformation

### 3. Trauma System (`js/trauma-system.js`)
- **Max objects**: 500 wound decals, 1000 flesh chunks, 500 guts, 300 brains, 400 bones, 100 stuck arrows
- **Features**: Progressive wound accumulation, corpse blood pump (heartbeat every 400ms)

**Initialization**: All three systems are initialized in `js/sandbox-loop.js:3054-3071`

---

## 🔄 ANIMATION SYSTEM

### Landmark Animations (sandbox-loop.js)

All landmark animations happen in the `_animate()` function:

```javascript
// UFO engine lights (lines 3335-3349)
- Pulse emissive intensity: base ± 0.4
- Pulse point light: base ± 0.8
- Phase-shifted per light (0, π/3, 2π/3, etc.)

// Obelisk animations (lines 3350-3372)
- Crystal Y-rotation: 0.01 rad/frame
- Crystal X-oscillation: ±0.15 rad (sine wave)
- Crystal emissive pulse: 1.2 ± 0.2
- Energy rings: Individual rotation + phase offsets
- Top light pulse: 2.5 ± 0.8
- Base light pulse: 1.3 ± 0.5
- Pylon crystals: Synchronized pulse 0.7 ± 0.2

// Lake sparkles (lines 3374-3386)
- Opacity: 0.3 + sin(phase) * 0.7
- Scale: 1 + sin(phase * 2) * 0.5
- Phase increment: 0.02 * speed
```

**File**: `js/sandbox-loop.js:3335-3386`

---

## 🎯 PLAYER & ENEMY SPAWNING

### Player Spawn
- **Position**: (12, 0, 0)
- **Method**: Instant spawn (no elevator animation in Sandbox 2.0)
- **Spawn hole**: Visual only (no mechanics)

### Enemy Spawn
- **System**: Single Slime dummy for testing
- **Respawn**: Automatic when killed
- **Purpose**: Test blood/gore systems, level-up mechanics, EXP gems
- **Wave system**: NOT used in Sandbox 2.0 (only in full game)

**File**: `js/sandbox-loop.js`

---

## 🧩 SCRIPT LOADING ORDER (sandbox.html)

Critical order for proper initialization:

1. **Sandbox mode flag**: `window._engine2SandboxMode = true` (line 481)
2. **THREE.js core**: `js/three.min.js`
3. **Foundation**: `state.js`, `utils.js`, `audio.js`, `world.js`
4. **Weapons & Combat**: `weapons.js`, `spatial-hash.js`
5. **Pool/Rendering**: `instanced-renderer.js`, `object-pool.js`
6. **VFX**: `dopamine-system.js`, `blood-system-v2.js`, `gore-simulator.js`, `trauma-system.js`, `wave-system.js`
7. **UI Helpers**: `ui.js`
8. **Game Logic**: `player.js`, `combat.js`, `main.js`
9. **Gameplay Classes**: `player-class.js`, `projectile-classes.js`, `gem-classes.js`
10. **Progression**: `gem-system.js`, `level-up-system.js`, `game-hud.js`
11. **Advanced UI**: `rage-combat.js`, `ui-calibration.js`, `quest-system.js`, `settings-ui.js`, `save-system.js`
12. **Engine 2.0**: `engine2.js`, `camp-skill-system.js`, `stat-aggregator.js`
13. **Sandbox Loop**: `sandbox-loop.js` (LAST — orchestrates everything)

**Important**: `world-gen.js`, `game-loop.js`, `spawn-sequence.js` are NOT loaded in sandbox.html

---

## 🛠️ HOW TO ADD NEW FEATURES TO SANDBOX 2.0

### Adding a New Landmark

1. **Edit** `js/engine2.js` → `_createLandmarks()` function
2. **Create** your landmark group:
   ```javascript
   const myLandmarkGroup = new THREE.Group();
   myLandmarkGroup.position.set(x, 0, z);
   // Add meshes, lights, etc.
   this.scene.add(myLandmarkGroup);
   ```
3. **Store** animation references:
   ```javascript
   window._engine2Landmarks.myLandmark = {
     group: myLandmarkGroup,
     animatedParts: [...]
   };
   ```
4. **Add animation** in `js/sandbox-loop.js` → `_animate()` function:
   ```javascript
   if (landmarks.myLandmark) {
     // Update rotations, positions, materials, etc.
   }
   ```

### Adding UI Elements

1. **HTML**: Add to `sandbox.html` in the `<div id="ui-layer">` section
2. **CSS**: Add styles in `<style>` block of sandbox.html or `css/styles.css`
3. **JavaScript**: Add handlers in `js/sandbox-loop.js` or dedicated system file

### Modifying Blood/Gore

- **DO NOT** replace the systems
- **DO** tune parameters:
  - Open `js/blood-system-v2.js` → adjust `CFG` object (line 54-66)
  - Open `js/gore-simulator.js` → adjust constants (line 36-48)
  - Open `js/trauma-system.js` → adjust config (line 11-21)

---

## 🐛 COMMON PITFALLS

### ❌ DON'T DO THIS:
1. Adding Sandbox 2.0 features to `world-gen.js` (that's the OLD 18m gold obelisk)
2. Modifying `game-loop.js` for Sandbox 2.0 (wrong file)
3. Expecting spawn-sequence.js to work in Sandbox 2.0 (not loaded)
4. Replacing blood/gore systems with "simple" implementations
5. Changing script load order in sandbox.html
6. Adding `import`/`export` statements (no ES modules)

### ✅ DO THIS:
1. Add landmarks to `js/engine2.js` → `_createLandmarks()`
2. Add animations to `js/sandbox-loop.js` → `_animate()`
3. Test in sandbox.html FIRST, then verify in index.html
4. Keep object pooling intact (no `new` during gameplay)
5. Tune gore system parameters instead of replacing
6. Use `window._engine2SandboxMode` flag to detect sandbox mode

---

## 📊 PERFORMANCE NOTES

- **Object Pools**: All objects pre-allocated at boot (zero GC spikes)
- **InstancedMesh**: Blood drops, mist, chunks all use instanced rendering
- **Texture Size**: 11MB 4k texture with fallbacks for low-end devices
- **Graphics Modes**:
  - **Auto**: Dynamically adjusts quality based on FPS
  - **Manual**: User-controlled (ultra-low to ultra)
- **Particle Effects Toggle**: Can disable blood/gore on any device in Manual mode

---

## 📝 CHANGELOG

### 2026-03-24
- ✅ Reduced obelisk size by 55% (18m → 8.1m height)
- ✅ Changed obelisk from gold to black with gold Eye of Horus symbols
- ✅ Removed waterfall completely (kept lake with sparkles)
- ✅ Changed settings button to Eye of Horus symbol (𓂀)
- ✅ Updated README with Sandbox 2.0 structure rules

### 2026-03-23
- ✅ Added UFO crash site landmark
- ✅ Added Annunaki Obelisk (original 18m gold version)
- ✅ Added Lake with waterfall (later removed)
- ✅ Confirmed ground texture loading working

---

## 🔗 RELATED FILES

- **Main Documentation**: `/README.md` (AI Manifest section)
- **Engine 2.0 Source**: `/js/engine2.js`
- **Sandbox Loop**: `/js/sandbox-loop.js`
- **Sandbox Entry**: `/sandbox.html`
- **Settings UI**: `/js/settings-ui.js`
- **Blood Systems**: `/js/blood-system-v2.js`, `/js/gore-simulator.js`, `/js/trauma-system.js`

---

## 🎓 SUMMARY FOR AI AGENTS

**When working on Sandbox 2.0:**

1. ✅ Use `sandbox.html` for testing
2. ✅ Modify `js/engine2.js` for landmarks
3. ✅ Modify `js/sandbox-loop.js` for animations
4. ❌ Don't touch `world-gen.js`, `game-loop.js`, `spawn-sequence.js`
5. ✅ Keep object pooling intact
6. ✅ Tune gore systems, don't replace them
7. ✅ Test in sandbox.html first, then index.html
8. ✅ Read this guide before making changes

**The Sandbox 2.0 is a separate, clean environment for testing Engine 2.0 features. The old map (world-gen.js) is preserved for the full game (index.html) but should NOT be modified for Sandbox 2.0 features.**
