// --- PLAYER STATS DEFINITIONS ---
// Extracted from game.js - loaded as a regular script before the game.js ES module
// Exposes window.GamePlayer for use by game.js

/**
 * Returns a fresh default player-stats object for the start of a new run.
 * The returned object is mutable; game.js assigns it to `const playerStats`
 * so all existing property accesses (playerStats.hp, etc.) continue unchanged.
 *
 * @param {number} baseExpReq - Initial XP requirement for level 2 (GAME_CONFIG.baseExpReq)
 * @returns {Object} Mutable player stats object
 */
function getDefaultPlayerStats(baseExpReq) {
  return {
    lvl: 1,
    exp: 0,
    expReq: baseExpReq || 20,
    hp: 100,
    maxHp: 100,
    strength: 1,
    armor: 0,         // Percentage reduction (0–100)
    speed: 1,         // Multiplier
    critChance: 0.1,
    critDmg: 1.5,     // 150% base crit damage
    damage: 1,        // Multiplier
    atkSpeed: 1,      // Multiplier
    walkSpeed: 25,    // Display value
    kills: 0,
    hpRegen: 0,
    gold: 0,
    survivalTime: 0,
    dashesPerformed: 0,
    damageTaken: 0,
    weaponsUnlocked: 0,
    miniBossesDefeated: 0,
    // Perk System
    perks: {
      vampire: 0,    // Life steal %
      juggernaut: 0, // Damage reduction %
      swift: 0,      // Move speed %
      lucky: 0,      // Crit chance %
      berserker: 0   // Low HP attack speed bonus
    },
    // Skill upgrades
    dashCooldownReduction: 0,
    dashDistanceBonus: 0,
    hasSecondWind: false,
    lifeStealPercent: 0,
    thornsPercent: 0,
    hasBerserkerRage: false,
    treasureHunterChance: 0,
    doubleCritChance: 0,
    extraProjectiles: 0,
    doubleCastChance: 0,
    doubleUpgradeChance: 0,
    // ── NEW RPG STATS (applied from SKILL_TREE bonuses in resetGame) ──
    // Defensive
    dodgeChance: 0,        // 0–1: chance to fully dodge an incoming hit
    damageReduction: 0,    // 0–1: extra flat damage reduction (stacks after armor)
    hasLastStand: false,   // survive one fatal blow per run (once)
    lastStandUsed: false,  // tracks whether last-stand has fired this run
    // Offensive
    healOnKill: 0,         // flat HP healed per kill
    lowHpDamage: 0,        // bonus damage fraction when player HP < 50%
    executeDamage: 0,      // bonus damage fraction vs enemies below 30% HP
    armorPenetration: 0,   // fraction of enemy armor ignored (0–1)
    multiHitChance: 0,     // chance to strike twice with each attack
    weaponDamage: 0,       // additive % bonus applied to all weapon damage
    // Utility
    pickupRange: 1.0,      // multiplier for XP/gold pickup radius
    dropRate: 1.0,         // multiplier for item drop rate
    auraRange: 1.0,        // multiplier for aura-weapon radius
    // Elemental — player's elemental bonuses
    fireDamage: 0,         // % bonus to fire-type damage
    iceDamage: 0,          // % bonus to ice-type damage
    lightningDamage: 0,    // % bonus to lightning-type damage
    elementalDamage: 0,    // % bonus to ALL elemental damage (stacks with specific)
    burnChance: 0,         // extra chance to apply burn on fire hits
    slowChance: 0,         // extra chance to slow on ice hits
    chainChance: 0,        // extra chance for lightning to chain
    chainCount: 0,         // extra chain targets for lightning
    freezeChance: 0,       // chance to freeze (full stop) on ice hits
    burnSpread: false,     // burns spread to nearby enemies
    spellEchoChance: 0,    // chance elemental effect fires twice
    elementalChain: 0,     // number of extra elemental chain jumps
    elementalGuaranteed: false, // elemental effects always trigger
    // Elemental — damage bonus by element
    fireDmgBonus: 0,       // % bonus to fire damage output
    iceResist: 0,          // % reduction from incoming ice damage
    fireResist: 0,         // % reduction from incoming fire damage
    poisonDamage: 0,       // % bonus to poison damage output
    poisonResist: 0,       // % reduction from incoming poison damage
    lightningDmgBonus: 0,  // % bonus to lightning damage output
    lightningResist: 0,    // % reduction from incoming lightning damage
    // Offense (granular)
    meleeDamage: 0,        // additive bonus to melee hit damage
    projectileDamage: 0,   // additive bonus to projectile damage
    meleeAttackSpeed: 1.0, // multiplier for melee swing rate
    projectileFireRate: 1.0, // multiplier for projectile fire rate
    projectileSpeed: 1.0,  // multiplier for projectile travel speed
    projectileSize: 1.0,   // multiplier for projectile hitbox/visual size
    // Cooldowns
    meleeCooldown: 1.0,    // multiplier for melee cooldown (lower = faster)
    skillCooldown: 1.0,    // multiplier for active skill cooldown
    dashCooldown: 1.0,     // multiplier for dash/dodge cooldown
    // Movement
    baseMovementSpeed: 1.0, // multiplier for walk speed
    sprintDashSpeed: 1.0,   // multiplier for sprint/dash speed
    // Defense / Utility
    lifesteal: 0,           // fraction of damage dealt returned as HP
    dodgeChanceBonus: 0,    // additional flat dodge chance (stacks with dodgeChance)
    hpRegenRate: 0,         // HP regenerated per second (flat)
    // Economy
    goldDropBonus: 0,       // additive % bonus to gold dropped by enemies
    expGainBonus: 0,        // additive % bonus to all EXP gained
    itemDropRate: 1.0,      // multiplier for item drop chance (Luck)
    // Mobility (Flexibility stat)
    mobilityScore: 1.0,    // overall mobility: affects turn speed, dash fluidity
    turnResponse: 1.0,     // how quickly player changes direction (scales with flexibility)
    stopResponse: 1.0      // how quickly player stops (scales with flexibility)
  };
}

window.GamePlayer = {
  getDefaultPlayerStats
};
