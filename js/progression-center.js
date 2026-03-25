/*  ─── progression-center.js ───────────────────────────────────────
 *  Progression Center Building UI
 *  Purchase permanent stat upgrades with gold
 *  Features tier-based upgrades with escalating costs
 * ──────────────────────────────────────────────────────────────── */

(function() {
  'use strict';

  // Upgrade definitions with tier system
  const PROGRESSION_UPGRADES = {
    // Health & Survivability
    maxHealth: {
      name: 'Maximum Health',
      icon: '❤️',
      description: 'Increase your maximum HP',
      category: 'health',
      baseCost: 100,
      costMultiplier: 1.5,
      perLevel: 15, // +15 HP per level
      maxLevel: 20,
      color: '#e74c3c'
    },
    healthRegen: {
      name: 'Health Regeneration',
      icon: '💚',
      description: 'Regenerate HP over time',
      category: 'health',
      baseCost: 150,
      costMultiplier: 1.6,
      perLevel: 0.5, // +0.5 HP/sec per level
      maxLevel: 15,
      color: '#2ecc71'
    },
    armor: {
      name: 'Armor',
      icon: '🛡️',
      description: 'Reduce incoming damage',
      category: 'health',
      baseCost: 120,
      costMultiplier: 1.55,
      perLevel: 3, // +3 armor per level
      maxLevel: 20,
      color: '#95a5a6'
    },

    // Damage & Attack
    baseDamage: {
      name: 'Base Damage',
      icon: '⚔️',
      description: 'Increase all weapon damage',
      category: 'damage',
      baseCost: 100,
      costMultiplier: 1.5,
      perLevel: 0.08, // +8% damage per level
      maxLevel: 25,
      color: '#e67e22',
      isPercent: true
    },
    attackSpeed: {
      name: 'Attack Speed',
      icon: '⚡',
      description: 'Attack faster with all weapons',
      category: 'damage',
      baseCost: 150,
      costMultiplier: 1.6,
      perLevel: 0.05, // +5% attack speed per level
      maxLevel: 15,
      color: '#f39c12',
      isPercent: true
    },
    criticalChance: {
      name: 'Critical Chance',
      icon: '🎯',
      description: 'Chance to deal critical hits',
      category: 'damage',
      baseCost: 200,
      costMultiplier: 1.7,
      perLevel: 0.015, // +1.5% crit chance per level
      maxLevel: 15,
      color: '#e74c3c',
      isPercent: true
    },
    criticalDamage: {
      name: 'Critical Damage',
      icon: '💥',
      description: 'Increase critical hit damage',
      category: 'damage',
      baseCost: 180,
      costMultiplier: 1.65,
      perLevel: 0.1, // +10% crit damage per level
      maxLevel: 15,
      color: '#c0392b',
      isPercent: true
    },

    // Speed & Mobility
    moveSpeed: {
      name: 'Movement Speed',
      icon: '💨',
      description: 'Move faster across the map',
      category: 'mobility',
      baseCost: 120,
      costMultiplier: 1.55,
      perLevel: 0.04, // +4% move speed per level
      maxLevel: 15,
      color: '#3498db',
      isPercent: true
    },
    dashCooldown: {
      name: 'Dash Cooldown',
      icon: '🏃',
      description: 'Reduce dash ability cooldown',
      category: 'mobility',
      baseCost: 180,
      costMultiplier: 1.65,
      perLevel: -0.05, // -5% cooldown per level
      maxLevel: 10,
      color: '#9b59b6',
      isPercent: true
    },

    // Utility & Resources
    goldFind: {
      name: 'Gold Find',
      icon: '💰',
      description: 'Increase gold drops from enemies',
      category: 'utility',
      baseCost: 150,
      costMultiplier: 1.6,
      perLevel: 0.1, // +10% gold per level
      maxLevel: 15,
      color: '#f1c40f',
      isPercent: true
    },
    experienceGain: {
      name: 'Experience Gain',
      icon: '📈',
      description: 'Gain experience faster',
      category: 'utility',
      baseCost: 150,
      costMultiplier: 1.6,
      perLevel: 0.08, // +8% XP per level
      maxLevel: 15,
      color: '#3498db',
      isPercent: true
    },
    lifeSteal: {
      name: 'Life Steal',
      icon: '🩸',
      description: 'Heal for % of damage dealt',
      category: 'utility',
      baseCost: 250,
      costMultiplier: 1.8,
      perLevel: 0.02, // +2% life steal per level
      maxLevel: 10,
      color: '#e74c3c',
      isPercent: true
    },
    pickupRange: {
      name: 'Pickup Range',
      icon: '🧲',
      description: 'Collect items from further away',
      category: 'utility',
      baseCost: 100,
      costMultiplier: 1.5,
      perLevel: 0.15, // +15% range per level
      maxLevel: 10,
      color: '#16a085',
      isPercent: true
    },
  };

  const CATEGORIES = {
    health: { name: 'Health & Survival', icon: '❤️', color: '#e74c3c' },
    damage: { name: 'Damage & Combat', icon: '⚔️', color: '#e67e22' },
    mobility: { name: 'Speed & Mobility', icon: '💨', color: '#3498db' },
    utility: { name: 'Utility & Resources', icon: '✨', color: '#f1c40f' },
  };

  // Initialize save data for progression center
  function ensureProgressionData() {
    if (!window.saveData.progressionUpgrades) {
      window.saveData.progressionUpgrades = {};
      Object.keys(PROGRESSION_UPGRADES).forEach(id => {
        window.saveData.progressionUpgrades[id] = { level: 0 };
      });
    }
  }

  // Calculate upgrade cost
  function getUpgradeCost(upgradeId) {
    const upgrade = PROGRESSION_UPGRADES[upgradeId];
    const currentLevel = (window.saveData.progressionUpgrades[upgradeId] || {}).level || 0;

    if (currentLevel >= upgrade.maxLevel) return null;

    const baseCost = upgrade.baseCost;
    const cost = Math.floor(baseCost * Math.pow(upgrade.costMultiplier, currentLevel));

    // Apply building discount
    const building = window.saveData.campBuildings?.progressionCenter;
    const discount = building ? (building.level * 0.05) : 0;

    return Math.floor(cost * (1 - Math.min(discount, 0.5))); // Max 50% discount
  }

  // Get current upgrade value
  function getUpgradeValue(upgradeId) {
    const upgrade = PROGRESSION_UPGRADES[upgradeId];
    const level = (window.saveData.progressionUpgrades[upgradeId] || {}).level || 0;
    return upgrade.perLevel * level;
  }

  // Purchase upgrade
  function purchaseUpgrade(upgradeId) {
    ensureProgressionData();

    const upgrade = PROGRESSION_UPGRADES[upgradeId];
    const currentLevel = (window.saveData.progressionUpgrades[upgradeId] || {}).level || 0;

    if (currentLevel >= upgrade.maxLevel) {
      if (typeof window.playSound === 'function') window.playSound('invalid');
      if (typeof window.showStatChange === 'function') {
        window.showStatChange('Already at max level!', 'normal');
      }
      return false;
    }

    const cost = getUpgradeCost(upgradeId);
    if ((window.saveData.gold || 0) < cost) {
      if (typeof window.playSound === 'function') window.playSound('invalid');
      if (typeof window.showStatChange === 'function') {
        window.showStatChange('Not enough gold!', 'normal');
      }
      return false;
    }

    // Purchase upgrade
    window.saveData.gold -= cost;
    window.saveData.progressionUpgrades[upgradeId].level++;

    // Apply upgrade effect
    applyUpgradeEffect(upgradeId);

    // Visual/audio feedback
    if (typeof window.playSound === 'function') window.playSound('levelup');
    if (typeof window.refreshGold === 'function') window.refreshGold();
    if (typeof window.showStatChange === 'function') {
      const newLevel = window.saveData.progressionUpgrades[upgradeId].level;
      const value = upgrade.perLevel * newLevel;
      const displayValue = upgrade.isPercent ?
        '+' + (value * 100).toFixed(1) + '%' :
        '+' + value.toFixed(1);
      window.showStatChange(
        upgrade.icon + ' ' + upgrade.name + ' ' + displayValue + ' (Lv.' + newLevel + ')',
        'stat'
      );
    }

    if (typeof window.saveSaveData === 'function') window.saveSaveData();

    return true;
  }

  // Apply upgrade effect to player stats
  // Prefer a full stat recalculation via stat-aggregator (reads saveData fresh,
  // avoids stale property names and double-counting across runs). Falls back to
  // direct property patching when the aggregator is not loaded yet.
  function applyUpgradeEffect(upgradeId) {
    // ── Preferred path: full recalculation ────────────────────────────────
    if (typeof window.recalculateAllStats === 'function') {
      window.recalculateAllStats();
      return;
    }

    // ── Fallback: direct patch with canonical engine property names ────────
    // (Used only when stat-aggregator.js has not loaded yet.)
    if (typeof window.playerStats === 'undefined') return;
    const upgrade = PROGRESSION_UPGRADES[upgradeId];
    const perLvl  = upgrade.perLevel;
    const ps      = window.playerStats;
    switch (upgradeId) {
      case 'maxHealth':
        ps.maxHp = (ps.maxHp || 100) + perLvl;
        ps.hp = Math.min(ps.hp !== undefined ? ps.hp : ps.maxHp, ps.maxHp);
        break;
      case 'healthRegen':
        ps.hpRegen          = (ps.hpRegen          || 0) + perLvl;
        ps.hpRegenPerSecond = (ps.hpRegenPerSecond || 0) + perLvl;
        break;
      case 'armor':
        ps.armor     = (ps.armor     || 0) + perLvl;
        ps.flatArmor = (ps.flatArmor || 0) + perLvl;
        break;
      case 'baseDamage':
        ps.strength = (ps.strength || 1)   * (1 + perLvl);
        ps.damage   = (ps.damage   || 1.0) * (1 + perLvl);
        break;
      case 'attackSpeed':
        ps.atkSpeed          = (ps.atkSpeed          || 1.0) * (1 + perLvl);
        ps.meleeAttackSpeed  = (ps.meleeAttackSpeed  || 1.0) * (1 + perLvl);
        ps.fireRate          = (ps.fireRate          || 1.0) * (1 + perLvl);
        ps.projectileFireRate= (ps.projectileFireRate|| 1.0) * (1 + perLvl);
        break;
      case 'criticalChance':
        ps.critChance = Math.min(0.95, (ps.critChance || 0.1) + perLvl);
        break;
      case 'criticalDamage':
        ps.critDmg = (ps.critDmg || 1.5) + perLvl;
        break;
      case 'moveSpeed':
        ps.walkSpeed         = (ps.walkSpeed         || 25)  * (1 + perLvl);
        ps.topSpeed          = (ps.topSpeed          || 6.5) * (1 + perLvl);
        ps.baseMovementSpeed = (ps.baseMovementSpeed || 1.0) * (1 + perLvl);
        break;
      case 'dashCooldown':
        ps.dashCooldown  = Math.max(0.2, (ps.dashCooldown  || 1.0) * (1 + perLvl));
        ps.skillCooldown = Math.max(0.2, (ps.skillCooldown || 1.0) * (1 + perLvl));
        break;
      case 'goldFind':
        ps.goldDropBonus = (ps.goldDropBonus || 0) + perLvl;
        break;
      case 'experienceGain':
        ps.expGainBonus = (ps.expGainBonus || 0)   + perLvl;
        ps.xpMultiplier = (ps.xpMultiplier || 1.0) + perLvl;
        break;
      case 'lifeSteal':
        ps.lifesteal        = Math.min(0.50, (ps.lifesteal        || 0) + perLvl);
        ps.lifeSteal        = ps.lifesteal;
        ps.lifeStealPercent = (ps.lifeStealPercent || 0) + perLvl;
        break;
      case 'pickupRange':
        ps.pickupRange        = (ps.pickupRange        || 1.0) + perLvl;
        ps.xpCollectionRadius = (ps.xpCollectionRadius || 1.0) + perLvl;
        break;
    }
  }

  // Apply all purchased upgrades — triggers a full stat recalculation when
  // the stat-aggregator is available (preferred), so all sources are combined
  // correctly and no double-counting can occur.
  function applyAllUpgrades() {
    ensureProgressionData();
    if (typeof window.recalculateAllStats === 'function') {
      window.recalculateAllStats();
      return;
    }
    // Fallback: iterate and directly patch
    Object.keys(window.saveData.progressionUpgrades).forEach(upgradeId => {
      const level = window.saveData.progressionUpgrades[upgradeId].level;
      if (level > 0 && PROGRESSION_UPGRADES[upgradeId]) {
        applyUpgradeEffect(upgradeId);
      }
    });
  }

  // Render Progression Center UI
  function showProgressionCenter() {
    ensureProgressionData();

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'progression-center-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.95);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
      box-sizing: border-box;
      overflow-y: auto;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      font-family: 'Bangers', cursive;
      font-size: 32px;
      color: #f39c12;
      text-align: center;
      margin-bottom: 10px;
      text-shadow: 0 0 20px rgba(243, 156, 18, 0.8);
    `;
    header.textContent = '💪 PROGRESSION CENTER';
    overlay.appendChild(header);

    // Subtitle
    const subtitle = document.createElement('div');
    subtitle.style.cssText = `
      font-size: 14px;
      color: #aaa;
      text-align: center;
      margin-bottom: 20px;
    `;
    subtitle.textContent = 'Purchase permanent stat upgrades';
    overlay.appendChild(subtitle);

    // Stats summary
    const statsBar = document.createElement('div');
    statsBar.style.cssText = `
      display: flex;
      gap: 20px;
      justify-content: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
    `;

    const totalUpgrades = Object.values(window.saveData.progressionUpgrades).reduce((sum, u) => sum + (u.level || 0), 0);
    const goldDisplay = (window.saveData.gold || 0).toLocaleString();

    statsBar.innerHTML = `
      <div style="padding: 8px 16px; border-radius: 8px; background: rgba(243, 156, 18, 0.1); border: 2px solid #f39c12;">
        <span style="font-size: 20px;">💰</span>
        <span style="color: #f1c40f; font-weight: bold; margin-left: 8px;">${goldDisplay}</span>
      </div>
      <div style="padding: 8px 16px; border-radius: 8px; background: rgba(46, 204, 113, 0.1); border: 2px solid #2ecc71;">
        <span style="font-size: 20px;">📊</span>
        <span style="color: #2ecc71; font-weight: bold; margin-left: 8px;">${totalUpgrades} Upgrades</span>
      </div>
    `;
    overlay.appendChild(statsBar);

    // Content container
    const content = document.createElement('div');
    content.style.cssText = `
      width: 100%;
      max-width: 1000px;
      margin: 0 auto;
    `;

    // Render categories
    Object.keys(CATEGORIES).forEach(catId => {
      const category = CATEGORIES[catId];
      const categoryUpgrades = Object.entries(PROGRESSION_UPGRADES)
        .filter(([id, u]) => u.category === catId);

      if (categoryUpgrades.length === 0) return;

      // Category header
      const catHeader = document.createElement('div');
      catHeader.style.cssText = `
        font-family: 'Bangers', cursive;
        font-size: 22px;
        color: ${category.color};
        margin: 20px 0 12px;
        text-align: center;
        letter-spacing: 1px;
      `;
      catHeader.textContent = category.icon + ' ' + category.name.toUpperCase();
      content.appendChild(catHeader);

      // Upgrade grid
      const grid = document.createElement('div');
      grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 12px;
        margin-bottom: 20px;
      `;

      categoryUpgrades.forEach(([upgradeId, upgrade]) => {
        const currentLevel = window.saveData.progressionUpgrades[upgradeId].level;
        const currentValue = getUpgradeValue(upgradeId);
        const nextValue = currentValue + upgrade.perLevel;
        const cost = getUpgradeCost(upgradeId);
        const isMaxed = currentLevel >= upgrade.maxLevel;
        const canAfford = !isMaxed && (window.saveData.gold || 0) >= cost;

        const card = document.createElement('div');
        card.style.cssText = `
          background: linear-gradient(135deg, rgba(0, 0, 0, 0.8) 0%, rgba(20, 20, 30, 0.9) 100%);
          border: 2px solid ${isMaxed ? '#2ecc71' : (canAfford ? upgrade.color : '#444')};
          border-radius: 12px;
          padding: 14px;
          cursor: ${isMaxed ? 'default' : 'pointer'};
          transition: all 0.2s;
          position: relative;
          overflow: hidden;
        `;

        if (!isMaxed && canAfford) {
          card.addEventListener('mouseenter', () => {
            card.style.transform = 'scale(1.02)';
            card.style.boxShadow = `0 0 20px ${upgrade.color}66`;
          });
          card.addEventListener('mouseleave', () => {
            card.style.transform = 'scale(1)';
            card.style.boxShadow = 'none';
          });
        }

        // Card content
        card.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
            <div style="font-size: 32px;">${upgrade.icon}</div>
            <div style="flex: 1;">
              <div style="font-weight: bold; color: #fff; font-size: 15px;">${upgrade.name}</div>
              <div style="font-size: 11px; color: #888;">${upgrade.description}</div>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin: 8px 0;">
            <div style="font-size: 12px; color: #aaa;">Level:</div>
            <div style="font-weight: bold; color: ${upgrade.color};">${currentLevel} / ${upgrade.maxLevel}</div>
          </div>

          <div style="height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; margin-bottom: 8px;">
            <div style="height: 100%; background: ${upgrade.color}; width: ${(currentLevel / upgrade.maxLevel) * 100}%; transition: width 0.3s;"></div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="font-size: 11px; color: #aaa;">Current:</div>
            <div style="font-size: 14px; color: #2ecc71; font-weight: bold;">
              ${upgrade.isPercent ?
                '+' + (currentValue * 100).toFixed(1) + '%' :
                '+' + currentValue.toFixed(1)}
            </div>
          </div>

          ${!isMaxed ? `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="font-size: 11px; color: #aaa;">Next:</div>
              <div style="font-size: 13px; color: ${canAfford ? '#3498db' : '#666'}; font-weight: bold;">
                ${upgrade.isPercent ?
                  '+' + (nextValue * 100).toFixed(1) + '%' :
                  '+' + nextValue.toFixed(1)}
              </div>
            </div>
          ` : ''}

          ${!isMaxed ? `
            <div style="
              text-align: center;
              padding: 10px;
              border-radius: 8px;
              background: ${canAfford ? 'linear-gradient(135deg, ' + upgrade.color + ', #FFA000)' : 'rgba(100, 100, 100, 0.3)'};
              color: ${canAfford ? '#000' : '#666'};
              font-weight: bold;
              font-size: 14px;
              letter-spacing: 0.5px;
            ">
              💰 ${cost.toLocaleString()} GOLD
            </div>
          ` : `
            <div style="
              text-align: center;
              padding: 10px;
              border-radius: 8px;
              background: linear-gradient(135deg, #2ecc71, #27ae60);
              color: #fff;
              font-weight: bold;
              font-size: 14px;
              letter-spacing: 0.5px;
            ">
              ✅ MAXED OUT
            </div>
          `}
        `;

        if (!isMaxed) {
          card.addEventListener('click', () => {
            if (purchaseUpgrade(upgradeId)) {
              // Refresh UI
              overlay.remove();
              showProgressionCenter();
            }
          });
        }

        grid.appendChild(card);
      });

      content.appendChild(grid);
    });

    overlay.appendChild(content);

    // Close button
    const closeBtn = document.createElement('div');
    closeBtn.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(231, 76, 60, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      cursor: pointer;
      transition: all 0.2s;
      z-index: 1001;
    `;
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.transform = 'scale(1.1)';
      closeBtn.style.background = 'rgba(231, 76, 60, 1)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.transform = 'scale(1)';
      closeBtn.style.background = 'rgba(231, 76, 60, 0.8)';
    });
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.appendChild(closeBtn);

    document.body.appendChild(overlay);
  }

  // Export functions
  window.ProgressionCenter = {
    show: showProgressionCenter,
    applyAllUpgrades: applyAllUpgrades,
    purchaseUpgrade: purchaseUpgrade,
    getUpgradeValue: getUpgradeValue,
  };

  // Auto-apply upgrades on load
  if (typeof window.saveData !== 'undefined') {
    applyAllUpgrades();
  }

})();
