// js/object-pool.js — Global ObjectPool for reusable Three.js meshes.
// Eliminates GC pressure from frequent geometry/material disposal during combat.
// Exposed as window.GameObjectPool — loaded before projectile-classes.js and game-loop.js.
//
// CRITICAL: Does NOT remove or alter geometries/materials. Meshes are hidden and
// returned to the pool instead of being disposed, eliminating GC stutter spikes.

window.GameObjectPool = (function () {
  'use strict';

  // ── Bullet Trail Pool ─────────────────────────────────────────────────────
  // Tiny sphere meshes dropped every 3 frames by each active projectile.
  // Previously: new SphereGeometry + new MeshBasicMaterial + dispose() every 150ms.
  // Now: a fixed set of meshes is reused — geometry/material live for the session.

  const _trailPool   = [];
  const TRAIL_POOL_MAX = 150; // supports ~16 simultaneous bullets firing at max rate

  function _makeTrailMesh() {
    const geo  = new THREE.SphereGeometry(0.035, 4, 4);
    const mat  = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, color: 0xffffff });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    return { mesh };
  }

  /**
   * Acquire a trail dot mesh from the pool (or create one if the pool is empty).
   * @param {number} color  - Hex colour (e.g. 0xFF2200 or bullet colour).
   * @param {THREE.Vector3} position - World position for this frame.
   * @returns {{ mesh: THREE.Mesh }}
   */
  function getTrail(color, position) {
    const entry = _trailPool.pop() || _makeTrailMesh();
    entry.mesh.material.color.setHex(color);
    entry.mesh.material.opacity = 0.55;
    entry.mesh.position.copy(position);
    entry.mesh.visible = true;
    return entry;
  }

  /**
   * Return a trail dot back to the pool.  geometry/material are NOT disposed.
   * @param {{ mesh: THREE.Mesh }} entry
   */
  function releaseTrail(entry) {
    entry.mesh.visible = false;
    if (_trailPool.length < TRAIL_POOL_MAX) {
      _trailPool.push(entry);
    }
    // If the pool is already full the mesh is simply orphaned (no dispose).
    // The THREE.js GC cost for a single abandoned mesh is negligible and
    // happens far less often than the constant create/dispose cycle it replaces.
  }

  // ── Meat Chunk Pool ───────────────────────────────────────────────────────
  // Flying gore pieces created on shotgun/explosive deaths (30 chunks per kill).
  // Previously: new geometry + new material, then geo.dispose() + mat.dispose()
  // after the ~1.5-2 second flight animation.
  // Now: chunks are removed from the scene but held in the pool, then reused.

  const _chunkPool     = [];
  const CHUNK_POOL_MAX  = 180; // 6 simultaneous shotgun deaths × 30 chunks each
  const CHUNK_RETURN_DELAY_MS = 5000; // wait 5 s after animation ends before pooling

  function _makeChunkEntry(isBox, size, color) {
    const geo  = isBox
      ? new THREE.BoxGeometry(size * 1.2, size * 0.8, size)
      : new THREE.SphereGeometry(size, 5, 4);
    const mat  = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    return { mesh, geo, mat };
  }

  /**
   * Acquire a chunk entry from the pool.  If the pool is empty a new mesh is created.
   * @param {boolean} isBox       - true → BoxGeometry, false → SphereGeometry.
   * @param {number}  size        - Base size (radius / half-extent) of the chunk.
   * @param {number}  color       - Hex colour.
   * @param {THREE.Vector3} position - Initial world position.
   * @returns {{ mesh: THREE.Mesh, geo: THREE.BufferGeometry, mat: THREE.Material }}
   */
  function getChunk(isBox, size, color, position) {
    const entry = _chunkPool.pop() || _makeChunkEntry(isBox, size, color);
    entry.mat.color.setHex(color);
    entry.mat.opacity = 0.95;
    entry.mesh.position.copy(position);
    entry.mesh.rotation.set(0, 0, 0);
    entry.mesh.scale.setScalar(1);
    entry.mesh.visible = true;
    return entry;
  }

  /**
   * Return a chunk to the pool after a 5-second delay so GC work is deferred
   * away from the busy death-animation window.  geometry/material are NOT disposed.
   * @param {{ mesh: THREE.Mesh, geo, mat }} entry
   */
  function releaseChunk(entry) {
    entry.mesh.visible = false;
    setTimeout(function () {
      if (_chunkPool.length < CHUNK_POOL_MAX) {
        _chunkPool.push(entry);
      }
    }, CHUNK_RETURN_DELAY_MS);
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  /** Pre-warm the trail pool so the first firefight has no allocation cost. */
  function prewarm() {
    const TRAIL_PREWARM = 40;
    for (let i = _trailPool.length; i < TRAIL_PREWARM; i++) {
      _trailPool.push(_makeTrailMesh());
    }
  }

  return {
    getTrail,
    releaseTrail,
    getChunk,
    releaseChunk,
    prewarm,
    get trailPoolSize()  { return _trailPool.length;  },
    get chunkPoolSize()  { return _chunkPool.length;  }
  };
}());
