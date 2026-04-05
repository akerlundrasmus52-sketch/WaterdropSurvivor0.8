// js/dropplet-shop.js — The Dropplet Shop: sell gear from Vault, buy materials & Waterdrop Energy
// Depends on: saveData, saveSaveData(), showStatChange() — all globals from save-system.js / quest-system.js

(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────

  /** Rarity sell value (gold per item) */
  const SELL_PRICES = {
    common:    5,
    uncommon:  15,
    rare:      40,
    epic:      100,
    legendary: 300,
    mythic:    800,
  };

  /** Materials available to buy (id → { label, icon, price }) */
  const BUY_CATALOG = [
    { id: 'wood',         label: 'Wood',          icon: '🪵', price: 5 },
    { id: 'stone',        label: 'Stone',         icon: '🪨', price: 8 },
    { id: 'iron',         label: 'Iron',          icon: '⚙️',  price: 15 },
    { id: 'coal',         label: 'Coal',          icon: '🔥', price: 10 },
    { id: 'crystal',      label: 'Crystal',       icon: '🔮', price: 30 },
    { id: 'magicEssence', label: 'Magic Essence', icon: '✨', price: 50 },
  ];

  /** Waterdrop Energy buy batches */
  const WDE_BATCHES = [
    { qty: 5,   price: 40  },
    { qty: 15,  price: 100 },
    { qty: 50,  price: 280 },
  ];

  const RARITY_COL = {
    common:    '#aaaaaa',
    uncommon:  '#55cc55',
    rare:      '#44aaff',
    epic:      '#aa44ff',
    legendary: '#ffd700',
    mythic:    '#ff4444',
  };

  // ── Public entry point ────────────────────────────────────────────────────

  function showDroppletShopUI() {
    const campScreen = document.getElementById('camp-screen');
    if (campScreen) campScreen.style.display = 'none';

    const existing = document.getElementById('dropplet-shop-modal');
    if (existing) existing.remove();

    const modal = _buildModal();
    document.body.appendChild(modal);
    _renderTab(modal, 'sell');
  }

  // ── Modal skeleton ────────────────────────────────────────────────────────

  function _buildModal() {
    const modal = document.createElement('div');
    modal.id = 'dropplet-shop-modal';
    modal.className = 'ds-modal';

    modal.innerHTML = `
      <div class="ds-panel">
        <!-- Header -->
        <div class="ds-header">
          <div>
            <div class="ds-title">💧 THE DROPPLET SHOP</div>
            <div class="ds-subtitle">A.I.D.A: "Every piece of gear has a price, soldier."</div>
          </div>
          <button class="ds-back-btn" id="ds-back-btn">← Back</button>
        </div>

        <!-- Currency row -->
        <div class="ds-currency-row" id="ds-currency-row"></div>

        <!-- Tabs -->
        <div class="ds-tabs">
          <button class="ds-tab active" data-tab="sell">⚔️ SELL GEAR</button>
          <button class="ds-tab" data-tab="buy">🛒 BUY MATERIALS</button>
          <button class="ds-tab" data-tab="wde">💧 WATERDROP ENERGY</button>
        </div>

        <!-- Content area -->
        <div class="ds-content" id="ds-content"></div>
      </div>
    `;

    // Back button
    modal.querySelector('#ds-back-btn').addEventListener('click', function () {
      modal.remove();
      const campScreen = document.getElementById('camp-screen');
      if (campScreen) campScreen.style.display = 'flex';
    });

    // Tab switching
    modal.querySelectorAll('.ds-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        modal.querySelectorAll('.ds-tab').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        _renderTab(modal, btn.dataset.tab);
      });
    });

    return modal;
  }

  // ── Currency display ──────────────────────────────────────────────────────

  function _refreshCurrency(modal) {
    const row = modal.querySelector('#ds-currency-row');
    if (!row) return;
    const gold = (window.saveData && saveData.gold) || 0;
    const wde  = (window.saveData && saveData.resources && saveData.resources.waterdropEnergy) || 0;
    row.innerHTML = `
      <span class="ds-cur-item"><span class="ds-cur-icon">🪙</span> <span class="ds-cur-val">${gold}</span> Gold</span>
      <span class="ds-cur-sep">·</span>
      <span class="ds-cur-item ds-wde"><span class="ds-cur-icon">💧</span> <span class="ds-cur-val">${wde}</span> WDE</span>
    `;
  }

  // ── Tab renderers ─────────────────────────────────────────────────────────

  function _renderTab(modal, tab) {
    _refreshCurrency(modal);
    const content = modal.querySelector('#ds-content');
    if (!content) return;
    content.innerHTML = '';
    if      (tab === 'sell') _renderSellTab(modal, content);
    else if (tab === 'buy')  _renderBuyTab(modal, content);
    else if (tab === 'wde')  _renderWdeTab(modal, content);
  }

  // ── SELL TAB ─────────────────────────────────────────────────────────────

  function _renderSellTab(modal, content) {
    const inventory = (window.saveData && saveData.inventory) || [];
    const equippedIds = Object.values((window.saveData && saveData.equippedGear) || {}).filter(Boolean);

    if (inventory.length === 0) {
      content.innerHTML = `<div class="ds-empty">Your Vault is empty.<br><span style="color:#666;font-size:11px;">Gear drops from enemies, bosses, and expeditions.</span></div>`;
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'ds-sell-grid';

    inventory.forEach(function (item, idx) {
      const isEquipped = equippedIds.includes(item.id);
      const price = SELL_PRICES[item.rarity] || 5;
      const col = RARITY_COL[item.rarity] || '#aaa';

      const card = document.createElement('div');
      card.className = 'ds-item-card' + (isEquipped ? ' ds-item-equipped' : '');
      card.style.borderColor = col;
      card.innerHTML = `
        <div class="ds-item-icon">${item.icon || '⚔️'}</div>
        <div class="ds-item-info">
          <div class="ds-item-name" style="color:${col}">${item.name || 'Unknown Item'}</div>
          <div class="ds-item-rarity">${(item.rarity || 'common').toUpperCase()}</div>
          ${isEquipped ? '<div class="ds-item-equipped-tag">✅ Equipped</div>' : ''}
        </div>
        <div class="ds-item-sell">
          <div class="ds-sell-price">🪙 ${price}</div>
          ${isEquipped
            ? '<div class="ds-sell-disabled">Unequip first</div>'
            : `<button class="ds-sell-btn" data-idx="${idx}" data-price="${price}">SELL</button>`}
        </div>
      `;
      grid.appendChild(card);
    });

    content.appendChild(grid);

    // Wire sell buttons
    grid.querySelectorAll('.ds-sell-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const idx   = parseInt(btn.dataset.idx, 10);
        const price = parseInt(btn.dataset.price, 10);
        _sellItem(modal, idx, price);
      });
    });
  }

  function _sellItem(modal, idx, price) {
    const inventory = (window.saveData && saveData.inventory) || [];
    if (idx < 0 || idx >= inventory.length) return;
    const item = inventory[idx];
    saveData.inventory.splice(idx, 1);
    saveData.gold = (saveData.gold || 0) + price;
    if (typeof saveSaveData === 'function') saveSaveData();
    if (typeof showStatChange === 'function') showStatChange(`🪙 Sold ${item.name || 'item'} for ${price} Gold`);
    _renderTab(modal, 'sell');
  }

  // ── BUY MATERIALS TAB ────────────────────────────────────────────────────

  function _renderBuyTab(modal, content) {
    const grid = document.createElement('div');
    grid.className = 'ds-buy-grid';

    BUY_CATALOG.forEach(function (entry) {
      const owned = (saveData.resources && saveData.resources[entry.id]) || 0;
      const card = document.createElement('div');
      card.className = 'ds-mat-card';
      card.innerHTML = `
        <div class="ds-mat-icon">${entry.icon}</div>
        <div class="ds-mat-info">
          <div class="ds-mat-name">${entry.label}</div>
          <div class="ds-mat-owned">Owned: ${owned}</div>
        </div>
        <div class="ds-mat-action">
          <div class="ds-mat-price">🪙 ${entry.price}</div>
          <div class="ds-mat-qty-row">
            <button class="ds-mat-buy" data-id="${entry.id}" data-price="${entry.price}" data-qty="1">×1</button>
            <button class="ds-mat-buy" data-id="${entry.id}" data-price="${entry.price}" data-qty="5">×5</button>
            <button class="ds-mat-buy" data-id="${entry.id}" data-price="${entry.price}" data-qty="10">×10</button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });

    content.appendChild(grid);

    grid.querySelectorAll('.ds-mat-buy').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id    = btn.dataset.id;
        const price = parseInt(btn.dataset.price, 10);
        const qty   = parseInt(btn.dataset.qty, 10);
        _buyMaterial(modal, id, price, qty);
      });
    });
  }

  function _buyMaterial(modal, id, priceEach, qty) {
    const total = priceEach * qty;
    if ((saveData.gold || 0) < total) {
      if (typeof showStatChange === 'function') showStatChange(`❌ Need ${total} 🪙 Gold`);
      return;
    }
    saveData.gold -= total;
    if (!saveData.resources) saveData.resources = {};
    saveData.resources[id] = (saveData.resources[id] || 0) + qty;
    if (typeof saveSaveData === 'function') saveSaveData();
    const label = BUY_CATALOG.find(function (e) { return e.id === id; });
    if (typeof showStatChange === 'function') showStatChange(`🛒 Bought ×${qty} ${label ? label.label : id} for ${total} Gold`);
    _renderTab(modal, 'buy');
  }

  // ── WATERDROP ENERGY TAB ─────────────────────────────────────────────────

  function _renderWdeTab(modal, content) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ds-wde-wrap';

    const hero = document.createElement('div');
    hero.className = 'ds-wde-hero';
    hero.innerHTML = `
      <div class="ds-wde-hero-icon">💧</div>
      <div class="ds-wde-hero-title">WATERDROP ENERGY</div>
      <div class="ds-wde-hero-desc">
        Compressed liquid intelligence — harvested from Nibiru's core.<br>
        Used to power the <b>Artifact Resonance Grid</b> merge experiments.
      </div>
    `;
    wrapper.appendChild(hero);

    const batchGrid = document.createElement('div');
    batchGrid.className = 'ds-wde-grid';

    WDE_BATCHES.forEach(function (batch) {
      const card = document.createElement('div');
      card.className = 'ds-wde-card';
      card.innerHTML = `
        <div class="ds-wde-qty">💧 ${batch.qty} WDE</div>
        <div class="ds-wde-price">🪙 ${batch.price} Gold</div>
        <button class="ds-wde-btn" data-qty="${batch.qty}" data-price="${batch.price}">PURCHASE</button>
      `;
      batchGrid.appendChild(card);
    });

    wrapper.appendChild(batchGrid);
    content.appendChild(wrapper);

    batchGrid.querySelectorAll('.ds-wde-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const qty   = parseInt(btn.dataset.qty, 10);
        const price = parseInt(btn.dataset.price, 10);
        _buyWde(modal, qty, price);
      });
    });
  }

  function _buyWde(modal, qty, price) {
    if ((saveData.gold || 0) < price) {
      if (typeof showStatChange === 'function') showStatChange(`❌ Need ${price} 🪙 Gold for ${qty} WDE`);
      return;
    }
    saveData.gold -= price;
    if (!saveData.resources) saveData.resources = {};
    saveData.resources.waterdropEnergy = (saveData.resources.waterdropEnergy || 0) + qty;
    if (typeof saveSaveData === 'function') saveSaveData();
    if (typeof showStatChange === 'function') showStatChange(`💧 Purchased ${qty} Waterdrop Energy!`);
    _renderTab(modal, 'wde');
  }

  // ── Expose globally ───────────────────────────────────────────────────────

  window.showDroppletShopUI = showDroppletShopUI;

}());
