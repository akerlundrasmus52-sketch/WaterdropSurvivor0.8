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
  if (typeof forceGameUnpause === 'undefined') {
    window.forceGameUnpause = function () { window.isPaused = false; };
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

  // ─── Module state ────────────────────────────────────────────────────────────
  let _ready    = false;
  let _lastTime = 0;
  let _rafId    = null;
  // Enemy pool (replaces single _slime)
  let _enemyPool    = [];          // pre-allocated pool of MAX_SLIMES slime objects
  let _activeSlimes = [];          // live list of currently active pool slots (fast iteration)
  let _maxActive    = 1;           // current max simultaneous active slimes
  let _spawnTimer   = 2.0;         // seconds until next spawn attempt
  let _spawnInterval = 3.0;        // seconds between spawn attempts
  let _escalationTimer = ESCALATION_INTERVAL; // seconds until next difficulty escalation
  let _allFleshChunks = [];        // global flying flesh chunk list (from all pool slots)
  let _projPool = [];              // reusable projectile objects
  let _activeProjList = [];        // currently flying projectiles
  let _animateErrorShown = false;  // prevent spamming error display every frame

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
      const mat = new THREE.MeshPhongMaterial({
        color: 0x55EE44,
        emissive: 0x113300,
        emissiveIntensity: 0.2,
        shininess: 80,
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

      _enemyPool.push({
        mesh,
        hpFill,
        hpFillGeo,
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
        wounds: [],
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
    slot.wounds = [];
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
    // Clean up wound meshes
    for (let i = 0; i < slot.wounds.length; i++) {
      slot.mesh.remove(slot.wounds[i]);
      slot.wounds[i].geometry.dispose();
      slot.wounds[i].material.dispose();
    }
    slot.wounds = [];
    // Reset material for reuse
    slot.mesh.material.color.setHex(0x55EE44);
    slot.mesh.material.opacity = 0.92;
    slot.mesh.material.emissiveIntensity = 0.2;
    slot.mesh.scale.set(1, 1, 1);
    // Remove from active list
    const idx = _activeSlimes.indexOf(slot);
    if (idx !== -1) _activeSlimes.splice(idx, 1);
  }

  function _spawnSlime() {
    if (!player || !player.mesh) return;
    if (_activeSlimes.length >= _maxActive) return;
    // Find first inactive slot
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

    // Apply knockback force
    const knockbackStrength = 0.15 * hitForce;
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

    // Blood splatter on hit — use BloodSystem.emitBurst (the real API)
    if (window.BloodSystem && typeof BloodSystem.emitBurst === 'function') {
      BloodSystem.emitBurst(
        { x: slot.mesh.position.x, y: slot.mesh.position.y + 0.5, z: slot.mesh.position.z },
        12,
        { spreadXZ: 1.2, spreadY: 0.4 }
      );
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
    const z = slot.mesh.position.z;

    // ── DEATH EXPLOSION WITH MASSIVE GORE ─────────────────────────────────────
    if (window.BloodSystem && typeof BloodSystem.emitBurst === 'function') {
      BloodSystem.emitBurst(
        { x: x, y: 0.5, z: z },
        60,
        { spreadXZ: 3.0, spreadY: 1.2 }
      );
      if (typeof BloodSystem.emitGuts === 'function') {
        BloodSystem.emitGuts({ x: x, y: 0.5, z: z }, 25);
      }
    }

    // Spawn 8-12 large flesh chunks flying in all directions
    _spawnFleshChunks(slot, 8 + Math.floor(Math.random() * 5), true);

    // Deactivate the slot (returns it to the pool)
    _deactivateSlime(slot);

    // ── Dynamic EXP gem drop ────────────────────────────────────────────────
    const baseGemCount = 2 + Math.floor(Math.random() * 3);
    const bonusGems    = Math.random() < 0.25 ? 1 + Math.floor(Math.random() * 2) : 0;
    const critBonus    = hitForce > 1.5 ? 1 : 0;
    const totalGemCount = baseGemCount + bonusGems + critBonus;

    for (let i = 0; i < totalGemCount; i++) {
      let gemEnemyType = ENEMY_TYPES ? ENEMY_TYPES.BALANCED : DEFAULT_ENEMY_TYPE;
      const tierRoll = Math.random();
      if (tierRoll > 0.9)      gemEnemyType = 5;
      else if (tierRoll > 0.7) gemEnemyType = 3;
      expGems.push(new ExpGem(x, z, 'gun', hitForce, gemEnemyType));
    }

    const gemText = totalGemCount > 1 ? 'SLIME DEFEATED! +' + totalGemCount + ' GEMS' : 'SLIME DEFEATED!';
    createFloatingText(gemText, new THREE.Vector3(x, 1.8, z), '#AAFFAA');

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
  // Stage 1: 75% HP - Darken appearance, add first wounds
  function _applyDamageStage1(slot) {
    slot.mesh.material.color.setHex(0x44CC33);
    slot.mesh.material.emissiveIntensity = 0.15;

    for (let i = 0; i < 2; i++) {
      const woundGeo = new THREE.SphereGeometry(0.12, 6, 6);
      const woundMat = new THREE.MeshBasicMaterial({ color: 0x660000 });
      const wound = new THREE.Mesh(woundGeo, woundMat);
      const angle = Math.random() * Math.PI * 2;
      const height = -0.2 + Math.random() * 0.6;
      wound.position.set(Math.cos(angle) * 0.5, height, Math.sin(angle) * 0.5);
      slot.mesh.add(wound);
      slot.wounds.push(wound);
    }

    if (window.BloodSystem && typeof BloodSystem.emitBurst === 'function') {
      BloodSystem.emitBurst(
        { x: slot.mesh.position.x, y: slot.mesh.position.y + 0.4, z: slot.mesh.position.z },
        8, { spreadXZ: 0.8, spreadY: 0.3 }
      );
    }
    createFloatingText('WOUNDED!', new THREE.Vector3(slot.mesh.position.x, 1.6, slot.mesh.position.z), '#FF8800');
  }

  // Stage 2: 50% HP - More wounds, flesh chunks start flying
  function _applyDamageStage2(slot) {
    slot.mesh.material.color.setHex(0x33AA22);

    for (let i = 0; i < 2; i++) {
      const woundGeo = new THREE.SphereGeometry(0.15, 6, 6);
      const woundMat = new THREE.MeshBasicMaterial({ color: 0x550000 });
      const wound = new THREE.Mesh(woundGeo, woundMat);
      const angle = Math.random() * Math.PI * 2;
      const height = -0.2 + Math.random() * 0.6;
      wound.position.set(Math.cos(angle) * 0.5, height, Math.sin(angle) * 0.5);
      slot.mesh.add(wound);
      slot.wounds.push(wound);
    }

    _spawnFleshChunks(slot, 2 + Math.floor(Math.random() * 2));

    if (window.BloodSystem && typeof BloodSystem.emitBurst === 'function') {
      BloodSystem.emitBurst(
        { x: slot.mesh.position.x, y: slot.mesh.position.y + 0.5, z: slot.mesh.position.z },
        18, { spreadXZ: 1.5, spreadY: 0.6 }
      );
      if (typeof BloodSystem.emitGuts === 'function') {
        BloodSystem.emitGuts({ x: slot.mesh.position.x, y: slot.mesh.position.y + 0.4, z: slot.mesh.position.z }, 6);
      }
      if (typeof BloodSystem.emitPulse === 'function') {
        BloodSystem.emitPulse({ x: slot.mesh.position.x, y: slot.mesh.position.y + 0.5, z: slot.mesh.position.z }, 3, 300);
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
      const woundGeo = new THREE.SphereGeometry(0.18, 6, 6);
      const woundMat = new THREE.MeshBasicMaterial({ color: 0x440000 });
      const wound = new THREE.Mesh(woundGeo, woundMat);
      const angle = Math.random() * Math.PI * 2;
      const height = -0.2 + Math.random() * 0.6;
      wound.position.set(Math.cos(angle) * 0.45, height, Math.sin(angle) * 0.45);
      slot.mesh.add(wound);
      slot.wounds.push(wound);
    }

    _spawnFleshChunks(slot, 3 + Math.floor(Math.random() * 3));

    if (window.BloodSystem && typeof BloodSystem.emitBurst === 'function') {
      BloodSystem.emitBurst(
        { x: slot.mesh.position.x, y: slot.mesh.position.y + 0.5, z: slot.mesh.position.z },
        30, { spreadXZ: 2.0, spreadY: 0.8 }
      );
      if (typeof BloodSystem.emitGuts === 'function') {
        BloodSystem.emitGuts({ x: slot.mesh.position.x, y: slot.mesh.position.y + 0.4, z: slot.mesh.position.z }, 12);
      }
      if (typeof BloodSystem.emitPulse === 'function') {
        BloodSystem.emitPulse({ x: slot.mesh.position.x, y: slot.mesh.position.y + 0.5, z: slot.mesh.position.z }, 5, 400);
      }
      if (typeof BloodSystem.emitExitWound === 'function') {
        const a = Math.random() * Math.PI * 2;
        BloodSystem.emitExitWound(
          { x: slot.mesh.position.x, y: slot.mesh.position.y + 0.4, z: slot.mesh.position.z },
          { x: Math.cos(a) * 0.3, y: 0.1, z: Math.sin(a) * 0.3 }
        );
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
      const woundGeo = new THREE.SphereGeometry(0.22, 6, 6);
      const woundMat = new THREE.MeshBasicMaterial({ color: 0x330000 });
      const wound = new THREE.Mesh(woundGeo, woundMat);
      const angle = Math.random() * Math.PI * 2;
      const height = -0.2 + Math.random() * 0.6;
      wound.position.set(Math.cos(angle) * 0.4, height, Math.sin(angle) * 0.4);
      slot.mesh.add(wound);
      slot.wounds.push(wound);
    }

    _spawnFleshChunks(slot, 4 + Math.floor(Math.random() * 3), true);

    if (window.BloodSystem && typeof BloodSystem.emitBurst === 'function') {
      BloodSystem.emitBurst(
        { x: slot.mesh.position.x, y: slot.mesh.position.y + 0.5, z: slot.mesh.position.z },
        45, { spreadXZ: 2.5, spreadY: 1.0 }
      );
      if (typeof BloodSystem.emitGuts === 'function') {
        BloodSystem.emitGuts({ x: slot.mesh.position.x, y: slot.mesh.position.y + 0.4, z: slot.mesh.position.z }, 18);
      }
      if (typeof BloodSystem.emitPulse === 'function') {
        BloodSystem.emitPulse({ x: slot.mesh.position.x, y: slot.mesh.position.y + 0.5, z: slot.mesh.position.z }, 6, 500);
      }
      if (typeof BloodSystem.emitExitWound === 'function') {
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          BloodSystem.emitExitWound(
            { x: slot.mesh.position.x, y: slot.mesh.position.y + 0.4, z: slot.mesh.position.z },
            { x: Math.cos(a) * 0.4, y: 0.15, z: Math.sin(a) * 0.4 }
          );
        }
      }
    }
    createFloatingText('NEAR DEATH!', new THREE.Vector3(slot.mesh.position.x, 1.9, slot.mesh.position.z), '#DD0000');
  }

  // Spawn flying flesh chunks with physics (global _allFleshChunks list)
  function _spawnFleshChunks(slot, count, large) {
    const pos = slot.mesh.position;

    for (let i = 0; i < count; i++) {
      const size = large ? (0.15 + Math.random() * 0.15) : (0.08 + Math.random() * 0.12);
      const geo = new THREE.BoxGeometry(size, size * 0.8, size * 1.2);
      const colors = [0x33AA22, 0x228811, 0x116600, 0x55CC33];
      const mat = new THREE.MeshPhongMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        shininess: 20
      });
      const mesh = new THREE.Mesh(geo, mat);

      const angle = Math.random() * Math.PI * 2;
      mesh.position.set(
        pos.x + Math.cos(angle) * 0.3,
        pos.y + 0.3 + Math.random() * 0.3,
        pos.z + Math.sin(angle) * 0.3
      );
      mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      scene.add(mesh);

      _allFleshChunks.push({
        mesh,
        vx: (Math.random() - 0.5) * 0.12,
        vy: 0.08 + Math.random() * 0.12,
        vz: (Math.random() - 0.5) * 0.12,
        rotSpeedX: (Math.random() - 0.5) * 0.3,
        rotSpeedY: (Math.random() - 0.5) * 0.3,
        rotSpeedZ: (Math.random() - 0.5) * 0.3,
        life: 2.0 + Math.random() * 1.0,
        onGround: false
      });
    }
  }

  // Update all flying flesh chunks from the global list
  function _updateFleshChunks(dt) {
    for (let i = _allFleshChunks.length - 1; i >= 0; i--) {
      const chunk = _allFleshChunks[i];

      chunk.life -= dt;
      if (chunk.life <= 0) {
        scene.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        chunk.mesh.material.dispose();
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

      // Wobble animation
      s.wobbleTime += dt * 3.5;
      const wobble = Math.sin(s.wobbleTime) * 0.05;

      // Squish animation on hit
      let squishX = 1.0, squishY = 1.0, squishZ = 1.0;
      if (s.squishTime > 0) {
        s.squishTime -= dt;
        const squishProgress = 1 - (s.squishTime / 0.3);
        const squishAmount = Math.sin(squishProgress * Math.PI) * 0.3;
        squishX = 1 + squishAmount;
        squishZ = 1 + squishAmount;
        squishY = 1 - squishAmount * 0.5;
      }

      // Combined scale: wobble + squish + damage stage shrink
      const damageScale = s.damageStage >= 4 ? 0.85 : (s.damageStage >= 3 ? 0.92 : 1.0);
      s.mesh.scale.set(
        damageScale * squishX * (1 + wobble),
        damageScale * squishY * (1 - wobble * 0.5),
        damageScale * squishZ * (1 + wobble)
      );

      // Knockback physics
      if (Math.abs(s.knockbackVx) > 0.01 || Math.abs(s.knockbackVz) > 0.01) {
        s.mesh.position.x += s.knockbackVx * dt * 10;
        s.mesh.position.z += s.knockbackVz * dt * 10;
        s.knockbackVx *= Math.pow(0.01, dt);
        s.knockbackVz *= Math.pow(0.01, dt);
      }

      // Move toward player
      const sx = s.mesh.position.x, sz = s.mesh.position.z;
      const ddx = px - sx, ddz = pz - sz;
      const dist = Math.sqrt(ddx * ddx + ddz * ddz);

      if (dist > 1.2 && Math.abs(s.knockbackVx) < 0.05 && Math.abs(s.knockbackVz) < 0.05) {
        s.mesh.position.x += (ddx / dist) * SLIME_SPEED * dt;
        s.mesh.position.z += (ddz / dist) * SLIME_SPEED * dt;
        s.mesh.rotation.y = Math.atan2(ddx, ddz);
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
      setGamePaused(true);
      showUpgradeModal(false, null);
    }
  }

  // ─── Auto-aim & auto-fire ─────────────────────────────────────────────────────
  let _gunCooldown = 0;

  function _tryFire(dt) {
    const target = _getClosestActiveSlime();
    if (!player || !target) return;
    _gunCooldown -= dt * 1000;
    if (_gunCooldown > 0) return;
    const cooldown = weapons && weapons.gun ? weapons.gun.cooldown : 1000;
    _gunCooldown = cooldown;

    const px = player.mesh.position.x, pz = player.mesh.position.z;
    // Default to closest slime position; override with joystick/mouse
    let tx = target.mesh.position.x, tz = target.mesh.position.z;

    if (_aimJoy.active && (_aimJoy.dx !== 0 || _aimJoy.dz !== 0)) {
      tx = px + _aimJoy.dx * 10;
      tz = pz + _aimJoy.dz * 10;
    } else if (window.gameSettings && window.gameSettings.controlType === 'keyboard' && _mouse) {
      tx = _mouse.worldX;
      tz = _mouse.worldZ;
    }

    _fireProjectile(px, pz, tx, tz);

    // Rotate player mesh to face the aim target
    player.mesh.rotation.y = Math.atan2(tx - px, tz - pz);
  }

  // ─── Input ────────────────────────────────────────────────────────────────────
  const _keysDown = {};
  function _initInput() {
    document.addEventListener('keydown', function (e) { _keysDown[e.code] = true; });
    document.addEventListener('keyup',   function (e) { _keysDown[e.code] = false; });

    // Mouse: project onto ground plane (y=0)
    document.addEventListener('mousemove', function (e) {
      if (!camera || !renderer) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const nx   = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny   = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      const ray  = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const pt    = new THREE.Vector3();
      ray.ray.intersectPlane(plane, pt);
      if (pt) { _mouse.worldX = pt.x; _mouse.worldZ = pt.z; }
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

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(20, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near    = 1;
    sun.shadow.camera.far     = 200;
    sun.shadow.camera.left    = -60;
    sun.shadow.camera.right   =  60;
    sun.shadow.camera.top     =  60;
    sun.shadow.camera.bottom  = -60;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8888ff, 0.4);
    fill.position.set(-10, 20, -10);
    scene.add(fill);

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

  // ─── Player init ──────────────────────────────────────────────────────────────
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
      player.mesh.position.set(0, 0.5, 0);
    } else {
      // Ultra-minimal fallback player
      const geo = new THREE.SphereGeometry(0.5, 12, 12);
      const mat = new THREE.MeshPhongMaterial({ color: 0x3A9FD8, emissive: 0x0A3D5C, emissiveIntensity: 0.35 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0.5, 0);
      mesh.castShadow = true;
      scene.add(mesh);
      player = { mesh, invulnerable: false };
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

    // Camera follow
    if (camera) {
      const target = new THREE.Vector3(player.mesh.position.x, 18, player.mesh.position.z + 12);
      camera.position.lerp(target, 0.06);
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
    el.innerHTML = '⚙️ ENGINE 2.0 SANDBOX &nbsp;|&nbsp; WASD/Joystick to move &nbsp;|&nbsp; Auto-aim Gun unlocked &nbsp;|&nbsp; ' + poolBadge;
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
      _updateSlime(dt);
      _tryFire(dt);
      _updateProjectiles(dt);
      _updateGems(dt);

      // Progressive spawn timer (only attempt when below max)
      if (_activeSlimes.length < _maxActive) {
        _spawnTimer -= dt;
        if (_spawnTimer <= 0) {
          _spawnTimer = _spawnInterval;
          _spawnSlime();
        }
      } else {
        _spawnTimer = _spawnInterval; // reset so it fires immediately when a slot opens
      }

      // Escalation: increase max active slimes every ESCALATION_INTERVAL seconds
      _escalationTimer -= dt;
      if (_escalationTimer <= 0) {
        _escalationTimer = ESCALATION_INTERVAL;
        _maxActive = Math.min(_maxActive + 1, MAX_SLIMES);
        _spawnInterval = Math.max(0.8, _spawnInterval * 0.9);
        console.log('[SandboxLoop] Escalation! maxActive=' + _maxActive + ' spawnInterval=' + _spawnInterval.toFixed(2) + 's');
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
      _spawnSlime();         // Spawn first slime immediately
      _initInput();
      _buildSandboxOverlay();
      _refreshExpBar();

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
