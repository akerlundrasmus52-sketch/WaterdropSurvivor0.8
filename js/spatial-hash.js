// spatial-hash.js — Performance utilities: spatial hashing, animation throttle, object pooling

/**
 * Spatial hash grid for O(1) proximity queries.
 * Divides the world into fixed-size cells and bins entities for fast
 * neighbour lookups instead of brute-force O(N²) distance checks.
 */
class SpatialHash {
  /**
   * @param {number} cellSize - Width/height of each cell in world units.
   */
  constructor(cellSize = 4) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    /** @type {Object<string, Array>} */
    this.cells = {};
    /** Shared result array reused across queries to avoid allocations. */
    this._resultBuffer = [];
    /** Set used to deduplicate multi-cell query results. */
    this._seen = new Set();
  }

  /**
   * Convert cell coordinates to a hash-map key.
   * @param {number} cx - Cell x index.
   * @param {number} cz - Cell z index.
   * @returns {string}
   */
  _hashKey(cx, cz) {
    return cx + ',' + cz;
  }

  /** Remove all entities from every cell. */
  clear() {
    const cells = this.cells;
    for (const key in cells) {
      cells[key].length = 0;
    }
  }

  /**
   * Insert an entity into the grid.
   * The entity must expose `mesh.position.x` and `mesh.position.z`
   * (standard THREE.js Mesh layout).
   * @param {object} entity
   */
  insert(entity) {
    const pos = entity.mesh.position;
    const cx = (pos.x * this.invCellSize) | 0;
    const cz = (pos.z * this.invCellSize) | 0;
    const key = this._hashKey(cx, cz);
    const bucket = this.cells[key];
    if (bucket) {
      bucket.push(entity);
    } else {
      this.cells[key] = [entity];
    }
  }

  /**
   * Return all entities whose cell is within `radius` of the point (x, z).
   * The returned array is **reused** between calls — copy it if you need
   * to keep the results.
   * @param {number} x - World x coordinate.
   * @param {number} z - World z coordinate.
   * @param {number} radius - Search radius in world units.
   * @returns {Array<object>}
   */
  query(x, z, radius) {
    const results = this._resultBuffer;
    results.length = 0;
    const seen = this._seen;
    seen.clear();

    const inv = this.invCellSize;
    const minCX = ((x - radius) * inv) | 0;
    const maxCX = ((x + radius) * inv) | 0;
    const minCZ = ((z - radius) * inv) | 0;
    const maxCZ = ((z + radius) * inv) | 0;

    const radiusSq = radius * radius;
    const cells = this.cells;

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const bucket = cells[this._hashKey(cx, cz)];
        if (!bucket) continue;
        for (let i = 0, len = bucket.length; i < len; i++) {
          const e = bucket[i];
          if (seen.has(e)) continue;
          seen.add(e);
          const pos = e.mesh.position;
          const dx = pos.x - x;
          const dz = pos.z - z;
          if (dx * dx + dz * dz <= radiusSq) {
            results.push(e);
          }
        }
      }
    }
    return results;
  }

  /**
   * Return all entities inside the given axis-aligned rectangle.
   * The returned array is **reused** between calls.
   * @param {number} minX
   * @param {number} minZ
   * @param {number} maxX
   * @param {number} maxZ
   * @returns {Array<object>}
   */
  queryRect(minX, minZ, maxX, maxZ) {
    const results = this._resultBuffer;
    results.length = 0;
    const seen = this._seen;
    seen.clear();

    const inv = this.invCellSize;
    const minCX = (minX * inv) | 0;
    const maxCX = (maxX * inv) | 0;
    const minCZ = (minZ * inv) | 0;
    const maxCZ = (maxZ * inv) | 0;

    const cells = this.cells;

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const bucket = cells[this._hashKey(cx, cz)];
        if (!bucket) continue;
        for (let i = 0, len = bucket.length; i < len; i++) {
          const e = bucket[i];
          if (seen.has(e)) continue;
          seen.add(e);
          const pos = e.mesh.position;
          if (pos.x >= minX && pos.x <= maxX && pos.z >= minZ && pos.z <= maxZ) {
            results.push(e);
          }
        }
      }
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Animation Throttle — reduce update frequency for distant entities
// ---------------------------------------------------------------------------

/** Default squared-distance LOD thresholds matching game-loop.js (50², 80², 100²). */
const LOD_DEFAULTS = { near: 2500, medium: 6400, far: 10000 };

