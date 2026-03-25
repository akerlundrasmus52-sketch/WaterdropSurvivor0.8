/**
 * ══════════════════════════════════════════════════════════════════
 * XP STAR SYSTEM V2.0 — COMPLETE REBUILD FROM SCRATCH
 * Water Drop Survivor — Sandbox 2.0 ONLY
 * File: js/xp-star-system.js
 * ══════════════════════════════════════════════════════════════════
 *
 * A BRAND NEW XP star system built from the ground up.
 * NO dependencies on old map code. NO conflicts. CLEAN implementation.
 *
 * FEATURES:
 * ✓ Rarity system: Common (grey/white) → Mythical (red/gold)
 * ✓ Physics based on kill shot damage (0.2-2.5 enemy lengths, max 1.7 height)
 * ✓ 360° spin on all axes with speed based on damage
 * ✓ Gravity matching blood system (-16.0 to -18.0)
 * ✓ Enemy-specific drops (slimes: grey/white, worm: green)
 * ✓ Stars spawn instantly when HP reaches 0
 * ✓ Object pooling for zero garbage collection
 * ✓ Always visible, proper magnetic pickup
 * ══════════════════════════════════════════════════════════════════
 */

(function(global) {
'use strict';

// ════════════════════════════════════════════════════════════════════
//  CONFIGURATION
// ════════════════════════════════════════════════════════════════════

const XP_CFG = {
  // Rarity tiers: Common → Mythical
  RARITIES: [
    { name: 'Common',    color: 0xCCCCCC, emissive: 0x888888, xp: 1   }, // Grey/White
    { name: 'Uncommon',  color: 0x44FF66, emissive: 0x22AA33, xp: 2   }, // Green
    { name: 'Rare',      color: 0x5DADE2, emissive: 0x2E86C1, xp: 3   }, // Blue
    { name: 'Epic',      color: 0xAA44FF, emissive: 0x6600CC, xp: 5   }, // Purple
    { name: 'Legendary', color: 0xFF8800, emissive: 0xCC5500, xp: 10  }, // Orange/Yellow
    { name: 'Mythical',  color: 0xFF2222, emissive: 0xAA0000, xp: 40  }  // Red (highest)
  ],

  // Physics constants
  GRAVITY: -16.0,              // Matches blood system
  BOUNCE_DAMPING: 0.4,         // Energy loss on bounce
  GROUND_FRICTION: 0.85,       // Friction when sliding
  GROUND_HEIGHT: 0.1,          // Height of star on ground

  // Spawn physics constraints (based on enemy size)
  MIN_DISTANCE: 0.2,           // Minimum spawn distance (enemy lengths)
  MAX_DISTANCE: 2.5,           // Maximum spawn distance (enemy lengths)
  MAX_HEIGHT: 1.7,             // Maximum spawn height (enemy heights)

  // Size and visuals
  STAR_SIZE: 0.15,             // Base star size
  STAR_POINTS: 5,              // 5-pointed star

  // Magnetism
  MAGNET_RANGE: 4.0,           // Pickup range
  MAGNET_SPEED: 0.5,           // Pull speed
  COLLECT_RANGE: 0.8,          // Collection distance

  // Pool size
  POOL_SIZE: 50,               // Pre-allocated stars
};

// Enemy-specific rarity mapping
const ENEMY_RARITIES = {
  'slime':         0,  // Common (grey/white)
  'leaping_slime': 0,  // Common (grey/white)
  'crawler':       1,  // Uncommon (green)
  'boss':          5,  // Mythical (red)
};

// Enemy-specific size table (used for physics scaling: distance/height)
const ENEMY_SIZES = {
  'slime':         0.5,
  'leaping_slime': 0.6,
  'crawler':       1.1,
  'boss':          2.0,
};

// ════════════════════════════════════════════════════════════════════
//  SHARED GPU ASSETS (geometry + material templates, built once)
// ════════════════════════════════════════════════════════════════════

let _sharedGeometry = null;
let _rarityMaterials = null;

function _buildSharedAssets() {
  if (_sharedGeometry) return;

  const shape = new THREE.Shape();
  const points = XP_CFG.STAR_POINTS;
  const outerR = XP_CFG.STAR_SIZE;
  const innerR = XP_CFG.STAR_SIZE * 0.4;
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const sx = Math.cos(angle) * r;
    const sy = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(sx, sy);
    else shape.lineTo(sx, sy);
  }
  shape.closePath();

  const extrudeSettings = {
    depth: 0.05,
    bevelEnabled: true,
    bevelSize: 0.015,
    bevelThickness: 0.015,
    bevelSegments: 2
  };

  _sharedGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  _sharedGeometry.center();

  // One material template per rarity; each star clones its own instance
  _rarityMaterials = XP_CFG.RARITIES.map(r => new THREE.MeshPhysicalMaterial({
    color: r.color,
    emissive: r.emissive,
    emissiveIntensity: 0.5,
    metalness: 0.4,
    roughness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05
  }));
}

// ════════════════════════════════════════════════════════════════════
//  XP STAR CLASS
// ════════════════════════════════════════════════════════════════════

class XPStar {
  constructor() {
    this.active = false;
    this.mesh = null;
    this.rarity = 0;
    this.xpValue = 1;

    // Physics
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.onGround = false;
    this.bounceCount = 0;

    // Rotation
    this.rotSpeedX = 0;
    this.rotSpeedY = 0;
    this.rotSpeedZ = 0;

    // Animation
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.grown = false;
    this.growTimer = 0;
  }

  spawn(x, y, z, enemyType, killDamage, killVX, killVZ) {
    this.active = true;
    this.onGround = false;
    this.bounceCount = 0;
    this.grown = false;
    this.growTimer = 0;

    // Determine rarity based on enemy type
    this.rarity = ENEMY_RARITIES[enemyType] || 0;
    const rarityData = XP_CFG.RARITIES[this.rarity];
    this.xpValue = rarityData.xp;

    // Create or update mesh
    if (!this.mesh) {
      this._createMesh();
    }

    // Set color based on rarity
    this.mesh.material.color.setHex(rarityData.color);
    this.mesh.material.emissive.setHex(rarityData.emissive);

    // Spawn physics based on kill shot damage
    // Damage determines launch force: higher damage = more speed and distance
    const force = Math.min(killDamage / 10, 2.0); // Normalize damage to 0-2 range

    // Enemy size derived from enemy type (not hardcoded)
    const enemySize = ENEMY_SIZES[enemyType] || 0.7;

    // Random launch angle
    const angle = Math.random() * Math.PI * 2;

    // Distance: MIN_DISTANCE to MAX_DISTANCE enemy lengths
    const minDist = XP_CFG.MIN_DISTANCE * enemySize;
    const maxDist = XP_CFG.MAX_DISTANCE * enemySize;
    const distance = minDist + (maxDist - minDist) * force;

    // Launch velocity based on damage (physics-consistent with GRAVITY)
    const launchSpeed = 1.5 + force * 2.0; // 1.5 to 3.5 units/s horizontal
    this.vx = Math.cos(angle) * launchSpeed;
    this.vz = Math.sin(angle) * launchSpeed;

    // Add kill velocity (direction of kill shot)
    if (killVX || killVZ) {
      this.vx += killVX * 0.05;
      this.vz += killVZ * 0.05;
    }

    // Upward velocity clamped by MAX_HEIGHT constraint using kinematics
    // max height = vy² / (2 * |gravity|), so maxVy = sqrt(2 * |g| * maxUpward)
    const maxUpward = XP_CFG.MAX_HEIGHT * enemySize;
    const gAbs = Math.abs(XP_CFG.GRAVITY);
    const desiredVy = 4.0 + force * 3.0; // 4.0 to 7.0 upward velocity
    if (gAbs > 0) {
      const maxVy = Math.sqrt(2 * gAbs * maxUpward);
      this.vy = Math.min(desiredVy, maxVy);
    } else {
      this.vy = desiredVy;
    }

    // Position: spawn from enemy center
    const spawnDist = distance * (0.3 + Math.random() * 0.3); // Some randomness
    this.mesh.position.set(
      x + Math.cos(angle) * spawnDist,
      y + 0.3, // Start slightly above enemy center
      z + Math.sin(angle) * spawnDist
    );

    // 360° spin on all axes - speed based on damage
    const spinBase = 0.05 + force * 0.15; // 0.05 to 0.20
    this.rotSpeedX = (Math.random() - 0.5) * spinBase * 2;
    this.rotSpeedY = (Math.random() - 0.5) * spinBase * 2;
    this.rotSpeedZ = (Math.random() - 0.5) * spinBase * 2;

    // Critical hits spin faster
    if (killDamage > 50) {
      this.rotSpeedX *= 2;
      this.rotSpeedY *= 2;
      this.rotSpeedZ *= 2;
    }

    // Make visible and reset scale
    this.mesh.visible = true;
    this.mesh.scale.set(0.01, 0.01, 0.01);

    this.pulsePhase = Math.random() * Math.PI * 2;
  }

  _createMesh() {
    // Use shared geometry; clone material from per-rarity template so each
    // star can have independent emissiveIntensity / color animation
    const material = _rarityMaterials[this.rarity].clone();
    this.mesh = new THREE.Mesh(_sharedGeometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
  }

  update(dt, playerX, playerY, playerZ, radiusMultiplier) {
    if (!this.active) return;

    // Grow animation
    if (!this.grown) {
      this.growTimer += dt * 5;
      const s = Math.min(1.0, this.growTimer);
      this.mesh.scale.set(s, s, s);
      if (s >= 1.0) this.grown = true;
    }

    // 360° rotation on all axes (frame-rate independent)
    this.mesh.rotation.x += this.rotSpeedX * dt * 60;
    this.mesh.rotation.y += this.rotSpeedY * dt * 60;
    this.mesh.rotation.z += this.rotSpeedZ * dt * 60;

    // Pulsing emissive
    this.pulsePhase += dt * 3;
    const pulse = 0.3 + Math.sin(this.pulsePhase) * 0.2;
    this.mesh.material.emissiveIntensity = pulse;

    // Mythical stars pulse color
    if (this.rarity === 5) {
      const colorPulse = (Math.sin(this.pulsePhase * 1.5) + 1) * 0.5;
      if (colorPulse > 0.5) {
        this.mesh.material.color.setHex(0xFF2222);
        this.mesh.material.emissive.setHex(0xAA0000);
      } else {
        this.mesh.material.color.setHex(0x880000);
        this.mesh.material.emissive.setHex(0x440000);
      }
    }

    // Physics
    if (!this.onGround) {
      // Apply gravity
      this.vy += XP_CFG.GRAVITY * dt;

      // Update position
      this.mesh.position.x += this.vx * dt;
      this.mesh.position.y += this.vy * dt;
      this.mesh.position.z += this.vz * dt;

      // Ground collision
      if (this.mesh.position.y <= XP_CFG.GROUND_HEIGHT) {
        this.mesh.position.y = XP_CFG.GROUND_HEIGHT;
        this.bounceCount++;

        // Bounce with damping
        this.vy = -this.vy * XP_CFG.BOUNCE_DAMPING;
        this.vx *= XP_CFG.GROUND_FRICTION;
        this.vz *= XP_CFG.GROUND_FRICTION;

        // Reduce spin on bounce
        this.rotSpeedX *= 0.8;
        this.rotSpeedZ *= 0.8;

        // Stop bouncing after several bounces or low velocity
        if (Math.abs(this.vy) < 0.01 || this.bounceCount > 5) {
          this.vy = 0;
          this.vx = 0;
          this.vz = 0;
          this.onGround = true;
          // Gentle spin when on ground
          this.rotSpeedX = 0;
          this.rotSpeedZ = 0;
          this.rotSpeedY *= 0.3;
        }
      }
    } else {
      // On ground: gentle Y-axis spin (frame-rate independent)
      this.mesh.rotation.y += this.rotSpeedY * 0.5 * dt * 60;
    }

    // Magnetism: pull toward player (radius scaled by optional upgrade multiplier)
    const dx = playerX - this.mesh.position.x;
    const dy = playerY - this.mesh.position.y;
    const dz = playerZ - this.mesh.position.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    const rm = (typeof radiusMultiplier === 'number' && radiusMultiplier > 0) ? radiusMultiplier : 1;

    if (dist < XP_CFG.MAGNET_RANGE * rm && dist > 0.01) {
      // Lift off ground when magnetized
      this.onGround = false;

      // Pull toward player with increasing speed as it gets closer
      const pullStrength = XP_CFG.MAGNET_SPEED * (1 - dist / XP_CFG.MAGNET_RANGE);
      this.mesh.position.x += (dx / dist) * pullStrength * dt * 60;
      this.mesh.position.y += (dy / dist) * pullStrength * dt * 60;
      this.mesh.position.z += (dz / dist) * pullStrength * dt * 60;

      // Clear physics velocity when being pulled
      this.vx = 0;
      this.vy = 0;
      this.vz = 0;

      // Spin faster when being pulled
      this.rotSpeedY = 0.2;
    }

    // Collection check
    if (dist < XP_CFG.COLLECT_RANGE * rm) {
      return true; // Signal for collection
    }

    return false;
  }

  deactivate() {
    this.active = false;
    if (this.mesh) {
      this.mesh.visible = false;
      this.mesh.position.set(0, -1000, 0); // Park off-screen
    }
  }

  dispose() {
    if (this.mesh) {
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      if (this.mesh.material) this.mesh.material.dispose();
      if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
      this.mesh = null;
    }
  }
}

// ════════════════════════════════════════════════════════════════════
//  XP STAR MANAGER
// ════════════════════════════════════════════════════════════════════

const XPStarManager = {
  _ready: false,
  _scene: null,
  _pool: [],
  _activeStars: [],

  init: function(scene) {
    if (this._ready) return;

    this._scene = scene;

    // Build shared geometry and material templates once
    _buildSharedAssets();

    // Pre-allocate pool
    for (let i = 0; i < XP_CFG.POOL_SIZE; i++) {
      const star = new XPStar();
      star._createMesh();
      scene.add(star.mesh);
      star.deactivate();
      this._pool.push(star);
    }

    this._ready = true;
    console.log('[XPStarSystem] Initialized with pool size:', XP_CFG.POOL_SIZE);
  },

  spawn: function(x, y, z, enemyType, killDamage, killVX, killVZ) {
    if (!this._ready) {
      console.warn('[XPStarSystem] Not initialized!');
      return null;
    }

    // Find available star from pool
    let star = null;
    for (let i = 0; i < this._pool.length; i++) {
      if (!this._pool[i].active) {
        star = this._pool[i];
        break;
      }
    }

    // If pool exhausted, reuse oldest active star
    if (!star && this._activeStars.length > 0) {
      star = this._activeStars[0];
      this._activeStars.shift();
    }

    if (!star) {
      console.warn('[XPStarSystem] Pool exhausted!');
      return null;
    }

    star.spawn(x, y, z, enemyType, killDamage, killVX || 0, killVZ || 0);
    this._activeStars.push(star);

    return star;
  },

  update: function(dt, playerX, playerY, playerZ, radiusMultiplier) {
    if (!this._ready) return [];

    const collected = [];

    for (let i = this._activeStars.length - 1; i >= 0; i--) {
      const star = this._activeStars[i];

      if (!star.active) {
        this._activeStars.splice(i, 1);
        continue;
      }

      const shouldCollect = star.update(dt, playerX, playerY, playerZ, radiusMultiplier);

      if (shouldCollect) {
        collected.push({
          xp: star.xpValue,
          rarity: star.rarity,
          position: {
            x: star.mesh.position.x,
            y: star.mesh.position.y,
            z: star.mesh.position.z
          }
        });

        star.deactivate();
        this._activeStars.splice(i, 1);
      }
    }

    return collected;
  },

  reset: function() {
    for (let star of this._activeStars) {
      star.deactivate();
    }
    this._activeStars = [];
  },

  getActiveCount: function() {
    return this._activeStars.length;
  },

  dispose: function() {
    for (let star of this._pool) {
      star.dispose();
    }
    this._pool = [];
    this._activeStars = [];
    this._ready = false;
  }
};

// ════════════════════════════════════════════════════════════════════
//  GLOBAL EXPORT
// ════════════════════════════════════════════════════════════════════

global.XPStarSystem = XPStarManager;

console.log('[XPStarSystem] Module loaded - ready for init()');

})(typeof window !== 'undefined' ? window : global);
