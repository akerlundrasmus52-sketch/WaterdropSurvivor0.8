// js/modules/achievements.js
// Achievement system
    import { gs, gameSettings, playerStats, weapons } from './state.js';
    import { saveSaveData } from './save.js';
    import { playSound } from './audio.js';

    // --- ACHIEVEMENTS SYSTEM ---
    const ACHIEVEMENTS = {
      kill7: { id: 'kill7', name: 'First Steps', desc: 'Kill 7 gs.enemies', reward: 10, skillPoints: 0, attributePoints: 0, check: () => playerStats.kills >= 7, claimed: false },
      kills10: { id: 'kills10', name: 'First Blood', desc: 'Kill 10 gs.enemies', reward: 25, skillPoints: 1, attributePoints: 1, check: () => playerStats.kills >= 10, claimed: false },
      kills50: { id: 'kills50', name: 'Killer Instinct', desc: 'Kill 50 gs.enemies', reward: 50, skillPoints: 1, attributePoints: 1, check: () => playerStats.kills >= 50, claimed: false },
      kills100: { id: 'kills100', name: 'Century Slayer', desc: 'Kill 100 gs.enemies', reward: 100, skillPoints: 2, attributePoints: 2, check: () => playerStats.kills >= 100, claimed: false },
      kills500: { id: 'kills500', name: 'Mass Destroyer', desc: 'Kill 500 gs.enemies', reward: 250, skillPoints: 2, attributePoints: 2, check: () => playerStats.kills >= 500, claimed: false },
      kills1000: { id: 'kills1000', name: 'Legendary Warrior', desc: 'Kill 1000 gs.enemies', reward: 500, skillPoints: 3, attributePoints: 3, check: () => playerStats.kills >= 1000, claimed: false },
      kills2500: { id: 'kills2500', name: 'Elite Slayer', desc: 'Kill 2500 gs.enemies', reward: 750, skillPoints: 3, attributePoints: 3, check: () => playerStats.kills >= 2500, claimed: false },
      kills5000: { id: 'kills5000', name: 'God of War', desc: 'Kill 5000 gs.enemies', reward: 1000, skillPoints: 4, attributePoints: 4, check: () => playerStats.kills >= 5000, claimed: false },
      
      gold100: { id: 'gold100', name: 'Small Fortune', desc: 'Collect 100 gold in one run', reward: 50, skillPoints: 1, attributePoints: 1, check: () => playerStats.gold >= 100, claimed: false },
      gold500: { id: 'gold500', name: 'Treasure Hunter', desc: 'Collect 500 gold in one run', reward: 150, skillPoints: 1, attributePoints: 1, check: () => playerStats.gold >= 500, claimed: false },
      gold1000: { id: 'gold1000', name: 'Gold Baron', desc: 'Collect 1000 gold in one run', reward: 300, skillPoints: 2, attributePoints: 2, check: () => playerStats.gold >= 1000, claimed: false },
      gold2500: { id: 'gold2500', name: 'Wealth Magnet', desc: 'Collect 2500 gold in one run', reward: 500, skillPoints: 2, attributePoints: 2, check: () => playerStats.gold >= 2500, claimed: false },
      
      dasher: { id: 'dasher', name: 'Dash Master', desc: 'Perform 50 dashes in one run', reward: 100, skillPoints: 1, attributePoints: 1, check: () => playerStats.dashesPerformed >= 50, claimed: false },
      survivor: { id: 'survivor', name: 'Time Warrior', desc: 'Survive for 10 minutes', reward: 200, skillPoints: 2, attributePoints: 2, check: () => playerStats.survivalTime >= 600, claimed: false },
      survivor20: { id: 'survivor20', name: 'Endurance Master', desc: 'Survive for 20 minutes', reward: 400, skillPoints: 3, attributePoints: 3, check: () => playerStats.survivalTime >= 1200, claimed: false },
      survivor30: { id: 'survivor30', name: 'Immortal Legend', desc: 'Survive for 30 minutes', reward: 600, skillPoints: 4, attributePoints: 4, check: () => playerStats.survivalTime >= 1800, claimed: false },
      weaponMaster: { id: 'weaponMaster', name: 'Weapon Master', desc: 'Unlock all 3 weapons', reward: 150, skillPoints: 1, attributePoints: 1, check: () => playerStats.weaponsUnlocked >= 3, claimed: false },
      untouchable: { id: 'untouchable', name: 'Untouchable', desc: 'Take no damage for 3 minutes', reward: 300, skillPoints: 3, attributePoints: 3, check: () => playerStats.survivalTime >= 180 && playerStats.damageTaken === 0, claimed: false },
      
      miniBoss1: { id: 'miniBoss1', name: 'Boss Slayer I', desc: 'Defeat your first mini-boss', reward: 150, skillPoints: 2, attributePoints: 2, check: () => playerStats.miniBossesDefeated >= 1, claimed: false },
      miniBoss3: { id: 'miniBoss3', name: 'Boss Slayer II', desc: 'Defeat 3 mini-bosses', reward: 300, skillPoints: 2, attributePoints: 2, check: () => playerStats.miniBossesDefeated >= 3, claimed: false },
      miniBoss5: { id: 'miniBoss5', name: 'Boss Slayer III', desc: 'Defeat 5 mini-bosses', reward: 500, skillPoints: 3, attributePoints: 3, check: () => playerStats.miniBossesDefeated >= 5, claimed: false },
      miniBoss10: { id: 'miniBoss10', name: 'Boss Hunter', desc: 'Defeat 10 mini-bosses', reward: 800, skillPoints: 4, attributePoints: 4, check: () => playerStats.miniBossesDefeated >= 10, claimed: false },
      
      level10: { id: 'level10', name: 'Rising Star', desc: 'Reach Level 10', reward: 100, skillPoints: 1, attributePoints: 1, check: () => playerStats.lvl >= 10, claimed: false },
      level25: { id: 'level25', name: 'Experienced Fighter', desc: 'Reach Level 25', reward: 250, skillPoints: 2, attributePoints: 2, check: () => playerStats.lvl >= 25, claimed: false },
      level50: { id: 'level50', name: 'Master Champion', desc: 'Reach Level 50', reward: 500, skillPoints: 3, attributePoints: 3, check: () => playerStats.lvl >= 50, claimed: false },
      level75: { id: 'level75', name: 'Elite Warrior', desc: 'Reach Level 75', reward: 750, skillPoints: 3, attributePoints: 3, check: () => playerStats.lvl >= 75, claimed: false },
      level100: { id: 'level100', name: 'Legendary Hero', desc: 'Reach Level 100', reward: 1000, skillPoints: 4, attributePoints: 4, check: () => playerStats.lvl >= 100, claimed: false },
      level125: { id: 'level125', name: 'Unstoppable Force', desc: 'Reach Level 125', reward: 1250, skillPoints: 4, attributePoints: 4, check: () => playerStats.lvl >= 125, claimed: false },
      level150: { id: 'level150', name: 'Ascended Champion', desc: 'Reach Level 150', reward: 1500, skillPoints: 5, attributePoints: 5, check: () => playerStats.lvl >= 150, claimed: false }
    };

    function updateAchievementsScreen() {
      const content = document.getElementById('achievements-content');
      if (!content) return;
      
      let html = '<div style="display: grid; gap: 15px; width: 100%; max-width: 600px; margin: 0 auto;">';
      
      let unclaimedCount = 0;
      for (const key in ACHIEVEMENTS) {
        const achievement = ACHIEVEMENTS[key];
        const isClaimed = gs.saveData.achievements && gs.saveData.achievements.includes(achievement.id);
        const canClaim = !isClaimed && achievement.check();
        
        if (canClaim) unclaimedCount++;
        
        html += `
          <div style="
            background: linear-gradient(to bottom, ${isClaimed ? '#2c5530' : (canClaim ? '#4a4a2a' : '#3a3a3a')}, ${isClaimed ? '#1a3020' : (canClaim ? '#3a3a1a' : '#2a2a2a')});
            border: 3px solid ${isClaimed ? '#FFD700' : (canClaim ? '#FFFF00' : '#5a5a5a')};
            border-radius: 15px;
            padding: 15px;
            text-align: left;
            position: relative;
            cursor: ${canClaim ? 'pointer' : 'default'};
            transition: all 0.2s ease;
            ${canClaim ? 'box-shadow: 0 0 15px rgba(255, 255, 0, 0.5);' : ''}
          " ${canClaim ? `onclick="claimAchievement('${achievement.id}')"` : ''}>
            <div style="color: ${isClaimed ? '#FFD700' : (canClaim ? '#FFFF00' : '#bbb')}; font-size: 20px; font-weight: bold; margin-bottom: 5px;">
              ${isClaimed ? '✓ ' : ''}${achievement.name}
            </div>
            <div style="color: ${isClaimed ? '#90ee90' : (canClaim ? '#dddd00' : '#888')}; font-size: 14px; margin-bottom: 8px;">
              ${achievement.desc}
            </div>
            <div style="color: #FFD700; font-size: 16px; font-weight: bold;">
              Reward: ${achievement.reward} Gold
            </div>
            <div style="color: #90EE90; font-size: 16px; font-weight: bold; margin-top: 5px;">
              Skill Points: ${achievement.skillPoints || 0} 🔮
            </div>
            <div style="color: #5DADE2; font-size: 16px; font-weight: bold; margin-top: 5px;">
              Attribute Points: ${achievement.attributePoints} ${canClaim ? '⭐' : ''}
            </div>
            ${canClaim ? '<div style="color: #FFFF00; font-size: 14px; margin-top: 8px; animation: pulse 1s infinite;">CLICK TO CLAIM!</div>' : ''}
            </div>
          </div>
        `;
      }
      
      html += '</div>';
      content.innerHTML = html;
      
      // Update notification badge on achievements button
      updateAchievementBadge(unclaimedCount);
    }

    function updateAchievementBadge(count) {
      let badge = document.getElementById('achievement-badge');
      if (count > 0) {
        if (!badge) {
          badge = document.createElement('div');
          badge.id = 'achievement-badge';
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
          document.getElementById('achievements-btn').appendChild(badge);
        }
        badge.textContent = count;
      } else if (badge) {
        badge.remove();
      }
    }

    function updateStatBar() {
      const panel = document.getElementById('stat-bar-panel');
      if (!panel || !gs.isGameActive || gs.isGameOver) { if (panel) panel.style.display = 'none'; return; }
      panel.style.display = 'block';
      const waveEl = document.getElementById('stat-bar-wave');
      const killsEl = document.getElementById('stat-bar-kills');
      const comboEl = document.getElementById('stat-bar-combo');
      const questEl = document.getElementById('stat-bar-quest');
      const achEl = document.getElementById('stat-bar-achievement');
      if (waveEl) waveEl.textContent = 'Wave: ' + (gs.waveCount || 0);
      if (killsEl) killsEl.textContent = 'Kills: ' + (playerStats ? playerStats.kills : 0);
      // Combo
      const combo = window.currentCombo || 0;
      if (comboEl) { if (combo > 1) { comboEl.textContent = '🔥 Combo x' + combo; comboEl.style.display = ''; } else { comboEl.style.display = 'none'; } }
      // Active quest
      if (questEl) {
        let questText = '';
        const currentQuest = getCurrentQuest();
        if (currentQuest) {
          const kills = playerStats ? playerStats.kills : 0;
          if (currentQuest.id === 'quest1_kill3') questText = 'Kill 3 Enemies: ' + Math.min(kills, 3) + '/3';
          else if (currentQuest.id === 'quest4_kill10') questText = 'Kill 10: ' + Math.min(kills,10) + '/10';
          else if (currentQuest.id === 'quest6_kill10') questText = 'Kill 10: ' + Math.min(kills,10) + '/10';
          else if (currentQuest.id === 'quest7_kill10') questText = 'Kill 15: ' + Math.min(kills,15) + '/15';
          else if (currentQuest.label) questText = currentQuest.label;
          else questText = currentQuest.id || '';
        }
        // Check kill7 achievement quest
        if (!questText && gs.saveData.achievementQuests && gs.saveData.achievementQuests.kill7Quest === 'active') {
          questText = '🏆 Visit Achievement Building';
        }
        questEl.textContent = questText ? '📋 ' + questText : '';
      }
      // Achievement progress
      if (achEl) {
        const kills = playerStats ? playerStats.kills : 0;
        if (!gs.saveData.achievementQuests || !gs.saveData.achievementQuests.kill7Unlocked) {
          achEl.style.display = '';
          achEl.textContent = '🏆 Kill 7: ' + Math.min(kills, 7) + '/7';
        } else {
          achEl.style.display = 'none';
        }
      }
    }
    window.updateStatBar = updateStatBar;

    function claimAchievement(achievementId) {
      const achievement = Object.values(ACHIEVEMENTS).find(a => a.id === achievementId);
      if (!achievement) return;
      
      const isClaimed = gs.saveData.achievements && gs.saveData.achievements.includes(achievement.id);
      const canClaim = !isClaimed && achievement.check();
      
      if (!canClaim) return;
      
      // Mark as claimed
      if (!gs.saveData.achievements) gs.saveData.achievements = [];
      gs.saveData.achievements.push(achievement.id);
      
      // Award gold
      addGold(achievement.reward);
      
      // Award attribute points (with safety check)
      const attributePoints = achievement.attributePoints || 0;
      gs.saveData.unspentAttributePoints += attributePoints;
      
      // Award skill points (with safety check)
      const skillPoints = achievement.skillPoints || 0;
      gs.saveData.skillPoints += skillPoints;
      
      // Play sound
      playSound('coin');
      
      // Show gold bag animation
      showGoldBagAnimation(achievement.reward);
      
      // FRESH IMPLEMENTATION: Show enhanced achievement notification
      showEnhancedNotification(
        'achievement',
        'ACHIEVEMENT UNLOCKED!',
        `${achievement.name} - +${achievement.reward} Gold, +${skillPoints} Skill Point${skillPoints > 1 ? 's' : ''}, +${attributePoints} Attribute Point${attributePoints > 1 ? 's' : ''}!`
      );
      
      // Save
      saveSaveData();
      
      // Refresh screen
      updateAchievementsScreen();
    }
    
    // Expose to global scope for onclick handlers
    window.claimAchievement = claimAchievement;

    function showGoldBagAnimation(amount) {
      const bag = document.createElement('div');
      bag.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 64px;
        z-index: 10000;
        pointer-events: none;
        animation: goldBagPop 1s ease-out forwards;
      `;
      bag.textContent = '💰';
      document.body.appendChild(bag);
      
      const text = document.createElement('div');
      text.style.cssText = `
        position: fixed;
        top: 55%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 32px;
        font-weight: bold;
        color: #FFD700;
        text-shadow: 0 0 10px rgba(255, 215, 0, 0.8), -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000;
        z-index: 10000;
        pointer-events: none;
        animation: goldTextFloat 1s ease-out forwards;
      `;
      text.textContent = `+${amount} GOLD!`;
      document.body.appendChild(text);
      
      setTimeout(() => {
        bag.remove();
        text.remove();
      }, 1000);
    }

    function checkAchievements() {
      // This function just checks if achievements are unlocked (not auto-claiming)
      // Players must click to claim in the achievements menu
      let hasNewAchievement = false;
      
      for (const key in ACHIEVEMENTS) {
        const achievement = ACHIEVEMENTS[key];
        
        // Skip if already claimed - achievements are permanent once unlocked
        if (gs.saveData.achievements && gs.saveData.achievements.includes(achievement.id)) {
          continue;
        }
        
        // Check if achieved - mark internally but don't auto-claim
        if (achievement.check()) {
          hasNewAchievement = true;
          
          // Show notification only the FIRST TIME it's unlocked (not on every run)
          // Check if this specific achievement has been notified before by storing in localStorage
          // Note: Notification state is tracked separately from claim state to avoid re-showing
          // notifications in new runs before claiming. If localStorage is cleared, notifications
          // may re-appear but will still respect the gs.saveData.achievements claim status.
          const notifyKey = `achievement_notified_${achievement.id}`;
          let hasBeenNotified = false;
          
          try {
            hasBeenNotified = localStorage.getItem(notifyKey);
          } catch (e) {
            // localStorage may fail in private browsing or when quota exceeded
            console.warn('localStorage not available for achievement tracking');
          }
          
          if (!hasBeenNotified) {
            try {
              localStorage.setItem(notifyKey, 'true');
            } catch (e) {
              // Ignore storage errors - notification will show again next time
            }
            // Use showStatChange style for first-time achievements
            showStatChange(`🏆 ${achievement.name} - Check Achievements Menu!`);
            playSound('levelup');
          }
        }
      }
      
      // Update achievement badge
      if (hasNewAchievement) {
        updateAchievementsScreen();
      }
    }

    export { updateAchievementsScreen, updateAchievementBadge, updateStatBar, claimAchievement, checkAchievements, showGoldBagAnimation };
