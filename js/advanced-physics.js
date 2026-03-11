// js/advanced-physics.js — Enhanced physics, procedural animations & dynamic lighting
// Loaded as a regular <script> before game-loop.js.  Exposes window.AdvancedPhysics.

(function () {
  'use strict';

  // Pre-allocated temporaries (zero GC)
  const _v3a = new THREE.Vector3();
  const _v3b = new THREE.Vector3();

  // -----------------------------------------------------------------------
  // Enhanced Squash & Stretch — velocity-coupled deformation
  // -----------------------------------------------------------------------
  const SquashStretch = {
    /**
     * Compute squash/stretch scale based on velocity magnitude.
     * Returns { sx, sy, sz } to apply to the entity mesh.
     *
     * @param {number} speed       Current movement speed.
     * @param {number} maxSpeed    Reference max speed (for normalisation).
     * @param {number} intensity   Effect strength (0 – 1, default 0.5).
     * @returns {{ sx: number, sy: number, sz: number }}
     */
    compute(speed, maxSpeed, intensity) {
      if (!intensity) intensity = 0.5;
      const t = Math.min(speed / (maxSpeed || 1), 1);  // 0 – 1
      // Stretch along Y (height), compress XZ when fast
      const stretch = 1 + t * 0.35 * intensity;
      const squash  = 1 / Math.sqrt(stretch);   // volume preservation
      return { sx: squash, sy: stretch, sz: squash };
    },

    /**
     * Apply deformation to a THREE.Mesh.
     * @param {THREE.Mesh} mesh
     * @param {number}     speed
     * @param {number}     maxSpeed
     * @param {number}     [intensity]
     */
    apply(mesh, speed, maxSpeed, intensity) {
      const s = this.compute(speed, maxSpeed, intensity);
      mesh.scale.set(s.sx, s.sy, s.sz);
    }
  };

  // -----------------------------------------------------------------------
  // Knockback Chain — propagate knockback from one enemy to its neighbours
  // -----------------------------------------------------------------------
  const KnockbackChain = {
    _pending: [],   // { position, force, radius, remaining }

    /**
     * Add a knockback impulse that can chain to nearby enemies.
     * @param {THREE.Vector3} origin   World position of the hit.
     * @param {number}        force    Impulse magnitude.
     * @param {number}        radius   Blast radius.
     * @param {number}        [chains] Max chain depth (default 2).
     */
    add(origin, force, radius, chains) {
      this._pending.push({
        x: origin.x, z: origin.z,
        force:     force,
        radius:    radius || 3,
        remaining: chains !== undefined ? chains : 2,
        processed: new Set()
      });
    },

    /**
     * Process pending knockbacks against an enemy array.
     * Uses spatial hash for efficiency.
     * @param {Array}  enemies         The enemies array.
     * @param {object} [spatialHash]   Optional SpatialHash for neighbour queries.
     * @param {number} dt              Frame delta time.
     */
    process(enemies, spatialHash, dt) {
      const next = [];

      for (let p = 0; p < this._pending.length; p++) {
        const kb = this._pending[p];
        if (kb.remaining <= 0) continue;

        // Query nearby enemies
        let nearby;
        if (spatialHash) {
          nearby = spatialHash.query(kb.x, kb.z, kb.radius);
        } else {
          nearby = [];
          for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e || !e.mesh || e.isDead) continue;
            const dx = e.mesh.position.x - kb.x;
            const dz = e.mesh.position.z - kb.z;
            if (dx * dx + dz * dz <= kb.radius * kb.radius) nearby.push(e);
          }
        }

        for (let i = 0; i < nearby.length; i++) {
          const enemy = nearby[i];
          if (kb.processed.has(enemy)) continue;
          kb.processed.add(enemy);

          const pos = enemy.mesh.position;
          const dx  = pos.x - kb.x;
          const dz  = pos.z - kb.z;
          const dist = Math.sqrt(dx * dx + dz * dz) || 0.1;
          const falloff = 1 - dist / kb.radius;
          if (falloff <= 0) continue;

          const impulse = kb.force * falloff * 0.6;  // 60% transfer
          const nx = dx / dist, nz = dz / dist;

          // Cap dt to prevent lag-spike teleportation
          const safeDt = Math.min(dt, 0.05);

          // Apply velocity change
          if (enemy.vx !== undefined) {
            enemy.vx += nx * impulse * safeDt * 60;
            enemy.vz += nz * impulse * safeDt * 60;
          } else {
            pos.x += nx * impulse * safeDt;
            pos.z += nz * impulse * safeDt;
          }

          // Queue chain reaction (weaker)
          if (kb.remaining > 1 && impulse > 0.5) {
            const childProcessed = new Set(kb.processed);
            next.push({
              x: pos.x, z: pos.z,
              force:     impulse * 0.5,
              radius:    kb.radius * 0.7,
              remaining: kb.remaining - 1,
              processed: childProcessed
            });
          }
        }
      }

      this._pending.length = 0;
      if (next.length > 0) {
        this._pending = next;
      }
    },

    clear() { this._pending.length = 0; }
  };

  // -----------------------------------------------------------------------
  // Procedural Recoil — spring-based weapon recoil
  // -----------------------------------------------------------------------
  class ProceduralRecoil {
    constructor() {
      this.offsetY   = 0;
      this.velocity  = 0;
      this.springK   = 250;
      this.damping   = 18;
    }

    /** Trigger a recoil kick (negative = down). */
    kick(strength) {
      this.velocity += strength;
    }

    /** Per-frame update.  Returns current offset. */
    update(dt) {
      const force = -this.springK * this.offsetY - this.damping * this.velocity;
      this.velocity += force * dt;
      this.offsetY  += this.velocity * dt;
      return this.offsetY;
    }

    reset() { this.offsetY = 0; this.velocity = 0; }
  }

  // -----------------------------------------------------------------------
  // Dynamic Projectile Lighting — pooled point lights that follow projectiles
  // -----------------------------------------------------------------------
  class ProjectileLightPool {
    /**
     * @param {THREE.Scene} scene
     * @param {number}      maxLights   Max simultaneous lights.
     */
    constructor(scene, maxLights = 8) {
      this._scene = scene;
      this._pool  = [];

      for (let i = 0; i < maxLights; i++) {
        const light = new THREE.PointLight(0xffdd44, 0, 6, 2);
        light.castShadow = false;  // shadow from projectile lights is too expensive
        light.visible = false;
        scene.add(light);
        this._pool.push({ light: light, inUse: false, target: null });
      }
    }

    /**
     * Attach a light to a projectile mesh.
     * @param {THREE.Object3D} target  The projectile mesh to follow.
     * @param {number}         color   Hex colour.
     * @param {number}         intensity
     * @returns {{ light, inUse, target } | null}
     */
    attach(target, color, intensity) {
      for (let i = 0; i < this._pool.length; i++) {
        const entry = this._pool[i];
        if (!entry.inUse) {
          entry.inUse = true;
          entry.target = target;
          entry.light.color.set(color || 0xffdd44);
          entry.light.intensity = intensity || 1.2;
          entry.light.visible = true;
          entry.light.position.copy(target.position);
          return entry;
        }
      }
      return null; // pool exhausted
    }

    /** Release a light back to the pool. */
    release(entry) {
      entry.inUse = false;
      entry.target = null;
      entry.light.visible = false;
      entry.light.intensity = 0;
    }

    /** Update all active lights to follow their targets. */
    update() {
      for (let i = 0; i < this._pool.length; i++) {
        const e = this._pool[i];
        if (!e.inUse) continue;
        if (!e.target || !e.target.visible) {
          this.release(e);
          continue;
        }
        e.light.position.copy(e.target.position);
        e.light.position.y += 0.5;  // slight elevation
      }
    }

    dispose() {
      for (let i = 0; i < this._pool.length; i++) {
        this._scene.remove(this._pool[i].light);
        this._pool[i].light.dispose();
      }
      this._pool.length = 0;
    }
  }

  // -----------------------------------------------------------------------
  // Water Material — enhanced player material with refraction & specular
  // -----------------------------------------------------------------------
  const WaterMaterial = {
    /**
     * Create a high-quality water-like material for the player.
     * Uses MeshPhysicalMaterial for refraction, clearcoat & sheen.
     * @param {number} [baseColor]  Hex colour (default: watery blue).
     * @returns {THREE.MeshPhysicalMaterial}
     */
    create(baseColor) {
      return new THREE.MeshPhysicalMaterial({
        color:             baseColor || 0x44aaff,
        metalness:         0.05,
        roughness:         0.12,
        transmission:      0.6,      // glass-like refraction
        thickness:         0.8,      // refraction depth
        ior:               1.33,     // water IOR
        clearcoat:         1.0,
        clearcoatRoughness: 0.05,
        sheen:             1.0,
        sheenRoughness:    0.3,
        sheenColor:        new THREE.Color(0x88ccff),
        envMapIntensity:   1.5,
        transparent:       true,
        opacity:           0.92,
        side:              THREE.FrontSide
      });
    },

    /**
     * Per-frame animate — subtle specular shimmer.
     * @param {THREE.MeshPhysicalMaterial} mat
     * @param {number} time  Elapsed time in seconds.
     */
    animate(mat, time) {
      if (!mat || !mat.sheenColor) return;
      const shimmer = Math.sin(time * 3) * 0.5 + 0.5;
      mat.sheenRoughness = 0.2 + shimmer * 0.2;
      mat.clearcoatRoughness = 0.03 + shimmer * 0.04;
    }
  };

  // -----------------------------------------------------------------------
  // Dynamic Shadows — lightweight shadow helper for projectiles
  // -----------------------------------------------------------------------
  const DynamicShadows = {
    _decals: [],
    _sharedGeo: null,
    _sharedMat: null,
    _max: 30,

    init(scene) {
      this._scene = scene;
      this._sharedGeo = new THREE.CircleGeometry(0.15, 6);
      this._sharedGeo.rotateX(-Math.PI / 2);
      this._sharedMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false
      });

      for (let i = 0; i < this._max; i++) {
        const mesh = new THREE.Mesh(this._sharedGeo, this._sharedMat);
        mesh.position.y = 0.02;
        mesh.visible = false;
        scene.add(mesh);
        this._decals.push({ mesh: mesh, inUse: false, target: null });
      }
    },

    /** Attach a drop-shadow to a projectile. */
    attach(projectileMesh) {
      for (let i = 0; i < this._decals.length; i++) {
        const d = this._decals[i];
        if (!d.inUse) {
          d.inUse = true;
          d.target = projectileMesh;
          d.mesh.visible = true;
          return d;
        }
      }
      return null;
    },

    release(entry) {
      entry.inUse = false;
      entry.target = null;
      entry.mesh.visible = false;
    },

    update() {
      for (let i = 0; i < this._decals.length; i++) {
        const d = this._decals[i];
        if (!d.inUse) continue;
        if (!d.target || !d.target.visible) {
          this.release(d);
          continue;
        }
        d.mesh.position.x = d.target.position.x;
        d.mesh.position.z = d.target.position.z;
        // Scale shadow based on height
        const h = Math.max(d.target.position.y, 0.1);
        const s = Math.max(0.5, 1.5 - h * 0.3);
        d.mesh.scale.setScalar(s);
        d.mesh.material.opacity = Math.max(0.05, 0.25 - h * 0.05);
      }
    }
  };

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------
  window.AdvancedPhysics = {
    SquashStretch:        SquashStretch,
    KnockbackChain:       KnockbackChain,
    ProceduralRecoil:     ProceduralRecoil,
    ProjectileLightPool:  ProjectileLightPool,
    WaterMaterial:        WaterMaterial,
    DynamicShadows:       DynamicShadows
  };
})();
