// --- WEAPON DEFINITIONS ---
// Extracted from game.js - loaded as a regular script before game.js (module)
// Exposes window.GameWeapons for use by game.js

/**
 * Weapon Categories:
 *   1 = Handheld  – player holds/animates the weapon visually
 *   2 = Passive (Non-Elemental) – fires/operates automatically (drone, missile, etc.)
 *   3 = Elemental – passive elemental effects (lightning, meteor, poison, fireball)
 */
const WEAPON_CATEGORIES = {
  1: { name: 'Handheld',            desc: 'Weapons held and animated in player hands' },
  2: { name: 'Passive',             desc: 'Auto-targeting non-elemental weapons' },
  3: { name: 'Elemental',           desc: 'Elemental effects that strike automatically' }
};

/**
 * Returns a fresh initial weapons-state object for a new run.
 * The returned object is mutable so game.js can update cooldowns, levels, etc.
 */
function getDefaultWeapons() {
  return {
    // ── Category 1: Handheld Weapons ──────────────────────────────
    gun:           { active: true,  level: 1, damage: 15, cooldown: 1000, lastShot: 0, range: 12, barrels: 1,    category: 1 },
    sword:         { active: false, level: 0, damage: 30, cooldown: 1500, lastShot: 0, range: 3.5,               category: 1 },
    samuraiSword:  { active: false, level: 0, damage: 38, cooldown: 1200, lastShot: 0, range: 4.0,               category: 1 },
    whip:          { active: false, level: 0, damage: 18, cooldown: 900,  lastShot: 0, range: 6.0, chainHits: 3, category: 1 },
    uzi:           { active: false, level: 0, damage: 8,  cooldown: 120,  lastShot: 0, range: 10,  barrels: 1,   category: 1 },
    sniperRifle:   { active: false, level: 0, damage: 95, cooldown: 3000, lastShot: 0, range: 30,  piercing: 3,  category: 1 },
    pumpShotgun:   { active: false, level: 0, damage: 14, cooldown: 1800, lastShot: 0, range: 8,   spread: 0.7,  pellets: 8,  category: 1 },
    autoShotgun:   { active: false, level: 0, damage: 10, cooldown: 600,  lastShot: 0, range: 7,   spread: 0.6,  pellets: 6,  category: 1 },
    minigun:       { active: false, level: 0, damage: 6,  cooldown: 60,   lastShot: 0, range: 12,  barrels: 1,   spinUp: 0,   category: 1 },
    bow:           { active: false, level: 0, damage: 22, cooldown: 1400, lastShot: 0, range: 16,  piercing: 1,  category: 1 },
    teslaSaber:    { active: false, level: 0, damage: 28, cooldown: 800,  lastShot: 0, range: 3.5, chainLightning: true, category: 1 },
    doubleBarrel:  { active: false, level: 0, damage: 12, cooldown: 1500, lastShot: 0, range: 12, spread: 0.55, pellets: 12, category: 1 },

    // ── Category 2: Passive Non-Elemental Weapons ─────────────────
    droneTurret:   { active: false, level: 0, damage: 5,  cooldown: 80,   lastShot: 0, range: 15, droneCount: 1, category: 2 },
    aura:          { active: false, level: 0, damage: 5,  cooldown: 500,  lastShot: 0, range: 3,                 category: 2 },
    boomerang:     { active: false, level: 0, damage: 20, cooldown: 1600, lastShot: 0, range: 12, returnHits: true, category: 2 },
    shuriken:      { active: false, level: 0, damage: 12, cooldown: 400,  lastShot: 0, range: 10, projectiles: 3, category: 2 },
    nanoSwarm:     { active: false, level: 0, damage: 4,  cooldown: 200,  lastShot: 0, range: 8,  swarmCount: 6, category: 2 },
    homingMissile: { active: false, level: 0, damage: 40, cooldown: 2200, lastShot: 0, range: 20,               category: 2 },
    iceSpear:      { active: false, level: 0, damage: 20, cooldown: 1500, lastShot: 0, range: 15, slowPercent: 0.4, slowDuration: 2000, category: 2 },

    // ── Category 3: Elemental Weapons ─────────────────────────────
    meteor:        { active: false, level: 0, damage: 60, cooldown: 2500, lastShot: 0, area: 5,                  category: 3 },
    fireRing:      { active: false, level: 0, damage: 8,  cooldown: 800,  lastShot: 0, range: 4,  orbs: 3, rotationSpeed: 2, category: 3 },
    lightning:     { active: false, level: 0, damage: 45, cooldown: 2000, lastShot: 0, range: 18, strikes: 1, chainRange: 5, category: 3 },
    poison:        { active: false, level: 0, damage: 6,  cooldown: 1500, lastShot: 0, range: 5,  dotDamage: 3, dotDuration: 4000, category: 3 },
    fireball:      { active: false, level: 0, damage: 35, cooldown: 1800, lastShot: 0, range: 14, explosionRadius: 3, category: 3 }
  };
}

