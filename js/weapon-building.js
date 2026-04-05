/*  ─── weapon-building.js ───────────────────────────────────────────
 *  Full-screen weapon building panel with four tabs:
 *    1. ARSENAL   – browse all 25 weapons
 *    2. UPGRADES  – permanent weapon mods (speed, power, ammo, etc.)
 *    3. LOADOUT   – equipped mods per weapon
 *    4. SPIN WHEEL – starting weapon wheel
 *  Globals used: saveData, saveSaveData(), showStatChange(),
 *                playSound(), progressTutorialQuest()
 * ──────────────────────────────────────────────────────────────────── */

/* ── Constants ──────────────────────────────────────────────────── */

const WEAPON_MOD_DEFS = {
  speed:    { name: 'Fire Rate',  icon: '⚡', maxLevel: 5, costPerLevel: 100, stat: 'cooldown', perLevel: -0.08 },
  power:    { name: 'Power',      icon: '💪', maxLevel: 5, costPerLevel: 150, stat: 'damage',   perLevel: 0.10 },
  cooldown: { name: 'Cooldown',   icon: '⏱️', maxLevel: 5, costPerLevel: 120, stat: 'cooldown', perLevel: -0.06 },
  sight:    { name: 'Sight',      icon: '🔭', maxLevel: 3, costPerLevel: 200, stat: 'range',    perLevel: 0.15 },
};

// Canonical starting-weapon pool — keyed by internal sandbox weapon IDs.
// Used both by the Starting Weapon Wheel prize list and the jackpot grant logic
// so the two are always in sync.
const STARTING_WEAPON_POOL = [
  { weaponId: 'gun',           label: 'Pistol',         icon: '🔫', rarity: 'common' },
  { weaponId: 'pumpShotgun',   label: 'Shotgun',        icon: '🔫', rarity: 'uncommon' },
  { weaponId: 'sniperRifle',   label: 'Rifle',          icon: '🎯', rarity: 'uncommon' },
  { weaponId: 'uzi',           label: 'Uzi',            icon: '🔫', rarity: 'rare' },
  { weaponId: 'fireRing',      label: 'Fire Ring',      icon: '🔥', rarity: 'rare' },
  { weaponId: 'iceSpear',      label: 'Ice Spear',      icon: '❄️', rarity: 'epic' },
  { weaponId: 'lightning',     label: 'Lightning',      icon: '⚡', rarity: 'epic' },
  { weaponId: 'meteor',        label: 'Meteor',         icon: '☄️', rarity: 'legendary' },
  { weaponId: 'sword',         label: 'Sword',          icon: '⚔️', rarity: 'legendary' },
  { weaponId: 'homingMissile', label: 'Homing Missile', icon: '🚀', rarity: 'legendary' },
];

const WEAPON_FIRE_MODES = {
  single: { name: 'Single', icon: '🔹', cost: 0 },
  burst:  { name: 'Burst',  icon: '🔸', cost: 300 },
  auto:   { name: 'Auto',   icon: '🔴', cost: 500 },
};

const WEAPON_AMMO_TYPES = {
  standard:  { name: 'Standard',      icon: '⚪', cost: 0,   element: null,        bonusDmg: 0,    },
  fire:      { name: 'Fire Ammo',     icon: '🔥', cost: 200, element: 'fire',      bonusDmg: 0.15, dot: 3 },
  ice:       { name: 'Ice Ammo',      icon: '❄️', cost: 200, element: 'ice',       bonusDmg: 0.05, slow: 0.3 },
  poison:    { name: 'Poison Ammo',   icon: '☠️', cost: 200, element: 'poison',    bonusDmg: 0.0,  dot: 5 },
  explosive: { name: 'Explosive Ammo',icon: '💥', cost: 300, element: 'explosive', bonusDmg: 0.20, aoe: 2 },
  dumdum:    { name: 'Dum-Dum Ammo',  icon: '🔴', cost: 250, element: null,        bonusDmg: 0.25, stagger: true },
};

const FIRE_MODE_ORDER = ['single', 'burst', 'auto'];

/* ── Weapon display metadata ──────────────────────────────────── */

const WEAPON_DISPLAY = {
  // Category 1 – Handheld
  gun:          { name: 'Pistol',         icon: '🔫', rarity: 'common',    category: 'Handheld' },
  sword:        { name: 'Sword',          icon: '⚔️', rarity: 'common',    category: 'Handheld' },
  samuraiSword: { name: 'Samurai Sword',  icon: '🗡️', rarity: 'rare',      category: 'Handheld' },
  whip:         { name: 'Whip',           icon: '🪢', rarity: 'common',    category: 'Handheld' },
  uzi:          { name: 'Uzi',            icon: '🔫', rarity: 'rare',      category: 'Handheld' },
  sniperRifle:  { name: 'Sniper Rifle',   icon: '🎯', rarity: 'epic',      category: 'Handheld' },
  pumpShotgun:  { name: 'Pump Shotgun',   icon: '💥', rarity: 'common',    category: 'Handheld' },
  autoShotgun:  { name: 'Auto Shotgun',   icon: '💥', rarity: 'rare',      category: 'Handheld' },
  minigun:      { name: 'Minigun',        icon: '🔥', rarity: 'legendary', category: 'Handheld' },
  bow:          { name: 'Bow',            icon: '🏹', rarity: 'common',    category: 'Handheld' },
  teslaSaber:   { name: 'Tesla Saber',    icon: '⚡', rarity: 'epic',      category: 'Handheld' },
  doubleBarrel: { name: 'Double Barrel',  icon: '🔫', rarity: 'rare',      category: 'Handheld' },

  // Category 2 – Passive
  droneTurret:  { name: 'Drone Turret',   icon: '🤖', rarity: 'rare',      category: 'Passive' },
  aura:         { name: 'Aura',           icon: '🔮', rarity: 'common',    category: 'Passive' },
  boomerang:    { name: 'Boomerang',      icon: '🪃', rarity: 'common',    category: 'Passive' },
  shuriken:     { name: 'Shuriken',       icon: '✦',  rarity: 'rare',      category: 'Passive' },
  nanoSwarm:    { name: 'Nano Swarm',     icon: '🤖', rarity: 'legendary', category: 'Passive' },
  homingMissile:{ name: 'Homing Missile', icon: '🚀', rarity: 'epic',      category: 'Passive' },
  iceSpear:     { name: 'Ice Spear',      icon: '❄️', rarity: 'rare',      category: 'Passive' },

  // Category 3 – Elemental
  meteor:       { name: 'Meteor',         icon: '☄️', rarity: 'epic',      category: 'Elemental' },
  fireRing:     { name: 'Fire Ring',      icon: '🔥', rarity: 'rare',      category: 'Elemental' },
  lightning:    { name: 'Lightning',      icon: '⚡', rarity: 'rare',      category: 'Elemental' },
  poison:       { name: 'Poison Cloud',   icon: '☠️', rarity: 'common',    category: 'Elemental' },
  fireball:     { name: 'Fireball',       icon: '🔥', rarity: 'rare',      category: 'Elemental' },
};

const RARITY_COLORS = {
  common:    '#aaaaaa',
  uncommon:  '#55cc55',
  rare:      '#4FC3F7',
  epic:      '#AA44FF',
  legendary: '#F39C12',
  mythic:    '#E74C3C',
};

const CATEGORY_ICONS = {
  Handheld:  '🗡️',
  Passive:   '🛡️',
  Elemental: '🌀',
};

/* ── Helpers ────────────────────────────────────────────────────── */

function _ensureUpgradeData() {
  if (!saveData.weaponUpgrades) saveData.weaponUpgrades = {};
  var defaults = (typeof window.GameWeapons !== 'undefined' && window.GameWeapons.getDefaultWeapons)
    ? window.GameWeapons.getDefaultWeapons() : {};
  var weaponIds = Object.keys(defaults).length ? Object.keys(defaults) : Object.keys(WEAPON_DISPLAY);
  weaponIds.forEach(function (id) {
    if (!saveData.weaponUpgrades[id]) {
      saveData.weaponUpgrades[id] = {
        speed: 0, power: 0, cooldown: 0, sight: 0,
        fireMode: 'single', ammoType: 'standard',
      };
    }
  });
}

function getWeaponMods(weaponId) {
  _ensureUpgradeData();
  return saveData.weaponUpgrades[weaponId] || {
    speed: 0, power: 0, cooldown: 0, sight: 0,
    fireMode: 'single', ammoType: 'standard',
  };
}

function _getAllWeapons() {
  var defaults = (typeof window.GameWeapons !== 'undefined' && window.GameWeapons.getDefaultWeapons)
    ? window.GameWeapons.getDefaultWeapons() : {};
  var list = [];
  Object.keys(WEAPON_DISPLAY).forEach(function (id) {
    var base = defaults[id] || {};
    var disp = WEAPON_DISPLAY[id];
    list.push({
      id: id,
      name: disp.name,
      icon: disp.icon,
      rarity: disp.rarity,
      category: disp.category,
      damage: base.damage || 0,
      cooldown: base.cooldown || 0,
      range: base.range || base.area || 0,
      active: !!base.active,
      level: base.level || 0,
      extra: _extraProps(id, base),
    });
  });
  return list;
}