const AnimationThrottle = {
  /** Distance² thresholds — assign new values to tune at runtime. */
  _NEAR_SQ:    LOD_DEFAULTS.near,
  _MEDIUM_SQ:  LOD_DEFAULTS.medium,
  _FAR_SQ:     LOD_DEFAULTS.far,

  /**
   * Override the default LOD distance thresholds.
   * @param {{ near?: number, medium?: number, far?: number }} thresholds
   *   Squared distances for each LOD band boundary.
   */
  configure(thresholds) {
    if (thresholds.near   !== undefined) this._NEAR_SQ   = thresholds.near;
    if (thresholds.medium !== undefined) this._MEDIUM_SQ = thresholds.medium;
    if (thresholds.far    !== undefined) this._FAR_SQ    = thresholds.far;
  },

  /**
   * Return a tick divisor (1, 2, 4, or 8) based on squared distance from
   * the camera.  Entities farther away can safely skip frames.
   * @param {number} distSq - Squared distance from camera/player.
   * @returns {number} Divisor — entity should update when `frameCount % divisor === 0`.
   */
  getTickDivisor(distSq) {
    if (distSq < this._NEAR_SQ)   return 1;
    if (distSq < this._MEDIUM_SQ) return 2;
    if (distSq < this._FAR_SQ)    return 4;
    return 8;
  },

  /**
   * Convenience check: should this entity be updated on the current frame?
   * @param {number} distSq    - Squared distance from camera/player.
   * @param {number} frameCount - Monotonically increasing frame counter.
   * @returns {boolean}
   */
  shouldUpdate(distSq, frameCount) {
    return (frameCount % this.getTickDivisor(distSq)) === 0;
  },

  /**
   * Staggered variant: uses a per-entity offset to spread updates evenly
   * across frames within each LOD band, preventing burst-frame processing
   * that occurs when all distant enemies update on the same frame.
   * @param {number} distSq     - Squared distance from camera/player.
   * @param {number} frameCount - Monotonically increasing frame counter.
   * @param {number} offset     - Per-entity integer offset (e.g. entity array index).
   *   The offset is used directly as `(frameCount + offset) % divisor`, so the
   *   caller does not need to pre-apply a modulo — any integer works.
   * @returns {boolean}
   */
  shouldUpdateStaggered(distSq, frameCount, offset) {
    const div = this.getTickDivisor(distSq);
    return ((frameCount + (offset | 0)) % div) === 0;
  }
};

// ---------------------------------------------------------------------------
// Enhanced Object Pool — generic pool with pre-warming and diagnostics
// ---------------------------------------------------------------------------

/**
 * Generic object pool that avoids repeated allocations during gameplay.
 */
class EnhancedObjectPool {
  /**
   * @param {function(): object} createFn  - Factory that produces a new object.
   * @param {function(object): void} resetFn - Called when an object is returned to reset its state.
   * @param {number} initialSize - Number of objects to pre-create.
   */
  constructor(createFn, resetFn, initialSize = 50) {
    this._createFn = createFn;
    this._resetFn = resetFn;
    /** @type {Array<object>} */
    this._pool = [];
    this._activeCount = 0;
    this._totalCreated = 0;

    this.prewarm(initialSize);
  }

  /**
   * Pre-create objects so they are ready when needed.
   * @param {number} count
   */
  prewarm(count) {
    for (let i = 0; i < count; i++) {
      this._pool.push(this._createFn());
      this._totalCreated++;
    }
  }

  /**
   * Retrieve an object from the pool, or create a new one if empty.
   * @returns {object}
   */
  get() {
    this._activeCount++;
    if (this._pool.length > 0) {
      return this._pool.pop();
    }
    this._totalCreated++;
    return this._createFn();
  }

  /**
   * Return an object to the pool after use.  `resetFn` is called to
   * restore it to a clean state.
   * @param {object} obj
   */
  release(obj) {
    this._resetFn(obj);
    this._activeCount--;
    this._pool.push(obj);
  }

  /**
   * Snapshot of pool utilisation.
   * @returns {{ active: number, pooled: number, totalCreated: number }}
   */
  getStats() {
    return {
      active: this._activeCount,
      pooled: this._pool.length,
      totalCreated: this._totalCreated
    };
  }
}

// ---------------------------------------------------------------------------
// Global export
// ---------------------------------------------------------------------------

window.GamePerformance = {
  SpatialHash: SpatialHash,
  AnimationThrottle: AnimationThrottle,
  EnhancedObjectPool: EnhancedObjectPool,
  // QuadTree is available via window.PerfManager.QuadTree (performance-manager.js)
};
