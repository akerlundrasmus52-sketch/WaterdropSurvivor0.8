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
    window.createFloatingText = function (text, pos, color) {
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = [
        'position:fixed',
        'pointer-events:none',
        'font-family:Bangers,cursive',
        'font-size:22px',
        'font-weight:bold',
        'text-shadow:1px 1px 4px #000',
        'z-index:9999',
        'transition:transform 1.2s ease-out,opacity 1.2s ease-out',
      ].join(';');
      el.style.color = color || '#FFD700';
      // Project world→screen using the global camera (set up later)
      const _proj = function () {
        if (!camera || !renderer) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const v = new THREE.Vector3(pos.x, pos.y + 1, pos.z);
        v.project(camera);
        return {
          x: (v.x * 0.5 + 0.5) * window.innerWidth,
          y: (-v.y * 0.5 + 0.5) * window.innerHeight,
        };
      };
      const p = _proj();
      el.style.left = p.x + 'px';
      el.style.top  = p.y + 'px';
      document.body.appendChild(el);
      requestAnimationFrame(function () {
        el.style.transform = 'translateY(-60px)';
        el.style.opacity   = '0';
      });
      setTimeout(function () { el.parentNode && el.parentNode.removeChild(el); }, 1400);
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
  // addExp — called by gem-classes.js ExpGem.collect() when a gem is picked up.
  // Handles EXP gain, HUD refresh, and level-up trigger.
  if (typeof window.addExp === 'undefined') {
    window.addExp = function (amount) {
      playerStats.exp += amount;
      _refreshExpBar();
      if (playerStats.exp >= playerStats.expReq) {
        playerStats.exp -= playerStats.expReq;
        playerStats.lvl++;
        playerStats.expReq = Math.floor(playerStats.expReq * 1.25);
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

  // ─── Projectile pool ─────────────────────────────────────────────────────────
  function _buildProjectilePool() {
    const geo = new THREE.SphereGeometry(0.12, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xFFFF55 });
    for (let i = 0; i < POOL_SIZE_PROJECTILES; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      _projPool.push({
        mesh: m,
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
      if (p.distSq > PROJECTILE_RANGE_SQ) {
        _releaseProjectile(p, i);
        continue;
      }

      // Collision with any active pool slime
      for (let si = 0; si < _activeSlimes.length; si++) {
        const s = _activeSlimes[si];
        const sx = s.mesh.position.x, sz = s.mesh.position.z;
        const ex = p.mesh.position.x - sx;
        const ez = p.mesh.position.z - sz;
        if (ex * ex + ez * ez < 1.2) {
          _hitSlime(p, s);
          _releaseProjectile(p, i);
          break;
        }
      }
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

      // Eye pair
      [-0.22, 0.22].forEach(function (ox) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(ox, 0.3, 0.6);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 5), pupilMat);
        pupil.position.set(0, 0, 0.06);
        eye.add(pupil);
        mesh.add(eye);
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
   * Slimes are spread in a ring around the player for dramatic effect.
   */
  function _spawnWave() {
    if (!player || !player.mesh) return;
    const available = _maxActive - _activeSlimes.length;
    if (available <= 0) return;
    const count = Math.min(_waveSize, available);
    const px = player.mesh.position.x;
    const pz = player.mesh.position.z;
    for (let n = 0; n < count; n++) {
      // Spread evenly around the ring with random jitter
      const angle = (n / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
      const dist  = 9 + Math.random() * 5;
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
    const actualDmg = Math.round(damage * hitForce);

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

    // Floating damage number
    createFloatingText(
      '-' + actualDmg,
      new THREE.Vector3(slot.mesh.position.x, 1.5, slot.mesh.position.z),
      '#FF4444'
    );

    // Blood splatter on hit — spawn from center of slime body
    // ENHANCED: Match old map's realistic blood behavior with higher particle counts
    const _bloodPos = { x: slot.mesh.position.x, y: slot.mesh.position.y + 0.4, z: slot.mesh.position.z };
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
    const hpPercent = slot.hp / slot.maxHp;

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

    // Deactivate the slot (returns it to the pool)
    _deactivateSlime(slot);

    // ── EXP star drop: exactly 1 star per kill, physics from hit force/weapon ──
    // Tier scales with hit force: high-force kills drop rarer (more valuable) stars.
    let gemEnemyType = ENEMY_TYPES ? ENEMY_TYPES.BALANCED : DEFAULT_ENEMY_TYPE;
    if (hitForce > 2.0)      gemEnemyType = 5; // rare (gold)
    else if (hitForce > 1.5) gemEnemyType = 3; // uncommon (blue)
    // Use the pre-allocated pool — no new THREE.Mesh during gameplay
    const _droppedGem = _acquireExpGem(x, z, 'gun', hitForce, gemEnemyType);
    if (_droppedGem) expGems.push(_droppedGem);

    createFloatingText('SLIME DEFEATED!', new THREE.Vector3(x, 1.8, z), '#AAFFAA');

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

    const _bPos1 = { x: slot.mesh.position.x, y: slot.mesh.position.y + 0.4, z: slot.mesh.position.z };
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
    createFloatingText('WOUNDED!', new THREE.Vector3(slot.mesh.position.x, 1.6, slot.mesh.position.z), '#FF8800');
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

    const _bPos2 = { x: slot.mesh.position.x, y: slot.mesh.position.y + 0.4, z: slot.mesh.position.z };
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
    createFloatingText('HEAVY DAMAGE!', new THREE.Vector3(slot.mesh.position.x, 1.7, slot.mesh.position.z), '#FF4400');
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

    const _bPos3 = { x: slot.mesh.position.x, y: slot.mesh.position.y + 0.4, z: slot.mesh.position.z };
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
    createFloatingText('CRITICAL!', new THREE.Vector3(slot.mesh.position.x, 1.8, slot.mesh.position.z), '#FF0000');
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

    const _bPos4 = { x: slot.mesh.position.x, y: slot.mesh.position.y + 0.4, z: slot.mesh.position.z };
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
    createFloatingText('NEAR DEATH!', new THREE.Vector3(slot.mesh.position.x, 1.9, slot.mesh.position.z), '#DD0000');
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

      // Wobble animation — more pronounced (0.12 amplitude) for slimy jelly feel
      s.wobbleTime += dt * 3.5;
      const wobble   = Math.sin(s.wobbleTime) * 0.12;
      const wobbleY  = Math.sin(s.wobbleTime * 2.0) * 0.06; // secondary vertical bob

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

      // Combined scale: wobble + squish + lunge + damage stage shrink
      const damageScale = s.damageStage >= 4 ? 0.85 : (s.damageStage >= 3 ? 0.92 : 1.0);
      s.mesh.scale.set(
        damageScale * squishX * lungeScaleX * (1 + wobble),
        damageScale * squishY * lungeScaleY * (1 - wobbleY),
        damageScale * squishZ * lungeScaleZ * (1 + wobble)
      );

      // Knockback physics — gentle decay to prevent stutter
      if (Math.abs(s.knockbackVx) > 0.005 || Math.abs(s.knockbackVz) > 0.005) {
        s.mesh.position.x += s.knockbackVx * dt * 4;
        s.mesh.position.z += s.knockbackVz * dt * 4;
        s.knockbackVx *= Math.pow(0.05, dt);
        s.knockbackVz *= Math.pow(0.05, dt);
      }

      // Move toward player
      const sx = s.mesh.position.x, sz = s.mesh.position.z;
      const ddx = px - sx, ddz = pz - sz;
      const dist = Math.sqrt(ddx * ddx + ddz * ddz);

      if (lungeMoveX !== 0 || lungeMoveZ !== 0) {
        // Apply lunge movement
        s.mesh.position.x = _clamp(s.mesh.position.x + lungeMoveX, -ARENA_RADIUS, ARENA_RADIUS);
        s.mesh.position.z = _clamp(s.mesh.position.z + lungeMoveZ, -ARENA_RADIUS, ARENA_RADIUS);
      } else if (dist > 1.2 && Math.abs(s.knockbackVx) < 0.05 && Math.abs(s.knockbackVz) < 0.05) {
        s.mesh.position.x += (ddx / dist) * SLIME_SPEED * dt;
        s.mesh.position.z += (ddz / dist) * SLIME_SPEED * dt;
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
            playerStats.hp = Math.max(0, playerStats.hp - 8);
            if (playerStats.hp <= 0) showYouDiedBanner();
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
        if (distToPlayer < PICKUP_RANGE * (playerStats.pickupRange || 1.0)) {
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
    const gemPos  = gem.mesh ? gem.mesh.position.clone() : new THREE.Vector3();

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

    createFloatingText('+' + expGain + ' EXP', gemPos, '#5DADE2');

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
    createFloatingText('LEVEL UP!', player ? player.mesh.position : new THREE.Vector3(), '#FFD700');
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

  // ─── Manual aim only — no auto-aim lock ─────────────────────────────────────
  let _gunCooldown = 0;

  function _tryFire(dt) {
    if (!player) return;
    _gunCooldown -= dt * 1000;
    if (_gunCooldown > 0) return;
    const cooldown = weapons && weapons.gun ? weapons.gun.cooldown : 1000;
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

    _fireProjectile(px, pz, tx, tz);

    // Rotate player mesh to face the aim target
    player.mesh.rotation.y = Math.atan2(tx - px, tz - pz);
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
    // Renderer - expose as window global for gem-classes.js and other systems
    window.renderer = renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
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
  }

  // ─── Settings modal + UI Calibration entry (sandbox) ─────────────────────────
  function _initSandboxSettings() {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('settings-close-btn');
    const uiCalBtn = document.getElementById('ui-calibration-btn');

    if (!settingsBtn || !settingsModal || !closeBtn || !uiCalBtn) return;

    settingsBtn.style.display = 'block';
    settingsBtn.addEventListener('click', () => {
      settingsModal.style.display = 'flex';
    });

    closeBtn.addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });

    uiCalBtn.addEventListener('click', () => {
      settingsModal.style.display = 'none';
      if (window.UICalibration && typeof window.UICalibration.enter === 'function') {
        // Pause while editing layout, resume afterwards
        if (typeof setGamePaused === 'function') setGamePaused(true);
        window.UICalibration.enter(() => {
          if (typeof setGamePaused === 'function') setGamePaused(false);
        });
      } else {
        console.warn('[SandboxLoop] UI Calibration unavailable — script missing?');
      }
    });

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

  // ─── Player init & spawn intro ───────────────────────────────────────────────
  let _spawnIntroTimer = 0;          // seconds into spawn animation
  const SPAWN_INTRO_DURATION = 1.8;  // seconds to rise from ground
  let _spawnIntroActive = false;

  function _initPlayer() {
    // Set up playerStats from game's built-in function
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

    // Set up weapons
    if (typeof getDefaultWeapons === 'function') {
      weapons = getDefaultWeapons();
    }

    // Create player using the existing Player class
    if (typeof Player === 'function') {
      player = new Player();
      // Start below ground for spawn intro (center hole is at y=0, radius 3)
      player.mesh.position.set(0, -1.5, 0);
    } else {
      // Ultra-minimal fallback player
      const geo = new THREE.SphereGeometry(0.5, 12, 12);
      const mat = new THREE.MeshPhongMaterial({ color: 0x3A9FD8, emissive: 0x0A3D5C, emissiveIntensity: 0.35 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, -1.5, 0);
      mesh.castShadow = true;
      scene.add(mesh);
      player = { mesh, invulnerable: false };
    }

    // Mark player invulnerable during intro
    player.invulnerable = true;
    _spawnIntroActive = true;
    _spawnIntroTimer = 0;
  }

  /** Animate the spawn intro: player rises from center hole over SPAWN_INTRO_DURATION seconds. */
  function _updateSpawnIntro(dt) {
    if (!_spawnIntroActive || !player || !player.mesh) return;
    _spawnIntroTimer += dt;
    const t = Math.min(1, _spawnIntroTimer / SPAWN_INTRO_DURATION);
    // Smooth ease-out rise from y=-1.5 to y=0.5
    const easedT = 1 - Math.pow(1 - t, 3);
    player.mesh.position.y = -1.5 + easedT * 2.0;

    // Brief scale-up pop on arrival
    if (t >= 1) {
      player.mesh.position.y = 0.5;
      _spawnIntroActive = false;
      player.invulnerable = false;
      createFloatingText('READY!', new THREE.Vector3(0, 2, 0), '#FFD700');
    }
  }

  // ─── Player movement ──────────────────────────────────────────────────────────
  function _movePlayer(dt) {
    if (!player || !player.mesh) return;
    const dir   = _getMoveDir();
    const speed = (playerStats ? playerStats.walkSpeed : 25) * MOVEMENT_TIME_SCALE;

    if (dir.dx !== 0 || dir.dz !== 0) {
      player.mesh.position.x = _clamp(player.mesh.position.x + dir.dx * speed, -ARENA_RADIUS, ARENA_RADIUS);
      player.mesh.position.z = _clamp(player.mesh.position.z + dir.dz * speed, -ARENA_RADIUS, ARENA_RADIUS);
      // Gentle lean in movement direction
      player.mesh.rotation.z = _lerp(player.mesh.rotation.z, -dir.dx * 0.18, 0.12);
      player.mesh.rotation.x = _lerp(player.mesh.rotation.x, -dir.dz * 0.12, 0.12);
    } else {
      player.mesh.rotation.z = _lerp(player.mesh.rotation.z, 0, 0.08);
      player.mesh.rotation.x = _lerp(player.mesh.rotation.x, 0, 0.08);
    }

    // Camera follow — reuse _camTarget to avoid per-frame Vector3 allocation
    if (camera) {
      _camTarget.set(player.mesh.position.x, 18, player.mesh.position.z + 12);
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

  // ─── Main animation loop ──────────────────────────────────────────────────────
  function _animate(nowMs) {
    _rafId = requestAnimationFrame(_animate);

    try {
      const dt = Math.min((nowMs - _lastTime) / 1000, 0.05); // cap at 50 ms
      _lastTime = nowMs;

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
      _updateSlime(dt);
      _tryFire(dt);
      _updateProjectiles(dt);
      _updateGems(dt);

      // Survivor-style wave spawn timer: always count down and fire a wave
      _spawnTimer -= dt;
      if (_spawnTimer <= 0) {
        _spawnTimer = _spawnInterval;
        _spawnWave();
      }

      // Escalation: increase wave size and max cap every ESCALATION_INTERVAL seconds
      _escalationTimer -= dt;
      if (_escalationTimer <= 0) {
        _escalationTimer = ESCALATION_INTERVAL;
        _waveSize     = Math.min(_waveSize + 2, 20);          // grow wave by 2 each escalation
        _maxActive    = Math.min(_maxActive + 5, MAX_SLIMES);  // raise cap by 5
        _spawnInterval = Math.max(1.5, _spawnInterval * 0.85); // shorten interval (min 1.5s)
        console.log('[SandboxLoop] Escalation! waveSize=' + _waveSize + ' maxActive=' + _maxActive + ' interval=' + _spawnInterval.toFixed(2) + 's');
      }

      // Player class built-in update (handles dash, invulnerability ticks, etc.)
      if (player && typeof player.update === 'function') {
        player.update(dt, _activeSlimes, _activeProjList, expGems);
      }

      // Blood system tick
      if (window.BloodSystem && typeof BloodSystem.update === 'function') {
        BloodSystem.update();
      }

      // Rage combat system tick
      if (window.GameRageCombat && typeof GameRageCombat.update === 'function') {
        GameRageCombat.update(dt);
      }

      // Damage numbers
      if (window.DopamineSystem && window.DopamineSystem.DamageNumbers) {
        window.DopamineSystem.DamageNumbers.update(dt);
      }

      _refreshHUD(dt);

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
