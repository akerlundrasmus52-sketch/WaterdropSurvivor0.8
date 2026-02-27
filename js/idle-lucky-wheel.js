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

  function renderWheelPanel(saveData, container) {
    if (!saveData.wheel) saveData.wheel = getWheelDefaults();
    var free = canFreeSpin(saveData);
    var essence = (saveData.clicker && saveData.clicker.essence > 0) ? saveData.clicker.essence : (saveData.essence || 0);
    var colors = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e91e63'];
    var total = WHEEL_SEGMENTS.reduce(function (s, x) { return s + x.weight; }, 0);
    var sliceAngle = 360 / WHEEL_SEGMENTS.length;

    var html = '<div class="wheel-panel">';
    html += '<h3>🎡 Lucky Wheel</h3>';
    if (free) html += '<div class="wheel-free-badge">🎁 Free Spin Available!</div>';
    html += '<div class="wheel-visual"><svg viewBox="0 0 200 200" width="200" height="200">';
    WHEEL_SEGMENTS.forEach(function (seg, i) {
      var startAngle = i * sliceAngle - 90;
      var endAngle = startAngle + sliceAngle;
      var s = startAngle * Math.PI / 180, e = endAngle * Math.PI / 180;
      var x1 = 100 + 95 * Math.cos(s), y1 = 100 + 95 * Math.sin(s);
      var x2 = 100 + 95 * Math.cos(e), y2 = 100 + 95 * Math.sin(e);
      var mid = (startAngle + sliceAngle / 2) * Math.PI / 180;
      var tx = 100 + 65 * Math.cos(mid), ty = 100 + 65 * Math.sin(mid);
      html += '<path d="M100,100 L' + x1 + ',' + y1 + ' A95,95 0 0,1 ' + x2 + ',' + y2 + ' Z" fill="' + colors[i % colors.length] + '" stroke="#fff" stroke-width="1.5"/>';
      html += '<text x="' + tx + '" y="' + (ty + 4) + '" text-anchor="middle" font-size="11" fill="#fff">' + seg.label.split(' ')[0] + '</text>';
    });
    html += '<circle cx="100" cy="100" r="12" fill="#fff" stroke="#ccc" stroke-width="2"/>';
    html += '</svg><div class="wheel-pointer">▼</div></div>';
    html += '<div class="wheel-btns">';
    if (free) html += '<button class="wheel-spin-free">🎁 Free Spin</button>';
    html += '<button class="wheel-spin-paid"' + (essence < SPIN_COST ? ' disabled' : '') + '>Spin (50 ✨)</button>';
    html += '</div>';
    html += '<div class="wheel-essence">✨ Essence: ' + essence + '</div>';
    html += '<div class="wheel-history"><h4>Recent Spins</h4><ul>';
    (saveData.wheel.history || []).forEach(function (e) {
      var d = new Date(e.time);
      var ts = '[' + _pad2(d.getHours()) + ':' + _pad2(d.getMinutes()) + ']';
      html += '<li><span class="wh-ts">' + ts + '</span> ' + e.label + ' — ' + e.desc + '</li>';
    });
    html += '</ul></div>';
    html += '<div class="wheel-total"><small>Total spins: ' + (saveData.wheel.totalSpins || 0) + '</small></div>';
    html += '</div>';
    container.innerHTML = html;

    function doSpin(useFree) {
      var res = spin(saveData, useFree);
      if (res.ok) {
        var el = container.querySelector('.wheel-result');
        if (!el) {
          el = document.createElement('div');
          el.className = 'wheel-result';
          container.querySelector('.wheel-panel').insertBefore(el, container.querySelector('.wheel-btns'));
        }
        el.textContent = '🎉 ' + res.prize + ' — ' + res.description;
        renderWheelPanel(saveData, container);
      } else {
        alert(res.msg);
      }
    }

    var freeBtn = container.querySelector('.wheel-spin-free');
    if (freeBtn) freeBtn.addEventListener('click', function () { doSpin(true); });
    var paidBtn = container.querySelector('.wheel-spin-paid');
    if (paidBtn) paidBtn.addEventListener('click', function () { doSpin(false); });
  }

  return {
    WHEEL_SEGMENTS: WHEEL_SEGMENTS,
    getWheelDefaults: getWheelDefaults,
    canFreeSpin: canFreeSpin,
    spin: spin,
    renderWheelPanel: renderWheelPanel
  };
})();
