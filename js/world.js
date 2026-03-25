// --- WORLD / ENVIRONMENT CONSTANTS ---
// Extracted from game.js - loaded as a regular script before the game.js ES module
// Exposes window.GameWorld for use by main.js

// Colour palette used throughout the scene
const COLORS = {
  bg: 0xFFE8D6, // Warm peachy sky (camp-style atmospheric)
  player: 0x3A9FD8, // Deeper sea-blue like water (was 0x4FC3F7 light blue)
  enemySquare: 0xFF69B4, // Hot Pink
  enemyTriangle: 0xFFD700, // Gold
  enemyRound: 0x9370DB, // Purple
  ground: 0x4A8C2A, // Light-medium grass green (user's preferred lighter grass look)
  forest: 0x98FB98, // Pale Green
  lake: 0x1E90FF, // Dodger Blue (More water-like)
  cabin: 0xDEB887, // Burlywood
  farmland: 0xF0E68C, // Khaki
  exp: 0x5DADE2, // Light Blue (Matching EXP bar)
};

// Core game configuration constants
const GAME_CONFIG = {
  playerSpeedBase: 0.10, // Slower start — upgrades improve speed
  // Enemy speed base is expressed in world units per second.
  // Reduced from 3.0 to 2.0 to give the player a fair chance to react and manoeuvre.
  enemySpeedBase: 2.0,
  waveInterval: 300, // Frames between waves (approx 5s)
  expValue: 20,      // More XP per gem — faster early leveling
  baseExpReq: 45,    // ~2–3 gems to get first level up (45 XP / 20 per gem ≈ 2.25 gems)
  // Lake configuration - used for spawn avoidance - OPTIMIZED: Repositioned to outer edge for ultra-compact world
  lakeCenterX: 30,   // OPTIMIZED: Moved to outer edge (was 14, before 20)
  lakeCenterZ: -30,  // OPTIMIZED: Moved to outer edge (was -14, before -20)
  lakeRadius: 8,     // OPTIMIZED: Reduced size to fit at edge (was 16, before 18)
  // Performance optimization - Phase 1
  maxEnemiesOnScreen: 50, // Hard cap to prevent lag (docs specify 50 max)
  // Movement physics — slow and sluggish at start to reward movement upgrades
  accelLerpFactor: 0.07, // Responsive acceleration — upgrades improve further
  decelLerpFactor: 0.035, // Crisp deceleration — momentum present but stops feel intentional
  movementLeanFactor: 0.15, // Subtle lean — avoids the 'rolling' look on turns
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
  frostRifle: { id: 'frostRifle', name: 'Frost Rifle', icon: '❄️', type: 'ranged', rarity: 'epic',
    cost: { crystal: 12, iron: 8, magicEssence: 5 }, buildTime: 8,
    stats: { damage: 16, range: 16, attackSpeed: 1.6, projectile: 'iceBullet', element: 'ice', slowEffect: 0.4 },
    description: 'Frost rifle — slows enemies by 40%. Elemental: Ice.' },
  // ── New weapon crafts ──
  samuraiSword: { id: 'samuraiSword', name: 'Samurai Sword', icon: '⚔️', type: 'melee', rarity: 'rare', weaponCategory: 1,
    cost: { iron: 12, wood: 4, crystal: 3 }, buildTime: 5,
    stats: { damage: 38, attackSpeed: 1.2, critChance: 0.08 },
    description: 'Ancient katana — swift deadly strikes with high crit chance.' },
  whip: { id: 'whip', name: 'Whip', icon: '🪢', type: 'melee', rarity: 'common', weaponCategory: 1,
    cost: { leather: 8, wood: 3 }, buildTime: 3,
    stats: { damage: 18, range: 6, chainHits: 3 },
    description: 'Leather whip — hits chain through multiple enemies.' },
  uzi: { id: 'uzi', name: 'Uzi', icon: '🔫', type: 'ranged', rarity: 'rare', weaponCategory: 1,
    cost: { iron: 10, coal: 5 }, buildTime: 4,
    stats: { damage: 8, range: 10, attackSpeed: 0.12 },
    description: 'Rapid-fire submachine gun — low damage, extreme fire rate.' },
  sniperRifle: { id: 'sniperRifle', name: '50 Cal Sniper Rifle', icon: '🎯', type: 'ranged', rarity: 'epic', weaponCategory: 1,
    cost: { iron: 18, crystal: 6, coal: 8 }, buildTime: 8,
    stats: { damage: 95, range: 30, piercing: 3 },
    description: '50 caliber sniper — massive damage, pierces 3 enemies, slow fire rate.' },
  pumpShotgun: { id: 'pumpShotgun', name: 'Pump Shotgun', icon: '💥', type: 'ranged', rarity: 'common', weaponCategory: 1,
    cost: { iron: 10, wood: 5 }, buildTime: 4,
    stats: { damage: 14, range: 8, pellets: 8, spread: 0.7 },
    description: 'Pump-action shotgun — devastating close-range spread.' },
  autoShotgun: { id: 'autoShotgun', name: 'Auto Shotgun', icon: '💥', type: 'ranged', rarity: 'rare', weaponCategory: 1,
    cost: { iron: 14, coal: 6, crystal: 2 }, buildTime: 6,
    stats: { damage: 10, range: 7, pellets: 6, spread: 0.6 },
    description: 'Semi-automatic shotgun — rapid pellet bursts.' },
  minigun: { id: 'minigun', name: 'Minigun', icon: '🔥', type: 'ranged', rarity: 'legendary', weaponCategory: 1,
    cost: { iron: 20, coal: 12, crystal: 5 }, buildTime: 10,
    stats: { damage: 6, range: 12, attackSpeed: 0.06 },
    description: 'Rotary barrel minigun — extreme fire rate, needs spin-up time.' },
  bow: { id: 'bow', name: 'Bow', icon: '🏹', type: 'ranged', rarity: 'common', weaponCategory: 1,
    cost: { wood: 8, leather: 4 }, buildTime: 3,
    stats: { damage: 22, range: 16, piercing: 1 },
    description: 'Traditional bow — long range with arrow piercing.' },
  teslaSaber: { id: 'teslaSaber', name: 'Tesla Saber', icon: '⚡', type: 'melee', rarity: 'epic', weaponCategory: 1,
    cost: { crystal: 10, iron: 8, magicEssence: 5 }, buildTime: 7,
    stats: { damage: 28, range: 3.5, chainLightning: true },
    description: 'Energy blade — melee strikes chain lightning to nearby enemies.' },
  boomerang: { id: 'boomerang', name: 'Boomerang', icon: '🪃', type: 'thrown', rarity: 'common', weaponCategory: 2,
    cost: { wood: 6, iron: 3 }, buildTime: 3,
    stats: { damage: 20, range: 12, returnHits: true },
    description: 'Returns to thrower — hits enemies both ways.' },
  shuriken: { id: 'shuriken', name: 'Shuriken', icon: '✦', type: 'thrown', rarity: 'rare', weaponCategory: 2,
    cost: { iron: 6, crystal: 2 }, buildTime: 3,
    stats: { damage: 12, range: 10, projectiles: 3 },
    description: 'Throws 3 spinning stars — auto-targets nearby enemies.' },
  nanoSwarm: { id: 'nanoSwarm', name: 'Nano Swarm', icon: '🤖', type: 'tech', rarity: 'legendary', weaponCategory: 2,
    cost: { crystal: 15, magicEssence: 8, iron: 5 }, buildTime: 10,
    stats: { damage: 4, swarmCount: 6, range: 8 },
    description: 'Cloud of nanobots — swarms and shreds nearby enemies continuously.' },
  homingMissile: { id: 'homingMissile', name: 'Homing Missile', icon: '🚀', type: 'ranged', rarity: 'epic', weaponCategory: 2,
    cost: { iron: 14, coal: 8, crystal: 4 }, buildTime: 7,
    stats: { damage: 40, range: 20 },
    description: 'Heat-seeking missile — locks on and chases the nearest enemy.' },
  lightningStrike: { id: 'lightningStrike', name: 'Lightning Strike', icon: '⚡', type: 'elemental', rarity: 'rare', weaponCategory: 3,
    cost: { magicEssence: 10, crystal: 6 }, buildTime: 6,
    stats: { damage: 45, range: 18, strikes: 1, element: 'lightning' },
    description: 'Calls lightning from the heavens — strikes enemies from above.' },
  poisonCloud: { id: 'poisonCloud', name: 'Poison Cloud', icon: '☠️', type: 'elemental', rarity: 'common', weaponCategory: 3,
    cost: { venom: 6, flower: 4, magicEssence: 2 }, buildTime: 4,
    stats: { damage: 6, dotDamage: 3, dotDuration: 4000, element: 'poison' },
    description: 'Toxic cloud — poisons nearby enemies dealing damage over time.' },
  fireballSpell: { id: 'fireballSpell', name: 'Fireball', icon: '🔥', type: 'elemental', rarity: 'rare', weaponCategory: 3,
    cost: { coal: 8, magicEssence: 6 }, buildTime: 5,
    stats: { damage: 35, range: 14, explosionRadius: 3, element: 'fire' },
    description: 'Launches fireballs that explode on impact — area damage.' }
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