/**
 * Per-weapon upgrade table. Each weapon can be levelled 1→10 in-game.
 * Each level increases relevant stats (damage, cooldown, projectile count, etc.)
 */
const WEAPON_LEVEL_BONUSES = {
  // Per level: +dmg%, -cd%, extra projectiles at certain levels
  gun:           { dmgPerLvl: 0.12, cdPerLvl: 0.05, extraBarrelsAt: [3, 6, 9] },
  sword:         { dmgPerLvl: 0.15, cdPerLvl: 0.06 },
  samuraiSword:  { dmgPerLvl: 0.14, cdPerLvl: 0.05 },
  whip:          { dmgPerLvl: 0.10, cdPerLvl: 0.04, extraChainAt: [3, 6, 9] },
  uzi:           { dmgPerLvl: 0.08, cdPerLvl: 0.06, extraBarrelsAt: [5, 8] },
  sniperRifle:   { dmgPerLvl: 0.18, cdPerLvl: 0.04, extraPierceAt: [4, 7, 10] },
  pumpShotgun:   { dmgPerLvl: 0.10, cdPerLvl: 0.05, extraPelletsAt: [3, 6, 9] },
  autoShotgun:   { dmgPerLvl: 0.08, cdPerLvl: 0.06, extraPelletsAt: [4, 7] },
  minigun:       { dmgPerLvl: 0.06, cdPerLvl: 0.08 },
  bow:           { dmgPerLvl: 0.14, cdPerLvl: 0.05, extraPierceAt: [3, 7] },
  teslaSaber:    { dmgPerLvl: 0.12, cdPerLvl: 0.05 },
  doubleBarrel:  { dmgPerLvl: 0.10, cdPerLvl: 0.05, extraPelletsAt: [3, 6, 9] },
  droneTurret:   { dmgPerLvl: 0.10, cdPerLvl: 0.06, extraDroneAt: [3, 6, 9] },
  aura:          { dmgPerLvl: 0.12, cdPerLvl: 0.05 },
  boomerang:     { dmgPerLvl: 0.12, cdPerLvl: 0.05 },
  shuriken:      { dmgPerLvl: 0.10, cdPerLvl: 0.04, extraProjAt: [3, 6, 9] },
  nanoSwarm:     { dmgPerLvl: 0.08, cdPerLvl: 0.05, extraSwarmAt: [4, 7] },
  homingMissile: { dmgPerLvl: 0.15, cdPerLvl: 0.04 },
  iceSpear:      { dmgPerLvl: 0.12, cdPerLvl: 0.05 },
  meteor:        { dmgPerLvl: 0.15, cdPerLvl: 0.06 },
  fireRing:      { dmgPerLvl: 0.10, cdPerLvl: 0.04, extraOrbAt: [3, 6, 9] },
  lightning:     { dmgPerLvl: 0.14, cdPerLvl: 0.05, extraStrikeAt: [3, 6, 9] },
  poison:        { dmgPerLvl: 0.12, cdPerLvl: 0.05 },
  fireball:      { dmgPerLvl: 0.14, cdPerLvl: 0.05 }
};

/**
 * Minimum cooldown multiplier floor — prevents cooldown from being reduced
 * below 20% of its base value (80% max reduction).
 */
const MIN_COOLDOWN_MULTIPLIER = 0.2;

/**
 * Apply level bonuses to a weapon's effective stats.
 * Call during fire logic: effectiveDamage = getEffectiveWeaponStats(weapons.gun).damage
 */
