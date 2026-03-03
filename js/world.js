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
  expValue: 15,      // Increased from 10 — supports the Level-100 goal
  baseExpReq: 30,    // Increased from 20 — deeper XP curve for long progression
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
  greyAlien: {
    id: 'greyAlien',
    name: 'Grey Alien',
    icon: '👽',
    evolvedIcon: '🛸',
    type: 'ranged',
    baseStats: { damage: 7, attackSpeed: 1.4, health: 45 },
    evolvedStats: { damage: 18, attackSpeed: 0.9, health: 90 },
    unlockCondition: 'default',
    description: 'Small grey alien companion found at the UFO crash site — fires energy bolts at enemies'
  },
  stormWolf: {
    id: 'stormWolf',
    name: 'Storm Wolf',
    icon: '🐺',
    evolvedIcon: '⚡',
    type: 'melee',
    baseStats: { damage: 10, attackSpeed: 1.0, health: 65 },
    evolvedStats: { damage: 25, attackSpeed: 0.7, health: 130 },
    unlockCondition: 'breedQuest',
    description: 'Bred from wild wolves — powerful melee companion that tears through enemies'
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

// Wildlife definitions — animals living on the map in different regions
const WILDLIFE = {
  rabbit:     { id: 'rabbit',     name: 'Rabbit',      icon: '🐇', region: 'forest',  hp: 10, speed: 0.12, drops: { flesh: 1 }, passive: true,  size: 0.4 },
  deer:       { id: 'deer',       name: 'Deer',        icon: '🦌', region: 'forest',  hp: 25, speed: 0.09, drops: { flesh: 2, fur: 1 }, passive: true,  size: 0.9 },
  fox:        { id: 'fox',        name: 'Fox',         icon: '🦊', region: 'forest',  hp: 20, speed: 0.11, drops: { flesh: 1, fur: 1 }, passive: true,  size: 0.5 },
  wolf:       { id: 'wolf',       name: 'Wolf',        icon: '🐺', region: 'forest',  hp: 40, speed: 0.08, drops: { flesh: 3, fur: 2 }, passive: false, size: 0.8, gender: 'random' },
  scorpion:   { id: 'scorpion',   name: 'Scorpion',    icon: '🦂', region: 'desert',  hp: 15, speed: 0.07, drops: { chitin: 1 }, passive: false, size: 0.3 },
  camel:      { id: 'camel',      name: 'Camel',       icon: '🐫', region: 'desert',  hp: 50, speed: 0.05, drops: { flesh: 3, leather: 2 }, passive: true,  size: 1.1 },
  snake:      { id: 'snake',      name: 'Snake',       icon: '🐍', region: 'desert',  hp: 12, speed: 0.10, drops: { venom: 1, leather: 1 }, passive: false, size: 0.3 },
  polarBear:  { id: 'polarBear',  name: 'Polar Bear',  icon: '🐻‍❄️', region: 'snow', hp: 80, speed: 0.06, drops: { flesh: 4, fur: 3 }, passive: false, size: 1.3 },
  penguin:    { id: 'penguin',    name: 'Penguin',     icon: '🐧', region: 'snow',    hp: 15, speed: 0.07, drops: { flesh: 1, feather: 1 }, passive: true,  size: 0.4 },
  arcticFox:  { id: 'arcticFox',  name: 'Arctic Fox',  icon: '🦊', region: 'snow',    hp: 18, speed: 0.10, drops: { fur: 2 }, passive: true,  size: 0.45 },
  boar:       { id: 'boar',       name: 'Wild Boar',   icon: '🐗', region: 'forest',  hp: 35, speed: 0.07, drops: { flesh: 3, leather: 1 }, passive: false, size: 0.7 }
};

// Cooking recipe definitions — combine harvested ingredients at campfire
const COOKING_RECIPES = {
  berryJam:       { id: 'berryJam',       name: 'Berry Jam',          icon: '🫐', ingredients: { berry: 5 },                       effect: { heal: 10 },                   cookTime: 3, description: 'Sweet jam that heals 10 HP' },
  grilledMeat:    { id: 'grilledMeat',    name: 'Grilled Meat',       icon: '🥩', ingredients: { flesh: 2 },                       effect: { heal: 25 },                   cookTime: 5, description: 'Hearty meal — heals 25 HP' },
  flowerTea:      { id: 'flowerTea',      name: 'Flower Tea',         icon: '🍵', ingredients: { flower: 3 },                      effect: { speedBoost: 0.1, duration: 60 }, cookTime: 4, description: '+10% speed for 60s' },
  hunterStew:     { id: 'hunterStew',     name: 'Hunter\'s Stew',     icon: '🍲', ingredients: { flesh: 3, berry: 2, vegetable: 1 }, effect: { heal: 50, damageBoost: 0.05, duration: 90 }, cookTime: 8, description: 'Full meal — heals 50 HP, +5% damage 90s' },
  venomPotion:    { id: 'venomPotion',    name: 'Venom Potion',       icon: '🧪', ingredients: { venom: 2, flower: 2 },            effect: { poisonDamage: 3, duration: 30 }, cookTime: 6, description: 'Poisons enemies for 3 dmg/s 30s' },
  furCloak:       { id: 'furCloak',       name: 'Fur Cloak',          icon: '🧥', ingredients: { fur: 5, leather: 2 },             effect: { armor: 5 },                   cookTime: 10, description: '+5 Armor (permanent equip)' },
  energyBar:      { id: 'energyBar',      name: 'Energy Bar',         icon: '🍫', ingredients: { berry: 3, vegetable: 2 },         effect: { heal: 15, xpBoost: 0.1, duration: 60 }, cookTime: 4, description: 'Heals 15 HP, +10% XP for 60s' },
  survivalRation: { id: 'survivalRation', name: 'Survival Ration',    icon: '🥡', ingredients: { flesh: 2, vegetable: 2, berry: 2 }, effect: { heal: 35, allBoost: 0.03, duration: 120 }, cookTime: 7, description: 'Heals 35 HP, +3% all stats 120s' }
};

// Weapon crafting definitions — build weapons at the Weaponsmith
const WEAPON_CRAFTS = {
  tranquilizerRifle: { id: 'tranquilizerRifle', name: 'Tranquilizer Rifle', icon: '🔫', type: 'special', rarity: 'rare',
    cost: { iron: 10, wood: 5, crystal: 2 }, buildTime: 5,
    stats: { damage: 0, range: 15, projectile: 'tranqDart' },
    description: 'Non-lethal — tranquilizes wild animals for capture. Required to catch wolves for breeding.' },
  ironSword: { id: 'ironSword', name: 'Iron Sword', icon: '⚔️', type: 'melee', rarity: 'common',
    cost: { iron: 8, wood: 3 }, buildTime: 3,
    stats: { damage: 12, attackSpeed: 1.0, critChance: 0.05 },
    description: 'Sturdy iron blade — reliable melee weapon.' },
  hunterBow: { id: 'hunterBow', name: 'Hunter\'s Bow', icon: '🏹', type: 'ranged', rarity: 'common',
    cost: { wood: 10, leather: 3 }, buildTime: 4,
    stats: { damage: 8, range: 12, attackSpeed: 1.3, projectile: 'arrow' },
    description: 'Long-range bow — fires arrows at enemies.' },
  crystalStaff: { id: 'crystalStaff', name: 'Crystal Staff', icon: '🔮', type: 'magic', rarity: 'rare',
    cost: { crystal: 8, magicEssence: 5, iron: 3 }, buildTime: 6,
    stats: { damage: 15, range: 10, attackSpeed: 1.5, projectile: 'energyBolt', element: 'arcane' },
    description: 'Magical staff — fires arcane energy bolts. Elemental: Arcane.' },
  fireMusket: { id: 'fireMusket', name: 'Fire Musket', icon: '🔥', type: 'ranged', rarity: 'epic',
    cost: { iron: 15, coal: 10, magicEssence: 3 }, buildTime: 8,
    stats: { damage: 22, range: 14, attackSpeed: 2.0, projectile: 'fireBullet', element: 'fire' },
    description: 'Powerful fire musket — slow but devastating. Elemental: Fire.' },
  iceRifle: { id: 'iceRifle', name: 'Frost Rifle', icon: '❄️', type: 'ranged', rarity: 'epic',
    cost: { crystal: 12, iron: 8, magicEssence: 5 }, buildTime: 8,
    stats: { damage: 16, range: 16, attackSpeed: 1.6, projectile: 'iceBullet', element: 'ice', slowEffect: 0.4 },
    description: 'Frost rifle — slows enemies by 40%. Elemental: Ice.' }
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
  WILDLIFE,
  COOKING_RECIPES,
  WEAPON_CRAFTS,
  getInitialDayNightCycle
};
