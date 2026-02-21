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
        
        // Animate loading bar from 0% to 100% over ~5 seconds (reduced from 8s)
        function updateProgress() {
          progress += 5; // 5% per step
          loadingBar.style.width = progress + '%';
          
          if (progress >= 100) {
            clearInterval(progressInterval);
            window.loadingComplete = true;
            
            // Wait for module to be ready before showing menu
            waitForModuleReady();
          }
        }
        
        // Start progress animation
        progressInterval = setInterval(updateProgress, 250); // 20 steps × 250ms = 5s
        
        // 12-second failsafe timeout - show menu anyway if module fails to load
        setTimeout(function() {
          if (!window.gameModuleReady) {
            console.warn('[Loading] Failsafe timeout - showing menu without module ready signal');
            clearInterval(progressInterval);
            window.loadingComplete = true;
            showMenuAfterLoading();
          }
        }, 12000);
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
        
        // Fade out loading screen
        loadingScreen.classList.add('fade-out');
        
        setTimeout(function() {
          loadingScreen.style.display = 'none';
          
          // Show main menu (module script will handle button event listeners)
          const mainMenu = document.getElementById('main-menu');
          if (mainMenu) {
            mainMenu.style.display = 'flex';
          }
          
          // FRESH IMPLEMENTATION: Show Story Quest Modal on first load
          setTimeout(function() {
            // Access saveData through window if available (will be set by game module)
            if (window.saveData && !window.saveData.storyQuests.welcomeShown) {
              const storyModal = document.getElementById('story-quest-modal');
              if (storyModal) {
                storyModal.style.display = 'flex';
              }
            }
          }, 500);
        }, 500);
      }
    })();
