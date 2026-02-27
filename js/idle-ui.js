// Exposes window.GameIdleUI for use by main.js
// UI rendering for all idle systems

function _el(tag, cls, style, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (style) e.style.cssText = style;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

function _btn(label, style, onClick) {
  var b = _el('button', 'idle-btn', style);
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// ── Welcome Back ────────────────────────────────────────────────────────────
function showWelcomeBack(summary) {
  var overlay = _el('div', 'idle-overlay');
  var modal   = _el('div', 'idle-modal');

  modal.appendChild(_el('h2', 'idle-modal-title', null, '⏰ Welcome Back!'));
  modal.appendChild(_el('p', 'idle-muted', null, 'You were away for: ' + summary.timeAway));

  var list = _el('ul', 'idle-reward-list');
  if (summary.goldLine)      list.appendChild(_el('li', 'idle-gold-text', null, summary.goldLine));
  if (summary.statLine)      list.appendChild(_el('li', null, null, summary.statLine));
  if (summary.expeditionLine)list.appendChild(_el('li', null, null, summary.expeditionLine));
  if (!list.children.length) list.appendChild(_el('li', 'idle-muted', null, 'Nothing earned while away.'));
  modal.appendChild(list);

  modal.appendChild(_btn('Collect!', 'margin-top:12px;', function () {
    document.body.removeChild(overlay);
  }));

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  return overlay;
}

// ── Idle Dashboard ───────────────────────────────────────────────────────────
function renderIdleDashboard(saveData, container) {
  container.innerHTML = '';
  var idle = (window.GameIdle && saveData.idle) ? saveData.idle : (window.GameIdle ? window.GameIdle.getIdleDefaults() : {});

  var title = _el('h3', 'idle-section-title', null, '⛏ Idle Dashboard');
  container.appendChild(title);

  // Gold Mine card
  var mineCard = _el('div', 'idle-card');
  var mineLevel = idle.goldMineLevel || 0;
  var mineRate  = mineLevel * 2;
  mineCard.appendChild(_el('h4', 'idle-card-title idle-gold-text', null, '🪙 Gold Mine'));
  mineCard.appendChild(_el('p', null, null, 'Level: ' + mineLevel + '/10  |  Rate: ' + mineRate + ' gold/min'));

  if (window.GameIdle) {
    var mineCost = window.GameIdle.getGoldMineUpgradeCost(mineLevel);
    var mineBtn  = _btn(
      mineLevel >= 10 ? 'MAX' : 'Upgrade (' + mineCost + 'g)',
      '',
      function () {
        var result = window.GameIdle.upgradeGoldMine(saveData);
        if (result.success) renderIdleDashboard(saveData, container);
        else alert(result.reason);
      }
    );
    if (mineLevel >= 10) mineBtn.disabled = true;
    mineCard.appendChild(mineBtn);
  }
  container.appendChild(mineCard);

  // Auto-Trainer card
  var trainerCard = _el('div', 'idle-card');
  var trainerLevel = idle.autoTrainerLevel || 0;
  var trainerStat  = idle.autoTrainerStat || 'strength';
  var trainerRate  = (trainerLevel * 0.1).toFixed(1);
  trainerCard.appendChild(_el('h4', 'idle-card-title', null, '🏋 Auto-Trainer'));
  trainerCard.appendChild(_el('p', null, null, 'Level: ' + trainerLevel + '/10  |  Rate: ' + trainerRate + ' ' + trainerStat + '/min'));

  if (window.GameIdle) {
    var statSel = document.createElement('select');
    statSel.className = 'idle-select';
    ['strength', 'agility', 'vitality'].forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      if (s === trainerStat) opt.selected = true;
      statSel.appendChild(opt);
    });
    statSel.addEventListener('change', function () {
      window.GameIdle.setAutoTrainerStat(this.value, saveData);
    });
    trainerCard.appendChild(statSel);

    var trainerCost = window.GameIdle.getAutoTrainerUpgradeCost(trainerLevel);
    var trainerBtn  = _btn(
      trainerLevel >= 10 ? 'MAX' : 'Upgrade (' + trainerCost + 'g)',
      '',
      function () {
        var result = window.GameIdle.upgradeAutoTrainer(saveData);
        if (result.success) renderIdleDashboard(saveData, container);
        else alert(result.reason);
      }
    );
    if (trainerLevel >= 10) trainerBtn.disabled = true;
    trainerCard.appendChild(trainerBtn);
  }
  container.appendChild(trainerCard);

  return container;
}

