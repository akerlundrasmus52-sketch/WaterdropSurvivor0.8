// js/modules/state.js
// Shared mutable game state container (gs) and exported const objects
    import * as THREE from 'three';
    import { GAME_CONFIG } from './constants.js';
    import { playSound } from './audio.js';

    // ── Shared mutable state container ─────────────────────────────────────────
    export const gs = {
      scene: null, camera: null, renderer: null,
      player: null, savedCameraPosition: null,
      enemies: [], projectiles: [], expGems: [], goldCoins: [], chests: [],
      particles: [], damageNumbers: [], meteors: [], flashLights: [],
      activeTimeouts: [], playerRecoilTimeout: null, droneTurrets: [],
      cinematicActive: false, cinematicData: null,
      animatedSceneObjects: {
        windmills: [], waterRipples: [], sparkles: [], crystals: [],
        cometParticles: [], waterfalls: [], waterDrops: [], splashes: [], teslaTowers: []
      },
      lastTime: null, particlePool: null,
      smokeParticles: [], bloodDecals: [], bloodDrips: [],
      frameCount: 0, isPaused: false, pauseOverlayCount: 0, isGameOver: false,
      levelUpPending: false, isGameActive: false, gameTime: 0, gameStartTime: 0,
      killCamActive: false, killCamTimer: 0, killCamDuration: 0, killCamType: null, killCamData: {},
      dayNightCycle: { enabled: true, timeOfDay: 0.25, cycleSpeed: 1/600, lastUpdateTime: 0 },
      ambientCreatures: [], ambientCreatureTimer: 0,
      waveCount: 0, lastWaveEndTime: 0,
      windmillQuest: { active: false, timer: 0, duration: 30, windmill: null, hasCompleted: false, dialogueOpen: false, rewardReady: false, rewardGiven: false, failed: false, failedCooldown: false },
      montanaQuest: { active: false, timer: 0, duration: 45, kills: 0, killsNeeded: 15, landmark: null, hasCompleted: false },
      eiffelQuest: { active: false, timer: 0, duration: 60, kills: 0, killsNeeded: 25, landmark: null, hasCompleted: false },
      montanaLandmark: null, eiffelLandmark: null, farmerNPC: null,
      runStartGold: 0, lastCleanupTime: 0, miniBossesSpawned: new Set(),
      countdownActive: false, countdownStep: 0, countdownTimer: 0,
      lastJoystickLeftUpdate: 0, lastJoystickRightUpdate: 0, swipeStart: null,
      magnetRange: 2, dashCooldown: 1000, dashDistance: 2.5,
      isDashing: false, dashCooldownRemaining: 0, dashTimer: 0,
      dashDirection: { x: 0, z: 0 }, dashInvulnerable: false,
      activeCompanion: null,
      hardTankGeometryCache: null, waterParticleGeom: null, waterParticleMat: null,
      _expGemStarGeometry: null, _expGemStarMaterial: null,
      saveData: null,
      bloodDecalIndex: 0,
      floatingTextFadeInterval: null, floatingTextFadeTimeout: null,
      minimapLastUpdate: 0,
      comboState: {
        count: 0, lastKillTime: 0, comboWindow: 2000, fadeTimer: null,
        topCombos: [], maxTopCombos: 3, shownMilestones: [], timerInterval: null
      },
      farmerDialogueLines: [], farmerDialoguePage: 0,
      statusMessageFadeInterval: null, statusMessageFadeTimeout: null,
      isShowingNotification: false,
      performanceLog: {
        frameCount: 0, lastLogTime: 0, totalFrameTime: 0, slowFrames: 0,
        spawnCount: 0, renderCount: 0, lastEnemyCount: 0, cumulativeFrameTime: 0,
        recentFrameTimes: [], rollingAvgFPS: 60,
        particleThrottleActive: false, consecutiveSkipCount: 0
      },
      spawnParticles: null,
      musicOscillators: [], musicGain: null, currentMusicLevel: 0,
    };

    // ── THREE.js shared geometry (created once at module load) ──────────────────
    export const bulletHoleGeo = new THREE.CircleGeometry(0.08, 6);
    export const bulletHoleMat = new THREE.MeshBasicMaterial({ color: 0x3A0000, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });

    // ── Const collections used across modules ───────────────────────────────────
    export const notifications = [];
    export const inventory = [];
    export const RARITY = {
      COMMON: { name: 'Common', color: 0xAAAAAA, multiplier: 1.0 },
      RARE: { name: 'Rare', color: 0x5DADE2, multiplier: 1.25 },
      EPIC: { name: 'Epic', color: 0x9B59B6, multiplier: 1.5 },
      LEGENDARY: { name: 'Legendary', color: 0xF39C12, multiplier: 2.0 },
      MYTHIC: { name: 'Mythic', color: 0xE74C3C, multiplier: 3.0 }
    };

    // --- GAME STATE ---
    
    // Cinematic gs.camera system
    // Performance: Cache animated gs.scene objects to avoid gs.scene.traverse() every frame
    
    // Phase 5: Initialize particle object pool for performance
    
    // Smoke gs.particles managed array (avoids RAF accumulation over long sessions)
    
    // Deferred disposal queue for Three.js memory management (PR #81)
    export const disposalQueue = [];
    
    // Ground blood decals array (cleaned up on reset)
    
    // Blood drips array - updated in main game loop to avoid many individual RAF loops
    
    // Shared geometry for enemy bullet-hole decals (reused across all gs.enemies for performance)
    
    
    // Kill Cam System - Diverse animations on enemy death
    
    // Cinematic Camera System - Dramatic sequences for mini-bosses and special events
    function triggerCinematic(type, target, duration = 3000) {
      if (gs.cinematicActive) return; // Don't interrupt existing cinematic
      
      gs.cinematicActive = true;
      gs.cinematicData = {
        type: type,
        target: target,
        startTime: Date.now(),
        duration: duration,
        originalCameraPos: gs.camera.position.clone(),
        originalCameraTarget: new THREE.Vector3(gs.player.mesh.position.x, 0, gs.player.mesh.position.z)
      };
      
      // Play dramatic sound for mini-boss
      if (type === 'miniboss') {
        playSound('hit', 1.5, 0.3); // Low pitch dramatic hit
      }
    }
    
    function updateCinematic() {
      if (!gs.cinematicActive || !gs.cinematicData) return;
      
      const elapsed = Date.now() - gs.cinematicData.startTime;
      const progress = Math.min(elapsed / gs.cinematicData.duration, 1);
      
      if (progress >= 1) {
        // End cinematic - restore gs.camera
        gs.camera.position.copy(gs.cinematicData.originalCameraPos);
        gs.camera.lookAt(gs.cinematicData.originalCameraTarget);
        gs.cinematicActive = false;
        gs.cinematicData = null;
        return;
      }
      
      // Different cinematic types
      if (gs.cinematicData.type === 'miniboss') {
        // Mini-boss cinematic: zoom to boss, show flex, zoom back
        const halfDuration = gs.cinematicData.duration / 2;
        
        if (elapsed < halfDuration) {
          // First half: zoom to boss
          const zoomProgress = elapsed / halfDuration;
          const targetPos = gs.cinematicData.target.position;
          
          gs.camera.position.x = gs.cinematicData.originalCameraPos.x + (targetPos.x - gs.cinematicData.originalCameraPos.x) * zoomProgress;
          gs.camera.position.z = gs.cinematicData.originalCameraPos.z + ((targetPos.z + 12) - gs.cinematicData.originalCameraPos.z) * zoomProgress;
          gs.camera.lookAt(targetPos.x, 0.5, targetPos.z);
          
          // Boss flex/roar animation
          const flexScale = 1 + Math.sin(elapsed * 0.01) * 0.15;
          gs.cinematicData.target.scale.set(flexScale, flexScale, flexScale);
          
          // Screen shake
          const shakeIntensity = 0.3 * Math.sin(elapsed * 0.02);
          gs.camera.position.x += (Math.random() - 0.5) * shakeIntensity;
          gs.camera.position.y += (Math.random() - 0.5) * shakeIntensity;
        } else {
          // Second half: zoom back to gs.player
          const returnProgress = (elapsed - halfDuration) / halfDuration;
          const targetPos = gs.cinematicData.target.position;
          
          gs.camera.position.x = gs.cinematicData.originalCameraPos.x + (targetPos.x - gs.cinematicData.originalCameraPos.x) * (1 - returnProgress);
          gs.camera.position.z = gs.cinematicData.originalCameraPos.z + ((targetPos.z + 12) - gs.cinematicData.originalCameraPos.z) * (1 - returnProgress);
          gs.camera.lookAt(
            gs.player.mesh.position.x * returnProgress + targetPos.x * (1 - returnProgress),
            0,
            gs.player.mesh.position.z * returnProgress + targetPos.z * (1 - returnProgress)
          );
          
          // Reset boss scale gradually
          const flexScale = 1 + Math.sin(elapsed * 0.01) * 0.15 * (1 - returnProgress);
          gs.cinematicData.target.scale.set(flexScale, flexScale, flexScale);
        }
      } else if (gs.cinematicData.type === 'stonehenge') {
        // Stonehenge chest cinematic: quick focus on chest location
        const halfDuration = gs.cinematicData.duration / 2;
        
        if (elapsed < halfDuration) {
          // First half: pan to chest
          const panProgress = elapsed / halfDuration;
          const targetPos = gs.cinematicData.target;
          
          gs.camera.position.x = gs.cinematicData.originalCameraPos.x + (targetPos.x - gs.cinematicData.originalCameraPos.x) * panProgress;
          gs.camera.position.z = gs.cinematicData.originalCameraPos.z + ((targetPos.z + 10) - gs.cinematicData.originalCameraPos.z) * panProgress;
          gs.camera.lookAt(targetPos.x, 0, targetPos.z);
        } else {
          // Second half: pan back to gs.player
          const returnProgress = (elapsed - halfDuration) / halfDuration;
          const targetPos = gs.cinematicData.target;
          
          gs.camera.position.x = gs.cinematicData.originalCameraPos.x + (targetPos.x - gs.cinematicData.originalCameraPos.x) * (1 - returnProgress);
          gs.camera.position.z = gs.cinematicData.originalCameraPos.z + ((targetPos.z + 10) - gs.cinematicData.originalCameraPos.z) * (1 - returnProgress);
          gs.camera.lookAt(
            gs.player.mesh.position.x * returnProgress + targetPos.x * (1 - returnProgress),
            0,
            gs.player.mesh.position.z * returnProgress + targetPos.z * (1 - returnProgress)
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
        gs.pauseOverlayCount++;
      } else {
        gs.pauseOverlayCount = Math.max(0, gs.pauseOverlayCount - 1);
      }
      const shouldPause = gs.pauseOverlayCount > 0;
      gs.isPaused = shouldPause;
      window.isPaused = shouldPause;
      window.pauseOverlayCount = gs.pauseOverlayCount;
    }
    window.setGamePaused = (paused) => setGamePaused(paused);
    window.pauseOverlayCount = 0;
    
    function setGameActive(active) {
      gs.isGameActive = active;
      window.isGameActive = active;
    }
    
    function setGameOver(gameOverState) {
      gs.isGameOver = gameOverState;
      window.isGameOver = gameOverState;
    }
    
    // Day/Night Cycle System - Smooth, non-blocking transitions
    
    // Ambient Creatures System
    
    function updateAmbientCreatures(dt) {
      const t = gs.dayNightCycle.timeOfDay;
      
      // Update timer
      gs.ambientCreatureTimer += dt;
      
      // Spawn new creatures based on time of day
      if (gs.ambientCreatureTimer > 2) { // Every 2 seconds, check for spawning
        gs.ambientCreatureTimer = 0;
        
        // Day creatures (0.2 - 0.7): Birds
        if (t >= 0.2 && t < 0.7 && gs.ambientCreatures.length < 10) {
          if (Math.random() < 0.3) {
            spawnBird();
          }
        }
        
        // Dawn/Dusk (0.7 - 0.9): Fireflies
        if ((t >= 0.7 && t < 0.9) && gs.ambientCreatures.length < 15) {
          if (Math.random() < 0.5) {
            spawnFirefly();
          }
        }
        
        // Night creatures (0.9 - 1.0 OR 0.0 - 0.2): Bats and Owls
        if ((t >= 0.9 || t < 0.2) && gs.ambientCreatures.length < 12) {
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
      for (let i = gs.ambientCreatures.length - 1; i >= 0; i--) {
        const creature = gs.ambientCreatures[i];
        creature.life--;
        
        if (creature.life <= 0 || !creature.mesh.parent) {
          // Remove creature
          if (creature.mesh.parent) {
            gs.scene.remove(creature.mesh);
          }
          creature.mesh.geometry.dispose();
          creature.mesh.material.dispose();
          gs.ambientCreatures.splice(i, 1);
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
      gs.scene.add(bird);
      
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        0,
        (Math.random() - 0.5) * 10
      ).normalize().multiplyScalar(8);
      
      gs.ambientCreatures.push({
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
      gs.scene.add(bat);
      
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        0,
        (Math.random() - 0.5) * 10
      ).normalize().multiplyScalar(12);
      
      gs.ambientCreatures.push({
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
      gs.scene.add(owl);
      
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        0,
        (Math.random() - 0.5) * 10
      ).normalize().multiplyScalar(6);
      
      gs.ambientCreatures.push({
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
      
      // Spawn near gs.player
      const offsetX = (Math.random() - 0.5) * 30;
      const offsetZ = (Math.random() - 0.5) * 30;
      firefly.position.set(
        gs.player.mesh.position.x + offsetX,
        1 + Math.random() * 3,
        gs.player.mesh.position.z + offsetZ
      );
      
      gs.scene.add(firefly);
      
      gs.ambientCreatures.push({
        type: 'firefly',
        mesh: firefly,
        velocity: new THREE.Vector3(0, 0, 0),
        life: 400
      });
    }
    
    
    // Countdown system (PR #70-71)
    export const countdownMessages = [
      "Get Ready!",
      "3",
      "2",
      "1",
      "Survive!"
    ];

    // Phase 5: Companion System Data
    export const COMPANIONS = {
      stormWolf: {
        id: 'stormWolf',
        name: 'Storm Wolf',
        icon: '🐺',
        evolvedIcon: '⚡',
        type: 'melee',
        baseStats: { damage: 8, attackSpeed: 1.2, health: 50 },
        evolvedStats: { damage: 20, attackSpeed: 0.8, health: 100 },
        unlockCondition: 'default',
        description: 'Melee companion that follows and attacks gs.enemies'
      },
      skyFalcon: {
        id: 'skyFalcon',
        name: 'Sky Falcon',
        icon: '🦅',
        evolvedIcon: '🔥',
        type: 'ranged',
        baseStats: { damage: 6, attackSpeed: 1.5, health: 40 },
        evolvedStats: { damage: 15, attackSpeed: 1.0, health: 80 },
        unlockCondition: 'level15',
        description: 'Ranged companion that circles and dives at gs.enemies'
      },
      waterSpirit: {
        id: 'waterSpirit',
        name: 'Water Spirit',
        icon: '💧',
        evolvedIcon: '🌊',
        type: 'support',
        baseStats: { damage: 3, attackSpeed: 8.0, health: 60 },
        evolvedStats: { damage: 8, attackSpeed: 5.0, health: 120 },
        unlockCondition: 'denLevel2',
        description: 'Support companion that heals and slows gs.enemies'
      }
    };
    

    // Game Settings
    export const gameSettings = {
      autoAim: false, // Auto-aim off by default, upgradeable via attributes
      controlType: 'touch', // 'touch', 'keyboard', 'gamepad'
      soundEnabled: true,
      musicEnabled: true,
      graphicsQuality: 'medium', // 'low', 'medium', 'high'
      isPortrait: null,
      inputListenersRegistered: false
    };

    // Input - Twin-Stick Controls
    export const joystickLeft = { x: 0, y: 0, active: false, id: null, originX: 0, originY: 0 }; // Movement
    export const joystickRight = { x: 0, y: 0, active: false, id: null, originX: 0, originY: 0 }; // Aiming
    
    // Throttle joystick DOM updates for performance (60fps = ~16ms)
    
    // Swipe detection for dash
    
    // Stats
    export const playerStats = {
      lvl: 1,
      exp: 0,
      expReq: GAME_CONFIG.baseExpReq,
      hp: 100,
      maxHp: 100,
      strength: 1,
      armor: 0, // Percentage reduction (0-100)
      speed: 1, // Multiplier
      critChance: 0.1,
      critDmg: 1.5, // 150% base (User said 5%, assuming +5% or 1.05x, but 1.5x is standard)
      damage: 1, // Multiplier
      atkSpeed: 1, // Multiplier
      walkSpeed: 25, // Display value
      kills: 0,
      hpRegen: 0,
      gold: 0,
      survivalTime: 0,
      dashesPerformed: 0,
      damageTaken: 0,
      weaponsUnlocked: 0,
      miniBossesDefeated: 0, // Track mini-boss kills for achievements
      // Perk System
      perks: {
        vampire: 0,      // Life steal %
        juggernaut: 0,   // Damage reduction %
        swift: 0,        // Move speed %
        lucky: 0,        // Crit chance %
        berserker: 0     // Low HP attack speed bonus
      },
      // Skill upgrades
      dashCooldownReduction: 0,
      dashDistanceBonus: 0,
      hasSecondWind: false,
      lifeStealPercent: 0,
      thornsPercent: 0,
      hasBerserkerRage: false,
      treasureHunterChance: 0,
      doubleCritChance: 0
    };

    // Weapons State
    export const weapons = {
      gun: { active: true, level: 1, damage: 15, cooldown: 1000, lastShot: 0, range: 12, barrels: 1 },
      sword: { active: false, level: 0, damage: 30, cooldown: 1500, lastShot: 0, range: 3.5 },
      aura: { active: false, level: 0, damage: 5, cooldown: 500, lastShot: 0, range: 3 },
      meteor: { active: false, level: 0, damage: 60, cooldown: 2500, lastShot: 0, area: 5 },
      droneTurret: { active: false, level: 0, damage: 12, cooldown: 250, lastShot: 0, range: 15, droneCount: 1 }, // Faster fire rate, lower damage per shot (same DPS)
      doubleBarrel: { active: false, level: 0, damage: 25, cooldown: 1200, lastShot: 0, range: 12, spread: 0.3 },
      iceSpear: { active: false, level: 0, damage: 20, cooldown: 1500, lastShot: 0, range: 15, slowPercent: 0.4, slowDuration: 2000 },
      fireRing: { active: false, level: 0, damage: 8, cooldown: 800, lastShot: 0, range: 4, orbs: 3, rotationSpeed: 2 }
    };

    // Magnet range for XP collection
    
    // Dash mechanics

    // New dash state variables (Feature 1)

    // Upgrade Config
    export const UPGRADES = {
      damage: { name: "Base Damage", cost: 100, inc: 0.1, max: 10 },
      health: { name: "Max Health", cost: 100, inc: 10, max: 10 },
      speed: { name: "Move Speed", cost: 150, inc: 0.05, max: 5 },
      armor: { name: "Armor", cost: 200, inc: 2, max: 10 },
      magnet: { name: "Magnet Range", cost: 100, inc: 0.5, max: 5 }
    };

    export { setGamePaused, setGameActive, setGameOver, triggerCinematic, updateCinematic, updateAmbientCreatures };
