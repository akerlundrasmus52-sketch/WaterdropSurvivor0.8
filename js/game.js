import * as THREE from 'three';
// Entry point — imports all modules and initializes the game
import { COLORS, GAME_CONFIG } from './modules/constants.js';
import { gs, gameSettings, playerStats, weapons, joystickLeft, joystickRight, bulletHoleGeo, bulletHoleMat, disposalQueue } from './modules/state.js';
import { playSound, updateBackgroundMusic, startDroneHum, stopDroneHum } from './modules/audio.js';
import { Player, Enemy, Projectile, SwordSlash, IceSpear, Meteor, Particle, ObjectPool, Chest, ExpGem, GoldCoin, DroneTurret, Companion } from './modules/classes.js';
import { loadSaveData, saveSaveData, saveSettings, loadSettings } from './modules/save.js';
import { updateAchievementsScreen, claimAchievement, checkAchievements, updateStatBar } from './modules/achievements.js';
import { updateAttributesScreen, increaseAttribute } from './modules/attributes.js';
import { initializeGear, updateGearScreen, equipGear, unequipGear } from './modules/gear.js';
import { upgradeCampBuilding, unlockSkill, isDashUnlocked, isHeadshotUnlocked, startDash } from './modules/camp.js';
import { getCurrentQuest, checkQuestConditions, claimTutorialQuest, isQuestClaimed } from './modules/quests.js';
import { createWorld, cacheAnimatedObjects } from './modules/world.js';
import { init, spawnWave, processDisposalQueue, gameOver, resetGame, startGame, spawnParticles } from './modules/gamelogic.js';
import { setupInputs } from './modules/input.js';
import { animate, updateDayNightCycle } from './modules/mainloop.js';


// Init Game
try { init(); } catch(e) { console.error('[Game Error]', e); console.error('[Game] Initialization failed - game cannot start'); }
