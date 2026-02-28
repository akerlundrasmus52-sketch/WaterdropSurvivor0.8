// --- PURE UTILITY FUNCTIONS ---
// Extracted from game.js - loaded as a regular script before game.js (module)
// Exposes window.GameUtils for use by game.js

function getRarityColor(rarity) {
  const colors = {
    common: '#AAAAAA',
    uncommon: '#00FF00',
    rare: '#5DADE2',
    epic: '#9B59B6',
    legendary: '#F39C12',
    mythic: '#E74C3C'
  };
  return colors[rarity] || colors.common;
}

function getChestTierForCombo(comboCount) {
  if (comboCount >= 20) return 'mythical';
  if (comboCount >= 15) return 'epic';
  if (comboCount >= 12) return 'rare';
  if (comboCount >= 9) return 'uncommon';
  if (comboCount >= 7) return 'common';
  return null;
}

function getAccountLevelXPRequired(level) {
  return level * 100; // XP required to advance from `level` to `level + 1`
}

/**
 * Clamps a value between min and max (inclusive).
 * Replaces repeated Math.min(Math.max(value, min), max) patterns.
 *
 * @param {number} value - The number to clamp
 * @param {number} min   - Lower bound
 * @param {number} max   - Upper bound
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const KILL_CAM_CONSTANTS = {
  REGULAR_ENEMY_CHANCE: 0.15,
  ZOOM_IN_INTENSITY: 0.3,
  SLOW_MOTION_ZOOM: 0.15,
  SHAKE_ZOOM_INTENSITY: 0.4,
  ROTATE_CAM_RADIUS: 20,
  KILL_MESSAGES: ['ELIMINATED!', 'DESTROYED!', 'OBLITERATED!']
};

function getRandomKillMessage() {
  const messages = KILL_CAM_CONSTANTS.KILL_MESSAGES;
  return messages[Math.floor(Math.random() * messages.length)];
}

window.GameUtils = {
  getRarityColor,
  getChestTierForCombo,
  getAccountLevelXPRequired,
  clamp,
  KILL_CAM_CONSTANTS,
  getRandomKillMessage
};
