// js/neural-1945.js — 1945 Vertical Scrolling Shooter Minigame
// Classic arcade-style shooter with ship upgrades, enemy waves, and boss battles
// Integrated into the Neural Matrix building

(function() {
  'use strict';

  // Game constants
  const CANVAS_WIDTH = 400;
  const CANVAS_HEIGHT = 600;
  const PLAYER_SPEED = 5;
  const BULLET_SPEED = 8;
  const ENEMY_SPEED = 2;
  const SCROLL_SPEED = 1.5;
  const MAX_MAP_LEVEL = 100;
  const SHIP_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
  const MAX_SHIPS = 3; // Limit to 3 ships as per game design requirements

  // Ship definitions with unique characteristics
  const SHIP_TYPES = [
    { id: 'falcon', name: 'Sky Falcon', icon: '🦅', color: '#4488ff', bonusFireRate: 1.2, bonusDamage: 1.0, bonusSpeed: 1.1 },
    { id: 'phoenix', name: 'Crimson Phoenix', icon: '🔥', color: '#ff4444', bonusFireRate: 1.0, bonusDamage: 1.3, bonusSpeed: 0.9 },
    { id: 'thunder', name: 'Thunder Bolt', icon: '⚡', color: '#ffff44', bonusFireRate: 1.5, bonusDamage: 0.9, bonusSpeed: 1.0 },
    { id: 'viper', name: 'Viper Strike', icon: '🐍', color: '#44ff44', bonusFireRate: 1.1, bonusDamage: 1.1, bonusSpeed: 1.2 },
    { id: 'omega', name: 'Omega Destroyer', icon: '💀', color: '#ff00ff', bonusFireRate: 0.8, bonusDamage: 1.5, bonusSpeed: 0.8 }
  ];

  // Ship upgrade tiers
  const SHIP_UPGRADES = {
    fireRate: {
      name: 'Fire Rate',
      icon: '⚡',
      levels: [
        { cost: 0, value: 200, desc: 'Base fire rate' },
        { cost: 100, value: 150, desc: '+33% fire rate' },
        { cost: 300, value: 100, desc: '+100% fire rate' },
        { cost: 800, value: 75, desc: '+167% fire rate' },
        { cost: 2000, value: 50, desc: '+300% fire rate' }
      ]
    },
    spread: {
      name: 'Spread Shot',
      icon: '↔️',
      levels: [
        { cost: 0, bullets: 1, angle: 0, desc: 'Single shot' },
        { cost: 200, bullets: 2, angle: 15, desc: 'Double shot' },
        { cost: 600, bullets: 3, angle: 20, desc: 'Triple shot' },
        { cost: 1500, bullets: 5, angle: 15, desc: 'Spread 5' },
        { cost: 4000, bullets: 7, angle: 12, desc: 'Max spread' }
      ]
    },
    damage: {
      name: 'Damage',
      icon: '💥',
      levels: [
        { cost: 0, value: 1, desc: 'Base damage' },
        { cost: 150, value: 2, desc: 'Double damage' },
        { cost: 500, value: 3, desc: 'Triple damage' },
        { cost: 1200, value: 5, desc: '5x damage' },
        { cost: 3000, value: 8, desc: '8x damage' }
      ]
    },
    missile: {
      name: 'Missiles',
      icon: '🚀',
      levels: [
        { cost: 0, enabled: false, desc: 'No missiles' },
        { cost: 400, enabled: true, count: 1, damage: 5, desc: 'Single missile' },
        { cost: 1000, enabled: true, count: 2, damage: 8, desc: 'Dual missiles' },
        { cost: 2500, enabled: true, count: 3, damage: 12, desc: 'Triple missiles' },
        { cost: 5000, enabled: true, count: 4, damage: 20, desc: 'Quad missiles' }
      ]
    },
    shield: {
      name: 'Shield',
      icon: '🛡️',
      levels: [
        { cost: 0, maxHp: 3, desc: 'Base HP: 3' },
        { cost: 250, maxHp: 5, desc: 'HP: 5' },
        { cost: 700, maxHp: 7, desc: 'HP: 7' },
        { cost: 1800, maxHp: 10, desc: 'HP: 10' },
        { cost: 4500, maxHp: 15, desc: 'HP: 15' }
      ]
    }
  };

  // Meta-progression skill tree
  const META_TREE = {
    engineTuning: { name: 'Engine Tuning', maxLevel: 5, speedBonus: 0.08, desc: '+8% ship speed per level' },
    cannonLink: { name: 'Linked Cannons', maxLevel: 5, fireRateBonus: 0.08, desc: '-8% fire interval per level' },
    fluxCapacitor: { name: 'Flux Capacitor', maxLevel: 3, superCooldown: 0.1, desc: '-10% super cooldown per level' }
  };

  // Super skills (in-run power plays)
  const SUPER_SKILLS = {
    nova: { id: 'nova', name: 'Void Nova', cooldown: 20000, icon: '💣' },
    overdrive: { id: 'overdrive', name: 'Overdrive', cooldown: 30000, duration: 6000, icon: '⚡' }
  };

  // Enemy types
  const ENEMY_TYPES = {
    basic: {
      hp: 1,
      score: 10,
      speed: 2,
      color: '#ff4444',
      size: 15,
      fireRate: 0,
      pattern: 'straight'
    },
    fast: {
      hp: 1,
      score: 20,
      speed: 4,
      color: '#44ff44',
      size: 12,
      fireRate: 0,
      pattern: 'zigzag'
    },
    tank: {
      hp: 5,
      score: 50,
      speed: 1,
      color: '#4444ff',
      size: 20,
      fireRate: 0.01,
      pattern: 'straight'
    },
    shooter: {
      hp: 2,
      score: 30,
      speed: 1.5,
      color: '#ff44ff',
      size: 15,
      fireRate: 0.02,
      pattern: 'straight'
    },
    bomber: {
      hp: 3,
      score: 40,
      speed: 2.5,
      color: '#ffaa00',
      size: 18,
      fireRate: 0.015,
      pattern: 'sine'
    }
  };

  // Boss definitions
  const BOSSES = [
    {
      name: 'Steel Guardian',
      hp: 100,
      score: 500,
      size: 60,
      color: '#888888',
      patterns: ['spread', 'laser', 'spiral']
    },
    {
      name: 'Crimson Phoenix',
      hp: 200,
      score: 1000,
      size: 70,
      color: '#ff0000',
      patterns: ['fire', 'dive', 'spread']
    },
    {
      name: 'Azure Leviathan',
      hp: 350,
      score: 2000,
      size: 80,
      color: '#0088ff',
      patterns: ['wave', 'homing', 'barrage']
    }
  ];

  // Game state
  const gameState = {
    active: false,
    paused: false,
    canvas: null,
    ctx: null,
    score: 0,
    highScore: 0,
    wave: 1,
    credits: 0,
    mapLevel: 1, // Current map level (1-100)
    selectedShip: 0, // Index of currently selected ship
    resourcesCollected: 0, // Resources collected this run

    player: {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT - 80,
      width: 30,
      height: 40,
      hp: 3,
      maxHp: 3,
      invulnerable: 0
    },

    upgrades: {
      fireRate: 0,
      spread: 0,
      damage: 0,
      missile: 0,
      shield: 0
    },
    meta: {
      skillPoints: 0,
      nodes: { engineTuning: 0, cannonLink: 0, fluxCapacitor: 0 }
    },
    superState: {
      nova: { lastUsed: -Infinity },
      overdrive: { lastUsed: -Infinity, activeUntil: 0 }
    },

    bullets: [],
    missiles: [],
    enemies: [],
    enemyBullets: [],
    powerUps: [],
    particles: [],

    keys: {},
    mouseX: 0,
    mouseY: 0,
    lastShot: 0,
    lastMissile: 0,
    scrollOffset: 0,

    bossActive: false,
    boss: null,

    mode: 'playing' // 'playing', 'upgrades', 'gameover', 'shipselect', 'mapselect'
  };

  // Initialize game
  function init() {
    // Load high score
    if (window.saveData && window.saveData.neural1945) {
      gameState.highScore = window.saveData.neural1945.highScore || 0;
      gameState.credits = window.saveData.neural1945.credits || 0;
      gameState.upgrades = window.saveData.neural1945.upgrades || {
        fireRate: 0, spread: 0, damage: 0, missile: 0, shield: 0
      };
      gameState.mapLevel = window.saveData.neural1945.mapLevel || 1;
      gameState.selectedShip = window.saveData.neural1945.selectedShip || 0;
      gameState.meta = window.saveData.neural1945.meta || { skillPoints: 0, nodes: { engineTuning: 0, cannonLink: 0, fluxCapacitor: 0 } };
      if (!gameState.meta.nodes) gameState.meta.nodes = { engineTuning: 0, cannonLink: 0, fluxCapacitor: 0 };
      if (gameState.meta.skillPoints === undefined) gameState.meta.skillPoints = 0;
      gameState.superState = {
        nova: { lastUsed: -Infinity },
        overdrive: { lastUsed: -Infinity, activeUntil: 0 }
      };

      // Initialize ships with cooldowns if not exists
      if (!window.saveData.neural1945.ships) {
        window.saveData.neural1945.ships = SHIP_TYPES.map((ship, i) => ({
          id: ship.id,
          unlocked: i === 0, // First ship unlocked by default
          lastUsed: 0,
          cooldownReduction: 0 // Can be upgraded in idle clicker
        }));
      }
    }

    // Apply shield upgrade
    const shieldLevel = SHIP_UPGRADES.shield.levels[gameState.upgrades.shield];
    gameState.player.maxHp = shieldLevel.maxHp;
    gameState.player.hp = shieldLevel.maxHp;
  }

  // Helper: Check if ship is on cooldown
  function isShipOnCooldown(shipIndex) {
    if (!window.saveData || !window.saveData.neural1945 || !window.saveData.neural1945.ships) return false;
    const ship = window.saveData.neural1945.ships[shipIndex];
    if (!ship || !ship.lastUsed) return false;

    const now = Date.now();
    const cooldownTime = SHIP_COOLDOWN_MS * (1 - ship.cooldownReduction * 0.05); // 5% reduction per upgrade
    return (now - ship.lastUsed) < cooldownTime;
  }

  // Helper: Get remaining cooldown time for ship
  function getShipCooldownRemaining(shipIndex) {
    if (!window.saveData || !window.saveData.neural1945 || !window.saveData.neural1945.ships) return 0;
    const ship = window.saveData.neural1945.ships[shipIndex];
    if (!ship || !ship.lastUsed) return 0;

    const now = Date.now();
    const cooldownTime = SHIP_COOLDOWN_MS * (1 - ship.cooldownReduction * 0.05);
    const remaining = cooldownTime - (now - ship.lastUsed);
    return Math.max(0, remaining);
  }

  // Helper: Mark ship as used
  function markShipUsed(shipIndex) {
    if (!window.saveData || !window.saveData.neural1945 || !window.saveData.neural1945.ships) return;
    window.saveData.neural1945.ships[shipIndex].lastUsed = Date.now();
    saveSaveData();
  }

  // Meta-progression helpers
  function getMetaState() {
    if (!gameState.meta) {
      gameState.meta = { skillPoints: 0, nodes: { engineTuning: 0, cannonLink: 0, fluxCapacitor: 0 } };
    }
    if (!gameState.meta.nodes) gameState.meta.nodes = { engineTuning: 0, cannonLink: 0, fluxCapacitor: 0 };
    return gameState.meta;
  }

  function getMetaMultiplier(type) {
    const meta = getMetaState();
    const nodes = meta.nodes || {};
    if (type === 'speed') {
      return 1 + (nodes.engineTuning || 0) * META_TREE.engineTuning.speedBonus;
    }
    if (type === 'fireRate') {
      const mult = 1 - (nodes.cannonLink || 0) * META_TREE.cannonLink.fireRateBonus;
      return Math.max(0.5, mult);
    }
    if (type === 'superCooldown') {
      const mult = 1 - (nodes.fluxCapacitor || 0) * META_TREE.fluxCapacitor.superCooldown;
      return Math.max(0.4, mult);
    }
    return 1;
  }

  function grantMetaPoint(reason) {
    const meta = getMetaState();
    meta.skillPoints = (meta.skillPoints || 0) + 1;
    if (window.saveData && window.saveData.neural1945) {
      window.saveData.neural1945.meta = meta;
      if (reason) window.saveData.neural1945.meta.lastEarnedReason = reason;
    }
    updateMetaUI();
  }

  function spendMetaPoint(nodeKey) {
    const meta = getMetaState();
    const node = META_TREE[nodeKey];
    if (!node) return { success: false, reason: 'Unknown node' };
    const current = meta.nodes[nodeKey] || 0;
    if (meta.skillPoints <= 0) return { success: false, reason: 'No skill points' };
    if (current >= node.maxLevel) return { success: false, reason: 'Node maxed' };
    meta.nodes[nodeKey] = current + 1;
    meta.skillPoints -= 1;
    saveProgress();
    updateMetaUI();
    return { success: true, level: meta.nodes[nodeKey] };
  }

  function updateMetaUI() {
    const meta = getMetaState();
    const metaEl = document.getElementById('nm1945-meta-points');
    if (metaEl) {
      metaEl.textContent = `Skill Points: ${meta.skillPoints || 0}`;
    }
    const modalMeta = document.getElementById('nm1945-upgrade-meta-points');
    if (modalMeta) modalMeta.textContent = `Skill Points: ${meta.skillPoints || 0}`;
    const buttons = document.querySelectorAll('.nm1945-meta-btn');
    buttons.forEach(btn => {
      const key = btn.getAttribute('data-meta');
      const node = META_TREE[key];
      const current = meta.nodes[key] || 0;
      btn.disabled = current >= node.maxLevel || meta.skillPoints <= 0;
      btn.querySelector('.nm1945-meta-level').textContent = `Lv ${current}/${node.maxLevel}`;
    });
  }

  // Super skill helpers
  function isOverdriveActive(now) {
    const t = now || Date.now();
    return gameState.superState.overdrive.activeUntil > t;
  }

  function getSuperCooldownRemaining(key) {
    const def = SUPER_SKILLS[key];
    const state = gameState.superState[key];
    if (!def || !state) return 0;
    const cd = def.cooldown * getMetaMultiplier('superCooldown');
    const remaining = (state.lastUsed + cd) - Date.now();
    return Math.max(0, remaining);
  }

  function useSuper(key) {
    const def = SUPER_SKILLS[key];
    const state = gameState.superState[key];
    if (!def || !state) return;
    if (getSuperCooldownRemaining(key) > 0) return;

    const now = Date.now();
    state.lastUsed = now;

    if (key === 'nova') {
      // Clear enemy bullets and vaporize weak enemies
      gameState.enemyBullets = [];
      const survivors = [];
      for (let i = 0; i < gameState.enemies.length; i++) {
        const enemy = gameState.enemies[i];
        enemy.hp -= enemy.maxHp * 0.9;
        createExplosion(enemy.x, enemy.y, enemy.type.color);
        if (enemy.hp <= 0) {
          gameState.score += enemy.type.score;
          gameState.credits += Math.floor(enemy.type.score / 4);
        } else {
          survivors.push(enemy);
        }
      }
      gameState.enemies = survivors;

      if (gameState.bossActive && gameState.boss) {
        gameState.boss.hp -= gameState.boss.maxHp * 0.25;
        createExplosion(gameState.boss.x, gameState.boss.y, gameState.boss.color);
        if (gameState.boss.hp <= 0) {
          gameState.score += gameState.boss.score;
          gameState.credits += Math.floor(gameState.boss.score / 3);
          gameState.bossActive = false;
          gameState.boss = null;
        }
      }
    } else if (key === 'overdrive') {
      state.activeUntil = now + def.duration;
      gameState.player.invulnerable = Math.max(gameState.player.invulnerable, 90);
    }
    updateSuperUI();
  }

  function updateSuperUI() {
    Object.keys(SUPER_SKILLS).forEach(key => {
      const btn = document.getElementById(`nm1945-super-${key}`);
      if (!btn) return;
      const remaining = getSuperCooldownRemaining(key);
      if (remaining > 0) {
        btn.disabled = true;
        const secs = Math.ceil(remaining / 1000);
        btn.textContent = `${SUPER_SKILLS[key].icon} ${SUPER_SKILLS[key].name} (${secs}s)`;
      } else {
        btn.disabled = false;
        btn.textContent = `${SUPER_SKILLS[key].icon} ${SUPER_SKILLS[key].name}`;
      }
    });
  }

  // Helper: Calculate map difficulty multiplier
  function getMapDifficultyMultiplier() {
    // Maps 1-10: 1.0x - 1.5x
    // Maps 11-50: 1.5x - 3.0x
    // Maps 51-100: 3.0x - 10.0x
    const level = gameState.mapLevel;
    if (level <= 10) {
      return 1.0 + (level - 1) * 0.05;
    } else if (level <= 50) {
      return 1.5 + (level - 10) * 0.0375;
    } else {
      return 3.0 + (level - 50) * 0.14;
    }
  }

  // Helper: Calculate map reward multiplier
  function getMapRewardMultiplier() {
    // Rewards scale faster than difficulty
    const level = gameState.mapLevel;
    if (level <= 10) {
      return 1.0 + (level - 1) * 0.1;
    } else if (level <= 50) {
      return 2.0 + (level - 10) * 0.1;
    } else {
      return 6.0 + (level - 50) * 0.2;
    }
  }

  // Helper: Spawn resource pickup (chance-based)
  function trySpawnResource(x, y) {
    const chance = 0.15 * getMapDifficultyMultiplier(); // Higher levels = more resources
    if (Math.random() < chance) {
      gameState.powerUps.push({
        x: x,
        y: y,
        type: 'resource',
        speed: 1,
        size: 20,
        color: '#00ffaa'
      });
    }
  }

  // Apply ship bonuses to player stats
  function applyShipBonuses() {
    const ship = SHIP_TYPES[gameState.selectedShip];
    return {
      fireRate: ship.bonusFireRate,
      damage: ship.bonusDamage,
      speed: ship.bonusSpeed
    };
  }

  // Create overlay UI
  function createUI() {
    const overlay = document.createElement('div');
    overlay.id = 'neural-1945-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(180deg, #000814 0%, #001d3d 100%);
      z-index: 9100;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      width: 100%;
      padding: 15px;
      background: rgba(0,0,0,0.8);
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #ffd700;
    `;
    header.innerHTML = `
      <div style="display: flex; gap: 20px; align-items: center;">
        <button id="nm1945-back" style="background: #ff4444; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-weight: bold;">← BACK</button>
        <button id="nm1945-upgrades" style="background: #4444ff; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-weight: bold;">⚙️ UPGRADES</button>
      </div>
      <div style="font-size: 24px; font-weight: bold; color: #ffd700;">✈️ 1945 STRIKER</div>
      <div style="display: flex; gap: 15px; color: white; font-size: 16px;">
        <span>SCORE: <span id="nm1945-score" style="color: #ffaa00; font-weight: bold;">0</span></span>
        <span>WAVE: <span id="nm1945-wave" style="color: #44ff44; font-weight: bold;">1</span></span>
        <span>💰 <span id="nm1945-credits" style="color: #ffd700; font-weight: bold;">0</span></span>
      </div>
    `;

    // Game canvas container
    const gameContainer = document.createElement('div');
    gameContainer.style.cssText = `
      position: relative;
      margin: 20px 0;
      box-shadow: 0 0 30px rgba(255,215,0,0.5);
      border: 3px solid #ffd700;
      border-radius: 10px;
      overflow: hidden;
    `;

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'nm1945-canvas';
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    canvas.style.cssText = `
      display: block;
      background: linear-gradient(180deg, #001a33 0%, #002244 50%, #003355 100%);
      cursor: crosshair;
    `;

    // HP Bar
    const hpBar = document.createElement('div');
    hpBar.id = 'nm1945-hp-bar';
    hpBar.style.cssText = `
      position: absolute;
      bottom: 10px;
      left: 10px;
      display: flex;
      gap: 5px;
    `;

    gameContainer.appendChild(canvas);
    gameContainer.appendChild(hpBar);

    // Meta + super bar
    const metaBar = document.createElement('div');
    metaBar.id = 'nm1945-meta-bar';
    metaBar.style.cssText = `
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: rgba(0, 8, 20, 0.7);
      border-bottom: 2px solid #233f66;
    `;
    const metaInfo = document.createElement('div');
    metaInfo.id = 'nm1945-meta-points';
    metaInfo.style.cssText = 'color:#ffd700;font-weight:bold;';
    metaInfo.textContent = `Skill Points: ${getMetaState().skillPoints || 0}`;
    metaBar.appendChild(metaInfo);

    const superWrap = document.createElement('div');
    superWrap.style.cssText = 'display:flex;gap:8px;';
    const novaBtn = document.createElement('button');
    novaBtn.id = 'nm1945-super-nova';
    novaBtn.className = 'nm1945-super-btn';
    novaBtn.textContent = `${SUPER_SKILLS.nova.icon} ${SUPER_SKILLS.nova.name}`;
    novaBtn.addEventListener('click', () => useSuper('nova'));
    const overdriveBtn = document.createElement('button');
    overdriveBtn.id = 'nm1945-super-overdrive';
    overdriveBtn.className = 'nm1945-super-btn';
    overdriveBtn.textContent = `${SUPER_SKILLS.overdrive.icon} ${SUPER_SKILLS.overdrive.name}`;
    overdriveBtn.addEventListener('click', () => useSuper('overdrive'));
    [novaBtn, overdriveBtn].forEach(btn => {
      btn.style.cssText = 'background:#1f3b5c;color:#fff;border:1px solid #335b8c;padding:8px 12px;border-radius:6px;cursor:pointer;font-weight:bold;';
      superWrap.appendChild(btn);
    });
    metaBar.appendChild(superWrap);

    overlay.appendChild(header);
    overlay.appendChild(metaBar);
    overlay.appendChild(gameContainer);

    document.body.appendChild(overlay);

    gameState.canvas = canvas;
    gameState.ctx = canvas.getContext('2d');

    // Event listeners
    document.getElementById('nm1945-back').addEventListener('click', close);
    document.getElementById('nm1945-upgrades').addEventListener('click', showUpgrades);

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      gameState.mouseX = e.clientX - rect.left;
      gameState.mouseY = e.clientY - rect.top;
    });

    canvas.addEventListener('click', () => {
      if (gameState.mode === 'gameover') {
        restart();
      }
    });

    window.addEventListener('keydown', (e) => {
      gameState.keys[e.key] = true;
      if (e.key === 'Escape') {
        if (gameState.mode === 'upgrades') {
          gameState.mode = 'playing';
        } else {
          close();
        }
      }
      if (e.key === 'u' || e.key === 'U') {
        showUpgrades();
      }
      if (e.key === 'q' || e.key === 'Q') {
        useSuper('nova');
      }
      if (e.key === 'e' || e.key === 'E') {
        useSuper('overdrive');
      }
    });

    window.addEventListener('keyup', (e) => {
      gameState.keys[e.key] = false;
    });

    updateMetaUI();
    updateSuperUI();
    updateHPBar();
  }

  // Update HP bar display
  function updateHPBar() {
    const hpBar = document.getElementById('nm1945-hp-bar');
    if (!hpBar) return;

    hpBar.innerHTML = '';
    for (let i = 0; i < gameState.player.maxHp; i++) {
      const heart = document.createElement('div');
      heart.style.cssText = `
        width: 25px;
        height: 25px;
        font-size: 20px;
        text-align: center;
        line-height: 25px;
      `;
      heart.textContent = i < gameState.player.hp ? '❤️' : '🖤';
      hpBar.appendChild(heart);
    }
  }

  // Show upgrades menu
  function showUpgrades() {
    gameState.mode = 'upgrades';
    gameState.paused = true;

    const upgradesDiv = document.createElement('div');
    upgradesDiv.id = 'nm1945-upgrades-menu';
    upgradesDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 3px solid #ffd700;
      border-radius: 20px;
      padding: 30px;
      z-index: 9101;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 0 50px rgba(255,215,0,0.8);
    `;

    let html = `
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #ffd700; font-size: 28px; margin: 0 0 10px 0;">⚙️ SHIP UPGRADES</h2>
        <div style="font-size: 18px; color: #ffaa00;">Credits: <span style="color: #ffd700; font-weight: bold;">${gameState.credits}</span></div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 15px;">
    `;

    for (const [key, upgrade] of Object.entries(SHIP_UPGRADES)) {
      const currentLevel = gameState.upgrades[key];
      const nextLevel = currentLevel + 1;
      const canUpgrade = nextLevel < upgrade.levels.length;
      const nextUpgrade = canUpgrade ? upgrade.levels[nextLevel] : null;
      const currentUpgrade = upgrade.levels[currentLevel];

      html += `
        <div style="background: rgba(0,0,0,0.5); padding: 15px; border-radius: 10px; border: 2px solid ${canUpgrade ? '#4444ff' : '#444'};">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="font-size: 20px; font-weight: bold; color: white;">
              ${upgrade.icon} ${upgrade.name}
              <span style="color: #888; font-size: 14px; margin-left: 10px;">Level ${currentLevel + 1}/${upgrade.levels.length}</span>
            </div>
            ${canUpgrade ? `
              <button class="nm1945-upgrade-btn" data-upgrade="${key}"
                ${gameState.credits >= nextUpgrade.cost ? '' : 'disabled'}
                style="background: ${gameState.credits >= nextUpgrade.cost ? '#44ff44' : '#666'};
                       color: ${gameState.credits >= nextUpgrade.cost ? '#000' : '#333'};
                       border: none;
                       padding: 8px 16px;
                       border-radius: 5px;
                       cursor: ${gameState.credits >= nextUpgrade.cost ? 'pointer' : 'not-allowed'};
                       font-weight: bold;">
                UPGRADE (${nextUpgrade.cost} 💰)
              </button>
            ` : `<span style="color: #ffd700; font-weight: bold;">MAX LEVEL</span>`}
          </div>
          <div style="color: #aaa; font-size: 14px; margin-bottom: 5px;">Current: ${currentUpgrade.desc}</div>
          ${canUpgrade ? `<div style="color: #44ff44; font-size: 14px;">Next: ${nextUpgrade.desc}</div>` : ''}
        </div>
      `;
    }

    const meta = getMetaState();
    html += `
      </div>
      <div style="margin-top:18px;padding:14px;border:2px solid #335b8c;border-radius:12px;background:rgba(10,20,40,0.6);">
        <div style="display:flex;justify-content:space-between;align-items:center; margin-bottom:10px;">
          <h3 style="color:#66ccff;margin:0;">🧠 Meta Skill Tree</h3>
          <div id="nm1945-upgrade-meta-points" style="color:#ffd700;font-weight:bold;">Skill Points: ${meta.skillPoints || 0}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
    `;
    Object.keys(META_TREE).forEach(key => {
      const node = META_TREE[key];
      const level = meta.nodes[key] || 0;
      html += `
        <div style="padding:10px;border:1px solid #1d3761;border-radius:8px;background:rgba(0,0,0,0.35);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="color:#fff;font-weight:bold;">${node.name}</div>
              <div style="color:#aaa;font-size:13px;">${node.desc}</div>
            </div>
            <button class="nm1945-meta-btn" data-meta="${key}"
              style="background:#235c9c;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;"
            >
              <span class="nm1945-meta-level">Lv ${level}/${node.maxLevel}</span>
            </button>
          </div>
        </div>
      `;
    });

    html += `
      </div>
      <div style="text-align: center; margin-top: 20px;">
        <button id="nm1945-close-upgrades" style="background: #ff4444; color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 16px;">CLOSE</button>
      </div>
    `;

    upgradesDiv.innerHTML = html;
    document.body.appendChild(upgradesDiv);

    // Upgrade button listeners
    document.querySelectorAll('.nm1945-upgrade-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const upgradeKey = btn.getAttribute('data-upgrade');
        purchaseUpgrade(upgradeKey);
      });
    });
    document.querySelectorAll('.nm1945-meta-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-meta');
        const result = spendMetaPoint(key);
        if (!result.success) {
          alert(result.reason || 'Unable to upgrade');
        } else {
          document.getElementById('nm1945-upgrades-menu').remove();
          showUpgrades();
        }
      });
    });

    document.getElementById('nm1945-close-upgrades').addEventListener('click', () => {
      upgradesDiv.remove();
      gameState.mode = 'playing';
      gameState.paused = false;
    });
  }

  // Purchase upgrade
  function purchaseUpgrade(key) {
    const upgrade = SHIP_UPGRADES[key];
    const currentLevel = gameState.upgrades[key];
    const nextLevel = currentLevel + 1;

    if (nextLevel >= upgrade.levels.length) return;

    const cost = upgrade.levels[nextLevel].cost;
    if (gameState.credits < cost) return;

    gameState.credits -= cost;
    gameState.upgrades[key] = nextLevel;

    // Apply shield upgrade immediately
    if (key === 'shield') {
      const oldMaxHp = gameState.player.maxHp;
      gameState.player.maxHp = SHIP_UPGRADES.shield.levels[nextLevel].maxHp;
      gameState.player.hp += (gameState.player.maxHp - oldMaxHp);
      updateHPBar();
    }

    saveProgress();

    // Refresh upgrades menu
    document.getElementById('nm1945-upgrades-menu').remove();
    showUpgrades();
  }

  // Game loop
  function gameLoop() {
    if (!gameState.active) return;

    const now = Date.now();

    if (gameState.mode === 'playing' && !gameState.paused) {
      update(now);
    }

    render();
    requestAnimationFrame(gameLoop);
  }

  // Update game state
  function update(now) {
    // Update scroll
    gameState.scrollOffset += SCROLL_SPEED;
    if (gameState.scrollOffset > 50) gameState.scrollOffset = 0;

    // Player movement
    const player = gameState.player;
    const shipBonuses = applyShipBonuses();
    const baseSpeed = PLAYER_SPEED * shipBonuses.speed * getMetaMultiplier('speed');
    const moveSpeed = isOverdriveActive(now) ? baseSpeed * 1.25 : baseSpeed;

    // Keyboard movement
    if (gameState.keys['ArrowLeft'] || gameState.keys['a']) {
      player.x = Math.max(player.width / 2, player.x - moveSpeed);
    }
    if (gameState.keys['ArrowRight'] || gameState.keys['d']) {
      player.x = Math.min(CANVAS_WIDTH - player.width / 2, player.x + moveSpeed);
    }
    if (gameState.keys['ArrowUp'] || gameState.keys['w']) {
      player.y = Math.max(player.height / 2, player.y - moveSpeed);
    }
    if (gameState.keys['ArrowDown'] || gameState.keys['s']) {
      player.y = Math.min(CANVAS_HEIGHT - player.height / 2, player.y + moveSpeed);
    }

    // Mouse following (alternative control)
    if (gameState.mouseX > 0) {
      const dx = gameState.mouseX - player.x;
      const dy = gameState.mouseY - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 5) {
        player.x += (dx / dist) * Math.min(PLAYER_SPEED, dist);
        player.y += (dy / dist) * Math.min(PLAYER_SPEED, dist);
      }
    }

    // Auto-fire
    const fireRateLevel = SHIP_UPGRADES.fireRate.levels[gameState.upgrades.fireRate];
    const fireInterval = Math.max(50, fireRateLevel.value * getMetaMultiplier('fireRate') * (isOverdriveActive(now) ? 0.5 : 1));
    if (now - gameState.lastShot > fireInterval) {
      shootBullets();
      gameState.lastShot = now;
    }

    // Auto-fire missiles
    const missileLevel = SHIP_UPGRADES.missile.levels[gameState.upgrades.missile];
    if (missileLevel.enabled && now - gameState.lastMissile > 2000) {
      shootMissiles();
      gameState.lastMissile = now;
    }

    // Decrease invulnerability
    if (player.invulnerable > 0) {
      player.invulnerable--;
    }

    // Update bullets
    gameState.bullets = gameState.bullets.filter(b => {
      b.y -= BULLET_SPEED;
      return b.y > -10;
    });

    // Update missiles
    gameState.missiles = gameState.missiles.filter(m => {
      // Homing behavior
      if (gameState.enemies.length > 0) {
        const target = gameState.enemies[0];
        const dx = target.x - m.x;
        const dy = target.y - m.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        m.vx = (dx / dist) * 6;
        m.vy = (dy / dist) * 6;
      }
      m.x += m.vx;
      m.y += m.vy;
      return m.y > -10 && m.y < CANVAS_HEIGHT + 10 && m.x > -10 && m.x < CANVAS_WIDTH + 10;
    });

    // Update enemy bullets
    gameState.enemyBullets = gameState.enemyBullets.filter(b => {
      b.y += 4;
      return b.y < CANVAS_HEIGHT + 10;
    });

    // Update enemies
    gameState.enemies = gameState.enemies.filter(e => {
      updateEnemy(e);

      // Enemy shooting
      if (e.type.fireRate > 0 && Math.random() < e.type.fireRate) {
        gameState.enemyBullets.push({
          x: e.x,
          y: e.y + e.type.size / 2,
          width: 4,
          height: 8
        });
      }

      return e.y < CANVAS_HEIGHT + 50 && e.hp > 0;
    });

    // Update boss
    if (gameState.bossActive && gameState.boss) {
      updateBoss(gameState.boss);
    }

    // Update particles
    gameState.particles = gameState.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      p.alpha = p.life / p.maxLife;
      return p.life > 0;
    });

    // Collision detection
    checkCollisions();

    // Wave management: track whether we have already started filling this wave
    if (!gameState._waveSpawned) gameState._waveSpawned = 0;
    if (!gameState._waveEnemyCount) gameState._waveEnemyCount = 3 + Math.floor(gameState.wave * 1.5);

    // Spawn enemies continuously until we've spawned the wave target
    if (!gameState.bossActive && gameState._waveSpawned < gameState._waveEnemyCount) {
      if (gameState.enemies.length < Math.min(8, 3 + gameState.wave) && Math.random() < 0.04) {
        spawnEnemy();
        gameState._waveSpawned++;
      }
    }

    // Trigger boss when we've cleared enough waves
    if (!gameState.bossActive && gameState._waveSpawned >= gameState._waveEnemyCount
        && gameState.enemies.length === 0 && gameState.wave % 5 === 0 && !gameState._bossTriggeredThisWave) {
      gameState._bossTriggeredThisWave = true;
      spawnBoss();
    }

    // Advance to next wave when all enemies and boss are gone
    if (!gameState.bossActive && gameState.enemies.length === 0
        && gameState._waveSpawned >= gameState._waveEnemyCount) {
      gameState.wave++;
      gameState._waveSpawned = 0;
      gameState._waveEnemyCount = 3 + Math.floor(gameState.wave * 1.5);
      gameState._bossTriggeredThisWave = false;
      grantMetaPoint('wave_clear');
      updateUI();
    }

    updateUI();
  }

  // Update enemy position
  function updateEnemy(enemy) {
    enemy.time = (enemy.time || 0) + 0.05;

    switch (enemy.type.pattern) {
      case 'straight':
        enemy.y += enemy.type.speed;
        break;
      case 'zigzag':
        enemy.y += enemy.type.speed;
        enemy.x += Math.sin(enemy.time * 3) * 2;
        break;
      case 'sine':
        enemy.y += enemy.type.speed;
        enemy.x += Math.sin(enemy.time * 2) * 3;
        break;
    }
  }

  // Update boss
  function updateBoss(boss) {
    boss.time = (boss.time || 0) + 0.02;

    // Boss movement pattern
    boss.x = CANVAS_WIDTH / 2 + Math.sin(boss.time) * 100;
    boss.y = 80 + Math.sin(boss.time * 0.5) * 20;

    // Boss attack patterns
    if (Math.random() < 0.015) {
      bossAttack(boss);
    }
  }

  // Boss attack
  function bossAttack(boss) {
    const pattern = boss.patterns[Math.floor(Math.random() * boss.patterns.length)];

    switch (pattern) {
      case 'spread':
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI * 2 / 8) * i;
          gameState.enemyBullets.push({
            x: boss.x,
            y: boss.y,
            width: 6,
            height: 6,
            vx: Math.cos(angle) * 3,
            vy: Math.sin(angle) * 3
          });
        }
        break;
      case 'laser':
        for (let i = 0; i < 5; i++) {
          gameState.enemyBullets.push({
            x: boss.x,
            y: boss.y + i * 10,
            width: 8,
            height: 20,
            vx: 0,
            vy: 6
          });
        }
        break;
      case 'spiral':
        for (let i = 0; i < 12; i++) {
          const angle = (Math.PI * 2 / 12) * i + boss.time;
          gameState.enemyBullets.push({
            x: boss.x,
            y: boss.y,
            width: 5,
            height: 5,
            vx: Math.cos(angle) * 2.5,
            vy: Math.sin(angle) * 2.5
          });
        }
        break;
    }
  }

  // Shoot bullets
  function shootBullets() {
    const spreadLevel = SHIP_UPGRADES.spread.levels[gameState.upgrades.spread];
    const bullets = spreadLevel.bullets;
    const angle = spreadLevel.angle;

    for (let i = 0; i < bullets; i++) {
      const offset = (i - (bullets - 1) / 2) * angle;
      const rad = (offset * Math.PI) / 180;

      gameState.bullets.push({
        x: gameState.player.x,
        y: gameState.player.y - 20,
        width: 4,
        height: 10,
        vx: Math.sin(rad) * BULLET_SPEED,
        vy: -Math.cos(rad) * BULLET_SPEED
      });
    }
  }

  // Shoot missiles
  function shootMissiles() {
    const missileLevel = SHIP_UPGRADES.missile.levels[gameState.upgrades.missile];

    for (let i = 0; i < missileLevel.count; i++) {
      const offset = (i - (missileLevel.count - 1) / 2) * 15;

      gameState.missiles.push({
        x: gameState.player.x + offset,
        y: gameState.player.y,
        width: 6,
        height: 12,
        vx: 0,
        vy: -8,
        damage: missileLevel.damage
      });
    }
  }

  // Spawn enemy
  function spawnEnemy() {
    const types = Object.keys(ENEMY_TYPES);
    const typeKey = types[Math.floor(Math.random() * types.length)];
    const type = ENEMY_TYPES[typeKey];
    const difficultyMult = getMapDifficultyMultiplier();

    gameState.enemies.push({
      x: Math.random() * (CANVAS_WIDTH - 40) + 20,
      y: -type.size,
      hp: type.hp * (1 + gameState.wave * 0.1) * difficultyMult,
      maxHp: type.hp * (1 + gameState.wave * 0.1) * difficultyMult,
      type: type,
      time: 0
    });
  }

  // Spawn boss
  function spawnBoss() {
    const bossIndex = Math.min(Math.floor(gameState.wave / 5) - 1, BOSSES.length - 1);
    const bossDef = BOSSES[bossIndex];
    const difficultyMult = getMapDifficultyMultiplier();

    gameState.bossActive = true;
    gameState.boss = {
      x: CANVAS_WIDTH / 2,
      y: -100,
      hp: bossDef.hp * (1 + gameState.wave * 0.05) * difficultyMult,
      maxHp: bossDef.hp * (1 + gameState.wave * 0.05) * difficultyMult,
      size: bossDef.size,
      color: bossDef.color,
      name: bossDef.name,
      score: bossDef.score,
      patterns: bossDef.patterns,
      time: 0
    };
  }

  // Check collisions
  function checkCollisions() {
    const shipBonuses = applyShipBonuses();
    const damageLevel = SHIP_UPGRADES.damage.levels[gameState.upgrades.damage];
    const rewardMultiplier = getMapRewardMultiplier();

    // Player bullets vs enemies
    for (let i = gameState.bullets.length - 1; i >= 0; i--) {
      const bullet = gameState.bullets[i];

      for (let j = gameState.enemies.length - 1; j >= 0; j--) {
        const enemy = gameState.enemies[j];
        if (checkRectCollision(bullet, { x: enemy.x - enemy.type.size / 2, y: enemy.y - enemy.type.size / 2, width: enemy.type.size, height: enemy.type.size })) {
          enemy.hp -= damageLevel.value * shipBonuses.damage;
          gameState.bullets.splice(i, 1);
          createParticles(enemy.x, enemy.y, enemy.type.color);

          if (enemy.hp <= 0) {
            const scoreGain = Math.floor(enemy.type.score * rewardMultiplier);
            const creditsGain = Math.floor(scoreGain / 5);
            gameState.score += scoreGain;
            gameState.credits += creditsGain;
            createExplosion(enemy.x, enemy.y, enemy.type.color);

            // Try to spawn resource pickup
            trySpawnResource(enemy.x, enemy.y);

            // Grant Account XP for enemy kill (1 XP per kill)
            if (typeof addAccountXP === 'function') {
              addAccountXP(1);
            } else if (window.GameAccount && typeof window.GameAccount.addXP === 'function' && window.saveData) {
              window.GameAccount.addXP(1, '1945 Minigame', window.saveData);
            }
          }
          break;
        }
      }
    }

    // Missiles vs enemies
    for (let i = gameState.missiles.length - 1; i >= 0; i--) {
      const missile = gameState.missiles[i];

      for (let j = gameState.enemies.length - 1; j >= 0; j--) {
        const enemy = gameState.enemies[j];
        if (checkRectCollision(missile, { x: enemy.x - enemy.type.size / 2, y: enemy.y - enemy.type.size / 2, width: enemy.type.size, height: enemy.type.size })) {
          enemy.hp -= missile.damage;
          gameState.missiles.splice(i, 1);
          createExplosion(enemy.x, enemy.y, enemy.type.color);

          if (enemy.hp <= 0) {
            gameState.score += enemy.type.score;
            gameState.credits += Math.floor(enemy.type.score / 5);
            // Grant Account XP for enemy kill (1 XP per kill)
            if (typeof addAccountXP === 'function') {
              addAccountXP(1);
            } else if (window.GameAccount && typeof window.GameAccount.addXP === 'function' && window.saveData) {
              window.GameAccount.addXP(1, '1945 Minigame', window.saveData);
            }
          }
          break;
        }
      }
    }

    // Player bullets vs boss
    if (gameState.bossActive && gameState.boss) {
      for (let i = gameState.bullets.length - 1; i >= 0; i--) {
        const bullet = gameState.bullets[i];
        if (checkRectCollision(bullet, {
          x: gameState.boss.x - gameState.boss.size / 2,
          y: gameState.boss.y - gameState.boss.size / 2,
          width: gameState.boss.size,
          height: gameState.boss.size
        })) {
          gameState.boss.hp -= damageLevel.value;
          gameState.bullets.splice(i, 1);
          createParticles(gameState.boss.x, gameState.boss.y, gameState.boss.color);

          if (gameState.boss.hp <= 0) {
            gameState.score += gameState.boss.score;
            gameState.credits += Math.floor(gameState.boss.score / 2);
            createExplosion(gameState.boss.x, gameState.boss.y, gameState.boss.color);
            gameState.bossActive = false;
            gameState.boss = null;
            gameState.wave++;
          }
        }
      }
    }

    // Enemy bullets vs player
    if (gameState.player.invulnerable === 0) {
      for (let i = gameState.enemyBullets.length - 1; i >= 0; i--) {
        const bullet = gameState.enemyBullets[i];
        const bvx = bullet.vx || 0;
        const bvy = bullet.vy || 0;

        if (checkRectCollision(
          { x: bullet.x, y: bullet.y, width: bullet.width, height: bullet.height },
          { x: gameState.player.x - gameState.player.width / 2, y: gameState.player.y - gameState.player.height / 2, width: gameState.player.width, height: gameState.player.height }
        )) {
          hitPlayer();
          gameState.enemyBullets.splice(i, 1);
        }
      }
    }

    // Enemies vs player
    if (gameState.player.invulnerable === 0) {
      for (const enemy of gameState.enemies) {
        if (checkRectCollision(
          { x: enemy.x - enemy.type.size / 2, y: enemy.y - enemy.type.size / 2, width: enemy.type.size, height: enemy.type.size },
          { x: gameState.player.x - gameState.player.width / 2, y: gameState.player.y - gameState.player.height / 2, width: gameState.player.width, height: gameState.player.height }
        )) {
          hitPlayer();
          enemy.hp = 0;
        }
      }
    }

    // Player vs powerUps/resources
    for (let i = gameState.powerUps.length - 1; i >= 0; i--) {
      const powerUp = gameState.powerUps[i];
      if (checkRectCollision(
        { x: powerUp.x - powerUp.size / 2, y: powerUp.y - powerUp.size / 2, width: powerUp.size, height: powerUp.size },
        { x: gameState.player.x - gameState.player.width / 2, y: gameState.player.y - gameState.player.height / 2, width: gameState.player.width, height: gameState.player.height }
      )) {
        if (powerUp.type === 'resource') {
          gameState.resourcesCollected++;
          createParticles(powerUp.x, powerUp.y, powerUp.color);
        }
        gameState.powerUps.splice(i, 1);
      }
    }
  }

  // Rectangle collision
  function checkRectCollision(a, b) {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
  }

  // Player hit
  function hitPlayer() {
    gameState.player.hp--;
    gameState.player.invulnerable = 120;
    updateHPBar();
    createExplosion(gameState.player.x, gameState.player.y, '#ff4444');

    if (gameState.player.hp <= 0) {
      gameOver();
    }
  }

  // Create particles
  function createParticles(x, y, color) {
    for (let i = 0; i < 5; i++) {
      gameState.particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 30,
        maxLife: 30,
        alpha: 1,
        color: color,
        size: 3
      });
    }
  }

  // Create explosion
  function createExplosion(x, y, color) {
    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 / 20) * i;
      gameState.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * 6,
        vy: Math.sin(angle) * 6,
        life: 40,
        maxLife: 40,
        alpha: 1,
        color: color,
        size: 4
      });
    }
  }

  // Draw map background based on current level
  function drawMapBackground(ctx) {
    const map = gameState.currentMap;

    // Map theme mapping: different backgrounds for different map ranges
    // Maps 1-20: Space (default stars)
    // Maps 21-40: Stonehenge (ancient stones)
    // Maps 41-60: Pyramids (Egyptian desert)
    // Maps 61-75: UFO Crash Site (alien landscape)
    // Maps 76-90: Annunaki (divine golden atmosphere)
    // Maps 91-100: AI Matrix (digital grid)

    if (map <= 20) {
      // Space theme - dark blue with stars
      ctx.fillStyle = '#001a33';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (let i = 0; i < 50; i++) {
        const x = (i * 37) % CANVAS_WIDTH;
        const y = ((i * 53 + gameState.scrollOffset) % CANVAS_HEIGHT);
        ctx.fillRect(x, y, 2, 2);
      }
    } else if (map <= 40) {
      // Stonehenge theme - dark green sky with stone silhouettes
      ctx.fillStyle = '#0a1f0a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      // Draw stone pillars scrolling
      ctx.fillStyle = 'rgba(80,70,60,0.6)';
      for (let i = 0; i < 5; i++) {
        const x = (i * 100 + gameState.scrollOffset * 0.3) % CANVAS_WIDTH;
        const y = CANVAS_HEIGHT - 150;
        ctx.fillRect(x - 20, y, 40, 150);
        ctx.fillRect(x + 50, y, 40, 150);
        // Lintel on top
        ctx.fillRect(x - 25, y - 20, 115, 25);
      }
      // Stars
      ctx.fillStyle = 'rgba(200,200,180,0.4)';
      for (let i = 0; i < 30; i++) {
        const x = (i * 43) % CANVAS_WIDTH;
        const y = ((i * 61 + gameState.scrollOffset * 0.5) % (CANVAS_HEIGHT - 200));
        ctx.fillRect(x, y, 2, 2);
      }
    } else if (map <= 60) {
      // Pyramids theme - sandy desert sky
      ctx.fillStyle = '#1a1410';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      // Draw pyramid silhouettes
      ctx.fillStyle = 'rgba(180,140,80,0.5)';
      for (let i = 0; i < 3; i++) {
        const x = (i * 150 + gameState.scrollOffset * 0.2) % (CANVAS_WIDTH + 100);
        const y = CANVAS_HEIGHT - 100;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 60, y + 100);
        ctx.lineTo(x + 60, y + 100);
        ctx.closePath();
        ctx.fill();
      }
      // Sand particles
      ctx.fillStyle = 'rgba(210,180,140,0.3)';
      for (let i = 0; i < 40; i++) {
        const x = (i * 39) % CANVAS_WIDTH;
        const y = ((i * 67 + gameState.scrollOffset * 0.8) % CANVAS_HEIGHT);
        ctx.fillRect(x, y, 1, 1);
      }
    } else if (map <= 75) {
      // UFO Crash Site theme - alien purple/green atmosphere
      ctx.fillStyle = '#0d0a1a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      // Alien atmosphere glow
      const gradient = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 50, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 300);
      gradient.addColorStop(0, 'rgba(100,0,180,0.2)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      // UFO debris floating
      ctx.fillStyle = 'rgba(150,150,200,0.5)';
      for (let i = 0; i < 8; i++) {
        const x = (i * 60 + gameState.scrollOffset * 0.4) % CANVAS_WIDTH;
        const y = ((i * 71 + gameState.scrollOffset * 0.6) % CANVAS_HEIGHT);
        ctx.fillRect(x - 3, y - 3, 6, 6);
      }
      // Strange lights
      ctx.fillStyle = 'rgba(0,255,100,0.4)';
      for (let i = 0; i < 20; i++) {
        const x = (i * 47) % CANVAS_WIDTH;
        const y = ((i * 83 + gameState.scrollOffset * 0.7) % CANVAS_HEIGHT);
        ctx.fillRect(x, y, 2, 2);
      }
    } else if (map <= 90) {
      // Annunaki theme - golden divine atmosphere
      ctx.fillStyle = '#1a1408';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      // Golden divine light rays
      ctx.globalAlpha = 0.15;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + gameState.scrollOffset * 0.001;
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 30;
        ctx.beginPath();
        ctx.moveTo(CANVAS_WIDTH / 2, -100);
        ctx.lineTo(CANVAS_WIDTH / 2 + Math.sin(angle) * 300, CANVAS_HEIGHT + 100);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Ancient symbols floating
      ctx.fillStyle = 'rgba(255,191,0,0.6)';
      ctx.font = 'bold 20px Arial';
      const symbols = ['𓀀', '𓀁', '𓀂', '𓂀'];
      for (let i = 0; i < symbols.length; i++) {
        const x = (i * 100 + gameState.scrollOffset * 0.3) % CANVAS_WIDTH;
        const y = ((i * 97 + gameState.scrollOffset * 0.5) % CANVAS_HEIGHT);
        ctx.fillText(symbols[i], x, y);
      }
    } else {
      // AI Matrix theme - digital grid (maps 91-100)
      ctx.fillStyle = '#050510';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      // Digital grid lines
      ctx.strokeStyle = 'rgba(0,255,255,0.2)';
      ctx.lineWidth = 1;
      const gridSize = 30;
      const offsetY = gameState.scrollOffset % gridSize;
      for (let i = 0; i < CANVAS_HEIGHT / gridSize + 1; i++) {
        const y = i * gridSize - offsetY;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
      }
      for (let i = 0; i < CANVAS_WIDTH / gridSize; i++) {
        const x = i * gridSize;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();
      }
      // Digital particles (binary code)
      ctx.fillStyle = 'rgba(0,255,255,0.5)';
      ctx.font = '12px monospace';
      for (let i = 0; i < 30; i++) {
        const x = (i * 43) % CANVAS_WIDTH;
        const y = ((i * 71 + gameState.scrollOffset) % CANVAS_HEIGHT);
        ctx.fillText(Math.random() > 0.5 ? '1' : '0', x, y);
      }
    }
  }

  // Render game
  function render() {
    const ctx = gameState.ctx;
    if (!ctx) return;

    // Draw background based on current map
    drawMapBackground(ctx);

    if (gameState.mode === 'playing') {
      // Draw player
      drawPlayer(ctx);

      // Draw bullets
      ctx.fillStyle = '#ffff00';
      for (const bullet of gameState.bullets) {
        ctx.fillRect(bullet.x - bullet.width / 2, bullet.y, bullet.width, bullet.height);
      }

      // Draw missiles
      ctx.fillStyle = '#ff8800';
      for (const missile of gameState.missiles) {
        ctx.beginPath();
        ctx.moveTo(missile.x, missile.y - missile.height / 2);
        ctx.lineTo(missile.x - missile.width / 2, missile.y + missile.height / 2);
        ctx.lineTo(missile.x + missile.width / 2, missile.y + missile.height / 2);
        ctx.closePath();
        ctx.fill();
      }

      // Draw enemy bullets
      ctx.fillStyle = '#ff0000';
      for (const bullet of gameState.enemyBullets) {
        ctx.fillRect(bullet.x - bullet.width / 2, bullet.y - bullet.height / 2, bullet.width, bullet.height);
      }

      // Draw enemies
      for (const enemy of gameState.enemies) {
        ctx.fillStyle = enemy.type.color;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.type.size / 2, 0, Math.PI * 2);
        ctx.fill();

        // HP bars removed
      }

      // Draw boss
      if (gameState.bossActive && gameState.boss) {
        const boss = gameState.boss;
        ctx.fillStyle = boss.color;
        ctx.beginPath();
        ctx.arc(boss.x, boss.y, boss.size / 2, 0, Math.PI * 2);
        ctx.fill();

        // Boss HP bar removed

        // Boss name
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(boss.name, CANVAS_WIDTH / 2, 18);
      }

      // Draw particles
      for (const p of gameState.particles) {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;

    } else if (gameState.mode === 'gameover') {
      // Game over screen
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60);

      ctx.fillStyle = '#ffffff';
      ctx.font = '24px Arial';
      ctx.fillText(`Final Score: ${gameState.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      ctx.fillText(`Wave: ${gameState.wave}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
      ctx.fillText(`Credits Earned: ${gameState.credits - (window.saveData?.neural1945?.credits || 0)}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 80);

      ctx.fillStyle = '#ffaa00';
      ctx.font = '18px Arial';
      ctx.fillText('Click to restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 140);
    }
  }

  // Draw player ship
  function drawPlayer(ctx) {
    const p = gameState.player;

    // Flashing when invulnerable
    if (p.invulnerable > 0 && Math.floor(p.invulnerable / 5) % 2 === 0) {
      return;
    }

    // Ship body
    ctx.fillStyle = '#00aaff';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - p.height / 2);
    ctx.lineTo(p.x - p.width / 2, p.y + p.height / 2);
    ctx.lineTo(p.x, p.y + p.height / 3);
    ctx.lineTo(p.x + p.width / 2, p.y + p.height / 2);
    ctx.closePath();
    ctx.fill();

    // Wings
    ctx.fillStyle = '#0088cc';
    ctx.beginPath();
    ctx.moveTo(p.x - p.width / 2, p.y);
    ctx.lineTo(p.x - p.width, p.y + 15);
    ctx.lineTo(p.x - p.width / 2, p.y + 10);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(p.x + p.width / 2, p.y);
    ctx.lineTo(p.x + p.width, p.y + 15);
    ctx.lineTo(p.x + p.width / 2, p.y + 10);
    ctx.closePath();
    ctx.fill();

    // Engine glow
    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.arc(p.x, p.y + p.height / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Throttle tracker for super-skill cooldown UI (last displayed ceiling-seconds per key)
  var _superUILastSecs = {};

  // Update UI
  function updateUI() {
    document.getElementById('nm1945-score').textContent = gameState.score;
    document.getElementById('nm1945-wave').textContent = gameState.wave;
    document.getElementById('nm1945-credits').textContent = gameState.credits;
    // Meta UI is updated explicitly in grantMetaPoint / spendMetaPoint – skip here.
    // Super-skill cooldown text only needs updating when the displayed second changes.
    _updateSuperUIThrottled();
  }

  function _updateSuperUIThrottled() {
    var changed = false;
    for (const key of Object.keys(SUPER_SKILLS)) {
      const secs = Math.ceil(getSuperCooldownRemaining(key) / 1000);
      if (_superUILastSecs[key] !== secs) {
        _superUILastSecs[key] = secs;
        changed = true;
      }
    }
    if (changed) updateSuperUI();
  }

  // Game over
  function gameOver() {
    gameState.mode = 'gameover';

    if (gameState.score > gameState.highScore) {
      gameState.highScore = gameState.score;
    }

    saveProgress();
  }

  // Restart game
  function restart() {
    gameState.score = 0;
    gameState.wave = 1;
    gameState.bullets = [];
    gameState.missiles = [];
    gameState.enemies = [];
    gameState.enemyBullets = [];
    gameState.particles = [];
    gameState.bossActive = false;
    gameState.boss = null;
    gameState.mode = 'playing';
    gameState.superState.nova.lastUsed = -Infinity;
    gameState.superState.overdrive.lastUsed = -Infinity;
    gameState.superState.overdrive.activeUntil = 0;

    gameState.player.x = CANVAS_WIDTH / 2;
    gameState.player.y = CANVAS_HEIGHT - 80;
    const shieldLevel = SHIP_UPGRADES.shield.levels[gameState.upgrades.shield];
    gameState.player.hp = shieldLevel.maxHp;
    gameState.player.maxHp = shieldLevel.maxHp;
    gameState.player.invulnerable = 0;

    // Reset wave tracking state
    gameState._waveSpawned = 0;
    gameState._waveEnemyCount = 3 + Math.floor(gameState.wave * 1.5);
    gameState._bossTriggeredThisWave = false;

    updateHPBar();
    updateUI();
  }

  // Save progress
  function saveProgress() {
    if (!window.saveData) window.saveData = {};
    if (!window.saveData.neural1945) window.saveData.neural1945 = {};
    window.saveData.neural1945.highScore = gameState.highScore;
    window.saveData.neural1945.credits   = gameState.credits;
    window.saveData.neural1945.upgrades  = gameState.upgrades;
    window.saveData.neural1945.mapLevel  = gameState.mapLevel;
    window.saveData.neural1945.meta      = getMetaState();
    // Use saveSaveData (main game save function) or saveGame fallback
    if (typeof saveSaveData === 'function') {
      try { saveSaveData(); } catch (e) {}
    } else if (typeof window.saveGame === 'function') {
      try { window.saveGame(); } catch (e) {}
    }
  }

  // Open game
  function open() {
    if (gameState.active) return;

    init();
    createUI();
    gameState.active = true;
    gameState.paused = false;  // Explicitly ensure game is not paused on start
    restart();
    gameLoop();
  }

  // Close game
  function close() {
    gameState.active = false;
    gameState.paused = true;

    if (gameState.canvas) {
      gameState.canvas = null;
      gameState.ctx = null;
    }

    const overlay = document.getElementById('neural-1945-overlay');
    if (overlay) {
      overlay.remove();
    }

    const upgradesMenu = document.getElementById('nm1945-upgrades-menu');
    if (upgradesMenu) {
      upgradesMenu.remove();
    }

    saveProgress();
  }

  // Export public API
  window.Neural1945 = {
    open,
    close
  };

})();
