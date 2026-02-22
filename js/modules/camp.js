// js/modules/camp.js
// Camp screen, buildings, skill tree, passive skills, training
    import { gs, gameSettings, playerStats, weapons } from './state.js';
    import { saveSaveData } from './save.js';
    import { playSound } from './audio.js';
    import { updateAchievementsScreen } from './achievements.js';
    import { updateAttributesScreen } from './attributes.js';
    import { updateGearScreen } from './gear.js';

    // --- LORE SYSTEM ---
    const LORE_DATABASE = {
      landmarks: {
        windmill: {
          name: 'The Forgotten Windmill',
          icon: '🏚️',
          description: 'An ancient windmill that once powered a thriving village. Now it stands as a monument to a forgotten time.',
          unlockCondition: 'Defeat the Windmill Boss',
          story: 'Legend says this windmill was built by the first settlers who discovered the water droplets\' mystical properties. The machinery inside still turns, grinding something unseen...'
        },
        montana: {
          name: 'Montana Memorial',
          icon: '🗿',
          description: 'A massive stone statue honoring the fallen warriors of the Great Water War.',
          unlockCondition: 'Complete Montana Quest',
          story: 'The Montana stands watch over the battlefield where water droplets first united against the cube invasion. Its eyes are said to glow blue during the full moon.'
        },
        eiffel: {
          name: 'Eiffel Energy Tower',
          icon: '🗼',
          description: 'A towering structure that harnesses electrical energy from storm clouds.',
          unlockCondition: 'Complete Eiffel Tower Quest',
          story: 'Built by a genius engineer who sought to weaponize lightning itself. The tower still crackles with power, attracting the most dangerous gs.enemies.'
        },
        stonehenge: {
          name: 'Ancient Stonehenge',
          icon: '⭕',
          description: 'A mysterious circle of ancient stones that pulse with unknown energy.',
          unlockCondition: 'Discover Stonehenge',
          story: 'These stones predate even the water droplets. Some say they are portals to other realms, while others believe they hold the secret to immortality...'
        },
        pyramids: {
          name: 'Desert Pyramids',
          icon: '🔺',
          description: 'Three massive pyramids that hide ancient treasures and deadly traps.',
          unlockCondition: 'Explore the Desert',
          story: 'Built by an advanced civilization that worshipped the sun. Deep within lies the legendary Eternal Cigar, said to grant unlimited power.'
        }
      },
      enemies: {
        square: {
          name: 'Cube Soldier',
          icon: '🟥',
          description: 'Basic geometric gs.enemies that hunt in swarms.',
          story: 'Created from crystallized anger, these cubes seek to absorb all water to feed their master.'
        },
        triangle: {
          name: 'Spike Warrior',
          icon: '🔺',
          description: 'Sharp and aggressive, they attack with piercing precision.',
          story: 'Formed from shattered weapons of fallen heroes, they carry the rage of those who fell before you.'
        },
        round: {
          name: 'Sphere Hunter',
          icon: '🔵',
          description: 'Fast-moving orbs that roll through the battlefield.',
          story: 'Born from compressed emotions, these spheres are drawn to the tears of water droplets.'
        }
      },
      bosses: {
        windmillBoss: {
          name: 'The Grinder',
          icon: '⚙️',
          description: 'A massive mechanical horror powered by the windmill itself.',
          story: 'The corrupted soul of the windmill\'s creator, trapped in eternal machinery.'
        }
      },
      buildings: {
        skillTree: {
          name: 'Tree of Knowledge',
          icon: '🌳',
          description: 'An ancient tree that grants wisdom and power to those who study its branches.',
          story: 'This tree grew from a single water droplet that absorbed centuries of knowledge. Each skill you unlock is a branch of understanding.'
        },
        forge: {
          name: 'The Eternal Forge',
          icon: '🔨',
          description: 'A forge that never cools, capable of crafting legendary equipment.',
          story: 'Fueled by the heat of a thousand defeated gs.enemies, this forge can shape even the hardest materials.'
        },
        companionHouse: {
          name: 'Companion Sanctuary',
          icon: '🏡',
          description: 'A safe haven where loyal companions rest and grow stronger.',
          story: 'Built on the site where the first water droplet befriended a wild beast. The bond forged here is unbreakable.'
        }
      }
    };
    
    // --- CAMP SYSTEM ---
    const CAMP_BUILDINGS = {
      // FREE BUILDINGS (unlocked on first camp visit after first death)
      questMission: {
        name: 'Quest & Mission Hall',
        icon: '📜',
        description: 'Start main story quests and missions',
        baseCost: 0, // Free
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        isCore: true, // Core building, always available
        bonus: (level) => ({
          // No stats bonus, provides quest functionality
        })
      },
      inventory: {
        name: 'Inventory Storage',
        icon: '📦',
        description: 'Store earned items and equipment',
        baseCost: 0, // Free
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        isCore: true,
        bonus: (level) => ({
          // No stats bonus, provides storage
        })
      },
      campHub: {
        name: 'Camp Hub',
        icon: '🏠',
        description: 'Central hub for all camp activities',
        baseCost: 0, // Free
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        isCore: true,
        bonus: (level) => ({
          // No stats bonus, central access point
        })
      },
      
      // PAID BUILDINGS (250g base cost unless noted)
      skillTree: {
        name: 'Skill Tree',
        icon: '🌳',
        description: 'Unlock powerful skill upgrades and abilities',
        baseCost: 250,
        costMultiplier: 1.8,
        maxCost: 100000,
        bonus: (level) => ({
          skillPoints: Math.floor(level / 2) // +1 skill point every 2 levels
        })
      },
      companionHouse: {
        name: 'Companion House',
        icon: '🐺',
        description: 'House and upgrade companions. Higher levels unlock better companions',
        baseCost: 250,
        costMultiplier: 1.8,
        maxCost: 100000,
        bonus: (level) => {
          // Unlock companions at certain levels
          const unlocks = [];
          if (level >= 3) unlocks.push('Uncommon companions');
          if (level >= 5) unlocks.push('Rare companions');
          if (level >= 7) unlocks.push('Epic companions');
          if (level >= 10) unlocks.push('Legendary companions');
          return {
            companionDamage: 0.1 * level, // +10% companion damage per level
            unlocks: unlocks.join(', ') || 'Basic companions'
          };
        }
      },
      forge: {
        name: 'Forge',
        icon: '⚒️',
        description: 'Craft and upgrade weapons. Higher tiers unlock better rarities',
        baseCost: 250,
        costMultiplier: 1.8,
        maxCost: 100000,
        bonus: (level) => {
          // Unlock crafting tiers
          let tier = 'Common';
          if (level >= 2) tier = 'Common, Uncommon';
          if (level >= 4) tier = 'Common, Uncommon, Rare';
          if (level >= 6) tier = 'Common, Uncommon, Rare, Epic';
          if (level >= 8) tier = 'Common, Uncommon, Rare, Epic, Legendary';
          if (level >= 10) tier = 'Common, Uncommon, Rare, Epic, Legendary, Mythic';
          return {
            craftingTier: tier
          };
        }
      },
      armory: {
        name: 'Armory',
        icon: '🛡️',
        description: 'Store and upgrade gear. Higher levels unlock better rarities',
        baseCost: 250,
        costMultiplier: 1.8,
        maxCost: 100000,
        bonus: (level) => {
          let tier = 'Common';
          if (level >= 2) tier = 'Uncommon';
          if (level >= 4) tier = 'Rare';
          if (level >= 6) tier = 'Epic';
          if (level >= 8) tier = 'Legendary';
          if (level >= 10) tier = 'Mythic';
          return {
            hp: 20 * level, // +20 HP per level
            armor: 5 * level, // +5 armor per level
            gearTier: tier
          };
        }
      },
      trainingHall: {
        name: 'Training Hall',
        icon: '🏋️',
        description: 'Train attributes with daily training points (Strength, Endurance, Flexibility)',
        baseCost: 250,
        costMultiplier: 1.8,
        maxCost: 100000,
        bonus: (level) => ({
          trainingEfficiency: 0.05 * level // +5% attribute gain per level
        })
      },
      
      // ADDITIONAL BUILDINGS
      trashRecycle: {
        name: 'Trash & Recycle',
        icon: '♻️',
        description: 'Scrap old gear to materials. Fuse/infuse gear for better stats',
        baseCost: 300,
        costMultiplier: 1.7,
        maxCost: 100000,
        bonus: (level) => ({
          recycleValue: 0.1 * level, // +10% recycle value per level
          fusionPower: 0.05 * level // +5% fusion bonus per level
        })
      },
      tempShop: {
        name: 'Temporary Items Shop',
        icon: '🏪',
        description: 'Buy one-run temporary power-ups and consumables',
        baseCost: 200,
        costMultiplier: 1.6,
        maxCost: 100000,
        bonus: (level) => ({
          shopDiscount: 0.05 * level, // +5% discount per level
          itemVariety: level // More items available per level
        })
      },
      
      // LEGACY BUILDINGS (kept for compatibility)
      trainingGrounds: {
        name: 'Training Grounds (Legacy)',
        icon: '🏋️',
        description: 'Train your combat skills (legacy system)',
        baseCost: 100,
        costMultiplier: 1.5,
        maxCost: 100000,
        isLegacy: true, // Hidden from new players
        bonus: (level) => ({
          damage: 0.05 * level,
          attackSpeed: 0.03 * level
        })
      },
      library: {
        name: 'Library',
        icon: '📚',
        description: 'Study ancient knowledge',
        baseCost: 200,
        costMultiplier: 1.5,
        maxCost: 100000,
        skillPointLevelInterval: 3,
        bonus: (level) => ({
          xp: 0.1 * level,
          skillPoints: Math.floor(level / 3)
        })
      },
      workshop: {
        name: 'Workshop',
        icon: '🔧',
        description: 'Craft better equipment',
        baseCost: 175,
        costMultiplier: 1.5,
        maxCost: 100000,
        bonus: (level) => ({
          critChance: 0.02 * level,
          critDamage: 0.1 * level
        })
      },
      shrine: {
        name: 'Shrine',
        icon: '⭐',
        description: 'Commune with spirits',
        baseCost: 250,
        costMultiplier: 1.5,
        maxCost: 100000,
        bonus: (level) => ({
          gold: 0.1 * level,
          regen: 0.5 * level
        })
      }
    };

    const SKILL_TREE = {
      // STARTING SKILLS - Available first (Dash and Critical Focus as base skills)
      dash: {
        id: 'dash',
        name: 'Dash',
        path: 'utility',
        requires: null,
        maxLevel: 5,
        cost: 1,
        description: 'Quick dodge in movement direction',
        bonus: (level) => ({
          dashCooldown: 0.2 * level
        })
      },
      criticalFocus: {
        name: '🎯 Critical Focus',
        description: '+10% crit chance, +15% crit damage',
        cost: 1,
        maxLevel: 5,
        requires: null,
        bonus: (level) => ({
          critChance: 0.1 * level,
          critDamage: 0.15 * level
        })
      },
      autoAim: {
        name: '🎯 Auto-Aim',
        description: 'Enables automatic targeting of nearest gs.enemies. Toggle in Settings > Auto-Aim.',
        cost: 1,
        maxLevel: 1,
        requires: null,
        bonus: (level) => ({ autoAim: level > 0 })
      },
      dashMaster: {
        name: '🏃 Dash Master',
        description: 'Reduce dash cooldown by 15%, increase dash distance by 10%',
        cost: 1,
        maxLevel: 3,
        requires: 'dash',
        bonus: (level) => ({
          dashCooldown: 0.15 * level,
          dashDistance: 0.1 * level
        })
      },
      headshot: {
        id: 'headshot',
        name: 'Headshot',
        path: 'combat',
        requires: 'criticalFocus',
        maxLevel: 5,
        cost: 1,
        description: 'Double-crit = instant kill',
        bonus: (level) => ({
          critChance: 0.05 * level
        })
      },
      
      // COMBAT PATH (12 skills) - Unlocked after initial skills
      combatMastery: {
        name: 'Combat Mastery',
        description: '+10% damage, +5% crit chance',
        cost: 1,
        maxLevel: 5,
        requires: 'dashMaster',
        bonus: (level) => ({
          damage: 0.1 * level,
          critChance: 0.05 * level
        })
      },
      bladeDancer: {
        name: 'Blade Dancer',
        description: '+8% attack speed, +5% move speed',
        cost: 1,
        maxLevel: 3,
        requires: 'combatMastery',
        bonus: (level) => ({
          attackSpeed: 0.08 * level,
          moveSpeed: 0.05 * level
        })
      },
      heavyStrike: {
        name: 'Heavy Strike',
        description: '+15% damage, -5% attack speed',
        cost: 1,
        maxLevel: 3,
        requires: 'combatMastery',
        bonus: (level) => ({
          damage: 0.15 * level,
          attackSpeed: -0.05 * level
        })
      },
      rapidFire: {
        name: 'Rapid Fire',
        description: '+12% attack speed',
        cost: 1,
        maxLevel: 3,
        requires: 'bladeDancer',
        bonus: (level) => ({
          attackSpeed: 0.12 * level
        })
      },
      armorPierce: {
        name: 'Armor Pierce',
        description: 'Ignore 15% of enemy armor',
        cost: 1,
        maxLevel: 3,
        requires: 'heavyStrike',
        bonus: (level) => ({
          armorPenetration: 0.15 * level
        })
      },
      multiHit: {
        name: 'Multi-Hit',
        description: '5% chance to hit twice',
        cost: 1,
        maxLevel: 3,
        requires: 'rapidFire',
        bonus: (level) => ({
          multiHitChance: 0.05 * level
        })
      },
      executioner: {
        name: 'Executioner',
        description: '+20% damage to gs.enemies below 30% HP',
        cost: 1,
        maxLevel: 3,
        requires: 'criticalFocus',
        bonus: (level) => ({
          executeDamage: 0.2 * level
        })
      },
      bloodlust: {
        name: 'Bloodlust',
        description: 'Heal 5 HP on kill',
        cost: 1,
        maxLevel: 3,
        requires: 'executioner',
        bonus: (level) => ({
          healOnKill: 5 * level
        })
      },
      berserker: {
        name: 'Berserker',
        description: '+10% damage when below 50% HP',
        cost: 1,
        maxLevel: 3,
        requires: 'bloodlust',
        bonus: (level) => ({
          lowHpDamage: 0.1 * level
        })
      },
      weaponSpecialist: {
        name: 'Weapon Specialist',
        description: '+8% all weapon damage',
        cost: 1,
        maxLevel: 5,
        requires: 'multiHit',
        bonus: (level) => ({
          weaponDamage: 0.08 * level
        })
      },
      combatVeteran: {
        name: 'Combat Veteran',
        description: '+12% damage, +8% attack speed',
        cost: 1,
        maxLevel: 3,
        requires: 'weaponSpecialist',
        bonus: (level) => ({
          damage: 0.12 * level,
          attackSpeed: 0.08 * level
        })
      },
      
      // DEFENSE PATH (12 skills)
      survivalist: {
        name: 'Survivalist',
        description: '+15 HP, +1 HP/sec regen',
        cost: 1,
        maxLevel: 5,
        requires: 'criticalFocus',
        bonus: (level) => ({
          hp: 15 * level,
          regen: 1 * level
        })
      },
      ironSkin: {
        name: 'Iron Skin',
        description: '+10 armor',
        cost: 1,
        maxLevel: 3,
        requires: 'survivalist',
        bonus: (level) => ({
          armor: 10 * level
        })
      },
      quickReflex: {
        name: 'Quick Reflex',
        description: '+5% dodge chance',
        cost: 1,
        maxLevel: 3,
        requires: 'survivalist',
        bonus: (level) => ({
          dodgeChance: 0.05 * level
        })
      },
      fortification: {
        name: 'Fortification',
        description: '+10 armor, +5% damage reduction',
        cost: 1,
        maxLevel: 5,
        requires: 'ironSkin',
        bonus: (level) => ({
          armor: 10 * level,
          damageReduction: 0.05 * level
        })
      },
      regeneration: {
        name: 'Regeneration',
        description: '+2 HP/sec regen',
        cost: 1,
        maxLevel: 3,
        requires: 'survivalist',
        bonus: (level) => ({
          regen: 2 * level
        })
      },
      lastStand: {
        name: 'Last Stand',
        description: 'Survive fatal blow with 1 HP (once per run)',
        cost: 1,
        maxLevel: 1,
        requires: 'fortification',
        bonus: (level) => ({
          lastStand: level > 0
        })
      },
      toughness: {
        name: 'Toughness',
        description: '+25 max HP',
        cost: 1,
        maxLevel: 3,
        requires: 'regeneration',
        bonus: (level) => ({
          hp: 25 * level
        })
      },
      guardian: {
        name: 'Guardian',
        description: '+8% damage reduction',
        cost: 1,
        maxLevel: 3,
        requires: 'fortification',
        bonus: (level) => ({
          damageReduction: 0.08 * level
        })
      },
      resilience: {
        name: 'Resilience',
        description: '+15% max HP',
        cost: 1,
        maxLevel: 3,
        requires: 'toughness',
        bonus: (level) => ({
          hpPercent: 0.15 * level
        })
      },
      secondWind: {
        name: 'Second Wind',
        description: 'Heal 30% HP when below 20% HP (60s cooldown)',
        cost: 1,
        maxLevel: 1,
        requires: 'resilience',
        bonus: (level) => ({
          secondWind: level > 0
        })
      },
      endurance: {
        name: 'Endurance',
        description: '+20 max HP, +1.5 HP/sec regen',
        cost: 1,
        maxLevel: 5,
        requires: 'guardian',
        bonus: (level) => ({
          hp: 20 * level,
          regen: 1.5 * level
        })
      },
      immortal: {
        name: 'Immortal',
        description: '+10% all damage reduction, +3 HP/sec regen',
        cost: 1,
        maxLevel: 3,
        requires: 'endurance',
        bonus: (level) => ({
          damageReduction: 0.1 * level,
          regen: 3 * level
        })
      },
      
      // UTILITY PATH (12 skills)
      wealthHunter: {
        name: 'Wealth Hunter',
        description: '+15% gold gain, +10% XP gain',
        cost: 1,
        maxLevel: 5,
        requires: 'dashMaster',
        bonus: (level) => ({
          gold: 0.15 * level,
          xp: 0.1 * level
        })
      },
      quickLearner: {
        name: 'Quick Learner',
        description: '+20% XP gain, -5% cooldown',
        cost: 1,
        maxLevel: 5,
        requires: 'wealthHunter',
        bonus: (level) => ({
          xp: 0.2 * level,
          cooldown: 0.05 * level
        })
      },
      magnetism: {
        name: 'Magnetism',
        description: '+25% pickup range',
        cost: 1,
        maxLevel: 3,
        requires: 'wealthHunter',
        bonus: (level) => ({
          pickupRange: 0.25 * level
        })
      },
      efficiency: {
        name: 'Efficiency',
        description: '-10% all cooldowns',
        cost: 1,
        maxLevel: 3,
        requires: 'quickLearner',
        bonus: (level) => ({
          cooldown: 0.1 * level
        })
      },
      scavenger: {
        name: 'Scavenger',
        description: '+20% drop rate for all items',
        cost: 1,
        maxLevel: 3,
        requires: 'magnetism',
        bonus: (level) => ({
          dropRate: 0.2 * level
        })
      },
      fortuneFinder: {
        name: 'Fortune Finder',
        description: '+25% gold drops',
        cost: 1,
        maxLevel: 3,
        requires: 'scavenger',
        bonus: (level) => ({
          gold: 0.25 * level
        })
      },
      speedster: {
        name: 'Speedster',
        description: '+10% move speed',
        cost: 1,
        maxLevel: 3,
        requires: 'dashMaster',
        bonus: (level) => ({
          moveSpeed: 0.1 * level
        })
      },
      cooldownExpert: {
        name: 'Cooldown Expert',
        description: '-15% all cooldowns',
        cost: 1,
        maxLevel: 3,
        requires: 'efficiency',
        bonus: (level) => ({
          cooldown: 0.15 * level
        })
      },
      auraExpansion: {
        name: 'Aura Expansion',
        description: '+20% aura weapon range',
        cost: 1,
        maxLevel: 3,
        requires: 'speedster',
        bonus: (level) => ({
          auraRange: 0.2 * level
        })
      },
      resourceful: {
        name: 'Resourceful',
        description: '+15% XP, +15% gold, +10% drop rate',
        cost: 1,
        maxLevel: 5,
        requires: 'fortuneFinder',
        bonus: (level) => ({
          xp: 0.15 * level,
          gold: 0.15 * level,
          dropRate: 0.1 * level
        })
      },
      treasureHunter: {
        name: 'Treasure Hunter',
        description: '+30% gold, +50% pickup range',
        cost: 1,
        maxLevel: 3,
        requires: 'resourceful',
        bonus: (level) => ({
          gold: 0.3 * level,
          pickupRange: 0.5 * level
        })
      },
      
      // ELEMENTAL PATH (12 skills)
      fireMastery: {
        name: '🔥 Fire Mastery',
        description: '+15% fire damage, burn gs.enemies',
        cost: 1,
        maxLevel: 3,
        requires: 'combatMastery',
        bonus: (level) => ({
          fireDamage: 0.15 * level,
          burnChance: 0.1 * level
        })
      },
      iceMastery: {
        name: '❄️ Ice Mastery',
        description: '+15% ice damage, slow gs.enemies',
        cost: 1,
        maxLevel: 3,
        requires: 'combatMastery',
        bonus: (level) => ({
          iceDamage: 0.15 * level,
          slowChance: 0.15 * level
        })
      },
      lightningMastery: {
        name: '⚡ Lightning Mastery',
        description: '+15% lightning damage, chain lightning',
        cost: 1,
        maxLevel: 3,
        requires: 'combatMastery',
        bonus: (level) => ({
          lightningDamage: 0.15 * level,
          chainChance: 0.1 * level
        })
      },
      elementalFusion: {
        name: 'Elemental Fusion',
        description: '+10% all elemental damage',
        cost: 1,
        maxLevel: 3,
        requires: 'fireMastery',
        bonus: (level) => ({
          elementalDamage: 0.1 * level
        })
      },
      pyromaniac: {
        name: 'Pyromaniac',
        description: '+25% fire damage, burn spreads',
        cost: 1,
        maxLevel: 3,
        requires: 'fireMastery',
        bonus: (level) => ({
          fireDamage: 0.25 * level,
          burnSpread: level > 0
        })
      },
      frostbite: {
        name: 'Frostbite',
        description: '+25% ice damage, freeze chance',
        cost: 1,
        maxLevel: 3,
        requires: 'iceMastery',
        bonus: (level) => ({
          iceDamage: 0.25 * level,
          freezeChance: 0.05 * level
        })
      },
      stormCaller: {
        name: 'Storm Caller',
        description: '+25% lightning damage, more chains',
        cost: 1,
        maxLevel: 3,
        requires: 'lightningMastery',
        bonus: (level) => ({
          lightningDamage: 0.25 * level,
          chainCount: level
        })
      },
      elementalChain: {
        name: 'Elemental Chain',
        description: 'Elemental attacks chain to nearby gs.enemies',
        cost: 1,
        maxLevel: 3,
        requires: 'elementalFusion',
        bonus: (level) => ({
          elementalChain: level
        })
      },
      manaOverflow: {
        name: 'Mana Overflow',
        description: '+20% elemental damage, -10% cooldowns',
        cost: 1,
        maxLevel: 3,
        requires: 'pyromaniac',
        bonus: (level) => ({
          elementalDamage: 0.2 * level,
          cooldown: 0.1 * level
        })
      },
      spellEcho: {
        name: 'Spell Echo',
        description: '10% chance to cast elemental effect twice',
        cost: 1,
        maxLevel: 3,
        requires: 'elementalChain',
        bonus: (level) => ({
          spellEchoChance: 0.1 * level
        })
      },
      arcaneEmpowerment: {
        name: 'Arcane Empowerment',
        description: '+15% all damage, +15% elemental damage',
        cost: 1,
        maxLevel: 5,
        requires: 'manaOverflow',
        bonus: (level) => ({
          damage: 0.15 * level,
          elementalDamage: 0.15 * level
        })
      },
      elementalOverload: {
        name: 'Elemental Overload',
        description: '+30% elemental damage, elemental effects guaranteed',
        cost: 1,
        maxLevel: 3,
        requires: 'arcaneEmpowerment',
        bonus: (level) => ({
          elementalDamage: 0.3 * level,
          elementalGuaranteed: level >= 3
        })
      }
    };

    function isDashUnlocked() {
      return (gs.saveData.skillTree && gs.saveData.skillTree.dash && gs.saveData.skillTree.dash.level > 0) ||
             (gs.saveData.tutorial && gs.saveData.tutorial.dashUnlocked) ||
             (gs.saveData.skillTree && gs.saveData.skillTree.dashMaster && gs.saveData.skillTree.dashMaster.level > 0);
    }
    function isHeadshotUnlocked() {
      return (gs.saveData.skillTree && gs.saveData.skillTree.headshot && gs.saveData.skillTree.headshot.level > 0) ||
             (gs.saveData.tutorial && gs.saveData.tutorial.headshotUnlocked) ||
             (gs.saveData.skillTree && gs.saveData.skillTree.criticalFocus && gs.saveData.skillTree.criticalFocus.level > 0) ||
             (gs.saveData.skillTree && gs.saveData.skillTree.executioner && gs.saveData.skillTree.executioner.level > 0);
    }

    function startDash() {
      if (!isDashUnlocked() || gs.isDashing || gs.dashCooldownRemaining > 0) return;
      if (!gs.player) return;
      gs.isDashing = true;
      gs.dashTimer = 0.2;
      gs.dashInvulnerable = true;
      const keysP = window._keysPressed || {};
      const dx = (keysP['d'] || keysP['arrowright'] ? 1 : 0) - (keysP['a'] || keysP['arrowleft'] ? 1 : 0);
      const dz = (keysP['s'] || keysP['arrowdown'] ? 1 : 0) - (keysP['w'] || keysP['arrowup'] ? 1 : 0);
      const len = Math.sqrt(dx*dx + dz*dz);
      gs.dashDirection.x = len > 0 ? dx/len : 0;
      gs.dashDirection.z = len > 0 ? dz/len : 1;
      const dashLevel = (gs.saveData.skillTree && gs.saveData.skillTree.dash) ? (gs.saveData.skillTree.dash.level || 0) : 0;
      gs.dashCooldownRemaining = Math.max(1.5, 3 - 0.2 * dashLevel);
      // Delegate actual movement to existing gs.player.dash()
      gs.player.dash(gs.dashDirection.x, gs.dashDirection.z);
    }

    function getBuildingCost(buildingId) {
      const building = CAMP_BUILDINGS[buildingId];
      const currentLevel = gs.saveData.campBuildings[buildingId].level;
      const calculatedCost = Math.floor(building.baseCost * Math.pow(building.costMultiplier, currentLevel));
      // Cap cost at maxCost to prevent overflow at very high levels
      return Math.min(calculatedCost, building.maxCost || 100000);
    }

    function upgradeCampBuilding(buildingId) {
      const building = CAMP_BUILDINGS[buildingId];
      const buildingData = gs.saveData.campBuildings[buildingId];
      const cost = getBuildingCost(buildingId);
      
      if (buildingData.level >= buildingData.maxLevel) {
        window.showStatusMessage('Building is at max level!', 2000);
        return;
      }
      
      if (gs.saveData.gold >= cost) {
        gs.saveData.gold -= cost;
        buildingData.level++;
        
        // Award skill points from library
        if (buildingId === 'library') {
          const bonus = building.bonus(buildingData.level);
          if (bonus.skillPoints > 0) {
            gs.saveData.skillPoints += bonus.skillPoints;
          }
        }
        
        saveSaveData();
        updateCampScreen();
        playSound('collect');
        window.showStatusMessage(`${building.name} upgraded to level ${buildingData.level}!`, 2000);
        
        // Quest progression
        if (buildingId === 'skillTree' && buildingData.level === 2 && gs.saveData.storyQuests.currentQuest === 'upgradeSkillTree') {
          window.progressQuest('upgradeSkillTree', true);
        }
        
        // Check for "upgrade any building to level 3" quest
        if (buildingData.level === 3 && gs.saveData.storyQuests.currentQuest === 'upgradeAnyBuildingTo3') {
          window.progressQuest('upgradeAnyBuildingTo3', true);
        }
      } else {
        playSound('invalid');
        window.showStatusMessage('Not enough gold!', 2000);
      }
    }

    function unlockSkill(skillId) {
      const skill = SKILL_TREE[skillId];
      const skillData = gs.saveData.skillTree[skillId];
      
      if (skillData.level >= skill.maxLevel) {
        window.showStatusMessage('Skill is at max level!', 2000);
        return;
      }
      
      // Check skill point cost
      if (gs.saveData.skillPoints >= skill.cost) {
        gs.saveData.skillPoints -= skill.cost;
        if (!skillData.unlocked) {
          skillData.unlocked = true;
        }
        skillData.level++;
        
        saveSaveData();
        updateCampScreen();
        playSound('collect');
        
        window.showStatusMessage(`${skill.name} leveled up!`, 2000);
        
        // QUEST 2: Track skill point spending for tutorial quest
        if (gs.saveData.tutorialQuests) {
          window.ensureQuest2Activated();
        }
        
        // Quest progression: Track skill unlocks for tutorial quest
        if (gs.saveData.storyQuests.currentQuest === 'useSkillTree') {
          // Count how many skills have been unlocked (use level > 0 as canonical check)
          const unlockedSkillsCount = Object.values(gs.saveData.skillTree).filter(s => s.level > 0).length;
          
          if (unlockedSkillsCount >= 2) {
            // Completed the demonstration quest
            gs.saveData.storyQuests.buildingFirstUse.skillTree = true;
            window.progressQuest('useSkillTree', true);
          }
        }
        
        // Tutorial: Check if dash was unlocked
        if (!gs.saveData.tutorial) {
          gs.saveData.tutorial = {
            completed: false,
            firstDeath: false,
            campVisited: false,
            dashUnlocked: false,
            headshotUnlocked: false,
            currentStep: 'waiting_first_death'
          };
        }
        
        // Unlock dash ability whenever dash or dashMaster skill is purchased (regardless of tutorial step)
        if ((skillId === 'dash' || skillId === 'dashMaster') && !gs.saveData.tutorial.dashUnlocked) {
          gs.saveData.tutorial.dashUnlocked = true;
          saveSaveData();
        }
        // Unlock headshot ability whenever a crit skill is purchased
        if ((skillId === 'criticalFocus' || skillId === 'headshot' || skillId === 'executioner') && !gs.saveData.tutorial.headshotUnlocked) {
          gs.saveData.tutorial.headshotUnlocked = true;
          saveSaveData();
        }
        
        // Auto-Aim skill: enable checkbox + notify gs.player
        if (skillId === 'autoAim' && skillData.level >= 1) {
          const autoAimCb = document.getElementById('auto-aim-checkbox');
          if (autoAimCb) {
            autoAimCb.disabled = false;
            autoAimCb.title = 'Toggle Auto-Aim on/off';
          }
          const autoAimLabel = document.getElementById('auto-aim-label-tooltip');
          if (autoAimLabel) autoAimLabel.style.display = 'none';
          window.showStatChange('🎯 Auto-Aim unlocked! Enable it in Settings > Auto-Aim checkbox');
        }
        
        if ((skillId === 'dashMaster' || skillId === 'dash') && gs.saveData.tutorial.currentStep === 'unlock_dash') {
          gs.saveData.tutorial.currentStep = 'unlock_headshot';
          saveSaveData();
          setTimeout(() => {
            window.showComicTutorial('unlock_headshot');
          }, 1000);
        } else if ((skillId === 'criticalFocus' || skillId === 'headshot' || skillId === 'executioner') && gs.saveData.tutorial.currentStep === 'unlock_headshot' && !gs.saveData.tutorial.headshotUnlocked) {
          // Accept any crit/headshot related skill
          gs.saveData.tutorial.headshotUnlocked = true;
          saveSaveData();
          setTimeout(() => {
            window.showComicTutorial('tutorial_complete');
          }, 1000);
        }
      } else {
        playSound('invalid');
        window.showStatusMessage('Not enough skill points!', 2000);
      }
    }

    // Training Hall constants
    const TRAINING_POINT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
    
    // Fun combo names (defined once to avoid recreation)
    const FUN_COMBO_NAMES = [
      'xoxo', 'serious?', 'no way', 'one million combo almost', 
      'i lost count combo', 'are you even real?', 'stop it already',
      'ok this is ridiculous', 'somebody stop them', 'mercy please',
      'absolute madness', 'breaking the game', 'console.log("help")',
      'error 404: combo limit not found', 'combo.exe has stopped',
      'infinity and beyond', 'to the moon', 'unstoppable force',
      'immovable object met', 'game over man', 'legend has it'
    ];
    
    // Training Hall functions
    function updateTrainingPoints() {
      // Award training points based on time
      const now = Date.now();
      if (!gs.saveData.lastTrainingPointTime) {
        gs.saveData.lastTrainingPointTime = now;
      }
      
      const timeSinceLastPoint = now - gs.saveData.lastTrainingPointTime;
      const pointsEarned = Math.floor(timeSinceLastPoint / TRAINING_POINT_INTERVAL_MS);
      
      if (pointsEarned > 0) {
        gs.saveData.trainingPoints += pointsEarned;
        gs.saveData.lastTrainingPointTime += pointsEarned * TRAINING_POINT_INTERVAL_MS;
        saveSaveData();
      }
    }
    
    function getNextTrainingPointTime() {
      if (!gs.saveData.lastTrainingPointTime) return 'Soon';
      const now = Date.now();
      const nextPointTime = gs.saveData.lastTrainingPointTime + TRAINING_POINT_INTERVAL_MS;
      const timeRemaining = nextPointTime - now;
      
      if (timeRemaining <= 0) return 'Available now!';
      
      const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
      const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
      
      return `${hours}h ${minutes}m`;
    }
    
    // Passive Skills System
    const PASSIVE_SKILLS = [
      { id: 'hp_boost', icon: '❤️', name: 'HP Boost', desc: '+10 Max HP per level', maxLevel: 5, cost: 2, apply: (saves) => { saves.passiveSkills.hp_boost = (saves.passiveSkills.hp_boost || 0) + 1; } },
      { id: 'dmg_boost', icon: '⚔️', name: 'Damage Boost', desc: '+5% Base Damage per level', maxLevel: 5, cost: 2, apply: (saves) => { saves.passiveSkills.dmg_boost = (saves.passiveSkills.dmg_boost || 0) + 1; } },
      { id: 'gold_bonus', icon: '💰', name: 'Gold Finder', desc: '+10% Gold per level', maxLevel: 5, cost: 2, apply: (saves) => { saves.passiveSkills.gold_bonus = (saves.passiveSkills.gold_bonus || 0) + 1; } },
      { id: 'xp_bonus', icon: '⭐', name: 'XP Boost', desc: '+10% XP per level', maxLevel: 5, cost: 2, apply: (saves) => { saves.passiveSkills.xp_bonus = (saves.passiveSkills.xp_bonus || 0) + 1; } },
      { id: 'regen_boost', icon: '🔄', name: 'Regeneration', desc: '+0.5 HP/sec per level', maxLevel: 5, cost: 3, apply: (saves) => { saves.passiveSkills.regen_boost = (saves.passiveSkills.regen_boost || 0) + 1; } },
      { id: 'speed_boost', icon: '💨', name: 'Swiftness', desc: '+5% Move Speed per level', maxLevel: 3, cost: 3, apply: (saves) => { saves.passiveSkills.speed_boost = (saves.passiveSkills.speed_boost || 0) + 1; } }
    ];
    
    function updatePassiveSkillsSection() {
      if (!gs.saveData.passiveSkills) gs.saveData.passiveSkills = {};
      if (!gs.saveData.passiveSkillPoints) gs.saveData.passiveSkillPoints = 0;
      
      const pointsEl = document.getElementById('passive-skill-points-display');
      if (pointsEl) pointsEl.textContent = gs.saveData.passiveSkillPoints;
      
      const content = document.getElementById('camp-passive-content');
      if (!content) return;
      content.innerHTML = '';
      
      PASSIVE_SKILLS.forEach(skill => {
        const currentLevel = gs.saveData.passiveSkills[skill.id] || 0;
        const isMax = currentLevel >= skill.maxLevel;
        const canAfford = gs.saveData.passiveSkillPoints >= skill.cost;
        
        const card = document.createElement('div');
        card.style.cssText = `background:linear-gradient(to bottom,#2a3a2a,#1a2a1a);border:2px solid ${isMax ? '#FFD700' : '#4a6a4a'};border-radius:12px;padding:15px;`;
        card.innerHTML = `
          <div style="font-size:24px;margin-bottom:6px;">${skill.icon}</div>
          <div style="font-family:'Bangers',cursive;font-size:18px;color:${isMax ? '#FFD700' : '#90EE90'};letter-spacing:1px;">${skill.name}</div>
          <div style="font-size:13px;color:#aaa;margin:4px 0;">${skill.desc}</div>
          <div style="font-size:12px;color:#FFD700;margin:4px 0;">Level: ${currentLevel}/${skill.maxLevel}</div>
          ${!isMax ? `<button style="background:${canAfford ? '#2a6a2a' : '#3a3a3a'};color:${canAfford ? '#90EE90' : '#666'};border:1px solid ${canAfford ? '#4a9a4a' : '#555'};border-radius:6px;padding:6px 12px;cursor:${canAfford ? 'pointer' : 'default'};font-size:13px;margin-top:6px;" data-id="${skill.id}" data-cost="${skill.cost}">Unlock (${skill.cost} pts)</button>` : '<div style="color:#FFD700;font-size:13px;margin-top:6px;">✅ MAX LEVEL</div>'}
        `;
        
        const btn = card.querySelector('button');
        if (btn && canAfford) {
          btn.onclick = () => {
            if (gs.saveData.passiveSkillPoints < skill.cost) return;
            gs.saveData.passiveSkillPoints -= skill.cost;
            skill.apply(gs.saveData);
            saveSaveData();
            updatePassiveSkillsSection();
            playSound('collect');
            window.showStatusMessage(`${skill.name} upgraded!`, 2000);
          };
        }
        
        content.appendChild(card);
      });
    }
    
    function updateTrainingSection() {
      updateTrainingPoints();
      
      const trainingPointsDisplay = document.getElementById('training-points-display');
      const nextPointTime = document.getElementById('next-training-point-time');
      const attributesContent = document.getElementById('training-attributes-content');
      
      trainingPointsDisplay.textContent = gs.saveData.trainingPoints;
      nextPointTime.textContent = `Next training point in: ${getNextTrainingPointTime()}`;
      
      // Training cost scales: 100g for first point, +50g per point
      const TRAINING_ATTRIBUTES = {
        strength: {
          name: 'Strength',
          icon: '💪',
          description: 'Increases damage output',
          current: gs.saveData.attributes.strength || 0,
          baseCost: 100
        },
        endurance: {
          name: 'Endurance',
          icon: '🏃',
          description: 'Increases stamina and high-speed duration',
          current: gs.saveData.attributes.endurance || 0,
          baseCost: 100
        },
        flexibility: {
          name: 'Flexibility',
          icon: '🤸',
          description: 'Improves turn speed and dodge responsiveness',
          current: gs.saveData.attributes.flexibility || 0,
          baseCost: 100
        }
      };
      
      attributesContent.innerHTML = '';
      
      for (const [attrId, attr] of Object.entries(TRAINING_ATTRIBUTES)) {
        const cost = attr.baseCost + (attr.current * 50);
        const canAfford = gs.saveData.gold >= cost && gs.saveData.trainingPoints >= 1;
        
        const attrCard = document.createElement('div');
        attrCard.style.cssText = `
          background: rgba(0,0,0,0.5);
          padding: 20px;
          border-radius: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          border: 2px solid ${canAfford ? '#FFD700' : '#555'};
          opacity: ${canAfford ? '1' : '0.6'};
        `;
        
        attrCard.innerHTML = `
          <div style="flex: 1;">
            <div style="font-size: 20px; margin-bottom: 5px;">${attr.icon} ${attr.name}</div>
            <div style="font-size: 14px; color: #AAA; margin-bottom: 10px;">${attr.description}</div>
            <div style="font-size: 16px; color: #5DADE2;">Current: ${attr.current}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 18px; color: #FFD700; margin-bottom: 5px;">${cost} gold</div>
            <div style="font-size: 14px; color: #AAA;">+ 1 Training Point</div>
            <button class="btn" style="margin-top: 10px; padding: 8px 16px;">TRAIN</button>
          </div>
        `;
        
        attrCard.onclick = () => {
          if (gs.saveData.gold >= cost && gs.saveData.trainingPoints >= 1) {
            gs.saveData.gold -= cost;
            gs.saveData.trainingPoints -= 1;
            
            // Initialize attributes if not present
            if (!gs.saveData.attributes) gs.saveData.attributes = {};
            if (!gs.saveData.attributes[attrId]) gs.saveData.attributes[attrId] = 0;
            
            gs.saveData.attributes[attrId]++;
            saveSaveData();
            
            playSound('levelup');
            window.showStatusMessage(`${attr.name} increased to ${gs.saveData.attributes[attrId]}!`, 2000);
            updateTrainingSection();
            updateGoldDisplays();
            
            // QUEST 4 (new): Track attribute purchase for "Upgrade an Attribute" quest
            if (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.currentQuest === 'quest4_upgradeAttr') {
              window.progressTutorialQuest('quest4_upgradeAttr', true);
            }
            // QUEST 5 (new): Track training session for "Complete a Training Session" quest
            if (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.currentQuest === 'quest5_trainingSession') {
              window.progressTutorialQuest('quest5_trainingSession', true);
            }
            // QUEST 3 (legacy): Track attribute purchase for tutorial quest
            if (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.currentQuest === 'quest3_buyProgression') {
              // Count total attribute levels purchased
              const totalAttrLevels = Object.values(gs.saveData.attributes || {}).reduce((sum, val) => sum + val, 0);
              
              if (totalAttrLevels >= 1) {
                // Completed quest 3: bought 1 progression upgrade
                window.progressTutorialQuest('quest3_buyProgression', true);
              }
            }
            // QUEST 6: Track attribute purchase for upgrade-3-attributes quest
            if (gs.saveData.tutorialQuests && gs.saveData.tutorialQuests.currentQuest === 'quest6_buyAttributes') {
              if (!gs.saveData.tutorialQuests.quest6AttrCount) gs.saveData.tutorialQuests.quest6AttrCount = 0;
              gs.saveData.tutorialQuests.quest6AttrCount++;
              if (gs.saveData.tutorialQuests.quest6AttrCount >= 3) {
                window.progressTutorialQuest('quest6_buyAttributes', true);
              }
            }
          } else {
            playSound('invalid');
            if (gs.saveData.trainingPoints < 1) {
              window.showStatusMessage('Not enough training points!', 2000);
            } else {
              window.showStatusMessage('Not enough gold!', 2000);
            }
          }
        };
        
        attributesContent.appendChild(attrCard);
      }
    }

    export { isDashUnlocked, isHeadshotUnlocked, startDash, getBuildingCost, upgradeCampBuilding, unlockSkill, updateTrainingPoints, getNextTrainingPointTime, updatePassiveSkillsSection, updateTrainingSection, CAMP_BUILDINGS };
