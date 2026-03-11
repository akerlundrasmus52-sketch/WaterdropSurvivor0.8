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
  DADDY_LONGLEGS:    15, // Spider — small round body, huge thin legs, rears to attack, low HP like yellow enemy
  SWEEPING_SWARM:    16, // Cluster of fast flyers that sweep side to side, 1-hit kill
  GREY_ALIEN_SCOUT:  17, // Minute-10 alien scout — ranged kiter, drops Alien Biomatter
  REPTILIAN_SHIFTER: 18, // Active-camo flanker — 80% transparent, fully visible at ≤3 units
  ANNUNAKI_ORB:      19, // Minute-15 boss — golden geometric drone, teleports, laser sweep
  SOURCE_GLITCH:     20  // Forbidden Protocol spawn — reality-breaking glitch entity
};

const MINI_BOSS_HP_SCALING_RATE = 0.20; // 20% HP increase per player level above start (was 15%)

/**
 * Power-curve enemy scaling multiplier for HP and Damage.
 * Replaces the flat 20%/level linear formula with a curve that stays moderate
 * early (levels 1–20) and becomes brutal at high levels (50–100).
 * @param {number} playerLevel
 * @returns {number} scaling multiplier
 */
function getEnemyLevelScaling(playerLevel) {
  return Math.pow(Math.max(1, playerLevel) / 20, 1.5) + 0.5;
}

/**
 * Armor multiplier that grows significantly after Level 40, requiring the
 * player to use Armor Piercing / Void Gems to survive.
 * Returns a flat armor value in [0, 1) where 0 = no reduction.
 * @param {number} playerLevel
 * @param {number} baseArmor - the enemy's base armor fraction
 * @returns {number} final armor value
 */
function getEnemyArmor(playerLevel, baseArmor) {
  if (playerLevel <= 40) return baseArmor;
  // After level 40 add an extra 0.012 per level above 40, capped at 0.80
  const extra = Math.min(0.80 - baseArmor, (playerLevel - 40) * 0.012);
  return Math.min(0.80, baseArmor + extra);
}

/**
 * Returns base stats for an enemy given its type and scaling context.
 * The returned plain object is Object.assign-ed onto the Enemy instance in
 * game.js, replacing the large if-else stat block that was previously inline.
 *
 * @param {number} type         - Enemy type constant (see ENEMY_TYPES)
 * @param {number} levelScaling - (legacy, ignored) kept for backward-compat signature
 * @param {number} speedBase    - GAME_CONFIG.enemySpeedBase from game.js
 * @param {number} playerLevel  - Current player level
 * @returns {Object} Stat properties to merge onto the Enemy instance
 */
