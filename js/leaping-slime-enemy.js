/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║   LEAPING SLIME ENEMY — Ljusblå (Light-Blue) Variant               ║
 * ║   Water Drop Survivor — Sandbox 2.0                                 ║
 * ║   File: js/leaping-slime-enemy.js                                   ║
 * ║                                                                      ║
 * ║   WHAT THIS FILE CONTAINS:                                          ║
 * ║   • LeapingSlimeEnemy class — Three.js mesh, jump physics, AI      ║
 * ║   • LeapingSlimePool — object pool, ZERO garbage collection        ║
 * ║   • 4-state machine: IDLE → PREPARING_JUMP → JUMPING → LANDING    ║
 * ║   • Hyper-responsive squish/stretch physics based on velocity      ║
 * ║   • Slit-pupil eyes (reptilian) & mouth that opens mid-air         ║
 * ║   • 25% smaller than the green slime (baseSize = 0.75)            ║
 * ║   • Full BloodV2 + GoreSim damage integration                      ║
 * ║   • Level scaling: higher waves = faster jumps, more HP            ║
 * ║                                                                      ║
 * ║   HOW TO ADD TO YOUR GAME:                                          ║
 * ║   1. In sandbox.html, add AFTER crawler-enemy.js:                  ║
 * ║      <script src="js/leaping-slime-enemy.js"></script>             ║
 * ║                                                                      ║
 * ║   2. In init():                                                     ║
 * ║      window.LeapingSlimePool.init(scene, 20);                      ║
 * ║                                                                      ║
 * ║   3. To spawn:                                                      ║
 * ║      window.LeapingSlimePool.spawn(x, z, waveLevel);              ║
 * ║                                                                      ║
 * ║   4. In animate():                                                  ║
 * ║      window.LeapingSlimePool.update(dt, playerPosition);          ║
 * ║                                                                      ║
 * ║   5. On hit:                                                        ║
 * ║      window.LeapingSlimePool.hit(enemy, weaponKey, weaponLevel,   ║
 * ║                                   hitPoint, hitNormal, bulletDir); ║
 * ║                                                                      ║
 * ║   6. On reset:                                                      ║
 * ║      window.LeapingSlimePool.reset();                              ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

