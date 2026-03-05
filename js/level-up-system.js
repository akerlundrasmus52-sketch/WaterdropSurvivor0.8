// js/level-up-system.js — Level-up upgrade modal (showUpgradeModal), LightningBolt class,
// floating level-up text, slow motion effect, upgrade card rendering.
// Depends on: all previously loaded game files

    function showUpgradeModal(isBonusRound = false) {
      // Bail out if the game has ended; prevents stale setTimeout from showing modal post-death
      if (isGameOver || !isGameActive) {
        levelUpPending = false;
        return;
      }
      const modal = document.getElementById('levelup-modal');
      const list = document.getElementById('upgrade-list');
      list.innerHTML = '';
      // Reset header for two-press system
      const h2 = modal.querySelector('h2');
      if (h2) {
        h2.innerText = isBonusRound ? 'BONUS UPGRADE!' : 'LEVEL UP!';
        h2.style.color = isBonusRound ? '#FFD700' : '';
        h2.style.fontSize = '24px';
        h2.style.animation = 'levelUpFly 1s ease-out forwards';
      }      
      let choices = [];

      // --- POOL OF UPGRADES ---
      const commonUpgrades = [
        { 
          id: 'str', 
          icon: '⚔️',
          title: 'TIDAL FORCE', 
          desc: 'Weapon Damage +6%', 
          apply: () => { 
            playerStats.strength += 0.06; // Reduced from 0.15 to 0.06 for level-100 balance
            showStatChange('+6% Damage');
          } 
        },
        { 
          id: 'aspd', 
          icon: '⚡',
          title: 'RAPID CURRENT', 
          desc: 'Attack Speed +3%', 
          apply: () => { 
            playerStats.atkSpeed += 0.03; // Reduced from 0.15 to 0.03 for level-100 balance
            weapons.gun.cooldown *= 0.97; // Adjusted from 0.85 to 0.97
            weapons.doubleBarrel.cooldown *= 0.97;
            showStatChange('+3% Attack Speed');
          } 
        },
        { 
          id: 'armor', 
          icon: '🛡️',
          title: 'HARDENED SHELL', 
          desc: 'Armor +12% (Damage Reduction, Max 80%)', 
          apply: () => { 
            playerStats.armor = Math.min(80, playerStats.armor + 12); 
            showStatChange('+12% Armor (Current: ' + playerStats.armor + '%)');
          } 
        },
        { 
          id: 'hp', 
          icon: '❤️',
          title: 'DEEP RESERVOIR', 
          desc: 'Max HP +30 (Instant Heal +30)', 
          apply: () => { 
            playerStats.maxHp += 30; 
            playerStats.hp += 30; 
            showStatChange('+30 Max HP');
          } 
        },
        { 
          id: 'crit', 
          icon: '🎯',
          title: 'PRECISION STRIKE', 
          desc: 'Critical Hit Chance +1.5%', 
          apply: () => { 
            playerStats.critChance += 0.015; // Reduced from 0.08 to 0.015 for level-100 balance
            showStatChange('+1.5% Crit Chance (Now: ' + Math.round(playerStats.critChance * 100) + '%)');
          } 
        },
        { 
          id: 'regen', 
          icon: '💚',
          title: 'SPRING WATER', 
          desc: 'HP Regeneration +2/sec (Passive Healing)', 
          apply: () => { 
            playerStats.hpRegen += 2; 
            showStatChange('+2 HP/sec Regen (Total: ' + playerStats.hpRegen + '/sec)');
          } 
        },
        { 
          id: 'speed', 
          icon: '🏃',
          title: 'SWIFT STREAM', 
          desc: 'Movement Speed +3%', 
          apply: () => { 
            playerStats.walkSpeed *= 1.03; // Reduced from 1.15 to 1.03 for level-100 balance
            showStatChange('+3% Move Speed');
          } 
        },
        { 
          id: 'critdmg', 
          icon: '💥',
          title: 'TORRENT POWER', 
          desc: 'Critical Damage +6%', 
          apply: () => { 
            playerStats.critDmg += 0.06; // Reduced from 0.3 to 0.06 for level-100 balance
            showStatChange('+6% Crit Damage (Now: ' + Math.round(playerStats.critDmg * 100) + '%)');
          } 
        },
        { 
          id: 'magnet', 
          icon: '🧲',
          title: 'WHIRLPOOL', 
          desc: 'EXP Pickup Range +25% (+1 unit)', 
          apply: () => { 
            magnetRange += 1; 
            showStatChange('EXP Magnet Range +25% (Now: ' + magnetRange + ' units)');
          } 
        },
        { 
          id: 'cooldown', 
          icon: '⏱️',
          title: 'FLOW STATE', 
          desc: 'All Weapon Cooldowns -2%', 
          apply: () => { 
            weapons.gun.cooldown *= 0.98; // Reduced from 0.95 to 0.98 for level-100 balance
            weapons.sword.cooldown *= 0.98;
            weapons.aura.cooldown *= 0.98;
            weapons.meteor.cooldown *= 0.98;
            weapons.droneTurret.cooldown *= 0.98;
            weapons.doubleBarrel.cooldown *= 0.98;
            weapons.iceSpear.cooldown *= 0.98;
            weapons.fireRing.cooldown *= 0.98;
            showStatChange('All Weapon Cooldowns -2%');
          } 
        },
        { 
          id: 'dash_mastery', 
          icon: '💨',
          title: 'DASH MASTERY', 
          desc: 'Dash Cooldown -20%, Distance +30%', 
          apply: () => { 
            playerStats.dashCooldownReduction += 0.2;
            playerStats.dashDistanceBonus += 0.3;
            dashCooldown *= 0.8;
            dashDistance *= 1.3;
            player.dashDuration *= 0.9; // Slightly faster dash
            showStatChange('Dash Improved! CD: -20%, Distance: +30%');
          } 
        },
        { 
          id: 'second_wind', 
          icon: '🛡️',
          title: 'SECOND WIND', 
          desc: 'Gain 30 Shield when HP drops below 30%', 
          apply: () => { 
            playerStats.hasSecondWind = true;
            showStatChange('Second Wind Unlocked!');
          } 
        },
        { 
          id: 'life_steal', 
          icon: '🩸',
          title: 'LIFE STEAL', 
          desc: 'Heal 3% of Damage Dealt (Stacks)', 
          apply: () => { 
            playerStats.lifeStealPercent += 0.03;
            showStatChange('Life Steal +3% (Total: ' + Math.round(playerStats.lifeStealPercent * 100) + '%)');
          } 
        },
        { 
          id: 'thorns', 
          icon: '🔱',
          title: 'THORNS', 
          desc: 'Reflect 15% Damage to Attackers (Stacks)', 
          apply: () => { 
            playerStats.thornsPercent += 0.15;
            showStatChange('Thorns +15% (Total: ' + Math.round(playerStats.thornsPercent * 100) + '%)');
          } 
        },
        { 
          id: 'berserker_rage', 
          icon: '😤',
          title: 'BERSERKER RAGE', 
          desc: 'Gain 25% Attack Speed when below 50% HP', 
          apply: () => { 
            playerStats.hasBerserkerRage = true;
            showStatChange('Berserker Rage Unlocked!');
          } 
        },
        { 
          id: 'treasure_hunter', 
          icon: '💰',
          title: 'TREASURE HUNTER', 
          desc: '20% Chance to Drop Extra Gold (Stacks)', 
          apply: () => { 
            playerStats.treasureHunterChance += 0.2;
            showStatChange('Treasure Hunter +20% (Total: ' + Math.round(playerStats.treasureHunterChance * 100) + '%)');
          } 
        },
        { 
          id: 'lucky_strikes', 
          icon: '✨',
          title: 'LUCKY STRIKES', 
          desc: 'Crits have 25% Chance to Strike Twice', 
          apply: () => { 
            playerStats.doubleCritChance += 0.25;
            showStatChange('Lucky Strikes +25% (Total: ' + Math.round(playerStats.doubleCritChance * 100) + '%)');
          } 
        },
        { 
          id: 'pierce', 
          icon: '🎯',
          title: 'PIERCING SHOTS', 
          desc: 'Bullets Hit +1 Additional Enemy (Stacks)', 
          apply: () => { 
            playerStats.pierceCount = (playerStats.pierceCount || 0) + 1;
            const totalHits = playerStats.pierceCount + 1;
            showStatChange('Piercing +1! (Total hits: ' + totalHits + ' enemies)');
          } 
        },
        { 
          id: 'double_cast', 
          icon: '🔀',
          title: 'DOUBLE CAST', 
          desc: 'Small chance to fire twice per shot (+20% per stack)', 
          apply: () => { 
            playerStats.doubleCastChance = (playerStats.doubleCastChance || 0) + 0.20;
            const pct = Math.round((playerStats.doubleCastChance || 0) * 100);
            showStatChange('Double Cast! (' + pct + '% chance to fire twice)');
          } 
        },
        { 
          id: 'double_upgrade_chance', 
          icon: '🎲',
          title: 'DOUBLE UPGRADE CHANCE', 
          desc: 'Chance to get one more upgrade box after the original one (+25% per stack, max 100% at 4 stacks)', 
          apply: () => { 
            playerStats.doubleUpgradeChance = (playerStats.doubleUpgradeChance || 0) + 0.25;
            showStatChange('Double Upgrade Chance +25%! (Total: ' + Math.round(playerStats.doubleUpgradeChance * 100) + '%)');
          } 
        }
      ];

      // --- SPECIAL LEVELS ---
      
      // Quest 8: Force weapon choice when quest8_newWeapon is active (grant first new weapon)
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest8_newWeapon' &&
          ![4, 8, 15, 20].includes(playerStats.lvl)) {
        modal.querySelector('h2').innerText = 'NEW WEAPON!';
        modal.querySelector('h2').style.fontSize = '36px';
        const allWeaponChoicesQ8 = [
          { id: 'sword', title: 'TIDAL SLASH', desc: 'Slash enemies in front', active: () => weapons.sword.active, apply: () => { weapons.sword.active = true; weapons.sword.level = 1; showStatChange('New Weapon: Sword'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'aura', title: 'STORM SURGE', desc: 'Damage aura around you', active: () => weapons.aura.active, apply: () => { weapons.aura.active = true; weapons.aura.level = 1; showStatChange('New Weapon: Aura'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'meteor', title: 'HAILSTORM', desc: 'Call meteors from sky', active: () => weapons.meteor.active, apply: () => { weapons.meteor.active = true; weapons.meteor.level = 1; showStatChange('New Weapon: Meteor'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'icespear', title: 'ICE SPEAR', desc: 'Freezing projectile that slows enemies 40%', active: () => weapons.iceSpear.active, apply: () => { weapons.iceSpear.active = true; weapons.iceSpear.level = 1; showStatChange('New Weapon: Ice Spear'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'firering', title: 'FIRE RING', desc: 'Spinning fire orbs orbit around you', active: () => weapons.fireRing.active, apply: () => { weapons.fireRing.active = true; weapons.fireRing.level = 1; showStatChange('New Weapon: Fire Ring'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'samuraiSword', title: 'SAMURAI SWORD', desc: 'Swift katana strikes', active: () => weapons.samuraiSword.active, apply: () => { weapons.samuraiSword.active = true; weapons.samuraiSword.level = 1; showStatChange('New Weapon: Samurai Sword'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'whip', title: 'WHIP', desc: 'Chain through enemies', active: () => weapons.whip.active, apply: () => { weapons.whip.active = true; weapons.whip.level = 1; showStatChange('New Weapon: Whip'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'bow', title: 'BOW', desc: 'Long-range piercing arrows', active: () => weapons.bow.active, apply: () => { weapons.bow.active = true; weapons.bow.level = 1; showStatChange('New Weapon: Bow'); progressTutorialQuest('quest8_newWeapon', true); } },
          { id: 'boomerang', title: 'BOOMERANG', desc: 'Hits enemies both ways', active: () => weapons.boomerang.active, apply: () => { weapons.boomerang.active = true; weapons.boomerang.level = 1; showStatChange('New Weapon: Boomerang'); progressTutorialQuest('quest8_newWeapon', true); } }
        ];
        const availableQ8 = allWeaponChoicesQ8.filter(w => !w.active());
        choices = availableQ8.sort(() => 0.5 - Math.random()).slice(0, Math.min(3, availableQ8.length));
        if (choices.length < 3) {
          const fillers = commonUpgrades.sort(() => 0.5 - Math.random()).slice(0, 3 - choices.length);
          choices.push(...fillers);
        }
        choices.push(...commonUpgrades.sort(() => 0.5 - Math.random()).slice(0, 3));
      }
      // Levels 5, 9, 17, 23: WEAPON UPGRADE LEVELS (first weapon upgrade at level 5)
      else if ([5, 9, 17, 23].includes(playerStats.lvl)) {
        modal.querySelector('h2').innerText = 'WEAPON UPGRADE!';
        modal.querySelector('h2').style.fontSize = '36px';
        
        choices = [];
        
        // Phase 3: Weapon upgrades now go to level 5 (up from 4)
        // Offer weapon upgrades for active weapons
        if (weapons.gun.active && weapons.gun.level < 5) {
          const nextLevel = weapons.gun.level + 1;
          choices.push({ 
            id: 'gun_upgrade', 
            icon: '🔫',
            title: `GUN Level ${nextLevel}`, 
            desc: `Damage +10, Fire Rate +15%`, 
            apply: () => { 
              weapons.gun.level++;
              weapons.gun.damage += 10;
              weapons.gun.cooldown *= 0.85;
              showStatChange(`Gun Level ${weapons.gun.level}: +10 Dmg, +15% Fire Rate`);
            } 
          });
        }
        
        if (weapons.sword.active && weapons.sword.level < 5) {
          const nextLevel = weapons.sword.level + 1;
          choices.push({ 
            id: 'sword_upgrade', 
            icon: '⚔️',
            title: `SWORD Level ${nextLevel}`, 
            desc: `Damage +15, Range +0.5`, 
            apply: () => { 
              weapons.sword.level++;
              weapons.sword.damage += 15;
              weapons.sword.range += 0.5;
              showStatChange(`Sword Level ${weapons.sword.level}: +15 Dmg, +0.5 Range`);
            } 
          });
        }
        
        if (weapons.aura.active && weapons.aura.level < 5) {
          const nextLevel = weapons.aura.level + 1;
          const baseRange = 3; // Initial range
          const currentRange = weapons.aura.range;
          const nextRange = Math.min(5, baseRange * (1 + (nextLevel * 0.10))); // +10% per level, cap at 5
          const rangeIncrease = Math.round((nextRange - currentRange) * 10) / 10;
          
          choices.push({ 
            id: 'aura_upgrade', 
            icon: '🌀',
            title: `AURA Level ${nextLevel}`, 
            desc: `Damage +3, Range +${rangeIncrease.toFixed(1)}`, 
            apply: () => { 
              weapons.aura.level++;
              weapons.aura.damage += 3;
              weapons.aura.range = Math.min(5, baseRange * (1 + (weapons.aura.level * 0.10)));
              showStatChange(`Aura Level ${weapons.aura.level}: +3 Dmg, +${rangeIncrease.toFixed(1)} Range`);
            } 
          });
        }
        
        if (weapons.meteor.active && weapons.meteor.level < 5) {
          const nextLevel = weapons.meteor.level + 1;
          choices.push({ 
            id: 'meteor_upgrade', 
            icon: '☄️',
            title: `METEOR Level ${nextLevel}`, 
            desc: `Damage +20, Area +1`, 
            apply: () => { 
              weapons.meteor.level++;
              weapons.meteor.damage += 20;
              weapons.meteor.area += 1;
              showStatChange(`Meteor Level ${weapons.meteor.level}: +20 Dmg, +1 Area`);
            } 
          });
        }
        
        if (weapons.droneTurret.active && weapons.droneTurret.level < 5) {
          const nextLevel = weapons.droneTurret.level + 1;
          // Phase 3: Define levels where drones are added
          const DRONE_TURRET_SPAWN_LEVELS = [2, 4, 5];
          const addDrone = DRONE_TURRET_SPAWN_LEVELS.includes(nextLevel);
          choices.push({ 
            id: 'droneturret_upgrade', 
            title: `DRONE TURRET Level ${nextLevel}`, 
            desc: addDrone ? `Damage +8, Fire Rate +10%, +1 Drone` : `Damage +8, Fire Rate +10%`, 
            apply: () => { 
              weapons.droneTurret.level++;
              weapons.droneTurret.damage += 8;
              weapons.droneTurret.cooldown *= 0.9;
              if (addDrone) {
                // Create new drone first, then update count
                const drone = new DroneTurret(player);
                // Position offset for multiple drones
                const droneIndex = droneTurrets.length;
                const totalDrones = weapons.droneTurret.droneCount + 1; // Count after adding
                const angle = (droneIndex / totalDrones) * Math.PI * 2;
                drone.offset = new THREE.Vector3(
                  Math.cos(angle) * 2.5,
                  1.5,
                  Math.sin(angle) * 2.5
                );
                droneTurrets.push(drone);
                weapons.droneTurret.droneCount++;
                startDroneHum(); // Start continuous drone sound
                showStatChange(`Drone Turret Level ${weapons.droneTurret.level}: +8 Dmg, +10% Fire Rate, +1 Drone!`);
              } else {
                showStatChange(`Drone Turret Level ${weapons.droneTurret.level}: +8 Dmg, +10% Fire Rate`);
              }
            } 
          });
        }
        
        if (weapons.doubleBarrel.active && weapons.doubleBarrel.level < 5) {
          const nextLevel = weapons.doubleBarrel.level + 1;
          choices.push({ 
            id: 'doublebarrel_upgrade', 
            icon: '🔫',
            title: `DOUBLE BARREL Level ${nextLevel}`, 
            desc: `+1 Shot, Damage +12, Fire Rate +10%`, 
            apply: () => { 
              weapons.doubleBarrel.level++;
              weapons.doubleBarrel.damage += 12;
              weapons.doubleBarrel.cooldown *= 0.9;
              weapons.doubleBarrel.pellets = (weapons.doubleBarrel.pellets || 2) + 1;
              showStatChange(`Double Barrel Level ${weapons.doubleBarrel.level}: +1 Shot, +12 Dmg`);
            } 
          });
        }
        
        if (weapons.iceSpear.active && weapons.iceSpear.level < 5) {
          const nextLevel = weapons.iceSpear.level + 1;
          choices.push({ 
            id: 'icespear_upgrade', 
            icon: '❄️',
            title: `ICE SPEAR Level ${nextLevel}`, 
            desc: `Damage +10, Slow +10%, Duration +0.5s`, 
            apply: () => { 
              weapons.iceSpear.level++;
              weapons.iceSpear.damage += 10;
              weapons.iceSpear.slowPercent += 0.1;
              weapons.iceSpear.slowDuration += 500;
              showStatChange(`Ice Spear Level ${weapons.iceSpear.level}: +10 Dmg, +10% Slow, +0.5s Duration`);
            } 
          });
        }
        
        if (weapons.fireRing.active && weapons.fireRing.level < 5) {
          const nextLevel = weapons.fireRing.level + 1;
          choices.push({ 
            id: 'firering_upgrade', 
            icon: '🔥',
            title: `FIRE RING Level ${nextLevel}`, 
            desc: `Damage +5, +1 Orb, Range +0.5`, 
            apply: () => { 
              weapons.fireRing.level++;
              weapons.fireRing.damage += 5;
              weapons.fireRing.orbs += 1;
              weapons.fireRing.range += 0.5;
              showStatChange(`Fire Ring Level ${weapons.fireRing.level}: +5 Dmg, +1 Orb, +0.5 Range`);
            } 
          });
        }
        
        // Phase 3: Add more stat upgrades for diversity with weighted selection
        // ATK speed and damage have 3x higher probability (weighted random selection)
        const selectedUpgrades = [];
        for (let i = 0; i < 3; i++) {
          // Calculate weighted random selection
          const weights = commonUpgrades.map(u => 
            (u.id === 'str' || u.id === 'aspd') ? 3 : 1
          );
          const totalWeight = weights.reduce((sum, w) => sum + w, 0);
          let random = Math.random() * totalWeight;
          
          let selectedIndex = 0;
          for (let j = 0; j < weights.length; j++) {
            random -= weights[j];
            if (random <= 0) {
              selectedIndex = j;
              break;
            }
          }
          
          selectedUpgrades.push(commonUpgrades[selectedIndex]);
        }
        choices.push(...selectedUpgrades);
        
        // ALWAYS SHOW 6 CHOICES: Shuffle and ensure exactly 6 choices in 2×3 grid
        choices = choices.sort(() => 0.5 - Math.random()).slice(0, 6);
        // If we have less than 6, fill with common upgrades (use Set for O(n) lookup)
        if (choices.length < 6) {
          const existingIds = new Set(choices.map(c => c.id));
          const additionalUpgrades = commonUpgrades.filter(u => !existingIds.has(u.id));
          const needed = 6 - choices.length;
          choices.push(...additionalUpgrades.slice(0, needed));
        }
      }
      // WEAPON UNLOCK: Level 4, 8, 15, 20 — show ONLY 6 weapon choices (no stat upgrades)
      else if ([4, 8, 15, 20].includes(playerStats.lvl)) {
        modal.querySelector('h2').innerText = 'NEW WEAPON!';
        modal.querySelector('h2').style.fontSize = '36px';

        const questCheck = () => { if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest8_newWeapon') progressTutorialQuest('quest8_newWeapon', true); };

        // Full weapon pool — inactive weapons first, then upgrades for active weapons
        // Cat 1 = Handheld, Cat 2 = Passive, Cat 3 = Elemental
        const newWeaponChoices = [
          // ── Category 1: Handheld Weapons ──
          { id: 'sword',        icon: '⚔️',  title: 'TIDAL SLASH',        desc: 'Slash enemies in front of you',                category: 1, active: () => weapons.sword.active,        apply: () => { weapons.sword.active = true; weapons.sword.level = 1; showStatChange('New Weapon: Sword'); questCheck(); } },
          { id: 'samuraiSword', icon: '⚔️',  title: 'SAMURAI SWORD',      desc: 'Swift katana — high damage, fast strikes',      category: 1, active: () => weapons.samuraiSword.active,  apply: () => { weapons.samuraiSword.active = true; weapons.samuraiSword.level = 1; showStatChange('New Weapon: Samurai Sword'); questCheck(); } },
          { id: 'whip',         icon: '🪢',  title: 'WHIP',               desc: 'Chain through 3 enemies with each crack',       category: 1, active: () => weapons.whip.active,          apply: () => { weapons.whip.active = true; weapons.whip.level = 1; showStatChange('New Weapon: Whip'); questCheck(); } },
          { id: 'uzi',          icon: '🔫',  title: 'UZI',                desc: 'Extreme fire rate — low damage, many bullets',   category: 1, active: () => weapons.uzi.active,           apply: () => { weapons.uzi.active = true; weapons.uzi.level = 1; showStatChange('New Weapon: Uzi'); questCheck(); } },
          { id: 'sniperRifle',  icon: '🎯',  title: '50 CAL SNIPER',      desc: 'Massive damage, pierces 3 enemies, slow fire',  category: 1, active: () => weapons.sniperRifle.active,   apply: () => { weapons.sniperRifle.active = true; weapons.sniperRifle.level = 1; showStatChange('New Weapon: 50 Cal Sniper'); questCheck(); } },
          { id: 'pumpShotgun',  icon: '💥',  title: 'PUMP SHOTGUN',       desc: 'Devastating close-range 8-pellet spread',       category: 1, active: () => weapons.pumpShotgun.active,   apply: () => { weapons.pumpShotgun.active = true; weapons.pumpShotgun.level = 1; showStatChange('New Weapon: Pump Shotgun'); questCheck(); } },
          { id: 'autoShotgun',  icon: '💥',  title: 'AUTO SHOTGUN',       desc: 'Rapid semi-auto shotgun bursts',                category: 1, active: () => weapons.autoShotgun.active,   apply: () => { weapons.autoShotgun.active = true; weapons.autoShotgun.level = 1; showStatChange('New Weapon: Auto Shotgun'); questCheck(); } },
          { id: 'minigun',      icon: '🔥',  title: 'MINIGUN',            desc: 'Rotary barrel — extreme fire rate, needs spin-up', category: 1, active: () => weapons.minigun.active,    apply: () => { weapons.minigun.active = true; weapons.minigun.level = 1; showStatChange('New Weapon: Minigun'); questCheck(); } },
          { id: 'bow',          icon: '🏹',  title: 'BOW',                desc: 'Long-range arrows that pierce enemies',         category: 1, active: () => weapons.bow.active,           apply: () => { weapons.bow.active = true; weapons.bow.level = 1; showStatChange('New Weapon: Bow'); questCheck(); } },
          { id: 'teslaSaber',   icon: '⚡',  title: 'TESLA SABER',        desc: 'Energy blade — chains lightning on hit',         category: 1, active: () => weapons.teslaSaber.active,    apply: () => { weapons.teslaSaber.active = true; weapons.teslaSaber.level = 1; showStatChange('New Weapon: Tesla Saber'); questCheck(); } },
          { id: 'doublebarrel', icon: '🔫',  title: 'DOUBLE BARREL',      desc: 'Devastating 12-pellet shotgun swarm',           category: 1, active: () => weapons.doubleBarrel.active, apply: () => { weapons.doubleBarrel.active = true; weapons.doubleBarrel.level = 1; showStatChange('New Weapon: Double Barrel'); questCheck(); } },
          // ── Category 2: Passive Non-Elemental Weapons ──
          { id: 'droneturret',  icon: '🤖',  title: 'DRONE TURRET',       desc: 'Automated drone that shoots enemies',           category: 2, active: () => weapons.droneTurret.active, apply: () => { weapons.droneTurret.active = true; weapons.droneTurret.level = 1; const drone = new DroneTurret(player); droneTurrets.push(drone); startDroneHum(); showStatChange('New Weapon: Drone Turret'); questCheck(); } },
          { id: 'aura',         icon: '🌀',  title: 'STORM SURGE',        desc: 'Damage aura — zaps nearby enemies',             category: 2, active: () => weapons.aura.active,         apply: () => { weapons.aura.active = true; weapons.aura.level = 1; showStatChange('New Weapon: Aura'); questCheck(); } },
          { id: 'boomerang',    icon: '🪃',  title: 'BOOMERANG',          desc: 'Returns to you — hits enemies both ways',        category: 2, active: () => weapons.boomerang.active,    apply: () => { weapons.boomerang.active = true; weapons.boomerang.level = 1; showStatChange('New Weapon: Boomerang'); questCheck(); } },
          { id: 'shuriken',     icon: '✦',   title: 'SHURIKEN',           desc: 'Throws 3 spinning stars at nearby enemies',     category: 2, active: () => weapons.shuriken.active,     apply: () => { weapons.shuriken.active = true; weapons.shuriken.level = 1; showStatChange('New Weapon: Shuriken'); questCheck(); } },
          { id: 'nanoSwarm',    icon: '🤖',  title: 'NANO SWARM',         desc: 'Cloud of nanobots shreds nearby enemies',       category: 2, active: () => weapons.nanoSwarm.active,    apply: () => { weapons.nanoSwarm.active = true; weapons.nanoSwarm.level = 1; showStatChange('New Weapon: Nano Swarm'); questCheck(); } },
          { id: 'homing',       icon: '🚀',  title: 'HOMING MISSILE',     desc: 'Heat-seeking missile — never misses',           category: 2, active: () => weapons.homingMissile.active, apply: () => { weapons.homingMissile.active = true; weapons.homingMissile.level = 1; showStatChange('New Weapon: Homing Missile'); questCheck(); } },
          { id: 'icespear',     icon: '❄️',  title: 'ICE SPEAR',          desc: 'Crystalline shard that slows enemies 40%',      category: 2, active: () => weapons.iceSpear.active,     apply: () => { weapons.iceSpear.active = true; weapons.iceSpear.level = 1; showStatChange('New Weapon: Ice Spear'); questCheck(); } },
          // ── Category 3: Elemental Weapons ──
          { id: 'meteor',       icon: '☄️',  title: 'HAILSTORM',          desc: 'Call meteors from the sky',                     category: 3, active: () => weapons.meteor.active,       apply: () => { weapons.meteor.active = true; weapons.meteor.level = 1; showStatChange('New Weapon: Meteor'); questCheck(); } },
          { id: 'firering',     icon: '🔥',  title: 'FIRE RING',          desc: 'Spinning fire orbs orbit around you',           category: 3, active: () => weapons.fireRing.active,     apply: () => { weapons.fireRing.active = true; weapons.fireRing.level = 1; showStatChange('New Weapon: Fire Ring'); questCheck(); } },
          { id: 'lightning',    icon: '⚡',  title: 'LIGHTNING STRIKE',   desc: 'Lightning from the heavens strikes enemies',    category: 3, active: () => weapons.lightning.active,    apply: () => { weapons.lightning.active = true; weapons.lightning.level = 1; showStatChange('New Weapon: Lightning Strike'); questCheck(); } },
          { id: 'poison',       icon: '☠️',  title: 'POISON CLOUD',       desc: 'Toxic cloud that damages over time',            category: 3, active: () => weapons.poison.active,       apply: () => { weapons.poison.active = true; weapons.poison.level = 1; showStatChange('New Weapon: Poison Cloud'); questCheck(); } },
          { id: 'fireball',     icon: '🔥',  title: 'FIREBALL',           desc: 'Fireballs explode on impact — area damage',     category: 3, active: () => weapons.fireball.active,     apply: () => { weapons.fireball.active = true; weapons.fireball.level = 1; showStatChange('New Weapon: Fireball'); questCheck(); } }
        ];

        // Separate inactive (new) weapons from upgrades for active ones
        const inactiveWeapons = newWeaponChoices.filter(w => !w.active());
        const upgradeWeapons = [
          // Category 1 upgrades
          ...(weapons.gun.level < 10 ? [{ id: 'gun_up', icon: '🎯', title: `GUN Lv.${weapons.gun.level + 1}`, desc: 'Damage +10, Fire Rate +15%', apply: () => { weapons.gun.level++; weapons.gun.damage += 10; weapons.gun.cooldown *= 0.85; showStatChange(`Gun Level ${weapons.gun.level}`); } }] : []),
          ...(weapons.sword.active && weapons.sword.level < 10 ? [{ id: 'sword_up', icon: '⚔️', title: `SWORD Lv.${weapons.sword.level + 1}`, desc: 'Damage +15, Range +0.5', apply: () => { weapons.sword.level++; weapons.sword.damage += 15; weapons.sword.range += 0.5; showStatChange(`Sword Level ${weapons.sword.level}`); } }] : []),
          ...(weapons.samuraiSword.active && weapons.samuraiSword.level < 10 ? [{ id: 'samurai_up', icon: '⚔️', title: `SAMURAI Lv.${weapons.samuraiSword.level + 1}`, desc: 'Damage +18, Speed +10%', apply: () => { weapons.samuraiSword.level++; weapons.samuraiSword.damage += 18; weapons.samuraiSword.cooldown *= 0.9; showStatChange(`Samurai Sword Level ${weapons.samuraiSword.level}`); } }] : []),
          ...(weapons.whip.active && weapons.whip.level < 10 ? [{ id: 'whip_up', icon: '🪢', title: `WHIP Lv.${weapons.whip.level + 1}`, desc: 'Damage +8, +1 Chain hit', apply: () => { weapons.whip.level++; weapons.whip.damage += 8; weapons.whip.chainHits = (weapons.whip.chainHits || 3) + 1; showStatChange(`Whip Level ${weapons.whip.level}`); } }] : []),
          ...(weapons.uzi.active && weapons.uzi.level < 10 ? [{ id: 'uzi_up', icon: '🔫', title: `UZI Lv.${weapons.uzi.level + 1}`, desc: 'Damage +4, Fire Rate +10%', apply: () => { weapons.uzi.level++; weapons.uzi.damage += 4; weapons.uzi.cooldown *= 0.9; showStatChange(`Uzi Level ${weapons.uzi.level}`); } }] : []),
          ...(weapons.sniperRifle.active && weapons.sniperRifle.level < 10 ? [{ id: 'sniper_up', icon: '🎯', title: `SNIPER Lv.${weapons.sniperRifle.level + 1}`, desc: 'Damage +25, +1 Pierce', apply: () => { weapons.sniperRifle.level++; weapons.sniperRifle.damage += 25; weapons.sniperRifle.piercing = (weapons.sniperRifle.piercing || 3) + 1; showStatChange(`Sniper Level ${weapons.sniperRifle.level}`); } }] : []),
          ...(weapons.pumpShotgun.active && weapons.pumpShotgun.level < 10 ? [{ id: 'pump_up', icon: '💥', title: `PUMP Lv.${weapons.pumpShotgun.level + 1}`, desc: 'Damage +6, +2 Pellets', apply: () => { weapons.pumpShotgun.level++; weapons.pumpShotgun.damage += 6; weapons.pumpShotgun.pellets += 2; showStatChange(`Pump Shotgun Level ${weapons.pumpShotgun.level}`); } }] : []),
          ...(weapons.autoShotgun.active && weapons.autoShotgun.level < 10 ? [{ id: 'autoshotgun_up', icon: '💥', title: `AUTO SHOT Lv.${weapons.autoShotgun.level + 1}`, desc: 'Damage +5, Fire Rate +10%', apply: () => { weapons.autoShotgun.level++; weapons.autoShotgun.damage += 5; weapons.autoShotgun.cooldown *= 0.9; showStatChange(`Auto Shotgun Level ${weapons.autoShotgun.level}`); } }] : []),
          ...(weapons.minigun.active && weapons.minigun.level < 10 ? [{ id: 'minigun_up', icon: '🔥', title: `MINIGUN Lv.${weapons.minigun.level + 1}`, desc: 'Damage +3, Fire Rate +8%', apply: () => { weapons.minigun.level++; weapons.minigun.damage += 3; weapons.minigun.cooldown *= 0.92; showStatChange(`Minigun Level ${weapons.minigun.level}`); } }] : []),
          ...(weapons.bow.active && weapons.bow.level < 10 ? [{ id: 'bow_up', icon: '🏹', title: `BOW Lv.${weapons.bow.level + 1}`, desc: 'Damage +10, +1 Pierce', apply: () => { weapons.bow.level++; weapons.bow.damage += 10; weapons.bow.piercing = (weapons.bow.piercing || 1) + 1; showStatChange(`Bow Level ${weapons.bow.level}`); } }] : []),
          ...(weapons.teslaSaber.active && weapons.teslaSaber.level < 10 ? [{ id: 'tesla_up', icon: '⚡', title: `TESLA Lv.${weapons.teslaSaber.level + 1}`, desc: 'Damage +12, Chain range +10%', apply: () => { weapons.teslaSaber.level++; weapons.teslaSaber.damage += 12; showStatChange(`Tesla Saber Level ${weapons.teslaSaber.level}`); } }] : []),
          ...(weapons.doubleBarrel.active && weapons.doubleBarrel.level < 10 ? [{ id: 'dbl_up', icon: '🔫', title: `DOUBLE BARREL Lv.${weapons.doubleBarrel.level + 1}`, desc: '+1 Shot, Damage +12', apply: () => { weapons.doubleBarrel.level++; weapons.doubleBarrel.damage += 12; weapons.doubleBarrel.cooldown *= 0.9; weapons.doubleBarrel.pellets = (weapons.doubleBarrel.pellets || 2) + 1; showStatChange(`Double Barrel Level ${weapons.doubleBarrel.level}`); } }] : []),
          // Category 2 upgrades
          ...(weapons.droneTurret.active && weapons.droneTurret.level < 10 ? [{ id: 'drone_up', icon: '🤖', title: `DRONE Lv.${weapons.droneTurret.level + 1}`, desc: 'Damage +3, Fire Rate +12%', apply: () => { weapons.droneTurret.level++; weapons.droneTurret.damage += 3; weapons.droneTurret.cooldown *= 0.88; showStatChange(`Drone Level ${weapons.droneTurret.level}`); } }] : []),
          ...(weapons.aura.active && weapons.aura.level < 10 ? [{ id: 'aura_up', icon: '🌀', title: `AURA Lv.${weapons.aura.level + 1}`, desc: 'Damage +3, Range +10%', apply: () => { weapons.aura.level++; weapons.aura.damage += 3; weapons.aura.range = Math.min(5, weapons.aura.range * 1.1); showStatChange(`Aura Level ${weapons.aura.level}`); } }] : []),
          ...(weapons.boomerang.active && weapons.boomerang.level < 10 ? [{ id: 'boomerang_up', icon: '🪃', title: `BOOMERANG Lv.${weapons.boomerang.level + 1}`, desc: 'Damage +10, Range +1', apply: () => { weapons.boomerang.level++; weapons.boomerang.damage += 10; weapons.boomerang.range += 1; showStatChange(`Boomerang Level ${weapons.boomerang.level}`); } }] : []),
          ...(weapons.shuriken.active && weapons.shuriken.level < 10 ? [{ id: 'shuriken_up', icon: '✦', title: `SHURIKEN Lv.${weapons.shuriken.level + 1}`, desc: '+1 Star, Damage +5', apply: () => { weapons.shuriken.level++; weapons.shuriken.damage += 5; weapons.shuriken.projectiles = (weapons.shuriken.projectiles || 3) + 1; showStatChange(`Shuriken Level ${weapons.shuriken.level}`); } }] : []),
          ...(weapons.nanoSwarm.active && weapons.nanoSwarm.level < 10 ? [{ id: 'nano_up', icon: '🤖', title: `NANO Lv.${weapons.nanoSwarm.level + 1}`, desc: '+2 Bots, Damage +2', apply: () => { weapons.nanoSwarm.level++; weapons.nanoSwarm.damage += 2; weapons.nanoSwarm.swarmCount += 2; showStatChange(`Nano Swarm Level ${weapons.nanoSwarm.level}`); } }] : []),
          ...(weapons.homingMissile.active && weapons.homingMissile.level < 10 ? [{ id: 'homing_up', icon: '🚀', title: `MISSILE Lv.${weapons.homingMissile.level + 1}`, desc: 'Damage +15, Speed +15%', apply: () => { weapons.homingMissile.level++; weapons.homingMissile.damage += 15; weapons.homingMissile.cooldown *= 0.85; showStatChange(`Homing Missile Level ${weapons.homingMissile.level}`); } }] : []),
          ...(weapons.iceSpear.active && weapons.iceSpear.level < 10 ? [{ id: 'ice_up', icon: '❄️', title: `ICE SPEAR Lv.${weapons.iceSpear.level + 1}`, desc: 'Damage +10, Slow +10%', apply: () => { weapons.iceSpear.level++; weapons.iceSpear.damage += 10; weapons.iceSpear.slowPercent += 0.1; showStatChange(`Ice Spear Level ${weapons.iceSpear.level}`); } }] : []),
          // Category 3 upgrades
          ...(weapons.fireRing.active && weapons.fireRing.level < 10 ? [{ id: 'fire_up', icon: '🔥', title: `FIRE RING Lv.${weapons.fireRing.level + 1}`, desc: 'Damage +5, +1 Orb', apply: () => { weapons.fireRing.level++; weapons.fireRing.damage += 5; weapons.fireRing.orbs += 1; showStatChange(`Fire Ring Level ${weapons.fireRing.level}`); } }] : []),
          ...(weapons.meteor.active && weapons.meteor.level < 10 ? [{ id: 'meteor_up', icon: '☄️', title: `METEOR Lv.${weapons.meteor.level + 1}`, desc: 'Damage +20, Area +1', apply: () => { weapons.meteor.level++; weapons.meteor.damage += 20; weapons.meteor.area += 1; showStatChange(`Meteor Level ${weapons.meteor.level}`); } }] : []),
          ...(weapons.lightning.active && weapons.lightning.level < 10 ? [{ id: 'lightning_up', icon: '⚡', title: `LIGHTNING Lv.${weapons.lightning.level + 1}`, desc: 'Damage +15, +1 Strike', apply: () => { weapons.lightning.level++; weapons.lightning.damage += 15; weapons.lightning.strikes = (weapons.lightning.strikes || 1) + 1; showStatChange(`Lightning Level ${weapons.lightning.level}`); } }] : []),
          ...(weapons.poison.active && weapons.poison.level < 10 ? [{ id: 'poison_up', icon: '☠️', title: `POISON Lv.${weapons.poison.level + 1}`, desc: 'DoT +2, Range +0.5', apply: () => { weapons.poison.level++; weapons.poison.dotDamage += 2; weapons.poison.range += 0.5; showStatChange(`Poison Level ${weapons.poison.level}`); } }] : []),
          ...(weapons.fireball.active && weapons.fireball.level < 10 ? [{ id: 'fireball_up', icon: '🔥', title: `FIREBALL Lv.${weapons.fireball.level + 1}`, desc: 'Damage +12, Blast +0.5', apply: () => { weapons.fireball.level++; weapons.fireball.damage += 12; weapons.fireball.explosionRadius += 0.5; showStatChange(`Fireball Level ${weapons.fireball.level}`); } }] : [])
        ];

        // Prefer new weapons first; pad with weapon upgrades to always reach 6 choices
        const shuffledNew = inactiveWeapons.sort(() => 0.5 - Math.random());
        const shuffledUp  = upgradeWeapons.sort(() => 0.5 - Math.random());
        choices = [...shuffledNew, ...shuffledUp].slice(0, 6);

        // If still < 6 (edge case: all weapons maxed), loop inactive weapons again or repeat upgrades
        if (choices.length < 6) {
          const filler = [...shuffledNew, ...shuffledUp];
          while (choices.length < 6 && filler.length) {
            const pick = filler.shift();
            if (!choices.find(c => c.id === pick.id)) choices.push(pick);
          }
        }
      }
      // Level 10: CLASS SELECTION - ALWAYS SHOW 6 CHOICES
      else if (playerStats.lvl === 10) {
        modal.querySelector('h2').innerText = 'CHOOSE YOUR CLASS';
        modal.querySelector('h2').style.fontSize = '42px';
        
        choices = [
          { 
            id: 'class_tank', 
            title: 'TANK', 
            desc: 'Survivability: +50 Max HP, +2 HP/sec Regen, +20% Armor, -15% Speed', 
            apply: () => { 
              playerStats.maxHp+=50; 
              playerStats.hp+=50; 
              playerStats.hpRegen+=2; 
              playerStats.armor+=20;
              playerStats.walkSpeed *= 0.85;
              showStatChange('Class: TANK (+50 HP, +2 Regen, +20% Armor)');
            } 
          },
          { 
            id: 'class_berserker', 
            title: 'BERSERKER', 
            desc: 'Str+30%, Crit+10%, Attack Speed+20%, Armor-10%', 
            apply: () => { 
              playerStats.strength+=0.3; 
              playerStats.critChance+=0.1; 
              playerStats.atkSpeed+=0.2;
              weapons.gun.cooldown *= 0.8;
              playerStats.armor = Math.max(0, playerStats.armor-10);
              showStatChange('Class: BERSERKER');
            } 
          },
          { 
            id: 'class_rogue', 
            title: 'ROGUE', 
            desc: 'Speed+25%, Crit+15%, Crit Dmg+30%, HP-20', 
            apply: () => { 
              playerStats.walkSpeed *= 1.25; 
              playerStats.critChance+=0.15; 
              playerStats.critDmg+=0.3;
              playerStats.maxHp = Math.max(50, playerStats.maxHp-20);
              playerStats.hp = Math.min(playerStats.hp, playerStats.maxHp);
              showStatChange('Class: ROGUE');
            } 
          },
          { 
            id: 'class_mage', 
            title: 'MAGE', 
            desc: 'Aura Range+2, Meteor CD-1s, Regen+3, Move Speed+10%', 
            apply: () => { 
              weapons.aura.range+=2; 
              weapons.meteor.cooldown = Math.max(500, weapons.meteor.cooldown-1000);
              playerStats.hpRegen+=3;
              playerStats.walkSpeed *= 1.1;
              showStatChange('Class: MAGE');
            } 
          }
        ];
        // Fill with common upgrades to reach 6 choices
        const classSelectionFillers = commonUpgrades.sort(() => 0.5 - Math.random()).slice(0, 2);
        choices.push(...classSelectionFillers);
      } 
      // Level 12, 18, 25: PERK UNLOCKS - ALWAYS SHOW 6 CHOICES
      else if ([12, 18, 25].includes(playerStats.lvl)) {
        modal.querySelector('h2').innerText = 'PERK UNLOCK!';
        modal.querySelector('h2').style.fontSize = '40px';
        
        // Create perk pool based on level
        const perkChoices = [
          { 
            id: 'perk_vampire', 
            icon: '🧛',
            title: 'VAMPIRE', 
            desc: `Life Steal: Heal 5% of damage dealt (Current: ${Math.round(playerStats.perks.vampire * 5)}%)`, 
            apply: () => { 
              playerStats.perks.vampire++;
              playerStats.lifeStealPercent += 0.05;
              showStatChange(`Vampire Level ${playerStats.perks.vampire}! (5% of damage heals you)`);
            } 
          },
          { 
            id: 'perk_juggernaut', 
            icon: '🛡️',
            title: 'JUGGERNAUT', 
            desc: `Damage Reduction +8% (Current: ${Math.round(playerStats.perks.juggernaut * 8)}%)`, 
            apply: () => { 
              playerStats.perks.juggernaut++;
              playerStats.armor = Math.min(80, playerStats.armor + 8);
              showStatChange(`Juggernaut Perk Level ${playerStats.perks.juggernaut}! (+8% Armor)`);
            } 
          },
          { 
            id: 'perk_swift', 
            icon: '⚡',
            title: 'SWIFT', 
            desc: `Movement Speed +15% (Current: Level ${playerStats.perks.swift})`, 
            apply: () => { 
              playerStats.perks.swift++;
              playerStats.walkSpeed *= 1.15;
              showStatChange(`Swift Perk Level ${playerStats.perks.swift}! (+15% Move Speed)`);
            } 
          },
          { 
            id: 'perk_lucky', 
            icon: '🍀',
            title: 'LUCKY', 
            desc: `Critical Chance +8% (Current: ${Math.round(playerStats.perks.lucky * 8)}%)`, 
            apply: () => { 
              playerStats.perks.lucky++;
              playerStats.critChance += 0.08;
              showStatChange(`Lucky Perk Level ${playerStats.perks.lucky}! (+8% Crit Chance)`);
            } 
          },
          { 
            id: 'perk_berserker', 
            icon: '💢',
            title: 'BERSERKER SOUL', 
            desc: `Low HP Bonus +10% Damage (Current: Level ${playerStats.perks.berserker})`, 
            apply: () => { 
              playerStats.perks.berserker++;
              playerStats.lowHpDamage = (playerStats.lowHpDamage || 0) + 0.10;
              showStatChange(`Berserker Soul Level ${playerStats.perks.berserker}! (Bonus when HP < 50%)`);
            } 
          }
        ];
        
        // ALWAYS SHOW 6 CHOICES: Select perks and fill with common upgrades
        choices = perkChoices.sort(() => 0.5 - Math.random()).slice(0, 3);
        const perkUnlockFillers = commonUpgrades.sort(() => 0.5 - Math.random()).slice(0, 3);
        choices.push(...perkUnlockFillers);
      }
      else {
        // ALWAYS SHOW 6 CHOICES: Show 6 random choices for 2×3 grid
        // Weighted selection: ATK speed and ATK power have higher spawn weight
        
        // Create weighted pool with Fisher-Yates shuffle for proper randomization
        const weightedPool = [];
        
        // Add each upgrade with appropriate weight
        commonUpgrades.forEach(upgrade => {
          if (upgrade.id === 'str' || upgrade.id === 'aspd') {
            // ATK power and ATK speed: 3x weight
            weightedPool.push({ upgrade, weight: 3 });
          } else {
            // Other upgrades: normal weight
            weightedPool.push({ upgrade, weight: 1 });
          }
        });
        
        // Expand weighted pool based on weights
        const expandedPool = [];
        weightedPool.forEach(item => {
          for (let i = 0; i < item.weight; i++) {
            expandedPool.push(item.upgrade);
          }
        });
        
        // Fisher-Yates shuffle for proper randomization
        for (let i = expandedPool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [expandedPool[i], expandedPool[j]] = [expandedPool[j], expandedPool[i]];
        }
        
        // Pick 6 unique upgrades
        const unique = [];
        const seen = new Set();
        
        for (const upgrade of expandedPool) {
          if (!seen.has(upgrade.id)) {
            unique.push(upgrade);
            seen.add(upgrade.id);
          }
          if (unique.length >= 6) break;
        }
        
        choices = unique;
      }

      // SAFETY FALLBACK: ensure exactly 6 choices are always available
      if (!choices) choices = [];
      if (choices.length < 6) {
        const fallbackItems = [
          {
            id: 'fallback_hp', icon: '❤️', title: '+20 MAX HP', desc: 'Max HP +20 (Instant Heal +20)',
            apply: () => {
              playerStats.maxHp += 20;
              playerStats.hp = Math.min(playerStats.hp + 20, playerStats.maxHp);
              showStatChange('+20 Max HP');
            }
          },
          {
            id: 'fallback_heal', icon: '💊', title: 'HEAL 50%', desc: 'Instantly restore 50% of your max HP',
            apply: () => {
              playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + Math.floor(playerStats.maxHp * 0.5));
              showStatChange('Healed 50% HP!');
            }
          },
          {
            id: 'fallback_gold', icon: '💰', title: '+50 GOLD', desc: 'Gain 50 gold instantly',
            apply: () => {
              playerStats.gold += 50;
              showStatChange('+50 Gold');
            }
          }
        ];
        const usedIds = new Set(choices.map(c => c.id));
        for (const f of fallbackItems) {
          if (choices.length >= 6) break;
          if (!usedIds.has(f.id)) {
            choices.push(f);
            usedIds.add(f.id);
          }
        }
        // If still under 6, fill with shuffled common upgrades
        if (choices.length < 6) {
          const pool = commonUpgrades.filter(u => !usedIds.has(u.id));
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
          }
          choices.push(...pool.slice(0, 6 - choices.length));
        }
      }

      try {
      // Shared active-hold state: only one card can be held at a time
      let activeHold = null; // { timer, card } or null
      choices.forEach((u, index) => {
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        
        // Add appropriate styling classes based on upgrade type
        if (u.id) {
          // Class upgrades (epic - purple)
          if (u.id.startsWith('class_')) {
            card.className += ' class rarity-epic';
          }
          // Perk upgrades (epic - orange)
          else if (u.id.startsWith('perk_')) {
            card.className += ' perk rarity-epic';
          }
          // Weapon upgrades (dark border with shadow)
          else if (u.id.includes('gun_') || u.id.includes('sword_') || u.id.includes('aura_') || 
                   u.id.includes('meteor_') || u.id.includes('doublebarrel_') ||
                   u.id.includes('droneturret_') || u.id.includes('icespear_') || u.id.includes('firering_')) {
            card.className += ' weapon rarity-rare';
          }
          // Damage & Attack Speed upgrades get blue (rare) rarity
          else if (u.id === 'str' || u.id === 'aspd' || u.id === 'dmg' || u.id === 'atkspd' ||
                   u.id.includes('damage') || u.id.includes('attack_speed') || u.id.includes('atk_speed')) {
            card.className += ' rarity-rare';
          }
          else {
            // Default common upgrades get green rarity
            card.className += ' rarity-common';
          }
          
          // Special powerful upgrades get legendary (red) treatment
          if (u.id.includes('dash_mastery') || u.id.includes('second_wind') || 
              u.id.includes('berserker_rage') || u.id.includes('lucky_strikes')) {
            card.classList.remove('rarity-common', 'rarity-rare', 'rarity-epic', 'rarity-legendary', 'rarity-mythical');
            card.classList.add('max-upgrade', 'rarity-legendary');
          }
        }
        
        // Upgrade cards: show icon (if present) + title + desc
        const iconHtml = u.icon ? `<span class="upgrade-icon">${u.icon}</span>` : '';
        card.innerHTML = `${iconHtml}<div class="upgrade-title">${u.title}</div><div class="upgrade-desc">${u.desc}</div>`;
        
        // Add dramatic entrance animation - from corners
        card.style.opacity = '0';
        const corners = ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'];
        const corner = corners[index % 4];
        card.style.animation = `swooshFrom${corner} 0.5s ease-out ${index * 0.1}s forwards`;
        // Clear the inline animation after the entrance completes so CSS rarity-glow animations take over
        card.addEventListener('animationend', (e) => {
          if (e.animationName && e.animationName.startsWith('swooshFrom')) {
            card.style.animation = '';
            card.style.opacity = '1';
          }
        }, { once: true });
        
        // Inject the melt-shadow hold-ring element
        const holdRingEl = document.createElement('div');
        holdRingEl.className = 'hold-ring';
        card.appendChild(holdRingEl);

        // Shared "apply and close" logic called when hold completes
        const applyUpgradeAndClose = () => {
          const allCards = list.querySelectorAll('.upgrade-card');
          allCards.forEach(c => {
            c.style.pointerEvents = 'none';
            c.style.opacity = '0.5';
            c.classList.remove('holding');
          });

          playSound('upgrade'); // "Wooooaaa" sound after picking upgrade

          // Phase 4: Wrap in try-catch to ensure modal always closes
          try {
            u.apply();
            // Debug: log upgrade applied (class/perk upgrades logged verbosely)
            if (window.GameDebug) window.GameDebug.onUpgradeApplied(u.id, playerStats);
          } catch (error) {
            console.error('Error applying upgrade:', error);
            if (window.GameDebug) window.GameDebug.oshot('upgrade_err_' + (u.id || 'unk'), 'Upgrade apply error ' + (u.id || '') + ': ' + error.message, error.stack);
          }

          // Always close modal
          modal.style.display = 'none';
          modal.querySelector('h2').innerText = 'LEVEL UP!';
          modal.querySelector('h2').style.fontSize = '24px';
          modal.querySelector('h2').style.color = '';
          // Hide skip button and clear its timeout
          const skipBtn = document.getElementById('levelup-skip-btn');
          if (skipBtn) skipBtn.style.display = 'none';
          clearTimeout(window.levelupSkipTimeoutId);

          // Restore camera position and projection after level-up
          if (savedCameraPosition) {
            camera.position.set(savedCameraPosition.x, savedCameraPosition.y, savedCameraPosition.z);
            camera.left = savedCameraPosition.left;
            camera.right = savedCameraPosition.right;
            camera.top = savedCameraPosition.top;
            camera.bottom = savedCameraPosition.bottom;
            camera.updateProjectionMatrix();
            savedCameraPosition = null; // Clear after restoration
          }

          // Check for Double Upgrade Chance bonus (only on the first pick, not on bonus rounds)
          if (!isBonusRound && playerStats.doubleUpgradeChance > 0) {
            const bonusChance = Math.min(1.0, playerStats.doubleUpgradeChance);
            if (Math.random() < bonusChance) {
              // Bonus round: reopen modal with a new set of choices without unpausing
              showUpgradeModal(true);
              // Resume combo timer
              if (comboState.pausedAt) {
                const pauseDuration = Date.now() - comboState.pausedAt;
                comboState.lastKillTime += pauseDuration;
                comboState.pausedAt = null;
              }
              lastHudUpdateMs = 0; // Force HUD refresh
              updateHUD();
              return;
            }
          }

          forceGameUnpause();

          // Resume combo timer after level-up
          if (comboState.pausedAt) {
            const pauseDuration = Date.now() - comboState.pausedAt;
            comboState.lastKillTime += pauseDuration;
            comboState.pausedAt = null;
          }

          lastHudUpdateMs = 0; // Force HUD refresh after level-up
          updateHUD();

          // Re-enable pointer events after closing (for next level up)
          setTimeout(() => {
            allCards.forEach(c => {
              c.style.pointerEvents = 'auto';
              c.style.opacity = '1';
              c.dataset.selected = '';
              c.style.outline = 'none';
              c.style.boxShadow = '';
              c.style.transform = 'scale(1)';
            });
          }, 500);
        };

        let holdTimer = null;

        // Hold interaction: press and hold for 450ms to confirm upgrade
        card.addEventListener('pointerdown', (e) => {
          if (e.button !== undefined && e.button !== 0) return; // Left-click/touch only
          e.preventDefault();

          // Cancel any in-progress hold on another card
          if (activeHold && activeHold.card !== card) {
            clearTimeout(activeHold.timer);
            activeHold.card.classList.remove('holding');
            activeHold.card.dataset.selected = '';
            activeHold.card.style.opacity = '0.5';
            activeHold.card.style.transform = 'scale(1)';
            activeHold = null;
          }
          if (holdTimer) return; // Already holding this card

          // Use pointer capture so pointerup fires even if pointer leaves the card
          card.setPointerCapture(e.pointerId);

          // Dim all other cards, highlight this one
          const allCards = list.querySelectorAll('.upgrade-card');
          allCards.forEach(c => {
            c.dataset.selected = '';
            c.style.opacity = '0.5';
            c.style.transform = 'scale(1)';
            c.classList.remove('holding');
          });
          card.dataset.selected = '1';
          card.style.opacity = '1';
          card.style.transform = 'scale(1.04)';

          // Start melt-shadow animation on this card
          card.classList.add('holding');

          // Confirm after 450ms hold duration
          holdTimer = setTimeout(() => {
            holdTimer = null;
            activeHold = null;
            // Guard: only apply if the modal is still visible and card is still selected
            if (card.dataset.selected === '1' && modal.style.display !== 'none') {
              applyUpgradeAndClose();
            }
          }, 450);
          activeHold = { timer: holdTimer, card };
        });

        // Cancel hold if released or interrupted before timer fires
        const cancelHold = () => {
          if (!holdTimer) return; // Timer already fired (hold completed) — nothing to cancel
          clearTimeout(holdTimer);
          holdTimer = null;
          if (activeHold && activeHold.card === card) activeHold = null;
          card.classList.remove('holding');
          // Restore this card's opacity (still selected, just not confirmed)
          if (card.dataset.selected === '1') {
            card.style.opacity = '1';
            card.style.transform = 'scale(1.04)';
          }
        };
        card.addEventListener('pointerup', cancelHold);
        card.addEventListener('pointercancel', cancelHold);
        list.appendChild(card);
      });
      } catch(cardErr) {
        console.error('[LevelUp] Card generation error:', cardErr);
        // Fallback: ensure game unpauses if card creation fails
        levelUpPending = false;
        setGamePaused(false);
        return;
      }

      modal.style.display = 'flex';

      // --- Dopamine level-up FX: time dilation, camera zoom, chromatic aberration ---
      if (window.DopamineSystem && window.DopamineSystem.LevelUpFX) {
        window.DopamineSystem.LevelUpFX.play();
      }
      // Animate upgrade cards as collector cards
      if (window.DopamineSystem && window.DopamineSystem.CollectorCards) {
        const cards = list.querySelectorAll('.upgrade-option, .upgrade-card');
        window.DopamineSystem.CollectorCards.animateEntrance(cards);
      }
      
      // Show skip button after 5 seconds as safety valve if player can't select an upgrade
      const skipBtn = document.getElementById('levelup-skip-btn');
      if (skipBtn) {
        skipBtn.style.display = 'none';
        clearTimeout(window.levelupSkipTimeoutId);
        window.levelupSkipTimeoutId = setTimeout(() => {
          if (modal.style.display === 'flex') skipBtn.style.display = 'inline-block';
        }, 5000);
      }
    }

    // Waterdrop dimensions constants (match SVG viewBox - raised/rounded shape)
