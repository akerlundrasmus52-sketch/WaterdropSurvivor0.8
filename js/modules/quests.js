// js/modules/quests.js
// Quest systems: tutorial, story quests, account level
    import { gs, gameSettings, playerStats } from './state.js';
    import { saveSaveData } from './save.js';
    import { playSound } from './audio.js';
    import { CAMP_BUILDINGS } from './camp.js';

    // --- TUTORIAL QUEST SYSTEM (8-Quest Flow) ---
    
    // Quest definitions with conditions for dependencies
    const TUTORIAL_QUESTS = {
      firstRunDeath: {
        id: 'firstRunDeath',
        name: 'First Death Tutorial',
        description: 'Your first death triggers the tutorial',
        objectives: 'Die in your first run',
        rewardGold: 0,
        rewardSkillPoints: 0,
        unlockBuilding: 'questMission', // Already unlocked by default
        autoClaim: true,
        triggerOnDeath: true,
        nextQuest: 'quest1_kill3',
        conditions: [] // No prerequisites
      },
      quest1_kill3: {
        id: 'quest1_kill3',
        name: 'Kill 3 Enemies',
        description: 'Start a new run and kill 3 gs.enemies',
        objectives: 'Kill 3 gs.enemies in one run',
        claim: 'Main Building',
        rewardGold: 50,
        rewardSkillPoints: 3,
        unlockBuilding: 'skillTree',
        message: "Outstanding, Droplet! 🎯<br><br>You've proven your combat worth. The <b>Skill Tree</b> is now unlocked at camp!<br><br>Head to the <b>Skill Tree</b> tab and spend your <b>3 Skill Points</b> to grow stronger.",
        nextQuest: 'quest2_spendSkills',
        conditions: ['firstRunDeath'] // Requires firstRunDeath to be auto-claimed (on first death)
      },
      quest2_spendSkills: {
        id: 'quest2_spendSkills',
        name: 'Buy Dash & Headshot',
        description: 'Go to the Skill Tree tab and unlock both Dash and Critical Focus (or a Headshot skill)',
        objectives: 'Unlock Dash and a Critical Focus/Headshot skill in the Skill Tree tab',
        claim: 'Main Building',
        rewardGold: 100,
        rewardSkillPoints: 1,
        message: "Skills unlocked! 🌟<br><br>Head to <b>Stonehenge</b> on the map — a glowing chest awaits you there with your first piece of gear!",
        nextQuest: 'quest3_stonehengeGear',
        conditions: ['quest1_kill3'] // Requires quest1_kill3 to be claimed
      },
      quest3_stonehengeGear: {
        id: 'quest3_stonehengeGear',
        name: 'Find the Cigar at Stonehenge',
        description: 'Head to Stonehenge on the map and collect the quest chest to get the legendary Cigar',
        objectives: 'Find and collect the chest at Stonehenge',
        claim: 'Main Building',
        rewardGold: 150,
        rewardSkillPoints: 2,
        unlockBuildingOnActivation: 'armory', // Armory unlocks when THIS quest activates (so gs.player can use it)
        giveItem: { id: 'cigar_quest', name: 'Cigar', type: 'ring', rarity: 'rare', stats: { attackSpeed: 1, movementSpeed: 1, attackPrecision: 1 }, description: '+1 Attack Speed, +1 Movement Speed, +1 Attack Precision' },
        message: "🚬 Cigar acquired!<br><br>This rare ring grants <b>+1 Attack Speed, +1 Movement Speed, +1 Attack Precision</b>.<br><br>Head to the <b>Armory</b> and equip the Cigar from your inventory!",
        nextQuest: 'quest4_equipCigar',
        conditions: ['quest2_spendSkills']
      },
      quest4_upgradeAttr: {
        id: 'quest4_upgradeAttr',
        name: 'Upgrade an Attribute',
        description: 'Open the Training Hall and spend the attribute point you received to upgrade any stat',
        objectives: 'Spend 1 attribute point in the Training Hall',
        claim: 'Main Building',
        rewardGold: 100,
        rewardSkillPoints: 1,
        rewardAttributePoints: 3,
        unlockBuildingOnActivation: 'trainingHall', // Training Hall unlocks when THIS quest activates
        message: "💪 Attribute upgraded!<br><br>You earned <b>+3 free Attribute Points</b> and <b>+1 Skill Point</b>!",
        nextQuest: 'quest5_trainingSession',
        conditions: ['quest4_equipCigar']
      },
      quest5_trainingSession: {
        id: 'quest5_trainingSession',
        name: 'Complete a Training Session',
        description: 'Use the Training Hall to complete one training session',
        objectives: 'Complete 1 training session in the Training Hall',
        claim: 'Main Building',
        rewardGold: 100,
        rewardSkillPoints: 1,
        rewardAttributePoints: 2,
        unlockBuildingOnActivation: 'forge', // Forge unlocks when THIS quest activates
        message: "🏋️ Training complete!<br><br>You earned <b>+2 Attribute Points</b> and <b>+1 Skill Point</b>!<br><br>Next: keep pushing — kill <b>10 gs.enemies</b> in a run!",
        nextQuest: 'quest6_kill10',
        conditions: ['quest4_upgradeAttr']
      },
      quest4_equipCigar: {
        id: 'quest4_equipCigar',
        name: 'Equip the Cigar',
        description: 'Open the Armory, navigate to the Gear section in your inventory, and equip the Cigar',
        objectives: 'Equip the Cigar from your inventory',
        claim: 'Main Building',
        rewardGold: 100,
        rewardSkillPoints: 1,
        rewardAttributePoints: 2,
        message: "Cigar equipped! 🚬<br><br>Feel that power — +1 to all stats!<br><br>You've unlocked the <b>Training Hall</b> — a free Attribute Point awaits you there!",
        nextQuest: 'quest4_upgradeAttr',
        conditions: ['quest3_stonehengeGear']
      },
      quest5_doRun: {
        id: 'quest5_doRun',
        name: 'Complete a Run',
        description: 'Head out and complete a run to earn Attribute Points',
        objectives: 'Complete 1 run',
        claim: 'Main Building',
        triggerOnDeath: true,
        rewardGold: 100,
        rewardSkillPoints: 1,
        rewardAttributePoints: 3,
        unlockBuilding: 'trainingHall',
        message: "Run complete! 🏆<br><br>You earned <b>3 Attribute Points</b> and <b>+1 Skill Point</b>!<br><br>Head to the <b>Training Hall</b> and upgrade <b>3 attributes</b> to grow stronger!",
        nextQuest: 'quest6_buyAttributes',
        conditions: ['quest4_equipCigar']
      },
      quest6_buyAttributes: {
        id: 'quest6_buyAttributes',
        name: 'Upgrade 3 Attributes',
        description: 'Go to the Training Hall and spend Attribute Points to upgrade 3 attributes',
        objectives: 'Buy 3 attribute upgrades in the Training Hall',
        claim: 'Main Building',
        rewardGold: 0,
        rewardSkillPoints: 0,
        message: "Attributes upgraded! 💪<br><br>You're growing stronger every day!<br><br>One final challenge awaits — prove your strength!",
        nextQuest: 'quest7_kill10',
        conditions: ['quest5_doRun']
      },
      quest6_kill10: {
        id: 'quest6_kill10',
        name: 'Kill 10 Enemies',
        description: 'Head out and eliminate 10 gs.enemies in a single run',
        objectives: 'Kill 10 gs.enemies in one run',
        triggerOnDeath: true,
        rewardGold: 200,
        rewardSkillPoints: 1,
        message: "⚔️ 10 Enemies Defeated!<br><br>You're growing stronger, Droplet!<br><br>One final challenge: eliminate <b>15 gs.enemies</b> in a single run to complete your training!",
        nextQuest: 'quest7_kill10',
        conditions: ['quest5_trainingSession']
      },
      quest7_kill10: {
        id: 'quest7_kill10',
        name: 'Kill 15 Enemies',
        description: 'Head out and eliminate 15 gs.enemies in a single run',
        objectives: 'Kill 15 gs.enemies',
        triggerOnDeath: true,
        rewardGold: 500,
        rewardSkillPoints: 0,
        message: "🎉 TUTORIAL COMPLETE!<br><br>You've mastered the basics of survival!<br><br>The world is yours to conquer. Good luck, Droplet!",
        nextQuest: null,
        conditionsAny: ['quest6_kill10', 'quest5_trainingSession', 'quest4_equipCigar', 'quest6_buyAttributes'], // Accept any of these predecessors
        conditions: [] // No strict requirements - conditionsAny handles it
      },
      quest3_buyProgression: {
        id: 'quest3_buyProgression',
        name: 'Buy Progression',
        description: 'Buy 1 progression upgrade',
        objectives: 'Purchase any attribute upgrade',
        claim: 'Main Building',
        rewardGold: 100,
        rewardSkillPoints: 1,
        rewardAttributePoints: 1,
        message: 'Great! You\'re getting stronger!',
        nextQuest: 'quest4_kill10',
        conditions: ['quest2_spendSkills'] // Requires quest2_spendSkills to be claimed
      },
      quest4_kill10: {
        id: 'quest4_kill10',
        name: 'Kill 10 Enemies',
        description: 'Kill 10 gs.enemies in one run',
        objectives: 'Kill 10 gs.enemies',
        triggerOnDeath: true, // Reward given when gs.player dies after completing objective
        rewardGold: 200,
        rewardSkillPoints: 1,
        unlockBuilding: 'companionHouse',
        companionEgg: true, // Give companion egg
        nextQuest: 'quest5_breedCompanion',
        conditions: ['quest3_buyProgression'] // Requires quest3_buyProgression to be claimed
      },
      quest5_breedCompanion: {
        id: 'quest5_breedCompanion',
        name: 'Breed Companion',
        description: 'Visit Companion Building and activate your companion',
        objectives: 'Activate/breed companion',
        claim: 'Main Building',
        rewardGold: 150,
        rewardSkillPoints: 1,
        rewardAttributePoints: 1,
        message: 'Companion activated! They will fight by your side!',
        nextQuest: 'quest6_stonehengeChest',
        conditions: ['quest4_kill10'] // Requires quest4_kill10 to be claimed
      },
      quest6_stonehengeChest: {
        id: 'quest6_stonehengeChest',
        name: 'Find Stonehenge Chest',
        description: 'Find the Stonehenge chest on the map',
        objectives: 'Find and open Stonehenge chest',
        autoClaim: true, // Completes on pickup
        rewardGold: 100,
        rewardSkillPoints: 1,
        unlockBuilding: 'armory', // Gear Building
        giveItem: { name: 'Cigar', rarity: 'rare', stats: { strength: 1, speed: 1, precision: 1 } },
        autoEquip: true,
        nextQuest: 'quest7_survive2min',
        conditions: ['quest5_breedCompanion'] // Requires quest5_breedCompanion to be claimed
      },
      quest7_survive2min: {
        id: 'quest7_survive2min',
        name: 'Survive 2 Minutes',
        description: 'Survive for 2 minutes in a run',
        objectives: 'Survive 120 seconds',
        triggerOnDeath: true,
        rewardGold: 100,
        rewardSkillPoints: 1,
        rewardAttributePoints: 3,
        unlockBuilding: 'trainingHall', // Unlock Training Hall for attribute spending (legacy quest chain)
        nextQuest: 'quest8_newWeapon',
        conditions: ['quest6_stonehengeChest'] // Requires quest6_stonehengeChest to be claimed
      },
      quest8_newWeapon: {
        id: 'quest8_newWeapon',
        name: 'Get New Weapon',
        description: 'Unlock a new weapon in your next run',
        objectives: 'Unlock any new weapon during a run',
        claim: 'Main Building',
        rewardGold: 300,
        rewardSkillPoints: 1,
        rewardAttributePoints: 1,
        message: 'Tutorial Complete! You\'re ready to survive!',
        nextQuest: null, // Tutorial complete
        conditions: ['quest7_survive2min'] // Requires quest7_survive2min to be claimed
      },
      quest3_reachLevel5: {
        id: 'quest3_reachLevel5',
        title: 'Reach Level 5',
        description: 'Reach level 5 or higher in a single run',
        objective: 'Reach level 5+',
        reward: { gold: 250 },
        nextQuest: 'quest4_craftWeapon',
        unlocksBuilding: 'forge'
      },
      quest4_craftWeapon: {
        id: 'quest4_craftWeapon',
        title: 'Craft a Weapon',
        description: 'Craft a weapon at the Forge',
        objective: 'Craft a weapon at the Forge',
        reward: { gold: 150 },
        nextQuest: 'quest5_equipGear',
        unlocksBuilding: 'armory'
      },
      quest5_equipGear: {
        id: 'quest5_equipGear',
        title: 'Equip Gear',
        description: 'Equip a piece of gear',
        objective: 'Equip a piece of gear',
        reward: { gold: 200 },
        nextQuest: 'quest6_trainAttribute',
        unlocksBuilding: 'trainingHall'
      },
      quest6_trainAttribute: {
        id: 'quest6_trainAttribute',
        title: 'Train an Attribute',
        description: 'Train any attribute',
        objective: 'Train any attribute',
        reward: { gold: 150 },
        nextQuest: 'quest7_activateCompanion',
        unlocksBuilding: 'companionHouse'
      },
      quest7_activateCompanion: {
        id: 'quest7_activateCompanion',
        title: 'Activate a Companion',
        description: 'Activate a companion',
        objective: 'Activate a companion',
        reward: { gold: 200, egg: 1 },
        nextQuest: 'quest8_scrapGear',
        unlocksBuilding: 'trashRecycle'
      },
      quest8_scrapGear: {
        id: 'quest8_scrapGear',
        title: 'Scrap Gear',
        description: 'Scrap a piece of gear',
        objective: 'Scrap a piece of gear',
        reward: { gold: 200 },
        nextQuest: 'quest9_buyTempItem',
        unlocksBuilding: 'tempShop'
      },
      quest9_buyTempItem: {
        id: 'quest9_buyTempItem',
        title: 'Buy from Temp Shop',
        description: 'Buy an item from the Temp Shop',
        objective: 'Buy from Temp Shop',
        reward: { gold: 300 },
        nextQuest: 'quest10_visitAll',
        unlocksBuilding: 'inventoryStorage'
      },
      quest10_visitAll: {
        id: 'quest10_visitAll',
        title: 'Visit Every Building',
        description: 'Visit every building in the camp',
        objective: 'Visit every building',
        reward: { gold: 500, skillPoints: 3 },
        nextQuest: null,
        unlocksBuilding: 'campHub'
      }
    };

    const buildingQuestUnlockMap = {
      'forge': 'quest3_reachLevel5',
      'armory': 'quest4_craftWeapon',
      'trainingHall': 'quest5_equipGear',
      'companionHouse': 'quest6_trainAttribute',
      'trashRecycle': 'quest7_activateCompanion',
      'tempShop': 'quest8_scrapGear',
      'inventoryStorage': 'quest9_buyTempItem',
      'campHub': 'quest10_visitAll'
    };
    
    // Get current quest object
    function getCurrentQuest() {
      const questId = gs.saveData.tutorialQuests.currentQuest;
      return questId ? TUTORIAL_QUESTS[questId] : null;
    }
    
    // Helper: ensure quest2 is activated and check if both skills are already bought
    function ensureQuest2Activated() {
      if (!gs.saveData.tutorialQuests) return;
      // Auto-activate quest2 if quest1 is claimed but quest2 hasn't started
      if (
        isQuestClaimed('quest1_kill3') &&
        !gs.saveData.tutorialQuests.currentQuest &&
        !isQuestClaimed('quest2_spendSkills') &&
        !gs.saveData.tutorialQuests.readyToClaim.includes('quest2_spendSkills')
      ) {
        gs.saveData.tutorialQuests.currentQuest = 'quest2_spendSkills';
      }
      // If quest2 is active, check if both skills are already bought
      if (gs.saveData.tutorialQuests.currentQuest === 'quest2_spendSkills') {
        const hasDash = (gs.saveData.skillTree.dash && gs.saveData.skillTree.dash.level > 0) ||
                        (gs.saveData.skillTree.dashMaster && gs.saveData.skillTree.dashMaster.level > 0);
        const hasHeadshot = (gs.saveData.skillTree.criticalFocus && gs.saveData.skillTree.criticalFocus.level > 0) ||
                            (gs.saveData.skillTree.headshot && gs.saveData.skillTree.headshot.level > 0) ||
                            (gs.saveData.skillTree.executioner && gs.saveData.skillTree.executioner.level > 0);
        if (hasDash && hasHeadshot) {
          progressTutorialQuest('quest2_spendSkills', true);
        }
      }
    }
    
    // Check if quest conditions are fulfilled
    function checkQuestConditions(questId) {
      const quest = TUTORIAL_QUESTS[questId];
      if (!quest) return false;
      
      const completedQuests = gs.saveData.tutorialQuests.completedQuests || [];
      const completedSet = new Set(completedQuests); // Use Set for O(1) lookup
      
      // Check conditionsAny - quest is available if ANY of these are claimed
      if (quest.conditionsAny && quest.conditionsAny.length > 0) {
        const anyMet = quest.conditionsAny.some(cId => completedSet.has(cId));
        if (!anyMet) {
          console.log(`Quest ${questId} blocked: requires any of ${quest.conditionsAny.join(', ')} to be claimed`);
          return false;
        }
        return true;
      }
      
      // If no conditions, quest is always available
      if (!quest.conditions || quest.conditions.length === 0) {
        return true;
      }
      
      // Check if all prerequisite quests are claimed (completed)
      for (const conditionQuestId of quest.conditions) {
        if (!completedSet.has(conditionQuestId)) {
          console.log(`Quest ${questId} blocked: requires ${conditionQuestId} to be claimed`);
          return false;
        }
      }
      
      return true;
    }
    
    // Check if a quest is claimed (completed)
    function isQuestClaimed(questId) {
      const completedQuests = gs.saveData.tutorialQuests.completedQuests || [];
      return completedQuests.includes(questId);
    }
    
    // Check if a building has an active quest
    function hasQuestForBuilding(buildingId) {
      // Legacy support
      return false;
    }
    
    // Progress tutorial quest
    function progressTutorialQuest(questId, completed = false) {
      if (gs.saveData.tutorialQuests.currentQuest !== questId) return;
      
      const quest = TUTORIAL_QUESTS[questId];
      if (!quest) return;
      
      if (completed) {
        // Auto-claim quests complete immediately
        if (quest.autoClaim) {
          claimTutorialQuest(questId);
        } else {
          // Mark quest as ready to claim
          if (!gs.saveData.tutorialQuests.readyToClaim.includes(questId)) {
            gs.saveData.tutorialQuests.readyToClaim.push(questId);
          }
          
          // Clear current quest
          gs.saveData.tutorialQuests.currentQuest = null;
          updateQuestTracker();
          
          // Quest 2 fix: close skill tree panel so it doesn't stay open after completion
          if (questId === 'quest2_spendSkills') {
            const skillsSection = document.getElementById('camp-skills-section');
            const buildingsSection = document.getElementById('camp-buildings-section');
            if (skillsSection) skillsSection.style.display = 'none';
            const skillsTab = document.getElementById('camp-skills-tab');
            if (skillsTab) skillsTab.style.background = '#3a3a3a';
          }
          
          // Show notification
          window.showStatChange('📜 Quest Complete! Return to Main Building to claim!');
        }
        
        saveSaveData();
      }
    }
    
    // Claim a tutorial quest - REWRITTEN for reliability
    function claimTutorialQuest(questId) {
      const quest = TUTORIAL_QUESTS[questId];
      if (!quest) {
        console.error('Quest not found:', questId);
        return;
      }
      
      // Remove from ready to claim
      const index = gs.saveData.tutorialQuests.readyToClaim.indexOf(questId);
      if (index > -1) {
        gs.saveData.tutorialQuests.readyToClaim.splice(index, 1);
      }
      
      // Add to completed
      if (!gs.saveData.tutorialQuests.completedQuests.includes(questId)) {
        gs.saveData.tutorialQuests.completedQuests.push(questId);
      }
      
      // Give rewards
      if (quest.rewardGold) {
        gs.saveData.gold += quest.rewardGold;
        window.showStatChange(`+${quest.rewardGold} Gold!`);
      }
      // Award 50 bonus gold for every quest claimed
      gs.saveData.gold += 50;
      window.showStatChange('+50 Gold!');
      if (quest.rewardSkillPoints) {
        gs.saveData.skillPoints += quest.rewardSkillPoints;
        window.showStatChange(`+${quest.rewardSkillPoints} Skill Points!`);
      }
      if (quest.rewardAttributePoints) {
        gs.saveData.trainingPoints = (gs.saveData.trainingPoints || 0) + quest.rewardAttributePoints;
        window.showStatChange(`+${quest.rewardAttributePoints} Attribute Points!`);
      }
      // Award account XP for completing a quest (50 XP per quest)
      addAccountXP(50);
      
      // Unlock building on CLAIM (only for quests that use unlockBuilding, e.g. quest1 for SkillTree)
      if (quest.unlockBuilding && gs.saveData.campBuildings[quest.unlockBuilding]) {
        gs.saveData.campBuildings[quest.unlockBuilding].unlocked = true;
        if (gs.saveData.campBuildings[quest.unlockBuilding].level === 0) {
          gs.saveData.campBuildings[quest.unlockBuilding].level = 1;
        }
        const buildingName = CAMP_BUILDINGS[quest.unlockBuilding]?.name || 'Building';
        window.showStatChange(`🏛️ ${buildingName} Unlocked!`);
      }
      
      // Give companion egg
      if (quest.companionEgg) {
        if (gs.saveData.companions && gs.saveData.companions.stormWolf) {
          gs.saveData.companions.stormWolf.unlocked = true;
        }
        window.showStatChange('🥚 Companion Egg Received!');
      }
      
      // Give item
      if (quest.giveItem) {
        gs.saveData.inventory.push(quest.giveItem);
        if (quest.autoEquip && gs.saveData.equippedGear) {
          // Equip to appropriate slot based on item type
          const itemType = quest.giveItem.type || 'ring';
          gs.saveData.equippedGear[itemType] = quest.giveItem;
          window.showStatChange(`🎯 ${quest.giveItem.name} Auto-Equipped!`);
        } else {
          window.showStatChange(`📦 ${quest.giveItem.name} Acquired!`);
        }
      }
      
      // --- AUTO-CHAIN: Activate next quest IMMEDIATELY (synchronous) ---
      let nextQuestActivated = null;
      if (quest.nextQuest && checkQuestConditions(quest.nextQuest)) {
        gs.saveData.tutorialQuests.currentQuest = quest.nextQuest;
        if (quest.nextQuest === 'quest6_buyAttributes') {
          gs.saveData.tutorialQuests.quest6AttrCount = 0;
        }
        nextQuestActivated = TUTORIAL_QUESTS[quest.nextQuest] || null;
        
        // Unlock building on ACTIVATION for next quest (so gs.player can complete it)
        if (nextQuestActivated && nextQuestActivated.unlockBuildingOnActivation) {
          const bld = nextQuestActivated.unlockBuildingOnActivation;
          if (gs.saveData.campBuildings[bld]) {
            gs.saveData.campBuildings[bld].unlocked = true;
            if (gs.saveData.campBuildings[bld].level === 0) { gs.saveData.campBuildings[bld].level = 1; }
            const bldName = CAMP_BUILDINGS[bld]?.name || 'Building';
            window.showStatChange(`🏛️ ${bldName} Unlocked!`);
          }
        }
        
        // Give 1 attribute point when the Training Hall quest activates so gs.player can complete it immediately
        if (nextQuestActivated && nextQuestActivated.id === 'quest4_upgradeAttr') {
          gs.saveData.trainingPoints = (gs.saveData.trainingPoints || 0) + 1;
          window.showStatChange('+1 Attribute Point! Spend it in the Training Hall!');
        }
      }
      
      // Save immediately after rewards and quest activation
      saveSaveData();
      updateQuestTracker();
      
      // Build the combined popup message: reward info + new quest info
      const claimMsg = quest.message || `Quest Complete! ${quest.rewardGold ? `+${quest.rewardGold} gold` : ''} ${quest.rewardSkillPoints ? `+${quest.rewardSkillPoints} skill points` : ''}`;
      let combinedMessage = claimMsg;
      if (nextQuestActivated) {
        combinedMessage += `<br><br><hr style="border-color:#FFD700;opacity:0.4;margin:10px 0;"><br><span style="color:#FFD700;font-size:18px;font-family:'Bangers',cursive;letter-spacing:1px;">📜 NEW QUEST: ${nextQuestActivated.name}</span><br><span style="color:#ccc;font-size:14px;">${nextQuestActivated.description}</span><br><small style="color:#aaa;">Objective: ${nextQuestActivated.objectives}</small>`;
      }
      
      if (!quest.autoClaim) {
        // Show single combined popup (claim reward + new quest info)
        showComicInfoBox(
          '✨ Quest Complete!',
          combinedMessage,
          'Continue',
          () => {
            // Trigger Stonehenge cinematic after closing popup if next quest involves stonehenge
            if (quest.nextQuest === 'quest3_stonehengeGear' && window.stonehengeChest) {
              if (!gs.saveData.tutorialQuests.stonehengeChestCinematicShown) {
                triggerCinematic('stonehenge', window.stonehengeChest.position, 2000);
                gs.saveData.tutorialQuests.stonehengeChestCinematicShown = true;
                saveSaveData();
              }
            }
            updateCampScreen();
          }
        );
      } else {
        // Auto-claim: show next quest popup if one was activated
        if (nextQuestActivated) {
          showNextQuestPopup(quest.nextQuest);
          // Trigger Stonehenge cinematic when quest3_stonehengeGear starts
          if (quest.nextQuest === 'quest3_stonehengeGear' && window.stonehengeChest) {
            setTimeout(() => {
              if (!gs.saveData.tutorialQuests.stonehengeChestCinematicShown) {
                triggerCinematic('stonehenge', window.stonehengeChest.position, 2000);
                gs.saveData.tutorialQuests.stonehengeChestCinematicShown = true;
                saveSaveData();
              }
            }, 500);
          }
        }
      }
    }
    
    // Expose globally for inline onclick handlers and external access
    window.claimTutorialQuest = claimTutorialQuest;
    window.checkQuestConditions = checkQuestConditions;
    window.isQuestClaimed = isQuestClaimed;
    window.getCurrentQuest = getCurrentQuest;
    window.progressTutorialQuest = progressTutorialQuest;
    window.progressQuest = progressQuest;
    window.ensureQuest2Activated = ensureQuest2Activated;
    window.updateCampScreen = updateCampScreen;
    window.addAccountXP = addAccountXP;
    
    // Show next quest popup
    function showNextQuestPopup(questId) {
      const quest = TUTORIAL_QUESTS[questId];
      if (!quest) return;
      
      showComicInfoBox(
        `📜 ${quest.name}`,
        `${quest.description}<br><br><b>Objective:</b> ${quest.objectives}${quest.claim ? `<br><b>Claim:</b> ${quest.claim}` : ''}`,
        'Continue'
      );
    }
    
    // Legacy function for backward compatibility
    function progressQuest(questId, completed = false) {
      // Forward to tutorial quest system
      progressTutorialQuest(questId, completed);
    }
    
    // Legacy function for backward compatibility  
    function claimQuest(questId) {
      // Forward to tutorial quest system
      claimTutorialQuest(questId);
    }
    
    // Advance to next quest in story chain
    function advanceQuestChain() {
      // Quest1 is now activated via the Main Building (showQuestHall), not here.
      // This function is kept for any future use but no longer auto-starts quest1.
    }
    
    // Helper: should questMission building show notification glow?
    function isQuestMissionReady() {
      const tq = gs.saveData && gs.saveData.tutorialQuests;
      if (!tq) return false;
      return (tq.readyToClaim && tq.readyToClaim.length > 0) ||
             (tq.firstDeathShown && !tq.currentQuest && !isQuestClaimed('quest1_kill3'));
    }
    
    // Update quest tracker in camp screen
    function updateQuestTracker() {
      const questTracker = document.getElementById('quest-tracker');
      if (!questTracker) return;
      
      const currentQuest = getCurrentQuest();
      const completedQuests = (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.completedQuests) || [];
      const readyToClaim = (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.readyToClaim) || [];
      
      // Hide tracker if no quest is active or ready, and no recently completed quest, and gs.player hasn't died yet
      if (!gs.saveData.tutorialQuests.firstDeathShown && !currentQuest && completedQuests.length === 0) {
        questTracker.style.display = 'none';
        return;
      }
      if (!currentQuest && completedQuests.length === 0 && readyToClaim.length === 0) {
        questTracker.style.display = 'none';
        return;
      }
      
      questTracker.innerHTML = '';
      
      // Show last completed quest with ✅ and strikethrough (persistent after death)
      if (completedQuests.length > 0) {
        const lastCompletedId = completedQuests[completedQuests.length - 1];
        const lastCompleted = TUTORIAL_QUESTS[lastCompletedId];
        if (lastCompleted && lastCompleted.name) {
          const completedEl = document.createElement('div');
          completedEl.style.cssText = 'font-size: 11px; color: #aaa; text-decoration: line-through; margin-bottom: 3px;';
          completedEl.setAttribute('aria-label', `Completed: ${lastCompleted.name}`);
          completedEl.textContent = `✅ ${lastCompleted.name}`;
          questTracker.appendChild(completedEl);
        }
      }
      
      // Show current active quest
      if (currentQuest && gs.saveData.tutorialQuests.firstDeathShown) {
        // Build progress info for kill-based quests
        let progressText = '';
        const killsNow = (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.killsThisRun) || 0;
        if (currentQuest.id === 'quest1_kill3') {
          progressText = ` (${Math.min(killsNow, 7)}/7)`;
        } else if (currentQuest.id === 'quest6_kill10' || currentQuest.id === 'quest4_kill10') {
          progressText = ` (${Math.min(killsNow, 10)}/10)`;
        } else if (currentQuest.id === 'quest7_kill10') {
          progressText = ` (${Math.min(killsNow, 15)}/15)`;
        }
        
        const nameEl = document.createElement('b');
        nameEl.textContent = `📜 ${currentQuest.name}${progressText}`;
        const objEl = document.createElement('span');
        objEl.style.fontSize = '11px';
        objEl.style.color = '#ddd';
        objEl.textContent = currentQuest.objectives;
        questTracker.appendChild(nameEl);
        questTracker.appendChild(document.createElement('br'));
        questTracker.appendChild(objEl);
      } else if (readyToClaim.length > 0) {
        // Show "ready to claim" status
        const readyEl = document.createElement('b');
        readyEl.style.color = '#FFD700';
        readyEl.setAttribute('aria-label', 'Quest reward ready to claim at Main Building');
        readyEl.textContent = '🎁 Quest ready to claim at Main Building!';
        questTracker.appendChild(readyEl);
      }
      
      questTracker.style.display = 'block';
    }

    // --- STORY QUEST POPUP SYSTEM ---
    
    // Lore unlocking system
    function unlockLore(category, id) {
      if (!gs.saveData.loreUnlocked) {
        gs.saveData.loreUnlocked = { landmarks: [], enemies: [], bosses: [], buildings: [] };
      }
      
      if (!gs.saveData.loreUnlocked[category].includes(id)) {
        gs.saveData.loreUnlocked[category].push(id);
        saveSaveData();
        
        const loreData = LORE_DATABASE[category][id];
        if (loreData) {
          window.showStatChange(`📖 Lore Unlocked: ${loreData.name}`);
          
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
      const wasGameActive = gs.isGameActive && !gs.isGameOver;
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
      if (!gs.saveData.extendedQuests) {
        gs.saveData.extendedQuests = {
          legendaryCigar: { started: false, completed: false, foundCigar: false },
          companionEgg: { started: false, completed: false, eggHatched: false, ceremonyDone: false }
        };
      }
      
      // Start quest when gs.player visits Stonehenge area
      if (gs.player && !gs.saveData.extendedQuests.legendaryCigar.started) {
        const stonehengePos = { x: -60, z: 60 };
        const dist = Math.sqrt(
          Math.pow(gs.player.mesh.position.x - stonehengePos.x, 2) +
          Math.pow(gs.player.mesh.position.z - stonehengePos.z, 2)
        );
        
        if (dist < 20) {
          gs.saveData.extendedQuests.legendaryCigar.started = true;
          saveSaveData();
          showComicInfoBox(
            '🚬 Quest: The Legendary Cigar',
            'You sense something powerful near Stonehenge...<br><br>Ancient legends speak of an <strong>Eternal Cigar</strong> hidden within these mystical stones. It\'s said to grant immense power to those worthy enough to find it!<br><br><b>Objective:</b> Search around Stonehenge for the legendary cigar',
            'I\'ll find it!'
          );
        }
      }
      
      // Check if gs.player found the cigar (near center of stonehenge)
      if (gs.saveData.extendedQuests.legendaryCigar.started && !gs.saveData.extendedQuests.legendaryCigar.foundCigar) {
        const cigarPos = { x: -60, z: 60 }; // Exact center
        const dist = Math.sqrt(
          Math.pow(gs.player.mesh.position.x - cigarPos.x, 2) +
          Math.pow(gs.player.mesh.position.z - cigarPos.z, 2)
        );
        
        if (dist < 3) {
          gs.saveData.extendedQuests.legendaryCigar.foundCigar = true;
          gs.saveData.extendedQuests.legendaryCigar.completed = true;
          saveSaveData();
          
          // Note: The bonus is applied this run only - stored in gs.saveData for permanent tracking
          // On future runs, check gs.saveData.extendedQuests.legendaryCigar.completed in resetGame
          
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
      const wasGameActive = gs.isGameActive && !gs.isGameOver;
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
      const wasGameActive = gs.isGameActive && !gs.isGameOver;
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
          font-family: Arial, sans-serif;
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
      
      const comicCloseHandler = () => {
        document.body.removeChild(overlay);
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
      const wasGameActive = gs.isGameActive && !gs.isGameOver;
      if (wasGameActive) setGamePaused(true);
      // Clear quest notification for the main building
      if (!gs.saveData.storyQuests.questNotifications) {
        gs.saveData.storyQuests.questNotifications = {};
      }
      gs.saveData.storyQuests.questNotifications.questMission = false;
      saveSaveData();
      
      // Activate quest1 the first time the gs.player enters the Main Building after their first run
      if (
        gs.saveData.tutorialQuests.firstDeathShown &&
        isQuestClaimed('firstRunDeath') &&
        !gs.saveData.tutorialQuests.currentQuest &&
        !isQuestClaimed('quest1_kill3') &&
        !gs.saveData.tutorialQuests.readyToClaim.includes('quest1_kill3')
      ) {
        if (checkQuestConditions('quest1_kill3')) {
          gs.saveData.tutorialQuests.currentQuest = 'quest1_kill3';
          saveSaveData();
          // Show text magazine explaining the first quest (synchronous after save)
          showComicInfoBox(
            '📋 MISSION BRIEFING',
            `<div style="text-align: left; padding: 10px;">
              <p style="font-family: 'Bangers', cursive; font-size: 20px; margin-bottom: 10px;">🎯 QUEST 1: COMBAT READINESS</p>
              <p style="line-height: 1.8; margin-bottom: 10px;">
                Welcome back, Droplet. You survived your first encounter — now it's time to prove yourself.<br><br>
                <b>YOUR MISSION:</b> Head back out and eliminate <b>7 gs.enemies</b> in a single run.<br><br>
                Once you achieve 7 kills, return here to claim your reward and unlock new camp upgrades.
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
        'unlockForge': 'Quest 3: Unlock Forge',
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
      if (!gs.saveData.tutorialQuests.readyToClaim) {
        gs.saveData.tutorialQuests.readyToClaim = [];
      }
      if (!gs.saveData.tutorialQuests.completedQuests) {
        gs.saveData.tutorialQuests.completedQuests = [];
      }
      
      // Show ready-to-claim quests
      if (gs.saveData.tutorialQuests.readyToClaim.length > 0) {
        content += `<div style="text-align: left; margin-bottom: 20px;">`;
        content += `<div style="font-size: 20px; color: #FFD700; margin-bottom: 15px;">✨ Ready to Claim:</div>`;
        
        gs.saveData.tutorialQuests.readyToClaim.forEach(questId => {
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
          Completed Quests: ${gs.saveData.tutorialQuests.completedQuests.length} / 8
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
    function getAccountLevelXPRequired(level) {
      return level * 100; // Linear: each level requires level*100 XP total
    }
    
    function addAccountXP(amount) {
      if (!gs.saveData.accountXP) gs.saveData.accountXP = 0;
      if (!gs.saveData.accountLevel) gs.saveData.accountLevel = 1;
      gs.saveData.accountXP += amount;
      // Check for level-up
      let leveledUp = false;
      while (gs.saveData.accountXP >= getAccountLevelXPRequired(gs.saveData.accountLevel)) {
        gs.saveData.accountXP -= getAccountLevelXPRequired(gs.saveData.accountLevel);
        gs.saveData.accountLevel++;
        leveledUp = true;
        // Reward on account level-up (rotate between reward types)
        const rewardCycle = (gs.saveData.accountLevel - 1) % 4;
        if (rewardCycle === 0) {
          gs.saveData.unspentAttributePoints = (gs.saveData.unspentAttributePoints || 0) + 1;
          showEnhancedNotification('attribute', 'ACCOUNT LEVEL UP!', `Level ${gs.saveData.accountLevel}! +1 Attribute Point`);
        } else if (rewardCycle === 1) {
          gs.saveData.skillPoints = (gs.saveData.skillPoints || 0) + 1;
          showEnhancedNotification('unlock', 'ACCOUNT LEVEL UP!', `Level ${gs.saveData.accountLevel}! +1 Skill Point`);
        } else if (rewardCycle === 2) {
          gs.saveData.trainingPoints = (gs.saveData.trainingPoints || 0) + 1;
          showEnhancedNotification('attribute', 'ACCOUNT LEVEL UP!', `Level ${gs.saveData.accountLevel}! +1 Training Point`);
        } else {
          gs.saveData.gold = (gs.saveData.gold || 0) + 100;
          showEnhancedNotification('achievement', 'ACCOUNT LEVEL UP!', `Level ${gs.saveData.accountLevel}! +100 Gold`);
        }
      }
      if (leveledUp) saveSaveData();
      updateAccountLevelDisplay();
    }
    
    function updateAccountLevelDisplay() {
      const levelEl = document.getElementById('account-level-value');
      const barEl = document.getElementById('account-level-bar');
      const textEl = document.getElementById('account-level-progress-text');
      if (!levelEl) return;
      const level = gs.saveData.accountLevel || 1;
      const xp = gs.saveData.accountXP || 0;
      const required = getAccountLevelXPRequired(level);
      const pct = Math.min(100, (xp / required) * 100);
      levelEl.textContent = level;
      if (barEl) barEl.style.width = pct + '%';
      if (textEl) textEl.textContent = `${xp} / ${required} XP`;
    }

    function updateCampScreen() {
      // Update account level display whenever camp is opened
      updateAccountLevelDisplay();
      // Check for first-time camp visit
      if (!gs.saveData.hasVisitedCamp) {
        gs.saveData.hasVisitedCamp = true;
        // NEW: Only unlock Quest/Mission Hall initially - all other buildings locked
        gs.saveData.campBuildings.questMission.unlocked = true;
        gs.saveData.campBuildings.questMission.level = 1;
        // Keep other free buildings locked initially
        gs.saveData.campBuildings.inventory.unlocked = false;
        gs.saveData.campBuildings.inventory.level = 0;
        gs.saveData.campBuildings.campHub.unlocked = false;
        gs.saveData.campBuildings.campHub.level = 0;
        
        // Show first-time welcome popup - REWRITTEN with comic-magazine styling
        if (!gs.saveData.storyQuests.welcomeShown) {
          gs.saveData.storyQuests.welcomeShown = true;
          saveSaveData();
          
          // Show comic-style popup after a brief delay
          setTimeout(() => {
            showComicInfoBox(
              '💧 WATERDROP SURVIVOR - THE GAME LOOP',
              `<div style="text-align: left; padding: 10px;">
                <p style="font-family: 'Bangers', cursive; font-size: 20px; margin-bottom: 10px;">🎮 <b>THE SURVIVAL CYCLE</b></p>
                <p style="line-height: 1.8; margin-bottom: 10px;">
                  1️⃣ <b>START RUN</b> → Fight gs.enemies, level up, collect XP<br>
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
        const buildingData = gs.saveData.campBuildings[buildingId];
        if (!buildingData) continue; // Skip if not in save data
        
        // Hide legacy buildings if not unlocked
        if (building.isLegacy && !buildingData.unlocked) continue;
        
        const cost = getBuildingCost(buildingId);
        const isMaxLevel = buildingData.level >= buildingData.maxLevel;
        const canAfford = gs.saveData.gold >= cost;
        const isUnlocked = buildingData.unlocked || buildingData.level > 0;
        
        // Skip locked paid buildings - show them with quest unlock requirement
        if (!building.isFree && !isUnlocked && buildingData.level === 0) {
          // Map building IDs to which tutorial quest unlocks them
          const buildingQuestUnlockMap = {
            'skillTree': { questId: 'quest1_kill3', label: 'Kill 7 Enemies (Quest 1)' },
            'armory': { questId: 'quest3_stonehengeGear', label: 'Find the Cigar (Quest 3)' },
            'trainingHall': { questId: 'quest4_upgradeAttr', label: 'Upgrade an Attribute (Quest 4)' },
            'forge': { questId: 'quest5_trainingSession', label: 'Complete Training (Quest 5)' },
            'companionHouse': { questId: 'quest4_kill10', label: 'Kill 10 Enemies (Quest 4b)' },
            'trashRecycle': { questId: null, label: 'Future Quest' },
            'tempShop': { questId: null, label: 'Future Quest' }
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
                                  gs.saveData.storyQuests.currentQuest === legacyUnlockQuests[buildingId];
          
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
              if (buildingId === 'skillTree' && gs.saveData.storyQuests.currentQuest === 'unlockSkillTree') progressQuest('unlockSkillTree', true);
              else if (buildingId === 'forge' && gs.saveData.storyQuests.currentQuest === 'unlockForge') progressQuest('unlockForge', true);
              else if (buildingId === 'trashRecycle' && gs.saveData.storyQuests.currentQuest === 'unlockRecycle') progressQuest('unlockRecycle', true);
              else if (buildingId === 'armory' && gs.saveData.storyQuests.currentQuest === 'unlockArmory') progressQuest('unlockArmory', true);
              else if (buildingId === 'companionHouse' && gs.saveData.storyQuests.currentQuest === 'unlockCompanionHouse') progressQuest('unlockCompanionHouse', true);
              else if (buildingId === 'trainingHall' && gs.saveData.storyQuests.currentQuest === 'unlockTrainingHall') progressQuest('unlockTrainingHall', true);
              if (buildingId === 'companionHouse' && gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.currentQuest === 'quest5_breedCompanion') progressTutorialQuest('quest5_breedCompanion', true);
            } else {
              playSound('invalid');
              window.showStatusMessage(`🔒 Complete "${questInfo.label}" to unlock this building!`, 2500);
            }
          };
          
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
          const hasNotification = (buildingId === 'questMission' && gs.saveData.tutorialQuests.readyToClaim && gs.saveData.tutorialQuests.readyToClaim.length > 0) ||
                                 (gs.saveData.storyQuests.questNotifications && gs.saveData.storyQuests.questNotifications[buildingId]);
          
          // NEW: For locked free buildings, show them as locked
          const isLockedFree = building.isFree && !isUnlocked;
          
           buildingCard.innerHTML = `
             <div class="building-header">
               <div class="building-name">${building.icon} ${building.name}${hasNotification ? ' <span class="quest-indicator">!</span>' : ''}</div>
               <div class="building-level">${isLockedFree ? 'LOCKED' : `Level ${buildingData.level}/${buildingData.maxLevel}`}</div>
             </div>
             <div class="building-desc">${building.description}</div>
             <div class="building-bonus">Current: ${bonusText}</div>
            <div class="building-cost">${isLockedFree ? 'Unlock via Quest' : (isMaxLevel ? 'MAX LEVEL' : (building.isFree ? 'FREE' : `Level ${buildingData.level}/${buildingData.maxLevel}`))}</div>
          `;
          
          if (buildingId === 'skillTree') {
            buildingCard.onclick = () => {
              if (gs.saveData.storyQuests.questNotifications) {
                gs.saveData.storyQuests.questNotifications.skillTree = false;
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
                if (gs.saveData.storyQuests && gs.saveData.storyQuests.buildingFirstUse) {
                  gs.saveData.storyQuests.buildingFirstUse.armory = true;
                  saveSaveData();
                }
              } else if (buildingId === 'trainingHall') {
                document.getElementById('camp-training-tab').click();
              } else if (buildingId === 'forge') {
                showProgressionShop();
              } else {
                window.showStatChange(`${building.icon} ${building.name}: Level ${buildingData.level}/${buildingData.maxLevel}`);
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
              } else if (buildingId === 'skillTree') {
                // Clear notification when clicking on skill tree
                buildingCard.onclick = () => {
                  if (gs.saveData.storyQuests.questNotifications) {
                    gs.saveData.storyQuests.questNotifications.skillTree = false;
                    saveSaveData();
                  }
                  // Switch to skill tree tab
                  document.getElementById('camp-skills-tab').click();
                };
                buildingCard.style.cursor = 'pointer';
              } else if (gs.saveData.storyQuests.questNotifications && gs.saveData.storyQuests.questNotifications[buildingId]) {
                // Clear notification on click for other buildings
                buildingCard.onclick = () => {
                  gs.saveData.storyQuests.questNotifications[buildingId] = false;
                  saveSaveData();
                  updateCampScreen();
                };
                buildingCard.style.cursor = 'pointer';
              }
            }
          }
          
          buildingsContent.appendChild(buildingCard);
        }
      }
      
      // Show/hide skill tree tab based on skillTree building unlock status
      const skillTabEl = document.getElementById('camp-skills-tab');
      if (skillTabEl) {
        const skillBuildingData = gs.saveData.campBuildings.skillTree;
        const isSkillTreeUnlocked = skillBuildingData && (skillBuildingData.unlocked || skillBuildingData.level > 0);
        skillTabEl.style.display = isSkillTreeUnlocked ? '' : 'none';
      }
      
      // Update skills section
      const skillsContent = document.getElementById('camp-skills-content');
      const skillPointsDisplay = document.getElementById('skill-points-display');
      skillPointsDisplay.textContent = `Skill Points Available: ${gs.saveData.skillPoints}`;
      skillsContent.innerHTML = '';
      
      // Progressive skill unlock: compute once before loop
      const _allSkillIds = Object.keys(SKILL_TREE);
      const _quest1Claimed = isQuestClaimed('quest1_kill3');
      const _quest2Claimed = isQuestClaimed('quest2_spendSkills');
      
      for (const [skillId, skill] of Object.entries(SKILL_TREE)) {
        const skillData = gs.saveData.skillTree[skillId];
        const isMaxLevel = skillData.level >= skill.maxLevel;
        const canAfford = gs.saveData.skillPoints >= skill.cost;
        
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
      
      if (gs.saveData.nextRunTimeOfDay === 'day') {
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
      if (menuGold) menuGold.textContent = `GOLD: ${gs.saveData.gold}`;
    }

    gs.showComicInfoBox = showComicInfoBox;
    gs.checkLegendaryCigarQuest = checkLegendaryCigarQuest;
    gs.addAccountXP = addAccountXP;
    export { getCurrentQuest, checkQuestConditions, claimTutorialQuest, isQuestClaimed, showComicInfoBox, addAccountXP };
