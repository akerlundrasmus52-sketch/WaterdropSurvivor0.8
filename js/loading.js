// Standalone loading script - simple polling approach
// Waits for main.js ES module to finish loading, shows progress animation

(function() {
  window.gameModuleReady = false;
  window.loadingComplete = false;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoading);
  } else {
    initLoading();
  }

  function initLoading() {
    var loadingScreen = document.getElementById('loading-screen');
    var loadingBar = document.getElementById('loading-bar');
    if (!loadingScreen || !loadingBar) return;

    var menuShown = false;
    var scriptFailed = false;

    // Detect if main.js script tag fires an error (CDN down, 404, etc.)
    var mainScript = document.querySelector('script[src*="main.js"]');
    if (mainScript) {
      mainScript.addEventListener('error', function() {
        console.error('[Loading] main.js failed to load from CDN');
        scriptFailed = true;
      });
    }

    setStatus('Loading game engine...');
    setProgress(5);

    // Simple progress animation: slowly fill bar to 90% over time
    var progressTarget = 90;
    var progressTimer = setInterval(function() {
      var cur = getProgress();
      if (cur < progressTarget) {
        // Slow down as we approach target (ease-out feel)
        var remaining = progressTarget - cur;
        var increment = Math.max(0.3, remaining * 0.03);
        setProgress(Math.min(progressTarget, cur + increment));
      }
    }, 200);

    // Update status text based on what's loaded
    var statusTimer = setInterval(function() {
      if (window.GameWorld || window.GameRenderer) {
        setStatus('Loading game assets...');
      }
      if (window.CampWorld) {
        setStatus('Starting game...');
      }
    }, 500);

    function isMainReady() {
      return !!(window.gameModuleReady || window.setGamePaused || window.updateCampScreen || window.saveSaveData);
    }

    // Main polling loop: check if main.js has finished every 500ms
    var pollTimer = setInterval(function() {
      if (isMainReady() && !menuShown) {
        // main.js is done! Complete the loading bar and show menu
        clearTimers();
        menuShown = true;
        setProgress(100);
        setStatus('Ready!');
        window.loadingComplete = true;
        
        setTimeout(function() {
          showGame(loadingScreen);
        }, 300);
      }

      if (scriptFailed && !menuShown) {
        clearTimers();
        menuShown = true;
        showError();
      }
    }, 500);

    // 60-second hard failsafe (generous for slow connections)
    var failsafeTimer = setTimeout(function() {
      if (!menuShown) {
        console.warn('[Loading] 60s failsafe triggered');
        clearTimers();
        menuShown = true;
        
        // One last check — maybe it loaded at the last second
        if (isMainReady()) {
          setProgress(100);
          window.loadingComplete = true;
          showGame(loadingScreen);
        } else {
          showError();
        }
      }
    }, 60000);

    function clearTimers() {
      clearInterval(progressTimer);
      clearInterval(statusTimer);
      clearInterval(pollTimer);
      clearTimeout(failsafeTimer);
    }

    function showGame(ls) {
      ls.classList.add('fade-out');
      setTimeout(function() {
        ls.style.display = 'none';

        var campScreen = document.getElementById('camp-screen');

        function safeUpdateCampScreen() {
          try { window.updateCampScreen(); } catch(e) { console.error('[Loading] updateCampScreen error:', e); }
        }

        if (window.CampWorld && window.gameRenderer && window.updateCampScreen) {
          // 3D camp mode
          if (campScreen) {
            campScreen.classList.remove('camp-subsection-active');
            campScreen.style.display = 'flex';
          }
          safeUpdateCampScreen();
        } else if (window.updateCampScreen && campScreen) {
          // 2D camp fallback
          campScreen.classList.remove('camp-subsection-active');
          campScreen.style.display = 'flex';
          safeUpdateCampScreen();
        } else {
          // Fallback: show main menu
          var mainMenu = document.getElementById('main-menu');
          if (mainMenu) mainMenu.style.display = 'flex';
        }

        // Show Story Quest Modal on first load
        setTimeout(function() {
          try {
            if (window.saveData && !window.saveData.storyQuests.welcomeShown) {
              var storyModal = document.getElementById('story-quest-modal');
              if (storyModal) storyModal.style.display = 'flex';
            }
          } catch(e) {}
        }, 500);
      }, 500);
    }

    function showError() {
      var errEl = document.getElementById('loading-error');
      var barContainer = document.querySelector('.loading-bar-container');
      var statusEl = document.getElementById('loading-status');
      if (barContainer) barContainer.style.display = 'none';
      if (statusEl) statusEl.style.display = 'none';
      if (errEl) errEl.style.display = 'block';
    }
  }

  // ── Progress bar helpers ──────────────────────────

  var _progress = 0;

  function getProgress() { return _progress; }

  function setProgress(pct) {
    _progress = pct;
    var bar = document.getElementById('loading-bar');
    if (bar) bar.style.width = pct + '%';
  }

  function setStatus(text) {
    var el = document.getElementById('loading-status');
    if (el) el.textContent = text;
  }
})();
