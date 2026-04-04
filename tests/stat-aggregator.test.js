/**
 * Tests for js/stat-aggregator.js
 *
 * stat-aggregator.js is an IIFE that exposes:
 *   window.calculateTotalPlayerStats()
 *   window.recalculateAllStats()
 *   window.hardResetGame()
 *
 * calculateTotalPlayerStats() reads window.saveData and applies
 * every upgrade source on top of a base stats object.  We control
 * window.saveData and window.GamePlayer in each test to exercise
 * individual upgrade paths.
 */

beforeAll(() => {
  // Suppress the registration log that the module emits on load.
  jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    require('../js/stat-aggregator.js');
  } finally {
    console.log.mockRestore();
  }
});

// Helper: reset globals to a clean state before each test.
beforeEach(() => {
  delete window.saveData;
  delete window.GamePlayer;
  delete window.SKILL_TREE;
  delete window.playerStats;
});

// Convenience accessor
const calc = () => window.calculateTotalPlayerStats();

// Baseline stats returned when there is no saveData and no GamePlayer.
// The IIFE falls through to its hard-coded Level 1 fallback.
function baseline() {
  delete window.saveData;
  delete window.GamePlayer;
  return calc();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
describe('exports', () => {
  test('exposes calculateTotalPlayerStats on window', () => {
    expect(typeof window.calculateTotalPlayerStats).toBe('function');
  });

  test('exposes recalculateAllStats on window', () => {
    expect(typeof window.recalculateAllStats).toBe('function');
  });

  test('exposes hardResetGame on window', () => {
    expect(typeof window.hardResetGame).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// No saveData — returns base stats
// ---------------------------------------------------------------------------
describe('calculateTotalPlayerStats — no saveData', () => {
  test('returns an object', () => {
    expect(typeof baseline()).toBe('object');
  });

  test('base stats contain expected core fields', () => {
    const s = baseline();
    expect(s).toHaveProperty('maxHp');
    expect(s).toHaveProperty('strength');
    expect(s).toHaveProperty('critChance');
    expect(s).toHaveProperty('atkSpeed');
    expect(s).toHaveProperty('walkSpeed');
  });

  test('returns base maxHp of 100 when no upgrades', () => {
    const s = baseline();
    expect(s.maxHp).toBe(100);
  });

  test('base critChance is 0.10', () => {
    const s = baseline();
    expect(s.critChance).toBeCloseTo(0.10);
  });

  test('hp equals maxHp for a fresh stats object', () => {
    const s = baseline();
    expect(s.hp).toBe(s.maxHp);
  });

  test('returns base stats when saveData is null', () => {
    window.saveData = null;
    const s = calc();
    expect(s.maxHp).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Camp buildings
// ---------------------------------------------------------------------------
describe('calculateTotalPlayerStats — camp buildings', () => {
  function withBuildings(buildings) {
    window.saveData = { campBuildings: buildings };
    return calc();
  }

  describe('armory', () => {
    test('adds 20 HP per level', () => {
      const base = baseline().maxHp;
      const s = withBuildings({ armory: { level: 3 } });
      expect(s.maxHp).toBe(base + 20 * 3);
    });

    test('adds 5 flat armor per level', () => {
      const s = withBuildings({ armory: { level: 2 } });
      expect(s.flatArmor).toBeGreaterThanOrEqual(10);
    });

    test('level 0 has no effect', () => {
      const base = baseline().maxHp;
      const s = withBuildings({ armory: { level: 0 } });
      expect(s.maxHp).toBe(base);
    });
  });

  describe('weaponsmith', () => {
    test('increases strength multiplicatively per level', () => {
      const base = baseline().strength;
      const s = withBuildings({ weaponsmith: { level: 2 } });
      expect(s.strength).toBeCloseTo(base * (1 + 0.03 * 2));
    });

    test('adds weaponDamage bonus per level', () => {
      const s = withBuildings({ weaponsmith: { level: 4 } });
      expect(s.weaponDamage).toBeGreaterThanOrEqual(0.03 * 4);
    });
  });

  describe('shrine', () => {
    test('adds 0.5 HP regen per level', () => {
      const s = withBuildings({ shrine: { level: 2 } });
      expect(s.hpRegenPerSecond).toBeCloseTo(0.5 * 2);
    });

    test('hpRegen alias matches hpRegenPerSecond', () => {
      const s = withBuildings({ shrine: { level: 1 } });
      expect(s.hpRegen).toBe(s.hpRegenPerSecond);
    });
  });

  describe('library', () => {
    test('adds 0.10 xpMultiplier per level', () => {
      const s = withBuildings({ library: { level: 3 } });
      expect(s.xpMultiplier).toBeCloseTo(1.0 + 0.10 * 3);
    });

    test('adds expGainBonus per level', () => {
      const s = withBuildings({ library: { level: 2 } });
      expect(s.expGainBonus).toBeCloseTo(0.10 * 2);
    });
  });

  describe('trainingGrounds', () => {
    test('increases strength and attack speed per level', () => {
      const base = baseline();
      const s = withBuildings({ trainingGrounds: { level: 2 } });
      expect(s.strength).toBeGreaterThan(base.strength);
      expect(s.atkSpeed).toBeGreaterThan(base.atkSpeed);
    });

    test('increases fireRate per level', () => {
      const base = baseline().fireRate;
      const s = withBuildings({ trainingGrounds: { level: 1 } });
      expect(s.fireRate).toBeGreaterThan(base);
    });
  });

  describe('forge', () => {
    test('adds 5% weapon damage per level', () => {
      const base = baseline().strength;
      const s = withBuildings({ forge: { level: 2 } });
      expect(s.strength).toBeCloseTo(base * (1 + 0.05 * 2));
    });
  });

  describe('warehouse', () => {
    test('adds 5% gold multiplier per level', () => {
      const s = withBuildings({ warehouse: { level: 3 } });
      expect(s.goldMultiplier).toBeCloseTo(1.0 + 0.05 * 3);
    });
  });

  describe('companionHouse', () => {
    test('increases companionDamageMult per level', () => {
      // Formula: (companionDamageMult || 1.0) * (1 + 0.10 * level)
      const s = withBuildings({ companionHouse: { level: 2 } });
      expect(s.companionDamageMult).toBeCloseTo(1.0 * (1 + 0.10 * 2));
    });
  });

  describe('skillTree building', () => {
    test('grants bonusSkillPoints equal to building level', () => {
      const s = withBuildings({ skillTree: { level: 3 } });
      expect(s.bonusSkillPoints).toBe(3);
    });
  });

  describe('trainingHall', () => {
    test('adds 5 HP per level', () => {
      const base = baseline().maxHp;
      const s = withBuildings({ trainingHall: { level: 4 } });
      expect(s.maxHp).toBe(base + 5 * 4);
    });
  });
});

// ---------------------------------------------------------------------------
// Permanent upgrade shop (saveData.upgrades)
// ---------------------------------------------------------------------------
describe('calculateTotalPlayerStats — permanent upgrades', () => {
  function withUpgrades(upgrades) {
    window.saveData = { upgrades };
    return calc();
  }

  test('maxHp upgrade adds 25 HP per level', () => {
    const base = baseline().maxHp;
    const s = withUpgrades({ maxHp: 2 });
    expect(s.maxHp).toBe(base + 25 * 2);
  });

  test('hpRegen upgrade adds 0.5 regen per level', () => {
    const s = withUpgrades({ hpRegen: 3 });
    expect(s.hpRegenPerSecond).toBeCloseTo(0.5 * 3);
  });

  test('attackDamage upgrade multiplies strength by (1 + 0.10*n)', () => {
    const base = baseline().strength;
    const s = withUpgrades({ attackDamage: 2 });
    expect(s.strength).toBeCloseTo(base * (1 + 0.10 * 2));
  });

  test('attackSpeed upgrade multiplies atkSpeed by (1 + 0.05*n)', () => {
    const base = baseline().atkSpeed;
    const s = withUpgrades({ attackSpeed: 4 });
    expect(s.atkSpeed).toBeCloseTo(base * (1 + 0.05 * 4));
  });

  test('critChance upgrade adds 0.02 per level (capped at 0.95)', () => {
    const s = withUpgrades({ critChance: 5 });
    expect(s.critChance).toBeCloseTo(Math.min(0.95, 0.10 + 0.02 * 5));
  });

  test('critDamage upgrade adds 0.10 per level', () => {
    const base = baseline().critDmg;
    const s = withUpgrades({ critDamage: 3 });
    expect(s.critDmg).toBeCloseTo(base + 0.10 * 3);
  });

  test('armor upgrade adds 3 flat armor per level', () => {
    const s = withUpgrades({ armor: 4 });
    expect(s.flatArmor).toBeGreaterThanOrEqual(3 * 4);
  });

  test('goldEarned upgrade adds 0.10 gold bonus per level', () => {
    const s = withUpgrades({ goldEarned: 2 });
    expect(s.goldDropBonus).toBeCloseTo(0.10 * 2);
  });

  test('moveSpeed upgrade multiplies walk/top speed by (1 + 0.05*n)', () => {
    const base = baseline();
    const s = withUpgrades({ moveSpeed: 3 });
    expect(s.walkSpeed).toBeCloseTo(base.walkSpeed * (1 + 0.05 * 3));
    expect(s.topSpeed).toBeCloseTo(base.topSpeed * (1 + 0.05 * 3));
  });

  test('cooldownReduction upgrade reduces dashCooldown (capped reduction at 60%)', () => {
    const base = baseline().dashCooldown;
    const s = withUpgrades({ cooldownReduction: 2 });
    const expectedReduction = Math.min(0.60, 0.03 * 2);
    expect(s.dashCooldown).toBeCloseTo(Math.max(0.2, base * (1 - expectedReduction)));
  });

  test('expEarned upgrade adds xpMultiplier and expGainBonus', () => {
    const s = withUpgrades({ expEarned: 3 });
    expect(s.expGainBonus).toBeCloseTo(0.10 * 3);
    expect(s.xpMultiplier).toBeCloseTo(1.0 + 0.10 * 3);
  });
});

// ---------------------------------------------------------------------------
// Progression Center upgrades (saveData.progressionUpgrades)
// ---------------------------------------------------------------------------
describe('calculateTotalPlayerStats — progressionUpgrades', () => {
  function withProgressionUpgrades(pu) {
    window.saveData = { progressionUpgrades: pu };
    return calc();
  }

  test('maxHealth adds 15 HP per level', () => {
    const base = baseline().maxHp;
    const s = withProgressionUpgrades({ maxHealth: { level: 4 } });
    expect(s.maxHp).toBe(base + 15 * 4);
  });

  test('healthRegen adds 0.5 regen per level', () => {
    const s = withProgressionUpgrades({ healthRegen: { level: 2 } });
    expect(s.hpRegenPerSecond).toBeCloseTo(0.5 * 2);
  });

  test('armor adds 3 flat armor per level', () => {
    const s = withProgressionUpgrades({ armor: { level: 3 } });
    expect(s.flatArmor).toBeGreaterThanOrEqual(3 * 3);
  });

  test('baseDamage multiplies strength by (1 + 0.08*n)', () => {
    const base = baseline().strength;
    const s = withProgressionUpgrades({ baseDamage: { level: 2 } });
    expect(s.strength).toBeCloseTo(base * (1 + 0.08 * 2));
  });

  test('attackSpeed multiplies atkSpeed by (1 + 0.05*n)', () => {
    const base = baseline().atkSpeed;
    const s = withProgressionUpgrades({ attackSpeed: { level: 3 } });
    expect(s.atkSpeed).toBeCloseTo(base * (1 + 0.05 * 3));
  });

  test('criticalChance adds 0.015 per level (capped)', () => {
    const s = withProgressionUpgrades({ criticalChance: { level: 5 } });
    expect(s.critChance).toBeCloseTo(Math.min(0.95, 0.10 + 0.015 * 5));
  });

  test('criticalDamage adds 0.10 per level', () => {
    const base = baseline().critDmg;
    const s = withProgressionUpgrades({ criticalDamage: { level: 2 } });
    expect(s.critDmg).toBeCloseTo(base + 0.10 * 2);
  });

  test('moveSpeed multiplies walkSpeed by (1 + 0.04*n)', () => {
    const base = baseline().walkSpeed;
    const s = withProgressionUpgrades({ moveSpeed: { level: 3 } });
    expect(s.walkSpeed).toBeCloseTo(base * (1 + 0.04 * 3));
  });

  test('lifeSteal adds 0.02 per level (capped at 0.50)', () => {
    const s = withProgressionUpgrades({ lifeSteal: { level: 5 } });
    expect(s.lifesteal).toBeCloseTo(Math.min(0.50, 0.02 * 5));
  });

  test('pickupRange adds 0.15 per level', () => {
    const base = baseline().pickupRange;
    const s = withProgressionUpgrades({ pickupRange: { level: 2 } });
    expect(s.pickupRange).toBeCloseTo(base + 0.15 * 2);
  });

  test('goldFind adds 0.10 gold drop bonus per level', () => {
    const s = withProgressionUpgrades({ goldFind: { level: 3 } });
    expect(s.goldDropBonus).toBeCloseTo(0.10 * 3);
  });

  test('experienceGain adds 0.08 xp per level', () => {
    const s = withProgressionUpgrades({ experienceGain: { level: 2 } });
    expect(s.expGainBonus).toBeCloseTo(0.08 * 2);
    expect(s.xpMultiplier).toBeCloseTo(1.0 + 0.08 * 2);
  });

  test('dashCooldown reduces by 5% per level (min 0.2)', () => {
    const base = baseline().dashCooldown;
    const s = withProgressionUpgrades({ dashCooldown: { level: 2 } });
    const expectedRed = Math.min(0.60, 0.05 * 2);
    expect(s.dashCooldown).toBeCloseTo(Math.max(0.2, base * (1 - expectedRed)));
  });
});

// ---------------------------------------------------------------------------
// Attribute points (saveData.attributes)
// ---------------------------------------------------------------------------
describe('calculateTotalPlayerStats — attributes', () => {
  function withAttributes(attributes) {
    window.saveData = { attributes };
    return calc();
  }

  test('strength attribute increases strength stat by 3% per point', () => {
    const base = baseline().strength;
    const s = withAttributes({ strength: 5 });
    expect(s.strength).toBeCloseTo(base * (1 + 5 * 0.03));
  });

  test('strength attribute adds 2 meleeDamage per point', () => {
    const s = withAttributes({ strength: 3 });
    expect(s.meleeDamage).toBeGreaterThanOrEqual(3 * 2);
  });

  test('vitality attribute adds 15 maxHp per point', () => {
    const base = baseline().maxHp;
    const s = withAttributes({ vitality: 4 });
    expect(s.maxHp).toBe(base + 4 * 15);
  });

  test('vitality attribute adds 0.5 regen per point', () => {
    const s = withAttributes({ vitality: 2 });
    expect(s.hpRegenPerSecond).toBeCloseTo(2 * 0.5);
  });

  test('dexterity attribute multiplies atkSpeed by (1 + 0.03*n)', () => {
    const base = baseline().atkSpeed;
    const s = withAttributes({ dexterity: 4 });
    expect(s.atkSpeed).toBeCloseTo(base * (1 + 4 * 0.03));
  });

  test('luck attribute adds 0.02 per point (capped at 1.0)', () => {
    const s = withAttributes({ luck: 10 });
    expect(s.luck).toBe(Math.min(1.0, 10 * 0.02));
  });

  test('luck attribute increases critChance by 0.01 per point', () => {
    const base = baseline().critChance;
    const s = withAttributes({ luck: 5 });
    expect(s.critChance).toBeCloseTo(Math.min(0.95, base + 5 * 0.01));
  });

  test('wisdom attribute increases xpMultiplier by 0.05 per point', () => {
    const s = withAttributes({ wisdom: 4 });
    expect(s.xpMultiplier).toBeCloseTo(1.0 + 4 * 0.05);
  });

  test('endurance attribute adds 10 maxHp per point', () => {
    const base = baseline().maxHp;
    const s = withAttributes({ endurance: 3 });
    expect(s.maxHp).toBe(base + 3 * 10);
  });

  test('endurance attribute increases staggerResistance (capped at 0.90)', () => {
    const s = withAttributes({ endurance: 10 });
    expect(s.staggerResistance).toBeLessThanOrEqual(0.90);
    expect(s.staggerResistance).toBeGreaterThan(0);
  });

  test('flexibility attribute increases inputResponsiveness (capped at 0.50)', () => {
    const s = withAttributes({ flexibility: 50 });
    expect(s.inputResponsiveness).toBe(0.50);
  });

  test('flexibility attribute multiplies turnSpeed per point', () => {
    const base = baseline().turnSpeed;
    const s = withAttributes({ flexibility: 3 });
    expect(s.turnSpeed).toBeCloseTo(base * (1 + 3 * 0.03));
  });
});

// ---------------------------------------------------------------------------
// Equipped Gear (saveData.equippedGear + saveData.inventory)
// ---------------------------------------------------------------------------
describe('calculateTotalPlayerStats — equipped gear', () => {
  function withGear(slotKey, gearStats) {
    const gearId = 'test-item';
    window.saveData = {
      equippedGear: { [slotKey]: gearId },
      inventory: [{ id: gearId, stats: gearStats }]
    };
    return calc();
  }

  test('movementSpeed gear bonus multiplies walkSpeed', () => {
    const base = baseline().walkSpeed;
    const s = withGear('weapon', { movementSpeed: 2 });
    expect(s.walkSpeed).toBeCloseTo(base * (1 + 2 * 0.05));
  });

  test('attackSpeed gear bonus multiplies atkSpeed', () => {
    const base = baseline().atkSpeed;
    const s = withGear('armor', { attackSpeed: 3 });
    expect(s.atkSpeed).toBeCloseTo(base * (1 + 3 * 0.05));
  });

  test('critChance gear bonus adds to critChance (capped at 0.95)', () => {
    const s = withGear('ring', { critChance: 10 });
    expect(s.critChance).toBe(Math.min(0.95, 0.10 + 10 * 0.02));
  });

  test('elementalMagic gear bonus adds elemental damage', () => {
    const s = withGear('ring', { elementalMagic: 5 });
    expect(s.elementalDamage).toBeCloseTo(5 * 0.05);
  });

  test('gear with no stats in inventory is ignored', () => {
    const base = baseline().maxHp;
    window.saveData = {
      equippedGear: { weapon: 'some-id' },
      inventory: [] // item not in inventory
    };
    expect(calc().maxHp).toBe(base);
  });

  test('gear item missing stats field is skipped', () => {
    const base = baseline().walkSpeed;
    const gearId = 'no-stats-item';
    window.saveData = {
      equippedGear: { weapon: gearId },
      inventory: [{ id: gearId }] // no .stats
    };
    expect(calc().walkSpeed).toBeCloseTo(base);
  });

  test('flexibility gear increases inputResponsiveness', () => {
    const s = withGear('gloves', { flexibility: 2 });
    expect(s.inputResponsiveness).toBeGreaterThan(0.07);
  });
});

// ---------------------------------------------------------------------------
// Neural Matrix bonuses (saveData.neuralMatrix)
// ---------------------------------------------------------------------------
describe('calculateTotalPlayerStats — neuralMatrix', () => {
  function withNeural(nm) {
    window.saveData = { neuralMatrix: nm };
    return calc();
  }

  test('atk bonus multiplies strength', () => {
    const base = baseline().strength;
    const s = withNeural({ _statBonuses: { atk: 2 } });
    expect(s.strength).toBeCloseTo(base * (1 + 2 * 0.05));
  });

  test('spd bonus multiplies topSpeed and walkSpeed', () => {
    const base = baseline();
    const s = withNeural({ _statBonuses: { spd: 3 } });
    expect(s.topSpeed).toBeCloseTo(base.topSpeed * (1 + 3 * 0.03));
    expect(s.walkSpeed).toBeCloseTo(base.walkSpeed * (1 + 3 * 0.03));
  });

  test('meleeAtk bonus adds meleeDamage', () => {
    const s = withNeural({ _statBonuses: { meleeAtk: 4 } });
    expect(s.meleeDamage).toBeGreaterThanOrEqual(4 * 3);
  });

  test('rangedAtk bonus adds projectileDamage', () => {
    const s = withNeural({ _statBonuses: { rangedAtk: 2 } });
    expect(s.projectileDamage).toBeGreaterThanOrEqual(2 * 3);
  });

  test('headshotChance bonus adds to critChance (capped 0.95)', () => {
    const base = baseline().critChance;
    const s = withNeural({ _statBonuses: { headshotChance: 3 } });
    expect(s.critChance).toBe(Math.min(0.95, base + 3 * 0.05));
  });

  test('sleepRegen bonus adds HP regen', () => {
    const s = withNeural({ _statBonuses: { sleepRegen: 4 } });
    expect(s.hpRegenPerSecond).toBeCloseTo(4 * 0.5);
  });

  test('annunakiProtocol doubles strength', () => {
    const base = baseline().strength;
    const s = withNeural({ _statBonuses: {}, annunakiProtocol: true });
    expect(s.strength).toBeCloseTo(base * 2);
    expect(s._annunakiActive).toBe(true);
  });

  test('annunakiProtocol false does not double strength', () => {
    const base = baseline().strength;
    const s = withNeural({ _statBonuses: {}, annunakiProtocol: false });
    expect(s.strength).toBeCloseTo(base);
    expect(s._annunakiActive).toBeUndefined();
  });

  test('painSuppression increases maxHp', () => {
    const base = baseline().maxHp;
    const s = withNeural({ painSuppression: 2 });
    expect(s.maxHp).toBeCloseTo(base * (1 + 2 * 0.08));
  });

  test('synapticProcessing multiplies xpMultiplier', () => {
    const s = withNeural({ synapticProcessing: 3 });
    expect(s.xpMultiplier).toBeCloseTo(1.0 * (1 + 3 * 0.06));
  });

  test('adaptiveShielding adds damageReduction', () => {
    const s = withNeural({ adaptiveShielding: 2 });
    expect(s.damageReduction).toBeCloseTo(2 * 0.03);
  });
});

// ---------------------------------------------------------------------------
// Skill tree bonuses (saveData.skillTree + window.SKILL_TREE)
// ---------------------------------------------------------------------------
describe('calculateTotalPlayerStats — skill tree', () => {
  function withSkillTree(skillData, treeDef) {
    window.SKILL_TREE = treeDef;
    window.saveData = { skillTree: skillData };
    return calc();
  }

  test('skill tree is ignored when window.SKILL_TREE is not defined', () => {
    delete window.SKILL_TREE;
    window.saveData = { skillTree: { someSkill: { level: 5 } } };
    const s = calc();
    // Should not throw and should return valid stats
    expect(s.maxHp).toBe(100);
  });

  test('skill with hp bonus increases maxHp', () => {
    const s = withSkillTree(
      { hpSkill: { level: 1 } },
      { hpSkill: { bonus: (lvl) => ({ hp: 20 * lvl }) } }
    );
    expect(s.maxHp).toBe(100 + 20);
  });

  test('skill with hpPercent bonus applies multiplicative HP increase', () => {
    const base = baseline().maxHp;
    const s = withSkillTree(
      { hpPct: { level: 1 } },
      { hpPct: { bonus: () => ({ hpPercent: 0.10 }) } }
    );
    expect(s.maxHp).toBe(Math.floor(base * 1.10));
  });

  test('skill with damage bonus multiplies strength', () => {
    const base = baseline().strength;
    const s = withSkillTree(
      { dmgSkill: { level: 1 } },
      { dmgSkill: { bonus: () => ({ damage: 0.20 }) } }
    );
    expect(s.strength).toBeCloseTo(base * 1.20);
  });

  test('skill with attackSpeed bonus multiplies atkSpeed', () => {
    const base = baseline().atkSpeed;
    const s = withSkillTree(
      { atkSpeedSkill: { level: 1 } },
      { atkSpeedSkill: { bonus: () => ({ attackSpeed: 0.15 }) } }
    );
    expect(s.atkSpeed).toBeCloseTo(base * 1.15);
  });

  test('skill with dashUnlocked sets dashUnlocked to true', () => {
    const s = withSkillTree(
      { dashSkill: { level: 1 } },
      { dashSkill: { bonus: () => ({ dashUnlocked: true }) } }
    );
    expect(s.dashUnlocked).toBe(true);
  });

  test('skill with level 0 is skipped', () => {
    const base = baseline().maxHp;
    const s = withSkillTree(
      { hpSkill: { level: 0 } },
      { hpSkill: { bonus: () => ({ hp: 999 }) } }
    );
    expect(s.maxHp).toBe(base);
  });

  test('skill with regen bonus increases hpRegen', () => {
    const s = withSkillTree(
      { regenSkill: { level: 1 } },
      { regenSkill: { bonus: () => ({ regen: 2.0 }) } }
    );
    expect(s.hpRegen).toBeCloseTo(2.0);
  });

  test('skill with armor bonus increases flatArmor', () => {
    const s = withSkillTree(
      { armorSkill: { level: 1 } },
      { armorSkill: { bonus: () => ({ armor: 10 }) } }
    );
    expect(s.flatArmor).toBeGreaterThanOrEqual(10);
  });

  test('multiple skills are all applied', () => {
    const base = baseline();
    const s = withSkillTree(
      {
        hpSkill:  { level: 1 },
        atkSkill: { level: 1 }
      },
      {
        hpSkill:  { bonus: () => ({ hp: 50 }) },
        atkSkill: { bonus: () => ({ damage: 0.10 }) }
      }
    );
    expect(s.maxHp).toBe(base.maxHp + 50);
    expect(s.strength).toBeCloseTo(base.strength * 1.10);
  });
});

// ---------------------------------------------------------------------------
// Clamp behavior
// ---------------------------------------------------------------------------
describe('calculateTotalPlayerStats — clamping', () => {
  test('critChance is capped at 0.95 regardless of upgrades', () => {
    // Apply enough critChance upgrades to exceed cap
    window.saveData = { upgrades: { critChance: 100 } };
    expect(calc().critChance).toBe(0.95);
  });

  test('armor is capped at 85', () => {
    // Apply huge armor upgrades
    window.saveData = { upgrades: { armor: 100 } };
    expect(calc().armor).toBeLessThanOrEqual(85);
  });

  test('flatArmor is capped at 85', () => {
    window.saveData = { upgrades: { armor: 100 } };
    expect(calc().flatArmor).toBeLessThanOrEqual(85);
  });

  test('dodgeChance is capped at 0.75', () => {
    window.saveData = {
      neuralMatrix: null,
      skillTree: null,
      upgrades: null
    };
    // Even with no upgrades, clamp still applies
    expect(calc().dodgeChance).toBeLessThanOrEqual(0.75);
  });

  test('luck is capped at 1.0', () => {
    window.saveData = { attributes: { luck: 200 } };
    expect(calc().luck).toBe(1.0);
  });

  test('staggerResistance is capped at 0.90', () => {
    window.saveData = { attributes: { endurance: 100 } };
    expect(calc().staggerResistance).toBeLessThanOrEqual(0.90);
  });

  test('percentDamageReduction is capped at 0.75', () => {
    window.saveData = {
      neuralMatrix: { adaptiveShielding: 100 }
    };
    expect(calc().percentDamageReduction).toBeLessThanOrEqual(0.75);
  });

  test('dashCooldown is never reduced below 0.2', () => {
    window.saveData = { upgrades: { cooldownReduction: 100 } };
    expect(calc().dashCooldown).toBeGreaterThanOrEqual(0.2);
  });
});

// ---------------------------------------------------------------------------
// Alias synchronization
// ---------------------------------------------------------------------------
describe('calculateTotalPlayerStats — alias sync', () => {
  // baseline() returns early when saveData is absent, skipping the alias-sync
  // block. Use an empty saveData object so the full function runs.
  function synced() {
    window.saveData = {};
    return calc();
  }

  test('fireRate and gunFireRate are equal after sync', () => {
    const s = synced();
    expect(s.gunFireRate).toBe(s.fireRate);
  });

  test('reloadSpeed and gunReloadSpeed are equal after sync', () => {
    const s = synced();
    expect(s.gunReloadSpeed).toBe(s.reloadSpeed);
  });

  test('aimSpeed and gunAimSpeed are equal after sync', () => {
    const s = synced();
    expect(s.gunAimSpeed).toBe(s.aimSpeed);
  });

  test('projectileFireRate equals fireRate after sync', () => {
    const s = synced();
    expect(s.projectileFireRate).toBe(s.fireRate);
  });

  test('meleeSwingSpeed equals meleeAttackSpeed after sync', () => {
    const s = synced();
    expect(s.meleeSwingSpeed).toBe(s.meleeAttackSpeed);
  });

  test('meleeCleaveAngle equals cleaveAngle after sync', () => {
    const s = synced();
    expect(s.meleeCleaveAngle).toBe(s.cleaveAngle);
  });

  test('hpRegenPerSecond equals hpRegen after sync', () => {
    const s = synced();
    expect(s.hpRegenPerSecond).toBe(s.hpRegen);
  });

  test('critDamageMultiplier equals critDmg after sync', () => {
    const s = synced();
    expect(s.critDamageMultiplier).toBe(s.critDmg);
  });

  test('xpCollectionRadius equals pickupRange after sync', () => {
    const s = synced();
    expect(s.xpCollectionRadius).toBe(s.pickupRange);
  });

  test('dashIframes equals dashInvincibilityFrames after sync', () => {
    const s = synced();
    expect(s.dashIframes).toBe(s.dashInvincibilityFrames);
  });

  test('chainCount equals lightningChainCount after sync', () => {
    const s = synced();
    expect(s.chainCount).toBe(s.lightningChainCount);
  });

  test('goldDropMultiplier is at least 1.0 and equals 1 + goldDropBonus', () => {
    const s = synced();
    expect(s.goldDropMultiplier).toBeGreaterThanOrEqual(1.0);
    expect(s.goldDropMultiplier).toBeCloseTo(1.0 + (s.goldDropBonus || 0));
  });

  test('frictionGrip and friction are consistent', () => {
    const s = synced();
    // frictionGrip > 0 → friction = frictionGrip * 500
    if (s.frictionGrip > 0) {
      expect(s.friction).toBeCloseTo(s.frictionGrip * 500);
    } else {
      // else branch: frictionGrip = friction / 500
      expect(s.frictionGrip).toBeCloseTo((s.friction || 18.0) / 500);
    }
  });

  test('criticalHitChance equals critChance', () => {
    const s = synced();
    expect(s.criticalHitChance).toBe(s.critChance);
  });

  test('criticalHitDamageMulti equals critDmg', () => {
    const s = synced();
    expect(s.criticalHitDamageMulti).toBe(s.critDmg);
  });
});

// ---------------------------------------------------------------------------
// Tutorial dashUnlocked sync
// ---------------------------------------------------------------------------
describe('calculateTotalPlayerStats — tutorial flags', () => {
  test('dashUnlocked is set when tutorial.dashUnlocked is true', () => {
    window.saveData = { tutorial: { dashUnlocked: true } };
    expect(calc().dashUnlocked).toBe(true);
  });

  test('dashUnlocked remains false when tutorial flag is absent', () => {
    window.saveData = { tutorial: {} };
    expect(calc().dashUnlocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// recalculateAllStats
// ---------------------------------------------------------------------------
describe('recalculateAllStats', () => {
  test('writes calculated stats to window.playerStats when no in-run playerStats', () => {
    delete window.playerStats;
    window.saveData = { upgrades: { maxHp: 2 } };
    window.recalculateAllStats();
    expect(window.playerStats).toBeDefined();
    expect(window.playerStats.maxHp).toBeGreaterThan(100);
  });

  test('preserves runtime fields (kills, exp, lvl, gold, survivalTime) when playerStats exists', () => {
    window.saveData = {};
    // Simulate in-run playerStats
    window.playerStats = {
      kills: 42,
      exp: 500,
      expReq: 1000,
      lvl: 5,
      gold: 99,
      survivalTime: 120,
      hp: 80,
      maxHp: 100,
    };
    window.recalculateAllStats();
    expect(window.playerStats.kills).toBe(42);
    expect(window.playerStats.exp).toBe(500);
    expect(window.playerStats.lvl).toBe(5);
    expect(window.playerStats.gold).toBe(99);
    expect(window.playerStats.survivalTime).toBe(120);
  });

  test('clamps current hp to new maxHp after recalculation', () => {
    window.saveData = {};
    window.playerStats = { hp: 9999, maxHp: 100 };
    window.recalculateAllStats();
    expect(window.playerStats.hp).toBeLessThanOrEqual(window.playerStats.maxHp);
  });
});

// ---------------------------------------------------------------------------
// Multiple upgrade sources stacking
// ---------------------------------------------------------------------------
describe('calculateTotalPlayerStats — stacking multiple sources', () => {
  test('HP from multiple sources stacks additively', () => {
    const base = baseline().maxHp; // 100
    window.saveData = {
      campBuildings: { armory: { level: 1 } },    // +20
      upgrades:      { maxHp: 1 },                 // +25
      progressionUpgrades: { maxHealth: { level: 1 } } // +15
    };
    expect(calc().maxHp).toBe(base + 20 + 25 + 15);
  });

  test('attack speed from multiple sources stacks multiplicatively', () => {
    const base = baseline().atkSpeed;
    window.saveData = {
      campBuildings: { trainingGrounds: { level: 1 } }, // *(1+0.03)
      upgrades:      { attackSpeed: 1 },                 // *(1+0.05)
    };
    const s = calc();
    const expected = base * (1 + 0.03) * (1 + 0.05);
    expect(s.atkSpeed).toBeCloseTo(expected);
  });
});
