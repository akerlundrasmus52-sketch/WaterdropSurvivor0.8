// ============================================================
// debug.js — Lightweight freeze-diagnostic layer
// Gated by ?debug=1 (or window.DEBUG_LOGGING = true).
// Adds NO movement logic; observation only.
// ============================================================

(function () {
  // ---- debug gate ----
  const enabled =
    (typeof window !== 'undefined' &&
      (window.DEBUG_LOGGING === true ||
        new URLSearchParams(window.location.search).get('debug') === '1'));

  // ---- throttled logger: max 1 unique-key log per second ----
  const _lastLog = {};
  function tlog(key, level, msg) {
    if (!enabled) return;
    const now = Date.now();
    if (_lastLog[key] && now - _lastLog[key] < 1000) return;
    _lastLog[key] = now;
    if (level === 'warn')  console.warn('[DBG]', msg);
    else if (level === 'error') console.error('[DBG]', msg);
    else                   console.log('[DBG]', msg);
  }

  // ---- one-shot error logger (fires at most once per key) ----
  const _fired = new Set();
  function oshot(key, msg, stack) {
    if (!enabled) return;
    if (_fired.has(key)) return;
    _fired.add(key);
    console.error('[DBG-ERR]', msg, stack || '');
  }

  // ---- rolling frame counter ----
  let _frameCounter = 0;

  // ---- stuck-enemy tracker ----
  // Maps enemy id → { x, z, since }
  const _stuckMap = new Map();
  const STUCK_THRESHOLD_MS = 3000;
  const STUCK_DELTA_SQ    = 0.01 * 0.01; // < 0.01 world-units movement

  function checkStuckEnemy(enemy, nowMs) {
    if (!enabled) return;
    if (!enemy || !enemy.mesh) return;
    const id = enemy.mesh.uuid;
    const px = enemy.mesh.position.x;
    const pz = enemy.mesh.position.z;
    const prev = _stuckMap.get(id);
    if (!prev) {
      _stuckMap.set(id, { x: px, z: pz, since: nowMs, logged: false });
      return;
    }
    const dxsq = (px - prev.x) * (px - prev.x) + (pz - prev.z) * (pz - prev.z);
    if (dxsq > STUCK_DELTA_SQ) {
      // enemy moved — reset
      _stuckMap.set(id, { x: px, z: pz, since: nowMs, logged: false });
    } else if (!prev.logged && nowMs - prev.since > STUCK_THRESHOLD_MS) {
      prev.logged = true;
      oshot('stuck_' + id,
        'Stuck enemy id=' + id.slice(0, 8) +
        ' type=' + (enemy.type !== undefined ? enemy.type : '?') +
        ' hp=' + (enemy.hp !== undefined ? enemy.hp.toFixed(0) : '?') +
        ' pos=(' + px.toFixed(1) + ',' + pz.toFixed(1) + ')' +
        ' stuck>' + STUCK_THRESHOLD_MS + 'ms');
    }
  }

  // ---- public API ----
  window.GameDebug = {
    enabled,
    tlog,
    oshot,

    // Call once per frame from the top of animate(); dtMs is dt in milliseconds
    onFrameStart(time, dtMs, gameTime) {
      if (!enabled) return;
      _frameCounter++;
      const dt = dtMs / 1000;

      // Warn on dt anomalies (> 120ms, NaN, Infinity)
      if (!isFinite(dt) || isNaN(dt)) {
        tlog('dt_nan', 'warn',
          'dt is ' + dt + ' | time=' + time.toFixed(1) +
          ' dtMs=' + dtMs + ' frame#' + _frameCounter);
      } else if (dtMs > 120) {
        tlog('dt_high', 'warn',
          'dt=' + dtMs.toFixed(0) + 'ms (>120) | gameTime=' +
          (gameTime || 0).toFixed(1) + 's frame#' + _frameCounter);
      }

      // Periodic alive-confirmation log every ~5s (once per 5 seconds of in-game time)
      if (_frameCounter % 300 === 0) {
        tlog('heartbeat_' + (_frameCounter / 300),
          'log',
          'Loop alive frame#' + _frameCounter +
          ' gameTime=' + (gameTime || 0).toFixed(1) + 's' +
          ' dt=' + dtMs.toFixed(0) + 'ms');
      }
    },

    // Always-on freeze detection (NOT gated by ?debug=1)
    // Call after each render with the game logic error count.
    // Logs a warning when game logic errors are preventing rendering.
    onRenderStatus(gameLogicErrorCount, cinematicActive, killCamActive, isPaused) {
      if (gameLogicErrorCount > 3) {
        // Always log this — it means the screen would have been frozen without the try-catch
        console.warn('[FreezeGuard] Game logic threw ' + gameLogicErrorCount +
          ' consecutive errors — rendering forced to prevent freeze.' +
          ' cinematic=' + cinematicActive + ' killCam=' + killCamActive +
          ' paused=' + isPaused);
      }
    },

    // Call once per frame, passing enemy array and alive/spawned/died counts
    onEnemyTick(enemies, spawnedThisTick, diedThisTick) {
      if (!enabled) return;
      const nowMs  = Date.now();
      const alive  = enemies ? enemies.filter(e => e && !e.isDead).length : 0;

      if (spawnedThisTick > 0 || diedThisTick > 0) {
        tlog('enemy_delta', 'log',
          'Enemies alive=' + alive +
          ' spawned+' + spawnedThisTick +
          ' died-' + diedThisTick);
      }

      // Per-enemy stuck check
      if (enemies) {
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (e && !e.isDead) checkStuckEnemy(e, nowMs);
        }
      }

      // Clean up entries for enemies that died/were removed
      if (_stuckMap.size > 50) {
        const alive2 = new Set();
        if (enemies) enemies.forEach(e => { if (e && e.mesh) alive2.add(e.mesh.uuid); });
        for (const id of _stuckMap.keys()) {
          if (!alive2.has(id)) _stuckMap.delete(id);
        }
      }
    },

    // Call when a mini-boss or flying boss is spawned
    onBossSpawn(bossEnemy, playerLevel, waveLabel) {
      if (!enabled) return;
      if (!bossEnemy) return;
      const hp    = bossEnemy.hp    !== undefined ? bossEnemy.hp.toFixed(0)    : '?';
      const armor = bossEnemy.armor !== undefined ? (bossEnemy.armor * 100).toFixed(0) + '%' : '0%';
      const speed = bossEnemy.speed !== undefined ? bossEnemy.speed.toFixed(2) : '?';
      const ts    = (Date.now() / 1000).toFixed(1);
      tlog('boss_spawn_' + waveLabel, 'log',
        'BossSpawn ' + waveLabel +
        ' hp=' + hp + ' armor=' + armor + ' spd=' + speed +
        ' playerLvl=' + playerLevel + ' ts=' + ts + 's');
    },

    // Call when an upgrade/perk is applied; pass upgrade id and key stat snapshot
    onUpgradeApplied(upgradeId, statsSnapshot) {
      if (!enabled) return;
      // Only verbosely log the upgrades the issue cares about
      const interesting = upgradeId &&
        (upgradeId.startsWith('class_') || upgradeId.startsWith('perk_'));
      if (!interesting) return;
      let snap = '';
      if (statsSnapshot) {
        snap = ' proj=' + (statsSnapshot.projectiles || 1) +
               ' dmg=' + (statsSnapshot.damage !== undefined ? statsSnapshot.damage.toFixed(2) : '?') +
               ' spd=' + (statsSnapshot.walkSpeed !== undefined ? statsSnapshot.walkSpeed.toFixed(2) : '?') +
               ' lvl=' + (statsSnapshot.lvl || '?');
      }
      tlog('upgrade_' + upgradeId, 'log',
        'Upgrade applied: ' + upgradeId + snap);
    },

    // Wrap a call in try/catch; fire oshot on first error
    safeCall(key, fn) {
      try {
        fn();
      } catch (err) {
        oshot(key, 'Error in ' + key + ': ' + err.message, err.stack);
      }
    }
  };

  // ---- visual error box (iPhone-friendly, no F12 needed) ----
  // Only active when ?debug=1 is in the URL.
  if (enabled) {
    var _errBox = null;
    var _errCount = 0;

    function _getErrBox() {
      if (_errBox) return _errBox;
      // Re-use an existing box if the DOM already has one (e.g. after hot-reload)
      _errBox = document.getElementById('dbg-error-box');
      if (_errBox) return _errBox;
      _errBox = document.createElement('div');
      _errBox.id = 'dbg-error-box';
      _errBox.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'right:0',
        'max-height:40vh',
        'overflow-y:auto',
        'background:rgba(180,0,0,0.92)',
        'color:#fff',
        'font-family:monospace',
        'font-size:12px',
        'line-height:1.4',
        'padding:8px',
        'z-index:999999',
        'word-break:break-all',
        'pointer-events:auto',
        'border-bottom:3px solid #ff0',
        'display:none'
      ].join(';');
      // tap to dismiss
      _errBox.addEventListener('click', function () { _errBox.style.display = 'none'; });
      document.body.appendChild(_errBox);
      return _errBox;
    }

    function _showError(msg, src, line) {
      _errCount++;
      var box = _getErrBox();
      var entry = document.createElement('div');
      entry.style.cssText = 'border-bottom:1px solid rgba(255,255,255,0.3);padding:4px 0;';
      entry.textContent = '[' + _errCount + '] ' + msg +
        (src ? ' — ' + src.split('/').pop() : '') +
        (line ? ':' + line : '');
      box.insertBefore(entry, box.firstChild);
      box.style.display = 'block';
    }

    window.addEventListener('error', function (e) {
      _showError(e.message || String(e), e.filename, e.lineno);
    });

    window.addEventListener('unhandledrejection', function (e) {
      var msg = (e.reason && e.reason.message) ? e.reason.message : String(e.reason);
      _showError('Unhandled promise rejection: ' + msg, '', '');
    });

    // ensure box exists after DOM loads
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { _getErrBox(); });
    } else {
      _getErrBox();
    }
  }
})();
