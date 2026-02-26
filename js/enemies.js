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
  MINI_BOSS:    10, // Large dodecahedron — boss with armor, scaling HP
  FLYING_BOSS:  11, // Lvl-15 giant flying boss — oversized, unique behavior
  BUG_RANGED:   12, // Bug/water-being with eyes — ranged variant
  BUG_SLOW:     13, // Bug/water-being with eyes — slow, high HP variant
  BUG_FAST:     14  // Bug/water-being with eyes — fast, low HP variant
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

  if (type === 0) {           // Tank — charges, tries to cut off player
    stats.hp    = 100 * levelScaling;
    stats.speed = speedBase * 1.2;
    stats.aiBehavior = 'interceptor'; // Predicts player movement
  } else if (type === 1) {    // Fast — flanker, zigzags around player
    stats.hp    = 30  * levelScaling;
    stats.speed = speedBase * 2.8;
    stats.aiBehavior = 'flanker'; // Approaches from sides/behind
  } else if (type === 2) {    // Balanced — pack hunter, coordinates with others
    stats.hp    = 60  * levelScaling;
    stats.speed = speedBase * 1.8;
    stats.aiBehavior = 'pack'; // Spreads out, surrounds player
  } else if (type === 3) {    // Slowing — ambusher, hides then rushes
    stats.hp           = 75 * levelScaling;
    stats.speed        = speedBase * 1.6;
    stats.slowDuration = 2000;
    stats.slowAmount   = 0.5;
    stats.aiBehavior = 'ambusher'; // Waits then dashes in
  } else if (type === 4) {    // Ranged — kiter, maintains distance smartly
    stats.hp             = 50 * levelScaling;
    stats.speed          = speedBase * 1.4;
    stats.attackRange    = 8;
    stats.projectileSpeed = 0.15;
    stats.aiBehavior = 'kiter'; // Retreats when player approaches
  } else if (type === 5) {    // Flying — dive bomber, swoops in and out
    stats.hp       = 60 * levelScaling;
    stats.speed    = speedBase * 2.4;
    stats.isFlying = true;
    stats.aiBehavior = 'divebomber'; // Dives at player then retreats
  } else if (type === 6) {    // Hard Tank — interceptor with prediction
    stats.hp    = 180 * levelScaling;
    stats.speed = speedBase * 1.3;
    stats.aiBehavior = 'interceptor';
  } else if (type === 7) {    // Hard Fast — aggressive flanker
    stats.hp    = 55  * levelScaling;
    stats.speed = speedBase * 3.2;
    stats.aiBehavior = 'flanker';
  } else if (type === 8) {    // Hard Balanced — pack leader
    stats.hp    = 110 * levelScaling;
    stats.speed = speedBase * 2.0;
    stats.aiBehavior = 'pack';
  } else if (type === 9) {    // Elite — stalker, waits for openings
    stats.hp    = 200 * levelScaling;
    stats.speed = speedBase * 1.8;
    stats.aiBehavior = 'stalker'; // Circles then strikes when player is busy
  } else if (type === 10) {   // MiniBoss
    const miniBossStartLevel = 10;
    stats.hp         = 1000 * (1 + (playerLevel - miniBossStartLevel) * MINI_BOSS_HP_SCALING_RATE);
    stats.speed      = speedBase * 1.0;
    stats.isMiniBoss = true;
    stats.armor      = 0.25;
    stats.aiBehavior = 'interceptor';
  } else if (type === 11) {   // Flying Boss (level 15) — giant airborne boss
    const flyingBossStartLevel = 15;
    stats.hp          = 2500 * (1 + Math.max(0, playerLevel - flyingBossStartLevel) * MINI_BOSS_HP_SCALING_RATE);
    stats.speed       = speedBase * 1.4;
    stats.isFlying    = true;
    stats.isFlyingBoss = true;
    stats.armor       = 0.30;
    stats.attackRange = 12;
    stats.projectileSpeed = 0.18;
    stats.aiBehavior = 'divebomber';
  } else if (type === 12) {   // Bug Ranged — kiting ranged attacker
    stats.hp             = 45 * levelScaling;
    stats.speed          = speedBase * 1.5;
    stats.isBug          = true;
    stats.attackRange    = 10;
    stats.projectileSpeed = 0.14;
    stats.aiBehavior = 'kiter';
  } else if (type === 13) {   // Bug Slow — armoured interceptor
    stats.hp    = 140 * levelScaling;
    stats.speed = speedBase * 0.9;
    stats.isBug = true;
    stats.armor = 0.15;
    stats.aiBehavior = 'interceptor';
  } else if (type === 14) {   // Bug Fast — fast dive bomber
    stats.hp       = 25 * levelScaling;
    stats.speed    = speedBase * 3.4;
    stats.isBug    = true;
    stats.isFlying = true;
    stats.aiBehavior = 'divebomber';
  }

  stats.maxHp  = stats.hp;
  // Elite does 1.5× base damage; MiniBoss/FlyingBoss have their own values
  stats.damage = (type === 9 ? 50 * 1.5 : 50) * levelScaling;
  if (type === 10) stats.damage = 75 * levelScaling;
  if (type === 11) stats.damage = 100 * levelScaling; // Flying Boss hits hard
  if (type === 12) stats.damage = 35 * levelScaling;  // Bug Ranged — moderate
  if (type === 13) stats.damage = 65 * levelScaling;  // Bug Slow — heavy melee
  if (type === 14) stats.damage = 20 * levelScaling;  // Bug Fast — light but rapid

  return stats;
}

window.GameEnemies = {
  ENEMY_TYPES,
  getEnemyBaseStats
};
