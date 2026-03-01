    // Standalone loading script - runs independently before module loads
    // Prevents race condition where buttons don't work because event listeners aren't attached yet
    
    (function() {
      // Initialize flags
      window.gameModuleReady = false;
      window.loadingComplete = false;
      let menuShown = false;
      
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
          if (!window.gameModuleReady && !menuShown) {
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
            if (!menuShown) showMenuAfterLoading();
          }
        }, 100);
      }
      
      function showMenuAfterLoading() {
        if (menuShown) return;
        menuShown = true;
        const loadingScreen = document.getElementById('loading-screen');
        if (!loadingScreen) return;
        
        // Fade out loading screen
        loadingScreen.classList.add('fade-out');
        
        setTimeout(function() {
          loadingScreen.style.display = 'none';
          
          // Route to 3D Camp World as the default screen (instead of old 2D main menu).
          // Prefer 3D camp if CampWorld, THREE and the renderer are all available.
          // Falls back to 2D camp-screen (via updateCampScreen) or main menu.
          if (!window.CampWorld || !window.THREE || !window.gameRenderer || !window.updateCampScreen) {
            console.warn('[Loading] showMenuAfterLoading: missing components —',
              'CampWorld:', !!window.CampWorld,
              'THREE:', !!window.THREE,
              'gameRenderer:', !!window.gameRenderer,
              'updateCampScreen:', !!window.updateCampScreen);
          }
          var campScreen = document.getElementById('camp-screen');
          if (window.CampWorld && window.THREE && window.gameRenderer && window.updateCampScreen) {
            // 3D camp mode: camp-screen becomes a transparent HUD overlay over the canvas
            if (campScreen) {
              campScreen.classList.remove('camp-subsection-active');
              campScreen.style.display = 'flex';
            }
            window.updateCampScreen();
          } else if (campScreen && window.updateCampScreen) {
            // 2D camp or deferred 3D activation via updateCampScreen
            campScreen.classList.remove('camp-subsection-active');
            campScreen.style.display = 'flex';
            window.updateCampScreen();
          } else {
            // Fallback: show main menu if camp world is not ready yet
            var mainMenu = document.getElementById('main-menu');
            if (mainMenu) mainMenu.style.display = 'flex';
            // Attach emergency fallback handlers so the menu is usable even if the
            // main.js module failed to load (e.g. CDN offline).
            _attachFallbackMenuHandlers();
          }
          
          // FRESH IMPLEMENTATION: Show Story Quest Modal on first load
          setTimeout(function() {
            // Access saveData through window if available (will be set by game module)
            if (window.saveData && !window.saveData.storyQuests.welcomeShown) {
              var storyModal = document.getElementById('story-quest-modal');
              if (storyModal) {
                storyModal.style.display = 'flex';
              }
            }
          }, 500);
        }, 500);
      }

      // Emergency fallback: wire up main-menu buttons if main.js module didn't load.
      // These handlers do nothing if the module already attached its own listeners.
      function _attachFallbackMenuHandlers() {
        var startBtn = document.getElementById('start-game-btn');
        var campBtn  = document.getElementById('camp-btn');
        if (startBtn && !startBtn._fallbackAttached) {
          startBtn._fallbackAttached = true;
          startBtn.addEventListener('click', function() {
            if (window.gameModuleReady) return; // module handler takes over
            startBtn.textContent = 'Loading\u2026 (check network)';
            console.warn('[Loading] start-game-btn clicked but module not ready');
          });
        }
        if (campBtn && !campBtn._fallbackAttached) {
          campBtn._fallbackAttached = true;
          campBtn.addEventListener('click', function() {
            if (window.gameModuleReady) return; // module handler takes over
            var cs = document.getElementById('camp-screen');
            var mm = document.getElementById('main-menu');
            // Try 3D camp world first; fall back to 2D camp-screen
            if (window.CampWorld && window.THREE && window.gameRenderer) {
              if (mm) mm.style.display = 'none';
              if (cs) { cs.classList.remove('camp-subsection-active'); cs.style.display = 'flex'; }
              try { window.CampWorld.enter(window.gameRenderer, window.saveData || {}, {}); } catch(e) {}
              console.warn('[Loading] camp-btn fallback: entering 3D camp world');
            } else {
              if (cs) { cs.style.display = 'flex'; }
              if (mm) { mm.style.display = 'none'; }
              console.warn('[Loading] camp-btn fallback: showing camp-screen (2D mode)');
            }
          });
        }
      }
    })();
