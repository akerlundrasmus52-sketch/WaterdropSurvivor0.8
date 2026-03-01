// js/main.js — Game state variables, module aliases, and initial settings.
// Loaded as a regular <script>; all top-level declarations become lexical globals.
// THREE.js is loaded from CDN before this file.

    // THREE.js is loaded via CDN <script> tag in index.html — no import needed here.


    // --- GLOBALS FROM EARLIER SCRIPTS ---
    // audio.js, utils.js, state.js, weapons.js, enemies.js, combat.js, player.js,
    // world.js, ui.js, renderer.js are all loaded as regular scripts before this file.
    // Their top-level const/let/function declarations are already in the global scope:
    //   playSound, initMusic, updateBackgroundMusic, startDroneHum, stopDroneHum (audio.js)
    //   audioCtx, getRarityColor, getChestTierForCombo, KILL_CAM_CONSTANTS (utils.js / audio.js)
    //   getDefaultWeapons, WEAPON_UPGRADES (weapons.js)
    //   ENEMY_TYPES, getEnemyBaseStats (enemies.js)
    //   calculateArmorReduction, calculateEnemyArmorReduction (combat.js)
    //   getDefaultPlayerStats (player.js)
    //   COLORS, GAME_CONFIG, countdownMessages, COMPANIONS, getInitialDayNightCycle (world.js)
    //   showStatChange, showStatusMessage, showYouDiedBanner (ui.js)
    //   RENDERER_CONFIG (renderer.js)
    // Do NOT re-declare any of these with const/let — the earlier scripts already put
    // them in the global lexical environment, and a duplicate const would throw SyntaxError.

    // --- CONSTANTS & CONFIG ---
    // COLORS and GAME_CONFIG are defined in world.js (global scope).

    // --- GAME STATE ---
    let scene, camera, renderer;
    let player;
    let savedCameraPosition = null; // Camera position saved during level-up
    let enemies = [];
    let projectiles = [];
    let expGems = [];
    let goldCoins = [];
    let chests = [];
    let particles = [];
    let damageNumbers = [];
    let meteors = [];
    let flashLights = []; // Track temporary flash lights for cleanup
    let activeTimeouts = []; // Track active timeouts for cleanup
    let playerRecoilTimeout = null; // Track recoil animation to prevent conflicts
    let droneTurrets = []; // Track active drone turrets
    
    // Cinematic camera system
    let cinematicActive = false;
    let cinematicData = null;
    // Performance: Cache animated scene objects to avoid scene.traverse() every frame
    let animatedSceneObjects = {
      windmills: [],
      waterRipples: [],
      sparkles: [],
      crystals: [],
      cometParticles: [],
      waterfalls: [],
      waterDrops: [],
      splashes: [],
      teslaTowers: [] // FRESH: Tesla Tower animation
    };
    let lastTime = null; // Initialize as null for proper first-frame detection (PR #82 fix)
    let animationFrameId = null; // Track the animation frame ID for potential cancellation
    
    // Phase 5: Initialize particle object pool for performance
    let particlePool = null; // Will be initialized after scene is created
    
    // Managed animations array - replaces orphaned requestAnimationFrame loops in death/damage effects
    let managedAnimations = [];
    const MAX_MANAGED_ANIMATIONS = 200; // Increased from 100 to accommodate air blood pool animations

    // Smoke particles managed array (avoids RAF accumulation over long sessions)
    let smokeParticles = [];
    const MAX_SMOKE_PARTICLES = 30; // Cap to prevent performance issues
    
    // Deferred disposal queue for Three.js memory management (PR #81)
    const disposalQueue = [];
    const MAX_DISPOSALS_PER_FRAME = 10;
    
    // Ground blood decals array (cleaned up on reset)
    let bloodDecals = [];
    const MAX_BLOOD_DECALS = 50; // Cap for performance
    
    // Blood drips array - updated in main game loop to avoid many individual RAF loops
    let bloodDrips = [];
    const MAX_BLOOD_DRIPS = 40;
    
    // Shared geometry for enemy bullet-hole decals (reused across all enemies for performance)
    const bulletHoleGeo = new THREE.CircleGeometry(0.08, 6);
    const bulletHoleMat = new THREE.MeshBasicMaterial({ color: 0x3A0000, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    
    let frameCount = 0;
    let isPaused = false;
    let pauseOverlayCount = 0;
    let isGameOver = false;
    let levelUpPending = false;
    let pendingQuestLevels = 0; // Queue of free (no-XP-cost) level-ups from quest rewards
    let isGameActive = false;  // Changed to false - start with menu
    let gameTime = 0;
    let gameStartTime = 0;
    
    // Kill Cam System - Diverse animations on enemy death
    let killCamActive = false;
    let killCamTimer = 0;
    let killCamDuration = 0;
    let killCamType = null;
    let killCamData = {};
    
    // Cinematic Camera System - Dramatic sequences for mini-bosses and special events
    function triggerCinematic(type, target, duration = 3000) {
      if (cinematicActive) return; // Don't interrupt existing cinematic
      
      cinematicActive = true;
      cinematicData = {
        type: type,
        target: target,
        startTime: Date.now(),
        duration: duration,
        originalCameraPos: camera.position.clone(),
        originalCameraTarget: new THREE.Vector3(player.mesh.position.x, 0, player.mesh.position.z)
      };
      
      // Play dramatic sound for mini-boss
      if (type === 'miniboss') {
        playSound('hit', 1.5, 0.3); // Low pitch dramatic hit
      }
    }
    
    function updateCinematic() {
      if (!cinematicActive || !cinematicData) return;
      
      const elapsed = Date.now() - cinematicData.startTime;
      const progress = Math.min(elapsed / cinematicData.duration, 1);
      
      // Safety: if cinematic target was destroyed (e.g. boss died mid-cinematic),
      // force-end the cinematic to prevent accessing null/disposed objects.
      if (cinematicData.type === 'miniboss' && (!cinematicData.target || !cinematicData.target.position)) {
        console.warn('[Cinematic] Target lost (boss died?) — force-ending cinematic');
        camera.position.copy(cinematicData.originalCameraPos);
        camera.lookAt(cinematicData.originalCameraTarget);
        cinematicActive = false;
        cinematicData = null;
        return;
      }
      if (cinematicData.type === 'stonehenge' && !cinematicData.target) {
        console.warn('[Cinematic] Stonehenge target lost — force-ending cinematic');
        camera.position.copy(cinematicData.originalCameraPos);
        camera.lookAt(cinematicData.originalCameraTarget);
        cinematicActive = false;
        cinematicData = null;
        return;
      }
      
      if (progress >= 1) {
        // End cinematic - restore camera
        camera.position.copy(cinematicData.originalCameraPos);
        camera.lookAt(cinematicData.originalCameraTarget);
        const endedType = cinematicData.type;
        cinematicActive = false;
        cinematicData = null;
        console.log(`[Cinematic] '${endedType}' ended — camera restored, loop running normally`);
        return;
      }
      
      // Different cinematic types
      if (cinematicData.type === 'miniboss') {
        // Mini-boss cinematic: zoom to boss, show flex, zoom back
        const halfDuration = cinematicData.duration / 2;
        
        if (elapsed < halfDuration) {
          // First half: zoom to boss
          const zoomProgress = elapsed / halfDuration;
          const targetPos = cinematicData.target.position;
          
          camera.position.x = cinematicData.originalCameraPos.x + (targetPos.x - cinematicData.originalCameraPos.x) * zoomProgress;
          camera.position.z = cinematicData.originalCameraPos.z + ((targetPos.z + 12) - cinematicData.originalCameraPos.z) * zoomProgress;
          camera.lookAt(targetPos.x, 0.5, targetPos.z);
          
          // Boss flex/roar animation
          const flexScale = 1 + Math.sin(elapsed * 0.01) * 0.15;
          cinematicData.target.scale.set(flexScale, flexScale, flexScale);
          
          // Screen shake
          const shakeIntensity = 0.3 * Math.sin(elapsed * 0.02);
          camera.position.x += (Math.random() - 0.5) * shakeIntensity;
          camera.position.y += (Math.random() - 0.5) * shakeIntensity;
        } else {
          // Second half: zoom back to player
          const returnProgress = (elapsed - halfDuration) / halfDuration;
          const targetPos = cinematicData.target.position;
          
          camera.position.x = cinematicData.originalCameraPos.x + (targetPos.x - cinematicData.originalCameraPos.x) * (1 - returnProgress);
          camera.position.z = cinematicData.originalCameraPos.z + ((targetPos.z + 12) - cinematicData.originalCameraPos.z) * (1 - returnProgress);
          camera.lookAt(
            player.mesh.position.x * returnProgress + targetPos.x * (1 - returnProgress),
            0,
            player.mesh.position.z * returnProgress + targetPos.z * (1 - returnProgress)
          );
          
          // Reset boss scale gradually
          const flexScale = 1 + Math.sin(elapsed * 0.01) * 0.15 * (1 - returnProgress);
          cinematicData.target.scale.set(flexScale, flexScale, flexScale);
        }
      } else if (cinematicData.type === 'stonehenge') {
        // Stonehenge chest cinematic: quick focus on chest location
        const halfDuration = cinematicData.duration / 2;
        
        if (elapsed < halfDuration) {
          // First half: pan to chest
          const panProgress = elapsed / halfDuration;
          const targetPos = cinematicData.target;
          
          camera.position.x = cinematicData.originalCameraPos.x + (targetPos.x - cinematicData.originalCameraPos.x) * panProgress;
          camera.position.z = cinematicData.originalCameraPos.z + ((targetPos.z + 10) - cinematicData.originalCameraPos.z) * panProgress;
          camera.lookAt(targetPos.x, 0, targetPos.z);
        } else {
          // Second half: pan back to player
          const returnProgress = (elapsed - halfDuration) / halfDuration;
          const targetPos = cinematicData.target;
          
          camera.position.x = cinematicData.originalCameraPos.x + (targetPos.x - cinematicData.originalCameraPos.x) * (1 - returnProgress);
          camera.position.z = cinematicData.originalCameraPos.z + ((targetPos.z + 10) - cinematicData.originalCameraPos.z) * (1 - returnProgress);
          camera.lookAt(
            player.mesh.position.x * returnProgress + targetPos.x * (1 - returnProgress),
            0,
            player.mesh.position.z * returnProgress + targetPos.z * (1 - returnProgress)
          );
        }
      }
    }
    
    // Expose game state on window object for external access and fallback handlers (acceptance criteria #2)
    // These are kept in sync with local variables throughout the code
    window.isPaused = false;
    window.isGameActive = false;
    window.gameModuleReady = false;  // Will be set true after init completes
    
    // Helper functions to keep window variables in sync (acceptance criteria #2)
    function setGamePaused(paused) {
      if (paused) {
        pauseOverlayCount++;
      } else {
        pauseOverlayCount = Math.max(0, pauseOverlayCount - 1);
      }
      const shouldPause = pauseOverlayCount > 0;
      isPaused = shouldPause;
      window.isPaused = shouldPause;
      window.pauseOverlayCount = pauseOverlayCount;
    }
    window.setGamePaused = (paused) => setGamePaused(paused);
    window.pauseOverlayCount = 0;
    
    function setGameActive(active) {
      isGameActive = active;
      window.isGameActive = active;
    }
    
    function setGameOver(gameOverState) {
      isGameOver = gameOverState;
      window.isGameOver = gameOverState;
    }
    
    // Day/Night Cycle System - Smooth, non-blocking transitions
    // Initial state provided by world.js → getInitialDayNightCycle()
    let dayNightCycle = getInitialDayNightCycle();
    
    // Ambient Creatures System
    let ambientCreatures = [];
    let ambientCreatureTimer = 0;
    
    function updateAmbientCreatures(dt) {
      const t = dayNightCycle.timeOfDay;
      
      // Update timer
      ambientCreatureTimer += dt;
      
      // Spawn new creatures based on time of day
      if (ambientCreatureTimer > 2) { // Every 2 seconds, check for spawning
        ambientCreatureTimer = 0;
        
        // Day creatures (0.2 - 0.7): Birds
        if (t >= 0.2 && t < 0.7 && ambientCreatures.length < 10) {
          if (Math.random() < 0.3) {
            spawnBird();
          }
        }
        
        // Dawn/Dusk (0.7 - 0.9): Fireflies
        if ((t >= 0.7 && t < 0.9) && ambientCreatures.length < 15) {
          if (Math.random() < 0.5) {
            spawnFirefly();
          }
        }
        
        // Night creatures (0.9 - 1.0 OR 0.0 - 0.2): Bats and Owls
        if ((t >= 0.9 || t < 0.2) && ambientCreatures.length < 12) {
          if (Math.random() < 0.4) {
            if (Math.random() < 0.7) {
              spawnBat();
            } else {
              spawnOwl();
            }
          }
        }
      }
      
      // Update existing creatures
      for (let i = ambientCreatures.length - 1; i >= 0; i--) {
        const creature = ambientCreatures[i];
        creature.life--;
        
        if (creature.life <= 0 || !creature.mesh.parent) {
          // Remove creature
          if (creature.mesh.parent) {
            scene.remove(creature.mesh);
          }
          creature.mesh.geometry.dispose();
          creature.mesh.material.dispose();
          ambientCreatures.splice(i, 1);
          continue;
        }
        
        // Update position based on creature type
        if (creature.type === 'bird') {
          creature.mesh.position.x += creature.velocity.x * dt;
          creature.mesh.position.y += Math.sin(creature.life * 0.05) * 0.01;
          creature.mesh.position.z += creature.velocity.z * dt;
          creature.mesh.rotation.y = Math.atan2(creature.velocity.z, creature.velocity.x);
        } else if (creature.type === 'bat') {
          creature.mesh.position.x += creature.velocity.x * dt;
          creature.mesh.position.y += Math.sin(creature.life * 0.1) * 0.02;
          creature.mesh.position.z += creature.velocity.z * dt;
          creature.mesh.rotation.y = Math.atan2(creature.velocity.z, creature.velocity.x);
        } else if (creature.type === 'owl') {
          creature.mesh.position.x += creature.velocity.x * dt;
          creature.mesh.position.y += Math.sin(creature.life * 0.03) * 0.015;
          creature.mesh.position.z += creature.velocity.z * dt;
          creature.mesh.rotation.y = Math.atan2(creature.velocity.z, creature.velocity.x);
        } else if (creature.type === 'firefly') {
          creature.mesh.position.x += Math.sin(creature.life * 0.05) * 0.02;
          creature.mesh.position.y += Math.sin(creature.life * 0.08) * 0.01;
          creature.mesh.position.z += Math.cos(creature.life * 0.05) * 0.02;
          // Pulsing glow
          const glow = 0.5 + Math.sin(creature.life * 0.15) * 0.5;
          creature.mesh.material.opacity = glow * 0.8;
        }
      }
    }
    
    function spawnBird() {
      const birdGeo = new THREE.ConeGeometry(0.1, 0.2, 4);
      const birdMat = new THREE.MeshBasicMaterial({ color: 0x8B4513 }); // Brown
      const bird = new THREE.Mesh(birdGeo, birdMat);
      
      // Spawn at random edge of map
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) { // Top
        bird.position.set(Math.random() * 200 - 100, 8 + Math.random() * 5, 100);
      } else if (edge === 1) { // Right
        bird.position.set(100, 8 + Math.random() * 5, Math.random() * 200 - 100);
      } else if (edge === 2) { // Bottom
        bird.position.set(Math.random() * 200 - 100, 8 + Math.random() * 5, -100);
      } else { // Left
        bird.position.set(-100, 8 + Math.random() * 5, Math.random() * 200 - 100);
      }
      
      bird.rotation.x = Math.PI / 2;
      scene.add(bird);
      
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        0,
        (Math.random() - 0.5) * 10
      ).normalize().multiplyScalar(8);
      
      ambientCreatures.push({
        type: 'bird',
        mesh: bird,
        velocity: velocity,
        life: 300
      });
    }
    
    function spawnBat() {
      const batGeo = new THREE.ConeGeometry(0.08, 0.15, 4);
      const batMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a }); // Dark gray
      const bat = new THREE.Mesh(batGeo, batMat);
      
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) {
        bat.position.set(Math.random() * 200 - 100, 5 + Math.random() * 3, 100);
      } else if (edge === 1) {
        bat.position.set(100, 5 + Math.random() * 3, Math.random() * 200 - 100);
      } else if (edge === 2) {
        bat.position.set(Math.random() * 200 - 100, 5 + Math.random() * 3, -100);
      } else {
        bat.position.set(-100, 5 + Math.random() * 3, Math.random() * 200 - 100);
      }
      
      bat.rotation.x = Math.PI / 2;
      scene.add(bat);
      
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        0,
        (Math.random() - 0.5) * 10
      ).normalize().multiplyScalar(12);
      
      ambientCreatures.push({
        type: 'bat',
        mesh: bat,
        velocity: velocity,
        life: 250
      });
    }
    
    function spawnOwl() {
      const owlGeo = new THREE.ConeGeometry(0.12, 0.25, 4);
      const owlMat = new THREE.MeshBasicMaterial({ color: 0x8B7355 }); // Tan
      const owl = new THREE.Mesh(owlGeo, owlMat);
      
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) {
        owl.position.set(Math.random() * 200 - 100, 6 + Math.random() * 4, 100);
      } else if (edge === 1) {
        owl.position.set(100, 6 + Math.random() * 4, Math.random() * 200 - 100);
      } else if (edge === 2) {
        owl.position.set(Math.random() * 200 - 100, 6 + Math.random() * 4, -100);
      } else {
        owl.position.set(-100, 6 + Math.random() * 4, Math.random() * 200 - 100);
      }
      
      owl.rotation.x = Math.PI / 2;
      scene.add(owl);
      
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        0,
        (Math.random() - 0.5) * 10
      ).normalize().multiplyScalar(6);
      
      ambientCreatures.push({
        type: 'owl',
        mesh: owl,
        velocity: velocity,
        life: 350
      });
    }
    
    function spawnFirefly() {
      const fireflyGeo = new THREE.SphereGeometry(0.05, 6, 6);
      const fireflyMat = new THREE.MeshBasicMaterial({ 
        color: 0xFFFF00,
        transparent: true,
        opacity: 0.7
      });
      const firefly = new THREE.Mesh(fireflyGeo, fireflyMat);
      
      // Spawn near player
      const offsetX = (Math.random() - 0.5) * 30;
      const offsetZ = (Math.random() - 0.5) * 30;
      firefly.position.set(
        player.mesh.position.x + offsetX,
        1 + Math.random() * 3,
        player.mesh.position.z + offsetZ
      );
      
      scene.add(firefly);
      
      ambientCreatures.push({
        type: 'firefly',
        mesh: firefly,
        velocity: new THREE.Vector3(0, 0, 0),
        life: 400
      });
    }
    
    let waveCount = 0;
    let lastWaveEndTime = 0; // Track when last wave was cleared
    let _firstEnemyTutorialShown = false; // Track if first-enemy steering/aim tutorial was shown
    let windmillQuest = { active: false, timer: 0, duration: 30, windmill: null, hasCompleted: false, dialogueOpen: false, rewardReady: false, rewardGiven: false, failed: false, failedCooldown: false };
    let montanaQuest = { active: false, timer: 0, duration: 45, kills: 0, killsNeeded: 15, landmark: null, hasCompleted: false };
    let eiffelQuest = { active: false, timer: 0, duration: 60, kills: 0, killsNeeded: 25, landmark: null, hasCompleted: false };
    const MONTANA_QUEST_TRIGGER_DISTANCE = 15; // Proximity distance for Montana quest
    const EIFFEL_QUEST_TRIGGER_DISTANCE = 20; // Proximity distance for Eiffel quest (larger due to taller structure)
    let montanaLandmark = null; // Store Montana landmark reference for efficient distance checks
    let eiffelLandmark = null; // Store Eiffel landmark reference for efficient distance checks
    let farmerNPC = null; // Farmer NPC near windmill
    let runStartGold = 0;  // Track gold at start of run for end-of-run calculation
    let lastCleanupTime = 0; // Track last memory cleanup time
    let miniBossesSpawned = new Set(); // Track which mini-boss levels have been spawned
    const FLYING_BOSS_SPAWN_KEY = 'flyingBoss15'; // Unique key for the level-15 flying boss spawn
    // Landmark positions and detection radii for quest11_findAllLandmarks
    const LANDMARK_CONFIGS = {
      stonehenge:  { x: 100, z:  80, radius: 20, key: 'stonehenge',  label: 'Stonehenge'  },
      pyramid:     { x:  50, z: -50, radius: 20, key: 'pyramid',     label: 'Pyramid'     },
      montana:     { x:   0, z:-200, radius: 25, key: 'montana',     label: 'Montana'     },
      teslaTower:  { x: -80, z: -80, radius: 25, key: 'teslaTower',  label: 'Tesla Tower' }
    };
    
    // Countdown system (PR #70-71)
    let countdownActive = false;
    let countdownStep = 0;
    let countdownTimer = 0;
    // countdownMessages defined in world.js → window.GameWorld (aliased at top)

    // Phase 5: Companion System Data
    // COMPANIONS defined in world.js → window.GameWorld (aliased at top)
    
    let activeCompanion = null; // Will hold the active Companion instance

    // Game Settings
    const gameSettings = {
      autoAim: false, // Auto-aim off by default, upgradeable via attributes
      controlType: 'touch', // 'touch', 'keyboard', 'gamepad'
      soundEnabled: true,
      musicEnabled: true,
      graphicsQuality: 'medium', // 'low', 'medium', 'high'
      isPortrait: null,
      inputListenersRegistered: false
    };
    window.gameSettings = gameSettings; // Expose for audio.js (global script scope)

    // Input - Twin-Stick Controls
    const joystickLeft = { x: 0, y: 0, active: false, id: null, originX: 0, originY: 0 }; // Movement
    const joystickRight = { x: 0, y: 0, active: false, id: null, originX: 0, originY: 0 }; // Aiming
    // Expose joystickLeft to camp-world.js for player movement in the 3D camp hub
    window._campJoystick = joystickLeft;
    
    // Throttle joystick DOM updates for performance (60fps = ~16ms)
    let lastJoystickLeftUpdate = 0;
    let lastJoystickRightUpdate = 0;
    const JOYSTICK_UPDATE_INTERVAL = 16; // milliseconds
    
    // Swipe detection for dash
    let swipeStart = null;
    
    // Stats
    const playerStats = getDefaultPlayerStats(GAME_CONFIG.baseExpReq);

    // Weapons State — initialised from GameWeapons definitions
    const weapons = getDefaultWeapons();

    // Magnet range for XP collection
    let magnetRange = 2; // Base range for XP magnet
    
    // Dash mechanics — starts sluggish; movement upgrades improve it
    let dashCooldown = 1500; // Base cooldown in ms (1.5s at start — upgrades reduce)
    let dashDistance = 1.8; // Base dash distance (short at start — upgrades increase)

    // New dash state variables (Feature 1)
    let isDashing = false;
    let dashCooldownRemaining = 0;
    let dashTimer = 0;
    let dashDirection = { x: 0, z: 0 };
    let dashInvulnerable = false;

    // Track the current camera shake RAF to cancel on new hit (prevent stacking shakes)
    let _cameraShakeRAF = null;

    // Upgrade Config — alias from GameWeapons
    const UPGRADES = WEAPON_UPGRADES;

    // --- CLASSES ---
