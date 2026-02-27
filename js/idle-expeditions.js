// Exposes window.GameExpeditions for use by main.js
// Companion expedition system: send, check, reward rolling

(function () {
var EXPEDITION_DEFS = [
  {
    id: 'short_scout',
    name: 'Short Scout',
    duration: 5 * 60 * 1000,
    difficulty: 1,
    rewards: { goldMin: 20, goldMax: 60, materialChance: 0.2, gearChance: 0.05 }
  },
  {
    id: 'forest_patrol',
    name: 'Forest Patrol',
    duration: 15 * 60 * 1000,
    difficulty: 2,
    rewards: { goldMin: 80, goldMax: 180, materialChance: 0.4, gearChance: 0.1 }
  },
  {
    id: 'dungeon_delve',
    name: 'Dungeon Delve',
    duration: 30 * 60 * 1000,
    difficulty: 3,
    rewards: { goldMin: 200, goldMax: 450, materialChance: 0.6, gearChance: 0.18 }
  },
  {
    id: 'dragon_hunt',
    name: 'Dragon Hunt',
    duration: 60 * 60 * 1000,
    difficulty: 4,
    rewards: { goldMin: 500, goldMax: 1000, materialChance: 0.75, gearChance: 0.3 }
  },
  {
    id: 'ancient_ruins',
    name: 'Ancient Ruins',
    duration: 4 * 60 * 60 * 1000,
    difficulty: 5,
    rewards: { goldMin: 2000, goldMax: 4500, materialChance: 0.9, gearChance: 0.5 }
  },
  {
    id: 'titan_raid',
    name: 'Titan Raid',
    duration: 8 * 60 * 60 * 1000,
    difficulty: 6,
    rewards: { goldMin: 5000, goldMax: 12000, materialChance: 1.0, gearChance: 0.75 }
  }
];

var GEAR_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
var MAX_CONCURRENT = 3;

function getExpeditionDefaults() {
  return {
    activeExpeditions: [],
    completedExpeditions: [],
    companions: []
  };
}

function getExpeditionById(id) {
  for (var i = 0; i < EXPEDITION_DEFS.length; i++) {
    if (EXPEDITION_DEFS[i].id === id) return EXPEDITION_DEFS[i];
  }
  return null;
}

function startExpedition(companionId, expeditionId, saveData) {
  var expData = saveData.expeditions || getExpeditionDefaults();
  var active = expData.activeExpeditions || [];

  if (active.length >= MAX_CONCURRENT) {
    return { success: false, reason: 'Max concurrent expeditions reached (' + MAX_CONCURRENT + ')' };
  }

  for (var i = 0; i < active.length; i++) {
    if (active[i].companionId === companionId) {
      return { success: false, reason: 'Companion already on expedition' };
    }
  }

  var expDef = getExpeditionById(expeditionId);
  if (!expDef) {
    return { success: false, reason: 'Unknown expedition: ' + expeditionId };
  }

  var companions = expData.companions || [];
  var companion = null;
  for (var j = 0; j < companions.length; j++) {
    if (companions[j].id === companionId) { companion = companions[j]; break; }
  }
  if (!companion) {
    return { success: false, reason: 'Unknown companion: ' + companionId };
  }

  var now = Date.now();
  active.push({
    companionId: companionId,
    expeditionId: expeditionId,
    startTime: now,
    endTime: now + expDef.duration
  });

  expData.activeExpeditions = active;
  saveData.expeditions = expData;
  return { success: true, endTime: now + expDef.duration, expeditionName: expDef.name };
}

function rollExpeditionRewards(expDef, companionLevel) {
  var level = companionLevel || 1;
  var levelBonus = 1 + (level - 1) * 0.05;

  var goldRange = expDef.rewards.goldMax - expDef.rewards.goldMin;
  var gold = Math.floor((expDef.rewards.goldMin + Math.random() * goldRange) * levelBonus);

  var materials = null;
  if (Math.random() < expDef.rewards.materialChance) {
    materials = Math.floor((1 + Math.random() * expDef.difficulty) * levelBonus);
  }

  var gear = null;
  if (Math.random() < expDef.rewards.gearChance) {
    var rarityIndex = Math.min(
      GEAR_RARITIES.length - 1,
      Math.floor(Math.random() * (expDef.difficulty * 0.6 + level * 0.1))
    );
    gear = { rarity: GEAR_RARITIES[rarityIndex] };
  }

  return { gold: gold, materials: materials, gear: gear };
}

function checkExpeditions(saveData) {
  var expData = saveData.expeditions || getExpeditionDefaults();
  var active = expData.activeExpeditions || [];
  var completed = [];
  var remaining = [];
  var now = Date.now();

  for (var i = 0; i < active.length; i++) {
    var slot = active[i];
    if (now >= slot.endTime) {
      var expDef = getExpeditionById(slot.expeditionId);
      if (!expDef) continue;

      var companions = expData.companions || [];
      var companionLevel = 1;
      for (var j = 0; j < companions.length; j++) {
        if (companions[j].id === slot.companionId) {
          companionLevel = companions[j].level || 1;
          break;
        }
      }

      var rewards = rollExpeditionRewards(expDef, companionLevel);
      completed.push({
        companionId: slot.companionId,
        expeditionId: slot.expeditionId,
        expeditionName: expDef.name,
        rewards: rewards
      });
    } else {
      remaining.push(slot);
    }
  }

  expData.activeExpeditions = remaining;
  var history = expData.completedExpeditions || [];
  for (var k = 0; k < completed.length; k++) {
    history.push({ id: completed[k].expeditionId, completedAt: now });
  }
  if (history.length > 50) history = history.slice(history.length - 50);
  expData.completedExpeditions = history;
  saveData.expeditions = expData;

  return completed;
}

window.GameExpeditions = {
  EXPEDITION_DEFS: EXPEDITION_DEFS,
  MAX_CONCURRENT: MAX_CONCURRENT,
  getExpeditionDefaults: getExpeditionDefaults,
  getExpeditionById: getExpeditionById,
  startExpedition: startExpedition,
  rollExpeditionRewards: rollExpeditionRewards,
  checkExpeditions: checkExpeditions
};
})();
