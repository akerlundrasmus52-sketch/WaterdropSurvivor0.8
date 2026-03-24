/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║        BLOOD SYSTEM V2 — Water Drop Survivor                    ║
 * ║        The most realistic browser gore simulator ever built     ║
 * ║        File: js/blood-system-v2.js                              ║
 * ║                                                                  ║
 * ║  HOW TO USE — 5 STEPS:                                          ║
 * ║                                                                  ║
 * ║  STEP 1: In index.html/sandbox.html, ADD this script tag        ║
 * ║          AFTER three.js, BEFORE enemy-class.js:                 ║
 * ║          <script src="js/blood-system-v2.js"></script>          ║
 * ║          (You can REMOVE the old blood-system.js line)          ║
 * ║                                                                  ║
 * ║  STEP 2: In game-screens.js inside init(), ADD:                 ║
 * ║          window.BloodV2.init(scene);                            ║
 * ║                                                                  ║
 * ║  STEP 3: In game-loop.js inside animate(), ADD:                 ║
 * ║          window.BloodV2.update(deltaTime);                      ║
 * ║                                                                  ║
 * ║  STEP 4: When a bullet/weapon hits an enemy, CALL:              ║
 * ║          window.BloodV2.hit(enemy, weaponKey, hitPoint, normal) ║
 * ║                                                                  ║
 * ║  STEP 5: When an enemy dies, CALL:                              ║
 * ║          window.BloodV2.kill(enemy, weaponKey)                  ║
 * ║                                                                  ║
 * ║  RESET between runs:                                            ║
 * ║          window.BloodV2.reset()                                  ║
 * ║                                                                  ║
 * ║  That's it. Everything else is automatic.                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 *  DESIGN PRINCIPLES:
 *  — Zero garbage collection: ALL objects are pre-allocated pools
 *  — Zero new THREE.Vector3() during gameplay: reuse scratch vectors
 *  — InstancedMesh for blood drops (1 draw call for 800 drops)
 *  — InstancedMesh for mist particles (1 draw call for 400)
 *  — Ground decals are merged geometry — 1 draw call total
 *  — Flesh chunks: pooled regular meshes (cheap, < 30 max)
 *  — Wound decals on enemy: projected circle on enemy surface
 *  — Arterial streams: particle jets, pressure-simulated
 *  — Full physics: gravity, drag, viscosity, bounce, coalesce
 *  — Per-enemy anatomy: 5 organs, each with HP and bleed rate
 *  — 18 weapon profiles — every weapon is physically distinct
 */

