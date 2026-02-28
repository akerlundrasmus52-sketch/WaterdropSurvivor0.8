// Exposes window.GameIdleBootstrap for use by main.js
// Wires ALL idle systems into the game on DOMContentLoaded

(function () {
  var _tickInterval = null;
  var _panels = {};
  var _activeTab = 'idle';

  var TABS = [
    { id: 'idle',         label: '⛏ Idle' },
    { id: 'fountain',     label: '💧 Fountain' },
    { id: 'expeditions',  label: '🗺 Expeditions' },
    { id: 'prestige',     label: '⭐ Prestige' },
    { id: 'dailies',      label: '📅 Dailies' },
    { id: 'achievements', label: '🏆 Achievements' },
    { id: 'gems',         label: '💎 Gems' },
    { id: 'shop',         label: '🏪 Shop' },
    { id: 'wheel',        label: '🎡 Wheel' },
    { id: 'account',      label: '🧙 Account' },
    { id: 'statistics',   label: '📊 Stats' }
  ];

  function _el(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text) el.textContent = text;
    return el;
  }

  function _renderAchievementsPanel(saveData, container) {
    container.innerHTML = '';
    container.appendChild(_el('h3', 'idle-section-title', '🏆 Achievements'));
    if (!window.GameAchievements) {
      container.appendChild(_el('p', 'idle-muted', 'Achievement system not loaded.'));
      return;
    }
    var GA = window.GameAchievements;
    var ach = saveData.achievements || GA.getAchievementsDefaults();
    var bonuses = GA.getAchievementBonuses(saveData);
    var sumCard = _el('div', 'idle-card');
    sumCard.appendChild(_el('h4', 'idle-card-title', 'Active Bonuses'));
    var hasBonuses = false;
    var bKeys = Object.keys(bonuses);
    for (var k = 0; k < bKeys.length; k++) {
      if (bonuses[bKeys[k]] > 0) {
        hasBonuses = true;
        var bp = _el('p', 'idle-gold-text', '+' + bonuses[bKeys[k]] + '% ' + bKeys[k]);
        bp.style.margin = '2px 0';
        sumCard.appendChild(bp);
      }
    }
    if (!hasBonuses) sumCard.appendChild(_el('p', 'idle-muted', 'No bonuses yet. Unlock achievements!'));
    container.appendChild(sumCard);

    var defs = GA.ACHIEVEMENTS;
    var cats = ['Combat', 'Survival', 'Wealth', 'Clicker', 'Explorer', 'Ascension'];
    for (var c = 0; c < cats.length; c++) {
      var catItems = defs.filter(function (d) { return d.category === cats[c]; });
      if (!catItems.length) continue;
      var ch = _el('h4', 'idle-card-title', cats[c]);
      ch.style.marginTop = '10px';
      container.appendChild(ch);
      for (var i = 0; i < catItems.length; i++) {
        var def = catItems[i];
        var unlocked = !!ach.unlocked[def.id];
        var row = _el('div', 'idle-card');
        row.style.padding = '6px 10px';
        row.style.opacity = unlocked ? '1' : '0.5';
        var nm = _el('span', unlocked ? 'idle-gold-text' : '', (unlocked ? '✓ ' : '○ ') + def.name);
        nm.style.fontWeight = 'bold';
        var ds = _el('span', 'idle-muted', ' — ' + def.description + ' → +' + def.bonus.pct + '% ' + def.bonus.type);
        row.appendChild(nm);
        row.appendChild(ds);
        container.appendChild(row);
      }
    }
  }

  function _switchTab(tabId) {
    _activeTab = tabId;
    for (var t = 0; t < TABS.length; t++) {
      var btn = document.getElementById('idle-tab-btn-' + TABS[t].id);
      var panel = _panels[TABS[t].id];
      if (btn) btn.style.background = TABS[t].id === tabId ? '#5DADE2' : '#16213e';
      if (btn) btn.style.color = TABS[t].id === tabId ? '#1a1a2e' : '#e0e0e0';
      if (panel) panel.style.display = TABS[t].id === tabId ? 'block' : 'none';
    }
    _refreshActivePanel();
  }

  function _refreshActivePanel() {
    if (!window.GameState || !window.GameState.saveData) return;
    var sd = window.GameState.saveData;
    var ui = window.GameIdleUI;
    var container = _panels[_activeTab];
    if (!container) return;
    if (_activeTab === 'idle' && ui) ui.renderIdleDashboard(sd, container);
    else if (_activeTab === 'fountain' && ui) ui.renderClickerFountain(sd, container);
    else if (_activeTab === 'expeditions' && ui) ui.renderExpeditionPanel(sd, container);
    else if (_activeTab === 'prestige' && ui) ui.renderPrestigePanel(sd, container);
    else if (_activeTab === 'dailies' && ui) ui.renderDailyPanel(sd, container);
    else if (_activeTab === 'achievements') _renderAchievementsPanel(sd, container);
    else if (_activeTab === 'gems' && window.GameGems) window.GameGems.renderGemsPanel(sd, container);
    else if (_activeTab === 'shop' && window.GameShop) window.GameShop.renderShopPanel(sd, container);
    else if (_activeTab === 'wheel' && window.GameLuckyWheel) window.GameLuckyWheel.renderWheelPanel(sd, container);
    else if (_activeTab === 'account' && window.GameAccount) window.GameAccount.renderAccountPanel(sd, container);
    else if (_activeTab === 'statistics' && window.GameStatistics) window.GameStatistics.renderStatisticsPanel(sd, container);
  }

  function _buildIdlePanel() {
    var campSection = document.getElementById('camp-buildings-section');
    if (!campSection) return null;
    var wrap = document.createElement('div');
    wrap.id = 'idle-tab-panel-wrap';
    wrap.style.cssText = 'background:#1a1a2e;border:1px solid #5DADE2;border-radius:10px;padding:12px;margin-bottom:12px;';
    var tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;';
    for (var t = 0; t < TABS.length; t++) {
      (function (tab) {
        var btn = document.createElement('button');
        btn.id = 'idle-tab-btn-' + tab.id;
        btn.className = 'idle-btn';
        btn.textContent = tab.label;
        btn.onclick = function () { _switchTab(tab.id); };
        tabBar.appendChild(btn);
      })(TABS[t]);
    }
    wrap.appendChild(tabBar);
    for (var p = 0; p < TABS.length; p++) {
      var panelDiv = document.createElement('div');
      panelDiv.id = 'idle-panel-' + TABS[p].id;
      panelDiv.style.display = 'none';
      panelDiv.style.color = '#e0e0e0';
      _panels[TABS[p].id] = panelDiv;
      wrap.appendChild(panelDiv);
    }
    campSection.parentNode.insertBefore(wrap, campSection);
    return wrap;
  }

  // Merge cloud save into local save, preferring whichever was updated more recently.
  function _mergeCloudSave(local, cloud) {
    var localTs = (local.idle && local.idle.lastTickTime) || 0;
    var cloudTs = (cloud.idle && cloud.idle.lastTickTime) || 0;
    if (cloudTs > localTs) {
      Object.assign(local, cloud);
    }
  }

  var _idleSystemsInit = false;

  function initIdleSystems(saveData) {
    if (_idleSystemsInit) return;
    _idleSystemsInit = true;
    if (window.GameIdle && saveData.idle && saveData.idle.lastTickTime) {
      var offline = window.GameIdle.calculateOfflineProgress(saveData.idle.lastTickTime, saveData);
      saveData.gold = (saveData.gold || 0) + offline.goldEarned;
      if (offline.statPoints > 0 && offline.statTrained) {
        if (!saveData.stats) saveData.stats = {};
        saveData.stats[offline.statTrained] = (saveData.stats[offline.statTrained] || 0) + Math.floor(offline.statPoints);
      }
      if (window.GameIdleUI && offline.elapsedMinutes >= 1) {
        var summary = window.GameIdle.buildWelcomeBackSummary(offline);
        if (summary) window.GameIdleUI.showWelcomeBack(summary);
      }
    }
    if (window.GameDailies) {
      var loginResult = window.GameDailies.checkDailyLogin(saveData);
      if (!loginResult.alreadyClaimed && loginResult.gold != null) saveData.gold = (saveData.gold || 0) + loginResult.gold;
      if (window.GameDailies.shouldResetDailies(saveData)) window.GameDailies.generateDailyQuests(saveData);
    }
    if (window.GameAchievements) window.GameAchievements.checkAchievements(saveData);
    _refreshActivePanel();
  }

  function campIdleTick(saveData) {
    if (window.GameIdle) window.GameIdle.idleTick(saveData);
    if (window.GameClicker) {
      var bonuses = window.GamePrestige ? window.GamePrestige.getAscensionBonuses(saveData) : {};
      window.GameClicker.processAutoClicks(saveData, 1000, bonuses);
    }
    if (window.GameExpeditions) {
      window.GameExpeditions.checkExpeditions(saveData);
    }
    if (window.GameAchievements) window.GameAchievements.checkAchievements(saveData);
  }

  function _startTick() {
    if (_tickInterval) return;
    _tickInterval = setInterval(function () {
      if (window.GameState && window.GameState.saveData) campIdleTick(window.GameState.saveData);
    }, 1000);
  }

  function _stopTick() {
    if (_tickInterval) { clearInterval(_tickInterval); _tickInterval = null; }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.GameIdleCSS) window.GameIdleCSS.init();
    if (window.GameAccountCSS) window.GameAccountCSS.init();
    var wrap = _buildIdlePanel();
    if (wrap) { _switchTab('idle'); _startTick(); }
    if (window.GameState) {
      window.GameState.initIdleSystems = initIdleSystems;
      window.GameState.campIdleTick = campIdleTick;
    }
    // Initialize Firebase Auth, then prompt login if user is not signed in
    if (window.GameAuth) {
      window.GameAuth.initAuth(function () {
        if (!window.GameAuth.getCurrentUser()) {
          window.GameAuth.renderAuthUI(function (user) {
            // If user signed in, attempt to load cloud save
            if (user && window.GameState && window.GameState.saveData) {
              window.GameAuth.loadFromCloud(function (err, cloudSave) {
                if (!err && cloudSave) {
                  _mergeCloudSave(window.GameState.saveData, cloudSave);
                }
                if (window.GameState.saveData) initIdleSystems(window.GameState.saveData);
              });
            } else if (window.GameState && window.GameState.saveData) {
              initIdleSystems(window.GameState.saveData);
            }
          });
        } else if (window.GameState && window.GameState.saveData) {
          // Already signed in — proceed to load cloud save and init
          window.GameAuth.loadFromCloud(function (err, cloudSave) {
            if (!err && cloudSave) {
              _mergeCloudSave(window.GameState.saveData, cloudSave);
            }
            initIdleSystems(window.GameState.saveData);
          });
        }
      });
    }
  });

  window.GameIdleBootstrap = {
    initIdleSystems: initIdleSystems,
    campIdleTick: campIdleTick,
    switchTab: _switchTab,
    refreshPanel: _refreshActivePanel,
    startTick: _startTick,
    stopTick: _stopTick
  };
})();
