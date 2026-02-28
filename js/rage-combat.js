// ============================================================
// RAGE MODE & SPECIAL ATTACKS
// Exposes window.GameRageCombat for use by main.js
// ============================================================
(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────
  const RAGE_MAX = 100;
  const RAGE_PER_KILL = 8;        // rage gained per enemy kill
  const RAGE_DRAIN_PER_SEC = 12;  // rage drains when inactive
  const RAGE_ACTIVE_DRAIN = 20;   // faster drain while rage is active
  const RAGE_MIN_TO_ACTIVATE = 80;

  const RAGE_DURATION_MS = 6000;
  const RAGE_DAMAGE_MULT  = 2.5;
  const RAGE_SPEED_MULT   = 1.4;

  const MAX_EQUIPPED_SPECIALS = 3; // Maximum special attacks player can equip at once

  // ── All available special attacks (unlocked via skill tree) ──
  const ALL_SPECIAL_ATTACKS = [
    {
      id: 'shockwave',
      name: 'Shockwave',
      icon: '💥',
      description: 'Massive explosion around player',
      cooldownMs: 8000,
      damageRadius: 12,
      damage: 80,
      color: 0xFF6600,
      keybind: '1',
      skillTreeId: 'specialShockwave'
    },
    {
      id: 'frozenStorm',
      name: 'Frozen Storm',
      icon: '❄️',
      description: 'Freeze all nearby enemies',
      cooldownMs: 12000,
      damageRadius: 18,
      damage: 30,
      color: 0x44AAFF,
      keybind: '2',
      skillTreeId: 'specialFrozenStorm'
    },
    {
      id: 'deathBlossom',
      name: 'Death Blossom',
      icon: '🌸',
      description: '360° deadly projectile burst',
      cooldownMs: 15000,
      damageRadius: 20,
      damage: 60,
      color: 0xFF44AA,
      keybind: '3',
      skillTreeId: 'specialDeathBlossom'
    },
    {
      id: 'thunderStrike',
      name: 'Thunder Strike',
      icon: '⚡',
      description: 'Lightning bolt hits all enemies in a line',
      cooldownMs: 10000,
      damageRadius: 8,
      damage: 100,
      color: 0xFFFF00,
      keybind: '4',
      skillTreeId: 'specialThunderStrike'
    },
    {
      id: 'voidPulse',
      name: 'Void Pulse',
      icon: '🌀',
      description: 'Dark energy pulls enemies inward then detonates',
      cooldownMs: 18000,
      damageRadius: 22,
      damage: 75,
      color: 0x8800FF,
      keybind: '5',
      skillTreeId: 'specialVoidPulse'
    },
    {
      id: 'infernoRing',
      name: 'Inferno Ring',
      icon: '🔥',
      description: 'Ring of fire burns all surrounding enemies',
      cooldownMs: 14000,
      damageRadius: 16,
      damage: 55,
      color: 0xFF2200,
      keybind: '6',
      skillTreeId: 'specialInfernoRing'
    }
  ];

  // ── State ─────────────────────────────────────────────────────
  let _rageMeter = 0;
  let _rageActive = false;
  let _rageEndTime = 0;
  let _saveData = null;
  let _spawnParticlesFn = null;
  let _scene = null;

  const _specialCooldowns = {}; // { id: lastUsedMs }
  ALL_SPECIAL_ATTACKS.forEach(s => { _specialCooldowns[s.id] = 0; });

  // Callbacks assigned by main.js
  let _onRageActivated = null;
  let _onRageDeactivated = null;
  let _onSpecialAttack = null; // fn(attack) → called to actually deal damage

  // ── Loadout helpers ───────────────────────────────────────────
  function _getEquippedAttacks() {
    if (!_saveData) return [];
    const equipped = (_saveData.equippedSpecials || []).slice(0, MAX_EQUIPPED_SPECIALS);
    return equipped.map(id => ALL_SPECIAL_ATTACKS.find(s => s.id === id)).filter(Boolean);
  }

  function _isUnlocked(sa) {
    if (!_saveData || !_saveData.skillTree) return false;
    const node = _saveData.skillTree[sa.skillTreeId];
    return node && node.level > 0;
  }

  // ── HUD helpers ───────────────────────────────────────────────
  function _buildHUD() {
    if (document.getElementById('rage-hud')) {
      _rebuildSpecialButtons();
      return;
    }

    // Rage bar container
    const container = document.createElement('div');
    container.id = 'rage-hud';
    container.className = 'rage-hud';
    container.innerHTML = `
      <div class="rage-label">⚡ RAGE</div>
      <div class="rage-bar-bg">
        <div class="rage-bar-fill" id="rage-bar-fill"></div>
      </div>
      <button id="rage-activate-btn" class="rage-activate-btn" title="Activate Rage Mode">RAGE!</button>
    `;
    document.body.appendChild(container);

    const rageBtn = document.getElementById('rage-activate-btn');
    rageBtn.addEventListener('click', activateRage);
    rageBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); activateRage(); }, { passive: false });
    _updateRageHUD();

    // Special attack buttons container
    const saContainer = document.createElement('div');
    saContainer.id = 'special-attacks-hud';
    saContainer.className = 'special-attacks-hud';
    document.body.appendChild(saContainer);
    _rebuildSpecialButtons();

    // Loadout button (small edit icon on the rage HUD)
    const loadoutBtn = document.createElement('button');
    loadoutBtn.id = 'sa-loadout-btn';
    loadoutBtn.title = 'Edit Special Attack Loadout';
    loadoutBtn.style.cssText = 'background:none;border:none;color:#FFD700;font-size:14px;cursor:pointer;padding:2px 4px;';
    loadoutBtn.textContent = '⚙️';
    container.appendChild(loadoutBtn);
    loadoutBtn.addEventListener('click', _toggleLoadoutPanel);
    loadoutBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); _toggleLoadoutPanel(); }, { passive: false });

    // Loadout panel
    _buildLoadoutPanel();
  }

  function _rebuildSpecialButtons() {
    const saContainer = document.getElementById('special-attacks-hud');
    if (!saContainer) return;
    saContainer.innerHTML = '';

    const equipped = _getEquippedAttacks();
    if (equipped.length === 0) {
      const hint = document.createElement('div');
      hint.style.cssText = 'color:#888;font-size:10px;padding:4px 8px;';
      hint.textContent = '🔒 Unlock specials';
      saContainer.appendChild(hint);
      return;
    }

    equipped.forEach(sa => {
      const btn = document.createElement('button');
      btn.id = `sa-btn-${sa.id}`;
      btn.className = 'special-attack-btn';
      btn.innerHTML = `<span class="sa-icon">${sa.icon}</span><span class="sa-name">${sa.name}</span><div class="sa-cooldown-overlay" id="sa-cd-${sa.id}"></div>`;
      btn.title = sa.description;
      // Use both click and touchstart to fix control conflict with joystick zone
      btn.addEventListener('click', () => triggerSpecialAttack(sa.id));
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerSpecialAttack(sa.id);
      }, { passive: false });
      saContainer.appendChild(btn);
    });
  }

  function _buildLoadoutPanel() {
    if (document.getElementById('sa-loadout-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'sa-loadout-panel';
    document.body.appendChild(panel);
  }

  function _toggleLoadoutPanel() {
    const panel = document.getElementById('sa-loadout-panel');
    if (!panel) return;
    const isVisible = panel.classList.contains('visible');
    if (isVisible) {
      panel.classList.remove('visible');
      return;
    }
    _renderLoadoutPanel();
    panel.classList.add('visible');
  }

  function _renderLoadoutPanel() {
    const panel = document.getElementById('sa-loadout-panel');
    if (!panel) return;
    const equipped = (_saveData && _saveData.equippedSpecials) ? _saveData.equippedSpecials.slice() : [];

    panel.innerHTML = `<h3>⚔️ SPECIAL ATTACKS (max ${MAX_EQUIPPED_SPECIALS})</h3>`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'sa-loadout-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => panel.classList.remove('visible'));
    panel.appendChild(closeBtn);

    ALL_SPECIAL_ATTACKS.forEach(sa => {
      const unlocked = _isUnlocked(sa);
      const isEquipped = equipped.includes(sa.id);
      const item = document.createElement('div');
      item.className = 'sa-loadout-item' + (isEquipped ? ' equipped' : '') + (!unlocked ? ' locked' : '');
      item.innerHTML = `<span style="font-size:20px">${sa.icon}</span><div><div style="font-weight:bold;color:#DDD">${sa.name}</div><div style="font-size:10px;color:#888">${sa.description}</div></div>${isEquipped ? '<span style="color:#FFD700;font-size:11px;margin-left:auto">EQUIPPED</span>' : (unlocked ? '<span style="color:#88FF88;font-size:11px;margin-left:auto">TAP TO EQUIP</span>' : '<span style="color:#888;font-size:11px;margin-left:auto">🔒 LOCKED</span>')}`;
      if (unlocked) {
        item.addEventListener('click', () => _toggleEquip(sa.id));
      }
      panel.appendChild(item);
    });
  }

  function _toggleEquip(attackId) {
    if (!_saveData) return;
    if (!_saveData.equippedSpecials) _saveData.equippedSpecials = [];
    const idx = _saveData.equippedSpecials.indexOf(attackId);
    if (idx >= 0) {
      _saveData.equippedSpecials.splice(idx, 1);
    } else {
      if (_saveData.equippedSpecials.length >= MAX_EQUIPPED_SPECIALS) {
        _saveData.equippedSpecials.shift(); // remove oldest
      }
      _saveData.equippedSpecials.push(attackId);
    }
    if (window.saveSaveData) window.saveSaveData();
    _renderLoadoutPanel();
    _rebuildSpecialButtons();
  }

  function _updateRageHUD() {
    const fill = document.getElementById('rage-bar-fill');
    if (fill) {
      fill.style.width = (_rageMeter / RAGE_MAX * 100) + '%';
      fill.style.background = _rageActive
        ? 'linear-gradient(90deg,#FF4400,#FF8800)'
        : (_rageMeter >= RAGE_MIN_TO_ACTIVATE ? 'linear-gradient(90deg,#FF6600,#FFD700)' : 'linear-gradient(90deg,#884400,#CC6600)');
    }
    const btn = document.getElementById('rage-activate-btn');
    if (btn) {
      btn.disabled = _rageActive || _rageMeter < RAGE_MIN_TO_ACTIVATE;
      btn.className = 'rage-activate-btn' + (_rageActive ? ' rage-active' : '') + (_rageMeter >= RAGE_MIN_TO_ACTIVATE && !_rageActive ? ' rage-ready' : '');
      btn.textContent = _rageActive ? '🔥 RAGING!' : 'RAGE!';
    }

    // Update special attack cooldowns (only equipped)
    const now = Date.now();
    const equipped = _getEquippedAttacks();
    equipped.forEach(sa => {
      const cdEl = document.getElementById(`sa-cd-${sa.id}`);
      const saBtn = document.getElementById(`sa-btn-${sa.id}`);
      if (!cdEl || !saBtn) return;
      const elapsed = now - (_specialCooldowns[sa.id] || 0);
      const remaining = Math.max(0, sa.cooldownMs - elapsed);
      const frac = remaining / sa.cooldownMs;
      cdEl.style.height = (frac * 100) + '%';
      saBtn.disabled = remaining > 0;
      saBtn.classList.toggle('sa-ready', remaining <= 0);
    });
  }

  // ── Rage Mode ─────────────────────────────────────────────────
  function addRage(amount) {
    if (_rageActive) return; // don't add while active
    _rageMeter = Math.min(RAGE_MAX, _rageMeter + amount);
    _updateRageHUD();
  }

  function activateRage() {
    if (_rageActive || _rageMeter < RAGE_MIN_TO_ACTIVATE) return;
    _rageActive = true;
    _rageEndTime = Date.now() + RAGE_DURATION_MS;
    _rageMeter = RAGE_MAX; // start at full

    // Visual feedback
    _flashScreen('#FF4400', 0.4, 400);
    _showBigText('⚡ RAGE MODE! ⚡', '#FF6600');

    if (typeof _onRageActivated === 'function') _onRageActivated(RAGE_DAMAGE_MULT, RAGE_SPEED_MULT);
    _updateRageHUD();
  }

  function deactivateRage() {
    if (!_rageActive) return;
    _rageActive = false;
    _rageMeter = 0;

    _flashScreen('#4400FF', 0.3, 300);
    if (typeof _onRageDeactivated === 'function') _onRageDeactivated();
    _updateRageHUD();
  }

  // ── Special Attacks ───────────────────────────────────────────
  function triggerSpecialAttack(attackId) {
    const sa = ALL_SPECIAL_ATTACKS.find(s => s.id === attackId);
    if (!sa) return;
    // Check it's unlocked
    if (!_isUnlocked(sa)) {
      if (window.showStatChange) window.showStatChange('🔒 Unlock in Skill Tree!');
      return;
    }
    const now = Date.now();
    if (now - (_specialCooldowns[attackId] || 0) < sa.cooldownMs) return;

    _specialCooldowns[attackId] = now;
    _showBigText(`${sa.icon} ${sa.name.toUpperCase()}!`, '#FFFFFF');
    _flashScreen(sa.color, 0.5, 300);

    // Spawn 3D ring burst in scene
    _spawnAttackRing(sa);
    // Spawn 2D CSS ring effect for extra visual impact
    _spawnCssRing(sa);

    // Delegate actual damage to main.js callback
    if (typeof _onSpecialAttack === 'function') _onSpecialAttack(sa);

    _updateRageHUD();
  }

  // ── Visual helpers ─────────────────────────────────────────────
  function _flashScreen(hexColor, alpha, durationMs) {
    let el = document.getElementById('rage-flash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rage-flash';
      el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:199;';
      document.body.appendChild(el);
    }
    // Accept both numeric (0xFF4400) and string ('#FF4400') hex colours
    let num = (typeof hexColor === 'string')
      ? parseInt(hexColor.replace('#', ''), 16)
      : hexColor;
    const r = (num >> 16) & 0xFF;
    const g = (num >> 8) & 0xFF;
    const b = num & 0xFF;
    el.style.background = `rgba(${r},${g},${b},${alpha})`;
    el.style.transition = 'none';
    setTimeout(() => {
      el.style.transition = `background ${durationMs}ms ease-out`;
      el.style.background = `rgba(${r},${g},${b},0)`;
    }, 50);
  }

  function _showBigText(text, color) {
    const el = document.createElement('div');
    el.className = 'rage-big-text';
    el.textContent = text;
    el.style.color = color || '#FF6600';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  // 2D CSS ring burst centered on screen
  function _spawnCssRing(sa) {
    let num = (typeof sa.color === 'string')
      ? parseInt(sa.color.replace('#', ''), 16)
      : sa.color;
    const r = (num >> 16) & 0xFF;
    const g = (num >> 8) & 0xFF;
    const b = num & 0xFF;
    const size = sa.damageRadius * 14; // scale to pixels
    const el = document.createElement('div');
    el.className = 'sa-ring-outer';
    el.style.cssText = `
      left:50%; top:50%;
      width:${size}px; height:${size}px;
      border: 4px solid rgba(${r},${g},${b},0.9);
      box-shadow: 0 0 20px rgba(${r},${g},${b},0.7), inset 0 0 10px rgba(${r},${g},${b},0.3);
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  function _spawnAttackRing(sa) {
    if (!_scene || !window.THREE) return;
    const THREE = window.THREE;
    const geo = new THREE.RingGeometry(0.5, sa.damageRadius, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: sa.color, side: THREE.DoubleSide,
      transparent: true, opacity: 0.75
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    const playerMesh = window._gamePlayerMesh;
    if (playerMesh) ring.position.copy(playerMesh.position);
    ring.position.y = 0.05;
    _scene.add(ring);

    // Secondary inner ring for extra effect
    const geo2 = new THREE.RingGeometry(0.2, sa.damageRadius * 0.5, 48);
    const mat2 = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF, side: THREE.DoubleSide,
      transparent: true, opacity: 0.4
    });
    const ring2 = new THREE.Mesh(geo2, mat2);
    ring2.rotation.x = -Math.PI / 2;
    if (playerMesh) ring2.position.copy(playerMesh.position);
    ring2.position.y = 0.06;
    _scene.add(ring2);

    // Animate expand and fade
    const startTime = Date.now();
    const duration = 700;
    function animRing() {
      const t = (Date.now() - startTime) / duration;
      if (t >= 1) {
        _scene.remove(ring);  mat.dispose();  geo.dispose();
        _scene.remove(ring2); mat2.dispose(); geo2.dispose();
        return;
      }
      mat.opacity  = 0.75 * (1 - t);
      mat2.opacity = 0.4  * (1 - t);
      ring.scale.setScalar(1 + t * 0.5);
      ring2.scale.setScalar(1 + t * 0.8);
      requestAnimationFrame(animRing);
    }
    requestAnimationFrame(animRing);
  }

  // ── Per-frame update ─────────────────────────────────────────
  function update(dt) {
    const now = Date.now();

    if (_rageActive) {
      // Drain rage
      _rageMeter -= RAGE_ACTIVE_DRAIN * dt;
      if (_rageMeter <= 0 || now >= _rageEndTime) {
        _rageMeter = 0;
        deactivateRage();
      }
      // Pulsing screen border
      const pulse = Math.sin(now * 0.01) * 0.5 + 0.5;
      _setRageBorder(pulse);
    } else {
      // Passive drain
      if (_rageMeter > 0) {
        _rageMeter = Math.max(0, _rageMeter - RAGE_DRAIN_PER_SEC * dt);
      }
      _setRageBorder(0);
    }

    _updateRageHUD();
  }

  function _setRageBorder(intensity) {
    let el = document.getElementById('rage-border');
    if (!el && intensity > 0) {
      el = document.createElement('div');
      el.id = 'rage-border';
      el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:198;';
      document.body.appendChild(el);
    }
    if (el) {
      if (intensity <= 0) {
        el.style.boxShadow = 'none';
      } else {
        const alpha = (0.3 + intensity * 0.4).toFixed(2);
        el.style.boxShadow = `inset 0 0 ${40 + intensity * 40}px rgba(255,60,0,${alpha})`;
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────
  window.GameRageCombat = {
    ALL_SPECIAL_ATTACKS,
    // Legacy alias so existing main.js code that references SPECIAL_ATTACKS still works
    get SPECIAL_ATTACKS() { return ALL_SPECIAL_ATTACKS; },
    RAGE_MAX,
    RAGE_DAMAGE_MULT,
    RAGE_SPEED_MULT,

    init(scene, saveData, spawnParticlesFn) {
      _scene = scene;
      _saveData = saveData;
      _spawnParticlesFn = spawnParticlesFn;
      _buildHUD();
    },

    refreshLoadout(saveData) {
      if (saveData) _saveData = saveData;
      _rebuildSpecialButtons();
      _updateRageHUD();
    },

    update,
    addRage,
    activateRage,
    triggerSpecialAttack,

    get isRageActive() { return _rageActive; },
    get rageMeter()    { return _rageMeter; },

    onRageActivated(fn)   { _onRageActivated = fn; },
    onRageDeactivated(fn) { _onRageDeactivated = fn; },
    onSpecialAttack(fn)   { _onSpecialAttack = fn; }
  };
}());
