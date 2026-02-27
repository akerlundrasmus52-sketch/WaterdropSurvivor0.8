// idle-account.js — Advanced account system with XP from everything
window.GameAccount = (function () {
  var MILESTONES = [
    { level: 5,   title: 'Newcomer',      border: null },
    { level: 10,  title: 'Beginner',      border: 'Bronze' },
    { level: 25,  title: 'Skilled',       border: null },
    { level: 50,  title: 'Veteran',       border: 'Silver' },
    { level: 75,  title: 'Expert',        border: null },
    { level: 100, title: 'Master',        border: 'Gold' },
    { level: 150, title: 'Legend',        border: 'Diamond' },
    { level: 200, title: 'Transcendent',  border: 'Prismatic' }
  ];

  var MAX_LEVEL = 200;
  var LOG_MAX = 50;

  function getXPForLevel(level) {
    return level * 100 + level * level * 10;
  }

  function _pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function _esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function getAccountDefaults() {
    return {
      accountName: 'Adventurer',
      profileIcon: '🧙',
      createdAt: Date.now(),
      totalPlaytime: 0,
      level: 1,
      xp: 0,
      totalXP: 0,
      activityLog: [],
      baseStats: null
    };
  }

  function addXP(amount, reason, saveData) {
    if (!saveData.account) saveData.account = getAccountDefaults();
    var acc = saveData.account;
    if (acc.level >= MAX_LEVEL) return { leveledUp: false, newLevel: acc.level };
    acc.xp = (acc.xp || 0) + amount;
    acc.totalXP = (acc.totalXP || 0) + amount;
    if (window.GameStatistics) {
      window.GameStatistics.incrementStat('totalAccountXPEarned', amount, saveData);
    }
    var log = acc.activityLog || [];
    var now = new Date();
    var ts = '[' + _pad2(now.getHours()) + ':' + _pad2(now.getMinutes()) + ']';
    log.unshift({ time: Date.now(), text: (reason || 'XP gained'), xp: amount, ts: ts });
    if (log.length > LOG_MAX) log.length = LOG_MAX;
    acc.activityLog = log;

    var leveledUp = false;
    var newLevel = acc.level;
    while (acc.level < MAX_LEVEL && acc.xp >= getXPForLevel(acc.level)) {
      acc.xp -= getXPForLevel(acc.level);
      acc.level++;
      leveledUp = true;
      newLevel = acc.level;
    }
    return { leveledUp: leveledUp, newLevel: newLevel };
  }

  function getCurrentTitle(saveData) {
    var acc = saveData.account || getAccountDefaults();
    var title = '';
    MILESTONES.forEach(function (m) { if (acc.level >= m.level) title = m.title; });
    return title;
  }

  function getCurrentBorder(saveData) {
    var acc = saveData.account || getAccountDefaults();
    var border = '';
    MILESTONES.forEach(function (m) { if (acc.level >= m.level && m.border) border = m.border; });
    return border;
  }

  function getMilestones() { return MILESTONES; }

  function setProfileName(name, saveData) {
    if (!saveData.account) saveData.account = getAccountDefaults();
    saveData.account.accountName = String(name).slice(0, 24) || 'Adventurer';
  }

  function setProfileIcon(icon, saveData) {
    if (!saveData.account) saveData.account = getAccountDefaults();
    saveData.account.profileIcon = icon || '🧙';
  }

  function _xpBarHTML(acc) {
    var needed = getXPForLevel(acc.level);
    var pct = acc.level >= MAX_LEVEL ? 100 : Math.min(100, Math.floor((acc.xp / needed) * 100));
    return '<div class="acc-xp-bar-wrap"><div class="acc-xp-bar" style="width:' + pct + '%"></div>' +
           '<span class="acc-xp-label">LVL ' + acc.level + '  ' + (acc.level >= MAX_LEVEL ? 'MAX' : acc.xp + ' / ' + needed + ' XP') + '</span></div>';
  }

  function renderAccountPanel(saveData, container) {
    if (!saveData.account) saveData.account = getAccountDefaults();
    var acc = saveData.account;
    var title = getCurrentTitle(saveData);
    var border = getCurrentBorder(saveData);
    var tabs = ['🏅 Profile', '📊 Stats', '📜 Activity Log', '📈 Progression'];
    var active = container._accTab || 0;

    var html = '<div class="acc-panel">';
    html += '<div class="acc-tabs">';
    tabs.forEach(function (t, i) {
      html += '<button class="acc-tab-btn' + (i === active ? ' acc-tab-active' : '') + '" data-tab="' + i + '">' + t + '</button>';
    });
    html += '</div><div class="acc-tab-body">';

    if (active === 0) {
      html += '<div class="acc-profile-card border-' + (border || 'none') + '">';
      html += '<div class="acc-icon">' + _esc(acc.profileIcon) + '</div>';
      html += '<div class="acc-name">' + _esc(acc.accountName) + '</div>';
      if (title) html += '<div class="acc-title">' + title + '</div>';
      if (border) html += '<div class="acc-border">Border: ' + border + '</div>';
      html += _xpBarHTML(acc);
      html += '<div class="acc-edit-row">';
      html += '<input class="acc-name-input" type="text" value="' + _esc(acc.accountName) + '" maxlength="24" placeholder="Name">';
      html += '<input class="acc-icon-input" type="text" value="' + _esc(acc.profileIcon) + '" maxlength="4" placeholder="Icon">';
      html += '<button class="acc-save-btn">Save</button>';
      html += '</div></div>';
    } else if (active === 1) {
      var stats = saveData.stats || {};
      var base = acc.baseStats || {};
      html += '<table class="acc-stats-table"><tr><th>Stat</th><th>Base</th><th>Current</th><th>Bonus</th></tr>';
      var slist = [
        { key: 'hp', label: 'HP' }, { key: 'damage', label: 'Damage' }, { key: 'speed', label: 'Speed' },
        { key: 'armor', label: 'Armor' }, { key: 'critChance', label: 'CritChance' }
      ];
      slist.forEach(function (s) {
        var b = base[s.key] || 0, c = stats[s.key] || 0;
        var diff = b > 0 ? '+' + Math.round((c - b) / b * 100) + '%' : '+' + (c - b);
        html += '<tr><td>' + s.label + '</td><td>' + b + '</td><td>' + c + '</td><td>' + diff + '</td></tr>';
      });
      html += '</table>';
    } else if (active === 2) {
      var log = acc.activityLog || [];
      html += '<div class="acc-log">';
      if (log.length === 0) html += '<p>No activity yet.</p>';
      log.forEach(function (e) {
        html += '<div class="acc-log-entry"><span class="acc-log-ts">' + (e.ts || '') + '</span> ' + e.text + ' <span class="acc-log-xp">+' + e.xp + ' XP</span></div>';
      });
      html += '</div>';
    } else if (active === 3) {
      html += '<div class="acc-milestones">';
      html += _xpBarHTML(acc);
      MILESTONES.forEach(function (m) {
        var unlocked = acc.level >= m.level;
        html += '<div class="acc-milestone ' + (unlocked ? 'milestone-unlocked' : 'milestone-locked') + '">';
        html += (unlocked ? '✅' : '🔒') + ' Lvl ' + m.level + ': <b>' + m.title + '</b>';
        if (m.border) html += ' <span class="milestone-border">+ ' + m.border + ' Border</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div></div>';
    container.innerHTML = html;

    container.querySelectorAll('.acc-tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container._accTab = parseInt(btn.getAttribute('data-tab'));
        renderAccountPanel(saveData, container);
      });
    });
    var saveBtn = container.querySelector('.acc-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var n = container.querySelector('.acc-name-input').value;
        var ic = container.querySelector('.acc-icon-input').value;
        setProfileName(n, saveData);
        setProfileIcon(ic, saveData);
        renderAccountPanel(saveData, container);
      });
    }
  }

  return {
    getAccountDefaults: getAccountDefaults,
    addXP: addXP,
    getXPForLevel: getXPForLevel,
    getCurrentTitle: getCurrentTitle,
    getCurrentBorder: getCurrentBorder,
    getMilestones: getMilestones,
    setProfileName: setProfileName,
    setProfileIcon: setProfileIcon,
    renderAccountPanel: renderAccountPanel
  };
})();
