// js/modules/mainloop.js
// Main animation loop, day/night cycle, FPS watchdog
    import * as THREE from 'three';
    import { GAME_CONFIG, MONTANA_QUEST_TRIGGER_DISTANCE, EIFFEL_QUEST_TRIGGER_DISTANCE } from './constants.js';
    import { gs, gameSettings, playerStats, weapons, joystickLeft, joystickRight } from './state.js';
    import { playSound } from './audio.js';
    import { checkAchievements } from './achievements.js';
    import { checkQuestConditions, claimTutorialQuest } from './quests.js';

    // --- MAIN LOOP ---
    // Performance tracking for freeze bug investigation
    
    // FRESH: FPS Watchdog - Update rolling average and throttle gs.particles if needed
    function updateFPSWatchdog(frameTime) {
      // Add current frame time to rolling window
      gs.performanceLog.recentFrameTimes.push(frameTime);
      
      // Keep only last 10 frames
      if (gs.performanceLog.recentFrameTimes.length > 10) {
        gs.performanceLog.recentFrameTimes.shift();
      }
      
      // Calculate rolling average FPS
      if (gs.performanceLog.recentFrameTimes.length === 10) {
        const avgFrameTime = gs.performanceLog.recentFrameTimes.reduce((a, b) => a + b, 0) / 10;
        gs.performanceLog.rollingAvgFPS = 1000 / avgFrameTime; // Convert ms to FPS
        
        // Throttle gs.particles if FPS < 30
        if (gs.performanceLog.rollingAvgFPS < 30 && !gs.performanceLog.particleThrottleActive) {
          gs.performanceLog.particleThrottleActive = true;
          console.warn(`FPS watchdog: FPS below 30 (${gs.performanceLog.rollingAvgFPS.toFixed(1)}), throttling gs.particles to 50%`);
        } else if (gs.performanceLog.rollingAvgFPS >= 35 && gs.performanceLog.particleThrottleActive) {
          // Restore gs.particles when FPS recovers above 35 (hysteresis to prevent flapping)
          gs.performanceLog.particleThrottleActive = false;
          console.log(`FPS watchdog: FPS recovered (${gs.performanceLog.rollingAvgFPS.toFixed(1)}), restoring gs.particles`);
        }
      }
    }
    
    // Day/Night Cycle Update - Non-blocking, smooth lighting transitions
    function updateDayNightCycle(dt) {
      if (!gs.dayNightCycle.enabled || !window.ambientLight || !window.dirLight) return;
      
      // Update time of day
      gs.dayNightCycle.timeOfDay += gs.dayNightCycle.cycleSpeed * dt;
      if (gs.dayNightCycle.timeOfDay > 1) gs.dayNightCycle.timeOfDay -= 1;
      
      const t = gs.dayNightCycle.timeOfDay;
      
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
      gs.scene.background = window.currentSkyColor;
      
      // Update fog color to match sky (fog reacts to lighting) with lerp
      if (gs.scene.fog) {
        if (!window.currentFogColor) {
          window.currentFogColor = window.currentSkyColor.clone();
        }
        window.currentFogColor.lerp(window.currentSkyColor, lerpSpeed);
        gs.scene.fog.color = window.currentFogColor;
      }
      
      // Move sun position in an arc
      const sunAngle = (t - 0.25) * Math.PI * 2; // Offset so noon is at top
      // Keep sun at minimum height of 20 to stay above effective horizon
      // Anchor light to gs.player for correct shadow casting as gs.player moves around the map
      const shadowCenterX = (gs.player && gs.player.mesh) ? gs.player.mesh.position.x : 0;
      const shadowCenterZ = (gs.player && gs.player.mesh) ? gs.player.mesh.position.z : 0;
      window.dirLight.position.set(
        shadowCenterX + Math.cos(sunAngle) * 50,
        Math.max(20, Math.sin(sunAngle) * 100), // Minimum 20 units above ground
        shadowCenterZ + Math.sin(sunAngle) * 50
      );
      window.dirLight.target.position.set(shadowCenterX, 0, shadowCenterZ);
      window.dirLight.target.updateMatrixWorld();
    }
    
    function animate(time) {
      requestAnimationFrame(animate);
      
      // Safety check: Ensure Three.js components are initialized before rendering (PR #82)
      if (!gs.renderer || !gs.scene || !gs.camera) {
        return;
      }

      // Initialize gs.lastTime on first frame to prevent huge dt (PR #82 fix)
      if (gs.lastTime === null) {
        gs.lastTime = time;
        gs.gameTime = time / 1000; // Initialize gs.gameTime for visual effects
        // Render the initial frame before returning to avoid blank screen
        gs.renderer.render(gs.scene, gs.camera);
        return;
      }

      // Performance tracking - start frame timer
      const frameStartTime = performance.now();

      let dt = (time - gs.lastTime) / 1000;
      gs.lastTime = time;
      gs.gameTime = time / 1000; // Update game time in seconds
      
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
      if (gs.isGameActive && !gs.isPaused) {
        updateAmbientCreatures(dt);
      }
      
      // Frame Skip Mechanism: Determine if rendering should be skipped based on previous frame time
      // Note: This only skips the render call - game logic still runs to maintain state consistency
      // Rendering is often a significant performance cost, so skipping it can provide relief
      const FRAME_TIME_BUDGET = 33.33; // ~30fps minimum (33.33ms per frame)
      const previousFrameTime = gs.performanceLog.totalFrameTime;
      let shouldSkipRender = false;
      
      // Skip if previous frame exceeded 2x budget (first frame has totalFrameTime=0 so won't skip)
      // But never skip more than 2 consecutive frames to prevent a frozen-screen bug
      if (previousFrameTime > FRAME_TIME_BUDGET * 2 && gs.performanceLog.consecutiveSkipCount < 2) {
        shouldSkipRender = true;
        gs.performanceLog.consecutiveSkipCount++;
        // Throttled warning to prevent console spam during sustained poor performance
        if (!window.lastFrameSkipWarning || (Date.now() - window.lastFrameSkipWarning) > 5000) {
          console.warn(`Frame skip triggered: previous frame took ${previousFrameTime.toFixed(2)}ms`);
          window.lastFrameSkipWarning = Date.now();
        }
      }
      
      // Handle countdown sequence (PR #70)
      if (gs.countdownActive) {
        // During countdown, still render but don't update game logic
        gs.renderer.render(gs.scene, gs.camera);
        return;
      }

      if (gs.isPaused || gs.isGameOver || !gs.isGameActive) {
        // Update gs.camera to follow gs.player even when paused
        if (gs.player && gs.player.mesh && !gs.killCamActive && !gs.cinematicActive) {
          gs.camera.position.x = gs.player.mesh.position.x;
          gs.camera.position.z = gs.player.mesh.position.z + 20;
          gs.camera.lookAt(gs.player.mesh.position);
        }
        // Still render the gs.scene so visual effects (gs.camera shake, gs.particles, modals) are visible (PR #82)
        gs.renderer.render(gs.scene, gs.camera);
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
        if (gs.renderer && gs.renderer.domElement) {
          const rect = gs.renderer.domElement.getBoundingClientRect();
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
          if (dashPressed && !gameSettings.gamepadButtonStates.dashButton && !gs.player.isDashing && joystickLeft.active) {
            gs.player.isDashing = true;
            gs.player.dashTime = gs.player.dashDuration;
            // Convert joystick direction to isometric world coordinates before dashing
            const inputX = joystickLeft.x;
            const inputY = joystickLeft.y;
            // Standard isometric transform from input (screen) space to world space
            // Use the centralized dash method for consistent behavior (iso conversion, effects, stats)
            gs.player.dash(joystickLeft.x, joystickLeft.y);
          }
          gameSettings.gamepadButtonStates.dashButton = dashPressed;
        }
      }

      // Spawn Logic - Only spawn new wave if previous wave is cleared
      gs.frameCount++;
      const aliveEnemies = gs.enemies.filter(e => !e.isDead).length;
      const timeSinceLastWave = gs.frameCount - gs.lastWaveEndTime;
      const minWaveDelay = Math.floor(GAME_CONFIG.waveInterval * 0.6); // 60% of wave interval (3 seconds at 60fps)
      
      // Spawn new wave if: interval passed AND (no gs.enemies alive OR enough time since last spawn)
      if (gs.frameCount % GAME_CONFIG.waveInterval === 0 && (aliveEnemies === 0 || timeSinceLastWave > GAME_CONFIG.waveInterval)) {
        gs.lastWaveEndTime = gs.frameCount; // Update last wave time on every spawn
        const spawnStartTime = performance.now();
        spawnWave();
        const spawnEndTime = performance.now();
        gs.performanceLog.spawnCount++;
        
        // Log if spawning took unusually long
        if (spawnEndTime - spawnStartTime > 10) {
          console.warn(`Spawn wave took ${(spawnEndTime - spawnStartTime).toFixed(2)}ms, enemies: ${aliveEnemies}`);
        }
      } else if (aliveEnemies === 0 && timeSinceLastWave >= minWaveDelay) {
        // Quick spawn if all gs.enemies cleared and minimum delay passed
        gs.lastWaveEndTime = gs.frameCount;
        const spawnStartTime = performance.now();
        spawnWave();
        const spawnEndTime = performance.now();
        gs.performanceLog.spawnCount++;
        
        // Log if spawning took unusually long
        if (spawnEndTime - spawnStartTime > 10) {
          console.warn(`Quick spawn took ${(spawnEndTime - spawnStartTime).toFixed(2)}ms`);
        }
      }
      
      // Track enemy count changes for logging
      if (aliveEnemies !== gs.performanceLog.lastEnemyCount) {
        gs.performanceLog.lastEnemyCount = aliveEnemies;
      }
      
      // HP Regen (Every 60 frames approx 1 sec)
      if (gs.frameCount % 60 === 0 && playerStats.hpRegen > 0 && playerStats.hp < playerStats.maxHp) {
        playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + playerStats.hpRegen);
        updateHUD();
        // Green particle
        gs.spawnParticles(gs.player.mesh.position, 0x00FF00, 2);
      }

      // Update Kill Cam effects
      updateKillCam(dt);
      
      // Update Cinematic Camera effects
      updateCinematic();

      // Player Update
      if (gs.killCamActive) {
        // Preserve kill cam gs.camera position from being overridden by gs.player.update
        const prevCamX = gs.camera.position.x;
        const prevCamZ = gs.camera.position.z;
        gs.player.update(dt);
        gs.camera.position.x = prevCamX;
        gs.camera.position.z = prevCamZ;
      } else if (gs.cinematicActive) {
        // Preserve cinematic gs.camera position
        const prevCamX = gs.camera.position.x;
        const prevCamY = gs.camera.position.y;
        const prevCamZ = gs.camera.position.z;
        gs.player.update(dt);
        gs.camera.position.x = prevCamX;
        gs.camera.position.y = prevCamY;
        gs.camera.position.z = prevCamZ;
      } else {
        gs.player.update(dt);
      }

      // Dash cooldown tick (Feature 1)
      if (gs.isDashing) {
        gs.dashTimer -= dt;
        if (gs.dashTimer <= 0) {
          gs.isDashing = false;
          gs.dashInvulnerable = false;
        }
      }
      if (gs.dashCooldownRemaining > 0) {
        gs.dashCooldownRemaining -= dt;
        if (gs.dashCooldownRemaining < 0) gs.dashCooldownRemaining = 0;
      }
      
      // Lake Physics - Check if gs.player is in water
      const LAKE_CENTER_X = 30;
      const LAKE_CENTER_Z = -30;
      const LAKE_RADIUS = 18;
      const distToLake = Math.sqrt(
        (gs.player.mesh.position.x - LAKE_CENTER_X) ** 2 + 
        (gs.player.mesh.position.z - LAKE_CENTER_Z) ** 2
      );
      
      if (distToLake < LAKE_RADIUS) {
        // Player is in water!
        if (!gs.player.inWater) {
          gs.player.inWater = true;
          gs.player.waterEntryTime = gs.gameTime;
          gs.player.swimBobPhase = 0;
          
          // Splash effect on water entry
          gs.spawnParticles(gs.player.mesh.position, 0x87CEEB, 20); // Blue splash
          gs.spawnParticles(gs.player.mesh.position, 0xFFFFFF, 10); // White foam
          playSound('waterSplash');
        }
        
        // Swimming: 40% speed reduction (was 50%)
        gs.player.velocity.multiplyScalar(0.6);
        
        // Swimming bobbing animation
        gs.player.swimBobPhase = (gs.player.swimBobPhase || 0) + dt * 3.0;
        const bobY = -0.2 + Math.sin(gs.player.swimBobPhase) * 0.15;
        gs.player.mesh.position.y = bobY;
        
        // Gentle swimming tilt/roll
        gs.player.mesh.rotation.z = Math.sin(gs.player.swimBobPhase * 0.7) * 0.12;
        
        // Camera angle adjustment: tilt slightly lower when swimming
        if (!gs.killCamActive && !gs.cinematicActive) {
          gs.camera.position.y = Math.max(10, gs.camera.position.y - dt * 2);
        }
        
        // Create ripple effect
        if (Math.random() < 0.3) {
          gs.spawnParticles(gs.player.mesh.position, 0x87CEEB, 2);
        }
        
        // Check underwater legendary chest collection
        if (window.underwaterChest && !window.underwaterChest.userData.collected) {
          const chestDist = gs.player.mesh.position.distanceTo(window.underwaterChest.position);
          if (chestDist < window.underwaterChest.userData.collectRadius) {
            window.underwaterChest.userData.collected = true;
            gs.scene.remove(window.underwaterChest);
            window.underwaterChest = null;
            
            // Grant legendary armor (+50 armor stacks with existing)
            if (playerStats) {
              playerStats.armor = (playerStats.armor || 0) + 50; // +50 armor
            }
            
            // Show legendary armor popup
            gs.showComicInfoBox(
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
            createFloatingText('LEGENDARY ARMOR!', gs.player.mesh.position);
            gs.spawnParticles(gs.player.mesh.position, 0xFFD700, 30);
            gs.spawnParticles(gs.player.mesh.position, 0xFF8C00, 20);
          }
        }
      } else {
        if (gs.player.inWater) {
          gs.player.inWater = false;
          gs.player.swimBobPhase = 0;
          gs.player.mesh.rotation.z = 0;
          // Return to normal height
          gs.player.mesh.position.y = 0.5;
          // Restore normal gs.camera height
        }
      }
      
      // Check legendary cigar quest
      if (gs.isGameActive && !gs.isPaused) {
        gs.checkLegendaryCigarQuest();
      }
      
      // QUEST 3: Check Stonehenge chest proximity
      if (window.stonehengeChest && 
          gs.saveData.tutorialQuests && 
          (gs.saveData.tutorialQuests.currentQuest === 'quest3_stonehengeGear' ||
           gs.saveData.tutorialQuests.currentQuest === 'quest6_stonehengeChest') &&
          gs.isGameActive && !gs.isPaused) {
        const dist = gs.player.mesh.position.distanceTo(window.stonehengeChest.position);
        if (dist < window.stonehengeChest.userData.pickupRadius) {
          // Player found the chest!
          gs.scene.remove(window.stonehengeChest);
          window.stonehengeChest = null;
          
          const activeQuestId = gs.saveData.tutorialQuests.currentQuest;
          // Show item card popup
          gs.showComicInfoBox(
            '🎁 Treasure Found!',
            '<div style="text-align: center;"><div style="font-size: 48px; margin: 10px 0;">🚬</div><div style="color: #4169E1; font-size: 24px; font-weight: bold;">CIGAR</div><div style="color: #FFD700; font-size: 18px;">★★★ RARE ★★★</div><div style="margin: 15px 0; font-size: 16px; font-family: Arial, sans-serif;">+1 Attack Speed<br>+1 Movement Speed<br>+1 Attack Precision</div><div style="color: #4169E1; font-family: Arial, sans-serif;">Return to camp to claim your reward!</div></div>',
            'Collect!',
            () => {
              // Complete the active stonehenge chest quest
              progressTutorialQuest(activeQuestId, true);
              
              // Show blue particle effect at pickup location
              for (let i = 0; i < 15; i++) {
                const angle = (i / 15) * Math.PI * 2;
                const speed = 2 + Math.random() * 2;
                const particle = gs.particlePool.get();
                if (particle) {
                  particle.mesh.position.copy(gs.player.mesh.position);
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
      
      // Farmer NPC: Update "?" indicator position and check for gs.player proximity to trigger dialogue
      updateFarmerNPCIndicator();
      updateFarmerBubblePosition();
      if (gs.farmerNPC && !gs.windmillQuest.dialogueOpen && !gs.isPaused && !gs.isGameOver) {
        const farmerDist = gs.player.mesh.position.distanceTo(gs.farmerNPC.position);
        const FARMER_TALK_DIST = 5;
        // Trigger intro dialogue if quest not yet started (and not currently failed/awaiting retry)
        if (!gs.windmillQuest.active && !gs.windmillQuest.hasCompleted && !gs.windmillQuest.failed && !gs.windmillQuest.failedCooldown && farmerDist < FARMER_TALK_DIST) {
          const windmillRef = gs.animatedSceneObjects.windmills.length > 0 ? gs.animatedSceneObjects.windmills[0] : null;
          showFarmerDialogue(FARMER_DIALOGUE.intro, function() {
            if (windmillRef) startWindmillQuest(windmillRef);
          });
        }
        // Reward dialogue after quest success
        else if (gs.windmillQuest.hasCompleted && gs.windmillQuest.rewardReady && !gs.windmillQuest.rewardGiven && farmerDist < FARMER_TALK_DIST) {
          showFarmerDialogue(FARMER_DIALOGUE.success, function() {
            giveWindmillQuestReward();
          });
        }
        // Failure dialogue – shown once after quest fails; sets cooldown to prevent immediate re-trigger
        else if (gs.windmillQuest.failed && !gs.windmillQuest.active && !gs.windmillQuest.hasCompleted && farmerDist < FARMER_TALK_DIST) {
          showFarmerDialogue(FARMER_DIALOGUE.failure, function() {
            gs.windmillQuest.failed = false;
            gs.windmillQuest.failedCooldown = true; // Prevent quest from restarting until next run
          });
        }
      }

      // Check windmill quest trigger – quest now starts only via farmer NPC dialogue above

      // Update windmill quest
      if (gs.windmillQuest.active) {
        gs.windmillQuest.timer -= dt;
        updateWindmillQuestUI();
        
        if (gs.windmillQuest.timer <= 0) {
          // Quest completed successfully
          completeWindmillQuest();
        } else if (gs.windmillQuest.windmill && gs.windmillQuest.windmill.userData.hp <= 0) {
          // Quest failed – windmill destroyed
          failWindmillQuest();
        }
      }
      
      // Check Montana quest trigger (optimized with stored reference)
      if (!gs.montanaQuest.active && !gs.montanaQuest.hasCompleted && gs.montanaLandmark) {
        const dist = gs.player.mesh.position.distanceTo(gs.montanaLandmark.position);
        if (dist < MONTANA_QUEST_TRIGGER_DISTANCE) {
          startMontanaQuest(gs.montanaLandmark);
        }
      }
      
      // Update Montana quest
      if (gs.montanaQuest.active) {
        gs.montanaQuest.timer -= dt;
        updateMontanaQuestUI();
        
        if (gs.montanaQuest.timer <= 0 && gs.montanaQuest.kills >= gs.montanaQuest.killsNeeded) {
          // Quest completed successfully
          completeMontanaQuest();
        } else if (gs.montanaQuest.timer <= 0) {
          // Quest failed
          gs.montanaQuest.active = false;
          document.getElementById('montana-quest-ui').style.display = 'none';
          createFloatingText("MONTANA FAILED!", gs.montanaQuest.landmark.position);
        }
      }
      
      // Check Eiffel quest trigger (optimized with stored reference)
      if (!gs.eiffelQuest.active && !gs.eiffelQuest.hasCompleted && gs.eiffelLandmark) {
        const dist = gs.player.mesh.position.distanceTo(gs.eiffelLandmark.position);
        if (dist < EIFFEL_QUEST_TRIGGER_DISTANCE) {
          startEiffelQuest(gs.eiffelLandmark);
        }
      }
      
      // Update Eiffel quest
      if (gs.eiffelQuest.active) {
        gs.eiffelQuest.timer -= dt;
        updateEiffelQuestUI();
        
        if (gs.eiffelQuest.timer <= 0 && gs.eiffelQuest.kills >= gs.eiffelQuest.killsNeeded) {
          // Quest completed successfully
          completeEiffelQuest();
        } else if (gs.eiffelQuest.timer <= 0) {
          // Quest failed
          gs.eiffelQuest.active = false;
          document.getElementById('eiffel-quest-ui').style.display = 'none';
          createFloatingText("EIFFEL FAILED!", gs.eiffelQuest.landmark.position);
        }
      }

      // --- WEAPONS ---
      
      // 1. GUN
      if (weapons.gun.active && time - weapons.gun.lastShot > weapons.gun.cooldown) {
        // Find nearest enemy
        let nearest = null;
        let minDst = Infinity;
        
        for (let e of gs.enemies) {
          if (e.isDead) continue;
          const d = gs.player.mesh.position.distanceTo(e.mesh.position);
          if (d < weapons.gun.range && d < minDst) {
            minDst = d;
            nearest = e;
          }
        }

        // In manual mode: only fire if right stick is active (gs.player is aiming) OR if on keyboard/gamepad
        // This prevents auto-fire off-aim on mobile touch
        const canFireManual = gameSettings.autoAim || joystickRight.active || gameSettings.controlType === 'keyboard' || gameSettings.controlType === 'gamepad';

        if (nearest && canFireManual) {
          // Determine fire target:
          // - auto-aim: target nearest enemy directly
          // - manual with right stick: fire in right-stick direction
          // - manual keyboard: fire in gs.player facing direction
          let gunTarget;
          if (gameSettings.autoAim) {
            gunTarget = nearest.mesh.position;
          } else if (joystickRight.active) {
            // Right stick directs the shot
            const aimAngle = Math.atan2(joystickRight.x, joystickRight.y);
            gunTarget = new THREE.Vector3(
              gs.player.mesh.position.x + Math.sin(aimAngle) * weapons.gun.range,
              0,
              gs.player.mesh.position.z + Math.cos(aimAngle) * weapons.gun.range
            );
          } else {
            gunTarget = new THREE.Vector3(
              gs.player.mesh.position.x + Math.sin(gs.player.mesh.rotation.y) * weapons.gun.range,
              0,
              gs.player.mesh.position.z + Math.cos(gs.player.mesh.rotation.y) * weapons.gun.range
            );
          }
          // Fire based on barrels
          for(let i=0; i<weapons.gun.barrels; i++) {
            setTimeout(() => {
              gs.projectiles.push(new Projectile(gs.player.mesh.position.x, gs.player.mesh.position.z, gunTarget));
              
              // Muzzle flash light effect - smaller radius to keep lightning contained to barrel area
              const isNight = gs.dayNightCycle.timeOfDay < 0.2 || gs.dayNightCycle.timeOfDay > 0.8;
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
              flashLight.position.copy(gs.player.mesh.position);
              flashLight.position.y += 1;
              flashLight.castShadow = false; // Performance: no shadows for flash
              gs.scene.add(flashLight);
              gs.flashLights.push(flashLight);
              
              // Add ground reflection light at night for bounce effect
              if (isNight) {
                const reflectionLight = new THREE.PointLight(flashColor, flashIntensity * 0.5, flashRadius * 0.7);
                reflectionLight.position.copy(gs.player.mesh.position);
                reflectionLight.position.y = 0.1; // Near ground
                gs.scene.add(reflectionLight);
                gs.flashLights.push(reflectionLight);
                
                // Remove reflection with main flash
                const reflTimeoutId = setTimeout(() => {
                  gs.scene.remove(reflectionLight);
                  const idx = gs.flashLights.indexOf(reflectionLight);
                  if (idx > -1) gs.flashLights.splice(idx, 1);
                }, 80);
                gs.activeTimeouts.push(reflTimeoutId);
              }
              
              // Remove flash after short time
              const timeoutId = setTimeout(() => {
                gs.scene.remove(flashLight);
                const idx = gs.flashLights.indexOf(flashLight);
                if (idx > -1) gs.flashLights.splice(idx, 1);
                const tidx = gs.activeTimeouts.indexOf(timeoutId);
                if (tidx > -1) gs.activeTimeouts.splice(tidx, 1);
              }, 80);
              gs.activeTimeouts.push(timeoutId);
              
              // Gun kickback effect - snappy recoil via scale squish
              gs.player.mesh.scale.set(1.15, 0.85, 1.15);
              if (gs.playerRecoilTimeout) clearTimeout(gs.playerRecoilTimeout);
              gs.playerRecoilTimeout = setTimeout(() => {
                gs.player.mesh.scale.set(1, 1, 1);
                gs.playerRecoilTimeout = null;
              }, 80);
              gs.activeTimeouts.push(gs.playerRecoilTimeout);
              
              // Enhanced muzzle sparks: small directional sparks from barrel tip
              const muzzlePos = gs.player.mesh.position.clone();
              muzzlePos.y += 0.5;
              // Offset muzzle forward in gs.player facing direction
              muzzlePos.x += Math.sin(gs.player.mesh.rotation.y) * 0.6;
              muzzlePos.z += Math.cos(gs.player.mesh.rotation.y) * 0.6;
              gs.spawnParticles(muzzlePos, 0xFFFF44, 4); // Yellow muzzle sparks
              gs.spawnParticles(muzzlePos, 0xFFFFFF, 2); // White hot flash
              gs.spawnParticles(muzzlePos, 0xFF8800, 2); // Orange embers
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
        // Let's slash in gs.player rotation direction
        const angle = gs.player.mesh.rotation.y;
        gs.projectiles.push(new SwordSlash(gs.player.mesh.position.x, gs.player.mesh.position.z, angle));
        weapons.sword.lastShot = time;
        playSound('sword'); // Sword slash sound
        
        // ENHANCED - Add sword slash visual effects
        gs.spawnParticles(gs.player.mesh.position, 0xC0C0C0, 8); // Silver slash gs.particles
        gs.spawnParticles(gs.player.mesh.position, 0xFFFFFF, 5); // White sparkles
        // Add flash light for sword slash - track timeout for proper cleanup
        const slashLight = new THREE.PointLight(0xC0C0C0, 3, 8);
        slashLight.position.copy(gs.player.mesh.position);
        slashLight.position.y += 1;
        gs.scene.add(slashLight);
        gs.flashLights.push(slashLight);
        
        const timeoutId = setTimeout(() => {
          gs.scene.remove(slashLight);
          const idx = gs.flashLights.indexOf(slashLight);
          if (idx > -1) gs.flashLights.splice(idx, 1);
          const tidx = gs.activeTimeouts.indexOf(timeoutId);
          if (tidx > -1) gs.activeTimeouts.splice(tidx, 1);
        }, 100);
        gs.activeTimeouts.push(timeoutId);
      }

      // 3. AURA
      if (weapons.aura.active && time - weapons.aura.lastShot > weapons.aura.cooldown) {
        // Damage all in range
        let hit = false;
        gs.enemies.forEach(e => {
          if (e.isDead) return;
          const d = gs.player.mesh.position.distanceTo(e.mesh.position);
          if (d < weapons.aura.range) {
            e.takeDamage(weapons.aura.damage * playerStats.strength);
            hit = true;
          }
        });
        if (hit) {
          // ENHANCED - Visual effect for aura tick
          gs.spawnParticles(gs.player.mesh.position, 0x5DADE2, 10); // Blue aura gs.particles
          gs.spawnParticles(gs.player.mesh.position, 0xFFFFFF, 5); // White sparkles
        }
        weapons.aura.lastShot = time;
      }

      // 4. METEOR
      if (weapons.meteor.active && time - weapons.meteor.lastShot > weapons.meteor.cooldown) {
        // Target random enemy or random spot near gs.player
        let targetX = gs.player.mesh.position.x + (Math.random() - 0.5) * 10;
        let targetZ = gs.player.mesh.position.z + (Math.random() - 0.5) * 10;
        
        if (gs.enemies.length > 0) {
          const e = gs.enemies[Math.floor(Math.random() * gs.enemies.length)];
          targetX = e.mesh.position.x;
          targetZ = e.mesh.position.z;
        }
        
        gs.meteors.push(new Meteor(targetX, targetZ));
        weapons.meteor.lastShot = time;
      }

      // 5. DRONE TURRET
      if (weapons.droneTurret.active && time - weapons.droneTurret.lastShot > weapons.droneTurret.cooldown) {
        // Update all drones
        for (let drone of gs.droneTurrets) {
          if (!drone.active) continue;
          
          // Find nearest enemy for this drone
          let nearestEnemy = null;
          let minDist = Infinity;
          
          for (let e of gs.enemies) {
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
            gs.projectiles.push(projectile);
            
            // Small muzzle flash from drone
            const flashLight = new THREE.PointLight(0x00FFFF, 2, 8);
            flashLight.position.copy(drone.mesh.position);
            flashLight.position.y += 0.2;
            gs.scene.add(flashLight);
            gs.flashLights.push(flashLight);
            const timeoutId = setTimeout(() => {
              gs.scene.remove(flashLight);
              const idx = gs.flashLights.indexOf(flashLight);
              if (idx > -1) gs.flashLights.splice(idx, 1);
              const tidx = gs.activeTimeouts.indexOf(timeoutId);
              if (tidx > -1) gs.activeTimeouts.splice(tidx, 1);
            }, 50);
            gs.activeTimeouts.push(timeoutId);
            
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
        
        for (let e of gs.enemies) {
          if (e.isDead) continue;
          const d = gs.player.mesh.position.distanceTo(e.mesh.position);
          if (d < weapons.doubleBarrel.range && d < minDst) {
            minDst = d;
            nearest = e;
          }
        }

        if (nearest) {
          // Fire 6 pellets with spread (shotgun pattern)
          const baseDir = new THREE.Vector3(
            nearest.mesh.position.x - gs.player.mesh.position.x,
            0,
            nearest.mesh.position.z - gs.player.mesh.position.z
          ).normalize();
          
          const baseAngle = Math.atan2(baseDir.z, baseDir.x);
          const spreadAngle = weapons.doubleBarrel.spread;
          
          // Create 6 pellets in a spread pattern
          for (let i = 0; i < 6; i++) {
            const angle = baseAngle + (Math.random() - 0.5) * spreadAngle * 2;
            const target = new THREE.Vector3(
              gs.player.mesh.position.x + Math.cos(angle) * weapons.doubleBarrel.range,
              0,
              gs.player.mesh.position.z + Math.sin(angle) * weapons.doubleBarrel.range
            );
            const pellet = new Projectile(gs.player.mesh.position.x, gs.player.mesh.position.z, target);
            pellet.isDoubleBarrel = true;
            pellet.speed = 0.6; // Faster gs.projectiles for shotgun
            gs.projectiles.push(pellet);
          }
          
          // HEAVY RECOIL - much stronger than pistol
          gs.player.mesh.scale.set(1.3, 0.7, 1.3);
          if (gs.playerRecoilTimeout) clearTimeout(gs.playerRecoilTimeout);
          gs.playerRecoilTimeout = setTimeout(() => {
            gs.player.mesh.scale.set(1, 1, 1);
            gs.playerRecoilTimeout = null;
          }, 100);
          gs.activeTimeouts.push(gs.playerRecoilTimeout);
          
          // Orange/yellow muzzle flash (shotgun characteristic)
          const flashLight = new THREE.PointLight(0xFFA500, 8, 18); // Orange, brighter, wider
          flashLight.position.copy(gs.player.mesh.position);
          flashLight.position.y += 1;
          gs.scene.add(flashLight);
          gs.flashLights.push(flashLight);
          const timeoutId = setTimeout(() => {
            gs.scene.remove(flashLight);
            const idx = gs.flashLights.indexOf(flashLight);
            if (idx > -1) gs.flashLights.splice(idx, 1);
            const tidx = gs.activeTimeouts.indexOf(timeoutId);
            if (tidx > -1) gs.activeTimeouts.splice(tidx, 1);
          }, 100);
          gs.activeTimeouts.push(timeoutId);
          
          // Focused muzzle flash for shotgun blast (wider spread)
          const shotgunMuzzlePos = gs.player.mesh.position.clone();
          shotgunMuzzlePos.y += 0.5;
          gs.spawnParticles(shotgunMuzzlePos, 0xFFA500, 3); // Orange muzzle
          gs.spawnParticles(shotgunMuzzlePos, 0xFFFF00, 2); // Yellow spark
          gs.spawnParticles(shotgunMuzzlePos, 0xFFFFFF, 2); // White flash
          // Heavy muzzle smoke for shotgun
          spawnMuzzleSmoke(gs.player.mesh.position, 6);
          
          weapons.doubleBarrel.lastShot = time;
          playSound('doublebarrel'); // Double barrel sound
        }
      }
      
      // 7. ICE SPEAR
      if (weapons.iceSpear.active && time - weapons.iceSpear.lastShot > weapons.iceSpear.cooldown) {
        // Find nearest enemy
        let nearest = null;
        let minDst = Infinity;
        
        for (let e of gs.enemies) {
          if (e.isDead) continue;
          const d = gs.player.mesh.position.distanceTo(e.mesh.position);
          if (d < weapons.iceSpear.range && d < minDst) {
            minDst = d;
            nearest = e;
          }
        }

        if (nearest) {
          gs.projectiles.push(new IceSpear(gs.player.mesh.position.x, gs.player.mesh.position.z, nearest.mesh.position));
          
          // Ice flash effect
          const flashLight = new THREE.PointLight(0x87CEEB, 3, 12); // Sky blue
          flashLight.position.copy(gs.player.mesh.position);
          flashLight.position.y += 1;
          gs.scene.add(flashLight);
          gs.flashLights.push(flashLight);
          const timeoutId = setTimeout(() => {
            gs.scene.remove(flashLight);
            const idx = gs.flashLights.indexOf(flashLight);
            if (idx > -1) gs.flashLights.splice(idx, 1);
            const tidx = gs.activeTimeouts.indexOf(timeoutId);
            if (tidx > -1) gs.activeTimeouts.splice(tidx, 1);
          }, 80);
          gs.activeTimeouts.push(timeoutId);
          
          gs.spawnParticles(gs.player.mesh.position, 0x87CEEB, 8); // Ice blue gs.particles
          gs.spawnParticles(gs.player.mesh.position, 0xFFFFFF, 5); // White gs.particles
          
          weapons.iceSpear.lastShot = time;
          playSound('shoot');
        }
      }
      
      // 8. FIRE RING
      if (weapons.fireRing.active && time - weapons.fireRing.lastShot > weapons.fireRing.cooldown) {
        // Damage gs.enemies within ring range
        let hit = false;
        gs.enemies.forEach(e => {
          if (e.isDead) return;
          const d = gs.player.mesh.position.distanceTo(e.mesh.position);
          if (d < weapons.fireRing.range) {
            const dmg = weapons.fireRing.damage * playerStats.strength;
            const isCrit = Math.random() < playerStats.critChance;
            const finalDmg = isCrit ? dmg * playerStats.critDmg : dmg;
            e.takeDamage(finalDmg);
            createDamageNumber(finalDmg, e.mesh.position, isCrit);
            
            // Fire gs.particles on hit
            gs.spawnParticles(e.mesh.position, 0xFF4500, 6); // Orange-red fire
            gs.spawnParticles(e.mesh.position, 0xFFD700, 4); // Yellow flames
            hit = true;
          }
        });
        weapons.fireRing.lastShot = time;
      }

      // Entities Update
      gs.enemies.forEach(e => e.update(dt, gs.player.mesh.position));
      updateWaterParticles(dt);
      updateStatBar();
      
      // Phase 5: Update companion
      if (gs.activeCompanion && !gs.activeCompanion.isDead) {
        gs.activeCompanion.update(dt);
      }
      
      // Update drone turrets
      gs.droneTurrets.forEach(drone => drone.update(dt));
      
      // Projectiles update returns false if dead
      gs.projectiles = gs.projectiles.filter(p => p.update() !== false);
      gs.meteors = gs.meteors.filter(m => m.update() !== false);
      gs.expGems.forEach(g => g.update(gs.player.mesh.position));
      gs.goldCoins.forEach(g => g.update(gs.player.mesh.position));
      gs.chests.forEach(c => c.update(gs.player.mesh.position));
      
      // Phase 5: Update gs.particles and release back to pool when dead
      // PERFORMANCE: Cull gs.particles beyond fog distance (35 units)
      const FOG_DISTANCE = 35;
      gs.particles = gs.particles.filter(p => {
        // Cull gs.particles beyond fog distance
        const distToPlayer = p.mesh.position.distanceTo(gs.player.mesh.position);
        if (distToPlayer > FOG_DISTANCE) {
          if (gs.particlePool) {
            gs.particlePool.release(p);
          }
          return false;
        }
        
        const alive = p.update();
        if (!alive && gs.particlePool) {
          gs.particlePool.release(p);
        }
        return alive;
      });
      
      // Update blood decal fade (12 second lifetime)
      updateBloodDecals();
      
      // Update blood drips (falling drops from wounded gs.enemies)
      if (gs.bloodDrips.length > 0) {
        gs.bloodDrips = gs.bloodDrips.filter(d => {
          d.velY -= 0.018;
          d.mesh.position.y += d.velY;
          d.life--;
          if (d.mesh.position.y <= 0.02 || d.life <= 0) {
            const hitGround = d.mesh.position.y <= 0.02;
            const pos = d.mesh.position.clone();
            gs.scene.remove(d.mesh);
            d.mesh.geometry.dispose();
            d.mesh.material.dispose();
            if (hitGround) spawnBloodDecal(pos);
            return false;
          }
          return true;
        });
      }
      
      // Performance: Use cached arrays instead of gs.scene.traverse() every frame
      // Windmill Rotation and Light Animation
      gs.animatedSceneObjects.windmills.forEach(c => {
        // Rotate the blades stored in userData
        if (c.userData.blades && c.userData.blades.length > 0) {
          c.userData.blades[0].rotation.z += 0.05;
          c.userData.blades[1].rotation.z += 0.05;
        }
        
        // Animate windmill light (pulsing) with null check
        if (c.userData.light && c.userData.light.material) {
          c.userData.light.material.opacity = 0.8 + Math.sin(gs.gameTime * 3) * 0.2;
        }
      });
      
      // Water ripple animation
      gs.animatedSceneObjects.waterRipples.forEach(c => {
        c.userData.phase += 0.05;
        const scale = 1 + Math.sin(c.userData.phase) * 0.1;
        c.scale.set(scale, 1, scale);
        c.material.opacity = 0.3 + Math.sin(c.userData.phase) * 0.2;
      });
      
      // Lake sparkles animation
      gs.animatedSceneObjects.sparkles.forEach(c => {
        c.userData.phase += 0.02 * c.userData.speed;
        c.material.opacity = 0.3 + Math.abs(Math.sin(c.userData.phase)) * 0.7;
        c.scale.set(
          1 + Math.sin(c.userData.phase * 2) * 0.5,
          1,
          1 + Math.sin(c.userData.phase * 2) * 0.5
        );
      });
      
      // Crystal tower animation
      gs.animatedSceneObjects.crystals.forEach(obj => {
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
      
      // Comet particle animation (orbiting gs.particles)
      gs.animatedSceneObjects.cometParticles.forEach(obj => {
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
      
      // Fence physics - check gs.player collision and reset
      if (window.breakableFences) {
        window.breakableFences.forEach(fence => {
          if (fence.userData.isFence && fence.userData.hp > 0) {
            const dist = Math.sqrt(
              (gs.player.mesh.position.x - fence.position.x) ** 2 +
              (gs.player.mesh.position.z - fence.position.z) ** 2
            );
            
            // Player collision - shake fence
            if (dist < 2) {
              fence.rotation.x = Math.sin(gs.gameTime * 10) * 0.1;
              fence.rotation.z = Math.cos(gs.gameTime * 10) * 0.1;
            } else {
              // Return to normal
              fence.rotation.x *= 0.9;
              fence.rotation.z *= 0.9;
            }
          }
        });
      }
      
      // Walk-into prop damage: barrels and crates take damage when gs.player runs into them
      if (window.destructibleProps && gs.player && !gs.player.isDead) {
        const PROP_WALK_COLLISION_SQ = 1.2; // Squared distance: ~1.1 unit radius for barrel/crate collision
        const PROP_WALK_DMG_COOLDOWN = 300; // ms between walk-into damage ticks (tunable)
        for (let prop of window.destructibleProps) {
          if (prop.destroyed || prop.type === 'tree') continue; // Trees need dash to break
          const pdx = gs.player.mesh.position.x - prop.mesh.position.x;
          const pdz = gs.player.mesh.position.z - prop.mesh.position.z;
          const pdist2 = pdx * pdx + pdz * pdz;
          if (pdist2 < PROP_WALK_COLLISION_SQ) {
            if (!prop._walkDmgTimer || Date.now() - prop._walkDmgTimer > PROP_WALK_DMG_COOLDOWN) {
              prop._walkDmgTimer = Date.now();
              prop.hp -= 8; // Walk-into damage
              gs.spawnParticles(prop.mesh.position, 0xD2691E, 4);
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
                  gs.spawnParticles(prop.mesh.position, 0xFF4500, 20);
                  gs.spawnParticles(prop.mesh.position, 0xFFFF00, 10);
                } else {
                  gs.spawnParticles(prop.mesh.position, 0xD2691E, 18);
                }
                gs.scene.remove(prop.mesh);
                if (prop.mesh.geometry) prop.mesh.geometry.dispose();
                if (prop.mesh.material) prop.mesh.material.dispose();
              }
            }
          }
        }
      }
      
      // Waterfall animation
      gs.animatedSceneObjects.waterfalls.forEach(obj => {
        obj.userData.phase += 0.05;
        obj.material.opacity = 0.6 + Math.sin(obj.userData.phase) * 0.1;
      });
      
      gs.animatedSceneObjects.waterDrops.forEach(obj => {
        obj.position.y -= obj.userData.speed;
        if (obj.position.y < 0) {
          obj.position.y = obj.userData.startY;
        }
      });
      
      gs.animatedSceneObjects.splashes.forEach(obj => {
        obj.userData.phase += 0.1;
        const scale = 1 + Math.sin(obj.userData.phase) * 0.3;
        obj.scale.set(scale, 1, scale);
        obj.material.opacity = 0.4 + Math.sin(obj.userData.phase) * 0.2;
      });
      
      // FRESH IMPLEMENTATION: Tesla Tower Lightning Arcs Animation
      gs.animatedSceneObjects.teslaTowers.forEach(tower => {
        if (!tower.userData.arcTimer) tower.userData.arcTimer = 0;
        tower.userData.arcTimer += dt;
        
        // Create new lightning arc every 1.5 seconds
        if (tower.userData.arcTimer > 1.5) {
          tower.userData.arcTimer = 0;
          
          // Clear old arcs
          if (tower.userData.arcLines && tower.userData.arcLines.length > 0) {
            tower.userData.arcLines.forEach(line => {
              gs.scene.remove(line);
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
            gs.scene.add(line);
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
      gs.enemies = gs.enemies.filter(e => !e.isDead);
      
      // Update managed smoke gs.particles (replaces individual RAF loops)
      gs.smokeParticles = gs.smokeParticles.filter(sp => {
        sp.life--;
        sp.mesh.position.x += sp.velocity.x;
        sp.mesh.position.y += sp.velocity.y;
        sp.mesh.position.z += sp.velocity.z;
        sp.mesh.scale.multiplyScalar(1.05);
        sp.material.opacity = (sp.life / sp.maxLife) * 0.5;
        if (sp.life <= 0) {
          gs.scene.remove(sp.mesh);
          sp.geometry.dispose();
          sp.material.dispose();
          return false;
        }
        return true;
      });
      
      const now = Date.now();
      if (now - gs.lastCleanupTime > 3000) { // Run cleanup every 3 seconds
        gs.lastCleanupTime = now;
        
        // Limit max items on ground (memory optimization)
        const MAX_EXP_GEMS = 100;
        const MAX_GOLD_COINS = 50;
        
        // Helper function to cleanup distant items
        const cleanupDistantItems = (items, maxItems, collectCallback) => {
          if (items.length > maxItems && gs.player && gs.player.mesh) {
            // Sort by distance, keep closest ones, auto-collect furthest
            items.sort((a, b) => {
              const distA = a.mesh.position.distanceTo(gs.player.mesh.position);
              const distB = b.mesh.position.distanceTo(gs.player.mesh.position);
              return distA - distB;
            });
            
            // Auto-collect excess items (furthest ones)
            const excessItems = items.splice(maxItems);
            excessItems.forEach(item => {
              if (item.active) {
                collectCallback(item);
                gs.scene.remove(item.mesh);
                item.mesh.geometry.dispose();
                item.mesh.material.dispose();
                item.active = false;
              }
            });
          }
        };
        
        // Clean up exp gems
        cleanupDistantItems(gs.expGems, MAX_EXP_GEMS, (gem) => addExp(gem.value));
        
        // Clean up gold coins
        cleanupDistantItems(gs.goldCoins, MAX_GOLD_COINS, (coin) => {
          playerStats.gold += coin.amount;
        });
      }
      
      gs.expGems = gs.expGems.filter(g => g.active);
      gs.goldCoins = gs.goldCoins.filter(g => g.active);
      gs.chests = gs.chests.filter(c => c.active);

      // Screen shake effect
      if (window.screenShakeIntensity > 0.01) {
        gs.camera.position.x += (Math.random() - 0.5) * window.screenShakeIntensity * 2;
        gs.camera.position.y += (Math.random() - 0.5) * window.screenShakeIntensity * 1;
        gs.camera.position.z += (Math.random() - 0.5) * window.screenShakeIntensity * 2;
        window.screenShakeIntensity *= 0.85; // Decay
      } else {
        window.screenShakeIntensity = 0;
      }

      // Fountain jet animation
      if (window.fountainJets && gs.isGameActive) {
        const fjTime = gs.gameTime;
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
        const col = gs.countdownActive ? 0x00FFFF : 0x00FFCC;
        window.spawnPortal.ringMat.color.setHex(col);
        window.spawnPortal.discMat.color.setHex(col);
        // Slowly rotate
        window.spawnPortal.ring.rotation.z += dt * 1.5;
        // Fade out 3s after game starts
        if (gs.isGameActive && !gs.countdownActive) {
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
          uwData.glowLight.intensity = 3 + Math.sin(gs.gameTime * 3) * 1.5;
        }
        // Gentle bobbing
        window.underwaterChest.position.y = -0.4 + Math.sin(gs.gameTime * 1.5) * 0.08;
      }

      // Phase 3: Render loop protection - wrap in try-catch to prevent freeze
      // Frame Skip Mechanism: Skip rendering if frame budget exceeded
      const renderStartTime = performance.now();
      
      if (!shouldSkipRender) {
        try {
          gs.renderer.render(gs.scene, gs.camera);
          gs.performanceLog.renderCount++;
          gs.performanceLog.consecutiveSkipCount = 0; // Reset on successful render
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
      gs.performanceLog.totalFrameTime = totalFrameTime;
      gs.performanceLog.frameCount++;
      
      // FRESH: Update FPS watchdog with current frame time
      updateFPSWatchdog(totalFrameTime);
      
      // Log slow frames
      if (totalFrameTime > FRAME_TIME_BUDGET) {
        gs.performanceLog.slowFrames++;
        if (totalFrameTime > FRAME_TIME_BUDGET * 1.5) {
          console.warn(`Slow frame detected: ${totalFrameTime.toFixed(2)}ms (render: ${(renderEndTime - renderStartTime).toFixed(2)}ms, enemies: ${aliveEnemies}, particles: ${gs.particles.length}, projectiles: ${gs.projectiles.length})`);
        }
      }
      
      // Track cumulative frame time for accurate average
      gs.performanceLog.cumulativeFrameTime += totalFrameTime;
      
      // Periodic performance summary (every 5 seconds)
      const currentTime = performance.now();
      if (currentTime - gs.performanceLog.lastLogTime > 5000) {
        const avgFrameTime = gs.performanceLog.cumulativeFrameTime / gs.performanceLog.frameCount;
        const slowFramePercent = (gs.performanceLog.slowFrames / gs.performanceLog.frameCount * 100).toFixed(1);
        console.log(`Performance Summary: Avg frame: ${avgFrameTime.toFixed(2)}ms, Slow frames: ${slowFramePercent}%, Enemies: ${aliveEnemies}, Spawns: ${gs.performanceLog.spawnCount}, Renders: ${gs.performanceLog.renderCount}`);
        
        // Reset counters for next period
        gs.performanceLog.lastLogTime = currentTime;
        gs.performanceLog.slowFrames = 0;
        gs.performanceLog.frameCount = 0;
        gs.performanceLog.spawnCount = 0;
        gs.performanceLog.renderCount = 0;
        gs.performanceLog.cumulativeFrameTime = 0;
      }
      
      // Process disposal queue after rendering (PR #81)
      processDisposalQueue();
    }


    export { animate, updateDayNightCycle };
