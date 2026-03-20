/**

- ╔══════════════════════════════════════════════════════════════════════╗
- ║   WAVE SPAWNER + HIT DETECTION — Water Drop Survivor Sandbox 2.0   ║
- ║   File: js/wave-system.js                                           ║
- ║                                                                      ║
- ║   WHAT THIS FILE CONTAINS:                                          ║
- ║   • WaveSpawner — escalating enemy waves with dramatic events       ║
- ║   • HitDetection — raycasting + projectile collision for all guns   ║
- ║   • ProjectileManager — pooled bullet/projectile objects            ║
- ║   • Full integration with SlimePool + BloodV2                       ║
- ║                                                                      ║
- ║   HOW TO ADD:                                                        ║
- ║   1. In sandbox.html, add AFTER slime-enemy-complete.js:            ║
- ║      <script src="js/wave-system.js"></script>                      ║
- ║                                                                      ║
- ║   2. In game-screens.js init():                                     ║
- ║      window.WaveSpawner.init(scene, spawnRadius);                   ║
- ║      window.HitDetection.init(scene);                               ║
- ║                                                                      ║
- ║   3. In game-loop.js animate():                                     ║
- ║      window.WaveSpawner.update(delta, playerPos);                   ║
- ║      window.HitDetection.update(delta, playerPos);                  ║
- ║                                                                      ║
- ║   4. When player fires:                                             ║
- ║      window.HitDetection.fireWeapon(                                ║
- ║        weaponKey, weaponLevel,                                      ║
- ║        origin,    // THREE.Vector3 — gun barrel world pos           ║
- ║        direction  // THREE.Vector3 — normalised aim direction       ║
- ║      );                                                              ║
- ║                                                                      ║
- ║   5. On reset:                                                       ║
- ║      window.WaveSpawner.reset();                                    ║
- ║      window.HitDetection.reset();                                   ║
- ╚══════════════════════════════════════════════════════════════════════╝
  */

