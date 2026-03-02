    // Standalone loading script - runs independently before module loads
    // Prevents race condition where buttons don't work because event listeners aren't attached yet
    
    (function() {
      // Initialize flags
      window.gameModuleReady = false;
      window.loadingComplete = false;
      
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLoading);
      } else {
        initLoading();
      }
      
      function initLoading() {
        const loadingScreen = document.getElementById('loading-screen');
        const loadingBar = document.getElementById('loading-bar');
        
        if (!loadingScreen || !loadingBar) {
          console.error('[Loading] Loading elements not found');
          return;
        }
        
        let progress = 0;
        let progressInterval;
        
        // Animate loading bar from 0% to 100% over ~8 seconds
        function updateProgress() {
          progress += 2.5; // 2.5% per step
          loadingBar.style.width = progress + '%';
          
          if (progress >= 100) {
            clearInterval(progressInterval);
            window.loadingComplete = true;
            
            // Wait for module to be ready before showing menu
            waitForModuleReady();
          }
        }
        
        // Start progress animation
        progressInterval = setInterval(updateProgress, 200); // 40 steps × 200ms = 8s
        
        // 15-second failsafe timeout - show menu anyway if module fails to load
        setTimeout(function() {
          if (!window.gameModuleReady) {
            console.warn('[Loading] Failsafe timeout - showing menu without module ready signal');
            clearInterval(progressInterval);
            window.loadingComplete = true;
            showMenuAfterLoading();
          }
        }, 15000);
      }
      
      // Wait for module to signal ready, then show menu
      function waitForModuleReady() {
        let attempts = 0;
        const maxAttempts = 50; // 50 × 100ms = 5s max wait
        
        const checkInterval = setInterval(function() {
          attempts++;
          
          if (window.gameModuleReady) {
            // Module is ready!
            clearInterval(checkInterval);
            showMenuAfterLoading();
          } else if (attempts >= maxAttempts) {
            // Timeout - show anyway
            console.warn('[Loading] Module ready timeout - showing menu anyway');
            clearInterval(checkInterval);
            showMenuAfterLoading();
          }
        }, 100);
      }
      
      function showMenuAfterLoading() {
        const loadingScreen = document.getElementById('loading-screen');
        if (!loadingScreen) return;

        // Log the state for debugging
        const initOk = window.gameModuleReady && !window.gameInitError;
        console.log('[Loading] Showing menu — gameModuleReady:', window.gameModuleReady, 'initError:', !!window.gameInitError);

        // Fade out loading screen
        loadingScreen.classList.add('fade-out');

        setTimeout(function() {
          loadingScreen.style.display = 'none';

          // Always show main menu after loading — camp is reached via menu buttons
          var mainMenu = document.getElementById('main-menu');
          if (mainMenu) mainMenu.style.display = 'flex';

          // If init failed, make buttons visible (they are normally transparent overlays
          // on a background image) so users can actually find and click them
          if (!initOk) {
            var buttons = mainMenu ? mainMenu.querySelectorAll('.menu-btn') : [];
            for (var i = 0; i < buttons.length; i++) {
              buttons[i].style.background = 'linear-gradient(to bottom, #2980B9, #1A5276)';
              buttons[i].style.color = '#FFFFFF';
              buttons[i].style.border = '3px solid #5DADE2';
              buttons[i].style.textShadow = '0 0 8px rgba(93,173,226,0.8)';
              buttons[i].style.fontSize = '20px';
              buttons[i].style.fontWeight = 'bold';
              buttons[i].style.borderRadius = '12px';
            }

            var statusDiv = document.createElement('div');
            statusDiv.style.cssText = 'color:#ff6666;font-size:12px;text-align:center;margin-top:8px;font-family:monospace;position:absolute;bottom:10%;left:0;right:0;';
            statusDiv.textContent = '⚠️ Game engine failed to load — tap buttons to retry';
            var menuButtons = mainMenu ? mainMenu.querySelector('.menu-buttons') : null;
            if (menuButtons) menuButtons.appendChild(statusDiv);
          }
        }, 500);
      }
    })();
