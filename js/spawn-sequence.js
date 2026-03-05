// --- FOUNTAIN LIGHTNING SPAWN SEQUENCE ---
// Replaces the old "circle portal" spawn effect with an epic fountain/lightning sequence:
//  1. Lightning bolt strikes from the sky down to the water statue/rondell.
//  2. The strike causes the fountain to spray water droplets high into the air.
//  3. The droplets fall back to the ground near the player spawn point.
//  4. They accumulate into a puddle that morphs and grows into the player character.
// Exposes window.SpawnSequence for use by main.js

(function () {
  'use strict';

  // ─── Config ──────────────────────────────────────────────────────────────────
  const FOUNTAIN_POS  = { x: 0, y: 0, z: 0 };   // Centre of the fountain/rondell
  const PLAYER_SPAWN  = { x: 12, y: 0, z: 0 };  // Where the player materialises
  const LIGHTNING_TOP = 40;   // Sky height (world units) for the lightning origin
  const WATER_COLOR1  = 0x5DADE2;  // Mid blue
  const WATER_COLOR2  = 0xADD8E6;  // Light blue
  const WATER_WHITE   = 0xFFFFFF;

  // ─── State ───────────────────────────────────────────────────────────────────
  let _scene       = null;
  let _playerMesh  = null;
  let _lightning   = [];   // transient lightning bolt meshes
  let _waterParts  = [];   // flying water drop meshes
  let _puddle      = null; // ground puddle mesh
  let _active      = false;

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function _hexToRgb01(hex) {
    return [((hex >> 16) & 0xFF) / 255, ((hex >> 8) & 0xFF) / 255, (hex & 0xFF) / 255];
  }

  // Create a thin vertical box representing a lightning segment
  function _makeLightningBolt(x, yBottom, yTop, z) {
    const height = yTop - yBottom;
    const geo    = new THREE.BoxGeometry(0.12, height, 0.12);
    const mat    = new THREE.MeshBasicMaterial({
      color: 0xFFFF99,
      transparent: true,
      opacity: 0.95
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, yBottom + height / 2, z);
    return mesh;
  }

  // Emit a batch of water particles flying upward from the fountain position
  function _spawnWaterDroplets(count) {
    if (!_scene) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.18 + Math.random() * 0.28;
      const geo   = new THREE.SphereGeometry(0.04 + Math.random() * 0.06, 4, 4);
      const mat   = new THREE.MeshBasicMaterial({
        color: Math.random() < 0.4 ? WATER_WHITE : (Math.random() < 0.5 ? WATER_COLOR1 : WATER_COLOR2),
        transparent: true,
        opacity: 0.85
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        FOUNTAIN_POS.x + (Math.random() - 0.5) * 2,
        FOUNTAIN_POS.y + 0.5,
        FOUNTAIN_POS.z + (Math.random() - 0.5) * 2
      );
      _scene.add(mesh);

      // Target: drift toward player spawn with some spread
      const tx = PLAYER_SPAWN.x + (Math.random() - 0.5) * 3;
      const tz = PLAYER_SPAWN.z + (Math.random() - 0.5) * 3;

      _waterParts.push({
        mesh,
        // Initial upward velocity
        vx: Math.cos(angle) * speed * 0.3 + (tx - FOUNTAIN_POS.x) * 0.012,
        vy: speed,
        vz: Math.sin(angle) * speed * 0.3 + (tz - FOUNTAIN_POS.z) * 0.012,
        tx, tz,
        life: 1.0,
        grounded: false
      });
    }
  }

  // Build a circular puddle at the player spawn point
  function _buildPuddle() {
    if (!_scene) return;
    const geo = new THREE.CircleGeometry(0.01, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: WATER_COLOR1,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false  // prevents z-fighting with the ground mesh on mobile GPUs
    });
    _puddle = new THREE.Mesh(geo, mat);
    _puddle.rotation.x = -Math.PI / 2;
    _puddle.position.set(PLAYER_SPAWN.x, 0.05, PLAYER_SPAWN.z); // raised from 0.03 → 0.05 to avoid z-fighting
    _scene.add(_puddle);
  }

  // Remove all transient objects from the scene
  function _cleanup() {
    _lightning.forEach(m => {
      _scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    _lightning = [];

    _waterParts.forEach(p => {
      _scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    });
    _waterParts = [];

    if (_puddle) {
      _scene.remove(_puddle);
      _puddle.geometry.dispose();
      _puddle.material.dispose();
      _puddle = null;
    }
  }

  // ─── Phases ──────────────────────────────────────────────────────────────────
  // Each phase is triggered by a setTimeout so main.js's animate loop just
  // calls SpawnSequence.update() every frame to handle particle physics.

  let _phase     = 0;   // 0=idle 1=lightning 2=spray 3=accumulate 4=morph 5=done
  let _phaseTime = 0;   // ms since phase started
  let _lastTick  = 0;

  function _startPhase(p) {
    _phase     = p;
    _phaseTime = 0;
    _lastTick  = performance.now();
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Call once during init (after the scene and player have been created).
   * @param {THREE.Scene} threeScene
   */
  function init(threeScene) {
    _scene = threeScene;
  }

  /**
   * Begin the spawn sequence. Called from startCountdown() in main.js.
   * @param {THREE.Mesh} playerMesh  – the player's root mesh
   */
  function play(playerMesh) {
    if (!_scene || _active) return;
    _active     = true;
    _playerMesh = playerMesh;

    // Hide the player until the morph phase
    if (_playerMesh) {
      _playerMesh.scale.set(0.01, 0.01, 0.01);
      _playerMesh.visible = true;
    }

    // Phase 1 – Lightning strike
    _startPhase(1);

    // Build two overlapping lightning bolt segments from sky to ground
    const bolt1 = _makeLightningBolt(FOUNTAIN_POS.x,        0, LIGHTNING_TOP,     FOUNTAIN_POS.z);
    const bolt2 = _makeLightningBolt(FOUNTAIN_POS.x + 0.08, 0, LIGHTNING_TOP * 0.6, FOUNTAIN_POS.z + 0.05);
    _scene.add(bolt1);
    _scene.add(bolt2);
    _lightning.push(bolt1, bolt2);

    // Flash: dim the lightning after 80 ms
    setTimeout(() => {
      _lightning.forEach(m => { m.material.opacity = 0.5; });
    }, 80);

    // Remove lightning bolts after 220 ms, start water spray
    setTimeout(() => {
      _lightning.forEach(m => {
        _scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      });
      _lightning = [];

      // Phase 2 – Water spray
      _startPhase(2);
      _spawnWaterDroplets(80);

      // Build puddle for accumulation
      setTimeout(_buildPuddle, 400);

      // Phase 3 – Accumulate drops into puddle
      setTimeout(() => _startPhase(3), 700);

      // Phase 4 – Morph puddle into player
      setTimeout(() => _startPhase(4), 1400);

      // Phase 5 – Done (sequence complete)
      setTimeout(() => {
        _startPhase(5);
        _cleanup();
        _active = false;
      }, 2200);
    }, 220);
  }

  /**
   * Call every frame from the main animation loop.
   * Handles water particle physics and player morph animation.
   * @param {number} dt – delta time in seconds
   */
  function update(dt) {
    if (!_active && _phase === 0) return;

    const GRAVITY = -0.022;

    // ── Water particle physics ─────────────────────────────────────────────
    for (let i = _waterParts.length - 1; i >= 0; i--) {
      const p = _waterParts[i];

      if (!p.grounded) {
        p.vy += GRAVITY;
        p.mesh.position.x += p.vx;
        p.mesh.position.y += p.vy;
        p.mesh.position.z += p.vz;

        // Ground collision
        if (p.mesh.position.y <= 0.02) {
          p.mesh.position.y = 0.02;
          p.grounded = true;
          // Flatten on ground
          p.mesh.scale.set(1.5, 0.25, 1.5);
        }
      }

      // Fade out grounded drops quickly (they "join" the puddle)
      if (p.grounded) {
        p.life -= dt * 1.8;
        p.mesh.material.opacity = Math.max(0, p.life * 0.85);
        if (p.life <= 0) {
          _scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
          _waterParts.splice(i, 1);
        }
      }
    }

    // ── Phase 3: Grow puddle as drops accumulate ──────────────────────────
    if (_phase === 3 && _puddle) {
      const s = Math.min(_puddle.scale.x + dt * 2.5, 1.8);
      _puddle.scale.set(s, s, s);
    }

    // ── Phase 4: Morph player out of puddle ───────────────────────────────
    if (_phase === 4) {
      // Shrink puddle
      if (_puddle) {
        const ps = Math.max(_puddle.scale.x - dt * 2.2, 0);
        _puddle.scale.set(ps, ps, ps);
        _puddle.material.opacity = Math.max(0, ps / 1.8);
      }

      // Grow player from tiny → full size with a slight bounce
      if (_playerMesh) {
        const current = _playerMesh.scale.x;
        if (current < 1.0) {
          const next = Math.min(current + dt * 1.8, 1.1); // overshoot for bounce feel
          _playerMesh.scale.set(next, next, next);
        } else if (_playerMesh.scale.x > 1.0) {
          // Settle back to 1
          const next = Math.max(_playerMesh.scale.x - dt * 0.6, 1.0);
          _playerMesh.scale.set(next, next, next);
        }
      }
    }

    // ── Phase 5: Ensure player is at proper scale ─────────────────────────
    if (_phase === 5 && _playerMesh) {
      _playerMesh.scale.set(1, 1, 1);
    }
  }

  /**
   * Reset the sequence state (call on game reset for new run).
   */
  function reset() {
    if (_scene) _cleanup();
    _phase      = 0;
    _phaseTime  = 0;
    _active     = false;
    _playerMesh = null;
  }

  // ─── Expose ──────────────────────────────────────────────────────────────────
  window.SpawnSequence = { init, play, update, reset };

})();
