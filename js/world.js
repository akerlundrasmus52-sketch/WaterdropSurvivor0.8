// --- WORLD / ENVIRONMENT CONSTANTS ---
// Extracted from game.js - loaded as a regular script before the game.js ES module
// Exposes window.GameWorld for use by main.js

// Colour palette used throughout the scene
const COLORS = {
  bg: 0xFFF0F5,
  player: 0x4FC3F7, // Light Blue - more like water droplet
  enemySquare: 0xFF69B4, // Hot Pink
  enemyTriangle: 0xFFD700, // Gold
  enemyRound: 0x9370DB, // Purple
  ground: 0x2D5A1A, // Dark forest green (unified ground colour)
  forest: 0x98FB98, // Pale Green
  lake: 0x1E90FF, // Dodger Blue (More water-like)
  cabin: 0xDEB887, // Burlywood
  farmland: 0xF0E68C, // Khaki
  exp: 0x5DADE2, // Light Blue (Matching EXP bar)
};

// Core game configuration constants
const GAME_CONFIG = {
  playerSpeedBase: 0.10, // Slower start — upgrades improve speed
  enemySpeedBase: 0.05,  // Slower as requested
  waveInterval: 300, // Frames between waves (approx 5s)
  expValue: 10,
  baseExpReq: 20,
  // Lake configuration - used for spawn avoidance
  lakeCenterX: 30,
  lakeCenterZ: -30,
  lakeRadius: 18,
  // Performance optimization - Phase 1
  maxEnemiesOnScreen: 50, // Hard cap to prevent lag (docs specify 50 max)
  // Movement physics — slow and sluggish at start to reward movement upgrades
  accelLerpFactor: 0.05, // Very slow acceleration at start — feels heavy and unresponsive
  decelLerpFactor: 0.018, // Slow deceleration — lots of momentum/glide
  movementLeanFactor: 0.25, // Stronger lean effect on turns and braking
  dashLeanFactor: 0.4, // Dramatic tilt during dash
  dashLeanReturnDuration: 200, // ms to return to upright after dash
  // Combat effects
  meteorKnockbackMultiplier: 3, // Knockback strength
  explosionShakeIntensity: 1.5, // Camera shake on explosions
  smokeDurationFrames: 30 // Muzzle smoke lifetime (at 60fps = 0.5s)
};

// Countdown messages shown at the start of each run
const countdownMessages = [
  "Get Ready!",
  "3",
  "2",
  "1",
  "Survive!"
];

// Phase 5: Companion System Data
const COMPANIONS = {
  stormWolf: {
    id: 'stormWolf',
    name: 'Storm Wolf',
    icon: '🐺',
    evolvedIcon: '⚡',
    type: 'melee',
    baseStats: { damage: 8, attackSpeed: 1.2, health: 50 },
    evolvedStats: { damage: 20, attackSpeed: 0.8, health: 100 },
    unlockCondition: 'default',
    description: 'Melee companion that follows and attacks enemies'
  },
  skyFalcon: {
    id: 'skyFalcon',
    name: 'Sky Falcon',
    icon: '🦅',
    evolvedIcon: '🔥',
    type: 'ranged',
    baseStats: { damage: 6, attackSpeed: 1.5, health: 40 },
    evolvedStats: { damage: 15, attackSpeed: 1.0, health: 80 },
    unlockCondition: 'level15',
    description: 'Ranged companion that circles and dives at enemies'
  },
  waterSpirit: {
    id: 'waterSpirit',
    name: 'Water Spirit',
    icon: '💧',
    evolvedIcon: '🌊',
    type: 'support',
    baseStats: { damage: 3, attackSpeed: 8.0, health: 60 },
    evolvedStats: { damage: 8, attackSpeed: 5.0, health: 120 },
    unlockCondition: 'denLevel2',
    description: 'Support companion that heals and slows enemies'
  }
};

/**
 * Returns the default initial state for the day/night cycle system.
 * main.js uses this to initialise its `let dayNightCycle` variable so the
 * object remains mutable in the main module scope.
 */
function getInitialDayNightCycle() {
  return {
    enabled: true,
    timeOfDay: 0.25, // Start at dawn (6 AM / 25% through day cycle)
    cycleSpeed: 1 / 600, // 10 minutes for full cycle (1 / 600 seconds at 60fps)
    lastUpdateTime: 0
  };
}

window.GameWorld = {
  COLORS,
  GAME_CONFIG,
  countdownMessages,
  COMPANIONS,
  getInitialDayNightCycle
};
