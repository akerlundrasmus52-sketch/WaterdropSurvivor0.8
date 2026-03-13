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
    specialAttacksLoadout: ['knifeTakedown'], // Starting special attack
    specialAttackLevels: { knifeTakedown: 1 },
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
  const SLIME_RESPAWN_DELAY = 3000;          // ms
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

  // ─── Module state ────────────────────────────────────────────────────────────
  let _ready    = false;
  let _lastTime = 0;
  let _rafId    = null;
  let _slime    = null;           // { mesh, hp, maxHp, dead, respawnTimer, hpBar, hpBarBg }
  let _projPool = [];             // reusable projectile objects
  let _activeProjList = [];       // currently flying projectiles
  let _animateErrorShown = false; // prevent spamming error display every frame

  // Three.js globals (also exposed as window.scene, window.renderer, window.camera)
  let scene    = null;
  let renderer = null;
  let camera   = null;

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

      // Collision with slime
      if (_slime && !_slime.dead) {
        const sx = _slime.mesh.position.x, sz = _slime.mesh.position.z;
        const ex = p.mesh.position.x - sx;
        const ez = p.mesh.position.z - sz;
        if (ex * ex + ez * ez < 1.2) {
          _hitSlime(p);
          _releaseProjectile(p, i);
        }
      }
    }
  }

  function _releaseProjectile(p, idx) {
    p.active = false;
    p.mesh.visible = false;
    if (idx !== undefined) _activeProjList.splice(idx, 1);
  }

  // ─── Slime ───────────────────────────────────────────────────────────────────
  function _buildSlime() {
    const geo = new THREE.SphereGeometry(0.7, 12, 10);
    // Deform into a slime shape: flatten bottom, widen body
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i);
      let x = pos.getX(i);
      let z = pos.getZ(i);
      if (y < 0) { y *= 0.55; x *= 1.25; z *= 1.25; }
      else        { x *= 1.05; z *= 1.05; }
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhongMaterial({
      color: 0x55EE44,
      emissive: 0x113300,
      emissiveIntensity: 0.2,
      shininess: 60,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(6, 0.45, 0);
    scene.add(mesh);

    // Simple eye pair
    const eyeGeo = new THREE.SphereGeometry(0.1, 6, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    [-0.22, 0.22].forEach(function (ox) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(ox, 0.3, 0.6);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 5), pupilMat);
      pupil.position.set(0, 0, 0.06);
      eye.add(pupil);
      mesh.add(eye);
    });

    // HP bar (world-space sprite above head)
    const hpBgGeo = new THREE.PlaneGeometry(1.4, 0.18);
    const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x330000, side: THREE.DoubleSide, depthWrite: false });
    const hpBg    = new THREE.Mesh(hpBgGeo, hpBgMat);
    hpBg.position.set(0, 1.3, 0);

    const hpFillGeo = new THREE.PlaneGeometry(1.4, 0.18);
    const hpFillMat = new THREE.MeshBasicMaterial({ color: 0x44FF44, side: THREE.DoubleSide, depthWrite: false });
    const hpFill    = new THREE.Mesh(hpFillGeo, hpFillMat);
    hpFill.position.set(0, 0, 0.001);
    hpBg.add(hpFill);
    mesh.add(hpBg);

    _slime = {
      mesh,
      hpFill,
      hpFillGeo,
      hp: SLIME_HP,
      maxHp: SLIME_HP,
      dead: false,
      respawnTimer: 0,
      flashTimer: 0,
      // Properties expected by Player.prototype.update (auto-aim, collision checks)
      id: 'dummy-slime-0',
      type: 'slime',
      radius: 0.7,
      isBoss: false,
      get isDead() { return this.dead; },
      set isDead(value) { this.dead = value; },
    };
  }

  function _hitSlime(projectile) {
    if (!_slime || _slime.dead) return;

    // Determine hit force from weapon (gun = 1.0)
    const hitForce = 1.0 + (weapons && weapons.gun ? (weapons.gun.level - 1) * 0.15 : 0);
    const damage   = weapons && weapons.gun ? weapons.gun.damage : 15;
    const actualDmg = Math.round(damage * hitForce);

    _slime.hp -= actualDmg;
    _slime.flashTimer = 0.1;

    // Floating damage number
    createFloatingText(
      '-' + actualDmg,
      new THREE.Vector3(_slime.mesh.position.x, 1.5, _slime.mesh.position.z),
      '#FF4444'
    );

    // Blood splatter on hit — use BloodSystem.emitBurst (the real API)
    if (window.BloodSystem && typeof BloodSystem.emitBurst === 'function') {
      BloodSystem.emitBurst(
        { x: _slime.mesh.position.x, y: _slime.mesh.position.y + 0.5, z: _slime.mesh.position.z },
        12,
        { spreadXZ: 1.2, spreadY: 0.4 }
      );
    }

    if (_slime.hp <= 0) {
      _killSlime(hitForce, projectile.vx || 0, projectile.vz || 0);
    } else {
      _updateSlimeHPBar();
    }
  }

  function _killSlime(hitForce, killVX, killVZ) {
    _slime.dead = true;
    _slime.hp = 0;
    _slime.mesh.visible = false;

    const x = _slime.mesh.position.x;
    const z = _slime.mesh.position.z;

    // Blood death burst
    if (window.BloodSystem && typeof BloodSystem.emitBurst === 'function') {
      BloodSystem.emitBurst(
        { x: x, y: 0.5, z: z },
        35,
        { spreadXZ: 2.2, spreadY: 0.8 }
      );
    }

    // ── Dynamic EXP gem drop ──────────────────────────────────────────────────
    // Just drop 1 gem for testing
    const gemCount = 1;
    for (let i = 0; i < gemCount; i++) {
      // Pass hitForce and weapon name so gem-classes.js applies the dynamic
      // spin speed / fly distance logic based on how hard the enemy was killed.
      expGems.push(new ExpGem(x, z, 'gun', hitForce, ENEMY_TYPES ? ENEMY_TYPES.BALANCED : DEFAULT_ENEMY_TYPE));
    }

    createFloatingText('SLIME DEFEATED!', new THREE.Vector3(x, 1.8, z), '#AAFFAA');

    // Schedule respawn
    _slime.respawnTimer = SLIME_RESPAWN_DELAY;
    playerStats.kills++;

    // Gain rage on kill
    if (window.GameRageCombat && typeof GameRageCombat.gainRage === 'function') {
      GameRageCombat.gainRage(8); // RAGE_PER_KILL = 8
    }

    // Record kill in milestone system
    if (window.GameMilestones && typeof GameMilestones.recordKill === 'function') {
      GameMilestones.recordKill();
    }
  }

  function _respawnSlime() {
    // Respawn at a random edge position around the player, 8-12 units away
    const angle  = Math.random() * Math.PI * 2;
    const dist   = 8 + Math.random() * 4;
    const px     = player ? player.mesh.position.x : 0;
    const pz     = player ? player.mesh.position.z : 0;
    const rx     = _clamp(px + Math.cos(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);
    const rz     = _clamp(pz + Math.sin(angle) * dist, -ARENA_RADIUS, ARENA_RADIUS);

    _slime.mesh.position.set(rx, 0.45, rz);
    _slime.hp         = SLIME_HP;
    _slime.dead       = false;
    _slime.flashTimer = 0;
    _slime.mesh.visible = true;
    _slime.mesh.material.color.setHex(0x55EE44);
    _updateSlimeHPBar();
  }

  function _updateSlimeHPBar() {
    const frac = Math.max(0, _slime.hp / _slime.maxHp);
    // Scale x from full width (1.4) to 0, keeping left edge fixed
    _slime.hpFill.scale.x = Math.max(0.001, frac);
    _slime.hpFill.position.x = (frac - 1) * SLIME_HP_BAR_HALF_WIDTH; // offset to anchor left
    _slime.hpFill.material.color.setHex(
      frac > 0.5 ? 0x44FF44 : frac > 0.25 ? 0xFFAA00 : 0xFF3300
    );
  }

  function _updateSlime(dt) {
    if (!_slime) return;
    if (_slime.dead) {
      _slime.respawnTimer -= dt * 1000;
      if (_slime.respawnTimer <= 0) _respawnSlime();
      return;
    }

    // Billboard HP bar toward camera
    if (camera) _slime.mesh.children[2] && (_slime.mesh.children[2].quaternion.copy(camera.quaternion));

    // Flash on hit
    if (_slime.flashTimer > 0) {
      _slime.flashTimer -= dt;
      _slime.mesh.material.color.setHex(0xFFFFFF);
    } else {
      _slime.mesh.material.color.setHex(0x55EE44);
    }

    // Move toward player
    if (!player) return;
    const px = player.mesh.position.x, pz = player.mesh.position.z;
    const sx = _slime.mesh.position.x, sz = _slime.mesh.position.z;
    const dx = px - sx, dz = pz - sz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 1.2) {
      _slime.mesh.position.x += (dx / dist) * SLIME_SPEED * dt;
      _slime.mesh.position.z += (dz / dist) * SLIME_SPEED * dt;
      // Face movement direction
      _slime.mesh.rotation.y = Math.atan2(dx, dz);
    }

    // Deal damage to player on contact
    if (dist < 1.1 && player && !player.invulnerable) {
      if (typeof player.takeDamage === 'function') {
        player.takeDamage(8, 'slime', _slime.mesh.position);
      } else {
        playerStats.hp = Math.max(0, playerStats.hp - 8);
        if (playerStats.hp <= 0) showYouDiedBanner();
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
    if (!player || !_slime || _slime.dead) return;
    _gunCooldown -= dt * 1000;
    if (_gunCooldown > 0) return;
    const cooldown = weapons && weapons.gun ? weapons.gun.cooldown : 1000;
    _gunCooldown = cooldown;

    const px = player.mesh.position.x, pz = player.mesh.position.z;
    // Target: default to slime position, override with joystick/mouse
    let tx = _slime.mesh.position.x, tz = _slime.mesh.position.z;

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
    if (!player) return;
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

      // Player class built-in update (handles dash, invulnerability ticks, etc.)
      if (player && typeof player.update === 'function') {
        player.update(dt, _slime && !_slime.dead ? [_slime] : [], projectiles, expGems);
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

      // Init Three.js
      _initScene();
      _initGround();
      _initBloodSystem();
      _initRageCombat();
      _initPools();
      _initPlayer();
      _buildSlime();
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
