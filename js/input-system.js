// js/input-system.js — Touch/mouse/keyboard/joystick input handling,
// window resize, control type detection.
// Depends on: all previously loaded game files

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
      
      // Helper: returns true if the element at (x,y) belongs to a HUD button, menu panel,
      // or any interactive UI element that should receive taps directly (not joystick).
      function _isHudElement(x, y) {
        const el = document.elementFromPoint(x, y);
        return el && (
          el.closest('#special-attacks-hud') ||
          el.closest('#rage-hud') ||
          el.closest('#melee-takedown-btn') ||
          el.closest('#camp-screen') ||
          el.closest('#main-menu') ||
          el.closest('#gameover-screen') ||
          el.closest('#options-menu') ||
          el.closest('#settings-modal') ||
          el.closest('#levelup-modal') ||
          el.closest('#story-quest-modal') ||
          el.closest('#comic-tutorial-modal') ||
          el.closest('[class*="overlay"]') ||
          (el.tagName === 'BUTTON') ||
          (el.tagName === 'A') ||
          (el.tagName === 'INPUT') ||
          (el.tagName === 'SELECT')
        );
      }

      zone.addEventListener('touchstart', (e) => {
        // Completely disable joystick when not in active gameplay
        // (camp world, menus, buildings, any non-playing state)
        if ((window.CampWorld && window.CampWorld.isActive) || !window.isGameActive) {
          return; // Let touch events pass through to UI elements
        }

        // Check if any touch targets a HUD button (special attacks, rage, melee).
        // If so, skip joystick handling for that touch so button events fire normally.
        let allHudTouches = true;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (_isHudElement(t.clientX, t.clientY)) {
            // Touch is on a HUD button — fire it and skip joystick logic
            const el = document.elementFromPoint(t.clientX, t.clientY);
            const btn = el && el.closest('button');
            if (btn && !btn.disabled) btn.click();
          } else {
            allHudTouches = false;
          }
        }
        if (allHudTouches) return; // All touches were on HUD — don't process as joystick

        e.preventDefault();
        
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          const screenWidth = window.innerWidth;
          const screenHeight = window.innerHeight;

          // Skip touches on HUD elements
          if (_isHudElement(touch.clientX, touch.clientY)) continue;
          
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

            // Hide chat tab while joystick is active
            hideChatTabForJoystick();
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
        // Skip joystick processing when not in active gameplay
        if ((window.CampWorld && window.CampWorld.isActive) || !window.isGameActive) {
          return;
        }
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
        // Always allow touchend to clean up joystick state — even if game state
        // changed mid-touch (e.g. game over, entered camp).  Preventing cleanup
        // here is the root cause of the "stuck joystick" bug after camp visits.
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

            // Reshow chat tab after short idle timeout
            showChatTabAfterIdle();
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
          // ESC key: dismiss level-up modal and force unpause (works even when isPaused)
          if (e.key === 'Escape' && isGameActive && !isGameOver) {
            const levelupModal = document.getElementById('levelup-modal');
            if (levelupModal && levelupModal.style.display === 'flex') {
              levelupModal.style.display = 'none';
              if (window.forceGameUnpause) window.forceGameUnpause();
              return;
            }
          }
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
      // Use the same base distance as init() to prevent zoom-out on any resize event
      let d = RENDERER_CONFIG.cameraDistance;
      
      // Landscape camera zoom - 50% closer in landscape mode
      const isPortrait = window.innerHeight > window.innerWidth;
      gameSettings.isPortrait = isPortrait;
      
      // Landscape camera zoom — zoom out slightly for wider view
      if (!isPortrait) {
        d *= 1.25; // Zoom out 25% for landscape: balanced view
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
      
      // Sync pointer-events based on current game state
      if (typeof window._syncJoystickZone === 'function') window._syncJoystickZone();
    }

