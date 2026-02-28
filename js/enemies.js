// --- ENEMY DEFINITIONS ---
// Extracted from game.js - loaded as a regular script before game.js (module)
// Exposes window.GameEnemies for use by game.js

// Numeric constants for every enemy type (matches the Enemy constructor switch).
const ENEMY_TYPES = {
  TANK:              0,  // Bacteria/Amoeba  — squishy blob,    high HP, slow
  FAST:              1,  // Water Bug        — elongated,        low HP,  fast
  BALANCED:          2,  // Microbe          — round,            mid HP,  mid speed
  SLOWING:           3,  // Spiky/icy        — slows player on hit
  RANGED:            4,  // Tetrahedron      — stays at range, fires projectiles
  FLYING:            5,  // Octahedron       — airborne, fast
  HARD_TANK:         6,  // Deformed sphere  — very high HP, slow
  HARD_FAST:         7,  // Capsule          — high speed variant of FAST
  HARD_BALANCED:     8,  // Dodecahedron     — stronger balanced variant
  ELITE:             9,  // Icosahedron      — elite, does 1.5× damage
  MINI_BOSS:         10, // Large dodecahedron — boss with armor, scaling HP
  FLYING_BOSS:       11, // Lvl-15 giant flying boss — oversized, unique behavior
  BUG_RANGED:        12, // Bug/water-being with eyes — ranged variant
  BUG_SLOW:          13, // Bug/water-being with eyes — slow, high HP variant
  BUG_FAST:          14, // Bug/water-being with eyes — fast, low HP variant
  DADDY_LONGLEGS:    15, // Spider — small round body, huge thin legs, rears to attack, 3-hit kill
  SWEEPING_SWARM:    16  // Cluster of fast flyers that sweep side to side, 1-hit kill
};

const MINI_BOSS_HP_SCALING_RATE = 0.20; // 20% HP increase per player level above start (was 15%)

/**
 * Returns base stats for an enemy given its type and scaling context.
 * The returned plain object is Object.assign-ed onto the Enemy instance in
 * game.js, replacing the large if-else stat block that was previously inline.
 *
 * @param {number} type         - Enemy type constant (see ENEMY_TYPES)
 * @param {number} levelScaling - Scaling multiplier: 1 + (playerLevel - 1) * 0.20
 * @param {number} speedBase    - GAME_CONFIG.enemySpeedBase from game.js
 * @param {number} playerLevel  - Current player level (used for MiniBoss HP only)
 * @returns {Object} Stat properties to merge onto the Enemy instance
 */
