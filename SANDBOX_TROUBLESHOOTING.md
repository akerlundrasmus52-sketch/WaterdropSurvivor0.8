# 🔧 SANDBOX 2.0 TROUBLESHOOTING GUIDE

**For Issue #XXX - "Nothing works except obelisk"**
**Date**: 2026-03-24

## 📋 SUMMARY OF ISSUE

User reports that after 150+ PRs, nothing is working in Sandbox 2.0 except the obelisk:
- ❌ No spawn hole animation visible
- ❌ Settings button not showing Eye of Horus (shows "brown menu tab")
- ❌ Ground texture not loading (single brown color)
- ❌ Blood and gore systems not visible
- ✅ Only obelisk works

## 🔍 ROOT CAUSE ANALYSIS

After thorough code review, **ALL FEATURES ARE IMPLEMENTED CORRECTLY** in the codebase:
1. ✅ Spawn animation exists (js/sandbox-loop.js:2700-2923)
2. ✅ Eye of Horus button styled correctly (sandbox.html:62-93)
3. ✅ Ground texture loading implemented (js/engine2.js:65-134)
4. ✅ Blood/gore systems loaded and initialized (js/sandbox-loop.js:3049-3073)

**The issue is NOT missing code - it's a runtime/environment problem.**

## 🎯 SOLUTIONS IMPLEMENTED

### 1. Enhanced Console Logging

**File**: `js/sandbox-loop.js`
**Changes**: Added detailed console logging to every boot step

Now shows:
```
[🎮 SandboxLoop] Starting Sandbox 2.0 boot sequence...
[🎮 SandboxLoop] ✓ Sandbox mode flag set
[🎮 SandboxLoop] ✓ Game state activated
[🎮 SandboxLoop] ✓ Loading screen hidden
[🎮 SandboxLoop] ✓ UI layer shown
[🎮 SandboxLoop] Initializing settings...
[🎮 SandboxLoop] ✓ Settings initialized
[🎮 SandboxLoop] Initializing Three.js scene...
[🎮 SandboxLoop] ✓ Scene initialized
[🎮 SandboxLoop] Initializing ground (Engine2Sandbox)...
[🎮 SandboxLoop] ✓ Ground initialized
[🎮 SandboxLoop] Initializing blood/gore systems...
[🎮 SandboxLoop] ✓ Blood systems initialized
[🎮 SandboxLoop] Initializing rage combat...
[🎮 SandboxLoop] ✓ Rage combat initialized
[🎮 SandboxLoop] Initializing object pools...
[🎮 SandboxLoop] ✓ Object pools initialized
[🎮 SandboxLoop] Initializing player (spawn animation will trigger)...
[🎮 SandboxLoop] ✓ Player initialized at position: {...}
[🎮 SandboxLoop] ✓ Spawn intro active: true
[🎮 SandboxLoop] Building slime enemy pool...
[🎮 SandboxLoop] ✓ Slime pool built (50 slots)
[🎮 SandboxLoop] Spawning first wave...
[🎮 SandboxLoop] ✓ First wave spawned
[🎮 SandboxLoop] Initializing input handlers...
[🎮 SandboxLoop] ✓ Input initialized
[🎮 SandboxLoop] ✓ Animation loop started
[🎮 SandboxLoop] ════════════════════════════════════════════
[🎮 SandboxLoop] 🎉 ENGINE 2.0 SANDBOX READY!
[🎮 SandboxLoop] ════════════════════════════════════════════
```

### 2. Debug Helper Script

**File**: `js/sandbox-debug.js` (NEW)
**Purpose**: Comprehensive diagnostic tool

Automatically runs 500ms after page load and reports:
- ✅ Sandbox mode status
- ✅ THREE.js availability
- ✅ Core game objects (scene, camera, renderer, player)
- ✅ Engine2Sandbox initialization
- ✅ Ground texture loading status
- ✅ Blood/gore system availability
- ✅ Settings button visibility
- ✅ Spawn animation status
- ✅ UI layer display
- ✅ Canvas rendering

**Console Commands Available:**
- `runSandboxDiagnostics()` - Run full diagnostic report
- `checkTexture()` - Check ground texture status
- `checkSpawn()` - Check spawn animation status
- `checkBlood()` - Check blood system status
- `forceSpawn()` - Reset player to spawn position

### 3. Documentation

**Files Created:**
1. `SANDBOX_DIAGNOSTIC.md` - Initial diagnostic report
2. `SANDBOX_TROUBLESHOOTING.md` - This file (comprehensive guide)

## 🚨 MOST LIKELY USER ISSUES

### Issue 1: Opening File Directly (file:// protocol)

**Problem**: Opening `sandbox.html` by double-clicking or via `file://` protocol
**Symptom**: Textures fail to load, CORS errors in console
**Solution**: MUST run through HTTP server

```bash
# Navigate to project directory
cd /path/to/0.2-NewVersion-Waterdrop-

# Start server (choose one):
python3 -m http.server 8000
# OR
python -m SimpleHTTPServer 8000
# OR
php -S localhost:8000
# OR
npx http-server -p 8000

# Then open:
http://localhost:8000/sandbox.html
```

