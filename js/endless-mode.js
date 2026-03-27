// js/endless-mode.js — Endless Mode System
// Procedurally generated waves with escalating difficulty
// Tracks personal best wave reached

(function(global) {
'use strict';

// ════════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════════
var _active = false;
var _currentWave = 0;
var _baseStats = {
  enemyCount: 8,
  enemyHP: 100,
  enemyDamage: 10,
  enemySpeed: 1.0
};

// ════════════════════════════════════════════════════════════
//  ENDLESS MODE OBJECT
// ════════════════════════════════════════════════════════════
var EndlessMode = {
  /**
   * start() - Begin endless mode
   */
  start: function() {
    if (_active) return;

    console.log('[EndlessMode] Starting endless mode');
    _active = true;
    _currentWave = 0;

    // Update UI
    _showEndlessUI();

    // Reset sandbox in endless mode
    if (typeof _resetSandboxGame === 'function') {
      _resetSandboxGame();
    }

    // Set mode flag
    if (typeof saveData !== 'undefined') {
      saveData.sandboxMode = 'endless';
      if (!saveData.endlessStats) {
        saveData.endlessStats = {
          highestWave: 0,
          totalWaves: 0,
          totalKills: 0
        };
      }
      if (typeof saveSaveData === 'function') saveSaveData();
    }

    // Start first wave
    setTimeout(function() {
      EndlessMode.nextWave();
    }, 2000);
  },

  /**
   * nextWave() - Advance to next endless wave
   */
  nextWave: function() {
    if (!_active) return;

    _currentWave++;
    _updateWaveDisplay();

    // Calculate wave stats
    var waveStats = _calculateWaveStats(_currentWave);

    console.log('[EndlessMode] Wave', _currentWave, 'stats:', waveStats);

    // Spawn enemies
    _spawnEndlessWave(waveStats);

    // Update save data
    if (typeof saveData !== 'undefined' && saveData.endlessStats) {
      saveData.endlessStats.totalWaves++;
      if (_currentWave > saveData.endlessStats.highestWave) {
        saveData.endlessStats.highestWave = _currentWave;
      }
      if (typeof saveSaveData === 'function') saveSaveData();
    }

    // Complete quest on wave 1
    if (_currentWave === 1) {
      if (typeof QuestSystem !== 'undefined' && QuestSystem.completeObjective) {
        QuestSystem.completeObjective('quest_endlessMode');
      }
    }

    // Elite enemies every 5 waves
    if (_currentWave % 5 === 0) {
      _spawnEliteEnemy(waveStats);
    }
  },

  /**
   * stop() - End endless mode (called on death)
   */
  stop: function() {
    if (!_active) return;

    console.log('[EndlessMode] Stopped at wave', _currentWave);
    _active = false;

    _showEndlessDeathScreen();
  },

  /**
   * isActive() - Check if endless mode is running
   */
  isActive: function() {
    return _active;
  },

  /**
   * getCurrentWave() - Get current wave number
   */
  getCurrentWave: function() {
    return _currentWave;
  }
};

// ════════════════════════════════════════════════════════════
//  WAVE CALCULATION
// ════════════════════════════════════════════════════════════
function _calculateWaveStats(wave) {
  // Difficulty scales every 10 waves
  var difficultyTier = Math.floor(wave / 10);
  var multiplier = 1 + (difficultyTier * 0.5); // +50% per 10 waves

  // Additional scaling per wave
  var waveMultiplier = 1 + (wave * 0.05); // +5% per wave

  return {
    enemyCount: Math.floor(_baseStats.enemyCount * waveMultiplier),
    enemyHP: Math.floor(_baseStats.enemyHP * multiplier * waveMultiplier),
    enemyDamage: Math.floor(_baseStats.enemyDamage * multiplier),
    enemySpeed: _baseStats.enemySpeed + (difficultyTier * 0.1)
  };
}

// ════════════════════════════════════════════════════════════
//  WAVE SPAWNING
// ════════════════════════════════════════════════════════════
function _spawnEndlessWave(stats) {
  // Build groups for this wave
  var enemyTypes = ['slime', 'leaping', 'crawler', 'skinwalker'];
  var groups = [];

  var perType = Math.max(1, Math.floor(stats.enemyCount / enemyTypes.length));

  enemyTypes.forEach(function(type) {
    groups.push({ type: type, count: perType });
  });

  // Prefer a global event-based spawning API so other systems can handle spawning.
  if (typeof global !== 'undefined' &&
      typeof global.dispatchEvent === 'function' &&
      typeof global.CustomEvent === 'function') {
    try {
      var event = new global.CustomEvent('endlessmode:spawnwave', {
        detail: {
          groups: groups,
          stats: stats
        }
      });
      global.dispatchEvent(event);
      console.log('[EndlessMode] Requested spawn of', groups.length, 'enemy groups via event');
    } catch (e) {
      console.warn('[EndlessMode] Failed to dispatch spawn event:', e);
    }
  } else {
    console.warn('[EndlessMode] No spawning API available (CustomEvent/dispatchEvent missing)');
  }
}

function _spawnEliteEnemy(stats) {
  console.log('[EndlessMode] Spawning elite enemy for wave', _currentWave);

  // Show notification
  if (typeof _showWaveNotification !== 'undefined') {
    _showWaveNotification('⚡ ELITE ENEMY INCOMING! ⚡', '#ff0000', 3000);
  }

  // Spawn a powered-up skinwalker
  if (typeof _spawnSkinwalker === 'function' && typeof player !== 'undefined' && player.mesh) {
    var px = player.mesh.position.x;
    var pz = player.mesh.position.z;

    var angle = Math.random() * Math.PI * 2;
    var dist = 25;
    var x = px + Math.cos(angle) * dist;
    var z = pz + Math.sin(angle) * dist;

    _spawnSkinwalker(x, z);
    // Note: Would need to modify spawned enemy HP/damage but that requires access to internal state
  }
}

// ════════════════════════════════════════════════════════════
//  UI
// ════════════════════════════════════════════════════════════
function _showEndlessUI() {
  var display = document.getElementById('endless-wave-display');
  if (display) {
    display.style.display = 'block';
    _updateWaveDisplay();
  }
}

function _updateWaveDisplay() {
  var display = document.getElementById('endless-wave-display');
  if (display) {
    display.textContent = 'ENDLESS WAVE: ' + _currentWave;
  }
}

function _showEndlessDeathScreen() {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'background:rgba(0,0,0,0.95);z-index:10000;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;animation:fadeIn 0.5s;';

  var title = document.createElement('div');
  title.style.cssText = 'font-size:clamp(48px,8vw,72px);font-weight:bold;color:#ff0000;' +
    'text-shadow:0 0 20px #ff0000;margin-bottom:40px;font-family:"Bangers",cursive;' +
    'letter-spacing:4px;';
  title.textContent = 'ENDLESS MODE COMPLETE';
  overlay.appendChild(title);

  var waveText = document.createElement('div');
  waveText.style.cssText = 'font-size:clamp(32px,5vw,48px);color:#ffd700;' +
    'text-shadow:0 0 15px #ffd700;margin-bottom:20px;font-weight:bold;';
  waveText.textContent = 'Wave Reached: ' + _currentWave;
  overlay.appendChild(waveText);

  // Personal best
  if (typeof saveData !== 'undefined' && saveData.endlessStats) {
    var bestText = document.createElement('div');
    bestText.style.cssText = 'font-size:clamp(20px,3vw,28px);color:#ffffff;' +
      'text-shadow:0 0 10px rgba(255,255,255,0.8);margin-bottom:50px;';
    bestText.textContent = 'Personal Best: Wave ' + saveData.endlessStats.highestWave;
    overlay.appendChild(bestText);
  }

  // Retry button
  var retryBtn = document.createElement('button');
  retryBtn.textContent = '🔄 TRY AGAIN';
  retryBtn.style.cssText = 'padding:20px 50px;font-size:clamp(20px,3vw,28px);' +
    'background:linear-gradient(135deg,#ff8c00,#ffd700);color:#000;border:3px solid #ffd700;' +
    'border-radius:10px;cursor:pointer;font-weight:bold;margin:10px;' +
    'box-shadow:0 0 20px rgba(255,215,0,0.6);transition:all 0.3s;' +
    'font-family:"Bangers",cursive;letter-spacing:2px;';
  retryBtn.onclick = function() {
    document.body.removeChild(overlay);
    EndlessMode.start();
  };
  overlay.appendChild(retryBtn);

  // Return button
  var returnBtn = document.createElement('button');
  returnBtn.textContent = '🏕️ RETURN TO CAMP';
  returnBtn.style.cssText = 'padding:20px 50px;font-size:clamp(20px,3vw,28px);' +
    'background:linear-gradient(135deg,#4a4a4a,#2a2a2a);color:#fff;border:3px solid #888;' +
    'border-radius:10px;cursor:pointer;font-weight:bold;margin:10px;' +
    'box-shadow:0 0 15px rgba(136,136,136,0.4);transition:all 0.3s;' +
    'font-family:"Bangers",cursive;letter-spacing:2px;';
  returnBtn.onclick = function() {
    document.body.removeChild(overlay);
    if (typeof returnToLobby === 'function') {
      returnToLobby();
    } else if (typeof showCampScreen === 'function') {
      showCampScreen();
    } else {
      window.location.reload();
    }
  };
  overlay.appendChild(returnBtn);

  document.body.appendChild(overlay);
}

// ════════════════════════════════════════════════════════════
//  EXPORTS
// ════════════════════════════════════════════════════════════
global.EndlessMode = EndlessMode;

})(window);