// ── Clicker Fountain ─────────────────────────────────────────────────────────
function renderClickerFountain(saveData, container) {
  container.innerHTML = '';
  var clicker = (window.GameClicker && saveData.clicker) ? saveData.clicker : (window.GameClicker ? window.GameClicker.getClickerDefaults() : {});

  container.appendChild(_el('h3', 'idle-section-title', null, '💧 Fountain'));

  var fountainWrap = _el('div', 'idle-fountain-wrap');
  var fountain = _el('button', 'idle-fountain-btn', null, '💧');
  fountain.title = 'Click the fountain!';
  fountain.addEventListener('click', function () {
    if (!window.GameClicker) return;
    var result = window.GameClicker.processClick(saveData,
      window.GamePrestige ? window.GamePrestige.getAscensionBonuses(saveData) : {});
    saveData.gold = (saveData.gold || 0) + result.goldEarned;
    fountain.classList.remove('idle-fountain-pop');
    void fountain.offsetWidth;
    fountain.classList.add('idle-fountain-pop');
    goldDisplay.textContent = '💰 Gold: ' + (saveData.gold || 0);
    essenceDisplay.textContent = '✨ Essence: ' + (clicker.essence || 0).toFixed(1);
    comboDisplay.textContent   = result.combo > 0 ? '🔥 Combo x' + (result.combo + 1) : '';
    if (result.isCrit) {
      comboDisplay.textContent += '  💥 CRIT x' + result.critMult;
    }
  });
  fountainWrap.appendChild(fountain);
  container.appendChild(fountainWrap);

  var goldDisplay    = _el('p', 'idle-gold-text',  null, '💰 Gold: ' + (saveData.gold || 0));
  var essenceDisplay = _el('p', 'idle-blue-text',  null, '✨ Essence: ' + (clicker.essence || 0).toFixed(1));
  var comboDisplay   = _el('p', 'idle-combo-text', null, '');
  container.appendChild(goldDisplay);
  container.appendChild(essenceDisplay);
  container.appendChild(comboDisplay);

  // Upgrades
  if (window.GameClicker) {
    var upgTitle = _el('h4', 'idle-card-title', null, 'Upgrades (cost in Essence)');
    container.appendChild(upgTitle);

    var tier = clicker.clickPowerTier || 0;
    var tiers = window.GameClicker.CLICKER_CONFIG.CLICK_POWER_TIERS;
    var cpCost = tier < tiers.length ? tiers[tier].cost : null;
    var cpBtn = _btn(
      tier >= tiers.length ? 'Click Power: MAX' : 'Click Power Tier ' + (tier + 1) + ' (' + cpCost + ' essence)',
      'margin-right:6px;',
      function () {
        var r = window.GameClicker.upgradeClickPower(saveData);
        if (r.success) renderClickerFountain(saveData, container);
        else alert(r.reason);
      }
    );
    if (tier >= tiers.length) cpBtn.disabled = true;
    container.appendChild(cpBtn);

    var acLevel = clicker.autoClickerLevel || 0;
    var acCost  = window.GameClicker.getAutoClickerUpgradeCost(acLevel);
    var acCPS   = window.GameClicker.getAutoClickerCPS(clicker);
    var acBtn   = _btn(
      acLevel >= 10 ? 'Auto-Clicker: MAX' : 'Auto-Clicker Lv' + (acLevel + 1) + ' (' + acCost + ' essence) ' + acCPS.toFixed(1) + ' CPS',
      '',
      function () {
        var r = window.GameClicker.upgradeAutoClicker(saveData);
        if (r.success) renderClickerFountain(saveData, container);
        else alert(r.reason);
      }
    );
    if (acLevel >= 10) acBtn.disabled = true;
    container.appendChild(acBtn);
  }

  return container;
}

