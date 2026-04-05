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
  // xp base values — multiplied by GAME_CONFIG.expValue at spawn (default 20)
  // so Common gives 20 XP, Uncommon 40, Rare 60, etc.
  RARITIES: [
    { name: 'Common',    color: 0xEEEEFF, emissive: 0xBBCCFF, xp: 1   }, // Bright white-grey
    { name: 'Uncommon',  color: 0x66FF88, emissive: 0x33AA44, xp: 2   }, // Bright green
    { name: 'Rare',      color: 0x88CCFF, emissive: 0x4499DD, xp: 3   }, // Bright blue
    { name: 'Epic',      color: 0xCC88FF, emissive: 0x9933CC, xp: 5   }, // Bright purple
    { name: 'Legendary', color: 0xFFCC44, emissive: 0xFF8800, xp: 10  }, // Bright gold/orange
    { name: 'Mythical',  color: 0xFF5555, emissive: 0xCC0000, xp: 40  }  // Bright red
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

  // Size and visuals — 2x the original 0.15 size
  STAR_SIZE: 0.30,             // Base star size (2x larger)
  STAR_POINTS: 5,              // 5-pointed star

  // Magnetism
  // MAGNET_RANGE is deliberately tiny so the player must physically walk onto stars at level 0.
  // Stars that enter the radius are pulled with a cubic slingshot acceleration — starts slow
  // at the edge, then snaps rapidly into the player (gravity/slingshot feel).
  MAGNET_RANGE: 1.5,           // Tiny pickup radius at level 0 — player must touch the star.
  MAGNET_SPEED: 15,            // Pull speed in world-units/sec at the closest point (proper dt scaling).
  COLLECT_RANGE: 1.2,          // Collection distance (must be < MAGNET_RANGE)

  // Pool size
  POOL_SIZE: 60,               // Pre-allocated stars (BUG C: increased from 50 to 60)
};

// Enemy-specific rarity mapping
// NOTE: Visual color is fully overridden by ENEMY_STAR_COLORS below for Common tier.
// Uncommon and above show their actual rarity color for visual variety.
// This value determines only the BASE XP tier; slimes have a 25% chance to drop Uncommon.
const ENEMY_RARITIES = {
  'slime':         0,  // Common (base)  — 1× XP multiplier; 25% uncommon chance in spawn()
  'leaping_slime': 2,  // Rare     — 3× XP multiplier (tougher, visual override: sky-blue for common only)
  'crawler':       3,  // Epic     — 5× XP multiplier (worm)
  'skinwalker':    3,  // Epic     — 5× XP multiplier (elite shapeshifter)
  'boss':          5,  // Mythical — 40× XP multiplier
};

// Enemy-specific star COLOR override — uses the enemy's actual body color
// so XP stars visually match the enemy they came from.
const ENEMY_STAR_COLORS = {
  'slime':         { color: 0xEEEEFF, emissive: 0xBBCCFF }, // Bright white-grey (slime body)
  'leaping_slime': { color: 0x00CFFF, emissive: 0x0099DD }, // Bright sky-blue (blue slime body)
  'crawler':       { color: 0xC8A060, emissive: 0x8B5A2B }, // Warm brown/amber (worm body)
  'skinwalker':    { color: 0xCC2244, emissive: 0x880022 }, // Dark crimson (shapeshifter)
  'boss':          { color: 0xFF5555, emissive: 0xCC0000 }, // Bright red (boss body)
};

