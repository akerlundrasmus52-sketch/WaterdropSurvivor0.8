// js/modules/gamelogic.js
// Core game logic: init, spawning, combat, UI updates, level-up, reset
    import * as THREE from 'three';
    import { COLORS, GAME_CONFIG, MAX_SMOKE_PARTICLES, MAX_BLOOD_DECALS, MAX_DISPOSALS_PER_FRAME, MAX_BLOOD_DRIPS } from './constants.js';
    import { gs, gameSettings, playerStats, weapons, joystickLeft, joystickRight, bulletHoleGeo, bulletHoleMat, disposalQueue } from './state.js';
    import { playSound, updateBackgroundMusic, startDroneHum, stopDroneHum } from './audio.js';
    import { Player, Enemy, Projectile, SwordSlash, IceSpear, Meteor, Particle, ObjectPool, Chest, ExpGem, GoldCoin, DroneTurret, Companion } from './classes.js';
    import { loadSaveData, saveSaveData, saveSettings, loadSettings, SAVE_KEY, SETTINGS_KEY, defaultSaveData } from './save.js';
    import { updateAchievementsScreen, updateAchievementBadge, checkAchievements, showGoldBagAnimation } from './achievements.js';
    import { updateAttributesScreen, updateAttributesBadge } from './attributes.js';
    import { initializeGear, updateGearScreen, calculateGearStats } from './gear.js';
    import { upgradeCampBuilding, updateTrainingPoints, isDashUnlocked, isHeadshotUnlocked, startDash, updateTrainingSection, updatePassiveSkillsSection, FUN_COMBO_NAMES } from './camp.js';
    import { getCurrentQuest, checkQuestConditions, claimTutorialQuest, updateQuestTracker } from './quests.js';
    import { createWorld, cacheAnimatedObjects, applyGraphicsQuality } from './world.js';
    import { setupInputs, updateControlType, onWindowResize } from './input.js';
    import { animate } from './mainloop.js';

    // --- GAME LOGIC ---

    function init() {
      console.log('[Init] Starting game initialization...');
      // Load save data and settings first
      loadSaveData();
      loadSettings();
      
      // Scene
      gs.scene = new THREE.Scene();
      gs.scene.background = new THREE.Color(COLORS.bg);
      // Enhanced fog for depth - reacts to day/night cycle lighting
      // FOG FIX: Fog only at edges, clear visibility near gs.player, balanced vertically
      // Near plane increased to 15 (was 10) - gs.player area is completely clear
      // Far plane at 35 (was 28) - fog begins at edges only, not heavy at top
      // PERFORMANCE: Balanced for 60fps target while maintaining visibility
      // Tighter fog for better visibility around character - fog only at edges
      gs.scene.fog = new THREE.Fog(COLORS.bg, 18, 38);
      
      // Phase 5: Initialize particle object pool for performance (100 gs.particles pre-allocated)
      gs.particlePool = new ObjectPool(
        () => new Particle(new THREE.Vector3(0, 0, 0), 0xFFFFFF),
        (particle) => particle.mesh.visible = false,
        100
      );

      // Camera (Orthographic for miniature look)
      // CAMERA FIX: Better angle and zoom - prevent zoom issues
      // Adjusted for better top-down view: distance 15 (balanced), angle (18,16,18) for better perspective
      // This provides clear visibility without being too close or too far
      const aspect = window.innerWidth / window.innerHeight;
      const d = 15; // Balanced distance for good visibility
      gs.camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
      gs.camera.position.set(18, 16, 18); // Better angle - not too low, better visibility
      gs.camera.lookAt(gs.scene.position);

      // Renderer
      gs.renderer = new THREE.WebGLRenderer({ antialias: true });
      gs.renderer.setSize(window.innerWidth, window.innerHeight);
      gs.renderer.shadowMap.enabled = true;
      gs.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const gameContainer = document.getElementById('game-container');
      if (!gameContainer) {
        console.error('[Init] #game-container element not found - cannot append gs.renderer canvas');
        throw new Error('game-container element missing from DOM');
      }
      gameContainer.appendChild(gs.renderer.domElement);

      // Handle WebGL context loss to prevent gs.renderer freezes in long sessions
      gs.renderer.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.warn('WebGL context lost - attempting recovery');
        // Pause game logic while context is lost
        setGamePaused(true);
      }, false);
      gs.renderer.domElement.addEventListener('webglcontextrestored', () => {
        console.info('WebGL context restored');
        // Resume game if it was active
        if (gs.isGameActive) setGamePaused(false);
        gs.renderer.shadowMap.needsUpdate = true;
      }, false);

      // Day/Night Cycle System - Non-blocking, smooth transitions
      // Store light references for day/night cycle
      window.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      gs.scene.add(window.ambientLight);

      // Realistic sun/moon with soft dynamic shadows
      window.dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      window.dirLight.position.set(50, 100, 50);
      window.dirLight.castShadow = true;
      window.dirLight.shadow.mapSize.width = 2048;
      window.dirLight.shadow.mapSize.height = 2048;
      window.dirLight.shadow.camera.left = -80;
      window.dirLight.shadow.camera.right = 80;
      window.dirLight.shadow.camera.top = 80;
      window.dirLight.shadow.camera.bottom = -80;
      window.dirLight.shadow.camera.updateProjectionMatrix(); // Apply frustum changes
      // Soft shadow settings for realistic effect
      window.dirLight.shadow.radius = 4; // Soft shadow blur
      window.dirLight.shadow.bias = -0.0001; // Prevent shadow acne
      gs.scene.add(window.dirLight);
      gs.scene.add(window.dirLight.target); // Must add target to gs.scene for custom target position

      // Apply graphics quality settings
      applyGraphicsQuality(gameSettings.graphicsQuality);

      // Setup
      createWorld();
      // Performance: Cache animated gs.scene objects after world creation
      cacheAnimatedObjects();
      gs.player = new Player();
      // Spawn gs.player right next to the fountain (outside the rim, on the ground)
      gs.player.mesh.position.set(12, 0.5, 0);
      
      // Initialize gear system
      initializeGear();
      
      // Initialize background music
      updateBackgroundMusic();
      
      // Listeners
      setupInputs();
      setupMenus();
      window.addEventListener('resize', onWindowResize, false);
      
      // Start Loop - begin rendering immediately (non-blocking)
      requestAnimationFrame(animate);
      
      // FRESH: Signal that module is ready (standalone loading script is waiting for this)
      // Don't call showLoadingScreen - standalone script handles it
      window.gameModuleReady = true;
      console.log('[Init] Game module ready - Three.js loaded, event listeners attached');
      
      // SAFETY: Periodic check - if game paused but no overlay/menu visible, auto-unpause
      setInterval(() => {
        if (gs.isPaused && gs.isGameActive && !gs.isGameOver) {
          // Check if any overlay is actually open
          const hasOpenOverlay = 
            document.getElementById('levelup-modal')?.style.display === 'flex' ||
            document.getElementById('settings-modal')?.style.display === 'flex' ||
            document.getElementById('options-menu')?.style.display === 'flex' ||
            document.getElementById('stats-modal')?.style.display === 'flex' ||
            document.getElementById('gear-screen')?.style.display === 'flex' ||
            document.getElementById('achievements-screen')?.style.display === 'flex' ||
            document.getElementById('credits-screen')?.style.display === 'flex' ||
            document.getElementById('attributes-screen')?.style.display === 'flex' ||
            document.getElementById('progression-shop')?.style.display === 'flex' ||
            document.querySelector('[data-quest-hall-overlay]') !== null ||
            document.getElementById('quest-popup-overlay') !== null ||
            document.getElementById('comic-info-overlay') !== null ||
            document.getElementById('comic-tutorial-modal')?.style.display === 'flex' ||
            document.getElementById('story-quest-modal')?.style.display === 'flex' ||
            gs.windmillQuest.dialogueOpen; // Pause during farmer dialogue
          if (!hasOpenOverlay) {
            gs.pauseOverlayCount = 0;
            window.pauseOverlayCount = 0;
            gs.isPaused = false;
            window.isPaused = false;
          }
        }
      }, 2000); // Check every 2 seconds
    }
    
    // showLoadingScreen is now handled by standalone script
    // Keeping showMainMenu for internal use (e.g., returning from game to menu)
    
    function showMainMenu() {
      document.getElementById('main-menu').style.display = 'flex';
      updateGoldDisplays();
      setGameActive(false);
      setGamePaused(true);
    }
    
    function hideMainMenu() {
      document.getElementById('main-menu').style.display = 'none';
    }

    // Helper to start a new run from anywhere (camp, main building, game over)
    function startGame() {
      document.getElementById('main-menu').style.display = 'none';
      document.getElementById('camp-screen').style.display = 'none';
      document.getElementById('gameover-screen').style.display = 'none';
      resetGame();
      updateQuestTracker();
      
      // Show first-run destructibles info box
      const isFirstRun = !gs.saveData.shownDestructiblesInfo;
      if (isFirstRun) {
        gs.saveData.shownDestructiblesInfo = true;
        saveSaveData();
        
        showComicInfoBox(
          '💥 THIS WORLD CAN BE DESTROYED!',
          '<div style="text-align:left;line-height:1.8;font-size:15px;padding:4px 0">' +
          '<div style="margin-bottom:10px;font-size:17px;text-align:center;color:#FF4500"><b>Everything in this world can be destroyed!</b></div>' +
          '<div style="margin:6px 0">🚶 <b>Walk through</b> small objects (fences, crates, bushes) to smash them</div>' +
          '<div style="margin:6px 0">⚡ <b>DASH</b> into anything — trees, houses, structures — to smash them to pieces</div>' +
          '<div style="margin:6px 0">🔫 <b>Shoot</b> objects to destroy them from a distance</div>' +
          '<div style="margin:6px 0">🏊 <b>Swim</b> in the lake — there\'s a legendary treasure hidden underwater!</div>' +
          '<div style="margin-top:12px;font-size:13px;color:#666;text-align:center">Tip: Big objects block your path — only DASH breaks them!</div>' +
          '</div>',
          'LET\'S GO! →',
          () => { startCountdown(); }
        );
      } else {
        // Re-show current quest reminder if gs.player died and has an active quest
        const currentQuest = getCurrentQuest();
        const lastShownQuest = gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.lastShownQuestReminder;
        if (currentQuest && currentQuest.id !== lastShownQuest && gs.saveData.tutorialQuests.firstDeathShown) {
          gs.saveData.tutorialQuests.lastShownQuestReminder = currentQuest.id;
          saveSaveData();
          showComicInfoBox(
            '📜 ACTIVE QUEST',
            `<div style="text-align:left;line-height:1.8;font-size:15px;padding:4px 0">
              <div style="font-size:18px;color:#FFD700;margin-bottom:10px;"><b>${currentQuest.name}</b></div>
              <div style="margin-bottom:8px;">${currentQuest.description}</div>
              <div style="color:#aaa;font-size:13px;"><b>Objective:</b> ${currentQuest.objectives}</div>
              ${currentQuest.claim ? `<div style="color:#aaa;font-size:13px;margin-top:4px;"><b>Claim at:</b> ${currentQuest.claim}</div>` : ''}
            </div>`,
            'GOT IT! →',
            () => { startCountdown(); }
          );
        } else {
          startCountdown();
        }
      }
    }
    window.startGame = startGame;
    
    // Countdown system (PR #70-71)
    function startCountdown() {
      gs.countdownActive = true;
      gs.countdownStep = 0;
      gs.countdownTimer = 0;
      showCountdownMessage(0);
    }
    
    function showCountdownMessage(step) {
      if (step >= countdownMessages.length) {
        endCountdown();
        return;
      }
      
      // Use Stat Log for countdown messages
      showStatChange(countdownMessages[step]);
      
      const duration = step === 0 ? 1500 : 1000;
      
      setTimeout(() => {
        gs.countdownStep++;
        if (gs.countdownStep < countdownMessages.length) {
          showCountdownMessage(gs.countdownStep);
        } else {
          endCountdown();
        }
      }, duration);
    }
    
    function endCountdown() {
      gs.countdownActive = false;
      
      // Ensure game properly unpauses (use helper functions to sync window variables)
      setGamePaused(false);
      setGameActive(true);
      gs.gameStartTime = Date.now();
      console.log('[Countdown] Game started - isPaused:', gs.isPaused, 'isGameActive:', gs.isGameActive);
    }
    
    function showProgressionShop() {
      const shopGrid = document.getElementById('shop-grid');
      shopGrid.innerHTML = '';
      
      // Create upgrade cards for each permanent upgrade
      Object.keys(PERMANENT_UPGRADES).forEach(key => {
        const upgrade = PERMANENT_UPGRADES[key];
        const currentLevel = gs.saveData.upgrades[key];
        const isMaxLevel = currentLevel >= upgrade.maxLevel;
        const cost = getCost(key);
        const canAfford = gs.saveData.gold >= cost;
        
        const card = document.createElement('div');
        card.className = 'upgrade-shop-card' + (isMaxLevel ? ' max-level' : '');
        
        const effectText = upgrade.description;
        
        card.innerHTML = `
          <div class="upgrade-shop-title">${upgrade.name}</div>
          <div class="upgrade-shop-desc">${effectText}</div>
          <div class="upgrade-shop-level">Level: ${currentLevel} / ${upgrade.maxLevel}</div>
          ${!isMaxLevel ? `
            <div class="upgrade-shop-cost">Cost: ${cost} Gold</div>
            <button class="upgrade-buy-btn" ${!canAfford ? 'disabled' : ''}>
              ${canAfford ? 'BUY' : 'NOT ENOUGH GOLD'}
            </button>
          ` : '<div class="upgrade-shop-cost" style="color: #27ae60;">MAX LEVEL</div>'}
        `;
        
        if (!isMaxLevel) {
          const btn = card.querySelector('.upgrade-buy-btn');
          btn.onclick = () => {
            playSound('levelup');
            buyUpgrade(key);
          };
        }
        
        shopGrid.appendChild(card);
      });
      
      document.getElementById('progression-shop').style.display = 'flex';
      updateGoldDisplays();
    }
    
    function buyUpgrade(upgradeKey) {
      const upgrade = PERMANENT_UPGRADES[upgradeKey];
      const currentLevel = gs.saveData.upgrades[upgradeKey];
      const cost = getCost(upgradeKey);
      
      if (currentLevel >= upgrade.maxLevel) return;
      if (gs.saveData.gold < cost) return;
      
      gs.saveData.gold -= cost;
      gs.saveData.upgrades[upgradeKey]++;
      saveSaveData();
      
      playSound('levelup');
      showProgressionShop(); // Refresh the shop
    }
    
    function setupMenus() {
      // Settings button
      // PR #117: Menu button and options modal handlers
      const menuBtn = document.getElementById('menu-btn');
      const optionsMenu = document.getElementById('options-menu');
      const closeOptionsBtn = document.getElementById('close-options-btn');
      const optionsStatsBtn = document.getElementById('options-stats-btn');
      const optionsSettingsBtn = document.getElementById('options-settings-btn');
      const optionsCampBtn = document.getElementById('options-camp-btn');
      
      menuBtn.addEventListener('click', () => {
        setGamePaused(true);
        optionsMenu.style.display = 'flex';
        playSound('waterdrop');
      });
      
      closeOptionsBtn.addEventListener('click', () => {
        setGamePaused(false);
        optionsMenu.style.display = 'none';
        playSound('waterdrop');
      });
      
      optionsStatsBtn.addEventListener('click', () => {
        optionsMenu.style.display = 'none';
        toggleStats();
      });
      
      optionsCampBtn.addEventListener('click', () => {
        setGameOver(true);
        setGameActive(false);
        stopDroneHum();
        gs.saveData.totalRuns++;
        gs.saveData.totalKills += playerStats.kills;
        saveSaveData();
        optionsMenu.style.display = 'none';
        window.updateCampScreen();
        
        // Ensure buildings tab is selected (not sleep/day-night selection)
        document.getElementById('camp-buildings-section').style.display = 'block';
        document.getElementById('camp-skills-section').style.display = 'none';
        document.getElementById('camp-sleep-section').style.display = 'none';
        document.getElementById('camp-training-section').style.display = 'none';
        document.getElementById('camp-buildings-tab').style.background = '#5A3A31';
        document.getElementById('camp-skills-tab').style.background = '#3a3a3a';
        document.getElementById('camp-sleep-tab').style.background = '#3a3a3a';
        document.getElementById('camp-training-tab').style.background = '#3a3a3a';
        
        document.getElementById('camp-screen').style.display = 'flex';
        playSound('waterdrop');
      });
      
      // Exit to Main Menu from in-game
      const optionsExitBtn = document.getElementById('options-exit-btn');
      optionsExitBtn.addEventListener('click', () => {
        if (confirm('Exit to main menu? Your progress in this run will be lost.')) {
          optionsMenu.style.display = 'none';
          resetGame();
          showMainMenu();
          playSound('waterdrop');
        }
      });
      
      optionsSettingsBtn.addEventListener('click', () => {
        optionsMenu.style.display = 'none';
        setGamePaused(true);
        // Open settings modal
        document.getElementById('settings-modal').style.display = 'flex';
      });
      
      // Options menu - Progression button
      const optionsProgressionBtn = document.getElementById('options-progression-btn');
      if (optionsProgressionBtn) {
        optionsProgressionBtn.addEventListener('click', () => {
          optionsMenu.style.display = 'none';
          setGamePaused(true);
          showProgressionShop();
          playSound('waterdrop');
        });
      }
      
      // Options menu - Attributes button
      const optionsAttributesBtn = document.getElementById('options-attributes-btn');
      if (optionsAttributesBtn) {
        optionsAttributesBtn.addEventListener('click', () => {
          optionsMenu.style.display = 'none';
          setGamePaused(true);
          updateAttributesScreen();
          document.getElementById('attributes-screen').style.display = 'flex';
          playSound('waterdrop');
        });
      }
      
      // Options menu - Gear button
      const optionsGearBtn = document.getElementById('options-gear-btn');
      if (optionsGearBtn) {
        optionsGearBtn.addEventListener('click', () => {
          optionsMenu.style.display = 'none';
          setGamePaused(true);
          updateGearScreen();
          document.getElementById('gear-screen').style.display = 'flex';
          playSound('waterdrop');
        });
      }
      
      // Options menu - Achievements button
      const optionsAchievementsBtn = document.getElementById('options-achievements-btn');
      if (optionsAchievementsBtn) {
        optionsAchievementsBtn.addEventListener('click', () => {
          optionsMenu.style.display = 'none';
          setGamePaused(true);
          updateAchievementsScreen();
          document.getElementById('achievements-screen').style.display = 'flex';
          playSound('waterdrop');
        });
      }
      
      // Options menu - Credits button
      const optionsCreditsBtn = document.getElementById('options-credits-btn');
      if (optionsCreditsBtn) {
        optionsCreditsBtn.addEventListener('click', () => {
          optionsMenu.style.display = 'none';
          setGamePaused(true);
          document.getElementById('credits-screen').style.display = 'flex';
          playSound('waterdrop');
        });
      }
      
      document.getElementById('settings-btn').onclick = () => {
        playSound('waterdrop');
        setGamePaused(true);
        document.getElementById('settings-modal').style.display = 'flex';
      };
      
      document.getElementById('settings-close-btn').onclick = () => {
        playSound('waterdrop');
        setGamePaused(false);
        document.getElementById('settings-modal').style.display = 'none';
      };
      
      // Settings handlers
      document.getElementById('auto-aim-checkbox').onchange = (e) => {
        gameSettings.autoAim = e.target.checked;
        saveSettings();
      };
      
      document.getElementById('control-type-select').onchange = (e) => {
        gameSettings.controlType = e.target.value;
        // Clear joystick states when switching control types
        joystickLeft.active = false;
        joystickLeft.x = 0;
        joystickLeft.y = 0;
        joystickRight.active = false;
        joystickRight.x = 0;
        joystickRight.y = 0;
        // Clear keyboard state when switching control types
        gameSettings.keysPressed = {};
        updateControlType();
        saveSettings();
      };
      
      document.getElementById('sound-toggle').onchange = (e) => {
        gameSettings.soundEnabled = e.target.checked;
        saveSettings();
      };
      
      document.getElementById('music-toggle').onchange = (e) => {
        gameSettings.musicEnabled = e.target.checked;
        updateBackgroundMusic();
        saveSettings();
      };
      
      document.getElementById('quality-select').onchange = (e) => {
        gameSettings.graphicsQuality = e.target.value;
        applyGraphicsQuality(e.target.value);
        saveSettings();
      };

      // Sync settings UI controls with current gameSettings state
      const autoAimCheckbox = document.getElementById('auto-aim-checkbox');
      if (autoAimCheckbox) {
        autoAimCheckbox.checked = !!gameSettings.autoAim;
        // Disable auto-aim checkbox until Auto-Aim skill is unlocked in Skill Tree
        const autoAimSkillUnlocked = gs.saveData.skillTree && gs.saveData.skillTree.autoAim && gs.saveData.skillTree.autoAim.level > 0;
        autoAimCheckbox.disabled = !autoAimSkillUnlocked;
        autoAimCheckbox.title = autoAimSkillUnlocked ? 'Toggle Auto-Aim on/off' : 'Unlock Auto-Aim in the Skill Tree first';
        const autoAimTooltip = document.getElementById('auto-aim-label-tooltip');
        if (autoAimTooltip) autoAimTooltip.style.display = autoAimSkillUnlocked ? 'none' : 'inline';
      }

      const controlTypeSelect = document.getElementById('control-type-select');
      if (controlTypeSelect && typeof gameSettings.controlType === 'string') {
        controlTypeSelect.value = gameSettings.controlType;
      }

      const soundToggle = document.getElementById('sound-toggle');
      if (soundToggle) {
        soundToggle.checked = !!gameSettings.soundEnabled;
      }

      const musicToggle = document.getElementById('music-toggle');
      if (musicToggle) {
        musicToggle.checked = !!gameSettings.musicEnabled;
      }
      
      const qualitySelect = document.getElementById('quality-select');
      if (qualitySelect) {
        // Set to saved value (fallback to 'medium' as defensive programming)
        qualitySelect.value = gameSettings.graphicsQuality || 'medium';
      }

      // Ensure game systems reflect the current settings
      updateControlType();
      updateBackgroundMusic();
      
      // Main Menu Buttons
      document.getElementById('start-game-btn').onclick = () => {
        playSound('waterdrop');
        hideMainMenu();
        resetGame();
        updateQuestTracker(); // Ensure quest HUD reflects current state before run starts
        startCountdown(); // Start countdown after resetting game (PR #70)
      };
      
      document.getElementById('camp-btn').onclick = () => {
        playSound('waterdrop');
        hideMainMenu();
        window.updateCampScreen();
        document.getElementById('camp-screen').style.display = 'flex';
        
        // Tutorial: Check if gs.player visited camp for first time after first death
        if (!gs.saveData.tutorial) {
          gs.saveData.tutorial = {
            completed: false,
            firstDeath: false,
            campVisited: false,
            dashUnlocked: false,
            headshotUnlocked: false,
            currentStep: 'waiting_first_death'
          };
        }
        
        if (gs.saveData.tutorial.currentStep === 'go_to_camp' && !gs.saveData.tutorial.campVisited) {
          gs.saveData.tutorial.campVisited = true;
          gs.saveData.tutorial.currentStep = 'unlock_dash';
          saveSaveData();
          // Show tutorial about unlocking dash
          setTimeout(() => {
            showComicTutorial('unlock_dash');
          }, 500);
        }
      };
      
      // Back buttons
      document.getElementById('shop-back-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('progression-shop').style.display = 'none';
        if (gs.isGameActive) { setGamePaused(false); } else { showMainMenu(); }
      };
      
      document.getElementById('achievements-back-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('achievements-screen').style.display = 'none';
        if (gs.isGameActive) { setGamePaused(false); } else { showMainMenu(); }
      };
      
      document.getElementById('attributes-back-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('attributes-screen').style.display = 'none';
        if (gs.isGameActive) { setGamePaused(false); } else { showMainMenu(); }
      };
      
      document.getElementById('gear-back-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('gear-screen').style.display = 'none';
        if (gs.isGameActive) { setGamePaused(false); } else { showMainMenu(); }
      };
      
      document.getElementById('credits-back-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('credits-screen').style.display = 'none';
        if (gs.isGameActive) { setGamePaused(false); } else { showMainMenu(); }
      };
      
      document.getElementById('camp-back-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('camp-screen').style.display = 'none';
        if (gs.isGameActive) {
          // Resume game when returning from camp during an active run
          setGamePaused(false);
        } else {
          showMainMenu();
        }
      };
      
      // Back to Buildings buttons inside each sub-section
      document.querySelectorAll('.camp-section-back-btn').forEach(btn => {
        btn.onclick = () => {
          playSound('waterdrop');
          document.getElementById('camp-buildings-tab').click();
        };
      });
      
      // Camp tab switching
      document.getElementById('camp-buildings-tab').onclick = () => {
        playSound('waterdrop');
        document.getElementById('camp-buildings-section').style.display = 'block';
        document.getElementById('camp-skills-section').style.display = 'none';
        document.getElementById('camp-sleep-section').style.display = 'none';
        document.getElementById('camp-training-section').style.display = 'none';
        document.getElementById('camp-passive-section').style.display = 'none';
        document.getElementById('camp-buildings-tab').style.background = '#5A3A31';
        document.getElementById('camp-skills-tab').style.background = '#3a3a3a';
        document.getElementById('camp-sleep-tab').style.background = '#3a3a3a';
        document.getElementById('camp-training-tab').style.background = '#3a3a3a';
        document.getElementById('camp-passive-tab').style.background = '#3a3a3a';
      };
      
      document.getElementById('camp-skills-tab').onclick = () => {
        playSound('waterdrop');
        document.getElementById('camp-buildings-section').style.display = 'none';
        document.getElementById('camp-skills-section').style.display = 'block';
        document.getElementById('camp-sleep-section').style.display = 'none';
        document.getElementById('camp-training-section').style.display = 'none';
        document.getElementById('camp-passive-section').style.display = 'none';
        document.getElementById('camp-buildings-tab').style.background = '#3a3a3a';
        document.getElementById('camp-skills-tab').style.background = '#5A3A31';
        document.getElementById('camp-sleep-tab').style.background = '#3a3a3a';
        document.getElementById('camp-training-tab').style.background = '#3a3a3a';
        document.getElementById('camp-passive-tab').style.background = '#3a3a3a';
      };
      
      document.getElementById('camp-passive-tab').onclick = () => {
        playSound('waterdrop');
        document.getElementById('camp-buildings-section').style.display = 'none';
        document.getElementById('camp-skills-section').style.display = 'none';
        document.getElementById('camp-sleep-section').style.display = 'none';
        document.getElementById('camp-training-section').style.display = 'none';
        document.getElementById('camp-passive-section').style.display = 'block';
        document.getElementById('camp-buildings-tab').style.background = '#3a3a3a';
        document.getElementById('camp-skills-tab').style.background = '#3a3a3a';
        document.getElementById('camp-sleep-tab').style.background = '#3a3a3a';
        document.getElementById('camp-training-tab').style.background = '#3a3a3a';
        document.getElementById('camp-passive-tab').style.background = '#5A3A31';
        updatePassiveSkillsSection();
      };
      
      document.getElementById('camp-sleep-tab').onclick = () => {
        playSound('waterdrop');
        document.getElementById('camp-buildings-section').style.display = 'none';
        document.getElementById('camp-skills-section').style.display = 'none';
        document.getElementById('camp-sleep-section').style.display = 'block';
        document.getElementById('camp-training-section').style.display = 'none';
        document.getElementById('camp-passive-section').style.display = 'none';
        document.getElementById('camp-buildings-tab').style.background = '#3a3a3a';
        document.getElementById('camp-skills-tab').style.background = '#3a3a3a';
        document.getElementById('camp-sleep-tab').style.background = '#5A3A31';
        document.getElementById('camp-training-tab').style.background = '#3a3a3a';
        document.getElementById('camp-passive-tab').style.background = '#3a3a3a';
      };
      
      document.getElementById('camp-training-tab').onclick = () => {
        playSound('waterdrop');
        document.getElementById('camp-buildings-section').style.display = 'none';
        document.getElementById('camp-skills-section').style.display = 'none';
        document.getElementById('camp-sleep-section').style.display = 'none';
        document.getElementById('camp-training-section').style.display = 'block';
        document.getElementById('camp-passive-section').style.display = 'none';
        document.getElementById('camp-buildings-tab').style.background = '#3a3a3a';
        document.getElementById('camp-skills-tab').style.background = '#3a3a3a';
        document.getElementById('camp-sleep-tab').style.background = '#3a3a3a';
        document.getElementById('camp-training-tab').style.background = '#5A3A31';
        document.getElementById('camp-passive-tab').style.background = '#3a3a3a';
        updateTrainingSection();
      };
      
      // Sleep option handlers
      document.getElementById('sleep-day-option').onclick = () => {
        playSound('waterdrop');
        gs.saveData.nextRunTimeOfDay = 'day';
        saveSaveData();
        window.updateCampScreen();
      };
      
      document.getElementById('sleep-night-option').onclick = () => {
        playSound('waterdrop');
        gs.saveData.nextRunTimeOfDay = 'night';
        saveSaveData();
        window.updateCampScreen();
      };
      
      // Go to Camp from death screen
      document.getElementById('goto-camp-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('gameover-screen').style.display = 'none';
        window.updateCampScreen();
        document.getElementById('camp-screen').style.display = 'flex';
        // Keep menu hidden during camp visit from death
      };
      
      // Quit to Menu button
      document.getElementById('quit-to-menu-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('gameover-screen').style.display = 'none';
        showMainMenu();
      };
      
      // Restart button - Start a new run immediately
      document.getElementById('restart-btn').onclick = () => {
        playSound('levelup');
        document.getElementById('gameover-screen').style.display = 'none';
        startGame(); // Start new run immediately
      };
      
      // Reset progress button with double confirmation
      // FRESH IMPLEMENTATION: Story Quest Modal close handler
      function closeStoryQuestModal() {
        playSound('waterdrop');
        gs.saveData.storyQuests.welcomeShown = true;
        saveSaveData();
        document.getElementById('story-quest-modal').style.display = 'none';
        if (gs.isGameActive) setGamePaused(false);
      }
      document.getElementById('story-quest-close-btn').onclick = closeStoryQuestModal;
      document.getElementById('story-quest-x-btn').onclick = closeStoryQuestModal;
      // X button for comic-tutorial-modal
      document.getElementById('comic-tutorial-x-btn').onclick = () => {
        document.getElementById('comic-tutorial-modal').style.display = 'none';
        if (gs.isGameActive && !gs.isGameOver) setGamePaused(false);
      };
      // X button for levelup-modal
      document.getElementById('levelup-x-btn').onclick = () => {
        document.getElementById('levelup-modal').style.display = 'none';
        if (window.setGamePaused) window.setGamePaused(false);
        checkPendingLevelUp();
      };
      
      document.getElementById('settings-reset-btn').onclick = () => {
        if (confirm('⚠️ WARNING ⚠️\n\nAre you ABSOLUTELY SURE you want to RESET ALL PROGRESS?\n\nThis will delete:\n• All permanent upgrades\n• All gold\n• All achievements\n• All gear & inventory\n• All buildings & quests\n• All companions\n• Everything will be completely wiped!\n\nThis action CANNOT be undone!')) {
          // Second confirmation
          if (confirm('FINAL CONFIRMATION\n\nThis is your LAST CHANCE!\n\nDo you really want to DELETE EVERYTHING?\n\nClick OK to permanently reset, or Cancel to keep your progress.')) {
            // Completely clear localStorage to ensure fresh start
            try {
              localStorage.removeItem(SAVE_KEY);
              localStorage.removeItem(SETTINGS_KEY);
            } catch (e) {
              console.warn('Failed to remove localStorage items:', e);
            }
            
            // Reset to default save data (complete fresh start)
            gs.saveData = JSON.parse(JSON.stringify(defaultSaveData));
            
            // Save the fresh state
            saveSaveData();
            
            // Reset game and return to menu
            resetGame();
            document.getElementById('settings-modal').style.display = 'none';
            setGamePaused(false);
            showMainMenu();
            showProgressionShop();
            
            alert('✅ All progress has been completely reset! The game will start fresh on your next playthrough.');
            playSound('hit');
          }
        }
      };
            
      // Stats Bar removed - No toggle needed
      
      // Equipment Button - Opens Gear Screen
      document.getElementById('equipment-btn').onclick = () => {
        playSound('hit');
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('gear-screen').style.display = 'flex';
        updateGearScreen();
      };
      
      // Initialize control type UI on startup
      updateControlType();
    }
    

    function spawnWave() {
      gs.waveCount++;
      
      // Phase 1 Performance Fix: Limit maximum gs.enemies on screen
      const currentEnemyCount = gs.enemies.filter(e => !e.isDead).length;
      
      // Skip spawning if we're at the limit
      if (currentEnemyCount >= GAME_CONFIG.maxEnemiesOnScreen) {
        return;
      }
      
      // Check if this is a mini-boss wave - expanded progression to 150
      // Mini-bosses appear after players cross upgrade thresholds (approx every 15 levels)
      const miniBossLevels = [10, 25, 40, 55, 70, 85, 100, 115, 130, 145];
      const isMiniBossWave = miniBossLevels.includes(playerStats.lvl) && !gs.miniBossesSpawned.has(playerStats.lvl);
      
      if (isMiniBossWave) {
        // Mark this level's mini-boss as spawned
        gs.miniBossesSpawned.add(playerStats.lvl);
        
        // Spawn mini-boss with 2-3 regular gs.enemies
        const angle = Math.random() * Math.PI * 2;
        const dist = 28;
        const ex = gs.player.mesh.position.x + Math.cos(angle) * dist;
        const ez = gs.player.mesh.position.z + Math.sin(angle) * dist;
        const miniBoss = new Enemy(10, ex, ez, playerStats.lvl);
        gs.enemies.push(miniBoss);
        createFloatingText("MINI-BOSS INCOMING!", gs.player.mesh.position);
        
        // Trigger cinematic for mini-boss spawn
        triggerCinematic('miniboss', miniBoss.mesh, 3000);
        
        // Spawn 1-2 regular gs.enemies with the mini-boss (reduced from 2-3)
        const supportCount = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < supportCount; i++) {
          const supportAngle = Math.random() * Math.PI * 2;
          const supportDist = 25 + Math.random() * 5;
          const supportX = gs.player.mesh.position.x + Math.cos(supportAngle) * supportDist;
          const supportZ = gs.player.mesh.position.z + Math.sin(supportAngle) * supportDist;
          const supportType = Math.floor(Math.random() * Math.min(3, Math.max(1, playerStats.lvl / 3)));
          gs.enemies.push(new Enemy(supportType, supportX, supportZ, playerStats.lvl));
        }
        // Don't spawn additional regular wave gs.enemies on mini-boss waves
        return;
      }
      
      // Scale spawn count with gs.player level for increased difficulty
      // Early game (1-30): Much more gs.enemies for harder challenge
      // Mid-game (31-75): Moderate but still challenging
      // Late-game (76-150): Aggressive endgame difficulty
      let baseCount, levelBonus, cap;
      
      if (playerStats.lvl <= 30) {
        // Early game: Very aggressive spawns (6-12 gs.enemies per wave) - harder difficulty
        baseCount = 6 + Math.floor(gs.waveCount / 2);
        levelBonus = Math.floor(playerStats.lvl / 3);
        cap = 12;
      } else if (playerStats.lvl <= 75) {
        // Mid-game: Challenging spawns (5-14 gs.enemies per wave)
        baseCount = 5 + Math.floor(gs.waveCount / 3);
        levelBonus = Math.floor(playerStats.lvl / 4);
        cap = 14;
      } else if (playerStats.lvl <= 120) {
        // Late-game: Very challenging (6-16 gs.enemies per wave)
        baseCount = 6 + Math.floor(gs.waveCount / 2);
        levelBonus = Math.floor(playerStats.lvl / 3);
        cap = 16;
      } else {
        // End-game: Maximum challenge (8-20 gs.enemies per wave)
        baseCount = 8 + Math.floor(gs.waveCount / 2);
        levelBonus = Math.floor(playerStats.lvl / 3);
        cap = 20;
      }
      
      const count = Math.min(baseCount + levelBonus, cap);
      
      for(let i=0; i<count; i++) {
        // Spawn at edge of gs.camera view approx - avoid lake area
        let ex, ez, inLake;
        let attempts = 0;
        const MAX_ATTEMPTS = 10;
        
        do {
          const angle = Math.random() * Math.PI * 2;
          const dist = 25 + Math.random() * 10; // Just outside view
          ex = gs.player.mesh.position.x + Math.cos(angle) * dist;
          ez = gs.player.mesh.position.z + Math.sin(angle) * dist;
          
          // Check if spawn position is in lake
          const distToLake = Math.sqrt(
            (ex - GAME_CONFIG.lakeCenterX) * (ex - GAME_CONFIG.lakeCenterX) + 
            (ez - GAME_CONFIG.lakeCenterZ) * (ez - GAME_CONFIG.lakeCenterZ)
          );
          inLake = distToLake < GAME_CONFIG.lakeRadius + 5; // Add buffer
          attempts++;
        } while (inLake && attempts < MAX_ATTEMPTS);
        
        // Fallback: if still in lake after max attempts, push spawn further away from lake
        if (inLake) {
          const angleFromLake = Math.atan2(ez - GAME_CONFIG.lakeCenterZ, ex - GAME_CONFIG.lakeCenterX);
          ex = GAME_CONFIG.lakeCenterX + Math.cos(angleFromLake) * (GAME_CONFIG.lakeRadius + 10);
          ez = GAME_CONFIG.lakeCenterZ + Math.sin(angleFromLake) * (GAME_CONFIG.lakeRadius + 10);
        }
        
        // Random type - include new enemy types as level increases
        // 0: Tank, 1: Fast, 2: Balanced, 3: Slowing (lvl 8+), 4: Ranged (lvl 10+)
        // 5: Flying (lvl 8+), 6-9: Hard variants (lvl 12+)
        let maxType = 2; // Start with 3 base types
        if (playerStats.lvl >= 8) maxType = 5; // Add slowing (3), ranged placeholder, and flying (5)
        if (playerStats.lvl >= 10) maxType = 5; // Add ranged gs.enemies (4)
        if (playerStats.lvl >= 12) maxType = 6; // Add hard tank
        if (playerStats.lvl >= 14) maxType = 7; // Add hard fast
        if (playerStats.lvl >= 16) maxType = 8; // Add hard balanced
        if (playerStats.lvl >= 18) maxType = 9; // Add elite
        
        let type = Math.floor(Math.random() * (maxType + 1));
        
        // Special spawning logic for specific types
        // Exclude type 4 (ranged) from random selection at level 8-9, only available at 10+
        if (type === 4 && playerStats.lvl < 10) {
          type = 3; // Fall back to slowing
        }
        
        // Flying gs.enemies (type 5) - 15% chance at level 8+
        if (playerStats.lvl >= 8 && Math.random() < 0.15) {
          type = 5;
        }
        
        // Ranged gs.enemies (type 4) - 30% chance at level 10+ for more variety
        if (type === 4 && Math.random() > 0.3) {
          type = Math.floor(Math.random() * 3);
        }
        
        // Hard variants (6-9) - reduce spawn rate to 30%
        if (type >= 6 && type <= 9 && Math.random() > 0.3) {
          // Fallback to types 0-5 (all basic types)
          const fallbackMax = playerStats.lvl >= 8 ? 6 : 3;
          type = Math.floor(Math.random() * fallbackMax);
          // Exclude type 4 if not unlocked
          if (type === 4 && playerStats.lvl < 10) {
            type = Math.floor(Math.random() * 3);
          }
        }
        
        gs.enemies.push(new Enemy(type, ex, ez, playerStats.lvl));
      }
      
      // Phase 3: Chest spawn logic - only on wave completion (every 5th wave), high combo, or quest completion
      // Remove automatic every-3rd-wave spawning for more strategic chest placement
      if (gs.waveCount % 5 === 0) {
        // Wave completion chest
        const chestAngle = Math.random() * Math.PI * 2;
        const chestDist = 10 + Math.random() * 5; // 10-15 units from gs.player
        const cx = gs.player.mesh.position.x + Math.cos(chestAngle) * chestDist;
        const cz = gs.player.mesh.position.z + Math.sin(chestAngle) * chestDist;
        spawnChest(cx, cz);
        createFloatingText('Wave Bonus Chest!', gs.player.mesh.position, '#FFD700');
      }
    }

    // Kill Cam System - Diverse kill animations with gs.camera effects
    const KILL_CAM_CONSTANTS = {
      REGULAR_ENEMY_CHANCE: 0.15,
      ZOOM_IN_INTENSITY: 0.3,
      SLOW_MOTION_ZOOM: 0.15,
      SHAKE_ZOOM_INTENSITY: 0.4,
      ROTATE_CAM_RADIUS: 20,
      KILL_MESSAGES: ['ELIMINATED!', 'DESTROYED!', 'OBLITERATED!']
    };
    
    function getRandomKillMessage() {
      const messages = KILL_CAM_CONSTANTS.KILL_MESSAGES;
      return messages[Math.floor(Math.random() * messages.length)];
    }
    
    function triggerKillCam(enemyPosition, isMiniBoss = false, damageType = 'physical') {
      // UPDATED: Only trigger for mini-bosses to prevent disorienting gs.camera movements during regular combat
      // This improves gs.player focus and reduces motion sickness from frequent gs.camera shifts
      const shouldActivateKillCam = isMiniBoss;
      if (!shouldActivateKillCam || gs.killCamActive) return;
      
      // Select random kill cam animation type
      const killCamTypes = [
        'zoom_in',      // Zoom gs.camera towards kill
        'slow_motion',  // Brief slow-motion effect
        'rotate',       // Camera rotates around kill
        'shake_zoom',   // Intense shake with zoom
        'dramatic_pan'  // Pan and zoom combo
      ];
      
      gs.killCamType = killCamTypes[Math.floor(Math.random() * killCamTypes.length)];
      gs.killCamActive = true;
      gs.killCamTimer = 0;
      gs.killCamDuration = isMiniBoss ? 1.2 : 0.6; // Longer for mini-boss
      
      // Store gs.camera's current state
      gs.killCamData.originalCameraPos = gs.camera.position.clone();
      gs.killCamData.originalCameraTarget = new THREE.Vector3(gs.player.mesh.position.x, 0, gs.player.mesh.position.z);
      gs.killCamData.killPosition = enemyPosition.clone();
      gs.killCamData.isMiniBoss = isMiniBoss;
      gs.killCamData.damageType = damageType;
      
      // Create visual overlay effect
      createKillCamOverlay(isMiniBoss);
    }
    
    function createKillCamOverlay(isMiniBoss) {
      const overlay = document.createElement('div');
      overlay.id = 'kill-cam-overlay';
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '499';
      overlay.style.background = 'radial-gradient(circle at center, transparent 40%, rgba(0,0,0,0.3) 100%)';
      overlay.style.border = isMiniBoss ? '4px solid rgba(255, 215, 0, 0.6)' : '2px solid rgba(255, 255, 255, 0.3)';
      overlay.style.boxSizing = 'border-box';
      overlay.style.animation = 'killCamPulse 0.3s ease-in-out';
      document.body.appendChild(overlay);
      
      // Add kill text
      const killText = document.createElement('div');
      killText.style.position = 'absolute';
      killText.style.top = '50%';
      killText.style.left = '50%';
      killText.style.transform = 'translate(-50%, -50%)';
      killText.style.color = isMiniBoss ? '#FFD700' : '#FF0000';
      killText.style.fontSize = isMiniBoss ? '48px' : '36px';
      killText.style.fontWeight = '900';
      killText.style.textShadow = '0 0 10px rgba(0,0,0,0.8), 0 0 20px rgba(255,0,0,0.5)';
      killText.style.fontFamily = "'M PLUS Rounded 1c', sans-serif";
      killText.textContent = isMiniBoss ? '⚡ BOSS DOWN! ⚡' : getRandomKillMessage();
      killText.style.opacity = '0';
      killText.style.animation = 'killTextAppear 0.3s ease-out forwards';
      overlay.appendChild(killText);
      
      // Remove after duration
      setTimeout(() => {
        if (overlay.parentElement) {
          overlay.remove();
        }
      }, gs.killCamDuration * 1000);
    }
    
    function updateKillCam(dt) {
      if (!gs.killCamActive) return;
      
      gs.killCamTimer += dt;
      const progress = Math.min(gs.killCamTimer / gs.killCamDuration, 1);
      
      // Apply different gs.camera effects based on type
      switch (gs.killCamType) {
        case 'zoom_in':
          // Zoom gs.camera towards kill position
          const zoomFactor = 1 - (progress * KILL_CAM_CONSTANTS.ZOOM_IN_INTENSITY);
          const targetPos = gs.killCamData.killPosition.clone();
          gs.camera.position.x = gs.killCamData.originalCameraPos.x + (targetPos.x - gs.killCamData.originalCameraPos.x) * progress;
          gs.camera.position.z = gs.killCamData.originalCameraPos.z + ((targetPos.z + 15 * zoomFactor) - gs.killCamData.originalCameraPos.z) * progress;
          gs.camera.lookAt(targetPos.x, 0, targetPos.z);
          break;
          
        case 'slow_motion':
          // Slow motion is handled by time scale (visual effect only)
          // Add subtle zoom
          const slowZoom = 1 - (Math.sin(progress * Math.PI) * KILL_CAM_CONSTANTS.SLOW_MOTION_ZOOM);
          gs.camera.position.x = gs.killCamData.originalCameraPos.x;
          gs.camera.position.y = gs.killCamData.originalCameraPos.y;
          gs.camera.position.z = gs.killCamData.originalCameraPos.z * slowZoom;
          break;
          
        case 'rotate':
          // Rotate gs.camera around kill position
          const angle = progress * Math.PI * 0.5; // 90 degree rotation
          const radius = KILL_CAM_CONSTANTS.ROTATE_CAM_RADIUS;
          const centerPos = gs.killCamData.killPosition.clone();
          gs.camera.position.x = centerPos.x + Math.cos(angle) * radius;
          gs.camera.position.z = centerPos.z + Math.sin(angle) * radius;
          gs.camera.position.y = gs.killCamData.originalCameraPos.y;
          gs.camera.lookAt(centerPos.x, 0, centerPos.z);
          break;
          
        case 'shake_zoom':
          // Intense shake with zoom
          const shakeIntensity = (1 - progress) * 2;
          const zoomIn = 1 - (progress * KILL_CAM_CONSTANTS.SHAKE_ZOOM_INTENSITY);
          gs.camera.position.x = gs.killCamData.originalCameraPos.x + (Math.random() - 0.5) * shakeIntensity;
          gs.camera.position.y = gs.killCamData.originalCameraPos.y + (Math.random() - 0.5) * shakeIntensity;
          gs.camera.position.z = gs.killCamData.originalCameraPos.z * zoomIn + (Math.random() - 0.5) * shakeIntensity;
          break;
          
        case 'dramatic_pan':
          // Pan from enemy to gs.player with zoom
          const panProgress = Math.min(progress * 1.5, 1);
          const panTarget = new THREE.Vector3(
            gs.killCamData.killPosition.x + (gs.player.mesh.position.x - gs.killCamData.killPosition.x) * panProgress,
            0,
            gs.killCamData.killPosition.z + (gs.player.mesh.position.z - gs.killCamData.killPosition.z) * panProgress
          );
          // Interpolate gs.camera position to create the actual pan motion
          const panStartPos = gs.killCamData.originalCameraPos;
          const panEndPosZOffset = 10; // slight forward offset for a subtle zoom effect
          const panEndPos = new THREE.Vector3(
            panTarget.x,
            panStartPos.y,
            panTarget.z + panEndPosZOffset
          );
          gs.camera.position.x = panStartPos.x + (panEndPos.x - panStartPos.x) * panProgress;
          gs.camera.position.y = panStartPos.y + (panEndPos.y - panStartPos.y) * panProgress;
          gs.camera.position.z = panStartPos.z + (panEndPos.z - panStartPos.z) * panProgress;
          gs.camera.lookAt(panTarget);
          break;
      }
      
      // End kill cam
      if (progress >= 1) {
        gs.killCamActive = false;
        // Smoothly return gs.camera to normal position
        gs.camera.position.copy(gs.killCamData.originalCameraPos);
        gs.camera.lookAt(gs.killCamData.originalCameraTarget);
      }
    }

    // Phase 5: Updated to use Object Pool for performance
    const MAX_TOTAL_PARTICLES = 150; // Hard cap per spec
    function spawnParticles(pos, color, count) {
      if (!gs.particlePool) return; // Safety check
      // Apply FPS throttle if active (50% reduction when FPS < 30)
      if (gs.performanceLog && gs.performanceLog.particleThrottleActive) {
        count = Math.ceil(count * 0.5);
      }
      // Enforce hard particle cap for performance
      if (gs.particles.length >= MAX_TOTAL_PARTICLES) return;
      // Cap gs.particles per spawn to reduce quantity while keeping visuals impactful
      const cappedCount = Math.min(count, 6, MAX_TOTAL_PARTICLES - gs.particles.length);
      for(let i=0; i<cappedCount; i++) {
        const particle = gs.particlePool.get();
        particle.reset(pos, color);
        gs.particles.push(particle);
      }
    }

    // Blood ground decal - small circle splat on the ground for realistic blood
    // Uses a circular buffer approach: overwrite oldest slot instead of shift() for O(1)
    const BLOOD_DECAL_FADE_MS = 12000; // 12 seconds fade per spec
    function spawnBloodDecal(pos) {
      if (!gs.scene) return;
      const now = Date.now();
      if (gs.bloodDecals.length < MAX_BLOOD_DECALS) {
        // Buffer not full yet - append
        const size = 0.15 + Math.random() * 0.35;
        const geo = new THREE.CircleGeometry(size, 6);
        const initialOpacity = 0.6 + Math.random() * 0.3;
        const mat = new THREE.MeshBasicMaterial({
          color: 0x6B0000,
          transparent: true,
          opacity: initialOpacity,
          depthWrite: false
        });
        const decal = new THREE.Mesh(geo, mat);
        decal.rotation.x = -Math.PI / 2;
        decal.position.set(pos.x + (Math.random() - 0.5) * 0.8, 0.02, pos.z + (Math.random() - 0.5) * 0.8);
        decal.userData.spawnTime = now;
        decal.userData.initialOpacity = initialOpacity;
        gs.scene.add(decal);
        gs.bloodDecals.push(decal);
      } else {
        // Reuse existing slot (O(1) circular overwrite)
        const old = gs.bloodDecals[gs.bloodDecalIndex];
        const initialOpacity = 0.6 + Math.random() * 0.3;
        old.position.set(pos.x + (Math.random() - 0.5) * 0.8, 0.02, pos.z + (Math.random() - 0.5) * 0.8);
        old.material.opacity = initialOpacity;
        old.userData.spawnTime = now;
        old.userData.initialOpacity = initialOpacity;
        gs.bloodDecalIndex = (gs.bloodDecalIndex + 1) % MAX_BLOOD_DECALS;
      }
    }
    
    // Update blood decal fade (call in main loop)
    const BLOOD_DECAL_FADE_START = 0.7; // Start fading at 70% of lifetime
    function updateBloodDecals() {
      const now = Date.now();
      for (const decal of gs.bloodDecals) {
        if (!decal.userData.spawnTime) continue;
        const age = now - decal.userData.spawnTime;
        if (age >= BLOOD_DECAL_FADE_MS) {
          decal.material.opacity = 0;
        } else if (age > BLOOD_DECAL_FADE_MS * BLOOD_DECAL_FADE_START) {
          // Start fading at 70% of lifetime
          const fadeProgress = (age - BLOOD_DECAL_FADE_MS * BLOOD_DECAL_FADE_START) / (BLOOD_DECAL_FADE_MS * (1 - BLOOD_DECAL_FADE_START));
          decal.material.opacity = (decal.userData.initialOpacity || 0.7) * (1 - fadeProgress);
        }
      }
    }
    
    // Enhanced muzzle smoke effect - managed array to avoid RAF accumulation
    function spawnMuzzleSmoke(pos, count = 5) {
      const cappedCount = Math.min(count, 3); // Cap per-call count
      for(let i = 0; i < cappedCount; i++) {
        // Enforce global cap - just skip if full, gs.particles expire naturally
        if (gs.smokeParticles.length >= MAX_SMOKE_PARTICLES) continue;
        const smokeGeo = new THREE.SphereGeometry(0.04, 6, 6);
        const smokeMat = new THREE.MeshBasicMaterial({ 
          color: 0x666666, 
          transparent: true, 
          opacity: 0.5,
          depthWrite: false
        });
        const smoke = new THREE.Mesh(smokeGeo, smokeMat);
        smoke.position.set(
          pos.x + (Math.random() - 0.5) * 0.3,
          pos.y + 0.5,
          pos.z + (Math.random() - 0.5) * 0.3
        );
        gs.scene.add(smoke);
        gs.smokeParticles.push({
          mesh: smoke,
          material: smokeMat,
          geometry: smokeGeo,
          velocity: {
            x: (Math.random() - 0.5) * 0.02,
            y: 0.03 + Math.random() * 0.02,
            z: (Math.random() - 0.5) * 0.02
          },
          life: GAME_CONFIG.smokeDurationFrames,
          maxLife: GAME_CONFIG.smokeDurationFrames
        });
      }
    }

    function spawnExp(x, z) {
      gs.expGems.push(new ExpGem(x, z));
    }
    
    function spawnGold(x, z, amount) {
      gs.goldCoins.push(new GoldCoin(x, z, amount));
    }
    
    function spawnChest(x, z, tier = 'common') {
      gs.chests.push(new Chest(x, z, tier));
      createFloatingText('CHEST!', new THREE.Vector3(x, 0.3, z));
    }
    
    function addGold(amount) {
      // Apply gold bonus from permanent upgrades
      const bonus = PERMANENT_UPGRADES.goldEarned.effect(gs.saveData.upgrades.goldEarned);
      const finalAmount = Math.floor(amount * (1 + bonus));
      playerStats.gold += finalAmount;
      gs.saveData.gold += finalAmount;
      gs.saveData.totalGoldEarned += finalAmount;
      updateHUD();
      updateGoldDisplays();
    }
    
    function updateGoldDisplays() {
      const goldText = `GOLD: ${gs.saveData.gold}`;
      const menuGold = document.getElementById('menu-gold');
      const shopGold = document.getElementById('shop-gold');
      if (menuGold) menuGold.innerText = goldText;
      if (shopGold) shopGold.innerText = goldText;
    }
    
    function spawnWaterDroplet(pos) {
      // Create small water droplet that falls and disappears
      const geo = new THREE.SphereGeometry(0.1, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: COLORS.player, transparent: true, opacity: 0.6 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.position.y = 0.3;
      gs.scene.add(mesh);
      
      // Animate falling
      let life = 20;
      const update = () => {
        life--;
        mesh.position.y -= 0.02;
        mat.opacity = life / 20;
        if (life <= 0 || mesh.position.y <= 0.05) {
          gs.scene.remove(mesh);
          mesh.geometry.dispose();
          mesh.material.dispose();
        } else {
          requestAnimationFrame(update);
        }
      };
      update();
    }

    function addExp(amount) {
      playerStats.exp += amount;
      
      // Phase 5: Give companion XP (10% of gs.player XP)
      if (gs.activeCompanion && !gs.activeCompanion.isDead) {
        gs.activeCompanion.addXP(amount);
      }
      
      // Trigger waterdrop grow animation on XP pickup
      const waterdropContainer = document.getElementById('waterdrop-container');
      waterdropContainer.classList.add('grow');
      setTimeout(() => {
        waterdropContainer.classList.remove('grow');
      }, 300);
      
      if (playerStats.exp >= playerStats.expReq && !gs.isGameOver && gs.isGameActive && !gs.levelUpPending) {
        const levelUpModal = document.getElementById('levelup-modal');
        if (!levelUpModal || levelUpModal.style.display !== 'flex') {
          levelUp();
        }
      }
      updateHUD();
    }

    function levelUp() {
      gs.levelUpPending = true;
      setGamePaused(true);
      
      // Lock gs.camera during level-up to prevent zoom changes
      // Save both position and projection for proper restoration
      gs.savedCameraPosition = { 
        x: gs.camera.position.x, 
        y: gs.camera.position.y, 
        z: gs.camera.position.z,
        left: gs.camera.left,
        right: gs.camera.right,
        top: gs.camera.top,
        bottom: gs.camera.bottom
      };
      
      // Pause combo timer during level-up (only if combo is still active)
      if (gs.comboState.lastKillTime && gs.comboState.count >= 5) {
        const currentTime = Date.now();
        const timeSinceLastKill = currentTime - gs.comboState.lastKillTime;
        // Only pause if combo hasn't expired yet
        if (timeSinceLastKill < gs.comboState.comboWindow) {
          gs.comboState.pausedAt = currentTime;
        }
      }
      
      playerStats.lvl++;
      playerStats.exp -= playerStats.expReq;
      
      // Victory condition: Reaching level 150
      if (playerStats.lvl === 150) {
        setTimeout(() => {
          showStatChange('🎉 ULTIMATE VICTORY! You reached Level 150! 🎉');
          setTimeout(() => {
            gameOver(); // Show game over screen as victory screen
          }, 2000);
        }, 1000);
        return;
      }
      
      // Custom XP Curve: Progressive difficulty scaling to level 150
      // Early game (1-30): Hard but manageable
      // Mid game (31-75): Balanced progression after upgrade threshold
      // Late game (76-150): Challenging endgame content
      let killsNeeded;
      if (playerStats.lvl <= 5) {
        killsNeeded = 2 + playerStats.lvl; // Levels 1-5: 3, 4, 5, 6, 7 kills respectively
      } else if (playerStats.lvl <= 15) {
        killsNeeded = 7 + Math.floor((playerStats.lvl - 5) * 0.5); // Levels 6-15: 7-12 kills
      } else if (playerStats.lvl <= 30) {
        killsNeeded = 12 + Math.floor((playerStats.lvl - 15) * 0.7); // Levels 16-30: 12-22 kills
      } else if (playerStats.lvl <= 50) {
        killsNeeded = 22 + Math.floor((playerStats.lvl - 30) * 1); // Levels 31-50: 22-42 kills
      } else if (playerStats.lvl <= 75) {
        killsNeeded = 42 + Math.floor((playerStats.lvl - 50) * 1.2); // Levels 51-75: 42-72 kills
      } else if (playerStats.lvl <= 100) {
        killsNeeded = 72 + Math.floor((playerStats.lvl - 75) * 1.5); // Levels 76-100: 72-109 kills
      } else if (playerStats.lvl <= 125) {
        killsNeeded = 109 + Math.floor((playerStats.lvl - 100) * 1.8); // Levels 101-125: 109-154 kills
      } else {
        killsNeeded = 154 + Math.floor((playerStats.lvl - 125) * 2); // Levels 126-150: 154+ kills (extreme endgame)
      }
      playerStats.expReq = killsNeeded * GAME_CONFIG.expValue;
      
      // Check for level achievements
      checkAchievements();
      
      // SLOW MOTION EFFECT - Time slows, sounds pitch down
      createSlowMotionEffect();
      
      // NEW: Centered LEVEL UP text animation (grow → shrink → fade)
      createCenteredLevelUpText();
      
      // Level up visual effects with delay for slow-mo
      setTimeout(() => {
        createLevelUpEffects();
        playSound('levelup');
      }, 300);
      
      // Show upgrade modal with dramatic entrance after effects - FASTER
      setTimeout(() => {
        try {
          showUpgradeModal();
        } catch(e) {
          console.error('[LevelUp] showUpgradeModal error:', e);
          // Fallback: resume game so gs.player isn't stuck
          gs.levelUpPending = false;
          setGamePaused(false);
        }
      }, 800);
    }
    
    function checkPendingLevelUp() {
      gs.levelUpPending = false;
      if (playerStats && playerStats.exp >= playerStats.expReq && !gs.isGameOver && gs.isGameActive) {
        const modal = document.getElementById('levelup-modal');
        if (!modal || modal.style.display !== 'flex') {
          levelUp();
        }
      }
    }
    window.checkPendingLevelUp = checkPendingLevelUp;
    // NEW: "LEVEL UP!" text that shoots from character's head
    function createCenteredLevelUpText() {
      const levelUpText = document.createElement('div');
      
      // Calculate character head position on screen
      let startX = window.innerWidth / 2;
      let startY = window.innerHeight / 2;
      if (gs.player && gs.player.mesh && gs.camera) {
        const headPos = gs.player.mesh.position.clone();
        headPos.y += 2; // Above gs.player
        headPos.project(gs.camera);
        startX = (headPos.x * 0.5 + 0.5) * window.innerWidth;
        startY = (-(headPos.y * 0.5) + 0.5) * window.innerHeight;
      }
      
      levelUpText.style.cssText = `
        position: fixed;
        left: ${startX}px;
        top: ${startY}px;
        transform: translate(-50%, -50%) scale(0);
        font-family: 'Bangers', cursive;
        font-size: 38px;
        font-weight: 500;
        color: #FFD700;
        text-shadow: 
          0 0 10px rgba(255,215,0,0.85),
          0 0 20px rgba(93,173,226,0.4),
          2px 2px 0 #000,
          -1px -1px 0 #000,
          1px -1px 0 #000,
          -1px 1px 0 #000;
        z-index: 200;
        pointer-events: none;
        letter-spacing: 4px;
      `;
      levelUpText.textContent = 'LEVEL UP!';
      document.body.appendChild(levelUpText);
      
      // Animation: shoot up from character head, wait 0.2s, then float to center
      const startTime = Date.now();
      const totalDuration = 2000; // 2 seconds total
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      
      const animFn = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / totalDuration;
        
        if (progress < 0.15) {
          // Phase 1: Shoot up from head (0-15% = 300ms)
          const t = progress / 0.15;
          const scale = t * 1.2;
          const curY = startY - t * 80; // Shoot up 80px
          levelUpText.style.top = curY + 'px';
          levelUpText.style.transform = `translate(-50%, -50%) scale(${scale})`;
          levelUpText.style.opacity = t;
        } else if (progress < 0.25) {
          // Phase 2: Wait 0.2s at that position (15-25%)
          levelUpText.style.transform = `translate(-50%, -50%) scale(1.2)`;
          levelUpText.style.opacity = 1;
        } else if (progress < 0.65) {
          // Phase 3: Float toward center and grow (25-65%)
          const t = (progress - 0.25) / 0.40;
          const curX = startX + (centerX - startX) * t;
          const curY = (startY - 80) + (centerY - (startY - 80)) * t;
          const scale = 1.2 + t * 0.2; // Grow to 1.4x
          levelUpText.style.left = curX + 'px';
          levelUpText.style.top = curY + 'px';
          levelUpText.style.transform = `translate(-50%, -50%) scale(${scale})`;
          levelUpText.style.opacity = 1;
        } else if (progress < 1) {
          // Phase 4: Shrink and fade at center (65-100%)
          const fadeProgress = (progress - 0.65) / 0.35;
          const scale = 1.4 - (fadeProgress * 0.8);
          const opacity = 1 - fadeProgress;
          levelUpText.style.left = centerX + 'px';
          levelUpText.style.top = centerY + 'px';
          levelUpText.style.transform = `translate(-50%, -50%) scale(${scale})`;
          levelUpText.style.opacity = opacity;
        } else {
          // Animation complete, remove element
          if (levelUpText.parentNode) levelUpText.parentNode.removeChild(levelUpText);
          return;
        }
        
        requestAnimationFrame(animFn);
      };
      animFn();
    }
    
    function createSmallFloatingText(text, pos) {
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.color = '#5DADE2';
      div.style.fontSize = '18px';
      div.style.fontWeight = 'bold';
      div.style.textShadow = '0 0 10px rgba(93,173,226,0.8), 0 0 20px rgba(93,173,226,0.5), 2px 2px 4px #000';
      div.style.pointerEvents = 'none';
      div.style.zIndex = '1000';
      div.innerText = text;
      
      const vec = pos.clone();
      vec.y += 1;
      vec.project(gs.camera);
      
      const x = (vec.x * .5 + .5) * window.innerWidth;
      const y = (-(vec.y * .5) + .5) * window.innerHeight;
      
      div.style.left = `${x}px`;
      div.style.top = `${y}px`;
      div.style.transform = 'translate(-50%, -50%)';
      
      document.body.appendChild(div);
      
      // Animate upward (same as damage numbers)
      setTimeout(() => div.remove(), 1000);
    }
    
    function createSlowMotionEffect() {
      // Create slow motion visual overlay
      const slowMoOverlay = document.createElement('div');
      slowMoOverlay.style.position = 'fixed';
      slowMoOverlay.style.top = '0';
      slowMoOverlay.style.left = '0';
      slowMoOverlay.style.width = '100%';
      slowMoOverlay.style.height = '100%';
      slowMoOverlay.style.background = 'radial-gradient(circle, rgba(93,173,226,0.3), rgba(0,0,0,0.6))';
      slowMoOverlay.style.zIndex = '15';
      slowMoOverlay.style.pointerEvents = 'none';
      slowMoOverlay.style.animation = 'slowMoPulse 1.5s ease-in-out';
      document.body.appendChild(slowMoOverlay);
      
      // Add CSS animation for slow-mo effect
      if (!document.getElementById('slowMoStyle')) {
        const style = document.createElement('style');
        style.id = 'slowMoStyle';
        style.textContent = `
          @keyframes slowMoPulse {
            0% { opacity: 0; }
            50% { opacity: 1; }
            100% { opacity: 0; }
          }
          @keyframes swooshInLeft {
            0% { transform: translateX(-200%) scale(0.5); opacity: 0; }
            60% { transform: translateX(10%) scale(1.1); opacity: 1; }
            100% { transform: translateX(0) scale(1); opacity: 1; }
          }
          @keyframes swooshInRight {
            0% { transform: translateX(200%) scale(0.5); opacity: 0; }
            60% { transform: translateX(-10%) scale(1.1); opacity: 1; }
            100% { transform: translateX(0) scale(1); opacity: 1; }
          }
        `;
        document.head.appendChild(style);
      }
      
      setTimeout(() => {
        slowMoOverlay.remove();
      }, 1500);
    }
    
    function createLevelUpEffects() {
      // Water Fountain Effect - 60 water droplet gs.particles explode from character
      for(let i=0; i<60; i++) {
        const angle = (i / 60) * Math.PI * 2;
        const speed = 0.2 + Math.random() * 0.4;
        const height = 0.6 + Math.random() * 0.8;
        
        // Water droplets
        const dropletGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const dropletMat = new THREE.MeshPhysicalMaterial({ 
          color: COLORS.player,
          transparent: true,
          opacity: 0.9,
          metalness: 0.3,
          roughness: 0.1
        });
        const droplet = new THREE.Mesh(dropletGeo, dropletMat);
        droplet.position.copy(gs.player.mesh.position);
        droplet.position.y += 1;
        gs.scene.add(droplet);
        
        const vel = new THREE.Vector3(
          Math.cos(angle) * speed,
          height,
          Math.sin(angle) * speed
        );
        
        let life = 80;
        const updateDroplet = () => {
          life--;
          droplet.position.add(vel);
          vel.y -= 0.03; // Gravity
          droplet.rotation.y += 0.1;
          droplet.material.opacity = life / 80;
          
          if (life <= 0 || droplet.position.y < 0) {
            gs.scene.remove(droplet);
            droplet.geometry.dispose();
            droplet.material.dispose();
          } else {
            requestAnimationFrame(updateDroplet);
          }
        };
        updateDroplet();
      }
      
      // Water-sprout-from-head level-up ring: multiple expanding rings + vertical water jet
      // Ring 1: fast-expanding bright ring (teal/white)
      const ringGeo = new THREE.RingGeometry(0.3, 0.8, 24);
      const ringMat = new THREE.MeshBasicMaterial({ 
        color: 0xAAF0FF,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(gs.player.mesh.position);
      ring.position.y = 0.05;
      ring.rotation.x = -Math.PI / 2;
      gs.scene.add(ring);
      
      let ringLife = 70;
      const updateRing = () => {
        ringLife--;
        const scale = 1 + (70 - ringLife) * 0.18;
        ring.scale.set(scale, scale, 1);
        ring.material.opacity = Math.max(0, ringLife / 70);
        
        if (ringLife <= 0) {
          gs.scene.remove(ring);
          ring.geometry.dispose();
          ring.material.dispose();
        } else {
          requestAnimationFrame(updateRing);
        }
      };
      updateRing();
      
      // Ring 2: slower second ring (blue, slightly delayed)
      const ring2Geo = new THREE.RingGeometry(0.3, 0.6, 24);
      const ring2Mat = new THREE.MeshBasicMaterial({ color: 0x5DADE2, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
      const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
      ring2.position.copy(gs.player.mesh.position);
      ring2.position.y = 0.05;
      ring2.rotation.x = -Math.PI / 2;
      gs.scene.add(ring2);
      let ring2Life = 50;
      const updateRing2 = () => {
        ring2Life--;
        const s2 = 0.5 + (50 - ring2Life) * 0.22;
        ring2.scale.set(s2, s2, 1);
        ring2.material.opacity = Math.max(0, ring2Life / 50 * 0.85);
        if (ring2Life <= 0) {
          gs.scene.remove(ring2);
          ring2Geo.dispose(); ring2Mat.dispose();
        } else requestAnimationFrame(updateRing2);
      };
      setTimeout(updateRing2, 80); // Slightly delayed second ring
      
      // Vertical water column shooting up from head (water sprout)
      // Shared base material cloned per jet for individual opacity animation
      const jetBaseMat = new THREE.MeshBasicMaterial({ color: 0x5DADE2, transparent: true, opacity: 0.85 });
      for (let j = 0; j < 18; j++) {
        const jetGeo = new THREE.SphereGeometry(0.07 + Math.random() * 0.05, 6, 6);
        const jetMat = jetBaseMat.clone(); // Clone for per-jet opacity animation
        const jet = new THREE.Mesh(jetGeo, jetMat);
        jet.position.copy(gs.player.mesh.position);
        jet.position.y += 1.2; // From head height
        const spreadAngle = (j / 18) * Math.PI * 2;
        const spreadR = 0.15 + Math.random() * 0.2;
        const vel = new THREE.Vector3(
          Math.cos(spreadAngle) * spreadR * 0.3,
          0.35 + Math.random() * 0.5, // Upward jet
          Math.sin(spreadAngle) * spreadR * 0.3
        );
        gs.scene.add(jet);
        let jLife = 55 + Math.floor(Math.random() * 20);
        const maxJLife = jLife;
        const updateJet = () => {
          jLife--;
          jet.position.add(vel);
          vel.y -= 0.025; // Gravity brings it back down
          jet.material.opacity = Math.max(0, jLife / maxJLife * 0.9);
          if (jLife <= 0 || jet.position.y < 0) {
            gs.scene.remove(jet);
            jetGeo.dispose(); jetMat.dispose();
          } else requestAnimationFrame(updateJet);
        };
        updateJet();
      }
      jetBaseMat.dispose(); // Dispose the shared base after all clones are made
      
      // Fountain/explosion of "LEVEL UP" text gs.particles from gs.player's head
      const texts = ["L", "E", "V", "E", "L", " ", "U", "P", "!"];
      
      for(let i=0; i<40; i++) {
        const angle = (i / 40) * Math.PI * 2;
        const speed = 0.15 + Math.random() * 0.35;
        const text = texts[i % texts.length];
        
        const particle = new LevelUpTextParticle(
          gs.player.mesh.position.clone(),
          new THREE.Vector3(
            Math.cos(angle) * speed,
            0.4 + Math.random() * 0.6,
            Math.sin(angle) * speed
          ),
          text
        );
        gs.particles.push(particle);
      }
      
      // Add regular colored gs.particles
      for(let i=0; i<30; i++) {
        const angle = (i / 30) * Math.PI * 2;
        const speed = 0.2 + Math.random() * 0.3;
        const particle = new LevelUpParticle(
          gs.player.mesh.position.clone(),
          new THREE.Vector3(
            Math.cos(angle) * speed,
            0.5 + Math.random() * 0.5,
            Math.sin(angle) * speed
          )
        );
        gs.particles.push(particle);
      }
      
      // REMOVED: Lightning bolts (too expensive for performance)
      // ADDED: Extra water spray from head, arms, and ground around character
      // Water spray from character's head
      for(let i=0; i<20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.3 + Math.random() * 0.5;
        const dropletGeo = new THREE.SphereGeometry(0.1, 6, 6);
        const dropletMat = new THREE.MeshPhysicalMaterial({ 
          color: 0x5DADE2,
          transparent: true,
          opacity: 0.8,
          metalness: 0.4,
          roughness: 0.2
        });
        const droplet = new THREE.Mesh(dropletGeo, dropletMat);
        droplet.position.copy(gs.player.mesh.position);
        droplet.position.y += 1.5; // From head
        gs.scene.add(droplet);
        
        const vel = new THREE.Vector3(
          Math.cos(angle) * speed,
          0.8 + Math.random() * 0.4,
          Math.sin(angle) * speed
        );
        
        let life = 60;
        const updateDroplet = () => {
          life--;
          droplet.position.add(vel);
          vel.y -= 0.04; // Gravity
          droplet.material.opacity = life / 60;
          
          if (life <= 0 || droplet.position.y < 0) {
            gs.scene.remove(droplet);
            droplet.geometry.dispose();
            droplet.material.dispose();
          } else {
            requestAnimationFrame(updateDroplet);
          }
        };
        updateDroplet();
      }
      
      // Water spray from ground around character (circle pattern)
      for(let i=0; i<30; i++) {
        const angle = (i / 30) * Math.PI * 2;
        const radius = 1 + Math.random() * 0.5;
        const dropletGeo = new THREE.SphereGeometry(0.08, 6, 6);
        const dropletMat = new THREE.MeshPhysicalMaterial({ 
          color: 0x3498DB,
          transparent: true,
          opacity: 0.9,
          metalness: 0.3,
          roughness: 0.1
        });
        const droplet = new THREE.Mesh(dropletGeo, dropletMat);
        droplet.position.copy(gs.player.mesh.position);
        droplet.position.x += Math.cos(angle) * radius;
        droplet.position.z += Math.sin(angle) * radius;
        droplet.position.y = 0.1;
        gs.scene.add(droplet);
        
        const vel = new THREE.Vector3(
          Math.cos(angle) * 0.15,
          0.6 + Math.random() * 0.4,
          Math.sin(angle) * 0.15
        );
        
        let life = 50;
        const updateDroplet = () => {
          life--;
          droplet.position.add(vel);
          vel.y -= 0.035;
          droplet.material.opacity = life / 50;
          
          if (life <= 0 || droplet.position.y < 0) {
            gs.scene.remove(droplet);
            droplet.geometry.dispose();
            droplet.material.dispose();
          } else {
            requestAnimationFrame(updateDroplet);
          }
        };
        updateDroplet();
      }
      
      // Camera zoom effect
      const originalD = 20;
      const zoomD = 12; // Zoom closer
      const zoomDuration = 1200; // ms
      const startTime = Date.now();
      
      const zoomAnim = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / zoomDuration, 1);
        const eased = 1 - Math.pow(1 - t, 3); // Ease out cubic
        
        const d = originalD - (originalD - zoomD) * Math.sin(eased * Math.PI);
        const aspect = window.innerWidth / window.innerHeight;
        gs.camera.left = -d * aspect;
        gs.camera.right = d * aspect;
        gs.camera.top = d;
        gs.camera.bottom = -d;
        gs.camera.updateProjectionMatrix();
        
        if (t < 1) {
          requestAnimationFrame(zoomAnim);
        }
      };
      zoomAnim();
      
      // Screen shake
      const originalCameraPos = gs.camera.position.clone();
      let shakeTime = 0;
      const shakeDuration = 0.5;
      
      const shakeAnim = () => {
        shakeTime += 0.016;
        if (shakeTime < shakeDuration) {
          const intensity = (1 - shakeTime / shakeDuration) * 2;
          gs.camera.position.x = originalCameraPos.x + (Math.random() - 0.5) * intensity;
          gs.camera.position.y = originalCameraPos.y + (Math.random() - 0.5) * intensity;
          gs.camera.position.z = originalCameraPos.z + (Math.random() - 0.5) * intensity;
          requestAnimationFrame(shakeAnim);
        } else {
          gs.camera.position.copy(originalCameraPos);
        }
      };
      shakeAnim();
    }
    
    class LevelUpTextParticle {
      constructor(pos, vel, text) {
        // Create sprite with text
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 48px Arial';
        ctx.fillStyle = '#5DADE2';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#FFF';
        ctx.shadowBlur = 10;
        ctx.fillText(text, 32, 32);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        this.mesh = new THREE.Sprite(spriteMat);
        this.mesh.scale.set(0.5, 0.5, 0.5);
        this.mesh.position.copy(pos);
        this.mesh.position.y += 1;
        this.vel = vel;
        gs.scene.add(this.mesh);
        this.life = 80;
        this.rotSpeed = (Math.random() - 0.5) * 0.2;
      }
      
      update() {
        this.life--;
        this.mesh.position.add(this.vel);
        this.vel.y -= 0.02; // Gravity
        this.mesh.rotation.z += this.rotSpeed;
        
        // Fade out
        this.mesh.material.opacity = this.life / 80;
        
        if (this.mesh.position.y < 0.1) {
          this.mesh.position.y = 0.1;
          this.vel.y *= -0.5; // Bounce
          this.vel.x *= 0.7;
          this.vel.z *= 0.7;
        }
        
        if (this.life <= 0) {
          gs.scene.remove(this.mesh);
          this.mesh.material.map.dispose();
          this.mesh.material.dispose();
          return false;
        }
        return true;
      }
    }
    
    class LightningBolt {
      constructor(start, end) {
        const points = [];
        const segments = 8; // Reduced from 12 for performance
        
        for(let i=0; i<=segments; i++) {
          const t = i / segments;
          const x = start.x + (end.x - start.x) * t + (Math.random() - 0.5) * 1.5; // Reduced randomness
          const y = start.y + (end.y - start.y) * t + (Math.random() - 0.5) * 1.5;
          const z = start.z + (end.z - start.z) * t + (Math.random() - 0.5) * 1.5;
          points.push(new THREE.Vector3(x, y, z));
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
          color: 0x00FFFF, // Bright cyan/electric blue for better distinction from gunfire
          transparent: true, 
          opacity: 1,
          linewidth: 5 // Note: linewidth not supported in WebGL, will render at 1px
        });
        
        this.mesh = new THREE.Line(geometry, material);
        gs.scene.add(this.mesh);
        this.life = 20; // Reduced from 30 for performance
        this.maxLife = 20;
      }
      
      update() {
        this.life--;
        this.mesh.material.opacity = this.life / this.maxLife;
        
        if (this.life <= 0) {
          gs.scene.remove(this.mesh);
          this.mesh.geometry.dispose();
          this.mesh.material.dispose();
          return false;
        }
        return true;
      }
    }
    
    class LevelUpParticle {
      constructor(pos, vel) {
        const geo = new THREE.OctahedronGeometry(0.15);
        const mat = new THREE.MeshBasicMaterial({ color: 0xFFD700 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(pos);
        this.mesh.position.y += 1;
        this.vel = vel;
        gs.scene.add(this.mesh);
        this.life = 60;
      }
      
      update() {
        this.life--;
        this.mesh.position.add(this.vel);
        this.vel.y -= 0.015; // Gravity
        this.mesh.rotation.x += 0.1;
        this.mesh.rotation.y += 0.1;
        
        if (this.mesh.position.y < 0) {
          this.mesh.position.y = 0;
          this.vel.y = 0;
          this.vel.x *= 0.8;
          this.vel.z *= 0.8;
        }
        
        if (this.life <= 0) {
          gs.scene.remove(this.mesh);
          this.mesh.geometry.dispose();
          this.mesh.material.dispose();
          return false;
        }
        return true;
      }
    }
    
    // Floating text fade tracking to prevent memory leaks
    
    function createFloatingText(text, pos) {
      // Display message in status bar instead of floating text
      const statusEl = document.getElementById('status-message');
      if (!statusEl) return;
      
      // Clear any existing fade interval and timeout
      if (gs.floatingTextFadeInterval) {
        clearInterval(gs.floatingTextFadeInterval);
        gs.floatingTextFadeInterval = null;
      }
      if (gs.floatingTextFadeTimeout) {
        clearTimeout(gs.floatingTextFadeTimeout);
        gs.floatingTextFadeTimeout = null;
      }
      
      statusEl.innerText = text;
      statusEl.style.color = '#FF4444'; // Red for important messages like mini-boss
      statusEl.style.fontSize = '18px';
      statusEl.style.opacity = '1';
      
      // Clear after 4 seconds with fade out
      gs.floatingTextFadeTimeout = setTimeout(() => {
        let opacity = 1;
        gs.floatingTextFadeInterval = setInterval(() => {
          opacity -= 0.05;
          if (opacity <= 0) {
            clearInterval(gs.floatingTextFadeInterval);
            gs.floatingTextFadeInterval = null;
            statusEl.innerText = '';
            statusEl.style.opacity = '1';
            statusEl.style.fontSize = '16px';
          } else {
            statusEl.style.opacity = opacity.toString();
          }
        }, 50);
      }, 4000);
    }

    function showUpgradeModal() {
      const modal = document.getElementById('levelup-modal');
      const list = document.getElementById('upgrade-list');
      list.innerHTML = '';
      // Reset header for two-press system
      const h2 = modal.querySelector('h2');
      if (h2) { h2.innerText = 'LEVEL UP!'; h2.style.color = ''; h2.style.fontSize = '32px'; }
      
      let choices = [];

      // --- POOL OF UPGRADES ---
      const commonUpgrades = [
        { 
          id: 'str', 
          icon: '⚔️',
          title: 'MUSCLE JUICE', 
          desc: 'Weapon Damage +6% (Level-100 Balanced)', 
          apply: () => { 
            playerStats.strength += 0.06; // Reduced from 0.15 to 0.06 for level-100 balance
            showStatChange('+6% Damage');
          } 
        },
        { 
          id: 'aspd', 
          icon: '⚡',
          title: 'SPEEDY TRIGGER', 
          desc: 'Attack Speed +3% (Level-100 Balanced)', 
          apply: () => { 
            playerStats.atkSpeed += 0.03; // Reduced from 0.15 to 0.03 for level-100 balance
            weapons.gun.cooldown *= 0.97; // Adjusted from 0.85 to 0.97
            weapons.doubleBarrel.cooldown *= 0.97;
            showStatChange('+3% Attack Speed');
          } 
        },
        { 
          id: 'armor', 
          icon: '🛡️',
          title: 'THICC ARMOR', 
          desc: 'Armor +12% (Damage Reduction, Max 80%)', 
          apply: () => { 
            playerStats.armor = Math.min(80, playerStats.armor + 12); 
            showStatChange('+12% Armor (Current: ' + playerStats.armor + '%)');
          } 
        },
        { 
          id: 'hp', 
          icon: '❤️',
          title: 'CHONKY BODY', 
          desc: 'Max HP +30 (Instant Heal +30)', 
          apply: () => { 
            playerStats.maxHp += 30; 
            playerStats.hp += 30; 
            showStatChange('+30 Max HP');
          } 
        },
        { 
          id: 'crit', 
          icon: '🎯',
          title: 'CRIT MACHINE', 
          desc: 'Critical Hit Chance +1.5% (Level-100 Balanced)', 
          apply: () => { 
            playerStats.critChance += 0.015; // Reduced from 0.08 to 0.015 for level-100 balance
            showStatChange('+1.5% Crit Chance (Now: ' + Math.round(playerStats.critChance * 100) + '%)');
          } 
        },
        { 
          id: 'regen', 
          icon: '💚',
          title: 'HEALING VIBES', 
          desc: 'HP Regeneration +2/sec (Passive Healing)', 
          apply: () => { 
            playerStats.hpRegen += 2; 
            showStatChange('+2 HP/sec Regen (Total: ' + playerStats.hpRegen + '/sec)');
          } 
        },
        { 
          id: 'speed', 
          icon: '🏃',
          title: 'SPEEDY BOI', 
          desc: 'Movement Speed +3% (Level-100 Balanced)', 
          apply: () => { 
            playerStats.walkSpeed *= 1.03; // Reduced from 1.15 to 1.03 for level-100 balance
            showStatChange('+3% Move Speed');
          } 
        },
        { 
          id: 'critdmg', 
          icon: '💥',
          title: 'GLASS CANNON', 
          desc: 'Critical Damage +6% (Level-100 Balanced)', 
          apply: () => { 
            playerStats.critDmg += 0.06; // Reduced from 0.3 to 0.06 for level-100 balance
            showStatChange('+6% Crit Damage (Now: ' + Math.round(playerStats.critDmg * 100) + '%)');
          } 
        },
        { 
          id: 'magnet', 
          icon: '🧲',
          title: 'XP MAGNET', 
          desc: 'EXP Pickup Range +25% (+1 unit)', 
          apply: () => { 
            gs.magnetRange += 1; 
            showStatChange('EXP Magnet Range +25% (Now: ' + gs.magnetRange + ' units)');
          } 
        },
        { 
          id: 'cooldown', 
          icon: '⏱️',
          title: 'COOLDOWN MASTER', 
          desc: 'All Weapon Cooldowns -2% (Level-100 Balanced)', 
          apply: () => { 
            weapons.gun.cooldown *= 0.98; // Reduced from 0.95 to 0.98 for level-100 balance
            weapons.sword.cooldown *= 0.98;
            weapons.aura.cooldown *= 0.98;
            weapons.meteor.cooldown *= 0.98;
            weapons.droneTurret.cooldown *= 0.98;
            weapons.doubleBarrel.cooldown *= 0.98;
            weapons.iceSpear.cooldown *= 0.98;
            weapons.fireRing.cooldown *= 0.98;
            showStatChange('All Weapon Cooldowns -2%');
          } 
        },
        { 
          id: 'dash_mastery', 
          icon: '💨',
          title: 'DASH MASTERY', 
          desc: 'Dash Cooldown -20%, Distance +30%', 
          apply: () => { 
            playerStats.dashCooldownReduction += 0.2;
            playerStats.dashDistanceBonus += 0.3;
            gs.dashCooldown *= 0.8;
            gs.dashDistance *= 1.3;
            gs.player.dashDuration *= 0.9; // Slightly faster dash
            showStatChange('Dash Improved! CD: -20%, Distance: +30%');
          } 
        },
        { 
          id: 'second_wind', 
          icon: '🛡️',
          title: 'SECOND WIND', 
          desc: 'Gain 30 Shield when HP drops below 30%', 
          apply: () => { 
            playerStats.hasSecondWind = true;
            showStatChange('Second Wind Unlocked!');
          } 
        },
        { 
          id: 'life_steal', 
          icon: '🩸',
          title: 'LIFE STEAL', 
          desc: 'Heal 3% of Damage Dealt (Stacks)', 
          apply: () => { 
            playerStats.lifeStealPercent += 0.03;
            showStatChange('Life Steal +3% (Total: ' + Math.round(playerStats.lifeStealPercent * 100) + '%)');
          } 
        },
        { 
          id: 'thorns', 
          icon: '🔱',
          title: 'THORNS', 
          desc: 'Reflect 15% Damage to Attackers (Stacks)', 
          apply: () => { 
            playerStats.thornsPercent += 0.15;
            showStatChange('Thorns +15% (Total: ' + Math.round(playerStats.thornsPercent * 100) + '%)');
          } 
        },
        { 
          id: 'berserker_rage', 
          icon: '😤',
          title: 'BERSERKER RAGE', 
          desc: 'Gain 25% Attack Speed when below 50% HP', 
          apply: () => { 
            playerStats.hasBerserkerRage = true;
            showStatChange('Berserker Rage Unlocked!');
          } 
        },
        { 
          id: 'treasure_hunter', 
          icon: '💰',
          title: 'TREASURE HUNTER', 
          desc: '20% Chance to Drop Extra Gold (Stacks)', 
          apply: () => { 
            playerStats.treasureHunterChance += 0.2;
            showStatChange('Treasure Hunter +20% (Total: ' + Math.round(playerStats.treasureHunterChance * 100) + '%)');
          } 
        },
        { 
          id: 'lucky_strikes', 
          icon: '✨',
          title: 'LUCKY STRIKES', 
          desc: 'Crits have 25% Chance to Strike Twice', 
          apply: () => { 
            playerStats.doubleCritChance += 0.25;
            showStatChange('Lucky Strikes +25% (Total: ' + Math.round(playerStats.doubleCritChance * 100) + '%)');
          } 
        },
        { 
          id: 'pierce', 
          icon: '🎯',
          title: 'PIERCING SHOTS', 
          desc: 'Bullets Hit +1 Additional Enemy (Stacks)', 
          apply: () => { 
            playerStats.pierceCount = (playerStats.pierceCount || 0) + 1;
            const totalHits = playerStats.pierceCount + 1;
            showStatChange('Piercing +1! (Total hits: ' + totalHits + ' gs.enemies)');
          } 
        }
      ];

      // --- SPECIAL LEVELS ---
      
      // Quest 8: Force weapon choice when quest8_newWeapon is active (grant first new weapon)
      if (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.currentQuest === 'quest8_newWeapon' &&
          ![5, 8, 15, 20].includes(playerStats.lvl)) {
        modal.querySelector('h2').innerText = 'NEW WEAPON!';
        modal.querySelector('h2').style.fontSize = '36px';
        const allWeaponChoicesQ8 = [
          { id: 'sword', title: 'SLASHY SLASH', desc: 'Slash gs.enemies in front', active: () => weapons.sword.active, apply: () => { weapons.sword.active = true; weapons.sword.level = 1; showStatChange('New Weapon: Sword'); window.progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'aura', title: 'ZAP ZONE', desc: 'Damage aura around you', active: () => weapons.aura.active, apply: () => { weapons.aura.active = true; weapons.aura.level = 1; showStatChange('New Weapon: Aura'); window.progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'meteor', title: 'SPACE ROCKS', desc: 'Call gs.meteors from sky', active: () => weapons.meteor.active, apply: () => { weapons.meteor.active = true; weapons.meteor.level = 1; showStatChange('New Weapon: Meteor'); window.progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'icespear', title: 'ICE SPEAR', desc: 'Freezing projectile that slows gs.enemies 40%', active: () => weapons.iceSpear.active, apply: () => { weapons.iceSpear.active = true; weapons.iceSpear.level = 1; showStatChange('New Weapon: Ice Spear'); window.progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'firering', title: 'FIRE RING', desc: 'Spinning fire orbs orbit around you', active: () => weapons.fireRing.active, apply: () => { weapons.fireRing.active = true; weapons.fireRing.level = 1; showStatChange('New Weapon: Fire Ring'); window.progressTutorialQuest('quest8_newWeapon', true); } }
        ];
        const availableQ8 = allWeaponChoicesQ8.filter(w => !w.active());
        choices = availableQ8.sort(() => 0.5 - Math.random()).slice(0, Math.min(3, availableQ8.length));
        if (choices.length < 3) {
          const fillers = commonUpgrades.sort(() => 0.5 - Math.random()).slice(0, 3 - choices.length);
          choices.push(...fillers);
        }
        choices.push(...commonUpgrades.sort(() => 0.5 - Math.random()).slice(0, 3));
      }
      // Levels 3, 4, 9, 17, 23: WEAPON UPGRADE LEVELS
      else if ([3, 4, 9, 17, 23].includes(playerStats.lvl)) {
        modal.querySelector('h2').innerText = 'WEAPON UPGRADE!';
        modal.querySelector('h2').style.fontSize = '36px';
        
        choices = [];
        
        // Phase 3: Weapon upgrades now go to level 5 (up from 4)
        // Offer weapon upgrades for active weapons
        if (weapons.gun.active && weapons.gun.level < 5) {
          const nextLevel = weapons.gun.level + 1;
          choices.push({ 
            id: 'gun_upgrade', 
            icon: '🔫',
            title: `GUN Level ${nextLevel}`, 
            desc: `Damage +10, Fire Rate +15%`, 
            apply: () => { 
              weapons.gun.level++;
              weapons.gun.damage += 10;
              weapons.gun.cooldown *= 0.85;
              showStatChange(`Gun Level ${weapons.gun.level}: +10 Dmg, +15% Fire Rate`);
            } 
          });
        }
        
        if (weapons.sword.active && weapons.sword.level < 5) {
          const nextLevel = weapons.sword.level + 1;
          choices.push({ 
            id: 'sword_upgrade', 
            icon: '⚔️',
            title: `SWORD Level ${nextLevel}`, 
            desc: `Damage +15, Range +0.5`, 
            apply: () => { 
              weapons.sword.level++;
              weapons.sword.damage += 15;
              weapons.sword.range += 0.5;
              showStatChange(`Sword Level ${weapons.sword.level}: +15 Dmg, +0.5 Range`);
            } 
          });
        }
        
        if (weapons.aura.active && weapons.aura.level < 5) {
          const nextLevel = weapons.aura.level + 1;
          const baseRange = 3; // Initial range
          const currentRange = weapons.aura.range;
          const nextRange = Math.min(5, baseRange * (1 + (nextLevel * 0.10))); // +10% per level, cap at 5
          const rangeIncrease = Math.round((nextRange - currentRange) * 10) / 10;
          
          choices.push({ 
            id: 'aura_upgrade', 
            icon: '🌀',
            title: `AURA Level ${nextLevel}`, 
            desc: `Damage +3, Range +${rangeIncrease.toFixed(1)}`, 
            apply: () => { 
              weapons.aura.level++;
              weapons.aura.damage += 3;
              weapons.aura.range = Math.min(5, baseRange * (1 + (weapons.aura.level * 0.10)));
              showStatChange(`Aura Level ${weapons.aura.level}: +3 Dmg, +${rangeIncrease.toFixed(1)} Range`);
            } 
          });
        }
        
        if (weapons.meteor.active && weapons.meteor.level < 5) {
          const nextLevel = weapons.meteor.level + 1;
          choices.push({ 
            id: 'meteor_upgrade', 
            icon: '☄️',
            title: `METEOR Level ${nextLevel}`, 
            desc: `Damage +20, Area +1`, 
            apply: () => { 
              weapons.meteor.level++;
              weapons.meteor.damage += 20;
              weapons.meteor.area += 1;
              showStatChange(`Meteor Level ${weapons.meteor.level}: +20 Dmg, +1 Area`);
            } 
          });
        }
        
        if (weapons.droneTurret.active && weapons.droneTurret.level < 5) {
          const nextLevel = weapons.droneTurret.level + 1;
          // Phase 3: Define levels where drones are added
          const DRONE_TURRET_SPAWN_LEVELS = [2, 4, 5];
          const addDrone = DRONE_TURRET_SPAWN_LEVELS.includes(nextLevel);
          choices.push({ 
            id: 'droneturret_upgrade', 
            title: `DRONE TURRET Level ${nextLevel}`, 
            desc: addDrone ? `Damage +8, Fire Rate +10%, +1 Drone` : `Damage +8, Fire Rate +10%`, 
            apply: () => { 
              weapons.droneTurret.level++;
              weapons.droneTurret.damage += 8;
              weapons.droneTurret.cooldown *= 0.9;
              if (addDrone) {
                // Create new drone first, then update count
                const drone = new DroneTurret(gs.player);
                // Position offset for multiple drones
                const droneIndex = gs.droneTurrets.length;
                const totalDrones = weapons.droneTurret.droneCount + 1; // Count after adding
                const angle = (droneIndex / totalDrones) * Math.PI * 2;
                drone.offset = new THREE.Vector3(
                  Math.cos(angle) * 2.5,
                  1.5,
                  Math.sin(angle) * 2.5
                );
                gs.droneTurrets.push(drone);
                weapons.droneTurret.droneCount++;
                startDroneHum(); // Start continuous drone sound
                showStatChange(`Drone Turret Level ${weapons.droneTurret.level}: +8 Dmg, +10% Fire Rate, +1 Drone!`);
              } else {
                showStatChange(`Drone Turret Level ${weapons.droneTurret.level}: +8 Dmg, +10% Fire Rate`);
              }
            } 
          });
        }
        
        if (weapons.doubleBarrel.active && weapons.doubleBarrel.level < 5) {
          const nextLevel = weapons.doubleBarrel.level + 1;
          choices.push({ 
            id: 'doublebarrel_upgrade', 
            icon: '🔫',
            title: `DOUBLE BARREL Level ${nextLevel}`, 
            desc: `Damage +12, Fire Rate +10%`, 
            apply: () => { 
              weapons.doubleBarrel.level++;
              weapons.doubleBarrel.damage += 12;
              weapons.doubleBarrel.cooldown *= 0.9;
              showStatChange(`Double Barrel Level ${weapons.doubleBarrel.level}: +12 Dmg, +10% Fire Rate`);
            } 
          });
        }
        
        if (weapons.iceSpear.active && weapons.iceSpear.level < 5) {
          const nextLevel = weapons.iceSpear.level + 1;
          choices.push({ 
            id: 'icespear_upgrade', 
            icon: '❄️',
            title: `ICE SPEAR Level ${nextLevel}`, 
            desc: `Damage +10, Slow +10%, Duration +0.5s`, 
            apply: () => { 
              weapons.iceSpear.level++;
              weapons.iceSpear.damage += 10;
              weapons.iceSpear.slowPercent += 0.1;
              weapons.iceSpear.slowDuration += 500;
              showStatChange(`Ice Spear Level ${weapons.iceSpear.level}: +10 Dmg, +10% Slow, +0.5s Duration`);
            } 
          });
        }
        
        if (weapons.fireRing.active && weapons.fireRing.level < 5) {
          const nextLevel = weapons.fireRing.level + 1;
          choices.push({ 
            id: 'firering_upgrade', 
            icon: '🔥',
            title: `FIRE RING Level ${nextLevel}`, 
            desc: `Damage +5, +1 Orb, Range +0.5`, 
            apply: () => { 
              weapons.fireRing.level++;
              weapons.fireRing.damage += 5;
              weapons.fireRing.orbs += 1;
              weapons.fireRing.range += 0.5;
              showStatChange(`Fire Ring Level ${weapons.fireRing.level}: +5 Dmg, +1 Orb, +0.5 Range`);
            } 
          });
        }
        
        // Phase 3: Add more stat upgrades for diversity with weighted selection
        // ATK speed and damage have 3x higher probability (weighted random selection)
        const selectedUpgrades = [];
        for (let i = 0; i < 3; i++) {
          // Calculate weighted random selection
          const weights = commonUpgrades.map(u => 
            (u.id === 'str' || u.id === 'aspd') ? 3 : 1
          );
          const totalWeight = weights.reduce((sum, w) => sum + w, 0);
          let random = Math.random() * totalWeight;
          
          let selectedIndex = 0;
          for (let j = 0; j < weights.length; j++) {
            random -= weights[j];
            if (random <= 0) {
              selectedIndex = j;
              break;
            }
          }
          
          selectedUpgrades.push(commonUpgrades[selectedIndex]);
        }
        choices.push(...selectedUpgrades);
        
        // ALWAYS SHOW 6 CHOICES: Shuffle and ensure exactly 6 choices in 2×3 grid
        choices = choices.sort(() => 0.5 - Math.random()).slice(0, 6);
        // If we have less than 6, fill with common upgrades (use Set for O(n) lookup)
        if (choices.length < 6) {
          const existingIds = new Set(choices.map(c => c.id));
          const additionalUpgrades = commonUpgrades.filter(u => !existingIds.has(u.id));
          const needed = 6 - choices.length;
          choices.push(...additionalUpgrades.slice(0, needed));
        }
      }
      // WEAPON UNLOCK: Level 5, 8, 15, 20 for new weapon unlocks (4 weapons total per run)
      else if ([5, 8, 15, 20].includes(playerStats.lvl)) {
        modal.querySelector('h2').innerText = 'NEW WEAPON!';
        modal.querySelector('h2').style.fontSize = '36px';
        // Build list of all possible new weapons, filtering already-active ones
        const allWeaponChoices = [
          { id: 'sword', icon: '⚔️', title: 'SLASHY SLASH', desc: 'Slash gs.enemies in front', active: () => weapons.sword.active, apply: () => { weapons.sword.active = true; weapons.sword.level = 1; showStatChange('New Weapon: Sword'); if (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.currentQuest === 'quest8_newWeapon') window.progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'aura', icon: '🌀', title: 'ZAP ZONE', desc: 'Damage aura around you', active: () => weapons.aura.active, apply: () => { weapons.aura.active = true; weapons.aura.level = 1; showStatChange('New Weapon: Aura'); if (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.currentQuest === 'quest8_newWeapon') window.progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'meteor', icon: '☄️', title: 'SPACE ROCKS', desc: 'Call gs.meteors from sky', active: () => weapons.meteor.active, apply: () => { weapons.meteor.active = true; weapons.meteor.level = 1; showStatChange('New Weapon: Meteor'); if (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.currentQuest === 'quest8_newWeapon') window.progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'droneturret', icon: '🤖', title: 'DRONE TURRET', desc: 'Automated drone that shoots gs.enemies', active: () => weapons.droneTurret.active, apply: () => { weapons.droneTurret.active = true; weapons.droneTurret.level = 1; const drone = new DroneTurret(gs.player); gs.droneTurrets.push(drone); startDroneHum(); showStatChange('New Weapon: Drone Turret'); if (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.currentQuest === 'quest8_newWeapon') window.progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'doublebarrel', icon: '🔫', title: 'DOUBLE BARREL', desc: 'Powerful shotgun spread', active: () => weapons.doubleBarrel.active, apply: () => { weapons.doubleBarrel.active = true; weapons.doubleBarrel.level = 1; showStatChange('New Weapon: Double Barrel'); if (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.currentQuest === 'quest8_newWeapon') window.progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'icespear', icon: '❄️', title: 'ICE SPEAR', desc: 'Freezing projectile that slows gs.enemies 40%', active: () => weapons.iceSpear.active, apply: () => { weapons.iceSpear.active = true; weapons.iceSpear.level = 1; showStatChange('New Weapon: Ice Spear'); if (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.currentQuest === 'quest8_newWeapon') window.progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'firering', icon: '🔥', title: 'FIRE RING', desc: 'Spinning fire orbs orbit around you', active: () => weapons.fireRing.active, apply: () => { weapons.fireRing.active = true; weapons.fireRing.level = 1; showStatChange('New Weapon: Fire Ring'); if (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.currentQuest === 'quest8_newWeapon') window.progressTutorialQuest('quest8_newWeapon', true); } }
        ];
        // Only offer weapons not yet active, shuffle and pick up to 3
        const available = allWeaponChoices.filter(w => !w.active());
        const shuffled = available.sort(() => 0.5 - Math.random());
        choices = shuffled.slice(0, Math.min(3, shuffled.length));
        // Fill with common upgrades if < 3 weapon choices available
        if (choices.length < 3) {
          const fillers = commonUpgrades.sort(() => 0.5 - Math.random()).slice(0, 3 - choices.length);
          choices.push(...fillers);
        }
        // Add 3 common upgrades
        choices.push(...commonUpgrades.sort(() => 0.5 - Math.random()).slice(0, 3));
      }
      // Level 10: CLASS SELECTION - ALWAYS SHOW 6 CHOICES
      else if (playerStats.lvl === 10) {
        modal.querySelector('h2').innerText = 'CHOOSE YOUR CLASS';
        modal.querySelector('h2').style.fontSize = '42px';
        
        choices = [
          { 
            id: 'class_tank', 
            title: 'TANK', 
            desc: 'Survivability: +50 Max HP, +2 HP/sec Regen, +20% Armor, -15% Speed', 
            apply: () => { 
              playerStats.maxHp+=50; 
              playerStats.hp+=50; 
              playerStats.hpRegen+=2; 
              playerStats.armor+=20;
              playerStats.walkSpeed *= 0.85;
              showStatChange('Class: TANK (+50 HP, +2 Regen, +20% Armor)');
            } 
          },
          { 
            id: 'class_berserker', 
            title: 'BERSERKER', 
            desc: 'Str+30%, Crit+10%, Attack Speed+20%, Armor-10%', 
            apply: () => { 
              playerStats.strength+=0.3; 
              playerStats.critChance+=0.1; 
              playerStats.atkSpeed+=0.2;
              weapons.gun.cooldown *= 0.8;
              playerStats.armor = Math.max(0, playerStats.armor-10);
              showStatChange('Class: BERSERKER');
            } 
          },
          { 
            id: 'class_rogue', 
            title: 'ROGUE', 
            desc: 'Speed+25%, Crit+15%, Crit Dmg+30%, HP-20', 
            apply: () => { 
              playerStats.walkSpeed *= 1.25; 
              playerStats.critChance+=0.15; 
              playerStats.critDmg+=0.3;
              playerStats.maxHp = Math.max(50, playerStats.maxHp-20);
              playerStats.hp = Math.min(playerStats.hp, playerStats.maxHp);
              showStatChange('Class: ROGUE');
            } 
          },
          { 
            id: 'class_mage', 
            title: 'MAGE', 
            desc: 'Aura Range+2, Meteor CD-1s, Regen+3, Move Speed+10%', 
            apply: () => { 
              weapons.aura.range+=2; 
              weapons.meteor.cooldown = Math.max(500, weapons.meteor.cooldown-1000);
              playerStats.hpRegen+=3;
              playerStats.walkSpeed *= 1.1;
              showStatChange('Class: MAGE');
            } 
          }
        ];
        // Fill with common upgrades to reach 6 choices
        const classSelectionFillers = commonUpgrades.sort(() => 0.5 - Math.random()).slice(0, 2);
        choices.push(...classSelectionFillers);
      } 
      // Level 12, 18, 25: PERK UNLOCKS - ALWAYS SHOW 6 CHOICES
      else if ([12, 18, 25].includes(playerStats.lvl)) {
        modal.querySelector('h2').innerText = 'PERK UNLOCK!';
        modal.querySelector('h2').style.fontSize = '40px';
        
        // Create perk pool based on level
        const perkChoices = [
          { 
            id: 'perk_vampire', 
            icon: '🧛',
            title: 'VAMPIRE', 
            desc: `Life Steal: Heal 5% of damage dealt (Current: ${Math.round(playerStats.perks.vampire * 5)}%)`, 
            apply: () => { 
              playerStats.perks.vampire++;
              playerStats.lifeStealPercent += 0.05;
              showStatChange(`Vampire Level ${playerStats.perks.vampire}! (5% of damage heals you)`);
            } 
          },
          { 
            id: 'perk_juggernaut', 
            icon: '🛡️',
            title: 'JUGGERNAUT', 
            desc: `Damage Reduction +8% (Current: ${Math.round(playerStats.perks.juggernaut * 8)}%)`, 
            apply: () => { 
              playerStats.perks.juggernaut++;
              playerStats.armor = Math.min(80, playerStats.armor + 8);
              showStatChange(`Juggernaut Perk Level ${playerStats.perks.juggernaut}! (+8% Armor)`);
            } 
          },
          { 
            id: 'perk_swift', 
            icon: '⚡',
            title: 'SWIFT', 
            desc: `Movement Speed +15% (Current: Level ${playerStats.perks.swift})`, 
            apply: () => { 
              playerStats.perks.swift++;
              playerStats.walkSpeed *= 1.15;
              showStatChange(`Swift Perk Level ${playerStats.perks.swift}! (+15% Move Speed)`);
            } 
          },
          { 
            id: 'perk_lucky', 
            icon: '🍀',
            title: 'LUCKY', 
            desc: `Critical Chance +8% (Current: ${Math.round(playerStats.perks.lucky * 8)}%)`, 
            apply: () => { 
              playerStats.perks.lucky++;
              playerStats.critChance += 0.08;
              showStatChange(`Lucky Perk Level ${playerStats.perks.lucky}! (+8% Crit Chance)`);
            } 
          },
          { 
            id: 'perk_berserker', 
            icon: '💢',
            title: 'BERSERKER SOUL', 
            desc: `Low HP Bonus +10% Damage (Current: Level ${playerStats.perks.berserker})`, 
            apply: () => { 
              playerStats.perks.berserker++;
              showStatChange(`Berserker Soul Level ${playerStats.perks.berserker}! (Bonus when HP < 50%)`);
            } 
          }
        ];
        
        // ALWAYS SHOW 6 CHOICES: Select perks and fill with common upgrades
        choices = perkChoices.sort(() => 0.5 - Math.random()).slice(0, 3);
        const perkUnlockFillers = commonUpgrades.sort(() => 0.5 - Math.random()).slice(0, 3);
        choices.push(...perkUnlockFillers);
      }
      else {
        // ALWAYS SHOW 6 CHOICES: Show 6 random choices for 2×3 grid
        // Weighted selection: ATK speed and ATK power have higher spawn weight
        
        // Create weighted pool with Fisher-Yates shuffle for proper randomization
        const weightedPool = [];
        
        // Add each upgrade with appropriate weight
        commonUpgrades.forEach(upgrade => {
          if (upgrade.id === 'str' || upgrade.id === 'aspd') {
            // ATK power and ATK speed: 3x weight
            weightedPool.push({ upgrade, weight: 3 });
          } else {
            // Other upgrades: normal weight
            weightedPool.push({ upgrade, weight: 1 });
          }
        });
        
        // Expand weighted pool based on weights
        const expandedPool = [];
        weightedPool.forEach(item => {
          for (let i = 0; i < item.weight; i++) {
            expandedPool.push(item.upgrade);
          }
        });
        
        // Fisher-Yates shuffle for proper randomization
        for (let i = expandedPool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [expandedPool[i], expandedPool[j]] = [expandedPool[j], expandedPool[i]];
        }
        
        // Pick 6 unique upgrades
        const unique = [];
        const seen = new Set();
        
        for (const upgrade of expandedPool) {
          if (!seen.has(upgrade.id)) {
            unique.push(upgrade);
            seen.add(upgrade.id);
          }
          if (unique.length >= 6) break;
        }
        
        choices = unique;
      }

      // SAFETY FALLBACK: ensure choices is always populated (never stuck with empty modal)
      if (!choices || choices.length === 0) {
        const pool = [...commonUpgrades];
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        choices = pool.slice(0, 6);
      }
      // Ensure game is paused while upgrade modal is open
      setGamePaused(true);

      choices.forEach((u, index) => {
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        
        // Add appropriate styling classes based on upgrade type
        if (u.id) {
          // Class upgrades (epic - orange)
          if (u.id.startsWith('class_')) {
            card.className += ' class rarity-epic';
          }
          // Perk upgrades (epic - orange)
          else if (u.id.startsWith('perk_')) {
            card.className += ' perk rarity-epic';
          }
          // Weapon upgrades (rare - blue)
          else if (u.id.includes('gun_') || u.id.includes('sword_') || u.id.includes('aura_') || 
                   u.id.includes('meteor_') || u.id.includes('doublebarrel_') ||
                   u.id.includes('droneturret_') || u.id.includes('icespear_') || u.id.includes('firering_')) {
            card.className += ' weapon rarity-rare';
          }
          else {
            // Default common upgrades get green rarity
            card.className += ' rarity-common';
          }
          
          // Special powerful upgrades get legendary (red) treatment
          if (u.id.includes('dash_mastery') || u.id.includes('second_wind') || 
              u.id.includes('berserker_rage') || u.id.includes('lucky_strikes')) {
            card.classList.remove('rarity-common', 'rarity-rare', 'rarity-epic', 'rarity-legendary', 'rarity-mythical');
            card.classList.add('max-upgrade', 'rarity-legendary');
          }
        }
        
        // Phase 1: Text-only upgrade cards (removed icons as requested)
        card.innerHTML = `<div class="upgrade-title">${u.title}</div><div class="upgrade-desc">${u.desc}</div>`;
        
        // Add dramatic entrance animation - alternate left/right
        card.style.opacity = '0';
        if (index % 2 === 0) {
          card.style.animation = `swooshInLeft 0.6s ease-out ${index * 0.15}s forwards`;
        } else {
          card.style.animation = `swooshInRight 0.6s ease-out ${index * 0.15}s forwards`;
        }
        
        card.onclick = () => {
          const allCards = list.querySelectorAll('.upgrade-card');
          
          // Two-press system: first press selects/highlights, second press confirms
          if (card.dataset.selected !== '1') {
            // First press: highlight this card, deselect others
            allCards.forEach(c => {
              c.dataset.selected = '';
              c.style.opacity = '0.45';
              c.style.transform = 'scale(1)';
              c.style.outline = 'none';
              c.style.boxShadow = '';
              c.classList.remove('lightning-selected');
            });
            card.dataset.selected = '1';
            card.style.opacity = '1';
            card.style.transform = 'scale(1.06)';
            // Lightning edge glow effect on first click
            card.classList.add('lightning-selected');
            setTimeout(() => card.classList.remove('lightning-selected'), 500);
            // Color the highlight based on upgrade rarity/type
            let glowColor = '#00FF88'; // green default
            if (card.classList.contains('rarity-rare')) glowColor = '#4499FF';
            else if (card.classList.contains('rarity-epic')) glowColor = '#FF8800';
            else if (card.classList.contains('rarity-legendary')) glowColor = '#FF2222';
            card.style.outline = `3px solid ${glowColor}`;
            card.style.boxShadow = `0 0 18px ${glowColor}, 0 0 6px ${glowColor}`;
            // Update prompt text
            const h2 = modal.querySelector('h2');
            if (h2) { h2.innerText = 'CONFIRM?'; h2.style.color = '#FFD700'; }
            return; // Wait for second press
          }
          
          // Second press: apply upgrade
          allCards.forEach(c => {
            c.style.pointerEvents = 'none';
            c.style.opacity = '0.5';
          });
          
          playSound('upgrade'); // "Wooooaaa" sound after picking upgrade
          
          // Phase 4: Wrap in try-catch to ensure modal always closes
          try {
            u.apply();
          } catch (error) {
            console.error('Error applying upgrade:', error);
          }
          
          // Always close modal and resume game
          modal.style.display = 'none';
          modal.querySelector('h2').innerText = 'LEVEL UP!';
          modal.querySelector('h2').style.fontSize = '32px';
          modal.querySelector('h2').style.color = '';
          // Hide skip button and clear its timeout
          const skipBtn = document.getElementById('levelup-skip-btn');
          if (skipBtn) skipBtn.style.display = 'none';
          clearTimeout(window.levelupSkipTimeoutId);
          
          // Restore gs.camera position and projection after level-up
          if (gs.savedCameraPosition) {
            gs.camera.position.set(gs.savedCameraPosition.x, gs.savedCameraPosition.y, gs.savedCameraPosition.z);
            gs.camera.left = gs.savedCameraPosition.left;
            gs.camera.right = gs.savedCameraPosition.right;
            gs.camera.top = gs.savedCameraPosition.top;
            gs.camera.bottom = gs.savedCameraPosition.bottom;
            gs.camera.updateProjectionMatrix();
            gs.savedCameraPosition = null; // Clear after restoration
          }
          
          setGamePaused(false);
          checkPendingLevelUp();
          
          // Resume combo timer after level-up
          if (gs.comboState.pausedAt) {
            const pauseDuration = Date.now() - gs.comboState.pausedAt;
            gs.comboState.lastKillTime += pauseDuration;
            gs.comboState.pausedAt = null;
          }
          
          updateHUD();
          
          // Re-enable pointer events after closing (for next level up)
          setTimeout(() => {
            allCards.forEach(c => {
              c.style.pointerEvents = 'auto';
              c.style.opacity = '1';
              c.dataset.selected = '';
              c.style.outline = 'none';
              c.style.boxShadow = '';
              c.style.transform = 'scale(1)';
            });
          }, 500);
        };
        list.appendChild(card);
      });

      modal.style.display = 'flex';
      
      // Show skip button after 5 seconds as safety valve if gs.player can't select an upgrade
      const skipBtn = document.getElementById('levelup-skip-btn');
      if (skipBtn) {
        skipBtn.style.display = 'none';
        clearTimeout(window.levelupSkipTimeoutId);
        window.levelupSkipTimeoutId = setTimeout(() => {
          if (modal.style.display === 'flex') skipBtn.style.display = 'inline-block';
        }, 5000);
      }
    }

    // Waterdrop dimensions constants (match SVG viewBox - raised/rounded shape)
    const WATERDROP_SVG_HEIGHT = 120; // Total SVG viewBox height
    const WATERDROP_FILL_TOP = 18;    // Top y-coordinate of fillable area (raised from 8 for compact shape)
    const WATERDROP_FILL_HEIGHT = 92; // Maximum fill height in SVG units (from y=18 to y=110)
    
    function updateHUD() {
      const hpPct = (playerStats.hp / playerStats.maxHp) * 100;
      document.getElementById('hp-fill').style.width = `${Math.max(0, hpPct)}%`;
      document.getElementById('hp-text').innerText = `HP: ${Math.max(0, Math.ceil(playerStats.hp))}/${playerStats.maxHp}`;
      
      // FRESH: Low HP warning vignette when HP < 30%
      const lowHpVignette = document.getElementById('low-hp-vignette');
      if (lowHpVignette) {
        if (hpPct < 30 && hpPct > 0) {
          // Show vignette, opacity scales with how low HP is (more intense as HP drops)
          const vignetteOpacity = (30 - hpPct) / 30; // 0 at 30%, 1 at 0%
          lowHpVignette.style.opacity = vignetteOpacity;
        } else {
          lowHpVignette.style.opacity = '0';
        }
      }
      
      const expPct = (playerStats.exp / playerStats.expReq) * 100;
      // Update old EXP bar (hidden but keep for compatibility)
      document.getElementById('exp-fill').style.width = `${Math.min(100, expPct)}%`;
      document.getElementById('exp-text').innerText = `EXP: ${Math.min(100, Math.ceil(expPct))}%`;
      
      // Update bottom bars (EXP bar and waterdrop level display)
      document.getElementById('bottom-exp-fill').style.width = `${Math.min(100, expPct)}%`;
      document.getElementById('bottom-exp-text').innerText = `EXP: ${Math.min(100, Math.ceil(expPct))}%`;
      
      // Update waterdrop level display
      document.getElementById('waterdrop-level-text').textContent = playerStats.lvl;
      
      // Update waterdrop EXP fill (fills from bottom to top like a thermometer)
      const waterdropFill = document.getElementById('waterdrop-exp-fill');
      const fillHeight = WATERDROP_FILL_HEIGHT * (expPct / 100);
      const fillY = WATERDROP_FILL_TOP + WATERDROP_FILL_HEIGHT - fillHeight;
      waterdropFill.setAttribute('y', fillY);
      waterdropFill.setAttribute('height', fillHeight);
      
      // Update minimap
      updateMinimap();
      
      // REGION DISPLAY: Update current region based on gs.player position
      updateRegionDisplay();
    }
    
    // Region display update function
    function updateRegionDisplay() {
      if (!gs.player || !gs.player.mesh) return;
      
      const regionNameEl = document.getElementById('region-name');
      if (!regionNameEl) return;
      
      const px = gs.player.mesh.position.x;
      const pz = gs.player.mesh.position.z;
      
      // Define regions based on map areas
      let region = 'Forest'; // Default
      
      if (Math.abs(px) < 15 && Math.abs(pz) < 15) {
        region = 'Central Plaza';
      } else if (px > 50 && pz > 50) {
        region = 'Stonehenge';
      } else if (px > 35 && pz > 35 && px < 50 && pz < 50) {
        region = 'Windmill';
      } else if (px < -30 && pz < -30) {
        region = 'Dark Woods';
      } else if (Math.abs(px - 30) < 15 && Math.abs(pz) < 15) {
        region = 'Eastern Forest';
      } else if (Math.abs(px + 30) < 15 && Math.abs(pz) < 15) {
        region = 'Western Forest';
      } else if (Math.abs(px) < 15 && pz > 20) {
        region = 'Northern Plains';
      } else if (Math.abs(px) < 15 && pz < -20) {
        region = 'Southern Woods';
      }
      
      regionNameEl.textContent = region;
    }
    
    // Minimap update function (with throttling for performance)
    const MINIMAP_UPDATE_INTERVAL = 200; // Update every 200ms instead of every frame
    
    function updateMinimap() {
      if (!gs.player || !gs.player.mesh) return;
      
      const minimap = document.getElementById('minimap');
      if (!minimap) return;
      
      // Throttle updates to every 200ms
      const now = Date.now();
      if (now - gs.minimapLastUpdate < MINIMAP_UPDATE_INTERVAL) return;
      gs.minimapLastUpdate = now;
      
      // Clear previous dots
      minimap.innerHTML = '';
      
      // Minimap scale - shows area of 100x100 units
      const mapSize = 100;
      const minimapSize = 120; // pixels
      
      // Add gs.player dot (center)
      const playerDot = document.createElement('div');
      playerDot.className = 'minimap-dot minimap-gs.player';
      playerDot.style.left = '50%';
      playerDot.style.top = '50%';
      minimap.appendChild(playerDot);
      
      // Add enemy dots (up to 20 closest gs.enemies) - optimized
      if (gs.enemies && gs.enemies.length > 0) {
        const sortedEnemies = gs.enemies
          .filter(e => e && !e.isDead)
          .map(e => ({
            enemy: e,
            dist: gs.player.mesh.position.distanceTo(e.mesh.position)
          }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 20);
        
        sortedEnemies.forEach(({enemy}) => {
          const dx = enemy.mesh.position.x - gs.player.mesh.position.x;
          const dz = enemy.mesh.position.z - gs.player.mesh.position.z;
          
          // Only show gs.enemies within map range
          if (Math.abs(dx) < mapSize / 2 && Math.abs(dz) < mapSize / 2) {
            const mapX = 50 + (dx / mapSize) * 100; // percentage
            const mapZ = 50 + (dz / mapSize) * 100; // percentage
            
            const enemyDot = document.createElement('div');
            enemyDot.className = 'minimap-dot minimap-enemy';
            enemyDot.style.left = `${mapX}%`;
            enemyDot.style.top = `${mapZ}%`;
            minimap.appendChild(enemyDot);
          }
        });
      }
      
      // Add landmark dots (windmill, montana, eiffel, stonehenge if they exist)
      const landmarks = [
        { pos: { x: 60, z: 40 }, name: 'windmill' },
        { pos: { x: -50, z: -50 }, name: 'montana' },
        { pos: { x: 70, z: -60 }, name: 'eiffel' },
        { pos: { x: -60, z: 60 }, name: 'stonehenge' }
      ];
      
      landmarks.forEach(landmark => {
        const dx = landmark.pos.x - gs.player.mesh.position.x;
        const dz = landmark.pos.z - gs.player.mesh.position.z;
        
        if (Math.abs(dx) < mapSize / 2 && Math.abs(dz) < mapSize / 2) {
          const mapX = 50 + (dx / mapSize) * 100;
          const mapZ = 50 + (dz / mapSize) * 100;
          
          const landmarkDot = document.createElement('div');
          // Add quest-ready "?" indicator for windmill when quest available
          const isWindmillAvailable = landmark.name === 'windmill' && !gs.windmillQuest.active && !gs.windmillQuest.rewardGiven;
          landmarkDot.className = 'minimap-dot minimap-landmark' + (isWindmillAvailable ? ' quest-ready' : '');
          landmarkDot.style.left = `${mapX}%`;
          landmarkDot.style.top = `${mapZ}%`;
          minimap.appendChild(landmarkDot);
        }
      });

      // Show active quest location as yellow "?" on minimap
      const QUEST_LOCATIONS = {
        quest3_stonehengeGear: { x: -60, z: 60 },
        quest3_findStonehenge: { x: -60, z: 60 }
      };
      const currentQuest = getCurrentQuest ? getCurrentQuest() : null;
      if (currentQuest && QUEST_LOCATIONS[currentQuest.id]) {
        const qPos = QUEST_LOCATIONS[currentQuest.id];
        const qdx = qPos.x - gs.player.mesh.position.x;
        const qdz = qPos.z - gs.player.mesh.position.z;
        if (Math.abs(qdx) < mapSize / 2 && Math.abs(qdz) < mapSize / 2) {
          const qmapX = 50 + (qdx / mapSize) * 100;
          const qmapZ = 50 + (qdz / mapSize) * 100;
          const questDot = document.createElement('div');
          questDot.className = 'minimap-dot minimap-quest-location';
          questDot.style.left = `${qmapX}%`;
          questDot.style.top = `${qmapZ}%`;
          minimap.appendChild(questDot);
        }
      }
    }
    
    // Stats Bar removed - Users access stats via STATS button modal
    
    // Combo System - Red/Black Theme
    const COMBO_ANIMATION_DURATION = 500; // milliseconds - matches CSS animation duration
    const GODLIKE_COMBO_THRESHOLD = 20; // Combo count where GODLIKE is achieved (increased from 14 to 20 for harder difficulty)
    const MIN_COMBO_FOR_CHEST_ON_LOSS = 10; // Minimum combo to spawn chest when lost
    const CHEST_SPAWN_MILESTONES = [7, 9, 10, 12, 15, 20]; // Combo counts that spawn gs.chests (updated to include 15 and 20)
    
    // Helper function to determine chest tier based on combo count
    function getChestTierForCombo(comboCount) {
      if (comboCount >= 20) return 'mythical';
      if (comboCount >= 15) return 'epic';
      if (comboCount >= 12) return 'rare';
      if (comboCount >= 9) return 'uncommon';
      if (comboCount >= 7) return 'common';
      return null;
    }
    
    
    function updateComboCounter(newKill = false) {
      const currentTime = Date.now();
      
      if (newKill) {
        // Check if within combo window
        if (currentTime - gs.comboState.lastKillTime <= gs.comboState.comboWindow) {
          gs.comboState.count++;
        } else {
          gs.comboState.count = 1; // Reset to 1 for first kill
          gs.comboState.shownMilestones = []; // Reset shown milestones when combo breaks
        }
        gs.comboState.lastKillTime = currentTime;
        
        // Show combo if 5+ kills (updated to start at 5)
        if (gs.comboState.count >= 5) {
          showCombo();
        }
        
        // Spawn chest on specific combo milestones:
        // 7 kills: Common (white), 9 kills: Uncommon (green), 10 kills: Rare (blue)
        // 12 kills: Rare (blue), 15 kills: Epic (purple), 20 (GODLIKE): Mythical (special)
        const isMilestone = CHEST_SPAWN_MILESTONES.includes(gs.comboState.count);
        
        if (isMilestone && !gs.comboState.topCombos.includes(gs.comboState.count)) {
          const chestTier = getChestTierForCombo(gs.comboState.count);
          if (chestTier) {
            gs.comboState.topCombos.push(gs.comboState.count);
            const chestAngle = Math.random() * Math.PI * 2;
            const chestDist = 10 + Math.random() * 5;
            const cx = gs.player.mesh.position.x + Math.cos(chestAngle) * chestDist;
            const cz = gs.player.mesh.position.z + Math.sin(chestAngle) * chestDist;
            spawnChest(cx, cz, chestTier);
            showStatChange(`${chestTier.toUpperCase()} Chest Spawned!`);
          }
        }
        
        // Clear existing fade timer
        if (gs.comboState.fadeTimer) {
          clearTimeout(gs.comboState.fadeTimer);
        }
        
        // Set new fade timer - persist combo text until lost
        gs.comboState.fadeTimer = setTimeout(() => {
          hideCombo();
        }, gs.comboState.comboWindow);
        
        // Update combo timer display
        updateComboTimer();
      }
    }
    
    // Update the combo timer display in the status bar
    function updateComboTimer() {
      const comboTimerEl = document.getElementById('combo-timer');
      
      // Clear existing interval if any
      if (gs.comboState.timerInterval) {
        clearInterval(gs.comboState.timerInterval);
        gs.comboState.timerInterval = null;
      }
      
      if (gs.comboState.count >= 5) {
        comboTimerEl.style.display = 'block';
        
        // Start new interval to update timer display
        gs.comboState.timerInterval = setInterval(() => {
          const currentTime = Date.now();
          const timeElapsed = currentTime - gs.comboState.lastKillTime;
          const timeRemaining = Math.max(0, gs.comboState.comboWindow - timeElapsed);
          const secondsRemaining = (timeRemaining / 1000).toFixed(1);
          
          comboTimerEl.innerText = `Combo Timer: ${secondsRemaining}s`;
          
          // Stop timer when combo expires
          if (timeRemaining <= 0) {
            if (gs.comboState.timerInterval) {
              clearInterval(gs.comboState.timerInterval);
              gs.comboState.timerInterval = null;
            }
            comboTimerEl.style.display = 'none';
          }
        }, 200); // Update every 200ms for smooth countdown while minimizing CPU usage
      } else {
        comboTimerEl.style.display = 'none';
      }
    }
    
    function showCombo() {
      const comboEl = document.getElementById('combo-counter');
      const comboText = document.getElementById('combo-text');
      const comboMultiplier = document.getElementById('combo-multiplier');
      
      // Updated combo progression: x5=Multikill, x6=Rare, x7=Epic, x8=Legendary, x9=Mythical, 
      // x10=Amazing, x11=Unbelievable, x12=Fantastic, x13-19=Higher combos, x20=GODLIKE (configurable), x21+=GODLIKE x2, x3...
      let message = '';
      let comboLevel = 'normal'; // for styling classes
      let isMilestone = false;
      
      // Define milestones dynamically based on GODLIKE threshold
      // Include all combo values from 5 up to GODLIKE threshold
      const milestones = Array.from({length: GODLIKE_COMBO_THRESHOLD - 4}, (_, i) => i + 5);
      // Check if this is a new milestone that hasn't been shown yet
      if (milestones.includes(gs.comboState.count) && !gs.comboState.shownMilestones.includes(gs.comboState.count)) {
        isMilestone = true;
        gs.comboState.shownMilestones.push(gs.comboState.count);
      }
      
      if (gs.comboState.count >= GODLIKE_COMBO_THRESHOLD + 1) {
        // Fun random names after GODLIKE (using pre-defined constant array)
        const godlikeMultiplier = gs.comboState.count - GODLIKE_COMBO_THRESHOLD;
        
        // Rotate through fun names, wrap around
        const nameIndex = (godlikeMultiplier - 1) % FUN_COMBO_NAMES.length;
        const funName = FUN_COMBO_NAMES[nameIndex];
        
        message = isMilestone ? funName.toUpperCase() : `${gs.comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (gs.comboState.count === GODLIKE_COMBO_THRESHOLD) {
        message = isMilestone ? 'GODLIKE' : `${gs.comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (gs.comboState.count === 19) {
        message = isMilestone ? 'Almost Godlike' : `${gs.comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (gs.comboState.count === 18) {
        message = isMilestone ? 'Unstoppable' : `${gs.comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (gs.comboState.count === 17) {
        message = isMilestone ? 'Dominating' : `${gs.comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (gs.comboState.count === 16) {
        message = isMilestone ? 'Rampage' : `${gs.comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (gs.comboState.count === 15) {
        message = isMilestone ? 'Monster Combo' : `${gs.comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (gs.comboState.count === 14) {
        message = isMilestone ? 'Insane Combo' : `${gs.comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (gs.comboState.count === 13) {
        message = isMilestone ? 'Almost Max Combo' : `${gs.comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (gs.comboState.count === 12) {
        message = isMilestone ? 'Fantastic Combo' : `${gs.comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (gs.comboState.count === 11) {
        message = isMilestone ? 'Unbelievable Combo' : `${gs.comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (gs.comboState.count === 10) {
        message = isMilestone ? 'Amazing Combo' : `${gs.comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (gs.comboState.count === 9) {
        message = isMilestone ? 'Mythical Combo' : `${gs.comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (gs.comboState.count === 8) {
        message = isMilestone ? 'Legendary Combo' : `${gs.comboState.count}x COMBO!`;
        comboLevel = 'high';
      } else if (gs.comboState.count === 7) {
        message = isMilestone ? 'Epic Combo' : `${gs.comboState.count}x COMBO!`;
        comboLevel = 'high';
      } else if (gs.comboState.count === 6) {
        message = isMilestone ? 'Rare Combo' : `${gs.comboState.count}x COMBO!`;
        comboLevel = 'high';
      } else if (gs.comboState.count === 5) {
        message = isMilestone ? 'Multikill' : `${gs.comboState.count}x COMBO!`;  // First combo message at 5 kills
        comboLevel = 'high';
      } else {
        message = gs.comboState.count + 'x COMBO!';
      }
      
      comboText.innerText = message;
      comboMultiplier.innerText = isMilestone ? '' : `x${gs.comboState.count}`; // Only show multiplier when not showing milestone text
      
      // Progressive scaling: Start small at 5, gradually grow bigger to GODLIKE at 20
      // Yellow/White to Dark Red gradient with intensifying glow and size
      let textColor = '#FFFF00'; // Start with Yellow
      let glowIntensity = 20;
      let fontSize = 22; // Base font size (smaller, reduced from 38)
      let lightningCount = 0; // Number of lightning effects (keep minimal)
      
      if (gs.comboState.count >= GODLIKE_COMBO_THRESHOLD + 1) {
        // GODLIKE x2, x3... - Red/Black with max glow
        textColor = '#8B0000'; // Dark red
        glowIntensity = 70; // Reduced from 90
        fontSize = 48; // Reduced from 78 to fit smaller combo text
        lightningCount = 4; // Reduced from 6
      } else if (gs.comboState.count === GODLIKE_COMBO_THRESHOLD) {
        // GODLIKE - Red/Black with glowing light effects
        textColor = '#8B0000'; // Dark red  
        glowIntensity = 65; // Reduced from 85
        fontSize = 44; // Reduced from 74 to fit smaller combo text
        lightningCount = 3; // Reduced from 5
      } else if (gs.comboState.count === 13) {
        // Almost Max Combo
        textColor = '#A00000'; // Dark red
        glowIntensity = 78;
        fontSize = 42;
        lightningCount = 5;
      } else if (gs.comboState.count === 12) {
        // Fantastic Combo
        textColor = '#C00000'; // Medium dark red
        glowIntensity = 48; // Reduced from 72
        fontSize = 36; // Reduced from 56 to fit smaller combo text
        lightningCount = 2; // Reduced from 4
      } else if (gs.comboState.count === 11) {
        // Unbelievable Combo
        textColor = '#C80000'; // Medium dark red
        glowIntensity = 46; // Reduced from 66
        fontSize = 34; // Reduced from 54 to fit smaller combo text
        lightningCount = 2; // Reduced from 4
      } else if (gs.comboState.count === 10) {
        // Amazing Combo
        textColor = '#D00000'; // Medium red
        glowIntensity = 44; // Reduced from 60
        fontSize = 32; // Reduced from 52 to fit smaller combo text
        lightningCount = 1; // Reduced from 4
      } else if (gs.comboState.count === 9) {
        // Mythical Combo
        textColor = '#D80000'; // Lighter red
        glowIntensity = 42; // Reduced from 54
        fontSize = 30; // Reduced from 50 to fit smaller combo text
        lightningCount = 1; // Reduced from 3
      } else if (gs.comboState.count === 8) {
        // Legendary Combo
        textColor = '#E00000'; // Light red
        glowIntensity = 40; // Reduced from 48
        fontSize = 28; // Reduced from 48 to fit smaller combo text
        lightningCount = 1; // Reduced from 3
      } else if (gs.comboState.count === 7) {
        // Epic Combo
        textColor = '#E80000'; // Very light red
        glowIntensity = 36; // Reduced from 40
        fontSize = 26; // Reduced from 46 to fit smaller combo text
        lightningCount = 1; // Reduced from 2
      } else if (gs.comboState.count === 6) {
        // Rare Combo
        textColor = '#FF3333'; // Pink-ish red
        glowIntensity = 32; // Reduced
        fontSize = 25; // Reduced from 44 to fit smaller combo text
        lightningCount = 0; // Reduced from 2
      } else if (gs.comboState.count === 5) {
        // Multikill - Yellow/White start
        textColor = '#FFFF99'; // Light yellow
        glowIntensity = 25; // Reduced
        fontSize = 24; // Reduced from 40 to fit smaller combo text
        lightningCount = 0; // Reduced from 1
      }
      
      comboText.style.fontSize = `${fontSize}px`;
      comboText.style.color = textColor;
      
      // Build lightning effect with multiple layers
      let shadowLayers = `
        3px 3px 0 #000,
        -2px -2px 0 #000,
        2px -2px 0 #000,
        -2px 2px 0 #000`;
      
      // Add lightning glow layers based on combo count
      for (let i = 0; i < lightningCount; i++) {
        const spread = 10 + i * 15;
        shadowLayers += `,
        0 0 ${spread}px rgba(255,255,255,0.9),
        0 0 ${spread * 2}px rgba(255,200,0,0.7),
        0 0 ${spread * 3}px rgba(255,100,0,0.5)`;
      }
      
      comboText.style.textShadow = shadowLayers;
      comboMultiplier.style.color = textColor;
      comboMultiplier.style.fontSize = `${Math.floor(fontSize * 0.5)}px`; // Scale multiplier text
      
      // Show stat notification for all combos
      showStatChange(message, comboLevel);
      // Play multikill sound
      playSound('multikill');
      
      // Show with animation - scale grows with combo count
      comboEl.style.opacity = '1';
      comboEl.style.animation = `combo-bubble ${COMBO_ANIMATION_DURATION}ms ease-out`;
      
      // Reset animation after it completes
      setTimeout(() => {
        comboEl.style.animation = 'none';
      }, COMBO_ANIMATION_DURATION);
    }
    
    function hideCombo() {
      const comboEl = document.getElementById('combo-counter');
      const comboTimerEl = document.getElementById('combo-timer');
      comboEl.style.animation = `combo-fade-out ${COMBO_ANIMATION_DURATION}ms ease-out forwards`;
      
      // Clear combo timer interval
      if (gs.comboState.timerInterval) {
        clearInterval(gs.comboState.timerInterval);
        gs.comboState.timerInterval = null;
      }
      
      setTimeout(() => {
        comboEl.style.opacity = '0';
        comboEl.style.animation = 'none';
        comboTimerEl.style.display = 'none'; // Hide timer when combo is lost
        
        // Spawn chest when combo is lost at minimum threshold
        if (gs.comboState.count >= MIN_COMBO_FOR_CHEST_ON_LOSS) {
          const chestTier = getChestTierForCombo(gs.comboState.count);
          if (chestTier) {
            const chestAngle = Math.random() * Math.PI * 2;
            const chestDist = 10 + Math.random() * 5;
            const cx = gs.player.mesh.position.x + Math.cos(chestAngle) * chestDist;
            const cz = gs.player.mesh.position.z + Math.sin(chestAngle) * chestDist;
            spawnChest(cx, cz, chestTier);
            // Show only in stat bar: "combo lost" and chest rarity (no text on main screen)
            const tierCapitalized = chestTier.charAt(0).toUpperCase() + chestTier.slice(1);
            showStatChange(`Combo lost - ${tierCapitalized} chest`);
          }
        }
        
        gs.comboState.count = 0;
        gs.comboState.topCombos = []; // Reset top combos for next combo sequence
        gs.comboState.shownMilestones = []; // Reset shown milestones
      }, COMBO_ANIMATION_DURATION);
    }
    
    // ── Farmer NPC Dialogue System ──────────────────────────────────────────
    const FARMER_DIALOGUE = {
      intro: [
        "Howdy, stranger! Glad you came by the windmill.",
        "Those blasted raiders have been attackin' my fields and stealin' my crops!",
        "I need to head over to the barn and refill supplies before winter hits.",
        "Could ya protect the windmill while I'm gone? Keep those varmints away!",
        "Do this for me and I'll hand over my trusty double-barrel gun. Deal?"
      ],
      success: [
        "You did it! The windmill's still standin'!",
        "I'm so relieved — those crops are safe for the season.",
        "A deal's a deal. Here, take my double-barrel gun. You've earned it!"
      ],
      failure: [
        "Oh no... they got my crops again...",
        "I can't believe it — all that hard work, gone.",
        "I need some time to recover. Come back another day and we'll try again."
      ]
    };


    function worldToScreen(worldPos) {
      const vec = worldPos.clone();
      vec.project(gs.camera);
      return {
        x: (vec.x * 0.5 + 0.5) * window.innerWidth,
        y: (-(vec.y * 0.5) + 0.5) * window.innerHeight
      };
    }

    function showFarmerDialogue(lines, onComplete) {
      gs.farmerDialogueLines = lines;
      gs.farmerDialoguePage = 0;
      gs.windmillQuest.dialogueOpen = true;
      setGamePaused(true); // Pause game while dialogue is showing

      const bubble = document.getElementById('farmer-speech-bubble');
      const textEl = document.getElementById('farmer-speech-bubble-text');
      const promptEl = document.getElementById('farmer-speech-bubble-prompt');

      function renderPage() {
        textEl.textContent = gs.farmerDialogueLines[gs.farmerDialoguePage];
        const isLast = gs.farmerDialoguePage >= gs.farmerDialogueLines.length - 1;
        promptEl.textContent = isLast ? '▶ tap to close' : '▶ tap to continue';
        bubble.style.display = 'block';
        if (gs.farmerNPC) {
          const screen = worldToScreen(gs.farmerNPC.position.clone().setY(gs.farmerNPC.position.y + 3.5));
          bubble.style.left = screen.x + 'px';
          bubble.style.top = screen.y + 'px';
        }
      }

      function advancePage() {
        gs.farmerDialoguePage++;
        if (gs.farmerDialoguePage >= gs.farmerDialogueLines.length) {
          hideFarmerDialogue();
          if (onComplete) onComplete();
        } else {
          renderPage();
        }
      }

      // Clean up previous listeners before adding new ones
      if (bubble._farmerClickHandler) {
        bubble.removeEventListener('click', bubble._farmerClickHandler);
      }
      if (bubble._farmerTouchHandler) {
        bubble.removeEventListener('touchend', bubble._farmerTouchHandler);
      }

      function touchHandler(e) {
        e.preventDefault(); // Prevent subsequent click event on touch devices
        advancePage();
      }

      bubble._farmerClickHandler = advancePage;
      bubble._farmerTouchHandler = touchHandler;
      bubble.addEventListener('click', advancePage);
      bubble.addEventListener('touchend', touchHandler);
      renderPage();
    }

    function hideFarmerDialogue() {
      gs.windmillQuest.dialogueOpen = false;
      const bubble = document.getElementById('farmer-speech-bubble');
      bubble.style.display = 'none';
      if (bubble._farmerClickHandler) {
        bubble.removeEventListener('click', bubble._farmerClickHandler);
        bubble._farmerClickHandler = null;
      }
      if (bubble._farmerTouchHandler) {
        bubble.removeEventListener('touchend', bubble._farmerTouchHandler);
        bubble._farmerTouchHandler = null;
      }
      // Resume game after dialogue closes (if game is still active and no other overlay is open)
      if (gs.isGameActive && !gs.isGameOver) {
        const hasOpenOverlay =
          document.getElementById('levelup-modal')?.style.display === 'flex' ||
          document.getElementById('settings-modal')?.style.display === 'flex' ||
          document.getElementById('options-menu')?.style.display === 'flex' ||
          document.getElementById('stats-modal')?.style.display === 'flex' ||
          document.getElementById('comic-tutorial-modal')?.style.display === 'flex' ||
          document.getElementById('story-quest-modal')?.style.display === 'flex' ||
          document.getElementById('quest-popup-overlay') !== null;
        if (!hasOpenOverlay) {
          setGamePaused(false);
        }
      }
    }

    function updateFarmerNPCIndicator() {
      const indicator = document.getElementById('farmer-quest-indicator');
      if (!gs.farmerNPC || !indicator) return;
      // Show "?" while quest is not started and reward not given yet
      const showIndicator = !gs.windmillQuest.active && !gs.windmillQuest.rewardGiven && !gs.windmillQuest.dialogueOpen;
      if (showIndicator) {
        const screen = worldToScreen(gs.farmerNPC.position.clone().setY(gs.farmerNPC.position.y + 4.2));
        indicator.style.left = screen.x + 'px';
        indicator.style.top = screen.y + 'px';
        indicator.style.display = 'block';
      } else {
        indicator.style.display = 'none';
      }
    }

    function updateFarmerBubblePosition() {
      if (!gs.windmillQuest.dialogueOpen || !gs.farmerNPC) return;
      const bubble = document.getElementById('farmer-speech-bubble');
      if (bubble.style.display === 'none') return;
      const screen = worldToScreen(gs.farmerNPC.position.clone().setY(gs.farmerNPC.position.y + 3.5));
      bubble.style.left = screen.x + 'px';
      bubble.style.top = screen.y + 'px';
      // Apply dynamic animation based on gs.player movement
      const jx = joystickLeft.x;
      const jy = joystickLeft.y;
      const moving = Math.abs(jx) > 0.2 || Math.abs(jy) > 0.2;
      bubble.classList.remove('moving-left', 'moving-right', 'moving-up', 'idle');
      if (moving) {
        if (Math.abs(jx) >= Math.abs(jy)) {
          bubble.classList.add(jx < 0 ? 'moving-left' : 'moving-right');
        } else {
          bubble.classList.add('moving-up');
        }
      } else {
        bubble.classList.add('idle');
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    function updateWindmillQuestUI() {
      if (!gs.windmillQuest.active || !gs.windmillQuest.windmill) return;
      
      const hp = gs.windmillQuest.windmill.userData.hp;
      const maxHp = gs.windmillQuest.windmill.userData.maxHp;
      const hpPct = (hp / maxHp) * 100;
      
      document.getElementById('windmill-hp-fill').style.width = `${Math.max(0, hpPct)}%`;
      document.getElementById('windmill-hp-text').innerText = `WINDMILL: ${Math.max(0, Math.ceil(hp))}/${maxHp}`;
      document.getElementById('windmill-timer-text').innerText = `DEFEND: ${Math.ceil(gs.windmillQuest.timer)}s`;
    }
    
    function startWindmillQuest(windmill) {
      if (gs.windmillQuest.hasCompleted || gs.windmillQuest.active) return;
      
      gs.windmillQuest.active = true;
      gs.windmillQuest.timer = gs.windmillQuest.duration;
      gs.windmillQuest.windmill = windmill;
      gs.windmillQuest.failed = false;
      windmill.userData.hp = 600;
      windmill.userData.maxHp = 600;
      
      document.getElementById('windmill-quest-ui').style.display = 'block';
      updateWindmillQuestUI();
      
      createFloatingText("DEFEND THE WINDMILL!", windmill.position);
      
      showStatChange('⚔️ Side Quest Activated: Defend the Windmill!');
    }
    
    function completeWindmillQuest() {
      gs.windmillQuest.active = false;
      gs.windmillQuest.hasCompleted = true;
      gs.windmillQuest.rewardReady = true;
      document.getElementById('windmill-quest-ui').style.display = 'none';
      
      createFloatingText("QUEST COMPLETE!", gs.windmillQuest.windmill.position);
      
      showEnhancedNotification(
        'quest',
        'QUEST COMPLETE!',
        'Return to the farmer for your reward!'
      );
      
      // Unlock lore
      unlockLore('landmarks', 'windmill');
      unlockLore('bosses', 'windmillBoss');
      
      playSound('levelup');
      updateHUD();
    }

    function giveWindmillQuestReward() {
      gs.windmillQuest.rewardReady = false;
      gs.windmillQuest.rewardGiven = true;

      // Grant passive level up
      playerStats.lvl++;
      playerStats.expReq = (playerStats.lvl * 2) * GAME_CONFIG.expValue;

      // Unlock Double Barrel Gun
      weapons.gun.barrels = 2;
      weapons.gun.damage += 10;
      weapons.doubleBarrel.active = true;
      weapons.doubleBarrel.level = 1;

      // Spawn a blue (rare) reward chest near the farmer as visual representation
      const chestX = gs.farmerNPC ? gs.farmerNPC.position.x + 1.5 : gs.player.mesh.position.x + 2;
      const chestZ = gs.farmerNPC ? gs.farmerNPC.position.z + 1.5 : gs.player.mesh.position.z + 2;
      spawnChest(chestX, chestZ, 'rare');

      createFloatingText("DOUBLE BARREL UNLOCKED!", gs.player.mesh.position);

      showEnhancedNotification(
        'unlock',
        'WEAPON UNLOCKED!',
        'Double Barrel Gun - Increased damage and firepower!'
      );

      playSound('levelup');
      updateHUD();
    }

    function failWindmillQuest() {
      gs.windmillQuest.active = false;
      gs.windmillQuest.failed = true;
      document.getElementById('windmill-quest-ui').style.display = 'none';
      if (gs.windmillQuest.windmill) createFloatingText("WINDMILL DESTROYED!", gs.windmillQuest.windmill.position);
      showEnhancedNotification('quest', 'QUEST FAILED', 'Return to the farmer to retry.');
    }
    
    // Montana Quest Functions
    function updateMontanaQuestUI() {
      if (!gs.montanaQuest.active) return;
      
      const timerPct = (gs.montanaQuest.timer / gs.montanaQuest.duration) * 100;
      document.getElementById('montana-timer-fill').style.width = `${Math.max(0, timerPct)}%`;
      document.getElementById('montana-timer-text').innerText = `SURVIVE: ${Math.ceil(gs.montanaQuest.timer)}s`;
      document.getElementById('montana-kills-text').innerText = `KILLS: ${gs.montanaQuest.kills}/${gs.montanaQuest.killsNeeded}`;
    }
    
    function startMontanaQuest(landmark) {
      if (!landmark || gs.montanaQuest.hasCompleted || gs.montanaQuest.active) return; // Prevent race condition and validate landmark
      
      gs.montanaQuest.active = true;
      gs.montanaQuest.timer = gs.montanaQuest.duration;
      gs.montanaQuest.kills = 0;
      gs.montanaQuest.landmark = landmark;
      
      document.getElementById('montana-quest-ui').style.display = 'block';
      updateMontanaQuestUI();
      
      createFloatingText("MONTANA CHALLENGE!", landmark.position);
      createFloatingText(`SURVIVE ${gs.montanaQuest.duration}s & KILL ${gs.montanaQuest.killsNeeded}!`, landmark.position);
    }
    
    function completeMontanaQuest() {
      gs.montanaQuest.active = false;
      gs.montanaQuest.hasCompleted = true;
      document.getElementById('montana-quest-ui').style.display = 'none';
      
      createFloatingText("MONTANA COMPLETE!", gs.montanaQuest.landmark.position);
      
      // Rewards: +2 levels, +500 gold, +3 attr points
      playerStats.lvl += 2;
      playerStats.expReq = (playerStats.lvl * 2) * GAME_CONFIG.expValue;
      playerStats.gold += 500;
      playerStats.attributePoints += 3;
      
      createFloatingText("+2 LEVELS!", gs.player.mesh.position);
      createFloatingText("+500 GOLD!", gs.player.mesh.position);
      createFloatingText("+3 ATTR POINTS!", gs.player.mesh.position);
      
      // Unlock lore
      unlockLore('landmarks', 'montana');
      
      playSound('levelup');
      updateHUD();
    }
    
    // Eiffel Quest Functions
    function updateEiffelQuestUI() {
      if (!gs.eiffelQuest.active) return;
      
      const timerPct = (gs.eiffelQuest.timer / gs.eiffelQuest.duration) * 100;
      document.getElementById('eiffel-timer-fill').style.width = `${Math.max(0, timerPct)}%`;
      document.getElementById('eiffel-timer-text').innerText = `SURVIVE: ${Math.ceil(gs.eiffelQuest.timer)}s`;
      document.getElementById('eiffel-kills-text').innerText = `KILLS: ${gs.eiffelQuest.kills}/${gs.eiffelQuest.killsNeeded}`;
    }
    
    function startEiffelQuest(landmark) {
      if (!landmark || gs.eiffelQuest.hasCompleted || gs.eiffelQuest.active) return; // Prevent race condition and validate landmark
      
      gs.eiffelQuest.active = true;
      gs.eiffelQuest.timer = gs.eiffelQuest.duration;
      gs.eiffelQuest.kills = 0;
      gs.eiffelQuest.landmark = landmark;
      
      document.getElementById('eiffel-quest-ui').style.display = 'block';
      updateEiffelQuestUI();
      
      createFloatingText("EIFFEL CHALLENGE!", landmark.position);
      createFloatingText(`SURVIVE ${gs.eiffelQuest.duration}s & KILL ${gs.eiffelQuest.killsNeeded}!`, landmark.position);
    }
    
    function completeEiffelQuest() {
      gs.eiffelQuest.active = false;
      gs.eiffelQuest.hasCompleted = true;
      document.getElementById('eiffel-quest-ui').style.display = 'none';
      
      createFloatingText("EIFFEL COMPLETE!", gs.eiffelQuest.landmark.position);
      
      // Rewards: +3 levels, +1000 gold, +5 attr points, +20 gun damage
      playerStats.lvl += 3;
      playerStats.expReq = (playerStats.lvl * 2) * GAME_CONFIG.expValue;
      playerStats.gold += 1000;
      playerStats.attributePoints += 5;
      weapons.gun.damage += 20;
      
      createFloatingText("+3 LEVELS!", gs.player.mesh.position);
      createFloatingText("+1000 GOLD!", gs.player.mesh.position);
      createFloatingText("+5 ATTR POINTS!", gs.player.mesh.position);
      createFloatingText("+20 GUN DAMAGE!", gs.player.mesh.position);
      playSound('levelup');
      updateHUD();
    }
    
    // Deferred disposal functions (PR #81) - prevent frame drops from bulk cleanup
    function queueDisposal(mesh) {
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
      disposalQueue.push({ geo: mesh.geometry, mat: mesh.material });
    }
    
    function processDisposalQueue() {
      let count = 0;
      while (disposalQueue.length > 0 && count < MAX_DISPOSALS_PER_FRAME) {
        const item = disposalQueue.shift();
        if (item.geo) {
          item.geo.dispose();
        }
        if (item.mat) {
          if (Array.isArray(item.mat)) {
            item.mat.forEach(m => {
              if (m && m.dispose) m.dispose();
            });
          } else if (item.mat && item.mat.dispose) {
            item.mat.dispose();
          }
        }
        count++;
      }
    }

    function createDamageNumber(amount, pos, isCrit = false, isHeadshot = false) {
      const div = document.createElement('div');
      // Color code by damage type: headshot (red) > crit (gold) > normal (white)
      if (isHeadshot) {
        div.className = 'damage-number headshot';
        div.innerText = `HEADSHOT!\n${Math.floor(amount)}`;
      } else if (isCrit) {
        div.className = 'damage-number critical';
        div.innerText = `CRIT!\n${Math.floor(amount)}`;
      } else {
        div.className = 'damage-number normal';
        div.innerText = Math.floor(amount);
      }
      
      // Project 3D pos to 2D screen
      const vec = pos.clone();
      vec.y += 1.5;
      vec.project(gs.camera);
      
      const x = (vec.x * .5 + .5) * window.innerWidth;
      const y = (-(vec.y * .5) + .5) * window.innerHeight;
      
      div.style.position = 'absolute';
      div.style.left = `${x}px`;
      div.style.top = `${y}px`;
      div.style.transform = 'translate(-50%, -50%)';
      div.style.whiteSpace = 'pre';
      div.style.textAlign = 'center';
      
      document.body.appendChild(div);
      setTimeout(() => div.remove(), 1000);
    }
    
    // Message fade tracking to prevent memory leaks
    
    // Stat Notification Queue System - Red/Black Theme
    const statNotificationQueue = [];
    
    // Comic Book Tutorial System
    function showComicTutorial(step) {
      const modal = document.getElementById('comic-tutorial-modal');
      const title = document.getElementById('comic-title');
      const text = document.getElementById('comic-text');
      const btn = document.getElementById('comic-action-btn');
      
      if (!modal || !title || !text || !btn) return;
      
      let tutorialData = {};
      
      switch(step) {
        case 'first_death':
          tutorialData = {
            title: '⚡ DROPLET DOWN! ⚡',
            text: '<strong style="color:#FFD700;">YOUR JOURNEY BEGINS NOW...</strong><br><br>Every hero falls. But only the <strong>BRAVE</strong> rise again!<br><br>Return to the <strong>⛺ CAMP</strong> to unlock your true potential.<br><br><strong>WARNING:</strong> Your progression is LOCKED until you complete your training!',
            button: '⛺ GO TO CAMP'
          };
          break;
        case 'unlock_dash':
          tutorialData = {
            title: '🎯 TRAINING PROTOCOL 1 🎯',
            text: '<strong>MISSION:</strong> Master Evasion<br><br>Navigate to the <strong>SKILL TREE</strong> building and unlock the <strong>DASH</strong> ability.<br><br>This combat maneuver is <strong>ESSENTIAL</strong> for survival against overwhelming enemy forces!<br><br><strong>⚠️ DO NOT PROCEED WITHOUT COMPLETING THIS STEP ⚠️</strong>',
            button: '✓ ACKNOWLEDGED'
          };
          break;
        case 'unlock_headshot':
          tutorialData = {
            title: '🎯 TRAINING PROTOCOL 2 🎯',
            text: '<strong>EXCELLENT WORK, DROPLET!</strong><br><br><strong>NEXT MISSION:</strong> Master Precision Combat<br><br>Return to the <strong>SKILL TREE</strong> and unlock a <strong>HEADSHOT/CRITICAL</strong> skill.<br><br>Combine DASH and PRECISION to become an <strong>UNSTOPPABLE FORCE!</strong><br><br><strong>⚠️ COMPLETE THIS TO FINISH TRAINING ⚠️</strong>',
            button: '✓ ON MY WAY'
          };
          break;
        case 'tutorial_complete':
          tutorialData = {
            title: '⚡ TRAINING COMPLETE! ⚡',
            text: '<strong style="font-size:28px;">CONGRATULATIONS, DROPLET!</strong><br><br>You have proven yourself worthy!<br><br>The camp is yours to explore. Unlock buildings, upgrade your arsenal, and prepare for the challenges ahead.<br><br><strong>THE NIGHT IS DARK... BUT YOU ARE READY!</strong><br><br>🦇 <em>Justice awaits no one...</em> 🦇',
            button: '⚡ BECOME LEGEND ⚡'
          };
          break;
      }
      
      title.textContent = tutorialData.title;
      text.innerHTML = tutorialData.text;
      btn.textContent = tutorialData.button;
      
      if (gs.isGameActive && !gs.isGameOver) setGamePaused(true);
      modal.style.display = 'flex';
      
      // Handle button click
      btn.onclick = () => {
        modal.style.display = 'none';
        if (gs.isGameActive && !gs.isGameOver) setGamePaused(false);
        
        // Update tutorial state
        if (step === 'first_death') {
          gs.saveData.tutorial.currentStep = 'go_to_camp';
          saveSaveData();
          // Navigate to camp screen on first death
          const gameoverScreen = document.getElementById('gameover-screen');
          if (gameoverScreen) gameoverScreen.style.display = 'none';
          const campScreen = document.getElementById('camp-screen');
          if (campScreen) {
            window.updateCampScreen();
            campScreen.style.display = 'flex';
          }
        } else if (step === 'unlock_dash') {
          gs.saveData.tutorial.currentStep = 'unlock_dash';
          saveSaveData();
        } else if (step === 'unlock_headshot') {
          gs.saveData.tutorial.currentStep = 'unlock_headshot';
          saveSaveData();
        } else if (step === 'tutorial_complete') {
          gs.saveData.tutorial.completed = true;
          gs.saveData.tutorial.currentStep = 'completed';
          saveSaveData();
        }
      };
    }

    function showStatChange(text, level = 'normal') {
      // Add to queue with level
      statNotificationQueue.push({ text, level });
      
      // Start processing queue if not already processing
      if (!gs.isShowingNotification) {
        processStatNotificationQueue();
      }
    }

    // showStatusMessage: compact status notification (camp screen feedback)
    function showStatusMessage(text, duration = 2000) {
      showStatChange(text);
    }

    function processStatNotificationQueue() {
      if (statNotificationQueue.length === 0) {
        gs.isShowingNotification = false;
        return;
      }

      gs.isShowingNotification = true;
      const { text, level } = statNotificationQueue.shift();
      
      // Create notification element
      const container = document.getElementById('stat-notifications');
      const notification = document.createElement('div');
      notification.className = 'stat-notification';
      
      // Add styling based on level
      if (level === 'mythical') {
        notification.classList.add('combo-mythical');
      } else if (level === 'high') {
        notification.classList.add('combo-high');
      }
      
      notification.innerText = text;
      container.appendChild(notification);

      // Faster fade out: 1.2 seconds display, then 0.4s fade
      setTimeout(() => {
        notification.style.animation = 'stat-fade-out 0.4s ease-out forwards';
        
        // Remove element and process next in queue
        setTimeout(() => {
          container.removeChild(notification);
          processStatNotificationQueue();
        }, 400);
      }, 1200);
    }
    
    // FRESH IMPLEMENTATION: Enhanced Notification System
    function showEnhancedNotification(type, title, message) {
      // Create notification element
      const notification = document.createElement('div');
      notification.className = 'enhanced-notification';
      
      // Icon based on type
      let icon = '';
      let borderColor = '#5DADE2';
      switch(type) {
        case 'quest':
          icon = '📜';
          borderColor = '#FFD700';
          break;
        case 'achievement':
          icon = '🏆';
          borderColor = '#F39C12';
          break;
        case 'attribute':
          icon = '⭐';
          borderColor = '#9B59B6';
          break;
        case 'unlock':
          icon = '🔓';
          borderColor = '#2ECC71';
          break;
        default:
          icon = '💧';
      }
      
      notification.style.borderColor = borderColor;
      notification.innerHTML = `
        <div class="notification-icon">${icon}</div>
        <div class="notification-title">${title}</div>
        <div class="notification-text">${message}</div>
      `;
      
      document.body.appendChild(notification);
      
      // Play sound
      playSound('waterdrop');
      
      // Auto-remove after 3 seconds
      setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }, 3000);
    }

    // Screen shake effect for big destructions and impacts
    window.screenShakeIntensity = 0;
    window.triggerScreenShake = function(intensity) {
      window.screenShakeIntensity = Math.max(window.screenShakeIntensity, intensity);
    };

    function gameOver() {
      setGameOver(true);
      setGamePaused(true);
      setGameActive(false);
      // Close farmer speech bubble if open
      const farmerBubble = document.getElementById('farmer-speech-bubble');
      if (farmerBubble) farmerBubble.style.display = 'none';
      // Close any open modals
      ['levelup-modal','settings-modal','stats-modal','comic-tutorial-modal','story-quest-modal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      // Reset pause counter
      gs.pauseOverlayCount = 0;
      gs.isPaused = false;
      window.isPaused = false;
      gs.levelUpPending = false;
      // Close farmer dialogue if open when game ends to prevent UI malfunction
      if (gs.windmillQuest.dialogueOpen) {
        hideFarmerDialogue();
      }
      
      stopDroneHum(); // Stop drone sound
      
      // Calculate run stats
      const survivalTime = Math.floor((Date.now() - gs.gameStartTime) / 1000);
      const goldEarned = playerStats.gold - gs.runStartGold;
      
      // Track items gained this run (initialize if not present)
      if (!window.runLootGained) window.runLootGained = [];
      
      // Update save data
      gs.saveData.totalRuns++;
      gs.saveData.totalKills += playerStats.kills; // Track cumulative kills
      if (survivalTime > gs.saveData.bestTime) gs.saveData.bestTime = survivalTime;
      if (playerStats.kills > gs.saveData.bestKills) gs.saveData.bestKills = playerStats.kills;
      // Add account XP for kills this run (1 XP per kill)
      if (playerStats.kills > 0) window.addAccountXP(playerStats.kills);
      
      // Tutorial Quest: Check for first death
      if (!gs.saveData.tutorialQuests) {
        gs.saveData.tutorialQuests = {
          currentQuest: null,
          completedQuests: [],
          questProgress: {},
          readyToClaim: [],
          firstDeathShown: false,
          secondRunCompleted: false,
          killsThisRun: 0,
          survivalTimeThisRun: 0,
          stonenhengeChestFound: false
        };
      }
      
      if (!gs.saveData.tutorialQuests.firstDeathShown) {
        gs.saveData.tutorialQuests.firstDeathShown = true;
        // Auto-claim firstRunDeath so quest1 conditions are satisfied when gs.player enters main building
        if (!gs.saveData.tutorialQuests.completedQuests.includes('firstRunDeath')) {
          gs.saveData.tutorialQuests.completedQuests.push('firstRunDeath');
        }
        saveSaveData();
        // Show first death tutorial – quest1 activates later when gs.player enters the Main Building
        setTimeout(() => {
          showComicTutorial('first_death');
        }, 1000);
      }
      
      // Tutorial: Check for quest completion on death
      const currentQuest = getCurrentQuest();
      if (currentQuest && currentQuest.triggerOnDeath) {
        // Quest 4: Kill 10 gs.enemies (legacy)
        if (currentQuest.id === 'quest4_kill10' && gs.saveData.tutorialQuests.killsThisRun >= 10) {
          window.progressTutorialQuest('quest4_kill10', true);
        }
        // Quest 7: Survive 2 minutes (legacy)
        if (currentQuest.id === 'quest7_survive2min' && gs.saveData.tutorialQuests.survivalTimeThisRun >= 120) {
          window.progressTutorialQuest('quest7_survive2min', true);
        }
        // Quest 5: Complete a run (any run completion counts)
        if (currentQuest.id === 'quest5_doRun') {
          window.progressTutorialQuest('quest5_doRun', true);
        }
        // Quest 6: Kill 10 gs.enemies (new intermediate quest)
        if (currentQuest.id === 'quest6_kill10' && gs.saveData.tutorialQuests.killsThisRun >= 10) {
          window.progressTutorialQuest('quest6_kill10', true);
        }
        // Quest 7 (new): Kill 15 gs.enemies
        if (currentQuest.id === 'quest7_kill10' && gs.saveData.tutorialQuests.killsThisRun >= 15) {
          window.progressTutorialQuest('quest7_kill10', true);
        }
      }
      
      // Quest 3 (new chain): Reach Level 5
      if (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.currentQuest === 'quest3_reachLevel5' && playerStats.lvl >= 5) {
        if (!gs.saveData.tutorialQuests.readyToClaim.includes('quest3_reachLevel5')) {
          gs.saveData.tutorialQuests.readyToClaim.push('quest3_reachLevel5');
        }
      }
      
      // Mark second run completed (for achievements unlock)
      if (gs.saveData.totalRuns >= 2) {
        gs.saveData.tutorialQuests.secondRunCompleted = true;
      }
      
      saveSaveData();
      
      // Display game over screen
      document.getElementById('gameover-screen').style.display = 'flex';
      // On first run, only show "Go to Camp" button; restore all buttons on subsequent runs
      const isFirstRun = gs.saveData.totalRuns === 1;
      document.getElementById('restart-btn').style.display = isFirstRun ? 'none' : '';
      document.getElementById('quit-to-menu-btn').style.display = isFirstRun ? 'none' : '';
      document.getElementById('goto-camp-btn').style.display = '';
      document.getElementById('final-score').innerText = `⏱️ Survived: ${survivalTime}s`;
      document.getElementById('final-kills').innerText = `⚔️ Kills: ${playerStats.kills}`;
      document.getElementById('final-level').innerText = `📊 Final Level: ${playerStats.lvl}`;
      document.getElementById('gold-earned').innerText = `💰 Gold Earned: ${goldEarned}`;
      document.getElementById('total-gold').innerText = `💵 Total Gold: ${gs.saveData.gold}`;
      
      // Display loot summary
      const lootItemsDiv = document.getElementById('loot-items');
      if (window.runLootGained && window.runLootGained.length > 0) {
        lootItemsDiv.innerHTML = window.runLootGained.map(item => {
          const rarityColors = {
            Common: '#AAA',
            Uncommon: '#1EFF00',
            Rare: '#0070DD',
            Epic: '#A335EE',
            Legendary: '#FF8000',
            Mythic: '#E6CC80'
          };
          const color = rarityColors[item.rarity] || '#FFF';
          return `<p style="margin: 5px 0; color: ${color};">• ${item.name} (${item.rarity})</p>`;
        }).join('');
      } else {
        lootItemsDiv.innerHTML = '<p style="margin: 5px 0;">No items gained this run</p>';
      }
      
      updateGoldDisplays();
      
      // Show deferred mission notification after death (quest completed during run)
      if (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.pendingMissionNotification === 'quest1_kill3') {
        gs.saveData.tutorialQuests.pendingMissionNotification = null;
        saveSaveData();
        setTimeout(() => {
          showComicInfoBox(
            '📋 MISSION REPORT',
            `<div style="text-align: left; padding: 10px;">
              <p style="font-family: 'Bangers', cursive; font-size: 20px; margin-bottom: 10px;">✅ 3 KILLS CONFIRMED!</p>
              <p style="line-height: 1.8; margin-bottom: 10px;">
                Excellent work, Droplet! You've eliminated 3 gs.enemies.<br><br>
                <b>CURRENT MISSION:</b> Build your strength between runs. Use camp resources to upgrade your abilities and become unstoppable.<br><br>
                Return to the <b>⛺ Main Building</b> to claim your reward.
              </p>
              <p style="font-size: 13px; color: #FFD700;">💡 Tip: Head to Camp → Main Building to claim your reward.</p>
            </div>`,
            'UNDERSTOOD!'
          );
        }, 1500);
      }
    }

    function resetGame() {
      stopDroneHum(); // Stop drone sound on reset
      
      // Reset run loot tracking
      window.runLootGained = [];
      
      // Time system: always start a run at 6 AM or 6 PM (alternating)
      // First run: 6 AM. Each subsequent run alternates between 6 PM and 6 AM.
      gs.saveData.runCount = (gs.saveData.runCount || 0) + 1;
      const startHour = (gs.saveData.runCount % 2 === 1) ? 6 : 18; // Odd runs → 6 AM, Even runs → 6 PM

      // Convert hour (0-23) to timeOfDay (0-1)
      // 0 = midnight, 6 = dawn, 12 = noon, 18 = dusk
      gs.dayNightCycle.timeOfDay = startHour / 24;
      
      saveSaveData(); // Save the updated hour
      
      // Apply permanent upgrades from save data
      const baseHp = 100 + PERMANENT_UPGRADES.maxHp.effect(gs.saveData.upgrades.maxHp);
      const baseRegen = PERMANENT_UPGRADES.hpRegen.effect(gs.saveData.upgrades.hpRegen);
      const baseSpeed = 25 * (1 + PERMANENT_UPGRADES.moveSpeed.effect(gs.saveData.upgrades.moveSpeed));
      const baseDamage = 1 + PERMANENT_UPGRADES.attackDamage.effect(gs.saveData.upgrades.attackDamage);
      const baseAtkSpeed = 1 + PERMANENT_UPGRADES.attackSpeed.effect(gs.saveData.upgrades.attackSpeed);
      const baseCritChance = 0.1 + PERMANENT_UPGRADES.critChance.effect(gs.saveData.upgrades.critChance);
      const baseCritDmg = 1.5 + PERMANENT_UPGRADES.critDamage.effect(gs.saveData.upgrades.critDamage);
      const baseArmor = PERMANENT_UPGRADES.armor.effect(gs.saveData.upgrades.armor);
      const cdReduction = PERMANENT_UPGRADES.cooldownReduction.effect(gs.saveData.upgrades.cooldownReduction);
      
      // Apply passive skill bonuses
      const passiveSkills = gs.saveData.passiveSkills || {};
      const passiveHpBonus = (passiveSkills.hp_boost || 0) * 10;
      const passiveDmgBonus = (passiveSkills.dmg_boost || 0) * 0.05;
      const passiveRegenBonus = (passiveSkills.regen_boost || 0) * 0.5;
      const passiveSpeedBonus = (passiveSkills.speed_boost || 0) * 0.05;
      
      // Apply attribute bonuses from achievement system
      const dexterity = gs.saveData.attributes.dexterity || 0;
      const strength = gs.saveData.attributes.strength || 0;
      const vitality = gs.saveData.attributes.vitality || 0;
      const luck = gs.saveData.attributes.luck || 0;
      const wisdom = gs.saveData.attributes.wisdom || 0;
      
      // Training hall attributes (new system)
      const trainingStrength = gs.saveData.attributes.strength || 0; // Already included
      const trainingEndurance = gs.saveData.attributes.endurance || 0;
      const trainingFlexibility = gs.saveData.attributes.flexibility || 0;
      
      const attrHp = vitality * ATTRIBUTE_INFO.vitality.effects.maxHp;
      const attrRegen = vitality * ATTRIBUTE_INFO.vitality.effects.hpRegen;
      const attrAtkSpeed = dexterity * ATTRIBUTE_INFO.dexterity.effects.attackSpeed;
      const attrCritChance = dexterity * ATTRIBUTE_INFO.dexterity.effects.critChance;
      const attrDamage = strength * ATTRIBUTE_INFO.strength.effects.damage;
      const attrCritDmg = luck * ATTRIBUTE_INFO.luck.effects.critDamage;
      const attrCdReduction = wisdom * ATTRIBUTE_INFO.wisdom.effects.cooldownReduction;
      
      // Training hall bonuses
      // Endurance: Increases stamina and high-speed duration (implemented as +2% move speed per point)
      const enduranceMoveSpeed = trainingEndurance * 0.02;
      // Flexibility: Improves turn speed and dodge responsiveness (implemented as +2 flat armor per point)
      const flexibilityArmor = trainingFlexibility * 2;
      
      // Apply gear bonuses
      const gearStats = calculateGearStats();
      // Gear provides small, balanced bonuses (each point gives +1-2% depending on stat)
      const gearFlexibilityBonus = gearStats.flexibility * 0.01;  // +1% armor per point
      const gearMoveSpeedBonus = gearStats.movementSpeed * 0.02;  // +2% speed per point
      const gearAtkSpeedBonus = gearStats.attackSpeed * 0.02;     // +2% attack speed per point
      const gearPrecisionBonus = gearStats.attackPrecision * 0.01; // +1% crit chance per point
      const gearCritBonus = gearStats.critChance * 0.02;          // +2% crit chance per point
      const gearMagicBonus = gearStats.elementalMagic * 0.03;     // +3% damage per point
      
      // Reset Stats with permanent upgrades, attributes, and gear applied
      playerStats.lvl = 1;
      playerStats.exp = 0;
      playerStats.expReq = GAME_CONFIG.baseExpReq;
      playerStats.hp = baseHp + attrHp + passiveHpBonus;
      playerStats.maxHp = baseHp + attrHp + passiveHpBonus;
      
      // Apply legendary cigar bonus if unlocked
      const cigarBonus = (gs.saveData.extendedQuests && gs.saveData.extendedQuests.legendaryCigar && gs.saveData.extendedQuests.legendaryCigar.completed) ? 1.5 : 1.0;
      playerStats.strength = baseDamage * (1 + attrDamage + gearMagicBonus + passiveDmgBonus) * cigarBonus;
      
      playerStats.walkSpeed = baseSpeed * (1 + gearMoveSpeedBonus + enduranceMoveSpeed + passiveSpeedBonus);
      playerStats.kills = 0;
      playerStats.miniBossesDefeated = 0; // Reset mini-boss tracking
      playerStats.atkSpeed = baseAtkSpeed * (1 + attrAtkSpeed + gearAtkSpeedBonus);
      playerStats.critChance = baseCritChance + attrCritChance + gearPrecisionBonus + gearCritBonus;
      playerStats.critDmg = baseCritDmg + attrCritDmg;
      playerStats.armor = baseArmor + gearStats.flexibility + flexibilityArmor; // Flexibility gives flat armor bonus
      playerStats.hpRegen = baseRegen + attrRegen + passiveRegenBonus;
      playerStats.gold = 0;
      gs.waveCount = 0;
      gs.lastWaveEndTime = 0; // Reset wave timing
      gs.miniBossesSpawned.clear(); // Reset mini-boss tracking
      gs.gameStartTime = Date.now();
      gs.runStartGold = gs.saveData.gold;
      
      // Reset tutorial quest progress for this run
      if (gs.saveData.tutorialQuests) {
        gs.saveData.tutorialQuests.killsThisRun = 0;
        gs.saveData.tutorialQuests.survivalTimeThisRun = 0;
      }
      
      // Reset gs.player invulnerability state
      if (gs.player) {
        gs.player.invulnerable = false;
        gs.player.invulnerabilityTime = 0;
      }
      
      const totalCdReduction = cdReduction + attrCdReduction;
      const gunCooldown = 1000 * (1 - totalCdReduction);
      weapons.gun = { active: true, level: 1, damage: 15, cooldown: gunCooldown, lastShot: 0, range: 12, barrels: 1 };
      weapons.sword = { active: false, level: 0, damage: 30, cooldown: 1500, lastShot: 0, range: 3.5 };
      weapons.aura = { active: false, level: 0, damage: 5, cooldown: 500, lastShot: 0, range: 3 };
      weapons.meteor = { active: false, level: 0, damage: 60, cooldown: 2500, lastShot: 0, area: 5 };
      weapons.droneTurret = { active: false, level: 0, damage: 15, cooldown: 400, lastShot: 0, range: 15, droneCount: 1 };
      weapons.doubleBarrel = { active: false, level: 0, damage: 25, cooldown: 1200, lastShot: 0, range: 12, spread: 0.3 };
      weapons.iceSpear = { active: false, level: 0, damage: 20, cooldown: 1500, lastShot: 0, range: 15, slowPercent: 0.4, slowDuration: 2000 };
      weapons.fireRing = { active: false, level: 0, damage: 8, cooldown: 800, lastShot: 0, range: 4, orbs: 3, rotationSpeed: 2 };
      
      // Clean up any existing drone turrets
      gs.droneTurrets.forEach(drone => drone.destroy());
      gs.droneTurrets = [];
      
      // Reset perks (these are temporary and should not persist between runs)
      playerStats.perks = {
        vampire: 0,
        juggernaut: 0,
        swift: 0,
        lucky: 0,
        berserker: 0
      };
      
      // Reset temporary skills (these should not persist between runs)
      playerStats.dashCooldownReduction = 0;
      playerStats.dashDistanceBonus = 0;
      playerStats.hasSecondWind = false;
      playerStats.lifeStealPercent = 0;
      playerStats.thornsPercent = 0;
      playerStats.hasBerserkerRage = false;
      playerStats.treasureHunterChance = 0;
      playerStats.doubleCritChance = 0;
      playerStats.survivalTime = 0;
      playerStats.dashesPerformed = 0;
      playerStats.damageTaken = 0;
      playerStats.weaponsUnlocked = 0;
      // Cache headshot unlock status for this run
      playerStats.headshotUnlocked = isHeadshotUnlocked();
      
      gs.windmillQuest = { active: false, timer: 0, duration: 15, windmill: null, hasCompleted: false, dialogueOpen: false, rewardReady: false, rewardGiven: false, failed: false, failedCooldown: false };
      document.getElementById('windmill-quest-ui').style.display = 'none';
      hideFarmerDialogue();
      
      gs.montanaQuest = { active: false, timer: 0, duration: 45, kills: 0, killsNeeded: 15, landmark: null, hasCompleted: false };
      document.getElementById('montana-quest-ui').style.display = 'none';
      
      gs.eiffelQuest = { active: false, timer: 0, duration: 60, kills: 0, killsNeeded: 25, landmark: null, hasCompleted: false };
      document.getElementById('eiffel-quest-ui').style.display = 'none';
      
      // Reset windmill HP (optimized: use pre-cached gs.animatedSceneObjects)
      for (const c of gs.animatedSceneObjects.windmills) {
        c.userData.hp = 1000;
        c.userData.maxHp = 1000;
      }
      
      // Reset music
      gs.musicOscillators.forEach(m => {
        m.osc.stop();
      });
      gs.musicOscillators = [];
      gs.currentMusicLevel = 0;
      updateBackgroundMusic();

      // Clear Entities
      gs.enemies.forEach(e => {
        gs.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
      });
      gs.enemies = [];
      
      gs.expGems.forEach(e => {
        gs.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
      });
      gs.expGems = [];
      
      // Clean up blood decals
      gs.bloodDecals.forEach(d => {
        gs.scene.remove(d);
        d.geometry.dispose();
        d.material.dispose();
      });
      gs.bloodDecals = [];
      gs.bloodDecalIndex = 0; // Reset circular buffer index
      
      // Clean up blood drips
      gs.bloodDrips.forEach(d => {
        gs.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mesh.material.dispose();
      });
      gs.bloodDrips = [];
      
      gs.goldCoins.forEach(g => {
        gs.scene.remove(g.mesh);
        g.mesh.geometry.dispose();
        g.mesh.material.dispose();
      });
      gs.goldCoins = [];
      
      gs.chests.forEach(c => {
        if (c.glowLight) gs.scene.remove(c.glowLight);
        gs.scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        c.mesh.material.dispose();
        if (c.lid) {
          c.lid.geometry.dispose();
          c.lid.material.dispose();
        }
      });
      gs.chests = [];

      gs.projectiles.forEach(p => {
        gs.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      });
      gs.projectiles = [];
      
      gs.particles.forEach(p => {
        gs.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      });
      gs.particles = [];
      
      // Clean up any active flash lights
      gs.flashLights.forEach(light => {
        gs.scene.remove(light);
      });
      gs.flashLights = [];
      
      // Re-activate spawn portal for next run
      if (window.spawnPortal) {
        window.spawnPortal.active = true;
        window.spawnPortal.ringMat.opacity = 0.9;
        window.spawnPortal.discMat.opacity = 0.25;
      }
      
      // Clear any pending timeouts
      gs.activeTimeouts.forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
      gs.activeTimeouts = [];
      
      // Clean up managed smoke gs.particles
      gs.smokeParticles.forEach(sp => {
        gs.scene.remove(sp.mesh);
        sp.geometry.dispose();
        sp.material.dispose();
      });
      gs.smokeParticles = [];
      
      gs.meteors.forEach(m => {
        gs.scene.remove(m.mesh);
        gs.scene.remove(m.shadow);
        m.mesh.geometry.dispose();
        m.mesh.material.dispose();
      });
      gs.meteors = [];
      
      // Phase 5: Spawn companion if one is selected
      if (gs.activeCompanion) {
        gs.activeCompanion.destroy();
        gs.activeCompanion = null;
      }
      
      // COMPANION UNLOCKS AFTER QUEST 5 (breed companion quest)
      // Quest 4 gives the egg, Quest 5 is to activate it
      const quest5Completed = gs.saveData.tutorialQuests?.completedQuests?.includes('quest5_breedCompanion') || false;
      
      if (gs.saveData.selectedCompanion && 
          gs.saveData.companions[gs.saveData.selectedCompanion]?.unlocked &&
          quest5Completed) {
        gs.activeCompanion = new Companion(gs.saveData.selectedCompanion);
        console.log('[Phase 5] Spawned companion:', gs.saveData.selectedCompanion, 'after completing quest 5');
      } else if (!quest5Completed) {
        console.log('[Companion] Hidden until quest 5 (breed companion) is completed');
      }

      // Reset Player - Spawn right next to the fountain/statue
      if (gs.player) {
        gs.player.mesh.position.set(12, 0.5, 0); // Right next to fountain, outside rim
        gs.player.mesh.material.color.setHex(COLORS.player);
      }

      setGameOver(false);
      // Reset any accumulated pauses before starting a new game
      gs.pauseOverlayCount = 0;
      window.pauseOverlayCount = 0;
      gs.levelUpPending = false;
      setGamePaused(true);  // Start paused, countdown will unpause (PR #70)
      setGameActive(false);  // Not active until countdown completes (PR #70)
      document.getElementById('gameover-screen').style.display = 'none';
      updateHUD();
    }

    function toggleStats() {
      playSound('levelup'); // Add button sound
      const modal = document.getElementById('stats-modal');
      const levelUpModal = document.getElementById('levelup-modal');
      
      if (modal.style.display === 'flex') {
        modal.style.display = 'none';
        if (levelUpModal.style.display !== 'flex' && !gs.isGameOver) {
          setGamePaused(false);
        }
      } else {
        // Calculate current run time
        const currentRunTime = gs.isGameActive ? Math.floor((Date.now() - gs.gameStartTime) / 1000) : 0;
        const goldThisRun = playerStats.gold - gs.runStartGold;
        
        // Update tutorial quest progress
        if (gs.saveData.tutorialQuests && gs.isGameActive) {
          gs.saveData.tutorialQuests.survivalTimeThisRun = currentRunTime;
        }
        
        // Get permanent upgrade bonuses
        const permMaxHp = PERMANENT_UPGRADES.maxHp.effect(gs.saveData.upgrades.maxHp);
        const permHpRegen = PERMANENT_UPGRADES.hpRegen.effect(gs.saveData.upgrades.hpRegen);
        const permMoveSpeed = PERMANENT_UPGRADES.moveSpeed.effect(gs.saveData.upgrades.moveSpeed);
        const permAttackDamage = PERMANENT_UPGRADES.attackDamage.effect(gs.saveData.upgrades.attackDamage);
        const permAttackSpeed = PERMANENT_UPGRADES.attackSpeed.effect(gs.saveData.upgrades.attackSpeed);
        const permCritChance = PERMANENT_UPGRADES.critChance.effect(gs.saveData.upgrades.critChance);
        const permCritDamage = PERMANENT_UPGRADES.critDamage.effect(gs.saveData.upgrades.critDamage);
        const permArmor = PERMANENT_UPGRADES.armor.effect(gs.saveData.upgrades.armor);
        const permCooldownReduction = PERMANENT_UPGRADES.cooldownReduction.effect(gs.saveData.upgrades.cooldownReduction);
        const permGoldEarned = PERMANENT_UPGRADES.goldEarned.effect(gs.saveData.upgrades.goldEarned);
        const permExpEarned = PERMANENT_UPGRADES.expEarned.effect(gs.saveData.upgrades.expEarned);
        const permMaxWeapons = gs.saveData.upgrades.maxWeapons || 0;
        
        const content = document.getElementById('stats-content');
        content.innerHTML = `
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; max-width: 600px;">
  <div>
    <span style="color: #5DADE2; font-size: 16px; font-weight: bold; display: block; margin-bottom: 10px;">═══ BASE STATS ═══</span>
    <div style="display: grid; grid-template-columns: auto auto; gap: 5px 10px;">
      <span style="color: #aaa;">Max HP:</span><span style="color: #fff; text-align: right;">${playerStats.maxHp}</span>
      <span style="color: #aaa;">Current HP:</span><span style="color: #fff; text-align: right;">${Math.floor(playerStats.hp)}</span>
      <span style="color: #aaa;">HP Regen:</span><span style="color: #fff; text-align: right;">${playerStats.hpRegen}/s</span>
      <span style="color: #aaa;">Move Speed:</span><span style="color: #fff; text-align: right;">${playerStats.walkSpeed.toFixed(1)}</span>
      <span style="color: #aaa;">Attack Dmg:</span><span style="color: #fff; text-align: right;">${playerStats.strength.toFixed(2)}x</span>
      <span style="color: #aaa;">Attack Spd:</span><span style="color: #fff; text-align: right;">${playerStats.atkSpeed.toFixed(2)}x</span>
      <span style="color: #aaa;">Crit Chance:</span><span style="color: #fff; text-align: right;">${(playerStats.critChance*100).toFixed(1)}%</span>
      <span style="color: #aaa;">Crit Damage:</span><span style="color: #fff; text-align: right;">${(playerStats.critDmg*100).toFixed(0)}%</span>
      <span style="color: #aaa;">Armor:</span><span style="color: #fff; text-align: right;">${playerStats.armor.toFixed(0)}%</span>
    </div>
  </div>
  
  <div>
    <span style="color: #27ae60; font-size: 16px; font-weight: bold; display: block; margin-bottom: 10px;">═══ RUN STATS ═══</span>
    <div style="display: grid; grid-template-columns: auto auto; gap: 5px 10px;">
      <span style="color: #aaa;">Level:</span><span style="color: #fff; text-align: right;">${playerStats.lvl}</span>
      <span style="color: #aaa;">Kills:</span><span style="color: #fff; text-align: right;">${playerStats.kills}</span>
      <span style="color: #aaa;">Time:</span><span style="color: #fff; text-align: right;">${currentRunTime}s</span>
      <span style="color: #aaa;">Gold Earned:</span><span style="color: #fff; text-align: right;">${goldThisRun}</span>
    </div>
  </div>
</div>

<div style="margin-top: 20px;">
  <span style="color: #FFD700; font-size: 16px; font-weight: bold; display: block; margin-bottom: 10px;">═══ PERMANENT UPGRADES ═══</span>
  <div style="display: grid; grid-template-columns: auto auto; gap: 5px 15px; max-width: 400px;">
    <span style="color: #aaa;">Max HP:</span><span style="color: #fff; text-align: right;">+${permMaxHp}</span>
    <span style="color: #aaa;">HP Regen:</span><span style="color: #fff; text-align: right;">+${permHpRegen}/s</span>
    <span style="color: #aaa;">Move Speed:</span><span style="color: #fff; text-align: right;">+${(permMoveSpeed*100).toFixed(1)}%</span>
    <span style="color: #aaa;">Attack Damage:</span><span style="color: #fff; text-align: right;">+${(permAttackDamage*100).toFixed(1)}%</span>
    <span style="color: #aaa;">Attack Speed:</span><span style="color: #fff; text-align: right;">+${(permAttackSpeed*100).toFixed(1)}%</span>
    <span style="color: #aaa;">Crit Chance:</span><span style="color: #fff; text-align: right;">+${(permCritChance*100).toFixed(1)}%</span>
    <span style="color: #aaa;">Crit Damage:</span><span style="color: #fff; text-align: right;">+${(permCritDamage*100).toFixed(1)}%</span>
    <span style="color: #aaa;">Armor:</span><span style="color: #fff; text-align: right;">+${permArmor.toFixed(0)}%</span>
    <span style="color: #aaa;">Cooldown Reduction:</span><span style="color: #fff; text-align: right;">${(permCooldownReduction*100).toFixed(1)}%</span>
    <span style="color: #aaa;">Gold Bonus:</span><span style="color: #fff; text-align: right;">+${(permGoldEarned*100).toFixed(1)}%</span>
    <span style="color: #aaa;">EXP Bonus:</span><span style="color: #fff; text-align: right;">+${(permExpEarned*100).toFixed(1)}%</span>
    <span style="color: #aaa;">Max Weapons:</span><span style="color: #fff; text-align: right;">${permMaxWeapons}</span>
  </div>
</div>

<div style="margin-top: 20px;">
  <span style="color: #e74c3c; font-size: 16px; font-weight: bold; display: block; margin-bottom: 10px;">═══ LIFETIME STATS ═══</span>
  <div style="display: grid; grid-template-columns: auto auto; gap: 5px 15px; max-width: 300px;">
    <span style="color: #aaa;">Total Runs:</span><span style="color: #fff; text-align: right;">${gs.saveData.totalRuns}</span>
    <span style="color: #aaa;">Best Time:</span><span style="color: #fff; text-align: right;">${gs.saveData.bestTime}s</span>
    <span style="color: #aaa;">Best Kills:</span><span style="color: #fff; text-align: right;">${gs.saveData.bestKills}</span>
    <span style="color: #aaa;">Total Gold:</span><span style="color: #fff; text-align: right;">${gs.saveData.totalGoldEarned}</span>
  </div>
</div>
        `;
        modal.style.display = 'flex';
        setGamePaused(true);
      }
    }

    gs.showStatChange = showStatChange;
    gs.showStatusMessage = showStatusMessage;
    window.showStatChange = showStatChange;
    window.showStatusMessage = showStatusMessage;
    window.createFloatingText = createFloatingText;
    window.showComicTutorial = showComicTutorial;
    window.addGold = addGold;
    export { init, spawnWave, processDisposalQueue, gameOver, resetGame, startGame, spawnParticles, showStatChange, showStatusMessage };
    // Register spawnParticles in gs so other modules can call gs.spawnParticles()
    gs.spawnParticles = spawnParticles;
