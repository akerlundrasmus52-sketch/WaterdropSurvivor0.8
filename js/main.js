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
    let goldDrops = []; // Visual-only gold drop animations (cosmetic feedback)
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
    
    // ─── ObjectPool — generic pre-allocated pool (zero-alloc reuse) ─────────────
    // createFn() creates one new object; resetFn(obj) resets it before re-use.
    // get() returns a recycled or freshly created object.
    // release(obj) hides it and returns it to the free list.
    class ObjectPool {
      constructor(createFn, resetFn, initialSize = 100) {
        this._createFn = createFn;
        this._resetFn  = resetFn;
        this._free     = [];
        this._active   = new Set();
        for (let i = 0; i < initialSize; i++) {
          this._free.push(this._createFn());
        }
      }
      get() {
        const obj = this._free.length > 0 ? this._free.pop() : this._createFn();
        this._active.add(obj);
        return obj;
      }
      release(obj) {
        if (!this._active.has(obj)) return;
        this._active.delete(obj);
        this._resetFn(obj);
        this._free.push(obj);
      }
      releaseAll() {
        this._active.forEach(obj => { this._resetFn(obj); this._free.push(obj); });
        this._active.clear();
      }
    }
    window.ObjectPool = ObjectPool;

    // Phase 5: Initialize particle object pool for performance
    let particlePool = null; // Will be initialized after scene is created

    // ─── Blood-drop / meat-chunk / projectile pools ───────────────────────────
    // Populated lazily (after THREE is ready) by _ensureEntityPools().
    // Pre-allocate 500 blood drops, 200 meat chunks, 100 projectile slots.
    let bloodDropPool  = null;
    let meatChunkPool  = null;
    let _entityPoolsReady = false;
    function _ensureEntityPools() {
      if (_entityPoolsReady || typeof THREE === 'undefined' || !scene) return;
      _entityPoolsReady = true;

      // ── Blood drops (small falling spheres) ──────────────────────────────
      const _bdGeo = new THREE.SphereGeometry(0.06, 4, 4);
      const _bdMat = new THREE.MeshBasicMaterial({ color: 0x8B0000 });
      bloodDropPool = new ObjectPool(
        () => {
          const m = new THREE.Mesh(_bdGeo, _bdMat);
          m.visible = false;
          scene.add(m);
          return m;
        },
        (m) => {
          m.visible = false;
          m.userData.velX = 0;
          m.userData.velY = 0;
          m.userData.velZ = 0;
          m.userData.life  = 0;
          m.userData._sharedGeo = true;
          m.userData.isIce      = false;
        },
        500
      );
      window.bloodDropPool = bloodDropPool;

      // ── Meat chunks (larger gore pieces) ─────────────────────────────────
      const _mcGeo = new THREE.DodecahedronGeometry(0.09, 0);
      const _mcMats = [
        new THREE.MeshStandardMaterial({ color: 0x6B0000, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ color: 0x4B0082, roughness: 0.9 })
      ];
      let _mcIdx = 0;
      meatChunkPool = new ObjectPool(
        () => {
          const m = new THREE.Mesh(_mcGeo, _mcMats[(_mcIdx++) % 2]);
          m.visible = false;
          scene.add(m);
          return m;
        },
        (m) => {
          m.visible = false;
          m.scale.setScalar(1);
          m.userData.velX = 0;
          m.userData.velY = 0;
          m.userData.velZ = 0;
          m.userData.life  = 0;
          m.userData._sharedGeo = true;
          m.userData.isIce      = false;
        },
        200
      );
      window.meatChunkPool = meatChunkPool;
    }
    window._ensureEntityPools = _ensureEntityPools;

    // Managed animations array - replaces orphaned requestAnimationFrame loops in death/damage effects
    let managedAnimations = [];
    const MAX_MANAGED_ANIMATIONS = 600; // Increased: 5 blood pools × 50 enemies + 50 fall anims = ~300 slots comfortable headroom

    // Smoke particles managed array (avoids RAF accumulation over long sessions)
    let smokeParticles = [];
    const MAX_SMOKE_PARTICLES = 30; // Cap to prevent performance issues
    let _smokePool = null; // ObjectPool entries: { mesh, material, geometry, velocity, life, maxLife }

    // Lava spout particles (volcano) managed array
    let lavaParticles = [];
    const MAX_LAVA_PARTICLES = 80; // Hard cap to prevent runaway allocs
    let _lavaPool = null; // ObjectPool entries: { mesh, vx, vy, vz, life }
    
    // Deferred disposal queue for Three.js memory management (PR #81)
    const disposalQueue = [];
    const MAX_DISPOSALS_PER_FRAME = 10;
    
    // Ground blood decals array (cleaned up on reset)
    let bloodDecals = [];
    const MAX_BLOOD_DECALS = 100; // Strict pool: wraps at 101st decal, overwriting oldest slot
    
    // Blood drips array - updated in main game loop to avoid many individual RAF loops
    let bloodDrips = [];
    const MAX_BLOOD_DRIPS = 40;
    
    // Shared geometry for enemy bullet-hole decals (reused across all enemies for performance)
    // Lazily initialized to avoid crashing if THREE.js CDN hasn't loaded yet
    let bulletHoleGeo = null;
    let bulletHoleMat = null;
    function ensureBulletHoleMaterials() {
      if ((!bulletHoleGeo || !bulletHoleMat) && typeof THREE !== 'undefined') {
        bulletHoleGeo = new THREE.CircleGeometry(0.08, 6);
        bulletHoleMat = new THREE.MeshBasicMaterial({ color: 0x3A0000, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
      }
    }
    
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
      _syncJoystickZone();
    }
    window.pauseOverlayCount = 0;
    
    function setGameActive(active) {
      isGameActive = active;
      window.isGameActive = active;
      _syncJoystickZone();
    }
    
    function setGameOver(gameOverState) {
      isGameOver = gameOverState;
      window.isGameOver = gameOverState;
      _syncJoystickZone();
    }

    // Enable joystick pointer-events ONLY during active, unpaused gameplay.
    // Prevents the full-screen joystick-zone from blocking touches on menus,
    // level-up modals, camp buildings, game-over buttons, etc.
    function _syncJoystickZone() {
      var zone = document.getElementById('joystick-zone');
      if (!zone) return;
      var shouldBeActive = isGameActive && !isPaused && !isGameOver &&
                           !(window.CampWorld && window.CampWorld.isActive);
      zone.style.pointerEvents = shouldBeActive ? 'auto' : 'none';
    }
    window._syncJoystickZone = _syncJoystickZone;
    
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
    let _alienScoutSpawned    = false; // True once the minute-10 Grey Alien Scout is spawned this run
    let _annunakiOrbSpawned   = false; // True once the minute-15 Annunaki Orb is spawned this run
    // Landmark positions and detection radii for quest11_findAllLandmarks
    // OPTIMIZED: Updated landmark positions for ultra-compact world layout (80x80 map, all at edges)
    const LANDMARK_CONFIGS = {
      stonehenge:  { x:  32, z:  28, radius: 20, key: 'stonehenge',  label: 'Stonehenge'  }, // OPTIMIZED: Moved to edge (was 35, 30; before 60, 50)
      pyramid:     { x:  32, z: -28, radius: 20, key: 'pyramid',     label: 'Pyramid'     }, // OPTIMIZED: Moved to edge (was 25, -20; before 35, -35)
      montana:     { x:   0, z: -36, radius: 25, key: 'montana',     label: 'Montana'     }, // OPTIMIZED: Moved closer to edge (was 0, -60; before 0, -100)
      teslaTower:  { x: -32, z: -28, radius: 25, key: 'teslaTower',  label: 'Tesla Tower' }, // OPTIMIZED: Moved to edge (was -30, -30; before -50, -50)
      eiffel:      { x: -32, z:  35, radius: 25, key: 'eiffel',      label: 'Eiffel Tower'} // OPTIMIZED: Moved to edge (was -50, 90)
    };
    
    // Countdown system (PR #70-71)
    let countdownActive = false;
    let countdownStep = 0;
    let countdownTimer = 0;
    // countdownMessages defined in world.js → window.GameWorld (aliased at top)

    // Round-start cinematic flag — true while playRoundStartCinematic() is running.
    // Prevents the paused-branch camera override from fighting the zoom animation.
    let _roundStartCinematicActive = false;

    // Phase 5: Companion System Data
    // COMPANIONS defined in world.js → window.GameWorld (aliased at top)
    
    let activeCompanion = null; // Will hold the active Companion instance

    // Game Settings
    const gameSettings = {
      autoAim: false, // Auto-aim off by default, upgradeable via attributes
      controlType: 'touch', // 'touch', 'keyboard', 'gamepad'
      soundEnabled: true,
      musicEnabled: true,
      graphicsMode: 'auto', // 'auto' or 'manual'
      graphicsQuality: 'auto', // 'auto','ultra-low','very-low','low','medium','high','very-high','ultra'
      particleEffects: true, // Enable particle effects (blood, gore, etc.)
      isPortrait: null,
      inputListenersRegistered: false
    };
    window.gameSettings = gameSettings; // Expose for audio.js (global script scope)

    // Input - Twin-Stick Controls
    const joystickLeft = { x: 0, y: 0, active: false, id: null, originX: 0, originY: 0 }; // Movement
    const joystickRight = { x: 0, y: 0, active: false, id: null, originX: 0, originY: 0 }; // Aiming
    // Expose joysticks to camp-world.js so exit() can fully reset them
    window._campJoystick = joystickLeft;
    window._campJoystickRight = joystickRight;
    
    // Throttle joystick DOM updates for performance (60fps = ~16ms)
    let lastJoystickLeftUpdate = 0;
    let lastJoystickRightUpdate = 0;
    const JOYSTICK_UPDATE_INTERVAL = 16; // milliseconds
    
    // Swipe detection for dash
    let swipeStart = null;
    
    // Stats
    let playerStats = getDefaultPlayerStats(GAME_CONFIG.baseExpReq);

    // Weapons State — initialised from GameWeapons definitions
    let weapons = getDefaultWeapons();

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

    // Lightweight camera shake helper — exposed globally so DopamineSystem and others can trigger it.
    // intensity: max displacement in world units; durationMs: shake duration in milliseconds.
    window._triggerCameraShake = function _triggerCameraShake(intensity, durationMs) {
      if (!camera) return;
      if (_cameraShakeRAF) { cancelAnimationFrame(_cameraShakeRAF); _cameraShakeRAF = null; }
      const origin = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
      const endTime = performance.now() + (durationMs || 200);
      function _shake() {
        const remaining = endTime - performance.now();
        if (remaining <= 0) {
          camera.position.x = origin.x;
          camera.position.y = origin.y;
          camera.position.z = origin.z;
          _cameraShakeRAF = null;
          return;
        }
        const t = remaining / (durationMs || 200);
        const amp = intensity * t;
        camera.position.x = origin.x + (Math.random() - 0.5) * amp;
        camera.position.y = origin.y + (Math.random() - 0.5) * amp;
        camera.position.z = origin.z + (Math.random() - 0.5) * amp;
        _cameraShakeRAF = requestAnimationFrame(_shake);
      }
      _shake();
    };

    // Upgrade Config — alias from GameWeapons
    const UPGRADES = WEAPON_UPGRADES;

    // --- CLASSES ---
