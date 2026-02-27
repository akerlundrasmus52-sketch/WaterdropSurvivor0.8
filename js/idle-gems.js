// idle-gems.js — Gem socket system with crafting, fusion, and meltdown
window.GameGems = (function () {
  var GEM_TYPES = [
    { key: 'fire',      icon: '🔴', stat: 'damage',    label: 'Fire' },
    { key: 'ice',       icon: '🔵', stat: 'armor',     label: 'Ice' },
    { key: 'lightning', icon: '⚡', stat: 'speed',     label: 'Lightning' },
    { key: 'void',      icon: '🟣', stat: 'critChance', label: 'Void' },
    { key: 'nature',    icon: '🟢', stat: 'hpRegen',   label: 'Nature' }
  ];

  var GEM_TIERS = [
    { tier: 1, name: 'Chipped',  value: 0.02 },
    { tier: 2, name: 'Flawed',   value: 0.05 },
    { tier: 3, name: 'Normal',   value: 0.08 },
    { tier: 4, name: 'Flawless', value: 0.12 },
    { tier: 5, name: 'Perfect',  value: 0.18 }
  ];

  var _idCounter = 1;
  function _uid() { return 'gem_' + Date.now() + '_' + (_idCounter++); }

  function getGemsDefaults() {
    return { inventory: [], gemDust: 0, totalGemsFound: 0, totalGemsFused: 0, totalGemsMelted: 0 };
  }

  function _makeGem(typeKey, tierNum) {
    var t = GEM_TYPES.find(function (x) { return x.key === typeKey; });
    var tr = GEM_TIERS[tierNum - 1];
    return {
      id: _uid(),
      type: t.key,
      tier: tr.tier,
      name: tr.name + ' ' + t.label + ' Gem',
      icon: t.icon,
      stat: t.stat,
      value: tr.value,
      socketed: false,
      gearId: null
    };
  }

  function addRandomGem(saveData, tier) {
    if (!saveData.gems) saveData.gems = getGemsDefaults();
    var t = (tier && tier >= 1 && tier <= 5) ? tier : Math.ceil(Math.random() * 3);
    var typeKey = GEM_TYPES[Math.floor(Math.random() * GEM_TYPES.length)].key;
    var gem = _makeGem(typeKey, t);
    saveData.gems.inventory.push(gem);
    saveData.gems.totalGemsFound++;
    return gem;
  }

  function fuseGems(gemId1, gemId2, gemId3, saveData) {
    if (!saveData.gems) return null;
    var inv = saveData.gems.inventory;
    var ids = [gemId1, gemId2, gemId3];
    var gems = ids.map(function (id) { return inv.find(function (g) { return g.id === id; }); });
    if (gems.some(function (g) { return !g; })) return null;
    if (gems.some(function (g) { return g.socketed; })) return null;
    var type0 = gems[0].type, tier0 = gems[0].tier;
    if (!gems.every(function (g) { return g.type === type0 && g.tier === tier0; })) return null;
    if (tier0 >= 5) return null;
    var cost = tier0 * 100;
    if ((saveData.gold || 0) < cost) return null;
    saveData.gold = (saveData.gold || 0) - cost;
    ids.forEach(function (id) {
      var idx = inv.findIndex(function (g) { return g.id === id; });
      if (idx !== -1) inv.splice(idx, 1);
    });
    var newGem = _makeGem(type0, tier0 + 1);
    inv.push(newGem);
    saveData.gems.totalGemsFused++;
    saveData.gems.totalGemsFound++;
    return newGem;
  }

  function meltGem(gemId, saveData) {
    if (!saveData.gems) return 0;
    var inv = saveData.gems.inventory;
    var idx = inv.findIndex(function (g) { return g.id === gemId; });
    if (idx === -1) return 0;
    var gem = inv[idx];
    if (gem.socketed) return 0;
    var dust = gem.tier * 10;
    inv.splice(idx, 1);
    saveData.gems.gemDust = (saveData.gems.gemDust || 0) + dust;
    saveData.gems.totalGemsMelted++;
    return dust;
  }

  function socketGem(gearId, socketIndex, gemId, saveData) {
    if (!saveData.gems) return false;
    var gem = saveData.gems.inventory.find(function (g) { return g.id === gemId; });
    if (!gem || gem.socketed) return false;
    if (!saveData.gearSockets) saveData.gearSockets = {};
    if (!saveData.gearSockets[gearId]) saveData.gearSockets[gearId] = {};
    saveData.gearSockets[gearId][socketIndex] = gemId;
    gem.socketed = true;
    gem.gearId = gearId;
    return true;
  }

  function unsocketGem(gearId, socketIndex, saveData) {
    if (!saveData.gems) return false;
    var cost = 50;
    if ((saveData.gold || 0) < cost) return false;
    if (!saveData.gearSockets || !saveData.gearSockets[gearId]) return false;
    var gemId = saveData.gearSockets[gearId][socketIndex];
    if (!gemId) return false;
    var gem = saveData.gems.inventory.find(function (g) { return g.id === gemId; });
    if (gem) { gem.socketed = false; gem.gearId = null; }
    delete saveData.gearSockets[gearId][socketIndex];
    saveData.gold = (saveData.gold || 0) - cost;
    return true;
  }

  function getGemBonuses(saveData) {
    var bonuses = {};
    if (!saveData.gems) return bonuses;
    saveData.gems.inventory.forEach(function (gem) {
      if (gem.socketed) {
        bonuses[gem.stat] = (bonuses[gem.stat] || 0) + gem.value;
      }
    });
    return bonuses;
  }

  function renderGemsPanel(saveData, container) {
    if (!saveData.gems) saveData.gems = getGemsDefaults();
    var inv = saveData.gems.inventory;
    var html = '<div class="gems-panel">';
    html += '<h3>💎 Gem Inventory <span class="gem-dust-count">🌫️ Dust: ' + (saveData.gems.gemDust || 0) + '</span></h3>';
    html += '<div class="gem-grid">';
    if (inv.length === 0) {
      html += '<p class="gems-empty">No gems found yet. Explore to find gems!</p>';
    } else {
      inv.forEach(function (gem) {
        html += '<div class="gem-card gem-' + gem.type + ' tier-' + gem.tier + (gem.socketed ? ' gem-socketed' : '') + '" data-gemid="' + gem.id + '">';
        html += '<span class="gem-icon">' + gem.icon + '</span>';
        html += '<div class="gem-name">' + gem.name + '</div>';
        html += '<div class="gem-stat">+' + Math.round(gem.value * 100) + '% ' + gem.stat + '</div>';
        if (!gem.socketed) {
          html += '<button class="gem-melt-btn" data-gemid="' + gem.id + '">Melt (+' + gem.tier * 10 + ' dust)</button>';
        } else {
          html += '<span class="gem-in-slot">Socketed</span>';
        }
        html += '</div>';
      });
    }
    html += '</div>';
    html += '<div class="gem-fusion"><h4>🔮 Fusion (3 same type+tier → next tier)</h4>';
    html += '<p class="gem-fusion-hint">Select 3 gems of the same type and tier to fuse them.</p>';
    html += '<div class="gem-stats-summary">';
    html += '<small>Found: ' + saveData.gems.totalGemsFound + ' | Fused: ' + saveData.gems.totalGemsFused + ' | Melted: ' + saveData.gems.totalGemsMelted + '</small>';
    html += '</div></div></div>';
    container.innerHTML = html;
    container.querySelectorAll('.gem-melt-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var gid = btn.getAttribute('data-gemid');
        var dust = meltGem(gid, saveData);
        if (dust > 0) renderGemsPanel(saveData, container);
      });
    });
  }

  return {
    GEM_TYPES: GEM_TYPES,
    GEM_TIERS: GEM_TIERS,
    getGemsDefaults: getGemsDefaults,
    addRandomGem: addRandomGem,
    fuseGems: fuseGems,
    meltGem: meltGem,
    socketGem: socketGem,
    unsocketGem: unsocketGem,
    getGemBonuses: getGemBonuses,
    renderGemsPanel: renderGemsPanel
  };
})();
