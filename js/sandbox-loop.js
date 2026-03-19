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
    // ── Pooled floating-text system: pre-allocates DOM elements, zero new div() during play ──
    const _FT_POOL_SIZE = 32;
    const _ftPool  = []; // available elements
    const _ftNDC   = { x: 0, y: 0 }; // reusable NDC projection (no new object)
    // Pre-allocate all floating-text divs once (called lazily on first use)
    function _ftInit() {
      if (_ftPool.length) return;
      const baseStyle = [
        'position:fixed',
        'pointer-events:none',
        'font-family:Bangers,cursive',
        'font-size:22px',
        'font-weight:bold',
        'text-shadow:1px 1px 4px #000',
        'z-index:9999',
        'will-change:transform,opacity',
        'display:none',
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
    window.createFloatingText = function (text, pos, color) {
      _ftInit();
      const el = _ftPool.length ? _ftPool.pop() : null;
      if (!el) return; // pool exhausted — skip to avoid visual glitch (32 slots is plenty)
      el.textContent = text;
      el.style.color = color || '#FFD700';
      el.style.transition = 'none';
      el.style.transform  = 'translateY(0)';
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
      el.style.left    = sx + 'px';
      el.style.top     = sy + 'px';
      el.style.display = 'block';
      requestAnimationFrame(function () {
        el.style.transition = 'transform 1.2s ease-out,opacity 1.2s ease-out';
        el.style.transform  = 'translateY(-60px)';
        el.style.opacity    = '0';
      });
      setTimeout(function () {
        el.style.display    = 'none';
        el.style.transition = 'none';
        el.style.transform  = 'translateY(0)';
        el.style.opacity    = '1';
        _ftPool.push(el); // return to pool
      }, 1400);
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
        // Adjusted leveling curve: power-law formula so max level ~60-65 is achievable end-game.
        // Base 45 with exponent 1.85 creates steep progression:
        // - Level 1→2: 45 XP (very fast start)
        // - Level 30: ~5,000 XP (mid-game)
        // - Level 60: ~25,000 XP (hard to reach, requires sustained combat)
        // - Level 65: ~30,000 XP (extreme late-game grind)
        playerStats.expReq = Math.floor(45 * Math.pow(playerStats.lvl, 1.85));
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
    tutorialQuests: null,
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
  const _activeCorpses = [];       // { slot, timer, lingerDuration, bloodTimer, poolMesh, poolMat }

  // Pre-allocated reusable Vector3 objects — ZERO new THREE.Vector3() during gameplay
  // Declared as plain objects first; upgraded to THREE.Vector3 after THREE is available
  // (THREE loads before sandbox-loop.js, so they become real Vector3s at IIFE boot time)
  let _tmpV3  = null; // general-purpose temp vector (set in _initScene)
  let _tmpV3b = null; // second reusable temp vector (set in _initScene)

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
        _releaseProjectile(p, i);
        continue;
      }

      // Collision with enemies — use spatial hash if available (O(1) per projectile)
      let hitThisFrame = false;
      if (_enemySpatialHash && _activeSlimes.length > 0) {
        const nearby = _enemySpatialHash.query(p.mesh.position.x, p.mesh.position.z, COLLISION_QUERY_RADIUS);
        for (let si = 0; si < nearby.length; si++) {
          const s = nearby[si];
          if (!s.active || s.dead) continue;
          const ex = p.mesh.position.x - s.mesh.position.x;
          const ez = p.mesh.position.z - s.mesh.position.z;
          if (ex * ex + ez * ez < COLLISION_THRESHOLD_SQ) {
            _hitSlime(p, s);
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
      [-0.22, 0.22].forEach(function (ox) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(ox, 0.3, 0.6);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 5), pupilMat);
        pupil.position.set(0, 0, 0.06);
        eye.add(pupil);
        mesh.add(eye);
        eyePupils.push(pupil); // Store reference for eye tracking
      });

      // HP bar
      const hpBgGeo  = new THREE.PlaneGeometry(1.4, 0.18);
      const hpBgMat  = new THREE.MeshBasicMaterial({ color: 0x330000, side: THREE.DoubleSide, depthWrite: false });
      const hpBg     = new THREE.Mesh(hpBgGeo, hpBgMat);
      hpBg.position.set(0, 1.3, 0);

      const hpFillGeo = new THREE.PlaneGeometry(1.4, 0.18);
      const hpFillMat = new THREE.MeshBasicMaterial({ color: 0x44FF44, side: THREE.DoubleSide, depthWrite: false });
      const hpFill    = new THREE.Mesh(hpFillGeo, hpFillMat);
      hpFill.position.set(0, 0, 0.001);
      hpBg.add(hpFill);
      mesh.add(hpBg);

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

      _enemyPool.push({
        mesh,
        hpFill,
        hpFillGeo,
        woundPool,   // pre-allocated wound meshes (pooled, replaces old wounds array)
        woundCount: 0, // number of currently active wound meshes
        eyePupils,   // Store eye pupil references for tracking
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
        // Attack lunge animation state
        attackTimer: 0,       // cooldown until next lunge
        lungeTime: 0,         // active lunge duration (0 = idle)
        lungeDirX: 0,
        lungeDirZ: 0,
        // Properties expected by Player.prototype.update (auto-aim, collision checks)
        id: 'pool-slime-' + i,
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
      const poolRadius = 0.1 + lifeRatio * 1.8; // grows from 0.1 to 1.9 units
      if (c.poolMesh) {
        c.poolMesh.scale.set(poolRadius * 10, poolRadius * 10, 1); // scale the fixed-size geo
        // Darken pool as time passes (more blood = darker)
        c.poolMat.opacity = 0.75 * (1 - lifeRatio * 0.3);
      }

      // Heartbeat blood pumping: sin-wave drives burst rate
      if (window.BloodSystem && typeof BloodSystem.emitBurst === 'function') {
        const heartRate = 3.0 * (1 - lifeRatio * 0.8); // slows from 3 Hz to 0.6 Hz
        c.bloodTimer += dt;
        const heartbeat = Math.sin(c.bloodTimer * heartRate * Math.PI * 2);
        if (heartbeat > 0.85 && lifeRatio < 0.85) {
          const pressure = (1 - lifeRatio) * 0.5; // weakening pressure
          BloodSystem.emitBurst(
            { x: c.x, y: 0.3, z: c.z },
            Math.floor(6 + pressure * 12),
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
            if (c.poolMesh) { scene.remove(c.poolMesh); c.poolMesh.geometry.dispose(); c.poolMat.dispose(); }
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
            if (c.slot.hpBar) { c.slot.hpBar.visible = true; }
            if (c.slot.hpFill) { c.slot.hpFill.visible = true; }
            _activeCorpses.splice(i, 1);
          }
        } else {
          // No material — just clean up immediately
          if (c.poolMesh) { scene.remove(c.poolMesh); c.poolMesh.geometry.dispose(); c.poolMat.dispose(); }
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
      createFloatingText('⚡' + actualDmg + '!', _tmpV3, '#FFD700');
    } else {
      _tmpV3.set(slot.mesh.position.x, 1.5, slot.mesh.position.z);
      createFloatingText('-' + actualDmg, _tmpV3, '#FF4444');
    }

    // Blood splatter on hit — reuse _reusableBloodPos (no new {} per hit)
    _reusableBloodPos.x = slot.mesh.position.x;
    _reusableBloodPos.y = slot.mesh.position.y + 0.4;
    _reusableBloodPos.z = slot.mesh.position.z;
    const _bloodPos = _reusableBloodPos;
    if (window.BloodSystem) {
      // Increased from 12 to 30 particles to match old map realism
      if (typeof BloodSystem.emitBurst === 'function') {
        BloodSystem.emitBurst(_bloodPos, 30, { spreadXZ: 1.2, spreadY: 0.5, minLife: 50, maxLife: 100 });
      }

      // Add blood drop meshes for physical realism (8-10 individual falling drops)
      if (typeof BloodSystem.emitDrop === 'function' && hpPercent < 0.75) {
        const dropCount = 6 + Math.floor(Math.random() * 4); // 6-9 drops
        for (let d = 0; d < dropCount; d++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 0.2 + Math.random() * 0.3;
          const dx = Math.cos(angle) * dist;
          const dz = Math.sin(angle) * dist;
          BloodSystem.emitDrop(
            _bloodPos.x + dx * 0.05,
            _bloodPos.y + 0.3,
            _bloodPos.z + dz * 0.05,
            dx * 0.15, // velocity X
            0.15 + Math.random() * 0.10, // velocity Y (upward)
            dz * 0.15, // velocity Z
            0.03 + Math.random() * 0.05 // size
          );
        }
      }

      // Register wound for heartbeat spurts (like old map at 75% HP)
      if (hpPercent <= 0.75 && typeof BloodSystem.addWound === 'function') {
        const wDir = { x: Math.cos(Math.random() * Math.PI * 2), z: Math.sin(Math.random() * Math.PI * 2) };
        const wLife = hpPercent < 0.25 ? 480 : (hpPercent < 0.5 ? 300 : 180);
        BloodSystem.addWound(_bloodPos, wDir, 'gun', { life: wLife });
      }
    }

    // ── 5-PART PROGRESSIVE DAMAGE SYSTEM ──────────────────────────────────────
    // (hpPercent already declared above before blood system section)

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

    // ── DEATH EXPLOSION WITH MASSIVE GORE (MATCH OLD MAP: 600 PARTICLES) ─────
    if (window.BloodSystem) {
      // OLD MAP: 350-600 particle burst for death - we match with 500
      if (typeof BloodSystem.emitBurst === 'function') {
        BloodSystem.emitBurst({ x, y, z }, 500, {
          spreadXZ: 3.0,
          spreadY: 1.2,
          minLife: 50,
          maxLife: 120,
          minSize: 0.02,
          maxSize: 0.12
        });
      }
      if (typeof BloodSystem.emitGuts === 'function') {
        BloodSystem.emitGuts({ x, y, z }, 30); // Increased from 25 to 30
      }
      // Final death throes: heartbeat gushing before going still
      // OLD MAP: 6-10 pulses × 280-500 particles, 180ms interval
      if (typeof BloodSystem.emitHeartbeatWound === 'function') {
        BloodSystem.emitHeartbeatWound({ x, y, z }, {
          pulses: 10, // Increased from 6 to 10 like old map miniboss
          perPulse: 280, // Increased from 250 to 280
          interval: 180, // Reduced from 200 to 180 to match old map
          woundHeight: 1.4,
          pressure: 1.5
        });
      }
      // OLD MAP: Blood pulse emissions
      if (typeof BloodSystem.emitPulse === 'function') {
        BloodSystem.emitPulse({ x, y, z }, {
          pulses: 6,
          perPulse: 400,
          interval: 180,
          spreadXZ: 1.5
        });
      }
      // ADD: Physical blood drop meshes like old map (18 individual spheres)
      if (typeof BloodSystem.emitDrop === 'function') {
        for (let d = 0; d < 18; d++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 0.5 + Math.random() * 1.5;
          const dx = Math.cos(angle) * dist;
          const dz = Math.sin(angle) * dist;
          BloodSystem.emitDrop(
            x + dx * 0.1,
            y + 0.5,
            z + dz * 0.1,
            dx * 0.3, // velocity X
            0.25 + Math.random() * 0.20, // velocity Y (upward arc)
            dz * 0.3, // velocity Z
            0.04 + Math.random() * 0.08 // size (larger drops)
          );
        }
      }
    }

    // Spawn 8-12 large flesh chunks flying in all directions
    _spawnFleshChunks(slot, 8 + Math.floor(Math.random() * 5), true);

    // Place a blood stain decal on the ground at the kill position
    _placeBloodStain(x, z);

    // ── GORE: Corpse linger for 5-8 seconds with heartbeat blood pumping ─────────
    // Remove from active list but keep the mesh visible as a "corpse"
    const corpseLinger = 5 + Math.random() * 3; // 5-8 seconds
    const idx = _activeSlimes.indexOf(slot);
    if (idx !== -1) _activeSlimes.splice(idx, 1);
    slot.active = false;
    slot.dead = true;
    // CRITICAL FIX: Ensure corpse mesh stays visible!
    slot.mesh.visible = true;
    // Flatten the corpse mesh and darken to a bloody grey
    slot.mesh.material.color.setHex(0x3A1A1A);
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
    // Hide HP bar
    if (slot.hpBar) slot.hpBar.visible = false;
    if (slot.hpFill) slot.hpFill.visible = false;
    // Growing blood pool under corpse
    const poolGeo = new THREE.CircleGeometry(0.1, 10);
    const poolMat = new THREE.MeshBasicMaterial({
      color: 0x550000, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false
    });
    const poolMesh = new THREE.Mesh(poolGeo, poolMat);
    poolMesh.rotation.x = -Math.PI / 2;
    poolMesh.position.set(x, 0.03, z);
    scene.add(poolMesh);
    _activeCorpses.push({ slot, timer: 0, lingerDuration: corpseLinger, bloodTimer: 0, poolMesh, poolMat, x, z });

    // ── EXP star drop: 1 guaranteed star + 15% chance for a bonus star per kill ──
    // Tier scales with hit force: high-force kills drop rarer (more valuable) stars.
    let gemEnemyType = ENEMY_TYPES ? ENEMY_TYPES.BALANCED : DEFAULT_ENEMY_TYPE;
    if (hitForce > 2.0)      gemEnemyType = 5; // rare (gold)
    else if (hitForce > 1.5) gemEnemyType = 3; // uncommon (blue)
    // Use the pre-allocated pool — no new THREE.Mesh during gameplay
    const _droppedGem = _acquireExpGem(x, z, 'gun', hitForce, gemEnemyType);
    if (_droppedGem) expGems.push(_droppedGem);
    // +15% drop rate bonus: 15% chance for an extra star on every kill
    if (Math.random() < BONUS_XP_DROP_RATE) {
      const _bonusGem = _acquireExpGem(x, z, 'gun', hitForce * 0.8, gemEnemyType);
      if (_bonusGem) expGems.push(_bonusGem);
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
    const frac = Math.max(0, slot.hp / slot.maxHp);
    // Scale x from full width (1.4) to 0, keeping left edge fixed
    slot.hpFill.scale.x = Math.max(0.001, frac);
    slot.hpFill.position.x = (frac - 1) * SLIME_HP_BAR_HALF_WIDTH;
    slot.hpFill.material.color.setHex(
      frac > 0.5 ? 0x44FF44 : frac > 0.25 ? 0xFFAA00 : 0xFF3300
    );
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
      // Increased from 8 to 30 to match old map realism
      if (typeof BloodSystem.emitBurst === 'function') {
        BloodSystem.emitBurst(_bPos1, 30, { spreadXZ: 0.8, spreadY: 0.4, minLife: 50, maxLife: 100 });
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
    createFloatingText('WOUNDED!', _tmpV3, '#FF8800');
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

    _spawnFleshChunks(slot, 2 + Math.floor(Math.random() * 2));

    const _bPos2 = _reusableBloodPos;
    _bPos2.x = slot.mesh.position.x; _bPos2.y = slot.mesh.position.y + 0.4; _bPos2.z = slot.mesh.position.z;
    if (window.BloodSystem) {
      // Increased from 18 to 60 to match old map impact
      if (typeof BloodSystem.emitBurst === 'function') {
        BloodSystem.emitBurst(_bPos2, 60, { spreadXZ: 1.5, spreadY: 0.6, minLife: 50, maxLife: 100 });
      }
      if (typeof BloodSystem.emitGuts === 'function') {
        BloodSystem.emitGuts(_bPos2, 6);
      }
      // Reduced pulse intervals from 300ms to 200ms to match old map's 180ms speed
      if (typeof BloodSystem.emitPulse === 'function') {
        BloodSystem.emitPulse(_bPos2, { pulses: 3, perPulse: 300, interval: 200 });
      }
      if (typeof BloodSystem.emitHeartbeatWound === 'function') {
        BloodSystem.emitHeartbeatWound(_bPos2, { pulses: 5, perPulse: 120, interval: 200, woundHeight: 0.8 });
      }
    }
    _tmpV3.set(slot.mesh.position.x, 1.7, slot.mesh.position.z);
    createFloatingText('HEAVY DAMAGE!', _tmpV3, '#FF4400');
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

    _spawnFleshChunks(slot, 3 + Math.floor(Math.random() * 3));

    const _bPos3 = _reusableBloodPos;
    _bPos3.x = slot.mesh.position.x; _bPos3.y = slot.mesh.position.y + 0.4; _bPos3.z = slot.mesh.position.z;
    if (window.BloodSystem) {
      // Increased from 30 to 100 to match old map's sniper hit intensity
      if (typeof BloodSystem.emitBurst === 'function') {
        BloodSystem.emitBurst(_bPos3, 100, { spreadXZ: 2.0, spreadY: 0.8, minLife: 50, maxLife: 100 });
      }
      if (typeof BloodSystem.emitGuts === 'function') {
        BloodSystem.emitGuts(_bPos3, 12);
      }
      // Speed up to 180ms interval like old map
      if (typeof BloodSystem.emitPulse === 'function') {
        BloodSystem.emitPulse(_bPos3, { pulses: 5, perPulse: 400, interval: 180 });
      }
      if (typeof BloodSystem.emitHeartbeatWound === 'function') {
        BloodSystem.emitHeartbeatWound(_bPos3, { pulses: 7, perPulse: 180, interval: 180, woundHeight: 1.0 });
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
    createFloatingText('CRITICAL!', _tmpV3, '#FF0000');
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

    _spawnFleshChunks(slot, 4 + Math.floor(Math.random() * 3), true);

    const _bPos4 = _reusableBloodPos;
    _bPos4.x = slot.mesh.position.x; _bPos4.y = slot.mesh.position.y + 0.4; _bPos4.z = slot.mesh.position.z;
    if (window.BloodSystem) {
      if (typeof BloodSystem.emitBurst === 'function') {
        BloodSystem.emitBurst(_bPos4, 45, { spreadXZ: 2.5, spreadY: 1.0 });
      }
      if (typeof BloodSystem.emitGuts === 'function') {
        BloodSystem.emitGuts(_bPos4, 18);
      }
      if (typeof BloodSystem.emitPulse === 'function') {
        BloodSystem.emitPulse(_bPos4, { pulses: 6, perPulse: 500, interval: 500 });
      }
      if (typeof BloodSystem.emitHeartbeatWound === 'function') {
        BloodSystem.emitHeartbeatWound(_bPos4, { pulses: 8, perPulse: 220, interval: 260, woundHeight: 1.2, pressure: 1.3 });
      }
      if (typeof BloodSystem.emitExitWound === 'function') {
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          BloodSystem.emitExitWound(_bPos4, { x: Math.cos(a) * 0.4, y: 0.15, z: Math.sin(a) * 0.4 });
        }
      }
    }
    _tmpV3.set(slot.mesh.position.x, 1.9, slot.mesh.position.z);
    createFloatingText('NEAR DEATH!', _tmpV3, '#DD0000');
  }

  // ─── Blood ground stain decal pool ───────────────────────────────────────────
  // Pre-allocated circular planes placed on the floor at enemy kill/hit positions.
  // Uses a ring-buffer so oldest stains are recycled when the pool is full.
  const BLOOD_STAIN_POOL_SIZE = 30;
  const _bloodStainPool = [];
  let _bloodStainHead = 0; // ring-buffer index

  function _buildBloodStainPool() {
    const stainGeo = new THREE.CircleGeometry(0.8, 12);
    for (let i = 0; i < BLOOD_STAIN_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x550000,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(stainGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.02, 0);
      mesh.visible = false;
      scene.add(mesh);
      _bloodStainPool.push({ mesh, fadeTimer: 0 });
    }
  }

  /**
   * Place a blood stain at (x, z) when an enemy dies.
   * Stains fade in quickly and then very slowly fade out over ~20 seconds.
   */
  function _placeBloodStain(x, z) {
    const slot = _bloodStainPool[_bloodStainHead % BLOOD_STAIN_POOL_SIZE];
    _bloodStainHead++;
    if (!slot) return;
    const size = 0.6 + Math.random() * 0.9;
    slot.mesh.scale.set(size, size, size);
    slot.mesh.position.set(x + (Math.random() - 0.5) * 0.3, 0.02, z + (Math.random() - 0.5) * 0.3);
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
  function _spawnFleshChunks(slot, count, large) {
    const pos = slot.mesh.position;

    for (let i = 0; i < count; i++) {
      const chunk = _acquireFleshChunk();
      if (!chunk) break; // pool exhausted — skip excess chunks

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
      gem.deactivate(); // park off-screen
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
      return gem;
    }
    // Pool exhausted (shouldn't happen with 40 slots in a single-player sandbox)
    if (typeof ExpGem !== 'undefined') {
      const gem = new ExpGem(x, z, sourceWeapon, hitForce, enemyType);
      gem._pooled = false; // not pooled — will be disposed normally on collect
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

      // Billboard HP bar toward camera
      if (camera) {
        const hpBar = s.mesh.children[2]; // index 2 = hpBg (after 2 eyes)
        if (hpBar) hpBar.quaternion.copy(camera.quaternion);
      }

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

      // Contact damage to player
      if (dist < 1.1 && !player.invulnerable) {
        const now = Date.now();
        if (now - s.lastDamageTime > 500) {
          s.lastDamageTime = now;
          if (typeof player.takeDamage === 'function') {
            player.takeDamage(8, 'slime', s.mesh.position);
          } else {
            playerStats.hp -= 8;
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

  // ─── EXP gem update & pickup ─────────────────────────────────────────────────
  function _updateGems(dt) {
    if (!expGems || !player) return;
    const px = player.mesh.position.x;
    const pz = player.mesh.position.z;
    const py = player.mesh.position.y;

    for (let i = expGems.length - 1; i >= 0; i--) {
      const g = expGems[i];
      if (!g || !g.active) { expGems.splice(i, 1); continue; }

      // Magnetism: pull toward player when within range
      if (g.onGround) {
        const gx = g.mesh.position.x, gz = g.mesh.position.z;
        const ddx = px - gx, ddz = pz - gz;
        const distToPlayer = Math.sqrt(ddx * ddx + ddz * ddz);
        // xpCollectionRadius (v2 stat) takes priority; falls back to pickupRange then 1.0
        const radiusMult = (playerStats.xpCollectionRadius || playerStats.pickupRange || 1.0);
        if (distToPlayer < PICKUP_RANGE * radiusMult) {
          const pullSpeed = MAGNETISM_SPEED * dt;
          g.mesh.position.x += (ddx / distToPlayer) * pullSpeed;
          g.mesh.position.z += (ddz / distToPlayer) * pullSpeed;
          g.mesh.position.y = 0.08;
          // Pickup when very close
          if (distToPlayer < 0.55) {
            _collectGem(g, i);
            continue;
          }
        }
      }

      g.update({ x: px, y: py, z: pz });
    }
  }

  function _collectGem(gem, idx) {
    const expGain = gem.value || (typeof GAME_CONFIG !== 'undefined' ? GAME_CONFIG.expValue : 15);
    // Reuse _tmpV3b for gem position (avoids .clone() allocation)
    if (gem.mesh) {
      _tmpV3b.copy(gem.mesh.position);
    } else {
      _tmpV3b.set(0, 0, 0);
    }

    if (typeof gem.collect === 'function') {
      // gem.collect() removes the mesh and calls addExp() internally
      gem.collect();
    } else {
      gem.active = false;
      if (gem.mesh) scene.remove(gem.mesh);
      // addExp handles EXP gain, bar refresh and level-up check
      addExp(expGain);
      playSound('exp_pickup');
    }

    createFloatingText('+' + expGain + ' EXP', _tmpV3b, '#5DADE2');

    if (idx !== undefined) expGems.splice(idx, 1);
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
    _tmpV3.set(
      player && player.mesh ? player.mesh.position.x : 0,
      player && player.mesh ? player.mesh.position.y + 0.5 : 0.5,
      player && player.mesh ? player.mesh.position.z : 0
    );
    createFloatingText('LEVEL UP!', _tmpV3, '#FFD700');
    // Trigger the level-up upgrade modal if available
    if (typeof showUpgradeModal === 'function') {
      // Use direct window.isPaused assignment in sandbox to bypass main.js overlay counter,
      // which prevents "player freeze" when forceGameUnpause only resets window.isPaused.
      window.isPaused = true;
      showUpgradeModal(false, null);
      // Failsafe: if showUpgradeModal returned without showing the modal
      // (e.g., isGameActive guard bailed early), unpause immediately.
      setTimeout(function () {
        const modal = document.getElementById('levelup-modal');
        if (window.isPaused && (!modal || modal.style.display !== 'flex')) {
          window.isPaused = false;
        }
      }, 80);
    }
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
            createFloatingText('-' + dmg, _tmpV3, '#FF8800');
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
        _tmpV3.set(px, 1.2, pz);
        createFloatingText('⚔', _tmpV3, '#FF8800');
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
            createFloatingText('-' + dmg, _tmpV3, '#33AAFF');
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
    document.addEventListener('keydown', function (e) { _keysDown[e.code] = true; });
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

    // Resize handler
    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

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
    const campBtn       = document.getElementById('return-to-camp-btn');
    const qualitySelect = document.getElementById('graphics-quality-select');
    const qualityDesc   = document.getElementById('quality-desc');
    const applyQualBtn  = document.getElementById('apply-quality-btn');

    if (!settingsBtn || !settingsModal || !closeBtn) return;

    settingsBtn.style.display = 'block';

    // Open settings (also accessible via Escape key)
    settingsBtn.addEventListener('click', function () {
      window.isPaused = true;
      // Sync select to current quality
      if (qualitySelect) {
        let cur = DEFAULT_QUALITY;
        try { cur = localStorage.getItem('sandboxGraphicsQuality') || DEFAULT_QUALITY; } catch (_) {}
        qualitySelect.value = cur;
        if (qualityDesc) qualityDesc.textContent = QUALITY_DESCS[cur] || '';
      }
      settingsModal.style.display = 'flex';
    });
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Escape') {
        if (settingsModal.style.display === 'flex') {
          settingsModal.style.display = 'none';
          window.isPaused = false;
        } else if (!window.isPaused) {
          // Only open settings if game is not paused for level-up etc.
          window.isPaused = true;
          if (qualitySelect) {
            let cur = DEFAULT_QUALITY;
            try { cur = localStorage.getItem('sandboxGraphicsQuality') || DEFAULT_QUALITY; } catch (_) {}
            qualitySelect.value = cur;
            if (qualityDesc) qualityDesc.textContent = QUALITY_DESCS[cur] || '';
          }
          settingsModal.style.display = 'flex';
        }
      }
    });

    closeBtn.addEventListener('click', function () {
      settingsModal.style.display = 'none';
      window.isPaused = false;
    });

    // Return to Camp
    if (campBtn) {
      campBtn.addEventListener('click', function () {
        window.location.href = 'index.html';
      });
    }

    // Quality dropdown — update description text live
    if (qualitySelect) {
      // Load persisted quality
      let saved = null;
      try { saved = localStorage.getItem('sandboxGraphicsQuality'); } catch (_) {}
      if (saved && QUALITY_DESCS[saved]) {
        qualitySelect.value = saved;
        if (qualityDesc) qualityDesc.textContent = QUALITY_DESCS[saved];
      }
      qualitySelect.addEventListener('change', function () {
        if (qualityDesc) qualityDesc.textContent = QUALITY_DESCS[this.value] || '';
      });
    }

    // Apply quality button
    if (applyQualBtn && qualitySelect) {
      applyQualBtn.addEventListener('click', function () {
        _applyGraphicsQuality(qualitySelect.value);
        // Flash button to confirm
        applyQualBtn.textContent = '✔ APPLIED!';
        applyQualBtn.style.background = 'linear-gradient(to bottom,#1a9f3f,#158230)';
        setTimeout(function () {
          applyQualBtn.textContent = 'APPLY QUALITY';
          applyQualBtn.style.background = 'linear-gradient(to bottom,#1a6e9f,#155a82)';
        }, 1200);
      });
    }

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
    // Fallback flat ground (also used when Engine2Sandbox is missing or throws)
    const geo = new THREE.PlaneGeometry(200, 200);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2d5a1b, roughness: 0.8, metalness: 0.0 });
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
      player.mesh.position.set(0, -1.5, 0);
    } else {
      const geo = new THREE.SphereGeometry(0.5, 12, 12);
      const mat = new THREE.MeshPhongMaterial({ color: 0x3A9FD8, emissive: 0x0A3D5C, emissiveIntensity: 0.35 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, -1.5, 0);
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
  const SPIRAL_RING_COUNT = 3;    // concentric rings
  const SPIRAL_SEG_COUNT  = 8;    // segments per ring
  const SPIRAL_RING_RADII = [1.4, 2.2, 3.0]; // inner to outer
  const SPIRAL_COLORS     = [0xCC8833, 0xAA6622, 0x886611]; // rust/bronze

  function _buildSpiralDoor() {
    // Segment geometry: thin wedge, approximated as BoxGeometry rotated
    // Each segment fills 360/8 = 45 degrees of its ring
    const segH = 0.08; // height of door panel
    for (let r = 0; r < SPIRAL_RING_COUNT; r++) {
      const ringR = SPIRAL_RING_RADII[r];
      const arcLen = (2 * Math.PI * ringR) / SPIRAL_SEG_COUNT * 0.9; // 90% fill
      const segGeo = new THREE.BoxGeometry(arcLen, segH, 0.25);
      const segMat = new THREE.MeshStandardMaterial({
        color: SPIRAL_COLORS[r],
        roughness: 0.5,
        metalness: 0.6,
        emissive: 0x331100,
        emissiveIntensity: 0.3,
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

    // Elevator platform — simple disc below the player
    const platGeo = new THREE.CylinderGeometry(1.1, 1.2, 0.12, 20);
    const platMat = new THREE.MeshStandardMaterial({
      color: 0x445566, roughness: 0.4, metalness: 0.7,
      emissive: 0x112233, emissiveIntensity: 0.4,
    });
    _elevatorPlatform = new THREE.Mesh(platGeo, platMat);
    _elevatorPlatform.position.set(0, -2.0, 0);
    _elevatorPlatform.castShadow = true;
    _elevatorPlatform.visible = false;
    scene.add(_elevatorPlatform);

    // Spawn light (point light from below, warm amber)
    _spawnLight = new THREE.PointLight(0xFFAA44, 0, 12);
    _spawnLight.position.set(0, -1.0, 0);
    scene.add(_spawnLight);
  }

  /** Place spiral door segments for a given open fraction (0=closed, 1=fully open). */
  function _updateSpiralDoorGeometry(openFrac, spin) {
    const outFrac = Math.max(0, openFrac);
    for (let i = 0; i < _spiralDoorParts.length; i++) {
      const part = _spiralDoorParts[i];
      const r = part.ring;
      // Each ring spins in alternating direction
      const dir = r % 2 === 0 ? 1 : -1;
      const angle = part.baseAngle + dir * spin * (1 + r * 0.3);
      // Segments start near center (closed: iris covering hole) and spread outward when opened.
      // closedR: very small so all segments cluster over the hole; openR: fully spread outside hole.
      const closedR = 0.15 + r * 0.12;
      const radius = closedR + outFrac * (part.baseRadius - closedR + 2.0 + r * 0.8);
      part.mesh.position.set(
        Math.cos(angle) * radius,
        0.04 + r * 0.01,
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

    // ── Phase 3 (t 0.35→0.85): Player + elevator rises ─────────────────────
    const riseT = _clamp((t - 0.35) / 0.5, 0, 1);
    const riseEased = 1 - Math.pow(1 - riseT, 3);

    // ── Phase 4 (t 0.80→1.0): Door closes back, light fades ────────────────
    const closeT = _clamp((t - 0.80) / 0.20, 0, 1);

    // Spin speed: fast during open, slows as it closes
    const spin = (openEased * 1.4 - closeT * 0.8) * 0.6;

    // Door open fraction: opens then closes back around elevator
    const doorOpen = openEased * (1 - closeT * 0.5);

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

    // Elevator platform: rises from y=-2 to y=0
    if (_elevatorPlatform) {
      _elevatorPlatform.visible = riseT > 0;
      _elevatorPlatform.position.y = -2.0 + riseEased * 2.1;
    }

    // Player: rises from y=-1.5 to y=0.5 with elevator, staying above platform
    player.mesh.position.y = -1.5 + riseEased * 2.0;

    // Spawn light: ramps up early, fades as door closes
    if (_spawnLight) {
      const lightStrength = _clamp(doorAppear - closeT, 0, 1);
      _spawnLight.intensity = lightStrength * 5.0;
      _spawnLight.position.y = -1.5 + riseEased * 1.5;
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
      player.mesh.position.x = _clamp(player.mesh.position.x + _playerVx * dt, -ARENA_RADIUS, ARENA_RADIUS);
      player.mesh.position.z = _clamp(player.mesh.position.z + _playerVz * dt, -ARENA_RADIUS, ARENA_RADIUS);
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
    // Build pre-allocated EXP gem pool (critical for XP drops to work)
    _buildExpGemPool();
    // Build pooled PointLight flash pool (muzzle flashes, hit lights)
    _buildFlashPool();
    // Initialize spatial hash for O(1) projectile→enemy collision
    _initSpatialHash();
  }

  // ─── Sandbox status overlay ───────────────────────────────────────────────────
  function _buildSandboxOverlay() {
    const el = document.createElement('div');
    el.id = 'sandbox-overlay';
    el.style.cssText = [
      'position:fixed',
      'top:8px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:rgba(0,0,0,0.65)',
      'color:#FFD700',
      'font-family:Bangers,cursive',
      'font-size:15px',
      'letter-spacing:1px',
      'padding:4px 18px',
      'border-radius:20px',
      'border:1px solid #FFD700',
      'z-index:9990',
      'pointer-events:none',
      'text-align:center',
    ].join(';');
    // Object pooling is active when the global GameObjectPool/ObjectPool system is available
    // OR when our local projectile pool has been successfully pre-allocated.
    const poolActive = !!(window.GameObjectPool || window.ObjectPool) || _projPool.length > 0;
    const poolBadge = poolActive
      ? '<span style="color:#00FF88">✔ Object Pooling Active</span>'
      : '<span style="color:#FF4444">✘ Object Pooling Inactive</span>';
    el.innerHTML = '⚙️ ENGINE 2.0 SANDBOX &nbsp;|&nbsp; WASD/Joystick to move &nbsp;|&nbsp; Mouse/Right-Joystick to aim &nbsp;|&nbsp; ' + poolBadge;
    document.body.appendChild(el);
    console.log('[SandboxLoop] ' + (poolActive ? '✔ Object Pooling Active' : '✘ Object Pooling Inactive'));
  }

  // ─── WaveManager — encapsulates survivor-style wave spawning logic ───────────
  // Keeps the core animate loop clean.  Adheres to the pre-allocated pool
  // architecture — all spawns go through _spawnWave / _activateSlime.
  const WaveManager = {
    /** Tick wave timers and escalation.  Call once per frame from _animate. */
    update: function(dt) {
      _spawnTimer -= dt;
      if (_spawnTimer <= 0) {
        _spawnTimer = _spawnInterval;
        _spawnWave();
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
        renderer.render(scene, camera); // keep drawing; only physics is frozen
        return;
      }

      const dt = rawDt;

      // Track FPS for auto-quality adjustment
      _trackFPS(dt);

      if (window.isPaused) {
        renderer.render(scene, camera);
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
      _tryFire(dt);
      _updateProjectiles(dt);
      _updateWeaponEffects(dt); // sword/samurai/aura active weapon effects

      // Manager updates (wave spawning + loot pickup)
      WaveManager.update(dt);
      LootManager.update(dt);

      // Player class built-in update (handles dash, invulnerability ticks, etc.)
      if (player && typeof player.update === 'function') {
        player.update(dt, _activeSlimes, _activeProjList, expGems);
      }

      // Blood system tick
      if (window.BloodSystem && typeof BloodSystem.update === 'function') {
        BloodSystem.update();
      }
      // Trauma system tick (gore chunks, stuck arrows, wound decals)
      if (window.TraumaSystem && typeof TraumaSystem.update === 'function') {
        TraumaSystem.update(dt);
      }

      // Blood stain decal fade update
      _updateBloodStains(dt);

      // Gore: corpse linger system — heartbeat blood pumping and cleanup
      _updateCorpses(dt);

      // Rage combat system tick
      if (window.GameRageCombat && typeof GameRageCombat.update === 'function') {
        GameRageCombat.update(dt);
      }

      // Damage numbers
      if (window.DopamineSystem && window.DopamineSystem.DamageNumbers) {
        window.DopamineSystem.DamageNumbers.update(dt);
      }

      // Camera shake & pooled flash updates
      _updateCameraShake(dt);
      _updateFlashPool(dt);

      _refreshHUD(dt);

      // Tick player status effects (StatusBar depletion)
      if (typeof window._tickPlayerStatus === 'function') window._tickPlayerStatus(dt);

      renderer.render(scene, camera);
    } catch (e) {
      if (!_animateErrorShown) {
        _animateErrorShown = true;
        _showError('Animate error: ' + (e && e.message ? e.message : String(e)));
        console.error('[SandboxLoop] _animate error:', e);
      }
    }
  }

  // ─── Boot sequence ────────────────────────────────────────────────────────────
  function _boot() {
    if (_ready) return;
    _ready = true;

    try {
      // Allow showUpgradeModal to run (main.js defaults isGameActive=false for menu).
      // Use setter functions to avoid readonly property crash on iOS/Safari.
      if (typeof setGameActive === 'function') setGameActive(true);
      if (typeof setGameOver === 'function') setGameOver(false);
      window.isGameActive = true;
      window.isGameOver = false;

      // Hide loading screen
      const ls = document.getElementById('loading-screen');
      if (ls) { ls.style.opacity = '0'; setTimeout(function () { ls.style.display = 'none'; }, 400); }

      // Show the ui-layer (HUD)
      const uiLayer = document.getElementById('ui-layer');
      if (uiLayer) uiLayer.style.display = 'block';

      _initSandboxSettings();
      // Init Three.js
      _initScene();
      _initGround();
      _initBloodSystem();
      _initRageCombat();
      _initPools();
      _initPlayer();
      _buildSlimePool();     // Pre-allocate enemy pool (50 slots)
      _spawnWave();          // Spawn first wave immediately
      _initInput();
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

      console.log('[SandboxLoop] Engine 2.0 Sandbox ready. Pool-enforced game loop started.');
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
