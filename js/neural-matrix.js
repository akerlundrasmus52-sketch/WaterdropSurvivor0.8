// js/neural-matrix.js — The Neural Matrix: synapse-constellation upgrade UI.
// Players spend Astral Essence (major nodes) or 1945 Credits (minor stat nodes) to upgrade.
// Includes AIDA's Parasite Node puzzle that drains gold if the path is infected.
// Depends on: save-system.js (saveData), audio.js (playSound)

window.NeuralMatrix = (function () {
  'use strict';

  // ─── Node definitions ──────────────────────────────────────────────────────
  // Positions are in a normalised 0-1 coordinate space on the canvas.
  // Major nodes cost Astral Essence (⚡). Minor stat nodes cost 1945 Credits (✈️).
  const NODES = [
    {
      id: 'start',
      label: 'NEURAL\nCORE',
      icon: '◈',
      cost: 0,
      cx: 0.50, cy: 0.50,
      color: '#00ccff',
      glowColor: 'rgba(0,204,255,0.4)',
      connections: ['atk1_left', 'atk1_top', 'atk1_right', 'eventHorizon', 'bloodAlchemy', 'kineticMirror'],
      isStart: true,
      description: 'The origin node. Spend Astral Essence to branch outward.'
    },
    // ── Minor ATK/SPD nodes between CORE and the three major nodes ─────────────
    {
      id: 'atk1_left',
      label: 'ATK\n+1',
      icon: '⚔',
      cost: 20,
      cx: 0.30, cy: 0.40,
      color: '#ff8844',
      glowColor: 'rgba(255,136,68,0.4)',
      connections: ['melee1_left'],
      isMinor: true,
      currency: 'credits1945',
      statBonus: { atk: 1 },
      description: 'Play 1945 Striker to earn credits. +1 ATK — increases all damage by 5%.'
    },
    {
      id: 'melee1_left',
      label: 'MELEE\n+1%',
      icon: '🗡',
      cost: 15,
      cx: 0.26, cy: 0.32,
      color: '#ff6644',
      glowColor: 'rgba(255,102,68,0.3)',
      connections: ['eventHorizon'],
      isMinor: true,
      currency: 'credits1945',
      statBonus: { meleeAtk: 1 },
      description: 'Play 1945 Striker to earn credits. +1% melee weapon damage.'
    },
    {
      id: 'spd1_left',
      label: 'SPD\n+1',
      icon: '💨',
      cost: 20,
      cx: 0.22, cy: 0.34,
      color: '#44ffcc',
      glowColor: 'rgba(68,255,204,0.4)',
      connections: ['eventHorizon'],
      isMinor: true,
      currency: 'credits1945',
      statBonus: { spd: 1 },
      description: 'Play 1945 Striker to earn credits. +1 SPD — increases move speed by 3%.'
    },
    {
      id: 'atk1_top',
      label: 'ATK\n+1',
      icon: '⚔',
      cost: 20,
      cx: 0.43, cy: 0.34,
      color: '#ff8844',
      glowColor: 'rgba(255,136,68,0.4)',
      connections: ['headshot1_top'],
      isMinor: true,
      currency: 'credits1945',
      statBonus: { atk: 1 },
      description: 'Play 1945 Striker to earn credits. +1 ATK — increases all damage by 5%.'
    },
    {
      id: 'headshot1_top',
      label: 'HDSHOT\n+0.2%',
      icon: '🎯',
      cost: 15,
      cx: 0.46, cy: 0.26,
      color: '#ffaa44',
      glowColor: 'rgba(255,170,68,0.3)',
      connections: ['bloodAlchemy'],
      isMinor: true,
      currency: 'credits1945',
      statBonus: { headshotChance: 0.2 },
      description: 'Play 1945 Striker to earn credits. +0.2% headshot chance for critical hits.'
    },
    {
      id: 'spd1_top',
      label: 'SPD\n+1',
      icon: '💨',
      cost: 20,
      cx: 0.57, cy: 0.34,
      color: '#44ffcc',
      glowColor: 'rgba(68,255,204,0.4)',
      connections: ['bloodAlchemy'],
      isMinor: true,
      currency: 'credits1945',
      statBonus: { spd: 1 },
      description: 'Play 1945 Striker to earn credits. +1 SPD — increases move speed by 3%.'
    },
    {
      id: 'atk1_right',
      label: 'ATK\n+1',
      icon: '⚔',
      cost: 20,
      cx: 0.70, cy: 0.40,
      color: '#ff8844',
      glowColor: 'rgba(255,136,68,0.4)',
      connections: ['ranged1_right'],
      isMinor: true,
      currency: 'credits1945',
      statBonus: { atk: 1 },
      description: 'Play 1945 Striker to earn credits. +1 ATK — increases all damage by 5%.'
    },
    {
      id: 'ranged1_right',
      label: 'RANGED\n+1%',
      icon: '🏹',
      cost: 15,
      cx: 0.74, cy: 0.32,
      color: '#ff8866',
      glowColor: 'rgba(255,136,102,0.3)',
      connections: ['kineticMirror'],
      isMinor: true,
      currency: 'credits1945',
      statBonus: { rangedAtk: 1 },
      description: 'Play 1945 Striker to earn credits. +1% ranged weapon damage.'
    },
    {
      id: 'spd1_right',
      label: 'SPD\n+1',
      icon: '💨',
      cost: 20,
      cx: 0.78, cy: 0.34,
      color: '#44ffcc',
      glowColor: 'rgba(68,255,204,0.4)',
      connections: ['kineticMirror'],
      isMinor: true,
      currency: 'credits1945',
      statBonus: { spd: 1 },
      description: 'Play 1945 Striker to earn credits. +1 SPD — increases move speed by 3%.'
    },
    // ── Sleep upgrade minor nodes (between major nodes and Annunaki Protocol) ──
    {
      id: 'sleep_regen',
      label: 'SLEEP\nREGEN',
      icon: '😴',
      cost: 30,
      cx: 0.35, cy: 0.62,
      color: '#8866ff',
      glowColor: 'rgba(136,102,255,0.4)',
      connections: ['annunakiProtocol'],
      isMinor: true,
      currency: 'credits1945',
      statBonus: { sleepRegen: 1 },
      description: 'Play 1945 to unlock. Between runs: regenerate 10% max HP during idle/sleep phase.'
    },
    {
      id: 'sleep_gold',
      label: 'SLEEP\nGOLD',
      icon: '💰',
      cost: 30,
      cx: 0.65, cy: 0.62,
      color: '#ffdd44',
      glowColor: 'rgba(255,221,68,0.4)',
      connections: ['annunakiProtocol'],
      isMinor: true,
      currency: 'credits1945',
      statBonus: { sleepGold: 1 },
      description: 'Play 1945 to unlock. Earn 5% more gold passively while idle between runs.'
    },
    // ── Major nodes ────────────────────────────────────────────────────────────
    {
      id: 'eventHorizon',
      label: 'EVENT\nHORIZON',
      icon: '⦿',
      cost: 40,
      cx: 0.20, cy: 0.22,
      color: '#aa44ff',
      glowColor: 'rgba(170,68,255,0.4)',
      connections: ['annunakiProtocol'],
      description: 'Dashing tears open a black hole that sucks enemies in for 1.5s.'
    },
    {
      id: 'bloodAlchemy',
      label: 'BLOOD\nALCHEMY',
      icon: '⬡',
      cost: 40,
      cx: 0.50, cy: 0.15,
      color: '#ff2244',
      glowColor: 'rgba(255,34,68,0.4)',
      connections: ['annunakiProtocol'],
      description: 'HP regeneration is amplified by the number of blood pools on the ground.'
    },
    {
      id: 'kineticMirror',
      label: 'KINETIC\nMIRROR',
      icon: '◇',
      cost: 40,
      cx: 0.80, cy: 0.22,
      color: '#00ffaa',
      glowColor: 'rgba(0,255,170,0.4)',
      connections: ['annunakiProtocol'],
      description: '10% chance to reflect an enemy projectile back at 300% speed.'
    },
    {
      id: 'annunakiProtocol',
      label: 'THE\nANNUNAKI\nPROTOCOL',
      icon: '★',
      cost: 120,
      cx: 0.50, cy: 0.80,
      color: '#ffd700',
      glowColor: 'rgba(255,215,0,0.5)',
      connections: [],
      isFinal: true,
      description: 'Permanent gold/liquid-metal form. Double all damage. Lose 1% max HP per second — attack or die.'
    }
  ];

  // Parasite Node — injected dynamically at a random connector position
  const PARASITE = {
    id: 'parasite',
    label: 'PARASITE\nNODE',
    icon: '✕',
    cx: 0.36, cy: 0.42,   // sits near the start→eventHorizon connector
    color: '#ff0022',
    glowColor: 'rgba(255,0,34,0.5)',
    description: 'AIDA\'s infection. Route around it — touching it lets AIDA drain 10% gold after every run.'
  };

  // ─── Internal state ─────────────────────────────────────────────────────────
  let _canvas = null;
  let _ctx = null;
  let _overlay = null;
  let _animFrame = null;
  let _unlockAnim = null; // { nodeId, progress 0→1, lines[] }
  let _time = 0;          // Monotonic tick for animations

  // ─── Hidden star-pattern detection ──────────────────────────────────────────
  // Five hotspot positions form a pentagram (normalized 0-1 canvas coords).
  // Two additional hotspots form a 7-pointed Annunaki Star when all 7 are hit.
  // Hotspots are invisible — the player discovers them by clicking around the canvas.
  const _STAR_HOTSPOTS = [
    { cx: 0.50, cy: 0.04 },  // Top
    { cx: 0.92, cy: 0.55 },  // Right
    { cx: 0.73, cy: 0.95 },  // Lower-right
    { cx: 0.27, cy: 0.95 },  // Lower-left
    { cx: 0.08, cy: 0.55 },  // Left
    { cx: 0.82, cy: 0.04 },  // Upper-right (Annunaki Star extra)
    { cx: 0.18, cy: 0.04 },  // Upper-left  (Annunaki Star extra)
  ];
  const _STAR_HIT_RADIUS = 0.06; // Normalized radius for hotspot activation
  let _activatedHotspots = new Set(); // indices into _STAR_HOTSPOTS

  function _checkStarHotspot(normX, normY) {
    for (let i = 0; i < _STAR_HOTSPOTS.length; i++) {
      const h = _STAR_HOTSPOTS[i];
      const dx = normX - h.cx;
      const dy = normY - h.cy;
      if (Math.sqrt(dx * dx + dy * dy) <= _STAR_HIT_RADIUS) {
        _activatedHotspots.add(i);
      }
    }
    // Pentagram: all 5 base hotspots (indices 0-4)
    const pentagramComplete = [0, 1, 2, 3, 4].every(i => _activatedHotspots.has(i));
    // Annunaki Star: all 7 hotspots
    const annunakiComplete = _STAR_HOTSPOTS.length === 7 && [0, 1, 2, 3, 4, 5, 6].every(i => _activatedHotspots.has(i));
    if (pentagramComplete || annunakiComplete) {
      _activatedHotspots.clear(); // Reset so it can be triggered again
      _triggerForbiddenProtocol(annunakiComplete ? 'annunaki' : 'pentagram');
    }
  }

  function _triggerForbiddenProtocol(shape) {
    if (window._nmForbiddenProtocol) return; // Already active
    window._nmForbiddenProtocol = true;
    if (saveData && saveData.neuralMatrix) {
      saveData.neuralMatrix.forbiddenProtocol = true;
      _save();
    }
    // Play dramatic sound
    if (typeof playSound === 'function') {
      try { playSound('forbidden_protocol'); } catch (e) { /* ignore */ }
    }
    // Massive alert overlay
    const alertEl = document.createElement('div');
    alertEl.id = 'nm-forbidden-alert';
    alertEl.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.88)',
      'color:#ff00ff',
      'font-family:"Courier New",monospace',
      'animation:nmForbiddenFlash 0.15s ease 3',
      'pointer-events:none'
    ].join(';');
    alertEl.innerHTML = `
      <div style="font-size:clamp(18px,4vw,36px);letter-spacing:4px;text-shadow:0 0 20px #ff00ff,0 0 40px #ff00ff;text-align:center;margin-bottom:16px">
        ⚠ FORBIDDEN PROTOCOL EXECUTED ⚠
      </div>
      <div style="font-size:clamp(10px,2vw,15px);color:#00ffff;letter-spacing:2px;text-align:center;line-height:2">
        ${shape === 'annunaki' ? 'ANNUNAKI STAR — 7-DIMENSIONAL BREACH' : 'PENTAGRAM — REALITY MATRIX COMPROMISED'}<br>
        THE SOURCE GLITCH HAS BEEN RELEASED
      </div>`;
    document.body.appendChild(alertEl);
    setTimeout(() => { if (alertEl.parentNode) alertEl.remove(); }, 4000);

    // Narrator line
    if (typeof window.showNarratorLine === 'function') {
      window.showNarratorLine(
        'AIDA: "...what have you done? The Source has been breached. They\'re coming."', 4500
      );
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function _save() {
    if (typeof saveSaveData === 'function') saveSaveData();
  }

  function _isUnlocked(nodeId) {
    if (nodeId === 'start') return true;
    return !!(saveData && saveData.neuralMatrix && saveData.neuralMatrix[nodeId]);
  }

  function _isParasiteActive() {
    return !!(saveData && saveData.neuralMatrix && saveData.neuralMatrix.parasiteActive);
  }

  function _isPathInfected() {
    // Infected when the player has built a connection that touches the parasite:
    // The parasite sits between start and eventHorizon.  If eventHorizon is
    // unlocked AND the parasite has not been routed-around, the path is infected.
    if (!_isParasiteActive()) return false;
    return _isUnlocked('eventHorizon') && !(saveData.neuralMatrix.parasiteRouted);
  }

  function _nodeById(id) {
    return NODES.find(n => n.id === id) || null;
  }

  // ─── Canvas geometry ────────────────────────────────────────────────────────
  function _canvasXY(node) {
    return {
      x: node.cx * _canvas.width,
      y: node.cy * _canvas.height
    };
  }

  // ─── Drawing ────────────────────────────────────────────────────────────────
  function _drawBackground() {
    const W = _canvas.width, H = _canvas.height;
    _ctx.fillStyle = '#010610';
    _ctx.fillRect(0, 0, W, H);

    // Faint grid of synaptic dots
    _ctx.save();
    _ctx.globalAlpha = 0.07;
    _ctx.fillStyle = '#00aaff';
    for (let gx = 0; gx < W; gx += 38) {
      for (let gy = 0; gy < H; gy += 38) {
        const jx = gx + (Math.sin(_time * 0.3 + gy) * 3);
        const jy = gy + (Math.cos(_time * 0.3 + gx) * 3);
        _ctx.beginPath();
        _ctx.arc(jx, jy, 1.2, 0, Math.PI * 2);
        _ctx.fill();
      }
    }
    _ctx.restore();

    // Nebula glow in centre
    const grad = _ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, W * 0.42);
    grad.addColorStop(0,   'rgba(0,50,100,0.25)');
    grad.addColorStop(1,   'rgba(0,0,0,0)');
    _ctx.fillStyle = grad;
    _ctx.fillRect(0, 0, W, H);
  }

  function _drawConnector(fromNode, toNode, unlocked, animProg) {
    const a = _canvasXY(fromNode);
    const b = _canvasXY(toNode);
    const progress = animProg !== undefined ? animProg : (unlocked ? 1 : 0);

    if (progress <= 0) return;

    const endX = a.x + (b.x - a.x) * progress;
    const endY = a.y + (b.y - a.y) * progress;

    _ctx.save();
    _ctx.globalAlpha = 0.3 + 0.4 * progress;
    _ctx.strokeStyle = unlocked
      ? (toNode.color || '#00ccff')
      : '#0a1a2a';
    _ctx.lineWidth = 2;
    _ctx.setLineDash(unlocked ? [] : [6, 8]);

    // Pulsing glow for active connections
    if (unlocked) {
      _ctx.shadowColor = toNode.color;
      _ctx.shadowBlur  = 12 + Math.sin(_time * 2) * 4;
    }

    _ctx.beginPath();
    _ctx.moveTo(a.x, a.y);
    _ctx.lineTo(endX, endY);
    _ctx.stroke();
    _ctx.restore();
  }

  function _drawNode(node, isParasite) {
    const { x, y } = _canvasXY(node);
    const unlocked = isParasite ? false : _isUnlocked(node.id);
    // Determine node size: smaller for intermediate stat nodes (melee/ranged/headshot)
    const isSmallNode = node.id && (
      node.id.includes('melee') ||
      node.id.includes('ranged') ||
      node.id.includes('headshot')
    );
    const R = node.isFinal ? 32 : node.isStart ? 28 : isSmallNode ? 18 : 24;

    _ctx.save();

    // Outer glow ring
    const pulse = 0.7 + 0.3 * Math.sin(_time * 2.5 + (node.cx + node.cy) * 10);
    const gGrad = _ctx.createRadialGradient(x, y, R * 0.5, x, y, R * 1.9);
    gGrad.addColorStop(0, (unlocked || node.isStart) ? node.glowColor : 'rgba(20,30,50,0.4)');
    gGrad.addColorStop(1, 'rgba(0,0,0,0)');
    _ctx.globalAlpha = pulse;
    _ctx.fillStyle = gGrad;
    _ctx.beginPath();
    _ctx.arc(x, y, R * 2, 0, Math.PI * 2);
    _ctx.fill();

    // Main circle
    _ctx.globalAlpha = 1;
    _ctx.beginPath();
    _ctx.arc(x, y, R, 0, Math.PI * 2);
    if (unlocked || node.isStart) {
      _ctx.fillStyle = '#0a1020';
      _ctx.fill();
      _ctx.strokeStyle = node.color;
      _ctx.lineWidth = 3;
      _ctx.shadowColor = node.color;
      _ctx.shadowBlur = 18 + Math.sin(_time * 2) * 6;
    } else if (isParasite && _isParasiteActive()) {
      _ctx.fillStyle = '#200005';
      _ctx.fill();
      _ctx.strokeStyle = '#ff0022';
      _ctx.lineWidth = 2;
      _ctx.shadowColor = '#ff0022';
      _ctx.shadowBlur = 10 + Math.sin(_time * 4) * 8;
    } else {
      _ctx.fillStyle = '#050a14';
      _ctx.fill();
      _ctx.strokeStyle = '#0d2030';
      _ctx.lineWidth = 1.5;
    }
    _ctx.stroke();

    // Inner icon
    _ctx.fillStyle = (unlocked || node.isStart) ? node.color
      : (isParasite && _isParasiteActive()) ? '#ff2244' : '#1a2a3a';
    _ctx.font = `bold ${R * 0.85}px monospace`;
    _ctx.textAlign = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.shadowColor = (unlocked || node.isStart) ? node.color : 'transparent';
    _ctx.shadowBlur = 10;
    _ctx.fillText(node.icon, x, y);

    // Label below node
    _ctx.shadowBlur = 0;
    const lines = node.label.split('\n');
    const lh = 11;
    const baseY = y + R + 10;
    _ctx.font = `bold 10px "Courier New", monospace`;
    _ctx.fillStyle = (unlocked || node.isStart) ? node.color
      : (isParasite && _isParasiteActive()) ? '#ff4455' : '#1e3040';
    lines.forEach((ln, i) => {
      _ctx.fillText(ln, x, baseY + i * lh);
    });

    // Cost badge (only for locked non-start nodes)
    if (!unlocked && !node.isStart && !isParasite) {
      const isMinorNode = !!node.isMinor;
      const cred = saveData ? (saveData.neural1945 ? (saveData.neural1945.credits || 0) : 0) : 0;
      const ess  = saveData ? (saveData.astralEssence || 0) : 0;
      const canAfford = isMinorNode ? (cred >= node.cost) : (ess >= node.cost);
      _ctx.font = 'bold 9px monospace';
      _ctx.fillStyle = canAfford ? '#00ffaa' : '#ff4444';
      const badge = isMinorNode ? ('✈' + node.cost) : ('⚡' + node.cost);
      _ctx.fillText(badge, x, y - R - 8);
    }

    _ctx.restore();
  }

  function _drawUnlockFlash() {
    if (!_unlockAnim) return;
    const { progress } = _unlockAnim;
    const alpha = Math.max(0, 1 - progress * 1.5);
    _ctx.save();
    _ctx.globalAlpha = alpha * 0.85;
    _ctx.fillStyle = '#ffffff';
    _ctx.fillRect(0, 0, _canvas.width, _canvas.height);
    _ctx.restore();
  }

  function _render() {
    if (!_ctx) return;
    _time += 0.02;

    _drawBackground();

    // Draw connectors
    NODES.forEach(node => {
      node.connections.forEach(toId => {
        const toNode = _nodeById(toId);
        if (!toNode) return;
        const bothUnlocked = _isUnlocked(node.id) && _isUnlocked(toId);
        let animProg;
        if (_unlockAnim && _unlockAnim.nodeId === toId) {
          animProg = Math.min(1, _unlockAnim.progress * 2); // lines snake out ahead of anim
        }
        _drawConnector(node, toNode, bothUnlocked, animProg);
      });
    });

    // Parasite connector (start → parasite, parasite → eventHorizon)
    if (_isParasiteActive()) {
      _drawConnector(_nodeById('start'), PARASITE, false);
      _drawConnector(PARASITE, _nodeById('eventHorizon'), false);
    }

    // Draw nodes
    NODES.forEach(n => _drawNode(n, false));
    if (_isParasiteActive()) _drawNode(PARASITE, true);

    // Unlock flash overlay
    if (_unlockAnim) {
      _unlockAnim.progress = Math.min(1, _unlockAnim.progress + 0.04);
      _drawUnlockFlash();
      if (_unlockAnim.progress >= 1) _unlockAnim = null;
    }

    _animFrame = requestAnimationFrame(_render);
  }

  // ─── Tooltip / info panel ──────────────────────────────────────────────────
  function _getNodeAt(px, py) {
    const W = _canvas.width, H = _canvas.height;
    const all = [...NODES, (_isParasiteActive() ? PARASITE : null)].filter(Boolean);
    for (const n of all) {
      const nx = n.cx * W, ny = n.cy * H;
      const R  = n.isFinal ? 32 : n.isStart ? 28 : 24;
      if (Math.hypot(px - nx, py - ny) <= R + 6) return n;
    }
    return null;
  }

  // ─── Unlock ────────────────────────────────────────────────────────────────
  function _tryUnlock(nodeId) {
    if (nodeId === 'start' || nodeId === 'parasite') return;
    if (_isUnlocked(nodeId)) return;

    const node = _nodeById(nodeId);
    if (!node) return;

    // Check a parent is unlocked
    const parents = NODES.filter(n => n.connections.includes(nodeId));
    const parentUnlocked = parents.some(p => _isUnlocked(p.id));
    if (!parentUnlocked) {
      _showToast('Unlock a connected node first!', '#ff8800');
      return;
    }

    // Minor nodes cost 1945 Credits; major nodes cost Astral Essence
    if (node.isMinor) {
      const credits = saveData && saveData.neural1945 ? (saveData.neural1945.credits || 0) : 0;
      if (credits < node.cost) {
        _showToast('Need ' + node.cost + ' ✈️ 1945 Credits! Play the 1945 Striker to earn them.', '#ff8800');
        return;
      }
      saveData.neural1945.credits -= node.cost;
    } else {
      const essence = saveData ? (saveData.astralEssence || 0) : 0;
      if (essence < node.cost) {
        _showToast('Not enough Astral Essence! (Need ' + node.cost + ' ⚡)', '#ff4444');
        return;
      }
      saveData.astralEssence -= node.cost;
    }

    if (!saveData.neuralMatrix) saveData.neuralMatrix = {};
    saveData.neuralMatrix[nodeId] = true;

    // Accumulate minor stat bonuses in saveData.neuralMatrix._statBonuses
    if (node.statBonus) {
      if (!saveData.neuralMatrix._statBonuses) saveData.neuralMatrix._statBonuses = {};
      Object.keys(node.statBonus).forEach(k => {
        saveData.neuralMatrix._statBonuses[k] = (saveData.neuralMatrix._statBonuses[k] || 0) + node.statBonus[k];
      });
    }

    _save();

    // Trigger unlock animation
    _unlockAnim = { nodeId, progress: 0 };

    // Extreme reward blast — visual dopamine hit for major node unlock
    const _majorNodes = ['eventHorizon', 'bloodAlchemy', 'kineticMirror', 'annunakiProtocol'];
    if (_majorNodes.includes(nodeId) && typeof window.triggerRewardBlast === 'function') {
      setTimeout(() => window.triggerRewardBlast({ essence: 0, cores: 0, gold: 0, _nodeLabel: node.label }), 300);
    }

    // Play bass THUD (use available sound)
    if (typeof playSound === 'function') {
      try { playSound('levelup'); } catch (e) { /* ignore */ }
    }

    // Narrator line
    const flavour = {
      eventHorizon:     'Event Horizon online. Space folds when you dash.',
      bloodAlchemy:     'Blood Alchemy active. The ground\'s suffering heals you.',
      kineticMirror:    'Kinetic Mirror armed. Their bullets become your weapons.',
      annunakiProtocol: 'THE ANNUNAKI PROTOCOL ENGAGED. Embrace the gold. Embrace the pain.',
      atk1_left:  'Synapse reinforced. Attack power +1.',
      atk1_top:   'Neural pathway boosted. Damage output rising.',
      atk1_right: 'Strike protocol updated. +1 ATK.',
      spd1_left:  'Motor cortex calibrated. Speed +1.',
      spd1_top:   'Velocity routines optimised.',
      spd1_right: 'Neural drift engaged. Movement faster.',
      sleep_regen: 'Sleep cycle enhanced. Regeneration active between runs.',
      sleep_gold:  'Passive income protocol loaded. Gold accumulation rate increased.'
    };
    if (typeof window.showNarratorLine === 'function') {
      window.showNarratorLine('AIDA: ' + (flavour[nodeId] || 'Node unlocked.'), 3500);
    }

    _updateInfoPanel(node);
    _updateEssenceDisplay();
  }

  // ─── Route-around parasite ─────────────────────────────────────────────────
  function _rerouteAroundParasite() {
    if (!_isParasiteActive()) return;
    if (!saveData || !saveData.neuralMatrix) return;
    const cores = saveData.neuralCores || 0;
    if (cores < 1) {
      _showToast('Need 1 Neural Core to re-route! (🔷' + cores + '/1)', '#ff8800');
      return;
    }
    saveData.neuralCores -= 1;
    saveData.neuralMatrix.parasiteRouted = true;
    _save();
    _showToast('Parasite isolated! AIDA\'s drain is severed.', '#00ffaa');
    if (typeof window.showNarratorLine === 'function') {
      window.showNarratorLine('AIDA: "...interference detected. Compensating."', 3000);
    }
  }

  // ─── Toast helper ──────────────────────────────────────────────────────────
  function _showToast(msg, color) {
    const el = _overlay && _overlay.querySelector('#nm-toast');
    if (!el) return;
    el.textContent = msg;
    el.style.color = color || '#ffffff';
    el.style.opacity = '1';
    clearTimeout(el._tid);
    el._tid = setTimeout(() => { el.style.opacity = '0'; }, 2800);
  }

  // ─── Info panel ────────────────────────────────────────────────────────────
  function _updateInfoPanel(node) {
    if (!_overlay) return;
    const desc = _overlay.querySelector('#nm-node-desc');
    if (desc) desc.textContent = node ? node.description : '';
    const title = _overlay.querySelector('#nm-node-title');
    if (title) title.textContent = node ? node.label.replace(/\n/g, ' ') : '';
    const btn = _overlay.querySelector('#nm-unlock-btn');
    if (btn && node) {
      if (node.isStart || node.id === 'parasite') {
        btn.style.display = 'none';
      } else {
        btn.style.display = '';
        btn.dataset.nodeId = node.id;
        const unlocked = _isUnlocked(node.id);
        const costLabel = node.isMinor
          ? ('[ UNLOCK — ' + node.cost + ' ✈️ CREDITS ]')
          : ('[ UNLOCK — ' + node.cost + ' ⚡ ]');
        btn.textContent = unlocked ? '[ UNLOCKED ]' : costLabel;
        btn.style.opacity = unlocked ? '0.5' : '1';
        btn.disabled = !!unlocked;
      }
    }
  }

  function _updateEssenceDisplay() {
    if (!_overlay) return;
    const el = _overlay.querySelector('#nm-essence-count');
    const cred = saveData && saveData.neural1945 ? (saveData.neural1945.credits || 0) : 0;
    if (el) el.textContent = '⚡ ' + (saveData ? (saveData.astralEssence || 0) : 0)
      + '   🔷 ' + (saveData ? (saveData.neuralCores || 0) : 0)
      + '   ✈️ ' + cred;
  }

  // ─── Build UI ──────────────────────────────────────────────────────────────
  function _buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'neural-matrix-overlay';
    overlay.className = 'nm-overlay';

    // Header
    const header = document.createElement('div');
    header.className = 'nm-header';
    header.innerHTML = `
      <span class="nm-title">THE NEURAL MATRIX</span>
      <span id="nm-essence-count" class="nm-currency">⚡ 0</span>
      <button class="nm-close-btn" id="nm-close">✕</button>`;
    overlay.appendChild(header);

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'nm-canvas';
    canvas.className = 'nm-canvas';
    overlay.appendChild(canvas);
    _canvas = canvas;

    // Resize canvas
    const resize = () => {
      const W = Math.min(window.innerWidth, 900);
      const H = Math.min(window.innerHeight * 0.65, 540);
      canvas.width  = W;
      canvas.height = H;
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
    };
    resize();

    // Info panel
    const info = document.createElement('div');
    info.className = 'nm-info-panel';
    info.innerHTML = `
      <div id="nm-node-title" class="nm-node-title">Select a node</div>
      <div id="nm-node-desc"  class="nm-node-desc">Click on any node to view details and unlock it.</div>
      <button id="nm-unlock-btn" class="nm-unlock-btn" style="display:none">[ UNLOCK ]</button>
      <button id="nm-reroute-btn" class="nm-reroute-btn">[ RE-ROUTE AROUND PARASITE — 1 🔷 ]</button>
      <button id="nm-1945-btn" class="nm-1945-btn" style="background: linear-gradient(135deg, #ff8800 0%, #ff4400 100%); border: 2px solid #ffaa00; margin-top: 10px;">[ ✈️ PLAY 1945 STRIKER ]</button>
      <div id="nm-toast" class="nm-toast"></div>`;
    overlay.appendChild(info);

    document.body.appendChild(overlay);
    _overlay = overlay;
    _ctx = canvas.getContext('2d');

    // Events
    document.getElementById('nm-close').addEventListener('click', hide);

    canvas.addEventListener('click', e => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const node = _getNodeAt(px, py);
      // Check hidden star hotspots on every canvas click
      _checkStarHotspot(px / _canvas.width, py / _canvas.height);
      if (node) {
        if (node.id === 'parasite') {
          _showToast('Parasite Node — click RE-ROUTE to isolate it!', '#ff4455');
          _updateInfoPanel(node);
        } else {
          _updateInfoPanel(node);
          _tryUnlock(node.id);
        }
      }
    });

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const node = _getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
      canvas.style.cursor = node ? 'pointer' : 'default';
    });

    document.getElementById('nm-unlock-btn').addEventListener('click', () => {
      const btn = document.getElementById('nm-unlock-btn');
      const nodeId = btn && btn.dataset.nodeId;
      if (nodeId) _tryUnlock(nodeId);
    });

    document.getElementById('nm-reroute-btn').addEventListener('click', _rerouteAroundParasite);

    // 1945 game button
    document.getElementById('nm-1945-btn').addEventListener('click', () => {
      if (window.Neural1945 && typeof window.Neural1945.open === 'function') {
        hide(); // Close Neural Matrix
        window.Neural1945.open();
      }
    });

    // Hide reroute btn if parasite not active
    const rBtn = document.getElementById('nm-reroute-btn');
    if (rBtn) rBtn.style.display = _isParasiteActive() ? '' : 'none';

    _updateEssenceDisplay();
  }

  // ─── Public API ────────────────────────────────────────────────────────────
  function show() {
    const existing = document.getElementById('neural-matrix-overlay');
    if (existing) existing.remove();

    // Randomly activate parasite if not yet seen
    if (saveData && saveData.neuralMatrix && !saveData.neuralMatrix.parasiteSeenThisSession) {
      saveData.neuralMatrix.parasiteSeenThisSession = true;
      // 60% chance parasite appears each session
      if (Math.random() < 0.6) {
        saveData.neuralMatrix.parasiteActive = true;
      } else {
        saveData.neuralMatrix.parasiteActive = false;
      }
    }

    _buildOverlay();
    _canvas.focus && _canvas.focus();
    _animFrame = requestAnimationFrame(_render);
  }

  function hide() {
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
    const el = document.getElementById('neural-matrix-overlay');
    if (el) el.remove();
    _overlay = null;
    _canvas  = null;
    _ctx     = null;
  }

  // Apply all unlocked Neural Matrix effects to playerStats at run start.
  // Called from game-screens.js / init (game start) area.
  function applyToRun(pStats) {
    // Always reset flags first so stale values from a previous run cannot
    // persist (e.g. Annunaki Protocol active after save data is cleared).
    window._nmAnnunakiActive    = false;
    window._nmEventHorizon      = false;
    window._nmBloodAlchemy      = false;
    window._nmKineticMirror     = false;
    window._nmPathInfected      = false;
    window._nmForbiddenProtocol = false;
    window._nmStatBonuses       = { atk: 0, spd: 0, sleepRegen: 0, sleepGold: 0 };

    if (!saveData || !saveData.neuralMatrix) return;
    const nm = saveData.neuralMatrix;

    // Annunaki Protocol: mark flag — handled in game-loop and player-class
    window._nmAnnunakiActive  = !!(nm.annunakiProtocol);
    window._nmEventHorizon    = !!(nm.eventHorizon);
    window._nmBloodAlchemy    = !!(nm.bloodAlchemy);
    window._nmKineticMirror   = !!(nm.kineticMirror);
    window._nmPathInfected    = _isPathInfected();

    // Forbidden Protocol: restore flag and spawn Source Glitches this run
    window._nmForbiddenProtocol = !!(nm.forbiddenProtocol);

    // Minor stat bonuses from 1945-credit nodes
    if (nm._statBonuses) {
      window._nmStatBonuses = Object.assign({}, nm._statBonuses);
    }

    if (pStats) {
      if (window._nmAnnunakiActive) {
        // Mark as active so player-class can switch material
        pStats._annunakiActive = true;
        // Double all damage output
        pStats.damage = (pStats.damage || 1) * 2;
      }
      // Apply per-ATK and per-SPD minor node bonuses (5% per ATK stack, 3% per SPD stack)
      const _sb = window._nmStatBonuses;
      if (_sb.atk > 0 && pStats.damage) {
        pStats.damage = pStats.damage * (1 + _sb.atk * 0.05);
      }
      if (_sb.spd > 0 && pStats.speed !== undefined) {
        pStats.speed = (pStats.speed || 1) * (1 + _sb.spd * 0.03);
      }
      // Sleep regen: restore HP before the run starts
      if (_sb.sleepRegen > 0 && pStats.maxHp) {
        pStats.hp = Math.min(pStats.maxHp, (pStats.hp || pStats.maxHp) + Math.floor(pStats.maxHp * 0.10 * _sb.sleepRegen));
      }
    }
  }

  // Called after a run ends to apply AIDA gold drain if path is infected.
  // Also applies sleep gold bonus.
  function onRunEnd() {
    if (!saveData || !saveData.neuralMatrix) return;
    if (_isPathInfected()) {
      const drain = Math.floor((saveData.gold || 0) * 0.10);
      if (drain > 0) {
        saveData.gold = Math.max(0, (saveData.gold || 0) - drain);
        // Notify player
        setTimeout(() => {
          if (typeof window.showNarratorLine === 'function') {
            window.showNarratorLine(
              'AIDA: "Parasite tax collected. −' + drain + ' gold. Re-route your path."',
              4000
            );
          }
        }, 3500);
      }
    }
    // Sleep Gold bonus: add 5% of current gold per stack while idle
    const _sb = window._nmStatBonuses || {};
    if (_sb.sleepGold > 0 && saveData.gold > 0) {
      const bonus = Math.floor(saveData.gold * 0.05 * _sb.sleepGold);
      if (bonus > 0) {
        saveData.gold += bonus;
        setTimeout(() => {
          if (typeof window.showNarratorLine === 'function') {
            window.showNarratorLine('AIDA: "Passive income protocol active. +' + bonus + ' gold."', 3000);
          }
        }, 2000);
      }
    }
    // Reset per-session parasite state so it re-evaluates next session
    if (saveData.neuralMatrix) saveData.neuralMatrix.parasiteSeenThisSession = false;
  }

  return { show, hide, applyToRun, onRunEnd, isUnlocked: _isUnlocked };
})();
