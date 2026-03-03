// js/quest-system.js — Tutorial quest system, story quest popups, account level system,
// AI chat system, character visuals, codex, inventory screen, companion house, camp screen rendering.
// Depends on: variables from main.js, save-system.js, camp-skill-system.js

    // --- STORY QUEST POPUP SYSTEM ---
    
    // Lore unlocking system
    function unlockLore(category, id) {
      if (!saveData.loreUnlocked) {
        saveData.loreUnlocked = { landmarks: [], enemies: [], bosses: [], buildings: [] };
      }
      
      if (!saveData.loreUnlocked[category].includes(id)) {
        saveData.loreUnlocked[category].push(id);
        saveSaveData();
        
        const loreData = LORE_DATABASE[category][id];
        if (loreData) {
          showStatChange(`📖 Lore Unlocked: ${loreData.name}`);
          
          // Show a lore popup after a short delay
          setTimeout(() => {
            showLorePopup(loreData);
          }, 1000);
        }
      }
    }
    
    function showLorePopup(loreData) {
      const modal = document.getElementById('comic-tutorial-modal');
      const title = document.getElementById('comic-title');
      const text = document.getElementById('comic-text');
      const btn = document.getElementById('comic-action-btn');
      
      if (!modal || !title || !text || !btn) return;
      
      // Pause game while lore popup is visible
      const wasGameActive = isGameActive && !isGameOver;
      if (wasGameActive) setGamePaused(true);
      
      title.textContent = `${loreData.icon} ${loreData.name}`;
      text.innerHTML = `<strong>${loreData.description}</strong><br><br>${loreData.story}`;
      btn.textContent = 'CLOSE';
      
      modal.style.display = 'flex';
      
      btn.onclick = () => {
        modal.style.display = 'none';
        if (wasGameActive) setGamePaused(false);
      };
    }
    
    // Extended quest system
    function checkLegendaryCigarQuest() {
      if (!saveData.extendedQuests) {
        saveData.extendedQuests = {
          legendaryCigar: { started: false, completed: false, foundCigar: false },
          companionEgg: { started: false, completed: false, eggHatched: false, ceremonyDone: false }
        };
      }
      
      // Start quest when player visits Stonehenge area (only after tutorial stonehenge quest is done)
      if (player && !saveData.extendedQuests.legendaryCigar.started &&
          saveData.tutorialQuests && isQuestClaimed('quest3_stonehengeGear')) {
        const stonehengePos = { x: 100, z: 80 };
        const dist = Math.sqrt(
          Math.pow(player.mesh.position.x - stonehengePos.x, 2) +
          Math.pow(player.mesh.position.z - stonehengePos.z, 2)
        );
        
        if (dist < 20) {
          saveData.extendedQuests.legendaryCigar.started = true;
          saveSaveData();
          showComicInfoBox(
            '🚬 Quest: The Legendary Cigar',
            'You sense something powerful near Stonehenge...<br><br>Ancient legends speak of an <strong>Eternal Cigar</strong> hidden within these mystical stones. It\'s said to grant immense power to those worthy enough to find it!<br><br><b>Objective:</b> Search around Stonehenge for the legendary cigar',
            'I\'ll find it!'
          );
        }
      }
      
      // Check if player found the cigar (near center of stonehenge)
      if (saveData.extendedQuests.legendaryCigar.started && !saveData.extendedQuests.legendaryCigar.foundCigar) {
        const cigarPos = { x: -60, z: 60 }; // Exact center
        const dist = Math.sqrt(
          Math.pow(player.mesh.position.x - cigarPos.x, 2) +
          Math.pow(player.mesh.position.z - cigarPos.z, 2)
        );
        
        if (dist < 3) {
          saveData.extendedQuests.legendaryCigar.foundCigar = true;
          saveData.extendedQuests.legendaryCigar.completed = true;
          saveSaveData();
          
          // Note: The bonus is applied this run only - stored in saveData for permanent tracking
          // On future runs, check saveData.extendedQuests.legendaryCigar.completed in resetGame
          
          showComicInfoBox(
            '🚬 Legendary Cigar Found!',
            '<strong>You\'ve discovered the Eternal Cigar!</strong><br><br>A surge of power flows through you. Your attacks feel stronger, your movements more precise.<br><br><b>Reward:</b> +50% Permanent Damage!<br><br>The cigar glows with an otherworldly light, forever enhancing your combat prowess.',
            'AMAZING!'
          );
          
          // Unlock lore
          unlockLore('landmarks', 'stonehenge');
        }
      }
    }
    
    function showQuestPopup(title, message, buttonText = 'Continue', onClose = null) {
      // Pause game when popup is shown
      const wasGameActive = isGameActive && !isGameOver;
      if (wasGameActive) setGamePaused(true);
      // Create popup overlay
      const overlay = document.createElement('div');
      overlay.id = 'quest-popup-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.9);
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease-out;
      `;
      
      const popup = document.createElement('div');
      popup.style.cssText = `
        background: linear-gradient(to bottom, #2a3a4a, #1a2a3a);
        border: 3px solid #FFD700;
        border-radius: 20px;
        padding: 20px;
        max-width: 90vw;
        width: 90%;
        max-height: 85vh;
        overflow-y: auto;
        box-sizing: border-box;
        text-align: center;
        animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.1);
        box-shadow: 0 0 30px rgba(255,215,0,0.5);
      `;
      
      popup.innerHTML = `
        <div style="font-size: 28px; color: #FFD700; font-weight: bold; margin-bottom: 20px;">${title}</div>
        <div style="font-size: 18px; color: #FFF; line-height: 1.6; margin-bottom: 30px;">${message}</div>
        <button class="btn" style="font-size: 18px; padding: 12px 30px; background: #FFD700; color: #000;">${buttonText}</button>
      `;
      
      // Add X close button
      const xBtn = document.createElement('button');
      xBtn.className = 'overlay-close-x';
      xBtn.innerHTML = '✕';
      xBtn.title = 'Close';
      popup.style.position = 'relative';
      popup.appendChild(xBtn);
      
      const closeHandler = () => {
        document.body.removeChild(overlay);
        if (wasGameActive) setGamePaused(false);
        if (onClose) onClose();
      };
      popup.querySelector('button.btn').onclick = closeHandler;
      xBtn.onclick = closeHandler;
      
      overlay.appendChild(popup);
      document.body.appendChild(overlay);
    }

    // NEW: Comic-magazine styled info box (80s Batman style)
    function showComicInfoBox(title, message, buttonText = 'Continue', onClose = null) {
      // Pause game when popup is shown
      const wasGameActive = isGameActive && !isGameOver;
      if (wasGameActive) setGamePaused(true);
      const overlay = document.createElement('div');
      overlay.id = 'comic-info-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.95);
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease-out;
      `;
      
      const popup = document.createElement('div');
      popup.style.cssText = `
        background: linear-gradient(135deg, #1e3a5f 0%, #0d1f3a 100%);
        border: 6px solid #FFD700;
        border-radius: 10px;
        padding: 20px;
        max-width: 90vw;
        width: 90%;
        max-height: 85vh;
        overflow-y: auto;
        box-sizing: border-box;
        text-align: center;
        animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.1);
        box-shadow: 
          0 0 40px rgba(255,215,0,0.6),
          inset 0 0 30px rgba(0,0,0,0.3);
        font-family: 'Bangers', cursive;
      `;
      
      popup.innerHTML = `
        <div style="
          font-size: 32px; 
          color: #FFD700; 
          font-weight: bold; 
          margin-bottom: 25px;
          text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;
          letter-spacing: 2px;
        ">${title}</div>
        <div style="
          font-size: 16px; 
          color: #FFF; 
          line-height: 1.8; 
          margin-bottom: 30px;
          font-family: 'Bangers', cursive;
          letter-spacing: 0.5px;
          background: rgba(0,0,0,0.3);
          padding: 20px;
          border-radius: 10px;
          border: 2px solid rgba(255,215,0,0.3);
        ">${message}</div>
        <button class="btn" style="
          font-size: 22px; 
          padding: 15px 40px; 
          background: #FFD700; 
          color: #000;
          font-family: 'Bangers', cursive;
          border: 3px solid #000;
          box-shadow: 4px 4px 0 #000;
          letter-spacing: 1px;
        ">${buttonText}</button>
      `;
      
      let comicClosed = false;
      const comicCloseHandler = () => {
        if (comicClosed) return;
        comicClosed = true;
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (wasGameActive) setGamePaused(false);
        if (onClose) onClose();
      };
      popup.querySelector('button').onclick = comicCloseHandler;
      
      // Add X close button
      const xBtn = document.createElement('button');
      xBtn.className = 'overlay-close-x';
      xBtn.innerHTML = '✕';
      xBtn.title = 'Close';
      popup.style.position = 'relative';
      popup.appendChild(xBtn);
      xBtn.onclick = comicCloseHandler;
      
      overlay.appendChild(popup);
      document.body.appendChild(overlay);
    }

    // NEW: Show Quest Hall UI for claiming completed quests
    function showQuestHall() {
      // Pause game if active
      const wasGameActive = isGameActive && !isGameOver;
      if (wasGameActive) setGamePaused(true);
      // Clear quest notification for the main building
      if (!saveData.storyQuests.questNotifications) {
        saveData.storyQuests.questNotifications = {};
      }
      saveData.storyQuests.questNotifications.questMission = false;
      saveSaveData();
      
      // Activate questGather0_materials or quest1 the first time player enters Main Building after first run
      if (
        saveData.tutorialQuests.firstDeathShown &&
        isQuestClaimed('firstRunDeath') &&
        !saveData.tutorialQuests.currentQuest &&
        !isQuestClaimed('questGather0_materials') &&
        !saveData.tutorialQuests.readyToClaim.includes('questGather0_materials') &&
        !isQuestClaimed('quest1_kill3')
      ) {
        // Start gathering quest first
        if (checkQuestConditions('questGather0_materials')) {
          saveData.tutorialQuests.currentQuest = 'questGather0_materials';
          saveSaveData();
          showComicInfoBox(
            '⛏️ GATHER BUILDING MATERIALS',
            `<div style="text-align: left; padding: 10px;">
              <p style="font-family: 'Bangers', cursive; font-size: 20px; margin-bottom: 10px;">🪵 QUEST: GATHER MATERIALS</p>
              <p style="line-height: 1.8; margin-bottom: 10px;">
                Welcome back, Droplet! To build your camp, you need resources.<br><br>
                <b>YOUR MISSION:</b> Head out on a run and gather:<br>
                &nbsp;🪵 <b>1 Wood</b> — chop a tree with your Axe<br>
                &nbsp;🪨 <b>1 Stone</b> — mine a rock with your Sledgehammer<br>
                &nbsp;🖤 <b>1 Coal</b> — mine coal with your Pickaxe<br><br>
                Once gathered, return to build your first structure!
              </p>
              <p style="font-size: 13px; color: #FFD700;">Reward: +50 Gold · +1 Skill Point</p>
            </div>`,
            'START GATHERING!'
          );
        }
      } else if (
        // Original quest1 activation: for existing saves that already have firstRunDeath claimed
        saveData.tutorialQuests.firstDeathShown &&
        isQuestClaimed('firstRunDeath') &&
        (isQuestClaimed('questGather0_materials') || !checkQuestConditions('questGather0_materials')) &&
        !saveData.tutorialQuests.currentQuest &&
        !isQuestClaimed('quest1_kill3') &&
        !saveData.tutorialQuests.readyToClaim.includes('quest1_kill3')
      ) {
        if (checkQuestConditions('quest1_kill3')) {
          saveData.tutorialQuests.currentQuest = 'quest1_kill3';
          saveSaveData();
          // Show text magazine explaining the first quest (synchronous after save)
          showComicInfoBox(
            '📋 MISSION BRIEFING',
            `<div style="text-align: left; padding: 10px;">
              <p style="font-family: 'Bangers', cursive; font-size: 20px; margin-bottom: 10px;">🎯 QUEST 1: COMBAT READINESS</p>
              <p style="line-height: 1.8; margin-bottom: 10px;">
                Welcome back, Droplet. You survived your first encounter — now it's time to prove yourself.<br><br>
                <b>YOUR MISSION:</b> Head back out and eliminate <b>3 enemies</b> in a single run.<br><br>
                Once you achieve 3 kills, return here to claim your reward and unlock new camp upgrades.
              </p>
              <p style="font-size: 13px; color: #FFD700;">Reward: +50 Gold · +3 Skill Points · Skill Tree Unlocked</p>
            </div>`,
            'ACCEPT MISSION!'
          );
        }
      }
      
      // Fallback: auto-activate quest2 if quest1 is claimed but quest2 hasn't started
      // Also check if quest2 is active but skills are already bought
      ensureQuest2Activated();
      saveSaveData();
      
      // Quest ID to display name mapping
      const questNames = {
        'firstRun': 'Quest 1: Kill One Enemy',
        'useSkillTree': 'Quest 2: Activate and Claim Two Skills',
        'unlockForge': 'Quest 3: Unlock Progression Upgrades',
        'unlockArmory': 'Quest 4: Unlock Armory',
        'unlockRecycle': 'Quest 5: Unlock Trash & Recycle',
        'unlockCompanionHouse': 'Quest 6: Unlock Companion House',
        'unlockTrainingHall': 'Quest 7: Unlock Training Hall',
        'survive60Seconds': 'Quest 8: Survive 60 Seconds',
        'kill50Enemies': 'Quest 9: Kill 50 Enemies',
        'upgradeAnyBuildingTo3': 'Quest 10: Upgrade Building to Level 3'
      };
      
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.95);
        z-index: 150;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease-out;
        overflow-y: auto;
      `;
      
      const panel = document.createElement('div');
      panel.style.cssText = `
        background: linear-gradient(135deg, #1e3a5f 0%, #0d1f3a 100%);
        background-image: radial-gradient(circle at 3px 3px, rgba(255,215,0,0.08) 2px, transparent 2px);
        background-size: 15px 15px;
        border: 6px solid #FFD700;
        border-radius: 10px;
        padding: 20px;
        max-width: 90vw;
        width: 90%;
        max-height: 85vh;
        overflow-y: auto;
        box-sizing: border-box;
        text-align: center;
        animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.1);
        box-shadow: 0 0 40px rgba(255,215,0,0.6), inset 0 0 30px rgba(0,0,0,0.3);
        font-family: 'Bangers', cursive;
      `;
      
      let content = `
        <div style="font-size: 32px; color: #FFD700; font-weight: bold; margin-bottom: 20px; text-shadow: 3px 3px 0 #000, -1px -1px 0 #000; letter-spacing: 2px;">📜 MAIN BUILDING</div>
        <div style="font-size: 16px; color: #AAA; margin-bottom: 30px; font-family: Arial, sans-serif;">Claim completed quests to unlock rewards and progress!</div>
      `;
      
      // Initialize tutorial quest arrays if they don't exist
      if (!saveData.tutorialQuests.readyToClaim) {
        saveData.tutorialQuests.readyToClaim = [];
      }
      if (!saveData.tutorialQuests.completedQuests) {
        saveData.tutorialQuests.completedQuests = [];
      }
      
      // Show ready-to-claim quests
      if (saveData.tutorialQuests.readyToClaim.length > 0) {
        content += `<div style="text-align: left; margin-bottom: 20px;">`;
        content += `<div style="font-size: 20px; color: #FFD700; margin-bottom: 15px;">✨ Ready to Claim:</div>`;
        
        saveData.tutorialQuests.readyToClaim.forEach(questId => {
          const quest = TUTORIAL_QUESTS[questId];
          if (!quest) return;
          
          content += `
            <div style="background: rgba(255,215,0,0.1); border: 2px solid #FFD700; border-radius: 10px; padding: 15px; margin-bottom: 10px;">
              <div style="font-size: 18px; color: #FFD700; margin-bottom: 5px;">${quest.name}</div>
              <div style="font-size: 14px; color: #AAA; margin-bottom: 10px;">${quest.description}</div>
              <button class="btn claim-quest-btn" data-quest-id="${questId}" 
                      aria-label="Claim quest reward"
                      style="font-size: 16px; padding: 10px 20px; background: #FFD700; color: #000; cursor: pointer; font-weight: bold;">
                🎁 Claim Reward
              </button>
            </div>
          `;
        });
        content += `</div>`;
      } else {
        content += `<div style="font-size: 16px; color: #888; margin-bottom: 20px;">No quests ready to claim. Complete your active quest!</div>`;
      }
      
      // Show active quest
      const currentQuest = getCurrentQuest();
      if (currentQuest) {
        content += `
          <div style="text-align: left; margin-bottom: 20px;">
            <div style="font-size: 20px; color: #5DADE2; margin-bottom: 15px;">📍 Active Quest:</div>
            <div style="background: rgba(93,173,226,0.1); border: 2px solid #5DADE2; border-radius: 10px; padding: 15px;">
              <div style="font-size: 18px; color: #5DADE2; margin-bottom: 5px;">${currentQuest.name}</div>
              <div style="font-size: 14px; color: #AAA;">${currentQuest.description}</div>
              <div style="font-size: 12px; color: #777; margin-top: 5px;">Objective: ${currentQuest.objectives}</div>
            </div>
          </div>
        `;
      }
      
      // Show completed quests count
      content += `
        <div style="font-size: 14px; color: #AAA; margin-top: 20px;">
          Completed Quests: ${saveData.tutorialQuests.completedQuests.length} / ${Object.keys(TUTORIAL_QUESTS).length}
        </div>
      `;
      
      // Close button
      content += `
        <button class="btn start-run-btn" style="margin-top: 20px; font-size: 18px; padding: 12px 35px; background: #27ae60; color: #FFF; margin-right: 10px;">
          ▶ Start New Run
        </button>
        <button class="btn" style="margin-top: 20px; font-size: 16px; padding: 10px 30px; background: #888; color: #FFF;">
          Close
        </button>
      `;
      
      panel.innerHTML = content;
      overlay.setAttribute('data-quest-hall-overlay', 'true');
      
      // Add event listeners for claim buttons
      panel.querySelectorAll('.claim-quest-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const questId = this.getAttribute('data-quest-id');
          console.log('[Quest] Claiming quest:', questId);
          
          // Remove Quest Hall overlay immediately so the reward popup is clearly visible
          const overlayElement = document.body.querySelector('[data-quest-hall-overlay]');
          if (overlayElement) {
            document.body.removeChild(overlayElement);
          }
          
          // Claim the quest (shows reward popup + triggers next quest)
          claimTutorialQuest(questId);
        });
      });
      
      // Start New Run button handler
      const startRunBtn = panel.querySelector('.start-run-btn');
      if (startRunBtn) {
        startRunBtn.onclick = () => {
          document.body.removeChild(overlay);
          startGame();
        };
      }

      // Shared close handler for quest hall
      const questHallClose = () => {
        document.body.removeChild(overlay);
        if (wasGameActive) setGamePaused(false);
        updateCampScreen(); // Refresh camp to remove ! notification
      };
      
      // Close button handler
      const closeBtn = panel.querySelector('.btn[style*="background: #888"]');
      closeBtn.onclick = questHallClose;
      
      // Add X close button to quest hall panel
      const questHallXBtn = document.createElement('button');
      questHallXBtn.className = 'overlay-close-x';
      questHallXBtn.innerHTML = '✕';
      questHallXBtn.title = 'Close';
      panel.style.position = 'relative';
      panel.appendChild(questHallXBtn);
      questHallXBtn.onclick = questHallClose;
      
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
    }

    // --- ACCOUNT LEVEL SYSTEM ---
    // Account XP: 1 XP per kill (across all runs) + 50 XP per quest completed
    // Level threshold = level * 100 (e.g., level 1 needs 100xp, level 2 needs 200xp, etc.)
    function addAccountXP(amount) {
      if (!saveData.accountXP) saveData.accountXP = 0;
      if (!saveData.accountLevel) saveData.accountLevel = 1;
      saveData.accountXP += amount;
      // Check for level-up
      let leveledUp = false;
      while (saveData.accountXP >= getAccountLevelXPRequired(saveData.accountLevel)) {
        saveData.accountXP -= getAccountLevelXPRequired(saveData.accountLevel);
        saveData.accountLevel++;
        leveledUp = true;
        // Reward on account level-up (rotate between reward types)
        const rewardCycle = (saveData.accountLevel - 1) % 4;
        let rewardLabel = '';
        if (rewardCycle === 0) {
          saveData.unspentAttributePoints = (saveData.unspentAttributePoints || 0) + 1;
          rewardLabel = '+1 Attribute Point';
        } else if (rewardCycle === 1) {
          saveData.skillPoints = (saveData.skillPoints || 0) + 1;
          rewardLabel = '+1 Skill Point';
        } else if (rewardCycle === 2) {
          saveData.trainingPoints = (saveData.trainingPoints || 0) + 1;
          rewardLabel = '+1 Training Point';
        } else {
          saveData.gold = (saveData.gold || 0) + 100;
          rewardLabel = '+100 Gold';
        }
        showAccountLevelUpCurtain(saveData.accountLevel, rewardLabel);
      }
      if (leveledUp) saveSaveData();
      updateAccountLevelDisplay();
    }

    // ── Account Level-Up Curtain Animation ──────────────────────
    let _curtainTimer = null;
    let _curtainDismissHandler = null;
    function showAccountLevelUpCurtain(newLevel, rewardLabel) {
      const curtain = document.getElementById('account-levelup-curtain');
      if (!curtain) return;
      // Clear any in-progress curtain
      if (_curtainTimer) { clearTimeout(_curtainTimer); _curtainTimer = null; }
      if (_curtainDismissHandler) {
        curtain.removeEventListener('click', _curtainDismissHandler);
        _curtainDismissHandler = null;
      }
      curtain.classList.remove('curtain-enter', 'curtain-exit');
      curtain.innerHTML = [
        '<div class="curtain-icon">🏆</div>',
        '<div class="curtain-levelup-text">LEVEL UP!</div>',
        `<div class="curtain-level-num">Level ${newLevel}</div>`,
        `<div class="curtain-reward-text">${rewardLabel} · Tap to dismiss</div>`
      ].join('');
      // Force reflow so animation restarts
      void curtain.offsetWidth;
      curtain.classList.add('curtain-enter');

      function dismissCurtain() {
        if (_curtainTimer) { clearTimeout(_curtainTimer); _curtainTimer = null; }
        curtain.classList.remove('curtain-enter');
        curtain.classList.add('curtain-exit');
        curtain.removeEventListener('click', dismissCurtain);
        _curtainDismissHandler = null;
      }
      _curtainDismissHandler = dismissCurtain;
      curtain.addEventListener('click', dismissCurtain);

      // Auto-dismiss after 3.5 seconds
      _curtainTimer = setTimeout(dismissCurtain, 3500);
    }

    function updateAccountLevelDisplay() {
      const levelEl = document.getElementById('account-level-value');
      const barEl = document.getElementById('account-level-bar');
      const textEl = document.getElementById('account-level-progress-text');
      const sectionLevelEl = document.getElementById('account-section-level-display');
      if (!levelEl) return;
      const level = saveData.accountLevel || 1;
      const xp = saveData.accountXP || 0;
      const required = getAccountLevelXPRequired(level);
      const pct = Math.min(100, (xp / required) * 100);
      levelEl.textContent = level;
      if (barEl) barEl.style.width = pct + '%';
      if (textEl) textEl.textContent = `${xp} / ${required} XP`;
      if (sectionLevelEl) sectionLevelEl.textContent = `Level ${level}`;
    }

    // Show the Account section within the camp screen
    function showAccountSection() {
      const campScreen = document.getElementById('camp-screen');
      campScreen.classList.add('camp-subsection-active');
      document.getElementById('camp-buildings-section').style.display = 'none';
      document.getElementById('camp-skills-section').style.display = 'none';
      document.getElementById('camp-sleep-section').style.display = 'none';
      document.getElementById('camp-training-section').style.display = 'none';
      document.getElementById('camp-passive-section').style.display = 'none';
      const campIdleSA = document.getElementById('camp-idle-section');
      if (campIdleSA) campIdleSA.style.display = 'none';
      const accountSection = document.getElementById('camp-account-section');
      if (accountSection) {
        accountSection.style.display = 'block';
        renderAccountContent();
      }
      // Progress quest if relevant
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest15_accountVisit') {
        progressTutorialQuest('quest15_accountVisit', true);
      }
    }

    // Show the Idle Progression section within the camp screen
    function showIdleSection() {
      const campScreen = document.getElementById('camp-screen');
      campScreen.classList.add('camp-subsection-active');
      document.getElementById('camp-buildings-section').style.display = 'none';
      document.getElementById('camp-skills-section').style.display = 'none';
      document.getElementById('camp-sleep-section').style.display = 'none';
      document.getElementById('camp-training-section').style.display = 'none';
      document.getElementById('camp-passive-section').style.display = 'none';
      const accountSection = document.getElementById('camp-account-section');
      if (accountSection) accountSection.style.display = 'none';
      const idleSection = document.getElementById('camp-idle-section');
      if (idleSection) {
        idleSection.style.display = 'block';
        // Refresh the active idle panel
        if (window.GameIdleBootstrap) window.GameIdleBootstrap.refreshPanel();
      }
    }

    // Open idle section and switch to the Expeditions tab
    function showExpeditionsMenu() {
      showIdleSection();
      if (window.GameIdleBootstrap) window.GameIdleBootstrap.switchTab('expeditions');
    }

    // Open idle section and switch to the Prestige tab
    function showPrestigeMenu() {
      showIdleSection();
      if (window.GameIdleBootstrap) window.GameIdleBootstrap.switchTab('prestige');
    }

    // ============================================================
    // AI CHAT BOX CONSOLE
    // ============================================================
    const AI_CHAT_RESPONSES = {
      // Game help
      help: "💧 I'm your Droplet AI assistant! I can help with:\n• Quest info — type 'quest' or 'what to do'\n• Settings — type 'settings' or 'graphics'\n• Game tips — type 'tips'\n• Buildings — type 'buildings'\n• Stats — type 'stats'",
      quest: null, // dynamic
      settings: "⚙️ Settings you can adjust:\n• Type 'lower graphics' to reduce visual effects\n• Type 'higher graphics' for better visuals\n• Type 'more fps' to optimize performance\n• Use the Settings menu for detailed controls",
      tips: "💡 Tips:\n• Collect XP drops to level up fast\n• Use dash to dodge enemy attacks\n• Visit Camp buildings between runs\n• Equip gear from the Armory\n• Defend the Windmill for bonus weapons",
      buildings: "🏕️ Camp Buildings:\n• Quest Hall — start & claim quests\n• Skill Tree — unlock abilities\n• Armory — equip gear\n• Training Hall — upgrade attributes\n• Forge — buy upgrades\n• Character Visuals — customize look\n• Codex — enemy encyclopedia",
      stats: null, // dynamic
      greeting: "💧 Welcome, Droplet! I'm your AI assistant. Type 'help' to see what I can do, or ask me anything about the game!",
    };

    let chatOpen = false;
    let _chatIdleTimer = null;

    // Hide chat tab while joystick is moving
    function hideChatTabForJoystick() {
      const tab = document.getElementById('ai-chat-tab');
      if (tab) tab.classList.add('chat-tab-hidden');
      if (_chatIdleTimer) { clearTimeout(_chatIdleTimer); _chatIdleTimer = null; }
    }

    // Reshow chat tab after a short idle period
    function showChatTabAfterIdle(delay) {
      delay = delay !== undefined ? delay : 1500;
      if (_chatIdleTimer) clearTimeout(_chatIdleTimer);
      _chatIdleTimer = setTimeout(() => {
        const tab = document.getElementById('ai-chat-tab');
        if (tab) tab.classList.remove('chat-tab-hidden');
        _chatIdleTimer = null;
      }, delay);
    }

    // Show a farmer-style reminder bubble near the chat tab
    function showChatReminderBubble(text, inCampMode) {
      const bubble = document.getElementById('chat-reminder-bubble');
      if (!bubble) return;
      bubble.textContent = text;
      bubble.style.display = 'block';
      if (inCampMode) {
        bubble.classList.add('camp-mode');
      } else {
        bubble.classList.remove('camp-mode');
      }
      setTimeout(() => { bubble.style.display = 'none'; }, 5000);
    }

    function initAIChat() {
      const tab = document.getElementById('ai-chat-tab');
      const chatBox = document.getElementById('ai-chat-box');
      const closeBtn = document.getElementById('chat-close-btn');
      const sendBtn = document.getElementById('chat-send-btn');
      const input = document.getElementById('chat-input');
      if (!tab || !chatBox) return;

      tab.onclick = () => toggleChat();
      closeBtn.onclick = () => toggleChat(false);
      sendBtn.onclick = () => sendChatMessage();
      input.onkeydown = (e) => { if (e.key === 'Enter') sendChatMessage(); };

      // Show greeting
      addChatMessage('ai', AI_CHAT_RESPONSES.greeting);
    }

    function toggleChat(forceState) {
      const tab = document.getElementById('ai-chat-tab');
      const chatBox = document.getElementById('ai-chat-box');
      chatOpen = forceState !== undefined ? forceState : !chatOpen;
      if (chatOpen) {
        chatBox.classList.add('chat-visible');
        tab.classList.add('chat-open');
      } else {
        chatBox.classList.remove('chat-visible');
        tab.classList.remove('chat-open');
      }
    }

    function addChatMessage(type, text) {
      const container = document.getElementById('chat-messages');
      if (!container) return;
      const msg = document.createElement('div');
      msg.className = 'chat-msg ' + type;
      msg.textContent = text;
      container.appendChild(msg);
      container.scrollTop = container.scrollHeight;
    }

    function getAIResponse(userText) {
      const lower = userText.toLowerCase().trim();

      // Quest info
      if (lower.includes('quest') || lower.includes('what to do') || lower.includes('objective') || lower.includes('mission')) {
        if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest) {
          const q = TUTORIAL_QUESTS[saveData.tutorialQuests.currentQuest];
          if (q) {
            const readyToClaim = saveData.tutorialQuests.readyToClaim && saveData.tutorialQuests.readyToClaim.length > 0;
            if (readyToClaim) {
              return `✅ Quest ready to claim! Go to Camp → Quest Hall to claim your reward. Current: "${q.name}"`;
            }
            return `📜 Current Quest: "${q.name}"\n${q.description}\nObjective: ${q.objectives}`;
          }
        }
        return "📜 No active quest right now. Visit the Quest Hall in Camp to start a new quest!";
      }

      // Stats
      if (lower.includes('stats') || lower.includes('status') || lower.includes('health') || lower.includes('level')) {
        const ups = saveData.upgrades || {};
        const gold = saveData.gold || 0;
        const kills = saveData.totalKills || 0;
        return `📊 Your Stats:\n• Gold: ${gold}\n• Total Kills: ${kills}\n• Account Level: ${saveData.accountLevel || 1}\n• Upgrades: ${Object.values(ups).reduce((a, b) => a + (b || 0), 0)} total`;
      }

      // Settings/graphics
      if (lower.includes('lag') || lower.includes('fps') || lower.includes('smooth') || lower.includes('performance')) {
        const qs = document.getElementById('quality-select');
        if (window.GameRenderer && window.GameRenderer.setQuality) window.GameRenderer.setQuality('low');
        if (qs) qs.value = 'low';
        return "⚡ I've optimized the settings for better performance. The game should run smoother now. You can also adjust settings manually in the Settings menu.";
      }
      if (lower.includes('lower graphics') || lower.includes('low quality') || lower.includes('reduce quality')) {
        const qs = document.getElementById('quality-select');
        if (window.GameRenderer && window.GameRenderer.setQuality) window.GameRenderer.setQuality('low');
        if (qs) qs.value = 'low';
        return "📉 Graphics set to low quality for better performance.";
      }
      if (lower.includes('medium graphics') || lower.includes('medium quality')) {
        const qs = document.getElementById('quality-select');
        if (window.GameRenderer && window.GameRenderer.setQuality) window.GameRenderer.setQuality('medium');
        if (qs) qs.value = 'medium';
        return "⚖️ Graphics set to medium quality.";
      }
      if (lower.includes('higher graphics') || lower.includes('high quality') || lower.includes('better graphics') || lower.includes('max quality')) {
        const qs = document.getElementById('quality-select');
        if (window.GameRenderer && window.GameRenderer.setQuality) window.GameRenderer.setQuality('high');
        if (qs) qs.value = 'high';
        return "📈 Graphics set to high quality. If you experience lag, type 'lower graphics'.";
      }
      if (lower.includes('more blood') || lower.includes('effects')) {
        return "🩸 Visual effects are at maximum. Enemy hits show blood splatter effects during combat!";
      }

      // Auto-aim toggle
      if (lower.includes('auto aim') || lower.includes('auto-aim') || lower.includes('autoaim')) {
        const cb = document.getElementById('auto-aim-checkbox');
        if (cb && !cb.disabled) {
          const enable = lower.includes('enable') || lower.includes('on') || lower.includes('turn on');
          const disable = lower.includes('disable') || lower.includes('off') || lower.includes('turn off');
          if (enable) { cb.checked = true; cb.dispatchEvent(new Event('change')); return "🎯 Auto-aim enabled!"; }
          if (disable) { cb.checked = false; cb.dispatchEvent(new Event('change')); return "🎯 Auto-aim disabled."; }
          return `🎯 Auto-aim is currently ${cb.checked ? 'ON' : 'OFF'}. Say "enable auto-aim" or "disable auto-aim" to toggle.`;
        }
        return "🔒 Auto-aim must be unlocked in the Skill Tree before it can be enabled.";
      }

      // Sound toggle
      if (lower.includes('sound') && (lower.includes('on') || lower.includes('off') || lower.includes('enable') || lower.includes('disable') || lower.includes('mute') || lower.includes('unmute'))) {
        const st = document.getElementById('sound-toggle');
        if (st) {
          const enable = lower.includes('on') || lower.includes('enable') || lower.includes('unmute');
          st.checked = enable;
          st.dispatchEvent(new Event('change'));
          return enable ? "🔊 Sound effects enabled!" : "🔇 Sound effects muted.";
        }
      }

      // Music toggle
      if (lower.includes('music') && (lower.includes('on') || lower.includes('off') || lower.includes('enable') || lower.includes('disable') || lower.includes('mute') || lower.includes('unmute'))) {
        const mt = document.getElementById('music-toggle');
        if (mt) {
          const enable = lower.includes('on') || lower.includes('enable') || lower.includes('unmute');
          mt.checked = enable;
          mt.dispatchEvent(new Event('change'));
          return enable ? "🎵 Music enabled!" : "🎵 Music muted.";
        }
      }

      // Control type
      if (lower.includes('keyboard') && lower.includes('control')) {
        const cs = document.getElementById('control-type-select');
        if (cs) { cs.value = 'keyboard'; cs.dispatchEvent(new Event('change')); return "⌨️ Controls switched to keyboard."; }
      }
      if (lower.includes('gamepad') || lower.includes('controller')) {
        const cs = document.getElementById('control-type-select');
        if (cs) { cs.value = 'gamepad'; cs.dispatchEvent(new Event('change')); return "🎮 Controls switched to gamepad."; }
      }
      if (lower.includes('touch') && lower.includes('control')) {
        const cs = document.getElementById('control-type-select');
        if (cs) { cs.value = 'touch'; cs.dispatchEvent(new Event('change')); return "👆 Controls switched to touch (joystick)."; }
      }

      // Settings
      if (lower.includes('setting') || lower.includes('config') || lower.includes('option')) {
        return AI_CHAT_RESPONSES.settings;
      }

      // Buildings
      if (lower.includes('building') || lower.includes('camp') || lower.includes('upgrade')) {
        return AI_CHAT_RESPONSES.buildings;
      }

      // Tips
      if (lower.includes('tip') || lower.includes('hint') || lower.includes('advice') || lower.includes('how to')) {
        return AI_CHAT_RESPONSES.tips;
      }

      // Help
      if (lower.includes('help') || lower === '?') {
        return AI_CHAT_RESPONSES.help;
      }

      // Claim rewards
      if (lower.includes('claim') || lower.includes('reward')) {
        if (saveData.tutorialQuests && saveData.tutorialQuests.readyToClaim && saveData.tutorialQuests.readyToClaim.length > 0) {
          return "🎁 You have rewards ready to claim! Go to Camp → Quest Hall and click the quest to claim your rewards.";
        }
        return "🎁 No rewards ready to claim right now. Complete your current quest objectives first!";
      }

      // Achievement
      if (lower.includes('achievement') || lower.includes('trophy')) {
        return "🏆 Visit the Achievement Hall in Camp to see all your achievements and claim rewards!";
      }

      // Companion
      if (lower.includes('companion') || lower.includes('pet') || lower.includes('wolf')) {
        return "🐺 Companions fight by your side! Visit the Companion House in Camp to manage and upgrade them.";
      }

      // Codex
      if (lower.includes('codex') || lower.includes('enemy') || lower.includes('enemies') || lower.includes('bestiary')) {
        return "📖 The Codex contains info on all enemies, landmarks, and structures. Visit the Codex building in Camp!";
      }

      // Default
      return "💧 I'm not sure about that. Type 'help' to see what I can assist with, or try asking about quests, settings, tips, or buildings!";
    }

    function sendChatMessage() {
      const input = document.getElementById('chat-input');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      addChatMessage('user', text);
      setTimeout(() => {
        const response = getAIResponse(text);
        addChatMessage('ai', response);
      }, 300 + Math.random() * 400);
    }

    // Add dynamic system messages to chat
    function chatSystemMessage(text) {
      addChatMessage('system', text);
    }

    // ============================================================
    // CHARACTER VISUALS SCREEN
    // ============================================================
    const CHARACTER_ACCESSORIES = [
      { id: 'none', name: '❌ None', emoji: '' },
      { id: 'headband', name: '🎀 Headband', emoji: '🎀' },
      { id: 'eyepatch', name: '🏴‍☠️ Eye Patch', emoji: '🏴‍☠️' },
      { id: 'armbands', name: '💪 Arm Bands', emoji: '💪' },
      { id: 'earrings', name: '💎 Earrings', emoji: '💎' },
      { id: 'crown', name: '👑 Crown', emoji: '👑' },
    ];

    const CHARACTER_ANIMATIONS = [
      { id: 'idle', name: '🧍 Idle' },
      { id: 'breathe', name: '🌬️ Breathe' },
      { id: 'dash', name: '💨 Dash' },
      { id: 'turn', name: '🔄 Turn' },
      { id: 'smoke', name: '🚬 Smoke' },
      { id: 'die', name: '💀 Die' },
    ];

    const CHARACTER_OUTFITS = [
      { id: 'default', name: '💧 Default' },
      { id: 'warrior', name: '⚔️ Warrior' },
      { id: 'ninja', name: '🥷 Ninja' },
      { id: 'royal', name: '👑 Royal' },
      { id: 'shadow', name: '🌑 Shadow' },
    ];

    function openCharacterVisuals() {
      const screen = document.getElementById('character-visuals-screen');
      if (!screen) return;
      screen.style.display = 'flex';

      // Initialize save data for character visuals if needed
      if (!saveData.characterVisuals) {
        saveData.characterVisuals = { accessory: 'none', animation: 'idle', outfit: 'default' };
      }

      // Render accessory options
      const accContainer = document.getElementById('char-vis-accessories');
      accContainer.innerHTML = '';
      CHARACTER_ACCESSORIES.forEach(acc => {
        const btn = document.createElement('div');
        btn.className = 'char-vis-option' + (saveData.characterVisuals.accessory === acc.id ? ' selected' : '');
        btn.textContent = acc.name;
        btn.onclick = () => {
          saveData.characterVisuals.accessory = acc.id;
          saveSaveData();
          updateCharPreview();
          accContainer.querySelectorAll('.char-vis-option').forEach(el => el.classList.remove('selected'));
          btn.classList.add('selected');
          chatSystemMessage(`🎨 Accessory changed to ${acc.name}`);
        };
        accContainer.appendChild(btn);
      });

      // Render animation options
      const animContainer = document.getElementById('char-vis-animations');
      animContainer.innerHTML = '';
      CHARACTER_ANIMATIONS.forEach(anim => {
        const btn = document.createElement('div');
        btn.className = 'char-vis-option' + (saveData.characterVisuals.animation === anim.id ? ' selected' : '');
        btn.textContent = anim.name;
        btn.onclick = () => {
          saveData.characterVisuals.animation = anim.id;
          saveSaveData();
          updateCharPreview();
          animContainer.querySelectorAll('.char-vis-option').forEach(el => el.classList.remove('selected'));
          btn.classList.add('selected');
          chatSystemMessage(`🎬 Animation changed to ${anim.name}`);
        };
        animContainer.appendChild(btn);
      });

      // Render outfit options
      const outfitContainer = document.getElementById('char-vis-outfits');
      outfitContainer.innerHTML = '';
      CHARACTER_OUTFITS.forEach(outfit => {
        const btn = document.createElement('div');
        btn.className = 'char-vis-option' + (saveData.characterVisuals.outfit === outfit.id ? ' selected' : '');
        btn.textContent = outfit.name;
        btn.onclick = () => {
          saveData.characterVisuals.outfit = outfit.id;
          saveSaveData();
          updateCharPreview();
          outfitContainer.querySelectorAll('.char-vis-option').forEach(el => el.classList.remove('selected'));
          btn.classList.add('selected');
          chatSystemMessage(`👕 Outfit changed to ${outfit.name}`);
        };
        outfitContainer.appendChild(btn);
      });

      updateCharPreview();

      // Back button
      document.getElementById('char-vis-back-btn').onclick = () => {
        screen.style.display = 'none';
        document.getElementById('camp-screen').style.display = 'flex';
      };
    }

    function updateCharPreview() {
      const drop = document.getElementById('char-preview-drop');
      if (!drop) return;
      const vis = saveData.characterVisuals || {};

      // Update accessory display
      const acc = CHARACTER_ACCESSORIES.find(a => a.id === vis.accessory) || CHARACTER_ACCESSORIES[0];
      const accEmoji = acc.emoji ? `<span style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);font-size:22px;">${acc.emoji}</span>` : '';

      // Update animation
      let animStyle = 'animation: char-breathe 3s ease-in-out infinite;';
      if (vis.animation === 'dash') animStyle = 'animation: char-breathe 0.5s ease-in-out infinite;';
      else if (vis.animation === 'turn') animStyle = 'animation: char-breathe 2s ease-in-out infinite; transform: scaleX(-1);';
      else if (vis.animation === 'die') animStyle = 'animation: none; transform: rotate(90deg); opacity: 0.5;';
      else if (vis.animation === 'smoke') animStyle = 'animation: char-breathe 4s ease-in-out infinite;';

      // Update outfit color
      let outfitGrad = 'radial-gradient(ellipse at 30% 30%, #87CEEB, #4A90D9, #2E5BA7)';
      if (vis.outfit === 'warrior') outfitGrad = 'radial-gradient(ellipse at 30% 30%, #CD853F, #8B4513, #654321)';
      else if (vis.outfit === 'ninja') outfitGrad = 'radial-gradient(ellipse at 30% 30%, #333, #111, #000)';
      else if (vis.outfit === 'royal') outfitGrad = 'radial-gradient(ellipse at 30% 30%, #FFD700, #DAA520, #B8860B)';
      else if (vis.outfit === 'shadow') outfitGrad = 'radial-gradient(ellipse at 30% 30%, #4a0080, #2d004d, #1a0033)';

      const cigarEmoji = vis.animation === 'die' ? '' : '🚬';
      drop.style.cssText = `width:80px;height:100px;background:${outfitGrad};border-radius:50% 50% 50% 50% / 60% 60% 40% 40%;position:relative;${animStyle}`;
      drop.innerHTML = `${accEmoji}<span style="position:absolute;right:-16px;top:35%;font-size:18px;">${cigarEmoji}</span>`;
    }

    // ============================================================
    // CODEX SCREEN
    // ============================================================
    const CODEX_ENTRIES = [
      // Enemies
      { category: 'Enemies', icon: '🟥', name: 'Tank', desc: 'High HP, slow-moving enemy. Absorbs damage like a sponge.', bubble: '"You shall not pass... quickly."' },
      { category: 'Enemies', icon: '🟨', name: 'Fast Runner', desc: 'Low HP but extremely quick. Flanks from the sides.', bubble: '"Catch me if you can!"' },
      { category: 'Enemies', icon: '🟦', name: 'Balanced', desc: 'Mid-range stats. A well-rounded threat.', bubble: '"Perfectly balanced, as all things should be."' },
      { category: 'Enemies', icon: '🟪', name: 'Slowing', desc: 'Slows you on hit. Watch out for their debuff attacks.', bubble: '"Slow down, friend..."' },
      { category: 'Enemies', icon: '🟫', name: 'Ranged', desc: 'Attacks from distance with projectiles.', bubble: '"Distance is my ally."' },
      { category: 'Enemies', icon: '🔵', name: 'Flying', desc: 'Airborne enemy. Swoops in for attacks.', bubble: '"The sky is mine!"' },
      { category: 'Enemies', icon: '⬛', name: 'Hard Tank', desc: 'Very high HP variant. Incredibly durable.', bubble: '"I am the wall."' },
      { category: 'Enemies', icon: '⚡', name: 'Hard Fast', desc: 'Enhanced speed variant. Blisteringly quick.', bubble: '"Lightning never strikes twice... or does it?"' },
      { category: 'Enemies', icon: '🔴', name: 'Elite', desc: '1.5× damage. A formidable foe.', bubble: '"I am no ordinary enemy."' },
      { category: 'Enemies', icon: '💀', name: 'Mini Boss', desc: 'Boss with scaling HP. Beware their power.', bubble: '"Prepare yourself, Droplet!"' },
      { category: 'Enemies', icon: '🦅', name: 'Flying Boss', desc: 'Giant flying boss appearing at level 15+.', bubble: '"From the skies, I descend upon you!"' },
      { category: 'Enemies', icon: '🐛', name: 'Bug Ranged', desc: 'Water-bug variant with ranged attacks.', bubble: '"Bzzt! Incoming!"' },
      // Landmarks
      { category: 'Landmarks', icon: '🗿', name: 'Stonehenge', desc: 'Ancient stone circle. Quest chests appear here.', bubble: '"Legends say treasures lie within..."' },
      { category: 'Landmarks', icon: '🔺', name: 'Pyramid', desc: 'Mysterious pyramid structure on the map.', bubble: '"Built by ancient water civilizations."' },
      { category: 'Landmarks', icon: '🏔️', name: 'Montana', desc: 'Mountain region with survival challenges.', bubble: '"Survive the heights!"' },
      { category: 'Landmarks', icon: '⚡', name: 'Tesla Tower', desc: 'Electrifying landmark with special encounters.', bubble: '"Power courses through these walls."' },
      // Structures
      { category: 'Structures', icon: '🏠', name: 'Windmill', desc: 'Defend it from enemies to earn rewards.', bubble: '"The farmer needs your help!"' },
      { category: 'Structures', icon: '⛺', name: 'Camp', desc: 'Your home base. Upgrade buildings here.', bubble: '"Rest, upgrade, and prepare for the next run."' },
      // Spawn Points
      { category: 'Spawn Points', icon: '⛲', name: 'Spawn Fountain', desc: 'Where your journey begins each run.', bubble: '"From these waters, heroes rise."' },
      { category: 'Spawn Points', icon: '🌀', name: 'Enemy Spawner', desc: 'Enemies emerge from these dark portals.', bubble: '"Endless waves flow from within."' },
      // Perks
      { category: 'Perks', icon: '🧛', name: 'Vampire', desc: 'Lifesteal on hit. Sustain through combat.', bubble: '"Your pain is my gain."' },
      { category: 'Perks', icon: '🛡️', name: 'Juggernaut', desc: 'Bonus HP and armor. Become unstoppable.', bubble: '"Nothing can stop me!"' },
      { category: 'Perks', icon: '⚡', name: 'Swift', desc: 'Increased movement and attack speed.', bubble: '"Speed is everything."' },
      { category: 'Perks', icon: '🍀', name: 'Lucky', desc: 'Higher crit chance and better drops.', bubble: '"Fortune favors the bold!"' },
    ];

    let codexPage = 0;
    const CODEX_PER_PAGE = 6;

    function openCodex() {
      const screen = document.getElementById('codex-screen');
      if (!screen) return;
      screen.style.display = 'flex';
      codexPage = 0;
      renderCodexPage();

      document.getElementById('codex-back-btn').onclick = () => {
        screen.style.display = 'none';
        document.getElementById('camp-screen').style.display = 'flex';
      };
      document.getElementById('codex-prev-btn').onclick = () => {
        if (codexPage > 0) { codexPage--; renderCodexPage(); }
      };
      document.getElementById('codex-next-btn').onclick = () => {
        const maxPage = Math.ceil(CODEX_ENTRIES.length / CODEX_PER_PAGE) - 1;
        if (codexPage < maxPage) { codexPage++; renderCodexPage(); }
      };
    }

    function renderCodexPage() {
      const container = document.getElementById('codex-pages');
      if (!container) return;
      container.innerHTML = '';

      const start = codexPage * CODEX_PER_PAGE;
      const end = Math.min(start + CODEX_PER_PAGE, CODEX_ENTRIES.length);
      const totalPages = Math.ceil(CODEX_ENTRIES.length / CODEX_PER_PAGE);

      for (let i = start; i < end; i++) {
        const entry = CODEX_ENTRIES[i];
        const div = document.createElement('div');
        div.className = 'codex-entry';
        div.innerHTML = `
          <div class="codex-entry-icon">${entry.icon}</div>
          <div class="codex-entry-name">${entry.name}</div>
          <div class="codex-entry-desc">${entry.desc}</div>
          <div class="codex-entry-bubble">${entry.bubble}</div>
          <div style="font-size:10px;color:#888;margin-top:6px;text-align:center;">${entry.category}</div>
        `;
        container.appendChild(div);
      }

      // Update pagination
      document.getElementById('codex-page-info').textContent = `Page ${codexPage + 1} of ${totalPages}`;
      document.getElementById('codex-prev-btn').disabled = codexPage <= 0;
      document.getElementById('codex-next-btn').disabled = codexPage >= totalPages - 1;
    }

    // ============================================================
    // INVENTORY SCREEN
    // ============================================================
    function showInventoryScreen() {
      // Close camp screen
      const campScreen = document.getElementById('camp-screen');
      if (campScreen) campScreen.style.display = 'none';

      // Remove any existing inventory modal
      const existingModal = document.getElementById('inventory-screen-modal');
      if (existingModal) existingModal.remove();

      const modal = document.createElement('div');
      modal.id = 'inventory-screen-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:200;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding:20px;box-sizing:border-box;';

      const currencies = [
        { icon: '🪙', name: 'Gold', value: saveData.gold || 0 },
        { icon: '💎', name: 'Gems', value: saveData.gems || 0 },
        { icon: '✨', name: 'Essence', value: saveData.essence || 0 }
      ];

      const currencyHTML = currencies.map(c =>
        `<div style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,215,0,0.1);border:1px solid #FFD700;border-radius:8px;padding:8px 14px;margin:4px;">
          <span style="font-size:20px;">${c.icon}</span>
          <span style="color:#FFD700;font-size:16px;font-weight:bold;">${c.value.toLocaleString()}</span>
          <span style="color:#aaa;font-size:12px;">${c.name}</span>
        </div>`
      ).join('');

      // Special Items section
      let specialItemsHTML = '';
      if (saveData.hasCompanionEgg) {
        const alreadyHatched = saveData.companionEggHatched;
        specialItemsHTML += `
          <div style="background:linear-gradient(135deg,rgba(0,255,180,0.15),rgba(0,100,80,0.3));border:2px solid #00FFB4;border-radius:12px;padding:16px;margin:8px 0;display:flex;align-items:center;gap:14px;">
            <div style="font-size:48px;animation:pulse 1.5s ease-in-out infinite;">🥚</div>
            <div style="flex:1;">
              <div style="color:#00FFB4;font-size:18px;font-weight:bold;">Mysterious Companion Egg</div>
              <div style="color:#aaa;font-size:13px;margin:4px 0;">Found at the UFO crash site in Area 51. Something stirs within...</div>
              <div style="color:#FFD700;font-size:12px;">★★★ LEGENDARY ★★★</div>
            </div>
            <div>
              ${alreadyHatched
                ? '<span style="color:#00FF88;font-size:13px;">✅ Hatched</span>'
                : `<button onclick="document.getElementById('inventory-screen-modal').remove();document.getElementById('camp-screen').style.display='flex';showCompanionHouse();" style="background:linear-gradient(135deg,#00FFB4,#0080FF);border:none;border-radius:8px;padding:10px 16px;color:#000;font-weight:bold;cursor:pointer;font-size:13px;">Place in Companion House →</button>`
              }
            </div>
          </div>`;
      }

      // Gear inventory
      const gear = saveData.inventory || [];
      const gearHTML = gear.length === 0
        ? '<div style="color:#666;text-align:center;padding:20px;">No gear collected yet. Complete runs to find gear!</div>'
        : gear.map((item, idx) => {
          const rarityColor = { common:'#aaa', uncommon:'#1aff1a', rare:'#0070dd', epic:'#a335ee', legendary:'#ff8000' }[item.rarity] || '#aaa';
          const rarityStars = { common:'★', uncommon:'★★', rare:'★★★', epic:'★★★★', legendary:'★★★★★' }[item.rarity] || '★';
          const isEquipped = saveData.equippedGear && Object.values(saveData.equippedGear).some(g => g && g.id === item.id);
          return `
            <div style="background:rgba(255,255,255,0.05);border:1px solid ${rarityColor};border-radius:8px;padding:12px;margin:6px 0;display:flex;align-items:center;gap:12px;">
              <div style="font-size:32px;">${item.type === 'ring' ? '💍' : item.type === 'amulet' ? '📿' : item.type === 'helmet' ? '⛑️' : item.type === 'boots' ? '👢' : '🛡️'}</div>
              <div style="flex:1;">
                <div style="color:${rarityColor};font-size:15px;font-weight:bold;">${item.name}</div>
                <div style="color:#aaa;font-size:12px;">${item.description || ''}</div>
                <div style="color:${rarityColor};font-size:11px;">${rarityStars} ${(item.rarity || 'common').toUpperCase()}</div>
              </div>
              <div>
                ${isEquipped
                  ? '<span style="color:#FFD700;font-size:12px;">✅ Equipped</span>'
                  : `<button onclick="equipItemFromInventory(${idx})" style="background:rgba(255,215,0,0.2);border:1px solid #FFD700;border-radius:6px;padding:6px 12px;color:#FFD700;cursor:pointer;font-size:12px;">Equip</button>`
                }
              </div>
            </div>`;
        }).join('');

      modal.innerHTML = `
        <div style="max-width:640px;width:100%;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
            <h2 style="color:#FFD700;margin:0;font-size:22px;">📦 Inventory</h2>
            <button id="inv-back-btn" style="background:rgba(255,255,255,0.1);border:1px solid #666;border-radius:8px;padding:8px 16px;color:#fff;cursor:pointer;">← Back to Camp</button>
          </div>

          <div style="background:rgba(255,215,0,0.05);border:1px solid #FFD700;border-radius:12px;padding:16px;margin-bottom:20px;">
            <div style="color:#FFD700;font-size:14px;font-weight:bold;margin-bottom:10px;">💰 Currencies</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">${currencyHTML}</div>
          </div>

          ${saveData.hasCompanionEgg ? `
          <div style="background:rgba(0,255,180,0.05);border:1px solid #00FFB4;border-radius:12px;padding:16px;margin-bottom:20px;">
            <div style="color:#00FFB4;font-size:14px;font-weight:bold;margin-bottom:10px;">✨ Special Items</div>
            ${specialItemsHTML}
          </div>` : ''}

          <div style="background:rgba(255,255,255,0.03);border:1px solid #444;border-radius:12px;padding:16px;">
            <div style="color:#fff;font-size:14px;font-weight:bold;margin-bottom:10px;">⚔️ Gear (${gear.length} items)</div>
            ${gearHTML}
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      document.getElementById('inv-back-btn').onclick = () => {
        modal.remove();
        if (campScreen) campScreen.style.display = 'flex';
      };
    }

    // Equip item directly from inventory screen
    function equipItemFromInventory(itemIdx) {
      const item = saveData.inventory[itemIdx];
      if (!item) return;
      const slot = item.type || 'ring';
      if (!saveData.equippedGear) saveData.equippedGear = {};
      saveData.equippedGear[slot] = item;
      saveSaveData();
      showStatChange(`🎯 ${item.name} Equipped!`);
      // Refresh inventory screen
      const modal = document.getElementById('inventory-screen-modal');
      if (modal) { modal.remove(); showInventoryScreen(); }
    }
    window.equipItemFromInventory = equipItemFromInventory;

    // ============================================================
    // COMPANION HOUSE SCREEN
    // ============================================================

    // Companion skill tree data
    const COMPANION_SKILLS = {
      attackBoost:  { name: '⚔️ Combat Training', desc: '+15% companion damage per level', maxLevel: 5, cost: 1, effect: (lvl) => lvl * 0.15 },
      speedBoost:   { name: '💨 Swift Paws', desc: '+10% companion attack speed per level', maxLevel: 5, cost: 1, effect: (lvl) => lvl * 0.10 },
      healing:      { name: '💚 Healing Aura', desc: 'Companion heals player for 2 HP per level every 5s', maxLevel: 5, cost: 2, effect: (lvl) => lvl * 2 },
      toughness:    { name: '🛡️ Iron Hide', desc: '+20 companion HP per level', maxLevel: 5, cost: 1, effect: (lvl) => lvl * 20 },
      critStrike:   { name: '✨ Critical Strike', desc: '+5% critical hit chance per level', maxLevel: 3, cost: 2, effect: (lvl) => lvl * 0.05 },
      aoeDamage:    { name: '💥 Area Assault', desc: 'Attacks hit all enemies within 2 units (unlocks at level 5)', maxLevel: 1, cost: 3, effect: (lvl) => lvl },
      revive:       { name: '♻️ Undying Bond', desc: 'Companion revives 50% faster per level', maxLevel: 3, cost: 2, effect: (lvl) => lvl * 0.5 },
      expShare:     { name: '📈 XP Link', desc: '+5% bonus XP for both player and companion per level', maxLevel: 5, cost: 1, effect: (lvl) => lvl * 0.05 }
    };

    function showCompanionHouse() {
      const campScreen = document.getElementById('camp-screen');
      if (campScreen) campScreen.style.display = 'none';

      const existingModal = document.getElementById('companion-house-modal');
      if (existingModal) existingModal.remove();

      const modal = document.createElement('div');
      modal.id = 'companion-house-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:200;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding:20px;box-sizing:border-box;';

      // Determine state
      const hasEgg = saveData.hasCompanionEgg;
      const isHatched = saveData.companionEggHatched;
      const hatchProgress = saveData.companionEggHatchProgress || 0;
      const companionId = saveData.selectedCompanion || 'stormWolf';
      const companionData = saveData.companions[companionId] || { unlocked: true, level: 1, xp: 0, skills: {} };
      const companionInfo = COMPANIONS[companionId];
      const companionQuestDone = saveData.tutorialQuests?.completedQuests?.includes('quest9_activateCompanion');

      // Egg section
      let eggSectionHTML = '';
      if (!hasEgg) {
        eggSectionHTML = `
          <div style="background:rgba(255,100,0,0.1);border:1px dashed #FF8000;border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;">
            <div style="font-size:48px;margin-bottom:10px;">🏚️</div>
            <div style="color:#FF8000;font-size:16px;font-weight:bold;">The nest is empty...</div>
            <div style="color:#aaa;font-size:13px;margin-top:8px;">Find the <b style="color:#FFD700;">Companion Egg</b> at the UFO crash site in Area 51 to bring life to this sanctuary!</div>
          </div>`;
      } else if (!isHatched) {
        const progressBar = `<div style="height:12px;background:#333;border-radius:6px;overflow:hidden;margin:10px 0;"><div style="height:100%;width:${hatchProgress}%;background:linear-gradient(90deg,#00FFB4,#0080FF);transition:width 0.5s;border-radius:6px;"></div></div>`;
        eggSectionHTML = `
          <div style="background:linear-gradient(135deg,rgba(0,255,180,0.1),rgba(0,100,80,0.2));border:2px solid #00FFB4;border-radius:12px;padding:20px;margin-bottom:20px;">
            <div style="text-align:center;margin-bottom:14px;">
              <div style="font-size:64px;animation:pulse 1.2s ease-in-out infinite;display:inline-block;">🥚</div>
              <div style="color:#00FFB4;font-size:18px;font-weight:bold;margin-top:8px;">Companion Egg — Incubating</div>
              <div style="color:#aaa;font-size:13px;">Hatching Progress: ${Math.floor(hatchProgress)}%</div>
              ${progressBar}
            </div>
            <div style="text-align:center;">
              <button id="hatch-egg-btn" style="background:linear-gradient(135deg,#00FFB4,#0080FF);border:none;border-radius:10px;padding:12px 28px;color:#000;font-weight:bold;cursor:pointer;font-size:15px;margin-top:4px;">
                🐣 Hatch Egg (Costs 200 Gold)
              </button>
            </div>
          </div>`;
      } else {
        const growthStage = saveData.companionGrowthStage || 'newborn';
        const growthIcons = { newborn: '🐣', juvenile: '🐾', adult: '🐺' };
        const growthLabels = { newborn: 'Newborn', juvenile: 'Juvenile', adult: 'Adult' };
        const growthColors = { newborn: '#FFD700', juvenile: '#FF8C00', adult: '#00FF64' };
        const growthIcon = growthIcons[growthStage] || '🐣';
        const growthLabel = growthLabels[growthStage] || 'Newborn';
        const growthColor = growthColors[growthStage] || '#FFD700';
        eggSectionHTML = `
          <div style="background:linear-gradient(135deg,rgba(255,180,0,0.1),rgba(150,80,0,0.2));border:2px solid ${growthColor};border-radius:12px;padding:16px;margin-bottom:20px;text-align:center;">
            <div style="font-size:36px;">${growthIcon} ✅</div>
            <div style="color:${growthColor};font-size:15px;font-weight:bold;">Companion Egg Hatched!</div>
            <div style="color:#aaa;font-size:12px;">Growth Stage: <b style="color:${growthColor};">${growthLabel}</b></div>
            ${growthStage !== 'adult' ? '<div style="color:#888;font-size:11px;margin-top:4px;">Take your companion on runs to help it grow!</div>' : '<div style="color:#00FF64;font-size:11px;margin-top:4px;">Fully grown! Your companion is at full power.</div>'}
          </div>`;
      }

      // Active companion section
      const xpRequired = [0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 4000];
      const currentXP = companionData.xp || 0;
      const companionLevel = companionData.level || 1;
      const xpNeeded = xpRequired[Math.min(companionLevel, 9)] || 4000;
      const xpPct = Math.min(100, (currentXP / xpNeeded) * 100);
      const isEvolved = companionLevel >= 10;

      const companionSection = `
        <div style="background:rgba(255,255,255,0.04);border:1px solid #555;border-radius:12px;padding:16px;margin-bottom:20px;">
          <div style="color:#FFD700;font-size:15px;font-weight:bold;margin-bottom:12px;">🐺 Active Companion</div>

          <!-- Companion selector -->
          <div style="display:flex;gap:8px;margin-bottom:14px;">
            ${Object.entries(saveData.companions).map(([cId, cData]) => {
              const info = COMPANIONS[cId];
              if (!info) return '';
              const isSelected = cId === companionId;
              const isUnlocked = cData.unlocked;
              return `<button onclick="selectCompanion('${cId}')"
                style="flex:1;padding:10px 6px;border-radius:8px;border:2px solid ${isSelected ? '#FFD700' : '#444'};
                background:${isSelected ? 'rgba(255,215,0,0.15)' : isUnlocked ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.3)'};
                color:${isUnlocked ? '#fff' : '#555'};cursor:${isUnlocked ? 'pointer' : 'default'};font-size:11px;text-align:center;">
                <div style="font-size:22px;">${isEvolved && isSelected ? info.evolvedIcon : info.icon}</div>
                <div>${info.name}</div>
                ${!isUnlocked ? '<div style="color:#f66;font-size:10px;">🔒 Locked</div>' : ''}
              </button>`;
            }).join('')}
          </div>

          <!-- Companion stats -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
            <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;">
              <div style="color:#aaa;font-size:11px;">Level</div>
              <div style="color:#FFD700;font-size:20px;font-weight:bold;">${companionLevel} ${isEvolved ? '⭐' : ''}</div>
            </div>
            <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;">
              <div style="color:#aaa;font-size:11px;">Type</div>
              <div style="color:#4FC3F7;font-size:14px;">${companionInfo?.type || 'melee'}</div>
            </div>
          </div>

          <!-- XP bar -->
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;color:#aaa;font-size:11px;margin-bottom:4px;">
              <span>XP Progress</span><span>${currentXP} / ${xpNeeded}</span>
            </div>
            <div style="height:10px;background:#333;border-radius:5px;overflow:hidden;">
              <div style="height:100%;width:${xpPct}%;background:linear-gradient(90deg,#4FC3F7,#00BFA5);border-radius:5px;transition:width 0.3s;"></div>
            </div>
          </div>

          <!-- Activate button for quest9 -->
          ${!companionQuestDone ? `
          <button id="activate-companion-btn" style="width:100%;background:linear-gradient(135deg,#FF6B35,#FF4500);border:none;border-radius:10px;padding:14px;color:#fff;font-weight:bold;cursor:pointer;font-size:15px;margin-bottom:12px;">
            ⚡ Activate Companion — Fight by Your Side!
          </button>` : `
          <div style="background:rgba(0,255,100,0.1);border:1px solid #00FF64;border-radius:8px;padding:10px;text-align:center;margin-bottom:12px;color:#00FF64;font-size:13px;">
            ✅ Companion Active — Fighting alongside you!
          </div>`}
        </div>`;

      // Skill tree section
      const companionSkillData = companionData.skills || {};
      const skillPoints = saveData.companionSkillPoints || 0;

      const skillTreeHTML = `
        <div style="background:rgba(255,255,255,0.04);border:1px solid #555;border-radius:12px;padding:16px;margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div style="color:#FFD700;font-size:15px;font-weight:bold;">🌟 Companion Skill Tree</div>
            <div style="background:rgba(255,215,0,0.15);border:1px solid #FFD700;border-radius:6px;padding:4px 10px;color:#FFD700;font-size:13px;">
              SP: ${skillPoints}
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            ${Object.entries(COMPANION_SKILLS).map(([skillId, skill]) => {
              const currentLevel = (companionSkillData[skillId] || 0);
              const isMaxed = currentLevel >= skill.maxLevel;
              const canAfford = skillPoints >= skill.cost;
              const requiresLevel5 = skillId === 'aoeDamage' && companionLevel < 5;
              const isLocked = requiresLevel5;
              return `
                <div style="background:rgba(255,255,255,0.05);border:1px solid ${isMaxed ? '#FFD700' : '#444'};border-radius:8px;padding:10px;">
                  <div style="color:${isMaxed ? '#FFD700' : '#fff'};font-size:12px;font-weight:bold;">${skill.name}</div>
                  <div style="color:#aaa;font-size:10px;margin:4px 0;">${skill.desc}</div>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                    <span style="color:#4FC3F7;font-size:11px;">Level ${currentLevel}/${skill.maxLevel}</span>
                    ${isLocked
                      ? '<span style="color:#f66;font-size:10px;">Needs Level 5</span>'
                      : isMaxed
                        ? '<span style="color:#FFD700;font-size:10px;">MAX</span>'
                        : `<button onclick="upgradeCompanionSkill('${skillId}')" style="background:${canAfford ? 'rgba(255,215,0,0.2)' : 'rgba(100,100,100,0.2)'};border:1px solid ${canAfford ? '#FFD700' : '#555'};border-radius:4px;padding:3px 8px;color:${canAfford ? '#FFD700' : '#666'};cursor:${canAfford ? 'pointer' : 'default'};font-size:10px;">${skill.cost} SP</button>`
                    }
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`;

      modal.innerHTML = `
        <div style="max-width:640px;width:100%;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <div>
              <h2 style="color:#FFD700;margin:0;font-size:22px;">🏡 Companion House</h2>
              <div style="color:#aaa;font-size:12px;">A cozy sanctuary for your loyal companions</div>
            </div>
            <button id="ch-back-btn" style="background:rgba(255,255,255,0.1);border:1px solid #666;border-radius:8px;padding:8px 16px;color:#fff;cursor:pointer;">← Back to Camp</button>
          </div>

          ${eggSectionHTML}
          ${companionSection}
          ${skillTreeHTML}
        </div>
      `;

      document.body.appendChild(modal);

      // Back button
      document.getElementById('ch-back-btn').onclick = () => {
        modal.remove();
        if (campScreen) campScreen.style.display = 'flex';
      };

      // Activate companion button (quest9 progression)
      const activateBtn = document.getElementById('activate-companion-btn');
      if (activateBtn) {
        activateBtn.onclick = () => {
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest9_activateCompanion') {
            progressTutorialQuest('quest9_activateCompanion', true);
            saveSaveData();
          }
          activateBtn.outerHTML = '<div style="background:rgba(0,255,100,0.1);border:1px solid #00FF64;border-radius:8px;padding:10px;text-align:center;margin-bottom:12px;color:#00FF64;font-size:13px;">✅ Companion Active — Fighting alongside you!</div>';
          showStatChange('⚡ Companion Activated!');
          playSound('collect');
        };
      }

      // Hatch egg button
      const hatchBtn = document.getElementById('hatch-egg-btn');
      if (hatchBtn) {
        hatchBtn.onclick = () => {
          if (saveData.gold < 200) {
            showStatChange('❌ Not enough Gold! Need 200g to hatch.');
            playSound('invalid');
            return;
          }
          saveData.gold -= 200;
          saveData.companionEggHatchProgress = 100;
          saveData.companionEggHatched = true;
          saveData.companionGrowthStage = 'newborn';
          saveSaveData();
          showStatChange('🐣 Companion Egg Hatched!');
          playSound('collect');
          // Progress quest19 if active
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest19_hatchEgg') {
            progressTutorialQuest('quest19_hatchEgg', true);
          }
          modal.remove();
          showCompanionHouse();
        };
      }
    }

    // Select companion from companion house
    function selectCompanion(companionId) {
      if (!saveData.companions[companionId] || !saveData.companions[companionId].unlocked) {
        showStatChange('🔒 Companion not yet unlocked!');
        return;
      }
      saveData.selectedCompanion = companionId;
      saveSaveData();
      // Check quest20 progress - if companion was leveled
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest20_trainCompanion') {
        const cData = saveData.companions[companionId];
        if (cData && cData.level >= 2 && Object.keys(cData.skills || {}).some(s => (cData.skills[s] || 0) > 0)) {
          progressTutorialQuest('quest20_trainCompanion', true);
        }
      }
      const modal = document.getElementById('companion-house-modal');
      if (modal) { modal.remove(); showCompanionHouse(); }
    }
    window.selectCompanion = selectCompanion;

    // Upgrade a companion skill
    function upgradeCompanionSkill(skillId) {
      const skill = COMPANION_SKILLS[skillId];
      if (!skill) return;
      const companionId = saveData.selectedCompanion || 'stormWolf';
      if (!saveData.companions[companionId]) return;
      if (!saveData.companions[companionId].skills) saveData.companions[companionId].skills = {};
      const currentLevel = saveData.companions[companionId].skills[skillId] || 0;
      if (currentLevel >= skill.maxLevel) { showStatChange('Already at max level!'); return; }
      if ((saveData.companionSkillPoints || 0) < skill.cost) { showStatChange('❌ Not enough Companion Skill Points!'); playSound('invalid'); return; }
      saveData.companionSkillPoints -= skill.cost;
      saveData.companions[companionId].skills[skillId] = currentLevel + 1;
      saveSaveData();
      showStatChange(`✨ ${skill.name} upgraded to Lv ${currentLevel + 1}!`);
      playSound('collect');
      // Progress quest20 if skill unlocked and companion leveled
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest20_trainCompanion') {
        const cData = saveData.companions[companionId];
        if (cData && cData.level >= 2) {
          progressTutorialQuest('quest20_trainCompanion', true);
        }
      }
      const modal = document.getElementById('companion-house-modal');
      if (modal) { modal.remove(); showCompanionHouse(); }
    }
    window.upgradeCompanionSkill = upgradeCompanionSkill;

    // Render account stats inside the account section
    function renderAccountContent() {
      const content = document.getElementById('camp-account-content');
      if (!content) return;
      updateAccountLevelDisplay();
      const defaultStats = getDefaultPlayerStats();
      // Current stats derived from permanent upgrades + attributes
      const ups = saveData.upgrades || {};
      const attrs = saveData.attributes || {};
      const startHp = defaultStats.maxHp || 100;
      const currentHp = startHp + PERMANENT_UPGRADES.maxHp.effect(ups.maxHp || 0) + (attrs.vitality || 0) * 15;
      const startDmg = defaultStats.damage || 1;
      const currentDmg = +(startDmg + PERMANENT_UPGRADES.attackDamage.effect(ups.attackDamage || 0) + (attrs.strength || 0) * 0.1).toFixed(2);
      const startAtkSpd = defaultStats.attackSpeed || 1;
      const currentAtkSpd = +(startAtkSpd + PERMANENT_UPGRADES.attackSpeed.effect(ups.attackSpeed || 0) + (attrs.dexterity || 0) * 0.05).toFixed(2);
      const startCrit = defaultStats.critChance || 0.1;
      const currentCrit = +(startCrit + PERMANENT_UPGRADES.critChance.effect(ups.critChance || 0) + (attrs.dexterity || 0) * 0.02).toFixed(2);
      const startArmor = 0;
      const currentArmor = PERMANENT_UPGRADES.armor.effect(ups.armor || 0) + (attrs.endurance || 0) * 2;

      const statsToShow = [
        { label: 'Max HP',      start: startHp,     current: currentHp },
        { label: 'Damage',      start: startDmg,    current: currentDmg },
        { label: 'Atk Speed',   start: startAtkSpd, current: currentAtkSpd },
        { label: 'Crit Chance', start: startCrit,   current: currentCrit },
        { label: 'Armor',       start: startArmor,  current: currentArmor },
        { label: 'Strength',    start: 1,           current: 1 + (attrs.strength || 0) },
        { label: 'Endurance',   start: 0,           current: attrs.endurance || 0 }, // Training attribute, starts at 0
      ];

      const totalKills = saveData.totalKills || 0;
      const level = saveData.accountLevel || 1;
      const questsDone = (saveData.tutorialQuests && saveData.tutorialQuests.claimedQuests) ? saveData.tutorialQuests.claimedQuests.length : 0;
      const totalRuns = saveData.totalRuns || 0;
      const totalGoldEarned = saveData.totalGoldEarned || 0;
      const bestKills = saveData.bestKills || 0;

      const fmtDelta = (start, current) => {
        const d = (typeof current === 'number' && typeof start === 'number') ? +(current - start).toFixed(2) : 0;
        if (d > 0) return `<span class="stat-delta-positive">+${d}</span>`;
        if (d < 0) return `<span class="stat-delta-negative">${d}</span>`;
        return `<span class="stat-delta-neutral">—</span>`;
      };

      const fmtVal = (v) => typeof v === 'number' ? (v % 1 === 0 ? v : v.toFixed(2)) : v;

      let rows = statsToShow.map(s =>
        `<tr><td>${s.label}</td><td>${fmtVal(s.start)}</td><td>${fmtVal(s.current)}</td><td>${fmtDelta(s.start, s.current)}</td></tr>`
      ).join('');

      content.innerHTML = `
        <div class="building-popup-title">👤 ACCOUNT &amp; RECORDS</div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-bottom:16px;">
          <div style="background:rgba(255,215,0,0.08);border:2px solid #FFD700;border-radius:12px;padding:10px 18px;text-align:center;min-width:100px;">
            <div style="font-family:'Bangers',cursive;font-size:28px;color:#FFD700;">${level}</div>
            <div style="font-size:11px;color:#aaa;">ACCOUNT LEVEL</div>
          </div>
          <div style="background:rgba(255,215,0,0.08);border:2px solid #e74c3c;border-radius:12px;padding:10px 18px;text-align:center;min-width:100px;">
            <div style="font-family:'Bangers',cursive;font-size:28px;color:#e74c3c;">${totalKills}</div>
            <div style="font-size:11px;color:#aaa;">TOTAL KILLS</div>
          </div>
          <div style="background:rgba(255,215,0,0.08);border:2px solid #2ecc71;border-radius:12px;padding:10px 18px;text-align:center;min-width:100px;">
            <div style="font-family:'Bangers',cursive;font-size:28px;color:#2ecc71;">${questsDone}</div>
            <div style="font-size:11px;color:#aaa;">QUESTS DONE</div>
          </div>
          <div style="background:rgba(255,215,0,0.08);border:2px solid #5DADE2;border-radius:12px;padding:10px 18px;text-align:center;min-width:100px;">
            <div style="font-family:'Bangers',cursive;font-size:28px;color:#5DADE2;">${totalRuns}</div>
            <div style="font-size:11px;color:#aaa;">TOTAL RUNS</div>
          </div>
        </div>
        <table class="account-stats-table">
          <thead><tr><th>Stat</th><th>Start</th><th>Now</th><th>Δ</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:14px;font-size:13px;color:#aaa;text-align:center;line-height:2;">
          💰 Total Gold Earned: <span style="color:#FFD700;font-weight:bold;">${totalGoldEarned}</span><br>
          ⚔️ Best Run Kills: <span style="color:#e74c3c;font-weight:bold;">${bestKills}</span>
        </div>
      `;

      // Append GameAccount profile/progression panel (from idle-account.js) if available
      if (window.GameAccount && window.GameAccount.renderAccountPanel) {
        const accPanelWrap = document.createElement('div');
        accPanelWrap.style.cssText = 'margin-top:18px;border-top:2px solid rgba(255,215,0,0.3);padding-top:14px;';
        content.appendChild(accPanelWrap);
        window.GameAccount.renderAccountPanel(saveData, accPanelWrap);
      }
    }

    // Update corner widget notification dots and daily streak label
    function _updateCampCornerWidgets() {
      // Daily reward notification
      const dailyNotif = document.getElementById('camp-daily-notif');
      const dailyStreak = document.getElementById('camp-daily-streak');
      if (window.GameDailies) {
        const canClaim = window.GameDailies.isDailyAvailable(saveData);
        if (dailyNotif) dailyNotif.style.display = canClaim ? 'block' : 'none';
        if (dailyStreak) {
          const streak = (saveData.dailies && saveData.dailies.loginStreak) || 0;
          const day = ((streak) % 7) + 1;
          dailyStreak.textContent = 'DAY ' + day;
        }
      }
      // Spin wheel free spin notification
      const spinNotif = document.getElementById('camp-spin-notif');
      if (spinNotif && window.GameLuckyWheel) {
        const hasFree = window.GameLuckyWheel.canFreeSpin(saveData);
        spinNotif.style.display = hasFree ? 'block' : 'none';
      }
    }

    // Show daily reward panel in a popup overlay
    function _showDailyRewardPanel() {
      if (window.CampWorld && window.CampWorld.isActive) window.CampWorld.pauseInput();
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:500;display:flex;align-items:center;justify-content:center;';
      const _closeDailyOverlay = () => {
        overlay.remove();
        _updateCampCornerWidgets();
        if (window.CampWorld && window.CampWorld.isActive) window.CampWorld.resumeInput();
      };
      const panel = document.createElement('div');
      panel.style.cssText = 'background:linear-gradient(135deg,#1a1a2e,#0d1020);border:4px solid #FFD700;border-radius:14px;padding:24px;max-width:90vw;width:380px;color:#fff;font-family:"Bangers",cursive;text-align:center;box-shadow:0 0 30px rgba(255,215,0,0.5);';
      // Build daily login calendar
      if (window.GameDailies) {
        const streak = (saveData.dailies && saveData.dailies.loginStreak) || 0;
        const canClaim = window.GameDailies.isDailyAvailable(saveData);
        const peeked = canClaim ? window.GameDailies.peekDailyReward(saveData) : null;
        const nextDay = peeked ? peeked.day : 0; // 1-based day number
        const rewards = window.GameDailies.DAILY_LOGIN_REWARDS;
        let html = '<div style="color:#FFD700;font-size:1.6em;margin-bottom:12px;text-shadow:2px 2px 0 #000;letter-spacing:2px;">🎁 DAILY REWARD</div>';
        html += '<div style="font-family:Arial,sans-serif;font-size:13px;color:#ccc;margin-bottom:16px;">Login Streak: <b style="color:#FFD700;">' + streak + ' days</b></div>';
        html += '<div class="daily-login-strip">';
        rewards.forEach(function(r, i) {
          const dayNum = i + 1;
          const claimed = streak >= dayNum && !canClaim;
          const isToday = canClaim && nextDay === dayNum;
          const cls = 'daily-login-day' + (claimed ? ' claimed' : '') + (isToday ? ' today' : '');
          html += '<div class="' + cls + '">';
          html += '<div class="day-num">Day ' + dayNum + '</div>';
          html += '<div class="day-reward">' + (claimed ? '✅' : r.item ? '🎁' : '💰') + '</div>';
          html += '<div class="day-gold">' + r.gold + 'g</div>';
          html += '</div>';
        });
        html += '</div>';
        // Claim button
        if (canClaim) {
          html += '<button id="claim-daily-btn" style="margin-top:16px;background:linear-gradient(to bottom,#2ecc71,#27ae60);color:#fff;border:3px solid #000;border-radius:8px;padding:10px 24px;font-family:Bangers,cursive;font-size:1.1em;letter-spacing:2px;cursor:pointer;box-shadow:3px 3px 0 #000;">CLAIM REWARD</button>';
        } else {
          html += '<div style="margin-top:16px;color:#aaa;font-family:Arial,sans-serif;font-size:13px;">✅ Already claimed today! Come back tomorrow.</div>';
        }
        panel.innerHTML = html;
        if (canClaim) {
          panel.querySelector('#claim-daily-btn').onclick = function() {
            const result = window.GameDailies.checkDailyLogin(saveData);
            if (!result.alreadyClaimed) {
              saveData.gold = (saveData.gold || 0) + result.gold;
              saveSaveData();
              showStatChange('🎁 Day ' + result.day + ' Reward: +' + result.gold + ' Gold!');
            }
            _closeDailyOverlay();
          };
        }
      } else {
        panel.innerHTML = '<div style="color:#FFD700;font-size:1.4em;">Daily Rewards not available</div>';
      }
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'position:absolute;top:12px;right:16px;background:none;border:none;color:#aaa;font-size:20px;cursor:pointer;font-family:Arial,sans-serif;';
      closeBtn.onclick = () => _closeDailyOverlay();
      panel.style.position = 'relative';
      panel.appendChild(closeBtn);
      overlay.appendChild(panel);
      overlay.onclick = (e) => { if (e.target === overlay) _closeDailyOverlay(); };
      document.body.appendChild(overlay);
    }

    // Show spin wheel panel in a popup overlay
    function _showSpinWheelPanel() {
      if (window.CampWorld && window.CampWorld.isActive) window.CampWorld.pauseInput();
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:500;display:flex;align-items:center;justify-content:center;';
      const _closeWheelOverlay = () => {
        overlay.remove();
        _updateCampCornerWidgets();
        if (window.CampWorld && window.CampWorld.isActive) window.CampWorld.resumeInput();
      };
      const panel = document.createElement('div');
      panel.style.cssText = 'background:linear-gradient(135deg,#1a1a2e,#0d1020);border:4px solid #FFD700;border-radius:14px;padding:24px;max-width:90vw;width:420px;color:#fff;font-family:"Bangers",cursive;text-align:center;box-shadow:0 0 30px rgba(255,215,0,0.5);overflow-y:auto;max-height:90vh;';
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'position:absolute;top:12px;right:16px;background:none;border:none;color:#aaa;font-size:20px;cursor:pointer;font-family:Arial,sans-serif;';
      closeBtn.onclick = () => _closeWheelOverlay();
      panel.style.position = 'relative';
      if (window.GameLuckyWheel) {
        window.GameLuckyWheel.renderWheelPanel(saveData, panel);
      } else {
        panel.innerHTML = '<div style="color:#FFD700;">Wheel not available</div>';
      }
      panel.appendChild(closeBtn);
      overlay.appendChild(panel);
      overlay.onclick = (e) => { if (e.target === overlay) _closeWheelOverlay(); };
      document.body.appendChild(overlay);
    }

    function updateCampScreen() {
      // Hide combat HUD (Rage Bar + Special Attacks) — not visible in camp
      if (window.GameRageCombat) window.GameRageCombat.setCombatHUDVisible(false);

      // Hide the game HUD layer — not needed in camp (avoids black rectangles over 3D world)
      const uiLayer = document.getElementById('ui-layer');
      if (uiLayer) uiLayer.style.visibility = 'hidden';

      // Hide main menu and gameover screen to prevent overlap with camp
      document.getElementById('main-menu').style.display = 'none';
      document.getElementById('gameover-screen').style.display = 'none';

      // First-run tutorial hook: fire after current call stack (by then camp-screen is visible)
      // Update action button label based on game state
      const campActionBtn = document.getElementById('camp-action-btn');
      if (campActionBtn) {
        if (isGameActive) {
          campActionBtn.textContent = '▶ CONTINUE';
        } else {
          campActionBtn.textContent = '▶ START RUN';
        }
      }

      // ── 3D Camp Hub World ──────────────────────────────────────────────
      // Activate the 3D camp whenever this screen is opened.  Callbacks map
      // building IDs to the existing 2D UI functions so interactions still work.
      // Guard: renderer is module-scoped and is null until init() runs; skip 3D mode
      // if renderer is not yet ready (e.g. very first frame before init completes).
      if (window.CampWorld && renderer) {
        const campCallbacks = {
          questMission:        () => showQuestHall(),
          skillTree:           () => document.getElementById('camp-skills-tab').click(),
          armory:              () => { try { updateGearScreen(); } catch(e) {} document.getElementById('gear-screen').style.display = 'flex'; },
          trainingHall:        () => document.getElementById('camp-training-tab').click(),
          forge:               () => showProgressionShop(),
          companionHouse:      () => showCompanionHouse(),
          achievementBuilding: () => {
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest12_visitAchievements') {
              progressTutorialQuest('quest12_visitAchievements', true);
              saveSaveData();
            }
            document.getElementById('camp-screen').style.display = 'none';
            const achScreen = document.getElementById('achievements-screen');
            if (achScreen) {
              achScreen.style.display = 'flex';
              const achContent = document.getElementById('achievements-content');
              if (achContent && typeof renderAchievementsContent === 'function') renderAchievementsContent(achContent);
            }
          },
          inventory:           () => showInventoryScreen(),
          campBoard:           () => showCampBoardMenu(),
          specialAttacks:      () => {
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest3b_useSpecialAttacks') {
              progressTutorialQuest('quest3b_useSpecialAttacks', true);
              saveSaveData();
            }
            showSpecialAttacksPanel();
          },
          warehouse:           () => {
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest7b_useWarehouse') {
              progressTutorialQuest('quest7b_useWarehouse', true);
              saveSaveData();
            }
            showInventoryScreen();
          },
          tavern:              () => {
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest9b_visitTavern') {
              progressTutorialQuest('quest9b_visitTavern', true);
              saveSaveData();
            }
            showExpeditionsMenu ? showExpeditionsMenu() : showQuestHall();
          },
          shop:                () => showProgressionShop(),
          prestige:            () => {
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest10b_usePrestige') {
              progressTutorialQuest('quest10b_usePrestige', true);
              saveSaveData();
            }
            showPrestigeMenu ? showPrestigeMenu() : showProgressionShop();
          },
          trashRecycle:        () => {
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest27_useRecycle') {
              progressTutorialQuest('quest27_useRecycle', true);
              saveSaveData();
            }
            showInventoryScreen();
          },
          tempShop:            () => {
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest29_useTempShop') {
              progressTutorialQuest('quest29_useTempShop', true);
              saveSaveData();
            }
            showProgressionShop();
          },
        };
        window.CampWorld.enter(renderer, saveData, campCallbacks);
        // Mark camp-screen as 3D mode only if CampWorld successfully activated
        if (window.CampWorld.isActive) {
          const campScreenEl = document.getElementById('camp-screen');
          if (campScreenEl) campScreenEl.classList.add('camp-3d-mode');
        }
      } else {
        // 2D camp mode: hide game container to prevent black canvas showing behind camp UI
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) gameContainer.style.display = 'none';
      }
      // ──────────────────────────────────────────────────────────────────

      // Refresh idle panel (spin wheel, account, etc.) whenever camp is opened
      if (window.GameIdleBootstrap) window.GameIdleBootstrap.refreshPanel();
      // Update account level display whenever camp is opened
      updateAccountLevelDisplay();
      // Update corner notification dots and streak label
      _updateCampCornerWidgets();
      // Check for first-time camp visit
      if (!saveData.hasVisitedCamp) {
        saveData.hasVisitedCamp = true;
        // NEW: Only unlock Quest/Mission Hall initially - all other buildings locked
        if (saveData.campBuildings && saveData.campBuildings.questMission) {
          saveData.campBuildings.questMission.unlocked = true;
          saveData.campBuildings.questMission.level = 1;
        }
        // Inventory is also unlocked on first visit so players can see their items
        if (saveData.campBuildings && saveData.campBuildings.inventory) {
          saveData.campBuildings.inventory.unlocked = true;
          saveData.campBuildings.inventory.level = 1;
        }
        if (saveData.campBuildings && saveData.campBuildings.campHub) {
          saveData.campBuildings.campHub.unlocked = false;
          saveData.campBuildings.campHub.level = 0;
        }
        
        // Show first-time welcome popup - REWRITTEN with comic-magazine styling
        if (!saveData.storyQuests.welcomeShown) {
          saveData.storyQuests.welcomeShown = true;
          saveSaveData();
          
          // Show comic-style popup after a brief delay
          setTimeout(() => {
            showComicInfoBox(
              '💧 WATERDROP SURVIVOR - THE GAME LOOP',
              `<div style="text-align: left; padding: 10px;">
                <p style="font-family: 'Bangers', cursive; font-size: 20px; margin-bottom: 10px;">🎮 <b>THE SURVIVAL CYCLE</b></p>
                <p style="line-height: 1.8; margin-bottom: 10px;">
                  1️⃣ <b>START RUN</b> → Fight enemies, level up, collect XP<br>
                  2️⃣ <b>DIE & RETURN</b> → Keep your gold & progress<br>
                  3️⃣ <b>UPGRADE CAMP</b> → Unlock skills, gear, companions<br>
                  4️⃣ <b>GET STRONGER</b> → Go back out and survive longer!
                </p>
                <p style="font-family: 'Bangers', cursive; font-size: 20px; margin-bottom: 10px;">📜 <b>YOUR FIRST QUEST</b></p>
                <p style="line-height: 1.8;">
                  <b>NO QUEST IS ACTIVE ON YOUR FIRST RUN.</b><br>
                  After you die, Quest 1 will unlock in the Main Building.<br>
                  Complete quests to unlock new buildings and features!
                </p>
              </div>`,
              'START MY JOURNEY!',
              () => {
                // NO quest set on first visit - quest activates after first death
                saveSaveData();
              }
            );
          }, 500);
        }
        
        saveSaveData();
      }
      
      // Update buildings section
      const buildingsContent = document.getElementById('camp-buildings-content');
      buildingsContent.innerHTML = '';
      
      for (const [buildingId, building] of Object.entries(CAMP_BUILDINGS)) {
        const buildingData = saveData.campBuildings[buildingId];
        if (!buildingData) continue; // Skip if not in save data
        
        // Hide legacy buildings if not unlocked
        if (building.isLegacy && !buildingData.unlocked) continue;
        
        const cost = getBuildingCost(buildingId);
        const isMaxLevel = buildingData.level >= buildingData.maxLevel;
        const canAfford = saveData.gold >= cost;
        const isUnlocked = buildingData.unlocked || buildingData.level > 0;
        
        // Skip locked paid buildings - show them with quest unlock requirement
        if (!building.isFree && !isUnlocked && buildingData.level === 0) {
          // Map building IDs to which tutorial quest unlocks them
          const buildingQuestUnlockMap = {
            'skillTree': { questId: 'quest1_kill3', label: 'Kill 3 Enemies (Quest 1)' },
            'armory': { questId: 'quest3_stonehengeGear', label: 'Find the Cigar (Quest 3)' },
            'specialAttacks': { questId: 'quest3_stonehengeGear', label: 'Find the Cigar (Quest 3)' },
            'trainingHall': { questId: 'quest5_upgradeAttr', label: 'Upgrade an Attribute (Quest 5)' },
            'forge': { questId: 'quest6_survive2min', label: 'Survive 2 Minutes (Quest 6)' },
            'companionHouse': { questId: 'quest8_kill10', label: 'Kill 10 Enemies (Quest 8)' },
            'trashRecycle': { questId: 'quest26_kill20', label: 'Kill 20 Enemies (Quest 26)' },
            'tempShop': { questId: 'quest28_survive3min', label: 'Survive 3 Minutes (Quest 28)' }
          };
          
          const questInfo = buildingQuestUnlockMap[buildingId] || { questId: null, label: 'Complete a Quest' };
          // Legacy unlock quests
          const legacyUnlockQuests = {
            'skillTree': 'unlockSkillTree',
            'forge': 'unlockForge',
            'trashRecycle': 'unlockRecycle',
            'armory': 'unlockArmory',
            'companionHouse': 'unlockCompanionHouse',
            'trainingHall': 'unlockTrainingHall'
          };
          const hasLegacyUnlockQuest = legacyUnlockQuests[buildingId] && 
                                  saveData.storyQuests.currentQuest === legacyUnlockQuests[buildingId];
          
          const buildingCard = document.createElement('div');
          buildingCard.className = 'building-card';
          buildingCard.style.opacity = '0.7';
          buildingCard.style.cursor = 'not-allowed';
          
          buildingCard.innerHTML = `
            <div class="building-header">
              <div class="building-name">${building.icon} ${building.name}</div>
              <div class="building-level" style="color:#FF6B6B;">🔒 LOCKED</div>
            </div>
            <div class="building-desc">${building.description}</div>
            <div class="building-cost" style="color:#FFD700; font-size:12px;">🗝️ Unlock: ${questInfo.label}</div>
          `;
          
          buildingCard.onclick = () => {
            if (hasLegacyUnlockQuest) {
              // Quest-based unlock (FREE) — legacy system
              buildingData.unlocked = true;
              buildingData.level = 1;
              saveSaveData();
              updateCampScreen();
              playSound('collect');
              if (buildingId === 'skillTree' && saveData.storyQuests.currentQuest === 'unlockSkillTree') progressQuest('unlockSkillTree', true);
              else if (buildingId === 'forge' && saveData.storyQuests.currentQuest === 'unlockForge') progressQuest('unlockForge', true);
              else if (buildingId === 'trashRecycle' && saveData.storyQuests.currentQuest === 'unlockRecycle') progressQuest('unlockRecycle', true);
              else if (buildingId === 'armory' && saveData.storyQuests.currentQuest === 'unlockArmory') progressQuest('unlockArmory', true);
              else if (buildingId === 'companionHouse' && saveData.storyQuests.currentQuest === 'unlockCompanionHouse') progressQuest('unlockCompanionHouse', true);
              else if (buildingId === 'trainingHall' && saveData.storyQuests.currentQuest === 'unlockTrainingHall') progressQuest('unlockTrainingHall', true);
              if (buildingId === 'companionHouse' && saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest9_activateCompanion') progressTutorialQuest('quest9_activateCompanion', true);
            } else {
              playSound('invalid');
              showStatusMessage(`🔒 Complete "${questInfo.label}" to unlock this building!`, 2500);
            }
          };
          
          addLongPressDetail(buildingCard, `${building.icon} ${building.name}`, building.description);
          buildingsContent.appendChild(buildingCard);
          continue;
        }
        
        // Show unlocked/free buildings
        if (isUnlocked || building.isFree) {
          const buildingCard = document.createElement('div');
          buildingCard.className = 'building-card';
          if (isMaxLevel) buildingCard.classList.add('building-locked');
          
          const bonus = building.bonus(buildingData.level);
          const bonusText = Object.entries(bonus)
            .map(([key, value]) => {
              if (key === 'skillPoints') return `${value} skill points`;
              if (key === 'craftingTier') return `Crafting: ${value}`;
              if (key === 'gearTier') return `Max tier: ${value}`;
              if (key === 'companionDamage') return `+${Math.round(value * 100)}% companion dmg`;
              if (key === 'unlocks') return value;
              if (key === 'trainingEfficiency') return `+${Math.round(value * 100)}% training`;
              if (key === 'recycleValue') return `+${Math.round(value * 100)}% recycle`;
              if (key === 'fusionPower') return `+${Math.round(value * 100)}% fusion`;
              if (key === 'shopDiscount') return `+${Math.round(value * 100)}% discount`;
              if (key === 'itemVariety') return `${value} items`;
              if (typeof value === 'number' && value !== 0) {
                if (value >= 1) return `+${Math.round(value)} ${key}`;
                return `+${Math.round(value * 100)}% ${key}`;
              }
              return null; // Filter out undefined/null values
            })
            .filter(text => text !== null && text !== undefined)
            .join(', ') || 'Utility building';
          
          // NEW: Check if building has a notification
          const hasNotification = (buildingId === 'questMission' && saveData.tutorialQuests.readyToClaim && saveData.tutorialQuests.readyToClaim.length > 0) ||
                                 (saveData.storyQuests.questNotifications && saveData.storyQuests.questNotifications[buildingId]);
          
          // NEW: For locked free buildings, show them as locked
          const isLockedFree = building.isFree && !isUnlocked;
          
           buildingCard.innerHTML = `
             <div class="building-header">
               <div class="building-name">${building.icon} ${building.name}${hasNotification ? ' <span class="quest-indicator">!</span>' : ''}</div>
               <div class="building-level">${isLockedFree ? 'LOCKED' : `Lv ${buildingData.level}`}</div>
             </div>
             <div class="building-desc">${building.description}</div>
            <div class="building-cost">${isLockedFree ? 'Unlock via Quest' : ''}</div>
          `;
          
          if (buildingId === 'skillTree') {
            buildingCard.onclick = () => {
              if (saveData.storyQuests.questNotifications) {
                saveData.storyQuests.questNotifications.skillTree = false;
                saveSaveData();
              }
              document.getElementById('camp-skills-tab').click();
            };
            buildingCard.style.cursor = 'pointer';
          } else if (!building.isFree && building.baseCost > 0) {
            // Buildings are unlocked through quests only — clicking opens building's screen
            buildingCard.style.cursor = 'pointer';
            buildingCard.onclick = () => {
              if (buildingId === 'armory') {
                try { updateGearScreen(); } catch(e) { console.error('updateGearScreen error:', e); }
                document.getElementById('gear-screen').style.display = 'flex';
                if (saveData.storyQuests && saveData.storyQuests.buildingFirstUse) {
                  saveData.storyQuests.buildingFirstUse.armory = true;
                  saveSaveData();
                }
              } else if (buildingId === 'trainingHall') {
                document.getElementById('camp-training-tab').click();
              } else if (buildingId === 'forge') {
                showProgressionShop();
              } else if (buildingId === 'companionHouse') {
                showCompanionHouse();
              } else if (buildingId === 'specialAttacks') {
                if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest3b_useSpecialAttacks') {
                  progressTutorialQuest('quest3b_useSpecialAttacks', true);
                  saveSaveData();
                }
                showSpecialAttacksPanel();
              } else if (buildingId === 'warehouse') {
                if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest7b_useWarehouse') {
                  progressTutorialQuest('quest7b_useWarehouse', true);
                  saveSaveData();
                }
                showInventoryScreen();
              } else if (buildingId === 'tavern') {
                if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest9b_visitTavern') {
                  progressTutorialQuest('quest9b_visitTavern', true);
                  saveSaveData();
                }
                if (typeof showExpeditionsMenu === 'function') showExpeditionsMenu(); else showQuestHall();
              } else if (buildingId === 'prestige') {
                if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest10b_usePrestige') {
                  progressTutorialQuest('quest10b_usePrestige', true);
                  saveSaveData();
                }
                if (typeof showPrestigeMenu === 'function') showPrestigeMenu(); else showProgressionShop();
              } else {
                showStatChange(`${building.icon} ${building.name}: Level ${buildingData.level}/${buildingData.maxLevel}`);
              }
            };
          } else if (building.isFree) {
            buildingCard.style.border = '2px solid #FFD700';
            
            // NEW: Locked free buildings should be dimmed and not clickable
            if (isLockedFree) {
              buildingCard.style.opacity = '0.6';
            } else {
              // NEW: Add click handler for unlocked free buildings only
              if (buildingId === 'questMission') {
                // Show notification glow on questMission if quests ready
                if (isQuestMissionReady()) {
                  buildingCard.classList.add('quest-ready-glow');
                }
                buildingCard.onclick = () => showQuestHall();
                buildingCard.style.cursor = 'pointer';
              } else if (buildingId === 'achievementBuilding') {
                // Open Achievement screen when Achievement Hall clicked
                buildingCard.onclick = () => {
                  if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest12_visitAchievements') {
                    progressTutorialQuest('quest12_visitAchievements', true);
                    saveSaveData();
                  }
                  // Show the achievements screen
                  document.getElementById('camp-screen').style.display = 'none';
                  const achScreen = document.getElementById('achievements-screen');
                  if (achScreen) {
                    achScreen.style.display = 'flex';
                    // Refresh achievements content
                    const achContent = document.getElementById('achievements-content');
                    if (achContent) renderAchievementsContent(achContent);
                  }
                };
                buildingCard.style.cursor = 'pointer';
              } else if (buildingId === 'accountBuilding') {
                // Open account section
                buildingCard.onclick = () => {
                  playSound('waterdrop');
                  showAccountSection();
                };
                buildingCard.style.cursor = 'pointer';
              } else if (buildingId === 'idleMenu') {
                // Open Idle Progression section
                buildingCard.onclick = () => {
                  playSound('waterdrop');
                  showIdleSection();
                };
                buildingCard.style.cursor = 'pointer';
              } else if (buildingId === 'characterVisuals') {
                buildingCard.onclick = () => {
                  if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest16_visitCharVisuals') {
                    progressTutorialQuest('quest16_visitCharVisuals', true);
                    saveSaveData();
                  }
                  document.getElementById('camp-screen').style.display = 'none';
                  openCharacterVisuals();
                };
                buildingCard.style.cursor = 'pointer';
              } else if (buildingId === 'codex') {
                buildingCard.onclick = () => {
                  if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest17_visitCodex') {
                    progressTutorialQuest('quest17_visitCodex', true);
                    saveSaveData();
                  }
                  document.getElementById('camp-screen').style.display = 'none';
                  openCodex();
                };
                buildingCard.style.cursor = 'pointer';
              } else if (buildingId === 'skillTree') {
                // Clear notification when clicking on skill tree
                buildingCard.onclick = () => {
                  if (saveData.storyQuests.questNotifications) {
                    saveData.storyQuests.questNotifications.skillTree = false;
                    saveSaveData();
                  }
                  // Switch to skill tree tab
                  document.getElementById('camp-skills-tab').click();
                };
                buildingCard.style.cursor = 'pointer';
              } else if (buildingId === 'campHub' || buildingId === 'loreMaster') {
                // Show building info popup
                buildingCard.onclick = () => {
                  const msgs = {
                    campHub: { title: '🏠 Camp Hub', body: 'The central hub of your camp. All activities and buildings are organized through here. Keep upgrading your camp to unlock new buildings and strengthen your runs!' },
                    loreMaster: { title: '📖 Lore Master', body: 'The Lore Master holds the history of Water Drop Survivors. Unlock lore entries by completing quests and defeating special enemies. Coming in a future update!' }
                  };
                  const info = msgs[buildingId];
                  if (info) showComicInfoBox(info.title, `<p style="line-height:1.7;">${info.body}</p>`, 'GOT IT!', () => {});
                };
                buildingCard.style.cursor = 'pointer';
              } else if (buildingId === 'inventory') {
                buildingCard.onclick = () => showInventoryScreen();
                buildingCard.style.cursor = 'pointer';
              } else if (saveData.storyQuests.questNotifications && saveData.storyQuests.questNotifications[buildingId]) {
                // Clear notification on click for other buildings
                buildingCard.onclick = () => {
                  saveData.storyQuests.questNotifications[buildingId] = false;
                  saveSaveData();
                  updateCampScreen();
                };
                buildingCard.style.cursor = 'pointer';
              }
            }
          }
          
          addLongPressDetail(buildingCard, `${building.icon} ${building.name}`, building.description);
          buildingsContent.appendChild(buildingCard);
        }
      }
      
      // Show/hide skill tree tab based on skillTree building unlock status
      const skillTabEl = document.getElementById('camp-skills-tab');
      if (skillTabEl) {
        const skillBuildingData = saveData.campBuildings.skillTree;
        const isSkillTreeUnlocked = skillBuildingData && (skillBuildingData.unlocked || skillBuildingData.level > 0);
        skillTabEl.style.display = isSkillTreeUnlocked ? '' : 'none';
      }
      
      // Update skills section
      const skillsContent = document.getElementById('camp-skills-content');
      const skillPointsDisplay = document.getElementById('skill-points-display');
      skillPointsDisplay.textContent = `SP: ${saveData.skillPoints}`;
      skillsContent.innerHTML = '';
      
      // Progressive skill unlock: compute once before loop
      const _allSkillIds = Object.keys(SKILL_TREE);
      const _quest1Claimed = isQuestClaimed('quest1_kill3');
      const _quest2Claimed = isQuestClaimed('quest2_spendSkills');
      
      for (const [skillId, skill] of Object.entries(SKILL_TREE)) {
        const skillData = saveData.skillTree[skillId];
        const isMaxLevel = skillData.level >= skill.maxLevel;
        const canAfford = saveData.skillPoints >= skill.cost;
        
        // Progressive unlock: after quest1 only show first 4 skills; after quest2 show all
        const skillIndex = _allSkillIds.indexOf(skillId);
        if (!_quest2Claimed && skillIndex >= 4) continue;
        if (!_quest1Claimed && skillIndex >= 2) continue;
        
        const skillNode = document.createElement('div');
        skillNode.className = 'skill-node';
        if (skillData.unlocked) skillNode.classList.add('unlocked');
        if (!canAfford || isMaxLevel) skillNode.classList.add('locked');
        
        skillNode.innerHTML = `
          <div class="skill-name">${skill.name}</div>
          <div class="skill-desc">${skill.description}</div>
          <div style="font-size: 12px; color: #5DADE2; margin: 5px 0;">Level ${skillData.level}/${skill.maxLevel}</div>
          <div class="skill-cost">${isMaxLevel ? 'MAX' : `${skill.cost} SP`}</div>
          ${!isMaxLevel && canAfford ? '<div class="skill-hold-bar" style="height:6px;background:#333;border:2px solid #000;border-radius:3px;margin-top:6px;overflow:hidden;"><div class="skill-hold-fill" style="height:100%;width:0%;background:#FFD700;transition:none;"></div></div><div style="font-size:10px;color:#888;margin-top:2px;">Hold to buy</div>' : ''}
        `;
        
        if (!isMaxLevel && canAfford) {
          let holdTimer = null;
          let holdStart = null;
          const HOLD_DURATION = 1000; // 1 second
          // Cache DOM reference to avoid repeated queries in animation loop
          const fillEl = skillNode.querySelector('.skill-hold-fill');
          
          const startHold = () => {
            if (holdTimer) return;
            holdStart = Date.now();
            const animate = () => {
              const elapsed = Date.now() - holdStart;
              const pct = Math.min(100, (elapsed / HOLD_DURATION) * 100);
              if (fillEl) fillEl.style.width = pct + '%';
              if (pct >= 100) {
                holdTimer = null;
                unlockSkill(skillId);
              } else {
                holdTimer = requestAnimationFrame(animate);
              }
            };
            holdTimer = requestAnimationFrame(animate);
          };
          
          const cancelHold = () => {
            if (holdTimer) { cancelAnimationFrame(holdTimer); holdTimer = null; }
            if (fillEl) fillEl.style.width = '0%';
          };
          
          skillNode.addEventListener('pointerdown', (e) => { e.preventDefault(); startHold(); });
          skillNode.addEventListener('pointerup', cancelHold);
          skillNode.addEventListener('pointerleave', cancelHold);
          skillNode.addEventListener('pointercancel', cancelHold);
          skillNode.style.cursor = 'pointer';
          skillNode.style.userSelect = 'none';
        }
        
        skillsContent.appendChild(skillNode);
      }
      
      // Update sleep section
      const dayOption = document.getElementById('sleep-day-option');
      const nightOption = document.getElementById('sleep-night-option');
      const currentChoice = document.getElementById('current-time-choice');
      
      if (saveData.nextRunTimeOfDay === 'day') {
        dayOption.style.border = '3px solid #FFD700';
        nightOption.style.border = '3px solid transparent';
        currentChoice.textContent = 'DAY ☀️';
      } else {
        dayOption.style.border = '3px solid transparent';
        nightOption.style.border = '3px solid #FFD700';
        currentChoice.textContent = 'NIGHT 🌙';
      }
      
      // Update training section
      updateTrainingSection();
      
      // Update quest tracker
      updateQuestTracker();
      
      // Update gold display (not on main menu per requirements - only in progression/camp/death)
      const menuGold = document.getElementById('menu-gold');
      if (menuGold) menuGold.textContent = `GOLD: ${saveData.gold}`;
    }

