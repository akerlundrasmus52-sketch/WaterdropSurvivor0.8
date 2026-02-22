// js/modules/input.js
// Touch joystick, keyboard, gamepad controls
    import { gs, gameSettings, playerStats, joystickLeft, joystickRight } from './state.js';
    import { JOYSTICK_UPDATE_INTERVAL } from './constants.js';
    import { startDash } from './camp.js';

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
            gs.swipeStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
            
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
            if (gs.swipeStart && !swipeDetected && !gs.player.isDashing) {
              const swipeDist = Math.sqrt(dx*dx + dy*dy);
              const swipeTime = Date.now() - gs.swipeStart.time;
              
              if (swipeTime < 250 && swipeDist > 60) {
                // Dash only available after unlocking in skill tree
                if (!gs.saveData.tutorial || !gs.saveData.tutorial.dashUnlocked) {
                  showStatChange('🔒 Unlock Dash in the Skill Tree!');
                  gs.swipeStart = null;
                } else {
                  swipeDetected = true;
                  const dist = Math.sqrt(dx*dx + dy*dy);
                  gs.player.dash(dx / dist, dy / dist);
                  playerStats.dashesPerformed++;
                  gs.swipeStart = null;
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
              if (now - gs.lastJoystickLeftUpdate >= JOYSTICK_UPDATE_INTERVAL) {
                gs.lastJoystickLeftUpdate = now;
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
              if (now - gs.lastJoystickRightUpdate >= JOYSTICK_UPDATE_INTERVAL) {
                gs.lastJoystickRightUpdate = now;
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
            gs.swipeStart = null;
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
        if (dt < 400 && dist > 40 && swipeDetected && gs.saveData.tutorial && gs.saveData.tutorial.dashUnlocked) {
           gs.player.dash(dx/dist, dy/dist);
        }
      }, { passive: false });
      
      // Keyboard Controls (WASD for movement, mouse for aiming) - only register once
      if (!gameSettings.inputListenersRegistered) {
        const keysPressed = {};
        gameSettings.keysPressed = keysPressed;
        window._keysPressed = keysPressed; // Expose for startDash()
        
        window.addEventListener('keydown', (e) => {
          if (!gs.isGameActive || gs.isPaused || gs.isGameOver) return;
          if (gameSettings.controlType !== 'keyboard') return;
          keysPressed[e.key.toLowerCase()] = true;
          
          // Space bar for dash (only if unlocked in skill tree)
          if (e.key === ' ' && !gs.player.isDashing && gs.saveData.tutorial && gs.saveData.tutorial.dashUnlocked && (keysPressed['w'] || keysPressed['a'] || keysPressed['s'] || keysPressed['d'])) {
            let dx = 0, dy = 0;
            if (keysPressed['w']) dy = -1;
            if (keysPressed['s']) dy = 1;
            if (keysPressed['a']) dx = -1;
            if (keysPressed['d']) dx = 1;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist > 0) {
              // Delegate dash logic to the common gs.player.dash() method
              const dashDx = dx / dist;
              const dashDz = dy / dist;
              gs.player.dash(dashDx, dashDz);
            }
          }
          // Space bar for dash via new isDashUnlocked() system
          if (e.code === 'Space' && isDashUnlocked() && !gs.isDashing && gs.dashCooldownRemaining <= 0) {
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
      
      // Landscape gs.camera zoom - 50% closer in landscape mode
      const isPortrait = window.innerHeight > window.innerWidth;
      gameSettings.isPortrait = isPortrait;
      
      if (!isPortrait) {
        d *= 0.5; // Zoom in 50% for landscape
      }
      
      gs.camera.left = -d * aspect;
      gs.camera.right = d * aspect;
      gs.camera.top = d;
      gs.camera.bottom = -d;
      gs.camera.updateProjectionMatrix();
      gs.renderer.setSize(window.innerWidth, window.innerHeight);
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

    export { setupInputs, updateControlType };