function getEnemyBaseStats(type, levelScaling, speedBase, playerLevel) {
  const stats = {};

  if (type === 0) {           // Tank — charges, tries to cut off player
    stats.hp    = 200 * levelScaling;
    stats.speed = speedBase * 1.2;
    stats.aiBehavior = 'interceptor'; // Predicts player movement
  } else if (type === 1) {    // Fast — flanker, zigzags around player
    stats.hp    = 60  * levelScaling;
    stats.speed = speedBase * 2.8;
    stats.aiBehavior = 'flanker'; // Approaches from sides/behind
  } else if (type === 2) {    // Balanced — pack hunter, coordinates with others
    stats.hp    = 120 * levelScaling;
    stats.speed = speedBase * 1.8;
    stats.aiBehavior = 'pack'; // Spreads out, surrounds player
  } else if (type === 3) {    // Slowing — ambusher, hides then rushes
    stats.hp           = 150 * levelScaling;
    stats.speed        = speedBase * 1.6;
    stats.slowDuration = 2000;
    stats.slowAmount   = 0.5;
    stats.aiBehavior = 'ambusher'; // Waits then dashes in
  } else if (type === 4) {    // Ranged — kiter, maintains distance smartly
    stats.hp             = 100 * levelScaling;
    stats.speed          = speedBase * 1.4;
    stats.attackRange    = 8;
    stats.projectileSpeed = 0.15;
    stats.aiBehavior = 'kiter'; // Retreats when player approaches
  } else if (type === 5) {    // Flying — dive bomber, swoops in and out
    stats.hp       = 120 * levelScaling;
    stats.speed    = speedBase * 2.4;
    stats.isFlying = true;
    stats.aiBehavior = 'divebomber'; // Dives at player then retreats
  } else if (type === 6) {    // Hard Tank — interceptor with prediction
    stats.hp    = 350 * levelScaling;
    stats.speed = speedBase * 1.3;
    stats.aiBehavior = 'interceptor';
  } else if (type === 7) {    // Hard Fast — aggressive flanker
    stats.hp    = 110 * levelScaling * 1.2; // +20% HP (yellow/gold enemy)
    stats.speed = speedBase * 3.2;
    stats.aiBehavior = 'flanker';
  } else if (type === 8) {    // Hard Balanced — pack leader
    stats.hp    = 220 * levelScaling;
    stats.speed = speedBase * 2.0;
    stats.aiBehavior = 'pack';
  } else if (type === 9) {    // Elite — stalker, waits for openings
    stats.hp    = 400 * levelScaling;
    stats.speed = speedBase * 1.8;
    stats.aiBehavior = 'stalker'; // Circles then strikes when player is busy
  } else if (type === 10) {   // MiniBoss
    const miniBossStartLevel = 10;
    stats.hp         = 2000 * 1.2 * (1 + (playerLevel - miniBossStartLevel) * MINI_BOSS_HP_SCALING_RATE); // +20% HP (yellow/gold enemy)
    stats.speed      = speedBase * 1.0;
    stats.isMiniBoss = true;
    stats.armor      = 0.30;
    stats.aiBehavior = 'interceptor';
  } else if (type === 11) {   // Flying Boss (level 15) — giant airborne boss
    const flyingBossStartLevel = 15;
    stats.hp          = 5000 * (1 + Math.max(0, playerLevel - flyingBossStartLevel) * MINI_BOSS_HP_SCALING_RATE);
    stats.speed       = speedBase * 1.4;
    stats.isFlying    = true;
    stats.isFlyingBoss = true;
    stats.armor       = 0.35;
    stats.attackRange = 12;
    stats.projectileSpeed = 0.18;
    stats.aiBehavior = 'divebomber';
  } else if (type === 12) {   // Bug Ranged — kiting ranged attacker
    stats.hp             = 90 * levelScaling;
    stats.speed          = speedBase * 1.5;
    stats.isBug          = true;
    stats.attackRange    = 10;
    stats.projectileSpeed = 0.14;
    stats.aiBehavior = 'kiter';
  } else if (type === 13) {   // Bug Slow — armoured interceptor
    stats.hp    = 280 * levelScaling;
    stats.speed = speedBase * 0.9;
    stats.isBug = true;
    stats.armor = 0.20;
    stats.aiBehavior = 'interceptor';
  } else if (type === 14) {   // Bug Fast — fast dive bomber
    stats.hp       = 50 * levelScaling;
    stats.speed    = speedBase * 3.4;
    stats.isBug    = true;
    stats.isFlying = true;
    stats.aiBehavior = 'divebomber';
  } else if (type === 15) {   // Daddy Longlegs — small body, huge legs, easy 3-hit kill
    stats.hp       = 30 * levelScaling;  // Very fragile — 3 bullets kill it
    stats.speed    = speedBase * 1.5;
    stats.isDaddyLonglegs = true;
    stats.aiBehavior = 'rearing'; // Creeps toward player, rears up before attacking
    stats.attackRange    = 3.5;   // Melee-range rearing attack
    stats.isSpider       = true;
  } else if (type === 16) {   // Sweeping Swarm — cluster that sweeps side to side
    stats.hp       = 10 * levelScaling;  // 1-hit kill (very fragile)
    stats.speed    = speedBase * 4.0;
    stats.isFlying = true;
    stats.isSwarm  = true;
    stats.aiBehavior = 'sweep'; // Flies rapidly in large arcs across the screen
  }

  stats.maxHp  = stats.hp;
  // Base damage increased for a harder game requiring camp upgrades to survive.
  // Elite does 1.5× base damage; MiniBoss/FlyingBoss have their own values.
  stats.damage = (type === 9 ? 45 * 1.5 : 45) * levelScaling;
  if (type === 10) stats.damage = 80 * levelScaling;
  if (type === 11) stats.damage = 110 * levelScaling; // Flying Boss hits hard
  if (type === 12) stats.damage = 35 * levelScaling;  // Bug Ranged — moderate
  if (type === 13) stats.damage = 70 * levelScaling;  // Bug Slow — heavy melee
  if (type === 14) stats.damage = 25 * levelScaling;  // Bug Fast — light but rapid
  if (type === 15) stats.damage = 20 * levelScaling;  // Daddy Longlegs — light bite
  if (type === 16) stats.damage = 15 * levelScaling;  // Swarm — each hit is light but they swarm

  // --- Elemental resistance system ---
  // Each enemy type has intrinsic resistances/vulnerabilities (0 = neutral, >0 = resistant, <0 = vulnerable)
  // Resistances reduce incoming elemental damage by the given fraction.
  stats.elementalResistance = {
    fire:      0,
    ice:       0,
    lightning: 0,
    physical:  0
  };
  // Type-specific elemental profiles
  if (type === 0)  { stats.elementalResistance.fire = 0.20; stats.elementalResistance.ice = -0.20; } // Tank: fire resistant, ice vulnerable
  if (type === 1)  { stats.elementalResistance.lightning = 0.15; }  // Fast: slight lightning resist
  if (type === 5)  { stats.elementalResistance.lightning = -0.25; } // Flying: very weak to lightning
  if (type === 6)  { stats.elementalResistance.fire = 0.25; stats.elementalResistance.ice = -0.15; } // Hard Tank: more fire resistant
  if (type === 9)  { stats.elementalResistance.fire = 0.15; stats.elementalResistance.ice = 0.15; stats.elementalResistance.lightning = 0.15; } // Elite: balanced resistances
  if (type === 10) { stats.elementalResistance.fire = 0.30; stats.elementalResistance.ice = 0.20; stats.elementalResistance.lightning = 0.20; } // MiniBoss: high resistances
  if (type === 11) { stats.elementalResistance.lightning = -0.30; stats.elementalResistance.fire = 0.15; } // FlyingBoss: weak to lightning
  if (type === 12) { stats.elementalResistance.ice = 0.20; }  // Bug Ranged: ice resistant
  if (type === 13) { stats.elementalResistance.fire = -0.20; stats.elementalResistance.ice = 0.30; } // Bug Slow: fire vulnerable, ice resistant
  if (type === 14) { stats.elementalResistance.lightning = -0.20; } // Bug Fast: lightning vulnerable

  return stats;
}

window.GameEnemies = {
  ENEMY_TYPES,
  getEnemyBaseStats
};
