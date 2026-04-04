/**
 * Tests for js/utils.js
 *
 * utils.js is a plain browser script that exposes window.GameUtils.
 * The jsdom test environment provides `window`, so we can require the
 * file and then access its exports through the global.
 */

// Require at module level so window.GameUtils is available when describe blocks run.
require('../js/utils.js');

describe('GameUtils', () => {
  test('exposes GameUtils on window', () => {
    expect(window.GameUtils).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getRarityColor
// ---------------------------------------------------------------------------
describe('getRarityColor', () => {
  const { getRarityColor } = window.GameUtils;

  test('returns correct color for common', () => {
    expect(getRarityColor('common')).toBe('#AAAAAA');
  });

  test('returns correct color for uncommon', () => {
    expect(getRarityColor('uncommon')).toBe('#00FF00');
  });

  test('returns correct color for rare', () => {
    expect(getRarityColor('rare')).toBe('#5DADE2');
  });

  test('returns correct color for epic', () => {
    expect(getRarityColor('epic')).toBe('#9B59B6');
  });

  test('returns correct color for legendary', () => {
    expect(getRarityColor('legendary')).toBe('#F39C12');
  });

  test('returns correct color for mythic', () => {
    expect(getRarityColor('mythic')).toBe('#E74C3C');
  });

  test('falls back to common color for unknown rarity', () => {
    expect(getRarityColor('godlike')).toBe('#AAAAAA');
    expect(getRarityColor('')).toBe('#AAAAAA');
    expect(getRarityColor(undefined)).toBe('#AAAAAA');
    expect(getRarityColor(null)).toBe('#AAAAAA');
  });
});

// ---------------------------------------------------------------------------
// getChestTierForCombo
// ---------------------------------------------------------------------------
describe('getChestTierForCombo', () => {
  const { getChestTierForCombo } = window.GameUtils;

  test('returns null for combos below 7', () => {
    expect(getChestTierForCombo(0)).toBeNull();
    expect(getChestTierForCombo(1)).toBeNull();
    expect(getChestTierForCombo(6)).toBeNull();
  });

  test('returns common for combos 7-8', () => {
    expect(getChestTierForCombo(7)).toBe('common');
    expect(getChestTierForCombo(8)).toBe('common');
  });

  test('returns uncommon for combos 9-11', () => {
    expect(getChestTierForCombo(9)).toBe('uncommon');
    expect(getChestTierForCombo(11)).toBe('uncommon');
  });

  test('returns rare for combos 12-14', () => {
    expect(getChestTierForCombo(12)).toBe('rare');
    expect(getChestTierForCombo(14)).toBe('rare');
  });

  test('returns epic for combos 15-19', () => {
    expect(getChestTierForCombo(15)).toBe('epic');
    expect(getChestTierForCombo(19)).toBe('epic');
  });

  test('returns mythical for combos 20 and above', () => {
    expect(getChestTierForCombo(20)).toBe('mythical');
    expect(getChestTierForCombo(100)).toBe('mythical');
  });

  test('boundary: exactly at each threshold', () => {
    expect(getChestTierForCombo(7)).toBe('common');
    expect(getChestTierForCombo(9)).toBe('uncommon');
    expect(getChestTierForCombo(12)).toBe('rare');
    expect(getChestTierForCombo(15)).toBe('epic');
    expect(getChestTierForCombo(20)).toBe('mythical');
  });
});

// ---------------------------------------------------------------------------
// getAccountLevelXPRequired
// ---------------------------------------------------------------------------
describe('getAccountLevelXPRequired', () => {
  const { getAccountLevelXPRequired } = window.GameUtils;

  test('returns level * 100 for various levels', () => {
    expect(getAccountLevelXPRequired(1)).toBe(100);
    expect(getAccountLevelXPRequired(5)).toBe(500);
    expect(getAccountLevelXPRequired(10)).toBe(1000);
    expect(getAccountLevelXPRequired(50)).toBe(5000);
    expect(getAccountLevelXPRequired(100)).toBe(10000);
  });

  test('returns 0 for level 0', () => {
    expect(getAccountLevelXPRequired(0)).toBe(0);
  });

  test('scales linearly — each successive level costs 100 more', () => {
    for (let lvl = 1; lvl <= 10; lvl++) {
      expect(getAccountLevelXPRequired(lvl)).toBe(lvl * 100);
    }
  });
});

// ---------------------------------------------------------------------------
// getRandomKillMessage
// ---------------------------------------------------------------------------
describe('getRandomKillMessage', () => {
  const { getRandomKillMessage, KILL_CAM_CONSTANTS } = window.GameUtils;

  test('returns one of the defined kill messages', () => {
    const validMessages = KILL_CAM_CONSTANTS.KILL_MESSAGES;
    const msg = getRandomKillMessage();
    expect(validMessages).toContain(msg);
  });

  test('always returns a string', () => {
    for (let i = 0; i < 20; i++) {
      expect(typeof getRandomKillMessage()).toBe('string');
    }
  });

  test('coverage: calling many times still stays within valid set', () => {
    const validSet = new Set(KILL_CAM_CONSTANTS.KILL_MESSAGES);
    for (let i = 0; i < 50; i++) {
      expect(validSet.has(getRandomKillMessage())).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// KILL_CAM_CONSTANTS
// ---------------------------------------------------------------------------
describe('KILL_CAM_CONSTANTS', () => {
  const { KILL_CAM_CONSTANTS } = window.GameUtils;

  test('contains expected keys', () => {
    expect(KILL_CAM_CONSTANTS).toHaveProperty('REGULAR_ENEMY_CHANCE');
    expect(KILL_CAM_CONSTANTS).toHaveProperty('ZOOM_IN_INTENSITY');
    expect(KILL_CAM_CONSTANTS).toHaveProperty('SLOW_MOTION_ZOOM');
    expect(KILL_CAM_CONSTANTS).toHaveProperty('SHAKE_ZOOM_INTENSITY');
    expect(KILL_CAM_CONSTANTS).toHaveProperty('ROTATE_CAM_RADIUS');
    expect(KILL_CAM_CONSTANTS).toHaveProperty('KILL_MESSAGES');
  });

  test('KILL_MESSAGES is a non-empty array of strings', () => {
    const msgs = KILL_CAM_CONSTANTS.KILL_MESSAGES;
    expect(Array.isArray(msgs)).toBe(true);
    expect(msgs.length).toBeGreaterThan(0);
    msgs.forEach(m => expect(typeof m).toBe('string'));
  });

  test('numeric constants are in expected ranges', () => {
    expect(KILL_CAM_CONSTANTS.REGULAR_ENEMY_CHANCE).toBeGreaterThan(0);
    expect(KILL_CAM_CONSTANTS.REGULAR_ENEMY_CHANCE).toBeLessThan(1);
    expect(KILL_CAM_CONSTANTS.ROTATE_CAM_RADIUS).toBeGreaterThan(0);
  });
});
