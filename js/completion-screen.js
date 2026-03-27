// js/completion-screen.js — Questline Completion Screen
// Shown after defeating both Annunaki and Aida bosses
// Offers transition to Endless Mode or return to camp

(function(global) {
'use strict';

// ════════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════════
var _active = false;
var _overlay = null;

// ════════════════════════════════════════════════════════════
//  COMPLETION SCREEN OBJECT
// ════════════════════════════════════════════════════════════
var CompletionScreen = {
  /**
   * show() - Display the completion screen with particle burst
   */
  show: function() {
    if (_active) return;
    _active = true;

    console.log('[CompletionScreen] Showing questline completion screen');

    _createOverlay();
    _spawnParticleBurst();
    _showRewards();

    // Complete quest
    if (typeof QuestSystem !== 'undefined' && QuestSystem.completeObjective) {
      QuestSystem.completeObjective('quest_questlineComplete');
    }

    // Mark questline as complete in save data
    if (typeof saveData !== 'undefined') {
      saveData.questlineComplete = true;
      saveData.endlessModeUnlocked = true;
      if (typeof saveSaveData === 'function') {
        saveSaveData();
      }
    }
  },

  /**
   * hide() - Remove completion screen
   */
  hide: function() {
    if (!_active) return;
    _active = false;

    if (_overlay && _overlay.parentNode) {
      _overlay.style.opacity = '0';
      setTimeout(function() {
        if (_overlay && _overlay.parentNode) {
          _overlay.parentNode.removeChild(_overlay);
        }
        _overlay = null;
      }, 500);
    }
  },

  /**
   * isActive() - Check if completion screen is showing
   */
  isActive: function() {
    return _active;
  }
};

// ════════════════════════════════════════════════════════════
//  DOM CREATION
// ════════════════════════════════════════════════════════════
function _createOverlay() {
  _overlay = document.createElement('div');
  _overlay.id = 'completion-screen-overlay';
  _overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'background:radial-gradient(circle,rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.98) 100%);' +
    'z-index:10000;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;opacity:0;transition:opacity 0.5s;pointer-events:auto;';

  // Main title
  var title = document.createElement('div');
  title.style.cssText = 'font-size:clamp(48px,10vw,96px);font-weight:bold;' +
    'color:#ffd700;text-shadow:0 0 30px #ffd700,0 0 60px #ff8c00;' +
    'margin-bottom:30px;animation:completion-title-pulse 2s infinite;' +
    'font-family:"Bangers",cursive;letter-spacing:8px;text-align:center;';
  title.textContent = 'ANNUNAKI — PART 1';
  _overlay.appendChild(title);

  // Subtitle
  var subtitle = document.createElement('div');
  subtitle.style.cssText = 'font-size:clamp(24px,4vw,36px);color:#ffffff;' +
    'text-shadow:0 0 10px rgba(255,255,255,0.8);margin-bottom:50px;' +
    'font-style:italic;animation:completion-subtitle-fade 3s infinite;text-align:center;';
  subtitle.textContent = 'To be continued...';
  _overlay.appendChild(subtitle);

  // Rewards section
  var rewardsContainer = document.createElement('div');
  rewardsContainer.id = 'completion-rewards';
  rewardsContainer.style.cssText = 'margin:40px 0;display:flex;flex-direction:column;' +
    'align-items:center;gap:15px;';
  _overlay.appendChild(rewardsContainer);

  // Button container
  var btnContainer = document.createElement('div');
  btnContainer.style.cssText = 'display:flex;gap:30px;margin-top:50px;flex-wrap:wrap;' +
    'justify-content:center;padding:0 20px;';

  // Endless Mode button
  var endlessBtn = document.createElement('button');
  endlessBtn.id = 'completion-endless-btn';
  endlessBtn.textContent = '🔥 ENTER ENDLESS MODE 🔥';
  endlessBtn.style.cssText = 'padding:20px 40px;font-size:clamp(18px,3vw,24px);' +
    'background:linear-gradient(135deg,#ff0000,#ff8c00);color:#fff;border:3px solid #ffd700;' +
    'border-radius:10px;cursor:pointer;font-weight:bold;text-shadow:2px 2px 4px #000;' +
    'box-shadow:0 0 20px rgba(255,215,0,0.6),inset 0 0 20px rgba(255,255,255,0.2);' +
    'transition:all 0.3s;font-family:"Bangers",cursive;letter-spacing:2px;';
  endlessBtn.onmouseover = function() {
    this.style.transform = 'scale(1.1)';
    this.style.boxShadow = '0 0 40px rgba(255,215,0,1),inset 0 0 30px rgba(255,255,255,0.3)';
  };
  endlessBtn.onmouseout = function() {
    this.style.transform = 'scale(1)';
    this.style.boxShadow = '0 0 20px rgba(255,215,0,0.6),inset 0 0 20px rgba(255,255,255,0.2)';
  };
  endlessBtn.onclick = function() {
    _startEndlessMode();
  };
  btnContainer.appendChild(endlessBtn);

  // Return to Camp button
  var campBtn = document.createElement('button');
  campBtn.id = 'completion-camp-btn';
  campBtn.textContent = '🏕️ RETURN TO CAMP';
  campBtn.style.cssText = 'padding:20px 40px;font-size:clamp(18px,3vw,24px);' +
    'background:linear-gradient(135deg,#4a4a4a,#2a2a2a);color:#fff;border:3px solid #888;' +
    'border-radius:10px;cursor:pointer;font-weight:bold;text-shadow:2px 2px 4px #000;' +
    'box-shadow:0 0 15px rgba(136,136,136,0.4),inset 0 0 15px rgba(255,255,255,0.1);' +
    'transition:all 0.3s;font-family:"Bangers",cursive;letter-spacing:2px;';
  campBtn.onmouseover = function() {
    this.style.transform = 'scale(1.1)';
    this.style.boxShadow = '0 0 30px rgba(136,136,136,0.8),inset 0 0 25px rgba(255,255,255,0.2)';
  };
  campBtn.onmouseout = function() {
    this.style.transform = 'scale(1)';
    this.style.boxShadow = '0 0 15px rgba(136,136,136,0.4),inset 0 0 15px rgba(255,255,255,0.1)';
  };
  campBtn.onclick = function() {
    _returnToCamp();
  };
  btnContainer.appendChild(campBtn);

  _overlay.appendChild(btnContainer);

  document.body.appendChild(_overlay);

  // Fade in
  setTimeout(function() {
    if (_overlay) _overlay.style.opacity = '1';
  }, 100);
}

function _showRewards() {
  var container = document.getElementById('completion-rewards');
  if (!container) return;

  var rewards = [
    { icon: '💎', text: '+5000 Gems', value: 5000 },
    { icon: '⭐', text: '+500 XP', value: 500 },
    { icon: '🏆', text: 'Questline Champion Title', value: null },
    { icon: '🔓', text: 'Endless Mode Unlocked', value: null }
  ];

  rewards.forEach(function(reward, index) {
    setTimeout(function() {
      var rewardEl = document.createElement('div');
      rewardEl.style.cssText = 'font-size:clamp(18px,3vw,28px);color:#ffd700;' +
        'text-shadow:0 0 10px #ffd700;animation:completion-reward-appear 0.5s;' +
        'font-weight:bold;text-align:center;';
      rewardEl.textContent = reward.icon + ' ' + reward.text;
      container.appendChild(rewardEl);

      // Apply rewards
      if (reward.value !== null && typeof saveData !== 'undefined') {
        if (reward.icon === '💎' && typeof addGems === 'function') {
          addGems(reward.value);
        } else if (reward.icon === '⭐') {
          // Add XP (if XP system exists)
          if (saveData.experience !== undefined) {
            saveData.experience += reward.value;
            if (typeof saveSaveData === 'function') saveSaveData();
          }
        }
      }
    }, index * 300);
  });
}

// ════════════════════════════════════════════════════════════
//  PARTICLE BURST EFFECT
// ════════════════════════════════════════════════════════════
function _spawnParticleBurst() {
  var particleCount = 100;
  var centerX = window.innerWidth / 2;
  var centerY = window.innerHeight / 2;

  for (var i = 0; i < particleCount; i++) {
    setTimeout(function(index) {
      var particle = document.createElement('div');
      particle.className = 'completion-particle';
      particle.style.cssText = 'position:fixed;width:8px;height:8px;border-radius:50%;' +
        'background:#ffd700;box-shadow:0 0 10px #ffd700;pointer-events:none;z-index:10001;';

      var angle = (Math.PI * 2 * index) / particleCount;
      var distance = 50 + Math.random() * 400;

      particle.style.left = centerX + 'px';
      particle.style.top = centerY + 'px';

      document.body.appendChild(particle);

      // Animate outward
      var duration = 1000 + Math.random() * 1000;
      var startTime = performance.now();

      function animateParticle(now) {
        var elapsed = now - startTime;
        var progress = Math.min(elapsed / duration, 1);

        var currentDist = distance * progress;
        var x = centerX + Math.cos(angle) * currentDist;
        var y = centerY + Math.sin(angle) * currentDist;
        var opacity = 1 - progress;

        particle.style.left = x + 'px';
        particle.style.top = y + 'px';
        particle.style.opacity = opacity;

        if (progress < 1) {
          requestAnimationFrame(animateParticle);
        } else {
          if (particle.parentNode) particle.parentNode.removeChild(particle);
        }
      }

      requestAnimationFrame(animateParticle);
    }, i * 10, i);
  }
}

// ════════════════════════════════════════════════════════════
//  BUTTON ACTIONS
// ════════════════════════════════════════════════════════════
function _startEndlessMode() {
  console.log('[CompletionScreen] Starting Endless Mode');

  CompletionScreen.hide();

  // Complete endless quest
  if (typeof QuestSystem !== 'undefined' && QuestSystem.completeObjective) {
    QuestSystem.completeObjective('quest_endlessModeUnlocked');
  }

  // Start endless mode if available
  setTimeout(function() {
    if (typeof EndlessMode !== 'undefined' && EndlessMode.start) {
      EndlessMode.start();
    } else {
      console.warn('[CompletionScreen] EndlessMode not available');
      // Fall back to navigating using existing APIs, marking sandbox as endless
      if (typeof saveData !== 'undefined') {
        saveData.sandboxMode = 'endless';
        if (typeof saveSaveData === 'function') {
          saveSaveData();
        }
      }
      if (typeof returnToLobby === 'function') {
        returnToLobby();
      } else if (typeof showCampScreen === 'function') {
        showCampScreen();
      } else {
        // As a last resort, reload to main menu
        window.location.reload();
      }
    }
  }, 500);
}

function _returnToCamp() {
  console.log('[CompletionScreen] Returning to camp');

  CompletionScreen.hide();

  setTimeout(function() {
    // Return to camp/lobby
    if (typeof returnToLobby === 'function') {
      returnToLobby();
    } else if (typeof showCampScreen === 'function') {
      showCampScreen();
    } else {
      // Reload to main menu
      window.location.reload();
    }
  }, 500);
}

// ════════════════════════════════════════════════════════════
//  EXPORTS
// ════════════════════════════════════════════════════════════
global.CompletionScreen = CompletionScreen;

})(window);
