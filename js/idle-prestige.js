// Exposes window.GamePrestige for use by main.js
// Prestige/ascension system: ascend, skill tree, bonuses

(function () {
var ASCENSION_SKILLS = [
  { id: 'gold_rush',        name: 'Gold Rush',          maxLevel: 5,  costs: [1,2,4,8,16],    desc: '+10% gold per level' },
  { id: 'stat_boost',       name: 'Stat Boost',         maxLevel: 5,  costs: [1,2,4,8,16],    desc: '+5% all stats per level' },
  { id: 'idle_master',      name: 'Idle Master',        maxLevel: 5,  costs: [1,2,4,8,16],    desc: '+20% idle gains per level' },
  { id: 'lucky_start',      name: 'Lucky Start',        maxLevel: 3,  costs: [2,5,12],         desc: 'Start with random gear' },
  { id: 'expedition_expert',name: 'Expedition Expert',  maxLevel: 5,  costs: [1,3,6,12,24],   desc: '+15% expedition rewards per level' },
  { id: 'click_power',      name: 'Click Power',        maxLevel: 5,  costs: [1,2,4,8,16],    desc: '+25% click damage per level' },
  { id: 'hp_surge',         name: 'HP Surge',           maxLevel: 5,  costs: [1,2,4,8,16],    desc: '+10% max HP per level' },
  { id: 'crit_lord',        name: 'Crit Lord',          maxLevel: 5,  costs: [2,4,8,16,32],   desc: '+5% crit chance per level' },
  { id: 'speed_demon',      name: 'Speed Demon',        maxLevel: 3,  costs: [2,5,12],         desc: '+5% move speed per level' },
  { id: 'essence_magnet',   name: 'Essence Magnet',     maxLevel: 5,  costs: [1,2,4,8,16],    desc: '+10% essence gain per level' }
];

var ASCENSION_REQUIREMENTS = {
  MIN_LEVEL: 50,
  MIN_TOTAL_GOLD: 10000
};

function getPrestigeDefaults() {
  return {
    ascensionCount: 0,
    ascensionPoints: 0,
    totalAscensionPoints: 0,
    skills: {},
    totalGoldEarned: 0
  };
}

function calculateAscensionPoints(totalGoldEarned, ascensionCount) {
  return Math.floor(
    Math.sqrt(totalGoldEarned / 1000) * (1 + ascensionCount * 0.1)
  );
}

function canAscend(saveData) {
  var playerLevel = saveData.playerLevel || 1;
  var prestige = saveData.prestige || getPrestigeDefaults();
  var totalGold = prestige.totalGoldEarned || saveData.totalGoldEarned || 0;

  if (playerLevel < ASCENSION_REQUIREMENTS.MIN_LEVEL) {
    return { can: false, reason: 'Need level ' + ASCENSION_REQUIREMENTS.MIN_LEVEL + ' (currently ' + playerLevel + ')' };
  }
  if (totalGold < ASCENSION_REQUIREMENTS.MIN_TOTAL_GOLD) {
    return { can: false, reason: 'Need ' + ASCENSION_REQUIREMENTS.MIN_TOTAL_GOLD + ' total gold earned' };
  }
  return { can: true };
}

function performAscension(saveData) {
  var check = canAscend(saveData);
  if (!check.can) return { success: false, reason: check.reason };

  var prestige = saveData.prestige || getPrestigeDefaults();
  var totalGold = prestige.totalGoldEarned || saveData.totalGoldEarned || 0;
  var count = prestige.ascensionCount || 0;

  var pointsEarned = calculateAscensionPoints(totalGold, count);
  prestige.ascensionCount = count + 1;
  prestige.ascensionPoints = (prestige.ascensionPoints || 0) + pointsEarned;
  prestige.totalAscensionPoints = (prestige.totalAscensionPoints || 0) + pointsEarned;
  prestige.totalGoldEarned = 0;

  // Reset run progress; player starts back at level 1 (min ascension requirement is level 50)
  saveData.gold = 0;
  saveData.playerLevel = 1;
  saveData.prestige = prestige;

  // Reset idle progress
  if (saveData.idle) {
    saveData.idle.totalIdleGoldEarned = 0;
    saveData.idle.totalIdleStatPoints = 0;
  }

  // Reset clicker run progress (essence and upgrades reset; gems/achievements/account/wheel persist)
  if (saveData.clicker) {
    saveData.clicker.essence = 0;
    saveData.clicker.clickPowerTier = 0;
    saveData.clicker.autoClickerLevel = 0;
  }
  saveData.essence = 0;
  if (saveData.shop) {
    saveData.shop.stock = [];
  }

  return {
    success: true,
    pointsEarned: pointsEarned,
    totalPoints: prestige.ascensionPoints,
    ascensionCount: prestige.ascensionCount
  };
}

function getSkillById(id) {
  for (var i = 0; i < ASCENSION_SKILLS.length; i++) {
    if (ASCENSION_SKILLS[i].id === id) return ASCENSION_SKILLS[i];
  }
  return null;
}

function purchaseSkill(skillId, saveData) {
  var prestige = saveData.prestige || getPrestigeDefaults();
  var skill = getSkillById(skillId);
  if (!skill) return { success: false, reason: 'Unknown skill: ' + skillId };

  var skills = prestige.skills || {};
  var currentLevel = skills[skillId] || 0;
  if (currentLevel >= skill.maxLevel) {
    return { success: false, reason: 'Skill at max level' };
  }

  var cost = skill.costs[currentLevel];
  if ((prestige.ascensionPoints || 0) < cost) {
    return { success: false, reason: 'Not enough ascension points', cost: cost };
  }

  prestige.ascensionPoints -= cost;
  skills[skillId] = currentLevel + 1;
  prestige.skills = skills;
  saveData.prestige = prestige;
  return { success: true, newLevel: skills[skillId] };
}

function getAscensionBonuses(saveData) {
  var prestige = saveData.prestige || getPrestigeDefaults();
  var skills = prestige.skills || {};

  return {
    goldBonus:          1 + (skills.gold_rush || 0) * 0.10,
    statBonus:          1 + (skills.stat_boost || 0) * 0.05,
    idleGainsBonus:     1 + (skills.idle_master || 0) * 0.20,
    luckyStart:         skills.lucky_start || 0,
    expeditionBonus:    1 + (skills.expedition_expert || 0) * 0.15,
    clickPowerBonus:    1 + (skills.click_power || 0) * 0.25,
    maxHpBonus:         1 + (skills.hp_surge || 0) * 0.10,
    critChanceBonus:    (skills.crit_lord || 0) * 0.05,
    moveSpeedBonus:     1 + (skills.speed_demon || 0) * 0.05,
    essenceBonus:       1 + (skills.essence_magnet || 0) * 0.10
  };
}

window.GamePrestige = {
  ASCENSION_SKILLS: ASCENSION_SKILLS,
  ASCENSION_REQUIREMENTS: ASCENSION_REQUIREMENTS,
  getPrestigeDefaults: getPrestigeDefaults,
  calculateAscensionPoints: calculateAscensionPoints,
  canAscend: canAscend,
  performAscension: performAscension,
  getSkillById: getSkillById,
  purchaseSkill: purchaseSkill,
  getAscensionBonuses: getAscensionBonuses
};
})();