// ── Prestige Panel ────────────────────────────────────────────────────────────
function renderPrestigePanel(saveData, container) {
  container.innerHTML = '';
  if (!window.GamePrestige) {
    container.appendChild(_el('p', 'idle-muted', null, 'Prestige system not loaded.'));
    return container;
  }

  var prestige = saveData.prestige || window.GamePrestige.getPrestigeDefaults();
  container.appendChild(_el('h3', 'idle-section-title', null, '⭐ Prestige'));
  container.appendChild(_el('p', null, null, 'Ascensions: ' + (prestige.ascensionCount || 0)));
  container.appendChild(_el('p', 'idle-gold-text', null, 'Ascension Points: ' + (prestige.ascensionPoints || 0)));

  var check = window.GamePrestige.canAscend(saveData);
  var ascendBtn = _btn('ASCEND', 'margin-bottom:12px;', function () {
    if (!confirm('Ascend? Your run progress will reset but permanent bonuses are kept.')) return;
    var result = window.GamePrestige.performAscension(saveData);
    if (result.success) {
      alert('Ascension complete! +' + result.pointsEarned + ' AP earned.');
      renderPrestigePanel(saveData, container);
    } else {
      alert('Cannot ascend: ' + result.reason);
    }
  });
  if (!check.can) { ascendBtn.disabled = true; ascendBtn.title = check.reason; }
  container.appendChild(ascendBtn);

  var skills = window.GamePrestige.ASCENSION_SKILLS;
  var grid = _el('div', 'idle-skill-grid');
  skills.forEach(function (skill) {
    var card = _el('div', 'idle-skill-card');
    var owned = (prestige.skills && prestige.skills[skill.id]) || 0;
    card.appendChild(_el('div', 'idle-skill-name', null, skill.name));
    card.appendChild(_el('div', 'idle-skill-level', null, 'Lv ' + owned + '/' + skill.maxLevel));
    card.appendChild(_el('div', 'idle-muted', null, skill.desc));

    if (owned < skill.maxLevel) {
      var cost = skill.costs[owned];
      var btn  = _btn('Buy (' + cost + ' AP)', '', function () {
        var r = window.GamePrestige.purchaseSkill(skill.id, saveData);
        if (r.success) renderPrestigePanel(saveData, container);
        else alert(r.reason);
      });
      card.appendChild(btn);
    } else {
      card.appendChild(_el('span', 'idle-maxed', null, 'MAXED'));
    }
    grid.appendChild(card);
  });
  container.appendChild(grid);
  return container;
}

// ── Daily Panel ───────────────────────────────────────────────────────────────
function renderDailyPanel(saveData, container) {
  container.innerHTML = '';
  if (!window.GameDailies) {
    container.appendChild(_el('p', 'idle-muted', null, 'Dailies system not loaded.'));
    return container;
  }

  var dailies = saveData.dailies || window.GameDailies.getDailiesDefaults();
  container.appendChild(_el('h3', 'idle-section-title', null, '📅 Daily Rewards'));

  var streak = dailies.loginStreak || 0;
  container.appendChild(_el('p', null, null, 'Login Streak: ' + streak + ' days'));

  var loginBtn = _btn('Claim Daily Login', 'margin-bottom:12px;', function () {
    var result = window.GameDailies.checkDailyLogin(saveData);
    if (result.alreadyClaimed) {
      alert('Already claimed today! Come back tomorrow.');
    } else {
      saveData.gold = (saveData.gold || 0) + result.gold;
      alert('Day ' + result.day + ' reward: +' + result.gold + 'g' + (result.item ? ' + ' + result.item : ''));
      renderDailyPanel(saveData, container);
    }
  });
  container.appendChild(loginBtn);

  container.appendChild(_el('h4', 'idle-card-title', null, '🗂 Daily Quests'));

  var quests = dailies.dailyQuests || [];
  if (quests.length === 0) {
    var genBtn = _btn('Generate Today\'s Quests', '', function () {
      window.GameDailies.generateDailyQuests(saveData);
      renderDailyPanel(saveData, container);
    });
    container.appendChild(genBtn);
  } else {
    var prog = dailies.dailyQuestProgress || {};
    quests.forEach(function (q) {
      var card = _el('div', 'idle-quest-card' + (q.completed ? ' idle-quest-done' : ''));
      card.appendChild(_el('div', 'idle-quest-label', null, q.label + ': ' + q.target + ' ' + q.unit));
      card.appendChild(_el('div', 'idle-muted', null, 'Reward: ' + q.rewardGold + 'g'));

      var current = prog[q.id] || 0;
      var barWrap = _el('div', 'idle-progress-bar-wrap');
      var barFill = _el('div', 'idle-progress-bar-fill');
      var pct = Math.min(100, Math.floor((current / q.target) * 100));
      barFill.style.width = pct + '%';
      barWrap.appendChild(barFill);
      card.appendChild(barWrap);
      card.appendChild(_el('div', 'idle-muted', null, current + '/' + q.target));

      if (q.completed) card.appendChild(_el('span', 'idle-done-badge', null, '✔ Complete'));
      container.appendChild(card);
    });

    var resetBtn = _btn('Refresh Quests (costs 0g)', 'margin-top:8px;', function () {
      window.GameDailies.generateDailyQuests(saveData);
      renderDailyPanel(saveData, container);
    });
    container.appendChild(resetBtn);
  }

  return container;
}

