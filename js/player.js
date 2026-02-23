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
    doubleUpgradeChance: 0
  };
}

window.GamePlayer = {
  getDefaultPlayerStats
};
