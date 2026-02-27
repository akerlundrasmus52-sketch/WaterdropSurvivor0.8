// Exposes window.GameClicker for use by main.js
// Clicker mini-game: click handler, power upgrades, auto-clicker, crits, combos

var CLICKER_CONFIG = {
  BASE_CLICK_GOLD: 1,
  BASE_CLICK_ESSENCE: 0.1,
  COMBO_WINDOW_MS: 500,
  COMBO_MAX: 20,
  COMBO_MULTIPLIER_PER_STACK: 0.1,
  CRIT_BASE_CHANCE: 0.05,
  CRIT_MIN_MULT: 2,
  CRIT_MAX_MULT: 5,
  CLICK_POWER_TIERS: [
    { level: 1, goldMult: 2, cost: 50 },
    { level: 2, goldMult: 2, cost: 150 },
    { level: 3, goldMult: 2, cost: 500 },
    { level: 4, goldMult: 2, cost: 2000 },
    { level: 5, goldMult: 2, cost: 10000 }
  ],
  AUTO_CLICKER: {
    MAX_LEVEL: 10,
    BASE_CPS: 0.5,
    CPS_PER_LEVEL: 0.5,
    BASE_COST: 200,
    COST_SCALE: 2.2
  }
};

function getClickerDefaults() {
  return {
    clickPowerTier: 0,
    autoClickerLevel: 0,
    essence: 0,
    totalClicks: 0,
    totalEssenceEarned: 0,
    combo: 0,
    lastClickTime: 0
  };
}

function getClickPower(clickerData) {
  var tier = clickerData.clickPowerTier || 0;
  var mult = 1;
  for (var i = 0; i < tier && i < CLICKER_CONFIG.CLICK_POWER_TIERS.length; i++) {
    mult *= CLICKER_CONFIG.CLICK_POWER_TIERS[i].goldMult;
  }
  return mult;
}

function getAutoClickerCPS(clickerData) {
  var level = clickerData.autoClickerLevel || 0;
  if (level === 0) return 0;
  return CLICKER_CONFIG.AUTO_CLICKER.BASE_CPS + (level - 1) * CLICKER_CONFIG.AUTO_CLICKER.CPS_PER_LEVEL;
}

function getAutoClickerUpgradeCost(currentLevel) {
  if (currentLevel >= CLICKER_CONFIG.AUTO_CLICKER.MAX_LEVEL) return Infinity;
  return Math.floor(
    CLICKER_CONFIG.AUTO_CLICKER.BASE_COST *
    Math.pow(CLICKER_CONFIG.AUTO_CLICKER.COST_SCALE, currentLevel)
  );
}

function processClick(saveData, ascensionBonuses) {
  var clicker = saveData.clicker || getClickerDefaults();
  var now = Date.now();
  var bonuses = ascensionBonuses || {};

  // Combo system
  var timeSinceLast = now - (clicker.lastClickTime || 0);
  if (timeSinceLast <= CLICKER_CONFIG.COMBO_WINDOW_MS) {
    clicker.combo = Math.min((clicker.combo || 0) + 1, CLICKER_CONFIG.COMBO_MAX);
  } else {
    clicker.combo = 0;
  }
  clicker.lastClickTime = now;

  var comboMult = 1 + (clicker.combo * CLICKER_CONFIG.COMBO_MULTIPLIER_PER_STACK);

  // Click power
  var powerMult = getClickPower(clicker);
  var clickBonus = bonuses.clickPowerBonus || 1;

  // Crit check
  var critChance = CLICKER_CONFIG.CRIT_BASE_CHANCE + (bonuses.critChanceBonus || 0);
  var isCrit = Math.random() < critChance;
  var critMult = 1;
  if (isCrit) {
    critMult = CLICKER_CONFIG.CRIT_MIN_MULT +
      Math.random() * (CLICKER_CONFIG.CRIT_MAX_MULT - CLICKER_CONFIG.CRIT_MIN_MULT);
    critMult = Math.round(critMult * 10) / 10;
  }

  var goldEarned = Math.floor(
    CLICKER_CONFIG.BASE_CLICK_GOLD * powerMult * comboMult * critMult * clickBonus
  );
  var essenceGainMult = bonuses.essenceBonus || 1;
  var essenceEarned = Math.round(CLICKER_CONFIG.BASE_CLICK_ESSENCE * powerMult * comboMult * critMult * essenceGainMult * 100) / 100;

  clicker.essence = (clicker.essence || 0) + essenceEarned;
  clicker.totalClicks = (clicker.totalClicks || 0) + 1;
  clicker.totalEssenceEarned = (clicker.totalEssenceEarned || 0) + essenceEarned;
  saveData.clicker = clicker;

  return {
    goldEarned: goldEarned,
    essenceEarned: essenceEarned,
    isCrit: isCrit,
    critMult: isCrit ? critMult : null,
    combo: clicker.combo,
    comboMult: comboMult
  };
}

