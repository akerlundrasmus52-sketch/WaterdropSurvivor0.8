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

  // ── Special attack definitions ───────────────────────────────
  const SPECIAL_ATTACKS = [
    {
      id: 'shockwave',
      name: 'Shockwave',
      icon: '💥',
      description: 'Massive explosion around player',
      cooldownMs: 8000,
      damageRadius: 12,
      damage: 80,
      color: 0xFF6600,
      keybind: '1'
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
      keybind: '2'
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
      keybind: '3'
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
  SPECIAL_ATTACKS.forEach(s => { _specialCooldowns[s.id] = 0; });

  // Callbacks assigned by main.js
  let _onRageActivated = null;
  let _onRageDeactivated = null;
  let _onSpecialAttack = null; // fn(attack, enemies) → called to actually deal damage

  // ── HUD helpers ───────────────────────────────────────────────
  function _buildHUD() {
    if (document.getElementById('rage-hud')) return;

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

    document.getElementById('rage-activate-btn').addEventListener('click', activateRage);
    _updateRageHUD();

    // Special attack buttons
    const saContainer = document.createElement('div');
    saContainer.id = 'special-attacks-hud';
    saContainer.className = 'special-attacks-hud';
    SPECIAL_ATTACKS.forEach(sa => {
      const btn = document.createElement('button');
      btn.id = `sa-btn-${sa.id}`;
      btn.className = 'special-attack-btn';
      btn.innerHTML = `<span class="sa-icon">${sa.icon}</span><span class="sa-name">${sa.name}</span><div class="sa-cooldown-overlay" id="sa-cd-${sa.id}"></div>`;
      btn.title = sa.description;
      btn.addEventListener('click', () => triggerSpecialAttack(sa.id));
      saContainer.appendChild(btn);
    });
    document.body.appendChild(saContainer);
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

    // Update special attack cooldowns
    const now = Date.now();
    SPECIAL_ATTACKS.forEach(sa => {
      const cdEl = document.getElementById(`sa-cd-${sa.id}`);
      const btn = document.getElementById(`sa-btn-${sa.id}`);
      if (!cdEl || !btn) return;
      const elapsed = now - (_specialCooldowns[sa.id] || 0);
      const remaining = Math.max(0, sa.cooldownMs - elapsed);
      const frac = remaining / sa.cooldownMs;
      cdEl.style.height = (frac * 100) + '%';
      btn.disabled = remaining > 0;
      btn.classList.toggle('sa-ready', remaining <= 0);
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
    const sa = SPECIAL_ATTACKS.find(s => s.id === attackId);
    if (!sa) return;
    const now = Date.now();
    if (now - (_specialCooldowns[attackId] || 0) < sa.cooldownMs) return;

    _specialCooldowns[attackId] = now;
    _showBigText(`${sa.icon} ${sa.name.toUpperCase()}!`, '#FFFFFF');
    _flashScreen(sa.color, 0.5, 300);

    // Spawn visual ring burst
    _spawnAttackRing(sa);

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

  function _spawnAttackRing(sa) {
    if (!_scene || !window.THREE) return;
    const THREE = window.THREE;
    const geo = new THREE.RingGeometry(0.5, sa.damageRadius, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: sa.color, side: THREE.DoubleSide,
      transparent: true, opacity: 0.6
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    // Position at player
    const playerMesh = window._gamePlayerMesh;
    if (playerMesh) ring.position.copy(playerMesh.position);
    ring.position.y = 0.05;
    _scene.add(ring);

    // Animate expand and fade
    const startTime = Date.now();
    const duration = 600;
    function animRing() {
      const t = (Date.now() - startTime) / duration;
      if (t >= 1) { _scene.remove(ring); mat.dispose(); geo.dispose(); return; }
      mat.opacity = 0.6 * (1 - t);
      ring.scale.setScalar(1 + t * 0.3);
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
    SPECIAL_ATTACKS,
    RAGE_MAX,
    RAGE_DAMAGE_MULT,
    RAGE_SPEED_MULT,

    init(scene, saveData, spawnParticlesFn) {
      _scene = scene;
      _saveData = saveData;
      _spawnParticlesFn = spawnParticlesFn;
      _buildHUD();
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