function getEnemyBaseStats(type, levelScaling, speedBase, playerLevel) {
  const stats = {};
  // Use the new power-curve scaling instead of the legacy linear multiplier
  const ls = getEnemyLevelScaling(playerLevel);

  if (type === 0) {           // Tank — charges, tries to cut off player
    stats.hp    = 200 * ls;
    stats.speed = speedBase * 1.2;
    stats.aiBehavior = 'interceptor'; // Predicts player movement
  } else if (type === 1) {    // Fast — flanker, zigzags around player
    stats.hp    = 60  * ls;
    stats.speed = speedBase * 2.8;
    stats.aiBehavior = 'flanker'; // Approaches from sides/behind
  } else if (type === 2) {    // Balanced — pack hunter, coordinates with others
    stats.hp    = 120 * ls;
    stats.speed = speedBase * 1.8;
    stats.aiBehavior = 'pack'; // Spreads out, surrounds player
  } else if (type === 3) {    // Slowing — ambusher, hides then rushes
    stats.hp           = 150 * ls;
    stats.speed        = speedBase * 1.6;
    stats.slowDuration = 2000;
    stats.slowAmount   = 0.5;
    stats.aiBehavior = 'ambusher'; // Waits then dashes in
  } else if (type === 4) {    // Ranged — kiter, maintains distance smartly
    stats.hp             = 100 * ls;
    stats.speed          = speedBase * 1.4;
    stats.attackRange    = 8;
    stats.projectileSpeed = 0.15;
    stats.aiBehavior = 'kiter'; // Retreats when player approaches
  } else if (type === 5) {    // Flying — dive bomber, swoops in and out
    stats.hp       = 120 * ls;
    stats.speed    = speedBase * 2.4;
    stats.isFlying = true;
    stats.aiBehavior = 'divebomber'; // Dives at player then retreats
  } else if (type === 6) {    // Hard Tank — interceptor with prediction
    stats.hp    = 350 * ls;
    stats.speed = speedBase * 1.3;
    stats.aiBehavior = 'interceptor';
  } else if (type === 7) {    // Hard Fast — aggressive flanker
    stats.hp    = 110 * ls * 1.2; // +20% HP (yellow/gold enemy)
    stats.speed = speedBase * 3.2;
    stats.aiBehavior = 'flanker';
  } else if (type === 8) {    // Hard Balanced — pack leader
    stats.hp    = 220 * ls;
    stats.speed = speedBase * 2.0;
    stats.aiBehavior = 'pack';
  } else if (type === 9) {    // Elite — stalker, waits for openings
    stats.hp    = 400 * ls;
    stats.speed = speedBase * 1.8;
    stats.aiBehavior = 'stalker'; // Circles then strikes when player is busy
  } else if (type === 10) {   // MiniBoss
    const miniBossStartLevel = 10;
    stats.hp         = 2000 * 1.2 * (1 + (playerLevel - miniBossStartLevel) * MINI_BOSS_HP_SCALING_RATE); // +20% HP (yellow/gold enemy)
    stats.speed      = speedBase * 1.0;
    stats.isMiniBoss = true;
    stats.armor      = getEnemyArmor(playerLevel, 0.30);
    stats.aiBehavior = 'interceptor';
  } else if (type === 11) {   // Flying Boss (level 15) — giant airborne boss
    const flyingBossStartLevel = 15;
    stats.hp          = 5000 * (1 + Math.max(0, playerLevel - flyingBossStartLevel) * MINI_BOSS_HP_SCALING_RATE);
    stats.speed       = speedBase * 1.4;
    stats.isFlying    = true;
    stats.isFlyingBoss = true;
    stats.armor       = getEnemyArmor(playerLevel, 0.35);
    stats.attackRange = 12;
    stats.projectileSpeed = 0.18;
    stats.aiBehavior = 'divebomber';
  } else if (type === 12) {   // Bug Ranged — kiting ranged attacker
    stats.hp             = 90 * ls;
    stats.speed          = speedBase * 1.5;
    stats.isBug          = true;
    stats.attackRange    = 10;
    stats.projectileSpeed = 0.14;
    stats.aiBehavior = 'kiter';
  } else if (type === 13) {   // Bug Slow — armoured interceptor
    stats.hp    = 280 * ls;
    stats.speed = speedBase * 0.9;
    stats.isBug = true;
    stats.armor = getEnemyArmor(playerLevel, 0.20);
    stats.aiBehavior = 'interceptor';
  } else if (type === 14) {   // Bug Fast — fast dive bomber
    stats.hp       = 50 * ls;
    stats.speed    = speedBase * 3.4;
    stats.isBug    = true;
    stats.isFlying = true;
    stats.aiBehavior = 'divebomber';
  } else if (type === 15) {   // Daddy Longlegs — spider, low HP like yellow enemy
    stats.hp       = 110 * ls * 1.2;  // Same HP as yellow enemy
    stats.speed    = speedBase * 1.5;
    stats.isDaddyLonglegs = true;
    stats.aiBehavior = 'rearing'; // Creeps toward player, rears up before attacking
    stats.attackRange    = 3.5;   // Melee-range rearing attack
    stats.isSpider       = true;
  } else if (type === 16) {   // Sweeping Swarm — cluster that sweeps side to side
    stats.hp       = 10 * ls;  // 1-hit kill (very fragile)
    stats.speed    = speedBase * 4.0;
    stats.isFlying = true;
    stats.isSwarm  = true;
    stats.aiBehavior = 'sweep'; // Flies rapidly in large arcs across the screen
  } else if (type === 17) {   // Grey Alien Scout (minute-10 encounter) — ranged kiter
    stats.hp             = 280 * ls;
    stats.speed          = speedBase * 1.8;
    stats.isFlying       = true;           // hovers above ground
    stats.isGreyAlien    = true;
    stats.attackRange    = 11;
    stats.projectileSpeed = 0.17;
    stats.aiBehavior     = 'kiter';
    stats.dropsAlienBiomatter = true;      // rare biomatter drop on kill
  } else if (type === 18) {   // Reptilian Shifter — active-camo fast flanker
    stats.hp          = 160 * ls;
    stats.speed       = speedBase * 3.6;
    stats.isReptilian = true;
    stats.aiBehavior  = 'flanker';
  } else if (type === 20) {   // Source Glitch — Forbidden Protocol reality-breaking entity
    stats.hp       = 600 * ls;
    stats.speed    = speedBase * 0;  // Teleports instead of walking — speed handled in AI
    stats.isFlying = true;
    stats.isSourceGlitch = true;
    stats.armor    = 0;
    stats.attackRange = 6;
    stats.aiBehavior = 'sourceGlitch';
    stats.dropsCorruptedSourceCode = true;
    stats.elementalResistance = { fire: -0.50, ice: -0.50, lightning: -0.50, physical: -0.50 }; // Extremely vulnerable — reality is broken
  } else if (type === 19) {   // Annunaki Orb — teleporting golden boss (minute-15)
    const annunakiStartLevel = 15;
    stats.hp             = 4000 * (1 + Math.max(0, playerLevel - annunakiStartLevel) * MINI_BOSS_HP_SCALING_RATE);
    stats.speed          = speedBase * 0;  // Doesn't move — teleports instead
    stats.isFlying       = true;
    stats.isAnnunaki     = true;
    stats.isMiniBoss     = true;           // Shares boss treatment (cinematic, scaling)
    stats.armor          = getEnemyArmor(playerLevel, 0.40);
    stats.attackRange    = 99;             // Can always "fire" — uses laser sweep
    stats.projectileSpeed = 0.12;
    stats.aiBehavior     = 'annunaki';     // Custom behavior handled in enemy-class.js
    stats.elementalResistance = { fire: 0.20, ice: 0.20, lightning: 0.20, physical: 0.30 };
  }

  stats.maxHp  = stats.hp;
  // Base damage increased for a harder game requiring camp upgrades to survive.
  // Elite does 1.5× base damage; MiniBoss/FlyingBoss have their own values.
  stats.damage = (type === 9 ? 45 * 1.5 : 45) * ls;
  if (type === 10) stats.damage = 80  * ls;
  if (type === 11) stats.damage = 110 * ls; // Flying Boss hits hard
  if (type === 12) stats.damage = 35  * ls;  // Bug Ranged — moderate
  if (type === 13) stats.damage = 70  * ls;  // Bug Slow — heavy melee
  if (type === 14) stats.damage = 25  * ls;  // Bug Fast — light but rapid
  if (type === 15) stats.damage = 20  * ls;  // Daddy Longlegs — light bite
  if (type === 16) stats.damage = 15  * ls;  // Swarm — each hit is light but they swarm
  if (type === 17) stats.damage = 40  * ls;  // Grey Alien Scout — moderate plasma bolt
  if (type === 18) stats.damage = 55  * ls;  // Reptilian Shifter — ambush strike
  if (type === 19) stats.damage = 120 * ls; // Annunaki Orb — laser devastation
  if (type === 20) stats.damage = 60  * ls; // Source Glitch — erratic digital strikes

  // ── Phasing mutation (Level 60+) ────────────────────────────────────────────
  // Above level 60 all basic enemy types (0–9, 12–16) can randomly phase —
  // turning 50% transparent and absorbing the next hit entirely.
  const PHASING_ELIGIBLE_TYPES = [0,1,2,3,4,5,6,7,8,9,12,13,14,15,16];
  if (playerLevel >= 60 && PHASING_ELIGIBLE_TYPES.includes(type)) {
    stats._phasingEnabled = true; // flag consumed by takeDamage() in enemy-class.js
  }

  // --- Elemental resistance system ---
  // Each enemy type has intrinsic resistances/vulnerabilities (0 = neutral, >0 = resistant, <0 = vulnerable)
  // Resistances reduce incoming elemental damage by the given fraction.
  // Type 19 (Annunaki Orb) already set its own resistance object inline above.
  if (!stats.elementalResistance) {
    stats.elementalResistance = {
      fire:      0,
      ice:       0,
      lightning: 0,
      physical:  0
    };
  }
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
  if (type === 17) { stats.elementalResistance.fire = 0.10; stats.elementalResistance.ice = -0.20; } // Grey Alien: ice vulnerable
  if (type === 18) { stats.elementalResistance.lightning = -0.25; stats.elementalResistance.fire = 0.15; } // Reptilian: weak to lightning
  // Type 19 (Annunaki Orb) elemental resistance is already set inline in the stats block above

  return stats;
}