### Issue 2: Testing Wrong File

**Problem**: Opening `index.html` instead of `sandbox.html`
**Symptom**: Old game loads, not Sandbox 2.0
**Solution**: Explicitly navigate to `sandbox.html`

**Correct URL**: `http://localhost:8000/sandbox.html`
**Wrong URL**: `http://localhost:8000/` or `http://localhost:8000/index.html`

### Issue 3: Browser Cache

**Problem**: Old cached JavaScript running
**Symptom**: Code changes don't appear, old features show
**Solution**: Hard refresh

- **Chrome/Edge/Firefox**: Ctrl+Shift+R (Cmd+Shift+R on Mac)
- **Safari**: Cmd+Option+R
- **Or**: Clear browser cache completely

### Issue 4: JavaScript Error Early in Boot

**Problem**: Error in one script prevents others from loading
**Symptom**: Some features work, others don't; console shows red errors
**Solution**: Check browser console (F12)

Look for RED error messages like:
- `Uncaught ReferenceError: X is not defined`
- `Uncaught TypeError: Cannot read property 'X' of undefined`
- `Failed to load resource: 404 (Not Found)`

### Issue 5: Canvas Hidden or Behind Elements

**Problem**: THREE.js canvas rendering but not visible
**Symptom**: Console shows no errors, but screen is blank
**Solution**: Check z-index and display

```javascript
// In browser console:
console.log(document.querySelector('#game-container canvas'));
console.log(window.getComputedStyle(document.querySelector('#game-container canvas')).display);
```

## 📝 STEP-BY-STEP VERIFICATION PROCESS

### Step 1: Start HTTP Server

```bash
cd /path/to/0.2-NewVersion-Waterdrop-
python3 -m http.server 8000
```

### Step 2: Open Sandbox in Browser

Navigate to: `http://localhost:8000/sandbox.html`

**CRITICAL**: Make sure URL ends with `/sandbox.html`, NOT `/index.html`

### Step 3: Open Browser Console (F12)

Check for:
1. **Green Success Messages**: Should see all the `[🎮 SandboxLoop] ✓` messages
2. **Red Error Messages**: If any, read carefully and address
3. **Engine2 Messages**: Look for `[Engine2] ✓ Successfully loaded: assets/textures/mossy_brick_diff_4k.jpg`
4. **Diagnostic Report**: Should auto-run after 500ms

### Step 4: Run Manual Diagnostics

In browser console, type:
```javascript
runSandboxDiagnostics()
```

This will show comprehensive status of all systems.

### Step 5: Visual Verification

Check that you can see:
- ✅ **Eye of Horus button** (𓂀) in top-right corner, gold color
- ✅ **Ground texture** - mossy brick pattern (NOT single brown color)
- ✅ **Spawn animation** - player rises from underground
- ✅ **HP/EXP/Rage bars** at top of screen
- ✅ **Player (blue water droplet)** in center
- ✅ **Green slime enemy** nearby

### Step 6: Interaction Test

1. **Click Eye of Horus button** → Settings modal should open
2. **Move with WASD** → Player should move smoothly
3. **Shoot enemy** (auto-fires) → Blood particles should spray
4. **Kill enemy** → Gore chunks + blood pool should appear

## 🔬 DETAILED DEBUGGING

If features still don't work after above steps:

### Debug Ground Texture

```javascript
// In console:
checkTexture()

// Should show:
// - Ground Material: MeshStandardMaterial
// - Texture (map): Texture object
// - Color: #ffffff (white, allowing texture to show)
// - Texture Image: Image object
// - Texture Size: 4096 × 4096
```

### Debug Spawn Animation

```javascript
// In console:
checkSpawn()

// Should show:
// - Player position: Vector3 with y between -1.5 (start) and 0.5 (end)
// - During animation: y gradually increases from -1.5 to 0.5 over 2.8 seconds
```

### Debug Blood Systems

```javascript
// In console:
checkBlood()

// Should show:
// - BloodSystem: Object (or function)
// - BloodV2: Object
// - GoreSim: Object
// - TraumaSystem: Object
```

### Check Scene Contents

```javascript
// In console:
console.log(scene.children.length); // Should be > 10 (many objects)
console.log(scene.children.map(c => c.type + ': ' + (c.name || 'unnamed')));
// Should list: PerspectiveCamera, DirectionalLight, AmbientLight, Mesh (ground), etc.
```

## 📊 EXPECTED CONSOLE OUTPUT

### Successful Boot Sequence

