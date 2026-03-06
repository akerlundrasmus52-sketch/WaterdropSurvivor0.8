// idle-lucky-wheel.js — Spin-the-wheel gacha mini-game with 4 tiers
window.GameLuckyWheel = (function () {
  // === TIER 1: Basic Wheel (free daily / 50 essence) ===
  var WHEEL_SEGMENTS = [
    { id: 'gold_50',    label: '🥉 50 Gold',        type: 'gold',    value: 50,  rarity: 'common',   weight: 25 },
    { id: 'gold_200',   label: '🥈 200 Gold',       type: 'gold',    value: 200, rarity: 'uncommon', weight: 15 },
    { id: 'gold_500',   label: '🥇 500 Gold',       type: 'gold',    value: 500, rarity: 'rare',     weight: 8  },
    { id: 'gem_t1',     label: '💎 Random T1 Gem',  type: 'gem',     value: 1,   rarity: 'uncommon', weight: 15 },
    { id: 'gem_t2',     label: '💎 Random T2 Gem',  type: 'gem',     value: 2,   rarity: 'rare',     weight: 8  },
    { id: 'essence_100',label: '✨ 100 Essence',    type: 'essence', value: 100, rarity: 'uncommon', weight: 12 },
    { id: 'mystery_box',label: '📦 Mystery Box',    type: 'mystery', value: 0,   rarity: 'rare',     weight: 10 },
    { id: 'xp_500',     label: '🌟 500 XP Bonus',   type: 'xp',     value: 500, rarity: 'uncommon', weight: 7  }
  ];

  // === TIER 2: Gold Wheel (costs 500 gold) — Temporary buffs, food, consumables ===
  var WHEEL_SEGMENTS_GOLD = [
    { id: 'food_heal',    label: '🍖 Healing Feast',     type: 'food',   value: 50,   rarity: 'common',   weight: 20 },
    { id: 'food_speed',   label: '🍎 Speed Apple',       type: 'food',   value: 0,    rarity: 'uncommon', weight: 15, buff: 'speed' },
    { id: 'food_power',   label: '🥩 Power Steak',       type: 'food',   value: 0,    rarity: 'uncommon', weight: 15, buff: 'damage' },
    { id: 'gold_1000',    label: '💰 1000 Gold',         type: 'gold',   value: 1000, rarity: 'rare',     weight: 10 },
    { id: 'essence_250',  label: '✨ 250 Essence',       type: 'essence',value: 250,  rarity: 'uncommon', weight: 12 },
    { id: 'food_armor',   label: '🧀 Iron Cheese',       type: 'food',   value: 0,    rarity: 'uncommon', weight: 13, buff: 'armor' },
    { id: 'food_luck',    label: '🍀 Lucky Clover',      type: 'food',   value: 0,    rarity: 'rare',     weight: 8,  buff: 'luck' },
    { id: 'food_regen',   label: '🍯 Healing Honey',     type: 'food',   value: 0,    rarity: 'rare',     weight: 7,  buff: 'regen' }
  ];

  // === TIER 3: Equipment Wheel (costs 200 essence) — Gear, rare equipment, special items ===
  var WHEEL_SEGMENTS_EQUIP = [
    { id: 'ring_common',  label: '💍 Common Ring',       type: 'equip', value: 0, rarity: 'common',    weight: 22, equipRarity: 'common' },
    { id: 'ring_uncommon',label: '💍 Uncommon Ring',     type: 'equip', value: 0, rarity: 'uncommon',  weight: 18, equipRarity: 'uncommon' },
    { id: 'ring_rare',    label: '💍 Rare Ring',         type: 'equip', value: 0, rarity: 'rare',      weight: 12, equipRarity: 'rare' },
    { id: 'ring_epic',    label: '💍 Epic Ring',         type: 'equip', value: 0, rarity: 'epic',      weight: 6,  equipRarity: 'epic' },
    { id: 'ring_legend',  label: '👑 Legendary Ring',    type: 'equip', value: 0, rarity: 'legendary', weight: 2,  equipRarity: 'legendary' },
    { id: 'gem_t3',       label: '💎 T3 Gem',           type: 'gem',   value: 3, rarity: 'epic',      weight: 8 },
    { id: 'gold_2000',    label: '💰 2000 Gold',        type: 'gold',  value: 2000, rarity: 'rare',   weight: 15 },
    { id: 'essence_500',  label: '✨ 500 Essence',      type: 'essence',value: 500, rarity: 'rare',    weight: 17 }
  ];

  // === TIER 4: Mythic Wheel (costs 500 essence) — Mythic & Legendary rewards, earned through account progress ===
  var WHEEL_SEGMENTS_MYTHIC = [
    { id: 'ring_mythic',       label: '👑 Mythic Ring',          type: 'equip',   value: 0,    rarity: 'mythic',    weight: 5,  equipRarity: 'mythic' },
    { id: 'ring_legend2',      label: '👑 Legendary Ring',       type: 'equip',   value: 0,    rarity: 'legendary', weight: 10, equipRarity: 'legendary' },
    { id: 'weapon_chest',      label: '🗡️ Weapon Chest',        type: 'chest',   value: 0,    rarity: 'legendary', weight: 8 },
    { id: 'gold_5000',         label: '💰 5000 Gold',            type: 'gold',    value: 5000, rarity: 'epic',      weight: 12 },
    { id: 'essence_1000',      label: '✨ 1000 Essence',         type: 'essence', value: 1000, rarity: 'epic',      weight: 12 },
    { id: 'gem_t4',            label: '💎 T4 Gem',              type: 'gem',     value: 4,    rarity: 'legendary', weight: 6 },
    { id: 'companion_egg',     label: '🥚 Companion Egg',       type: 'companion', value: 0,  rarity: 'mythic',    weight: 3 },
    { id: 'xp_5000',           label: '🌟 5000 XP Bonus',       type: 'xp',      value: 5000, rarity: 'epic',     weight: 10 },
    { id: 'mythic_material',   label: '🔮 Mythic Material',     type: 'material', value: 0,   rarity: 'mythic',    weight: 4 },
    { id: 'legendary_weapon',  label: '⚔️ Legendary Weapon Shard', type: 'shard', value: 0,  rarity: 'legendary', weight: 6 }
  ];

  var WHEEL_TIERS = {
    basic:  { name: 'Basic Wheel',     icon: '🎡', segments: WHEEL_SEGMENTS,        costType: 'essence', cost: 50,   color: '#3498db' },
    gold:   { name: 'Gold Wheel',      icon: '🪙', segments: WHEEL_SEGMENTS_GOLD,   costType: 'gold',    cost: 500,  color: '#FFD700' },
    equip:  { name: 'Equipment Wheel', icon: '⚔️', segments: WHEEL_SEGMENTS_EQUIP,  costType: 'essence', cost: 200,  color: '#e91e63' },
    mythic: { name: 'Mythic Wheel',    icon: '👑', segments: WHEEL_SEGMENTS_MYTHIC, costType: 'essence', cost: 500,  color: '#9B59B6', minAccountLevel: 20 }
  };

  var SPIN_COST = 50; // essence (basic wheel)

  function _pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function getWheelDefaults() {
    return { lastFreeSpin: 0, totalSpins: 0, history: [] };
  }

  function canFreeSpin(saveData) {
    if (!saveData.wheel) return true;
    var last = saveData.wheel.lastFreeSpin || 0;
    var lastDate = new Date(last);
    var now = new Date();
    return lastDate.getFullYear() !== now.getFullYear() ||
           lastDate.getMonth() !== now.getMonth() ||
           lastDate.getDate() !== now.getDate();
  }

  function _weightedPick(segments) {
    segments = segments || WHEEL_SEGMENTS;
    var total = segments.reduce(function (s, x) { return s + x.weight; }, 0);
    var r = Math.random() * total;
    var cum = 0;
    for (var i = 0; i < segments.length; i++) {
      cum += segments[i].weight;
      if (r < cum) return segments[i];
    }
    return segments[segments.length - 1];
  }

  function _applyPrize(segment, saveData) {
    var desc = '';
    if (segment.type === 'gold') {
      saveData.gold = (saveData.gold || 0) + segment.value;
      desc = '+' + segment.value + ' Gold!';
    } else if (segment.type === 'gem') {
      if (window.GameGems) {
        var gem = window.GameGems.addRandomGem(saveData, segment.value);
        desc = 'Got ' + gem.name + '!';
      } else {
        desc = 'Gem (T' + segment.value + ')';
      }
    } else if (segment.type === 'essence') {
      saveData.essence = (saveData.essence || 0) + segment.value;
      desc = '+' + segment.value + ' Essence!';
    } else if (segment.type === 'xp') {
      if (window.GameAccount) {
        window.GameAccount.addXP(segment.value, 'Lucky Wheel spin', saveData);
      }
      desc = '+' + segment.value + ' XP!';
    } else if (segment.type === 'mystery') {
      var prizes = [
        function () { saveData.gold = (saveData.gold || 0) + 1000; return '+1000 Gold!'; },
        function () {
          if (window.GameGems) { var g = window.GameGems.addRandomGem(saveData, 3); return 'Got ' + g.name + '!'; }
          return 'Mystery item!';
        },
        function () { saveData.essence = (saveData.essence || 0) + 300; return '+300 Essence!'; }
      ];
      desc = 'Mystery Box: ' + prizes[Math.floor(Math.random() * prizes.length)]();
    } else if (segment.type === 'food') {
      // Temporary buff consumables from Gold Wheel
      var buffName = segment.buff || 'heal';
      if (!saveData.consumables) saveData.consumables = [];
      if (buffName === 'heal') {
        desc = 'Healing Feast (+50 HP next run)!';
      } else {
        desc = segment.label + ' buff for next run!';
      }
      saveData.consumables.push({ id: segment.id, name: segment.label, buff: buffName, value: segment.value });
    } else if (segment.type === 'equip') {
      // Equipment from Equipment Wheel
      var rarityName = segment.equipRarity || 'common';
      var statBonus = { common: 1, uncommon: 2, rare: 3, epic: 5, legendary: 8 }[rarityName] || 1;
      var statTypes = ['attackSpeed', 'movementSpeed', 'armor', 'critChance', 'strength'];
      var stat1 = statTypes[Math.floor(Math.random() * statTypes.length)];
      var stat2 = statTypes[Math.floor(Math.random() * statTypes.length)];
      var ringItem = {
        id: 'wheel_ring_' + Date.now(),
        name: rarityName.charAt(0).toUpperCase() + rarityName.slice(1) + ' Wheel Ring',
        type: 'ring',
        rarity: rarityName,
        stats: {},
        description: '+' + statBonus + ' ' + stat1 + (stat1 !== stat2 ? ', +' + statBonus + ' ' + stat2 : '')
      };
      ringItem.stats[stat1] = statBonus;
      if (stat1 !== stat2) ringItem.stats[stat2] = statBonus;
      if (!saveData.inventory) saveData.inventory = [];
      saveData.inventory.push(ringItem);
      desc = 'Got ' + ringItem.name + '!';
    }
    return desc;
  }

  function spin(saveData, useFree, tier) {
    if (!saveData.wheel) saveData.wheel = getWheelDefaults();
    tier = tier || 'basic';
    var tierDef = WHEEL_TIERS[tier] || WHEEL_TIERS.basic;
    var segments = tierDef.segments;
    var free = useFree && canFreeSpin(saveData) && tier === 'basic';
    if (!free) {
      var cost = tierDef.cost;
      if (tierDef.costType === 'gold') {
        if ((saveData.gold || 0) < cost) return { ok: false, msg: 'Not enough Gold (need ' + cost + ').' };
        saveData.gold -= cost;
      } else {
        var playerEssence = (saveData.clicker && saveData.clicker.essence > 0) ? saveData.clicker.essence : (saveData.essence || 0);
        if (playerEssence < cost) return { ok: false, msg: 'Not enough Essence (need ' + cost + ').' };
        if (saveData.clicker && saveData.clicker.essence >= cost) {
          saveData.clicker.essence -= cost;
        } else {
          saveData.essence = (saveData.essence || 0) - cost;
        }
      }
    } else {
      saveData.wheel.lastFreeSpin = Date.now();
    }
    var segment = _weightedPick(segments);
    var description = _applyPrize(segment, saveData);
    saveData.wheel.totalSpins = (saveData.wheel.totalSpins || 0) + 1;
    var entry = { time: Date.now(), segment: segment.id, label: segment.label, desc: description, tier: tier };
    saveData.wheel.history = [entry].concat((saveData.wheel.history || []).slice(0, 9));
    if (window.GameStatistics) {
      window.GameStatistics.incrementStat('totalWheelSpins', 1, saveData);
    }
    if (window.GameAccount) {
      window.GameAccount.addXP(5, 'Wheel spin', saveData);
    }
    return { ok: true, segment: segment, prize: segment.label, description: description };
  }

  var RARITY_COLORS = {
    common:   { bg: '#6c757d', border: '#555',    glow: 'rgba(108,117,125,0.4)', label: 'Common' },
    uncommon: { bg: '#28a745', border: '#1e7e34', glow: 'rgba(40,167,69,0.4)',  label: 'Uncommon' },
    rare:     { bg: '#007bff', border: '#0056b3', glow: 'rgba(0,123,255,0.5)',  label: 'Rare' },
    epic:     { bg: '#9b59b6', border: '#7d3c98', glow: 'rgba(155,89,182,0.5)', label: 'Epic' },
    legendary:{ bg: '#FF8C00', border: '#cc7000', glow: 'rgba(255,140,0,0.5)',  label: 'Legendary' },
    mythical: { bg: '#e91e63', border: '#c2185b', glow: 'rgba(233,30,99,0.5)',  label: 'Mythical' },
    mythic:   { bg: '#e91e63', border: '#c2185b', glow: 'rgba(233,30,99,0.5)',  label: 'Mythic' }
  };

  function renderWheelPanel(saveData, container, activeTier) {
    if (!saveData.wheel) saveData.wheel = getWheelDefaults();
    activeTier = activeTier || 'basic';
    var tierDef = WHEEL_TIERS[activeTier] || WHEEL_TIERS.basic;
    var segments = tierDef.segments;
    var free = canFreeSpin(saveData) && activeTier === 'basic';
    var essence = (saveData.clicker && saveData.clicker.essence > 0) ? saveData.clicker.essence : (saveData.essence || 0);
    var gold = saveData.gold || 0;
    var sliceAngle = 360 / segments.length;
    var totalWeight = segments.reduce(function (s, x) { return s + x.weight; }, 0);

    var html = '<div class="wheel-panel" style="position:relative;">';
    html += '<button class="wheel-close-btn" style="position:absolute;top:8px;right:12px;background:rgba(255,255,255,0.1);border:1px solid #666;border-radius:8px;padding:6px 14px;color:#fff;cursor:pointer;font-size:16px;font-family:Arial,sans-serif;z-index:5;">✕</button>';
    html += '<h3 style="margin:0 0 8px;font-size:22px;letter-spacing:2px;">' + tierDef.icon + ' ' + tierDef.name + '</h3>';

    // Tier tabs
    html += '<div style="display:flex;gap:6px;justify-content:center;margin-bottom:10px;">';
    ['basic', 'gold', 'equip', 'mythic'].forEach(function (tid) {
      var t = WHEEL_TIERS[tid];
      var isActive = tid === activeTier;
      var tabBg = isActive ? t.color : 'rgba(255,255,255,0.08)';
      var tabColor = isActive ? '#000' : '#aaa';
      var tabBorder = isActive ? t.color : '#444';
      html += '<button class="wheel-tier-tab" data-tier="' + tid + '" style="background:' + tabBg + ';color:' + tabColor + ';border:1px solid ' + tabBorder + ';border-radius:16px;padding:5px 14px;font-size:12px;font-weight:bold;cursor:pointer;font-family:\'Bangers\',cursive;letter-spacing:1px;">' + t.icon + ' ' + t.name + '</button>';
    });
    html += '</div>';

    if (free && activeTier === 'basic') html += '<div class="wheel-free-badge" style="background:linear-gradient(135deg,#FFD700,#FFA500);color:#000;border-radius:20px;padding:5px 16px;font-weight:bold;font-size:13px;margin-bottom:8px;display:inline-block;box-shadow:0 2px 8px rgba(255,215,0,0.4);">🎁 Free Spin Available!</div>';

    // Wheel SVG
    html += '<div class="wheel-visual">';
    html += '<div class="wheel-3d-container" style="position:relative;display:inline-block;">';
    html += '<div class="wheel-glow-ring"></div>';
    html += '<svg id="wheel-svg" viewBox="0 0 220 220" width="290" height="290" style="display:block;filter:drop-shadow(0 4px 20px rgba(0,0,0,0.8)) drop-shadow(0 0 12px ' + tierDef.color + '44);">';
    html += '<circle cx="110" cy="110" r="108" fill="none" stroke="' + tierDef.color + '" stroke-width="4" opacity="0.6"/>';
    html += '<circle cx="110" cy="110" r="105" fill="none" stroke="' + tierDef.color + '44" stroke-width="1.5"/>';
    html += '<g id="wheel-group">';
    segments.forEach(function (seg, i) {
      var startAngle = i * sliceAngle - 90;
      var endAngle = startAngle + sliceAngle;
      var s = startAngle * Math.PI / 180, e = endAngle * Math.PI / 180;
      var x1 = 110 + 102 * Math.cos(s), y1 = 110 + 102 * Math.sin(s);
      var x2 = 110 + 102 * Math.cos(e), y2 = 110 + 102 * Math.sin(e);
      var mid = (startAngle + sliceAngle / 2) * Math.PI / 180;
      var tx = 110 + 72 * Math.cos(mid), ty = 110 + 72 * Math.sin(mid);
      var rarity = RARITY_COLORS[seg.rarity] || RARITY_COLORS.common;
      html += '<path d="M110,110 L' + x1 + ',' + y1 + ' A102,102 0 0,1 ' + x2 + ',' + y2 + ' Z" fill="' + rarity.bg + '" stroke="#111" stroke-width="1"/>';
      html += '<path d="M110,110 L' + x1 + ',' + y1 + ' A102,102 0 0,1 ' + x2 + ',' + y2 + ' Z" fill="rgba(255,255,255,0.08)" stroke="none"/>';
      var labelParts = seg.label.split(' ');
      html += '<text x="' + tx + '" y="' + (ty + 2) + '" text-anchor="middle" font-size="11" fill="#fff" font-weight="bold" style="text-shadow:1px 1px 3px #000;pointer-events:none;">' + (labelParts[0] || '') + '</text>';
      html += '<text x="' + tx + '" y="' + (ty + 14) + '" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.85)" style="text-shadow:1px 1px 2px #000;pointer-events:none;">' + (labelParts.slice(1).join(' ') || '') + '</text>';
    });
    html += '<circle cx="110" cy="110" r="18" fill="url(#hubGrad)" stroke="#666" stroke-width="2.5"/>';
    html += '<circle cx="110" cy="110" r="12" fill="#eee" stroke="#aaa" stroke-width="1"/>';
    html += '<ellipse cx="107" cy="107" rx="5" ry="3" fill="rgba(255,255,255,0.6)"/>';
    html += '</g>';
    html += '<defs><radialGradient id="hubGrad" cx="45%" cy="45%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#bbb"/></radialGradient></defs>';
    for (var d = 0; d < 16; d++) {
      var da = (d / 16) * Math.PI * 2;
      var dx = 110 + 107 * Math.cos(da), dy = 110 + 107 * Math.sin(da);
      html += '<circle cx="' + dx.toFixed(1) + '" cy="' + dy.toFixed(1) + '" r="2.5" fill="' + tierDef.color + '" opacity="0.85"/>';
    }
    html += '</svg>';
    html += '</div>';
    html += '<div class="wheel-pointer" style="position:absolute;top:-2px;left:50%;transform:translateX(-50%);font-size:28px;color:' + tierDef.color + ';text-shadow:0 2px 6px rgba(0,0,0,0.8);z-index:2;filter:drop-shadow(0 0 4px ' + tierDef.color + '99);">▼</div>';
    html += '</div>';

    // Spin buttons
    html += '<div class="wheel-btns" style="display:flex;gap:10px;justify-content:center;margin:12px 0;">';
    if (free && activeTier === 'basic') html += '<button class="wheel-spin-free" style="background:linear-gradient(135deg,#FFD700,#FFA500);color:#000;border:none;border-radius:24px;padding:10px 24px;font-weight:bold;font-size:14px;cursor:pointer;box-shadow:0 3px 12px rgba(255,215,0,0.4);font-family:\'Bangers\',cursive;letter-spacing:1px;">🎁 FREE SPIN</button>';
    var costLabel = tierDef.costType === 'gold' ? tierDef.cost + ' 💰' : tierDef.cost + ' ✨';
    var canAfford = tierDef.costType === 'gold' ? gold >= tierDef.cost : essence >= tierDef.cost;
    var paidDisabledStyle = !canAfford ? 'opacity:0.4;cursor:not-allowed;' : '';
    html += '<button class="wheel-spin-paid" style="background:linear-gradient(135deg,' + tierDef.color + ',' + tierDef.color + 'cc);color:#000;border:none;border-radius:24px;padding:10px 24px;font-weight:bold;font-size:14px;cursor:pointer;box-shadow:0 3px 12px ' + tierDef.color + '66;font-family:\'Bangers\',cursive;letter-spacing:1px;' + paidDisabledStyle + '"' + (!canAfford ? ' disabled' : '') + '>SPIN (' + costLabel + ')</button>';
    html += '</div>';

    html += '<div class="wheel-result" style="min-height:24px;font-size:15px;font-weight:bold;color:#FFD700;text-align:center;margin:4px 0;"></div>';
    html += '<div class="wheel-essence" style="text-align:center;font-size:13px;color:#aaa;margin-bottom:8px;">💰 Gold: ' + gold + ' &nbsp; ✨ Essence: ' + essence + '</div>';

    // Possible Rewards
    html += '<details style="width:100%;max-width:340px;margin:0 auto 10px auto;background:rgba(255,255,255,0.03);border:1px solid #333;border-radius:12px;padding:2px;">';
    html += '<summary style="cursor:pointer;padding:8px 12px;font-size:13px;color:' + tierDef.color + ';font-weight:bold;letter-spacing:1px;text-align:center;">📋 View Possible Rewards & Drop Rates</summary>';
    html += '<div style="padding:6px 10px;max-height:200px;overflow-y:auto;">';
    segments.forEach(function (seg) {
      var rarity = RARITY_COLORS[seg.rarity] || RARITY_COLORS.common;
      var pct = ((seg.weight / totalWeight) * 100).toFixed(1);
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 6px;margin:2px 0;background:rgba(255,255,255,0.02);border-radius:6px;border-left:3px solid ' + rarity.bg + ';">';
      html += '<span style="color:#fff;font-size:12px;">' + seg.label + '</span>';
      html += '<span style="display:flex;align-items:center;gap:6px;"><span style="background:' + rarity.bg + ';color:#fff;font-size:9px;padding:2px 6px;border-radius:8px;font-weight:bold;">' + rarity.label + '</span><span style="color:#888;font-size:11px;min-width:36px;text-align:right;">' + pct + '%</span></span>';
      html += '</div>';
    });
    html += '</div></details>';

    // History
    html += '<div class="wheel-history" style="max-width:340px;margin:0 auto;"><h4 style="font-size:13px;color:#888;margin:4px 0;">Recent Spins</h4><ul style="list-style:none;padding:0;margin:0;max-height:100px;overflow-y:auto;">';
    (saveData.wheel.history || []).forEach(function (e) {
      var entryDate = new Date(e.time);
      var ts = '[' + _pad2(entryDate.getHours()) + ':' + _pad2(entryDate.getMinutes()) + ']';
      html += '<li style="font-size:11px;color:#999;padding:2px 0;"><span class="wh-ts">' + ts + '</span> ' + e.label + ' — ' + e.desc + '</li>';
    });
    html += '</ul></div>';
    html += '<div class="wheel-total" style="text-align:center;margin-top:4px;"><small style="color:#555;">Total spins: ' + (saveData.wheel.totalSpins || 0) + '</small></div>';
    html += '</div>';
    container.innerHTML = html;

    function doSpin(useFree) {
      var wheelGroup = container.querySelector('#wheel-group');
      var btns = container.querySelectorAll('.wheel-spin-free, .wheel-spin-paid');
      btns.forEach(function (b) { b.disabled = true; });

      var res = spin(saveData, useFree, activeTier);
      if (!res.ok) {
        btns.forEach(function (b) { b.disabled = false; });
        alert(res.msg);
        return;
      }

      var segIndex = segments.indexOf(res.segment);
      if (segIndex < 0) segIndex = 0;
      var segCenterAngle = segIndex * sliceAngle + sliceAngle / 2 - 90;
      var landingOffset = (360 - (segCenterAngle % 360 + 360) % 360) % 360;
      var totalDeg = 360 * 6 + landingOffset;
      var spinDuration = 3800;
      var startTime = Date.now();

      function animateSpin() {
        var elapsed = Date.now() - startTime;
        var t = Math.min(elapsed / spinDuration, 1);
        var eased = 1 - Math.pow(1 - t, 3.5);
        var currentRot = totalDeg * eased;
        if (wheelGroup) {
          wheelGroup.setAttribute('transform', 'rotate(' + currentRot.toFixed(2) + ',110,110)');
        }
        if (t < 1) {
          requestAnimationFrame(animateSpin);
        } else {
          var rarity = RARITY_COLORS[res.segment.rarity] || RARITY_COLORS.common;
          var el = container.querySelector('.wheel-result');
          // Placeholder bubble (will be populated by escalation onComplete)
          if (el) {
            el.innerHTML = '<div style="color:' + rarity.bg + ';font-family:\'Bangers\',cursive;letter-spacing:2px;font-size:13px;animation:wheel-result-pop 0.3s ease-out;">🎰 Revealing…</div>';
          }
          // Escalation reveal — badge shown on complete
          var anchorEl = el || container;
          var segRarity = res.segment.rarity || 'common';
          if (typeof window.rarityEscalationReveal === 'function') {
            window.rarityEscalationReveal(anchorEl, segRarity, {
              onComplete: function() {
                if (el) {
                  var rarityName = rarity.label || 'Common';
                  var bubble = document.createElement('div');
                  bubble.style.cssText = 'background:rgba(0,0,0,0.85);border:2px solid ' + rarity.border + ';border-radius:16px;padding:12px 22px;display:inline-block;box-shadow:0 0 20px ' + rarity.glow + ',0 0 40px ' + rarity.glow + ';animation:wheel-result-pop 0.3s ease-out;';
                  bubble.innerHTML = '<div style="font-size:11px;letter-spacing:2px;color:' + rarity.bg + ';font-family:\'Bangers\',cursive;margin-bottom:4px;">' + rarityName.toUpperCase() + '</div>' +
                    '<span style="font-size:20px;">🎉</span> <span style="color:#fff;font-weight:bold;font-size:16px;">' + res.prize + '</span><br>' +
                    '<small style="color:rgba(255,255,255,0.8);font-size:13px;">' + res.description + '</small>';
                  el.textContent = '';
                  el.appendChild(bubble);
                }
                setTimeout(function () { renderWheelPanel(saveData, container, activeTier); }, 2200);
              }
            });
          } else {
            // Fallback: immediate reveal
            if (el) {
              var rarityName = rarity.label || 'Common';
              var bubble = document.createElement('div');
              bubble.style.cssText = 'background:rgba(0,0,0,0.85);border:2px solid ' + rarity.border + ';border-radius:16px;padding:12px 22px;display:inline-block;box-shadow:0 0 20px ' + rarity.glow + ',0 0 40px ' + rarity.glow + ';animation:wheel-result-pop 0.3s ease-out;';
              bubble.innerHTML = '<div style="font-size:11px;letter-spacing:2px;color:' + rarity.bg + ';font-family:\'Bangers\',cursive;margin-bottom:4px;">' + rarityName.toUpperCase() + '</div>' +
                '<span style="font-size:20px;">🎉</span> <span style="color:#fff;font-weight:bold;font-size:16px;">' + res.prize + '</span><br>' +
                '<small style="color:rgba(255,255,255,0.8);font-size:13px;">' + res.description + '</small>';
              el.textContent = '';
              el.appendChild(bubble);
            }
            if (typeof window.spawnRarityEffects === 'function') {
              window.spawnRarityEffects(el || container, segRarity);
            }
            setTimeout(function () { renderWheelPanel(saveData, container, activeTier); }, 2500);
          }
        }
      }
      requestAnimationFrame(animateSpin);
    }

    var freeBtn = container.querySelector('.wheel-spin-free');
    if (freeBtn) freeBtn.addEventListener('click', function () { doSpin(true); });
    var paidBtn = container.querySelector('.wheel-spin-paid');
    if (paidBtn) paidBtn.addEventListener('click', function () { doSpin(false); });

    // Tier tab switching
    var tierTabs = container.querySelectorAll('.wheel-tier-tab');
    tierTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        renderWheelPanel(saveData, container, tab.getAttribute('data-tier'));
      });
    });

    var closeWheelBtn = container.querySelector('.wheel-close-btn');
    if (closeWheelBtn) {
      closeWheelBtn.addEventListener('click', function () {
        var overlay = container.closest('[style*="position:fixed"]') || container.closest('[style*="position: fixed"]');
        if (overlay && overlay.parentNode === document.body) {
          overlay.remove();
          if (window._updateCampCornerWidgets) window._updateCampCornerWidgets();
          if (window.CampWorld && window.CampWorld.isActive) window.CampWorld.resumeInput();
        }
      });
    }
  }

  return {
    WHEEL_SEGMENTS: WHEEL_SEGMENTS,
    WHEEL_TIERS: WHEEL_TIERS,
    RARITY_COLORS: RARITY_COLORS,
    getWheelDefaults: getWheelDefaults,
    canFreeSpin: canFreeSpin,
    spin: spin,
    renderWheelPanel: renderWheelPanel
  };
})();
