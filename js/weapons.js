// --- WEAPON DEFINITIONS ---
// Extracted from game.js - loaded as a regular script before game.js (module)
// Exposes window.GameWeapons for use by game.js

/**
 * Returns a fresh initial weapons-state object for a new run.
 * The returned object is mutable so game.js can update cooldowns, levels, etc.
 */
function getDefaultWeapons() {
  return {
    gun:         { active: true,  level: 1, damage: 15, cooldown: 1000, lastShot: 0, range: 12, barrels: 1 },
    sword:       { active: false, level: 0, damage: 30, cooldown: 1500, lastShot: 0, range: 3.5 },
    aura:        { active: false, level: 0, damage: 5,  cooldown: 500,  lastShot: 0, range: 3 },
    meteor:      { active: false, level: 0, damage: 60, cooldown: 2500, lastShot: 0, area: 5 },
    droneTurret: { active: false, level: 0, damage: 12, cooldown: 250,  lastShot: 0, range: 15, droneCount: 1 },
    doubleBarrel:{ active: false, level: 0, damage: 25, cooldown: 1200, lastShot: 0, range: 12, spread: 0.3 },
    iceSpear:    { active: false, level: 0, damage: 20, cooldown: 1500, lastShot: 0, range: 15, slowPercent: 0.4, slowDuration: 2000 },
    fireRing:    { active: false, level: 0, damage: 8,  cooldown: 800,  lastShot: 0, range: 4,  orbs: 3, rotationSpeed: 2 }
  };
}

// Camp-screen upgrade configuration (cost/increment/cap per stat).
// Referenced in game.js as UPGRADES.
const WEAPON_UPGRADES = {
  damage: { name: "Base Damage",  cost: 100, inc: 0.1,  max: 10 },
  health: { name: "Max Health",   cost: 100, inc: 10,   max: 10 },
  speed:  { name: "Move Speed",   cost: 150, inc: 0.05, max: 5  },
  armor:  { name: "Armor",        cost: 200, inc: 2,    max: 10 },
  magnet: { name: "Magnet Range", cost: 100, inc: 0.5,  max: 5  }
};

window.GameWeapons = {
  getDefaultWeapons,
  WEAPON_UPGRADES
};
