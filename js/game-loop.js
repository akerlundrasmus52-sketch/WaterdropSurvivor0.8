// js/game-loop.js — Performance logging, FPS watchdog, day/night cycle update,
// and the main animate() game loop (collision detection, AI updates, rendering).
// This is the last file loaded — it starts the game by calling init().

    // ─── Shared geometries/materials for hot-path effects (avoid per-frame allocation) ───
    let _sharedGoreGeo = null;      // DodecahedronGeometry for gore blobs
    let _sharedGoreMats = [null, null]; // Two alternating MeshStandardMaterials
    let _sharedLavaGeo  = null;     // SphereGeometry for lava spout particles
    let _sharedLavaMats = [null, null]; // Two color variants
    // Shared lightning bolt materials (avoid creating new materials per bolt)
    let _sharedBoltMat = null;
    let _sharedGlowMat = null;
    // Shared smoke geometry (avoid per-particle geometry creation)
    let _sharedSmokeGeo = null;
    // Cached homing missile geometries/materials (avoid per-missile creation)
    let _missileGeoCache = null;

    function _ensureSharedGeo() {
      if (typeof THREE === 'undefined') return;
      if (!_sharedGoreGeo) {
        _sharedGoreGeo = new THREE.DodecahedronGeometry(0.09, 0);
        _sharedGoreMats[0] = new THREE.MeshStandardMaterial({ color: 0x6B0000, roughness: 0.9 });
        _sharedGoreMats[1] = new THREE.MeshStandardMaterial({ color: 0x4B0082, roughness: 0.9 });
      }
      if (!_sharedLavaGeo) {
        _sharedLavaGeo = new THREE.SphereGeometry(0.15, 4, 4);
        _sharedLavaMats[0] = new THREE.MeshBasicMaterial({ color: 0xFF4500 });
        _sharedLavaMats[1] = new THREE.MeshBasicMaterial({ color: 0xFF8C00 });
      }
      if (!_sharedBoltMat) {
        _sharedBoltMat = new THREE.LineBasicMaterial({ color: 0xFFFF00, transparent: true, opacity: 1.0, linewidth: 2 });
        _sharedGlowMat = new THREE.LineBasicMaterial({ color: 0x88DDFF, transparent: true, opacity: 0.6, linewidth: 3 });
      }
      if (!_sharedSmokeGeo) {
        _sharedSmokeGeo = new THREE.SphereGeometry(0.15, 4, 4);
      }
      if (!_missileGeoCache) {
        _missileGeoCache = {
          bodyGeo: new THREE.SphereGeometry(0.3, 8, 8),
          bodyMat: new THREE.MeshToonMaterial({ color: 0x222222 }),
          noseGeo: new THREE.ConeGeometry(0.2, 0.3, 6),
          noseMat: new THREE.MeshToonMaterial({ color: 0x111111 }),
          armGeo: new THREE.BoxGeometry(0.5, 0.08, 0.15),
          armMat: new THREE.MeshToonMaterial({ color: 0x111111 }),
          eyeGeo: new THREE.SphereGeometry(0.08, 6, 6),
          eyeWhiteMat: new THREE.MeshBasicMaterial({ color: 0xFFFFFF }),
          pupilGeo: new THREE.SphereGeometry(0.04, 4, 4),
          pupilMat: new THREE.MeshBasicMaterial({ color: 0x000000 })
        };
      }
    }

    // ─── Muzzle Flash PointLight Pool ──────────────────────────────────────────────
    // Pre-allocate 3 reusable PointLights instead of creating new ones every shot.
    // This eliminates GPU shader recompilations that caused FPS drops during combat.
    const FLASH_POOL_SIZE = 3;
    let _flashPool = null;
    // Reusable temporary vector for _acquireFlash callers (avoids per-shot clone allocations).
    // Initialized at script load time — THREE CDN is always loaded before game-loop.js.
    const _flashTempPos = new THREE.Vector3();
    // Reusable temp vectors for weapon targeting — avoids per-shot Vector3 allocations
    const _tmpGunTarget = new THREE.Vector3();
    const _tmpSpreadTarget = new THREE.Vector3();
    const _tmpShotgunDir = new THREE.Vector3();
    const _tmpShotgunTarget = new THREE.Vector3();
    const _tmpBoltStart = new THREE.Vector3();
    const _tmpBoltEnd = new THREE.Vector3();
    const _tmpKnockback = new THREE.Vector3();

    function _ensureFlashPool(sceneRef) {
      if (_flashPool !== null || typeof THREE === 'undefined') return;
      _flashPool = [];
      for (let i = 0; i < FLASH_POOL_SIZE; i++) {
        const pl = new THREE.PointLight(0xFFFFFF, 0, 1);
        pl.castShadow = false;
        pl.position.set(0, -9999, 0); // parked off-screen when idle
        pl._poolExpireAt = 0;
        sceneRef.add(pl);
        _flashPool.push(pl);
      }
    }

    // Acquire a pooled PointLight, configure it, and auto-dim after `duration` ms.
    // Reuses the slot whose expiry is furthest in the past so concurrent flashes work.
    function _acquireFlash(sceneRef, color, intensity, radius, pos, duration) {
      _ensureFlashPool(sceneRef);
      if (!_flashPool) return;
      const now = performance.now ? performance.now() : Date.now();
      let best = _flashPool[0];
      for (let i = 1; i < _flashPool.length; i++) {
        if (_flashPool[i]._poolExpireAt <= now) { best = _flashPool[i]; break; }
        if (_flashPool[i]._poolExpireAt < best._poolExpireAt) best = _flashPool[i];
      }
      best.color.setHex(color);
      best.intensity = intensity;
      best.distance = radius;
      best.position.copy(pos);
      best._poolExpireAt = now + duration;
      // Timeout just dims the light; harmless if called after a game reset because
      // game-over-reset.js already zeros all pool lights synchronously on reset.
      setTimeout(() => {
        best.intensity = 0;
        best.position.set(0, -9999, 0);
        best._poolExpireAt = 0;
      }, duration);
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
      particleThrottleScale: 1.0, // Granular: 1.0 = full, 0.25 = 25%
      consecutiveSkipCount: 0, // Track consecutive skipped renders to prevent frozen screen
      gameLogicErrorCount: 0  // Track consecutive game logic errors (freeze detection)
    };
    // Expose for cross-script FPS-based throttling (BloodSystem, etc.)
    window.performanceLog = performanceLog;
    
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
        
        // Granular particle throttling based on FPS tiers
        const fps = performanceLog.rollingAvgFPS;
        let newScale;
        if (fps < 20) {
          newScale = 0.25; // Critical: 25% particles
        } else if (fps < 30) {
          newScale = 0.50; // Low: 50% particles
        } else if (fps < 45) {
          newScale = 0.75; // Medium: 75% particles
        } else {
          newScale = 1.0;  // Good: full particles
        }
        
        // Apply with hysteresis: only restore when FPS is 5 above threshold
        if (newScale < performanceLog.particleThrottleScale) {
          performanceLog.particleThrottleScale = newScale;
          performanceLog.particleThrottleActive = newScale < 1.0;
          if (newScale < 1.0) console.warn(`FPS watchdog: FPS=${fps.toFixed(1)}, particles at ${(newScale*100).toFixed(0)}%`);
        } else if (fps >= 50 && performanceLog.particleThrottleScale < 1.0) {
          performanceLog.particleThrottleScale = 1.0;
          performanceLog.particleThrottleActive = false;
          console.log(`FPS watchdog: FPS recovered (${fps.toFixed(1)}), restoring full particles`);
        } else if (fps >= 35 && performanceLog.particleThrottleScale < 0.75) {
          performanceLog.particleThrottleScale = 0.75;
        } else if (fps >= 25 && performanceLog.particleThrottleScale < 0.50) {
          performanceLog.particleThrottleScale = 0.50;
        }
      }
    }
    
    // Enhance spawnParticles to respect throttle
    // Use window.spawnParticles explicitly so the reassignment works correctly across
    // separate <script> files that share the global scope (function declarations live
    // on window, not in a per-script lexical scope, so window.x is the canonical reference)
    if (typeof window.spawnParticles === 'function') {
      const originalSpawnParticles = window.spawnParticles;
      window.spawnParticles = function(position, color, count) {
        // Apply granular throttle based on FPS tier (25-100%)
        const adjustedCount = Math.ceil(count * performanceLog.particleThrottleScale);
        if (adjustedCount <= 0) return;
        return originalSpawnParticles(position, color, adjustedCount);
      };
    }

    // ─── Combat Intensity Tracking ──────────────────────────────────────────────
    // Tracks recent kill rate to drive dynamic shadow-map quality reduction during
    // heavy combat. Lower shadow resolution during intense fights recovers ~5 FPS.
    let _combatKillsInWindow = 0;      // kills in last 3 seconds
    let _combatWindowStart = 0;        // timestamp of window start (ms)
    const COMBAT_WINDOW_MS = 3000;     // 3-second rolling window
    const COMBAT_INTENSITY_HIGH = 5;   // kills/window → reduce shadows
    const COMBAT_INTENSITY_LOW  = 2;   // kills/window → restore shadows
    let _shadowsReducedForCombat = false;

    /**
     * Call once per enemy kill to register for combat intensity.
     * Exposed on window so any script (enemy-class, game-loop) can call it.
     */
    window.registerCombatKill = function() {
      _combatKillsInWindow++;
    };

    /**
     * Tick combat intensity each frame: age out old kills and apply dynamic
     * shadow-map quality changes if the kill rate crosses thresholds.
     * @param {number} nowMs - current timestamp in milliseconds
     */
    function updateCombatIntensity(nowMs) {
      if (nowMs - _combatWindowStart > COMBAT_WINDOW_MS) {
        _combatKillsInWindow = 0;
        _combatWindowStart = nowMs;
      }

      if (!window.dirLight || !renderer) return;

      if (!_shadowsReducedForCombat && _combatKillsInWindow >= COMBAT_INTENSITY_HIGH) {
        // Heavy combat — drop shadow map to 512 and use faster shadow type
        if (window.dirLight.shadow.mapSize.width !== 512) {
          if (window.dirLight.shadow.map) { window.dirLight.shadow.map.dispose(); window.dirLight.shadow.map = null; }
          window.dirLight.shadow.mapSize.width  = 512;
          window.dirLight.shadow.mapSize.height = 512;
          renderer.shadowMap.type = THREE.PCFShadowMap; // Faster shadow filtering
          renderer.shadowMap.needsUpdate = true;
        }
        _shadowsReducedForCombat = true;
      } else if (_shadowsReducedForCombat && _combatKillsInWindow <= COMBAT_INTENSITY_LOW) {
        // Combat calmed down — restore default shadow quality
        const defaultSize = (typeof RENDERER_CONFIG !== 'undefined' && RENDERER_CONFIG.defaultShadowMapSize) ? RENDERER_CONFIG.defaultShadowMapSize : 1024;
        if (window.dirLight.shadow.mapSize.width !== defaultSize) {
          if (window.dirLight.shadow.map) { window.dirLight.shadow.map.dispose(); window.dirLight.shadow.map = null; }
          window.dirLight.shadow.mapSize.width  = defaultSize;
          window.dirLight.shadow.mapSize.height = defaultSize;
          renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Restore quality shadows
          renderer.shadowMap.needsUpdate = true;
        }
        _shadowsReducedForCombat = false;
      }
    }

    
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
      
      let sunIntensity, ambientIntensity;
      
      if (t < 0.25) {
        // Night to sunrise (0 -> 0.25)
        const phase = smoothstep(t / 0.25); // Smooth easing
        sunIntensity = 0.2 + (0.6 * phase); // 0.2 -> 0.8
        ambientIntensity = 0.3 + (0.3 * phase); // 0.3 -> 0.6
      } else if (t < 0.5) {
        // Sunrise to noon (0.25 -> 0.5)
        const phase = smoothstep((t - 0.25) / 0.25);
        sunIntensity = 0.8 + (0.2 * phase); // 0.8 -> 1.0
        ambientIntensity = 0.6 + (0.1 * phase); // 0.6 -> 0.7
      } else if (t < 0.75) {
        // Noon to sunset (0.5 -> 0.75)
        const phase = smoothstep((t - 0.5) / 0.25);
        sunIntensity = 1.0 - (0.6 * phase); // 1.0 -> 0.4
        ambientIntensity = 0.7 - (0.3 * phase); // 0.7 -> 0.4
      } else {
        // Sunset to night (0.75 -> 1.0)
        const phase = smoothstep((t - 0.75) / 0.25);
        sunIntensity = 0.4 - (0.2 * phase); // 0.4 -> 0.2
        ambientIntensity = 0.4 - (0.1 * phase); // 0.4 -> 0.3
      }
      
      // Apply lighting changes with lerp for extra smoothness
      const lerpSpeed = 0.1; // Smooth transition speed
      window.ambientLight.intensity += (ambientIntensity - window.ambientLight.intensity) * lerpSpeed;
      window.dirLight.intensity += (sunIntensity - window.dirLight.intensity) * lerpSpeed;
      
      // Note: scene.background and scene.fog.color are kept at their initial COLORS.bg value.
      // Changing them to sky-blue during the day cycle caused a blue-screen artifact at the
      // screen edges and the fog area, which is now fixed by relying solely on dynamic
      // lighting (ambient + directional) to convey the time of day.
      
      // Move sun position in an arc - shadows cast from side based on sun position
      // At 6pm (t=0.75), sun is low on horizon casting long lateral shadows
      // At noon (t=0.5), sun is overhead casting short shadows
      const sunAngle = (t - 0.25) * Math.PI * 2; // Offset so noon is at top
      // Sun elevation: high at noon, low at dawn/dusk for dramatic side shadows
      const sunElevation = Math.sin(sunAngle);
      // At 6pm (sunset), sun is low — shadows stretch sideways from objects
      const sunHeight = Math.max(15, sunElevation * 80);
      // Horizontal offset increases as sun goes lower (longer lateral shadows)
      const lateralStrength = 60;
      // Anchor light to player for correct shadow casting as player moves around the map
      const shadowCenterX = (player && player.mesh) ? player.mesh.position.x : 0;
      const shadowCenterZ = (player && player.mesh) ? player.mesh.position.z : 0;
      window.dirLight.position.set(
        shadowCenterX + Math.cos(sunAngle) * lateralStrength,
        sunHeight,
        shadowCenterZ + Math.sin(sunAngle) * lateralStrength
      );
      window.dirLight.target.position.set(shadowCenterX, 0, shadowCenterZ);
      window.dirLight.target.updateMatrixWorld();
      
      // Dynamic shadow quality based on sun angle - sharper at low angles
      const shadowSharpness = Math.max(1, 6 - Math.abs(sunElevation) * 4);
      window.dirLight.shadow.radius = shadowSharpness;
    }
    
    // 120 fps cap: minimum milliseconds between processed frames (~8.33 ms)
    const _MIN_FRAME_MS = 1000 / 120;
    let _lastAnimTime = 0;

    function animate(time) {
      animationFrameId = requestAnimationFrame(animate);
      
      // Safety check: Ensure Three.js components are initialized before rendering (PR #82)
      if (!renderer || !scene || !camera) {
        return;
      }

      // Cap frame rate at 120fps to avoid unnecessary GPU work on high-refresh screens.
      // Use a fixed increment to avoid under-running the target on high-refresh displays.
      if (time - _lastAnimTime < _MIN_FRAME_MS) return;
      _lastAnimTime += _MIN_FRAME_MS;

      // Initialize lastTime on first frame to prevent huge dt (PR #82 fix)
      if (lastTime === null) {
        lastTime = time;
        gameTime = time / 1000; // Initialize gameTime for visual effects
        // Render the initial frame before returning to avoid blank screen
        try { renderer.render(scene, camera); } catch(e) { console.error('Render error (init frame):', e); }
        return;
      }

      // Performance tracking - start frame timer
      const frameStartTime = performance.now();

      let dt = (time - lastTime) / 1000;
      lastTime = time;
      gameTime = time / 1000; // Update game time in seconds

      // Guard against NaN or negative dt (e.g. from tab-switch timing jitter)
      // which could propagate NaN into physics positions and permanently break the loop.
      if (!isFinite(dt) || dt <= 0) dt = 0.016; // fallback to ~60fps frame

      // Debug: log frame timing anomalies (throttled, observation-only)
      if (window.GameDebug) window.GameDebug.onFrameStart(time, dt * 1000, gameTime);
      
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
      
      // 3D Camp Hub World — update and render when active, skip all game logic
      if (window.CampWorld && window.CampWorld.isActive) {
        try { window.CampWorld.update(dt); } catch(e) { console.error('[CampWorld] Update error:', e); }
        try { window.CampWorld.render(); } catch(e) { console.error('[CampWorld] Render error:', e); }
        return;
      }

      // Day/Night Cycle - Update lighting smoothly (non-blocking)
      // Runs every frame regardless of pause state for smooth visual transitions
      updateDayNightCycle(dt);

      // Update combat intensity and dynamic shadow quality every frame
      updateCombatIntensity(performance.now ? performance.now() : Date.now());

      
      // Update ambient creatures (birds, bats, fireflies, owls) based on time of day
      // Throttle to every other frame — cosmetic-only, saves CPU
      if (isGameActive && !isPaused && (performanceLog.frameCount & 1) === 0) {
        updateAmbientCreatures(dt * 2); // Double dt to compensate for half update rate
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
      
      // Update Kill Cam and Cinematic effects before any early-return so they always
      // advance and terminate correctly — even when the game is paused (e.g. a level-up
      // pause that coincides with a boss cinematic).  Without this, cinematicActive could
      // stay true indefinitely while paused, leaving the camera locked on the now-empty
      // boss position and producing the "visual freeze" symptom.
      updateKillCam(dt);
      updateCinematic();

      // Handle countdown sequence (PR #70)
      if (countdownActive) {
        // During countdown, still render but don't update game logic
        try { renderer.render(scene, camera); } catch(e) { console.error('Render error (countdown):', e); }
        return;
      }

      if (isPaused || isGameOver || !isGameActive) {
        // Update camera to follow player even when paused.
        // cinematicActive is intentionally NOT excluded here: updateCinematic() ran
        // above and already ended any elapsed cinematic, so by the time we reach this
        // branch cinematicActive is false whenever the cinematic has finished.
        if (player && player.mesh && !killCamActive && !cinematicActive) {
          camera.position.x = player.mesh.position.x;
          camera.position.z = player.mesh.position.z + 20;
          camera.lookAt(player.mesh.position);
        }
        // Still render the scene so visual effects (camera shake, particles, modals) are visible (PR #82)
        try { renderer.render(scene, camera); } catch(e) { console.error('Render error (paused):', e); }
        return;
      }
      
      // --- BEGIN GAME LOGIC (wrapped in try-catch to guarantee rendering) ---
      // Any uncaught exception in game logic previously prevented renderer.render() from
      // being called, producing the "frozen picture, game runs in background" bug.
      let aliveEnemies = 0; // Declared here so it's accessible in the performance logging below
      try {

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
      aliveEnemies = enemies.filter(e => !e.isDead).length;
      const timeSinceLastWave = frameCount - lastWaveEndTime;
      const minWaveDelay = Math.floor(GAME_CONFIG.waveInterval * 0.6); // 60% of wave interval (3 seconds at 60fps)
      
      // Spawn new wave if: interval passed AND (no enemies alive OR enough time since last spawn)
      if (frameCount % GAME_CONFIG.waveInterval === 0 && (aliveEnemies === 0 || timeSinceLastWave > GAME_CONFIG.waveInterval)) {
        lastWaveEndTime = frameCount; // Update last wave time on every spawn
        const spawnStartTime = performance.now();
        const _dbgPreSpawn = enemies.length;
        spawnWave();
        const spawnEndTime = performance.now();
        performanceLog.spawnCount++;
        if (window.GameDebug && window.GameDebug.enabled) {
          window.GameDebug.onEnemyTick(enemies, enemies.length - _dbgPreSpawn, 0);
        }
        
        // Log if spawning took unusually long
        if (spawnEndTime - spawnStartTime > 10) {
          console.warn(`Spawn wave took ${(spawnEndTime - spawnStartTime).toFixed(2)}ms, enemies: ${aliveEnemies}`);
        }
      } else if (aliveEnemies === 0 && timeSinceLastWave >= minWaveDelay) {
        // Quick spawn if all enemies cleared and minimum delay passed
        lastWaveEndTime = frameCount;
        const spawnStartTime = performance.now();
        const _dbgPreSpawn2 = enemies.length;
        spawnWave();
        const spawnEndTime = performance.now();
        performanceLog.spawnCount++;
        if (window.GameDebug && window.GameDebug.enabled) {
          window.GameDebug.onEnemyTick(enemies, enemies.length - _dbgPreSpawn2, 0);
        }
        
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

      // Low-HP damage bonus: dynamically update playerStats.damage each frame
      if (playerStats.lowHpDamage > 0) {
        playerStats.damage = playerStats.hp < playerStats.maxHp * 0.5 ? (1 + playerStats.lowHpDamage) : 1;
      }

      // Player Update
      if (killCamActive) {
        // Preserve kill cam camera position from being overridden by player.update
        const prevCamX = camera.position.x;
        const prevCamZ = camera.position.z;
        if (window.GameDebug) window.GameDebug.safeCall('player.update', () => player.update(dt));
        else player.update(dt);
        camera.position.x = prevCamX;
        camera.position.z = prevCamZ;
      } else if (cinematicActive) {
        // Preserve cinematic camera position
        const prevCamX = camera.position.x;
        const prevCamY = camera.position.y;
        const prevCamZ = camera.position.z;
        if (window.GameDebug) window.GameDebug.safeCall('player.update', () => player.update(dt));
        else player.update(dt);
        camera.position.x = prevCamX;
        camera.position.y = prevCamY;
        camera.position.z = prevCamZ;
      } else {
        if (window.GameDebug) window.GameDebug.safeCall('player.update', () => player.update(dt));
        else player.update(dt);
      }

      // Update enemy AI movement (was missing - enemies were frozen)
      // Debug: track alive/died counts per frame for diagnostics
      const _dbgAliveBeforeEnemyTick = window.GameDebug && window.GameDebug.enabled
        ? enemies.filter(e => e && !e.isDead).length : 0;
      enemies.forEach(e => { if (e && e.mesh && !e.isDead) e.update(dt, player.mesh.position); });
      if (window.GameDebug && window.GameDebug.enabled) {
        const _dbgAliveAfter = enemies.filter(e => e && !e.isDead).length;
        window.GameDebug.onEnemyTick(enemies, 0, _dbgAliveBeforeEnemyTick - _dbgAliveAfter);
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

      // Companion Egg at UFO sight (quest18_findCompanionEgg)
      if (window.companionEggObject &&
          saveData.tutorialQuests &&
          saveData.tutorialQuests.currentQuest === 'quest18_findCompanionEgg' &&
          !saveData.hasCompanionEgg &&
          isGameActive && !isPaused) {
        const eggDist = player.mesh.position.distanceTo(window.companionEggObject.position);
        if (eggDist < window.companionEggObject.userData.pickupRadius) {
          scene.remove(window.companionEggObject);
          window.companionEggObject = null;
          saveData.hasCompanionEgg = true;
          // Add egg to inventory display
          saveData.inventory.push({
            id: 'companion_egg_ufo',
            name: 'Mysterious Companion Egg',
            type: 'special',
            rarity: 'legendary',
            description: 'A pulsing egg found at the UFO crash site. Hatch it in the Companion House!',
            isCompanionEgg: true
          });
          saveSaveData();
          // Show pickup popup
          showComicInfoBox(
            '🥚 Companion Egg Found!',
            '<div style="text-align:center;"><div style="font-size:64px;margin:10px 0;animation:pulse 1s ease-in-out infinite;">🥚</div><div style="color:#00FFB4;font-size:22px;font-weight:bold;">MYSTERIOUS COMPANION EGG</div><div style="color:#FFD700;font-size:16px;">★★★★★ LEGENDARY ★★★★★</div><div style="margin:15px 0;font-size:14px;font-family:Arial,sans-serif;color:#ccc;">Found at the UFO crash site in Area 51. Something stirs within... Take it to the <b style="color:#00FFB4;">Companion House</b> to hatch it!</div></div>',
            '🐣 Take to Camp!',
            () => {
              progressTutorialQuest('quest18_findCompanionEgg', true);
              // Show green particles
              for (let i = 0; i < 20; i++) {
                const angle = (i / 20) * Math.PI * 2;
                const speed = 2 + Math.random() * 3;
                const particle = particlePool.get();
                if (particle) {
                  particle.mesh.position.copy(player.mesh.position);
                  particle.velocity.set(Math.cos(angle) * speed, 4 + Math.random() * 2, Math.sin(angle) * speed);
                  particle.mesh.material.color.setHex(0x00FFB4);
                  particle.mesh.visible = true;
                  particle.active = true;
                  particle.life = 1.5;
                }
              }
            }
          );
        }
        // Animate the egg (bob up and down)
        if (window.companionEggObject) {
          window.companionEggObject.position.y = Math.sin(Date.now() * 0.002) * 0.3;
          window.companionEggObject.rotation.y += 0.01;
        }
      } else if (window.companionEggObject && !saveData.hasCompanionEgg) {
        // Keep animating even when quest isn't active
        window.companionEggObject.position.y = Math.sin(Date.now() * 0.002) * 0.3;
        window.companionEggObject.rotation.y += 0.01;
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
      
      // Track landmark visits for quest11_findAllLandmarks
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest11_findAllLandmarks') {
        if (!saveData.tutorialQuests.landmarksFound) {
          saveData.tutorialQuests.landmarksFound = { stonehenge: false, pyramid: false, montana: false, teslaTower: false };
        }
        const lf = saveData.tutorialQuests.landmarksFound;
        const px = player.mesh.position.x, pz = player.mesh.position.z;
        for (const cfg of Object.values(LANDMARK_CONFIGS)) {
          if (!lf[cfg.key] && Math.hypot(px - cfg.x, pz - cfg.z) < cfg.radius) {
            lf[cfg.key] = true;
            createFloatingText(`📍 ${cfg.label} Found!`, player.mesh.position);
            showStatChange(`📍 ${cfg.label} Found!`);
            saveSaveData();
          }
        }
        // Check if all found
        const allFound = Object.values(LANDMARK_CONFIGS).every(cfg => lf[cfg.key]);
        if (allFound) {
          progressTutorialQuest('quest11_findAllLandmarks', true);
          saveSaveData();
        }
        updateQuestTracker();
      }
      
      // 1. GUN
      if (weapons.gun.active && time - weapons.gun.lastShot > weapons.gun.cooldown) {
        // Find nearest enemy (squared distance avoids sqrt per enemy)
        let nearest = null;
        let minDstSq = weapons.gun.range * weapons.gun.range;
        
        for (let e of enemies) {
          if (e.isDead) continue;
          const dSq = player.mesh.position.distanceToSquared(e.mesh.position);
          if (dSq < minDstSq) {
            minDstSq = dSq;
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
            _tmpGunTarget.set(
              player.mesh.position.x + Math.sin(aimAngle) * weapons.gun.range,
              0,
              player.mesh.position.z + Math.cos(aimAngle) * weapons.gun.range
            );
            gunTarget = _tmpGunTarget;
          } else {
            _tmpGunTarget.set(
              player.mesh.position.x + Math.sin(player.mesh.rotation.y) * weapons.gun.range,
              0,
              player.mesh.position.z + Math.cos(player.mesh.rotation.y) * weapons.gun.range
            );
            gunTarget = _tmpGunTarget;
          }
          // Fire based on barrels
          for(let i=0; i<weapons.gun.barrels; i++) {
            setTimeout(() => {
              projectiles.push(new Projectile(player.mesh.position.x, player.mesh.position.z, gunTarget));
              
              // Trigger waterdrop shooting wave animation
              if (i === 0) {
                const wdc = document.getElementById('waterdrop-container');
                if (wdc) {
                  wdc.classList.remove('shooting');
                  void wdc.offsetWidth;
                  wdc.classList.add('shooting');
                  setTimeout(() => wdc.classList.remove('shooting'), 300);
                }
              }
              
              // Double Cast: chance to fire a second shot with slight spread
              const castChance = playerStats.doubleCastChance || 0;
              if (castChance > 0 && Math.random() < castChance) {
                const spreadAngle = (Math.random() - 0.5) * (Math.PI / 18); // random ±5 degrees
                const dx = gunTarget.x - player.mesh.position.x;
                const dz = gunTarget.z - player.mesh.position.z;
                // Rotate displacement vector by spreadAngle to get a new target at same distance
                _tmpSpreadTarget.set(
                  player.mesh.position.x + (Math.cos(spreadAngle) * dx - Math.sin(spreadAngle) * dz),
                  0,
                  player.mesh.position.z + (Math.sin(spreadAngle) * dx + Math.cos(spreadAngle) * dz)
                );
                projectiles.push(new Projectile(player.mesh.position.x, player.mesh.position.z, _tmpSpreadTarget));
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
              
              // Use pooled flash light to avoid shader recompilation per shot
              _flashTempPos.copy(player.mesh.position); _flashTempPos.y += 1;
              _acquireFlash(scene, flashColor, flashIntensity, flashRadius, _flashTempPos, 80);
              if (isNight) {
                _flashTempPos.copy(player.mesh.position); _flashTempPos.y = 0.1;
                _acquireFlash(scene, flashColor, flashIntensity * 0.5, flashRadius * 0.7, _flashTempPos, 80);
              }
              
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
        // Pooled flash light for sword slash (avoids shader recompilation)
        _flashTempPos.copy(player.mesh.position); _flashTempPos.y += 1;
        _acquireFlash(scene, 0xC0C0C0, 3, 8, _flashTempPos, 100);
      }

      // 3. AURA
      if (weapons.aura.active && time - weapons.aura.lastShot > weapons.aura.cooldown) {
        // Damage all in range (auraRange skill multiplier expands reach)
        const effectiveAuraRange = weapons.aura.range * (playerStats.auraRange || 1.0);
        const auraRangeSq = effectiveAuraRange * effectiveAuraRange;
        let hit = false;
        enemies.forEach(e => {
          if (e.isDead) return;
          const dSq = player.mesh.position.distanceToSquared(e.mesh.position);
          if (dSq < auraRangeSq) {
          e.takeDamage(weapons.aura.damage * playerStats.strength, false, 'aura');
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
          
          // Find nearest enemy for this drone (squared distance avoids sqrt)
          let nearestEnemy = null;
          let minDistSq = weapons.droneTurret.range * weapons.droneTurret.range;
          
          for (let e of enemies) {
            if (e.isDead) continue;
            const distSq = drone.mesh.position.distanceToSquared(e.mesh.position);
            if (distSq < minDistSq) {
              minDistSq = distSq;
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
            // Drone shots: very small (barely visible) but fast — high-DPS volume fire
            projectile.mesh.scale.set(0.35, 0.35, 0.35);
            projectile.mesh.material.color.setHex(0x00FFFF); // Cyan tint for drone shots
            if (projectile.glow) {
              projectile.glow.scale.set(0.35, 0.35, 0.35);
              projectile.glow.material.color.setHex(0x00FFFF);
            }
            // Fast projectile speed — drones fire many rapid shots
            projectile.vx = projectile.vx * 2.2;
            projectile.vz = projectile.vz * 2.2;
            projectile.life = 30; // Short lifetime = close-range rapid fire
            projectile.maxLife = 30;
            projectiles.push(projectile);
            
            // Tiny cyan muzzle flash from drone (pooled)
            _flashTempPos.copy(drone.mesh.position); _flashTempPos.y += 0.2;
            _acquireFlash(scene, 0x00FFFF, 1.5, 5, _flashTempPos, 40);
            
            playSound('shoot');
          }
        }
        
        weapons.droneTurret.lastShot = time;
      }

      // 6. DOUBLE BARREL - ENHANCED with 6-pellet spread, heavy recoil, orange/yellow flash
      if (weapons.doubleBarrel.active && time - weapons.doubleBarrel.lastShot > weapons.doubleBarrel.cooldown) {
        // Find nearest enemy (squared distance avoids sqrt per enemy)
        let nearest = null;
        let minDstSq = weapons.doubleBarrel.range * weapons.doubleBarrel.range;
        
        for (let e of enemies) {
          if (e.isDead) continue;
          const dSq = player.mesh.position.distanceToSquared(e.mesh.position);
          if (dSq < minDstSq) {
            minDstSq = dSq;
            nearest = e;
          }
        }

        if (nearest) {
          // Fire 6 pellets with spread (shotgun pattern)
          _tmpShotgunDir.set(
            nearest.mesh.position.x - player.mesh.position.x,
            0,
            nearest.mesh.position.z - player.mesh.position.z
          ).normalize();
          
          const baseAngle = Math.atan2(_tmpShotgunDir.z, _tmpShotgunDir.x);
          const spreadAngle = weapons.doubleBarrel.spread;
          
          // Fire pellets with spread (shotgun pattern) - pellets count increases per upgrade
          const pelletCount = weapons.doubleBarrel.pellets || 2;
          for (let i = 0; i < pelletCount; i++) {
            const angle = baseAngle + (Math.random() - 0.5) * spreadAngle * 2;
            _tmpShotgunTarget.set(
              player.mesh.position.x + Math.cos(angle) * weapons.doubleBarrel.range,
              0,
              player.mesh.position.z + Math.sin(angle) * weapons.doubleBarrel.range
            );
            const pellet = new Projectile(player.mesh.position.x, player.mesh.position.z, _tmpShotgunTarget);
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
          
          // Orange/yellow muzzle flash (shotgun characteristic) — pooled
          _flashTempPos.copy(player.mesh.position); _flashTempPos.y += 1;
          _acquireFlash(scene, 0xFFA500, 8, 18, _flashTempPos, 100);
          
          // Focused muzzle flash for shotgun blast (wider spread)
          _flashTempPos.copy(player.mesh.position); _flashTempPos.y = 0.5;
          spawnParticles(_flashTempPos, 0xFFA500, 3); // Orange muzzle
          spawnParticles(_flashTempPos, 0xFFFF00, 2); // Yellow spark
          spawnParticles(_flashTempPos, 0xFFFFFF, 2); // White flash
          // Heavy muzzle smoke for shotgun
          spawnMuzzleSmoke(player.mesh.position, 6);
          
          weapons.doubleBarrel.lastShot = time;
          playSound('doublebarrel'); // Double barrel sound
        }
      }
      
      // 7. ICE SPEAR
      if (weapons.iceSpear.active && time - weapons.iceSpear.lastShot > weapons.iceSpear.cooldown) {
        // Find nearest enemy (squared distance avoids sqrt per enemy)
        let nearest = null;
        let minDstSq = weapons.iceSpear.range * weapons.iceSpear.range;
        
        for (let e of enemies) {
          if (e.isDead) continue;
          const dSq = player.mesh.position.distanceToSquared(e.mesh.position);
          if (dSq < minDstSq) {
            minDstSq = dSq;
            nearest = e;
          }
        }

        if (nearest) {
          projectiles.push(new IceSpear(player.mesh.position.x, player.mesh.position.z, nearest.mesh.position));
          
          // Ice flash effect (pooled)
          _flashTempPos.copy(player.mesh.position); _flashTempPos.y += 1;
          _acquireFlash(scene, 0x87CEEB, 3, 12, _flashTempPos, 80);
          
          spawnParticles(player.mesh.position, 0x87CEEB, 8); // Ice blue particles
          spawnParticles(player.mesh.position, 0xFFFFFF, 5); // White particles
          
          weapons.iceSpear.lastShot = time;
          playSound('shoot');
        }
      }
      
      // 8. FIRE RING
      if (weapons.fireRing.active && time - weapons.fireRing.lastShot > weapons.fireRing.cooldown) {
        // Damage enemies within ring range (squared distance avoids sqrt)
        let hit = false;
        const fireRangeSq = weapons.fireRing.range * weapons.fireRing.range;
        enemies.forEach(e => {
          if (e.isDead) return;
          const dSq = player.mesh.position.distanceToSquared(e.mesh.position);
          if (dSq < fireRangeSq) {
            const dmg = weapons.fireRing.damage * playerStats.strength *
              (1 + (playerStats.fireDamage || 0) + (playerStats.elementalDamage || 0));
            const isCrit = Math.random() < playerStats.critChance;
            const finalDmg = isCrit ? dmg * playerStats.critDmg : dmg;
            e.takeDamage(finalDmg, isCrit, 'fire');
            createDamageNumber(finalDmg, e.mesh.position, isCrit);
            // Fire particles on hit
            spawnParticles(e.mesh.position, 0xFF4500, 6); // Orange-red fire
            spawnParticles(e.mesh.position, 0xFFD700, 4); // Yellow flames
            // Charring effect: progressively darken enemy color toward black on each fire hit.
            // Different factors per channel simulate realistic charring (reds fade slowest).
            if (e.mesh.material && e.mesh.material.color) {
              const CHAR_RED_FACTOR = 0.88;   // Reds persist slightly longer when charred
              const CHAR_GREEN_FACTOR = 0.85; // Greens fade mid-rate
              const CHAR_BLUE_FACTOR = 0.82;  // Blues fade fastest for warm char tint
              e.mesh.material.color.r *= CHAR_RED_FACTOR;
              e.mesh.material.color.g *= CHAR_GREEN_FACTOR;
              e.mesh.material.color.b *= CHAR_BLUE_FACTOR;
            }
            e.lastDamageType = 'fire';
            hit = true;
          }
        });
        weapons.fireRing.lastShot = time;
      }

      // 9. LIGHTNING ARC — chain lightning between up to N enemies
      if (weapons.lightning.active && time - weapons.lightning.lastShot > weapons.lightning.cooldown) {
        let nearest = null;
        let minDstSq = weapons.lightning.range * weapons.lightning.range;
        for (let e of enemies) {
          if (e.isDead) continue;
          const dSq = player.mesh.position.distanceToSquared(e.mesh.position);
          if (dSq < minDstSq) { minDstSq = dSq; nearest = e; }
        }
        if (nearest) {
          const chainCount = weapons.lightning.chainCount || 3;
          const hitTargets = new Set();
          let current = nearest;
          _tmpBoltStart.copy(player.mesh.position); // Start bolt from player (reuse temp)
          for (let c = 0; c < chainCount && current; c++) {
            if (hitTargets.has(current)) break;
            hitTargets.add(current);
            const dmg = (weapons.lightning.damage * playerStats.strength) *
              (1 + (playerStats.lightningDamage || 0) + (playerStats.elementalDamage || 0)) *
              (1 - c * 0.2); // 20% falloff per chain
            const isCrit = Math.random() < playerStats.critChance;
            current.takeDamage(Math.floor(isCrit ? dmg * playerStats.critDmg : dmg), isCrit, 'lightning');
            spawnParticles(current.mesh.position, 0xFFFF00, 6);
            spawnParticles(current.mesh.position, 0x00FFFF, 4);
            
            // Visible lightning bolt line from previous target to current
            const boltPoints = [];
            _tmpBoltStart.y = 0.8;
            _tmpBoltEnd.copy(current.mesh.position); _tmpBoltEnd.y = 0.8;
            const segments = 6 + Math.floor(Math.random() * 4);
            for (let s = 0; s <= segments; s++) {
              const t = s / segments;
              const px = _tmpBoltStart.x + (_tmpBoltEnd.x - _tmpBoltStart.x) * t + (s > 0 && s < segments ? (Math.random() - 0.5) * 0.6 : 0);
              const py = _tmpBoltStart.y + (_tmpBoltEnd.y - _tmpBoltStart.y) * t + (s > 0 && s < segments ? (Math.random() - 0.5) * 0.3 : 0);
              const pz = _tmpBoltStart.z + (_tmpBoltEnd.z - _tmpBoltStart.z) * t + (s > 0 && s < segments ? (Math.random() - 0.5) * 0.6 : 0);
              boltPoints.push(new THREE.Vector3(px, py, pz));
            }
            _ensureSharedGeo();
            const boltGeo = new THREE.BufferGeometry().setFromPoints(boltPoints);
            // Clone shared materials so each bolt can fade independently
            const boltMat = _sharedBoltMat.clone();
            const boltLine = new THREE.Line(boltGeo, boltMat);
            scene.add(boltLine);
            // Glow bolt (wider, dimmer)
            const glowMat = _sharedGlowMat.clone();
            const glowLine = new THREE.Line(boltGeo, glowMat); // share geometry, no clone needed
            scene.add(glowLine);
            // Fade and remove bolt
            if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
              let boltLife = 8;
              managedAnimations.push({ update(_dt) {
                boltLife--;
                boltMat.opacity = boltLife / 8;
                glowMat.opacity = (boltLife / 8) * 0.6;
                if (boltLife <= 0) {
                  scene.remove(boltLine); scene.remove(glowLine);
                  boltGeo.dispose(); boltMat.dispose(); glowMat.dispose();
                  return false;
                }
                return true;
              }});
            } else {
              scene.remove(boltLine); scene.remove(glowLine);
              boltGeo.dispose(); boltMat.dispose(); glowMat.dispose();
            }
            
            _tmpBoltStart.copy(current.mesh.position);
            // Find next chain target
            let nextTarget = null; let nextDist = Infinity;
            for (let e of enemies) {
              if (e.isDead || hitTargets.has(e)) continue;
              const d = current.mesh.position.distanceTo(e.mesh.position);
              if (d < 6 && d < nextDist) { nextDist = d; nextTarget = e; }
            }
            current = nextTarget;
          }
          // Lightning flash (pooled)
          _flashTempPos.copy(nearest.mesh.position); _flashTempPos.y += 1;
          _acquireFlash(scene, 0xFFFF00, 6, 14, _flashTempPos, 100);
          weapons.lightning.lastShot = time;
          playSound('hit');
        }
      }

      // 10. POISON CLOUD — AoE damage field around player that poisons nearby enemies
      if (weapons.poison.active && time - weapons.poison.lastShot > weapons.poison.cooldown) {
        const poisonRangeSq = weapons.poison.range * weapons.poison.range;
        enemies.forEach(e => {
          if (e.isDead) return;
          const dSq = player.mesh.position.distanceToSquared(e.mesh.position);
          if (dSq < poisonRangeSq) {
            const dmg = weapons.poison.damage * playerStats.strength;
            e.takeDamage(Math.floor(dmg));
            spawnParticles(e.mesh.position, 0x00FF00, 4);
            spawnParticles(e.mesh.position, 0x44FF44, 3);
          }
        });
        // Poison cloud visual
        spawnParticles(player.mesh.position, 0x00FF00, 8);
        spawnParticles(player.mesh.position, 0x88FF44, 6);
        weapons.poison.lastShot = time;
      }

      // 11. HOMING MISSILE — Bullet Bill style with fire/smoke trail
      if (weapons.homing.active && time - weapons.homing.lastShot > weapons.homing.cooldown) {
        let nearest = null; let minDstSq = weapons.homing.range * weapons.homing.range;
        for (let e of enemies) {
          if (e.isDead) continue;
          const dSq = player.mesh.position.distanceToSquared(e.mesh.position);
          if (dSq < minDstSq) { minDstSq = dSq; nearest = e; }
        }
        if (nearest) {
          // Bullet Bill body: dark sphere with white eyes — use cached geometries/materials
          _ensureSharedGeo();
          const mc = _missileGeoCache;
          const missileGroup = new THREE.Group();
          const body = new THREE.Mesh(mc.bodyGeo, mc.bodyMat);
          missileGroup.add(body);
          // Nose cone
          const nose = new THREE.Mesh(mc.noseGeo, mc.noseMat);
          nose.rotation.x = Math.PI / 2;
          nose.position.z = 0.35;
          missileGroup.add(nose);
          // Arms (small fins)
          const arms = new THREE.Mesh(mc.armGeo, mc.armMat);
          arms.position.z = -0.15;
          missileGroup.add(arms);
          // White eyes
          const leftEye = new THREE.Mesh(mc.eyeGeo, mc.eyeWhiteMat);
          leftEye.position.set(-0.12, 0.08, 0.22);
          missileGroup.add(leftEye);
          const rightEye = new THREE.Mesh(mc.eyeGeo, mc.eyeWhiteMat);
          rightEye.position.set(0.12, 0.08, 0.22);
          missileGroup.add(rightEye);
          // Pupils
          const leftPupil = new THREE.Mesh(mc.pupilGeo, mc.pupilMat);
          leftPupil.position.set(-0.12, 0.08, 0.28);
          missileGroup.add(leftPupil);
          const rightPupil = new THREE.Mesh(mc.pupilGeo, mc.pupilMat);
          rightPupil.position.set(0.12, 0.08, 0.28);
          missileGroup.add(rightPupil);
          
          missileGroup.position.set(player.mesh.position.x, 0.6, player.mesh.position.z);
          // Tilt missile at 45° angle (lie down instead of standing up)
          missileGroup.rotation.x = -Math.PI / 4;
          scene.add(missileGroup);
          let target = nearest;
          let mLife = 120;
          let smokeTimer = 0;
          const mVel = new THREE.Vector3(target.mesh.position.x - missileGroup.position.x, 0, target.mesh.position.z - missileGroup.position.z).normalize().multiplyScalar(0.25);
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              mLife--;
              smokeTimer++;
              // Home toward target with stronger tracking
              if (!target.isDead) {
                const desired = new THREE.Vector3(target.mesh.position.x - missileGroup.position.x, 0, target.mesh.position.z - missileGroup.position.z).normalize().multiplyScalar(0.25);
                mVel.lerp(desired, 0.15); // Stronger homing
              } else {
                // Re-acquire target if current target died
                let newTarget = null; let newMinDst = Infinity;
                for (let e of enemies) {
                  if (e.isDead) continue;
                  const d = missileGroup.position.distanceTo(e.mesh.position);
                  if (d < 20 && d < newMinDst) { newMinDst = d; newTarget = e; }
                }
                if (newTarget) target = newTarget;
              }
              missileGroup.position.add(mVel);
              missileGroup.rotation.y = Math.atan2(mVel.x, mVel.z);
              missileGroup.rotation.x = -Math.PI / 4; // Maintain 45° tilt
              // Enhanced fire and smoke trail from back
              const trailPos = { x: missileGroup.position.x - mVel.x * 1.5, y: missileGroup.position.y, z: missileGroup.position.z - mVel.z * 1.5 };
              spawnParticles(trailPos, 0xFF4400, 2); // Orange fire
              spawnParticles(trailPos, 0xFF2200, 1); // Red fire
              if (smokeTimer % 2 === 0) {
                spawnParticles(trailPos, 0x555555, 2); // More smoke
                spawnParticles(trailPos, 0x888888, 1); // Light smoke
              }
              // Explode on contact
              for (let e of enemies) {
                if (e.isDead) continue;
                if (missileGroup.position.distanceTo(e.mesh.position) < 1.2) {
                  const dmg = weapons.homing.damage * playerStats.strength;
                  e.takeDamage(Math.floor(dmg), false, 'shotgun'); // Use shotgun death = dismemberment
                  spawnParticles(missileGroup.position, 0xFF4500, 12);
                  spawnParticles(missileGroup.position, 0xFFAA00, 8);
                  spawnParticles(missileGroup.position, 0x222222, 6); // Smoke explosion
                  // Massive blood burst from explosion
                  if (window.BloodSystem) window.BloodSystem.emitBurst(e.mesh.position, 500, { spreadXZ: 2.5, spreadY: 1.5 });
                  // Homing missile: massive gore blobs + heavy blood spray
                  spawnParticles(e.mesh.position, 0x8B0000, 5);
                  spawnParticles(e.mesh.position, 0xCC0000, 4);
                  for (let mgc = 0; mgc < 4 && bloodDrips.length < MAX_BLOOD_DRIPS; mgc++) {
                    _ensureSharedGeo();
                    const mgore = new THREE.Mesh(_sharedGoreGeo, _sharedGoreMats[mgc % 2]);
                    const mgScale = 0.9 + Math.random() * 1.1; // vary size via scale
                    mgore.scale.setScalar(mgScale);
                    mgore.position.copy(e.mesh.position);
                    scene.add(mgore);
                    bloodDrips.push({
                      mesh: mgore,
                      velX: (Math.random() - 0.5) * 0.55,
                      velZ: (Math.random() - 0.5) * 0.55,
                      velY: 0.3 + Math.random() * 0.4,
                      life: 60 + Math.floor(Math.random() * 25)
                    });
                  }
                  for (let gd = 0; gd < 3; gd++) {
                    spawnBloodDecal({ x: e.mesh.position.x + (Math.random()-0.5)*0.8, y: 0, z: e.mesh.position.z + (Math.random()-0.5)*0.8 });
                  }
                  // Heavy knockback from missile
                  _tmpKnockback.set(e.mesh.position.x - missileGroup.position.x, 0, e.mesh.position.z - missileGroup.position.z).normalize();
                  e.mesh.position.x += _tmpKnockback.x * 2.5;
                  e.mesh.position.z += _tmpKnockback.z * 2.5;
                  scene.remove(missileGroup);
                  // Don't dispose shared cached geometries/materials
                  return false;
                }
              }
              if (mLife <= 0) {
                scene.remove(missileGroup);
                return false;
              }
              return true;
            }});
          } else {
            scene.remove(missileGroup);
          }
          weapons.homing.lastShot = time;
          playSound('shoot');
        }
      }
      updateWaterParticles(dt);
      updateStatBar();
      
      // Update Harvesting system (resource node interactions)
      if (window.GameHarvesting && player && player.mesh) {
        window._gamePlayerMesh = player.mesh;
        window.GameHarvesting.update(dt, player.mesh.position, Date.now());
      }

      // Update Rage Combat system (meter decay, special attack cooldowns)
      if (window.GameRageCombat) {
        window.GameRageCombat.update(dt);
      }
      // Update melee takedown button cooldown display
      if (window._updateMeleeButton) window._updateMeleeButton();
      
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
      // PERFORMANCE: Cull particles beyond fog far plane (invisible beyond fog anyway)
      const FOG_DISTANCE = RENDERER_CONFIG.fogFar;
      particles = particles.filter(p => {
        // Cull particles beyond fog distance
        const distToPlayer = p.mesh.position.distanceTo(player.mesh.position);
        if (distToPlayer > FOG_DISTANCE) {
          // Remove from scene before releasing so the mesh is not left as an
          // invisible orphan in scene.children, which inflates scene child count.
          scene.remove(p.mesh);
          p.mesh.visible = false;
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
      
      // Update advanced blood particle system
      if (window.BloodSystem) window.BloodSystem.update();
      
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
          // Apply horizontal velocity for spray effect
          if (d.velX) d.mesh.position.x += d.velX;
          if (d.velZ) d.mesh.position.z += d.velZ;
          d.life--;
          if (d.mesh.position.y <= 0.02 || d.life <= 0) {
            const hitGround = d.mesh.position.y <= 0.02;
            // Reuse temp vector instead of clone()
            _tmpKnockback.copy(d.mesh.position);
            scene.remove(d.mesh);
            // Only dispose geometry/material if they are NOT shared (ice shards etc.)
            if (!_sharedGoreGeo || (d.mesh.geometry !== _sharedGoreGeo && d.mesh.geometry !== _sharedLavaGeo)) {
              d.mesh.geometry.dispose();
            }
            if (!_sharedGoreMats[0] || (d.mesh.material !== _sharedGoreMats[0] && d.mesh.material !== _sharedGoreMats[1] &&
                d.mesh.material !== _sharedLavaMats[0] && d.mesh.material !== _sharedLavaMats[1])) {
              d.mesh.material.dispose();
            }
            // Ice shards don't leave blood decals on landing
            if (hitGround && !d.isIce) spawnBloodDecal(_tmpKnockback);
            return false;
          }
          return true;
        });
      }
      
      // Update object wobble animations (trees, fences, barrels, crates)
      if (window.destructibleProps) {
        for (let prop of window.destructibleProps) {
          if (prop.destroyed || !prop._wobbleTime || prop._wobbleTime <= 0) continue;
          prop._wobbleTime -= dt;
          const wobbleAmount = Math.sin(prop._wobbleTime * 18) * prop._wobbleTime * 0.15;
          const dir = prop._wobbleDir || { x: 1, z: 0 };
          prop.mesh.rotation.x = dir.x * wobbleAmount;
          prop.mesh.rotation.z = dir.z * wobbleAmount;
          if (prop._wobbleTime <= 0) {
            prop.mesh.rotation.x = 0;
            prop.mesh.rotation.z = 0;
          }
        }
      }
      if (window.breakableFences) {
        for (let fence of window.breakableFences) {
          if (!fence.userData || fence.userData.hp <= 0 || !fence.userData._wobbleTime || fence.userData._wobbleTime <= 0) continue;
          fence.userData._wobbleTime -= dt;
          const wobbleAmount = Math.sin(fence.userData._wobbleTime * 20) * fence.userData._wobbleTime * 0.2;
          const dir = fence.userData._wobbleDir || { x: 1, z: 0 };
          fence.rotation.x = dir.x * wobbleAmount;
          fence.rotation.z = dir.z * wobbleAmount;
          if (fence.userData._wobbleTime <= 0) {
            fence.rotation.x = 0;
            fence.rotation.z = 0;
          }
        }
      }
      
      // Performance: Use cached arrays instead of scene.traverse() every frame
      // Windmill Rotation and Light Animation
      animatedSceneObjects.windmills.forEach(c => {
        // Rotate all blades stored in userData
        if (c.userData.blades && c.userData.blades.length > 0) {
          c.userData.blades[0].rotation.z += 0.02;
        }
        // Rotate spinning ground shadow in sync with blades + offset by sun angle
        if (c.userData.shadowGroup) {
          c.userData.shadowGroup.rotation.z += 0.02;
          // Move shadow based on sun position for realistic shadow casting
          if (window.dirLight) {
            const lightPos = window.dirLight.position;
            const wmPos = c.position;
            const shadowDirX = wmPos.x - lightPos.x;
            const shadowDirZ = wmPos.z - lightPos.z;
            const shadowDist = Math.sqrt(shadowDirX*shadowDirX + shadowDirZ*shadowDirZ);
            // Shadow offset: longer when sun is lower (more dramatic at sunset/sunrise)
            const sunH = Math.max(lightPos.y, 15);
            const shadowLength = Math.min(12, 80 / sunH);
            if (shadowDist > 0) {
              c.userData.shadowGroup.position.set(
                wmPos.x + (shadowDirX / shadowDist) * shadowLength,
                0.03,
                wmPos.z + (shadowDirZ / shadowDist) * shadowLength
              );
              // Scale shadow based on sun height
              const shadowScale = 0.8 + shadowLength * 0.15;
              c.userData.shadowGroup.scale.set(shadowScale, shadowScale, 1);
            }
            // Shadow opacity: darker when sun is brighter
            const opacity = Math.min(0.35, window.dirLight.intensity * 0.3);
            c.userData.shadowGroup.children.forEach(child => {
              if (child.material) child.material.opacity = opacity;
            });
          }
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
            // Wobble effect when player walks into prop
            prop.mesh.rotation.x = Math.sin(gameTime * 12) * 0.12;
            prop.mesh.rotation.z = Math.cos(gameTime * 10) * 0.12;
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
          } else {
            // Return to upright position when player moves away
            prop.mesh.rotation.x *= 0.85;
            prop.mesh.rotation.z *= 0.85;
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

      // Volcano light flicker & Tesla light flicker
      if (window.volcanoLight) {
        window.volcanoLight.userData.phase += dt * 8;
        window.volcanoLight.intensity = 3 + Math.sin(window.volcanoLight.userData.phase) * 1.5 + Math.sin(window.volcanoLight.userData.phase * 3.7) * 0.8;
      }
      if (window.lavaPool && window.lavaPool.material) {
        const lp = window.lavaPool;
        lp.userData.phase = (lp.userData.phase || 0) + dt * 4;
        lp.material.color.setHex(Math.sin(lp.userData.phase) > 0 ? 0xFF6A00 : 0xFF4500);
      }
      if (window.teslaPointLight) {
        window.teslaPointLight.userData.phase += dt * 5;
        window.teslaPointLight.intensity = 2 + Math.sin(window.teslaPointLight.userData.phase * 3) * 1.5;
      }
      // Warning light blink (Area 51)
      if (window.warningLight && window.warningLight.material) {
        window.warningLight.material.opacity = Math.sin(gameTime * 3) > 0 ? 0.9 : 0.1;
      }

      // Lava damage: player takes damage when close to volcano (at -100, 0, -120)
      if (player && isGameActive && !isGameOver) {
        const LAVA_DAMAGE_RADIUS = 8;   // Distance from volcano center to take lava damage
        const LAVA_WARN_RADIUS = 14;    // Distance at which warning appears
        const LAVA_MAX_DAMAGE = 10;     // Max damage per tick at volcano center
        const LAVA_TICK_INTERVAL = 0.5; // Seconds between lava damage ticks
        const lavaX = -100, lavaZ = -120;
        const ldx = player.mesh.position.x - lavaX;
        const ldz = player.mesh.position.z - lavaZ;
        const lavaDist = Math.sqrt(ldx * ldx + ldz * ldz);
        // Show warning when approaching lava zone (helps prevent "random death")
        if (lavaDist < LAVA_WARN_RADIUS && lavaDist >= LAVA_DAMAGE_RADIUS) {
          if (!window._lavaWarnShown || (Date.now() - window._lavaWarnShown) > 5000) {
            window._lavaWarnShown = Date.now();
            showStatChange('🌋 DANGER: Volcanic heat! Move away!');
          }
        }
        if (lavaDist < LAVA_DAMAGE_RADIUS) {
          if (!window._lavaDamageTimer) window._lavaDamageTimer = 0;
          window._lavaDamageTimer += dt;
          if (window._lavaDamageTimer > LAVA_TICK_INTERVAL) {
            window._lavaDamageTimer = 0;
            player.takeDamage(LAVA_MAX_DAMAGE * (1 - lavaDist / LAVA_DAMAGE_RADIUS)); // More damage closer to center
            spawnParticles(player.mesh.position, 0xFF4500, 4);
            playSound('volcano');
          }
        }
        // Lava spout: occasional lava particles erupting from volcano top
        if (!window._lavaSpoutTimer) window._lavaSpoutTimer = 0;
        window._lavaSpoutTimer += dt;
        if (window._lavaSpoutTimer > (2 + Math.random() * 3)) { // Every 2-5 seconds
          window._lavaSpoutTimer = 0;
          for (let ls = 0; ls < 8; ls++) {
            _ensureSharedGeo();
            const lavaMatIdx = Math.random() < 0.5 ? 0 : 1;
            const lavaP = new THREE.Mesh(_sharedLavaGeo, _sharedLavaMats[lavaMatIdx]);
            lavaP.position.set(lavaX + (Math.random() - 0.5) * 2, 22, lavaZ + (Math.random() - 0.5) * 2);
            scene.add(lavaP);
            const vx = (Math.random() - 0.5) * 0.3, vz = (Math.random() - 0.5) * 0.3;
            let vy = 0.3 + Math.random() * 0.2, lpLife = 60;
            if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
              managedAnimations.push({ update(_dt2) {
                lpLife--;
                vy -= 0.012;
                lavaP.position.x += vx; lavaP.position.y += vy; lavaP.position.z += vz;
                if (lpLife <= 0) { scene.remove(lavaP); return false; }
                return true;
              }});
            } else { scene.remove(lavaP); }
          }
        }
      }

      // Cleanup and memory management (run every 3 seconds to avoid performance issues)
      enemies = enemies.filter(e => !e.isDead);
      
      // Update managed smoke particles (replaces individual RAF loops)
      smokeParticles = smokeParticles.filter(sp => {
        sp.life--;
        sp.mesh.position.x += sp.velocity.x;
        sp.mesh.position.y += sp.velocity.y;
        sp.mesh.position.z += sp.velocity.z;
        // Ground collision: keep smoke above ground to prevent visual artifacts
        if (sp.mesh.position.y < 0.1) {
          sp.mesh.position.y = 0.1;
          sp.velocity.y = Math.abs(sp.velocity.y) * 0.1; // Damp vertical velocity at ground
        }
        sp.mesh.scale.multiplyScalar(1.05);
        sp.material.opacity = (sp.life / sp.maxLife) * 0.5;
        if (sp.life <= 0) {
          scene.remove(sp.mesh);
          // Don't dispose shared smoke geometry
          sp.material.dispose();
          return false;
        }
        return true;
      });
      
      const now = Date.now();
      if (now - lastCleanupTime > 3000) { // Run cleanup every 3 seconds
        lastCleanupTime = now;

        // Scene children growth guard — warn and cull stale invisible meshes if count exceeds threshold
        const MAX_SCENE_CHILDREN = 1200;
        if (scene.children.length > MAX_SCENE_CHILDREN) {
          console.warn(`[Perf] scene.children=${scene.children.length} exceeds ${MAX_SCENE_CHILDREN}. Culling invisible non-tracked meshes.`);
          const toRemove = [];
          for (let i = scene.children.length - 1; i >= 0; i--) {
            const obj = scene.children[i];
            // Only cull plain Mesh objects that have no userData tracking and are fully transparent
            // Handle both single materials and material arrays
            const mat = obj.material;
            const isFullyTransparent = Array.isArray(mat)
              ? mat.every(m => m.transparent && m.opacity <= 0.01)
              : (mat && mat.transparent && mat.opacity <= 0.01);
            if (obj.isMesh && !obj.userData.tracked && isFullyTransparent) {
              toRemove.push(obj);
            }
          }
          toRemove.forEach(obj => {
            scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach(m => m.dispose());
            } else if (obj.material) {
              obj.material.dispose();
            }
          });
          if (toRemove.length) console.warn(`[Perf] Culled ${toRemove.length} stale transparent meshes.`);
        }

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
      
      // Fountain/lightning spawn sequence update
      if (window.SpawnSequence) window.SpawnSequence.update(dt);

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

      // Game logic completed without error — reset consecutive error counter
      performanceLog.gameLogicErrorCount = 0;

      } catch (gameLogicError) {
        // --- END GAME LOGIC try-catch ---
        // Log the error that would have frozen the screen (always-on, not gated by ?debug=1)
        performanceLog.gameLogicErrorCount++;
        if (!window._lastGameLogicError || (Date.now() - window._lastGameLogicError) > 2000) {
          console.error('[GameLoop] Game logic error caught — rendering continues (consecutive errors: ' + performanceLog.gameLogicErrorCount + '):', gameLogicError);
          window._lastGameLogicError = Date.now();
        }
        // Force-end stuck cinematics/killcams that may have caused the crash
        if (cinematicActive) {
          console.warn('[GameLoop] Force-ending cinematic after game logic error');
          cinematicActive = false;
          cinematicData = null;
        }
        if (killCamActive) {
          console.warn('[GameLoop] Force-ending killCam after game logic error');
          killCamActive = false;
        }
      }

      // Phase 3: Render loop protection - wrap in try-catch to prevent freeze
      // Frame Skip Mechanism: Skip rendering if frame budget exceeded
      // BUT: always render after game logic errors to prevent frozen-screen bug
      const renderStartTime = performance.now();
      
      if (!shouldSkipRender || performanceLog.gameLogicErrorCount > 0) {
        try {
          renderer.render(scene, camera);
          performanceLog.renderCount++;
          performanceLog.consecutiveSkipCount = 0; // Reset on successful render
        } catch (error) {
          console.error('Render error caught - game continues:', error);
          if (window.GameDebug) window.GameDebug.oshot('render_err', 'Render error: ' + error.message, error.stack);
          // Log error details but continue - the game loop will recover naturally
          // Active objects are already filtered above, so invalid objects are removed
        }
      } else {
        // Frame was skipped to maintain performance (already warned above with throttling)
      }
      
      const renderEndTime = performance.now();
      
      // Always-on freeze detection: log when game logic errors are accumulating
      if (window.GameDebug) {
        window.GameDebug.onRenderStatus(performanceLog.gameLogicErrorCount, cinematicActive, killCamActive, isPaused);
      }
      
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
        const runSec = Math.floor((Date.now() - gameStartTime) / 1000);
        console.log(`[Loop] t=${runSec}s L${playerStats.lvl} — Avg frame: ${avgFrameTime.toFixed(2)}ms, Slow: ${slowFramePercent}%, Enemies: ${aliveEnemies}, Renders: ${performanceLog.renderCount}, cinematic: ${cinematicActive}, paused: ${isPaused}`);
        
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
    try { init(); } catch(e) {
      console.error('[Game Error]', e);
      console.error('[Game] Initialization failed - game cannot start');
      window.gameModuleReady = true;
      window.gameInitError = e; // Store the error for display

      // Show error on screen so the user can report what went wrong
      var errorDiv = document.createElement('div');
      errorDiv.id = 'init-error-display';
      errorDiv.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:rgba(200,0,0,0.95);color:#fff;padding:10px;font-family:monospace;font-size:11px;z-index:99999;max-height:20vh;overflow-y:auto;border-top:3px solid #ff0;';
      // Build the error overlay content using DOM APIs to avoid injecting HTML
      var headerDiv = document.createElement('div');
      headerDiv.style.cssText = 'font-size:14px;font-weight:bold;color:#ff0;margin-bottom:4px;';
      headerDiv.textContent = '⚠️ GAME INIT ERROR — Tap to dismiss';
      var messageDiv = document.createElement('div');
      messageDiv.style.cssText = 'white-space:pre-wrap;word-break:break-all;max-height:12vh;overflow-y:auto;';
      messageDiv.textContent = (e && e.stack) ? String(e.stack) : String(e);
      errorDiv.appendChild(headerDiv);
      errorDiv.appendChild(messageDiv);
      errorDiv.onclick = function() { errorDiv.style.display = 'none'; };
      document.body.appendChild(errorDiv);
      // Auto-dismiss after 8 seconds so it doesn't permanently block buttons
      setTimeout(function() { if (errorDiv) errorDiv.style.display = 'none'; }, 8000);

      // Show main menu
      var mainMenu = document.getElementById('main-menu');
      if (mainMenu) mainMenu.style.display = 'flex';

      // Attach FALLBACK button handlers since setupMenus() never ran
      // These provide basic functionality even when init() failed
      _attachFallbackMenuHandlers();
    }

    // Fallback menu handlers — attached when init() fails
    // These try to re-init or at least give the user some options
    function _attachFallbackMenuHandlers() {
      var startBtn = document.getElementById('start-game-btn');
      var campBtn = document.getElementById('camp-btn');

      // Make buttons visible since the normal background image alignment may not work
      // when init fails (the buttons are normally transparent overlays on a background)
      var applyStyle = window._applyFallbackButtonStyles || function() {};
      [startBtn, campBtn].forEach(function(btn) { applyStyle(btn); });

      if (startBtn && !startBtn._hasFallback) {
        startBtn._hasFallback = true;
        startBtn.addEventListener('click', function() {
          // Try to re-initialize the game
          var errorDisplay = document.getElementById('init-error-display');
          if (errorDisplay) errorDisplay.style.display = 'none';

          try {
            init();
            // If init succeeds this time, hide menu and start
            var mainMenuEl = document.getElementById('main-menu');
            if (mainMenuEl) mainMenuEl.style.display = 'none';
            if (typeof resetGame === 'function') resetGame();
            if (typeof startCountdown === 'function') startCountdown();
          } catch(e2) {
            console.error('[Retry] Init failed again:', e2);
            // Show updated error
            var errDiv = document.getElementById('init-error-display');
            if (errDiv) {
              errDiv.style.display = 'block';
              var errContent = errDiv.querySelector('div:nth-child(2)');
              if (errContent) errContent.textContent = 'RETRY FAILED: ' + (e2 && e2.stack ? e2.stack : String(e2));
            } else {
              alert('Game failed to start: ' + String(e2));
            }
          }
        });
      }

      if (campBtn && !campBtn._hasFallback) {
        campBtn._hasFallback = true;
        campBtn.addEventListener('click', function() {
          // Try to show camp screen
          var campScreen = document.getElementById('camp-screen');
          if (campScreen) {
            var mainMenuEl = document.getElementById('main-menu');
            if (mainMenuEl) mainMenuEl.style.display = 'none';
            campScreen.style.display = 'flex';
            if (typeof updateCampScreen === 'function') {
              try { updateCampScreen(); } catch(e) { console.error('[Fallback] Camp error:', e); }
            }
          }
        });
      }
    }
