// ============================================================
// camp-world.js  —  3D Playable Camp Hub World
// ============================================================
// A fully playable Three.js scene that replaces the static 2D
// Camp Menu.  The player spawns here after every death, walks
// around the cosy campfire hub and physically visits buildings
// to open their existing 2D UI panels.
//
// Architecture
// ─────────────
//  • Regular script (not ES-module) – THREE via window.THREE
//  • Uses the SAME WebGLRenderer as the main game (no 2nd ctx)
//  • Exposes  window.CampWorld  for main.js integration
// ============================================================

(function () {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // Constants
  // ──────────────────────────────────────────────────────────
  const SPAWN_POS = { x: 0, z: 3 };           // where player spawns (near fire)
  const PLAYER_SPEED = 7.0;                    // units per second
  const PLAYER_RADIUS = 0.55;
  const INTERACTION_RADIUS = 3.5;             // proximity to trigger interact

  // Building layout (id → world position + label)
  const BUILDING_DEFS = [
    { id: 'questMission',       x:  0,  z: 12,  label: 'Quest Hall',       icon: '📜' },
    { id: 'skillTree',          x: -13, z: -9,  label: 'Skill Tree',       icon: '🌳' },
    { id: 'forge',              x:  13, z: -9,  label: 'The Forge',        icon: '⚒️' },
    { id: 'companionHouse',     x: -13, z:  5,  label: 'Companion Home',   icon: '🏡' },
    { id: 'trainingHall',       x:  13, z:  5,  label: 'Training Hall',    icon: '🏋️' },
    { id: 'achievementBuilding',x:   0, z:-15,  label: 'Hall of Trophies', icon: '🏆' },
    { id: 'armory',             x: -9,  z:-13,  label: 'Armory',           icon: '⚔️' },
    { id: 'inventory',          x:  9,  z:-13,  label: 'Inventory',        icon: '📦' },
  ];

  // ──────────────────────────────────────────────────────────
  // Module-level state
  // ──────────────────────────────────────────────────────────
  let _campScene   = null;
  let _campCamera  = null;
  let _renderer    = null;       // shared renderer from main.js
  let _callbacks   = {};         // { buildingId → fn() } set by main.js
  let _saveData    = null;

  let _playerMesh  = null;
  let _playerVel   = { x: 0, z: 0 };
  let _playerPos   = { x: SPAWN_POS.x, z: SPAWN_POS.z };

  let _campTime    = 0;
  let _isActive    = false;

  // Campfire light + flame for flickering
  let _fireLight   = null;
  let _flameMeshes = [];

  // Spark / ember particle system
  let _sparkSystem   = null;
  let _sparkPositions = null;
  let _sparkVelocities = [];
  let _sparkLifetimes = [];
  const SPARK_COUNT   = 120;

  // Floating dust / atmosphere particles
  let _dustSystem    = null;
  let _dustPositions = null;
  let _dustVelocities = [];
  let _dustLifetimes  = [];
  const DUST_COUNT    = 80;

  // Building mesh registry { id → THREE.Group }
  let _buildingMeshes = {};

  // Interaction state
  let _nearBuilding  = null;   // id of nearest building (if within radius)
  let _promptEl      = null;   // the DOM prompt element
  let _interactBtn   = null;   // mobile interact button

  // Keyboard state (managed inside this module)
  let _keys = {};

  // Touch movement (own system, independent from game's joystick zone)
  // Activated only when camp is active.
  const _touch = {
    active: false,
    id: null,
    startX: 0,
    startY: 0,
    x: 0,       // normalised -1..1
    y: 0,
  };
  // Touch indicator DOM element (shown where the user touched)
  let _touchIndicator = null;

  // ──────────────────────────────────────────────────────────
  // Helper: safe THREE access (module loaded before main.js)
  // ──────────────────────────────────────────────────────────
  function T() { return window.THREE; }

  // ──────────────────────────────────────────────────────────
  // Scene construction
  // ──────────────────────────────────────────────────────────
  function _buildScene() {
    const THREE = T();
    _campScene = new THREE.Scene();
    _campScene.background = new THREE.Color(0x0a0c18); // deep night sky
    _campScene.fog = new THREE.FogExp2(0x120e08, 0.025); // warm hearth fog

    // ── Lighting ────────────────────────────────────────────
    // Very dim cool ambient – sky light
    const ambient = new THREE.AmbientLight(0x1a2040, 0.45);
    _campScene.add(ambient);

    // Distant cool moonlight
    const moonLight = new THREE.DirectionalLight(0x4060a0, 0.4);
    moonLight.position.set(-30, 60, -20);
    moonLight.castShadow = false;
    _campScene.add(moonLight);

    // Warm campfire point light (flickers each frame)
    _fireLight = new THREE.PointLight(0xff7a20, 5.5, 28, 2);
    _fireLight.position.set(0, 2, 0);
    _fireLight.castShadow = true;
    _fireLight.shadow.mapSize.setScalar(512);
    _campScene.add(_fireLight);

    // Secondary warm fill light (softer, from below)
    const fillLight = new THREE.PointLight(0xff5510, 1.8, 14, 2);
    fillLight.position.set(0, 0.4, 0);
    _campScene.add(fillLight);

    // ── Ground ──────────────────────────────────────────────
    _buildGround();

    // ── Campfire ────────────────────────────────────────────
    _buildCampfire();

    // ── Stars ───────────────────────────────────────────────
    _buildStars();

    // ── Atmospheric particles ───────────────────────────────
    _buildSparkSystem();
    _buildDustSystem();

    // ── Surrounding trees / scenery ─────────────────────────
    _buildAmbientForest();

    // ── Buildings ───────────────────────────────────────────
    for (const def of BUILDING_DEFS) {
      const grp = _buildBuilding(def);
      grp.visible = false; // hidden until _refreshBuildings() called
      _buildingMeshes[def.id] = grp;
      _campScene.add(grp);
    }

    // ── Player character ─────────────────────────────────────
    _buildPlayer();

    // ── Camera ──────────────────────────────────────────────
    const aspect = window.innerWidth / window.innerHeight;
    _campCamera = new THREE.PerspectiveCamera(52, aspect, 0.1, 200);
    _updateCamera(0);
  }

  // ── Ground plane with dirt paths ────────────────────────
  function _buildGround() {
    const THREE = T();

    // Dark earthy ground
    const groundGeo  = new THREE.PlaneGeometry(100, 100, 30, 30);
    const groundMat  = new THREE.MeshLambertMaterial({ color: 0x1a1208 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    _campScene.add(ground);

    // Central dirt circle (around campfire)
    const dirtGeo = new THREE.CircleGeometry(6, 32);
    const dirtMat = new THREE.MeshLambertMaterial({ color: 0x3d2410 });
    const dirt = new THREE.Mesh(dirtGeo, dirtMat);
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.01;
    _campScene.add(dirt);

    // Stone ring around firepit
    const stoneRingGeo = new THREE.RingGeometry(0.9, 1.35, 16);
    const stoneMat = new THREE.MeshLambertMaterial({
      color: 0x888070, side: THREE.DoubleSide
    });
    const stoneRing = new THREE.Mesh(stoneRingGeo, stoneMat);
    stoneRing.rotation.x = -Math.PI / 2;
    stoneRing.position.y = 0.05;
    _campScene.add(stoneRing);

    // Individual stones on the ring
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = 1.1;
      const sGeo = new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.1, 0);
      const sMat = new THREE.MeshLambertMaterial({ color: 0x706858 });
      const s = new THREE.Mesh(sGeo, sMat);
      s.position.set(Math.sin(a) * r, 0.1, Math.cos(a) * r);
      s.rotation.set(Math.random(), Math.random(), Math.random());
      s.castShadow = true;
      _campScene.add(s);
    }

    // Dirt paths radiating to each building
    const pathMat = new THREE.MeshLambertMaterial({ color: 0x2e1c0e });
    for (const def of BUILDING_DEFS) {
      const dx = def.x;
      const dz = def.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dx, dz);
      const pathGeo = new THREE.PlaneGeometry(1.2, dist - 5);
      const path = new THREE.Mesh(pathGeo, pathMat);
      path.rotation.x = -Math.PI / 2;
      path.rotation.z = -angle;
      // midpoint between campfire and building
      path.position.set(dx * 0.5, 0.015, dz * 0.5);
      _campScene.add(path);
    }
  }

  // ── Campfire ─────────────────────────────────────────────
  function _buildCampfire() {
    const THREE = T();

    // Logs (two crossing cylinders)
    const logMat = new THREE.MeshLambertMaterial({ color: 0x3d2208 });
    for (let i = 0; i < 2; i++) {
      const logGeo = new THREE.CylinderGeometry(0.14, 0.18, 2.2, 8);
      const log = new THREE.Mesh(logGeo, logMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i * Math.PI) / 2;
      log.position.y = 0.14;
      log.castShadow = true;
      _campScene.add(log);
    }

    // Embers (flat circle glow)
    const emberGeo = new THREE.CircleGeometry(0.7, 16);
    const emberMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.7
    });
    const embers = new THREE.Mesh(emberGeo, emberMat);
    embers.rotation.x = -Math.PI / 2;
    embers.position.y = 0.08;
    _campScene.add(embers);

    // Fire flames (multiple cones, stored for flicker animation)
    const flameColors = [0xff7700, 0xff4400, 0xffdd00, 0xff9900];
    const flameSizes  = [
      [0.25, 1.6],
      [0.18, 1.9],
      [0.20, 1.4],
      [0.10, 1.1],
    ];
    flameColors.forEach((col, i) => {
      const [r, h] = flameSizes[i];
      const flameGeo = new THREE.ConeGeometry(r, h, 8, 1, true);
      const flameMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
      });
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(
        (Math.random() - 0.5) * 0.3,
        0.65 + h * 0.45,
        (Math.random() - 0.5) * 0.3
      );
      _flameMeshes.push(flame);
      _campScene.add(flame);
    });

    // A soft glow halo on ground
    const haloGeo = new THREE.CircleGeometry(4, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.08
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.02;
    _campScene.add(halo);
  }

  // ── Star field ───────────────────────────────────────────
  function _buildStars() {
    const THREE = T();
    const starCount = 600;
    const starGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 80 + Math.random() * 20;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.45; // upper hemisphere
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) + 10;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.35,
      transparent: true,
      opacity: 0.8
    });
    _campScene.add(new THREE.Points(starGeo, starMat));
  }

  // ── Spark / ember particle system ────────────────────────
  function _buildSparkSystem() {
    const THREE = T();
    const geo = new THREE.BufferGeometry();
    _sparkPositions = new Float32Array(SPARK_COUNT * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(_sparkPositions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffcc44,
      size: 0.18,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    _sparkSystem = new THREE.Points(geo, mat);
    _campScene.add(_sparkSystem);

    // Initialise all particles as "dead" (below ground)
    for (let i = 0; i < SPARK_COUNT; i++) {
      _sparkLifetimes.push(0);
      _sparkVelocities.push({ x: 0, y: 0, z: 0 });
      _sparkPositions[i * 3] = 0;
      _sparkPositions[i * 3 + 1] = -5;
      _sparkPositions[i * 3 + 2] = 0;
    }
  }

  // ── Atmospheric dust ─────────────────────────────────────
  function _buildDustSystem() {
    const THREE = T();
    const geo = new THREE.BufferGeometry();
    _dustPositions = new Float32Array(DUST_COUNT * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(_dustPositions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffa060,
      size: 0.09,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    _dustSystem = new THREE.Points(geo, mat);
    _campScene.add(_dustSystem);

    for (let i = 0; i < DUST_COUNT; i++) {
      _dustLifetimes.push(Math.random() * 4);
      _dustVelocities.push({
        x: (Math.random() - 0.5) * 0.4,
        y: 0.15 + Math.random() * 0.3,
        z: (Math.random() - 0.5) * 0.4
      });
      const r = Math.random() * 6;
      const a = Math.random() * Math.PI * 2;
      _dustPositions[i * 3]     = Math.sin(a) * r;
      _dustPositions[i * 3 + 1] = Math.random() * 4;
      _dustPositions[i * 3 + 2] = Math.cos(a) * r;
    }
  }

  // ── Ambient forest ring ──────────────────────────────────
  function _buildAmbientForest() {
    const THREE = T();
    const treeCount = 40;
    const treeColors = [0x1a4010, 0x143810, 0x0e2808, 0x224818];

    for (let i = 0; i < treeCount; i++) {
      const angle = (i / treeCount) * Math.PI * 2 + Math.random() * 0.3;
      const radius = 28 + Math.random() * 10;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      const scale = 0.7 + Math.random() * 1.1;

      const grp = new THREE.Group();
      grp.position.set(x, 0, z);

      // Trunk
      const trunkGeo = new THREE.CylinderGeometry(0.15 * scale, 0.22 * scale, 1.8 * scale, 6);
      const trunkMat = new THREE.MeshLambertMaterial({ color: 0x3d2208 });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.9 * scale;
      trunk.castShadow = true;
      grp.add(trunk);

      // Canopy (2 stacked cones)
      const col = treeColors[Math.floor(Math.random() * treeColors.length)];
      const canopyMat = new THREE.MeshLambertMaterial({ color: col });
      for (let c = 0; c < 2; c++) {
        const cr = (1.2 - c * 0.3) * scale;
        const ch = (1.6 - c * 0.3) * scale;
        const canopyGeo = new THREE.ConeGeometry(cr, ch, 7);
        const canopy = new THREE.Mesh(canopyGeo, canopyMat);
        canopy.position.y = (1.8 + c * 1.0) * scale;
        canopy.castShadow = true;
        grp.add(canopy);
      }
      _campScene.add(grp);
    }
  }

  // ── Player water-drop ────────────────────────────────────
  function _buildPlayer() {
    const THREE = T();
    const grp = new THREE.Group();

    // Body (squished sphere — like the game character)
    const bodyGeo = new THREE.SphereGeometry(PLAYER_RADIUS, 16, 12);
    bodyGeo.scale(1, 1.15, 1);
    const bodyMat = new THREE.MeshPhongMaterial({
      color: 0x29b6f6,
      emissive: 0x0d47a1,
      emissiveIntensity: 0.3,
      shininess: 90,
      transparent: true,
      opacity: 0.92
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    grp.add(body);

    // Shiny highlight
    const hlGeo = new THREE.SphereGeometry(PLAYER_RADIUS * 0.35, 8, 8);
    const hlMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.4
    });
    const hl = new THREE.Mesh(hlGeo, hlMat);
    hl.position.set(-0.18, 0.22, 0.22);
    grp.add(hl);

    // Ground shadow disc
    const shadowGeo = new THREE.CircleGeometry(0.4, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3
    });
    const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = -PLAYER_RADIUS + 0.02;
    grp.add(shadowDisc);

    grp.position.set(_playerPos.x, PLAYER_RADIUS, _playerPos.z);
    _playerMesh = grp;
    _campScene.add(grp);
  }

  // ──────────────────────────────────────────────────────────
  // Building construction helpers
  // ──────────────────────────────────────────────────────────

  function _buildBuilding(def) {
    switch (def.id) {
      case 'questMission':       return _buildQuestHall(def);
      case 'skillTree':          return _buildSkillTree(def);
      case 'forge':              return _buildForge(def);
      case 'companionHouse':     return _buildCompanionHouse(def);
      case 'trainingHall':       return _buildTrainingHall(def);
      case 'achievementBuilding':return _buildAchievementHall(def);
      case 'armory':             return _buildArmory(def);
      case 'inventory':          return _buildInventoryStorage(def);
      default:                   return _buildGenericBuilding(def);
    }
  }

  // Shared material helpers
  function _mat(color, emissive, eIntensity) {
    const THREE = T();
    return new THREE.MeshPhongMaterial({
      color,
      emissive: emissive || 0x000000,
      emissiveIntensity: eIntensity || 0
    });
  }
  function _lambert(color) {
    return new T().MeshLambertMaterial({ color });
  }

  // ── Quest Hall ─ rustic log cabin with quest board ───────
  function _buildQuestHall(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Base / floor
    const baseGeo = new THREE.BoxGeometry(5.5, 0.25, 5);
    grp.add(_mesh(baseGeo, _lambert(0x2e1a0a)));

    // Walls
    const wallMat = _lambert(0x5c3317);
    const wallH = 3.5;
    const wallGeo = new THREE.BoxGeometry(5, wallH, 4.5);
    const walls = _mesh(wallGeo, wallMat);
    walls.position.y = wallH * 0.5 + 0.25;
    walls.castShadow = true;
    grp.add(walls);

    // Roof (two triangular prisms)
    const roofMat = _lambert(0x8b4513);
    const roofGeo = new THREE.CylinderGeometry(0, 3.6, 2, 4);
    const roof = _mesh(roofGeo, roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = wallH + 0.25 + 1;
    roof.castShadow = true;
    grp.add(roof);

    // Door
    const doorGeo = new THREE.BoxGeometry(1, 2.2, 0.15);
    const door = _mesh(doorGeo, _lambert(0x3d2005));
    door.position.set(0, wallH * 0.5 - 0.3, 2.3);
    grp.add(door);

    // Quest board (sign post)
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6);
    const post = _mesh(postGeo, _lambert(0x4d2c0a));
    post.position.set(2, 1.25, 3);
    grp.add(post);

    const boardGeo = new THREE.BoxGeometry(1.6, 1, 0.1);
    const board = _mesh(boardGeo, _lambert(0xc8a870));
    board.position.set(2, 2.3, 3);
    grp.add(board);

    // Lanterns (hanging)
    for (let i = -1; i <= 1; i += 2) {
      const lanternGeo = new THREE.BoxGeometry(0.3, 0.4, 0.3);
      const lantern = _mesh(lanternGeo, _mat(0xffcc44, 0xffcc44, 0.8));
      const lLight = new THREE.PointLight(0xffcc44, 1.2, 5, 2);
      lantern.position.set(i * 2.2, wallH + 0.05, 2.3);
      lLight.position.copy(lantern.position);
      grp.add(lantern);
      grp.add(lLight);
    }

    _addNameSign(grp, def.label, 0, wallH + 2.6, 0);
    return grp;
  }

  // ── Skill Tree ─ massive glowing magical tree ────────────
  function _buildSkillTree(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Trunk (thick, ancient)
    const trunkGeo = new THREE.CylinderGeometry(0.7, 1.1, 7, 10);
    const trunkMat = new THREE.MeshPhongMaterial({
      color: 0x2d1a06,
      emissive: 0x0a2a10,
      emissiveIntensity: 0.15
    });
    const trunk = _mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.5;
    trunk.castShadow = true;
    grp.add(trunk);

    // Main canopy layers (glowing green/teal)
    const canopyColors = [0x00ff88, 0x00e0ff, 0x88ff44];
    const layerData = [
      { y: 6.5, r: 4.5 },
      { y: 9,   r: 3.5 },
      { y: 11,  r: 2.5 },
      { y: 12.5,r: 1.3 },
    ];
    layerData.forEach((l, li) => {
      const col = canopyColors[li % canopyColors.length];
      const cMat = new THREE.MeshPhongMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.45,
        transparent: true,
        opacity: 0.8
      });
      const cGeo = new THREE.SphereGeometry(l.r, 12, 8);
      const canopy = _mesh(cGeo, cMat);
      canopy.position.y = l.y;
      grp.add(canopy);
    });

    // Bioluminescent glow light
    const glowLight = new THREE.PointLight(0x00ff88, 3, 18, 2);
    glowLight.position.set(0, 10, 0);
    grp.add(glowLight);

    // Rune stones around the base
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 3.5;
      const rGeo = new THREE.DodecahedronGeometry(0.35, 0);
      const rMat = new THREE.MeshPhongMaterial({
        color: 0x334433,
        emissive: 0x00ff44,
        emissiveIntensity: 0.6
      });
      const rune = _mesh(rGeo, rMat);
      rune.position.set(Math.sin(a) * r, 0.35, Math.cos(a) * r);
      rune.castShadow = true;
      grp.add(rune);
    }

    // Floating sparkle particles on the tree
    const sparkleGeo = new THREE.BufferGeometry();
    const sCount = 60;
    const sPos = new Float32Array(sCount * 3);
    for (let i = 0; i < sCount; i++) {
      const a  = Math.random() * Math.PI * 2;
      const ry = 5 + Math.random() * 8;
      const rr = Math.random() * 4;
      sPos[i * 3]     = Math.sin(a) * rr;
      sPos[i * 3 + 1] = ry;
      sPos[i * 3 + 2] = Math.cos(a) * rr;
    }
    sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    const sparkleMat = new THREE.PointsMaterial({
      color: 0xaaffaa,
      size: 0.14,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    grp.add(new THREE.Points(sparkleGeo, sparkleMat));

    _addNameSign(grp, def.label, 0, 1.2, 4.5);
    return grp;
  }

  // ── The Forge ─ stone forge with anvil & embers ──────────
  function _buildForge(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Main forge building (stone, dark)
    const wallMat = _mat(0x4a4440, 0x220800, 0.05);
    const wallGeo = new THREE.BoxGeometry(6, 4, 5.5);
    const walls = _mesh(wallGeo, wallMat);
    walls.position.y = 2;
    walls.castShadow = true;
    grp.add(walls);

    // Roof
    const roofGeo = new THREE.BoxGeometry(6.4, 0.6, 6);
    const roof = _mesh(roofGeo, _lambert(0x3a3030));
    roof.position.y = 4.3;
    grp.add(roof);

    // Chimney
    const chimneyGeo = new THREE.BoxGeometry(0.9, 3, 0.9);
    const chimney = _mesh(chimneyGeo, _lambert(0x3d3530));
    chimney.position.set(-1.5, 5.5, -1);
    grp.add(chimney);

    // Chimney glow (orange embers rising)
    const chimneyLight = new THREE.PointLight(0xff5500, 2, 6, 2);
    chimneyLight.position.set(-1.5, 7.5, -1);
    grp.add(chimneyLight);

    // Anvil outside
    const anvilBase = _mesh(new THREE.BoxGeometry(0.9, 0.6, 0.5), _lambert(0x2a2a2a));
    anvilBase.position.set(3.5, 0.3, 1);
    grp.add(anvilBase);
    const anvilTop = _mesh(new THREE.BoxGeometry(1.2, 0.25, 0.55), _lambert(0x333333));
    anvilTop.position.set(3.5, 0.73, 1);
    anvilTop.castShadow = true;
    grp.add(anvilTop);

    // Glowing forge interior (visible through front opening)
    const forgeGlowGeo = new THREE.BoxGeometry(2, 1.8, 0.3);
    const forgeGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.85
    });
    const forgeGlow = _mesh(forgeGlowGeo, forgeGlowMat);
    forgeGlow.position.set(0, 1.5, 2.85);
    grp.add(forgeGlow);

    const forgeLight = new THREE.PointLight(0xff4400, 4, 12, 2);
    forgeLight.position.set(0, 1.5, 3.5);
    grp.add(forgeLight);

    // Tool rack (hammers, tongs)
    const rackGeo = new THREE.BoxGeometry(2, 0.08, 0.08);
    const rack = _mesh(rackGeo, _lambert(0x553311));
    rack.position.set(-3.5, 2.5, 2.9);
    grp.add(rack);
    for (let t = 0; t < 3; t++) {
      const hGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.2, 6);
      const h = _mesh(hGeo, _lambert(0x333333));
      h.rotation.z = Math.PI / 2;
      h.position.set(-4.3 + t * 0.7, 2.8, 2.9);
      grp.add(h);
    }

    // Ember particles (static orange dots near forge opening)
    const embGeo = new THREE.BufferGeometry();
    const eCount = 30;
    const ePos = new Float32Array(eCount * 3);
    for (let i = 0; i < eCount; i++) {
      ePos[i * 3]     = (Math.random() - 0.5) * 2.5;
      ePos[i * 3 + 1] = 0.8 + Math.random() * 2;
      ePos[i * 3 + 2] = 2.5 + Math.random() * 1;
    }
    embGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
    const embMat = new THREE.PointsMaterial({
      color: 0xff6600,
      size: 0.12,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    grp.add(new THREE.Points(embGeo, embMat));

    _addNameSign(grp, def.label, 0, 5.2, 0);
    return grp;
  }

  // ── Companion House ─ cozy nest/den ──────────────────────
  function _buildCompanionHouse(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Rounded base platform
    const platGeo = new THREE.CylinderGeometry(4, 4.3, 0.4, 24);
    grp.add(_mesh(platGeo, _lambert(0x2a1e0a)));

    // Main structure (dome-like rounded house)
    const domeMat = _mat(0x8b5e3c, 0x4a2000, 0.06);
    const domeGeo = new THREE.SphereGeometry(3.5, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const dome = _mesh(domeGeo, domeMat);
    dome.position.y = 0.2;
    dome.castShadow = true;
    grp.add(dome);

    // Door arch
    const doorGeo = new THREE.CylinderGeometry(0.7, 0.7, 2, 12, 1, true, 0, Math.PI);
    const doorMat = _lambert(0x3d2005);
    const door = _mesh(doorGeo, doorMat);
    door.rotation.y = Math.PI;
    door.position.set(0, 1, 3.6);
    grp.add(door);

    // Toys outside (colorful spheres/cubes = toys)
    const toyColors = [0xff4466, 0x44aaff, 0xffdd22, 0x44ff88];
    toyColors.forEach((col, i) => {
      const a = (i / toyColors.length) * Math.PI * 2 + 0.5;
      const r = 3.0;
      const tGeo = i % 2 === 0
        ? new THREE.SphereGeometry(0.22, 8, 8)
        : new THREE.BoxGeometry(0.35, 0.35, 0.35);
      const toy = _mesh(tGeo, _mat(col, col, 0.2));
      toy.position.set(Math.sin(a) * r, 0.25 + 0.2, Math.cos(a) * r);
      grp.add(toy);
    });

    // Training hoop (a torus)
    const hoopGeo = new THREE.TorusGeometry(0.9, 0.07, 8, 24);
    const hoop = _mesh(hoopGeo, _mat(0xffaa00, 0xff8800, 0.3));
    hoop.position.set(3.8, 1.2, 1);
    hoop.rotation.y = 0.5;
    grp.add(hoop);

    // Nest / bed visible through door (a torus on the floor)
    const nestGeo = new THREE.TorusGeometry(0.7, 0.22, 8, 16);
    const nest = _mesh(nestGeo, _lambert(0x8b6914));
    nest.rotation.x = -Math.PI / 2;
    nest.position.set(0, 0.22, 0);
    grp.add(nest);

    // Warm interior light
    const iLight = new THREE.PointLight(0xffaa66, 1.8, 5, 2);
    iLight.position.set(0, 1.5, 0);
    grp.add(iLight);

    _addNameSign(grp, def.label, 0, 4.5, 0);
    return grp;
  }

  // ── Training Hall ─ wooden dojo with equipment ───────────
  function _buildTrainingHall(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Platform
    const platGeo = new THREE.BoxGeometry(7, 0.3, 6.5);
    grp.add(_mesh(platGeo, _lambert(0x4a3218)));

    // Walls (open-sided dojo style)
    const wallMat = _lambert(0x6b4423);
    // Back + side walls
    [[0, 1.8, -3, 6.5, 3.6, 0.2], [3.3, 1.8, 0, 0.2, 3.6, 6]].forEach(([x, y, z, w, h, d]) => {
      const wGeo = new THREE.BoxGeometry(w, h, d);
      const wall = _mesh(wGeo, wallMat);
      wall.position.set(x, y, z);
      wall.castShadow = true;
      grp.add(wall);
    });
    // Left side
    const lWallGeo = new THREE.BoxGeometry(0.2, 3.6, 6);
    const lWall = _mesh(lWallGeo, wallMat);
    lWall.position.set(-3.3, 1.8, 0);
    lWall.castShadow = true;
    grp.add(lWall);

    // Pagoda roof
    const rGeo = new THREE.BoxGeometry(7.5, 0.4, 7);
    const roofTop = _mesh(rGeo, _lambert(0x8b3a00));
    roofTop.position.y = 3.8;
    grp.add(roofTop);

    // Training dummy (capsule-ish)
    const dummyBody = _mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.5, 8), _lambert(0x8b4513));
    dummyBody.position.set(2, 1.1, 1.5);
    const dummyHead = _mesh(new THREE.SphereGeometry(0.4, 8, 8), _lambert(0xd2a679));
    dummyHead.position.set(2, 2.3, 1.5);
    const dummyPole = _mesh(new THREE.CylinderGeometry(0.08, 0.08, 2, 6), _lambert(0x5c3a1e));
    dummyPole.position.set(2, 0.35, 1.5);
    grp.add(dummyBody, dummyHead, dummyPole);

    // Weight / barbell
    const barGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6);
    const bar = _mesh(barGeo, _lambert(0x333333));
    bar.rotation.z = Math.PI / 2;
    bar.position.set(-2, 0.8, 1.5);
    grp.add(bar);
    for (let s = -1; s <= 1; s += 2) {
      const wGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.2, 12);
      const w = _mesh(wGeo, _lambert(0x444444));
      w.rotation.z = Math.PI / 2;
      w.position.set(-2 + s * 0.9, 0.8, 1.5);
      grp.add(w);
    }

    _addNameSign(grp, def.label, 0, 4.6, 0);
    return grp;
  }

  // ── Hall of Trophies ─ gleaming achievement building ─────
  function _buildAchievementHall(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Grand columns (4)
    const colMat = _mat(0xe8d8a0, 0xffd700, 0.05);
    [[-2, 2.5], [2, 2.5], [-2, -2.5], [2, -2.5]].forEach(([cx, cz]) => {
      const cGeo = new THREE.CylinderGeometry(0.35, 0.4, 5, 12);
      const col  = _mesh(cGeo, colMat);
      col.position.set(cx, 2.5, cz);
      col.castShadow = true;
      grp.add(col);
    });

    // Main building
    const bGeo = new THREE.BoxGeometry(5.5, 4, 5.5);
    const bMat = _mat(0xd4c890, 0x8b6914, 0.05);
    const bldg = _mesh(bGeo, bMat);
    bldg.position.y = 2;
    bldg.castShadow = true;
    grp.add(bldg);

    // Triangular pediment (front gable)
    const pedGeo = new THREE.CylinderGeometry(0, 3.5, 2, 4);
    const ped = _mesh(pedGeo, _mat(0xe8d8a0, 0x8b6914, 0.05));
    ped.rotation.y = Math.PI / 4;
    ped.position.y = 5;
    ped.castShadow = true;
    grp.add(ped);

    // Trophy displays (golden star shapes)
    for (let i = 0; i < 3; i++) {
      const tLight = new THREE.PointLight(0xffd700, 1.2, 4, 2);
      tLight.position.set(-2.2 + i * 2.2, 3, 2.9);
      grp.add(tLight);

      const starGeo = new THREE.OctahedronGeometry(0.35, 0);
      const starMat = new THREE.MeshPhongMaterial({
        color: 0xffd700,
        emissive: 0xffd700,
        emissiveIntensity: 0.6,
        shininess: 120
      });
      const star = _mesh(starGeo, starMat);
      star.position.set(-2.2 + i * 2.2, 2.8, 2.9);
      grp.add(star);
    }

    // Steps
    for (let s = 0; s < 3; s++) {
      const sGeo = new THREE.BoxGeometry(4 - s * 0.4, 0.25, 0.5);
      const step = _mesh(sGeo, _lambert(0xb8a878));
      step.position.set(0, s * 0.25 + 0.12, 2.8 + s * 0.4);
      grp.add(step);
    }

    _addNameSign(grp, def.label, 0, 7.3, 0);
    return grp;
  }

  // ── Armory ─ fortified weapon rack building ──────────────
  function _buildArmory(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Stone walls
    const wallMat = _lambert(0x4a4240);
    const wGeo = new THREE.BoxGeometry(5.5, 4.5, 5);
    const walls = _mesh(wGeo, wallMat);
    walls.position.y = 2.25;
    walls.castShadow = true;
    grp.add(walls);

    // Battlements on top
    for (let b = -2; b <= 2; b++) {
      const bGeo = new THREE.BoxGeometry(0.5, 0.7, 0.5);
      const batt = _mesh(bGeo, _lambert(0x3a3230));
      batt.position.set(b * 1.1, 4.85, 2.6);
      grp.add(batt);
    }

    // Arrow slit windows
    for (let s = -1; s <= 1; s += 2) {
      const wGeo2 = new THREE.BoxGeometry(0.2, 0.7, 0.15);
      const wWindow = _mesh(wGeo2, _lambert(0x111111));
      wWindow.position.set(s * 1.8, 2.5, 2.55);
      grp.add(wWindow);
    }

    // Weapon rack outside
    const rackH = _mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), _lambert(0x553311));
    rackH.rotation.z = Math.PI / 2;
    rackH.position.set(3.6, 1.5, 0);
    grp.add(rackH);
    const rackV1 = _mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), _lambert(0x553311));
    rackV1.position.set(2.8, 1, 0);
    grp.add(rackV1);
    const rackV2 = _mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), _lambert(0x553311));
    rackV2.position.set(4.4, 1, 0);
    grp.add(rackV2);

    // Swords on rack
    for (let sw = -1; sw <= 1; sw++) {
      const bladeGeo = new THREE.BoxGeometry(0.08, 1.5, 0.08);
      const blade = _mesh(bladeGeo, _mat(0xcccccc, 0x888888, 0.3));
      blade.position.set(3.6 + sw * 0.5, 1.5, 0.2);
      grp.add(blade);
      const guardGeo = new THREE.BoxGeometry(0.5, 0.07, 0.07);
      const guard = _mesh(guardGeo, _lambert(0xaa8833));
      guard.position.set(3.6 + sw * 0.5, 0.8, 0.2);
      grp.add(guard);
    }

    _addNameSign(grp, def.label, 0, 5.6, 0);
    return grp;
  }

  // ── Inventory Storage ─ crates and barrels ───────────────
  function _buildInventoryStorage(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Main warehouse
    const wallMat = _lambert(0x6b5c42);
    const wGeo = new THREE.BoxGeometry(6, 4, 5.5);
    const walls = _mesh(wGeo, wallMat);
    walls.position.y = 2;
    walls.castShadow = true;
    grp.add(walls);

    // Sloped shed roof
    const roofGeo = new THREE.BoxGeometry(6.5, 0.3, 6);
    const roof = _mesh(roofGeo, _lambert(0x4a3822));
    roof.position.y = 4.15;
    grp.add(roof);

    // Door
    const doorGeo = new THREE.BoxGeometry(1.2, 2.5, 0.15);
    const door = _mesh(doorGeo, _lambert(0x3d2a18));
    door.position.set(-0.5, 1.25, 2.83);
    grp.add(door);

    // Crates outside
    [[3.2, 0.4, 1.5], [3.2, 1.1, 1.5], [3.9, 0.4, 1], [3.9, 0.4, 2.2]].forEach(([x, y, z]) => {
      const cGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
      const crate = _mesh(cGeo, _lambert(0x9b7c44));
      crate.position.set(x, y, z);
      crate.castShadow = true;
      grp.add(crate);
    });

    // Barrel
    const brlGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.8, 12);
    const brl = _mesh(brlGeo, _lambert(0x5c3a1e));
    brl.position.set(-3.5, 0.4, 2);
    grp.add(brl);

    _addNameSign(grp, def.label, 0, 5.0, 0);
    return grp;
  }

  // ── Generic fallback building ────────────────────────────
  function _buildGenericBuilding(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);
    const geo = new THREE.BoxGeometry(4, 3.5, 4);
    const mat = _lambert(0x5c4a35);
    const b = _mesh(geo, mat);
    b.position.y = 1.75;
    b.castShadow = true;
    grp.add(b);
    _addNameSign(grp, def.label, 0, 4.2, 0);
    return grp;
  }

  // ── Mesh creation helper ─────────────────────────────────
  function _mesh(geo, mat) {
    const m = new T().Mesh(geo, mat);
    m.receiveShadow = true;
    return m;
  }

  // ── Floating name sign above each building ───────────────
  function _addNameSign(grp, label, x, y, z) {
    const THREE = T();
    // Use a canvas texture for the label
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(20,12,4,0.82)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#c8a248';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, 250, 58);
    ctx.fillStyle = '#f0d890';
    ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const signGeo = new THREE.PlaneGeometry(2.6, 0.65);
    const signMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(x, y, z);
    grp.add(sign);
  }

  // ──────────────────────────────────────────────────────────
  // Particle update
  // ──────────────────────────────────────────────────────────
  function _updateParticles(dt) {
    // ── Campfire sparks ──────────────────────────────────────
    for (let i = 0; i < SPARK_COUNT; i++) {
      _sparkLifetimes[i] -= dt;
      if (_sparkLifetimes[i] <= 0) {
        // Respawn from fire
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.5;
        _sparkPositions[i * 3]     = Math.sin(a) * r;
        _sparkPositions[i * 3 + 1] = 0.6 + Math.random() * 0.6;
        _sparkPositions[i * 3 + 2] = Math.cos(a) * r;
        _sparkVelocities[i] = {
          x: (Math.random() - 0.5) * 1.2,
          y: 2.5 + Math.random() * 2.5,
          z: (Math.random() - 0.5) * 1.2
        };
        _sparkLifetimes[i] = 0.5 + Math.random() * 1.2;
      } else {
        _sparkPositions[i * 3]     += _sparkVelocities[i].x * dt;
        _sparkPositions[i * 3 + 1] += _sparkVelocities[i].y * dt;
        _sparkPositions[i * 3 + 2] += _sparkVelocities[i].z * dt;
        _sparkVelocities[i].y -= 1.2 * dt; // gravity
        _sparkVelocities[i].x *= 0.98;
        _sparkVelocities[i].z *= 0.98;
      }
    }
    _sparkSystem.geometry.attributes.position.needsUpdate = true;

    // ── Atmospheric dust ─────────────────────────────────────
    for (let i = 0; i < DUST_COUNT; i++) {
      _dustLifetimes[i] -= dt;
      if (_dustLifetimes[i] <= 0) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 7;
        _dustPositions[i * 3]     = Math.sin(a) * r;
        _dustPositions[i * 3 + 1] = 0.1;
        _dustPositions[i * 3 + 2] = Math.cos(a) * r;
        _dustVelocities[i] = {
          x: (Math.random() - 0.5) * 0.5,
          y: 0.1 + Math.random() * 0.35,
          z: (Math.random() - 0.5) * 0.5
        };
        _dustLifetimes[i] = 3 + Math.random() * 3;
      } else {
        _dustPositions[i * 3]     += _dustVelocities[i].x * dt;
        _dustPositions[i * 3 + 1] += _dustVelocities[i].y * dt;
        _dustPositions[i * 3 + 2] += _dustVelocities[i].z * dt;
      }
    }
    _dustSystem.geometry.attributes.position.needsUpdate = true;
  }

  // ──────────────────────────────────────────────────────────
  // Fire flicker animation
  // ──────────────────────────────────────────────────────────
  function _updateFire(dt) {
    _campTime += dt;
    const flicker = 0.85 + 0.15 * Math.sin(_campTime * 11.3)
                         + 0.10 * Math.sin(_campTime * 7.1)
                         + 0.05 * Math.sin(_campTime * 17.9);
    if (_fireLight) {
      _fireLight.intensity = 5.5 * flicker;
    }
    _flameMeshes.forEach((f, i) => {
      const s = 0.9 + 0.1 * Math.sin(_campTime * (8 + i * 3.1));
      f.scale.set(s, 0.85 + 0.2 * Math.sin(_campTime * (6 + i * 2.7)), s);
      f.material.opacity = 0.7 + 0.15 * Math.sin(_campTime * (5 + i * 1.5));
    });
  }

  // ──────────────────────────────────────────────────────────
  // Player movement
  // ──────────────────────────────────────────────────────────
  function _updatePlayer(dt) {
    let mx = 0, mz = 0;

    // Keyboard
    if (_keys['ArrowLeft']  || _keys['KeyA']) mx -= 1;
    if (_keys['ArrowRight'] || _keys['KeyD']) mx += 1;
    if (_keys['ArrowUp']    || _keys['KeyW']) mz -= 1;
    if (_keys['ArrowDown']  || _keys['KeyS']) mz += 1;

    // Internal touch movement (own camp touch system, avoids interference with game joystick)
    if (_touch.active) {
      mx += _touch.x;
      mz += _touch.y;
    }

    // Normalize diagonal
    const len = Math.sqrt(mx * mx + mz * mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
    }

    // Smooth velocity
    const targetX = mx * PLAYER_SPEED;
    const targetZ = mz * PLAYER_SPEED;
    const lerpF = (len > 0) ? 0.18 : 0.12;
    _playerVel.x += (targetX - _playerVel.x) * lerpF;
    _playerVel.z += (targetZ - _playerVel.z) * lerpF;

    // Update position (clamp to camp area)
    _playerPos.x = Math.max(-38, Math.min(38, _playerPos.x + _playerVel.x * dt));
    _playerPos.z = Math.max(-38, Math.min(38, _playerPos.z + _playerVel.z * dt));

    if (_playerMesh) {
      _playerMesh.position.x = _playerPos.x;
      _playerMesh.position.z = _playerPos.z;

      // Rotation toward movement direction
      if (len > 0.05) {
        const targetAngle = Math.atan2(mx, mz);
        let da = targetAngle - _playerMesh.rotation.y;
        while (da > Math.PI)  da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        _playerMesh.rotation.y += da * 0.2;
      }

      // Gentle bobbing
      _playerMesh.position.y = PLAYER_RADIUS + Math.sin(_campTime * 3) * 0.05;

      // Squish on movement
      const speed = Math.sqrt(_playerVel.x * _playerVel.x + _playerVel.z * _playerVel.z);
      const squishY = 1 + speed * 0.015;
      const squishXZ = 1 - speed * 0.008;
      _playerMesh.children[0].scale.set(squishXZ, squishY, squishXZ);
    }
  }

  // ──────────────────────────────────────────────────────────
  // Camera follow
  // ──────────────────────────────────────────────────────────
  function _updateCamera(dt) {
    if (!_campCamera || !_playerMesh) return;
    const targetCX = _playerPos.x;
    const targetCZ = _playerPos.z + 16;
    const targetCY = 13;

    if (dt === 0) {
      // Immediate snap on init
      _campCamera.position.set(targetCX, targetCY, targetCZ);
    } else {
      _campCamera.position.x += (targetCX - _campCamera.position.x) * 0.06;
      _campCamera.position.y += (targetCY - _campCamera.position.y) * 0.06;
      _campCamera.position.z += (targetCZ - _campCamera.position.z) * 0.06;
    }
    _campCamera.lookAt(_playerPos.x, 0.6, _playerPos.z);
  }

  // ──────────────────────────────────────────────────────────
  // Sign-post labels: face camera every frame
  // ──────────────────────────────────────────────────────────
  function _updateSigns() {
    if (!_campCamera) return;
    for (const def of BUILDING_DEFS) {
      const grp = _buildingMeshes[def.id];
      if (!grp || !grp.visible) continue;
      // Last child is the sign plane
      const sign = grp.children[grp.children.length - 1];
      if (sign && sign.isMesh) {
        sign.lookAt(_campCamera.position);
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // Proximity / interaction
  // ──────────────────────────────────────────────────────────
  function _updateInteraction() {
    let nearest = null;
    let nearestDist = Infinity;

    for (const def of BUILDING_DEFS) {
      const grp = _buildingMeshes[def.id];
      if (!grp || !grp.visible) continue;
      const dx = _playerPos.x - def.x;
      const dz = _playerPos.z - def.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < INTERACTION_RADIUS && dist < nearestDist) {
        nearestDist = dist;
        nearest = def;
      }
    }

    if (_nearBuilding !== (nearest ? nearest.id : null)) {
      _nearBuilding = nearest ? nearest.id : null;
      _updatePromptUI();
    }
  }

  function _updatePromptUI() {
    if (!_promptEl) return;
    if (_nearBuilding) {
      const def = BUILDING_DEFS.find(d => d.id === _nearBuilding);
      if (def) {
        _promptEl.textContent = `${def.icon}  ${def.label}  —  Tap / [E]`;
        _promptEl.style.display = 'block';
      }
      if (_interactBtn) _interactBtn.style.display = 'block';
    } else {
      _promptEl.style.display = 'none';
      if (_interactBtn) _interactBtn.style.display = 'none';
    }
  }

  function _interact() {
    if (!_nearBuilding) return;
    const fn = _callbacks[_nearBuilding];
    if (typeof fn === 'function') {
      fn();
    }
  }

  // ──────────────────────────────────────────────────────────
  // Refresh building visibility based on save data
  // ──────────────────────────────────────────────────────────
  function _refreshBuildings() {
    if (!_saveData) return;
    for (const def of BUILDING_DEFS) {
      const grp = _buildingMeshes[def.id];
      if (!grp) continue;
      const bd = _saveData.campBuildings && _saveData.campBuildings[def.id];
      const isUnlocked = bd ? (bd.unlocked || bd.level > 0) : false;
      grp.visible = isUnlocked;
    }
    // Quest Hall is always visible (core building)
    if (_buildingMeshes['questMission']) {
      _buildingMeshes['questMission'].visible = true;
    }
  }

  // ──────────────────────────────────────────────────────────
  // HUD DOM elements (created once)
  // ──────────────────────────────────────────────────────────
  function _ensureHUD() {
    // Interaction prompt
    if (!document.getElementById('camp-interact-prompt')) {
      const prompt = document.createElement('div');
      prompt.id = 'camp-interact-prompt';
      prompt.style.cssText = [
        'position:fixed',
        'bottom:25%',
        'left:50%',
        'transform:translateX(-50%)',
        'background:rgba(10,8,4,0.82)',
        'border:2px solid #c8a248',
        'border-radius:10px',
        'color:#f0d890',
        'font-family:"Bangers",cursive',
        'font-size:18px',
        'letter-spacing:1px',
        'padding:10px 20px',
        'display:none',
        'z-index:200',
        'pointer-events:none',
        'text-shadow:0 0 8px rgba(200,162,72,0.6)',
        'box-shadow:0 0 16px rgba(200,162,72,0.3)',
      ].join(';');
      document.body.appendChild(prompt);
      _promptEl = prompt;
    } else {
      _promptEl = document.getElementById('camp-interact-prompt');
    }

    // Mobile interact button
    if (!document.getElementById('camp-interact-btn')) {
      const btn = document.createElement('button');
      btn.id = 'camp-interact-btn';
      btn.textContent = 'ENTER';
      btn.style.cssText = [
        'position:fixed',
        'bottom:18%',
        'right:6%',
        'background:linear-gradient(135deg,#c8a248,#8b6914)',
        'border:none',
        'border-radius:50%',
        'width:70px',
        'height:70px',
        'color:#000',
        'font-family:"Bangers",cursive',
        'font-size:16px',
        'font-weight:bold',
        'display:none',
        'z-index:200',
        'cursor:pointer',
        'box-shadow:0 0 20px rgba(200,162,72,0.7)',
        'letter-spacing:0.5px',
      ].join(';');
      btn.addEventListener('click', () => _interact());
      document.body.appendChild(btn);
      _interactBtn = btn;
    } else {
      _interactBtn = document.getElementById('camp-interact-btn');
    }

    // Touch joystick indicator (virtual stick shown at touch origin)
    if (!document.getElementById('camp-touch-indicator')) {
      const ring = document.createElement('div');
      ring.id = 'camp-touch-indicator';
      ring.style.cssText = [
        'position:fixed',
        'width:80px',
        'height:80px',
        'border:3px solid rgba(93,173,226,0.5)',
        'border-radius:50%',
        'background:rgba(93,173,226,0.08)',
        'display:none',
        'z-index:55',
        'pointer-events:none',
      ].join(';');
      // Inner dot
      const dot = document.createElement('div');
      dot.style.cssText = [
        'position:absolute',
        'top:50%',
        'left:50%',
        'width:28px',
        'height:28px',
        'margin:-14px 0 0 -14px',
        'border-radius:50%',
        'background:rgba(93,173,226,0.6)',
      ].join(';');
      ring.appendChild(dot);
      document.body.appendChild(ring);
      _touchIndicator = ring;
    } else {
      _touchIndicator = document.getElementById('camp-touch-indicator');
    }
  }

  // ──────────────────────────────────────────────────────────
  // Keyboard listeners
  // ──────────────────────────────────────────────────────────
  function _onKeyDown(e) {
    if (!_isActive) return;
    _keys[e.code] = true;
    if (e.code === 'KeyE') _interact();
  }
  function _onKeyUp(e) {
    _keys[e.code] = false;
  }

  // ──────────────────────────────────────────────────────────
  // Touch movement handlers (own system for camp navigation)
  // ──────────────────────────────────────────────────────────
  const _TOUCH_DEAD_ZONE = 10; // px

  function _onTouchStart(e) {
    if (!_isActive) return;
    // Only handle left-half touches for movement (right half reserved for interact / UI)
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.clientX < window.innerWidth * 0.55 && !_touch.active) {
        _touch.active = true;
        _touch.id     = t.identifier;
        _touch.startX = t.clientX;
        _touch.startY = t.clientY;
        _touch.x = 0;
        _touch.y = 0;
        _showTouchIndicator(t.clientX, t.clientY);
        e.preventDefault();
        break;
      }
    }
  }

  function _onTouchMove(e) {
    if (!_isActive || !_touch.active) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== _touch.id) continue;
      const dx = t.clientX - _touch.startX;
      const dy = t.clientY - _touch.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = 60;
      const factor = Math.min(dist, maxDist) / maxDist;
      if (dist > _TOUCH_DEAD_ZONE) {
        _touch.x = (dx / dist) * factor;
        _touch.y = (dy / dist) * factor;
      } else {
        _touch.x = 0;
        _touch.y = 0;
      }
      _moveTouchIndicator(t.clientX, t.clientY);
      e.preventDefault();
      break;
    }
  }

  function _onTouchEnd(e) {
    if (!_isActive) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === _touch.id) {
        _touch.active = false;
        _touch.id = null;
        _touch.x = 0;
        _touch.y = 0;
        _hideTouchIndicator();
        break;
      }
    }
  }

  // Touch joystick visual (shows ring where user touched)
  function _showTouchIndicator(cx, cy) {
    if (!_touchIndicator) return;
    _touchIndicator.style.left = (cx - 40) + 'px';
    _touchIndicator.style.top  = (cy - 40) + 'px';
    _touchIndicator.style.display = 'block';
  }
  function _moveTouchIndicator(cx, cy) {
    if (!_touchIndicator) return;
    // Inner dot follows finger, outer stays at origin
    const inner = _touchIndicator.children[0];
    if (inner) {
      const ox = _touch.startX;
      const oy = _touch.startY;
      const dx = Math.max(-30, Math.min(30, cx - ox));
      const dy = Math.max(-30, Math.min(30, cy - oy));
      inner.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }
  function _hideTouchIndicator() {
    if (!_touchIndicator) return;
    _touchIndicator.style.display = 'none';
    const inner = _touchIndicator.children[0];
    if (inner) inner.style.transform = '';
  }

  // ──────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────

  /**
   * enter(renderer, saveData, callbacks)
   * Called by main.js whenever the camp should be shown.
   * @param {THREE.WebGLRenderer} renderer  shared renderer
   * @param {object} saveData              current save data
   * @param {object} callbacks             { buildingId: fn, ... }
   */
  function enter(renderer, saveData, callbacks) {
    if (!T()) {
      console.warn('[CampWorld] THREE not yet available – deferred enter');
      return;
    }

    _renderer  = renderer;
    _saveData  = saveData;
    _callbacks = callbacks || {};

    // Build scene once
    if (!_campScene) {
      _buildScene();
    }

    // Reset player to spawn
    _playerPos.x = SPAWN_POS.x;
    _playerPos.z = SPAWN_POS.z;
    _playerVel.x = 0;
    _playerVel.z = 0;
    if (_playerMesh) {
      _playerMesh.position.set(_playerPos.x, PLAYER_RADIUS, _playerPos.z);
    }
    _updateCamera(0);

    // Refresh building visibility
    _refreshBuildings();

    // Ensure HUD elements
    _ensureHUD();
    _nearBuilding = null;
    _updatePromptUI();

    // Camera aspect
    const aspect = window.innerWidth / window.innerHeight;
    if (_campCamera) {
      _campCamera.aspect = aspect;
      _campCamera.updateProjectionMatrix();
    }

    // Reset touch state
    _touch.active = false;
    _touch.id = null;
    _touch.x = 0;
    _touch.y = 0;
    _hideTouchIndicator();

    _isActive = true;
  }

  /**
   * exit()
   * Called by main.js when leaving camp.
   */
  function exit() {
    _isActive = false;
    _keys = {};
    _touch.active = false;
    _touch.x = 0;
    _touch.y = 0;
    _nearBuilding = null;
    if (_promptEl) _promptEl.style.display = 'none';
    if (_interactBtn) _interactBtn.style.display = 'none';
    _hideTouchIndicator();
  }

  /**
   * update(dt)
   * Per-frame logic update.  Called from main.js animate() when isActive.
   */
  function update(dt) {
    if (!_isActive || !_campScene) return;
    _updateFire(dt);
    _updateParticles(dt);
    _updatePlayer(dt);
    _updateCamera(dt);
    _updateSigns();
    _updateInteraction();
  }

  /**
   * render()
   * Render the camp scene.  Called from main.js animate().
   */
  function render() {
    if (!_isActive || !_campScene || !_campCamera || !_renderer) return;
    _renderer.render(_campScene, _campCamera);
  }

  /**
   * refreshBuildings()
   * Re-evaluate which buildings are visible (call after unlock events).
   */
  function refreshBuildings(saveData) {
    if (saveData) _saveData = saveData;
    _refreshBuildings();
  }

  /**
   * onResize()
   * Update camera aspect on window resize.
   */
  function onResize() {
    if (_campCamera) {
      _campCamera.aspect = window.innerWidth / window.innerHeight;
      _campCamera.updateProjectionMatrix();
    }
  }

  // Register keyboard listeners globally (only fire when camp is active via _isActive guard).
  // These are intentionally registered once at module load time (page lifetime) since
  // camp-world.js is a singleton loaded once at startup — no leak concerns.
  window.addEventListener('keydown', _onKeyDown);
  window.addEventListener('keyup',   _onKeyUp);

  // Touch movement listeners (own camp movement system, active only when camp is active)
  window.addEventListener('touchstart', _onTouchStart, { passive: false });
  window.addEventListener('touchmove',  _onTouchMove,  { passive: false });
  window.addEventListener('touchend',   _onTouchEnd,   { passive: true });
  window.addEventListener('touchcancel',_onTouchEnd,   { passive: true });

  // Handle resize
  window.addEventListener('resize', onResize);

  // ──────────────────────────────────────────────────────────
  // Expose public API
  // ──────────────────────────────────────────────────────────
  window.CampWorld = {
    get isActive() { return _isActive; },
    enter,
    exit,
    update,
    render,
    refreshBuildings,
    onResize,
  };

})();