// ── Expedition Panel ──────────────────────────────────────────────────────────
function renderExpeditionPanel(saveData, container) {
  container.innerHTML = '';
  if (!window.GameExpeditions) {
    container.appendChild(_el('p', 'idle-muted', null, 'Expedition system not loaded.'));
    return container;
  }

  container.appendChild(_el('h3', 'idle-section-title', null, '🗺 Expeditions'));

  var expData = saveData.expeditions || window.GameExpeditions.getExpeditionDefaults();
  var active  = expData.activeExpeditions || [];
  container.appendChild(_el('p', 'idle-muted', null, 'Active: ' + active.length + '/' + window.GameExpeditions.MAX_CONCURRENT));

  // Check completed
  var completedBtn = _btn('Check Returns', 'margin-bottom:12px;', function () {
    var results = window.GameExpeditions.checkExpeditions(saveData);
    if (results.length === 0) {
      alert('No expeditions have returned yet.');
    } else {
      var msgs = results.map(function (r) {
        return r.expeditionName + ': +' + r.rewards.gold + 'g' +
          (r.rewards.materials ? ', ' + r.rewards.materials + ' mats' : '') +
          (r.rewards.gear ? ', ' + r.rewards.gear.rarity + ' gear!' : '');
      });
      var totalGold = results.reduce(function (s, r) { return s + r.rewards.gold; }, 0);
      saveData.gold = (saveData.gold || 0) + totalGold;
      alert('Expeditions returned!\n' + msgs.join('\n'));
      renderExpeditionPanel(saveData, container);
    }
  });
  container.appendChild(completedBtn);

  // Active slots
  var now = Date.now();
  active.forEach(function (slot) {
    var card = _el('div', 'idle-card');
    var expDef = window.GameExpeditions.getExpeditionById(slot.expeditionId);
    var name = expDef ? expDef.name : slot.expeditionId;
    var remaining = Math.max(0, slot.endTime - now);
    var remMin  = Math.ceil(remaining / 60000);
    card.appendChild(_el('p', null, null, '🧭 ' + name + ' — returns in ' + remMin + 'm'));
    var dur = (expDef && expDef.duration > 0) ? expDef.duration : 1;
    var pct = Math.min(100, Math.floor((dur - remaining) / dur * 100));
    var barWrap = _el('div', 'idle-progress-bar-wrap');
    var barFill = _el('div', 'idle-progress-bar-fill');
    barFill.style.width = pct + '%';
    barWrap.appendChild(barFill);
    card.appendChild(barWrap);
    container.appendChild(card);
  });

  // Available expeditions
  container.appendChild(_el('h4', 'idle-card-title', null, 'Available Expeditions'));
  window.GameExpeditions.EXPEDITION_DEFS.forEach(function (def) {
    var card = _el('div', 'idle-card');
    var durMin = Math.round(def.duration / 60000);
    var durStr = durMin >= 60 ? (Math.floor(durMin / 60) + 'h' + (durMin % 60 > 0 ? ' ' + (durMin % 60) + 'm' : '')) : durMin + 'm';
    card.appendChild(_el('p', 'idle-card-title', null, def.name + ' (' + durStr + ')'));
    card.appendChild(_el('p', 'idle-muted', null,
      'Gold: ' + def.rewards.goldMin + '-' + def.rewards.goldMax +
      '  Gear: ' + Math.floor(def.rewards.gearChance * 100) + '%'));

    var sendBtn = _btn('Send Companion', '', function () {
      var companions = (saveData.expeditions && saveData.expeditions.companions) || [];
      if (companions.length === 0) {
        alert('No companions available. Add companions to saveData.expeditions.companions first.');
        return;
      }
      var available = companions.filter(function (c) {
        return !active.some(function (a) { return a.companionId === c.id; });
      });
      if (available.length === 0) {
        alert('All companions are on expeditions.');
        return;
      }
      var r = window.GameExpeditions.startExpedition(available[0].id, def.id, saveData);
      if (r.success) renderExpeditionPanel(saveData, container);
      else alert(r.reason);
    });
    if (active.length >= window.GameExpeditions.MAX_CONCURRENT) sendBtn.disabled = true;
    card.appendChild(sendBtn);
    container.appendChild(card);
  });

  return container;
}

window.GameIdleUI = {
  showWelcomeBack: showWelcomeBack,
  renderIdleDashboard: renderIdleDashboard,
  renderClickerFountain: renderClickerFountain,
  renderPrestigePanel: renderPrestigePanel,
  renderDailyPanel: renderDailyPanel,
  renderExpeditionPanel: renderExpeditionPanel
};