function getEffectiveWeaponStats(w, weaponId) {
  var bonuses = WEAPON_LEVEL_BONUSES[weaponId];
  if (!bonuses || !w) return Object.assign({}, w);
  if (w.level <= 1) return Object.assign({}, w);
  var lvl = w.level - 1; // bonus levels above 1
  var stats = Object.assign({}, w);
  stats.damage  = Math.round(w.damage * (1 + bonuses.dmgPerLvl * lvl));
  stats.cooldown = Math.round(w.cooldown * Math.max(MIN_COOLDOWN_MULTIPLIER, 1 - bonuses.cdPerLvl * lvl));
  // Extra projectile bonuses
  if (bonuses.extraBarrelsAt) {
    var extra = 0;
    for (var i = 0; i < bonuses.extraBarrelsAt.length; i++) { if (w.level >= bonuses.extraBarrelsAt[i]) extra++; }
    stats.barrels = (w.barrels || 1) + extra;
  }
  if (bonuses.extraPelletsAt) {
    var extra = 0;
    for (var i = 0; i < bonuses.extraPelletsAt.length; i++) { if (w.level >= bonuses.extraPelletsAt[i]) extra++; }
    stats.pellets = (w.pellets || 6) + extra * 2;
  }
  if (bonuses.extraPierceAt) {
    var extra = 0;
    for (var i = 0; i < bonuses.extraPierceAt.length; i++) { if (w.level >= bonuses.extraPierceAt[i]) extra++; }
    stats.piercing = (w.piercing || 1) + extra;
  }
  if (bonuses.extraChainAt) {
    var extra = 0;
    for (var i = 0; i < bonuses.extraChainAt.length; i++) { if (w.level >= bonuses.extraChainAt[i]) extra++; }
    stats.chainHits = (w.chainHits || 3) + extra;
  }
  if (bonuses.extraProjAt) {
    var extra = 0;
    for (var i = 0; i < bonuses.extraProjAt.length; i++) { if (w.level >= bonuses.extraProjAt[i]) extra++; }
    stats.projectiles = (w.projectiles || 3) + extra;
  }
  if (bonuses.extraSwarmAt) {
    var extra = 0;
    for (var i = 0; i < bonuses.extraSwarmAt.length; i++) { if (w.level >= bonuses.extraSwarmAt[i]) extra++; }
    stats.swarmCount = (w.swarmCount || 6) + extra * 2;
  }
  if (bonuses.extraDroneAt) {
    var extra = 0;
    for (var i = 0; i < bonuses.extraDroneAt.length; i++) { if (w.level >= bonuses.extraDroneAt[i]) extra++; }
    stats.droneCount = (w.droneCount || 1) + extra;
  }
  if (bonuses.extraOrbAt) {
    var extra = 0;
    for (var i = 0; i < bonuses.extraOrbAt.length; i++) { if (w.level >= bonuses.extraOrbAt[i]) extra++; }
    stats.orbs = (w.orbs || 3) + extra;
  }
  if (bonuses.extraStrikeAt) {
    var extra = 0;
    for (var i = 0; i < bonuses.extraStrikeAt.length; i++) { if (w.level >= bonuses.extraStrikeAt[i]) extra++; }
    stats.strikes = (w.strikes || 1) + extra;
  }
  // ── Apply permanent weapon building mods (from saveData.weaponUpgrades) ──
  if (typeof saveData !== 'undefined' && saveData.weaponUpgrades && saveData.weaponUpgrades[weaponId]) {
    var mods = saveData.weaponUpgrades[weaponId];
    // Speed mod: reduce cooldown by 8% per level
    if (mods.speed && mods.speed > 0) {
      stats.cooldown = Math.round(stats.cooldown * Math.max(MIN_COOLDOWN_MULTIPLIER, 1 - 0.08 * mods.speed));
    }
    // Power mod: increase damage by 10% per level
    if (mods.power && mods.power > 0) {
      stats.damage = Math.round(stats.damage * (1 + 0.10 * mods.power));
    }
    // Cooldown mod: reduce cooldown by 6% per level (stacks with speed)
    if (mods.cooldown && mods.cooldown > 0) {
      stats.cooldown = Math.round(stats.cooldown * Math.max(MIN_COOLDOWN_MULTIPLIER, 1 - 0.06 * mods.cooldown));
    }
    // Sight mod: increase range by 15% per level
    if (mods.sight && mods.sight > 0) {
      stats.range = stats.range ? Math.round(stats.range * (1 + 0.15 * mods.sight) * 10) / 10 : stats.range;
    }
    // Ammo type: attach elemental data to stats for combat system
    if (mods.ammoType && mods.ammoType !== 'standard') {
      stats._ammoType = mods.ammoType;
    }
    // Fire mode
    if (mods.fireMode && mods.fireMode !== 'single') {
      stats._fireMode = mods.fireMode;
    }
  }
  return stats;
}

// Camp-screen upgrade configuration (cost/increment/cap per stat).
// Referenced in game.js as UPGRADES.
const WEAPON_UPGRADES = {
  damage:         { name: "Base Damage",     cost: 100, inc: 0.1,  max: 10 },
  health:         { name: "Max Health",      cost: 100, inc: 10,   max: 10 },
  speed:          { name: "Move Speed",      cost: 150, inc: 0.05, max: 5  },
  armor:          { name: "Armor",           cost: 200, inc: 2,    max: 10 },
  magnet:         { name: "Magnet Range",    cost: 100, inc: 0.5,  max: 5  },
  projectileSize: { name: "Projectile Size", cost: 120, inc: 0.08, max: 8  },
  cooldownReduce: { name: "Cooldown Reduce", cost: 150, inc: 0.03, max: 10 },
  projectileCount:{ name: "Extra Projectile",cost: 200, inc: 1,    max: 5  }
};

window.GameWeapons = {
  WEAPON_CATEGORIES,
  getDefaultWeapons,
  WEAPON_LEVEL_BONUSES,
  MIN_COOLDOWN_MULTIPLIER,
  getEffectiveWeaponStats,
  WEAPON_UPGRADES
};