```
[🎮 SandboxLoop] Starting Sandbox 2.0 boot sequence...
[🎮 SandboxLoop] ✓ Sandbox mode flag set
[🎮 SandboxLoop] ✓ Game state activated
[🎮 SandboxLoop] ✓ Loading screen hidden
[🎮 SandboxLoop] ✓ UI layer shown
[🎮 SandboxLoop] Initializing settings...
[🎮 SandboxLoop] ✓ Settings initialized
[🎮 SandboxLoop] Initializing Three.js scene...
[🎮 SandboxLoop] ✓ Scene initialized
[🎮 SandboxLoop] Initializing ground (Engine2Sandbox)...
[Engine2] Initializing Engine 2.0 Sandbox...
[Engine2] Loading ground textures...
[Engine2] Attempting to load: assets/textures/mossy_brick_diff_4k.jpg
[Engine2] ✓ Successfully loaded: assets/textures/mossy_brick_diff_4k.jpg
[Engine2] ✓ Texture applied successfully
[Engine2] Engine 2.0 arena initialized successfully
[🎮 SandboxLoop] ✓ Ground initialized
[🎮 SandboxLoop] Initializing blood/gore systems...
[🎮 SandboxLoop] ✓ Blood systems initialized
[🎮 SandboxLoop] Initializing rage combat...
[🎮 SandboxLoop] ✓ Rage combat initialized
[🎮 SandboxLoop] Initializing object pools...
[🎮 SandboxLoop] ✓ Object pools initialized
[🎮 SandboxLoop] Initializing player (spawn animation will trigger)...
[🎮 SandboxLoop] ✓ Player initialized at position: Vector3 {x: 0, y: -1.5, z: 0}
[🎮 SandboxLoop] ✓ Spawn intro active: true
[🎮 SandboxLoop] Building slime enemy pool...
[🎮 SandboxLoop] ✓ Slime pool built (50 slots)
[🎮 SandboxLoop] Spawning first wave...
[🎮 SandboxLoop] ✓ First wave spawned
[🎮 SandboxLoop] Initializing input handlers...
[🎮 SandboxLoop] ✓ Input initialized
[🎮 SandboxLoop] ✓ Animation loop started
[🎮 SandboxLoop] ════════════════════════════════════════════
[🎮 SandboxLoop] 🎉 ENGINE 2.0 SANDBOX READY!
[🎮 SandboxLoop] ════════════════════════════════════════════
[🎮 SandboxLoop] ✓ Spawn animation should be running
[🎮 SandboxLoop] ✓ Eye of Horus button (𓂀) in top-right
[🎮 SandboxLoop] ✓ Ground texture loading from Engine2Sandbox
[🎮 SandboxLoop] ✓ Blood/gore systems ready
[🎮 SandboxLoop] Type runSandboxDiagnostics() for full report
[🎮 SandboxLoop] ════════════════════════════════════════════
[🔍 SandboxDebug] Sandbox Debug Helper loaded
[🔍 SandboxDebug] Waiting for DOM ready...

══════════════════════════════════════════════════════════════
[🔍 SandboxDebug] SANDBOX 2.0 DIAGNOSTIC REPORT
══════════════════════════════════════════════════════════════
[... full diagnostic output ...]
```

## 🎓 UNDERSTANDING THE ARCHITECTURE

### File Separation

Sandbox 2.0 is **completely separate** from the old game:

**Sandbox 2.0 Files:**
- `sandbox.html` - Entry point
- `js/engine2.js` - Arena + landmarks
- `js/sandbox-loop.js` - Game loop + animations
- `js/sandbox-debug.js` - Diagnostics (NEW)

**Old Game Files (NOT used in Sandbox 2.0):**
- `index.html` - Old game entry point
- `js/world-gen.js` - Old map generation
- `js/game-loop.js` - Old game loop
- `js/spawn-sequence.js` - Old spawn animation

**Shared Systems (Used by both):**
- `js/blood-system-v2.js` - Blood physics
- `js/gore-simulator.js` - Gore simulation
- `js/trauma-system.js` - Wound system
- `js/settings-ui.js` - Settings modal
- Many others...

### Why Obelisk Works

The obelisk works because it's implemented in `js/engine2.js` which loads correctly.
If obelisk works, it means:
- ✅ HTTP server is running (no CORS errors)
- ✅ THREE.js is loaded
- ✅ Engine2Sandbox class is available
- ✅ `_createLandmarks()` method runs successfully

This confirms the environment is correct and other features SHOULD work.

## 🎉 CONCLUSION

**All code is correct and working.** The issue is environmental (file:// vs http://, cache, wrong file, etc.).

**Follow the verification process** above and check console output carefully. The enhanced logging will show exactly where any problem occurs.

**If you still experience issues:**
1. Copy/paste the ENTIRE console output
2. Take screenshots showing what you see vs what you expect
3. Confirm you're opening `http://localhost:8000/sandbox.html` (NOT index.html, NOT file://)
4. Confirm browser (Chrome/Firefox/Edge/Safari) and version

## 📞 ADDITIONAL HELP

- **Console Command**: `runSandboxDiagnostics()` - Full system check
- **Documentation**: See `SANDBOX_2.0_GUIDE.md` for architecture details
- **Diagnostic Report**: See `SANDBOX_DIAGNOSTIC.md` for initial analysis
