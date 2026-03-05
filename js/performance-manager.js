// js/performance-manager.js — QuadTree, aggressive object pooling, GC minimisation
// Loaded as a regular <script> before game-loop.js.  Exposes window.PerfManager.

(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // QuadTree — hierarchical spatial partitioning for collision detection
  // -----------------------------------------------------------------------

  const QT_MAX_OBJECTS = 10;
  const QT_MAX_LEVELS  = 5;

  class QuadTree {
    /**
     * @param {{ x: number, z: number, w: number, h: number }} bounds
     * @param {number} [level]
     */
    constructor(bounds, level = 0) {
      this.level  = level;
      this.bounds = bounds;   // { x, z, w, h } — origin is top-left
      /** @type {Array<object>}  Entities with `.mesh.position` (standard THREE.js layout). */
      this.objects = [];
      /** @type {QuadTree[]} */
      this.nodes  = [];
    }

    /** Remove all objects and child nodes. */
    clear() {
      this.objects.length = 0;
      for (let i = 0; i < this.nodes.length; i++) {
        this.nodes[i].clear();
      }
      this.nodes.length = 0;
    }

    /** Split this node into four quadrants. */
    _split() {
      const { x, z, w, h } = this.bounds;
      const hw = w / 2, hh = h / 2;
      const nl = this.level + 1;
      this.nodes[0] = new QuadTree({ x: x + hw, z: z,      w: hw, h: hh }, nl);
      this.nodes[1] = new QuadTree({ x: x,      z: z,      w: hw, h: hh }, nl);
      this.nodes[2] = new QuadTree({ x: x,      z: z + hh, w: hw, h: hh }, nl);
      this.nodes[3] = new QuadTree({ x: x + hw, z: z + hh, w: hw, h: hh }, nl);
    }

    /** Determine which quadrant an object belongs to (-1 = none / straddles). */
    _getIndex(px, pz) {
      const { x, z, w, h } = this.bounds;
      const mx = x + w / 2, mz = z + h / 2;
      const top    = pz < mz;
      const bottom = pz >= mz;
      const left   = px < mx;
      const right  = px >= mx;
      if (right && top)    return 0;
      if (left  && top)    return 1;
      if (left  && bottom) return 2;
      if (right && bottom) return 3;
      return -1;
    }

    /**
     * Insert an entity (requires entity.mesh.position with .x / .z).
     * @param {object} entity
     */
    insert(entity) {
      const pos = entity.mesh.position;
      const px = pos.x, pz = pos.z;

      // Delegate to child if possible
      if (this.nodes.length > 0) {
        const idx = this._getIndex(px, pz);
        if (idx !== -1) { this.nodes[idx].insert(entity); return; }
      }

      this.objects.push(entity);

      // Split and redistribute
      if (this.objects.length > QT_MAX_OBJECTS && this.level < QT_MAX_LEVELS) {
        if (this.nodes.length === 0) this._split();

        let i = 0;
        while (i < this.objects.length) {
          const o  = this.objects[i];
          const op = o.mesh.position;
          const idx = this._getIndex(op.x, op.z);
          if (idx !== -1) {
            this.objects.splice(i, 1);
            this.nodes[idx].insert(o);
          } else {
            i++;
          }
        }
      }
    }

    /**
     * Retrieve all entities within a radius of (cx, cz).
     * @param {number} cx
     * @param {number} cz
     * @param {number} radius
     * @param {Array}  [results]
     * @returns {Array}
     */
    queryRadius(cx, cz, radius, results) {
      if (!results) results = [];
      const rSq = radius * radius;

      // Check own objects
      for (let i = 0, len = this.objects.length; i < len; i++) {
        const o   = this.objects[i];
        const pos = o.mesh.position;
        const dx  = pos.x - cx, dz = pos.z - cz;
        if (dx * dx + dz * dz <= rSq) results.push(o);
      }

      // Recurse into relevant children
      if (this.nodes.length > 0) {
        for (let i = 0; i < 4; i++) {
          const b = this.nodes[i].bounds;
          // AABB-circle overlap test
          const nearX = Math.max(b.x, Math.min(cx, b.x + b.w));
          const nearZ = Math.max(b.z, Math.min(cz, b.z + b.h));
          const dxN = nearX - cx, dzN = nearZ - cz;
          if (dxN * dxN + dzN * dzN <= rSq) {
            this.nodes[i].queryRadius(cx, cz, radius, results);
          }
        }
      }
      return results;
    }
  }

  // -----------------------------------------------------------------------
  // ProjectilePool — zero-alloc projectile reuse
  // -----------------------------------------------------------------------

  class ProjectilePool {
    /**
     * @param {function} createFn  Factory: () → Projectile-like object.
     * @param {function} resetFn   Reset: (obj) → void.
     * @param {number}   warmCount Pre-warm count.
     */
    constructor(createFn, resetFn, warmCount = 100) {
      this._create = createFn;
      this._reset  = resetFn;
      this._pool   = [];
      this._active  = 0;
      this._created = 0;

      for (let i = 0; i < warmCount; i++) {
        this._pool.push(this._create());
        this._created++;
      }
    }

    get() {
      this._active++;
      if (this._pool.length > 0) return this._pool.pop();
      this._created++;
      return this._create();
    }

    release(obj) {
      this._reset(obj);
      this._active = Math.max(0, this._active - 1);
      this._pool.push(obj);
    }

    stats() {
      return { active: this._active, pooled: this._pool.length, created: this._created };
    }
  }

  // -----------------------------------------------------------------------
  // DamageNumberPool — reuses DOM elements for floating text
  // -----------------------------------------------------------------------

  class DamageNumberPool {
    constructor(maxNumbers = 30) {
      this._pool = [];
      this._maxNumbers = maxNumbers;
      // Pre-create DOM elements
      for (let i = 0; i < maxNumbers; i++) {
        const el = document.createElement('div');
        el.className = 'damage-number';
        el.style.display = 'none';
        el.style.position = 'absolute';
        el.style.pointerEvents = 'none';
        el.style.zIndex = '999';
        el.style.fontWeight = 'bold';
        el.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
        el.style.willChange = 'transform, opacity';
        document.body.appendChild(el);
        this._pool.push({ el: el, inUse: false, timer: 0 });
      }
    }

    /** Acquire a damage number element. */
    get() {
      for (let i = 0; i < this._pool.length; i++) {
        if (!this._pool[i].inUse) {
          this._pool[i].inUse = true;
          this._pool[i].el.style.display = 'block';
          return this._pool[i];
        }
      }
      // All in use — recycle the oldest
      const oldest = this._pool[0];
      oldest.inUse = true;
      oldest.el.style.display = 'block';
      return oldest;
    }

    release(entry) {
      entry.inUse = false;
      entry.el.style.display = 'none';
    }
  }

  // -----------------------------------------------------------------------
  // ParticlePool — reuses THREE.Mesh particles
  // -----------------------------------------------------------------------

  class ParticlePool {
    /**
     * @param {THREE.Scene} scene
     * @param {number}      maxParticles
     */
    constructor(scene, maxParticles = 200) {
      this._scene = scene;
      this._pool  = [];
      this._max   = maxParticles;

      const sharedGeo = new THREE.SphereGeometry(0.06, 4, 4);
      const sharedMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 1, depthWrite: false
      });

      for (let i = 0; i < maxParticles; i++) {
        const mesh = new THREE.Mesh(sharedGeo, sharedMat.clone());
        mesh.visible = false;
        mesh.frustumCulled = false;
        scene.add(mesh);
        this._pool.push({ mesh: mesh, inUse: false, velocity: { x: 0, y: 0, z: 0 }, life: 0, maxLife: 1 });
      }
    }

    /** Acquire a particle from the pool. Returns null if exhausted. */
    get() {
      for (let i = 0; i < this._pool.length; i++) {
        const p = this._pool[i];
        if (!p.inUse) {
          p.inUse = true;
          p.mesh.visible = true;
          return p;
        }
      }
      // All slots in use — forcefully recycle the oldest (wrap around the pool array)
      // so the hard max is never exceeded. The recycled entry gets its state reset
      // immediately so the caller can re-initialise it.
      if (this._recycleIdx === undefined) this._recycleIdx = 0;
      const oldest = this._pool[this._recycleIdx % this._pool.length];
      this._recycleIdx = (this._recycleIdx + 1) % this._pool.length;
      // Reset to a clean state before handing back to caller
      oldest.life = 0;
      oldest.maxLife = 1;
      oldest.velocity.x = 0;
      oldest.velocity.y = 0;
      oldest.velocity.z = 0;
      oldest.mesh.scale.set(1, 1, 1);
      oldest.mesh.material.opacity = 1;
      oldest.mesh.visible = true;
      oldest.inUse = true;
      return oldest;
    }

    release(entry) {
      entry.inUse = false;
      entry.mesh.visible = false;
      entry.life = 0;
      entry.maxLife = 1;                // reset to avoid stale maxLife on re-acquire
      entry.velocity.x = 0;            // reset velocity so ghost motion can't occur
      entry.velocity.y = 0;
      entry.velocity.z = 0;
      entry.mesh.scale.set(1, 1, 1);   // reset scale (updateAll may have shrunk it)
      entry.mesh.material.opacity = 1; // reset opacity
    }

    /** Update all active particles.  Returns count of active particles. */
    updateAll(dt) {
      let count = 0;
      for (let i = 0; i < this._pool.length; i++) {
        const p = this._pool[i];
        if (!p.inUse) continue;
        count++;
        p.life += dt;
        if (p.life >= p.maxLife) {
          this.release(p);
          continue;
        }
        // Physics
        p.mesh.position.x += p.velocity.x * dt;
        p.mesh.position.y += p.velocity.y * dt;
        p.mesh.position.z += p.velocity.z * dt;
        p.velocity.y -= 9.8 * dt;  // gravity
        // Fade
        const t = p.life / p.maxLife;
        p.mesh.material.opacity = 1 - t;
        p.mesh.scale.setScalar(1 - t * 0.5);
      }
      return count;
    }
  }

  // -----------------------------------------------------------------------
  // GCGuard — utilities to minimise garbage collection during gameplay
  // -----------------------------------------------------------------------

  const GCGuard = {
    /** Pre-allocated Vector3 pool for temp calculations. */
    _vecPool: [],
    _vecIdx: 0,

    init() {
      for (let i = 0; i < 64; i++) {
        this._vecPool.push(new THREE.Vector3());
      }
    },

    /** Get a temp Vector3 (rotates through pool — do NOT store long-term). */
    tempVec3() {
      const v = this._vecPool[this._vecIdx];
      this._vecIdx = (this._vecIdx + 1) & 63; // wrap at 64
      return v;
    },

    /** Reusable array for query results. */
    _resultBuf: [],

    /** Get a reusable results array (clear before use). */
    resultArray() {
      this._resultBuf.length = 0;
      return this._resultBuf;
    }
  };

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------

  window.PerfManager = {
    QuadTree:          QuadTree,
    ProjectilePool:    ProjectilePool,
    DamageNumberPool:  DamageNumberPool,
    ParticlePool:      ParticlePool,
    GCGuard:           GCGuard
  };
})();