// ---------------------------------------------------------------------------
// AI Animation Throttle — camera-distance-based LOD for enemy updates
// ---------------------------------------------------------------------------
// Enemies outside the camera frustum waste CPU on pathfinding / animation.
// These constants configure how aggressively we throttle far-off enemies.

/** Squared-distance thresholds (world units²) for AI update LOD bands. */
const ENEMY_THROTTLE = {
  /** Near band — update every frame. */
  NEAR_SQ:       2500,   // 50²
  /** Medium band — update every 2nd frame. */
  MEDIUM_SQ:     6400,   // 80²
  /** Far band — update every 4th frame. */
  FAR_SQ:        10000,  // 100²
  /** Very-far / off-screen — update every 10th frame (~100 ms at 100 fps). */
  OFFSCREEN_DIVISOR: 10
};

/**
 * Return how many frames to skip between AI updates for an enemy at the
 * given squared distance from the camera.
 *
 * @param {number} distSq - Squared distance from the camera position.
 * @returns {number} Tick divisor (1 = every frame, 10 = every 10th frame).
 */
function getEnemyTickDivisor(distSq) {
  if (distSq < ENEMY_THROTTLE.NEAR_SQ)   return 1;
  if (distSq < ENEMY_THROTTLE.MEDIUM_SQ) return 2;
  if (distSq < ENEMY_THROTTLE.FAR_SQ)    return 4;
  return ENEMY_THROTTLE.OFFSCREEN_DIVISOR;
}

/**
 * Should this enemy run its AI update on the current frame?
 *
 * @param {number} distSq     - Squared distance from camera.
 * @param {number} frameCount - Monotonically increasing frame counter.
 * @param {number} entityIdx  - Per-enemy offset to stagger updates.
 * @returns {boolean}
 */
function shouldUpdateEnemy(distSq, frameCount, entityIdx) {
  return ((frameCount + entityIdx) % getEnemyTickDivisor(distSq)) === 0;
}

window.GameEnemies = {
  ENEMY_TYPES,
  getEnemyBaseStats,
  getEnemyLevelScaling,
  getEnemyArmor,
  ENEMY_THROTTLE,
  getEnemyTickDivisor,
  shouldUpdateEnemy
};
