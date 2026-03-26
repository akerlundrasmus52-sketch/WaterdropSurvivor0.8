// js/sandbox-loop.js — Sandbox game loop for Engine 2.0 testing.
// Spawns player + a single Slime dummy (respawns on death).
// Tests: Gun shooting → blood → dynamic EXP gem drops → pickup → Level-Up modal.
// All meshes use object pooling / InstancedMesh where available.
// Loaded LAST in sandbox.html, after all dependency scripts.

(function () {
  'use strict';

  // ─── Minimal stubs for functions from game-screens.js / game-loop.js ────────
  // These are only called optionally (e.g., evaporation effect, void gem FX).
  if (typeof spawnParticles === 'undefined') {
    window.spawnParticles = function (pos, color, count) {
      // Lightweight fallback: create tiny instanced spheres via dopamine if available
      if (window.DopamineSystem && window.DopamineSystem.spawnBurst) {
        window.DopamineSystem.spawnBurst(pos, color, count);
      }
    };
  }
  if (typeof createFloatingText === 'undefined') {
    // ── Pooled floating-text system: aggressive font, damage-scaled sizing, smooth fly-up ──
    const _FT_POOL_SIZE = 40;
    const _ftPool  = []; // available elements
    const _ftNDC   = { x: 0, y: 0 }; // reusable NDC projection (no new object)
    // Pre-allocate all floating-text divs once (called lazily on first use)
    function _ftInit() {
      if (_ftPool.length) return;
      const baseStyle = [
        'position:fixed',
        'pointer-events:none',
        'font-family:Impact,"Arial Black",Bangers,sans-serif',
        'font-weight:900',
        'letter-spacing:1px',
        'text-shadow:2px 2px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,0 0 8px rgba(0,0,0,0.7)',
        'z-index:9999',
        'will-change:transform,opacity',
        'display:none',
        'white-space:nowrap',
        'text-align:center',
        'transform-origin:center center',
      ].join(';');
      for (let _i = 0; _i < _FT_POOL_SIZE; _i++) {
        const _el = document.createElement('div');
        _el.style.cssText = baseStyle;
        document.body.appendChild(_el);
        _ftPool.push(_el);
      }
    }
    // Reusable Vector3 for world→screen projection (avoids new THREE.Vector3 per call)
    const _ftV3 = { x: 0, y: 0, z: 0, _v3: null }; // _v3 set after THREE loads
    /**
     * @param {string|number} text - Text to display
     * @param {object} pos - World position {x,y,z}
     * @param {string} color - CSS color
     * @param {number} [damageAmount=0] - Damage amount for size scaling (higher = bigger)
     */
    window.createFloatingText = function (text, pos, color, damageAmount) {
      _ftInit();
      const el = _ftPool.length ? _ftPool.pop() : null;
      if (!el) return; // pool exhausted — skip to avoid visual glitch
      el.textContent = text;
      el.style.color = color || '#FFD700';

      // Scale font size with damage: base 18px, sqrt scaling with damage, caps at 42px
      // sqrt(damage) * scale factor gives perceptible but not excessive growth
      const _DMG_FONT_SCALE = 1.8;
      const dmg = typeof damageAmount === 'number' ? damageAmount : 0;
      const fontSize = Math.min(42, Math.max(18, 18 + Math.sqrt(dmg) * _DMG_FONT_SCALE));
      el.style.fontSize = fontSize + 'px';

      el.style.transition = 'none';
      el.style.transform  = 'translate(-50%,-50%) scale(1.2)';
      el.style.opacity    = '1';
      // Project world→screen using pre-allocated Vector3
      let sx = window.innerWidth / 2, sy = window.innerHeight / 2;
      if (camera && renderer) {
        if (!_ftV3._v3) _ftV3._v3 = new THREE.Vector3();
        _ftV3._v3.set(pos.x, pos.y + 1, pos.z);
        _ftV3._v3.project(camera);
        sx = (_ftV3._v3.x * 0.5 + 0.5) * window.innerWidth;
        sy = (-_ftV3._v3.y * 0.5 + 0.5) * window.innerHeight;
      }
      // Add slight horizontal jitter for visual variety
      sx += (Math.random() - 0.5) * 30;
      el.style.left    = sx + 'px';
      el.style.top     = sy + 'px';
      el.style.display = 'block';
      requestAnimationFrame(function () {
        el.style.transition = 'transform 0.6s cubic-bezier(0.22,1,0.36,1),opacity 0.6s ease-out';
        el.style.transform  = 'translate(-50%,-50%) translateY(-70px) scale(0.7)';
        el.style.opacity    = '0';
      });
      setTimeout(function () {
        el.style.display    = 'none';
        el.style.transition = 'none';
        el.style.transform  = 'translate(-50%,-50%) scale(1.2)';
        el.style.opacity    = '1';
        _ftPool.push(el); // return to pool
      }, 650); // slightly after 0.6s transition to ensure animation completes
    };
  }
  if (typeof showYouDiedBanner === 'undefined') {
    window.showYouDiedBanner = function () {
      const b = document.getElementById('you-died-banner');
      if (b) { b.style.display = 'block'; setTimeout(function () { b.style.display = 'none'; }, 2000); }
    };
  }
  if (typeof setGamePaused === 'undefined') {
    window.setGamePaused = function (p) { window.isPaused = !!p; };
  }
  // Always override forceGameUnpause in sandbox: game-screens.js is not loaded here,
  // so we provide a reliable version that resets window.isPaused directly.
  window.forceGameUnpause = function () {
    window.isPaused = false;
    // Also reset main.js overlay counter (accessible as global let in same page scope)
    try { pauseOverlayCount = 0; window.pauseOverlayCount = 0; } catch (_) {}
    if (typeof _syncJoystickZone === 'function') _syncJoystickZone();
  };
  // ── Quest & companion stubs (quest system loads but quests aren't used yet) ──
  if (typeof progressTutorialQuest === 'undefined') {
    window.progressTutorialQuest = function () {}; // no-op: quests not active yet
  }
  if (typeof droneTurrets === 'undefined') {
    window.droneTurrets = [];
  }
  if (typeof startDroneHum === 'undefined') {
    window.startDroneHum = function () {};
  }
  if (typeof DroneTurret === 'undefined') {
    window.DroneTurret = function () { this.update = function(){}; };
  }
  if (typeof saveSaveData === 'undefined') {
    window.saveSaveData = function () {}; // no-op: no save system in sandbox
  }
  if (typeof loadSaveData === 'undefined') {
    window.loadSaveData = function () {};
  }
  if (typeof showUpgradeModal === 'undefined') {
    window.showUpgradeModal = function () {}; // fallback if level-up-system didn't load
  }
  if (typeof updateGoldDisplays === 'undefined') {
    window.updateGoldDisplays = function () {};
  }
  if (typeof showNarratorLine === 'undefined') {
    window.showNarratorLine = function () {};
  }
  if (typeof pushSuperStatEvent === 'undefined') {
    window.pushSuperStatEvent = function () {};
  }
  if (typeof showResourceToast === 'undefined') {
    window.showResourceToast = function () {};
  }
  if (typeof updateHUD === 'undefined') {
    window.updateHUD = function () {};
  }
  if (typeof showLiveStatNotification === 'undefined') {
    window.showLiveStatNotification = function () {};
  }
  if (typeof playSound === 'undefined') {
    window.playSound = function () {};
  }
  // ── Player Status Effect API ──────────────────────────────────────────────────
  // window.setPlayerStatusEffect(type, duration) — call from any damage system.
  // type: 'fire' | 'poison' | 'ice' | 'shock'
  // Updates the StatusBar CSS class and depletes the bar over `duration` seconds.
  (function () {
    var _statusContainer = null;
    var _statusFill = null;
    var _statusType = null;
    var _statusTimer = 0;
    var _statusDuration = 0;
    window.setPlayerStatusEffect = function (type, duration) {
      _statusContainer = document.getElementById('rage-bar-container');
      _statusFill = document.getElementById('rage-unified-fill');
      if (!_statusContainer) return;
      // Remove old effect class
      _statusContainer.classList.remove('status-fire','status-poison','status-ice','status-shock');
      _statusType = type;
      _statusTimer = duration;
      _statusDuration = duration;
      if (type) _statusContainer.classList.add('status-' + type);
    };
    window.clearPlayerStatusEffect = function () {
      _statusType = null;
      _statusTimer = 0;
      var c = document.getElementById('rage-bar-container');
      if (c) c.classList.remove('status-fire','status-poison','status-ice','status-shock');
      var f = document.getElementById('rage-unified-fill');
      if (f) f.style.width = '';
    };
    // Tick is called from the game loop (via addExp/updateHUD path) every frame
    window._tickPlayerStatus = function (dt) {
      if (!_statusType || _statusTimer <= 0) return;
      _statusTimer -= dt;
      if (_statusTimer <= 0) {
        window.clearPlayerStatusEffect();
      } else {
        var pct = (_statusTimer / _statusDuration) * 100;
        var f = _statusFill || document.getElementById('rage-unified-fill');
        if (f) f.style.width = Math.max(0, pct) + '%';
      }
    };
  }());
  // addExp — called by gem-classes.js ExpGem.collect() when a gem is picked up.
  // Handles EXP gain, HUD refresh, and level-up trigger.
  if (typeof window.addExp === 'undefined') {
    window.addExp = function (amount) {
      playerStats.exp += amount;
      _refreshExpBar();
      if (playerStats.exp >= playerStats.expReq) {
        playerStats.exp -= playerStats.expReq;
        playerStats.lvl++;
        // Soft early-game curve: L1→2 uses GAME_CONFIG.baseExpReq (45 XP, ~2–3 common gems),
        // then L2→3+ follow: 60 + 20*(lvl - 1)^1.3, balanced for ~65 max level.
        // L1→2: 45 XP (~2–3 gems) | L2→3: 80 XP (4 gems) | L3→4: ~109 (5–6 gems) | L10: ~356 | L65: ~4000
        playerStats.expReq = Math.floor(60 + 20 * Math.pow(playerStats.lvl - 1, 1.3));
        _onLevelUp();
      }
    };
  }
  // spawnWaterDroplet — called by player-class.js when HP < 25-30% (water bleed)
  // or during the dash ability.  Falls back to a simple one-frame particle burst.
  if (typeof spawnWaterDroplet === 'undefined') {
    window.spawnWaterDroplet = function (pos) {
      if (!pos) return;
      if (window.BloodSystem && typeof BloodSystem.emitWaterBurst === 'function') {
        BloodSystem.emitWaterBurst({ x: pos.x, y: pos.y, z: pos.z }, 1, { spreadXZ: 0.3, spreadY: 0.2 });
      }
    };
  }
  // gameOver — called by player-class.js when the player dies.  In the sandbox
  // we simply reload the page so the user can test again without a full game-over
  // screen from the main game (which requires systems not loaded here).
  if (typeof gameOver === 'undefined') {
    window.gameOver = function () {
      // Reset all new v2 systems before unloading
      if (window.BloodV2 && typeof window.BloodV2.reset === 'function') window.BloodV2.reset();
      if (window.GoreSim && typeof window.GoreSim.reset === 'function') window.GoreSim.reset();
      if (window.SlimePool && typeof window.SlimePool.reset === 'function') window.SlimePool.reset();
      if (window.WaveSpawner && typeof window.WaveSpawner.reset === 'function') window.WaveSpawner.reset();
      if (window.HitDetection && typeof window.HitDetection.reset === 'function') window.HitDetection.reset();
      if (window.LeapingSlimePool && typeof window.LeapingSlimePool.reset === 'function') window.LeapingSlimePool.reset();
      const b = document.getElementById('you-died-banner');
      if (b) {
        b.style.display = 'block';
        setTimeout(function () { location.reload(); }, GAME_OVER_RELOAD_DELAY_MS);
      } else {
        location.reload();
      }
    };
  }

  // ─── Minimal saveData stub (prevents null-checks in gem-classes / player) ───
  window.saveData = window.saveData || {
    gold: 0,
    totalGoldEarned: 0,
    cutGems: [],
    rawGems: {},
    weaponGemSlots: {},
    companionGemSlots: {},
    equippedGear: { weapon: 'gun' },
    companions: {},
    selectedCompanion: null,
    tutorialQuests: { currentQuest: null, readyToClaim: [], firstDeathShown: false, pendingBuildQuest: null, landmarksFound: null, mysteriousEggFound: false },
    tutorial: { completed: true, currentStep: 'completed' },
    upgrades: { goldEarned: 0 },
    resources: { magicEssence: 0 },
    // Rage combat system
    rageMeter: 0,
    equippedSpecials: ['knifeTakedown'], // Currently equipped special attacks
    specialAttacksLoadout: ['knifeTakedown'], // Starting special attack (legacy)
    specialAttackLevels: { knifeTakedown: 1 },
    skillTree: {
      specialKnifeTakedown: { level: 1 } // Starting attack is unlocked
    },
    // Companion system
    hasCompanionEgg: false,
    companionEggHatched: false,
    companionEggHatchProgress: 0,
    companionGrowthStage: 'newborn',
    companionSkillPoints: 0,
  };

  window.gameSettings = window.gameSettings || {
    soundEnabled: false,
    musicEnabled: false,
    controlType: 'keyboard',
    quality: 'medium',
  };

  // ─── Constants ───────────────────────────────────────────────────────────────
  const GAME_OVER_RELOAD_DELAY_MS = 2000;    // ms to show "YOU DIED" before page reload
  const SLIME_HP            = 80;
  const SLIME_SPEED         = 1.8;           // world units / second
  const SLIME_DAMAGE        = 22;            // contact damage per hit (brutally hard before upgrades)
  const PICKUP_RANGE        = 3.5;           // world units — magnetism pull starts here
  const MAGNETISM_SPEED     = 6.0;           // units/sec toward player while in range
  const ARENA_RADIUS        = 80;            // half of 200×200 arena
  const POOL_SIZE_PROJECTILES = 60;
  const PROJECTILE_SPEED    = 22;            // units/second
  const PROJECTILE_RANGE_SQ = 14 * 14;      // squared range (14 units)
  // Fallback enemy type index (BALANCED=2) used when enemies.js is not loaded
  const DEFAULT_ENEMY_TYPE  = 2;
  // Use ENEMY_TYPES from enemies.js if available, otherwise fall back to minimal stub
  const ENEMY_TYPES = window.ENEMY_TYPES || { BALANCED: DEFAULT_ENEMY_TYPE };
  // Converts walkSpeed display units → Three.js world units per frame
  // walkSpeed is a display value (25 = normal speed); factor tuned to match main game
  const MOVEMENT_TIME_SCALE  = 0.0042;
  // Half-width of the Slime HP bar plane (full width = 1.4, half = 0.7)
  const SLIME_HP_BAR_HALF_WIDTH = 0.7;
  // Enemy object pool
  const MAX_SLIMES          = 50;            // pre-allocated pool size
  const ESCALATION_INTERVAL = 30;           // seconds between difficulty increases
  // EXP gem object pool — pre-allocated so no new THREE.Mesh during gameplay
  const POOL_SIZE_GEMS      = 40;
  // Slime separation: minimum distance before soft push-apart force is applied
  const SLIME_SEPARATION_DIST  = 2.2;      // world units (increased from 1.6 to prevent overlapping)
  const SLIME_SEPARATION_FORCE = 2.5;      // push strength (units/sec) (increased from 1.0 for stronger separation)
  // XP gem drop rate bonus — probability of spawning an extra star on every enemy kill
  // ── INCREASED BY 15%: was 0.15 (15%), now 0.1725 (17.25%) ──
  const BONUS_XP_DROP_RATE = 0.1725; // 17.25% chance for a bonus star per kill (+15% increase)

  // XP magnetism range - used by ExpGem class for pickup
  magnetRange = 4.0; // Base magnetism range (world units) — uses global from main.js

  // ─── Game-feel tuning constants ──────────────────────────────────────────────
  const HIT_STOP_KILL_DURATION_MS  = 12;   // ms to freeze simulation on kill (impactful feel)
  const SHAKE_DURATION_SCALE       = 0.2;  // intensity × this = shake duration in seconds
  const SHAKE_FADE_RATE            = 6;    // amplitude fade multiplier (higher = faster fade)
  const SHAKE_HEAVY_HP_THRESHOLD   = 0.25; // hp fraction below which hits count as "heavy"
  const SHAKE_MID_HP_THRESHOLD     = 0.5;  // hp fraction for mid-tier shake
  const SHAKE_HEAVY_INTENSITY      = 0.28; // world-unit shake radius for heavy hits
  const SHAKE_MID_INTENSITY        = 0.18; // world-unit shake radius for mid hits
  const SHAKE_LIGHT_INTENSITY      = 0.10; // world-unit shake radius for light hits
  const SHAKE_KILL_BASE            = 0.35; // base shake radius on kill
  const SHAKE_KILL_SCALE           = 0.15; // per-unit-of-hitForce extra shake on kill
  const SHAKE_KILL_CAP             = 0.25; // max extra shake added from hitForce
  const COLLISION_QUERY_RADIUS     = 2.0;  // spatial hash query radius (world units)
  const COLLISION_THRESHOLD_SQ     = 1.2;  // squared distance for projectile→slime hit
  const MIN_FLASH_DURATION_SEC     = 0.001; // clamp floor for flash timer (avoids div/0)
  const DEFAULT_FLASH_COLOR        = 0xFFFF88; // fallback muzzle flash colour
  const DEFAULT_FLASH_INTENSITY    = 4.0;      // fallback PointLight intensity
  const DEFAULT_FLASH_RADIUS       = 8;        // fallback PointLight range (world units)
  const DEFAULT_FLASH_DURATION_MS  = 80;       // fallback flash duration in ms

  // ─── Module state ────────────────────────────────────────────────────────────
  let _ready    = false;
  let _lastTime = 0;
  let _rafId    = null;
  // Enemy pool (replaces single _slime)
  let _enemyPool    = [];          // pre-allocated pool of MAX_SLIMES slime objects
  let _activeSlimes = [];          // live list of currently active pool slots (fast iteration)
  let _maxActive    = 5;           // current max simultaneous active slimes
  let _waveSize     = 3;           // number of slimes to spawn per wave (Survivor-style)
  let _spawnTimer   = 1.5;         // seconds until next wave spawn
  let _spawnInterval = 4.0;        // seconds between wave spawns (decreases over time)
  let _escalationTimer = ESCALATION_INTERVAL; // seconds until next difficulty escalation
  let _allFleshChunks = [];        // global flying flesh chunk list (from all pool slots)
  let _activeCrawlers = [];        // live list of active crawler enemies
  let _activeLeapingSlimes = [];   // live list of active leaping slime enemies
  let _projPool = [];              // reusable projectile objects
  let _activeProjList = [];        // currently flying projectiles
  let _animateErrorShown = false;  // prevent spamming error display every frame
  // EXP gem object pool (pre-allocated ExpGem instances, no new THREE.Mesh during gameplay)
  let _expGemPool     = [];        // all pre-allocated gem slots
  let _expGemFreeList = [];        // slots available for reuse
  // Sword melee cooldown (sandbox double-barrel / sword fire timer)
  let _swordCooldown = 0;
  // Active weapon effect timers (for unlocked weapons in sandbox)
  let _swordEffectCooldown = 0;  // sword slash cooldown
  let _auraEffectTimer    = 0;   // aura damage tick
  // ─── Gore: Corpse Linger System ──────────────────────────────────────────────
  // Corpses linger 5-8 seconds after death with heartbeat blood pumping.
  const _activeCorpses = [];       // { slot, timer, lingerDuration, bloodTimer, poolMesh, poolMat, poolSlot }

  // ─── Corpse Blood Pool ────────────────────────────────────────────────────────
  const CORPSE_BLOOD_POOL_SIZE = 30;
  const _corpseBloodPool = [];
  const _corpseBloodFreeList = [];  // free-list: contains unused slot objects

  // Pre-allocated reusable Vector3 objects — ZERO new THREE.Vector3() during gameplay
  // Declared as plain objects first; upgraded to THREE.Vector3 after THREE is available
  // (THREE loads before sandbox-loop.js, so they become real Vector3s at IIFE boot time)
  let _tmpV3  = null; // general-purpose temp vector (set in _initScene)
  let _tmpV3b = null; // second reusable temp vector (set in _initScene)
  let _leapHitNormal = null; // scratch for leaping slime hit normal (no per-hit allocation)
  let _leapBulletDir = null; // scratch for leaping slime bullet direction (no per-hit allocation)

  // Reusable world-space position object for blood emission (avoids new {} per hit)
  const _reusableBloodPos = { x: 0, y: 0, z: 0 };

  // ─── Spatial Hashing ─────────────────────────────────────────────────────────
  // SpatialHash instance for O(1) projectile→enemy collision queries.
  // Replaces the O(n²) inner loop in _updateProjectiles when available.
  let _enemySpatialHash = null;

  // ─── Hit-Stop (Time Freeze) ───────────────────────────────────────────────────
  // When >0, the simulation is frozen for this many milliseconds.
  // The renderer still draws so the visual "freeze frame" is visible.
  let _hitStopRemaining = 0;

  // ─── Screen Shake ─────────────────────────────────────────────────────────────
  let _shakeTimer         = 0;    // seconds remaining in current shake
  let _shakePeakIntensity = 0;    // peak shake radius (world units)
  const _shakeOffset = { x: 0, z: 0 }; // applied to camera each frame

  // ─── Pooled PointLight Flash System ──────────────────────────────────────────
  // Pre-allocated PointLights for muzzle flashes / hit lights.  Zero new THREE.PointLight
  // after _buildFlashPool() is called.  Exposed as window._acquireFlash for
  // muzzle-flash-system.js to use.
  const FLASH_POOL_SIZE = 8;
  let _flashPool = [];

  // Joystick state (mobile)
  const _joy    = { dx: 0, dz: 0, active: false, id: -1, startX: 0, startZ: 0 };
  const _aimJoy = { dx: 0, dz: 0, active: false, id: -1, startX: 0, startZ: 0, fired: false };

  // Mouse aim state (desktop)
  const _mouse = { worldX: 0, worldZ: 0 };

  // ─── Weather Particle System ──────────────────────────────────────────────────
  var _weatherParticles = null;
  var _weatherGeo = null;
  var _weatherMat = null;
  var _weatherPositions = null;
  var _weatherVelocities = [];
  var _weatherActive = true;
  var WEATHER_COUNT = 800;
  var _weatherFrameCounter = 0;

  // ─── Sky Color Day/Night Cycle ────────────────────────────────────────────────
  var _skyTime = 0.25; // Start at "morning" (0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset)
  var _skySpeed = 0.008; // Full day cycle in ~125 seconds
  var _skyColors = [
    { time: 0.0,  sky: 0x0a0a1a, fog: 0x0a0a1a, ambInt: 0.15, sunInt: 0.2  },  // Midnight
    { time: 0.2,  sky: 0x1a1025, fog: 0x1a1025, ambInt: 0.2,  sunInt: 0.4  },  // Pre-dawn
    { time: 0.3,  sky: 0xff7744, fog: 0x553322, ambInt: 0.35, sunInt: 0.8  },  // Sunrise
    { time: 0.4,  sky: 0x5588cc, fog: 0x334466, ambInt: 0.4,  sunInt: 1.0  },  // Morning
    { time: 0.5,  sky: 0x4499ee, fog: 0x2a4466, ambInt: 0.45, sunInt: 1.2  },  // Noon
    { time: 0.65, sky: 0x5588cc, fog: 0x334466, ambInt: 0.4,  sunInt: 1.0  },  // Afternoon
    { time: 0.75, sky: 0xff6633, fog: 0x442211, ambInt: 0.3,  sunInt: 0.6  },  // Sunset
    { time: 0.85, sky: 0x1a1030, fog: 0x1a1030, ambInt: 0.2,  sunInt: 0.3  },  // Dusk
    { time: 1.0,  sky: 0x0a0a1a, fog: 0x0a0a1a, ambInt: 0.15, sunInt: 0.2  },  // Midnight (loop)
  ];
  // Reusable THREE.Color instances to avoid per-frame allocations in _updateSkyCycle.
  // Initialized lazily on first call so THREE is guaranteed to be loaded.
  var _skyColA = null;  // lerp source sky color
  var _skyColB = null;  // lerp target sky color
  var _fogColA = null;  // lerp source fog color
  var _fogColB = null;  // lerp target fog color

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function _lerp(a, b, t) { return a + (b - a) * t; }
  function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Display an error message on-screen so mobile users can see what went wrong.
  function _showError(msg) {
    console.error('[SandboxLoop]', msg);
    // Try #status-message first, then #tutorial-text as fallback
    const el = document.getElementById('status-message') || document.getElementById('tutorial-text');
    if (el) {
      el.style.display = 'block';
      el.style.color   = '#FF4444';
      el.style.background = 'rgba(0,0,0,0.85)';
      el.style.padding = '8px 12px';
      el.style.borderRadius = '8px';
      el.style.zIndex = '99999';
      el.style.position = 'fixed';
      el.style.top = '50%';
      el.style.left = '50%';
      el.style.transform = 'translate(-50%,-50%)';
      el.style.maxWidth = '90vw';
      el.style.fontSize = '14px';
      el.style.fontFamily = 'monospace';
      el.style.wordBreak = 'break-word';
      el.textContent = '⚠ Sandbox Error: ' + msg;
    }
  }

  // ─── Spatial Hash helpers ────────────────────────────────────────────────────

  /** Create the enemy spatial hash if the GamePerformance utility is loaded. */
  function _initSpatialHash() {
    if (window.GamePerformance && window.GamePerformance.SpatialHash) {
      _enemySpatialHash = new window.GamePerformance.SpatialHash(4); // 4-unit cells
      console.log('[SandboxLoop] Spatial hash initialized (cell size: 4)');
    }
  }

  /**
   * Re-insert every active slime into the spatial hash so projectile collision
   * queries are O(1) per projectile instead of O(n).  Call once per frame,
   * before _updateProjectiles.
   */
  function _rebuildSpatialHash() {
    if (!_enemySpatialHash) return;
    _enemySpatialHash.clear();
    for (let i = 0; i < _activeSlimes.length; i++) {
      _enemySpatialHash.insert(_activeSlimes[i]);
    }
    // Also insert active crawlers into spatial hash for collision detection
    for (let i = 0; i < _activeCrawlers.length; i++) {
      _enemySpatialHash.insert(_activeCrawlers[i]);
    }
    // Also insert active leaping slimes into spatial hash
    for (let i = 0; i < _activeLeapingSlimes.length; i++) {
      _enemySpatialHash.insert(_activeLeapingSlimes[i]);
    }
  }

  // ─── Hit-Stop & Screen Shake helpers ─────────────────────────────────────────

  /**
   * Freeze the simulation for `ms` milliseconds (renders but no updates).
   * Concurrent calls extend the freeze only if the new duration is longer.
   */
  function _triggerHitStop(ms) {
    if (ms > _hitStopRemaining) _hitStopRemaining = ms;
  }

  /**
   * Trigger a camera shake.  `intensity` is in world units — small hits pass ~0.12,
   * kills pass ~0.35.  Duration auto-scales so bigger hits shake longer.
   */
  function _triggerShake(intensity) {
    const duration = Math.min(0.5, intensity * SHAKE_DURATION_SCALE);
    if (intensity > _shakePeakIntensity) _shakePeakIntensity = intensity;
    if (duration > _shakeTimer) _shakeTimer = duration;
  }

  /** Advance the shake state each frame; writes into _shakeOffset. */
  function _updateCameraShake(dt) {
    if (_shakeTimer <= 0) {
      _shakeTimer = 0;
      _shakePeakIntensity = 0;
      _shakeOffset.x = 0;
      _shakeOffset.z = 0;
      return;
    }
    _shakeTimer = Math.max(0, _shakeTimer - dt);
    // Amplitude fades linearly as timer runs out
    const amp = _shakePeakIntensity * Math.min(1, _shakeTimer * SHAKE_FADE_RATE);
    _shakeOffset.x = (Math.random() * 2 - 1) * amp;
    _shakeOffset.z = (Math.random() * 2 - 1) * amp;
  }

  // ─── Projectile pool ─────────────────────────────────────────────────────────
  function _buildProjectilePool() {
    const geo = new THREE.SphereGeometry(0.065, 5, 5); // smaller, bullet-like
    for (let i = 0; i < POOL_SIZE_PROJECTILES; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xFFFFAA });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      _projPool.push({
        mesh: m,
        mat: mat, // store reference for color update
        active: false,
        vx: 0,
        vz: 0,
        distSq: 0,
        ox: 0,
        oz: 0,
      });
    }
  }

  function _fireProjectile(fromX, fromZ, toX, toZ) {
    const p = _projPool.find(function (o) { return !o.active; });
    if (!p) return;
    const dx = toX - fromX, dz = toZ - fromZ;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    p.vx = (dx / len) * PROJECTILE_SPEED;
    p.vz = (dz / len) * PROJECTILE_SPEED;
    p.ox = fromX;
    p.oz = fromZ;
    p.distSq = 0;
    p.active = true;
    p.mesh.position.set(fromX, 0.5, fromZ);
    p.mesh.visible = true;
    _activeProjList.push(p);
  }

  function _updateProjectiles(dt) {
    for (let i = _activeProjList.length - 1; i >= 0; i--) {
      const p = _activeProjList[i];
      if (!p.active) { _activeProjList.splice(i, 1); continue; }

      p.mesh.position.x += p.vx * dt;
      p.mesh.position.z += p.vz * dt;

      const ddx = p.mesh.position.x - p.ox;
      const ddz = p.mesh.position.z - p.oz;
      p.distSq = ddx * ddx + ddz * ddz;

      // Bullet color: bright yellow/white near muzzle (< 1 unit), copper-red farther
      if (p.mat) {
        const dist = Math.sqrt(p.distSq);
        if (dist < 1.0) {
          const t = dist;
          const r = 255, g = Math.round(255 * (1 - t * 0.2)), b = Math.round(200 * (1 - t));
          p.mat.color.setRGB(r/255, g/255, b/255);
        } else {
          const t = Math.min(1, (dist - 1.0) / 5.0);
          const r = Math.round(0xFF * (1 - t * 0.4));
          const g = Math.round(0xAA * (1 - t * 0.8));
          const b = Math.round(0x22 * (1 - t));
          p.mat.color.setRGB(r/255, g/255, b/255);
        }
      }
      if (p.distSq > PROJECTILE_RANGE_SQ) {
        // Place bullet hole when projectile reaches max range (missed target)
        _placeBulletHole(p.mesh.position.x, p.mesh.position.z);
        _releaseProjectile(p, i);
        continue;
      }

      // Collision with enemies — use spatial hash if available (O(1) per projectile)
      let hitThisFrame = false;
      if (_enemySpatialHash && (_activeSlimes.length > 0 || _activeCrawlers.length > 0 || _activeLeapingSlimes.length > 0)) {
        const nearby = _enemySpatialHash.query(p.mesh.position.x, p.mesh.position.z, COLLISION_QUERY_RADIUS);
        for (let si = 0; si < nearby.length; si++) {
          const s = nearby[si];
          if (!s.active || s.dead) continue;
          const ex = p.mesh.position.x - s.mesh.position.x;
          const ez = p.mesh.position.z - s.mesh.position.z;
          if (ex * ex + ez * ez < COLLISION_THRESHOLD_SQ) {
            if (s.enemyType === 'crawler') {
              _hitCrawler(p, s);
            } else if (s.enemyType === 'leaping_slime') {
              _hitLeapingSlime(p, s);
            } else {
              _hitSlime(p, s);
            }
            _releaseProjectile(p, i);
            hitThisFrame = true;
            break;
          }
        }
      } else {
        // Fallback: O(n²) brute-force (used when spatial-hash.js is not loaded)
        for (let si = 0; si < _activeSlimes.length; si++) {
          const s = _activeSlimes[si];
          const sx = s.mesh.position.x, sz = s.mesh.position.z;
          const ex = p.mesh.position.x - sx;
          const ez = p.mesh.position.z - sz;
          if (ex * ex + ez * ez < COLLISION_THRESHOLD_SQ) {
            _hitSlime(p, s);
            _releaseProjectile(p, i);
            hitThisFrame = true;
            break;
          }
        }
        if (!hitThisFrame) {
          // Also check crawlers in brute-force mode
          for (let ci = 0; ci < _activeCrawlers.length; ci++) {
            const c = _activeCrawlers[ci];
            if (!c.active || c.dead) continue;
            const cx = p.mesh.position.x - c.mesh.position.x;
            const cz = p.mesh.position.z - c.mesh.position.z;
            if (cx * cx + cz * cz < COLLISION_THRESHOLD_SQ) {
              _hitCrawler(p, c);
              _releaseProjectile(p, i);
              hitThisFrame = true;
              break;
            }
          }
        }
        if (!hitThisFrame) {
          // Also check leaping slimes in brute-force mode
          for (let li = 0; li < _activeLeapingSlimes.length; li++) {
            const l = _activeLeapingSlimes[li];
            if (!l.active || l.dead) continue;
            const lx = p.mesh.position.x - l.mesh.position.x;
            const lz = p.mesh.position.z - l.mesh.position.z;
            if (lx * lx + lz * lz < COLLISION_THRESHOLD_SQ) {
              _hitLeapingSlime(p, l);
              _releaseProjectile(p, i);
              hitThisFrame = true;
              break;
            }
          }
        }
      }
      if (hitThisFrame) continue;

      // Grey Boss hit detection
      if (!hitThisFrame &&
          typeof GreyBossSystem !== 'undefined' &&
          !GreyBossSystem.isDead()) {
        const bossPos = GreyBossSystem.getBossPosition();
        if (bossPos) {
          const bx = p.mesh.position.x - bossPos.x;
          const bz = p.mesh.position.z - bossPos.z;
          if (bx * bx + bz * bz < COLLISION_THRESHOLD_SQ) {
            if (typeof window._greyBossTakeDamage === 'function') {
              window._greyBossTakeDamage(p.damage || 10);
            }
            _releaseProjectile(p, i);
            hitThisFrame = true;
          }
        }
      }
      if (hitThisFrame) continue;
    }
  }

  function _releaseProjectile(p, idx) {
    p.active = false;
    p.mesh.visible = false;
    if (idx !== undefined) _activeProjList.splice(idx, 1);
  }

  // ─── Slime Pool ──────────────────────────────────────────────────────────────
  // Shared geometry for all pool slots (avoids duplicating vertex data)
  let _slimeBaseGeo = null;
  // Shared wound geometries by stage (pooled per slime slot)
  const WOUNDS_PER_STAGE = [0, 2, 2, 3, 4]; // wounds added per stage
  const MAX_WOUNDS_PER_SLIME = 11; // max total wounds across all 4 stages

  function _buildSlimePool() {
    // Build shared geometry once
    _slimeBaseGeo = new THREE.SphereGeometry(0.7, 12, 10);
    const pos = _slimeBaseGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i);
      let x = pos.getX(i);
      let z = pos.getZ(i);
      if (y < 0) { y *= 0.55; x *= 1.25; z *= 1.25; }
      else        { x *= 1.05; z *= 1.05; }
      pos.setXYZ(i, x, y, z);
    }
    _slimeBaseGeo.computeVertexNormals();

    const eyeGeo   = new THREE.SphereGeometry(0.1, 6, 6);
    const eyeMat   = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    for (let i = 0; i < MAX_SLIMES; i++) {
      // MeshPhysicalMaterial: wet, slimy, glossy look with clearcoat
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0x55EE44,
        emissive: 0x113300,
        emissiveIntensity: 0.2,
        roughness: 0.12,        // very smooth/glossy
        metalness: 0.0,
        clearcoat: 1.0,         // wet-surface clearcoat layer
        clearcoatRoughness: 0.08,
        transparent: true,
        opacity: 0.92,
      });
      const mesh = new THREE.Mesh(_slimeBaseGeo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false; // inactive until spawned
      scene.add(mesh);

      // Eye pair with tracking
      const eyePupils = [];
      const eyeMeshes = [];
      [-0.22, 0.22].forEach(function (ox) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat.clone());
        eye.position.set(ox, 0.3, 0.6);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 5), pupilMat);
        pupil.position.set(0, 0, 0.06);
        eye.add(pupil);
        mesh.add(eye);
        eyePupils.push(pupil); // Store reference for eye tracking
        eyeMeshes.push(eye);   // Store eye mesh for blink animation
      });

      // Pre-allocate wound meshes (pooled — no new THREE.Mesh during gameplay)
      const woundPool = [];
      const woundGeos = [
        new THREE.SphereGeometry(0.12, 6, 6), // stage 1 size
        new THREE.SphereGeometry(0.15, 6, 6), // stage 2 size
        new THREE.SphereGeometry(0.18, 6, 6), // stage 3 size
        new THREE.SphereGeometry(0.22, 6, 6), // stage 4 size
      ];
      for (let w = 0; w < MAX_WOUNDS_PER_SLIME; w++) {
        const wGeo  = woundGeos[Math.min(Math.floor(w / 3), 3)]; // get geo by wound index
        const wMat  = new THREE.MeshBasicMaterial({ color: 0x660000 });
        const wound = new THREE.Mesh(wGeo, wMat);
        wound.visible = false;
        mesh.add(wound);
        woundPool.push(wound);
      }

      // Pre-allocate blood splatter meshes (pooled — no new THREE.Mesh during gameplay)
      const MAX_SPLATTERS = 9;
      const splatPool = [];
      const _splatGeo = new THREE.CircleGeometry(0.09, 7);
      for (var _si = 0; _si < MAX_SPLATTERS; _si++) {
        var _sMat = new THREE.MeshBasicMaterial({
          color: 0x440000,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        var _sMesh = new THREE.Mesh(_splatGeo, _sMat);
        _sMesh.renderOrder = 4;
        _sMesh.visible = false;
        mesh.add(_sMesh);
        splatPool.push(_sMesh);
      }

      _enemyPool.push({
        mesh,
        woundPool,   // pre-allocated wound meshes (pooled, replaces old wounds array)
        woundCount: 0, // number of currently active wound meshes
        splatPool,   // pre-allocated blood splatter meshes (pooled)
        splatIndex: 0, // next splatter slot to write (ring buffer)
        eyePupils,   // Store eye pupil references for tracking
        eyeMeshes,  // eye meshes for blinking
        hp: SLIME_HP,
        maxHp: SLIME_HP,
        active: false,
        dead: false,
        flashTimer: 0,
        wobbleTime: Math.random() * Math.PI * 2,
        squishTime: 0,
        knockbackVx: 0,
        knockbackVz: 0,
        lastDamageTime: 0,
        damageStage: 0,
        // Blinking eyes
        blinkTimer: 0,
        nextBlinkTime: 2 + Math.random() * 4,
        isBlinking: false,
        // Attack lunge animation state
        attackTimer: 0,       // cooldown until next lunge
        lungeTime: 0,         // active lunge duration (0 = idle)
        lungeDirX: 0,
        lungeDirZ: 0,
        // Properties expected by Player.prototype.update (auto-aim, collision checks)
        id: 'pool-slime-' + i,
        enemyType: 'slime',
        type: 'slime',
        radius: 0.7,
        isBoss: false,
        get isDead() { return this.dead; },
        set isDead(value) { this.dead = value; },
      });
    }
  }

  function _activateSlime(slot, x, z) {
    slot.active = true;
    slot.dead = false;
    slot.hp = SLIME_HP;
    slot.flashTimer = 0;
    slot.wobbleTime = Math.random() * Math.PI * 2;
    slot.squishTime = 0;
    slot.knockbackVx = 0;
    slot.knockbackVz = 0;
    slot.lastDamageTime = 0;
    slot.damageStage = 0;
    slot.woundCount = 0; // number of active wound meshes (from pre-allocated pool)
    slot.attackTimer = 1.5 + Math.random() * 1.5; // stagger first attack
    slot.lungeTime = 0;
    slot.lungeDirX = 0;
    slot.lungeDirZ = 0;
    slot.speedMultiplier = 0.85 + Math.random() * 0.3; // Individual speed variation (0.85-1.15x)
    // Hide all pre-allocated wounds
    if (slot.woundPool) {
      for (let i = 0; i < slot.woundPool.length; i++) slot.woundPool[i].visible = false;
    }
    // Hide all pre-allocated splatters and reset ring-buffer index
    slot.splatIndex = 0;
    if (slot.splatPool) {
      for (var _spi = 0; _spi < slot.splatPool.length; _spi++) slot.splatPool[_spi].visible = false;
    }
    slot.mesh.position.set(x, 0.45, z);
    slot.mesh.material.color.setHex(0x55EE44);
    slot.mesh.material.opacity = 0.92;
    slot.mesh.material.emissiveIntensity = 0.2;
    slot.mesh.scale.set(1, 1, 1);
    slot.mesh.visible = true;
    _activeSlimes.push(slot);
    _updateSlimeHPBar(slot);
  }

  function _deactivateSlime(slot) {
    // Hide all pre-allocated splatter meshes (pooled — no dispose needed)
    slot.splatIndex = 0;
    if (slot.splatPool) {
      for (var _spi = 0; _spi < slot.splatPool.length; _spi++) slot.splatPool[_spi].visible = false;
    }
    slot.active = false;
    slot.dead = true;
    slot.mesh.visible = false;
    // Hide all wound meshes (return to pool — no dispose calls needed)
    if (slot.woundPool) {
      for (let i = 0; i < slot.woundPool.length; i++) slot.woundPool[i].visible = false;
    }
    slot.woundCount = 0;
    // Reset material for reuse
    slot.mesh.material.color.setHex(0x55EE44);
    slot.mesh.material.opacity = 0.92;
    slot.mesh.material.emissiveIntensity = 0.2;
    slot.mesh.scale.set(1, 1, 1);
    // Remove from active list
    const idx = _activeSlimes.indexOf(slot);
    if (idx !== -1) _activeSlimes.splice(idx, 1);
  }

  /** Update lingering corpses: heartbeat blood pumping, growing blood pool, eventual cleanup. */
  function _updateCorpses(dt) {
    for (let i = _activeCorpses.length - 1; i >= 0; i--) {
      const c = _activeCorpses[i];
      c.timer += dt;
      const lifeRatio = c.timer / c.lingerDuration; // 0 → 1 over linger duration

      // Grow blood pool from small to large as corpse bleeds out
      const poolRadius = 0.1 + lifeRatio * 0.6; // grows from 0.1 to 0.7 units (reduced from 1.8)
      if (c.poolMesh) {
        c.poolMesh.scale.set(poolRadius * 2, poolRadius * 2, 1); // scale the fixed-size geo (reduced from 10)
        // Darken pool as time passes (more blood = darker)
        c.poolMat.opacity = 0.75 * (1 - lifeRatio * 0.3);
      }

      // Heartbeat blood pumping: sin-wave drives burst rate
      if (window.BloodSystem && typeof BloodSystem.emitBurst === 'function') {
        const heartRate = 3.0 * (1 - lifeRatio * 0.8); // slows from 3 Hz to 0.6 Hz
        c.bloodTimer += dt;
        const heartbeat = Math.sin(c.bloodTimer * heartRate * Math.PI * 2);
        if (heartbeat > 0.85 && lifeRatio < 0.85) {
          const pressure = (1 - lifeRatio) * 0.15; // weakening pressure (reduced from 0.5 - 70% reduction)
          BloodSystem.emitBurst(
            { x: c.x, y: 0.3, z: c.z },
            Math.floor(2 + pressure * 4), // Reduced from 6 + pressure * 12 (~70% reduction)
            { spreadXZ: 0.4 * pressure, spreadY: 0.25 * pressure, minLife: 15, maxLife: 40 }
          );
        }
      }

      // After linger duration: fade out, clean up, return to pool
      if (c.timer >= c.lingerDuration) {
        // Fade out corpse mesh
        if (c.slot.mesh && c.slot.mesh.material) {
          c.slot.mesh.material.opacity -= dt * 2;
          if (c.slot.mesh.material.opacity <= 0) {
            // Fully faded — return slot to pool
            if (c.poolMesh) { c.poolMesh.visible = false; c.poolMesh.scale.set(0.2, 0.2, 0.2); }
            if (c.poolSlot) _corpseBloodFreeList.push(c.poolSlot);
            // Restore slot mesh for reuse
            c.slot.mesh.visible = false;
            c.slot.mesh.material.opacity = 0.92;
            c.slot.mesh.material.color.setHex(0x55EE44);
            c.slot.mesh.material.emissiveIntensity = 0.2;
            c.slot.mesh.scale.set(1, 1, 1);
            c.slot.woundCount = 0;
            if (c.slot.woundPool) {
              for (let w = 0; w < c.slot.woundPool.length; w++) c.slot.woundPool[w].visible = false;
            }
            // HP bars removed
            _activeCorpses.splice(i, 1);
          }
        } else {
          // No material — just clean up immediately
          if (c.poolMesh) { c.poolMesh.visible = false; c.poolMesh.scale.set(0.2, 0.2, 0.2); }
          if (c.poolSlot) _corpseBloodFreeList.push(c.poolSlot);
          _activeCorpses.splice(i, 1);
        }
      }
    }
  }

  /** Spawn a single slime from the pool at a random position around the player. */
  function _spawnSlime() {
    if (!player || !player.mesh) return;
    if (_activeSlimes.length >= _maxActive) return;
    for (let i = 0; i < _enemyPool.length; i++) {
      if (!_enemyPool[i].active) {
        const angle = Math.random() * Math.PI * 2;
        const dist  = 8 + Math.random() * 6;
        const px    = player.mesh.position.x;
        const pz    = player.mesh.position.z;
        const rx    = _clamp(px + Math.cos(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
        const rz    = _clamp(pz + Math.sin(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
        _activateSlime(_enemyPool[i], rx, rz);
        return;
      }
    }
  }

  /**
   * Survivor-style wave spawn: spawn up to _waveSize slimes at once.
   * Slimes are spread around the player with randomized positioning for varied approach patterns.
   */
  function _spawnWave() {
    if (!player || !player.mesh) return;
    const available = _maxActive - _activeSlimes.length;
    if (available <= 0) return;
    const count = Math.min(_waveSize, available);
    const px = player.mesh.position.x;
    const pz = player.mesh.position.z;
    for (let n = 0; n < count; n++) {
      // More random spawn pattern - not evenly distributed
      const angle = Math.random() * Math.PI * 2;
      const dist  = 8 + Math.random() * 7; // Increased distance variation (8-15 units)
      const rx    = _clamp(px + Math.cos(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
      const rz    = _clamp(pz + Math.sin(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
      for (let i = 0; i < _enemyPool.length; i++) {
        if (!_enemyPool[i].active) {
          _activateSlime(_enemyPool[i], rx, rz);
          break;
        }
      }
    }
  }

  /** Return the closest active (non-dead) slime to the player, or null. */
  function _getClosestActiveSlime() {
    if (!player || !player.mesh || _activeSlimes.length === 0) return null;
    const px = player.mesh.position.x, pz = player.mesh.position.z;
    let closest = null, closestDistSq = Infinity;
    for (let i = 0; i < _activeSlimes.length; i++) {
      const s = _activeSlimes[i];
      const dx = s.mesh.position.x - px;
      const dz = s.mesh.position.z - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq < closestDistSq) { closestDistSq = distSq; closest = s; }
    }
    return closest;
  }

  function _hitSlime(projectile, slot) {
    if (!slot || !slot.active || slot.dead) return;

    // Determine hit force from weapon (gun = 1.0)
    const hitForce = 1.0 + (weapons && weapons.gun ? (weapons.gun.level - 1) * 0.15 : 0);
    const damage   = weapons && weapons.gun ? weapons.gun.damage : 15;

    // Critical hit chance — playerStats.critChance is the total chance (0.0–1.0)
    const critChance = (playerStats && playerStats.critChance != null) ? playerStats.critChance : 0.10;
    const isCrit = Math.random() < critChance;
    const critMultiplier = isCrit ? (playerStats && playerStats.critDmg ? playerStats.critDmg : 1.5) : 1.0;
    const actualDmg = Math.round(damage * hitForce * critMultiplier);

    slot.hp -= actualDmg;
    slot.flashTimer = 0.1;

    // Apply knockback force — reduced to 1/4 of original to prevent stutter
    const knockbackStrength = 0.04 * hitForce;
    if (projectile && projectile.vx !== undefined && projectile.vz !== undefined) {
      slot.knockbackVx = projectile.vx * knockbackStrength;
      slot.knockbackVz = projectile.vz * knockbackStrength;
    }

    // Squish animation on hit
    slot.squishTime = 0.3;

    // ── 5-PART PROGRESSIVE DAMAGE SYSTEM ── (hpPercent declared first, used below too)
    const hpPercent = slot.hp / slot.maxHp;

    // Screen shake — scales with damage: light hit = micro-shake, heavy = harder shake
    const shakeIntensity = hpPercent < SHAKE_HEAVY_HP_THRESHOLD ? SHAKE_HEAVY_INTENSITY
                         : hpPercent < SHAKE_MID_HP_THRESHOLD   ? SHAKE_MID_INTENSITY
                         : SHAKE_LIGHT_INTENSITY;
    _triggerShake(shakeIntensity);

    // Floating damage number — reuse pre-allocated _tmpV3 (no new THREE.Vector3 per hit)
    if (isCrit) {
      _tmpV3.set(slot.mesh.position.x, 2.0, slot.mesh.position.z);
      createFloatingText(actualDmg, _tmpV3, '#FFD700', actualDmg);
      // Show "Critical" text slightly above
      _tmpV3.set(slot.mesh.position.x, 2.4, slot.mesh.position.z);
      createFloatingText('Critical', _tmpV3, '#FF4400', 0);
    } else {
      _tmpV3.set(slot.mesh.position.x, 1.5, slot.mesh.position.z);
      createFloatingText(actualDmg, _tmpV3, '#FF4444', actualDmg);
    }

    // ── GORE SIMULATOR: Connect every weapon to gore system ──────────────────
    if (window.GoreSim && typeof GoreSim.onHit === 'function') {
      _tmpV3.set(slot.mesh.position.x, slot.mesh.position.y + 0.3, slot.mesh.position.z);
      var hitNormal = null;
      if (projectile && projectile.vx !== undefined) {
        hitNormal = new THREE.Vector3(-projectile.vx, 0, -projectile.vz).normalize();
      }
      GoreSim.onHit(slot, 'pistol', _tmpV3, hitNormal);
    }

    // ── BULLET HOLE GENERATION: Create a NEW visible bullet hole on slime mesh per shot ──
    // This ensures EVERY single gun shot dynamically generates a visible bullet hole
    if (slot.woundPool && slot.woundCount >= slot.woundPool.length) slot.woundCount = 0;
    if (slot.woundPool && slot.woundCount < slot.woundPool.length) {
      const wound = slot.woundPool[slot.woundCount++];
      // Make wound appear as true black hole
      wound.material.color.setHex(0x000000);
      wound.visible = true;
      wound.renderOrder = 5;

      // Position bullet hole on surface - randomized around hit point
      // Calculate hit direction from projectile velocity
      let hitDirX = 0, hitDirZ = 0;
      if (projectile && projectile.vx !== undefined && projectile.vz !== undefined) {
        const vel = Math.sqrt(projectile.vx * projectile.vx + projectile.vz * projectile.vz) || 1;
        hitDirX = projectile.vx / vel;
        hitDirZ = projectile.vz / vel;
      }

      // Place wound at surface impact point
      const surfaceRadius = 0.68; // Approximate radius of slime body
      const woundX = hitDirX * surfaceRadius;
      const woundZ = hitDirZ * surfaceRadius;
      const woundY = -0.1 + Math.random() * 0.4; // Randomize height slightly
      wound.position.set(woundX, woundY, woundZ);

      // Scale down for bullet hole size (smaller than normal wounds)
      wound.scale.setScalar(0.28);

      // Recycle a pre-allocated splatter mesh from the pool (ring buffer)
      if (slot.splatPool && slot.splatPool.length > 0) {
        var _bsmesh = slot.splatPool[slot.splatIndex % slot.splatPool.length];
        slot.splatIndex++;
        var _bsAngle = Math.atan2(hitDirZ, hitDirX);
        var _bsRadius = 0.65 + Math.random() * 0.15;
        var _bsHeight = 0.0 + Math.random() * 0.6 - 0.2;
        _bsmesh.position.set(
          Math.cos(_bsAngle) * _bsRadius + (Math.random()-0.5)*0.1,
          _bsHeight,
          Math.sin(_bsAngle) * _bsRadius + (Math.random()-0.5)*0.1
        );
        _bsmesh.lookAt(
          Math.cos(_bsAngle) * 2,
          _bsHeight,
          Math.sin(_bsAngle) * 2
        );
        var _bsScale = 0.6 + Math.random() * 0.8;
        _bsmesh.scale.set(_bsScale, _bsScale * 1.4, 1);
        _bsmesh.rotation.z = Math.random() * Math.PI * 2;
        _bsmesh.material.opacity = 0.9;
        _bsmesh.material.color.setHex(0x440000);
        _bsmesh.userData.fadeTimer = 50 + Math.random() * 20;
        _bsmesh.visible = true;
      }
    }

    // ── 5-PART PROGRESSIVE DAMAGE SYSTEM ──────────────────────────────────────
    // (hpPercent already declared above before blood system section)

    _placeBloodStain(slot.mesh.position.x, slot.mesh.position.z, 0.15 + Math.random() * 0.25);

    if (hpPercent <= 0.75 && slot.damageStage === 0) {
      slot.damageStage = 1;
      _applyDamageStage1(slot);
    } else if (hpPercent <= 0.50 && slot.damageStage === 1) {
      slot.damageStage = 2;
      _applyDamageStage2(slot);
    } else if (hpPercent <= 0.35 && slot.damageStage === 2) {
      slot.damageStage = 3;
      _applyDamageStage3(slot);
    } else if (hpPercent <= 0.20 && slot.damageStage === 3) {
      slot.damageStage = 4;
      _applyDamageStage4(slot);
    }

    if (slot.hp <= 0) {
      _killSlime(slot, hitForce, projectile.vx || 0, projectile.vz || 0);
    } else {
      _updateSlimeHPBar(slot);
    }
  }

  function _killSlime(slot, hitForce, killVX, killVZ) {
    const x = slot.mesh.position.x;
    const y = slot.mesh.position.y + 0.4; // center of body
    const z = slot.mesh.position.z;

    // Hit-stop: freeze simulation for a brief moment — gives attacks a heavy, impactful feel
    _triggerHitStop(HIT_STOP_KILL_DURATION_MS);
    // Hard camera shake on kill (scales slightly with hit force)
    _triggerShake(SHAKE_KILL_BASE + Math.min(SHAKE_KILL_CAP, (hitForce - 1) * SHAKE_KILL_SCALE));

    // ── GORE SIMULATOR: Weapon-specific death reaction ──────────────────────
    if (window.GoreSim && typeof GoreSim.onKill === 'function') {
      GoreSim.onKill(slot, 'pistol', null);
    }

    // Hollywood-style overdone slime death burst
    window.BloodV2 && BloodV2.rawBurst(x, y, z, 80, {
      spdMin: 3, spdMax: 14, rMin: 0.010, rMax: 0.030, life: 3.5, visc: 0.55,
      enemyType: 'slime'
    });
    _spawnFleshChunks(slot, 12 + Math.floor(Math.random() * 8), true);

    // Place a blood stain decal on the ground at the kill position
    _placeBloodStain(x, z);

    // ── GORE: Corpse linger for 15 seconds with heartbeat blood pumping ──────────
    // Remove from active list but keep the mesh visible as a "corpse"
    const corpseLinger = 15; // all corpses stay on ground for 15 seconds
    const idx = _activeSlimes.indexOf(slot);
    if (idx !== -1) _activeSlimes.splice(idx, 1);
    slot.active = false;
    slot.dead = true;
    // CRITICAL FIX: Ensure corpse mesh stays visible!
    slot.mesh.visible = true;
    // Flatten the corpse mesh and darken to a bloody grey
    slot.mesh.material.color.setHex(0x1a4a1a);
    slot.mesh.material.emissiveIntensity = 0.05;
    slot.mesh.scale.set(1.4, 0.35, 1.4); // squish flat on ground
    slot.mesh.position.y = 0.12; // lay on ground
    // Reset eye pupils to center (dead stare)
    if (slot.eyePupils) {
      slot.eyePupils.forEach(pupil => {
        pupil.position.x = 0;
        pupil.position.z = 0.06; // Center position
      });
    }
    // HP bars removed
    // Growing blood pool under corpse
    const _cbSlot = _acquireCorpseBlood(x, 0.06, z, 0x550000);
    _activeCorpses.push({ slot, timer: 0, lingerDuration: corpseLinger, bloodTimer: 0, poolMesh: _cbSlot?.mesh || null, poolMat: _cbSlot?.mat || null, poolSlot: _cbSlot || null, x, z });

    // ══════════ NEW XP STAR SYSTEM V2 ══════════
    // Spawn XP stars instantly when HP reaches 0
    // Stars spawn with physics based on kill damage and proper enemy colors
    const killDamage = slot.maxHp * hitForce; // Estimate kill damage from hitForce

    // Spawn primary star (guaranteed)
    if (window.XPStarSystem) {
      XPStarSystem.spawn(x, y, z, 'slime', killDamage, killVX || 0, killVZ || 0);

      // Bonus star (17.25% chance)
      if (Math.random() < BONUS_XP_DROP_RATE) {
        XPStarSystem.spawn(x, y, z, 'slime', killDamage * 0.8, killVX || 0, killVZ || 0);
      }
    }

    _tmpV3.set(x, 1.8, z);

    playerStats.kills++;

    if (window.GameRageCombat && typeof GameRageCombat.addRage === 'function') {
      GameRageCombat.addRage(8);
    }
    if (window.GameMilestones && typeof GameMilestones.recordKill === 'function') {
      GameMilestones.recordKill();
    }
  }

  function _updateSlimeHPBar(slot) {
    // HP bars removed - function kept for compatibility but does nothing
  }

  // ─── CRAWLER HIT & KILL ───────────────────────────────────────────────────────
  function _hitCrawler(projectile, crawler) {
    if (!crawler || !crawler.active || crawler.dead || crawler.dying) return;

    const hitForce = 1.0 + (weapons && weapons.gun ? (weapons.gun.level - 1) * 0.15 : 0);
    const damage   = weapons && weapons.gun ? weapons.gun.damage : 15;
    const critChance = (playerStats && playerStats.critChance != null) ? playerStats.critChance : 0.10;
    const isCrit = Math.random() < critChance;
    const critMultiplier = isCrit ? (playerStats && playerStats.critDmg ? playerStats.critDmg : 1.5) : 1.0;
    const actualDmg = Math.round(damage * hitForce * critMultiplier);

    crawler.hp -= actualDmg;
    crawler.flashTimer = 0.1;
    crawler.squishTime = 0.3;

    // Knockback
    if (projectile && projectile.vx !== undefined) {
      crawler.knockbackVx = projectile.vx * 0.03 * hitForce;
      crawler.knockbackVz = projectile.vz * 0.03 * hitForce;
    }

    // Floating damage text
    const cx = crawler.mesh.position.x;
    const cz = crawler.mesh.position.z;
    if (isCrit) {
      _tmpV3.set(cx, 2.0, cz);
      createFloatingText(actualDmg, _tmpV3, '#FFD700', actualDmg);
      _tmpV3.set(cx, 2.4, cz);
      createFloatingText('Critical', _tmpV3, '#FF4400', 0);
    } else {
      _tmpV3.set(cx, 1.5, cz);
      createFloatingText(actualDmg, _tmpV3, '#FF4444', actualDmg);
    }

    // Blood from crawler (brown/amber blood)
    _reusableBloodPos.x = cx;
    _reusableBloodPos.y = 0.5;
    _reusableBloodPos.z = cz;
    // Gore simulator
    if (window.GoreSim && typeof GoreSim.onHit === 'function') {
      _tmpV3.set(cx, 0.4, cz);
      var hitNormal = null;
      if (projectile && projectile.vx !== undefined) {
        hitNormal = new THREE.Vector3(-projectile.vx, 0, -projectile.vz).normalize();
      }
      GoreSim.onHit(crawler, 'pistol', _tmpV3, hitNormal);
    }

    // Bullet hole on crawler
    if (crawler.woundPool && crawler.woundCount >= crawler.woundPool.length) crawler.woundCount = 0;
    if (crawler.woundPool && crawler.woundCount < crawler.woundPool.length) {
      const wound = crawler.woundPool[crawler.woundCount++];
      wound.material.color.setHex(0x441100);
      wound.visible = true;
      wound.position.set(
        (Math.random() - 0.5) * 0.3,
        0.1 + Math.random() * 0.2,
        (Math.random() - 0.5) * 0.5
      );
      wound.scale.setScalar(0.5);
    }

    if (crawler.hp <= 0) {
      _killCrawler(crawler, hitForce, projectile.vx || 0, projectile.vz || 0);
    } else {
      _placeBloodStain(cx, cz, 0.15 + Math.random() * 0.25);
    }
  }

  function _killCrawler(crawler, hitForce, killVX, killVZ) {
    const x = crawler.mesh.position.x;
    const y = 0.4;
    const z = crawler.mesh.position.z;

    _triggerHitStop(HIT_STOP_KILL_DURATION_MS * 1.5);
    _triggerShake(SHAKE_KILL_BASE * 1.3 + Math.min(SHAKE_KILL_CAP, (hitForce - 1) * SHAKE_KILL_SCALE));

    // Gore sim kill
    if (window.GoreSim && typeof GoreSim.onKill === 'function') {
      GoreSim.onKill(crawler, 'pistol', null);
    }

    // Hollywood-style overdone crawler death burst
    window.BloodV2 && BloodV2.rawBurst(x, y, z, 60, { enemyType: 'crawler' });

    // Spawn brown crawler/worm flesh chunks
    const crawlerColors = [0x8B4513, 0x6B3410, 0x5C3010, 0xDEB887];
    _spawnFleshChunks(crawler, 6 + Math.floor(Math.random() * 5), true, crawlerColors);

    _placeBloodStain(x, z);

    // Mark as dying (crawler death animation handles fade)
    crawler.dying = true;
    crawler.deathTimer = 0;
    const cidx = _activeCrawlers.indexOf(crawler);
    if (cidx !== -1) _activeCrawlers.splice(cidx, 1);

    // Corpse stays 15 seconds
    const _cbSlot2 = _acquireCorpseBlood(x, 0.03, z, 0x442200, 0.7);
    _activeCorpses.push({ slot: crawler, timer: 0, lingerDuration: 45, bloodTimer: 0, poolMesh: _cbSlot2?.mesh || null, poolMat: _cbSlot2?.mat || null, poolSlot: _cbSlot2 || null, x, z });

    // ══════════ NEW XP STAR SYSTEM V2 ══════════
    // Crawler drops green stars — use actual maxHp to keep scaling consistent
    const crawlerBaseHp =
      (typeof crawler.maxHp === 'number' && crawler.maxHp > 0)
        ? crawler.maxHp
        : (window.CRAWLER_CFG && typeof CRAWLER_CFG.BASE_HP === 'number' && CRAWLER_CFG.BASE_HP > 0)
          ? CRAWLER_CFG.BASE_HP
          : 250;
    const killDamage = crawlerBaseHp * hitForce;

    if (window.XPStarSystem) {
      XPStarSystem.spawn(x, y, z, 'crawler', killDamage, killVX || 0, killVZ || 0);

      // Bonus drop (higher rate for crawler: 25.875%)
      if (Math.random() < BONUS_XP_DROP_RATE * 1.5) {
        XPStarSystem.spawn(x, y, z, 'crawler', killDamage * 0.8, killVX || 0, killVZ || 0);
      }
    }

    playerStats.kills++;
    if (window.GameRageCombat && typeof GameRageCombat.addRage === 'function') {
      GameRageCombat.addRage(12);
    }
  }

  /** Spawn crawlers alongside slimes during waves */
  function _spawnCrawler() {
    if (!window.CrawlerPool || !player || !player.mesh) return;
    const angle = Math.random() * Math.PI * 2;
    const dist  = 10 + Math.random() * 8;
    const px    = player.mesh.position.x;
    const pz    = player.mesh.position.z;
    const rx    = _clamp(px + Math.cos(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
    const rz    = _clamp(pz + Math.sin(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
    const waveLevel = Math.floor(_waveSize / 4) + 1;
    const c = CrawlerPool.spawn(rx, rz, waveLevel);
    if (c) {
      _activeCrawlers.push(c);
    }
  }

  /** Update crawlers: contact damage to player */
  function _updateCrawlers(dt) {
    if (!window.CrawlerPool || !player || !player.mesh) return;
    const playerPos = player.mesh.position;
    CrawlerPool.update(dt, playerPos);

    // Refresh active list and handle contact damage
    for (let i = _activeCrawlers.length - 1; i >= 0; i--) {
      const c = _activeCrawlers[i];
      if (!c.active || c.dying) {
        _activeCrawlers.splice(i, 1);
        continue;
      }
      // Contact damage (crawler does more damage than slimes)
      const dx = playerPos.x - c.mesh.position.x;
      const dz = playerPos.z - c.mesh.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 1.3 && !player.invulnerable) {
        const now = Date.now();
        if (now - c.lastDamageTime > 400) {
          c.lastDamageTime = now;
          const crawlerDmg = window.CRAWLER_CFG ? window.CRAWLER_CFG.BASE_DAMAGE : 18;
          if (typeof player.takeDamage === 'function') {
            player.takeDamage(crawlerDmg, 'crawler', c.mesh.position);
          } else {
            playerStats.hp -= crawlerDmg;
          }
          if (playerStats && playerStats.hp <= 0) {
            playerStats.hp = 0;
            gameOver();
          }
        }
      }
    }
  }

  // ─── LEAPING SLIME ENEMY ─────────────────────────────────────────────────────

  /** Apply a projectile hit to a leaping slime. */
  function _hitLeapingSlime(projectile, enemy) {
    if (!enemy || !enemy.active || enemy.dead || enemy.dying) return;

    if (enemy.woundPool && enemy.woundCount >= enemy.woundPool.length) enemy.woundCount = 0;

    const weaponKey   = (weapons && weapons.gun) ? 'gun' : 'pistol';
    const weaponLevel = (weapons && weapons.gun) ? (weapons.gun.level || 1) : 1;
    const hitForce    = 1.0 + (weaponLevel - 1) * 0.15;

    // Build hit-point and direction vectors from projectile position
    _tmpV3.set(
      enemy.mesh.position.x,
      enemy.mesh.position.y + enemy.size,
      enemy.mesh.position.z
    );
    var hitNormal = null;
    var bulletDir = null;
    if (projectile && projectile.vx !== undefined) {
      const spd = Math.sqrt(projectile.vx * projectile.vx + projectile.vz * projectile.vz) || 1;
      hitNormal = _leapHitNormal.set(-projectile.vx / spd, 0, -projectile.vz / spd);
      bulletDir = _leapBulletDir.set(projectile.vx / spd, 0, projectile.vz / spd);
    }

    // Critical hit check (uses same playerStats as slimes)
    const critChance = (playerStats && playerStats.critChance != null) ? playerStats.critChance : 0.10;
    const isCrit = Math.random() < critChance;
    const critMult = isCrit ? (playerStats && playerStats.critDmg ? playerStats.critDmg : 1.5) : 1.0;

    // Apply hit — the LeapingSlimeEnemy.receiveHit applies base damage; scale by crit
    const result = window.LeapingSlimePool
      ? window.LeapingSlimePool.hit(enemy, weaponKey, weaponLevel, _tmpV3, hitNormal, bulletDir)
      : null;

    const actualDmg = result
      ? Math.round(result.damage * (isCrit ? critMult : 1.0))
      : Math.round(15 * hitForce * critMult);

    // Extra crit damage not already applied inside receiveHit.
    // Apply even on killing blows so HP reduction matches the displayed crit damage,
    // but clamp HP to zero to avoid negative values.
    if (isCrit && result) {
      const extraCritDmg = Math.round(result.damage * (critMult - 1.0));
      if (extraCritDmg > 0) {
        enemy.hp -= extraCritDmg;
        if (enemy.hp < 0) enemy.hp = 0;
      }
    }

    // Floating damage text — reuse _tmpV3b to avoid _tmpV3.clone() allocation
    _tmpV3b.set(_tmpV3.x, _tmpV3.y + 0.5, _tmpV3.z);
    if (isCrit) {
      createFloatingText(actualDmg, _tmpV3b, '#FFD700', actualDmg);
      _tmpV3b.y += 0.4;
      createFloatingText('Critical', _tmpV3b, '#FF4400', 0);
    } else {
      createFloatingText(actualDmg, _tmpV3b, '#00CFFF', actualDmg);
    }

    // Light-blue blood burst (DeepSkyBlue) — use BloodV2 rawBurst if available
    const bx = enemy.mesh.position.x, by = enemy.mesh.position.y + enemy.size, bz = enemy.mesh.position.z;
    if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
      BloodV2.rawBurst(bx, by, bz, 6, { enemyType: 'leaping_slime' });
    } else if (window.BloodSystem && typeof BloodSystem.emitBurst === 'function') {
      BloodSystem.emitBurst({ x: bx, y: by, z: bz }, 5, { spreadXZ: 1.0, spreadY: 0.4 });
    }

    // GoreSim hit reaction
    if (window.GoreSim && typeof GoreSim.onHit === 'function') {
      GoreSim.onHit(enemy, weaponKey, _tmpV3, hitNormal);
    }

    // Screen shake (lighter than green slime — it's smaller)
    const hpRatio = enemy.hp / enemy.maxHp;
    const shakeAmt = hpRatio < 0.33 ? SHAKE_HEAVY_INTENSITY * 0.6
                   : hpRatio < 0.66 ? SHAKE_MID_INTENSITY   * 0.6
                   :                  SHAKE_LIGHT_INTENSITY  * 0.6;
    _triggerShake(shakeAmt);

    if (enemy.hp <= 0) {
      _killLeapingSlime(enemy, hitForce, projectile ? projectile.vx || 0 : 0, projectile ? projectile.vz || 0 : 0);
    } else {
      _placeBloodStain(enemy.mesh.position.x, enemy.mesh.position.z, 0.15 + Math.random() * 0.25);
    }
  }

  /** Kill a leaping slime, spawn loot and effects. */
  function _killLeapingSlime(enemy, hitForce, killVX, killVZ) {
    if (!enemy || enemy.dead) return;
    const x = enemy.mesh.position.x;
    const y = enemy.mesh.position.y + enemy.size;
    const z = enemy.mesh.position.z;

    // Hit-stop & camera shake (lighter than green slime kill)
    _triggerHitStop(HIT_STOP_KILL_DURATION_MS * 0.8);
    _triggerShake(SHAKE_KILL_BASE * 0.7 + Math.min(SHAKE_KILL_CAP * 0.7, (hitForce - 1) * SHAKE_KILL_SCALE));

    // Light-blue gore burst
    if (window.BloodV2 && typeof BloodV2.rawBurst === 'function') {
      BloodV2.rawBurst(x, y, z, 18, { enemyType: 'leaping_slime' });
    } else if (window.BloodSystem) {
      if (typeof BloodSystem.emitBurst === 'function') {
        BloodSystem.emitBurst({ x, y, z }, 18, { spreadXZ: 2.5, spreadY: 1.0, minLife: 40, maxLife: 100 });
      }
      if (typeof BloodSystem.emitGuts === 'function') {
        BloodSystem.emitGuts({ x, y, z }, 6);
      }
    }

    // GoreSim kill
    if (window.GoreSim && typeof GoreSim.onKill === 'function') {
      GoreSim.onKill(enemy, 'pistol', null);
    }

    // Hollywood-style overdone leaping slime death burst
    window.BloodV2 && BloodV2.rawBurst(x, y, z, 60, { enemyType: 'leaping_slime' });

    // Spawn blue slime flesh chunks
    const blueSlimeColors = [0x00bfff, 0x0090cc, 0x005f99, 0x00ffff];
    _spawnFleshChunks(enemy, 4 + Math.floor(Math.random() * 3), false, blueSlimeColors);

    _placeBloodStain(x, z);

    // Remove from active list
    const idx = _activeLeapingSlimes.indexOf(enemy);
    if (idx !== -1) _activeLeapingSlimes.splice(idx, 1);

    // Trigger death animation inside the instance — set _tmpV3 to kill position first
    _tmpV3.set(x, y, z);
    enemy._die('pistol', _tmpV3);

    // Linger corpse (8 seconds — shorter than slime's 15s or crawler's 45s)
    const _cbSlot3 = _acquireCorpseBlood(x, 0.03, z, 0x007799, 0.5);
    _activeCorpses.push({
      slot: enemy, timer: 0, lingerDuration: 8, bloodTimer: 0,
      poolMesh: _cbSlot3?.mesh || null, poolMat: _cbSlot3?.mat || null, poolSlot: _cbSlot3 || null, x, z
    });

    // ══════════ NEW XP STAR SYSTEM V2 ══════════
    // Leaping slime drops grey/white stars (common)
    const killDamage = enemy.maxHp * hitForce;

    if (window.XPStarSystem) {
      XPStarSystem.spawn(x, y, z, 'leaping_slime', killDamage, killVX || 0, killVZ || 0);

      // Bonus star (17.25% chance)
      if (Math.random() < BONUS_XP_DROP_RATE) {
        XPStarSystem.spawn(x, y, z, 'leaping_slime', killDamage * 0.7, killVX || 0, killVZ || 0);
      }
    }

    playerStats.kills++;
    if (window.GameRageCombat && typeof GameRageCombat.addRage === 'function') {
      GameRageCombat.addRage(8);
    }
  }

  /** Spawn one leaping slime near the player. */
  function _spawnLeapingSlime() {
    if (!window.LeapingSlimePool || !player || !player.mesh) return;
    const angle = Math.random() * Math.PI * 2;
    const dist  = 9 + Math.random() * 6;
    const px    = player.mesh.position.x;
    const pz    = player.mesh.position.z;
    const rx    = _clamp(px + Math.cos(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
    const rz    = _clamp(pz + Math.sin(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
    const waveLevel = Math.floor(_waveSize / 3) + 1;
    const e = LeapingSlimePool.spawn(rx, rz, waveLevel);
    if (e && _activeLeapingSlimes.indexOf(e) === -1) {
      _activeLeapingSlimes.push(e);
    }
  }

  /** Update leaping slimes: pool tick, contact damage to player, cleanup dead. */
  function _updateLeapingSlimes(dt) {
    if (!window.LeapingSlimePool || !player || !player.mesh) return;
    const playerPos = player.mesh.position;
    LeapingSlimePool.update(dt, playerPos);

    const LEAPING_CONTACT_RADIUS =
      window.LEAP_CFG && typeof LEAP_CFG.ATTACK_RANGE === 'number'
        ? LEAP_CFG.ATTACK_RANGE
        : 1.0; // fallback: smaller than green slime (0.75 base size)
    const LEAPING_DAMAGE  = window.LEAP_CFG ? LEAP_CFG.BASE_DAMAGE    : 15;
    const LEAPING_COOLDOWN = window.LEAP_CFG ? LEAP_CFG.ATTACK_COOLDOWN : 500;

    for (let i = _activeLeapingSlimes.length - 1; i >= 0; i--) {
      const e = _activeLeapingSlimes[i];
      if (!e.active || e.dead) {
        _activeLeapingSlimes.splice(i, 1);
        continue;
      }
      // Skip dying ones (still animating their death)
      if (e.dying) continue;

      // Contact damage to player
      const dx   = playerPos.x - e.mesh.position.x;
      const dz   = playerPos.z - e.mesh.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < LEAPING_CONTACT_RADIUS && !player.invulnerable) {
        const now = Date.now();
        if (now - e.lastDamageTime > LEAPING_COOLDOWN) {
          e.lastDamageTime = now;
          if (typeof player.takeDamage === 'function') {
            player.takeDamage(LEAPING_DAMAGE, 'leaping_slime', e.mesh.position);
          } else {
            playerStats.hp -= LEAPING_DAMAGE;
          }
          if (playerStats && playerStats.hp <= 0) {
            playerStats.hp = 0;
            gameOver();
          }
        }
      }
    }
  }

  // ─── 5-PART GORE SYSTEM ───────────────────────────────────────────────────────
  /**
   * Acquire the next available pre-allocated wound mesh from the slot's pool.
   * Returns null if the pool is exhausted (won't happen within 11 wounds).
   */
  function _acquireWound(slot, woundColor) {
    if (!slot.woundPool || slot.woundCount >= slot.woundPool.length) return null;
    const wound = slot.woundPool[slot.woundCount++];
    wound.material.color.setHex(woundColor || 0x660000);
    wound.visible = true;
    return wound;
  }

  // Stage 1: 75% HP - Darken appearance, add first wounds, start arterial bleeding
  function _applyDamageStage1(slot) {
    slot.mesh.material.color.setHex(0x44CC33);
    slot.mesh.material.emissiveIntensity = 0.15;

    for (let i = 0; i < 2; i++) {
      const wound = _acquireWound(slot, 0x660000);
      if (wound) {
        const angle = Math.random() * Math.PI * 2;
        const height = -0.2 + Math.random() * 0.6;
        wound.position.set(Math.cos(angle) * 0.5, height, Math.sin(angle) * 0.5);
      }
    }

    const _bPos1 = _reusableBloodPos;
    _bPos1.x = slot.mesh.position.x; _bPos1.y = slot.mesh.position.y + 0.4; _bPos1.z = slot.mesh.position.z;
    if (window.BloodSystem) {
      // Increased from 8 to 10 to match old map realism
      if (typeof BloodSystem.emitBurst === 'function') {
        BloodSystem.emitBurst(_bPos1, 10, { spreadXZ: 0.8, spreadY: 0.4, minLife: 50, maxLife: 100 });
      }
      // Start pulsing heartbeat bleed (arterial spurts from wound)
      if (typeof BloodSystem.emitHeartbeatWound === 'function') {
        BloodSystem.emitHeartbeatWound(_bPos1, { pulses: 4, perPulse: 80, interval: 400, woundHeight: 0.6 });
      }
      // ADD: Arterial spurt effect like old map (narrow jet, high pressure)
      if (typeof BloodSystem.emitArterialSpurt === 'function') {
        const facingDir = { x: Math.cos(Math.random() * Math.PI * 2), z: Math.sin(Math.random() * Math.PI * 2) };
        BloodSystem.emitArterialSpurt(_bPos1, facingDir, {
          pulses: 5,
          perPulse: 50,
          interval: 180,
          intensity: 0.7,
          coneAngle: 0.3
        });
      }
    }
    _tmpV3.set(slot.mesh.position.x, 1.6, slot.mesh.position.z);
    // Damage stage text removed — keep screen clean (only damage numbers + Critical)
  }

  // Stage 2: 50% HP - More wounds, flesh chunks start flying
  function _applyDamageStage2(slot) {
    slot.mesh.material.color.setHex(0x33AA22);

    for (let i = 0; i < 2; i++) {
      const wound = _acquireWound(slot, 0x550000);
      if (wound) {
        const angle = Math.random() * Math.PI * 2;
        const height = -0.2 + Math.random() * 0.6;
        wound.position.set(Math.cos(angle) * 0.5, height, Math.sin(angle) * 0.5);
      }
    }

    _spawnFleshChunks(slot, 4 + Math.floor(Math.random() * 4), false, slot.mesh.material.color.getHex());
    var stageColor2 = slot.mesh.material.color.getHex();
    _spawnFleshChunks(slot, 2 + Math.floor(Math.random() * 2), false, [stageColor2]);

    const _bPos2 = _reusableBloodPos;
    _bPos2.x = slot.mesh.position.x; _bPos2.y = slot.mesh.position.y + 0.4; _bPos2.z = slot.mesh.position.z;
    if (window.BloodSystem) {
      // Tuned burst count to 18 to match old map impact
      if (typeof BloodSystem.emitBurst === 'function') {
        BloodSystem.emitBurst(_bPos2, 18, { spreadXZ: 1.5, spreadY: 0.6, minLife: 50, maxLife: 100 });
      }
      if (typeof BloodSystem.emitGuts === 'function') {
        BloodSystem.emitGuts(_bPos2, 6);
      }
      if (typeof BloodSystem.emitHeartbeatWound === 'function') {
        BloodSystem.emitHeartbeatWound(_bPos2, { pulses: 3, perPulse: 25, interval: 200, woundHeight: 0.8 });
      }
    }
    _tmpV3.set(slot.mesh.position.x, 1.7, slot.mesh.position.z);
    // Damage stage text removed — keep screen clean (only damage numbers + Critical)
  }

  // Stage 3: 35% HP - Body parts breaking off, heavy bleeding
  function _applyDamageStage3(slot) {
    slot.mesh.material.color.setHex(0x228811);
    slot.mesh.material.opacity = 0.85;
    slot.mesh.scale.set(0.92, 0.92, 0.92);

    for (let i = 0; i < 3; i++) {
      const wound = _acquireWound(slot, 0x440000);
      if (wound) {
        const angle = Math.random() * Math.PI * 2;
        const height = -0.2 + Math.random() * 0.6;
        wound.position.set(Math.cos(angle) * 0.45, height, Math.sin(angle) * 0.45);
      }
    }

    _spawnFleshChunks(slot, 6 + Math.floor(Math.random() * 6), false, slot.mesh.material.color.getHex());
    var stageColor3 = slot.mesh.material.color.getHex();
    _spawnFleshChunks(slot, 3 + Math.floor(Math.random() * 3), false, [stageColor3]);

    const _bPos3 = _reusableBloodPos;
    _bPos3.x = slot.mesh.position.x; _bPos3.y = slot.mesh.position.y + 0.4; _bPos3.z = slot.mesh.position.z;
    if (window.BloodSystem) {
      // Burst count tuned to 25 to approximate old map's sniper hit intensity
      if (typeof BloodSystem.emitBurst === 'function') {
        BloodSystem.emitBurst(_bPos3, 25, { spreadXZ: 2.0, spreadY: 0.8, minLife: 50, maxLife: 100 });
      }
      if (typeof BloodSystem.emitGuts === 'function') {
        BloodSystem.emitGuts(_bPos3, 12);
      }
      if (typeof BloodSystem.emitHeartbeatWound === 'function') {
        BloodSystem.emitHeartbeatWound(_bPos3, { pulses: 4, perPulse: 30, interval: 180, woundHeight: 1.0 });
      }
      if (typeof BloodSystem.emitExitWound === 'function') {
        const a = Math.random() * Math.PI * 2;
        BloodSystem.emitExitWound(_bPos3, { x: Math.cos(a) * 0.3, y: 0.1, z: Math.sin(a) * 0.3 });
      }
      // ADD: Throat spray effect (fan spray like old map)
      if (typeof BloodSystem.emitThroatSpray === 'function') {
        const facingDir = { x: Math.cos(Math.random() * Math.PI * 2), z: Math.sin(Math.random() * Math.PI * 2) };
        BloodSystem.emitThroatSpray(_bPos3, facingDir, {
          pulses: 6,
          perPulse: 50,
          interval: 180
        });
      }
    }
    _tmpV3.set(slot.mesh.position.x, 1.8, slot.mesh.position.z);
    // Damage stage text removed — keep screen clean (only damage numbers + Critical)
  }

  // Stage 4: 20% HP - Near death, chunks flying everywhere
  function _applyDamageStage4(slot) {
    slot.mesh.material.color.setHex(0x116600);
    slot.mesh.material.opacity = 0.75;
    slot.mesh.material.emissiveIntensity = 0.05;
    slot.mesh.scale.set(0.85, 0.85, 0.85);

    for (let i = 0; i < 4; i++) {
      const wound = _acquireWound(slot, 0x330000);
      if (wound) {
        const angle = Math.random() * Math.PI * 2;
        const height = -0.2 + Math.random() * 0.6;
        wound.position.set(Math.cos(angle) * 0.4, height, Math.sin(angle) * 0.4);
      }
    }

    _spawnFleshChunks(slot, 8 + Math.floor(Math.random() * 6), true, slot.mesh.material.color.getHex());
    var stageColor4 = slot.mesh.material.color.getHex();
    _spawnFleshChunks(slot, 4 + Math.floor(Math.random() * 3), true, [stageColor4]);

    const _bPos4 = _reusableBloodPos;
    _bPos4.x = slot.mesh.position.x; _bPos4.y = slot.mesh.position.y + 0.4; _bPos4.z = slot.mesh.position.z;
    if (window.BloodSystem) {
      if (typeof BloodSystem.emitBurst === 'function') {
        BloodSystem.emitBurst(_bPos4, 15, { spreadXZ: 2.5, spreadY: 1.0 });
      }
      if (typeof BloodSystem.emitGuts === 'function') {
        BloodSystem.emitGuts(_bPos4, 18);
      }
      if (typeof BloodSystem.emitHeartbeatWound === 'function') {
        BloodSystem.emitHeartbeatWound(_bPos4, { pulses: 4, perPulse: 35, interval: 200, woundHeight: 1.2, pressure: 1.3 });
      }
      if (typeof BloodSystem.emitExitWound === 'function') {
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          BloodSystem.emitExitWound(_bPos4, { x: Math.cos(a) * 0.4, y: 0.15, z: Math.sin(a) * 0.4 });
        }
      }
    }
    _tmpV3.set(slot.mesh.position.x, 1.9, slot.mesh.position.z);
    // Damage stage text removed — keep screen clean (only damage numbers + Critical)
  }

  // ─── Blood ground stain decal pool ───────────────────────────────────────────
  // Pre-allocated circular planes placed on the floor at enemy kill/hit positions.
  // Uses a ring-buffer so oldest stains are recycled when the pool is full.
  const BLOOD_STAIN_POOL_SIZE = 30;
  const _bloodStainPool = [];
  let _bloodStainHead = 0; // ring-buffer index

  function _buildBloodStainPool() {
    const stainGeo = new THREE.CircleGeometry(0.8, 16);
    for (let i = 0; i < BLOOD_STAIN_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x550000,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(stainGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.06, 0);
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      _bloodStainPool.push({ mesh, fadeTimer: 0 });
    }
  }

  function _buildCorpseBloodPool() {
    const geo = new THREE.CircleGeometry(0.1, 10);
    for (let i = 0; i < CORPSE_BLOOD_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x550000,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.06, 0);
      mesh.visible = false;
      scene.add(mesh);
      const slot = { mesh, mat };
      _corpseBloodPool.push(slot);
      _corpseBloodFreeList.push(slot);
    }
  }

  function _acquireCorpseBlood(x, y, z, color, opacity) {
    if (_corpseBloodFreeList.length === 0) return null;
    const slot = _corpseBloodFreeList.pop();
    slot.mesh.scale.set(0.2, 0.2, 0.2);
    slot.mesh.position.set(x, y, z);
    slot.mat.color.setHex(color || 0x550000);
    slot.mat.opacity = (typeof opacity === 'number') ? opacity : 0.75;
    slot.mesh.visible = true;
    return slot;
  }

  /**
   * Place a blood stain at (x, z) when an enemy dies.
   * Stains fade in quickly and then very slowly fade out over ~20 seconds.
   */
  function _placeBloodStain(x, z, sizeOverride) {
    const slot = _bloodStainPool[_bloodStainHead % BLOOD_STAIN_POOL_SIZE];
    _bloodStainHead++;
    if (!slot) return;
    const size = sizeOverride !== undefined ? sizeOverride : (0.6 + Math.random() * 0.9);
    slot.mesh.scale.set(size, size, size);
    slot.mesh.position.set(x + (Math.random() - 0.5) * 0.3, 0.06, z + (Math.random() - 0.5) * 0.3);
    slot.mesh.rotation.z = Math.random() * Math.PI * 2;
    slot.mesh.material.opacity = 0;
    slot.mesh.visible = true;
    slot.fadeTimer = 20.0; // seconds to live
    slot.fadeIn = 0.5; // seconds to fade in
    slot.age = 0;
  }

  function _updateBloodStains(dt) {
    for (let i = 0; i < _bloodStainPool.length; i++) {
      const s = _bloodStainPool[i];
      if (!s.mesh.visible) continue;
      s.age += dt;
      if (s.age < s.fadeIn) {
        s.mesh.material.opacity = Math.min(0.7, (s.age / s.fadeIn) * 0.7);
      } else {
        const remaining = s.fadeTimer - s.age;
        s.mesh.material.opacity = Math.max(0, (remaining / (s.fadeTimer - s.fadeIn)) * 0.7);
        if (remaining <= 0) {
          s.mesh.visible = false;
          s.mesh.material.opacity = 0;
        }
      }
    }
  }

  // ─── Flesh chunk object pool ──────────────────────────────────────────────────
  // Pre-allocated pool prevents new THREE.Mesh calls during gameplay
  const FLESH_POOL_SIZE = 80;
  let _fleshPool = [];

  // ─── Bullet hole decal pool ───────────────────────────────────────────────────
  // Pre-allocated circular decals for ground bullet impacts when projectiles miss
  const BULLET_HOLE_POOL_SIZE = 50;
  const _bulletHolePool = [];
  let _bulletHoleHead = 0; // ring-buffer index

  function _buildBulletHolePool() {
    const holeGeo = new THREE.CircleGeometry(0.08, 8);
    for (let i = 0; i < BULLET_HOLE_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x222222,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(holeGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.015, 0);
      mesh.visible = false;
      scene.add(mesh);
      _bulletHolePool.push({ mesh, fadeTimer: 0 });
    }
  }

  /**
   * Place a bullet hole decal at (x, z) when a projectile hits the ground.
   * Holes fade in quickly and slowly fade out over ~15 seconds.
   */
  function _placeBulletHole(x, z) {
    const slot = _bulletHolePool[_bulletHoleHead % BULLET_HOLE_POOL_SIZE];
    _bulletHoleHead++;
    if (!slot) return;
    const size = 0.7 + Math.random() * 0.4;
    slot.mesh.scale.set(size, size, size);
    slot.mesh.position.set(x + (Math.random() - 0.5) * 0.05, 0.015, z + (Math.random() - 0.5) * 0.05);
    slot.mesh.rotation.z = Math.random() * Math.PI * 2;
    slot.mesh.material.opacity = 0;
    slot.mesh.visible = true;
    slot.fadeTimer = 15.0; // seconds to live
    slot.fadeIn = 0.15; // seconds to fade in (quick)
    slot.age = 0;
  }

  function _updateBulletHoles(dt) {
    for (let i = 0; i < _bulletHolePool.length; i++) {
      const h = _bulletHolePool[i];
      if (!h.mesh.visible) continue;
      h.age += dt;
      if (h.age < h.fadeIn) {
        h.mesh.material.opacity = Math.min(0.85, (h.age / h.fadeIn) * 0.85);
      } else {
        const remaining = h.fadeTimer - h.age;
        h.mesh.material.opacity = Math.max(0, (remaining / (h.fadeTimer - h.fadeIn)) * 0.85);
        if (remaining <= 0) {
          h.mesh.visible = false;
          h.mesh.material.opacity = 0;
        }
      }
    }
  }

  function _buildFleshPool() {
    const colors = [0x33AA22, 0x228811, 0x116600, 0x55CC33];
    // Pre-create multiple geometries of different sizes to reuse
    const geoSmall = new THREE.BoxGeometry(0.1, 0.08, 0.12);
    const geoMed   = new THREE.BoxGeometry(0.18, 0.14, 0.22);
    const geoLarge = new THREE.BoxGeometry(0.25, 0.20, 0.30);
    for (let i = 0; i < FLESH_POOL_SIZE; i++) {
      const geo = i % 3 === 0 ? geoLarge : i % 3 === 1 ? geoMed : geoSmall;
      const mat = new THREE.MeshPhongMaterial({
        color: colors[i % colors.length],
        shininess: 20
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.visible = false;
      scene.add(mesh);
      _fleshPool.push({
        mesh,
        vx: 0, vy: 0, vz: 0,
        rotSpeedX: 0, rotSpeedY: 0, rotSpeedZ: 0,
        life: 0,
        onGround: false,
        active: false,
        isLarge: (i % 3 === 0)
      });
    }
  }

  function _acquireFleshChunk() {
    for (let i = 0; i < _fleshPool.length; i++) {
      if (!_fleshPool[i].active) return _fleshPool[i];
    }
    return null; // pool exhausted (won't happen with 80 slots in practice)
  }

  function _releaseFleshChunk(chunk) {
    chunk.active = false;
    chunk.mesh.visible = false;
    chunk.mesh.material.transparent = false;
    chunk.mesh.material.opacity = 1;
  }

  // Spawn flying flesh chunks using pre-allocated pool (no new THREE.Mesh during gameplay)
  // color parameter can be either a single hex color or an array of colors to choose from
  function _spawnFleshChunks(slot, count, large, color) {
    const pos = slot.mesh.position;
    // Default to green slime colors if no color provided
    const defaultColors = [0x33AA22, 0x228811, 0x116600, 0x55CC33];
    const chunkColors = Array.isArray(color) ? color : (color ? [color] : defaultColors);

    for (let i = 0; i < count; i++) {
      const chunk = _acquireFleshChunk();
      if (!chunk) break; // pool exhausted — skip excess chunks

      // Set chunk color from the provided color array
      chunk.mesh.material.color.setHex(chunkColors[i % chunkColors.length]);

      const angle = Math.random() * Math.PI * 2;
      chunk.mesh.position.set(
        pos.x + Math.cos(angle) * 0.3,
        pos.y + 0.3 + Math.random() * 0.3,
        pos.z + Math.sin(angle) * 0.3
      );
      chunk.mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      chunk.vx = (Math.random() - 0.5) * 0.12;
      chunk.vy = 0.08 + Math.random() * 0.12;
      chunk.vz = (Math.random() - 0.5) * 0.12;
      chunk.rotSpeedX = (Math.random() - 0.5) * 0.3;
      chunk.rotSpeedY = (Math.random() - 0.5) * 0.3;
      chunk.rotSpeedZ = (Math.random() - 0.5) * 0.3;
      chunk.life = 2.0 + Math.random() * 1.0;
      chunk.onGround = false;
      chunk.active = true;
      chunk.mesh.material.transparent = false;
      chunk.mesh.material.opacity = 1;
      chunk.mesh.visible = true;
      _allFleshChunks.push(chunk);
    }
  }

  // ─── EXP Gem Object Pool ──────────────────────────────────────────────────────
  // Pre-allocates POOL_SIZE_GEMS ExpGem instances once at boot so no new THREE.Mesh
  // is created during gameplay when enemies are killed.
  function _buildExpGemPool() {
    if (typeof ExpGem === 'undefined') return; // gem-classes.js not loaded
    for (let i = 0; i < POOL_SIZE_GEMS; i++) {
      const gem = new ExpGem(0, 0, 'gun', 1.0, 0);
      gem._pooled = true;
      gem._returnToPool = function (g) { _expGemFreeList.push(g); };
      // Ensure gem mesh belongs to the sandbox scene.
      // Compare against window.scene rather than checking for any parent, so a gem
      // that was added to a different scene is correctly re-parented here.
      if (gem.mesh && window.scene && gem.mesh.parent !== window.scene) {
        window.scene.add(gem.mesh);
      }
      gem.deactivate(); // park off-screen (sets active=false, visible=false)
      _expGemPool.push(gem);
      _expGemFreeList.push(gem);
    }
    console.log('[SandboxLoop] EXP gem pool built: ' + POOL_SIZE_GEMS + ' slots');
  }

  /** Acquire a pooled gem, reset it to position (x, z), and return it.
   *  Falls back to creating a new ExpGem if the pool is exhausted. */
  function _acquireExpGem(x, z, sourceWeapon, hitForce, enemyType) {
    if (_expGemFreeList.length > 0) {
      const gem = _expGemFreeList.pop();
      gem.reset(x, z, sourceWeapon, hitForce, enemyType);
      // Re-parent to sandbox scene if necessary (handles scene-switch edge cases)
      if (gem.mesh && window.scene && gem.mesh.parent !== window.scene) {
        window.scene.add(gem.mesh);
      }
      if (gem.mesh) gem.mesh.visible = true;
      // Start grow timer at 0.15 so the star is already ~15% size on the first
      // rendered frame — makes it immediately perceptible rather than 1% scale.
      if (gem._growTimer !== undefined) gem._growTimer = 0.15;
      return gem;
    }
    // Pool exhausted (shouldn't happen with 40 slots in a single-player sandbox)
    if (typeof ExpGem !== 'undefined') {
      const gem = new ExpGem(x, z, sourceWeapon, hitForce, enemyType);
      gem._pooled = false; // not pooled — will be disposed normally on collect
      // ExpGem constructor already called scene.add; re-parent if needed
      if (gem.mesh && window.scene && gem.mesh.parent !== window.scene) {
        window.scene.add(gem.mesh);
      }
      if (gem._growTimer !== undefined) gem._growTimer = 0.15;
      return gem;
    }
    return null;
  }

  // ─── Pooled PointLight Flash System ──────────────────────────────────────────
  // Pre-allocates FLASH_POOL_SIZE PointLights at boot so muzzle flashes and hit
  // lights never create new THREE.PointLight during gameplay.
  // Exposes window._acquireFlash used by muzzle-flash-system.js.
  function _buildFlashPool() {
    for (let i = 0; i < FLASH_POOL_SIZE; i++) {
      const light = new THREE.PointLight(0xFFFFFF, 0, 10);
      light.visible = false;
      scene.add(light);
      _flashPool.push({
        light,
        timer: 0,
        duration: 1,
        maxIntensity: 0,
        active: false
      });
    }
    // Expose globally so muzzle-flash-system.js can call _acquireFlash at shot-time.
    // window._acquireFlash is called lazily (at fire-time), so it just needs to be
    // set before the first shot — _buildFlashPool() runs during boot, before gameplay.
    window._acquireFlash = function(sc, color, intensity, radius, pos, durationMs) {
      for (let i = 0; i < _flashPool.length; i++) {
        const f = _flashPool[i];
        if (f.active) continue;
        f.light.color.setHex(color);
        f.light.intensity = intensity;
        f.light.distance  = radius;
        f.light.position.copy(pos);
        f.light.visible   = true;
        f.maxIntensity    = intensity;
        f.duration        = Math.max(MIN_FLASH_DURATION_SEC, durationMs / 1000);
        f.timer           = f.duration;
        f.active          = true;
        return f;
      }
      return null; // pool exhausted — flash skipped (harmless visual miss)
    };
    console.log('[SandboxLoop] Flash pool built: ' + FLASH_POOL_SIZE + ' PointLight slots');
  }

  /** Tick every active flash — fades intensity as the timer runs out. */
  function _updateFlashPool(dt) {
    for (let i = 0; i < _flashPool.length; i++) {
      const f = _flashPool[i];
      if (!f.active) continue;
      f.timer -= dt;
      if (f.timer <= 0) {
        f.active          = false;
        f.light.visible   = false;
        f.light.intensity = 0;
      } else {
        // Smooth fade-out: intensity decays to 0 as timer reaches 0
        f.light.intensity = f.maxIntensity * (f.timer / f.duration);
      }
    }
  }

  function _updateFleshChunks(dt) {
    for (let i = _allFleshChunks.length - 1; i >= 0; i--) {
      const chunk = _allFleshChunks[i];

      chunk.life -= dt;
      if (chunk.life <= 0) {
        _releaseFleshChunk(chunk);
        _allFleshChunks.splice(i, 1);
        continue;
      }

      if (!chunk.onGround) {
        chunk.vy -= 0.025; // gravity
        chunk.mesh.position.x += chunk.vx;
        chunk.mesh.position.y += chunk.vy;
        chunk.mesh.position.z += chunk.vz;
        if (chunk.mesh.position.y <= 0.05) {
          chunk.mesh.position.y = 0.05;
          chunk.onGround = true;
          chunk.vy = 0;
          chunk.vx *= 0.3;
          chunk.vz *= 0.3;
        }
      } else {
        chunk.vx *= 0.92;
        chunk.vz *= 0.92;
        chunk.mesh.position.x += chunk.vx;
        chunk.mesh.position.z += chunk.vz;
      }

      chunk.mesh.rotation.x += chunk.rotSpeedX * dt;
      chunk.mesh.rotation.y += chunk.rotSpeedY * dt;
      chunk.mesh.rotation.z += chunk.rotSpeedZ * dt;

      if (chunk.life < 0.5 && chunk.mesh.material.opacity > 0) {
        chunk.mesh.material.transparent = true;
        chunk.mesh.material.opacity = chunk.life / 0.5;
      }
    }
  }

  // Update every active pool slot (movement, HP bar, contact damage)
  function _updateSlime(dt) {
    if (!player || !player.mesh) return;

    _updateFleshChunks(dt);

    const px = player.mesh.position.x, pz = player.mesh.position.z;
    const colors = [0x55EE44, 0x44CC33, 0x33AA22, 0x228811, 0x116600];

    for (let si = 0; si < _activeSlimes.length; si++) {
      const s = _activeSlimes[si];

      // HP bars removed

      // Flash on hit
      if (s.flashTimer > 0) {
        s.flashTimer -= dt;
        s.mesh.material.color.setHex(0xFFFFFF);
      } else {
        s.mesh.material.color.setHex(colors[s.damageStage] || 0x55EE44);
      }

      // Attack timer cooldown
      if (s.attackTimer > 0) s.attackTimer -= dt;

      // Get positions early for eye tracking and movement
      const sx = s.mesh.position.x, sz = s.mesh.position.z;

      // Enhanced breathing animation — constant pulsing/squishing for alive feel
      s.wobbleTime += dt * 3.5;
      const breathCycle = Math.sin(s.wobbleTime * 0.8) * 0.08; // Breathing scale factor
      const wobble   = Math.sin(s.wobbleTime) * 0.12;
      const wobbleY  = Math.sin(s.wobbleTime * 2.0) * 0.06; // secondary vertical bob

      // Eye tracking — pupils follow player (unless dead)
      if (s.eyePupils && !s.dead && player && player.mesh) {
        const eyeTrackingEnabled = true; // Can be disabled on death
        if (eyeTrackingEnabled) {
          // Calculate direction from slime to player
          const dirX = px - sx;
          const dirZ = pz - sz;
          const dirLength = Math.sqrt(dirX * dirX + dirZ * dirZ);
          if (dirLength > 0.1) {
            // Normalized direction
            const ndx = dirX / dirLength;
            const ndz = dirZ / dirLength;
            // Convert to local space (relative to slime's rotation)
            const angle = Math.atan2(dirX, dirZ) - s.mesh.rotation.y;
            const pupilOffsetX = Math.sin(angle) * 0.03; // Horizontal pupil movement
            const pupilOffsetZ = Math.cos(angle) * 0.03; // Depth pupil movement
            // Apply to each pupil
            s.eyePupils.forEach(pupil => {
              pupil.position.x = pupilOffsetX;
              pupil.position.z = 0.06 + pupilOffsetZ; // Base Z + offset
            });
          }
        }
      }

      // ── Blinking eyes (feel alive) ──────────────────────────────
      if (s.eyeMeshes && s.eyeMeshes.length > 0 && !s.dead) {
        s.blinkTimer += dt;
        if (s.blinkTimer >= s.nextBlinkTime && !s.isBlinking) {
          s.isBlinking = true;
          s.blinkTimer = 0;
          s.nextBlinkTime = 2 + Math.random() * 4;
        }
        if (s.isBlinking) {
          const bp = Math.min(1, s.blinkTimer / 0.1);
          const eyeScaleY = bp < 0.5 ? Math.max(0.05, 1 - bp * 2) : Math.max(0.05, (bp - 0.5) * 2);
          s.eyeMeshes.forEach(eye => { eye.scale.y = eyeScaleY; });
          if (bp >= 1) {
            s.isBlinking = false;
            s.blinkTimer = 0;
            s.eyeMeshes.forEach(eye => { eye.scale.y = 1; });
          }
        }
      }

      // Squish animation on hit
      let squishX = 1.0, squishY = 1.0, squishZ = 1.0;
      if (s.squishTime > 0) {
        s.squishTime -= dt;
        const squishProgress = 1 - (s.squishTime / 0.3);
        const squishAmount = Math.sin(squishProgress * Math.PI) * 0.35;
        squishX = 1 + squishAmount;
        squishZ = 1 + squishAmount;
        squishY = 1 - squishAmount * 0.5;
      }

      // Lunge attack animation: flatten then extend forward
      let lungeScaleX = 1.0, lungeScaleY = 1.0, lungeScaleZ = 1.0;
      let lungeMoveX = 0, lungeMoveZ = 0;
      if (s.lungeTime > 0) {
        s.lungeTime -= dt;
        const lungeT = 1 - Math.max(0, s.lungeTime) / 0.4; // 0→1 over 0.4s
        // Flatten body (squish down) then shoot forward
        if (lungeT < 0.4) {
          // Compress phase
          const compress = lungeT / 0.4;
          lungeScaleY = 1 - compress * 0.4;
          lungeScaleX = 1 + compress * 0.3;
          lungeScaleZ = 1 + compress * 0.3;
        } else {
          // Extend/shoot phase
          const extend = (lungeT - 0.4) / 0.6;
          lungeScaleY = 0.6 + extend * 0.6;
          lungeScaleX = 1.3 - extend * 0.5;
          lungeScaleZ = 1.3 - extend * 0.5;
          // Move forward during extension
          lungeMoveX = s.lungeDirX * extend * SLIME_SPEED * 3.5 * dt;
          lungeMoveZ = s.lungeDirZ * extend * SLIME_SPEED * 3.5 * dt;
        }
      }

      // Combined scale: breathing + wobble + squish + lunge + damage stage shrink
      const damageScale = s.damageStage >= 4 ? 0.85 : (s.damageStage >= 3 ? 0.92 : 1.0);
      s.mesh.scale.set(
        damageScale * squishX * lungeScaleX * (1 + wobble + breathCycle * 0.5),
        damageScale * squishY * lungeScaleY * (1 - wobbleY + breathCycle),
        damageScale * squishZ * lungeScaleZ * (1 + wobble + breathCycle * 0.5)
      );

      // Knockback physics — gentle decay to prevent stutter
      if (Math.abs(s.knockbackVx) > 0.005 || Math.abs(s.knockbackVz) > 0.005) {
        s.mesh.position.x += s.knockbackVx * dt * 4;
        s.mesh.position.z += s.knockbackVz * dt * 4;
        s.knockbackVx *= Math.pow(0.05, dt);
        s.knockbackVz *= Math.pow(0.05, dt);
      }

      // Move toward player (sx, sz already defined above)
      const ddx = px - sx, ddz = pz - sz;
      const dist = Math.sqrt(ddx * ddx + ddz * ddz);

      if (lungeMoveX !== 0 || lungeMoveZ !== 0) {
        // Apply lunge movement
        s.mesh.position.x = _clamp(s.mesh.position.x + lungeMoveX, -ARENA_RADIUS, ARENA_RADIUS);
        s.mesh.position.z = _clamp(s.mesh.position.z + lungeMoveZ, -ARENA_RADIUS, ARENA_RADIUS);
      } else if (dist > 1.2 && Math.abs(s.knockbackVx) < 0.05 && Math.abs(s.knockbackVz) < 0.05) {
        // Apply individual speed variation for more natural movement
        const speed = SLIME_SPEED * (s.speedMultiplier || 1.0);
        s.mesh.position.x += (ddx / dist) * speed * dt;
        s.mesh.position.z += (ddz / dist) * speed * dt;
        s.mesh.rotation.y = Math.atan2(ddx, ddz);
      }

      // Trigger attack lunge when close enough and cooldown elapsed
      if (dist < 2.8 && s.attackTimer <= 0 && s.lungeTime <= 0) {
        s.attackTimer = 2.0 + Math.random() * 1.5; // next lunge cooldown
        s.lungeTime   = 0.4; // lunge animation duration
        if (dist > 0.01) {
          s.lungeDirX = ddx / dist;
          s.lungeDirZ = ddz / dist;
        }
      }

      // Contact damage to player (brutally hard before Camp upgrades)
      if (dist < 1.1 && !player.invulnerable) {
        const now = Date.now();
        if (now - s.lastDamageTime > 500) {
          s.lastDamageTime = now;
          if (typeof player.takeDamage === 'function') {
            player.takeDamage(SLIME_DAMAGE, 'slime', s.mesh.position);
          } else {
            playerStats.hp -= SLIME_DAMAGE;
          }
          // Sandbox HP guard: always check game-over via playerStats (works even if
          // player.takeDamage doesn't call gameOver() itself in sandbox context)
          if (playerStats && playerStats.hp <= 0) {
            playerStats.hp = 0;
            gameOver();
          }
        }
      }
    }

    // ── Soft separation: prevent slimes from overlapping each other ──────────
    // O(n²) but capped at MAX_SLIMES=50 → at most 1225 checks per frame, negligible cost.
    for (let ai = 0; ai < _activeSlimes.length; ai++) {
      const a = _activeSlimes[ai];
      const ax = a.mesh.position.x, az = a.mesh.position.z;
      for (let bi = ai + 1; bi < _activeSlimes.length; bi++) {
        const b = _activeSlimes[bi];
        const bx = b.mesh.position.x, bz = b.mesh.position.z;
        const dx = ax - bx, dz = az - bz;
        const distSq = dx * dx + dz * dz;
        if (distSq < SLIME_SEPARATION_DIST * SLIME_SEPARATION_DIST && distSq > 0.0001) {
          const dist2 = Math.sqrt(distSq);
          const push = (SLIME_SEPARATION_DIST - dist2) / SLIME_SEPARATION_DIST * SLIME_SEPARATION_FORCE * dt;
          const nx = dx / dist2, nz = dz / dist2;
          a.mesh.position.x = _clamp(ax + nx * push, -ARENA_RADIUS, ARENA_RADIUS);
          a.mesh.position.z = _clamp(az + nz * push, -ARENA_RADIUS, ARENA_RADIUS);
          b.mesh.position.x = _clamp(bx - nx * push, -ARENA_RADIUS, ARENA_RADIUS);
          b.mesh.position.z = _clamp(bz - nz * push, -ARENA_RADIUS, ARENA_RADIUS);
        }
      }
    }
  }

  // ══════════ NEW XP STAR SYSTEM V2 UPDATE ══════════
  function _updateGems(dt) {
    if (!player || !window.XPStarSystem) return;

    const px = player.mesh.position.x;
    const py = player.mesh.position.y + 0.5; // Player center height
    const pz = player.mesh.position.z;

    // Respect pickup-range / XP collection-radius upgrades, if available
    const _xpStats = (typeof window.playerStats !== 'undefined' && window.playerStats) || player.stats || null;
    const radiusMultiplier =
      _xpStats && (typeof _xpStats.xpCollectionRadius === 'number' || typeof _xpStats.pickupRange === 'number')
        ? (_xpStats.xpCollectionRadius || _xpStats.pickupRange || 1)
        : 1;

    // Update XP stars and collect any that are ready
    const collected = XPStarSystem.update(dt, px, py, pz, radiusMultiplier);

    // Process collected stars
    for (let i = 0; i < collected.length; i++) {
      const star = collected[i];

      // Add XP
      if (typeof window.addExp === 'function') {
        window.addExp(star.xp);
      }

      // Play sound
      if (typeof window.playSound === 'function') {
        window.playSound('collect');
      }

      // Show floating text
      _tmpV3b.set(star.position.x, star.position.y, star.position.z);
      createFloatingText('+' + star.xp + ' XP', _tmpV3b, '#5DADE2');
    }
  }

  function _refreshExpBar() {
    try {
      const pct = Math.min(100, (playerStats.exp / playerStats.expReq) * 100);
      const fill = document.getElementById('exp-fill');
      const text = document.getElementById('exp-text');
      const bFill = document.getElementById('bottom-exp-fill');
      const bText = document.getElementById('bottom-exp-text');
      if (fill) fill.style.width = pct + '%';
      if (text) text.innerText = 'EXP: ' + Math.ceil(pct) + '%';
      if (bFill) bFill.style.width = pct + '%';
      if (bText) bText.innerText = 'EXP: ' + Math.ceil(pct) + '%';

      // Waterdrop SVG level text
      const wlv = document.getElementById('waterdrop-level-text');
      const wfill = document.getElementById('waterdrop-exp-fill');
      if (wlv) wlv.textContent = playerStats.lvl;
      if (wfill) {
        const fillY = 110 - (pct / 100) * 92; // WATERDROP_FILL_HEIGHT=92, bottom at y=110
        wfill.setAttribute('y', fillY);
        wfill.setAttribute('height', (pct / 100) * 92);
      }
    } catch (e) {}
  }

  function _onLevelUp() {
    // ── Fiery "LEVEL UP" text animation (Grind Survivors style) ──
    // Spawns a massive burning text above the player before showing the upgrade modal.
    _spawnFireLevelUpText();

    // Delay before upgrade modal appears so player can enjoy the fiery text animation
    window.isPaused = true;
    setTimeout(function () {
      if (typeof showUpgradeModal === 'function') {
        showUpgradeModal(false, null);
        // Failsafe: if showUpgradeModal returned without showing the modal
        setTimeout(function () {
          const modal = document.getElementById('levelup-modal');
          if (window.isPaused && (!modal || modal.style.display !== 'flex')) {
            window.isPaused = false;
          }
        }, 80);
      } else {
        window.isPaused = false;
      }
    }, 1800); // 1.8s delay to let the fiery text play
  }

  // ── Fiery LEVEL UP text: Grind Survivors style with Eye of Horus ──
  function _spawnFireLevelUpText() {
    // Wrap container: both eye + text vertically centered
    const container = document.createElement('div');
    container.style.cssText = [
      'position:fixed',
      'left:50%',
      'top:38%',
      'transform:translate(-50%,-50%) scale(0) translateY(30px)',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'z-index:10000',
      'pointer-events:none',
      'opacity:0',
      'will-change:transform,opacity',
    ].join(';');

    // Eye of Horus SVG (black/gold, glowing) above the text
    const eyeEl = document.createElement('div');
    eyeEl.innerHTML = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60" style="width:clamp(60px,12vw,120px);height:auto;filter:drop-shadow(0 0 8px #FFD700) drop-shadow(0 0 18px #FF8C00);margin-bottom:4px;">',
      '  <defs>',
      '    <linearGradient id="eyeGrad" x1="0%" y1="0%" x2="100%" y2="0%">',
      '      <stop offset="0%" style="stop-color:#B8860B"/>',
      '      <stop offset="50%" style="stop-color:#FFD700"/>',
      '      <stop offset="100%" style="stop-color:#B8860B"/>',
      '    </linearGradient>',
      '  </defs>',
      '  <!-- Eye outline (outer shape) -->',
      '  <path d="M10,30 Q30,4 60,4 Q90,4 110,30 Q90,56 60,56 Q30,56 10,30 Z" fill="url(#eyeGrad)" stroke="#000" stroke-width="2"/>',
      '  <!-- Eye white -->',
      '  <ellipse cx="60" cy="30" rx="24" ry="18" fill="#F8F0D0"/>',
      '  <!-- Iris -->',
      '  <circle cx="60" cy="30" r="13" fill="#1a0800"/>',
      '  <!-- Pupil glow -->',
      '  <circle cx="60" cy="30" r="7" fill="#000"/>',
      '  <circle cx="55" cy="25" r="3" fill="#FFD700" opacity="0.9"/>',
      '  <!-- Horus mark below eye — vertical line -->',
      '  <line x1="60" y1="48" x2="60" y2="56" stroke="url(#eyeGrad)" stroke-width="2.5"/>',
      '  <!-- Horus curl left -->',
      '  <path d="M60,56 Q45,60 38,54 Q34,50 38,46" fill="none" stroke="url(#eyeGrad)" stroke-width="2.5" stroke-linecap="round"/>',
      '  <!-- Horus tear drop right -->',
      '  <path d="M60,56 Q70,58 72,52" fill="none" stroke="url(#eyeGrad)" stroke-width="2" stroke-linecap="round"/>',
      '</svg>'
    ].join('');
    eyeEl.style.cssText = 'display:block;text-align:center;';
    container.appendChild(eyeEl);

    // Main LEVEL UP text
    const el = document.createElement('div');
    el.textContent = 'LEVEL UP';
    el.style.cssText = [
      'font-family:"Cinzel Decorative","Bangers","Impact","Arial Black",sans-serif',
      'font-size:clamp(44px,9vw,88px)',
      'font-weight:900',
      'letter-spacing:8px',
      'color:#FFD700',
      'text-shadow:0 0 14px #FF4500,0 0 30px #FF6600,0 0 55px #FF8C00,0 0 90px rgba(255,69,0,0.4),3px 3px 0 #000,-3px -3px 0 #000,3px -3px 0 #000,-3px 3px 0 #000',
      'white-space:nowrap',
      'line-height:1',
    ].join(';');
    container.appendChild(el);

    document.body.appendChild(container);

    // Ash/ember particles
    const embers = [];
    const EMBER_COUNT = 36;
    for (let i = 0; i < EMBER_COUNT; i++) {
      const ember = document.createElement('div');
      const size = 2 + Math.random() * 6;
      const isAsh = Math.random() < 0.4;
      ember.style.cssText = [
        'position:fixed',
        'width:' + size + 'px',
        'height:' + (isAsh ? size * 0.5 : size) + 'px',
        'background:' + (isAsh ? '#999' : (['#FF4500','#FFD700','#FF6600','#FFA500'][Math.floor(Math.random() * 4)])),
        'border-radius:' + (isAsh ? '1px' : '50%'),
        'pointer-events:none',
        'z-index:10001',
        'opacity:0',
        'will-change:transform,opacity',
        'box-shadow:0 0 ' + (isAsh ? '2px 1px rgba(150,150,150,0.5)' : '5px 2px rgba(255,100,0,0.7)'),
      ].join(';');
      document.body.appendChild(ember);
      embers.push({
        el: ember,
        x: 0, y: 0,
        vx: (Math.random() - 0.5) * (isAsh ? 80 : 240),
        vy: -(isAsh ? 20 : 60) - Math.random() * (isAsh ? 100 : 180),
        rot: Math.random() * 360,
        rotV: (Math.random() - 0.5) * 400,
        life: 0.4 + Math.random() * (isAsh ? 1.0 : 0.7),
        maxLife: 0,
        isAsh,
      });
    }

    const startTime = performance.now();
    let _lastFrameTime = startTime;
    const totalDuration = 1700; // ms

    function _cleanupLevelUpFX() {
      if (container.parentNode) container.parentNode.removeChild(container);
      for (let i = 0; i < embers.length; i++) {
        if (embers[i].el.parentNode) embers[i].el.parentNode.removeChild(embers[i].el);
      }
    }

    function animFrame() {
      const now = performance.now();
      const elapsed = now - startTime;
      const dt = Math.min(0.05, (now - _lastFrameTime) / 1000);
      _lastFrameTime = now;
      const t = elapsed / totalDuration;

      if (t < 0.18) {
        // Phase 1: explosive pop-in from below, rising upward
        const p = t / 0.18;
        const easeP = 1 - Math.pow(1 - p, 3); // ease-out cubic
        const scale = easeP * 1.3;
        const yOff = (1 - easeP) * 60; // rises from 60px below
        container.style.opacity = '' + Math.min(1, p * 3);
        container.style.transform = 'translate(-50%,-50%) scale(' + scale + ') translateY(' + yOff + 'px)';
      } else if (t < 0.32) {
        // Phase 2: bounce settle + spawn embers/ash
        const p = (t - 0.18) / 0.14;
        const scale = 1.3 - 0.2 * p;
        container.style.transform = 'translate(-50%,-50%) scale(' + scale + ') translateY(0)';
        container.style.opacity = '1';
        if (p < 0.6) {
          const cx = window.innerWidth / 2;
          const cy = window.innerHeight * 0.38;
          for (let i = 0; i < embers.length; i++) {
            const em = embers[i];
            if (em.maxLife === 0) {
              em.maxLife = em.life;
              em.x = cx + (Math.random() - 0.5) * 160;
              em.y = cy + (Math.random() - 0.5) * 50;
              em.el.style.opacity = '1';
            }
          }
        }
      } else if (t < 0.72) {
        // Phase 3: hold, pulsing glow, continues rising slowly
        const p = (t - 0.32) / 0.40;
        const pulse = 1.1 + 0.04 * Math.sin(p * Math.PI * 5);
        const yRise = -18 * p; // slowly drifts upward
        container.style.transform = 'translate(-50%,calc(-50% + ' + yRise + 'px)) scale(' + pulse + ')';
        container.style.opacity = '1';
        // Gradually shift from gold to ashen grey (burning to ash)
        const ashBlend = Math.max(0, (p - 0.5) / 0.5);
        if (ashBlend > 0) {
          const r = Math.round(255 * (1 - ashBlend * 0.5));
          const g = Math.round(215 * (1 - ashBlend * 0.6));
          const b = Math.round(0 + ashBlend * 60);
          el.style.color = 'rgb(' + r + ',' + g + ',' + b + ')';
        }
      } else if (t < 1) {
        // Phase 4: disintegrate upward — text turns to ash and vanishes
        const p = (t - 0.72) / 0.28;
        const yRise = -18 - 80 * p; // accelerates upward
        const scale = 1.1 + 0.15 * p; // grows slightly as it rises
        const fadeOut = 1 - Math.pow(p, 1.5);
        container.style.transform = 'translate(-50%,calc(-50% + ' + yRise + 'px)) scale(' + scale + ')';
        container.style.opacity = '' + Math.max(0, fadeOut);
        // Full ash: grey, desaturated
        const gr = Math.round(160 + 50 * p);
        el.style.color = 'rgb(' + gr + ',' + gr + ',' + gr + ')';
        el.style.textShadow = '0 0 ' + (8 + 20 * p) + 'px rgba(180,180,180,' + (0.5 * (1 - p)) + ')';
      } else {
        _cleanupLevelUpFX();
        return;
      }

      // Update ember/ash particles
      for (let i = 0; i < embers.length; i++) {
        const em = embers[i];
        if (em.maxLife === 0) continue;
        em.life -= dt;
        if (em.life <= 0) { em.el.style.opacity = '0'; continue; }
        em.x += em.vx * dt;
        em.y += em.vy * dt;
        em.vy += (em.isAsh ? 10 : 25) * dt; // ash drifts slower
        em.vx *= em.isAsh ? 0.995 : 0.99; // ash drifts on air
        em.rot += em.rotV * dt;
        em.el.style.left = em.x + 'px';
        em.el.style.top = em.y + 'px';
        em.el.style.transform = 'rotate(' + em.rot + 'deg)';
        em.el.style.opacity = '' + Math.max(0, em.life / em.maxLife);
      }

      requestAnimationFrame(animFrame);
    }
    requestAnimationFrame(animFrame);
  }

  // ─── Sandbox weapon effects (sword, samurai sword, aura) ────────────────────
  // These run when those weapons are unlocked at level-up and deal area damage
  // to active slimes, giving immediate visible feedback in the sandbox.

  // Pre-allocated reusable objects for weapon effects (avoids GC during combat)
  const _swordSlashColor  = 0xFF8800;
  const _auraColor        = 0x3399FF;

  function _updateWeaponEffects(dt) {
    if (!player || !player.mesh || !weapons) return;
    const px = player.mesh.position.x;
    const pz = player.mesh.position.z;

    // ── SWORD / SAMURAI SWORD: periodic melee slash in front of player ────────
    const hasSword = (weapons.sword && weapons.sword.active) ||
                     (weapons.samuraiSword && weapons.samuraiSword.active);
    if (hasSword) {
      _swordEffectCooldown -= dt * 1000;
      if (_swordEffectCooldown <= 0) {
        // Choose best active sword
        const sw = (weapons.samuraiSword && weapons.samuraiSword.active)
          ? weapons.samuraiSword : weapons.sword;
        _swordEffectCooldown = sw.cooldown || 1200;
        const sRange = sw.range || 3.5;
        const sRangeSq = sRange * sRange;
        // Iterate backward so that _killSlime's splice doesn't skip entries
        for (let si = _activeSlimes.length - 1; si >= 0; si--) {
          const s = _activeSlimes[si];
          if (!s || !s.active || s.dead) continue;
          const dx = s.mesh.position.x - px;
          const dz = s.mesh.position.z - pz;
          if (dx * dx + dz * dz <= sRangeSq) {
            const dmg = Math.round((sw.damage || 30) * (playerStats ? playerStats.strength || 1 : 1));
            s.hp -= dmg;
            s.flashTimer = 0.12;
            s.squishTime = 0.25;
            _tmpV3.set(s.mesh.position.x, 1.4, s.mesh.position.z);
            createFloatingText(dmg, _tmpV3, '#FF8800', dmg);
            if (window.BloodSystem && typeof BloodSystem.emitBurst === 'function') {
              _reusableBloodPos.x = s.mesh.position.x;
              _reusableBloodPos.y = s.mesh.position.y + 0.5;
              _reusableBloodPos.z = s.mesh.position.z;
              BloodSystem.emitBurst(_reusableBloodPos, 20, { spreadXZ: 1.0, spreadY: 0.4 });
            }
            if (s.hp <= 0) {
              _killSlime(s, 1.2, 0, 0); // _deactivateSlime splices from _activeSlimes (safe: iterating backward)
            } else {
              _updateSlimeHPBar(s);
            }
          }
        }
        // Visual flash on player
        if (player.mesh && player.mesh.material) {
          const origC = player.mesh.material.color.getHex();
          player.mesh.material.color.setHex(_swordSlashColor);
          setTimeout(function () {
            if (player && player.mesh && player.mesh.material)
              player.mesh.material.color.setHex(origC);
          }, 100);
        }
        // Sword slash emoji removed — keep only damage numbers
      }
    } else {
      _swordEffectCooldown = 0; // reset if weapon removed
    }

    // ── AURA: continuous damage ring around player ────────────────────────────
    if (weapons.aura && weapons.aura.active) {
      _auraEffectTimer -= dt * 1000;
      if (_auraEffectTimer <= 0) {
        _auraEffectTimer = weapons.aura.cooldown || 1000;
        const aRange = weapons.aura.range || 3.5;
        const aRangeSq = aRange * aRange;
        // Iterate backward so _killSlime's splice is safe
        for (let si = _activeSlimes.length - 1; si >= 0; si--) {
          const s = _activeSlimes[si];
          if (!s || !s.active || s.dead) continue;
          const dx = s.mesh.position.x - px;
          const dz = s.mesh.position.z - pz;
          if (dx * dx + dz * dz <= aRangeSq) {
            const dmg = Math.round((weapons.aura.damage || 8) * (playerStats ? playerStats.strength || 1 : 1));
            s.hp -= dmg;
            s.flashTimer = 0.08;
            _tmpV3.set(s.mesh.position.x, 1.3, s.mesh.position.z);
            createFloatingText(dmg, _tmpV3, '#33AAFF', dmg);
            if (s.hp <= 0) {
              _killSlime(s, 1.0, 0, 0);
            } else {
              _updateSlimeHPBar(s);
            }
          }
        }
      }
    } else {
      _auraEffectTimer = 0;
    }
  }

  // ─── Manual aim only — no auto-aim lock ─────────────────────────────────────
  let _gunCooldown = 0;

  // ─── Revolver ammo / reload state ────────────────────────────────────────────
  const REVOLVER_MAX_AMMO = 5;
  const REVOLVER_RELOAD_TIME = 1.8;        // seconds for full reload
  const REVOLVER_FIRE_RATE_MULT = 0.85;    // 15% faster than base gun cooldown (snappier feel)
  let _revolverAmmo = REVOLVER_MAX_AMMO;
  let _isReloading = false;
  let _reloadTimer = 0;
  let _reloadAnimFrame = 0; // 0 to REVOLVER_MAX_AMMO, how many bullets loaded so far

  // ─── Gun model state ─────────────────────────────────────────────────────────
  let _gunModel = null;
  let _gunDrum  = null; // direct reference to drum mesh for spin animation
  const _gunOffset = { x: 0.35, y: -0.1, z: 0 };
  let _gunRecoilTime = 0;

  // ─── Player bounce/animation state ───────────────────────────────────────────
  let _playerBounceTime = 0;
  let _playerBounceActive = false;
  let _playerIdleTime = 0;

  // ─── Player velocity physics (acceleration / friction / inputResponsiveness) ─
  let _playerVx = 0;        // current X velocity (world units / second)
  let _playerVz = 0;        // current Z velocity (world units / second)
  let _smoothInputX = 0;    // lerped input direction X (inputResponsiveness lerp)
  let _smoothInputZ = 0;    // lerped input direction Z

  function _tryFire(dt) {
    if (!player) return;

    // Effective magazine size and reload time — read from playerStats if available
    const _effMaxAmmo    = (playerStats && playerStats.magazineCapacity) || REVOLVER_MAX_AMMO;
    const _effReloadTime = REVOLVER_RELOAD_TIME / Math.max(0.1, (playerStats && playerStats.reloadSpeed) || 1.0);

    // Handle reload state
    if (_isReloading) {
      _reloadTimer -= dt;
      const progress = 1 - Math.max(0, _reloadTimer / _effReloadTime);
      _reloadAnimFrame = Math.floor(progress * _effMaxAmmo);
      _updateRevolverUI();
      if (_reloadTimer <= 0) {
        _isReloading = false;
        _revolverAmmo = _effMaxAmmo;
        _reloadAnimFrame = _effMaxAmmo;
        _updateRevolverUI();
      }
      return; // can't fire while reloading
    }

    // Out of ammo — start reload
    if (_revolverAmmo <= 0) {
      _isReloading = true;
      _reloadTimer = _effReloadTime;
      _reloadAnimFrame = 0;
      _updateRevolverUI();
      return;
    }

    // _gunCooldown is tracked in milliseconds (matching weapons.gun.cooldown units).
    // dt is in seconds, so dt*1000 converts to ms per frame.
    _gunCooldown -= dt * 1000;
    if (_gunCooldown > 0) return;

    // Fire rate: base cooldown reduced by playerStats.fireRate multiplier
    const fireRateMult = Math.max(0.1, (playerStats && playerStats.fireRate) || 1.0);
    const cooldown = weapons && weapons.gun ? Math.round(weapons.gun.cooldown * REVOLVER_FIRE_RATE_MULT / fireRateMult) : Math.round(850 / fireRateMult);
    _gunCooldown = cooldown;

    const px = player.mesh.position.x, pz = player.mesh.position.z;

    // Manual aim: joystick takes priority, then mouse. No auto-aim fallback.
    let tx, tz;
    if (_aimJoy.active && (_aimJoy.dx !== 0 || _aimJoy.dz !== 0)) {
      tx = px + _aimJoy.dx * 10;
      tz = pz + _aimJoy.dz * 10;
    } else if (_mouse && (_mouse.worldX !== 0 || _mouse.worldZ !== 0)) {
      tx = _mouse.worldX;
      tz = _mouse.worldZ;
    } else {
      return; // no aim input — don't fire
    }

    _revolverAmmo--;
    _updateRevolverUI();
    _fireProjectile(px, pz, tx, tz);

    // Muzzle flash: illuminate environment on every shot
    const weaponName = (saveData && saveData.equippedGear && saveData.equippedGear.weapon) || 'gun';
    if (window.spawnWeaponMuzzleFlash) {
      _tmpV3.set(px, 0.5, pz);
      const fdx = tx - px, fdz = tz - pz;
      const flen = Math.sqrt(fdx * fdx + fdz * fdz) || 1;
      _tmpV3b.set(fdx / flen, 0, fdz / flen);
      window.spawnWeaponMuzzleFlash(weaponName, _tmpV3, _tmpV3b, scene);
    } else if (window._acquireFlash) {
      _tmpV3.set(px, 1.0, pz);
      window._acquireFlash(scene, DEFAULT_FLASH_COLOR, DEFAULT_FLASH_INTENSITY, DEFAULT_FLASH_RADIUS, _tmpV3, DEFAULT_FLASH_DURATION_MS);
    }

    // Rotate player mesh to face the aim target + apply recoil
    player.mesh.rotation.y = Math.atan2(tx - px, tz - pz);

    // Update gun model position/rotation (if attached)
    _updateGunModel(tx, tz);

    // Gun recoil animation
    if (_gunModel) {
      _gunModel.position.x = _gunOffset.x - 0.06;
      _gunModel.position.z = _gunOffset.z + 0.04;
      _gunRecoilTime = 0.08;
    }
  }

  function _updateRevolverUI() {
    const ui = document.getElementById('revolver-ui');
    if (!ui) return;
    const bullets = ui.querySelectorAll('.revolver-bullet');
    bullets.forEach(function(b, i) {
      if (_isReloading) {
        b.className = 'revolver-bullet' + (i < _reloadAnimFrame ? ' loaded' : ' empty');
      } else {
        b.className = 'revolver-bullet' + (i < _revolverAmmo ? ' loaded' : ' empty');
      }
    });
    const label = ui.querySelector('.revolver-label');
    if (label) {
      label.textContent = _isReloading ? 'RELOADING...' : (_revolverAmmo + '/' + REVOLVER_MAX_AMMO);
      label.style.color = _isReloading ? '#FF8800' : (_revolverAmmo <= 1 ? '#FF4444' : '#FFD700');
    }
  }

  // ─── Gun model (revolver) ─────────────────────────────────────────────────────
  function _buildGunModel() {
    if (!player || !player.mesh) return;
    const gunGroup = new THREE.Group();

    // Barrel (long thin cylinder)
    const barrelGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8);
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.4, metalness: 0.8 });
    const barrel = new THREE.Mesh(barrelGeo, metalMat);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.22, 0, 0);
    gunGroup.add(barrel);

    // Cylinder (revolver drum)
    const drumGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.15, 12);
    const drumMat = new THREE.MeshStandardMaterial({ color: 0x887766, roughness: 0.5, metalness: 0.7 });
    const drum = new THREE.Mesh(drumGeo, drumMat);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(0.05, -0.02, 0);
    gunGroup.add(drum);

    // Grip/Handle
    const gripGeo = new THREE.BoxGeometry(0.08, 0.22, 0.06);
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x4A2E1A, roughness: 0.9, metalness: 0.0 });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.set(-0.06, -0.14, 0);
    grip.rotation.z = -0.15;
    gunGroup.add(grip);

    gunGroup.position.set(_gunOffset.x, _gunOffset.y, _gunOffset.z);
    gunGroup.castShadow = true;

    player.mesh.add(gunGroup);
    _gunModel = gunGroup;
    _gunDrum = drum;
  }

  function _updateGunModel(targetX, targetZ) {
    if (!_gunModel || !player || !player.mesh) return;
    // Spin drum slightly on each shot
    if (_gunDrum) _gunDrum.rotation.x += 0.4;
  }

  function _updateGunRecoil(dt) {
    if (_gunRecoilTime <= 0 || !_gunModel) return;
    _gunRecoilTime = Math.max(0, _gunRecoilTime - dt);
    const t = 1 - _gunRecoilTime / 0.08;
    _gunModel.position.x = (_gunOffset.x - 0.06) + t * 0.06;
    _gunModel.position.z = (_gunOffset.z + 0.04) - t * 0.04;
  }

  // ─── Input ────────────────────────────────────────────────────────────────────
  const _keysDown = {};
  // Pre-allocated objects for mouse raycasting (avoids GC pressure on every mousemove)
  const _mouseRay   = new THREE.Raycaster();
  const _mouseNDC   = new THREE.Vector2();
  const _mousePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _mousePt    = new THREE.Vector3();
  // Pre-allocated camera follow target (avoids new Vector3 every frame)
  const _camTarget  = new THREE.Vector3();

  function _initInput() {
    document.addEventListener('keydown', function (e) {
      _keysDown[e.code] = true;
      // 'E' key: attempt to gather resources from nearby trees/rocks
      if (e.code === 'KeyE' && window.WorldObjects && player && player.mesh) {
        var result = WorldObjects.tryGather(player.mesh.position.x, player.mesh.position.z);
        if (result) {
          _tmpV3.set(player.mesh.position.x, player.mesh.position.y + 1.5, player.mesh.position.z);
          createFloatingText('+' + result.amount + ' ' + result.type, _tmpV3, result.type === 'wood' ? '#8B6B3A' : '#9A9A9A');
        }
      }
    });
    document.addEventListener('keyup',   function (e) { _keysDown[e.code] = false; });

    // Mouse: project onto ground plane (y=0) — uses pre-allocated objects (no GC)
    document.addEventListener('mousemove', function (e) {
      if (!camera || !renderer) return;
      const rect = renderer.domElement.getBoundingClientRect();
      _mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _mouseNDC.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      _mouseRay.setFromCamera(_mouseNDC, camera);
      _mouseRay.ray.intersectPlane(_mousePlane, _mousePt);
      _mouse.worldX = _mousePt.x;
      _mouse.worldZ = _mousePt.z;
    });

    // Joystick: left = move, right = aim/shoot
    const jZone = document.getElementById('joystick-zone');
    if (jZone) {
      jZone.addEventListener('touchstart',  _onTouchStart,  { passive: false });
      jZone.addEventListener('touchmove',   _onTouchMove,   { passive: false });
      jZone.addEventListener('touchend',    _onTouchEnd,    { passive: false });
      jZone.addEventListener('touchcancel', _onTouchEnd,    { passive: false });
    }
  }

  function _onTouchStart(e) {
    e.preventDefault();
    const rect = renderer ? renderer.domElement.getBoundingClientRect() : document.body.getBoundingClientRect();
    const half = rect.width / 2;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const lx = t.clientX - rect.left;
      if (lx < half) {
        _joy.id = t.identifier; _joy.startX = t.clientX; _joy.startZ = t.clientY; _joy.active = true;
      } else {
        _aimJoy.id = t.identifier; _aimJoy.startX = t.clientX; _aimJoy.startZ = t.clientY; _aimJoy.active = true;
      }
    }
    _updateJoystickVisuals();
  }

  function _onTouchMove(e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === _joy.id) {
        const raw = 60, ddx = _clamp(t.clientX - _joy.startX, -raw, raw), ddz = _clamp(t.clientY - _joy.startZ, -raw, raw);
        const len = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
        _joy.dx = ddx / len; _joy.dz = ddz / len;
      }
      if (t.identifier === _aimJoy.id) {
        const raw = 60, ddx = _clamp(t.clientX - _aimJoy.startX, -raw, raw), ddz = _clamp(t.clientY - _aimJoy.startZ, -raw, raw);
        const len = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
        _aimJoy.dx = ddx / len; _aimJoy.dz = ddz / len;
      }
    }
    _updateJoystickVisuals();
  }

  function _onTouchEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === _joy.id)    { _joy.active = false;    _joy.dx = 0;    _joy.dz = 0; }
      if (t.identifier === _aimJoy.id) { _aimJoy.active = false; _aimJoy.dx = 0; _aimJoy.dz = 0; }
    }
    _updateJoystickVisuals();
  }

  function _updateJoystickVisuals() {
    const outer  = document.getElementById('joystick-outer');
    const inner  = document.getElementById('joystick-inner');
    const outerR = document.getElementById('joystick-outer-right');
    const innerR = document.getElementById('joystick-inner-right');
    if (inner  && outer)  { inner.style.transform  = _joy.active    ? 'translate(' + _joy.dx * 30    + 'px,' + _joy.dz * 30    + 'px)' : ''; }
    if (innerR && outerR) { innerR.style.transform = _aimJoy.active ? 'translate(' + _aimJoy.dx * 30 + 'px,' + _aimJoy.dz * 30 + 'px)' : ''; }
  }

  function _getMoveDir() {
    let dx = 0, dz = 0;
    if (_keysDown['KeyW'] || _keysDown['ArrowUp'])    dz -= 1;
    if (_keysDown['KeyS'] || _keysDown['ArrowDown'])  dz += 1;
    if (_keysDown['KeyA'] || _keysDown['ArrowLeft'])  dx -= 1;
    if (_keysDown['KeyD'] || _keysDown['ArrowRight']) dx += 1;
    if (_joy.active) { dx = _joy.dx; dz = _joy.dz; }
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0) { dx /= len; dz /= len; }
    return { dx, dz };
  }

  // ─── Three.js scene init ──────────────────────────────────────────────────────
  function _initScene() {
    // Allocate pre-shared Vector3 objects — must be after THREE.js is available
    _tmpV3  = new THREE.Vector3();
    _tmpV3b = new THREE.Vector3();
    _leapHitNormal = new THREE.Vector3();
    _leapBulletDir = new THREE.Vector3();

    // Renderer - expose as window global for gem-classes.js and other systems
    window.renderer = renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    // Apply saved or default graphics quality — this sets pixelRatio, shadowMap, toneMapping
    let _savedQuality = DEFAULT_QUALITY;
    try { _savedQuality = localStorage.getItem('sandboxGraphicsQuality') || DEFAULT_QUALITY; } catch (_) {}
    // Apply defaults first so properties exist before _applyGraphicsQuality runs
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    // sRGB output color space for correct texture color rendering
    if (typeof THREE.SRGBColorSpace !== 'undefined') {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if (typeof THREE.sRGBEncoding !== 'undefined') {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }

    const container = document.getElementById('game-container');
    if (container) container.appendChild(renderer.domElement);
    else           document.body.appendChild(renderer.domElement);

    // Scene - expose as window global for gem-classes.js to add meshes
    window.scene = scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 40, 120);

    // Camera (top-down, slightly angled — matching main game)
    window.camera = camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
    camera.position.set(0, 18, 12);
    camera.lookAt(0, 0, 0);

    // Lighting — enhanced for better real-time shadows and atmosphere
    const ambient = new THREE.AmbientLight(0xffffff, 0.45); // slightly reduced ambient for contrast
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xFFF5E0, 1.1); // warm daylight tone
    sun.position.set(20, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near    = 1;
    sun.shadow.camera.far     = 200;
    sun.shadow.camera.left    = -80;
    sun.shadow.camera.right   =  80;
    sun.shadow.camera.top     =  80;
    sun.shadow.camera.bottom  = -80;
    sun.shadow.bias           = -0.001; // reduce shadow acne
    sun.shadow.normalBias     = 0.02;
    scene.add(sun);

    // Soft fill light from opposite side for rim lighting
    const fill = new THREE.DirectionalLight(0x8899ff, 0.35);
    fill.position.set(-10, 20, -10);
    scene.add(fill);

    // Ground bounce — subtle warm light from below
    const bounce = new THREE.HemisphereLight(0x88BBAA, 0x445544, 0.3);
    scene.add(bounce);

    // Store light references for WorldObjects day/night cycle
    window._sandboxLights = { ambient: ambient, sun: sun, fill: fill, hemisphere: bounce };

    // Resize handler
    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      if (window._bloomComposer) window._bloomComposer.setSize(window.innerWidth, window.innerHeight);
    });

    // Bloom post-processing — graceful fallback if CDN scripts didn't load
    try {
      if (THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass) {
        const composer = new THREE.EffectComposer(renderer);
        composer.addPass(new THREE.RenderPass(scene, camera));
        const bloomPass = new THREE.UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, window.innerHeight),
          0.4,   // strength (subtle)
          0.6,   // radius
          0.85   // threshold (only bright things bloom)
        );
        composer.addPass(bloomPass);
        window._bloomComposer = composer;
        console.log('[SandboxLoop] Bloom post-processing enabled');
      }
    } catch(e) {
      console.warn('[SandboxLoop] Bloom setup failed, using standard rendering:', e);
    }

    // Apply saved quality after renderer is set up
    _applyGraphicsQuality(_savedQuality);
  }

  // ─── Graphics Quality presets ─────────────────────────────────────────────────
  // Maps quality key → renderer configuration.
  // Called once at boot (from saved preference) and dynamically when user changes.
  const QUALITY_DESCS = {
    ultralow: 'Shadows OFF · Pixel ratio 0.5× · No tone mapping — best for budget phones',
    low:      'Shadows OFF · Pixel ratio 1× · Linear tone mapping — good for S10/mid-range',
    medium:   'Shadows ON  · Pixel ratio 1× · Linear tone mapping — balanced (default)',
    high:     'Shadows ON (PCF) · Pixel ratio ≤1.5× · Filmic tone mapping — modern phones',
    ultra:    'Shadows ON (PCFSoft) · Native pixel ratio · Filmic tone mapping — iPhone 16 / PC',
  };
  const DEFAULT_QUALITY = 'ultra';

  // ─── FPS Tracking & Auto-Quality Adjustment ───────────────────────────────────
  let _fpsSamples = [];
  let _fpsCheckTimer = 0;
  let _autoQualityEnabled = true;
  let _hasAutoAdjusted = false;
  const FPS_SAMPLE_COUNT = 60; // Track 60 frames (1 second at 60fps)
  const FPS_CHECK_INTERVAL = 2.0; // Check every 2 seconds
  const FPS_LOW_THRESHOLD = 30; // If average FPS drops below 30
  const FPS_VERY_LOW_THRESHOLD = 20; // If average FPS drops below 20

  function _trackFPS(dt) {
    if (!_autoQualityEnabled || _hasAutoAdjusted) return;

    const fps = dt > 0 ? 1.0 / dt : 60;
    _fpsSamples.push(fps);
    if (_fpsSamples.length > FPS_SAMPLE_COUNT) {
      _fpsSamples.shift();
    }

    _fpsCheckTimer += dt;
    if (_fpsCheckTimer >= FPS_CHECK_INTERVAL && _fpsSamples.length >= FPS_SAMPLE_COUNT) {
      _fpsCheckTimer = 0;

      // Calculate average FPS
      const avgFPS = _fpsSamples.reduce((a, b) => a + b, 0) / _fpsSamples.length;

      // Get current quality
      let currentQuality = DEFAULT_QUALITY;
      try {
        currentQuality = localStorage.getItem('sandboxGraphicsQuality') || DEFAULT_QUALITY;
      } catch (_) {}

      // Auto-adjust if performance is poor
      if (avgFPS < FPS_VERY_LOW_THRESHOLD && currentQuality !== 'ultralow') {
        console.log(`[Auto-Detect] FPS too low (${avgFPS.toFixed(1)}). Switching to ULTRA LOW quality.`);
        _applyGraphicsQuality('ultralow');
        _hasAutoAdjusted = true;
        _showPerformanceNotification('Performance mode enabled (Ultra Low)');
      } else if (avgFPS < FPS_LOW_THRESHOLD && currentQuality !== 'ultralow' && currentQuality !== 'low') {
        console.log(`[Auto-Detect] FPS below threshold (${avgFPS.toFixed(1)}). Switching to LOW quality.`);
        _applyGraphicsQuality('low');
        _hasAutoAdjusted = true;
        _showPerformanceNotification('Performance mode enabled (Low)');
      }
    }
  }

  function _showPerformanceNotification(message) {
    // Create a simple notification overlay
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: #FFD700;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: bold;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.transition = 'opacity 0.5s';
      notification.style.opacity = '0';
      setTimeout(() => document.body.removeChild(notification), 500);
    }, 3000);
  }

  function _applyGraphicsQuality(quality) {
    if (!renderer) return;
    switch (quality) {
      case 'ultralow':
        renderer.setPixelRatio(0.5);
        renderer.shadowMap.enabled = false;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.toneMappingExposure = 1.0;
        break;
      case 'low':
        renderer.setPixelRatio(1.0);
        renderer.shadowMap.enabled = false;
        renderer.toneMapping = THREE.LinearToneMapping;
        renderer.toneMappingExposure = 1.0;
        break;
      case 'medium':
        renderer.setPixelRatio(1.0);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.BasicShadowMap;
        renderer.toneMapping = THREE.LinearToneMapping;
        renderer.toneMappingExposure = 1.1;
        break;
      case 'high':
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        break;
      case 'ultra':
      default:
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.4;
        break;
    }
    // Force shader recompile so shadow map type change takes effect
    renderer.shadowMap.needsUpdate = true;
    // Persist selection
    try { localStorage.setItem('sandboxGraphicsQuality', quality); } catch (_) {}
    // Update gameSettings global if present
    if (window.gameSettings) window.gameSettings.quality = quality;
    console.log('[SandboxLoop] Graphics quality applied:', quality);
  }

  // ─── Settings modal + UI Calibration entry (sandbox) ─────────────────────────
  function _initSandboxSettings() {
    const settingsBtn   = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeBtn      = document.getElementById('settings-close-btn');
    const uiCalBtn      = document.getElementById('ui-calibration-btn');
    const campBtn       = document.getElementById('settings-go-to-camp-btn');
    const qualitySelect = document.getElementById('graphics-quality-select');
    const qualityDesc   = document.getElementById('quality-desc');
    const applyQualBtn  = document.getElementById('apply-quality-btn');

    if (!settingsBtn || !settingsModal || !closeBtn) return;

    settingsBtn.style.display = 'block';

    // NOTE: Open/close/Escape handlers are managed by settings-ui.js.
    // Do NOT add duplicate listeners here — they conflict and break the modal.

    // Override updateCampScreen so settings-ui.js's "Go to Camp" handler navigates
    // back to index.html (the camp hub) instead of trying to run the in-page camp
    // flow.  A single handler in settings-ui.js is sufficient; no duplicate listener
    // is added here.
    window.updateCampScreen = function () {
      window.location.href = 'index.html';
    };

    // NOTE: Graphics quality is managed entirely by settings-ui.js (which reads
    // #quality-select and persists via saveData).  No duplicate wiring is needed
    // here — the IDs it uses (graphics-quality-select, quality-desc, apply-quality-btn)
    // do not exist in sandbox.html.

    if (uiCalBtn) {
      uiCalBtn.addEventListener('click', function () {
        settingsModal.style.display = 'none';
        if (window.UICalibration && typeof window.UICalibration.enter === 'function') {
          if (typeof setGamePaused === 'function') setGamePaused(true);
          window.UICalibration.enter(function () {
            if (typeof setGamePaused === 'function') setGamePaused(false);
          });
        } else {
          console.warn('[SandboxLoop] UI Calibration unavailable — script missing?');
        }
      });
    }

    // Apply saved HUD layout on boot if available
    if (window.UICalibration && typeof window.UICalibration.applyLayout === 'function') {
      window.UICalibration.applyLayout();
    }
  }

  // ─── Ground via Engine2Sandbox ────────────────────────────────────────────────
  function _initGround() {
    if (typeof Engine2Sandbox === 'function') {
      try {
        const e2 = new Engine2Sandbox();
        e2.init(scene);
        window._engine2Instance = e2;
        return;
      } catch (e) {
        console.warn('[SandboxLoop] Engine2Sandbox failed, falling back to basic ground:', e);
      }
    }
    // Fallback flat ground with texture — also used when Engine2Sandbox is missing or throws
    const geo = new THREE.PlaneGeometry(200, 200);
    // Create material first so texture-load callbacks can safely reference it
    const mat = new THREE.MeshStandardMaterial({ color: 0x2d5a1b, roughness: 0.85, metalness: 0.02 });
    try {
      const loader = new THREE.TextureLoader();
      const tex = loader.load(
        'assets/textures/rocky_terrain_03_diff_2k.jpg',
        function(t) { mat.map = t; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(20, 20); mat.color.setHex(0xffffff); mat.needsUpdate = true; },
        undefined,
        function() {
          loader.load('assets/textures/mossy_brick_diff_4k.jpg',
            function(t) { mat.map = t; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(20, 20); mat.color.setHex(0xffffff); mat.needsUpdate = true; },
            undefined,
            function() { /* all textures failed, plain colour is fine */ }
          );
        }
      );
      void tex; // texture object kept alive by THREE's cache
    } catch (e) {
      // keep plain-colour material
    }
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // ─── Spiral Door Spawn Sequence ───────────────────────────────────────────────
  // Multi-layered rotating circular door that opens on the ground, revealing
  // the player rising from below on an elevator platform with a light from below.
  let _spawnIntroTimer = 0;
  const SPAWN_INTRO_DURATION = 2.8;  // total seconds for the full intro
  let _spawnIntroActive = false;

  // ─── Player init ─────────────────────────────────────────────────────────────
  function _initPlayer() {
    // ── Camp Bridge: calculateTotalPlayerStats() aggregates ALL permanent bonuses
    // from the Camp (skill tree, buildings, gear, neural matrix, attributes).
    // Exposed by stat-aggregator.js, which is loaded before sandbox-loop.js.
    if (typeof window.calculateTotalPlayerStats === 'function') {
      try {
        playerStats = window.calculateTotalPlayerStats();
        // Inject into window so other systems can read it
        window.playerStats = playerStats;
        console.log('[SandboxLoop] calculateTotalPlayerStats() applied — all camp bonuses loaded.');
      } catch (e) {
        console.warn('[SandboxLoop] calculateTotalPlayerStats() error (non-fatal):', e);
        playerStats = null;
      }
    }

    // Fallback: if aggregator unavailable, use base defaults + skill tree only
    if (!playerStats) {
      if (typeof getDefaultPlayerStats === 'function') {
        playerStats = getDefaultPlayerStats(typeof GAME_CONFIG !== 'undefined' ? GAME_CONFIG.baseExpReq : 30);
      } else {
        playerStats = {
          lvl: 1, exp: 0, expReq: 30, hp: 100, maxHp: 100,
          strength: 1, armor: 0, speed: 1, critChance: 0.1, critDmg: 1.5,
          damage: 1, atkSpeed: 1, walkSpeed: 25, kills: 0, hpRegen: 0, gold: 0,
          pickupRange: 1.0, dropRate: 1.0, perks: {}, survivalTime: 0,
        };
      }
      if (typeof window.applySkillTreeBonuses === 'function') {
        try {
          window.applySkillTreeBonuses();
        } catch (e) {
          console.warn('[SandboxLoop] applySkillTreeBonuses() fallback error (non-fatal):', e);
        }
      }
    }

    // Sync revolver ammo to stat — reload after playerStats has been applied
    _revolverAmmo = (playerStats && playerStats.magazineCapacity) || REVOLVER_MAX_AMMO;

    // Set up weapons
    if (typeof getDefaultWeapons === 'function') {
      weapons = getDefaultWeapons();
    }
    // Create player using the existing Player class
    if (typeof Player === 'function') {
      player = new Player();
      player.mesh.position.set(0, SPAWN_SHAFT_DEPTH + 0.5, 0); // Deep underground
    } else {
      const geo = new THREE.SphereGeometry(0.5, 12, 12);
      const mat = new THREE.MeshPhongMaterial({ color: 0x3A9FD8, emissive: 0x0A3D5C, emissiveIntensity: 0.35 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, SPAWN_SHAFT_DEPTH + 0.5, 0); // Deep underground
      mesh.castShadow = true;
      scene.add(mesh);
      player = { mesh, invulnerable: false };
    }
    // Reset velocity state so previous run's momentum doesn't carry over
    _playerVx = 0; _playerVz = 0;
    _smoothInputX = 0; _smoothInputZ = 0;
    // Mark invulnerable during intro, build spiral door and gun
    player.invulnerable = true;
    _buildSpiralDoor();
    _buildGunModel();
    _spawnIntroActive = true;
    _spawnIntroTimer = 0;
  }

  const _spiralDoorParts = []; // { mesh, ring, segment, baseAngle, baseRadius }
  let _elevatorPlatform = null;
  let _spawnLight = null;
  let _undergroundShaft = null;   // Black cylinder for spawn hole depth
  const SPIRAL_RING_COUNT = 3;    // concentric rings
  const SPIRAL_SEG_COUNT  = 8;    // segments per ring
  const SPIRAL_RING_RADII = [1.0, 1.8, 2.6]; // inner to outer — clamped within hole radius 3
  const SPIRAL_COLORS     = [0x555555, 0x444444, 0x333333]; // heavy metal grey tones
  const SPAWN_SHAFT_DEPTH = -8;   // deep underground start

  function _buildSpiralDoor() {
    // ── Underground shaft: black cylinder visible through the spawn hole ──
    const shaftGeo = new THREE.CylinderGeometry(2.8, 2.8, Math.abs(SPAWN_SHAFT_DEPTH) * 2, 24);
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.DoubleSide });
    _undergroundShaft = new THREE.Mesh(shaftGeo, shaftMat);
    _undergroundShaft.position.set(0, SPAWN_SHAFT_DEPTH, 0);
    scene.add(_undergroundShaft);

    // Segment geometry: heavy metal door panels
    const segH = 0.12; // thicker door panels for heavy metal feel
    for (let r = 0; r < SPIRAL_RING_COUNT; r++) {
      const ringR = SPIRAL_RING_RADII[r];
      const arcLen = (2 * Math.PI * ringR) / SPIRAL_SEG_COUNT * 0.88;
      const segGeo = new THREE.BoxGeometry(arcLen, segH, 0.3);
      const segMat = new THREE.MeshStandardMaterial({
        color: SPIRAL_COLORS[r],
        roughness: 0.3,
        metalness: 0.9,
        emissive: 0x111111,
        emissiveIntensity: 0.1,
      });
      for (let s = 0; s < SPIRAL_SEG_COUNT; s++) {
        const mesh = new THREE.Mesh(segGeo, segMat);
        mesh.castShadow = true;
        mesh.visible = false;
        scene.add(mesh);
        _spiralDoorParts.push({
          mesh,
          ring:      r,
          segment:   s,
          baseAngle: (s / SPIRAL_SEG_COUNT) * Math.PI * 2,
          baseRadius: ringR,
        });
      }
    }

    // Elevator platform — heavy disc below the player
    const platGeo = new THREE.CylinderGeometry(2.2, 2.4, 0.2, 24);
    const platMat = new THREE.MeshStandardMaterial({
      color: 0x3A3A3A, roughness: 0.3, metalness: 0.85,
      emissive: 0x111122, emissiveIntensity: 0.3,
    });
    _elevatorPlatform = new THREE.Mesh(platGeo, platMat);
    _elevatorPlatform.position.set(0, SPAWN_SHAFT_DEPTH, 0);
    _elevatorPlatform.castShadow = true;
    _elevatorPlatform.visible = false;
    scene.add(_elevatorPlatform);

    // Spawn light (point light from below, warm amber)
    _spawnLight = new THREE.PointLight(0xFFAA44, 0, 15);
    _spawnLight.position.set(0, SPAWN_SHAFT_DEPTH + 1, 0);
    scene.add(_spawnLight);
  }

  /** Place spiral door segments for a given open fraction (0=closed, 1=fully open). */
  function _updateSpiralDoorGeometry(openFrac, spin) {
    const outFrac = Math.max(0, openFrac);
    const HOLE_LIMIT = 2.8; // door segments must NOT open wider than the hole
    for (let i = 0; i < _spiralDoorParts.length; i++) {
      const part = _spiralDoorParts[i];
      const r = part.ring;
      // Each ring spins in alternating direction
      const dir = r % 2 === 0 ? 1 : -1;
      const angle = part.baseAngle + dir * spin * (1 + r * 0.2);
      // Segments start near center (closed iris) and spread to HOLE_LIMIT (not beyond)
      const closedR = 0.1 + r * 0.1;
      const openR = Math.min(part.baseRadius, HOLE_LIMIT);
      const radius = closedR + outFrac * (openR - closedR);
      part.mesh.position.set(
        Math.cos(angle) * radius,
        0.06 + r * 0.01,
        Math.sin(angle) * radius
      );
      // Rotate segment to face tangent
      part.mesh.rotation.set(0, -angle + Math.PI / 2, 0);
      part.mesh.visible = true;
    }
  }

  function _hideSpiralDoor() {
    for (let i = 0; i < _spiralDoorParts.length; i++) {
      _spiralDoorParts[i].mesh.visible = false;
    }
    if (_elevatorPlatform) _elevatorPlatform.visible = false;
    if (_spawnLight) { _spawnLight.intensity = 0; }
    if (_undergroundShaft) _undergroundShaft.visible = false;
  }

  /** Main spawn intro tick — drives door, elevator, light from timer. */
  function _updateSpawnIntro(dt) {
    if (!_spawnIntroActive || !player || !player.mesh) return;
    _spawnIntroTimer += dt;
    const t = Math.min(1, _spawnIntroTimer / SPAWN_INTRO_DURATION);

    // ── Phase 1 (t 0→0.3): Door appears, starts spinning, light ramps up ────
    const doorAppear = Math.min(1, t / 0.3);

    // ── Phase 2 (t 0.2→0.75): Door opens (segments spread outward) ─────────
    const openT = _clamp((t - 0.2) / 0.55, 0, 1);
    const openEased = openT * openT * (3 - 2 * openT); // smoothstep

    // ── Phase 3 (t 0.35→0.85): Player + elevator rises from deep underground ──
    const riseT = _clamp((t - 0.35) / 0.5, 0, 1);
    const riseEased = 1 - Math.pow(1 - riseT, 3);

    // ── Phase 4 (t 0.80→1.0): Door snaps shut, light fades ────────────────
    const closeT = _clamp((t - 0.80) / 0.20, 0, 1);
    const closeEased = closeT * closeT; // accelerating snap-shut

    // Spin speed: fast during open, slows as it closes
    const spin = (openEased * 1.4 - closeEased * 1.2) * 0.5;

    // Door open fraction: opens then snaps shut realistically
    const doorOpen = openEased * (1 - closeEased);

    // Only render door if it's appeared
    if (doorAppear > 0.01) {
      _updateSpiralDoorGeometry(doorOpen, spin);
      // Fade segment opacity in during appearance
      for (let i = 0; i < _spiralDoorParts.length; i++) {
        const mat = _spiralDoorParts[i].mesh.material;
        if (!mat.transparent) mat.transparent = true;
        mat.opacity = _clamp(doorAppear, 0, 1);
      }
    }

    // Underground shaft visible during spawn
    if (_undergroundShaft) _undergroundShaft.visible = true;

    // Elevator platform: rises from deep underground to y=0
    if (_elevatorPlatform) {
      _elevatorPlatform.visible = riseT > 0;
      _elevatorPlatform.position.y = SPAWN_SHAFT_DEPTH + riseEased * Math.abs(SPAWN_SHAFT_DEPTH);
    }

    // Player: rises from deep underground to y=0.5 with elevator
    player.mesh.position.y = SPAWN_SHAFT_DEPTH + 0.5 + riseEased * (Math.abs(SPAWN_SHAFT_DEPTH) + 0.0);

    // Spawn light: ramps up early, fades as door closes
    if (_spawnLight) {
      const lightStrength = _clamp(doorAppear - closeEased, 0, 1);
      _spawnLight.intensity = lightStrength * 6.0;
      _spawnLight.position.y = SPAWN_SHAFT_DEPTH + 2 + riseEased * Math.abs(SPAWN_SHAFT_DEPTH);
    }

    // Completion
    if (t >= 1) {
      player.mesh.position.y = 0.5;
      _spawnIntroActive = false;
      player.invulnerable = false;
      _hideSpiralDoor();
      _tmpV3.set(0, 2, 0);
      createFloatingText('READY!', _tmpV3, '#FFD700');
    }
  }

  // ─── Player movement ──────────────────────────────────────────────────────────
  function _movePlayer(dt) {
    if (!player || !player.mesh) return;
    const rawDir = _getMoveDir();

    // ── Stats with safe fallbacks ──────────────────────────────────────────────
    const ps         = playerStats || {};
    // topSpeed: world-units/sec.  Use new stat if set, otherwise derive from walkSpeed.
    const topSpeed   = ps.topSpeed   || ((ps.walkSpeed || 25) * MOVEMENT_TIME_SCALE * 60);
    // inputResponsiveness: lerp factor per frame (0.04=heavy/sluggish, 1.0=instant snap)
    const inputResp  = _clamp(ps.inputResponsiveness || 0.12, 0.04, 1.0);
    // acceleration / friction: clamp the per-frame lerp factor to [0, 1]
    const accelFrac  = _clamp((ps.acceleration || 22.0) * dt, 0, 1);
    const fricFrac   = _clamp((ps.friction     || 18.0) * dt, 0, 1);

    const hasInput = rawDir.dx !== 0 || rawDir.dz !== 0;

    // 1. Smooth the raw input direction using inputResponsiveness (creates "heavy" feel)
    _smoothInputX = _lerp(_smoothInputX, rawDir.dx, inputResp);
    _smoothInputZ = _lerp(_smoothInputZ, rawDir.dz, inputResp);

    // 2. Velocity physics: accelerate toward target or apply friction
    if (hasInput) {
      _playerVx = _lerp(_playerVx, _smoothInputX * topSpeed, accelFrac);
      _playerVz = _lerp(_playerVz, _smoothInputZ * topSpeed, accelFrac);
    } else {
      _playerVx = _lerp(_playerVx, 0, fricFrac);
      _playerVz = _lerp(_playerVz, 0, fricFrac);
      // Snap to rest when moving very slowly to avoid infinite creep
      if (Math.abs(_playerVx) < 0.02) _playerVx = 0;
      if (Math.abs(_playerVz) < 0.02) _playerVz = 0;
    }

    // 3. Apply velocity to position
    if (_playerVx !== 0 || _playerVz !== 0) {
      var _newPx = _clamp(player.mesh.position.x + _playerVx * dt, -ARENA_RADIUS, ARENA_RADIUS);
      var _newPz = _clamp(player.mesh.position.z + _playerVz * dt, -ARENA_RADIUS, ARENA_RADIUS);

      // World object collision (trees, rocks, fences) + lake detection
      if (window.WorldObjects && typeof WorldObjects.checkCollision === 'function') {
        var _colResult = WorldObjects.checkCollision(_newPx, _newPz, 0.5);
        _newPx = _colResult.x;
        _newPz = _colResult.z;

        // Lore Lake: sink to neck, slow walk
        if (_colResult.inLake) {
          if (!player._inLake) {
            player._inLake = true;
            player._swimBobPhase = 0;
          }
          // Speed reduction
          _playerVx *= WorldObjects.LAKE_SLOW_FACTOR;
          _playerVz *= WorldObjects.LAKE_SLOW_FACTOR;
          // Sink player based on depth
          if (!_spawnIntroActive) {
            player._swimBobPhase = (player._swimBobPhase || 0) + dt * 2.5;
            player.mesh.position.y = WorldObjects.LAKE_SINK_Y + Math.sin(player._swimBobPhase) * 0.04;
          }
        } else {
          player._inLake = false;
        }
      }

      player.mesh.position.x = _clamp(_newPx, -ARENA_RADIUS, ARENA_RADIUS);
      player.mesh.position.z = _clamp(_newPz, -ARENA_RADIUS, ARENA_RADIUS);
    }

    // 4. Visual effects — use actual velocity magnitude, not raw input, for smooth transitions
    const speed         = Math.sqrt(_playerVx * _playerVx + _playerVz * _playerVz);
    const movingVisually = speed > 0.15;
    const leanDirX      = speed > 0.1 ? _playerVx / Math.max(speed, 0.01) : 0;
    const leanDirZ      = speed > 0.1 ? _playerVz / Math.max(speed, 0.01) : 0;

    if (movingVisually) {
      // Lean into movement direction (proportional to velocity, not raw input)
      player.mesh.rotation.z = _lerp(player.mesh.rotation.z, -leanDirX * 0.22, 0.14);
      player.mesh.rotation.x = _lerp(player.mesh.rotation.x, -leanDirZ * 0.18, 0.14);

      // Bounce/wiggle: squish and stretch
      if (!_playerBounceActive) {
        _playerBounceTime = 0;
        _playerBounceActive = true;
      }
      _playerBounceTime += dt * 8.5;
      const bounceY = Math.abs(Math.sin(_playerBounceTime)) * 0.12;
      const squishX = 1 + Math.abs(Math.sin(_playerBounceTime)) * 0.08;
      if (!_spawnIntroActive) player.mesh.position.y = 0.5 + bounceY;
      if (!player.currentScaleXZ) {
        player.mesh.scale.x = squishX;
        player.mesh.scale.z = squishX;
        // Halve the squish on Y to prevent extreme vertical shrink: volume-preserving approx.
        player.mesh.scale.y = 1 / (squishX * 0.5 + 0.5);
      }
    } else {
      _playerBounceActive = false;
      // Smooth return to upright
      player.mesh.rotation.z = _lerp(player.mesh.rotation.z, 0, 0.09);
      player.mesh.rotation.x = _lerp(player.mesh.rotation.x, 0, 0.09);
      if (!_spawnIntroActive) player.mesh.position.y = _lerp(player.mesh.position.y, 0.5, 0.1);
      // Idle gentle wobble
      _playerIdleTime += dt;
      const idleWobble = Math.sin(_playerIdleTime * 2.2) * 0.025;
      if (!player.currentScaleXZ) {
        player.mesh.scale.x = 1 + idleWobble;
        player.mesh.scale.z = 1 + idleWobble;
        // Y-axis uses half the wobble to keep vertical proportions natural during breathing
        player.mesh.scale.y = 1 - idleWobble * 0.5;
      }
    }

    // ── Continuous 360° smooth aim rotation ────────────────────────────────────
    // Update player facing direction every frame so the model follows the right
    // joystick (or mouse) even when not actively firing.
    const px2 = player.mesh.position.x, pz2 = player.mesh.position.z;
    if (_aimJoy.active && (_aimJoy.dx !== 0 || _aimJoy.dz !== 0)) {
      const aimAngle = Math.atan2(_aimJoy.dx, _aimJoy.dz);
      player.mesh.rotation.y = _lerp(player.mesh.rotation.y, aimAngle, 0.25);
    } else if (_mouse && (_mouse.worldX !== 0 || _mouse.worldZ !== 0)) {
      const mAngle = Math.atan2(_mouse.worldX - px2, _mouse.worldZ - pz2);
      player.mesh.rotation.y = _lerp(player.mesh.rotation.y, mAngle, 0.25);
    }

    // Camera follow — reuse _camTarget to avoid per-frame Vector3 allocation
    if (camera) {
      _camTarget.set(
        player.mesh.position.x + _shakeOffset.x,
        18,
        player.mesh.position.z + 12 + _shakeOffset.z
      );
      camera.position.lerp(_camTarget, 0.06);
      camera.lookAt(player.mesh.position);
    }
  }

  // ─── HUD refresh ─────────────────────────────────────────────────────────────
  let _hudTimer = 0;
  function _refreshHUD(dt) {
    _hudTimer += dt;
    if (_hudTimer < 0.1) return; // 10 Hz
    _hudTimer = 0;
    if (!playerStats) return;
    try {
      const hpPct = Math.max(0, (playerStats.hp / playerStats.maxHp) * 100);
      const hpFill = document.getElementById('hp-fill');
      const hpText = document.getElementById('hp-text');
      if (hpFill) hpFill.style.width = hpPct + '%';
      if (hpText) hpText.innerText = 'HP: ' + Math.ceil(playerStats.hp) + '/' + playerStats.maxHp;
      _refreshExpBar();
    } catch (e) {}
  }

  // ─── Blood system init ────────────────────────────────────────────────────────
  function _initBloodSystem() {
    if (window.BloodSystem && typeof BloodSystem.init === 'function') {
      BloodSystem.init(scene);
    }
    // New v2 systems — guarded so missing scripts are harmless
    if (window.BloodV2 && typeof window.BloodV2.init === 'function') {
      window.BloodV2.init(scene);
    }
    if (window.GoreSim && typeof window.GoreSim.init === 'function') {
      window.GoreSim.init(scene, camera);
    }
    if (window.SlimePool && typeof window.SlimePool.init === 'function') {
      window.SlimePool.init(scene, 40);
    }
    if (window.WaveSpawner && typeof window.WaveSpawner.init === 'function') {
      window.WaveSpawner.init(scene, 9);
    }
    if (window.HitDetection && typeof window.HitDetection.init === 'function') {
      window.HitDetection.init(scene);
    }
    // Initialize trauma system alongside blood system
    if (window.TraumaSystem && typeof TraumaSystem.init === 'function') {
      TraumaSystem.init(scene);
    }
  }

  // ─── Rage combat system init ──────────────────────────────────────────────────
  function _initRageCombat() {
    if (window.GameRageCombat && typeof GameRageCombat.init === 'function') {
      try {
        GameRageCombat.init(scene, saveData, spawnParticles);
        // Make combat HUD visible in sandbox
        if (typeof GameRageCombat.setCombatHUDVisible === 'function') {
          GameRageCombat.setCombatHUDVisible(true);
        }
        // Register special attack callback to handle damage to slimes
        if (typeof GameRageCombat.onSpecialAttack === 'function') {
          GameRageCombat.onSpecialAttack((sa) => {
            if (!player || !player.mesh) return;
            const pPos = player.mesh.position;
            const radSq = sa.damageRadius * sa.damageRadius;
            // Check each active slime and deal damage if in range
            for (let i = 0; i < _activeSlimes.length; i++) {
              const s = _activeSlimes[i];
              if (!s || !s.active || s.dead) continue;
              const dx = s.mesh.position.x - pPos.x;
              const dz = s.mesh.position.z - pPos.z;
              if (dx*dx + dz*dz <= radSq) {
                s.hp -= sa.damage;
                if (s.hp <= 0) {
                  _killSlime(s, 1.0, 0, 0);
                } else {
                  // Visual feedback for hit
                  s.flashTimer = 0.15;
                  s.squishTime = 0.3;
                  _updateSlimeHPBar(s);
                }
              }
            }
          });
        }
        console.log('[SandboxLoop] Rage combat system initialized');
      } catch (e) {
        console.warn('[SandboxLoop] Failed to initialize rage combat:', e);
      }
    }
  }

  // ─── Object pool init ─────────────────────────────────────────────────────────
  function _initPools() {
    // Initialize the GameObjectPool (trail pool) with the active scene
    if (window.GameObjectPool && typeof GameObjectPool.init === 'function') {
      GameObjectPool.init(scene);
    }
    // Initialize entity pools from main.js if available
    if (typeof _ensureEntityPools === 'function') {
      _ensureEntityPools();
    }
    // Build our local projectile pool
    _buildProjectilePool();
    // Build pre-allocated flesh chunk pool (avoids new THREE.Mesh during gameplay)
    _buildFleshPool();
    // Build pre-allocated blood stain decal pool (ground stains at kill positions)
    _buildBloodStainPool();
    _buildCorpseBloodPool();
    // Build pre-allocated bullet hole decal pool (ground impacts at miss positions)
    _buildBulletHolePool();

    // ═══ NEW XP STAR SYSTEM V2 ═══
    // Initialize the brand new XP star system (no old map conflicts)
    if (typeof XPStarSystem !== 'undefined') {
      XPStarSystem.init(scene);
      console.log('[SandboxLoop] XP Star System V2 initialized');
    } else {
      console.error('[SandboxLoop] XPStarSystem not loaded!');
    }

    // Build pooled PointLight flash pool (muzzle flashes, hit lights)
    _buildFlashPool();
    // Initialize spatial hash for O(1) projectile→enemy collision
    _initSpatialHash();
  }

  // ─── Sandbox status overlay (disabled — clean screen) ────────────────────────
  function _buildSandboxOverlay() {
    // Debug/status overlay removed per requirements — screen must be clean
  }

  // ─── WaveManager — encapsulates survivor-style wave spawning logic ───────────
  // Keeps the core animate loop clean.  Adheres to the pre-allocated pool
  // architecture — all spawns go through _spawnWave / _activateSlime.
  const WaveManager = {
    _crawlerSpawnTimer: 0,
    _leapingSpawnTimer: 6,  // initial delay before first leaping slime spawn
    /** Tick wave timers and escalation.  Call once per frame from _animate. */
    update: function(dt) {
      _spawnTimer -= dt;
      if (_spawnTimer <= 0) {
        _spawnTimer = _spawnInterval;
        _spawnWave();
      }

      // Crawler spawn: every 8-12 seconds once wave difficulty escalates past initial waves
      this._crawlerSpawnTimer -= dt;
      var CRAWLER_SPAWN_WAVE_THRESHOLD = 5;
      if (this._crawlerSpawnTimer <= 0 && _waveSize >= CRAWLER_SPAWN_WAVE_THRESHOLD) {
        this._crawlerSpawnTimer = 8 + Math.random() * 4;
        _spawnCrawler();
      }

      // Leaping slime spawn: every 6-10 seconds from wave 3 onward
      this._leapingSpawnTimer -= dt;
      var LEAPING_SPAWN_WAVE_THRESHOLD = 3;
      if (this._leapingSpawnTimer <= 0 && _waveSize >= LEAPING_SPAWN_WAVE_THRESHOLD) {
        this._leapingSpawnTimer = 6 + Math.random() * 4;
        _spawnLeapingSlime();
      }

      _escalationTimer -= dt;
      if (_escalationTimer <= 0) {
        _escalationTimer = ESCALATION_INTERVAL;
        _waveSize      = Math.min(_waveSize + 2, 20);
        _maxActive     = Math.min(_maxActive + 5, MAX_SLIMES);
        _spawnInterval = Math.max(1.5, _spawnInterval * 0.85);
        console.log('[WaveManager] Escalation! waveSize=' + _waveSize +
          ' maxActive=' + _maxActive +
          ' interval=' + _spawnInterval.toFixed(2) + 's');
      }
    }
  };

  // ─── LootManager — encapsulates EXP gem update and collection logic ──────────
  // Delegates to _updateGems for the pooled gem simulation.
  const LootManager = {
    /** Tick all active EXP gems and check for player pickup.  Call once per frame. */
    update: function(dt) {
      _updateGems(dt);
    }
  };

  // ─── Main animation loop ──────────────────────────────────────────────────────
  function _animate(nowMs) {
    _rafId = requestAnimationFrame(_animate);

    try {
      const rawDt = Math.min((nowMs - _lastTime) / 1000, 0.05); // cap at 50 ms
      _lastTime = nowMs;

      // ── Hit-stop: freeze simulation for a brief "impact" moment ─────────────
      if (_hitStopRemaining > 0) {
        _hitStopRemaining -= rawDt * 1000;
        if (_hitStopRemaining < 0) _hitStopRemaining = 0;
        if (window._bloomComposer) {
          window._bloomComposer.render();
        } else {
          renderer.render(scene, camera); // keep drawing; only physics is frozen
        }
        return;
      }

      const dt = rawDt;

      // Track FPS for auto-quality adjustment
      _trackFPS(dt);

      if (window.isPaused) {
        if (window._bloomComposer) {
          window._bloomComposer.render();
        } else {
          renderer.render(scene, camera);
        }
        return;
      }

      // Update dopamine time dilation
      if (window.DopamineSystem && window.DopamineSystem.TimeDilation) {
        window.DopamineSystem.TimeDilation.update(dt);
      }

      _movePlayer(dt);
      if (_spawnIntroActive) _updateSpawnIntro(dt);
      _updateGunRecoil(dt);

      // Rebuild spatial hash once per frame so _updateProjectiles uses fresh data
      _rebuildSpatialHash();

      _updateSlime(dt);
      _updateCrawlers(dt);
      _updateLeapingSlimes(dt);
      _tryFire(dt);
      _updateProjectiles(dt);
      _updateWeaponEffects(dt); // sword/samurai/aura active weapon effects

      // Manager updates (wave spawning + loot pickup)
      WaveManager.update(dt);
      LootManager.update(dt);

      // Player class built-in update (handles dash, invulnerability ticks, etc.)
      if (player && typeof player.update === 'function') {
        // Pass all active enemies so auto-aim can target leaping slimes too
        const _allEnemies = _activeLeapingSlimes.length > 0
          ? _activeSlimes.concat(_activeLeapingSlimes)
          : _activeSlimes;
        player.update(dt, _allEnemies, _activeProjList, expGems);
      }

      // Blood system tick
      if (window.BloodSystem && typeof BloodSystem.update === 'function') {
        BloodSystem.update();
      }
      // New v2 system ticks — guarded so missing scripts are harmless
      if (window.BloodV2 && typeof window.BloodV2.update === 'function') {
        window.BloodV2.update(dt);
      }
      if (window.GoreSim && typeof window.GoreSim.update === 'function') {
        window.GoreSim.update(dt);
      }
      if (window.SlimePool && typeof window.SlimePool.update === 'function') {
        window.SlimePool.update(dt, player ? player.mesh.position : null);
      }
      if (window.WaveSpawner && typeof window.WaveSpawner.update === 'function') {
        window.WaveSpawner.update(dt, player ? player.mesh.position : null);
      }
      if (window.HitDetection && typeof window.HitDetection.update === 'function') {
        window.HitDetection.update(dt, player ? player.mesh.position : null);
      }
      // Trauma system tick (gore chunks, stuck arrows, wound decals)
      if (window.TraumaSystem && typeof TraumaSystem.update === 'function') {
        TraumaSystem.update(dt);
      }

      // Blood stain decal fade update
      _updateBloodStains(dt);

      // Bullet hole decal fade update
      _updateBulletHoles(dt);

      // Gore: corpse linger system — heartbeat blood pumping and cleanup
      _updateCorpses(dt);

      // Rage combat system tick
      if (window.GameRageCombat && typeof GameRageCombat.update === 'function') {
        GameRageCombat.update(dt);
      }

      // Grey Boss system tick
      if (typeof GreyBossSystem !== 'undefined') { GreyBossSystem.update(dt); }

      // Damage numbers
      if (window.DopamineSystem && window.DopamineSystem.DamageNumbers) {
        window.DopamineSystem.DamageNumbers.update(dt);
      }

      // World objects: day/night cycle, sway physics, ambient animations
      if (window.WorldObjects && typeof WorldObjects.update === 'function') {
        WorldObjects.update(dt);
      }

      // Atmospheric weather particles and dynamic sky cycle
      try { if (_weatherActive) _updateWeatherSystem(dt, nowMs); } catch(e) {}
      try { _updateSkyCycle(dt); } catch(e) {}

      // ── Engine 2.0 Landmark Animations ───────────────────────────────────────
      // Animate UFO, Obelisk, and Lake features added to Sandbox 2.0
      if (window._engine2Landmarks) {
        const landmarks = window._engine2Landmarks;

        // UFO engine lights pulsing
        if (landmarks.ufo) {
          if (landmarks.ufo.engineLights) {
            landmarks.ufo.engineLights.forEach((light, idx) => {
              light.userData.phase = (light.userData.phase || 0) + dt * 2;
              const pulseFactor = 0.7 + Math.sin(light.userData.phase) * 0.3;
              light.material.opacity = pulseFactor;
              light.scale.setScalar(0.8 + pulseFactor * 0.4);
            });
          }
          if (landmarks.ufo.enginePointLights) {
            landmarks.ufo.enginePointLights.forEach((light, idx) => {
              light.userData.phase = (light.userData.phase || 0) + dt * 2;
              light.intensity = 2.0 + Math.sin(light.userData.phase) * 1.0;
            });
          }
        }

        // Annunaki Obelisk crystal rotation + energy rings
        if (landmarks.obelisk) {
          // Rotate and pulse the top energy crystal
          if (landmarks.obelisk.crystal) {
            landmarks.obelisk.crystal.userData.phase = (landmarks.obelisk.crystal.userData.phase || 0) + dt * 1.5;
            landmarks.obelisk.crystal.rotation.y += dt * 0.8;
            landmarks.obelisk.crystal.rotation.x = Math.sin(landmarks.obelisk.crystal.userData.phase) * 0.3;
            landmarks.obelisk.crystal.material.emissiveIntensity = 1.0 + Math.sin(landmarks.obelisk.crystal.userData.phase * 2) * 0.4;
          }

          // Rotate energy rings at different speeds
          if (landmarks.obelisk.rings && landmarks.obelisk.rings.length > 0) {
            landmarks.obelisk.rings.forEach((ring, idx) => {
              ring.userData.phase = (ring.userData.phase || 0) + dt * ring.userData.speed;
              ring.rotation.z = ring.userData.phase;
              ring.material.opacity = (0.3 - idx * 0.08) + Math.sin(ring.userData.phase * 1.5) * 0.1;
            });
          }

          // Pulse the top and base lights
          const obeliskPhase = (window._obeliskLightPhase || 0) + dt * 2.0;
          window._obeliskLightPhase = obeliskPhase;

          if (landmarks.obelisk.topLight) {
            landmarks.obelisk.topLight.intensity = 2.5 + Math.sin(obeliskPhase) * 0.8;
          }
          if (landmarks.obelisk.baseLight) {
            landmarks.obelisk.baseLight.intensity = 1.3 + Math.sin(obeliskPhase * 1.3) * 0.5;
          }

          // Pulse pylon crystals
          if (landmarks.obelisk.pylonCrystals && landmarks.obelisk.pylonCrystals.length > 0) {
            landmarks.obelisk.pylonCrystals.forEach(crystal => {
              crystal.userData.phase = (crystal.userData.phase || 0) + dt * 2.5;
              crystal.rotation.y += dt * 1.2;
              crystal.material.opacity = 0.6 + Math.sin(obeliskPhase * 2 + crystal.userData.phase) * 0.2;
            });
          }
        }

        // Lake sparkles animation (waterfall removed)
        if (landmarks.lake && landmarks.lake.sparkles) {
          landmarks.lake.sparkles.forEach(sparkle => {
            sparkle.userData.phase = (sparkle.userData.phase || 0) + 0.02 * sparkle.userData.speed;
            sparkle.material.opacity = 0.3 + Math.abs(Math.sin(sparkle.userData.phase)) * 0.7;
            sparkle.scale.set(
              1 + Math.sin(sparkle.userData.phase * 2) * 0.5,
              1,
              1 + Math.sin(sparkle.userData.phase * 2) * 0.5
            );
          });
        }
      }

      // Ground details: grass wind, player disturbance
      if (window._engine2Instance && window._engine2Instance._groundDetails) {
        window._engine2Instance._groundDetails.update(dt, player ? player.mesh.position : null);
      }

      // Camera shake & pooled flash updates
      _updateCameraShake(dt);
      _updateFlashPool(dt);

      _refreshHUD(dt);

      // Tick player status effects (StatusBar depletion)
      if (typeof window._tickPlayerStatus === 'function') window._tickPlayerStatus(dt);

      if (window._bloomComposer) {
        window._bloomComposer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch (e) {
      if (!_animateErrorShown) {
        _animateErrorShown = true;
        _showError('Animate error: ' + (e && e.message ? e.message : String(e)));
        console.error('[SandboxLoop] _animate error:', e);
      }
    }
  }

  // ─── Boot sequence ────────────────────────────────────────────────────────────

  // ─── Weather Particle System ──────────────────────────────────────────────────
  function _initWeatherSystem() {
    try {
      if (typeof THREE === 'undefined' || !scene) return;
      // Disable WorldObjects' built-in day/night so _updateSkyCycle is the sole
      // controller of scene.background, fog.color, and light intensities.
      if (window.WorldObjects && typeof WorldObjects.setDayNightEnabled === 'function') {
        WorldObjects.setDayNightEnabled(false);
      }
      _weatherGeo = new THREE.BufferGeometry();
      var positions = new Float32Array(WEATHER_COUNT * 3);
      _weatherVelocities = [];
      for (var i = 0; i < WEATHER_COUNT; i++) {
        positions[i * 3]     = (Math.random() - 0.5) * 200;
        positions[i * 3 + 1] = Math.random() * 60 - 5;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
        _weatherVelocities.push(-2 - Math.random() * 3); // downward Y velocity: -2 to -5
      }
      _weatherPositions = positions;
      _weatherGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      _weatherMat = new THREE.PointsMaterial({
        color: 0xccddff,
        size: 0.15,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      _weatherParticles = new THREE.Points(_weatherGeo, _weatherMat);
      // Disable frustum culling because geometry positions are continuously re-centered
      // around the player without updating the geometry's bounding volume.
      _weatherParticles.frustumCulled = false;
      scene.add(_weatherParticles);
      // Weather toggle exposed globally
      window._toggleWeather = function() {
        _weatherActive = !_weatherActive;
        if (_weatherParticles) _weatherParticles.visible = _weatherActive;
      };
    } catch(e) {
      console.warn('[SandboxLoop] Weather system init failed (non-fatal):', e);
    }
  }

  function _updateWeatherSystem(dt, nowMs) {
    if (!_weatherParticles || !_weatherPositions || !_weatherGeo) return;
    var px = (player && player.mesh) ? player.mesh.position.x : 0;
    var pz = (player && player.mesh) ? player.mesh.position.z : 0;
    var pos = _weatherPositions;
    _weatherFrameCounter++;
    // Re-center particle cloud around player every 60 frames
    var recenter = (_weatherFrameCounter % 60 === 0);
    // Scale horizontal drift by dt so motion is frame-rate independent.
    // Using 60 as a reference FPS keeps behavior similar at 60 FPS.
    var driftScale = dt * 60;
    for (var i = 0; i < WEATHER_COUNT; i++) {
      var idx = i * 3;
      // Downward movement
      pos[idx + 1] += _weatherVelocities[i] * dt;
      // Horizontal drift (sin-wave swaying), scaled by dt
      pos[idx]     += Math.sin(nowMs * 0.001 + i) * 0.02  * driftScale;
      pos[idx + 2] += Math.cos(nowMs * 0.0008 + i * 0.5) * 0.015 * driftScale;
      // Respawn particle when it falls below floor
      if (pos[idx + 1] < -2) {
        pos[idx]     = px + (Math.random() - 0.5) * 200;
        pos[idx + 1] = 40 + Math.random() * 20;
        pos[idx + 2] = pz + (Math.random() - 0.5) * 200;
      }
      // Periodically re-center around player
      if (recenter) {
        var dx = pos[idx]     - px;
        var dz = pos[idx + 2] - pz;
        if (Math.abs(dx) > 100) pos[idx]     = px + (Math.random() - 0.5) * 200;
        if (Math.abs(dz) > 100) pos[idx + 2] = pz + (Math.random() - 0.5) * 200;
      }
    }
    _weatherGeo.attributes.position.needsUpdate = true;
  }

  // ─── Sky Color Day/Night Cycle ────────────────────────────────────────────────
  function _updateSkyCycle(dt) {
    if (typeof THREE === 'undefined' || !scene) return;
    // Advance time
    _skyTime += _skySpeed * dt;
    if (_skyTime >= 1.0) _skyTime -= 1.0;

    // Find bracketing keyframes
    var colors = _skyColors;
    var a = colors[0], b = colors[1];
    for (var i = 0; i < colors.length - 1; i++) {
      if (_skyTime >= colors[i].time && _skyTime < colors[i + 1].time) {
        a = colors[i];
        b = colors[i + 1];
        break;
      }
    }
    var span = b.time - a.time;
    var t = span > 0 ? (_skyTime - a.time) / span : 0;

    // Lazy-init reusable THREE.Color instances (avoids allocations every frame)
    if (!_skyColA) {
      _skyColA = new THREE.Color();
      _skyColB = new THREE.Color();
      _fogColA = new THREE.Color();
      _fogColB = new THREE.Color();
    }

    // Lerp sky and fog colors using cached instances (zero allocations per frame)
    _skyColA.setHex(a.sky);
    _skyColB.setHex(b.sky);
    _fogColA.setHex(a.fog);
    _fogColB.setHex(b.fog);
    _skyColA.lerp(_skyColB, t); // _skyColA now holds the interpolated sky color
    _fogColA.lerp(_fogColB, t); // _fogColA now holds the interpolated fog color

    var ambInt = a.ambInt + (b.ambInt - a.ambInt) * t;
    var sunInt = a.sunInt + (b.sunInt - a.sunInt) * t;

    // Apply sky color
    if (scene.background) scene.background.set(_skyColA);
    else scene.background = _skyColA.clone();
    if (scene.fog) scene.fog.color.set(_fogColA);

    // Apply lighting (guarded)
    if (window._sandboxLights) {
      if (window._sandboxLights.ambient) window._sandboxLights.ambient.intensity = ambInt;
      // Sun position follows the cycle; suppress when below horizon
      if (window._sandboxLights.sun) {
        var sunAngle = _skyTime * Math.PI * 2;
        var sunY = Math.sin(sunAngle) * 40 + 10;
        window._sandboxLights.sun.position.set(Math.cos(sunAngle) * 60, sunY, 20);
        window._sandboxLights.sun.intensity = sunY < 0 ? 0 : sunInt;
      }
    }

    // Adjust weather particle appearance based on time of day
    if (_weatherMat) {
      var isNight = (_skyTime >= 0.8 || _skyTime < 0.2);
      if (isNight) {
        _weatherMat.color.setHex(0x4466aa);
        _weatherMat.opacity = 0.2;
      } else {
        _weatherMat.color.setHex(0xccddff);
        _weatherMat.opacity = 0.4;
      }
    }
  }

  // ─── Boot sequence ────────────────────────────────────────────────────────────
  function _boot() {
    if (_ready) return;
    _ready = true;

    console.log('[🎮 SandboxLoop] Starting Sandbox 2.0 boot sequence...');

    // Bug 1 fix: set sandbox mode flag BEFORE any init calls so world-gen.js
    // skips the duplicate ground plane and Engine2Sandbox initialises correctly.
    window._engine2SandboxMode = true;
    console.log('[🎮 SandboxLoop] ✓ Sandbox mode flag set');

    try {
      // Allow showUpgradeModal to run (main.js defaults isGameActive=false for menu).
      // Use setter functions to avoid readonly property crash on iOS/Safari.
      if (typeof setGameActive === 'function') setGameActive(true);
      if (typeof setGameOver === 'function') setGameOver(false);
      window.isGameActive = true;
      window.isGameOver = false;
      console.log('[🎮 SandboxLoop] ✓ Game state activated');

      // Hide loading screen
      const ls = document.getElementById('loading-screen');
      if (ls) { ls.style.opacity = '0'; setTimeout(function () { ls.style.display = 'none'; }, 400); }
      console.log('[🎮 SandboxLoop] ✓ Loading screen hidden');

      // Show the ui-layer (HUD)
      const uiLayer = document.getElementById('ui-layer');
      if (uiLayer) uiLayer.style.display = 'block';
      console.log('[🎮 SandboxLoop] ✓ UI layer shown');

      console.log('[🎮 SandboxLoop] Initializing settings...');
      _initSandboxSettings();
      console.log('[🎮 SandboxLoop] ✓ Settings initialized');

      // Init Three.js
      console.log('[🎮 SandboxLoop] Initializing Three.js scene...');
      _initScene();
      console.log('[🎮 SandboxLoop] ✓ Scene initialized');

      console.log('[🎮 SandboxLoop] Initializing ground (Engine2Sandbox)...');
      _initGround();
      console.log('[🎮 SandboxLoop] ✓ Ground initialized');

      // Initialize static world objects (trees, rocks, fences, grass, Stonehenge, Lore Lake, day/night)
      if (window.WorldObjects && typeof WorldObjects.init === 'function') {
        console.log('[🎮 SandboxLoop] Initializing WorldObjects (static map)...');
        WorldObjects.init(scene, window._sandboxLights);
        console.log('[🎮 SandboxLoop] ✓ WorldObjects initialized');
      }

      console.log('[🎮 SandboxLoop] Initializing blood/gore systems...');
      _initBloodSystem();
      console.log('[🎮 SandboxLoop] ✓ Blood systems initialized');

      console.log('[🎮 SandboxLoop] Initializing rage combat...');
      _initRageCombat();
      console.log('[🎮 SandboxLoop] ✓ Rage combat initialized');

      console.log('[🎮 SandboxLoop] Initializing object pools...');
      _initPools();
      console.log('[🎮 SandboxLoop] ✓ Object pools initialized');

      // Initialize atmospheric weather particle system (non-fatal if it fails)
      try { _initWeatherSystem(); } catch(e) { console.warn('[SandboxLoop] Weather init failed:', e); }

      console.log('[🎮 SandboxLoop] Initializing player (spawn animation will trigger)...');
      _initPlayer();
      console.log('[🎮 SandboxLoop] ✓ Player initialized at position:', player?.mesh?.position);
      console.log('[🎮 SandboxLoop] ✓ Spawn intro active:', _spawnIntroActive);

      console.log('[🎮 SandboxLoop] Building slime enemy pool...');
      _buildSlimePool();     // Pre-allocate enemy pool (50 slots)
      console.log('[🎮 SandboxLoop] ✓ Slime pool built (50 slots)');

      // Initialize crawler enemy pool
      if (window.CrawlerPool && typeof CrawlerPool.init === 'function') {
        console.log('[🎮 SandboxLoop] Building crawler enemy pool...');
        CrawlerPool.init(scene, 15);
        console.log('[🎮 SandboxLoop] ✓ Crawler pool built (15 slots)');
      }

      // Initialize leaping slime enemy pool
      if (window.LeapingSlimePool && typeof LeapingSlimePool.init === 'function') {
        console.log('[🎮 SandboxLoop] Building leaping slime pool...');
        LeapingSlimePool.init(scene, 20);
        console.log('[🎮 SandboxLoop] ✓ Leaping slime pool built (20 slots)');
      }
      // Initialize Grey Boss system
      if (typeof GreyBossSystem !== 'undefined') { GreyBossSystem.init(scene, camera, player); }

      console.log('[🎮 SandboxLoop] Spawning first wave...');
      _spawnWave();          // Spawn first wave immediately
      console.log('[🎮 SandboxLoop] ✓ First wave spawned');

      console.log('[🎮 SandboxLoop] Initializing input handlers...');
      _initInput();
      console.log('[🎮 SandboxLoop] ✓ Input initialized');

      _buildSandboxOverlay();
      _refreshExpBar();

      // Attach X button handler for levelup-modal (game-screens.js not loaded in sandbox)
      const xBtn = document.getElementById('levelup-x-btn');
      if (xBtn) {
        xBtn.addEventListener('click', function () {
          const modal = document.getElementById('levelup-modal');
          if (modal) modal.style.display = 'none';
          window.isPaused = false;
        });
      }

      // Start loop
      _lastTime = performance.now();
      _rafId = requestAnimationFrame(_animate);

      console.log('[🎮 SandboxLoop] ✓ Animation loop started');
      console.log('[🎮 SandboxLoop] ════════════════════════════════════════════');
      console.log('[🎮 SandboxLoop] 🎉 ENGINE 2.0 SANDBOX READY!');
      console.log('[🎮 SandboxLoop] ════════════════════════════════════════════');
      console.log('[🎮 SandboxLoop] ✓ Spawn animation should be running');
      console.log('[🎮 SandboxLoop] ✓ Eye of Horus button (𓂀) in top-right');
      console.log('[🎮 SandboxLoop] ✓ Ground texture loading from Engine2Sandbox');
      console.log('[🎮 SandboxLoop] ✓ Blood/gore systems ready');
      console.log('[🎮 SandboxLoop] Type runSandboxDiagnostics() for full report');
      console.log('[🎮 SandboxLoop] ════════════════════════════════════════════');
      console.log('[GORE PATCH v1 REALISTIC] Applied successfully');
    } catch (e) {
      _showError('Boot error: ' + (e && e.message ? e.message : String(e)));
      console.error('[SandboxLoop] _boot error:', e);
    }
  }

  // Boot when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }
}());
