// Exposes window.GameIdle for use by main.js
// Core idle engine: offline progress, idle tick, gold mine, auto-trainer

(function () {
var IDLE_CONFIG = {
  GOLD_MINE: {
    MAX_LEVEL: 10,
    RATE_PER_LEVEL: 2,       // gold per minute per level
    BASE_COST: 50,
    COST_SCALE: 1.8
  },
  AUTO_TRAINER: {
    MAX_LEVEL: 10,
    RATE_PER_LEVEL: 0.1,     // stat points per minute per level
    BASE_COST: 100,
    COST_SCALE: 2.0,
    VALID_STATS: ['strength', 'agility', 'vitality']
  },
  // Sleep Return speed upgrades: reduce offline cap from 8h → ~30s at max level
  SLEEP_SPEED: {
    MAX_LEVEL: 10,
    BASE_COST: 200,
    COST_SCALE: 2.5,
    // Multipliers to offline hours cap (level 0 = 8h, level 10 = ~0.008h = ~30s)
    CAP_HOURS: [8, 6, 4, 3, 2, 1.5, 1, 0.5, 0.2, 0.1, 0.008]
  },
  MAX_OFFLINE_HOURS: 8,
  TICK_INTERVAL_MS: 1000
};

function getIdleDefaults() {
  return {
    goldMineLevel: 0,
    autoTrainerLevel: 0,
    autoTrainerStat: 'strength',
    sleepSpeedLevel: 0,
    lastTickTime: Date.now(),
    totalIdleGoldEarned: 0,
    totalIdleStatPoints: 0
  };
}

function getGoldMineUpgradeCost(currentLevel) {
  if (currentLevel >= IDLE_CONFIG.GOLD_MINE.MAX_LEVEL) return Infinity;
  return Math.floor(
    IDLE_CONFIG.GOLD_MINE.BASE_COST *
    Math.pow(IDLE_CONFIG.GOLD_MINE.COST_SCALE, currentLevel)
  );
}

function getAutoTrainerUpgradeCost(currentLevel) {
  if (currentLevel >= IDLE_CONFIG.AUTO_TRAINER.MAX_LEVEL) return Infinity;
  return Math.floor(
    IDLE_CONFIG.AUTO_TRAINER.BASE_COST *
    Math.pow(IDLE_CONFIG.AUTO_TRAINER.COST_SCALE, currentLevel)
  );
}

function calculateOfflineProgress(lastTimestamp, saveData) {
  var now = Date.now();
  var elapsed = now - lastTimestamp;
  var idle = saveData.idle || getIdleDefaults();
  // Sleep Speed upgrade reduces the max offline cap
  var sleepLv = idle.sleepSpeedLevel || 0;
  var capHours = IDLE_CONFIG.SLEEP_SPEED.CAP_HOURS[Math.min(sleepLv, IDLE_CONFIG.SLEEP_SPEED.MAX_LEVEL)];
  var maxElapsed = capHours * 3600 * 1000;
  if (elapsed > maxElapsed) elapsed = maxElapsed;

  var elapsedMinutes = elapsed / 60000;
  var goldEarned = 0;
  if (idle.goldMineLevel > 0) {
    var ratePerMin = idle.goldMineLevel * IDLE_CONFIG.GOLD_MINE.RATE_PER_LEVEL;
    goldEarned = Math.floor(ratePerMin * elapsedMinutes);
  }

  var statPoints = 0;
  if (idle.autoTrainerLevel > 0) {
    var statRatePerMin = idle.autoTrainerLevel * IDLE_CONFIG.AUTO_TRAINER.RATE_PER_LEVEL;
    statPoints = statRatePerMin * elapsedMinutes;
  }

  return {
    goldEarned: goldEarned,
    statPoints: statPoints,
    statTrained: idle.autoTrainerStat,
    elapsedMs: elapsed,
    elapsedMinutes: elapsedMinutes
  };
}

function idleTick(saveData) {
  var idle = saveData.idle || getIdleDefaults();
  var now = Date.now();
  var elapsed = now - (idle.lastTickTime || now);
  idle.lastTickTime = now;

  var elapsedMinutes = elapsed / 60000;
  var goldEarned = 0;
  var statPoints = 0;

  if (idle.goldMineLevel > 0) {
    idle._goldAccumulator = (idle._goldAccumulator || 0) + (idle.goldMineLevel * IDLE_CONFIG.GOLD_MINE.RATE_PER_LEVEL * elapsedMinutes);
    goldEarned = Math.floor(idle._goldAccumulator);
    idle._goldAccumulator -= goldEarned;
  }

  if (idle.autoTrainerLevel > 0) {
    idle._statAccumulator = (idle._statAccumulator || 0) + (idle.autoTrainerLevel * IDLE_CONFIG.AUTO_TRAINER.RATE_PER_LEVEL * elapsedMinutes);
    statPoints = Math.floor(idle._statAccumulator);
    idle._statAccumulator -= statPoints;
  }

  idle.totalIdleGoldEarned = (idle.totalIdleGoldEarned || 0) + goldEarned;
  idle.totalIdleStatPoints = (idle.totalIdleStatPoints || 0) + statPoints;
  saveData.gold = (saveData.gold || 0) + goldEarned;
  if (statPoints > 0 && idle.autoTrainerStat) {
    if (!saveData.stats) saveData.stats = {};
    saveData.stats[idle.autoTrainerStat] = (saveData.stats[idle.autoTrainerStat] || 0) + statPoints;
  }
  saveData.idle = idle;

  return {
    goldEarned: goldEarned,
    statPoints: statPoints,
    statTrained: idle.autoTrainerStat
  };
}

function upgradeGoldMine(saveData) {
  var idle = saveData.idle || getIdleDefaults();
  var cost = getGoldMineUpgradeCost(idle.goldMineLevel);
  if (idle.goldMineLevel >= IDLE_CONFIG.GOLD_MINE.MAX_LEVEL) {
    return { success: false, reason: 'Max level reached' };
  }
  if ((saveData.gold || 0) < cost) {
    return { success: false, reason: 'Not enough gold', cost: cost };
  }
  saveData.gold = (saveData.gold || 0) - cost;
  idle.goldMineLevel++;
  saveData.idle = idle;
  return { success: true, newLevel: idle.goldMineLevel, cost: cost };
}

function upgradeAutoTrainer(saveData) {
  var idle = saveData.idle || getIdleDefaults();
  var cost = getAutoTrainerUpgradeCost(idle.autoTrainerLevel);
  if (idle.autoTrainerLevel >= IDLE_CONFIG.AUTO_TRAINER.MAX_LEVEL) {
    return { success: false, reason: 'Max level reached' };
  }
  if ((saveData.gold || 0) < cost) {
    return { success: false, reason: 'Not enough gold', cost: cost };
  }
  saveData.gold = (saveData.gold || 0) - cost;
  idle.autoTrainerLevel++;
  saveData.idle = idle;
  return { success: true, newLevel: idle.autoTrainerLevel, cost: cost };
}

function setAutoTrainerStat(stat, saveData) {
  var valid = IDLE_CONFIG.AUTO_TRAINER.VALID_STATS;
  if (valid.indexOf(stat) === -1) {
    return { success: false, reason: 'Invalid stat' };
  }
  var idle = saveData.idle || getIdleDefaults();
  idle.autoTrainerStat = stat;
  saveData.idle = idle;
  return { success: true, stat: stat };
}

function buildWelcomeBackSummary(offlineResults) {
  var minutes = Math.floor(offlineResults.elapsedMinutes);
  var hours = Math.floor(minutes / 60);
  var remMin = minutes % 60;
  var timeStr = hours > 0 ? (hours + 'h ' + remMin + 'm') : (remMin + 'm');

  return {
    timeAway: timeStr,
    goldLine: offlineResults.goldEarned > 0
      ? '+' + offlineResults.goldEarned + ' gold from mine'
      : null,
    statLine: offlineResults.statPoints > 0
      ? '+' + offlineResults.statPoints.toFixed(1) + ' ' + offlineResults.statTrained + ' from trainer'
      : null,
    expeditionLine: (offlineResults.expeditionsCompleted && offlineResults.expeditionsCompleted > 0)
      ? offlineResults.expeditionsCompleted + ' expedition(s) completed'
      : null
  };
}

function getSleepSpeedUpgradeCost(currentLevel) {
  if (currentLevel >= IDLE_CONFIG.SLEEP_SPEED.MAX_LEVEL) return Infinity;
  return Math.floor(
    IDLE_CONFIG.SLEEP_SPEED.BASE_COST *
    Math.pow(IDLE_CONFIG.SLEEP_SPEED.COST_SCALE, currentLevel)
  );
}

function getSleepSpeedCapHours(level) {
  var lv = Math.min(level || 0, IDLE_CONFIG.SLEEP_SPEED.MAX_LEVEL);
  return IDLE_CONFIG.SLEEP_SPEED.CAP_HOURS[lv];
}

function upgradeSleepSpeed(saveData) {
  var idle = saveData.idle || getIdleDefaults();
  idle.sleepSpeedLevel = idle.sleepSpeedLevel || 0;
  if (idle.sleepSpeedLevel >= IDLE_CONFIG.SLEEP_SPEED.MAX_LEVEL) {
    return { success: false, reason: 'Max level reached' };
  }
  var cost = getSleepSpeedUpgradeCost(idle.sleepSpeedLevel);
  if ((saveData.gold || 0) < cost) {
    return { success: false, reason: 'Not enough gold', cost: cost };
  }
  saveData.gold -= cost;
  idle.sleepSpeedLevel++;
  saveData.idle = idle;
  return { success: true, newLevel: idle.sleepSpeedLevel, cost: cost };
}

window.GameIdle = {
  IDLE_CONFIG: IDLE_CONFIG,
  getIdleDefaults: getIdleDefaults,
  getGoldMineUpgradeCost: getGoldMineUpgradeCost,
  getAutoTrainerUpgradeCost: getAutoTrainerUpgradeCost,
  getSleepSpeedUpgradeCost: getSleepSpeedUpgradeCost,
  getSleepSpeedCapHours: getSleepSpeedCapHours,
  calculateOfflineProgress: calculateOfflineProgress,
  idleTick: idleTick,
  upgradeGoldMine: upgradeGoldMine,
  upgradeAutoTrainer: upgradeAutoTrainer,
  upgradeSleepSpeed: upgradeSleepSpeed,
  setAutoTrainerStat: setAutoTrainerStat,
  buildWelcomeBackSummary: buildWelcomeBackSummary
};
})();