// Enemy-specific size table (used for physics scaling: distance/height)
const ENEMY_SIZES = {
  'slime':         0.5,
  'leaping_slime': 0.6,
  'crawler':       1.1,
  'skinwalker':    1.2,
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
  // Set a large bounding sphere once on the shared geometry to ensure stars are
  // never culled by the camera frustum. Done here so it is only allocated once.
  _sharedGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 999);

  // One material template per rarity; each star clones its own instance
  _rarityMaterials = XP_CFG.RARITIES.map(r => new THREE.MeshPhysicalMaterial({
    color: r.color,
    emissive: r.emissive,
    emissiveIntensity: 0.8,  // Brighter for visibility
    metalness: 0.2,
    roughness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    transparent: false,
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
    this._deactivateToken = 0; // incremented on each deactivate to cancel stale RAF callbacks

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
    // BUG B: Increment token at spawn to cancel any pending RAF callbacks from previous deactivation
    this._deactivateToken++;

    this.active = true;
    this.onGround = false;
    this.bounceCount = 0;
    this.grown = false;
    this.growTimer = 0;

    // Determine rarity based on enemy type
    // Slimes have a 25% chance to upgrade from Common → Uncommon (green) for visual variety.
    this.rarity = ENEMY_RARITIES[enemyType] || 0;
    if (this.rarity === 0 && Math.random() < 0.25) {
      this.rarity = 1; // Uncommon — bright green
    }
    const rarityData = XP_CFG.RARITIES[this.rarity];
    // Multiply xp by GAME_CONFIG.expValue so balance matches the designed
    // "~2.25 kills for first level" when expValue=20 and baseExpReq=45.
    const expMult = (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG.expValue) ? GAME_CONFIG.expValue : 20;
    this.xpValue = rarityData.xp * expMult;

    // Create or update mesh
    if (!this.mesh) {
      this._createMesh();
    }

    // Set color: use enemy-specific color only for Common stars (rarity 0).
    // Uncommon+ stars show their actual rarity color (e.g. green for Uncommon).
    const starColor = (this.rarity === 0) ? ENEMY_STAR_COLORS[enemyType] : null;
    if (starColor) {
      this.mesh.material.color.setHex(starColor.color);
      this.mesh.material.emissive.setHex(starColor.emissive);
    } else {
      this.mesh.material.color.setHex(rarityData.color);
      this.mesh.material.emissive.setHex(rarityData.emissive);
    }
    // Bright emissive intensity for visibility
    this.mesh.material.emissiveIntensity = 0.8;

    // Spawn physics based on kill shot damage
    // Damage determines launch force: higher damage = more speed and distance
    const force = Math.min(killDamage / 10, 2.0); // Normalize damage to 0-2 range

    // Enemy size derived from enemy type (not hardcoded)
    const enemySize = ENEMY_SIZES[enemyType] || 0.7;

    // Random launch angle
    const angle = Math.random() * Math.PI * 2;

    // Distance: MIN_DISTANCE to MAX_DISTANCE enemy lengths (capped at 50% of original)
    const minDist = XP_CFG.MIN_DISTANCE * enemySize;
    const maxDist = XP_CFG.MAX_DISTANCE * enemySize * 0.5; // 50% max horizontal distance
    const distanceForce = Math.min(force, 1.0); // Clamp interpolation factor to [0,1] to never exceed maxDist
    const distance = minDist + (maxDist - minDist) * distanceForce;

    // Launch velocity: 50% of original horizontal speed
    const launchSpeed = (0.75 + force * 1.0); // Was 1.5 + force * 2.0 → halved
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
    // BUG E: Disable frustum culling — stars must be visible at all distances and angles
    this.mesh.frustumCulled = false;
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

    // Pulsing emissive — bright light glow inside all star colors
    this.pulsePhase += dt * 3;
    const pulse = 0.6 + Math.sin(this.pulsePhase) * 0.4; // 0.2–1.0 range (brighter)
    this.mesh.material.emissiveIntensity = pulse;

    // Mythical stars pulse color (boss drops — bright red glow)
    if (this.rarity === 5) {
      const colorPulse = (Math.sin(this.pulsePhase * 1.5) + 1) * 0.5;
      if (colorPulse > 0.5) {
        this.mesh.material.color.setHex(0xFF5555);
        this.mesh.material.emissive.setHex(0xCC0000);
      } else {
        this.mesh.material.color.setHex(0xAA1111);
        this.mesh.material.emissive.setHex(0x660000);
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
    // BUG FIX: direction vector (dx, dy, dz) already points from star → player, so adding it
    // to position moves the star toward the player (attraction, not repulsion).
    // The old formula used "* dt * 60" which treated dt as frame-count instead of seconds,
    // causing 60× overshoot at 60fps — the star flew past the player and oscillated wildly.
    // Fixed: use "* dt" for proper world-units/sec movement, and clamp the step to prevent
    // overshooting the player even on low-FPS spikes.
    const dx = playerX - this.mesh.position.x;
    const dy = playerY - this.mesh.position.y;
    const dz = playerZ - this.mesh.position.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    const rm = (typeof radiusMultiplier === 'number' && radiusMultiplier > 0) ? radiusMultiplier : 1;

    if (dist < XP_CFG.MAGNET_RANGE * rm && dist > 0.01) {
      // Lift off ground when magnetized
      this.onGround = false;

      // Cubic slingshot ramp: t=0 at edge of range (slow), t=1 near player (fast snap).
      // Starts almost still, then accelerates hard — "gravity well / slingshot" feel.
      const effectiveRange = XP_CFG.MAGNET_RANGE * rm;
      const t = Math.max(0, (effectiveRange - dist) / effectiveRange); // 0 at edge → 1 at player
      const pullStrength = XP_CFG.MAGNET_SPEED * (0.1 + t * t * t * 4); // cubic: 0.1× → 4.1× of MAGNET_SPEED

      // Proper per-second movement (dt is in seconds).
      // Clamp step so the star never overshoots the player in a single frame.
      const step = Math.min(pullStrength * dt, dist - 0.02);
      if (step > 0) {
        this.mesh.position.x += (dx / dist) * step;
        this.mesh.position.y += (dy / dist) * step;
        this.mesh.position.z += (dz / dist) * step;
      }

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
    const wasActive = this.active;
    this.active = false;
    if (this.mesh) {
      // Use a token so stale RAF callbacks (from a quickly-reused star) don't interfere
      const token = ++this._deactivateToken;
      if (wasActive) {
        // Scale pop: 1.4 this frame, then 0.001 next frame, then hide
        this.mesh.scale.set(1.4, 1.4, 1.4);
        requestAnimationFrame(() => {
          if (this._deactivateToken !== token) return; // star was reused — abort
          if (this.mesh) {
            this.mesh.scale.set(0.001, 0.001, 0.001);
            requestAnimationFrame(() => {
              if (this._deactivateToken !== token) return; // star was reused — abort
              if (this.mesh) {
                this.mesh.visible = false;
                this.mesh.position.set(0, -1000, 0); // Park off-screen
              }
            });
          }
        });
      } else {
        // Never active — hide immediately, no pop animation
        this.mesh.visible = false;
        this.mesh.scale.set(0.001, 0.001, 0.001);
        this.mesh.position.set(0, -1000, 0);
      }
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
      // Hide immediately without the pop animation (star was never active)
      star.active = false;
      star._deactivateToken++; // initialize token so future deactivate RAFs can cancel correctly
      if (star.mesh) {
        star.mesh.visible = false;
        star.mesh.scale.set(0.001, 0.001, 0.001);
        star.mesh.position.set(0, -1000, 0);
      }
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

  /**
   * getMagnetRange()
   * Returns the base magnet range (XP_CFG.MAGNET_RANGE) so callers like sandbox-loop.js
   * can derive upgrade multipliers without duplicating the constant.
   */
  getMagnetRange: function() {
    return XP_CFG.MAGNET_RANGE;
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
