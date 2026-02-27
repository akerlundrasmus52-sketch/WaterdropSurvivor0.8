// Exposes window.GameDailies for use by main.js
// Daily login tracker and daily quest system

var DAILY_LOGIN_REWARDS = [
  { day: 1, gold: 50,  item: null },
  { day: 2, gold: 100, item: null },
  { day: 3, gold: 150, item: null },
  { day: 4, gold: 200, item: null },
  { day: 5, gold: 300, item: null },
  { day: 6, gold: 400, item: null },
  { day: 7, gold: 500, item: 'rare_item' }
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

function checkDailyLogin(saveData) {
  var dailies = saveData.dailies || getDailiesDefaults();
  var now = Date.now();

  var lastLogin = dailies.lastLoginDate || 0;
  var elapsed = now - lastLogin;

  // Already logged in today
  if (elapsed < MS_PER_DAY) {
    return { alreadyClaimed: true };
  }

  // Missed a day → reset streak
  if (elapsed >= MS_PER_DAY * 2) {
    dailies.loginStreak = 0;
  }

  dailies.loginStreak = (dailies.loginStreak || 0) + 1;
  var rewardDay = ((dailies.loginStreak - 1) % DAILY_LOGIN_REWARDS.length);
  var reward = DAILY_LOGIN_REWARDS[rewardDay];
  dailies.lastLoginDate = now;
  dailies.lastLoginRewardDay = rewardDay + 1;
  saveData.dailies = dailies;

  return {
    alreadyClaimed: false,
    streak: dailies.loginStreak,
    day: rewardDay + 1,
    gold: reward.gold,
    item: reward.item
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
  checkDailyLogin: checkDailyLogin,
  generateDailyQuests: generateDailyQuests,
  updateDailyQuestProgress: updateDailyQuestProgress,
  checkDailyQuestCompletion: checkDailyQuestCompletion
};
