// idle-lucky-wheel.js — Spin-the-wheel gacha mini-game
window.GameLuckyWheel = (function () {
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

  var SPIN_COST = 50; // essence

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

  function _weightedPick() {
    var total = WHEEL_SEGMENTS.reduce(function (s, x) { return s + x.weight; }, 0);
    var r = Math.random() * total;
    var cum = 0;
    for (var i = 0; i < WHEEL_SEGMENTS.length; i++) {
      cum += WHEEL_SEGMENTS[i].weight;
      if (r < cum) return WHEEL_SEGMENTS[i];
    }
    return WHEEL_SEGMENTS[WHEEL_SEGMENTS.length - 1];
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
    }
    return desc;
  }

  function spin(saveData, useFree) {
    if (!saveData.wheel) saveData.wheel = getWheelDefaults();
    var free = useFree && canFreeSpin(saveData);
    if (!free) {
      var playerEssence = (saveData.clicker && saveData.clicker.essence > 0) ? saveData.clicker.essence : (saveData.essence || 0);
      if (playerEssence < SPIN_COST) return { ok: false, msg: 'Not enough essence (need ' + SPIN_COST + ').' };
      if (saveData.clicker && saveData.clicker.essence >= SPIN_COST) {
        saveData.clicker.essence -= SPIN_COST;
      } else {
        saveData.essence = (saveData.essence || 0) - SPIN_COST;
      }
    } else {
      saveData.wheel.lastFreeSpin = Date.now();
    }
    var segment = _weightedPick();
    var description = _applyPrize(segment, saveData);
    saveData.wheel.totalSpins = (saveData.wheel.totalSpins || 0) + 1;
    var entry = { time: Date.now(), segment: segment.id, label: segment.label, desc: description };
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
    common:   { bg: '#6c757d', border: '#555', glow: 'rgba(108,117,125,0.4)', label: 'Common' },
    uncommon: { bg: '#28a745', border: '#1e7e34', glow: 'rgba(40,167,69,0.4)', label: 'Uncommon' },
    rare:     { bg: '#007bff', border: '#0056b3', glow: 'rgba(0,123,255,0.5)', label: 'Rare' },
    epic:     { bg: '#9b59b6', border: '#7d3c98', glow: 'rgba(155,89,182,0.5)', label: 'Epic' },
    legendary:{ bg: '#FF8C00', border: '#cc7000', glow: 'rgba(255,140,0,0.5)', label: 'Legendary' },
    mythical: { bg: '#e91e63', border: '#c2185b', glow: 'rgba(233,30,99,0.5)', label: 'Mythical' }
  };

  function renderWheelPanel(saveData, container) {
    if (!saveData.wheel) saveData.wheel = getWheelDefaults();
    var free = canFreeSpin(saveData);
    var essence = (saveData.clicker && saveData.clicker.essence > 0) ? saveData.clicker.essence : (saveData.essence || 0);
    var sliceAngle = 360 / WHEEL_SEGMENTS.length;

    // Compute weighted total for percentages
    var totalWeight = WHEEL_SEGMENTS.reduce(function (s, x) { return s + x.weight; }, 0);

    var html = '<div class="wheel-panel">';
    html += '<h3 style="margin:0 0 8px;font-size:22px;letter-spacing:2px;">🎡 Lucky Wheel</h3>';
    if (free) html += '<div class="wheel-free-badge" style="background:linear-gradient(135deg,#FFD700,#FFA500);color:#000;border-radius:20px;padding:5px 16px;font-weight:bold;font-size:13px;margin-bottom:8px;display:inline-block;box-shadow:0 2px 8px rgba(255,215,0,0.4);">🎁 Free Spin Available!</div>';

    // Wheel SVG with rounded styling
    html += '<div class="wheel-visual">';
    html += '<div class="wheel-3d-container" style="position:relative;display:inline-block;">';
    html += '<div class="wheel-glow-ring"></div>';
    html += '<svg id="wheel-svg" viewBox="0 0 220 220" width="240" height="240" style="display:block;filter:drop-shadow(0 4px 20px rgba(0,0,0,0.8)) drop-shadow(0 0 12px rgba(255,215,0,0.3));">';
    // Rounded outer rim
    html += '<circle cx="110" cy="110" r="108" fill="none" stroke="#333" stroke-width="4"/>';
    html += '<circle cx="110" cy="110" r="105" fill="none" stroke="rgba(255,215,0,0.3)" stroke-width="1.5"/>';
    html += '<g id="wheel-group">';
    WHEEL_SEGMENTS.forEach(function (seg, i) {
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
      // Segment label with emoji icon
      var labelParts = seg.label.split(' ');
      html += '<text x="' + tx + '" y="' + (ty + 2) + '" text-anchor="middle" font-size="9" fill="#fff" font-weight="bold" style="text-shadow:1px 1px 3px #000;pointer-events:none;">' + (labelParts[0] || '') + '</text>';
      html += '<text x="' + tx + '" y="' + (ty + 12) + '" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.7)" style="text-shadow:1px 1px 2px #000;pointer-events:none;">' + (labelParts.slice(1).join(' ') || '') + '</text>';
    });
    // Center hub
    html += '<circle cx="110" cy="110" r="18" fill="url(#hubGrad)" stroke="#666" stroke-width="2.5"/>';
    html += '<circle cx="110" cy="110" r="12" fill="#eee" stroke="#aaa" stroke-width="1"/>';
    html += '<ellipse cx="107" cy="107" rx="5" ry="3" fill="rgba(255,255,255,0.6)"/>';
    html += '</g>';
    // Hub gradient
    html += '<defs><radialGradient id="hubGrad" cx="45%" cy="45%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#bbb"/></radialGradient></defs>';
    // Decorative rim dots
    for (var d = 0; d < 16; d++) {
      var da = (d / 16) * Math.PI * 2;
      var dx = 110 + 107 * Math.cos(da), dy = 110 + 107 * Math.sin(da);
      html += '<circle cx="' + dx.toFixed(1) + '" cy="' + dy.toFixed(1) + '" r="2.5" fill="#FFD700" opacity="0.85"/>';
    }
    html += '</svg>';
    html += '</div>';
    // Pointer
    html += '<div class="wheel-pointer" style="position:absolute;top:-2px;left:50%;transform:translateX(-50%);font-size:28px;color:#FFD700;text-shadow:0 2px 6px rgba(0,0,0,0.8);z-index:2;filter:drop-shadow(0 0 4px rgba(255,215,0,0.6));">▼</div>';
    html += '</div>';

    // Spin buttons with rounded glass look
    html += '<div class="wheel-btns" style="display:flex;gap:10px;justify-content:center;margin:12px 0;">';
    if (free) html += '<button class="wheel-spin-free" style="background:linear-gradient(135deg,#FFD700,#FFA500);color:#000;border:none;border-radius:24px;padding:10px 24px;font-weight:bold;font-size:14px;cursor:pointer;box-shadow:0 3px 12px rgba(255,215,0,0.4);font-family:\'Bangers\',cursive;letter-spacing:1px;">🎁 FREE SPIN</button>';
    var paidDisabledStyle = essence < SPIN_COST ? 'opacity:0.4;cursor:not-allowed;' : '';
    html += '<button class="wheel-spin-paid" style="background:linear-gradient(135deg,#3498db,#2980b9);color:#fff;border:none;border-radius:24px;padding:10px 24px;font-weight:bold;font-size:14px;cursor:pointer;box-shadow:0 3px 12px rgba(52,152,219,0.4);font-family:\'Bangers\',cursive;letter-spacing:1px;' + paidDisabledStyle + '"' + (essence < SPIN_COST ? ' disabled' : '') + '>SPIN (50 ✨)</button>';
    html += '</div>';

    html += '<div class="wheel-result" style="min-height:24px;font-size:15px;font-weight:bold;color:#FFD700;text-align:center;margin:4px 0;"></div>';
    html += '<div class="wheel-essence" style="text-align:center;font-size:13px;color:#aaa;margin-bottom:8px;">✨ Essence: ' + essence + '</div>';

    // Possible Rewards tab
    html += '<details style="width:100%;max-width:340px;margin:0 auto 10px auto;background:rgba(255,255,255,0.03);border:1px solid #333;border-radius:12px;padding:2px;">';
    html += '<summary style="cursor:pointer;padding:8px 12px;font-size:13px;color:#FFD700;font-weight:bold;letter-spacing:1px;text-align:center;">📋 View Possible Rewards & Drop Rates</summary>';
    html += '<div style="padding:6px 10px;max-height:200px;overflow-y:auto;">';
    WHEEL_SEGMENTS.forEach(function (seg) {
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
      var d = new Date(e.time);
      var ts = '[' + _pad2(d.getHours()) + ':' + _pad2(d.getMinutes()) + ']';
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

      var res = spin(saveData, useFree);
      if (!res.ok) {
        btns.forEach(function (b) { b.disabled = false; });
        alert(res.msg);
        return;
      }

      var segIndex = WHEEL_SEGMENTS.indexOf(res.segment);
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
          if (el) {
            el.innerHTML = '<style>@keyframes wheel-result-pop{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:translateY(0)}}</style><div style="background:linear-gradient(135deg,' + rarity.bg + ',rgba(0,0,0,0.3));border:2px solid ' + rarity.border + ';border-radius:16px;padding:10px 20px;display:inline-block;box-shadow:0 0 16px ' + rarity.glow + ';animation:wheel-result-pop 0.3s ease-out;"><span style="font-size:18px;">🎉</span> <span style="color:#fff;font-weight:bold;">' + res.prize + '</span><br><small style="color:rgba(255,255,255,0.7);">' + res.description + '</small></div>';
          }
          setTimeout(function () { renderWheelPanel(saveData, container); }, 2500);
        }
      }
      requestAnimationFrame(animateSpin);
    }

    var freeBtn = container.querySelector('.wheel-spin-free');
    if (freeBtn) freeBtn.addEventListener('click', function () { doSpin(true); });
    var paidBtn = container.querySelector('.wheel-spin-paid');
    if (paidBtn) paidBtn.addEventListener('click', function () { doSpin(false); });
  }

  return {
    WHEEL_SEGMENTS: WHEEL_SEGMENTS,
    RARITY_COLORS: RARITY_COLORS,
    getWheelDefaults: getWheelDefaults,
    canFreeSpin: canFreeSpin,
    spin: spin,
    renderWheelPanel: renderWheelPanel
  };
})();
