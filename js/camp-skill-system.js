// js/camp-skill-system.js — Lore database, camp buildings data, skill tree definitions,
// skill tree functions, training system, passive skills.
// Depends on: variables from main.js, save-system.js

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
          story: 'Built by a genius engineer who sought to weaponize lightning itself. The tower still crackles with power, attracting the most dangerous enemies.'
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
          description: 'Basic geometric enemies that hunt in swarms.',
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
          name: 'Progression Upgrades',
          icon: '🔨',
          description: 'A place to permanently upgrade your abilities and power.',
          story: 'Fueled by the heat of a thousand defeated enemies, this place shapes even the hardest challenges.'
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
        name: 'Progression Upgrades',
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
      specialAttacks: {
        name: 'Special Attacks',
        icon: '⚡',
        description: 'Choose and upgrade powerful special attack abilities. Earn SAP from quests to unlock new attacks.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
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
      achievementBuilding: {
        name: 'Achievement Hall',
        icon: '🏆',
        description: 'Claim achievement rewards and track your progress. Unlocked by finding every landmark!',
        baseCost: 0, // Free — reward for exploration
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      accountBuilding: {
        name: 'Account & Records',
        icon: '👤',
        description: 'View your starting stats, current stats, total kills, account level, and achievements.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        isCore: true,
        bonus: (level) => ({})
      },
      idleMenu: {
        name: 'Idle Progression',
        icon: '⚙️',
        description: 'Manage your idle gold mine, fountain, expeditions, prestige, daily rewards, gems, shop and lucky wheel.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      characterVisuals: {
        name: 'Character Visuals',
        icon: '🎨',
        description: 'Customize your character appearance, accessories, animations and outfits',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      codex: {
        name: 'Codex',
        icon: '📖',
        description: 'Encyclopedia of all enemies, structures, landmarks and game lore',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      campBoard: {
        name: 'Camp Board',
        icon: '📋',
        description: 'Fast access to all camp features from one central location near the campfire',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      warehouse: {
        name: 'Warehouse',
        icon: '🏪',
        description: 'Store and manage your resources and items. Unlocked after Quest 7.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      tavern: {
        name: 'Tavern',
        icon: '🍺',
        description: 'Send companions on expeditions and socialize. Unlocked after Quest 8.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      shop: {
        name: 'Shop',
        icon: '🛒',
        description: 'Buy powerful items and upgrades. Unlocked after Quest 9.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
      },
      prestige: {
        name: 'Prestige Altar',
        icon: '✨',
        description: 'Begin the Prestige journey for massive permanent power. Unlocked after Quest 10.',
        baseCost: 0,
        costMultiplier: 0,
        maxCost: 0,
        isFree: true,
        bonus: (level) => ({})
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
        description: 'Enables automatic targeting of nearest enemies. Toggle in Settings > Auto-Aim.',
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
        description: '+20% damage to enemies below 30% HP',
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
        description: '+15% fire damage, burn enemies',
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
        description: '+15% ice damage, slow enemies',
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
        description: 'Elemental attacks chain to nearby enemies',
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
      },

      // ── SPECIAL ATTACKS PATH ──────────────────────────────────
      specialShockwave: {
        name: '💥 Shockwave',
        description: 'Unlocks the Shockwave special attack (massive AoE explosion)',
        cost: 2,
        maxLevel: 1,
        requires: 'combatMastery',
        bonus: (level) => ({ unlockSpecial: 'shockwave' })
      },
      specialFrozenStorm: {
        name: '❄️ Frozen Storm',
        description: 'Unlocks Frozen Storm (freeze nearby enemies)',
        cost: 2,
        maxLevel: 1,
        requires: 'specialShockwave',
        bonus: (level) => ({ unlockSpecial: 'frozenStorm' })
      },
      specialDeathBlossom: {
        name: '🌸 Death Blossom',
        description: 'Unlocks Death Blossom (360° projectile burst)',
        cost: 2,
        maxLevel: 1,
        requires: 'specialFrozenStorm',
        bonus: (level) => ({ unlockSpecial: 'deathBlossom' })
      },
      specialThunderStrike: {
        name: '⚡ Thunder Strike',
        description: 'Unlocks Thunder Strike (lightning line attack)',
        cost: 2,
        maxLevel: 1,
        requires: 'lightningMastery',
        bonus: (level) => ({ unlockSpecial: 'thunderStrike' })
      },
      specialVoidPulse: {
        name: '🌀 Void Pulse',
        description: 'Unlocks Void Pulse (dark energy implosion)',
        cost: 3,
        maxLevel: 1,
        requires: 'specialDeathBlossom',
        bonus: (level) => ({ unlockSpecial: 'voidPulse' })
      },
      specialInfernoRing: {
        name: '🔥 Inferno Ring',
        description: 'Unlocks Inferno Ring (ring of fire)',
        cost: 2,
        maxLevel: 1,
        requires: 'fireMastery',
        bonus: (level) => ({ unlockSpecial: 'infernoRing' })
      },

      // ── MELEE TAKEDOWN ────────────────────────────────────────
      meleeTakedown: {
        name: '🔪 Melee Takedown',
        description: 'Unlocks the knife melee instant-kill takedown attack',
        cost: 3,
        maxLevel: 1,
        requires: 'executioner',
        bonus: (level) => ({ unlockMelee: level > 0 })
      }
    };

    /**
     * Apply all purchased SKILL_TREE bonuses to playerStats and the module-level
     * dash variables. Call this at the END of resetGame(), after base stats are set.
     * This fixes the critical bug where skill purchases had no in-game effect.
     */
    function applySkillTreeBonuses() {
      if (!saveData.skillTree) return;

      // Accumulators for stats that combine additively
      let hpFlat = 0, hpPercent = 0, regenFlat = 0, armorFlat = 0;
      let damageMult = 0, critChanceFlat = 0, critDmgFlat = 0;
      let atkSpeedMult = 0, moveSpeedMult = 0;
      let dashCdReduction = 0, dashDistMult = 0, cooldownReduction = 0;

      for (const skillId in saveData.skillTree) {
        const skillData = saveData.skillTree[skillId];
        const level = (skillData && skillData.level) || 0;
        if (level === 0) continue;

        const skillDef = SKILL_TREE[skillId];
        if (!skillDef || typeof skillDef.bonus !== 'function') continue;

        const bonus = skillDef.bonus(level);

        // --- Accumulated stats ---
        if (bonus.hp)           hpFlat        += bonus.hp;
        if (bonus.hpPercent)    hpPercent     += bonus.hpPercent;
        if (bonus.regen)        regenFlat     += bonus.regen;
        if (bonus.armor)        armorFlat     += bonus.armor;
        if (bonus.damage)       damageMult    += bonus.damage;
        if (bonus.weaponDamage) damageMult    += bonus.weaponDamage; // weaponDamage stacks additively with damage into the same multiplier
        if (bonus.critChance)   critChanceFlat += bonus.critChance;
        if (bonus.critDamage)   critDmgFlat   += bonus.critDamage;
        if (bonus.attackSpeed)  atkSpeedMult  += bonus.attackSpeed;
        if (bonus.moveSpeed)    moveSpeedMult += bonus.moveSpeed;
        if (bonus.dashCooldown) dashCdReduction += bonus.dashCooldown;
        if (bonus.dashDistance) dashDistMult  += bonus.dashDistance;
        if (bonus.cooldown)     cooldownReduction += bonus.cooldown;

        // --- Direct playerStats fields ---
        if (bonus.damageReduction)    playerStats.damageReduction    = Math.min(0.75, (playerStats.damageReduction || 0) + bonus.damageReduction);
        if (bonus.dodgeChance)        playerStats.dodgeChance        = Math.min(0.75, (playerStats.dodgeChance || 0) + bonus.dodgeChance);
        if (bonus.healOnKill)         playerStats.healOnKill         = (playerStats.healOnKill || 0) + bonus.healOnKill;
        if (bonus.lowHpDamage)        playerStats.lowHpDamage        = (playerStats.lowHpDamage || 0) + bonus.lowHpDamage;
        if (bonus.executeDamage)      playerStats.executeDamage      = (playerStats.executeDamage || 0) + bonus.executeDamage;
        if (bonus.armorPenetration)   playerStats.armorPenetration   = Math.min(0.90, (playerStats.armorPenetration || 0) + bonus.armorPenetration);
        if (bonus.multiHitChance)     playerStats.multiHitChance     = Math.min(0.75, (playerStats.multiHitChance || 0) + bonus.multiHitChance);
        if (bonus.lastStand)          playerStats.hasLastStand       = true;
        if (bonus.secondWind)         playerStats.hasSecondWind      = true;
        if (bonus.pickupRange)        playerStats.pickupRange        = (playerStats.pickupRange || 1.0) + bonus.pickupRange;
        if (bonus.dropRate)           playerStats.dropRate           = (playerStats.dropRate || 1.0) + bonus.dropRate;
        if (bonus.auraRange)          playerStats.auraRange          = (playerStats.auraRange || 1.0) + bonus.auraRange;
        // Elemental
        if (bonus.fireDamage)         playerStats.fireDamage         = (playerStats.fireDamage || 0) + bonus.fireDamage;
        if (bonus.iceDamage)          playerStats.iceDamage          = (playerStats.iceDamage || 0) + bonus.iceDamage;
        if (bonus.lightningDamage)    playerStats.lightningDamage    = (playerStats.lightningDamage || 0) + bonus.lightningDamage;
        if (bonus.elementalDamage)    playerStats.elementalDamage    = (playerStats.elementalDamage || 0) + bonus.elementalDamage;
        if (bonus.burnChance)         playerStats.burnChance         = (playerStats.burnChance || 0) + bonus.burnChance;
        if (bonus.slowChance)         playerStats.slowChance         = (playerStats.slowChance || 0) + bonus.slowChance;
        if (bonus.chainChance)        playerStats.chainChance        = (playerStats.chainChance || 0) + bonus.chainChance;
        if (bonus.chainCount)         playerStats.chainCount         = (playerStats.chainCount || 0) + bonus.chainCount;
        if (bonus.freezeChance)       playerStats.freezeChance       = (playerStats.freezeChance || 0) + bonus.freezeChance;
        if (bonus.burnSpread)         playerStats.burnSpread         = true;
        if (bonus.spellEchoChance)    playerStats.spellEchoChance    = (playerStats.spellEchoChance || 0) + bonus.spellEchoChance;
        if (bonus.elementalChain)     playerStats.elementalChain     = (playerStats.elementalChain || 0) + bonus.elementalChain;
        if (bonus.elementalGuaranteed) playerStats.elementalGuaranteed = true;
      }

      // --- Apply accumulated bonuses ---
      // HP (flat first, then percent on top)
      playerStats.maxHp += hpFlat;
      if (hpPercent > 0) playerStats.maxHp = Math.floor(playerStats.maxHp * (1 + hpPercent));
      playerStats.hp = playerStats.maxHp; // Start the run at full health

      playerStats.hpRegen   += regenFlat;
      playerStats.armor     += armorFlat;

      // Multiplicative bonuses applied to already-calculated base stats
      if (damageMult    !== 0) playerStats.strength  *= (1 + damageMult);
      if (critChanceFlat !== 0) playerStats.critChance += critChanceFlat;
      if (critDmgFlat   !== 0) playerStats.critDmg    += critDmgFlat;
      if (atkSpeedMult  !== 0) playerStats.atkSpeed   *= (1 + atkSpeedMult);
      if (moveSpeedMult !== 0) playerStats.walkSpeed  *= (1 + moveSpeedMult);

      // Dash variables (module-level; dashDistance was already set from dashPower)
      const totalDashCd = Math.min(0.80, dashCdReduction + cooldownReduction);
      if (totalDashCd > 0) dashCooldown *= (1 - totalDashCd);
      if (dashDistMult > 0) dashDistance *= (1 + dashDistMult);

      // Clamp stats to sane ranges
      playerStats.armor       = Math.min(85, playerStats.armor);
      playerStats.critChance  = Math.min(0.95, playerStats.critChance);

      // Mobility score = average of turnResponse bonuses (visual/feel metric)
      playerStats.mobilityScore = playerStats.turnResponse || 1.0;
    }

    function isDashUnlocked() {
      return (saveData.skillTree && saveData.skillTree.dash && saveData.skillTree.dash.level > 0) ||
             (saveData.tutorial && saveData.tutorial.dashUnlocked) ||
             (saveData.skillTree && saveData.skillTree.dashMaster && saveData.skillTree.dashMaster.level > 0);
    }
    function isHeadshotUnlocked() {
      return (saveData.skillTree && saveData.skillTree.headshot && saveData.skillTree.headshot.level > 0) ||
             (saveData.tutorial && saveData.tutorial.headshotUnlocked) ||
             (saveData.skillTree && saveData.skillTree.criticalFocus && saveData.skillTree.criticalFocus.level > 0) ||
             (saveData.skillTree && saveData.skillTree.executioner && saveData.skillTree.executioner.level > 0);
    }

    function startDash() {
      if (!isDashUnlocked() || isDashing || dashCooldownRemaining > 0) return;
      if (!player) return;
      isDashing = true;
      dashTimer = 0.2;
      dashInvulnerable = true;
      const keysP = window._keysPressed || {};
      const dx = (keysP['d'] || keysP['arrowright'] ? 1 : 0) - (keysP['a'] || keysP['arrowleft'] ? 1 : 0);
      const dz = (keysP['s'] || keysP['arrowdown'] ? 1 : 0) - (keysP['w'] || keysP['arrowup'] ? 1 : 0);
      const len = Math.sqrt(dx*dx + dz*dz);
      dashDirection.x = len > 0 ? dx/len : 0;
      dashDirection.z = len > 0 ? dz/len : 1;
      const dashLevel = (saveData.skillTree && saveData.skillTree.dash) ? (saveData.skillTree.dash.level || 0) : 0;
      dashCooldownRemaining = Math.max(1.5, 3 - 0.2 * dashLevel);
      // Trigger waterdrop dash wave animation
      const wdc = document.getElementById('waterdrop-container');
      if (wdc) {
        wdc.classList.remove('dashing');
        void wdc.offsetWidth;
        wdc.classList.add('dashing');
        setTimeout(() => wdc.classList.remove('dashing'), 500);
      }
      // Delegate actual movement to existing player.dash()
      player.dash(dashDirection.x, dashDirection.z);
      // Notify SSB of dash activation
      if (window.pushSuperStatEvent) {
        window.pushSuperStatEvent('💨 Dash!', 'rare', '💨', 'neutral');
      }
    }

    function getBuildingCost(buildingId) {
      const building = CAMP_BUILDINGS[buildingId];
      const currentLevel = saveData.campBuildings[buildingId].level;
      const calculatedCost = Math.floor(building.baseCost * Math.pow(building.costMultiplier, currentLevel));
      // Cap cost at maxCost to prevent overflow at very high levels
      return Math.min(calculatedCost, building.maxCost || 100000);
    }

    function upgradeCampBuilding(buildingId) {
      const building = CAMP_BUILDINGS[buildingId];
      const buildingData = saveData.campBuildings[buildingId];
      const cost = getBuildingCost(buildingId);
      
      if (buildingData.level >= buildingData.maxLevel) {
        showStatusMessage('Building is at max level!', 2000);
        return;
      }
      
      if (saveData.gold >= cost) {
        saveData.gold -= cost;
        buildingData.level++;
        
        // Award skill points from library
        if (buildingId === 'library') {
          const bonus = building.bonus(buildingData.level);
          if (bonus.skillPoints > 0) {
            saveData.skillPoints += bonus.skillPoints;
          }
        }
        
        saveSaveData();
        updateCampScreen();
        playSound('collect');
        showStatusMessage(`${building.name} upgraded to level ${buildingData.level}!`, 2000);
        
        // Quest progression
        if (buildingId === 'skillTree' && buildingData.level === 2 && saveData.storyQuests.currentQuest === 'upgradeSkillTree') {
          progressQuest('upgradeSkillTree', true);
        }
        
        // Check for "upgrade any building to level 3" quest
        if (buildingData.level === 3 && saveData.storyQuests.currentQuest === 'upgradeAnyBuildingTo3') {
          progressQuest('upgradeAnyBuildingTo3', true);
        }
      } else {
        playSound('invalid');
        showStatusMessage('Not enough gold!', 2000);
      }
    }

    function unlockSkill(skillId) {
      const skill = SKILL_TREE[skillId];
      const skillData = saveData.skillTree[skillId];
      
      if (skillData.level >= skill.maxLevel) {
        showStatusMessage('Skill is at max level!', 2000);
        return;
      }
      
      // Check skill point cost
      if (saveData.skillPoints >= skill.cost) {
        saveData.skillPoints -= skill.cost;
        if (!skillData.unlocked) {
          skillData.unlocked = true;
        }
        skillData.level++;
        
        saveSaveData();
        updateCampScreen();
        playSound('collect');
        
        // Refresh special attack loadout HUD if a special attack or melee node was unlocked
        if (window.GameRageCombat && (skillId.startsWith('special') || skillId === 'meleeTakedown')) {
          window.GameRageCombat.refreshLoadout(saveData);
        }
        
        showStatusMessage(`${skill.name} leveled up!`, 2000);
        
        // QUEST 2: Track skill point spending for tutorial quest
        if (saveData.tutorialQuests) {
          ensureQuest2Activated();
        }
        
        // Quest progression: Track skill unlocks for tutorial quest
        if (saveData.storyQuests.currentQuest === 'useSkillTree') {
          // Count how many skills have been unlocked (use level > 0 as canonical check)
          const unlockedSkillsCount = Object.values(saveData.skillTree).filter(s => s.level > 0).length;
          
          if (unlockedSkillsCount >= 2) {
            // Completed the demonstration quest
            saveData.storyQuests.buildingFirstUse.skillTree = true;
            progressQuest('useSkillTree', true);
          }
        }
        
        // Tutorial: Check if dash was unlocked
        if (!saveData.tutorial) {
          saveData.tutorial = {
            completed: false,
            firstDeath: false,
            campVisited: false,
            dashUnlocked: false,
            headshotUnlocked: false,
            currentStep: 'waiting_first_death'
          };
        }
        
        // Unlock dash ability whenever dash or dashMaster skill is purchased (regardless of tutorial step)
        if ((skillId === 'dash' || skillId === 'dashMaster') && !saveData.tutorial.dashUnlocked) {
          saveData.tutorial.dashUnlocked = true;
          saveSaveData();
        }
        // Unlock headshot ability whenever a crit skill is purchased
        if ((skillId === 'criticalFocus' || skillId === 'headshot' || skillId === 'executioner') && !saveData.tutorial.headshotUnlocked) {
          saveData.tutorial.headshotUnlocked = true;
          saveSaveData();
        }
        
        // Auto-Aim skill: enable checkbox + notify player
        if (skillId === 'autoAim' && skillData.level >= 1) {
          const autoAimCb = document.getElementById('auto-aim-checkbox');
          if (autoAimCb) {
            autoAimCb.disabled = false;
            autoAimCb.title = 'Toggle Auto-Aim on/off';
          }
          const autoAimLabel = document.getElementById('auto-aim-label-tooltip');
          if (autoAimLabel) autoAimLabel.style.display = 'none';
          showStatChange('🎯 Auto-Aim unlocked! Enable it in Settings > Auto-Aim checkbox');
        }
        
        if ((skillId === 'dashMaster' || skillId === 'dash') && saveData.tutorial.currentStep === 'unlock_dash') {
          saveData.tutorial.currentStep = 'unlock_headshot';
          saveSaveData();
          setTimeout(() => {
            showComicTutorial('unlock_headshot');
          }, 1000);
        } else if ((skillId === 'criticalFocus' || skillId === 'headshot' || skillId === 'executioner') && saveData.tutorial.currentStep === 'unlock_headshot') {
          // Accept any crit/headshot related skill to complete the tutorial.
          // Note: the block ~20 lines above already set headshotUnlocked = true, so the
          // previous `!saveData.tutorial.headshotUnlocked` guard here was always false and
          // prevented tutorial_complete from ever showing. Guard removed intentionally.
          saveSaveData();
          setTimeout(() => {
            showComicTutorial('tutorial_complete');
          }, 1000);
        }
      } else {
        playSound('invalid');
        showStatusMessage('Not enough skill points!', 2000);
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
      if (!saveData.lastTrainingPointTime) {
        saveData.lastTrainingPointTime = now;
      }
      
      const timeSinceLastPoint = now - saveData.lastTrainingPointTime;
      const pointsEarned = Math.floor(timeSinceLastPoint / TRAINING_POINT_INTERVAL_MS);
      
      if (pointsEarned > 0) {
        saveData.trainingPoints += pointsEarned;
        saveData.lastTrainingPointTime += pointsEarned * TRAINING_POINT_INTERVAL_MS;
        saveSaveData();
      }
    }
    
    function getNextTrainingPointTime() {
      if (!saveData.lastTrainingPointTime) return 'Soon';
      const now = Date.now();
      const nextPointTime = saveData.lastTrainingPointTime + TRAINING_POINT_INTERVAL_MS;
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
      if (!saveData.passiveSkills) saveData.passiveSkills = {};
      if (!saveData.passiveSkillPoints) saveData.passiveSkillPoints = 0;
      
      const pointsEl = document.getElementById('passive-skill-points-display');
      if (pointsEl) pointsEl.textContent = saveData.passiveSkillPoints;
      
      const content = document.getElementById('camp-passive-content');
      if (!content) return;
      content.innerHTML = '';
      
      PASSIVE_SKILLS.forEach(skill => {
        const currentLevel = saveData.passiveSkills[skill.id] || 0;
        const isMax = currentLevel >= skill.maxLevel;
        const canAfford = saveData.passiveSkillPoints >= skill.cost;
        
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
            if (saveData.passiveSkillPoints < skill.cost) return;
            saveData.passiveSkillPoints -= skill.cost;
            skill.apply(saveData);
            saveSaveData();
            updatePassiveSkillsSection();
            playSound('collect');
            showStatusMessage(`${skill.name} upgraded!`, 2000);
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
      
      trainingPointsDisplay.textContent = saveData.trainingPoints;
      nextPointTime.textContent = `Next training point in: ${getNextTrainingPointTime()}`;
      
      // Training cost scales: 100g for first point, +50g per point
      const TRAINING_ATTRIBUTES = {
        strength: {
          name: 'Strength',
          icon: '💪',
          description: 'Increases damage output',
          current: saveData.attributes.strength || 0,
          baseCost: 100
        },
        endurance: {
          name: 'Endurance',
          icon: '🏃',
          description: 'Increases stamina and high-speed duration',
          current: saveData.attributes.endurance || 0,
          baseCost: 100
        },
        flexibility: {
          name: 'Flexibility',
          icon: '🤸',
          description: 'Improves turn speed and dodge responsiveness',
          current: saveData.attributes.flexibility || 0,
          baseCost: 100
        }
      };
      
      attributesContent.innerHTML = '';
      
      for (const [attrId, attr] of Object.entries(TRAINING_ATTRIBUTES)) {
        const cost = attr.baseCost + (attr.current * 50);
        const canAfford = saveData.gold >= cost && saveData.trainingPoints >= 1;
        
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
          if (saveData.gold >= cost && saveData.trainingPoints >= 1) {
            saveData.gold -= cost;
            saveData.trainingPoints -= 1;
            
            // Initialize attributes if not present
            if (!saveData.attributes) saveData.attributes = {};
            if (!saveData.attributes[attrId]) saveData.attributes[attrId] = 0;
            
            saveData.attributes[attrId]++;
            saveSaveData();
            
            playSound('levelup');
            showStatusMessage(`${attr.name} increased to ${saveData.attributes[attrId]}!`, 2000);
            updateTrainingSection();
            updateGoldDisplays();
            
            // Track attribute purchase for "Upgrade an Attribute" quest
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest5_upgradeAttr') {
              progressTutorialQuest('quest5_upgradeAttr', true);
            }
            // Legacy: Track attribute purchase for tutorial quest
            if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest3_buyProgression') {
              const totalAttrLevels = Object.values(saveData.attributes || {}).reduce((sum, val) => sum + val, 0);
              if (totalAttrLevels >= 1) {
                progressTutorialQuest('quest3_buyProgression', true);
              }
            }
          } else {
            playSound('invalid');
            if (saveData.trainingPoints < 1) {
              showStatusMessage('Not enough training points!', 2000);
            } else {
              showStatusMessage('Not enough gold!', 2000);
            }
          }
        };
        
        attributesContent.appendChild(attrCard);
      }
    }

    // --- TUTORIAL QUEST SYSTEM (8-Quest Flow) ---
    
    // Quest definitions with conditions for dependencies
    const TUTORIAL_QUESTS = {
      // === PHASE 0: First death triggers tutorial ===
      firstRunDeath: {
        id: 'firstRunDeath',
        name: 'First Death Tutorial',
        description: 'Your first death triggers the tutorial',
        objectives: 'Die in your first run',
        rewardGold: 0,
        rewardSkillPoints: 0,
        unlockBuilding: 'questMission',
        autoClaim: true,
        triggerOnDeath: true,
        nextQuest: 'quest1_kill3',
        conditions: []
      },

      // === PHASE 1: Run quest → Unlock Skill Tree ===
      quest1_kill3: {
        id: 'quest1_kill3',
        name: 'Kill 3 Enemies',
        description: 'Start a new run and kill 3 enemies',
        objectives: 'Kill 3 enemies in one run',
        claim: 'Main Building',
        rewardGold: 50,
        rewardSkillPoints: 3,
        unlockBuilding: 'skillTree',
        message: "Outstanding, Droplet! 🎯<br><br>You've proven your combat worth. The <b>Skill Tree</b> is now unlocked at camp!<br><br>Head to the <b>Skill Tree</b> tab and spend your <b>3 Skill Points</b> to grow stronger.",
        nextQuest: 'quest2_spendSkills',
        conditions: ['firstRunDeath']
      },

      // === PHASE 2: Camp quest → Use Skill Tree (free first use) ===
      quest2_spendSkills: {
        id: 'quest2_spendSkills',
        name: 'Buy 3 Skills',
        description: 'Go to the Skill Tree tab and unlock any three skills',
        objectives: 'Unlock any 3 skills in the Skill Tree tab',
        claim: 'Main Building',
        rewardGold: 100,
        rewardSkillPoints: 1,
        message: "Skills unlocked! 🌟<br><br>Head to <b>Stonehenge</b> on the map — a glowing chest awaits you there with your first piece of gear!",
        nextQuest: 'quest3_stonehengeGear',
        conditions: ['quest1_kill3']
      },

      // === PHASE 3: Run quest → Find gear at Stonehenge → Unlock Armory ===
      quest3_stonehengeGear: {
        id: 'quest3_stonehengeGear',
        name: 'Find the Cigar at Stonehenge',
        description: 'Head to Stonehenge on the map and collect the quest chest to get the legendary Cigar',
        objectives: 'Find and collect the chest at Stonehenge',
        claim: 'Main Building',
        rewardGold: 150,
        rewardSkillPoints: 2,
        unlockBuildingOnActivation: 'armory',
        unlockBuilding: 'specialAttacks',
        rewardSAP: 2,
        giveItem: { id: 'cigar_quest', name: 'Cigar', type: 'ring', rarity: 'rare', stats: { attackSpeed: 1, movementSpeed: 1, attackPrecision: 1 }, description: '+1 Attack Speed, +1 Movement Speed, +1 Attack Precision' },
        message: "🚬 Cigar acquired!<br><br>This rare ring grants <b>+1 Attack Speed, +1 Movement Speed, +1 Attack Precision</b>.<br><br>The <b>Special Attacks</b> building is now unlocked! Choose your first special attack.<br><br>Head to the <b>Armory</b> and equip the Cigar from your inventory!",
        nextQuest: 'quest4_equipCigar',
        conditions: ['quest2_spendSkills']
      },

      // === PHASE 4: Camp quest → Equip gear (free first use of Armory) ===
      quest4_equipCigar: {
        id: 'quest4_equipCigar',
        name: 'Equip the Cigar',
        description: 'Open the Armory, navigate to the Gear section in your inventory, and equip the Cigar',
        objectives: 'Equip the Cigar from your inventory',
        claim: 'Main Building',
        rewardGold: 100,
        rewardSkillPoints: 1,
        rewardAttributePoints: 2,
        message: "Cigar equipped! 🚬<br><br>Feel that power — +1 to all stats!<br><br>You've unlocked the <b>Training Hall</b> — a free Attribute Point awaits you there!",
        nextQuest: 'quest5_upgradeAttr',
        conditions: ['quest3_stonehengeGear']
      },

      // === PHASE 5: Camp quest → Use Training Hall (free first use) → Unlock Training Hall ===
      quest5_upgradeAttr: {
        id: 'quest5_upgradeAttr',
        name: 'Upgrade an Attribute',
        description: 'Open the Training Hall and spend the attribute point you received to upgrade any stat',
        objectives: 'Spend 1 attribute point in the Training Hall',
        claim: 'Main Building',
        rewardGold: 100,
        rewardSkillPoints: 1,
        rewardAttributePoints: 3,
        unlockBuildingOnActivation: 'trainingHall',
        unlockBuilding: 'achievementBuilding',
        message: "💪 Attribute upgraded!<br><br>You earned <b>+3 free Attribute Points</b> and <b>+1 Skill Point</b>!<br><br>The <b>Achievement Building</b> is now unlocked — visit it to claim badges!",
        nextQuest: 'quest6_survive2min',
        conditions: ['quest4_equipCigar']
      },

      // === PHASE 6: Run quest → Survive 2 minutes → Unlock Forge ===
      quest6_survive2min: {
        id: 'quest6_survive2min',
        name: 'Survive 2 Minutes',
        description: 'Head out on a run and survive for at least 2 minutes',
        objectives: 'Survive 120 seconds in a run',
        claim: 'Main Building',
        triggerOnDeath: true,
        rewardGold: 100,
        rewardSkillPoints: 1,
        rewardAttributePoints: 2,
        unlockBuilding: 'forge',
        message: "⏱️ You survived 2 minutes!<br><br>The <b>Progression Upgrades</b> building is now unlocked! Buy your first upgrade there.",
        nextQuest: 'quest7_buyProgression',
        conditions: ['quest5_upgradeAttr']
      },

      // === PHASE 7: Camp quest → Use Forge/Progression Shop (free first use) ===
      quest7_buyProgression: {
        id: 'quest7_buyProgression',
        name: 'Buy a Progression Upgrade',
        description: 'Open the Progression Upgrades building and buy any upgrade',
        objectives: 'Purchase any progression upgrade',
        claim: 'Main Building',
        rewardGold: 150,
        rewardSkillPoints: 1,
        unlockBuilding: 'warehouse',
        message: "⚒️ Upgrade purchased!<br><br>Each upgrade makes you permanently stronger. Time to prove your might!<br><br>The <b>Warehouse</b> is now unlocked — store and manage your resources there!",
        nextQuest: 'quest8_kill10',
        conditions: ['quest6_survive2min']
      },

      // === PHASE 8: Run quest → Kill 10 enemies → Unlock Companion House ===
      quest8_kill10: {
        id: 'quest8_kill10',
        name: 'Kill 10 Enemies',
        description: 'Head out and eliminate 10 enemies in a single run',
        objectives: 'Kill 10 enemies in one run',
        triggerOnDeath: true,
        rewardGold: 200,
        rewardSkillPoints: 1,
        unlockBuilding: 'companionHouse',
        companionEgg: true,
        message: "⚔️ 10 Enemies Defeated!<br><br>A <b>Companion Egg</b> has appeared! The <b>Companion House</b> is now unlocked. Visit it to activate your companion!",
        nextQuest: 'quest9_activateCompanion',
        conditions: ['quest7_buyProgression']
      },

      // === PHASE 9: Camp quest → Use Companion House (free first use) ===
      quest9_activateCompanion: {
        id: 'quest9_activateCompanion',
        name: 'Activate Your Companion',
        description: 'Visit the Companion House and activate your companion to fight by your side',
        objectives: 'Activate a companion',
        claim: 'Main Building',
        rewardGold: 150,
        rewardSkillPoints: 1,
        rewardAttributePoints: 1,
        unlockBuilding: 'shop',
        message: "🐺 Companion activated!<br><br>They will fight by your side in battle!<br><br>The <b>Shop</b> is now open — buy powerful items to aid your journey!<br><br>Now go on a run and kill <b>15 enemies</b> to prove your combined strength!",
        nextQuest: 'quest10_kill15',
        conditions: ['quest8_kill10']
      },

      // === PHASE 10: Run quest → Kill 15 enemies → Unlock Prestige Altar ===
      quest10_kill15: {
        id: 'quest10_kill15',
        name: 'Kill 15 Enemies',
        description: 'Head out and eliminate 15 enemies in a single run',
        objectives: 'Kill 15 enemies in one run',
        triggerOnDeath: true,
        rewardGold: 300,
        rewardSkillPoints: 2,
        unlockBuilding: 'prestige',
        message: "🎉 15 Kills! Well done!<br><br>The <b>Prestige Altar</b> has awakened — you may now begin the path of Prestige!<br><br>Explore the world — find every landmark (Stonehenge, Pyramid, Montana, Tesla Tower) to unlock the Achievement Building!",
        nextQuest: 'quest11_findAllLandmarks',
        conditions: ['quest9_activateCompanion']
      },

      // === PHASE 11: Run quest → Find all landmarks → Unlock Achievement Building ===
      quest11_findAllLandmarks: {
        id: 'quest11_findAllLandmarks',
        name: 'Find Every Landmark',
        description: 'Explore the map and find every landmark: Stonehenge, Pyramid, Montana, and the Tesla Tower',
        objectives: 'Find: Stonehenge ☐  Pyramid ☐  Montana ☐  Tesla Tower ☐',
        triggerOnDeath: false,
        rewardGold: 750,
        rewardSkillPoints: 3,
        rewardAttributePoints: 2,
        unlockBuilding: 'achievementBuilding',
        message: "🗺️ ALL LANDMARKS FOUND!<br><br>You've explored the entire world!<br><br>The <b>Achievement Building</b> is now unlocked in Camp. Visit it to claim your achievements!",
        nextQuest: 'quest12_visitAchievements',
        conditions: ['quest10_kill15']
      },

      // === PHASE 12: Camp quest → Visit Achievement Building (free first use) ===
      quest12_visitAchievements: {
        id: 'quest12_visitAchievements',
        name: 'Visit the Achievement Building',
        description: 'Head to Camp and visit the newly unlocked Achievement Building',
        objectives: 'Open the Achievement Building in Camp',
        claim: 'Achievement Building',
        rewardGold: 300,
        rewardSkillPoints: 2,
        message: "🏆 Achievement Hall visited!<br><br>Now head to the <b>Windmill</b> on the map and talk to the farmer — a special challenge awaits!",
        nextQuest: 'quest13_windmill',
        conditions: ['quest11_findAllLandmarks']
      },

      // === PHASE 13: Run quest → Defend Windmill ===
      quest13_windmill: {
        id: 'quest13_windmill',
        name: 'Defend the Windmill',
        description: 'Find the Windmill on the map and talk to the farmer. Defend the windmill for 15 seconds to earn a special run reward!',
        objectives: 'Find the Windmill and defend it for the farmer',
        claim: 'Quest Hall',
        rewardGold: 400,
        rewardSkillPoints: 2,
        triggerOnDeath: false,
        message: "🏆 WINDMILL DEFENDED!<br><br>The farmer is grateful! Each run, if you defend the windmill you'll earn a <b>temporary Double Barrel Gun</b>.<br><br>Next: kill <b>25 enemies</b> to prove your strength!",
        nextQuest: 'quest14_kill25',
        conditions: ['quest12_visitAchievements']
      },

      // === PHASE 14: Run quest → Kill 25 enemies ===
      quest14_kill25: {
        id: 'quest14_kill25',
        name: 'Kill 25 Enemies',
        description: 'Head out and eliminate 25 enemies in a single run',
        objectives: 'Kill 25 enemies in one run',
        triggerOnDeath: true,
        rewardGold: 500,
        rewardSkillPoints: 2,
        rewardAttributePoints: 2,
        message: "💪 25 Kills! You're a true survivor!<br><br>Head to the <b>Account Building</b> in camp to review your progress and stats!",
        nextQuest: 'quest15_accountVisit',
        conditions: ['quest13_windmill']
      },

      // === PHASE 15: Camp quest → Check Account stats ===
      quest15_accountVisit: {
        id: 'quest15_accountVisit',
        name: 'Check Your Account Stats',
        description: 'Visit the Account & Records building in camp to see your full stats and progression',
        objectives: 'Open the Account building in Camp',
        claim: 'Account Building',
        autoClaim: true,
        rewardGold: 200,
        rewardSkillPoints: 1,
        rewardAttributePoints: 3,
        message: "📊 Account reviewed!<br><br>A new building has appeared — the <b>Character Visuals</b> studio! Visit it to customize your look.",
        nextQuest: 'quest16_visitCharVisuals',
        conditions: ['quest14_kill25']
      },

      // === PHASE 16: Camp quest → Visit Character Visuals building ===
      quest16_visitCharVisuals: {
        id: 'quest16_visitCharVisuals',
        name: 'Visit Character Visuals',
        description: 'Head to Camp and open the Character Visuals building to customize your appearance',
        objectives: 'Open the Character Visuals building in Camp',
        claim: 'Main Building',
        rewardGold: 200,
        rewardSkillPoints: 1,
        unlockBuilding: 'characterVisuals',
        message: "🎨 Character Visuals unlocked!<br><br>Customize your look with accessories, animations, and outfits!<br><br>Next: open the <b>Codex</b> to learn about all the creatures and landmarks you've encountered!",
        nextQuest: 'quest17_visitCodex',
        conditions: ['quest15_accountVisit']
      },

      // === PHASE 17: Camp quest → Visit Codex building ===
      quest17_visitCodex: {
        id: 'quest17_visitCodex',
        name: 'Visit the Codex',
        description: 'Head to Camp and open the Codex building to browse the encyclopedia of the world',
        objectives: 'Open the Codex building in Camp',
        claim: 'Main Building',
        rewardGold: 300,
        rewardSkillPoints: 2,
        unlockBuilding: 'codex',
        message: "📖 Codex unlocked!<br><br>Browse all enemies, structures, and landmarks.<br><br>A strange signal was detected from the <b>Sci-Fi Region</b>... Head to <b>Area 51</b> on the map to investigate!",
        nextQuest: 'quest18_findCompanionEgg',
        conditions: ['quest16_visitCharVisuals']
      },

      // === PHASE 18: Run quest → Find Companion Egg at UFO sight in Area 51 ===
      quest18_findCompanionEgg: {
        id: 'quest18_findCompanionEgg',
        name: 'Find the Companion Egg',
        description: 'A mysterious signal leads to the UFO crash site in Area 51. Find the glowing Companion Egg hidden there!',
        objectives: 'Find the Companion Egg at the UFO sight in Area 51',
        claim: 'Main Building',
        rewardGold: 500,
        rewardSkillPoints: 3,
        rewardAttributePoints: 2,
        triggerOnDeath: false,
        questObjectivePos: { x: -150, z: 60 },
        message: "🥚 COMPANION EGG FOUND!<br><br>You discovered a mysterious egg at the UFO crash site! Take it to the <b>Companion House</b> in camp to hatch it!",
        nextQuest: 'quest19_hatchEgg',
        conditions: ['quest17_visitCodex']
      },

      // === PHASE 19: Camp quest → Place egg in Companion House and hatch it ===
      quest19_hatchEgg: {
        id: 'quest19_hatchEgg',
        name: 'Hatch the Companion Egg',
        description: 'Bring the Companion Egg to the Companion House and place it in the nest to hatch your new companion!',
        objectives: 'Place and hatch the egg in the Companion House',
        claim: 'Companion House',
        rewardGold: 600,
        rewardSkillPoints: 3,
        rewardAttributePoints: 3,
        message: "🐣 COMPANION HATCHED!<br><br>Your new companion has hatched! Train it in the <b>Companion House</b> to unlock powerful abilities and grow it into a mighty ally!",
        nextQuest: 'quest20_trainCompanion',
        conditions: ['quest18_findCompanionEgg']
      },

      // === PHASE 20: Camp quest → Train companion (level it up once) ===
      quest20_trainCompanion: {
        id: 'quest20_trainCompanion',
        name: 'Train Your Companion',
        description: 'Take your companion on a run to earn XP and level it up. Then visit the Companion House to unlock a skill!',
        objectives: 'Level up your companion and unlock a skill',
        claim: 'Companion House',
        rewardGold: 400,
        rewardSkillPoints: 2,
        rewardAttributePoints: 2,
        unlockBuilding: 'campBoard',
        message: "⚔️ Companion trained!<br><br>Your companion grows stronger with every battle!<br><br>A <b>Camp Board</b> has appeared near the campfire — use it for instant access to ALL camp features without walking to each building!",
        nextQuest: 'quest21_useCampBoard',
        conditions: ['quest19_hatchEgg']
      },

      // === PHASE 21: Use the Camp Board (Fast Access) ===
      quest21_useCampBoard: {
        id: 'quest21_useCampBoard',
        name: 'Use the Camp Board',
        description: 'The Camp Board near the campfire gives you fast access to every camp feature. Open it now!',
        objectives: 'Interact with the Camp Board near the campfire',
        claim: 'Quest Hall',
        rewardGold: 500,
        rewardSkillPoints: 3,
        rewardAttributePoints: 3,
        message: "📋 CAMP BOARD MASTERED!<br><br>You can now open <b>ALL</b> camp features instantly from the Camp Board near the campfire!<br><br>⛏️ <b>NEXT:</b> Visit the Store and buy your first Harvesting Tool to gather resources from the world!",
        nextQuest: 'quest22_buyFirstTool',
        conditions: ['quest20_trainCompanion']
      },

      // === HARVESTING QUESTLINE ===

      // === PHASE 22: Buy first harvesting tool from Store ===
      quest22_buyFirstTool: {
        id: 'quest22_buyFirstTool',
        name: 'Buy a Harvesting Tool',
        description: 'Visit the Store in camp and purchase your first harvesting tool (Axe, Sledgehammer, Pickaxe, or Essence Rod).',
        objectives: 'Buy any harvesting tool from the Store',
        claim: 'Main Building',
        rewardGold: 400,
        rewardSkillPoints: 2,
        message: "🪓 Tool acquired!<br><br>You now have a harvesting tool!<br><br>🌍 Head out on a run and use it on resource nodes — look for <b>🪨 rocks, 🌲 trees, ⚙️ iron deposits, and ✨ magic nodes</b> scattered across the map!",
        nextQuest: 'quest23_harvestFirst',
        conditions: ['quest21_useCampBoard']
      },

      // === PHASE 23: Harvest first resource node ===
      quest23_harvestFirst: {
        id: 'quest23_harvestFirst',
        name: 'Harvest a Resource',
        description: 'Approach a resource node on the map and stand near it to harvest it with your equipped tool.',
        objectives: 'Harvest any 1 resource node',
        triggerOnDeath: false,
        rewardGold: 300,
        rewardSkillPoints: 2,
        message: "⛏️ First harvest complete!<br><br>You gathered your first resource!<br><br>💎 Now try harvesting <b>5 Wood</b> and <b>5 Stone</b> to unlock the Forge crafting system!",
        nextQuest: 'quest24_harvestWoodStone',
        conditions: ['quest22_buyFirstTool']
      },

      // === PHASE 24: Gather wood and stone ===
      quest24_harvestWoodStone: {
        id: 'quest24_harvestWoodStone',
        name: 'Gather Wood & Stone',
        description: 'Harvest trees (wood) with your Axe and rocks (stone) with your Sledgehammer.',
        objectives: 'Collect 5 Wood and 5 Stone',
        triggerOnDeath: false,
        rewardGold: 600,
        rewardSkillPoints: 3,
        message: "🌲🪨 Materials gathered!<br><br>Excellent work gathering resources!<br><br>⚒️ Visit the <b>Forge</b> to smelt your materials and craft an <b>Epic tool</b>!",
        nextQuest: 'quest25_useForge',
        conditions: ['quest23_harvestFirst']
      },

      // === PHASE 25: Use the Forge to craft an Epic tool ===
      quest25_useForge: {
        id: 'quest25_useForge',
        name: 'Forge an Epic Tool',
        description: 'Open the Forge building in camp and upgrade one of your harvesting tools to Epic rarity.',
        objectives: 'Craft any Epic harvesting tool in the Forge',
        claim: 'Forge',
        rewardGold: 1000,
        rewardSkillPoints: 5,
        rewardAttributePoints: 3,
        message: "⚒️ EPIC TOOL CRAFTED!<br><br>Your Epic tool harvests <b>2.5× more resources</b> from each node!<br><br>🔥 Keep exploring — find <b>Coal, Iron, Crystals</b> and <b>Magic Nodes</b> to gather advanced materials for even more powerful upgrades!",
        nextQuest: null,
        conditions: ['quest24_harvestWoodStone']
      }
    };

    const buildingQuestUnlockMap = {
      'skillTree': 'quest1_kill3',
      'armory': 'quest3_stonehengeGear',
      'trainingHall': 'quest5_upgradeAttr',
      'forge': 'quest6_survive2min',
      'companionHouse': 'quest8_kill10',
      'achievementBuilding': 'quest11_findAllLandmarks',
      'characterVisuals': 'quest16_visitCharVisuals',
      'codex': 'quest17_visitCodex',
      'campBoard': 'quest20_trainCompanion'
    };
    
    // Get current quest object
    function getCurrentQuest() {
      const questId = saveData.tutorialQuests.currentQuest;
      return questId ? TUTORIAL_QUESTS[questId] : null;
    }
    
    // Helper: ensure quest2 is activated and check if both skills are already bought
    function ensureQuest2Activated() {
      if (!saveData.tutorialQuests) return;
      // Auto-activate quest2 if quest1 is claimed but quest2 hasn't started
      if (
        isQuestClaimed('quest1_kill3') &&
        !saveData.tutorialQuests.currentQuest &&
        !isQuestClaimed('quest2_spendSkills') &&
        !saveData.tutorialQuests.readyToClaim.includes('quest2_spendSkills')
      ) {
        saveData.tutorialQuests.currentQuest = 'quest2_spendSkills';
      }
      // If quest2 is active, check if three skills have been bought
      if (saveData.tutorialQuests.currentQuest === 'quest2_spendSkills') {
        const totalSkillsBought = Object.values(saveData.skillTree).filter(s => s && s.level > 0).length;
        if (totalSkillsBought >= 3) {
          progressTutorialQuest('quest2_spendSkills', true);
        }
      }
    }
    
    // Check if quest conditions are fulfilled
    function checkQuestConditions(questId) {
      const quest = TUTORIAL_QUESTS[questId];
      if (!quest) return false;
      
      const completedQuests = saveData.tutorialQuests.completedQuests || [];
      const completedSet = new Set(completedQuests); // Use Set for O(1) lookup
      
      // Check conditionsAny - quest is available if ANY of these are claimed
      if (quest.conditionsAny && quest.conditionsAny.length > 0) {
        const anyMet = quest.conditionsAny.some(cId => completedSet.has(cId));
        if (!anyMet) {
          console.log(`Quest ${questId} blocked: requires any of ${quest.conditionsAny.join(', ')} to be claimed`);
          return false;
        }
        return true;
      }
      
      // If no conditions, quest is always available
      if (!quest.conditions || quest.conditions.length === 0) {
        return true;
      }
      
      // Check if all prerequisite quests are claimed (completed)
      for (const conditionQuestId of quest.conditions) {
        if (!completedSet.has(conditionQuestId)) {
          console.log(`Quest ${questId} blocked: requires ${conditionQuestId} to be claimed`);
          return false;
        }
      }
      
      return true;
    }
    
    // Check if a quest is claimed (completed)
    function isQuestClaimed(questId) {
      const completedQuests = saveData.tutorialQuests.completedQuests || [];
      return completedQuests.includes(questId);
    }
    
    // Check if a building has an active quest
    function hasQuestForBuilding(buildingId) {
      // Legacy support
      return false;
    }
    
    // Progress tutorial quest
    function progressTutorialQuest(questId, completed = false) {
      if (saveData.tutorialQuests.currentQuest !== questId) return;
      // Guard: if already in readyToClaim, don't re-trigger
      if (saveData.tutorialQuests.readyToClaim && saveData.tutorialQuests.readyToClaim.includes(questId)) return;
      // Guard: if already completed, don't re-trigger
      if (saveData.tutorialQuests.completedQuests && saveData.tutorialQuests.completedQuests.includes(questId)) return;
      
      const quest = TUTORIAL_QUESTS[questId];
      if (!quest) return;
      
      if (completed) {
        // Auto-claim quests complete immediately
        if (quest.autoClaim) {
          claimTutorialQuest(questId);
        } else {
          // Mark quest as ready to claim
          if (!saveData.tutorialQuests.readyToClaim.includes(questId)) {
            saveData.tutorialQuests.readyToClaim.push(questId);
          }
          
          // Clear current quest
          saveData.tutorialQuests.currentQuest = null;
          updateQuestTracker();
          
          // Quest 2 fix: close skill tree panel so it doesn't stay open after completion
          if (questId === 'quest2_spendSkills') {
            const skillsSection = document.getElementById('camp-skills-section');
            const buildingsSection = document.getElementById('camp-buildings-section');
            if (skillsSection) skillsSection.style.display = 'none';
            if (buildingsSection) buildingsSection.style.display = 'block'; // Show buildings (camp main view)
            const skillsTab = document.getElementById('camp-skills-tab');
            if (skillsTab) skillsTab.style.background = '#3a3a3a';
            const buildingsTab = document.getElementById('camp-buildings-tab');
            if (buildingsTab) buildingsTab.style.background = '#5A3A31';
          }
          
          // Show notification
          showStatChange('📜 Quest Complete! Return to Main Building to claim!');
          chatSystemMessage('📜 Quest "' + quest.name + '" complete! Go to Camp to claim your reward.');
        }
        
        saveSaveData();
      }
    }
    
    // Claim a tutorial quest - REWRITTEN for reliability
    function claimTutorialQuest(questId) {
      const quest = TUTORIAL_QUESTS[questId];
      if (!quest) {
        console.error('Quest not found:', questId);
        return;
      }
      
      // Guard: prevent double-claiming if quest was already completed
      if (saveData.tutorialQuests.completedQuests.includes(questId)) {
        console.warn('[Quest] Already claimed:', questId);
        return;
      }
      
      // Remove from ready to claim
      const index = saveData.tutorialQuests.readyToClaim.indexOf(questId);
      if (index > -1) {
        saveData.tutorialQuests.readyToClaim.splice(index, 1);
      }
      
      // Add to completed
      if (!saveData.tutorialQuests.completedQuests.includes(questId)) {
        saveData.tutorialQuests.completedQuests.push(questId);
      }
      // Give rewards
      if (quest.rewardGold) {
        saveData.gold += quest.rewardGold;
        showStatChange(`+${quest.rewardGold} Gold!`);
      }
      // Award 50 bonus gold for every quest claimed
      saveData.gold += 50;
      showStatChange('+50 Gold!');
      if (quest.rewardSkillPoints) {
        saveData.skillPoints += quest.rewardSkillPoints;
        showStatChange(`+${quest.rewardSkillPoints} Skill Points!`);
      }
      if (quest.rewardAttributePoints) {
        saveData.trainingPoints = (saveData.trainingPoints || 0) + quest.rewardAttributePoints;
        showStatChange(`+${quest.rewardAttributePoints} Attribute Points!`);
      }
      if (quest.rewardSAP) {
        saveData.specialAtkPoints = (saveData.specialAtkPoints || 0) + quest.rewardSAP;
        showStatChange(`+${quest.rewardSAP} Special Atk Points!`);
      }
      // Award account XP for completing a quest (50 XP per quest)
      addAccountXP(50);
      chatSystemMessage('🎁 Quest "' + quest.name + '" claimed! Rewards received.');
      
      // Unlock building on CLAIM (only for quests that use unlockBuilding, e.g. quest1 for SkillTree)
      if (quest.unlockBuilding && saveData.campBuildings[quest.unlockBuilding]) {
        saveData.campBuildings[quest.unlockBuilding].unlocked = true;
        if (saveData.campBuildings[quest.unlockBuilding].level === 0) {
          saveData.campBuildings[quest.unlockBuilding].level = 1;
        }
        const buildingName = CAMP_BUILDINGS[quest.unlockBuilding]?.name || 'Building';
        showStatChange(`🏛️ ${buildingName} Unlocked!`);
        // Benny walks to the building and builds it, then play unlock animation
        if (window.CampWorld && window.CampWorld.isActive) {
          window.CampWorld.bennyWalkToBuild(quest.unlockBuilding,
            'Time to build\nthe ' + buildingName + '! 🔨');
          // Delay the unlock animation to sync with Benny arriving (1.2s walk)
          setTimeout(function () {
            window.CampWorld.refreshBuildings(saveData);
            window.CampWorld.playBuildingUnlockAnimation(quest.unlockBuilding);
          }, 1300);
        } else if (window.CampWorld) {
          window.CampWorld.refreshBuildings(saveData);
          window.CampWorld.playBuildingUnlockAnimation(quest.unlockBuilding);
        }
      }
      
      // Give companion egg
      if (quest.companionEgg) {
        if (saveData.companions && saveData.companions.stormWolf) {
          saveData.companions.stormWolf.unlocked = true;
        }
        showStatChange('🥚 Companion Egg Received!');
      }
      
      // Give item
      if (quest.giveItem) {
        saveData.inventory.push(quest.giveItem);
        if (quest.autoEquip && saveData.equippedGear) {
          // Equip to appropriate slot based on item type
          const itemType = quest.giveItem.type || 'ring';
          saveData.equippedGear[itemType] = quest.giveItem;
          showStatChange(`🎯 ${quest.giveItem.name} Auto-Equipped!`);
        } else {
          showStatChange(`📦 ${quest.giveItem.name} Acquired!`);
        }
      }
      
      // Tutorial complete: unlock all remaining buildings so player can explore full camp
      if (questId === 'quest10_kill15') {
        const buildingsToUnlock = ['companionHouse', 'workshop', 'trashRecycle'];
        buildingsToUnlock.forEach(bld => {
          if (saveData.campBuildings[bld] && !saveData.campBuildings[bld].unlocked) {
            saveData.campBuildings[bld].unlocked = true;
            if (saveData.campBuildings[bld].level === 0) saveData.campBuildings[bld].level = 1;
            const bldName = CAMP_BUILDINGS[bld]?.name || 'Building';
            showStatChange(`🏛️ ${bldName} Unlocked!`);
          }
        });
      }

      // Quest 8: also unlock the Tavern alongside Companion House
      if (questId === 'quest8_kill10') {
        if (saveData.campBuildings['tavern'] && !saveData.campBuildings['tavern'].unlocked) {
          saveData.campBuildings['tavern'].unlocked = true;
          if (saveData.campBuildings['tavern'].level === 0) saveData.campBuildings['tavern'].level = 1;
          showStatChange('🏛️ Tavern Unlocked!');
          if (window.CampWorld) {
            window.CampWorld.refreshBuildings(saveData);
            window.CampWorld.playBuildingUnlockAnimation('tavern');
          }
        }
      }
      
      // --- AUTO-CHAIN: Activate next quest IMMEDIATELY (synchronous) ---
      let nextQuestActivated = null;
      if (quest.nextQuest && checkQuestConditions(quest.nextQuest)) {
        saveData.tutorialQuests.currentQuest = quest.nextQuest;
        nextQuestActivated = TUTORIAL_QUESTS[quest.nextQuest] || null;
        
        // Unlock building on ACTIVATION for next quest (so player can complete it)
        if (nextQuestActivated && nextQuestActivated.unlockBuildingOnActivation) {
          const bld = nextQuestActivated.unlockBuildingOnActivation;
          if (saveData.campBuildings[bld]) {
            saveData.campBuildings[bld].unlocked = true;
            if (saveData.campBuildings[bld].level === 0) { saveData.campBuildings[bld].level = 1; }
            const bldName = CAMP_BUILDINGS[bld]?.name || 'Building';
            showStatChange(`🏛️ ${bldName} Unlocked!`);
            if (window.CampWorld) {
              window.CampWorld.refreshBuildings(saveData);
              window.CampWorld.playBuildingUnlockAnimation(bld);
            }
          }
        }
      }
      
      // Save immediately after rewards and quest activation
      saveSaveData();
      updateQuestTracker();
      
      // Build the combined popup message: reward info + new quest info
      const claimMsg = quest.message || `Quest Complete! ${quest.rewardGold ? `+${quest.rewardGold} gold` : ''} ${quest.rewardSkillPoints ? `+${quest.rewardSkillPoints} skill points` : ''}`;
      let combinedMessage = claimMsg;
      if (nextQuestActivated) {
        combinedMessage += `<br><br><hr style="border-color:#FFD700;opacity:0.4;margin:10px 0;"><br><span style="color:#FFD700;font-size:18px;font-family:'Bangers',cursive;letter-spacing:1px;">📜 NEW QUEST: ${nextQuestActivated.name}</span><br><span style="color:#ccc;font-size:14px;">${nextQuestActivated.description}</span><br><small style="color:#aaa;">Objective: ${nextQuestActivated.objectives}</small>`;
      }
      
      if (!quest.autoClaim) {
        // Show single combined popup (claim reward + new quest info)
        showComicInfoBox(
          '✨ Quest Complete!',
          combinedMessage,
          'Continue',
          () => {
            // Trigger Stonehenge cinematic after closing popup if next quest involves stonehenge
            if (quest.nextQuest === 'quest3_stonehengeGear' && window.stonehengeChest) {
              if (!saveData.tutorialQuests.stonehengeChestCinematicShown) {
                triggerCinematic('stonehenge', window.stonehengeChest.position, 2000);
                saveData.tutorialQuests.stonehengeChestCinematicShown = true;
                saveSaveData();
              }
            }
            updateCampScreen();
          }
        );
      } else {
        // Auto-claim: show next quest popup if one was activated
        if (nextQuestActivated) {
          showNextQuestPopup(quest.nextQuest);
          // Trigger Stonehenge cinematic when quest3_stonehengeGear starts
          if (quest.nextQuest === 'quest3_stonehengeGear' && window.stonehengeChest) {
            setTimeout(() => {
              if (!saveData.tutorialQuests.stonehengeChestCinematicShown) {
                triggerCinematic('stonehenge', window.stonehengeChest.position, 2000);
                saveData.tutorialQuests.stonehengeChestCinematicShown = true;
                saveSaveData();
              }
            }, 500);
          }
        }
      }
    }
    
    // Expose globally for inline onclick handlers and external access
    window.claimTutorialQuest = claimTutorialQuest;
    window.checkQuestConditions = checkQuestConditions;
    window.isQuestClaimed = isQuestClaimed;
    window.getCurrentQuest = getCurrentQuest;
    
    // Show next quest popup
    function showNextQuestPopup(questId) {
      const quest = TUTORIAL_QUESTS[questId];
      if (!quest) return;
      
      showComicInfoBox(
        `📜 ${quest.name}`,
        `${quest.description}<br><br><b>Objective:</b> ${quest.objectives}${quest.claim ? `<br><b>Claim:</b> ${quest.claim}` : ''}`,
        'Continue'
      );
    }
    
    // Legacy function for backward compatibility
    function progressQuest(questId, completed = false) {
      // Forward to tutorial quest system
      progressTutorialQuest(questId, completed);
    }
    
    // Legacy function for backward compatibility  
    function claimQuest(questId) {
      // Forward to tutorial quest system
      claimTutorialQuest(questId);
    }
    
    // Advance to next quest in story chain
    function advanceQuestChain() {
      // Quest1 is now activated via the Main Building (showQuestHall), not here.
      // This function is kept for any future use but no longer auto-starts quest1.
    }
    
    // Helper: should questMission building show notification glow?
    function isQuestMissionReady() {
      const tq = saveData && saveData.tutorialQuests;
      if (!tq) return false;
      return (tq.readyToClaim && tq.readyToClaim.length > 0) ||
             (tq.firstDeathShown && !tq.currentQuest && !isQuestClaimed('quest1_kill3'));
    }
    
    // Update quest tracker in camp screen
    function updateQuestTracker() {
      const questTracker = document.getElementById('quest-tracker');
      if (!questTracker) return;
      
      const currentQuest = getCurrentQuest();
      const completedQuests = (saveData.tutorialQuests && saveData.tutorialQuests.completedQuests) || [];
      const readyToClaim = (saveData.tutorialQuests && saveData.tutorialQuests.readyToClaim) || [];
      const totalQuests = Object.keys(TUTORIAL_QUESTS).length;
      
      // Hide tracker if no quest is active or ready, and no recently completed quest, and player hasn't died yet
      if (!saveData.tutorialQuests.firstDeathShown && !currentQuest && completedQuests.length === 0) {
        questTracker.style.display = 'none';
        return;
      }
      if (!currentQuest && completedQuests.length === 0 && readyToClaim.length === 0) {
        questTracker.style.display = 'none';
        return;
      }
      
      questTracker.innerHTML = '';
      
      // Quest completion summary
      if (completedQuests.length > 0) {
        const summaryEl = document.createElement('div');
        summaryEl.style.cssText = 'font-size: 10px; color: #999; margin-bottom: 4px;';
        summaryEl.textContent = `✅ ${completedQuests.length}/${totalQuests} done`;
        questTracker.appendChild(summaryEl);
      }
      
      // Show last completed quest with strikethrough
      if (completedQuests.length > 0) {
        const lastCompletedId = completedQuests[completedQuests.length - 1];
        const lastCompleted = TUTORIAL_QUESTS[lastCompletedId];
        if (lastCompleted && lastCompleted.name) {
          const completedEl = document.createElement('div');
          completedEl.style.cssText = 'font-size: 10px; color: #4CAF50; text-decoration: line-through; margin-bottom: 3px;';
          completedEl.setAttribute('aria-label', `Completed: ${lastCompleted.name}`);
          completedEl.textContent = `✓ ${lastCompleted.name}`;
          questTracker.appendChild(completedEl);
        }
      }
      
      // Show current active quest with name prominently
      if (currentQuest && saveData.tutorialQuests.firstDeathShown) {
        // Build progress info for kill-based quests
        let progressText = '';
        const killsNow = (saveData.tutorialQuests && saveData.tutorialQuests.killsThisRun) || 0;
        if (currentQuest.id === 'quest1_kill3') {
          progressText = ` (${Math.min(killsNow, 3)}/3)`;
        } else if (currentQuest.id === 'quest8_kill10') {
          progressText = ` (${Math.min(killsNow, 10)}/10)`;
        } else if (currentQuest.id === 'quest10_kill15') {
          progressText = ` (${Math.min(killsNow, 15)}/15)`;
        } else if (currentQuest.id === 'quest14_kill25') {
          progressText = ` (${Math.min(killsNow, 25)}/25)`;
        }
        
        const nameEl = document.createElement('b');
        nameEl.style.cssText = 'color: #FFD700; font-size: 12px;';
        nameEl.textContent = `📜 ${currentQuest.name}`;
        const progEl = document.createElement('div');
        progEl.style.cssText = 'font-size: 11px; color: #ccc; margin-top: 2px;';
        progEl.textContent = progressText || 'Active';
        questTracker.appendChild(nameEl);
        questTracker.appendChild(progEl);
      } else if (readyToClaim.length > 0) {
        const readyEl = document.createElement('b');
        readyEl.style.cssText = 'color: #FFD700; font-size: 12px;';
        readyEl.setAttribute('aria-label', 'Quest reward ready to claim at Main Building');
        readyEl.textContent = '🎁 Claim Reward!';
        questTracker.appendChild(readyEl);
      }
      
      // Side quest indicator
      if (saveData.achievementQuests && saveData.achievementQuests.kill7Quest === 'active') {
        const sideEl = document.createElement('div');
        sideEl.style.cssText = 'font-size: 10px; color: #9b59b6; margin-top: 3px;';
        sideEl.textContent = '⭐ Side Quest Active';
        questTracker.appendChild(sideEl);
      }
      
      questTracker.style.display = 'block';
    }