function _extraProps(id, base) {
  var props = [];
  if (base.piercing)        props.push('Pierce ' + base.piercing);
  if (base.pellets)         props.push(base.pellets + ' pellets');
  if (base.chainHits)       props.push('Chain ' + base.chainHits);
  if (base.chainLightning)  props.push('Chain ⚡');
  if (base.droneCount)      props.push('Drones ' + base.droneCount);
  if (base.returnHits)      props.push('Returns');
  if (base.swarmCount)      props.push('Swarm ' + base.swarmCount);
  if (base.slowPercent)     props.push('Slow ' + Math.round(base.slowPercent * 100) + '%');
  if (base.dotDamage)       props.push('DoT ' + base.dotDamage);
  if (base.explosionRadius) props.push('AoE ' + base.explosionRadius);
  if (base.strikes)         props.push('Strikes ' + base.strikes);
  if (base.orbs)            props.push(base.orbs + ' orbs');
  return props;
}

function _isOwned(weaponId) {
  var crafted = saveData.craftedWeapons || {};
  if (crafted[weaponId]) return true;
  if (weaponId === 'gun') return true;
  var defaults = (typeof window.GameWeapons !== 'undefined' && window.GameWeapons.getDefaultWeapons)
    ? window.GameWeapons.getDefaultWeapons() : {};
  var w = defaults[weaponId];
  return w && w.active;
}

function _getEffectiveStats(weapon) {
  var mods = getWeaponMods(weapon.id);
  var dmg = weapon.damage;
  var cd  = weapon.cooldown;
  var rng = weapon.range;
  // Use same MIN_COOLDOWN_MULTIPLIER (0.2) floor as weapons.js
  var MIN_CD_MULT = 0.2;

  dmg *= (1 + (mods.power * WEAPON_MOD_DEFS.power.perLevel));
  cd  *= Math.max(MIN_CD_MULT, 1 + (mods.speed * WEAPON_MOD_DEFS.speed.perLevel) + (mods.cooldown * WEAPON_MOD_DEFS.cooldown.perLevel));
  rng *= (1 + (mods.sight * WEAPON_MOD_DEFS.sight.perLevel));

  var ammo = WEAPON_AMMO_TYPES[mods.ammoType] || WEAPON_AMMO_TYPES.standard;
  dmg *= (1 + (ammo.bonusDmg || 0));

  return { damage: Math.round(dmg * 10) / 10, cooldown: Math.round(cd), range: Math.round(rng * 10) / 10 };
}

/* ── Shared DOM helpers ─────────────────────────────────────────── */

