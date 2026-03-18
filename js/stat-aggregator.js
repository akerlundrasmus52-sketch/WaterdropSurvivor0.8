// js/stat-aggregator.js — Deep Stat Aggregator (Engine 2.0 Bridge)
// Reads every source of permanent stat upgrades in the Camp and calculates
// the TRUE base playerStats object for the current run.
//
// Sources aggregated (in order):
//   1. Base defaults (getDefaultPlayerStats from player.js)
//   2. Camp Building bonuses (saveData.campBuildings via CAMP_BUILDINGS defs)
//   3. Permanent upgrade purchases (saveData.upgrades — progressionCenter shop)
//   4. Attribute points (saveData.attributes — Training Hall / Achievements)
//   5. Skill Tree (saveData.skillTree via window.SKILL_TREE)
//   6. Equipped Gear (saveData.equippedGear from inventory)
//   7. Neural Matrix nodes (saveData.neuralMatrix._statBonuses)
//
// Exposes:
//   window.calculateTotalPlayerStats()   → returns a complete, ready-to-use stats object
//   window.hardResetGame()               → full wipe + page reload
//   window.recalculateAllStats()         → recalcs and writes into window.playerStats (called after gear change)

(function () {
  'use strict';

  // ── Save key (must match save-system.js) ────────────────────────────────────
  var SAVE_KEY     = 'waterDropSurvivorSave_v2_FreshStart';
  var SETTINGS_KEY = 'waterDropSurvivorSettings';

  // ── Gear stat → playerStats mapping ─────────────────────────────────────────
  // Each entry is [gearStatKey, applierFn(stats, value)]
  var GEAR_MAP = {
    movementSpeed:   function (s, v) {
      s.walkSpeed  = (s.walkSpeed  || 25) * (1 + v * 0.05);
      s.topSpeed   = (s.topSpeed   || 6.5) * (1 + v * 0.05);
      s.baseMovementSpeed = (s.baseMovementSpeed || 1.0) * (1 + v * 0.05);
    },
    attackSpeed: function (s, v) {
      s.atkSpeed          = (s.atkSpeed          || 1.0) * (1 + v * 0.05);
      s.meleeAttackSpeed  = (s.meleeAttackSpeed  || 1.0) * (1 + v * 0.05);
      s.projectileFireRate= (s.projectileFireRate|| 1.0) * (1 + v * 0.05);
      s.fireRate          = (s.fireRate          || 1.0) * (1 + v * 0.05);
    },
    critChance: function (s, v) {
      s.critChance = Math.min(0.95, (s.critChance || 0.10) + v * 0.02);
    },
    flexibility: function (s, v) {
      s.inputResponsiveness = Math.min(0.50, (s.inputResponsiveness || 0.12) + v * 0.02);
      s.turnSpeed           = (s.turnSpeed || 1.0) * (1 + v * 0.05);
    },
    attackPrecision: function (s, v) {
      s.aimSpeed     = (s.aimSpeed     || 1.0) * (1 + v * 0.05);
      s.recoilRecovery = (s.recoilRecovery || 1.0) * (1 + v * 0.03);
    },
    elementalMagic: function (s, v) {
      s.elementalDamage = (s.elementalDamage || 0) + v * 0.05;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // calculateTotalPlayerStats()
  // Returns a fresh stats object with ALL camp upgrades folded in.
  // Does NOT mutate any global — caller must assign to playerStats.
  // ─────────────────────────────────────────────────────────────────────────────
  function calculateTotalPlayerStats() {
    // ── 1. Base defaults ─────────────────────────────────────────────────────
    var stats;
    if (typeof window !== 'undefined' &&
        window.GamePlayer &&
        typeof window.GamePlayer.getDefaultPlayerStats === 'function') {
      stats = window.GamePlayer.getDefaultPlayerStats(30);
    } else if (typeof getDefaultPlayerStats === 'function') {
      stats = getDefaultPlayerStats(30);
    } else {
      // Absolute fallback — absolute minimum for sandbox
      stats = {
        lvl: 1, exp: 0, expReq: 30, hp: 100, maxHp: 100,
        strength: 1, armor: 0, speed: 1, critChance: 0.10, critDmg: 1.5,
        damage: 1, atkSpeed: 1, walkSpeed: 25, kills: 0, hpRegen: 0,
        hpRegenPerSecond: 0, gold: 0, survivalTime: 0, pickupRange: 1.0,
        dropRate: 1.0, auraRange: 1.0, perks: {},
        topSpeed: 6.5, acceleration: 22.0, friction: 18.0, turnSpeed: 1.0,
        inputResponsiveness: 0.12, dashInvincibilityFrames: 8,
        fireRate: 1.0, reloadSpeed: 1.0, recoilRecovery: 1.0, aimSpeed: 1.0,
        magazineCapacity: 5, armorPiercing: 0,
        meleeRange: 1.0, meleeKnockbackPower: 1.0, cleaveAngle: 60,
        flatArmor: 0, evadeChance: 0, staggerResistance: 0,
        xpCollectionRadius: 1.0, luck: 0,
        criticalHitChance: 0.10, criticalHitDamageMulti: 1.5,
        meleeAttackSpeed: 1.0, projectileFireRate: 1.0, projectileSpeed: 1.0,
        projectileSize: 1.0, meleeDamage: 0, projectileDamage: 0,
        dodgeChance: 0, damageReduction: 0, healOnKill: 0,
        lowHpDamage: 0, executeDamage: 0, armorPenetration: 0,
        multiHitChance: 0, weaponDamage: 0,
        fireDamage: 0, iceDamage: 0, lightningDamage: 0, elementalDamage: 0,
        burnChance: 0, slowChance: 0, chainChance: 0, chainCount: 0,
        freezeChance: 0, burnSpread: false, spellEchoChance: 0,
        elementalChain: 0, elementalGuaranteed: false,
        baseMovementSpeed: 1.0, sprintDashSpeed: 1.0,
        lifesteal: 0, dodgeChanceBonus: 0, hpRegenRate: 0,
        goldDropBonus: 0, expGainBonus: 0, itemDropRate: 1.0,
        mobilityScore: 1.0, turnResponse: 1.0, stopResponse: 1.0,
        meleeCooldown: 1.0, skillCooldown: 1.0, dashCooldown: 1.0
      };
    }

    // Grab saveData from global scope (set by main.js / save-system.js)
    var sd = (typeof window !== 'undefined' && window.saveData) ||
             (typeof saveData !== 'undefined' ? saveData : null);

    if (!sd) return stats; // No save data yet — return base stats

    // ── 2. Camp Building bonuses ─────────────────────────────────────────────
    if (sd.campBuildings) {
      var bldgs = sd.campBuildings;

      // Armory: +20 HP / level, +5 flat armor / level
      if (bldgs.armory && bldgs.armory.level > 0) {
        var aLvl = bldgs.armory.level;
        stats.maxHp   += 20 * aLvl;
        stats.flatArmor = (stats.flatArmor || 0) + 5 * aLvl;
        stats.armor     = (stats.armor     || 0) + 5 * aLvl;
      }

      // Weaponsmith: +3% weapon damage / level
      if (bldgs.weaponsmith && bldgs.weaponsmith.level > 0) {
        var wsLvl = bldgs.weaponsmith.level;
        stats.strength = (stats.strength || 1) * (1 + 0.03 * wsLvl);
      }

      // Shrine: +regen / level (0.5 per level, from bonus.regen)
      if (bldgs.shrine && bldgs.shrine.level > 0) {
        var shLvl = bldgs.shrine.level;
        stats.hpRegenPerSecond = (stats.hpRegenPerSecond || 0) + 0.5 * shLvl;
        stats.hpRegen           = (stats.hpRegen           || 0) + 0.5 * shLvl;
      }
    }

    // ── 3. Permanent Upgrade Shop bonuses (saveData.upgrades) ────────────────
    if (sd.upgrades) {
      var upg = sd.upgrades;
      if (upg.maxHp        > 0) { stats.maxHp += 25 * upg.maxHp; }
      if (upg.hpRegen      > 0) {
        stats.hpRegenPerSecond = (stats.hpRegenPerSecond || 0) + 0.5 * upg.hpRegen;
        stats.hpRegen          = (stats.hpRegen          || 0) + 0.5 * upg.hpRegen;
      }
      if (upg.moveSpeed    > 0) {
        var msm = 1 + 0.05 * upg.moveSpeed;
        stats.walkSpeed  = (stats.walkSpeed  || 25)  * msm;
        stats.topSpeed   = (stats.topSpeed   || 6.5) * msm;
        stats.baseMovementSpeed = (stats.baseMovementSpeed || 1.0) * msm;
      }
      if (upg.attackDamage > 0) {
        stats.strength = (stats.strength || 1) * (1 + 0.10 * upg.attackDamage);
      }
      if (upg.attackSpeed  > 0) {
        var asm = 1 + 0.05 * upg.attackSpeed;
        stats.atkSpeed          = (stats.atkSpeed          || 1.0) * asm;
        stats.meleeAttackSpeed  = (stats.meleeAttackSpeed  || 1.0) * asm;
        stats.projectileFireRate= (stats.projectileFireRate|| 1.0) * asm;
        stats.fireRate          = (stats.fireRate          || 1.0) * asm;
      }
      if (upg.critChance   > 0) {
        stats.critChance = Math.min(0.95, (stats.critChance || 0.10) + 0.02 * upg.critChance);
      }
      if (upg.critDamage   > 0) {
        stats.critDmg = (stats.critDmg || 1.5) + 0.10 * upg.critDamage;
      }
      if (upg.armor        > 0) {
        stats.armor     = (stats.armor     || 0) + 3 * upg.armor;
        stats.flatArmor = (stats.flatArmor || 0) + 3 * upg.armor;
      }
      if (upg.cooldownReduction > 0) {
        var cdrm = Math.min(0.60, 0.03 * upg.cooldownReduction);
        stats.dashCooldown   = Math.max(0.2, (stats.dashCooldown   || 1.0) * (1 - cdrm));
        stats.meleeCooldown  = Math.max(0.2, (stats.meleeCooldown  || 1.0) * (1 - cdrm));
        stats.skillCooldown  = Math.max(0.2, (stats.skillCooldown  || 1.0) * (1 - cdrm));
        stats.reloadSpeed    = (stats.reloadSpeed || 1.0) * (1 + cdrm);
      }
      if (upg.goldEarned   > 0) {
        stats.goldDropBonus = (stats.goldDropBonus || 0) + 0.10 * upg.goldEarned;
      }
      if (upg.expEarned    > 0) {
        stats.expGainBonus  = (stats.expGainBonus  || 0) + 0.10 * upg.expEarned;
        stats.xpMultiplier  = (stats.xpMultiplier  || 1.0) + 0.10 * upg.expEarned;
      }
    }

    // ── 4. Attribute points (Training Hall / Achievements) ───────────────────
    if (sd.attributes) {
      var attr = sd.attributes;
      if ((attr.strength || 0) > 0) {
        stats.strength    = (stats.strength    || 1) * (1 + attr.strength * 0.03);
        stats.meleeDamage = (stats.meleeDamage || 0) + attr.strength * 2;
      }
      if ((attr.vitality || 0) > 0) {
        stats.maxHp              += attr.vitality * 15;
        stats.hpRegenPerSecond    = (stats.hpRegenPerSecond || 0) + attr.vitality * 0.5;
        stats.hpRegen             = (stats.hpRegen          || 0) + attr.vitality * 0.5;
      }
      if ((attr.dexterity || 0) > 0) {
        var dm = 1 + attr.dexterity * 0.03;
        stats.atkSpeed          = (stats.atkSpeed          || 1.0) * dm;
        stats.meleeAttackSpeed  = (stats.meleeAttackSpeed  || 1.0) * dm;
        stats.fireRate          = (stats.fireRate          || 1.0) * dm;
        stats.reloadSpeed       = (stats.reloadSpeed       || 1.0) * dm;
        stats.aimSpeed          = (stats.aimSpeed          || 1.0) * dm;
      }
      if ((attr.luck || 0) > 0) {
        stats.luck       = Math.min(1.0, (stats.luck       || 0) + attr.luck * 0.02);
        stats.critChance = Math.min(0.95, (stats.critChance || 0.10) + attr.luck * 0.01);
        stats.itemDropRate = (stats.itemDropRate || 1.0) + attr.luck * 0.05;
      }
      if ((attr.wisdom || 0) > 0) {
        stats.xpMultiplier  = (stats.xpMultiplier  || 1.0) + attr.wisdom * 0.05;
        stats.goldDropBonus = (stats.goldDropBonus  || 0)   + attr.wisdom * 0.02;
      }
      if ((attr.endurance || 0) > 0) {
        stats.maxHp             += attr.endurance * 10;
        stats.staggerResistance  = Math.min(0.90, (stats.staggerResistance || 0) + attr.endurance * 0.03);
        stats.flatArmor          = (stats.flatArmor || 0) + attr.endurance * 1;
      }
      if ((attr.flexibility || 0) > 0) {
        stats.inputResponsiveness = Math.min(0.50, (stats.inputResponsiveness || 0.12) + attr.flexibility * 0.02);
        stats.turnSpeed           = (stats.turnSpeed  || 1.0) * (1 + attr.flexibility * 0.03);
        stats.acceleration        = (stats.acceleration || 22.0) * (1 + attr.flexibility * 0.02);
      }
    }

    // Sync hp after all hp changes up to this point
    stats.hp = stats.maxHp;

    // ── 5. Skill Tree bonuses ────────────────────────────────────────────────
    var TREE = (typeof window !== 'undefined' && window.SKILL_TREE) || null;
    if (sd.skillTree && TREE) {
      var hpFlat = 0, hpPct = 0, regenFlat = 0, armorFlat = 0;
      var dmgMult = 0, critChanceFlat = 0, critDmgFlat = 0;
      var atkSpeedMult = 0, moveSpeedMult = 0;
      var dashCdRed = 0, dashDistMult = 0, cdRed = 0;

      for (var skillId in sd.skillTree) {
        var skData = sd.skillTree[skillId];
        var skLvl  = (skData && skData.level) || 0;
        if (skLvl === 0) continue;

        var skDef = TREE[skillId];
        if (!skDef || typeof skDef.bonus !== 'function') continue;

        var bonus = skDef.bonus(skLvl);

        // Accumulated
        if (bonus.hp)            hpFlat        += bonus.hp;
        if (bonus.hpPercent)     hpPct         += bonus.hpPercent;
        if (bonus.regen)         regenFlat     += bonus.regen;
        if (bonus.armor)         armorFlat     += bonus.armor;
        if (bonus.damage)        dmgMult       += bonus.damage;
        if (bonus.weaponDamage)  dmgMult       += bonus.weaponDamage;
        if (bonus.critChance)    critChanceFlat += bonus.critChance;
        if (bonus.critDamage)    critDmgFlat   += bonus.critDamage;
        if (bonus.attackSpeed)   atkSpeedMult  += bonus.attackSpeed;
        if (bonus.moveSpeed)     moveSpeedMult += bonus.moveSpeed;
        if (bonus.dashCooldown)  dashCdRed     += bonus.dashCooldown;
        if (bonus.dashDistance)  dashDistMult  += bonus.dashDistance;
        if (bonus.cooldown)      cdRed         += bonus.cooldown;

        // Deep granular stats
        if (bonus.fireRate)           stats.fireRate          = (stats.fireRate || 1.0) * (1 + bonus.fireRate);
        if (bonus.reloadSpeed)        stats.reloadSpeed       = (stats.reloadSpeed || 1.0) * (1 + bonus.reloadSpeed);
        if (bonus.aimSpeed)           stats.aimSpeed          = (stats.aimSpeed || 1.0) * (1 + bonus.aimSpeed);
        if (bonus.projectileSpeed)    stats.projectileSpeed   = (stats.projectileSpeed || 1.0) * (1 + bonus.projectileSpeed);
        if (bonus.meleeAttackSpeed)   stats.meleeAttackSpeed  = (stats.meleeAttackSpeed || 1.0) * (1 + bonus.meleeAttackSpeed);
        if (bonus.cleaveAngle)        stats.cleaveAngle       = (stats.cleaveAngle || 60) + bonus.cleaveAngle;
        if (bonus.knockbackPower)     stats.meleeKnockbackPower= (stats.meleeKnockbackPower || 1.0) * (1 + bonus.knockbackPower);
        if (bonus.evadeChance)        stats.evadeChance       = Math.min(0.75, (stats.evadeChance || 0) + bonus.evadeChance);
        if (bonus.staggerResistance)  stats.staggerResistance = Math.min(0.90, (stats.staggerResistance || 0) + bonus.staggerResistance);
        if (bonus.magazineCapacity)   stats.magazineCapacity  = Math.max(1, (stats.magazineCapacity || 5) + bonus.magazineCapacity);

        // Direct fields
        if (bonus.damageReduction)    stats.damageReduction   = Math.min(0.75, (stats.damageReduction || 0) + bonus.damageReduction);
        if (bonus.dodgeChance)        stats.dodgeChance       = Math.min(0.75, (stats.dodgeChance || 0) + bonus.dodgeChance);
        if (bonus.healOnKill)         stats.healOnKill        = (stats.healOnKill || 0) + bonus.healOnKill;
        if (bonus.lowHpDamage)        stats.lowHpDamage       = (stats.lowHpDamage || 0) + bonus.lowHpDamage;
        if (bonus.executeDamage)      stats.executeDamage     = (stats.executeDamage || 0) + bonus.executeDamage;
        if (bonus.armorPenetration)   stats.armorPenetration  = Math.min(0.90, (stats.armorPenetration || 0) + bonus.armorPenetration);
        if (bonus.multiHitChance)     stats.multiHitChance    = Math.min(0.75, (stats.multiHitChance || 0) + bonus.multiHitChance);
        if (bonus.lastStand)          stats.hasLastStand      = true;
        if (bonus.secondWind)         stats.hasSecondWind     = true;
        if (bonus.pickupRange)        stats.pickupRange       = (stats.pickupRange || 1.0) + bonus.pickupRange;
        if (bonus.dropRate)           stats.dropRate          = (stats.dropRate || 1.0) + bonus.dropRate;
        if (bonus.auraRange)          stats.auraRange         = (stats.auraRange || 1.0) + bonus.auraRange;
        if (bonus.fireDamage)         stats.fireDamage        = (stats.fireDamage || 0) + bonus.fireDamage;
        if (bonus.iceDamage)          stats.iceDamage         = (stats.iceDamage || 0) + bonus.iceDamage;
        if (bonus.lightningDamage)    stats.lightningDamage   = (stats.lightningDamage || 0) + bonus.lightningDamage;
        if (bonus.elementalDamage)    stats.elementalDamage   = (stats.elementalDamage || 0) + bonus.elementalDamage;
        if (bonus.burnChance)         stats.burnChance        = (stats.burnChance || 0) + bonus.burnChance;
        if (bonus.slowChance)         stats.slowChance        = (stats.slowChance || 0) + bonus.slowChance;
        if (bonus.chainChance)        stats.chainChance       = (stats.chainChance || 0) + bonus.chainChance;
        if (bonus.chainCount)         stats.chainCount        = (stats.chainCount || 0) + bonus.chainCount;
        if (bonus.freezeChance)       stats.freezeChance      = (stats.freezeChance || 0) + bonus.freezeChance;
        if (bonus.burnSpread)         stats.burnSpread        = true;
        if (bonus.spellEchoChance)    stats.spellEchoChance   = (stats.spellEchoChance || 0) + bonus.spellEchoChance;
        if (bonus.elementalChain)     stats.elementalChain    = (stats.elementalChain || 0) + bonus.elementalChain;
        if (bonus.elementalGuaranteed) stats.elementalGuaranteed = true;
        if (bonus.gold)  stats.goldMultiplier = (stats.goldMultiplier || 1.0) + bonus.gold;
        if (bonus.xp)    stats.xpMultiplier   = (stats.xpMultiplier   || 1.0) + bonus.xp;
      }

      // Apply accumulated skill bonuses
      stats.maxHp += hpFlat;
      if (hpPct > 0) stats.maxHp = Math.floor(stats.maxHp * (1 + hpPct));
      stats.hp = stats.maxHp;

      stats.hpRegen           = (stats.hpRegen          || 0) + regenFlat;
      stats.hpRegenPerSecond  = (stats.hpRegenPerSecond  || 0) + regenFlat;
      stats.armor             = (stats.armor             || 0) + armorFlat;
      stats.flatArmor         = (stats.flatArmor         || 0) + armorFlat;

      if (dmgMult       !== 0) stats.strength  = (stats.strength  || 1) * (1 + dmgMult);
      if (critChanceFlat !== 0) stats.critChance = (stats.critChance || 0.10) + critChanceFlat;
      if (critDmgFlat   !== 0) stats.critDmg    = (stats.critDmg   || 1.5)  + critDmgFlat;

      if (atkSpeedMult !== 0) {
        var am = 1 + atkSpeedMult;
        stats.atkSpeed          = (stats.atkSpeed          || 1.0) * am;
        stats.meleeAttackSpeed  = (stats.meleeAttackSpeed  || 1.0) * am;
        stats.projectileFireRate= (stats.projectileFireRate|| 1.0) * am;
        stats.fireRate          = (stats.fireRate          || 1.0) * am;
      }
      if (moveSpeedMult !== 0) {
        var mm = 1 + moveSpeedMult;
        stats.walkSpeed         = (stats.walkSpeed         || 25)  * mm;
        stats.topSpeed          = (stats.topSpeed          || 6.5) * mm;
        stats.baseMovementSpeed = (stats.baseMovementSpeed || 1.0) * mm;
      }
      var totalDashCd = Math.min(0.80, dashCdRed + cdRed);
      if (totalDashCd > 0) stats.dashCooldown = Math.max(0.2, (stats.dashCooldown || 1.0) * (1 - totalDashCd));
      if (dashDistMult > 0) stats.dashDistance = (stats.dashDistance || 5.0) * (1 + dashDistMult);
    }

    // ── 6. Equipped Gear bonuses ─────────────────────────────────────────────
    if (sd.equippedGear && sd.inventory && sd.inventory.length > 0) {
      for (var slotKey in sd.equippedGear) {
        var gearId = sd.equippedGear[slotKey];
        if (!gearId) continue;
        var gear = null;
        for (var gi = 0; gi < sd.inventory.length; gi++) {
          if (sd.inventory[gi].id === gearId) { gear = sd.inventory[gi]; break; }
        }
        if (!gear || !gear.stats) continue;
        for (var statKey in gear.stats) {
          var applier = GEAR_MAP[statKey];
          if (applier) applier(stats, gear.stats[statKey]);
        }
      }
    }

    // ── 7. Neural Matrix stat bonuses ─────────────────────────────────────────
    if (sd.neuralMatrix && sd.neuralMatrix._statBonuses) {
      var _sb = sd.neuralMatrix._statBonuses;
      if ((_sb.atk || 0) > 0) {
        stats.strength = (stats.strength || 1) * (1 + _sb.atk * 0.05);
      }
      if ((_sb.spd || 0) > 0) {
        var sm = 1 + _sb.spd * 0.03;
        stats.speed     = (stats.speed    || 1)   * sm;
        stats.topSpeed  = (stats.topSpeed || 6.5) * sm;
        stats.walkSpeed = (stats.walkSpeed|| 25)  * sm;
      }
      if ((_sb.meleeAtk || 0) > 0) {
        stats.meleeDamage     = (stats.meleeDamage     || 0) + _sb.meleeAtk * 3;
        stats.meleeAttackSpeed= (stats.meleeAttackSpeed|| 1.0) * (1 + _sb.meleeAtk * 0.03);
      }
      if ((_sb.rangedAtk || 0) > 0) {
        stats.projectileDamage = (stats.projectileDamage || 0) + _sb.rangedAtk * 3;
        stats.fireRate         = (stats.fireRate || 1.0) * (1 + _sb.rangedAtk * 0.03);
      }
      if ((_sb.headshotChance || 0) > 0) {
        stats.critChance = Math.min(0.95, (stats.critChance || 0.10) + _sb.headshotChance * 0.05);
      }
      if ((_sb.sleepRegen || 0) > 0) {
        stats.hpRegenPerSecond = (stats.hpRegenPerSecond || 0) + _sb.sleepRegen * 0.5;
      }
      // Annunaki Protocol — double all damage output
      if (sd.neuralMatrix.annunakiProtocol) {
        stats.strength         = (stats.strength || 1) * 2;
        stats._annunakiActive  = true;
      }
    }

    // ── 8. Profile Account deep stat upgrades ────────────────────────────────
    // Each key in saveData.profileAccount stores the number of upgrade levels
    // purchased in the Profile & Records building. Per-stat increments below.
    if (sd.profileAccount) {
      var pa = sd.profileAccount;

      // Movement & Control
      if ((pa.topSpeed || 0) > 0)
        stats.topSpeed = (stats.topSpeed || 6.5) + pa.topSpeed * 0.3;
      if ((pa.acceleration || 0) > 0)
        stats.acceleration = (stats.acceleration || 22.0) + pa.acceleration * 1.5;
      if ((pa.friction || 0) > 0)
        stats.friction = (stats.friction || 18.0) + pa.friction * 0.8;
      if ((pa.turnSpeed || 0) > 0)
        stats.turnSpeed = (stats.turnSpeed || 1.0) * (1 + pa.turnSpeed * 0.05);
      if ((pa.inputResponsiveness || 0) > 0)
        stats.inputResponsiveness = Math.min(0.5, (stats.inputResponsiveness || 0.12) + pa.inputResponsiveness * 0.01);

      // Gunplay / Ranged
      if ((pa.fireRate || 0) > 0)
        stats.fireRate = (stats.fireRate || 1.0) * (1 + pa.fireRate * 0.08);
      if ((pa.reloadSpeed || 0) > 0)
        stats.reloadSpeed = (stats.reloadSpeed || 1.0) * (1 + pa.reloadSpeed * 0.10);
      if ((pa.aimSpeed || 0) > 0)
        stats.aimSpeed = (stats.aimSpeed || 1.0) * (1 + pa.aimSpeed * 0.08);
      if ((pa.projectileSpeed || 0) > 0)
        stats.projectileSpeed = (stats.projectileSpeed || 1.0) * (1 + pa.projectileSpeed * 0.08);
      if ((pa.magazineCapacity || 0) > 0)
        stats.magazineCapacity = Math.max(1, (stats.magazineCapacity || 5) + pa.magazineCapacity);

      // Melee / Close Combat
      if ((pa.meleeAttackSpeed || 0) > 0)
        stats.meleeAttackSpeed = (stats.meleeAttackSpeed || 1.0) * (1 + pa.meleeAttackSpeed * 0.07);
      if ((pa.cleaveAngle || 0) > 0)
        stats.cleaveAngle = (stats.cleaveAngle || 60) + pa.cleaveAngle * 5;
      if ((pa.knockbackPower || 0) > 0)
        stats.meleeKnockbackPower = (stats.meleeKnockbackPower || 1.0) * (1 + pa.knockbackPower * 0.10);
      if ((pa.meleeRange || 0) > 0)
        stats.meleeRange = (stats.meleeRange || 1.0) * (1 + pa.meleeRange * 0.08);

      // Survivability
      if ((pa.maxHp || 0) > 0) {
        stats.maxHp += pa.maxHp * 20;
        stats.hp     = stats.maxHp;
      }
      if ((pa.hpRegen || 0) > 0) {
        stats.hpRegen          = (stats.hpRegen          || 0) + pa.hpRegen * 0.5;
        stats.hpRegenPerSecond = (stats.hpRegenPerSecond || 0) + pa.hpRegen * 0.5;
      }
      if ((pa.flatArmor || 0) > 0) {
        stats.flatArmor = (stats.flatArmor || 0) + pa.flatArmor * 4;
        stats.armor     = (stats.armor     || 0) + pa.flatArmor * 4;
      }
      if ((pa.evadeChance || 0) > 0)
        stats.evadeChance = Math.min(0.60, (stats.evadeChance || 0) + pa.evadeChance * 0.02);
      if ((pa.staggerResistance || 0) > 0)
        stats.staggerResistance = Math.min(0.75, (stats.staggerResistance || 0) + pa.staggerResistance * 0.03);

      // Offense (granular)
      if ((pa.meleeDamage || 0) > 0)
        stats.meleeDamage = (stats.meleeDamage || 0) + pa.meleeDamage * 3;
      if ((pa.projectileDamage || 0) > 0)
        stats.projectileDamage = (stats.projectileDamage || 0) + pa.projectileDamage * 3;
      if ((pa.critChance || 0) > 0)
        stats.critChance = Math.min(0.85, (stats.critChance || 0.10) + pa.critChance * 0.02);
      if ((pa.critDamage || 0) > 0)
        stats.critDmg = (stats.critDmg || 1.5) + pa.critDamage * 0.10;
      if ((pa.armorPiercing || 0) > 0)
        stats.armorPenetration = Math.min(0.80, (stats.armorPenetration || 0) + pa.armorPiercing * 0.05);

      // Utility
      if ((pa.luck || 0) > 0)
        stats.luck = Math.min(1.0, (stats.luck || 0) + pa.luck * 0.03);
      if ((pa.xpCollectionRadius || 0) > 0)
        stats.pickupRange = (stats.pickupRange || 1.0) + pa.xpCollectionRadius * 0.08;
      if ((pa.goldDropBonus || 0) > 0)
        stats.goldDropBonus = (stats.goldDropBonus || 0) + pa.goldDropBonus * 0.05;
      if ((pa.expGainBonus || 0) > 0) {
        stats.expGainBonus = (stats.expGainBonus || 0) + pa.expGainBonus * 0.05;
        stats.xpMultiplier = (stats.xpMultiplier || 1.0) + pa.expGainBonus * 0.05;
      }

      // Elemental
      if ((pa.fireDamage || 0) > 0)
        stats.fireDamage = (stats.fireDamage || 0) + pa.fireDamage * 0.05;
      if ((pa.iceDamage || 0) > 0)
        stats.iceDamage = (stats.iceDamage || 0) + pa.iceDamage * 0.05;
      if ((pa.lightningDamage || 0) > 0)
        stats.lightningDamage = (stats.lightningDamage || 0) + pa.lightningDamage * 0.05;

      // Cooldowns
      if ((pa.dashCooldown || 0) > 0) {
        var dcRed = Math.min(0.60, pa.dashCooldown * 0.05);
        stats.dashCooldown  = Math.max(0.2, (stats.dashCooldown  || 1.0) * (1 - dcRed));
        stats.skillCooldown = Math.max(0.2, (stats.skillCooldown || 1.0) * (1 - dcRed));
      }
      if ((pa.skillCooldown || 0) > 0) {
        var scRed = Math.min(0.60, pa.skillCooldown * 0.05);
        stats.skillCooldown = Math.max(0.2, (stats.skillCooldown || 1.0) * (1 - scRed));
      }
    }

    // ── Clamp & sync aliases ─────────────────────────────────────────────────
    stats.armor    = Math.min(85,   stats.armor    || 0);
    stats.flatArmor= Math.min(85,   stats.flatArmor|| 0);
    stats.critChance = Math.min(0.95, stats.critChance || 0.10);
    stats.dodgeChance = Math.min(0.75, stats.dodgeChance || 0);
    stats.evadeChance = Math.min(0.75, stats.evadeChance || 0);
    stats.luck        = Math.min(1.0,  stats.luck       || 0);
    stats.staggerResistance = Math.min(0.90, stats.staggerResistance || 0);

    stats.criticalHitChance       = stats.critChance;
    stats.criticalHitDamageMulti  = stats.critDmg || 1.5;
    stats.xpCollectionRadius      = stats.pickupRange || 1.0;
    stats.mobilityScore           = stats.turnResponse || 1.0;

    // Ensure hpRegen and hpRegenPerSecond are synced
    stats.hpRegen = Math.max(stats.hpRegen || 0, stats.hpRegenPerSecond || 0);

    return stats;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // recalculateAllStats()
  // Recalculates and injects into the global playerStats.
  // Called automatically whenever gear is changed (equipGear hook in save-system.js).
  // ─────────────────────────────────────────────────────────────────────────────
  function recalculateAllStats() {
    var fresh = calculateTotalPlayerStats();
    // Update the global playerStats object in-place (preserve run-time mutable
    // fields like kills, survivalTime, exp that accumulate during a run)
    if (typeof playerStats !== 'undefined' && playerStats !== null) {
      // Preserve volatile run-time fields
      var keepKills    = playerStats.kills        || 0;
      var keepExp      = playerStats.exp          || 0;
      var keepExpReq   = playerStats.expReq       || 30;
      var keepLvl      = playerStats.lvl          || 1;
      var keepGold     = playerStats.gold         || 0;
      var keepTime     = playerStats.survivalTime || 0;
      var keepHp       = playerStats.hp;  // keep current HP (don't force to maxHp mid-run)

      Object.assign(playerStats, fresh);

      // Restore volatile fields
      playerStats.kills        = keepKills;
      playerStats.exp          = keepExp;
      playerStats.expReq       = keepExpReq;
      playerStats.lvl          = keepLvl;
      playerStats.gold         = keepGold;
      playerStats.survivalTime = keepTime;
      // Clamp current HP to new maxHp
      if (keepHp !== undefined) {
        playerStats.hp = Math.min(keepHp, playerStats.maxHp);
      }
    } else if (typeof window !== 'undefined') {
      // No in-run playerStats — just write to window so sandbox can pick it up
      window.playerStats = fresh;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // hardResetGame()
  // Complete wipe: clears localStorage, resets saveData to defaults, reloads.
  // ─────────────────────────────────────────────────────────────────────────────
  function hardResetGame() {
    if (!confirm(
      '⚠️  HARD RESET — ARE YOU SURE?\n\n' +
      'This will PERMANENTLY delete:\n' +
      '• All camp buildings & upgrades\n' +
      '• All skill tree progress\n' +
      '• All gear, inventory & quests\n' +
      '• All gold, XP and achievements\n' +
      '• All account level & stats\n\n' +
      'The game will reload fresh from Level 0.\n\n' +
      'Click OK to wipe everything.'
    )) return;

    // Second safety confirm
    if (!confirm(
      'FINAL CONFIRMATION\n\n' +
      'All progress will be lost forever.\n' +
      'Proceed with Hard Reset?'
    )) return;

    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(SETTINGS_KEY);
    } catch (e) {
      console.warn('[hardResetGame] localStorage error:', e);
    }

    // Reset in-memory saveData if accessible
    if (typeof window !== 'undefined') {
      if (typeof defaultSaveData !== 'undefined') {
        var fresh = JSON.parse(JSON.stringify(defaultSaveData));
        if (typeof saveData !== 'undefined') {
          try { window.saveData = fresh; } catch (_) {}
        }
        if (window.GameState) window.GameState.saveData = fresh;
      }
      // Re-save (writes fresh empty state) then reload
      if (typeof saveSaveData === 'function') {
        try { saveSaveData(); } catch (_) {}
      }
      window.location.reload();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Expose to global scope
  // ─────────────────────────────────────────────────────────────────────────────
  window.calculateTotalPlayerStats = calculateTotalPlayerStats;
  window.recalculateAllStats       = recalculateAllStats;
  window.hardResetGame             = hardResetGame;

  console.log('[StatAggregator] calculateTotalPlayerStats, recalculateAllStats, hardResetGame registered.');

}());