;(function(global) {
'use strict';

// ════════════════════════════════════════════════
//  LEAPING SLIME CONFIGURATION
// ════════════════════════════════════════════════
var LEAP_CFG = {
  BASE_HP:          40,
  BASE_SIZE:        0.525,       // 25% smaller than green slime (0.7 * 0.75)
  SCALE_VARIANCE:   0.06,        // slight size variation between instances
  BASE_DAMAGE:      15,          // contact damage per hit
  ATTACK_RANGE:     0.9,         // contact radius
  ATTACK_COOLDOWN:  500,         // ms between contact damage ticks

  // Jump physics (reduced by 25% for shorter, lower jumps)
  GRAVITY:          -25.0,       // strong gravity for snappy, heavy landings
  JUMP_FORCE:       9.0,         // upward velocity on launch (was 12.0)
  LEAP_FORCE:       6.0,         // forward velocity on launch (was 8.0)

  // State timings (seconds)
  IDLE_TIME_MIN:    0.5,
  IDLE_TIME_MAX:    1.0,
  CHARGE_TIME:      0.5,         // how long PREPARING_JUMP squish lasts
  LANDING_TIME:     0.2,         // how long LANDING squish lasts

  // Visual
  COLOR_HEALTHY:    0x00bfff,    // DeepSkyBlue / Ljusblå
  COLOR_HURT:       0x0090cc,
  COLOR_CRITICAL:   0x005f99,
  EMISSIVE_IDLE:    0x002233,
  EMISSIVE_JUMP:    0x003344,
};

// Weapon damage profiles (mirror green slime for consistency)
var LEAP_WEAPON_HIT = {
  pistol:         { dmg: 12,   push: 0.30 },
  revolver:       { dmg: 26,   push: 0.70 },
  shotgun:        { dmg: 44,   push: 3.50 },
  smg:            { dmg: 9,    push: 0.20 },
  sniper:         { dmg: 70,   push: 2.00 },
  minigun:        { dmg: 7,    push: 0.18 },
  grenade:        { dmg: 144,  push: 20.0 },
  rocket:         { dmg: 9999, push: 50.0 },
  laser:          { dmg: 32,   push: 0.05 },
  plasma:         { dmg: 46,   push: 2.50 },
  knife:          { dmg: 22,   push: 0.08 },
  sword:          { dmg: 41,   push: 0.90 },
  axe:            { dmg: 54,   push: 2.20 },
  flame:          { dmg: 14,   push: 0.40 },
  ice:            { dmg: 22,   push: 0.35 },
  lightning:      { dmg: 30,   push: 4.00 },
  knife_takedown: { dmg: 96,   push: 0.02 },
  meteor:         { dmg: 9999, push: 80.0 },
  gun:            { dmg: 15,   push: 0.30 }, // fallback for generic 'gun'
};

// Reusable scratch vectors — no new THREE.Vector3() during gameplay
var _v0 = new THREE.Vector3();
var _v1 = new THREE.Vector3();

// ════════════════════════════════════════════════
//  LEAPING SLIME INSTANCE
// ════════════════════════════════════════════════
function LeapingSlimeEnemy() {
  this.alive           = false;
  this.active          = false;
  this.enemyType       = 'leaping_slime';
  this.type            = 'leaping_slime';
  this.isBoss          = false;
  this.radius          = LEAP_CFG.BASE_SIZE;

  // Stats
  this.hp              = 0;
  this.maxHp           = 0;
  this.level           = 1;
  this.size            = LEAP_CFG.BASE_SIZE;

  // Physics
  this.vx              = 0;
  this.vy              = 0;
  this.vz              = 0;
  this.velocity        = new THREE.Vector3(); // BloodV2 integration

  // State machine
  this.state           = 'IDLE';  // IDLE | PREPARING_JUMP | JUMPING | LANDING
  this.stateTimer      = 0;

  // Death
  this.dying           = false;
  this.dead            = false;
  this.deathTimer      = 0;
  this.killedBy        = null;

  // Visual feedback
  this.flashTimer      = 0;
  this.lastDamageTime  = 0;

  // Idle bob animation
  this._bobPhase       = Math.random() * Math.PI * 2;

  // Death slide velocity
  this._deathSlideVX   = 0;
  this._deathSlideVZ   = 0;

  // Three.js objects (built once in pool, reused every spawn)
  this.mesh            = null;   // THREE.Group — root container
  this.body            = null;   // body mesh
  this.leftEye         = null;
  this.rightEye        = null;
  this.mouth           = null;
  this.mouthInterior   = null;   // red interior of mouth
  this.shadowMesh      = null;

  // isDead getter/setter for player auto-aim compatibility
  Object.defineProperty(this, 'isDead', {
    get: function() { return this.dead; },
    set: function(v) { this.dead = v; },
  });
}

// ─── Activate from pool ───────────────────────────────────────────────────────
LeapingSlimeEnemy.prototype.spawn = function(x, z, waveLevel) {
  this.alive        = true;
  this.active       = true;
  this.dead         = false;
  this.dying        = false;
  this.level        = waveLevel || 1;
  this.flashTimer   = 0;
  this.deathTimer   = 0;
  this.killedBy     = null;

  // Scale HP & speed with wave level
  var lvlMult = 1.0 + (this.level - 1) * 0.18;
  this.maxHp  = Math.floor(LEAP_CFG.BASE_HP * lvlMult);
  this.hp     = this.maxHp;

  // Slight random size variation
  this.size   = LEAP_CFG.BASE_SIZE * (1.0 + (Math.random() - 0.5) * LEAP_CFG.SCALE_VARIANCE);
  this.radius = this.size;

  // Physics reset
  this.vx = 0;
  this.vy = 0;
  this.vz = 0;
  this.velocity.set(0, 0, 0);

  // Start in IDLE, pick a random wait before first jump
  this.state      = 'IDLE';
  this.stateTimer = LEAP_CFG.IDLE_TIME_MIN + Math.random() * (LEAP_CFG.IDLE_TIME_MAX - LEAP_CFG.IDLE_TIME_MIN);

  // Reset per-spawn properties
  this._bobPhase     = Math.random() * Math.PI * 2;
  this._deathSlideVX = 0;
  this._deathSlideVZ = 0;
  this._bulletHoleIndex = 0;
  if (this._bulletHoles && this._bulletHoles.length) {
    for (var bh = 0; bh < this._bulletHoles.length; bh++) {
      if (this._bulletHoles[bh]) {
        this._bulletHoles[bh].visible = false;
        this._bulletHoles[bh].position.set(0, -10, 0);
      }
    }
  }

  // Place mesh
  this.mesh.position.set(x, 0, z);
  this.mesh.rotation.y = Math.random() * Math.PI * 2;
  this.mesh.scale.set(1, 1, 1); // ensure scale is reset (may be near-zero from death animation)
  this.mesh.visible   = true;

  // Reset body scale to neutral
  this.body.scale.set(this.size, this.size, this.size);
  this.body.position.y = this.size;

  // Reset mouth to closed
  this.mouth.scale.set(this.size, this.size * 0.05, this.size);
  if (this.mouthInterior) this.mouthInterior.scale.set(this.size, this.size * 0.05, this.size);

  // Update material colour
  this.body.material.color.setHex(LEAP_CFG.COLOR_HEALTHY);
  this.body.material.emissive.setHex(LEAP_CFG.EMISSIVE_IDLE);

  if (this.shadowMesh) {
    this.shadowMesh.visible = true;
    this.shadowMesh.position.set(x, 0.01, z);
  }
};

// ─── Main update — called every frame ─────────────────────────────────────────
LeapingSlimeEnemy.prototype.update = function(dt, playerPos) {
  if (!this.alive || !this.mesh) return;

  // Death animation: shrink & fade out
  if (this.dying) {
    this._updateDeath(dt);
    return;
  }

  // Flash feedback on hit
  if (this.flashTimer > 0) {
    this.flashTimer -= dt;
    if (this.flashTimer <= 0) {
      this.body.material.emissive.setHex(LEAP_CFG.EMISSIVE_IDLE);
    }
  }

  // Always face the player (smooth rotation)
  if (playerPos) {
    _v0.set(playerPos.x - this.mesh.position.x, 0, playerPos.z - this.mesh.position.z);
    if (_v0.lengthSq() > 0.01) {
      var targetY = Math.atan2(_v0.x, _v0.z);
      this.mesh.rotation.y += (targetY - this.mesh.rotation.y) * Math.min(10 * dt, 1.0);
    }
  }

  this.stateTimer -= dt;

  switch (this.state) {
    case 'IDLE':
      this._stateIdle(dt);
      break;
    case 'PREPARING_JUMP':
      this._statePreparing(dt, playerPos);
      break;
    case 'JUMPING':
      this._stateJumping(dt);
      break;
    case 'LANDING':
      this._stateLanding(dt);
      break;
  }

  // Keep shadow under body
  if (this.shadowMesh) {
    this.shadowMesh.position.x = this.mesh.position.x;
    this.shadowMesh.position.z = this.mesh.position.z;
    // Scale shadow based on height (smaller when high up)
    var heightAboveGround = Math.max(0, this.mesh.position.y);
    var shadowScale = Math.max(0.3, 1.0 - heightAboveGround * 0.06);
    this.shadowMesh.scale.set(shadowScale, 1, shadowScale);
  }
};

// ─── IDLE: restore neutral scale, wait for charge timer ──────────────────────
LeapingSlimeEnemy.prototype._stateIdle = function(dt) {
  // Smoothly lerp body back to resting scale
  _v1.set(this.size, this.size, this.size);
  this.body.scale.lerp(_v1, Math.min(10 * dt, 1.0));

  // Gentle vertical bob
  this._bobPhase += dt * 2.5;
  this.body.position.y = this.size + Math.sin(this._bobPhase) * 0.06;

  // Smoothly close mouth
  _v1.set(this.size, this.size * 0.05, this.size);
  this.mouth.scale.lerp(_v1, Math.min(15 * dt, 1.0));
  if (this.mouthInterior) this.mouthInterior.scale.lerp(_v1, Math.min(15 * dt, 1.0));

  if (this.stateTimer <= 0) {
    this.state      = 'PREPARING_JUMP';
    this.stateTimer = LEAP_CFG.CHARGE_TIME;
  }
};

// ─── PREPARING_JUMP: squish down (charge energy), then launch ─────────────────
LeapingSlimeEnemy.prototype._statePreparing = function(dt, playerPos) {
  var chargeProgress = 1.0 - Math.max(0, this.stateTimer / LEAP_CFG.CHARGE_TIME);

  // Squash Y, stretch XZ — dopamine: sense of building energy
  var scaleY  = (1.0 - chargeProgress * 0.6) * this.size;
  var scaleXZ = (1.0 + chargeProgress * 0.4) * this.size;

  this.body.scale.set(scaleXZ, scaleY, scaleXZ);

  // Gentle bob continues into preparing state
  this._bobPhase += dt * 2.5;
  this.body.position.y = scaleY + Math.sin(this._bobPhase) * 0.04 * (1.0 - chargeProgress);

  // Slightly open mouth in anticipation
  this.mouth.scale.set(this.size, this.size * 0.5 * chargeProgress, this.size);
  if (this.mouthInterior) this.mouthInterior.scale.set(this.size, this.size * 0.5 * chargeProgress, this.size);

  if (this.stateTimer <= 0) {
    this._doJump(playerPos);
  }
};

// ─── JUMPING: apply gravity, hyper-squish based on velocity ──────────────────
LeapingSlimeEnemy.prototype._stateJumping = function(dt) {
  // Physics integration
  this.vy += LEAP_CFG.GRAVITY * dt;
  this.mesh.position.x += this.vx * dt;
  this.mesh.position.y += this.vy * dt;
  this.mesh.position.z += this.vz * dt;

  this.velocity.set(this.vx, this.vy, this.vz);

  // Stretch/squash proportional to vertical velocity
  var velStretch = Math.max(1.0, this.vy * 0.06);   // positive vel = upward
  var velSquash  = Math.max(0.5, 1.0 / velStretch);

  this.body.scale.set(
    this.size * 0.85 * velSquash,
    this.size * velStretch,
    this.size * 0.85 * velSquash
  );
  this.body.position.y = this.size * velStretch;

  // Mouth wide open mid-air: attack pose
  _v1.set(this.size * 1.4, this.size * 1.4, this.size * 1.4);
  this.mouth.scale.lerp(_v1, Math.min(15 * dt, 1.0));
  if (this.mouthInterior) this.mouthInterior.scale.lerp(_v1, Math.min(15 * dt, 1.0));

  // Ground collision
  if (this.mesh.position.y <= 0) {
    this.mesh.position.y = 0;
    this._land();
  }
};

// ─── LANDING: extreme squash reaction, brief pause ───────────────────────────
LeapingSlimeEnemy.prototype._stateLanding = function(dt) {
  // Violent splat squash
  _v1.set(this.size * 1.5, this.size * 0.45, this.size * 1.5);
  this.body.scale.lerp(_v1, Math.min(20 * dt, 1.0));
  this.body.position.y = this.size * 0.45;

  // Close mouth on impact
  _v1.set(this.size, this.size * 0.05, this.size);
  this.mouth.scale.lerp(_v1, Math.min(20 * dt, 1.0));
  if (this.mouthInterior) this.mouthInterior.scale.lerp(_v1, Math.min(20 * dt, 1.0));

  if (this.stateTimer <= 0) {
    this.state      = 'IDLE';
    this.stateTimer = LEAP_CFG.IDLE_TIME_MIN + Math.random() * (LEAP_CFG.IDLE_TIME_MAX - LEAP_CFG.IDLE_TIME_MIN);
  }
};

// ─── Execute the jump toward player ──────────────────────────────────────────
LeapingSlimeEnemy.prototype._doJump = function(playerPos) {
  this.state = 'JUMPING';

  var lvlMult = 1.0 + (this.level - 1) * 0.08; // faster leaps on higher waves

  this.vy = LEAP_CFG.JUMP_FORCE * lvlMult;

  if (playerPos) {
    _v0.set(
      playerPos.x - this.mesh.position.x,
      0,
      playerPos.z - this.mesh.position.z
    );
    if (_v0.lengthSq() > 0.0001) {
      _v0.normalize();
      this.vx = _v0.x * LEAP_CFG.LEAP_FORCE * lvlMult;
      this.vz = _v0.z * LEAP_CFG.LEAP_FORCE * lvlMult;
    }
  }

  this.body.material.emissive.setHex(LEAP_CFG.EMISSIVE_JUMP);
};

// ─── Land — trigger landing state ────────────────────────────────────────────
LeapingSlimeEnemy.prototype._land = function() {
  this.state      = 'LANDING';
  this.stateTimer = LEAP_CFG.LANDING_TIME;
  this.vx         = 0;
  this.vy         = 0;
  this.vz         = 0;
  this.velocity.set(0, 0, 0);
  this.body.material.emissive.setHex(LEAP_CFG.EMISSIVE_IDLE);
};

// ─── Take damage ──────────────────────────────────────────────────────────────
LeapingSlimeEnemy.prototype.receiveHit = function(weaponKey, weaponLevel, hitPoint, hitNormal, bulletDir) {
  if (!this.alive || this.dying) return null;

  var wh  = LEAP_WEAPON_HIT[weaponKey] || LEAP_WEAPON_HIT.gun;
  var lvlBonus = weaponLevel ? (1.0 + (weaponLevel - 1) * 0.15) : 1.0;
  var dmg = Math.round(wh.dmg * lvlBonus);

  this.hp -= dmg;

  // Flash white
  this.body.material.emissive.setHex(0xaaaaaa);
  this.flashTimer = 0.12;

  // Knockback while airborne (half to preserve arc shape)
  if (this.state === 'JUMPING' && bulletDir) {
    this.vx += bulletDir.x * wh.push * 0.5;
    this.vz += bulletDir.z * wh.push * 0.5;
  }

  // Colour shifts with damage
  var ratio = Math.max(0, this.hp / this.maxHp);
  if (ratio < 0.33) {
    this.body.material.color.setHex(LEAP_CFG.COLOR_CRITICAL);
  } else if (ratio < 0.66) {
    this.body.material.color.setHex(LEAP_CFG.COLOR_HURT);
  }

  // BloodV2 integration
  if (global.BloodV2 && typeof global.BloodV2.hit === 'function') {
    try { global.BloodV2.hit(this, weaponKey, hitPoint, hitNormal); } catch(e) {}
  }
  // GoreSim integration
  if (global.GoreSim && typeof global.GoreSim.onHit === 'function') {
    try { global.GoreSim.onHit(this, weaponKey, hitPoint, hitNormal); } catch(e) {}
  }

  if (this.hp <= 0) {
    this._die(weaponKey, hitPoint);
    return { damage: dmg, killed: true };
  }

  return { damage: dmg, killed: false };
};

// ─── Begin death animation ─────────────────────────────────────────────────
LeapingSlimeEnemy.prototype._die = function(weaponKey, hitPoint) {
  if (this.dying) return;
  this.dying      = true;
  this.killedBy   = weaponKey || 'unknown';
  this.deathTimer = 0.55;

  // BloodV2 kill burst — sandbox-loop.js also calls rawBurst, but BloodV2.kill
  // triggers the internal blood-pooling logic (decals, mist) that rawBurst skips.
  if (global.BloodV2 && typeof global.BloodV2.kill === 'function') {
    try { global.BloodV2.kill(this, weaponKey, hitPoint); } catch(e) {}
  }
  // NOTE: GoreSim.onKill is intentionally NOT called here.
  // sandbox-loop.js _killLeapingSlime() is the single owner of GoreSim.onKill
  // to avoid duplicate calls when receiveHit triggers _die before _killLeapingSlime runs.
};

// ─── Death animation update ────────────────────────────────────────────────
LeapingSlimeEnemy.prototype._updateDeath = function(dt) {
  // Death slide: apply kill velocity for first 0.3 seconds with friction
  var elapsed = 0.55 - this.deathTimer;
  if (elapsed < 0.3 && (this._deathSlideVX || this._deathSlideVZ)) {
    this.mesh.position.x += this._deathSlideVX * dt;
    this.mesh.position.z += this._deathSlideVZ * dt;
    // dt-scaled exponential decay: 0.85 per frame at 60 FPS
    var decay = Math.pow(0.85, dt * 60);
    this._deathSlideVX *= decay;
    this._deathSlideVZ *= decay;
  }

  this.deathTimer -= dt;

  // Shrink and fade out
  var progress = 1.0 - Math.max(0, this.deathTimer / 0.55);
  var scale    = (1.0 - progress) * this.size;
  if (scale < 0.001) scale = 0.001;
  this.mesh.scale.set(scale / this.size, scale / this.size, scale / this.size);
  this.body.material.opacity = Math.max(0, 1.0 - progress * 1.5);
  this.body.material.transparent = true;

  if (this.deathTimer <= 0) {
    this._cleanup();
  }
};

// ─── Return to pool ────────────────────────────────────────────────────────
LeapingSlimeEnemy.prototype._cleanup = function() {
  this.alive  = false;
  this.active = false;
  this.dead   = true;
  this.dying  = false;
  this._deathSlideVX = 0;
  this._deathSlideVZ = 0;

  if (this.mesh) {
    this.mesh.visible = false;
    this.mesh.position.set(0, -100, 0); // park off-scene
    this.mesh.scale.set(1, 1, 1);
    this.mesh.rotation.y = 0;
  }
  if (this.body && this.body.material) {
    this.body.material.opacity = 0.92;
    this.body.material.transparent = false;
    this.body.material.emissive.setHex(LEAP_CFG.EMISSIVE_IDLE);
    this.body.material.color.setHex(LEAP_CFG.COLOR_HEALTHY);
  }
  if (this.shadowMesh) {
    this.shadowMesh.visible = false;
  }
};

// ════════════════════════════════════════════════
//  LEAPING SLIME POOL
//  Zero-GC object pool
// ════════════════════════════════════════════════
var LeapingSlimePool = {
  _scene:  null,
  _pool:   [],
  _count:  0,
  _ready:  false,

  init: function(scene, maxCount) {
    this._scene = scene;
    this._count = maxCount || 20;
    this._pool  = [];

    for (var i = 0; i < this._count; i++) {
      var e = this._buildMesh(scene, i);
      this._pool.push(e);
    }
    this._ready = true;
    console.log('[LeapingSlimePool] Ready. ' + this._count + ' leaping slimes pre-allocated.');
  },

  _buildMesh: function(scene, idx) {
    var e = new LeapingSlimeEnemy();

    // ── ROOT GROUP ────────────────────────────────────────────────────────
    var group = new THREE.Group();
    group.visible = false;
    group.position.set(0, -100, 0);
    scene.add(group);
    e.mesh = group;

    var s = LEAP_CFG.BASE_SIZE;

    // ── BODY ──────────────────────────────────────────────────────────────
    var bodyGeo = new THREE.SphereGeometry(1.0, 24, 20);
    // Flatten bottom for blob shape (mirrors green slime geometry)
    var pos = bodyGeo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i);
      var x = pos.getX(i);
      var z = pos.getZ(i);
      if (y < 0) { pos.setY(i, y * 0.60); pos.setX(i, x * 1.22); pos.setZ(i, z * 1.22); }
      else       { pos.setX(i, x * 1.04); pos.setZ(i, z * 1.04); }
    }
    pos.needsUpdate = true;
    bodyGeo.computeVertexNormals();

    var bodyMat = new THREE.MeshPhysicalMaterial({
      color:              LEAP_CFG.COLOR_HEALTHY,
      emissive:           LEAP_CFG.EMISSIVE_IDLE,
      emissiveIntensity:  0.25,
      metalness:          0.05,
      roughness:          0.08,
      clearcoat:          1.0,
      clearcoatRoughness: 0.06,
      transparent:        false,
      opacity:            0.92,
    });
    var body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow    = true;
    body.receiveShadow = false;
    body.frustumCulled = false; // prevent body vanishing at screen edges
    body.scale.set(s, s, s);
    body.position.y = s;
    group.add(body);
    e.body = body;

    // ── EYES (slit pupils — reptilian/predator) ───────────────────────────
    var eyeGeo   = new THREE.SphereGeometry(0.2, 12, 10);
    var eyeMat   = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });
    // Slit pupil: thin tall cylinder rotated to face front
    var pupilGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8);
    pupilGeo.rotateX(Math.PI / 2);
    var pupilMat = new THREE.MeshStandardMaterial({ color: 0x050505 });

    var leftEye  = new THREE.Mesh(eyeGeo, eyeMat.clone());
    leftEye.position.set(s * 0.45, s * 1.25, s * 0.72);
    var lPupil = new THREE.Mesh(pupilGeo, pupilMat.clone());
    lPupil.position.set(0, 0, s * 0.19);
    leftEye.add(lPupil);

    var rightEye = new THREE.Mesh(eyeGeo, eyeMat.clone());
    rightEye.position.set(-s * 0.45, s * 1.25, s * 0.72);
    var rPupil = new THREE.Mesh(pupilGeo, pupilMat.clone());
    rPupil.position.set(0, 0, s * 0.19);
    rightEye.add(rPupil);

    group.add(leftEye);
    group.add(rightEye);
    e.leftEye  = leftEye;
    e.rightEye = rightEye;

    // ── MOUTH (hidden at rest, opens mid-air) ─────────────────────────────
    // Outer dark lips/edge
    var mouthGeo = new THREE.SphereGeometry(0.32, 14, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    var mouthMat = new THREE.MeshStandardMaterial({
      color:       0x3d0000,
      side:        THREE.DoubleSide,
      roughness:   0.9,
    });
    var mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, s * 0.72, s * 0.88);
    mouth.rotation.x = Math.PI / 2;
    mouth.scale.set(s, s * 0.05, s); // closed (flat)
    group.add(mouth);
    e.mouth = mouth;

    // Red interior (gums/flesh) - slightly smaller hemisphere, bright red
    var mouthInteriorGeo = new THREE.SphereGeometry(0.28, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    var mouthInteriorMat = new THREE.MeshStandardMaterial({
      color:       0xff2222,  // bright red interior
      emissive:    0x550000,  // subtle glow
      side:        THREE.BackSide,  // render inside only
      roughness:   0.7,
    });
    var mouthInterior = new THREE.Mesh(mouthInteriorGeo, mouthInteriorMat);
    mouthInterior.position.set(0, s * 0.72, s * 0.88);
    mouthInterior.rotation.x = Math.PI / 2;
    mouthInterior.scale.set(s, s * 0.05, s); // closed (flat)
    group.add(mouthInterior);
    e.mouthInterior = mouthInterior;

    // ── GROUND SHADOW ─────────────────────────────────────────────────────
    var shadowGeo = new THREE.CircleGeometry(s * 0.95, 10);
    var shadowMat = new THREE.MeshBasicMaterial({
      color:      0x000000,
      transparent: true,
      opacity:    0.22,
      depthWrite: false,
    });
    var shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.01, 0);
    shadow.visible  = false;
    shadow.renderOrder = -1;
    scene.add(shadow);
    e.shadowMesh = shadow;

    e.id = 'leaping-slime-' + idx;

    return e;
  },

  // ── spawn ─────────────────────────────────────────────────────────────────
  spawn: function(x, z, waveLevel) {
    if (!this._ready) return null;
    var e = null;
    for (var i = 0; i < this._pool.length; i++) {
      if (!this._pool[i].active) { e = this._pool[i]; break; }
    }
    if (!e) {
      // Recycle the first slot if the pool is exhausted
      e = this._pool[0];
      e._cleanup(); // always cleanup before force-recycling
    }
    e.spawn(x, z, waveLevel);
    return e;
  },

  // ── update — called every frame ───────────────────────────────────────────
  update: function(dt, playerPos) {
    if (!this._ready) return;
    for (var i = 0; i < this._pool.length; i++) {
      if (this._pool[i].active) {
        this._pool[i].update(dt, playerPos);
      }
    }
  },

  // ── hit — delegate to instance ────────────────────────────────────────────
  hit: function(enemy, weaponKey, weaponLevel, hitPoint, hitNormal, bulletDir) {
    if (!enemy || !enemy.active) return null;
    return enemy.receiveHit(weaponKey, weaponLevel, hitPoint, hitNormal, bulletDir);
  },

  // ── return all alive, non-dying instances ─────────────────────────────────
  // Accepts an optional output array; otherwise fills and returns the internal
  // _aliveScratch array — no allocation per call.
  getAlive: function(outArray) {
    var result = outArray || this._aliveScratch || (this._aliveScratch = []);
    result.length = 0;
    var pool = this._pool;
    for (var i = 0; i < pool.length; i++) {
      var e = pool[i];
      if (e.alive && !e.dying) result.push(e);
    }
    return result;
  },

  // ── reset all instances (e.g. game over) ──────────────────────────────────
  reset: function() {
    for (var i = 0; i < this._pool.length; i++) {
      var e = this._pool[i];
      if (e.alive || e.dying) e._cleanup();
    }
    console.log('[LeapingSlimePool] Reset complete.');
  },
};

// ════════════════════════════════════════════════
//  EXPOSE GLOBALLY
// ════════════════════════════════════════════════
global.LeapingSlimePool  = LeapingSlimePool;
global.LeapingSlimeEnemy = LeapingSlimeEnemy;
global.LEAP_CFG          = LEAP_CFG;

console.log([
  '',
  '╔══════════════════════════════════════════════════════╗',
  '║  LeapingSlimeEnemy System v1.0 — LOADED             ║',
  '╠══════════════════════════════════════════════════════╣',
  '║  Light-blue (Ljusblå) 25%-smaller slime variant     ║',
  '║  4-state jump AI  |  Velocity-driven squish         ║',
  '║  Slit-pupil eyes  |  Mid-air open mouth             ║',
  '║  BloodV2 + GoreSim integration                      ║',
  '║  Level-scaling speed & HP                           ║',
  '╠══════════════════════════════════════════════════════╣',
  '║  init():  LeapingSlimePool.init(scene, 20);         ║',
  '║  spawn(): LeapingSlimePool.spawn(x, z, waveLevel);  ║',
  '║  loop():  LeapingSlimePool.update(dt, playerPos);   ║',
  '╚══════════════════════════════════════════════════════╝',
  '',
].join('\n'));

})(window);
