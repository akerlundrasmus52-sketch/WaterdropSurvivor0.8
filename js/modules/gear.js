// js/modules/gear.js
// Gear/equipment system and lore database
    import { gs, gameSettings, playerStats } from './state.js';
    import { saveSaveData } from './save.js';
    import { playSound } from './audio.js';

    // --- GEAR SYSTEM ---
    const GEAR_ATTRIBUTES = {
      flexibility: { name: 'Flexibility', icon: '🤸', color: '#9B59B6' },
      movementSpeed: { name: 'Movement Speed', icon: '💨', color: '#3498DB' },
      attackSpeed: { name: 'Attack Speed', icon: '⚡', color: '#F39C12' },
      attackPrecision: { name: 'Attack Precision', icon: '🎯', color: '#E74C3C' },
      critChance: { name: 'Crit Chance', icon: '✨', color: '#E67E22' },
      elementalMagic: { name: 'Elemental Magic', icon: '🔮', color: '#8E44AD' }
    };

    // Phase 1: Define starter gear for all 6 slots
    const STARTER_GEAR = [
      {
        id: 'starter_weapon',
        name: 'Worn Sword',
        type: 'weapon',
        rarity: 'common',
        stats: { attackSpeed: 1, attackPrecision: 1 },
        description: 'A basic weapon'
      },
      {
        id: 'starter_armor',
        name: 'Leather Vest',
        type: 'armor',
        rarity: 'common',
        stats: { flexibility: 2, movementSpeed: 1 },
        description: 'Basic protection'
      },
      {
        id: 'starter_helmet',
        name: 'Cloth Cap',
        type: 'helmet',
        rarity: 'common',
        stats: { flexibility: 1 },
        description: 'Simple head covering'
      },
      {
        id: 'starter_boots',
        name: 'Worn Boots',
        type: 'boots',
        rarity: 'common',
        stats: { movementSpeed: 1 },
        description: 'Weathered footwear'
      },
      {
        id: 'starter_ring',
        name: 'Brass Ring',
        type: 'ring',
        rarity: 'common',
        stats: { critChance: 1 },
        description: 'Simple metal band'
      },
      {
        id: 'starter_amulet',
        name: 'Wooden Pendant',
        type: 'amulet',
        rarity: 'common',
        stats: { elementalMagic: 1 },
        description: 'Carved charm'
      }
    ];

    // Additional gear that can be obtained (for future expansion)
    const GEAR_POOL = [
      {
        id: 'blazing_sword',
        name: 'Blazing Sword',
        type: 'weapon',
        rarity: 'rare',
        stats: { attackSpeed: 2, attackPrecision: 2, elementalMagic: 1 },
        description: 'A sword wreathed in flames'
      },
      {
        id: 'frost_blade',
        name: 'Frost Blade',
        type: 'weapon',
        rarity: 'epic',
        stats: { attackSpeed: 3, attackPrecision: 3, elementalMagic: 2 },
        description: 'Freezes gs.enemies on hit'
      },
      {
        id: 'shadow_cloak',
        name: 'Shadow Cloak',
        type: 'armor',
        rarity: 'rare',
        stats: { flexibility: 3, movementSpeed: 2 },
        description: 'Move like a shadow'
      },
      {
        id: 'dragon_plate',
        name: 'Dragon Plate',
        type: 'armor',
        rarity: 'legendary',
        stats: { flexibility: 2, movementSpeed: 1, attackPrecision: 2 },
        description: 'Forged from dragon scales'
      },
      // Phase 1: Helmets
      {
        id: 'iron_helmet',
        name: 'Iron Helmet',
        type: 'helmet',
        rarity: 'uncommon',
        stats: { flexibility: 2 },
        description: 'Sturdy head protection'
      },
      {
        id: 'crown_of_wisdom',
        name: 'Crown of Wisdom',
        type: 'helmet',
        rarity: 'epic',
        stats: { flexibility: 2, elementalMagic: 2 },
        description: 'Enhances magical abilities'
      },
      // Phase 1: Boots
      {
        id: 'speed_boots',
        name: 'Winged Boots',
        type: 'boots',
        rarity: 'epic',
        stats: { movementSpeed: 4, flexibility: 1 },
        description: 'Swift as the wind'
      },
      {
        id: 'shadow_steps',
        name: 'Shadow Steps',
        type: 'boots',
        rarity: 'rare',
        stats: { movementSpeed: 3 },
        description: 'Silent and swift'
      },
      // Phase 1: Rings
      {
        id: 'crit_ring',
        name: 'Ring of Critical Strikes',
        type: 'ring',
        rarity: 'rare',
        stats: { critChance: 3, attackPrecision: 1 },
        description: 'Increases critical hit chance'
      },
      {
        id: 'power_ring',
        name: 'Ring of Power',
        type: 'ring',
        rarity: 'legendary',
        stats: { attackSpeed: 2, attackPrecision: 2, critChance: 1 },
        description: 'Overwhelming offensive power'
      },
      // Phase 1: Amulets
      {
        id: 'magic_amulet',
        name: 'Arcane Amulet',
        type: 'amulet',
        rarity: 'legendary',
        stats: { elementalMagic: 4, attackSpeed: 2 },
        description: 'Channels magical energy'
      },
      {
        id: 'life_amulet',
        name: 'Amulet of Life',
        type: 'amulet',
        rarity: 'epic',
        stats: { flexibility: 3, elementalMagic: 1 },
        description: 'Grants vitality and resilience'
      }
    ];

    function initializeGear() {
      // Phase 1: Give players starter gear for all 6 slots if they don't have any
      if (!gs.saveData.inventory || gs.saveData.inventory.length === 0) {
        gs.saveData.inventory = [...STARTER_GEAR];
        
        // Auto-equip all 6 starter items
        gs.saveData.equippedGear.weapon = 'starter_weapon';
        gs.saveData.equippedGear.armor = 'starter_armor';
        gs.saveData.equippedGear.helmet = 'starter_helmet';
        gs.saveData.equippedGear.boots = 'starter_boots';
        gs.saveData.equippedGear.ring = 'starter_ring';
        gs.saveData.equippedGear.amulet = 'starter_amulet';
        
        saveSaveData();
      }
    }

    function updateGearScreen() {
      const content = document.getElementById('gear-content');
      const statsContent = document.getElementById('gear-stats-content');
      
      if (!content || !statsContent) return;
      
      // Calculate total gear bonuses
      const gearStats = calculateGearStats();
      
      // Update stats display
      let statsHtml = '';
      for (const statKey in GEAR_ATTRIBUTES) {
        const stat = GEAR_ATTRIBUTES[statKey];
        const value = gearStats[statKey] || 0;
        statsHtml += `
          <div style="display: flex; align-items: center; gap: 10px; padding: 5px;">
            <span style="font-size: 24px;">${stat.icon}</span>
            <div>
              <div style="color: ${stat.color}; font-size: 14px; font-weight: bold;">${stat.name}</div>
              <div style="color: #FFD700; font-size: 16px; font-weight: bold;">+${value}</div>
            </div>
          </div>
        `;
      }
      statsContent.innerHTML = statsHtml;
      
      // Phase 1: Build gear slots display for all 6 slots
      let html = '';
      
      const slots = [
        { key: 'weapon', name: 'Weapon', icon: '⚔️' },
        { key: 'armor', name: 'Armor', icon: '🛡️' },
        { key: 'helmet', name: 'Helmet', icon: '⛑️' },
        { key: 'boots', name: 'Boots', icon: '👢' },
        { key: 'ring', name: 'Ring', icon: '💍' },
        { key: 'amulet', name: 'Amulet', icon: '📿' }
      ];
      
      for (const slot of slots) {
        const equippedId = gs.saveData.equippedGear[slot.key];
        const equippedGear = equippedId ? gs.saveData.inventory.find(g => g.id === equippedId) : null;
        
        html += `
          <div style="background: linear-gradient(to bottom, #2a3a4a, #1a2a3a); border: 3px solid #F39C12; border-radius: 15px; padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 32px;">${slot.icon}</span>
                <div style="color: #F39C12; font-size: 20px; font-weight: bold;">${slot.name}</div>
              </div>
            </div>
            ${equippedGear ? `
              <div style="background: rgba(0,0,0,0.3); border: 2px solid ${getRarityColor(equippedGear.rarity)}; border-radius: 10px; padding: 15px;">
                <div style="color: ${getRarityColor(equippedGear.rarity)}; font-size: 18px; font-weight: bold; margin-bottom: 5px;">
                  ${equippedGear.name}
                </div>
                <div style="color: #aaa; font-size: 13px; margin-bottom: 10px;">${equippedGear.description}</div>
                <div style="margin-bottom: 10px;">
                  ${Object.entries(equippedGear.stats).map(([stat, val]) => GEAR_ATTRIBUTES[stat] ? `
                    <div style="color: #90ee90; font-size: 13px;">• ${GEAR_ATTRIBUTES[stat].name}: +${val}</div>
                  ` : '').join('')}
                </div>
                <button onclick="unequipGear('${slot.key}')" style="padding: 8px 15px; background: linear-gradient(to bottom, #c0392b, #a93226); color: white; border: 2px solid #e74c3c; border-radius: 8px; cursor: pointer; font-weight: bold;">UNEQUIP</button>
              </div>
            ` : `
              <div style="color: #777; font-size: 14px; text-align: center; padding: 20px;">
                Empty Slot
              </div>
            `}
            <div style="margin-top: 15px;">
              <div style="color: #5DADE2; font-size: 16px; font-weight: bold; margin-bottom: 10px;">Available Gear:</div>
              <div style="display: grid; gap: 10px; max-height: 200px; overflow-y: auto;">
                ${gs.saveData.inventory.filter(g => {
                  const gearType = g.type === 'accessory' ? (slot.key === 'accessory1' || slot.key === 'accessory2') : g.type === slot.key;
                  const notEquipped = g.id !== equippedId;
                  return gearType && notEquipped;
                }).map(gear => `
                  <div style="background: rgba(0,0,0,0.4); border: 2px solid ${getRarityColor(gear.rarity)}; border-radius: 8px; padding: 10px; cursor: pointer;" onclick="equipGear('${slot.key}', '${gear.id}')">
                    <div style="color: ${getRarityColor(gear.rarity)}; font-size: 14px; font-weight: bold;">${gear.name}</div>
                    <div style="color: #999; font-size: 11px;">${gear.description}</div>
                    <div style="margin-top: 5px;">
                      ${Object.entries(gear.stats).map(([stat, val]) => GEAR_ATTRIBUTES[stat] ? `
                        <span style="color: #90ee90; font-size: 11px; margin-right: 10px;">+${val} ${GEAR_ATTRIBUTES[stat].icon}</span>
                      ` : '').join('')}
                    </div>
                  </div>
                `).join('') || '<div style="color: #777; font-size: 12px; padding: 10px;">No available gear for this slot</div>'}
              </div>
            </div>
          </div>
        `;
      }
      
      content.innerHTML = html;
    }

    function getRarityColor(rarity) {
      const colors = {
        common: '#AAAAAA',
        uncommon: '#00FF00',
        rare: '#5DADE2',
        epic: '#9B59B6',
        legendary: '#F39C12',
        mythic: '#E74C3C'
      };
      return colors[rarity] || colors.common;
    }
    
    // Phase 1: Gear drop system - procedurally generate gear with rarity tiers
    function generateRandomGear() {
      // Rarity chances: common 50%, uncommon 25%, rare 15%, epic 8%, legendary 2%
      const rarityRoll = Math.random();
      let rarity;
      if (rarityRoll < 0.50) rarity = 'common';
      else if (rarityRoll < 0.75) rarity = 'uncommon';
      else if (rarityRoll < 0.90) rarity = 'rare';
      else if (rarityRoll < 0.98) rarity = 'epic';
      else rarity = 'legendary';
      
      // Choose random gear type from all 6 slots
      const types = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'amulet'];
      const type = types[Math.floor(Math.random() * types.length)];
      
      // Base stats by rarity
      const rarityStatMult = {
        common: 1,
        uncommon: 1.5,
        rare: 2,
        epic: 3,
        legendary: 4
      };
      const mult = rarityStatMult[rarity];
      
      // Generate random stats (1-3 random attributes)
      const statCount = Math.floor(Math.random() * 3) + 1;
      const stats = {};
      const availableStats = Object.keys(GEAR_ATTRIBUTES);
      const chosenStats = [];
      
      for (let i = 0; i < statCount; i++) {
        const stat = availableStats[Math.floor(Math.random() * availableStats.length)];
        if (!chosenStats.includes(stat)) {
          chosenStats.push(stat);
          stats[stat] = Math.floor((Math.random() * 2 + 1) * mult);
        }
      }
      
      // Generate unique ID
      const id = `gear_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      
      // Generate name
      const prefixes = ['Worn', 'Simple', 'Fine', 'Superior', 'Masterwork', 'Legendary'];
      const typeNames = {
        weapon: ['Blade', 'Sword', 'Axe', 'Dagger', 'Mace'],
        armor: ['Vest', 'Plate', 'Mail', 'Cuirass', 'Armor'],
        helmet: ['Cap', 'Helm', 'Crown', 'Mask', 'Circlet'],
        boots: ['Boots', 'Shoes', 'Greaves', 'Treads', 'Steps'],
        ring: ['Ring', 'Band', 'Loop', 'Circle', 'Hoop'],
        amulet: ['Amulet', 'Pendant', 'Charm', 'Talisman', 'Necklace']
      };
      
      const prefix = prefixes[Math.min(Math.floor(mult), prefixes.length - 1)];
      const typeName = typeNames[type][Math.floor(Math.random() * typeNames[type].length)];
      const name = `${prefix} ${typeName}`;
      
      return {
        id,
        name,
        type,
        rarity,
        stats,
        description: `A ${rarity} ${type}`
      };
    }

    function calculateGearStats() {
      const stats = {};
      
      for (const statKey in GEAR_ATTRIBUTES) {
        stats[statKey] = 0;
      }
      
      // Sum up stats from all equipped gear
      for (const slotKey in gs.saveData.equippedGear) {
        const gearId = gs.saveData.equippedGear[slotKey];
        if (gearId) {
          const gear = gs.saveData.inventory.find(g => g.id === gearId);
          if (gear && gear.stats) {
            for (const statKey in gear.stats) {
              stats[statKey] += gear.stats[statKey];
            }
          }
        }
      }
      
      return stats;
    }

    function equipGear(slotKey, gearId) {
      gs.saveData.equippedGear[slotKey] = gearId;
      playSound('coin');
      saveSaveData();
      updateGearScreen();
      
      // Quest progression: first time equipping gear (legacy)
      if (gs.saveData.storyQuests.currentQuest === 'equipGear') {
        progressQuest('equipGear', true);
      }
      // Quest 4: Equip the Cigar
      if (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.currentQuest === 'quest4_equipCigar') {
        progressTutorialQuest('quest4_equipCigar', true);
      }
    }

    function unequipGear(slotKey) {
      gs.saveData.equippedGear[slotKey] = null;
      playSound('waterdrop');
      saveSaveData();
      updateGearScreen();
    }

    // Expose to global scope for onclick handlers
    window.equipGear = equipGear;
    window.unequipGear = unequipGear;

    // Upgrade definitions for the progression shop
    const PERMANENT_UPGRADES = {
      maxHp: {
        name: 'Max HP',
        description: '+10 HP per level',
        maxLevel: 20,
        baseCost: 50,
        costIncrease: 25,
        effect: (level) => 10 * level
      },
      hpRegen: {
        name: 'HP Regen',
        description: '+0.5 HP/sec per level',
        maxLevel: 10,
        baseCost: 100,
        costIncrease: 50,
        effect: (level) => 0.5 * level
      },
      moveSpeed: {
        name: 'Move Speed',
        description: '+5% per level',
        maxLevel: 10,
        baseCost: 75,
        costIncrease: 25,
        effect: (level) => 0.05 * level
      },
      attackDamage: {
        name: 'Attack Damage',
        description: '+10% per level',
        maxLevel: 15,
        baseCost: 100,
        costIncrease: 50,
        effect: (level) => 0.1 * level
      },
      attackSpeed: {
        name: 'Attack Speed',
        description: '+5% per level',
        maxLevel: 10,
        baseCost: 100,
        costIncrease: 50,
        effect: (level) => 0.05 * level
      },
      critChance: {
        name: 'Crit Chance',
        description: '+2% per level',
        maxLevel: 10,
        baseCost: 150,
        costIncrease: 50,
        effect: (level) => 0.02 * level
      },
      critDamage: {
        name: 'Crit Damage',
        description: '+10% per level',
        maxLevel: 10,
        baseCost: 150,
        costIncrease: 50,
        effect: (level) => 0.1 * level
      },
      armor: {
        name: 'Armor',
        description: '+2 per level',
        maxLevel: 15,
        baseCost: 100,
        costIncrease: 50,
        effect: (level) => 2 * level
      },
      cooldownReduction: {
        name: 'Cooldown Reduction',
        description: '-3% per level',
        maxLevel: 10,
        baseCost: 200,
        costIncrease: 50,
        effect: (level) => 0.03 * level
      },
      goldEarned: {
        name: 'Gold Earned',
        description: '+10% per level',
        maxLevel: 10,
        baseCost: 300,
        costIncrease: 100,
        effect: (level) => 0.1 * level
      },
      expEarned: {
        name: 'EXP Earned',
        description: '+10% per level',
        maxLevel: 10,
        baseCost: 250,
        costIncrease: 100,
        effect: (level) => 0.1 * level
      },
      maxWeapons: {
        name: 'Max Weapons',
        description: '+1 weapon slot',
        maxLevel: 3,
        baseCost: 500,
        costIncrease: 500,
        effect: (level) => level
      }
    };

    function getCost(upgradeKey) {
      const upgrade = PERMANENT_UPGRADES[upgradeKey];
      const currentLevel = gs.saveData.upgrades[upgradeKey];
      return upgrade.baseCost + (currentLevel * upgrade.costIncrease);
    }
    
    export { initializeGear, updateGearScreen, getRarityColor, generateRandomGear, calculateGearStats, equipGear, unequipGear, getCost };
