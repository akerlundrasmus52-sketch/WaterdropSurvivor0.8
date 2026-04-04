/**
 * CRAWLER ENEMY — Multi-Segmented Worm/Caterpillar
 * Water Drop Survivor — Sandbox 2.0
 * File: js/crawler-enemy.js
 * 
 * Load AFTER: three.min.js, blood-system-v2.js
 * Load BEFORE: sandbox-loop.js
 */
;(function(global) {
'use strict';

var CRAWLER_CFG = {
  BASE_HP:        250,
  BASE_SPEED:     1.2,
  RUSH_SPEED:     4.5,      // burst speed when rushing
  BASE_DAMAGE:    18,       // much more than slimes (8)
  SEGMENT_COUNT:  6,        // body segments (not including head)
  SEGMENT_RADIUS: 0.253,    // 0.22 * 1.15 = 0.253 (15% bigger)
  HEAD_RADIUS:    0.368,    // 0.32 * 1.15 = 0.368 (15% bigger)
  SEGMENT_GAP:    0.437,    // 0.38 * 1.15 = 0.437 (15% bigger)
  UNDULATE_SPEED: 5.0,
  UNDULATE_AMP:   0.138,    // 0.12 * 1.15 = 0.138 (15% bigger)
  ATTACK_RANGE:   1.725,    // 1.5 * 1.15 = 1.725 (15% bigger)
  ATTACK_COOLDOWN: 2.0,
  RUSH_COOLDOWN:  6.0,      // seconds between rush attacks
  RUSH_DURATION:  0.8,      // how long the rush lasts
  FLANK_CHANCE:   0.4,      // 40% chance to flank instead of direct charge
  MOUTH_OPEN_SPEED: 4.0,
  POOL_SIZE:      15,
  AGGRO_RANGE:    14.0,
};

var CRAWLER_COLORS = {
  body:     0x8B4513,  // saddle brown
  bodyDark: 0x5C3010,  // darker segments
  belly:    0xDEB887,  // burlywood belly
  head:     0x6B3410,
  eye:      0xFFFFFF,
  pupil:    0x111111,
  tooth:    0xFFFDD0,  // cream/bone
  gums:     0xCC2222,
  wounded:  0x993333,
};

// ════════════════════════════════════════════════
//  CRAWLER INSTANCE
// ════════════════════════════════════════════════
function CrawlerEnemy() {
  this.alive = false;
  this.active = false;
  this.id = Math.random().toString(36).slice(2);
  this.enemyType = 'crawler';
  
  // Stats
  this.hp = 0;
  this.maxHp = 0;
  this.speed = 0;
  this.damage = 0;
  this.level = 1;
  
  // Physics
  this.vx = 0;
  this.vz = 0;
  this.velocity = new THREE.Vector3();
  
  // State machine
  this.state = 'idle';   // idle | chase | flank | rush | attack | dying
  this.stateTimer = 0;
  this.attackTimer = 0;
  this.rushTimer = 0;     // cooldown for rush
  this.rushActive = false;
  this.rushDuration = 0;
  this.rushDirX = 0;
  this.rushDirZ = 0;
  this.flankAngle = 0;
  this.flankDir = 1;      // +1 or -1 for CW/CCW flanking
  
  // Mesh
  this.group = null;        // THREE.Group containing all segments
  this.headMesh = null;
  this.segments = [];       // array of segment meshes
  this.segmentPositions = []; // historical positions for undulation
  this.eyeL = null;
  this.eyeR = null;
  this.mouthGroup = null;   // group for teeth (hidden unless attacking)
  this.mouthOpen = 0;       // 0=closed, 1=fully open
  
  // Wounds
  this.woundCount = 0;
  this.woundPool = [];
  
  // Animation
  this.undulatePhase = Math.random() * Math.PI * 2;
  this.breathPhase = Math.random() * Math.PI * 2;
  this.blinkTimer = 0;
  this.nextBlinkTime = 2 + Math.random() * 4;
  this.isBlinking = false;
  
  // Damage visual
  this.flashTimer = 0;
  this.damageStage = 0;
  this.squishTime = 0;
  this.knockbackVx = 0;
  this.knockbackVz = 0;
  this.lastDamageTime = 0;
  
  // Death
  this.dying = false;
  this.dead = false;
  this.deathTimer = 0;
  this._deathSlideVX = 0;
  this._deathSlideVZ = 0;
}

// ── Build mesh ──────────────────────────────────
CrawlerEnemy.prototype._buildMesh = function(scene) {
  this.group = new THREE.Group();
  this.group.visible = false;
  
  // Head segment (slightly larger)
  var headGeo = new THREE.SphereGeometry(CRAWLER_CFG.HEAD_RADIUS, 10, 8);
  // Flatten slightly
  var hPos = headGeo.attributes.position;
  for (var i = 0; i < hPos.count; i++) {
    var y = hPos.getY(i);
    hPos.setY(i, y * 0.75);
  }
  headGeo.computeVertexNormals();
  
  var headMat = new THREE.MeshPhysicalMaterial({
    color: CRAWLER_COLORS.head,
    roughness: 0.5,
    metalness: 0.0,
    clearcoat: 0.3,
  });
  this.headMesh = new THREE.Mesh(headGeo, headMat);
  this.headMesh.position.set(0, CRAWLER_CFG.HEAD_RADIUS * 0.6, 0);
  this.headMesh.castShadow = true;
  this.headMesh.frustumCulled = false; // prevent vanishing at screen edges
  this.group.add(this.headMesh);
  
  // Eyes (cute, small, on top of head)
  var eyeGeo = new THREE.SphereGeometry(0.06, 8, 6);
  var eyeMat = new THREE.MeshBasicMaterial({ color: CRAWLER_COLORS.eye });
  var pupilGeo = new THREE.SphereGeometry(0.035, 6, 4);
  var pupilMat = new THREE.MeshBasicMaterial({ color: CRAWLER_COLORS.pupil });
  
  this.eyeL = new THREE.Mesh(eyeGeo, eyeMat.clone());
  this.eyeR = new THREE.Mesh(eyeGeo, eyeMat.clone());
  this.eyeL.position.set(-0.12, 0.15, 0.2);
  this.eyeR.position.set(0.12, 0.15, 0.2);
  
  var pupilL = new THREE.Mesh(pupilGeo, pupilMat);
  var pupilR = new THREE.Mesh(pupilGeo, pupilMat.clone());
  pupilL.position.set(0, 0, 0.03);
  pupilR.position.set(0, 0, 0.03);
  this.eyeL.add(pupilL);
  this.eyeR.add(pupilR);
  this.eyeL._pupil = pupilL;
  this.eyeR._pupil = pupilR;
  
  this.headMesh.add(this.eyeL);
  this.headMesh.add(this.eyeR);
  
  // Mouth group (hidden by default, shown when attacking)
  this.mouthGroup = new THREE.Group();
  this.mouthGroup.visible = false;
  this.mouthGroup.position.set(0, 0, CRAWLER_CFG.HEAD_RADIUS * 0.7);
  
  // Gums (dark red circle base)
  var gumGeo = new THREE.CircleGeometry(CRAWLER_CFG.HEAD_RADIUS * 0.9, 16);
  var gumMat = new THREE.MeshBasicMaterial({ color: CRAWLER_COLORS.gums, side: THREE.DoubleSide });
  var gumMesh = new THREE.Mesh(gumGeo, gumMat);
  this.mouthGroup.add(gumMesh);
  
  // Teeth: 2 concentric rows
  var toothGeo = new THREE.ConeGeometry(0.03, 0.12, 4);
  var toothMat = new THREE.MeshPhysicalMaterial({ color: CRAWLER_COLORS.tooth, roughness: 0.3 });
  
  // Outer row (8 teeth)
  for (var t = 0; t < 8; t++) {
    var angle = (t / 8) * Math.PI * 2;
    var r = CRAWLER_CFG.HEAD_RADIUS * 0.7;
    var tooth = new THREE.Mesh(toothGeo, toothMat);
    tooth.position.set(Math.cos(angle) * r, Math.sin(angle) * r, 0.04);
    tooth.rotation.z = angle + Math.PI; // point inward
    tooth.rotation.x = Math.PI * 0.5;
    this.mouthGroup.add(tooth);
  }
  // Inner row (5 smaller teeth)
  var innerToothGeo = new THREE.ConeGeometry(0.02, 0.08, 4);
  for (var t = 0; t < 5; t++) {
    var angle = (t / 5) * Math.PI * 2 + 0.3;
    var r = CRAWLER_CFG.HEAD_RADIUS * 0.4;
    var tooth = new THREE.Mesh(innerToothGeo, toothMat);
    tooth.position.set(Math.cos(angle) * r, Math.sin(angle) * r, 0.06);
    tooth.rotation.z = angle + Math.PI;
    tooth.rotation.x = Math.PI * 0.5;
    this.mouthGroup.add(tooth);
  }
  
  this.headMesh.add(this.mouthGroup);
  
  // Body segments
  this.segments = [];
  this.segmentPositions = [];
  var segGeo = new THREE.SphereGeometry(CRAWLER_CFG.SEGMENT_RADIUS, 8, 6);
  // Slightly flatten segments
  var sPos = segGeo.attributes.position;
  for (var i = 0; i < sPos.count; i++) {
    sPos.setY(i, sPos.getY(i) * 0.7);
  }
  segGeo.computeVertexNormals();
  
  for (var s = 0; s < CRAWLER_CFG.SEGMENT_COUNT; s++) {
    var shade = s % 2 === 0 ? CRAWLER_COLORS.body : CRAWLER_COLORS.bodyDark;
    var segMat = new THREE.MeshPhysicalMaterial({
      color: shade,
      roughness: 0.55,
      metalness: 0.0,
      clearcoat: 0.2,
    });
    var segMesh = new THREE.Mesh(segGeo, segMat);
    segMesh.position.set(0, CRAWLER_CFG.SEGMENT_RADIUS * 0.5, -(s + 1) * CRAWLER_CFG.SEGMENT_GAP);
    segMesh.castShadow = true;
    segMesh.frustumCulled = false; // prevent segment vanishing at screen edges
    // Scale slightly smaller toward tail
    var taper = 1.0 - s * 0.08;
    segMesh.scale.set(taper, taper, taper);
    this.group.add(segMesh);
    this.segments.push(segMesh);
    this.segmentPositions.push(new THREE.Vector3(0, 0, -(s + 1) * CRAWLER_CFG.SEGMENT_GAP));
  }
  
  // Pre-allocate wound meshes (6 max)
  var woundGeo = new THREE.SphereGeometry(0.08, 6, 4);
  var woundMat = new THREE.MeshBasicMaterial({ color: 0x330000, transparent: true, opacity: 0.9 });
  for (var w = 0; w < 6; w++) {
    var wound = new THREE.Mesh(woundGeo, woundMat.clone());
    wound.visible = false;
    this.group.add(wound);
    this.woundPool.push(wound);
  }
  
  scene.add(this.group);
};

// ── Spawn from pool ──────────────────────────────
CrawlerEnemy.prototype.spawn = function(x, z, waveLevel) {
  this.alive = true;
  this.active = true;
  this.dying = false;
  this.dead = false;
  this._deathSlideVX = 0;
  this._deathSlideVZ = 0;
  this.level = waveLevel || 1;
  
  var lvlScale = 1.0 + (this.level - 1) * 0.25;
  this.maxHp = Math.floor(CRAWLER_CFG.BASE_HP * lvlScale);
  this.hp = this.maxHp;
  this.speed = CRAWLER_CFG.BASE_SPEED + (this.level - 1) * 0.1;
  this.damage = CRAWLER_CFG.BASE_DAMAGE + (this.level - 1) * 3;
  
  this.vx = 0;
  this.vz = 0;
  this.velocity.set(0, 0, 0);
  
  this.state = 'idle';
  this.stateTimer = Math.random() * 1.0;
  this.attackTimer = 1.5 + Math.random() * 2.0;
  this.rushTimer = CRAWLER_CFG.RUSH_COOLDOWN * 0.5;
  this.rushActive = false;
  this.rushDuration = 0;
  this.flankAngle = 0;
  this.flankDir = Math.random() < 0.5 ? 1 : -1;
  
  this.undulatePhase = Math.random() * Math.PI * 2;
  this.breathPhase = Math.random() * Math.PI * 2;
  this.blinkTimer = 0;
  this.nextBlinkTime = 2 + Math.random() * 4;
  this.isBlinking = false;
  
  this.flashTimer = 0;
  this.damageStage = 0;
  this.squishTime = 0;
  this.knockbackVx = 0;
  this.knockbackVz = 0;
  this.mouthOpen = 0;
  this.lastDamageTime = 0;
  this.woundCount = 0;
  this._bulletHoleIndex = 0;
  if (this._bulletHoles && this._bulletHoles.length) {
    for (var bh = 0; bh < this._bulletHoles.length; bh++) {
      if (this._bulletHoles[bh]) {
        this._bulletHoles[bh].visible = false;
        this._bulletHoles[bh].position.set(0, -10, 0);
      }
    }
  }
  
  // Position group
  if (this.group) {
    this.group.position.set(x, 0, z);
    this.group.rotation.y = Math.random() * Math.PI * 2;
    this.group.visible = true;
    
    // Reset head color
    if (this.headMesh) this.headMesh.material.color.setHex(CRAWLER_COLORS.head);
    
    // Reset segment positions
    for (var i = 0; i < this.segments.length; i++) {
      this.segments[i].position.set(0, CRAWLER_CFG.SEGMENT_RADIUS * 0.5, -(i + 1) * CRAWLER_CFG.SEGMENT_GAP);
      this.segmentPositions[i].set(
        x, 0, z - (i + 1) * CRAWLER_CFG.SEGMENT_GAP
      );
      var shade = i % 2 === 0 ? CRAWLER_COLORS.body : CRAWLER_COLORS.bodyDark;
      this.segments[i].material.color.setHex(shade);
    }
    
    // Hide wounds
    for (var w = 0; w < this.woundPool.length; w++) {
      this.woundPool[w].visible = false;
    }
    
    // Reset eyes
    if (this.eyeL) { this.eyeL.visible = true; this.eyeR.visible = true; }
    if (this.mouthGroup) this.mouthGroup.visible = false;
  }
};

// ── Get mesh (for collision/spatial hash compat) ──
Object.defineProperty(CrawlerEnemy.prototype, 'mesh', {
  get: function() { return this.group; }
});

// ── Update ──────────────────────────────────────
CrawlerEnemy.prototype.update = function(dt, playerPos) {
  if (!this.alive || !this.group) return;
  
  if (this.dying) {
    this.deathTimer += dt;
    // Death slide: apply kill velocity for first 0.3 seconds with friction
    if (this.deathTimer < 0.3 && (this._deathSlideVX || this._deathSlideVZ)) {
      this.group.position.x += this._deathSlideVX * dt;
      this.group.position.z += this._deathSlideVZ * dt;
      // dt-scaled exponential decay: 0.85 per frame at 60 FPS
      var decay = Math.pow(0.85, dt * 60);
      this._deathSlideVX *= decay;
      this._deathSlideVZ *= decay;
    }
    // Fade out segments over 2 seconds
    var fade = 1.0 - this.deathTimer / 2.0;
    if (fade <= 0) {
      this.alive = false;
      this.active = false;
      this.group.visible = false;
      return;
    }
    for (var i = 0; i < this.segments.length; i++) {
      this.segments[i].material.opacity = Math.max(0, fade);
      this.segments[i].material.transparent = true;
    }
    if (this.headMesh) {
      this.headMesh.material.opacity = Math.max(0, fade);
      this.headMesh.material.transparent = true;
    }
    return;
  }
  
  // Flash on hit
  if (this.flashTimer > 0) {
    this.flashTimer -= dt;
    if (this.headMesh) this.headMesh.material.color.setHex(0xFFFFFF);
  } else {
    var hpRatio = this.hp / this.maxHp;
    var col = hpRatio > 0.6 ? CRAWLER_COLORS.head : (hpRatio > 0.3 ? CRAWLER_COLORS.wounded : 0x661111);
    if (this.headMesh) this.headMesh.material.color.setHex(col);
  }
  
  // Attack timer cooldown
  if (this.attackTimer > 0) this.attackTimer -= dt;
  if (this.rushTimer > 0) this.rushTimer -= dt;
  
  // Breathing animation (Y-axis scaling)
  this.breathPhase += dt * 2.5;
  var breathScale = 1.0 + Math.sin(this.breathPhase) * 0.04;
  if (this.headMesh) {
    this.headMesh.scale.y = breathScale * 0.75; // 0.75 base from flattening
  }
  for (var i = 0; i < this.segments.length; i++) {
    var taper = 1.0 - i * 0.08;
    var segBreath = 1.0 + Math.sin(this.breathPhase + i * 0.5) * 0.04;
    this.segments[i].scale.y = taper * 0.7 * segBreath;
  }
  
  // Blinking eyes
  this.blinkTimer += dt;
  if (this.blinkTimer >= this.nextBlinkTime && !this.isBlinking) {
    this.isBlinking = true;
    this.blinkTimer = 0;
    this.nextBlinkTime = 2 + Math.random() * 4;
  }
  if (this.isBlinking) {
    var bp = Math.min(1, this.blinkTimer / 0.1);
    if (bp < 0.5) {
      var s = 1 - bp * 2;
      if (this.eyeL) this.eyeL.scale.y = Math.max(0.05, s);
      if (this.eyeR) this.eyeR.scale.y = Math.max(0.05, s);
    } else {
      var s = (bp - 0.5) * 2;
      if (this.eyeL) this.eyeL.scale.y = Math.max(0.05, s);
      if (this.eyeR) this.eyeR.scale.y = Math.max(0.05, s);
    }
    if (bp >= 1) {
      this.isBlinking = false;
      this.blinkTimer = 0;
      if (this.eyeL) this.eyeL.scale.y = 1;
      if (this.eyeR) this.eyeR.scale.y = 1;
    }
  }
  
  // Eye tracking (pupils follow player)
  if (playerPos && this.eyeL && this.eyeR) {
    var gx = this.group.position.x;
    var gz = this.group.position.z;
    var dx = playerPos.x - gx;
    var dz = playerPos.z - gz;
    var angle = Math.atan2(dx, dz) - this.group.rotation.y;
    var px = Math.sin(angle) * 0.02;
    var pz = Math.cos(angle) * 0.02;
    this.eyeL._pupil.position.x = px;
    this.eyeL._pupil.position.z = 0.03 + pz;
    this.eyeR._pupil.position.x = px;
    this.eyeR._pupil.position.z = 0.03 + pz;
  }
  
  // Knockback decay
  if (Math.abs(this.knockbackVx) > 0.005 || Math.abs(this.knockbackVz) > 0.005) {
    this.group.position.x += this.knockbackVx * dt * 4;
    this.group.position.z += this.knockbackVz * dt * 4;
    this.knockbackVx *= Math.pow(0.05, dt);
    this.knockbackVz *= Math.pow(0.05, dt);
  }
  
  // Squish animation
  if (this.squishTime > 0) {
    this.squishTime -= dt;
  }
  
  // AI
  if (playerPos) {
    var gx = this.group.position.x;
    var gz = this.group.position.z;
    var dx = playerPos.x - gx;
    var dz = playerPos.z - gz;
    var dist = Math.sqrt(dx * dx + dz * dz) + 0.001;
    
    // Rush attack
    if (this.rushActive) {
      this.rushDuration -= dt;
      if (this.rushDuration <= 0) {
        this.rushActive = false;
        this.state = 'chase';
      } else {
        this.group.position.x += this.rushDirX * CRAWLER_CFG.RUSH_SPEED * dt;
        this.group.position.z += this.rushDirZ * CRAWLER_CFG.RUSH_SPEED * dt;
        // Mouth WIDE open during rush - terrifying attack pose with 1.2x max scale
        this.mouthOpen = Math.min(1.2, this.mouthOpen + dt * CRAWLER_CFG.MOUTH_OPEN_SPEED * 2.5);
      }
    } else if (dist < CRAWLER_CFG.AGGRO_RANGE) {
      // Close mouth when not rushing or attacking
      if (this.state !== 'attack') {
        this.mouthOpen = Math.max(0, this.mouthOpen - dt * CRAWLER_CFG.MOUTH_OPEN_SPEED * 0.5);
      }
      
      // Try rush
      if (dist < 8 && dist > 3 && this.rushTimer <= 0) {
        this.rushActive = true;
        this.rushDuration = CRAWLER_CFG.RUSH_DURATION;
        this.rushTimer = CRAWLER_CFG.RUSH_COOLDOWN;
        this.rushDirX = dx / dist;
        this.rushDirZ = dz / dist;
        this.state = 'rush';
      }
      // Flanking behavior
      else if (dist > CRAWLER_CFG.ATTACK_RANGE && dist < 6 && Math.random() < CRAWLER_CFG.FLANK_CHANCE * dt) {
        this.state = 'flank';
        this.flankDir = Math.random() < 0.5 ? 1 : -1;
      }
      // Attack - dramatically open mouth showing teeth
      else if (dist < CRAWLER_CFG.ATTACK_RANGE && this.attackTimer <= 0) {
        this.state = 'attack';
        // Wide open mouth during attack - 1.5x speed for dramatic effect
        this.mouthOpen = Math.min(1.2, this.mouthOpen + dt * CRAWLER_CFG.MOUTH_OPEN_SPEED * 3);
      }
      // Chase
      else if (this.state !== 'flank') {
        this.state = 'chase';
      }
      
      // Movement
      if (this.state === 'chase' && !this.rushActive) {
        var spd = this.speed;
        this.vx += (dx / dist) * spd * dt * 6.0;
        this.vz += (dz / dist) * spd * dt * 6.0;
      } else if (this.state === 'flank' && !this.rushActive) {
        // Move perpendicular to player
        var perpX = -dz / dist * this.flankDir;
        var perpZ = dx / dist * this.flankDir;
        // Also move slightly toward player
        var spd = this.speed * 1.2;
        this.vx += (perpX * 0.7 + dx / dist * 0.3) * spd * dt * 6.0;
        this.vz += (perpZ * 0.7 + dz / dist * 0.3) * spd * dt * 6.0;
        
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = 'chase';
          this.stateTimer = 1.5 + Math.random() * 2;
        }
      }
    }
    
    // Face movement direction
    var moveSpeed = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    if (moveSpeed > 0.1) {
      this.group.rotation.y = Math.atan2(this.vx, this.vz);
    }
    
    // Cap speed
    if (moveSpeed > this.speed * 1.5) {
      this.vx = (this.vx / moveSpeed) * this.speed * 1.5;
      this.vz = (this.vz / moveSpeed) * this.speed * 1.5;
    }
  }
  
  // Apply velocity
  if (!this.rushActive) {
    this.group.position.x += this.vx * dt;
    this.group.position.z += this.vz * dt;
  }
  
  // Friction
  this.vx *= Math.max(0, 1 - dt * 4.0);
  this.vz *= Math.max(0, 1 - dt * 4.0);
  
  this.velocity.set(this.vx, 0, this.vz);
  
  // Undulating body segments
  this.undulatePhase += dt * CRAWLER_CFG.UNDULATE_SPEED;
  var headWorldX = this.group.position.x;
  var headWorldZ = this.group.position.z;
  
  for (var i = 0; i < this.segments.length; i++) {
    // Each segment follows the one before it with delay
    var target;
    if (i === 0) {
      target = this.headMesh.position.clone();
      target.z -= CRAWLER_CFG.SEGMENT_GAP;
    } else {
      target = this.segments[i - 1].position.clone();
      target.z -= CRAWLER_CFG.SEGMENT_GAP;
    }
    
    // Smooth follow
    this.segments[i].position.x += (target.x - this.segments[i].position.x) * dt * 8;
    this.segments[i].position.z += (target.z - this.segments[i].position.z) * dt * 8;
    
    // Vertical undulation (wave effect)
    var wave = Math.sin(this.undulatePhase - i * 0.8) * CRAWLER_CFG.UNDULATE_AMP;
    this.segments[i].position.y = CRAWLER_CFG.SEGMENT_RADIUS * 0.5 + wave;
    
    // Horizontal swaying
    var sway = Math.sin(this.undulatePhase * 0.7 - i * 1.2) * 0.05;
    this.segments[i].position.x += sway;
  }
  
  // Mouth animation
  if (this.mouthGroup) {
    this.mouthGroup.visible = this.mouthOpen > 0.05;
    if (this.mouthOpen > 0.05) {
      this.mouthGroup.scale.setScalar(this.mouthOpen);
      // Hide eyes when mouth is very open (terrifying transformation)
      if (this.eyeL) this.eyeL.visible = this.mouthOpen < 0.7;
      if (this.eyeR) this.eyeR.visible = this.mouthOpen < 0.7;
    } else {
      if (this.eyeL && !this.isBlinking) this.eyeL.visible = true;
      if (this.eyeR && !this.isBlinking) this.eyeR.visible = true;
    }
  }
  
  // Clamp to arena (uses global ARENA_RADIUS if available, else 80)
  var AR = (typeof ARENA_RADIUS !== 'undefined') ? ARENA_RADIUS : 80;
  this.group.position.x = Math.max(-AR, Math.min(AR, this.group.position.x));
  this.group.position.z = Math.max(-AR, Math.min(AR, this.group.position.z));
};

// ── Cleanup on death ──────────────────────────────
CrawlerEnemy.prototype._cleanup = function() {
  this.alive = false;
  this.active = false;
  this._deathSlideVX = 0;
  this._deathSlideVZ = 0;
  if (this.group) this.group.visible = false;
};

// ════════════════════════════════════════════════
//  CRAWLER POOL
// ════════════════════════════════════════════════
var CrawlerPool = {
  _pool: [],
  _ready: false,
  _scene: null,
  
  init: function(scene, count) {
    this._scene = scene;
    count = count || CRAWLER_CFG.POOL_SIZE;
    this._pool = [];
    for (var i = 0; i < count; i++) {
      var c = new CrawlerEnemy();
      c._buildMesh(scene);
      this._pool.push(c);
    }
    this._ready = true;
    console.log('[CrawlerPool] ✓ Initialized with ' + count + ' crawlers');
  },
  
  spawn: function(x, z, waveLevel) {
    if (!this._ready) return null;
    var c = null;
    for (var i = 0; i < this._pool.length; i++) {
      if (!this._pool[i].active) {
        c = this._pool[i];
        break;
      }
    }
    if (!c) return null;
    c.spawn(x, z, waveLevel);
    return c;
  },
  
  update: function(dt, playerPos) {
    if (!this._ready) return;
    for (var i = 0; i < this._pool.length; i++) {
      if (this._pool[i].active) {
        this._pool[i].update(dt, playerPos);
      }
    }
  },
  
  getActive: function() {
    var result = [];
    for (var i = 0; i < this._pool.length; i++) {
      if (this._pool[i].active && this._pool[i].alive && !this._pool[i].dying) {
        result.push(this._pool[i]);
      }
    }
    return result;
  },
  
  getPool: function() {
    return this._pool;
  },
  
  reset: function() {
    for (var i = 0; i < this._pool.length; i++) {
      this._pool[i]._cleanup();
    }
  }
};

// Expose globally
global.CrawlerPool = CrawlerPool;
global.CrawlerEnemy = CrawlerEnemy;
global.CRAWLER_CFG = CRAWLER_CFG;

console.log('[CrawlerEnemy] ✓ Crawler enemy system loaded');

})(window);