;(function(global) {
‘use strict’;

// ════════════════════════════════════════════════════════════
//  SHARED SCRATCH — never allocate in loops
// ════════════════════════════════════════════════════════════
var _v0 = new THREE.Vector3();
var _v1 = new THREE.Vector3();
var _v2 = new THREE.Vector3();
var _ray = new THREE.Raycaster();

// ════════════════════════════════════════════════════════════
//  WAVE DEFINITIONS
//  Each wave has: count, enemyLevel, spawnDelay, spawnPattern,
//  announceText, specialEvent
//  spawnPattern: ‘circle’ | ‘sides’ | ‘random’ | ‘swarm’ | ‘pincer’
// ════════════════════════════════════════════════════════════
var WAVES = [
// Wave 1 — Tutorial. Single slow slime. Player learns controls.
{
waveNum:      1,
count:        1,
enemyLevel:   1,
spawnDelay:   0,
spawnPattern: ‘random’,
spawnRadius:  6,
announceText: ‘WAVE 1 — First contact’,
pauseBetween: 0,
specialEvent: null,
},
// Wave 2 — Three slimes from different sides
{
waveNum:      2,
count:        3,
enemyLevel:   1,
spawnDelay:   0.4,
spawnPattern: ‘circle’,
spawnRadius:  7,
announceText: ‘WAVE 2 — They multiply’,
pauseBetween: 0,
specialEvent: null,
},
// Wave 3 — Pincer attack from two sides
{
waveNum:      3,
count:        4,
enemyLevel:   1,
spawnDelay:   0.3,
spawnPattern: ‘pincer’,
spawnRadius:  7,
announceText: ‘WAVE 3 — PINCER ATTACK’,
pauseBetween: 0,
specialEvent: null,
},
// Wave 4 — First big guy (higher level slime)
{
waveNum:      4,
count:        3,
enemyLevel:   2,
spawnDelay:   0.5,
spawnPattern: ‘sides’,
spawnRadius:  8,
announceText: ‘WAVE 4 — They're getting bigger’,
pauseBetween: 0,
specialEvent: null,
},
// Wave 5 — SWARM. 8 small fast ones
{
waveNum:      5,
count:        8,
enemyLevel:   1,
spawnDelay:   0.15,
spawnPattern: ‘swarm’,
spawnRadius:  9,
announceText: ‘⚠ WAVE 5 — SWARM INCOMING’,
pauseBetween: 0,
specialEvent: ‘swarm_sound’,
},
// Wave 6 — Mixed: 2 heavies + 4 normals
{
waveNum:      6,
count:        6,
enemyLevel:   2,
spawnDelay:   0.35,
spawnPattern: ‘circle’,
spawnRadius:  9,
announceText: ‘WAVE 6 — Heavy support arriving’,
pauseBetween: 0,
specialEvent: null,
},
// Wave 7 — Tight swarm of level 2
{
waveNum:      7,
count:        10,
enemyLevel:   2,
spawnDelay:   0.12,
spawnPattern: ‘swarm’,
spawnRadius:  10,
announceText: ‘⚠ WAVE 7 — SWARM × 2’,
pauseBetween: 0,
specialEvent: ‘swarm_sound’,
},
// Wave 8 — Level 3 slimes introduced
{
waveNum:      8,
count:        5,
enemyLevel:   3,
spawnDelay:   0.4,
spawnPattern: ‘sides’,
spawnRadius:  10,
announceText: ‘WAVE 8 — EVOLVED SLIMES’,
pauseBetween: 0,
specialEvent: ‘screen_shake’,
},
// Wave 9 — Pincer with heavy
{
waveNum:      9,
count:        7,
enemyLevel:   3,
spawnDelay:   0.25,
spawnPattern: ‘pincer’,
spawnRadius:  11,
announceText: ‘WAVE 9 — Close quarters’,
pauseBetween: 0,
specialEvent: null,
},
// Wave 10 — BOSS WAVE. 1 huge slime + 5 small escorts
{
waveNum:      10,
count:        6,   // 1 boss + 5 normal
enemyLevel:   4,
spawnDelay:   0.6,
spawnPattern: ‘boss_wave’,
spawnRadius:  12,
announceText: ‘☠ WAVE 10 — BOSS INCOMING’,
pauseBetween: 2.0,
specialEvent: ‘boss_music’,
bossLevel:    8,   // one slime spawns at this level
},
];

// After wave 10, generate infinite scaling waves
function generateInfiniteWave(waveNum) {
var cycle    = Math.floor((waveNum - 11) / 5);
var position = (waveNum - 11) % 5;
var patterns = [‘circle’, ‘swarm’, ‘pincer’, ‘sides’, ‘swarm’];
var level    = 4 + cycle;
var count    = 6 + cycle * 2 + position * 2;
return {
waveNum:      waveNum,
count:        Math.min(count, 30),
enemyLevel:   Math.min(level, 10),
spawnDelay:   Math.max(0.08, 0.3 - cycle * 0.03),
spawnPattern: patterns[position],
spawnRadius:  12 + cycle,
announceText: ’WAVE ’ + waveNum + ’ — Level ’ + level,
pauseBetween: 0,
specialEvent: (count > 20) ? ‘swarm_sound’ : null,
bossLevel:    (waveNum % 5 === 0) ? (level + 4) : null,
};
}

// ════════════════════════════════════════════════════════════
//  WAVE SPAWNER
// ════════════════════════════════════════════════════════════
var WaveSpawner = {
_scene:         null,
_ready:         false,
_currentWave:   0,
_waveActive:    false,
_spawnQueue:    [],       // enemies waiting to spawn this wave
_spawnTimer:    0,
_wavePause:     0,        // delay between waves
_aliveCount:    0,
_spawnRadius:   8,
_totalKills:    0,
_waveKills:     0,
_callbacks:     {},       // event callbacks

// ── Init ─────────────────────────────────────────
init: function(scene, spawnRadius) {
this._scene       = scene;
this._spawnRadius = spawnRadius || 9;
this._ready       = true;
console.log(’[WaveSpawner] Ready. Spawn radius: ’ + this._spawnRadius);
},

// ── Register event callbacks ──────────────────────
// Usage: WaveSpawner.on(‘waveStart’, function(wave) { … })
on: function(event, fn) {
this._callbacks[event] = fn;
},
_emit: function(event, data) {
if (this._callbacks[event]) this._callbacks[event](data);
},

// ── Start the wave system ─────────────────────────
start: function() {
this._currentWave = 0;
this._totalKills  = 0;
this._wavePause   = 1.5;  // brief pause before wave 1
this._waveActive  = false;
this._spawnQueue  = [];
},

// ── Main update ──────────────────────────────────
update: function(dt, playerPos) {
if (!this._ready || !playerPos) return;

```
// Count alive slimes
var alive = global.SlimePool ? global.SlimePool.getAlive().length : 0;

// Spawn queue processing
if (this._spawnQueue.length > 0) {
  this._spawnTimer -= dt;
  if (this._spawnTimer <= 0) {
    var entry = this._spawnQueue.shift();
    this._doSpawn(entry, playerPos);
    this._spawnTimer = entry.delay || 0;
  }
}

// Wave complete check
if (this._waveActive && this._spawnQueue.length === 0 && alive === 0) {
  this._waveActive = false;
  this._wavePause  = this._getNextWavePause();
  this._emit('waveComplete', { wave: this._currentWave, kills: this._waveKills });
}

// Next wave countdown
if (!this._waveActive && this._spawnQueue.length === 0) {
  this._wavePause -= dt;
  if (this._wavePause <= 0) {
    this._startNextWave(playerPos);
  }
}
```

},

_getNextWavePause: function() {
// Longer pause after boss waves
if (this._currentWave % 10 === 0) return 4.0;
if (this._currentWave % 5  === 0) return 2.5;
return 1.2;
},

_startNextWave: function(playerPos) {
this._currentWave++;
this._waveKills  = 0;
this._waveActive = true;

```
var waveDef = this._currentWave <= WAVES.length
  ? WAVES[this._currentWave - 1]
  : generateInfiniteWave(this._currentWave);

// Announce
this._emit('waveStart', { wave: this._currentWave, def: waveDef });
if (waveDef.announceText) {
  this._emit('announce', { text: waveDef.announceText, wave: this._currentWave });
}
if (waveDef.specialEvent) {
  this._emit('specialEvent', { event: waveDef.specialEvent, wave: this._currentWave });
}

// Build spawn positions
var positions = this._getSpawnPositions(waveDef, playerPos);

// Build spawn queue
this._spawnQueue = [];
for (var i = 0; i < positions.length; i++) {
  var isBoss = (waveDef.bossLevel && i === 0);
  this._spawnQueue.push({
    x:     positions[i].x,
    z:     positions[i].z,
    level: isBoss ? waveDef.bossLevel : waveDef.enemyLevel,
    delay: waveDef.spawnDelay,
    isBoss: isBoss,
  });
}
this._spawnTimer = 0;

console.log('[WaveSpawner] Wave ' + this._currentWave + ' started. ' + positions.length + ' enemies.');
```

},

_getSpawnPositions: function(waveDef, playerPos) {
var positions = [];
var count  = waveDef.count;
var radius = waveDef.spawnRadius || this._spawnRadius;
var px     = playerPos.x, pz = playerPos.z;

```
switch (waveDef.spawnPattern) {

  case 'circle':
    // Evenly spaced around the player
    for (var i = 0; i < count; i++) {
      var angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      positions.push({
        x: px + Math.cos(angle) * radius,
        z: pz + Math.sin(angle) * radius,
      });
    }
    break;

  case 'swarm':
    // Tight cluster from ONE direction — more threatening
    var swarmAngle = Math.random() * Math.PI * 2;
    for (var i = 0; i < count; i++) {
      var spread = 0.6;
      var a = swarmAngle + (Math.random() - 0.5) * spread;
      var r = radius * (0.8 + Math.random() * 0.4);
      positions.push({
        x: px + Math.cos(a) * r,
        z: pz + Math.sin(a) * r,
      });
    }
    break;

  case 'pincer':
    // Two groups from opposite sides — classic pincer
    var side1 = Math.random() * Math.PI * 2;
    var side2 = side1 + Math.PI;
    var half  = Math.floor(count / 2);
    for (var i = 0; i < half; i++) {
      var a = side1 + (Math.random() - 0.5) * 0.7;
      positions.push({ x: px + Math.cos(a) * radius, z: pz + Math.sin(a) * radius });
    }
    for (var i = 0; i < count - half; i++) {
      var a = side2 + (Math.random() - 0.5) * 0.7;
      positions.push({ x: px + Math.cos(a) * radius, z: pz + Math.sin(a) * radius });
    }
    break;

  case 'sides':
    // Four sides of a box
    var perSide = Math.ceil(count / 4);
    var dirs    = [0, Math.PI/2, Math.PI, Math.PI*1.5];
    var placed  = 0;
    for (var d = 0; d < 4 && placed < count; d++) {
      for (var i = 0; i < perSide && placed < count; i++) {
        var a = dirs[d] + (Math.random() - 0.5) * 0.8;
        var r = radius * (0.9 + Math.random() * 0.2);
        positions.push({ x: px + Math.cos(a) * r, z: pz + Math.sin(a) * r });
        placed++;
      }
    }
    break;

  case 'boss_wave':
    // Boss spawns directly ahead, escorts in circle
    var bossAngle = Math.random() * Math.PI * 2;
    positions.push({  // BOSS first in queue
      x: px + Math.cos(bossAngle) * radius,
      z: pz + Math.sin(bossAngle) * radius,
    });
    for (var i = 1; i < count; i++) {
      var a = (i / (count - 1)) * Math.PI * 2;
      positions.push({
        x: px + Math.cos(a) * (radius * 0.7),
        z: pz + Math.sin(a) * (radius * 0.7),
      });
    }
    break;

  case 'random':
  default:
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var r = radius * (0.7 + Math.random() * 0.5);
      positions.push({ x: px + Math.cos(a) * r, z: pz + Math.sin(a) * r });
    }
    break;
}
return positions;
```

},

_doSpawn: function(entry, playerPos) {
if (!global.SlimePool) return;
var slime = global.SlimePool.spawn(entry.x, 0, entry.z, entry.level);
if (!slime) return;

```
// Boss gets bigger scale
if (entry.isBoss && slime.mesh) {
  slime.scale = 0.9 + Math.random() * 0.1;
  slime.mesh.scale.setScalar(slime.scale);
  slime.maxHp *= 2.0;
  slime.hp     = slime.maxHp;
}

// Spawn FX — small pop-in effect
if (slime.mesh) {
  slime.mesh.scale.setScalar(0.01);
  var targetScale = slime.scale;
  var t = 0;
  var popIn = setInterval(function() {
    t += 0.12;
    if (t >= 1.0 || !slime.mesh) {
      clearInterval(popIn);
      if (slime.mesh) slime.mesh.scale.setScalar(targetScale);
      return;
    }
    // Overshoot spring
    var spring = 1.0 + Math.sin(t * Math.PI) * 0.25;
    slime.mesh.scale.setScalar(targetScale * t * spring);
  }, 16);
}

this._emit('slimeSpawned', { slime: slime, wave: this._currentWave });
```

},

// ── Call when a slime dies ─────────────────────────
onSlimeKilled: function(slime) {
this._totalKills++;
this._waveKills++;
this._emit(‘slimeKilled’, {
totalKills: this._totalKills,
waveKills:  this._waveKills,
wave:       this._currentWave,
});
},

reset: function() {
this._currentWave = 0;
this._waveActive  = false;
this._spawnQueue  = [];
this._spawnTimer  = 0;
this._wavePause   = 0;
this._totalKills  = 0;
this._waveKills   = 0;
console.log(’[WaveSpawner] Reset.’);
},
};

// ════════════════════════════════════════════════════════════
//  PROJECTILE DEFINITIONS
//  Each weapon fires projectiles with specific physics.
//  instant:true  = hitscan (no travel time — pistol, sniper)
//  instant:false = real projectile with velocity + gravity
// ════════════════════════════════════════════════════════════
var PROJECTILE_DEFS = {
pistol: {
instant:    true,
speed:      0,
gravity:    0,
radius:     0.05,
maxRange:   40,
pierceCount: 0,      // 0 = stops on first hit
spread:     0.008,   // aim spread in radians
bulletCount: 1,
color:      0xffee88,
trailColor: 0xffcc44,
trailLen:   0.15,
},
revolver: {
instant:    true,
speed:      0,
gravity:    0,
radius:     0.06,
maxRange:   50,
pierceCount: 0,
spread:     0.005,
bulletCount: 1,
color:      0xffdd66,
trailColor: 0xffaa00,
trailLen:   0.20,
},
shotgun: {
instant:    true,
speed:      0,
gravity:    0,
radius:     0.04,
maxRange:   12,      // shorter range
pierceCount: 0,
spread:     0.18,    // large spread
bulletCount: 9,      // 9 pellets
color:      0xffffff,
trailColor: 0xdddddd,
trailLen:   0.08,
},
smg: {
instant:    true,
speed:      0,
gravity:    0,
radius:     0.04,
maxRange:   25,
pierceCount: 0,
spread:     0.025,
bulletCount: 1,
color:      0xffee99,
trailColor: 0xffcc66,
trailLen:   0.12,
},
sniper: {
instant:    true,
speed:      0,
gravity:    0,
radius:     0.03,
maxRange:   100,
pierceCount: 5,      // goes through everything
spread:     0.001,
bulletCount: 1,
color:      0xaaddff,
trailColor: 0x88bbff,
trailLen:   1.5,     // long visible trail
},
minigun: {
instant:    true,
speed:      0,
gravity:    0,
radius:     0.04,
maxRange:   20,
pierceCount: 0,
spread:     0.035,
bulletCount: 1,
color:      0xffee77,
trailColor: 0xffcc44,
trailLen:   0.10,
},
grenade: {
instant:    false,
speed:      12,
gravity:    -15,
radius:     0.15,
maxRange:   20,
pierceCount: 0,
spread:     0.02,
bulletCount: 1,
isExplosive: true,
blastRadius: 3.5,
fuseTime:    2.0,   // explodes after 2 sec OR on impact
color:      0x448833,
trailColor: 0x224422,
trailLen:   0,
},
rocket: {
instant:    false,
speed:      20,
gravity:    -3,     // low gravity — rockets fly mostly flat
radius:     0.18,
maxRange:   50,
pierceCount: 0,
isExplosive: true,
blastRadius: 6.0,
fuseTime:    99,    // explodes on impact only
spread:     0.01,
bulletCount: 1,
color:      0xff6622,
trailColor: 0xff4400,
trailLen:   0,
hasTrailFX: true,
},
laser: {
instant:    true,
speed:      0,
gravity:    0,
radius:     0.02,
maxRange:   60,
pierceCount: 99,   // full pierce
spread:     0.0,
bulletCount: 1,
color:      0xff0044,
trailColor: 0xff0044,
trailLen:   99,    // continuous beam
isBeam:     true,
},
plasma: {
instant:    false,
speed:      15,
gravity:    -5,
radius:     0.14,
maxRange:   30,
pierceCount: 0,
isExplosive: false,
spread:     0.01,
bulletCount: 1,
color:      0x44aaff,
trailColor: 0x2288ff,
trailLen:   0,
hasGlow:    true,
},
knife: {
instant:    true,
speed:      0,
gravity:    0,
radius:     0.05,
maxRange:   1.5,   // melee range
pierceCount: 0,
spread:     0.0,
bulletCount: 1,
color:      0xcccccc,
trailColor: 0xaaaaaa,
trailLen:   0.3,
},
sword: {
instant:    true,
speed:      0,
gravity:    0,
radius:     0.15,  // wide arc
maxRange:   1.8,
pierceCount: 3,
spread:     0.3,
bulletCount: 1,
color:      0xdddddd,
trailColor: 0xaaaadd,
trailLen:   0.5,
},
axe: {
instant:    true,
speed:      0,
gravity:    0,
radius:     0.10,
maxRange:   1.6,
pierceCount: 1,
spread:     0.2,
bulletCount: 1,
color:      0x886644,
trailColor: 0xaa6622,
trailLen:   0.4,
},
flame: {
instant:    false,
speed:      8,
gravity:    -2,
radius:     0.12,
maxRange:   6,     // short range
pierceCount: 2,
spread:     0.15,
bulletCount: 3,   // 3 flame particles
color:      0xff6600,
trailColor: 0xff3300,
trailLen:   0,
isFlame:    true,
},
ice: {
instant:    false,
speed:      14,
gravity:    -4,
radius:     0.10,
maxRange:   25,
pierceCount: 0,
spread:     0.015,
bulletCount: 1,
color:      0x88ddff,
trailColor: 0x44aaff,
trailLen:   0,
hasGlow:    true,
},
lightning: {
instant:    true,
speed:      0,
gravity:    0,
radius:     0.08,
maxRange:   15,
pierceCount: 2,
spread:     0.05,
bulletCount: 1,
color:      0xffff44,
trailColor: 0xffee00,
trailLen:   0.8,
isChain:    true,  // can chain to nearby enemies
chainRange: 3.0,
},
knife_takedown: {
instant:    true,
speed:      0,
gravity:    0,
radius:     0.05,
maxRange:   1.2,
pierceCount: 0,
spread:     0.0,
bulletCount: 1,
color:      0xcccccc,
trailColor: 0xaaaaaa,
trailLen:   0.2,
},
meteor: {
instant:    false,
speed:      25,
gravity:    30,   // falls fast
radius:     0.5,
maxRange:   40,
pierceCount: 0,
isExplosive: true,
blastRadius: 8.0,
fuseTime:    99,
spread:     0.02,
bulletCount: 1,
color:      0xff4400,
trailColor: 0xff6600,
trailLen:   0,
hasTrailFX: true,
},
};

// ════════════════════════════════════════════════════════════
//  PROJECTILE OBJECT — pooled, no GC
// ════════════════════════════════════════════════════════════
var MAX_PROJECTILES = 80;

function makeProjectile() {
return {
alive:       false,
weaponKey:   ‘’,
weaponLevel: 1,
px:0, py:0, pz:0,    // position
vx:0, vy:0, vz:0,    // velocity
dx:0, dy:0, dz:0,    // direction (normalised, for instant)
life:        0,
maxLife:     0,
distTraveled:0,
piercesLeft: 0,
def:         null,
mesh:        null,
trail:       null,
hitEnemies:  [],     // enemies already hit this projectile (for pierce)
};
}

// ════════════════════════════════════════════════════════════
//  HIT DETECTION
// ════════════════════════════════════════════════════════════
var HitDetection = {
_scene:       null,
_ready:       false,
_projectiles: [],
_meshes:      [],       // pooled projectile meshes
_raycaster:   new THREE.Raycaster(),

init: function(scene) {
this._scene = scene;
this._ready = true;
this._buildProjectilePool();
console.log(’[HitDetection] Ready. ’ + MAX_PROJECTILES + ’ projectiles pooled.’);
},

_buildProjectilePool: function() {
var geo  = new THREE.SphereGeometry(0.5, 5, 4);
var mat  = new THREE.MeshBasicMaterial({ color: 0xffee88 });
for (var i = 0; i < MAX_PROJECTILES; i++) {
var p    = makeProjectile();
var mesh = new THREE.Mesh(geo, mat.clone());
mesh.visible = false;
this._scene.add(mesh);
p.mesh = mesh;
this._projectiles.push(p);
}
},

// ── PUBLIC: fire a weapon ────────────────────────
// weaponKey:   string key from PROJECTILE_DEFS
// weaponLevel: integer 1-10
// origin:      THREE.Vector3 — barrel world position
// direction:   THREE.Vector3 — normalised aim direction
fireWeapon: function(weaponKey, weaponLevel, origin, direction) {
if (!this._ready) return;
var def = PROJECTILE_DEFS[weaponKey] || PROJECTILE_DEFS.pistol;
weaponLevel = weaponLevel || 1;

```
// Level scaling for pierce count and spread
var lvlPierce = Math.min(def.pierceCount + Math.floor(weaponLevel / 3), 10);
var lvlSpread = def.spread * Math.max(0.5, 1.0 - (weaponLevel - 1) * 0.08);

for (var b = 0; b < def.bulletCount; b++) {
  // Apply spread
  var spreadX = (Math.random() - 0.5) * lvlSpread * 2;
  var spreadY = (Math.random() - 0.5) * lvlSpread * 2;
  var spreadZ = (Math.random() - 0.5) * lvlSpread * 2;

  var dx = direction.x + spreadX;
  var dy = direction.y + spreadY;
  var dz = direction.z + spreadZ;
  var len = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.0001;
  dx /= len; dy /= len; dz /= len;

  if (def.instant) {
    this._fireInstant(weaponKey, weaponLevel, origin, dx, dy, dz, def, lvlPierce);
  } else {
    this._fireProjectile(weaponKey, weaponLevel, origin, dx, dy, dz, def, lvlPierce);
  }
}
```

},

// ── Hitscan (instant) ──────────────────────────
_fireInstant: function(wk, wlvl, origin, dx, dy, dz, def, pierceCount) {
var maxRange    = def.maxRange + wlvl * 1.5;
var piercesLeft = pierceCount;
var travelDist  = 0;
var ox = origin.x, oy = origin.y, oz = origin.z;

```
// Visual trail for hitscan
if (def.trailLen > 0 && this._scene) {
  this._spawnBulletTrail(ox, oy, oz, dx, dy, dz, def, maxRange);
}

// Beam weapon: hits all enemies along line simultaneously
if (def.isBeam) {
  this._raycastAll(wk, wlvl, ox, oy, oz, dx, dy, dz, maxRange, def);
  return;
}

// Get all alive slimes sorted by distance along ray
var slimes = global.SlimePool ? global.SlimePool.getAlive() : [];
var hits   = [];

for (var i = 0; i < slimes.length; i++) {
  var s = slimes[i];
  if (!s.mesh) continue;
  var sp = s.mesh.position;
  // Closest point on ray to sphere center
  var tx = sp.x - ox, ty = sp.y - oy, tz = sp.z - oz;
  var t  = tx*dx + ty*dy + tz*dz;
  if (t < 0 || t > maxRange) continue;
  // Distance from ray to sphere center
  var cx = ox + dx*t - sp.x;
  var cy = oy + dy*t - sp.y;
  var cz = oz + dz*t - sp.z;
  var dist2 = cx*cx + cy*cy + cz*cz;
  var hitRadius = s.scale * 1.0 + def.radius;
  if (dist2 < hitRadius * hitRadius) {
    hits.push({ slime: s, t: t, dist2: dist2 });
  }
}

// Sort by distance
hits.sort(function(a, b) { return a.t - b.t; });

// Apply hits
for (var i = 0; i < hits.length; i++) {
  if (piercesLeft < 0) break;
  var h = hits[i];
  var s = h.slime;

  // Calculate hit point on slime surface
  var hitPoint  = new THREE.Vector3(ox + dx*h.t, oy + dy*h.t, oz + dz*h.t);
  var hitNormal = new THREE.Vector3(
    hitPoint.x - s.mesh.position.x,
    hitPoint.y - s.mesh.position.y,
    hitPoint.z - s.mesh.position.z
  ).normalize();
  var bulletDir = new THREE.Vector3(dx, dy, dz);

  // Check through-shot at this weapon level
  var wh        = (global.WEAPON_HIT && global.WEAPON_HIT[wk]) || {};
  var isThrough = wlvl >= (wh.throughAt || 99);

  var result = global.SlimePool.hit(s, wk, wlvl, hitPoint, hitNormal, bulletDir);
  if (result) {
    // If slime died, notify wave spawner
    if (!s.alive || s.dying) {
      if (global.WaveSpawner) global.WaveSpawner.onSlimeKilled(s);
    }
  }

  if (!isThrough) piercesLeft--;
}

// Explosive weapons: check blast radius even without direct hit
if (def.isExplosive && hits.length === 0) {
  // Did ray land near any slimes?
  var endX = ox + dx * maxRange;
  var endZ = oz + dz * maxRange;
  this._triggerExplosion(wk, wlvl, new THREE.Vector3(endX, oy, endZ), def);
}
```

},

_raycastAll: function(wk, wlvl, ox, oy, oz, dx, dy, dz, maxRange, def) {
var slimes = global.SlimePool ? global.SlimePool.getAlive() : [];
for (var i = 0; i < slimes.length; i++) {
var s  = slimes[i];
if (!s.mesh) continue;
var sp = s.mesh.position;
var tx = sp.x - ox, ty = sp.y - oy, tz = sp.z - oz;
var t  = tx*dx + ty*dy + tz*dz;
if (t < 0 || t > maxRange) continue;
var cx = ox + dx*t - sp.x;
var cy = oy + dy*t - sp.y;
var cz = oz + dz*t - sp.z;
if (cx*cx + cy*cy + cz*cz < (s.scale * 1.1) * (s.scale * 1.1)) {
var hitPoint  = new THREE.Vector3(ox + dx*t, oy + dy*t, oz + dz*t);
var hitNormal = new THREE.Vector3(hitPoint.x - sp.x, hitPoint.y - sp.y, hitPoint.z - sp.z).normalize();
var result = global.SlimePool.hit(s, wk, wlvl, hitPoint, hitNormal, new THREE.Vector3(dx,dy,dz));
if (result && (!s.alive || s.dying) && global.WaveSpawner) {
global.WaveSpawner.onSlimeKilled(s);
}
}
}
},

// ── Real projectile (physics-simulated) ─────────
_fireProjectile: function(wk, wlvl, origin, dx, dy, dz, def, pierceCount) {
var p = this._getFreeProjectile();
if (!p) return;

```
p.alive       = true;
p.weaponKey   = wk;
p.weaponLevel = wlvl;
p.px = origin.x; p.py = origin.y; p.pz = origin.z;
p.vx = dx * def.speed;
p.vy = dy * def.speed;
p.vz = dz * def.speed;
p.dx = dx; p.dy = dy; p.dz = dz;
p.distTraveled = 0;
p.piercesLeft  = pierceCount;
p.def          = def;
p.maxLife      = def.fuseTime || (def.maxRange / Math.max(1, def.speed) * 2);
p.life         = p.maxLife;
p.hitEnemies   = [];

// Setup mesh
if (p.mesh) {
  var r = def.radius * 0.8;
  p.mesh.scale.setScalar(r * 15);
  p.mesh.material.color.setHex(def.color || 0xffee88);
  p.mesh.position.set(origin.x, origin.y, origin.z);
  p.mesh.visible = true;
}
```

},

// ── Update all projectiles ─────────────────────
update: function(dt, playerPos) {
if (!this._ready) return;
for (var i = 0; i < this._projectiles.length; i++) {
var p = this._projectiles[i];
if (!p.alive) continue;
this._updateProjectile(p, dt);
}
},

_updateProjectile: function(p, dt) {
var def = p.def;
if (!def) { p.alive = false; return; }

```
p.life -= dt;
if (p.life <= 0) {
  // Fuse explosion
  if (def.isExplosive) {
    this._triggerExplosion(p.weaponKey, p.weaponLevel, new THREE.Vector3(p.px, p.py, p.pz), def);
  }
  this._killProjectile(p);
  return;
}

// Gravity
p.vy += (def.gravity || 0) * dt;

// Integrate
var prevX = p.px, prevY = p.py, prevZ = p.pz;
p.px += p.vx * dt;
p.py += p.vy * dt;
p.pz += p.vz * dt;

var moved = Math.sqrt(
  (p.px-prevX)*(p.px-prevX) +
  (p.py-prevY)*(p.py-prevY) +
  (p.pz-prevZ)*(p.pz-prevZ)
);
p.distTraveled += moved;

// Ground check
if (p.py <= 0.05) {
  if (def.isExplosive) {
    this._triggerExplosion(p.weaponKey, p.weaponLevel, new THREE.Vector3(p.px, 0.05, p.pz), def);
  }
  this._killProjectile(p);
  return;
}

// Range check
if (p.distTraveled >= def.maxRange) {
  if (def.isExplosive) {
    this._triggerExplosion(p.weaponKey, p.weaponLevel, new THREE.Vector3(p.px, p.py, p.pz), def);
  }
  this._killProjectile(p);
  return;
}

// Update mesh
if (p.mesh) {
  p.mesh.position.set(p.px, p.py, p.pz);
  // Orient along velocity
  if (Math.abs(p.vy) > 0.1) {
    p.mesh.lookAt(p.px + p.vx, p.py + p.vy, p.pz + p.vz);
  }
}

// Collision with slimes
var slimes = global.SlimePool ? global.SlimePool.getAlive() : [];
for (var i = 0; i < slimes.length; i++) {
  var s = slimes[i];
  if (!s.mesh) continue;
  // Already hit this slime with this projectile?
  if (p.hitEnemies.indexOf(s.id) !== -1) continue;

  var sp   = s.mesh.position;
  var ddx  = p.px - sp.x, ddy = p.py - sp.y, ddz = p.pz - sp.z;
  var dist2 = ddx*ddx + ddy*ddy + ddz*ddz;
  var hitR  = (s.scale + def.radius) * (s.scale + def.radius);

  if (dist2 < hitR) {
    p.hitEnemies.push(s.id);

    var hitPoint  = new THREE.Vector3(p.px, p.py, p.pz);
    var hitNormal = new THREE.Vector3(ddx, ddy, ddz).normalize();
    var bulletDir = new THREE.Vector3(p.vx, p.vy, p.vz).normalize();

    var result = global.SlimePool.hit(s, p.weaponKey, p.weaponLevel, hitPoint, hitNormal, bulletDir);
    if (result && (!s.alive || s.dying) && global.WaveSpawner) {
      global.WaveSpawner.onSlimeKilled(s);
    }

    if (def.isExplosive) {
      this._triggerExplosion(p.weaponKey, p.weaponLevel, hitPoint, def);
      this._killProjectile(p);
      return;
    }

    p.piercesLeft--;
    if (p.piercesLeft < 0) {
      this._killProjectile(p);
      return;
    }
  }
}
```

},

_triggerExplosion: function(wk, wlvl, pos, def) {
if (!global.SlimePool || !def.isExplosive) return;
var blastR = (def.blastRadius || 3.0) * (1 + (wlvl-1) * 0.12);
var slimes = global.SlimePool.getAlive();
for (var i = 0; i < slimes.length; i++) {
var s = slimes[i];
if (!s.mesh) continue;
var sp  = s.mesh.position;
var ddx = pos.x - sp.x, ddy = pos.y - sp.y, ddz = pos.z - sp.z;
var d   = Math.sqrt(ddx*ddx + ddy*ddy + ddz*ddz);
if (d < blastR) {
// Damage falls off with distance
var falloff    = 1.0 - (d / blastR);
var hitNormal  = new THREE.Vector3(-ddx/d, -ddy/d, -ddz/d);
var result = global.SlimePool.hit(s, wk, wlvl, pos, hitNormal, hitNormal);
if (result && (!s.alive || s.dying) && global.WaveSpawner) {
global.WaveSpawner.onSlimeKilled(s);
}
}
}
},

// ── Bullet trail visual ───────────────────────
_spawnBulletTrail: function(ox, oy, oz, dx, dy, dz, def, range) {
if (!global.BloodV2 || !global.BloodV2._dropIM) return;
// We reuse the drop InstancedMesh for a quick elongated bullet streak
var pool = global.BloodV2._dropData;
var trailLen = Math.min(range, def.trailLen || 0.3);
if (trailLen <= 0) return;

```
// Spawn a few drops along the trail path
var steps = Math.ceil(trailLen / 0.15);
for (var i = 0; i < Math.min(steps, 8); i++) {
  var t  = (i / steps) * trailLen;
  var tx = ox + dx * t, ty = oy + dy * t, tz = oz + dz * t;
  // Find free drop
  for (var j = 0; j < pool.length; j++) {
    if (!pool[j].alive) {
      var d   = pool[j];
      d.alive = true;
      d.px = tx; d.py = ty; d.pz = tz;
      d.vx = dx * 0.3; d.vy = dy * 0.3; d.vz = dz * 0.3;
      d.r         = 0.004 + Math.random() * 0.004;
      d.maxLife   = 0.12 + Math.random() * 0.08;
      d.life      = d.maxLife;
      d.viscosity = 0.1;
      d.bounces   = 0; d.maxBounces = 0;
      d.onGround  = false;
      d.color     = def.trailColor || 0xffee88;
      d.frozen    = false; d.charred = false;
      break;
    }
  }
}
if (global.BloodV2._dropIM) global.BloodV2._dropIM.instanceMatrix.needsUpdate = true;
```

},

_getFreeProjectile: function() {
for (var i = 0; i < this._projectiles.length; i++) {
if (!this._projectiles[i].alive) return this._projectiles[i];
}
// Recycle oldest
var oldest = this._projectiles[0];
var oldestLife = this._projectiles[0].life;
for (var i = 1; i < this._projectiles.length; i++) {
if (this._projectiles[i].alive && this._projectiles[i].life < oldestLife) {
oldest = this._projectiles[i]; oldestLife = this._projectiles[i].life;
}
}
this._killProjectile(oldest);
return oldest;
},

_killProjectile: function(p) {
p.alive = false;
if (p.mesh) p.mesh.visible = false;
p.hitEnemies = [];
},

reset: function() {
for (var i = 0; i < this._projectiles.length; i++) {
this._killProjectile(this._projectiles[i]);
}
console.log(’[HitDetection] Reset.’);
},
};

// ════════════════════════════════════════════════════════════
//  EXPOSE GLOBALS
// ════════════════════════════════════════════════════════════
global.WaveSpawner   = WaveSpawner;
global.HitDetection  = HitDetection;
global.PROJECTILE_DEFS = PROJECTILE_DEFS;

console.log([
‘’,
‘╔══════════════════════════════════════════════════════╗’,
‘║  Wave System + Hit Detection v1.0 — LOADED          ║’,
‘╠══════════════════════════════════════════════════════╣’,
‘║  10 handcrafted waves + infinite scaling            ║’,
‘║  18 projectile weapon types                         ║’,
‘║  Hitscan + physics projectiles + explosions         ║’,
‘║  Shotgun spread | Sniper pierce | Chain lightning   ║’,
‘║  Level scaling: spread↓ pierce↑ range↑             ║’,
‘╠══════════════════════════════════════════════════════╣’,
‘║  game-screens.js init():                            ║’,
‘║    window.WaveSpawner.init(scene, 9);               ║’,
‘║    window.HitDetection.init(scene);                 ║’,
‘║    window.WaveSpawner.start();                      ║’,
‘║                                                      ║’,
‘║  game-loop.js animate():                            ║’,
‘║    window.WaveSpawner.update(dt, playerPos);        ║’,
‘║    window.HitDetection.update(dt, playerPos);       ║’,
‘║                                                      ║’,
‘║  When player fires:                                 ║’,
‘║    window.HitDetection.fireWeapon(                  ║’,
‘║      “shotgun”, weaponLevel, origin, direction      ║’,
‘║    );                                               ║’,
‘║                                                      ║’,
‘║  Wave events:                                       ║’,
‘║    WaveSpawner.on(“waveStart”, fn);                 ║’,
‘║    WaveSpawner.on(“waveComplete”, fn);              ║’,
‘║    WaveSpawner.on(“announce”, fn);                  ║’,
‘║    WaveSpawner.on(“slimeKilled”, fn);               ║’,
‘╚══════════════════════════════════════════════════════╝’,
‘’,
].join(’\n’));

})(window);
