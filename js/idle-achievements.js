// Exposes window.GameAchievements for use by main.js
// Achievement system with permanent stat bonuses

(function () {
var ACHIEVEMENTS = [
  // Combat
  { id: 'combat_1',    name: 'First Blood',      description: 'Kill 100 enemies',      category: 'Combat',    requirement: { stat: 'totalKills', value: 100 },   bonus: { type: 'damage', pct: 1 },    attrPoints: 1 },
  { id: 'combat_2',    name: 'Warrior',          description: 'Kill 500 enemies',      category: 'Combat',    requirement: { stat: 'totalKills', value: 500 },   bonus: { type: 'damage', pct: 2 },    attrPoints: 1 },
  { id: 'combat_3',    name: 'Veteran',          description: 'Kill 1000 enemies',     category: 'Combat',    requirement: { stat: 'totalKills', value: 1000 },  bonus: { type: 'damage', pct: 3 },    attrPoints: 1 },
  { id: 'combat_4',    name: 'Warlord',          description: 'Kill 5000 enemies',     category: 'Combat',    requirement: { stat: 'totalKills', value: 5000 },  bonus: { type: 'damage', pct: 5 },    attrPoints: 2 },

  // Survival
  { id: 'survive_1',   name: 'Tough Cookie',     description: 'Survive 60 seconds',    category: 'Survival',  requirement: { stat: 'longestSurvival', value: 60 },  bonus: { type: 'maxHp', pct: 2 },  attrPoints: 1 },
  { id: 'survive_2',   name: 'Enduring',         description: 'Survive 180 seconds',   category: 'Survival',  requirement: { stat: 'longestSurvival', value: 180 }, bonus: { type: 'maxHp', pct: 4 },  attrPoints: 1 },
  { id: 'survive_3',   name: 'Resilient',        description: 'Survive 300 seconds',   category: 'Survival',  requirement: { stat: 'longestSurvival', value: 300 }, bonus: { type: 'maxHp', pct: 6 },  attrPoints: 1 },
  { id: 'survive_4',   name: 'Immortal',         description: 'Survive 600 seconds',   category: 'Survival',  requirement: { stat: 'longestSurvival', value: 600 }, bonus: { type: 'maxHp', pct: 10 }, attrPoints: 2 },

  // Wealth
  { id: 'wealth_1',    name: 'Coin Collector',   description: 'Earn 1000 total gold',  category: 'Wealth',    requirement: { stat: 'totalGoldEarned', value: 1000 },   bonus: { type: 'goldBonus', pct: 5 },  attrPoints: 1 },
  { id: 'wealth_2',    name: 'Merchant',         description: 'Earn 5000 total gold',  category: 'Wealth',    requirement: { stat: 'totalGoldEarned', value: 5000 },   bonus: { type: 'goldBonus', pct: 10 }, attrPoints: 1 },
  { id: 'wealth_3',    name: 'Tycoon',           description: 'Earn 25000 total gold',  category: 'Wealth',    requirement: { stat: 'totalGoldEarned', value: 25000 },  bonus: { type: 'goldBonus', pct: 15 }, attrPoints: 1 },
  { id: 'wealth_4',    name: 'Plutocrat',        description: 'Earn 100000 total gold', category: 'Wealth',    requirement: { stat: 'totalGoldEarned', value: 100000 }, bonus: { type: 'goldBonus', pct: 25 }, attrPoints: 2 },

  // Clicker
  { id: 'clicker_1',   name: 'Water Seeker',     description: 'Click fountain 100 times',  category: 'Clicker',   requirement: { stat: 'totalClicks', value: 100 },  bonus: { type: 'clickPower', pct: 10 }, attrPoints: 1 },
  { id: 'clicker_2',   name: 'Fountain Friend',  description: 'Click fountain 500 times',  category: 'Clicker',   requirement: { stat: 'totalClicks', value: 500 },  bonus: { type: 'clickPower', pct: 25 }, attrPoints: 1 },
  { id: 'clicker_3',   name: 'Drop Master',      description: 'Click fountain 2000 times', category: 'Clicker',   requirement: { stat: 'totalClicks', value: 2000 }, bonus: { type: 'clickPower', pct: 50 }, attrPoints: 1 },

  // Explorer
  { id: 'explorer_1',  name: 'Pathfinder',       description: 'Complete 5 expeditions',  category: 'Explorer',  requirement: { stat: 'totalExpeditions', value: 5 },  bonus: { type: 'expeditionRewards', pct: 10 }, attrPoints: 1 },
  { id: 'explorer_2',  name: 'Adventurer',       description: 'Complete 20 expeditions', category: 'Explorer',  requirement: { stat: 'totalExpeditions', value: 20 }, bonus: { type: 'expeditionRewards', pct: 20 }, attrPoints: 1 },
  { id: 'explorer_3',  name: 'Trailblazer',      description: 'Complete 50 expeditions', category: 'Explorer',  requirement: { stat: 'totalExpeditions', value: 50 }, bonus: { type: 'expeditionRewards', pct: 40 }, attrPoints: 1 },

  // Ascension
  { id: 'ascend_1',    name: 'Reborn',           description: 'Ascend 1 time',   category: 'Ascension', requirement: { stat: 'totalAscensions', value: 1 },  bonus: { type: 'allStats', pct: 5 },  attrPoints: 1 },
  { id: 'ascend_2',    name: 'Transcendent',     description: 'Ascend 3 times',  category: 'Ascension', requirement: { stat: 'totalAscensions', value: 3 },  bonus: { type: 'allStats', pct: 10 }, attrPoints: 1 },
  { id: 'ascend_3',    name: 'Ascendant',        description: 'Ascend 5 times',  category: 'Ascension', requirement: { stat: 'totalAscensions', value: 5 },  bonus: { type: 'allStats', pct: 20 }, attrPoints: 2 },
  { id: 'ascend_4',    name: 'Eternal',          description: 'Ascend 10 times', category: 'Ascension', requirement: { stat: 'totalAscensions', value: 10 }, bonus: { type: 'allStats', pct: 50 }, attrPoints: 2 }
];

function getAchievementsDefaults() {
  return {
    unlocked: {}
  };
}

// Guard: the game's saveData.achievements is an Array (claimed-ID list), whereas the
// idle system needs an Object with an 'unlocked' map.  Returns true only when the field
// has the correct idle-system shape.
function _isIdleAchievementsData(raw) {
  return !!(raw && !Array.isArray(raw) && typeof raw === 'object' && raw.unlocked);
}

function checkAchievements(saveData) {
  var raw = saveData.achievements;
  var ach = _isIdleAchievementsData(raw) ? raw : getAchievementsDefaults();
  var stats = saveData.statistics || saveData.stats || {};
  var newly = [];

  for (var i = 0; i < ACHIEVEMENTS.length; i++) {
    var def = ACHIEVEMENTS[i];
    if (ach.unlocked[def.id]) continue;
    var statVal = stats[def.requirement.stat] || 0;
    if (statVal >= def.requirement.value) {
      ach.unlocked[def.id] = Date.now();
      newly.push(def);
      // Award core attribute points for this achievement
      if (def.attrPoints && saveData.account) {
        saveData.account.coreAttributePoints = (saveData.account.coreAttributePoints || 0) + def.attrPoints;
      }
    }
  }

  saveData.achievements = ach;
  return newly;
}

function getAchievementBonuses(saveData) {
  var raw = saveData.achievements;
  var ach = _isIdleAchievementsData(raw) ? raw : getAchievementsDefaults();
  var bonuses = {
    damage: 0,
    maxHp: 0,
    goldBonus: 0,
    clickPower: 0,
    expeditionRewards: 0,
    allStats: 0
  };

  for (var i = 0; i < ACHIEVEMENTS.length; i++) {
    var def = ACHIEVEMENTS[i];
    if (!ach.unlocked[def.id]) continue;
    bonuses[def.bonus.type] = (bonuses[def.bonus.type] || 0) + def.bonus.pct;
  }

  return bonuses;
}

window.GameAchievements = {
  ACHIEVEMENTS: ACHIEVEMENTS,
  getAchievementsDefaults: getAchievementsDefaults,
  isIdleAchievementsData: _isIdleAchievementsData,
  checkAchievements: checkAchievements,
  getAchievementBonuses: getAchievementBonuses
};
})();
