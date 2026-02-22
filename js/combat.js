// --- COMBAT CALCULATIONS ---
// Extracted from game.js - loaded as a regular script before game.js (module)
// Exposes window.GameCombat for use by game.js

/**
 * Apply player-armor reduction to incoming damage.
 * Mirrors the inline formula previously in Player.takeDamage().
 *
 * @param {number} amount      - Raw incoming damage
 * @param {number} armorPercent - Player armor as a percentage (0–100)
 * @returns {number} Reduced damage (minimum 1)
 */
function calculateArmorReduction(amount, armorPercent) {
  return Math.max(1, amount * (1 - armorPercent / 100));
}

/**
 * Apply enemy armor reduction (fraction-based, used by MiniBoss).
 * Mirrors the inline formula previously in Enemy.takeDamage().
 *
 * @param {number} amount        - Raw incoming damage
 * @param {number} armorFraction - Armor as a fraction (0.0–1.0)
 * @returns {number} Reduced damage
 */
function calculateEnemyArmorReduction(amount, armorFraction) {
  return amount * (1 - armorFraction);
}

window.GameCombat = {
  calculateArmorReduction,
  calculateEnemyArmorReduction
};
