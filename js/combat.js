// --- COMBAT CALCULATIONS ---
// Extracted from game.js - loaded as a regular script before game.js (module)
// Exposes window.GameCombat for use by game.js

/**
 * Apply player-armor reduction to incoming damage.
 * Mirrors the inline formula previously in Player.takeDamage().
 *
 * @param {number} amount      - Raw incoming damage
 * @param {number} armorPercent - Player armor as a percentage (0–100)
 * @returns {number} Reduced damage (minimum 1)
 */
function calculateArmorReduction(amount, armorPercent) {
  if (!amount || amount <= 0) return 0; // No phantom damage from zero/negative inputs
  return Math.max(1, amount * (1 - armorPercent / 100));
}

/**
 * Apply enemy armor reduction (fraction-based, used by MiniBoss).
 * Mirrors the inline formula previously in Enemy.takeDamage().
 *
 * @param {number} amount        - Raw incoming damage
 * @param {number} armorFraction - Armor as a fraction (0.0–1.0)
 * @returns {number} Reduced damage
 */
function calculateEnemyArmorReduction(amount, armorFraction) {
  return amount * (1 - armorFraction);
}

// ---------------------------------------------------------------------------
// Spatial-hash-accelerated collision helpers
// ---------------------------------------------------------------------------
// These replace O(N) full-array scans with O(1) grid lookups when
// window._enemySpatialHash is available (built each frame in game-loop.js).

/**
 * Find the nearest alive enemy within `range` of the point (x, z).
 * Uses the spatial hash when available; falls back to a linear scan.
 *
 * @param {number} x         - World X position to search from.
 * @param {number} z         - World Z position to search from.
 * @param {number} rangeSq   - Squared search range.
 * @param {Array}  enemies   - Full enemies array (fallback).
 * @returns {{ enemy: object|null, distSq: number }}
 */
function findNearestEnemySH(x, z, rangeSq, enemies) {
  // SpatialHash.query() requires a linear radius; sqrt is called once per weapon fire, not per frame.
  const range = Math.sqrt(rangeSq);
  const candidates = window._enemySpatialHash
    ? window._enemySpatialHash.query(x, z, range)
    : enemies;

  let best = null;
  let bestDSq = rangeSq;
  for (let i = 0, len = candidates.length; i < len; i++) {
    const e = candidates[i];
    if (e.isDead) continue;
    const dx = e.mesh.position.x - x;
    const dz = e.mesh.position.z - z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDSq) { bestDSq = dSq; best = e; }
  }
  return { enemy: best, distSq: bestDSq };
}

/**
 * Call `callback(enemy, distSq)` for every alive enemy within `rangeSq`
 * of the point (x, z).  Uses the spatial hash when available.
 *
 * @param {number}   x        - World X.
 * @param {number}   z        - World Z.
 * @param {number}   rangeSq  - Squared search range.
 * @param {Array}    enemies  - Full enemies array (fallback).
 * @param {Function} callback - Invoked with (enemy, distSq).
 */
function forEachEnemyInRangeSH(x, z, rangeSq, enemies, callback) {
  // SpatialHash.query() requires a linear radius; sqrt is called once per weapon fire, not per frame.
  const range = Math.sqrt(rangeSq);
  const candidates = window._enemySpatialHash
    ? window._enemySpatialHash.query(x, z, range)
    : enemies;

  for (let i = 0, len = candidates.length; i < len; i++) {
    const e = candidates[i];
    if (e.isDead) continue;
    const dx = e.mesh.position.x - x;
    const dz = e.mesh.position.z - z;
    const dSq = dx * dx + dz * dz;
    if (dSq <= rangeSq) callback(e, dSq);
  }
}

window.GameCombat = {
  calculateArmorReduction,
  calculateEnemyArmorReduction,
  findNearestEnemySH,
  forEachEnemyInRangeSH
};
