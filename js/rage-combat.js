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

  const MAX_EQUIPPED_SPECIALS = 2; // Maximum special attacks player can equip at once (displayed in HUD)

  // ── All available special attacks (unlocked via skill tree) ──
  const ALL_SPECIAL_ATTACKS = [
    {
      id: 'knifeTakedown',
      name: 'Knife Takedown',
      icon: '🔪',
      description: 'Close-range insta-kill melee takedown',
      cooldownMs: 40000,
      damageRadius: 2,
      damage: 9999,
      color: 0xCC0000,
      keybind: '1',
      skillTreeId: 'specialKnifeTakedown',
      isStartingAttack: true,
      branch: 'start',
      branchOrder: 0,
      upgrades: [
        { level: 1, cooldownMs: 40000, damage: 9999 },
        { level: 2, cooldownMs: 32000, damage: 9999, bonus: '-8s cooldown' },
        { level: 3, cooldownMs: 25000, damage: 9999, bonus: '-7s cooldown' }
      ]
    },
    {
      id: 'shockwave',
      name: 'Shockwave',
      icon: '💥',
      description: 'Massive explosion around player',
      cooldownMs: 8000,
      damageRadius: 12,
      damage: 80,
      color: 0xFF6600,
      keybind: '2',
      skillTreeId: 'specialShockwave',
      branch: 'upper',
      branchOrder: 1,
      upgrades: [
        { level: 1, cooldownMs: 8000,  damage: 80  },
        { level: 2, cooldownMs: 6500,  damage: 110, bonus: '+30 dmg, -1.5s cd' },
        { level: 3, cooldownMs: 5000,  damage: 150, bonus: '+40 dmg, -1.5s cd' }
      ]
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
      keybind: '3',
      skillTreeId: 'specialFrozenStorm',
      branch: 'lower',
      branchOrder: 1,
      upgrades: [
        { level: 1, cooldownMs: 12000, damage: 30  },
        { level: 2, cooldownMs: 9500,  damage: 50,  bonus: '+20 dmg, -2.5s cd' },
        { level: 3, cooldownMs: 7000,  damage: 75,  bonus: '+25 dmg, -2.5s cd' }
      ]
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
      keybind: '4',
      skillTreeId: 'specialDeathBlossom',
      branch: 'upper',
      branchOrder: 2,
      upgrades: [
        { level: 1, cooldownMs: 15000, damage: 60  },
        { level: 2, cooldownMs: 12000, damage: 85,  bonus: '+25 dmg, -3s cd' },
        { level: 3, cooldownMs: 9000,  damage: 120, bonus: '+35 dmg, -3s cd' }
      ]
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
      keybind: '5',
      skillTreeId: 'specialThunderStrike',
      branch: 'upper',
      branchOrder: 3,
      upgrades: [
        { level: 1, cooldownMs: 10000, damage: 100 },
        { level: 2, cooldownMs: 8000,  damage: 140, bonus: '+40 dmg, -2s cd' },
        { level: 3, cooldownMs: 6000,  damage: 190, bonus: '+50 dmg, -2s cd' }
      ]
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
      keybind: '6',
      skillTreeId: 'specialVoidPulse',
      branch: 'lower',
      branchOrder: 3,
      upgrades: [
        { level: 1, cooldownMs: 18000, damage: 75  },
        { level: 2, cooldownMs: 14000, damage: 105, bonus: '+30 dmg, -4s cd' },
        { level: 3, cooldownMs: 10000, damage: 145, bonus: '+40 dmg, -4s cd' }
      ]
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
      keybind: '7',
      skillTreeId: 'specialInfernoRing',
      branch: 'lower',
      branchOrder: 2,
      upgrades: [
        { level: 1, cooldownMs: 14000, damage: 55  },
        { level: 2, cooldownMs: 11000, damage: 80,  bonus: '+25 dmg, -3s cd' },
        { level: 3, cooldownMs: 8000,  damage: 115, bonus: '+35 dmg, -3s cd' }
      ]
    },
    {
      id: 'acidCloud',
      name: 'Acid Cloud',
      icon: '🟢',
      description: 'Toxic cloud melts enemies over time',
      cooldownMs: 16000,
      damageRadius: 14,
      damage: 45,
      color: 0x44FF22,
      keybind: '8',
      skillTreeId: 'specialAcidCloud',
      branch: 'lower',
      branchOrder: 4,
      upgrades: [
        { level: 1, cooldownMs: 16000, damage: 45  },
        { level: 2, cooldownMs: 12500, damage: 70,  bonus: '+25 dmg, -3.5s cd' },
        { level: 3, cooldownMs: 9000,  damage: 100, bonus: '+30 dmg, -3.5s cd' }
      ]
    },
    {
      id: 'gravityWell',
      name: 'Gravity Well',
      icon: '🌑',
      description: 'Black hole crushes and kills nearby enemies',
      cooldownMs: 22000,
      damageRadius: 20,
      damage: 120,
      color: 0x220044,
      keybind: '9',
      skillTreeId: 'specialGravityWell',
      branch: 'upper',
      branchOrder: 4,
      upgrades: [
        { level: 1, cooldownMs: 22000, damage: 120 },
        { level: 2, cooldownMs: 17000, damage: 165, bonus: '+45 dmg, -5s cd' },
        { level: 3, cooldownMs: 12000, damage: 220, bonus: '+55 dmg, -5s cd' }
      ]
    },
    {
      id: 'sonicBoom',
      name: 'Sonic Boom',
      icon: '📢',
      description: 'Deafening blast knocks back all enemies',
      cooldownMs: 11000,
      damageRadius: 18,
      damage: 65,
      color: 0xCCCCFF,
      keybind: '0',
      skillTreeId: 'specialSonicBoom',
      branch: 'upper',
      branchOrder: 5,
      upgrades: [
        { level: 1, cooldownMs: 11000, damage: 65  },
        { level: 2, cooldownMs: 8500,  damage: 90,  bonus: '+25 dmg, -2.5s cd' },
        { level: 3, cooldownMs: 6500,  damage: 125, bonus: '+35 dmg, -2s cd' }
      ]
    },
    {
      id: 'bloodRain',
      name: 'Blood Rain',
      icon: '🩸',
      description: 'Rain of blood deals damage and slows enemies',
      cooldownMs: 20000,
      damageRadius: 25,
      damage: 50,
      color: 0x990000,
      keybind: 'q',
      skillTreeId: 'specialBloodRain',
      branch: 'lower',
      branchOrder: 5,
      upgrades: [
        { level: 1, cooldownMs: 20000, damage: 50  },
        { level: 2, cooldownMs: 15500, damage: 75,  bonus: '+25 dmg, -4.5s cd' },
        { level: 3, cooldownMs: 11000, damage: 110, bonus: '+35 dmg, -4.5s cd' }
      ]
    },
    {
      id: 'timeFracture',
      name: 'Time Fracture',
      icon: '⏳',
      description: 'Slow all enemies to a crawl for 5 seconds',
      cooldownMs: 25000,
      damageRadius: 30,
      damage: 20,
      color: 0x00FFFF,
      keybind: 'w',
      skillTreeId: 'specialTimeFracture',
      branch: 'lower',
      branchOrder: 6,
      upgrades: [
        { level: 1, cooldownMs: 25000, damage: 20  },
        { level: 2, cooldownMs: 20000, damage: 35,  bonus: '+15 dmg, -5s cd' },
        { level: 3, cooldownMs: 15000, damage: 55,  bonus: '+20 dmg, -5s cd' }
      ]
    },
    {
      id: 'chainLightning',
      name: 'Chain Lightning',
      icon: '🌩️',
      description: 'Lightning chains between multiple enemies',
      cooldownMs: 13000,
      damageRadius: 15,
      damage: 90,
      color: 0xFFEE00,
      keybind: 'e',
      skillTreeId: 'specialChainLightning',
      branch: 'upper',
      branchOrder: 6,
      upgrades: [
        { level: 1, cooldownMs: 13000, damage: 90  },
        { level: 2, cooldownMs: 10000, damage: 125, bonus: '+35 dmg, -3s cd' },
        { level: 3, cooldownMs: 7500,  damage: 170, bonus: '+45 dmg, -2.5s cd' }
      ]
    },
    {
      id: 'mirrorField',
      name: 'Mirror Field',
      icon: '🪞',
      description: 'Reflect all projectiles back at enemies',
      cooldownMs: 30000,
      damageRadius: 12,
      damage: 0,
      color: 0xEEEEEE,
      keybind: 'r',
      skillTreeId: 'specialMirrorField',
      branch: 'lower',
      branchOrder: 7,
      upgrades: [
        { level: 1, cooldownMs: 30000, damage: 0   },
        { level: 2, cooldownMs: 24000, damage: 0,   bonus: '-6s cooldown, lasts longer' },
        { level: 3, cooldownMs: 18000, damage: 0,   bonus: '-6s cooldown, also damages' }
      ]
    },
    {
      id: 'meteorStrike',
      name: 'Meteor Strike',
      icon: '☄️',
      description: 'Call down meteors from the sky',
      cooldownMs: 28000,
      damageRadius: 10,
      damage: 200,
      color: 0xFF8800,
      keybind: 't',
      skillTreeId: 'specialMeteorStrike',
      branch: 'upper',
      branchOrder: 7,
      upgrades: [
        { level: 1, cooldownMs: 28000, damage: 200 },
        { level: 2, cooldownMs: 22000, damage: 270, bonus: '+70 dmg, -6s cd' },
        { level: 3, cooldownMs: 16000, damage: 360, bonus: '+90 dmg, -6s cd' }
      ]
    },
    {
      id: 'shadowClone',
      name: 'Shadow Clone',
      icon: '👤',
      description: 'Spawn a shadow clone that fights alongside you',
      cooldownMs: 35000,
      damageRadius: 8,
      damage: 40,
      color: 0x440088,
      keybind: 'y',
      skillTreeId: 'specialShadowClone',
      branch: 'lower',
      branchOrder: 8,
      upgrades: [
        { level: 1, cooldownMs: 35000, damage: 40  },
        { level: 2, cooldownMs: 28000, damage: 60,  bonus: '+20 dmg, -7s cd' },
        { level: 3, cooldownMs: 21000, damage: 85,  bonus: '+25 dmg, -7s cd' }
      ]
    },
    {
      id: 'forceBarrier',
      name: 'Force Barrier',
      icon: '🛡️',
      description: 'Temporary invincibility shield',
      cooldownMs: 40000,
      damageRadius: 6,
      damage: 0,
      color: 0x4488FF,
      keybind: 'u',
      skillTreeId: 'specialForceBarrier',
      branch: 'lower',
      branchOrder: 9,
      upgrades: [
        { level: 1, cooldownMs: 40000, damage: 0   },
        { level: 2, cooldownMs: 32000, damage: 0,   bonus: '-8s cooldown, lasts longer' },
        { level: 3, cooldownMs: 24000, damage: 0,   bonus: '-8s cooldown, also counters' }
      ]
    },
    {
      id: 'plasmaBurst',
      name: 'Plasma Burst',
      icon: '🔮',
      description: 'Concentrated plasma vaporizes enemies in a cone',
      cooldownMs: 17000,
      damageRadius: 12,
      damage: 130,
      color: 0xFF00FF,
      keybind: 'i',
      skillTreeId: 'specialPlasmaBurst',
      branch: 'upper',
      branchOrder: 8,
      upgrades: [
        { level: 1, cooldownMs: 17000, damage: 130 },
        { level: 2, cooldownMs: 13000, damage: 180, bonus: '+50 dmg, -4s cd' },
        { level: 3, cooldownMs: 9500,  damage: 240, bonus: '+60 dmg, -3.5s cd' }
      ]
    },
    {
      id: 'earthquakeStamp',
      name: 'Earthquake',
      icon: '🌍',
      description: 'Stomp the ground and stun all nearby enemies',
      cooldownMs: 19000,
      damageRadius: 20,
      damage: 70,
      color: 0x885500,
      keybind: 'o',
      skillTreeId: 'specialEarthquake',
      branch: 'lower',
      branchOrder: 10,
      upgrades: [
        { level: 1, cooldownMs: 19000, damage: 70  },
        { level: 2, cooldownMs: 15000, damage: 100, bonus: '+30 dmg, -4s cd' },
        { level: 3, cooldownMs: 11000, damage: 140, bonus: '+40 dmg, -4s cd' }
      ]
    },
    {
      id: 'adrenalineRush',
      name: 'Adrenaline Rush',
      icon: '💉',
      description: 'Massive speed and damage boost for 8 seconds',
      cooldownMs: 45000,
      damageRadius: 0,
      damage: 0,
      color: 0xFF4488,
      keybind: 'p',
      skillTreeId: 'specialAdrenalineRush',
      branch: 'upper',
      branchOrder: 9,
      upgrades: [
        { level: 1, cooldownMs: 45000, damage: 0   },
        { level: 2, cooldownMs: 36000, damage: 0,   bonus: '-9s cooldown, longer boost' },
        { level: 3, cooldownMs: 27000, damage: 0,   bonus: '-9s cooldown, stronger boost' }
      ]
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

  // Get the effective cooldownMs for a special attack based on its current upgrade level
  function _getEffectiveCooldown(sa) {
    if (!_saveData || !_saveData.skillTree || !sa.upgrades) return sa.cooldownMs;
    const node = _saveData.skillTree[sa.skillTreeId];
    const lvl = (node && node.level) || 1;
    const upgrade = sa.upgrades.find(u => u.level === lvl);
    return (upgrade && upgrade.cooldownMs) || sa.cooldownMs;
  }

  // ── HUD helpers ───────────────────────────────────────────────
  function _buildHUD() {
    // Wire event listeners onto static HTML elements in #special-attacks-panel
    // The rage-activate-btn has been replaced by special-attacks-open-btn
    const specialAttacksOpenBtn = document.getElementById('special-attacks-open-btn');
    if (specialAttacksOpenBtn) {
      const newBtn = specialAttacksOpenBtn.cloneNode(true);
      specialAttacksOpenBtn.parentNode.replaceChild(newBtn, specialAttacksOpenBtn);
      // Opens the special attacks / rage loadout panel on click
      newBtn.addEventListener('click', function () {
        if (typeof _toggleLoadoutPanel === 'function') _toggleLoadoutPanel();
        else activateRage();
      });
      newBtn.addEventListener('touchstart', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (typeof _toggleLoadoutPanel === 'function') _toggleLoadoutPanel();
        else activateRage();
      }, { passive: false });
    }
    // Legacy: also wire rage-activate-btn if it exists (for backwards compat)
    const rageBtn = document.getElementById('rage-activate-btn');
    if (rageBtn) {
      const newRageBtn = rageBtn.cloneNode(true);
      rageBtn.parentNode.replaceChild(newRageBtn, rageBtn);
      newRageBtn.addEventListener('click', activateRage);
      newRageBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); activateRage(); }, { passive: false });
    }

    const loadoutBtn = document.getElementById('sa-loadout-btn');
    if (loadoutBtn) {
      const newLoadout = loadoutBtn.cloneNode(true);
      loadoutBtn.parentNode.replaceChild(newLoadout, loadoutBtn);
      newLoadout.addEventListener('click', _toggleLoadoutPanel);
      newLoadout.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); _toggleLoadoutPanel(); }, { passive: false });
    }

    // Delegated event listener on the SA panel so slots work without re-adding listeners
    const saPanel = document.getElementById('special-attacks-panel');
    if (saPanel) {
      const newPanel = saPanel.cloneNode(false); // shallow clone clears listeners; children restored below
      // Re-attach children manually to avoid losing them
      while (saPanel.firstChild) newPanel.appendChild(saPanel.firstChild);
      saPanel.parentNode.replaceChild(newPanel, saPanel);

      newPanel.addEventListener('click', (e) => {
        const slot = e.target.closest('.sa-slot[data-sa-id]');
        if (slot && slot.dataset.saId) triggerSpecialAttack(slot.dataset.saId);
      });
      newPanel.addEventListener('touchstart', (e) => {
        const slot = e.target.closest('.sa-slot[data-sa-id]');
        if (slot && slot.dataset.saId) {
          e.preventDefault();
          e.stopPropagation();
          triggerSpecialAttack(slot.dataset.saId);
        }
      }, { passive: false });
    }

    _rebuildSpecialButtons();
    _updateRageHUD();
    _buildLoadoutPanel();
  }

  function _rebuildSpecialButtons() {
    const slotsUnlocked = (_saveData && _saveData.specialSlotsUnlocked) || 1;
    const equipped = _getEquippedAttacks();

    for (let i = 0; i < MAX_EQUIPPED_SPECIALS; i++) {
      const slotEl = document.getElementById(`sa-slot-${i + 1}`);
      if (!slotEl) continue;

      const slotActive = (i + 1) <= slotsUnlocked;
      const sa = equipped[i];

      if (!slotActive) {
        // Slot not yet unlocked
        slotEl.className = 'companion-skill-btn sa-slot sa-slot-locked';
        slotEl.innerHTML = '🔒';
        slotEl.title = `🔒 Unlock in Special Attacks building to enable slot ${i + 1}`;
        delete slotEl.dataset.saId;
      } else if (sa) {
        const unlocked = _isUnlocked(sa);
        slotEl.className = 'companion-skill-btn sa-slot' + (unlocked ? '' : ' sa-slot-locked');
        slotEl.innerHTML = `<span class="sa-icon">${sa.icon}</span><span class="sa-name">${sa.name}</span><div class="sa-cooldown-overlay" id="sa-cd-${sa.id}"></div>`;
        slotEl.title = unlocked ? sa.description : `🔒 Unlock "${sa.name}" in Special Attacks building`;
        slotEl.dataset.saId = sa.id;
      } else {
        // Unlocked but empty
        slotEl.className = 'companion-skill-btn sa-slot comp-empty';
        slotEl.innerHTML = '⬡';
        slotEl.title = 'Empty special attack slot — equip from Special Attacks building';
        delete slotEl.dataset.saId;
      }
    }
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
    const chosenBranch = (_saveData && _saveData.specialBranch) || null;

    panel.innerHTML = `<h3>⚔️ SPECIAL ATTACKS (max ${MAX_EQUIPPED_SPECIALS})</h3>`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'sa-loadout-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => panel.classList.remove('visible'));
    panel.appendChild(closeBtn);

    // Group attacks by branch
    const starter = ALL_SPECIAL_ATTACKS.filter(sa => sa.branch === 'start');
    const upper   = ALL_SPECIAL_ATTACKS.filter(sa => sa.branch === 'upper').sort((a, b) => a.branchOrder - b.branchOrder);
    const lower   = ALL_SPECIAL_ATTACKS.filter(sa => sa.branch === 'lower').sort((a, b) => a.branchOrder - b.branchOrder);

    const knifeUnlocked = starter.some(sa => _isUnlocked(sa));

    function _renderGroup(label, attacks, branchId) {
      const isActiveBranch = !branchId || !chosenBranch || chosenBranch === branchId;
      const sectionLabel = document.createElement('div');
      sectionLabel.style.cssText = `font-size:10px;color:${branchId === 'upper' ? '#FF8844' : branchId === 'lower' ? '#4488FF' : '#FFD700'};letter-spacing:2px;margin:8px 0 4px;text-transform:uppercase;padding:0 2px;opacity:${isActiveBranch ? '1' : '0.4'};`;
      sectionLabel.textContent = label + (branchId && chosenBranch && !isActiveBranch ? ' 🔒' : '');
      panel.appendChild(sectionLabel);

      attacks.forEach(sa => {
        const unlocked = _isUnlocked(sa);
        const branchAccessible = isActiveBranch;
        const isEquipped = equipped.includes(sa.id);
        const item = document.createElement('div');
        item.className = 'sa-loadout-item' + (isEquipped ? ' equipped' : '') + ((!unlocked || !branchAccessible) ? ' locked' : '');
        item.style.opacity = branchAccessible ? '1' : '0.35';
        item.innerHTML = `<span style="font-size:20px">${sa.icon}</span><div><div style="font-weight:bold;color:#DDD">${sa.name}</div><div style="font-size:10px;color:#888">${sa.description}</div></div>${isEquipped ? '<span style="color:#FFD700;font-size:11px;margin-left:auto">EQUIPPED</span>' : (unlocked && branchAccessible ? '<span style="color:#88FF88;font-size:11px;margin-left:auto">TAP TO EQUIP</span>' : '<span style="color:#888;font-size:11px;margin-left:auto">🔒 LOCKED</span>')}`;
        if (unlocked && branchAccessible) {
          item.addEventListener('click', () => _toggleEquip(sa.id));
        }
        panel.appendChild(item);
      });
    }

    _renderGroup('— Starter Attack —', starter, null);

    if (knifeUnlocked) {
      if (!chosenBranch) {
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:10px;color:#FF8844;padding:6px 4px;text-align:center;';
        hint.textContent = '⚡ Open Special Attacks to choose your branch path!';
        panel.appendChild(hint);
      }
      _renderGroup('⚔️ Upper Branch', upper, 'upper');
      _renderGroup('🛡️ Lower Branch', lower, 'lower');
    } else {
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:10px;color:#888;padding:6px 4px;text-align:center;';
      hint.textContent = '🔒 Unlock Knife Takedown to access branches';
      panel.appendChild(hint);
    }
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
    // StatusBar (repurposed rage meter) — shows rage fill color until status effects are active
    const fill = document.getElementById('rage-unified-fill');
    if (fill) {
      fill.style.width = (_rageMeter / RAGE_MAX * 100) + '%';
      fill.style.background = _rageActive
        ? 'linear-gradient(90deg,#FF4400,#FF8800)'
        : (_rageMeter >= RAGE_MIN_TO_ACTIVATE ? 'linear-gradient(90deg,#FF6600,#FFD700)' : 'linear-gradient(90deg,#4466FF,#8844FF)');
    }
    // Update the open-btn icon to reflect rage state (optional visual feedback)
    const openBtn = document.getElementById('special-attacks-open-btn');
    if (openBtn) {
      openBtn.textContent = _rageActive ? '🔥' : '⚔️';
      openBtn.style.borderColor = _rageActive ? '#FF4400' : (_rageMeter >= RAGE_MIN_TO_ACTIVATE ? '#FFD700' : 'rgba(100,180,255,0.6)');
    }

    // Update special attack cooldowns on sa-slot-N elements
    const now = Date.now();
    const equipped = _getEquippedAttacks();
    equipped.forEach((sa, i) => {
      const cdEl = document.getElementById(`sa-cd-${sa.id}`);
      const slotEl = document.getElementById(`sa-slot-${i + 1}`);
      if (!cdEl || !slotEl) return;
      const effectiveCd = _getEffectiveCooldown(sa);
      const elapsed = now - (_specialCooldowns[sa.id] || 0);
      const remaining = Math.max(0, effectiveCd - elapsed);
      const frac = remaining / effectiveCd;
      cdEl.style.height = (frac * 100) + '%';
      const unlocked = _isUnlocked(sa);
      slotEl.classList.toggle('sa-ready', unlocked && remaining <= 0);
      slotEl.classList.toggle('sa-slot-locked', !unlocked);
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
    if (now - (_specialCooldowns[attackId] || 0) < _getEffectiveCooldown(sa)) return;

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

  // ── HUD visibility (hide outside active gameplay) ────────────
  function setCombatHUDVisible(active) {
    const saPanel = document.getElementById('special-attacks-panel');
    const dispVal  = active ? '' : 'none';
    if (saPanel) saPanel.style.display = dispVal;
    // Close loadout panel when hiding
    if (!active) {
      const panel = document.getElementById('sa-loadout-panel');
      if (panel) panel.classList.remove('visible');
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
      // HUD starts hidden — shown when gameplay begins via setCombatHUDVisible(true)
      setCombatHUDVisible(false);
    },

    refreshLoadout(saveData) {
      if (saveData) _saveData = saveData;
      _rebuildSpecialButtons();
      _updateRageHUD();
    },

    setCombatHUDVisible,
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
