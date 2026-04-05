// --- PURE UTILITY FUNCTIONS ---
// Extracted from game.js - loaded as a regular script before game.js (module)
// Exposes window.GameUtils for use by game.js

function getRarityColor(rarity) {
  const colors = {
    common:    '#aaaaaa',
    uncommon:  '#55cc55',
    rare:      '#44aaff',
    epic:      '#aa44ff',
    legendary: '#ffd700',
    mythic:    '#ff4444'
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
  return level * 100; // Linear: each level requires level*100 XP total
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
  KILL_CAM_CONSTANTS,
  getRandomKillMessage
};
