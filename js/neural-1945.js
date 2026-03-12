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

    mode: 'playing' // 'playing', 'upgrades', 'gameover'
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
    }

    // Apply shield upgrade
    const shieldLevel = SHIP_UPGRADES.shield.levels[gameState.upgrades.shield];
    gameState.player.maxHp = shieldLevel.maxHp;
    gameState.player.hp = shieldLevel.maxHp;
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
      z-index: 1000;
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

    overlay.appendChild(header);
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
    });

    window.addEventListener('keyup', (e) => {
      gameState.keys[e.key] = false;
    });

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
      z-index: 1001;
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

    // Keyboard movement
    if (gameState.keys['ArrowLeft'] || gameState.keys['a']) {
      player.x = Math.max(player.width / 2, player.x - PLAYER_SPEED);
    }
    if (gameState.keys['ArrowRight'] || gameState.keys['d']) {
      player.x = Math.min(CANVAS_WIDTH - player.width / 2, player.x + PLAYER_SPEED);
    }
    if (gameState.keys['ArrowUp'] || gameState.keys['w']) {
      player.y = Math.max(player.height / 2, player.y - PLAYER_SPEED);
    }
    if (gameState.keys['ArrowDown'] || gameState.keys['s']) {
      player.y = Math.min(CANVAS_HEIGHT - player.height / 2, player.y + PLAYER_SPEED);
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
    if (now - gameState.lastShot > fireRateLevel.value) {
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

    // Spawn enemies
    if (gameState.enemies.length < 5 && Math.random() < 0.02) {
      spawnEnemy();
    }

    // Spawn boss every 5 waves
    if (!gameState.bossActive && gameState.enemies.length === 0 && gameState.wave % 5 === 0) {
      spawnBoss();
    }

    // Next wave
    if (!gameState.bossActive && gameState.enemies.length === 0) {
      gameState.wave++;
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

    gameState.enemies.push({
      x: Math.random() * (CANVAS_WIDTH - 40) + 20,
      y: -type.size,
      hp: type.hp * (1 + gameState.wave * 0.1),
      maxHp: type.hp * (1 + gameState.wave * 0.1),
      type: type,
      time: 0
    });
  }

  // Spawn boss
  function spawnBoss() {
    const bossIndex = Math.min(Math.floor(gameState.wave / 5) - 1, BOSSES.length - 1);
    const bossDef = BOSSES[bossIndex];

    gameState.bossActive = true;
    gameState.boss = {
      x: CANVAS_WIDTH / 2,
      y: -100,
      hp: bossDef.hp * (1 + gameState.wave * 0.05),
      maxHp: bossDef.hp * (1 + gameState.wave * 0.05),
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
    const damageLevel = SHIP_UPGRADES.damage.levels[gameState.upgrades.damage];

    // Player bullets vs enemies
    for (let i = gameState.bullets.length - 1; i >= 0; i--) {
      const bullet = gameState.bullets[i];

      for (let j = gameState.enemies.length - 1; j >= 0; j--) {
        const enemy = gameState.enemies[j];
        if (checkRectCollision(bullet, { x: enemy.x - enemy.type.size / 2, y: enemy.y - enemy.type.size / 2, width: enemy.type.size, height: enemy.type.size })) {
          enemy.hp -= damageLevel.value;
          gameState.bullets.splice(i, 1);
          createParticles(enemy.x, enemy.y, enemy.type.color);

          if (enemy.hp <= 0) {
            gameState.score += enemy.type.score;
            gameState.credits += Math.floor(enemy.type.score / 5);
            createExplosion(enemy.x, enemy.y, enemy.type.color);
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

  // Render game
  function render() {
    const ctx = gameState.ctx;
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#001a33';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw scrolling background stars
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 50; i++) {
      const x = (i * 37) % CANVAS_WIDTH;
      const y = ((i * 53 + gameState.scrollOffset) % CANVAS_HEIGHT);
      ctx.fillRect(x, y, 2, 2);
    }

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

        // HP bar
        if (enemy.hp < enemy.maxHp) {
          const hpWidth = enemy.type.size;
          const hpPercent = enemy.hp / enemy.maxHp;
          ctx.fillStyle = '#333';
          ctx.fillRect(enemy.x - hpWidth / 2, enemy.y - enemy.type.size / 2 - 8, hpWidth, 4);
          ctx.fillStyle = '#00ff00';
          ctx.fillRect(enemy.x - hpWidth / 2, enemy.y - enemy.type.size / 2 - 8, hpWidth * hpPercent, 4);
        }
      }

      // Draw boss
      if (gameState.bossActive && gameState.boss) {
        const boss = gameState.boss;
        ctx.fillStyle = boss.color;
        ctx.beginPath();
        ctx.arc(boss.x, boss.y, boss.size / 2, 0, Math.PI * 2);
        ctx.fill();

        // Boss HP bar
        const hpWidth = CANVAS_WIDTH - 40;
        const hpPercent = boss.hp / boss.maxHp;
        ctx.fillStyle = '#333';
        ctx.fillRect(20, 20, hpWidth, 10);
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(20, 20, hpWidth * hpPercent, 10);

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

  // Update UI
  function updateUI() {
    document.getElementById('nm1945-score').textContent = gameState.score;
    document.getElementById('nm1945-wave').textContent = gameState.wave;
    document.getElementById('nm1945-credits').textContent = gameState.credits;
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

    gameState.player.x = CANVAS_WIDTH / 2;
    gameState.player.y = CANVAS_HEIGHT - 80;
    const shieldLevel = SHIP_UPGRADES.shield.levels[gameState.upgrades.shield];
    gameState.player.hp = shieldLevel.maxHp;
    gameState.player.maxHp = shieldLevel.maxHp;
    gameState.player.invulnerable = 0;

    updateHPBar();
    updateUI();
  }

  // Save progress
  function saveProgress() {
    if (!window.saveData) window.saveData = {};
    window.saveData.neural1945 = {
      highScore: gameState.highScore,
      credits: gameState.credits,
      upgrades: gameState.upgrades
    };
    if (typeof window.saveGame === 'function') {
      window.saveGame();
    }
  }

  // Open game
  function open() {
    if (gameState.active) return;

    init();
    createUI();
    gameState.active = true;
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
