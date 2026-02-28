// idle-shop.js — NPC merchant shop with rotating stock
window.GameShop = (function () {
  var SHOP_ITEMS = [
    { id: 'healing_potion',   cat: 'consumable', name: 'Healing Potion',       icon: '🧪', price: 50,  currency: 'gold', desc: '+20% HP next run',           effect: { type: 'buff', stat: 'hpBonus', value: 0.20, duration: 'run' } },
    { id: 'xp_scroll',        cat: 'consumable', name: 'XP Scroll',            icon: '📜', price: 100, currency: 'gold', desc: '+50% XP for 1 run',          effect: { type: 'buff', stat: 'xpBonus', value: 0.50, duration: 'run' } },
    { id: 'speed_elixir',     cat: 'consumable', name: 'Speed Elixir',         icon: '⚗️', price: 75,  currency: 'gold', desc: '+30% speed for 1 run',       effect: { type: 'buff', stat: 'speedBonus', value: 0.30, duration: 'run' } },
    { id: 'gem_t1',           cat: 'gem',        name: 'Random Gem (T1)',       icon: '💠', price: 200, currency: 'gold', desc: 'Random Tier 1 gem',           effect: { type: 'gem', tier: 1 } },
    { id: 'gem_t2',           cat: 'gem',        name: 'Random Gem (T2)',       icon: '🔷', price: 500, currency: 'gold', desc: 'Random Tier 2 gem',           effect: { type: 'gem', tier: 2 } },
    { id: 'gem_dust_50',      cat: 'gem',        name: 'Gem Dust ×50',          icon: '🌫️', price: 300, currency: 'gold', desc: '+50 Gem Dust',                effect: { type: 'gemDust', amount: 50 } },
    { id: 'gear_reroll_stat', cat: 'gear',       name: 'Gear Stat Reroll',      icon: '🎲', price: 150, currency: 'gold', desc: 'Reroll a gear piece stats',   effect: { type: 'rerollStat' } },
    { id: 'gear_reroll_sock', cat: 'gear',       name: 'Gear Socket Reroll',    icon: '🔩', price: 200, currency: 'gold', desc: 'Reroll gear socket count',    effect: { type: 'rerollSocket' } },
    { id: 'add_socket',       cat: 'special',    name: 'Add Socket',            icon: '🔮', price: 500, currency: 'gold', desc: 'Add a socket to gear (needs 100 dust)', effect: { type: 'addSocket', dustCost: 100 } },
    { id: 'lucky_charm',      cat: 'special',    name: 'Lucky Charm',           icon: '🍀', price: 300, currency: 'gold', desc: '+10% drop rate for 1 hour',   effect: { type: 'buff', stat: 'dropBonus', value: 0.10, duration: 3600000 } }
  ];

  var STOCK_SIZE = 6;

  function getShopDefaults() {
    return { stock: [], lastRefresh: 0, totalPurchases: 0, totalGoldSpent: 0 };
  }

  function shouldRefreshShop(saveData) {
    if (!saveData.shop) return true;
    var last = saveData.shop.lastRefresh || 0;
    var lastDate = new Date(last);
    var now = new Date();
    return lastDate.getFullYear() !== now.getFullYear() ||
           lastDate.getMonth() !== now.getMonth() ||
           lastDate.getDate() !== now.getDate();
  }

  function refreshStock(saveData) {
    if (!saveData.shop) saveData.shop = getShopDefaults();
    var pool = SHOP_ITEMS.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    var shuffled = pool;
    var picked = shuffled.slice(0, STOCK_SIZE);
    var featuredIdx = Math.floor(Math.random() * picked.length);
    var stock = picked.map(function (item, i) {
      var discounted = i === featuredIdx;
      return {
        itemId: item.id,
        featured: discounted,
        price: discounted ? Math.floor(item.price * 0.75) : item.price,
        currency: item.currency,
        soldOut: false
      };
    });
    saveData.shop.stock = stock;
    saveData.shop.lastRefresh = Date.now();
    return stock;
  }

  function buyItem(itemIndex, saveData) {
    if (!saveData.shop) saveData.shop = getShopDefaults();
    if (shouldRefreshShop(saveData)) refreshStock(saveData);
    var slot = saveData.shop.stock[itemIndex];
    if (!slot || slot.soldOut) return { ok: false, msg: 'Item not available.' };
    var item = SHOP_ITEMS.find(function (x) { return x.id === slot.itemId; });
    if (!item) return { ok: false, msg: 'Unknown item.' };
    var price = slot.price;
    if ((saveData.gold || 0) < price) return { ok: false, msg: 'Not enough gold.' };

    var eff = item.effect;
    if (eff.type === 'addSocket' && (saveData.gems ? saveData.gems.gemDust : 0) < eff.dustCost) {
      return { ok: false, msg: 'Not enough gem dust (need ' + eff.dustCost + ').' };
    }

    saveData.gold = (saveData.gold || 0) - price;
    saveData.shop.totalGoldSpent = (saveData.shop.totalGoldSpent || 0) + price;
    saveData.shop.totalPurchases = (saveData.shop.totalPurchases || 0) + 1;
    slot.soldOut = true;

    var result = { ok: true, msg: 'Purchased ' + item.name + '!', item: item };

    if (eff.type === 'buff') {
      if (!saveData.activeBuffs) saveData.activeBuffs = {};
      var expiry = eff.duration === 'run' ? -1 : Date.now() + eff.duration;
      saveData.activeBuffs[eff.stat] = { value: eff.value, expiry: expiry };
    } else if (eff.type === 'gem') {
      if (window.GameGems) {
        var gem = window.GameGems.addRandomGem(saveData, eff.tier);
        result.gem = gem;
      }
    } else if (eff.type === 'gemDust') {
      if (!saveData.gems) saveData.gems = window.GameGems ? window.GameGems.getGemsDefaults() : { inventory: [], gemDust: 0, totalGemsFound: 0, totalGemsFused: 0, totalGemsMelted: 0 };
      saveData.gems.gemDust = (saveData.gems.gemDust || 0) + eff.amount;
    } else if (eff.type === 'addSocket') {
      result.msg = 'Purchased ' + item.name + '! (Feature coming soon)';
    } else if (eff.type === 'rerollStat' || eff.type === 'rerollSocket') {
      result.msg = 'Purchased ' + item.name + '! (Feature coming soon)';
    }

    return result;
  }

  function renderShopPanel(saveData, container) {
    if (!saveData.shop) saveData.shop = getShopDefaults();
    if (shouldRefreshShop(saveData)) refreshStock(saveData);
    var stock = saveData.shop.stock;
    var gold = saveData.gold || 0;
    var html = '<div class="shop-panel">';
    html += '<div class="shop-header"><h3>🏪 Merchant Shop</h3>';
    html += '<span class="shop-gold">💰 ' + gold + ' gold</span></div>';
    html += '<div class="shop-grid">';
    stock.forEach(function (slot, idx) {
      var item = SHOP_ITEMS.find(function (x) { return x.id === slot.itemId; });
      if (!item) return;
      html += '<div class="shop-card' + (slot.featured ? ' shop-featured' : '') + (slot.soldOut ? ' shop-sold' : '') + '" data-idx="' + idx + '" style="user-select:none;cursor:pointer;">';
      if (slot.featured) html += '<span class="shop-featured-badge">⭐ Featured</span>';
      html += '<span class="shop-item-icon">' + item.icon + '</span>';
      html += '<div class="shop-item-name">' + item.name + '</div>';
      html += '<div class="shop-item-desc">' + item.desc + '</div>';
      html += '<div class="shop-item-price">' + (slot.featured ? '<s>' + item.price + '</s> ' : '') + slot.price + ' 💰</div>';
      if (!slot.soldOut) html += '<div style="font-size:10px;color:#888;margin-top:3px;">Tap to preview · Hold to buy</div>';
      html += '<button class="shop-buy-btn" data-idx="' + idx + '"' + (slot.soldOut || gold < slot.price ? ' disabled' : '') + '>' + (slot.soldOut ? 'Sold Out' : 'Buy') + '</button>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div class="shop-footer"><small>Stock refreshes daily. Purchases: ' + (saveData.shop.totalPurchases || 0) + ' | Spent: ' + (saveData.shop.totalGoldSpent || 0) + ' gold</small></div>';
    html += '</div>';
    container.innerHTML = html;

    // Wire up shop-buy-btn (explicit button click always buys)
    container.querySelectorAll('.shop-buy-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute('data-idx'));
        var res = buyItem(idx, saveData);
        if (res.ok) renderShopPanel(saveData, container);
        else alert(res.msg);
      });
    });

    // Attach fast-click (preview) + long-press (buy) to shop cards
    container.querySelectorAll('.shop-card[data-idx]').forEach(function (card) {
      var idx = parseInt(card.getAttribute('data-idx'));
      var slot = stock[idx];
      if (!slot || slot.soldOut) return;
      var item = SHOP_ITEMS.find(function (x) { return x.id === slot.itemId; });
      if (!item) return;
      var canBuy = (saveData.gold || 0) >= slot.price;

      function doPreview() {
        if (typeof window.showItemInfoPanel !== 'function') return;
        var previewRarity;
        if (item.cat === 'special') {
          previewRarity = 'legendary';
        } else if (item.cat === 'gem') {
          previewRarity = 'epic';
        } else {
          previewRarity = 'common';
        }
        window.showItemInfoPanel(
          {
            name: item.name,
            rarity: previewRarity,
            icon: item.icon,
            stats: {},
            description: item.desc,
            requirements: slot.price + ' 💰' + (slot.featured ? '  ⭐ Featured' : '')
          },
          canBuy ? function () {
            var res = buyItem(idx, saveData);
            if (res.ok) renderShopPanel(saveData, container);
            else alert(res.msg);
          } : null,
          { equipLabel: '💰 Buy', hint: 'Long press card to buy directly.' }
        );
      }
      function doBuy() {
        if (!canBuy) { doPreview(); return; }
        var res = buyItem(idx, saveData);
        if (res.ok) renderShopPanel(saveData, container);
        else alert(res.msg);
      }

      if (typeof window.attachPressHandler === 'function') {
        window.attachPressHandler(card, doPreview, doBuy);
      } else {
        card.addEventListener('click', doPreview);
      }
    });
  }

  return {
    SHOP_ITEMS: SHOP_ITEMS,
    getShopDefaults: getShopDefaults,
    shouldRefreshShop: shouldRefreshShop,
    refreshStock: refreshStock,
    buyItem: buyItem,
    renderShopPanel: renderShopPanel
  };
})();
