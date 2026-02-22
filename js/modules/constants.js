// js/modules/constants.js
// Pure game constants — no dependencies

    // --- CONSTANTS & CONFIG ---
    export const COLORS = {
      bg: 0xFFF0F5,
      player: 0x4FC3F7, // Light Blue - more like water droplet
      enemySquare: 0xFF69B4, // Hot Pink
      enemyTriangle: 0xFFD700, // Gold
      enemyRound: 0x9370DB, // Purple
      ground: 0x7CFC00, // Lawn Green (More vibrant)
      forest: 0x98FB98, // Pale Green
      lake: 0x1E90FF, // Dodger Blue (More water-like)
      cabin: 0xDEB887, // Burlywood
      farmland: 0xF0E68C, // Khaki
      exp: 0x5DADE2, // Light Blue (Matching EXP bar)
    };

    export const GAME_CONFIG = {
      playerSpeedBase: 0.12, // Slower as requested
      enemySpeedBase: 0.05,  // Slower as requested
      waveInterval: 300, // Frames between waves (approx 5s)
      expValue: 10,
      baseExpReq: 20,
      // Lake configuration - used for spawn avoidance
      lakeCenterX: 30,
      lakeCenterZ: -30,
      lakeRadius: 18,
      // Performance optimization - Phase 1
      maxEnemiesOnScreen: 70, // Increased from 50 for harder difficulty
      // Movement physics
      accelLerpFactor: 0.12, // Acceleration smoothness
      decelLerpFactor: 0.06, // Deceleration smoothness (glide effect)
      movementLeanFactor: 0.15, // Tilt during movement
      dashLeanFactor: 0.4, // Dramatic tilt during dash
      dashLeanReturnDuration: 200, // ms to return to upright after dash
      // Combat effects
      meteorKnockbackMultiplier: 3, // Knockback strength
      explosionShakeIntensity: 1.5, // Camera shake on explosions
      smokeDurationFrames: 30 // Muzzle smoke lifetime (at 60fps = 0.5s)
    };


    export const MONTANA_QUEST_TRIGGER_DISTANCE = 15;
    export const EIFFEL_QUEST_TRIGGER_DISTANCE = 20;
    export const MAX_SMOKE_PARTICLES = 30;
    export const MAX_DISPOSALS_PER_FRAME = 10;
    export const MAX_BLOOD_DECALS = 80;
    export const MAX_BLOOD_DRIPS = 50;
    export const JOYSTICK_UPDATE_INTERVAL = 16;