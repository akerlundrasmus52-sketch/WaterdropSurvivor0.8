/**
 * Blood System V2 — Water Drop Survivor
 * High-performance Three.js blood particle system
 * Zero allocations in hot path, InstancedMesh rendering
 */
(function (global) {
  'use strict';

  /* ==========================================================
   *  1. CONSTANTS — Pool Sizes
   * ========================================================== */
  var DROP_COUNT      = 700;
  var MIST_COUNT      = 350;
  var CHUNK_COUNT     = 50;
  var DECAL_COUNT     = 250;
  var STREAM_COUNT    = 20;
  var WOUND_PER_ENEMY = 8;

  /* ==========================================================
   *  1b. CONSTANTS — Physics
   * ========================================================== */
  var GRAVITY           = -18.0;
  var GROUND_Y          = 0.06;
  var DECAL_FADE        = 35.0;
  var DRIP_RATE         = 0.10;
  var PUMP_RATE         = 0.035;
  var BOUNCE_DECAL_PROB = 0.25;
  var BLOOD_VISCOSITY   = 0.38;
  var MIST_VISCOSITY    = 0.15;
  var BOUNCE_ENERGY     = 0.32;
  var BOUNCE_LATERAL    = 0.58;
  var STRETCH_THRESHOLD = 2.8;
  var STRETCH_FACTOR    = 0.09;

  /* ==========================================================
   *  1c. CONSTANTS — Enemy Blood Colors
   * ========================================================== */
  var ENEMY_BLOOD = {
    slime:         { base: 0x1adb4e, dark: 0x0d8c2e, organ: 0x00ff99, mist: 0x44ff77 },
    bug:           { base: 0xb8e000, dark: 0x6a8000, organ: 0xeeff00, mist: 0xccee22 },
    human:         { base: 0xcc0a00, dark: 0x7a0000, organ: 0xff2200, mist: 0xff1100 },
    alien:         { base: 0x8800ee, dark: 0x3d0077, organ: 0xcc33ff, mist: 0x9900cc },
    robot:         { base: 0x6699ff, dark: 0x223388, organ: 0xffffff, mist: 0x99bbff },
    crawler:       { base: 0x8b3a1a, dark: 0x551500, organ: 0xcc5522, mist: 0xaa6633 },
    leaping_slime: { base: 0x00ccff, dark: 0x0077aa, organ: 0x00ffff, mist: 0x44ddff },
    default:       { base: 0xcc0a00, dark: 0x7a0000, organ: 0xff2200, mist: 0xff1100 }
  };

  /* ==========================================================
   *  1d. CONSTANTS — Anatomy
   * ========================================================== */
  var ANATOMY = {
    brain:    { hp: 30,  yRange: [0.65, 1.0],    bleedRate: 0.20, pumpBlood: false },
    heart:    { hp: 40,  yRange: [0.20, 0.65],   bleedRate: 1.20, pumpBlood: true  },
    guts:     { hp: 70,  yRange: [-0.25, 0.20],  bleedRate: 0.65, pumpBlood: false },
    membrane: { hp: 120, yRange: [-0.75, -0.25], bleedRate: 0.30, pumpBlood: false },
    core:     { hp: 90,  yRange: [-1.0, -0.75],  bleedRate: 0.80, pumpBlood: false }
  };

  /* ==========================================================
   *  1e. CONSTANTS — Weapon Profiles
   * ========================================================== */
  var WEAPON_PROFILES = {
    pistol: {
      woundR: 0.040, penetration: 0.42, exitWound: true, exitScale: 2.0,
      dropCount: 12, dropSpeed: [4.0, 9.0], mistCount: 7, mistSpeed: [1.5, 4.0],
      chunkChance: 0.0, chunkCount: [0, 0], pushForce: 0.40, organDmg: 20,
      pumpOnHeart: true, killStyle: 'penetration'
    },
    revolver: {
      woundR: 0.065, penetration: 0.68, exitWound: true, exitScale: 2.8,
      dropCount: 18, dropSpeed: [6.0, 14.0], mistCount: 12, mistSpeed: [2.5, 6.0],
      chunkChance: 0.10, chunkCount: [1, 2], pushForce: 1.0, organDmg: 32,
      pumpOnHeart: true, shockwave: true, shockR: 1.0, killStyle: 'penetration'
    },
    shotgun: {
      woundR: 0.28, penetration: 0.20, exitWound: false, exitScale: 1.0,
      dropCount: 55, dropSpeed: [8.0, 22.0], mistCount: 38, mistSpeed: [4.0, 11.0],
      chunkChance: 0.90, chunkCount: [5, 12], pushForce: 4.5, organDmg: 65,
      pellets: 9, pelletAngle: 30, pumpOnHeart: true, killStyle: 'devastation'
    },
    smg: {
      woundR: 0.030, penetration: 0.40, exitWound: true, exitScale: 1.5,
      dropCount: 9, dropSpeed: [3.5, 8.0], mistCount: 6, mistSpeed: [1.2, 3.5],
      chunkChance: 0.0, chunkCount: [0, 0], pushForce: 0.22, organDmg: 14,
      pumpOnHeart: true, killStyle: 'perforation'
    },
    sniper: {
      woundR: 0.018, penetration: 1.0, exitWound: true, exitScale: 0.90,
      dropCount: 22, dropSpeed: [12.0, 32.0], mistCount: 25, mistSpeed: [6.0, 16.0],
      chunkChance: 0.22, chunkCount: [1, 3], pushForce: 2.5, organDmg: 90,
      supersonicCavity: true, cavityR: 2.6, pumpOnHeart: true, killStyle: 'supersonic'
    },
    minigun: {
      woundR: 0.025, penetration: 0.35, exitWound: true, exitScale: 1.3,
      dropCount: 8, dropSpeed: [3.5, 7.0], mistCount: 5, mistSpeed: [1.0, 3.2],
      chunkChance: 0.02, chunkCount: [0, 1], pushForce: 0.20, organDmg: 11,
      pumpOnHeart: true, killStyle: 'saturation'
    },
    grenade: {
      woundR: 0.60, penetration: 0.88, exitWound: false, exitScale: 1.0,
      dropCount: 90, dropSpeed: [16.0, 40.0], mistCount: 60, mistSpeed: [7.0, 20.0],
      chunkChance: 1.0, chunkCount: [10, 20], pushForce: 25.0, organDmg: 220,
      isExplosive: true, blastR: 4.0, killStyle: 'explosion'
    },
    rocket: {
      woundR: 1.00, penetration: 1.0, exitWound: false, exitScale: 1.0,
      dropCount: 180, dropSpeed: [25.0, 60.0], mistCount: 120, mistSpeed: [12.0, 28.0],
      chunkChance: 1.0, chunkCount: [18, 35], pushForce: 60.0, organDmg: 9999,
      isExplosive: true, blastR: 7.0, killStyle: 'vaporize'
    },
    laser: {
      woundR: 0.016, penetration: 1.0, exitWound: true, exitScale: 0.65,
      dropCount: 2, dropSpeed: [0.2, 1.0], mistCount: 0, mistSpeed: [0, 0],
      chunkChance: 0.0, chunkCount: [0, 0], pushForce: 0.04, organDmg: 50,
      cauterizes: true, smokeCount: 14, pumpOnHeart: false, killStyle: 'cauterize'
    },
    plasma: {
      woundR: 0.15, penetration: 0.72, exitWound: false, exitScale: 1.0,
      dropCount: 26, dropSpeed: [5.5, 15.0], mistCount: 18, mistSpeed: [2.5, 8.0],
      chunkChance: 0.38, chunkCount: [2, 6], pushForce: 3.0, organDmg: 68,
      charEffect: true, pumpOnHeart: true, killStyle: 'melt'
    },
    knife: {
      woundR: 0.020, penetration: 0.94, exitWound: false, exitScale: 1.0,
      dropCount: 14, dropSpeed: [0.4, 2.0], mistCount: 0, mistSpeed: [0, 0],
      chunkChance: 0.0, chunkCount: [0, 0], pushForce: 0.07, organDmg: 38,
      isSlash: true, slashArc: 0.40, pumpOnHeart: true, killStyle: 'slash'
    },
    sword: {
      woundR: 0.038, penetration: 0.85, exitWound: false, exitScale: 1.0,
      dropCount: 28, dropSpeed: [0.6, 3.5], mistCount: 3, mistSpeed: [0.5, 2.0],
      chunkChance: 0.12, chunkCount: [1, 2], pushForce: 1.0, organDmg: 55,
      isSlash: true, slashArc: 0.70, pumpOnHeart: true, killStyle: 'sever'
    },
    axe: {
      woundR: 0.085, penetration: 0.96, exitWound: false, exitScale: 1.0,
      dropCount: 38, dropSpeed: [1.2, 5.0], mistCount: 5, mistSpeed: [0.5, 2.5],
      chunkChance: 0.45, chunkCount: [2, 4], pushForce: 2.5, organDmg: 70,
      isSlash: true, slashArc: 0.55, pumpOnHeart: true, killStyle: 'cleave'
    },
    flame: {
      woundR: 0.18, penetration: 0.18, exitWound: false, exitScale: 1.0,
      dropCount: 0, dropSpeed: [0, 0], mistCount: 0, mistSpeed: [0, 0],
      chunkChance: 0.0, chunkCount: [0, 0], pushForce: 0.6, organDmg: 28,
      cauterizes: true, charEffect: true, burnsEnemy: true, killStyle: 'combust'
    },
    ice: {
      woundR: 0.065, penetration: 0.52, exitWound: false, exitScale: 1.0,
      dropCount: 10, dropSpeed: [0.6, 2.5], mistCount: 4, mistSpeed: [0.3, 1.5],
      chunkChance: 0.0, chunkCount: [0, 0], pushForce: 0.35, organDmg: 30,
      freezesBlood: true, killStyle: 'shatter'
    },
    lightning: {
      woundR: 0.028, penetration: 1.0, exitWound: true, exitScale: 1.0,
      dropCount: 6, dropSpeed: [1.5, 5.0], mistCount: 4, mistSpeed: [0.5, 2.0],
      chunkChance: 0.06, chunkCount: [0, 1], pushForce: 3.5, organDmg: 45,
      electricEffect: true, killStyle: 'electrocute'
    },
    knife_takedown: {
      woundR: 0.022, penetration: 0.96, exitWound: false, exitScale: 1.0,
      dropCount: 16, dropSpeed: [0.2, 0.9], mistCount: 0, mistSpeed: [0, 0],
      chunkChance: 0.0, chunkCount: [0, 0], pushForce: 0.04, organDmg: 44,
      isSlash: true, slashArc: 0.22, pumpOnHeart: true, isTakedown: true, killStyle: 'execution'
    }
  };

  /* ==========================================================
   *  2. PRE-ALLOCATED SCRATCH — zero new inside update()
   * ========================================================== */
  var _s0 = new THREE.Vector3();
  var _s1 = new THREE.Vector3();
  var _s2 = new THREE.Vector3();
  var _s3 = new THREE.Vector3();
  var _mat4 = new THREE.Matrix4();
  var _quat = new THREE.Quaternion();
  var _identityQuat = new THREE.Quaternion();
  var _col = new THREE.Color();

  /* ==========================================================
   *  3-7. POOLS & STATE
   * ========================================================== */
  var _drops   = [];
  var _mists   = [];
  var _chunks  = [];
  var _decals  = [];
  var _streams = [];

  var _dropIM  = null;
  var _mistIM  = null;

  var _activeDropCount = 0;
  var _activeMistCount = 0;
  var _colorDirty      = false;

  var _scene   = null;
  var _elapsed = 0;

  var _goreMap  = new Map();
  var _goreList = [];

  var _chunkGeo = null;
  var _decalGeo = null;

  /* ==========================================================
   *  8. HELPERS
   * ========================================================== */
  function _rand(a, b) { return a + Math.random() * (b - a); }
  function _randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  function _bloodColors(enemy) {
    var type = 'default';
    if (enemy) {
      type = enemy.bloodType || enemy.enemyType || enemy.type || 'default';
    }
    return ENEMY_BLOOD[type] || ENEMY_BLOOD['default'];
  }

  function _getEnemyHeight(enemy) {
    if (enemy.userData && enemy.userData.height) return enemy.userData.height;
    if (enemy.geometry && enemy.geometry.parameters &&
        enemy.geometry.parameters.height) return enemy.geometry.parameters.height;
    return 2.0;
  }

  /* ==========================================================
   *  9. _getEnemyGore — per-enemy wound & organ state
   * ========================================================== */
  function _getEnemyGore(enemy) {
    var id = enemy.uuid || enemy.id || enemy.__goreId;
    if (!id) {
      id = '__gore_' + Math.random().toString(36).substr(2, 9);
      enemy.__goreId = id;
    }
    if (_goreMap.has(id)) return _goreMap.get(id);

    var gore = {
      enemy: enemy,
      id: id,
      type: enemy.bloodType || enemy.enemyType || enemy.type || 'default',
      organs: {},
      wounds: [],
      streamIndices: []
    };

    for (var key in ANATOMY) {
      if (ANATOMY.hasOwnProperty(key)) {
        gore.organs[key] = { hp: ANATOMY[key].hp };
      }
    }

    _goreMap.set(id, gore);
    _goreList.push(gore);
    return gore;
  }

  /* ==========================================================
   *  10. _resolveOrgan — Y-position → organ name
   * ========================================================== */
  function _resolveOrgan(localY) {
    for (var key in ANATOMY) {
      if (ANATOMY.hasOwnProperty(key)) {
        var a = ANATOMY[key];
        if (localY >= a.yRange[0] && localY <= a.yRange[1]) return key;
      }
    }
    return 'guts';
  }

  /* ==========================================================
   *  11. LRU Eviction — pool slot finders
   * ========================================================== */
  function _findDropSlot() {
    if (_activeDropCount < DROP_COUNT) {
      return _activeDropCount++;
    }
    var minIdx = 0;
    var minLife = _drops[0].life;
    for (var i = 1; i < DROP_COUNT; i++) {
      if (_drops[i].life < minLife) {
        minLife = _drops[i].life;
        minIdx = i;
      }
    }
    return minIdx;
  }

  function _findMistSlot() {
    if (_activeMistCount < MIST_COUNT) {
      return _activeMistCount++;
    }
    var minIdx = 0;
    var minLife = _mists[0].life;
    for (var i = 1; i < MIST_COUNT; i++) {
      if (_mists[i].life < minLife) {
        minLife = _mists[i].life;
        minIdx = i;
      }
    }
    return minIdx;
  }

  /* ==========================================================
   *  12. _spawnDrops — emit blood droplets
   * ========================================================== */
  function _spawnDrops(ox, oy, oz, count, spdMin, spdMax, color, dirX, dirY, dirZ, spread) {
    spread = spread || 0.6;
    for (var i = 0; i < count; i++) {
      var slot = _findDropSlot();
      var d = _drops[slot];
      d.px = ox; d.py = oy; d.pz = oz;

      var spd = _rand(spdMin, spdMax);
      var rx  = (Math.random() - 0.5) * 2;
      var ry  = (Math.random() - 0.5) * 2;
      var rz  = (Math.random() - 0.5) * 2;
      var dx  = dirX + rx * spread;
      var dy  = dirY + ry * spread;
      var dz  = dirZ + rz * spread;
      var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

      d.vx = (dx / len) * spd;
      d.vy = (dy / len) * spd;
      d.vz = (dz / len) * spd;
      d.life = _rand(0.6, 2.5);
      d.maxLife = d.life;
      d.bounces = 0;
      d.maxBounces = 2;
      d.settled = false;
      d.radius = _rand(0.012, 0.04);
      d.color.set(color);
      d.color.r += (Math.random() - 0.5) * 0.08;
      d.color.g += (Math.random() - 0.5) * 0.04;
      d.color.b += (Math.random() - 0.5) * 0.04;
      _colorDirty = true;
    }
  }

  /* ==========================================================
   *  13. _spawnSlashDrops — arc-shaped blood for melee
   * ========================================================== */
  function _spawnSlashDrops(ox, oy, oz, count, spdMin, spdMax, color, nx, ny, nz, arc) {
    for (var i = 0; i < count; i++) {
      var slot = _findDropSlot();
      var d = _drops[slot];
      d.px = ox; d.py = oy; d.pz = oz;

      var angle = (Math.random() - 0.5) * arc * Math.PI;
      var cosA  = Math.cos(angle);
      var sinA  = Math.sin(angle);
      var adx   = nx * cosA - nz * sinA;
      var adz   = nx * sinA + nz * cosA;

      var spd = _rand(spdMin, spdMax);
      d.vx = adx * spd;
      d.vy = (ny + Math.random() * 0.5) * spd;
      d.vz = adz * spd;
      d.life = _rand(0.6, 2.0);
      d.maxLife = d.life;
      d.bounces = 0;
      d.maxBounces = 2;
      d.settled = false;
      d.radius = _rand(0.012, 0.04);
      d.color.set(color);
      d.color.r += (Math.random() - 0.5) * 0.06;
      d.color.g += (Math.random() - 0.5) * 0.03;
      d.color.b += (Math.random() - 0.5) * 0.03;
      _colorDirty = true;
    }
  }

  /* ==========================================================
   *  14. _spawnMist — emit mist / spray particles
   * ========================================================== */
  function _spawnMist(ox, oy, oz, count, spdMin, spdMax, color) {
    for (var i = 0; i < count; i++) {
      var slot = _findMistSlot();
      var m = _mists[slot];
      m.px = ox; m.py = oy; m.pz = oz;

      var spd   = _rand(spdMin, spdMax);
      var theta = Math.random() * Math.PI * 2;
      var phi   = Math.random() * Math.PI;
      m.vx = Math.sin(phi) * Math.cos(theta) * spd;
      m.vy = Math.abs(Math.sin(phi) * Math.sin(theta)) * spd + 0.5;
      m.vz = Math.cos(phi) * spd;

      m.life    = _rand(0.3, 1.2);
      m.maxLife = m.life;
      m.radius  = _rand(0.04, 0.12);
      m.color.set(color);
      m.color.r += (Math.random() - 0.5) * 0.05;
      m.color.g += (Math.random() - 0.5) * 0.05;
      m.color.b += (Math.random() - 0.5) * 0.05;
      _colorDirty = true;
    }
  }

  /* ==========================================================
   *  15. _spawnChunks — emit flesh / gore chunks
   * ========================================================== */
  function _spawnChunks(ox, oy, oz, count, color, force) {
    force = force || 5;
    for (var i = 0; i < count; i++) {
      var slot = -1;
      for (var j = 0; j < CHUNK_COUNT; j++) {
        if (!_chunks[j].userData.active) { slot = j; break; }
      }
      if (slot < 0) {
        var minLife = Infinity;
        for (var j = 0; j < CHUNK_COUNT; j++) {
          if (_chunks[j].userData.life < minLife) {
            minLife = _chunks[j].userData.life;
            slot = j;
          }
        }
      }
      if (slot < 0) return;

      var c  = _chunks[slot];
      var ud = c.userData;
      c.position.set(ox, oy, oz);
      c.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      c.material.color.set(color);
      c.visible = true;

      var theta = Math.random() * Math.PI * 2;
      var phi   = Math.random() * Math.PI * 0.5;
      ud.vx    = Math.sin(phi) * Math.cos(theta) * force;
      ud.vy    = Math.cos(phi) * force * 0.5 + Math.random() * force * 0.5;
      ud.vz    = Math.sin(phi) * Math.sin(theta) * force;
      ud.spinX = (Math.random() - 0.5) * 15;
      ud.spinY = (Math.random() - 0.5) * 15;
      ud.spinZ = (Math.random() - 0.5) * 15;
      ud.life    = _rand(2.0, 6.0);
      ud.bounces = 0;
      ud.active  = true;
    }
  }

  /* ==========================================================
   *  16. _spawnDecal — place a ground blood decal
   * ========================================================== */
  function _spawnDecal(x, z, radius, color) {
    if (!_scene) return;
    var slot = -1;
    var oldestBirth = Infinity;
    for (var i = 0; i < DECAL_COUNT; i++) {
      var ud = _decals[i].userData;
      if (!ud.active) { slot = i; break; }
      if (ud.birthTime < oldestBirth) {
        oldestBirth = ud.birthTime;
        slot = i;
      }
    }
    if (slot < 0) return;

    var mesh = _decals[slot];
    mesh.position.set(x, GROUND_Y + 0.002, z);
    mesh.scale.set(radius, radius, radius);
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.material.color.set(color);
    mesh.material.opacity = 0.85;
    mesh.visible = true;
    mesh.userData.active    = true;
    mesh.userData.birthTime = _elapsed;
  }

  /* ==========================================================
   *  16b. _spawnStream — start arterial pump stream
   * ========================================================== */
  function _spawnStream(ox, oy, oz, dirX, dirY, dirZ, color, life, enemyId) {
    var slot = -1;
    for (var i = 0; i < STREAM_COUNT; i++) {
      if (!_streams[i].active) { slot = i; break; }
    }
    if (slot < 0) {
      var minLife = Infinity;
      for (var i = 0; i < STREAM_COUNT; i++) {
        if (_streams[i].life < minLife) {
          minLife = _streams[i].life;
          slot = i;
        }
      }
    }
    if (slot < 0) return;

    var s = _streams[slot];
    s.active    = true;
    s.enemyId   = enemyId || null;
    s.ox = ox; s.oy = oy; s.oz = oz;
    s.dirX = dirX; s.dirY = dirY; s.dirZ = dirZ;
    s.color     = color;
    s.life      = life || 5.0;
    s.pumpTimer = 0;
  }

  /* ==========================================================
   *  10. init() — create meshes, add to scene
   * ========================================================== */
  function init(scene) {
    _scene   = scene;
    _elapsed = 0;

    /* --- Drop InstancedMesh --- */
    var dropGeo = new THREE.SphereGeometry(1, 6, 4);
    var dropMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 });
    _dropIM = new THREE.InstancedMesh(dropGeo, dropMat, DROP_COUNT);
    _dropIM.frustumCulled = false;
    _dropIM.count = 0;
    _scene.add(_dropIM);

    for (var i = 0; i < DROP_COUNT; i++) {
      _dropIM.setColorAt(i, _col.set(0xcc0a00));
    }
    _dropIM.instanceColor.needsUpdate = true;

    /* --- Mist InstancedMesh --- */
    var mistGeo = new THREE.SphereGeometry(1, 4, 3);
    var mistMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4 });
    _mistIM = new THREE.InstancedMesh(mistGeo, mistMat, MIST_COUNT);
    _mistIM.frustumCulled = false;
    _mistIM.count = 0;
    _scene.add(_mistIM);

    for (var i = 0; i < MIST_COUNT; i++) {
      _mistIM.setColorAt(i, _col.set(0xff1100));
    }
    _mistIM.instanceColor.needsUpdate = true;

    /* --- Drop pool --- */
    _drops.length = 0;
    for (var i = 0; i < DROP_COUNT; i++) {
      _drops.push({
        px: 0, py: 0, pz: 0,
        vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1,
        bounces: 0, maxBounces: 2,
        settled: false,
        color: new THREE.Color(0xcc0a00),
        radius: 0.02
      });
    }

    /* --- Mist pool --- */
    _mists.length = 0;
    for (var i = 0; i < MIST_COUNT; i++) {
      _mists.push({
        px: 0, py: 0, pz: 0,
        vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1,
        color: new THREE.Color(0xff1100),
        radius: 0.05
      });
    }

    /* --- Chunk pool --- */
    _chunks.length = 0;
    _chunkGeo = new THREE.DodecahedronGeometry(0.06, 0);
    for (var i = 0; i < CHUNK_COUNT; i++) {
      var cMat  = new THREE.MeshLambertMaterial({ color: 0xcc0a00 });
      var cMesh = new THREE.Mesh(_chunkGeo, cMat);
      cMesh.visible  = false;
      cMesh.userData = {
        active: false, vx: 0, vy: 0, vz: 0,
        spinX: 0, spinY: 0, spinZ: 0,
        life: 0, bounces: 0
      };
      _chunks.push(cMesh);
      _scene.add(cMesh);
    }

    /* --- Decal pool --- */
    _decals.length = 0;
    _decalGeo = new THREE.CircleGeometry(1, 12);
    _decalGeo.rotateX(-Math.PI / 2);
    for (var i = 0; i < DECAL_COUNT; i++) {
      var dMat = new THREE.MeshBasicMaterial({
        color: 0xcc0a00,
        depthWrite: false,
        transparent: true,
        opacity: 0,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4
      });
      var dMesh = new THREE.Mesh(_decalGeo, dMat);
      dMesh.renderOrder = 3;
      dMesh.visible  = false;
      dMesh.userData = { active: false, birthTime: 0 };
      _decals.push(dMesh);
      _scene.add(dMesh);
    }

    /* --- Stream pool --- */
    _streams.length = 0;
    for (var i = 0; i < STREAM_COUNT; i++) {
      _streams.push({
        active: false, enemyId: null,
        ox: 0, oy: 0, oz: 0,
        dirX: 0, dirY: 1, dirZ: 0,
        color: 0xcc0a00,
        life: 0, pumpTimer: 0
      });
    }

    _activeDropCount = 0;
    _activeMistCount = 0;
    _colorDirty      = false;
    _goreMap.clear();
    _goreList.length = 0;
  }

  /* ==========================================================
   *  17. hit() — full hit processing
   * ========================================================== */
  function hit(enemy, weaponKey, hitPoint, hitNormal) {
    if (!_scene) return null;

    var wp   = WEAPON_PROFILES[weaponKey] || WEAPON_PROFILES.pistol;
    var gore = _getEnemyGore(enemy);
    var bc   = _bloodColors(enemy);

    /* --- Determine organ --- */
    var ePos    = enemy.position || enemy;
    var eHeight = _getEnemyHeight(enemy);
    var localY  = (hitPoint.y - (ePos.y || 0)) / (eHeight * 0.5);
    localY = Math.max(-1, Math.min(1, localY));
    var organ = _resolveOrgan(localY);

    /* --- Damage organ --- */
    gore.organs[organ].hp -= wp.organDmg;
    var organKilled = gore.organs[organ].hp <= 0;

    /* --- Hit normal direction --- */
    var nx = hitNormal ? (hitNormal.x || 0) : 0;
    var ny = hitNormal ? (hitNormal.y || 0) : 1;
    var nz = hitNormal ? (hitNormal.z || 0) : 0;
    var hx = hitPoint.x || 0, hy = hitPoint.y || 0, hz = hitPoint.z || 0;

    /* --- Blood drops --- */
    if (wp.cauterizes) {
      var smokeCount = wp.smokeCount || 8;
      _spawnMist(hx, hy, hz, smokeCount, 0.5, 2.0, 0x888888);
      if (wp.dropCount > 0) {
        _spawnDrops(hx, hy, hz, wp.dropCount, wp.dropSpeed[0], wp.dropSpeed[1],
          bc.base, nx, ny, nz);
      }
    } else if (wp.isSlash) {
      _spawnSlashDrops(hx, hy, hz, wp.dropCount, wp.dropSpeed[0], wp.dropSpeed[1],
        wp.freezesBlood ? 0xaaddff : bc.base, nx, ny, nz, wp.slashArc || 0.4);
      if (wp.mistCount > 0) {
        _spawnMist(hx, hy, hz, wp.mistCount, wp.mistSpeed[0], wp.mistSpeed[1], bc.mist);
      }
    } else if (wp.pellets) {
      var pelletAngle = (wp.pelletAngle || 30) * Math.PI / 180;
      var perPellet   = Math.ceil(wp.dropCount / wp.pellets);
      for (var p = 0; p < wp.pellets; p++) {
        var a1  = (Math.random() - 0.5) * pelletAngle;
        var a2  = (Math.random() - 0.5) * pelletAngle;
        var pdx = nx + Math.sin(a1) * 0.5;
        var pdy = ny + Math.sin(a2) * 0.5;
        var pdz = nz + Math.cos(a1) * 0.5;
        _spawnDrops(hx, hy, hz, perPellet,
          wp.dropSpeed[0] * 0.6, wp.dropSpeed[1] * 0.6,
          wp.freezesBlood ? 0xaaddff : bc.base, pdx, pdy, pdz);
      }
      if (wp.mistCount > 0) {
        _spawnMist(hx, hy, hz, wp.mistCount, wp.mistSpeed[0], wp.mistSpeed[1],
          wp.freezesBlood ? 0xcceeff : bc.mist);
      }
    } else {
      var bloodColor = wp.freezesBlood ? 0xaaddff : bc.base;
      if (wp.dropCount > 0) {
        _spawnDrops(hx, hy, hz, wp.dropCount, wp.dropSpeed[0], wp.dropSpeed[1],
          bloodColor, nx, ny, nz);
      }
      if (wp.mistCount > 0) {
        _spawnMist(hx, hy, hz, wp.mistCount, wp.mistSpeed[0], wp.mistSpeed[1],
          wp.freezesBlood ? 0xcceeff : bc.mist);
      }
    }

    /* --- Exit wound --- */
    if (wp.exitWound) {
      var exitScale = wp.exitScale || 1.5;
      var exitCount = Math.ceil(wp.dropCount * exitScale * 0.5);
      _spawnDrops(hx - nx * 0.3, hy - ny * 0.3, hz - nz * 0.3,
        exitCount, wp.dropSpeed[0] * 0.8, wp.dropSpeed[1] * 1.2,
        bc.dark, -nx, -ny * 0.5 + 0.5, -nz);
    }

    /* --- Explosive radial burst --- */
    if (wp.isExplosive) {
      for (var e = 0; e < 8; e++) {
        var theta = Math.random() * Math.PI * 2;
        var phi   = Math.random() * Math.PI;
        _spawnDrops(hx, hy, hz, Math.ceil(wp.dropCount / 8),
          wp.dropSpeed[0], wp.dropSpeed[1], bc.base,
          Math.sin(phi) * Math.cos(theta),
          Math.sin(phi) * Math.sin(theta),
          Math.cos(phi));
      }
    }

    /* --- Supersonic cavity (sniper) --- */
    if (wp.supersonicCavity) {
      _spawnDrops(hx, hy, hz, Math.ceil(wp.dropCount * 0.5),
        wp.dropSpeed[0] * 1.5, wp.dropSpeed[1] * 1.5,
        bc.dark, -nx, ny + 1, -nz);
      _spawnMist(hx, hy, hz, Math.ceil(wp.mistCount * 0.5),
        wp.mistSpeed[0] * 1.5, wp.mistSpeed[1] * 1.5, bc.mist);
    }

    /* --- Shockwave ring (revolver) --- */
    if (wp.shockwave) {
      for (var s = 0; s < 8; s++) {
        var sa = s * Math.PI * 2 / 8;
        _spawnDrops(hx, hy, hz, 2, 3.0, 6.0, bc.base,
          Math.cos(sa), 0.3, Math.sin(sa));
      }
    }

    /* --- Heart pump stream --- */
    if (wp.pumpOnHeart && organ === 'heart' && !organKilled) {
      _spawnStream(hx, hy, hz, nx, ny + 0.5, nz, bc.base, 5.0, gore.id);
    }

    /* --- Takedown slow bleed --- */
    if (wp.isTakedown) {
      _spawnStream(hx, hy, hz, 0, -1, 0, bc.dark, 3.0, gore.id);
    }

    /* --- Chunks --- */
    if (wp.chunkChance > 0 && Math.random() < wp.chunkChance) {
      var cc = _randInt(wp.chunkCount[0], wp.chunkCount[1]);
      if (cc > 0) {
        _spawnChunks(hx, hy, hz, cc, bc.organ, wp.pushForce);
      }
    }

    /* --- Electric / Char effects --- */
    if (wp.electricEffect) {
      _spawnMist(hx, hy, hz, 6, 1.0, 3.0, 0xaaccff);
    }
    if (wp.charEffect) {
      _spawnMist(hx, hy, hz, 4, 0.5, 2.0, 0x333333);
    }

    /* --- Create wound entry --- */
    if (gore.wounds.length >= WOUND_PER_ENEMY) {
      gore.wounds.shift();
    }
    gore.wounds.push({
      ox: hx, oy: hy, oz: hz,
      radius: wp.woundR,
      bleedRate: ANATOMY[organ].bleedRate,
      life: _rand(3.0, 8.0),
      dripTimer: DRIP_RATE,
      color: bc.dark
    });

    return { organ: organ, organKilled: organKilled };
  }

  /* ==========================================================
   *  18. kill() — full kill processing
   * ========================================================== */
  function kill(enemy, weaponKey) {
    if (!_scene) return;

    var wp = WEAPON_PROFILES[weaponKey] || WEAPON_PROFILES.pistol;
    var bc = _bloodColors(enemy);
    var ePos = enemy.position || enemy;
    var ex = ePos.x || 0, ey = ePos.y || 0, ez = ePos.z || 0;

    /* --- Burst multiplier by killStyle --- */
    var burstMul;
    switch (wp.killStyle) {
      case 'explosion':    burstMul = 4.0;  break;
      case 'vaporize':     burstMul = 6.0;  break;
      case 'devastation':  burstMul = 3.0;  break;
      case 'supersonic':   burstMul = 2.5;  break;
      case 'saturation':   burstMul = 2.0;  break;
      case 'cauterize':    burstMul = 0.2;  break;
      case 'combust':      burstMul = 0.1;  break;
      case 'execution':    burstMul = 1.5;  break;
      case 'melt':         burstMul = 2.2;  break;
      case 'shatter':      burstMul = 1.8;  break;
      case 'electrocute':  burstMul = 1.6;  break;
      case 'sever':        burstMul = 2.5;  break;
      case 'cleave':       burstMul = 2.8;  break;
      case 'slash':        burstMul = 1.8;  break;
      default:             burstMul = 2.0;  break;
    }

    var dropBurst = Math.ceil(wp.dropCount * burstMul);
    var mistBurst = Math.ceil(wp.mistCount * burstMul);

    /* --- Omnidirectional burst --- */
    for (var b = 0; b < 6; b++) {
      var theta = Math.random() * Math.PI * 2;
      var phi   = Math.random() * Math.PI;
      var bdx   = Math.sin(phi) * Math.cos(theta);
      var bdy   = Math.sin(phi) * Math.sin(theta);
      var bdz   = Math.cos(phi);
      _spawnDrops(ex + bdx * 0.2, ey + 1 + bdy * 0.2, ez + bdz * 0.2,
        Math.ceil(dropBurst / 6),
        wp.dropSpeed[0] * 0.8, wp.dropSpeed[1] * 1.5,
        bc.base, bdx, bdy, bdz);
    }

    if (mistBurst > 0) {
      _spawnMist(ex, ey + 1, ez, mistBurst,
        wp.mistSpeed[0], wp.mistSpeed[1] * 1.5, bc.mist);
    }

    /* --- Chunks --- */
    var chunkCount = _randInt(wp.chunkCount[0], wp.chunkCount[1]);
    chunkCount = Math.ceil(chunkCount * burstMul * 0.5);
    if (chunkCount > 0) {
      _spawnChunks(ex, ey + 0.5, ez,
        Math.min(chunkCount, CHUNK_COUNT), bc.organ, wp.pushForce * 1.5);
    }

    /* --- Decals around corpse --- */
    var decalN = Math.min(8, Math.ceil(burstMul * 3));
    for (var d = 0; d < decalN; d++) {
      var da   = Math.random() * Math.PI * 2;
      var dist = Math.random() * 1.5;
      _spawnDecal(ex + Math.cos(da) * dist, ez + Math.sin(da) * dist,
        _rand(0.15, 0.45), bc.dark);
    }

    /* --- Stop all streams for this enemy --- */
    var goreId = enemy.uuid || enemy.id || enemy.__goreId;
    for (var i = 0; i < STREAM_COUNT; i++) {
      if (_streams[i].active && _streams[i].enemyId === goreId) {
        _streams[i].active = false;
      }
    }

    /* --- Clean up gore state --- */
    if (goreId && _goreMap.has(goreId)) {
      _goreMap.delete(goreId);
      for (var i = _goreList.length - 1; i >= 0; i--) {
        if (_goreList[i].id === goreId) {
          _goreList.splice(i, 1);
          break;
        }
      }
    }
  }

  /* ==========================================================
   *  19. update(dt) — tick every particle system
   * ========================================================== */
  function update(dt) {
    if (!_scene || !_dropIM || !_mistIM) return;
    _elapsed += dt;

    var dropDirty = false;
    var mistDirty = false;

    /* --------------------------------------------------------
     *  19a. UPDATE DROPS (physics, life, removal)
     * -------------------------------------------------------- */
    var i = _activeDropCount - 1;
    while (i >= 0) {
      var d = _drops[i];
      d.life -= dt;

      /* --- Remove dead --- */
      if (d.life <= 0) {
        _activeDropCount--;
        if (i < _activeDropCount) {
          var tmp = _drops[i];
          _drops[i]                = _drops[_activeDropCount];
          _drops[_activeDropCount] = tmp;
          _colorDirty = true;
          // don't decrement i — process swapped-in drop
          dropDirty = true;
          continue;
        }
        dropDirty = true;
        i--;
        continue;
      }

      /* --- Physics for non-settled drops --- */
      if (!d.settled) {
        d.vy += GRAVITY * dt;

        var speed2 = d.vx * d.vx + d.vy * d.vy + d.vz * d.vz;
        var drag   = 1.0 - BLOOD_VISCOSITY * dt * Math.sqrt(speed2) * 0.5;
        if (drag < 0) drag = 0;
        if (drag > 1) drag = 1;
        d.vx *= drag; d.vy *= drag; d.vz *= drag;

        d.px += d.vx * dt;
        d.py += d.vy * dt;
        d.pz += d.vz * dt;

        /* --- Ground collision --- */
        if (d.py <= GROUND_Y) {
          if (d.bounces < d.maxBounces) {
            d.vy  = Math.abs(d.vy) * BOUNCE_ENERGY;
            d.vx *= BOUNCE_LATERAL;
            d.vz *= BOUNCE_LATERAL;
            d.py  = GROUND_Y;
            d.bounces++;
            if (d.bounces === 1 && Math.random() < BOUNCE_DECAL_PROB) {
              _spawnDecal(d.px, d.pz, _rand(0.06, 0.15), d.color);
            }
          } else {
            d.py = GROUND_Y;
            d.vy = 0; d.vx = 0; d.vz = 0;
            d.settled = true;
            _spawnDecal(d.px, d.pz, _rand(0.04, 0.12), d.color);
          }
        }
        dropDirty = true;
      }

      /* --- Build instance matrix --- */
      var speed2m = d.vx * d.vx + d.vy * d.vy + d.vz * d.vz;
      var speed   = Math.sqrt(speed2m);
      var r       = d.radius;

      if (speed > STRETCH_THRESHOLD) {
        var stretchAmt = 1.0 + (speed - STRETCH_THRESHOLD) * STRETCH_FACTOR;
        var invS = speed > 0.001 ? 1.0 / speed : 1.0;
        _s2.set(d.vx * invS, d.vy * invS, d.vz * invS);
        _s3.set(0, 1, 0);
        _quat.setFromUnitVectors(_s3, _s2);
        _s0.set(d.px, d.py, d.pz);
        var invStretch = 1.0 / Math.sqrt(stretchAmt);
        _s1.set(r * invStretch, r * stretchAmt, r * invStretch);
        _mat4.compose(_s0, _quat, _s1);
      } else {
        _s0.set(d.px, d.py, d.pz);
        _s1.set(r, r, r);
        _mat4.compose(_s0, _identityQuat, _s1);
      }
      _dropIM.setMatrixAt(i, _mat4);
      _dropIM.setColorAt(i, d.color);

      i--;
    }

    /* --------------------------------------------------------
     *  19b. UPDATE MIST (physics, life, removal)
     * -------------------------------------------------------- */
    var mi = _activeMistCount - 1;
    while (mi >= 0) {
      var m = _mists[mi];
      m.life -= dt;

      if (m.life <= 0) {
        _activeMistCount--;
        if (mi < _activeMistCount) {
          var tmp2 = _mists[mi];
          _mists[mi]                = _mists[_activeMistCount];
          _mists[_activeMistCount]  = tmp2;
          _colorDirty = true;
          mistDirty = true;
          continue;
        }
        mistDirty = true;
        mi--;
        continue;
      }

      /* Mist physics — MIST_VISCOSITY, no bouncing */
      m.vy += GRAVITY * dt;
      var ms2  = m.vx * m.vx + m.vy * m.vy + m.vz * m.vz;
      var mDrg = 1.0 - MIST_VISCOSITY * dt * Math.sqrt(ms2) * 0.5;
      if (mDrg < 0) mDrg = 0;
      if (mDrg > 1) mDrg = 1;
      m.vx *= mDrg; m.vy *= mDrg; m.vz *= mDrg;
      m.px += m.vx * dt;
      m.py += m.vy * dt;
      m.pz += m.vz * dt;
      if (m.py < GROUND_Y) m.py = GROUND_Y;

      /* Scale decreases as life → 0 */
      var lifeRatio = Math.max(0, m.life / m.maxLife);
      var ms = m.radius * lifeRatio;
      _s0.set(m.px, m.py, m.pz);
      _s1.set(ms, ms, ms);
      _mat4.compose(_s0, _identityQuat, _s1);
      _mistIM.setMatrixAt(mi, _mat4);
      _mistIM.setColorAt(mi, m.color);
      mistDirty = true;

      mi--;
    }

    /* --------------------------------------------------------
     *  19c. UPDATE CHUNKS
     * -------------------------------------------------------- */
    for (var ci = 0; ci < CHUNK_COUNT; ci++) {
      var c  = _chunks[ci];
      var ud = c.userData;
      if (!ud.active) continue;

      ud.vy += GRAVITY * dt;
      c.position.x += ud.vx * dt;
      c.position.y += ud.vy * dt;
      c.position.z += ud.vz * dt;
      c.rotation.x += ud.spinX * dt;
      c.rotation.y += ud.spinY * dt;
      c.rotation.z += ud.spinZ * dt;

      if (c.position.y <= GROUND_Y) {
        c.position.y = GROUND_Y;
        if (ud.bounces < 2) {
          ud.vy  = Math.abs(ud.vy) * 0.3;
          ud.vx *= 0.5; ud.vz *= 0.5;
          ud.bounces++;
        } else {
          ud.vy = 0; ud.vx = 0; ud.vz = 0;
          ud.spinX *= 0.1; ud.spinY *= 0.1; ud.spinZ *= 0.1;
        }
      }

      ud.life -= dt;
      if (ud.life <= 0) {
        c.visible  = false;
        ud.active  = false;
      }
    }

    /* --------------------------------------------------------
     *  19d. UPDATE STREAMS (arterial pump)
     * -------------------------------------------------------- */
    for (var si = 0; si < STREAM_COUNT; si++) {
      var st = _streams[si];
      if (!st.active) continue;

      st.life -= dt;
      if (st.life <= 0) { st.active = false; continue; }

      st.pumpTimer -= dt;
      if (st.pumpTimer <= 0) {
        st.pumpTimer = PUMP_RATE;
        _spawnDrops(st.ox, st.oy, st.oz, 3, 2.0, 5.0, st.color,
          st.dirX, st.dirY, st.dirZ);
        _spawnMist(st.ox, st.oy, st.oz, 1, 0.5, 1.5, st.color);
      }
    }

    /* --------------------------------------------------------
     *  19e. UPDATE WOUNDS (drip)
     * -------------------------------------------------------- */
    for (var gi = _goreList.length - 1; gi >= 0; gi--) {
      var gore = _goreList[gi];
      for (var wi = gore.wounds.length - 1; wi >= 0; wi--) {
        var w = gore.wounds[wi];
        w.life -= dt;
        if (w.life <= 0) {
          gore.wounds.splice(wi, 1);
          continue;
        }
        w.dripTimer -= dt;
        if (w.dripTimer <= 0) {
          w.dripTimer = DRIP_RATE / w.bleedRate;
          _spawnDrops(w.ox, w.oy, w.oz, 1, 0.1, 0.5, w.color, 0, -1, 0);
        }
      }
    }

    /* --------------------------------------------------------
     *  19f. UPDATE DECALS (fade)
     * -------------------------------------------------------- */
    for (var di = 0; di < DECAL_COUNT; di++) {
      var dm = _decals[di];
      if (!dm.userData.active) continue;
      var age = _elapsed - dm.userData.birthTime;
      if (age >= DECAL_FADE) {
        dm.visible = false;
        dm.userData.active = false;
        continue;
      }
      dm.material.opacity = 0.85 * (1.0 - age / DECAL_FADE);
    }

    /* --------------------------------------------------------
     *  19g. SET IM COUNTS & DIRTY FLAGS
     * -------------------------------------------------------- */
    _dropIM.count = _activeDropCount;
    _mistIM.count = _activeMistCount;

    if (dropDirty && _activeDropCount > 0) {
      _dropIM.instanceMatrix.needsUpdate = true;
    }
    if (mistDirty && _activeMistCount > 0) {
      _mistIM.instanceMatrix.needsUpdate = true;
    }
    if (_colorDirty) {
      if (_activeDropCount > 0) _dropIM.instanceColor.needsUpdate = true;
      if (_activeMistCount > 0) _mistIM.instanceColor.needsUpdate = true;
      _colorDirty = false;
    }
  }

  /* ==========================================================
   *  20. reset() — clear everything
   * ========================================================== */
  function reset() {
    _activeDropCount = 0;
    _activeMistCount = 0;
    _colorDirty      = false;
    _elapsed         = 0;

    for (var i = 0; i < DROP_COUNT; i++) {
      _drops[i].life    = 0;
      _drops[i].settled = false;
    }
    for (var i = 0; i < MIST_COUNT; i++) {
      _mists[i].life = 0;
    }
    for (var i = 0; i < CHUNK_COUNT; i++) {
      _chunks[i].visible        = false;
      _chunks[i].userData.active = false;
    }
    for (var i = 0; i < DECAL_COUNT; i++) {
      _decals[i].visible        = false;
      _decals[i].userData.active = false;
    }
    for (var i = 0; i < STREAM_COUNT; i++) {
      _streams[i].active = false;
    }

    _goreMap.clear();
    _goreList.length = 0;

    if (_dropIM) {
      _dropIM.count = 0;
      _dropIM.instanceMatrix.needsUpdate = true;
    }
    if (_mistIM) {
      _mistIM.count = 0;
      _mistIM.instanceMatrix.needsUpdate = true;
    }
  }

  /* ==========================================================
   *  21. rawBurst / rawBurstUpward — direct particle emit
   * ========================================================== */
  function rawBurst(ox, oy, oz, count, opts) {
    if (!_scene) return;
    opts = opts || {};
    var color  = opts.color    || 0xcc0a00;
    var spdMin = opts.speedMin || 3.0;
    var spdMax = opts.speedMax || 10.0;
    var dirX   = opts.dirX     || 0;
    var dirY   = opts.dirY     || 0;
    var dirZ   = opts.dirZ     || 0;

    if (dirX === 0 && dirY === 0 && dirZ === 0) {
      /* Omnidirectional */
      for (var i = 0; i < count; i++) {
        var slot = _findDropSlot();
        var d    = _drops[slot];
        d.px = ox; d.py = oy; d.pz = oz;

        var theta = Math.random() * Math.PI * 2;
        var phi   = Math.random() * Math.PI;
        var spd   = _rand(spdMin, spdMax);
        d.vx = Math.sin(phi) * Math.cos(theta) * spd;
        d.vy = Math.sin(phi) * Math.sin(theta) * spd;
        d.vz = Math.cos(phi) * spd;

        d.life      = _rand(0.6, 2.5);
        d.maxLife   = d.life;
        d.bounces   = 0;
        d.maxBounces = 2;
        d.settled   = false;
        d.radius    = _rand(0.012, 0.04);
        d.color.set(color);
        _colorDirty = true;
      }
    } else {
      _spawnDrops(ox, oy, oz, count, spdMin, spdMax, color, dirX, dirY, dirZ);
    }
  }

  function rawBurstUpward(ox, oy, oz, count, opts) {
    if (!_scene) return;
    opts = opts || {};
    var color  = opts.color    || 0xcc0a00;
    var spdMin = opts.speedMin || 3.0;
    var spdMax = opts.speedMax || 10.0;
    _spawnDrops(ox, oy, oz, count, spdMin, spdMax, color, 0, 1, 0);
  }

  /* ==========================================================
   *  22. EXPORT — expose BloodV2
   * ========================================================== */
  global.BloodV2 = {
    ENEMY_BLOOD:     ENEMY_BLOOD,
    WEAPON_PROFILES: WEAPON_PROFILES,
    init:            init,
    hit:             hit,
    kill:            kill,
    update:          update,
    reset:           reset,
    rawBurst:        rawBurst,
    rawBurstUpward:  rawBurstUpward
  };

})(window);
