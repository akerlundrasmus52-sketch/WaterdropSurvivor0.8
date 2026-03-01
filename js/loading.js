    // Standalone loading script - runs independently before module loads
    // Prevents race condition where buttons don't work because event listeners aren't attached yet
    
    (function() {
      // Initialize flags
      window.gameModuleReady = false;
      window.loadingComplete = false;
      let menuShown = false;
      let moduleErrorDetected = false;

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

        // Detect ES module load errors as early as possible
        var mainScript = document.querySelector('script[src*="main.js"]');
        if (mainScript) {
          mainScript.addEventListener('error', function() {
            console.error('[Loading] main.js module failed to load');
            moduleErrorDetected = true;
            showLoadingError();
          });
        }

        setStatus('Loading game engine...');
        setProgress(5);

        // Phase 1 (0–30%): animate bar to 30% while waiting for THREE.js
        var phase1Interval = setInterval(function() {
          var cur = getProgress();
          if (cur < 30) {
            setProgress(cur + 2);
          } else {
            clearInterval(phase1Interval);
          }
        }, 200);

        // Phase 2 (30–70%): wait for window.THREE or helper scripts (ES module path)
        waitForCondition(
          function() { return !!window.THREE || !!window.GameWorld || !!window.GameRenderer; },
          function() {
            clearInterval(phase1Interval);
            // If THREE was loaded via ES module but not exposed on window,
            // the game scripts (world.js etc) loaded successfully so we proceed
            if (!window.THREE && window.GameWorld) {
              console.log('[Loading] THREE loaded via ES module - game scripts ready');
            }
            setProgress(30);
            setStatus('Loading game assets...');
            animateTo(70, 4000, function() {
              // Phase 3 (70–90%): wait for gameModuleReady or equivalent signals
              setStatus('Starting...');
              waitForCondition(
                function() { return !!window.gameModuleReady || !!window.setGamePaused || !!window.updateCampScreen; },
                function() {
                  setProgress(90);
                  animateTo(100, 800, function() {
                    window.loadingComplete = true;
                    showMenuAfterLoading();
                  });
                },
                6000,  // 6 seconds for gameModuleReady once THREE is available
                function() {
                  console.warn('[Loading] gameModuleReady timeout after THREE loaded');
                  window.loadingComplete = true;
                  setProgress(100);
                  showMenuAfterLoading();
                }

              );
            });
          },
          8000,  // 8 seconds to wait for THREE.js
          function() {
            clearInterval(phase1Interval);
            console.warn('[Loading] THREE.js load timeout');
            // THREE didn't load — module chain failed
            showLoadingError();
          }
        );

        // 15-second hard failsafe
        setTimeout(function() {
          if (!menuShown) {
            console.warn('[Loading] 15s hard failsafe - module not ready');
            window.loadingComplete = true;
            if (window.gameModuleReady || window.setGamePaused || window.updateCampScreen) {
              setProgress(100);
              showMenuAfterLoading();
            } else {
              showLoadingError();
            }
          }
        }, 15000);
      }

      // ── helpers ────────────────────────────────────────────

      var _currentProgress = 0;

      function getProgress() {
        return _currentProgress;
      }

      function setProgress(pct) {
        _currentProgress = pct;
        var bar = document.getElementById('loading-bar');
        if (bar) bar.style.width = pct + '%';
      }

      function setStatus(text) {
        var el = document.getElementById('loading-status');
        if (el) el.textContent = text;
      }

      function animateTo(target, durationMs, cb) {
        var start = _currentProgress;
        var steps = Math.max(1, Math.round(durationMs / 50));
        var inc = (target - start) / steps;
        var step = 0;
        var iv = setInterval(function() {
          step++;
          setProgress(Math.min(target, start + inc * step));
          if (step >= steps) {
            clearInterval(iv);
            setProgress(target);
            if (cb) cb();
          }
        }, 50);
      }

      function waitForCondition(condition, onReady, timeoutMs, onTimeout) {
        var elapsed = 0;
        var interval = 100;
        var iv = setInterval(function() {
          if (condition()) {
            clearInterval(iv);
            onReady();
          } else {
            elapsed += interval;
            if (elapsed >= timeoutMs) {
              clearInterval(iv);
              onTimeout();
            }
          }
        }, interval);
      }

      function _displayErrorOverlay() {
        var errEl = document.getElementById('loading-error');
        var barContainer = document.querySelector('.loading-bar-container');
        var statusEl = document.getElementById('loading-status');
        if (barContainer) barContainer.style.display = 'none';
        if (statusEl) statusEl.style.display = 'none';
        if (errEl) errEl.style.display = 'block';
      }

      function _restoreLoadingScreenAndShowError() {
        var ls = document.getElementById('loading-screen');
        if (ls) {
          ls.style.display = 'block';
          ls.classList.remove('fade-out');
        }
        _displayErrorOverlay();
      }

      function showLoadingError() {
        if (menuShown) return;
        menuShown = true;
        _displayErrorOverlay();
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

          if (!(window.gameModuleReady || window.setGamePaused || window.updateCampScreen)) {
            // Module never loaded — show error overlay on loading screen
            _restoreLoadingScreenAndShowError();
            return;
          }
          
          if (!window.CampWorld || !window.gameRenderer || !window.updateCampScreen) {
            console.warn('[Loading] showMenuAfterLoading: missing components —',
              'CampWorld:', !!window.CampWorld,
              'gameRenderer:', !!window.gameRenderer,
              'updateCampScreen:', !!window.updateCampScreen);
          }
          var campScreen = document.getElementById('camp-screen');
          var moduleLoaded = window.gameModuleReady || window.setGamePaused || window.updateCampScreen;

          if (window.CampWorld && window.gameRenderer && window.updateCampScreen) {
            // 3D camp mode: camp-screen becomes a transparent HUD overlay over the canvas
            if (campScreen) {
              campScreen.classList.remove('camp-subsection-active');
              campScreen.style.display = 'flex';
            }
            window.updateCampScreen();
          } else if (moduleLoaded && campScreen && window.updateCampScreen) {
            // Module loaded but camp world components not yet available — show 2D camp screen
            campScreen.classList.remove('camp-subsection-active');
            campScreen.style.display = 'flex';
            window.updateCampScreen();
          } else if (moduleLoaded) {
            // Module loaded but camp world unavailable — show main menu with real handlers
            var mainMenu = document.getElementById('main-menu');
            if (mainMenu) mainMenu.style.display = 'flex';
          } else {
            // Module not ready — show error
            _restoreLoadingScreenAndShowError();
            return;
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
    })();
