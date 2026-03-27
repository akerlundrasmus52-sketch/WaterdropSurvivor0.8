// Exposes window.GameDailies for use by main.js
// Daily login tracker and daily quest system

(function () {
var DAILY_LOGIN_REWARDS = [
  { day: 1,  icon: '💰', label: '100 Gold', gold: 100 },
  { day: 2,  icon: '⭐', label: '1 Skill Point', skillPoints: 1 },
  { day: 3,  icon: '💰', label: '200 Gold', gold: 200 },
  { day: 4,  icon: '💎', label: '1 Attribute Point', attributePoints: 1 },
  { day: 5,  icon: '💰⭐', label: '300 Gold + 1 Skill Point', gold: 300, skillPoints: 1 },
  { day: 6,  icon: '⭐⭐', label: '2 Skill Points', skillPoints: 2 },
  { day: 7,  icon: '🪵', label: '500 Gold + 15 Wood + 15 Stone', gold: 500, wood: 15, stone: 15 },
  { day: 8,  icon: '💎💰', label: '1 Attr Point + 150 Gold', attributePoints: 1, gold: 150 },
  { day: 9,  icon: '💎💎', label: '2 Attribute Points', attributePoints: 2 },
  { day: 10, icon: '💰', label: '750 Gold', gold: 750 },
  { day: 11, icon: '⭐⭐⭐', label: '3 Skill Points', skillPoints: 3 },
  { day: 12, icon: '💰💎', label: '500 Gold + 2 Attr Points', gold: 500, attributePoints: 2 },
  { day: 13, icon: '⭐💎', label: '2 Skill Points + 1 Attr Point', skillPoints: 2, attributePoints: 1 },
  { day: 14, icon: '💰⭐', label: '1000 Gold + 3 Skill Points', gold: 1000, skillPoints: 3 },
  { day: 15, icon: '🔴', label: 'Crimson Weapon Skin', skinColor: 'crimson' },
  { day: 16, icon: '⭐⭐⭐⭐', label: '4 Skill Points', skillPoints: 4 },
  { day: 17, icon: '💰💎', label: '800 Gold + 3 Attr Points', gold: 800, attributePoints: 3 },
  { day: 18, icon: '⭐⭐⭐⭐⭐', label: '5 Skill Points', skillPoints: 5 },
  { day: 19, icon: '💰', label: '1200 Gold', gold: 1200 },
  { day: 20, icon: '💎⭐', label: '4 Attr Points + 2 Skill Points', attributePoints: 4, skillPoints: 2 },
  { day: 21, icon: '💰⭐', label: '1500 Gold + 5 Skill Points', gold: 1500, skillPoints: 5 },
  { day: 22, icon: '🪨', label: '15 Wood + 15 Stone', wood: 15, stone: 15 },
  { day: 23, icon: '⭐⭐⭐⭐⭐⭐', label: '6 Skill Points', skillPoints: 6 },
  { day: 24, icon: '💰💎', label: '2000 Gold + 4 Attr Points', gold: 2000, attributePoints: 4 },
  { day: 25, icon: '⭐💎', label: '8 Skill Points + 3 Attr Points', skillPoints: 8, attributePoints: 3 },
  { day: 26, icon: '💰', label: '2500 Gold', gold: 2500 },
  { day: 27, icon: '⭐', label: '10 Skill Points', skillPoints: 10 },
  { day: 28, icon: '💎💰', label: '5 Attr Points + 3000 Gold', attributePoints: 5, gold: 3000 },
  { day: 29, icon: '⭐💎', label: '15 Skill Points + 5 Attr Points', skillPoints: 15, attributePoints: 5 },
  { day: 30, icon: '🏆', label: '5000 Gold + Random Starting Weapon', gold: 5000, randomWeapon: true }
];

var QUEST_POOL = [
  { type: 'kill_enemies',       label: 'Defeat enemies',        unit: 'kills' },
  { type: 'survive_seconds',    label: 'Survive',               unit: 'seconds' },
  { type: 'earn_gold',          label: 'Earn gold in one run',  unit: 'gold' },
  { type: 'perform_dashes',     label: 'Perform dashes',        unit: 'dashes' },
  { type: 'defeat_miniboss',    label: 'Defeat a mini-boss',    unit: 'bosses' },
  { type: 'click_fountain',     label: 'Click the fountain',    unit: 'clicks' },
  { type: 'complete_expedition',label: 'Complete an expedition', unit: 'expeditions' }
];

var DAILY_QUESTS_COUNT = 3;
var MS_PER_DAY = 24 * 60 * 60 * 1000;

function getDailiesDefaults() {
  return {
    lastLoginDate: 0,
    loginStreak: 0,
    lastLoginRewardDay: 0,
    lastDailyReset: 0,
    dailyQuests: [],
    dailyQuestProgress: {}
  };
}

function shouldResetDailies(saveData) {
  var dailies = saveData.dailies || getDailiesDefaults();
  var now = Date.now();
  return (now - (dailies.lastDailyReset || 0)) >= MS_PER_DAY;
}

function _isSameDay(ts1, ts2) {
  var d1 = new Date(ts1), d2 = new Date(ts2);
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

// Read-only check: returns true if today's daily reward has NOT been claimed yet.
// Does NOT modify saveData — safe to call from render/UI code.
function isDailyAvailable(saveData) {
  var dailies = saveData.dailies || getDailiesDefaults();
  var lastLogin = dailies.lastLoginDate || 0;
  if (lastLogin > 0 && _isSameDay(lastLogin, Date.now())) {
    return false; // already claimed today
  }
  return true; // reward available
}

// Peek at what the next reward will be without claiming.
// Does NOT modify saveData.
function peekDailyReward(saveData) {
  var dailies = saveData.dailies || getDailiesDefaults();
  var now = Date.now();
  var lastLogin = dailies.lastLoginDate || 0;
  if (lastLogin > 0 && _isSameDay(lastLogin, now)) {
    return { alreadyClaimed: true };
  }
  var streak = dailies.loginStreak || 0;
  // Check if streak would reset (missed 2+ days)
  if (lastLogin > 0) {
    var d1 = new Date(lastLogin), d2 = new Date(now);
    d1.setHours(0, 0, 0, 0);
    d2.setHours(0, 0, 0, 0);
    var daysDiff = Math.round((d2 - d1) / (24 * 60 * 60 * 1000));
    if (daysDiff >= 2) streak = 0;
  }
  var nextStreak = streak + 1;
  var rewardDay = ((nextStreak - 1) % DAILY_LOGIN_REWARDS.length);
  var reward = DAILY_LOGIN_REWARDS[rewardDay];
  return {
    alreadyClaimed: false,
    streak: nextStreak,
    day: rewardDay + 1,
    gold: reward.gold,
    item: reward.item,
    essence: reward.essence || 0,
    spinTokens: reward.spinTokens || 0,
    label: reward.label || ''
  };
}

function checkDailyLogin(saveData) {
  var dailies = saveData.dailies || getDailiesDefaults();
  var now = Date.now();

  var lastLogin = dailies.lastLoginDate || 0;

  // Already logged in today (calendar day)
  if (lastLogin > 0 && _isSameDay(lastLogin, now)) {
    return { alreadyClaimed: true };
  }

  // Missed a day → reset streak (more than 1 calendar day has passed)
  if (lastLogin > 0) {
    var d1 = new Date(lastLogin), d2 = new Date(now);
    d1.setHours(0, 0, 0, 0);
    d2.setHours(0, 0, 0, 0);
    var daysDiff = Math.round((d2 - d1) / (24 * 60 * 60 * 1000));
    if (daysDiff >= 2) {
      dailies.loginStreak = 0;
    }
  }

  dailies.loginStreak = (dailies.loginStreak || 0) + 1;
  var rewardDay = ((dailies.loginStreak - 1) % DAILY_LOGIN_REWARDS.length);
  var reward = DAILY_LOGIN_REWARDS[rewardDay];
  dailies.lastLoginDate = now;
  dailies.lastLoginRewardDay = rewardDay + 1;
  saveData.dailies = dailies;

  // Grant reward items
  if (reward.skillPoints) {
    saveData.skillPoints = (saveData.skillPoints || 0) + reward.skillPoints;
  }
  if (reward.attributePoints) {
    saveData.attributePoints = (saveData.attributePoints || 0) + reward.attributePoints;
  }
  if (reward.accountXP && window.GameAccount && typeof window.GameAccount.addXP === 'function') {
    window.GameAccount.addXP(reward.accountXP, 'Daily Reward', saveData);
  }
  if (reward.randomWeapon) {
    // Use canonical sandbox internal weapon keys so saveData.unlockedStartWeapons entries
    // can be activated directly via weapons[id] in sandbox-loop.js
    var _allWeapons = ['gun','pumpShotgun','sniperRifle','uzi','fireRing','iceSpear','lightning','meteor','sword','homingMissile'];
    var _wonWeapon = _allWeapons[Math.floor(Math.random() * _allWeapons.length)];
    saveData.unlockedStartWeapons = saveData.unlockedStartWeapons || [];
    if (saveData.unlockedStartWeapons.indexOf(_wonWeapon) === -1) saveData.unlockedStartWeapons.push(_wonWeapon);
  }
  // Special items — persist to saveData.specialItems so the game can act on them
  if (reward.specialItem) {
    saveData.specialItems = saveData.specialItems || {};
    saveData.specialItems[reward.specialItem] = (saveData.specialItems[reward.specialItem] || 0) + 1;
  }
  // Weapon skin unlocks — persist to saveData.unlockedSkins array
  if (reward.skinColor) {
    saveData.unlockedSkins = saveData.unlockedSkins || [];
    if (saveData.unlockedSkins.indexOf(reward.skinColor) === -1) {
      saveData.unlockedSkins.push(reward.skinColor);
    }
  }
  if (reward.essence) {
    if (saveData.clicker && typeof saveData.clicker.essence === 'number') {
      saveData.clicker.essence += reward.essence;
    } else {
      saveData.essence = (saveData.essence || 0) + reward.essence;
    }
  }
  if (reward.spinTokens) {
    saveData.spinTokens = (saveData.spinTokens || 0) + reward.spinTokens;
  }
  // Wood and stone resource grants
  if (reward.wood || reward.stone) {
    if (!saveData.resources) saveData.resources = {};
    if (reward.wood)  saveData.resources.wood  = (saveData.resources.wood  || 0) + reward.wood;
    if (reward.stone) saveData.resources.stone = (saveData.resources.stone || 0) + reward.stone;
  }
  // Always grant account XP for daily claim
  if (window.GameAccount && typeof window.GameAccount.addXP === 'function') {
    window.GameAccount.addXP(30, 'Daily Reward', saveData);
  }

  return {
    alreadyClaimed: false,
    streak: dailies.loginStreak,
    day: rewardDay + 1,
    gold: reward.gold || 0,
    item: reward.item || null,
    essence: reward.essence || 0,
    spinTokens: reward.spinTokens || 0,
    skillPoints: reward.skillPoints || 0,
    attributePoints: reward.attributePoints || 0,
    label: reward.label || ''
  };
}

function _scaleQuestTarget(type, playerLevel) {
  var level = playerLevel || 1;
  switch (type) {
    case 'kill_enemies':        return Math.max(5,  Math.floor(level * 3));
    case 'survive_seconds':     return Math.max(30, Math.floor(level * 5));
    case 'earn_gold':           return Math.max(100, Math.floor(level * 50));
    case 'perform_dashes':      return Math.max(5,  Math.floor(level * 2));
    case 'defeat_miniboss':     return 1;
    case 'click_fountain':      return Math.max(10, Math.floor(level * 5));
    case 'complete_expedition': return 1;
    default:                    return 10;
  }
}

function _questReward(type, target) {
  var base = 50;
  switch (type) {
    case 'kill_enemies':        base = target * 5; break;
    case 'survive_seconds':     base = target * 2; break;
    case 'earn_gold':           base = Math.floor(target * 0.5); break;
    case 'perform_dashes':      base = target * 8; break;
    case 'defeat_miniboss':     base = 300; break;
    case 'click_fountain':      base = target * 3; break;
    case 'complete_expedition': base = 250; break;
  }
  return Math.floor(base);
}

function generateDailyQuests(saveData) {
  var dailies = saveData.dailies || getDailiesDefaults();
  var playerLevel = saveData.playerLevel || 1;

  // Shuffle pool
  var pool = QUEST_POOL.slice();
  for (var i = pool.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }

  var quests = [];
  for (var k = 0; k < DAILY_QUESTS_COUNT && k < pool.length; k++) {
    var def = pool[k];
    var target = _scaleQuestTarget(def.type, playerLevel);
    quests.push({
      id: def.type + '_' + k,
      type: def.type,
      label: def.label,
      unit: def.unit,
      target: target,
      rewardGold: _questReward(def.type, target),
      completed: false
    });
  }

  dailies.dailyQuests = quests;
  dailies.dailyQuestProgress = {};
  dailies.lastDailyReset = Date.now();
  saveData.dailies = dailies;
  return quests;
}

function updateDailyQuestProgress(questId, progress, saveData) {
  var dailies = saveData.dailies || getDailiesDefaults();
  var prog = dailies.dailyQuestProgress || {};
  prog[questId] = (prog[questId] || 0) + progress;
  dailies.dailyQuestProgress = prog;
  saveData.dailies = dailies;
  return prog[questId];
}

function checkDailyQuestCompletion(saveData) {
  var dailies = saveData.dailies || getDailiesDefaults();
  var quests = dailies.dailyQuests || [];
  var prog = dailies.dailyQuestProgress || {};
  var completedNow = [];

  for (var i = 0; i < quests.length; i++) {
    var q = quests[i];
    if (!q.completed && (prog[q.id] || 0) >= q.target) {
      q.completed = true;
      completedNow.push({ quest: q, rewardGold: q.rewardGold });
    }
  }

  saveData.dailies = dailies;
  return completedNow;
}

window.GameDailies = {
  DAILY_LOGIN_REWARDS: DAILY_LOGIN_REWARDS,
  QUEST_POOL: QUEST_POOL,
  getDailiesDefaults: getDailiesDefaults,
  shouldResetDailies: shouldResetDailies,
  isDailyAvailable: isDailyAvailable,
  peekDailyReward: peekDailyReward,
  checkDailyLogin: checkDailyLogin,
  generateDailyQuests: generateDailyQuests,
  updateDailyQuestProgress: updateDailyQuestProgress,
  checkDailyQuestCompletion: checkDailyQuestCompletion
};
})();
