// js/instanced-renderer.js — Instanced rendering with THREE.InstancedMesh
// Batches draw calls for enemies, EXP-gems & projectiles to support 10x more
// entities on screen without frame drops.
//
// Loaded as a regular <script> before game-loop.js.  Exposes window.InstancedRenderer.

(function () {
  'use strict';

  // Pre-allocated temporaries (zero GC pressure)
  const _mat4  = new THREE.Matrix4();
  const _pos   = new THREE.Vector3();
  const _quat  = new THREE.Quaternion();
  const _scale = new THREE.Vector3(1, 1, 1);
  const _color = new THREE.Color();
  const _euler = new THREE.Euler();

  // -----------------------------------------------------------------------
  // InstanceBatch — wraps a single THREE.InstancedMesh for one entity type
  // -----------------------------------------------------------------------
  class InstanceBatch {
    /**
     * @param {THREE.BufferGeometry} geometry  Shared geometry for the batch.
     * @param {THREE.Material}       material  Shared material (use per-instance
     *                                         color via vertexColors / instanceColor).
     * @param {number}               maxCount  Upper bound on visible instances.
     */
    constructor(geometry, material, maxCount) {
      this.mesh = new THREE.InstancedMesh(geometry, material, maxCount);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.frustumCulled = false;
      this.mesh.castShadow   = true;
      this.mesh.receiveShadow = true;
      this.mesh.count = 0;
      this.maxCount = maxCount;
      this._count = 0;
      this._prevCount = 0;
      this._dirty = false;

      // CRITICAL FIX: Initialize instanceColor buffer for per-instance color tinting
      // Without this, setColorAt() calls are silently ignored and all instances render
      // with the base material color (white), making all enemies appear the same color.
      // This buffer stores RGB color for each instance and is used by the shader to
      // multiply against the base material color, allowing unique colors per enemy.
      const colors = new Float32Array(maxCount * 3);
      // Initialize all colors to white (1, 1, 1) so instances render normally by default
      for (let i = 0; i < maxCount * 3; i += 3) {
        colors[i] = 1.0;     // R
        colors[i + 1] = 1.0; // G
        colors[i + 2] = 1.0; // B
      }
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }

    /** Begin a new frame — reset the instance counter. */
    begin() {
      this._prevCount = this._count;
      this._count = 0;
      this._dirty = false;
    }

    /**
     * Push a single instance.
     * @param {THREE.Vector3} position
     * @param {THREE.Euler}   rotation
     * @param {THREE.Vector3} scale
     * @param {number|string} [color]  Optional per-instance tint (hex).
     */
    push(position, rotation, scale, color) {
      if (this._count >= this.maxCount) return;
      const idx = this._count++;
      this._dirty = true;

      _quat.setFromEuler(rotation);
      _mat4.compose(position, _quat, scale);
      this.mesh.setMatrixAt(idx, _mat4);

      if (color !== undefined) {
        _color.set(color);
        this.mesh.setColorAt(idx, _color);
      }
    }

    /**
     * Push from a THREE.Mesh — reads its world-transform components directly.
     */
    pushFromMesh(mesh, color) {
      if (this._count >= this.maxCount) return;
      const idx = this._count++;
      this._dirty = true;

      _pos.copy(mesh.position);
      _quat.setFromEuler(mesh.rotation);
      _scale.copy(mesh.scale);
      _mat4.compose(_pos, _quat, _scale);
      this.mesh.setMatrixAt(idx, _mat4);

      if (color !== undefined) {
        _color.set(color);
        this.mesh.setColorAt(idx, _color);
      }
    }

    /** Finish the frame — commit buffers to the GPU only if something changed. */
    end() {
      this.mesh.count = this._count;
      if (this._dirty || this._count !== this._prevCount) {
        if (this._count > 0) {
          this.mesh.instanceMatrix.needsUpdate = true;
          if (this.mesh.instanceColor) {
            this.mesh.instanceColor.needsUpdate = true;
          }
        }
      }
    }

    dispose() {
      this.mesh.geometry.dispose();
      if (this.mesh.material.dispose) this.mesh.material.dispose();
      this.mesh.dispose();
    }
  }

  // -----------------------------------------------------------------------
  // InstancedRenderer — manages batches for each entity category
  // -----------------------------------------------------------------------
  class InstancedRenderer {
    constructor() {
      /** @type {Object<string, InstanceBatch>} */
      this.batches = {};
      this._scene = null;
      this._active = false;
    }

    /**
     * Register a named batch.
     * @param {string}               key       Unique name (e.g. 'enemy_0', 'gem', 'bullet').
     * @param {THREE.BufferGeometry} geometry
     * @param {THREE.Material}       material
     * @param {number}               maxCount
     * @returns {InstanceBatch}
     */
    register(key, geometry, material, maxCount) {
      if (this.batches[key]) {
        this.batches[key].dispose();
      }
      const batch = new InstanceBatch(geometry, material, maxCount);
      this.batches[key] = batch;
      if (this._scene) {
        this._scene.add(batch.mesh);
      }
      return batch;
    }

    /** Attach all batches to a THREE.Scene. */
    attachToScene(scene) {
      this._scene = scene;
      for (const key in this.batches) {
        scene.add(this.batches[key].mesh);
      }
      this._active = true;
    }

    /** Get a batch by key. */
    getBatch(key) { return this.batches[key] || null; }

    /** Begin a new frame (call before syncing entities). */
    beginFrame() {
      for (const key in this.batches) {
        this.batches[key].begin();
      }
    }

    /** End a frame (commit all GPU buffers). */
    endFrame() {
      for (const key in this.batches) {
        this.batches[key].end();
      }
    }

    /**
     * Convenience: sync an array of entities into a named batch.
     * Each entity must have `.mesh` with `position`, `rotation`, `scale`.
     * Optionally reads `entity._instanceColor` for per-instance tinting.
     *
     * @param {string}  key       Batch key.
     * @param {Array}   entities  Entity array (enemies / gems / projectiles).
     * @param {Function} [filter] Optional filter predicate (entity → boolean).
     */
    syncEntities(key, entities, filter) {
      const batch = this.batches[key];
      if (!batch) return;

      for (let i = 0, len = entities.length; i < len; i++) {
        const e = entities[i];
        if (!e || !e.mesh) continue;
        if (filter && !filter(e)) continue;
        batch.pushFromMesh(e.mesh, e._instanceColor);
      }
    }

    /** Whether the renderer has been activated. */
    get active() { return this._active; }

    /** Clean up all GPU resources. */
    dispose() {
      for (const key in this.batches) {
        if (this._scene) {
          this._scene.remove(this.batches[key].mesh);
        }
        this.batches[key].dispose();
      }
      this.batches = {};
      this._active = false;
    }
  }

  // -----------------------------------------------------------------------
  // Shared geometries & materials for common entity types
  // Reused across all instances to prevent per-entity allocation.
  // -----------------------------------------------------------------------

  /**
   * Create shared instancing resources once THREE.js is ready.
   * Call this from init() after scene creation.
   * @param {THREE.Scene} scene
   * @returns {InstancedRenderer}
   */
  function createInstancedRenderer(scene) {
    const ir = new InstancedRenderer();
    const enemyInstancingEnabled = window.ENEMY_INSTANCING_ENABLED === true;

    if (enemyInstancingEnabled) {
      // --- Enemy batches (one per common enemy geometry) ---------
      // Type 0 — Tank (sphere)
      // White base colour so per-instance setColorAt() renders the actual enemy colour correctly.
      // CRITICAL: Use MeshPhongMaterial with emissive properties to match enemy-class.js
      // Without emissive, enemies appear washed out and lose their characteristic glow.
      ir.register('enemy_tank',
        new THREE.SphereGeometry(0.6, 8, 8),
        new THREE.MeshPhongMaterial({
          color: 0xFFFFFF,
          emissive: 0xFFFFFF,
          emissiveIntensity: 0.15,
          shininess: 40
        }),
        500
      );

      // Type 1 — Fast (capsule)
      ir.register('enemy_fast',
        new THREE.CapsuleGeometry(0.3, 0.8, 6, 8),
        new THREE.MeshPhongMaterial({
          color: 0xFFFFFF,
          emissive: 0xFFFFFF,
          emissiveIntensity: 0.15,
          shininess: 40
        }),
        500
      );

      // Type 2 — Balanced (dodecahedron)
      ir.register('enemy_balanced',
        new THREE.DodecahedronGeometry(0.5, 0),
        new THREE.MeshPhongMaterial({
          color: 0xFFFFFF,
          emissive: 0xFFFFFF,
          emissiveIntensity: 0.15,
          shininess: 40
        }),
        500
      );

      // Eye batch — renders two white spheres per instanced enemy (left + right eye).
      // White base colour matches the sclera; irides/pupils are baked into the shared geometry
      // for simplicity.  Rendered as a separate InstancedMesh so the body InstancedMesh
      // doesn't need to carry the eye geometry.
      // Capacity: up to 500 of each type (tank/fast/balanced) = 1500 enemies × 2 eyes = 3000 slots.
      ir.register('enemy_eye',
        new THREE.SphereGeometry(0.07, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xFFFFFF }),
        3000
      );
    }

    // --- EXP Gem batch ----------------------------------------
    const starShape = new THREE.Shape();
    const outerR = 0.18, innerR = 0.08, points = 5;
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      if (i === 0) starShape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
      else starShape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    starShape.closePath();

    ir.register('exp_gem',
      new THREE.ExtrudeGeometry(starShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x003322, roughness: 0.3, metalness: 0.6 }),
      1000
    );

    // --- Projectile batch (bullets) ---------------------------
    ir.register('bullet',
      new THREE.SphereGeometry(0.08, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0x886600, roughness: 0.2, metalness: 0.5 }),
      2000
    );

    ir.register('bullet_glow',
      new THREE.SphereGeometry(0.18, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffff88, transparent: true, opacity: 0.35, depthWrite: false }),
      2000
    );

    // --- Static world prop batches (rocks & trees) -------------------
    // Single-unit geometry; scale is set per-instance via push().

    // Rock batches — two materials for gray/dark variation
    ir.register('rock_gray',
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9, metalness: 0.1 }),
      200
    );
    ir.register('rock_dark',
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.95, metalness: 0.05 }),
      200
    );

    // Tree batches — trunk, three leaf variants (cone, round, pine)
    ir.register('tree_trunk',
      new THREE.CylinderGeometry(0.5, 0.7, 2, 6),
      new THREE.MeshToonMaterial({ color: 0x8B4513 }),
      300
    );
    ir.register('tree_leaves_cone',
      new THREE.ConeGeometry(2.5, 5, 8),
      new THREE.MeshToonMaterial({ color: 0x2d6e14 }),
      150
    );
    ir.register('tree_leaves_sphere',
      new THREE.SphereGeometry(2, 8, 8),
      new THREE.MeshToonMaterial({ color: 0x90EE90 }),
      100
    );
    ir.register('tree_leaves_pine',
      new THREE.ConeGeometry(2, 6, 6),
      new THREE.MeshToonMaterial({ color: 0x228B22 }),
      100
    );

    ir.attachToScene(scene);
    return ir;
  }

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------
  window.InstancedRenderer = {
    InstanceBatch:           InstanceBatch,
    InstancedRenderer:       InstancedRenderer,
    createInstancedRenderer: createInstancedRenderer
  };
})();
