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
    { id: 'campBoard',          x: -3.5, z: 0,  label: 'Camp Board',       icon: '📋' },
    { id: 'specialAttacks',     x:  9,  z:  7,  label: 'Special Attacks',  icon: '⚡' },
    { id: 'warehouse',          x: -9,  z:  7,  label: 'Warehouse',        icon: '🏪' },
    { id: 'tavern',             x: -5,  z: 14,  label: 'Tavern',           icon: '🍺' },
    { id: 'shop',               x:  5,  z: 14,  label: 'Shop',             icon: '🛒' },
    { id: 'prestige',           x:  0,  z:-19,  label: 'Prestige Altar',   icon: '✨' },
    { id: 'trashRecycle',       x: -13, z: -2,  label: 'Trash & Recycle',  icon: '♻️' },
    { id: 'tempShop',           x:  13, z: -2,  label: 'Temp Shop',        icon: '🏪' },
  ];

  // ──────────────────────────────────────────────────────────
  // Module-level state
  // ──────────────────────────────────────────────────────────
  let _campScene   = null;
  let _campCamera  = null;
  let _renderer    = null;       // shared renderer from main.js
  let _callbacks   = {};         // { buildingId → fn() } set by main.js
  let _isBuilding  = false;      // guard against re-entrant _buildScene() calls
  let _saveData    = null;

  let _playerMesh  = null;
  let _playerVel   = { x: 0, z: 0 };
  let _playerPos   = { x: SPAWN_POS.x, z: SPAWN_POS.z };

  // Camp player limb references for animation
  let _playerLeftArm = null;
  let _playerRightArm = null;
  let _playerLeftLeg = null;
  let _playerRightLeg = null;
  let _playerGunBody = null;
  let _playerBandageTail = null;
  // Camp player animation state
  let _campAnimState = 'idle'; // idle | walk | run | dash | slide | shoot | knife | chop | gather | tool
  let _campAnimTimer = 0;
  let _campDashTimer = 0;
  let _campDashVec   = { x: 0, z: 0 };
  let _campDashing   = false;
  let _campSliding   = false;
  let _campSlideTimer = 0;
  let _campActionTimer = 0; // for shoot/knife/chop/gather timed animations
  let _campActionAnim = null;
  // Movement feel state
  let _campAngularVel = 0;    // angular velocity for banking
  let _campForwardLean = 0;   // forward lean angle
  let _campBankLean = 0;      // banking lean angle
  let _campSlideAmt = 0;      // visual slide intensity
  // Spritesheet overlay
  let _spriteAnimator = null;

  // Benny NPC state
  let _bennyMesh   = null;
  // _bennyBubble is now managed by window.DialogueSystem
  const BENNY_POS  = { x: 4, z: 7 }; // near camp entrance
  const BENNY_GREET_RADIUS = 3.5;
  let _bennyGreeted = false;      // whether Benny dialogue has fired this session

  let _campTime    = 0;
  let _isActive    = false;
  let _menuOpen    = false;  // true while a building menu overlay is visible

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

  /**
   * _waitForTHREE(callback)
   * Polls for window.THREE every 50ms for up to 3 seconds (60 attempts).
   * Calls callback() once THREE is available, or logs a warning if it times out.
   */
  function _waitForTHREE(callback) {
    var attempts = 0;
    var interval = setInterval(function () {
      attempts++;
      if (T()) {
        clearInterval(interval);
        callback();
      } else if (attempts >= 60) {
        clearInterval(interval);
        console.warn('[CampWorld] window.THREE not available after 3s, giving up');
      }
    }, 50);
  }

  // ──────────────────────────────────────────────────────────
  // Scene construction
  // ──────────────────────────────────────────────────────────
  function _buildScene() {
    const THREE = T();
    // Reset building mesh registry so stale refs from a previous failed build don't linger
    _buildingMeshes = {};
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

    // ── Torch / Lantern Lights between buildings ─────────
    _buildCampTorches();

    // ── Player character ─────────────────────────────────────
    _buildPlayer();

    // ── Benny NPC ────────────────────────────────────────────
    _buildBennyNPC();

    // ── Camera ──────────────────────────────────────────────
    const aspect = window.innerWidth / window.innerHeight;
    _campCamera = new THREE.PerspectiveCamera(42, aspect, 0.1, 200);
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

  // ── Torch / Lantern system between buildings ────────────
  let _torchLights = [];
  function _buildCampTorches() {
    const THREE = T();
    // Place torch posts with warm point lights between building positions
    // Creates a cozy, non-electrical atmosphere around the camp
    const torchPositions = [
      // Path torches between buildings (x, z)
      { x:  6, z:  6 },   // between campfire and training hall
      { x: -6, z:  6 },   // between campfire and companion house
      { x:  6, z: -4 },   // near forge path
      { x: -6, z: -4 },   // near skill tree path
      { x:  0, z:  7 },   // path to quest hall
      { x:  0, z: -8 },   // path to achievement hall
      { x: -9, z:  0 },   // between warehouse and trash
      { x:  9, z:  0 },   // between special attacks and temp shop
      { x:  3, z: 10 },   // near shop
      { x: -3, z: 10 },   // near tavern
    ];

    const postGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 0.9, metalness: 0.1 });
    const flameMat = new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xffaa33, emissiveIntensity: 1.5, transparent: true, opacity: 0.9 });
    const flameGeo = new THREE.SphereGeometry(0.12, 6, 6);

    for (const tp of torchPositions) {
      // Torch post
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(tp.x, 0.8, tp.z);
      _campScene.add(post);

      // Flame mesh on top
      const flame = new THREE.Mesh(flameGeo, flameMat.clone());
      flame.position.set(tp.x, 1.7, tp.z);
      flame.scale.set(1, 1.5, 1);
      _campScene.add(flame);

      // Warm point light
      const torchLight = new THREE.PointLight(0xffaa44, 1.2, 8, 2);
      torchLight.position.set(tp.x, 1.8, tp.z);
      _campScene.add(torchLight);
      _torchLights.push({ light: torchLight, flame: flame, baseIntensity: 1.2 });
    }
  }

  // Flicker torch lights each frame for cozy animation
  function _updateTorchFlicker() {
    for (const t of _torchLights) {
      const flicker = 0.85 + Math.random() * 0.3; // 0.85–1.15
      t.light.intensity = t.baseIntensity * flicker;
      // Subtle flame scale wobble
      if (t.flame) {
        t.flame.scale.y = 1.3 + Math.random() * 0.4;
        t.flame.scale.x = 0.9 + Math.random() * 0.2;
      }
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

  // ── Player water-drop (exact match of in-game character) ──
  function _buildPlayer() {
    const THREE = T();
    const grp = new THREE.Group();

    // Body — chunky waterdrop matching spritesheet (wide bottom, curved tip)
    const bodyGeo = new THREE.SphereGeometry(PLAYER_RADIUS, 16, 12);
    const positions = bodyGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      let y = positions.getY(i);
      let x = positions.getX(i);
      let z = positions.getZ(i);
      if (y > 0) {
        // Stretch top into a pointed tip
        positions.setY(i, y * 1.35);
        const t = y / PLAYER_RADIUS; // 0..1
        const squeeze = 1 - t * 0.55; // narrow more dramatically at top
        positions.setX(i, x * squeeze);
        positions.setZ(i, z * squeeze);
        // Bend the tip to one side (like spritesheet curved point)
        if (t > 0.5) {
          const bend = (t - 0.5) * 2.0; // 0..1 in upper half
          positions.setX(i, positions.getX(i) + bend * 0.18);
          positions.setZ(i, positions.getZ(i) - bend * 0.06);
        }
      } else {
        // Widen the bottom for chunky squat shape
        const bulge = 1 + Math.abs(y / PLAYER_RADIUS) * 0.15;
        positions.setX(i, x * bulge);
        positions.setZ(i, z * bulge);
      }
    }
    bodyGeo.computeVertexNormals();

    const bodyMat = new THREE.MeshPhongMaterial({
      color: 0x4FC3F7,       // match COLORS.player
      emissive: 0x0d47a1,
      emissiveIntensity: 0.3,
      shininess: 90,
      transparent: true,
      opacity: 0.85
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    grp.add(body);

    // Shiny highlight (water reflection)
    const hlGeo = new THREE.SphereGeometry(PLAYER_RADIUS * 0.28, 8, 8);
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    const hl = new THREE.Mesh(hlGeo, hlMat);
    hl.position.set(-0.18, 0.25, 0.18);
    grp.add(hl);

    // Glow shell
    const glowGeo = new THREE.SphereGeometry(PLAYER_RADIUS + 0.04, 16, 12);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x4FC3F7, transparent: true, opacity: 0.15, side: THREE.BackSide
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    grp.add(glow);

    // Eye whites — larger to match spritesheet's prominent eyes
    const eyeWhiteGeo = new THREE.SphereGeometry(0.13, 8, 8);
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const leftEyeW = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    leftEyeW.position.set(-0.16, 0.08, 0.40);
    grp.add(leftEyeW);
    const rightEyeW = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    rightEyeW.position.set(0.16, 0.08, 0.40);
    grp.add(rightEyeW);

    // Red eyes — big and bold matching spritesheet
    const eyeGeo = new THREE.SphereGeometry(0.10, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xCC2222 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.16, 0.08, 0.43);
    grp.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.16, 0.08, 0.43);
    grp.add(rightEye);

    // Pupils
    const pupilGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x220000 });
    const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
    leftPupil.position.set(-0.16, 0.08, 0.47);
    grp.add(leftPupil);
    const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
    rightPupil.position.set(0.16, 0.08, 0.47);
    grp.add(rightPupil);

    // Angry brows — thick and prominent matching spritesheet
    const browGeo = new THREE.BoxGeometry(0.14, 0.035, 0.04);
    const browMat = new THREE.MeshBasicMaterial({ color: 0x1565C0 });
    const leftBrow = new THREE.Mesh(browGeo, browMat);
    leftBrow.position.set(-0.16, 0.18, 0.42);
    leftBrow.rotation.z = 0.30;
    grp.add(leftBrow);
    const rightBrow = new THREE.Mesh(browGeo, browMat);
    rightBrow.position.set(0.16, 0.18, 0.42);
    rightBrow.rotation.z = -0.30;
    grp.add(rightBrow);

    // Mouth — small determined frown
    const mouthGeo = new THREE.BoxGeometry(0.10, 0.02, 0.025);
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x1a3a5a });
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, -0.06, 0.44);
    grp.add(mouth);

    // Cigar — brown cylinder body + orange ember end, matching spritesheet
    const cigarMat = new THREE.MeshPhongMaterial({ color: 0x8B6914, shininess: 20 });
    const cigarGeo = new THREE.CylinderGeometry(0.025, 0.022, 0.22, 8);
    const cigar = new THREE.Mesh(cigarGeo, cigarMat);
    cigar.rotation.z = -0.3;
    cigar.rotation.x = Math.PI / 2;
    cigar.position.set(0.12, -0.04, 0.50);
    grp.add(cigar);
    // Cigar lit tip (orange ember)
    const emberGeo = new THREE.SphereGeometry(0.028, 6, 6);
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xFF6600 });
    const ember = new THREE.Mesh(emberGeo, emberMat);
    ember.position.set(0.22, -0.01, 0.50);
    grp.add(ember);

    // Head bandage wrap — positioned higher around curved tip matching spritesheet
    const bandageMat = new THREE.MeshPhongMaterial({
      color: 0xF5DEB3, emissive: 0x8B7355, emissiveIntensity: 0.1, shininess: 10
    });
    const wrapGeo = new THREE.TorusGeometry(0.34, 0.055, 6, 16);
    const wrap = new THREE.Mesh(wrapGeo, bandageMat);
    wrap.position.set(0.04, 0.35, 0);
    wrap.rotation.x = Math.PI / 2;
    wrap.rotation.z = 0.20;
    grp.add(wrap);
    // Second wrap band for thicker look
    const wrap2Geo = new THREE.TorusGeometry(0.30, 0.04, 6, 16);
    const wrap2 = new THREE.Mesh(wrap2Geo, bandageMat);
    wrap2.position.set(0.06, 0.42, 0);
    wrap2.rotation.x = Math.PI / 2;
    wrap2.rotation.z = 0.10;
    grp.add(wrap2);

    // Bandage tail — hangs from the back of the wrap
    const tailGeo = new THREE.BoxGeometry(0.08, 0.28, 0.035);
    const tail = new THREE.Mesh(tailGeo, bandageMat);
    tail.position.set(-0.22, 0.22, -0.18);
    tail.rotation.z = 0.35;
    grp.add(tail);
    _playerBandageTail = tail;

    // Arms — thick and stubby with rounded fist ends matching spritesheet
    const armGeo = new THREE.CylinderGeometry(0.06, 0.10, 0.24, 8);
    const limbMat = new THREE.MeshPhongMaterial({
      color: 0x4FC3F7, emissive: 0x0d47a1, emissiveIntensity: 0.15,
      transparent: true, opacity: 0.85
    });

    const leftArm = new THREE.Mesh(armGeo, limbMat);
    leftArm.position.set(-0.38, -0.04, 0.05);
    leftArm.rotation.z = Math.PI / 5;
    grp.add(leftArm);
    _playerLeftArm = leftArm;
    // Left fist
    const fistGeo = new THREE.SphereGeometry(0.10, 8, 8);
    const leftFist = new THREE.Mesh(fistGeo, limbMat);
    leftFist.position.set(-0.44, -0.18, 0.05);
    grp.add(leftFist);

    const rightArm = new THREE.Mesh(armGeo, limbMat);
    rightArm.position.set(0.38, -0.04, 0.05);
    rightArm.rotation.z = -Math.PI / 5;
    grp.add(rightArm);
    _playerRightArm = rightArm;
    // Right fist
    const rightFist = new THREE.Mesh(fistGeo, limbMat);
    rightFist.position.set(0.44, -0.18, 0.05);
    grp.add(rightFist);

    // Gun (held by right arm)
    const gunBodyGeo = new THREE.BoxGeometry(0.10, 0.14, 0.30);
    const gunMat = new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 40 });
    const gunBody = new THREE.Mesh(gunBodyGeo, gunMat);
    gunBody.position.set(0.38, -0.06, 0.30);
    grp.add(gunBody);
    _playerGunBody = gunBody;

    // Gun barrel
    const barrelGeo = new THREE.CylinderGeometry(0.03, 0.025, 0.26, 8);
    const barrelMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.38, -0.06, 0.50);
    grp.add(barrel);

    // Gun handle
    const handleGeo = new THREE.BoxGeometry(0.06, 0.16, 0.08);
    const handleMat = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(0.38, -0.20, 0.22);
    handle.rotation.z = -Math.PI / 6;
    grp.add(handle);

    // Legs — short and thick matching spritesheet's stubby legs
    const legGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.24, 8);
    const leftLeg = new THREE.Mesh(legGeo, limbMat);
    leftLeg.position.set(-0.16, -0.42, 0);
    grp.add(leftLeg);
    _playerLeftLeg = leftLeg;
    // Left foot
    const footGeo = new THREE.SphereGeometry(0.09, 8, 6);
    const leftFoot = new THREE.Mesh(footGeo, limbMat);
    leftFoot.position.set(-0.16, -0.54, 0.02);
    leftFoot.scale.set(1, 0.6, 1.2);
    grp.add(leftFoot);

    const rightLeg = new THREE.Mesh(legGeo, limbMat);
    rightLeg.position.set(0.16, -0.42, 0);
    grp.add(rightLeg);
    _playerRightLeg = rightLeg;
    // Right foot
    const rightFoot = new THREE.Mesh(footGeo, limbMat);
    rightFoot.position.set(0.16, -0.54, 0.02);
    rightFoot.scale.set(1, 0.6, 1.2);
    grp.add(rightFoot);

    // Ground shadow disc
    const shadowGeo = new THREE.CircleGeometry(0.45, 32);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.3,
      depthWrite: false, side: THREE.DoubleSide, alphaTest: 0.01
    });
    const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = -PLAYER_RADIUS + 0.02;
    grp.add(shadowDisc);

    grp.position.set(_playerPos.x, PLAYER_RADIUS, _playerPos.z);
    _playerMesh = grp;
    _campScene.add(grp);

    // Sprite overlay disabled — spritesheet PNGs lack alpha transparency,
    // causing a large opaque square to render over the 3D character.
    // _initSpriteOverlay();
  }

  // ── Sprite overlay initialization ─────────────────────────
  function _initSpriteOverlay() {
    if (!window.SpriteAnimator || !_playerMesh) return;
    _spriteAnimator = new window.SpriteAnimator(_campScene);
    _spriteAnimator.load().then(() => {
      const spriteMesh = _spriteAnimator.createMesh(1.8);
      if (spriteMesh) {
        spriteMesh.position.y = 0.3; // center on character
        _playerMesh.add(spriteMesh);
        _spriteAnimator.setVisible(true);
        _spriteAnimator.play('idle');
      }
    }).catch(() => {
      // Spritesheets not available — no overlay; 3D character still works
      _spriteAnimator = null;
    });
  }

  // ── Benny NPC ─────────────────────────────────────────────
  function _buildBennyNPC() {
    const THREE = T();
    const grp = new THREE.Group();

    // Body: tie-dye patchwork tunic — hippie homemade clothes
    const bodyGeo = new THREE.CylinderGeometry(0.28, 0.38, 1.1, 8);
    const bodyMat = new THREE.MeshPhongMaterial({
      color: 0x2E8B57,    // sea-green — tie-dye patchwork look
      emissive: 0x0A3A1A,
      emissiveIntensity: 0.25,
      shininess: 20
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.55;
    body.castShadow = true;
    grp.add(body);

    // Belt / sash patch (contrasting colour for homemade-clothes feel)
    const sashGeo = new THREE.CylinderGeometry(0.30, 0.32, 0.15, 8);
    const sashMat = new THREE.MeshPhongMaterial({
      color: 0xDAA520,   // goldenrod sash
      emissive: 0x4A3000,
      emissiveIntensity: 0.2,
      shininess: 15
    });
    const sash = new THREE.Mesh(sashGeo, sashMat);
    sash.position.y = 0.72;
    grp.add(sash);

    // Head: simple sphere, warm skin tone
    const headGeo = new THREE.SphereGeometry(0.26, 10, 8);
    const headMat = new THREE.MeshPhongMaterial({
      color: 0xC68642,
      emissive: 0x402010,
      emissiveIntensity: 0.15,
      shininess: 30
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.32;
    head.castShadow = true;
    grp.add(head);

    // Dreadlocks — multiple thin cylinders hanging from the head
    const dreadMat = new THREE.MeshPhongMaterial({
      color: 0x1A0A00,   // dark brown / black dreads
      emissive: 0x0A0500,
      emissiveIntensity: 0.1,
      shininess: 10
    });
    const dreadAngles = [0, 0.8, 1.6, 2.4, 3.2, 4.0, 4.8, 5.6];
    for (let di = 0; di < dreadAngles.length; di++) {
      const da = dreadAngles[di];
      const dreadLen = 0.5 + Math.random() * 0.25;
      const dreadGeo = new THREE.CylinderGeometry(0.035, 0.025, dreadLen, 4);
      const dread = new THREE.Mesh(dreadGeo, dreadMat);
      const dreadR = 0.22;
      dread.position.set(
        Math.sin(da) * dreadR,
        1.12 - dreadLen * 0.35,
        Math.cos(da) * dreadR
      );
      dread.rotation.x = (Math.random() - 0.5) * 0.5;
      dread.rotation.z = (Math.sin(da) * 0.3);
      dread.castShadow = true;
      grp.add(dread);
    }

    // Small round sunglasses (hippie look)
    const glassMat = new THREE.MeshPhongMaterial({
      color: 0x111111,
      emissive: 0x222244,
      emissiveIntensity: 0.3,
      shininess: 80,
      transparent: true,
      opacity: 0.7
    });
    const glassGeo = new THREE.SphereGeometry(0.07, 6, 4);
    const glassL = new THREE.Mesh(glassGeo, glassMat);
    glassL.position.set(-0.1, 1.35, 0.22);
    grp.add(glassL);
    const glassR = new THREE.Mesh(glassGeo, glassMat);
    glassR.position.set(0.1, 1.35, 0.22);
    grp.add(glassR);

    grp.position.set(BENNY_POS.x, 0, BENNY_POS.z);
    _bennyMesh = grp;
    _campScene.add(grp);
  }

  // Update Benny NPC each frame (gentle idle bob + speech bubble position)
  function _updateBennyNPC(dt) {
    if (!_bennyMesh || !_campScene) return;
    const THREE = T();

    // Gentle idle bob
    _bennyMesh.position.y = Math.sin(_campTime * 1.4) * 0.06;

    // Face the player
    if (_playerMesh) {
      const dx = _playerPos.x - BENNY_POS.x;
      const dz = _playerPos.z - BENNY_POS.z;
      if (Math.abs(dx) > 0.05 || Math.abs(dz) > 0.05) {
        const targetAngle = Math.atan2(dx, dz);
        let da = targetAngle - _bennyMesh.rotation.y;
        while (da > Math.PI)  da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        _bennyMesh.rotation.y += da * 0.05;
      }
    }

    // Project Benny's mesh position to screen space for the DialogueSystem bubble
    const DS = window.DialogueSystem;
    if (DS && DS.isActive() && _campCamera && _bennyMesh) {
      const pos3d = new THREE.Vector3(
        _bennyMesh.position.x,
        1.9 + _bennyMesh.position.y,
        _bennyMesh.position.z
      );
      pos3d.project(_campCamera);
      const sx = ( pos3d.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-pos3d.y * 0.5 + 0.5) * window.innerHeight;
      DS.setPosition(sx, sy);
    }

    // Check proximity for first-death greeting
    if (_playerMesh && !_bennyGreeted) {
      const dx = _playerPos.x - BENNY_POS.x;
      const dz = _playerPos.z - BENNY_POS.z;
      if (Math.sqrt(dx * dx + dz * dz) < BENNY_GREET_RADIUS) {
        _bennyGreeted = true;
        _triggerBennyGreeting();
      }
    }
  }

  // Trigger Benny's greeting (shown once per save after first run/death)
  function _triggerBennyGreeting() {
    if (!window.saveData) return;
    const sd = window.saveData;
    if (sd.bennyGreetingShown) return;  // already seen

    // Show greeting on first camp visit (whether before or after first death)
    sd.bennyGreetingShown = true;
    if (typeof saveSaveData === 'function') saveSaveData();

    const DS = window.DialogueSystem;
    if (!DS) {
      // Fallback if DialogueSystem not loaded
      _showBennySpeech('Heyyy dude! Welcome to camp! ✌️');
      setTimeout(function () { _hideBennySpeech(); }, 5000);
      return;
    }

    // Show camp welcome sequence, then walk to quest hall, then hint
    DS.show(DS.DIALOGUES.campWelcome, {
      onComplete: function () {
        _bennyWalkToBuild('questMission', 'Here\'s where we build the Quest Hall! I got materials for ya! 📜');
        setTimeout(function () {
          const currentQ = (typeof getCurrentQuest === 'function') ? getCurrentQuest() : null;
          if (currentQ) {
            DS.show([{ text: 'Your quest: ' + currentQ.name + '! 🎯', emotion: 'task' }]);
          } else {
            DS.show([{ text: 'Start a run and kill some enemies, then come back here dude! ⚔️', emotion: 'task' }]);
          }
        }, 5000);
      }
    });
  }

  function _showBennySpeech(text) {
    const DS = window.DialogueSystem;
    if (DS) {
      // Convert legacy newlines to spaces and show as a single happy sentence
      DS.show([{ text: text.replace(/\n/g, ' '), emotion: 'happy' }]);
    }
  }

  function _hideBennySpeech() {
    const DS = window.DialogueSystem;
    if (DS) DS.dismiss();
  }

  // Benny walk-to-building animation: smoothly moves Benny to a building, shows speech, then returns
  // Player now auto-follows Benny when he walks
  let _bennyWalking = false;
  function _bennyWalkToBuild(buildingId, speechText) {
    if (!_bennyMesh || _bennyWalking) return;
    const def = BUILDING_DEFS.find(d => d.id === buildingId);
    if (!def) return;
    _bennyWalking = true;

    // Save original positions
    const origX = BENNY_POS.x;
    const origZ = BENNY_POS.z;
    const targetX = def.x;
    const targetZ = def.z;
    const walkDuration = 1200; // ms

    // Player follow offset (slightly behind Benny)
    const playerOrigX = _playerPos ? _playerPos.x : 0;
    const playerOrigZ = _playerPos ? _playerPos.z : 3;
    // Player target: slightly offset from building position
    const PLAYER_FOLLOW_DISTANCE = 2.0;
    const dx = targetX - origX;
    const dz = targetZ - origZ;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    const playerTargetX = targetX - (dx / dist) * PLAYER_FOLLOW_DISTANCE;
    const playerTargetZ = targetZ - (dz / dist) * PLAYER_FOLLOW_DISTANCE;

    // Show "Follow me!" speech first
    const DS = window.DialogueSystem;
    if (DS) {
      DS.show([{ text: 'Follow me! 🏃', emotion: 'task' }]);
    } else {
      _showBennySpeech(speechText || 'Let me build\nthis for you! 🔨');
    }

    // Animate walk to building (both Benny and player)
    const startMs = performance.now();
    function walkStep() {
      var t = Math.min((performance.now() - startMs) / walkDuration, 1);
      var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      _bennyMesh.position.x = origX + (targetX - origX) * eased;
      _bennyMesh.position.z = origZ + (targetZ - origZ) * eased;
      // Face target direction
      var bdx = targetX - _bennyMesh.position.x;
      var bdz = targetZ - _bennyMesh.position.z;
      if (Math.abs(bdx) > 0.01 || Math.abs(bdz) > 0.01) {
        _bennyMesh.rotation.y = Math.atan2(bdx, bdz);
      }
      // Player auto-follow: smoothly move player toward their target
      if (_playerMesh) {
        _playerPos.x = playerOrigX + (playerTargetX - playerOrigX) * eased;
        _playerPos.z = playerOrigZ + (playerTargetZ - playerOrigZ) * eased;
        _playerMesh.position.x = _playerPos.x;
        _playerMesh.position.z = _playerPos.z;
        // Face Benny
        var pdx = _bennyMesh.position.x - _playerPos.x;
        var pdz = _bennyMesh.position.z - _playerPos.z;
        if (Math.abs(pdx) > 0.01 || Math.abs(pdz) > 0.01) {
          _playerMesh.rotation.y = Math.atan2(pdx, pdz);
        }
      }
      if (t < 1) {
        requestAnimationFrame(walkStep);
      } else {
        // Arrived — show building speech, wait, then walk back
        if (DS) {
          DS.show([{ text: speechText || 'Here we are! Let\'s build this! 🔨', emotion: 'happy' }]);
        }
        setTimeout(function () {
          _hideBennySpeech();
          var retStart = performance.now();
          function returnStep() {
            var rt = Math.min((performance.now() - retStart) / walkDuration, 1);
            var re = rt < 0.5 ? 2 * rt * rt : 1 - Math.pow(-2 * rt + 2, 2) / 2;
            _bennyMesh.position.x = targetX + (origX - targetX) * re;
            _bennyMesh.position.z = targetZ + (origZ - targetZ) * re;
            // Player returns too
            if (_playerMesh) {
              _playerPos.x = playerTargetX + (playerOrigX - playerTargetX) * re;
              _playerPos.z = playerTargetZ + (playerOrigZ - playerTargetZ) * re;
              _playerMesh.position.x = _playerPos.x;
              _playerMesh.position.z = _playerPos.z;
            }
            if (rt < 1) {
              requestAnimationFrame(returnStep);
            } else {
              _bennyMesh.position.x = origX;
              _bennyMesh.position.z = origZ;
              if (_playerMesh) {
                _playerPos.x = playerOrigX;
                _playerPos.z = playerOrigZ;
                _playerMesh.position.x = playerOrigX;
                _playerMesh.position.z = playerOrigZ;
              }
              _bennyWalking = false;
            }
          }
          requestAnimationFrame(returnStep);
        }, 1500);
      }
    }
    requestAnimationFrame(walkStep);
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
      case 'campBoard':          return _buildCampBoard(def);
      case 'specialAttacks':     return _buildSpecialAttacksArena(def);
      case 'warehouse':          return _buildWarehouse(def);
      case 'tavern':             return _buildTavern(def);
      case 'shop':               return _buildShop(def);
      case 'prestige':           return _buildPrestigeAltar(def);
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
    const THREE = T();
    return new THREE.MeshLambertMaterial( { color } );
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
  // ── Camp Board ─ glowing notice board near campfire ──────
  function _buildCampBoard(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Main post
    const postGeo = new THREE.CylinderGeometry(0.12, 0.15, 2.8, 8);
    const post = _mesh(postGeo, _lambert(0x4d2c0a));
    post.position.y = 1.4;
    post.castShadow = true;
    grp.add(post);

    // Board frame
    const frameGeo = new THREE.BoxGeometry(2.2, 1.4, 0.14);
    const frame = _mesh(frameGeo, _lambert(0x5c3317));
    frame.position.y = 2.6;
    frame.castShadow = true;
    grp.add(frame);

    // Board surface (golden glow)
    const boardGeo = new THREE.BoxGeometry(1.9, 1.1, 0.06);
    const board = _mesh(boardGeo, _mat(0xf0d890, 0xf0d890, 0.5));
    board.position.set(0, 2.6, 0.11);
    grp.add(board);

    // Decorative tacks (four corners)
    const tackGeo = new THREE.SphereGeometry(0.05, 6, 6);
    const tackMat = _mat(0xffd700, 0xffd700, 0.8);
    for (const [tx, ty] of [[-0.8, 0.4], [0.8, 0.4], [-0.8, -0.4], [0.8, -0.4]]) {
      const tack = _mesh(tackGeo, tackMat);
      tack.position.set(tx, 2.6 + ty, 0.15);
      grp.add(tack);
    }

    // Warm glow point light
    const glow = new THREE.PointLight(0xf0d890, 1.8, 6, 2);
    glow.position.set(0, 2.8, 0.6);
    grp.add(glow);

    _addNameSign(grp, def.label, 0, 3.7, 0);
    return grp;
  }

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

  // ── Special Attacks Arena ─ octagonal training arena ────
  function _buildSpecialAttacksArena(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Octagonal stone floor
    const floorGeo = new THREE.CylinderGeometry(3.5, 3.5, 0.2, 8);
    const floorMat = _lambert(0x2a2a3a);
    const floor = _mesh(floorGeo, floorMat);
    floor.position.y = 0.1;
    grp.add(floor);

    // Low stone wall ring
    const wallGeo = new THREE.CylinderGeometry(3.6, 3.6, 1.1, 8, 1, true);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x404055, side: THREE.DoubleSide });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.y = 0.75;
    grp.add(wall);

    // Central weapon rack (cross of cylinders)
    const rackMat = _lambert(0x884422);
    for (let i = 0; i < 2; i++) {
      const rGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6);
      const rack = _mesh(rGeo, rackMat);
      rack.position.y = 1.2;
      rack.rotation.z = (i * Math.PI) / 2;
      grp.add(rack);
    }

    // Glowing energy orb in the center
    const orbGeo = new THREE.SphereGeometry(0.5, 12, 8);
    const orbMat = new THREE.MeshPhongMaterial({
      color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.9,
      transparent: true, opacity: 0.85
    });
    const orb = _mesh(orbGeo, orbMat);
    orb.position.y = 2.0;
    grp.add(orb);

    // Pulsing light from the orb
    const orbLight = new THREE.PointLight(0xff4400, 2.0, 8, 2);
    orbLight.position.set(0, 2.0, 0);
    grp.add(orbLight);

    // Corner pillars
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pillarGeo = new THREE.CylinderGeometry(0.2, 0.25, 2.5, 6);
      const pillar = _mesh(pillarGeo, _lambert(0x555566));
      pillar.position.set(Math.cos(a) * 3.0, 1.25, Math.sin(a) * 3.0);
      pillar.castShadow = true;
      grp.add(pillar);

      // Torch on each pillar
      const torchGeo = new THREE.BoxGeometry(0.18, 0.35, 0.18);
      const torch = _mesh(torchGeo, _mat(0xffcc44, 0xffcc44, 0.8));
      torch.position.set(Math.cos(a) * 3.0, 2.7, Math.sin(a) * 3.0);
      const tLight = new THREE.PointLight(0xffcc44, 1.0, 5, 2);
      tLight.position.copy(torch.position);
      grp.add(torch);
      grp.add(tLight);
    }

    _addNameSign(grp, def.label, 0, 4.0, 0);
    return grp;
  }

  // ── Warehouse ─ storage building with crates ─────────────
  function _buildWarehouse(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Base
    const baseGeo = new THREE.BoxGeometry(6, 0.2, 5);
    grp.add(_mesh(baseGeo, _lambert(0x1a120a)));

    // Walls
    const wallGeo = new THREE.BoxGeometry(5.5, 3.5, 4.5);
    const walls = _mesh(wallGeo, _lambert(0x7a5c3a));
    walls.position.y = 1.95;
    walls.castShadow = true;
    grp.add(walls);

    // Flat roof with slight overhang
    const roofGeo = new THREE.BoxGeometry(6.2, 0.3, 5.2);
    const roof = _mesh(roofGeo, _lambert(0x5c3d1e));
    roof.position.y = 3.85;
    roof.castShadow = true;
    grp.add(roof);

    // Door (large double door)
    const doorGeo = new THREE.BoxGeometry(1.6, 2.4, 0.15);
    const door = _mesh(doorGeo, _lambert(0x3d2005));
    door.position.set(0, 1.4, 2.35);
    grp.add(door);

    // Storage crates outside
    const cratePositions = [[-2.2, 0], [2.2, 0], [-2.2, -1], [2.2, -1]];
    cratePositions.forEach(([cx, cz]) => {
      const cGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
      const crate = _mesh(cGeo, _lambert(0xc8a870));
      crate.position.set(cx, 0.45, cz - 2.8);
      crate.rotation.y = Math.random() * 0.4;
      crate.castShadow = true;
      grp.add(crate);
    });

    // Lantern
    const lanternGeo = new THREE.BoxGeometry(0.3, 0.4, 0.3);
    const lantern = _mesh(lanternGeo, _mat(0xffcc44, 0xffcc44, 0.8));
    lantern.position.set(0, 3.3, 2.4);
    const lLight = new THREE.PointLight(0xffcc44, 1.0, 6, 2);
    lLight.position.copy(lantern.position);
    grp.add(lantern);
    grp.add(lLight);

    _addNameSign(grp, def.label, 0, 4.6, 0);
    return grp;
  }

  // ── Tavern ─ cozy inn with warm interior glow ────────────
  function _buildTavern(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Foundation
    const baseGeo = new THREE.BoxGeometry(6, 0.25, 5.5);
    grp.add(_mesh(baseGeo, _lambert(0x2e1a0a)));

    // Walls (warm beige/cream)
    const wallGeo = new THREE.BoxGeometry(5.5, 4, 5);
    const walls = _mesh(wallGeo, _lambert(0xa07848));
    walls.position.y = 2.25;
    walls.castShadow = true;
    grp.add(walls);

    // Sloped roof
    const roofGeo = new THREE.CylinderGeometry(0, 4.2, 2.2, 4);
    const roof = _mesh(roofGeo, _lambert(0x8b2500));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 5.35;
    roof.castShadow = true;
    grp.add(roof);

    // Door
    const doorGeo = new THREE.BoxGeometry(1.2, 2.5, 0.15);
    const door = _mesh(doorGeo, _lambert(0x3d1a05));
    door.position.set(0, 1.5, 2.6);
    grp.add(door);

    // Hanging sign
    const signPostGeo = new THREE.BoxGeometry(0.1, 1.5, 0.1);
    const signPost = _mesh(signPostGeo, _lambert(0x4d2c0a));
    signPost.position.set(1.8, 3.5, 2.7);
    grp.add(signPost);
    const signBoardGeo = new THREE.BoxGeometry(1.4, 0.7, 0.1);
    const signBoard = _mesh(signBoardGeo, _lambert(0xd4a838));
    signBoard.position.set(1.1, 3.1, 2.75);
    grp.add(signBoard);

    // Warm glow from windows
    const winLight = new THREE.PointLight(0xff9944, 1.5, 8, 2);
    winLight.position.set(0, 2.5, 1);
    grp.add(winLight);

    // Lanterns on either side
    for (let s = -1; s <= 1; s += 2) {
      const lGeo = new THREE.BoxGeometry(0.3, 0.5, 0.3);
      const lantern = _mesh(lGeo, _mat(0xffcc44, 0xffcc44, 0.9));
      lantern.position.set(s * 2.4, 3.8, 2.6);
      const lLight = new THREE.PointLight(0xffcc44, 1.2, 6, 2);
      lLight.position.copy(lantern.position);
      grp.add(lantern);
      grp.add(lLight);
    }

    _addNameSign(grp, def.label, 0, 6.0, 0);
    return grp;
  }

  // ── Shop ─ market stall with colourful awning ────────────
  function _buildShop(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Base platform
    const baseGeo = new THREE.BoxGeometry(5.5, 0.25, 5);
    grp.add(_mesh(baseGeo, _lambert(0x1a1208)));

    // Walls (light stone)
    const wallGeo = new THREE.BoxGeometry(5, 3.5, 4.5);
    const walls = _mesh(wallGeo, _lambert(0xd4c8a0));
    walls.position.y = 2.0;
    walls.castShadow = true;
    grp.add(walls);

    // Flat roof
    const roofGeo = new THREE.BoxGeometry(5.8, 0.25, 5.3);
    const roof = _mesh(roofGeo, _lambert(0x4a8c3a));
    roof.position.y = 3.85;
    grp.add(roof);

    // Awning (angled)
    const awningGeo = new THREE.BoxGeometry(5.4, 0.1, 1.6);
    const awning = _mesh(awningGeo, _mat(0xFFD700, 0xCC8800, 0.3));
    awning.position.set(0, 3.5, 2.8);
    awning.rotation.x = -0.3;
    grp.add(awning);

    // Counter / display table
    const counterGeo = new THREE.BoxGeometry(3.5, 0.8, 0.9);
    const counter = _mesh(counterGeo, _lambert(0x8b6914));
    counter.position.set(0, 1.0, 2.4);
    grp.add(counter);

    // Gold coin stack (decorative)
    for (let i = 0; i < 3; i++) {
      const coinGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 8);
      const coin = _mesh(coinGeo, _mat(0xFFD700, 0xCC8800, 0.4));
      coin.position.set(-0.6 + i * 0.6, 1.5, 2.4);
      grp.add(coin);
    }

    // Welcoming light
    const shopLight = new THREE.PointLight(0xffe066, 1.4, 7, 2);
    shopLight.position.set(0, 3, 2);
    grp.add(shopLight);

    _addNameSign(grp, def.label, 0, 5.0, 0);
    return grp;
  }

  // ── Prestige Altar ─ glowing stone ring altar ────────────
  function _buildPrestigeAltar(def) {
    const THREE = T();
    const grp = new THREE.Group();
    grp.position.set(def.x, 0, def.z);

    // Stone platform
    const platformGeo = new THREE.CylinderGeometry(4.5, 4.8, 0.5, 12);
    grp.add(_mesh(platformGeo, _lambert(0x303040)));

    // Inner raised ring
    const ringGeo = new THREE.CylinderGeometry(3.0, 3.2, 0.8, 12);
    grp.add(_mesh(ringGeo, _lambert(0x252535)));

    // Standing rune stones around the circle
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = 3.5;
      const stoneGeo = new THREE.BoxGeometry(0.4, 2.0 + (i % 2) * 0.8, 0.4);
      const stoneMat = new THREE.MeshPhongMaterial({
        color: 0x4a3f6b,
        emissive: 0x8844ff,
        emissiveIntensity: 0.4
      });
      const stone = _mesh(stoneGeo, stoneMat);
      stone.position.set(Math.sin(a) * r, 1.4 + (i % 2) * 0.4, Math.cos(a) * r);
      stone.castShadow = true;
      grp.add(stone);
    }

    // Central glowing gem
    const gemGeo = new THREE.OctahedronGeometry(0.7, 0);
    const gemMat = new THREE.MeshPhongMaterial({
      color: 0xcc88ff, emissive: 0x8800ff, emissiveIntensity: 1.2,
      transparent: true, opacity: 0.9
    });
    const gem = _mesh(gemGeo, gemMat);
    gem.position.y = 2.0;
    grp.add(gem);

    // Orbiting light
    const altarLight = new THREE.PointLight(0x8800ff, 3.0, 14, 2);
    altarLight.position.set(0, 2.5, 0);
    grp.add(altarLight);

    // Second warm gold light
    const goldLight = new THREE.PointLight(0xFFD700, 1.5, 8, 2);
    goldLight.position.set(0, 1.5, 0);
    grp.add(goldLight);

    _addNameSign(grp, def.label, 0, 5.0, 0);
    return grp;
  }
  function _mesh(geo, mat) {
    const THREE = T();
    const m = new THREE.Mesh(geo, mat);
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
    if (!_sparkSystem || !_sparkPositions) return;
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
    if (_sparkSystem) _sparkSystem.geometry.attributes.position.needsUpdate = true;

    // ── Atmospheric dust ─────────────────────────────────────
    if (!_dustSystem || !_dustPositions) return;
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
    if (_dustSystem) _dustSystem.geometry.attributes.position.needsUpdate = true;
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
    // Flicker torch lights for cozy atmosphere
    _updateTorchFlicker();
  }

  // ──────────────────────────────────────────────────────────
  // Player movement + animation states
  // ──────────────────────────────────────────────────────────
  const CAMP_DASH_DURATION = 0.22;
  const CAMP_DASH_SPEED    = 22;
  const CAMP_SLIDE_DURATION = 0.35;
  const CAMP_RUN_THRESHOLD = 5.5;  // speed above this = running
  const CAMP_WALK_THRESHOLD = 0.5; // speed below this = idle

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

    // ── Dash trigger (Shift or double-tap) ──
    if (!_campDashing && !_campSliding && (_keys['ShiftLeft'] || _keys['ShiftRight']) && len > 0.1) {
      _campDashing = true;
      _campDashTimer = CAMP_DASH_DURATION;
      _campDashVec.x = mx;
      _campDashVec.z = mz;
    }

    // ── Slide trigger (Ctrl) ──
    if (!_campDashing && !_campSliding && (_keys['ControlLeft'] || _keys['ControlRight']) && len > 0.1) {
      _campSliding = true;
      _campSlideTimer = CAMP_SLIDE_DURATION;
    }

    // ── Action triggers (keys) ──
    if (!_campActionAnim) {
      if (_keys['KeyE']) {
        _campActionAnim = 'chop';
        _campActionTimer = 0.8;
      } else if (_keys['KeyF']) {
        _campActionAnim = 'shoot';
        _campActionTimer = 0.4;
      } else if (_keys['KeyQ']) {
        _campActionAnim = 'knife';
        _campActionTimer = 0.35;
      } else if (_keys['KeyR']) {
        _campActionAnim = 'gather';
        _campActionTimer = 1.0;
      } else if (_keys['KeyT']) {
        _campActionAnim = 'tool';
        _campActionTimer = 0.6;
      }
    }

    // ── Update dash ──
    if (_campDashing) {
      _campDashTimer -= dt;
      const dashSpeed = CAMP_DASH_SPEED;
      _playerPos.x += _campDashVec.x * dashSpeed * dt;
      _playerPos.z += _campDashVec.z * dashSpeed * dt;
      _playerVel.x = _campDashVec.x * dashSpeed;
      _playerVel.z = _campDashVec.z * dashSpeed;
      if (_campDashTimer <= 0) _campDashing = false;
    }
    // ── Update slide ──
    else if (_campSliding) {
      _campSlideTimer -= dt;
      const slideDecel = _campSlideTimer / CAMP_SLIDE_DURATION;
      _playerPos.x += _playerVel.x * slideDecel * dt;
      _playerPos.z += _playerVel.z * slideDecel * dt;
      if (_campSlideTimer <= 0) _campSliding = false;
    }
    // ── Normal movement ──
    else {
      // Smooth velocity
      const targetX = mx * PLAYER_SPEED;
      const targetZ = mz * PLAYER_SPEED;
      const lerpF = (len > 0) ? 0.18 : 0.12;
      _playerVel.x += (targetX - _playerVel.x) * lerpF;
      _playerVel.z += (targetZ - _playerVel.z) * lerpF;

      // Update position (clamp to camp area)
      _playerPos.x += _playerVel.x * dt;
      _playerPos.z += _playerVel.z * dt;
    }

    // Clamp
    _playerPos.x = Math.max(-38, Math.min(38, _playerPos.x));
    _playerPos.z = Math.max(-38, Math.min(38, _playerPos.z));

    // Update action timer
    if (_campActionAnim) {
      _campActionTimer -= dt;
      if (_campActionTimer <= 0) _campActionAnim = null;
    }

    if (!_playerMesh) return;

    _playerMesh.position.x = _playerPos.x;
    _playerMesh.position.z = _playerPos.z;

    // Rotation toward movement direction — crisp and responsive
    const speed = Math.sqrt(_playerVel.x * _playerVel.x + _playerVel.z * _playerVel.z);
    if (speed > 0.3) {
      const targetAngle = Math.atan2(_playerVel.x, _playerVel.z);
      let da = targetAngle - _playerMesh.rotation.y;
      while (da > Math.PI)  da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      // Track angular velocity for banking lean
      const angVel = da / Math.max(dt, 0.001);
      _campAngularVel += (angVel - _campAngularVel) * Math.min(dt * 12, 0.7);
      _playerMesh.rotation.y += da * 0.25;
      
      // Slide detection: sharp turn at speed
      const turnIntensity = Math.abs(_campAngularVel) * speed;
      if (turnIntensity > 15) {
        _campSlideAmt = Math.min(1, _campSlideAmt + dt * 6);
      }
    } else {
      _campAngularVel *= 0.85;
    }
    _campSlideAmt = Math.max(0, _campSlideAmt - dt * 3);

    // ── Determine animation state ──
    let newState = 'idle';
    if (_campActionAnim) {
      newState = _campActionAnim;
    } else if (_campDashing) {
      newState = 'dash';
    } else if (_campSliding) {
      newState = 'slide';
    } else if (speed > CAMP_RUN_THRESHOLD) {
      newState = 'run';
    } else if (speed > CAMP_WALK_THRESHOLD) {
      newState = 'walk';
    }

    if (newState !== _campAnimState) {
      _campAnimState = newState;
      _campAnimTimer = 0;
    }
    _campAnimTimer += dt;

    // ── Apply 3D procedural animation per state ──
    const phase = _campAnimTimer;

    // Bobbing height
    let bobY = 0;
    // Body squish
    let scaleY = 1, scaleXZ = 1;
    // Limb swing
    let armSwing = 0, legSwing = 0;

    switch (_campAnimState) {
      case 'idle':
        bobY = Math.sin(_campTime * 2.5) * 0.04;
        armSwing = Math.sin(_campTime * 1.5) * 0.08;
        break;
      case 'walk': {
        // Speed-proportional walk animation
        const walkRate = 8 + Math.min(speed * 0.5, 4);
        bobY = Math.sin(phase * walkRate) * 0.06;
        armSwing = Math.sin(phase * walkRate) * (0.25 + speed * 0.03);
        legSwing = Math.sin(phase * walkRate) * (0.30 + speed * 0.03);
        scaleY = 1.0 + Math.sin(phase * walkRate * 2) * 0.03;
        scaleXZ = 1.0 - Math.sin(phase * walkRate * 2) * 0.015;
        break;
      }
      case 'run': {
        // Speed-proportional run animation
        const runRate = 12 + Math.min(speed * 0.3, 6);
        bobY = Math.sin(phase * runRate) * 0.10;
        armSwing = Math.sin(phase * runRate) * 0.55;
        legSwing = Math.sin(phase * runRate) * 0.65;
        scaleY = 1.0 + Math.sin(phase * runRate * 2) * 0.06;
        scaleXZ = 1.0 - Math.sin(phase * runRate * 2) * 0.03;
        // Forward lean proportional to speed
        const fwdLean = -(0.10 + Math.min(speed * 0.01, 0.12));
        _campForwardLean += (fwdLean - _campForwardLean) * Math.min(dt * 12, 0.6);
        break;
      }
      case 'dash':
        bobY = -0.1;  // low to ground
        scaleY = 0.6;
        scaleXZ = 1.4;
        armSwing = -0.8; // arms back
        legSwing = -0.3;
        _campForwardLean += (-0.3 - _campForwardLean) * 0.3; // smooth strong forward lean
        break;
      case 'slide':
        bobY = -0.15;
        scaleY = 0.5;
        scaleXZ = 1.3;
        armSwing = 0; // arms out
        legSwing = 0.2;
        break;
      case 'shoot': {
        const t = _campActionTimer / 0.4;
        const recoil = Math.sin((1 - t) * Math.PI) * 0.15;
        bobY = recoil * 0.05;
        armSwing = 0;
        // Gun recoil — kick right arm back
        if (_playerRightArm) _playerRightArm.rotation.x = -0.8 + recoil * 2.0;
        if (_playerGunBody) _playerGunBody.position.z = 0.30 - recoil * 0.15;
        break;
      }
      case 'knife': {
        const t = _campActionTimer / 0.35;
        const slash = Math.sin((1 - t) * Math.PI * 2);
        armSwing = 0;
        if (_playerRightArm) _playerRightArm.rotation.x = slash * 1.2;
        if (_playerRightArm) _playerRightArm.rotation.z = -Math.PI / 6 + slash * 0.5;
        break;
      }
      case 'chop': {
        const chopPhase = Math.sin(phase * 8);
        armSwing = 0;
        if (_playerRightArm) _playerRightArm.rotation.x = chopPhase * 1.4;
        if (_playerLeftArm) _playerLeftArm.rotation.x = chopPhase * 0.6;
        bobY = Math.abs(chopPhase) * 0.04;
        break;
      }
      case 'gather': {
        const gatherPhase = Math.sin(phase * 5);
        bobY = -0.08 + Math.abs(gatherPhase) * 0.08; // bobbing down and up
        armSwing = 0;
        if (_playerRightArm) _playerRightArm.rotation.x = 0.6 + gatherPhase * 0.4;
        if (_playerLeftArm) _playerLeftArm.rotation.x = 0.6 - gatherPhase * 0.4;
        scaleY = 0.95;
        break;
      }
      case 'tool': {
        const toolPhase = Math.sin(phase * 10);
        armSwing = 0;
        if (_playerRightArm) _playerRightArm.rotation.x = toolPhase * 1.0;
        bobY = Math.abs(toolPhase) * 0.03;
        break;
      }
    }

    // Apply body position
    _playerMesh.position.y = PLAYER_RADIUS + bobY;

    // Apply body squish to first child (body mesh)
    if (_playerMesh.children[0]) {
      _playerMesh.children[0].scale.set(scaleXZ, scaleY, scaleXZ);
    }

    // Apply limb animation (only if not overridden by action states)
    if (_campAnimState !== 'shoot' && _campAnimState !== 'knife' &&
        _campAnimState !== 'chop' && _campAnimState !== 'gather' && _campAnimState !== 'tool') {
      if (_playerLeftArm) _playerLeftArm.rotation.x = armSwing;
      if (_playerRightArm) _playerRightArm.rotation.x = -armSwing;
      if (_playerLeftLeg) _playerLeftLeg.rotation.x = -legSwing;
      if (_playerRightLeg) _playerRightLeg.rotation.x = legSwing;
      // Reset gun position when not in action state
      if (_playerGunBody) _playerGunBody.position.z = 0.30;
    } else {
      // Legs stay still during action states
      if (_playerLeftLeg) _playerLeftLeg.rotation.x = 0;
      if (_playerRightLeg) _playerRightLeg.rotation.x = 0;
    }

    // Physics-based lean: forward lean + bank lean into turns
    // Bank lean driven by angular velocity — replaces static rotation that caused 'rolling'
    const maxBank = 0.20;
    const bankInput = -_campAngularVel * 0.015 * (1 + _campSlideAmt * 0.5);
    const targetBank = Math.max(-maxBank, Math.min(maxBank, bankInput));
    const campLeanDt = Math.min(dt * 12, 0.6);
    _campBankLean += (targetBank - _campBankLean) * campLeanDt;
    
    if (_campAnimState !== 'dash' && _campAnimState !== 'run') {
      // Settle forward lean for non-run states
      _campForwardLean += (0 - _campForwardLean) * Math.min(dt * 8, 0.45);
    }
    _playerMesh.rotation.x = _campForwardLean;
    _playerMesh.rotation.z = _campBankLean;

    // Bandage tail physics — sway based on movement
    if (_playerBandageTail) {
      _playerBandageTail.rotation.x = Math.sin(_campTime * 4 + speed) * 0.2 * (1 + speed * 0.1);
    }

    // ── Update sprite animator overlay (disabled — see _initSpriteOverlay) ──
    // if (_spriteAnimator) {
    //   _spriteAnimator.update(dt);
    //   if (_spriteAnimator.currentAnim() !== _campAnimState) {
    //     _spriteAnimator.play(_campAnimState);
    //   }
    // }
  }

  // ──────────────────────────────────────────────────────────
  // Camera follow
  // ──────────────────────────────────────────────────────────
  function _updateCamera(dt) {
    if (!_campCamera || !_playerMesh) return;
    // Camera offset: diagonal top-down angle similar to the main game camera
    // Main game uses an orthographic camera at (18,16,18) from player.
    // Here we mimic that with a perspective offset.
    const targetCX = _playerPos.x + 11;
    const targetCZ = _playerPos.z + 13;
    const targetCY = 14;

    if (dt === 0) {
      // Immediate snap on init
      _campCamera.position.set(targetCX, targetCY, targetCZ);
    } else {
      _campCamera.position.x += (targetCX - _campCamera.position.x) * 0.06;
      _campCamera.position.y += (targetCY - _campCamera.position.y) * 0.06;
      _campCamera.position.z += (targetCZ - _campCamera.position.z) * 0.06;
    }
    _campCamera.lookAt(_playerPos.x, 0, _playerPos.z);
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

  function _isBuildingUnlocked(buildingId) {
    if (!_saveData || !_saveData.campBuildings) return false;
    const bd = _saveData.campBuildings[buildingId];
    // A building is truly "unlocked" (enterable) ONLY when it has been built (level > 0).
    // unlocked=true with level===0 means the quest unlocked it but it still needs building.
    return bd ? (bd.level > 0) : false;
  }

  // Returns true if this building is unlocked by a quest but not yet built (level===0)
  function _isBuildingNeedsBuild(buildingId) {
    if (!_saveData || !_saveData.campBuildings) return false;
    const bd = _saveData.campBuildings[buildingId];
    return bd ? (bd.unlocked === true && !bd.level) : false;
  }

  // Returns true if this building has a ready-to-claim quest that would unlock it
  function _isBuildingReadyForBuild(buildingId) {
    if (!_saveData || !_saveData.tutorialQuests) return false;
    var map = window._buildingQuestUnlockMap;
    if (!map) return false;
    var questId = map[buildingId];
    if (!questId) return false;
    var readyToClaim = _saveData.tutorialQuests.readyToClaim || [];
    return readyToClaim.indexOf(questId) !== -1;
  }

  function _updatePromptUI() {
    if (!_promptEl) return;
    if (_nearBuilding) {
      const def = BUILDING_DEFS.find(d => d.id === _nearBuilding);
      if (def) {
        if (_isBuildingUnlocked(_nearBuilding)) {
          // Building is built (level > 0) — show ENTER
          _promptEl.textContent = `${def.icon}  ${def.label}  —  Tap / [E]`;
          if (_interactBtn) {
            _interactBtn.textContent = 'ENTER';
            _interactBtn.style.background = 'linear-gradient(135deg,#c8a248,#8b6914)';
            _interactBtn.style.display = 'block';
          }
        } else if (_isBuildingNeedsBuild(_nearBuilding)) {
          // Building unlocked by quest but not yet built — show BUILD
          _promptEl.textContent = `🔨  ${def.label}  —  Build this building! [E]`;
          if (_interactBtn) {
            _interactBtn.textContent = 'BUILD';
            _interactBtn.style.background = 'linear-gradient(135deg,#2980b9,#1a5276)';
            _interactBtn.style.display = 'block';
          }
        } else if (_isBuildingReadyForBuild(_nearBuilding)) {
          _promptEl.textContent = `🔨  ${def.label}  —  Ready to Build! [E]`;
          if (_interactBtn) {
            _interactBtn.textContent = 'BUILD';
            _interactBtn.style.background = 'linear-gradient(135deg,#2980b9,#1a5276)';
            _interactBtn.style.display = 'block';
          }
        } else {
          _promptEl.textContent = `🔒  ${def.label}  —  Complete quests to unlock this building`;
          if (_interactBtn) _interactBtn.style.display = 'none';
        }
        _promptEl.style.display = 'block';
      }
    } else {
      _promptEl.style.display = 'none';
      if (_interactBtn) _interactBtn.style.display = 'none';
    }
  }

  function _interact() {
    if (!_nearBuilding) return;
    if (_menuOpen) return; // already showing a building menu

    // If this building is locked but has a ready-to-claim quest, show the build overlay directly
    if (!_isBuildingUnlocked(_nearBuilding) && _isBuildingReadyForBuild(_nearBuilding)) {
      const def = BUILDING_DEFS.find(d => d.id === _nearBuilding);
      const buildingName = def ? def.label : _nearBuilding;
      // Auto-claim the quest silently to give rewards, then show build overlay
      const map = window._buildingQuestUnlockMap;
      if (map && map[_nearBuilding] && typeof window.claimTutorialQuest === 'function') {
        const targetId = _nearBuilding;
        // Claim rewards without re-triggering build overlay from claimTutorialQuest
        // by temporarily patching _campShowBuildOverlay. Use try-finally so the
        // original is always restored even if claimTutorialQuest throws.
        const origOverlay = window._campShowBuildOverlay;
        window._campShowBuildOverlay = null;
        try {
          window.claimTutorialQuest(map[targetId]);
        } finally {
          window._campShowBuildOverlay = origOverlay;
        }
        // Now show our own build overlay
        if (typeof origOverlay === 'function') {
          origOverlay(targetId, buildingName);
        }
      }
      return;
    }

    // Building is unlocked by quest but not yet built — show build overlay
    if (_isBuildingNeedsBuild(_nearBuilding)) {
      const def = BUILDING_DEFS.find(d => d.id === _nearBuilding);
      const buildingName = def ? def.label : _nearBuilding;
      if (typeof window._campShowBuildOverlay === 'function') {
        window._campShowBuildOverlay(_nearBuilding, buildingName);
      }
      return;
    }

    // Block interaction with locked buildings
    if (!_isBuildingUnlocked(_nearBuilding)) {
      if (typeof showStatusMessage === 'function') {
        showStatusMessage('🔒 Complete quests to unlock this building!', 2000);
      }
      return;
    }
    const fn = _callbacks[_nearBuilding];
    if (typeof fn === 'function') {
      // Pause camp input while the building menu is open
      _menuOpen = true;
      _playerVel.x = 0;
      _playerVel.z = 0;
      _keys = {};
      _touch.active = false;
      _touch.x = 0;
      _touch.y = 0;
      _hideTouchIndicator();
      if (_promptEl) _promptEl.style.display = 'none';
      if (_interactBtn) _interactBtn.style.display = 'none';
      fn();
    } else {
      console.warn('[CampWorld] No callback registered for building:', _nearBuilding);
    }
  }

  // Known overlay/screen element IDs that camp building callbacks may show.
  // Used by _checkMenuClosed() to auto-detect when the player closes a menu.
  const _OVERLAY_IDS = [
    'gear-screen', 'achievements-screen', 'progression-shop',
    'companion-house-modal', 'inventory-screen-modal',
    'camp-board-overlay', 'special-attacks-panel-overlay',
    'quest-hall-overlay', 'prestige-menu', 'expeditions-menu'
  ];

  /**
   * Auto-detect when a building overlay has been dismissed.
   * If _menuOpen is true but no known overlay is visible, resume camp input.
   */
  function _checkMenuClosed() {
    if (!_menuOpen) return;
    const campScreen = document.getElementById('camp-screen');
    // If camp-screen itself is hidden, another full-screen took over; wait for it.
    if (campScreen && campScreen.style.display === 'none') return;

    // Check if any overlay element (from the building callback list) is visible
    for (let i = 0; i < _OVERLAY_IDS.length; i++) {
      const el = document.getElementById(_OVERLAY_IDS[i]);
      if (!el) continue;
      // Use getComputedStyle so we catch CSS-visible elements as well as inline-styled ones
      var cs = getComputedStyle(el);
      if (cs.display !== 'none') return;
    }

    // Check for camp tab panels that might be open (skill tree, training)
    const campTabs = document.getElementById('camp-tabs');
    if (campTabs) {
      var cts = getComputedStyle(campTabs);
      if (cts.display !== 'none') return;
    }

    // No overlay detected — resume camp input
    _resumeInput();
  }

  function _resumeInput() {
    if (!_menuOpen) return;
    _menuOpen = false;
    _keys = {};
    _touch.active = false;
    _touch.x = 0;
    _touch.y = 0;
    // Refresh prompt in case building state changed while menu was open
    _updatePromptUI();
  }

  // ──────────────────────────────────────────────────────────
  // Refresh building visibility based on save data
  // ──────────────────────────────────────────────────────────
  function _refreshBuildings() {
    if (!_saveData) return;
    const THREE = T();
    for (const def of BUILDING_DEFS) {
      const grp = _buildingMeshes[def.id];
      if (!grp) continue;
      const bd = _saveData.campBuildings && _saveData.campBuildings[def.id];
      const isUnlocked = bd ? (bd.unlocked === true) : false;
      const isBuilt = bd ? (bd.level > 0) : false;

      if (isBuilt) {
        // Fully built — show normally
        grp.visible = true;
        _setBlueprintMode(grp, false);
        _setConstructionMode(grp, false);
      } else if (isUnlocked) {
        // Unlocked by quest but NOT yet built — show in construction/scaffolding mode
        grp.visible = true;
        _setBlueprintMode(grp, false);
        _setConstructionMode(grp, true);
      } else {
        // Locked — show as semi-transparent blueprint outline
        grp.visible = true;
        _setBlueprintMode(grp, true);
        _setConstructionMode(grp, false);
      }
    }
  }

  // Apply or remove blueprint (locked) visual mode to a building group
  function _setBlueprintMode(grp, enable) {
    const THREE = T();
    grp.traverse(child => {
      if (!child.isMesh) return;
      if (enable) {
        // Store original material if not already stored
        if (!child.userData._origMaterial) {
          child.userData._origMaterial = child.material;
        }
        // Blueprint: wireframe + semi-transparent blue tint
        if (!child.userData._blueprintMat) {
          child.userData._blueprintMat = new THREE.MeshBasicMaterial({
            color: 0x4488FF,
            transparent: true,
            opacity: 0.18,
            wireframe: false,
            depthWrite: false,
            side: THREE.DoubleSide
          });
        }
        child.material = child.userData._blueprintMat;
      } else {
        // Restore original material
        if (child.userData._origMaterial) {
          child.material = child.userData._origMaterial;
        }
      }
    });
  }

  // Apply or remove construction (needs-build) visual mode to a building group.
  // Shows the building as a semi-transparent orange scaffold — distinct from both
  // the blue blueprint (locked) and normal (built) appearances.
  function _setConstructionMode(grp, enable) {
    const THREE = T();
    grp.traverse(child => {
      if (!child.isMesh) return;
      if (enable) {
        if (!child.userData._origMaterial) {
          child.userData._origMaterial = child.material;
        }
        if (!child.userData._constructionMat) {
          child.userData._constructionMat = new THREE.MeshBasicMaterial({
            color: 0xFF9933,
            transparent: true,
            opacity: 0.45,
            wireframe: true,
            depthWrite: false,
            side: THREE.DoubleSide
          });
        }
        child.material = child.userData._constructionMat;
      } else {
        // Restore original material if currently showing construction mode
        if (child.userData._origMaterial && child.userData._constructionMat &&
            (child.material === child.userData._constructionMat)) {
          child.material = child.userData._origMaterial;
        }
      }
    });
  }

  // Play a construction animation when a building is first unlocked
  function _playBuildingUnlockAnimation(buildingId) {
    const grp = _buildingMeshes[buildingId];
    if (!grp) return;
    const THREE = T();

    // Remove blueprint and construction mode immediately
    _setBlueprintMode(grp, false);
    _setConstructionMode(grp, false);

    // Flash effect: scale up from 0 → 1.07 → 1.0 over ~0.7 seconds (ease-out with slight overshoot)
    const ANIM_DURATION_MS      = 700;
    const OVERSHOOT_THRESHOLD   = 0.85; // fraction of duration at which peak overshoot is reached
    const OVERSHOOT_PEAK_SCALE  = 1.07; // maximum scale during overshoot
    const OVERSHOOT_AMOUNT      = OVERSHOOT_PEAK_SCALE - 1.0; // how much past 1.0 we go

    const startTime = performance.now();
    grp.scale.set(0.01, 0.01, 0.01);

    function animStep() {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / ANIM_DURATION_MS, 1.0);
      const scale = t < OVERSHOOT_THRESHOLD
        ? OVERSHOOT_PEAK_SCALE * (t / OVERSHOOT_THRESHOLD)
        : OVERSHOOT_PEAK_SCALE - OVERSHOOT_AMOUNT * ((t - OVERSHOOT_THRESHOLD) / (1.0 - OVERSHOOT_THRESHOLD));
      grp.scale.set(scale, scale, scale);
      if (t < 1.0) {
        requestAnimationFrame(animStep);
      } else {
        grp.scale.set(1, 1, 1);
      }
    }
    requestAnimationFrame(animStep);

    // Golden particle burst to celebrate the unlock
    if (_campScene) {
      const PART_COUNT = 40;
      const pGeo = new THREE.BufferGeometry();
      const pPos = new Float32Array(PART_COUNT * 3);
      const pVel = [];
      for (let i = 0; i < PART_COUNT; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 2.5;
        pPos[i * 3]     = grp.position.x + Math.sin(a) * r;
        pPos[i * 3 + 1] = grp.position.y + 0.5 + Math.random() * 2;
        pPos[i * 3 + 2] = grp.position.z + Math.cos(a) * r;
        pVel.push({
          x: (Math.random() - 0.5) * 2.5,
          y: 2.5 + Math.random() * 3.5,
          z: (Math.random() - 0.5) * 2.5
        });
      }
      pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
      const pMat = new THREE.PointsMaterial({
        color: 0xFFD700, size: 0.25, transparent: true, opacity: 1.0
      });
      const particles = new THREE.Points(pGeo, pMat);
      _campScene.add(particles);

      const pStartMs = performance.now();
      function animParticles() {
        const pt = Math.min((performance.now() - pStartMs) / 1800, 1);
        pMat.opacity = 1.0 - pt;
        for (let i = 0; i < PART_COUNT; i++) {
          pPos[i * 3]     += pVel[i].x * 0.016;
          pPos[i * 3 + 1] += pVel[i].y * 0.016;
          pPos[i * 3 + 2] += pVel[i].z * 0.016;
          pVel[i].y -= 4 * 0.016; // gravity
        }
        pGeo.attributes.position.needsUpdate = true;
        if (pt < 1) {
          requestAnimationFrame(animParticles);
        } else {
          _campScene.remove(particles);
          pGeo.dispose();
          pMat.dispose();
        }
      }
      requestAnimationFrame(animParticles);
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
        'touch-action:manipulation',
      ].join(';');
      btn.addEventListener('click', () => _interact());
      btn.addEventListener('touchend', (e) => { e.preventDefault(); _interact(); });
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
    if (!_isActive || _menuOpen) return;
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
    if (!_isActive || _menuOpen) return;
    // Don't intercept touches aimed at overlay panels above the 3D camp
    var t0 = e.changedTouches[0];
    if (t0) {
      var el = document.elementFromPoint(t0.clientX, t0.clientY);
      if (el) {
        // Let touches on interactive elements (buttons, links, inputs) pass through
        if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT' ||
            el.tagName === 'SELECT' || el.closest('button') || el.closest('a')) return;
        // If the touched element is inside a fixed overlay (z-index ≥ 100), let it handle the event
        var node = el;
        while (node && node !== document.body) {
          var zIdx = 0;
          if (node.style && node.style.zIndex) zIdx = parseInt(node.style.zIndex, 10);
          if (!zIdx && node.nodeType === 1) {
            var cs = window.getComputedStyle(node);
            if (cs.zIndex && cs.zIndex !== 'auto') zIdx = parseInt(cs.zIndex, 10);
          }
          if (zIdx >= 100) return;
          node = node.parentElement;
        }
      }
    }
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
    if (!_isActive || !_touch.active || _menuOpen) return;
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
   * warmUp(renderer)
   * Pre-build the camp scene in the background (called at game init, not on first death).
   * This eliminates the synchronous scene-build freeze on the first camp visit.
   */
  function warmUp(rendererRef) {
    if (_campScene || _isBuilding) return; // Already built or building
    if (!T()) {
      // THREE not yet available — wait and retry
      _waitForTHREE(function () { warmUp(rendererRef); });
      return;
    }
    _renderer = rendererRef;
    _isBuilding = true;
    try {
      _buildScene();
      console.log('[CampWorld] Scene pre-warmed successfully');
    } catch (e) {
      console.warn('[CampWorld] Pre-warm failed:', e);
      _campScene = null;
    }
    _isBuilding = false;
  }

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
      // Retry: wait for window.THREE then re-enter
      _waitForTHREE(function () { enter(renderer, saveData, callbacks); });
      return;
    }

    _renderer  = renderer;
    _saveData  = saveData;
    _callbacks = callbacks || {};

    // Build scene once — wrap in try/catch so a partial build failure
    // resets _campScene to null, allowing a clean retry on the next enter().
    // Note: JavaScript is single-threaded so warmUp() (called via setTimeout) will
    // always complete fully before enter() runs. _isBuilding guards against any
    // unexpected re-entrant scenario.
    if (!_campScene) {
      if (_isBuilding) {
        // This path should not occur in practice (single-threaded JS), but as a
        // safety valve: skip activation and let the caller try again on next visit.
        console.warn('[CampWorld] enter() called while scene is building — retry will succeed');
        return;
      }
      _isBuilding = true;
      try {
        _buildScene();
      } catch (e) {
        console.error('[CampWorld] _buildScene() failed — will retry on next enter():', e);
        _campScene = null; // ensure a full rebuild is attempted next time
        _isBuilding = false;
        return;
      }
      _isBuilding = false;
    }

    // Reset player to spawn — wrap in try/catch so any unexpected setup
    // failure does not block camp activation (scene is already built).
    try {
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

      // Show resource HUD in camp mode (always shows wood/stone/coal even at 0)
      if (window.GameHarvesting) {
        window.GameHarvesting.showCampHUD(_saveData);
      }

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

      // Reset Benny greeting so proximity check re-runs on each camp visit
      // (but _triggerBennyGreeting() checks bennyGreetingShown in save data so it only shows once)
      _bennyGreeted = false;

      // Benny quest-aware speech on returning to camp (after first greeting already shown)
      if (window.saveData && window.saveData.bennyGreetingShown) {
        setTimeout(function () {
          if (!_isActive) return;
          var sd = window.saveData;
          var tq = sd && sd.tutorialQuests;
          if (tq && tq.readyToClaim && tq.readyToClaim.length > 0) {
            _showBennySpeech('Duuude welcome back!\nGo claim your\nquest in the\nMain Building! 📜');
            setTimeout(function () { _hideBennySpeech(); }, 4000);
          } else if (tq && tq.currentQuest) {
            var currentQ = (typeof getCurrentQuest === 'function') ? getCurrentQuest() : null;
            if (currentQ) {
              // Show gathering reminder if first gather not done
              if (sd && !sd.gatheringProgress) sd.gatheringProgress = {};
              var gp = sd && sd.gatheringProgress;
              var res = sd && sd.resources;
              if (gp && !gp.firstGatherDone && (currentQ.id === 'questForge0_unlock' || currentQ.id === 'questForge0b_craftTools')) {
                _showBennySpeech('Duude! Build the\nForge and craft\ntools to gather\nresources! 🔨');
                setTimeout(function () { _hideBennySpeech(); }, 5000);
              } else {
                _showBennySpeech('Hey dude!\nYour quest:\n' + currentQ.name);
                setTimeout(function () { _hideBennySpeech(); }, 3500);
              }
            }
          }
        }, 1500);
      }
    } catch (setupErr) {
      console.warn('[CampWorld] Non-critical setup error in enter():', setupErr);
    }

    _isActive = true;
    if (typeof window._syncJoystickZone === 'function') window._syncJoystickZone();
  }

  /**
   * exit()
   * Called by main.js when leaving camp.
   */
  function exit() {
    _isActive = false;
    if (typeof window._syncJoystickZone === 'function') window._syncJoystickZone();
    _menuOpen = false;
    _keys = {};
    _touch.active = false;
    _touch.x = 0;
    _touch.y = 0;
    _nearBuilding = null;
    if (_promptEl) _promptEl.style.display = 'none';
    if (_interactBtn) _interactBtn.style.display = 'none';
    _hideTouchIndicator();
    _hideBennySpeech();
    // Reset camp animation state
    _campAnimState = 'idle';
    _campAnimTimer = 0;
    _campDashing = false;
    _campSliding = false;
    _campActionAnim = null;
    // Remove camp mode from resource HUD when leaving camp
    if (window.GameHarvesting) window.GameHarvesting.hideCampHUD();

    // Reset main-game joystick state so sticks don't stay "active" into the next run.
    // Use window._campJoystick / _campJoystickRight which are the same objects as
    // joystickLeft / joystickRight in main.js (set before camp-world.js loads).
    const _jLeft  = window._campJoystick;
    const _jRight = window._campJoystickRight;
    if (_jLeft)  { _jLeft.active  = false; _jLeft.x  = 0; _jLeft.y  = 0; _jLeft.id  = null; }
    if (_jRight) { _jRight.active = false; _jRight.x = 0; _jRight.y = 0; _jRight.id = null; }
  }

  /**
   * update(dt)
   * Per-frame logic update.  Called from main.js animate() when isActive.
   */
  function update(dt) {
    if (!_isActive || !_campScene) return;
    _updateFire(dt);
    _updateParticles(dt);
    _updateBennyNPC(dt);

    // When a building menu is open, freeze player input/movement but keep
    // rendering the camp scene (fire, particles, camera).  Auto-detect when
    // the overlay is dismissed: if the camp-screen is visible and no other
    // full-screen overlay is on top, resume.
    if (_menuOpen) {
      _checkMenuClosed();
    }

    if (!_menuOpen) {
      _updatePlayer(dt);
      _updateInteraction();
    }
    _updateCamera(dt);
    _updateSigns();
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
    // Refresh prompt UI in case a building's state changed
    _updatePromptUI();
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
    get menuOpen() { return _menuOpen; },
    pauseInput: function () { _menuOpen = true; },
    resumeInput: _resumeInput,
    enter,
    exit,
    update,
    render,
    refreshBuildings,
    playBuildingUnlockAnimation: _playBuildingUnlockAnimation,
    bennyWalkToBuild: _bennyWalkToBuild,
    showBennySpeech: _showBennySpeech,
    hideBennySpeech: _hideBennySpeech,
    unlockBuilding(buildingId, saveData) {
      if (saveData) _saveData = saveData;
      if (_saveData && _saveData.campBuildings && _saveData.campBuildings[buildingId]) {
        _saveData.campBuildings[buildingId].unlocked = true;
      }
      _refreshBuildings();
      _playBuildingUnlockAnimation(buildingId);
    },
    onResize,
    warmUp,
  };

})();
