// js/incubator-system.js — Grey Egg Incubation System
// Handles the 5-minute heat/feed timer mechanics for hatching and growing the Grey companion

(function() {
  'use strict';

  const TIMER_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

  /**
   * Show the Incubator UI with heat/feed timers
   */
  function showIncubatorUI() {
    const sd = window.saveData;
    if (!sd) return;

    // Initialize incubator state
    if (!sd.incubatorState) {
      sd.incubatorState = {
        hasEgg: false,
        heatCount: 0,
        feedCount: 0,
        lastHeatTime: 0,
        lastFeedTime: 0,
        stage: 'empty'  // empty | egg | baby | adult
      };
    }

    const incState = sd.incubatorState;
    const hasGreyEgg = sd.companionEggs && sd.companionEggs.includes('grey_companion_egg');

    // ── Stage 1: Place egg in incubator ──
    if (incState.stage === 'empty' && hasGreyEgg) {
      incState.hasEgg = true;
      incState.stage = 'egg';
      incState.heatCount = 0;
      incState.lastHeatTime = 0;
      if (typeof saveSaveData === 'function') saveSaveData();

      // Show A.I.D.A. dialogue about egg placement
      if (typeof showComicInfoBox === 'function') {
        showComicInfoBox(
          '🤖 A.I.D.A. ANALYSIS',
          'Fascinating! This egg contains alien DNA unlike anything in our records. The incubation process will require precise temperature control.<br><br><b>Instructions:</b><br>• Press "Turn on Heat" 4 times<br>• Wait 5 minutes between each heating cycle<br>• The egg will hatch after 4 cycles',
          'Understood'
        );
      }
    }

    // Display the incubator UI
    _displayIncubatorPanel(incState);
  }

  /**
   * Display the incubator panel UI
   */
  function _displayIncubatorPanel(incState) {
    const existing = document.getElementById('incubator-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'incubator-overlay';
    overlay.style.cssText = [
      'position:fixed','top:0','left:0','width:100%','height:100%',
      'background:rgba(0,0,0,0.92)','z-index:8000',
      'display:flex','align-items:center','justify-content:center',
      'animation:fadeIn 0.3s ease-out'
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:linear-gradient(160deg, #0d0015 0%, #07000e 50%, #0a0510 100%)',
      'border:3px solid #C9A227',
      'border-radius:12px',
      'padding:30px',
      'max-width:min(500px,94vw)',
      'width:100%',
      'box-shadow:0 0 30px rgba(201,162,39,0.5), 0 0 60px rgba(0,255,100,0.1)',
      'font-family:"Courier New",monospace',
      'color:#00ffcc',
      'animation:popIn 0.5s cubic-bezier(0.175,0.885,0.32,1.1)'
    ].join(';');

    let content = `<div style="font-size:1.4em;margin-bottom:20px;text-align:center;letter-spacing:2px;color:#C9A227;text-shadow:0 0 10px rgba(201,162,39,0.8);">
      🔬 ALIEN INCUBATOR</div>`;

    const now = Date.now();

    // Stage: Egg (heating phase)
    if (incState.stage === 'egg') {
      const heatProgress = incState.heatCount;
      const timeSinceLastHeat = now - (incState.lastHeatTime || 0);
      const canHeat = incState.lastHeatTime === 0 || timeSinceLastHeat >= TIMER_DURATION;
      const timeRemaining = Math.max(0, TIMER_DURATION - timeSinceLastHeat);
      const minutesLeft = Math.floor(timeRemaining / 60000);
      const secondsLeft = Math.floor((timeRemaining % 60000) / 1000);

      content += `<div style="margin:20px 0;padding:20px;background:rgba(0,255,204,0.1);border:2px solid #00ffcc;border-radius:8px;">
        <div style="font-size:1.1em;margin-bottom:10px;text-align:center;">🥚 Grey Egg Status</div>
        <div style="margin:10px 0;text-align:center;">Heat Cycles: ${heatProgress}/4</div>
        <div style="margin:10px 0;height:20px;background:#222;border-radius:10px;overflow:hidden;box-shadow:inset 0 2px 5px rgba(0,0,0,0.5);">
          <div style="width:${(heatProgress/4)*100}%;height:100%;background:linear-gradient(90deg,#ff6600,#ffaa00);transition:width 0.5s;box-shadow:0 0 10px rgba(255,102,0,0.8);"></div>
        </div>`;

      if (heatProgress < 4) {
        if (canHeat) {
          content += `<button id="btnHeat" style="margin-top:15px;width:100%;padding:15px;background:linear-gradient(135deg,#ff6600,#ff3300);color:#fff;border:2px solid #ff8800;border-radius:6px;font-family:inherit;font-size:1.1em;font-weight:bold;cursor:pointer;letter-spacing:1px;box-shadow:0 0 15px rgba(255,102,0,0.6);transition:all 0.3s;">🔥 TURN ON HEAT</button>`;
        } else {
          content += `<div style="margin-top:15px;padding:15px;background:rgba(255,102,0,0.2);border:2px solid #ff6600;border-radius:6px;text-align:center;color:#ff8800;">
            ⏳ Cooling Down: ${minutesLeft}m ${secondsLeft}s
          </div>`;
        }
      } else {
        content += `<div style="margin-top:15px;padding:15px;background:rgba(0,255,136,0.3);border:2px solid #00ff88;border-radius:6px;text-align:center;color:#00ff88;font-weight:bold;animation:pulse 2s infinite;">
          ✓ HATCHING IN PROGRESS...
        </div>`;
      }
      content += `</div>`;

      // A.I.D.A. commentary
      if (heatProgress === 1) {
        content += `<div style="margin-top:10px;padding:10px;background:rgba(201,162,39,0.1);border-left:3px solid #C9A227;font-size:0.9em;color:#C9A227;">
          <b>A.I.D.A.:</b> "Initial heating complete. Bio-readings show embryonic activity increasing."
        </div>`;
      } else if (heatProgress === 2) {
        content += `<div style="margin-top:10px;padding:10px;background:rgba(201,162,39,0.1);border-left:3px solid #C9A227;font-size:0.9em;color:#C9A227;">
          <b>A.I.D.A.:</b> "Halfway there. The egg's shell is becoming translucent. I can see movement inside."
        </div>`;
      } else if (heatProgress === 3) {
        content += `<div style="margin-top:10px;padding:10px;background:rgba(201,162,39,0.1);border-left:3px solid #C9A227;font-size:0.9em;color:#C9A227;">
          <b>A.I.D.A.:</b> "Almost ready. The creature inside is preparing to break free."
        </div>`;
      }
    }

    // Stage: Baby (feeding phase)
    else if (incState.stage === 'baby') {
      const feedProgress = incState.feedCount;
      const timeSinceLastFeed = now - (incState.lastFeedTime || 0);
      const canFeed = incState.lastFeedTime === 0 || timeSinceLastFeed >= TIMER_DURATION;
      const timeRemaining = Math.max(0, TIMER_DURATION - timeSinceLastFeed);
      const minutesLeft = Math.floor(timeRemaining / 60000);
      const secondsLeft = Math.floor((timeRemaining % 60000) / 1000);

      content += `<div style="margin:20px 0;padding:20px;background:rgba(0,255,136,0.1);border:2px solid #00ff88;border-radius:8px;">
        <div style="font-size:1.1em;margin-bottom:10px;text-align:center;">👶 Baby Grey Status</div>
        <div style="margin:10px 0;text-align:center;">Feed Cycles: ${feedProgress}/4</div>
        <div style="margin:10px 0;height:20px;background:#222;border-radius:10px;overflow:hidden;box-shadow:inset 0 2px 5px rgba(0,0,0,0.5);">
          <div style="width:${(feedProgress/4)*100}%;height:100%;background:linear-gradient(90deg,#00ff88,#00cc66);transition:width 0.5s;box-shadow:0 0 10px rgba(0,255,136,0.8);"></div>
        </div>`;

      if (feedProgress < 4) {
        if (canFeed) {
          content += `<button id="btnFeed" style="margin-top:15px;width:100%;padding:15px;background:linear-gradient(135deg,#00ff88,#00cc66);color:#000;border:2px solid #00ff88;border-radius:6px;font-family:inherit;font-size:1.1em;font-weight:bold;cursor:pointer;letter-spacing:1px;box-shadow:0 0 15px rgba(0,255,136,0.6);transition:all 0.3s;">🍖 FEED</button>`;
        } else {
          content += `<div style="margin-top:15px;padding:15px;background:rgba(0,255,136,0.2);border:2px solid #00ff88;border-radius:6px;text-align:center;color:#00ff88;">
            ⏳ Digesting: ${minutesLeft}m ${secondsLeft}s
          </div>`;
        }
      } else {
        content += `<div style="margin-top:15px;padding:15px;background:rgba(201,162,39,0.3);border:2px solid #C9A227;border-radius:6px;text-align:center;color:#C9A227;font-weight:bold;animation:pulse 2s infinite;">
          ✓ MATURING INTO ADULT...
        </div>`;
      }
      content += `</div>`;

      // A.I.D.A. commentary for feeding
      if (feedProgress === 1) {
        content += `<div style="margin-top:10px;padding:10px;background:rgba(201,162,39,0.1);border-left:3px solid #C9A227;font-size:0.9em;color:#C9A227;">
          <b>A.I.D.A.:</b> "The baby is growing rapidly. Its neural patterns are developing faster than expected."
        </div>`;
      } else if (feedProgress === 2) {
        content += `<div style="margin-top:10px;padding:10px;background:rgba(201,162,39,0.1);border-left:3px solid #C9A227;font-size:0.9em;color:#C9A227;">
          <b>A.I.D.A.:</b> "Remarkable! It's already showing signs of intelligence. Keep feeding it."
        </div>`;
      } else if (feedProgress === 3) {
        content += `<div style="margin-top:10px;padding:10px;background:rgba(201,162,39,0.1);border-left:3px solid #C9A227;font-size:0.9em;color:#C9A227;">
          <b>A.I.D.A.:</b> "Almost fully grown. One more feeding and it will reach maturity."
        </div>`;
      }
    }

    // Stage: Adult (complete)
    else if (incState.stage === 'adult') {
      content += `<div style="margin:20px 0;padding:20px;background:rgba(201,162,39,0.15);border:2px solid #C9A227;border-radius:8px;text-align:center;">
        <div style="font-size:3em;margin-bottom:10px;animation:float 3s ease-in-out infinite;">👽</div>
        <div style="font-size:1.3em;color:#C9A227;margin-bottom:10px;font-weight:bold;text-shadow:0 0 10px rgba(201,162,39,0.8);">Adult Grey Companion</div>
        <div style="color:#00ffcc;margin:10px 0;line-height:1.6;">Your companion is fully grown and ready for combat!</div>
        <div style="margin-top:15px;padding:12px;background:rgba(0,255,204,0.1);border-radius:6px;border:1px solid #00ffcc;">
          <b style="color:#C9A227;">Abilities:</b><br>
          <span style="font-size:0.9em;">• Plasma Bolt attacks<br>• Tactical support<br>• Joins you in Sandbox 2.0</span>
        </div>
      </div>`;
    }

    panel.innerHTML = content;

    // Add heat button handler
    const btnHeat = panel.querySelector('#btnHeat');
    if (btnHeat) {
      btnHeat.onclick = function() {
        incState.heatCount++;
        incState.lastHeatTime = Date.now();

        if (incState.heatCount >= 4) {
          // Hatch the egg
          incState.stage = 'baby';
          incState.feedCount = 0;
          incState.lastFeedTime = 0;

          if (typeof saveSaveData === 'function') saveSaveData();

          // Close overlay and show hatch dialogue
          overlay.remove();
          if (typeof showComicInfoBox === 'function') {
            showComicInfoBox(
              '🎉 A.I.D.A.: Hatching Complete!',
              'The egg has hatched! A baby Grey has emerged. It\'s weak and needs regular feeding to grow strong.<br><br><b>Next Phase:</b><br>• Press "Feed" 4 times<br>• Wait 5 minutes between feedings<br>• The baby will mature into an Adult Grey companion',
              'Continue'
            );
          }
        } else {
          if (typeof saveSaveData === 'function') saveSaveData();
          _showIncubatorMsg(`🔥 Heat applied! ${incState.heatCount}/4 cycles complete. Wait 5 minutes.`, '#ff8800');
          overlay.remove();
        }
      };
    }

    // Add feed button handler
    const btnFeed = panel.querySelector('#btnFeed');
    if (btnFeed) {
      btnFeed.onclick = function() {
        incState.feedCount++;
        incState.lastFeedTime = Date.now();

        if (incState.feedCount >= 4) {
          // Mature to adult
          incState.stage = 'adult';

          // Unlock companion for battle
          const sd = window.saveData;
          if (!sd.companions) sd.companions = {};
          if (!sd.companions.greyAlien) sd.companions.greyAlien = {};
          sd.companions.greyAlien.unlocked = true;
          if (!sd.companions.greyAlien.skills) sd.companions.greyAlien.skills = {};

          if (typeof saveSaveData === 'function') saveSaveData();

          // Close overlay and show completion dialogue
          overlay.remove();
          if (typeof showComicInfoBox === 'function') {
            showComicInfoBox(
              '👽 A.I.D.A.: Evolution Complete!',
              'The baby Grey has matured into a fully grown adult! It\'s now a powerful companion that will fight alongside you in battle.<br><br><b>Companion Unlocked:</b> Adult Grey<br><br>Your companion will join you on your next Sandbox run!',
              'Amazing!'
            );
          }
        } else {
          if (typeof saveSaveData === 'function') saveSaveData();
          _showIncubatorMsg(`🍖 Fed! ${incState.feedCount}/4 cycles complete. Wait 5 minutes.`, '#00ff88');
          overlay.remove();
        }
      };
    }

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '[ CLOSE ]';
    closeBtn.style.cssText = 'display:block;margin:20px auto 0;background:none;color:#C9A227;border:2px solid #C9A227;border-radius:6px;padding:10px 24px;cursor:pointer;font-family:inherit;letter-spacing:2px;font-size:1.1em;transition:all 0.3s;';
    closeBtn.onmouseover = function() { this.style.background = 'rgba(201,162,39,0.2)'; };
    closeBtn.onmouseout = function() { this.style.background = 'none'; };
    closeBtn.onclick = function () {
      overlay.remove();
    };
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  /**
   * Show a temporary message at the bottom of the screen
   */
  function _showIncubatorMsg(text, color) {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'bottom:22%', 'left:50%',
      'transform:translateX(-50%)',
      'background:rgba(0,0,0,0.92)',
      `color:${color || '#00ffcc'}`,
      'font-family:"Courier New",monospace',
      'font-size:clamp(13px,3vw,15px)',
      'padding:12px 20px',
      'border-radius:6px',
      `border:2px solid ${color || '#00ffcc'}`,
      'z-index:9000',
      'pointer-events:none',
      'text-align:center',
      'max-width:min(380px,90vw)',
      `box-shadow:0 0 20px ${color || '#00ffcc'}`,
      'animation:slideUp 0.3s ease-out'
    ].join(';');
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3500);
  }

  // Export to window
  window.IncubatorSystem = {
    showIncubatorUI: showIncubatorUI
  };

})();