function _el(tag, css, text) {
  var e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

function _html(tag, css, html) {
  var e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

var OVERLAY_BG   = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:500;display:flex;flex-direction:column;align-items:center;overflow-y:auto;font-family:Arial,sans-serif;';
var PANEL_MAX    = 'width:100%;max-width:600px;padding:12px 16px;box-sizing:border-box;';
var CARD_BG      = 'background:linear-gradient(135deg,rgba(40,40,60,0.9),rgba(20,20,40,0.9));border-radius:10px;padding:12px;margin-bottom:10px;';
var HEADER_FONT  = "font-family:'Bangers',cursive;";
var GOLD         = '#FFD700';
var CYAN         = '#4FC3F7';
var GREEN        = '#00FF64';

/* ================================================================
 *  MAIN  –  showWeaponBuilding()
 * ================================================================ */

function showWeaponBuilding() {
  _ensureUpgradeData();

  // Remove any existing overlay
  var old = document.getElementById('weapon-building-overlay');
  if (old) old.remove();

  /* ── Overlay ─────────────────────────────────────────────────── */
  var overlay = _el('div', OVERLAY_BG);
  overlay.id = 'weapon-building-overlay';
  document.body.appendChild(overlay);

  /* ── Close button ────────────────────────────────────────────── */
  var closeBtn = _el('div',
    'position:fixed;top:10px;right:14px;font-size:28px;color:#fff;cursor:pointer;z-index:510;' +
    'width:36px;height:36px;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(0,0,0,0.5);border-radius:50%;', '✕');
  closeBtn.addEventListener('click', function () { overlay.remove(); });
  overlay.appendChild(closeBtn);

  /* ── Title ───────────────────────────────────────────────────── */
  var title = _html('div',
    HEADER_FONT + 'font-size:28px;color:' + GOLD + ';text-align:center;margin:16px 0 4px;letter-spacing:2px;',
    '🛠️ WEAPON BUILDING');
  overlay.appendChild(title);

  /* ── Gold indicator ──────────────────────────────────────────── */
  var goldBar = _html('div',
    'color:' + GOLD + ';font-size:14px;text-align:center;margin-bottom:10px;',
    '💰 ' + (saveData.gold || 0) + ' Gold');
  overlay.appendChild(goldBar);

  function refreshGold() {
    goldBar.innerHTML = '💰 ' + (saveData.gold || 0) + ' Gold';
  }

  /* ── Tab bar ─────────────────────────────────────────────────── */
  var TABS = [
    { id: 'arsenal',  label: '⚔️ ARSENAL' },
    { id: 'upgrades', label: '🔧 UPGRADES' },
    { id: 'loadout',  label: '📦 LOADOUT' },
    { id: 'spin',     label: '🎰 SPIN WHEEL' },
  ];

  var tabBar = _el('div',
    'display:flex;gap:4px;width:100%;max-width:600px;padding:0 16px;box-sizing:border-box;margin-bottom:8px;flex-shrink:0;');
  overlay.appendChild(tabBar);

  var tabBtns = {};
  var tabPanels = {};
  var activeTab = 'arsenal';

  TABS.forEach(function (t) {
    var btn = _el('div',
      'flex:1;text-align:center;padding:8px 4px;border-radius:8px 8px 0 0;cursor:pointer;' +
      'font-size:12px;font-weight:bold;transition:background 0.2s;user-select:none;letter-spacing:0.5px;' +
      HEADER_FONT, t.label);
    tabBtns[t.id] = btn;

    btn.addEventListener('click', function () { switchTab(t.id); });
    tabBar.appendChild(btn);
  });

  /* ── Tab content container ───────────────────────────────────── */
  var content = _el('div', PANEL_MAX + 'flex:1;overflow-y:auto;padding-bottom:30px;');
  overlay.appendChild(content);

  TABS.forEach(function (t) {
    var panel = _el('div', 'display:none;');
    tabPanels[t.id] = panel;
    content.appendChild(panel);
  });

  function switchTab(id) {
    activeTab = id;
    TABS.forEach(function (t) {
      var isActive = t.id === id;
      tabBtns[t.id].style.background = isActive ? GOLD : '#3a3a3a';
      tabBtns[t.id].style.color = isActive ? '#000' : '#999';
      tabPanels[t.id].style.display = isActive ? 'block' : 'none';
    });
    // Rebuild active panel
    if (id === 'arsenal')  buildArsenal(tabPanels.arsenal);
    if (id === 'upgrades') buildUpgrades(tabPanels.upgrades);
    if (id === 'loadout')  buildLoadout(tabPanels.loadout);
    if (id === 'spin')     buildSpinWheel(tabPanels.spin);
  }

  /* ================================================================
   *  TAB 1 – ARSENAL
   * ================================================================ */

  function buildArsenal(panel) {
    panel.innerHTML = '';
    var weapons = _getAllWeapons();
    var categories = ['Handheld', 'Passive', 'Elemental'];

    categories.forEach(function (cat) {
      var catWeapons = weapons.filter(function (w) { return w.category === cat; });
      if (!catWeapons.length) return;

      var header = _html('div',
        HEADER_FONT + 'font-size:20px;color:' + GOLD + ';margin:14px 0 8px;',
        (CATEGORY_ICONS[cat] || '') + ' ' + cat.toUpperCase());
      panel.appendChild(header);

      catWeapons.forEach(function (w) {
        var owned = _isOwned(w.id);
        var rarityCol = RARITY_COLORS[w.rarity] || '#aaa';
        var card = _el('div',
          CARD_BG + 'border:2px solid ' + rarityCol + ';cursor:pointer;transition:transform 0.15s;');
        card.addEventListener('mouseenter', function () { card.style.transform = 'scale(1.02)'; });
        card.addEventListener('mouseleave', function () { card.style.transform = 'scale(1)'; });
        card.addEventListener('click', function () { openWeaponDetail(w); });

        // Top row: icon + info
        var row = _el('div', 'display:flex;align-items:center;gap:12px;');
        card.appendChild(row);

        var iconBox = _el('div',
          'font-size:48px;width:56px;height:56px;display:flex;align-items:center;justify-content:center;' +
          'background:rgba(255,255,255,0.05);border-radius:8px;flex-shrink:0;',
          w.icon);
        row.appendChild(iconBox);

        var info = _el('div', 'flex:1;min-width:0;');
        row.appendChild(info);

        var nameRow = _el('div', 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;');
        info.appendChild(nameRow);

        var nameEl = _el('span',
          HEADER_FONT + 'font-size:17px;color:#fff;', w.name);
        nameRow.appendChild(nameEl);

        var badge = _el('span',
          'font-size:10px;padding:2px 6px;border-radius:4px;background:' + rarityCol + '22;color:' + rarityCol + ';' +
          'border:1px solid ' + rarityCol + '55;text-transform:uppercase;', w.rarity);
        nameRow.appendChild(badge);

        if (owned) {
          var ownBadge = _el('span',
            'font-size:10px;padding:2px 6px;border-radius:4px;background:' + GREEN + '22;color:' + GREEN + ';' +
            'border:1px solid ' + GREEN + '55;', '✓ OWNED');
          nameRow.appendChild(ownBadge);
        }

        // Mod icons preview
        var mods = getWeaponMods(w.id);
        var modIcons = _buildModIconsString(mods);
        if (modIcons) {
          var modRow = _html('div', 'font-size:11px;color:#888;margin-top:2px;', modIcons);
          info.appendChild(modRow);
        }

        // Stats row
        var stats = _el('div', 'display:flex;gap:10px;margin-top:4px;flex-wrap:wrap;');
        info.appendChild(stats);

        var effective = _getEffectiveStats(w);
        _appendStat(stats, '⚔️', effective.damage, CYAN);
        _appendStat(stats, '⏱️', effective.cooldown + 'ms', '#ccc');
        if (effective.range) _appendStat(stats, '🎯', effective.range, '#8BC34A');

        if (w.extra.length) {
          var extraEl = _el('div', 'font-size:11px;color:#aaa;margin-top:3px;',
            w.extra.join(' · '));
          info.appendChild(extraEl);
        }

        panel.appendChild(card);
      });
    });
  }

  /* ── Weapon detail view ──────────────────────────────────────── */

  function openWeaponDetail(w) {
    var owned = _isOwned(w.id);
    var rarityCol = RARITY_COLORS[w.rarity] || '#aaa';
    var mods = getWeaponMods(w.id);
    var effective = _getEffectiveStats(w);

    var detailOverlay = _el('div',
      'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:520;' +
      'display:flex;flex-direction:column;align-items:center;overflow-y:auto;font-family:Arial,sans-serif;');
    document.body.appendChild(detailOverlay);

    var closeDetail = _el('div',
      'position:fixed;top:10px;right:14px;font-size:28px;color:#fff;cursor:pointer;z-index:530;' +
      'width:36px;height:36px;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.5);border-radius:50%;', '✕');
    closeDetail.addEventListener('click', function () { detailOverlay.remove(); });
    detailOverlay.appendChild(closeDetail);

    var box = _el('div', PANEL_MAX + 'padding-top:20px;padding-bottom:40px;');
    detailOverlay.appendChild(box);

    // Header
    var hdr = _el('div', 'text-align:center;margin-bottom:16px;');
    box.appendChild(hdr);

    var bigIcon = _el('div', 'font-size:72px;', w.icon);
    hdr.appendChild(bigIcon);

    var dName = _html('div',
      HEADER_FONT + 'font-size:26px;color:#fff;margin-top:4px;',
      w.name + ' <span style="color:' + rarityCol + ';font-size:14px;">' + w.rarity.toUpperCase() + '</span>');
    hdr.appendChild(dName);

    var catBadge = _el('div',
      'font-size:12px;color:#888;margin-top:2px;',
      (CATEGORY_ICONS[w.category] || '') + ' ' + w.category);
    hdr.appendChild(catBadge);

    if (!owned) {
      var lockMsg = _el('div',
        'text-align:center;color:#E74C3C;font-size:14px;margin:10px 0;padding:8px;' +
        'border:1px solid #E74C3C44;border-radius:8px;background:rgba(231,76,60,0.08);',
        '🔒 Not yet unlocked — craft or discover this weapon first!');
      box.appendChild(lockMsg);
    }

    // Stats card
    var statsCard = _el('div', CARD_BG + 'border:1px solid ' + rarityCol + '44;');
    box.appendChild(statsCard);

    var statsTitle = _html('div',
      HEADER_FONT + 'font-size:16px;color:' + GOLD + ';margin-bottom:8px;', '📊 EFFECTIVE STATS');
    statsCard.appendChild(statsTitle);

    var sg = _el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:6px;');
    statsCard.appendChild(sg);

    _appendStatBlock(sg, '⚔️ Damage', effective.damage, w.damage, CYAN);
    _appendStatBlock(sg, '⏱️ Cooldown', effective.cooldown + 'ms', w.cooldown + 'ms', '#ccc');
    _appendStatBlock(sg, '🎯 Range', effective.range, w.range, '#8BC34A');
    _appendStatBlock(sg, '🔫 Fire Mode', WEAPON_FIRE_MODES[mods.fireMode].icon + ' ' + WEAPON_FIRE_MODES[mods.fireMode].name, '', '#F39C12');

    if (mods.ammoType !== 'standard') {
      var ammo = WEAPON_AMMO_TYPES[mods.ammoType];
      _appendStatBlock(sg, '💎 Ammo', ammo.icon + ' ' + ammo.name, '', '#E74C3C');
    }

    if (w.extra.length) {
      var extraCard = _el('div', 'grid-column:1/-1;font-size:12px;color:#aaa;padding:4px 0;',
        '✦ ' + w.extra.join(' · '));
      sg.appendChild(extraCard);
    }

    // Installed mods summary
    var modSummary = _el('div', CARD_BG + 'border:1px solid #ffffff11;margin-top:8px;');
    box.appendChild(modSummary);

    var modTitle = _html('div',
      HEADER_FONT + 'font-size:16px;color:' + GOLD + ';margin-bottom:8px;', '🔩 INSTALLED MODS');
    modSummary.appendChild(modTitle);

    var modGrid = _el('div', 'display:flex;flex-wrap:wrap;gap:6px;');
    modSummary.appendChild(modGrid);

    Object.keys(WEAPON_MOD_DEFS).forEach(function (modKey) {
      var def = WEAPON_MOD_DEFS[modKey];
      var lvl = mods[modKey] || 0;
      var pill = _el('div',
        'font-size:12px;padding:4px 8px;border-radius:6px;' +
        'background:' + (lvl > 0 ? 'rgba(79,195,247,0.15)' : 'rgba(255,255,255,0.05)') + ';' +
        'color:' + (lvl > 0 ? CYAN : '#666') + ';border:1px solid ' + (lvl > 0 ? CYAN + '44' : '#333') + ';',
        def.icon + ' ' + def.name + ' ' + lvl + '/' + def.maxLevel);
      modGrid.appendChild(pill);
    });

    // Fire mode pill
    var fmPill = _el('div',
      'font-size:12px;padding:4px 8px;border-radius:6px;' +
      'background:rgba(243,156,18,0.15);color:#F39C12;border:1px solid #F39C1244;',
      WEAPON_FIRE_MODES[mods.fireMode].icon + ' ' + WEAPON_FIRE_MODES[mods.fireMode].name);
    modGrid.appendChild(fmPill);

    // Ammo pill
    var ammoObj = WEAPON_AMMO_TYPES[mods.ammoType] || WEAPON_AMMO_TYPES.standard;
    var ammoPill = _el('div',
      'font-size:12px;padding:4px 8px;border-radius:6px;' +
      'background:' + (mods.ammoType !== 'standard' ? 'rgba(231,76,60,0.15)' : 'rgba(255,255,255,0.05)') + ';' +
      'color:' + (mods.ammoType !== 'standard' ? '#E74C3C' : '#666') + ';' +
      'border:1px solid ' + (mods.ammoType !== 'standard' ? '#E74C3C44' : '#333') + ';',
      ammoObj.icon + ' ' + ammoObj.name);
    modGrid.appendChild(ammoPill);

    // Quick upgrade button
    if (owned) {
      var goUpgrade = _el('div',
        'text-align:center;margin-top:14px;padding:10px 20px;border-radius:8px;cursor:pointer;' +
        'background:linear-gradient(135deg,' + GOLD + ',' + '#FFA000' + ');color:#000;font-weight:bold;' +
        HEADER_FONT + 'font-size:16px;letter-spacing:1px;',
        '🔧 UPGRADE THIS WEAPON');
      goUpgrade.addEventListener('click', function () {
        detailOverlay.remove();
        switchTab('upgrades');
        // Scroll to this weapon
        setTimeout(function () {
          var el = document.getElementById('upgrade-card-' + w.id);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      });
      box.appendChild(goUpgrade);
    }

    // Back button
    var backBtn = _el('div',
      'text-align:center;margin-top:10px;padding:8px 16px;border-radius:8px;cursor:pointer;' +
      'background:rgba(255,255,255,0.08);color:#aaa;font-size:14px;', '← Back to Arsenal');
    backBtn.addEventListener('click', function () { detailOverlay.remove(); });
    box.appendChild(backBtn);
  }

  /* ================================================================
   *  TAB 2 – UPGRADES
   * ================================================================ */

  function buildUpgrades(panel) {
    panel.innerHTML = '';
    var weapons = _getAllWeapons().filter(function (w) { return _isOwned(w.id); });

    if (!weapons.length) {
      panel.appendChild(_el('div',
        'text-align:center;color:#888;padding:40px 0;font-size:16px;',
        '🔒 No weapons owned yet. Craft or discover weapons first!'));
      return;
    }

    var subTitle = _html('div',
      'font-size:12px;color:#888;text-align:center;margin-bottom:12px;',
      'Install permanent upgrades on your weapons');

    panel.appendChild(subTitle);

    weapons.forEach(function (w) {
      var rarityCol = RARITY_COLORS[w.rarity] || '#aaa';
      var card = _el('div', CARD_BG + 'border:2px solid ' + rarityCol + ';');
      card.id = 'upgrade-card-' + w.id;
      panel.appendChild(card);

      // Weapon header
      var wHeader = _el('div', 'display:flex;align-items:center;gap:10px;margin-bottom:10px;');
      card.appendChild(wHeader);

      var wIcon = _el('div',
        'font-size:36px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(255,255,255,0.05);border-radius:8px;flex-shrink:0;', w.icon);
      wHeader.appendChild(wIcon);

      var wName = _html('div',
        HEADER_FONT + 'font-size:18px;color:#fff;flex:1;',
        w.name + ' <span style="color:' + rarityCol + ';font-size:11px;">' + w.rarity.toUpperCase() + '</span>');
      wHeader.appendChild(wName);

      // Separator
      card.appendChild(_el('hr', 'border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0 0 8px;'));

      // Stat mods grid
      Object.keys(WEAPON_MOD_DEFS).forEach(function (modKey) {
        var def = WEAPON_MOD_DEFS[modKey];
        var mods = getWeaponMods(w.id);
        var lvl = mods[modKey] || 0;
        var maxed = lvl >= def.maxLevel;
        var cost = def.costPerLevel;

        var modRow = _el('div',
          'display:flex;align-items:center;gap:8px;padding:6px 0;' +
          'border-bottom:1px solid rgba(255,255,255,0.04);');
        card.appendChild(modRow);

        var modIcon = _el('span', 'font-size:18px;width:26px;text-align:center;flex-shrink:0;', def.icon);
        modRow.appendChild(modIcon);

        var modInfo = _el('div', 'flex:1;min-width:0;');
        modRow.appendChild(modInfo);

        var modName = _el('div', 'font-size:13px;color:#fff;', def.name);
        modInfo.appendChild(modName);

        // Level pips
        var pips = _el('div', 'display:flex;gap:3px;margin-top:2px;');
        modInfo.appendChild(pips);
        for (var i = 0; i < def.maxLevel; i++) {
          var pip = _el('div',
            'width:14px;height:6px;border-radius:2px;' +
            'background:' + (i < lvl ? CYAN : 'rgba(255,255,255,0.12)') + ';');
          pips.appendChild(pip);
        }

        if (maxed) {
          var maxLabel = _el('span',
            'font-size:11px;color:' + GREEN + ';font-weight:bold;', 'MAX');
          modRow.appendChild(maxLabel);
        } else {
          var buyBtn = _el('div',
            'font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer;white-space:nowrap;' +
            'background:' + ((saveData.gold || 0) >= cost ? 'linear-gradient(135deg,' + GOLD + ',' + '#FFA000)' : 'rgba(255,255,255,0.08)') + ';' +
            'color:' + ((saveData.gold || 0) >= cost ? '#000' : '#666') + ';font-weight:bold;',
            '💰 ' + cost);
          buyBtn.addEventListener('click', (function (wId, mk, c) {
            return function () { purchaseMod(wId, mk, c); };
          })(w.id, modKey, cost));
          modRow.appendChild(buyBtn);
        }
      });

      // Fire mode section
      card.appendChild(_el('hr', 'border:none;border-top:1px solid rgba(255,255,255,0.08);margin:8px 0;'));

      var fmLabel = _html('div',
        'font-size:13px;color:' + GOLD + ';margin-bottom:6px;font-weight:bold;', '🔫 Fire Mode');
      card.appendChild(fmLabel);

      var fmRow = _el('div', 'display:flex;gap:6px;flex-wrap:wrap;');
      card.appendChild(fmRow);

      FIRE_MODE_ORDER.forEach(function (fmKey) {
        var fm = WEAPON_FIRE_MODES[fmKey];
        var mods = getWeaponMods(w.id);
        var current = mods.fireMode === fmKey;
        var unlocked = _isFireModeUnlocked(w.id, fmKey);
        var canBuy = !unlocked && _canUnlockFireMode(w.id, fmKey);

        var fmBtn = _el('div',
          'font-size:12px;padding:6px 10px;border-radius:6px;cursor:pointer;text-align:center;min-width:70px;' +
          'background:' + (current ? GOLD + '33' : 'rgba(255,255,255,0.05)') + ';' +
          'border:1px solid ' + (current ? GOLD : unlocked ? '#555' : '#333') + ';' +
          'color:' + (current ? GOLD : unlocked ? '#ccc' : '#555') + ';',
          fm.icon + ' ' + fm.name + (unlocked || fm.cost === 0 ? '' : ' 💰' + fm.cost));

        if (unlocked && !current) {
          fmBtn.addEventListener('click', (function (wId, fk) {
            return function () { setFireMode(wId, fk); };
          })(w.id, fmKey));
        } else if (canBuy) {
          fmBtn.addEventListener('click', (function (wId, fk, c) {
            return function () { buyFireMode(wId, fk, c); };
          })(w.id, fmKey, fm.cost));
        }
        fmRow.appendChild(fmBtn);
      });

      // Ammo type section
      card.appendChild(_el('hr', 'border:none;border-top:1px solid rgba(255,255,255,0.08);margin:8px 0;'));

      var ammoLabel = _html('div',
        'font-size:13px;color:' + GOLD + ';margin-bottom:6px;font-weight:bold;', '💎 Ammo Type');
      card.appendChild(ammoLabel);

      var ammoRow = _el('div', 'display:flex;gap:6px;flex-wrap:wrap;');
      card.appendChild(ammoRow);

      Object.keys(WEAPON_AMMO_TYPES).forEach(function (ammoKey) {
        var at = WEAPON_AMMO_TYPES[ammoKey];
        var mods = getWeaponMods(w.id);
        var current = mods.ammoType === ammoKey;
        var unlocked = _isAmmoUnlocked(w.id, ammoKey);
        var canAfford = (saveData.gold || 0) >= at.cost;

        var aBtn = _el('div',
          'font-size:11px;padding:5px 8px;border-radius:6px;cursor:pointer;text-align:center;' +
          'background:' + (current ? '#E74C3C22' : 'rgba(255,255,255,0.05)') + ';' +
          'border:1px solid ' + (current ? '#E74C3C' : unlocked ? '#444' : '#333') + ';' +
          'color:' + (current ? '#E74C3C' : unlocked ? '#bbb' : '#555') + ';',
          at.icon + ' ' + at.name + (unlocked || at.cost === 0 ? '' : ' 💰' + at.cost));

        if (unlocked && !current) {
          aBtn.addEventListener('click', (function (wId, ak) {
            return function () { setAmmoType(wId, ak); };
          })(w.id, ammoKey));
        } else if (!unlocked && at.cost > 0) {
          aBtn.addEventListener('click', (function (wId, ak, c) {
            return function () { buyAmmoType(wId, ak, c); };
          })(w.id, ammoKey, at.cost));
        }
        ammoRow.appendChild(aBtn);
      });
    });
  }

  /* ── Purchase helpers ────────────────────────────────────────── */

  function purchaseMod(weaponId, modKey, cost) {
    if ((saveData.gold || 0) < cost) {
      if (typeof playSound === 'function') playSound('invalid');
      if (typeof showStatChange === 'function') showStatChange('Not enough gold!', 'normal');
      return;
    }
    var def = WEAPON_MOD_DEFS[modKey];
    var mods = getWeaponMods(weaponId);
    if ((mods[modKey] || 0) >= def.maxLevel) return;

    saveData.gold -= cost;
    mods[modKey] = (mods[modKey] || 0) + 1;
    saveData.weaponUpgrades[weaponId] = mods;

    // Track achievement stat
    if (!saveData.stats) {
      saveData.stats = { itemsCrafted: 0, weaponsUpgraded: 0, statCardsUsed: 0, spinWheelSpins: 0, companionsLeveled: 0, buildingsUpgraded: 0, questsCompleted: 0, skillsUnlocked: 0, gearsEquipped: 0 };
    }
    saveData.stats.weaponsUpgraded = (saveData.stats.weaponsUpgraded || 0) + 1;

    if (typeof saveSaveData === 'function') saveSaveData();
    if (typeof playSound === 'function') playSound('levelup');

    var dispName = WEAPON_DISPLAY[weaponId] ? WEAPON_DISPLAY[weaponId].name : weaponId;
    if (typeof showStatChange === 'function')
      showStatChange(def.icon + ' ' + dispName + ' ' + def.name + ' → Lv.' + mods[modKey], 'high');
    if (typeof progressTutorialQuest === 'function')
      progressTutorialQuest('quest_upgrade_weapon', true);

    refreshGold();
    buildUpgrades(tabPanels.upgrades);
  }

  function _isFireModeUnlocked(weaponId, fmKey) {
    if (fmKey === 'single') return true;
    if (!saveData.weaponUpgrades[weaponId]) return false;
    var unlocked = saveData.weaponUpgrades[weaponId].unlockedFireModes || [];
    return unlocked.indexOf(fmKey) !== -1;
  }

  function _canUnlockFireMode(weaponId, fmKey) {
    var idx = FIRE_MODE_ORDER.indexOf(fmKey);
    if (idx <= 0) return false;
    var prev = FIRE_MODE_ORDER[idx - 1];
    return _isFireModeUnlocked(weaponId, prev);
  }

  function buyFireMode(weaponId, fmKey, cost) {
    if ((saveData.gold || 0) < cost) {
      if (typeof playSound === 'function') playSound('invalid');
      if (typeof showStatChange === 'function') showStatChange('Not enough gold!', 'normal');
      return;
    }
    if (!_canUnlockFireMode(weaponId, fmKey)) {
      if (typeof showStatChange === 'function') showStatChange('Unlock previous fire mode first!', 'normal');
      return;
    }
    saveData.gold -= cost;
    if (!saveData.weaponUpgrades[weaponId].unlockedFireModes)
      saveData.weaponUpgrades[weaponId].unlockedFireModes = [];
    saveData.weaponUpgrades[weaponId].unlockedFireModes.push(fmKey);
    saveData.weaponUpgrades[weaponId].fireMode = fmKey;

    // Track achievement stat
    if (!saveData.stats) {
      saveData.stats = { itemsCrafted: 0, weaponsUpgraded: 0, statCardsUsed: 0, spinWheelSpins: 0, companionsLeveled: 0, buildingsUpgraded: 0, questsCompleted: 0, skillsUnlocked: 0, gearsEquipped: 0 };
    }
    saveData.stats.weaponsUpgraded = (saveData.stats.weaponsUpgraded || 0) + 1;

    if (typeof saveSaveData === 'function') saveSaveData();
    if (typeof playSound === 'function') playSound('levelup');

    var fm = WEAPON_FIRE_MODES[fmKey];
    var dispName = WEAPON_DISPLAY[weaponId] ? WEAPON_DISPLAY[weaponId].name : weaponId;
    if (typeof showStatChange === 'function')
      showStatChange(fm.icon + ' ' + dispName + ' → ' + fm.name + ' mode!', 'rare');

    refreshGold();
    buildUpgrades(tabPanels.upgrades);
  }

  function setFireMode(weaponId, fmKey) {
    saveData.weaponUpgrades[weaponId].fireMode = fmKey;
    if (typeof saveSaveData === 'function') saveSaveData();
    if (typeof playSound === 'function') playSound('collect');
    buildUpgrades(tabPanels.upgrades);
  }

  function _isAmmoUnlocked(weaponId, ammoKey) {
    if (ammoKey === 'standard') return true;
    if (!saveData.weaponUpgrades[weaponId]) return false;
    var unlocked = saveData.weaponUpgrades[weaponId].unlockedAmmo || [];
    return unlocked.indexOf(ammoKey) !== -1;
  }

  function buyAmmoType(weaponId, ammoKey, cost) {
    if ((saveData.gold || 0) < cost) {
      if (typeof playSound === 'function') playSound('invalid');
      if (typeof showStatChange === 'function') showStatChange('Not enough gold!', 'normal');
      return;
    }
    saveData.gold -= cost;
    if (!saveData.weaponUpgrades[weaponId].unlockedAmmo)
      saveData.weaponUpgrades[weaponId].unlockedAmmo = [];
    saveData.weaponUpgrades[weaponId].unlockedAmmo.push(ammoKey);
    saveData.weaponUpgrades[weaponId].ammoType = ammoKey;

    // Track achievement stat
    if (!saveData.stats) {
      saveData.stats = { itemsCrafted: 0, weaponsUpgraded: 0, statCardsUsed: 0, spinWheelSpins: 0, companionsLeveled: 0, buildingsUpgraded: 0, questsCompleted: 0, skillsUnlocked: 0, gearsEquipped: 0 };
    }
    saveData.stats.weaponsUpgraded = (saveData.stats.weaponsUpgraded || 0) + 1;

    if (typeof saveSaveData === 'function') saveSaveData();
    if (typeof playSound === 'function') playSound('levelup');

    var at = WEAPON_AMMO_TYPES[ammoKey];
    var dispName = WEAPON_DISPLAY[weaponId] ? WEAPON_DISPLAY[weaponId].name : weaponId;
    if (typeof showStatChange === 'function')
      showStatChange(at.icon + ' ' + dispName + ' → ' + at.name + '!', 'rare');

    refreshGold();
    buildUpgrades(tabPanels.upgrades);
  }

  function setAmmoType(weaponId, ammoKey) {
    saveData.weaponUpgrades[weaponId].ammoType = ammoKey;
    if (typeof saveSaveData === 'function') saveSaveData();
    if (typeof playSound === 'function') playSound('collect');
    buildUpgrades(tabPanels.upgrades);
  }

  /* ================================================================
   *  TAB 3 – LOADOUT
   * ================================================================ */

  function buildLoadout(panel) {
    panel.innerHTML = '';

    var weapons = _getAllWeapons().filter(function (w) { return _isOwned(w.id); });

    if (!weapons.length) {
      panel.appendChild(_el('div',
        'text-align:center;color:#888;padding:40px 0;font-size:16px;',
        '🔒 No weapons owned yet.'));
      return;
    }

    var subTitle = _html('div',
      'font-size:12px;color:#888;text-align:center;margin-bottom:12px;',
      'View equipped mods and effective stats per weapon');
    panel.appendChild(subTitle);

    weapons.forEach(function (w) {
      var rarityCol = RARITY_COLORS[w.rarity] || '#aaa';
      var mods = getWeaponMods(w.id);
      var effective = _getEffectiveStats(w);

      var card = _el('div', CARD_BG + 'border:2px solid ' + rarityCol + ';');
      panel.appendChild(card);

      // Header row
      var hdr = _el('div', 'display:flex;align-items:center;gap:10px;margin-bottom:10px;');
      card.appendChild(hdr);

      var wIcon = _el('div',
        'font-size:40px;width:48px;height:48px;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(255,255,255,0.05);border-radius:8px;flex-shrink:0;', w.icon);
      hdr.appendChild(wIcon);

      var wInfo = _el('div', 'flex:1;');
      hdr.appendChild(wInfo);

      var wName = _html('div',
        HEADER_FONT + 'font-size:17px;color:#fff;',
        w.name + ' <span style="color:' + rarityCol + ';font-size:11px;">' + w.rarity.toUpperCase() + '</span>');
      wInfo.appendChild(wName);

      var wCat = _el('div', 'font-size:11px;color:#888;',
        (CATEGORY_ICONS[w.category] || '') + ' ' + w.category);
      wInfo.appendChild(wCat);

      // Weapon visual with mod slots
      var visual = _el('div',
        'position:relative;background:rgba(0,0,0,0.3);border-radius:10px;padding:16px;margin-bottom:10px;' +
        'border:1px solid rgba(255,255,255,0.06);');
      card.appendChild(visual);

      // Central weapon icon
      var centerIcon = _el('div',
        'text-align:center;font-size:56px;margin-bottom:12px;', w.icon);
      visual.appendChild(centerIcon);

      // Mod slots around weapon
      var slotsGrid = _el('div',
        'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;');
      visual.appendChild(slotsGrid);

      // Stat mods
      Object.keys(WEAPON_MOD_DEFS).forEach(function (modKey) {
        var def = WEAPON_MOD_DEFS[modKey];
        var lvl = mods[modKey] || 0;
        var slot = _el('div',
          'text-align:center;padding:6px 4px;border-radius:8px;' +
          'background:' + (lvl > 0 ? 'rgba(79,195,247,0.1)' : 'rgba(255,255,255,0.03)') + ';' +
          'border:1px solid ' + (lvl > 0 ? CYAN + '44' : '#222') + ';');
        slotsGrid.appendChild(slot);

        slot.appendChild(_el('div', 'font-size:18px;', def.icon));
        slot.appendChild(_el('div', 'font-size:10px;color:' + (lvl > 0 ? CYAN : '#666') + ';margin-top:2px;',
          def.name));
        slot.appendChild(_el('div', 'font-size:11px;color:' + (lvl > 0 ? '#fff' : '#444') + ';font-weight:bold;',
          lvl > 0 ? 'Lv.' + lvl : '—'));
      });

      // Fire mode slot
      var fmSlot = _el('div',
        'text-align:center;padding:6px 4px;border-radius:8px;' +
        'background:rgba(243,156,18,0.1);border:1px solid #F39C1244;');
      slotsGrid.appendChild(fmSlot);

      var fm = WEAPON_FIRE_MODES[mods.fireMode];
      fmSlot.appendChild(_el('div', 'font-size:18px;', fm.icon));
      fmSlot.appendChild(_el('div', 'font-size:10px;color:#F39C12;margin-top:2px;', 'Fire Mode'));
      fmSlot.appendChild(_el('div', 'font-size:11px;color:#fff;font-weight:bold;', fm.name));

      // Ammo slot
      var ammoObj = WEAPON_AMMO_TYPES[mods.ammoType] || WEAPON_AMMO_TYPES.standard;
      var hasAmmo = mods.ammoType !== 'standard';
      var ammoSlot = _el('div',
        'text-align:center;padding:6px 4px;border-radius:8px;' +
        'background:' + (hasAmmo ? 'rgba(231,76,60,0.1)' : 'rgba(255,255,255,0.03)') + ';' +
        'border:1px solid ' + (hasAmmo ? '#E74C3C44' : '#222') + ';');
      slotsGrid.appendChild(ammoSlot);

      ammoSlot.appendChild(_el('div', 'font-size:18px;', ammoObj.icon));
      ammoSlot.appendChild(_el('div', 'font-size:10px;color:' + (hasAmmo ? '#E74C3C' : '#666') + ';margin-top:2px;',
        'Ammo'));
      ammoSlot.appendChild(_el('div', 'font-size:11px;color:' + (hasAmmo ? '#fff' : '#444') + ';font-weight:bold;',
        ammoObj.name));

      // Effective stats comparison
      card.appendChild(_el('hr', 'border:none;border-top:1px solid rgba(255,255,255,0.06);margin:8px 0;'));

      var statsLabel = _html('div',
        HEADER_FONT + 'font-size:14px;color:' + GOLD + ';margin-bottom:6px;', '📊 EFFECTIVE STATS');
      card.appendChild(statsLabel);

      var statsRow = _el('div', 'display:flex;gap:10px;flex-wrap:wrap;');
      card.appendChild(statsRow);

      var dmgChanged = effective.damage !== w.damage;
      var cdChanged  = effective.cooldown !== w.cooldown;
      var rngChanged = effective.range !== w.range;

      _appendEffStat(statsRow, '⚔️ DMG',  effective.damage,       w.damage,   dmgChanged);
      _appendEffStat(statsRow, '⏱️ CD',   effective.cooldown + 'ms', w.cooldown + 'ms', cdChanged);
      _appendEffStat(statsRow, '🎯 RNG',  effective.range,        w.range,    rngChanged);
    });
  }

  /* ================================================================
   *  TAB 4 – ADVANCED WEAPON SPIN WHEEL
   * ================================================================ */

  /* ── Wheel Prize Pool Definitions ─────────────────────────────── */

  var WHEEL_PRIZE_POOL = {
    // Tier 1 - Basic Rewards (Gold cost: 50)
    basic: [
      { id: 'gold50', label: 'Gold x50', icon: '💰', type: 'gold', value: 50, rarity: 'common', weight: 25 },
      { id: 'gold100', label: 'Gold x100', icon: '💰', type: 'gold', value: 100, rarity: 'common', weight: 20 },
      { id: 'modUpgrade1', label: 'Weapon Mod +1', icon: '⚡', type: 'modUpgrade', value: 1, rarity: 'rare', weight: 15 },
      { id: 'gold200', label: 'Gold x200', icon: '💰', type: 'gold', value: 200, rarity: 'rare', weight: 12 },
      { id: 'essence10', label: 'Essence x10', icon: '✨', type: 'essence', value: 10, rarity: 'rare', weight: 10 },
      { id: 'fireMode', label: 'Fire Mode Unlock', icon: '🔸', type: 'fireModeUnlock', rarity: 'epic', weight: 8 },
      { id: 'ammoType', label: 'Ammo Type Unlock', icon: '🔥', type: 'ammoUnlock', rarity: 'epic', weight: 6 },
      { id: 'jackpot', label: 'JACKPOT!', icon: '💎', type: 'gold', value: 500, rarity: 'legendary', weight: 4 },
    ],

    // Tier 2 - Premium Rewards (Gold cost: 200)
    premium: [
      { id: 'gold200', label: 'Gold x200', icon: '💰', type: 'gold', value: 200, rarity: 'common', weight: 20 },
      { id: 'modUpgrade2', label: 'Weapon Mod +2', icon: '⚡', type: 'modUpgrade', value: 2, rarity: 'rare', weight: 18 },
      { id: 'gold400', label: 'Gold x400', icon: '💰', type: 'gold', value: 400, rarity: 'rare', weight: 15 },
      { id: 'essence25', label: 'Essence x25', icon: '✨', type: 'essence', value: 25, rarity: 'rare', weight: 14 },
      { id: 'modUpgrade3', label: 'Weapon Mod +3', icon: '⚡', type: 'modUpgrade', value: 3, rarity: 'epic', weight: 12 },
      { id: 'fireMode', label: 'Fire Mode Unlock', icon: '🔸', type: 'fireModeUnlock', rarity: 'epic', weight: 10 },
      { id: 'ammoType', label: 'Ammo Type Unlock', icon: '🔥', type: 'ammoUnlock', rarity: 'epic', weight: 7 },
      { id: 'weaponUnlock', label: 'Weapon Unlock', icon: '🎁', type: 'weaponUnlock', rarity: 'legendary', weight: 4 },
    ],

    // Tier 3 - Elite Rewards (Essence cost: 100)
    elite: [
      { id: 'modUpgrade3', label: 'Weapon Mod +3', icon: '⚡', type: 'modUpgrade', value: 3, rarity: 'rare', weight: 20 },
      { id: 'essence50', label: 'Essence x50', icon: '✨', type: 'essence', value: 50, rarity: 'rare', weight: 18 },
      { id: 'gold500', label: 'Gold x500', icon: '💰', type: 'gold', value: 500, rarity: 'rare', weight: 15 },
      { id: 'modUpgrade5', label: 'Weapon Mod +5', icon: '⚡', type: 'modUpgrade', value: 5, rarity: 'epic', weight: 14 },
      { id: 'fireMode', label: 'Fire Mode Unlock', icon: '🔸', type: 'fireModeUnlock', rarity: 'epic', weight: 12 },
      { id: 'ammoType', label: 'Ammo Type Unlock', icon: '🔥', type: 'ammoUnlock', rarity: 'epic', weight: 10 },
      { id: 'weaponUnlock', label: 'Weapon Unlock', icon: '🎁', type: 'weaponUnlock', rarity: 'legendary', weight: 8 },
      { id: 'megaJackpot', label: 'MEGA JACKPOT!', icon: '💎', type: 'gold', value: 1000, rarity: 'mythic', weight: 3 },
    ],

    // Starting Weapon Wheel — prize list derived from the canonical STARTING_WEAPON_POOL
    // so weaponIds are always the actual sandbox weapon keys.
    startingWeapon: STARTING_WEAPON_POOL.map(function(w) {
      return { id: 'sw_' + w.weaponId, label: w.label, icon: w.icon,
               type: 'startWeapon', weaponId: w.weaponId, rarity: w.rarity, weight: 5 };
    }).concat([
      { id: 'sw_jackpot',     label: 'ALL WEAPONS!', icon: '🏆', type: 'startWeaponJackpot', rarity: 'mythic',  weight: 1 },
      { id: 'sw_consolation', label: '500 Gold',     icon: '💰', type: 'gold', value: 500,    rarity: 'common',  weight: 15 },
    ]),
  };

  var WHEEL_TIERS = {
    basic: { name: 'Basic Wheel', cost: 50, costType: 'gold', color: '#4FC3F7', icon: '🎰' },
    premium: { name: 'Premium Wheel', cost: 200, costType: 'gold', color: '#AA44FF', icon: '🎡' },
    elite: { name: 'Elite Wheel', cost: 100, costType: 'essence', color: '#F39C12', icon: '⭐' },
    startingWeapon: { name: 'Weapon Wheel', cost: 300, costType: 'gold', color: '#FF6B35', icon: '⚔️' },
  };

  function buildSpinWheel(panel) {
    panel.innerHTML = '';
    _ensureUpgradeData();

    // Initialize spin data if not exists
    if (!saveData.weaponSpinWheel) {
      saveData.weaponSpinWheel = {
        totalSpins: 0,
        history: [],
        currentTier: 'basic',
      };
    }

    // Header
    var header = _html('div',
      HEADER_FONT + 'font-size:24px;color:' + GOLD + ';text-align:center;margin:12px 0 8px;text-shadow:0 0 12px rgba(255,215,0,0.6);',
      '🎰 WEAPON SPIN WHEEL');
    panel.appendChild(header);

    var subtitle = _el('div',
      'font-size:13px;color:#aaa;text-align:center;margin-bottom:20px;',
      'Spin for weapons, upgrades, and rare rewards!');
    panel.appendChild(subtitle);

    // Tier selector buttons
    var tierBar = _el('div',
      'display:flex;gap:8px;justify-content:center;margin-bottom:20px;flex-wrap:wrap;');
    panel.appendChild(tierBar);

    var currentTier = saveData.weaponSpinWheel.currentTier || 'basic';

    Object.keys(WHEEL_TIERS).forEach(function (tierId) {
      var tier = WHEEL_TIERS[tierId];
      var isActive = currentTier === tierId;
      var canAfford = (tier.costType === 'gold' && (saveData.gold || 0) >= tier.cost) ||
                      (tier.costType === 'essence' && (saveData.essence || 0) >= tier.cost);

      var btn = _el('div',
        'padding:10px 16px;border-radius:10px;cursor:pointer;transition:all 0.2s;' +
        'border:2px solid ' + (isActive ? tier.color : '#444') + ';' +
        'background:' + (isActive ? tier.color + '22' : 'rgba(0,0,0,0.3)') + ';' +
        'font-weight:bold;font-size:13px;text-align:center;min-width:110px;' +
        (canAfford ? '' : 'opacity:0.5;'));

      btn.innerHTML = tier.icon + ' ' + tier.name + '<br>' +
        '<span style="font-size:11px;color:#888;">' +
        (tier.costType === 'gold' ? '💰' : '✨') + ' ' + tier.cost + '</span>';

      btn.addEventListener('click', function () {
        if (!canAfford) {
          if (typeof playSound === 'function') playSound('invalid');
          if (typeof showStatChange === 'function') {
            showStatChange('Not enough ' + (tier.costType === 'gold' ? 'gold' : 'essence') + '!', 'normal');
          }
          return;
        }
        saveData.weaponSpinWheel.currentTier = tierId;
        buildSpinWheel(panel);
      });

      tierBar.appendChild(btn);
    });

    // Get current tier prizes
    var prizes = WHEEL_PRIZE_POOL[currentTier] || WHEEL_PRIZE_POOL.basic;
    var tierInfo = WHEEL_TIERS[currentTier];

    // Wheel container
    var wheelWrapper = _el('div',
      'position:relative;width:380px;height:380px;margin:0 auto 20px;');
    panel.appendChild(wheelWrapper);

    // Build wheel with segments
    var wheelContainer = _el('div',
      'position:absolute;top:0;left:0;width:380px;height:380px;border-radius:50%;' +
      'background:conic-gradient(from 0deg,' + _buildPrizeWheelGradient(prizes) + ');' +
      'border:5px solid ' + tierInfo.color + ';' +
      'box-shadow:0 0 40px ' + tierInfo.color + '88,inset 0 0 30px rgba(0,0,0,0.5);' +
      'transition:transform 3.5s cubic-bezier(0.17,0.67,0.12,0.99);');
    wheelWrapper.appendChild(wheelContainer);

    // Add prize labels on wheel
    var segCount = prizes.length;
    var segDeg = 360 / segCount;
    var wheelRadius = 190;
    var labelRadius = Math.round(wheelRadius * 0.7);

    prizes.forEach(function (prize, i) {
      var midAngleDeg = segDeg * i + segDeg / 2;
      var midAngleRad = (midAngleDeg - 90) * Math.PI / 180;
      var lx = wheelRadius + labelRadius * Math.cos(midAngleRad);
      var ly = wheelRadius + labelRadius * Math.sin(midAngleRad);

      var lbl = _el('div',
        'position:absolute;left:' + lx + 'px;top:' + ly + 'px;' +
        'transform:translate(-50%,-50%) rotate(' + midAngleDeg + 'deg);' +
        'text-align:center;pointer-events:none;line-height:1.2;white-space:nowrap;');

      var iconDiv = _el('div', 'font-size:26px;text-shadow:0 0 6px #000;', prize.icon || '🎁');
      var nameDiv = _el('div',
        'font-size:9px;font-weight:900;color:#fff;' +
        'text-shadow:0 0 4px #000,0 0 4px #000;max-width:80px;white-space:normal;',
        prize.label);

      lbl.appendChild(iconDiv);
      lbl.appendChild(nameDiv);
      wheelContainer.appendChild(lbl);
    });

    // Center button
    var centerBtn = _el('div',
      'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'width:90px;height:90px;border-radius:50%;' +
      'background:radial-gradient(circle,#1a1a2e 0%,#000 100%);' +
      'border:4px solid ' + tierInfo.color + ';' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-size:42px;cursor:pointer;transition:all 0.3s;z-index:2;' +
      'box-shadow:0 0 20px ' + tierInfo.color + '66,inset 0 0 20px rgba(0,0,0,0.8);',
      '🎯');

    centerBtn.addEventListener('mouseenter', function () {
      centerBtn.style.transform = 'translate(-50%,-50%) scale(1.1)';
    });
    centerBtn.addEventListener('mouseleave', function () {
      centerBtn.style.transform = 'translate(-50%,-50%) scale(1)';
    });

    wheelContainer.appendChild(centerBtn);

    // Pointer
    var pointer = _el('div',
      'position:absolute;top:-22px;left:50%;transform:translateX(-50%);' +
      'font-size:36px;z-index:3;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.8));' +
      'animation:pointerBounce 2s ease-in-out infinite;', '▼');
    pointer.style.color = tierInfo.color;
    wheelWrapper.appendChild(pointer);

    // Add pointer bounce animation
    if (!document.getElementById('wheel-pointer-bounce')) {
      var style = document.createElement('style');
      style.id = 'wheel-pointer-bounce';
      style.textContent = `
        @keyframes pointerBounce {
          0%, 100% { transform: translateX(-50%) translateY(0px); }
          50% { transform: translateX(-50%) translateY(-8px); }
        }
        @keyframes prizePulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.9; }
        }
        @keyframes prizeGlow {
          0%, 100% { box-shadow: 0 0 20px currentColor; }
          50% { box-shadow: 0 0 40px currentColor, 0 0 60px currentColor; }
        }
      `;
      document.head.appendChild(style);
    }

    // Spin state
    var spinning = false;

    // Spin button
    var canAffordSpin = (tierInfo.costType === 'gold' && (saveData.gold || 0) >= tierInfo.cost) ||
                         (tierInfo.costType === 'essence' && (saveData.essence || 0) >= tierInfo.cost);

    var spinBtn = _el('div',
      'text-align:center;padding:14px 28px;border-radius:12px;cursor:pointer;' +
      'background:linear-gradient(135deg,' + tierInfo.color + ',#FFA000);' +
      'color:#000;font-weight:bold;' + HEADER_FONT + 'font-size:20px;' +
      'letter-spacing:1.5px;margin:0 auto;max-width:250px;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.4);transition:all 0.2s;' +
      (canAffordSpin ? '' : 'opacity:0.5;cursor:not-allowed;'),
      '🎰 SPIN! (' + (tierInfo.costType === 'gold' ? '💰' : '✨') + tierInfo.cost + ')');

    if (canAffordSpin) {
      spinBtn.addEventListener('mouseenter', function () {
        spinBtn.style.transform = 'scale(1.05)';
        spinBtn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.5)';
      });
      spinBtn.addEventListener('mouseleave', function () {
        spinBtn.style.transform = 'scale(1)';
        spinBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
      });
    }

    panel.appendChild(spinBtn);

    // Result display
    var resultEl = _el('div',
      'text-align:center;font-size:16px;color:#fff;margin-top:20px;min-height:30px;');
    panel.appendChild(resultEl);

    // Stats display
    var statsEl = _el('div',
      'text-align:center;font-size:12px;color:#888;margin-top:12px;',
      'Total Spins: ' + (saveData.weaponSpinWheel.totalSpins || 0));
    panel.appendChild(statsEl);

    // Spin logic
    centerBtn.addEventListener('click', performSpin);
    spinBtn.addEventListener('click', performSpin);

    function performSpin() {
      if (spinning || !canAffordSpin) {
        if (!canAffordSpin && typeof playSound === 'function') playSound('invalid');
        return;
      }

      // Deduct cost
      if (tierInfo.costType === 'gold') {
        saveData.gold = (saveData.gold || 0) - tierInfo.cost;
      } else {
        saveData.essence = (saveData.essence || 0) - tierInfo.cost;
      }

      // Track achievement stat
      if (!saveData.stats) {
        saveData.stats = { itemsCrafted: 0, weaponsUpgraded: 0, statCardsUsed: 0, spinWheelSpins: 0, companionsLeveled: 0, buildingsUpgraded: 0, questsCompleted: 0, skillsUnlocked: 0, gearsEquipped: 0 };
      }
      saveData.stats.spinWheelSpins = (saveData.stats.spinWheelSpins || 0) + 1;

      spinning = true;
      spinBtn.style.opacity = '0.5';
      spinBtn.style.pointerEvents = 'none';
      centerBtn.style.pointerEvents = 'none';
      resultEl.textContent = '';
      resultEl.style.animation = '';

      if (typeof playSound === 'function') playSound('collect');
      if (typeof refreshGold === 'function') refreshGold();

      // Weighted random selection
      var wonPrize = _weightedPickPrize(prizes);

      // Calculate spin amount to land on prize.
      // The pointer sits at the top (0°). A conic-gradient starts at 0° (top) and
      // grows clockwise, so segment i occupies [segDeg*i, segDeg*(i+1)].
      // After rotating the wheel clockwise by totalDeg, the pointer aligns with
      // whatever was originally at position (360 - totalDeg % 360) % 360.
      // We want it at the mid-point of the winning segment:
      //   prizeAngle = segDeg * prizeIndex + segDeg / 2
      // So we need: totalDeg ≡ -prizeAngle (mod 360) → rotate enough to bring it to 0°
      var prizeIndex = prizes.indexOf(wonPrize);
      var prizeAngle = (segDeg * prizeIndex) + (segDeg / 2);
      var targetAngle = (360 - (prizeAngle % 360)) % 360;
      var totalDeg = 360 * 6 + targetAngle + (Math.random() * segDeg * 0.3 - segDeg * 0.15);

      wheelContainer.style.transform = 'rotate(' + totalDeg + 'deg)';

      setTimeout(function () {
        spinning = false;
        spinBtn.style.opacity = canAffordSpin ? '1' : '0.5';
        spinBtn.style.pointerEvents = canAffordSpin ? 'auto' : 'none';
        centerBtn.style.pointerEvents = 'auto';

        // Update stats
        saveData.weaponSpinWheel.totalSpins = (saveData.weaponSpinWheel.totalSpins || 0) + 1;
        saveData.weaponSpinWheel.history = saveData.weaponSpinWheel.history || [];
        saveData.weaponSpinWheel.history.push({ prize: wonPrize.id, time: Date.now() });
        if (saveData.weaponSpinWheel.history.length > 50) {
          saveData.weaponSpinWheel.history = saveData.weaponSpinWheel.history.slice(-50);
        }

        // Award prize
        _awardSpinPrize(wonPrize);

        // Show result
        if (typeof playSound === 'function') playSound('levelup');

        var rarityCol = RARITY_COLORS[wonPrize.rarity] || '#aaa';
        resultEl.style.cssText =
          'text-align:center;font-size:18px;margin-top:20px;min-height:30px;' +
          'padding:16px;border-radius:14px;' +
          'border:3px solid ' + rarityCol + ';' +
          'background:radial-gradient(circle,' + rarityCol + '22 0%,transparent 70%);' +
          'animation:prizePulse 1s ease-in-out;' +
          'box-shadow:0 0 30px ' + rarityCol + '88;';

        var iconSpan = _el('div', 'font-size:48px;margin-bottom:8px;animation:prizePulse 0.8s ease-in-out;', wonPrize.icon);
        var nameSpan = _el('div',
          'color:' + rarityCol + ';' + HEADER_FONT + 'font-size:24px;margin-bottom:6px;text-shadow:0 0 10px ' + rarityCol + ';',
          wonPrize.label);
        var raritySpan = _el('div',
          'font-size:11px;color:#aaa;text-transform:uppercase;letter-spacing:1px;',
          wonPrize.rarity + ' PRIZE');

        resultEl.appendChild(iconSpan);
        resultEl.appendChild(nameSpan);
        resultEl.appendChild(raritySpan);

        statsEl.textContent = 'Total Spins: ' + saveData.weaponSpinWheel.totalSpins;

        if (typeof saveSaveData === 'function') saveSaveData();

        // Refresh to update costs
        canAffordSpin = (tierInfo.costType === 'gold' && (saveData.gold || 0) >= tierInfo.cost) ||
                         (tierInfo.costType === 'essence' && (saveData.essence || 0) >= tierInfo.cost);
        spinBtn.style.opacity = canAffordSpin ? '1' : '0.5';
        spinBtn.style.cursor = canAffordSpin ? 'pointer' : 'not-allowed';
      }, 3800);
    }
  }

  /* ── Helper functions for spin wheel ───────────────────────────── */

  function _buildPrizeWheelGradient(prizes) {
    var colors = [];
    var segPercent = 100 / prizes.length;

    prizes.forEach(function (prize, i) {
      var col = RARITY_COLORS[prize.rarity] || '#555';
      var start = segPercent * i;
      var end = segPercent * (i + 1);
      colors.push(col + ' ' + start + '%');
      colors.push(col + ' ' + end + '%');
    });

    return colors.join(',');
  }

  function _weightedPickPrize(prizes) {
    var totalWeight = prizes.reduce(function (sum, p) { return sum + p.weight; }, 0);
    var rand = Math.random() * totalWeight;
    var cumulative = 0;

    for (var i = 0; i < prizes.length; i++) {
      cumulative += prizes[i].weight;
      if (rand < cumulative) return prizes[i];
    }

    return prizes[prizes.length - 1];
  }

  function _awardSpinPrize(prize) {
    switch (prize.type) {
      case 'gold':
        saveData.gold = (saveData.gold || 0) + prize.value;
        if (typeof refreshGold === 'function') refreshGold();
        if (typeof showStatChange === 'function') {
          showStatChange('💰 +' + prize.value + ' Gold!', 'stat');
        }
        break;

      case 'essence':
        saveData.essence = (saveData.essence || 0) + prize.value;
        if (typeof showStatChange === 'function') {
          showStatChange('✨ +' + prize.value + ' Essence!', 'stat');
        }
        break;

      case 'modUpgrade':
        // Award random weapon mod upgrade
        var ownedWeapons = _getAllWeapons().filter(function (w) { return _isOwned(w.id); });
        if (ownedWeapons.length > 0) {
          var randomWeapon = ownedWeapons[Math.floor(Math.random() * ownedWeapons.length)];
          var mods = getWeaponMods(randomWeapon.id);
          var modTypes = ['speed', 'power', 'cooldown', 'sight'];
          var availableMods = modTypes.filter(function (m) {
            return (mods[m] || 0) < WEAPON_MOD_DEFS[m].maxLevel;
          });

          if (availableMods.length > 0) {
            var randomMod = availableMods[Math.floor(Math.random() * availableMods.length)];
            mods[randomMod] = Math.min(
              (mods[randomMod] || 0) + prize.value,
              WEAPON_MOD_DEFS[randomMod].maxLevel
            );
            saveData.weaponUpgrades[randomWeapon.id] = mods;
            if (typeof showStatChange === 'function') {
              showStatChange('⚡ ' + randomWeapon.name + ' ' + WEAPON_MOD_DEFS[randomMod].name + ' +' + prize.value + '!', 'stat');
            }
          }
        }
        break;

      case 'fireModeUnlock':
        // Unlock random fire mode for owned weapons
        var ownedWeapons = _getAllWeapons().filter(function (w) { return _isOwned(w.id); });
        if (ownedWeapons.length > 0) {
          var randomWeapon = ownedWeapons[Math.floor(Math.random() * ownedWeapons.length)];
          var mods = getWeaponMods(randomWeapon.id);
          mods.unlockedFireModes = mods.unlockedFireModes || ['single'];

          var availableModes = FIRE_MODE_ORDER.filter(function (m) {
            return mods.unlockedFireModes.indexOf(m) === -1;
          });

          if (availableModes.length > 0) {
            var newMode = availableModes[0]; // Unlock in order
            mods.unlockedFireModes.push(newMode);
            if (typeof showStatChange === 'function') {
              showStatChange('🔸 ' + randomWeapon.name + ' ' + WEAPON_FIRE_MODES[newMode].name + ' Mode Unlocked!', 'stat');
            }
          }
        }
        break;

      case 'ammoUnlock':
        // Unlock random ammo type for owned weapons
        var ownedWeapons = _getAllWeapons().filter(function (w) { return _isOwned(w.id); });
        if (ownedWeapons.length > 0) {
          var randomWeapon = ownedWeapons[Math.floor(Math.random() * ownedWeapons.length)];
          var mods = getWeaponMods(randomWeapon.id);
          mods.unlockedAmmo = mods.unlockedAmmo || ['standard'];

          var availableAmmo = Object.keys(WEAPON_AMMO_TYPES).filter(function (a) {
            return mods.unlockedAmmo.indexOf(a) === -1;
          });

          if (availableAmmo.length > 0) {
            var newAmmo = availableAmmo[Math.floor(Math.random() * availableAmmo.length)];
            mods.unlockedAmmo.push(newAmmo);
            if (typeof showStatChange === 'function') {
              showStatChange('🔥 ' + randomWeapon.name + ' ' + WEAPON_AMMO_TYPES[newAmmo].name + ' Unlocked!', 'stat');
            }
          }
        }
        break;

      case 'weaponUnlock':
        // Unlock random locked weapon
        var allWeapons = _getAllWeapons();
        var lockedWeapons = allWeapons.filter(function (w) { return !_isOwned(w.id); });

        if (lockedWeapons.length > 0) {
          // Prefer lower rarity weapons for basic unlocks
          var commonLocked = lockedWeapons.filter(function (w) { return w.rarity === 'common' || w.rarity === 'rare'; });
          var toUnlock = commonLocked.length > 0 ? commonLocked : lockedWeapons;
          var randomWeapon = toUnlock[Math.floor(Math.random() * toUnlock.length)];

          // Check if GameWeapons exists to properly unlock
          if (typeof window.GameWeapons !== 'undefined' && window.GameWeapons.weapons) {
            if (window.GameWeapons.weapons[randomWeapon.id]) {
              window.GameWeapons.weapons[randomWeapon.id].active = true;
            }
          }

          if (typeof showStatChange === 'function') {
            showStatChange('🎁 ' + randomWeapon.icon + ' ' + randomWeapon.name + ' Unlocked!', 'legendary');
          }
        } else {
          // All weapons unlocked, award gold instead
          saveData.gold = (saveData.gold || 0) + 300;
          if (typeof showStatChange === 'function') {
            showStatChange('💰 +300 Gold (All weapons unlocked!)', 'stat');
          }
        }
        break;

      case 'startWeapon':
        saveData.unlockedStartWeapons = saveData.unlockedStartWeapons || [];
        if (saveData.unlockedStartWeapons.indexOf(prize.weaponId) === -1) {
          saveData.unlockedStartWeapons.push(prize.weaponId);
        }
        if (typeof showStatChange === 'function') {
          showStatChange('⚔️ Starting Weapon Unlocked: ' + prize.label + '!', 'legendary');
        }
        break;

      case 'startWeaponJackpot':
        // Derive jackpot list from the canonical pool to stay in sync
        var _allStartWeapons = STARTING_WEAPON_POOL.map(function(w) { return w.weaponId; });
        saveData.unlockedStartWeapons = saveData.unlockedStartWeapons || [];
        _allStartWeapons.forEach(function(wid) {
          if (saveData.unlockedStartWeapons.indexOf(wid) === -1) saveData.unlockedStartWeapons.push(wid);
        });
        if (typeof showStatChange === 'function') {
          showStatChange('🏆 JACKPOT! All Starting Weapons Unlocked!', 'mythic');
        }
        break;
    }
  }


  /* ── Small helpers used by tab builders ──────────────────────── */

  function _appendStat(container, icon, value, color) {
    var s = _html('span', 'font-size:12px;color:' + (color || '#ccc') + ';',
      icon + '<b>' + value + '</b>');
    container.appendChild(s);
  }

  function _appendStatBlock(grid, label, value, base, color) {
    var block = _el('div',
      'padding:6px 8px;border-radius:6px;background:rgba(255,255,255,0.04);');
    grid.appendChild(block);

    block.appendChild(_el('div', 'font-size:10px;color:#888;', label));
    block.appendChild(_html('div', 'font-size:15px;color:' + (color || '#fff') + ';font-weight:bold;',
      '' + value));
    if (base && ('' + base) !== ('' + value)) {
      block.appendChild(_html('div', 'font-size:10px;color:#666;', 'Base: ' + base));
    }
  }

  function _appendEffStat(container, label, effective, base, changed) {
    var col = changed ? GREEN : '#aaa';
    var chip = _html('div',
      'font-size:12px;padding:4px 8px;border-radius:6px;' +
      'background:rgba(255,255,255,0.04);color:' + col + ';',
      label + ' <b>' + effective + '</b>' +
      (changed ? ' <span style="font-size:10px;color:#666;">(base ' + base + ')</span>' : ''));
    container.appendChild(chip);
  }

  function _buildModIconsString(mods) {
    var parts = [];
    Object.keys(WEAPON_MOD_DEFS).forEach(function (k) {
      if (mods[k] > 0) parts.push(WEAPON_MOD_DEFS[k].icon + mods[k]);
    });
    if (mods.fireMode && mods.fireMode !== 'single')
      parts.push(WEAPON_FIRE_MODES[mods.fireMode].icon);
    if (mods.ammoType && mods.ammoType !== 'standard')
      parts.push(WEAPON_AMMO_TYPES[mods.ammoType].icon);
    return parts.join(' ');
  }

  function _buildWheelGradient(weapons) {
    if (!weapons.length) return '#333 0deg 360deg';
    var segDeg = 360 / weapons.length;
    var parts = [];
    var colors = ['#2a2a4a', '#1a1a3a', '#2a3a4a', '#3a2a3a', '#2a4a3a', '#3a3a2a', '#2a2a3a', '#3a2a4a'];
    weapons.forEach(function (w, i) {
      var c = colors[i % colors.length];
      var start = Math.round(segDeg * i);
      var end = Math.round(segDeg * (i + 1));
      parts.push(c + ' ' + start + 'deg ' + end + 'deg');
    });
    return parts.join(',');
  }

  /* ── Init default tab ────────────────────────────────────────── */
  switchTab('arsenal');
}

/* ── Global alias (replaces showWeaponsmith) ────────────────────── */

window.showWeaponBuilding = showWeaponBuilding;
window.showWeaponsmith = showWeaponBuilding;

/* ── Export ──────────────────────────────────────────────────────── */

window.WeaponBuilding = {
  showWeaponBuilding: showWeaponBuilding,
  WEAPON_MOD_DEFS:    WEAPON_MOD_DEFS,
  WEAPON_AMMO_TYPES:  WEAPON_AMMO_TYPES,
  WEAPON_FIRE_MODES:  WEAPON_FIRE_MODES,
  getWeaponMods:      getWeaponMods,
};
