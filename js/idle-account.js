// idle-account.js — Advanced account system with XP from everything
window.GameAccount = (function () {
  var MILESTONES = [
    { level: 1,   title: 'Initiate',             border: null },
    { level: 3,   title: 'Neophyte',             border: null },
    { level: 5,   title: 'Awakened',             border: null },
    { level: 8,   title: 'Seeker',               border: 'Bronze' },
    { level: 10,  title: 'Acolyte of Enki',      border: 'Bronze' },
    { level: 13,  title: 'Watcher',              border: null },
    { level: 16,  title: 'Shard Bearer',         border: null },
    { level: 20,  title: 'Nephilim',             border: 'Silver' },
    { level: 25,  title: 'Bloodguard',           border: 'Silver' },
    { level: 30,  title: 'Eye of Anu',           border: null },
    { level: 35,  title: 'Starcaller',           border: null },
    { level: 40,  title: 'Marduk\'s Blade',      border: 'Gold' },
    { level: 45,  title: 'Celestial Vanguard',   border: 'Gold' },
    { level: 50,  title: 'Annunaki Champion',    border: null },
    { level: 55,  title: 'Warden of Nibiru',     border: null },
    { level: 60,  title: 'Keeper of Tablets',    border: 'Platinum' },
    { level: 65,  title: 'Stargate Guardian',    border: 'Platinum' },
    { level: 70,  title: 'Sovereign of Eridu',   border: null },
    { level: 75,  title: 'Titan of the Abyss',   border: null },
    { level: 80,  title: 'High Priest of Enlil',  border: 'Diamond' },
    { level: 85,  title: 'Grandmaster Annunaki', border: 'Diamond' },
    { level: 88,  title: 'Anunnaki Archon',      border: null },
    { level: 92,  title: 'Ascendant God-King',   border: null },
    { level: 96,  title: 'Waterdrop Survivor',   border: 'Prismatic' },
    { level: 100, title: 'H2O — The Eternal',    border: 'Prismatic' }
  ];

  var MAX_LEVEL = 100;
  var LOG_MAX = 50;

  function getXPForLevel(level) {
    // Rebalanced for 100-level cap: gentler early curve, slightly steeper late
    return level * 80 + level * level * 8;
  }

  function _pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function _esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function _deepMerge(target, source) {
    for (var key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      // Guard against prototype pollution
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
          && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        _deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  var CORE_ATTRS = [
    { key: 'might',     label: 'Might',     icon: '⚔️',  desc: 'Raw attack power',    effect: '+0.2% damage',     stat: 'damage' },
    { key: 'swiftness', label: 'Swiftness', icon: '⚡',  desc: 'Attack speed',         effect: '+0.2% atk speed',  stat: 'atkSpeed' },
    { key: 'agility',   label: 'Agility',   icon: '🏃',  desc: 'Movement speed',       effect: '+0.2% move speed', stat: 'walkSpeed' },
    { key: 'haste',     label: 'Haste',     icon: '⏱️',  desc: 'Cooldown reduction',   effect: '+0.2% CDR',        stat: 'cdr' },
    { key: 'precision', label: 'Precision', icon: '🎯',  desc: 'Accuracy / Auto-aim',  effect: '+0.2% accuracy',   stat: 'accuracy' },
    { key: 'fortitude', label: 'Fortitude', icon: '🛡️',  desc: 'Defense / Toughness',  effect: '+0.2% defense',    stat: 'armor' },
    { key: 'lethality', label: 'Lethality', icon: '💀',  desc: 'Critical strike',      effect: '+0.2% crit',       stat: 'critChance' },
    { key: 'potency',   label: 'Potency',   icon: '✨',  desc: 'Special attack power', effect: '+0.2% special',    stat: 'specialDmg' }
  ];

  var MAX_ATTR_LEVEL = 500;
  var ATTR_BONUS_PER_POINT = 0.002; // 0.2% per point

  var STAT_CATEGORIES = [
    // ── Kinematics (Movement & Control) ─────────────────────────────────────
    { icon: '🏃', name: 'Kinematics', stats: [
      { key: 'walkSpeed',           label: 'Walk Speed',           base: 25 },
      { key: 'topSpeed',            label: 'Top Speed',            base: 6.5 },
      { key: 'acceleration',        label: 'Acceleration',         base: 22.0 },
      { key: 'frictionGrip',        label: 'Friction Grip (Stop)', base: 0.035 },
      { key: 'turnSpeed',           label: 'Turn Speed',           base: 1.0 },
      { key: 'inputResponsiveness', label: 'Input Responsiveness', base: 0.07 }
    ]},
    // ── Dash Dynamics ────────────────────────────────────────────────────────
    { icon: '💨', name: 'Dash Dynamics', stats: [
      { key: 'dashUnlocked',  label: 'Dash Unlocked (0=No/1=Yes)', base: 0 },
      { key: 'dashDistance',  label: 'Dash Distance',              base: 5.0 },
      { key: 'dashCooldown',  label: 'Dash Cooldown (s)',          base: 1.0 },
      { key: 'dashIframes',   label: 'Dash Invincibility Frames',  base: 8 }
    ]},
    // ── Melee Dynamics ───────────────────────────────────────────────────────
    { icon: '⚔️', name: 'Melee Dynamics', stats: [
      { key: 'meleeSwingSpeed',    label: 'Melee Swing Speed',     base: 1.0 },
      { key: 'meleeRecoveryTime',  label: 'Melee Recovery Time',   base: 1.0 },
      { key: 'meleeCleaveAngle',   label: 'Cleave Angle (°)',       base: 60 },
      { key: 'meleeStaggerPower',  label: 'Stagger / Knockback',   base: 1.0 }
    ]},
    // ── Ranged Ballistics ────────────────────────────────────────────────────
    { icon: '🔫', name: 'Ranged Ballistics', stats: [
      { key: 'gunFireRate',       label: 'Gun Fire Rate',          base: 1.0 },
      { key: 'gunReloadSpeed',    label: 'Gun Reload Speed',       base: 1.0 },
      { key: 'gunAimSpeed',       label: 'Gun Aim Speed',          base: 1.0 },
      { key: 'projectileVelocity',label: 'Projectile Velocity',    base: 1.0 },
      { key: 'recoilRecovery',    label: 'Recoil Recovery',        base: 1.0 },
      { key: 'pierceCount',       label: 'Pierce Count',           base: 0 }
    ]},
    // ── Resilience (Defense) ────────────────────────────────────────────────
    { icon: '🛡️', name: 'Resilience', stats: [
      { key: 'maxHp',                  label: 'Max HP',                base: 100 },
      { key: 'hpRegenAmount',          label: 'HP Regen / Tick',       base: 0 },
      { key: 'hpRegenTickRate',        label: 'HP Regen Tick Rate (s)', base: 1.0 },
      { key: 'flatArmor',              label: 'Flat Armor',            base: 0 },
      { key: 'percentDamageReduction', label: '% Damage Reduction',    base: 0, pct: true },
      { key: 'evadeChance',            label: 'Evade Chance',          base: 0, pct: true },
      { key: 'staggerResistance',      label: 'Stagger Resistance',    base: 0, pct: true }
    ]},
    // ── Spiritual & Elemental ────────────────────────────────────────────────
    { icon: '🔥', name: 'Spiritual & Elemental', stats: [
      { key: 'fireDamage',         label: 'Fire Damage',           base: 0, pct: true },
      { key: 'burnChance',         label: 'Burn Chance',           base: 0, pct: true },
      { key: 'iceDamage',          label: 'Ice Damage',            base: 0, pct: true },
      { key: 'freezeChance',       label: 'Freeze Chance',         base: 0, pct: true },
      { key: 'lightningChainCount',label: 'Lightning Chain Count', base: 0 },
      { key: 'spiritualEcho',      label: 'Spiritual Echo (2× cast)', base: 0, pct: true },
      { key: 'lifeSteal',          label: 'Life Steal',            base: 0, pct: true }
    ]},
    // ── Utility ──────────────────────────────────────────────────────────────
    { icon: '🎒', name: 'Utility', stats: [
      { key: 'luck',                label: 'Luck',                  base: 0, pct: true },
      { key: 'xpCollectionRadius',  label: 'XP Collection Radius',  base: 1.0 },
      { key: 'critChance',          label: 'Crit Chance',           base: 0.1, pct: true },
      { key: 'critDamageMultiplier',label: 'Crit Damage Multiplier',base: 1.5 },
      { key: 'goldDropMultiplier',  label: 'Gold Drop Multiplier',  base: 1.0 }
    ]},
    // ── Combat (Offense) ────────────────────────────────────────────────────
    { icon: '💥', name: 'Combat', stats: [
      { key: 'damage',            label: 'Damage',            base: 1.0 },
      { key: 'atkSpeed',          label: 'Attack Speed',      base: 1.0 },
      { key: 'strength',          label: 'Attack Power',      base: 1.0 },
      { key: 'weaponDamage',      label: 'Weapon Damage',     base: 0 },
      { key: 'multiHitChance',    label: 'Multi-Hit Chance',  base: 0, pct: true },
      { key: 'armorPenetration',  label: 'Armor Penetration', base: 0, pct: true },
      { key: 'executeDamage',     label: 'Execute Damage',    base: 0, pct: true },
      { key: 'lowHpDamage',       label: 'Low HP Bonus Dmg',  base: 0, pct: true }
    ]},
    // ── Elemental (Extended) ─────────────────────────────────────────────────
    { icon: '✨', name: 'Elemental (Extended)', stats: [
      { key: 'lightningDamage',  label: 'Lightning Damage',  base: 0, pct: true },
      { key: 'elementalDamage',  label: 'Elemental Damage',  base: 0, pct: true },
      { key: 'slowChance',       label: 'Slow Chance',       base: 0, pct: true },
      { key: 'chainChance',      label: 'Chain Chance',      base: 0, pct: true },
      { key: 'spellEchoChance',  label: 'Spell Echo Chance', base: 0, pct: true },
      { key: 'elementalChain',   label: 'Elemental Chain',   base: 0 },
      { key: 'auraRange',        label: 'Aura Range',        base: 1.0 },
      { key: 'doubleCritChance', label: 'Double Crit',       base: 0, pct: true },
      { key: 'extraProjectiles', label: 'Extra Projectiles', base: 0 },
      { key: 'doubleCastChance', label: 'Double Cast',       base: 0, pct: true }
    ]},
    // ── Survivability (Extended) ─────────────────────────────────────────────
    { icon: '💚', name: 'Survivability (Extended)', stats: [
      { key: 'hpRegen',          label: 'HP Regen/s',        base: 0 },
      { key: 'armor',            label: 'Armor (total)',     base: 0 },
      { key: 'dodgeChance',      label: 'Dodge Chance',      base: 0, pct: true },
      { key: 'thornsPercent',    label: 'Thorns',            base: 0, pct: true },
      { key: 'healOnKill',       label: 'Heal on Kill',      base: 0 },
      { key: 'pickupRange',      label: 'Pickup Range',      base: 1.0 },
      { key: 'dropRate',         label: 'Drop Rate',         base: 1.0 },
      { key: 'treasureHunterChance', label: 'Treasure Hunter', base: 0, pct: true }
    ]}
  ];

  function getAccountDefaults() {
    return {
      accountName: 'Waterdrop',
      profileIcon: '🧙',
      createdAt: Date.now(),
      totalPlaytime: 0,
      level: 1,
      xp: 0,
      totalXP: 0,
      activityLog: [],
      baseStats: null,
      coreAttributes: { might: 0, swiftness: 0, agility: 0, haste: 0, precision: 0, fortitude: 0, lethality: 0, potency: 0 },
      coreAttributePoints: 0,
      companionAttributes: { might: 0, swiftness: 0, agility: 0, haste: 0, precision: 0, fortitude: 0, lethality: 0, potency: 0 },
      companionAttributePoints: 0,
      levelStatBonuses: {}
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
    var levelUpRewards = [];
    while (acc.level < MAX_LEVEL && acc.xp >= getXPForLevel(acc.level)) {
      acc.xp -= getXPForLevel(acc.level);
      acc.level++;
      leveledUp = true;
      newLevel = acc.level;
      // Award 1 core attribute point per account level-up
      if (!acc.coreAttributes) acc.coreAttributes = { might: 0, swiftness: 0, agility: 0, haste: 0, precision: 0, fortitude: 0, lethality: 0, potency: 0 };
      acc.coreAttributePoints = (acc.coreAttributePoints || 0) + 1;
      // Award +0.5% to a random stat permanently
      var randomStats = ['damage', 'atkSpeed', 'walkSpeed', 'critChance', 'maxHp', 'armor', 'hpRegen', 'pickupRange', 'dropRate', 'lifeStealPercent'];
      var randomStat = randomStats[Math.floor(Math.random() * randomStats.length)];
      if (!acc.levelStatBonuses) acc.levelStatBonuses = {};
      acc.levelStatBonuses[randomStat] = (acc.levelStatBonuses[randomStat] || 0) + 0.005;
      levelUpRewards.push({ level: newLevel, stat: randomStat });
    }
    return { leveledUp: leveledUp, newLevel: newLevel, rewards: levelUpRewards };
  }

  // Centralized Annunaki rank → hex color map.  Consumed by both the level-up curtain in
  // quest-system.js and the Account XP bar in the Profile building overlay.
  var RANK_COLORS = {
    Initiate: '#88aacc', Neophyte: '#88aacc', Awakened: '#55cc55',
    Seeker: '#55cc55', 'Acolyte of Enki': '#44aaff',
    Watcher: '#44aaff', 'Shard Bearer': '#44aaff', Nephilim: '#6644cc',
    Bloodguard: '#6644cc', 'Eye of Anu': '#aa44ff', Starcaller: '#aa44ff',
    'Marduk\'s Blade': '#ffaa00', 'Celestial Vanguard': '#ffaa00',
    'Annunaki Champion': '#ffaa00', 'Warden of Nibiru': '#ffd700',
    'Keeper of Tablets': '#ffd700', 'Stargate Guardian': '#ffd700',
    'Sovereign of Eridu': '#ffd700', 'Titan of the Abyss': '#ffd700',
    'High Priest of Enlil': '#88eeff', 'Grandmaster Annunaki': '#88eeff',
    'Anunnaki Archon': '#ff4444', 'Ascendant God-King': '#ff4444',
    'Waterdrop Survivor': '#ff88ff', 'H2O — The Eternal': '#ff88ff'
  };

  function getRankColor(title) {
    return RANK_COLORS[title] || '#FFD700';
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
    saveData.account.accountName = String(name).slice(0, 24) || 'Waterdrop';
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
      html += '</div>';
      // Cloud save / login section
      var isSignedIn = window.GameAuth && window.GameAuth.getCurrentUser && window.GameAuth.getCurrentUser();
      var isConfigured = !(window.GameAuth && window.GameAuth._isPlaceholderConfig && window.GameAuth._isPlaceholderConfig());
      html += '<div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(93,173,226,0.3);text-align:center;">';
      if (isSignedIn) {
        html += '<div style="font-size:12px;color:#2ecc71;margin-bottom:6px;">✅ Signed in — cloud save active</div>';
        html += '<button class="idle-btn" id="acc-signout-btn" style="font-size:12px;padding:4px 12px;">Sign Out</button>';
      } else if (!isConfigured) {
        html += '<div style="font-size:12px;color:#e67e22;margin-bottom:6px;">⚠️ Cloud save not configured — playing locally</div>';
      } else {
        html += '<div style="font-size:12px;color:#aaa;margin-bottom:6px;">☁️ Sign in to sync your progress across devices</div>';
        html += '<button class="idle-btn" id="acc-signin-btn" style="font-size:12px;padding:4px 14px;">🔑 Sign In</button>';
      }
      html += '</div>';
      html += '</div>';
    } else if (active === 1) {
      if (!acc.coreAttributes) acc.coreAttributes = { might: 0, swiftness: 0, agility: 0, haste: 0, precision: 0, fortitude: 0, lethality: 0, potency: 0 };
      if (!acc.companionAttributes) acc.companionAttributes = { might: 0, swiftness: 0, agility: 0, haste: 0, precision: 0, fortitude: 0, lethality: 0, potency: 0 };
      var coreAttrPts = acc.coreAttributePoints || 0;
      var compAttrPts = acc.companionAttributePoints || 0;
      var levelBonuses = acc.levelStatBonuses || {};

      // Header: attribute points available
      html += '<div class="acc-attr-pts-header">⭐ ATTRIBUTE POINTS: ' + coreAttrPts + '</div>';

      // Core attributes with [+] buttons
      html += '<div class="acc-section-title">═══ CORE ATTRIBUTES (Upgradable) ═══</div>';
      html += '<div class="acc-attrs-list">';
      CORE_ATTRS.forEach(function (a) {
        var lvl = acc.coreAttributes[a.key] || 0;
        var bonusPct = (lvl * ATTR_BONUS_PER_POINT * 100).toFixed(1);
        var canUp = coreAttrPts > 0 && lvl < MAX_ATTR_LEVEL;
        html += '<div class="acc-attr-row">';
        html += '<span class="acc-attr-icon">' + a.icon + '</span>';
        html += '<span class="acc-attr-label">' + a.label + '</span>';
        html += '<span class="acc-attr-level">' + lvl + '/' + MAX_ATTR_LEVEL + '</span>';
        html += '<button class="acc-attr-plus' + (canUp ? '' : ' acc-attr-plus-disabled') + '" data-attr="' + a.key + '" ' + (canUp ? '' : 'disabled') + '>[+]</button>';
        html += '<span class="acc-attr-bonus">(+' + bonusPct + '% ' + a.effect.replace(/\+[\d.]+% /, '') + ')</span>';
        html += '</div>';
      });
      html += '</div>';

      // Companion attributes
      html += '<div class="acc-section-title" style="margin-top:10px;">═══ COMPANION ATTRIBUTES ═══</div>';
      html += '<div class="acc-attr-pts-header" style="font-size:12px;">⭐ COMPANION POINTS: ' + compAttrPts + '</div>';
      html += '<div class="acc-attrs-list">';
      CORE_ATTRS.forEach(function (a) {
        var lvl = acc.companionAttributes[a.key] || 0;
        var bonusPct = (lvl * ATTR_BONUS_PER_POINT * 100).toFixed(1);
        var canUp = compAttrPts > 0 && lvl < MAX_ATTR_LEVEL;
        html += '<div class="acc-attr-row">';
        html += '<span class="acc-attr-icon">' + a.icon + '</span>';
        html += '<span class="acc-attr-label">' + a.label + '</span>';
        html += '<span class="acc-attr-level">' + lvl + '/' + MAX_ATTR_LEVEL + '</span>';
        html += '<button class="acc-attr-plus' + (canUp ? '' : ' acc-attr-plus-disabled') + '" data-companion-attr="' + a.key + '" ' + (canUp ? '' : 'disabled') + '>[+]</button>';
        html += '<span class="acc-attr-bonus">(+' + bonusPct + '% ' + a.effect.replace(/\+[\d.]+% /, '') + ')</span>';
        html += '</div>';
      });
      html += '</div>';

      // All stats by category — use live calculateTotalPlayerStats() when available
      // so every camp upgrade, skill, gear and account bonus is reflected here.
      html += '<div class="acc-section-title" style="margin-top:10px;">═══ ALL STATS (Base → Current) ═══</div>';
      var liveStats = null;
      try {
        if (window.calculateTotalPlayerStats) liveStats = window.calculateTotalPlayerStats();
      } catch (e) { liveStats = null; }

      html += '<div class="acc-stats-scroll">';

      // Compute attribute-based bonuses (used as fallback when liveStats unavailable)
      var attrBonus = {};
      CORE_ATTRS.forEach(function (a) {
        var lvl = acc.coreAttributes[a.key] || 0;
        attrBonus[a.stat] = (attrBonus[a.stat] || 0) + lvl * ATTR_BONUS_PER_POINT;
      });

      STAT_CATEGORIES.forEach(function (cat) {
        html += '<div class="acc-stat-cat-header">' + cat.icon + ' ' + cat.name + '</div>';
        cat.stats.forEach(function (s) {
          var base = s.base;
          var cur, diffStr;
          if (liveStats && liveStats[s.key] !== undefined) {
            // Use real aggregated stat value — reflects ALL sources
            cur = liveStats[s.key];
            if (s.pct) {
              var diff = cur - base;
              var baseStr = (base * 100).toFixed(1) + '%';
              var curStr  = (cur  * 100).toFixed(1) + '%';
              diffStr = diff > 0.0001 ? '+' + (diff * 100).toFixed(1) + '%' : (diff < -0.0001 ? (diff * 100).toFixed(1) + '%' : '—');
              html += '<div class="acc-stat-row"><span class="acc-stat-name">' + s.label + '</span>' +
                      '<span class="acc-stat-vals">' + baseStr + ' → <b>' + curStr + '</b></span>' +
                      '<span class="acc-stat-diff ' + (diff > 0 ? 'acc-stat-up' : '') + '">' + diffStr + '</span></div>';
            } else {
              var diff2 = cur - base;
              var baseStr2 = base.toFixed(base < 10 ? 2 : 0);
              var curStr2  = cur.toFixed(cur  < 10 ? 2 : 0);
              if (base > 0) {
                var pctDiff = ((cur / base) - 1) * 100;
                diffStr = pctDiff > 0.05 ? '+' + pctDiff.toFixed(1) + '%' : (pctDiff < -0.05 ? pctDiff.toFixed(1) + '%' : '—');
              } else {
                diffStr = diff2 > 0 ? '+' + diff2.toFixed(diff2 < 10 ? 2 : 0) : '—';
              }
              html += '<div class="acc-stat-row"><span class="acc-stat-name">' + s.label + '</span>' +
                      '<span class="acc-stat-vals">' + baseStr2 + ' → <b>' + curStr2 + '</b></span>' +
                      '<span class="acc-stat-diff ' + (diff2 > 0 ? 'acc-stat-up' : '') + '">' + diffStr + '</span></div>';
            }
          } else {
            // Fallback: compute from attribute + level bonuses only
            var bonus = (attrBonus[s.key] || 0) + (levelBonuses[s.key] || 0);
            if (s.pct) {
              cur = base + bonus;
              var bsF = (base * 100).toFixed(1) + '%';
              var csF = (cur  * 100).toFixed(1) + '%';
              diffStr = bonus > 0 ? '+' + (bonus * 100).toFixed(1) + '%' : '—';
              html += '<div class="acc-stat-row"><span class="acc-stat-name">' + s.label + '</span>' +
                      '<span class="acc-stat-vals">' + bsF + ' → <b>' + csF + '</b></span>' +
                      '<span class="acc-stat-diff acc-stat-up">' + diffStr + '</span></div>';
            } else {
              cur = base * (1 + bonus);
              var bsNF = base.toFixed(base < 10 ? 2 : 0);
              var csNF = cur.toFixed(cur   < 10 ? 2 : 0);
              diffStr = bonus > 0 ? '+' + (bonus * 100).toFixed(1) + '%' : '—';
              html += '<div class="acc-stat-row"><span class="acc-stat-name">' + s.label + '</span>' +
                      '<span class="acc-stat-vals">' + bsNF + ' → <b>' + csNF + '</b></span>' +
                      '<span class="acc-stat-diff acc-stat-up">' + diffStr + '</span></div>';
            }
          }
        });
      });

      // Level stat bonuses earned — still shown as a summary at the bottom
      var hasLevelBonuses = Object.keys(levelBonuses).length > 0;
      if (hasLevelBonuses) {
        html += '<div class="acc-stat-cat-header">⬆️ Level-Up Bonuses</div>';
        Object.keys(levelBonuses).forEach(function (sk) {
          html += '<div class="acc-stat-row"><span class="acc-stat-name">' + sk + '</span>' +
                  '<span class="acc-stat-vals acc-stat-up">+' + (levelBonuses[sk] * 100).toFixed(1) + '%</span></div>';
        });
      }
      if (liveStats) {
        html += '<div style="text-align:center;color:#2ecc71;font-size:11px;padding:4px;">✅ Showing live values — includes all camp upgrades, skills &amp; gear</div>';
      }
      html += '<div style="text-align:center;color:#666;font-size:11px;padding:6px;">[SCROLL FOR MORE CATEGORIES]</div>';
      html += '</div>';
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

    function _trySave() { try { if (window.saveSaveData) window.saveSaveData(); } catch(e) {} }

    // Attribute [+] button listeners
    container.querySelectorAll('.acc-attr-plus[data-attr]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-attr');
        if (!acc.coreAttributes) acc.coreAttributes = {};
        if ((acc.coreAttributePoints || 0) > 0 && (acc.coreAttributes[key] || 0) < MAX_ATTR_LEVEL) {
          acc.coreAttributes[key] = (acc.coreAttributes[key] || 0) + 1;
          acc.coreAttributePoints--;
          _trySave();
          renderAccountPanel(saveData, container);
        }
      });
    });
    container.querySelectorAll('.acc-attr-plus[data-companion-attr]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-companion-attr');
        if (!acc.companionAttributes) acc.companionAttributes = {};
        if ((acc.companionAttributePoints || 0) > 0 && (acc.companionAttributes[key] || 0) < MAX_ATTR_LEVEL) {
          acc.companionAttributes[key] = (acc.companionAttributes[key] || 0) + 1;
          acc.companionAttributePoints--;
          _trySave();
          renderAccountPanel(saveData, container);
        }
      });
    });

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
    var signinBtn = container.querySelector('#acc-signin-btn');
    if (signinBtn && window.GameAuth) {
      signinBtn.addEventListener('click', function () {
        window.GameAuth.initAuth(function () {
          window.GameAuth.renderAuthUI(function (user) {
            if (user && window.GameAuth.loadFromCloud) {
              window.GameAuth.loadFromCloud(function (err, cloudSave) {
                if (!err && cloudSave && window.GameState && window.GameState.saveData) {
                  // merge and refresh
                  var local = window.GameState.saveData;
                  var localTs = (local.idle && local.idle.lastTickTime) || 0;
                  var cloudTs = (cloudSave.idle && cloudSave.idle.lastTickTime) || 0;
                  if (cloudTs > localTs) _deepMerge(local, cloudSave);
                }
                renderAccountPanel(saveData, container);
              });
            } else {
              renderAccountPanel(saveData, container);
            }
          });
        });
      });
    }
    var signoutBtn = container.querySelector('#acc-signout-btn');
    if (signoutBtn && window.GameAuth) {
      signoutBtn.addEventListener('click', function () {
        window.GameAuth.signOut(function () {
          renderAccountPanel(saveData, container);
        });
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
    getRankColor: getRankColor,
    setProfileName: setProfileName,
    setProfileIcon: setProfileIcon,
    renderAccountPanel: renderAccountPanel,
    CORE_ATTRS: CORE_ATTRS,
    ATTR_BONUS_PER_POINT: ATTR_BONUS_PER_POINT,
    MAX_ATTR_LEVEL: MAX_ATTR_LEVEL
  };
})();