;(function (global) {
  'use strict';

  // ══════════════════════════════════════════
  //  POOL SIZES — tuned for mobile performance
  //  Change these if you need more / less
  // ══════════════════════════════════════════
  var CFG = {
    DROP_COUNT:       1200,  // blood drop instances (InstancedMesh)
    MIST_COUNT:       600,   // fine mist instances  (InstancedMesh)
    CHUNK_COUNT:      40,    // flesh/slime chunks   (pooled Mesh)
    DECAL_COUNT:      200,   // ground blood decals  (pooled Mesh)
    WOUND_PER_ENEMY:  8,     // max wounds on one enemy body
    STREAM_COUNT:     16,    // arterial pump streams
    GRAVITY:         -9.81,
    GROUND_Y:         0.02,
    DECAL_FADE:       45.0,  // seconds before ground decal fades
    DRIP_RATE:        0.15,  // seconds between wound drips (base)
    PUMP_RATE:        0.05,  // seconds between arterial pumps
  };

  // ══════════════════════════════════════════
  //  COLOURS — per enemy type
  //  Add more when you add more enemy types
  // ══════════════════════════════════════════
  var ENEMY_BLOOD = {
    slime:    { base: 0x22cc44, dark: 0x117722, organ: 0x00ff88, mist: 0x55ff66 },
    bug:      { base: 0xaadd00, dark: 0x667700, organ: 0xddff00, mist: 0xccee33 },
    human:    { base: 0xcc1100, dark: 0x880000, organ: 0xff3300, mist: 0xee2200 },
    alien:    { base: 0x8800ff, dark: 0x440088, organ: 0xcc44ff, mist: 0xaa33ee },
    robot:    { base: 0x88aaff, dark: 0x334488, organ: 0xffffff, mist: 0xaaccff },
    default:  { base: 0xcc1100, dark: 0x880000, organ: 0xff3300, mist: 0xee2200 },
  };

  // ══════════════════════════════════════════
  //  WEAPON PROFILES
  //  Every single physical property that makes
  //  each weapon look and feel completely unique
  // ══════════════════════════════════════════
  var WEAPONS = {

    // ── PISTOL ─────────────────────────────────────────────────────
    pistol: {
      label:         'Pistol',
      woundR:        0.045,      // wound radius on body
      penetration:   0.40,       // 0=surface 1=full through
      exitWound:     true,
      exitScale:     1.9,        // exit hole bigger than entry
      dropCount:     18,         // blood drops per hit
      dropSpeed:     [2.5, 6.0], // [min,max] m/s
      mistCount:     12,
      mistSpeed:     [1.0, 3.5],
      chunkChance:   0.0,
      chunkCount:    [0,0],
      pushForce:     0.35,
      organDmg:      18,
      pumpOnHeart:   true,
      killStyle:     'penetration',
    },

    // ── REVOLVER ───────────────────────────────────────────────────
    revolver: {
      label:         'Revolver',
      woundR:        0.060,
      penetration:   0.65,
      exitWound:     true,
      exitScale:     2.6,
      dropCount:     28,
      dropSpeed:     [4.0, 9.0],
      mistCount:     20,
      mistSpeed:     [2.0, 5.0],
      chunkChance:   0.08,
      chunkCount:    [1,2],
      pushForce:     0.8,
      organDmg:      28,
      pumpOnHeart:   true,
      // Hydrostatic shockwave: radial mist burst
      shockwave:     true,
      shockR:        0.8,
      killStyle:     'penetration',
    },

    // ── SHOTGUN ────────────────────────────────────────────────────
    shotgun: {
      label:         'Shotgun',
      woundR:        0.22,
      penetration:   0.25,
      exitWound:     false,
      exitScale:     1.0,
      dropCount:     90,         // MASSIVE blood volume
      dropSpeed:     [5.0, 16.0],
      mistCount:     60,
      mistSpeed:     [3.0, 9.0],
      chunkChance:   0.85,
      chunkCount:    [4,10],
      pushForce:     3.5,
      organDmg:      55,
      pellets:       9,          // spread pattern
      pelletAngle:   28,         // degrees
      pumpOnHeart:   true,
      killStyle:     'devastation',
    },

    // ── SMG ────────────────────────────────────────────────────────
    smg: {
      label:         'SMG',
      woundR:        0.032,
      penetration:   0.38,
      exitWound:     true,
      exitScale:     1.4,
      dropCount:     14,
      dropSpeed:     [2.0, 5.5],
      mistCount:     10,
      mistSpeed:     [1.0, 3.0],
      chunkChance:   0.0,
      chunkCount:    [0,0],
      pushForce:     0.20,
      organDmg:      12,
      pumpOnHeart:   true,
      killStyle:     'perforation',
    },

    // ── SNIPER ─────────────────────────────────────────────────────
    sniper: {
      label:         'Sniper Rifle',
      woundR:        0.022,
      penetration:   1.0,        // full through
      exitWound:     true,
      exitScale:     0.85,       // supersonic — exit nearly same size
      dropCount:     35,
      dropSpeed:     [7.0, 22.0],
      mistCount:     40,
      mistSpeed:     [5.0, 14.0],
      chunkChance:   0.20,
      chunkCount:    [1,3],
      pushForce:     2.0,
      organDmg:      80,
      // Temporary cavity: huge outward burst then blood collapses inward
      supersonicCavity: true,
      cavityR:       2.2,
      pumpOnHeart:   true,
      killStyle:     'supersonic',
    },

    // ── MINIGUN ────────────────────────────────────────────────────
    minigun: {
      label:         'Minigun',
      woundR:        0.028,
      penetration:   0.32,
      exitWound:     true,
      exitScale:     1.2,
      dropCount:     12,
      dropSpeed:     [2.0, 5.0],
      mistCount:     8,
      mistSpeed:     [1.0, 3.0],
      chunkChance:   0.02,
      chunkCount:    [0,1],
      pushForce:     0.18,
      organDmg:      10,
      pumpOnHeart:   true,
      killStyle:     'saturation',
    },

    // ── GRENADE ────────────────────────────────────────────────────
    grenade: {
      label:         'Grenade',
      woundR:        0.55,
      penetration:   0.85,
      exitWound:     false,
      exitScale:     1.0,
      dropCount:     160,
      dropSpeed:     [10.0, 28.0],
      mistCount:     100,
      mistSpeed:     [6.0, 18.0],
      chunkChance:   1.0,
      chunkCount:    [8,18],
      pushForce:     20.0,
      organDmg:      200,
      isExplosive:   true,
      blastR:        3.5,
      killStyle:     'explosion',
    },

    // ── ROCKET ─────────────────────────────────────────────────────
    rocket: {
      label:         'Rocket Launcher',
      woundR:        0.90,
      penetration:   1.0,
      exitWound:     false,
      exitScale:     1.0,
      dropCount:     300,
      dropSpeed:     [18.0, 45.0],
      mistCount:     200,
      mistSpeed:     [10.0, 25.0],
      chunkChance:   1.0,
      chunkCount:    [15,30],
      pushForce:     50.0,
      organDmg:      9999,
      isExplosive:   true,
      blastR:        6.0,
      killStyle:     'vaporize',
    },

    // ── LASER ──────────────────────────────────────────────────────
    laser: {
      label:         'Laser',
      woundR:        0.018,
      penetration:   1.0,
      exitWound:     true,
      exitScale:     0.7,
      dropCount:     3,          // cauterizes — barely bleeds
      dropSpeed:     [0.3, 1.5],
      mistCount:     0,
      mistSpeed:     [0,0],
      chunkChance:   0.0,
      chunkCount:    [0,0],
      pushForce:     0.05,
      organDmg:      45,
      cauterizes:    true,
      smokeCount:    10,
      pumpOnHeart:   false,
      killStyle:     'cauterize',
    },

    // ── PLASMA ─────────────────────────────────────────────────────
    plasma: {
      label:         'Plasma Cannon',
      woundR:        0.14,
      penetration:   0.70,
      exitWound:     false,
      exitScale:     1.0,
      dropCount:     45,
      dropSpeed:     [3.5, 10.0],
      mistCount:     30,
      mistSpeed:     [2.0, 7.0],
      chunkChance:   0.35,
      chunkCount:    [2,5],
      pushForce:     2.5,
      organDmg:      60,
      charEffect:    true,
      pumpOnHeart:   true,
      killStyle:     'melt',
    },

    // ── KNIFE ──────────────────────────────────────────────────────
    knife: {
      label:         'Knife',
      woundR:        0.022,
      penetration:   0.92,
      exitWound:     false,
      exitScale:     1.0,
      dropCount:     22,
      dropSpeed:     [0.2, 1.5],
      mistCount:     0,
      mistSpeed:     [0,0],
      chunkChance:   0.0,
      chunkCount:    [0,0],
      pushForce:     0.08,
      organDmg:      35,
      isSlash:       true,
      slashArc:      0.35,       // blood arc width
      pumpOnHeart:   true,
      killStyle:     'slash',
    },

    // ── SWORD ──────────────────────────────────────────────────────
    sword: {
      label:         'Sword',
      woundR:        0.042,
      penetration:   0.85,
      exitWound:     false,
      exitScale:     1.0,
      dropCount:     50,
      dropSpeed:     [0.5, 4.0],
      mistCount:     5,
      mistSpeed:     [0.5, 2.0],
      chunkChance:   0.15,
      chunkCount:    [1,2],
      pushForce:     1.0,
      organDmg:      50,
      isSlash:       true,
      slashArc:      0.80,
      pumpOnHeart:   true,
      killStyle:     'sever',
    },

    // ── AXE ────────────────────────────────────────────────────────
    axe: {
      label:         'Axe',
      woundR:        0.09,
      penetration:   0.98,
      exitWound:     false,
      exitScale:     1.0,
      dropCount:     70,
      dropSpeed:     [1.0, 5.0],
      mistCount:     8,
      mistSpeed:     [0.5, 2.5],
      chunkChance:   0.50,
      chunkCount:    [2,4],
      pushForce:     2.5,
      organDmg:      70,
      isSlash:       true,
      slashArc:      0.55,
      pumpOnHeart:   true,
      killStyle:     'cleave',
    },

    // ── FLAMETHROWER ───────────────────────────────────────────────
    flame: {
      label:         'Flamethrower',
      woundR:        0.18,
      penetration:   0.15,
      exitWound:     false,
      exitScale:     1.0,
      dropCount:     2,
      dropSpeed:     [0.1, 0.5],
      mistCount:     0,
      mistSpeed:     [0,0],
      chunkChance:   0.0,
      chunkCount:    [0,0],
      pushForce:     0.4,
      organDmg:      20,
      cauterizes:    true,
      smokeCount:    18,
      burnsEnemy:    true,
      pumpOnHeart:   false,
      killStyle:     'combust',
    },

    // ── ICE SPEAR ──────────────────────────────────────────────────
    ice: {
      label:         'Ice Spear',
      woundR:        0.065,
      penetration:   0.55,
      exitWound:     false,
      exitScale:     1.0,
      dropCount:     20,
      dropSpeed:     [0.5, 2.5],
      mistCount:     12,
      mistSpeed:     [0.3, 1.5],
      chunkChance:   0.0,
      chunkCount:    [0,0],
      pushForce:     0.4,
      organDmg:      30,
      freezesBlood:  true,
      pumpOnHeart:   false,
      killStyle:     'shatter',
    },

    // ── LIGHTNING ──────────────────────────────────────────────────
    lightning: {
      label:         'Lightning',
      woundR:        0.035,
      penetration:   1.0,
      exitWound:     true,
      exitScale:     1.0,
      dropCount:     12,
      dropSpeed:     [1.5, 5.0],
      mistCount:     20,
      mistSpeed:     [1.0, 4.0],
      chunkChance:   0.06,
      chunkCount:    [0,1],
      pushForce:     4.0,
      organDmg:      40,
      electricEffect: true,
      pumpOnHeart:   false,
      killStyle:     'electrocute',
    },

    // ── KNIFE TAKEDOWN (your existing special) ─────────────────────
    knife_takedown: {
      label:         'Knife Takedown',
      woundR:        0.026,
      penetration:   0.98,
      exitWound:     false,
      exitScale:     1.0,
      dropCount:     40,
      dropSpeed:     [0.1, 0.6],
      mistCount:     0,
      mistSpeed:     [0,0],
      chunkChance:   0.0,
      chunkCount:    [0,0],
      pushForce:     0.02,
      organDmg:      120,
      isSlash:       true,
      slashArc:      0.20,
      pumpOnHeart:   true,
      isTakedown:    true,      // triggers execution sequence
      killStyle:     'execution',
    },

    // ── METEOR ─────────────────────────────────────────────────────
    meteor: {
      label:         'Meteor',
      woundR:        1.20,
      penetration:   1.0,
      exitWound:     false,
      exitScale:     1.0,
      dropCount:     400,
      dropSpeed:     [20.0, 55.0],
      mistCount:     250,
      mistSpeed:     [12.0, 30.0],
      chunkChance:   1.0,
      chunkCount:    [20,40],
      pushForce:     80.0,
      organDmg:      9999,
      isExplosive:   true,
      blastR:        8.0,
      killStyle:     'vaporize',
    },
  };

  // ══════════════════════════════════════════
  //  ANATOMY PROFILES
  //  Every new enemy type you create gets an entry here.
  //  organs: brain, heart, guts, membrane, core
  //  yRange: normalized -1(bottom) to +1(top) of enemy mesh
  // ══════════════════════════════════════════
  var ANATOMY = {

    slime: {
      membrane: { hp:35,  maxHp:35,  yRange:[-1.0, 1.0], bleedRate:0.30, pumpBlood:false },
      brain:    { hp:20,  maxHp:20,  yRange:[ 0.5, 1.0], bleedRate:0.15, pumpBlood:false },
      heart:    { hp:45,  maxHp:45,  yRange:[ 0.1, 0.5], bleedRate:1.00, pumpBlood:true  },
      guts:     { hp:65,  maxHp:65,  yRange:[-0.3, 0.1], bleedRate:0.60, pumpBlood:false },
      core:     { hp:90,  maxHp:90,  yRange:[-1.0,-0.3], bleedRate:0.80, pumpBlood:false },
    },

    // Add more enemy types here as you build them:
    // bug:   { membrane:{...}, brain:{...}, ... },
    // alien: { ... },
  };

  // ══════════════════════════════════════════
  //  INTERNAL STATE — pre-allocated
  // ══════════════════════════════════════════

  var _scene       = null;
  var _ready       = false;
  var _frame       = 0;   // frame counter for debug

  // ── Scratch vectors (NEVER allocate in update loop) ──────────────
  var _s0 = new THREE.Vector3();
  var _s1 = new THREE.Vector3();
  var _s2 = new THREE.Vector3();
  var _m4 = new THREE.Matrix4();
  var _q0 = new THREE.Quaternion();

  // ── Blood drop InstancedMesh ──────────────────────────────────────
  var _dropIM   = null;   // InstancedMesh for regular drops
  var _mistIM   = null;   // InstancedMesh for fine mist
  var _dropData = [];     // flat array of drop state objects
  var _mistData = [];

  // ── Flesh chunks ─────────────────────────────────────────────────
  var _chunks   = [];

  // ── Ground decals ─────────────────────────────────────────────────
  var _decals   = [];
  var _decalIdx = 0;

  // ── Arterial streams ──────────────────────────────────────────────
  var _streams  = [];

  // ── Per-enemy gore state ─────────────────────────────────────────
  var _goreMap  = new Map();   // enemyId → EnemyGoreState

  // ══════════════════════════════════════════
  //  DATA STRUCTURES (plain objects, no classes
  //  to avoid GC from constructor calls)
  // ══════════════════════════════════════════

  function makeDrop() {
    return {
      alive:    false,
      idx:      0,        // index into InstancedMesh
      px:0, py:0, pz:0,  // position
      vx:0, vy:0, vz:0,  // velocity
      r:        0.015,    // radius
      life:     0,
      maxLife:  0,
      viscosity:0.72,
      bounces:  0,
      maxBounces:3,
      onGround: false,
      color:    0xcc0000,
      frozen:   false,
      charred:  false,
      isMist:   false,
    };
  }

  function makeChunk() {
    return {
      alive:   false,
      mesh:    null,
      px:0, py:0, pz:0,
      vx:0, vy:0, vz:0,
      rx:0, ry:0, rz:0,
      rvx:0, rvy:0, rvz:0,
      life:    0,
      size:    0.08,
      bounces: 0,
      color:   0x22aa33,
    };
  }

  function makeDecal() {
    return {
      mesh:    null,
      alive:   false,
      life:    0,
      maxLife: CFG.DECAL_FADE,
    };
  }

  function makeStream() {
    return {
      alive:   false,
      enemy:   null,
      lx:0, ly:0, lz:0,  // local position on enemy
      dx:0, dy:0, dz:0,  // direction (normalised)
      pressure:1.0,
      life:    0,
      timer:   0,
      color:   0xcc0000,
    };
  }

  // ── Per-enemy gore ────────────────────────────────────────────────
  function makeGoreState(enemy, enemyType) {
    var profile = ANATOMY[enemyType] || ANATOMY.slime;
    var organs  = {};
    for (var k in profile) {
      organs[k] = { hp: profile[k].hp, maxHp: profile[k].maxHp };
    }
    return {
      enemy:    enemy,
      type:     enemyType || 'slime',
      organs:   organs,
      wounds:   [],        // array of wound objects
      killedBy: null,
      alive:    true,
    };
  }

  function makeWound() {
    return {
      alive:      false,
      lx:0, ly:0, lz:0,   // local position on enemy
      radius:     0.04,
      depth:      0.0,
      hits:       0,
      organ:      'membrane',
      dripTimer:  0,
      cauterized: false,
      frozen:     false,
      color:      0xaa0000,
    };
  }

  // ══════════════════════════════════════════
  //  INIT — call once after scene exists
  // ══════════════════════════════════════════
  function init(scene) {
    _scene = scene;
    _buildDropPool();
    _buildMistPool();
    _buildChunkPool();
    _buildDecalPool();
    _ready = true;
    console.log(
      '[BloodV2] ✅ Ready. Pools: ' +
      CFG.DROP_COUNT + ' drops, ' +
      CFG.MIST_COUNT + ' mist, ' +
      CFG.CHUNK_COUNT + ' chunks, ' +
      CFG.DECAL_COUNT + ' decals'
    );
  }

  // ══════════════════════════════════════════
  //  POOL BUILDERS
  // ══════════════════════════════════════════

  function _buildDropPool() {
    var geo = new THREE.SphereGeometry(1.0, 4, 3); // unit sphere, scaled per instance
    var mat = new THREE.MeshBasicMaterial({ vertexColors: false });

    _dropIM = new THREE.InstancedMesh(geo, mat, CFG.DROP_COUNT);
    _dropIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _dropIM.frustumCulled = false;
    _dropIM.count = 0;
    _scene.add(_dropIM);

    // Pre-create drop data objects
    _dropData = [];
    for (var i = 0; i < CFG.DROP_COUNT; i++) {
      var d = makeDrop();
      d.idx = i;
      _dropData.push(d);
      // Hide all instances initially
      _m4.makeScale(0, 0, 0);
      _dropIM.setMatrixAt(i, _m4);
    }
    _dropIM.instanceMatrix.needsUpdate = true;
  }

  function _buildMistPool() {
    var geo = new THREE.SphereGeometry(1.0, 3, 2);
    var mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55 });

    _mistIM = new THREE.InstancedMesh(geo, mat, CFG.MIST_COUNT);
    _mistIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _mistIM.frustumCulled = false;
    _mistIM.count = 0;
    _scene.add(_mistIM);

    _mistData = [];
    for (var i = 0; i < CFG.MIST_COUNT; i++) {
      var d = makeDrop();
      d.idx    = i;
      d.isMist = true;
      _mistData.push(d);
      _m4.makeScale(0, 0, 0);
      _mistIM.setMatrixAt(i, _m4);
    }
    _mistIM.instanceMatrix.needsUpdate = true;
  }

  function _buildChunkPool() {
    // Irregular polyhedron chunks — looks like torn flesh
    var shapes = [
      new THREE.DodecahedronGeometry(1.0, 0),
      new THREE.TetrahedronGeometry(1.0, 0),
      new THREE.OctahedronGeometry(1.0, 0),
    ];
    var mat = new THREE.MeshLambertMaterial({ transparent: true });

    _chunks = [];
    for (var i = 0; i < CFG.CHUNK_COUNT; i++) {
      var geo  = shapes[i % shapes.length];
      var mesh = new THREE.Mesh(geo, mat.clone());
      mesh.visible = false;
      _scene.add(mesh);
      var c    = makeChunk();
      c.mesh   = mesh;
      _chunks.push(c);
    }
  }

  function _buildDecalPool() {
    // Ground blood splatter decals
    var geo = new THREE.CircleGeometry(1.0, 7);
    var mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity:     0.80,
      depthWrite:  false,
    });

    _decals = [];
    for (var i = 0; i < CFG.DECAL_COUNT; i++) {
      var mesh = new THREE.Mesh(geo, mat.clone());
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = CFG.GROUND_Y;
      mesh.visible    = false;
      mesh.renderOrder = 1;
      _scene.add(mesh);
      var d = makeDecal();
      d.mesh = mesh;
      _decals.push(d);
    }
  }

  // ══════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════

  /**
   * hit(enemy, weaponKey, hitPoint, hitNormal)
   *
   * enemy      — your enemy object. Needs:
   *               .mesh (THREE.Mesh or THREE.Object3D)
   *               .id or .uuid (unique identifier)
   *               .velocity (THREE.Vector3, optional)
   *               .enemyType (string: 'slime','bug'... optional)
   *               .alive (bool)
   * weaponKey  — string key from WEAPONS table above
   * hitPoint   — THREE.Vector3 world position of hit
   * hitNormal  — THREE.Vector3 surface normal at hit (optional)
   */
  function hit(enemy, weaponKey, hitPoint, hitNormal) {
    if (!_ready || !enemy) return;

    var wp   = WEAPONS[weaponKey] || WEAPONS.pistol;
    var eId  = enemy.id !== undefined ? enemy.id : enemy.uuid;
    var eType = enemy.enemyType || 'slime';
    var col  = ENEMY_BLOOD[eType] || ENEMY_BLOOD.default;

    // Get or create gore state
    var gs = _goreMap.get(eId);
    if (!gs) {
      gs = makeGoreState(enemy, eType);
      _goreMap.set(eId, gs);
    }
    if (!gs.alive) return;

    // Determine hit position
    var hx = hitPoint ? hitPoint.x : (enemy.mesh ? enemy.mesh.position.x : 0);
    var hy = hitPoint ? hitPoint.y : (enemy.mesh ? enemy.mesh.position.y : 0);
    var hz = hitPoint ? hitPoint.z : (enemy.mesh ? enemy.mesh.position.z : 0);

    var ex = enemy.mesh ? enemy.mesh.position.x : 0;
    var ey = enemy.mesh ? enemy.mesh.position.y : 0;
    var ez = enemy.mesh ? enemy.mesh.position.z : 0;
    var esc = enemy.mesh ? enemy.mesh.scale.y : 1.0;

    // Local Y on enemy body: -1=bottom, +1=top
    var localY = (esc > 0.001) ? Math.max(-1, Math.min(1, (hy - ey) / (esc * 0.5 + 0.001))) : 0;

    // Which organ was hit?
    var organ = _getOrgan(gs.type, localY);

    // Apply organ damage
    var dmgAmount = wp.organDmg + (Math.random() * wp.organDmg * 0.3);
    var organKilled = _damageOrgan(gs, organ, dmgAmount);

    // Add / grow wound
    var lx = hx - ex, ly = hy - ey, lz = hz - ez;
    _addWound(gs, lx, ly, lz, wp.woundR, organ, wp, col);

    // ── SPAWN BLOOD EFFECTS ──────────────────
    if (wp.isExplosive) {
      _fxExplosion(hx, hy, hz, wp, col);

    } else if (wp.cauterizes) {
      _fxCauterize(hx, hy, hz, wp);

    } else if (wp.freezesBlood) {
      _fxIce(hx, hy, hz, wp, col);

    } else if (wp.electricEffect) {
      _fxElectric(hx, hy, hz, wp, col);

    } else if (wp.isSlash) {
      _fxSlash(hx, hy, hz, hitNormal, wp, col);

    } else {
      _fxBullet(hx, hy, hz, hitNormal, wp, col);
      if (wp.supersonicCavity) _fxSupersonic(hx, hy, hz, wp, col);
      if (wp.shockwave) _fxShockwave(hx, hy, hz, wp, col);
    }

    // Chunks
    if (Math.random() < wp.chunkChance) {
      var nc = wp.chunkCount[0] + Math.floor(Math.random() * (wp.chunkCount[1] - wp.chunkCount[0] + 1));
      _spawnChunks(hx, hy, hz, hitNormal, nc, wp, col);
    }

    // Arterial pump on heart hit
    if (organ === 'heart' && wp.pumpOnHeart) {
      var anat = ANATOMY[gs.type] || ANATOMY.slime;
      if (anat.heart && anat.heart.pumpBlood) {
        var existing = _streams.find(function(s){ return s.alive && s.enemy === enemy; });
        if (!existing) {
          _startStream(enemy, lx, ly + 0.1, lz, hitNormal, col.base, 7.0);
        }
      }
    }

    // Organ death reaction
    if (organKilled) {
      _organDeathFX(gs, organ, hx, hy, hz, wp, col);
    }

    return { organ: organ, organKilled: organKilled };
  }

  /**
   * kill(enemy, weaponKey)
   * Call when enemy health reaches zero
   */
  function kill(enemy, weaponKey) {
    if (!_ready || !enemy) return;

    var wp   = WEAPONS[weaponKey] || WEAPONS.pistol;
    var eId  = enemy.id !== undefined ? enemy.id : enemy.uuid;
    var eType = enemy.enemyType || 'slime';
    var col  = ENEMY_BLOOD[eType] || ENEMY_BLOOD.default;

    var ex = enemy.mesh ? enemy.mesh.position.x : 0;
    var ey = enemy.mesh ? enemy.mesh.position.y : 0;
    var ez = enemy.mesh ? enemy.mesh.position.z : 0;

    var gs = _goreMap.get(eId);
    var killedBy = gs ? gs.killedBy : 'core';

    // Stop all streams for this enemy
    for (var i = 0; i < _streams.length; i++) {
      if (_streams[i].enemy === enemy) _streams[i].alive = false;
    }

    // DEATH EXPLOSION based on weapon and organ
    _killExplosion(ex, ey, ez, wp, col, killedBy, enemy);

    if (gs) {
      gs.alive = false;
      for (var j = 0; j < gs.wounds.length; j++) gs.wounds[j].alive = false;
    }
    _goreMap.delete(eId);
  }

  /**
   * update(dt) — call EVERY FRAME from game-loop.js
   * dt = delta time in seconds (e.g. 0.016 for 60fps)
   */
  function update(dt) {
    if (!_ready) return;
    _frame++;

    var dirty = false;

    // ── Update blood drops ───────────────────
    for (var i = 0; i < _dropData.length; i++) {
      var d = _dropData[i];
      if (!d.alive) continue;
      _updateDrop(d, dt, _dropIM, false);
      dirty = true;
    }
    if (dirty) _dropIM.instanceMatrix.needsUpdate = true;

    // ── Update mist ──────────────────────────
    var mistDirty = false;
    for (var i = 0; i < _mistData.length; i++) {
      var d = _mistData[i];
      if (!d.alive) continue;
      _updateDrop(d, dt, _mistIM, true);
      mistDirty = true;
    }
    if (mistDirty) _mistIM.instanceMatrix.needsUpdate = true;

    // ── Update chunks ────────────────────────
    for (var i = 0; i < _chunks.length; i++) {
      _updateChunk(_chunks[i], dt);
    }

    // ── Update streams ───────────────────────
    for (var i = 0; i < _streams.length; i++) {
      _updateStream(_streams[i], dt);
    }

    // ── Update per-enemy wounds (dripping) ───
    _goreMap.forEach(function(gs) {
      if (!gs.alive) return;
      var col = ENEMY_BLOOD[gs.type] || ENEMY_BLOOD.default;
      var ex = gs.enemy.mesh ? gs.enemy.mesh.position.x : 0;
      var ey = gs.enemy.mesh ? gs.enemy.mesh.position.y : 0;
      var ez = gs.enemy.mesh ? gs.enemy.mesh.position.z : 0;
      var evx = gs.enemy.velocity ? gs.enemy.velocity.x : 0;
      var evz = gs.enemy.velocity ? gs.enemy.velocity.z : 0;
      for (var j = 0; j < gs.wounds.length; j++) {
        _updateWound(gs.wounds[j], dt, ex, ey, ez, evx, evz, col);
      }
    });

    // ── Fade decals ──────────────────────────
    // Throttle: only check 10 decals per frame to save CPU
    var startD = (_frame * 10) % CFG.DECAL_COUNT;
    for (var i = 0; i < 10; i++) {
      var dd = _decals[(startD + i) % CFG.DECAL_COUNT];
      if (!dd.alive) continue;
      dd.life -= dt;
      if (dd.life <= 0) {
        dd.alive = false;
        dd.mesh.visible = false;
      } else if (dd.life < 4.0) {
        dd.mesh.material.opacity = (dd.life / 4.0) * 0.80;
      }
    }
  }

  /**
   * reset() — call between runs to clear everything
   */
  function reset() {
    for (var i = 0; i < _dropData.length; i++) _killDrop(_dropData[i], _dropIM);
    for (var i = 0; i < _mistData.length; i++) _killDrop(_mistData[i], _mistIM);
    for (var i = 0; i < _chunks.length;  i++) _killChunk(_chunks[i]);
    for (var i = 0; i < _streams.length; i++) _streams[i].alive = false;
    for (var i = 0; i < _decals.length;  i++) { _decals[i].alive = false; _decals[i].mesh.visible = false; }
    _goreMap.clear();
    _streams = [];
    if (_dropIM) _dropIM.instanceMatrix.needsUpdate = true;
    if (_mistIM) _mistIM.instanceMatrix.needsUpdate = true;
    console.log('[BloodV2] Reset complete.');
  }

  // ══════════════════════════════════════════
  //  PHYSICS UPDATE — blood drop
  // ══════════════════════════════════════════
  function _updateDrop(d, dt, im, isMist) {
    d.life -= dt;
    if (d.life <= 0) { _killDrop(d, im); return; }

    if (d.onGround) {
      // Settled: slowly spread as puddle, fade near end
      d.r = Math.min(d.r + dt * 0.04, 0.18);
      if (d.life < 2.5) {
        var a = d.life / 2.5;
        _m4.makeScale(d.r * 55, 0.04, d.r * 55);
        _m4.setPosition(d.px, CFG.GROUND_Y, d.pz);
        im.setMatrixAt(d.idx, _m4);
      }
      return;
    }

    // ── Gravity ────────────────────────────
    d.vy += CFG.GRAVITY * dt;

    // ── Viscous drag ───────────────────────
    // Drag coefficient increases with speed (realistic)
    var speed2 = d.vx * d.vx + d.vy * d.vy + d.vz * d.vz;
    var drag   = 1.0 - d.viscosity * dt * Math.sqrt(speed2) * 0.5;
    if (drag < 0) drag = 0;
    d.vx *= drag;
    d.vy *= drag;
    d.vz *= drag;

    // ── Integrate ──────────────────────────
    d.px += d.vx * dt;
    d.py += d.vy * dt;
    d.pz += d.vz * dt;

    // ── Ground collision ───────────────────
    if (d.py <= CFG.GROUND_Y) {
      d.py = CFG.GROUND_Y;
      if (d.bounces < d.maxBounces && !isMist) {
        // Realistic bounce: lose 60-70% energy, lateral bleeds off
        var bounceY = Math.abs(d.vy) * (0.28 - d.viscosity * 0.12);
        d.vy = bounceY;
        d.vx *= 0.55;
        d.vz *= 0.55;
        d.bounces++;
        if (d.bounces === 1) {
          _spawnDecal(d.px, d.pz, d.r * 1.8, d.color);
        }
      } else {
        d.vy = 0; d.vx = 0; d.vz = 0;
        d.onGround = true;
        _spawnDecal(d.px, d.pz, d.r * 2.5, d.color);
      }
    }

    // ── Update InstancedMesh matrix ────────
    var spd  = Math.sqrt(speed2);
    var s    = d.r * 50;

    if (!d.onGround && spd > 3.5) {
      // Elongate drop along velocity vector at high speed
      var stretch = 1.0 + spd * 0.07;
      _m4.makeScale(s, s * stretch, s);
      // Orient along velocity — approximate with y-axis align
      var len = spd + 0.0001;
      _q0.set(
        d.vz / len * 0.5,
        0,
        -d.vx / len * 0.5,
        Math.sqrt(1 - 0.25 * (d.vx * d.vx + d.vz * d.vz) / (len * len))
      );
      _m4.makeRotationFromQuaternion(_q0);
      _m4.scale(_s0.set(s, s * stretch, s));
    } else if (d.onGround) {
      _m4.makeScale(s, 0.05, s);
    } else {
      _m4.makeScale(s, s, s);
    }

    _m4.setPosition(d.px, d.py, d.pz);
    im.setMatrixAt(d.idx, _m4);
  }

  // ══════════════════════════════════════════
  //  PHYSICS UPDATE — flesh chunk
  // ══════════════════════════════════════════
  function _updateChunk(c, dt) {
    if (!c.alive) return;
    c.life -= dt;
    if (c.life <= 0) { _killChunk(c); return; }

    // Gravity
    c.vy += CFG.GRAVITY * 0.65 * dt;
    // Drag
    c.vx *= (1.0 - 0.45 * dt);
    c.vy *= (1.0 - 0.10 * dt);
    c.vz *= (1.0 - 0.45 * dt);
    // Integrate
    c.px += c.vx * dt;
    c.py += c.vy * dt;
    c.pz += c.vz * dt;
    // Rotation
    c.rx += c.rvx * dt;
    c.ry += c.rvy * dt;
    c.rz += c.rvz * dt;
    c.rvx *= 0.93;
    c.rvy *= 0.93;
    c.rvz *= 0.93;

    // Ground
    if (c.py <= 0.04) {
      c.py = 0.04;
      if (c.bounces < 2) {
        c.vy = Math.abs(c.vy) * 0.28;
        c.vx *= 0.65;
        c.vz *= 0.65;
        c.bounces++;
        // Mini blood splat when chunk lands
        _spawnSplat(c.px, c.pz, c.size, c.color);
      } else {
        c.vy = 0; c.vx = 0; c.vz = 0;
        if (c.life > 2.0) c.life = 2.0;
      }
    }

    if (c.mesh) {
      c.mesh.position.set(c.px, c.py, c.pz);
      c.mesh.rotation.set(c.rx, c.ry, c.rz);
      if (c.life < 1.5) c.mesh.material.opacity = c.life / 1.5;
    }
  }

  // ══════════════════════════════════════════
  //  PHYSICS UPDATE — arterial stream
  // ══════════════════════════════════════════
  function _updateStream(s, dt) {
    if (!s.alive) return;
    if (!s.enemy || !s.enemy.alive) { s.alive = false; return; }

    s.life -= dt;
    if (s.life <= 0) { s.alive = false; return; }

    s.pressure = Math.max(0.1, s.life / 7.0);
    s.timer   += dt;
    var interval = CFG.PUMP_RATE / s.pressure;

    if (s.timer >= interval) {
      s.timer = 0;
      _pumpStream(s);
    }
  }

  function _pumpStream(s) {
    var ex = s.enemy.mesh ? s.enemy.mesh.position.x : 0;
    var ey = s.enemy.mesh ? s.enemy.mesh.position.y : 0;
    var ez = s.enemy.mesh ? s.enemy.mesh.position.z : 0;
    var wx = ex + s.lx, wy = ey + s.ly, wz = ez + s.lz;

    var spd   = 3.5 + s.pressure * 9.5;
    var count = Math.max(1, Math.ceil(s.pressure * 6));

    for (var i = 0; i < count; i++) {
      var d = _getFreeDrop(_dropData);
      if (!d) break;
      d.alive = true;
      d.px = wx; d.py = wy; d.pz = wz;
      d.vx = s.dx * spd + (Math.random()-0.5) * 0.8;
      d.vy = s.dy * spd + Math.random() * 0.6 * s.pressure;
      d.vz = s.dz * spd + (Math.random()-0.5) * 0.8;
      d.r          = 0.022 * s.pressure + Math.random() * 0.015;
      d.maxLife    = 1.8 + Math.random();
      d.life       = d.maxLife;
      d.viscosity  = 0.55;
      d.bounces    = 0;
      d.maxBounces = 2;
      d.onGround   = false;
      d.color      = s.color;
      d.frozen     = false; d.charred = false;
    }
  }

  // ══════════════════════════════════════════
  //  WOUND DRIPPING
  // ══════════════════════════════════════════
  function _updateWound(w, dt, ex, ey, ez, evx, evz, col) {
    if (!w.alive || w.cauterized || w.frozen) return;
    var anat  = ANATOMY[col._type] || ANATOMY.slime;
    var oData = anat[w.organ];
    if (!oData) return;

    w.dripTimer += dt;
    var rate = CFG.DRIP_RATE / (oData.bleedRate * (0.4 + w.depth));
    if (w.dripTimer >= rate) {
      w.dripTimer = 0;
      var d = _getFreeDrop(_dropData);
      if (!d) return;
      d.alive = true;
      d.px = ex + w.lx;
      d.py = ey + w.ly;
      d.pz = ez + w.lz;
      d.vx = (Math.random()-0.5)*0.25 + evx*0.12;
      d.vy = -0.45 - Math.random()*0.9;
      d.vz = (Math.random()-0.5)*0.25 + evz*0.12;
      d.r         = 0.009 + w.depth * 0.012;
      d.maxLife   = 2.2 + Math.random();
      d.life      = d.maxLife;
      d.viscosity = 0.70;
      d.bounces   = 0; d.maxBounces = 2;
      d.onGround  = false;
      d.color     = w.color;
      d.frozen    = false; d.charred = false;
    }
  }

  // ══════════════════════════════════════════
  //  BLOOD EFFECT FUNCTIONS
  // ══════════════════════════════════════════

  function _fxBullet(hx, hy, hz, normal, wp, col) {
    var nx = normal ? -normal.x : 0;
    var ny = normal ? -normal.y : 0;
    var nz = normal ? -normal.z : 1;

    var count = wp.dropCount;
    var sMin  = wp.dropSpeed[0], sMax = wp.dropSpeed[1];

    for (var i = 0; i < count; i++) {
      var d = _getFreeDrop(_dropData);
      if (!d) break;
      var spd  = sMin + Math.random() * (sMax - sMin);
      var sctr = wp.woundR * 5;
      d.alive  = true;
      d.px = hx; d.py = hy; d.pz = hz;
      d.vx = nx * spd + (Math.random()-0.5) * sctr * 6;
      d.vy = ny * spd + Math.random() * 1.8;
      d.vz = nz * spd + (Math.random()-0.5) * sctr * 6;
      d.r         = 0.010 + Math.random()*0.022;
      d.maxLife   = 2.5 + Math.random()*1.5;
      d.life      = d.maxLife;
      d.viscosity = 0.60;
      d.bounces   = 0; d.maxBounces = 3;
      d.onGround  = false;
      d.color     = (Math.random() < 0.15) ? col.dark : col.base;
      d.frozen    = false; d.charred = false;
    }

    // Mist
    for (var i = 0; i < wp.mistCount; i++) {
      var d = _getFreeDrop(_mistData);
      if (!d) break;
      var spd = wp.mistSpeed[0] + Math.random()*(wp.mistSpeed[1]-wp.mistSpeed[0]);
      d.alive = true;
      d.px = hx; d.py = hy; d.pz = hz;
      d.vx = nx*spd + (Math.random()-0.5)*spd*0.8;
      d.vy = ny*spd + Math.random()*0.8;
      d.vz = nz*spd + (Math.random()-0.5)*spd*0.8;
      d.r         = 0.004 + Math.random()*0.007;
      d.maxLife   = 0.8 + Math.random()*0.5;
      d.life      = d.maxLife;
      d.viscosity = 0.20;
      d.bounces   = 0; d.maxBounces = 0;
      d.onGround  = false;
      d.color     = col.mist;
      d.frozen    = false; d.charred = false;
    }

    // Exit wound
    if (wp.exitWound) {
      var ec = Math.ceil(wp.dropCount * 0.55);
      for (var i = 0; i < ec; i++) {
        var d = _getFreeDrop(_dropData);
        if (!d) break;
        var spd = (sMin + Math.random()*(sMax-sMin)) * wp.exitScale;
        d.alive = true;
        d.px = hx; d.py = hy; d.pz = hz;
        d.vx = -nx*spd + (Math.random()-0.5)*3.5;
        d.vy = Math.abs(-ny*spd) + Math.random()*2.0;
        d.vz = -nz*spd + (Math.random()-0.5)*3.5;
        d.r         = 0.016 + Math.random()*0.028;
        d.maxLife   = 2.2 + Math.random()*2.0;
        d.life      = d.maxLife;
        d.viscosity = 0.58;
        d.bounces   = 0; d.maxBounces = 4;
        d.onGround  = false;
        d.color     = col.dark;
        d.frozen    = false; d.charred = false;
      }
    }
  }

  function _fxSupersonic(hx, hy, hz, wp, col) {
    // Huge radial cavity burst — then drops collapse back under gravity
    var count = 55;
    for (var i = 0; i < count; i++) {
      var a = (i / count) * Math.PI * 2;
      var r = 1.8 + Math.random() * wp.cavityR;
      var d = _getFreeDrop(_mistData);
      if (!d) d = _getFreeDrop(_dropData);
      if (!d) break;
      d.alive = true;
      d.px = hx; d.py = hy; d.pz = hz;
      d.vx = Math.cos(a) * r;
      d.vy = Math.random() * 3.5;
      d.vz = Math.sin(a) * r;
      d.r         = 0.007 + Math.random()*0.012;
      d.maxLife   = 0.9 + Math.random()*0.4;
      d.life      = d.maxLife;
      d.viscosity = 0.15;
      d.bounces   = 0; d.maxBounces = 0;
      d.onGround  = false;
      d.color     = col.mist;
      d.frozen    = false; d.charred = false;
    }
  }

  function _fxShockwave(hx, hy, hz, wp, col) {
    // Hydrostatic shockwave from heavy round — concentric ring of mist
    var count = 24;
    for (var i = 0; i < count; i++) {
      var a = (i / count) * Math.PI * 2;
      var r = 1.2 + Math.random() * 0.4;
      var d = _getFreeDrop(_mistData);
      if (!d) break;
      d.alive = true;
      d.px = hx + Math.cos(a)*0.05;
      d.py = hy;
      d.pz = hz + Math.sin(a)*0.05;
      d.vx = Math.cos(a) * r;
      d.vy = 0.3 + Math.random() * 0.5;
      d.vz = Math.sin(a) * r;
      d.r         = 0.005 + Math.random()*0.006;
      d.maxLife   = 0.6 + Math.random()*0.3;
      d.life      = d.maxLife;
      d.viscosity = 0.10;
      d.bounces   = 0; d.maxBounces = 0;
      d.onGround  = false;
      d.color     = col.mist;
      d.frozen    = false; d.charred = false;
    }
  }

  function _fxSlash(hx, hy, hz, normal, wp, col) {
    // Blood arcs off blade in a wide fan
    var count = wp.dropCount;
    for (var i = 0; i < count; i++) {
      var t = i / count;
      var arc = (t - 0.5) * Math.PI * wp.slashArc * 2;
      var d = _getFreeDrop(_dropData);
      if (!d) break;
      d.alive = true;
      d.px = hx; d.py = hy; d.pz = hz;
      d.vx = Math.cos(arc) * (1.0 + Math.random() * 2.5);
      d.vy = 1.2 + Math.random() * 2.8;
      d.vz = Math.sin(arc) * (1.0 + Math.random() * 2.5);
      d.r         = 0.013 + Math.random()*0.028;
      d.maxLife   = 2.8 + Math.random()*1.5;
      d.life      = d.maxLife;
      d.viscosity = 0.68;
      d.bounces   = 0; d.maxBounces = 3;
      d.onGround  = false;
      d.color     = col.base;
      d.frozen    = false; d.charred = false;
    }
    // Drips straight down from wound site
    for (var i = 0; i < 6; i++) {
      var d = _getFreeDrop(_dropData);
      if (!d) break;
      d.alive = true;
      d.px = hx; d.py = hy; d.pz = hz;
      d.vx = (Math.random()-0.5)*0.15;
      d.vy = -0.25 - Math.random()*0.5;
      d.vz = (Math.random()-0.5)*0.15;
      d.r         = 0.010 + Math.random()*0.015;
      d.maxLife   = 3.0 + Math.random();
      d.life      = d.maxLife;
      d.viscosity = 0.85;
      d.bounces   = 0; d.maxBounces = 1;
      d.onGround  = false;
      d.color     = col.dark;
      d.frozen    = false; d.charred = false;
    }
  }

  function _fxExplosion(hx, hy, hz, wp, col) {
    var count = wp.dropCount;
    var sMin = wp.dropSpeed[0], sMax = wp.dropSpeed[1];
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var e = (Math.random()-0.15) * Math.PI;
      var spd = sMin + Math.random()*(sMax-sMin);
      var d = _getFreeDrop(_dropData);
      if (!d) break;
      d.alive = true;
      d.px = hx; d.py = hy; d.pz = hz;
      d.vx = Math.cos(a)*Math.cos(e)*spd;
      d.vy = Math.abs(Math.sin(e)*spd) + 2.0;
      d.vz = Math.sin(a)*Math.cos(e)*spd;
      d.r         = 0.014 + Math.random()*0.038;
      d.maxLife   = 3.0 + Math.random()*2.0;
      d.life      = d.maxLife;
      d.viscosity = 0.52;
      d.bounces   = 0; d.maxBounces = 4;
      d.onGround  = false;
      d.color     = (Math.random()<0.3) ? col.dark : col.base;
      d.frozen    = false; d.charred = false;
    }
    // Dense mist cloud
    var mc = wp.mistCount;
    for (var i = 0; i < mc; i++) {
      var d = _getFreeDrop(_mistData);
      if (!d) break;
      var spd = wp.mistSpeed[0] + Math.random()*(wp.mistSpeed[1]-wp.mistSpeed[0]);
      var a   = Math.random() * Math.PI * 2;
      d.alive = true;
      d.px = hx; d.py = hy; d.pz = hz;
      d.vx = Math.cos(a)*spd;
      d.vy = Math.random()*spd*0.5 + 1.0;
      d.vz = Math.sin(a)*spd;
      d.r         = 0.005 + Math.random()*0.009;
      d.maxLife   = 1.2 + Math.random()*0.6;
      d.life      = d.maxLife;
      d.viscosity = 0.18;
      d.bounces   = 0; d.maxBounces = 0;
      d.onGround  = false;
      d.color     = col.mist;
      d.frozen    = false; d.charred = false;
    }
  }

  function _fxCauterize(hx, hy, hz, wp) {
    // Smoke + char particles, almost no blood
    var count = wp.smokeCount || 12;
    for (var i = 0; i < count; i++) {
      var d = _getFreeDrop(_mistData);
      if (!d) break;
      d.alive = true;
      d.px = hx; d.py = hy; d.pz = hz;
      d.vx = (Math.random()-0.5)*0.6;
      d.vy = 0.4 + Math.random()*1.2;
      d.vz = (Math.random()-0.5)*0.6;
      d.r         = 0.008 + Math.random()*0.014;
      d.maxLife   = 1.0 + Math.random()*0.5;
      d.life      = d.maxLife;
      d.viscosity = 0.95;
      d.bounces   = 0; d.maxBounces = 0;
      d.onGround  = false;
      d.color     = (Math.random()<0.6) ? 0x111111 : 0x333322;
      d.charred   = true;
    }
    // Tiny white-hot flash drops
    for (var i = 0; i < 4; i++) {
      var d = _getFreeDrop(_mistData);
      if (!d) break;
      d.alive = true;
      d.px = hx; d.py = hy; d.pz = hz;
      d.vx = (Math.random()-0.5)*2.5; d.vy = 1.5+Math.random(); d.vz = (Math.random()-0.5)*2.5;
      d.r = 0.004; d.maxLife = 0.25+Math.random()*0.15; d.life = d.maxLife;
      d.viscosity = 0.05; d.bounces = 0; d.maxBounces = 0; d.onGround = false;
      d.color = 0xffffff; d.frozen = false; d.charred = false;
    }
    // Very few blood drops (wound still bleeds a tiny bit despite cauterize)
    for (var i = 0; i < wp.dropCount; i++) {
      var d = _getFreeDrop(_dropData);
      if (!d) break;
      d.alive = true;
      d.px = hx; d.py = hy; d.pz = hz;
      d.vx = (Math.random()-0.5)*0.4; d.vy = -0.1+Math.random()*0.3; d.vz = (Math.random()-0.5)*0.4;
      d.r = 0.008; d.maxLife = 2.0; d.life = d.maxLife;
      d.viscosity = 0.90; d.bounces = 0; d.maxBounces = 1; d.onGround = false;
      d.color = 0x440000; d.frozen = false; d.charred = true;
    }
  }

  function _fxIce(hx, hy, hz, wp, col) {
    var count = wp.dropCount;
    for (var i = 0; i < count; i++) {
      var d = _getFreeDrop(_dropData);
      if (!d) break;
      d.alive = true;
      d.px = hx; d.py = hy; d.pz = hz;
      d.vx = (Math.random()-0.5)*3.5; d.vy = Math.random()*2.5; d.vz = (Math.random()-0.5)*3.5;
      d.r         = 0.010 + Math.random()*0.020;
      d.maxLife   = 4.5 + Math.random()*2.0;
      d.life      = d.maxLife;
      d.viscosity = 0.92;
      d.bounces   = 0; d.maxBounces = 1;
      d.onGround  = false;
      d.color     = 0x88ccff;
      d.frozen    = true; d.charred = false;
    }
    // Ice crystal mist
    for (var i = 0; i < wp.mistCount; i++) {
      var d = _getFreeDrop(_mistData);
      if (!d) break;
      d.alive = true;
      d.px = hx; d.py = hy; d.pz = hz;
      d.vx = (Math.random()-0.5)*2; d.vy = Math.random()*1.5; d.vz = (Math.random()-0.5)*2;
      d.r = 0.004; d.maxLife = 1.5+Math.random(); d.life = d.maxLife;
      d.viscosity = 0.80; d.bounces = 0; d.maxBounces = 0; d.onGround = false;
      d.color = 0xaaddff; d.frozen = true; d.charred = false;
    }
  }

  function _fxElectric(hx, hy, hz, wp, col) {
    // Yellow spark steam burst
    for (var i = 0; i < 22; i++) {
      var d = _getFreeDrop(_mistData);
      if (!d) break;
      d.alive = true;
      d.px = hx; d.py = hy; d.pz = hz;
      d.vx = (Math.random()-0.5)*5; d.vy = 1.0+Math.random()*3; d.vz = (Math.random()-0.5)*5;
      d.r = 0.006+Math.random()*0.010; d.maxLife = 0.4+Math.random()*0.3; d.life = d.maxLife;
      d.viscosity = 0.05; d.bounces = 0; d.maxBounces = 0; d.onGround = false;
      d.color = (Math.random()<0.5) ? 0xffee00 : 0xffffff;
      d.frozen = false; d.charred = false;
    }
    // Delayed actual blood (body is shocked, blood comes after)
    var self = this;
    setTimeout(function() {
      if (!_ready) return;
      for (var i = 0; i < wp.dropCount; i++) {
        var d = _getFreeDrop(_dropData);
        if (!d) break;
        d.alive = true;
        d.px = hx; d.py = hy; d.pz = hz;
        d.vx = (Math.random()-0.5)*2.5; d.vy = 0.5+Math.random()*1.5; d.vz = (Math.random()-0.5)*2.5;
        d.r = 0.012+Math.random()*0.018; d.maxLife = 2.0+Math.random(); d.life = d.maxLife;
        d.viscosity = 0.62; d.bounces = 0; d.maxBounces = 3; d.onGround = false;
        d.color = col.base; d.frozen = false; d.charred = false;
      }
    }, 120);
  }

  // ══════════════════════════════════════════
  //  ORGAN DEATH EFFECTS
  // ══════════════════════════════════════════
  function _organDeathFX(gs, organ, hx, hy, hz, wp, col) {
    switch (organ) {

      case 'brain':
        // Neural fluid eruption from top — greenish mist burst
        _burstRadial(hx, hy+0.15, hz, 30, col.organ, 2.5, 6.0, 0.006, 0.010, 1.0, 0.2);
        break;

      case 'heart':
        // 3 massive arterial pulses then silence
        for (var p = 0; p < 3; p++) {
          (function(pulse) {
            setTimeout(function() {
              if (!_ready) return;
              _burstUpward(hx, hy+0.1, hz, 22, 0xff0000, 3.5+pulse, 7.0+pulse, 0.025, 0.04, 3.0, 0.55);
            }, pulse * 170);
          })(p);
        }
        break;

      case 'guts':
        // Slow deflation — timed drip stream downward
        for (var t = 0; t < 45; t++) {
          (function(tick) {
            setTimeout(function() {
              if (!_ready) return;
              var d = _getFreeDrop(_dropData);
              if (!d) return;
              d.alive = true;
              d.px = hx + (Math.random()-0.5)*0.15;
              d.py = hy;
              d.pz = hz + (Math.random()-0.5)*0.15;
              d.vx = (Math.random()-0.5)*0.5;
              d.vy = -0.15 - Math.random()*0.8;
              d.vz = (Math.random()-0.5)*0.5;
              d.r = 0.010+Math.random()*0.016; d.maxLife = 3.0+Math.random(); d.life = d.maxLife;
              d.viscosity = 0.80; d.bounces = 0; d.maxBounces = 1; d.onGround = false;
              d.color = 0x44cc22; d.frozen = false; d.charred = false;
            }, tick * 55);
          })(t);
        }
        break;

      case 'membrane':
        // Outward burst of gel
        _burstRadial(hx, hy, hz, 40, col.base, 2.0, 8.0, 0.014, 0.034, 3.0, 0.58);
        break;

      case 'core':
        _burstRadial(hx, hy, hz, 55, col.organ, 2.5, 9.0, 0.014, 0.032, 3.5, 0.55);
        break;
    }
  }

  // ══════════════════════════════════════════
  //  KILL EXPLOSION — final death burst
  // ══════════════════════════════════════════
  function _killExplosion(ex, ey, ez, wp, col, killedBy, enemy) {

    if (wp.killStyle === 'vaporize') {
      _fxExplosion(ex, ey, ez, wp, col);
      _spawnChunks(ex, ey, ez, null, wp.chunkCount[1], wp, col);
      return;
    }

    if (wp.killStyle === 'combust') {
      for (var i = 0; i < 50; i++) {
        var d = _getFreeDrop(_mistData);
        if (!d) break;
        d.alive = true;
        d.px = ex+(Math.random()-0.5)*0.2; d.py = ey; d.pz = ez+(Math.random()-0.5)*0.2;
        d.vx = (Math.random()-0.5)*1.5; d.vy = 0.5+Math.random()*3.5; d.vz = (Math.random()-0.5)*1.5;
        d.r = 0.010+Math.random()*0.018; d.maxLife = 1.5+Math.random(); d.life = d.maxLife;
        d.viscosity = 0.05; d.bounces = 0; d.maxBounces = 0; d.onGround = false;
        d.color = (Math.random()<0.4) ? 0xff4400 : 0x111111; d.frozen = false; d.charred = true;
      }
      return;
    }

    if (wp.killStyle === 'shatter') {
      // ICE SHATTER — blue chunks + crystal mist
      _spawnChunks(ex, ey, ez, null, 14, wp, col);
      _burstRadial(ex, ey, ez, 40, 0x88ccff, 3.0, 10.0, 0.006, 0.012, 3.5, 0.92);
      return;
    }

    if (wp.killStyle === 'electrocute') {
      // Lightning death — body spasms then collapses
      _burstRadial(ex, ey, ez, 20, 0xffee00, 2.0, 8.0, 0.005, 0.009, 0.5, 0.05);
      setTimeout(function() {
        if (!_ready) return;
        _burstRadial(ex, ey, ez, 50, col.base, 1.0, 5.0, 0.012, 0.025, 3.0, 0.60);
      }, 200);
      return;
    }

    if (wp.killStyle === 'cauterize') {
      // Laser — tiny ember shower, no real blood
      _burstRadial(ex, ey, ez, 20, 0x111111, 0.5, 2.0, 0.008, 0.014, 1.5, 0.90);
      return;
    }

    if (wp.killStyle === 'execution') {
      // Knife takedown — dramatic slow bleed then gush
      for (var p = 0; p < 5; p++) {
        (function(pulse) {
          setTimeout(function() {
            if (!_ready) return;
            _burstUpward(ex, ey+0.08, ez, 12+pulse*2, col.base, 0.3, 1.5+pulse*0.3, 0.018, 0.030, 2.5+pulse*0.5, 0.72);
          }, pulse * 250);
        })(p);
      }
      return;
    }

    // DEFAULT — based on organ that killed
    switch (killedBy) {
      case 'brain':
        _burstUpward(ex, ey+0.2, ez, 35, col.organ, 2.0, 7.0, 0.008, 0.018, 2.5, 0.30);
        _burstRadial(ex, ey, ez, 25, col.base, 1.5, 5.0, 0.012, 0.025, 2.5, 0.60);
        break;
      case 'heart':
        for (var p = 0; p < 4; p++) {
          (function(pulse) {
            setTimeout(function() {
              if (!_ready) return;
              _burstUpward(ex, ey+0.05, ez, 18, 0xff0000, 3.5, 8.0, 0.024, 0.040, 3.0, 0.55);
            }, pulse*160);
          })(p);
        }
        break;
      case 'guts':
        // Slow deflation
        for (var t = 0; t < 80; t++) {
          (function(tick) {
            setTimeout(function() {
              if (!_ready) return;
              var d = _getFreeDrop(_dropData);
              if (!d) return;
              d.alive = true;
              d.px = ex+(Math.random()-0.5)*0.25; d.py = ey; d.pz = ez+(Math.random()-0.5)*0.25;
              d.vx = (Math.random()-0.5)*1.0; d.vy = -0.1-Math.random()*0.6; d.vz = (Math.random()-0.5)*1.0;
              d.r = 0.009+Math.random()*0.018; d.maxLife = 3.5+Math.random(); d.life = d.maxLife;
              d.viscosity = 0.82; d.bounces = 0; d.maxBounces = 1; d.onGround = false;
              d.color = 0x44cc22; d.frozen = false; d.charred = false;
            }, tick * 38);
          })(t);
        }
        break;
      default:
        _burstRadial(ex, ey, ez, 65, col.base, 2.0, 8.0, 0.012, 0.030, 3.0, 0.58);
        if (Math.random() < 0.5) _spawnChunks(ex, ey, ez, null, 3+Math.floor(Math.random()*4), wp, col);
        break;
    }
  }

  // ══════════════════════════════════════════
  //  BURST HELPERS
  // ══════════════════════════════════════════

  function _burstRadial(ox, oy, oz, count, color, spdMin, spdMax, rMin, rMax, life, visc) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var e = (Math.random()-0.2) * Math.PI;
      var s = spdMin + Math.random() * (spdMax - spdMin);
      var d = _getFreeDrop(_dropData);
      if (!d) break;
      d.alive = true;
      d.px = ox; d.py = oy; d.pz = oz;
      d.vx = Math.cos(a)*Math.cos(e)*s;
      d.vy = Math.abs(Math.sin(e)*s) + Math.random()*1.5;
      d.vz = Math.sin(a)*Math.cos(e)*s;
      d.r         = rMin + Math.random()*(rMax-rMin);
      d.maxLife   = life + Math.random()*1.5;
      d.life      = d.maxLife;
      d.viscosity = visc;
      d.bounces   = 0; d.maxBounces = 3;
      d.onGround  = false;
      d.color     = color;
      d.frozen    = false; d.charred = false;
    }
  }

  function _burstUpward(ox, oy, oz, count, color, spdMin, spdMax, rMin, rMax, life, visc) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = spdMin + Math.random() * (spdMax - spdMin);
      var d = _getFreeDrop(_dropData);
      if (!d) break;
      d.alive = true;
      d.px = ox; d.py = oy; d.pz = oz;
      d.vx = Math.cos(a)*(0.5+Math.random()*1.5);
      d.vy = s;
      d.vz = Math.sin(a)*(0.5+Math.random()*1.5);
      d.r         = rMin + Math.random()*(rMax-rMin);
      d.maxLife   = life + Math.random()*1.0;
      d.life      = d.maxLife;
      d.viscosity = visc;
      d.bounces   = 0; d.maxBounces = 4;
      d.onGround  = false;
      d.color     = color;
      d.frozen    = false; d.charred = false;
    }
  }

  // ══════════════════════════════════════════
  //  CHUNK SPAWNING
  // ══════════════════════════════════════════
  function _spawnChunks(ox, oy, oz, normal, count, wp, col) {
    for (var i = 0; i < count; i++) {
      var c = _getFreeChunk();
      if (!c) break;
      var a = Math.random() * Math.PI * 2;
      var e = 0.3 + Math.random() * 0.6;
      var s = 3.0 + Math.random() * (wp.dropSpeed ? wp.dropSpeed[1] * 0.55 : 8.0);
      c.alive  = true;
      c.px = ox; c.py = oy; c.pz = oz;
      c.vx = Math.cos(a)*Math.cos(e)*s;
      c.vy = Math.sin(e)*s + 1.5;
      c.vz = Math.sin(a)*Math.cos(e)*s;
      c.rvx = (Math.random()-0.5)*18;
      c.rvy = (Math.random()-0.5)*18;
      c.rvz = (Math.random()-0.5)*18;
      c.rx = 0; c.ry = 0; c.rz = 0;
      c.life    = 4.0 + Math.random()*3.0;
      c.size    = 0.04 + Math.random()*0.13;
      c.bounces = 0;
      c.color   = col.base;
      if (c.mesh) {
        c.mesh.visible = true;
        c.mesh.scale.setScalar(c.size);
        c.mesh.material.color.setHex(c.color);
        c.mesh.material.opacity = 1.0;
      }
    }
  }

  // ══════════════════════════════════════════
  //  DECALS
  // ══════════════════════════════════════════
  function _spawnDecal(x, z, radius, color) {
    var dd = _decals[_decalIdx % CFG.DECAL_COUNT];
    _decalIdx++;
    dd.alive   = true;
    dd.life    = CFG.DECAL_FADE;
    dd.maxLife = CFG.DECAL_FADE;
    dd.mesh.position.set(x, CFG.GROUND_Y, z);
    // Irregular shape: vary x and z scale separately
    dd.mesh.scale.set(
      radius * (7 + Math.random() * 3),
      1,
      radius * (5 + Math.random() * 5)
    );
    dd.mesh.rotation.z = Math.random() * Math.PI * 2;
    dd.mesh.material.color.setHex(color || 0x880000);
    dd.mesh.material.opacity = 0.70 + Math.random()*0.15;
    dd.mesh.visible = true;
  }

  function _spawnSplat(x, z, size, color) {
    _spawnDecal(x, z, size * 1.2, color);
  }

  // ══════════════════════════════════════════
  //  ANATOMY HELPERS
  // ══════════════════════════════════════════
  function _getOrgan(type, localY) {
    var profile = ANATOMY[type] || ANATOMY.slime;
    for (var k in profile) {
      var o = profile[k];
      if (localY >= o.yRange[0] && localY <= o.yRange[1]) return k;
    }
    return 'membrane';
  }

  function _damageOrgan(gs, organ, amount) {
    if (!gs.organs[organ]) return false;
    gs.organs[organ].hp -= amount;
    if (gs.organs[organ].hp <= 0) {
      gs.organs[organ].hp = 0;
      if (!gs.killedBy) gs.killedBy = organ;
      return true;
    }
    return false;
  }

  function _addWound(gs, lx, ly, lz, radius, organ, wp, col) {
    var MERGE = 0.14;
    // Check for existing nearby wound to grow
    for (var i = 0; i < gs.wounds.length; i++) {
      var w = gs.wounds[i];
      if (!w.alive) continue;
      var dist = Math.sqrt((w.lx-lx)*(w.lx-lx)+(w.ly-ly)*(w.ly-ly)+(w.lz-lz)*(w.lz-lz));
      if (dist < MERGE) {
        // GROW existing wound
        w.hits++;
        w.radius = Math.min(w.radius + radius * 0.35, 0.45);
        w.depth  = Math.min(w.depth  + wp.penetration * 0.4, 1.0);
        return w;
      }
    }
    // Find free wound slot
    var slot = null;
    for (var i = 0; i < gs.wounds.length; i++) {
      if (!gs.wounds[i].alive) { slot = gs.wounds[i]; break; }
    }
    if (!slot && gs.wounds.length < CFG.WOUND_PER_ENEMY) {
      slot = makeWound();
      gs.wounds.push(slot);
    } else if (!slot) {
      slot = gs.wounds[0]; // recycle oldest
    }
    slot.alive      = true;
    slot.lx = lx; slot.ly = ly; slot.lz = lz;
    slot.radius     = radius;
    slot.depth      = wp.penetration;
    slot.hits       = 1;
    slot.organ      = organ;
    slot.dripTimer  = 0;
    slot.cauterized = wp.cauterizes  || false;
    slot.frozen     = wp.freezesBlood || false;
    slot.color      = (ENEMY_BLOOD[gs.type] || ENEMY_BLOOD.default).dark;
    return slot;
  }

  // ══════════════════════════════════════════
  //  ARTERIAL STREAM
  // ══════════════════════════════════════════
  function _startStream(enemy, lx, ly, lz, normal, color, life) {
    var s = null;
    for (var i = 0; i < _streams.length; i++) {
      if (!_streams[i].alive) { s = _streams[i]; break; }
    }
    if (!s) {
      if (_streams.length < CFG.STREAM_COUNT) {
        s = makeStream();
        _streams.push(s);
      } else {
        s = _streams[0];
      }
    }
    s.alive    = true;
    s.enemy    = enemy;
    s.lx = lx; s.ly = ly; s.lz = lz;
    s.dx = normal ? normal.x : (Math.random()-0.5)*0.5;
    s.dy = normal ? normal.y : 0.6 + Math.random()*0.4;
    s.dz = normal ? normal.z : (Math.random()-0.5)*0.5;
    // Normalise direction
    var len = Math.sqrt(s.dx*s.dx + s.dy*s.dy + s.dz*s.dz) + 0.001;
    s.dx /= len; s.dy /= len; s.dz /= len;
    s.pressure = 1.0;
    s.life     = life || 6.0;
    s.timer    = 0;
    s.color    = color || 0xcc0000;
  }

  // ══════════════════════════════════════════
  //  POOL HELPERS
  // ══════════════════════════════════════════
  function _getFreeDrop(pool) {
    for (var i = 0; i < pool.length; i++) {
      if (!pool[i].alive) return pool[i];
    }
    // Recycle the drop with least life remaining
    var oldest = pool[0], oldestLife = pool[0].life;
    for (var i = 1; i < pool.length; i++) {
      if (pool[i].alive && pool[i].life < oldestLife) {
        oldest = pool[i]; oldestLife = pool[i].life;
      }
    }
    _killDrop(oldest, oldest.isMist ? _mistIM : _dropIM);
    return oldest;
  }

  function _getFreeChunk() {
    for (var i = 0; i < _chunks.length; i++) {
      if (!_chunks[i].alive) return _chunks[i];
    }
    // Recycle oldest
    var oldest = _chunks[0];
    for (var i = 1; i < _chunks.length; i++) {
      if (_chunks[i].alive && _chunks[i].life < oldest.life) oldest = _chunks[i];
    }
    _killChunk(oldest);
    return oldest;
  }

  function _killDrop(d, im) {
    d.alive = false;
    _m4.makeScale(0.001, 0.001, 0.001);
    _m4.setPosition(-9999, -9999, -9999);
    if (im) im.setMatrixAt(d.idx, _m4);
  }

  function _killChunk(c) {
    c.alive = false;
    if (c.mesh) c.mesh.visible = false;
  }

  // ══════════════════════════════════════════
  //  PUBLIC OBJECT
  // ══════════════════════════════════════════
  global.BloodV2 = {
    // Core API
    init:    init,
    hit:     hit,
    kill:    kill,
    update:  update,
    reset:   reset,

    // Data tables — extend these to add new weapons/enemies
    WEAPONS:     WEAPONS,
    ANATOMY:     ANATOMY,
    ENEMY_BLOOD: ENEMY_BLOOD,
    CFG:         CFG,

    // Utility: get kill description text for UI/AI narration
    getKillText: function(weaponKey, organ) {
      var desc = {
        brain:    'Neural fluid erupts. Cross-eyed wobble. Melts top-down.',
        heart:    'Pumping core bursts. Three massive spurts. Collapse.',
        guts:     'Digestive sac deflates. Slow. Wet. Inevitable.',
        membrane: 'Outer gel explodes outward. Raw tissue exposed.',
        core:     'Vital fluid drains. Sags. Shrinks. Gone.',
      };
      return {
        weapon: (WEAPONS[weaponKey] || WEAPONS.pistol).label,
        organ:  organ,
        death:  desc[organ] || 'It dies.',
      };
    },

    // Add a new enemy blood colour easily
    addEnemyBlood: function(enemyType, base, dark, organ, mist) {
      ENEMY_BLOOD[enemyType] = { base:base, dark:dark, organ:organ, mist:mist };
    },

    // Add a new weapon profile
    addWeapon: function(key, profile) {
      WEAPONS[key] = profile;
    },

    // Add a new enemy anatomy
    addAnatomy: function(enemyType, anatomyProfile) {
      ANATOMY[enemyType] = anatomyProfile;
    },
  };

  // Print integration guide
  console.log([
    '',
    '╔══════════════════════════════════════════════════════╗',
    '║  BloodV2 — Realistic Gore System — LOADED           ║',
    '╠══════════════════════════════════════════════════════╣',
    '║  Step 1  sandbox.html:                              ║',
    '║    <script src="js/blood-system-v2.js"></script>    ║',
    '║    (after three.js, before enemy-class.js)          ║',
    '║                                                      ║',
    '║  Step 2  game-screens.js  init():                   ║',
    '║    window.BloodV2.init(scene);                      ║',
    '║                                                      ║',
    '║  Step 3  game-loop.js  animate():                   ║',
    '║    window.BloodV2.update(delta);                    ║',
    '║                                                      ║',
    '║  Step 4  combat.js  on bullet hit:                  ║',
    '║    window.BloodV2.hit(enemy,                        ║',
    '║      "shotgun", hitPoint, hitNormal);               ║',
    '║                                                      ║',
    '║  Step 5  enemy-class.js  on death:                  ║',
    '║    window.BloodV2.kill(enemy, "shotgun");           ║',
    '║                                                      ║',
    '║  Reset:  window.BloodV2.reset();                    ║',
    '╚══════════════════════════════════════════════════════╝',
    '',
  ].join('\n'));

})(window);
