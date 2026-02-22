// js/modules/save.js
// Save/load system and notifications
    import { gs, gameSettings, playerStats } from './state.js';

    // --- NOTIFICATION/INBOX SYSTEM ---

    // --- SAVE SYSTEM ---
    // FRESH START - Changed save key to force reset after comprehensive re-implementation
    const SAVE_KEY = 'waterDropSurvivorSave_v2_FreshStart';
    const SETTINGS_KEY = 'waterDropSurvivorSettings';

    const defaultSaveData = {
      gold: 0,
      totalGoldEarned: 0,
      totalRuns: 0,
      totalKills: 0, // Track cumulative kills for quest progression
      bestTime: 0,
      bestKills: 0,
      upgrades: {
        maxHp: 0,
        hpRegen: 0,
        moveSpeed: 0,
        attackDamage: 0,
        attackSpeed: 0,
        critChance: 0,
        critDamage: 0,
        armor: 0,
        cooldownReduction: 0,
        goldEarned: 0,
        expEarned: 0,
        maxWeapons: 0
      },
      achievements: [],
      achievementQuests: { kill7Unlocked: false, kill7Quest: 'none' }, // 'none'|'active'|'complete'
      // Achievement-based attribute points
      attributes: {
        dexterity: 0,
        strength: 0,
        vitality: 0,
        luck: 0,
        wisdom: 0,
        // New training hall attributes
        endurance: 0,
        flexibility: 0
      },
      unspentAttributePoints: 0,
      // Gear system
      // Phase 1: Expand gear system to 6 slots with enhanced RPG stats
      equippedGear: {
        weapon: null,        // Main weapon slot
        armor: null,         // Body armor slot  
        helmet: null,        // Head slot (Phase 1)
        boots: null,         // Feet slot (Phase 1)
        ring: null,          // Accessory ring slot (Phase 1)
        amulet: null         // Accessory amulet slot (Phase 1)
      },
      inventory: [],
      // Phase 5: Companion System
      companions: {
        stormWolf: { unlocked: true, level: 1, xp: 0 },
        skyFalcon: { unlocked: false, level: 1, xp: 0 },
        waterSpirit: { unlocked: false, level: 1, xp: 0 }
      },
      selectedCompanion: 'stormWolf', // Default companion
      // Camp System - Quest-Driven Building Unlock System
      campBuildings: {
        // Core buildings - NEW: Only Quest Mission Hall unlocked initially
        questMission: { level: 1, maxLevel: 10, unlocked: true },
        inventory: { level: 0, maxLevel: 10, unlocked: false }, // Unlock via quest
        campHub: { level: 0, maxLevel: 10, unlocked: false }, // Initially locked
        loreMaster: { level: 0, maxLevel: 10, unlocked: false }, // Initially locked (placeholder for future lore content)
        // Quest-unlockable buildings - locked initially, unlock through quest progression
        skillTree: { level: 0, maxLevel: 10, unlocked: false }, // Unlock after Quest 1 is claimed
        companionHouse: { level: 0, maxLevel: 10, unlocked: false }, // Unlock via quest
        forge: { level: 0, maxLevel: 10, unlocked: false }, // Unlock via quest
        armory: { level: 0, maxLevel: 10, unlocked: false }, // Unlock via quest
        trainingHall: { level: 0, maxLevel: 10, unlocked: false }, // Unlock via quest
        trashRecycle: { level: 0, maxLevel: 10, unlocked: false }, // Unlock via quest
        tempShop: { level: 0, maxLevel: 10, unlocked: false }, // Unlock via quest
        // Legacy buildings (for compatibility)
        trainingGrounds: { level: 0, maxLevel: 10, unlocked: false },
        library: { level: 0, maxLevel: 10, unlocked: false },
        workshop: { level: 0, maxLevel: 10, unlocked: false },
        shrine: { level: 0, maxLevel: 10, unlocked: false }
      },
      // COMPREHENSIVE SKILL TREE - 48 Skills Total (Fresh Implementation)
      skillTree: {
        // COMBAT PATH (12 skills)
        combatMastery: { unlocked: false, level: 0, maxLevel: 5 },
        bladeDancer: { unlocked: false, level: 0, maxLevel: 3 },
        heavyStrike: { unlocked: false, level: 0, maxLevel: 3 },
        rapidFire: { unlocked: false, level: 0, maxLevel: 3 },
        criticalFocus: { unlocked: false, level: 0, maxLevel: 5 },
        armorPierce: { unlocked: false, level: 0, maxLevel: 3 },
        multiHit: { unlocked: false, level: 0, maxLevel: 3 },
        executioner: { unlocked: false, level: 0, maxLevel: 3 },
        bloodlust: { unlocked: false, level: 0, maxLevel: 3 },
        berserker: { unlocked: false, level: 0, maxLevel: 3 },
        weaponSpecialist: { unlocked: false, level: 0, maxLevel: 5 },
        combatVeteran: { unlocked: false, level: 0, maxLevel: 3 },
        
        // DEFENSE PATH (12 skills)
        survivalist: { unlocked: false, level: 0, maxLevel: 5 },
        ironSkin: { unlocked: false, level: 0, maxLevel: 3 },
        quickReflex: { unlocked: false, level: 0, maxLevel: 3 },
        fortification: { unlocked: false, level: 0, maxLevel: 5 },
        regeneration: { unlocked: false, level: 0, maxLevel: 3 },
        lastStand: { unlocked: false, level: 0, maxLevel: 3 },
        toughness: { unlocked: false, level: 0, maxLevel: 3 },
        guardian: { unlocked: false, level: 0, maxLevel: 3 },
        resilience: { unlocked: false, level: 0, maxLevel: 3 },
        secondWind: { unlocked: false, level: 0, maxLevel: 3 },
        endurance: { unlocked: false, level: 0, maxLevel: 5 },
        immortal: { unlocked: false, level: 0, maxLevel: 3 },
        
        // UTILITY PATH (12 skills)
        wealthHunter: { unlocked: false, level: 0, maxLevel: 5 },
        quickLearner: { unlocked: false, level: 0, maxLevel: 5 },
        magnetism: { unlocked: false, level: 0, maxLevel: 3 },
        efficiency: { unlocked: false, level: 0, maxLevel: 3 },
        scavenger: { unlocked: false, level: 0, maxLevel: 3 },
        fortuneFinder: { unlocked: false, level: 0, maxLevel: 3 },
        speedster: { unlocked: false, level: 0, maxLevel: 3 },
        dashMaster: { unlocked: false, level: 0, maxLevel: 3 },
        cooldownExpert: { unlocked: false, level: 0, maxLevel: 3 },
        auraExpansion: { unlocked: false, level: 0, maxLevel: 3 },
        resourceful: { unlocked: false, level: 0, maxLevel: 5 },
        treasureHunter: { unlocked: false, level: 0, maxLevel: 3 },
        
        // ELEMENTAL PATH (12 skills)
        fireMastery: { unlocked: false, level: 0, maxLevel: 3 },
        iceMastery: { unlocked: false, level: 0, maxLevel: 3 },
        lightningMastery: { unlocked: false, level: 0, maxLevel: 3 },
        elementalFusion: { unlocked: false, level: 0, maxLevel: 3 },
        pyromaniac: { unlocked: false, level: 0, maxLevel: 3 },
        frostbite: { unlocked: false, level: 0, maxLevel: 3 },
        stormCaller: { unlocked: false, level: 0, maxLevel: 3 },
        elementalChain: { unlocked: false, level: 0, maxLevel: 3 },
        manaOverflow: { unlocked: false, level: 0, maxLevel: 3 },
        spellEcho: { unlocked: false, level: 0, maxLevel: 3 },
        arcaneEmpowerment: { unlocked: false, level: 0, maxLevel: 5 },
        elementalOverload: { unlocked: false, level: 0, maxLevel: 3 },
        
        // NEW SKILLS (Feature 1)
        dash: { unlocked: false, level: 0, maxLevel: 5 },
        headshot: { unlocked: false, level: 0, maxLevel: 5 },
        autoAim: { unlocked: false, level: 0, maxLevel: 1 }
      },
      skillPoints: 0, // Start with 0 skill points - earn through quests
      // Account Level System - Persistent across all runs
      accountLevel: 1, // Persistent character level
      accountXP: 0,    // Total XP earned (quests + kills)
      // Passive Skills System
      passiveSkills: {},       // Object: skillId → level
      passiveSkillPoints: 0,   // Points to spend on passive skills
      // Camp state
      hasVisitedCamp: false, // Track first camp visit
      nextRunTimeOfDay: 'day', // 'day' or 'night' - chosen from sleep option
      lastDeathHour: 6, // Track hour of day for time progression (0-23, starts at 6 AM)
      runCount: 0, // Track total number of runs for time progression
      // Training Hall system
      trainingPoints: 0,
      lastTrainingPointTime: 0, // Timestamp of last training point awarded
      // Tutorial Quest System - 8-Quest Tutorial Flow
      tutorialQuests: {
        currentQuest: null, // Current active quest ID
        completedQuests: [], // Array of completed quest IDs
        questProgress: {}, // Object tracking progress for each quest
        readyToClaim: [], // Array of quest IDs ready to claim
        firstDeathShown: false,
        secondRunCompleted: false, // For achievements building unlock
        killsThisRun: 0, // Track kills per run (reset on new run)
        survivalTimeThisRun: 0, // Track survival time per run
        stonengengeChestFound: false, // Quest 6 specific
        lastShownQuestReminder: null // Track last shown quest reminder on run start
      },
      // Legacy quest data (keep for backward compatibility)
      storyQuests: {
        welcomeShown: false,
        mainBuildingUnlocked: false,
        currentQuest: null,
        completedQuests: [],
        readyToClaimQuests: [],
        questProgress: {},
        buildingFirstUse: {
          skillTree: false,
          forge: false,
          armory: false,
          trashRecycle: false,
          companionHouse: false,
          trainingHall: false,
          tempShop: false
        },
        questNotifications: {}
      },
      // Tutorial/Onboarding system (comic book style)
      tutorial: {
        completed: false,
        firstDeath: false,
        campVisited: false,
        dashUnlocked: false,
        headshotUnlocked: false,
        currentStep: 'waiting_first_death' // Steps: waiting_first_death, show_death_tutorial, go_to_camp, unlock_dash, unlock_headshot, completed
      },
      // Lore Collection system
      loreUnlocked: {
        landmarks: [],
        enemies: [],
        bosses: [],
        buildings: []
      },
      // Extended milestone quests
      extendedQuests: {
        legendaryCigar: { started: false, completed: false, foundCigar: false },
        companionEgg: { started: false, completed: false, eggHatched: false, ceremonyDone: false }
      },
      // Side challenges
      sideChallenges: {
        kill10Enemies: { completed: false, progress: 0, target: 10 }
      }
    };


    function loadSaveData() {
      try {
        const saved = localStorage.getItem(SAVE_KEY);
        if (saved) {
          gs.saveData = JSON.parse(saved);
          // Ensure all fields exist
          gs.saveData.upgrades = { ...defaultSaveData.upgrades, ...gs.saveData.upgrades };
          gs.saveData.attributes = { ...defaultSaveData.attributes, ...(gs.saveData.attributes || {}) };
          gs.saveData.unspentAttributePoints = gs.saveData.unspentAttributePoints || 0;
          gs.saveData.equippedGear = { ...defaultSaveData.equippedGear, ...(gs.saveData.equippedGear || {}) };
          gs.saveData.inventory = gs.saveData.inventory || [];
          gs.saveData.campBuildings = { ...defaultSaveData.campBuildings, ...(gs.saveData.campBuildings || {}) };
          gs.saveData.skillTree = { ...defaultSaveData.skillTree, ...(gs.saveData.skillTree || {}) };
          gs.saveData.companions = { ...defaultSaveData.companions, ...(gs.saveData.companions || {}) };
          gs.saveData.hasVisitedCamp = gs.saveData.hasVisitedCamp || false;
          gs.saveData.nextRunTimeOfDay = gs.saveData.nextRunTimeOfDay || 'day';
          gs.saveData.lastDeathHour = gs.saveData.lastDeathHour || 6; // Default to 6 AM
          gs.saveData.runCount = gs.saveData.runCount || 0;
          gs.saveData.trainingPoints = gs.saveData.trainingPoints || 0;
          gs.saveData.lastTrainingPointTime = gs.saveData.lastTrainingPointTime || 0;
          gs.saveData.skillPoints = gs.saveData.skillPoints || 0;
          gs.saveData.selectedCompanion = gs.saveData.selectedCompanion || 'stormWolf';
          // Account level system
          gs.saveData.accountLevel = gs.saveData.accountLevel || 1;
          gs.saveData.accountXP = gs.saveData.accountXP || 0;
          // Passive skills system
          gs.saveData.passiveSkills = gs.saveData.passiveSkills || {};
          gs.saveData.passiveSkillPoints = gs.saveData.passiveSkillPoints || 0;
          // Story quest system (legacy fields)
          gs.saveData.storyQuests = { ...defaultSaveData.storyQuests, ...(gs.saveData.storyQuests || {}) };
          gs.saveData.storyQuests.buildingFirstUse = { ...defaultSaveData.storyQuests.buildingFirstUse, ...(gs.saveData.storyQuests.buildingFirstUse || {}) };
          // Tutorial quest system (new)
          gs.saveData.tutorialQuests = { ...defaultSaveData.tutorialQuests, ...(gs.saveData.tutorialQuests || {}) };
          gs.saveData.sideChallenges = { ...defaultSaveData.sideChallenges, ...(gs.saveData.sideChallenges || {}) };
          // Tutorial system (new fields)
          gs.saveData.tutorial = { ...defaultSaveData.tutorial, ...(gs.saveData.tutorial || {}) };
          // Destructibles info shown flag
          gs.saveData.shownDestructiblesInfo = gs.saveData.shownDestructiblesInfo || false;
        }
      } catch (e) {
        console.error('Failed to load save data:', e);
        gs.saveData = { ...defaultSaveData };
      }
    }

    function saveSaveData() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(gs.saveData));
      } catch (e) {
        console.error('Failed to save data:', e);
      }
    }
    
    // Settings persistence
    function saveSettings() {
      try {
        const settings = {
          autoAim: gameSettings.autoAim,
          controlType: gameSettings.controlType,
          soundEnabled: gameSettings.soundEnabled,
          musicEnabled: gameSettings.musicEnabled,
          graphicsQuality: gameSettings.graphicsQuality
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch (e) {
        console.error('Failed to save settings:', e);
      }
    }
    
    function loadSettings() {
      try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) {
          const settings = JSON.parse(saved);
          // Apply saved settings to gameSettings
          if (settings.autoAim !== undefined) gameSettings.autoAim = settings.autoAim;
          if (settings.controlType) gameSettings.controlType = settings.controlType;
          if (settings.soundEnabled !== undefined) gameSettings.soundEnabled = settings.soundEnabled;
          if (settings.musicEnabled !== undefined) gameSettings.musicEnabled = settings.musicEnabled;
          if (settings.graphicsQuality) gameSettings.graphicsQuality = settings.graphicsQuality;
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }
    
    // Expose gs.saveData to window scope for loading screen access (FRESH IMPLEMENTATION)
    window.saveData = gs.saveData;


    export { loadSaveData, saveSaveData, saveSettings, loadSettings };
    export { SAVE_KEY, SETTINGS_KEY, defaultSaveData };
