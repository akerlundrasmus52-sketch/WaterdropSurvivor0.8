// --- UI / DOM HELPER FUNCTIONS ---
// Extracted from game.js - loaded as a regular script before the game.js ES module
// Exposes window.GameUI for use by main.js
//
// Only pure DOM-manipulation helpers that do NOT depend on THREE.js scene state
// are extracted here. Functions that require camera (3D→2D projection), player
// position, or other runtime scene objects remain in main.js.

// Stat Notification Queue System - module-private state
const _statNotificationQueue = [];
let _isShowingNotification = false;

// Previous stats history for the lower-left panel (max 3 items)
const _previousStats = [];
let _liveStatTimer = null;

function _updatePreviousStatsPanel() {
  for (let i = 0; i < 3; i++) {
    // Update both legacy and unified stat box previous items
    const el = document.getElementById('stat-bar-prev-' + (i + 1));
    if (el) {
      el.textContent = _previousStats[i] || '';
      el.style.display = _previousStats[i] ? '' : 'none';
    }
    const boxEl = document.getElementById('stat-box-prev-' + (i + 1));
    if (boxEl) {
      boxEl.textContent = _previousStats[i] || '';
      boxEl.style.display = _previousStats[i] ? '' : 'none';
    }
  }
}

function _updateLiveStatDisplay(text) {
  const liveEl = document.getElementById('live-stat-display');
  const boxLiveEl = document.getElementById('stat-box-live');

  // Push current live stat to previous stats if it exists and wasn't already pushed
  const currentText = (boxLiveEl && boxLiveEl.textContent) || (liveEl && liveEl.textContent) || '';
  if (currentText && currentText.trim() && currentText.trim() !== _previousStats[0]) {
    _previousStats.unshift(currentText.trim());
    if (_previousStats.length > 3) _previousStats.pop();
    _updatePreviousStatsPanel();
  }

  // Show the new stat in legacy live display
  if (liveEl) {
    liveEl.textContent = text;
    liveEl.style.display = 'block';
  }

  // Show in unified stat box live section
  if (boxLiveEl) {
    boxLiveEl.textContent = text;
  }

  // Auto-hide after 4 seconds and move to previous if not already replaced
  if (_liveStatTimer) clearTimeout(_liveStatTimer);
  _liveStatTimer = setTimeout(() => {
    if (boxLiveEl && boxLiveEl.textContent === text) {
      if (text.trim() !== _previousStats[0]) {
        _previousStats.unshift(text.trim());
        if (_previousStats.length > 3) _previousStats.pop();
        _updatePreviousStatsPanel();
      }
      boxLiveEl.textContent = '';
    }
    if (liveEl && liveEl.textContent === text) {
      liveEl.style.display = 'none';
      liveEl.textContent = '';
    }
  }, 4000);
}

function _processStatNotificationQueue() {
  if (_statNotificationQueue.length === 0) {
    _isShowingNotification = false;
    return;
  }

  _isShowingNotification = true;
  const { text, level } = _statNotificationQueue.shift();

  // Update live stat display (upper right)
  _updateLiveStatDisplay(text);

  // Create notification element
  const container = document.getElementById('stat-notifications');
  const notification = document.createElement('div');
  notification.className = 'stat-notification';

  // Add styling based on level
  if (level === 'mythical') {
    notification.classList.add('combo-mythical');
  } else if (level === 'high') {
    notification.classList.add('combo-high');
  }

  notification.innerText = text;
  container.appendChild(notification);

  // Faster fade out: 0.8 seconds display, then 0.3s fade
  setTimeout(() => {
    notification.style.animation = 'stat-fade-out 0.3s ease-out forwards';

    // Remove element and process next in queue
    setTimeout(() => {
      container.removeChild(notification);
      _processStatNotificationQueue();
    }, 300);
  }, 800);
}

function showStatChange(text, level = 'normal') {
  // Add to queue with level
  _statNotificationQueue.push({ text, level });

  // Start processing queue if not already processing
  if (!_isShowingNotification) {
    _processStatNotificationQueue();
  }
}

// showStatusMessage: compact status notification (camp screen feedback)
function showStatusMessage(text, duration = 2000) {
  showStatChange(text);
}

window.GameUI = {
  showStatChange,
  showStatusMessage
};
