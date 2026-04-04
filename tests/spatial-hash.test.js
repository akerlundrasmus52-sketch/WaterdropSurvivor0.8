/**
 * Tests for js/spatial-hash.js
 *
 * spatial-hash.js is a plain browser script that exposes window.GamePerformance,
 * containing SpatialHash, AnimationThrottle, and EnhancedObjectPool.
 */

beforeAll(() => {
  require('../js/spatial-hash.js');
});

// Helper to create a mock entity at (x, z)
function makeEntity(x, z, id) {
  return { id, mesh: { position: { x, z } } };
}

// ---------------------------------------------------------------------------
// SpatialHash
// ---------------------------------------------------------------------------
describe('SpatialHash', () => {
  let SpatialHash;

  beforeAll(() => {
    SpatialHash = window.GamePerformance.SpatialHash;
  });

  test('exposes SpatialHash on window.GamePerformance', () => {
    expect(SpatialHash).toBeDefined();
  });

  // --- constructor ---
  describe('constructor', () => {
    test('uses supplied cellSize', () => {
      const sh = new SpatialHash(10);
      expect(sh.cellSize).toBe(10);
    });

    test('defaults cellSize to 4', () => {
      const sh = new SpatialHash();
      expect(sh.cellSize).toBe(4);
    });

    test('invCellSize is 1/cellSize', () => {
      const sh = new SpatialHash(5);
      expect(sh.invCellSize).toBeCloseTo(0.2);
    });

    test('starts with empty cells', () => {
      const sh = new SpatialHash(4);
      expect(Object.keys(sh.cells)).toHaveLength(0);
    });
  });

  // --- _hashKey ---
  describe('_hashKey', () => {
    test('produces a deterministic string key', () => {
      const sh = new SpatialHash(4);
      expect(sh._hashKey(3, 5)).toBe('3,5');
      expect(sh._hashKey(-1, 7)).toBe('-1,7');
      expect(sh._hashKey(0, 0)).toBe('0,0');
    });

    test('different cell coords produce different keys', () => {
      const sh = new SpatialHash(4);
      expect(sh._hashKey(1, 2)).not.toBe(sh._hashKey(2, 1));
    });
  });

  // --- insert ---
  describe('insert', () => {
    test('inserts entity into the correct cell bucket', () => {
      const sh = new SpatialHash(4);
      const e = makeEntity(0, 0, 'a');
      sh.insert(e);
      expect(sh.cells['0,0']).toContain(e);
    });

    test('inserts entity at positive coordinates', () => {
      const sh = new SpatialHash(4);
      const e = makeEntity(8, 12, 'b'); // cell (2, 3)
      sh.insert(e);
      expect(sh.cells['2,3']).toContain(e);
    });

    test('inserts entity at negative coordinates', () => {
      const sh = new SpatialHash(4);
      const e = makeEntity(-4, -8, 'c'); // cell (-1, -2)
      sh.insert(e);
      expect(sh.cells['-1,-2']).toContain(e);
    });

    test('multiple entities in same cell are all stored', () => {
      const sh = new SpatialHash(4);
      const e1 = makeEntity(1, 1, 'e1');
      const e2 = makeEntity(2, 2, 'e2');
      sh.insert(e1);
      sh.insert(e2);
      const bucket = sh.cells['0,0'];
      expect(bucket).toContain(e1);
      expect(bucket).toContain(e2);
    });

    test('entities in adjacent cells occupy different buckets', () => {
      const sh = new SpatialHash(4);
      const e1 = makeEntity(1, 1, 'a');  // cell (0,0)
      const e2 = makeEntity(5, 5, 'b');  // cell (1,1)
      sh.insert(e1);
      sh.insert(e2);
      expect(Object.keys(sh.cells)).toHaveLength(2);
    });
  });

  // --- clear ---
  describe('clear', () => {
    test('empties all buckets without removing keys', () => {
      const sh = new SpatialHash(4);
      sh.insert(makeEntity(0, 0, 'a'));
      sh.insert(makeEntity(8, 8, 'b'));
      sh.clear();
      for (const key in sh.cells) {
        expect(sh.cells[key]).toHaveLength(0);
      }
    });

    test('clear on empty hash does not throw', () => {
      const sh = new SpatialHash(4);
      expect(() => sh.clear()).not.toThrow();
    });
  });

  // --- query ---
  describe('query', () => {
    test('finds entity at exact query point', () => {
      const sh = new SpatialHash(4);
      const e = makeEntity(0, 0, 'a');
      sh.insert(e);
      const result = sh.query(0, 0, 1);
      expect(result).toContain(e);
    });

    test('finds all entities within radius', () => {
      const sh = new SpatialHash(4);
      const e1 = makeEntity(0, 0, 'a');
      const e2 = makeEntity(3, 4, 'b'); // distance = 5
      const e3 = makeEntity(10, 10, 'c'); // far away
      sh.insert(e1);
      sh.insert(e2);
      sh.insert(e3);
      const result = sh.query(0, 0, 5);
      expect(result).toContain(e1);
      expect(result).toContain(e2);
      expect(result).not.toContain(e3);
    });

    test('excludes entities exactly outside radius', () => {
      const sh = new SpatialHash(4);
      const near = makeEntity(3, 0, 'near');  // distance = 3
      const far  = makeEntity(6, 0, 'far');   // distance = 6
      sh.insert(near);
      sh.insert(far);
      const result = sh.query(0, 0, 4);
      expect(result).toContain(near);
      expect(result).not.toContain(far);
    });

    test('returns empty array when no entities present', () => {
      const sh = new SpatialHash(4);
      const result = sh.query(0, 0, 10);
      expect(result).toHaveLength(0);
    });

    test('does not duplicate entities that span multiple candidate cells', () => {
      const sh = new SpatialHash(4);
      // Place entity right at a cell boundary so it may appear in multiple candidate cells
      const e = makeEntity(4, 4, 'boundary');
      sh.insert(e);
      const result = sh.query(4, 4, 5);
      const count = result.filter(x => x === e).length;
      expect(count).toBe(1);
    });

    test('returns results in a reused buffer (shallow check)', () => {
      const sh = new SpatialHash(4);
      sh.insert(makeEntity(0, 0, 'a'));
      const r1 = sh.query(0, 0, 5);
      const r2 = sh.query(0, 0, 5);
      // The same array reference is reused
      expect(r1).toBe(r2);
    });

    test('works with large radius covering many cells', () => {
      const sh = new SpatialHash(4);
      const entities = [];
      for (let i = 0; i < 10; i++) {
        const e = makeEntity(i * 2, 0, `e${i}`);
        sh.insert(e);
        entities.push(e);
      }
      const result = sh.query(9, 0, 50);
      entities.forEach(e => expect(result).toContain(e));
    });
  });

  // --- queryRect ---
  describe('queryRect', () => {
    test('finds entities within the rectangle', () => {
      const sh = new SpatialHash(4);
      const inside  = makeEntity(5, 5, 'inside');
      const outside = makeEntity(15, 15, 'outside');
      sh.insert(inside);
      sh.insert(outside);
      const result = sh.queryRect(0, 0, 10, 10);
      expect(result).toContain(inside);
      expect(result).not.toContain(outside);
    });

    test('includes entities on the boundary', () => {
      const sh = new SpatialHash(4);
      const corner = makeEntity(10, 10, 'corner');
      sh.insert(corner);
      const result = sh.queryRect(0, 0, 10, 10);
      expect(result).toContain(corner);
    });

    test('returns empty array for empty hash', () => {
      const sh = new SpatialHash(4);
      expect(sh.queryRect(-100, -100, 100, 100)).toHaveLength(0);
    });

    test('does not duplicate entities', () => {
      const sh = new SpatialHash(4);
      const e = makeEntity(0, 0, 'a');
      sh.insert(e);
      const result = sh.queryRect(-10, -10, 10, 10);
      expect(result.filter(x => x === e)).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// AnimationThrottle
// ---------------------------------------------------------------------------
describe('AnimationThrottle', () => {
  let AT;

  beforeEach(() => {
    // Reset to known defaults before each test
    AT = window.GamePerformance.AnimationThrottle;
    AT.configure({ near: 2500, medium: 6400, far: 10000 });
  });

  // --- getTickDivisor ---
  describe('getTickDivisor', () => {
    test('returns 1 for very close entities (distSq < near)', () => {
      expect(AT.getTickDivisor(0)).toBe(1);
      expect(AT.getTickDivisor(100)).toBe(1);
      expect(AT.getTickDivisor(2499)).toBe(1);
    });

    test('returns 2 for medium-distance entities (near <= distSq < medium)', () => {
      expect(AT.getTickDivisor(2500)).toBe(2);
      expect(AT.getTickDivisor(5000)).toBe(2);
      expect(AT.getTickDivisor(6399)).toBe(2);
    });

    test('returns 4 for far entities (medium <= distSq < far)', () => {
      expect(AT.getTickDivisor(6400)).toBe(4);
      expect(AT.getTickDivisor(8000)).toBe(4);
      expect(AT.getTickDivisor(9999)).toBe(4);
    });

    test('returns 8 for very far entities (distSq >= far)', () => {
      expect(AT.getTickDivisor(10000)).toBe(8);
      expect(AT.getTickDivisor(50000)).toBe(8);
    });
  });

  // --- shouldUpdate ---
  describe('shouldUpdate', () => {
    test('always updates close entities on every frame', () => {
      for (let frame = 0; frame < 8; frame++) {
        expect(AT.shouldUpdate(0, frame)).toBe(true);
      }
    });

    test('updates medium entities every other frame (divisor = 2)', () => {
      expect(AT.shouldUpdate(3000, 0)).toBe(true);
      expect(AT.shouldUpdate(3000, 1)).toBe(false);
      expect(AT.shouldUpdate(3000, 2)).toBe(true);
      expect(AT.shouldUpdate(3000, 3)).toBe(false);
    });

    test('updates far entities every 4th frame (divisor = 4)', () => {
      expect(AT.shouldUpdate(7000, 0)).toBe(true);
      expect(AT.shouldUpdate(7000, 1)).toBe(false);
      expect(AT.shouldUpdate(7000, 2)).toBe(false);
      expect(AT.shouldUpdate(7000, 3)).toBe(false);
      expect(AT.shouldUpdate(7000, 4)).toBe(true);
    });

    test('updates very far entities every 8th frame (divisor = 8)', () => {
      expect(AT.shouldUpdate(20000, 0)).toBe(true);
      expect(AT.shouldUpdate(20000, 7)).toBe(false);
      expect(AT.shouldUpdate(20000, 8)).toBe(true);
    });
  });

  // --- shouldUpdateStaggered ---
  describe('shouldUpdateStaggered', () => {
    test('stagger offset shifts which frames update (medium, divisor=2)', () => {
      // frame 0 + offset 0 → 0%2=0 → true
      expect(AT.shouldUpdateStaggered(3000, 0, 0)).toBe(true);
      // frame 0 + offset 1 → 1%2=1 → false
      expect(AT.shouldUpdateStaggered(3000, 0, 1)).toBe(false);
      // frame 1 + offset 1 → 2%2=0 → true
      expect(AT.shouldUpdateStaggered(3000, 1, 1)).toBe(true);
    });

    test('integer offset values are accepted (no float coercion required)', () => {
      expect(() => AT.shouldUpdateStaggered(3000, 10, 3)).not.toThrow();
    });

    test('returns boolean', () => {
      expect(typeof AT.shouldUpdateStaggered(0, 0, 0)).toBe('boolean');
    });
  });

  // --- configure ---
  describe('configure', () => {
    test('updates near threshold', () => {
      AT.configure({ near: 100 });
      expect(AT._NEAR_SQ).toBe(100);
      // distSq=50 < 100 → divisor = 1
      expect(AT.getTickDivisor(50)).toBe(1);
      // distSq=150 >= 100 but < medium → divisor = 2
      expect(AT.getTickDivisor(150)).toBe(2);
    });

    test('updates medium and far thresholds', () => {
      AT.configure({ near: 100, medium: 200, far: 300 });
      expect(AT.getTickDivisor(50)).toBe(1);
      expect(AT.getTickDivisor(150)).toBe(2);
      expect(AT.getTickDivisor(250)).toBe(4);
      expect(AT.getTickDivisor(350)).toBe(8);
    });

    test('partial config update does not affect unspecified thresholds', () => {
      AT.configure({ near: 2500, medium: 6400, far: 10000 }); // reset
      AT.configure({ far: 99999 });
      expect(AT._NEAR_SQ).toBe(2500);
      expect(AT._MEDIUM_SQ).toBe(6400);
      expect(AT._FAR_SQ).toBe(99999);
    });
  });
});

// ---------------------------------------------------------------------------
// EnhancedObjectPool
// ---------------------------------------------------------------------------
describe('EnhancedObjectPool', () => {
  let EnhancedObjectPool;

  beforeAll(() => {
    EnhancedObjectPool = window.GamePerformance.EnhancedObjectPool;
  });

  function makePool(initial = 0) {
    let counter = 0;
    const createFn = () => ({ id: counter++ });
    const resetFn = (obj) => { obj.dirty = false; };
    return { pool: new EnhancedObjectPool(createFn, resetFn, initial), counter: () => counter };
  }

  // --- constructor & prewarm ---
  describe('constructor / prewarm', () => {
    test('pre-creates the requested number of objects', () => {
      const { pool } = makePool(5);
      expect(pool._pool).toHaveLength(5);
    });

    test('tracks totalCreated after prewarm', () => {
      const { pool } = makePool(3);
      expect(pool._totalCreated).toBe(3);
    });

    test('starts with zero active objects', () => {
      const { pool } = makePool(4);
      expect(pool._activeCount).toBe(0);
    });

    test('prewarm can be called multiple times', () => {
      const { pool } = makePool(2);
      pool.prewarm(3);
      expect(pool._pool).toHaveLength(5);
      expect(pool._totalCreated).toBe(5);
    });
  });

  // --- get ---
  describe('get', () => {
    test('returns an object', () => {
      const { pool } = makePool(2);
      expect(pool.get()).toBeDefined();
    });

    test('returns pre-warmed objects before creating new ones', () => {
      const { pool } = makePool(3);
      pool.get();
      // totalCreated should still be 3 — no new allocations
      expect(pool._totalCreated).toBe(3);
    });

    test('creates a new object when pool is exhausted', () => {
      const { pool } = makePool(1);
      pool.get(); // use pre-warmed
      pool.get(); // must create a new one
      expect(pool._totalCreated).toBe(2);
    });

    test('increments activeCount on each get', () => {
      const { pool } = makePool(3);
      pool.get();
      expect(pool._activeCount).toBe(1);
      pool.get();
      expect(pool._activeCount).toBe(2);
    });

    test('reduces pooled count on each get', () => {
      const { pool } = makePool(3);
      expect(pool._pool).toHaveLength(3);
      pool.get();
      expect(pool._pool).toHaveLength(2);
      pool.get();
      expect(pool._pool).toHaveLength(1);
    });
  });

  // --- release ---
  describe('release', () => {
    test('calls resetFn on released object', () => {
      const resetFn = jest.fn();
      const pool = new EnhancedObjectPool(() => ({}), resetFn, 1);
      const obj = pool.get();
      pool.release(obj);
      expect(resetFn).toHaveBeenCalledWith(obj);
    });

    test('returns object to the pool', () => {
      const { pool } = makePool(1);
      const obj = pool.get();
      expect(pool._pool).toHaveLength(0);
      pool.release(obj);
      expect(pool._pool).toHaveLength(1);
      expect(pool._pool).toContain(obj);
    });

    test('decrements activeCount on release', () => {
      const { pool } = makePool(2);
      pool.get();
      pool.get();
      expect(pool._activeCount).toBe(2);
      const obj = pool.get();
      pool.release(obj);
      expect(pool._activeCount).toBe(2);
    });

    test('released object can be retrieved again', () => {
      const { pool } = makePool(1);
      const obj = pool.get();
      pool.release(obj);
      const obj2 = pool.get();
      expect(obj2).toBe(obj);
    });
  });

  // --- getStats ---
  describe('getStats', () => {
    test('reports correct stats after prewarm', () => {
      const { pool } = makePool(5);
      const stats = pool.getStats();
      expect(stats.active).toBe(0);
      expect(stats.pooled).toBe(5);
      expect(stats.totalCreated).toBe(5);
    });

    test('reports correct stats after get', () => {
      const { pool } = makePool(5);
      pool.get();
      pool.get();
      const stats = pool.getStats();
      expect(stats.active).toBe(2);
      expect(stats.pooled).toBe(3);
      expect(stats.totalCreated).toBe(5);
    });

    test('reports correct stats after get + release cycle', () => {
      const { pool } = makePool(2);
      const obj = pool.get();
      pool.release(obj);
      const stats = pool.getStats();
      expect(stats.active).toBe(0);
      expect(stats.pooled).toBe(2);
      expect(stats.totalCreated).toBe(2);
    });

    test('totalCreated grows only when pool is empty', () => {
      const { pool } = makePool(1);
      pool.get();          // uses pre-warmed → totalCreated stays 1
      pool.get();          // pool empty → totalCreated becomes 2
      expect(pool.getStats().totalCreated).toBe(2);
    });
  });
});
