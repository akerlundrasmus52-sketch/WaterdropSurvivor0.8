// js/modules/attributes.js
// Attributes (Training Hall) system
    import { gs, gameSettings, playerStats } from './state.js';
    import { saveSaveData } from './save.js';

    // --- ATTRIBUTES SYSTEM ---
    const ATTRIBUTE_INFO = {
      dexterity: {
        name: 'Dexterity',
        icon: '🎯',
        description: 'Improves attack speed and critical chance',
        effects: {
          attackSpeed: 0.03, // +3% per point
          critChance: 0.01   // +1% per point
        }
      },
      strength: {
        name: 'Strength',
        icon: '💪',
        description: 'Increases damage output',
        effects: {
          damage: 0.05 // +5% per point
        }
      },
      vitality: {
        name: 'Vitality',
        icon: '❤️',
        description: 'Boosts maximum health and health regeneration',
        effects: {
          maxHp: 10,      // +10 HP per point
          hpRegen: 0.25   // +0.25 HP/sec per point
        }
      },
      luck: {
        name: 'Luck',
        icon: '🍀',
        description: 'Increases critical damage and treasure find chance',
        effects: {
          critDamage: 0.05,       // +5% crit damage per point
          goldEarned: 0.03        // +3% gold find per point
        }
      },
      wisdom: {
        name: 'Wisdom',
        icon: '🧠',
        description: 'Reduces cooldowns and increases experience gain',
        effects: {
          cooldownReduction: 0.02, // +2% per point
          expEarned: 0.03          // +3% per point
        }
      }
    };

    function updateAttributesScreen() {
      const content = document.getElementById('attributes-content');
      const pointsDisplay = document.getElementById('attr-points-display');
      
      if (!content || !pointsDisplay) return;
      
      const unspent = gs.saveData.unspentAttributePoints || 0;
      pointsDisplay.textContent = `Unspent Points: ${unspent}`;
      
      // Update badge on attributes button if there are unspent points
      updateAttributesBadge(unspent);
      
      let html = '';
      
      for (const attrKey in ATTRIBUTE_INFO) {
        const attr = ATTRIBUTE_INFO[attrKey];
        const currentLevel = gs.saveData.attributes[attrKey] || 0;
        const canIncrease = unspent > 0;
        
        // Build effects display
        let effectsHtml = '';
        for (const effectKey in attr.effects) {
          const value = attr.effects[effectKey];
          const effectName = effectKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          const displayValue = effectKey.includes('Hp') ? `+${value}` : `+${(value * 100).toFixed(0)}%`;
          effectsHtml += `<div style="color: #90ee90; font-size: 13px;">• ${effectName}: ${displayValue} per point</div>`;
        }
        
        html += `
          <div style="
            background: linear-gradient(to bottom, #2a3a4a, #1a2a3a);
            border: 3px solid #5DADE2;
            border-radius: 15px;
            padding: 20px;
            text-align: left;
            position: relative;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 32px;">${attr.icon}</span>
                <div>
                  <div style="color: #5DADE2; font-size: 22px; font-weight: bold;">${attr.name}</div>
                  <div style="color: #aaa; font-size: 14px;">Level: ${currentLevel}</div>
                </div>
              </div>
              <button 
                onclick="increaseAttribute('${attrKey}')" 
                style="
                  padding: 10px 20px;
                  font-size: 24px;
                  background: ${canIncrease ? 'linear-gradient(to bottom, #3498DB, #2C3E50)' : '#555'};
                  color: white;
                  border: 2px solid ${canIncrease ? '#5DADE2' : '#777'};
                  border-radius: 10px;
                  cursor: ${canIncrease ? 'pointer' : 'not-allowed'};
                  opacity: ${canIncrease ? '1' : '0.5'};
                "
                ${!canIncrease ? 'disabled' : ''}
              >+</button>
            </div>
            <div style="color: #ddd; font-size: 14px; margin-bottom: 10px;">${attr.description}</div>
            <div style="margin-top: 10px;">
              ${effectsHtml}
            </div>
          </div>
        `;
      }
      
      content.innerHTML = html;
    }

    function updateAttributesBadge(count) {
      let badge = document.getElementById('attributes-badge');
      const attrBtn = document.getElementById('attributes-btn');
      
      if (count > 0 && attrBtn) {
        if (!badge) {
          badge = document.createElement('div');
          badge.id = 'attributes-badge';
          badge.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: #FF0000;
            color: white;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            box-shadow: 0 0 10px rgba(255, 0, 0, 0.8);
            z-index: 100;
          `;
          attrBtn.appendChild(badge);
        }
        badge.textContent = count;
      } else if (badge) {
        badge.remove();
      }
    }

    function increaseAttribute(attrKey) {
      if (!gs.saveData.attributes[attrKey]) gs.saveData.attributes[attrKey] = 0;
      
      if (gs.saveData.unspentAttributePoints > 0) {
        gs.saveData.attributes[attrKey]++;
        gs.saveData.unspentAttributePoints--;
        
        playSound('levelup');
        saveSaveData();
        updateAttributesScreen();
      }
    }
    
    // Expose to global scope for onclick handlers
    window.increaseAttribute = increaseAttribute;

    export { updateAttributesScreen, updateAttributesBadge, increaseAttribute };
