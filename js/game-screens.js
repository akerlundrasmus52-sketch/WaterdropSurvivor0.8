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
        () => {
          const p = new Particle(new THREE.Vector3(0, 0, 0), 0xFFFFFF);
          p.mesh.visible = false;
          return p;
        },
        (particle) => {
          // Keep pooled particles out of the scene to avoid stranded meshes
          if (scene && particle.mesh.parent === scene) scene.remove(particle.mesh);
          particle.mesh.visible = false;
          particle.mesh.position.set(0, -9999, 0);
          if (particle.vel) particle.vel.set(0, 0, 0);
          particle.life = 0;
        },
        100
      );

      // Pre-allocate blood-drop and meat-chunk pools (500 + 200 meshes, zero GC during gameplay)
      if (typeof window._ensureEntityPools === 'function') window._ensureEntityPools();

      // Initialize advanced blood particle system (THREE.Points, 50k particles)
      if (window.BloodSystem && typeof THREE !== 'undefined') window.BloodSystem.init(scene);
      // Pre-warm global mesh pools (trail dots + meat chunks) so first firefight has no alloc cost.
      if (window.GameObjectPool) window.GameObjectPool.prewarm();
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
      // logarithmicDepthBuffer: true prevents z-fighting on older mobile GPUs (e.g. Samsung S10)
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        precision: 'mediump',
        logarithmicDepthBuffer: true
      });
      renderer.setSize(window.innerWidth, window.innerHeight);
      // Cap pixel ratio at 2 to sharpen graphics on high-DPI screens without destroying frame rate.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDERER_CONFIG.worldPixelRatio));
      // Track current pixel ratio for dynamic quality scaler and debug display
      window._currentPixelRatio = Math.min(window.devicePixelRatio, RENDERER_CONFIG.worldPixelRatio);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      // Disable auto shadow map updates — we control updates manually in the render loop
      // for every-2nd-frame optimization (saves ~2-4ms per skipped frame on mobile)
      renderer.shadowMap.autoUpdate = false;
      // Brightness & contrast: sRGB output applies gamma correction so mid-tones appear
      // correctly lit rather than washed-out dark on device displays.
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      // ACES Filmic tone mapping gives a cinematic, naturally bright result on mobile.
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.4;
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
      // Using camp-style lighting: warmer ambient + cooler directional for depth
      window.ambientLight = new THREE.AmbientLight(0xffeedd, 0.65); // Warm ambient (reduced intensity)
      scene.add(window.ambientLight);

      // Realistic sun/moon with soft dynamic shadows
      const frustumHalf = RENDERER_CONFIG.shadowFrustumHalfSize;
      window.dirLight = new THREE.DirectionalLight(0xffffee, 0.9); // Warm daylight (reduced intensity)
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

      // Camp-style atmospheric point light (subtle fill)
      // Creates warmth and depth like the campfire in camp scene
      window.fillLight = new THREE.PointLight(0xffaa66, 0.4, 40, 2);
      window.fillLight.position.set(0, 5, 0); // Above center of world
      scene.add(window.fillLight);

      // Apply graphics quality settings
      // For 'auto' mode, start at 'medium' and let the FPS booster adjust from there
      // Use window.applyGraphicsQuality (exposed by world-gen.js) with a typeof guard to prevent
      // "not defined" crashes if the function hasn't been set yet.
      const _applyGfx = window.applyGraphicsQuality || null;
      if (_applyGfx) {
        if (gameSettings.graphicsQuality === 'auto') {
          _applyGfx('medium');
        } else {
          _applyGfx(gameSettings.graphicsQuality);
        }
      } else {
        console.warn('[Init] applyGraphicsQuality not yet defined — skipping initial quality pass.');
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
      // Apply the correct camera frustum immediately (especially important for landscape
      // mode where onWindowResize zooms out by 50% to show the full map on first load).
      onWindowResize();

      // Track first user interaction so audio context and speech synthesis can be
      // safely unlocked on demand (browser autoplay policy requires a user gesture).
      if (!window._audioContextUnlocked) {
        const _unlockAudio = function() {
          window._audioContextUnlocked = true;
          // Resume the global audio context if it was suspended before user gesture.
          if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'suspended') {
            try { audioCtx.resume(); } catch (e) {}
          }
          window.removeEventListener('click',      _unlockAudio, true);
          window.removeEventListener('keydown',    _unlockAudio, true);
          window.removeEventListener('touchstart', _unlockAudio, true);
          window.removeEventListener('pointerdown',_unlockAudio, true);
        };
        window.addEventListener('click',      _unlockAudio, true);
        window.addEventListener('keydown',    _unlockAudio, true);
        window.addEventListener('touchstart', _unlockAudio, true);
        window.addEventListener('pointerdown',_unlockAudio, true);
      }

      // --- Initialise new performance & visual systems ---
      // Instanced renderer for batched draw calls
      if (window.InstancedRenderer && window.InstancedRenderer.createInstancedRenderer) {
        try {
          window._instancedRenderer = window.InstancedRenderer.createInstancedRenderer(scene);
          console.log('[Init] Instanced renderer created OK');
        } catch (e) { console.warn('[Init] Instanced renderer skipped:', e.message); }
      }
      // Projectile pool — eliminates `new Projectile()` allocations inside animate().
      // Pre-warms 60 bullet objects (mesh + material created once, reused for every shot).
      if (window.GamePerformance && window.GamePerformance.EnhancedObjectPool) {
        try {
          window._projectilePool = new window.GamePerformance.EnhancedObjectPool(
            () => {
              const p = new Projectile(); // no args → mesh created but NOT added to scene
              p._isPooled = true;
              return p;
            },
            (p) => {
              // Full state reset when returned to pool — prevents ghost rendering on re-acquire
              p.active = false;
              p.life = 0;
              p.vx = 0; p.vz = 0;
              p.mesh.visible = false;
              p.mesh.position.set(0, -9999, 0); // park far off-screen
              p.mesh.scale.set(1, 1, 1);
              p.mesh.material.opacity = 0.95;
              if (p.glow) {
                p.glow.visible = false;
                p.glow.position.set(0, -9999, 0);
                p.glow.material.opacity = 0;
              }
            },
            60
          );
          console.log('[Init] Projectile pool created OK');
        } catch (e) { console.warn('[Init] Projectile pool skipped:', e.message); }
      }
      // GC guard — pre-allocate temp vectors
      if (window.PerfManager && window.PerfManager.GCGuard) {
        window.PerfManager.GCGuard.init();
      }
      // Dopamine camera FX
      if (window.DopamineSystem && window.DopamineSystem.CameraFX) {
        window.DopamineSystem.CameraFX.init(camera);
      }
      // Dynamic projectile lighting pool
      if (window.AdvancedPhysics && window.AdvancedPhysics.ProjectileLightPool) {
        try {
          window._projectileLightPool = new window.AdvancedPhysics.ProjectileLightPool(scene, 8);
          console.log('[Init] Projectile light pool created OK');
        } catch (e) { console.warn('[Init] Projectile lights skipped:', e.message); }
      }
      // Dynamic ground shadows for projectiles
      if (window.AdvancedPhysics && window.AdvancedPhysics.DynamicShadows) {
        try {
          window.AdvancedPhysics.DynamicShadows.init(scene);
        } catch (e) { console.warn('[Init] Dynamic shadows skipped:', e.message); }
      }
      console.log('[Init] New performance & visual systems initialised OK');
      
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
      _roundStartCinematicActive = true;
      const origLeft = camera.left;
      const origRight = camera.right;
      const origTop = camera.top;
      const origBottom = camera.bottom;
      const origPosY = camera.position.y;

      // Save and temporarily lift fog so the entire map is visible during the aerial shot
      const origFogNear = scene.fog ? scene.fog.near : null;
      const origFogFar  = scene.fog ? scene.fog.far  : null;
      if (scene.fog) { scene.fog.near = 500; scene.fog.far = 2000; }

      // Zoom out: 8x wider frustum + raise camera high for dramatic top-down sweep
      camera.left   = origLeft   * 8;
      camera.right  = origRight  * 8;
      camera.top    = origTop    * 8;
      camera.bottom = origBottom * 8;
      camera.position.y = origPosY + 60;
      camera.updateProjectionMatrix();

      // Region label data (optimized positions - 40% more compact)
      const regions = [
        { label: '⚙️ Windmill',       wx: 18,  wy: 0, wz: 18  },
        { label: '⛰️ Montana',        wx: 0,   wy: 0, wz: -60 },
        { label: '⚡ Eiffel Tower',    wx: -50, wy: 0, wz: 90  },
        { label: '🗿 Stonehenge',      wx: 35,  wy: 0, wz: 30  },
        { label: '🔺 Pyramid',         wx: 25,  wy: 0, wz: -20 },
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
        const zoomDuration = 1500;
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

          // Smoothly restore fog during zoom-in
          if (scene.fog && origFogNear !== null) {
            scene.fog.near = 500 + (origFogNear - 500) * ease;
            scene.fog.far  = 2000 + (origFogFar  - 2000) * ease;
          }

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

            // Restore fog exactly
            if (scene.fog && origFogNear !== null) {
              scene.fog.near = origFogNear;
              scene.fog.far  = origFogFar;
            }

            // Clean up DOM
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);

            // Allow game loop to resume camera control
            _roundStartCinematicActive = false;
            callback();
          }
        }
        requestAnimationFrame(animateZoom);
      }, 2500);
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

      // Apply Neural Matrix upgrades for this run
      if (window.NeuralMatrix) window.NeuralMatrix.applyToRun(playerStats);

      // Reset Event Horizon holes and blood pool counter at run start
      window._eventHorizonHoles = [];
      window._activeBloodPools = 0;

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
    // TRASH & RECYCLE — Drag-and-drop gear into grinder + craft sections
    // ============================================================
    function showRecycleScreen() {
      const existing = document.getElementById('recycle-overlay');
      if (existing) existing.remove();

      const RARITY_COLORS = { common:'#aaaaaa', uncommon:'#55cc55', rare:'#44aaff', epic:'#aa44ff', legendary:'#ffaa00' };
      const RARITY_METAL  = { common:1, uncommon:2, rare:3, epic:5, legendary:8 };
      const RARITY_LEATHER= { common:0, uncommon:0, rare:1, epic:2, legendary:3 };

      const overlay = document.createElement('div');
      overlay.id = 'recycle-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:600;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;overflow-y:auto;padding:16px 6px 40px;box-sizing:border-box;';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

      // ── Floating reward text helper ──────────────────────────────
      function _showRewardFloat(text, color, x, y) {
        const el = document.createElement('div');
        el.textContent = text;
        el.style.cssText = `position:fixed;left:${x}px;top:${y}px;color:${color};font-family:Bangers,cursive;font-size:20px;font-weight:900;letter-spacing:2px;pointer-events:none;z-index:700;text-shadow:0 0 8px ${color};transition:opacity 1.2s,transform 1.2s;`;
        document.body.appendChild(el);
        requestAnimationFrame(() => {
          el.style.opacity = '0';
          el.style.transform = 'translateY(-60px)';
        });
        setTimeout(() => el.remove(), 1300);
      }

      function _refreshRecycle() {
        const res = window.GameHarvesting ? window.GameHarvesting.getResources() : {};
        const r = res || {};

        // Get unequipped inventory items (gear that can be recycled)
        const equippedIds = new Set(Object.values(saveData.equippedGear || {}));
        const recyclableItems = (saveData.inventory || []).filter(g => !equippedIds.has(g.id));

        overlay.innerHTML = `
          <div style="max-width:700px;width:100%;color:#fff;font-family:Bangers,cursive;">
            <div style="font-size:clamp(18px,4vw,28px);letter-spacing:3px;text-align:center;color:#FFD700;text-shadow:0 0 12px rgba(255,215,0,0.6);margin-bottom:4px;">♻️ TRASH &amp; RECYCLE</div>
            <div style="font-family:Arial,sans-serif;font-size:12px;color:#aaa;text-align:center;margin-bottom:14px;">Drag gear cards into the grinder · Craft Leather from Skins · Cook Food</div>

            <!-- Drag-and-drop section -->
            <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;">

              <!-- Left: Inventory items -->
              <div style="flex:1;min-width:180px;">
                <div style="font-size:1.05em;color:#90CAF9;margin-bottom:8px;letter-spacing:1px;">📦 INVENTORY (drag to grinder)</div>
                <div id="recycle-inv-grid" style="display:flex;flex-wrap:wrap;gap:8px;min-height:80px;border:1px dashed #334;border-radius:8px;padding:8px;">
                  ${recyclableItems.length === 0
                    ? '<div style="font-family:Arial,sans-serif;font-size:12px;color:#555;margin:auto;padding:12px;">No unequipped gear to recycle</div>'
                    : recyclableItems.map(g => {
                        const rc = RARITY_COLORS[g.rarity] || '#aaa';
                        const icon = g.icon || (g.type === 'weapon' ? '⚔️' : g.type === 'helmet' ? '🪖' : g.type === 'armor' ? '🛡️' : g.type === 'boots' ? '👢' : '💍');
                        const statLine = g.stats ? Object.entries(g.stats).slice(0,2).map(([k,v]) => `${k}:${v}`).join(' ') : '';
                        return `<div class="recycle-item-card" draggable="true" data-item-id="${g.id}"
                          style="width:75px;background:rgba(20,20,40,0.9);border:2px solid ${rc};border-radius:8px;padding:6px 4px;cursor:grab;text-align:center;filter:drop-shadow(0 2px 6px ${rc}66);user-select:none;-webkit-user-select:none;">
                          <div style="font-size:22px;">${icon}</div>
                          <div style="font-family:Arial,sans-serif;font-size:9px;color:${rc};margin-top:3px;word-break:break-word;line-height:1.3;">${g.name || 'Gear'}</div>
                          <div style="font-family:Arial,sans-serif;font-size:9px;color:#888;margin-top:2px;">${g.rarity || 'common'}</div>
                          ${statLine ? `<div style="font-family:monospace;font-size:8px;color:#aaa;margin-top:2px;">${statLine}</div>` : ''}
                        </div>`;
                      }).join('')
                  }
                </div>
              </div>

              <!-- Right: Grinder drop zone -->
              <div style="flex:0 0 160px;display:flex;flex-direction:column;align-items:center;">
                <div style="font-size:1.05em;color:#F9A825;margin-bottom:8px;letter-spacing:1px;">⚙️ GRINDER</div>
                <div id="recycle-grinder-drop"
                  style="width:140px;height:140px;border:3px dashed #F9A825;border-radius:12px;background:rgba(30,20,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:copy;position:relative;transition:border-color 0.2s,background 0.2s;filter:drop-shadow(0 0 8px #F9A82544);">
                  <div style="font-size:42px;">⚙️</div>
                  <div style="font-family:Arial,sans-serif;font-size:11px;color:#F9A825;margin-top:6px;text-align:center;">Drop gear here<br>to recycle</div>
                </div>
                <div style="font-family:Arial,sans-serif;font-size:10px;color:#888;margin-top:6px;text-align:center;">common=1🔩  uncommon=2🔩<br>rare=3🔩+1🟫  epic=5🔩+2🟫<br>legendary=8🔩+3🟫</div>
              </div>
            </div>

            <!-- Craft sections -->
            <div id="recycle-craft-content"></div>

            <button id="recycle-close-btn" style="display:block;margin:14px auto 0;background:transparent;border:2px solid #888;color:#ccc;font-family:Bangers,cursive;font-size:1.1em;letter-spacing:2px;padding:8px 28px;border-radius:8px;cursor:pointer;">CLOSE</button>
          </div>`;

        document.getElementById('recycle-close-btn').onclick = () => overlay.remove();

        // Craft sections
        const canLeather = (r.animalSkin || 0) >= 2;
        const canFood    = (r.meat || 0) >= 1;
        const craftHTML = `
          <div style="background:rgba(30,30,50,0.9);border:2px solid ${canLeather?'#654321':'#333'};border-radius:10px;padding:12px;margin-bottom:8px;">
            <div style="font-size:1.1em;color:#F5CBA7;margin-bottom:5px;">🟫 Craft Leather</div>
            <div style="font-family:Arial,sans-serif;font-size:12px;color:#bbb;margin-bottom:7px;">2 🐾 Animal Skin → 1 🟫 Leather &nbsp;|&nbsp; Have: <b style="color:${canLeather?'#2ecc71':'#e74c3c'}">${r.animalSkin||0}</b></div>
            <button onclick="window._craftLeather()" ${canLeather?'':'disabled'} style="background:${canLeather?'#3E2723':'#222'};border:2px solid ${canLeather?'#8D6E63':'#555'};color:${canLeather?'#fff':'#666'};font-family:Bangers,cursive;font-size:1em;letter-spacing:1px;padding:5px 16px;border-radius:7px;cursor:${canLeather?'pointer':'default'};">CRAFT LEATHER</button>
          </div>
          <div style="background:rgba(30,30,50,0.9);border:2px solid ${canFood?'#CC4400':'#333'};border-radius:10px;padding:12px;margin-bottom:8px;">
            <div style="font-size:1.1em;color:#FDEBD0;margin-bottom:5px;">🍲 Cook Food</div>
            <div style="font-family:Arial,sans-serif;font-size:12px;color:#bbb;margin-bottom:7px;">1 🍖 Meat → 1 🍲 Food &nbsp;|&nbsp; Have: <b style="color:${canFood?'#2ecc71':'#e74c3c'}">${r.meat||0}</b></div>
            <button onclick="window._craftMeal()" ${canFood?'':'disabled'} style="background:${canFood?'#7B3F00':'#222'};border:2px solid ${canFood?'#CC7700':'#555'};color:${canFood?'#fff':'#666'};font-family:Bangers,cursive;font-size:1em;letter-spacing:1px;padding:5px 16px;border-radius:7px;cursor:${canFood?'pointer':'default'};">COOK MEAL</button>
          </div>`;
        const craftEl = document.getElementById('recycle-craft-content');
        if (craftEl) craftEl.innerHTML = craftHTML;

        // Set up drag-and-drop on item cards
        const cards = overlay.querySelectorAll('.recycle-item-card');
        cards.forEach(card => {
          card.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', card.dataset.itemId);
            card.style.opacity = '0.45';
            card.style.cursor = 'grabbing';
          });
          card.addEventListener('dragend', () => {
            card.style.opacity = '1';
            card.style.cursor = 'grab';
          });
        });

        // Set up grinder drop zone
        const grinder = document.getElementById('recycle-grinder-drop');
        if (grinder) {
          grinder.addEventListener('dragover', e => {
            e.preventDefault();
            grinder.style.borderColor = '#ffff00';
            grinder.style.background = 'rgba(60,40,0,0.95)';
          });
          grinder.addEventListener('dragleave', () => {
            grinder.style.borderColor = '#F9A825';
            grinder.style.background = 'rgba(30,20,0,0.85)';
          });
          grinder.addEventListener('drop', e => {
            e.preventDefault();
            grinder.style.borderColor = '#F9A825';
            grinder.style.background = 'rgba(30,20,0,0.85)';
            const itemId = e.dataTransfer.getData('text/plain');
            window.recycleItemById(itemId, e.clientX, e.clientY);
          });
        }
      }

      // ── Global helpers ────────────────────────────────────────────
      window.recycleItemById = function(itemId, mouseX, mouseY) {
        const inv = saveData.inventory || [];
        const idx = inv.findIndex(g => g.id === itemId);
        if (idx === -1) return;
        const item = inv[idx];
        const rarity = (item.rarity || 'common').toLowerCase();
        const metalAmt   = RARITY_METAL[rarity]   || 1;
        const leatherAmt = RARITY_LEATHER[rarity]  || 0;

        // Grind animation: briefly spin the gear icon
        const grinder = document.getElementById('recycle-grinder-drop');
        if (grinder) {
          const gear = grinder.querySelector('div');
          if (gear) {
            gear.style.transition = 'transform 0.6s';
            gear.style.transform = 'rotate(360deg)';
            setTimeout(() => { gear.style.transition = ''; gear.style.transform = ''; }, 650);
          }
          grinder.style.borderColor = '#ffff00';
          setTimeout(() => { if (grinder) grinder.style.borderColor = '#F9A825'; }, 700);
        }

        // Remove item from inventory
        saveData.inventory.splice(idx, 1);

        // Add rewards
        if (window.GameHarvesting) {
          window.GameHarvesting.recycleToMetal('item', metalAmt);
          // Add leather directly if possible
          if (leatherAmt > 0) {
            const res = window.GameHarvesting.getResources();
            if (res) {
              res.leather = (res.leather || 0) + leatherAmt;
            }
          }
        }
        saveSaveData();
        if (typeof playSound === 'function') playSound('collect');

        // Floating reward text
        const mx = mouseX || window.innerWidth / 2;
        const my = mouseY || window.innerHeight / 2;
        _showRewardFloat('+' + metalAmt + ' 🔩 Metal' + (leatherAmt > 0 ? '  +' + leatherAmt + ' 🟫 Leather' : ''), RARITY_COLORS[rarity] || '#ffaa00', mx - 60, my - 40);

        setTimeout(() => _refreshRecycle(), 300);
      };

      window._recycleWeapon = () => {
        if (window.GameHarvesting) {
          window.GameHarvesting.recycleToMetal('weapon', 2);
          saveSaveData();
          _refreshRecycle();
          if (typeof playSound === 'function') playSound('collect');
        }
      };
      window._craftLeather = () => {
        if (window.GameHarvesting && window.GameHarvesting.craftLeather()) {
          saveSaveData();
          _refreshRecycle();
          if (typeof playSound === 'function') playSound('levelup');
        }
      };
      window._craftMeal = () => {
        if (window.GameHarvesting && window.GameHarvesting.craftMeal()) {
          saveSaveData();
          _refreshRecycle();
          if (typeof playSound === 'function') playSound('levelup');
        }
      };

      _refreshRecycle();
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
    // ============================================================
    // BUILDING OVERLAY HELPERS — unified frosted-glass design
    // ============================================================

    /** Close a camp building panel with a slide-down animation, then remove the overlay. */
    function _closeBldOverlay(overlay) {
      const panel = overlay.querySelector('.camp-bld-panel');
      if (panel) {
        panel.classList.add('closing');
        setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 210);
      } else {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }
    }

    // ============================================================
    // WORKSHOP — Gathering skill upgrades (frosted-glass redesign)
    // ============================================================
    function showWorkshop() {
      const existing = document.getElementById('workshop-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'workshop-overlay';
      overlay.className = 'camp-bld-overlay';
      overlay.style.cssText += 'z-index:500;';

      const panel = document.createElement('div');
      panel.className = 'camp-bld-panel';

      // Header
      const header = document.createElement('div');
      header.className = 'camp-bld-header';
      header.innerHTML = '<span class="camp-bld-title">🔧 WORKSHOP</span>';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'camp-bld-close-btn';
      closeBtn.textContent = '✕';
      closeBtn.title = 'Leave';
      closeBtn.onclick = () => _closeBldOverlay(overlay);
      header.appendChild(closeBtn);
      panel.appendChild(header);

      const subtitle = document.createElement('div');
      subtitle.className = 'camp-bld-subtitle';
      subtitle.textContent = 'Upgrade gathering skills — harvest faster, yield more resources';
      panel.appendChild(subtitle);

      const goldDiv = document.createElement('div');
      goldDiv.className = 'camp-bld-currency';
      goldDiv.textContent = '💰 Gold: ' + (saveData.gold || 0);
      panel.appendChild(goldDiv);

      const GATHERING_SKILLS = window.GameHarvesting && window.GameHarvesting.GATHERING_SKILLS ? window.GameHarvesting.GATHERING_SKILLS : {};
      const skills = (saveData.gatheringSkills) || {};

      for (const [key, def] of Object.entries(GATHERING_SKILLS)) {
        if (def.hidden) continue;
        const level = skills[key] || 0;
        const maxed = level >= def.maxLevel;
        const cost = 50;
        const canAfford = (saveData.gold || 0) >= cost;

        const card = document.createElement('div');
        const cardClasses = ['camp-workshop-card'];
        if (maxed) cardClasses.push('camp-workshop-card-maxed');
        else if (!canAfford) cardClasses.push('camp-workshop-card-locked');
        card.className = cardClasses.join(' ');

        // Level pips
        let pips = '';
        for (let i = 0; i < def.maxLevel; i++) {
          pips += '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;margin:0 2px;' +
            'background:' + (i < level ? '#00ffcc' : 'rgba(255,255,255,0.12)') + ';' +
            'border:1px solid rgba(0,255,255,0.25);"></span>';
        }

        // Current → Next level display
        const nextLevelStr = maxed
          ? '<span style="color:#FFD700;font-size:11px;font-weight:bold;">✓ MAX LEVEL</span>'
          : '<span class="camp-ws-level-row">' +
              '<span class="camp-ws-lv-cur">Lv ' + level + '</span>' +
              '<span class="camp-ws-lv-arr">→</span>' +
              '<span class="camp-ws-lv-nxt">Lv ' + (level + 1) + '</span>' +
              '<span style="color:#aaa;font-size:11px;">/ ' + def.maxLevel + '</span>' +
            '</span>';

        const costStr = maxed ? '' :
          '<div class="' + (canAfford ? 'camp-ws-cost-affordable' : 'camp-ws-cost-unaffordable') + '">' +
            '💰 Cost: ' + cost + ' gold' + (canAfford ? ' ✓' : ' — Need more gold') +
          '</div>';

        card.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<div><span style="font-size:20px;">' + def.icon + '</span> <b style="color:#c8f0ff;font-size:14px;">' + def.label + '</b></div>' +
          '</div>' +
          '<div style="color:rgba(180,220,255,0.6);font-size:11px;margin:4px 0 6px;">' + def.description + '</div>' +
          nextLevelStr +
          '<div style="margin:6px 0;">' + pips + '</div>' +
          costStr;

        if (!maxed && canAfford) {
          card.onclick = () => {
            if (window.GameHarvesting && window.GameHarvesting.upgradeGatheringSkill) {
              if (window.GameHarvesting.upgradeGatheringSkill(key)) {
                if (typeof saveSaveData === 'function') saveSaveData();
                if (typeof playSound === 'function') playSound('collect');
                if (typeof showStatChange === 'function') showStatChange(def.icon + ' ' + def.label + ' upgraded to Lv ' + ((skills[key] || 0) + 1) + '!');
                overlay.remove();
                showWorkshop();
              }
            }
          };
        }
        panel.appendChild(card);
      }

      overlay.appendChild(panel);
      overlay.addEventListener('click', e => { if (e.target === overlay) _closeBldOverlay(overlay); });
      document.body.appendChild(overlay);
    }

    // ============================================================
    // ARMORY — Equipped vs Inventory weapons (frosted-glass redesign)
    // ============================================================
    function showArmory() {
      const existing = document.getElementById('armory-overlay');
      if (existing) existing.remove();

      // Rarity colour map (mirrors weapon-building.js RARITY_COLORS)
      const _RC = {
        common:    '#aaaaaa',
        uncommon:  '#2ecc71',
        rare:      '#4FC3F7',
        epic:      '#AA44FF',
        legendary: '#F39C12',
        mythic:    '#E74C3C'
      };

      const overlay = document.createElement('div');
      overlay.id = 'armory-overlay';
      overlay.className = 'camp-bld-overlay';
      overlay.style.cssText += 'z-index:500;';

      const panel = document.createElement('div');
      panel.className = 'camp-bld-panel';

      // Header
      const header = document.createElement('div');
      header.className = 'camp-bld-header';
      header.innerHTML = '<span class="camp-bld-title">⚔️ ARMORY</span>';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'camp-bld-close-btn';
      closeBtn.textContent = '✕';
      closeBtn.title = 'Leave';
      closeBtn.onclick = () => _closeBldOverlay(overlay);
      header.appendChild(closeBtn);
      panel.appendChild(header);

      const subtitle = document.createElement('div');
      subtitle.className = 'camp-bld-subtitle';
      subtitle.textContent = 'Manage your equipped gear and choose from your inventory';
      panel.appendChild(subtitle);

      const slots = [
        { key: 'weapon', name: 'Weapon', icon: '⚔️' },
        { key: 'armor',  name: 'Armor',  icon: '🛡️' },
        { key: 'helmet', name: 'Helmet', icon: '⛑️' },
        { key: 'boots',  name: 'Boots',  icon: '👢' },
        { key: 'ring',   name: 'Ring',   icon: '💍' },
        { key: 'amulet', name: 'Amulet', icon: '📿' }
      ];

      for (const slot of slots) {
        const sTitle = document.createElement('div');
        sTitle.className = 'armory-section-title';
        sTitle.textContent = slot.icon + ' ' + slot.name;
        panel.appendChild(sTitle);

        const equippedId = saveData.equippedGear && saveData.equippedGear[slot.key];
        const equippedGear = equippedId ? (saveData.inventory || []).find(g => g.id === equippedId) : null;

        if (equippedGear) {
          const rColor = _RC[equippedGear.rarity] || '#aaa';
          const eCard = document.createElement('div');
          eCard.className = 'armory-equipped-card';
          eCard.style.borderColor = rColor;
          eCard.style.boxShadow = '0 0 12px ' + rColor + '55';
          eCard.innerHTML =
            '<div style="flex:1;">' +
              '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
                '<span style="font-size:20px;">' + (slot.icon) + '</span>' +
                '<span style="color:' + rColor + ';font-weight:bold;font-size:15px;">' + equippedGear.name + '</span>' +
                '<span style="background:' + rColor + '33;color:' + rColor + ';font-size:10px;padding:2px 7px;border-radius:5px;font-weight:bold;text-transform:uppercase;">' + (equippedGear.rarity || 'common') + '</span>' +
              '</div>' +
              '<div style="color:rgba(200,220,255,0.55);font-size:11px;margin-bottom:6px;">' + (equippedGear.description || '') + '</div>' +
              (equippedGear.stats ? '<div style="font-size:11px;color:#90ee90;">' +
                Object.entries(equippedGear.stats).map(([s, v]) => '+' + v + ' ' + s).join(' · ') + '</div>' : '') +
            '</div>' +
            '<button onclick="unequipGear(\'' + slot.key + '\')" style="background:rgba(231,76,60,0.2);border:1px solid #e74c3c;color:#e74c3c;border-radius:7px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:bold;white-space:nowrap;">UNEQUIP</button>';
          panel.appendChild(eCard);
        } else {
          const emptyEl = document.createElement('div');
          emptyEl.className = 'armory-empty-slot';
          emptyEl.textContent = '— Empty Slot —';
          panel.appendChild(emptyEl);
        }

        // Inventory items for this slot
        const invItems = (saveData.inventory || []).filter(g => g.type === slot.key && g.id !== equippedId);
        if (invItems.length > 0) {
          const invLabel = document.createElement('div');
          invLabel.style.cssText = 'color:rgba(0,255,255,0.5);font-size:10px;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px;';
          invLabel.textContent = 'Available in inventory:';
          panel.appendChild(invLabel);

          for (const gear of invItems) {
            const rColor = _RC[gear.rarity] || '#aaa';
            const iCard = document.createElement('div');
            iCard.className = 'armory-inv-card';
            iCard.style.borderColor = rColor;
            iCard.innerHTML =
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span style="color:' + rColor + ';font-size:13px;font-weight:bold;">' + gear.name + '</span>' +
                '<span style="background:' + rColor + '22;color:' + rColor + ';font-size:9px;padding:1px 5px;border-radius:4px;text-transform:uppercase;">' + (gear.rarity || 'common') + '</span>' +
              '</div>' +
              (gear.description ? '<div style="color:rgba(200,220,255,0.45);font-size:10px;margin-top:2px;">' + gear.description + '</div>' : '') +
              (gear.stats ? '<div style="font-size:10px;color:#90ee90;margin-top:3px;">' +
                Object.entries(gear.stats).map(([s, v]) => '+' + v + ' ' + s).join(' · ') + '</div>' : '');
            iCard.onclick = () => {
              if (typeof equipGear === 'function') equipGear(slot.key, gear.id);
              overlay.remove();
              showArmory();
            };
            panel.appendChild(iCard);
          }
        }
      }

      overlay.appendChild(panel);
      overlay.addEventListener('click', e => { if (e.target === overlay) _closeBldOverlay(overlay); });
      document.body.appendChild(overlay);
    }
    window.showArmory = showArmory;

    // ============================================================
    // UIManager — Notification Queue
    // Ensures massive banners (Quest Complete, Level Up) never overlap.
    // If a banner is already on-screen, the next one waits in queue.
    // ============================================================
    const UIManager = (function () {
      const _queue   = [];   // pending notifications
      let   _showing = false; // whether a full-screen banner is active

      function _processQueue() {
        if (_showing || _queue.length === 0) return;
        const next = _queue.shift();
        _showing = true;
        _showBannerNow(next.questName, next.rewardDesc, function onDone() {
          _showing = false;
          _processQueue();
        });
      }

      function queueNotification(questName, rewardDesc) {
        _queue.push({ questName, rewardDesc });
        _processQueue();
      }

      function _showBannerNow(questName, rewardDesc, onDone) {
        const prev = document.getElementById('quest-complete-banner-overlay');
        if (prev) prev.remove();

        const bOverlay = document.createElement('div');
        bOverlay.id = 'quest-complete-banner-overlay';
        bOverlay.className = 'quest-complete-banner-overlay';

        const banner = document.createElement('div');
        banner.className = 'quest-complete-banner';
        banner.innerHTML =
          '<div class="quest-complete-banner-text">QUEST COMPLETE</div>' +
          '<div class="quest-complete-quest-name">' + (questName || '') + '</div>';
        bOverlay.appendChild(banner);
        document.body.appendChild(bOverlay);

        // Spawn reward particles after a short delay
        setTimeout(() => {
          const rect = banner.getBoundingClientRect();
          const originX = rect.left + rect.width / 2;
          const originY = rect.top + rect.height / 2;
          const icons = ['💰', '💰', '💎', '⭐', '💰', '✨', '💎', '🪙'];
          icons.forEach((icon, i) => {
            const p = document.createElement('div');
            p.className = 'reward-particle';
            const ANGLE_START = Math.PI * 0.3;
            const ANGLE_SWEEP = Math.PI * 1.4;
            const angle = ANGLE_START + (i / icons.length) * ANGLE_SWEEP;
            const dist = 120 + Math.random() * 160;
            const dx = Math.round(Math.cos(angle) * dist);
            const dy = Math.round(Math.abs(Math.sin(angle)) * dist + 40);
            p.style.cssText =
              'left:' + Math.round(originX - 11) + 'px;top:' + Math.round(originY - 11) + 'px;' +
              '--rp-dx:' + dx + 'px;--rp-dy:' + dy + 'px;' +
              '--rp-dur:' + (0.7 + Math.random() * 0.5).toFixed(2) + 's;' +
              '--rp-delay:' + (0.3 + i * 0.07).toFixed(2) + 's;';
            p.textContent = icon;
            document.body.appendChild(p);
            setTimeout(() => { if (p.parentNode) p.parentNode.removeChild(p); }, 2000);
          });
        }, 400);

        // Fade out, remove, then signal done
        setTimeout(() => {
          banner.classList.add('fading');
          setTimeout(() => {
            if (bOverlay.parentNode) bOverlay.parentNode.removeChild(bOverlay);
            if (typeof onDone === 'function') onDone();
          }, 550);
        }, 2800);
      }

      return { queueNotification };
    })();
    window.UIManager = UIManager;

    // ============================================================
    // QUEST COMPLETE BANNER — slam animation + reward particles
    // Delegates to UIManager.queueNotification() so simultaneous
    // level-up + quest-complete events never overlap on screen.
    // ============================================================
    function showQuestCompleteBanner(questName, rewardDesc) {
      UIManager.queueNotification(questName, rewardDesc);
    }
    window.showQuestCompleteBanner = showQuestCompleteBanner;

    // ============================================================
    // WEAPONSMITH — Weapon Building (delegates to weapon-building.js)
    // ============================================================
    function showWeaponsmith() {
      // Progress quest31 if active
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest31_buildWeaponsmith') {
        progressTutorialQuest('quest31_buildWeaponsmith', true);
        saveSaveData();
      }
      // Delegate to full weapon building panel (weapon-building.js)
      if (window.WeaponBuilding && window.WeaponBuilding.showWeaponBuilding) {
        window.WeaponBuilding.showWeaponBuilding();
      }
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
        armory:              () => {
            overlay.remove();
            if (typeof showArmory === 'function') { showArmory(); }
            else { try { updateGearScreen(); } catch(e) {} document.getElementById('gear-screen').style.display = 'flex'; }
          },
        trainingHall:        () => { overlay.remove(); document.getElementById('camp-training-tab').click(); },
        forge:               () => { overlay.remove(); showProgressionShop(); },
        progressionCenter:   () => { overlay.remove(); if (window.ProgressionCenter) window.ProgressionCenter.show(); },
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
          if (window.StatCards && typeof window.StatCards.open === 'function') {
            window.StatCards.open();
          }
        },
        tavern:              () => {
          overlay.remove();
          if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest9b_visitTavern') {
            progressTutorialQuest('quest9b_visitTavern', true);
            saveSaveData();
          }
          if (typeof showExpeditionsMenu === 'function') showExpeditionsMenu(); else showQuestHall();
        },
        shop:                () => { overlay.remove(); showGachaStore(); },
        astralGateway:       () => { overlay.remove(); window.showAstralGateway(); },
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
          showRecycleScreen();
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
        prismReliquary:      () => { overlay.remove(); showPrismReliquary(); },
        neuralMatrix:        () => { overlay.remove(); if (window.NeuralMatrix) window.NeuralMatrix.show(); },
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
      // ── Determine display mode ──────────────────────────────────────────────
      // When called from the 3D camp, render in the new camp-bld-overlay frosted glass style.
      // When called from the legacy 2D tab camp (progression-shop screen), use the old path.
      const _fromCamp = window.CampWorld && window.CampWorld.isActive;
      if (_fromCamp) {
        _showProgressionShopOverlay();
        return;
      }
      // ── Legacy 2D path ─────────────────────────────────────────────────────
      const shopGrid = document.getElementById('shop-grid');
      shopGrid.innerHTML = '';

      // ── Harvesting Tools section ──────────────────────────────
      if (window.GameHarvesting) {
        const toolsHeader = document.createElement('div');
        toolsHeader.style.cssText = 'width:100%;text-align:center;color:#FFD700;font-family:"Bangers",cursive;font-size:20px;letter-spacing:2px;margin-bottom:6px;padding-top:4px;';
        toolsHeader.textContent = '⛏️ HARVESTING TOOLS';
        shopGrid.appendChild(toolsHeader);

        let tools = window.GameHarvesting.getToolList();
        const ownedTools = window.GameHarvesting.getTools() || {};
        const resources = window.GameHarvesting.getResources() || {};

        // All 6 harvesting tools are always available at the Forge for 1 Gold each.
        // The armory lock only restricts EPIC forging (requires materials), not base purchase.

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
                // Quest quest_craftAllTools: check if ALL tools now owned
                if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest_craftAllTools' && window.GameHarvesting) {
                  const _ownedNow = window.GameHarvesting.getTools() || {};
                  const _allIds = ['axe', 'sledgehammer', 'pickaxe', 'magicTool', 'knife', 'berryScoop'];
                  if (_allIds.every(id => !!_ownedNow[id])) {
                    progressTutorialQuest('quest_craftAllTools', true);
                    saveSaveData();
                  }
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

    // ── Camp-overlay version of the Progression Shop ─────────────────────────
    // Displays the same harvesting tools + stat upgrades content inside the
    // modern frosted-glass camp-bld-overlay panel used by Armory, Inventory, etc.
    function _showProgressionShopOverlay() {
      const existing = document.getElementById('progression-shop-overlay');
      if (existing) existing.remove();

      if (window.CampWorld) window.CampWorld.pauseInput();

      const overlay = document.createElement('div');
      overlay.id = 'progression-shop-overlay';
      overlay.className = 'camp-bld-overlay';
      overlay.style.zIndex = '500';

      const panel = document.createElement('div');
      panel.className = 'camp-bld-panel';

      // Header
      const header = document.createElement('div');
      header.className = 'camp-bld-header';
      header.innerHTML = '<span class="camp-bld-title">⚒️ PROGRESSION UPGRADES</span>';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'camp-bld-close-btn';
      closeBtn.textContent = '✕';
      closeBtn.title = 'Close';
      closeBtn.onclick = () => {
        panel.classList.add('closing');
        setTimeout(() => {
          overlay.remove();
          if (window.CampWorld) window.CampWorld.resumeInput();
        }, 200);
      };
      header.appendChild(closeBtn);
      panel.appendChild(header);

      // Gold display
      const goldDiv = document.createElement('div');
      goldDiv.className = 'camp-bld-currency';
      goldDiv.textContent = `💰 GOLD: ${(saveData.gold || 0).toLocaleString()}`;
      panel.appendChild(goldDiv);

      const subtitle = document.createElement('div');
      subtitle.className = 'camp-bld-subtitle';
      subtitle.textContent = 'Buy gathering tools & invest in permanent stat upgrades';
      panel.appendChild(subtitle);

      // Content grid (reuse the same builder logic as the 2D shop)
      const grid = document.createElement('div');
      grid.style.cssText = 'display:flex;flex-direction:column;gap:10px;width:100%;';
      panel.appendChild(grid);
      overlay.appendChild(panel);
      overlay.addEventListener('click', e => { if (e.target === overlay) closeBtn.onclick(); });
      document.body.appendChild(overlay);

      // Populate content — helper that rebuilds grid and updates gold label
      const _rebuild = () => {
        grid.innerHTML = '';
        goldDiv.textContent = `💰 GOLD: ${(saveData.gold || 0).toLocaleString()}`;

        // ── Harvesting Tools ─────────────────────────────────────────────────
        if (window.GameHarvesting) {
          const toolsHdr = document.createElement('div');
          toolsHdr.style.cssText = 'color:#FFD700;font-family:"Bangers",cursive;font-size:18px;letter-spacing:2px;margin-top:4px;text-align:center;';
          toolsHdr.textContent = '⛏️ HARVESTING TOOLS';
          grid.appendChild(toolsHdr);

          const toolsNote = document.createElement('div');
          toolsNote.style.cssText = 'color:rgba(180,220,255,0.55);font-size:10px;letter-spacing:1px;text-transform:uppercase;text-align:center;margin-bottom:6px;';
          toolsNote.textContent = 'Required to gather resources during runs';
          grid.appendChild(toolsNote);

          const tools = window.GameHarvesting.getToolList();
          const ownedTools = window.GameHarvesting.getTools() || {};
          const resources = window.GameHarvesting.getResources() || {};

          tools.forEach(toolDef => {
            const owned = ownedTools[toolDef.id];
            const epicKey = 'epic' + toolDef.id.charAt(0).toUpperCase() + toolDef.id.slice(1);
            const isEpic = ownedTools[epicKey];
            const canAffordBase = (saveData.gold || 0) >= toolDef.buyCost;

            const card = document.createElement('div');
            card.className = 'camp-bld-panel';
            card.style.cssText = 'padding:10px 14px;margin:0;border:1px solid rgba(139,69,19,0.6);background:rgba(40,20,0,0.7);display:flex;align-items:center;justify-content:space-between;gap:8px;';

            let reqStr = '';
            if (toolDef.epicForgeReq) {
              reqStr = Object.entries(toolDef.epicForgeReq).map(([k, v]) => {
                const rt = window.GameHarvesting.RESOURCE_TYPES && window.GameHarvesting.RESOURCE_TYPES[k];
                const have = resources[k] || 0;
                const color = have >= v ? '#2ecc71' : '#e74c3c';
                return `<span style="color:${color}">${rt ? rt.icon : k} ${have}/${v}</span>`;
              }).join(' ');
            }

            if (!owned) {
              card.innerHTML = `
                <div style="flex:1;">
                  <div style="font-family:'Bangers',cursive;font-size:15px;color:#FFD700;letter-spacing:1px;">${toolDef.icon} ${toolDef.name}</div>
                  <div style="color:rgba(180,220,255,0.55);font-size:10px;margin-top:2px;">Harvest resources from the world</div>
                  <div style="color:#FFD700;font-size:11px;margin-top:3px;">Cost: ${toolDef.buyCost} Gold</div>
                </div>
                <button class="camp-bld-close-btn" style="width:auto;border-radius:7px;padding:6px 14px;font-size:12px;font-family:'Bangers',cursive;letter-spacing:1px;${!canAffordBase ? 'opacity:0.4;cursor:not-allowed;' : ''}" ${!canAffordBase ? 'disabled' : ''}>
                  ${canAffordBase ? 'BUY' : 'NEED GOLD'}
                </button>`;
              const btn = card.querySelector('button');
              btn.onclick = () => {
                if (window.GameHarvesting.buyTool(toolDef.id)) {
                  saveSaveData();
                  playSound('levelup');
                  if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest22_buyFirstTool') {
                    progressTutorialQuest('quest22_buyFirstTool', true); saveSaveData();
                  }
                  if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'questForge0b_craftTools') {
                    progressTutorialQuest('questForge0b_craftTools', true); saveSaveData();
                  }
                  // quest_craftAllTools: check if all tools now owned
                  if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest_craftAllTools') {
                    const _ownedNow = window.GameHarvesting.getTools() || {};
                    const _allIds = ['axe','sledgehammer','pickaxe','magicTool','knife','berryScoop'];
                    if (_allIds.every(id => !!_ownedNow[id])) {
                      progressTutorialQuest('quest_craftAllTools', true); saveSaveData();
                    }
                  }
                  _rebuild();
                }
              };
            } else if (!isEpic) {
              const epicReqsMet = toolDef.epicForgeReq && Object.entries(toolDef.epicForgeReq).every(([k, v]) => (resources[k] || 0) >= v);
              card.innerHTML = `
                <div style="flex:1;">
                  <div style="font-family:'Bangers',cursive;font-size:15px;color:#2ecc71;letter-spacing:1px;">${toolDef.icon} ${toolDef.name} <span style="font-size:11px;color:#2ecc71;">✓ OWNED</span></div>
                  <div style="color:rgba(180,220,255,0.55);font-size:10px;margin-top:2px;">⚒️ Forge to EPIC — 2.5× resource yield</div>
                  <div style="font-size:10px;margin-top:3px;">Requires: ${reqStr}</div>
                </div>
                <button class="camp-bld-close-btn" style="width:auto;border-radius:7px;padding:6px 14px;font-size:12px;font-family:'Bangers',cursive;letter-spacing:1px;color:#FFD700;border-color:#FFD700;${!epicReqsMet ? 'opacity:0.4;cursor:not-allowed;' : ''}" ${!epicReqsMet ? 'disabled' : ''}>
                  ${epicReqsMet ? '⚒️ FORGE' : 'NEED MORE'}
                </button>`;
              const btn = card.querySelector('button');
              btn.onclick = () => {
                if (window.GameHarvesting.forgeTool(toolDef.id)) {
                  saveSaveData(); playSound('levelup');
                  if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest25_useForge') {
                    progressTutorialQuest('quest25_useForge', true); saveSaveData();
                  }
                  _rebuild();
                }
              };
            } else {
              card.innerHTML = `
                <div style="font-family:'Bangers',cursive;font-size:15px;color:#FFD700;letter-spacing:1px;">${toolDef.icon} ${toolDef.name} <span style="color:#FFD700;">★ EPIC</span></div>
                <div style="color:#2ecc71;font-size:11px;padding:6px 12px;border:1px solid #2ecc71;border-radius:7px;">MAX</div>`;
            }
            grid.appendChild(card);
          });
        }

        // Separator
        const sep = document.createElement('hr');
        sep.style.cssText = 'border:none;border-top:1px solid rgba(0,255,255,0.15);margin:8px 0;';
        grid.appendChild(sep);

        // ── Stat Upgrades ────────────────────────────────────────────────────
        const upgradesHdr = document.createElement('div');
        upgradesHdr.style.cssText = 'color:#00ffff;font-family:"Bangers",cursive;font-size:18px;letter-spacing:2px;text-align:center;margin-bottom:6px;';
        upgradesHdr.textContent = '⬆️ STAT UPGRADES';
        grid.appendChild(upgradesHdr);

        Object.keys(PERMANENT_UPGRADES).forEach(key => {
          const upgrade = PERMANENT_UPGRADES[key];
          const currentLevel = saveData.upgrades[key];
          const isMaxLevel = currentLevel >= upgrade.maxLevel;
          const cost = getCost(key);
          const canAfford = (saveData.gold || 0) >= cost;

          const card = document.createElement('div');
          card.className = 'camp-bld-panel';
          card.style.cssText = 'padding:10px 14px;margin:0;' +
            (isMaxLevel ? 'border-color:rgba(255,215,0,0.4);background:rgba(255,215,0,0.06);' :
             canAfford   ? 'border-color:rgba(0,255,255,0.3);' :
                           'border-color:rgba(100,100,100,0.3);opacity:0.7;') +
            'display:flex;align-items:center;justify-content:space-between;gap:8px;';

          const lvlFrac = isMaxLevel ? upgrade.maxLevel : currentLevel;
          const progress = upgrade.maxLevel > 0 ? (lvlFrac / upgrade.maxLevel) : 1;
          card.innerHTML = `
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                <span style="font-size:20px;">${upgrade.icon || '⬆️'}</span>
                <span style="font-family:'Bangers',cursive;font-size:15px;color:#00ffff;letter-spacing:1px;">${upgrade.name}</span>
                <span style="font-size:10px;color:rgba(180,220,255,0.5);margin-left:auto;">Lv${currentLevel}/${upgrade.maxLevel}</span>
              </div>
              <div style="color:rgba(180,220,255,0.65);font-size:10px;margin-bottom:5px;">${upgrade.description || ''}</div>
              <div style="background:rgba(0,255,255,0.1);border-radius:3px;height:3px;width:100%;overflow:hidden;">
                <div style="background:#00ffff;height:100%;width:${Math.round(progress*100)}%;transition:width 0.3s;border-radius:3px;"></div>
              </div>
              ${!isMaxLevel ? `<div style="color:#FFD700;font-size:10px;margin-top:3px;">Cost: ${cost} Gold</div>` : `<div style="color:#FFD700;font-size:10px;margin-top:3px;">★ MAX LEVEL</div>`}
            </div>
            ${isMaxLevel ? '' : `<button class="camp-bld-close-btn" data-ukey="${key}" style="width:auto;border-radius:7px;padding:6px 14px;font-size:12px;font-family:'Bangers',cursive;letter-spacing:1px;${!canAfford ? 'opacity:0.4;cursor:not-allowed;color:#888;border-color:#555;' : 'color:#00ffff;border-color:rgba(0,255,255,0.5);'}" ${!canAfford ? 'disabled' : ''}>
              ${canAfford ? 'BUY' : 'NEED GOLD'}
            </button>`}`;

          if (!isMaxLevel) {
            const btn = card.querySelector('button');
            btn.onclick = () => { buyUpgrade(key); _rebuild(); };
          }
          grid.appendChild(card);
        });
      };

      _rebuild();

      // Quest progress: quest7_buyProgression
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest7_buyProgression') {
        progressTutorialQuest('quest7_buyProgression', true);
        saveSaveData();
      }
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

    // ============================================================
    // AIDA FAUSTIAN BARGAINS — Dark Pact override mechanic
    // ============================================================
    /**
     * Pool of dark pacts AIDA can offer.
     * Each pact has a text, a cosmetic label, and an apply() function
     * that mutates saveData and/or playerStats to enact the bargain.
     */
    function _getAidaPacts() {
      return [
        {
          offer:  'RECEIVE 10,000 GOLD — INSTANTLY.',
          cost:   'But your Maximum HP is permanently reduced by 15%.',
          icon:   '💀',
          apply() {
            saveData.gold = (saveData.gold || 0) + 10000;
            if (!saveData.aidaDarkPacts) saveData.aidaDarkPacts = {};
            saveData.aidaDarkPacts.hpReduction =
              (saveData.aidaDarkPacts.hpReduction || 1.0) * 0.85;
            if (typeof saveSaveData === 'function') saveSaveData();
          }
        },
        {
          offer:  'RECEIVE A MYTHIC VOID GEM — IMMEDIATELY SLOTTED.',
          cost:   'But the next 5 boss encounters will spawn at 200% speed.',
          icon:   '🩸',
          apply() {
            if (window.GemSystem) {
              window.GemSystem.addCutGem('void', 'mythic');
            }
            if (!saveData.aidaDarkPacts) saveData.aidaDarkPacts = {};
            saveData.aidaDarkPacts.bossSpeedCharges =
              (saveData.aidaDarkPacts.bossSpeedCharges || 0) + 5;
            if (typeof saveSaveData === 'function') saveSaveData();
          }
        },
        {
          offer:  'RECEIVE 50 ASTRAL ESSENCE — NO STRINGS ATTACHED?',
          cost:   'But AIDA infects one Neural Matrix path — 10% gold drained after every run.',
          icon:   '⚠️',
          apply() {
            saveData.astralEssence = (saveData.astralEssence || 0) + 50;
            if (!saveData.neuralMatrix) saveData.neuralMatrix = {};
            saveData.neuralMatrix.parasiteActive = true;
            saveData.neuralMatrix.parasiteRouted = false;
            if (typeof saveSaveData === 'function') saveSaveData();
          }
        },
      ];
    }

    /** Build and show the AIDA dark-pact overlay. */
    function _showAidaDarkPact() {
      const pacts = _getAidaPacts();
      const pact  = pacts[Math.floor(Math.random() * pacts.length)];

      const overlay = document.createElement('div');
      overlay.id = 'aida-dark-pact-overlay';
      overlay.style.cssText = [
        'position:fixed','top:0','left:0','width:100%','height:100%',
        'background:rgba(0,0,0,0.96)',
        'z-index:9500',
        'display:flex','align-items:center','justify-content:center',
        'animation:campBldIn 300ms ease-out forwards',
      ].join(';');

      const panel = document.createElement('div');
      panel.style.cssText = [
        'background:#000',
        'border:2px solid #8b0000',
        'border-radius:4px',
        'padding:28px 24px',
        'max-width:min(440px,94vw)',
        'width:100%',
        'box-shadow:0 0 40px rgba(139,0,0,0.7),inset 0 0 30px rgba(80,0,0,0.5)',
        'font-family:"Courier New",monospace',
        'color:#cc0000',
        'text-align:center',
        'position:relative',
      ].join(';');

      panel.innerHTML = `
        <div style="font-size:2em;margin-bottom:6px;filter:drop-shadow(0 0 8px #ff0000)">ⒶⒾⒹⒶ</div>
        <div style="font-size:0.75em;letter-spacing:3px;color:#660000;margin-bottom:18px;">— SYSTEM OVERRIDE —</div>
        <div style="font-size:1.3em;margin-bottom:6px;">${pact.icon}</div>
        <div class="aida-pact-offer"
             style="font-size:1em;color:#ff2020;margin-bottom:14px;line-height:1.5;
                    text-shadow:0 0 10px rgba(255,0,0,0.6);">
          ${pact.offer}
        </div>
        <div style="font-size:0.78em;color:#661111;margin-bottom:22px;
                    border-top:1px solid #330000;padding-top:12px;line-height:1.5;">
          ${pact.cost}
        </div>
      `;

      // Accept button
      const acceptBtn = document.createElement('button');
      acceptBtn.textContent = '[ ACCEPT THE PACT ]';
      acceptBtn.style.cssText = [
        'background:#1a0000',
        'color:#ff2020',
        'border:2px solid #8b0000',
        'border-radius:3px',
        'padding:10px 22px',
        'cursor:pointer',
        'font-family:"Courier New",monospace',
        'font-size:0.9em',
        'letter-spacing:2px',
        'margin-right:10px',
        'transition:box-shadow 0.15s',
      ].join(';');
      acceptBtn.addEventListener('mouseover', () => {
        acceptBtn.style.boxShadow = '0 0 16px rgba(200,0,0,0.8)';
        if (window.GameAudio) window.GameAudio.playSound('aida_whisper');
      });
      acceptBtn.addEventListener('mouseout', () => {
        acceptBtn.style.boxShadow = '';
      });
      acceptBtn.onclick = () => {
        pact.apply();
        overlay.remove();
        // Confirm flash
        if (typeof window.showNarratorLine === 'function') {
          window.showNarratorLine('AIDA: "A pleasure doing business with you."');
        }
      };

      // Refuse button
      const refuseBtn = document.createElement('button');
      refuseBtn.textContent = '[ REFUSE ]';
      refuseBtn.style.cssText = [
        'background:none',
        'color:#441111',
        'border:1px solid #330000',
        'border-radius:3px',
        'padding:10px 18px',
        'cursor:pointer',
        'font-family:"Courier New",monospace',
        'font-size:0.85em',
        'letter-spacing:1px',
      ].join(';');
      refuseBtn.onclick = () => {
        overlay.style.animation = 'campBldOut 200ms ease-in forwards';
        setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 210);
      };

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;justify-content:center;gap:10px;flex-wrap:wrap;';
      btnRow.appendChild(acceptBtn);
      btnRow.appendChild(refuseBtn);
      panel.appendChild(btnRow);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
    }

    // ============================================================
    // PRISM RELIQUARY — Gem Slotting UI
    // ============================================================
    function showPrismReliquary() {
      if (!window.GemSystem) return;
      const GS = window.GemSystem;

      // Remove any existing overlay
      const existing = document.getElementById('prism-reliquary-overlay');
      if (existing) existing.remove();

      // ── AIDA Faustian Bargain override (10% chance) ──────────────────────────
      // Only triggers if the Neural Matrix has at least one node unlocked
      // (AIDA must have some foothold before she can intercept).
      const _nmUnlocked = !!(saveData && saveData.neuralMatrix &&
        (saveData.neuralMatrix.eventHorizon   ||
         saveData.neuralMatrix.bloodAlchemy   ||
         saveData.neuralMatrix.kineticMirror  ||
         saveData.neuralMatrix.annunakiProtocol));
      if (_nmUnlocked && Math.random() < 0.10) {
        _showAidaDarkPact();
        return;
      }

      const overlay = document.createElement('div');
      overlay.id = 'prism-reliquary-overlay';
      overlay.className = 'prism-overlay';

      // Inner scrollable panel — animation applied here so transform doesn't displace the fixed overlay
      const panel = document.createElement('div');
      panel.className = 'prism-panel';
      panel.style.animation = 'campBldIn 250ms ease-out forwards';
      overlay.appendChild(panel);

      // Header
      const header = document.createElement('div');
      header.className = 'prism-header';
      header.innerHTML = `<span class="prism-title">💎 PRISM RELIQUARY</span>
        <span class="prism-subtitle">Slot Cut Gems into weapons and companions</span>`;
      panel.appendChild(header);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'prism-close-btn camp-bld-close-btn';
      closeBtn.style.cssText = 'position:absolute;top:14px;right:16px;width:38px;height:38px;font-size:16px;z-index:4001;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;';
      closeBtn.textContent = '✕';
      closeBtn.title = 'Leave';
      closeBtn.onclick = () => {
        overlay.style.animation = 'campBldOut 200ms ease-in forwards';
        setTimeout(() => {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          if (window.CampWorld && typeof window.CampWorld.resumeInput === 'function') window.CampWorld.resumeInput();
        }, 210);
      };
      panel.appendChild(closeBtn);

      // Raw Gem counts
      const rawGemBar = document.createElement('div');
      rawGemBar.className = 'prism-rawgem-bar';
      const rg = saveData.rawGems || {};
      rawGemBar.innerHTML = Object.entries(GS.GEM_TYPES).map(([type, def]) =>
        `<span class="prism-rawgem" style="color:${def.color};">${def.icon} <b>${rg[type] || 0}</b> Raw ${def.name}</span>`
      ).join('');
      panel.appendChild(rawGemBar);

      // Two columns: weapon slot + companion slot
      const cols = document.createElement('div');
      cols.className = 'prism-cols';

      const weaponId = saveData.equippedGear.weapon || 'gun';
      const companionId = saveData.selectedCompanion || 'greyAlien';

      // ── Gem Inventory (unslotted gems) ──
      const invHeader = document.createElement('div');
      invHeader.className = 'prism-inv-header';
      invHeader.textContent = '✂️ Cut Gem Inventory (click a gem to select, then click a slot to equip)';

      const invGrid = document.createElement('div');
      invGrid.className = 'prism-inv-grid';
      invGrid.id = 'prism-inv-grid';

      let _selectedGemId = null;

      // ── In-place refresh: rebuilds only the changed columns and inventory grid ──
      function _refreshInPlace() {
        // Update raw gem bar without rebuilding the whole overlay
        const rg2 = saveData.rawGems || {};
        rawGemBar.innerHTML = Object.entries(GS.GEM_TYPES).map(([type, def]) =>
          `<span class="prism-rawgem" style="color:${def.color};">${def.icon} <b>${rg2[type] || 0}</b> Raw ${def.name}</span>`
        ).join('');

        // Rebuild only the columns content
        cols.innerHTML = '';
        cols.appendChild(_buildPrismItemColumn(GS, 'weapon', weaponId, _refreshInPlace));
        cols.appendChild(_buildPrismItemColumn(GS, 'companion', companionId, _refreshInPlace));

        // Reset selection and rebuild inventory
        _selectedGemId = null;
        renderInvGrid();

        // Rewire empty-slot click handlers after rebuilding
        _wireSlotClicks();
      }

      function _wireSlotClicks() {
        overlay.querySelectorAll('.prism-slot').forEach(slot => {
          slot.addEventListener('click', () => {
            if (!_selectedGemId) return;
            const itemType = slot.dataset.itemType;
            const slotItemId = slot.dataset.itemId;
            const slotIdx = parseInt(slot.dataset.slotIdx, 10);
            const currentGemId = slot.dataset.gemId;
            if (currentGemId) GS.unslotGem(currentGemId);
            if (GS.slotGem(_selectedGemId, itemType, slotItemId, slotIdx)) {
              _triggerGemSlotEffect(slot, _selectedGemId);
              _selectedGemId = null;
              _refreshInPlace();
            }
          });
        });
      }

      // ── Weapon column ──
      cols.appendChild(_buildPrismItemColumn(GS, 'weapon', weaponId, _refreshInPlace));

      // ── Companion column ──
      cols.appendChild(_buildPrismItemColumn(GS, 'companion', companionId, _refreshInPlace));
      panel.appendChild(cols);

      panel.appendChild(invHeader);

      function renderInvGrid() {
        invGrid.innerHTML = '';
        const unslotted = GS.getUnslottedGems();
        if (unslotted.length === 0) {
          invGrid.innerHTML = '<div style="color:#888;padding:12px;text-align:center;">No cut gems — open chests at the Shop to get some!</div>';
          return;
        }
        unslotted.forEach(gem => {
          const typeDef = GS.getGemTypeDef(gem.type);
          const rarIdx = GS.getRarityIndex(gem.rarity);
          const rarDef = GS.getCutGemRarities()[rarIdx] || GS.getCutGemRarities()[0];
          const card = document.createElement('div');
          card.className = 'prism-gem-card' + (gem.id === _selectedGemId ? ' selected' : '');
          card.style.setProperty('--gem-color', rarDef.color);
          card.style.setProperty('--gem-border', rarDef.border);
          card.innerHTML = `<span class="prism-gem-icon">${typeDef.icon}</span>
            <span class="prism-gem-name" style="color:${rarDef.color}">${rarDef.name}</span>
            <span class="prism-gem-type">${typeDef.name}</span>`;
          card.title = Object.entries(typeDef.stats).map(([stat, vals]) => `+${vals[rarIdx]} ${stat}`).join('\n');
          card.onclick = () => {
            _selectedGemId = gem.id === _selectedGemId ? null : gem.id;
            // Update pending-gem attribute on slots
            overlay.querySelectorAll('.prism-slot').forEach(slot => {
              slot.setAttribute('data-pending-gem', _selectedGemId || '');
            });
            renderInvGrid();
          };
          invGrid.appendChild(card);
        });
      }

      renderInvGrid();
      panel.appendChild(invGrid);

      // Wire slot click handlers for the initial render
      _wireSlotClicks();

      document.body.appendChild(overlay);
    }

    /** Format a gem bonus value: percentages for 0–1 decimals, integers otherwise. */
    function _formatGemBonusValue(val) {
      if (typeof val === 'number' && val > 0 && val < 1) {
        return (val * 100).toFixed(0) + '%';
      }
      return val;
    }

    function _buildPrismItemColumn(GS, itemType, itemId, onRefresh) {
      const col = document.createElement('div');
      col.className = 'prism-item-col';

      const icons = { weapon: '⚔️', companion: '🐾' };
      const labels = { weapon: 'Weapon: ' + itemId, companion: 'Companion: ' + itemId };
      const slotCount = itemType === 'companion'
        ? GS.getCompanionSlotCount(itemId)
        : GS.getWeaponSlotCount(itemId);
      const slots = GS.getSlots(itemType, itemId);
      const bonuses = GS.computeGemBonuses(itemType, itemId);

      const colHeader = document.createElement('div');
      colHeader.className = 'prism-col-header';
      colHeader.innerHTML = `${icons[itemType] || ''} <b>${labels[itemType]}</b>
        <span style="color:#aaa;font-size:11px;"> (${slotCount} slots)</span>`;
      col.appendChild(colHeader);

      // Slots row
      const slotsRow = document.createElement('div');
      slotsRow.className = 'prism-slots-row';
      for (let i = 0; i < slotCount; i++) {
        const gemId = slots[i] || null;
        const slotEl = document.createElement('div');
        slotEl.className = 'prism-slot' + (gemId ? ' occupied' : ' empty');
        slotEl.dataset.itemType = itemType;
        slotEl.dataset.itemId = itemId;
        slotEl.dataset.slotIdx = i;
        slotEl.dataset.gemId = gemId || '';

        if (gemId) {
          const gem = (saveData.cutGems || []).find(g => g.id === gemId);
          if (gem) {
            const typeDef = GS.getGemTypeDef(gem.type);
            const rarIdx = GS.getRarityIndex(gem.rarity);
            const rarDef = GS.getCutGemRarities()[rarIdx] || GS.getCutGemRarities()[0];
            slotEl.style.setProperty('--gem-color', rarDef.color);
            slotEl.innerHTML = `<span class="prism-slot-icon">${typeDef.icon}</span>
              <span class="prism-slot-rarity" style="color:${rarDef.color}">${rarDef.name[0]}</span>`;
            slotEl.title = rarDef.name + ' ' + typeDef.name + '\n' +
              Object.entries(typeDef.stats).map(([s, v]) => `+${v[rarIdx]} ${s}`).join('\n') +
              '\n(Click to unslot)';
            slotEl.onclick = () => { GS.unslotGem(gemId); onRefresh(); };
          }
        } else {
          slotEl.innerHTML = '<span class="prism-slot-empty-icon">○</span>';
          slotEl.title = 'Empty slot — select a gem from inventory below';
        }
        slotsRow.appendChild(slotEl);
      }
      col.appendChild(slotsRow);

      // Bonuses
      const bonusKeys = Object.keys(bonuses);
      if (bonusKeys.length > 0) {
        const bonusDiv = document.createElement('div');
        bonusDiv.className = 'prism-bonuses';
        bonusDiv.innerHTML = '<span style="color:#ffd700;font-size:11px;">ACTIVE BONUSES:</span><br>' +
          bonusKeys.map(k => `<span class="prism-bonus-line">+${_formatGemBonusValue(bonuses[k])} <b>${k}</b></span>`).join('');
        col.appendChild(bonusDiv);
      }

      return col;
    }

    function _triggerGemSlotEffect(slotEl, gemId) {
      // Get gem type for color
      const gem = (saveData.cutGems || []).find(g => g.id === gemId);
      if (!gem || !window.GemSystem) return;
      const typeDef = window.GemSystem.getGemTypeDef(gem.type);
      const rarIdx = window.GemSystem.getRarityIndex(gem.rarity);
      const rarDef = window.GemSystem.getCutGemRarities()[rarIdx];
      const gemColor = rarDef ? rarDef.color : '#ffffff';

      // Flash the slot white
      slotEl.classList.add('gem-flash');
      setTimeout(() => slotEl.classList.remove('gem-flash'), 600);

      // Shockwave ring
      const shock = document.createElement('div');
      shock.className = 'gem-shockwave';
      shock.style.setProperty('--shock-color', gemColor);
      slotEl.appendChild(shock);
      setTimeout(() => shock.remove(), 700);

      // Stat text shake with rarity color
      const bonusDiv = slotEl.closest('.prism-item-col')?.querySelector('.prism-bonuses');
      if (bonusDiv) {
        bonusDiv.style.color = gemColor;
        bonusDiv.classList.add('stat-shake');
        setTimeout(() => {
          bonusDiv.style.color = '';
          bonusDiv.classList.remove('stat-shake');
        }, 1500);
      }

      // Play sound
      if (typeof playSound === 'function') playSound('levelup');
    }

    // ============================================================
    // ASTRAL GATEWAY — AIDA's Neural Dive Pod dialogue
    // ============================================================
    function showAstralGateway() {
      const existing = document.getElementById('aida-modal-overlay');
      if (existing) existing.remove();

      // ── Unlock Neural Matrix building when Astral Gateway is first visited ──
      if (saveData && saveData.campBuildings && saveData.campBuildings.neuralMatrix
          && !saveData.campBuildings.neuralMatrix.unlocked) {
        saveData.campBuildings.neuralMatrix.unlocked = true;
        saveData.campBuildings.neuralMatrix.level = 1;
        saveSaveData();
        window._neuralMatrixNewlyUnlocked = true;
      }

      // ── Build the overlay ──────────────────────────────────────
      const overlay = document.createElement('div');
      overlay.id = 'aida-modal-overlay';
      overlay.className = 'aida-modal-overlay';

      const panel = document.createElement('div');
      panel.className = 'aida-modal-panel';

      // ── Portrait: beautiful humanoid mask (normal) + Annunaki eye (glitch) ──
      const portraitWrap = document.createElement('div');
      portraitWrap.className = 'aida-portrait-wrap';

      // Normal face — serene, symmetrical humanoid mask in SVG
      const faceNormal = document.createElement('div');
      faceNormal.className = 'aida-face-normal';
      faceNormal.innerHTML = `
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <!-- Background -->
          <circle cx="50" cy="50" r="50" fill="#060810"/>
          <!-- Face oval -->
          <ellipse cx="50" cy="52" rx="28" ry="34" fill="#0d1020" stroke="#1a2a4a" stroke-width="0.5"/>
          <!-- Forehead band -->
          <ellipse cx="50" cy="28" rx="20" ry="6" fill="#0f1830" opacity="0.8"/>
          <!-- Eye sockets -->
          <ellipse cx="37" cy="46" rx="7" ry="4.5" fill="#080c18"/>
          <ellipse cx="63" cy="46" rx="7" ry="4.5" fill="#080c18"/>
          <!-- Iris left -->
          <ellipse cx="37" cy="46" rx="5" ry="3.5" fill="#0066aa"/>
          <ellipse cx="37" cy="46" rx="3" ry="2.5" fill="#00aaff"/>
          <ellipse cx="37" cy="46" rx="1.5" ry="1.5" fill="#001a33"/>
          <!-- Iris right -->
          <ellipse cx="63" cy="46" rx="5" ry="3.5" fill="#0066aa"/>
          <ellipse cx="63" cy="46" rx="3" ry="2.5" fill="#00aaff"/>
          <ellipse cx="63" cy="46" rx="1.5" ry="1.5" fill="#001a33"/>
          <!-- Eye glow left -->
          <ellipse cx="37" cy="46" rx="6" ry="4" fill="none" stroke="#00ccff" stroke-width="0.4" opacity="0.6"/>
          <!-- Eye glow right -->
          <ellipse cx="63" cy="46" rx="6" ry="4" fill="none" stroke="#00ccff" stroke-width="0.4" opacity="0.6"/>
          <!-- Nose bridge -->
          <path d="M48,50 Q50,56 52,50" fill="none" stroke="#1a2a4a" stroke-width="0.8"/>
          <!-- Lips -->
          <path d="M42,62 Q50,66 58,62" fill="none" stroke="#1a3050" stroke-width="1.2"/>
          <!-- Cheekbones -->
          <path d="M24,48 Q28,55 30,62" fill="none" stroke="#0a1428" stroke-width="0.6"/>
          <path d="M76,48 Q72,55 70,62" fill="none" stroke="#0a1428" stroke-width="0.6"/>
          <!-- Crown circuit lines -->
          <path d="M30,22 L50,15 L70,22" fill="none" stroke="#003355" stroke-width="0.5"/>
          <circle cx="50" cy="14" r="2" fill="#004477"/>
          <circle cx="50" cy="14" r="1" fill="#0088cc"/>
        </svg>`;

      // Glitch face — single massive mechanical Annunaki eye
      const faceGlitch = document.createElement('div');
      faceGlitch.className = 'aida-face-glitch';
      faceGlitch.innerHTML = `
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <!-- Background — alien black -->
          <rect width="100" height="100" fill="#000"/>
          <!-- Outer iris ring — reptilian gold -->
          <circle cx="50" cy="50" r="46" fill="#0a0500"/>
          <circle cx="50" cy="50" r="44" fill="none" stroke="#8b6900" stroke-width="1.2"/>
          <!-- Mid iris — amber with mechanical sectors -->
          <circle cx="50" cy="50" r="36" fill="#1a0d00"/>
          <!-- Iris sectors (gear-like) -->
          <path d="M50,14 L53,30 L50,32 L47,30 Z" fill="#cc8800"/>
          <path d="M86,50 L70,47 L68,50 L70,53 Z" fill="#cc8800"/>
          <path d="M50,86 L47,70 L50,68 L53,70 Z" fill="#cc8800"/>
          <path d="M14,50 L30,53 L32,50 L30,47 Z" fill="#cc8800"/>
          <path d="M74,26 L62,38 L60,36 L68,24 Z" fill="#aa7000"/>
          <path d="M74,74 L62,62 L60,64 L68,76 Z" fill="#aa7000"/>
          <path d="M26,74 L38,62 L40,64 L32,76 Z" fill="#aa7000"/>
          <path d="M26,26 L38,38 L40,36 L32,24 Z" fill="#aa7000"/>
          <!-- Inner iris ring -->
          <circle cx="50" cy="50" r="28" fill="#0d0800"/>
          <circle cx="50" cy="50" r="26" fill="none" stroke="#ffaa00" stroke-width="0.6" opacity="0.7"/>
          <!-- Pupil — vertical slit like a serpent/Annunaki -->
          <ellipse cx="50" cy="50" rx="8" ry="22" fill="#000"/>
          <!-- Pupil sheen -->
          <ellipse cx="50" cy="50" rx="7" ry="21" fill="none" stroke="#330000" stroke-width="0.8"/>
          <!-- Iris glow -->
          <circle cx="50" cy="50" r="36" fill="none" stroke="#ff9900" stroke-width="0.5" opacity="0.5"/>
          <!-- Cornea reflection -->
          <ellipse cx="42" cy="37" rx="4" ry="2.5" fill="white" opacity="0.06" transform="rotate(-30 42 37)"/>
          <!-- Circuit veins radiating from iris -->
          <path d="M50,14 Q46,8 40,4" fill="none" stroke="#553300" stroke-width="0.5"/>
          <path d="M86,50 Q92,46 96,40" fill="none" stroke="#553300" stroke-width="0.5"/>
          <path d="M50,86 Q54,92 60,96" fill="none" stroke="#553300" stroke-width="0.5"/>
          <path d="M14,50 Q8,54 4,60" fill="none" stroke="#553300" stroke-width="0.5"/>
          <!-- Glow bloom -->
          <circle cx="50" cy="50" r="44" fill="none" stroke="#cc6600" stroke-width="2" opacity="0.15"/>
        </svg>`;

      portraitWrap.appendChild(faceNormal);
      portraitWrap.appendChild(faceGlitch);

      // ── Text label ─────────────────────────────────────────────
      const label = document.createElement('div');
      label.className = 'aida-modal-label';
      label.textContent = 'A · I · D · A';

      // ── Dialogue text (typewriter) ─────────────────────────────
      const textEl = document.createElement('div');
      textEl.className = 'aida-modal-text';

      // ── Confirm button ─────────────────────────────────────────
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'aida-modal-confirm';
      confirmBtn.textContent = '[ UNDERSTOOD ]';
      confirmBtn.addEventListener('click', function () {
        overlay.remove();
        clearTimeout(_aidaGlitchInterval);
      });

      // ── "ENTER THE DIVE" button ────────────────────────────────
      const diveBtn = document.createElement('button');
      diveBtn.className = 'aida-modal-confirm';
      diveBtn.style.cssText += 'margin-top:6px;background:rgba(0,255,80,0.06);border-color:rgba(0,255,120,0.7);color:#00ff88;text-shadow:0 0 10px #00ff88;box-shadow:0 0 18px rgba(0,255,120,0.2);';
      diveBtn.textContent = '[ ENTER THE DIVE ]';

      // Show current banked rewards if any
      const essenceCount = (typeof saveData !== 'undefined') ? (saveData.astralEssence || 0) : 0;
      const coreCount    = (typeof saveData !== 'undefined') ? (saveData.neuralCores   || 0) : 0;
      if (essenceCount > 0 || coreCount > 0) {
        const rewardInfo = document.createElement('div');
        rewardInfo.style.cssText = 'font-family:monospace;font-size:12px;color:rgba(180,255,200,0.7);margin-top:4px;text-align:center;';
        rewardInfo.textContent = '⚡ Astral Essence: ' + essenceCount + '   🔷 Neural Cores: ' + coreCount;
        panel.appendChild(rewardInfo);
      }

      diveBtn.addEventListener('click', function () {
        overlay.remove();
        clearTimeout(_aidaGlitchInterval);
        if (window.AstralDive && typeof window.AstralDive.start === 'function') {
          window.AstralDive.start();
        } else {
          console.warn('AstralDive module not loaded');
        }
      });

      panel.appendChild(portraitWrap);
      panel.appendChild(label);
      panel.appendChild(textEl);
      panel.appendChild(diveBtn);

      // ── "MINIGAME SKILL TREE" button ───────────────────────────
      const skillTreeBtn = document.createElement('button');
      skillTreeBtn.className = 'aida-modal-confirm';
      skillTreeBtn.style.cssText += 'margin-top:6px;background:rgba(0,180,255,0.06);border-color:rgba(0,200,255,0.7);color:#00ccff;text-shadow:0 0 8px #00ccff;box-shadow:0 0 14px rgba(0,200,255,0.2);';
      skillTreeBtn.textContent = '[ ASTRAL SKILL TREE ]';
      skillTreeBtn.addEventListener('click', function () {
        overlay.remove();
        clearTimeout(_aidaGlitchInterval);
        if (typeof window.showMinigameSkillTree === 'function') {
          window.showMinigameSkillTree();
        }
      });
      panel.appendChild(skillTreeBtn);

      // ── "NEURAL MATRIX" button ─────────────────────────────────
      const matrixBtn = document.createElement('button');
      matrixBtn.className = 'aida-modal-confirm aida-neural-matrix-btn';
      matrixBtn.textContent = '[ NEURAL MATRIX ]';
      matrixBtn.addEventListener('click', function () {
        overlay.remove();
        clearTimeout(_aidaGlitchInterval);
        if (window.NeuralMatrix) window.NeuralMatrix.show();
      });
      panel.appendChild(matrixBtn);

      panel.appendChild(confirmBtn);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      // ── Typewriter animation ───────────────────────────────────
      const _aidaDialogue = 'I have constructed a Neural Dive Pod to help you unlock your hidden potential. Trust me.';
      let _charIdx = 0;
      function _typeChar() {
        if (_charIdx < _aidaDialogue.length) {
          textEl.textContent += _aidaDialogue[_charIdx];
          _charIdx++;
          setTimeout(_typeChar, 35);
        } else {
          textEl.classList.add('aida-typed-done');
        }
      }
      setTimeout(_typeChar, 400);

      // ── Portrait glitch: every 8-15 s, tear for 0.1 s ─────────
      var _aidaGlitchInterval = null;
      function _scheduleGlitch() {
        const delay = 8000 + Math.random() * 7000; // 8–15 seconds
        _aidaGlitchInterval = setTimeout(function () {
          portraitWrap.classList.add('aida-glitching');
          setTimeout(function () {
            portraitWrap.classList.remove('aida-glitching');
            if (document.body.contains(overlay)) _scheduleGlitch();
          }, 100); // 0.1 s glitch window
        }, delay);
      }
      _scheduleGlitch();

      // Clean up on overlay click-outside
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          overlay.remove();
          clearTimeout(_aidaGlitchInterval);
        }
      });
    }
    window.showAstralGateway = showAstralGateway;

    // ============================================================
    // GACHA STORE — 4 Chest Tiers
    // ============================================================
    function showGachaStore() {
      if (!window.GemSystem) return;
      const GS = window.GemSystem;

      const existing = document.getElementById('gacha-store-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'gacha-store-overlay';
      overlay.className = 'gacha-overlay';
      overlay.style.cssText += 'animation:campBldIn 250ms ease-out forwards;';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'gacha-close-btn camp-bld-close-btn';
      closeBtn.style.cssText = 'position:absolute;top:14px;right:16px;width:38px;height:38px;font-size:16px;z-index:4001;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;';
      closeBtn.textContent = '✕';
      closeBtn.title = 'Leave';
      closeBtn.onclick = () => {
        overlay.style.animation = 'campBldOut 200ms ease-in forwards';
        setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 210);
      };
      overlay.appendChild(closeBtn);

      const title = document.createElement('div');
      title.className = 'gacha-title';
      title.innerHTML = '🎁 THE SHOP — LOOT CHESTS';
      overlay.appendChild(title);

      const subtitle = document.createElement('div');
      subtitle.className = 'gacha-subtitle';
      subtitle.textContent = 'Open chests to receive powerful gems, resources, and gold';
      overlay.appendChild(subtitle);

      // Currency display
      const currencyBar = document.createElement('div');
      currencyBar.className = 'gacha-currency-bar';
      currencyBar.id = 'gacha-currency-bar';
      _refreshGachaCurrencyBar(currencyBar);
      overlay.appendChild(currencyBar);

      // Chest grid
      const chestGrid = document.createElement('div');
      chestGrid.className = 'gacha-chest-grid';

      Object.entries(GS.CHEST_TIERS).forEach(([tierId, tier]) => {
        const card = document.createElement('div');
        card.className = 'gacha-chest-card';
        card.style.setProperty('--chest-color', tier.color);
        card.style.setProperty('--chest-glow', tier.glowColor);
        card.style.setProperty('--chest-border', tier.border);

        const canAfford = GS.canAffordChest(tierId);
        const costStr = _getChestCostStr(tier.cost);

        card.innerHTML = `
          <div class="gacha-chest-emoji">${tier.emoji}</div>
          <div class="gacha-chest-name" style="color:${tier.color}">${tier.name}</div>
          <div class="gacha-chest-desc">${tier.description}</div>
          <div class="gacha-chest-cost">${costStr}</div>
          <button class="gacha-open-btn ${canAfford ? '' : 'disabled'}" ${canAfford ? '' : 'disabled'}>
            ${canAfford ? 'OPEN' : 'CAN\'T AFFORD'}
          </button>`;

        if (canAfford) {
          card.querySelector('.gacha-open-btn').onclick = () => {
            const drops = GS.openChest(tierId);
            if (drops && drops.length > 0) {
              // Track total chests opened for quest36_blackMarket
              saveData.chestOpenCount = (saveData.chestOpenCount || 0) + 1;
              // Check quest36_blackMarket progress (need 10 total) or quest progress (3 total)
              if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest36_blackMarket') {
                if ((saveData.chestOpenCount || 0) >= 3) {
                  if (typeof progressTutorialQuest === 'function') {
                    progressTutorialQuest('quest36_blackMarket', true);
                    if (typeof saveSaveData === 'function') saveSaveData();
                  }
                }
              }
              if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest_annunaki2') {
                if ((saveData.chestOpenCount || 0) >= 10) {
                  if (typeof progressTutorialQuest === 'function') {
                    progressTutorialQuest('quest_annunaki2', true);
                    if (typeof saveSaveData === 'function') saveSaveData();
                  }
                }
              }
              overlay.remove();
              _runChestOpenAnimation(tierId, tier, drops, () => {
                showGachaStore(); // Re-open store after animation
              });
            }
          };
        }
        chestGrid.appendChild(card);
      });
      overlay.appendChild(chestGrid);

      document.body.appendChild(overlay);
    }

    function _refreshGachaCurrencyBar(bar) {
      const rg = saveData.rawGems || {};
      const res = saveData.resources || {};
      bar.innerHTML =
        `<span>🪙 <b>${saveData.gold || 0}</b> Gold</span>` +
        `<span>✨ <b>${res.magicEssence || 0}</b> Essence</span>` +
        `<span>🔴 <b>${rg.ruby || 0}</b></span>` +
        `<span>🔵 <b>${rg.sapphire || 0}</b></span>` +
        `<span>🟢 <b>${rg.emerald || 0}</b></span>` +
        `<span>🟣 <b>${rg.void || 0}</b> Raw Gems</span>`;
    }

    function _getChestCostStr(cost) {
      if (cost.type === 'gold') return `🪙 ${cost.amount} Gold`;
      if (cost.type === 'magicEssence') return `✨ ${cost.amount} Magic Essence`;
      if (cost.type === 'rawGems') {
        const icons = { ruby: '🔴', sapphire: '🔵', emerald: '🟢', void: '🟣' };
        return `${icons[cost.gemType] || '💎'} ${cost.amount} Raw ${cost.gemType.charAt(0).toUpperCase() + cost.gemType.slice(1)}`;
      }
      return 'Free';
    }

    // ── Chest Opening Animation (4 Phases) ──────────────────────
    function _runChestOpenAnimation(tierId, tier, drops, onComplete) {
      // Apply drops were already added in GS.openChest — just animate the reveal
      updateGoldDisplays();

      const stage = document.createElement('div');
      stage.id = 'chest-anim-stage';
      stage.className = 'chest-stage';
      document.body.appendChild(stage);

      // Background overlay
      const bg = document.createElement('div');
      bg.className = 'chest-stage-bg';
      stage.appendChild(bg);

      // ── PHASE 1: Chest appears and rattles (0–1.5s) ──
      const chestWrap = document.createElement('div');
      chestWrap.className = 'chest-wrap';
      const chestEl = document.createElement('div');
      chestEl.className = 'chest-icon chest-rattle';
      chestEl.style.setProperty('--chest-glow', tier.glowColor);
      chestEl.textContent = tier.emoji;
      chestWrap.appendChild(chestEl);

      // Keyhole sparks (anticipation particles)
      for (let i = 0; i < 12; i++) {
        const spark = document.createElement('div');
        spark.className = 'chest-spark';
        const angle = (i / 12) * 360;
        const dist = 28 + Math.random() * 18;
        spark.style.cssText = `--spark-angle:${angle}deg;--spark-dist:${dist}px;animation-delay:${(Math.random() * 1.2).toFixed(2)}s`;
        spark.addEventListener('animationend', () => spark.remove(), { once: true });
        chestWrap.appendChild(spark);
      }
      stage.appendChild(chestWrap);

      setTimeout(() => {
        // ── PHASE 2: Flash + light rays (1.5s) ──
        chestEl.classList.remove('chest-rattle');
        chestEl.classList.add('chest-burst-shake');

        const flash = document.createElement('div');
        flash.className = 'chest-flash';
        stage.appendChild(flash);

        const rays = document.createElement('div');
        rays.className = 'chest-rays';
        rays.style.setProperty('--ray-color', tier.glowColor);
        rays.addEventListener('animationend', () => rays.remove(), { once: true });
        stage.appendChild(rays);

        setTimeout(() => {
          flash.remove();
          chestEl.classList.add('chest-hide');

          // ── PHASE 3: Loot arc (2s) ──
          const lootRow = document.createElement('div');
          lootRow.className = 'chest-loot-row';
          stage.appendChild(lootRow);

          drops.forEach((drop, idx) => {
            const lootCard = document.createElement('div');
            lootCard.className = 'chest-loot-card chest-loot-arc';
            lootCard.style.setProperty('--loot-idx', idx);
            lootCard.style.setProperty('--loot-count', drops.length);
            lootCard.style.setProperty('--loot-color', drop.color || '#ffffff');
            lootCard.innerHTML = `<span class="chest-loot-icon">${drop.icon}</span>`;
            lootCard.dataset.rarity = drop.rarity || 'common';
            lootRow.appendChild(lootCard);

            // ── PHASE 4: Reveal on land ──
            const landDelay = 600 + idx * 220;
            setTimeout(() => {
              lootCard.classList.add('chest-loot-land');
              lootCard.classList.add('chest-loot-flip');
              lootCard.innerHTML += `<span class="chest-loot-label" style="color:${drop.color || '#fff'}">${drop.label}</span>`;

              const rarity = drop.rarity || 'common';
              const highRarities = ['epic', 'legendary', 'mythic'];
              if (highRarities.includes(rarity)) {
                _triggerRarityConfetti(lootCard, rarity);
                if (typeof playSound === 'function') playSound('levelup');
              }
            }, landDelay);
          });

          // Done — show close button after all cards land
          const totalAnimTime = 600 + drops.length * 220 + 800;
          setTimeout(() => {
            const closeLootBtn = document.createElement('button');
            closeLootBtn.className = 'chest-close-btn';
            closeLootBtn.textContent = 'COLLECT';
            closeLootBtn.onclick = () => {
              stage.remove();
              if (onComplete) onComplete();
            };
            stage.appendChild(closeLootBtn);
          }, totalAnimTime);

        }, 600); // Phase 2 → 3 transition
      }, 1500); // Phase 1 → 2 transition
    }

    function _triggerRarityConfetti(anchor, rarity) {
      const colors = {
        epic: '#aa44ff',
        legendary: '#f39c12',
        mythic: '#ff4444'
      };
      const color = colors[rarity] || '#ffffff';
      const rect = anchor.getBoundingClientRect();
      for (let i = 0; i < 20; i++) {
        const c = document.createElement('div');
        c.className = 'rarity-confetti';
        c.style.setProperty('--conf-color', color);
        c.style.setProperty('--conf-x', (rect.left + rect.width / 2 + (Math.random() - 0.5) * 120) + 'px');
        c.style.setProperty('--conf-y', (rect.top + (Math.random() - 0.5) * 60) + 'px');
        c.style.setProperty('--conf-rot', Math.floor(Math.random() * 360) + 'deg');
        c.style.setProperty('--conf-delay', (Math.random() * 0.4).toFixed(2) + 's');
        document.body.appendChild(c);
        setTimeout(() => c.remove(), 2000);
      }
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
        // Quest Notification Lock: prevent starting a new run if quests are ready to claim
        if (!isGameActive && saveData.tutorialQuests &&
            saveData.tutorialQuests.readyToClaim && saveData.tutorialQuests.readyToClaim.length > 0) {
          if (typeof showStatusMessage === 'function') {
            showStatusMessage('📜 Claim your completed quest first! Visit the Quest Hall.', 3000);
          }
          if (typeof showQuestHall === 'function') showQuestHall();
          return;
        }
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
        if (window.CampSkillSystem && window.CampSkillSystem.renderSkillTreeWeb) {
          window.CampSkillSystem.renderSkillTreeWeb();
        }
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
        // Mark that we're returning from a run so the level-up curtain waits 3 s
        window._campFromRun = true;
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
          // Prism Reliquary newly unlocked? Show notification
          if (window._prismReliquaryNewlyUnlocked) {
            window._prismReliquaryNewlyUnlocked = false;
            setTimeout(() => {
              if (typeof showStatChange === 'function')
                showStatChange('💎 PRISM RELIQUARY UNLOCKED! Visit it in camp to slot gems!', 'high');
            }, 1500);
          }
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
        // Quest Notification Lock: redirect to camp if quests are ready to claim
        if (saveData.tutorialQuests &&
            saveData.tutorialQuests.readyToClaim && saveData.tutorialQuests.readyToClaim.length > 0) {
          playSound('waterdrop');
          if (typeof showStatusMessage === 'function') {
            showStatusMessage('📜 Claim your completed quest first! Heading to camp...', 3000);
          }
          document.getElementById('gameover-screen').style.display = 'none';
          document.getElementById('camp-screen').style.display = 'flex';
          try { updateCampScreen(); } catch(e) { console.error('[Camp] updateCampScreen error:', e); }
          return;
        }
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

    /**
     * spawnEnemy(type, x, z, level)
     * Creates or reuses an Enemy of the given type at the specified position.
     * Tries the EnemyPool first (zero GC cost); falls back to `new Enemy()` when
     * the pool is empty or unavailable for this type.
     */
    function spawnEnemy(type, x, z, level) {
      return (window.enemyPool && window.enemyPool.acquireEnemy(type, x, z, level))
          || new Enemy(type, x, z, level);
    }

    /**
     * checkTimedAlienSpawns()
     * Called each wave spawn cycle. Spawns Grey Alien Scout at minute 10 and
     * the Annunaki Orb boss at minute 15 (each once per run).
     */
    function checkTimedAlienSpawns() {
      if (!isGameActive || isGameOver || !player || !player.mesh) return;
      const runMinutes = (Date.now() - gameStartTime) / 60000;

      // ── Minute 10: Grey Alien Scout ───────────────────────────────────────
      if (runMinutes >= 10 && !_alienScoutSpawned) {
        _alienScoutSpawned = true;
        const angle = Math.random() * Math.PI * 2;
        const dist = 28;
        const ex = player.mesh.position.x + Math.cos(angle) * dist;
        const ez = player.mesh.position.z + Math.sin(angle) * dist;
        const scout = spawnEnemy(17, ex, ez, playerStats.lvl);
        enemies.push(scout);
        createFloatingText('👽 GREY ALIEN SCOUT INCOMING!', player.mesh.position, '#00FF88');
        if (window.pushSuperStatEvent) {
          window.pushSuperStatEvent('👽 Grey Alien Scout', 'rare', '👽', 'danger');
        }
        console.log('[AlienSpawn] Grey Alien Scout spawned at minute', runMinutes.toFixed(1));
      }

      // ── Minute 15: Annunaki Orb Boss ──────────────────────────────────────
      if (runMinutes >= 15 && !_annunakiOrbSpawned) {
        _annunakiOrbSpawned = true;
        const angle = Math.random() * Math.PI * 2;
        const dist = 32;
        const ex = player.mesh.position.x + Math.cos(angle) * dist;
        const ez = player.mesh.position.z + Math.sin(angle) * dist;
        const orb = spawnEnemy(19, ex, ez, playerStats.lvl);
        enemies.push(orb);
        createFloatingText('⚠️ ANNUNAKI ORB APPROACHING ⚠️', player.mesh.position, '#FFD700');
        triggerCinematic('miniboss', orb.mesh, 4000);
        if (window.pushSuperStatEvent) {
          window.pushSuperStatEvent('🔺 ANNUNAKI ORB', 'epic', '🔺', 'danger');
        }
        console.log('[AlienSpawn] Annunaki Orb boss spawned at minute', runMinutes.toFixed(1));
      }
    }

    function spawnWave() {
      // Ensure blood/chunk pools exist before the first wave fires — guards against
      // any edge case where _ensureEntityPools() was skipped during init().
      if (typeof window._ensureEntityPools === 'function') window._ensureEntityPools();

      waveCount++;
      checkTimedAlienSpawns(); // Check time-based alien spawns on each wave cycle

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
        const flyingBoss = spawnEnemy(11, ex, ez, playerStats.lvl);
        enemies.push(flyingBoss);
        // Debug: log flying boss spawn details
        if (window.GameDebug) window.GameDebug.onBossSpawn(flyingBoss, playerStats.lvl, 'FlyingBoss_L' + playerStats.lvl);
        createFloatingText("⚠️ FLYING BOSS INCOMING! ⚠️", player.mesh.position, '#FF00FF');
        triggerCinematic('miniboss', flyingBoss.mesh, 4000);
        // Escort bugs
        for (let i = 0; i < 4; i++) {
          const sa = Math.random() * Math.PI * 2;
          const sd = 28 + Math.random() * 6;
          enemies.push(spawnEnemy(14, player.mesh.position.x + Math.cos(sa) * sd, player.mesh.position.z + Math.sin(sa) * sd, playerStats.lvl));
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
        const miniBoss = spawnEnemy(10, ex, ez, playerStats.lvl);
        // ── AIDA Dark Pact: boss speed charges ─────────────────
        if (saveData.aidaDarkPacts && (saveData.aidaDarkPacts.bossSpeedCharges || 0) > 0) {
          miniBoss.walkSpeed = (miniBoss.walkSpeed || 4) * 2.0;
          miniBoss.runSpeed  = (miniBoss.runSpeed  || 6) * 2.0;
          saveData.aidaDarkPacts.bossSpeedCharges =
            Math.max(0, saveData.aidaDarkPacts.bossSpeedCharges - 1);
          if (typeof saveSaveData === 'function') saveSaveData();
        }
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
          const minion = spawnEnemy(supportType, supportX, supportZ, playerStats.lvl);
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
          const dist = 15 + Math.random() * 8; // Tighter spawn — just off-screen
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
        // 21: Water Organism (lvl 1+) - new camp-style graphics creature

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

          // Water Organism (type 21) — available from level 1, ~20% chance
          // Camp-style graphics creature with balanced stats
          if (Math.random() < 0.20) {
            type = 21;
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
          // Early game: reliably include Water Organism (type 21), Daddy Longlegs (spider),
          // and the yellow easy enemy (type 7 — visually distinct, manageable at low levels)
          if (Math.random() < 0.25) {
            type = 21; // Water Organism — camp-style creature, balanced stats
          } else if (Math.random() < 0.30) {
            type = 15; // Daddy Longlegs — tiny body, huge legs, low HP like yellow enemy
          } else if (Math.random() < 0.25) {
            type = 7;  // Yellow easy enemy — gold colour, low HP at early-game scaling
          }
        }
        
        const newEnemy = spawnEnemy(type, ex, ez, playerStats.lvl);
        enemies.push(newEnemy);
      }

      // Forbidden Protocol: spawn a Source Glitch (type 20) ~15% chance per wave
      if (window._nmForbiddenProtocol && Math.random() < 0.15) {
        const glitchAngle = Math.random() * Math.PI * 2;
        const glitchDist = 12 + Math.random() * 8;
        const gx = player.mesh.position.x + Math.cos(glitchAngle) * glitchDist;
        const gz = player.mesh.position.z + Math.sin(glitchAngle) * glitchDist;
        const glitch = spawnEnemy(20, gx, gz, playerStats.lvl);
        enemies.push(glitch);
        if (typeof createFloatingText === 'function') {
          createFloatingText('⚠ SOURCE GLITCH', player.mesh.position, '#FF00FF');
        }
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
    // Circular recycle index: when at cap, overwrite the oldest active particle (O(1) per recycle).
    let _particleRecycleIdx = 0;
    function spawnParticles(pos, color, count) {
      if (!particlePool) return; // Safety check
      // Cap particles per spawn to reduce quantity while keeping visuals impactful
      const cappedCount = Math.min(count, 6);
      for (let i = 0; i < cappedCount; i++) {
        if (particles.length >= MAX_TOTAL_PARTICLES) {
          // Hard global cap reached — forcefully recycle the oldest alive particle
          // instead of silently dropping the request. This keeps the array length
          // strictly at MAX_TOTAL_PARTICLES and never allocates new objects.
          const idx = _particleRecycleIdx % particles.length;
          particles[idx].reset(pos, color);
          _particleRecycleIdx = (idx + 1) % particles.length;
        } else {
          const particle = particlePool.get();
          particle.reset(pos, color);
          particles.push(particle);
        }
      }
    }

    // ─── Blood ground decals — single InstancedMesh for zero draw-call overhead ──────
    // One THREE.InstancedMesh with MAX_BLOOD_DECALS slots replaces per-splat Mesh objects.
    // spawnBloodDecal() updates the transformation matrix of the next available slot
    // instead of creating new PlaneGeometry / MeshStandardMaterial each time.
    let _bloodDecalIM        = null;  // THREE.InstancedMesh (MAX_BLOOD_DECALS instances)
    const _bdIMSpawnTime     = new Float64Array(MAX_BLOOD_DECALS); // spawn timestamp per slot
    const _bdIMInitialSize   = new Float32Array(MAX_BLOOD_DECALS); // initial scale size per slot
    const _bdIMMatrix        = new THREE.Matrix4();                 // scratch matrix
    const _bdIMScale         = new THREE.Vector3();
    const _bdIMPos           = new THREE.Vector3();
    const _bdIMQuat          = new THREE.Quaternion();
    const _bdIMRot           = new THREE.Euler(-Math.PI / 2, 0, 0);
    let   _bdIMIndex         = 0;   // circular write index
    const BLOOD_DECAL_FADE_MS = 12000; // 12 seconds fade per spec

    // Lazily initialise the InstancedMesh once the scene exists
    function _ensureBloodDecalIM() {
      if (_bloodDecalIM || !scene || typeof THREE === 'undefined') return;
      const geo = new THREE.CircleGeometry(1, 8); // radius=1; scale controls actual size per slot
      const mat = new THREE.MeshStandardMaterial({
        color: 0x6B0000,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        roughness: 0.15,
        metalness: 0.6,
        emissive: 0x3A0000,
        emissiveIntensity: 0.15,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      _bloodDecalIM = new THREE.InstancedMesh(geo, mat, MAX_BLOOD_DECALS);
      _bloodDecalIM.renderOrder = 12;
      _bloodDecalIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Park all instances below the floor so they are invisible until used
      _bdIMQuat.setFromEuler(_bdIMRot);
      for (let i = 0; i < MAX_BLOOD_DECALS; i++) {
        _bdIMPos.set(0, -100, 0);
        _bdIMScale.set(0.01, 0.01, 0.01);
        _bdIMMatrix.compose(_bdIMPos, _bdIMQuat, _bdIMScale);
        _bloodDecalIM.setMatrixAt(i, _bdIMMatrix);
        _bdIMSpawnTime[i] = 0;
        _bdIMInitialSize[i] = 0;
      }
      _bloodDecalIM.instanceMatrix.needsUpdate = true;
      scene.add(_bloodDecalIM);
      // Expose refs so game-over-reset.js can park all slots on reset
      window._bloodDecalIM   = _bloodDecalIM;
      window._bdIMSpawnTime  = _bdIMSpawnTime;
    }

    function spawnBloodDecal(pos) {
      if (!scene) return;
      _ensureBloodDecalIM();
      if (!_bloodDecalIM) return;
      const idx = _bdIMIndex;
      _bdIMIndex = (idx + 1) % MAX_BLOOD_DECALS;
      const size           = 0.15 + Math.random() * 0.35;
      const initialOpacity = 0.6  + Math.random() * 0.3;
      _bdIMSpawnTime[idx]  = Date.now();
      _bdIMInitialSize[idx] = size;
      _bdIMPos.set(pos.x + (Math.random() - 0.5) * 0.8, 0.01 + (idx * 0.0001), pos.z + (Math.random() - 0.5) * 0.8);
      _bdIMScale.set(size, size, size);
      _bdIMMatrix.compose(_bdIMPos, _bdIMQuat, _bdIMScale);
      _bloodDecalIM.setMatrixAt(idx, _bdIMMatrix);
      _bloodDecalIM.instanceMatrix.needsUpdate = true;
    }

    // Spawn an elongated blood skid mark at a position in a given direction (for shotgun deaths)
    function spawnBloodSkidMark(pos, dirX, dirZ) {
      if (!scene) return;
      const geo = new THREE.PlaneGeometry(1.5, 0.4);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x5A0000,
        transparent: true,
        opacity: 0.6,
        depthWrite: false
      });
      const skid = new THREE.Mesh(geo, mat);
      skid.rotation.x = -Math.PI / 2;
      // Rotate the skid mark to align with the knockback direction
      skid.rotation.z = -Math.atan2(dirZ, dirX);
      skid.renderOrder = -1; // Draw under enemies
      skid.position.set(pos.x, 0.05, pos.z);
      scene.add(skid);
      // Store in bloodDecals pool so it fades out like normal decals
      skid.userData.spawnTime = Date.now();
      skid.userData.initialOpacity = 0.6;
      if (!window._bloodDecals) window._bloodDecals = [];
      window._bloodDecals.push(skid);
      // Auto-remove after 12 seconds
      setTimeout(() => {
        if (skid.parent) scene.remove(skid);
        geo.dispose();
        mat.dispose();
      }, 12000);
    }

    // Update blood decal fade (call in main loop)
    const BLOOD_DECAL_FADE_START = 0.7; // Start fading at 70% of lifetime
    function updateBloodDecals() {
      // InstancedMesh path: fade each active slot via per-instance opacity emulation.
      // Since InstancedMesh shares one material, we encode fade by shrinking the scale
      // of expired slots to zero (parking them) rather than changing opacity per-instance.
      if (_bloodDecalIM) {
        const now = Date.now();
        let needsUpdate = false;
        for (let i = 0; i < MAX_BLOOD_DECALS; i++) {
          const spawnTime = _bdIMSpawnTime[i];
          if (!spawnTime) continue;
          const age = now - spawnTime;
          if (age >= BLOOD_DECAL_FADE_MS) {
            // Park this slot below the floor
            _bdIMSpawnTime[i] = 0;
            _bdIMPos.set(0, -100, 0);
            _bdIMScale.set(0.01, 0.01, 0.01);
            _bdIMMatrix.compose(_bdIMPos, _bdIMQuat, _bdIMScale);
            _bloodDecalIM.setMatrixAt(i, _bdIMMatrix);
            needsUpdate = true;
          } else if (age > BLOOD_DECAL_FADE_MS * BLOOD_DECAL_FADE_START) {
            // Shrink scale to simulate fade-out (single shared material, no per-instance opacity)
            const fadeProgress = (age - BLOOD_DECAL_FADE_MS * BLOOD_DECAL_FADE_START) /
                                 (BLOOD_DECAL_FADE_MS * (1 - BLOOD_DECAL_FADE_START));
            const baseSize = _bdIMInitialSize[i];
            const s = baseSize * (1 - fadeProgress);
            _bloodDecalIM.getMatrixAt(i, _bdIMMatrix);
            _bdIMMatrix.decompose(_bdIMPos, _bdIMQuat, _bdIMScale);
            _bdIMScale.set(s, s, s);
            _bdIMMatrix.compose(_bdIMPos, _bdIMQuat, _bdIMScale);
            _bloodDecalIM.setMatrixAt(i, _bdIMMatrix);
            needsUpdate = true;
          }
        }
        if (needsUpdate) _bloodDecalIM.instanceMatrix.needsUpdate = true;
        return;
      }
      // Legacy per-mesh fallback (active only if InstancedMesh failed to initialise)
      const now = Date.now();
      for (let i = bloodDecals.length - 1; i >= 0; i--) {
        const decal = bloodDecals[i];
        if (!decal.userData.spawnTime) { if (!decal.parent) bloodDecals.splice(i, 1); continue; }
        if (!decal.parent) { bloodDecals.splice(i, 1); continue; }
        const age = now - decal.userData.spawnTime;
        if (age >= BLOOD_DECAL_FADE_MS) {
          if (decal.parent) scene.remove(decal);
          if (decal.geometry) decal.geometry.dispose();
          if (decal.material) decal.material.dispose();
          bloodDecals.splice(i, 1);
        } else if (age > BLOOD_DECAL_FADE_MS * BLOOD_DECAL_FADE_START) {
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
      if (typeof _ensureSmokePool === 'function') _ensureSmokePool();
      for(let i = 0; i < cappedCount; i++) {
        // Enforce global cap - just skip if full, particles expire naturally
        if (smokeParticles.length >= MAX_SMOKE_PARTICLES && smokeParticles.length > 0) {
          // Recycle oldest to keep cap strict
          const oldest = smokeParticles.shift();
          if (scene && oldest.mesh.parent === scene) scene.remove(oldest.mesh);
          if (_smokePool) {
            _smokePool.release(oldest);
          } else if (oldest.material) {
            oldest.material.dispose();
          }
        }
        const entry = _smokePool ? _smokePool.get() : (() => {
          const mesh = new THREE.Mesh(_sharedSmokeSphereGeo, new THREE.MeshBasicMaterial({ 
            color: 0x666666, 
            transparent: true, 
            opacity: 0.5,
            depthWrite: false
          }));
          return {
            mesh,
            material: mesh.material,
            geometry: _sharedSmokeSphereGeo,
            velocity: { x: 0, y: 0, z: 0 },
            life: 0,
            maxLife: GAME_CONFIG.smokeDurationFrames
          };
        })();
        entry.mesh.position.set(
          pos.x + (Math.random() - 0.5) * 0.3,
          pos.y + 0.5,
          pos.z + (Math.random() - 0.5) * 0.3
        );
        entry.velocity.x = (Math.random() - 0.5) * 0.02;
        entry.velocity.y = 0.03 + Math.random() * 0.02;
        entry.velocity.z = (Math.random() - 0.5) * 0.02;
        entry.life = GAME_CONFIG.smokeDurationFrames;
        entry.maxLife = GAME_CONFIG.smokeDurationFrames;
        if (entry.mesh.material) entry.mesh.material.opacity = 0.5;
        entry.mesh.visible = true;
        if (!entry.mesh.parent && scene) scene.add(entry.mesh);
        smokeParticles.push(entry);
      }
    }

    function spawnExp(x, z, sourceWeapon, hitForce, enemyType) {
      expGems.push(new ExpGem(x, z, sourceWeapon, hitForce, enemyType));
    }
    
    function spawnGold(x, z, amount) {
      goldCoins.push(new GoldCoin(x, z, amount));
    }
    
    function spawnGoldDrop(x, z, amount) {
      goldDrops.push(new GoldDrop(x, z, amount));
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
      if (window.GameMilestones) window.GameMilestones.recordLevel(playerStats.lvl);
      // Notify the super stat bar — rarity escalates with milestone levels
      if (window.pushSuperStatEvent) {
        const lvl = playerStats.lvl;
        const r = lvl >= 50 ? 'mythic' : lvl >= 25 ? 'legendary' : lvl >= 10 ? 'epic' : lvl >= 5 ? 'rare' : 'uncommon';
        window.pushSuperStatEvent(`\u2B06 Level ${lvl}!`, r, '\u2728', 'success');
      }
      if (!freeLevel) {
        playerStats.exp -= playerStats.expReq;
      }
      
      // Level 100: Trigger the Annunaki endgame encounter instead of instant victory
      if (playerStats.lvl === 100) {
        levelUpPending = false;
        setGamePaused(false);
        startAnnunakiEvent();
        return;
      }
      
      // XP Curve: Power scaling for a 1–100 progression loop.
      // Levels 1–20: fast (linear feel), 21–50: slows down, 51–100: massive grind.
      // Formula: expReq = baseExp * Math.pow(level, 1.6)
      playerStats.expReq = Math.floor(GAME_CONFIG.baseExpReq * Math.pow(playerStats.lvl, 1.6));
      
      // Quest: The Egg Hunt — Spawn mysterious egg when reaching Level 15
      if (playerStats.lvl >= 15 && saveData.tutorialQuests &&
          saveData.tutorialQuests.currentQuest === 'quest_eggHunt' &&
          !saveData.tutorialQuests.mysteriousEggFound && !window._mysteriousEggSpawned) {
        window._mysteriousEggSpawned = true;
        // Spawn a glowing egg object near the player
        try {
          const eggGroup = new THREE.Group();
          const eggGeo = new THREE.SphereGeometry(0.8, 16, 16);
          eggGeo.scale(1, 1.3, 1); // oval egg shape
          const eggMat = new THREE.MeshStandardMaterial({
            color: 0x8B5CF6, emissive: 0x7C3AED, emissiveIntensity: 0.6,
            metalness: 0.3, roughness: 0.5
          });
          const eggMesh = new THREE.Mesh(eggGeo, eggMat);
          eggMesh.castShadow = true;
          eggMesh.position.y = 0.8;
          eggGroup.add(eggMesh);
          // Position egg ahead of player
          const px = player.mesh ? player.mesh.position.x : 0;
          const pz = player.mesh ? player.mesh.position.z : 0;
          eggGroup.position.set(px + 8, 0, pz + 8);
          eggGroup.userData.isMysteriousEgg = true;
          scene.add(eggGroup);
          window._mysteriousEggObject = eggGroup;
          createFloatingText("🥚 A Mysterious Egg appeared!", eggGroup.position, '#8B5CF6');
          showStatChange('🥚 A Mysterious Egg appeared nearby! Go pick it up!');
        } catch(e) {
          console.error('[Quest] Failed to spawn egg:', e);
        }
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

    // ── ANNUNAKI ENDGAME EVENT (triggered at Level 100) ─────────────────────
    // This is the cinematic, hardcoded boss encounter for reaching the endgame.
    //
    //  Phase 1 – PURGE:    Kill all normal enemies in a screen-wide gore explosion.
    //  Phase 2 – ARRIVAL:  Fade lighting to dark crimson; spawn Annunaki Boss.
    //  Phase 3 – COMBAT:   Two attack patterns (Grid Lock, Gravity Well).
    //                      Massive HP pool protected by a Divine Shield that only
    //                      Void/Mythic gem-equipped players can break.
    // ────────────────────────────────────────────────────────────────────────

    function startAnnunakiEvent() {
      if (window._annunakiEventActive) return; // don't re-trigger
      window._annunakiEventActive = true;

      // ── Phase 1: Kill every living enemy in a spectacular gore burst ────────
      showStatChange('⚠️ LEVEL 100 REACHED — ANNUNAKI DESCENDS ⚠️');
      if (window.pushSuperStatEvent) window.pushSuperStatEvent('💀 ANNUNAKI DESCENDS', 'mythic', '👁️', 'danger');

      enemies.forEach(e => {
        if (!e.isDead) {
          // Spawn a dramatic red particle burst at the enemy position
          try {
            const pos = e.mesh ? e.mesh.position : { x: 0, y: 0, z: 0 };
            createFloatingText('💥', pos, '#FF0000');
          } catch (err) { console.warn('[AnnunakiEvent] Particle effect failed:', err); }
          e.hp = 0;
          e.isDead = true;
          if (e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
        }
      });
      // Remove dead references
      enemies.splice(0, enemies.length);

      // Stop the normal wave spawner permanently for this encounter
      window._annunakiWavesStopped = true;

      // ── Phase 2: Cinematic lighting fade to dark red ─────────────────────────
      const fadeDuration = 3000; // 3 seconds
      const fadeSteps = 60;
      const stepMs = fadeDuration / fadeSteps;
      let step = 0;
      const origAmbR = 1.0, origAmbG = 1.0, origAmbB = 1.0;
      const origDirR = 1.0, origDirG = 1.0, origDirB = 1.0;
      const tgtAmbR = 0.27, tgtAmbG = 0.0, tgtAmbB = 0.0; // dark red ambient
      const tgtDirR = 0.27, tgtDirG = 0.0, tgtDirB = 0.0; // dark red directional

      const lightFadeInterval = setInterval(() => {
        step++;
        const t = step / fadeSteps;
        if (window.ambientLight) {
          window.ambientLight.color.setRGB(
            origAmbR + (tgtAmbR - origAmbR) * t,
            origAmbG + (tgtAmbG - origAmbG) * t,
            origAmbB + (tgtAmbB - origAmbB) * t
          );
        }
        if (window.dirLight) {
          window.dirLight.color.setRGB(
            origDirR + (tgtDirR - origDirR) * t,
            origDirG + (tgtDirG - origDirG) * t,
            origDirB + (tgtDirB - origDirB) * t
          );
        }
        if (step >= fadeSteps) {
          clearInterval(lightFadeInterval);
          spawnAnnunakiBoss(); // Phase 3: Spawn boss after lighting transition
        }
      }, stepMs);

      // ── Web Audio API: deep, booming synth bass drop ─────────────────────────
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          // Sub-bass oscillator
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(60, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 2.5);
          // Gain envelope
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.3);
          gain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 1.5);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 3.5);
          // Low-pass filter for deep rumble
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(200, ctx.currentTime);
          filter.frequency.linearRampToValueAtTime(80, ctx.currentTime + 2.5);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 3.5);

          // Secondary impact transient
          const impactOsc = ctx.createOscillator();
          impactOsc.type = 'square';
          impactOsc.frequency.setValueAtTime(40, ctx.currentTime + 0.05);
          impactOsc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.8);
          const impactGain = ctx.createGain();
          impactGain.gain.setValueAtTime(0.7, ctx.currentTime + 0.05);
          impactGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.0);
          impactOsc.connect(impactGain);
          impactGain.connect(ctx.destination);
          impactOsc.start(ctx.currentTime + 0.05);
          impactOsc.stop(ctx.currentTime + 1.0);
        }
      } catch (err) { console.warn('[AnnunakiEvent] Web Audio API unavailable:', err); }
    }
    window.startAnnunakiEvent = startAnnunakiEvent;

    // Patch spawnWave to respect the Annunaki wave-stop flag
    const _origSpawnWave = spawnWave;
    spawnWave = function() {
      if (window._annunakiWavesStopped) return;
      _origSpawnWave.apply(this, arguments);
    };

    // ── Annunaki Boss spawn & mechanics ────────────────────────────────────────
    function spawnAnnunakiBoss() {
      showStatChange('👁️ THE ANNUNAKI HAS ARRIVED 👁️');

      const playerPos = player && player.mesh ? player.mesh.position : new THREE.Vector3(0, 0, 0);

      // Boss geometry: perfect IcosahedronGeometry — gold & black glass
      const bossGroup = new THREE.Group();
      const icoGeo = new THREE.IcosahedronGeometry(3.5, 1);

      // Outer shell: glowing gold
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xFFD700,
        emissive: 0xBB8800,
        emissiveIntensity: 1.2,
        metalness: 0.95,
        roughness: 0.05,
        transparent: true,
        opacity: 0.88
      });
      const goldMesh = new THREE.Mesh(icoGeo, goldMat);
      bossGroup.add(goldMesh);

      // Inner shell: dark glass
      const innerIcoGeo = new THREE.IcosahedronGeometry(2.5, 1);
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: 0x330033,
        emissiveIntensity: 0.8,
        metalness: 0.2,
        roughness: 0.0,
        transparent: true,
        opacity: 0.65
      });
      const glassMesh = new THREE.Mesh(innerIcoGeo, glassMat);
      bossGroup.add(glassMesh);

      // Position: float 5 units above ground, centred on player
      bossGroup.position.set(playerPos.x, 5, playerPos.z);
      scene.add(bossGroup);

      // Boss state
      const boss = {
        mesh: bossGroup,
        maxHp: 250000,
        hp: 250000,
        divineShieldHp: 50000, // shield that must be broken with Void/Mythic gems
        divineShieldActive: true,
        isDead: false,
        damage: 80,
        // Attack timers
        _gridLockTimer: 0,
        _gravityWellTimer: 0,
        _rotationAngle: 0,
        // Gem-piercing bypass: damage that ignores Divine Shield when player has Void/Mythic gems
        _requiresVoidGems: true
      };
      window._annunakiBoss = boss;

      // HUD announcement
      if (window.pushSuperStatEvent) window.pushSuperStatEvent('👁️ ANNUNAKI', 'mythic', '⬡', 'danger');

      // Register boss in enemies array so combat system can target it
      const bossEnemy = new Enemy(19, playerPos.x, playerPos.z, 100);
      bossEnemy.mesh = bossGroup;
      bossEnemy.hp = boss.hp;
      bossEnemy.maxHp = boss.maxHp;
      bossEnemy.isAnnunakiBoss = true;
      bossEnemy.divineShieldActive = true;
      bossEnemy.divineShieldHp = boss.divineShieldHp;
      enemies.push(bossEnemy);

      // ── Continuous boss update: rotation + attacks ───────────────────────
      const GRID_LOCK_INTERVAL  = 6000;  // ms between Grid Lock attacks
      const GRAVITY_WELL_INTERVAL = 9000; // ms between Gravity Well attacks
      let lastGridLock   = Date.now();
      let lastGravityWell = Date.now() + 3000; // offset so they don't fire simultaneously

      function bossTick() {
        if (bossEnemy.isDead || isGameOver || !isGameActive) {
          // Boss defeated — victory
          setTimeout(() => {
            showStatChange('🎉 ANNUNAKI DEFEATED! ULTIMATE VICTORY! 🎉');
            if (window.pushSuperStatEvent) window.pushSuperStatEvent('🏆 VICTORY', 'mythic', '🏆', 'success');
            setTimeout(() => { if (typeof gameOver === 'function') gameOver(); }, 3000);
          }, 500);
          return;
        }

        const now = Date.now();

        // Slow rotation
        bossGroup.rotation.y += 0.008;
        bossGroup.rotation.x += 0.004;
        bossGroup.position.y = 5 + Math.sin(now * 0.001) * 0.5; // gentle float

        // Divine Shield visual pulse
        if (bossEnemy.divineShieldActive) {
          goldMat.emissiveIntensity = 0.8 + Math.sin(now * 0.003) * 0.6;
        } else {
          goldMat.emissiveIntensity = 0.3;
          goldMat.color.setHex(0x883300); // Damaged: dim orange-red
        }

        // Attack 1: Grid Lock
        if (now - lastGridLock > GRID_LOCK_INTERVAL) {
          lastGridLock = now;
          triggerGridLockAttack(bossGroup.position);
        }

        // Attack 2: Gravity Well
        if (now - lastGravityWell > GRAVITY_WELL_INTERVAL) {
          lastGravityWell = now;
          triggerGravityWellAttack(bossGroup.position);
        }

        requestAnimationFrame(bossTick);
      }
      requestAnimationFrame(bossTick);
    }

    // ── Attack 1: Grid Lock — laser grids appear under the player that explode upward ──
    function triggerGridLockAttack(bossPos) {
      if (!player || !player.mesh || isGameOver) return;
      showStatChange('⚡ GRID LOCK — MOVE NOW!');

      const gridCount = 5;
      const grids = [];

      for (let i = 0; i < gridCount; i++) {
        const angle = (i / gridCount) * Math.PI * 2;
        const radius = 4 + Math.random() * 6;
        const gx = player.mesh.position.x + Math.cos(angle) * radius;
        const gz = player.mesh.position.z + Math.sin(angle) * radius;

        // Create glowing floor grid tile
        const gridGeo = new THREE.PlaneGeometry(3, 3);
        const gridMat = new THREE.MeshBasicMaterial({
          color: 0xFF4400,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide
        });
        const gridMesh = new THREE.Mesh(gridGeo, gridMat);
        gridMesh.rotation.x = -Math.PI / 2;
        gridMesh.position.set(gx, 0.05, gz);
        scene.add(gridMesh);
        grids.push({ mesh: gridMesh, mat: gridMat, x: gx, z: gz, exploded: false });
      }

      // Warn for 2.5 seconds then explode upward
      let pulse = 0;
      const pulseInterval = setInterval(() => {
        pulse++;
        grids.forEach(g => {
          g.mat.opacity = 0.3 + (pulse % 2) * 0.5;
          g.mat.color.setHex(pulse % 2 === 0 ? 0xFF4400 : 0xFFFF00);
        });
      }, 250);

      setTimeout(() => {
        clearInterval(pulseInterval);
        grids.forEach(g => {
          // Upward explosion pillar
          const pillarGeo = new THREE.CylinderGeometry(1.2, 1.5, 12, 8);
          const pillarMat = new THREE.MeshBasicMaterial({ color: 0xFF8800, transparent: true, opacity: 0.75 });
          const pillar = new THREE.Mesh(pillarGeo, pillarMat);
          pillar.position.set(g.x, 6, g.z);
          scene.add(pillar);

          // Damage player if inside explosion radius
          if (player && player.mesh) {
            const dx = player.mesh.position.x - g.x;
            const dz = player.mesh.position.z - g.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < 2.5) {
              playerStats.hp = Math.max(0, playerStats.hp - 60);
              updateHUD();
              if (playerStats.hp <= 0) { gameOver(); return; }
            }
          }

          // Remove pillar after 0.8 s
          setTimeout(() => {
            if (pillar.parent) pillar.parent.remove(pillar);
            pillarGeo.dispose();
            pillarMat.dispose();
          }, 800);

          if (g.mesh.parent) g.mesh.parent.remove(g.mesh);
          g.mat.dispose();
        });
      }, 2500);
    }

    // ── Attack 2: Gravity Well — pulls player toward boss, fires tracking orbs ──
    function triggerGravityWellAttack(bossPos) {
      if (!player || !player.mesh || isGameOver) return;
      showStatChange('🌀 GRAVITY WELL — RESIST THE PULL!');

      const pullDuration = 5000; // 5 seconds of pull
      const pullStart = Date.now();
      const orbCount = 4;

      // Spawn tracking orbs
      const orbs = [];
      for (let i = 0; i < orbCount; i++) {
        const orbGeo = new THREE.SphereGeometry(0.4, 8, 8);
        const orbMat = new THREE.MeshBasicMaterial({ color: 0xAA00FF, transparent: true, opacity: 0.9 });
        const orbMesh = new THREE.Mesh(orbGeo, orbMat);
        const spawnAngle = (i / orbCount) * Math.PI * 2;
        orbMesh.position.set(
          bossPos.x + Math.cos(spawnAngle) * 5,
          bossPos.y,
          bossPos.z + Math.sin(spawnAngle) * 5
        );
        scene.add(orbMesh);
        orbs.push({ mesh: orbMesh, mat: orbMat, geo: orbGeo, speed: 0.04 + i * 0.01 });
      }

      // Pull & orb update loop
      function gravityTick() {
        const elapsed = Date.now() - pullStart;
        if (elapsed > pullDuration || isGameOver || !player || !player.mesh) {
          orbs.forEach(o => { if (!o.removed && o.mesh.parent) { o.mesh.parent.remove(o.mesh); o.geo.dispose(); o.mat.dispose(); o.removed = true; } });
          return;
        }

        // Gravity pull: nudge player toward boss position
        if (player && player.mesh) {
          const pullStrength = 0.02;
          const dx = bossPos.x - player.mesh.position.x;
          const dz = bossPos.z - player.mesh.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz) || 1;
          player.mesh.position.x += (dx / dist) * pullStrength;
          player.mesh.position.z += (dz / dist) * pullStrength;
        }

        // Track orbs toward player
        orbs.forEach(o => {
          if (o.removed) return;
          const tdx = player.mesh.position.x - o.mesh.position.x;
          const tdz = player.mesh.position.z - o.mesh.position.z;
          const tdist = Math.sqrt(tdx * tdx + tdz * tdz) || 1;
          o.mesh.position.x += (tdx / tdist) * o.speed;
          o.mesh.position.z += (tdz / tdist) * o.speed;

          // Check hit
          if (tdist < 0.8 && player && player.mesh) {
            playerStats.hp = Math.max(0, playerStats.hp - 25);
            updateHUD();
            if (o.mesh.parent) o.mesh.parent.remove(o.mesh);
            o.mat.dispose();
            o.geo.dispose();
            o.removed = true;
            if (playerStats.hp <= 0) { gameOver(); return; }
          }
        });

        requestAnimationFrame(gravityTick);
      }
      requestAnimationFrame(gravityTick);
    }

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
        font-size: 44px;
        font-weight: 500;
        color: #FFD700;
        text-shadow: 
          0 0 10px rgba(255,165,0,0.95),
          0 0 22px rgba(255,80,0,0.7),
          0 0 40px rgba(255,215,0,0.5),
          2px 2px 0 #000,
          -1px -1px 0 #000,
          1px -1px 0 #000,
          -1px 1px 0 #000;
        z-index: 200;
        pointer-events: none;
        letter-spacing: 6px;
        will-change: transform, opacity;
      `;
      levelUpText.textContent = 'LEVEL UP!';
      document.body.appendChild(levelUpText);

      // ── Fire ember particles spawned around the text ──────────────────────
      const _embers = [];
      const _EMBER_COUNT = 18;
      function _spawnEmbers(cx, cy) {
        for (let i = 0; i < _EMBER_COUNT; i++) {
          const em = document.createElement('div');
          const size = 4 + Math.random() * 7;
          const emberColor = Math.random() < 0.5 ? '#FF4500' : (Math.random() < 0.5 ? '#FFD700' : '#FF8C00');
          em.style.cssText = `
            position:fixed;
            width:${size}px;height:${size}px;
            border-radius:50%;
            background:${emberColor};
            box-shadow:0 0 ${size*1.5}px ${emberColor};
            left:${cx}px;top:${cy}px;
            pointer-events:none;
            z-index:199;
            transform:translate(-50%,-50%);
            will-change:transform,opacity;
          `;
          document.body.appendChild(em);
          const angle  = (Math.random() * Math.PI * 2);
          const speed  = 1.5 + Math.random() * 2.8;
          const drift  = (Math.random() - 0.5) * 0.6;
          const life   = 600 + Math.random() * 600;
          _embers.push({ el: em, vx: Math.cos(angle)*speed+drift, vy: -(speed*0.8+Math.random()*1.2), startTime: Date.now(), life });
        }
      }

      function _tickEmbers() {
        const now = Date.now();
        for (let i = _embers.length - 1; i >= 0; i--) {
          const e = _embers[i];
          const t = (now - e.startTime) / e.life;
          if (t >= 1) {
            if (e.el.parentNode) e.el.parentNode.removeChild(e.el);
            _embers.splice(i, 1);
            continue;
          }
          const px = parseFloat(e.el.style.left) + e.vx;
          const py = parseFloat(e.el.style.top)  + e.vy;
          e.vy  -= 0.04; // gravity upward rise for fire
          e.vx  *= 0.97; // slight drag
          e.el.style.left    = px + 'px';
          e.el.style.top     = py + 'px';
          e.el.style.opacity = (1 - t * t).toFixed(3);
        }
        if (_embers.length > 0) requestAnimationFrame(_tickEmbers);
      }
      
      // Animation: shoot up from character head, wait 0.2s, then float to center, then burn away
      const startTime = Date.now();
      const totalDuration = 2200;
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      let _embersSpawned = false;
      
      const animFn = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / totalDuration;
        
        if (progress < 0.15) {
          // Phase 1: Shoot up from head (0-15% = ~330ms)
          const t = progress / 0.15;
          const scale = t * 1.3;
          const curY = startY - t * 90;
          levelUpText.style.top = curY + 'px';
          levelUpText.style.transform = `translate(-50%, -50%) scale(${scale})`;
          levelUpText.style.opacity = t;
        } else if (progress < 0.25) {
          // Phase 2: Hold at position (15-25%)
          levelUpText.style.transform = `translate(-50%, -50%) scale(1.3)`;
          levelUpText.style.opacity = '1';
          // Spawn embers once when fully visible
          if (!_embersSpawned) {
            _embersSpawned = true;
            const rect = levelUpText.getBoundingClientRect();
            _spawnEmbers(rect.left + rect.width / 2, rect.top + rect.height / 2);
            requestAnimationFrame(_tickEmbers);
          }
        } else if (progress < 0.65) {
          // Phase 3: Float toward center (25-65%)
          const t = (progress - 0.25) / 0.40;
          const curX = startX + (centerX - startX) * t;
          const curY = (startY - 90) + (centerY - (startY - 90)) * t;
          const scale = 1.3 + t * 0.2;
          levelUpText.style.left = curX + 'px';
          levelUpText.style.top  = curY + 'px';
          levelUpText.style.transform = `translate(-50%, -50%) scale(${scale})`;
          levelUpText.style.opacity = '1';
        } else if (progress < 1) {
          // Phase 4: Burn-away dissolve at center (65-100%)
          // Colour progression: golden (#FFD700) → orange (hsl ~30) → red (hsl 0) → near-black
          // fp 0.0-0.4: gold phase; 0.4-0.7: hue drops 30→-24 (orange→red), lightness 60→25;
          // 0.7-1.0: red darkens to black (lightness 20→0)
          const fp = (progress - 0.65) / 0.35;
          const burnHue = fp < 0.4
            ? `#FFD700`                              // golden phase
            : fp < 0.7
              ? `hsl(${30 - fp*80},100%,${60 - fp*50}%)`  // orange→red
              : `hsl(0,80%,${Math.max(0,20 - (fp-0.7)*70)}%)`;  // red→black
          levelUpText.style.left   = centerX + 'px';
          levelUpText.style.top    = centerY + 'px';
          levelUpText.style.color  = burnHue;
          levelUpText.style.textShadow = `0 0 ${30*(1-fp)}px ${burnHue}, 2px 2px 0 #000`;
          const scale = 1.5 - fp * 0.4;
          levelUpText.style.transform = `translate(-50%, -50%) scale(${scale}) skewX(${fp*6}deg)`;
          levelUpText.style.opacity = Math.max(0, 1 - fp * 1.1);
          // Spawn extra embers at peak
          if (fp > 0.05 && fp < 0.35 && Math.random() < 0.25) {
            const rect = levelUpText.getBoundingClientRect();
            _spawnEmbers(rect.left + rect.width/2 + (Math.random()-0.5)*60,
                         rect.top  + rect.height/2 + (Math.random()-0.5)*20);
          }
        } else {
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
      // Flash the player mesh white and scale up 1.3× for 0.3 s to signal the level-up in 3D
      if (player && player.mesh && player.mesh.material && player.mesh.material.color) {
        const origColor  = player.mesh.material.color.getHex();
        const origScaleX = player.mesh.scale.x;
        const origScaleY = player.mesh.scale.y;
        const origScaleZ = player.mesh.scale.z;
        player.mesh.material.color.setHex(0xffffff);
        player.mesh.scale.set(origScaleX * 1.3, origScaleY * 1.3, origScaleZ * 1.3);
        setTimeout(() => {
          if (!player || !player.mesh || !player.mesh.material) return;
          player.mesh.material.color.setHex(origColor);
          player.mesh.scale.set(origScaleX, origScaleY, origScaleZ);
        }, 300);
      }

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
    
    function createFloatingText(text, pos, color) {
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
      statusEl.style.color = color || '#FF4444'; // Use caller-supplied color or default red
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
