// --- ADVANCED BLOOD & PHYSICS SYSTEM ---
// Provides a THREE.Points-based blood particle system with pulsating emission,
// physics simulation, and ground staining.
// Exposes window.BloodSystem for use by main.js

(function() {
  'use strict';

  // ─── Configuration ──────────────────────────────────────────────────────────
  const MAX_BLOOD_PARTICLES = 50000;
  const GRAVITY = -0.018;
  const GROUND_Y = 0.05; // Y position for ground stains (raised to prevent z-fighting with terrain)

  // ─── Internal State ─────────────────────────────────────────────────────────
  let _scene = null;
  let _points = null;
  let _geo = null;
  let _positions = null;
  let _colors = null;
  let _sizes = null;

  // Per-particle physics state (Float32Array for cache efficiency)
  let _velX = null, _velY = null, _velZ = null;
  let _life = null;      // remaining life in frames (0 = dead/stained)
  let _grounded = null;  // Uint8Array: 1 = particle hit ground and is a stain

  let _count = 0;   // active particle count
  let _head = 0;    // ring-buffer write head

  // Shared material / geometry
  let _mat = null;

  // ─── Init ────────────────────────────────────────────────────────────────────
  function init(threeScene) {
    if (typeof THREE === 'undefined') {
      console.warn('[BloodSystem] THREE.js not yet available – init deferred');
      return;
    }
    if (_scene) return; // already initialised
    _scene = threeScene;

    _geo = new THREE.BufferGeometry();
    _positions = new Float32Array(MAX_BLOOD_PARTICLES * 3);
    _colors    = new Float32Array(MAX_BLOOD_PARTICLES * 3);
    _sizes     = new Float32Array(MAX_BLOOD_PARTICLES);

    _velX      = new Float32Array(MAX_BLOOD_PARTICLES);
    _velY      = new Float32Array(MAX_BLOOD_PARTICLES);
    _velZ      = new Float32Array(MAX_BLOOD_PARTICLES);
    _life      = new Float32Array(MAX_BLOOD_PARTICLES);
    _grounded  = new Uint8Array(MAX_BLOOD_PARTICLES);

    // Hide all particles initially (park at Y = -9999)
    for (let i = 0; i < MAX_BLOOD_PARTICLES; i++) {
      _positions[i * 3 + 1] = -9999;
      _life[i] = 0;
    }

    _geo.setAttribute('position', new THREE.BufferAttribute(_positions, 3));
    _geo.setAttribute('color',    new THREE.BufferAttribute(_colors, 3));
    _geo.setAttribute('size',     new THREE.BufferAttribute(_sizes, 1));

    _mat = new THREE.PointsMaterial({
      size: 0.09,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      depthTest: true,
      sizeAttenuation: true,
      blending: THREE.NormalBlending
    });

    _points = new THREE.Points(_geo, _mat);
    _points.renderOrder = 15;  // Render blood above ground to avoid z-fighting
    _scene.add(_points);
  }

  // ─── Emit helpers ────────────────────────────────────────────────────────────

  /**
   * Emit a single blood particle.
   * @param {number} x,y,z   - spawn position
   * @param {number} vx,vy,vz - initial velocity
   * @param {number} r,g,b   - colour (0-1)
   * @param {number} size    - point size (0.03 – 0.12 typical)
   * @param {number} life    - life in frames
   */
  function _emit(x, y, z, vx, vy, vz, r, g, b, size, life) {
    if (!_scene) return;
    const i = _head;
    _head = (_head + 1) % MAX_BLOOD_PARTICLES;
    if (_count < MAX_BLOOD_PARTICLES) _count++;

    const i3 = i * 3;
    _positions[i3]     = x;
    _positions[i3 + 1] = y;
    _positions[i3 + 2] = z;
    _velX[i] = vx;
    _velY[i] = vy;
    _velZ[i] = vz;
    _colors[i3]     = r;
    _colors[i3 + 1] = g;
    _colors[i3 + 2] = b;
    _sizes[i]    = size;
    _life[i]     = life;
    _grounded[i] = 0;
  }

  // Convert hex colour to [r,g,b] 0-1 components
  function _hexToRgb(hex) {
    return [((hex >> 16) & 0xFF) / 255, ((hex >> 8) & 0xFF) / 255, (hex & 0xFF) / 255];
  }

  // ─── Public emission API ─────────────────────────────────────────────────────

  /**
   * Emit a burst (single pulse) of blood particles around a world position.
   * @param {THREE.Vector3} pos
   * @param {number} count
   * @param {object} options
   */
  function emitBurst(pos, count, options) {
    if (!_scene) return;
    const opts = options || {};
    const spreadXZ  = opts.spreadXZ  !== undefined ? opts.spreadXZ  : 1.8;
    const spreadY   = opts.spreadY   !== undefined ? opts.spreadY   : 1.2;
    const minLife   = opts.minLife   !== undefined ? opts.minLife   : 50;
    const maxLife   = opts.maxLife   !== undefined ? opts.maxLife   : 100;
    const minSize   = opts.minSize   !== undefined ? opts.minSize   : 0.04;
    const maxSize   = opts.maxSize   !== undefined ? opts.maxSize   : 0.14;
    const color1    = opts.color1    !== undefined ? opts.color1    : 0x8B0000;
    const color2    = opts.color2    !== undefined ? opts.color2    : 0xFF1A1A;

    const [r1, g1, b1] = _hexToRgb(color1);
    const [r2, g2, b2] = _hexToRgb(color2);

    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const r = r1 + (r2 - r1) * t;
      const g = g1 + (g2 - g1) * t;
      const b = b1 + (b2 - b1) * t;
      const size = minSize + Math.random() * (maxSize - minSize);
      const life = minLife + Math.floor(Math.random() * (maxLife - minLife));

      // Random spherical direction
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.random() * Math.PI;
      const speed = 0.04 + Math.random() * spreadXZ;
      const vx = Math.sin(phi) * Math.cos(theta) * speed;
      const vy = Math.abs(Math.cos(phi)) * spreadY + 0.05;
      const vz = Math.sin(phi) * Math.sin(theta) * speed;

      _emit(pos.x, pos.y + 0.3, pos.z, vx, vy, vz, r, g, b, size, life);
    }
  }

  /**
   * Pulsating heartbeat emission — emits `pulses` bursts spaced `interval` ms apart.
   * Simulates blood pumping from an open wound or severed neck.
   * Default: 6 pulses, 500 drops each.
   */
  function emitPulse(pos, options) {
    if (!_scene) return;
    const opts     = options || {};
    const pulses   = opts.pulses   !== undefined ? opts.pulses   : 6;
    const perPulse = opts.perPulse !== undefined ? opts.perPulse : 500;
    const interval = opts.interval !== undefined ? opts.interval : 200; // ms
    const arcDir   = opts.arcDir;   // optional THREE.Vector3 direction
    const spreadXZ = opts.spreadXZ !== undefined ? opts.spreadXZ : 1.8;
    const minSize  = opts.minSize  !== undefined ? opts.minSize  : 0.03;
    const maxSize  = opts.maxSize  !== undefined ? opts.maxSize  : 0.10;
    const minLife  = opts.minLife  !== undefined ? opts.minLife  : 50;
    const maxLife  = opts.maxLife  !== undefined ? opts.maxLife  : 100;
    const color1   = opts.color1   !== undefined ? opts.color1   : 0x8B0000;
    const color2   = opts.color2   !== undefined ? opts.color2   : 0xFF0000;

    const [r1, g1, b1] = _hexToRgb(color1);
    const [r2, g2, b2] = _hexToRgb(color2);

    for (let p = 0; p < pulses; p++) {
      setTimeout(() => {
        if (!_scene) return;
        for (let i = 0; i < perPulse; i++) {
          const t   = Math.random();
          const r   = r1 + (r2 - r1) * t;
          const g   = g1 + (g2 - g1) * t;
          const b   = b1 + (b2 - b1) * t;
          const size = minSize + Math.random() * (maxSize - minSize);
          const life = minLife + Math.floor(Math.random() * (maxLife - minLife));

          let vx, vy, vz;
          if (arcDir) {
            // Fan out 180° relative to arcDir
            const baseAngle = Math.atan2(arcDir.z, arcDir.x);
            const angle = baseAngle + (Math.random() - 0.5) * Math.PI;
            const speed = 0.05 + Math.random() * spreadXZ;
            vx = Math.cos(angle) * speed;
            vy = 0.15 + Math.random() * 0.6;
            vz = Math.sin(angle) * speed;
          } else {
            const theta = Math.random() * Math.PI * 2;
            const speed = 0.04 + Math.random() * spreadXZ;
            vx = Math.cos(theta) * speed;
            vy = 0.15 + Math.random() * 0.6;
            vz = Math.sin(theta) * speed;
          }

          _emit(pos.x, pos.y + 0.5, pos.z, vx, vy, vz, r, g, b, size, life);
        }
      }, p * interval);
    }
  }

  /**
   * Spray blood out the back (exit wound direction).
   * @param {THREE.Vector3} pos  - exit wound position
   * @param {THREE.Vector3} dir  - direction bullet was travelling (normalised)
   * @param {number} count
   */
  function emitExitWound(pos, dir, count, options) {
    if (!_scene) return;
    const opts  = options || {};
    const spread = opts.spread !== undefined ? opts.spread : 0.5;
    const speed  = opts.speed  !== undefined ? opts.speed  : 0.35;

    const [r1, g1, b1] = _hexToRgb(0x8B0000);
    const [r2, g2, b2] = _hexToRgb(0xCC3300);

    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const r = r1 + (r2 - r1) * t;
      const g = g1 + (g2 - g1) * t;
      const b = b1 + (b2 - b1) * t;
      const size = 0.03 + Math.random() * 0.06;
      const life = 35 + Math.floor(Math.random() * 30);

      // Main direction + conical spread
      const perpX = -dir.z;
      const perpZ =  dir.x;
      const vy = 0.05 + Math.random() * 0.25;
      const lateral = (Math.random() - 0.5) * spread;
      const forward = speed * (0.6 + Math.random() * 0.8);
      const vx = dir.x * forward + perpX * lateral;
      const vz = dir.z * forward + perpZ * lateral;

      _emit(pos.x, pos.y, pos.z, vx, vy, vz, r, g, b, size, life);
    }
  }

  /**
   * Emit a drag trail of blood+guts on the ground behind a sliding lower body.
   * @param {THREE.Vector3} pos  - current position of lower body
   * @param {THREE.Vector3} vel  - slide velocity direction
   */
  function emitDragTrail(pos, vel, count) {
    if (!_scene) return;
    const [r1, g1, b1] = _hexToRgb(0x6B0000);
    const [r2, g2, b2] = _hexToRgb(0x8B2500);

    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const r = r1 + (r2 - r1) * t;
      const g = g1 + (g2 - g1) * t;
      const b = b1 + (b2 - b1) * t;
      const size = 0.06 + Math.random() * 0.08;

      // Park at ground level immediately (stain) with slight vertical scatter
      const ox = (Math.random() - 0.5) * 0.3;
      const oz = (Math.random() - 0.5) * 0.3;
      // Emit as grounded stain directly
      const idx = _head;
      _head = (_head + 1) % MAX_BLOOD_PARTICLES;
      if (_count < MAX_BLOOD_PARTICLES) _count++;
      const idx3 = idx * 3;
      _positions[idx3]     = pos.x + ox;
      _positions[idx3 + 1] = GROUND_Y;
      _positions[idx3 + 2] = pos.z + oz;
      _velX[idx] = 0;
      _velY[idx] = 0;
      _velZ[idx] = 0;
      _colors[idx3]     = r;
      _colors[idx3 + 1] = g;
      _colors[idx3 + 2] = b;
      _sizes[idx]    = size;
      _life[idx]     = 300 + Math.floor(Math.random() * 200); // long-lived stain
      _grounded[idx] = 1;
    }
  }

  /**
   * Circular splatter trail (for 180-degree spinning death).
   * Call every frame while the enemy spins, passing current angle.
   * @param {THREE.Vector3} center
   * @param {number} angle   - current spin angle (radians)
   * @param {number} count   - drops per call
   */
  function emitSpinTrail(center, angle, count) {
    if (!_scene) return;
    const [r1, g1, b1] = _hexToRgb(0x8B0000);
    const [r2, g2, b2] = _hexToRgb(0xFF1A1A);

    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const r = r1 + (r2 - r1) * t;
      const g = g1 + (g2 - g1) * t;
      const b = b1 + (b2 - b1) * t;
      const size = 0.04 + Math.random() * 0.07;
      const life = 40 + Math.floor(Math.random() * 30);

      // Blood flies outward from neck at current spin angle
      const dist = 0.3 + Math.random() * 0.4;
      const sprayAngle = angle + (Math.random() - 0.5) * 0.4;
      const vx = Math.cos(sprayAngle) * (0.1 + Math.random() * 0.3);
      const vy = 0.08 + Math.random() * 0.25;
      const vz = Math.sin(sprayAngle) * (0.1 + Math.random() * 0.3);

      _emit(
        center.x + Math.cos(angle) * dist,
        center.y + 0.6,
        center.z + Math.sin(angle) * dist,
        vx, vy, vz, r, g, b, size, life
      );
    }
  }

  // ─── Update (call every frame) ───────────────────────────────────────────────
  function update() {
    if (!_scene || !_geo) return;

    let needsUpdate = false;
    for (let i = 0; i < MAX_BLOOD_PARTICLES; i++) {
      if (_life[i] <= 0) continue;
      needsUpdate = true;
      _life[i]--;

      if (_grounded[i]) {
        // Stain — slow fade
        const alpha = Math.min(1, _life[i] / 120);
        // Fade colour toward dark stain
        const i3 = i * 3;
        if (_colors[i3] > 0.18) _colors[i3]     -= 0.001;
        if (_colors[i3+1] > 0)  _colors[i3 + 1] -= 0.0005;
        if (_life[i] <= 0) _positions[i * 3 + 1] = -9999;
        continue;
      }

      // Physics
      const i3 = i * 3;
      _velY[i] += GRAVITY;
      _positions[i3]     += _velX[i];
      _positions[i3 + 1] += _velY[i];
      _positions[i3 + 2] += _velZ[i];

      // Ground collision → become stain
      if (_positions[i3 + 1] <= GROUND_Y) {
        _positions[i3 + 1] = GROUND_Y;
        _velX[i] = 0;
        _velY[i] = 0;
        _velZ[i] = 0;
        _grounded[i] = 1;
        _life[i] = 200 + Math.floor(Math.random() * 150); // stain lingers
        // Fan out on ground — add slight random spread to position
        _positions[i3]     += (Math.random() - 0.5) * 0.15;
        _positions[i3 + 2] += (Math.random() - 0.5) * 0.15;
        // Make stain larger
        _sizes[i] = Math.min(0.18, _sizes[i] * 2.0);
      }

      // Kill if life expired
      if (_life[i] <= 0) {
        _positions[i3 + 1] = -9999;
      }
    }

    if (needsUpdate) {
      _geo.attributes.position.needsUpdate = true;
      _geo.attributes.color.needsUpdate    = true;
      _geo.attributes.size.needsUpdate     = true;
    }
  }

  // ─── Cleanup (call on game reset) ────────────────────────────────────────────
  function reset() {
    if (!_life) return;
    for (let i = 0; i < MAX_BLOOD_PARTICLES; i++) {
      _life[i]     = 0;
      _grounded[i] = 0;
      if (_positions) _positions[i * 3 + 1] = -9999;
    }
    if (_geo) {
      if (_geo.attributes.position) _geo.attributes.position.needsUpdate = true;
    }
  }

  // ─── Expose ──────────────────────────────────────────────────────────────────
  window.BloodSystem = {
    init,
    update,
    reset,
    emitBurst,
    emitPulse,
    emitExitWound,
    emitDragTrail,
    emitSpinTrail
  };

})();
