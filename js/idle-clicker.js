// js/idle-clicker.js — Advanced Idle Clicker: deep progression for the Idle House.
// Exposes window.GameClicker (legacy fountain API) AND window.AdvancedClicker (new deep game).

(function () {

// ─── LEGACY FOUNTAIN CLICKER (backward-compatible API) ─────────────────────
var CLICKER_CONFIG = {
  BASE_CLICK_GOLD: 1,
  BASE_CLICK_ESSENCE: 0.1,
  COMBO_WINDOW_MS: 500,
  COMBO_MAX: 40,
  COMBO_MULTIPLIER_PER_STACK: 0.1,
  COMBO_MEGA_THRESHOLD: 15,
  COMBO_MEGA_BONUS: 0.04,
  CRIT_BASE_CHANCE: 0.05,
  CRIT_MIN_MULT: 2,
  CRIT_MAX_MULT: 5,
  CRIT_STREAK_BONUS: 0.02,
  CRIT_STREAK_MAX: 0.25,
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
  },
  DRONE_VISUALS: { orbitRadius: 38, maxDrones: 6 }
};

function getClickerDefaults() {
  return {
    clickPowerTier: 0,
    autoClickerLevel: 0,
    essence: 0,
    totalClicks: 0,
    totalEssenceEarned: 0,
    combo: 0,
    critStreak: 0,
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

  var timeSinceLast = now - (clicker.lastClickTime || 0);
  if (timeSinceLast <= CLICKER_CONFIG.COMBO_WINDOW_MS) {
    clicker.combo = Math.min((clicker.combo || 0) + 1, CLICKER_CONFIG.COMBO_MAX);
  } else {
    clicker.combo = 0;
  }
  clicker.lastClickTime = now;

  var comboMult = 1 + (clicker.combo * CLICKER_CONFIG.COMBO_MULTIPLIER_PER_STACK);
  if (clicker.combo >= CLICKER_CONFIG.COMBO_MEGA_THRESHOLD) {
    comboMult += (clicker.combo - CLICKER_CONFIG.COMBO_MEGA_THRESHOLD + 1) * CLICKER_CONFIG.COMBO_MEGA_BONUS;
  }
  var powerMult = getClickPower(clicker);
  var clickBonus = bonuses.clickPowerBonus || 1;

  var critChance = CLICKER_CONFIG.CRIT_BASE_CHANCE + (bonuses.critChanceBonus || 0);
  critChance += Math.min(clicker.critStreak * CLICKER_CONFIG.CRIT_STREAK_BONUS, CLICKER_CONFIG.CRIT_STREAK_MAX);
  var isCrit = Math.random() < critChance;
  var critMult = 1;
  if (isCrit) {
    critMult = CLICKER_CONFIG.CRIT_MIN_MULT +
      Math.random() * (CLICKER_CONFIG.CRIT_MAX_MULT - CLICKER_CONFIG.CRIT_MIN_MULT);
    critMult = Math.round(critMult * 10) / 10;
    clicker.critStreak = Math.min(clicker.critStreak + 1, Math.ceil(CLICKER_CONFIG.CRIT_STREAK_MAX / CLICKER_CONFIG.CRIT_STREAK_BONUS));
  } else {
    clicker.critStreak = 0;
  }

  var goldEarned = Math.floor(
    CLICKER_CONFIG.BASE_CLICK_GOLD * powerMult * comboMult * critMult * clickBonus
  );
  var essenceGainMult = bonuses.essenceBonus || 1;
  var essenceEarned = Math.round(CLICKER_CONFIG.BASE_CLICK_ESSENCE * powerMult * comboMult * critMult * essenceGainMult * 100) / 100;

  clicker.essence = (clicker.essence || 0) + essenceEarned;
  saveData.essence = (saveData.essence || 0) + essenceEarned;
  clicker.totalClicks = (clicker.totalClicks || 0) + 1;
  clicker.totalEssenceEarned = (clicker.totalEssenceEarned || 0) + essenceEarned;
  saveData.clicker = clicker;

  return {
    goldEarned: goldEarned,
    essenceEarned: essenceEarned,
    isCrit: isCrit,
    critMult: isCrit ? critMult : null,
    combo: clicker.combo,
    comboMult: comboMult,
    critStreak: clicker.critStreak
  };
}

function upgradeClickPower(saveData) {
  var clicker = saveData.clicker || getClickerDefaults();
  var tier = clicker.clickPowerTier || 0;
  var tiers = CLICKER_CONFIG.CLICK_POWER_TIERS;
  if (tier >= tiers.length) return { success: false, reason: 'Max click power tier reached' };
  var cost = tiers[tier].cost;
  if ((clicker.essence || 0) < cost) return { success: false, reason: 'Not enough essence', cost: cost };
  clicker.essence -= cost;
  clicker.clickPowerTier = tier + 1;
  saveData.clicker = clicker;
  return { success: true, newTier: clicker.clickPowerTier };
}

function upgradeAutoClicker(saveData) {
  var clicker = saveData.clicker || getClickerDefaults();
  var level = clicker.autoClickerLevel || 0;
  var cost = getAutoClickerUpgradeCost(level);
  if (level >= CLICKER_CONFIG.AUTO_CLICKER.MAX_LEVEL) return { success: false, reason: 'Max auto-clicker level reached' };
  if ((clicker.essence || 0) < cost) return { success: false, reason: 'Not enough essence', cost: cost };
  clicker.essence -= cost;
  clicker.autoClickerLevel = level + 1;
  saveData.clicker = clicker;
  return { success: true, newLevel: clicker.autoClickerLevel, cps: getAutoClickerCPS(clicker) };
}

function processAutoClicks(saveData, elapsedMs, ascensionBonuses) {
  var clicker = saveData.clicker || getClickerDefaults();
  var cps = getAutoClickerCPS(clicker);
  if (cps <= 0) {
    // Still tick the advanced clicker
    if (window.AdvancedClicker) window.AdvancedClicker.tick(saveData, elapsedMs);
    return { goldEarned: 0, essenceEarned: 0, clicks: 0 };
  }

  var clicks = cps * (elapsedMs / 1000);
  var bonuses = ascensionBonuses || {};
  var powerMult = getClickPower(clicker);
  var clickBonus = bonuses.clickPowerBonus || 1;
  var essenceMult = bonuses.essenceBonus || 1;

  var goldEarned = Math.floor(CLICKER_CONFIG.BASE_CLICK_GOLD * powerMult * clickBonus * clicks);
  var essenceEarned = Math.round(CLICKER_CONFIG.BASE_CLICK_ESSENCE * powerMult * essenceMult * clicks * 100) / 100;

  clicker.essence = (clicker.essence || 0) + essenceEarned;
  saveData.essence = (saveData.essence || 0) + essenceEarned;
  clicker.totalEssenceEarned = (clicker.totalEssenceEarned || 0) + essenceEarned;
  saveData.clicker = clicker;

  // Also tick advanced clicker
  if (window.AdvancedClicker) window.AdvancedClicker.tick(saveData, elapsedMs);

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

})(); // end legacy fountain IIFE


// ─── ADVANCED IDLE CLICKER ────────────────────────────────────────────────────
// A deep progression idle game housed inside the Idle House building.
// Resources: Synaptic Energy (SE) — the core currency generated by clicking and buildings.
// Buildings auto-generate SE per second. Multipliers and milestones boost everything.
// Prestige: "Neural Ascension" resets buildings but grants permanent multipliers.
// Main-game rewards: passive gold and stat buffs that scale with clicker level.
window.AdvancedClicker = (function () {
  'use strict';

  // ─── Building definitions ────────────────────────────────────────────────
  const BUILDINGS = [
    {
      id: 'neuron',
      name: 'Neuron Cluster',
      icon: '🧠',
      desc: 'A basic neural unit. Generates a trickle of Synaptic Energy.',
      baseCost: 15,
      baseSEPS: 0.1,   // SE per second per building
      costScale: 1.15,
      maxOwned: 999
    },
    {
      id: 'synapse',
      name: 'Synapse Link',
      icon: '⚡',
      desc: 'Connects clusters to amplify signal transmission.',
      baseCost: 100,
      baseSEPS: 0.5,
      costScale: 1.15,
      maxOwned: 999
    },
    {
      id: 'matrix_shard',
      name: 'Matrix Shard',
      icon: '💎',
      desc: 'A crystallised fragment of the Neural Matrix. High output.',
      baseCost: 1100,
      baseSEPS: 4,
      costScale: 1.15,
      unlockAtSE: 500,
      maxOwned: 999
    },
    {
      id: 'quantum_node',
      name: 'Quantum Node',
      icon: '🔮',
      desc: 'Quantum-entangled processors that defy normal energy limits.',
      baseCost: 12000,
      baseSEPS: 20,
      costScale: 1.15,
      unlockAtSE: 5000,
      maxOwned: 999
    },
    {
      id: 'void_reactor',
      name: 'Void Reactor',
      icon: '🌀',
      desc: 'Taps energy from a micro-singularity. Unstable but powerful.',
      baseCost: 130000,
      baseSEPS: 100,
      costScale: 1.15,
      unlockAtSE: 50000,
      maxOwned: 999
    },
    {
      id: 'annunaki_core',
      name: 'Annunaki Core',
      icon: '★',
      desc: 'Ancient golden technology. The pinnacle of neural engineering.',
      baseCost: 1400000,
      baseSEPS: 500,
      costScale: 1.15,
      unlockAtSE: 500000,
      maxOwned: 999
    }
  ];

  // ─── Upgrades (purchasable with SE to multiply a building's output) ─────
  const UPGRADES = [
    { id: 'neuron_1',    name: 'Improved Axons',     building: 'neuron',       mult: 2,  cost: 100,    unlockOwned: { neuron: 10 } },
    { id: 'neuron_2',    name: 'Myelination',         building: 'neuron',       mult: 2,  cost: 500,    unlockOwned: { neuron: 25 } },
    { id: 'neuron_3',    name: 'Cortex Expansion',    building: 'neuron',       mult: 2,  cost: 5000,   unlockOwned: { neuron: 50 } },
    { id: 'synapse_1',   name: 'Signal Boost',        building: 'synapse',      mult: 2,  cost: 1000,   unlockOwned: { synapse: 10 } },
    { id: 'synapse_2',   name: 'Resonance Tuning',    building: 'synapse',      mult: 2,  cost: 5000,   unlockOwned: { synapse: 25 } },
    { id: 'synapse_3',   name: 'Quantum Coupling',    building: 'synapse',      mult: 2,  cost: 50000,  unlockOwned: { synapse: 50 } },
    { id: 'matrix_1',   name: 'Crystal Alignment',   building: 'matrix_shard', mult: 2,  cost: 10000,  unlockOwned: { matrix_shard: 10 } },
    { id: 'matrix_2',   name: 'Fractal Growth',       building: 'matrix_shard', mult: 2,  cost: 100000, unlockOwned: { matrix_shard: 25 } },
    { id: 'quantum_1',  name: 'Entanglement Web',    building: 'quantum_node', mult: 2,  cost: 100000, unlockOwned: { quantum_node: 10 } },
    { id: 'void_1',     name: 'Singularity Tap',     building: 'void_reactor', mult: 2,  cost: 1000000, unlockOwned: { void_reactor: 10 } },
    { id: 'click_1',    name: 'Sharper Focus',        building: 'click',        mult: 2,  cost: 200,    unlockOwned: {} },
    { id: 'click_2',    name: 'Neural Reflex',        building: 'click',        mult: 2,  cost: 5000,   unlockOwned: {} },
    { id: 'click_3',    name: 'Hyperlink Click',      building: 'click',        mult: 4,  cost: 100000, unlockOwned: {} },
    { id: 'global_1',   name: 'Efficiency Protocol', building: 'global',       mult: 1.5, cost: 10000, unlockOwned: {} },
    { id: 'global_2',   name: 'Overflow Matrix',     building: 'global',       mult: 2,  cost: 250000, unlockOwned: {} }
  ];

  // ─── Milestone rewards (one-time triggers at SE thresholds) ─────────────
  const MILESTONES = [
    { se: 100,     desc: '🎉 100 SE — Main game: +2% gold/run',    bonus: { goldPct: 2 } },
    { se: 1000,    desc: '🎉 1K SE — Main game: +5% gold/run',     bonus: { goldPct: 5 } },
    { se: 10000,   desc: '🎉 10K SE — Main game: +10% gold/run',   bonus: { goldPct: 10 } },
    { se: 100000,  desc: '🎉 100K SE — Main game: +1 ATK bonus',   bonus: { atkBonus: 1 } },
    { se: 1000000, desc: '🎉 1M SE — Main game: +2 ATK, +20% gold', bonus: { atkBonus: 2, goldPct: 20 } }
  ];

  // ─── Prestige (Neural Ascension) ─────────────────────────────────────────
  // Each ascension resets buildings but grants a permanent "Synaptic Multiplier".
  // Ascension is available once you reach 1,000,000 SE lifetime.
  const ASCENSION_SE_THRESHOLD = 1000000;
  const ASCENSION_MULT_PER_LEVEL = 0.25; // +25% total production per ascension

  // ─── Save data helpers ──────────────────────────────────────────────────
  function getDefaults() {
    return {
      se: 0,              // current Synaptic Energy
      lifetimeSE: 0,      // all-time SE generated (never resets)
      buildings: {},      // { buildingId: count }
      upgrades: {},       // { upgradeId: true }
      ascensions: 0,
      clickPower: 1,      // manual click SE value
      lastTick: 0,
      milestonesSeen: {},
      totalClicks: 0
    };
  }

  function _getData(saveData) {
    if (!saveData.advancedClicker) saveData.advancedClicker = getDefaults();
    return saveData.advancedClicker;
  }

  // ─── Building cost & production ────────────────────────────────────────
  function getBuildingCost(def, owned) {
    return Math.ceil(def.baseCost * Math.pow(def.costScale, owned || 0));
  }

  function getBuildingMult(def, upgradesOwned) {
    let mult = 1;
    UPGRADES.forEach(u => {
      if (u.building === def.id && upgradesOwned[u.id]) mult *= u.mult;
    });
    return mult;
  }

  function getGlobalMult(upgradesOwned) {
    let mult = 1;
    UPGRADES.forEach(u => {
      if (u.building === 'global' && upgradesOwned[u.id]) mult *= u.mult;
    });
    return mult;
  }

  function getClickMult(upgradesOwned) {
    let mult = 1;
    UPGRADES.forEach(u => {
      if (u.building === 'click' && upgradesOwned[u.id]) mult *= u.mult;
    });
    return mult;
  }

  function getTotalSEPS(data) {
    const globalMult = getGlobalMult(data.upgrades);
    const ascMult    = 1 + (data.ascensions || 0) * ASCENSION_MULT_PER_LEVEL;
    let total = 0;
    BUILDINGS.forEach(def => {
      const owned = data.buildings[def.id] || 0;
      if (!owned) return;
      const bMult = getBuildingMult(def, data.upgrades);
      total += def.baseSEPS * owned * bMult;
    });
    return total * globalMult * ascMult;
  }

  function getClickSE(data) {
    const ascMult   = 1 + (data.ascensions || 0) * ASCENSION_MULT_PER_LEVEL;
    const clickMult = getClickMult(data.upgrades);
    // Click gives 1% of total SEPS × upgrades × ascension (min of 1 SE total)
    const sePerSecond = getTotalSEPS(data);
    return Math.max(1, sePerSecond * 0.01 * clickMult * ascMult);
  }

  // ─── Clicker "level" (logarithmic scale based on lifetime SE) ──────────
  function getClickerLevel(data) {
    const lse = data.lifetimeSE || 0;
    if (lse <= 0) return 1;
    return Math.max(1, Math.floor(Math.log10(lse + 1) * 5));
  }

  // ─── Passive main-game rewards (gold % bonus scales with level) ─────────
  function getMainGameBonuses(saveData) {
    const data = _getData(saveData);
    const level = getClickerLevel(data);
    // Gold % bonus: +0.5% per clicker level (capped at +100%)
    const goldPct = Math.min(100, level * 0.5);
    // ATK bonus from milestones
    let atkBonus = 0;
    let goldMilestonePct = 0;
    (data.milestonesSeen ? Object.keys(data.milestonesSeen) : []).forEach(idx => {
      const m = MILESTONES[parseInt(idx)];
      if (m && m.bonus) {
        if (m.bonus.goldPct) goldMilestonePct += m.bonus.goldPct;
        if (m.bonus.atkBonus) atkBonus += m.bonus.atkBonus;
      }
    });
    return {
      goldPct: goldPct + goldMilestonePct,
      atkBonus: atkBonus,
      level: level
    };
  }

  // ─── Tick: called every second from GameClicker.processAutoClicks ────────
  function tick(saveData, elapsedMs) {
    const data = _getData(saveData);
    if (!data.lastTick) data.lastTick = Date.now();

    const secs = Math.min(300, elapsedMs / 1000); // cap offline gain at 300 seconds (5 minutes)
    const sePerSec = getTotalSEPS(data);
    const gained = sePerSec * secs;

    data.se = (data.se || 0) + gained;
    data.lifetimeSE = (data.lifetimeSE || 0) + gained;
    data.lastTick = Date.now();

    // Check milestones
    MILESTONES.forEach((m, idx) => {
      if (!data.milestonesSeen) data.milestonesSeen = {};
      if (!data.milestonesSeen[idx] && data.lifetimeSE >= m.se) {
        data.milestonesSeen[idx] = true;
        if (typeof window.showNarratorLine === 'function') {
          window.showNarratorLine('🏠 ' + m.desc, 4000);
        }
      }
    });

    // Passive gold reward to main game: small trickle based on SEPS
    const passiveGold = Math.floor(sePerSec * 0.01 * secs);
    if (passiveGold > 0) {
      saveData.gold = (saveData.gold || 0) + passiveGold;
    }
  }

  // ─── Manual click ───────────────────────────────────────────────────────
  function click(saveData) {
    const data = _getData(saveData);
    const clickSE = getClickSE(data);
    data.se = (data.se || 0) + clickSE;
    data.lifetimeSE = (data.lifetimeSE || 0) + clickSE;
    data.totalClicks = (data.totalClicks || 0) + 1;
    // Grant Account XP for clicking (1 XP every 10 clicks)
    if (data.totalClicks % 10 === 0) {
      if (typeof addAccountXP === 'function') {
        addAccountXP(1);
      } else if (window.GameAccount && typeof window.GameAccount.addXP === 'function') {
        window.GameAccount.addXP(1, 'Idle Clicker', saveData);
      }
    }
    return { gained: clickSE };
  }

  // ─── Buy building ───────────────────────────────────────────────────────
  function buyBuilding(saveData, buildingId, amount) {
    const data = _getData(saveData);
    const def = BUILDINGS.find(b => b.id === buildingId);
    if (!def) return { success: false, reason: 'Unknown building' };

    const owned = data.buildings[buildingId] || 0;
    const qty = amount || 1;
    // Calculate cost of qty buildings (sum of geometric series)
    let totalCost = 0;
    for (let i = 0; i < qty; i++) {
      totalCost += getBuildingCost(def, owned + i);
    }
    if ((data.se || 0) < totalCost) {
      return { success: false, reason: 'Not enough Synaptic Energy', cost: totalCost };
    }
    data.se -= totalCost;
    data.buildings[buildingId] = owned + qty;
    return { success: true, owned: data.buildings[buildingId], cost: totalCost };
  }

  // ─── Buy upgrade ────────────────────────────────────────────────────────
  function buyUpgrade(saveData, upgradeId) {
    const data = _getData(saveData);
    const def = UPGRADES.find(u => u.id === upgradeId);
    if (!def) return { success: false, reason: 'Unknown upgrade' };
    if (data.upgrades[upgradeId]) return { success: false, reason: 'Already purchased' };

    // Check unlock conditions
    const ownedReqs = def.unlockOwned || {};
    for (const [bid, needed] of Object.entries(ownedReqs)) {
      if ((data.buildings[bid] || 0) < needed) {
        return { success: false, reason: 'Need ' + needed + ' ' + bid + ' first' };
      }
    }

    if ((data.se || 0) < def.cost) {
      return { success: false, reason: 'Not enough SE', cost: def.cost };
    }

    data.se -= def.cost;
    data.upgrades[upgradeId] = true;
    return { success: true };
  }

  // ─── Neural Ascension (prestige) ────────────────────────────────────────
  function canAscend(saveData) {
    const data = _getData(saveData);
    return (data.lifetimeSE || 0) >= ASCENSION_SE_THRESHOLD;
  }

  function ascend(saveData) {
    if (!canAscend(saveData)) return { success: false, reason: 'Need ' + _fmt(ASCENSION_SE_THRESHOLD) + ' lifetime SE' };
    const data = _getData(saveData);
    data.ascensions = (data.ascensions || 0) + 1;
    data.buildings = {};
    data.upgrades = {};
    data.se = 0;
    // lifetimeSE and milestonesSeen are KEPT so progress isn't lost
    return { success: true, ascensions: data.ascensions };
  }

  // ─── Format helpers ──────────────────────────────────────────────────────
  function _fmt(n) {
    if (n >= 1e9)  return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6)  return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3)  return (n / 1e3).toFixed(2) + 'K';
    return Math.floor(n).toString();
  }

  // ─── Full-screen overlay UI ──────────────────────────────────────────────
  function openUI(saveData) {
    const existing = document.getElementById('adv-clicker-overlay');
    if (existing) { existing.remove(); return; }

    const data = _getData(saveData);
    const overlay = document.createElement('div');
    overlay.id = 'adv-clicker-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9000',
      'background:linear-gradient(180deg,#0a0a1a 0%,#10102a 100%)',
      'display:grid', 'grid-template-columns:1fr 280px', 'grid-template-rows:auto 1fr auto',
      'color:#e0e0f0', 'font-family:"Courier New",monospace', 'overflow:hidden'
    ].join(';');

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'grid-column:1/3;padding:12px 18px;background:rgba(0,0,0,0.5);border-bottom:2px solid #00ccff;display:flex;align-items:center;gap:16px;';
    header.innerHTML = `
      <span style="font-size:22px;font-weight:bold;color:#00ccff;text-shadow:0 0 10px #00ccff;">🏠 IDLE HOUSE — Neural Clicker</span>
      <span id="advc-level" style="background:#1a1a3a;padding:4px 12px;border-radius:20px;font-size:14px;color:#ffd700;">Lv 1</span>
      <span id="advc-se" style="color:#88ffcc;font-size:15px;margin-left:auto;">SE: 0</span>
      <span id="advc-seps" style="color:#aaa;font-size:13px;">(0/s)</span>
      <button id="advc-close" style="margin-left:12px;background:#ff4444;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-weight:bold;">✕ CLOSE</button>
    `;
    overlay.appendChild(header);

    // Left: click zone + milestone tracker
    const left = document.createElement('div');
    left.style.cssText = 'overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;';

    // Click button
    const clickZone = document.createElement('div');
    clickZone.style.cssText = 'text-align:center;';
    const clickBtn = document.createElement('button');
    clickBtn.id = 'advc-click-btn';
    clickBtn.style.cssText = [
      'width:140px;height:140px;border-radius:50%',
      'background:radial-gradient(circle,#003366 0%,#001133 100%)',
      'border:4px solid #00ccff', 'cursor:pointer',
      'font-size:48px', 'display:inline-flex',
      'align-items:center;justify-content:center',
      'box-shadow:0 0 30px #00ccff88',
      'transition:transform 0.08s,box-shadow 0.08s'
    ].join(';');
    clickBtn.textContent = '🧠';
    clickBtn.title = 'Click for Synaptic Energy!';
    clickBtn.addEventListener('click', () => {
      const result = click(saveData);
      clickBtn.style.transform = 'scale(0.92)';
      clickBtn.style.boxShadow = '0 0 60px #00ccffcc';
      setTimeout(() => {
        clickBtn.style.transform = 'scale(1)';
        clickBtn.style.boxShadow = '0 0 30px #00ccff88';
      }, 80);
      // Floating text
      const ft = document.createElement('div');
      ft.textContent = '+' + _fmt(result.gained) + ' SE';
      ft.style.cssText = 'position:absolute;color:#00ffcc;font-size:16px;font-weight:bold;pointer-events:none;animation:advClickFly 0.7s ease-out forwards;';
      const rect = clickBtn.getBoundingClientRect();
      ft.style.left = (rect.left + rect.width / 2 - 30) + 'px';
      ft.style.top  = (rect.top - 10) + 'px';
      document.body.appendChild(ft);
      setTimeout(() => ft.remove(), 700);
      _refreshStats();
    });
    clickZone.appendChild(clickBtn);
    const clickPowerEl = document.createElement('p');
    clickPowerEl.id = 'advc-click-power';
    clickPowerEl.style.cssText = 'color:#aaa;font-size:13px;margin:6px 0;';
    clickZone.appendChild(clickPowerEl);
    left.appendChild(clickZone);

    // Upgrades section
    const upgTitle = document.createElement('h4');
    upgTitle.style.cssText = 'color:#ffd700;border-bottom:1px solid #333;padding-bottom:4px;margin:0;';
    upgTitle.textContent = '⚗️ UPGRADES';
    left.appendChild(upgTitle);
    const upgGrid = document.createElement('div');
    upgGrid.id = 'advc-upgrades';
    upgGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;';
    left.appendChild(upgGrid);

    // Milestones section
    const milTitle = document.createElement('h4');
    milTitle.style.cssText = 'color:#aaffaa;border-bottom:1px solid #333;padding-bottom:4px;margin:8px 0 0;';
    milTitle.textContent = '🏆 MILESTONES';
    left.appendChild(milTitle);
    const milDiv = document.createElement('div');
    milDiv.id = 'advc-milestones';
    left.appendChild(milDiv);

    // Ascension section
    const ascDiv = document.createElement('div');
    ascDiv.id = 'advc-ascension';
    ascDiv.style.cssText = 'margin-top:8px;';
    left.appendChild(ascDiv);

    overlay.appendChild(left);

    // Right: buildings panel
    const right = document.createElement('div');
    right.style.cssText = 'overflow-y:auto;background:rgba(0,0,0,0.3);border-left:2px solid #00ccff22;padding:10px;display:flex;flex-direction:column;gap:8px;';
    const bldTitle = document.createElement('h4');
    bldTitle.style.cssText = 'color:#00ccff;margin:0 0 8px;border-bottom:1px solid #00ccff44;padding-bottom:4px;';
    bldTitle.textContent = '🏗️ GENERATORS';
    right.appendChild(bldTitle);
    const bldDiv = document.createElement('div');
    bldDiv.id = 'advc-buildings';
    right.appendChild(bldDiv);
    overlay.appendChild(right);

    // Footer: main game bonuses
    const footer = document.createElement('div');
    footer.style.cssText = 'grid-column:1/3;padding:8px 18px;background:rgba(0,0,0,0.5);border-top:1px solid #333;display:flex;gap:20px;font-size:13px;color:#aaa;';
    footer.innerHTML = '<span id="advc-main-bonuses">Loading bonuses...</span>';
    overlay.appendChild(footer);

    document.body.appendChild(overlay);

    // Add CSS animation for click float
    if (!document.getElementById('advc-style')) {
      const style = document.createElement('style');
      style.id = 'advc-style';
      style.textContent = `
        @keyframes advClickFly {
          0%   { opacity:1; transform:translateY(0); }
          100% { opacity:0; transform:translateY(-60px); }
        }
      `;
      document.head.appendChild(style);
    }

    document.getElementById('advc-close').addEventListener('click', () => overlay.remove());

    // Auto-refresh every second
    const refreshInterval = setInterval(() => {
      if (!document.getElementById('adv-clicker-overlay')) { clearInterval(refreshInterval); return; }
      tick(saveData, 1000);
      _refreshStats();
      _refreshBuildings();
      _refreshUpgrades();
    }, 1000);

    _refreshStats();
    _refreshBuildings();
    _refreshUpgrades();

    function _refreshStats() {
      const d = _getData(saveData);
      const seps = getTotalSEPS(d);
      document.getElementById('advc-se').textContent   = 'SE: ' + _fmt(d.se);
      document.getElementById('advc-seps').textContent = '(' + _fmt(seps) + '/s)';
      document.getElementById('advc-level').textContent = 'Lv ' + getClickerLevel(d) + (d.ascensions ? ' ✦' + d.ascensions : '');
      document.getElementById('advc-click-power').textContent = 'Click: +' + _fmt(getClickSE(d)) + ' SE';

      // Milestones
      const milDiv = document.getElementById('advc-milestones');
      if (milDiv) {
        milDiv.innerHTML = '';
        MILESTONES.forEach((m, idx) => {
          const seen = d.milestonesSeen && d.milestonesSeen[idx];
          const div = document.createElement('div');
          div.style.cssText = 'padding:4px 8px;background:' + (seen ? 'rgba(0,80,40,0.4)' : 'rgba(20,20,40,0.4)') + ';border-radius:4px;font-size:12px;opacity:' + (seen ? '1' : '0.5') + ';';
          div.textContent = (seen ? '✓ ' : '○ ') + m.desc;
          milDiv.appendChild(div);
        });
      }

      // Ascension
      const ascDiv = document.getElementById('advc-ascension');
      if (ascDiv) {
        const canAsc = canAscend(saveData);
        ascDiv.innerHTML = `
          <div style="background:rgba(80,40,0,0.4);border:1px solid #ffaa00;border-radius:8px;padding:10px;">
            <div style="color:#ffaa00;font-weight:bold;margin-bottom:6px;">🌟 NEURAL ASCENSION (Prestige)</div>
            <div style="font-size:12px;color:#aaa;margin-bottom:8px;">
              Reset buildings for a permanent +${Math.round(ASCENSION_MULT_PER_LEVEL*100)}% SE multiplier per ascension.<br>
              Ascensions: <b style="color:#ffd700">${d.ascensions || 0}</b> (×${(1 + (d.ascensions||0) * ASCENSION_MULT_PER_LEVEL).toFixed(2)} SE mult)<br>
              Lifetime SE: <b style="color:#00ffcc">${_fmt(d.lifetimeSE || 0)}</b> / ${_fmt(ASCENSION_SE_THRESHOLD)} required
            </div>
            <button id="advc-ascend-btn" ${canAsc ? '' : 'disabled'} style="background:${canAsc ? '#ffaa00' : '#333'};color:${canAsc ? '#000' : '#666'};border:none;padding:6px 16px;border-radius:6px;cursor:${canAsc ? 'pointer' : 'not-allowed'};font-weight:bold;">
              ${canAsc ? '⭐ ASCEND NOW' : '🔒 Need ' + _fmt(ASCENSION_SE_THRESHOLD) + ' lifetime SE'}
            </button>
          </div>
        `;
        const btn = document.getElementById('advc-ascend-btn');
        if (btn && canAsc) {
          btn.addEventListener('click', () => {
            if (confirm('Ascend? All buildings and upgrades reset, but you gain a permanent +' + Math.round(ASCENSION_MULT_PER_LEVEL*100) + '% SE multiplier.')) {
              const r = ascend(saveData);
              if (r.success) {
                if (typeof window.showNarratorLine === 'function') window.showNarratorLine('AIDA: "Neural Ascension complete. Multiplier stack: ×' + (1 + r.ascensions * ASCENSION_MULT_PER_LEVEL).toFixed(2) + '"', 4000);
                _refreshStats();
                _refreshBuildings();
                _refreshUpgrades();
              }
            }
          });
        }
      }

      // Main game bonuses footer
      const bonusEl = document.getElementById('advc-main-bonuses');
      if (bonusEl) {
        const b = getMainGameBonuses(saveData);
        bonusEl.innerHTML = `<b style="color:#00ffcc">MAIN GAME BONUSES (from Idle House):</b>
          &nbsp; +${b.goldPct.toFixed(1)}% gold per run
          ${b.atkBonus > 0 ? '&nbsp; +' + b.atkBonus + ' ATK' : ''}
          &nbsp; (Clicker Level: <b style="color:#ffd700">${b.level}</b>)`;
      }
    }

    function _refreshBuildings() {
      const bldDiv = document.getElementById('advc-buildings');
      if (!bldDiv) return;
      const d = _getData(saveData);
      bldDiv.innerHTML = '';
      const seps = getTotalSEPS(d);
      BUILDINGS.forEach(def => {
        const owned = d.buildings[def.id] || 0;
        const cost  = getBuildingCost(def, owned);
        const bMult = getBuildingMult(def, d.upgrades);
        const ascMult = 1 + (d.ascensions || 0) * ASCENSION_MULT_PER_LEVEL;
        const globalMult = getGlobalMult(d.upgrades);
        const thisSEPS  = def.baseSEPS * owned * bMult * globalMult * ascMult;
        const canBuy = (d.se || 0) >= cost;

        if (def.unlockAtSE && (d.lifetimeSE || 0) < def.unlockAtSE && !owned) return; // hidden

        const card = document.createElement('div');
        card.style.cssText = `background:rgba(0,20,40,0.7);border:1px solid ${owned ? '#00ccff44' : '#111'};border-radius:8px;padding:8px;`;
        card.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <span style="font-size:20px;">${def.icon}</span>
            <div>
              <div style="font-weight:bold;font-size:13px;color:#ddd;">${def.name}</div>
              <div style="font-size:11px;color:#888;">${owned} owned · ${_fmt(thisSEPS)}/s</div>
            </div>
          </div>
          <div style="font-size:11px;color:#aaa;margin-bottom:6px;">${def.desc}</div>
          <button class="advc-buy-btn" data-id="${def.id}" style="width:100%;background:${canBuy ? '#003366' : '#1a1a2a'};color:${canBuy ? '#00ccff' : '#555'};border:1px solid ${canBuy ? '#00ccff' : '#333'};border-radius:4px;padding:4px;cursor:${canBuy ? 'pointer' : 'not-allowed'};font-size:12px;">
            BUY ${_fmt(cost)} SE
          </button>
        `;
        bldDiv.appendChild(card);
      });

      bldDiv.querySelectorAll('.advc-buy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const result = buyBuilding(saveData, btn.dataset.id);
          if (result.success) { _refreshBuildings(); _refreshStats(); _refreshUpgrades(); }
        });
      });
    }

    function _refreshUpgrades() {
      const upgGrid = document.getElementById('advc-upgrades');
      if (!upgGrid) return;
      const d = _getData(saveData);
      upgGrid.innerHTML = '';
      UPGRADES.forEach(def => {
        if (d.upgrades[def.id]) return; // already owned — hide

        // Check unlock condition
        const ownedReqs = def.unlockOwned || {};
        const unlocked = Object.entries(ownedReqs).every(([bid, needed]) => (d.buildings[bid] || 0) >= needed);
        if (!unlocked) return;

        const canBuy = (d.se || 0) >= def.cost;
        const targetName = def.building === 'global' ? 'All' : def.building === 'click' ? 'Click' : BUILDINGS.find(b => b.id === def.building)?.name || def.building;

        const card = document.createElement('div');
        card.style.cssText = `background:rgba(40,30,0,0.6);border:1px solid ${canBuy ? '#ffaa0066' : '#333'};border-radius:6px;padding:8px;cursor:${canBuy ? 'pointer' : 'not-allowed'};`;
        card.innerHTML = `
          <div style="font-weight:bold;font-size:12px;color:#ffaa00;">${def.name}</div>
          <div style="font-size:11px;color:#aaa;">${targetName} ×${def.mult}</div>
          <div style="font-size:12px;color:${canBuy ? '#ffd700' : '#666'};margin-top:4px;">${_fmt(def.cost)} SE</div>
        `;
        if (canBuy) {
          card.addEventListener('click', () => {
            const r = buyUpgrade(saveData, def.id);
            if (r.success) { _refreshUpgrades(); _refreshBuildings(); _refreshStats(); }
          });
        }
        upgGrid.appendChild(card);
      });

      if (!upgGrid.children.length) {
        upgGrid.innerHTML = '<span style="color:#555;font-size:12px;">Buy buildings to unlock upgrades.</span>';
      }
    }
  }

  // ─── Panel renderer for the idle-bootstrap tab ─────────────────────────
  function renderPanel(saveData, container) {
    container.innerHTML = '';

    const data  = _getData(saveData);
    const level = getClickerLevel(data);
    const seps  = getTotalSEPS(data);
    const bonuses = getMainGameBonuses(saveData);

    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;padding:10px;';
    header.innerHTML = `
      <h3 style="color:#00ccff;margin:0 0 6px;">🏠 Idle Clicker House</h3>
      <p style="color:#888;font-size:13px;margin:0;">Level <b style="color:#ffd700">${level}</b> · ${_fmt(data.se)} SE · ${_fmt(seps)}/s</p>
      <p style="color:#aaa;font-size:12px;margin:4px 0;">+${bonuses.goldPct.toFixed(1)}% main-game gold bonus ${bonuses.atkBonus > 0 ? '| +' + bonuses.atkBonus + ' ATK' : ''}</p>
    `;
    container.appendChild(header);

    const openBtn = document.createElement('button');
    openBtn.style.cssText = 'width:100%;padding:14px;background:linear-gradient(135deg,#003366,#001133);color:#00ccff;border:2px solid #00ccff;border-radius:10px;cursor:pointer;font-size:16px;font-weight:bold;font-family:"Courier New",monospace;margin-bottom:10px;';
    openBtn.textContent = '🧠 OPEN NEURAL CLICKER';
    openBtn.addEventListener('click', () => openUI(saveData));
    container.appendChild(openBtn);

    // Mini stats
    const stats = document.createElement('div');
    stats.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;';
    const statItems = [
      ['Lifetime SE', _fmt(data.lifetimeSE || 0)],
      ['Ascensions', (data.ascensions || 0) + (data.ascensions ? ' ✦' : '')],
      ['Total Clicks', _fmt(data.totalClicks || 0)],
      ['Upgrades', Object.keys(data.upgrades || {}).length + '']
    ];
    statItems.forEach(([label, val]) => {
      const card = document.createElement('div');
      card.style.cssText = 'background:rgba(0,20,40,0.6);border:1px solid #00ccff22;border-radius:6px;padding:6px 10px;';
      card.innerHTML = `<div style="font-size:11px;color:#888;">${label}</div><div style="font-size:14px;color:#00ccff;font-weight:bold;">${val}</div>`;
      stats.appendChild(card);
    });
    container.appendChild(stats);
  }

  return {
    tick,
    click,
    buyBuilding,
    buyUpgrade,
    ascend,
    canAscend,
    getClickerLevel,
    getMainGameBonuses,
    getTotalSEPS,
    openUI,
    renderPanel,
    getDefaults,
    BUILDINGS,
    UPGRADES,
    MILESTONES
  };
})();
