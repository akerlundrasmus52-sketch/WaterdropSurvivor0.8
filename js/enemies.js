// --- ENEMY DEFINITIONS ---
// Extracted from game.js - loaded as a regular script before game.js (module)
// Exposes window.GameEnemies for use by game.js

// Numeric constants for every enemy type (matches the Enemy constructor switch).
const ENEMY_TYPES = {
  TANK:         0,  // Bacteria/Amoeba  — squishy blob,    high HP, slow
  FAST:         1,  // Water Bug        — elongated,        low HP,  fast
  BALANCED:     2,  // Microbe          — round,            mid HP,  mid speed
  SLOWING:      3,  // Spiky/icy        — slows player on hit
  RANGED:       4,  // Tetrahedron      — stays at range, fires projectiles
  FLYING:       5,  // Octahedron       — airborne, fast
  HARD_TANK:    6,  // Deformed sphere  — very high HP, slow
  HARD_FAST:    7,  // Capsule          — high speed variant of FAST
  HARD_BALANCED:8,  // Dodecahedron     — stronger balanced variant
  ELITE:        9,  // Icosahedron      — elite, does 1.5× damage
  MINI_BOSS:    10  // Large dodecahedron — boss with armor, scaling HP
};

const MINI_BOSS_HP_SCALING_RATE = 0.15; // 15% HP increase per player level above start

/**
 * Returns base stats for an enemy given its type and scaling context.
 * The returned plain object is Object.assign-ed onto the Enemy instance in
 * game.js, replacing the large if-else stat block that was previously inline.
 *
 * @param {number} type         - Enemy type constant (see ENEMY_TYPES)
 * @param {number} levelScaling - Scaling multiplier: 1 + (playerLevel - 1) * 0.15
 * @param {number} speedBase    - GAME_CONFIG.enemySpeedBase from game.js
 * @param {number} playerLevel  - Current player level (used for MiniBoss HP only)
 * @returns {Object} Stat properties to merge onto the Enemy instance
 */
function getEnemyBaseStats(type, levelScaling, speedBase, playerLevel) {
  const stats = {};

  if (type === 0) {           // Tank
    stats.hp    = 100 * levelScaling;
    stats.speed = speedBase * 0.6;
  } else if (type === 1) {    // Fast
    stats.hp    = 30  * levelScaling;
    stats.speed = speedBase * 1.6;
  } else if (type === 2) {    // Balanced
    stats.hp    = 60  * levelScaling;
    stats.speed = speedBase;
  } else if (type === 3) {    // Slowing
    stats.hp           = 75 * levelScaling;
    stats.speed        = speedBase * 0.8;
    stats.slowDuration = 2000;
    stats.slowAmount   = 0.5;
  } else if (type === 4) {    // Ranged
    stats.hp             = 50 * levelScaling;
    stats.speed          = speedBase * 0.7;
    stats.attackRange    = 8;
    stats.projectileSpeed = 0.15;
  } else if (type === 5) {    // Flying
    stats.hp       = 60 * levelScaling;
    stats.speed    = speedBase * 1.3;
    stats.isFlying = true;
  } else if (type === 6) {    // Hard Tank
    stats.hp    = 180 * levelScaling;
    stats.speed = speedBase * 0.65;
  } else if (type === 7) {    // Hard Fast
    stats.hp    = 55  * levelScaling;
    stats.speed = speedBase * 1.8;
  } else if (type === 8) {    // Hard Balanced
    stats.hp    = 110 * levelScaling;
    stats.speed = speedBase * 1.1;
  } else if (type === 9) {    // Elite
    stats.hp    = 200 * levelScaling;
    stats.speed = speedBase * 0.9;
  } else if (type === 10) {   // MiniBoss
    const miniBossStartLevel = 10;
    stats.hp         = 1000 * (1 + (playerLevel - miniBossStartLevel) * MINI_BOSS_HP_SCALING_RATE);
    stats.speed      = speedBase * 0.5;
    stats.isMiniBoss = true;
    stats.armor      = 0.25; // 25% damage reduction
  }

  stats.maxHp  = stats.hp;
  // Elite does 1.5× base damage; MiniBoss has its own value
  stats.damage = (type === 9 ? 50 * 1.5 : 50) * levelScaling;
  if (type === 10) stats.damage = 75 * levelScaling;

  return stats;
}

window.GameEnemies = {
  ENEMY_TYPES,
  getEnemyBaseStats
};
