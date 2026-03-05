// js/game-screens.js — Game initialization (init), start/countdown, menu setup, special attacks panel,
// camp board, progression shop, wave spawning, kill cam, particle/blood/water effects, level-up utilities.
// Depends on: all previously loaded game files

    // --- GAME LOGIC ---

    function init() {
      console.log('[Init] Starting game initialization...');
      // Load save data and settings first
      loadSaveData();
      loadSettings();
      console.log('[Init] Save data loaded OK');

      // Pre-create shared bullet-hole materials now that THREE.js is available
      ensureBulletHoleMaterials();

      // Scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(COLORS.bg);
      // Linear fog concentrated at edges: player area stays clear (fogNear), fog closes in at edges (fogFar)
      // Uses RENDERER_CONFIG values so fog distance is tuned in one place (renderer.js)
      scene.fog = new THREE.Fog(COLORS.bg, RENDERER_CONFIG.fogNear, RENDERER_CONFIG.fogFar);
      
      // Phase 5: Initialize particle object pool for performance (100 particles pre-allocated)
      particlePool = new ObjectPool(
        () => new Particle(new THREE.Vector3(0, 0, 0), 0xFFFFFF),
        (particle) => particle.mesh.visible = false,
        100
      );

      // Initialize advanced blood particle system (THREE.Points, 50k particles)
      if (window.BloodSystem && typeof THREE !== 'undefined') window.BloodSystem.init(scene);
      console.log('[Init] Scene created OK');

      // Camera (Orthographic for miniature look)
      // CAMERA FIX: Better angle and zoom - prevent zoom issues
      // Adjusted for better top-down view: distance 15 (balanced), angle (18,16,18) for better perspective
      // This provides clear visibility without being too close or too far
      const aspect = window.innerWidth / window.innerHeight;
      const d = RENDERER_CONFIG.cameraDistance; // Balanced distance for good visibility
      camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
      camera.position.set(RENDERER_CONFIG.cameraPositionX, RENDERER_CONFIG.cameraPositionY, RENDERER_CONFIG.cameraPositionZ); // Better angle - not too low, better visibility
      camera.lookAt(scene.position);
      console.log('[Init] Camera created OK');

      // Renderer
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: 'high-performance',
        precision: 'mediump'
      });
      renderer.setSize(window.innerWidth, window.innerHeight);
      // Split-resolution: render the 3D world at a reduced pixel ratio to boost FPS.
      // HTML/CSS UI layers are unaffected and always render at full native resolution.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDERER_CONFIG.worldPixelRatio));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const gameContainer = document.getElementById('game-container');
      if (!gameContainer) {
        console.error('[Init] #game-container element not found - cannot append renderer canvas');
        throw new Error('game-container element missing from DOM');
      }
      gameContainer.appendChild(renderer.domElement);
      console.log('[Init] Renderer created and appended OK');

      // Expose renderer globally so loading.js and other scripts can access it
      window.gameRenderer = renderer;

      // Handle WebGL context loss to prevent renderer freezes in long sessions
      renderer.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.warn('WebGL context lost - attempting recovery');
        // Pause game logic while context is lost
        setGamePaused(true);
      }, false);
      renderer.domElement.addEventListener('webglcontextrestored', () => {
        console.info('WebGL context restored');
        // Resume game if it was active
        if (isGameActive) setGamePaused(false);
        renderer.shadowMap.needsUpdate = true;
      }, false);

      // Day/Night Cycle System - Non-blocking, smooth transitions
      // Store light references for day/night cycle
      window.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(window.ambientLight);

      // Realistic sun/moon with soft dynamic shadows
      const frustumHalf = RENDERER_CONFIG.shadowFrustumHalfSize;
      window.dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      window.dirLight.position.set(50, 100, 50);
      window.dirLight.castShadow = true;
      window.dirLight.shadow.mapSize.width = RENDERER_CONFIG.defaultShadowMapSize;
      window.dirLight.shadow.mapSize.height = RENDERER_CONFIG.defaultShadowMapSize;
      window.dirLight.shadow.camera.left = -frustumHalf;
      window.dirLight.shadow.camera.right = frustumHalf;
      window.dirLight.shadow.camera.top = frustumHalf;
      window.dirLight.shadow.camera.bottom = -frustumHalf;
      window.dirLight.shadow.camera.updateProjectionMatrix(); // Apply frustum changes
      // Soft shadow settings for realistic effect
      window.dirLight.shadow.radius = RENDERER_CONFIG.shadowRadius; // Soft shadow blur
      window.dirLight.shadow.bias = RENDERER_CONFIG.shadowBias; // Prevent shadow acne
      scene.add(window.dirLight);
      scene.add(window.dirLight.target); // Must add target to scene for custom target position

      // Apply graphics quality settings
      // For 'auto' mode, start at 'medium' and let the FPS booster adjust from there
      if (gameSettings.graphicsQuality === 'auto') {
        applyGraphicsQuality('medium');
      } else {
        applyGraphicsQuality(gameSettings.graphicsQuality);
      }

      // Setup
      createWorld();
      // Performance: Cache animated scene objects after world creation
      cacheAnimatedObjects();
      player = new Player();
      // Spawn player right next to the fountain (outside the rim, on the ground)
      player.mesh.position.set(12, 0.5, 0);
      
      // Initialize gear system
      initializeGear();
      
      // Initialize background music
      if (typeof updateBackgroundMusic === 'function') updateBackgroundMusic();
      
      // Initialize harvesting system (resource nodes + tools)
      if (window.GameHarvesting) {
        window.GameHarvesting.init(scene, saveData, spawnParticles);
        // Connect harvest quest progression
        window.GameHarvesting._onHarvest = function(resourceType, amount) {
          const tq = saveData.tutorialQuests;
          if (!tq) return;
          const res = saveData.resources || {};
          // Quest questForge0b_craftTools: auto-progress when player crafts a tool
          // (This is now handled by the forge crafting UI, not by harvesting)
          // Legacy: questGather0_materials quest removed — forge quest replaces it
          // Quest 23: harvest first resource
          if (tq.currentQuest === 'quest23_harvestFirst') {
            progressTutorialQuest('quest23_harvestFirst', true);
          }
          // Quest 24: collect 5 wood and 5 stone
          if (tq.currentQuest === 'quest24_harvestWoodStone') {
            if ((res.wood || 0) >= 5 && (res.stone || 0) >= 5) {
              progressTutorialQuest('quest24_harvestWoodStone', true);
            }
          }
          saveSaveData();
        };
      }

      // Initialize Rage Combat system
      if (window.GameRageCombat) {
        window.GameRageCombat.init(scene, saveData, spawnParticles);
        // When rage activates, boost player speed/damage
        window.GameRageCombat.onRageActivated((damageMult, speedMult) => {
          if (player) {
            player._rageDamageMult = damageMult;
            player._rageSpeedMult = speedMult;
          }
        });
        window.GameRageCombat.onRageDeactivated(() => {
          if (player) {
            player._rageDamageMult = 1;
            player._rageSpeedMult = 1;
          }
        });
        // Handle special attacks: deal AoE damage to enemies
        window.GameRageCombat.onSpecialAttack((sa) => {
          const pPos = player && player.mesh ? player.mesh.position : null;
          if (!pPos) return;
          const radSq = sa.damageRadius * sa.damageRadius;
          for (const enemy of enemies) {
            if (!enemy || !enemy.mesh || enemy.isDead) continue;
            const dx = enemy.mesh.position.x - pPos.x;
            const dz = enemy.mesh.position.z - pPos.z;
            if (dx*dx + dz*dz <= radSq) {
              enemy.takeDamage(sa.damage, 'specialAttack');
            }
          }
        });
      }

      // ── Melee Takedown ────────────────────────────────────────
      // Cooldown-based instant-kill knife attack (requires skill tree unlock)
      const MELEE_COOLDOWN_MS = 6000;
      const MELEE_RANGE = 4.5;               // units
      const MELEE_INSTANT_KILL_DAMAGE = 99999; // effectively instant-kills any standard enemy
      let _meleeLastUsed = 0;

      function isMeleeUnlocked() {
        return saveData.skillTree && saveData.skillTree.meleeTakedown &&
               saveData.skillTree.meleeTakedown.level > 0;
      }

      function updateMeleeButton() {
        const btn = document.getElementById('melee-takedown-btn');
        if (!btn) return;
        if (!isMeleeUnlocked()) { btn.style.display = 'none'; return; }
        btn.style.display = 'flex';
        const elapsed = Date.now() - _meleeLastUsed;
        const ready = elapsed >= MELEE_COOLDOWN_MS;
        btn.disabled = !ready;
        btn.classList.toggle('melee-ready', ready);
        const overlay = document.getElementById('melee-cd-overlay');
        if (overlay) {
          const frac = ready ? 0 : 1 - (elapsed / MELEE_COOLDOWN_MS);
          overlay.style.height = (frac * 100) + '%';
        }
      }

      function performMeleeTakedown() {
        if (!isMeleeUnlocked()) {
          showStatChange('🔒 Unlock Melee Takedown in Skill Tree!');
          return;
        }
        if (!isGameActive || isPaused || isGameOver) return;
        const now = Date.now();
        if (now - _meleeLastUsed < MELEE_COOLDOWN_MS) return;
        if (!player || !player.mesh) return;

        _meleeLastUsed = now;

        // Visual slash animation
        const slashEl = document.createElement('div');
        slashEl.className = 'melee-slash-fx';
        slashEl.textContent = '🔪';
        slashEl.style.left = '50%';
        slashEl.style.top = '45%';
        slashEl.style.transform = 'translate(-50%,-50%)';
        document.body.appendChild(slashEl);
        setTimeout(() => slashEl.remove(), 500);

        // Screen flash
        if (window.GameRageCombat) {
          // Use internal flash via the public API workaround
          const flashEl = document.getElementById('rage-flash') || (() => {
            const el = document.createElement('div');
            el.id = 'rage-flash';
            el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:199;';
            document.body.appendChild(el);
            return el;
          })();
          flashEl.style.background = 'rgba(180,0,0,0.35)';
          flashEl.style.transition = 'none';
          setTimeout(() => {
            flashEl.style.transition = 'background 300ms ease-out';
            flashEl.style.background = 'rgba(180,0,0,0)';
          }, 50);
        }

        // Find nearest enemy and instant-kill it
        const pPos = player.mesh.position;
        let nearest = null;
        let nearestDist = Infinity;
        for (const enemy of enemies) {
          if (!enemy || !enemy.mesh || enemy.isDead) continue;
          const dx = enemy.mesh.position.x - pPos.x;
          const dz = enemy.mesh.position.z - pPos.z;
          const dist = Math.sqrt(dx*dx + dz*dz);
          if (dist < MELEE_RANGE && dist < nearestDist) {
            nearestDist = dist;
            nearest = enemy;
          }
        }
        if (nearest) {
          nearest.takeDamage(MELEE_INSTANT_KILL_DAMAGE, 'melee'); // instant kill
          showStatChange('🔪 TAKEDOWN!');
        } else {
          showStatChange('🔪 No enemy in range!');
        }

        updateMeleeButton();
      }

      // Wire up melee button
      const meleeBtn = document.getElementById('melee-takedown-btn');
      if (meleeBtn) {
        meleeBtn.addEventListener('click', performMeleeTakedown);
        meleeBtn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          e.stopPropagation();
          performMeleeTakedown();
        }, { passive: false });
      }

      // Expose updateMeleeButton so game loop can call it
      window._updateMeleeButton = updateMeleeButton;

      // Expose camera and player mesh reference to window for harvesting / rage modules
      window._gameCamera = camera;
      
      // Listeners
      setupInputs();
      console.log('[Init] Inputs set up OK');
      setupMenus();
      console.log('[Init] Menus set up OK');
      window.addEventListener('resize', onWindowResize, false);
      
      // Start Loop - begin rendering immediately (non-blocking)
      animationFrameId = requestAnimationFrame(animate);
      
      // FRESH: Signal that module is ready (standalone loading script is waiting for this)
      // Don't call showLoadingScreen - standalone script handles it
      console.log('[Init] All setup complete, setting gameModuleReady');
      window.gameModuleReady = true;
      console.log('[Init] Game module ready - Three.js loaded, event listeners attached');

      // Pre-warm the 3D camp world scene in the background.
      // Builds the Three.js scene geometry 2 seconds after startup so the first
      // camp visit (after the player dies) loads instantly instead of freezing.
      setTimeout(() => {
        if (window.CampWorld && renderer) {
          window.CampWorld.warmUp(renderer);
        }
        // Apply any saved HUD layout from the UI Calibration system.
        if (window.UICalibration) window.UICalibration.applyLayout();
        // Make the upper-left stat bar (hud-top) directly draggable during gameplay.
        (function initHudTopDrag() {
          const hudTop = document.querySelector('.hud-top');
          if (!hudTop) return;
          const STORAGE_KEY = 'wd_hudtop_pos';
          // Restore saved position if available, clamped to current viewport
          try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
              const maxL = Math.max(0, window.innerWidth  - hudTop.offsetWidth);
              const maxT = Math.max(0, window.innerHeight - hudTop.offsetHeight);
              hudTop.style.left = Math.min(maxL, Math.max(0, saved.left)) + 'px';
              hudTop.style.top  = Math.min(maxT, Math.max(0, saved.top))  + 'px';
            }
          } catch(e) {}
          let dragStartX, dragStartY, origLeft, origTop;
          let isDragging = false;
          function getPointer(e) {
            return e.touches ? e.touches[0] : e;
          }
          function onDown(e) {
            // Don't start drag if clicking on a button or interactive element inside hud-top
            if (e.target.closest('button,a,input,select')) return;
            e.preventDefault();
            isDragging = false;
            const p = getPointer(e);
            dragStartX = p.clientX;
            dragStartY = p.clientY;
            const rect = hudTop.getBoundingClientRect();
            origLeft = rect.left;
            origTop  = rect.top;
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup',   onUp);
            window.addEventListener('touchmove', onMove, { passive: false });
            window.addEventListener('touchend',  onUp);
          }
          function onMove(e) {
            e.preventDefault();
            const p = getPointer(e);
            const dx = p.clientX - dragStartX;
            const dy = p.clientY - dragStartY;
            if (!isDragging && (Math.abs(dx) + Math.abs(dy)) > 4) isDragging = true;
            if (!isDragging) return;
            const maxL = Math.max(0, window.innerWidth  - hudTop.offsetWidth);
            const maxT = Math.max(0, window.innerHeight - hudTop.offsetHeight);
            hudTop.style.left = Math.min(maxL, Math.max(0, origLeft + dx)) + 'px';
            hudTop.style.top  = Math.min(maxT, Math.max(0, origTop  + dy)) + 'px';
            hudTop.style.right     = '';
            hudTop.style.bottom    = '';
            hudTop.style.transform = ''; // clear CSS centering transform when manually positioned
          }
          function onUp() {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup',   onUp);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend',  onUp);
            if (isDragging) {
              const rect = hudTop.getBoundingClientRect();
              try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: rect.left, top: rect.top })); } catch(e) {}
              isDragging = false;
            }
          }
          hudTop.addEventListener('mousedown',  onDown);
          hudTop.addEventListener('touchstart', onDown, { passive: false });
        })();
      }, 2000);
      
      // SAFETY: Pause watchdog - auto-unpause if stuck with no visible overlay.
      // Tracks how long the game has been paused; forces unpause after >10s regardless
      // of levelUpPending to recover from any stuck-pause scenario.
      let pauseWatchdogStart = 0;
      setInterval(() => {
        if (isPaused && isGameActive && !isGameOver) {
          const now = Date.now();
          if (pauseWatchdogStart === 0) pauseWatchdogStart = now;
          const pausedMs = now - pauseWatchdogStart;

          // Check if any overlay is actually visible
          const hasVisibleOverlay =
            document.getElementById('levelup-modal')?.style.display === 'flex' ||
            document.getElementById('settings-modal')?.style.display === 'flex' ||
            document.getElementById('options-menu')?.style.display === 'flex' ||
            document.getElementById('stats-modal')?.style.display === 'flex' ||
            document.getElementById('gear-screen')?.style.display === 'flex' ||
            document.getElementById('achievements-screen')?.style.display === 'flex' ||
            document.getElementById('credits-screen')?.style.display === 'flex' ||
            document.getElementById('attributes-screen')?.style.display === 'flex' ||
            document.getElementById('progression-shop')?.style.display === 'flex' ||
            document.getElementById('camp-screen')?.style.display === 'flex' ||
            document.querySelector('[data-quest-hall-overlay]') !== null ||
            document.getElementById('quest-popup-overlay') !== null ||
            document.getElementById('comic-info-overlay') !== null ||
            document.getElementById('comic-tutorial-modal')?.style.display === 'flex' ||
            document.getElementById('story-quest-modal')?.style.display === 'flex' ||
            windmillQuest.dialogueOpen ||
            (window.UICalibration && window.UICalibration.isActive);

          // Force-unpause after >10s (watchdog for stuck states, overrides levelUpPending).
          // For shorter pauses, also auto-unpause when levelUpPending is false and no
          // overlay is visible (levelUpPending is only a concern within the first ~800ms
          // before showUpgradeModal runs; by the 2s check the modal is already shown).
          const PAUSE_WATCHDOG_TIMEOUT_MS = 10000;
          const shouldForce = pausedMs > PAUSE_WATCHDOG_TIMEOUT_MS;
          if (!hasVisibleOverlay && (!levelUpPending || shouldForce)) {
            pauseOverlayCount = 0;
            window.pauseOverlayCount = 0;
            isPaused = false;
            window.isPaused = false;
            if (typeof _syncJoystickZone === 'function') _syncJoystickZone();
            if (shouldForce) {
              levelUpPending = false;
              console.warn(`[PauseWatchdog] Force-unpaused after ${pausedMs}ms - clearing stuck pause state`);
            }
            pauseWatchdogStart = 0;
          }
        } else {
          pauseWatchdogStart = 0; // Reset timer when not paused or game not active
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
      // Hide combat HUD (Rage Bar + Special Attacks) — not visible in main menu
      if (window.GameRageCombat) window.GameRageCombat.setCombatHUDVisible(false);
    }
    
    function hideMainMenu() {
      document.getElementById('main-menu').style.display = 'none';
    }

    // Helper to start a new run from anywhere (camp, main building, game over)
    function startGame() {
      // Deactivate 3D camp world when starting a game run
      if (window.CampWorld) window.CampWorld.exit();
      const campScreenEl = document.getElementById('camp-screen');
      if (campScreenEl) campScreenEl.classList.remove('camp-3d-mode');
      document.getElementById('main-menu').style.display = 'none';
      document.getElementById('camp-screen').style.display = 'none';
      document.getElementById('gameover-screen').style.display = 'none';
      // Restore game container and HUD layer hidden during camp mode
      const uiLayer = document.getElementById('ui-layer');
      if (uiLayer) uiLayer.style.visibility = '';
      const gameContainer = document.getElementById('game-container');
      if (gameContainer) gameContainer.style.display = 'block';
      resetGame();
      updateQuestTracker();

      // Show Benny's first-run welcome dialogue (once, non-blocking, auto-advances)
      if (window.DialogueSystem && !saveData.firstRunBennyShown) {
        saveData.firstRunBennyShown = true;
        if (typeof saveSaveData === 'function') saveSaveData();
        window.DialogueSystem.show(window.DialogueSystem.DIALOGUES.firstRunWelcome);
      }
      
      // Show first-run game loop tutorial BEFORE destructibles info
      const isVeryFirstRun = !saveData.firstRunTutorial || !saveData.firstRunTutorial.gameLoopShown;
      if (isVeryFirstRun) {
        if (!saveData.firstRunTutorial) saveData.firstRunTutorial = {};
        saveData.firstRunTutorial.gameLoopShown = true;
        saveSaveData();
        showComicInfoBox(
          '💧 WELCOME TO WATER DROP SURVIVOR',
          '<div style="text-align:left;line-height:1.9;font-size:15px;padding:4px 0">' +
          '<div style="font-size:17px;text-align:center;color:#5DADE2;margin-bottom:12px;"><b>YOUR FIRST RUN</b></div>' +
          '<p style="margin-bottom:10px;">This first run is to <b>get the feel of the character</b>.</p>' +
          '<p style="margin-bottom:10px;">⚠️ <b>You will die</b> — but don\'t worry!</p>' +
          '<p style="margin-bottom:10px;">This game has <b>deep RPG progression</b>. Every time you die, you return to <b>Camp</b> to permanently upgrade your character.</p>' +
          '<div style="background:rgba(255,215,0,0.1);border:2px solid rgba(255,215,0,0.4);border-radius:8px;padding:10px;margin-top:8px;font-size:14px;">' +
          '🎯 <b>Play until you die, and we\'ll start upgrading!</b>' +
          '</div>' +
          '</div>',
          'LET\'S GO! →',
          () => {
            // Show destructibles info as second popup
            showComicInfoBox(
              '💥 THIS WORLD CAN BE DESTROYED!',
              '<div style="text-align:left;line-height:1.8;font-size:15px;padding:4px 0">' +
              '<div style="margin-bottom:10px;font-size:17px;text-align:center;color:#FF4500"><b>Everything in this world can be destroyed!</b></div>' +
              '<div style="margin:6px 0">🚶 <b>Walk through</b> small objects (fences, crates, bushes) to smash them</div>' +
              '<div style="margin:6px 0">⚡ <b>DASH</b> into anything — trees, houses, structures — to smash them to pieces</div>' +
              '<div style="margin:6px 0">🔫 <b>Shoot</b> objects to destroy them from a distance</div>' +
              '<div style="margin-top:12px;font-size:13px;color:#666;text-align:center">Tip: Big objects block your path — only DASH breaks them!</div>' +
              '</div>',
              'START! →',
              () => { startCountdown(); }
            );
          }
        );
      } else {
      // Show first-run destructibles info box on second run only
      const isFirstRun = !saveData.shownDestructiblesInfo;
      if (isFirstRun) {
        saveData.shownDestructiblesInfo = true;
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
        // Re-show current quest reminder if player died and has an active quest
        const currentQuest = getCurrentQuest();
        const lastShownQuest = saveData.tutorialQuests && saveData.tutorialQuests.lastShownQuestReminder;
        if (currentQuest && currentQuest.id !== lastShownQuest && saveData.tutorialQuests.firstDeathShown) {
          saveData.tutorialQuests.lastShownQuestReminder = currentQuest.id;
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
      } // end else (not very first run)
    }
    window.startGame = startGame;
    
    // Cinematic round-start camera zoom-out (PR #70-71 enhancement)
    function playRoundStartCinematic(callback) {
      const origLeft = camera.left;
      const origRight = camera.right;
      const origTop = camera.top;
      const origBottom = camera.bottom;
      const origPosY = camera.position.y;

      // Zoom out: 4x wider frustum + raise camera
      camera.left = origLeft * 4;
      camera.right = origRight * 4;
      camera.top = origTop * 4;
      camera.bottom = origBottom * 4;
      camera.position.y = origPosY + 20;
      camera.updateProjectionMatrix();

      // Region label data
      const regions = [
        { label: '⚙️ Windmill',       wx: 60,  wy: 0, wz: 40  },
        { label: '⛰️ Montana',        wx: -50, wy: 0, wz: -50 },
        { label: '⚡ Eiffel Tower',    wx: 70,  wy: 0, wz: -60 },
        { label: '🗿 Stonehenge',      wx: -60, wy: 0, wz: 60  },
        { label: '🏠 Spawn',           wx: 0,   wy: 0, wz: 0   }
      ];

      // Create overlay container
      const overlay = document.createElement('div');
      overlay.id = 'cinematic-region-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:500;';
      document.body.appendChild(overlay);

      const labelEls = [];
      const vec = new THREE.Vector3();
      regions.forEach(r => {
        vec.set(r.wx, r.wy, r.wz);
        vec.project(camera);
        const sx = (vec.x * 0.5 + 0.5) * window.innerWidth;
        const sy = (-vec.y * 0.5 + 0.5) * window.innerHeight;

        const el = document.createElement('div');
        el.textContent = r.label;
        el.style.cssText =
          'position:absolute;color:#fff;font-weight:bold;font-size:16px;' +
          'text-shadow:0 0 6px rgba(0,0,0,0.9),0 2px 4px rgba(0,0,0,0.7);' +
          'pointer-events:none;transform:translate(-50%,-50%);' +
          'opacity:0;transition:opacity 0.4s ease;';
        el.style.left = sx + 'px';
        el.style.top = sy + 'px';
        overlay.appendChild(el);
        labelEls.push(el);
      });

      // Fade labels in
      requestAnimationFrame(() => {
        labelEls.forEach(el => { el.style.opacity = '1'; });
      });

      // After 2s hold, zoom back in over 1s
      setTimeout(() => {
        // Fade labels out
        labelEls.forEach(el => { el.style.opacity = '0'; });

        const zoomStart = performance.now();
        const zoomDuration = 1000;
        const startLeft = camera.left;
        const startRight = camera.right;
        const startTop = camera.top;
        const startBottom = camera.bottom;
        const startPosY = camera.position.y;

        function animateZoom() {
          const elapsed = performance.now() - zoomStart;
          const t = Math.min(elapsed / zoomDuration, 1);
          // Smooth ease-in-out
          const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

          camera.left = startLeft + (origLeft - startLeft) * ease;
          camera.right = startRight + (origRight - startRight) * ease;
          camera.top = startTop + (origTop - startTop) * ease;
          camera.bottom = startBottom + (origBottom - startBottom) * ease;
          camera.position.y = startPosY + (origPosY - startPosY) * ease;
          camera.updateProjectionMatrix();

          if (t < 1) {
            requestAnimationFrame(animateZoom);
          } else {
            // Restore exact original values
            camera.left = origLeft;
            camera.right = origRight;
            camera.top = origTop;
            camera.bottom = origBottom;
            camera.position.y = origPosY;
            camera.updateProjectionMatrix();

            // Clean up DOM
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);

            callback();
          }
        }
        requestAnimationFrame(animateZoom);
      }, 2000);
    }

    // Countdown system (PR #70-71)
    function startCountdown() {
      playRoundStartCinematic(() => {
        countdownActive = true;
        countdownStep = 0;
        countdownTimer = 0;
        // Trigger fountain/lightning spawn sequence
        if (window.SpawnSequence && player) window.SpawnSequence.play(player.mesh);
        showCountdownMessage(0);
      });
    }
    
    function showCountdownMessage(step) {
      if (step >= countdownMessages.length) {
        endCountdown();
        return;
      }
      
      // Use Stat Log for countdown messages
      showStatChange(countdownMessages[step]);

      // Show in dedicated SSB countdown row with urgency styling
      if (typeof _ssbShowCountdown === 'function') {
        _ssbShowCountdown(countdownMessages[step], step);
      }
      
      const duration = step === 0 ? 1500 : 1000;
      
      setTimeout(() => {
        countdownStep++;
        if (countdownStep < countdownMessages.length) {
          showCountdownMessage(countdownStep);
        } else {
          endCountdown();
        }
      }, duration);
    }
    
    function endCountdown() {
      countdownActive = false;

      // Keep SSB countdown visible — it will transition to showing elapsed game time
      // via _ssbUpdateContext() which runs every frame. No need to hide it.
      
      // Ensure game properly unpauses (use helper functions to sync window variables)
      setGamePaused(false);
      setGameActive(true);
      gameStartTime = Date.now();
      console.log('[Countdown] Game started - isPaused:', isPaused, 'isGameActive:', isGameActive);

      // Show combat HUD (Rage Bar + Special Attacks) now that gameplay is active
      if (window.GameRageCombat) window.GameRageCombat.setCombatHUDVisible(true);

      // Remove camp-mode from chat tab
      const chatTab = document.getElementById('ai-chat-tab');
      if (chatTab) chatTab.classList.remove('camp-mode');

      // Show chat tab reminder on first run and every 5th run
      const runs = saveData.totalRuns || 0;
      if (runs === 0 || runs % 5 === 0) {
        setTimeout(() => {
          showChatReminderBubble('Need auto-aim? Ask me here! 💬', false);
        }, 4000);
      }
    }
    
    // --- LONG PRESS DETAIL POPUP ---
    function showBuildingDetail(title, description) {
      let popup = document.getElementById('building-detail-popup');
      if (!popup) {
        popup = document.createElement('div');
        popup.id = 'building-detail-popup';
        popup.className = 'camp-menu-box';
        popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);max-width:320px;width:90%;z-index:200;text-align:center;';
        document.body.appendChild(popup);
        popup.addEventListener('click', () => { popup.style.display = 'none'; });
      }
      popup.innerHTML = `
        <div style="font-size:20px;color:#FFD700;font-weight:bold;margin-bottom:10px;">${title}</div>
        <div style="font-size:14px;color:#c9d1d9;line-height:1.6;">${description}</div>
        <div style="font-size:11px;color:#888;margin-top:12px;">Tap to close</div>
      `;
      popup.style.display = 'block';
    }

    function addLongPressDetail(element, title, description) {
      let holdTimer = null;
      const HOLD_DURATION = 500;
      const startHold = () => {
        if (holdTimer) return;
        holdTimer = setTimeout(() => { holdTimer = null; showBuildingDetail(title, description); }, HOLD_DURATION);
      };
      const cancelHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };
      element.addEventListener('pointerdown', () => startHold());
      element.addEventListener('pointerup', cancelHold);
      element.addEventListener('pointerleave', cancelHold);
      element.addEventListener('pointercancel', cancelHold);
    }

    // ============================================================
    // CAMPFIRE KITCHEN — Cook meals from harvested ingredients
    // ============================================================
    function showCampfireKitchen() {
      // Progress quest30 if active
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest30_buildCampfire') {
        progressTutorialQuest('quest30_buildCampfire', true);
        saveSaveData();
      }

      const existing = document.getElementById('campfire-kitchen-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'campfire-kitchen-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:500;display:flex;flex-direction:column;align-items:center;padding:20px 16px;box-sizing:border-box;overflow-y:auto;';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;width:100%;max-width:520px;margin-bottom:12px;';
      header.innerHTML = '<div style="font-family:\'Bangers\',cursive;font-size:24px;color:#FF8C00;letter-spacing:2px;text-shadow:0 0 10px rgba(255,140,0,0.5);">🍳 CAMPFIRE KITCHEN</div>';
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'background:#2a2a2a;border:2px solid #666;border-radius:50%;width:38px;height:38px;color:#fff;font-size:18px;cursor:pointer;font-family:"Bangers",cursive;';
      closeBtn.onclick = () => overlay.remove();
      header.appendChild(closeBtn);
      overlay.appendChild(header);

      const subtitle = document.createElement('div');
      subtitle.style.cssText = 'color:#888;font-size:11px;margin-bottom:16px;text-align:center;letter-spacing:1.5px;max-width:400px;text-transform:uppercase;';
      subtitle.textContent = 'Cook meals from harvested ingredients for healing & buffs';
      overlay.appendChild(subtitle);

      const res = saveData.resources || {};
      const RECIPES = window.GameWorld && window.GameWorld.COOKING_RECIPES ? window.GameWorld.COOKING_RECIPES : {};

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:1fr;gap:10px;width:100%;max-width:520px;';

      for (const [recipeId, recipe] of Object.entries(RECIPES)) {
        const card = document.createElement('div');
        const canCook = Object.entries(recipe.ingredients).every(([k, v]) => (res[k] || 0) >= v);
        const cooked = saveData.cookedMeals ? (saveData.cookedMeals[recipeId] || 0) : 0;

        const ingredientList = Object.entries(recipe.ingredients).map(([k, v]) => {
          const has = (res[k] || 0) >= v;
          const rt = window.GameHarvesting && window.GameHarvesting.RESOURCE_TYPES ? window.GameHarvesting.RESOURCE_TYPES[k] : null;
          return '<span style="color:' + (has ? '#0f0' : '#f66') + ';font-size:11px;">' + (rt ? rt.icon : k) + 'x' + v + '</span>';
        }).join(' ');

        card.style.cssText = 'background:rgba(255,140,0,0.08);border:1px solid ' + (canCook ? '#FF8C00' : '#444') + ';border-radius:10px;padding:14px;cursor:' + (canCook ? 'pointer' : 'default') + ';opacity:' + (canCook ? '1' : '0.6') + ';';
        card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;"><div><span style="font-size:24px;">' + recipe.icon + '</span> <b style="color:#FFD700;">' + recipe.name + '</b></div><div style="color:#888;font-size:11px;">x' + cooked + ' cooked</div></div><div style="color:#aaa;font-size:12px;margin:6px 0;">' + recipe.description + '</div><div style="display:flex;gap:6px;flex-wrap:wrap;">' + ingredientList + '</div>';

        if (canCook) {
          card.onclick = () => {
            for (const [k, v] of Object.entries(recipe.ingredients)) {
              res[k] = (res[k] || 0) - v;
            }
            if (!saveData.cookedMeals) saveData.cookedMeals = {};
            saveData.cookedMeals[recipeId] = (saveData.cookedMeals[recipeId] || 0) + 1;
            saveSaveData();
            if (typeof showStatChange === 'function') showStatChange(recipe.icon + ' ' + recipe.name + ' Cooked!');
            if (typeof playSound === 'function') playSound('collect');
            overlay.remove();
            showCampfireKitchen();
          };
        }
        grid.appendChild(card);
      }

      overlay.appendChild(grid);
      document.body.appendChild(overlay);
    }

    // ============================================================
    // WORKSHOP — Gathering Skill Tree
    // ============================================================
    function showWorkshop() {
      const existing = document.getElementById('workshop-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'workshop-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:500;display:flex;flex-direction:column;align-items:center;padding:20px 16px;box-sizing:border-box;overflow-y:auto;';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;width:100%;max-width:520px;margin-bottom:12px;';
      header.innerHTML = '<div style="font-family:\'Bangers\',cursive;font-size:24px;color:#8B4513;letter-spacing:2px;text-shadow:0 0 10px rgba(139,69,19,0.5);">🔧 WORKSHOP</div>';
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'background:#2a2a2a;border:2px solid #666;border-radius:50%;width:38px;height:38px;color:#fff;font-size:18px;cursor:pointer;font-family:"Bangers",cursive;';
      closeBtn.onclick = () => overlay.remove();
      header.appendChild(closeBtn);
      overlay.appendChild(header);

      const subtitle = document.createElement('div');
      subtitle.style.cssText = 'color:#888;font-size:11px;margin-bottom:16px;text-align:center;letter-spacing:1.5px;max-width:400px;text-transform:uppercase;';
      subtitle.textContent = 'Upgrade gathering skills — harvest faster, yield more resources';
      overlay.appendChild(subtitle);

      // Gold display
      const goldDiv = document.createElement('div');
      goldDiv.style.cssText = 'color:#FFD700;font-size:16px;font-weight:bold;margin-bottom:14px;font-family:"Bangers",cursive;letter-spacing:1px;';
      goldDiv.textContent = '💰 Gold: ' + (saveData.gold || 0);
      overlay.appendChild(goldDiv);

      const GATHERING_SKILLS = window.GameHarvesting && window.GameHarvesting.GATHERING_SKILLS ? window.GameHarvesting.GATHERING_SKILLS : {};
      const skills = (saveData.gatheringSkills) || {};

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:1fr;gap:10px;width:100%;max-width:520px;';

      for (const [key, def] of Object.entries(GATHERING_SKILLS)) {
        const level = skills[key] || 0;
        const maxed = level >= def.maxLevel;
        const cost = 50;
        const canAfford = (saveData.gold || 0) >= cost;

        const card = document.createElement('div');
        card.style.cssText = 'background:rgba(139,69,19,0.08);border:1px solid ' + (maxed ? '#FFD700' : canAfford ? '#8B4513' : '#444') + ';border-radius:10px;padding:14px;cursor:' + (!maxed && canAfford ? 'pointer' : 'default') + ';opacity:' + (maxed ? '0.8' : canAfford ? '1' : '0.5') + ';';

        // Level pips
        let pips = '';
        for (let i = 0; i < def.maxLevel; i++) {
          pips += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin:0 2px;background:' + (i < level ? '#FFD700' : '#333') + ';border:1px solid #555;"></span>';
        }

        card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<div><span style="font-size:22px;">' + def.icon + '</span> <b style="color:#f0d890;">' + def.label + '</b></div>' +
          '<span style="color:' + (maxed ? '#FFD700' : '#aaa') + ';font-size:12px;">' + (maxed ? 'MAX' : 'Lv ' + level + '/' + def.maxLevel) + '</span></div>' +
          '<div style="color:#aaa;font-size:12px;margin:6px 0;">' + def.description + '</div>' +
          '<div style="margin:6px 0;">' + pips + '</div>' +
          (!maxed ? '<div style="color:' + (canAfford ? '#FFD700' : '#f66') + ';font-size:11px;">Cost: 💰 ' + cost + ' gold</div>' : '');

        if (!maxed && canAfford) {
          card.onclick = () => {
            if (window.GameHarvesting && window.GameHarvesting.upgradeGatheringSkill) {
              if (window.GameHarvesting.upgradeGatheringSkill(key)) {
                if (typeof saveSaveData === 'function') saveSaveData();
                if (typeof playSound === 'function') playSound('collect');
                if (typeof showStatChange === 'function') showStatChange(def.icon + ' ' + def.label + ' upgraded to Lv ' + ((skills[key] || 0) + 1) + '!');
                overlay.remove();
                showWorkshop(); // Re-render
              }
            }
          };
        }
        grid.appendChild(card);
      }

      overlay.appendChild(grid);
      document.body.appendChild(overlay);
    }

    // ============================================================
    // WEAPONSMITH — Craft weapons from gathered resources
    // ============================================================
    function showWeaponsmith() {
      // Progress quest31 if active
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest31_buildWeaponsmith') {
        progressTutorialQuest('quest31_buildWeaponsmith', true);
        saveSaveData();
      }

      const existing = document.getElementById('weaponsmith-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'weaponsmith-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:500;display:flex;flex-direction:column;align-items:center;padding:20px 16px;box-sizing:border-box;overflow-y:auto;';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;width:100%;max-width:520px;margin-bottom:12px;';
      header.innerHTML = '<div style="font-family:\'Bangers\',cursive;font-size:24px;color:#C0C0C0;letter-spacing:2px;text-shadow:0 0 10px rgba(192,192,192,0.5);">⚒️ WEAPONSMITH</div>';
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'background:#2a2a2a;border:2px solid #666;border-radius:50%;width:38px;height:38px;color:#fff;font-size:18px;cursor:pointer;font-family:"Bangers",cursive;';
      closeBtn.onclick = () => overlay.remove();
      header.appendChild(closeBtn);
      overlay.appendChild(header);

      const subtitle = document.createElement('div');
      subtitle.style.cssText = 'color:#888;font-size:11px;margin-bottom:16px;text-align:center;letter-spacing:1.5px;max-width:400px;text-transform:uppercase;';
      subtitle.textContent = 'Craft weapons from gathered resources — each with unique stats & effects';
      overlay.appendChild(subtitle);

      const res = saveData.resources || {};
      const WEAPONS = window.GameWorld && window.GameWorld.WEAPON_CRAFTS ? window.GameWorld.WEAPON_CRAFTS : {};

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:1fr;gap:10px;width:100%;max-width:520px;';

      for (const [weaponId, weapon] of Object.entries(WEAPONS)) {
        const card = document.createElement('div');
        const canCraft = Object.entries(weapon.cost).every(([k, v]) => (res[k] || 0) >= v);
        const owned = saveData.craftedWeapons ? saveData.craftedWeapons[weaponId] : false;

        const costList = Object.entries(weapon.cost).map(([k, v]) => {
          const has = (res[k] || 0) >= v;
          const rt = window.GameHarvesting && window.GameHarvesting.RESOURCE_TYPES ? window.GameHarvesting.RESOURCE_TYPES[k] : null;
          return '<span style="color:' + (has ? '#0f0' : '#f66') + ';font-size:11px;">' + (rt ? rt.icon : k) + 'x' + v + '</span>';
        }).join(' ');

        const statsHTML = Object.entries(weapon.stats).map(([k, v]) => {
          if (k === 'projectile') return '';
          return '<span style="color:#4FC3F7;font-size:11px;">' + k + ': ' + v + '</span>';
        }).filter(Boolean).join(' · ');

        const rarityColors = { common: '#aaa', rare: '#4FC3F7', epic: '#AA44FF' };
        const rarityColor = rarityColors[weapon.rarity] || '#aaa';

        card.style.cssText = 'background:rgba(192,192,192,0.06);border:1px solid ' + (owned ? '#00FF64' : canCraft ? rarityColor : '#444') + ';border-radius:10px;padding:14px;cursor:' + (canCraft && !owned ? 'pointer' : 'default') + ';opacity:' + (owned ? '0.7' : canCraft ? '1' : '0.5') + ';';
        card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;"><div><span style="font-size:24px;">' + weapon.icon + '</span> <b style="color:' + rarityColor + ';">' + weapon.name + '</b> <span style="color:#666;font-size:10px;text-transform:uppercase;">' + weapon.type + '</span></div>' + (owned ? '<span style="color:#00FF64;font-size:12px;">✅ Owned</span>' : '') + '</div><div style="color:#aaa;font-size:12px;margin:6px 0;">' + weapon.description + '</div><div style="margin-bottom:4px;">' + statsHTML + '</div><div style="display:flex;gap:6px;flex-wrap:wrap;">' + costList + '</div>';

        if (canCraft && !owned) {
          card.onclick = () => {
            for (const [k, v] of Object.entries(weapon.cost)) {
              res[k] = (res[k] || 0) - v;
            }
            if (!saveData.craftedWeapons) saveData.craftedWeapons = {};
            saveData.craftedWeapons[weaponId] = true;
            // Give as inventory item
            saveData.inventory.push({ id: weaponId, name: weapon.name, type: 'weapon', rarity: weapon.rarity, stats: weapon.stats, description: weapon.description });
            // Progress quest32 if crafting tranquilizer
            if (weaponId === 'tranquilizerRifle' && saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest32_craftTranquilizer') {
              progressTutorialQuest('quest32_craftTranquilizer', true);
            }
            saveSaveData();
            if (typeof showStatChange === 'function') showStatChange(weapon.icon + ' ' + weapon.name + ' Crafted!');
            if (typeof playSound === 'function') playSound('collect');
            overlay.remove();
            showWeaponsmith();
          };
        }
        grid.appendChild(card);
      }

      overlay.appendChild(grid);
      document.body.appendChild(overlay);
    }

    // ============================================================
    // SPECIAL ATTACKS PANEL — Skill Tree for Special Attacks
    // ============================================================
    function showSpecialAttacksPanel() {
      if (!window.GameRageCombat) return;
      const allAttacks = window.GameRageCombat.ALL_SPECIAL_ATTACKS;

      // Pre-compute branch groupings once (allAttacks is static)
      const branchMap = {};
      for (const sa of allAttacks) {
        const b = sa.branch || 'start';
        if (!branchMap[b]) branchMap[b] = [];
        branchMap[b].push(sa);
      }
      for (const b of Object.keys(branchMap)) {
        branchMap[b].sort((a, b2) => (a.branchOrder || 0) - (b2.branchOrder || 0));
      }

      // Remove any existing panel before creating a new one
      const existing = document.getElementById('special-attacks-panel-overlay');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

      const overlay = document.createElement('div');
      overlay.id = 'special-attacks-panel-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:500;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:16px 8px;box-sizing:border-box;';

      const panel = document.createElement('div');
      panel.style.cssText = 'background:linear-gradient(135deg,#0d0d1a,#1a0d2e);border:3px solid #FF4400;border-radius:14px;padding:20px;max-width:min(96vw,680px);width:100%;color:#fff;font-family:"Bangers",cursive;box-shadow:0 0 40px rgba(255,68,0,0.5);position:relative;';

      const pts = saveData.specialAtkPoints || 0;
      const knifeNode = (saveData.skillTree || {})['specialKnifeTakedown'] || { level: 0, maxLevel: 3 };
      const knifeUnlocked = (knifeNode.level || 0) > 0;
      const chosenBranch = saveData.specialBranch || null;

      // Header
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;';
      header.innerHTML = `<div style="font-size:24px;letter-spacing:2px;color:#FF4400;">⚡ SPECIAL ATTACKS</div><div style="font-size:15px;color:#FFD700;">SAP: ${pts}</div>`;
      panel.appendChild(header);

      const subtitle = document.createElement('div');
      subtitle.style.cssText = 'font-size:11px;color:#aaa;font-family:"M PLUS Rounded 1c",sans-serif;margin-bottom:14px;';
      subtitle.textContent = 'Earn Special Atk Points (SAP) from quests. Unlock the starting attack, then choose a branch path.';
      panel.appendChild(subtitle);

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.1);border:1px solid #888;color:#fff;padding:4px 12px;border-radius:6px;cursor:pointer;font-family:"Bangers",cursive;font-size:14px;';
      closeBtn.addEventListener('click', () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); });
      panel.appendChild(closeBtn);

      // Helper: render a single attack node card
      function renderAttackNode(sa) {
        const stNode = (saveData.skillTree || {})[sa.skillTreeId] || { level: 0, maxLevel: 3 };
        const currentLvl = stNode.level || 0;
        const maxLvl = stNode.maxLevel || 3;
        const isUnlocked = currentLvl > 0;

        // Branch restriction: attacks from wrong branch are not available
        const branchOk = sa.branch === 'start' || !chosenBranch || sa.branch === chosenBranch;

        // Availability: starting attacks always available; others need branch predecessor AND branch chosen
        const sameBranch = branchMap[sa.branch || 'start'] || [];
        const prevInBranch = sameBranch.find(a => a.branchOrder === sa.branchOrder - 1);
        const prevNode = prevInBranch ? ((saveData.skillTree || {})[prevInBranch.skillTreeId] || { level: 0 }) : null;
        const isAvailable = branchOk && (sa.isStartingAttack || (knifeUnlocked && (!prevInBranch || prevNode.level > 0)));

        const UNLOCK_COST = 1;
        const UPGRADE_COST = 1;
        const canAfford = pts >= (isUnlocked ? UPGRADE_COST : UNLOCK_COST);
        const canUpgrade = isUnlocked && currentLvl < maxLvl && canAfford;
        const canUnlock = !isUnlocked && isAvailable && canAfford;

        const node = document.createElement('div');
        node.style.cssText = `background:rgba(255,255,255,0.04);border:2px solid ${isUnlocked ? '#FF4400' : (isAvailable ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)')};border-radius:10px;padding:10px 8px;text-align:center;opacity:${isAvailable || isUnlocked ? '1' : '0.4'};flex:0 0 auto;width:140px;`;

        const upgradeNext = sa.upgrades && sa.upgrades.find(u => u.level === currentLvl + 1);
        const bonusText = upgradeNext && upgradeNext.bonus ? `<div style="font-size:9px;color:#aaa;font-family:Arial,sans-serif;margin-top:2px;">Next: ${upgradeNext.bonus}</div>` : '';
        const upgrade = sa.upgrades && sa.upgrades.find(u => u.level === Math.max(1, currentLvl));

        node.innerHTML = `
          <div style="font-size:26px;margin-bottom:3px;">${sa.icon}</div>
          <div style="font-size:12px;letter-spacing:1px;color:${isUnlocked ? '#FF8844' : '#DDD'};">${sa.name}</div>
          <div style="font-size:9px;color:#888;font-family:Arial,sans-serif;margin:2px 0;">${sa.description}</div>
          <div style="font-size:10px;color:#FFD700;margin:3px 0;">Lv ${currentLvl}/${maxLvl}</div>
          ${bonusText}
          <div style="font-size:9px;color:#aaa;font-family:Arial,sans-serif;">CD: ${((upgrade && upgrade.cooldownMs) || sa.cooldownMs) / 1000}s</div>
        `;

        if (canUnlock || canUpgrade) {
          const btn = document.createElement('button');
          btn.textContent = canUnlock ? `🔓 Unlock (${UNLOCK_COST})` : `⬆️ Upgrade (${UPGRADE_COST})`;
          btn.style.cssText = 'margin-top:7px;width:100%;padding:4px;background:linear-gradient(135deg,#FF4400,#FF8800);border:none;color:#fff;border-radius:6px;cursor:pointer;font-family:"Bangers",cursive;font-size:11px;';
          btn.addEventListener('click', () => {
            const cost = canUnlock ? UNLOCK_COST : UPGRADE_COST;
            if ((saveData.specialAtkPoints || 0) < cost) return;
            saveData.specialAtkPoints -= cost;
            if (!saveData.skillTree[sa.skillTreeId]) saveData.skillTree[sa.skillTreeId] = { level: 0, maxLevel: maxLvl };
            saveData.skillTree[sa.skillTreeId].level = Math.min(maxLvl, (saveData.skillTree[sa.skillTreeId].level || 0) + 1);
            saveData.skillTree[sa.skillTreeId].unlocked = true;
            saveSaveData();
            if (window.GameRageCombat) window.GameRageCombat.refreshLoadout(saveData);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            showSpecialAttacksPanel();
          });
          node.appendChild(btn);
        } else if (currentLvl >= maxLvl) {
          const t = document.createElement('div');
          t.style.cssText = 'margin-top:7px;color:#FFD700;font-size:11px;';
          t.textContent = '✨ MAX';
          node.appendChild(t);
        } else if (!isAvailable) {
          const t = document.createElement('div');
          t.style.cssText = 'margin-top:7px;color:#555;font-size:10px;';
          t.textContent = '🔒 Locked';
          node.appendChild(t);
        }

        // Tap = info preview; long press = unlock/upgrade (only if available)
        node.style.cursor = 'pointer';
        node.style.userSelect = 'none';
        const upgrade2 = sa.upgrades && sa.upgrades.find(u => u.level === Math.max(1, currentLvl));
        const cdSec = (((upgrade2 && upgrade2.cooldownMs) || sa.cooldownMs) / 1000) + 's';
        const previewStats = {};
        if (sa.damage) previewStats['Damage'] = sa.damage;
        if (sa.cooldownMs) previewStats['Cooldown'] = cdSec;
        if (currentLvl > 0) previewStats['Level'] = currentLvl + '/' + maxLvl;

        function doSpecialPreview() {
          if (typeof showItemInfoPanel !== 'function') return;
          const actionLbl = canUnlock ? ('🔓 Unlock (1 SAP)') : (canUpgrade ? '⬆️ Upgrade (1 SAP)' : null);
          showItemInfoPanel(
            {
              name: sa.name,
              rarity: isUnlocked ? (currentLvl >= maxLvl ? 'legendary' : 'epic') : 'rare',
              icon: sa.icon,
              stats: previewStats,
              description: sa.description + (sa.upgrades && sa.upgrades[0] ? '\n\n' + sa.upgrades[0].bonus : ''),
              requirements: 'Cooldown: ' + cdSec + ' · Level ' + currentLvl + '/' + maxLvl
            },
            (canUnlock || canUpgrade) ? function() {
              const cost = 1;
              if ((saveData.specialAtkPoints || 0) < cost) return;
              saveData.specialAtkPoints -= cost;
              if (!saveData.skillTree[sa.skillTreeId]) saveData.skillTree[sa.skillTreeId] = { level: 0, maxLevel: maxLvl };
              saveData.skillTree[sa.skillTreeId].level = Math.min(maxLvl, (saveData.skillTree[sa.skillTreeId].level || 0) + 1);
              saveData.skillTree[sa.skillTreeId].unlocked = true;
              saveSaveData();
              if (window.GameRageCombat) window.GameRageCombat.refreshLoadout(saveData);
              if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
              showSpecialAttacksPanel();
            } : null,
            { equipLabel: actionLbl || '⬆️ Upgrade', hint: 'Long press card to unlock/upgrade directly.' }
          );
        }
        function doSpecialAction() {
          if (!canUnlock && !canUpgrade) { doSpecialPreview(); return; }
          const cost = 1;
          if ((saveData.specialAtkPoints || 0) < cost) return;
          saveData.specialAtkPoints -= cost;
          if (!saveData.skillTree[sa.skillTreeId]) saveData.skillTree[sa.skillTreeId] = { level: 0, maxLevel: maxLvl };
          saveData.skillTree[sa.skillTreeId].level = Math.min(maxLvl, (saveData.skillTree[sa.skillTreeId].level || 0) + 1);
          saveData.skillTree[sa.skillTreeId].unlocked = true;
          saveSaveData();
          if (window.GameRageCombat) window.GameRageCombat.refreshLoadout(saveData);
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          showSpecialAttacksPanel();
        }

        if (typeof attachPressHandler === 'function') {
          attachPressHandler(node, doSpecialPreview, doSpecialAction);
        } else {
          node.addEventListener('click', doSpecialPreview);
        }

        return node;
      }

      // ── STARTING ATTACK ────────────────────────────────────────
      const startSection = document.createElement('div');
      startSection.style.cssText = 'display:flex;flex-direction:column;align-items:center;margin-bottom:16px;';
      const startLabel = document.createElement('div');
      startLabel.style.cssText = 'font-size:12px;color:#aaa;letter-spacing:2px;margin-bottom:8px;text-transform:uppercase;';
      startLabel.textContent = '— Starting Attack —';
      startSection.appendChild(startLabel);
      const startingAttacks = branchMap['start'] || [];
      startingAttacks.forEach(sa => startSection.appendChild(renderAttackNode(sa)));
      panel.appendChild(startSection);

      if (knifeUnlocked) {
        // Branch divider
        const divider = document.createElement('div');
        divider.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:14px;';
        const dividerLabel = chosenBranch
          ? (chosenBranch === 'upper' ? '⚔️ PATH: OFFENSIVE' : '🛡️ PATH: CONTROL')
          : 'CHOOSE YOUR PATH';
        divider.innerHTML = `
          <div style="flex:1;height:2px;background:linear-gradient(to right,transparent,rgba(255,100,0,0.5));"></div>
          <div style="font-size:12px;color:#FF8844;letter-spacing:1px;">${dividerLabel}</div>
          <div style="flex:1;height:2px;background:linear-gradient(to left,transparent,rgba(68,150,255,0.5));"></div>
        `;
        panel.appendChild(divider);

        // If no branch chosen yet, show branch selector buttons
        if (!chosenBranch) {
          const branchPicker = document.createElement('div');
          branchPicker.style.cssText = 'display:flex;gap:12px;justify-content:center;margin-bottom:16px;';
          const makePickBtn = (branch, label, color, desc) => {
            const btn = document.createElement('button');
            btn.style.cssText = `flex:1;max-width:220px;padding:14px 10px;background:linear-gradient(135deg,${color}33,${color}11);border:2px solid ${color};border-radius:10px;color:${color};font-family:"Bangers",cursive;font-size:14px;cursor:pointer;letter-spacing:1px;`;
            btn.innerHTML = `${label}<div style="font-size:10px;color:#aaa;font-family:Arial,sans-serif;margin-top:4px;font-weight:normal;">${desc}</div>`;
            btn.addEventListener('click', () => {
              saveData.specialBranch = branch;
              saveSaveData();
              if (window.GameRageCombat) window.GameRageCombat.refreshLoadout(saveData);
              if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
              showSpecialAttacksPanel();
            });
            return btn;
          };
          branchPicker.appendChild(makePickBtn('upper', '⚔️ Upper Path', '#FF6600', 'Offensive — Shockwave, Death Blossom, Thunder Strike…'));
          branchPicker.appendChild(makePickBtn('lower', '🛡️ Lower Path', '#4488FF', 'Control — Frozen Storm, Inferno Ring, Void Pulse…'));
          panel.appendChild(branchPicker);
        } else {
          // Show chosen branch + a small switch button
          const switchRow = document.createElement('div');
          switchRow.style.cssText = 'text-align:right;margin-bottom:10px;';
          const switchBtn = document.createElement('button');
          switchBtn.textContent = '🔀 Switch Branch';
          switchBtn.style.cssText = 'background:rgba(255,255,255,0.07);border:1px solid #555;color:#aaa;padding:4px 10px;border-radius:6px;cursor:pointer;font-family:Arial,sans-serif;font-size:11px;';
          switchBtn.title = 'Reset your branch choice (you will lose access to current branch unlocks)';
          switchBtn.addEventListener('click', () => {
            if (!confirm('Switch branch? You will need to re-select your path.')) return;
            saveData.specialBranch = null;
            saveSaveData();
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            showSpecialAttacksPanel();
          });
          switchRow.appendChild(switchBtn);
          panel.appendChild(switchRow);
        }

        // ── BRANCH ROWS ────────────────────────────────────────────
        const branchesContainer = document.createElement('div');
        branchesContainer.style.cssText = 'display:flex;flex-direction:column;gap:16px;';

        function renderBranchRow(branchId, label, color) {
          const isChosen = !chosenBranch || chosenBranch === branchId;
          const row = document.createElement('div');
          row.style.cssText = `border:2px solid ${isChosen ? color + '66' : '#33333366'};border-radius:10px;padding:10px;background:${isChosen ? color + '08' : 'rgba(0,0,0,0.2)'};opacity:${isChosen ? '1' : '0.4'};`;
          const rowLabel = document.createElement('div');
          rowLabel.style.cssText = `font-size:13px;color:${isChosen ? color : '#666'};letter-spacing:1.5px;margin-bottom:8px;`;
          rowLabel.textContent = label + (isChosen && chosenBranch ? ' ✓ CHOSEN' : (!chosenBranch ? ' — click to choose' : ' 🔒 Not chosen'));
          row.appendChild(rowLabel);
          if (isChosen) {
            const nodesRow = document.createElement('div');
            nodesRow.style.cssText = 'display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;';
            const branchAttacks = branchMap[branchId] || [];
            branchAttacks.forEach((sa, i) => {
              if (i > 0) {
                const arrow = document.createElement('div');
                arrow.style.cssText = 'display:flex;align-items:center;color:#666;font-size:18px;flex-shrink:0;';
                arrow.textContent = '→';
                nodesRow.appendChild(arrow);
              }
              nodesRow.appendChild(renderAttackNode(sa));
            });
            row.appendChild(nodesRow);
          }
          return row;
        }

        branchesContainer.appendChild(renderBranchRow('upper', '⚔️ Upper Branch — Offensive', '#FF6600'));
        branchesContainer.appendChild(renderBranchRow('lower', '🛡️ Lower Branch — Control', '#4488FF'));
        panel.appendChild(branchesContainer);
      } else {
        const hint = document.createElement('div');
        hint.style.cssText = 'text-align:center;color:#888;font-size:12px;font-family:"M PLUS Rounded 1c",sans-serif;margin-top:4px;';
        hint.textContent = 'Unlock the Knife Takedown to reveal two branch paths!';
        panel.appendChild(hint);
      }

      overlay.appendChild(panel);
      document.body.appendChild(overlay);
    }

    // ============================================================
    // CAMP BOARD — Fast Access Master Menu
    // ============================================================
    function showCampBoardMenu() {
      // Progress quest21 if active
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest21_useCampBoard') {
        progressTutorialQuest('quest21_useCampBoard', true);
        saveSaveData();
      }

      // Remove existing overlay if any
      const existing = document.getElementById('camp-board-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'camp-board-overlay';
      overlay.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
        'background:rgba(0,0,0,0.88)', 'z-index:500',
        'display:flex', 'flex-direction:column', 'align-items:center',
        'justify-content:flex-start', 'padding:20px 16px', 'box-sizing:border-box', 'overflow-y:auto',
      ].join(';');

      // Header row
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;width:100%;max-width:520px;margin-bottom:8px;';
      header.innerHTML = '<div style="font-family:\'Bangers\',cursive;font-size:26px;color:#FFD700;letter-spacing:2px;text-shadow:0 0 10px rgba(255,215,0,0.5);">📋 CAMP BOARD</div>';
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'background:#2a2a2a;border:2px solid #666;border-radius:50%;width:38px;height:38px;color:#fff;font-size:18px;cursor:pointer;font-family:"Bangers",cursive;flex-shrink:0;';
      closeBtn.onclick = () => overlay.remove();
      header.appendChild(closeBtn);
      overlay.appendChild(header);

      const subtitle = document.createElement('div');
      subtitle.style.cssText = 'color:#888;font-size:11px;margin-bottom:18px;text-align:center;letter-spacing:1.5px;max-width:400px;text-transform:uppercase;';
      subtitle.textContent = 'Fast access — open any camp feature';
      overlay.appendChild(subtitle);

      // Building grid
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:10px;width:100%;max-width:520px;';

      // Map each building to its open action
      const buildingActions = {
        questMission:        () => { overlay.remove(); showQuestHall(); },
        skillTree:           () => { overlay.remove(); document.getElementById('camp-skills-tab').click(); },
        armory:              () => { overlay.remove(); try { updateGearScreen(); } catch(e) {} document.getElementById('gear-screen').style.display = 'flex'; },
        trainingHall:        () => { overlay.remove(); document.getElementById('camp-training-tab').click(); },
        forge:               () => { overlay.remove(); showProgressionShop(); },
        companionHouse:      () => { overlay.remove(); showCompanionHouse(); },
        achievementBuilding: () => {
          overlay.remove();
          document.getElementById('camp-screen').style.display = 'none';
          const achScreen = document.getElementById('achievements-screen');
          if (achScreen) {
            achScreen.style.display = 'flex';
            const achContent = document.getElementById('achievements-content');
            if (achContent && typeof renderAchievementsContent === 'function') renderAchievementsContent(achContent);
          }
        },
        inventory:           () => { overlay.remove(); showInventoryScreen(); },
        accountBuilding:     () => { overlay.remove(); showAccountSection(); },
        idleMenu:            () => { overlay.remove(); showIdleSection(); },
        characterVisuals:    () => {
          overlay.remove();
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest16_visitCharVisuals') {
            progressTutorialQuest('quest16_visitCharVisuals', true);
            saveSaveData();
          }
          document.getElementById('camp-screen').style.display = 'none';
          openCharacterVisuals();
        },
        codex:               () => {
          overlay.remove();
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest17_visitCodex') {
            progressTutorialQuest('quest17_visitCodex', true);
            saveSaveData();
          }
          document.getElementById('camp-screen').style.display = 'none';
          openCodex();
        },
        specialAttacks:      () => {
          overlay.remove();
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest3b_useSpecialAttacks') {
            progressTutorialQuest('quest3b_useSpecialAttacks', true);
            saveSaveData();
          }
          showSpecialAttacksPanel();
        },
        warehouse:           () => {
          overlay.remove();
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest7b_useWarehouse') {
            progressTutorialQuest('quest7b_useWarehouse', true);
            saveSaveData();
          }
          showInventoryScreen();
        },
        tavern:              () => {
          overlay.remove();
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest9b_visitTavern') {
            progressTutorialQuest('quest9b_visitTavern', true);
            saveSaveData();
          }
          if (typeof showExpeditionsMenu === 'function') showExpeditionsMenu(); else showQuestHall();
        },
        shop:                () => { overlay.remove(); showProgressionShop(); },
        prestige:            () => {
          overlay.remove();
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest10b_usePrestige') {
            progressTutorialQuest('quest10b_usePrestige', true);
            saveSaveData();
          }
          if (typeof showPrestigeMenu === 'function') showPrestigeMenu(); else showProgressionShop();
        },
        trashRecycle:        () => {
          overlay.remove();
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest27_useRecycle') {
            progressTutorialQuest('quest27_useRecycle', true);
            saveSaveData();
          }
          showInventoryScreen();
        },
        campfireKitchen:     () => {
          overlay.remove();
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest30_buildCampfire') {
            progressTutorialQuest('quest30_buildCampfire', true);
            saveSaveData();
          }
          showCampfireKitchen();
        },
        weaponsmith:         () => {
          overlay.remove();
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest31_buildWeaponsmith') {
            progressTutorialQuest('quest31_buildWeaponsmith', true);
            saveSaveData();
          }
          showWeaponsmith();
        },
        tempShop:            () => {
          overlay.remove();
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest29_useTempShop') {
            progressTutorialQuest('quest29_useTempShop', true);
            saveSaveData();
          }
          showProgressionShop();
        },
        workshop:            () => { overlay.remove(); showWorkshop(); },
      };

      for (const [buildingId, building] of Object.entries(CAMP_BUILDINGS)) {
        if (building.isLegacy) continue;
        if (buildingId === 'campBoard') continue; // Don't list campBoard itself
        const buildingData = saveData.campBuildings[buildingId];
        if (!buildingData) continue;
        const isUnlocked = buildingData.level > 0;
        if (!isUnlocked) continue;

        const action = buildingActions[buildingId];
        const btn = document.createElement('button');
        btn.style.cssText = [
          'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
          'gap:6px', 'background:linear-gradient(135deg,#1a1a2e,#0d1020)',
          'border:2px solid #c8a248', 'border-radius:10px', 'padding:14px 10px',
          'cursor:pointer', 'font-family:"Bangers",cursive', 'color:#FFD700',
          'letter-spacing:1px', 'transition:filter 0.15s,transform 0.1s',
        ].join(';');
        btn.innerHTML = `<span style="font-size:30px;line-height:1;">${building.icon}</span><span style="font-size:12px;text-transform:uppercase;color:#f0d890;">${building.name}</span>`;
        if (action) {
          btn.onclick = action;
          btn.onmouseenter = () => { btn.style.filter = 'brightness(1.3)'; btn.style.transform = 'translateY(-2px)'; };
          btn.onmouseleave = () => { btn.style.filter = ''; btn.style.transform = ''; };
        } else {
          btn.style.opacity = '0.4';
          btn.style.cursor = 'default';
        }
        grid.appendChild(btn);
      }

      overlay.appendChild(grid);

      // Tap backdrop to close
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      document.body.appendChild(overlay);
    }

    function showProgressionShop() {
      const shopGrid = document.getElementById('shop-grid');
      shopGrid.innerHTML = '';

      // ── Harvesting Tools section ──────────────────────────────
      if (window.GameHarvesting) {
        const toolsHeader = document.createElement('div');
        toolsHeader.style.cssText = 'width:100%;text-align:center;color:#FFD700;font-family:"Bangers",cursive;font-size:20px;letter-spacing:2px;margin-bottom:6px;padding-top:4px;';
        toolsHeader.textContent = '⛏️ HARVESTING TOOLS';
        shopGrid.appendChild(toolsHeader);

        const tools = window.GameHarvesting.getToolList();
        const ownedTools = window.GameHarvesting.getTools() || {};
        const resources = window.GameHarvesting.getResources() || {};

        tools.forEach(toolDef => {
          const owned = ownedTools[toolDef.id];
          const epicKey = 'epic' + toolDef.id.charAt(0).toUpperCase() + toolDef.id.slice(1);
          const isEpic = ownedTools[epicKey];
          const canAffordBase = saveData.gold >= toolDef.buyCost;

          const card = document.createElement('div');
          card.className = 'upgrade-shop-card' + (isEpic ? ' max-level' : '');
          card.style.cssText = 'background:rgba(40,20,0,0.85);border:2px solid #8B4513;';

          let reqStr = '';
          if (toolDef.epicForgeReq) {
            reqStr = Object.entries(toolDef.epicForgeReq).map(([k, v]) => {
              const rt = window.GameHarvesting.RESOURCE_TYPES[k];
              const have = resources[k] || 0;
              const color = have >= v ? '#2ecc71' : '#e74c3c';
              return `<span style="color:${color}">${rt ? rt.icon : k} ${have}/${v}</span>`;
            }).join(' ');
          }

          if (!owned) {
            card.innerHTML = `
              <div class="upgrade-shop-title">${toolDef.icon} ${toolDef.name}</div>
              <div class="upgrade-shop-desc">Harvest resources from the world</div>
              <div class="upgrade-shop-cost">Cost: ${toolDef.buyCost} Gold</div>
              <button class="upgrade-buy-btn" ${!canAffordBase ? 'disabled' : ''}>
                ${canAffordBase ? 'BUY' : 'NOT ENOUGH GOLD'}
              </button>`;
            const btn = card.querySelector('.upgrade-buy-btn');
            btn.onclick = () => {
              if (window.GameHarvesting.buyTool(toolDef.id)) {
                saveSaveData();
                playSound('levelup');
                // Quest: bought first tool (either early forge quest or later quest22)
                if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest22_buyFirstTool') {
                  progressTutorialQuest('quest22_buyFirstTool', true);
                  saveSaveData();
                }
                if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'questForge0b_craftTools') {
                  progressTutorialQuest('questForge0b_craftTools', true);
                  saveSaveData();
                }
                showProgressionShop();
              }
            };
          } else if (!isEpic) {
            // Base tool owned — show Epic upgrade option
            const epicReqsMet = toolDef.epicForgeReq && Object.entries(toolDef.epicForgeReq).every(([k, v]) => (resources[k] || 0) >= v);
            card.innerHTML = `
              <div class="upgrade-shop-title">${toolDef.icon} ${toolDef.name} <span style="color:#2ecc71;font-size:12px;">✓ OWNED</span></div>
              <div class="upgrade-shop-desc">⚒️ Forge to <span style="color:#FFD700;">EPIC</span> — harvests 2.5× more resources</div>
              <div class="upgrade-shop-cost" style="font-size:12px;">Requires: ${reqStr}</div>
              <button class="upgrade-buy-btn" ${!epicReqsMet ? 'disabled' : ''}>
                ${epicReqsMet ? '⚒️ FORGE EPIC' : 'NEED MORE MATERIALS'}
              </button>`;
            const btn = card.querySelector('.upgrade-buy-btn');
            btn.onclick = () => {
              if (window.GameHarvesting.forgeTool(toolDef.id)) {
                saveSaveData();
                playSound('levelup');
                // Quest 25: forged epic tool
                if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest25_useForge') {
                  progressTutorialQuest('quest25_useForge', true);
                  saveSaveData();
                }
                showProgressionShop();
              }
            };
          } else {
            card.innerHTML = `
              <div class="upgrade-shop-title">${toolDef.icon} ${toolDef.name} <span style="color:#FFD700;">★ EPIC</span></div>
              <div class="upgrade-shop-desc" style="color:#2ecc71;">Maximum tier — 2.5× resource yield</div>
              <div class="upgrade-shop-cost" style="color:#27ae60;">FULLY UPGRADED</div>`;
          }
          shopGrid.appendChild(card);
        });

        // Separator
        const sep = document.createElement('hr');
        sep.style.cssText = 'width:100%;border-color:rgba(255,215,0,0.2);margin:8px 0;';
        shopGrid.appendChild(sep);

        const upgradesHeader = document.createElement('div');
        upgradesHeader.style.cssText = 'width:100%;text-align:center;color:#FFD700;font-family:"Bangers",cursive;font-size:20px;letter-spacing:2px;margin-bottom:6px;';
        upgradesHeader.textContent = '⬆️ STAT UPGRADES';
        shopGrid.appendChild(upgradesHeader);
      }
      
      // Create upgrade cards for each permanent upgrade
      Object.keys(PERMANENT_UPGRADES).forEach(key => {
        const upgrade = PERMANENT_UPGRADES[key];
        const currentLevel = saveData.upgrades[key];
        const isMaxLevel = currentLevel >= upgrade.maxLevel;
        const cost = getCost(key);
        const canAfford = saveData.gold >= cost;
        
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
      const currentLevel = saveData.upgrades[upgradeKey];
      const cost = getCost(upgradeKey);
      
      if (currentLevel >= upgrade.maxLevel) return;
      if (saveData.gold < cost) return;
      
      saveData.gold -= cost;
      saveData.upgrades[upgradeKey]++;
      
      // Track quest: Buy a Progression Upgrade
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest7_buyProgression') {
        progressTutorialQuest('quest7_buyProgression', true);
      }
      
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
        setGamePaused(false); // Balance the options menu's setGamePaused(true) before opening stats
        optionsMenu.style.display = 'none';
        toggleStats();
      });
      
      optionsCampBtn.addEventListener('click', () => {
        // The options menu was opened with setGamePaused(true) (pauseOverlayCount=1).
        // We intentionally do NOT call setGamePaused(false) here, so the game
        // remains paused while in camp. "Continue Game" will call setGamePaused(false)
        // to resume when the player returns.
        optionsMenu.style.display = 'none';
        // Hide main menu if still visible
        document.getElementById('main-menu').style.display = 'none';
        updateCampScreen();
        
        // Move chat tab upward in camp mode to avoid menu overlap
        const chatTab = document.getElementById('ai-chat-tab');
        if (chatTab) chatTab.classList.add('camp-mode');

        // Ensure buildings tab is selected (not sleep/day-night selection)
        document.getElementById('camp-screen').classList.remove('camp-subsection-active');
        document.getElementById('camp-buildings-section').style.display = 'block';
        document.getElementById('camp-skills-section').style.display = 'none';
        document.getElementById('camp-sleep-section').style.display = 'none';
        document.getElementById('camp-training-section').style.display = 'none';
        const campAccountSection = document.getElementById('camp-account-section');
        if (campAccountSection) campAccountSection.style.display = 'none';
        const campIdleSection = document.getElementById('camp-idle-section');
        if (campIdleSection) campIdleSection.style.display = 'none';
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
        // Reuse the options menu's existing pause (no extra setGamePaused needed)
        // Open settings modal
        document.getElementById('settings-modal').style.display = 'flex';
      });
      
      // Options menu - Progression button
      const optionsProgressionBtn = document.getElementById('options-progression-btn');
      if (optionsProgressionBtn) {
        optionsProgressionBtn.addEventListener('click', () => {
          optionsMenu.style.display = 'none';
          // Reuse the options menu's existing pause (no extra setGamePaused needed)
          showProgressionShop();
          playSound('waterdrop');
        });
      }
      
      // Options menu - Attributes button
      const optionsAttributesBtn = document.getElementById('options-attributes-btn');
      if (optionsAttributesBtn) {
        optionsAttributesBtn.addEventListener('click', () => {
          optionsMenu.style.display = 'none';
          // Reuse the options menu's existing pause (no extra setGamePaused needed)
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
          // Reuse the options menu's existing pause (no extra setGamePaused needed)
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
          // Reuse the options menu's existing pause (no extra setGamePaused needed)
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
          // Reuse the options menu's existing pause (no extra setGamePaused needed)
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
        if (e.target.value === 'auto') {
          // Reset booster to medium as starting point
          if (window._resetFpsBooster) window._resetFpsBooster(3);
          applyGraphicsQuality('medium');
          const statusEl = document.getElementById('fps-booster-status');
          if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'Auto: detecting...'; }
        } else {
          applyGraphicsQuality(e.target.value);
          const statusEl = document.getElementById('fps-booster-status');
          if (statusEl) statusEl.style.display = 'none';
        }
        saveSettings();
      };

      // Sync settings UI controls with current gameSettings state
      const autoAimCheckbox = document.getElementById('auto-aim-checkbox');
      if (autoAimCheckbox) {
        autoAimCheckbox.checked = !!gameSettings.autoAim;
        // Disable auto-aim checkbox until Auto-Aim skill is unlocked in Skill Tree
        const autoAimSkillUnlocked = saveData.skillTree && saveData.skillTree.autoAim && saveData.skillTree.autoAim.level > 0;
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
        // Set to saved value (fallback to 'auto' as defensive programming)
        qualitySelect.value = gameSettings.graphicsQuality || 'auto';
      }

      // Ensure game systems reflect the current settings
      if (typeof updateControlType === 'function') {
        try { updateControlType(); } catch(e) { console.warn('[Init] updateControlType failed:', e); }
      }
      if (typeof updateBackgroundMusic === 'function') {
        try { updateBackgroundMusic(); } catch(e) { console.warn('[Init] updateBackgroundMusic failed:', e); }
      }
      
      // Main Menu Buttons
      document.getElementById('start-game-btn').onclick = () => {
        playSound('waterdrop');
        startGame(); // Full game start: restores HUD visibility, hides all screens, shows tutorials
      };
      
      document.getElementById('camp-btn').onclick = () => {
        playSound('waterdrop');
        hideMainMenu();
        updateCampScreen();
        document.getElementById('camp-screen').classList.remove('camp-subsection-active');
        document.getElementById('camp-screen').style.display = 'flex';

        // Move chat tab upward in camp mode to avoid menu overlap
        const chatTab = document.getElementById('ai-chat-tab');
        if (chatTab) chatTab.classList.add('camp-mode');

        // Track camp visits and show reminder on 1st and every 5th visit
        if (!saveData.campVisitCount) saveData.campVisitCount = 0;
        saveData.campVisitCount++;
        saveSaveData();
        if (saveData.campVisitCount === 1 || saveData.campVisitCount % 5 === 0) {
          setTimeout(() => {
            showChatReminderBubble('Ask me about quests, settings & tips! 💬', true);
          }, 1500);
        }
        
        // Tutorial: Check if player visited camp for first time after first death
        if (!saveData.tutorial) {
          saveData.tutorial = {
            completed: false,
            firstDeath: false,
            campVisited: false,
            dashUnlocked: false,
            headshotUnlocked: false,
            currentStep: 'waiting_first_death'
          };
        }
        
        if (saveData.tutorial.currentStep === 'go_to_camp' && !saveData.tutorial.campVisited) {
          saveData.tutorial.campVisited = true;
          saveData.tutorial.currentStep = 'unlock_dash';
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
        const campScreen = document.getElementById('camp-screen');
        const campVisible = campScreen.style.display === 'flex';
        if (campVisible) {
          // Return to camp buildings view
          campScreen.classList.remove('camp-subsection-active');
          document.getElementById('camp-buildings-tab').click();
        } else if (isGameActive) {
          setGamePaused(false);
        } else {
          showMainMenu();
        }
      };
      
      document.getElementById('achievements-back-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('achievements-screen').style.display = 'none';
        const campVisible = document.getElementById('camp-screen').style.display === 'flex';
        // If coming back from Achievement Hall, show camp
        if (!campVisible && !isGameActive) {
          document.getElementById('camp-screen').style.display = 'flex';
          updateCampScreen();
        } else if (!campVisible && isGameActive) { setGamePaused(false); }
        else if (!campVisible) { showMainMenu(); }
      };
      
      document.getElementById('attributes-back-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('attributes-screen').style.display = 'none';
        const campVisible = document.getElementById('camp-screen').style.display === 'flex';
        if (!campVisible && isGameActive) { setGamePaused(false); }
        else if (!campVisible) { showMainMenu(); }
      };
      
      document.getElementById('gear-back-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('gear-screen').style.display = 'none';
        const campVisible = document.getElementById('camp-screen').style.display === 'flex';
        if (!campVisible && isGameActive) { setGamePaused(false); }
        else if (!campVisible) { showMainMenu(); }
      };
      
      document.getElementById('credits-back-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('credits-screen').style.display = 'none';
        if (isGameActive) { setGamePaused(false); } else { showMainMenu(); }
      };
      
      document.getElementById('camp-action-btn').onclick = () => {
        playSound('waterdrop');
        // Deactivate 3D camp world and clean up CSS class
        if (window.CampWorld) window.CampWorld.exit();
        const campScreenEl = document.getElementById('camp-screen');
        if (campScreenEl) campScreenEl.classList.remove('camp-3d-mode');
        document.getElementById('camp-screen').style.display = 'none';
        // Restore ui-layer visibility (quest-system hides it when entering 3D camp mode)
        const uiLayerEl = document.getElementById('ui-layer');
        if (uiLayerEl) uiLayerEl.style.visibility = '';
        // Remove camp mode from chat tab when leaving camp
        const chatTab = document.getElementById('ai-chat-tab');
        if (chatTab) chatTab.classList.remove('camp-mode');
        const reminderBubble = document.getElementById('chat-reminder-bubble');
        if (reminderBubble) reminderBubble.style.display = 'none';
        if (isGameActive) {
          // Resume game when returning from camp during an active run
          setGamePaused(false);
        } else {
          // Start a new run
          startGame();
        }
      };

      // Camp Menu button → open settings/options
      const campMenuBtn = document.getElementById('camp-menu-btn');
      if (campMenuBtn) {
        campMenuBtn.onclick = () => {
          playSound('waterdrop');
          document.getElementById('settings-modal').style.display = 'flex';
        };
      }

      // Corner widget: Daily Reward button
      const campDailyBtn = document.getElementById('camp-daily-btn');
      if (campDailyBtn) {
        campDailyBtn.onclick = () => {
          playSound('waterdrop');
          _showDailyRewardPanel();
        };
      }

      // Corner widget: Spin Wheel button
      const campSpinBtn = document.getElementById('camp-spin-btn');
      if (campSpinBtn) {
        campSpinBtn.onclick = () => {
          playSound('waterdrop');
          _showSpinWheelPanel();
        };
      }

      // Camp Account button → open account section
      const campAccountBtn = document.getElementById('camp-account-btn');
      if (campAccountBtn) {
        campAccountBtn.onclick = () => {
          playSound('waterdrop');
          showAccountSection();
        };
      }
      
      // Back to Buildings buttons inside each sub-section
      // Skip shop-back-btn which has its own dedicated handler above
      document.querySelectorAll('.camp-section-back-btn').forEach(btn => {
        if (btn.id === 'shop-back-btn') return; // Already handled above
        btn.onclick = () => {
          playSound('waterdrop');
          document.getElementById('camp-screen').classList.remove('camp-subsection-active');
          document.getElementById('camp-buildings-tab').click();
        };
      });
      
      // Camp tab switching
      document.getElementById('camp-buildings-tab').onclick = () => {
        playSound('waterdrop');
        document.getElementById('camp-screen').classList.remove('camp-subsection-active');
        document.getElementById('camp-buildings-section').style.display = 'block';
        document.getElementById('camp-skills-section').style.display = 'none';
        document.getElementById('camp-sleep-section').style.display = 'none';
        document.getElementById('camp-training-section').style.display = 'none';
        document.getElementById('camp-passive-section').style.display = 'none';
        const campAccountSection = document.getElementById('camp-account-section');
        if (campAccountSection) campAccountSection.style.display = 'none';
        const campIdleSection2 = document.getElementById('camp-idle-section');
        if (campIdleSection2) campIdleSection2.style.display = 'none';
        document.getElementById('camp-buildings-tab').style.background = '#5A3A31';
        document.getElementById('camp-skills-tab').style.background = '#3a3a3a';
        document.getElementById('camp-sleep-tab').style.background = '#3a3a3a';
        document.getElementById('camp-training-tab').style.background = '#3a3a3a';
        document.getElementById('camp-passive-tab').style.background = '#3a3a3a';
      };
      
      document.getElementById('camp-skills-tab').onclick = () => {
        playSound('waterdrop');
        document.getElementById('camp-screen').classList.add('camp-subsection-active');
        document.getElementById('camp-buildings-section').style.display = 'none';
        document.getElementById('camp-skills-section').style.display = 'block';
        document.getElementById('camp-sleep-section').style.display = 'none';
        document.getElementById('camp-training-section').style.display = 'none';
        document.getElementById('camp-passive-section').style.display = 'none';
        const campAccountSection = document.getElementById('camp-account-section');
        if (campAccountSection) campAccountSection.style.display = 'none';
        const campIdleSS = document.getElementById('camp-idle-section');
        if (campIdleSS) campIdleSS.style.display = 'none';
        document.getElementById('camp-buildings-tab').style.background = '#3a3a3a';
        document.getElementById('camp-skills-tab').style.background = '#5A3A31';
        document.getElementById('camp-sleep-tab').style.background = '#3a3a3a';
        document.getElementById('camp-training-tab').style.background = '#3a3a3a';
        document.getElementById('camp-passive-tab').style.background = '#3a3a3a';
      };
      
      document.getElementById('camp-passive-tab').onclick = () => {
        playSound('waterdrop');
        document.getElementById('camp-screen').classList.add('camp-subsection-active');
        document.getElementById('camp-buildings-section').style.display = 'none';
        document.getElementById('camp-skills-section').style.display = 'none';
        document.getElementById('camp-sleep-section').style.display = 'none';
        document.getElementById('camp-training-section').style.display = 'none';
        document.getElementById('camp-passive-section').style.display = 'block';
        const campAccountSection = document.getElementById('camp-account-section');
        if (campAccountSection) campAccountSection.style.display = 'none';
        const campIdleSP = document.getElementById('camp-idle-section');
        if (campIdleSP) campIdleSP.style.display = 'none';
        document.getElementById('camp-buildings-tab').style.background = '#3a3a3a';
        document.getElementById('camp-skills-tab').style.background = '#3a3a3a';
        document.getElementById('camp-sleep-tab').style.background = '#3a3a3a';
        document.getElementById('camp-training-tab').style.background = '#3a3a3a';
        document.getElementById('camp-passive-tab').style.background = '#5A3A31';
        updatePassiveSkillsSection();
      };
      
      document.getElementById('camp-sleep-tab').onclick = () => {
        playSound('waterdrop');
        document.getElementById('camp-screen').classList.add('camp-subsection-active');
        document.getElementById('camp-buildings-section').style.display = 'none';
        document.getElementById('camp-skills-section').style.display = 'none';
        document.getElementById('camp-sleep-section').style.display = 'block';
        document.getElementById('camp-training-section').style.display = 'none';
        document.getElementById('camp-passive-section').style.display = 'none';
        const campAccountSection = document.getElementById('camp-account-section');
        if (campAccountSection) campAccountSection.style.display = 'none';
        const campIdleSL = document.getElementById('camp-idle-section');
        if (campIdleSL) campIdleSL.style.display = 'none';
        document.getElementById('camp-buildings-tab').style.background = '#3a3a3a';
        document.getElementById('camp-skills-tab').style.background = '#3a3a3a';
        document.getElementById('camp-sleep-tab').style.background = '#5A3A31';
        document.getElementById('camp-training-tab').style.background = '#3a3a3a';
        document.getElementById('camp-passive-tab').style.background = '#3a3a3a';
      };
      
      document.getElementById('camp-training-tab').onclick = () => {
        playSound('waterdrop');
        document.getElementById('camp-screen').classList.add('camp-subsection-active');
        document.getElementById('camp-buildings-section').style.display = 'none';
        document.getElementById('camp-skills-section').style.display = 'none';
        document.getElementById('camp-sleep-section').style.display = 'none';
        document.getElementById('camp-training-section').style.display = 'block';
        document.getElementById('camp-passive-section').style.display = 'none';
        const campAccountSection = document.getElementById('camp-account-section');
        if (campAccountSection) campAccountSection.style.display = 'none';
        const campIdleST = document.getElementById('camp-idle-section');
        if (campIdleST) campIdleST.style.display = 'none';
        document.getElementById('camp-buildings-tab').style.background = '#3a3a3a';
        document.getElementById('camp-skills-tab').style.background = '#3a3a3a';
        document.getElementById('camp-sleep-tab').style.background = '#3a3a3a';
        document.getElementById('camp-training-tab').style.background = '#5A3A31';
        document.getElementById('camp-passive-tab').style.background = '#3a3a3a';
        updateTrainingSection();
        // First entry: award training point once so player can immediately complete quest5_upgradeAttr
        if (saveData.storyQuests && saveData.storyQuests.buildingFirstUse && !saveData.storyQuests.buildingFirstUse.trainingHall) {
          saveData.storyQuests.buildingFirstUse.trainingHall = true;
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest5_upgradeAttr') {
            saveData.trainingPoints = (saveData.trainingPoints || 0) + 1;
            showStatChange('+1 Attribute Point! Spend it in the Training Hall!');
            saveSaveData();
          }
        }
      };
      
      // Sleep option handlers
      document.getElementById('sleep-day-option').onclick = () => {
        playSound('waterdrop');
        saveData.nextRunTimeOfDay = 'day';
        saveSaveData();
        updateCampScreen();
      };
      
      document.getElementById('sleep-night-option').onclick = () => {
        playSound('waterdrop');
        saveData.nextRunTimeOfDay = 'night';
        saveSaveData();
        updateCampScreen();
      };
      
      // Go to Camp from death screen
      document.getElementById('goto-camp-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('gameover-screen').style.display = 'none';
        // Hide main menu if still visible (loading screen may have shown it)
        document.getElementById('main-menu').style.display = 'none';
        // Close any tutorial/comic modals that might still be open from the death sequence
        ['comic-tutorial-modal','comic-info-overlay','story-quest-modal'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });
        // Clear any stuck comic-info-overlay created dynamically
        const dynOverlay = document.getElementById('comic-info-overlay');
        if (dynOverlay && dynOverlay.parentNode) dynOverlay.parentNode.removeChild(dynOverlay);
        // Ensure pause state is clean before entering camp
        pauseOverlayCount = 0;
        window.pauseOverlayCount = 0;
        isPaused = false;
        window.isPaused = false;
        if (typeof _syncJoystickZone === 'function') _syncJoystickZone();
        // Show camp screen immediately so player sees the transition
        document.getElementById('camp-screen').classList.remove('camp-subsection-active');
        document.getElementById('camp-screen').style.display = 'flex';
        const chatTab = document.getElementById('ai-chat-tab');
        if (chatTab) chatTab.classList.add('camp-mode');
        // Activate 3D camp world immediately (pre-warmed at startup) so there is no
        // opaque-background flash before the scene becomes visible.
        try { updateCampScreen(); } catch(e) { console.error('[Camp] initial updateCampScreen error:', e); }
        // Defer a second pass to handle async DOM settle and refresh rage-combat loadout
        const CAMP_ACTIVATION_RETRY_DELAY_MS = 80;
        setTimeout(() => {
          try { updateCampScreen(); } catch(e) { console.error('[Camp] updateCampScreen error:', e); }
          // Refresh special attack loadout buttons for the new run
          if (window.GameRageCombat) window.GameRageCombat.refreshLoadout(saveData);
          // Safety retries: if CampWorld didn't activate (e.g. scene build threw), retry
          // with increasing delays so the 3D camp shows reliably rather than falling back.
          if (window.CampWorld && !window.CampWorld.isActive) {
            setTimeout(() => {
              try { updateCampScreen(); } catch(e) { console.error('[Camp] Retry 1 updateCampScreen error:', e); }
              if (window.CampWorld && !window.CampWorld.isActive) {
                setTimeout(() => {
                  try { updateCampScreen(); } catch(e) { console.error('[Camp] Retry 2 updateCampScreen error:', e); }
                }, CAMP_ACTIVATION_RETRY_DELAY_MS * 4);
              }
            }, CAMP_ACTIVATION_RETRY_DELAY_MS);
          }
        }, 0);
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
        saveData.storyQuests.welcomeShown = true;
        saveSaveData();
        document.getElementById('story-quest-modal').style.display = 'none';
        if (isGameActive) setGamePaused(false);
      }
      document.getElementById('story-quest-close-btn').onclick = closeStoryQuestModal;
      document.getElementById('story-quest-x-btn').onclick = closeStoryQuestModal;
      // X button for comic-tutorial-modal
      document.getElementById('comic-tutorial-x-btn').onclick = () => {
        document.getElementById('comic-tutorial-modal').style.display = 'none';
        if (isGameActive && !isGameOver) setGamePaused(false);
      };
      // X button for levelup-modal
      document.getElementById('levelup-x-btn').onclick = () => {
        document.getElementById('levelup-modal').style.display = 'none';
        forceGameUnpause();
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
            saveData = JSON.parse(JSON.stringify(defaultSaveData));
            window.saveData = saveData;
            window.GameState.saveData = saveData;
            
            // Save the fresh state
            saveSaveData();
            
            // Reset game and return to menu
            resetGame();
            document.getElementById('settings-modal').style.display = 'none';
            setGamePaused(false);
            showMainMenu();
            updateShopUI();
            
            alert('✅ All progress has been completely reset! The game will start fresh on your next playthrough.');
            playSound('hit');
          }
        }
      };

      // UI Calibration button — opens HUD editor mode (pauses game while editing)
      document.getElementById('ui-calibration-btn').onclick = () => {
        document.getElementById('settings-modal').style.display = 'none';
        if (isGameActive && !isGameOver) setGamePaused(true);
        if (window.UICalibration) {
          window.UICalibration.enter(() => {
            // Resume game when calibration is closed (if in an active run)
            if (isGameActive && !isGameOver) setGamePaused(false);
          });
        }
      };
      // Initialize AI Chat Box Console
      initAIChat();
      // Initialize Unspent Points Corner Dropdown
      _initUnspentDropdown();
      
      // Equipment Button - Opens Gear Screen
      document.getElementById('equipment-btn').onclick = () => {
        playSound('hit');
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('gear-screen').style.display = 'flex';
        updateGearScreen();
      };
      
      // Initialize control type UI on startup
      if (typeof updateControlType === 'function') {
        try { updateControlType(); } catch(e) { console.warn('[Init] updateControlType (end of setupMenus) failed:', e); }
      }
    }
    

    // Expose camp navigation for loading.js and other external scripts.
    // IMPORTANT: capture the quest-system function BEFORE this proxy replaces window.updateCampScreen,
    // otherwise calling `updateCampScreen()` bare-name inside the proxy would resolve to window.updateCampScreen
    // (the proxy itself) causing infinite recursion / stack overflow.
    (function() {
      var _orig = (typeof updateCampScreen === 'function') ? updateCampScreen : null;
      window.updateCampScreen = function() {
        if (!_orig) { console.warn('[CampWorld] updateCampScreen not yet available'); return; }
        try { _orig(); } catch(e) { console.error('[CampWorld] updateCampScreen error:', e); }
      };
    })();

    function spawnWave() {
      waveCount++;

      // Notify super stat bar of new wave
      if (window.pushSuperStatEvent) {
        const wRarity = waveCount >= 10 ? 'epic' : waveCount >= 5 ? 'rare' : 'uncommon';
        window.pushSuperStatEvent(`🌊 Wave ${waveCount}!`, wRarity, '🌊', 'neutral');
      }
      
      // Phase 1 Performance Fix: Limit maximum enemies on screen
      const currentEnemyCount = enemies.filter(e => !e.isDead).length;
      
      // Skip spawning if we're at the limit
      if (currentEnemyCount >= GAME_CONFIG.maxEnemiesOnScreen) {
        console.warn(`[EnemyCap] Enemy count (${currentEnemyCount}) at max (${GAME_CONFIG.maxEnemiesOnScreen}), skipping wave spawn`);
        return;
      }
      
      // Check if this is a mini-boss wave - expanded progression to 150
      // Mini-bosses appear after players cross upgrade thresholds (approx every 15 levels)
      const miniBossLevels = [10, 25, 40, 55, 70, 85, 100, 115, 130, 145];
      const isMiniBossWave = miniBossLevels.includes(playerStats.lvl) && !miniBossesSpawned.has(playerStats.lvl);
      
      // Level 15 Flying Boss — unique one-time event per run
      const isFlyingBossWave = playerStats.lvl === 15 && !miniBossesSpawned.has(FLYING_BOSS_SPAWN_KEY);
      
      if (isFlyingBossWave) {
        miniBossesSpawned.add(FLYING_BOSS_SPAWN_KEY);
        const angle = Math.random() * Math.PI * 2;
        const dist = 35; // Spawn further away so the large boss is framed well
        const ex = player.mesh.position.x + Math.cos(angle) * dist;
        const ez = player.mesh.position.z + Math.sin(angle) * dist;
        const flyingBoss = new Enemy(11, ex, ez, playerStats.lvl);
        enemies.push(flyingBoss);
        // Debug: log flying boss spawn details
        if (window.GameDebug) window.GameDebug.onBossSpawn(flyingBoss, playerStats.lvl, 'FlyingBoss_L' + playerStats.lvl);
        createFloatingText("⚠️ FLYING BOSS INCOMING! ⚠️", player.mesh.position, '#FF00FF');
        triggerCinematic('miniboss', flyingBoss.mesh, 4000);
        // Escort bugs
        for (let i = 0; i < 4; i++) {
          const sa = Math.random() * Math.PI * 2;
          const sd = 28 + Math.random() * 6;
          enemies.push(new Enemy(14, player.mesh.position.x + Math.cos(sa) * sd, player.mesh.position.z + Math.sin(sa) * sd, playerStats.lvl));
        }
        return;
      }
      
      if (isMiniBossWave) {
        // Mark this level's mini-boss as spawned
        miniBossesSpawned.add(playerStats.lvl);
        
        // Spawn mini-boss with 2-3 regular enemies
        const angle = Math.random() * Math.PI * 2;
        const dist = 28;
        const ex = player.mesh.position.x + Math.cos(angle) * dist;
        const ez = player.mesh.position.z + Math.sin(angle) * dist;
        const miniBoss = new Enemy(10, ex, ez, playerStats.lvl);
        enemies.push(miniBoss);
        // Debug: log mini-boss spawn details
        if (window.GameDebug) window.GameDebug.onBossSpawn(miniBoss, playerStats.lvl, 'MiniBoss_L' + playerStats.lvl);
        createFloatingText("MINI-BOSS INCOMING!", player.mesh.position);
        // Always-on log so render-loop health can be confirmed in console post-miniboss
        console.log(`[MiniBoss] L${playerStats.lvl} spawned t=${Math.floor((Date.now()-gameStartTime)/1000)}s — loop alive, enemies=${enemies.length}`);
        
        // Trigger cinematic for mini-boss spawn
        triggerCinematic('miniboss', miniBoss.mesh, 3000);
        
        // Spawn 1-2 regular enemies with the mini-boss (reduced from 2-3)
        const supportCount = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < supportCount; i++) {
          const supportAngle = Math.random() * Math.PI * 2;
          const supportDist = 25 + Math.random() * 5;
          const supportX = player.mesh.position.x + Math.cos(supportAngle) * supportDist;
          const supportZ = player.mesh.position.z + Math.sin(supportAngle) * supportDist;
          const supportType = Math.floor(Math.random() * Math.min(3, Math.max(1, playerStats.lvl / 3)));
          const minion = new Enemy(supportType, supportX, supportZ, playerStats.lvl);
          minion.isMiniBossMinion = true; // Tag for cleanup on mini-boss death
          enemies.push(minion);
        }
        // Don't spawn additional regular wave enemies on mini-boss waves
        return;
      }
      
      // Scale spawn count with player level for increased difficulty
      // Progressive spawning: starts manageable then ramps up aggressively
      let baseCount, levelBonus, cap;
      
      if (playerStats.lvl <= 30) {
        // Early game: Progressive spawns (4-14 per wave)
        baseCount = 4 + Math.floor(waveCount / 2);
        levelBonus = Math.floor(playerStats.lvl / 2);
        cap = 14;
      } else if (playerStats.lvl <= 75) {
        // Mid-game: Aggressive spawns (6-18 enemies per wave)
        baseCount = 6 + Math.floor(waveCount / 2);
        levelBonus = Math.floor(playerStats.lvl / 3);
        cap = 18;
      } else if (playerStats.lvl <= 120) {
        // Late-game: Very challenging (6-16 enemies per wave)
        baseCount = 6 + Math.floor(waveCount / 2);
        levelBonus = Math.floor(playerStats.lvl / 3);
        cap = 16;
      } else {
        // End-game: Maximum challenge (8-20 enemies per wave)
        baseCount = 8 + Math.floor(waveCount / 2);
        levelBonus = Math.floor(playerStats.lvl / 3);
        cap = 20;
      }
      
      const count = Math.min(baseCount + levelBonus, cap);
      
      for(let i=0; i<count; i++) {
        // Spawn at edge of camera view approx - avoid lake area
        let ex, ez, inLake;
        let attempts = 0;
        const MAX_ATTEMPTS = 10;
        
        do {
          const angle = Math.random() * Math.PI * 2;
          const dist = 25 + Math.random() * 10; // Just outside view
          ex = player.mesh.position.x + Math.cos(angle) * dist;
          ez = player.mesh.position.z + Math.sin(angle) * dist;
          
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
        // 5: Flying (lvl 8+), 6-9: Hard variants (lvl 12+), 12-14: Bug variants (lvl 15+)
        // 15: Daddy Longlegs spider (wave 1+), 16: Sweeping Swarm (after 3 kills, lvl 10+)

        // Early game safety: runs 0 and 1 (the first two runs) spawn only gentle enemies
        const totalRuns = saveData.totalRuns || 0;
        const isEarlyGame = totalRuns < 2;

        let maxType = 2; // Start with 3 base types
        if (!isEarlyGame) {
          if (playerStats.lvl >= 8) maxType = 5; // Add slowing (3), ranged placeholder, and flying (5)
          if (playerStats.lvl >= 10) maxType = 5; // Add ranged enemies (4)
          if (playerStats.lvl >= 12) maxType = 6; // Add hard tank
          if (playerStats.lvl >= 14) maxType = 7; // Add hard fast
          if (playerStats.lvl >= 16) maxType = 8; // Add hard balanced
          if (playerStats.lvl >= 18) maxType = 9; // Add elite
        }
        
        let type = Math.floor(Math.random() * (maxType + 1));
        
        // Special spawning logic for specific types
        // Exclude type 4 (ranged) from random selection at level 8-9, only available at 10+
        if (type === 4 && playerStats.lvl < 10) {
          type = 3; // Fall back to slowing
        }
        
        if (!isEarlyGame) {
          // Flying enemies (type 5) - 15% chance at level 8+
          if (playerStats.lvl >= 8 && Math.random() < 0.15) {
            type = 5;
          }
          
          // Ranged enemies (type 4) - 30% chance at level 10+ for more variety
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
          
          // Daddy Longlegs spider (type 15) — available from wave 1, ~15% chance
          if (Math.random() < 0.15) {
            type = 15;
          }
          
          // Bug/water-being enemies (types 12-14) — available from level 15+
          // ~20% chance to spawn one of the bug variants when available
          if (playerStats.lvl >= 15 && Math.random() < 0.20) {
            type = 12 + Math.floor(Math.random() * 3); // 12, 13, or 14
          }
          
          // Sweeping Swarm (type 16) — available after 3 kills + level 10+, ~10% chance
          const killsMilestone = saveData.totalKills || 0;
          if (playerStats.lvl >= 10 && killsMilestone >= 3 && Math.random() < 0.10) {
            type = 16;
          }
        } else {
          // Early game: reliably include Daddy Longlegs (spider) and the
          // yellow easy enemy (type 7 — visually distinct, manageable at low levels)
          if (Math.random() < 0.30) {
            type = 15; // Daddy Longlegs — tiny body, huge legs, low HP like yellow enemy
          } else if (Math.random() < 0.25) {
            type = 7;  // Yellow easy enemy — gold colour, low HP at early-game scaling
          }
        }
        
        const newEnemy = new Enemy(type, ex, ez, playerStats.lvl);
        enemies.push(newEnemy);
      }

      // First-run tutorial: pause on first enemy appearance to teach steering & aiming
      const isVeryFirstRun = saveData.totalRuns === 0;
      if (isVeryFirstRun && waveCount === 1 && !_firstEnemyTutorialShown) {
        _firstEnemyTutorialShown = true;
        setGamePaused(true);
        setTimeout(() => {
          showComicInfoBox(
            '🎯 FIRST ENEMY!',
            '<div style="text-align:left;line-height:1.8;font-size:15px;padding:4px 0">' +
            '<div style="font-size:17px;text-align:center;color:#5DADE2;margin-bottom:10px;"><b>HOW TO SURVIVE</b></div>' +
            '<p style="margin-bottom:8px;">🕹️ <b>STEER:</b> Left joystick / WASD keys to move your droplet</p>' +
            '<p style="margin-bottom:8px;">🎯 <b>AIM:</b> Right joystick / mouse to aim your shots</p>' +
            '<p style="margin-bottom:8px;">💨 <b>DASH:</b> Double-tap direction to evade quickly</p>' +
            '<p style="margin-bottom:8px;">⭐ <b>XP:</b> Collect the stars enemies drop to level up</p>' +
            '<div style="background:rgba(255,215,0,0.1);border:2px solid rgba(255,215,0,0.4);border-radius:8px;padding:8px;margin-top:8px;font-size:13px;">' +
            '💡 <b>Tip:</b> Keep moving — standing still is dangerous!</div>' +
            '</div>',
            'GOT IT! FIGHT! →',
            () => { setGamePaused(false); }
          );
        }, 300); // brief delay so the enemies are visible before popup
      }
      
      // Phase 3: Chest spawn logic - only on wave completion (every 5th wave), high combo, or quest completion
      // Remove automatic every-3rd-wave spawning for more strategic chest placement
      if (waveCount % 5 === 0) {
        // Wave completion chest
        const chestAngle = Math.random() * Math.PI * 2;
        const chestDist = 10 + Math.random() * 5; // 10-15 units from player
        const cx = player.mesh.position.x + Math.cos(chestAngle) * chestDist;
        const cz = player.mesh.position.z + Math.sin(chestAngle) * chestDist;
        spawnChest(cx, cz);
        createFloatingText('Wave Bonus Chest!', player.mesh.position, '#FFD700');
      }
    }

    // Kill Cam System - Diverse kill animations with camera effects

    function triggerKillCam(enemyPosition, isMiniBoss = false, damageType = 'physical') {
      // UPDATED: Only trigger for mini-bosses to prevent disorienting camera movements during regular combat
      // This improves player focus and reduces motion sickness from frequent camera shifts
      const shouldActivateKillCam = isMiniBoss;
      if (!shouldActivateKillCam || killCamActive) return;
      
      // Select random kill cam animation type
      const killCamTypes = [
        'zoom_in',      // Zoom camera towards kill
        'slow_motion',  // Brief slow-motion effect
        'rotate',       // Camera rotates around kill
        'shake_zoom',   // Intense shake with zoom
        'dramatic_pan'  // Pan and zoom combo
      ];
      
      killCamType = killCamTypes[Math.floor(Math.random() * killCamTypes.length)];
      killCamActive = true;
      killCamTimer = 0;
      killCamDuration = isMiniBoss ? 1.2 : 0.6; // Longer for mini-boss
      
      // Store camera's current state
      killCamData.originalCameraPos = camera.position.clone();
      killCamData.originalCameraTarget = new THREE.Vector3(player.mesh.position.x, 0, player.mesh.position.z);
      killCamData.killPosition = enemyPosition.clone();
      killCamData.isMiniBoss = isMiniBoss;
      killCamData.damageType = damageType;
      
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
      }, killCamDuration * 1000);
    }
    
    function updateKillCam(dt) {
      if (!killCamActive) return;
      
      // Safety: if kill cam data is missing or invalid, force-end to prevent crash
      if (!killCamData || !killCamData.killPosition || !killCamData.originalCameraPos) {
        console.warn('[KillCam] Invalid killCamData — force-ending kill cam');
        killCamActive = false;
        return;
      }
      
      killCamTimer += dt;
      const progress = Math.min(killCamTimer / killCamDuration, 1);
      
      // Apply different camera effects based on type
      switch (killCamType) {
        case 'zoom_in':
          // Zoom camera towards kill position
          const zoomFactor = 1 - (progress * KILL_CAM_CONSTANTS.ZOOM_IN_INTENSITY);
          const targetPos = killCamData.killPosition.clone();
          camera.position.x = killCamData.originalCameraPos.x + (targetPos.x - killCamData.originalCameraPos.x) * progress;
          camera.position.z = killCamData.originalCameraPos.z + ((targetPos.z + 15 * zoomFactor) - killCamData.originalCameraPos.z) * progress;
          camera.lookAt(targetPos.x, 0, targetPos.z);
          break;
          
        case 'slow_motion':
          // Slow motion is handled by time scale (visual effect only)
          // Add subtle zoom
          const slowZoom = 1 - (Math.sin(progress * Math.PI) * KILL_CAM_CONSTANTS.SLOW_MOTION_ZOOM);
          camera.position.x = killCamData.originalCameraPos.x;
          camera.position.y = killCamData.originalCameraPos.y;
          camera.position.z = killCamData.originalCameraPos.z * slowZoom;
          break;
          
        case 'rotate':
          // Rotate camera around kill position
          const angle = progress * Math.PI * 0.5; // 90 degree rotation
          const radius = KILL_CAM_CONSTANTS.ROTATE_CAM_RADIUS;
          const centerPos = killCamData.killPosition.clone();
          camera.position.x = centerPos.x + Math.cos(angle) * radius;
          camera.position.z = centerPos.z + Math.sin(angle) * radius;
          camera.position.y = killCamData.originalCameraPos.y;
          camera.lookAt(centerPos.x, 0, centerPos.z);
          break;
          
        case 'shake_zoom':
          // Intense shake with zoom
          const shakeIntensity = (1 - progress) * 2;
          const zoomIn = 1 - (progress * KILL_CAM_CONSTANTS.SHAKE_ZOOM_INTENSITY);
          camera.position.x = killCamData.originalCameraPos.x + (Math.random() - 0.5) * shakeIntensity;
          camera.position.y = killCamData.originalCameraPos.y + (Math.random() - 0.5) * shakeIntensity;
          camera.position.z = killCamData.originalCameraPos.z * zoomIn + (Math.random() - 0.5) * shakeIntensity;
          break;
          
        case 'dramatic_pan':
          // Pan from enemy to player with zoom
          const panProgress = Math.min(progress * 1.5, 1);
          const panTarget = new THREE.Vector3(
            killCamData.killPosition.x + (player.mesh.position.x - killCamData.killPosition.x) * panProgress,
            0,
            killCamData.killPosition.z + (player.mesh.position.z - killCamData.killPosition.z) * panProgress
          );
          // Interpolate camera position to create the actual pan motion
          const panStartPos = killCamData.originalCameraPos;
          const panEndPosZOffset = 10; // slight forward offset for a subtle zoom effect
          const panEndPos = new THREE.Vector3(
            panTarget.x,
            panStartPos.y,
            panTarget.z + panEndPosZOffset
          );
          camera.position.x = panStartPos.x + (panEndPos.x - panStartPos.x) * panProgress;
          camera.position.y = panStartPos.y + (panEndPos.y - panStartPos.y) * panProgress;
          camera.position.z = panStartPos.z + (panEndPos.z - panStartPos.z) * panProgress;
          camera.lookAt(panTarget);
          break;
      }
      
      // End kill cam
      if (progress >= 1) {
        killCamActive = false;
        // Smoothly return camera to normal position
        camera.position.copy(killCamData.originalCameraPos);
        camera.lookAt(killCamData.originalCameraTarget);
      }
    }

    // Phase 5: Updated to use Object Pool for performance
    const MAX_TOTAL_PARTICLES = 150; // Hard cap per spec
    function spawnParticles(pos, color, count) {
      if (!particlePool) return; // Safety check
      // Enforce hard particle cap for performance
      if (particles.length >= MAX_TOTAL_PARTICLES) return;
      // Cap particles per spawn to reduce quantity while keeping visuals impactful
      const cappedCount = Math.min(count, 6, MAX_TOTAL_PARTICLES - particles.length);
      for(let i=0; i<cappedCount; i++) {
        const particle = particlePool.get();
        particle.reset(pos, color);
        particles.push(particle);
      }
    }

    // Blood ground decal - small circle splat on the ground for realistic blood
    // Uses a circular buffer approach: overwrite oldest slot instead of shift() for O(1)
    let bloodDecalIndex = 0; // Current write index for circular buffer
    const BLOOD_DECAL_FADE_MS = 12000; // 12 seconds fade per spec
    function spawnBloodDecal(pos) {
      if (!scene) return;
      const now = Date.now();
      if (bloodDecals.length < MAX_BLOOD_DECALS) {
        // Buffer not full yet - append
        const size = 0.15 + Math.random() * 0.35;
        const geo = new THREE.CircleGeometry(size, 8);
        const initialOpacity = 0.6 + Math.random() * 0.3;
        const mat = new THREE.MeshStandardMaterial({
          color: 0x6B0000,
          transparent: true,
          opacity: initialOpacity,
          depthWrite: false,
          roughness: 0.15,     // Smooth reflective surface like wet blood
          metalness: 0.6,      // High metalness for glass-like reflection
          emissive: 0x3A0000,  // Subtle dark red glow
          emissiveIntensity: 0.15
        });
        const decal = new THREE.Mesh(geo, mat);
        decal.rotation.x = -Math.PI / 2;
        decal.renderOrder = 12; // Render above ground to prevent z-fighting
        decal.position.set(pos.x + (Math.random() - 0.5) * 0.8, 0.06, pos.z + (Math.random() - 0.5) * 0.8);
        decal.userData.spawnTime = now;
        decal.userData.initialOpacity = initialOpacity;
        scene.add(decal);
        bloodDecals.push(decal);
      } else {
        // Reuse existing slot (O(1) circular overwrite)
        const old = bloodDecals[bloodDecalIndex];
        const initialOpacity = 0.6 + Math.random() * 0.3;
        old.position.set(pos.x + (Math.random() - 0.5) * 0.8, 0.06, pos.z + (Math.random() - 0.5) * 0.8);
        old.material.opacity = initialOpacity;
        old.userData.spawnTime = now;
        old.userData.initialOpacity = initialOpacity;
        bloodDecalIndex = (bloodDecalIndex + 1) % MAX_BLOOD_DECALS;
      }
    }
    
    // Update blood decal fade (call in main loop)
    const BLOOD_DECAL_FADE_START = 0.7; // Start fading at 70% of lifetime
    function updateBloodDecals() {
      const now = Date.now();
      // Use backward iteration so we can splice without index issues
      for (let i = bloodDecals.length - 1; i >= 0; i--) {
        const decal = bloodDecals[i];
        // Skip entries that have already been disposed externally (air blood pools)
        if (!decal.userData.spawnTime) {
          if (!decal.parent) {
            bloodDecals.splice(i, 1);
          }
          continue;
        }
        const age = now - decal.userData.spawnTime;
        if (age >= BLOOD_DECAL_FADE_MS) {
          // Fully expired — remove from scene, dispose, and purge from array
          if (decal.parent) scene.remove(decal);
          if (decal.geometry) decal.geometry.dispose();
          if (decal.material) decal.material.dispose();
          bloodDecals.splice(i, 1);
        } else if (age > BLOOD_DECAL_FADE_MS * BLOOD_DECAL_FADE_START) {
          // Start fading at 70% of lifetime
          const fadeProgress = (age - BLOOD_DECAL_FADE_MS * BLOOD_DECAL_FADE_START) / (BLOOD_DECAL_FADE_MS * (1 - BLOOD_DECAL_FADE_START));
          decal.material.opacity = (decal.userData.initialOpacity || 0.7) * (1 - fadeProgress);
        }
      }
    }
    
    // Enhanced muzzle smoke effect - managed array to avoid RAF accumulation
    // Shared smoke geometry — avoids per-particle geometry allocations
    let _sharedSmokeSphereGeo = null;
    function _ensureSharedSmokeGeo() {
      if (!_sharedSmokeSphereGeo && typeof THREE !== 'undefined') {
        _sharedSmokeSphereGeo = new THREE.SphereGeometry(0.04, 4, 4); // Reduced segments 6→4
      }
    }

    function spawnMuzzleSmoke(pos, count = 5) {
      const cappedCount = Math.min(count, 3); // Cap per-call count
      _ensureSharedSmokeGeo();
      for(let i = 0; i < cappedCount; i++) {
        // Enforce global cap - just skip if full, particles expire naturally
        if (smokeParticles.length >= MAX_SMOKE_PARTICLES) continue;
        const smokeMat = new THREE.MeshBasicMaterial({ 
          color: 0x666666, 
          transparent: true, 
          opacity: 0.5,
          depthWrite: false
        });
        const smoke = new THREE.Mesh(_sharedSmokeSphereGeo, smokeMat);
        smoke.position.set(
          pos.x + (Math.random() - 0.5) * 0.3,
          pos.y + 0.5,
          pos.z + (Math.random() - 0.5) * 0.3
        );
        scene.add(smoke);
        smokeParticles.push({
          mesh: smoke,
          material: smokeMat,
          geometry: _sharedSmokeSphereGeo,
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

    function spawnExp(x, z, sourceWeapon, hitForce) {
      expGems.push(new ExpGem(x, z, sourceWeapon, hitForce));
    }
    
    function spawnGold(x, z, amount) {
      goldCoins.push(new GoldCoin(x, z, amount));
    }
    
    function spawnChest(x, z, tier = 'common') {
      chests.push(new Chest(x, z, tier));
      createFloatingText('CHEST!', new THREE.Vector3(x, 0.3, z));
    }
    
    function addGold(amount) {
      // Apply gold bonus from permanent upgrades
      const bonus = PERMANENT_UPGRADES.goldEarned.effect(saveData.upgrades.goldEarned);
      const finalAmount = Math.floor(amount * (1 + bonus));
      playerStats.gold += finalAmount;
      saveData.gold += finalAmount;
      saveData.totalGoldEarned += finalAmount;
      updateHUD();
      updateGoldDisplays();
    }
    
    function updateGoldDisplays() {
      const goldText = `GOLD: ${saveData.gold}`;
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
      scene.add(mesh);
      
      // Animate falling
      let life = 20;
      const update = () => {
        life--;
        mesh.position.y -= 0.02;
        mat.opacity = life / 20;
        if (life <= 0 || mesh.position.y <= 0.05) {
          scene.remove(mesh);
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
      
      // Phase 5: Give companion XP (10% of player XP)
      if (activeCompanion && !activeCompanion.isDead) {
        activeCompanion.addXP(amount);
      }
      
      // Trigger waterdrop grow animation on XP pickup
      const waterdropContainer = document.getElementById('waterdrop-container');
      if (waterdropContainer) {
        waterdropContainer.classList.add('grow');
        setTimeout(() => {
          waterdropContainer.classList.remove('grow');
        }, 300);
      }
      
      if (playerStats.exp >= playerStats.expReq && !isGameOver && isGameActive && !levelUpPending) {
        levelUp();
      }
      updateHUD();
    }

    function levelUp(freeLevel = false) {
      if (levelUpPending) return; // Prevent double-trigger
      levelUpPending = true;
      setGamePaused(true);
      
      // Lock camera during level-up to prevent zoom changes
      // Save both position and projection for proper restoration
      savedCameraPosition = { 
        x: camera.position.x, 
        y: camera.position.y, 
        z: camera.position.z,
        left: camera.left,
        right: camera.right,
        top: camera.top,
        bottom: camera.bottom
      };
      
      // Pause combo timer during level-up (only if combo is still active)
      if (comboState.lastKillTime && comboState.count >= 5) {
        const currentTime = Date.now();
        const timeSinceLastKill = currentTime - comboState.lastKillTime;
        // Only pause if combo hasn't expired yet
        if (timeSinceLastKill < comboState.comboWindow) {
          comboState.pausedAt = currentTime;
        }
      }
      
      playerStats.lvl++;
      // Notify the super stat bar — rarity escalates with milestone levels
      if (window.pushSuperStatEvent) {
        const lvl = playerStats.lvl;
        const r = lvl >= 50 ? 'mythic' : lvl >= 25 ? 'legendary' : lvl >= 10 ? 'epic' : lvl >= 5 ? 'rare' : 'uncommon';
        window.pushSuperStatEvent(`\u2B06 Level ${lvl}!`, r, '\u2728', 'success');
      }
      if (!freeLevel) {
        playerStats.exp -= playerStats.expReq;
      }
      
      // Victory condition: Reaching level 100
      if (playerStats.lvl === 100) {
        // Reset immediately so the game doesn't stay stuck in paused/pending state
        // while the victory message and gameOver() are deferred
        levelUpPending = false;
        setGamePaused(false);
        setTimeout(() => {
          showStatChange('🎉 ULTIMATE VICTORY! You reached Level 100! 🎉');
          setTimeout(() => {
            gameOver(); // Show game over screen as victory screen
          }, 2000);
        }, 1000);
        return;
      }
      
      // XP Curve: 1.5x growth when leveling up to levels 2-5 (rapid early pace),
      // then formula-based for level 6+ to make Level 100 require meaningful grinding.
      if (playerStats.lvl <= 5) {
        playerStats.expReq = Math.floor(playerStats.expReq * 1.5);
      } else {
        playerStats.expReq = Math.floor(GAME_CONFIG.baseExpReq * playerStats.lvl * 1.15);
      }
      
      // Wrap synchronous pre-modal operations in try-catch so that any unexpected
      // exception cannot prevent the level-up setTimeouts from being registered,
      // which would otherwise leave the game permanently frozen.
      try {
        // Check for level achievements
        checkAchievements();
        
        // SLOW MOTION EFFECT - Time slows, sounds pitch down
        createSlowMotionEffect();
        
        // NEW: Centered LEVEL UP text animation (grow → shrink → fade)
        createCenteredLevelUpText();

        // Performance: drop to low pixel ratio during level-up transition to avoid GPU spike
        if (renderer) renderer.setPixelRatio(0.55);
      } catch(e) {
        console.error('[LevelUp] Pre-modal synchronous error:', e);
      }
      
      // Level up visual effects with delay for slow-mo
      setTimeout(() => {
        try {
          createLevelUpEffects();
          playSound('levelup');
        } catch(e) {
          console.error('[LevelUp] Effects error:', e);
        }
      }, 300);
      
      // Show upgrade modal with dramatic entrance after effects - FASTER
      setTimeout(() => {
        try {
          showUpgradeModal();
          // Restore world pixel ratio now that the heavy transition is done
          if (renderer) renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDERER_CONFIG.worldPixelRatio));
        } catch(e) {
          console.error('[LevelUp] showUpgradeModal error:', e);
          // Fallback: resume game so player isn't stuck
          if (renderer) renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDERER_CONFIG.worldPixelRatio));
          levelUpPending = false;
          setGamePaused(false);
        }
      }, 800);
    }
    
    function checkPendingLevelUp() {
      levelUpPending = false;
      if (pendingQuestLevels > 0 && !isGameOver && isGameActive) {
        // Process queued quest-reward levels first (free, no XP cost)
        pendingQuestLevels--;
        levelUp(true);
      } else if (playerStats && playerStats.exp >= playerStats.expReq && !isGameOver && isGameActive) {
        levelUp();
      }
    }
    window.checkPendingLevelUp = checkPendingLevelUp;

    // Hard-reset pause state and check for pending level-ups.
    // Call this whenever the level-up modal is dismissed (card pick, skip, X button)
    // so that stacked pauseOverlayCount from achievement / quest overlays never freezes the game.
    function forceGameUnpause() {
      pauseOverlayCount = 0;
      window.pauseOverlayCount = 0;
      isPaused = false;
      window.isPaused = false;
      if (typeof _syncJoystickZone === 'function') _syncJoystickZone();
      checkPendingLevelUp();
    }
    window.forceGameUnpause = forceGameUnpause;

    // Queue all free (quest-reward) level-ups and process them one-at-a-time after each upgrade
    // modal is dismissed, so the player sees an upgrade choice for every level gained.
    // Safe for multiple concurrent callers (JavaScript is single-threaded): if a second quest
    // fires awardLevels while the first is already in progress, all levels go into the queue.
    function awardLevels(count) {
      if (!count || count < 1) return;
      if (levelUpPending) {
        // A level-up is already in progress; queue all levels for later
        pendingQuestLevels += count;
      } else {
        // Start the first level-up now, queue the rest
        pendingQuestLevels += (count - 1);
        levelUp(true); // Free level — no XP deduction
      }
    }

    // NEW: "LEVEL UP!" text that shoots from character's head
    function createCenteredLevelUpText() {
      const levelUpText = document.createElement('div');
      
      // Calculate character head position on screen
      let startX = window.innerWidth / 2;
      let startY = window.innerHeight / 2;
      if (player && player.mesh && camera) {
        const headPos = player.mesh.position.clone();
        headPos.y += 2; // Above player
        headPos.project(camera);
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
      vec.project(camera);
      
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
          @keyframes swooshFromTopLeft {
            0% { transform: translate(-120%, -120%) scale(0.3) rotate(-15deg); opacity: 0; }
            70% { transform: translate(5%, 5%) scale(1.05) rotate(1deg); opacity: 1; }
            100% { transform: translate(0, 0) scale(1) rotate(0deg); opacity: 1; }
          }
          @keyframes swooshFromTopRight {
            0% { transform: translate(120%, -120%) scale(0.3) rotate(15deg); opacity: 0; }
            70% { transform: translate(-5%, 5%) scale(1.05) rotate(-1deg); opacity: 1; }
            100% { transform: translate(0, 0) scale(1) rotate(0deg); opacity: 1; }
          }
          @keyframes swooshFromBottomLeft {
            0% { transform: translate(-120%, 120%) scale(0.3) rotate(15deg); opacity: 0; }
            70% { transform: translate(5%, -5%) scale(1.05) rotate(-1deg); opacity: 1; }
            100% { transform: translate(0, 0) scale(1) rotate(0deg); opacity: 1; }
          }
          @keyframes swooshFromBottomRight {
            0% { transform: translate(120%, 120%) scale(0.3) rotate(-15deg); opacity: 0; }
            70% { transform: translate(-5%, -5%) scale(1.05) rotate(1deg); opacity: 1; }
            100% { transform: translate(0, 0) scale(1) rotate(0deg); opacity: 1; }
          }
          @keyframes levelUpFly {
            0% { transform: translateY(0) scale(1); opacity: 1; }
            40% { transform: translateY(-30px) scale(1.1); opacity: 1; }
            100% { transform: translateY(0) scale(1); opacity: 1; }
          }
        `;
        document.head.appendChild(style);
      }
      
      setTimeout(() => {
        slowMoOverlay.remove();
      }, 1500);
    }
    
    function createLevelUpEffects() {
      // Water drop spray effect — small water drops that fly from character and land on ground
      // Uses BloodSystem with blue water colors for performance (pool-based, no GC spikes)
      const pos = player.mesh.position;
      if (window.BloodSystem) {
        // Main water burst — blue drops spraying outward and upward (reduced count for performance)
        window.BloodSystem.emitBurst(pos, 20, {
          spreadXZ: 0.5,
          spreadY: 1.4,
          minLife: 60,
          maxLife: 110,
          minSize: 0.05,
          maxSize: 0.12,
          color1: 0x5DADE2, // water blue
          color2: 0x85C1E9  // lighter blue
        });
        // White sparkle droplets (spray highlight, reduced count for performance)
        window.BloodSystem.emitBurst(pos, 10, {
          spreadXZ: 0.35,
          spreadY: 1.8,
          minLife: 40,
          maxLife: 75,
          minSize: 0.03,
          maxSize: 0.07,
          color1: 0xDDF3FF,
          color2: 0xFFFFFF
        });
        // Delayed secondary drips — fly upward then drip down (reduced count for performance)
        setTimeout(() => {
          if (!player || !player.mesh) return;
          window.BloodSystem.emitBurst(player.mesh.position, 12, {
            spreadXZ: 0.25,
            spreadY: 1.0,
            minLife: 70,
            maxLife: 120,
            minSize: 0.04,
            maxSize: 0.09,
            color1: 0x1A8FC1,
            color2: 0x5DADE2
          });
        }, 150);
      } else {
        // Fallback: use spawnParticles pool
        spawnParticles(pos, COLORS.player, 25);
        spawnParticles(pos, 0xFFFFFF, 8);
        spawnParticles(pos, 0x5DADE2, 15);
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
        scene.add(this.mesh);
        this.life = 20; // Reduced from 30 for performance
        this.maxLife = 20;
      }
      
      update() {
        this.life--;
        this.mesh.material.opacity = this.life / this.maxLife;
        
        if (this.life <= 0) {
          scene.remove(this.mesh);
          this.mesh.geometry.dispose();
          this.mesh.material.dispose();
          return false;
        }
        return true;
      }
    }
    
    // Floating text fade tracking to prevent memory leaks
    let floatingTextFadeInterval = null;
    let floatingTextFadeTimeout = null;
    
    function createFloatingText(text, pos) {
      // Display message in status bar instead of floating text
      const statusEl = document.getElementById('status-message');
      if (!statusEl) return;
      
      // Clear any existing fade interval and timeout
      if (floatingTextFadeInterval) {
        clearInterval(floatingTextFadeInterval);
        floatingTextFadeInterval = null;
      }
      if (floatingTextFadeTimeout) {
        clearTimeout(floatingTextFadeTimeout);
        floatingTextFadeTimeout = null;
      }
      
      statusEl.innerText = text;
      statusEl.style.color = '#FF4444'; // Red for important messages like mini-boss
      statusEl.style.fontSize = '18px';
      statusEl.style.opacity = '1';
      
      // Clear after 4 seconds with fade out
      floatingTextFadeTimeout = setTimeout(() => {
        let opacity = 1;
        floatingTextFadeInterval = setInterval(() => {
          opacity -= 0.05;
          if (opacity <= 0) {
            clearInterval(floatingTextFadeInterval);
            floatingTextFadeInterval = null;
            statusEl.innerText = '';
            statusEl.style.opacity = '1';
            statusEl.style.fontSize = '16px';
          } else {
            statusEl.style.opacity = opacity.toString();
          }
        }, 50);
      }, 4000);
    }

