// ═══════════════════════════════════════════════════════════════════════════════
// MUZZLE FLASH SYSTEM — Per-Weapon Particle Effects
// ═══════════════════════════════════════════════════════════════════════════════
// Centralized system for weapon-specific muzzle flash visual effects.
// Each weapon has unique:
//   - Flash light colors and intensities
//   - Particle emission patterns (count, colors, velocities)
//   - Smoke characteristics
//   - Special effects (lightning arcs, fire bursts, ice crystals, etc.)
//
// All effects use object pooling to avoid GC pressure during combat.

(function() {
  'use strict';

  // ─── Configuration ──────────────────────────────────────────────────────────

  // Per-weapon muzzle flash configurations
  // Each weapon has: flashLight (PointLight settings) + particles (emission settings) + smoke + special effects
  const WEAPON_FLASH_CONFIG = {
    gun: {
      flashLight: {
        colors: [0xFFFF88, 0xFFCC00, 0xFFFFAA], // Yellow-white variations
        intensity: [4.0, 3.5, 4.5],
        radius: [8, 7, 9],
        duration: 80
      },
      particles: {
        colors: [0xFFFF44, 0xFFFFFF, 0xFF8800], // Yellow sparks, white flash, orange embers
        counts: [4, 2, 2],
        spread: 0.6, // Forward cone spread
        velocity: { min: 0.1, max: 0.3 }
      },
      smoke: {
        count: 3,
        color: 0x666666,
        opacity: 0.5
      }
    },

    doubleBarrel: {
      flashLight: {
        colors: [0xFFAA00, 0xFF8800, 0xFFCC44], // Orange-yellow (hotter than gun)
        intensity: [6.0, 5.5, 6.5],
        radius: [12, 11, 13],
        duration: 100
      },
      particles: {
        colors: [0xFFAA00, 0xFFFFFF, 0xFF4400, 0xFFFF00], // Orange sparks, white flash, red embers, yellow
        counts: [8, 4, 6, 3],
        spread: 1.2, // Wide shotgun spread
        velocity: { min: 0.15, max: 0.4 }
      },
      smoke: {
        count: 5,
        color: 0x555555,
        opacity: 0.6
      }
    },

    sword: {
      flashLight: {
        colors: [0xC0C0C0, 0xFFFFFF, 0x8080FF], // Silver, white, blue tint
        intensity: [3.0, 4.0, 2.5],
        radius: [8, 10, 7],
        duration: 100
      },
      particles: {
        colors: [0xC0C0C0, 0xFFFFFF, 0x8080FF], // Silver slash particles, white sparkles, blue energy
        counts: [8, 5, 3],
        spread: 0.8,
        velocity: { min: 0.12, max: 0.25 }
      },
      smoke: {
        count: 0 // No smoke for melee
      },
      special: 'arc' // Sword creates arc trail
    },

    iceSpear: {
      flashLight: {
        colors: [0x00FFFF, 0x88FFFF, 0x0088FF], // Cyan, light cyan, blue
        intensity: [3.5, 4.0, 3.0],
        radius: [10, 12, 9],
        duration: 120
      },
      particles: {
        colors: [0x00FFFF, 0xFFFFFF, 0x0088FF, 0x44AAFF], // Ice blue, white frost, deep blue, light blue crystals
        counts: [6, 4, 5, 4],
        spread: 0.4,
        velocity: { min: 0.08, max: 0.2 }
      },
      smoke: {
        count: 3,
        color: 0x88CCFF, // Icy mist instead of smoke
        opacity: 0.4
      },
      special: 'iceCrystals' // Floating ice crystal particles
    },

    meteor: {
      flashLight: {
        colors: [0xFF4400, 0xFF8800, 0xFFAA00], // Red-orange-yellow fire
        intensity: [8.0, 7.0, 9.0],
        radius: [15, 14, 16],
        duration: 150
      },
      particles: {
        colors: [0xFF4400, 0xFF8800, 0xFFFF00, 0xFF0000], // Red fire, orange, yellow, deep red
        counts: [12, 10, 8, 6],
        spread: 0.3, // Upward cone
        velocity: { min: 0.2, max: 0.5 }
      },
      smoke: {
        count: 6,
        color: 0x442200, // Dark smoke with fire tint
        opacity: 0.7
      },
      special: 'fireTrail' // Leaves fire trail particles
    },

    fireRing: {
      flashLight: {
        colors: [0xFF6600, 0xFF4400, 0xFF8800], // Orange-red fire ring
        intensity: [5.0, 6.0, 4.5],
        radius: [12, 14, 11],
        duration: 200
      },
      particles: {
        colors: [0xFF6600, 0xFF4400, 0xFFAA00, 0xFF0000], // Orange fire, red embers, yellow flames
        counts: [15, 12, 10, 8],
        spread: 6.28, // Full 360° ring
        velocity: { min: 0.15, max: 0.35 }
      },
      smoke: {
        count: 8,
        color: 0x331100,
        opacity: 0.6
      },
      special: 'circularBurst' // Radial particle burst
    },

    lightning: {
      flashLight: {
        colors: [0x00FFFF, 0xFFFFFF, 0x4488FF], // Electric cyan, white, blue
        intensity: [10.0, 12.0, 9.0],
        radius: [20, 22, 18],
        duration: 60 // Fast flash
      },
      particles: {
        colors: [0x00FFFF, 0xFFFFFF, 0x4488FF, 0x88AAFF], // Electric blue, white sparks, blue energy
        counts: [20, 15, 10, 8],
        spread: 0.2, // Vertical beam
        velocity: { min: 0.3, max: 0.8 }
      },
      smoke: {
        count: 4,
        color: 0x4488AA, // Ionized air
        opacity: 0.3
      },
      special: 'lightningBolt' // Electric arc effect
    },

    poisonCloud: {
      flashLight: {
        colors: [0x00FF00, 0x44FF44, 0x88FF00], // Toxic green
        intensity: [4.0, 3.5, 4.5],
        radius: [14, 16, 13],
        duration: 300 // Long pulsing glow
      },
      particles: {
        colors: [0x00FF00, 0x44FF44, 0x88FF00, 0x00AA00], // Green poison particles
        counts: [10, 8, 6, 5],
        spread: 3.14, // Hemispherical cloud
        velocity: { min: 0.05, max: 0.15 }
      },
      smoke: {
        count: 12,
        color: 0x00AA00, // Toxic green smoke
        opacity: 0.5
      },
      special: 'poisonMist' // Lingering green fog
    },

    homingMissile: {
      flashLight: {
        colors: [0xFF4400, 0xFF8800, 0xFFFF00], // Rocket exhaust colors
        intensity: [6.0, 7.0, 5.5],
        radius: [10, 12, 9],
        duration: 120
      },
      particles: {
        colors: [0xFF4400, 0xFF8800, 0xFFFF00, 0x888888], // Fire, orange, yellow, gray smoke
        counts: [10, 8, 6, 5],
        spread: 0.5,
        velocity: { min: 0.15, max: 0.35 }
      },
      smoke: {
        count: 8,
        color: 0x666666,
        opacity: 0.7
      },
      special: 'rocketExhaust' // Continuous trail
    },

    aura: {
      flashLight: {
        colors: [0xAA00FF, 0xFF00FF, 0x8800FF], // Purple-magenta spiritual energy
        intensity: [3.5, 4.5, 3.0],
        radius: [18, 20, 16], // Large radius for aura
        duration: 250
      },
      particles: {
        colors: [0xAA00FF, 0xFF00FF, 0xFFAAFF, 0x8800FF], // Purple, magenta, pink, deep purple
        counts: [12, 10, 8, 6],
        spread: 6.28, // Omnidirectional
        velocity: { min: 0.08, max: 0.2 }
      },
      smoke: {
        count: 0 // Aura doesn't smoke
      },
      special: 'spiritWaves' // Pulsing wave rings
    },

    droneTurret: {
      flashLight: {
        colors: [0xFF8800, 0xFFAA00, 0xFF6600], // Orange muzzle flash
        intensity: [3.0, 3.5, 2.8],
        radius: [6, 7, 5], // Smaller - it's a drone
        duration: 70
      },
      particles: {
        colors: [0xFFAA00, 0xFFFFFF, 0xFF6600], // Orange sparks, white, red
        counts: [3, 2, 2],
        spread: 0.4,
        velocity: { min: 0.1, max: 0.25 }
      },
      smoke: {
        count: 2,
        color: 0x666666,
        opacity: 0.4
      }
    }
  };

  // ─── Muzzle Flash API ───────────────────────────────────────────────────────

  /**
   * Spawn a complete per-weapon muzzle flash effect (light + particles + smoke + special).
   * @param {string} weaponName - Name of weapon (gun, sword, iceSpear, etc.)
   * @param {THREE.Vector3} position - World position to spawn effect
   * @param {THREE.Vector3} direction - Direction vector (normalized) for directional effects
   * @param {THREE.Scene} scene - THREE.js scene
   */
  window.spawnWeaponMuzzleFlash = function(weaponName, position, direction, scene) {
    const config = WEAPON_FLASH_CONFIG[weaponName];
    if (!config) {
      console.warn(`[MuzzleFlash] No config for weapon: ${weaponName}`);
      return;
    }

    // 1. Spawn flash light (using existing pooled system)
    if (config.flashLight && typeof _acquireFlash === 'function') {
      const isNight = typeof dayNightCycle !== 'undefined'
        ? (dayNightCycle.timeOfDay < 0.2 || dayNightCycle.timeOfDay > 0.8)
        : false;
      const nightMult = isNight ? 1.5 : 1.0;

      // Pick random variation
      const idx = Math.floor(Math.random() * config.flashLight.colors.length);
      const color = config.flashLight.colors[idx];
      const intensity = config.flashLight.intensity[idx] * nightMult;
      const radius = config.flashLight.radius[idx] * (isNight ? 1.3 : 1.0);
      const duration = config.flashLight.duration;

      // Spawn at muzzle position
      const flashPos = position.clone();
      flashPos.y += 1;
      _acquireFlash(scene, color, intensity, radius, flashPos, duration);

      // Ground reflection for night
      if (isNight) {
        const groundFlash = position.clone();
        groundFlash.y = 0.1;
        _acquireFlash(scene, color, intensity * 0.5, radius * 0.7, groundFlash, duration);
      }
    }

    // 2. Spawn particles
    if (config.particles && typeof spawnParticles === 'function') {
      const muzzlePos = position.clone();
      muzzlePos.y += 0.5;

      // Offset muzzle forward in direction
      if (direction) {
        muzzlePos.x += direction.x * 0.6;
        muzzlePos.z += direction.z * 0.6;
      }

      // Spawn each particle color group
      for (let i = 0; i < config.particles.colors.length; i++) {
        const color = config.particles.colors[i];
        const count = config.particles.counts[i];
        spawnParticles(muzzlePos, color, count);
      }
    }

    // 3. Spawn smoke
    if (config.smoke && config.smoke.count > 0 && typeof spawnMuzzleSmoke === 'function') {
      const smokePos = position.clone();
      smokePos.y += 0.5;
      if (direction) {
        smokePos.x += direction.x * 0.6;
        smokePos.z += direction.z * 0.6;
      }
      spawnMuzzleSmoke(smokePos, config.smoke.count);
    }

    // 4. Spawn special effects (future enhancement)
    if (config.special) {
      _spawnSpecialEffect(config.special, position, direction, scene);
    }
  };

  // ─── Special Effects ────────────────────────────────────────────────────────

  function _spawnSpecialEffect(effectType, position, direction, scene) {
    // Special effect handlers for unique weapon visuals
    // These are placeholder hooks for future advanced effects
    switch(effectType) {
      case 'iceCrystals':
        // TODO: Spawn floating ice crystal particles with slower drift
        break;
      case 'fireTrail':
        // TODO: Spawn fire trail that lingers
        break;
      case 'circularBurst':
        // TODO: Radial burst pattern
        break;
      case 'lightningBolt':
        // TODO: Electric arc visual
        break;
      case 'poisonMist':
        // TODO: Lingering green fog cloud
        break;
      case 'rocketExhaust':
        // TODO: Continuous exhaust trail
        break;
      case 'spiritWaves':
        // TODO: Pulsing wave rings
        break;
      case 'arc':
        // Sword slash arc - already handled by SwordSlash class
        break;
    }
  }

  // ─── Simplified Helper Functions ────────────────────────────────────────────

  /**
   * Quick helper for weapons that just need basic flash without full system.
   * Maintains backwards compatibility with existing code.
   */
  window.spawnSimpleMuzzleFlash = function(position, color, scene) {
    if (typeof _acquireFlash === 'function') {
      const flashPos = position.clone();
      flashPos.y += 1;
      _acquireFlash(scene, color || 0xFFFFFF, 4.0, 8, flashPos, 80);
    }
  };

  // Export config for inspection/debugging
  window.MuzzleFlashSystem = {
    config: WEAPON_FLASH_CONFIG,
    spawnWeaponMuzzleFlash: window.spawnWeaponMuzzleFlash,
    spawnSimpleMuzzleFlash: window.spawnSimpleMuzzleFlash
  };

})();
