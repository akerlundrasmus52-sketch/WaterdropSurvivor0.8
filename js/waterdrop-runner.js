// js/waterdrop-runner.js — Advanced 2D Idle Clicker: WaterDrop Runner
// A deep 2D side-scrolling idle clicker set in the game world's landmarks.
// The WaterDrop character auto-runs through levels while the player clicks to fight.
// Integrated with the Idle Progression House and the main 3D game economy.
// Exposes window.WaterDropRunner

window.WaterDropRunner = (function () {
  'use strict';

  // ─── LEVEL DEFINITIONS ────────────────────────────────────────────────────
  const LEVELS = [
    { id: 'stonehenge',   name: 'Stonehenge',       skyColor: '#3a5f3a', groundColor: '#2d4a1a',  accentColor: '#ccaa88', enemyColor: '#8B8B00', bossColor: '#ffcc00' },
    { id: 'pyramid',      name: 'Pyramid',           skyColor: '#c2882a', groundColor: '#b87333',  accentColor: '#f5deb3', enemyColor: '#cc7722', bossColor: '#ff8800' },
    { id: 'ufo_crash',    name: 'UFO Crash Site',    skyColor: '#1a1a40', groundColor: '#2a2a3a',  accentColor: '#00ff88', enemyColor: '#44ff44', bossColor: '#00ffff' },
    { id: 'neural_matrix',name: 'Neural Matrix',     skyColor: '#0a0a1a', groundColor: '#111130',  accentColor: '#00ccff', enemyColor: '#4488ff', bossColor: '#ff00ff' },
    { id: 'annunaki',     name: 'Annunaki Temple',   skyColor: '#2a1a00', groundColor: '#3a2000',  accentColor: '#ffd700', enemyColor: '#daa520', bossColor: '#ff6600' },
    { id: 'void_rift',    name: 'Void Rift',         skyColor: '#0a000f', groundColor: '#150010',  accentColor: '#ff00ff', enemyColor: '#cc00cc', bossColor: '#ffffff' }
  ];

  // ─── UPGRADES ──────────────────────────────────────────────────────────────
  const WEAPON_UPGRADES = [
    { level: 1,  name: 'Stone Shard',   damage: 5,   cost: 0 },
    { level: 2,  name: 'Iron Blade',    damage: 12,  cost: 50 },
    { level: 3,  name: 'Water Spear',   damage: 25,  cost: 200 },
    { level: 4,  name: 'Storm Edge',    damage: 55,  cost: 600 },
    { level: 5,  name: 'Void Saber',    damage: 110, cost: 1500 },
    { level: 6,  name: 'DNA Blade',     damage: 230, cost: 4000 },
    { level: 7,  name: 'Annunaki Arm',  damage: 500, cost: 10000 },
    { level: 8,  name: 'Cosmic Wave',   damage: 1100,cost: 30000 },
  ];

  const ARMOR_UPGRADES = [
    { level: 1,  name: 'Bare Skin',    hp: 50,   cost: 0 },
    { level: 2,  name: 'Leaf Armor',   hp: 100,  cost: 40 },
    { level: 3,  name: 'Stone Shell',  hp: 200,  cost: 180 },
    { level: 4,  name: 'Iron Clad',    hp: 400,  cost: 550 },
    { level: 5,  name: 'Storm Plate',  hp: 800,  cost: 1400 },
    { level: 6,  name: 'Void Weave',   hp: 1600, cost: 3800 },
    { level: 7,  name: 'DNA Skin',     hp: 3500, cost: 9500 },
    { level: 8,  name: 'Cosmic Form',  hp: 8000, cost: 28000 },
  ];

  const SPEED_UPGRADES = [
    { level: 1, name: 'Crawl',      speed: 1.0, cost: 0 },
    { level: 2, name: 'Walk',       speed: 1.3, cost: 30 },
    { level: 3, name: 'Jog',        speed: 1.6, cost: 120 },
    { level: 4, name: 'Run',        speed: 2.0, cost: 400 },
    { level: 5, name: 'Sprint',     speed: 2.5, cost: 1000 },
    { level: 6, name: 'Surge',      speed: 3.2, cost: 2800 },
    { level: 7, name: 'Hydro Dash', speed: 4.0, cost: 7000 },
    { level: 8, name: 'Light Speed',speed: 5.5, cost: 20000 },
  ];

  // ─── ANNUNAKI DNA PERMANENT UPGRADES ──────────────────────────────────────
  const DNA_UPGRADES = [
    { id: 'dna_damage',  name: '🧬 Ancient Power',    desc: '+20% base damage per level', maxLevel: 10, baseCost: 1,  costScale: 1.5 },
    { id: 'dna_gold',    name: '🧬 Gold Touch',        desc: '+15% gold per level',        maxLevel: 10, baseCost: 1,  costScale: 1.5 },
    { id: 'dna_hp',      name: '🧬 Immortal Essence',  desc: '+25% max HP per level',      maxLevel: 10, baseCost: 2,  costScale: 1.6 },
    { id: 'dna_speed',   name: '🧬 Eternal Sprint',    desc: '+10% run speed per level',   maxLevel: 8,  baseCost: 2,  costScale: 1.7 },
    { id: 'dna_click',   name: '🧬 Mind Strike',       desc: '+30% click damage per level',maxLevel: 10, baseCost: 1,  costScale: 1.4 },
    { id: 'dna_revive',  name: '🧬 DNA Revival',       desc: 'Auto-revive once per run',   maxLevel: 1,  baseCost: 5,  costScale: 2.0 },
  ];

  // ─── DEFAULTS ──────────────────────────────────────────────────────────────
  function getDefaults() {
    return {
      totalGold: 0,
      annunakiDna: 0,        // prestige currency (🧬)
      lifetimeGold: 0,
      weaponLevel: 1,
      armorLevel: 1,
      speedLevel: 1,
      dnaUpgrades: {},       // { upgradeId: level }
      ascensions: 0,
      totalRuns: 0,
      bestDistance: 0,       // highest level index reached
      lifetimeKills: 0,
      mainGameGoldEarned: 0, // total gold rewarded to main game
      spinsEarned: 0,
    };
  }

  function _getData(saveData) {
    if (!saveData.waterRunner) saveData.waterRunner = getDefaults();
    // Migrate old saves
    const d = saveData.waterRunner;
    if (!d.dnaUpgrades) d.dnaUpgrades = {};
    if (!d.lifetimeKills) d.lifetimeKills = 0;
    return d;
  }

  // ─── DNA UPGRADE HELPERS ──────────────────────────────────────────────────
  function getDnaUpgradeCost(def, currentLevel) {
    return Math.ceil(def.baseCost * Math.pow(def.costScale, currentLevel));
  }

  function getDnaBonus(data, id) {
    return data.dnaUpgrades[id] || 0;
  }

  // ─── MAIN GAME INTEGRATION ────────────────────────────────────────────────
  // Called periodically: rewards main game based on runner progress
  function _rewardMainGame(saveData, gold, isLevelClear, isBossKill) {
    const d = _getData(saveData);
    if (!saveData) return;
    // Gold reward: 1 main-game gold per 80 runner gold
    const mgGold = Math.floor(gold / 80);
    if (mgGold > 0) {
      saveData.gold = (saveData.gold || 0) + mgGold;
      d.mainGameGoldEarned = (d.mainGameGoldEarned || 0) + mgGold;
    }
    // Level clear: +1 spin ticket
    if (isLevelClear) {
      saveData.spinTickets = (saveData.spinTickets || 0) + 1;
      d.spinsEarned = (d.spinsEarned || 0) + 1;
      if (typeof window.showNarratorLine === 'function') {
        window.showNarratorLine('🎡 Level cleared! +1 Spin Ticket earned!', 3000);
      }
    }
    // Boss kill: +15 rank EXP
    if (isBossKill) {
      if (window.GameState && window.GameState.saveData) {
        const sd = window.GameState.saveData;
        if (sd.rankExp !== undefined) {
          sd.rankExp = (sd.rankExp || 0) + 15;
        }
      }
      if (typeof window.showNarratorLine === 'function') {
        window.showNarratorLine('⚡ Boss slain! +15 Rank EXP rewarded to main game!', 3000);
      }
    }
    if (typeof window.saveSaveData === 'function') window.saveSaveData();
  }

  // ─── OPEN FULL-SCREEN GAME UI ─────────────────────────────────────────────
  function openGameUI(saveData) {
    // Remove any existing overlay
    const ex = document.getElementById('wdr-overlay');
    if (ex) { ex.remove(); return; }

    const data = _getData(saveData);

    const overlay = document.createElement('div');
    overlay.id = 'wdr-overlay';
    overlay.style.cssText = [
      'position:fixed','inset:0','z-index:9500',
      'background:#0a0a1a',
      'display:flex','flex-direction:column',
      'font-family:"Courier New",monospace',
      'color:#e0e0f0','overflow:hidden'
    ].join(';');

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'padding:8px 14px;background:rgba(0,0,0,0.6);border-bottom:2px solid #00ccff;display:flex;align-items:center;gap:12px;flex-shrink:0;';
    header.innerHTML = `
      <span style="font-size:18px;font-weight:bold;color:#00ccff;">💧 WATERDROP RUNNER</span>
      <span id="wdr-gold-display" style="color:#ffd700;font-size:14px;">🪙 ${_fmt(data.totalGold)}</span>
      <span id="wdr-dna-display" style="color:#ff88ff;font-size:14px;">🧬 ${_fmt(data.annunakiDna)} DNA</span>
      <span style="margin-left:auto;font-size:12px;color:#888;">Runs: ${data.totalRuns || 0} | Best: ${LEVELS[Math.min(data.bestDistance||0,LEVELS.length-1)].name}</span>
      <button id="wdr-close" style="background:#ff4444;color:#fff;border:none;padding:5px 12px;border-radius:5px;cursor:pointer;font-weight:bold;">✕ CLOSE</button>
    `;
    overlay.appendChild(header);

    // Main content area
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex:1;overflow:hidden;';

    // Left: game canvas
    const gameArea = document.createElement('div');
    gameArea.style.cssText = 'flex:1;display:flex;flex-direction:column;padding:8px;gap:8px;overflow:hidden;';

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'wdr-canvas';
    canvas.style.cssText = 'border:2px solid #00ccff33;border-radius:8px;display:block;flex:1;background:#111;max-height:320px;';
    gameArea.appendChild(canvas);

    // Game controls bar
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:8px;align-items:center;flex-shrink:0;flex-wrap:wrap;';
    controls.innerHTML = `
      <button id="wdr-play-btn" style="background:linear-gradient(135deg,#003366,#001133);color:#00ccff;border:2px solid #00ccff;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:bold;">▶ START RUN</button>
      <div style="display:flex;gap:6px;">
        <button id="wdr-boost-speed" style="background:#1a3a00;color:#88ff44;border:1px solid #44aa00;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;" title="Speed Boost (50 gold)">⚡ SPEED (50🪙)</button>
        <button id="wdr-boost-atk"   style="background:#3a0000;color:#ff8844;border:1px solid #aa4400;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;" title="Attack Boost (80 gold)">🔥 ATK (80🪙)</button>
      </div>
      <span id="wdr-boost-status" style="font-size:12px;color:#aaa;"></span>
    `;
    gameArea.appendChild(controls);

    // HP / progress bar
    const statusBar = document.createElement('div');
    statusBar.style.cssText = 'display:flex;gap:8px;align-items:center;flex-shrink:0;flex-wrap:wrap;';
    statusBar.innerHTML = `
      <span style="font-size:12px;color:#888;">HP:</span>
      <div style="flex:1;background:#222;border-radius:4px;height:12px;min-width:80px;">
        <div id="wdr-hp-bar" style="height:100%;background:linear-gradient(90deg,#ff4444,#ff8888);border-radius:4px;width:100%;transition:width 0.1s;"></div>
      </div>
      <span id="wdr-hp-text" style="font-size:12px;color:#ff8888;min-width:60px;"></span>
      <span style="font-size:12px;color:#888;">Stage:</span>
      <span id="wdr-stage-text" style="font-size:12px;color:#ffd700;">-</span>
      <span style="font-size:12px;color:#888;">Distance:</span>
      <span id="wdr-dist-text" style="font-size:12px;color:#aaffaa;">0m</span>
    `;
    gameArea.appendChild(statusBar);
    body.appendChild(gameArea);

    // Right: upgrades panel
    const rightPanel = document.createElement('div');
    rightPanel.className = 'wdr-upgrades-panel';
    rightPanel.style.cssText = 'width:260px;overflow-y:auto;background:rgba(0,0,0,0.4);border-left:2px solid #00ccff22;padding:10px;flex-shrink:0;';
    rightPanel.innerHTML = _buildUpgradesHTML(data);
    body.appendChild(rightPanel);

    overlay.appendChild(body);

    // DNA panel (bottom)
    const dnaPanel = document.createElement('div');
    dnaPanel.id = 'wdr-dna-panel';
    dnaPanel.style.cssText = 'padding:8px 14px;background:rgba(40,0,60,0.5);border-top:1px solid #ff88ff44;flex-shrink:0;';
    dnaPanel.innerHTML = _buildDnaHTML(data);
    overlay.appendChild(dnaPanel);

    document.body.appendChild(overlay);

    // Inject CSS
    _injectCSS();

    document.getElementById('wdr-close').addEventListener('click', () => {
      _stopRun();
      overlay.remove();
    });

    // Wire upgrade buttons
    _wireUpgradeButtons(saveData, data, rightPanel, overlay, header);
    _wireDnaButtons(saveData, data, dnaPanel, overlay, header);

    // Wire boost buttons
    document.getElementById('wdr-boost-speed').addEventListener('click', () => _activateBoost(saveData, data, 'speed'));
    document.getElementById('wdr-boost-atk').addEventListener('click', () => _activateBoost(saveData, data, 'atk'));

    // Start button
    document.getElementById('wdr-play-btn').addEventListener('click', () => {
      const btn = document.getElementById('wdr-play-btn');
      if (_runState && _runState.running) {
        _stopRun();
        btn.textContent = '▶ START RUN';
      } else {
        _startRun(saveData, data, canvas);
        btn.textContent = '⏹ STOP RUN';
      }
    });

    // Click canvas = attack
    canvas.addEventListener('click', () => {
      if (_runState && _runState.running) {
        _handleClickAttack();
      }
    });
  }

  // ─── BUILD HTML HELPERS ────────────────────────────────────────────────────
  function _fmt(n) {
    if (n >= 1e9)  return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6)  return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3)  return (n / 1e3).toFixed(1) + 'K';
    return Math.floor(n).toString();
  }

  function _buildUpgradesHTML(data) {
    const wLv = data.weaponLevel || 1;
    const aLv = data.armorLevel  || 1;
    const sLv = data.speedLevel  || 1;
    const wNext = WEAPON_UPGRADES[wLv] || null;
    const aNext = ARMOR_UPGRADES[aLv]  || null;
    const sNext = SPEED_UPGRADES[sLv]  || null;
    const gold  = data.totalGold || 0;

    const wCan = wNext && gold >= wNext.cost;
    const aCan = aNext && gold >= aNext.cost;
    const sCan = sNext && gold >= sNext.cost;

    return `
      <h4 style="color:#ffd700;margin:0 0 8px;border-bottom:1px solid #333;padding-bottom:4px;">⚔️ UPGRADES</h4>
      <div class="wdr-upg-card">
        <div style="font-size:12px;color:#aaa;">🗡️ Weapon: <b style="color:#fff">${WEAPON_UPGRADES[wLv-1].name}</b> (Lv${wLv})</div>
        <div style="font-size:11px;color:#888;">+${WEAPON_UPGRADES[wLv-1].damage} dmg</div>
        ${wNext ? `<button class="wdr-upg-btn wdr-btn-weapon" data-cost="${wNext.cost}" style="background:${wCan?'#003366':'#1a1a2a'};color:${wCan?'#00ccff':'#555'};border:1px solid ${wCan?'#00ccff':'#333'};">→ ${wNext.name} | ${_fmt(wNext.cost)}🪙</button>` : '<div style="color:#ffd700;font-size:11px;padding:4px;">✓ MAX LEVEL</div>'}
      </div>
      <div class="wdr-upg-card">
        <div style="font-size:12px;color:#aaa;">🛡️ Armor: <b style="color:#fff">${ARMOR_UPGRADES[aLv-1].name}</b> (Lv${aLv})</div>
        <div style="font-size:11px;color:#888;">+${ARMOR_UPGRADES[aLv-1].hp} HP</div>
        ${aNext ? `<button class="wdr-upg-btn wdr-btn-armor" data-cost="${aNext.cost}" style="background:${aCan?'#003366':'#1a1a2a'};color:${aCan?'#00ccff':'#555'};border:1px solid ${aCan?'#00ccff':'#333'};">→ ${aNext.name} | ${_fmt(aNext.cost)}🪙</button>` : '<div style="color:#ffd700;font-size:11px;padding:4px;">✓ MAX LEVEL</div>'}
      </div>
      <div class="wdr-upg-card">
        <div style="font-size:12px;color:#aaa;">👟 Speed: <b style="color:#fff">${SPEED_UPGRADES[sLv-1].name}</b> (Lv${sLv})</div>
        <div style="font-size:11px;color:#888;">${SPEED_UPGRADES[sLv-1].speed}× run speed</div>
        ${sNext ? `<button class="wdr-upg-btn wdr-btn-speed" data-cost="${sNext.cost}" style="background:${sCan?'#003366':'#1a1a2a'};color:${sCan?'#00ccff':'#555'};border:1px solid ${sCan?'#00ccff':'#333'};">→ ${sNext.name} | ${_fmt(sNext.cost)}🪙</button>` : '<div style="color:#ffd700;font-size:11px;padding:4px;">✓ MAX LEVEL</div>'}
      </div>
      <h4 style="color:#aaffaa;margin:10px 0 6px;border-bottom:1px solid #333;padding-bottom:4px;">📊 MAIN GAME REWARDS</h4>
      <div style="font-size:11px;color:#888;background:rgba(0,40,0,0.3);border-radius:6px;padding:8px;">
        <div>80 runner gold → 1 main gold</div>
        <div>Level clear → +1 Spin Ticket</div>
        <div>Boss kill → +15 Rank EXP</div>
        <div style="color:#aaffaa;margin-top:4px;">Total rewarded: ${_fmt(data.mainGameGoldEarned||0)} gold · ${data.spinsEarned||0} spins</div>
      </div>
    `;
  }

  function _buildDnaHTML(data) {
    const dna = data.annunakiDna || 0;
    let html = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <span style="font-size:14px;font-weight:bold;color:#ff88ff;">🧬 ANNUNAKI DNA: ${_fmt(dna)}</span>
      <span style="font-size:11px;color:#888;">Earned from Annunaki bosses & Ascension resets</span>
      <button id="wdr-ascend-btn" style="background:#3a0040;color:#ff88ff;border:1px solid #ff88ff44;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;" title="Ascend: reset run progress, gain 3 DNA">⭐ ASCEND (gain 3🧬)</button>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">`;
    DNA_UPGRADES.forEach(def => {
      const current = (data.dnaUpgrades && data.dnaUpgrades[def.id]) || 0;
      const maxed = current >= def.maxLevel;
      const cost = getDnaUpgradeCost(def, current);
      const canBuy = !maxed && dna >= cost;
      html += `
        <div style="background:rgba(60,0,80,0.5);border:1px solid ${canBuy?'#ff88ff':'#333'};border-radius:6px;padding:6px 8px;min-width:110px;">
          <div style="font-size:11px;color:#ff88ff;font-weight:bold;">${def.name}</div>
          <div style="font-size:10px;color:#888;">${def.desc}</div>
          <div style="font-size:10px;color:#aaa;">Lv ${current}/${def.maxLevel}</div>
          ${maxed ? '<div style="font-size:10px;color:#ffd700;">✓ MAX</div>' :
            `<button class="wdr-dna-btn" data-id="${def.id}" data-cost="${cost}" style="margin-top:3px;background:${canBuy?'#3a0040':'#1a1a2a'};color:${canBuy?'#ff88ff':'#555'};border:1px solid ${canBuy?'#ff88ff44':'#333'};padding:2px 8px;border-radius:4px;cursor:${canBuy?'pointer':'not-allowed'};font-size:10px;">🧬${_fmt(cost)}</button>`}
        </div>`;
    });
    html += '</div>';
    return html;
  }

  function _wireUpgradeButtons(saveData, data, panel, overlay, header) {
    function rebind() {
      panel.querySelectorAll('.wdr-btn-weapon').forEach(btn => {
        btn.addEventListener('click', () => {
          const lv = data.weaponLevel || 1;
          const next = WEAPON_UPGRADES[lv];
          if (!next) return;
          if ((data.totalGold || 0) < next.cost) { _flash(btn, '#ff0000'); return; }
          data.totalGold -= next.cost;
          data.weaponLevel = lv + 1;
          if (typeof window.saveSaveData === 'function') window.saveSaveData();
          panel.innerHTML = _buildUpgradesHTML(data);
          rebind();
          _updateHeader(header, data);
        });
      });
      panel.querySelectorAll('.wdr-btn-armor').forEach(btn => {
        btn.addEventListener('click', () => {
          const lv = data.armorLevel || 1;
          const next = ARMOR_UPGRADES[lv];
          if (!next) return;
          if ((data.totalGold || 0) < next.cost) { _flash(btn, '#ff0000'); return; }
          data.totalGold -= next.cost;
          data.armorLevel = lv + 1;
          if (typeof window.saveSaveData === 'function') window.saveSaveData();
          panel.innerHTML = _buildUpgradesHTML(data);
          rebind();
          _updateHeader(header, data);
        });
      });
      panel.querySelectorAll('.wdr-btn-speed').forEach(btn => {
        btn.addEventListener('click', () => {
          const lv = data.speedLevel || 1;
          const next = SPEED_UPGRADES[lv];
          if (!next) return;
          if ((data.totalGold || 0) < next.cost) { _flash(btn, '#ff0000'); return; }
          data.totalGold -= next.cost;
          data.speedLevel = lv + 1;
          if (typeof window.saveSaveData === 'function') window.saveSaveData();
          panel.innerHTML = _buildUpgradesHTML(data);
          rebind();
          _updateHeader(header, data);
        });
      });
    }
    rebind();
  }

  function _wireDnaButtons(saveData, data, panel, overlay, header) {
    function rebind() {
      const ascBtn = document.getElementById('wdr-ascend-btn');
      if (ascBtn) {
        ascBtn.addEventListener('click', () => {
          // Ascend: reset equipment upgrades, gain 3 Annunaki DNA
          if (!confirm('Ascend? Reset weapon/armor/speed upgrades to level 1, but gain 3 🧬 Annunaki DNA for permanent power.')) return;
          data.weaponLevel = 1;
          data.armorLevel  = 1;
          data.speedLevel  = 1;
          data.annunakiDna = (data.annunakiDna || 0) + 3;
          data.ascensions  = (data.ascensions || 0) + 1;
          if (typeof window.saveSaveData === 'function') window.saveSaveData();
          panel.innerHTML = _buildDnaHTML(data);
          _updateHeader(header, data);
          rebind();
          if (typeof window.showNarratorLine === 'function') {
            window.showNarratorLine('🧬 AIDA: "Annunaki Ascension complete. Ancient DNA absorbed. You are stronger."', 4000);
          }
        });
      }
      panel.querySelectorAll('.wdr-dna-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id   = btn.dataset.id;
          const cost = parseInt(btn.dataset.cost, 10);
          const def  = DNA_UPGRADES.find(d => d.id === id);
          if (!def) return;
          const current = (data.dnaUpgrades[id] || 0);
          if (current >= def.maxLevel) return;
          if ((data.annunakiDna || 0) < cost) { _flash(btn, '#ff0000'); return; }
          data.annunakiDna -= cost;
          data.dnaUpgrades[id] = current + 1;
          if (typeof window.saveSaveData === 'function') window.saveSaveData();
          panel.innerHTML = _buildDnaHTML(data);
          _updateHeader(header, data);
          rebind();
        });
      });
    }
    rebind();
  }

  function _updateHeader(header, data) {
    const gEl = document.getElementById('wdr-gold-display');
    const dEl = document.getElementById('wdr-dna-display');
    if (gEl) gEl.textContent = '🪙 ' + _fmt(data.totalGold);
    if (dEl) dEl.textContent = '🧬 ' + _fmt(data.annunakiDna) + ' DNA';
  }

  function _flash(el, color) {
    const old = el.style.background;
    el.style.background = color;
    setTimeout(() => el.style.background = old, 200);
  }

  // ─── BOOST SYSTEM ─────────────────────────────────────────────────────────
  let _boostSpeed  = 0;  // remaining ms
  let _boostAtk    = 0;

  function _activateBoost(saveData, data, type) {
    if (type === 'speed') {
      const cost = 50;
      if ((data.totalGold || 0) < cost) {
        if (typeof window.showNarratorLine === 'function') window.showNarratorLine('❌ Need 50🪙 for Speed Boost', 1500);
        return;
      }
      data.totalGold -= cost;
      _boostSpeed = 12000; // 12 seconds
      _updateHeader(document.querySelector('#wdr-overlay div'), data);
      if (typeof window.saveSaveData === 'function') window.saveSaveData();
    } else if (type === 'atk') {
      const cost = 80;
      if ((data.totalGold || 0) < cost) {
        if (typeof window.showNarratorLine === 'function') window.showNarratorLine('❌ Need 80🪙 for Attack Boost', 1500);
        return;
      }
      data.totalGold -= cost;
      _boostAtk = 8000; // 8 seconds
      _updateHeader(document.querySelector('#wdr-overlay div'), data);
      if (typeof window.saveSaveData === 'function') window.saveSaveData();
    }
  }

  // ─── RUN STATE & CANVAS GAME ──────────────────────────────────────────────
  let _runState = null;
  let _rafId = null;
  let _lastTime = 0;

  function _startRun(saveData, data, canvas) {
    _stopRun();

    const wLv = data.weaponLevel || 1;
    const aLv = data.armorLevel  || 1;
    const sLv = data.speedLevel  || 1;
    const dnaBonus = getDnaBonus.bind(null, data);

    const baseDmg  = WEAPON_UPGRADES[wLv-1].damage  * (1 + dnaBonus('dna_damage') * 0.20);
    const baseHp   = ARMOR_UPGRADES[aLv-1].hp       * (1 + dnaBonus('dna_hp')     * 0.25);
    const baseSpd  = SPEED_UPGRADES[sLv-1].speed    * (1 + dnaBonus('dna_speed')  * 0.10);
    const clickDmg = baseDmg * 0.8                  * (1 + dnaBonus('dna_click')  * 0.30);

    _runState = {
      running:      true,
      hp:           baseHp,
      maxHp:        baseHp,
      baseDmg:      baseDmg,
      clickDmg:     clickDmg,
      baseSpeed:    baseSpd,
      distance:     0,        // metres run
      gold:         0,        // gold earned this run
      kills:        0,
      levelIndex:   0,        // current LEVELS index
      levelProgress: 0,       // 0..1 within current level section
      levelDist:    200,      // metres per level section
      enemies:      [],
      particles:    [],
      coins:        [],
      floatTexts:   [],
      bgOffset:     0,
      playerX:      80,
      playerY:      0,        // relative to ground
      jumpV:        0,
      grounded:     true,
      animFrame:    0,
      animTimer:    0,
      clickFlash:   0,
      spawnTimer:   0,
      bossSpawned:  false,
      bossKilled:   false,
      hasRevive:    dnaBonus('dna_revive') >= 1,
      usedRevive:   false,
      goldMult:     1 + dnaBonus('dna_gold') * 0.15,
    };

    data.totalRuns = (data.totalRuns || 0) + 1;

    // Use offsetWidth/Height with reliable fallbacks; getBoundingClientRect() returns
    // fractional values even before layout paints, so use it as a secondary check.
    const rect = canvas.getBoundingClientRect();
    canvas.width  = Math.max(canvas.offsetWidth  || 0, Math.floor(rect.width)  || 0) || 600;
    canvas.height = Math.max(canvas.offsetHeight || 0, Math.floor(rect.height) || 0) || 300;

    _lastTime = performance.now();

    function loop(now) {
      if (!_runState || !_runState.running) return;
      const dt = Math.min((now - _lastTime) / 1000, 0.05);
      _lastTime = now;
      _boostSpeed = Math.max(0, _boostSpeed - dt * 1000);
      _boostAtk   = Math.max(0, _boostAtk   - dt * 1000);
      _updateRun(saveData, data, dt, canvas);
      _drawRun(canvas, data);
      _rafId = requestAnimationFrame(loop);
    }
    _rafId = requestAnimationFrame(loop);
  }

  function _stopRun() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    _runState = null;
  }

  function _handleClickAttack() {
    if (!_runState || !_runState.running) return;
    const rs = _runState;
    rs.clickFlash = 8;
    const dmg = rs.clickDmg * (_boostAtk > 0 ? 3.0 : 1.0);
    // Hit all enemies in melee range
    let hit = false;
    for (const e of rs.enemies) {
      if (!e.dead && Math.abs(e.x - rs.playerX) < 60) {
        e.hp -= dmg;
        _addFloat(rs, '+' + _fmtInt(dmg), e.x, e.y - 20, '#ff8844');
        hit = true;
        if (e.hp <= 0) _killEnemy(rs, e);
      }
    }
    if (!hit) {
      _addFloat(rs, 'MISS!', rs.playerX + 30, rs.playerY - 30, '#888');
    }
  }

  function _fmtInt(n) {
    if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
    if (n >= 1e3) return (n/1e3).toFixed(1)+'K';
    return Math.floor(n).toString();
  }

  function _addFloat(rs, text, x, y, color) {
    rs.floatTexts.push({ text, x, y, vy: -1.2, life: 50, color });
  }

  function _killEnemy(rs, e) {
    e.dead = true;
    rs.kills++;
    const goldGain = Math.floor((e.gold || 1) * rs.goldMult);
    rs.gold += goldGain;
    // Spawn a coin visual
    rs.coins.push({ x: e.x, y: e.y, vy: -2, life: 40, value: goldGain });
    _addFloat(rs, '+' + _fmtInt(goldGain) + '🪙', e.x, e.y - 30, '#ffd700');
    if (e.isBoss) {
      rs.bossKilled = true;
      const dnaGain = 1;
      rs.gold += e.gold * 3;
      _addFloat(rs, '+' + dnaGain + '🧬 DNA!', e.x, e.y - 50, '#ff88ff');
      // DNA is awarded at run end
    }
  }

  function _spawnEnemy(rs) {
    const level = LEVELS[rs.levelIndex];
    const isNearBoss = rs.levelProgress > 0.85 && !rs.bossSpawned;
    const isBoss     = rs.levelProgress >= 0.95 && !rs.bossSpawned;
    const canvas     = document.getElementById('wdr-canvas');
    const h = canvas ? canvas.height : 300;
    const groundY = h * 0.72;

    if (isBoss) {
      rs.bossSpawned = true;
      rs.enemies.push({
        x: (canvas ? canvas.width : 600) + 30,
        y: groundY - 40,
        hp: rs.baseDmg * 80,
        maxHp: rs.baseDmg * 80,
        speed: 40,
        gold: 25 + rs.levelIndex * 15,
        color: level.bossColor,
        size: 38,
        isBoss: true,
        dead: false,
        attackCd: 0,
        attackRate: 1.8,
        damage: rs.maxHp * 0.12,
      });
    } else if (!isBoss) {
      const cnt = 1 + Math.floor(rs.levelIndex / 2);
      for (let i = 0; i < cnt; i++) {
        rs.enemies.push({
          x: (canvas ? canvas.width : 600) + 30 + i * 30,
          y: groundY - 20,
          hp: rs.baseDmg * (4 + rs.levelIndex * 2),
          maxHp: rs.baseDmg * (4 + rs.levelIndex * 2),
          speed: 55 + rs.levelIndex * 12,
          gold: 2 + rs.levelIndex * 2,
          color: level.enemyColor,
          size: 18,
          isBoss: false,
          dead: false,
          attackCd: 0,
          attackRate: 1.2,
          damage: rs.maxHp * 0.06,
        });
      }
    }
  }

  function _updateRun(saveData, data, dt, canvas) {
    const rs = _runState;
    if (!rs || !rs.running) return;

    const h = canvas.height;
    const groundY = h * 0.72;
    const speedMult = _boostSpeed > 0 ? 2.0 : 1.0;
    const atkMult   = _boostAtk   > 0 ? 2.5 : 1.0;

    // Player runs forward (background scrolls left)
    const runSpd = rs.baseSpeed * speedMult * 60;
    rs.bgOffset    += runSpd * dt;
    rs.distance    += runSpd * dt * 0.1; // 1 metre = 10 canvas units
    rs.levelProgress = (rs.distance % rs.levelDist) / rs.levelDist;

    // Level transition
    const newLevelIdx = Math.floor(rs.distance / rs.levelDist);
    if (newLevelIdx !== rs.levelIndex && newLevelIdx < LEVELS.length) {
      rs.levelIndex   = newLevelIdx;
      rs.bossSpawned  = false;
      rs.bossKilled   = false;
      rs.levelProgress = 0;
      // Level clear reward
      const prevLevelIdx = rs.levelIndex - 1;
      if (prevLevelIdx >= 0) {
        _rewardMainGame(saveData, rs.gold, true, false);
        _addFloat(rs, 'LEVEL CLEAR!', canvas.width / 2, 40, '#00ffcc');
      }
    }
    if (newLevelIdx >= LEVELS.length && !rs._finishReported) {
      rs._finishReported = true;
      _addFloat(rs, '🏆 ALL STAGES CLEARED!', canvas.width / 2, 30, '#ffd700');
    }

    // Player jump
    if (rs.jumpV !== 0) {
      rs.playerY += rs.jumpV * dt * 200;
      rs.jumpV -= 20 * dt;
      if (rs.playerY >= 0) {
        rs.playerY = 0;
        rs.jumpV = 0;
        rs.grounded = true;
      }
    }

    // Spawn enemies
    rs.spawnTimer -= dt;
    if (rs.spawnTimer <= 0) {
      rs.spawnTimer = 1.2 + Math.random() * 1.0 - rs.levelIndex * 0.08;
      rs.spawnTimer = Math.max(0.5, rs.spawnTimer);
      _spawnEnemy(rs);
    }

    // Update enemies
    for (let i = rs.enemies.length - 1; i >= 0; i--) {
      const e = rs.enemies[i];
      if (e.dead) { rs.enemies.splice(i, 1); continue; }
      e.x -= e.speed * dt;

      // Auto-attack enemy when close
      e.attackCd = Math.max(0, e.attackCd - dt);
      const playerDrawX = rs.playerX;
      if (Math.abs(e.x - playerDrawX) < 45) {
        // Player auto-attacks
        const autoDmg = rs.baseDmg * atkMult * dt * 2.5;
        e.hp -= autoDmg;
        if (e.hp <= 0) { _killEnemy(rs, e); continue; }
        // Enemy attacks player
        if (e.attackCd <= 0) {
          e.attackCd = e.attackRate;
          rs.hp -= e.damage;
          _addFloat(rs, '-' + _fmtInt(e.damage), playerDrawX, groundY - 60 + rs.playerY, '#ff4444');
          if (rs.hp <= 0) {
            if (rs.hasRevive && !rs.usedRevive) {
              rs.usedRevive = true;
              rs.hp = rs.maxHp * 0.3;
              _addFloat(rs, '💜 DNA REVIVAL!', playerDrawX, groundY - 100, '#ff88ff');
            } else {
              _endRun(saveData, data, 'died');
              return;
            }
          }
        }
      }
      // Enemy gone off screen left
      if (e.x < -60) rs.enemies.splice(i, 1);
    }

    // Update coins
    for (let i = rs.coins.length - 1; i >= 0; i--) {
      const c = rs.coins[i];
      c.y += c.vy;
      c.vy += 0.15;
      c.life--;
      if (c.life <= 0) rs.coins.splice(i, 1);
    }

    // Update float texts
    for (let i = rs.floatTexts.length - 1; i >= 0; i--) {
      const f = rs.floatTexts[i];
      f.y += f.vy;
      f.life--;
      if (f.life <= 0) rs.floatTexts.splice(i, 1);
    }

    // Update player Y animation
    rs.playerY = Math.max(rs.playerY, 0);

    // Update HUD
    const hpBar  = document.getElementById('wdr-hp-bar');
    const hpText = document.getElementById('wdr-hp-text');
    const stageText = document.getElementById('wdr-stage-text');
    const distText  = document.getElementById('wdr-dist-text');
    const boostSt   = document.getElementById('wdr-boost-status');
    if (hpBar)  hpBar.style.width  = Math.max(0, (rs.hp / rs.maxHp) * 100) + '%';
    if (hpText) hpText.textContent = _fmtInt(Math.max(0, rs.hp)) + '/' + _fmtInt(rs.maxHp);
    const lIdx = Math.min(rs.levelIndex, LEVELS.length - 1);
    if (stageText) stageText.textContent = LEVELS[lIdx].name + ' (' + Math.floor(rs.levelProgress * 100) + '%)';
    if (distText)  distText.textContent  = Math.floor(rs.distance) + 'm';
    if (boostSt) {
      const parts = [];
      if (_boostSpeed > 0) parts.push('⚡ SPD ' + Math.ceil(_boostSpeed/1000) + 's');
      if (_boostAtk   > 0) parts.push('🔥 ATK ' + Math.ceil(_boostAtk/1000)   + 's');
      boostSt.textContent = parts.join('  ');
    }

    // Accumulate main game gold in background
    if (Math.floor(rs.gold / 80) > Math.floor((rs.gold - runSpd * dt * 0.01) / 80)) {
      saveData.gold = (saveData.gold || 0) + 1;
      data.mainGameGoldEarned = (data.mainGameGoldEarned || 0) + 1;
    }

    rs.animTimer += dt;
  }

  function _endRun(saveData, data, reason) {
    if (!_runState) return;
    const rs = _runState;
    _stopRun();

    // Award gold to persistent wallet
    const goldEarned = rs.gold || 0;
    data.totalGold = (data.totalGold || 0) + goldEarned;
    data.lifetimeGold = (data.lifetimeGold || 0) + goldEarned;

    // Award DNA for boss kills
    if (rs.bossKilled) {
      data.annunakiDna = (data.annunakiDna || 0) + 1;
    }

    // Update best distance
    const levelReached = Math.min(rs.levelIndex, LEVELS.length - 1);
    if (levelReached > (data.bestDistance || 0)) {
      data.bestDistance = levelReached;
    }
    data.lifetimeKills = (data.lifetimeKills || 0) + rs.kills;

    // Main game integration
    _rewardMainGame(saveData, goldEarned, false, rs.bossKilled);

    if (typeof window.saveSaveData === 'function') window.saveSaveData();

    // Refresh UI
    const gold = document.getElementById('wdr-gold-display');
    const dna  = document.getElementById('wdr-dna-display');
    if (gold) gold.textContent = '🪙 ' + _fmt(data.totalGold);
    if (dna)  dna.textContent  = '🧬 ' + _fmt(data.annunakiDna) + ' DNA';

    const btn = document.getElementById('wdr-play-btn');
    if (btn) btn.textContent = '▶ START RUN';

    // Show run summary
    const canvas = document.getElementById('wdr-canvas');
    if (canvas) _drawRunSummary(canvas, rs, goldEarned, reason);

    // Re-render upgrade panel
    const rightPanel = document.querySelector('#wdr-overlay .wdr-upgrades-panel');
    if (rightPanel) rightPanel.innerHTML = _buildUpgradesHTML(data);
  }

  function _drawRunSummary(canvas, rs, goldEarned, reason) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = reason === 'died' ? '#ff4444' : '#00ffcc';
    ctx.font = 'bold 28px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(reason === 'died' ? '💀 RUN OVER' : '✓ RUN COMPLETE', w/2, h/2 - 40);
    ctx.fillStyle = '#ffd700';
    ctx.font = '16px Courier New';
    ctx.fillText('Gold earned: ' + _fmtInt(goldEarned) + '🪙', w/2, h/2);
    ctx.fillStyle = '#aaffaa';
    ctx.fillText('Kills: ' + rs.kills + '  |  Distance: ' + Math.floor(rs.distance) + 'm', w/2, h/2 + 24);
    ctx.fillStyle = '#888';
    ctx.font = '13px Courier New';
    ctx.fillText('Click START RUN to play again!', w/2, h/2 + 52);
    ctx.textAlign = 'left';
  }

  // ─── DRAW ROUTINE ──────────────────────────────────────────────────────────
  function _drawRun(canvas, data) {
    if (!_runState) return;
    const ctx = canvas.getContext('2d');
    const rs  = _runState;
    const w   = canvas.width;
    const h   = canvas.height;
    const groundY = h * 0.72;
    const level   = LEVELS[Math.min(rs.levelIndex, LEVELS.length - 1)];

    // Background sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    skyGrad.addColorStop(0, level.skyColor);
    skyGrad.addColorStop(1, _lighten(level.skyColor, 20));
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, groundY);

    // Background landmarks (scrolling)
    _drawBackground(ctx, rs, w, h, groundY, level);

    // Ground
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, h);
    groundGrad.addColorStop(0, level.groundColor);
    groundGrad.addColorStop(1, _darken(level.groundColor, 30));
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, groundY, w, h - groundY);

    // Coins
    for (const c of rs.coins) {
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(c.x % w, groundY + c.y - 30, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Enemies
    for (const e of rs.enemies) {
      if (e.dead) continue;
      _drawEnemy(ctx, e, groundY, level);
    }

    // Player (waterdrop shape)
    _drawPlayer(ctx, rs, groundY);

    // Float texts
    for (const f of rs.floatTexts) {
      const alpha = Math.max(0, f.life / 50);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.color;
      ctx.font = 'bold 13px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x % w, groundY + f.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    // HUD distance
    ctx.fillStyle = level.accentColor;
    ctx.font = '12px Courier New';
    ctx.fillText(Math.floor(rs.distance) + 'm', 8, 18);

    // Boss health bar removed

    // Click flash effect
    if (rs.clickFlash > 0) {
      ctx.fillStyle = 'rgba(255,200,0,0.12)';
      ctx.fillRect(0, 0, w, h);
      rs.clickFlash--;
    }

    // Boost indicators
    if (_boostSpeed > 0) {
      ctx.fillStyle = 'rgba(100,255,50,0.12)';
      ctx.fillRect(0, 0, w, h);
    }
    if (_boostAtk > 0) {
      ctx.fillStyle = 'rgba(255,100,50,0.10)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  function _drawPlayer(ctx, rs, groundY) {
    const px = rs.playerX;
    const py = groundY + rs.playerY - 28;
    // Animated run cycle
    const bounce = Math.sin(rs.animTimer * 10) * 3;
    const lean   = Math.cos(rs.animTimer * 10) * 0.08;

    ctx.save();
    ctx.translate(px, py + bounce);
    ctx.rotate(lean);

    // Waterdrop body
    ctx.fillStyle = '#4FC3F7';
    ctx.strokeStyle = '#00ccff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(-3, -5, 5, 7, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(-4, -4, 2.5, 0, Math.PI * 2);
    ctx.arc( 4, -4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-3, -5, 1, 0, Math.PI * 2);
    ctx.arc( 5, -5, 1, 0, Math.PI * 2);
    ctx.fill();

    // Legs (running)
    const legSwing = Math.sin(rs.animTimer * 10) * 0.5;
    ctx.strokeStyle = '#2a9fd8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-4, 12);
    ctx.lineTo(-7 + legSwing * 8, 22);
    ctx.moveTo( 4, 12);
    ctx.lineTo( 7 - legSwing * 8, 22);
    ctx.stroke();

    // Weapon indicator (glow around fist)
    if (rs.clickFlash > 0) {
      ctx.fillStyle = 'rgba(255,180,0,0.6)';
      ctx.beginPath();
      ctx.arc(14, 0, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function _drawEnemy(ctx, e, groundY, level) {
    const ex = e.x;
    const ey = groundY + e.y;
    ctx.fillStyle = e.color;
    ctx.strokeStyle = e.isBoss ? '#ffff00' : '#666';
    ctx.lineWidth = e.isBoss ? 2 : 1;

    // Body shape
    if (e.isBoss) {
      // Boss: skull/diamond shape
      ctx.beginPath();
      ctx.moveTo(ex, ey - e.size);
      ctx.lineTo(ex + e.size * 0.7, ey);
      ctx.lineTo(ex, ey + e.size * 0.5);
      ctx.lineTo(ex - e.size * 0.7, ey);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Crown
      ctx.fillStyle = '#ffd700';
      ctx.font = '18px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('👑', ex, ey - e.size - 4);
      ctx.textAlign = 'left';
    } else {
      // Regular enemy: angry circle
      ctx.beginPath();
      ctx.arc(ex, ey - e.size * 0.5, e.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Angry eyes
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(ex - e.size * 0.35, ey - e.size * 0.7, e.size * 0.18, 0, Math.PI * 2);
      ctx.arc(ex + e.size * 0.35, ey - e.size * 0.7, e.size * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }

    // HP bars removed
  }

  function _drawBackground(ctx, rs, w, h, groundY, level) {
    const off = rs.bgOffset % w;
    // Draw level-specific landmark silhouettes
    _drawLandmarkBg(ctx, rs.levelIndex, off, w, groundY, level);
  }

  function _drawLandmarkBg(ctx, levelIdx, off, w, groundY, level) {
    const lv = Math.min(levelIdx, LEVELS.length - 1);
    ctx.fillStyle = _darken(level.skyColor, 10) + 'aa';

    if (lv === 0) {
      // Stonehenge: stone arches
      for (let i = 0; i < 3; i++) {
        const bx = ((off * 0.3 + i * 180) % (w + 100)) - 50;
        _drawStoneArch(ctx, bx, groundY - 40, 50, level.accentColor);
      }
    } else if (lv === 1) {
      // Pyramid
      const px = ((off * 0.2) % (w + 200)) - 100;
      _drawPyramid(ctx, px, groundY, 180, level.accentColor);
    } else if (lv === 2) {
      // UFO Crash Site
      const ux = ((off * 0.15) % (w + 150)) - 75;
      _drawUFO(ctx, ux, groundY - 60, level.accentColor);
      _drawCrashSmoke(ctx, ux + 30, groundY - 20, level.accentColor);
    } else if (lv === 3) {
      // Neural Matrix: floating cubes + grid
      _drawNeuralGrid(ctx, off, w, groundY, level.accentColor);
    } else if (lv === 4) {
      // Annunaki Temple: golden columns
      for (let i = 0; i < 4; i++) {
        const cx = ((off * 0.25 + i * 160) % (w + 80)) - 40;
        _drawColumn(ctx, cx, groundY, 90, level.accentColor);
      }
    } else {
      // Void Rift: dark tendrils
      _drawVoidTendrils(ctx, off, w, groundY, level.accentColor);
    }
  }

  function _drawStoneArch(ctx, x, y, size, color) {
    ctx.fillStyle = color + '99';
    ctx.fillRect(x - size*0.5, y - size, size*0.18, size);
    ctx.fillRect(x + size*0.32, y - size, size*0.18, size);
    ctx.fillRect(x - size*0.5, y - size - size*0.25, size, size*0.22);
  }
  function _drawPyramid(ctx, x, y, size, color) {
    ctx.fillStyle = color + '88';
    ctx.beginPath();
    ctx.moveTo(x + size/2, y);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x + size * 0.75, y - size * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x + size * 0.5, y - size * 0.9);
    ctx.closePath();
    ctx.fill();
  }
  function _drawUFO(ctx, x, y, color) {
    ctx.fillStyle = color + 'aa';
    ctx.beginPath();
    ctx.ellipse(x, y, 60, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y - 10, 30, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function _drawCrashSmoke(ctx, x, y, color) {
    ctx.fillStyle = '#555566aa';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(x + i * 8, y - i * 12, 10 + i * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function _drawNeuralGrid(ctx, off, w, groundY, color) {
    ctx.strokeStyle = color + '33';
    ctx.lineWidth = 1;
    const step = 40;
    const offX = off % step;
    for (let gx = -offX; gx < w; gx += step) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, groundY); ctx.stroke();
    }
    for (let gy = 0; gy < groundY; gy += step) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }
  }
  function _drawColumn(ctx, x, y, h, color) {
    ctx.fillStyle = color + '99';
    ctx.fillRect(x - 8, y - h, 16, h);
    ctx.fillRect(x - 12, y - h - 10, 24, 10);
    ctx.fillRect(x - 12, y - 8, 24, 8);
  }
  function _drawVoidTendrils(ctx, off, w, groundY, color) {
    ctx.strokeStyle = color + '55';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const tx = ((off * 0.2 + i * 120) % (w + 60)) - 30;
      ctx.beginPath();
      ctx.moveTo(tx, groundY);
      for (let seg = 0; seg < 8; seg++) {
        ctx.lineTo(tx + Math.sin(seg + off * 0.01) * 20, groundY - seg * 15);
      }
      ctx.stroke();
    }
  }

  function _lighten(hex, amt) {
    // Simple CSS color lighten (rgb approximate)
    return hex; // fallback: return as-is (canvas handles the colors directly)
  }
  function _darken(hex, amt) { return hex; }

  // ─── CSS INJECTION ────────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('wdr-style')) return;
    const s = document.createElement('style');
    s.id = 'wdr-style';
    s.textContent = `
      .wdr-upg-card { background:rgba(0,20,40,0.6); border:1px solid #00ccff22; border-radius:6px; padding:8px; margin-bottom:6px; }
      .wdr-upg-btn { width:100%; padding:4px 6px; border-radius:4px; cursor:pointer; font-size:11px; margin-top:4px; font-family:'Courier New',monospace; }
      .wdr-upg-btn:hover { filter:brightness(1.2); }
      .wdr-dna-btn { font-family:'Courier New',monospace; }
    `;
    document.head.appendChild(s);
  }

  // ─── PANEL RENDERER (for idle-bootstrap 'clicker' tab) ───────────────────
  function renderPanel(saveData, container) {
    container.innerHTML = '';
    const data = _getData(saveData);

    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;padding:10px;';
    const lIdx = Math.min(data.bestDistance || 0, LEVELS.length - 1);
    header.innerHTML = `
      <h3 style="color:#00ccff;margin:0 0 6px;">💧 WaterDrop Runner</h3>
      <p style="color:#888;font-size:13px;margin:0;">Best Stage: <b style="color:#ffd700">${LEVELS[lIdx].name}</b> · Total Runs: ${data.totalRuns || 0}</p>
      <p style="color:#aaa;font-size:12px;margin:4px 0;">🪙 ${_fmt(data.totalGold)} gold · 🧬 ${_fmt(data.annunakiDna)} DNA · ${_fmt(data.lifetimeKills||0)} total kills</p>
      <p style="color:#aaffaa;font-size:12px;margin:2px 0;">Main game: ${_fmt(data.mainGameGoldEarned||0)} gold rewarded · ${data.spinsEarned||0} spins</p>
    `;
    container.appendChild(header);

    const openBtn = document.createElement('button');
    openBtn.style.cssText = 'width:100%;padding:14px;background:linear-gradient(135deg,#001133,#00264d);color:#00ccff;border:2px solid #00ccff;border-radius:10px;cursor:pointer;font-size:16px;font-weight:bold;font-family:"Courier New",monospace;margin-bottom:10px;';
    openBtn.textContent = '💧 PLAY WATERDROP RUNNER';
    openBtn.addEventListener('click', () => openGameUI(saveData));
    container.appendChild(openBtn);

    // Mini stats
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;';
    [
      ['🗡️ Weapon', 'Lv' + (data.weaponLevel||1) + ' — ' + (WEAPON_UPGRADES[(data.weaponLevel||1)-1]?.name||'?')],
      ['🛡️ Armor',  'Lv' + (data.armorLevel||1)  + ' — ' + (ARMOR_UPGRADES[(data.armorLevel||1)-1]?.name||'?')],
      ['👟 Speed',  'Lv' + (data.speedLevel||1)   + ' — ' + (SPEED_UPGRADES[(data.speedLevel||1)-1]?.name||'?')],
      ['🧬 DNA',    _fmt(data.annunakiDna||0) + ' Annunaki DNA']
    ].forEach(([lbl, val]) => {
      const c = document.createElement('div');
      c.style.cssText = 'background:rgba(0,20,40,0.6);border:1px solid #00ccff22;border-radius:6px;padding:6px 10px;';
      c.innerHTML = `<div style="font-size:10px;color:#888;">${lbl}</div><div style="font-size:12px;color:#00ccff;">${val}</div>`;
      grid.appendChild(c);
    });
    container.appendChild(grid);
  }

  // ─── PUBLIC API ───────────────────────────────────────────────────────────
  return {
    openGameUI,
    renderPanel,
    getDefaults,
    LEVELS,
    WEAPON_UPGRADES,
    ARMOR_UPGRADES,
    SPEED_UPGRADES,
    DNA_UPGRADES
  };
})();
