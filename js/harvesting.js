// ============================================================
// HARVESTING & RESOURCE SYSTEM
// Exposes window.GameHarvesting for use by main.js
// ============================================================
(function () {
  'use strict';

  // ── Resource catalogue ──────────────────────────────────────
  const RESOURCE_TYPES = {
    wood:         { label: 'Wood',         icon: '🪵', color: '#8B4513' },
    stone:        { label: 'Stone',        icon: '🪨', color: '#888888' },
    coal:         { label: 'Coal',         icon: '🖤', color: '#222222' },
    iron:         { label: 'Iron',         icon: '⚙️', color: '#AAAAAA' },
    crystal:      { label: 'Crystal',      icon: '💎', color: '#88CCFF' },
    magicEssence: { label: 'Magic Essence',icon: '✨', color: '#AA44FF' },
    gem:          { label: 'Gem',          icon: '💍', color: '#FFD700' },
    flesh:        { label: 'Flesh',        icon: '🩸', color: '#CC2200' }
  };

  // ── Harvesting tool definitions ─────────────────────────────
  const TOOL_DEFS = {
    axe: {
      id: 'axe', name: 'Axe', icon: '🪓',
      targets: ['tree'],            // node types this tool works on
      yields: 'wood',
      amountMin: 2, amountMax: 5,
      buyCost: 150,                 // gold cost in the Store
      epicBuyCost: 800,
      epicForgeReq: { wood: 20, iron: 5 },
      swingDurationMs: 600
    },
    sledgehammer: {
      id: 'sledgehammer', name: 'Sledgehammer', icon: '🔨',
      targets: ['rock'],
      yields: 'stone',
      amountMin: 2, amountMax: 4,
      buyCost: 200,
      epicBuyCost: 1000,
      epicForgeReq: { stone: 20, iron: 10 },
      swingDurationMs: 800
    },
    pickaxe: {
      id: 'pickaxe', name: 'Pickaxe', icon: '⛏️',
      targets: ['coal', 'iron'],
      yields: null,                 // yield determined by node type
      amountMin: 1, amountMax: 3,
      buyCost: 250,
      epicBuyCost: 1200,
      epicForgeReq: { coal: 15, iron: 15 },
      swingDurationMs: 700
    },
    magicTool: {
      id: 'magicTool', name: 'Essence Rod', icon: '🔮',
      targets: ['crystal', 'magic'],
      yields: null,                 // node determines actual yield
      amountMin: 1, amountMax: 2,
      buyCost: 500,
      epicBuyCost: 2000,
      epicForgeReq: { crystal: 10, magicEssence: 5 },
      swingDurationMs: 500
    }
  };

  // ── Node visual descriptors (populated during init when THREE is available) ─
  const NODE_DEFS = {
    tree: {
      label: 'Tree',         color: 0x2D6A2D, radius: 1.0,
      hp: 60,                yield: 'wood',
      toolRequired: 'axe'
    },
    rock: {
      label: 'Rock',         color: 0x808080, radius: 1.8,
      hp: 80,                yield: 'stone',
      toolRequired: 'sledgehammer'
    },
    coal: {
      label: 'Coal Vein',    color: 0x222222, radius: 1.6,
      hp: 60,                yield: 'coal',
      toolRequired: 'pickaxe'
    },
    iron: {
      label: 'Iron Deposit', color: 0xC0C0C0, radius: 1.7,
      hp: 100,               yield: 'iron',
      toolRequired: 'pickaxe'
    },
    crystal: {
      label: 'Crystal',      color: 0x66BBFF, radius: 1.4,
      hp: 40,                yield: 'crystal',
      toolRequired: 'magicTool'
    },
    magic: {
      label: 'Magic Node',   color: 0x8833FF, radius: 1.5,
      hp: 50,                yield: 'magicEssence',
      toolRequired: 'magicTool'
    }
  };

  // ── Module state ─────────────────────────────────────────────
  let _scene = null;
  let _saveData = null;
  let _spawnParticlesFn = null;

  const harvestNodes = [];          // active resource nodes in the world
  const HARVEST_RANGE = 3.0;       // distance in world-units to trigger harvest
  const HARVEST_COOLDOWN_MS = 1500; // ms between harvest ticks per node

  // Active swing animation state
  let _swingAnim = null; // { toolId, endTime, nodeRef }

  // Floating text pool (lightweight HTML elements)
  const _floatingTexts = [];

  // ── Internal helpers ─────────────────────────────────────────

  function _getResources() {
    if (!_saveData) return null;
    if (!_saveData.resources) {
      _saveData.resources = {
        wood: 0, stone: 0, coal: 0, iron: 0,
        crystal: 0, magicEssence: 0, gem: 0, flesh: 0
      };
    }
    return _saveData.resources;
  }

  function _getTools() {
    if (!_saveData) return null;
    if (!_saveData.harvestingTools) {
      _saveData.harvestingTools = {
        axe: false, sledgehammer: false, pickaxe: false, magicTool: false,
        epicAxe: false, epicSledgehammer: false, epicPickaxe: false, epicMagicTool: false
      };
    }
    return _saveData.harvestingTools;
  }

  function _hasTool(toolId) {
    const tools = _getTools();
    return tools && (tools[toolId] || tools['epic' + toolId.charAt(0).toUpperCase() + toolId.slice(1)]);
  }

  function _getToolForNode(nodeType) {
    const def = NODE_DEFS[nodeType];
    return def ? def.toolRequired : null;
  }

  // ── Build 3-D mesh for a resource node ──────────────────────
  function _buildNodeMesh(nodeType, pos) {
    const THREE = window.THREE;
    if (!THREE) return null;
    const def = NODE_DEFS[nodeType];
    if (!def) return null;

    let mesh;
    if (nodeType === 'tree') {
      // Simple cartoon tree: trunk + canopy
      const group = new THREE.Group();
      const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 1.4, 7);
      const trunkMat = new THREE.MeshToonMaterial({ color: 0x5C3A1E });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.7;
      trunk.castShadow = true;
      group.add(trunk);
      // Canopy layers
      const canopyColors = [0x2D6A2D, 0x3A8A3A, 0x246824];
      const sizes = [[1.4, 1.1], [1.1, 0.9], [0.75, 0.7]];
      sizes.forEach(([r, h], i) => {
        const cGeo = new THREE.ConeGeometry(r, h + 0.3, 7);
        const cMat = new THREE.MeshToonMaterial({ color: canopyColors[i] });
        const canopy = new THREE.Mesh(cGeo, cMat);
        canopy.position.y = 1.4 + i * 0.65;
        canopy.castShadow = true;
        group.add(canopy);
      });
      mesh = group;
    } else if (nodeType === 'rock' || nodeType === 'iron') {
      // Irregular rock shape
      const geo = new THREE.DodecahedronGeometry(def.radius * 0.9, 0);
      const mat = new THREE.MeshToonMaterial({ color: def.color });
      mesh = new THREE.Mesh(geo, mat);
      mesh.scale.y = 0.65;
    } else if (nodeType === 'coal') {
      const geo = new THREE.DodecahedronGeometry(def.radius * 0.85, 0);
      const mat = new THREE.MeshToonMaterial({ color: def.color });
      mesh = new THREE.Mesh(geo, mat);
      mesh.scale.y = 0.55;
    } else if (nodeType === 'crystal') {
      // Tall crystal cluster
      const group = new THREE.Group();
      const mat = new THREE.MeshToonMaterial({ color: def.color, transparent: true, opacity: 0.85 });
      for (let i = 0; i < 3; i++) {
        const h = 1.5 + Math.random() * 1.5;
        const r = 0.25 + Math.random() * 0.2;
        const geo = new THREE.ConeGeometry(r, h, 5);
        const spike = new THREE.Mesh(geo, mat.clone());
        spike.position.set(
          (Math.random() - 0.5) * 1.2,
          h / 2,
          (Math.random() - 0.5) * 1.2
        );
        spike.rotation.z = (Math.random() - 0.5) * 0.5;
        group.add(spike);
      }
      mesh = group;
    } else if (nodeType === 'magic') {
      // Floating orb with glow
      const geo = new THREE.SphereGeometry(def.radius * 0.7, 10, 10);
      const mat = new THREE.MeshToonMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.4 });
      mesh = new THREE.Mesh(geo, mat);
    }

    if (!mesh) return null;
    mesh.position.copy(pos);
    mesh.castShadow = true;
    _scene.add(mesh);
    return mesh;
  }

  // ── Spawn resource node ──────────────────────────────────────
  function _spawnNode(nodeType, x, z) {
    const THREE = window.THREE;
    if (!THREE || !_scene) return;
    const pos = new THREE.Vector3(x, 0, z);
    const mesh = _buildNodeMesh(nodeType, pos);
    if (!mesh) return;
    const def = NODE_DEFS[nodeType];
    harvestNodes.push({
      type: nodeType,
      mesh,
      hp: def.hp,
      maxHp: def.hp,
      depleted: false,
      _lastHarvestTime: 0,
      _wobbleTime: 0,
      _wobbleDir: { x: 1, z: 0 }
    });
  }

  // ── World population ─────────────────────────────────────────
  function populateWorld() {
    const rng = () => (Math.random() - 0.5) * 220;
    const avoid = (x, z) => Math.abs(x) < 18 && Math.abs(z) < 18; // near player start

    // Trees — 35 nodes scattered around
    for (let i = 0; i < 35; i++) {
      const x = rng(), z = rng();
      if (avoid(x, z)) continue;
      _spawnNode('tree', x, z);
    }
    // Rocky outcrops — 40 nodes
    for (let i = 0; i < 40; i++) {
      const x = rng(), z = rng();
      if (avoid(x, z)) continue;
      _spawnNode('rock', x, z);
    }
    // Coal veins — 25 nodes (clustered around mine area)
    for (let i = 0; i < 25; i++) {
      const x = -50 + (Math.random() - 0.5) * 80;
      const z = 30 + (Math.random() - 0.5) * 80;
      if (avoid(x, z)) continue;
      _spawnNode('coal', x, z);
    }
    // Iron deposits — 20 nodes
    for (let i = 0; i < 20; i++) {
      const x = 60 + (Math.random() - 0.5) * 60;
      const z = -60 + (Math.random() - 0.5) * 60;
      if (avoid(x, z)) continue;
      _spawnNode('iron', x, z);
    }
    // Crystal formations — 15 nodes
    for (let i = 0; i < 15; i++) {
      const x = rng(), z = rng();
      if (avoid(x, z)) continue;
      _spawnNode('crystal', x, z);
    }
    // Magic structures — 8 nodes
    for (let i = 0; i < 8; i++) {
      const x = rng(), z = rng();
      if (avoid(x, z)) continue;
      _spawnNode('magic', x, z);
    }
  }

  // ── Harvesting logic ─────────────────────────────────────────
  function _tryHarvest(node, playerPos, now) {
    if (node.depleted) return;
    const dx = playerPos.x - node.mesh.position.x;
    const dz = playerPos.z - node.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > HARVEST_RANGE) return;

    const requiredTool = _getToolForNode(node.type);
    if (!_hasTool(requiredTool)) {
      // Show "need tool" hint once per approach
      if (!node._shownNoToolHint || (now - node._shownNoToolHint) > 5000) {
        node._shownNoToolHint = now;
        const toolDef = TOOL_DEFS[requiredTool];
        _showFloatingText(
          node.mesh.position,
          `Need ${toolDef ? toolDef.icon + ' ' + toolDef.name : 'tool'}`,
          '#FFD700'
        );
      }
      return;
    }

    if (now - node._lastHarvestTime < HARVEST_COOLDOWN_MS) return;
    node._lastHarvestTime = now;

    // Start swing animation
    const toolDef = TOOL_DEFS[requiredTool];
    _swingAnim = { toolId: requiredTool, endTime: now + (toolDef ? toolDef.swingDurationMs : 600), nodeRef: node };

    // Apply damage to node
    const dmg = 20;
    node.hp -= dmg;
    node._wobbleTime = 0.6;
    node._wobbleDir = { x: dx / (dist + 0.001), z: dz / (dist + 0.001) };

    // Particles
    if (_spawnParticlesFn) {
      const nodeDef = NODE_DEFS[node.type];
      _spawnParticlesFn(node.mesh.position, nodeDef ? nodeDef.color : 0x888888, 8);
    }

    if (node.hp <= 0) {
      _depleteNode(node, requiredTool);
    }
  }

  function _depleteNode(node, toolId) {
    node.depleted = true;

    const nodeDef = NODE_DEFS[node.type];
    const toolDef = TOOL_DEFS[toolId] || {};
    const yieldRes = nodeDef ? nodeDef.yield : 'stone';

    // Work out amount based on tool rarity
    const tools = _getTools();
    const epicKey = 'epic' + toolId.charAt(0).toUpperCase() + toolId.slice(1);
    const isEpic = tools && tools[epicKey];
    const baseMin = toolDef.amountMin || 1;
    const baseMax = toolDef.amountMax || 3;
    const mult = isEpic ? 2.5 : 1;
    const amount = Math.round((baseMin + Math.random() * (baseMax - baseMin)) * mult);

    // Grant resources
    const res = _getResources();
    if (res && yieldRes) {
      res[yieldRes] = (res[yieldRes] || 0) + amount;
    }

    // Visual & audio feedback
    if (_spawnParticlesFn) {
      _spawnParticlesFn(node.mesh.position, nodeDef ? nodeDef.color : 0x888888, 20);
    }
    _showFloatingText(
      node.mesh.position,
      `+${amount} ${RESOURCE_TYPES[yieldRes] ? RESOURCE_TYPES[yieldRes].icon + ' ' + RESOURCE_TYPES[yieldRes].label : yieldRes}`,
      RESOURCE_TYPES[yieldRes] ? RESOURCE_TYPES[yieldRes].color : '#FFFFFF'
    );

    // Collapse animation — scale to 0 over ~0.5s then hide
    node._collapseStart = Date.now();
    node._collapseFrom = node.mesh.scale.clone ? node.mesh.scale.clone() : { x: 1, y: 1, z: 1 };

    // Update HUD
    _updateHUD();

    // Fire quest progress hooks
    if (window.GameHarvesting && window.GameHarvesting._onHarvest) {
      window.GameHarvesting._onHarvest(yieldRes, amount);
    }
  }

  // ── Enemy flesh drop ─────────────────────────────────────────
  function onEnemyKilled(enemyPos) {
    if (Math.random() < 0.25) {   // 25% chance
      const res = _getResources();
      if (res) {
        res.flesh = (res.flesh || 0) + 1;
        _showFloatingText(enemyPos, '+1 🩸 Flesh', '#CC2200');
        _updateHUD();
      }
    }
  }

  // ── Floating text helper ─────────────────────────────────────
  function _showFloatingText(worldPos, text, color) {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:absolute', 'pointer-events:none', 'z-index:200',
      `color:${color || '#FFF'}`, 'font-size:16px', 'font-weight:bold',
      'text-shadow:0 1px 4px #000', 'transition:none',
      'white-space:nowrap', 'font-family:"Bangers",cursive', 'letter-spacing:1px'
    ].join(';');
    el.textContent = text;
    document.getElementById('game-container')?.appendChild(el) || document.body.appendChild(el);

    // Project 3D pos to screen (requires camera on window)
    const cam = window._gameCamera;
    if (cam && worldPos && window.THREE) {
      const v = new window.THREE.Vector3(worldPos.x, (worldPos.y || 0) + 2.5, worldPos.z);
      v.project(cam);
      const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-(v.y * 0.5) + 0.5) * window.innerHeight;
      el.style.left = sx + 'px';
      el.style.top = sy + 'px';
    } else {
      el.style.left = '50%';
      el.style.top = '40%';
    }

    _floatingTexts.push({ el, startTime: Date.now(), duration: 1800 });
  }

  // ── HUD helpers ───────────────────────────────────────────────
  function _buildHUD() {
    if (document.getElementById('harvest-hud')) return;
    const hud = document.createElement('div');
    hud.id = 'harvest-hud';
    hud.className = 'harvest-hud';
    document.body.appendChild(hud);
    _updateHUD();
  }

  // Building material resource keys shown in camp HUD
  const BUILD_MATERIAL_KEYS = ['wood', 'stone', 'coal'];

  function _updateHUD() {
    const hud = document.getElementById('harvest-hud');
    if (!hud) return;
    const res = _getResources();
    if (!res) { hud.innerHTML = ''; return; }

    // In camp mode: always show building materials (wood/stone/coal) even at 0
    const isCamp = hud.classList.contains('camp-mode');
    const entries = Object.entries(RESOURCE_TYPES)
      .filter(([k]) => k !== 'flesh' && (res[k] > 0 || (isCamp && BUILD_MATERIAL_KEYS.includes(k))))
      .map(([k, v]) => `<span class="harvest-res-item"><span class="harvest-res-icon">${v.icon}</span><span class="harvest-res-count">x${(res[k] || 0)}</span></span>`)
      .join('');
    hud.innerHTML = entries || '';
    hud.style.display = entries ? 'flex' : 'none';
  }

  // ── Tool-swing HUD overlay (brief visual on-screen when harvesting) ──
  function _drawSwingOverlay() {
    let el = document.getElementById('harvest-swing-overlay');
    if (_swingAnim && Date.now() < _swingAnim.endTime) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'harvest-swing-overlay';
        el.className = 'harvest-swing-overlay';
        document.body.appendChild(el);
      }
      const tool = TOOL_DEFS[_swingAnim.toolId];
      el.textContent = tool ? tool.icon : '⛏️';
      el.style.display = 'block';
      // Animate rotation — cache swingDurationMs to avoid repeated property lookup
      const swingDuration = tool ? tool.swingDurationMs : 600;
      const pct = 1 - ((_swingAnim.endTime - Date.now()) / swingDuration);
      el.style.transform = `translate(-50%,-50%) rotate(${pct * -90}deg) scale(${1 + pct * 0.5})`;
    } else if (el) {
      el.style.display = 'none';
      if (_swingAnim && Date.now() >= _swingAnim.endTime) _swingAnim = null;
    }
  }

  // ── Per-frame update ─────────────────────────────────────────
  function update(dt, playerPos, now) {
    if (!playerPos) return;
    now = now || Date.now();

    // Animate wobble on nodes
    for (const node of harvestNodes) {
      if (node.depleted) {
        // Collapse animation
        if (node._collapseStart !== undefined) {
          const elapsed = (Date.now() - node._collapseStart) / 400;
          const s = Math.max(0, 1 - elapsed);
          if (node.mesh.scale && typeof node.mesh.scale.setScalar === 'function') {
            node.mesh.scale.setScalar(s);
          }
          if (s <= 0) {
            node.mesh.visible = false;
            delete node._collapseStart;
          }
        }
        continue;
      }

      if (node._wobbleTime > 0) {
        node._wobbleTime -= dt;
        const w = Math.sin(node._wobbleTime * 20) * node._wobbleTime * 0.25;
        node.mesh.rotation.x = node._wobbleDir.x * w;
        node.mesh.rotation.z = node._wobbleDir.z * w;
        if (node._wobbleTime <= 0) {
          node.mesh.rotation.x = 0;
          node.mesh.rotation.z = 0;
        }
      }

      // Slight idle bob for magic / crystal nodes
      if (node.type === 'magic' || node.type === 'crystal') {
        node.mesh.rotation.y = (node.mesh.rotation.y || 0) + dt * 0.8;
        node.mesh.position.y = 0.3 + Math.sin(now * 0.001 + node.mesh.position.x) * 0.15;
      }

      // Try harvesting if player is nearby
      _tryHarvest(node, playerPos, now);
    }

    // Update floating texts
    for (let i = _floatingTexts.length - 1; i >= 0; i--) {
      const ft = _floatingTexts[i];
      const age = Date.now() - ft.startTime;
      const frac = age / ft.duration;
      if (frac >= 1) {
        ft.el.remove();
        _floatingTexts.splice(i, 1);
        continue;
      }
      ft.el.style.opacity = String(1 - frac * frac);
      ft.el.style.transform = `translateY(${-frac * 40}px)`;
    }

    _drawSwingOverlay();
  }

  // ── Store helpers (called from camp UI) ─────────────────────
  function buyTool(toolId) {
    const def = TOOL_DEFS[toolId];
    if (!def) return false;
    const tools = _getTools();
    if (!tools || tools[toolId]) return false; // already owned
    const saveData = _saveData;
    if (!saveData) return false;
    if (saveData.gold < def.buyCost) return false;
    saveData.gold -= def.buyCost;
    tools[toolId] = true;
    _updateHUD();
    return true;
  }

  function forgeTool(toolId) {
    const def = TOOL_DEFS[toolId];
    if (!def || !def.epicForgeReq) return false;
    const tools = _getTools();
    const epicKey = 'epic' + toolId.charAt(0).toUpperCase() + toolId.slice(1);
    if (!tools || !tools[toolId] || tools[epicKey]) return false; // need base, not yet epic
    const res = _getResources();
    if (!res) return false;
    // Check requirements
    for (const [mat, qty] of Object.entries(def.epicForgeReq)) {
      if ((res[mat] || 0) < qty) return false;
    }
    // Consume resources
    for (const [mat, qty] of Object.entries(def.epicForgeReq)) {
      res[mat] -= qty;
    }
    tools[epicKey] = true;
    _updateHUD();
    return true;
  }

  function getToolList() {
    return Object.values(TOOL_DEFS);
  }

  function hasOwnedTools() {
    const t = _getTools();
    if (!t) return false;
    return Object.values(TOOL_DEFS).some(d => t[d.id]);
  }

  // ── Public API ────────────────────────────────────────────────
  window.GameHarvesting = {
    RESOURCE_TYPES,
    TOOL_DEFS,
    NODE_DEFS,
    harvestNodes,

    init(scene, saveData, spawnParticlesFn) {
      _scene = scene;
      _saveData = saveData;
      _spawnParticlesFn = spawnParticlesFn;
      // Ensure save-data fields exist
      _getResources();
      _getTools();
      // Build HUD
      _buildHUD();
      // Populate world with resource nodes
      populateWorld();
    },

    update,
    onEnemyKilled,
    buyTool,
    forgeTool,
    getToolList,
    hasOwnedTools,

    getResources() { return _getResources(); },
    getTools()    { return _getTools(); },

    // Called when a resource is harvested (hook for quest system)
    _onHarvest: null,

    refreshHUD() { _updateHUD(); },

    // Call from camp to build/show the resource HUD in camp mode (shows 0-count materials)
    showCampHUD(saveData) {
      if (saveData) _saveData = saveData;
      _getResources();
      _buildHUD();
      const hud = document.getElementById('harvest-hud');
      if (hud) {
        hud.classList.add('camp-mode');
        _updateHUD();
      }
    },

    // Remove camp mode from HUD (revert to game mode)
    hideCampHUD() {
      const hud = document.getElementById('harvest-hud');
      if (hud) {
        hud.classList.remove('camp-mode');
        _updateHUD();
      }
    }
  };
}());