function upgradeClickPower(saveData) {
  var clicker = saveData.clicker || getClickerDefaults();
  var tier = clicker.clickPowerTier || 0;
  var tiers = CLICKER_CONFIG.CLICK_POWER_TIERS;

  if (tier >= tiers.length) {
    return { success: false, reason: 'Max click power tier reached' };
  }
  var cost = tiers[tier].cost;
  if ((clicker.essence || 0) < cost) {
    return { success: false, reason: 'Not enough essence', cost: cost };
  }
  clicker.essence -= cost;
  clicker.clickPowerTier = tier + 1;
  saveData.clicker = clicker;
  return { success: true, newTier: clicker.clickPowerTier };
}

function upgradeAutoClicker(saveData) {
  var clicker = saveData.clicker || getClickerDefaults();
  var level = clicker.autoClickerLevel || 0;
  var cost = getAutoClickerUpgradeCost(level);

  if (level >= CLICKER_CONFIG.AUTO_CLICKER.MAX_LEVEL) {
    return { success: false, reason: 'Max auto-clicker level reached' };
  }
  if ((clicker.essence || 0) < cost) {
    return { success: false, reason: 'Not enough essence', cost: cost };
  }
  clicker.essence -= cost;
  clicker.autoClickerLevel = level + 1;
  saveData.clicker = clicker;
  return { success: true, newLevel: clicker.autoClickerLevel, cps: getAutoClickerCPS(clicker) };
}

function processAutoClicks(saveData, elapsedMs, ascensionBonuses) {
  var clicker = saveData.clicker || getClickerDefaults();
  var cps = getAutoClickerCPS(clicker);
  if (cps <= 0) return { goldEarned: 0, essenceEarned: 0, clicks: 0 };

  var clicks = cps * (elapsedMs / 1000);
  var bonuses = ascensionBonuses || {};
  var powerMult = getClickPower(clicker);
  var clickBonus = bonuses.clickPowerBonus || 1;
  var essenceMult = bonuses.essenceBonus || 1;

  var goldEarned = Math.floor(CLICKER_CONFIG.BASE_CLICK_GOLD * powerMult * clickBonus * clicks);
  var essenceEarned = Math.round(CLICKER_CONFIG.BASE_CLICK_ESSENCE * powerMult * essenceMult * clicks * 100) / 100;

  clicker.essence = (clicker.essence || 0) + essenceEarned;
  clicker.totalEssenceEarned = (clicker.totalEssenceEarned || 0) + essenceEarned;
  saveData.clicker = clicker;

  return { goldEarned: goldEarned, essenceEarned: essenceEarned, clicks: clicks };
}

window.GameClicker = {
  CLICKER_CONFIG: CLICKER_CONFIG,
  getClickerDefaults: getClickerDefaults,
  getClickPower: getClickPower,
  getAutoClickerCPS: getAutoClickerCPS,
  getAutoClickerUpgradeCost: getAutoClickerUpgradeCost,
  processClick: processClick,
  upgradeClickPower: upgradeClickPower,
  upgradeAutoClicker: upgradeAutoClicker,
  processAutoClicks: processAutoClicks
};
