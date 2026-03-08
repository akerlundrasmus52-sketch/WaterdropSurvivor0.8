// js/gem-system.js — Prism Reliquary Gem System
// Raw Gems (currency) + Cut Gems (slottable items) + Gear Slotting mechanic
// Depends on: save-system.js (saveData, saveSaveData)

(function () {
  'use strict';

  // ── Gem Types ───────────────────────────────────────────────────
  const GEM_TYPES = {
    ruby: {
      name: 'Ruby',
      icon: '🔴',
      color: '#ff4444',
      glowColor: '#ff8866',
      description: 'Enhances raw destructive power',
      stats: {
        // per rarity index (0=common, 1=uncommon, 2=rare, 3=epic, 4=legendary, 5=mythic)
        flatDamage:  [2,  4,  8,  15, 25, 40],
        critDamage:  [3,  6, 12,  22, 38, 60]
      }
    },
    sapphire: {
      name: 'Sapphire',
      icon: '🔵',
      color: '#4488ff',
      glowColor: '#88aaff',
      description: 'Channels water and frost energy',
      stats: {
        knockback:   [0.05, 0.10, 0.18, 0.30, 0.50, 0.80],
        slowEffect:  [0.03, 0.06, 0.12, 0.20, 0.35, 0.55]
      }
    },
    emerald: {
      name: 'Emerald',
      icon: '🟢',
      color: '#22cc66',
      glowColor: '#66ff99',
      description: 'Pulses with life and resilience',
      stats: {
        hpRegen:        [0.5, 1.0, 2.0,  4.0,  7.0, 12.0],
        surfaceTension: [2,   4,   8,   15,   25,   40]
      }
    },
    void: {
      name: 'Void Crystal',
      icon: '🟣',
      color: '#aa44ff',
      glowColor: '#cc88ff',
      description: 'Alien energy from beyond the veil',
      stats: {
        fireRate:        [0.03, 0.06, 0.12, 0.20, 0.35, 0.55],
        companionDamage: [0.03, 0.06, 0.12, 0.22, 0.40, 0.65]
      }
    },
    corruptedSource: {
      name: 'Corrupted Source Code',
      icon: '💀',
      color: '#ff00ff',
      glowColor: '#ff66ff',
      description: 'Reality-breaking code fragment dropped by The Source Glitch. Slot into a weapon for a 1% chance on hit to instantly delete a non-boss enemy — no death, no blood, just gone.',
      stats: {
        // The actual effect (1% instant-delete) is handled in projectile-classes.js via _weaponHasGemType.
        // Provide a minor flat damage bonus so it shows something in the stat panel.
        flatDamage: [0, 0, 0, 0, 0, 0, 1]  // 7 entries (corrupted rarity = index 6)
      }
    }
  };

  // ── Cut Gem Rarities ────────────────────────────────────────────
  const CUT_GEM_RARITIES = [
    { id: 'common',    name: 'Common',    color: '#aaaaaa', multiplier: 1.0, border: '#888888' },
    { id: 'uncommon',  name: 'Uncommon',  color: '#44ff66', multiplier: 1.5, border: '#22cc44' },
    { id: 'rare',      name: 'Rare',      color: '#5dade2', multiplier: 2.0, border: '#2e86c1' },
    { id: 'epic',      name: 'Epic',      color: '#aa44ff', multiplier: 2.8, border: '#7700cc' },
    { id: 'legendary', name: 'Legendary', color: '#f39c12', multiplier: 4.0, border: '#cc6600' },
    { id: 'mythic',    name: 'Mythic',    color: '#ff4444', multiplier: 6.0, border: '#cc0000' },
    { id: 'corrupted', name: 'Corrupted', color: '#ff00ff', multiplier: 10.0, border: '#cc00cc' }
  ];

  // ── Gem Slots per Weapon ─────────────────────────────────────────
  // Assign slot count based on weapon ID tiers
  const WEAPON_SLOT_COUNTS = {
    // 1-slot weapons (basic)
    gun: 1, aura: 1, shuriken: 1, boomerang: 1,
    // 2-slot weapons (mid tier)
    sword: 2, uzi: 2, bow: 2, droneTurret: 2,
    lightning: 2, poison: 2, nanoSwarm: 2, iceSpear: 2,
    // 3-slot weapons (high tier)
    samuraiSword: 3, whip: 3, sniperRifle: 3, pumpShotgun: 3,
    autoShotgun: 3, minigun: 3, teslaSaber: 3, doubleBarrel: 3,
    homingMissile: 3, meteor: 3, fireRing: 3
  };

  const COMPANION_SLOT_COUNTS = {
    greyAlien: 2, stormWolf: 2, skyFalcon: 3, waterSpirit: 3
  };

  // ── Unique gem ID counter ────────────────────────────────────────
  let _gemIdCounter = 0;
  function _newGemId() {
    return 'cg_' + Date.now() + '_' + (++_gemIdCounter);
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Add raw gems to the player's currency.
   * @param {string} type - 'ruby'|'sapphire'|'emerald'|'void'
   * @param {number} amount
   */
  function addRawGem(type, amount) {
    if (!saveData.rawGems) saveData.rawGems = { ruby: 0, sapphire: 0, emerald: 0, void: 0 };
    if (GEM_TYPES[type] === undefined) return;
    saveData.rawGems[type] = (saveData.rawGems[type] || 0) + (amount || 1);
    saveSaveData();
    // Show a slide-in resource toast
    const def = GEM_TYPES[type];
    if (def && typeof window.showResourceToast === 'function') {
      window.showResourceToast(`${def.icon} +${amount || 1} Raw ${def.name}`, def.color || '#cc88ff');
    }
    // Quest35: The Crystallized Tear — collect 5 total raw gems
    const totalRawGems = Object.values(saveData.rawGems).reduce((a, b) => a + b, 0);
    if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest35_crystallizedTear') {
      if (totalRawGems >= 5) {
        if (typeof progressTutorialQuest === 'function') {
          progressTutorialQuest('quest35_crystallizedTear', true);
          saveSaveData();
        }
      }
    }
  }

  /**
   * Add a cut gem to inventory.
   * @param {string} type - ruby|sapphire|emerald|void
   * @param {string} rarity - common|uncommon|rare|epic|legendary|mythic
   * @returns {object} the created gem
   */
  function addCutGem(type, rarity) {
    if (!saveData.cutGems) saveData.cutGems = [];
    const gem = {
      id: _newGemId(),
      type,
      rarity,
      slottedIn: null, // { itemType: 'weapon'|'companion', itemId: string, slotIndex: number }
    };
    saveData.cutGems.push(gem);
    saveSaveData();
    return gem;
  }

  /**
   * Get the number of gem slots for a weapon.
   */
  function getWeaponSlotCount(weaponId) {
    return WEAPON_SLOT_COUNTS[weaponId] || 1;
  }

  /**
   * Get the number of gem slots for a companion.
   */
  function getCompanionSlotCount(companionId) {
    return COMPANION_SLOT_COUNTS[companionId] || 1;
  }

  /**
   * Get gem slots array for a weapon or companion.
   * Returns array of (gemId|null) of length = slot count.
   */
  function getSlots(itemType, itemId) {
    if (!saveData.weaponGemSlots) saveData.weaponGemSlots = {};
    if (!saveData.companionGemSlots) saveData.companionGemSlots = {};
    const store = itemType === 'companion' ? saveData.companionGemSlots : saveData.weaponGemSlots;
    const count = itemType === 'companion' ? getCompanionSlotCount(itemId) : getWeaponSlotCount(itemId);
    if (!store[itemId]) {
      store[itemId] = Array(count).fill(null);
    } else if (store[itemId].length < count) {
      // Ensure correct length
      while (store[itemId].length < count) store[itemId].push(null);
    }
    return store[itemId];
  }

  /**
   * Slot a cut gem into a weapon or companion slot.
   * Returns true on success, false on failure.
   */
  function slotGem(gemId, itemType, itemId, slotIndex) {
    if (!saveData.cutGems) return false;
    const gem = saveData.cutGems.find(g => g.id === gemId);
    if (!gem || gem.slottedIn) return false; // gem already slotted

    const slots = getSlots(itemType, itemId);
    if (slotIndex < 0 || slotIndex >= slots.length) return false;
    if (slots[slotIndex] !== null) return false; // slot occupied

    slots[slotIndex] = gemId;
    gem.slottedIn = { itemType, itemId, slotIndex };
    saveSaveData();
    return true;
  }

  /**
   * Remove a gem from its slot.
   * Returns the gem on success, null on failure.
   */
  function unslotGem(gemId) {
    if (!saveData.cutGems) return null;
    const gem = saveData.cutGems.find(g => g.id === gemId);
    if (!gem || !gem.slottedIn) return null;

    const { itemType, itemId, slotIndex } = gem.slottedIn;
    const store = itemType === 'companion' ? saveData.companionGemSlots : saveData.weaponGemSlots;
    if (store && store[itemId]) {
      store[itemId][slotIndex] = null;
    }
    gem.slottedIn = null;
    saveSaveData();
    return gem;
  }

  /**
   * Get rarity index (0-5) from rarity id string.
   */
  function getRarityIndex(rarityId) {
    return CUT_GEM_RARITIES.findIndex(r => r.id === rarityId);
  }

  /**
   * Compute all stat bonuses from slotted gems on a given item.
   * Returns a flat object: { flatDamage, critDamage, knockback, ... }
   */
  function computeGemBonuses(itemType, itemId) {
    const bonuses = {};
    const slots = getSlots(itemType, itemId);
    if (!saveData.cutGems) return bonuses;

    for (const gemId of slots) {
      if (!gemId) continue;
      const gem = saveData.cutGems.find(g => g.id === gemId);
      if (!gem) continue;
      const typeDef = GEM_TYPES[gem.type];
      if (!typeDef) continue;
      const rarIdx = getRarityIndex(gem.rarity);
      if (rarIdx < 0) continue;
      for (const [stat, values] of Object.entries(typeDef.stats)) {
        bonuses[stat] = (bonuses[stat] || 0) + values[rarIdx];
      }
    }
    return bonuses;
  }

  /**
   * Get total gem bonuses across ALL equipped weapons.
   * Used by combat system to apply to playerStats.
   */
  function getTotalWeaponGemBonuses() {
    const total = {};
    if (!saveData.equippedGear) return total;
    const weaponId = saveData.equippedGear.weapon;
    if (weaponId) {
      const b = computeGemBonuses('weapon', weaponId);
      for (const [k, v] of Object.entries(b)) {
        total[k] = (total[k] || 0) + v;
      }
    }
    return total;
  }

  /**
   * Get total gem bonuses from the equipped companion.
   */
  function getTotalCompanionGemBonuses() {
    const total = {};
    if (!saveData.selectedCompanion) return total;
    const b = computeGemBonuses('companion', saveData.selectedCompanion);
    for (const [k, v] of Object.entries(b)) {
      total[k] = (total[k] || 0) + v;
    }
    return total;
  }

  /**
   * Get unslotted cut gems (available to slot).
   */
  function getUnslottedGems() {
    if (!saveData.cutGems) return [];
    return saveData.cutGems.filter(g => !g.slottedIn);
  }

  /**
   * Get a gem definition for rendering.
   */
  function getGemTypeDef(type) {
    return GEM_TYPES[type] || null;
  }

  function getCutGemRarities() {
    return CUT_GEM_RARITIES;
  }

  function getAllGemTypes() {
    return GEM_TYPES;
  }

  // ── Chest Drop Tables ────────────────────────────────────────────
  // Used by the Gacha Store to determine what a chest contains.

  const CHEST_TIERS = {
    wooden: {
      name: 'Wooden Chest',
      icon: '📦',
      emoji: '🪵',
      color: '#8B6914',
      glowColor: '#c8a248',
      border: '#a07830',
      cost: { type: 'gold', amount: 50 },
      description: 'Common resources and basic weapons',
      dropTable: [
        { type: 'gold',    weight: 40, min: 20, max: 80 },
        { type: 'resource', weight: 35, resources: ['wood', 'stone', 'coal', 'iron'], min: 3, max: 12 },
        { type: 'cutGem',  weight: 15, gemType: ['ruby','sapphire','emerald','void'], rarity: 'common' },
        { type: 'rawGem',  weight: 10, gemType: ['ruby','sapphire'], min: 1, max: 2 }
      ],
      dropCount: [2, 3]
    },
    iron: {
      name: 'Iron Chest',
      icon: '🔩',
      emoji: '⚙️',
      color: '#5588aa',
      glowColor: '#88ccff',
      border: '#4477aa',
      cost: { type: 'magicEssence', amount: 25 },
      description: 'Rare materials, rare weapons, common gems',
      dropTable: [
        { type: 'gold',    weight: 20, min: 80, max: 250 },
        { type: 'resource', weight: 25, resources: ['crystal', 'magicEssence', 'chitin', 'venom'], min: 5, max: 18 },
        { type: 'cutGem',  weight: 35, gemType: ['ruby','sapphire','emerald','void'], rarity: 'rare' },
        { type: 'rawGem',  weight: 20, gemType: ['ruby','sapphire','emerald','void'], min: 2, max: 5 }
      ],
      dropCount: [3, 4]
    },
    void: {
      name: 'Void Chest',
      icon: '🌌',
      emoji: '🌀',
      color: '#8844cc',
      glowColor: '#cc66ff',
      border: '#6622aa',
      cost: { type: 'rawGems', gemType: 'void', amount: 5 },
      description: 'Epic/Legendary weapons, companions, rare gems',
      dropTable: [
        { type: 'gold',    weight: 15, min: 300, max: 800 },
        { type: 'cutGem',  weight: 40, gemType: ['ruby','sapphire','emerald','void'], rarity: 'epic' },
        { type: 'cutGem',  weight: 25, gemType: ['ruby','sapphire','emerald','void'], rarity: 'legendary' },
        { type: 'rawGem',  weight: 20, gemType: ['ruby','sapphire','emerald','void'], min: 5, max: 10 }
      ],
      dropCount: [3, 4]
    },
    tesseract: {
      name: 'Annunaki Tesseract',
      icon: '🔮',
      emoji: '✨',
      color: '#ff4444',
      glowColor: '#ffcc00',
      border: '#cc2200',
      cost: { type: 'rawGems', gemType: 'void', amount: 25 },
      description: 'Guaranteed Mythic drops and extreme artifacts',
      dropTable: [
        { type: 'gold',    weight: 10, min: 1000, max: 3000 },
        { type: 'cutGem',  weight: 50, gemType: ['ruby','sapphire','emerald','void'], rarity: 'mythic' },
        { type: 'rawGem',  weight: 30, gemType: ['ruby','sapphire','emerald','void'], min: 10, max: 20 },
        { type: 'magicEssence', weight: 10, min: 50, max: 100 }
      ],
      dropCount: [4, 5]
    }
  };

  /**
   * Roll drops for a chest tier and add them to saveData.
   * Returns array of drop result objects for the animation.
   */
  function openChest(tierId) {
    const tier = CHEST_TIERS[tierId];
    if (!tier) return [];

    // Check cost
    if (!canAffordChest(tierId)) return null; // null signals can't afford

    // Deduct cost
    _deductChestCost(tier.cost);

    // Roll drops
    const [minDrops, maxDrops] = tier.dropCount;
    const dropCount = minDrops + Math.floor(Math.random() * (maxDrops - minDrops + 1));
    const drops = [];

    for (let i = 0; i < dropCount; i++) {
      const drop = _rollDrop(tier.dropTable);
      if (drop) drops.push(drop);
    }

    // Apply drops to saveData
    _applyDrops(drops);
    saveSaveData();
    return drops;
  }

  function canAffordChest(tierId) {
    const tier = CHEST_TIERS[tierId];
    if (!tier) return false;
    const cost = tier.cost;
    if (cost.type === 'gold') return (saveData.gold || 0) >= cost.amount;
    if (cost.type === 'magicEssence') return (saveData.resources && saveData.resources.magicEssence >= cost.amount);
    if (cost.type === 'rawGems') return (saveData.rawGems && saveData.rawGems[cost.gemType] >= cost.amount);
    return false;
  }

  function _deductChestCost(cost) {
    if (cost.type === 'gold') saveData.gold = Math.max(0, (saveData.gold || 0) - cost.amount);
    else if (cost.type === 'magicEssence' && saveData.resources) {
      saveData.resources.magicEssence = Math.max(0, (saveData.resources.magicEssence || 0) - cost.amount);
    } else if (cost.type === 'rawGems' && saveData.rawGems) {
      saveData.rawGems[cost.gemType] = Math.max(0, (saveData.rawGems[cost.gemType] || 0) - cost.amount);
    }
  }

  function _rollDrop(table) {
    const totalWeight = table.reduce((s, e) => s + e.weight, 0);
    let rand = Math.random() * totalWeight;
    for (const entry of table) {
      rand -= entry.weight;
      if (rand <= 0) return _resolveDropEntry(entry);
    }
    return _resolveDropEntry(table[0]);
  }

  function _resolveDropEntry(entry) {
    if (entry.type === 'gold') {
      const amount = entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1));
      return { type: 'gold', amount, icon: '🪙', label: amount + ' Gold', rarity: 'common' };
    }
    if (entry.type === 'resource') {
      const res = entry.resources[Math.floor(Math.random() * entry.resources.length)];
      const amount = entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1));
      const icons = { wood:'🪵', stone:'🪨', coal:'⚫', iron:'⚙️', crystal:'💎', magicEssence:'✨', chitin:'🦗', venom:'🧪' };
      return { type: 'resource', resource: res, amount, icon: icons[res] || '📦', label: amount + ' ' + res, rarity: 'common' };
    }
    if (entry.type === 'cutGem') {
      const gemType = entry.gemType[Math.floor(Math.random() * entry.gemType.length)];
      const rDef = CUT_GEM_RARITIES.find(r => r.id === entry.rarity) || CUT_GEM_RARITIES[0];
      const typeDef = GEM_TYPES[gemType];
      return { type: 'cutGem', gemType, rarity: entry.rarity,
               icon: typeDef.icon, label: rDef.name + ' ' + typeDef.name,
               color: rDef.color, border: rDef.border };
    }
    if (entry.type === 'rawGem') {
      const gemType = entry.gemType[Math.floor(Math.random() * entry.gemType.length)];
      const amount = entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1));
      const typeDef = GEM_TYPES[gemType];
      return { type: 'rawGem', gemType, amount, icon: typeDef.icon, label: amount + ' Raw ' + typeDef.name, rarity: 'rare' };
    }
    if (entry.type === 'magicEssence') {
      const amount = entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1));
      return { type: 'magicEssence', amount, icon: '✨', label: amount + ' Magic Essence', rarity: 'uncommon' };
    }
    return null;
  }

  function _applyDrops(drops) {
    for (const drop of drops) {
      if (!drop) continue;
      if (drop.type === 'gold') {
        saveData.gold = (saveData.gold || 0) + drop.amount;
      } else if (drop.type === 'resource') {
        if (!saveData.resources) saveData.resources = {};
        saveData.resources[drop.resource] = (saveData.resources[drop.resource] || 0) + drop.amount;
      } else if (drop.type === 'cutGem') {
        addCutGem(drop.gemType, drop.rarity);
      } else if (drop.type === 'rawGem') {
        addRawGem(drop.gemType, drop.amount);
      } else if (drop.type === 'magicEssence') {
        if (!saveData.resources) saveData.resources = {};
        saveData.resources.magicEssence = (saveData.resources.magicEssence || 0) + drop.amount;
      }
    }
  }

  // ── Expose public API ────────────────────────────────────────────
  window.GemSystem = {
    GEM_TYPES,
    CUT_GEM_RARITIES,
    CHEST_TIERS,
    addRawGem,
    addCutGem,
    slotGem,
    unslotGem,
    getSlots,
    computeGemBonuses,
    getTotalWeaponGemBonuses,
    getTotalCompanionGemBonuses,
    getUnslottedGems,
    getWeaponSlotCount,
    getCompanionSlotCount,
    getGemTypeDef,
    getCutGemRarities,
    getAllGemTypes,
    getRarityIndex,
    openChest,
    canAffordChest,
  };
})();

