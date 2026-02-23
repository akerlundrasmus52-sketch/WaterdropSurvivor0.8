    import * as THREE from 'three';

    // --- MODULE ALIASES FOR EXTRACTED GLOBALS ---
    // audio.js, utils.js, state.js, weapons.js, enemies.js, combat.js, player.js,
    // world.js, ui.js, renderer.js are all loaded as regular scripts before this module
    const { playSound, initMusic, updateBackgroundMusic, startDroneHum, stopDroneHum } = window.GameAudio;
    const audioCtx = window.GameAudio.audioCtx;
    const { getRarityColor, getChestTierForCombo, getAccountLevelXPRequired, KILL_CAM_CONSTANTS, getRandomKillMessage } = window.GameUtils;
    const { getDefaultWeapons, WEAPON_UPGRADES } = window.GameWeapons;
    const { ENEMY_TYPES, getEnemyBaseStats } = window.GameEnemies;
    const { calculateArmorReduction, calculateEnemyArmorReduction } = window.GameCombat;
    const { getDefaultPlayerStats } = window.GamePlayer;
    const { COLORS, GAME_CONFIG, countdownMessages, COMPANIONS, getInitialDayNightCycle } = window.GameWorld;
    const { showStatChange, showStatusMessage } = window.GameUI;
    const { RENDERER_CONFIG } = window.GameRenderer;

    // --- CONSTANTS & CONFIG ---
    // COLORS and GAME_CONFIG are defined in world.js → window.GameWorld
    // and aliased at the top of this file.

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
    const MAX_MANAGED_ANIMATIONS = 100; // Frame budget cap

    // Smoke particles managed array (avoids RAF accumulation over long sessions)
    let smokeParticles = [];
    const MAX_SMOKE_PARTICLES = 30; // Cap to prevent performance issues
    
    // Deferred disposal queue for Three.js memory management (PR #81)
    const disposalQueue = [];
    const MAX_DISPOSALS_PER_FRAME = 10;
    
    // Ground blood decals array (cleaned up on reset)
    let bloodDecals = [];
    const MAX_BLOOD_DECALS = 30; // Cap for performance
    
    // Blood drips array - updated in main game loop to avoid many individual RAF loops
    let bloodDrips = [];
    const MAX_BLOOD_DRIPS = 20;
    
    // Shared geometry for enemy bullet-hole decals (reused across all enemies for performance)
    const bulletHoleGeo = new THREE.CircleGeometry(0.08, 6);
    const bulletHoleMat = new THREE.MeshBasicMaterial({ color: 0x3A0000, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    
    let frameCount = 0;
    let isPaused = false;
    let pauseOverlayCount = 0;
    let isGameOver = false;
    let levelUpPending = false;
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
      
      if (progress >= 1) {
        // End cinematic - restore camera
        camera.position.copy(cinematicData.originalCameraPos);
        camera.lookAt(cinematicData.originalCameraTarget);
        cinematicActive = false;
        cinematicData = null;
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
    
    // Dash mechanics
    let dashCooldown = 1000; // Base cooldown in ms (1 second)
    let dashDistance = 2.5; // Base dash distance multiplier

    // New dash state variables (Feature 1)
    let isDashing = false;
    let dashCooldownRemaining = 0;
    let dashTimer = 0;
    let dashDirection = { x: 0, z: 0 };
    let dashInvulnerable = false;

    // Upgrade Config — alias from GameWeapons
    const UPGRADES = WEAPON_UPGRADES;

    // --- CLASSES ---

    class Player {
      constructor() {
        // Create water droplet shape (teardrop)
        const geometry = new THREE.SphereGeometry(0.5, 16, 16); // Reduced segments for performance
        
        // Modify geometry to make it more teardrop-shaped
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const y = positions.getY(i);
          const x = positions.getX(i);
          const z = positions.getZ(i);
          
          // Stretch top to make teardrop
          if (y > 0) {
            positions.setY(i, y * 1.2);
            const squeeze = 1 - (y / 0.5) * 0.3;
            positions.setX(i, x * squeeze);
            positions.setZ(i, z * squeeze);
          }
        }
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshPhysicalMaterial({ 
          color: COLORS.player,
          transparent: true,
          opacity: 0.75,
          metalness: 0.1,
          roughness: 0.2,
          transmission: 0.3,
          thickness: 0.5,
          envMapIntensity: 1,
          clearcoat: 1,
          clearcoatRoughness: 0.1
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.y = 0.5;
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);
        
        // Add water shine effect (multiple layers)
        const shineGeo = new THREE.SphereGeometry(0.52, 16, 16);
        const shineMat = new THREE.MeshBasicMaterial({ 
          color: 0xFFFFFF, 
          transparent: true, 
          opacity: 0.25,
          side: THREE.BackSide
        });
        this.shine = new THREE.Mesh(shineGeo, shineMat);
        this.mesh.add(this.shine);
        
        // Add reflection highlight
        const highlightGeo = new THREE.SphereGeometry(0.15, 16, 16);
        const highlightMat = new THREE.MeshBasicMaterial({ 
          color: 0xFFFFFF, 
          transparent: true, 
          opacity: 0.8
        });
        this.highlight = new THREE.Mesh(highlightGeo, highlightMat);
        this.highlight.position.set(-0.2, 0.3, 0.2);
        this.mesh.add(this.highlight);
        
        // Add player face: eyes with friendly appearance (matching main menu art style)
        // REMOVED RED EYES - using blue/cyan to match waterdrop theme
        const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x5DADE2 }); // Cyan/blue eyes to match waterdrop
        
        this.leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        this.leftEye.position.set(-0.12, 0.1, 0.4);
        this.mesh.add(this.leftEye);
        
        this.rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        this.rightEye.position.set(0.12, 0.1, 0.4);
        this.mesh.add(this.rightEye);
        
        // Pupils (darker blue for depth - matches waterdrop theme)
        const pupilGeo = new THREE.SphereGeometry(0.04, 8, 8);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x2874A6 }); // Dark blue to match waterdrop
        
        this.leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
        this.leftPupil.position.set(-0.12, 0.1, 0.45);
        this.mesh.add(this.leftPupil);
        
        this.rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
        this.rightPupil.position.set(0.12, 0.1, 0.45);
        this.mesh.add(this.rightPupil);
        
        // Smile (curved shape using torus segment)
        const smileGeo = new THREE.TorusGeometry(0.15, 0.02, 8, 16, Math.PI);
        const smileMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.smile = new THREE.Mesh(smileGeo, smileMat);
        this.smile.position.set(0, -0.05, 0.4);
        this.smile.rotation.x = Math.PI / 2;
        this.smile.rotation.z = Math.PI;
        this.mesh.add(this.smile);
        
        // Cigar accessory with glowing tip
        const cigarGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.25, 8);
        const cigarMat = new THREE.MeshToonMaterial({ color: 0x8B4513 }); // Brown
        this.cigar = new THREE.Mesh(cigarGeo, cigarMat);
        this.cigar.position.set(0.2, -0.1, 0.35);
        this.cigar.rotation.z = -Math.PI / 6; // Angled
        this.mesh.add(this.cigar);
        
        // Glowing cigar tip
        const tipGeo = new THREE.SphereGeometry(0.03, 8, 8);
        const tipMat = new THREE.MeshBasicMaterial({ 
          color: 0xFF4500, // Orange-red
          transparent: true,
          opacity: 1
        });
        this.cigarTip = new THREE.Mesh(tipGeo, tipMat);
        this.cigarTip.position.set(0.28, -0.05, 0.35);
        this.mesh.add(this.cigarTip);
        
        // Bandage accessory (white cross-shaped bandage on head)
        const bandageGeo = new THREE.BoxGeometry(0.3, 0.05, 0.05);
        const bandageMat = new THREE.MeshToonMaterial({ color: 0xFFFFFF }); // White
        this.bandage = new THREE.Mesh(bandageGeo, bandageMat);
        this.bandage.position.set(0, 0.35, 0);
        this.mesh.add(this.bandage);
        
        // Vertical bandage piece
        const bandageVertGeo = new THREE.BoxGeometry(0.05, 0.3, 0.05);
        this.bandageVert = new THREE.Mesh(bandageVertGeo, bandageMat);
        this.bandageVert.position.set(0, 0.35, 0);
        this.mesh.add(this.bandageVert);
        
        // Eye blink animation timer
        this.blinkTimer = 0;
        this.blinkDuration = 0.1; // 100ms blink
        this.nextBlinkTime = 2 + Math.random() * 3; // Random 2-5 seconds
        this.isBlinking = false;
        
        // Arms (simple cylinders attached to body)
        const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8);
        const limbMaterial = new THREE.MeshToonMaterial({ color: COLORS.player, opacity: 0.85, transparent: true });
        
        // Left arm
        this.leftArm = new THREE.Mesh(armGeo, limbMaterial);
        this.leftArm.position.set(-0.35, 0, 0);
        this.leftArm.rotation.z = Math.PI / 6; // Angled outward
        this.mesh.add(this.leftArm);
        
        // Right arm (holding gun)
        this.rightArm = new THREE.Mesh(armGeo, limbMaterial);
        this.rightArm.position.set(0.35, 0, 0);
        this.rightArm.rotation.z = -Math.PI / 6; // Angled outward
        this.mesh.add(this.rightArm);
        
        // Gun visual (held by right arm) - enhanced for better visibility
        const gunBodyGeo = new THREE.BoxGeometry(0.12, 0.16, 0.35); // Larger gun body
        const gunMat = new THREE.MeshToonMaterial({ color: 0x333333 }); // Slightly lighter dark gray
        this.gunBody = new THREE.Mesh(gunBodyGeo, gunMat);
        this.gunBody.position.set(0.42, -0.05, 0.35);
        this.mesh.add(this.gunBody);
        
        // Gun barrel - longer and thicker
        const barrelGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.3, 8);
        const barrelMat = new THREE.MeshToonMaterial({ color: 0x1a1a1a }); // Black barrel
        this.gunBarrel = new THREE.Mesh(barrelGeo, barrelMat);
        this.gunBarrel.rotation.x = Math.PI / 2;
        this.gunBarrel.position.set(0.42, -0.05, 0.56);
        this.mesh.add(this.gunBarrel);
        
        // Gun scope / sight for visibility
        const sightGeo = new THREE.BoxGeometry(0.04, 0.05, 0.06);
        const sightMat = new THREE.MeshToonMaterial({ color: 0x666666 });
        this.gunSight = new THREE.Mesh(sightGeo, sightMat);
        this.gunSight.position.set(0.42, 0.04, 0.35);
        this.mesh.add(this.gunSight);
        
        // Gun handle
        const handleGeo = new THREE.BoxGeometry(0.07, 0.18, 0.10);
        const handleMat = new THREE.MeshToonMaterial({ color: 0x8B4513 }); // Brown handle
        this.gunHandle = new THREE.Mesh(handleGeo, handleMat);
        this.gunHandle.position.set(0.42, -0.22, 0.25);
        this.gunHandle.rotation.z = -Math.PI / 6;
        this.mesh.add(this.gunHandle);
        
        // Legs (simple cylinders below body)
        const legGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.4, 8);
        
        // Left leg
        this.leftLeg = new THREE.Mesh(legGeo, limbMaterial);
        this.leftLeg.position.set(-0.15, -0.45, 0);
        this.mesh.add(this.leftLeg);
        
        // Right leg
        this.rightLeg = new THREE.Mesh(legGeo, limbMaterial);
        this.rightLeg.position.set(0.15, -0.45, 0);
        this.mesh.add(this.rightLeg);
        
        // Smoke particles timer
        this.smokeTimer = 0;
        
        // Breathing animation states (breath-in with cigar glow, breath-out with smoke)
        this.breathTimer = 0;
        this.breathCycle = 4.0; // 4 seconds per breath cycle
        this.isBreathingIn = false;
        
        // Pulsing glow
        const glowGeo = new THREE.SphereGeometry(0.55, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({ 
          color: 0x4FC3F7, 
          transparent: true, 
          opacity: 0.2,
          side: THREE.BackSide
        });
        this.glow = new THREE.Mesh(glowGeo, glowMat);
        this.mesh.add(this.glow);
        
        // Aura Circle (visible when aura weapon is active)
        const auraGeo = new THREE.RingGeometry(2.5, 3, 16); // Reduced segments for performance
        const auraMat = new THREE.MeshBasicMaterial({ 
          color: 0x5DADE2, 
          transparent: true, 
          opacity: 0.3,
          side: THREE.DoubleSide
        });
        this.auraCircle = new THREE.Mesh(auraGeo, auraMat);
        this.auraCircle.rotation.x = -Math.PI / 2; // Lay flat on ground
        this.auraCircle.position.y = 0.1;
        this.auraCircle.visible = false;
        this.currentAuraRange = 3; // Initial geometry scale matches default aura range * 2
        scene.add(this.auraCircle);
        
        // Fire Ring Orbs (visible when fireRing weapon is active)
        this.fireRingOrbs = [];
        this.fireRingAngle = 0;
        
        // Physics/Visuals
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.targetScale = new THREE.Vector3(1, 1, 1);
        this.trailTimer = 0;
        this.wobblePhase = 0;
        // Spring-damper for waterdrop deformation
        this.scaleYVel = 0;       // spring velocity for Y scale
        this.scaleXZVel = 0;      // spring velocity for XZ scale
        this.currentScaleY = 1.0;
        this.currentScaleXZ = 1.0;
        this.wobbleIntensity = 0; // spikes on direction change / dash
        this.prevVelDir = new THREE.Vector3(); // previous velocity direction for direction-change detection
        this.postDashSquish = 0;  // timer for post-dash bounce
        
        // Phase 5: Low health water bleed timer
        this.waterBleedTimer = 0;
        
        // Dash
        this.isDashing = false;
        this.dashTime = 0;
        this.dashDuration = 0.2;
        this.dashVec = new THREE.Vector3();
        
        // Invulnerability frames to prevent instant death
        this.invulnerable = false;
        this.invulnerabilityTime = 0;
        this.invulnerabilityDuration = 0.5; // 500ms of invulnerability after taking damage
        
        // X eyes effect when hit
        this.xEyesActive = false;
        this.xEyes = [];
        
        // Store base scale for breathing animation efficiency
        this.baseScale = 1.0;
      }

      update(dt) {
        // Update invulnerability timer
        const INVULNERABILITY_FLASH_FREQUENCY = 20; // Flash 20 times per second during invulnerability
        if (this.invulnerable) {
          this.invulnerabilityTime += dt;
          if (this.invulnerabilityTime >= this.invulnerabilityDuration) {
            this.invulnerable = false;
            this.invulnerabilityTime = 0;
          }
          // Flash effect during invulnerability
          if (Math.floor(this.invulnerabilityTime * INVULNERABILITY_FLASH_FREQUENCY) % 2 === 0) {
            this.mesh.material.opacity = 0.5;
          } else {
            this.mesh.material.opacity = 0.75;
          }
        } else {
          this.mesh.material.opacity = 0.75; // Normal opacity
        }
        
        // Phase 5: Water bleed effect when health < 30%
        const healthPercent = playerStats.hp / playerStats.maxHp;
        if (healthPercent < 0.3) {
          this.waterBleedTimer += dt;
          if (this.waterBleedTimer > 0.08) { // Fast drip
            this.waterBleedTimer = 0;
            spawnWaterDroplet(this.mesh.position);
            // Add blue water particles trailing behind
            if (Math.random() < 0.5) {
              spawnParticles(this.mesh.position, COLORS.player, 1);
            }
          }
        }
        
        // Dash Logic
        if (this.isDashing) {
          this.dashTime -= dt;
          const t = 1 - (this.dashTime / this.dashDuration);
          // Dash distance uses the upgradeable dashDistance variable
          const dashSpeed = (dashDistance / this.dashDuration); // units per second
          const speed = Math.sin(t * Math.PI) * dashSpeed; // Slow-Fast-Slow curve
          this.mesh.position.x += this.dashVec.x * speed * dt;
          this.mesh.position.z += this.dashVec.z * speed * dt;
          
          // Enhanced splash effect trail during dash - MORE PARTICLES
          if (Math.random() < 0.7) { // Increased from 0.5
            spawnParticles(this.mesh.position, COLORS.player, 3); // Increased from 2
            spawnWaterDroplet(this.mesh.position);
            // Add white sparkle particles during dash
            if (Math.random() < 0.4) {
              spawnParticles(this.mesh.position, 0xFFFFFF, 2);
            }
          }
          
          // DASH DESTRUCTION: Destroy any destructible prop dashed into
          if (window.destructibleProps) {
            for (let prop of window.destructibleProps) {
              if (prop.destroyed) continue;
              const ddx = this.mesh.position.x - prop.mesh.position.x;
              const ddz = this.mesh.position.z - prop.mesh.position.z;
              const ddist2 = ddx * ddx + ddz * ddz;
              if (ddist2 < 4) { // Within 2 units - destroy on dash
                prop.destroyed = true;
                // Big destruction effect
                const pPos = prop.mesh.position;
                if (prop.type === 'tree') {
                  spawnParticles(pPos, 0x8B4513, 25);
                  spawnParticles(pPos, 0x228B22, 20);
                } else if (prop.type === 'barrel') {
                  spawnParticles(pPos, 0xFF4500, 30);
                  spawnParticles(pPos, 0xFFFF00, 15);
                } else {
                  spawnParticles(pPos, 0xD2691E, 20);
                }
                // Screen shake on big destruction
                if (window.triggerScreenShake) window.triggerScreenShake(0.3);
                scene.remove(prop.mesh);
                if (prop.mesh.userData.trunk) {
                  prop.mesh.userData.trunk.geometry.dispose();
                  prop.mesh.userData.trunk.material.dispose();
                  prop.mesh.userData.leaves.geometry.dispose();
                  prop.mesh.userData.leaves.material.dispose();
                } else if (prop.mesh.geometry) {
                  prop.mesh.geometry.dispose();
                  prop.mesh.material.dispose();
                }
              }
            }
          }
          
          // DASH DESTRUCTION: Destroy fences dashed into
          if (window.breakableFences) {
            for (let fence of window.breakableFences) {
              if (!fence.userData.isFence || fence.userData.hp <= 0) continue;
              const fdx = this.mesh.position.x - fence.position.x;
              const fdz = this.mesh.position.z - fence.position.z;
              if (fdx * fdx + fdz * fdz < 4) {
                fence.userData.hp = 0;
                spawnParticles(fence.position, 0x8B4513, 15);
                scene.remove(fence);
                if (fence.geometry) fence.geometry.dispose();
                if (fence.material) fence.material.dispose();
              }
            }
          }
          
          if (this.dashTime <= 0) {
            this.isDashing = false;
          }
        }
        // Movement
        else {
          const targetVel = new THREE.Vector3(0, 0, 0);
        
          // Movement with LEFT stick
          if (joystickLeft.active) {
            const speed = GAME_CONFIG.playerSpeedBase * (playerStats.walkSpeed / 25) * 60; // Base speed for 60fps
            targetVel.x = joystickLeft.x * speed * dt; // Frame-rate independent
            targetVel.z = joystickLeft.y * speed * dt;
          }
          
          // Enhanced inertia: Smooth acceleration and deceleration with glide
          const lerpFactor = joystickLeft.active ? GAME_CONFIG.accelLerpFactor : GAME_CONFIG.decelLerpFactor;
          this.velocity.lerp(targetVel, lerpFactor);
          
          // Apply velocity with inertia
          this.mesh.position.x += this.velocity.x;
          this.mesh.position.z += this.velocity.z;

          // Enhanced water droplet trail when moving - MORE PARTICLES
          if (this.velocity.length() > 0.01) {
            this.trailTimer += dt;
            if (this.trailTimer > 0.12) { // Faster trail (was 0.15)
              this.trailTimer = 0;
              spawnWaterDroplet(this.mesh.position);
              // Add extra splash particles during movement
              if (Math.random() < 0.3) {
                spawnParticles(this.mesh.position, COLORS.player, 1);
              }
            }
          } else {
            // Idle
            this.trailTimer = 0;
          }
          
          // Add lean/tilt in direction of movement
          if (this.velocity.length() > 0.05) {
            const leanFactor = GAME_CONFIG.movementLeanFactor * (2.5 + this.wobbleIntensity * 1.5);
            const leanAngleX = -this.velocity.z * leanFactor;
            const leanAngleZ = this.velocity.x * leanFactor;
            const leanDt = Math.min(dt * 15, 0.75);
            this.mesh.rotation.x += (leanAngleX - this.mesh.rotation.x) * leanDt;
            this.mesh.rotation.z += (leanAngleZ - this.mesh.rotation.z) * leanDt;
          } else {
            // Return to upright when idle
            this.mesh.rotation.x *= 0.88;
            this.mesh.rotation.z *= 0.88;
          }
          
          // Rotation/Aiming with RIGHT stick (independent of movement)
          if (joystickRight.active) {
            // Manual aim: Turn to face the direction of right stick
            let angle = Math.atan2(joystickRight.x, joystickRight.y);
            
            // FRESH: Precision aiming - 15% nudge toward nearest enemy when right joystick active
            if (enemies && enemies.length > 0) {
              let nearestEnemy = null;
              let minDist = Infinity;
              enemies.forEach(e => {
                if (e && !e.isDead) {
                  const dist = this.mesh.position.distanceTo(e.mesh.position);
                  if (dist < minDist && dist < 15) { // Only nudge if enemy within reasonable range
                    minDist = dist;
                    nearestEnemy = e;
                  }
                }
              });
              
              if (nearestEnemy) {
                const dx = nearestEnemy.mesh.position.x - this.mesh.position.x;
                const dz = nearestEnemy.mesh.position.z - this.mesh.position.z;
                const enemyAngle = Math.atan2(dx, dz);
                
                // Blend 85% player input + 15% toward enemy (subtle magnetism)
                let angleDiff = enemyAngle - angle;
                // Normalize angle difference to -PI to PI
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                
                angle = angle + angleDiff * 0.15; // 15% nudge
              }
            }
            
            this.mesh.rotation.y = angle;
          } else if (gameSettings.autoAim && enemies && enemies.length > 0) {
            // Auto-aim when enabled (works in any orientation)
            let nearestEnemy = null;
            let minDist = Infinity;
            enemies.forEach(e => {
              if (e && !e.isDead) {
                const dist = this.mesh.position.distanceTo(e.mesh.position);
                if (dist < minDist) {
                  minDist = dist;
                  nearestEnemy = e;
                }
              }
            });
            if (nearestEnemy) {
              const dx = nearestEnemy.mesh.position.x - this.mesh.position.x;
              const dz = nearestEnemy.mesh.position.z - this.mesh.position.z;
              const angle = Math.atan2(dx, dz);
              this.mesh.rotation.y = angle;
            }
          } else if (joystickLeft.active) {
            // If no right stick input and no auto-aim, rotate to face movement direction
            const angle = Math.atan2(targetVel.x, targetVel.z);
            this.mesh.rotation.y = angle;
          }
        }
        
        const speedMag = this.velocity.length();
        
        // Waterdrop physics: spring-damper squish/bounce/wobble
        const dt2 = Math.min(dt, 0.05);
        
        // Detect direction changes to spike wobble intensity
        if (speedMag > 0.05) {
          const velDir = this.velocity.clone().normalize();
          const dirChange = 1 - velDir.dot(this.prevVelDir);
          if (dirChange > 0.3) {
            this.wobbleIntensity = Math.min(1, this.wobbleIntensity + dirChange * 1.5);
          }
          this.prevVelDir.copy(velDir);
        }
        // Decay wobble intensity
        this.wobbleIntensity = Math.max(0, this.wobbleIntensity - dt2 * 3);
        
        // Post-dash squish bounce timer
        if (!this.isDashing && this.postDashSquish > 0) {
          this.postDashSquish = Math.max(0, this.postDashSquish - dt2 * 4);
        }
        if (this.isDashing) {
          this.postDashSquish = 1.0;
          this.wobbleIntensity = Math.min(1, this.wobbleIntensity + 0.8);
        }
        
        // Compute target scales
        let targetScaleY, targetScaleXZ;
        if (this.isDashing) {
          // Dramatic squish during dash
          targetScaleY = 0.5;
          targetScaleXZ = 1.5;
        } else if (this.postDashSquish > 0.01) {
          // Post-dash oscillating bounce
          const bounce = Math.sin(this.postDashSquish * Math.PI * 3) * 0.25 * this.postDashSquish;
          targetScaleY = 1.0 + bounce;
          targetScaleXZ = 1.0 - bounce * 0.5;
        } else if (speedMag > 0.05) {
          // Moving: elongate in direction of travel
          const squishAmt = Math.min(speedMag * 0.055, 0.28);
          targetScaleY = 1.0 - squishAmt;
          targetScaleXZ = 1.0 + squishAmt * 0.8;
          this.wobblePhase += dt2 * speedMag * 9;
          targetScaleY += Math.sin(this.wobblePhase) * (0.04 + this.wobbleIntensity * 0.08);
          targetScaleXZ += Math.cos(this.wobblePhase) * (0.02 + this.wobbleIntensity * 0.04);
        } else {
          // Idle breathing
          this.wobblePhase += dt2 * 2.5;
          targetScaleY = 1.0 + Math.sin(this.wobblePhase) * 0.03;
          targetScaleXZ = 1.0 - Math.sin(this.wobblePhase) * 0.015;
        }
        
        // Spring-damper integration (k=200 stiffness, c=18 damping)
        const springK = 200, springC = 18;
        const forceY = springK * (targetScaleY - this.currentScaleY) - springC * this.scaleYVel;
        const forceXZ = springK * (targetScaleXZ - this.currentScaleXZ) - springC * this.scaleXZVel;
        this.scaleYVel += forceY * dt2;
        this.scaleXZVel += forceXZ * dt2;
        this.currentScaleY += this.scaleYVel * dt2;
        this.currentScaleXZ += this.scaleXZVel * dt2;
        // Clamp to sane range
        this.currentScaleY = Math.max(0.3, Math.min(2.0, this.currentScaleY));
        this.currentScaleXZ = Math.max(0.5, Math.min(2.0, this.currentScaleXZ));
        
        this.mesh.scale.y = this.currentScaleY;
        this.mesh.scale.x = this.currentScaleXZ;
        this.mesh.scale.z = this.currentScaleXZ;
        // Shed water particles when moving fast
        if (speedMag > 0.4 && Math.random() < dt2 * speedMag * 3 && !this.isDashing) {
          const n = Math.floor(Math.random() * 2) + 1;
          for (let i = 0; i < n; i++) spawnWaterParticle(this.mesh.position);
        }
        
        // Animate water shine
        this.shine.rotation.y += 0.05;
        this.shine.rotation.x += 0.03;
        
        // Pulse highlight
        this.highlight.material.opacity = 0.6 + Math.sin(gameTime * 3) * 0.2;
        
        // Pulse glow effect
        this.glow.material.opacity = 0.15 + Math.sin(gameTime * 2) * 0.1;
        this.glow.scale.set(
          1 + Math.sin(gameTime * 2) * 0.05,
          1 + Math.sin(gameTime * 2) * 0.05,
          1 + Math.sin(gameTime * 2) * 0.05
        );
        
        // Animate arms and legs (walking animation when moving)
        if (speedMag > 0.1) {
          // Walking animation - swing arms and legs
          const walkPhase = gameTime * 8; // Walking speed
          this.leftArm.rotation.x = Math.sin(walkPhase) * 0.3;
          this.rightArm.rotation.x = -Math.sin(walkPhase) * 0.3;
          this.leftLeg.rotation.x = -Math.sin(walkPhase) * 0.4;
          this.rightLeg.rotation.x = Math.sin(walkPhase) * 0.4;
        } else {
          // Idle - gentle sway
          const idlePhase = gameTime * 2;
          this.leftArm.rotation.x = Math.sin(idlePhase) * 0.1;
          this.rightArm.rotation.x = Math.sin(idlePhase + Math.PI) * 0.1;
          this.leftLeg.rotation.x = 0;
          this.rightLeg.rotation.x = 0;
        }
        
        // Animate cigar tip with breathing animation (breath-in/breath-out cycle)
        if (this.cigarTip) {
          // Breathing animation cycle
          this.breathTimer += dt;
          const breathPhase = (this.breathTimer % this.breathCycle) / this.breathCycle; // 0 to 1
          
          // Breath-in: 0 to 0.4 (1.6s), Hold: 0.4 to 0.5 (0.4s), Breath-out: 0.5 to 1.0 (2s)
          if (breathPhase < 0.4) {
            // Breathing in - cigar tip glows brighter
            this.isBreathingIn = true;
            const inhaleProgress = breathPhase / 0.4;
            const tipBrightness = 0.7 + inhaleProgress * 0.3 + Math.sin(gameTime * 8) * 0.1;
            this.cigarTip.material.opacity = tipBrightness;
            this.cigarTip.scale.set(1 + inhaleProgress * 0.3, 1 + inhaleProgress * 0.3, 1 + inhaleProgress * 0.3);
            
            // Subtle body scaling during inhale - efficient approach
            const targetScale = this.baseScale * (1 + inhaleProgress * 0.05);
            this.mesh.scale.set(targetScale, targetScale, targetScale);
          } else if (breathPhase < 0.5) {
            // Holding breath
            this.isBreathingIn = false;
            this.cigarTip.material.opacity = 1.0;
            this.cigarTip.scale.set(1.3, 1.3, 1.3);
            this.mesh.scale.set(this.baseScale * 1.05, this.baseScale * 1.05, this.baseScale * 1.05);
          } else {
            // Breathing out - emit smoke from mouth
            this.isBreathingIn = false;
            const exhaleProgress = (breathPhase - 0.5) / 0.5;
            const tipBrightness = 1.0 - exhaleProgress * 0.3 + Math.sin(gameTime * 8) * 0.1;
            const targetScale = this.baseScale * (1.05 - exhaleProgress * 0.05);
            this.mesh.scale.set(targetScale, targetScale, targetScale);
            this.cigarTip.material.opacity = tipBrightness;
            this.cigarTip.scale.set(1.3 - exhaleProgress * 0.3, 1.3 - exhaleProgress * 0.3, 1.3 - exhaleProgress * 0.3);
            
            // Emit smoke from mouth during exhale
            this.smokeTimer += dt;
            if (this.smokeTimer > 0.15) { // Faster smoke during exhale
              this.smokeTimer = 0;
              
              // Get current lighting intensity for smoke color
              const lightIntensity = window.dirLight ? window.dirLight.intensity : 0.8;
              const smokeColor = new THREE.Color().lerpColors(
                new THREE.Color(0x555555), // Dark gray in night
                new THREE.Color(0xCCCCCC), // Light gray in day
                lightIntensity
              );
              
              // Create smoke particle from mouth
              const smokeGeo = new THREE.SphereGeometry(0.08, 6, 6);
              const smokeMat = new THREE.MeshBasicMaterial({ 
                color: smokeColor,
                transparent: true,
                opacity: 0.6
              });
              const smoke = new THREE.Mesh(smokeGeo, smokeMat);
              
              // Position at mouth (slightly in front of face)
              smoke.position.set(
                this.mesh.position.x,
                this.mesh.position.y - 0.05,
                this.mesh.position.z + 0.45
              );
              scene.add(smoke);
              
              // Use managed smokeParticles instead of individual RAF loop
              if (smokeParticles.length < MAX_SMOKE_PARTICLES) {
                smokeParticles.push({
                  mesh: smoke,
                  material: smokeMat,
                  geometry: smokeGeo,
                  velocity: {
                    x: (Math.random() - 0.5) * 0.02,
                    y: 0.02,
                    z: 0.03
                  },
                  life: 100,
                  maxLife: 100
                });
              } else {
                scene.remove(smoke);
                smokeGeo.dispose();
                smokeMat.dispose();
              }
            }
          }
        }
        
        // Blinking eyes animation
        this.blinkTimer += dt;
        if (this.blinkTimer >= this.nextBlinkTime) {
          this.isBlinking = true;
          this.blinkTimer = 0;
          this.nextBlinkTime = 2 + Math.random() * 3; // Next blink in 2-5 seconds
        }
        
        if (this.isBlinking) {
          // Scale eyes down vertically for blink effect
          const blinkProgress = Math.min(1, this.blinkTimer / this.blinkDuration);
          if (blinkProgress < 0.5) {
            // Closing
            const scale = 1 - (blinkProgress * 2);
            this.leftEye.scale.y = scale;
            this.rightEye.scale.y = scale;
            this.leftPupil.scale.y = scale;
            this.rightPupil.scale.y = scale;
          } else {
            // Opening
            const scale = (blinkProgress - 0.5) * 2;
            this.leftEye.scale.y = scale;
            this.rightEye.scale.y = scale;
            this.leftPupil.scale.y = scale;
            this.rightPupil.scale.y = scale;
          }
          
          if (blinkProgress >= 1) {
            this.isBlinking = false;
            this.blinkTimer = 0;
            // Reset scale
            this.leftEye.scale.y = 1;
            this.rightEye.scale.y = 1;
            this.leftPupil.scale.y = 1;
            this.rightPupil.scale.y = 1;
          }
        }
        
        // Update aura circle
        if (weapons.aura.active) {
          this.auraCircle.visible = true;
          this.auraCircle.position.x = this.mesh.position.x;
          this.auraCircle.position.z = this.mesh.position.z;
          
          // Scale based on aura range - only recreate geometry if range changed
          const scale = weapons.aura.range * 2;
          if (this.currentAuraRange !== scale) {
            this.currentAuraRange = scale;
            this.auraCircle.geometry.dispose();
            this.auraCircle.geometry = new THREE.RingGeometry(scale - 0.5, scale, 16); // Reduced segments for performance
          }
          
          // Rotate and pulse
          this.auraCircle.rotation.z += 0.02;
          this.auraCircle.material.opacity = 0.25 + Math.sin(gameTime * 4) * 0.15;
        } else {
          this.auraCircle.visible = false;
        }
        
        // Update fire ring orbs
        if (weapons.fireRing.active) {
          const currentOrbCount = weapons.fireRing.orbs;
          
          // Add orbs if needed
          while (this.fireRingOrbs.length < currentOrbCount) {
            const geo = new THREE.SphereGeometry(0.3, 8, 8);
            const mat = new THREE.MeshBasicMaterial({ 
              color: 0xFF4500, 
              transparent: true, 
              opacity: 0.8 
            });
            const orb = new THREE.Mesh(geo, mat);
            scene.add(orb);
            this.fireRingOrbs.push(orb);
          }
          
          // Remove extra orbs if downgraded (shouldn't happen but safety)
          while (this.fireRingOrbs.length > currentOrbCount) {
            const orb = this.fireRingOrbs.pop();
            scene.remove(orb);
            orb.geometry.dispose();
            orb.material.dispose();
          }
          
          // Update orb positions (orbit around player)
          this.fireRingAngle += weapons.fireRing.rotationSpeed * dt;
          const radius = weapons.fireRing.range;
          
          for (let i = 0; i < this.fireRingOrbs.length; i++) {
            const angle = this.fireRingAngle + (i * Math.PI * 2 / currentOrbCount);
            const orb = this.fireRingOrbs[i];
            orb.position.x = this.mesh.position.x + Math.cos(angle) * radius;
            orb.position.z = this.mesh.position.z + Math.sin(angle) * radius;
            orb.position.y = this.mesh.position.y + Math.sin(gameTime * 5 + i) * 0.3; // Bob up and down
            
            // Glow effect
            orb.material.opacity = 0.7 + Math.sin(gameTime * 8 + i) * 0.2;
          }
        } else {
          // Hide orbs when weapon not active
          for (let orb of this.fireRingOrbs) {
            orb.visible = false;
          }
        }

        // Camera Follow
        camera.position.x = this.mesh.position.x;
        camera.position.z = this.mesh.position.z + 20; // Isometric offset
        camera.lookAt(this.mesh.position);

        // Bounds (Map is 400x400, from -200 to 200)
        this.mesh.position.x = Math.max(-195, Math.min(195, this.mesh.position.x));
        this.mesh.position.z = Math.max(-195, Math.min(195, this.mesh.position.z));
      }

      dash(dx, dz) {
        if (this.isDashing) return;
        this.isDashing = true;
        this.dashTime = this.dashDuration;
        
        // Splash effect on dash start - more dramatic
        spawnParticles(this.mesh.position, COLORS.player, 10); // Reduced for performance
        for(let i=0; i<8; i++) {
          spawnWaterDroplet(this.mesh.position);
        }
        
        // Direct mapping: Screen coordinates to World coordinates
        // Screen X-axis maps to World X-axis
        // Screen Y-axis maps to World Z-axis
        this.dashVec.set(dx, 0, dz).normalize();
        
        // Add dramatic lean/tilt in dash direction
        const dashAngleX = -dz * GAME_CONFIG.dashLeanFactor;
        const dashAngleZ = dx * GAME_CONFIG.dashLeanFactor;
        
        // Animate tilt during dash
        const originalRotX = this.mesh.rotation.x;
        const originalRotZ = this.mesh.rotation.z;
        
        // Quick tilt into dash
        this.mesh.rotation.x = dashAngleX;
        this.mesh.rotation.z = dashAngleZ;
        
        // Return to normal after dash with smooth animation
        setTimeout(() => {
          let returnProgress = 0;
          const returnDuration = GAME_CONFIG.dashLeanReturnDuration;
          const returnAnim = () => {
            returnProgress += 16; // ~16ms per frame
            const t = Math.min(returnProgress / returnDuration, 1);
            this.mesh.rotation.x = dashAngleX * (1 - t);
            this.mesh.rotation.z = dashAngleZ * (1 - t);
            if (t < 1) {
              requestAnimationFrame(returnAnim);
            }
          };
          returnAnim();
        }, this.dashDuration * 1000);
        
        // Water splash sound
        playSound('splash');
      }

      takeDamage(amount) {
        // Check invulnerability frames
        if (this.invulnerable) return;
        
        // Armor reduction — delegated to GameCombat
        const reduced = calculateArmorReduction(amount, playerStats.armor);
        playerStats.hp -= reduced;
        updateHUD();
        playSound('hit');
        
        // Trigger waterdrop UI attack animation
        const waterdropContainer = document.getElementById('waterdrop-container');
        if (waterdropContainer) {
          waterdropContainer.classList.add('attacked');
          setTimeout(() => {
            waterdropContainer.classList.remove('attacked');
          }, 400);
        }
        
        // Show "X" eyes when hit
        if (!this.xEyesActive) {
          this.xEyesActive = true;
          // Hide normal eyes
          this.leftEye.visible = false;
          this.rightEye.visible = false;
          this.leftPupil.visible = false;
          this.rightPupil.visible = false;
          
          // Create X shapes for eyes
          const xMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
          this.xEyes = [];
          
          // Left X
          const leftX1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.01), xMaterial);
          leftX1.position.set(-0.12, 0.1, 0.4);
          leftX1.rotation.z = Math.PI / 4;
          this.mesh.add(leftX1);
          this.xEyes.push(leftX1);
          
          const leftX2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.01), xMaterial);
          leftX2.position.set(-0.12, 0.1, 0.4);
          leftX2.rotation.z = -Math.PI / 4;
          this.mesh.add(leftX2);
          this.xEyes.push(leftX2);
          
          // Right X
          const rightX1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.01), xMaterial);
          rightX1.position.set(0.12, 0.1, 0.4);
          rightX1.rotation.z = Math.PI / 4;
          this.mesh.add(rightX1);
          this.xEyes.push(rightX1);
          
          const rightX2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.01), xMaterial);
          rightX2.position.set(0.12, 0.1, 0.4);
          rightX2.rotation.z = -Math.PI / 4;
          this.mesh.add(rightX2);
          this.xEyes.push(rightX2);
          
          // Remove X eyes after 300ms and restore normal eyes
          setTimeout(() => {
            this.xEyesActive = false;
            this.xEyes.forEach(x => this.mesh.remove(x));
            this.xEyes = [];
            this.leftEye.visible = true;
            this.rightEye.visible = true;
            this.leftPupil.visible = true;
            this.rightPupil.visible = true;
          }, 300);
        }
        
        // Show damage number for player (red color)
        const div = document.createElement('div');
        div.className = 'damage-number player-damage';
        div.innerText = `-${Math.floor(reduced)}`;
        div.style.color = '#FF4444';
        div.style.fontSize = '24px';
        div.style.fontWeight = 'bold';
        div.style.textShadow = '0 0 8px rgba(255,68,68,0.8), 2px 2px 4px #000';
        
        // Project 3D pos to 2D screen
        const vec = this.mesh.position.clone();
        vec.y += 2;
        vec.project(camera);
        
        const x = (vec.x * .5 + .5) * window.innerWidth;
        const y = (-(vec.y * .5) + .5) * window.innerHeight;
        
        div.style.position = 'absolute';
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
        div.style.transform = 'translate(-50%, -50%)';
        div.style.pointerEvents = 'none';
        div.style.zIndex = '1000';
        
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 1000);
        
        // Set invulnerability
        this.invulnerable = true;
        this.invulnerabilityTime = 0;
        
        // Visual flash
        this.mesh.material.color.setHex(0xFF0000);
        setTimeout(() => {
          this.mesh.material.color.setHex(COLORS.player);
        }, 100);
        
        // Water-themed blood effects for player (blue water droplets)
        // Spawn blue water particles (player's "blood")
        spawnParticles(this.mesh.position, COLORS.player, 8); // Blue water
        spawnParticles(this.mesh.position, 0x87CEEB, 5); // Light blue splash
        spawnParticles(this.mesh.position, 0xFFFFFF, 3); // White foam
        
        // Water droplets as player blood
        for(let i=0; i<5; i++) {
          spawnWaterDroplet(this.mesh.position);
        }
        
        // More dramatic squishy deformation animation
        this.mesh.scale.set(1.4, 0.6, 1.4); // More squished
        setTimeout(() => {
          this.mesh.scale.set(0.7, 1.3, 0.7); // More stretched
          setTimeout(() => {
            this.mesh.scale.set(1, 1, 1);
          }, 50);
        }, 50);
        
        // FRESH IMPLEMENTATION: Screen shake scales with damage amount
        const originalCameraPos = { 
          x: camera.position.x, 
          y: camera.position.y, 
          z: camera.position.z 
        };
        let shakeTime = 0;
        const shakeDuration = 0.25 + (reduced / 100) * 0.15; // Duration scales with damage
        
        const shakeAnim = () => {
          shakeTime += 0.016;
          if (shakeTime < shakeDuration) {
            // Intensity scales with damage (0.5 base + up to 0.5 more based on damage)
            const baseIntensity = 0.5 + Math.min(reduced / 50, 1) * 0.5;
            const intensity = (1 - shakeTime / shakeDuration) * baseIntensity;
            camera.position.x = originalCameraPos.x + (Math.random() - 0.5) * intensity;
            camera.position.y = originalCameraPos.y + (Math.random() - 0.5) * intensity;
            camera.position.z = originalCameraPos.z + (Math.random() - 0.5) * intensity;
            requestAnimationFrame(shakeAnim);
          } else {
            camera.position.x = originalCameraPos.x;
            camera.position.y = originalCameraPos.y;
            camera.position.z = originalCameraPos.z;
          }
        };
        shakeAnim();

        if (playerStats.hp <= 0) {
          // ENHANCED Death splash: more particles + ground pool with fade
          spawnParticles(this.mesh.position, COLORS.player, 25); // Reduced for performance
          spawnParticles(this.mesh.position, 0xFFFFFF, 8); // Reduced for performance
          
          // Create ground pool (flat circle that fades out)
          const poolGeo = new THREE.CircleGeometry(1.5, 16);
          const poolMat = new THREE.MeshBasicMaterial({ 
            color: COLORS.player, 
            transparent: true, 
            opacity: 0.6,
            side: THREE.DoubleSide
          });
          const pool = new THREE.Mesh(poolGeo, poolMat);
          pool.rotation.x = -Math.PI / 2;
          pool.position.set(this.mesh.position.x, 0.05, this.mesh.position.z);
          scene.add(pool);
          
          // Fade out pool over time
          const fadePool = () => {
            poolMat.opacity -= 0.01;
            if (poolMat.opacity > 0) {
              setTimeout(fadePool, 50);
            } else {
              scene.remove(pool);
              poolGeo.dispose();
              poolMat.dispose();
            }
          };
          setTimeout(fadePool, 500);
          
          gameOver();
        }
      }
    }

    // Cached deformed geometry for Hard Tank (performance optimization)
    // Note: All Hard Tank enemies share the same deformed shape for performance.
    // This is intentional - visual variety comes from animations and positioning.
    let hardTankGeometryCache = null;

    // Water particle pool for player physics effects
    const waterParticlePool = [];
    const MAX_WATER_PARTICLES = 20;
    let waterParticleGeom = null;
    let waterParticleMat = null;

    function spawnWaterParticle(pos) {
      if (!scene) return;
      let p = waterParticlePool.find(x => !x.active);
      if (!p) {
        if (waterParticlePool.length >= MAX_WATER_PARTICLES) return;
        if (!waterParticleGeom) waterParticleGeom = new THREE.SphereGeometry(0.12, 4, 4);
        if (!waterParticleMat) waterParticleMat = new THREE.MeshBasicMaterial({ color: 0x44aabb, transparent: true, opacity: 0.7 });
        const mesh = new THREE.Mesh(waterParticleGeom, waterParticleMat.clone());
        p = { mesh, active: false, life: 0, vx: 0, vy: 0, vz: 0 };
        scene.add(p.mesh);
        waterParticlePool.push(p);
      }
      p.active = true;
      p.life = 0.5;
      p.mesh.position.set(pos.x + (Math.random()-0.5)*0.5, pos.y + Math.random()*0.5, pos.z + (Math.random()-0.5)*0.5);
      p.mesh.scale.setScalar(1);
      p.mesh.material.opacity = 0.7;
      p.vx = (Math.random()-0.5)*4;
      p.vy = Math.random()*3+1;
      p.vz = (Math.random()-0.5)*4;
      p.mesh.visible = true;
    }

    function updateWaterParticles(delta) {
      for (const p of waterParticlePool) {
        if (!p.active) continue;
        p.life -= delta;
        if (p.life <= 0) { p.active = false; p.mesh.visible = false; continue; }
        p.mesh.position.x += p.vx * delta;
        p.mesh.position.y += p.vy * delta;
        p.mesh.position.z += p.vz * delta;
        p.vy -= 9.8 * delta;
        const lifeFrac = p.life / 0.5;
        p.mesh.scale.setScalar(lifeFrac * 0.8);
        p.mesh.material.opacity = lifeFrac * 0.7;
      }
    }
    function getHardTankGeometry() {
      if (!hardTankGeometryCache) {
        const geometry = new THREE.SphereGeometry(0.6, 8, 8);
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          const y = positions.getY(i);
          const z = positions.getZ(i);
          const noiseX = 1 + (Math.random() - 0.5) * 0.3;
          const noiseY = 1 + (Math.random() - 0.5) * 0.3;
          const noiseZ = 1 + (Math.random() - 0.5) * 0.3;
          positions.setX(i, x * noiseX);
          positions.setY(i, y * noiseY);
          positions.setZ(i, z * noiseZ);
        }
        geometry.computeVertexNormals();
        hardTankGeometryCache = geometry;
      }
      return hardTankGeometryCache;
    }

    // Drone Turret class - New weapon replacing Lightning
    class DroneTurret {
      constructor(player) {
        this.player = player;
        this.offset = new THREE.Vector3(2, 1.5, 0); // Initial hover position relative to player
        this.wobblePhase = Math.random() * Math.PI * 2; // Random starting phase
        
        // Create drone body - small mechanical unit
        const bodyGeo = new THREE.BoxGeometry(0.4, 0.3, 0.4);
        const bodyMat = new THREE.MeshToonMaterial({ 
          color: 0x808080, // Gray metallic
          emissive: 0x404040,
          emissiveIntensity: 0.3
        });
        this.mesh = new THREE.Mesh(bodyGeo, bodyMat);
        scene.add(this.mesh);
        
        // Add glowing core
        const coreGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const coreMat = new THREE.MeshBasicMaterial({ 
          color: 0x00FFFF, // Cyan glow
          transparent: true,
          opacity: 0.8
        });
        this.core = new THREE.Mesh(coreGeo, coreMat);
        this.core.position.y = 0;
        this.mesh.add(this.core);
        
        // Add propellers/rotors on top
        const propGeo = new THREE.BoxGeometry(0.6, 0.05, 0.1);
        const propMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
        this.propeller1 = new THREE.Mesh(propGeo, propMat);
        this.propeller1.position.y = 0.2;
        this.mesh.add(this.propeller1);
        
        this.propeller2 = new THREE.Mesh(propGeo, propMat);
        this.propeller2.position.y = 0.2;
        this.propeller2.rotation.y = Math.PI / 2;
        this.mesh.add(this.propeller2);
        
        // Add small barrel/gun
        const barrelGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6);
        const barrelMat = new THREE.MeshToonMaterial({ color: 0x222222 });
        this.barrel = new THREE.Mesh(barrelGeo, barrelMat);
        this.barrel.rotation.x = Math.PI / 2;
        this.barrel.position.z = 0.3;
        this.barrel.position.y = -0.1;
        this.mesh.add(this.barrel);
        
        this.active = true;
        this.shootTimer = 0;
      }
      
      update(dt) {
        if (!this.active) {
          this.mesh.visible = false;
          return;
        }
        
        this.mesh.visible = true;
        
        // Hover near player with smooth bobbing motion
        this.wobblePhase += dt * 3;
        const bobHeight = Math.sin(this.wobblePhase) * 0.2;
        
        // Target position relative to player
        const targetX = this.player.mesh.position.x + this.offset.x;
        const targetY = this.player.mesh.position.y + this.offset.y + bobHeight;
        const targetZ = this.player.mesh.position.z + this.offset.z;
        
        // Smooth follow with lerp (frame-rate independent)
        const lerpSpeed = 0.1 / dt; // Normalize for frame rate
        const lerpFactor = Math.min(1, dt * 6); // Cap at 1.0, smooth at 60fps
        this.mesh.position.x += (targetX - this.mesh.position.x) * lerpFactor;
        this.mesh.position.y += (targetY - this.mesh.position.y) * lerpFactor;
        this.mesh.position.z += (targetZ - this.mesh.position.z) * lerpFactor;
        
        // Rotate propellers (frame-rate independent)
        this.propeller1.rotation.y += 0.3 * dt * 60; // Normalized for 60fps
        this.propeller2.rotation.y += 0.3 * dt * 60;
        
        // Pulse core
        this.core.material.opacity = 0.6 + Math.sin(gameTime * 5) * 0.2;
        
        // Find and track nearest enemy
        let nearestEnemy = null;
        let minDist = Infinity;
        
        for (let e of enemies) {
          if (e.isDead) continue;
          const dist = this.mesh.position.distanceTo(e.mesh.position);
          if (dist < weapons.droneTurret.range && dist < minDist) {
            minDist = dist;
            nearestEnemy = e;
          }
        }
        
        // Aim barrel at target
        if (nearestEnemy) {
          const dx = nearestEnemy.mesh.position.x - this.mesh.position.x;
          const dz = nearestEnemy.mesh.position.z - this.mesh.position.z;
          const angle = Math.atan2(dx, dz);
          this.mesh.rotation.y = angle;
        }
      }
      
      destroy() {
        if (this.mesh) {
          scene.remove(this.mesh);
          this.mesh.geometry.dispose();
          this.mesh.material.dispose();
          if (this.core) {
            this.core.geometry.dispose();
            this.core.material.dispose();
          }
          if (this.propeller1) {
            this.propeller1.geometry.dispose();
            this.propeller1.material.dispose();
          }
          if (this.propeller2) {
            this.propeller2.geometry.dispose();
            this.propeller2.material.dispose();
          }
          if (this.barrel) {
            this.barrel.geometry.dispose();
            this.barrel.material.dispose();
          }
        }
      }
    }

    class Enemy {
      constructor(type, x, z, playerLevel = 1) {
        this.type = type; // 0: Tank, 1: Fast, 2: Balanced, 3: Slowing, 4: Ranged, 5: Flying, 6: Hard Tank, 7: Hard Fast, 8: Hard Balanced, 9: Elite, 10: MiniBoss
        let geometry;
        let color;
        
        // Enemy scaling based on player level - NOT SPEED, just HP and DAMAGE
        // Phase 3: Increased difficulty - 15% per level (was 10%)
        const levelScaling = 1 + (playerLevel - 1) * 0.15;
        
        if (type === 0) {
          // Bacteria/Amoeba - Squishy organic blob shape
          geometry = new THREE.SphereGeometry(0.6, 8, 8);
          // Modify geometry to make it irregular/organic
          const positions = geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);
            // Add different randomness for each axis for truly organic look
            const noiseX = 1 + (Math.random() - 0.5) * 0.3;
            const noiseY = 1 + (Math.random() - 0.5) * 0.3;
            const noiseZ = 1 + (Math.random() - 0.5) * 0.3;
            positions.setX(i, x * noiseX);
            positions.setY(i, y * noiseY);
            positions.setZ(i, z * noiseZ);
          }
          geometry.computeVertexNormals();
          color = COLORS.enemySquare; // Pink/Hot Pink - Tanky
        } else if (type === 1) {
          // Water Bug - Elongated with segments
          geometry = new THREE.CapsuleGeometry(0.3, 0.8, 6, 8);
          color = COLORS.enemyTriangle; // Gold - Fast
        } else if (type === 2) {
          // Microbe - Round squishy
          geometry = new THREE.DodecahedronGeometry(0.5, 0);
          color = COLORS.enemyRound; // Purple - Balanced
        } else if (type === 3) {
          // Slowing Enemy - Spiky/icy appearance
          geometry = new THREE.IcosahedronGeometry(0.55, 0);
          color = 0x00FFFF; // Cyan - Slowing
        } else if (type === 4) {
          // Ranged Enemy - Different shape, angular
          geometry = new THREE.TetrahedronGeometry(0.6, 0);
          color = 0xFF6347; // Tomato red - Ranged
        } else if (type === 5) {
          // Flying Enemy - Octahedron
          geometry = new THREE.OctahedronGeometry(0.5, 1);
          color = 0x87CEEB; // Sky blue - Flying
        } else if (type === 6) {
          // Hard Tank - use cached deformed geometry for performance
          geometry = getHardTankGeometry();
          color = 0xFF1493; // Deep pink - Hard Tank
        } else if (type === 7) {
          // Hard Fast
          geometry = new THREE.CapsuleGeometry(0.3, 0.8, 6, 8);
          color = 0xFFD700; // Gold - Hard Fast
        } else if (type === 8) {
          // Hard Balanced
          geometry = new THREE.DodecahedronGeometry(0.5, 0);
          color = 0x9932CC; // Dark orchid - Hard Balanced
        } else if (type === 9) {
          // Elite
          geometry = new THREE.IcosahedronGeometry(0.6, 0);
          color = 0xFF0000; // Red - Elite
        } else if (type === 10) {
          // MiniBoss
          geometry = new THREE.DodecahedronGeometry(1.0, 1);
          color = 0xFFD700; // Gold - MiniBoss
        }

        const material = new THREE.MeshPhysicalMaterial({ 
          color: color,
          transparent: true,
          opacity: 0.85,
          metalness: type === 10 ? 0.4 : 0.1,
          roughness: 0.6,
          transmission: 0.2,
          thickness: 0.5,
          emissive: type === 10 ? color : 0x000000,
          emissiveIntensity: type === 10 ? 0.3 : 0
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, type === 5 ? 2 : 0.5, z);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);

        // Stats based on type — delegated to GameEnemies.getEnemyBaseStats
        Object.assign(this, getEnemyBaseStats(type, levelScaling, GAME_CONFIG.enemySpeedBase, playerLevel));
        this.isDead = false;
        this.isDamaged = false; // Track if enemy has been visually damaged
        this.pulsePhase = Math.random() * Math.PI;
        this.wobbleOffset = Math.random() * 100;
        this.lastAttackTime = 0;
        this.attackCooldown = 1000; // 1 second cooldown
        // Armor defaults to 0 if not set (only MiniBoss has armor = 0.25)
        
        // Add glowing eyes to enemy (VFX)
        const eyeRadius = type === 10 ? 0.12 : 0.07;
        const eyeColor = type === 4 ? 0xFF3300 : (type === 10 ? 0xFF0000 : 0xFF2222);
        const eGeo = new THREE.SphereGeometry(eyeRadius, 6, 6);
        const eMat = new THREE.MeshBasicMaterial({ color: eyeColor });
        const eyeSpread = type === 10 ? 0.3 : 0.18;
        const eyeForward = type === 5 ? 0.45 : 0.42;
        this.leftEye = new THREE.Mesh(eGeo, eMat);
        this.leftEye.position.set(-eyeSpread, 0.1, eyeForward);
        this.mesh.add(this.leftEye);
        this.rightEye = new THREE.Mesh(eGeo, eMat.clone()); // share geometry, clone material
        this.rightEye.position.set(eyeSpread, 0.1, eyeForward);
        this.mesh.add(this.rightEye);
        // Blink timer
        this.blinkTimer = 0;
        this.blinkDuration = 0.08;
        this.nextBlinkTime = 1.5 + Math.random() * 3.5;
        this.isBlinking = false;
      }

      update(dt, playerPos) {
        if (this.isDead) return;

        // Windmill Quest: Attack windmill instead of player
        let targetPos = playerPos;
        if (windmillQuest.active && windmillQuest.windmill) {
          targetPos = windmillQuest.windmill.position;
        }

        // Move towards target
        const dx = targetPos.x - this.mesh.position.x;
        const dz = targetPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);

        // Ranged Enemy behavior - stop at range and shoot
        if (this.type === 4 && dist < this.attackRange) {
          // Stop moving and attack from range
          const now = Date.now();
          if (now - this.lastAttackTime > this.attackCooldown) {
            // Fire projectile at player
            this.fireProjectile(targetPos);
            this.lastAttackTime = now;
          }
          this.mesh.lookAt(targetPos);
        } else if (dist > 0.5) {
          // Check if slow effect expired
          if (this.slowedUntil && this.slowedUntil < Date.now()) {
            this.speed = this.originalSpeed || this.speed;
            this.slowedUntil = null;
          }
          
          // Move towards target
          let vx = (dx / dist) * this.speed;
          let vz = (dz / dist) * this.speed;
          
          // Add enemy avoidance to prevent stacking/trains (optimized)
          // Only check nearby enemies to avoid O(n²) performance issues
          let avoidX = 0, avoidZ = 0;
          let avoidanceCount = 0;
          const maxAvoidanceChecks = 5; // Limit checks to nearest enemies
          for (let other of enemies) {
            if (other === this || other.isDead || avoidanceCount >= maxAvoidanceChecks) continue;
            const odx = this.mesh.position.x - other.mesh.position.x;
            const odz = this.mesh.position.z - other.mesh.position.z;
            const odist = Math.sqrt(odx*odx + odz*odz);
            
            // If too close to another enemy, push away
            if (odist < 1.5 && odist > 0.01) {
              const repulsion = 0.015; // Gentle push (kept smaller than forward speed)
              avoidX += (odx / odist) * repulsion;
              avoidZ += (odz / odist) * repulsion;
              avoidanceCount++;
            }
          }
          // Blend avoidance as secondary force - cap so it doesn't overpower forward movement
          const avoidMag = Math.sqrt(avoidX*avoidX + avoidZ*avoidZ);
          if (avoidMag > this.speed * 0.6) {
            const scale = (this.speed * 0.6) / avoidMag;
            avoidX *= scale;
            avoidZ *= scale;
          }
          vx += avoidX;
          vz += avoidZ;
          
          // Type 1 (Fast) - Zigzag perpendicular oscillation
          if (this.type === 1) {
            const wobble = Math.sin(gameTime * 12 + this.wobbleOffset) * 0.06;
            vx += wobble * (dz/dist); // Perpendicular oscillation
            vz -= wobble * (dx/dist);
          }
          
          // Type 2 (Balanced) - Slight weaving instead of circle strafe
          if (this.type === 2) {
            const weavePhase = gameTime * 4 + this.wobbleOffset;
            const weave = Math.sin(weavePhase) * 0.04;
            vx += weave * (-dz/dist);
            vz += weave * (dx/dist);
          }
          
          // Type 0 (Tank/Slow) - Weaving approach pattern
          if (this.type === 0) {
            const weavePhase = gameTime * 3 + this.wobbleOffset;
            const weave = Math.sin(weavePhase) * 0.04;
            vx += weave * (-dz/dist); // Weave side to side
            vz += weave * (dx/dist);
          }
          
          // Type 5 (Flying) - Wavy flying pattern
          if (this.type === 5) {
            const wavePhase = gameTime * 5 + this.wobbleOffset;
            const wave = Math.sin(wavePhase) * 0.08;
            vx += wave * (dz/dist);
            vz -= wave * (dx/dist);
            // Flying height with sin wave
            this.mesh.position.y = 2 + Math.sin(gameTime * 3 + this.wobbleOffset) * 0.5;
          }
          
          this.mesh.position.x += vx;
          this.mesh.position.z += vz;
          this.mesh.lookAt(targetPos);
        }

        // Collision with target
        if (windmillQuest.active && windmillQuest.windmill && dist < 3.0) {
          // Attack windmill with cooldown
          const now = Date.now();
          if (now - this.lastAttackTime > this.attackCooldown) {
            windmillQuest.windmill.userData.hp -= this.damage;
            updateWindmillQuestUI();
            this.lastAttackTime = now;
            playSound('hit');
          }
          // Knockback
          this.mesh.position.x -= (dx / dist) * 2;
          this.mesh.position.z -= (dz / dist) * 2;
          
          if (windmillQuest.windmill.userData.hp <= 0) {
            failWindmillQuest();
          }
        } else if (dist < 1.0 && this.type !== 4) { // Ranged enemies don't melee attack
          // Attack player with cooldown to prevent instant death
          const now = Date.now();
          if (now - this.lastAttackTime > this.attackCooldown) {
            player.takeDamage(this.damage);
            this.lastAttackTime = now;
            
            // Thorns damage - reflect damage back to enemy if still alive
            if (playerStats.thornsPercent > 0 && !this.isDead) {
              const thornsDamage = this.damage * playerStats.thornsPercent;
              this.takeDamage(thornsDamage, false);
              createDamageNumber(thornsDamage, this.mesh.position, false);
              spawnParticles(this.mesh.position, 0xFF6347, 8); // Tomato red thorns
            }
            
            // Slowing enemy slows player on hit
            if (this.type === 3) {
              playerStats.walkSpeed *= this.slowAmount;
              // Remove slow after duration
              setTimeout(() => {
                playerStats.walkSpeed /= this.slowAmount;
              }, this.slowDuration);
              // Visual effect for slow
              spawnParticles(player.mesh.position, 0x00FFFF, 10);
            }
          }
          
          // Knockback (always apply to prevent enemies from stacking)
          this.mesh.position.x -= (dx / dist) * 2;
          this.mesh.position.z -= (dz / dist) * 2;
        }

        // Squishy idle with more gravity-based wobble
        this.pulsePhase += dt * 6; // Slightly faster
        const squish = Math.sin(this.pulsePhase) * 0.08; // More pronounced from 0.05
        
        // MiniBoss glowing effect
        if (this.isMiniBoss) {
          const glowIntensity = 0.3 + Math.sin(this.pulsePhase * 2) * 0.2;
          this.mesh.material.emissiveIntensity = glowIntensity;
          // Larger breathing effect for mini-boss
          this.mesh.scale.set(1+squish*2, 1-squish*2, 1+squish*2);
        } else if (this.type === 0 || this.type === 3 || this.type === 6) {
           // Tank, Slowing, and Hard Tank breathe more dramatically
           this.mesh.scale.set(1+squish*1.5, 1-squish*1.5, 1+squish*1.5);
        } else {
           this.mesh.scale.set(1-squish, 1+squish*1.5, 1-squish);
        }
        
        // Blinking eyes animation
        if (this.leftEye && this.rightEye) {
          this.blinkTimer += dt;
          if (this.blinkTimer >= this.nextBlinkTime) {
            this.isBlinking = true;
            this.blinkTimer = 0;
            this.nextBlinkTime = 1.5 + Math.random() * 3.5;
          }
          if (this.isBlinking) {
            const bp = Math.min(1, this.blinkTimer / this.blinkDuration);
            const eyeScale = bp < 0.5 ? 1 - bp * 2 : (bp - 0.5) * 2;
            this.leftEye.scale.y = Math.max(0.05, eyeScale);
            this.rightEye.scale.y = Math.max(0.05, eyeScale);
            if (bp >= 1) {
              this.isBlinking = false;
              this.blinkTimer = 0;
              this.leftEye.scale.y = 1;
              this.rightEye.scale.y = 1;
            }
          }
        }
      }

      fireProjectile(targetPos) {
        // Create enemy projectile
        const projectile = {
          startPos: this.mesh.position.clone(),
          targetPos: targetPos.clone(),
          mesh: null,
          speed: this.projectileSpeed,
          damage: this.damage,
          lifetime: 100, // frames
          isEnemyProjectile: true
        };
        
        // Create visual
        const geo = new THREE.SphereGeometry(0.2, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xFF6347 });
        projectile.mesh = new THREE.Mesh(geo, mat);
        projectile.mesh.position.copy(this.mesh.position);
        projectile.mesh.position.y = 0.5;
        scene.add(projectile.mesh);
        
        // Direction
        const dx = targetPos.x - this.mesh.position.x;
        const dz = targetPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        projectile.direction = new THREE.Vector3(dx/dist, 0, dz/dist);
        
        // Add to projectiles array (will be updated in main loop)
        projectiles.push(projectile);
        
        playSound('shoot');
      }

      /**
       * Apply damage to the enemy
       * @param {number} amount - Damage amount
       * @param {boolean} isCrit - Whether this is a critical hit
       * @param {string} damageType - Type of damage: 'physical', 'fire', 'ice', 'lightning', 'shotgun', 'headshot'
       */
      takeDamage(amount, isCrit = false, damageType = 'physical') {
        // Track last damage type for death effects
        this.lastDamageType = damageType;
        
        // Phase 5: Hit impact particles (flesh/blood) on every hit - ENHANCED: Scale with HP remaining
        const hpRatio = this.hp / this.maxHp;
        const bloodParticleCount = Math.max(8, Math.floor((1 - hpRatio) * 22) + 6); // More blood as HP drops - increased intensity
        spawnParticles(this.mesh.position, 0x8B0000, Math.min(bloodParticleCount, 30)); // Blood particles scale with HP loss
        spawnParticles(this.mesh.position, 0x660000, Math.min(Math.floor(bloodParticleCount * 0.6), 14)); // Darker blood
        spawnParticles(this.mesh.position, 0xCC0000, Math.min(Math.floor(bloodParticleCount * 0.3), 8)); // Bright splatter
        // Spawn multiple ground blood decals for more brutal effect
        spawnBloodDecal(this.mesh.position);
        spawnBloodDecal(this.mesh.position); // Always at least 2 decals per hit
        if (hpRatio < 0.5) {
          spawnBloodDecal(this.mesh.position); // Extra decal at half HP
          spawnBloodDecal(this.mesh.position); // Additional splatter
        }
        if (hpRatio < 0.25) {
          spawnBloodDecal(this.mesh.position); // Extra decal at low HP
          spawnBloodDecal(this.mesh.position); // Even more at critical HP
          spawnBloodDecal(this.mesh.position); // Enemy barely alive - covered in blood
        }
        
        // Blood drip: small drops fall from wounded enemy to ground (managed in main loop)
        if (hpRatio < 0.5 && scene && bloodDrips.length < MAX_BLOOD_DRIPS) {
          const dripCount = hpRatio < 0.25 ? 3 : 2; // More drips at low HP
          for (let d = 0; d < dripCount && bloodDrips.length < MAX_BLOOD_DRIPS; d++) {
            const drip = new THREE.Mesh(
              new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 4, 4),
              new THREE.MeshBasicMaterial({ color: 0x8B0000 })
            );
            drip.position.set(
              this.mesh.position.x + (Math.random() - 0.5) * 0.4,
              this.mesh.position.y + (Math.random() - 0.5) * 0.2,
              this.mesh.position.z + (Math.random() - 0.5) * 0.4
            );
            scene.add(drip);
            bloodDrips.push({ mesh: drip, velY: 0, life: 25 + Math.floor(Math.random() * 15) });
          }
        }
        
        // Bullet-hole decal that sticks to enemy surface (visible bloody wound)
        if (!this.bulletHoles) this.bulletHoles = [];
        const MAX_ENEMY_BULLET_HOLES = 8;
        if (this.bulletHoles.length < MAX_ENEMY_BULLET_HOLES) {
          // Reuse shared geometry; clone shared material for per-hole opacity control
          const holeDecal = new THREE.Mesh(bulletHoleGeo, bulletHoleMat.clone());
          // Place on enemy surface (random position on sphere surface)
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.random() * Math.PI;
          const nx = Math.sin(phi) * Math.cos(theta);
          const ny = Math.sin(phi) * Math.sin(theta);
          const nz = Math.cos(phi);
          holeDecal.position.set(nx * 0.54, ny * 0.54, nz * 0.54);
          // Face outward from center
          holeDecal.lookAt(new THREE.Vector3(nx * 2, ny * 2, nz * 2));
          this.mesh.add(holeDecal);
          this.bulletHoles.push(holeDecal);
        }
        
        // Airborne blood splatter - arcs up then falls under gravity (managed in main loop via bloodDrips)
        const burstCount = isCrit ? 3 : 1;
        for (let b = 0; b < burstCount && bloodDrips.length < MAX_BLOOD_DRIPS; b++) {
          const p = new THREE.Mesh(
            new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 4, 4),
            new THREE.MeshBasicMaterial({ color: 0xAA0000 })
          );
          p.position.set(
            this.mesh.position.x + (Math.random() - 0.5) * 0.3,
            this.mesh.position.y + 0.1,
            this.mesh.position.z + (Math.random() - 0.5) * 0.3
          );
          scene.add(p);
          bloodDrips.push({
            mesh: p,
            velY: 0.15 + Math.random() * 0.2, // initial upward burst
            life: 30 + Math.floor(Math.random() * 15)
          });
        }
        
        // Phase 3: Apply armor reduction for MiniBoss — delegated to GameCombat
        let finalAmount = amount;
        if (this.armor > 0) {
          finalAmount = calculateEnemyArmorReduction(amount, this.armor);
          // Show armor reduction effect
          if (this.isMiniBoss) {
            createFloatingText(`-${Math.floor(amount * this.armor)}`, this.mesh.position, '#FFD700');
          }
        }
        
        const oldHp = this.hp;
        this.hp -= finalAmount;
        createDamageNumber(Math.floor(finalAmount), this.mesh.position, isCrit);
        
        const hpPercent = this.hp / this.maxHp;
        const oldHpPercent = oldHp / this.maxHp;
        
        // 75% HP: Blood spots, darken color by 20%
        if (oldHpPercent >= 0.75 && hpPercent < 0.75 && !this.stage1Damage) {
          this.stage1Damage = true;
          
          // Darken color
          const currentColor = this.mesh.material.color;
          currentColor.r *= 0.8;
          currentColor.g *= 0.8;
          currentColor.b *= 0.8;
          
          // Blood spots (small red particles)
          spawnParticles(this.mesh.position, 0x8B0000, 10);
          playSound('hit');
        }
        
        // 50% HP: Add flesh/hole meshes
        if (oldHpPercent >= 0.5 && hpPercent < 0.5 && !this.stage2Damage) {
          this.stage2Damage = true;
          
          // Add visible wounds/holes
          for(let i=0; i<3; i++) {
            const holeGeo = new THREE.SphereGeometry(0.1, 6, 6);
            const holeMat = new THREE.MeshBasicMaterial({ color: 0x220000 }); // Dark red
            const hole = new THREE.Mesh(holeGeo, holeMat);
            hole.position.set(
              (Math.random() - 0.5) * 0.5,
              (Math.random() - 0.5) * 0.5,
              (Math.random() - 0.5) * 0.5
            );
            this.mesh.add(hole);
          }
          
          spawnParticles(this.mesh.position, 0x8B0000, 8); // Reduced for performance
          playSound('hit');
        }
        
        // 25% HP: More limbs fly off, walkSpeed *= 0.6 - ENHANCED
        if (oldHpPercent >= 0.25 && hpPercent < 0.25 && !this.stage3Damage) {
          this.stage3Damage = true;
          
          // Reduce speed
          this.speed *= 0.6;
          
          // Spawn more limb pieces - ENHANCED
          const enemyColor = this.mesh.material.color.getHex();
          for(let i = 0; i < 8; i++) { // Increased from 4 to 8
            const limbSize = Math.random() * 0.2 + 0.2; // Varied limb sizes
            const limb = new THREE.Mesh(
              new THREE.BoxGeometry(limbSize, limbSize * 0.5, limbSize * 0.5),
              new THREE.MeshBasicMaterial({ color: enemyColor })
            );
            limb.position.copy(this.mesh.position);
            scene.add(limb);
            
            const vel = new THREE.Vector3(
              (Math.random() - 0.5) * 0.5, // Increased velocity
              Math.random() * 0.6,
              (Math.random() - 0.5) * 0.5
            );
            
            let life = 60;
            if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
              managedAnimations.push({ update(_dt) {
                life--;
                limb.position.add(vel);
                vel.y -= 0.02;
                limb.rotation.x += 0.15;
                limb.rotation.y += 0.15;
                if (life <= 0 || limb.position.y < 0) {
                  scene.remove(limb);
                  limb.geometry.dispose();
                  limb.material.dispose();
                  return false;
                }
                return true;
              }});
            } else {
              scene.remove(limb);
              limb.geometry.dispose();
              limb.material.dispose();
            }
          }
          
          spawnParticles(this.mesh.position, enemyColor, 12); // Reduced for performance
          spawnParticles(this.mesh.position, 0x8B0000, 5); // Reduced for performance
          playSound('hit');
        }
        
        // Destruction effect at 20% HP threshold (keep existing behavior)
        if (oldHpPercent >= 0.2 && hpPercent < 0.2 && !this.isDamaged) {
          this.isDamaged = true;
          
          // Visually damage the enemy - make smaller and break off pieces
          const damagePercent = 0.35 + Math.random() * 0.15; // 35-50%
          const newScale = 1 - damagePercent;
          this.mesh.scale.multiplyScalar(newScale);
          
          // Spawn broken pieces
          const enemyColor = this.mesh.material.color.getHex();
          for(let i = 0; i < 5; i++) {
            const piece = new THREE.Mesh(
              new THREE.BoxGeometry(0.2, 0.2, 0.2),
              new THREE.MeshBasicMaterial({ color: enemyColor })
            );
            piece.position.copy(this.mesh.position);
            scene.add(piece);
            
            const vel = new THREE.Vector3(
              (Math.random() - 0.5) * 0.3,
              Math.random() * 0.4,
              (Math.random() - 0.5) * 0.3
            );
            
            let life = 40;
            if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
              managedAnimations.push({ update(_dt) {
                life--;
                piece.position.add(vel);
                vel.y -= 0.02;
                piece.rotation.x += 0.1;
                piece.rotation.y += 0.1;
                if (life <= 0 || piece.position.y < 0) {
                  scene.remove(piece);
                  piece.geometry.dispose();
                  piece.material.dispose();
                  return false;
                }
                return true;
              }});
            } else {
              scene.remove(piece);
              piece.geometry.dispose();
              piece.material.dispose();
            }
          }
          playSound('hit');
        }
        
        // Enhanced splash particles using enemy's own color
        const enemyColor = this.mesh.material.color.getHex();
        const particleCount = isCrit ? 8 : 3;
        spawnParticles(this.mesh.position, enemyColor, particleCount);
        
        // Additional impact particles
        if (isCrit) {
          spawnParticles(this.mesh.position, enemyColor, 5);
          spawnParticles(this.mesh.position, 0xFFFFFF, 3);
        }
        
        // Enhanced squishy deformation on hit
        const squishScale = isCrit ? 0.7 : 0.85;
        this.mesh.scale.set(squishScale, 1.3, squishScale);
        setTimeout(() => {
          this.mesh.scale.set(1, 1, 1);
        }, 100);

        if (this.hp <= 0) {
          this.die();
        }
      }

      die() {
        this.isDead = true;
        
        // Track kills for active quests
        if (montanaQuest.active) {
          montanaQuest.kills++;
          updateMontanaQuestUI();
        }
        if (eiffelQuest.active) {
          eiffelQuest.kills++;
          updateEiffelQuestUI();
        }
        
        // Determine death effect based on damage type and health when dying
        const damageType = this.lastDamageType || 'physical';
        const enemyColor = this.mesh.material.color.getHex();
        
        // Trigger kill cam effect for varied visual feedback
        triggerKillCam(this.mesh.position, this.isMiniBoss, damageType);
        
        // Special death effects based on damage type
        if (damageType === 'fire') {
          // Fire death: Char and ash
          this.dieByFire(enemyColor);
        } else if (damageType === 'ice') {
          // Ice death: Shatter into ice shards
          this.dieByIce(enemyColor);
        } else if (damageType === 'lightning') {
          // Lightning death: Blackened and smoke
          this.dieByLightning(enemyColor);
        } else if (damageType === 'shotgun') {
          // Shotgun death: Massive gibs explosion
          this.dieByShotgun(enemyColor);
        } else if (damageType === 'headshot') {
          // Headshot: Specific head explosion
          this.dieByHeadshot(enemyColor);
        } else {
          // Standard death (bullet/physical)
          this.dieStandard(enemyColor);
        }
        
        // Flying enemies fall to ground
        if (this.isFlying) {
          const fallDuration = 60;
          let fallTimer = 0;
          const startY = this.mesh.position.y;
          const flyMesh = this.mesh;
          managedAnimations.push({ update(_dt) {
            if (fallTimer < fallDuration && flyMesh.parent) {
              fallTimer++;
              flyMesh.position.y = startY * (1 - fallTimer / fallDuration);
              flyMesh.rotation.x += 0.1;
              flyMesh.rotation.z += 0.15;
              return true;
            }
            return false;
          }});
        }
        
        // Screen flash on kill (dopamine boost) - stronger flash for mini-boss
        const flash = document.createElement('div');
        flash.style.position = 'fixed';
        flash.style.top = '0';
        flash.style.left = '0';
        flash.style.width = '100%';
        flash.style.height = '100%';
        flash.style.background = this.isMiniBoss ? 'rgba(255, 215, 0, 0.3)' : 'rgba(255, 255, 255, 0.2)';
        flash.style.pointerEvents = 'none';
        flash.style.zIndex = '500';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), this.isMiniBoss ? 100 : 50);
        
        // DEATH BLOOD BURST - violent explosion of blood particles
        const deathBloodCount = this.isMiniBoss ? 30 : 18;
        spawnParticles(this.mesh.position, 0x8B0000, deathBloodCount);
        spawnParticles(this.mesh.position, 0x6B0000, Math.floor(deathBloodCount * 0.7));
        spawnParticles(this.mesh.position, 0xCC0000, Math.floor(deathBloodCount * 0.5)); // Bright red splatter in air
        // Airborne blood droplets that land and form small pools
        const airBloodCount = this.isMiniBoss ? 12 : 6;
        for (let ab = 0; ab < airBloodCount; ab++) {
          const landX = this.mesh.position.x + (Math.random() - 0.5) * 4;
          const landZ = this.mesh.position.z + (Math.random() - 0.5) * 4;
          const delay = 80 + Math.floor(Math.random() * 200);
          setTimeout(() => {
            if (!scene) return;
            const r = 0.15 + Math.random() * 0.25;
            const poolGeo = new THREE.CircleGeometry(r, 8);
            const poolMat = new THREE.MeshStandardMaterial({ color: 0x7A0000, roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.75 });
            const pool = new THREE.Mesh(poolGeo, poolMat);
            pool.rotation.x = -Math.PI / 2;
            pool.position.set(landX, 0.015, landZ);
            scene.add(pool);
            bloodDecals.push(pool);
            // Fade after 8 seconds
            setTimeout(() => {
              let op = 0.75;
              let disposed = false;
              const fade = setInterval(() => {
                if (disposed) { clearInterval(fade); return; }
                op -= 0.025;
                poolMat.opacity = Math.max(0, op);
                if (op <= 0) {
                  clearInterval(fade);
                  disposed = true;
                  if (pool.parent) scene.remove(pool);
                  poolGeo.dispose();
                  poolMat.dispose();
                }
              }, 100);
              pool.userData.fadeInterval = fade; // Store for external cleanup if needed
            }, 8000);
          }, delay);
        }
        for (let db = 0; db < (this.isMiniBoss ? 10 : 6); db++) {
          spawnBloodDecal(this.mesh.position);
        }
        
        scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        // Dispose cloned bullet-hole materials to prevent memory leaks
        if (this.bulletHoles) {
          this.bulletHoles.forEach(h => h.material.dispose());
          this.bulletHoles = [];
        }
        // Dispose eye geometry (shared) and materials
        if (this.leftEye) { this.leftEye.material.dispose(); this.leftEye = null; }
        if (this.rightEye) { this.rightEye.material.dispose(); this.rightEye = null; }
        
        // Drop EXP
        const expMultiplier = this.isMiniBoss ? 3 : 1;
        for (let i = 0; i < expMultiplier; i++) {
          spawnExp(this.mesh.position.x, this.mesh.position.z);
        }
        
        // PR #117: Drop GOLD - Reduced drop rate (chest-like rarity), bigger amounts
        let goldAmount = 0;
        let dropChance = 0;
        
        if (this.isMiniBoss) {
          // MiniBoss: guaranteed 50-100 gold (increased from 30-60)
          goldAmount = 50 + Math.floor(Math.random() * 51);
          dropChance = 1.0; // 100% for mini-boss
        } else {
          // Regular enemies: MUCH lower drop rate (5-10% instead of 100%)
          dropChance = 0.05 + Math.random() * 0.05; // 5-10% chance
          
          if (Math.random() < dropChance) {
            // When they DO drop, drop MUCH more gold
            if (this.type === 0) { // Tank
              goldAmount = 8 + Math.floor(Math.random() * 5); // 8-12 gold (was 2-3)
            } else if (this.type === 1) { // Fast
              goldAmount = 5 + Math.floor(Math.random() * 3); // 5-7 gold (was 1)
            } else if (this.type === 2) { // Balanced
              goldAmount = 6 + Math.floor(Math.random() * 4); // 6-9 gold (was 1-2)
            } else if (this.type === 3) { // Slowing
              goldAmount = 8 + Math.floor(Math.random() * 5); // 8-12 gold (was 2-3)
            } else if (this.type === 4) { // Ranged
              goldAmount = 6 + Math.floor(Math.random() * 4); // 6-9 gold (was 1-2)
            } else if (this.type === 5) { // Flying
              goldAmount = 8 + Math.floor(Math.random() * 5); // 8-12 gold (was 2-3)
            } else if (this.type === 6) { // Hard Tank
              goldAmount = 15 + Math.floor(Math.random() * 11); // 15-25 gold (was 3-5)
            } else if (this.type === 7) { // Hard Fast
              goldAmount = 10 + Math.floor(Math.random() * 11); // 10-20 gold (was 2-4)
            } else if (this.type === 8) { // Hard Balanced
              goldAmount = 15 + Math.floor(Math.random() * 11); // 15-25 gold (was 3-5)
            } else if (this.type === 9) { // Elite
              goldAmount = 25 + Math.floor(Math.random() * 26); // 25-50 gold (was 5-8)
            } else {
              goldAmount = 5 + Math.floor(Math.random() * 6); // 5-10 gold (was 1-2)
            }
          }
        }
        
        // Only spawn gold if amount > 0
        if (goldAmount > 0) {
          spawnGold(this.mesh.position.x, this.mesh.position.z, goldAmount);
        }
        
        // Phase 1: Gear drop system - enemies have a chance to drop gear
        let gearDropChance = 0;
        if (this.isMiniBoss) {
          gearDropChance = 0.5; // 50% for mini-boss
        } else {
          // Regular enemies: 3-8% chance (scales with enemy type 0-9)
          // Enemy types 0-9 add 0-0.05% additional chance
          gearDropChance = 0.03 + Math.min(this.type * 0.005, 0.05); // 3-8% cap
        }
        
        if (Math.random() < gearDropChance) {
          const newGear = generateRandomGear();
          saveData.inventory.push(newGear);
          saveSaveData();
          
          // Show notification
          const rarityColors = {
            common: '#AAAAAA',
            uncommon: '#00FF00',
            rare: '#5DADE2',
            epic: '#9B59B6',
            legendary: '#F39C12'
          };
          createFloatingText(`+${newGear.name}`, this.mesh.position, rarityColors[newGear.rarity] || '#FFFFFF');
          playSound('coin');
          
          console.log('[Phase 1 Gear Drop]', newGear.name, '-', newGear.rarity);
          
          // Quest progression: lake chest quest (triggered by first item collection)
          if (saveData.storyQuests.currentQuest === 'discoverLakeChest' && saveData.inventory.length === 1) {
            // This is the first item - treat it as finding the lake chest
            setTimeout(() => {
              progressQuest('discoverLakeChest', true);
            }, 2000); // Small delay to let player see the item notification
          }
        }
        
        playerStats.kills++;
        
        // Tutorial Quest: Track kills this run
        if (saveData.tutorialQuests) {
          saveData.tutorialQuests.killsThisRun = playerStats.kills;
          updateQuestTracker();
          
          // Quest 1: Kill 3 enemies
          const currentQuest = getCurrentQuest();
          if (currentQuest && currentQuest.id === 'quest1_kill3' && playerStats.kills >= 3) {
            progressTutorialQuest('quest1_kill3', true);
            // Guard: only set pending notification if quest1 is now in readyToClaim
            if (saveData.tutorialQuests.readyToClaim.includes('quest1_kill3')) {
              saveData.tutorialQuests.pendingMissionNotification = 'quest1_kill3';
            }
          }
          // Quest 6: Kill 10 enemies — notify mid-run when objective reached
          if (currentQuest && currentQuest.id === 'quest6_kill10' && playerStats.kills >= 10 &&
              !saveData.tutorialQuests.readyToClaim.includes('quest6_kill10')) {
            showStatChange('⚔️ 10 Kills! Return to camp after this run!');
          }
          // Quest 7 (new): Kill 15 enemies — notify mid-run when objective reached
          if (currentQuest && currentQuest.id === 'quest7_kill10' && playerStats.kills >= 15 &&
              !saveData.tutorialQuests.readyToClaim.includes('quest7_kill10')) {
            showStatChange('⚔️ 15 Kills! Return to camp to claim your reward!');
          }
        }
        
        // Track side challenge progress
        if (saveData.sideChallenges.kill10Enemies && !saveData.sideChallenges.kill10Enemies.completed) {
          saveData.sideChallenges.kill10Enemies.progress++;
          if (saveData.sideChallenges.kill10Enemies.progress >= saveData.sideChallenges.kill10Enemies.target) {
            saveData.sideChallenges.kill10Enemies.completed = true;
            // Award gold before saving to prevent loss on crash
            saveData.gold += 50;
            saveSaveData();
            createFloatingText("Side Quest Complete: Kill 10 Enemies! +50 Gold", this.mesh.position, '#FFD700');
          }
        }
        
        // Track mini-boss defeats for achievements
        if (this.isMiniBoss) {
          playerStats.miniBossesDefeated++;
          createFloatingText("MINI-BOSS DEFEATED! 🏆", this.mesh.position);
        }
        
        updateHUD();
        updateComboCounter(true); // Phase 2: Track combo on kill
        checkAchievements(); // Check for achievements after kill
        // Kill 7 achievement check
        if (playerStats.kills === 7 && (!saveData.achievementQuests || !saveData.achievementQuests.kill7Unlocked)) {
          if (!saveData.achievementQuests) saveData.achievementQuests = { kill7Unlocked: false, kill7Quest: 'none' };
          saveData.achievementQuests.kill7Unlocked = true;
          saveData.achievementQuests.kill7Quest = 'active';
          saveSaveData();
          showEnhancedNotification('achievement', '🏆 ACHIEVEMENT UNLOCKED: Kill 7 Enemies!', 'Visit the Achievement Building in Camp to claim your reward!');
          updateStatBar();
        }
      }
      
      // Specialized death effects by damage type
      dieStandard(enemyColor) {
        // Phase 5: Death Variety - Multiple death animation variations
        const deathVariation = Math.random();
        
        if (deathVariation < 0.25) {
          // EXPLOSION DEATH: Main explosion (death ring removed per requirements)
          spawnParticles(this.mesh.position, enemyColor, 30);
          spawnParticles(this.mesh.position, 0xFFFFFF, 10);
          spawnParticles(this.mesh.position, 0x8B0000, 25); // More blood
          spawnParticles(this.mesh.position, 0xFF2200, 15); // Bright red gore pieces
          
          // Explode into pieces (NO death ring)
          const pieceCount = this.isMiniBoss ? 20 : 10;
          for(let i = 0; i < pieceCount; i++) {
            const piece = new THREE.Mesh(
              new THREE.BoxGeometry(0.3, 0.3, 0.3),
              new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true })
            );
            piece.position.copy(this.mesh.position);
            scene.add(piece);
            
            const angle = (i / pieceCount) * Math.PI * 2;
            const speed = this.isMiniBoss ? 0.6 : 0.4;
            const vel = new THREE.Vector3(
              Math.cos(angle) * speed,
              0.3 + Math.random() * 0.3,
              Math.sin(angle) * speed
            );
            
            let life = 80;
            if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
              managedAnimations.push({ update(_dt) {
                life--;
                piece.position.add(vel);
                vel.y -= 0.02;
                piece.rotation.x += 0.15;
                piece.rotation.y += 0.15;
                piece.material.opacity = life / 80;
                if (life <= 0 || piece.position.y < 0) {
                  scene.remove(piece);
                  piece.geometry.dispose();
                  piece.material.dispose();
                  return false;
                }
                return true;
              }});
            } else {
              scene.remove(piece);
              piece.geometry.dispose();
              piece.material.dispose();
            }
          }
        } else if (deathVariation < 0.5) {
          // CORPSE DEATH: Leave a corpse sprite with blood pool
          spawnParticles(this.mesh.position, enemyColor, 8);
          spawnParticles(this.mesh.position, 0x8B0000, 4);
          
          // Corpse sprite
          const corpseGeo = new THREE.CircleGeometry(0.6, 16);
          const corpseMat = new THREE.MeshBasicMaterial({ 
            color: enemyColor, 
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
          });
          const corpse = new THREE.Mesh(corpseGeo, corpseMat);
          corpse.position.copy(this.mesh.position);
          corpse.position.y = 0.02;
          corpse.rotation.x = -Math.PI / 2;
          scene.add(corpse);
          
          // Blood pool
          const bloodGeo = new THREE.CircleGeometry(0.8, 16);
          const bloodMat = new THREE.MeshStandardMaterial({ 
            color: 0x8B0000, 
            transparent: true,
            opacity: 0.5,
            roughness: 0.3,
            metalness: 0.5, // Shine/reflection on blood pool
            side: THREE.DoubleSide
          });
          const bloodPool = new THREE.Mesh(bloodGeo, bloodMat);
          bloodPool.position.copy(this.mesh.position);
          bloodPool.position.y = 0.01;
          bloodPool.rotation.x = -Math.PI / 2;
          scene.add(bloodPool);
          
          // Fade out
          let corpseLife = 180;
          managedAnimations.push({ update(_dt) {
            corpseLife--;
            corpse.material.opacity = (corpseLife / 180) * 0.7;
            bloodPool.material.opacity = (corpseLife / 180) * 0.5;
            if (corpseLife <= 0) {
              scene.remove(corpse);
              scene.remove(bloodPool);
              corpse.geometry.dispose();
              corpse.material.dispose();
              bloodPool.geometry.dispose();
              bloodPool.material.dispose();
              return false;
            }
            return true;
          }});
        } else if (deathVariation < 0.75) {
          // DISINTEGRATION DEATH: Enemy dissolves into particles
          spawnParticles(this.mesh.position, enemyColor, 30);
          spawnParticles(this.mesh.position, 0x444444, 10); // Dark particles
          
          // Create dissolving pieces that shrink as they fall
          for(let i = 0; i < 12; i++) {
            const piece = new THREE.Mesh(
              new THREE.SphereGeometry(0.15, 8, 8),
              new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true })
            );
            piece.position.copy(this.mesh.position);
            scene.add(piece);
            
            const vel = new THREE.Vector3(
              (Math.random() - 0.5) * 0.2,
              Math.random() * 0.2,
              (Math.random() - 0.5) * 0.2
            );
            
            let life = 40;
            if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
              managedAnimations.push({ update(_dt) {
                life--;
                piece.position.add(vel);
                vel.y -= 0.01;
                piece.scale.multiplyScalar(0.95);
                piece.material.opacity = life / 40;
                if (life <= 0 || piece.scale.x < 0.01) {
                  scene.remove(piece);
                  piece.geometry.dispose();
                  piece.material.dispose();
                  return false;
                }
                return true;
              }});
            } else {
              scene.remove(piece);
              piece.geometry.dispose();
              piece.material.dispose();
            }
          }
        } else {
          // SPLATTER DEATH: Dramatic blood splatter effect
          spawnParticles(this.mesh.position, 0x8B0000, 25); // Lots of blood
          spawnParticles(this.mesh.position, enemyColor, 10);
          
          // Create blood splatter marks in random directions
          for(let i = 0; i < 8; i++) {
            const splatter = new THREE.Mesh(
              new THREE.CircleGeometry(0.3, 8),
              new THREE.MeshBasicMaterial({ 
                color: 0x8B0000, 
                transparent: true,
                opacity: 0.6,
                side: THREE.DoubleSide
              })
            );
            const angle = (i / 8) * Math.PI * 2;
            const dist = 0.5 + Math.random() * 0.5;
            splatter.position.set(
              this.mesh.position.x + Math.cos(angle) * dist,
              0.01,
              this.mesh.position.z + Math.sin(angle) * dist
            );
            splatter.rotation.x = -Math.PI / 2;
            scene.add(splatter);
            
            // Fade out
            let life = 100;
            managedAnimations.push({ update(_dt) {
              life--;
              splatter.material.opacity = (life / 100) * 0.6;
              if (life <= 0) {
                scene.remove(splatter);
                splatter.geometry.dispose();
                splatter.material.dispose();
                return false;
              }
              return true;
            }});
          }
          
          // Central corpse piece
          const corpse = new THREE.Mesh(
            new THREE.CircleGeometry(0.4, 16),
            new THREE.MeshBasicMaterial({ 
              color: enemyColor, 
              transparent: true,
              opacity: 0.8,
              side: THREE.DoubleSide
            })
          );
          corpse.position.copy(this.mesh.position);
          corpse.position.y = 0.02;
          corpse.rotation.x = -Math.PI / 2;
          scene.add(corpse);
          
          let corpseLife = 120;
          managedAnimations.push({ update(_dt) {
            corpseLife--;
            corpse.material.opacity = (corpseLife / 120) * 0.8;
            if (corpseLife <= 0) {
              scene.remove(corpse);
              corpse.geometry.dispose();
              corpse.material.dispose();
              return false;
            }
            return true;
          }});
        }
      }
      
      dieByFire(enemyColor) {
        // Fire death: Char and burn to ash
        spawnParticles(this.mesh.position, 0xFF4500, 20); // Orange fire
        spawnParticles(this.mesh.position, 0xFFFF00, 10); // Yellow flames
        spawnParticles(this.mesh.position, 0x222222, 8); // Black smoke
        
        // Charred corpse
        const corpseGeo = new THREE.CircleGeometry(0.6, 16);
        const corpseMat = new THREE.MeshBasicMaterial({ 
          color: 0x222222, // Charred black
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide
        });
        const corpse = new THREE.Mesh(corpseGeo, corpseMat);
        corpse.position.copy(this.mesh.position);
        corpse.position.y = 0.02;
        corpse.rotation.x = -Math.PI / 2;
        scene.add(corpse);
        
        // Burn mark on ground
        const burnGeo = new THREE.CircleGeometry(0.9, 16);
        const burnMat = new THREE.MeshBasicMaterial({ 
          color: 0x111111, 
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide
        });
        const burnMark = new THREE.Mesh(burnGeo, burnMat);
        burnMark.position.copy(this.mesh.position);
        burnMark.position.y = 0.01;
        burnMark.rotation.x = -Math.PI / 2;
        scene.add(burnMark);
        
        // Fade to ash
        let life = 120;
        managedAnimations.push({ update(_dt) {
          life--;
          corpse.material.opacity = (life / 120) * 0.8;
          corpse.scale.multiplyScalar(0.995);
          if (life <= 0) {
            scene.remove(corpse);
            scene.remove(burnMark);
            corpse.geometry.dispose();
            corpse.material.dispose();
            burnMark.geometry.dispose();
            burnMark.material.dispose();
            return false;
          }
          return true;
        }});
      }
      
      dieByIce(enemyColor) {
        // Ice death: Shatter into ice crystals
        spawnParticles(this.mesh.position, 0x87CEEB, 15); // Light blue ice
        spawnParticles(this.mesh.position, 0xFFFFFF, 12); // White frost
        
        // Shatter into ice shards
        const shardCount = 10;
        for(let i = 0; i < shardCount; i++) {
          const shardGeo = new THREE.ConeGeometry(0.1, 0.3, 4);
          const shardMat = new THREE.MeshBasicMaterial({ 
            color: 0xADD8E6, // Light ice blue
            transparent: true,
            opacity: 0.7
          });
          const shard = new THREE.Mesh(shardGeo, shardMat);
          shard.position.copy(this.mesh.position);
          scene.add(shard);
          
          const angle = (i / shardCount) * Math.PI * 2;
          const vel = new THREE.Vector3(
            Math.cos(angle) * 0.3,
            0.4 + Math.random() * 0.2,
            Math.sin(angle) * 0.3
          );
          
          let life = 60;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              shard.position.add(vel);
              vel.y -= 0.03;
              shard.rotation.x += 0.2;
              shard.rotation.z += 0.15;
              shard.material.opacity = (life / 60) * 0.7;
              if (life <= 0 || shard.position.y < 0) {
                scene.remove(shard);
                shard.geometry.dispose();
                shard.material.dispose();
                return false;
              }
              return true;
            }});
          } else {
            scene.remove(shard);
            shard.geometry.dispose();
            shard.material.dispose();
          }
        }
      }
      
      dieByLightning(enemyColor) {
        // Lightning death: Blackened and smoking
        spawnParticles(this.mesh.position, 0xFFFF00, 15); // Yellow lightning
        spawnParticles(this.mesh.position, 0xFFFFFF, 10); // White flash
        spawnParticles(this.mesh.position, 0x444444, 8); // Gray smoke
        
        // Blackened corpse
        const corpseGeo = new THREE.CircleGeometry(0.6, 16);
        const corpseMat = new THREE.MeshBasicMaterial({ 
          color: 0x1a1a1a, // Very dark gray
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide
        });
        const corpse = new THREE.Mesh(corpseGeo, corpseMat);
        corpse.position.copy(this.mesh.position);
        corpse.position.y = 0.02;
        corpse.rotation.x = -Math.PI / 2;
        scene.add(corpse);
        
        // Smoke particles rising - use managed array instead of RAF
        const deathPos = this.mesh.position.clone();
        let smokeSpawnCount = 8;
        const smokeSpawnInterval = setInterval(() => {
          smokeSpawnCount--;
          if (smokeSpawnCount <= 0 || !scene) { clearInterval(smokeSpawnInterval); return; }
          if (smokeParticles.length < MAX_SMOKE_PARTICLES) {
            const smokeGeo = new THREE.SphereGeometry(0.1, 6, 6);
            const smokeMat = new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.4 });
            const smoke = new THREE.Mesh(smokeGeo, smokeMat);
            smoke.position.copy(deathPos);
            smoke.position.y = 0.1;
            scene.add(smoke);
            smokeParticles.push({ mesh: smoke, material: smokeMat, geometry: smokeGeo,
              velocity: { x: (Math.random()-0.5)*0.02, y: 0.03, z: (Math.random()-0.5)*0.02 },
              life: 40, maxLife: 40 });
          }
        }, 100);
        
        // Fade corpse
        let corpseLife = 120;
        managedAnimations.push({ update(_dt) {
          corpseLife--;
          corpse.material.opacity = (corpseLife / 120) * 0.9;
          if (corpseLife <= 0) {
            scene.remove(corpse);
            corpse.geometry.dispose();
            corpse.material.dispose();
            return false;
          }
          return true;
        }});
      }
      
      dieByShotgun(enemyColor) {
        // Shotgun death: Massive explosion of gibs
        spawnParticles(this.mesh.position, enemyColor, 30);
        spawnParticles(this.mesh.position, 0x8B0000, 20); // Lots of blood
        spawnParticles(this.mesh.position, 0xFFFFFF, 10);
        
        // Massive gib explosion
        const gibCount = 15;
        for(let i = 0; i < gibCount; i++) {
          const gibSize = 0.1 + Math.random() * 0.2;
          const gibGeo = new THREE.BoxGeometry(gibSize, gibSize, gibSize);
          const gibMat = new THREE.MeshBasicMaterial({ 
            color: i % 3 === 0 ? 0x8B0000 : enemyColor,
            transparent: true
          });
          const gib = new THREE.Mesh(gibGeo, gibMat);
          gib.position.copy(this.mesh.position);
          scene.add(gib);
          
          const angle = (i / gibCount) * Math.PI * 2;
          const speed = 0.5 + Math.random() * 0.3;
          const vel = new THREE.Vector3(
            Math.cos(angle) * speed,
            0.4 + Math.random() * 0.4,
            Math.sin(angle) * speed
          );
          
          let life = 60;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              gib.position.add(vel);
              vel.y -= 0.025;
              gib.rotation.x += 0.25;
              gib.rotation.y += 0.2;
              gib.material.opacity = life / 60;
              if (life <= 0 || gib.position.y < 0) {
                scene.remove(gib);
                gib.geometry.dispose();
                gib.material.dispose();
                return false;
              }
              return true;
            }});
          } else {
            scene.remove(gib);
            gib.geometry.dispose();
            gib.material.dispose();
          }
        }
        
        // Large blood pool
        const bloodGeo = new THREE.CircleGeometry(1.2, 16);
        const bloodMat = new THREE.MeshBasicMaterial({ 
          color: 0x8B0000, 
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide
        });
        const bloodPool = new THREE.Mesh(bloodGeo, bloodMat);
        bloodPool.position.copy(this.mesh.position);
        bloodPool.position.y = 0.01;
        bloodPool.rotation.x = -Math.PI / 2;
        scene.add(bloodPool);
        
        // Fade blood
        let life = 150;
        managedAnimations.push({ update(_dt) {
          life--;
          bloodPool.material.opacity = (life / 150) * 0.7;
          if (life <= 0) {
            scene.remove(bloodPool);
            bloodPool.geometry.dispose();
            bloodPool.material.dispose();
            return false;
          }
          return true;
        }});
      }
      
      dieByHeadshot(enemyColor) {
        // FRESH IMPLEMENTATION: Enhanced headshot with actual head detachment
        // Headshot: Dramatic head explosion with visible detached head
        spawnParticles(this.mesh.position, enemyColor, 25);
        spawnParticles(this.mesh.position, 0xDC143C, 20); // Crimson blood (not white!)
        spawnParticles(this.mesh.position, 0x8B0000, 15); // Dark red blood
        spawnParticles(this.mesh.position, 0xFFFFFF, 5);
        
        // Blood stream particles (continuous stream effect)
        for (let i = 0; i < 8; i++) {
          setTimeout(() => {
            const streamPos = this.mesh.position.clone();
            streamPos.y += 0.8;
            spawnParticles(streamPos, 0xDC143C, 5);
          }, i * 50);
        }
        
        // Create detached head that flies off with enhanced rotation
        const headGeo = new THREE.SphereGeometry(0.3, 12, 12);
        const headMat = new THREE.MeshBasicMaterial({ 
          color: enemyColor, 
          transparent: true,
          opacity: 1
        });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.copy(this.mesh.position);
        head.position.y += 0.5; // Start from head height
        scene.add(head);
        
        // Head velocity (flies backward and up with spin)
        const headVel = new THREE.Vector3(
          (Math.random() - 0.5) * 0.6,
          0.8 + Math.random() * 0.4, // Upward
          (Math.random() - 0.5) * 0.6
        );
        
        // Enhanced rotation speeds for dramatic spinning
        const rotSpeed = {
          x: 0.15 + Math.random() * 0.1,
          y: 0.2 + Math.random() * 0.15,
          z: 0.1 + Math.random() * 0.1
        };
        
        // Blood spray trail from neck
        let headLife = 80;
        managedAnimations.push({ update(_dt) {
          headLife--;
          head.position.add(headVel);
          headVel.y -= 0.025;
          head.rotation.x += rotSpeed.x;
          head.rotation.y += rotSpeed.y;
          head.rotation.z += rotSpeed.z;
          if (headLife % 2 === 0 && headLife > 20) {
            spawnParticles(head.position, 0xDC143C, 3);
          }
          if (headLife < 20) {
            head.material.opacity = headLife / 20;
          }
          if (headLife <= 0 || head.position.y < 0) {
            scene.remove(head);
            head.geometry.dispose();
            head.material.dispose();
            return false;
          }
          return true;
        }});
        
        // Body falls (corpse without head)
        const corpseGeo = new THREE.CircleGeometry(0.6, 16);
        const corpseMat = new THREE.MeshBasicMaterial({ 
          color: enemyColor, 
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide
        });
        const corpse = new THREE.Mesh(corpseGeo, corpseMat);
        corpse.position.copy(this.mesh.position);
        corpse.position.y = 0.02;
        corpse.rotation.x = -Math.PI / 2;
        scene.add(corpse);
        
        // Large blood splatter pool (crimson, not white!)
        const bloodGeo = new THREE.CircleGeometry(1.2, 16); // Larger pool
        const bloodMat = new THREE.MeshBasicMaterial({ 
          color: 0xDC143C, // Crimson blood
          transparent: true,
          opacity: 0.7, // More visible
          side: THREE.DoubleSide
        });
        const bloodPool = new THREE.Mesh(bloodGeo, bloodMat);
        bloodPool.position.copy(this.mesh.position);
        bloodPool.position.y = 0.01;
        bloodPool.rotation.x = -Math.PI / 2;
        scene.add(bloodPool);
        
        // Extra gore pieces (bone/skull fragments) with proper coloring
        for(let i = 0; i < 6; i++) {
          const pieceSize = 0.1 + Math.random() * 0.1;
          const piece = new THREE.Mesh(
            new THREE.BoxGeometry(pieceSize, pieceSize, pieceSize),
            new THREE.MeshBasicMaterial({ 
              color: i % 3 === 0 ? 0xFFFFFF : (i % 3 === 1 ? 0x8B0000 : enemyColor), 
              transparent: true 
            })
          );
          piece.position.copy(this.mesh.position);
          piece.position.y += 0.5; // Start from head height
          scene.add(piece);
          
          const vel = new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            0.5 + Math.random() * 0.4,
            (Math.random() - 0.5) * 0.5
          );
          
          let life = 60;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              piece.position.add(vel);
              vel.y -= 0.03;
              piece.rotation.x += 0.2;
              piece.rotation.y += 0.25;
              piece.material.opacity = life / 60;
              if (life <= 0 || piece.position.y < 0) {
                scene.remove(piece);
                piece.geometry.dispose();
                piece.material.dispose();
                return false;
              }
              return true;
            }});
          } else {
            scene.remove(piece);
            piece.geometry.dispose();
            piece.material.dispose();
          }
        }
        
        // Fade corpse
        let life = 120;
        managedAnimations.push({ update(_dt) {
          life--;
          corpse.material.opacity = (life / 120) * 0.8;
          bloodPool.material.opacity = (life / 120) * 0.6;
          if (life <= 0) {
            scene.remove(corpse);
            scene.remove(bloodPool);
            corpse.geometry.dispose();
            corpse.material.dispose();
            bloodPool.geometry.dispose();
            bloodPool.material.dispose();
            return false;
          }
          return true;
        }});
      }
    }

    // Performance: Cached geometries and materials for projectiles (reused across instances)
    const projectileGeometryCache = {
      bullet: new THREE.SphereGeometry(0.0625, 8, 8),  // 75% smaller radius (0.25 → 0.0625 is 25% of original)
      bulletGlow: new THREE.SphereGeometry(0.0875, 6, 6)  // 75% smaller radius (0.35 → 0.0875 is 25% of original)
    };
    const projectileMaterialCache = {
      bullet: new THREE.MeshBasicMaterial({ 
        color: 0xFF4500,  // Red-orange starting color
        transparent: true,
        opacity: 0.95
      }),
      bulletGlow: new THREE.MeshBasicMaterial({
        color: 0xFF6347,  // Tomato red-orange for glow
        transparent: true,
        opacity: 0.4
      })
    };

    // Phase 5: Companion System - Simplified implementation for stable gameplay
    class Companion {
      constructor(companionId) {
        this.companionId = companionId;
        this.data = COMPANIONS[companionId];
        this.companionData = saveData.companions[companionId];
        
        // Stats based on level
        const isEvolved = this.companionData.level >= 10;
        const stats = isEvolved ? this.data.evolvedStats : this.data.baseStats;
        
        this.damage = stats.damage;
        this.attackSpeed = stats.attackSpeed;
        this.maxHp = stats.health;
        this.hp = this.maxHp;
        this.isDead = false;
        this.respawnTimer = 0;
        this.lastAttackTime = 0;
        
        // Create visual representation
        const icon = isEvolved ? this.data.evolvedIcon : this.data.icon;
        const size = 0.8;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({ 
          color: this.data.type === 'melee' ? 0x8B4513 : 
                 this.data.type === 'ranged' ? 0x4169E1 : 0x00CED1
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);
        
        // Position near player
        this.mesh.position.copy(player.mesh.position);
        this.mesh.position.x += 2;
      }
      
      update(dt) {
        if (this.isDead) {
          this.respawnTimer -= dt;
          if (this.respawnTimer <= 0) {
            this.respawn();
          }
          return;
        }
        
        if (!player || !player.mesh) return;
        
        // Follow player with simple AI
        const dx = player.mesh.position.x - this.mesh.position.x;
        const dz = player.mesh.position.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        // Keep distance from player (melee closer, others farther)
        const targetDist = this.data.type === 'melee' ? 2 : 3;
        
        if (dist > targetDist + 0.5) {
          // Move toward player
          const moveSpeed = 0.15;
          this.mesh.position.x += (dx / dist) * moveSpeed;
          this.mesh.position.z += (dz / dist) * moveSpeed;
        } else if (dist < targetDist - 0.5) {
          // Move away from player
          const moveSpeed = 0.1;
          this.mesh.position.x -= (dx / dist) * moveSpeed;
          this.mesh.position.z -= (dz / dist) * moveSpeed;
        }
        
        // Attack nearest enemy
        const now = Date.now();
        if (enemies.length > 0 && now - this.lastAttackTime > this.attackSpeed * 1000) {
          let nearest = null;
          let nearestDist = Infinity;
          
          for (const enemy of enemies) {
            const ex = enemy.mesh.position.x - this.mesh.position.x;
            const ez = enemy.mesh.position.z - this.mesh.position.z;
            const d = ex*ex + ez*ez;
            if (d < nearestDist && d < 100) { // Range check
              nearestDist = d;
              nearest = enemy;
            }
          }
          
          if (nearest) {
            // Attack
            const damageMultiplier = 1 + (this.companionData.level - 1) * 0.1; // +10% per level
            const finalDamage = Math.floor(this.damage * damageMultiplier * playerStats.strength);
            nearest.takeDamage(finalDamage, false);
            spawnParticles(nearest.mesh.position, 0xFF6347, 3);
            this.lastAttackTime = now;
          }
        }
        
        // Bob animation
        this.mesh.position.y = 0.5 + Math.sin(Date.now() * 0.003) * 0.1;
      }
      
      takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
          this.die();
        }
      }
      
      die() {
        this.isDead = true;
        this.mesh.visible = false;
        this.respawnTimer = 10; // 10 second respawn
        createFloatingText('Companion down!', this.mesh.position, '#FF6347');
      }
      
      respawn() {
        this.isDead = false;
        this.hp = this.maxHp;
        this.mesh.visible = true;
        this.mesh.position.copy(player.mesh.position);
        this.mesh.position.x += 2;
        createFloatingText('Companion respawned!', this.mesh.position, '#00FF00');
      }
      
      addXP(amount) {
        // Companions gain 10% of all XP awarded to the player
        const companionXP = Math.floor(amount * 0.1);
        this.companionData.xp += companionXP;
        
        // Level up check (simplified progression)
        const xpRequired = [0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 4000];
        if (this.companionData.level < 10 && this.companionData.xp >= xpRequired[this.companionData.level]) {
          this.companionData.level++;
          saveData.companions[this.companionId] = this.companionData;
          saveSaveData();
          
          if (this.companionData.level === 10) {
            createFloatingText('⭐ COMPANION EVOLVED! ⭐', this.mesh.position, '#FFD700');
            // Update stats to evolved form
            const stats = this.data.evolvedStats;
            this.damage = stats.damage;
            this.attackSpeed = stats.attackSpeed;
            this.maxHp = stats.health;
            this.hp = this.maxHp;
          } else {
            createFloatingText(`Level ${this.companionData.level}!`, this.mesh.position, '#00FF00');
          }
        }
      }
      
      destroy() {
        scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
      }
    }

    class Projectile {
      constructor(x, z, target) {
        // Performance: Reuse cached geometry but clone materials for independent color transitions
        this.mesh = new THREE.Mesh(
          projectileGeometryCache.bullet, 
          projectileMaterialCache.bullet.clone()  // Clone material for independent color
        );
        this.mesh.position.set(x, 0.5, z);
        scene.add(this.mesh);
        
        // Add glowing trail effect with cloned material
        this.glow = new THREE.Mesh(
          projectileGeometryCache.bulletGlow, 
          projectileMaterialCache.bulletGlow.clone()  // Clone material for independent color
        );
        this.glow.position.copy(this.mesh.position);
        scene.add(this.glow);

        this.speed = 0.5; // Increased from 0.4 (25% faster)
        this.active = true;
        this.life = 60; // Frames
        this.maxLife = 60; // Track max life for color transition
        
        // Piercing support: track enemies already hit
        this.hitEnemies = new Set();
        this.maxHits = (playerStats.pierceCount || 0) + 1; // Total enemies this bullet can hit (1 + pierce count)

        // Calculate direction
        const dx = target.x - x;
        const dz = target.z - z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        this.vx = (dx / dist) * this.speed;
        this.vz = (dz / dist) * this.speed;
      }

      update() {
        if (!this.active) return;
        
        // Handle enemy projectiles separately
        if (this.isEnemyProjectile) {
          this.mesh.position.add(this.direction.clone().multiplyScalar(this.speed));
          this.lifetime--;
          
          if (this.lifetime <= 0) {
            this.destroy();
            return;
          }
          
          // Check collision with player
          const dx = this.mesh.position.x - player.mesh.position.x;
          const dz = this.mesh.position.z - player.mesh.position.z;
          if (dx*dx + dz*dz < 0.8) { // Hit radius
            player.takeDamage(this.damage);
            spawnParticles(player.mesh.position, 0xFF6347, 5);
            this.destroy();
            playSound('hit');
          }
          return;
        }
        
        // Player projectiles
        this.mesh.position.x += this.vx;
        this.mesh.position.z += this.vz;
        
        // Color transition: red-orange (start) → copper (end)
        // Progress: 1.0 (just fired) → 0.0 (about to expire)
        const progress = this.life / this.maxLife;
        
        // Red-orange: 0xFF4500 (RGB: 255, 69, 0)
        // Copper: 0xB87333 (RGB: 184, 115, 51)
        const startColor = { r: 255, g: 69, b: 0 };
        const endColor = { r: 184, g: 115, b: 51 };
        
        const r = Math.floor(startColor.r * progress + endColor.r * (1 - progress));
        const g = Math.floor(startColor.g * progress + endColor.g * (1 - progress));
        const b = Math.floor(startColor.b * progress + endColor.b * (1 - progress));
        
        const currentColor = (r << 16) | (g << 8) | b;
        this.mesh.material.color.setHex(currentColor);
        
        // Update glow position and fade it
        if (this.glow) {
          this.glow.position.copy(this.mesh.position);
          this.glow.material.opacity = 0.4 * (this.life / 60);
          // Also update glow color to match bullet
          this.glow.material.color.setHex(currentColor);
        }
        
        this.life--;

        if (this.life <= 0) {
          this.destroy();
          return;
        }

        // Collision Check - with piercing support
        for (let enemy of enemies) {
          if (enemy.isDead) continue;
          if (this.hitEnemies.has(enemy)) continue; // Skip already-hit enemies
          
          const dx = this.mesh.position.x - enemy.mesh.position.x;
          const dz = this.mesh.position.z - enemy.mesh.position.z;
          if (dx*dx + dz*dz < 0.6) { // Hit radius
            // Calculate Damage
            let dmg = weapons.gun.damage * playerStats.damage * playerStats.strength;
            
            // Double barrel uses its own damage
            if (weapons.doubleBarrel.active && this.isDoubleBarrel) {
              dmg = weapons.doubleBarrel.damage * playerStats.damage * playerStats.strength;
            }
            
            // Drone turret uses its own damage
            if (weapons.droneTurret.active && this.isDroneTurret) {
              dmg = weapons.droneTurret.damage * playerStats.damage * playerStats.strength;
            }
            
            // HEADSHOT SYSTEM: Double-crit check for headshot (instant kill)
            const isCrit = Math.random() < playerStats.critChance;
            const isDoubleCrit = isCrit && Math.random() < playerStats.critChance; // Second crit check
            
            if (isDoubleCrit && playerStats.headshotUnlocked) {
              // HEADSHOT! Instant kill
              enemy.hp = 0;
              
              // Create floating HEADSHOT text - THINNER FONT
              const div = document.createElement('div');
              div.style.position = 'absolute';
              div.style.color = '#FF0000';
              div.style.fontSize = '32px';
              div.style.fontWeight = '500'; // Reduced from 600 to 500 for thinner font
              div.style.fontFamily = 'Bangers, cursive';
              div.style.textShadow = '0 0 20px #FF0000, 2px 2px 4px #000';
              div.style.pointerEvents = 'none';
              div.style.zIndex = '1000';
              div.innerText = 'HEADSHOT!';
              
              const vec = enemy.mesh.position.clone();
              vec.y += 2;
              vec.project(camera);
              
              // Convert NDC (-1 to 1) to screen coordinates (0 to width/height)
              const NDC_CENTER_OFFSET = 0.5; // Offset to center NDC coordinates
              const x = (vec.x * NDC_CENTER_OFFSET + NDC_CENTER_OFFSET) * window.innerWidth;
              const y = (-(vec.y * NDC_CENTER_OFFSET) + NDC_CENTER_OFFSET) * window.innerHeight;
              
              div.style.left = `${x}px`;
              div.style.top = `${y}px`;
              div.style.transform = 'translate(-50%, -50%)';
              
              document.body.appendChild(div);
              setTimeout(() => div.remove(), 1500);
              
              // Blood particle effect
              spawnParticles(enemy.mesh.position, 0x8B0000, 30); // Dark red blood
              spawnParticles(enemy.mesh.position, 0xFF0000, 20); // Bright red blood
              
              // Flash effect
              const headshotLight = new THREE.PointLight(0xFF0000, 12, 20);
              headshotLight.position.copy(enemy.mesh.position);
              headshotLight.position.y += 2;
              scene.add(headshotLight);
              setTimeout(() => {
                scene.remove(headshotLight);
              }, 200);
            } else if (isCrit) {
              // Normal crit
              dmg *= playerStats.critDmg;
              enemy.takeDamage(Math.floor(dmg), isCrit);
              
              // FRESH: Critical hit effects - gold particles, brief light flash
              spawnParticles(enemy.mesh.position, 0xFFD700, 15); // Gold particles
              spawnParticles(enemy.mesh.position, 0xFFA500, 10); // Orange particles
              
              // Brief golden light flash
              const critLight = new THREE.PointLight(0xFFD700, 8, 15);
              critLight.position.copy(enemy.mesh.position);
              critLight.position.y += 1;
              scene.add(critLight);
              setTimeout(() => {
                scene.remove(critLight);
              }, 150);
            } else {
              // Normal hit (explicitly false for clarity)
              enemy.takeDamage(Math.floor(dmg), false);
            }
            
            // Knockback effect - scales with weapon level
            let knockbackForce = 0.5 * (1 + (weapons.gun.level - 1) * 0.25);
            if (weapons.doubleBarrel.active && this.isDoubleBarrel) {
              // Double barrel: heavy knockback with partial topple effect
              knockbackForce = 1.8 * (1 + (weapons.doubleBarrel.level - 1) * 0.2);
              // Topple: tilt enemy mesh briefly on impact
              const toppleAngle = (Math.random() - 0.5) * 0.6;
              enemy.mesh.rotation.x = toppleAngle;
              enemy.mesh.rotation.z = toppleAngle * 0.5;
              setTimeout(() => {
                if (enemy.mesh) { enemy.mesh.rotation.x = 0; enemy.mesh.rotation.z = 0; }
              }, 300);
            }
            enemy.mesh.position.x += this.vx * knockbackForce;
            enemy.mesh.position.z += this.vz * knockbackForce;
            
            // Water splash effect on hit
            spawnParticles(enemy.mesh.position, COLORS.player, 5);
            spawnParticles(enemy.mesh.position, 0xFFFFFF, 3);
            
            // Mark this enemy as hit
            this.hitEnemies.add(enemy);
            
            // Check if bullet should be destroyed or continue piercing
            if (this.hitEnemies.size >= this.maxHits) {
              // Hit maximum number of enemies, destroy bullet
              this.destroy();
              playSound('hit');
              break;
            } else {
              // Continue piercing (haven't reached max hits yet)
              playSound('hit');
              // Don't break - allow bullet to continue
            }
          }
        }
        
        // FRESH IMPLEMENTATION: Destructible Props Collision
        if (window.destructibleProps) {
          for (let prop of window.destructibleProps) {
            if (prop.destroyed) continue;
            const dx = this.mesh.position.x - prop.mesh.position.x;
            const dz = this.mesh.position.z - prop.mesh.position.z;
            if (dx*dx + dz*dz < 1.5) { // Hit radius for props
              // Calculate damage (use base weapon damage)
              let dmg = weapons.gun.damage * playerStats.damage * playerStats.strength * 0.5; // Half damage to props
              
              if (weapons.doubleBarrel.active && this.isDoubleBarrel) {
                dmg = weapons.doubleBarrel.damage * playerStats.damage * playerStats.strength * 0.5;
              }
              
              if (weapons.droneTurret.active && this.isDroneTurret) {
                dmg = weapons.droneTurret.damage * playerStats.damage * playerStats.strength * 0.5;
              }
              
              prop.hp -= dmg;
              
              // Visual damage stages
              const hpPercent = prop.hp / prop.maxHp;
              
              if (hpPercent <= 0.5 && hpPercent > 0.25 && !prop.darkenedStage1) {
                // 50% HP: Darken (only once)
                prop.darkenedStage1 = true;
                if (prop.type === 'tree') {
                  prop.mesh.userData.trunk.material.color.copy(prop.originalColor.trunk).multiplyScalar(0.8);
                  prop.mesh.userData.leaves.material.color.copy(prop.originalColor.leaves).multiplyScalar(0.8);
                } else {
                  prop.mesh.material.color.copy(prop.originalColor).multiplyScalar(0.8);
                }
              } else if (hpPercent <= 0.25 && hpPercent > 0 && !prop.darkenedStage2) {
                // 25% HP: Darken more + Shrink (only once)
                prop.darkenedStage2 = true;
                if (prop.type === 'tree') {
                  prop.mesh.userData.trunk.material.color.copy(prop.originalColor.trunk).multiplyScalar(0.6);
                  prop.mesh.userData.leaves.material.color.copy(prop.originalColor.leaves).multiplyScalar(0.6);
                } else {
                  prop.mesh.material.color.copy(prop.originalColor).multiplyScalar(0.6);
                }
                prop.mesh.scale.copy(prop.originalScale).multiplyScalar(0.8);
              } else if (prop.hp <= 0) {
                // 0 HP: Destroy with debris
                prop.destroyed = true;
                
                // Explosion effect based on type
                if (prop.type === 'barrel') {
                  // Barrel explodes
                  spawnParticles(prop.mesh.position, 0xFF4500, 30); // Orange explosion
                  spawnParticles(prop.mesh.position, 0xFFFF00, 15); // Yellow fire
                  playSound('hit');
                } else if (prop.type === 'tree') {
                  // Tree breaks apart
                  spawnParticles(prop.mesh.position, 0x8B4513, 20); // Brown wood
                  spawnParticles(prop.mesh.position, 0x228B22, 15); // Green leaves
                } else if (prop.type === 'crate') {
                  // Crate breaks
                  spawnParticles(prop.mesh.position, 0xD2691E, 20); // Wood particles
                }
                
                // Remove from scene
                scene.remove(prop.mesh);
                if (prop.mesh.userData.trunk) {
                  prop.mesh.userData.trunk.geometry.dispose();
                  prop.mesh.userData.trunk.material.dispose();
                  prop.mesh.userData.leaves.geometry.dispose();
                  prop.mesh.userData.leaves.material.dispose();
                } else {
                  prop.mesh.geometry.dispose();
                  prop.mesh.material.dispose();
                }
              } else {
                // Tree movement on hit (shake/sway from impact)
                if (prop.type === 'tree' && prop.mesh.userData.swayPhase !== undefined) {
                  // Add extra sway from bullet impact
                  prop.mesh.userData.swayAmount = Math.min(0.3, prop.mesh.userData.swayAmount + 0.1);
                  // Gradually reduce sway back to normal
                  setTimeout(() => {
                    if (!prop.destroyed && prop.mesh.userData.swayAmount) {
                      prop.mesh.userData.swayAmount = Math.max(0.05, prop.mesh.userData.swayAmount - 0.05);
                    }
                  }, 500);
                }
              }
              
              // Small particle effect on hit
              spawnParticles(prop.mesh.position, 0x888888, 3);
              
              this.destroy();
              break;
            }
          }
        }
        
        // FRESH: Fence collision - fences can be damaged and broken by bullets
        if (window.breakableFences) {
          for (let fence of window.breakableFences) {
            if (!fence.userData.isFence || fence.userData.hp <= 0) continue;
            const dx = this.mesh.position.x - fence.position.x;
            const dz = this.mesh.position.z - fence.position.z;
            if (dx*dx + dz*dz < 1.5) { // Hit radius
              // Damage fence
              const dmg = weapons.gun.damage * 0.3; // Fences take less damage
              fence.userData.hp -= dmg;
              
              // Shake effect on hit
              fence.rotation.x = (Math.random() - 0.5) * 0.3;
              fence.rotation.z = (Math.random() - 0.5) * 0.3;
              
              // Visual damage
              const hpPercent = fence.userData.hp / fence.userData.maxHp;
              if (hpPercent < 0.5) {
                fence.material.color.setHex(0x654321); // Darken when damaged
              }
              
              if (fence.userData.hp <= 0) {
                // Fence broken! Create debris
                spawnParticles(fence.position, 0x8B4513, 15); // Brown wood debris
                spawnParticles(fence.position, 0x654321, 10);
                
                // Animate fence falling
                const fallDirection = Math.random() < 0.5 ? 1 : -1;
                const startRotX = fence.rotation.x;
                const fallDuration = 500;
                const fallStart = Date.now();
                
                const fallInterval = setInterval(() => {
                  const elapsed = Date.now() - fallStart;
                  const progress = Math.min(elapsed / fallDuration, 1);
                  fence.rotation.x = startRotX + (Math.PI / 2) * progress * fallDirection;
                  fence.position.y = 1 - progress * 0.8; // Sink down
                  
                  if (progress >= 1) {
                    clearInterval(fallInterval);
                    scene.remove(fence);
                    fence.geometry.dispose();
                    fence.material.dispose();
                  }
                }, 16);
              }
              
              // Bullet destroyed on fence hit
              this.destroy();
              playSound('hit');
              break;
            }
          }
        }
      }

      destroy() {
        this.active = false;
        scene.remove(this.mesh);
        // Dispose cloned materials (not geometry, which is shared)
        if (this.mesh.material) {
          this.mesh.material.dispose();
        }
        
        // Remove glow if it exists
        if (this.glow) {
          scene.remove(this.glow);
          // Dispose cloned glow material
          if (this.glow.material) {
            this.glow.material.dispose();
          }
        }
      }
    }

    class SwordSlash {
      constructor(x, z, angle) {
        // Arc geometry
        const geometry = new THREE.RingGeometry(1.5, 2.5, 8, 1, -Math.PI/4, Math.PI/2);
        const material = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.rotation.z = angle - Math.PI/4; // Adjust for arc center
        this.mesh.position.set(x, 0.6, z);
        scene.add(this.mesh);
        
        this.life = 10; // frames
        this.maxLife = 10;
        
        // Deal damage immediately
        const dmg = weapons.sword.damage * playerStats.strength * playerStats.damage;
        
        enemies.forEach(e => {
          const dx = e.mesh.position.x - x;
          const dz = e.mesh.position.z - z;
          const dist = Math.sqrt(dx*dx + dz*dz);
          
          if (dist < 3.5) {
            // Check angle
            const eAngle = Math.atan2(dz, dx); // -PI to PI
            // Normalize angles
            let diff = eAngle - angle;
            while (diff < -Math.PI) diff += Math.PI*2;
            while (diff > Math.PI) diff -= Math.PI*2;
            
            if (Math.abs(diff) < Math.PI/3) {
              e.takeDamage(dmg);
            }
          }
        });
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

    class IceSpear {
      constructor(x, z, target) {
        // Ice spear shape - elongated diamond
        const geometry = new THREE.ConeGeometry(0.15, 0.6, 4);
        const material = new THREE.MeshBasicMaterial({ color: 0x87CEEB, transparent: true, opacity: 0.9 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, 0.5, z);
        scene.add(this.mesh);

        this.speed = 0.35;
        this.active = true;
        this.life = 70; // Frames - longer range than normal projectile

        // Calculate direction
        const dx = target.x - x;
        const dz = target.z - z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        this.vx = (dx / dist) * this.speed;
        this.vz = (dz / dist) * this.speed;
        
        // Rotate spear to face direction
        this.mesh.rotation.z = -Math.atan2(dz, dx) + Math.PI/2;
        this.mesh.rotation.x = Math.PI/2;
        
        // Trailing particles
        this.particleTimer = 0;
      }

      update() {
        if (!this.active) return false;
        
        this.mesh.position.x += this.vx;
        this.mesh.position.z += this.vz;
        this.life--;
        
        // Ice trail particles
        this.particleTimer++;
        if (this.particleTimer % 3 === 0) {
          spawnParticles(this.mesh.position, 0x87CEEB, 2);
        }

        if (this.life <= 0) {
          this.destroy();
          return false;
        }

        // Collision Check
        for (let enemy of enemies) {
          if (enemy.isDead) continue;
          const dx = this.mesh.position.x - enemy.mesh.position.x;
          const dz = this.mesh.position.z - enemy.mesh.position.z;
          if (dx*dx + dz*dz < 0.6) {
            // Calculate Damage
            let dmg = weapons.iceSpear.damage * playerStats.damage * playerStats.strength;
            const isCrit = Math.random() < playerStats.critChance;
            if (isCrit) dmg *= playerStats.critDmg;
            
            enemy.takeDamage(Math.floor(dmg), isCrit);
            
            // Apply slow effect
            if (!enemy.slowedUntil || enemy.slowedUntil < Date.now()) {
              enemy.originalSpeed = enemy.speed;
            }
            enemy.slowedUntil = Date.now() + weapons.iceSpear.slowDuration;
            enemy.speed = enemy.originalSpeed * (1 - weapons.iceSpear.slowPercent);
            
            // Ice impact particles
            spawnParticles(enemy.mesh.position, 0x87CEEB, 8);
            spawnParticles(enemy.mesh.position, 0xFFFFFF, 5);
            
            // Visual ice effect on enemy
            if (enemy.mesh.material.color) {
              const originalColor = enemy.mesh.material.color.getHex();
              enemy.mesh.material.color.setHex(0xADD8E6); // Light blue
              setTimeout(() => {
                if (enemy.mesh.material.color) {
                  enemy.mesh.material.color.setHex(originalColor);
                }
              }, 200);
            }
            
            this.destroy();
            playSound('hit');
            break;
          }
        }
        return true;
      }

      destroy() {
        this.active = false;
        scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
      }
    }

    class Meteor {
      constructor(targetX, targetZ) {
        this.target = new THREE.Vector3(targetX, 0, targetZ);
        
        // Falling sphere
        const geo = new THREE.DodecahedronGeometry(1.5);
        const mat = new THREE.MeshToonMaterial({ color: 0xFF4500, emissive: 0x8B0000 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(targetX, 20, targetZ);
        scene.add(this.mesh);
        
        // Shadow indicator
        const shadowGeo = new THREE.CircleGeometry(2.5, 16);
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.3, transparent: true });
        this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
        this.shadow.rotation.x = -Math.PI/2;
        this.shadow.position.set(targetX, 0.1, targetZ);
        scene.add(this.shadow);
        
        this.speed = 0.5;
        this.active = true;
      }
      
      update() {
        if (!this.active) return false;
        
        this.mesh.position.y -= this.speed;
        this.speed += 0.05; // Gravity
        
        if (this.mesh.position.y <= 0) {
          this.explode();
          return false;
        }
        return true;
      }
      
      explode() {
        this.active = false;
        scene.remove(this.mesh);
        scene.remove(this.shadow);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.shadow.geometry.dispose();
        this.shadow.material.dispose();
        
        // AOE Damage with knockback
        const range = weapons.meteor.area;
        const dmg = weapons.meteor.damage * playerStats.strength;
        
        enemies.forEach(e => {
          const d = e.mesh.position.distanceTo(this.target);
          if (d < range) {
            e.takeDamage(dmg);
            
            // Apply knockback to enemies
            const knockbackDir = new THREE.Vector3(
              e.mesh.position.x - this.target.x,
              0,
              e.mesh.position.z - this.target.z
            ).normalize();
            
            // Knockback strength inversely proportional to distance
            const knockbackStrength = (1 - d / range) * GAME_CONFIG.meteorKnockbackMultiplier;
            e.mesh.position.x += knockbackDir.x * knockbackStrength;
            e.mesh.position.z += knockbackDir.z * knockbackStrength;
            
            // Add visual bounce effect
            const originalY = e.mesh.position.y;
            e.mesh.position.y = originalY + 0.5 * (1 - d / range);
            setTimeout(() => {
              e.mesh.position.y = originalY;
            }, 200);
          }
        });
        
        // Enhanced visuals - thinner, more realistic explosion
        spawnParticles(this.target, 0xFF4500, 8); // Reduced count for thinner look
        spawnParticles(this.target, 0xFFFF00, 4);
        spawnParticles(this.target, 0xFF8C00, 6); // Dark orange
        spawnMuzzleSmoke(this.target, 10); // Add smoke cloud
        
        // Camera shake for explosion
        const shakeIntensity = GAME_CONFIG.explosionShakeIntensity;
        const originalCameraPos = camera.position.clone();
        let shakeTime = 0;
        const shakeDuration = 0.3;
        
        const shakeAnim = () => {
          shakeTime += 0.016;
          if (shakeTime < shakeDuration) {
            const intensity = (1 - shakeTime / shakeDuration) * shakeIntensity;
            camera.position.x = originalCameraPos.x + (Math.random() - 0.5) * intensity;
            camera.position.y = originalCameraPos.y + (Math.random() - 0.5) * intensity;
            camera.position.z = originalCameraPos.z + (Math.random() - 0.5) * intensity;
            requestAnimationFrame(shakeAnim);
          } else {
            camera.position.copy(originalCameraPos);
          }
        };
        shakeAnim();
        
        playSound('meteor'); // Explosive boom sound
      }
    }

    // Phase 5: Object Pooling System for Particles (Performance Critical)
    class ObjectPool {
      constructor(createFn, resetFn, initialSize = 100) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.pool = [];
        this.activeSet = new Set(); // Use Set for O(1) lookups instead of array
        
        // Pre-allocate initial pool
        for (let i = 0; i < initialSize; i++) {
          this.pool.push(this.createFn());
        }
      }
      
      get() {
        let obj;
        if (this.pool.length > 0) {
          obj = this.pool.pop();
        } else {
          obj = this.createFn();
        }
        this.activeSet.add(obj);
        return obj;
      }
      
      release(obj) {
        if (this.activeSet.has(obj)) {
          this.activeSet.delete(obj);
          this.resetFn(obj);
          this.pool.push(obj);
        }
      }
      
      clear() {
        // Clean up all objects
        for (const obj of this.activeSet) {
          if (obj.mesh && obj.mesh.parent) {
            scene.remove(obj.mesh);
          }
        }
        this.activeSet.clear();
      }
    }

    class Particle {
      static MAX_LIFETIME = 28; // Lifetime in frames before removal
      static INITIAL_OPACITY = 0.92; // Maximum opacity for particles
      static VEL_XZ_RANGE = 0.35; // Horizontal velocity spread
      static VEL_Y_MIN = 0.08;    // Minimum upward velocity
      static VEL_Y_RANGE = 0.5;   // Additional random upward velocity
      
      constructor(pos, color) {
        const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
        const mat = new THREE.MeshStandardMaterial({ 
          color: color,
          transparent: true,
          opacity: Particle.INITIAL_OPACITY,
          emissive: color,
          emissiveIntensity: 0.5,
          roughness: 0.5,
          metalness: 0.15
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(pos);
        
        this.vel = new THREE.Vector3(
          (Math.random() - 0.5) * Particle.VEL_XZ_RANGE,
          Particle.VEL_Y_MIN + Math.random() * Particle.VEL_Y_RANGE,
          (Math.random() - 0.5) * Particle.VEL_XZ_RANGE
        );
        
        scene.add(this.mesh);
        this.life = Particle.MAX_LIFETIME;
      }
      
      reset(pos, color) {
        // Reuse existing particle
        this.mesh.position.copy(pos);
        this.mesh.material.color.setHex(color);
        this.mesh.material.emissive.setHex(color);
        // Blood particles (dark red) get smaller, faster, more splatter-like behavior
        const isBlood = (color === 0x8B0000 || color === 0x6B0000);
        const velScale = isBlood ? 1.5 : 1.0;
        this.vel.set(
          (Math.random() - 0.5) * Particle.VEL_XZ_RANGE * velScale,
          (isBlood ? 0.05 : Particle.VEL_Y_MIN) + Math.random() * Particle.VEL_Y_RANGE * (isBlood ? 0.5 : 1.0),
          (Math.random() - 0.5) * Particle.VEL_XZ_RANGE * velScale
        );
        // Blood particles should be smaller scale
        const sizeScale = isBlood ? 0.4 + Math.random() * 0.4 : 1.0;
        this.mesh.scale.setScalar(sizeScale);
        this.mesh.rotation.set(0, 0, 0);
        this.mesh.visible = true;
        scene.add(this.mesh);
        this.life = isBlood ? Math.floor(Particle.MAX_LIFETIME * 0.6) : Particle.MAX_LIFETIME;
      }
      
      update() {
        this.life--;
        this.mesh.position.add(this.vel);
        this.vel.y -= 0.02; // Gravity
        this.mesh.rotation.x += 0.1;
        this.mesh.rotation.y += 0.1;
        
        // Fade out based on life remaining (more realistic smoke/fog effect)
        this.mesh.material.opacity = (this.life / Particle.MAX_LIFETIME) * Particle.INITIAL_OPACITY;
        
        if (this.mesh.position.y < 0) {
          this.mesh.position.y = 0;
          this.vel.y = 0;
          this.vel.x *= 0.8;
          this.vel.z *= 0.8;
        }
        
        if (this.life <= 0) {
          scene.remove(this.mesh);
          this.mesh.visible = false;
          this.mesh.scale.setScalar(1); // Reset scale for pool reuse
          return false;
        }
        return true;
      }
      
      dispose() {
        // Only called on final cleanup
        if (this.mesh) {
          scene.remove(this.mesh);
          this.mesh.geometry.dispose();
          this.mesh.material.dispose();
        }
      }
    }

    // Shared star geometry for all ExpGem instances (created once, reused for performance)
    let _expGemStarGeometry = null;
    let _expGemStarMaterial = null;
    let _expGemOutlineGeometry = null; // Shared outline geometry (created once, reused for performance)

    class ExpGem {
      constructor(x, z) {
        // Use shared star geometry (created once)
        if (!_expGemStarGeometry) {
          const starPoints = 5;
          const outerR = 0.28;
          const innerR = 0.12;
          const starShape = new THREE.Shape();
          for (let i = 0; i < starPoints * 2; i++) {
            const angle = (i / (starPoints * 2)) * Math.PI * 2 - Math.PI / 2;
            const r = i % 2 === 0 ? outerR : innerR;
            if (i === 0) starShape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
            else starShape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
          }
          starShape.closePath();
          const extrudeSettings = { depth: 0.10, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 };
          _expGemStarGeometry = new THREE.ExtrudeGeometry(starShape, extrudeSettings);
          _expGemStarGeometry.center();
          _expGemStarMaterial = new THREE.MeshStandardMaterial({
            color: 0x1E90FF,      // SM64-style blue star
            emissive: 0x0055CC,   // Deep blue glow
            emissiveIntensity: 0.7,
            metalness: 0.5,
            roughness: 0.2
          });
        }

        // Each gem gets its own material clone for per-instance emissive animation
        const starMaterial = _expGemStarMaterial.clone();

        this.mesh = new THREE.Mesh(_expGemStarGeometry, starMaterial);
        this.mesh.position.set(x, 0.5, z);

        // SM64-style: add black outline ring and yellow-edge highlight using a slightly larger dark mesh
        // Outline geometry is shared across all ExpGem instances (created once)
        if (!_expGemOutlineGeometry) {
          const s = new THREE.Shape();
          const pts = 5, outerO = 0.33, innerO = 0.14;
          for (let i = 0; i < pts * 2; i++) {
            const ang = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
            const r = i % 2 === 0 ? outerO : innerO;
            if (i === 0) s.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
            else s.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
          }
          s.closePath();
          _expGemOutlineGeometry = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false });
          _expGemOutlineGeometry.center();
        }
        const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const outlineMesh = new THREE.Mesh(_expGemOutlineGeometry, outlineMat);
        outlineMesh.position.z = -0.01;
        this._outlineMat = outlineMat; // Store per-instance material for disposal
        this.mesh.add(outlineMesh);

        scene.add(this.mesh);

        this.active = true;
        // Spin fast on Y axis (star spinning over its axis as required)
        this.rotSpeedY = (Math.random() * 0.15 + 0.10) * (Math.random() < 0.5 ? 1 : -1);
        this.bobPhase = Math.random() * Math.PI * 2;
        this.sparklePhase = Math.random() * Math.PI * 2;
        this.value = GAME_CONFIG.expValue;
      }

      update(playerPos) {
        if (!this.active) return;

        // Spin star over its Y axis (fast)
        this.mesh.rotation.y += this.rotSpeedY;

        // Bob up and down
        this.bobPhase += 0.05;
        this.mesh.position.y = 0.5 + Math.sin(this.bobPhase) * 0.1;
        
        // Pulsing gold glow
        this.sparklePhase += 0.1;
        this.mesh.material.emissiveIntensity = 0.5 + Math.sin(this.sparklePhase) * 0.3;

        // Magnet
        const dx = playerPos.x - this.mesh.position.x;
        const dz = playerPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        if (dist < magnetRange) { // Use magnetRange variable
          this.mesh.position.x += (dx / dist) * 0.3;
          this.mesh.position.z += (dz / dist) * 0.3;
          
          // Visual Trail when pulled - blue particles with sparkle (PR #117)
          if (Math.random() < 0.3) {
             spawnParticles(this.mesh.position, 0x3498DB, 1);
          }
        }

        if (dist < 0.8) { // Collect
          this.collect();
        }
      }

      collect() {
        this.active = false;
        
        // SPLASH EFFECT: use pooled particles to avoid per-gem geometry/material allocation
        // and eliminate 20 separate requestAnimationFrame callbacks per gem (PR #117)
        spawnParticles(this.mesh.position, 0x3498DB, 8);
        
        // Screen flash effect - blue tint (PR #117)
        const flash = document.createElement('div');
        flash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(52,152,219,0.2);pointer-events:none;z-index:500';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 100);
        
        scene.remove(this.mesh);
        // Geometry is shared across all ExpGem instances - do not dispose it
        this.mesh.material.dispose(); // Only dispose the per-instance cloned material
        if (this._outlineMat) this._outlineMat.dispose(); // Dispose per-instance outline material
        
        addExp(this.value);
        playSound('collect');
      }
    }
    // Different gold drop types based on amount
    class GoldCoin {
      constructor(x, z, amount) {
        this.amount = amount;
        this.active = true;
        this.magnetRange = 4;
        this.collectRange = 0.8;
        this.vx = 0;
        this.vz = 0;
        this.wobblePhase = Math.random() * Math.PI * 2;
        this.bounceTime = 0;
        
        // Create appropriate visual based on amount
        if (amount >= 50) {
          // 50+ gold: Gold chest glowing from inside
          this.createGoldChest(x, z);
        } else if (amount >= 25) {
          // 25+ gold: Leather bag with knot
          this.createLeatherBag(x, z);
        } else if (amount >= 10) {
          // 10 coins: 3 spinning coins around center
          this.createMultipleCoins(x, z, 3);
        } else {
          // 5 coins: 1 spinning gold coin
          this.createSingleCoin(x, z);
        }
        
        // Play gold drop sound
        playSound('coinDrop');
        
        // Spawn sparkles on creation
        spawnParticles(this.mesh ? this.mesh.position : new THREE.Vector3(x, 0.3, z), 0xFFD700, 8);
        spawnParticles(this.mesh ? this.mesh.position : new THREE.Vector3(x, 0.3, z), 0xFFFFFF, 2);
      }
      
      createSingleCoin(x, z) {
        // Single large spinning coin
        const geometry = new THREE.CylinderGeometry(0.3, 0.3, 0.12, 16);
        const material = new THREE.MeshPhysicalMaterial({ 
          color: 0xFFD700,
          transparent: true,
          opacity: 0.95,
          metalness: 0.9,
          roughness: 0.1,
          emissive: 0xFFAA00,
          emissiveIntensity: 0.3
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, 0.4, z);
        this.mesh.rotation.x = Math.PI / 2;
        scene.add(this.mesh);
        this.type = 'single';
      }
      
      createMultipleCoins(x, z, count) {
        // Multiple coins orbiting around center
        this.coins = [];
        this.centerPos = new THREE.Vector3(x, 0.4, z);
        const radius = 0.4;
        
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const geometry = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 12);
          const material = new THREE.MeshPhysicalMaterial({ 
            color: 0xFFD700,
            transparent: true,
            opacity: 0.95,
            metalness: 0.9,
            roughness: 0.1,
            emissive: 0xFFAA00,
            emissiveIntensity: 0.3
          });
          const coin = new THREE.Mesh(geometry, material);
          coin.position.set(
            x + Math.cos(angle) * radius,
            0.4,
            z + Math.sin(angle) * radius
          );
          coin.rotation.x = Math.PI / 2;
          scene.add(coin);
          this.coins.push({ mesh: coin, angle: angle });
        }
        this.mesh = this.coins[0].mesh; // Reference for position
        this.type = 'multiple';
        this.orbitSpeed = 0.05;
      }
      
      createLeatherBag(x, z) {
        // Leather bag with knot - using sphere for bag, smaller sphere for knot
        const group = new THREE.Group();
        
        // Bag body
        const bagGeo = new THREE.SphereGeometry(0.35, 16, 16);
        bagGeo.scale(1, 1.2, 1); // Slightly taller
        const bagMat = new THREE.MeshPhysicalMaterial({ 
          color: 0x8B4513, // Brown leather
          transparent: true,
          opacity: 0.95,
          metalness: 0.1,
          roughness: 0.9
        });
        const bag = new THREE.Mesh(bagGeo, bagMat);
        bag.position.y = 0;
        group.add(bag);
        
        // Knot at top
        const knotGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const knotMat = new THREE.MeshBasicMaterial({ color: 0x654321 }); // Darker brown
        const knot = new THREE.Mesh(knotGeo, knotMat);
        knot.position.y = 0.35;
        group.add(knot);
        
        // Gold coins texture (simple circles on the bag)
        const coinGeo = new THREE.CircleGeometry(0.08, 8);
        const coinMat = new THREE.MeshBasicMaterial({ 
          color: 0xFFD700,
          side: THREE.DoubleSide
        });
        for (let i = 0; i < 3; i++) {
          const coin = new THREE.Mesh(coinGeo, coinMat);
          const angle = (i / 3) * Math.PI * 2;
          coin.position.set(
            Math.cos(angle) * 0.25,
            -0.1 + Math.random() * 0.2,
            Math.sin(angle) * 0.25
          );
          coin.lookAt(group.position);
          group.add(coin);
        }
        
        group.position.set(x, 0.4, z);
        scene.add(group);
        this.mesh = group;
        this.type = 'bag';
      }
      
      createGoldChest(x, z) {
        // Gold chest glowing from inside
        const group = new THREE.Group();
        
        // Chest body
        const chestGeo = new THREE.BoxGeometry(0.5, 0.4, 0.4);
        const chestMat = new THREE.MeshPhysicalMaterial({ 
          color: 0xFFD700,
          transparent: true,
          opacity: 0.95,
          metalness: 0.9,
          roughness: 0.2,
          emissive: 0xFFD700,
          emissiveIntensity: 0.5
        });
        const chest = new THREE.Mesh(chestGeo, chestMat);
        chest.position.y = 0;
        group.add(chest);
        
        // Chest lid (slightly open)
        const lidGeo = new THREE.BoxGeometry(0.52, 0.1, 0.42);
        const lidMat = new THREE.MeshPhysicalMaterial({ 
          color: 0xDAA520, // Goldenrod
          metalness: 0.8,
          roughness: 0.3,
          emissive: 0xFFD700,
          emissiveIntensity: 0.3
        });
        const lid = new THREE.Mesh(lidGeo, lidMat);
        lid.position.set(0, 0.25, -0.1);
        lid.rotation.x = -0.3; // Slightly open
        group.add(lid);
        
        // Inner glow light
        const glowLight = new THREE.PointLight(0xFFD700, 2, 3);
        glowLight.position.set(0, 0.1, 0);
        group.add(glowLight);
        this.glowLight = glowLight;
        
        group.position.set(x, 0.4, z);
        scene.add(group);
        this.mesh = group;
        this.type = 'chest';
      }
      
      update(playerPos) {
        if (!this.active) return;
        
        // Type-specific animations
        if (this.type === 'single') {
          // Single coin spinning
          this.mesh.rotation.y += 0.15;
        } else if (this.type === 'multiple') {
          // Multiple coins orbiting and spinning
          this.coins.forEach((coinData, i) => {
            coinData.angle += this.orbitSpeed;
            const radius = 0.4;
            coinData.mesh.position.x = this.centerPos.x + Math.cos(coinData.angle) * radius;
            coinData.mesh.position.z = this.centerPos.z + Math.sin(coinData.angle) * radius;
            coinData.mesh.rotation.y += 0.15;
            
            // Update Y position for bouncing
            if (this.bounceTime < 1) {
              coinData.mesh.position.y = 0.4 + Math.abs(Math.sin(this.bounceTime * Math.PI * 3)) * 0.5 * (1 - this.bounceTime);
            } else {
              const baseY = 0.3;
              coinData.mesh.position.y = baseY + Math.sin(this.wobblePhase) * 0.1;
            }
          });
        } else if (this.type === 'bag') {
          // Bag swaying
          this.mesh.rotation.z = Math.sin(this.wobblePhase) * 0.1;
          this.wobblePhase += 0.05;
        } else if (this.type === 'chest') {
          // Chest glowing pulse
          if (this.glowLight) {
            this.glowLight.intensity = 2 + Math.sin(this.wobblePhase * 2) * 0.5;
          }
          this.wobblePhase += 0.05;
        }
        
        // Bounce physics on spawn (for single, bag, chest types)
        if (this.type !== 'multiple') {
          if (this.bounceTime < 1) {
            this.mesh.position.y = 0.4 + Math.abs(Math.sin(this.bounceTime * Math.PI * 3)) * 0.5 * (1 - this.bounceTime);
            this.bounceTime += 0.02;
          } else {
            // Wobble after bounce
            this.wobblePhase += 0.05;
            const baseY = this.type === 'chest' || this.type === 'bag' ? 0.4 : 0.3;
            this.mesh.position.y = baseY + Math.sin(this.wobblePhase) * 0.1;
          }
        } else {
          // Multiple coins handle bounce in their loop
          if (this.bounceTime < 1) {
            this.bounceTime += 0.02;
          } else {
            this.wobblePhase += 0.05;
          }
        }
        
        // NO MAGNET - player must walk over gold to collect it
        const dx = playerPos.x - this.mesh.position.x;
        const dz = playerPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        // Collect ONLY when player is very close
        if (dist < this.collectRange) {
          addGold(this.amount);
          playSound('coin');
          
          // Gold collect particles - 20 sparkles + flash
          spawnParticles(this.mesh.position, 0xFFD700, 8); // Reduced for performance
          spawnParticles(this.mesh.position, 0xFFFFFF, 3); // Reduced for performance
          
          // Flash effect - bright point light
          const flashLight = new THREE.PointLight(0xFFD700, 4, 8);
          flashLight.position.copy(this.mesh.position);
          flashLight.position.y += 1;
          scene.add(flashLight);
          flashLights.push(flashLight);
          const timeoutId = setTimeout(() => {
            scene.remove(flashLight);
            const idx = flashLights.indexOf(flashLight);
            if (idx > -1) flashLights.splice(idx, 1);
            const tidx = activeTimeouts.indexOf(timeoutId);
            if (tidx > -1) activeTimeouts.splice(tidx, 1);
          }, 100);
          activeTimeouts.push(timeoutId);
          
          this.destroy();
        }
      }
      
      destroy() {
        this.active = false;
        
        if (this.type === 'multiple' && this.coins) {
          // Clean up multiple coins
          this.coins.forEach(coinData => {
            scene.remove(coinData.mesh);
            coinData.mesh.geometry.dispose();
            coinData.mesh.material.dispose();
          });
        } else if (this.mesh) {
          // Clean up single mesh or group
          if (this.glowLight) {
            this.mesh.remove(this.glowLight);
          }
          scene.remove(this.mesh);
          
          // Dispose geometries and materials recursively
          this.mesh.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(mat => mat.dispose());
              } else {
                child.material.dispose();
              }
            }
          });
        }
      }
    }

    class Chest {
      constructor(x, z, tier = 'common') {
        this.tier = tier;
        
        // Define chest tier properties
        const tierProps = {
          common: {
            bodyColor: 0x8B7355,    // Brown
            lidColor: 0xC0C0C0,     // Silver
            emissive: 0xFFFFFF,     // White
            lightColor: 0xFFFFFF,   // White light
            particleColor: 0xFFFFFF, // White particles
            intensity: 1.0
          },
          uncommon: {
            bodyColor: 0x4A7C59,    // Dark Green
            lidColor: 0x6B8E23,     // Olive Green
            emissive: 0x00FF00,     // Green
            lightColor: 0x00FF00,   // Green light
            particleColor: 0x00FF00, // Green particles
            intensity: 1.3
          },
          rare: {
            bodyColor: 0x4169E1,    // Royal Blue
            lidColor: 0x1E90FF,     // Dodger Blue
            emissive: 0x0080FF,     // Blue
            lightColor: 0x0080FF,   // Blue light
            particleColor: 0x0080FF, // Blue particles
            intensity: 1.6
          },
          epic: {
            bodyColor: 0x8B00FF,    // Purple
            lidColor: 0xDA70D6,     // Orchid
            emissive: 0xA020F0,     // Purple
            lightColor: 0xA020F0,   // Purple light
            particleColor: 0xA020F0, // Purple particles
            intensity: 2.0
          },
          mythical: {
            bodyColor: 0xFF4500,    // Orange-Red
            lidColor: 0xFF6347,     // Tomato
            emissive: 0xFF0000,     // Red
            lightColor: 0xFF8C00,   // Dark Orange
            particleColor: 0xFF0000, // Red particles
            intensity: 2.5
          }
        };
        
        const props = tierProps[tier] || tierProps.common;
        
        // Create chest mesh - simple box with tier-specific color
        const geometry = new THREE.BoxGeometry(0.8, 0.6, 0.6);
        const material = new THREE.MeshPhysicalMaterial({ 
          color: props.bodyColor,
          metalness: 0.7,
          roughness: 0.3,
          emissive: props.emissive,
          emissiveIntensity: 0.2
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, 0.3, z);
        scene.add(this.mesh);
        
        // Add lid (different color)
        const lidGeo = new THREE.BoxGeometry(0.85, 0.1, 0.65);
        const lidMat = new THREE.MeshPhysicalMaterial({ 
          color: props.lidColor,
          metalness: 0.8,
          roughness: 0.2
        });
        this.lid = new THREE.Mesh(lidGeo, lidMat);
        this.lid.position.set(0, 0.35, 0);
        this.mesh.add(this.lid);
        
        this.active = true;
        this.opened = false;
        this.collectRange = 1.5;
        this.wobblePhase = Math.random() * Math.PI * 2;
        
        // Spawn sparkles around chest with tier-specific colors
        spawnParticles(this.mesh.position, props.particleColor, 8); // Reduced for performance
        spawnParticles(this.mesh.position, 0xFFFFFF, 4); // Reduced for performance
        
        // Add glowing light effect with tier-specific color
        const glowLight = new THREE.PointLight(props.lightColor, props.intensity, 6);
        glowLight.position.copy(this.mesh.position);
        glowLight.position.y += 0.5;
        scene.add(glowLight);
        this.glowLight = glowLight;
      }
      
      update(playerPos) {
        if (!this.active) return;
        
        // Bobbing animation
        this.wobblePhase += 0.05;
        this.mesh.position.y = 0.3 + Math.sin(this.wobblePhase) * 0.1;
        
        // Slow rotation
        this.mesh.rotation.y += 0.01;
        
        // Update glow light position
        if (this.glowLight) {
          this.glowLight.position.copy(this.mesh.position);
          this.glowLight.position.y += 0.5;
          // Pulsing glow
          this.glowLight.intensity = 1.5 + Math.sin(this.wobblePhase * 2) * 0.5;
        }
        
        // Check if player is close enough to open
        const dx = playerPos.x - this.mesh.position.x;
        const dz = playerPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        if (dist < this.collectRange && !this.opened) {
          this.open();
        }
      }
      
      open() {
        this.opened = true;
        
        // Animate lid opening
        let openProgress = 0;
        const animateLid = () => {
          openProgress += 0.05;
          if (openProgress < 1) {
            this.lid.rotation.x = -openProgress * Math.PI * 0.7; // Open 70%
            this.lid.position.z = -openProgress * 0.2; // Slide back slightly
            requestAnimationFrame(animateLid);
          }
        };
        animateLid();
        
        // Play sound and effects
        playSound('coin'); // Reuse coin sound
        
        // Explosion of particles
        spawnParticles(this.mesh.position, 0xFFD700, 15); // Reduced for performance
        spawnParticles(this.mesh.position, 0xFFFFFF, 8); // Reduced for performance
        spawnParticles(this.mesh.position, 0xFF69B4, 5); // Reduced for performance
        
        // Flash effect
        const flashLight = new THREE.PointLight(0xFFD700, 8, 15);
        flashLight.position.copy(this.mesh.position);
        flashLight.position.y += 2;
        scene.add(flashLight);
        flashLights.push(flashLight);
        const timeoutId = setTimeout(() => {
          scene.remove(flashLight);
          const idx = flashLights.indexOf(flashLight);
          if (idx > -1) flashLights.splice(idx, 1);
          const tidx = activeTimeouts.indexOf(timeoutId);
          if (tidx > -1) activeTimeouts.splice(tidx, 1);
        }, 200);
        activeTimeouts.push(timeoutId);
        
        // Give player reward
        this.giveReward();
        
        // Remove chest after short delay
        const destroyTimeoutId = setTimeout(() => {
          this.destroy();
        }, 2000);
        activeTimeouts.push(destroyTimeoutId);
      }
      
      giveReward() {
        // Determine reward type
        const rand = Math.random();
        
        if (rand < 0.35) {
          // Health restore (35% chance)
          const healAmount = 50;
          const prevHp = playerStats.hp;
          playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + healAmount);
          const actualHeal = playerStats.hp - prevHp;
          createFloatingText(`+${actualHeal} HP!`, this.mesh.position);
          showStatChange(`Chest: +${actualHeal} HP!`);
          spawnParticles(this.mesh.position, 0xFF69B4, 10); // Reduced for performance
        } else if (rand < 0.6) {
          // Gold (25% chance)
          const goldAmount = 12 + Math.floor(Math.random() * 19); // 12-30 gold (reduced from 20-50)
          addGold(goldAmount);
          createFloatingText(`+${goldAmount} Gold!`, this.mesh.position);
          showStatChange(`Chest: +${goldAmount} Gold!`);
        } else if (rand < 0.85) {
          // Random perk/stat boost (25% chance)
          this.applyRandomPerk();
        } else {
          // Weapon attachment or upgrade hint (15% chance)
          createFloatingText('Weapon Enhanced!', this.mesh.position);
          // Apply a small weapon boost - check if weapon exists
          if (weapons && weapons.gun && weapons.gun.active) {
            weapons.gun.damage += 5;
            showStatChange('Chest: Gun Damage +5');
          }
        }
      }
      
      applyRandomPerk() {
        const perks = [
          { name: 'Speed Boost', apply: () => { 
            // Cap max speed at 2x initial walkSpeed (50) to prevent breaking physics
            const maxWalkSpeed = 50; // 2x the initial 25
            if (playerStats.walkSpeed < maxWalkSpeed) {
              playerStats.walkSpeed *= 1.1;
              showStatChange('Chest: +10% Move Speed');
            } else {
              showStatChange('Chest: Max Speed Reached');
            }
          }},
          { name: 'Damage Boost', apply: () => { 
            playerStats.strength += 0.1;
            showStatChange('Chest: +10% Damage');
          }},
          { name: 'Health Boost', apply: () => { 
            playerStats.maxHp += 20;
            playerStats.hp += 20;
            showStatChange('Chest: +20 Max HP');
          }},
          { name: 'Armor Boost', apply: () => { 
            playerStats.armor = Math.min(80, playerStats.armor + 8);
            showStatChange('Chest: +8% Armor');
          }},
          { name: 'Attack Speed', apply: () => {
            // Cap minimum cooldown at 300ms to prevent performance issues
            if (weapons.gun.cooldown > 300) {
              weapons.gun.cooldown *= 0.9;
              showStatChange('Chest: +10% Attack Speed');
            } else {
              showStatChange('Chest: Max Attack Speed');
            }
          }}
        ];
        
        const perk = perks[Math.floor(Math.random() * perks.length)];
        perk.apply();
        createFloatingText(perk.name + '!', this.mesh.position);
      }
      
      destroy() {
        this.active = false;
        scene.remove(this.mesh);
        if (this.glowLight) {
          scene.remove(this.glowLight);
        }
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        if (this.lid) {
          this.lid.geometry.dispose();
          this.lid.material.dispose();
        }
      }
    }

    // --- NOTIFICATION/INBOX SYSTEM ---
    const notifications = [];
    const inventory = [];
    const RARITY = {
      COMMON: { name: 'Common', color: 0xAAAAAA, multiplier: 1.0 },
      RARE: { name: 'Rare', color: 0x5DADE2, multiplier: 1.25 },
      EPIC: { name: 'Epic', color: 0x9B59B6, multiplier: 1.5 },
      LEGENDARY: { name: 'Legendary', color: 0xF39C12, multiplier: 2.0 },
      MYTHIC: { name: 'Mythic', color: 0xE74C3C, multiplier: 3.0 }
    };

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

    let saveData = JSON.parse(JSON.stringify(defaultSaveData));

    function loadSaveData() {
      try {
        const saved = localStorage.getItem(SAVE_KEY);
        if (saved) {
          saveData = JSON.parse(saved);
          // Ensure all fields exist
          saveData.upgrades = { ...defaultSaveData.upgrades, ...saveData.upgrades };
          saveData.attributes = { ...defaultSaveData.attributes, ...(saveData.attributes || {}) };
          saveData.unspentAttributePoints = saveData.unspentAttributePoints || 0;
          saveData.equippedGear = { ...defaultSaveData.equippedGear, ...(saveData.equippedGear || {}) };
          saveData.inventory = saveData.inventory || [];
          saveData.campBuildings = { ...defaultSaveData.campBuildings, ...(saveData.campBuildings || {}) };
          saveData.skillTree = { ...defaultSaveData.skillTree, ...(saveData.skillTree || {}) };
          saveData.companions = { ...defaultSaveData.companions, ...(saveData.companions || {}) };
          saveData.hasVisitedCamp = saveData.hasVisitedCamp || false;
          saveData.nextRunTimeOfDay = saveData.nextRunTimeOfDay || 'day';
          saveData.lastDeathHour = saveData.lastDeathHour || 6; // Default to 6 AM
          saveData.runCount = saveData.runCount || 0;
          saveData.trainingPoints = saveData.trainingPoints || 0;
          saveData.lastTrainingPointTime = saveData.lastTrainingPointTime || 0;
          saveData.skillPoints = saveData.skillPoints || 0;
          saveData.selectedCompanion = saveData.selectedCompanion || 'stormWolf';
          // Account level system
          saveData.accountLevel = saveData.accountLevel || 1;
          saveData.accountXP = saveData.accountXP || 0;
          // Passive skills system
          saveData.passiveSkills = saveData.passiveSkills || {};
          saveData.passiveSkillPoints = saveData.passiveSkillPoints || 0;
          // Story quest system (legacy fields)
          saveData.storyQuests = { ...defaultSaveData.storyQuests, ...(saveData.storyQuests || {}) };
          saveData.storyQuests.buildingFirstUse = { ...defaultSaveData.storyQuests.buildingFirstUse, ...(saveData.storyQuests.buildingFirstUse || {}) };
          // Tutorial quest system (new)
          saveData.tutorialQuests = { ...defaultSaveData.tutorialQuests, ...(saveData.tutorialQuests || {}) };
          saveData.sideChallenges = { ...defaultSaveData.sideChallenges, ...(saveData.sideChallenges || {}) };
          // Tutorial system (new fields)
          saveData.tutorial = { ...defaultSaveData.tutorial, ...(saveData.tutorial || {}) };
          // Destructibles info shown flag
          saveData.shownDestructiblesInfo = saveData.shownDestructiblesInfo || false;
        }
      } catch (e) {
        console.error('Failed to load save data:', e);
        saveData = { ...defaultSaveData };
      }
    }

    function saveSaveData() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
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
    
    // Expose saveData to window scope for loading screen access (FRESH IMPLEMENTATION)
    window.saveData = saveData;

    // --- ACHIEVEMENTS SYSTEM ---
    const ACHIEVEMENTS = {
      kill7: { id: 'kill7', name: 'First Steps', desc: 'Kill 7 enemies', reward: 10, skillPoints: 0, attributePoints: 0, check: () => playerStats.kills >= 7, claimed: false },
      kills10: { id: 'kills10', name: 'First Blood', desc: 'Kill 10 enemies', reward: 25, skillPoints: 1, attributePoints: 1, check: () => playerStats.kills >= 10, claimed: false },
      kills50: { id: 'kills50', name: 'Killer Instinct', desc: 'Kill 50 enemies', reward: 50, skillPoints: 1, attributePoints: 1, check: () => playerStats.kills >= 50, claimed: false },
      kills100: { id: 'kills100', name: 'Century Slayer', desc: 'Kill 100 enemies', reward: 100, skillPoints: 2, attributePoints: 2, check: () => playerStats.kills >= 100, claimed: false },
      kills500: { id: 'kills500', name: 'Mass Destroyer', desc: 'Kill 500 enemies', reward: 250, skillPoints: 2, attributePoints: 2, check: () => playerStats.kills >= 500, claimed: false },
      kills1000: { id: 'kills1000', name: 'Legendary Warrior', desc: 'Kill 1000 enemies', reward: 500, skillPoints: 3, attributePoints: 3, check: () => playerStats.kills >= 1000, claimed: false },
      kills2500: { id: 'kills2500', name: 'Elite Slayer', desc: 'Kill 2500 enemies', reward: 750, skillPoints: 3, attributePoints: 3, check: () => playerStats.kills >= 2500, claimed: false },
      kills5000: { id: 'kills5000', name: 'God of War', desc: 'Kill 5000 enemies', reward: 1000, skillPoints: 4, attributePoints: 4, check: () => playerStats.kills >= 5000, claimed: false },
      
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
        const isClaimed = saveData.achievements && saveData.achievements.includes(achievement.id);
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
      if (!panel || !isGameActive || isGameOver) { if (panel) panel.style.display = 'none'; return; }
      panel.style.display = 'block';
      const waveEl = document.getElementById('stat-bar-wave');
      const killsEl = document.getElementById('stat-bar-kills');
      const comboEl = document.getElementById('stat-bar-combo');
      const questEl = document.getElementById('stat-bar-quest');
      const achEl = document.getElementById('stat-bar-achievement');
      if (waveEl) waveEl.textContent = 'Wave: ' + (waveCount || 0);
      if (killsEl) killsEl.style.display = 'none'; // Kill stat row removed from lower-left HUD box
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
        if (!questText && saveData.achievementQuests && saveData.achievementQuests.kill7Quest === 'active') {
          questText = '🏆 Visit Achievement Building';
        }
        questEl.textContent = questText ? '📋 ' + questText : '';
      }
      // Achievement progress
      if (achEl) {
        const kills = playerStats ? playerStats.kills : 0;
        if (!saveData.achievementQuests || !saveData.achievementQuests.kill7Unlocked) {
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
      
      const isClaimed = saveData.achievements && saveData.achievements.includes(achievement.id);
      const canClaim = !isClaimed && achievement.check();
      
      if (!canClaim) return;
      
      // Mark as claimed
      if (!saveData.achievements) saveData.achievements = [];
      saveData.achievements.push(achievement.id);
      
      // Award gold
      addGold(achievement.reward);
      
      // Award attribute points (with safety check)
      const attributePoints = achievement.attributePoints || 0;
      saveData.unspentAttributePoints += attributePoints;
      
      // Award skill points (with safety check)
      const skillPoints = achievement.skillPoints || 0;
      saveData.skillPoints += skillPoints;
      
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
        if (saveData.achievements && saveData.achievements.includes(achievement.id)) {
          continue;
        }
        
        // Check if achieved - mark internally but don't auto-claim
        if (achievement.check()) {
          hasNewAchievement = true;
          
          // Show notification only the FIRST TIME it's unlocked (not on every run)
          // Check if this specific achievement has been notified before by storing in localStorage
          // Note: Notification state is tracked separately from claim state to avoid re-showing
          // notifications in new runs before claiming. If localStorage is cleared, notifications
          // may re-appear but will still respect the saveData.achievements claim status.
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
      
      const unspent = saveData.unspentAttributePoints || 0;
      pointsDisplay.textContent = `Unspent Points: ${unspent}`;
      
      // Update badge on attributes button if there are unspent points
      updateAttributesBadge(unspent);
      
      let html = '';
      
      for (const attrKey in ATTRIBUTE_INFO) {
        const attr = ATTRIBUTE_INFO[attrKey];
        const currentLevel = saveData.attributes[attrKey] || 0;
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
      if (!saveData.attributes[attrKey]) saveData.attributes[attrKey] = 0;
      
      if (saveData.unspentAttributePoints > 0) {
        saveData.attributes[attrKey]++;
        saveData.unspentAttributePoints--;
        
        playSound('levelup');
        saveSaveData();
        updateAttributesScreen();
      }
    }
    
    // Expose to global scope for onclick handlers
    window.increaseAttribute = increaseAttribute;

    // --- GEAR SYSTEM ---
    const GEAR_ATTRIBUTES = {
      flexibility: { name: 'Flexibility', icon: '🤸', color: '#9B59B6' },
      movementSpeed: { name: 'Movement Speed', icon: '💨', color: '#3498DB' },
      attackSpeed: { name: 'Attack Speed', icon: '⚡', color: '#F39C12' },
      attackPrecision: { name: 'Attack Precision', icon: '🎯', color: '#E74C3C' },
      critChance: { name: 'Crit Chance', icon: '✨', color: '#E67E22' },
      elementalMagic: { name: 'Elemental Magic', icon: '🔮', color: '#8E44AD' }
    };

    // Phase 1: Define starter gear for all 6 slots
    const STARTER_GEAR = [
      {
        id: 'starter_weapon',
        name: 'Worn Sword',
        type: 'weapon',
        rarity: 'common',
        stats: { attackSpeed: 1, attackPrecision: 1 },
        description: 'A basic weapon'
      },
      {
        id: 'starter_armor',
        name: 'Leather Vest',
        type: 'armor',
        rarity: 'common',
        stats: { flexibility: 2, movementSpeed: 1 },
        description: 'Basic protection'
      },
      {
        id: 'starter_helmet',
        name: 'Cloth Cap',
        type: 'helmet',
        rarity: 'common',
        stats: { flexibility: 1 },
        description: 'Simple head covering'
      },
      {
        id: 'starter_boots',
        name: 'Worn Boots',
        type: 'boots',
        rarity: 'common',
        stats: { movementSpeed: 1 },
        description: 'Weathered footwear'
      },
      {
        id: 'starter_ring',
        name: 'Brass Ring',
        type: 'ring',
        rarity: 'common',
        stats: { critChance: 1 },
        description: 'Simple metal band'
      },
      {
        id: 'starter_amulet',
        name: 'Wooden Pendant',
        type: 'amulet',
        rarity: 'common',
        stats: { elementalMagic: 1 },
        description: 'Carved charm'
      }
    ];

    // Additional gear that can be obtained (for future expansion)
    const GEAR_POOL = [
      {
        id: 'blazing_sword',
        name: 'Blazing Sword',
        type: 'weapon',
        rarity: 'rare',
        stats: { attackSpeed: 2, attackPrecision: 2, elementalMagic: 1 },
        description: 'A sword wreathed in flames'
      },
      {
        id: 'frost_blade',
        name: 'Frost Blade',
        type: 'weapon',
        rarity: 'epic',
        stats: { attackSpeed: 3, attackPrecision: 3, elementalMagic: 2 },
        description: 'Freezes enemies on hit'
      },
      {
        id: 'shadow_cloak',
        name: 'Shadow Cloak',
        type: 'armor',
        rarity: 'rare',
        stats: { flexibility: 3, movementSpeed: 2 },
        description: 'Move like a shadow'
      },
      {
        id: 'dragon_plate',
        name: 'Dragon Plate',
        type: 'armor',
        rarity: 'legendary',
        stats: { flexibility: 2, movementSpeed: 1, attackPrecision: 2 },
        description: 'Forged from dragon scales'
      },
      // Phase 1: Helmets
      {
        id: 'iron_helmet',
        name: 'Iron Helmet',
        type: 'helmet',
        rarity: 'uncommon',
        stats: { flexibility: 2 },
        description: 'Sturdy head protection'
      },
      {
        id: 'crown_of_wisdom',
        name: 'Crown of Wisdom',
        type: 'helmet',
        rarity: 'epic',
        stats: { flexibility: 2, elementalMagic: 2 },
        description: 'Enhances magical abilities'
      },
      // Phase 1: Boots
      {
        id: 'speed_boots',
        name: 'Winged Boots',
        type: 'boots',
        rarity: 'epic',
        stats: { movementSpeed: 4, flexibility: 1 },
        description: 'Swift as the wind'
      },
      {
        id: 'shadow_steps',
        name: 'Shadow Steps',
        type: 'boots',
        rarity: 'rare',
        stats: { movementSpeed: 3 },
        description: 'Silent and swift'
      },
      // Phase 1: Rings
      {
        id: 'crit_ring',
        name: 'Ring of Critical Strikes',
        type: 'ring',
        rarity: 'rare',
        stats: { critChance: 3, attackPrecision: 1 },
        description: 'Increases critical hit chance'
      },
      {
        id: 'power_ring',
        name: 'Ring of Power',
        type: 'ring',
        rarity: 'legendary',
        stats: { attackSpeed: 2, attackPrecision: 2, critChance: 1 },
        description: 'Overwhelming offensive power'
      },
      // Phase 1: Amulets
      {
        id: 'magic_amulet',
        name: 'Arcane Amulet',
        type: 'amulet',
        rarity: 'legendary',
        stats: { elementalMagic: 4, attackSpeed: 2 },
        description: 'Channels magical energy'
      },
      {
        id: 'life_amulet',
        name: 'Amulet of Life',
        type: 'amulet',
        rarity: 'epic',
        stats: { flexibility: 3, elementalMagic: 1 },
        description: 'Grants vitality and resilience'
      }
    ];

    function initializeGear() {
      // Phase 1: Give players starter gear for all 6 slots if they don't have any
      if (!saveData.inventory || saveData.inventory.length === 0) {
        saveData.inventory = [...STARTER_GEAR];
        
        // Auto-equip all 6 starter items
        saveData.equippedGear.weapon = 'starter_weapon';
        saveData.equippedGear.armor = 'starter_armor';
        saveData.equippedGear.helmet = 'starter_helmet';
        saveData.equippedGear.boots = 'starter_boots';
        saveData.equippedGear.ring = 'starter_ring';
        saveData.equippedGear.amulet = 'starter_amulet';
        
        saveSaveData();
      }
    }

    function updateGearScreen() {
      const content = document.getElementById('gear-content');
      const statsContent = document.getElementById('gear-stats-content');
      
      if (!content || !statsContent) return;
      
      // Calculate total gear bonuses
      const gearStats = calculateGearStats();
      
      // Update stats display
      let statsHtml = '';
      for (const statKey in GEAR_ATTRIBUTES) {
        const stat = GEAR_ATTRIBUTES[statKey];
        const value = gearStats[statKey] || 0;
        statsHtml += `
          <div style="display: flex; align-items: center; gap: 10px; padding: 5px;">
            <span style="font-size: 24px;">${stat.icon}</span>
            <div>
              <div style="color: ${stat.color}; font-size: 14px; font-weight: bold;">${stat.name}</div>
              <div style="color: #FFD700; font-size: 16px; font-weight: bold;">+${value}</div>
            </div>
          </div>
        `;
      }
      statsContent.innerHTML = statsHtml;
      
      // Phase 1: Build gear slots display for all 6 slots
      let html = '';
      
      const slots = [
        { key: 'weapon', name: 'Weapon', icon: '⚔️' },
        { key: 'armor', name: 'Armor', icon: '🛡️' },
        { key: 'helmet', name: 'Helmet', icon: '⛑️' },
        { key: 'boots', name: 'Boots', icon: '👢' },
        { key: 'ring', name: 'Ring', icon: '💍' },
        { key: 'amulet', name: 'Amulet', icon: '📿' }
      ];
      
      for (const slot of slots) {
        const equippedId = saveData.equippedGear[slot.key];
        const equippedGear = equippedId ? saveData.inventory.find(g => g.id === equippedId) : null;
        
        html += `
          <div style="background: linear-gradient(to bottom, #2a3a4a, #1a2a3a); border: 3px solid #F39C12; border-radius: 15px; padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 32px;">${slot.icon}</span>
                <div style="color: #F39C12; font-size: 20px; font-weight: bold;">${slot.name}</div>
              </div>
            </div>
            ${equippedGear ? `
              <div style="background: rgba(0,0,0,0.3); border: 2px solid ${getRarityColor(equippedGear.rarity)}; border-radius: 10px; padding: 15px;">
                <div style="color: ${getRarityColor(equippedGear.rarity)}; font-size: 18px; font-weight: bold; margin-bottom: 5px;">
                  ${equippedGear.name}
                </div>
                <div style="color: #aaa; font-size: 13px; margin-bottom: 10px;">${equippedGear.description}</div>
                <div style="margin-bottom: 10px;">
                  ${Object.entries(equippedGear.stats).map(([stat, val]) => GEAR_ATTRIBUTES[stat] ? `
                    <div style="color: #90ee90; font-size: 13px;">• ${GEAR_ATTRIBUTES[stat].name}: +${val}</div>
                  ` : '').join('')}
                </div>
                <button onclick="unequipGear('${slot.key}')" style="padding: 8px 15px; background: linear-gradient(to bottom, #c0392b, #a93226); color: white; border: 2px solid #e74c3c; border-radius: 8px; cursor: pointer; font-weight: bold;">UNEQUIP</button>
              </div>
            ` : `
              <div style="color: #777; font-size: 14px; text-align: center; padding: 20px;">
                Empty Slot
              </div>
            `}
            <div style="margin-top: 15px;">
              <div style="color: #5DADE2; font-size: 16px; font-weight: bold; margin-bottom: 10px;">Available Gear:</div>
              <div style="display: grid; gap: 10px; max-height: 200px; overflow-y: auto;">
                ${saveData.inventory.filter(g => {
                  const gearType = g.type === 'accessory' ? (slot.key === 'accessory1' || slot.key === 'accessory2') : g.type === slot.key;
                  const notEquipped = g.id !== equippedId;
                  return gearType && notEquipped;
                }).map(gear => `
                  <div style="background: rgba(0,0,0,0.4); border: 2px solid ${getRarityColor(gear.rarity)}; border-radius: 8px; padding: 10px; cursor: pointer;" onclick="equipGear('${slot.key}', '${gear.id}')">
                    <div style="color: ${getRarityColor(gear.rarity)}; font-size: 14px; font-weight: bold;">${gear.name}</div>
                    <div style="color: #999; font-size: 11px;">${gear.description}</div>
                    <div style="margin-top: 5px;">
                      ${Object.entries(gear.stats).map(([stat, val]) => GEAR_ATTRIBUTES[stat] ? `
                        <span style="color: #90ee90; font-size: 11px; margin-right: 10px;">+${val} ${GEAR_ATTRIBUTES[stat].icon}</span>
                      ` : '').join('')}
                    </div>
                  </div>
                `).join('') || '<div style="color: #777; font-size: 12px; padding: 10px;">No available gear for this slot</div>'}
              </div>
            </div>
          </div>
        `;
      }
      
      content.innerHTML = html;
    }


    // Phase 1: Gear drop system - procedurally generate gear with rarity tiers
    function generateRandomGear() {
      // Rarity chances: common 50%, uncommon 25%, rare 15%, epic 8%, legendary 2%
      const rarityRoll = Math.random();
      let rarity;
      if (rarityRoll < 0.50) rarity = 'common';
      else if (rarityRoll < 0.75) rarity = 'uncommon';
      else if (rarityRoll < 0.90) rarity = 'rare';
      else if (rarityRoll < 0.98) rarity = 'epic';
      else rarity = 'legendary';
      
      // Choose random gear type from all 6 slots
      const types = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'amulet'];
      const type = types[Math.floor(Math.random() * types.length)];
      
      // Base stats by rarity
      const rarityStatMult = {
        common: 1,
        uncommon: 1.5,
        rare: 2,
        epic: 3,
        legendary: 4
      };
      const mult = rarityStatMult[rarity];
      
      // Generate random stats (1-3 random attributes)
      const statCount = Math.floor(Math.random() * 3) + 1;
      const stats = {};
      const availableStats = Object.keys(GEAR_ATTRIBUTES);
      const chosenStats = [];
      
      for (let i = 0; i < statCount; i++) {
        const stat = availableStats[Math.floor(Math.random() * availableStats.length)];
        if (!chosenStats.includes(stat)) {
          chosenStats.push(stat);
          stats[stat] = Math.floor((Math.random() * 2 + 1) * mult);
        }
      }
      
      // Generate unique ID
      const id = `gear_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      
      // Generate name
      const prefixes = ['Worn', 'Simple', 'Fine', 'Superior', 'Masterwork', 'Legendary'];
      const typeNames = {
        weapon: ['Blade', 'Sword', 'Axe', 'Dagger', 'Mace'],
        armor: ['Vest', 'Plate', 'Mail', 'Cuirass', 'Armor'],
        helmet: ['Cap', 'Helm', 'Crown', 'Mask', 'Circlet'],
        boots: ['Boots', 'Shoes', 'Greaves', 'Treads', 'Steps'],
        ring: ['Ring', 'Band', 'Loop', 'Circle', 'Hoop'],
        amulet: ['Amulet', 'Pendant', 'Charm', 'Talisman', 'Necklace']
      };
      
      const prefix = prefixes[Math.min(Math.floor(mult), prefixes.length - 1)];
      const typeName = typeNames[type][Math.floor(Math.random() * typeNames[type].length)];
      const name = `${prefix} ${typeName}`;
      
      return {
        id,
        name,
        type,
        rarity,
        stats,
        description: `A ${rarity} ${type}`
      };
    }

    function calculateGearStats() {
      const stats = {};
      
      for (const statKey in GEAR_ATTRIBUTES) {
        stats[statKey] = 0;
      }
      
      // Sum up stats from all equipped gear
      for (const slotKey in saveData.equippedGear) {
        const gearId = saveData.equippedGear[slotKey];
        if (gearId) {
          const gear = saveData.inventory.find(g => g.id === gearId);
          if (gear && gear.stats) {
            for (const statKey in gear.stats) {
              stats[statKey] += gear.stats[statKey];
            }
          }
        }
      }
      
      return stats;
    }

    function equipGear(slotKey, gearId) {
      saveData.equippedGear[slotKey] = gearId;
      playSound('coin');
      saveSaveData();
      updateGearScreen();
      
      // Quest progression: first time equipping gear (legacy)
      if (saveData.storyQuests.currentQuest === 'equipGear') {
        progressQuest('equipGear', true);
      }
      // Quest 4: Equip the Cigar
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest4_equipCigar') {
        progressTutorialQuest('quest4_equipCigar', true);
      }
      // Quest 6: Equip the Cigarr from armory → advance quest chain to quest7
      if (saveData.tutorialQuests && gearId === 'cigarr_quest' &&
          saveData.tutorialQuests.currentQuest === 'quest6_stonehengeChest') {
        progressTutorialQuest('quest6_stonehengeChest', true);
      }
    }

    function unequipGear(slotKey) {
      saveData.equippedGear[slotKey] = null;
      playSound('waterdrop');
      saveSaveData();
      updateGearScreen();
    }

    // Expose to global scope for onclick handlers
    window.equipGear = equipGear;
    window.unequipGear = unequipGear;

    // Upgrade definitions for the progression shop
    const PERMANENT_UPGRADES = {
      maxHp: {
        name: 'Max HP',
        description: '+10 HP per level',
        maxLevel: 20,
        baseCost: 50,
        costIncrease: 25,
        effect: (level) => 10 * level
      },
      hpRegen: {
        name: 'HP Regen',
        description: '+0.5 HP/sec per level',
        maxLevel: 10,
        baseCost: 100,
        costIncrease: 50,
        effect: (level) => 0.5 * level
      },
      moveSpeed: {
        name: 'Move Speed',
        description: '+5% per level',
        maxLevel: 10,
        baseCost: 75,
        costIncrease: 25,
        effect: (level) => 0.05 * level
      },
      attackDamage: {
        name: 'Attack Damage',
        description: '+10% per level',
        maxLevel: 15,
        baseCost: 100,
        costIncrease: 50,
        effect: (level) => 0.1 * level
      },
      attackSpeed: {
        name: 'Attack Speed',
        description: '+5% per level',
        maxLevel: 10,
        baseCost: 100,
        costIncrease: 50,
        effect: (level) => 0.05 * level
      },
      critChance: {
        name: 'Crit Chance',
        description: '+2% per level',
        maxLevel: 10,
        baseCost: 150,
        costIncrease: 50,
        effect: (level) => 0.02 * level
      },
      critDamage: {
        name: 'Crit Damage',
        description: '+10% per level',
        maxLevel: 10,
        baseCost: 150,
        costIncrease: 50,
        effect: (level) => 0.1 * level
      },
      armor: {
        name: 'Armor',
        description: '+2 per level',
        maxLevel: 15,
        baseCost: 100,
        costIncrease: 50,
        effect: (level) => 2 * level
      },
      cooldownReduction: {
        name: 'Cooldown Reduction',
        description: '-3% per level',
        maxLevel: 10,
        baseCost: 200,
        costIncrease: 50,
        effect: (level) => 0.03 * level
      },
      goldEarned: {
        name: 'Gold Earned',
        description: '+10% per level',
        maxLevel: 10,
        baseCost: 300,
        costIncrease: 100,
        effect: (level) => 0.1 * level
      },
      expEarned: {
        name: 'EXP Earned',
        description: '+10% per level',
        maxLevel: 10,
        baseCost: 250,
        costIncrease: 100,
        effect: (level) => 0.1 * level
      },
      maxWeapons: {
        name: 'Max Weapons',
        description: '+1 weapon slot',
        maxLevel: 3,
        baseCost: 500,
        costIncrease: 500,
        effect: (level) => level
      }
    };

    function getCost(upgradeKey) {
      const upgrade = PERMANENT_UPGRADES[upgradeKey];
      const currentLevel = saveData.upgrades[upgradeKey];
      return upgrade.baseCost + (currentLevel * upgrade.costIncrease);
    }
    
    // --- LORE SYSTEM ---
    const LORE_DATABASE = {
      landmarks: {
        windmill: {
          name: 'The Forgotten Windmill',
          icon: '🏚️',
          description: 'An ancient windmill that once powered a thriving village. Now it stands as a monument to a forgotten time.',
          unlockCondition: 'Defeat the Windmill Boss',
          story: 'Legend says this windmill was built by the first settlers who discovered the water droplets\' mystical properties. The machinery inside still turns, grinding something unseen...'
        },
        montana: {
          name: 'Montana Memorial',
          icon: '🗿',
          description: 'A massive stone statue honoring the fallen warriors of the Great Water War.',
          unlockCondition: 'Complete Montana Quest',
          story: 'The Montana stands watch over the battlefield where water droplets first united against the cube invasion. Its eyes are said to glow blue during the full moon.'
        },
        eiffel: {
          name: 'Eiffel Energy Tower',
          icon: '🗼',
          description: 'A towering structure that harnesses electrical energy from storm clouds.',
          unlockCondition: 'Complete Eiffel Tower Quest',
          story: 'Built by a genius engineer who sought to weaponize lightning itself. The tower still crackles with power, attracting the most dangerous enemies.'
        },
        stonehenge: {
          name: 'Ancient Stonehenge',
          icon: '⭕',
          description: 'A mysterious circle of ancient stones that pulse with unknown energy.',
          unlockCondition: 'Discover Stonehenge',
          story: 'These stones predate even the water droplets. Some say they are portals to other realms, while others believe they hold the secret to immortality...'
        },
        pyramids: {
          name: 'Desert Pyramids',
          icon: '🔺',
          description: 'Three massive pyramids that hide ancient treasures and deadly traps.',
          unlockCondition: 'Explore the Desert',
          story: 'Built by an advanced civilization that worshipped the sun. Deep within lies the legendary Eternal Cigar, said to grant unlimited power.'
        }
      },
      enemies: {
        square: {
          name: 'Cube Soldier',
          icon: '🟥',
          description: 'Basic geometric enemies that hunt in swarms.',
          story: 'Created from crystallized anger, these cubes seek to absorb all water to feed their master.'
        },
        triangle: {
          name: 'Spike Warrior',
          icon: '🔺',
          description: 'Sharp and aggressive, they attack with piercing precision.',
          story: 'Formed from shattered weapons of fallen heroes, they carry the rage of those who fell before you.'
        },
        round: {
          name: 'Sphere Hunter',
          icon: '🔵',
          description: 'Fast-moving orbs that roll through the battlefield.',
          story: 'Born from compressed emotions, these spheres are drawn to the tears of water droplets.'
        }
      },
      bosses: {
        windmillBoss: {
          name: 'The Grinder',
          icon: '⚙️',
          description: 'A massive mechanical horror powered by the windmill itself.',
          story: 'The corrupted soul of the windmill\'s creator, trapped in eternal machinery.'
        }
      },
      buildings: {
        skillTree: {
          name: 'Tree of Knowledge',
          icon: '🌳',
          description: 'An ancient tree that grants wisdom and power to those who study its branches.',
          story: 'This tree grew from a single water droplet that absorbed centuries of knowledge. Each skill you unlock is a branch of understanding.'
        },
        forge: {
          name: 'The Eternal Forge',
          icon: '🔨',
          description: 'A forge that never cools, capable of crafting legendary equipment.',
          story: 'Fueled by the heat of a thousand defeated enemies, this forge can shape even the hardest materials.'
        },
        companionHouse: {
          name: 'Companion Sanctuary',
          icon: '🏡',
          description: 'A safe haven where loyal companions rest and grow stronger.',
          story: 'Built on the site where the first water droplet befriended a wild beast. The bond forged here is unbreakable.'
        }
      }
    };
    
    // --- CAMP SYSTEM ---
    const CAMP_BUILDINGS = {
      // FREE BUILDINGS (unlocked on first camp visit after first death)
      questMission: {
        name: 'Quest & Mission Hall',
        icon: '📜',
        description: 'Start main story quests and missions',
        baseCost: 0, // Free
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        isCore: true, // Core building, always available
        bonus: (level) => ({
          // No stats bonus, provides quest functionality
        })
      },
      inventory: {
        name: 'Inventory Storage',
        icon: '📦',
        description: 'Store earned items and equipment',
        baseCost: 0, // Free
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        isCore: true,
        bonus: (level) => ({
          // No stats bonus, provides storage
        })
      },
      campHub: {
        name: 'Camp Hub',
        icon: '🏠',
        description: 'Central hub for all camp activities',
        baseCost: 0, // Free
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        isCore: true,
        bonus: (level) => ({
          // No stats bonus, central access point
        })
      },
      
      // PAID BUILDINGS (250g base cost unless noted)
      skillTree: {
        name: 'Skill Tree',
        icon: '🌳',
        description: 'Unlock powerful skill upgrades and abilities',
        baseCost: 250,
        costMultiplier: 1.8,
        maxCost: 100000,
        bonus: (level) => ({
          skillPoints: Math.floor(level / 2) // +1 skill point every 2 levels
        })
      },
      companionHouse: {
        name: 'Companion House',
        icon: '🐺',
        description: 'House and upgrade companions. Higher levels unlock better companions',
        baseCost: 250,
        costMultiplier: 1.8,
        maxCost: 100000,
        bonus: (level) => {
          // Unlock companions at certain levels
          const unlocks = [];
          if (level >= 3) unlocks.push('Uncommon companions');
          if (level >= 5) unlocks.push('Rare companions');
          if (level >= 7) unlocks.push('Epic companions');
          if (level >= 10) unlocks.push('Legendary companions');
          return {
            companionDamage: 0.1 * level, // +10% companion damage per level
            unlocks: unlocks.join(', ') || 'Basic companions'
          };
        }
      },
      forge: {
        name: 'Forge',
        icon: '⚒️',
        description: 'Craft and upgrade weapons. Higher tiers unlock better rarities',
        baseCost: 250,
        costMultiplier: 1.8,
        maxCost: 100000,
        bonus: (level) => {
          // Unlock crafting tiers
          let tier = 'Common';
          if (level >= 2) tier = 'Common, Uncommon';
          if (level >= 4) tier = 'Common, Uncommon, Rare';
          if (level >= 6) tier = 'Common, Uncommon, Rare, Epic';
          if (level >= 8) tier = 'Common, Uncommon, Rare, Epic, Legendary';
          if (level >= 10) tier = 'Common, Uncommon, Rare, Epic, Legendary, Mythic';
          return {
            craftingTier: tier
          };
        }
      },
      armory: {
        name: 'Armory',
        icon: '🛡️',
        description: 'Store and upgrade gear. Higher levels unlock better rarities',
        baseCost: 250,
        costMultiplier: 1.8,
        maxCost: 100000,
        bonus: (level) => {
          let tier = 'Common';
          if (level >= 2) tier = 'Uncommon';
          if (level >= 4) tier = 'Rare';
          if (level >= 6) tier = 'Epic';
          if (level >= 8) tier = 'Legendary';
          if (level >= 10) tier = 'Mythic';
          return {
            hp: 20 * level, // +20 HP per level
            armor: 5 * level, // +5 armor per level
            gearTier: tier
          };
        }
      },
      trainingHall: {
        name: 'Training Hall',
        icon: '🏋️',
        description: 'Train attributes with daily training points (Strength, Endurance, Flexibility)',
        baseCost: 250,
        costMultiplier: 1.8,
        maxCost: 100000,
        bonus: (level) => ({
          trainingEfficiency: 0.05 * level // +5% attribute gain per level
        })
      },
      
      // ADDITIONAL BUILDINGS
      trashRecycle: {
        name: 'Trash & Recycle',
        icon: '♻️',
        description: 'Scrap old gear to materials. Fuse/infuse gear for better stats',
        baseCost: 300,
        costMultiplier: 1.7,
        maxCost: 100000,
        bonus: (level) => ({
          recycleValue: 0.1 * level, // +10% recycle value per level
          fusionPower: 0.05 * level // +5% fusion bonus per level
        })
      },
      tempShop: {
        name: 'Temporary Items Shop',
        icon: '🏪',
        description: 'Buy one-run temporary power-ups and consumables',
        baseCost: 200,
        costMultiplier: 1.6,
        maxCost: 100000,
        bonus: (level) => ({
          shopDiscount: 0.05 * level, // +5% discount per level
          itemVariety: level // More items available per level
        })
      },
      
      // LEGACY BUILDINGS (kept for compatibility)
      trainingGrounds: {
        name: 'Training Grounds (Legacy)',
        icon: '🏋️',
        description: 'Train your combat skills (legacy system)',
        baseCost: 100,
        costMultiplier: 1.5,
        maxCost: 100000,
        isLegacy: true, // Hidden from new players
        bonus: (level) => ({
          damage: 0.05 * level,
          attackSpeed: 0.03 * level
        })
      },
      library: {
        name: 'Library',
        icon: '📚',
        description: 'Study ancient knowledge',
        baseCost: 200,
        costMultiplier: 1.5,
        maxCost: 100000,
        skillPointLevelInterval: 3,
        bonus: (level) => ({
          xp: 0.1 * level,
          skillPoints: Math.floor(level / 3)
        })
      },
      workshop: {
        name: 'Workshop',
        icon: '🔧',
        description: 'Craft better equipment',
        baseCost: 175,
        costMultiplier: 1.5,
        maxCost: 100000,
        bonus: (level) => ({
          critChance: 0.02 * level,
          critDamage: 0.1 * level
        })
      },
      shrine: {
        name: 'Shrine',
        icon: '⭐',
        description: 'Commune with spirits',
        baseCost: 250,
        costMultiplier: 1.5,
        maxCost: 100000,
        bonus: (level) => ({
          gold: 0.1 * level,
          regen: 0.5 * level
        })
      }
    };

    const SKILL_TREE = {
      // STARTING SKILLS - Available first (Dash and Critical Focus as base skills)
      dash: {
        id: 'dash',
        name: 'Dash',
        path: 'utility',
        requires: null,
        maxLevel: 5,
        cost: 1,
        description: 'Quick dodge in movement direction',
        bonus: (level) => ({
          dashCooldown: 0.2 * level
        })
      },
      criticalFocus: {
        name: '🎯 Critical Focus',
        description: '+10% crit chance, +15% crit damage',
        cost: 1,
        maxLevel: 5,
        requires: null,
        bonus: (level) => ({
          critChance: 0.1 * level,
          critDamage: 0.15 * level
        })
      },
      autoAim: {
        name: '🎯 Auto-Aim',
        description: 'Enables automatic targeting of nearest enemies. Toggle in Settings > Auto-Aim.',
        cost: 1,
        maxLevel: 1,
        requires: null,
        bonus: (level) => ({ autoAim: level > 0 })
      },
      dashMaster: {
        name: '🏃 Dash Master',
        description: 'Reduce dash cooldown by 15%, increase dash distance by 10%',
        cost: 1,
        maxLevel: 3,
        requires: 'dash',
        bonus: (level) => ({
          dashCooldown: 0.15 * level,
          dashDistance: 0.1 * level
        })
      },
      headshot: {
        id: 'headshot',
        name: 'Headshot',
        path: 'combat',
        requires: 'criticalFocus',
        maxLevel: 5,
        cost: 1,
        description: 'Double-crit = instant kill',
        bonus: (level) => ({
          critChance: 0.05 * level
        })
      },
      
      // COMBAT PATH (12 skills) - Unlocked after initial skills
      combatMastery: {
        name: 'Combat Mastery',
        description: '+10% damage, +5% crit chance',
        cost: 1,
        maxLevel: 5,
        requires: 'dashMaster',
        bonus: (level) => ({
          damage: 0.1 * level,
          critChance: 0.05 * level
        })
      },
      bladeDancer: {
        name: 'Blade Dancer',
        description: '+8% attack speed, +5% move speed',
        cost: 1,
        maxLevel: 3,
        requires: 'combatMastery',
        bonus: (level) => ({
          attackSpeed: 0.08 * level,
          moveSpeed: 0.05 * level
        })
      },
      heavyStrike: {
        name: 'Heavy Strike',
        description: '+15% damage, -5% attack speed',
        cost: 1,
        maxLevel: 3,
        requires: 'combatMastery',
        bonus: (level) => ({
          damage: 0.15 * level,
          attackSpeed: -0.05 * level
        })
      },
      rapidFire: {
        name: 'Rapid Fire',
        description: '+12% attack speed',
        cost: 1,
        maxLevel: 3,
        requires: 'bladeDancer',
        bonus: (level) => ({
          attackSpeed: 0.12 * level
        })
      },
      armorPierce: {
        name: 'Armor Pierce',
        description: 'Ignore 15% of enemy armor',
        cost: 1,
        maxLevel: 3,
        requires: 'heavyStrike',
        bonus: (level) => ({
          armorPenetration: 0.15 * level
        })
      },
      multiHit: {
        name: 'Multi-Hit',
        description: '5% chance to hit twice',
        cost: 1,
        maxLevel: 3,
        requires: 'rapidFire',
        bonus: (level) => ({
          multiHitChance: 0.05 * level
        })
      },
      executioner: {
        name: 'Executioner',
        description: '+20% damage to enemies below 30% HP',
        cost: 1,
        maxLevel: 3,
        requires: 'criticalFocus',
        bonus: (level) => ({
          executeDamage: 0.2 * level
        })
      },
      bloodlust: {
        name: 'Bloodlust',
        description: 'Heal 5 HP on kill',
        cost: 1,
        maxLevel: 3,
        requires: 'executioner',
        bonus: (level) => ({
          healOnKill: 5 * level
        })
      },
      berserker: {
        name: 'Berserker',
        description: '+10% damage when below 50% HP',
        cost: 1,
        maxLevel: 3,
        requires: 'bloodlust',
        bonus: (level) => ({
          lowHpDamage: 0.1 * level
        })
      },
      weaponSpecialist: {
        name: 'Weapon Specialist',
        description: '+8% all weapon damage',
        cost: 1,
        maxLevel: 5,
        requires: 'multiHit',
        bonus: (level) => ({
          weaponDamage: 0.08 * level
        })
      },
      combatVeteran: {
        name: 'Combat Veteran',
        description: '+12% damage, +8% attack speed',
        cost: 1,
        maxLevel: 3,
        requires: 'weaponSpecialist',
        bonus: (level) => ({
          damage: 0.12 * level,
          attackSpeed: 0.08 * level
        })
      },
      
      // DEFENSE PATH (12 skills)
      survivalist: {
        name: 'Survivalist',
        description: '+15 HP, +1 HP/sec regen',
        cost: 1,
        maxLevel: 5,
        requires: 'criticalFocus',
        bonus: (level) => ({
          hp: 15 * level,
          regen: 1 * level
        })
      },
      ironSkin: {
        name: 'Iron Skin',
        description: '+10 armor',
        cost: 1,
        maxLevel: 3,
        requires: 'survivalist',
        bonus: (level) => ({
          armor: 10 * level
        })
      },
      quickReflex: {
        name: 'Quick Reflex',
        description: '+5% dodge chance',
        cost: 1,
        maxLevel: 3,
        requires: 'survivalist',
        bonus: (level) => ({
          dodgeChance: 0.05 * level
        })
      },
      fortification: {
        name: 'Fortification',
        description: '+10 armor, +5% damage reduction',
        cost: 1,
        maxLevel: 5,
        requires: 'ironSkin',
        bonus: (level) => ({
          armor: 10 * level,
          damageReduction: 0.05 * level
        })
      },
      regeneration: {
        name: 'Regeneration',
        description: '+2 HP/sec regen',
        cost: 1,
        maxLevel: 3,
        requires: 'survivalist',
        bonus: (level) => ({
          regen: 2 * level
        })
      },
      lastStand: {
        name: 'Last Stand',
        description: 'Survive fatal blow with 1 HP (once per run)',
        cost: 1,
        maxLevel: 1,
        requires: 'fortification',
        bonus: (level) => ({
          lastStand: level > 0
        })
      },
      toughness: {
        name: 'Toughness',
        description: '+25 max HP',
        cost: 1,
        maxLevel: 3,
        requires: 'regeneration',
        bonus: (level) => ({
          hp: 25 * level
        })
      },
      guardian: {
        name: 'Guardian',
        description: '+8% damage reduction',
        cost: 1,
        maxLevel: 3,
        requires: 'fortification',
        bonus: (level) => ({
          damageReduction: 0.08 * level
        })
      },
      resilience: {
        name: 'Resilience',
        description: '+15% max HP',
        cost: 1,
        maxLevel: 3,
        requires: 'toughness',
        bonus: (level) => ({
          hpPercent: 0.15 * level
        })
      },
      secondWind: {
        name: 'Second Wind',
        description: 'Heal 30% HP when below 20% HP (60s cooldown)',
        cost: 1,
        maxLevel: 1,
        requires: 'resilience',
        bonus: (level) => ({
          secondWind: level > 0
        })
      },
      endurance: {
        name: 'Endurance',
        description: '+20 max HP, +1.5 HP/sec regen',
        cost: 1,
        maxLevel: 5,
        requires: 'guardian',
        bonus: (level) => ({
          hp: 20 * level,
          regen: 1.5 * level
        })
      },
      immortal: {
        name: 'Immortal',
        description: '+10% all damage reduction, +3 HP/sec regen',
        cost: 1,
        maxLevel: 3,
        requires: 'endurance',
        bonus: (level) => ({
          damageReduction: 0.1 * level,
          regen: 3 * level
        })
      },
      
      // UTILITY PATH (12 skills)
      wealthHunter: {
        name: 'Wealth Hunter',
        description: '+15% gold gain, +10% XP gain',
        cost: 1,
        maxLevel: 5,
        requires: 'dashMaster',
        bonus: (level) => ({
          gold: 0.15 * level,
          xp: 0.1 * level
        })
      },
      quickLearner: {
        name: 'Quick Learner',
        description: '+20% XP gain, -5% cooldown',
        cost: 1,
        maxLevel: 5,
        requires: 'wealthHunter',
        bonus: (level) => ({
          xp: 0.2 * level,
          cooldown: 0.05 * level
        })
      },
      magnetism: {
        name: 'Magnetism',
        description: '+25% pickup range',
        cost: 1,
        maxLevel: 3,
        requires: 'wealthHunter',
        bonus: (level) => ({
          pickupRange: 0.25 * level
        })
      },
      efficiency: {
        name: 'Efficiency',
        description: '-10% all cooldowns',
        cost: 1,
        maxLevel: 3,
        requires: 'quickLearner',
        bonus: (level) => ({
          cooldown: 0.1 * level
        })
      },
      scavenger: {
        name: 'Scavenger',
        description: '+20% drop rate for all items',
        cost: 1,
        maxLevel: 3,
        requires: 'magnetism',
        bonus: (level) => ({
          dropRate: 0.2 * level
        })
      },
      fortuneFinder: {
        name: 'Fortune Finder',
        description: '+25% gold drops',
        cost: 1,
        maxLevel: 3,
        requires: 'scavenger',
        bonus: (level) => ({
          gold: 0.25 * level
        })
      },
      speedster: {
        name: 'Speedster',
        description: '+10% move speed',
        cost: 1,
        maxLevel: 3,
        requires: 'dashMaster',
        bonus: (level) => ({
          moveSpeed: 0.1 * level
        })
      },
      cooldownExpert: {
        name: 'Cooldown Expert',
        description: '-15% all cooldowns',
        cost: 1,
        maxLevel: 3,
        requires: 'efficiency',
        bonus: (level) => ({
          cooldown: 0.15 * level
        })
      },
      auraExpansion: {
        name: 'Aura Expansion',
        description: '+20% aura weapon range',
        cost: 1,
        maxLevel: 3,
        requires: 'speedster',
        bonus: (level) => ({
          auraRange: 0.2 * level
        })
      },
      resourceful: {
        name: 'Resourceful',
        description: '+15% XP, +15% gold, +10% drop rate',
        cost: 1,
        maxLevel: 5,
        requires: 'fortuneFinder',
        bonus: (level) => ({
          xp: 0.15 * level,
          gold: 0.15 * level,
          dropRate: 0.1 * level
        })
      },
      treasureHunter: {
        name: 'Treasure Hunter',
        description: '+30% gold, +50% pickup range',
        cost: 1,
        maxLevel: 3,
        requires: 'resourceful',
        bonus: (level) => ({
          gold: 0.3 * level,
          pickupRange: 0.5 * level
        })
      },
      
      // ELEMENTAL PATH (12 skills)
      fireMastery: {
        name: '🔥 Fire Mastery',
        description: '+15% fire damage, burn enemies',
        cost: 1,
        maxLevel: 3,
        requires: 'combatMastery',
        bonus: (level) => ({
          fireDamage: 0.15 * level,
          burnChance: 0.1 * level
        })
      },
      iceMastery: {
        name: '❄️ Ice Mastery',
        description: '+15% ice damage, slow enemies',
        cost: 1,
        maxLevel: 3,
        requires: 'combatMastery',
        bonus: (level) => ({
          iceDamage: 0.15 * level,
          slowChance: 0.15 * level
        })
      },
      lightningMastery: {
        name: '⚡ Lightning Mastery',
        description: '+15% lightning damage, chain lightning',
        cost: 1,
        maxLevel: 3,
        requires: 'combatMastery',
        bonus: (level) => ({
          lightningDamage: 0.15 * level,
          chainChance: 0.1 * level
        })
      },
      elementalFusion: {
        name: 'Elemental Fusion',
        description: '+10% all elemental damage',
        cost: 1,
        maxLevel: 3,
        requires: 'fireMastery',
        bonus: (level) => ({
          elementalDamage: 0.1 * level
        })
      },
      pyromaniac: {
        name: 'Pyromaniac',
        description: '+25% fire damage, burn spreads',
        cost: 1,
        maxLevel: 3,
        requires: 'fireMastery',
        bonus: (level) => ({
          fireDamage: 0.25 * level,
          burnSpread: level > 0
        })
      },
      frostbite: {
        name: 'Frostbite',
        description: '+25% ice damage, freeze chance',
        cost: 1,
        maxLevel: 3,
        requires: 'iceMastery',
        bonus: (level) => ({
          iceDamage: 0.25 * level,
          freezeChance: 0.05 * level
        })
      },
      stormCaller: {
        name: 'Storm Caller',
        description: '+25% lightning damage, more chains',
        cost: 1,
        maxLevel: 3,
        requires: 'lightningMastery',
        bonus: (level) => ({
          lightningDamage: 0.25 * level,
          chainCount: level
        })
      },
      elementalChain: {
        name: 'Elemental Chain',
        description: 'Elemental attacks chain to nearby enemies',
        cost: 1,
        maxLevel: 3,
        requires: 'elementalFusion',
        bonus: (level) => ({
          elementalChain: level
        })
      },
      manaOverflow: {
        name: 'Mana Overflow',
        description: '+20% elemental damage, -10% cooldowns',
        cost: 1,
        maxLevel: 3,
        requires: 'pyromaniac',
        bonus: (level) => ({
          elementalDamage: 0.2 * level,
          cooldown: 0.1 * level
        })
      },
      spellEcho: {
        name: 'Spell Echo',
        description: '10% chance to cast elemental effect twice',
        cost: 1,
        maxLevel: 3,
        requires: 'elementalChain',
        bonus: (level) => ({
          spellEchoChance: 0.1 * level
        })
      },
      arcaneEmpowerment: {
        name: 'Arcane Empowerment',
        description: '+15% all damage, +15% elemental damage',
        cost: 1,
        maxLevel: 5,
        requires: 'manaOverflow',
        bonus: (level) => ({
          damage: 0.15 * level,
          elementalDamage: 0.15 * level
        })
      },
      elementalOverload: {
        name: 'Elemental Overload',
        description: '+30% elemental damage, elemental effects guaranteed',
        cost: 1,
        maxLevel: 3,
        requires: 'arcaneEmpowerment',
        bonus: (level) => ({
          elementalDamage: 0.3 * level,
          elementalGuaranteed: level >= 3
        })
      }
    };

    function isDashUnlocked() {
      return (saveData.skillTree && saveData.skillTree.dash && saveData.skillTree.dash.level > 0) ||
             (saveData.tutorial && saveData.tutorial.dashUnlocked) ||
             (saveData.skillTree && saveData.skillTree.dashMaster && saveData.skillTree.dashMaster.level > 0);
    }
    function isHeadshotUnlocked() {
      return (saveData.skillTree && saveData.skillTree.headshot && saveData.skillTree.headshot.level > 0) ||
             (saveData.tutorial && saveData.tutorial.headshotUnlocked) ||
             (saveData.skillTree && saveData.skillTree.criticalFocus && saveData.skillTree.criticalFocus.level > 0) ||
             (saveData.skillTree && saveData.skillTree.executioner && saveData.skillTree.executioner.level > 0);
    }

    function startDash() {
      if (!isDashUnlocked() || isDashing || dashCooldownRemaining > 0) return;
      if (!player) return;
      isDashing = true;
      dashTimer = 0.2;
      dashInvulnerable = true;
      const keysP = window._keysPressed || {};
      const dx = (keysP['d'] || keysP['arrowright'] ? 1 : 0) - (keysP['a'] || keysP['arrowleft'] ? 1 : 0);
      const dz = (keysP['s'] || keysP['arrowdown'] ? 1 : 0) - (keysP['w'] || keysP['arrowup'] ? 1 : 0);
      const len = Math.sqrt(dx*dx + dz*dz);
      dashDirection.x = len > 0 ? dx/len : 0;
      dashDirection.z = len > 0 ? dz/len : 1;
      const dashLevel = (saveData.skillTree && saveData.skillTree.dash) ? (saveData.skillTree.dash.level || 0) : 0;
      dashCooldownRemaining = Math.max(1.5, 3 - 0.2 * dashLevel);
      // Delegate actual movement to existing player.dash()
      player.dash(dashDirection.x, dashDirection.z);
    }

    function getBuildingCost(buildingId) {
      const building = CAMP_BUILDINGS[buildingId];
      const currentLevel = saveData.campBuildings[buildingId].level;
      const calculatedCost = Math.floor(building.baseCost * Math.pow(building.costMultiplier, currentLevel));
      // Cap cost at maxCost to prevent overflow at very high levels
      return Math.min(calculatedCost, building.maxCost || 100000);
    }

    function upgradeCampBuilding(buildingId) {
      const building = CAMP_BUILDINGS[buildingId];
      const buildingData = saveData.campBuildings[buildingId];
      const cost = getBuildingCost(buildingId);
      
      if (buildingData.level >= buildingData.maxLevel) {
        showStatusMessage('Building is at max level!', 2000);
        return;
      }
      
      if (saveData.gold >= cost) {
        saveData.gold -= cost;
        buildingData.level++;
        
        // Award skill points from library
        if (buildingId === 'library') {
          const bonus = building.bonus(buildingData.level);
          if (bonus.skillPoints > 0) {
            saveData.skillPoints += bonus.skillPoints;
          }
        }
        
        saveSaveData();
        updateCampScreen();
        playSound('collect');
        showStatusMessage(`${building.name} upgraded to level ${buildingData.level}!`, 2000);
        
        // Quest progression
        if (buildingId === 'skillTree' && buildingData.level === 2 && saveData.storyQuests.currentQuest === 'upgradeSkillTree') {
          progressQuest('upgradeSkillTree', true);
        }
        
        // Check for "upgrade any building to level 3" quest
        if (buildingData.level === 3 && saveData.storyQuests.currentQuest === 'upgradeAnyBuildingTo3') {
          progressQuest('upgradeAnyBuildingTo3', true);
        }
      } else {
        playSound('invalid');
        showStatusMessage('Not enough gold!', 2000);
      }
    }

    function unlockSkill(skillId) {
      const skill = SKILL_TREE[skillId];
      const skillData = saveData.skillTree[skillId];
      
      if (skillData.level >= skill.maxLevel) {
        showStatusMessage('Skill is at max level!', 2000);
        return;
      }
      
      // Check skill point cost
      if (saveData.skillPoints >= skill.cost) {
        saveData.skillPoints -= skill.cost;
        if (!skillData.unlocked) {
          skillData.unlocked = true;
        }
        skillData.level++;
        
        saveSaveData();
        updateCampScreen();
        playSound('collect');
        
        showStatusMessage(`${skill.name} leveled up!`, 2000);
        
        // QUEST 2: Track skill point spending for tutorial quest
        if (saveData.tutorialQuests) {
          ensureQuest2Activated();
        }
        
        // Quest progression: Track skill unlocks for tutorial quest
        if (saveData.storyQuests.currentQuest === 'useSkillTree') {
          // Count how many skills have been unlocked (use level > 0 as canonical check)
          const unlockedSkillsCount = Object.values(saveData.skillTree).filter(s => s.level > 0).length;
          
          if (unlockedSkillsCount >= 2) {
            // Completed the demonstration quest
            saveData.storyQuests.buildingFirstUse.skillTree = true;
            progressQuest('useSkillTree', true);
          }
        }
        
        // Tutorial: Check if dash was unlocked
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
        
        // Unlock dash ability whenever dash or dashMaster skill is purchased (regardless of tutorial step)
        if ((skillId === 'dash' || skillId === 'dashMaster') && !saveData.tutorial.dashUnlocked) {
          saveData.tutorial.dashUnlocked = true;
          saveSaveData();
        }
        // Unlock headshot ability whenever a crit skill is purchased
        if ((skillId === 'criticalFocus' || skillId === 'headshot' || skillId === 'executioner') && !saveData.tutorial.headshotUnlocked) {
          saveData.tutorial.headshotUnlocked = true;
          saveSaveData();
        }
        
        // Auto-Aim skill: enable checkbox + notify player
        if (skillId === 'autoAim' && skillData.level >= 1) {
          const autoAimCb = document.getElementById('auto-aim-checkbox');
          if (autoAimCb) {
            autoAimCb.disabled = false;
            autoAimCb.title = 'Toggle Auto-Aim on/off';
          }
          const autoAimLabel = document.getElementById('auto-aim-label-tooltip');
          if (autoAimLabel) autoAimLabel.style.display = 'none';
          showStatChange('🎯 Auto-Aim unlocked! Enable it in Settings > Auto-Aim checkbox');
        }
        
        if ((skillId === 'dashMaster' || skillId === 'dash') && saveData.tutorial.currentStep === 'unlock_dash') {
          saveData.tutorial.currentStep = 'unlock_headshot';
          saveSaveData();
          setTimeout(() => {
            showComicTutorial('unlock_headshot');
          }, 1000);
        } else if ((skillId === 'criticalFocus' || skillId === 'headshot' || skillId === 'executioner') && saveData.tutorial.currentStep === 'unlock_headshot' && !saveData.tutorial.headshotUnlocked) {
          // Accept any crit/headshot related skill
          saveData.tutorial.headshotUnlocked = true;
          saveSaveData();
          setTimeout(() => {
            showComicTutorial('tutorial_complete');
          }, 1000);
        }
      } else {
        playSound('invalid');
        showStatusMessage('Not enough skill points!', 2000);
      }
    }

    // Training Hall constants
    const TRAINING_POINT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
    
    // Fun combo names (defined once to avoid recreation)
    const FUN_COMBO_NAMES = [
      'xoxo', 'serious?', 'no way', 'one million combo almost', 
      'i lost count combo', 'are you even real?', 'stop it already',
      'ok this is ridiculous', 'somebody stop them', 'mercy please',
      'absolute madness', 'breaking the game', 'console.log("help")',
      'error 404: combo limit not found', 'combo.exe has stopped',
      'infinity and beyond', 'to the moon', 'unstoppable force',
      'immovable object met', 'game over man', 'legend has it'
    ];
    
    // Training Hall functions
    function updateTrainingPoints() {
      // Award training points based on time
      const now = Date.now();
      if (!saveData.lastTrainingPointTime) {
        saveData.lastTrainingPointTime = now;
      }
      
      const timeSinceLastPoint = now - saveData.lastTrainingPointTime;
      const pointsEarned = Math.floor(timeSinceLastPoint / TRAINING_POINT_INTERVAL_MS);
      
      if (pointsEarned > 0) {
        saveData.trainingPoints += pointsEarned;
        saveData.lastTrainingPointTime += pointsEarned * TRAINING_POINT_INTERVAL_MS;
        saveSaveData();
      }
    }
    
    function getNextTrainingPointTime() {
      if (!saveData.lastTrainingPointTime) return 'Soon';
      const now = Date.now();
      const nextPointTime = saveData.lastTrainingPointTime + TRAINING_POINT_INTERVAL_MS;
      const timeRemaining = nextPointTime - now;
      
      if (timeRemaining <= 0) return 'Available now!';
      
      const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
      const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
      
      return `${hours}h ${minutes}m`;
    }
    
    // Passive Skills System
    const PASSIVE_SKILLS = [
      { id: 'hp_boost', icon: '❤️', name: 'HP Boost', desc: '+10 Max HP per level', maxLevel: 5, cost: 2, apply: (saves) => { saves.passiveSkills.hp_boost = (saves.passiveSkills.hp_boost || 0) + 1; } },
      { id: 'dmg_boost', icon: '⚔️', name: 'Damage Boost', desc: '+5% Base Damage per level', maxLevel: 5, cost: 2, apply: (saves) => { saves.passiveSkills.dmg_boost = (saves.passiveSkills.dmg_boost || 0) + 1; } },
      { id: 'gold_bonus', icon: '💰', name: 'Gold Finder', desc: '+10% Gold per level', maxLevel: 5, cost: 2, apply: (saves) => { saves.passiveSkills.gold_bonus = (saves.passiveSkills.gold_bonus || 0) + 1; } },
      { id: 'xp_bonus', icon: '⭐', name: 'XP Boost', desc: '+10% XP per level', maxLevel: 5, cost: 2, apply: (saves) => { saves.passiveSkills.xp_bonus = (saves.passiveSkills.xp_bonus || 0) + 1; } },
      { id: 'regen_boost', icon: '🔄', name: 'Regeneration', desc: '+0.5 HP/sec per level', maxLevel: 5, cost: 3, apply: (saves) => { saves.passiveSkills.regen_boost = (saves.passiveSkills.regen_boost || 0) + 1; } },
      { id: 'speed_boost', icon: '💨', name: 'Swiftness', desc: '+5% Move Speed per level', maxLevel: 3, cost: 3, apply: (saves) => { saves.passiveSkills.speed_boost = (saves.passiveSkills.speed_boost || 0) + 1; } }
    ];
    
    function updatePassiveSkillsSection() {
      if (!saveData.passiveSkills) saveData.passiveSkills = {};
      if (!saveData.passiveSkillPoints) saveData.passiveSkillPoints = 0;
      
      const pointsEl = document.getElementById('passive-skill-points-display');
      if (pointsEl) pointsEl.textContent = saveData.passiveSkillPoints;
      
      const content = document.getElementById('camp-passive-content');
      if (!content) return;
      content.innerHTML = '';
      
      PASSIVE_SKILLS.forEach(skill => {
        const currentLevel = saveData.passiveSkills[skill.id] || 0;
        const isMax = currentLevel >= skill.maxLevel;
        const canAfford = saveData.passiveSkillPoints >= skill.cost;
        
        const card = document.createElement('div');
        card.style.cssText = `background:linear-gradient(to bottom,#2a3a2a,#1a2a1a);border:2px solid ${isMax ? '#FFD700' : '#4a6a4a'};border-radius:12px;padding:15px;`;
        card.innerHTML = `
          <div style="font-size:24px;margin-bottom:6px;">${skill.icon}</div>
          <div style="font-family:'Bangers',cursive;font-size:18px;color:${isMax ? '#FFD700' : '#90EE90'};letter-spacing:1px;">${skill.name}</div>
          <div style="font-size:13px;color:#aaa;margin:4px 0;">${skill.desc}</div>
          <div style="font-size:12px;color:#FFD700;margin:4px 0;">Level: ${currentLevel}/${skill.maxLevel}</div>
          ${!isMax ? `<button style="background:${canAfford ? '#2a6a2a' : '#3a3a3a'};color:${canAfford ? '#90EE90' : '#666'};border:1px solid ${canAfford ? '#4a9a4a' : '#555'};border-radius:6px;padding:6px 12px;cursor:${canAfford ? 'pointer' : 'default'};font-size:13px;margin-top:6px;" data-id="${skill.id}" data-cost="${skill.cost}">Unlock (${skill.cost} pts)</button>` : '<div style="color:#FFD700;font-size:13px;margin-top:6px;">✅ MAX LEVEL</div>'}
        `;
        
        const btn = card.querySelector('button');
        if (btn && canAfford) {
          btn.onclick = () => {
            if (saveData.passiveSkillPoints < skill.cost) return;
            saveData.passiveSkillPoints -= skill.cost;
            skill.apply(saveData);
            saveSaveData();
            updatePassiveSkillsSection();
            playSound('collect');
            showStatusMessage(`${skill.name} upgraded!`, 2000);
          };
        }
        
        content.appendChild(card);
      });
    }
    
    function updateTrainingSection() {
      updateTrainingPoints();
      
      const trainingPointsDisplay = document.getElementById('training-points-display');
      const nextPointTime = document.getElementById('next-training-point-time');
      const attributesContent = document.getElementById('training-attributes-content');
      
      trainingPointsDisplay.textContent = saveData.trainingPoints;
      nextPointTime.textContent = `Next training point in: ${getNextTrainingPointTime()}`;
      
      // Training cost scales: 100g for first point, +50g per point
      const TRAINING_ATTRIBUTES = {
        strength: {
          name: 'Strength',
          icon: '💪',
          description: 'Increases damage output',
          current: saveData.attributes.strength || 0,
          baseCost: 100
        },
        endurance: {
          name: 'Endurance',
          icon: '🏃',
          description: 'Increases stamina and high-speed duration',
          current: saveData.attributes.endurance || 0,
          baseCost: 100
        },
        flexibility: {
          name: 'Flexibility',
          icon: '🤸',
          description: 'Improves turn speed and dodge responsiveness',
          current: saveData.attributes.flexibility || 0,
          baseCost: 100
        }
      };
      
      attributesContent.innerHTML = '';
      
      for (const [attrId, attr] of Object.entries(TRAINING_ATTRIBUTES)) {
        const cost = attr.baseCost + (attr.current * 50);
        const canAfford = saveData.gold >= cost && saveData.trainingPoints >= 1;
        
        const attrCard = document.createElement('div');
        attrCard.style.cssText = `
          background: rgba(0,0,0,0.5);
          padding: 20px;
          border-radius: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          border: 2px solid ${canAfford ? '#FFD700' : '#555'};
          opacity: ${canAfford ? '1' : '0.6'};
        `;
        
        attrCard.innerHTML = `
          <div style="flex: 1;">
            <div style="font-size: 20px; margin-bottom: 5px;">${attr.icon} ${attr.name}</div>
            <div style="font-size: 14px; color: #AAA; margin-bottom: 10px;">${attr.description}</div>
            <div style="font-size: 16px; color: #5DADE2;">Current: ${attr.current}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 18px; color: #FFD700; margin-bottom: 5px;">${cost} gold</div>
            <div style="font-size: 14px; color: #AAA;">+ 1 Training Point</div>
            <button class="btn" style="margin-top: 10px; padding: 8px 16px;">TRAIN</button>
          </div>
        `;
        
        attrCard.onclick = () => {
          if (saveData.gold >= cost && saveData.trainingPoints >= 1) {
            saveData.gold -= cost;
            saveData.trainingPoints -= 1;
            
            // Initialize attributes if not present
            if (!saveData.attributes) saveData.attributes = {};
            if (!saveData.attributes[attrId]) saveData.attributes[attrId] = 0;
            
            saveData.attributes[attrId]++;
            saveSaveData();
            
            playSound('levelup');
            showStatusMessage(`${attr.name} increased to ${saveData.attributes[attrId]}!`, 2000);
            updateTrainingSection();
            updateGoldDisplays();
            
            // QUEST 4 (new): Track attribute purchase for "Upgrade an Attribute" quest
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest4_upgradeAttr') {
              progressTutorialQuest('quest4_upgradeAttr', true);
            }
            // QUEST 5 (new): Track training session for "Complete a Training Session" quest
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest5_trainingSession') {
              progressTutorialQuest('quest5_trainingSession', true);
            }
            // QUEST 3 (legacy): Track attribute purchase for tutorial quest
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest3_buyProgression') {
              // Count total attribute levels purchased
              const totalAttrLevels = Object.values(saveData.attributes || {}).reduce((sum, val) => sum + val, 0);
              
              if (totalAttrLevels >= 1) {
                // Completed quest 3: bought 1 progression upgrade
                progressTutorialQuest('quest3_buyProgression', true);
              }
            }
            // QUEST 6: Track attribute purchase for upgrade-3-attributes quest
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest6_buyAttributes') {
              if (!saveData.tutorialQuests.quest6AttrCount) saveData.tutorialQuests.quest6AttrCount = 0;
              saveData.tutorialQuests.quest6AttrCount++;
              if (saveData.tutorialQuests.quest6AttrCount >= 3) {
                progressTutorialQuest('quest6_buyAttributes', true);
              }
            }
          } else {
            playSound('invalid');
            if (saveData.trainingPoints < 1) {
              showStatusMessage('Not enough training points!', 2000);
            } else {
              showStatusMessage('Not enough gold!', 2000);
            }
          }
        };
        
        attributesContent.appendChild(attrCard);
      }
    }

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
        description: 'Start a new run and kill 3 enemies',
        objectives: 'Kill 3 enemies in one run',
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
        name: 'Buy 3 Skills',
        description: 'Go to the Skill Tree tab and unlock any three skills',
        objectives: 'Unlock any 3 skills in the Skill Tree tab',
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
        unlockBuildingOnActivation: 'armory', // Armory unlocks when THIS quest activates (so player can use it)
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
        message: "🏋️ Training complete!<br><br>You earned <b>+2 Attribute Points</b> and <b>+1 Skill Point</b>!<br><br>Next: keep pushing — kill <b>10 enemies</b> in a run!",
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
        description: 'Head out and eliminate 10 enemies in a single run',
        objectives: 'Kill 10 enemies in one run',
        triggerOnDeath: true,
        rewardGold: 200,
        rewardSkillPoints: 1,
        message: "⚔️ 10 Enemies Defeated!<br><br>You're growing stronger, Droplet!<br><br>One final challenge: eliminate <b>15 enemies</b> in a single run to complete your training!",
        nextQuest: 'quest7_kill10',
        conditions: ['quest5_trainingSession']
      },
      quest7_kill10: {
        id: 'quest7_kill10',
        name: 'Kill 15 Enemies',
        description: 'Head out and eliminate 15 enemies in a single run',
        objectives: 'Kill 15 enemies',
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
        description: 'Kill 10 enemies in one run',
        objectives: 'Kill 10 enemies',
        triggerOnDeath: true, // Reward given when player dies after completing objective
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
        giveItem: { id: 'cigarr_quest', name: 'Cigarr', type: 'ring', rarity: 'rare', stats: { flexibility: 1, movementSpeed: 1, attackSpeed: 1, attackPrecision: 1, critChance: 1, elementalMagic: 1 }, description: '+1 to all combat stats' },
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
      const questId = saveData.tutorialQuests.currentQuest;
      return questId ? TUTORIAL_QUESTS[questId] : null;
    }
    
    // Helper: ensure quest2 is activated and check if both skills are already bought
    function ensureQuest2Activated() {
      if (!saveData.tutorialQuests) return;
      // Auto-activate quest2 if quest1 is claimed but quest2 hasn't started
      if (
        isQuestClaimed('quest1_kill3') &&
        !saveData.tutorialQuests.currentQuest &&
        !isQuestClaimed('quest2_spendSkills') &&
        !saveData.tutorialQuests.readyToClaim.includes('quest2_spendSkills')
      ) {
        saveData.tutorialQuests.currentQuest = 'quest2_spendSkills';
      }
      // If quest2 is active, check if three skills have been bought
      if (saveData.tutorialQuests.currentQuest === 'quest2_spendSkills') {
        const totalSkillsBought = Object.values(saveData.skillTree).filter(s => s && s.level > 0).length;
        if (totalSkillsBought >= 3) {
          progressTutorialQuest('quest2_spendSkills', true);
        }
      }
    }
    
    // Check if quest conditions are fulfilled
    function checkQuestConditions(questId) {
      const quest = TUTORIAL_QUESTS[questId];
      if (!quest) return false;
      
      const completedQuests = saveData.tutorialQuests.completedQuests || [];
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
      const completedQuests = saveData.tutorialQuests.completedQuests || [];
      return completedQuests.includes(questId);
    }
    
    // Check if a building has an active quest
    function hasQuestForBuilding(buildingId) {
      // Legacy support
      return false;
    }
    
    // Progress tutorial quest
    function progressTutorialQuest(questId, completed = false) {
      if (saveData.tutorialQuests.currentQuest !== questId) return;
      
      const quest = TUTORIAL_QUESTS[questId];
      if (!quest) return;
      
      if (completed) {
        // Auto-claim quests complete immediately
        if (quest.autoClaim) {
          claimTutorialQuest(questId);
        } else {
          // Mark quest as ready to claim
          if (!saveData.tutorialQuests.readyToClaim.includes(questId)) {
            saveData.tutorialQuests.readyToClaim.push(questId);
          }
          
          // Clear current quest
          saveData.tutorialQuests.currentQuest = null;
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
          showStatChange('📜 Quest Complete! Return to Main Building to claim!');
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
      const index = saveData.tutorialQuests.readyToClaim.indexOf(questId);
      if (index > -1) {
        saveData.tutorialQuests.readyToClaim.splice(index, 1);
      }
      
      // Add to completed
      if (!saveData.tutorialQuests.completedQuests.includes(questId)) {
        saveData.tutorialQuests.completedQuests.push(questId);
      }
      
      // Give rewards
      if (quest.rewardGold) {
        saveData.gold += quest.rewardGold;
        showStatChange(`+${quest.rewardGold} Gold!`);
      }
      // Award 50 bonus gold for every quest claimed
      saveData.gold += 50;
      showStatChange('+50 Gold!');
      if (quest.rewardSkillPoints) {
        saveData.skillPoints += quest.rewardSkillPoints;
        showStatChange(`+${quest.rewardSkillPoints} Skill Points!`);
      }
      if (quest.rewardAttributePoints) {
        saveData.trainingPoints = (saveData.trainingPoints || 0) + quest.rewardAttributePoints;
        showStatChange(`+${quest.rewardAttributePoints} Attribute Points!`);
      }
      // Award account XP for completing a quest (50 XP per quest)
      addAccountXP(50);
      
      // Unlock building on CLAIM (only for quests that use unlockBuilding, e.g. quest1 for SkillTree)
      if (quest.unlockBuilding && saveData.campBuildings[quest.unlockBuilding]) {
        saveData.campBuildings[quest.unlockBuilding].unlocked = true;
        if (saveData.campBuildings[quest.unlockBuilding].level === 0) {
          saveData.campBuildings[quest.unlockBuilding].level = 1;
        }
        const buildingName = CAMP_BUILDINGS[quest.unlockBuilding]?.name || 'Building';
        showStatChange(`🏛️ ${buildingName} Unlocked!`);
      }
      
      // Give companion egg
      if (quest.companionEgg) {
        if (saveData.companions && saveData.companions.stormWolf) {
          saveData.companions.stormWolf.unlocked = true;
        }
        showStatChange('🥚 Companion Egg Received!');
      }
      
      // Give item
      if (quest.giveItem) {
        saveData.inventory.push(quest.giveItem);
        if (quest.autoEquip && saveData.equippedGear) {
          // Equip to appropriate slot based on item type
          const itemType = quest.giveItem.type || 'ring';
          saveData.equippedGear[itemType] = quest.giveItem;
          showStatChange(`🎯 ${quest.giveItem.name} Auto-Equipped!`);
        } else {
          showStatChange(`📦 ${quest.giveItem.name} Acquired!`);
        }
      }
      
      // --- AUTO-CHAIN: Activate next quest IMMEDIATELY (synchronous) ---
      let nextQuestActivated = null;
      if (quest.nextQuest && checkQuestConditions(quest.nextQuest)) {
        saveData.tutorialQuests.currentQuest = quest.nextQuest;
        if (quest.nextQuest === 'quest6_buyAttributes') {
          saveData.tutorialQuests.quest6AttrCount = 0;
        }
        nextQuestActivated = TUTORIAL_QUESTS[quest.nextQuest] || null;
        
        // Unlock building on ACTIVATION for next quest (so player can complete it)
        if (nextQuestActivated && nextQuestActivated.unlockBuildingOnActivation) {
          const bld = nextQuestActivated.unlockBuildingOnActivation;
          if (saveData.campBuildings[bld]) {
            saveData.campBuildings[bld].unlocked = true;
            if (saveData.campBuildings[bld].level === 0) { saveData.campBuildings[bld].level = 1; }
            const bldName = CAMP_BUILDINGS[bld]?.name || 'Building';
            showStatChange(`🏛️ ${bldName} Unlocked!`);
          }
        }
        
        // Give 1 attribute point when the Training Hall quest activates so player can complete it immediately
        if (nextQuestActivated && nextQuestActivated.id === 'quest4_upgradeAttr') {
          saveData.trainingPoints = (saveData.trainingPoints || 0) + 1;
          showStatChange('+1 Attribute Point! Spend it in the Training Hall!');
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
              if (!saveData.tutorialQuests.stonehengeChestCinematicShown) {
                triggerCinematic('stonehenge', window.stonehengeChest.position, 2000);
                saveData.tutorialQuests.stonehengeChestCinematicShown = true;
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
              if (!saveData.tutorialQuests.stonehengeChestCinematicShown) {
                triggerCinematic('stonehenge', window.stonehengeChest.position, 2000);
                saveData.tutorialQuests.stonehengeChestCinematicShown = true;
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
      const tq = saveData && saveData.tutorialQuests;
      if (!tq) return false;
      return (tq.readyToClaim && tq.readyToClaim.length > 0) ||
             (tq.firstDeathShown && !tq.currentQuest && !isQuestClaimed('quest1_kill3'));
    }
    
    // Update quest tracker in camp screen
    function updateQuestTracker() {
      const questTracker = document.getElementById('quest-tracker');
      if (!questTracker) return;
      
      const currentQuest = getCurrentQuest();
      const completedQuests = (saveData.tutorialQuests && saveData.tutorialQuests.completedQuests) || [];
      const readyToClaim = (saveData.tutorialQuests && saveData.tutorialQuests.readyToClaim) || [];
      
      // Hide tracker if no quest is active or ready, and no recently completed quest, and player hasn't died yet
      if (!saveData.tutorialQuests.firstDeathShown && !currentQuest && completedQuests.length === 0) {
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
      if (currentQuest && saveData.tutorialQuests.firstDeathShown) {
        // Build progress info for kill-based quests
        let progressText = '';
        const killsNow = (saveData.tutorialQuests && saveData.tutorialQuests.killsThisRun) || 0;
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
        const stonehengePos = { x: -60, z: 60 };
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
      const wasGameActive = isGameActive && !isGameOver;
      if (wasGameActive) setGamePaused(true);
      // Clear quest notification for the main building
      if (!saveData.storyQuests.questNotifications) {
        saveData.storyQuests.questNotifications = {};
      }
      saveData.storyQuests.questNotifications.questMission = false;
      saveSaveData();
      
      // Activate quest1 the first time the player enters the Main Building after their first run
      if (
        saveData.tutorialQuests.firstDeathShown &&
        isQuestClaimed('firstRunDeath') &&
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
                <b>YOUR MISSION:</b> Head back out and eliminate <b>7 enemies</b> in a single run.<br><br>
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
          Completed Quests: ${saveData.tutorialQuests.completedQuests.length} / 8
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
        if (rewardCycle === 0) {
          saveData.unspentAttributePoints = (saveData.unspentAttributePoints || 0) + 1;
          showEnhancedNotification('attribute', 'ACCOUNT LEVEL UP!', `Level ${saveData.accountLevel}! +1 Attribute Point`);
        } else if (rewardCycle === 1) {
          saveData.skillPoints = (saveData.skillPoints || 0) + 1;
          showEnhancedNotification('unlock', 'ACCOUNT LEVEL UP!', `Level ${saveData.accountLevel}! +1 Skill Point`);
        } else if (rewardCycle === 2) {
          saveData.trainingPoints = (saveData.trainingPoints || 0) + 1;
          showEnhancedNotification('attribute', 'ACCOUNT LEVEL UP!', `Level ${saveData.accountLevel}! +1 Training Point`);
        } else {
          saveData.gold = (saveData.gold || 0) + 100;
          showEnhancedNotification('achievement', 'ACCOUNT LEVEL UP!', `Level ${saveData.accountLevel}! +100 Gold`);
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
      const level = saveData.accountLevel || 1;
      const xp = saveData.accountXP || 0;
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
      if (!saveData.hasVisitedCamp) {
        saveData.hasVisitedCamp = true;
        // NEW: Only unlock Quest/Mission Hall initially - all other buildings locked
        saveData.campBuildings.questMission.unlocked = true;
        saveData.campBuildings.questMission.level = 1;
        // Keep other free buildings locked initially
        saveData.campBuildings.inventory.unlocked = false;
        saveData.campBuildings.inventory.level = 0;
        saveData.campBuildings.campHub.unlocked = false;
        saveData.campBuildings.campHub.level = 0;
        
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
              if (buildingId === 'companionHouse' && saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest5_breedCompanion') progressTutorialQuest('quest5_breedCompanion', true);
            } else {
              playSound('invalid');
              showStatusMessage(`🔒 Complete "${questInfo.label}" to unlock this building!`, 2500);
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
          const hasNotification = (buildingId === 'questMission' && saveData.tutorialQuests.readyToClaim && saveData.tutorialQuests.readyToClaim.length > 0) ||
                                 (saveData.storyQuests.questNotifications && saveData.storyQuests.questNotifications[buildingId]);
          
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
      skillPointsDisplay.textContent = `Skill Points Available: ${saveData.skillPoints}`;
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

    // --- WORLD GENERATION ---
    function createWorld() {
      // Ground - Unified green forest world
      const mapSize = 600;
      
      // Single lush green ground plane covering the whole map
      const mainGroundGeo = new THREE.PlaneGeometry(mapSize, mapSize);
      const mainGroundMat = new THREE.MeshToonMaterial({ color: COLORS.ground }); // Green grass
      const mainGround = new THREE.Mesh(mainGroundGeo, mainGroundMat);
      mainGround.rotation.x = -Math.PI / 2;
      mainGround.position.set(0, 0, 0);
      mainGround.receiveShadow = true;
      scene.add(mainGround);
      
      // Darker forest floor ring around the fountain spawn area
      const forestRingMat = new THREE.MeshToonMaterial({ color: 0x2E5A1A }); // Dark forest green, no transparency needed
      const forestRingGeo = new THREE.RingGeometry(12, 45, 32);
      const forestRingMesh = new THREE.Mesh(forestRingGeo, forestRingMat);
      forestRingMesh.rotation.x = -Math.PI / 2;
      forestRingMesh.position.set(0, 0.005, 0);
      scene.add(forestRingMesh);
      
      // NOTE: Lake defined later using enhanced reflective lake
      
      // Add water ripple effect
      const rippleGeo = new THREE.RingGeometry(14, 15, 16); // Reduced segments for performance
      const rippleMat = new THREE.MeshBasicMaterial({ color: 0x3399FF, transparent: true, opacity: 0.5 });
      const ripple = new THREE.Mesh(rippleGeo, rippleMat);
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.set(30, 0.02, -30);
      ripple.userData = { isWaterRipple: true, phase: 0 };
      scene.add(ripple);

      // Phase 5: New Map Design - Clean Rondel and Main Paths (replacing Wagon Roads)
      
      // Central Rondel - Circular paved/gravel area around statue
      const rondelMat = new THREE.MeshPhysicalMaterial({ 
        color: 0xB0C4DE, // Light steel blue - matches water theme
        metalness: 0.1,
        roughness: 0.7,
      });
      const rondelRadius = 10;
      const rondelGeo = new THREE.CircleGeometry(rondelRadius, 64);
      const rondel = new THREE.Mesh(rondelGeo, rondelMat);
      rondel.rotation.x = -Math.PI/2;
      rondel.position.set(0, 0.02, 0);
      rondel.receiveShadow = true;
      scene.add(rondel);
      
      // Path material - brown dirt road
      const roadMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x8B7355, // Brown dirt
        metalness: 0.0,
        roughness: 0.9,
      });
      
      // Grass strip material for middle of roads
      const grassStripMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x5A7D3C, // Darker green grass
        metalness: 0.0,
        roughness: 0.85,
      });
      
      // Helper function to create wagon road with grass strip in middle
      function createWagonRoad(startX, startZ, endX, endZ, roadWidth = 4) {
        const length = Math.sqrt((endX - startX) ** 2 + (endZ - startZ) ** 2);
        const angle = Math.atan2(endZ - startZ, endX - startX);
        const midX = (startX + endX) / 2;
        const midZ = (startZ + endZ) / 2;
        
        // Create main road (brown dirt)
        const roadGeo = new THREE.PlaneGeometry(roadWidth, length);
        const road = new THREE.Mesh(roadGeo, roadMat);
        road.rotation.x = -Math.PI/2;
        road.rotation.z = angle - Math.PI/2;
        road.position.set(midX, 0.02, midZ);
        road.receiveShadow = true;
        scene.add(road);
        
        // Create grass strip in middle (1/3 width of road)
        const grassStripWidth = roadWidth / 3;
        const grassGeo = new THREE.PlaneGeometry(grassStripWidth, length);
        const grassStrip = new THREE.Mesh(grassGeo, grassStripMat);
        grassStrip.rotation.x = -Math.PI/2;
        grassStrip.rotation.z = angle - Math.PI/2;
        grassStrip.position.set(midX, 0.03, midZ); // Slightly above road
        grassStrip.receiveShadow = true;
        scene.add(grassStrip);
      }
      
      // 3 Main Wagon Roads from Central Hub (Rondel) - only to key regions
      // Roads start from different points on the rondel edge based on direction
      
      // 1. Road to Stonehenge (60, 60) - Northeast direction
      createWagonRoad(rondelRadius * 0.707, rondelRadius * 0.707, 60, 60, 4);
      
      // 2. Road to Windmill (40, 40) - East direction
      createWagonRoad(rondelRadius * 0.9, rondelRadius * 0.436, 40, 40, 4);
      
      // 3. Road to Tesla Tower (-80, -80) - Southwest direction
      createWagonRoad(-rondelRadius * 0.707, -rondelRadius * 0.707, -80, -80, 4);
      
      // Spawn Portal - ground ring at player spawn position (syncs with countdown)
      const spawnPortalOuter = new THREE.RingGeometry(1.8, 2.4, 24);
      const spawnPortalInner = new THREE.CircleGeometry(1.8, 24);
      const spawnPortalOuterMat = new THREE.MeshBasicMaterial({ color: 0x00FFCC, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
      const spawnPortalInnerMat = new THREE.MeshBasicMaterial({ color: 0x00FFCC, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
      const spawnPortalRing = new THREE.Mesh(spawnPortalOuter, spawnPortalOuterMat);
      const spawnPortalDisc = new THREE.Mesh(spawnPortalInner, spawnPortalInnerMat);
      spawnPortalRing.rotation.x = -Math.PI / 2;
      spawnPortalDisc.rotation.x = -Math.PI / 2;
      spawnPortalRing.position.set(12, 0.06, 0);
      spawnPortalDisc.position.set(12, 0.05, 0);
      scene.add(spawnPortalRing);
      scene.add(spawnPortalDisc);
      window.spawnPortal = { ring: spawnPortalRing, disc: spawnPortalDisc, ringMat: spawnPortalOuterMat, discMat: spawnPortalInnerMat, phase: 0, active: true };
      
      // Farm Fields - Fill empty spaces with farm texture
      // Create large farm field background (performance optimized - single large mesh)
      const farmFieldMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x6B8E23, // Olive drab green for farmland
        metalness: 0.0,
        roughness: 0.95,
      });
      
      // Create farm field patches in strategic locations
      const farmFields = [
        { x: 20, z: 20, size: 15 },   // Near windmill
        { x: -30, z: 20, size: 20 },  // Near mine
        { x: 20, z: -20, size: 15 },  // Near lake
        { x: 45, z: 45, size: 12 },   // Around stonehenge approach
      ];
      
      farmFields.forEach(field => {
        const fieldGeo = new THREE.PlaneGeometry(field.size, field.size);
        const fieldMesh = new THREE.Mesh(fieldGeo, farmFieldMat);
        fieldMesh.rotation.x = -Math.PI/2;
        fieldMesh.position.set(field.x, 0.01, field.z);
        fieldMesh.receiveShadow = true;
        scene.add(fieldMesh);
      });

      // Wooden fences around play area - now breakable!
      window.breakableFences = []; // Store all fences for collision/damage detection
      const fenceMat = new THREE.MeshToonMaterial({ color: 0x8B4513 });
      const postGeo = new THREE.BoxGeometry(0.3, 2, 0.3);
      const railGeo = new THREE.BoxGeometry(4, 0.2, 0.2);
      
      // Create fence segments around perimeter
      for(let i=0; i<40; i++) {
        const angle = (i / 40) * Math.PI * 2;
        const x = Math.cos(angle) * 85;
        const z = Math.sin(angle) * 85;
        
        // Fence post
        const post = new THREE.Mesh(postGeo, fenceMat.clone());
        post.position.set(x, 1, z);
        post.castShadow = true;
        post.userData = { isFence: true, hp: 15, maxHp: 15, originalPosition: post.position.clone() };
        scene.add(post);
        window.breakableFences.push(post);
        
        // Fence rail
        if (i % 2 === 0) {
          const rail = new THREE.Mesh(railGeo, fenceMat.clone());
          rail.position.set(x, 1, z);
          rail.rotation.y = angle;
          rail.userData = { isFence: true, hp: 10, maxHp: 10, originalPosition: rail.position.clone(), railAngle: angle };
          scene.add(rail);
          window.breakableFences.push(rail);
        }
      }

      // Cabin (Box)
      const cabinGeo = new THREE.BoxGeometry(6, 5, 6);
      const cabinMat = new THREE.MeshToonMaterial({ color: COLORS.cabin });
      const cabin = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.set(-20, 2.5, -20);
      cabin.castShadow = true;
      cabin.receiveShadow = true;
      scene.add(cabin);

      // Windmill with improvements
      const wmGroup = new THREE.Group();
      wmGroup.position.set(40, 0, 40);
      const wmBase = new THREE.Mesh(new THREE.CylinderGeometry(2, 3, 8, 8), new THREE.MeshToonMaterial({color: 0xD2B48C})); // Beige
      wmBase.position.y = 4;
      wmBase.castShadow = true;
      wmBase.receiveShadow = true;
      wmGroup.add(wmBase);
      
      // Add door to windmill
      const wmDoor = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 3, 0.3),
        new THREE.MeshToonMaterial({color: 0x3a2a1a})
      );
      wmDoor.position.set(0, 1.5, 2.8);
      wmGroup.add(wmDoor);
      
      // Add light on windmill (glowing sphere)
      const wmLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 16, 16),
        new THREE.MeshBasicMaterial({color: 0xFFFF00})
      );
      wmLight.position.set(0, 9, 0);
      wmGroup.add(wmLight);
      
      // Add ground light circle
      const groundLightGeo = new THREE.CircleGeometry(5, 32);
      const groundLightMat = new THREE.MeshBasicMaterial({
        color: 0xFFFFAA,
        transparent: true,
        opacity: 0.2
      });
      const groundLight = new THREE.Mesh(groundLightGeo, groundLightMat);
      groundLight.rotation.x = -Math.PI/2;
      groundLight.position.set(40, 0.05, 40);
      scene.add(groundLight);
      
      const wmBlades = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 1), new THREE.MeshBasicMaterial({color: 0x8B4513})); // Brown
      wmBlades.position.set(0, 7, 2);
      wmBlades.castShadow = true;
      wmGroup.add(wmBlades);
      const wmBlades2 = wmBlades.clone();
      wmBlades2.rotation.z = Math.PI/2;
      wmBlades2.castShadow = true;
      wmGroup.add(wmBlades2);
      
      // Add broken/damaged blade (third blade bent and damaged)
      const brokenBlade = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 0.9), new THREE.MeshBasicMaterial({color: 0x654321})); // Darker brown (damaged)
      brokenBlade.position.set(-3, 7, 2);
      brokenBlade.rotation.z = Math.PI * 0.15; // Bent at angle
      brokenBlade.castShadow = true;
      wmGroup.add(brokenBlade);
      
      // Store blades reference for rotation animation
      wmGroup.userData = { isWindmill: true, blades: [wmBlades, wmBlades2], hp: 600, maxHp: 600, questActive: false, light: wmLight };
      scene.add(wmGroup);
      
      // Phase 5: Add "QUEST HERE" signpost at Windmill entrance
      const signpostGroup = new THREE.Group();
      signpostGroup.position.set(40, 0, 45); // In front of windmill
      
      // Signpost pole
      const signPoleGeo = new THREE.CylinderGeometry(0.2, 0.2, 3, 8);
      const signPoleMat = new THREE.MeshToonMaterial({ color: 0x8B4513 }); // Brown wood
      const signPole = new THREE.Mesh(signPoleGeo, signPoleMat);
      signPole.position.y = 1.5;
      signpostGroup.add(signPole);
      
      // Signpost board
      const signBoardGeo = new THREE.BoxGeometry(4, 1.2, 0.2);
      const signBoardMat = new THREE.MeshToonMaterial({ color: 0xD2B48C }); // Tan wood
      const signBoard = new THREE.Mesh(signBoardGeo, signBoardMat);
      signBoard.position.y = 3.2;
      signpostGroup.add(signBoard);
      
      // Add text sprite for "QUEST HERE"
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#8B0000'; // Dark red text
      ctx.font = 'bold 60px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('QUEST HERE', 256, 64);
      
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(3.5, 0.875, 1);
      sprite.position.y = 3.2;
      signpostGroup.add(sprite);
      
      scene.add(signpostGroup);

      // Farmer NPC near windmill (between windmill and barn)
      (function() {
        const farmerGroup = new THREE.Group();
        farmerGroup.position.set(44, 0, 44); // Between windmill and barn
        // Body
        const bodyMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 1.2, 0.5),
          new THREE.MeshToonMaterial({ color: 0x8B4513 }) // brown shirt
        );
        bodyMesh.position.y = 1.4;
        bodyMesh.castShadow = true;
        farmerGroup.add(bodyMesh);
        // Legs
        const legMat = new THREE.MeshToonMaterial({ color: 0x4b3621 }); // dark brown trousers
        [-0.2, 0.2].forEach(xOff => {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.4), legMat);
          leg.position.set(xOff, 0.6, 0);
          leg.castShadow = true;
          farmerGroup.add(leg);
        });
        // Head
        const headMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.7, 0.7),
          new THREE.MeshToonMaterial({ color: 0xf5cba7 }) // skin tone
        );
        headMesh.position.y = 2.35;
        headMesh.castShadow = true;
        farmerGroup.add(headMesh);
        // Hat brim
        const hatBrimMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.6, 0.6, 0.1, 8),
          new THREE.MeshToonMaterial({ color: 0x5C3317 })
        );
        hatBrimMesh.position.y = 2.75;
        farmerGroup.add(hatBrimMesh);
        // Hat top
        const hatTopMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.42, 0.5, 8),
          new THREE.MeshToonMaterial({ color: 0x5C3317 })
        );
        hatTopMesh.position.y = 3.05;
        farmerGroup.add(hatTopMesh);

        farmerGroup.userData = { isFarmerNPC: true };
        scene.add(farmerGroup);
        farmerNPC = farmerGroup;
      })();
      
      // Barn adjacent to windmill (not connected - placed to the north-east)
      const barnGroup = new THREE.Group();
      barnGroup.position.set(50, 0, 30); // Adjacent to windmill, not connected
      // Barn body
      const barnBodyGeo = new THREE.BoxGeometry(8, 5, 10);
      const barnBodyMat = new THREE.MeshToonMaterial({ color: 0xA0522D }); // Sienna red barn
      const barnBody = new THREE.Mesh(barnBodyGeo, barnBodyMat);
      barnBody.position.y = 2.5;
      barnBody.castShadow = true;
      barnGroup.add(barnBody);
      // Barn roof
      const barnRoofGeo = new THREE.CylinderGeometry(0.1, 6, 3.5, 4);
      const barnRoofMat = new THREE.MeshToonMaterial({ color: 0x5C3317 }); // Dark brown roof
      const barnRoof = new THREE.Mesh(barnRoofGeo, barnRoofMat);
      barnRoof.position.y = 6.75;
      barnRoof.rotation.y = Math.PI / 4;
      barnRoof.castShadow = true;
      barnGroup.add(barnRoof);
      // Barn door
      const barnDoorGeo = new THREE.BoxGeometry(3, 4, 0.2);
      const barnDoorMat = new THREE.MeshToonMaterial({ color: 0x3B1A08 });
      const barnDoor = new THREE.Mesh(barnDoorGeo, barnDoorMat);
      barnDoor.position.set(0, 2, 5.1);
      barnGroup.add(barnDoor);
      // Barn loft window
      const barnWindowGeo = new THREE.BoxGeometry(1.5, 1.5, 0.2);
      const barnWindowMat = new THREE.MeshToonMaterial({ color: 0xFFD700, emissive: 0xFFAA00, emissiveIntensity: 0.3 });
      const barnWindow = new THREE.Mesh(barnWindowGeo, barnWindowMat);
      barnWindow.position.set(0, 4.5, 5.1);
      barnGroup.add(barnWindow);
      scene.add(barnGroup);
      
      // Realistic farm fields: wide soil strips with crop rows, adjacent to barn+windmill
      const fieldSoilMat = new THREE.MeshToonMaterial({ color: 0x5C3A1A }); // Rich dark soil
      const cropMat = new THREE.MeshToonMaterial({ color: 0x7CBA3E }); // Crop green
      const windmillFieldGroup = new THREE.Group();
      windmillFieldGroup.position.set(55, 0, 42); // Adjacent to windmill+barn
      // Wide field base
      const fieldBaseMesh = new THREE.Mesh(new THREE.PlaneGeometry(18, 14), new THREE.MeshToonMaterial({ color: 0x5C3A1A }));
      fieldBaseMesh.rotation.x = -Math.PI / 2;
      fieldBaseMesh.position.set(0, 0.01, 0);
      windmillFieldGroup.add(fieldBaseMesh);
      // Plowed crop rows
      for (let row = 0; row < 7; row++) {
        // Soil row (darker strip)
        const rowMesh = new THREE.Mesh(new THREE.PlaneGeometry(18, 0.6), fieldSoilMat);
        rowMesh.rotation.x = -Math.PI / 2;
        rowMesh.position.set(0, 0.02, -4.5 + row * 1.5);
        windmillFieldGroup.add(rowMesh);
        // Crop plants along row
        for (let c = 0; c < 9; c++) {
          const cropGeo = new THREE.ConeGeometry(0.25, 0.8, 5);
          const crop = new THREE.Mesh(cropGeo, cropMat);
          crop.position.set(-8 + c * 2, 0.4, -4.5 + row * 1.5);
          windmillFieldGroup.add(crop);
        }
      }
      scene.add(windmillFieldGroup);
      
      // Mine
      const mineGeo = new THREE.DodecahedronGeometry(5);
      const mineMat = new THREE.MeshToonMaterial({ color: 0x555555 });
      const mine = new THREE.Mesh(mineGeo, mineMat);
      mine.position.set(-40, 2, 40);
      scene.add(mine);
      const mineEnt = new THREE.Mesh(new THREE.CircleGeometry(2, 16), new THREE.MeshBasicMaterial({color: 0x000000}));
      mineEnt.position.set(-40, 2, 44);
      mineEnt.rotation.y = Math.PI;
      scene.add(mineEnt);

      // Phase 4: Stonehenge - Circle of big rocks - Relocated to new mystical location
      const stonehengeGroup = new THREE.Group();
      stonehengeGroup.position.set(60, 0, 60); // New location - northeast area
      
      const stoneMat = new THREE.MeshToonMaterial({ color: 0x808080 }); // Gray stone
      const numStones = 30; // Real Stonehenge has ~30 stones in outer circle
      const stoneRadius = 15; // Larger circle for more realistic proportions
      
      for(let i=0; i<numStones; i++) {
        const angle = (i / numStones) * Math.PI * 2;
        const x = Math.cos(angle) * stoneRadius;
        const z = Math.sin(angle) * stoneRadius;
        
        // Vertical standing stone - realistic proportions (approx 1.5m wide × 5m tall × 1m thick)
        const stoneGeo = new THREE.BoxGeometry(1.5, 5, 1); 
        const stone = new THREE.Mesh(stoneGeo, stoneMat);
        stone.position.set(x, 2.5, z);
        stone.rotation.y = angle + Math.PI/2; // Face center
        stone.castShadow = true;
        stonehengeGroup.add(stone);
        
        // Horizontal cap stone on top (placed on every 6th stone pair for sparse distribution)
        if (i % 6 === 0 && i < 24) { // Places 4 caps total (at indices 0, 6, 12, 18)
          const nextAngle = ((i + 1) / numStones) * Math.PI * 2;
          const nextX = Math.cos(nextAngle) * stoneRadius;
          const nextZ = Math.sin(nextAngle) * stoneRadius;
          
          const capGeo = new THREE.BoxGeometry(3, 0.8, 1);
          const cap = new THREE.Mesh(capGeo, stoneMat);
          cap.position.set((x + nextX)/2, 5.4, (z + nextZ)/2);
          cap.rotation.y = angle + Math.PI/2;
          cap.castShadow = true;
          stonehengeGroup.add(cap);
        }
      }
      
      // Central altar stone - restore missing rock
      const altarGeo = new THREE.BoxGeometry(2, 1, 3);
      const altar = new THREE.Mesh(altarGeo, stoneMat);
      altar.position.set(0, 0.5, 0); // Center of Stonehenge circle
      altar.castShadow = true;
      stonehengeGroup.add(altar);
      
      scene.add(stonehengeGroup);
      
      // QUEST 6: Stonehenge Chest - Blue glowing chest for cigar quest
      const stonehengeChestGroup = new THREE.Group();
      
      // Chest body (blue rarity)
      const stoneChestGeo = new THREE.BoxGeometry(0.6, 0.5, 0.5);
      const stoneChestMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x4169E1, // Royal blue
        transparent: true,
        opacity: 0.95,
        metalness: 0.9,
        roughness: 0.2,
        emissive: 0x4169E1,
        emissiveIntensity: 0.6
      });
      const stoneChest = new THREE.Mesh(stoneChestGeo, stoneChestMat);
      stoneChest.position.y = 0.25;
      stoneChest.castShadow = true;
      stonehengeChestGroup.add(stoneChest);
      
      // Chest lid (slightly open)
      const stoneLidGeo = new THREE.BoxGeometry(0.62, 0.12, 0.52);
      const stoneLidMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x1E90FF, // Dodger blue
        metalness: 0.8,
        roughness: 0.3,
        emissive: 0x4169E1,
        emissiveIntensity: 0.4
      });
      const stoneLid = new THREE.Mesh(stoneLidGeo, stoneLidMat);
      stoneLid.position.set(0, 0.5, -0.12);
      stoneLid.rotation.x = -0.4; // Open to show blue light
      stoneLid.castShadow = true;
      stonehengeChestGroup.add(stoneLid);
      
      // Blue glow light from inside
      const blueGlowLight = new THREE.PointLight(0x4169E1, 3, 5);
      blueGlowLight.position.set(0, 0.3, 0);
      stonehengeChestGroup.add(blueGlowLight);
      
      // Position on altar
      stonehengeChestGroup.position.set(60, 1, 60); // On top of Stonehenge altar
      stonehengeChestGroup.userData = { 
        isStonehengeChest: true, 
        questItem: true,
        pickupRadius: 3 // 3 units proximity to auto-pickup
      };
      scene.add(stonehengeChestGroup);
      window.stonehengeChest = stonehengeChestGroup; // Store reference for proximity check

      // Mayan Pyramid - Stepped pyramid - MADE MORE VISIBLE
      const mayanGroup = new THREE.Group();
      mayanGroup.position.set(50, 0, -50);
      
      const pyramidMat = new THREE.MeshToonMaterial({ color: 0xD2B48C }); // Tan/beige like ancient stone
      const pyramidSteps = 6; // Increased from 5
      
      for(let i=0; i<pyramidSteps; i++) {
        const stepSize = 14 - i * 2; // Increased from (10 - i * 1.5)
        const stepHeight = 2.5; // Increased from 2
        const stepGeo = new THREE.BoxGeometry(stepSize, stepHeight, stepSize);
        const step = new THREE.Mesh(stepGeo, pyramidMat);
        step.position.set(0, i * stepHeight + stepHeight/2, 0);
        step.castShadow = true;
        mayanGroup.add(step);
      }
      
      // Temple on top - MADE LARGER
      const templeGeo = new THREE.BoxGeometry(4, 4, 4); // Increased from (3, 3, 3)
      const templeMat = new THREE.MeshToonMaterial({ color: 0x8B7355 }); // Darker brown
      const temple = new THREE.Mesh(templeGeo, templeMat);
      temple.position.set(0, pyramidSteps * 2.5 + 2, 0); // Adjusted for new step height
      temple.castShadow = true;
      mayanGroup.add(temple);
      
      // Phase 4: Eye of Horus on Maya Pyramid
      const eyeOfHorusGroup = new THREE.Group();
      eyeOfHorusGroup.position.set(0, pyramidSteps * 2.5 + 4, 2.5); // Front of temple
      
      // Eye outline (oval)
      const eyeOutlineGeo = new THREE.CircleGeometry(0.6, 16);
      const eyeOutlineMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const eyeOutline = new THREE.Mesh(eyeOutlineGeo, eyeOutlineMat);
      eyeOfHorusGroup.add(eyeOutline);
      
      // Eye white/sclera
      const eyeWhiteGeo = new THREE.CircleGeometry(0.3, 16);
      const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
      const eyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
      eyeWhite.position.z = 0.01;
      eyeOfHorusGroup.add(eyeWhite);
      
      // Pupil
      const pupilGeo = new THREE.CircleGeometry(0.15, 16);
      const pupilMat = new THREE.MeshBasicMaterial({ color: 0xFFD700 }); // Gold
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.z = 0.02;
      eyeOfHorusGroup.add(pupil);
      
      mayanGroup.add(eyeOfHorusGroup);
      
      // Add some decorative blocks on sides - MADE LARGER
      for(let side=0; side<4; side++) {
        const angle = (side / 4) * Math.PI * 2;
        const decorGeo = new THREE.BoxGeometry(0.8, 1.5, 0.8); // Increased from (0.5, 1, 0.5)
        const decor = new THREE.Mesh(decorGeo, new THREE.MeshToonMaterial({ color: 0xFFD700 })); // Gold
        const decorDist = 2.5; // Increased from 2
        decor.position.set(
          Math.cos(angle) * decorDist,
          pyramidSteps * 2.5 + 2.5,
          Math.sin(angle) * decorDist
        );
        decor.castShadow = true;
        mayanGroup.add(decor);
      }
      
      scene.add(mayanGroup);

      // Phase 4: Illuminati Pyramid - Pyramid with All-Seeing Eye, Fences, and Men in Black guards
      const illuminatiGroup = new THREE.Group();
      illuminatiGroup.position.set(-70, 0, 50); // New landmark location
      
      // Pyramid base and steps
      const illuminatiPyramidMat = new THREE.MeshToonMaterial({ color: 0xC0C0C0 }); // Silver/gray stone
      const illuminatiSteps = 5;
      
      for(let i = 0; i < illuminatiSteps; i++) {
        const stepSize = 12 - i * 2;
        const stepHeight = 2;
        const stepGeo = new THREE.BoxGeometry(stepSize, stepHeight, stepSize);
        const step = new THREE.Mesh(stepGeo, illuminatiPyramidMat);
        step.position.set(0, i * stepHeight + stepHeight/2, 0);
        step.castShadow = true;
        illuminatiGroup.add(step);
      }
      
      // Capstone (floating slightly)
      const capstoneGeo = new THREE.ConeGeometry(2, 2, 4);
      const capstoneMat = new THREE.MeshPhysicalMaterial({ 
        color: 0xFFD700, // Gold
        metalness: 0.8,
        roughness: 0.2,
        emissive: 0xFFD700,
        emissiveIntensity: 0.3
      });
      const capstone = new THREE.Mesh(capstoneGeo, capstoneMat);
      capstone.position.set(0, illuminatiSteps * 2 + 1.5, 0);
      capstone.rotation.y = Math.PI / 4;
      capstone.castShadow = true;
      illuminatiGroup.add(capstone);
      
      // All-Seeing Eye (on capstone)
      const allSeeingEyeGroup = new THREE.Group();
      allSeeingEyeGroup.position.set(0, illuminatiSteps * 2 + 1.5, 1.2);
      
      // Eye background (triangle)
      const eyeTriGeo = new THREE.CircleGeometry(0.8, 3);
      const eyeTriMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const eyeTri = new THREE.Mesh(eyeTriGeo, eyeTriMat);
      allSeeingEyeGroup.add(eyeTri);
      
      // Eye pupil
      const eyePupilGeo = new THREE.CircleGeometry(0.4, 16);
      const eyePupilMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
      const eyePupil = new THREE.Mesh(eyePupilGeo, eyePupilMat);
      eyePupil.position.z = 0.01;
      allSeeingEyeGroup.add(eyePupil);
      
      // Inner pupil
      const innerPupilGeo = new THREE.CircleGeometry(0.15, 16);
      const innerPupilMat = new THREE.MeshBasicMaterial({ color: 0x0000FF }); // Blue eye
      const innerPupil = new THREE.Mesh(innerPupilGeo, innerPupilMat);
      innerPupil.position.z = 0.02;
      allSeeingEyeGroup.add(innerPupil);
      
      illuminatiGroup.add(allSeeingEyeGroup);
      
      // Fences around pyramid (4 sides)
      const illuminatiFenceMat = new THREE.MeshToonMaterial({ color: 0x8B4513 }); // Brown
      for (let side = 0; side < 4; side++) {
        for (let i = 0; i < 8; i++) {
          const fencePostGeo = new THREE.BoxGeometry(0.3, 2, 0.3);
          const fencePost = new THREE.Mesh(fencePostGeo, illuminatiFenceMat);
          
          let x, z;
          if (side === 0) { // North
            x = -8 + i * 2;
            z = 10;
          } else if (side === 1) { // East
            x = 8;
            z = -8 + i * 2;
          } else if (side === 2) { // South
            x = 8 - i * 2;
            z = -10;
          } else { // West
            x = -8;
            z = 8 - i * 2;
          }
          
          fencePost.position.set(x, 1, z);
          fencePost.castShadow = true;
          illuminatiGroup.add(fencePost);
        }
      }
      
      // Men in Black guards (2 static sprites/shapes)
      const guardMat = new THREE.MeshToonMaterial({ color: 0x000000 }); // Black
      const guardPositions = [
        [0, 0, 12],  // Guard 1 (front)
        [0, 0, -12]  // Guard 2 (back)
      ];
      
      guardPositions.forEach(pos => {
        // Guard body (rectangle)
        const guardBodyGeo = new THREE.BoxGeometry(1, 2, 0.5);
        const guardBody = new THREE.Mesh(guardBodyGeo, guardMat);
        guardBody.position.set(pos[0], 1, pos[2]);
        guardBody.castShadow = true;
        illuminatiGroup.add(guardBody);
        
        // Guard head
        const guardHeadGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const guardHead = new THREE.Mesh(guardHeadGeo, guardMat);
        guardHead.position.set(pos[0], 2.3, pos[2]);
        guardHead.castShadow = true;
        illuminatiGroup.add(guardHead);
        
        // Sunglasses (white rectangles)
        const sunglassesGeo = new THREE.PlaneGeometry(0.5, 0.15);
        const sunglassesMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        const sunglasses = new THREE.Mesh(sunglassesGeo, sunglassesMat);
        sunglasses.position.set(pos[0], 2.3, pos[2] + 0.35);
        illuminatiGroup.add(sunglasses);
      });
      
      scene.add(illuminatiGroup);

      // Water Statue in Center - Replace brown square
      const statueGroup = new THREE.Group();
      statueGroup.position.set(0, 0, 0); // Center of map
      
      // Pedestal
      const pedestalGeo = new THREE.CylinderGeometry(1.5, 2, 1.5, 8);
      const pedestalMat = new THREE.MeshToonMaterial({ color: 0x87CEEB }); // Sky blue - matches water theme
      const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
      pedestal.position.y = 0.75;
      pedestal.castShadow = true;
      statueGroup.add(pedestal);
      
      // Water droplet statue (large blue droplet)
      const statueGeo = new THREE.SphereGeometry(1, 16, 16);
      const statueMat = new THREE.MeshPhysicalMaterial({ 
        color: COLORS.player,
        metalness: 0.3,
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.1
      });
      const statue = new THREE.Mesh(statueGeo, statueMat);
      statue.position.y = 2.5;
      statue.scale.y = 1.3; // Elongate to droplet shape
      statue.castShadow = true;
      statueGroup.add(statue);
      
      scene.add(statueGroup);

      // === FOUNTAIN AROUND CENTRAL STATUE ===
      // Circular water basin surrounding the statue
      const fountainBasinGeo = new THREE.RingGeometry(3.5, 5.5, 32);
      const fountainBasinMat = new THREE.MeshPhysicalMaterial({
        color: 0x6BAED6, // Medium blue water
        metalness: 0.2,
        roughness: 0.1,
        transparent: true,
        opacity: 0.85,
        emissive: 0x4FC3F7,
        emissiveIntensity: 0.15
      });
      const fountainBasin = new THREE.Mesh(fountainBasinGeo, fountainBasinMat);
      fountainBasin.rotation.x = -Math.PI / 2;
      fountainBasin.position.set(0, 0.04, 0);
      fountainBasin.userData = { isFountainWater: true, phase: 0 };
      scene.add(fountainBasin);

      // Fountain outer stone rim
      const fountainRimGeo = new THREE.TorusGeometry(5.5, 0.35, 8, 32);
      const fountainRimMat = new THREE.MeshToonMaterial({ color: 0xB0BEC5 }); // Light gray stone
      const fountainRim = new THREE.Mesh(fountainRimGeo, fountainRimMat);
      fountainRim.rotation.x = -Math.PI / 2;
      fountainRim.position.set(0, 0.35, 0);
      fountainRim.castShadow = true;
      scene.add(fountainRim);

      // Inner stone ring around pedestal base
      const fountainInnerRimGeo = new THREE.TorusGeometry(3.5, 0.25, 8, 24);
      const fountainInnerRim = new THREE.Mesh(fountainInnerRimGeo, fountainRimMat);
      fountainInnerRim.rotation.x = -Math.PI / 2;
      fountainInnerRim.position.set(0, 0.25, 0);
      scene.add(fountainInnerRim);

      // Fountain water jets (arcing streams from inner rim)
      window.fountainJets = [];
      for (let j = 0; j < 6; j++) {
        const jAngle = (j / 6) * Math.PI * 2;
        const jetGeo = new THREE.SphereGeometry(0.12, 6, 6);
        const jetMat = new THREE.MeshBasicMaterial({ color: 0xADD8E6, transparent: true, opacity: 0.7 });
        const jet = new THREE.Mesh(jetGeo, jetMat);
        jet.position.set(Math.cos(jAngle) * 3.5, 0.5, Math.sin(jAngle) * 3.5);
        jet.userData = { isFountainJet: true, angle: jAngle, phase: (j / 6) * Math.PI * 2 };
        scene.add(jet);
        window.fountainJets.push(jet);
      }

      // Flowers planted around fountain (outside the rim)
      const fountainFlowerColors = [0xFF69B4, 0xFF6347, 0xFFD700, 0xFF1493, 0x9370DB];
      const stemMat = new THREE.MeshToonMaterial({ color: 0x2E7D32 });
      for (let f = 0; f < 16; f++) {
        const fAngle = (f / 16) * Math.PI * 2 + 0.2;
        const fDist = 6.5 + (f % 3) * 0.8; // Vary distance slightly
        const fColor = fountainFlowerColors[f % fountainFlowerColors.length];

        // Stem
        const stemGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 4);
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.set(Math.cos(fAngle) * fDist, 0.25, Math.sin(fAngle) * fDist);
        scene.add(stem);

        // Flower head
        const petalGeo = new THREE.SphereGeometry(0.2, 6, 4);
        const petalMat = new THREE.MeshToonMaterial({ color: fColor });
        const petal = new THREE.Mesh(petalGeo, petalMat);
        petal.position.set(Math.cos(fAngle) * fDist, 0.65, Math.sin(fAngle) * fDist);
        petal.scale.y = 0.5;
        scene.add(petal);

        // Flower center
        const centerGeo = new THREE.SphereGeometry(0.08, 6, 4);
        const centerMat = new THREE.MeshToonMaterial({ color: 0xFFFF00 });
        const center = new THREE.Mesh(centerGeo, centerMat);
        center.position.set(Math.cos(fAngle) * fDist, 0.68, Math.sin(fAngle) * fDist);
        scene.add(center);
      }

      // Grass patches between flowers around fountain
      const fountainGrassMat = new THREE.MeshToonMaterial({ color: 0x4CAF50 });
      for (let g = 0; g < 24; g++) {
        const gAngle = (g / 24) * Math.PI * 2;
        const gDist = 6.0 + Math.sin(g * 1.3) * 0.5;
        const gGeo = new THREE.ConeGeometry(0.1, 0.4, 3);
        const grass = new THREE.Mesh(gGeo, fountainGrassMat);
        grass.position.set(Math.cos(gAngle) * gDist, 0.2, Math.sin(gAngle) * gDist);
        grass.rotation.x = (Math.random() - 0.5) * 0.3;
        grass.rotation.z = (Math.random() - 0.5) * 0.3;
        scene.add(grass);
      }

      // Comet Stone - Beside the lake where player spawns (brings the water droplet to life)
      const cometGroup = new THREE.Group();
      cometGroup.position.set(37, 0, -30); // Right beside lake where player spawns
      
      // Impact crater (dark brown ring)
      const craterGeo = new THREE.RingGeometry(2, 3, 16); // Reduced segments for performance
      const craterMat = new THREE.MeshToonMaterial({ color: 0x3E2723 }); // Dark brown
      const crater = new THREE.Mesh(craterGeo, craterMat);
      crater.rotation.x = -Math.PI/2;
      crater.position.y = 0.02;
      cometGroup.add(crater);
      
      // Comet stone (dark metallic rock with glow)
      const cometGeo = new THREE.DodecahedronGeometry(1.2, 1);
      const cometMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x1a1a1a, // Very dark gray, almost black
        metalness: 0.8,
        roughness: 0.3,
        emissive: 0x4FC3F7, // Blue glow
        emissiveIntensity: 0.3
      });
      const cometStone = new THREE.Mesh(cometGeo, cometMat);
      cometStone.position.y = 0.6;
      cometStone.castShadow = true;
      // Slight tilt for dramatic effect
      cometStone.rotation.x = 0.2;
      cometStone.rotation.z = 0.3;
      cometGroup.add(cometStone);
      
      // Glowing particles around comet stone
      for(let i=0; i<8; i++) {
        const particleGeo = new THREE.SphereGeometry(0.1, 8, 8);
        const particleMat = new THREE.MeshBasicMaterial({ 
          color: 0x4FC3F7,
          transparent: true,
          opacity: 0.6
        });
        const particle = new THREE.Mesh(particleGeo, particleMat);
        const angle = (i / 8) * Math.PI * 2;
        particle.position.set(
          Math.cos(angle) * 1.5,
          0.6 + Math.random() * 0.5,
          Math.sin(angle) * 1.5
        );
        particle.userData = { 
          isCometParticle: true,
          angle: angle,
          radius: 1.5,
          speed: 0.5 + Math.random() * 0.5,
          height: particle.position.y
        };
        cometGroup.add(particle);
      }
      
      scene.add(cometGroup);

      // Farm Area near windmill
      const farmGroup = new THREE.Group();
      farmGroup.position.set(50, 0, 35); // Moved further back from spawn
      
      // Wheat field (50 stalks)
      const wheatGeo = new THREE.ConeGeometry(0.1, 0.8, 4);
      const wheatMat = new THREE.MeshToonMaterial({ color: 0xF4A460 }); // Sandy brown
      for(let i=0; i<50; i++) {
        const wheat = new THREE.Mesh(wheatGeo, wheatMat);
        wheat.position.set(
          (Math.random() - 0.5) * 8,
          0.4,
          (Math.random() - 0.5) * 8
        );
        wheat.rotation.z = (Math.random() - 0.5) * 0.2;
        farmGroup.add(wheat);
      }
      
      // Barn (8x6x10)
      const barnGeo = new THREE.BoxGeometry(8, 6, 10);
      const barnMat = new THREE.MeshToonMaterial({ color: 0x8B0000 }); // Dark red
      const barn = new THREE.Mesh(barnGeo, barnMat);
      barn.position.set(12, 3, 0);
      barn.castShadow = true;
      farmGroup.add(barn);
      
      // Phase 4: Farm fields texture/area around barn (plowed field rows)
      const barnFieldMat = new THREE.MeshToonMaterial({ color: 0x654321 }); // Brown soil
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 8; col++) {
          const fieldPlot = new THREE.Mesh(
            new THREE.PlaneGeometry(1.5, 1.5),
            barnFieldMat
          );
          fieldPlot.rotation.x = -Math.PI / 2;
          fieldPlot.position.set(
            -2 + col * 2,
            0.02,
            -6 + row * 2
          );
          farmGroup.add(fieldPlot);
        }
      }
      
      // Barn roof
      const roofGeo = new THREE.ConeGeometry(7, 3, 4);
      const roofMat = new THREE.MeshToonMaterial({ color: 0x654321 }); // Brown
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(12, 7.5, 0);
      roof.rotation.y = Math.PI/4;
      farmGroup.add(roof);
      
      // Tractor with wheels
      const tractorBody = new THREE.Mesh(
        new THREE.BoxGeometry(2, 1.5, 3),
        new THREE.MeshToonMaterial({ color: 0x228B22 }) // Forest green
      );
      tractorBody.position.set(-8, 0.75, 0);
      farmGroup.add(tractorBody);
      
      // Tractor wheels (4 wheels)
      const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8);
      const wheelMat = new THREE.MeshToonMaterial({ color: 0x333333 });
      const wheelPositions = [
        [-8.8, 0.5, 1.2], [-8.8, 0.5, -1.2],
        [-7.2, 0.5, 1.2], [-7.2, 0.5, -1.2]
      ];
      wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(...pos);
        wheel.rotation.z = Math.PI/2;
        farmGroup.add(wheel);
      });
      
      scene.add(farmGroup);

      // Crystal Tower - 6 floating crystals with animation
      const crystalGroup = new THREE.Group();
      crystalGroup.position.set(-50, 0, 0);
      
      const crystalGeo = new THREE.OctahedronGeometry(1);
      for(let i=0; i<6; i++) {
        const crystalMat = new THREE.MeshPhysicalMaterial({
          color: 0x9B59B6, // Purple
          metalness: 0.5,
          roughness: 0.1,
          emissive: 0x9B59B6,
          emissiveIntensity: 0.3,
          transparent: true,
          opacity: 0.9
        });
        const crystal = new THREE.Mesh(crystalGeo, crystalMat);
        const angle = (i / 6) * Math.PI * 2;
        crystal.position.set(
          Math.cos(angle) * 5,
          3 + i * 1.5,
          Math.sin(angle) * 5
        );
        crystal.rotation.x = Math.random() * Math.PI;
        crystal.rotation.y = Math.random() * Math.PI;
        crystal.userData = { 
          isCrystal: true, 
          phase: i * Math.PI / 3,
          orbitSpeed: 0.5 + Math.random() * 0.5
        };
        crystal.castShadow = true;
        crystalGroup.add(crystal);
      }
      
      scene.add(crystalGroup);

      // Enhanced Waterfall - 3-tier cliffs with water drops and mist
      const waterfallGroup = new THREE.Group();
      waterfallGroup.position.set(20, 0, -50);
      
      // 3-tier cliffs
      const cliffMat = new THREE.MeshToonMaterial({ color: 0x708090 }); // Slate gray
      for(let tier=0; tier<3; tier++) {
        const cliffGeo = new THREE.BoxGeometry(10, 3, 2);
        const cliff = new THREE.Mesh(cliffGeo, cliffMat);
        cliff.position.set(0, tier * 3 + 1.5, tier * 2);
        cliff.castShadow = true;
        waterfallGroup.add(cliff);
        
        // Water flow (blue plane)
        const waterGeo = new THREE.PlaneGeometry(8, 3);
        const waterMat = new THREE.MeshBasicMaterial({ 
          color: COLORS.lake,
          transparent: true,
          opacity: 0.6
        });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.position.set(0, tier * 3 + 1.5, tier * 2 + 1.1);
        water.userData = { isWaterfall: true, tier: tier };
        waterfallGroup.add(water);
      }
      
      scene.add(waterfallGroup);

      // Reflective Lake - Enhanced with realistic water properties
      const enhancedLakeGeo = new THREE.CircleGeometry(18, 32);
      const enhancedLakeMat = new THREE.MeshPhysicalMaterial({ 
        color: COLORS.lake,
        metalness: 0.5, // Increased for better reflectivity
        roughness: 0.1, // Decreased for smoother, clearer reflections
        transparent: true,
        opacity: 0.85,
        reflectivity: 0.9, // Increased for enhanced water reflections
        clearcoat: 1.0, // Add clearcoat for wet surface look
        clearcoatRoughness: 0.1 // Smooth clearcoat for better reflections
      });
      const enhancedLake = new THREE.Mesh(enhancedLakeGeo, enhancedLakeMat);
      enhancedLake.rotation.x = -Math.PI / 2;
      enhancedLake.position.set(30, 0.01, -30);
      enhancedLake.receiveShadow = true; // Receive shadows for better depth
      scene.add(enhancedLake);
      
      // Sun sparkles on lake
      for(let i=0; i<10; i++) {
        const sparkleGeo = new THREE.CircleGeometry(0.3, 6);
        const sparkleMat = new THREE.MeshBasicMaterial({ 
          color: 0xFFFFFF,
          transparent: true,
          opacity: 0.8
        });
        const sparkle = new THREE.Mesh(sparkleGeo, sparkleMat);
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 15;
        sparkle.position.set(
          30 + Math.cos(angle) * dist,
          0.02,
          -30 + Math.sin(angle) * dist
        );
        sparkle.rotation.x = -Math.PI/2;
        sparkle.userData = { 
          isSparkle: true,
          phase: Math.random() * Math.PI * 2,
          speed: 1 + Math.random() * 2
        };
        scene.add(sparkle);
      }

      // === UNDERWATER LEGENDARY CHEST ===
      // Glowing legendary chest at the bottom/center of the lake
      const underwaterChestGroup = new THREE.Group();
      
      // Chest body (legendary gold/orange)
      const uwChestBodyGeo = new THREE.BoxGeometry(1.0, 0.8, 0.8);
      const uwChestBodyMat = new THREE.MeshPhysicalMaterial({
        color: 0xFFD700,
        metalness: 0.9,
        roughness: 0.15,
        emissive: 0xFFAA00,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.95
      });
      const uwChestBody = new THREE.Mesh(uwChestBodyGeo, uwChestBodyMat);
      uwChestBody.position.y = 0.4;
      uwChestBody.castShadow = true;
      underwaterChestGroup.add(uwChestBody);
      
      // Chest lid (slightly open, glowing)
      const uwChestLidGeo = new THREE.BoxGeometry(1.02, 0.25, 0.82);
      const uwChestLidMat = new THREE.MeshPhysicalMaterial({
        color: 0xFFC200,
        metalness: 0.85,
        roughness: 0.2,
        emissive: 0xFF8C00,
        emissiveIntensity: 0.6
      });
      const uwChestLid = new THREE.Mesh(uwChestLidGeo, uwChestLidMat);
      uwChestLid.position.set(0, 0.83, -0.15);
      uwChestLid.rotation.x = -0.5;
      underwaterChestGroup.add(uwChestLid);

      // Legendary glow effect (gold point light)
      const uwGlowLight = new THREE.PointLight(0xFFD700, 4, 8);
      uwGlowLight.position.set(0, 0.5, 0);
      underwaterChestGroup.add(uwGlowLight);
      
      // Shimmer ring below water surface
      const shimmerRingGeo = new THREE.RingGeometry(1.5, 2.2, 24);
      const shimmerRingMat = new THREE.MeshBasicMaterial({
        color: 0xFFD700,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
      });
      const shimmerRing = new THREE.Mesh(shimmerRingGeo, shimmerRingMat);
      shimmerRing.rotation.x = -Math.PI / 2;
      shimmerRing.position.y = 0.05;
      shimmerRing.userData = { isShimmerRing: true, phase: 0 };
      underwaterChestGroup.add(shimmerRing);
      
      // Place chest at lake center, slightly submerged
      underwaterChestGroup.position.set(30, -0.4, -30);
      underwaterChestGroup.userData = {
        isUnderwaterChest: true,
        collected: false,
        collectRadius: 5,
        shimmerRing: shimmerRing,
        glowLight: uwGlowLight
      };
      scene.add(underwaterChestGroup);
      window.underwaterChest = underwaterChestGroup;

      // More fences around farm area
      for(let i=0; i<20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const x = 35 + Math.cos(angle) * 15;
        const z = 35 + Math.sin(angle) * 15;
        
        const post = new THREE.Mesh(postGeo, fenceMat);
        post.position.set(x, 1, z);
        post.castShadow = true;
        scene.add(post);
        
        if (i % 2 === 0) {
          const rail = new THREE.Mesh(railGeo, fenceMat);
          rail.position.set(x, 1, z);
          rail.rotation.y = angle;
          scene.add(rail);
        }
      }

      // Montana Landmark - Snowy area in the north (snow biome)
      const montanaGroup = new THREE.Group();
      montanaGroup.position.set(0, 0, -200); // North in snow biome
      
      // Base platform
      const montanaBaseMat = new THREE.MeshToonMaterial({ color: 0xD3D3D3 }); // Light gray
      const montanaBase = new THREE.Mesh(
        new THREE.CylinderGeometry(8, 10, 3, 8),
        montanaBaseMat
      );
      montanaBase.position.y = 1.5;
      montanaBase.castShadow = true;
      montanaGroup.add(montanaBase);
      
      // Snowy mountain peaks (3 peaks)
      const montanaSnowMat = new THREE.MeshToonMaterial({ color: 0xFFFAFA }); // Snow white
      const peakPositions = [[0, 0], [-6, -3], [6, -3]];
      peakPositions.forEach((pos, idx) => {
        const peakHeight = idx === 0 ? 12 : 8;
        const peakGeo = new THREE.ConeGeometry(4, peakHeight, 4);
        const peak = new THREE.Mesh(peakGeo, montanaSnowMat);
        peak.position.set(pos[0], peakHeight/2 + 3, pos[1]);
        peak.castShadow = true;
        montanaGroup.add(peak);
      });
      
      // Pine trees around base (snow-covered)
      const snowyPineMat = new THREE.MeshToonMaterial({ color: 0x1B5E20 }); // Dark green
      for(let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const dist = 12;
        const pineGeo = new THREE.ConeGeometry(1.5, 4, 6);
        const pine = new THREE.Mesh(pineGeo, snowyPineMat);
        pine.position.set(
          Math.cos(angle) * dist,
          2,
          Math.sin(angle) * dist
        );
        pine.castShadow = true;
        montanaGroup.add(pine);
        
        // Snow cap on pine
        const snowCapGeo = new THREE.ConeGeometry(1.5, 1, 6);
        const snowCap = new THREE.Mesh(snowCapGeo, montanaSnowMat);
        snowCap.position.set(
          Math.cos(angle) * dist,
          3.5,
          Math.sin(angle) * dist
        );
        montanaGroup.add(snowCap);
      }
      
      // Montana text sign
      const montanaCanvas = document.createElement('canvas');
      montanaCanvas.width = 512;
      montanaCanvas.height = 128;
      const montanaCtx = montanaCanvas.getContext('2d');
      montanaCtx.fillStyle = '#1a237e'; // Dark blue
      montanaCtx.font = 'bold 60px Arial';
      montanaCtx.textAlign = 'center';
      montanaCtx.textBaseline = 'middle';
      montanaCtx.fillText('MONTANA', 256, 64);
      
      const montanaTexture = new THREE.CanvasTexture(montanaCanvas);
      const montanaSpriteMat = new THREE.SpriteMaterial({ map: montanaTexture });
      const montanaSprite = new THREE.Sprite(montanaSpriteMat);
      montanaSprite.scale.set(8, 2, 1);
      montanaSprite.position.y = 15;
      montanaGroup.add(montanaSprite);
      
      // Quest signpost
      const montanaSignGeo = new THREE.BoxGeometry(5, 1.5, 0.3);
      const montanaSignMat = new THREE.MeshToonMaterial({ color: 0xD2B48C });
      const montanaSign = new THREE.Mesh(montanaSignGeo, montanaSignMat);
      montanaSign.position.set(0, 2, 12);
      montanaGroup.add(montanaSign);
      
      const montanaQuestCanvas = document.createElement('canvas');
      montanaQuestCanvas.width = 512;
      montanaQuestCanvas.height = 128;
      const montanaQuestCtx = montanaQuestCanvas.getContext('2d');
      montanaQuestCtx.fillStyle = '#8B0000';
      montanaQuestCtx.font = 'bold 50px Arial';
      montanaQuestCtx.textAlign = 'center';
      montanaQuestCtx.textBaseline = 'middle';
      montanaQuestCtx.fillText('QUEST HERE', 256, 64);
      
      const montanaQuestTexture = new THREE.CanvasTexture(montanaQuestCanvas);
      const montanaQuestSpriteMat = new THREE.SpriteMaterial({ map: montanaQuestTexture });
      const montanaQuestSprite = new THREE.Sprite(montanaQuestSpriteMat);
      montanaQuestSprite.scale.set(4.5, 1.125, 1);
      montanaQuestSprite.position.set(0, 2, 12.2);
      montanaGroup.add(montanaQuestSprite);
      
      // Store reference for quest system
      montanaGroup.userData = { 
        isMontana: true
      };
      
      scene.add(montanaGroup);
      montanaLandmark = montanaGroup; // Store reference for efficient distance checks

      // Eiffel Tower Landmark - In fields/desert transition area
      const eiffelGroup = new THREE.Group();
      eiffelGroup.position.set(-80, 0, 150); // South-west in desert/fields transition
      
      // Tower structure - 4 legs converging to top
      const eiffelMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x8B7355, // Brown/bronze
        metalness: 0.6,
        roughness: 0.3
      });
      
      // Base platform
      const eiffelBaseMat = new THREE.MeshToonMaterial({ color: 0x808080 });
      const eiffelBase = new THREE.Mesh(
        new THREE.CylinderGeometry(12, 14, 2, 8),
        eiffelBaseMat
      );
      eiffelBase.position.y = 1;
      eiffelBase.castShadow = true;
      eiffelGroup.add(eiffelBase);
      
      // Four legs (corner posts)
      const legPositions = [
        [10, 0, 10], [10, 0, -10], [-10, 0, 10], [-10, 0, -10]
      ];
      legPositions.forEach(pos => {
        const legGeo = new THREE.CylinderGeometry(0.8, 1.2, 20, 6);
        const leg = new THREE.Mesh(legGeo, eiffelMat);
        leg.position.set(pos[0], 10, pos[2]);
        // Tilt legs inward
        const angle = Math.atan2(pos[2], pos[0]);
        leg.rotation.z = Math.cos(angle) * 0.15;
        leg.rotation.x = Math.sin(angle) * 0.15;
        leg.castShadow = true;
        eiffelGroup.add(leg);
      });
      
      // Mid section (narrower)
      const midSectionGeo = new THREE.CylinderGeometry(4, 8, 15, 8);
      const midSection = new THREE.Mesh(midSectionGeo, eiffelMat);
      midSection.position.y = 27.5;
      midSection.castShadow = true;
      eiffelGroup.add(midSection);
      
      // Top section (spire)
      const topSectionGeo = new THREE.CylinderGeometry(1, 4, 20, 8);
      const topSection = new THREE.Mesh(topSectionGeo, eiffelMat);
      topSection.position.y = 45;
      topSection.castShadow = true;
      eiffelGroup.add(topSection);
      
      // Spire tip
      const spireGeo = new THREE.CylinderGeometry(0.3, 1, 8, 6);
      const spire = new THREE.Mesh(spireGeo, eiffelMat);
      spire.position.y = 59;
      spire.castShadow = true;
      eiffelGroup.add(spire);
      
      // Cross beams for structure
      for(let i = 0; i < 3; i++) {
        const beamGeo = new THREE.BoxGeometry(20, 0.5, 0.5);
        const beam1 = new THREE.Mesh(beamGeo, eiffelMat);
        beam1.position.y = 5 + i * 8;
        beam1.castShadow = true;
        eiffelGroup.add(beam1);
        
        const beam2 = new THREE.Mesh(beamGeo, eiffelMat);
        beam2.position.y = 5 + i * 8;
        beam2.rotation.y = Math.PI / 2;
        beam2.castShadow = true;
        eiffelGroup.add(beam2);
      }
      
      // Eiffel text sign
      const eiffelCanvas = document.createElement('canvas');
      eiffelCanvas.width = 512;
      eiffelCanvas.height = 128;
      const eiffelCtx = eiffelCanvas.getContext('2d');
      eiffelCtx.fillStyle = '#8B0000';
      eiffelCtx.font = 'bold 55px Arial';
      eiffelCtx.textAlign = 'center';
      eiffelCtx.textBaseline = 'middle';
      eiffelCtx.fillText('EIFFEL TOWER', 256, 64);
      
      const eiffelTexture = new THREE.CanvasTexture(eiffelCanvas);
      const eiffelSpriteMat = new THREE.SpriteMaterial({ map: eiffelTexture });
      const eiffelSprite = new THREE.Sprite(eiffelSpriteMat);
      eiffelSprite.scale.set(10, 2.5, 1);
      eiffelSprite.position.y = 65;
      eiffelGroup.add(eiffelSprite);
      
      // Quest signpost
      const eiffelSignGeo = new THREE.BoxGeometry(5, 1.5, 0.3);
      const eiffelSignMat = new THREE.MeshToonMaterial({ color: 0xD2B48C });
      const eiffelSign = new THREE.Mesh(eiffelSignGeo, eiffelSignMat);
      eiffelSign.position.set(0, 2, 16);
      eiffelGroup.add(eiffelSign);
      
      const eiffelQuestCanvas = document.createElement('canvas');
      eiffelQuestCanvas.width = 512;
      eiffelQuestCanvas.height = 128;
      const eiffelQuestCtx = eiffelQuestCanvas.getContext('2d');
      eiffelQuestCtx.fillStyle = '#8B0000';
      eiffelQuestCtx.font = 'bold 50px Arial';
      eiffelQuestCtx.textAlign = 'center';
      eiffelQuestCtx.textBaseline = 'middle';
      eiffelQuestCtx.fillText('QUEST HERE', 256, 64);
      
      const eiffelQuestTexture = new THREE.CanvasTexture(eiffelQuestCanvas);
      const eiffelQuestSpriteMat = new THREE.SpriteMaterial({ map: eiffelQuestTexture });
      const eiffelQuestSprite = new THREE.Sprite(eiffelQuestSpriteMat);
      eiffelQuestSprite.scale.set(4.5, 1.125, 1);
      eiffelQuestSprite.position.set(0, 2, 16.2);
      eiffelGroup.add(eiffelQuestSprite);
      
      // Store reference for quest system
      eiffelGroup.userData = { 
        isEiffel: true
      };
      
      scene.add(eiffelGroup);
      eiffelLandmark = eiffelGroup; // Store reference for efficient distance checks

      // FRESH IMPLEMENTATION: Tesla Tower with Active Lightning Arcs
      const teslaGroup = new THREE.Group();
      teslaGroup.position.set(-80, 0, -80); // Northwest corner, distant location
      
      // Tower base - wider platform
      const teslaBaseGeo = new THREE.CylinderGeometry(3, 4, 2, 8);
      const teslaBaseMat = new THREE.MeshToonMaterial({ color: 0x555555 }); // Dark gray
      const teslaBase = new THREE.Mesh(teslaBaseGeo, teslaBaseMat);
      teslaBase.position.y = 1;
      teslaBase.castShadow = true;
      teslaGroup.add(teslaBase);
      
      // Main tower structure - tall metal cylinder
      const teslaTowerGeo = new THREE.CylinderGeometry(1.2, 1.5, 25, 12);
      const teslaTowerMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x888888, 
        metalness: 0.8,
        roughness: 0.3
      });
      const teslaTower = new THREE.Mesh(teslaTowerGeo, teslaTowerMat);
      teslaTower.position.y = 14.5;
      teslaTower.castShadow = true;
      teslaGroup.add(teslaTower);
      
      // Support rings along tower
      for (let i = 1; i <= 4; i++) {
        const ringGeo = new THREE.TorusGeometry(1.5, 0.15, 8, 16);
        const ringMat = new THREE.MeshPhysicalMaterial({ 
          color: 0xCC8800, 
          metalness: 0.9,
          roughness: 0.2
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = i * 5 + 2;
        ring.rotation.x = Math.PI / 2;
        teslaGroup.add(ring);
      }
      
      // Top coil - large torus
      const coilGeo = new THREE.TorusGeometry(2.5, 0.3, 12, 24);
      const coilMat = new THREE.MeshPhysicalMaterial({ 
        color: 0xFFCC00, 
        metalness: 1.0,
        roughness: 0.1,
        emissive: 0xFFCC00,
        emissiveIntensity: 0.5
      });
      const coil = new THREE.Mesh(coilGeo, coilMat);
      coil.position.y = 27;
      coil.rotation.x = Math.PI / 2;
      teslaGroup.add(coil);
      
      // Central ball on top - glowing sphere
      const ballGeo = new THREE.SphereGeometry(1, 16, 16);
      const ballMat = new THREE.MeshBasicMaterial({ 
        color: 0x00FFFF, 
        emissive: 0x00FFFF,
        emissiveIntensity: 1
      });
      const ball = new THREE.Mesh(ballGeo, ballMat);
      ball.position.y = 29;
      teslaGroup.add(ball);
      
      // Add glow effect around top ball
      const glowGeo = new THREE.SphereGeometry(1.5, 16, 16);
      const glowMat = new THREE.MeshBasicMaterial({ 
        color: 0x00FFFF, 
        transparent: true,
        opacity: 0.3
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.y = 29;
      teslaGroup.add(glow);
      
      // Lightning arc points (4 ground points around tower)
      const arcPoints = [
        new THREE.Vector3(-80 + 8, 0.5, -80),
        new THREE.Vector3(-80 - 8, 0.5, -80),
        new THREE.Vector3(-80, 0.5, -80 + 8),
        new THREE.Vector3(-80, 0.5, -80 - 8)
      ];
      
      // Store Tesla Tower data for animation
      teslaGroup.userData = { 
        isTeslaTower: true,
        arcPoints: arcPoints,
        topPosition: new THREE.Vector3(-80, 29, -80),
        arcLines: [] // Will store line meshes
      };
      
      scene.add(teslaGroup);

      // Forest (Various tree types with better shadows)
      const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 2, 6);
      const trunkMat = new THREE.MeshToonMaterial({ color: 0x8B4513 });
      const leavesGeo = new THREE.ConeGeometry(2.5, 5, 8);
      const treeMat = new THREE.MeshToonMaterial({ color: COLORS.forest });
      
      // Additional tree types
      const leavesGeo2 = new THREE.SphereGeometry(2, 8, 8); // Round tree
      const treeMat2 = new THREE.MeshToonMaterial({ color: 0x90EE90 }); // Light green
      const leavesGeo3 = new THREE.ConeGeometry(2, 6, 6); // Tall pine
      const treeMat3 = new THREE.MeshToonMaterial({ color: 0x228B22 }); // Forest green
      
      // Shadow circle under trees
      const shadowGeo = new THREE.CircleGeometry(2, 16);
      const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 });
      
      for (let i = 0; i < 120; i++) { // Increased from 50 to 120
        const group = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1;
        trunk.castShadow = true;
        
        // Randomly choose tree type
        const treeType = Math.floor(Math.random() * 3);
        let leaves;
        if (treeType === 0) {
          leaves = new THREE.Mesh(leavesGeo, treeMat);
          leaves.position.y = 4;
        } else if (treeType === 1) {
          leaves = new THREE.Mesh(leavesGeo2, treeMat2);
          leaves.position.y = 3.5;
        } else {
          leaves = new THREE.Mesh(leavesGeo3, treeMat3);
          leaves.position.y = 5;
        }
        leaves.castShadow = true;
        
        group.add(trunk);
        group.add(leaves);
        // Note: shadows are cast by the dirLight shadow map - no duplicate blob shadow needed
        
        // Random pos in forest area and spread across map
        // Lake exclusion zone constants
        const LAKE_CENTER_X = 30;
        const LAKE_CENTER_Z = -30;
        const LAKE_EXCLUSION_RADIUS = 18; // Lake radius 15 + buffer 3
        const MAX_SPAWN_ATTEMPTS = 20;
        
        // Phase 5: Simple exclusion - just avoid rondel center
        function isInRondel(x, z) {
          const distToCenter = Math.sqrt(x * x + z * z);
          return distToCenter < (rondelRadius + 2); // Rondel radius + buffer
        }
        
        let tx, tz;
        let inLake = true;
        let inRondel = true;
        let attempts = 0;
        
        // Avoid spawning trees in lake area and rondel
        while ((inLake || inRondel) && attempts < MAX_SPAWN_ATTEMPTS) {
          if (i < 80) {
            // First 80 trees in forest area (Top Left quadrant mostly)
            tx = (Math.random() * 100) - 90;
            tz = (Math.random() * 100) - 90;
          } else {
            // Remaining 40 trees spread across entire map
            tx = (Math.random() * 180) - 90;
            tz = (Math.random() * 180) - 90;
          }
          
          // Check if tree would be in lake
          const distToLake = Math.sqrt((tx - LAKE_CENTER_X) * (tx - LAKE_CENTER_X) + (tz - LAKE_CENTER_Z) * (tz - LAKE_CENTER_Z));
          inLake = distToLake < LAKE_EXCLUSION_RADIUS;
          
          // Check if tree would be in rondel
          inRondel = isInRondel(tx, tz);
          
          attempts++;
        }
        
        // Only add tree if not in lake and not in rondel
        if (!inLake && !inRondel) {
          group.position.set(tx, 0, tz);
          scene.add(group);
        }
      }
      
      // Extra forest trees in a ring around the fountain spawn area for the forest feel
      const forestTrunkMat2 = new THREE.MeshToonMaterial({ color: 0x4A2C0A });
      const forestLeavesMat2 = new THREE.MeshToonMaterial({ color: 0x1A5C1A });
      for (let f = 0; f < 28; f++) {
        const fAngle = (f / 28) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
        const fDist = 18 + Math.random() * 8; // Ring at 18-26 units from center
        const fx = Math.cos(fAngle) * fDist;
        const fz = Math.sin(fAngle) * fDist;
        // Skip trees in the player spawn zone (player spawns at x=12, z=0) or on roads
        if (fx > 8 && fx < 20 && Math.abs(fz) < 5) continue; // Exclusion: player spawn portal at (12,0,0)
        const fGroup = new THREE.Group();
        const fTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.5, 6), forestTrunkMat2);
        fTrunk.position.y = 1.25;
        fTrunk.castShadow = true;
        const fLeaves = new THREE.Mesh(new THREE.SphereGeometry(1.2 + Math.random() * 0.5, 7, 6), forestLeavesMat2);
        fLeaves.position.y = 3.2;
        fLeaves.castShadow = true;
        fGroup.add(fTrunk);
        fGroup.add(fLeaves);
        fGroup.position.set(fx, 0, fz);
        scene.add(fGroup);
      }
      const waterfallGroup2 = new THREE.Group();
      
      // Cliff/rock formation
      const cliffGeo2 = new THREE.BoxGeometry(8, 12, 6);
      const cliffMat2 = new THREE.MeshToonMaterial({ color: 0x696969 }); // Dark gray
      const cliff2 = new THREE.Mesh(cliffGeo2, cliffMat2);
      cliff2.position.set(30, 6, -45); // Above and behind the lake
      cliff2.castShadow = true;
      waterfallGroup2.add(cliff2);
      
      // Waterfall - multiple planes to simulate water flow
      const waterfallGeo = new THREE.PlaneGeometry(3, 12);
      const waterfallMat = new THREE.MeshBasicMaterial({ 
        color: 0x87CEEB, 
        transparent: true, 
        opacity: 0.6,
        side: THREE.DoubleSide
      });
      
      const waterfall = new THREE.Mesh(waterfallGeo, waterfallMat);
      waterfall.position.set(30, 6, -39);
      waterfall.rotation.x = -0.2; // Slight angle
      waterfall.userData = { isWaterfall: true, phase: 0 };
      waterfallGroup2.add(waterfall);
      
      // Add flowing water particles
      for(let i=0; i<5; i++) {
        const dropGeo = new THREE.SphereGeometry(0.3, 8, 8);
        const dropMat = new THREE.MeshBasicMaterial({ 
          color: 0x4ECDC4, 
          transparent: true, 
          opacity: 0.7 
        });
        const drop = new THREE.Mesh(dropGeo, dropMat);
        drop.position.set(30 + (Math.random()-0.5)*2, 12 - i*2, -39);
        drop.userData = { isWaterDrop: true, speed: 0.1 + Math.random()*0.1, startY: 12 - i*2 };
        waterfallGroup2.add(drop);
      }
      
      // Splash at bottom
      const splashGeo = new THREE.CircleGeometry(2, 16);
      const splashMat = new THREE.MeshBasicMaterial({ 
        color: 0xFFFFFF, 
        transparent: true, 
        opacity: 0.4 
      });
      const splash = new THREE.Mesh(splashGeo, splashMat);
      splash.rotation.x = -Math.PI/2;
      splash.position.set(30, 0.1, -33);
      splash.userData = { isSplash: true, phase: 0 };
      waterfallGroup2.add(splash);
      
      scene.add(waterfallGroup2);
      
      // Scatter flowers around environment
      const flowerGeo = new THREE.ConeGeometry(0.2, 0.5, 6);
      const flowerColors = [0xFF69B4, 0xFFFF00, 0xFF0000, 0xFFA500, 0xFFFFFF];
      
      for(let i=0; i<250; i++) {
        const flower = new THREE.Mesh(flowerGeo, new THREE.MeshBasicMaterial({ 
          color: flowerColors[Math.floor(Math.random() * flowerColors.length)] 
        }));
        flower.position.set(
          (Math.random() - 0.5) * 160,
          0.25,
          (Math.random() - 0.5) * 160
        );
        flower.rotation.x = -Math.PI/2;
        scene.add(flower);
      }
      
      // FRESH IMPLEMENTATION: Destructible Environment System
      // Trees (120), Barrels (30), Crates (25) with HP and damage stages
      window.destructibleProps = [];
      
      // Helper function to create a destructible prop
      function createDestructibleProp(type, position) {
        let mesh, hp, maxHp;
        
        if (type === 'tree') {
          // Tree: trunk + leaves
          const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3, 8);
          const trunkMat = new THREE.MeshToonMaterial({ color: 0x8B4513 });
          const trunk = new THREE.Mesh(trunkGeo, trunkMat.clone()); // Clone material for individual instances
          trunk.position.y = 1.5;
          trunk.castShadow = true;
          
          const leavesGeo = new THREE.SphereGeometry(1.5, 8, 8);
          const leavesMat = new THREE.MeshToonMaterial({ color: 0x228B22 });
          const leaves = new THREE.Mesh(leavesGeo, leavesMat.clone()); // Clone material
          leaves.position.y = 3.5;
          leaves.castShadow = true;
          
          const treeGroup = new THREE.Group();
          treeGroup.add(trunk);
          treeGroup.add(leaves);
          treeGroup.position.copy(position);
          scene.add(treeGroup);
          
          mesh = treeGroup;
          hp = 50;
          maxHp = 50;
          mesh.userData.trunk = trunk;
          mesh.userData.leaves = leaves;
          // Add sway animation data
          mesh.userData.swayPhase = Math.random() * Math.PI * 2; // Random starting phase
          mesh.userData.swaySpeed = 0.5 + Math.random() * 0.5; // Random sway speed
          mesh.userData.swayAmount = 0.05 + Math.random() * 0.05; // Sway intensity
        } else if (type === 'barrel') {
          // Barrel: cylinder
          const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 1, 8);
          const barrelMat = new THREE.MeshToonMaterial({ color: 0xA0522D });
          mesh = new THREE.Mesh(barrelGeo, barrelMat.clone()); // Clone material
          mesh.position.copy(position);
          mesh.position.y = 0.5;
          mesh.castShadow = true;
          scene.add(mesh);
          
          hp = 20;
          maxHp = 20;
        } else if (type === 'crate') {
          // Crate: box
          const crateGeo = new THREE.BoxGeometry(1, 1, 1);
          const crateMat = new THREE.MeshToonMaterial({ color: 0xD2691E });
          mesh = new THREE.Mesh(crateGeo, crateMat.clone()); // Clone material
          mesh.position.copy(position);
          mesh.position.y = 0.5;
          mesh.castShadow = true;
          scene.add(mesh);
          
          hp = 15;
          maxHp = 15;
        }
        
        return {
          type: type,
          mesh: mesh,
          hp: hp,
          maxHp: maxHp,
          destroyed: false,
          originalScale: mesh.scale.clone(),
          originalColor: type === 'tree' ? 
            { trunk: mesh.userData.trunk.material.color.clone(), leaves: mesh.userData.leaves.material.color.clone() } :
            mesh.material.color.clone()
        };
      }
      
      // Spawn Trees (120) - scattered across the map
      for (let i = 0; i < 120; i++) {
        const x = (Math.random() - 0.5) * 250; // Spread across map
        const z = (Math.random() - 0.5) * 250;
        // Avoid spawning too close to center (player start)
        if (Math.abs(x) < 15 && Math.abs(z) < 15) continue;
        
        const tree = createDestructibleProp('tree', new THREE.Vector3(x, 0, z));
        window.destructibleProps.push(tree);
      }
      
      // Spawn Barrels (30) - near landmarks and paths
      for (let i = 0; i < 30; i++) {
        const x = (Math.random() - 0.5) * 200;
        const z = (Math.random() - 0.5) * 200;
        // Avoid spawning too close to center
        if (Math.abs(x) < 15 && Math.abs(z) < 15) continue;
        
        const barrel = createDestructibleProp('barrel', new THREE.Vector3(x, 0, z));
        window.destructibleProps.push(barrel);
      }
      
      // Spawn Crates (25) - scattered around
      for (let i = 0; i < 25; i++) {
        const x = (Math.random() - 0.5) * 200;
        const z = (Math.random() - 0.5) * 200;
        // Avoid spawning too close to center
        if (Math.abs(x) < 15 && Math.abs(z) < 15) continue;
        
        const crate = createDestructibleProp('crate', new THREE.Vector3(x, 0, z));
        window.destructibleProps.push(crate);
      }
    }

    // Performance: Cache animated objects to avoid scene.traverse() every frame
    function cacheAnimatedObjects() {
      animatedSceneObjects = {
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
      
      scene.traverse(obj => {
        if (obj.userData.isWindmill) animatedSceneObjects.windmills.push(obj);
        else if (obj.userData.isWaterRipple) animatedSceneObjects.waterRipples.push(obj);
        else if (obj.userData.isSparkle) animatedSceneObjects.sparkles.push(obj);
        else if (obj.userData.isCrystal) animatedSceneObjects.crystals.push(obj);
        else if (obj.userData.isCometParticle) animatedSceneObjects.cometParticles.push(obj);
        else if (obj.userData.isWaterfall) animatedSceneObjects.waterfalls.push(obj);
        else if (obj.userData.isWaterDrop) animatedSceneObjects.waterDrops.push(obj);
        else if (obj.userData.isSplash) animatedSceneObjects.splashes.push(obj);
        else if (obj.userData.isTeslaTower) animatedSceneObjects.teslaTowers.push(obj);
      });
    }

    // Apply graphics quality settings
    function applyGraphicsQuality(quality) {
      if (!renderer || !window.dirLight) {
        console.warn('[Graphics Quality] Cannot apply settings: renderer or dirLight not initialized. Call after init() completes.');
        return;
      }
      
      // Dispose existing shadow maps to ensure proper reinitialization
      if (window.dirLight.shadow.map) {
        window.dirLight.shadow.map.dispose();
        window.dirLight.shadow.map = null;
      }
      
      switch(quality) {
        case 'low':
          // Low quality: Basic shadows, lower resolution
          renderer.shadowMap.enabled = true;
          renderer.shadowMap.type = THREE.BasicShadowMap;
          window.dirLight.shadow.mapSize.width = 512;
          window.dirLight.shadow.mapSize.height = 512;
          // Fixed 1:1 ratio for maximum performance on low-end devices
          renderer.setPixelRatio(1);
          break;
        
        case 'medium':
          // Medium quality: Soft shadows, balanced resolution
          renderer.shadowMap.enabled = true;
          renderer.shadowMap.type = THREE.PCFSoftShadowMap;
          window.dirLight.shadow.mapSize.width = 1024;
          window.dirLight.shadow.mapSize.height = 1024;
          // Cap at 1.5x device ratio for balanced quality/performance
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
          break;
        
        case 'high':
          // High quality: Best shadows, highest resolution
          renderer.shadowMap.enabled = true;
          renderer.shadowMap.type = THREE.PCFSoftShadowMap;
          window.dirLight.shadow.mapSize.width = 2048;
          window.dirLight.shadow.mapSize.height = 2048;
          // Cap at 2x device ratio for maximum visual quality
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          break;
      }
      
      // Force shadow map update
      renderer.shadowMap.needsUpdate = true;
      console.log(`[Graphics Quality] Applied ${quality} quality settings`);
    }

    // --- GAME LOGIC ---

    function init() {
      console.log('[Init] Starting game initialization...');
      // Load save data and settings first
      loadSaveData();
      loadSettings();
      
      // Scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(COLORS.bg);
      // Enhanced fog for depth - reacts to day/night cycle lighting
      // FOG FIX: Fog only at edges, clear visibility near player, balanced vertically
      // Near plane increased to 15 (was 10) - player area is completely clear
      // Far plane at 35 (was 28) - fog begins at edges only, not heavy at top
      // PERFORMANCE: Balanced for 60fps target while maintaining visibility
      // Tighter fog for better visibility around character - fog only at edges
      scene.fog = new THREE.Fog(COLORS.bg, RENDERER_CONFIG.fogNear, RENDERER_CONFIG.fogFar);
      
      // Phase 5: Initialize particle object pool for performance (100 particles pre-allocated)
      particlePool = new ObjectPool(
        () => new Particle(new THREE.Vector3(0, 0, 0), 0xFFFFFF),
        (particle) => particle.mesh.visible = false,
        100
      );

      // Camera (Orthographic for miniature look)
      // CAMERA FIX: Better angle and zoom - prevent zoom issues
      // Adjusted for better top-down view: distance 15 (balanced), angle (18,16,18) for better perspective
      // This provides clear visibility without being too close or too far
      const aspect = window.innerWidth / window.innerHeight;
      const d = RENDERER_CONFIG.cameraDistance; // Balanced distance for good visibility
      camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
      camera.position.set(RENDERER_CONFIG.cameraPositionX, RENDERER_CONFIG.cameraPositionY, RENDERER_CONFIG.cameraPositionZ); // Better angle - not too low, better visibility
      camera.lookAt(scene.position);

      // Renderer
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const gameContainer = document.getElementById('game-container');
      if (!gameContainer) {
        console.error('[Init] #game-container element not found - cannot append renderer canvas');
        throw new Error('game-container element missing from DOM');
      }
      gameContainer.appendChild(renderer.domElement);

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
      applyGraphicsQuality(gameSettings.graphicsQuality);

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
      updateBackgroundMusic();
      
      // Listeners
      setupInputs();
      setupMenus();
      window.addEventListener('resize', onWindowResize, false);
      
      // Start Loop - begin rendering immediately (non-blocking)
      animationFrameId = requestAnimationFrame(animate);
      
      // FRESH: Signal that module is ready (standalone loading script is waiting for this)
      // Don't call showLoadingScreen - standalone script handles it
      window.gameModuleReady = true;
      console.log('[Init] Game module ready - Three.js loaded, event listeners attached');
      
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
            document.querySelector('[data-quest-hall-overlay]') !== null ||
            document.getElementById('quest-popup-overlay') !== null ||
            document.getElementById('comic-info-overlay') !== null ||
            document.getElementById('comic-tutorial-modal')?.style.display === 'flex' ||
            document.getElementById('story-quest-modal')?.style.display === 'flex' ||
            windmillQuest.dialogueOpen;

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
    }
    window.startGame = startGame;
    
    // Countdown system (PR #70-71)
    function startCountdown() {
      countdownActive = true;
      countdownStep = 0;
      countdownTimer = 0;
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
      
      // Ensure game properly unpauses (use helper functions to sync window variables)
      setGamePaused(false);
      setGameActive(true);
      gameStartTime = Date.now();
      console.log('[Countdown] Game started - isPaused:', isPaused, 'isGameActive:', isGameActive);
    }
    
    function showProgressionShop() {
      const shopGrid = document.getElementById('shop-grid');
      shopGrid.innerHTML = '';
      
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
        setGameOver(true);
        setGameActive(false);
        stopDroneHum();
        saveData.totalRuns++;
        saveData.totalKills += playerStats.kills;
        saveSaveData();
        optionsMenu.style.display = 'none';
        updateCampScreen();
        
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
        applyGraphicsQuality(e.target.value);
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
        updateCampScreen();
        document.getElementById('camp-screen').style.display = 'flex';
        
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
        if (isGameActive) { setGamePaused(false); } else { showMainMenu(); }
      };
      
      document.getElementById('achievements-back-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('achievements-screen').style.display = 'none';
        if (isGameActive) { setGamePaused(false); } else { showMainMenu(); }
      };
      
      document.getElementById('attributes-back-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('attributes-screen').style.display = 'none';
        if (isGameActive) { setGamePaused(false); } else { showMainMenu(); }
      };
      
      document.getElementById('gear-back-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('gear-screen').style.display = 'none';
        if (isGameActive) { setGamePaused(false); } else { showMainMenu(); }
      };
      
      document.getElementById('credits-back-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('credits-screen').style.display = 'none';
        if (isGameActive) { setGamePaused(false); } else { showMainMenu(); }
      };
      
      document.getElementById('camp-back-btn').onclick = () => {
        playSound('waterdrop');
        document.getElementById('camp-screen').style.display = 'none';
        if (isGameActive) {
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
        updateCampScreen();
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
      waveCount++;
      
      // Phase 1 Performance Fix: Limit maximum enemies on screen
      const currentEnemyCount = enemies.filter(e => !e.isDead).length;
      
      // Skip spawning if we're at the limit
      if (currentEnemyCount >= GAME_CONFIG.maxEnemiesOnScreen) {
        return;
      }
      
      // Check if this is a mini-boss wave - expanded progression to 150
      // Mini-bosses appear after players cross upgrade thresholds (approx every 15 levels)
      const miniBossLevels = [10, 25, 40, 55, 70, 85, 100, 115, 130, 145];
      const isMiniBossWave = miniBossLevels.includes(playerStats.lvl) && !miniBossesSpawned.has(playerStats.lvl);
      
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
        createFloatingText("MINI-BOSS INCOMING!", player.mesh.position);
        
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
          enemies.push(new Enemy(supportType, supportX, supportZ, playerStats.lvl));
        }
        // Don't spawn additional regular wave enemies on mini-boss waves
        return;
      }
      
      // Scale spawn count with player level for increased difficulty
      // Early game (1-30): Much more enemies for harder challenge
      // Mid-game (31-75): Moderate but still challenging
      // Late-game (76-150): Aggressive endgame difficulty
      let baseCount, levelBonus, cap;
      
      if (playerStats.lvl <= 30) {
        // Early game: Very aggressive spawns (6-12 enemies per wave) - harder difficulty
        baseCount = 6 + Math.floor(waveCount / 2);
        levelBonus = Math.floor(playerStats.lvl / 3);
        cap = 12;
      } else if (playerStats.lvl <= 75) {
        // Mid-game: Challenging spawns (5-14 enemies per wave)
        baseCount = 5 + Math.floor(waveCount / 3);
        levelBonus = Math.floor(playerStats.lvl / 4);
        cap = 14;
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
        // 5: Flying (lvl 8+), 6-9: Hard variants (lvl 12+)
        let maxType = 2; // Start with 3 base types
        if (playerStats.lvl >= 8) maxType = 5; // Add slowing (3), ranged placeholder, and flying (5)
        if (playerStats.lvl >= 10) maxType = 5; // Add ranged enemies (4)
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
        
        enemies.push(new Enemy(type, ex, ez, playerStats.lvl));
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
        scene.add(decal);
        bloodDecals.push(decal);
      } else {
        // Reuse existing slot (O(1) circular overwrite)
        const old = bloodDecals[bloodDecalIndex];
        const initialOpacity = 0.6 + Math.random() * 0.3;
        old.position.set(pos.x + (Math.random() - 0.5) * 0.8, 0.02, pos.z + (Math.random() - 0.5) * 0.8);
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
      for (const decal of bloodDecals) {
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
        // Enforce global cap - just skip if full, particles expire naturally
        if (smokeParticles.length >= MAX_SMOKE_PARTICLES) continue;
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
        scene.add(smoke);
        smokeParticles.push({
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
      expGems.push(new ExpGem(x, z));
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
        const levelUpModal = document.getElementById('levelup-modal');
        if (!levelUpModal || levelUpModal.style.display !== 'flex') {
          levelUp();
        }
      }
      updateHUD();
    }

    function levelUp() {
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
          // Fallback: resume game so player isn't stuck
          levelUpPending = false;
          setGamePaused(false);
        }
      }, 800);
    }
    
    function checkPendingLevelUp() {
      levelUpPending = false;
      if (playerStats && playerStats.exp >= playerStats.expReq && !isGameOver && isGameActive) {
        const modal = document.getElementById('levelup-modal');
        if (!modal || modal.style.display !== 'flex') {
          levelUp();
        }
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
      checkPendingLevelUp();
    }
    window.forceGameUnpause = forceGameUnpause;

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
        `;
        document.head.appendChild(style);
      }
      
      setTimeout(() => {
        slowMoOverlay.remove();
      }, 1500);
    }
    
    function createLevelUpEffects() {
      // Water Fountain Effect - use particle pool to avoid GC spikes
      // (replaces 60 fountain droplets, 18 jet spheres, 20 head droplets, 30 ground droplets)
      spawnParticles(player.mesh.position, COLORS.player, 30); // main fountain burst
      spawnParticles(player.mesh.position, 0xFFFFFF, 10);      // white sparkles
      spawnParticles(player.mesh.position, 0x5DADE2, 20);      // blue water droplets
      
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
      ring.position.copy(player.mesh.position);
      ring.position.y = 0.05;
      ring.rotation.x = -Math.PI / 2;
      scene.add(ring);
      
      let ringLife = 70;
      const updateRing = () => {
        ringLife--;
        const scale = 1 + (70 - ringLife) * 0.18;
        ring.scale.set(scale, scale, 1);
        ring.material.opacity = Math.max(0, ringLife / 70);
        
        if (ringLife <= 0) {
          scene.remove(ring);
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
      ring2.position.copy(player.mesh.position);
      ring2.position.y = 0.05;
      ring2.rotation.x = -Math.PI / 2;
      scene.add(ring2);
      let ring2Life = 50;
      const updateRing2 = () => {
        ring2Life--;
        const s2 = 0.5 + (50 - ring2Life) * 0.22;
        ring2.scale.set(s2, s2, 1);
        ring2.material.opacity = Math.max(0, ring2Life / 50 * 0.85);
        if (ring2Life <= 0) {
          scene.remove(ring2);
          ring2Geo.dispose(); ring2Mat.dispose();
        } else requestAnimationFrame(updateRing2);
      };
      setTimeout(updateRing2, 80); // Slightly delayed second ring
      
      // Fountain/explosion of "LEVEL UP" text particles from player's head
      const texts = ["L", "E", "V", "E", "L", " ", "U", "P", "!"];
      
      for(let i=0; i<40; i++) {
        const angle = (i / 40) * Math.PI * 2;
        const speed = 0.15 + Math.random() * 0.35;
        const text = texts[i % texts.length];
        
        const particle = new LevelUpTextParticle(
          player.mesh.position.clone(),
          new THREE.Vector3(
            Math.cos(angle) * speed,
            0.4 + Math.random() * 0.6,
            Math.sin(angle) * speed
          ),
          text
        );
        particles.push(particle);
      }
      
      // Add regular colored particles
      for(let i=0; i<30; i++) {
        const angle = (i / 30) * Math.PI * 2;
        const speed = 0.2 + Math.random() * 0.3;
        const particle = new LevelUpParticle(
          player.mesh.position.clone(),
          new THREE.Vector3(
            Math.cos(angle) * speed,
            0.5 + Math.random() * 0.5,
            Math.sin(angle) * speed
          )
        );
        particles.push(particle);
      }
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
        scene.add(this.mesh);
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
          scene.remove(this.mesh);
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
    
    class LevelUpParticle {
      constructor(pos, vel) {
        const geo = new THREE.OctahedronGeometry(0.15);
        const mat = new THREE.MeshBasicMaterial({ color: 0xFFD700 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(pos);
        this.mesh.position.y += 1;
        this.vel = vel;
        scene.add(this.mesh);
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

    function showUpgradeModal(isBonusRound = false) {
      const modal = document.getElementById('levelup-modal');
      const list = document.getElementById('upgrade-list');
      list.innerHTML = '';
      // Reset header for two-press system
      const h2 = modal.querySelector('h2');
      if (h2) {
        h2.innerText = isBonusRound ? 'BONUS UPGRADE!' : 'LEVEL UP!';
        h2.style.color = isBonusRound ? '#FFD700' : '';
        h2.style.fontSize = '32px';
      }
      
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
            magnetRange += 1; 
            showStatChange('EXP Magnet Range +25% (Now: ' + magnetRange + ' units)');
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
            dashCooldown *= 0.8;
            dashDistance *= 1.3;
            player.dashDuration *= 0.9; // Slightly faster dash
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
            showStatChange('Piercing +1! (Total hits: ' + totalHits + ' enemies)');
          } 
        },
        { 
          id: 'double_cast', 
          icon: '🔀',
          title: 'DOUBLE CAST', 
          desc: 'Fires double shots from your current weapon (+1 projectile per stack)', 
          apply: () => { 
            playerStats.extraProjectiles = (playerStats.extraProjectiles || 0) + 1;
            showStatChange('Double Cast! (' + (playerStats.extraProjectiles + 1) + ' projectiles per shot)');
          } 
        },
        { 
          id: 'double_upgrade_chance', 
          icon: '🎲',
          title: 'DOUBLE UPGRADE CHANCE', 
          desc: 'Chance to get one more upgrade box after the original one (+25% per stack, max 100% at 4 stacks)', 
          apply: () => { 
            playerStats.doubleUpgradeChance = (playerStats.doubleUpgradeChance || 0) + 0.25;
            showStatChange('Double Upgrade Chance +25%! (Total: ' + Math.round(playerStats.doubleUpgradeChance * 100) + '%)');
          } 
        }
      ];

      // --- SPECIAL LEVELS ---
      
      // Quest 8: Force weapon choice when quest8_newWeapon is active (grant first new weapon)
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest8_newWeapon' &&
          ![4, 5, 8, 15, 20].includes(playerStats.lvl)) {
        modal.querySelector('h2').innerText = 'NEW WEAPON!';
        modal.querySelector('h2').style.fontSize = '36px';
        const allWeaponChoicesQ8 = [
          { id: 'sword', title: 'SLASHY SLASH', desc: 'Slash enemies in front', active: () => weapons.sword.active, apply: () => { weapons.sword.active = true; weapons.sword.level = 1; showStatChange('New Weapon: Sword'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'aura', title: 'ZAP ZONE', desc: 'Damage aura around you', active: () => weapons.aura.active, apply: () => { weapons.aura.active = true; weapons.aura.level = 1; showStatChange('New Weapon: Aura'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'meteor', title: 'SPACE ROCKS', desc: 'Call meteors from sky', active: () => weapons.meteor.active, apply: () => { weapons.meteor.active = true; weapons.meteor.level = 1; showStatChange('New Weapon: Meteor'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'icespear', title: 'ICE SPEAR', desc: 'Freezing projectile that slows enemies 40%', active: () => weapons.iceSpear.active, apply: () => { weapons.iceSpear.active = true; weapons.iceSpear.level = 1; showStatChange('New Weapon: Ice Spear'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'firering', title: 'FIRE RING', desc: 'Spinning fire orbs orbit around you', active: () => weapons.fireRing.active, apply: () => { weapons.fireRing.active = true; weapons.fireRing.level = 1; showStatChange('New Weapon: Fire Ring'); progressTutorialQuest('quest8_newWeapon', true); } }
        ];
        const availableQ8 = allWeaponChoicesQ8.filter(w => !w.active());
        choices = availableQ8.sort(() => 0.5 - Math.random()).slice(0, Math.min(3, availableQ8.length));
        if (choices.length < 3) {
          const fillers = commonUpgrades.sort(() => 0.5 - Math.random()).slice(0, 3 - choices.length);
          choices.push(...fillers);
        }
        choices.push(...commonUpgrades.sort(() => 0.5 - Math.random()).slice(0, 3));
      }
      // Levels 3, 9, 17, 23: WEAPON UPGRADE LEVELS
      else if ([3, 9, 17, 23].includes(playerStats.lvl)) {
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
                const drone = new DroneTurret(player);
                // Position offset for multiple drones
                const droneIndex = droneTurrets.length;
                const totalDrones = weapons.droneTurret.droneCount + 1; // Count after adding
                const angle = (droneIndex / totalDrones) * Math.PI * 2;
                drone.offset = new THREE.Vector3(
                  Math.cos(angle) * 2.5,
                  1.5,
                  Math.sin(angle) * 2.5
                );
                droneTurrets.push(drone);
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
      // WEAPON UNLOCK: Level 4, 5, 8, 15, 20 for new weapon unlocks
      else if ([4, 5, 8, 15, 20].includes(playerStats.lvl)) {
        modal.querySelector('h2').innerText = 'NEW WEAPON!';
        modal.querySelector('h2').style.fontSize = '36px';
        // Build list of all possible new weapons, filtering already-active ones
        const allWeaponChoices = [
          { id: 'sword', icon: '⚔️', title: 'SLASHY SLASH', desc: 'Slash enemies in front', active: () => weapons.sword.active, apply: () => { weapons.sword.active = true; weapons.sword.level = 1; showStatChange('New Weapon: Sword'); if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest8_newWeapon') progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'aura', icon: '🌀', title: 'ZAP ZONE', desc: 'Damage aura around you', active: () => weapons.aura.active, apply: () => { weapons.aura.active = true; weapons.aura.level = 1; showStatChange('New Weapon: Aura'); if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest8_newWeapon') progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'meteor', icon: '☄️', title: 'SPACE ROCKS', desc: 'Call meteors from sky', active: () => weapons.meteor.active, apply: () => { weapons.meteor.active = true; weapons.meteor.level = 1; showStatChange('New Weapon: Meteor'); if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest8_newWeapon') progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'droneturret', icon: '🤖', title: 'DRONE TURRET', desc: 'Automated drone that shoots enemies', active: () => weapons.droneTurret.active, apply: () => { weapons.droneTurret.active = true; weapons.droneTurret.level = 1; const drone = new DroneTurret(player); droneTurrets.push(drone); startDroneHum(); showStatChange('New Weapon: Drone Turret'); if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest8_newWeapon') progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'doublebarrel', icon: '🔫', title: 'DOUBLE BARREL', desc: 'Powerful shotgun spread', active: () => weapons.doubleBarrel.active, apply: () => { weapons.doubleBarrel.active = true; weapons.doubleBarrel.level = 1; showStatChange('New Weapon: Double Barrel'); if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest8_newWeapon') progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'icespear', icon: '❄️', title: 'ICE SPEAR', desc: 'Freezing projectile that slows enemies 40%', active: () => weapons.iceSpear.active, apply: () => { weapons.iceSpear.active = true; weapons.iceSpear.level = 1; showStatChange('New Weapon: Ice Spear'); if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest8_newWeapon') progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'firering', icon: '🔥', title: 'FIRE RING', desc: 'Spinning fire orbs orbit around you', active: () => weapons.fireRing.active, apply: () => { weapons.fireRing.active = true; weapons.fireRing.level = 1; showStatChange('New Weapon: Fire Ring'); if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest8_newWeapon') progressTutorialQuest('quest8_newWeapon', true); } }
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

      try {
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
        
        let autoConfirmTimer = null;
        card.onclick = () => {
          const allCards = list.querySelectorAll('.upgrade-card');
          
          // First press: highlight chosen card, then auto-confirm after 0.1 seconds
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
            // Auto-confirm after 0.1 seconds; store timer to allow cancellation
            autoConfirmTimer = setTimeout(() => { autoConfirmTimer = null; if (card.dataset.selected === '1') card.click(); }, 100);
            return;
          }
          
          // Confirm: clear pending auto-confirm timer, apply upgrade
          if (autoConfirmTimer) { clearTimeout(autoConfirmTimer); autoConfirmTimer = null; }
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
          
          // Always close modal
          modal.style.display = 'none';
          modal.querySelector('h2').innerText = 'LEVEL UP!';
          modal.querySelector('h2').style.fontSize = '32px';
          modal.querySelector('h2').style.color = '';
          // Hide skip button and clear its timeout
          const skipBtn = document.getElementById('levelup-skip-btn');
          if (skipBtn) skipBtn.style.display = 'none';
          clearTimeout(window.levelupSkipTimeoutId);
          
          // Restore camera position and projection after level-up
          if (savedCameraPosition) {
            camera.position.set(savedCameraPosition.x, savedCameraPosition.y, savedCameraPosition.z);
            camera.left = savedCameraPosition.left;
            camera.right = savedCameraPosition.right;
            camera.top = savedCameraPosition.top;
            camera.bottom = savedCameraPosition.bottom;
            camera.updateProjectionMatrix();
            savedCameraPosition = null; // Clear after restoration
          }
          
          // Check for Double Upgrade Chance bonus (only on the first pick, not on bonus rounds)
          if (!isBonusRound && playerStats.doubleUpgradeChance > 0) {
            const bonusChance = Math.min(1.0, playerStats.doubleUpgradeChance);
            if (Math.random() < bonusChance) {
              // Bonus round: reopen modal with a new set of choices without unpausing
              showUpgradeModal(true);
              // Resume combo timer
              if (comboState.pausedAt) {
                const pauseDuration = Date.now() - comboState.pausedAt;
                comboState.lastKillTime += pauseDuration;
                comboState.pausedAt = null;
              }
              lastHudUpdateMs = 0; // Force HUD refresh
              updateHUD();
              return;
            }
          }
          
          forceGameUnpause();
          
          // Resume combo timer after level-up
          if (comboState.pausedAt) {
            const pauseDuration = Date.now() - comboState.pausedAt;
            comboState.lastKillTime += pauseDuration;
            comboState.pausedAt = null;
          }
          
          lastHudUpdateMs = 0; // Force HUD refresh after level-up
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
      } catch(cardErr) {
        console.error('[LevelUp] Card generation error:', cardErr);
        // Fallback: ensure game unpauses if card creation fails
        levelUpPending = false;
        setGamePaused(false);
        return;
      }

      modal.style.display = 'flex';
      
      // Show skip button after 5 seconds as safety valve if player can't select an upgrade
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
    
    let lastHudUpdateMs = 0;
    function updateHUD() {
      const nowMs = Date.now();
      if (nowMs - lastHudUpdateMs < 100) return; // Throttle DOM updates to max 10/sec
      lastHudUpdateMs = nowMs;
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
      
      // REGION DISPLAY: Update current region based on player position
      updateRegionDisplay();
    }
    
    // Region display update function
    function updateRegionDisplay() {
      if (!player || !player.mesh) return;
      
      const regionNameEl = document.getElementById('region-name');
      if (!regionNameEl) return;
      
      const px = player.mesh.position.x;
      const pz = player.mesh.position.z;
      
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
    let minimapLastUpdate = 0;
    const MINIMAP_UPDATE_INTERVAL = 200; // Update every 200ms instead of every frame
    
    function updateMinimap() {
      if (!player || !player.mesh) return;
      
      const minimap = document.getElementById('minimap');
      if (!minimap) return;
      
      // Throttle updates to every 200ms
      const now = Date.now();
      if (now - minimapLastUpdate < MINIMAP_UPDATE_INTERVAL) return;
      minimapLastUpdate = now;
      
      // Clear previous dots
      minimap.innerHTML = '';
      
      // Minimap scale - shows area of 100x100 units
      const mapSize = 100;
      const minimapSize = 120; // pixels
      
      // Add player dot (center)
      const playerDot = document.createElement('div');
      playerDot.className = 'minimap-dot minimap-player';
      playerDot.style.left = '50%';
      playerDot.style.top = '50%';
      minimap.appendChild(playerDot);
      
      // Add enemy dots (up to 20 closest enemies) - optimized
      if (enemies && enemies.length > 0) {
        const sortedEnemies = enemies
          .filter(e => e && !e.isDead)
          .map(e => ({
            enemy: e,
            dist: player.mesh.position.distanceTo(e.mesh.position)
          }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 20);
        
        sortedEnemies.forEach(({enemy}) => {
          const dx = enemy.mesh.position.x - player.mesh.position.x;
          const dz = enemy.mesh.position.z - player.mesh.position.z;
          
          // Only show enemies within map range
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
        const dx = landmark.pos.x - player.mesh.position.x;
        const dz = landmark.pos.z - player.mesh.position.z;
        
        if (Math.abs(dx) < mapSize / 2 && Math.abs(dz) < mapSize / 2) {
          const mapX = 50 + (dx / mapSize) * 100;
          const mapZ = 50 + (dz / mapSize) * 100;
          
          const landmarkDot = document.createElement('div');
          // Add quest-ready "?" indicator for windmill when quest available
          const isWindmillAvailable = landmark.name === 'windmill' && !windmillQuest.active && !windmillQuest.rewardGiven;
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
        const qdx = qPos.x - player.mesh.position.x;
        const qdz = qPos.z - player.mesh.position.z;
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
    const CHEST_SPAWN_MILESTONES = [7, 9, 10, 12, 15, 20]; // Combo counts that spawn chests (updated to include 15 and 20)
    
    // Helper function to determine chest tier based on combo count

    let comboState = {
      count: 0,
      lastKillTime: 0,
      comboWindow: 2000, // 2 seconds between kills to maintain combo
      fadeTimer: null,
      topCombos: [], // Track top 3 combo achievements
      maxTopCombos: 3,
      shownMilestones: [], // Track which milestone texts have been shown to prevent repeats
      timerInterval: null // Track combo timer interval for cleanup
    };
    
    function updateComboCounter(newKill = false) {
      const currentTime = Date.now();
      
      if (newKill) {
        // Check if within combo window
        if (currentTime - comboState.lastKillTime <= comboState.comboWindow) {
          comboState.count++;
        } else {
          comboState.count = 1; // Reset to 1 for first kill
          comboState.shownMilestones = []; // Reset shown milestones when combo breaks
        }
        comboState.lastKillTime = currentTime;
        
        // Show combo if 5+ kills (updated to start at 5)
        if (comboState.count >= 5) {
          showCombo();
        }
        
        // Spawn chest on specific combo milestones:
        // 7 kills: Common (white), 9 kills: Uncommon (green), 10 kills: Rare (blue)
        // 12 kills: Rare (blue), 15 kills: Epic (purple), 20 (GODLIKE): Mythical (special)
        const isMilestone = CHEST_SPAWN_MILESTONES.includes(comboState.count);
        
        if (isMilestone && !comboState.topCombos.includes(comboState.count)) {
          const chestTier = getChestTierForCombo(comboState.count);
          if (chestTier) {
            comboState.topCombos.push(comboState.count);
            const chestAngle = Math.random() * Math.PI * 2;
            const chestDist = 10 + Math.random() * 5;
            const cx = player.mesh.position.x + Math.cos(chestAngle) * chestDist;
            const cz = player.mesh.position.z + Math.sin(chestAngle) * chestDist;
            spawnChest(cx, cz, chestTier);
            showStatChange(`${chestTier.toUpperCase()} Chest Spawned!`);
          }
        }
        
        // Clear existing fade timer
        if (comboState.fadeTimer) {
          clearTimeout(comboState.fadeTimer);
        }
        
        // Set new fade timer - persist combo text until lost
        comboState.fadeTimer = setTimeout(() => {
          hideCombo();
        }, comboState.comboWindow);
        
        // Update combo timer display
        updateComboTimer();
      }
    }
    
    // Update the combo timer display in the status bar
    function updateComboTimer() {
      const comboTimerEl = document.getElementById('combo-timer');
      
      // Clear existing interval if any
      if (comboState.timerInterval) {
        clearInterval(comboState.timerInterval);
        comboState.timerInterval = null;
      }
      
      if (comboState.count >= 5) {
        comboTimerEl.style.display = 'block';
        
        // Start new interval to update timer display
        comboState.timerInterval = setInterval(() => {
          const currentTime = Date.now();
          const timeElapsed = currentTime - comboState.lastKillTime;
          const timeRemaining = Math.max(0, comboState.comboWindow - timeElapsed);
          const secondsRemaining = (timeRemaining / 1000).toFixed(1);
          
          comboTimerEl.innerText = `Combo Timer: ${secondsRemaining}s`;
          
          // Stop timer when combo expires
          if (timeRemaining <= 0) {
            if (comboState.timerInterval) {
              clearInterval(comboState.timerInterval);
              comboState.timerInterval = null;
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
      if (milestones.includes(comboState.count) && !comboState.shownMilestones.includes(comboState.count)) {
        isMilestone = true;
        comboState.shownMilestones.push(comboState.count);
      }
      
      if (comboState.count >= GODLIKE_COMBO_THRESHOLD + 1) {
        // Fun random names after GODLIKE (using pre-defined constant array)
        const godlikeMultiplier = comboState.count - GODLIKE_COMBO_THRESHOLD;
        
        // Rotate through fun names, wrap around
        const nameIndex = (godlikeMultiplier - 1) % FUN_COMBO_NAMES.length;
        const funName = FUN_COMBO_NAMES[nameIndex];
        
        message = isMilestone ? funName.toUpperCase() : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === GODLIKE_COMBO_THRESHOLD) {
        message = isMilestone ? 'GODLIKE' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 19) {
        message = isMilestone ? 'Almost Godlike' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 18) {
        message = isMilestone ? 'Unstoppable' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 17) {
        message = isMilestone ? 'Dominating' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 16) {
        message = isMilestone ? 'Rampage' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 15) {
        message = isMilestone ? 'Monster Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 14) {
        message = isMilestone ? 'Insane Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 13) {
        message = isMilestone ? 'Almost Max Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 12) {
        message = isMilestone ? 'Fantastic Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 11) {
        message = isMilestone ? 'Unbelievable Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 10) {
        message = isMilestone ? 'Amazing Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 9) {
        message = isMilestone ? 'Mythical Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 8) {
        message = isMilestone ? 'Legendary Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'high';
      } else if (comboState.count === 7) {
        message = isMilestone ? 'Epic Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'high';
      } else if (comboState.count === 6) {
        message = isMilestone ? 'Rare Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'high';
      } else if (comboState.count === 5) {
        message = isMilestone ? 'Multikill' : `${comboState.count}x COMBO!`;  // First combo message at 5 kills
        comboLevel = 'high';
      } else {
        message = comboState.count + 'x COMBO!';
      }
      
      comboText.innerText = message;
      comboMultiplier.innerText = isMilestone ? '' : `x${comboState.count}`; // Only show multiplier when not showing milestone text
      
      // Progressive scaling: Start small at 5, gradually grow bigger to GODLIKE at 20
      // Yellow/White to Dark Red gradient with intensifying glow and size
      let textColor = '#FFFF00'; // Start with Yellow
      let glowIntensity = 20;
      let fontSize = 22; // Base font size (smaller, reduced from 38)
      let lightningCount = 0; // Number of lightning effects (keep minimal)
      
      if (comboState.count >= GODLIKE_COMBO_THRESHOLD + 1) {
        // GODLIKE x2, x3... - Red/Black with max glow
        textColor = '#8B0000'; // Dark red
        glowIntensity = 70; // Reduced from 90
        fontSize = 48; // Reduced from 78 to fit smaller combo text
        lightningCount = 4; // Reduced from 6
      } else if (comboState.count === GODLIKE_COMBO_THRESHOLD) {
        // GODLIKE - Red/Black with glowing light effects
        textColor = '#8B0000'; // Dark red  
        glowIntensity = 65; // Reduced from 85
        fontSize = 44; // Reduced from 74 to fit smaller combo text
        lightningCount = 3; // Reduced from 5
      } else if (comboState.count === 13) {
        // Almost Max Combo
        textColor = '#A00000'; // Dark red
        glowIntensity = 78;
        fontSize = 42;
        lightningCount = 5;
      } else if (comboState.count === 12) {
        // Fantastic Combo
        textColor = '#C00000'; // Medium dark red
        glowIntensity = 48; // Reduced from 72
        fontSize = 36; // Reduced from 56 to fit smaller combo text
        lightningCount = 2; // Reduced from 4
      } else if (comboState.count === 11) {
        // Unbelievable Combo
        textColor = '#C80000'; // Medium dark red
        glowIntensity = 46; // Reduced from 66
        fontSize = 34; // Reduced from 54 to fit smaller combo text
        lightningCount = 2; // Reduced from 4
      } else if (comboState.count === 10) {
        // Amazing Combo
        textColor = '#D00000'; // Medium red
        glowIntensity = 44; // Reduced from 60
        fontSize = 32; // Reduced from 52 to fit smaller combo text
        lightningCount = 1; // Reduced from 4
      } else if (comboState.count === 9) {
        // Mythical Combo
        textColor = '#D80000'; // Lighter red
        glowIntensity = 42; // Reduced from 54
        fontSize = 30; // Reduced from 50 to fit smaller combo text
        lightningCount = 1; // Reduced from 3
      } else if (comboState.count === 8) {
        // Legendary Combo
        textColor = '#E00000'; // Light red
        glowIntensity = 40; // Reduced from 48
        fontSize = 28; // Reduced from 48 to fit smaller combo text
        lightningCount = 1; // Reduced from 3
      } else if (comboState.count === 7) {
        // Epic Combo
        textColor = '#E80000'; // Very light red
        glowIntensity = 36; // Reduced from 40
        fontSize = 26; // Reduced from 46 to fit smaller combo text
        lightningCount = 1; // Reduced from 2
      } else if (comboState.count === 6) {
        // Rare Combo
        textColor = '#FF3333'; // Pink-ish red
        glowIntensity = 32; // Reduced
        fontSize = 25; // Reduced from 44 to fit smaller combo text
        lightningCount = 0; // Reduced from 2
      } else if (comboState.count === 5) {
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
      if (comboState.timerInterval) {
        clearInterval(comboState.timerInterval);
        comboState.timerInterval = null;
      }
      
      setTimeout(() => {
        comboEl.style.opacity = '0';
        comboEl.style.animation = 'none';
        comboTimerEl.style.display = 'none'; // Hide timer when combo is lost
        
        // Spawn chest when combo is lost at minimum threshold
        if (comboState.count >= MIN_COMBO_FOR_CHEST_ON_LOSS) {
          const chestTier = getChestTierForCombo(comboState.count);
          if (chestTier) {
            const chestAngle = Math.random() * Math.PI * 2;
            const chestDist = 10 + Math.random() * 5;
            const cx = player.mesh.position.x + Math.cos(chestAngle) * chestDist;
            const cz = player.mesh.position.z + Math.sin(chestAngle) * chestDist;
            spawnChest(cx, cz, chestTier);
            // Show only in stat bar: "combo lost" and chest rarity (no text on main screen)
            const tierCapitalized = chestTier.charAt(0).toUpperCase() + chestTier.slice(1);
            showStatChange(`Combo lost - ${tierCapitalized} chest`);
          }
        }
        
        comboState.count = 0;
        comboState.topCombos = []; // Reset top combos for next combo sequence
        comboState.shownMilestones = []; // Reset shown milestones
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

    let farmerDialogueLines = [];
    let farmerDialoguePage = 0;

    function worldToScreen(worldPos) {
      const vec = worldPos.clone();
      vec.project(camera);
      return {
        x: (vec.x * 0.5 + 0.5) * window.innerWidth,
        y: (-(vec.y * 0.5) + 0.5) * window.innerHeight
      };
    }

    function showFarmerDialogue(lines, onComplete) {
      farmerDialogueLines = lines;
      farmerDialoguePage = 0;
      windmillQuest.dialogueOpen = true;
      setGamePaused(true); // Pause game while dialogue is showing

      const bubble = document.getElementById('farmer-speech-bubble');
      const textEl = document.getElementById('farmer-speech-bubble-text');
      const promptEl = document.getElementById('farmer-speech-bubble-prompt');

      function renderPage() {
        textEl.textContent = farmerDialogueLines[farmerDialoguePage];
        const isLast = farmerDialoguePage >= farmerDialogueLines.length - 1;
        promptEl.textContent = isLast ? '▶ tap to close' : '▶ tap to continue';
        bubble.style.display = 'block';
        if (farmerNPC) {
          const screen = worldToScreen(farmerNPC.position.clone().setY(farmerNPC.position.y + 3.5));
          bubble.style.left = screen.x + 'px';
          bubble.style.top = screen.y + 'px';
        }
      }

      function advancePage() {
        farmerDialoguePage++;
        if (farmerDialoguePage >= farmerDialogueLines.length) {
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
      windmillQuest.dialogueOpen = false;
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
      if (isGameActive && !isGameOver) {
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
      if (!farmerNPC || !indicator) return;
      // Show "?" while quest is not started and reward not given yet
      const showIndicator = !windmillQuest.active && !windmillQuest.rewardGiven && !windmillQuest.dialogueOpen;
      if (showIndicator) {
        const screen = worldToScreen(farmerNPC.position.clone().setY(farmerNPC.position.y + 4.2));
        indicator.style.left = screen.x + 'px';
        indicator.style.top = screen.y + 'px';
        indicator.style.display = 'block';
      } else {
        indicator.style.display = 'none';
      }
    }

    function updateFarmerBubblePosition() {
      if (!windmillQuest.dialogueOpen || !farmerNPC) return;
      const bubble = document.getElementById('farmer-speech-bubble');
      if (bubble.style.display === 'none') return;
      const screen = worldToScreen(farmerNPC.position.clone().setY(farmerNPC.position.y + 3.5));
      bubble.style.left = screen.x + 'px';
      bubble.style.top = screen.y + 'px';
      // Apply dynamic animation based on player movement
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
      if (!windmillQuest.active || !windmillQuest.windmill) return;
      
      const hp = windmillQuest.windmill.userData.hp;
      const maxHp = windmillQuest.windmill.userData.maxHp;
      const hpPct = (hp / maxHp) * 100;
      
      document.getElementById('windmill-hp-fill').style.width = `${Math.max(0, hpPct)}%`;
      document.getElementById('windmill-hp-text').innerText = `WINDMILL: ${Math.max(0, Math.ceil(hp))}/${maxHp}`;
      document.getElementById('windmill-timer-text').innerText = `DEFEND: ${Math.ceil(windmillQuest.timer)}s`;
    }
    
    function startWindmillQuest(windmill) {
      if (windmillQuest.hasCompleted || windmillQuest.active) return;
      
      windmillQuest.active = true;
      windmillQuest.timer = windmillQuest.duration;
      windmillQuest.windmill = windmill;
      windmillQuest.failed = false;
      windmill.userData.hp = 600;
      windmill.userData.maxHp = 600;
      
      document.getElementById('windmill-quest-ui').style.display = 'block';
      updateWindmillQuestUI();
      
      showStatChange('⚔️ Side Quest Activated: Defend the Windmill!');
    }
    
    function completeWindmillQuest() {
      windmillQuest.active = false;
      windmillQuest.hasCompleted = true;
      windmillQuest.rewardReady = true;
      document.getElementById('windmill-quest-ui').style.display = 'none';
      
      createFloatingText("QUEST COMPLETE!", windmillQuest.windmill.position);
      
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
      windmillQuest.rewardReady = false;
      windmillQuest.rewardGiven = true;

      // Grant passive level up
      playerStats.lvl++;
      playerStats.expReq = (playerStats.lvl * 2) * GAME_CONFIG.expValue;

      // Unlock Double Barrel Gun
      weapons.gun.barrels = 2;
      weapons.gun.damage += 10;
      weapons.doubleBarrel.active = true;
      weapons.doubleBarrel.level = 1;

      // Spawn a blue (rare) reward chest near the farmer as visual representation
      const chestX = farmerNPC ? farmerNPC.position.x + 1.5 : player.mesh.position.x + 2;
      const chestZ = farmerNPC ? farmerNPC.position.z + 1.5 : player.mesh.position.z + 2;
      spawnChest(chestX, chestZ, 'rare');

      createFloatingText("DOUBLE BARREL UNLOCKED!", player.mesh.position);

      showEnhancedNotification(
        'unlock',
        'WEAPON UNLOCKED!',
        'Double Barrel Gun - Increased damage and firepower!'
      );

      playSound('levelup');
      updateHUD();
    }

    function failWindmillQuest() {
      windmillQuest.active = false;
      windmillQuest.failed = true;
      // Hide windmill quest UI immediately - no on-screen failure text
      const uiEl = document.getElementById('windmill-quest-ui');
      if (uiEl) uiEl.style.display = 'none';
      const timerEl = document.getElementById('windmill-timer-text');
      const hpEl = document.getElementById('windmill-hp-text');
      const hpFill = document.getElementById('windmill-hp-fill');
      if (timerEl) timerEl.innerText = 'DEFEND: 0s';
      if (hpEl) hpEl.innerText = 'WINDMILL: 0/600';
      if (hpFill) hpFill.style.width = '0%';
    }
    
    // Montana Quest Functions
    function updateMontanaQuestUI() {
      if (!montanaQuest.active) return;
      
      const timerPct = (montanaQuest.timer / montanaQuest.duration) * 100;
      document.getElementById('montana-timer-fill').style.width = `${Math.max(0, timerPct)}%`;
      document.getElementById('montana-timer-text').innerText = `SURVIVE: ${Math.ceil(montanaQuest.timer)}s`;
      document.getElementById('montana-kills-text').innerText = `KILLS: ${montanaQuest.kills}/${montanaQuest.killsNeeded}`;
    }
    
    function startMontanaQuest(landmark) {
      if (!landmark || montanaQuest.hasCompleted || montanaQuest.active) return; // Prevent race condition and validate landmark
      
      montanaQuest.active = true;
      montanaQuest.timer = montanaQuest.duration;
      montanaQuest.kills = 0;
      montanaQuest.landmark = landmark;
      
      document.getElementById('montana-quest-ui').style.display = 'block';
      updateMontanaQuestUI();
      
      showStatChange('⚔️ Side Quest Activated: Montana Survival!');
    }
    
    function completeMontanaQuest() {
      montanaQuest.active = false;
      montanaQuest.hasCompleted = true;
      document.getElementById('montana-quest-ui').style.display = 'none';
      
      createFloatingText("MONTANA COMPLETE!", montanaQuest.landmark.position);
      
      // Rewards: +2 levels, +500 gold, +3 attr points
      playerStats.lvl += 2;
      playerStats.expReq = (playerStats.lvl * 2) * GAME_CONFIG.expValue;
      playerStats.gold += 500;
      playerStats.attributePoints += 3;
      
      createFloatingText("+2 LEVELS!", player.mesh.position);
      createFloatingText("+500 GOLD!", player.mesh.position);
      createFloatingText("+3 ATTR POINTS!", player.mesh.position);
      
      // Unlock lore
      unlockLore('landmarks', 'montana');
      
      playSound('levelup');
      updateHUD();
    }
    
    // Eiffel Quest Functions
    function updateEiffelQuestUI() {
      if (!eiffelQuest.active) return;
      
      const timerPct = (eiffelQuest.timer / eiffelQuest.duration) * 100;
      document.getElementById('eiffel-timer-fill').style.width = `${Math.max(0, timerPct)}%`;
      document.getElementById('eiffel-timer-text').innerText = `SURVIVE: ${Math.ceil(eiffelQuest.timer)}s`;
      document.getElementById('eiffel-kills-text').innerText = `KILLS: ${eiffelQuest.kills}/${eiffelQuest.killsNeeded}`;
    }
    
    function startEiffelQuest(landmark) {
      if (!landmark || eiffelQuest.hasCompleted || eiffelQuest.active) return; // Prevent race condition and validate landmark
      
      eiffelQuest.active = true;
      eiffelQuest.timer = eiffelQuest.duration;
      eiffelQuest.kills = 0;
      eiffelQuest.landmark = landmark;
      
      document.getElementById('eiffel-quest-ui').style.display = 'block';
      updateEiffelQuestUI();
      
      showStatChange('⚔️ Side Quest Activated: Eiffel Tower Defense!');
    }
    
    function completeEiffelQuest() {
      eiffelQuest.active = false;
      eiffelQuest.hasCompleted = true;
      document.getElementById('eiffel-quest-ui').style.display = 'none';
      
      createFloatingText("EIFFEL COMPLETE!", eiffelQuest.landmark.position);
      
      // Rewards: +3 levels, +1000 gold, +5 attr points, +20 gun damage
      playerStats.lvl += 3;
      playerStats.expReq = (playerStats.lvl * 2) * GAME_CONFIG.expValue;
      playerStats.gold += 1000;
      playerStats.attributePoints += 5;
      weapons.gun.damage += 20;
      
      createFloatingText("+3 LEVELS!", player.mesh.position);
      createFloatingText("+1000 GOLD!", player.mesh.position);
      createFloatingText("+5 ATTR POINTS!", player.mesh.position);
      createFloatingText("+20 GUN DAMAGE!", player.mesh.position);
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
      vec.project(camera);
      
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
    let statusMessageFadeInterval = null;
    let statusMessageFadeTimeout = null;
    
    // showStatChange and showStatusMessage are defined in ui.js → window.GameUI
    // (aliased at the top of this file — statNotificationQueue and the queue
    //  processing logic live in ui.js module scope)
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
      
      if (isGameActive && !isGameOver) setGamePaused(true);
      modal.style.display = 'flex';
      
      // Handle button click
      btn.onclick = () => {
        modal.style.display = 'none';
        if (isGameActive && !isGameOver) setGamePaused(false);
        
        // Update tutorial state
        if (step === 'first_death') {
          saveData.tutorial.currentStep = 'go_to_camp';
          saveSaveData();
          // Navigate to camp screen on first death
          const gameoverScreen = document.getElementById('gameover-screen');
          if (gameoverScreen) gameoverScreen.style.display = 'none';
          const campScreen = document.getElementById('camp-screen');
          if (campScreen) {
            updateCampScreen();
            campScreen.style.display = 'flex';
          }
        } else if (step === 'unlock_dash') {
          saveData.tutorial.currentStep = 'unlock_dash';
          saveSaveData();
        } else if (step === 'unlock_headshot') {
          saveData.tutorial.currentStep = 'unlock_headshot';
          saveSaveData();
        } else if (step === 'tutorial_complete') {
          saveData.tutorial.completed = true;
          saveData.tutorial.currentStep = 'completed';
          saveSaveData();
        }
      };
    }

    // showStatChange, showStatusMessage, processStatNotificationQueue
    // are defined in ui.js → window.GameUI (aliased at top of this file)
    
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
      // Close any open modals and quest UIs
      ['levelup-modal','settings-modal','stats-modal','comic-tutorial-modal','story-quest-modal',
       'windmill-quest-ui','montana-quest-ui','eiffel-quest-ui'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      // Also update quest state so active quests are properly cleaned up
      if (windmillQuest && windmillQuest.active) {
        windmillQuest.active = false;
        windmillQuest.failed = true;
      }
      if (montanaQuest && montanaQuest.active) {
        montanaQuest.active = false;
      }
      if (eiffelQuest && eiffelQuest.active) {
        eiffelQuest.active = false;
      }
      // Reset pause counter
      pauseOverlayCount = 0;
      isPaused = false;
      window.isPaused = false;
      levelUpPending = false;
      // Close farmer dialogue if open when game ends to prevent UI malfunction
      if (windmillQuest.dialogueOpen) {
        hideFarmerDialogue();
      }
      
      stopDroneHum(); // Stop drone sound
      
      // Calculate run stats
      const survivalTime = Math.floor((Date.now() - gameStartTime) / 1000);
      const goldEarned = playerStats.gold - runStartGold;
      
      // Track items gained this run (initialize if not present)
      if (!window.runLootGained) window.runLootGained = [];
      
      // Update save data
      saveData.totalRuns++;
      saveData.totalKills += playerStats.kills; // Track cumulative kills
      if (survivalTime > saveData.bestTime) saveData.bestTime = survivalTime;
      if (playerStats.kills > saveData.bestKills) saveData.bestKills = playerStats.kills;
      // Add account XP for kills this run (1 XP per kill)
      if (playerStats.kills > 0) addAccountXP(playerStats.kills);
      
      // Tutorial Quest: Check for first death
      if (!saveData.tutorialQuests) {
        saveData.tutorialQuests = {
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
      
      if (!saveData.tutorialQuests.firstDeathShown) {
        saveData.tutorialQuests.firstDeathShown = true;
        // Auto-claim firstRunDeath so quest1 conditions are satisfied when player enters main building
        if (!saveData.tutorialQuests.completedQuests.includes('firstRunDeath')) {
          saveData.tutorialQuests.completedQuests.push('firstRunDeath');
        }
        saveSaveData();
        // Show first death tutorial – quest1 activates later when player enters the Main Building
        setTimeout(() => {
          showComicTutorial('first_death');
        }, 1000);
      }
      
      // Tutorial: Check for quest completion on death
      const currentQuest = getCurrentQuest();
      if (currentQuest && currentQuest.triggerOnDeath) {
        // Quest 4: Kill 10 enemies (legacy)
        if (currentQuest.id === 'quest4_kill10' && saveData.tutorialQuests.killsThisRun >= 10) {
          progressTutorialQuest('quest4_kill10', true);
        }
        // Quest 7: Survive 2 minutes (legacy)
        if (currentQuest.id === 'quest7_survive2min' && saveData.tutorialQuests.survivalTimeThisRun >= 120) {
          progressTutorialQuest('quest7_survive2min', true);
        }
        // Quest 5: Complete a run (any run completion counts)
        if (currentQuest.id === 'quest5_doRun') {
          progressTutorialQuest('quest5_doRun', true);
        }
        // Quest 6: Kill 10 enemies (new intermediate quest)
        if (currentQuest.id === 'quest6_kill10' && saveData.tutorialQuests.killsThisRun >= 10) {
          progressTutorialQuest('quest6_kill10', true);
        }
        // Quest 7 (new): Kill 15 enemies
        if (currentQuest.id === 'quest7_kill10' && saveData.tutorialQuests.killsThisRun >= 15) {
          progressTutorialQuest('quest7_kill10', true);
        }
      }
      
      // Quest 3 (new chain): Reach Level 5
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest3_reachLevel5' && playerStats.lvl >= 5) {
        if (!saveData.tutorialQuests.readyToClaim.includes('quest3_reachLevel5')) {
          saveData.tutorialQuests.readyToClaim.push('quest3_reachLevel5');
        }
      }
      
      // Mark second run completed (for achievements unlock)
      if (saveData.totalRuns >= 2) {
        saveData.tutorialQuests.secondRunCompleted = true;
      }
      
      saveSaveData();
      
      // Display game over screen
      document.getElementById('gameover-screen').style.display = 'flex';
      // On first run, only show "Go to Camp" button; restore all buttons on subsequent runs
      const isFirstRun = saveData.totalRuns === 1;
      document.getElementById('restart-btn').style.display = isFirstRun ? 'none' : '';
      document.getElementById('quit-to-menu-btn').style.display = isFirstRun ? 'none' : '';
      document.getElementById('goto-camp-btn').style.display = '';
      document.getElementById('final-score').innerText = `⏱️ Survived: ${survivalTime}s`;
      document.getElementById('final-kills').innerText = `⚔️ Kills: ${playerStats.kills}`;
      document.getElementById('final-level').innerText = `📊 Final Level: ${playerStats.lvl}`;
      document.getElementById('gold-earned').innerText = `💰 Gold Earned: ${goldEarned}`;
      document.getElementById('total-gold').innerText = `💵 Total Gold: ${saveData.gold}`;
      
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
      if (saveData.tutorialQuests && saveData.tutorialQuests.pendingMissionNotification === 'quest1_kill3') {
        saveData.tutorialQuests.pendingMissionNotification = null;
        saveSaveData();
        setTimeout(() => {
          showComicInfoBox(
            '📋 MISSION REPORT',
            `<div style="text-align: left; padding: 10px;">
              <p style="font-family: 'Bangers', cursive; font-size: 20px; margin-bottom: 10px;">✅ 3 KILLS CONFIRMED!</p>
              <p style="line-height: 1.8; margin-bottom: 10px;">
                Excellent work, Droplet! You've eliminated 3 enemies.<br><br>
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
      saveData.runCount = (saveData.runCount || 0) + 1;
      const startHour = (saveData.runCount % 2 === 1) ? 6 : 18; // Odd runs → 6 AM, Even runs → 6 PM

      // Convert hour (0-23) to timeOfDay (0-1)
      // 0 = midnight, 6 = dawn, 12 = noon, 18 = dusk
      dayNightCycle.timeOfDay = startHour / 24;
      
      saveSaveData(); // Save the updated hour
      
      // Apply permanent upgrades from save data
      const baseHp = 100 + PERMANENT_UPGRADES.maxHp.effect(saveData.upgrades.maxHp);
      const baseRegen = PERMANENT_UPGRADES.hpRegen.effect(saveData.upgrades.hpRegen);
      const baseSpeed = 25 * (1 + PERMANENT_UPGRADES.moveSpeed.effect(saveData.upgrades.moveSpeed));
      const baseDamage = 1 + PERMANENT_UPGRADES.attackDamage.effect(saveData.upgrades.attackDamage);
      const baseAtkSpeed = 1 + PERMANENT_UPGRADES.attackSpeed.effect(saveData.upgrades.attackSpeed);
      const baseCritChance = 0.1 + PERMANENT_UPGRADES.critChance.effect(saveData.upgrades.critChance);
      const baseCritDmg = 1.5 + PERMANENT_UPGRADES.critDamage.effect(saveData.upgrades.critDamage);
      const baseArmor = PERMANENT_UPGRADES.armor.effect(saveData.upgrades.armor);
      const cdReduction = PERMANENT_UPGRADES.cooldownReduction.effect(saveData.upgrades.cooldownReduction);
      
      // Apply passive skill bonuses
      const passiveSkills = saveData.passiveSkills || {};
      const passiveHpBonus = (passiveSkills.hp_boost || 0) * 10;
      const passiveDmgBonus = (passiveSkills.dmg_boost || 0) * 0.05;
      const passiveRegenBonus = (passiveSkills.regen_boost || 0) * 0.5;
      const passiveSpeedBonus = (passiveSkills.speed_boost || 0) * 0.05;
      
      // Apply attribute bonuses from achievement system
      const dexterity = saveData.attributes.dexterity || 0;
      const strength = saveData.attributes.strength || 0;
      const vitality = saveData.attributes.vitality || 0;
      const luck = saveData.attributes.luck || 0;
      const wisdom = saveData.attributes.wisdom || 0;
      
      // Training hall attributes (new system)
      const trainingStrength = saveData.attributes.strength || 0; // Already included
      const trainingEndurance = saveData.attributes.endurance || 0;
      const trainingFlexibility = saveData.attributes.flexibility || 0;
      
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
      const cigarBonus = (saveData.extendedQuests && saveData.extendedQuests.legendaryCigar && saveData.extendedQuests.legendaryCigar.completed) ? 1.5 : 1.0;
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
      waveCount = 0;
      lastWaveEndTime = 0; // Reset wave timing
      miniBossesSpawned.clear(); // Reset mini-boss tracking
      gameStartTime = Date.now();
      runStartGold = saveData.gold;
      
      // Reset tutorial quest progress for this run
      if (saveData.tutorialQuests) {
        saveData.tutorialQuests.killsThisRun = 0;
        saveData.tutorialQuests.survivalTimeThisRun = 0;
      }
      
      // Reset player invulnerability state
      if (player) {
        player.invulnerable = false;
        player.invulnerabilityTime = 0;
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
      droneTurrets.forEach(drone => drone.destroy());
      droneTurrets = [];
      
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
      
      windmillQuest = { active: false, timer: 0, duration: 15, windmill: null, hasCompleted: false, dialogueOpen: false, rewardReady: false, rewardGiven: false, failed: false, failedCooldown: false };
      document.getElementById('windmill-quest-ui').style.display = 'none';
      hideFarmerDialogue();
      
      montanaQuest = { active: false, timer: 0, duration: 45, kills: 0, killsNeeded: 15, landmark: null, hasCompleted: false };
      document.getElementById('montana-quest-ui').style.display = 'none';
      
      eiffelQuest = { active: false, timer: 0, duration: 60, kills: 0, killsNeeded: 25, landmark: null, hasCompleted: false };
      document.getElementById('eiffel-quest-ui').style.display = 'none';
      
      // Reset windmill HP (optimized: use pre-cached animatedSceneObjects)
      for (const c of animatedSceneObjects.windmills) {
        c.userData.hp = 1000;
        c.userData.maxHp = 1000;
      }
      
      // Reset music (updateBackgroundMusic stops all oscillators and clears state)
      updateBackgroundMusic();

      // Clear Entities
      enemies.forEach(e => {
        scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
      });
      enemies = [];
      
      expGems.forEach(e => {
        scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        if (e._outlineMat) e._outlineMat.dispose(); // Dispose per-instance outline material
      });
      expGems = [];
      
      // Clean up blood decals
      bloodDecals.forEach(d => {
        scene.remove(d);
        d.geometry.dispose();
        d.material.dispose();
      });
      bloodDecals = [];
      bloodDecalIndex = 0; // Reset circular buffer index
      
      // Clean up blood drips
      bloodDrips.forEach(d => {
        scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mesh.material.dispose();
      });
      bloodDrips = [];
      managedAnimations = [];
      
      goldCoins.forEach(g => {
        scene.remove(g.mesh);
        g.mesh.geometry.dispose();
        g.mesh.material.dispose();
      });
      goldCoins = [];
      
      chests.forEach(c => {
        if (c.glowLight) scene.remove(c.glowLight);
        scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        c.mesh.material.dispose();
        if (c.lid) {
          c.lid.geometry.dispose();
          c.lid.material.dispose();
        }
      });
      chests = [];

      projectiles.forEach(p => {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      });
      projectiles = [];
      
      particles.forEach(p => {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      });
      particles = [];
      
      // Clean up any active flash lights
      flashLights.forEach(light => {
        scene.remove(light);
      });
      flashLights = [];
      
      // Re-activate spawn portal for next run
      if (window.spawnPortal) {
        window.spawnPortal.active = true;
        window.spawnPortal.ringMat.opacity = 0.9;
        window.spawnPortal.discMat.opacity = 0.25;
      }
      
      // Clear any pending timeouts
      activeTimeouts.forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
      activeTimeouts = [];
      
      // Clean up managed smoke particles
      smokeParticles.forEach(sp => {
        scene.remove(sp.mesh);
        sp.geometry.dispose();
        sp.material.dispose();
      });
      smokeParticles = [];
      
      meteors.forEach(m => {
        scene.remove(m.mesh);
        scene.remove(m.shadow);
        m.mesh.geometry.dispose();
        m.mesh.material.dispose();
      });
      meteors = [];
      
      // Phase 5: Spawn companion if one is selected
      if (activeCompanion) {
        activeCompanion.destroy();
        activeCompanion = null;
      }
      
      // COMPANION UNLOCKS AFTER QUEST 5 (breed companion quest)
      // Quest 4 gives the egg, Quest 5 is to activate it
      const quest5Completed = saveData.tutorialQuests?.completedQuests?.includes('quest5_breedCompanion') || false;
      
      if (saveData.selectedCompanion && 
          saveData.companions[saveData.selectedCompanion]?.unlocked &&
          quest5Completed) {
        activeCompanion = new Companion(saveData.selectedCompanion);
        console.log('[Phase 5] Spawned companion:', saveData.selectedCompanion, 'after completing quest 5');
      } else if (!quest5Completed) {
        console.log('[Companion] Hidden until quest 5 (breed companion) is completed');
      }

      // Reset Player - Spawn right next to the fountain/statue
      if (player) {
        player.mesh.position.set(12, 0.5, 0); // Right next to fountain, outside rim
        player.mesh.material.color.setHex(COLORS.player);
      }

      setGameOver(false);
      // Reset any accumulated pauses before starting a new game
      pauseOverlayCount = 0;
      window.pauseOverlayCount = 0;
      levelUpPending = false;
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
        if (levelUpModal.style.display !== 'flex' && !isGameOver) {
          setGamePaused(false);
        }
      } else {
        // Calculate current run time
        const currentRunTime = isGameActive ? Math.floor((Date.now() - gameStartTime) / 1000) : 0;
        const goldThisRun = playerStats.gold - runStartGold;
        
        // Update tutorial quest progress
        if (saveData.tutorialQuests && isGameActive) {
          saveData.tutorialQuests.survivalTimeThisRun = currentRunTime;
        }
        
        // Get permanent upgrade bonuses
        const permMaxHp = PERMANENT_UPGRADES.maxHp.effect(saveData.upgrades.maxHp);
        const permHpRegen = PERMANENT_UPGRADES.hpRegen.effect(saveData.upgrades.hpRegen);
        const permMoveSpeed = PERMANENT_UPGRADES.moveSpeed.effect(saveData.upgrades.moveSpeed);
        const permAttackDamage = PERMANENT_UPGRADES.attackDamage.effect(saveData.upgrades.attackDamage);
        const permAttackSpeed = PERMANENT_UPGRADES.attackSpeed.effect(saveData.upgrades.attackSpeed);
        const permCritChance = PERMANENT_UPGRADES.critChance.effect(saveData.upgrades.critChance);
        const permCritDamage = PERMANENT_UPGRADES.critDamage.effect(saveData.upgrades.critDamage);
        const permArmor = PERMANENT_UPGRADES.armor.effect(saveData.upgrades.armor);
        const permCooldownReduction = PERMANENT_UPGRADES.cooldownReduction.effect(saveData.upgrades.cooldownReduction);
        const permGoldEarned = PERMANENT_UPGRADES.goldEarned.effect(saveData.upgrades.goldEarned);
        const permExpEarned = PERMANENT_UPGRADES.expEarned.effect(saveData.upgrades.expEarned);
        const permMaxWeapons = saveData.upgrades.maxWeapons || 0;
        
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
    <span style="color: #aaa;">Total Runs:</span><span style="color: #fff; text-align: right;">${saveData.totalRuns}</span>
    <span style="color: #aaa;">Best Time:</span><span style="color: #fff; text-align: right;">${saveData.bestTime}s</span>
    <span style="color: #aaa;">Best Kills:</span><span style="color: #fff; text-align: right;">${saveData.bestKills}</span>
    <span style="color: #aaa;">Total Gold:</span><span style="color: #fff; text-align: right;">${saveData.totalGoldEarned}</span>
  </div>
</div>
        `;
        modal.style.display = 'flex';
        setGamePaused(true);
      }
    }

    // --- INPUT SYSTEM ---
    function setupInputs() {
      const zone = document.getElementById('joystick-zone');
      const joystickOuter = document.getElementById('joystick-outer');
      const joystickInner = document.getElementById('joystick-inner');
      const joystickOuterRight = document.getElementById('joystick-outer-right');
      const joystickInnerRight = document.getElementById('joystick-inner-right');
      const container = document.getElementById('game-container');
      
      let touchStartX = 0;
      let touchStartY = 0;
      let touchStartTime = 0;
      let swipeDetected = false;
      
      zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          const screenWidth = window.innerWidth;
          const screenHeight = window.innerHeight;
          
          // Ignore touches in top 40% of screen (for UI elements)
          if (touch.clientY < screenHeight * 0.6) {
            continue;
          }
          
          // Left half = movement joystick
          if (touch.clientX < screenWidth / 2 && !joystickLeft.active) {
            joystickLeft.id = touch.identifier;
            joystickLeft.active = true;
            joystickLeft.originX = touch.clientX;
            joystickLeft.originY = touch.clientY;
            
            // Store swipe start for dash detection
            swipeStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
            
            // Show dynamic joystick at touch position
            joystickOuter.style.display = 'block';
            joystickOuter.style.left = (touch.clientX - 60) + 'px';
            joystickOuter.style.top = (touch.clientY - 60) + 'px';
          }
          // Right half = aiming joystick
          else if (touch.clientX >= screenWidth / 2 && !joystickRight.active) {
            joystickRight.id = touch.identifier;
            joystickRight.active = true;
            joystickRight.originX = touch.clientX;
            joystickRight.originY = touch.clientY;
            
            // Show dynamic right joystick at touch position
            joystickOuterRight.style.display = 'block';
            joystickOuterRight.style.left = (touch.clientX - 60) + 'px';
            joystickOuterRight.style.top = (touch.clientY - 60) + 'px';
          }
        }
        
        swipeDetected = false;
      }, { passive: false });

      zone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          
          // Handle LEFT joystick (movement)
          if (touch.identifier === joystickLeft.id && joystickLeft.active) {
            const dx = touch.clientX - joystickLeft.originX;
            const dy = touch.clientY - joystickLeft.originY;
            
            // Check for dash swipe (250ms, 60px threshold)
            if (swipeStart && !swipeDetected && !player.isDashing) {
              const swipeDist = Math.sqrt(dx*dx + dy*dy);
              const swipeTime = Date.now() - swipeStart.time;
              
              if (swipeTime < 250 && swipeDist > 60) {
                // Dash only available after unlocking in skill tree
                if (!saveData.tutorial || !saveData.tutorial.dashUnlocked) {
                  showStatChange('🔒 Unlock Dash in the Skill Tree!');
                  swipeStart = null;
                } else {
                  swipeDetected = true;
                  const dist = Math.sqrt(dx*dx + dy*dy);
                  player.dash(dx / dist, dy / dist);
                  playerStats.dashesPerformed++;
                  swipeStart = null;
                }
              }
            }
            
            // Normalize
            const maxDist = 50;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const clampedDist = Math.min(dist, maxDist);
            
            if (dist > 0) {
              joystickLeft.x = (dx / dist) * (clampedDist / maxDist);
              joystickLeft.y = (dy / dist) * (clampedDist / maxDist);
              
              // Throttle DOM updates for performance
              const now = Date.now();
              if (now - lastJoystickLeftUpdate >= JOYSTICK_UPDATE_INTERVAL) {
                lastJoystickLeftUpdate = now;
                // Update inner joystick knob position
                joystickInner.style.left = '50%';
                joystickInner.style.top = '50%';
                joystickInner.style.transform = `translate(calc(-50% + ${joystickLeft.x * 35}px), calc(-50% + ${joystickLeft.y * 35}px))`;
              }
            }
          }
          
          // Handle RIGHT joystick (aiming)
          if (touch.identifier === joystickRight.id && joystickRight.active) {
            const dx = touch.clientX - joystickRight.originX;
            const dy = touch.clientY - joystickRight.originY;
            
            // Normalize
            const maxDist = 50;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const clampedDist = Math.min(dist, maxDist);
            
            if (dist > 0) {
              joystickRight.x = (dx / dist) * (clampedDist / maxDist);
              joystickRight.y = (dy / dist) * (clampedDist / maxDist);
              
              // Throttle DOM updates for performance
              const now = Date.now();
              if (now - lastJoystickRightUpdate >= JOYSTICK_UPDATE_INTERVAL) {
                lastJoystickRightUpdate = now;
                // Update inner joystick knob position for right stick
                joystickInnerRight.style.left = '50%';
                joystickInnerRight.style.top = '50%';
                joystickInnerRight.style.transform = `translate(calc(-50% + ${joystickRight.x * 35}px), calc(-50% + ${joystickRight.y * 35}px))`;
              }
            }
          }
        }
      }, { passive: false });

      const endJoystick = (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          
          if (touch.identifier === joystickLeft.id) {
            joystickLeft.active = false;
            joystickLeft.x = 0;
            joystickLeft.y = 0;
            
            // Reset swipe detection
            swipeStart = null;
            swipeDetected = false;
            
            // Hide joystick
            joystickOuter.style.display = 'none';
            joystickInner.style.transform = 'translate(-50%, -50%)';
          }
          
          if (touch.identifier === joystickRight.id) {
            joystickRight.active = false;
            joystickRight.x = 0;
            joystickRight.y = 0;
            
            // Hide right joystick
            joystickOuterRight.style.display = 'none';
            joystickInnerRight.style.transform = 'translate(-50%, -50%)';
          }
        }
      };

      zone.addEventListener('touchend', endJoystick);
      zone.addEventListener('touchcancel', endJoystick);

      // Stats Button
      document.getElementById('stats-btn').addEventListener('click', toggleStats);
      document.getElementById('close-stats-btn').addEventListener('click', toggleStats);
      
      // Swipe Detection (Global - for dash)
      container.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        touchStartTime = Date.now();
        swipeDetected = false;
      }, { passive: false });

      container.addEventListener('touchmove', (e) => {
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // If moved enough, mark as swipe
        if (dist > 30) {
          swipeDetected = true;
        }
      }, { passive: false });

      container.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        const dt = Date.now() - touchStartTime;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // Quick swipe for dash (at least 40 pixels, less than 400ms, only if unlocked)
        if (dt < 400 && dist > 40 && swipeDetected && saveData.tutorial && saveData.tutorial.dashUnlocked) {
           player.dash(dx/dist, dy/dist);
        }
      }, { passive: false });
      
      // Keyboard Controls (WASD for movement, mouse for aiming) - only register once
      if (!gameSettings.inputListenersRegistered) {
        const keysPressed = {};
        gameSettings.keysPressed = keysPressed;
        window._keysPressed = keysPressed; // Expose for startDash()
        
        window.addEventListener('keydown', (e) => {
          if (!isGameActive || isPaused || isGameOver) return;
          if (gameSettings.controlType !== 'keyboard') return;
          keysPressed[e.key.toLowerCase()] = true;
          
          // Space bar for dash (only if unlocked in skill tree)
          if (e.key === ' ' && !player.isDashing && saveData.tutorial && saveData.tutorial.dashUnlocked && (keysPressed['w'] || keysPressed['a'] || keysPressed['s'] || keysPressed['d'])) {
            let dx = 0, dy = 0;
            if (keysPressed['w']) dy = -1;
            if (keysPressed['s']) dy = 1;
            if (keysPressed['a']) dx = -1;
            if (keysPressed['d']) dx = 1;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist > 0) {
              // Delegate dash logic to the common player.dash() method
              const dashDx = dx / dist;
              const dashDz = dy / dist;
              player.dash(dashDx, dashDz);
            }
          }
          // Space bar for dash via new isDashUnlocked() system
          if (e.code === 'Space' && isDashUnlocked() && !isDashing && dashCooldownRemaining <= 0) {
            e.preventDefault(); // Prevent default scroll behavior
            startDash();
          }
        });
        
        window.addEventListener('keyup', (e) => {
          keysPressed[e.key.toLowerCase()] = false;
        });
        
        // Mouse Controls for aiming
        // Initialize mouse position to center of the viewport to avoid unexpected initial rotation
        gameSettings.lastMouseX = window.innerWidth / 2;
        gameSettings.lastMouseY = window.innerHeight / 2;
        
        window.addEventListener('mousemove', (e) => {
          gameSettings.lastMouseX = e.clientX;
          gameSettings.lastMouseY = e.clientY;
        });
        
        // Track gamepad button states to detect button press events
        gameSettings.gamepadButtonStates = { dashButton: false };
        
        gameSettings.inputListenersRegistered = true;
      }
    }

    function onWindowResize() {
      const aspect = window.innerWidth / window.innerHeight;
      let d = 20;
      
      // Landscape camera zoom - 50% closer in landscape mode
      const isPortrait = window.innerHeight > window.innerWidth;
      gameSettings.isPortrait = isPortrait;
      
      if (!isPortrait) {
        d *= 0.5; // Zoom in 50% for landscape
      }
      
      camera.left = -d * aspect;
      camera.right = d * aspect;
      camera.top = d;
      camera.bottom = -d;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function updateControlType() {
      const controlType = gameSettings.controlType;
      const joystickZone = document.getElementById('joystick-zone');
      
      if (controlType === 'touch') {
        joystickZone.style.display = 'block';
      } else {
        joystickZone.style.display = 'none';
      }
      
      // Additional setup for keyboard/gamepad controls could go here
    }

    // --- MAIN LOOP ---
    // Performance tracking for freeze bug investigation
    let performanceLog = {
      frameCount: 0,
      lastLogTime: 0,
      totalFrameTime: 0, // Tracks the time taken by the previous frame (0 on first frame)
      slowFrames: 0,
      spawnCount: 0,
      renderCount: 0,
      lastEnemyCount: 0,
      cumulativeFrameTime: 0, // Track cumulative time for accurate average
      // FRESH: FPS watchdog - rolling 10-frame average
      recentFrameTimes: [],
      rollingAvgFPS: 60,
      particleThrottleActive: false,
      consecutiveSkipCount: 0 // Track consecutive skipped renders to prevent frozen screen
    };
    
    // FRESH: FPS Watchdog - Update rolling average and throttle particles if needed
    function updateFPSWatchdog(frameTime) {
      // Add current frame time to rolling window
      performanceLog.recentFrameTimes.push(frameTime);
      
      // Keep only last 10 frames
      if (performanceLog.recentFrameTimes.length > 10) {
        performanceLog.recentFrameTimes.shift();
      }
      
      // Calculate rolling average FPS
      if (performanceLog.recentFrameTimes.length === 10) {
        const avgFrameTime = performanceLog.recentFrameTimes.reduce((a, b) => a + b, 0) / 10;
        performanceLog.rollingAvgFPS = 1000 / avgFrameTime; // Convert ms to FPS
        
        // Throttle particles if FPS < 30
        if (performanceLog.rollingAvgFPS < 30 && !performanceLog.particleThrottleActive) {
          performanceLog.particleThrottleActive = true;
          console.warn(`FPS watchdog: FPS below 30 (${performanceLog.rollingAvgFPS.toFixed(1)}), throttling particles to 50%`);
        } else if (performanceLog.rollingAvgFPS >= 35 && performanceLog.particleThrottleActive) {
          // Restore particles when FPS recovers above 35 (hysteresis to prevent flapping)
          performanceLog.particleThrottleActive = false;
          console.log(`FPS watchdog: FPS recovered (${performanceLog.rollingAvgFPS.toFixed(1)}), restoring particles`);
        }
      }
    }
    
    // Enhance spawnParticles to respect throttle
    const originalSpawnParticles = spawnParticles;
    spawnParticles = function(position, color, count) {
      // Apply throttle if active (50% reduction)
      const adjustedCount = performanceLog.particleThrottleActive ? Math.ceil(count * 0.5) : count;
      return originalSpawnParticles(position, color, adjustedCount);
    };
    
    // Day/Night Cycle Update - Non-blocking, smooth lighting transitions
    function updateDayNightCycle(dt) {
      if (!dayNightCycle.enabled || !window.ambientLight || !window.dirLight) return;
      
      // Update time of day
      dayNightCycle.timeOfDay += dayNightCycle.cycleSpeed * dt;
      if (dayNightCycle.timeOfDay > 1) dayNightCycle.timeOfDay -= 1;
      
      const t = dayNightCycle.timeOfDay;
      
      // Update UI clock
      const hours = Math.floor(t * 24);
      const minutes = Math.floor((t * 24 * 60) % 60);
      const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      const clockTime = document.getElementById('day-night-time');
      const clockIcon = document.getElementById('day-night-icon');
      if (clockTime) clockTime.textContent = timeStr;
      
      // Update icon based on time
      if (clockIcon) {
        if (t >= 0.2 && t < 0.7) {
          clockIcon.textContent = '☀️'; // Day
        } else if (t >= 0.7 && t < 0.8) {
          clockIcon.textContent = '🌅'; // Sunset
        } else if (t >= 0.1 && t < 0.2) {
          clockIcon.textContent = '🌄'; // Sunrise
        } else {
          clockIcon.textContent = '🌙'; // Night
        }
      }
      
      // Calculate sun position and lighting based on time of day
      // 0 = midnight (dark), 0.25 = sunrise, 0.5 = noon (bright), 0.75 = sunset, 1 = midnight
      // Use smoothstep easing for smoother color transitions
      const smoothstep = (t) => t * t * (3 - 2 * t); // Smooth interpolation
      
      let sunIntensity, ambientIntensity, skyColor;
      
      if (t < 0.25) {
        // Night to sunrise (0 -> 0.25)
        const phase = smoothstep(t / 0.25); // Smooth easing
        sunIntensity = 0.2 + (0.6 * phase); // 0.2 -> 0.8
        ambientIntensity = 0.3 + (0.3 * phase); // 0.3 -> 0.6
        skyColor = new THREE.Color().lerpColors(
          new THREE.Color(0x1a1a2e), // Dark blue night
          new THREE.Color(0x87CEEB), // Light blue day
          phase
        );
      } else if (t < 0.5) {
        // Sunrise to noon (0.25 -> 0.5)
        const phase = smoothstep((t - 0.25) / 0.25);
        sunIntensity = 0.8 + (0.2 * phase); // 0.8 -> 1.0
        ambientIntensity = 0.6 + (0.1 * phase); // 0.6 -> 0.7
        skyColor = new THREE.Color(0x87CEEB); // Bright day
      } else if (t < 0.75) {
        // Noon to sunset (0.5 -> 0.75)
        const phase = smoothstep((t - 0.5) / 0.25);
        sunIntensity = 1.0 - (0.6 * phase); // 1.0 -> 0.4
        ambientIntensity = 0.7 - (0.3 * phase); // 0.7 -> 0.4
        skyColor = new THREE.Color().lerpColors(
          new THREE.Color(0x87CEEB), // Day blue
          new THREE.Color(0xFF6B35), // Sunset orange
          phase
        );
      } else {
        // Sunset to night (0.75 -> 1.0)
        const phase = smoothstep((t - 0.75) / 0.25);
        sunIntensity = 0.4 - (0.2 * phase); // 0.4 -> 0.2
        ambientIntensity = 0.4 - (0.1 * phase); // 0.4 -> 0.3
        skyColor = new THREE.Color().lerpColors(
          new THREE.Color(0xFF6B35), // Sunset orange
          new THREE.Color(0x1a1a2e), // Night dark blue
          phase
        );
      }
      
      // Apply lighting changes with lerp for extra smoothness
      const lerpSpeed = 0.1; // Smooth transition speed
      window.ambientLight.intensity += (ambientIntensity - window.ambientLight.intensity) * lerpSpeed;
      window.dirLight.intensity += (sunIntensity - window.dirLight.intensity) * lerpSpeed;
      
      // Update sky color with lerp for smooth transitions
      if (!window.currentSkyColor) {
        window.currentSkyColor = skyColor.clone();
      }
      window.currentSkyColor.lerp(skyColor, lerpSpeed);
      scene.background = window.currentSkyColor;
      
      // Update fog color to match sky (fog reacts to lighting) with lerp
      if (scene.fog) {
        if (!window.currentFogColor) {
          window.currentFogColor = window.currentSkyColor.clone();
        }
        window.currentFogColor.lerp(window.currentSkyColor, lerpSpeed);
        scene.fog.color = window.currentFogColor;
      }
      
      // Move sun position in an arc
      const sunAngle = (t - 0.25) * Math.PI * 2; // Offset so noon is at top
      // Keep sun at minimum height of 20 to stay above effective horizon
      // Anchor light to player for correct shadow casting as player moves around the map
      const shadowCenterX = (player && player.mesh) ? player.mesh.position.x : 0;
      const shadowCenterZ = (player && player.mesh) ? player.mesh.position.z : 0;
      window.dirLight.position.set(
        shadowCenterX + Math.cos(sunAngle) * 50,
        Math.max(20, Math.sin(sunAngle) * 100), // Minimum 20 units above ground
        shadowCenterZ + Math.sin(sunAngle) * 50
      );
      window.dirLight.target.position.set(shadowCenterX, 0, shadowCenterZ);
      window.dirLight.target.updateMatrixWorld();
    }
    
    function animate(time) {
      animationFrameId = requestAnimationFrame(animate);
      
      // Safety check: Ensure Three.js components are initialized before rendering (PR #82)
      if (!renderer || !scene || !camera) {
        return;
      }

      // Initialize lastTime on first frame to prevent huge dt (PR #82 fix)
      if (lastTime === null) {
        lastTime = time;
        gameTime = time / 1000; // Initialize gameTime for visual effects
        // Render the initial frame before returning to avoid blank screen
        renderer.render(scene, camera);
        return;
      }

      // Performance tracking - start frame timer
      const frameStartTime = performance.now();

      let dt = (time - lastTime) / 1000;
      lastTime = time;
      gameTime = time / 1000; // Update game time in seconds
      
      // Phase 3: Lag compensation - cap deltaTime to prevent death spiral
      const MAX_DELTA_TIME = 0.1; // 100ms cap
      if (dt > MAX_DELTA_TIME) {
        // Throttle warning to avoid console spam during sustained lag
        if (!window.lastLagWarning || (Date.now() - window.lastLagWarning) > 5000) {
          console.warn(`High deltaTime detected: ${dt.toFixed(3)}s, capping to ${MAX_DELTA_TIME}s`);
          window.lastLagWarning = Date.now();
        }
        dt = MAX_DELTA_TIME;
      }
      
      // Day/Night Cycle - Update lighting smoothly (non-blocking)
      // Runs every frame regardless of pause state for smooth visual transitions
      updateDayNightCycle(dt);
      
      // Update ambient creatures (birds, bats, fireflies, owls) based on time of day
      if (isGameActive && !isPaused) {
        updateAmbientCreatures(dt);
      }
      
      // Frame Skip Mechanism: Determine if rendering should be skipped based on previous frame time
      // Note: This only skips the render call - game logic still runs to maintain state consistency
      // Rendering is often a significant performance cost, so skipping it can provide relief
      const FRAME_TIME_BUDGET = 33.33; // ~30fps minimum (33.33ms per frame)
      const previousFrameTime = performanceLog.totalFrameTime;
      let shouldSkipRender = false;
      
      // Skip if previous frame exceeded 2x budget (first frame has totalFrameTime=0 so won't skip)
      // But never skip more than 2 consecutive frames to prevent a frozen-screen bug
      if (previousFrameTime > FRAME_TIME_BUDGET * 2 && performanceLog.consecutiveSkipCount < 2) {
        shouldSkipRender = true;
        performanceLog.consecutiveSkipCount++;
        // Throttled warning to prevent console spam during sustained poor performance
        if (!window.lastFrameSkipWarning || (Date.now() - window.lastFrameSkipWarning) > 5000) {
          console.warn(`Frame skip triggered: previous frame took ${previousFrameTime.toFixed(2)}ms`);
          window.lastFrameSkipWarning = Date.now();
        }
      }
      
      // Handle countdown sequence (PR #70)
      if (countdownActive) {
        // During countdown, still render but don't update game logic
        renderer.render(scene, camera);
        return;
      }

      if (isPaused || isGameOver || !isGameActive) {
        // Update camera to follow player even when paused
        if (player && player.mesh && !killCamActive && !cinematicActive) {
          camera.position.x = player.mesh.position.x;
          camera.position.z = player.mesh.position.z + 20;
          camera.lookAt(player.mesh.position);
        }
        // Still render the scene so visual effects (camera shake, particles, modals) are visible (PR #82)
        renderer.render(scene, camera);
        return;
      }
      
      // Handle keyboard/gamepad input updates (integrated into game loop)
      if (gameSettings.controlType === 'keyboard') {
        const keysPressed = gameSettings.keysPressed || {};
        let x = 0, y = 0;
        if (keysPressed['w']) y = -1;
        if (keysPressed['s']) y = 1;
        if (keysPressed['a']) x = -1;
        if (keysPressed['d']) x = 1;
        
        if (x !== 0 || y !== 0) {
          const dist = Math.sqrt(x*x + y*y);
          joystickLeft.x = x / dist;
          joystickLeft.y = y / dist;
          joystickLeft.active = true;
        } else {
          joystickLeft.active = false;
          joystickLeft.x = 0;
          joystickLeft.y = 0;
        }
        
        // Mouse aiming
        if (renderer && renderer.domElement) {
          const rect = renderer.domElement.getBoundingClientRect();
          const mouseX = gameSettings.lastMouseX - rect.left;
          const mouseY = gameSettings.lastMouseY - rect.top;
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          
          const dx = mouseX - centerX;
          const dy = mouseY - centerY;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          if (dist > 10) {
            joystickRight.x = dx / dist;
            joystickRight.y = dy / dist;
            joystickRight.active = true;
          } else {
            joystickRight.active = false;
            joystickRight.x = 0;
            joystickRight.y = 0;
          }
        }
      } else if (gameSettings.controlType === 'gamepad') {
        const gamepads = navigator.getGamepads();
        const gamepad = gamepads[0];
        
        if (gamepad) {
          // Left stick for movement
          const leftX = Math.abs(gamepad.axes[0]) > 0.1 ? gamepad.axes[0] : 0;
          const leftY = Math.abs(gamepad.axes[1]) > 0.1 ? gamepad.axes[1] : 0;
          
          if (leftX !== 0 || leftY !== 0) {
            joystickLeft.x = leftX;
            joystickLeft.y = leftY;
            joystickLeft.active = true;
          } else {
            joystickLeft.active = false;
            joystickLeft.x = 0;
            joystickLeft.y = 0;
          }
          
          // Right stick for aiming
          const rightX = Math.abs(gamepad.axes[2]) > 0.1 ? gamepad.axes[2] : 0;
          const rightY = Math.abs(gamepad.axes[3]) > 0.1 ? gamepad.axes[3] : 0;
          
          if (rightX !== 0 || rightY !== 0) {
            joystickRight.x = rightX;
            joystickRight.y = rightY;
            joystickRight.active = true;
          } else {
            joystickRight.active = false;
            joystickRight.x = 0;
            joystickRight.y = 0;
          }
          
          // Button 0 (A/X) for dash - detect button press (not hold)
          const dashPressed = gamepad.buttons[0].pressed;
          if (dashPressed && !gameSettings.gamepadButtonStates.dashButton && !player.isDashing && joystickLeft.active) {
            player.isDashing = true;
            player.dashTime = player.dashDuration;
            // Convert joystick direction to isometric world coordinates before dashing
            const inputX = joystickLeft.x;
            const inputY = joystickLeft.y;
            // Standard isometric transform from input (screen) space to world space
            // Use the centralized dash method for consistent behavior (iso conversion, effects, stats)
            player.dash(joystickLeft.x, joystickLeft.y);
          }
          gameSettings.gamepadButtonStates.dashButton = dashPressed;
        }
      }

      // Spawn Logic - Only spawn new wave if previous wave is cleared
      frameCount++;
      const aliveEnemies = enemies.filter(e => !e.isDead).length;
      const timeSinceLastWave = frameCount - lastWaveEndTime;
      const minWaveDelay = Math.floor(GAME_CONFIG.waveInterval * 0.6); // 60% of wave interval (3 seconds at 60fps)
      
      // Spawn new wave if: interval passed AND (no enemies alive OR enough time since last spawn)
      if (frameCount % GAME_CONFIG.waveInterval === 0 && (aliveEnemies === 0 || timeSinceLastWave > GAME_CONFIG.waveInterval)) {
        lastWaveEndTime = frameCount; // Update last wave time on every spawn
        const spawnStartTime = performance.now();
        spawnWave();
        const spawnEndTime = performance.now();
        performanceLog.spawnCount++;
        
        // Log if spawning took unusually long
        if (spawnEndTime - spawnStartTime > 10) {
          console.warn(`Spawn wave took ${(spawnEndTime - spawnStartTime).toFixed(2)}ms, enemies: ${aliveEnemies}`);
        }
      } else if (aliveEnemies === 0 && timeSinceLastWave >= minWaveDelay) {
        // Quick spawn if all enemies cleared and minimum delay passed
        lastWaveEndTime = frameCount;
        const spawnStartTime = performance.now();
        spawnWave();
        const spawnEndTime = performance.now();
        performanceLog.spawnCount++;
        
        // Log if spawning took unusually long
        if (spawnEndTime - spawnStartTime > 10) {
          console.warn(`Quick spawn took ${(spawnEndTime - spawnStartTime).toFixed(2)}ms`);
        }
      }
      
      // Track enemy count changes for logging
      if (aliveEnemies !== performanceLog.lastEnemyCount) {
        performanceLog.lastEnemyCount = aliveEnemies;
      }
      
      // HP Regen (Every 60 frames approx 1 sec)
      if (frameCount % 60 === 0 && playerStats.hpRegen > 0 && playerStats.hp < playerStats.maxHp) {
        playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + playerStats.hpRegen);
        updateHUD();
        // Green particle
        spawnParticles(player.mesh.position, 0x00FF00, 2);
      }

      // Update Kill Cam effects
      updateKillCam(dt);
      
      // Update Cinematic Camera effects
      updateCinematic();

      // Player Update
      if (killCamActive) {
        // Preserve kill cam camera position from being overridden by player.update
        const prevCamX = camera.position.x;
        const prevCamZ = camera.position.z;
        player.update(dt);
        camera.position.x = prevCamX;
        camera.position.z = prevCamZ;
      } else if (cinematicActive) {
        // Preserve cinematic camera position
        const prevCamX = camera.position.x;
        const prevCamY = camera.position.y;
        const prevCamZ = camera.position.z;
        player.update(dt);
        camera.position.x = prevCamX;
        camera.position.y = prevCamY;
        camera.position.z = prevCamZ;
      } else {
        player.update(dt);
      }

      // Dash cooldown tick (Feature 1)
      if (isDashing) {
        dashTimer -= dt;
        if (dashTimer <= 0) {
          isDashing = false;
          dashInvulnerable = false;
        }
      }
      if (dashCooldownRemaining > 0) {
        dashCooldownRemaining -= dt;
        if (dashCooldownRemaining < 0) dashCooldownRemaining = 0;
      }
      
      // Lake Physics - Check if player is in water
      const LAKE_CENTER_X = 30;
      const LAKE_CENTER_Z = -30;
      const LAKE_RADIUS = 18;
      const distToLake = Math.sqrt(
        (player.mesh.position.x - LAKE_CENTER_X) ** 2 + 
        (player.mesh.position.z - LAKE_CENTER_Z) ** 2
      );
      
      if (distToLake < LAKE_RADIUS) {
        // Player is in water!
        if (!player.inWater) {
          player.inWater = true;
          player.waterEntryTime = gameTime;
          player.swimBobPhase = 0;
          
          // Splash effect on water entry
          spawnParticles(player.mesh.position, 0x87CEEB, 20); // Blue splash
          spawnParticles(player.mesh.position, 0xFFFFFF, 10); // White foam
          playSound('waterSplash');
        }
        
        // Swimming: 40% speed reduction (was 50%)
        player.velocity.multiplyScalar(0.6);
        
        // Swimming bobbing animation
        player.swimBobPhase = (player.swimBobPhase || 0) + dt * 3.0;
        const bobY = -0.2 + Math.sin(player.swimBobPhase) * 0.15;
        player.mesh.position.y = bobY;
        
        // Gentle swimming tilt/roll
        player.mesh.rotation.z = Math.sin(player.swimBobPhase * 0.7) * 0.12;
        
        // Camera angle adjustment: tilt slightly lower when swimming
        if (!killCamActive && !cinematicActive) {
          camera.position.y = Math.max(10, camera.position.y - dt * 2);
        }
        
        // Create ripple effect
        if (Math.random() < 0.3) {
          spawnParticles(player.mesh.position, 0x87CEEB, 2);
        }
        
        // Check underwater legendary chest collection
        if (window.underwaterChest && !window.underwaterChest.userData.collected) {
          const chestDist = player.mesh.position.distanceTo(window.underwaterChest.position);
          if (chestDist < window.underwaterChest.userData.collectRadius) {
            window.underwaterChest.userData.collected = true;
            scene.remove(window.underwaterChest);
            window.underwaterChest = null;
            
            // Grant legendary armor (+50 armor stacks with existing)
            if (playerStats) {
              playerStats.armor = (playerStats.armor || 0) + 50; // +50 armor
            }
            
            // Show legendary armor popup
            showComicInfoBox(
              '⚔️ LEGENDARY ARMOR FOUND!',
              '<div style="text-align:center;padding:10px 0">' +
              '<div style="font-size:52px;margin:8px 0">🛡️</div>' +
              '<div style="font-size:22px;font-weight:bold;color:#FFD700;letter-spacing:2px">AQUA PLATE ARMOR</div>' +
              '<div style="color:#FF8C00;font-size:16px;margin:4px 0">✦ ✦ ✦ LEGENDARY ✦ ✦ ✦</div>' +
              '<div style="margin:12px 0;font-size:15px;line-height:1.6">' +
              '+50 Armor (reduces all damage)<br>' +
              '+20% Water Resistance<br>' +
              '<span style="color:#87CEEB">Forged from the deepest currents...</span>' +
              '</div>' +
              '<div style="color:#4FC3F7;font-size:13px">Hidden beneath the lake for centuries!</div>' +
              '</div>',
              'EQUIP ARMOR!'
            );
            createFloatingText('LEGENDARY ARMOR!', player.mesh.position);
            spawnParticles(player.mesh.position, 0xFFD700, 30);
            spawnParticles(player.mesh.position, 0xFF8C00, 20);
          }
        }
      } else {
        if (player.inWater) {
          player.inWater = false;
          player.swimBobPhase = 0;
          player.mesh.rotation.z = 0;
          // Return to normal height
          player.mesh.position.y = 0.5;
          // Restore normal camera height
        }
      }
      
      // Check legendary cigar quest
      if (isGameActive && !isPaused) {
        checkLegendaryCigarQuest();
      }
      
      // QUEST 3: Check Stonehenge chest proximity
      if (window.stonehengeChest && 
          saveData.tutorialQuests && 
          (saveData.tutorialQuests.currentQuest === 'quest3_stonehengeGear' ||
           saveData.tutorialQuests.currentQuest === 'quest6_stonehengeChest') &&
          isGameActive && !isPaused) {
        const dist = player.mesh.position.distanceTo(window.stonehengeChest.position);
        if (dist < window.stonehengeChest.userData.pickupRadius) {
          // Player found the chest!
          scene.remove(window.stonehengeChest);
          window.stonehengeChest = null;
          
          const activeQuestId = saveData.tutorialQuests.currentQuest;
          // Show item card popup
          showComicInfoBox(
            '🎁 Treasure Found!',
            '<div style="text-align: center;"><div style="font-size: 48px; margin: 10px 0;">🚬</div><div style="color: #3498db; font-size: 24px; font-weight: bold;">CIGARR</div><div style="color: #FFD700; font-size: 18px;">★★★ RARE ★★★</div><div style="margin: 15px 0; font-size: 16px; font-family: Arial, sans-serif;">+1 to all combat stats</div><div style="color: #3498db; font-family: Arial, sans-serif;">Go to the Armory to equip your Cigarr!</div></div>',
            'Collect!',
            () => {
              // Complete the active stonehenge chest quest
              progressTutorialQuest(activeQuestId, true);
              
              // Show blue particle effect at pickup location
              for (let i = 0; i < 15; i++) {
                const angle = (i / 15) * Math.PI * 2;
                const speed = 2 + Math.random() * 2;
                const particle = particlePool.get();
                if (particle) {
                  particle.mesh.position.copy(player.mesh.position);
                  particle.velocity.set(
                    Math.cos(angle) * speed,
                    3 + Math.random() * 2,
                    Math.sin(angle) * speed
                  );
                  particle.mesh.material.color.setHex(0x4169E1); // Blue
                  particle.mesh.visible = true;
                  particle.active = true;
                  particle.life = 1.0;
                }
              }
            }
          );
        }
      }
      
      // Farmer NPC: Update "?" indicator position and check for player proximity to trigger dialogue
      updateFarmerNPCIndicator();
      updateFarmerBubblePosition();
      if (farmerNPC && !windmillQuest.dialogueOpen && !isPaused && !isGameOver) {
        const farmerDist = player.mesh.position.distanceTo(farmerNPC.position);
        const FARMER_TALK_DIST = 5;
        // Trigger intro dialogue if quest not yet started (and not currently failed/awaiting retry)
        if (!windmillQuest.active && !windmillQuest.hasCompleted && !windmillQuest.failed && !windmillQuest.failedCooldown && farmerDist < FARMER_TALK_DIST) {
          const windmillRef = animatedSceneObjects.windmills.length > 0 ? animatedSceneObjects.windmills[0] : null;
          showFarmerDialogue(FARMER_DIALOGUE.intro, function() {
            if (windmillRef) startWindmillQuest(windmillRef);
          });
        }
        // Reward dialogue after quest success
        else if (windmillQuest.hasCompleted && windmillQuest.rewardReady && !windmillQuest.rewardGiven && farmerDist < FARMER_TALK_DIST) {
          showFarmerDialogue(FARMER_DIALOGUE.success, function() {
            giveWindmillQuestReward();
          });
        }
        // Failure dialogue – shown once after quest fails; sets cooldown to prevent immediate re-trigger
        else if (windmillQuest.failed && !windmillQuest.active && !windmillQuest.hasCompleted && farmerDist < FARMER_TALK_DIST) {
          showFarmerDialogue(FARMER_DIALOGUE.failure, function() {
            windmillQuest.failed = false;
            windmillQuest.failedCooldown = true; // Prevent quest from restarting until next run
          });
        }
      }

      // Check windmill quest trigger – quest now starts only via farmer NPC dialogue above

      // Update windmill quest
      if (windmillQuest.active) {
        windmillQuest.timer -= dt;
        updateWindmillQuestUI();
        
        if (windmillQuest.timer <= 0) {
          // Quest completed successfully
          completeWindmillQuest();
        } else if (windmillQuest.windmill && windmillQuest.windmill.userData.hp <= 0) {
          // Quest failed – windmill destroyed
          failWindmillQuest();
        }
      }
      
      // Check Montana quest trigger (optimized with stored reference)
      if (!montanaQuest.active && !montanaQuest.hasCompleted && montanaLandmark) {
        const dist = player.mesh.position.distanceTo(montanaLandmark.position);
        if (dist < MONTANA_QUEST_TRIGGER_DISTANCE) {
          startMontanaQuest(montanaLandmark);
        }
      }
      
      // Update Montana quest
      if (montanaQuest.active) {
        montanaQuest.timer -= dt;
        updateMontanaQuestUI();
        
        if (montanaQuest.timer <= 0 && montanaQuest.kills >= montanaQuest.killsNeeded) {
          // Quest completed successfully
          completeMontanaQuest();
        } else if (montanaQuest.timer <= 0) {
          // Quest failed
          montanaQuest.active = false;
          document.getElementById('montana-quest-ui').style.display = 'none';
          createFloatingText("MONTANA FAILED!", montanaQuest.landmark.position);
        }
      }
      
      // Check Eiffel quest trigger (optimized with stored reference)
      if (!eiffelQuest.active && !eiffelQuest.hasCompleted && eiffelLandmark) {
        const dist = player.mesh.position.distanceTo(eiffelLandmark.position);
        if (dist < EIFFEL_QUEST_TRIGGER_DISTANCE) {
          startEiffelQuest(eiffelLandmark);
        }
      }
      
      // Update Eiffel quest
      if (eiffelQuest.active) {
        eiffelQuest.timer -= dt;
        updateEiffelQuestUI();
        
        if (eiffelQuest.timer <= 0 && eiffelQuest.kills >= eiffelQuest.killsNeeded) {
          // Quest completed successfully
          completeEiffelQuest();
        } else if (eiffelQuest.timer <= 0) {
          // Quest failed
          eiffelQuest.active = false;
          document.getElementById('eiffel-quest-ui').style.display = 'none';
          createFloatingText("EIFFEL FAILED!", eiffelQuest.landmark.position);
        }
      }

      // --- WEAPONS ---
      
      // 1. GUN
      if (weapons.gun.active && time - weapons.gun.lastShot > weapons.gun.cooldown) {
        // Find nearest enemy
        let nearest = null;
        let minDst = Infinity;
        
        for (let e of enemies) {
          if (e.isDead) continue;
          const d = player.mesh.position.distanceTo(e.mesh.position);
          if (d < weapons.gun.range && d < minDst) {
            minDst = d;
            nearest = e;
          }
        }

        // In manual mode: only fire if right stick is active (player is aiming) OR if on keyboard/gamepad
        // This prevents auto-fire off-aim on mobile touch
        const canFireManual = gameSettings.autoAim || joystickRight.active || gameSettings.controlType === 'keyboard' || gameSettings.controlType === 'gamepad';

        if (nearest && canFireManual) {
          // Determine fire target:
          // - auto-aim: target nearest enemy directly
          // - manual with right stick: fire in right-stick direction
          // - manual keyboard: fire in player facing direction
          let gunTarget;
          if (gameSettings.autoAim) {
            gunTarget = nearest.mesh.position;
          } else if (joystickRight.active) {
            // Right stick directs the shot
            const aimAngle = Math.atan2(joystickRight.x, joystickRight.y);
            gunTarget = new THREE.Vector3(
              player.mesh.position.x + Math.sin(aimAngle) * weapons.gun.range,
              0,
              player.mesh.position.z + Math.cos(aimAngle) * weapons.gun.range
            );
          } else {
            gunTarget = new THREE.Vector3(
              player.mesh.position.x + Math.sin(player.mesh.rotation.y) * weapons.gun.range,
              0,
              player.mesh.position.z + Math.cos(player.mesh.rotation.y) * weapons.gun.range
            );
          }
          // Fire based on barrels
          for(let i=0; i<weapons.gun.barrels; i++) {
            setTimeout(() => {
              projectiles.push(new Projectile(player.mesh.position.x, player.mesh.position.z, gunTarget));
              
              // Double Cast: fire extra projectiles with slight spread (±5 degrees per side)
              const extraShots = playerStats.extraProjectiles || 0;
              for (let s = 0; s < extraShots; s++) {
                const spreadAngle = (Math.random() - 0.5) * (Math.PI / 18); // random ±5 degrees
                const dx = gunTarget.x - player.mesh.position.x;
                const dz = gunTarget.z - player.mesh.position.z;
                // Rotate displacement vector by spreadAngle to get a new target at same distance
                const spreadTarget = new THREE.Vector3(
                  player.mesh.position.x + (Math.cos(spreadAngle) * dx - Math.sin(spreadAngle) * dz),
                  0,
                  player.mesh.position.z + (Math.sin(spreadAngle) * dx + Math.cos(spreadAngle) * dz)
                );
                projectiles.push(new Projectile(player.mesh.position.x, player.mesh.position.z, spreadTarget));
              }
              
              // Muzzle flash light effect - smaller radius to keep lightning contained to barrel area
              const isNight = dayNightCycle.timeOfDay < 0.2 || dayNightCycle.timeOfDay > 0.8;
              const nightMultiplier = isNight ? 1.5 : 1.0;
              
              const flashVariation = i % 3;
              let flashColor, flashIntensity, flashRadius;
              if (flashVariation === 0) {
                flashColor = 0xFFFFFF;
                flashIntensity = 4 * nightMultiplier;
                flashRadius = 8 * (isNight ? 1.3 : 1.0); // Reduced from 20
              } else if (flashVariation === 1) {
                flashColor = 0xFFCC00;
                flashIntensity = 3.5 * nightMultiplier;
                flashRadius = 7 * (isNight ? 1.3 : 1.0); // Reduced from 18
              } else {
                flashColor = 0xCCFFFF;
                flashIntensity = 4.5 * nightMultiplier;
                flashRadius = 9 * (isNight ? 1.3 : 1.0); // Reduced from 22
              }
              
              const flashLight = new THREE.PointLight(flashColor, flashIntensity, flashRadius);
              flashLight.position.copy(player.mesh.position);
              flashLight.position.y += 1;
              flashLight.castShadow = false; // Performance: no shadows for flash
              scene.add(flashLight);
              flashLights.push(flashLight);
              
              // Add ground reflection light at night for bounce effect
              if (isNight) {
                const reflectionLight = new THREE.PointLight(flashColor, flashIntensity * 0.5, flashRadius * 0.7);
                reflectionLight.position.copy(player.mesh.position);
                reflectionLight.position.y = 0.1; // Near ground
                scene.add(reflectionLight);
                flashLights.push(reflectionLight);
                
                // Remove reflection with main flash
                const reflTimeoutId = setTimeout(() => {
                  scene.remove(reflectionLight);
                  const idx = flashLights.indexOf(reflectionLight);
                  if (idx > -1) flashLights.splice(idx, 1);
                }, 80);
                activeTimeouts.push(reflTimeoutId);
              }
              
              // Remove flash after short time
              const timeoutId = setTimeout(() => {
                scene.remove(flashLight);
                const idx = flashLights.indexOf(flashLight);
                if (idx > -1) flashLights.splice(idx, 1);
                const tidx = activeTimeouts.indexOf(timeoutId);
                if (tidx > -1) activeTimeouts.splice(tidx, 1);
              }, 80);
              activeTimeouts.push(timeoutId);
              
              // Gun kickback effect - snappy recoil via scale squish
              player.mesh.scale.set(1.15, 0.85, 1.15);
              if (playerRecoilTimeout) clearTimeout(playerRecoilTimeout);
              playerRecoilTimeout = setTimeout(() => {
                player.mesh.scale.set(1, 1, 1);
                playerRecoilTimeout = null;
              }, 80);
              activeTimeouts.push(playerRecoilTimeout);
              
              // Enhanced muzzle sparks: small directional sparks from barrel tip
              const muzzlePos = player.mesh.position.clone();
              muzzlePos.y += 0.5;
              // Offset muzzle forward in player facing direction
              muzzlePos.x += Math.sin(player.mesh.rotation.y) * 0.6;
              muzzlePos.z += Math.cos(player.mesh.rotation.y) * 0.6;
              spawnParticles(muzzlePos, 0xFFFF44, 4); // Yellow muzzle sparks
              spawnParticles(muzzlePos, 0xFFFFFF, 2); // White hot flash
              spawnParticles(muzzlePos, 0xFF8800, 2); // Orange embers
              // Add realistic muzzle smoke
              spawnMuzzleSmoke(muzzlePos, 3);
            }, i * 100);
          }
          weapons.gun.lastShot = time;
          playSound('shoot'); // Gun sound
        }
      }

      // 2. SWORD
      if (weapons.sword.active && time - weapons.sword.lastShot > weapons.sword.cooldown) {
        // Find enemy in front or just slash in movement dir
        // If moving, slash forward. If idle, slash nearest?
        // Let's slash in player rotation direction
        const angle = player.mesh.rotation.y;
        projectiles.push(new SwordSlash(player.mesh.position.x, player.mesh.position.z, angle));
        weapons.sword.lastShot = time;
        playSound('sword'); // Sword slash sound
        
        // ENHANCED - Add sword slash visual effects
        spawnParticles(player.mesh.position, 0xC0C0C0, 8); // Silver slash particles
        spawnParticles(player.mesh.position, 0xFFFFFF, 5); // White sparkles
        // Add flash light for sword slash - track timeout for proper cleanup
        const slashLight = new THREE.PointLight(0xC0C0C0, 3, 8);
        slashLight.position.copy(player.mesh.position);
        slashLight.position.y += 1;
        scene.add(slashLight);
        flashLights.push(slashLight);
        
        const timeoutId = setTimeout(() => {
          scene.remove(slashLight);
          const idx = flashLights.indexOf(slashLight);
          if (idx > -1) flashLights.splice(idx, 1);
          const tidx = activeTimeouts.indexOf(timeoutId);
          if (tidx > -1) activeTimeouts.splice(tidx, 1);
        }, 100);
        activeTimeouts.push(timeoutId);
      }

      // 3. AURA
      if (weapons.aura.active && time - weapons.aura.lastShot > weapons.aura.cooldown) {
        // Damage all in range
        let hit = false;
        enemies.forEach(e => {
          if (e.isDead) return;
          const d = player.mesh.position.distanceTo(e.mesh.position);
          if (d < weapons.aura.range) {
            e.takeDamage(weapons.aura.damage * playerStats.strength);
            hit = true;
          }
        });
        if (hit) {
          // ENHANCED - Visual effect for aura tick
          spawnParticles(player.mesh.position, 0x5DADE2, 10); // Blue aura particles
          spawnParticles(player.mesh.position, 0xFFFFFF, 5); // White sparkles
        }
        weapons.aura.lastShot = time;
      }

      // 4. METEOR
      if (weapons.meteor.active && time - weapons.meteor.lastShot > weapons.meteor.cooldown) {
        // Target random enemy or random spot near player
        let targetX = player.mesh.position.x + (Math.random() - 0.5) * 10;
        let targetZ = player.mesh.position.z + (Math.random() - 0.5) * 10;
        
        if (enemies.length > 0) {
          const e = enemies[Math.floor(Math.random() * enemies.length)];
          targetX = e.mesh.position.x;
          targetZ = e.mesh.position.z;
        }
        
        meteors.push(new Meteor(targetX, targetZ));
        weapons.meteor.lastShot = time;
      }

      // 5. DRONE TURRET
      if (weapons.droneTurret.active && time - weapons.droneTurret.lastShot > weapons.droneTurret.cooldown) {
        // Update all drones
        for (let drone of droneTurrets) {
          if (!drone.active) continue;
          
          // Find nearest enemy for this drone
          let nearestEnemy = null;
          let minDist = Infinity;
          
          for (let e of enemies) {
            if (e.isDead) continue;
            const dist = drone.mesh.position.distanceTo(e.mesh.position);
            if (dist < weapons.droneTurret.range && dist < minDist) {
              minDist = dist;
              nearestEnemy = e;
            }
          }
          
          // Fire projectile from drone
          if (nearestEnemy) {
            const projectile = new Projectile(
              drone.mesh.position.x, 
              drone.mesh.position.z, 
              nearestEnemy.mesh.position
            );
            // Mark projectile as from drone turret for damage calculation
            projectile.isDroneTurret = true;
            // Make drone bullets smaller and faster
            projectile.mesh.scale.set(0.5, 0.5, 0.5);
            if (projectile.glow) {
              projectile.glow.scale.set(0.5, 0.5, 0.5);
            }
            projectile.speed = 0.6; // Faster than regular bullets
            projectile.vx = projectile.vx * 1.5;
            projectile.vz = projectile.vz * 1.5;
            projectiles.push(projectile);
            
            // Small muzzle flash from drone
            const flashLight = new THREE.PointLight(0x00FFFF, 2, 8);
            flashLight.position.copy(drone.mesh.position);
            flashLight.position.y += 0.2;
            scene.add(flashLight);
            flashLights.push(flashLight);
            const timeoutId = setTimeout(() => {
              scene.remove(flashLight);
              const idx = flashLights.indexOf(flashLight);
              if (idx > -1) flashLights.splice(idx, 1);
              const tidx = activeTimeouts.indexOf(timeoutId);
              if (tidx > -1) activeTimeouts.splice(tidx, 1);
            }, 50);
            activeTimeouts.push(timeoutId);
            
            playSound('shoot');
          }
        }
        
        weapons.droneTurret.lastShot = time;
      }

      // 6. DOUBLE BARREL - ENHANCED with 6-pellet spread, heavy recoil, orange/yellow flash
      if (weapons.doubleBarrel.active && time - weapons.doubleBarrel.lastShot > weapons.doubleBarrel.cooldown) {
        // Find nearest enemy
        let nearest = null;
        let minDst = Infinity;
        
        for (let e of enemies) {
          if (e.isDead) continue;
          const d = player.mesh.position.distanceTo(e.mesh.position);
          if (d < weapons.doubleBarrel.range && d < minDst) {
            minDst = d;
            nearest = e;
          }
        }

        if (nearest) {
          // Fire 6 pellets with spread (shotgun pattern)
          const baseDir = new THREE.Vector3(
            nearest.mesh.position.x - player.mesh.position.x,
            0,
            nearest.mesh.position.z - player.mesh.position.z
          ).normalize();
          
          const baseAngle = Math.atan2(baseDir.z, baseDir.x);
          const spreadAngle = weapons.doubleBarrel.spread;
          
          // Create 6 pellets in a spread pattern
          for (let i = 0; i < 6; i++) {
            const angle = baseAngle + (Math.random() - 0.5) * spreadAngle * 2;
            const target = new THREE.Vector3(
              player.mesh.position.x + Math.cos(angle) * weapons.doubleBarrel.range,
              0,
              player.mesh.position.z + Math.sin(angle) * weapons.doubleBarrel.range
            );
            const pellet = new Projectile(player.mesh.position.x, player.mesh.position.z, target);
            pellet.isDoubleBarrel = true;
            pellet.speed = 0.6; // Faster projectiles for shotgun
            projectiles.push(pellet);
          }
          
          // HEAVY RECOIL - much stronger than pistol
          player.mesh.scale.set(1.3, 0.7, 1.3);
          if (playerRecoilTimeout) clearTimeout(playerRecoilTimeout);
          playerRecoilTimeout = setTimeout(() => {
            player.mesh.scale.set(1, 1, 1);
            playerRecoilTimeout = null;
          }, 100);
          activeTimeouts.push(playerRecoilTimeout);
          
          // Orange/yellow muzzle flash (shotgun characteristic)
          const flashLight = new THREE.PointLight(0xFFA500, 8, 18); // Orange, brighter, wider
          flashLight.position.copy(player.mesh.position);
          flashLight.position.y += 1;
          scene.add(flashLight);
          flashLights.push(flashLight);
          const timeoutId = setTimeout(() => {
            scene.remove(flashLight);
            const idx = flashLights.indexOf(flashLight);
            if (idx > -1) flashLights.splice(idx, 1);
            const tidx = activeTimeouts.indexOf(timeoutId);
            if (tidx > -1) activeTimeouts.splice(tidx, 1);
          }, 100);
          activeTimeouts.push(timeoutId);
          
          // Focused muzzle flash for shotgun blast (wider spread)
          const shotgunMuzzlePos = player.mesh.position.clone();
          shotgunMuzzlePos.y += 0.5;
          spawnParticles(shotgunMuzzlePos, 0xFFA500, 3); // Orange muzzle
          spawnParticles(shotgunMuzzlePos, 0xFFFF00, 2); // Yellow spark
          spawnParticles(shotgunMuzzlePos, 0xFFFFFF, 2); // White flash
          // Heavy muzzle smoke for shotgun
          spawnMuzzleSmoke(player.mesh.position, 6);
          
          weapons.doubleBarrel.lastShot = time;
          playSound('doublebarrel'); // Double barrel sound
        }
      }
      
      // 7. ICE SPEAR
      if (weapons.iceSpear.active && time - weapons.iceSpear.lastShot > weapons.iceSpear.cooldown) {
        // Find nearest enemy
        let nearest = null;
        let minDst = Infinity;
        
        for (let e of enemies) {
          if (e.isDead) continue;
          const d = player.mesh.position.distanceTo(e.mesh.position);
          if (d < weapons.iceSpear.range && d < minDst) {
            minDst = d;
            nearest = e;
          }
        }

        if (nearest) {
          projectiles.push(new IceSpear(player.mesh.position.x, player.mesh.position.z, nearest.mesh.position));
          
          // Ice flash effect
          const flashLight = new THREE.PointLight(0x87CEEB, 3, 12); // Sky blue
          flashLight.position.copy(player.mesh.position);
          flashLight.position.y += 1;
          scene.add(flashLight);
          flashLights.push(flashLight);
          const timeoutId = setTimeout(() => {
            scene.remove(flashLight);
            const idx = flashLights.indexOf(flashLight);
            if (idx > -1) flashLights.splice(idx, 1);
            const tidx = activeTimeouts.indexOf(timeoutId);
            if (tidx > -1) activeTimeouts.splice(tidx, 1);
          }, 80);
          activeTimeouts.push(timeoutId);
          
          spawnParticles(player.mesh.position, 0x87CEEB, 8); // Ice blue particles
          spawnParticles(player.mesh.position, 0xFFFFFF, 5); // White particles
          
          weapons.iceSpear.lastShot = time;
          playSound('shoot');
        }
      }
      
      // 8. FIRE RING
      if (weapons.fireRing.active && time - weapons.fireRing.lastShot > weapons.fireRing.cooldown) {
        // Damage enemies within ring range
        let hit = false;
        enemies.forEach(e => {
          if (e.isDead) return;
          const d = player.mesh.position.distanceTo(e.mesh.position);
          if (d < weapons.fireRing.range) {
            const dmg = weapons.fireRing.damage * playerStats.strength;
            const isCrit = Math.random() < playerStats.critChance;
            const finalDmg = isCrit ? dmg * playerStats.critDmg : dmg;
            e.takeDamage(finalDmg);
            createDamageNumber(finalDmg, e.mesh.position, isCrit);
            
            // Fire particles on hit
            spawnParticles(e.mesh.position, 0xFF4500, 6); // Orange-red fire
            spawnParticles(e.mesh.position, 0xFFD700, 4); // Yellow flames
            hit = true;
          }
        });
        weapons.fireRing.lastShot = time;
      }

      // Entities Update
      enemies.forEach(e => e.update(dt, player.mesh.position));
      updateWaterParticles(dt);
      updateStatBar();
      
      // Phase 5: Update companion
      if (activeCompanion && !activeCompanion.isDead) {
        activeCompanion.update(dt);
      }
      
      // Update drone turrets
      droneTurrets.forEach(drone => drone.update(dt));
      
      // Projectiles update returns false if dead
      projectiles = projectiles.filter(p => p.update() !== false);
      meteors = meteors.filter(m => m.update() !== false);
      expGems.forEach(g => g.update(player.mesh.position));
      goldCoins.forEach(g => g.update(player.mesh.position));
      chests.forEach(c => c.update(player.mesh.position));
      
      // Phase 5: Update particles and release back to pool when dead
      // PERFORMANCE: Cull particles beyond fog distance (35 units)
      const FOG_DISTANCE = 35;
      particles = particles.filter(p => {
        // Cull particles beyond fog distance
        const distToPlayer = p.mesh.position.distanceTo(player.mesh.position);
        if (distToPlayer > FOG_DISTANCE) {
          if (particlePool) {
            particlePool.release(p);
          }
          return false;
        }
        
        const alive = p.update();
        if (!alive && particlePool) {
          particlePool.release(p);
        }
        return alive;
      });
      
      // Update blood decal fade (12 second lifetime)
      updateBloodDecals();
      
      // Update managed animations (replaces individual RAF loops for death/damage effects)
      if (managedAnimations.length > 0) {
        managedAnimations = managedAnimations.filter(anim => {
          return anim.update(dt);
        });
      }

      // Update blood drips (falling drops from wounded enemies)
      if (bloodDrips.length > 0) {
        bloodDrips = bloodDrips.filter(d => {
          d.velY -= 0.018;
          d.mesh.position.y += d.velY;
          d.life--;
          if (d.mesh.position.y <= 0.02 || d.life <= 0) {
            const hitGround = d.mesh.position.y <= 0.02;
            const pos = d.mesh.position.clone();
            scene.remove(d.mesh);
            d.mesh.geometry.dispose();
            d.mesh.material.dispose();
            if (hitGround) spawnBloodDecal(pos);
            return false;
          }
          return true;
        });
      }
      
      // Performance: Use cached arrays instead of scene.traverse() every frame
      // Windmill Rotation and Light Animation
      animatedSceneObjects.windmills.forEach(c => {
        // Rotate the blades stored in userData
        if (c.userData.blades && c.userData.blades.length > 0) {
          c.userData.blades[0].rotation.z += 0.05;
          c.userData.blades[1].rotation.z += 0.05;
        }
        
        // Animate windmill light (pulsing) with null check
        if (c.userData.light && c.userData.light.material) {
          c.userData.light.material.opacity = 0.8 + Math.sin(gameTime * 3) * 0.2;
        }
      });
      
      // Water ripple animation
      animatedSceneObjects.waterRipples.forEach(c => {
        c.userData.phase += 0.05;
        const scale = 1 + Math.sin(c.userData.phase) * 0.1;
        c.scale.set(scale, 1, scale);
        c.material.opacity = 0.3 + Math.sin(c.userData.phase) * 0.2;
      });
      
      // Lake sparkles animation
      animatedSceneObjects.sparkles.forEach(c => {
        c.userData.phase += 0.02 * c.userData.speed;
        c.material.opacity = 0.3 + Math.abs(Math.sin(c.userData.phase)) * 0.7;
        c.scale.set(
          1 + Math.sin(c.userData.phase * 2) * 0.5,
          1,
          1 + Math.sin(c.userData.phase * 2) * 0.5
        );
      });
      
      // Crystal tower animation
      animatedSceneObjects.crystals.forEach(obj => {
        // Rotate crystals
        obj.rotation.x += 0.01;
        obj.rotation.y += 0.02;
        
        // Orbit animation
        obj.userData.phase += 0.01 * obj.userData.orbitSpeed;
        const offsetY = Math.sin(obj.userData.phase) * 0.5;
        obj.position.y += offsetY * 0.05;
        
        // Pulsing emissive
        if (obj.material.emissiveIntensity !== undefined) {
          obj.material.emissiveIntensity = 0.3 + Math.sin(obj.userData.phase * 2) * 0.2;
        }
      });
      
      // Comet particle animation (orbiting particles)
      animatedSceneObjects.cometParticles.forEach(obj => {
        // Store the initial position as the orbit center (relative to parent/comet group)
        if (!obj.userData.basePosition) {
          obj.userData.basePosition = obj.position.clone();
        }
        
        obj.userData.angle += obj.userData.speed * 0.02;
        
        const centerX = obj.userData.basePosition.x;
        const centerZ = obj.userData.basePosition.z;
        const centerY = obj.userData.basePosition.y;
        
        obj.position.x = centerX + Math.cos(obj.userData.angle) * obj.userData.radius;
        obj.position.z = centerZ + Math.sin(obj.userData.angle) * obj.userData.radius;
        obj.position.y = centerY + obj.userData.height + Math.sin(obj.userData.angle * 2) * 0.3;
        
        // Pulsing opacity (between 0.3 and 0.7 for good visibility)
        obj.material.opacity = 0.5 + Math.sin(obj.userData.angle * 3) * 0.2;
      });
      
      // Waterfall animation
      
      // Tree sway animation - subtle wind effect
      if (window.destructibleProps) {
        window.destructibleProps.forEach(prop => {
          if (prop.type === 'tree' && !prop.destroyed && prop.mesh.userData.swayPhase !== undefined) {
            prop.mesh.userData.swayPhase += dt * prop.mesh.userData.swaySpeed;
            const swayX = Math.sin(prop.mesh.userData.swayPhase) * prop.mesh.userData.swayAmount;
            const swayZ = Math.cos(prop.mesh.userData.swayPhase * 0.7) * prop.mesh.userData.swayAmount;
            
            // Apply sway to leaves (independent sway)
            if (prop.mesh.userData.leaves) {
              prop.mesh.userData.leaves.rotation.x = swayX;
              prop.mesh.userData.leaves.rotation.z = swayZ;
            }
            // Trunk sways less
            if (prop.mesh.userData.trunk) {
              prop.mesh.userData.trunk.rotation.x = swayX * 0.3;
              prop.mesh.userData.trunk.rotation.z = swayZ * 0.3;
            }
          }
        });
      }
      
      // Fence physics - check player collision and reset
      if (window.breakableFences) {
        window.breakableFences.forEach(fence => {
          if (fence.userData.isFence && fence.userData.hp > 0) {
            const dist = Math.sqrt(
              (player.mesh.position.x - fence.position.x) ** 2 +
              (player.mesh.position.z - fence.position.z) ** 2
            );
            
            // Player collision - shake fence
            if (dist < 2) {
              fence.rotation.x = Math.sin(gameTime * 10) * 0.1;
              fence.rotation.z = Math.cos(gameTime * 10) * 0.1;
            } else {
              // Return to normal
              fence.rotation.x *= 0.9;
              fence.rotation.z *= 0.9;
            }
          }
        });
      }
      
      // Walk-into prop damage: barrels and crates take damage when player runs into them
      if (window.destructibleProps && player && !player.isDead) {
        const PROP_WALK_COLLISION_SQ = 1.2; // Squared distance: ~1.1 unit radius for barrel/crate collision
        const PROP_WALK_DMG_COOLDOWN = 300; // ms between walk-into damage ticks (tunable)
        for (let prop of window.destructibleProps) {
          if (prop.destroyed || prop.type === 'tree') continue; // Trees need dash to break
          const pdx = player.mesh.position.x - prop.mesh.position.x;
          const pdz = player.mesh.position.z - prop.mesh.position.z;
          const pdist2 = pdx * pdx + pdz * pdz;
          if (pdist2 < PROP_WALK_COLLISION_SQ) {
            if (!prop._walkDmgTimer || Date.now() - prop._walkDmgTimer > PROP_WALK_DMG_COOLDOWN) {
              prop._walkDmgTimer = Date.now();
              prop.hp -= 8; // Walk-into damage
              spawnParticles(prop.mesh.position, 0xD2691E, 4);
              const hpPct = prop.hp / prop.maxHp;
              if (hpPct <= 0.5 && !prop.darkenedStage1) {
                prop.darkenedStage1 = true;
                prop.mesh.material.color.copy(prop.originalColor).multiplyScalar(0.8);
              } else if (hpPct <= 0.25 && !prop.darkenedStage2) {
                prop.darkenedStage2 = true;
                prop.mesh.material.color.copy(prop.originalColor).multiplyScalar(0.6);
                prop.mesh.scale.copy(prop.originalScale).multiplyScalar(0.85);
              } else if (prop.hp <= 0) {
                prop.destroyed = true;
                if (prop.type === 'barrel') {
                  spawnParticles(prop.mesh.position, 0xFF4500, 20);
                  spawnParticles(prop.mesh.position, 0xFFFF00, 10);
                } else {
                  spawnParticles(prop.mesh.position, 0xD2691E, 18);
                }
                scene.remove(prop.mesh);
                if (prop.mesh.geometry) prop.mesh.geometry.dispose();
                if (prop.mesh.material) prop.mesh.material.dispose();
              }
            }
          }
        }
      }
      
      // Waterfall animation
      animatedSceneObjects.waterfalls.forEach(obj => {
        obj.userData.phase += 0.05;
        obj.material.opacity = 0.6 + Math.sin(obj.userData.phase) * 0.1;
      });
      
      animatedSceneObjects.waterDrops.forEach(obj => {
        obj.position.y -= obj.userData.speed;
        if (obj.position.y < 0) {
          obj.position.y = obj.userData.startY;
        }
      });
      
      animatedSceneObjects.splashes.forEach(obj => {
        obj.userData.phase += 0.1;
        const scale = 1 + Math.sin(obj.userData.phase) * 0.3;
        obj.scale.set(scale, 1, scale);
        obj.material.opacity = 0.4 + Math.sin(obj.userData.phase) * 0.2;
      });
      
      // FRESH IMPLEMENTATION: Tesla Tower Lightning Arcs Animation
      animatedSceneObjects.teslaTowers.forEach(tower => {
        if (!tower.userData.arcTimer) tower.userData.arcTimer = 0;
        tower.userData.arcTimer += dt;
        
        // Create new lightning arc every 1.5 seconds
        if (tower.userData.arcTimer > 1.5) {
          tower.userData.arcTimer = 0;
          
          // Clear old arcs
          if (tower.userData.arcLines && tower.userData.arcLines.length > 0) {
            tower.userData.arcLines.forEach(line => {
              scene.remove(line);
              if (line.geometry) line.geometry.dispose();
              if (line.material) line.material.dispose();
            });
            tower.userData.arcLines = [];
          }
          
          // Create new lightning arcs to random ground points
          const numArcs = Math.floor(Math.random() * 2) + 2; // 2-3 arcs
          for (let i = 0; i < numArcs; i++) {
            const targetPoint = tower.userData.arcPoints[Math.floor(Math.random() * tower.userData.arcPoints.length)];
            
            // Create jagged lightning path
            const points = [];
            const segments = 8;
            const start = tower.userData.topPosition.clone();
            const end = targetPoint.clone();
            
            points.push(start);
            for (let j = 1; j < segments; j++) {
              const t = j / segments;
              const mid = new THREE.Vector3().lerpVectors(start, end, t);
              // Add random jitter
              mid.x += (Math.random() - 0.5) * 3;
              mid.z += (Math.random() - 0.5) * 3;
              points.push(mid);
            }
            points.push(end);
            
            // Create line (Note: linewidth has no effect in WebGL, arcs will be 1-pixel lines)
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ 
              color: 0x00FFFF, 
              transparent: true,
              opacity: 0.8
            });
            const line = new THREE.Line(geometry, material);
            scene.add(line);
            tower.userData.arcLines.push(line);
          }
        }
        
        // Fade out arcs over time
        if (tower.userData.arcLines && tower.userData.arcLines.length > 0) {
          const fadeProgress = tower.userData.arcTimer / 1.5;
          const opacity = Math.max(0, 0.8 - fadeProgress * 0.8);
          tower.userData.arcLines.forEach(line => {
            if (line.material) line.material.opacity = opacity;
          });
        }
      });

      // Cleanup and memory management (run every 3 seconds to avoid performance issues)
      enemies = enemies.filter(e => !e.isDead);
      
      // Update managed smoke particles (replaces individual RAF loops)
      smokeParticles = smokeParticles.filter(sp => {
        sp.life--;
        sp.mesh.position.x += sp.velocity.x;
        sp.mesh.position.y += sp.velocity.y;
        sp.mesh.position.z += sp.velocity.z;
        sp.mesh.scale.multiplyScalar(1.05);
        sp.material.opacity = (sp.life / sp.maxLife) * 0.5;
        if (sp.life <= 0) {
          scene.remove(sp.mesh);
          sp.geometry.dispose();
          sp.material.dispose();
          return false;
        }
        return true;
      });
      
      const now = Date.now();
      if (now - lastCleanupTime > 3000) { // Run cleanup every 3 seconds
        lastCleanupTime = now;
        
        // Limit max items on ground (memory optimization)
        const MAX_EXP_GEMS = 100;
        const MAX_GOLD_COINS = 50;
        
        // Helper function to cleanup distant items
        const cleanupDistantItems = (items, maxItems, collectCallback) => {
          if (items.length > maxItems && player && player.mesh) {
            // Sort by distance, keep closest ones, auto-collect furthest
            items.sort((a, b) => {
              const distA = a.mesh.position.distanceTo(player.mesh.position);
              const distB = b.mesh.position.distanceTo(player.mesh.position);
              return distA - distB;
            });
            
            // Auto-collect excess items (furthest ones)
            const excessItems = items.splice(maxItems);
            excessItems.forEach(item => {
              if (item.active) {
                collectCallback(item);
                scene.remove(item.mesh);
                item.mesh.geometry.dispose();
                item.mesh.material.dispose();
                item.active = false;
              }
            });
          }
        };
        
        // Clean up exp gems
        cleanupDistantItems(expGems, MAX_EXP_GEMS, (gem) => addExp(gem.value));
        
        // Clean up gold coins
        cleanupDistantItems(goldCoins, MAX_GOLD_COINS, (coin) => {
          playerStats.gold += coin.amount;
        });
      }
      
      expGems = expGems.filter(g => g.active);
      goldCoins = goldCoins.filter(g => g.active);
      chests = chests.filter(c => c.active);

      // Screen shake effect
      if (window.screenShakeIntensity > 0.01) {
        camera.position.x += (Math.random() - 0.5) * window.screenShakeIntensity * 2;
        camera.position.y += (Math.random() - 0.5) * window.screenShakeIntensity * 1;
        camera.position.z += (Math.random() - 0.5) * window.screenShakeIntensity * 2;
        window.screenShakeIntensity *= 0.85; // Decay
      } else {
        window.screenShakeIntensity = 0;
      }

      // Fountain jet animation
      if (window.fountainJets && isGameActive) {
        const fjTime = gameTime;
        window.fountainJets.forEach(jet => {
          jet.userData.phase += dt * 4;
          const arcHeight = Math.abs(Math.sin(jet.userData.phase)) * 1.5;
          const inAngle = jet.userData.angle;
          const dist = 3.5 - arcHeight * 0.3; // arc inward
          jet.position.set(
            Math.cos(inAngle) * dist,
            0.5 + arcHeight,
            Math.sin(inAngle) * dist
          );
          jet.material.opacity = 0.4 + Math.sin(jet.userData.phase) * 0.3;
        });
      }
      
      // Spawn portal animation: pulse while countdown is active, fade after game starts
      if (window.spawnPortal && window.spawnPortal.active) {
        window.spawnPortal.phase += dt * 4;
        const pulse = 0.6 + Math.sin(window.spawnPortal.phase) * 0.4;
        window.spawnPortal.ringMat.opacity = pulse;
        window.spawnPortal.discMat.opacity = pulse * 0.3;
        // Color cycle: teal -> bright cyan during countdown
        const col = countdownActive ? 0x00FFFF : 0x00FFCC;
        window.spawnPortal.ringMat.color.setHex(col);
        window.spawnPortal.discMat.color.setHex(col);
        // Slowly rotate
        window.spawnPortal.ring.rotation.z += dt * 1.5;
        // Fade out 3s after game starts
        if (isGameActive && !countdownActive) {
          window.spawnPortal.ringMat.opacity *= 0.97;
          window.spawnPortal.discMat.opacity *= 0.97;
          if (window.spawnPortal.ringMat.opacity < 0.02) {
            window.spawnPortal.active = false;
            window.spawnPortal.ringMat.opacity = 0;
            window.spawnPortal.discMat.opacity = 0;
          }
        }
      }

      // Underwater chest shimmer animation
      if (window.underwaterChest && !window.underwaterChest.userData.collected) {
        const uwData = window.underwaterChest.userData;
        if (uwData.shimmerRing) {
          uwData.shimmerRing.userData.phase = (uwData.shimmerRing.userData.phase || 0) + dt * 2;
          const shimmerScale = 1 + Math.sin(uwData.shimmerRing.userData.phase) * 0.2;
          uwData.shimmerRing.scale.set(shimmerScale, shimmerScale, shimmerScale);
          uwData.shimmerRing.material.opacity = 0.3 + Math.sin(uwData.shimmerRing.userData.phase) * 0.2;
        }
        if (uwData.glowLight) {
          uwData.glowLight.intensity = 3 + Math.sin(gameTime * 3) * 1.5;
        }
        // Gentle bobbing
        window.underwaterChest.position.y = -0.4 + Math.sin(gameTime * 1.5) * 0.08;
      }

      // Phase 3: Render loop protection - wrap in try-catch to prevent freeze
      // Frame Skip Mechanism: Skip rendering if frame budget exceeded
      const renderStartTime = performance.now();
      
      if (!shouldSkipRender) {
        try {
          renderer.render(scene, camera);
          performanceLog.renderCount++;
          performanceLog.consecutiveSkipCount = 0; // Reset on successful render
        } catch (error) {
          console.error('Render error caught - game continues:', error);
          // Log error details but continue - the game loop will recover naturally
          // Active objects are already filtered above, so invalid objects are removed
        }
      } else {
        // Frame was skipped to maintain performance (already warned above with throttling)
      }
      
      const renderEndTime = performance.now();
      
      // Track frame performance
      const frameEndTime = performance.now();
      const totalFrameTime = frameEndTime - frameStartTime;
      performanceLog.totalFrameTime = totalFrameTime;
      performanceLog.frameCount++;
      
      // FRESH: Update FPS watchdog with current frame time
      updateFPSWatchdog(totalFrameTime);
      
      // Log slow frames
      if (totalFrameTime > FRAME_TIME_BUDGET) {
        performanceLog.slowFrames++;
        if (totalFrameTime > FRAME_TIME_BUDGET * 1.5) {
          console.warn(`Slow frame detected: ${totalFrameTime.toFixed(2)}ms (render: ${(renderEndTime - renderStartTime).toFixed(2)}ms, enemies: ${aliveEnemies}, particles: ${particles.length}, projectiles: ${projectiles.length})`);
        }
      }
      
      // Track cumulative frame time for accurate average
      performanceLog.cumulativeFrameTime += totalFrameTime;
      
      // Periodic performance summary (every 5 seconds)
      const currentTime = performance.now();
      if (currentTime - performanceLog.lastLogTime > 5000) {
        const avgFrameTime = performanceLog.cumulativeFrameTime / performanceLog.frameCount;
        const slowFramePercent = (performanceLog.slowFrames / performanceLog.frameCount * 100).toFixed(1);
        console.log(`Performance Summary: Avg frame: ${avgFrameTime.toFixed(2)}ms, Slow frames: ${slowFramePercent}%, Enemies: ${aliveEnemies}, Spawns: ${performanceLog.spawnCount}, Renders: ${performanceLog.renderCount}`);
        
        // Reset counters for next period
        performanceLog.lastLogTime = currentTime;
        performanceLog.slowFrames = 0;
        performanceLog.frameCount = 0;
        performanceLog.spawnCount = 0;
        performanceLog.renderCount = 0;
        performanceLog.cumulativeFrameTime = 0;
      }
      
      // Process disposal queue after rendering (PR #81)
      processDisposalQueue();
    }

    // Init Game
    try { init(); } catch(e) { console.error('[Game Error]', e); console.error('[Game] Initialization failed - game cannot start'); }

