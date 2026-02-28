// Exposes window.GameIdle for use by main.js
// Core idle engine: offline progress, idle tick, gold mine, auto-trainer

(function () {
const IDLE_CONFIG = {
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
  MAX_OFFLINE_HOURS: 8,
  TICK_INTERVAL_MS: 1000
};

function getIdleDefaults() {
  return {
    goldMineLevel: 0,
    autoTrainerLevel: 0,
    autoTrainerStat: 'strength',
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
  const now = Date.now();
  let elapsed = now - lastTimestamp;
  const maxElapsed = IDLE_CONFIG.MAX_OFFLINE_HOURS * 3600 * 1000;
  if (elapsed > maxElapsed) elapsed = maxElapsed;

  const elapsedMinutes = elapsed / 60000;
  const idle = saveData.idle || getIdleDefaults();

  let goldEarned = 0;
  if (idle.goldMineLevel > 0) {
    const ratePerMin = idle.goldMineLevel * IDLE_CONFIG.GOLD_MINE.RATE_PER_LEVEL;
    goldEarned = Math.floor(ratePerMin * elapsedMinutes);
  }

  let statPoints = 0;
  if (idle.autoTrainerLevel > 0) {
    const statRatePerMin = idle.autoTrainerLevel * IDLE_CONFIG.AUTO_TRAINER.RATE_PER_LEVEL;
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
  const idle = saveData.idle || getIdleDefaults();
  const now = Date.now();
  const elapsed = now - (idle.lastTickTime || now);
  idle.lastTickTime = now;

  const elapsedMinutes = elapsed / 60000;
  let goldEarned = 0;
  let statPoints = 0;

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
  const idle = saveData.idle || getIdleDefaults();
  const cost = getGoldMineUpgradeCost(idle.goldMineLevel);
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
  const idle = saveData.idle || getIdleDefaults();
  const cost = getAutoTrainerUpgradeCost(idle.autoTrainerLevel);
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
  const valid = IDLE_CONFIG.AUTO_TRAINER.VALID_STATS;
  if (valid.indexOf(stat) === -1) {
    return { success: false, reason: 'Invalid stat' };
  }
  const idle = saveData.idle || getIdleDefaults();
  idle.autoTrainerStat = stat;
  saveData.idle = idle;
  return { success: true, stat: stat };
}

function buildWelcomeBackSummary(offlineResults) {
  const minutes = Math.floor(offlineResults.elapsedMinutes);
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  const timeStr = hours > 0 ? (hours + 'h ' + remMin + 'm') : (remMin + 'm');

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

window.GameIdle = {
  IDLE_CONFIG: IDLE_CONFIG,
  getIdleDefaults: getIdleDefaults,
  getGoldMineUpgradeCost: getGoldMineUpgradeCost,
  getAutoTrainerUpgradeCost: getAutoTrainerUpgradeCost,
  calculateOfflineProgress: calculateOfflineProgress,
  idleTick: idleTick,
  upgradeGoldMine: upgradeGoldMine,
  upgradeAutoTrainer: upgradeAutoTrainer,
  setAutoTrainerStat: setAutoTrainerStat,
  buildWelcomeBackSummary: buildWelcomeBackSummary
};
})();
