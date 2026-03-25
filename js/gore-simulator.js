/* ═══════════════════════════════════════════════════════════════════════════
 *  GoreSim  —  Gore Simulation Layer for Water Drop Survivor
 *  Works alongside BloodV2 (particle engine).
 *  Handles flesh chunks, organ-based hit reactions, kill explosions,
 *  and death descriptions.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── constants ──────────────────────────────────────────────────────── */
  var MAX_BLOOD_DROPS    = 800;
  var MAX_DECALS         = 250;
  var MAX_WOUNDS         = 12;
  var MAX_MIST_PARTICLES = 500;
  var MAX_CHUNKS         = 80;
  var MAX_STREAMS        = 25;
  var GRAVITY            = -9.8;
  var BLOOD_VISCOSITY    = 0.72;
  var SLIME_VISCOSITY    = 0.55;
  var DRIP_INTERVAL      = 0.18;
  var PUMP_INTERVAL      = 0.08;
  var DECAL_FADE_TIME    = 40.0;
  var GROUND_Y           = 0.02;

  /* ── enemy gore colour palettes ─────────────────────────────────────── */
  var ENEMY_GORE_COLORS = {
    slime:         { chunk: 0x1adb4e, blood: 0x0d8c2e, body: 0x33cc44 },
    bug:           { chunk: 0xb8e000, blood: 0x6a8000, body: 0xeeff00 },
    human:         { chunk: 0xcc0a00, blood: 0x7a0000, body: 0xff8866 },
    alien:         { chunk: 0x8800ee, blood: 0x3d0077, body: 0xcc33ff },
    robot:         { chunk: 0x6699ff, blood: 0x223388, body: 0xccddff },
    crawler:       { chunk: 0x8b3a1a, blood: 0x551500, body: 0xcc5522 },
    leaping_slime: { chunk: 0x00ccff, blood: 0x0077aa, body: 0x00ffff },
    default:       { chunk: 0xcc0a00, blood: 0x7a0000, body: 0xff8866 }
  };

  /* ── anatomy definitions ───────────────────────────────────────────── */
  var SLIME_ANATOMY = {
    membrane:  { hp: 120, maxHp: 120, yRange: [-1.0, 1.0],  color: 0x33cc44, deathReaction: 'membrane_burst', bleedRate: 0.30 },
    brain:     { hp: 30,  maxHp: 30,  yRange: [0.65, 1.0],  color: 0xaaffaa, deathReaction: 'brain_death',    bleedRate: 0.20 },
    heart:     { hp: 40,  maxHp: 40,  yRange: [0.20, 0.65], color: 0xff3333, deathReaction: 'heart_death',    bleedRate: 1.20, pumpBlood: true },
    guts:      { hp: 70,  maxHp: 70,  yRange: [-0.25, 0.20],color: 0x88ff55, deathReaction: 'gut_death',      bleedRate: 0.65 },
    coreFluid: { hp: 90,  maxHp: 90,  yRange: [-1.0, -0.25],color: 0x00ff88, deathReaction: 'deflate_death',  bleedRate: 0.80 }
  };

  var CRAWLER_ANATOMY = {
    head:    { hp: 30,  maxHp: 30,  yRange: [0.65, 1.0],  color: 0x994422, deathReaction: 'head_burst',     bleedRate: 0.20 },
    thorax:  { hp: 40,  maxHp: 40,  yRange: [0.20, 0.65], color: 0xcc6633, deathReaction: 'thorax_rupture', bleedRate: 1.20, pumpBlood: true },
    abdomen: { hp: 70,  maxHp: 70,  yRange: [-0.25, 0.20],color: 0xbb7744, deathReaction: 'abdomen_burst',  bleedRate: 0.65 },
    tail:    { hp: 90,  maxHp: 90,  yRange: [-1.0, -0.25],color: 0x885522, deathReaction: 'tail_sever',     bleedRate: 0.80 }
  };

  /* ── weapon gore profiles (all 17) ─────────────────────────────────── */
  var WEAPON_GORE = {
    pistol: {
      woundRadius: 0.040, penetration: 0.42, exitWound: true, exitScale: 2.0,
      bloodVolume: 1.0, bloodVelocity: { min: 4.0, max: 9.0 }, mistDensity: 7,
      chunkChance: 0.0, chunkCount: { min: 0, max: 0 }, pushForce: 0.40, organDmg: 20,
      pumpBlood: true, killStyle: 'penetration',
      description: '9mm round punches clean entry hole, exits with twice the mess.'
    },
    revolver: {
      woundRadius: 0.065, penetration: 0.68, exitWound: true, exitScale: 2.8,
      bloodVolume: 2.0, bloodVelocity: { min: 6.0, max: 14.0 }, mistDensity: 12,
      chunkChance: 0.10, chunkCount: { min: 1, max: 2 }, pushForce: 1.0, organDmg: 32,
      pumpBlood: true, shockwave: true, shockRadius: 1.0, killStyle: 'penetration',
      description: 'Heavy magnum round \u2014 hydrostatic shock turns insides to jelly.'
    },
    shotgun: {
      woundRadius: 0.28, penetration: 0.20, exitWound: false, exitScale: 1.0,
      bloodVolume: 5.0, bloodVelocity: { min: 8.0, max: 22.0 }, mistDensity: 38,
      chunkChance: 0.90, chunkCount: { min: 5, max: 12 }, pushForce: 4.5, organDmg: 65,
      pelletCount: 9, pelletAngle: 30, pumpBlood: true, killStyle: 'devastation',
      description: 'Nine pellets shred a fist-sized cavity. Nothing survives close range.'
    },
    smg: {
      woundRadius: 0.030, penetration: 0.40, exitWound: true, exitScale: 1.5,
      bloodVolume: 0.8, bloodVelocity: { min: 3.5, max: 8.0 }, mistDensity: 6,
      chunkChance: 0.0, chunkCount: { min: 0, max: 0 }, pushForce: 0.22, organDmg: 14,
      pumpBlood: true, killStyle: 'perforation',
      description: 'Small-caliber rapid fire \u2014 swiss-cheeses the target with holes.'
    },
    sniper: {
      woundRadius: 0.018, penetration: 1.0, exitWound: true, exitScale: 0.90,
      bloodVolume: 3.0, bloodVelocity: { min: 12.0, max: 32.0 }, mistDensity: 25,
      chunkChance: 0.22, chunkCount: { min: 1, max: 3 }, pushForce: 2.5, organDmg: 90,
      supersonicCavity: true, cavityRadius: 2.6, pumpBlood: true, killStyle: 'supersonic',
      description: 'Supersonic round \u2014 sonic cavity tears a path three times the bullet diameter.'
    },
    minigun: {
      woundRadius: 0.025, penetration: 0.35, exitWound: true, exitScale: 1.3,
      bloodVolume: 0.6, bloodVelocity: { min: 3.5, max: 7.0 }, mistDensity: 5,
      chunkChance: 0.02, chunkCount: { min: 0, max: 1 }, pushForce: 0.20, organDmg: 11,
      pumpBlood: true, killStyle: 'saturation',
      description: 'Saturation fire \u2014 hundreds of small holes add up to total destruction.'
    },
    grenade: {
      woundRadius: 0.60, penetration: 0.88, exitWound: false, exitScale: 1.0,
      bloodVolume: 8.0, bloodVelocity: { min: 16.0, max: 40.0 }, mistDensity: 60,
      chunkChance: 1.0, chunkCount: { min: 10, max: 20 }, pushForce: 25.0, organDmg: 220,
      isExplosive: true, blastRadius: 4.0, killStyle: 'explosion',
      description: 'Overpressure liquefies organs. Shrapnel does the rest.'
    },
    rocket: {
      woundRadius: 1.00, penetration: 1.0, exitWound: false, exitScale: 1.0,
      bloodVolume: 15.0, bloodVelocity: { min: 25.0, max: 60.0 }, mistDensity: 120,
      chunkChance: 1.0, chunkCount: { min: 18, max: 35 }, pushForce: 60.0, organDmg: 9999,
      isExplosive: true, blastRadius: 7.0, killStyle: 'vaporize',
      description: 'Direct hit vaporizes the target. Only a red mist remains.'
    },
    laser: {
      woundRadius: 0.016, penetration: 1.0, exitWound: true, exitScale: 0.65,
      bloodVolume: 0.2, bloodVelocity: { min: 0.2, max: 1.0 }, mistDensity: 0,
      chunkChance: 0.0, chunkCount: { min: 0, max: 0 }, pushForce: 0.04, organDmg: 50,
      cauterizes: true, charEffect: true, smokeCount: 14, pumpBlood: false, killStyle: 'cauterize',
      description: 'Coherent light burns through tissue. Wound self-seals \u2014 minimal blood.'
    },
    plasma: {
      woundRadius: 0.15, penetration: 0.72, exitWound: false, exitScale: 1.0,
      bloodVolume: 1.5, bloodVelocity: { min: 5.5, max: 15.0 }, mistDensity: 18,
      chunkChance: 0.38, chunkCount: { min: 2, max: 6 }, pushForce: 3.0, organDmg: 68,
      charEffect: true, pumpBlood: true, killStyle: 'melt',
      description: 'Superheated plasma melts tissue on contact. Boiling blood erupts.'
    },
    knife: {
      woundRadius: 0.020, penetration: 0.94, exitWound: false, exitScale: 1.0,
      bloodVolume: 1.2, bloodVelocity: { min: 0.4, max: 2.0 }, mistDensity: 0,
      chunkChance: 0.0, chunkCount: { min: 0, max: 0 }, pushForce: 0.07, organDmg: 38,
      isSlashing: true, slashLength: 0.40, pumpBlood: true, killStyle: 'slash',
      description: 'Clean stab. Blood wells up slowly, then the arterial pump kicks in.'
    },
    sword: {
      woundRadius: 0.038, penetration: 0.85, exitWound: false, exitScale: 1.0,
      bloodVolume: 3.0, bloodVelocity: { min: 0.6, max: 3.5 }, mistDensity: 3,
      chunkChance: 0.12, chunkCount: { min: 1, max: 2 }, pushForce: 1.0, organDmg: 55,
      isSlashing: true, slashLength: 0.70, pumpBlood: true, killStyle: 'sever',
      description: 'Deep cut \u2014 may sever limb. Arterial spray arcs two meters.'
    },
    axe: {
      woundRadius: 0.085, penetration: 0.96, exitWound: false, exitScale: 1.0,
      bloodVolume: 4.0, bloodVelocity: { min: 1.2, max: 5.0 }, mistDensity: 5,
      chunkChance: 0.45, chunkCount: { min: 2, max: 4 }, pushForce: 2.5, organDmg: 70,
      isSlashing: true, slashLength: 0.55, pumpBlood: true, killStyle: 'cleave',
      description: 'Splitting force cleaves through bone. Chunks fly on impact.'
    },
    flame: {
      woundRadius: 0.18, penetration: 0.18, exitWound: false, exitScale: 1.0,
      bloodVolume: 0.0, bloodVelocity: { min: 0, max: 0 }, mistDensity: 0,
      chunkChance: 0.0, chunkCount: { min: 0, max: 0 }, pushForce: 0.6, organDmg: 28,
      cauterizes: true, charEffect: true, burnsEnemy: true, killStyle: 'combust',
      description: 'Fire chars the surface. No blood \u2014 wounds are instantly cauterized.'
    },
    ice: {
      woundRadius: 0.065, penetration: 0.52, exitWound: false, exitScale: 1.0,
      bloodVolume: 0.8, bloodVelocity: { min: 0.6, max: 2.5 }, mistDensity: 4,
      chunkChance: 0.0, chunkCount: { min: 0, max: 0 }, pushForce: 0.35, organDmg: 30,
      freezesBlood: true, killStyle: 'shatter',
      description: 'Blood crystallizes on contact. Kill shatters the frozen body.'
    },
    lightning: {
      woundRadius: 0.028, penetration: 1.0, exitWound: true, exitScale: 1.0,
      bloodVolume: 0.5, bloodVelocity: { min: 1.5, max: 5.0 }, mistDensity: 4,
      chunkChance: 0.06, chunkCount: { min: 0, max: 1 }, pushForce: 3.5, organDmg: 45,
      electricEffect: true, killStyle: 'electrocute',
      description: 'Lightning arcs through tissue. Water in cells flash-boils.'
    },
    knife_takedown: {
      woundRadius: 0.022, penetration: 0.96, exitWound: false, exitScale: 1.0,
      bloodVolume: 1.5, bloodVelocity: { min: 0.2, max: 0.9 }, mistDensity: 0,
      chunkChance: 0.0, chunkCount: { min: 0, max: 0 }, pushForce: 0.04, organDmg: 44,
      isSlashing: true, slashLength: 0.22, isTakedown: true, pumpBlood: true, killStyle: 'execution',
      description: 'Execution-style stab. Slow, deliberate, fatal.'
    }
  };

  /* ── death description tables ──────────────────────────────────────── */
  var ORGAN_DESCRIPTIONS = {
    membrane:  'Outer membrane',
    brain:     'Central neural cluster',
    heart:     'Primary circulatory pump',
    guts:      'Digestive cavity',
    coreFluid: 'Pressurised core fluid reservoir',
    head:      'Cranial segment',
    thorax:    'Thoracic cavity',
    abdomen:   'Abdominal segment',
    tail:      'Tail segment'
  };

  var DEATH_STRINGS = {
    membrane_burst: 'The membrane ruptures \u2014 contents spray outward in a green torrent.',
    brain_death:    'Neural cluster destroyed. The body drops instantly, twitching.',
    heart_death:    'Heart obliterated \u2014 arterial pressure drops to zero. Blood geysers from every wound.',
    gut_death:      'Digestive sac bursts. Caustic fluids dissolve surrounding tissue.',
    deflate_death:  'Core fluid evacuates. The body crumples like a deflating balloon.',
    head_burst:     'The head bursts open. Ichor sprays in a wide arc.',
    thorax_rupture: 'Thorax splits \u2014 internal organs spill out in a steaming pile.',
    abdomen_burst:  'Abdomen detonates. Viscera scatter across the ground.',
    tail_sever:     'Tail severs at the base. The stump sprays dark fluid rhythmically.'
  };

  /* ── scratch vectors (zero allocations in hot path) ────────────────── */
  var _v1 = null;
  var _v2 = null;
  var _v3 = null;
  var _v4 = null;
  var _col = null;
  var _mat4 = null;

  /* ══════════════════════════════════════════════════════════════════════
   *  BloodDrop (pooled)
   * ══════════════════════════════════════════════════════════════════════ */
  function BloodDrop(mesh) {
    this.mesh      = mesh;
    this.px        = 0; this.py = 0; this.pz = 0;
    this.vx        = 0; this.vy = 0; this.vz = 0;
    this.life      = 0;
    this.maxLife   = 0;
    this.active    = false;
    this.settled   = false;
    this.bounced   = false;
    this.viscosity = BLOOD_VISCOSITY;
    this.radius    = 0.02;
    this.color     = 0x7a0000;
  }

  BloodDrop.prototype.activate = function (x, y, z, vx, vy, vz, life, color, viscosity) {
    this.px = x;  this.py = y;  this.pz = z;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.life      = life;
    this.maxLife   = life;
    this.active    = true;
    this.settled   = false;
    this.bounced   = false;
    this.viscosity = viscosity !== undefined ? viscosity : BLOOD_VISCOSITY;
    this.color     = color !== undefined ? color : 0x7a0000;
    this.radius    = 0.015 + Math.random() * 0.015;

    this.mesh.visible = true;
    this.mesh.scale.setScalar(this.radius * 2);
    this.mesh.material.color.setHex(this.color);
    this.mesh.position.set(x, y, z);
  };

  BloodDrop.prototype.deactivate = function () {
    this.active       = false;
    this.mesh.visible = false;
  };

  BloodDrop.prototype.update = function (dt) {
    if (!this.active) return false;

    this.life -= dt;
    if (this.life <= 0) { this.deactivate(); return true; }

    if (this.settled) return false;

    // viscosity drag
    var drag = 1.0 - this.viscosity * dt * 3.0;
    if (drag < 0) drag = 0;
    this.vx *= drag;
    this.vy *= drag;
    this.vz *= drag;

    // gravity
    this.vy += GRAVITY * dt;

    // integrate
    this.px += this.vx * dt;
    this.py += this.vy * dt;
    this.pz += this.vz * dt;

    // ground collision
    if (this.py <= GROUND_Y) {
      this.py = GROUND_Y;
      if (!this.bounced) {
        this.bounced = true;
        _trySpawnDecal(this.px, this.pz, this.radius * 3.0, this.color);
        this.vy = -this.vy * 0.25;
        this.vx *= 0.5;
        this.vz *= 0.5;
      } else {
        this.vx = 0; this.vy = 0; this.vz = 0;
        this.settled = true;
      }
    }

    this.mesh.position.set(this.px, this.py, this.pz);
    return false;
  };

  /* ══════════════════════════════════════════════════════════════════════
   *  FleshChunk (pooled — THREE.Mesh with DodecahedronGeometry)
   * ══════════════════════════════════════════════════════════════════════ */
  var _chunkGeo = null;

  function FleshChunk(mesh) {
    this.mesh    = mesh;
    this.px = 0; this.py = 0; this.pz = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.spinX = 0; this.spinY = 0; this.spinZ = 0;
    this.life    = 0;
    this.active  = false;
    this.scale   = 0.06;
    this.bounces = 0;
  }

  FleshChunk.prototype.activate = function (x, y, z, vx, vy, vz, color, scale) {
    this.px = x;  this.py = y;  this.pz = z;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.spinX = (Math.random() - 0.5) * 12;
    this.spinY = (Math.random() - 0.5) * 12;
    this.spinZ = (Math.random() - 0.5) * 12;
    this.life    = 5.0 + Math.random() * 5.0;
    this.active  = true;
    this.bounces = 0;
    this.scale   = scale || (0.04 + Math.random() * 0.06);

    this.mesh.visible = true;
    this.mesh.scale.setScalar(this.scale);
    this.mesh.material.color.setHex(color);
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );
  };

  FleshChunk.prototype.deactivate = function () {
    this.active       = false;
    this.mesh.visible = false;
  };

  FleshChunk.prototype.update = function (dt) {
    if (!this.active) return;

    this.life -= dt;
    if (this.life <= 0) { this.deactivate(); return; }

    this.vy += GRAVITY * dt;

    var drag = 1.0 - 0.4 * dt;
    if (drag < 0) drag = 0;
    this.vx *= drag;
    this.vz *= drag;

    this.px += this.vx * dt;
    this.py += this.vy * dt;
    this.pz += this.vz * dt;

    this.mesh.rotation.x += this.spinX * dt;
    this.mesh.rotation.y += this.spinY * dt;
    this.mesh.rotation.z += this.spinZ * dt;

    if (this.py <= GROUND_Y + this.scale * 0.5) {
      this.py = GROUND_Y + this.scale * 0.5;
      if (this.bounces < 3) {
        this.bounces++;
        this.vy = -this.vy * 0.3;
        this.vx *= 0.6;
        this.vz *= 0.6;
        this.spinX *= 0.5;
        this.spinY *= 0.5;
        this.spinZ *= 0.5;
        _trySpawnDecal(this.px, this.pz, this.scale * 2.5, this.mesh.material.color.getHex());
      } else {
        this.vx = 0; this.vy = 0; this.vz = 0;
        this.spinX = 0; this.spinY = 0; this.spinZ = 0;
      }
    }

    this.mesh.position.set(this.px, this.py, this.pz);
  };

  /* ══════════════════════════════════════════════════════════════════════
   *  MistParticle (pooled)
   * ══════════════════════════════════════════════════════════════════════ */
  function MistParticle(mesh) {
    this.mesh    = mesh;
    this.px = 0; this.py = 0; this.pz = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.life    = 0;
    this.maxLife = 0;
    this.active  = false;
  }

  MistParticle.prototype.activate = function (x, y, z, vx, vy, vz, life, color) {
    this.px = x;  this.py = y;  this.pz = z;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.life    = life;
    this.maxLife = life;
    this.active  = true;
    this.mesh.visible = true;
    this.mesh.material.color.setHex(color);
    this.mesh.material.opacity = 0.6;
    this.mesh.position.set(x, y, z);
    this.mesh.scale.setScalar(0.04 + Math.random() * 0.04);
  };

  MistParticle.prototype.deactivate = function () {
    this.active       = false;
    this.mesh.visible = false;
  };

  MistParticle.prototype.update = function (dt) {
    if (!this.active) return;

    this.life -= dt;
    if (this.life <= 0) { this.deactivate(); return; }

    var drag = 1.0 - 2.5 * dt;
    if (drag < 0) drag = 0;
    this.vx *= drag;
    this.vy *= drag;
    this.vz *= drag;
    this.vy += GRAVITY * 0.05 * dt;

    this.px += this.vx * dt;
    this.py += this.vy * dt;
    this.pz += this.vz * dt;
    if (this.py < GROUND_Y) this.py = GROUND_Y;

    var t = this.life / this.maxLife;
    this.mesh.material.opacity = t * 0.6;
    this.mesh.scale.setScalar((0.04 + Math.random() * 0.02) * (2.0 - t));
    this.mesh.position.set(this.px, this.py, this.pz);
  };

  /* ══════════════════════════════════════════════════════════════════════
   *  ArterialStream
   * ══════════════════════════════════════════════════════════════════════ */
  function ArterialStream() {
    this.active   = false;
    this.enemy    = null;
    this.organ    = null;
    this.offsetY  = 0;
    this.color    = 0x7a0000;
    this.timer    = 0;
    this.duration = 0;
    this.rate     = 0;
  }

  ArterialStream.prototype.start = function (enemy, organ, color, rate, duration) {
    this.active   = true;
    this.enemy    = enemy;
    this.organ    = organ;
    this.color    = color;
    this.timer    = 0;
    this.rate     = rate || PUMP_INTERVAL;
    this.duration = duration || (2.0 + Math.random() * 3.0);
    this.offsetY  = organ ? (organ.yRange[0] + organ.yRange[1]) * 0.5 : 0.5;
  };

  ArterialStream.prototype.stop = function () {
    this.active = false;
    this.enemy  = null;
    this.organ  = null;
  };

  ArterialStream.prototype.update = function (dt) {
    if (!this.active) return;
    this.duration -= dt;
    if (this.duration <= 0) { this.stop(); return; }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.rate;
      var epos = this.enemy && this.enemy.mesh ? this.enemy.mesh.position : null;
      if (!epos) { this.stop(); return; }

      var bx = epos.x;
      var by = epos.y + this.offsetY;
      var bz = epos.z;
      var angle = Math.random() * Math.PI * 2;
      var speed = 3.0 + Math.random() * 5.0;
      for (var i = 0; i < 4; i++) {
        var a = angle + (Math.random() - 0.5) * 0.6;
        _activateBloodDrop(
          bx + Math.cos(a) * 0.05,
          by + Math.random() * 0.1,
          bz + Math.sin(a) * 0.05,
          Math.cos(a) * speed * (0.7 + Math.random() * 0.6),
          speed * 0.6 + Math.random() * speed * 0.4,
          Math.sin(a) * speed * (0.7 + Math.random() * 0.6),
          1.0 + Math.random() * 1.5,
          this.color,
          BLOOD_VISCOSITY
        );
      }
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
   *  EnemyGoreState
   * ══════════════════════════════════════════════════════════════════════ */
  function EnemyGoreState(enemy) {
    this.enemy    = enemy;
    this.type     = (enemy && enemy.enemyType) ? enemy.enemyType : 'default';
    this.organs   = {};
    this.wounds   = [];
    this.killedBy = null;

    var anat = _getAnatomyFor(this.type);
    var keys = Object.keys(anat);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var src = anat[k];
      this.organs[k] = {
        name: k, hp: src.hp, maxHp: src.maxHp,
        yRange: [src.yRange[0], src.yRange[1]],
        color: src.color, deathReaction: src.deathReaction,
        bleedRate: src.bleedRate, pumpBlood: !!src.pumpBlood
      };
    }
  }

  EnemyGoreState.prototype.getOrganAt = function (localY) {
    var keys = Object.keys(this.organs);
    var best = null;
    for (var i = 0; i < keys.length; i++) {
      var o = this.organs[keys[i]];
      if (localY >= o.yRange[0] && localY <= o.yRange[1]) {
        if (!best || (o.yRange[1] - o.yRange[0]) < (best.yRange[1] - best.yRange[0])) {
          best = o;
        }
      }
    }
    return best || this.organs[keys[0]];
  };

  EnemyGoreState.prototype.damageOrgan = function (organ, dmg) {
    if (!organ) return false;
    var wasDead = organ.hp <= 0;
    organ.hp -= dmg;
    if (organ.hp < 0) organ.hp = 0;
    return (!wasDead && organ.hp <= 0);
  };

  EnemyGoreState.prototype.addWound = function (wound) {
    if (this.wounds.length >= MAX_WOUNDS) {
      this.wounds.shift();
    }
    this.wounds.push(wound);
  };

  EnemyGoreState.prototype.update = function (dt) {
    for (var i = this.wounds.length - 1; i >= 0; i--) {
      var w = this.wounds[i];
      w.life -= dt;
      if (w.life <= 0) { this.wounds.splice(i, 1); continue; }
      w.dripTimer -= dt;
      if (w.dripTimer <= 0) {
        w.dripTimer = DRIP_INTERVAL;
        var epos = this.enemy && this.enemy.mesh ? this.enemy.mesh.position : null;
        if (epos) {
          _activateBloodDrop(
            epos.x + w.localX + (Math.random() - 0.5) * 0.02,
            epos.y + w.localY,
            epos.z + w.localZ + (Math.random() - 0.5) * 0.02,
            (Math.random() - 0.5) * 0.3,
            -0.5 - Math.random() * 0.3,
            (Math.random() - 0.5) * 0.3,
            0.8 + Math.random() * 0.6,
            w.color,
            w.viscosity
          );
        }
      }
    }
  };

  EnemyGoreState.prototype.cleanup = function () {
    this.wounds.length = 0;
    this.enemy = null;
  };

  /* ══════════════════════════════════════════════════════════════════════
   *  Module-level pools & state
   * ══════════════════════════════════════════════════════════════════════ */
  var _scene        = null;
  var _camera       = null;
  var _drops        = [];
  var _dropIdx      = 0;
  var _chunks       = [];
  var _chunkIdx     = 0;
  var _mist         = [];
  var _mistIdx      = 0;
  var _decals       = [];
  var _decalIdx     = 0;
  var _decalBirths  = [];
  var _streams      = [];
  var _enemyGoreMap = null;
  var _initialized  = false;
  var _time         = 0;

  /* ── helpers ────────────────────────────────────────────────────────── */
  function _rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function _randInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function _getAnatomyFor(type) {
    if (type === 'crawler') return CRAWLER_ANATOMY;
    return SLIME_ANATOMY;
  }

  function _resolveBloodColor(enemyType) {
    var gc = ENEMY_GORE_COLORS[enemyType] || ENEMY_GORE_COLORS['default'];
    if (window.BloodV2 && window.BloodV2.ENEMY_BLOOD) {
      var bv = window.BloodV2.ENEMY_BLOOD[enemyType];
      if (bv) return bv.dark !== undefined ? bv.dark : gc.blood;
    }
    return gc.blood;
  }

  function _resolveChunkColor(enemyType) {
    var gc = ENEMY_GORE_COLORS[enemyType] || ENEMY_GORE_COLORS['default'];
    return gc.chunk;
  }

  function _getViscosity(enemyType) {
    if (enemyType === 'slime' || enemyType === 'leaping_slime') return SLIME_VISCOSITY;
    return BLOOD_VISCOSITY;
  }

  /* ── pool activation helpers (zero alloc) ──────────────────────────── */
  function _activateBloodDrop(x, y, z, vx, vy, vz, life, color, viscosity) {
    var tries = MAX_BLOOD_DROPS;
    while (tries-- > 0) {
      var d = _drops[_dropIdx];
      _dropIdx = (_dropIdx + 1) % MAX_BLOOD_DROPS;
      if (!d.active) {
        d.activate(x, y, z, vx, vy, vz, life, color, viscosity);
        return d;
      }
    }
    var d2 = _drops[_dropIdx];
    _dropIdx = (_dropIdx + 1) % MAX_BLOOD_DROPS;
    d2.activate(x, y, z, vx, vy, vz, life, color, viscosity);
    return d2;
  }

  function _activateMist(x, y, z, vx, vy, vz, life, color) {
    var tries = MAX_MIST_PARTICLES;
    while (tries-- > 0) {
      var m = _mist[_mistIdx];
      _mistIdx = (_mistIdx + 1) % MAX_MIST_PARTICLES;
      if (!m.active) {
        m.activate(x, y, z, vx, vy, vz, life, color);
        return m;
      }
    }
    var m2 = _mist[_mistIdx];
    _mistIdx = (_mistIdx + 1) % MAX_MIST_PARTICLES;
    m2.activate(x, y, z, vx, vy, vz, life, color);
    return m2;
  }

  function _activateChunk(x, y, z, vx, vy, vz, color, scale) {
    var tries = MAX_CHUNKS;
    while (tries-- > 0) {
      var c = _chunks[_chunkIdx];
      _chunkIdx = (_chunkIdx + 1) % MAX_CHUNKS;
      if (!c.active) {
        c.activate(x, y, z, vx, vy, vz, color, scale);
        return c;
      }
    }
    var c2 = _chunks[_chunkIdx];
    _chunkIdx = (_chunkIdx + 1) % MAX_CHUNKS;
    c2.activate(x, y, z, vx, vy, vz, color, scale);
    return c2;
  }

  function _trySpawnDecal(x, z, radius, color) {
    var decal = _decals[_decalIdx];
    if (!decal) return;
    decal.visible = true;
    decal.position.set(x, GROUND_Y, z);
    var s = radius * (0.8 + Math.random() * 0.5);
    decal.scale.set(s, s, 1);
    decal.rotation.z = Math.random() * Math.PI * 2;
    decal.material.color.setHex(color);
    decal.material.opacity = 0.85;
    _decalBirths[_decalIdx] = _time;
    _decalIdx = (_decalIdx + 1) % MAX_DECALS;
  }

  function _getStream() {
    for (var i = 0; i < _streams.length; i++) {
      if (!_streams[i].active) return _streams[i];
    }
    return null;
  }

  function _getOrCreateState(enemy) {
    var id = enemy._goreId;
    if (id === undefined) {
      id = enemy.id !== undefined ? enemy.id : Math.random();
      enemy._goreId = id;
    }
    var state = _enemyGoreMap.get(id);
    if (!state) {
      state = new EnemyGoreState(enemy);
      _enemyGoreMap.set(id, state);
    }
    return state;
  }

  /* ══════════════════════════════════════════════════════════════════════
   *  Spawn helpers
   * ══════════════════════════════════════════════════════════════════════ */
  function _spawnBloodBurst(pos, normal, count, profile, color, viscosity) {
    var velMin = profile.bloodVelocity.min;
    var velMax = profile.bloodVelocity.max;
    for (var i = 0; i < count; i++) {
      var speed = _rand(velMin, velMax);
      var spread = 0.8;
      var nx = (normal ? normal.x : 0) + (Math.random() - 0.5) * spread;
      var ny = (normal ? normal.y : 0.5) + Math.random() * 0.5;
      var nz = (normal ? normal.z : 0) + (Math.random() - 0.5) * spread;
      var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      _activateBloodDrop(
        pos.x + nx * 0.05, pos.y + ny * 0.05, pos.z + nz * 0.05,
        (nx / len) * speed, (ny / len) * speed, (nz / len) * speed,
        0.8 + Math.random() * 1.5,
        color, viscosity
      );
    }
  }

  function _spawnMistCloud(pos, count, color) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 0.5 + Math.random() * 2.0;
      _activateMist(
        pos.x + (Math.random() - 0.5) * 0.1,
        pos.y + Math.random() * 0.15,
        pos.z + (Math.random() - 0.5) * 0.1,
        Math.cos(a) * sp, Math.random() * sp * 0.5, Math.sin(a) * sp,
        0.5 + Math.random() * 0.8,
        color
      );
    }
  }

  function _spawnChunks(pos, count, color, force, enemy) {
    var enemyType = (enemy && enemy.enemyType) ? enemy.enemyType : 'default';
    var cc = _resolveChunkColor(enemyType);
    if (color !== undefined && color !== null) cc = color;

    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var up = 2.0 + Math.random() * force * 0.4;
      var sp = force * (0.3 + Math.random() * 0.7);
      var sc = 0.03 + Math.random() * 0.07;
      _activateChunk(
        pos.x + (Math.random() - 0.5) * 0.15,
        pos.y + Math.random() * 0.1,
        pos.z + (Math.random() - 0.5) * 0.15,
        Math.cos(a) * sp, up, Math.sin(a) * sp,
        cc, sc
      );
    }
  }

  function _spawnDecal(pos, radius, color) {
    _trySpawnDecal(pos.x, pos.z, radius, color);
  }

  /* ══════════════════════════════════════════════════════════════════════
   *  _killExplosion — style-based
   * ══════════════════════════════════════════════════════════════════════ */
  function _killExplosion(pos, profile, killedBy, enemy) {
    var enemyType = (enemy && enemy.enemyType) ? enemy.enemyType : 'default';
    var bloodCol  = _resolveBloodColor(enemyType);
    var chunkCol  = _resolveChunkColor(enemyType);
    var visc      = _getViscosity(enemyType);
    var style     = profile.killStyle || 'penetration';

    switch (style) {
      case 'vaporize':
        _spawnBloodBurst(pos, null, 120, profile, bloodCol, visc);
        _spawnMistCloud(pos, 80, bloodCol);
        _spawnChunks(pos, _randInt(18, 35), chunkCol, 15.0, enemy);
        _spawnDecal(pos, 2.5, bloodCol);
        _spawnDecal(pos, 1.8, chunkCol);
        break;

      case 'explosion':
        _spawnBloodBurst(pos, null, 80, profile, bloodCol, visc);
        _spawnMistCloud(pos, 50, bloodCol);
        _spawnChunks(pos, _randInt(10, 20), chunkCol, 10.0, enemy);
        _spawnDecal(pos, 2.0, bloodCol);
        break;

      case 'devastation':
        _spawnBloodBurst(pos, null, 60, profile, bloodCol, visc);
        _spawnMistCloud(pos, 35, bloodCol);
        _spawnChunks(pos, _randInt(5, 12), chunkCol, 6.0, enemy);
        _spawnDecal(pos, 1.5, bloodCol);
        break;

      case 'supersonic':
        _v1.set(0, 0, 1);
        _spawnBloodBurst(pos, _v1, 50, profile, bloodCol, visc);
        _spawnMistCloud(pos, 25, bloodCol);
        _spawnChunks(pos, _randInt(1, 3), chunkCol, 8.0, enemy);
        _spawnDecal(pos, 1.2, bloodCol);
        break;

      case 'penetration':
        _spawnBloodBurst(pos, null, 30, profile, bloodCol, visc);
        _spawnMistCloud(pos, 10, bloodCol);
        _spawnDecal(pos, 0.6, bloodCol);
        break;

      case 'perforation':
        for (var pf = 0; pf < 6; pf++) {
          _v1.set(
            pos.x + (Math.random() - 0.5) * 0.3,
            pos.y + Math.random() * 0.3,
            pos.z + (Math.random() - 0.5) * 0.3
          );
          _spawnBloodBurst(_v1, null, 8, profile, bloodCol, visc);
        }
        _spawnMistCloud(pos, 12, bloodCol);
        _spawnDecal(pos, 0.8, bloodCol);
        break;

      case 'saturation':
        for (var sf = 0; sf < 10; sf++) {
          _v1.set(
            pos.x + (Math.random() - 0.5) * 0.4,
            pos.y + Math.random() * 0.3,
            pos.z + (Math.random() - 0.5) * 0.4
          );
          _spawnBloodBurst(_v1, null, 5, profile, bloodCol, visc);
        }
        _spawnMistCloud(pos, 15, bloodCol);
        _spawnDecal(pos, 1.0, bloodCol);
        break;

      case 'sever':
      case 'cleave':
      case 'slash':
        _v1.set(1, 0.5, 0).normalize();
        _spawnBloodBurst(pos, _v1, 40, profile, bloodCol, visc);
        _spawnMistCloud(pos, 6, bloodCol);
        if (profile.chunkChance > 0) {
          _spawnChunks(pos, _randInt(profile.chunkCount.min, profile.chunkCount.max), chunkCol, profile.pushForce, enemy);
        }
        _spawnDecal(pos, 0.9, bloodCol);
        break;

      case 'execution':
        _spawnBloodBurst(pos, null, 15, profile, bloodCol, visc);
        _spawnDecal(pos, 0.4, bloodCol);
        break;

      case 'cauterize':
      case 'combust':
        _spawnMistCloud(pos, 20, 0x444444);
        _spawnDecal(pos, 0.3, 0x222222);
        break;

      case 'melt':
        _spawnBloodBurst(pos, null, 35, profile, bloodCol, visc);
        _spawnMistCloud(pos, 20, 0xff6600);
        _spawnChunks(pos, _randInt(2, 6), chunkCol, 3.0, enemy);
        _spawnDecal(pos, 1.0, bloodCol);
        break;

      case 'shatter':
        _spawnChunks(pos, _randInt(12, 25), 0xaaddff, 8.0, enemy);
        _spawnMistCloud(pos, 15, 0xccffff);
        _spawnDecal(pos, 1.5, 0x88bbff);
        break;

      case 'electrocute':
        _spawnBloodBurst(pos, null, 20, profile, bloodCol, visc);
        _spawnMistCloud(pos, 10, 0xffffaa);
        _spawnDecal(pos, 0.7, bloodCol);
        break;

      default:
        _spawnBloodBurst(pos, null, 25, profile, bloodCol, visc);
        _spawnMistCloud(pos, 8, bloodCol);
        _spawnDecal(pos, 0.5, bloodCol);
        break;
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
   *  PUBLIC API
   * ══════════════════════════════════════════════════════════════════════ */
  var GoreSim = {};

  /* ── init ───────────────────────────────────────────────────────────── */
  GoreSim.init = function (scene, camera) {
    if (_initialized) return;
    _initialized = true;
    _scene  = scene;
    _camera = camera;

    if (typeof THREE === 'undefined') {
      console.warn('[GoreSim] THREE.js not found — gore simulation disabled.');
      return;
    }

    _v1   = new THREE.Vector3();
    _v2   = new THREE.Vector3();
    _v3   = new THREE.Vector3();
    _v4   = new THREE.Vector3();
    _col  = new THREE.Color();
    _mat4 = new THREE.Matrix4();

    _enemyGoreMap = new Map();

    // blood drop pool
    var dropGeo = new THREE.SphereGeometry(0.5, 4, 3);
    for (var d = 0; d < MAX_BLOOD_DROPS; d++) {
      var dMat  = new THREE.MeshBasicMaterial({ color: 0x7a0000 });
      var dMesh = new THREE.Mesh(dropGeo, dMat);
      dMesh.visible = false;
      scene.add(dMesh);
      _drops.push(new BloodDrop(dMesh));
    }

    // flesh chunk pool
    _chunkGeo = new THREE.DodecahedronGeometry(0.5, 0);
    for (var c = 0; c < MAX_CHUNKS; c++) {
      var cMat  = new THREE.MeshStandardMaterial({ color: 0xcc0a00, roughness: 0.9, metalness: 0.05 });
      var cMesh = new THREE.Mesh(_chunkGeo, cMat);
      cMesh.visible = false;
      scene.add(cMesh);
      _chunks.push(new FleshChunk(cMesh));
    }

    // decal pool (circle on ground)
    var decGeo = new THREE.CircleGeometry(0.5, 8);
    decGeo.rotateX(-Math.PI * 0.5);
    for (var dc = 0; dc < MAX_DECALS; dc++) {
      var dcMat  = new THREE.MeshBasicMaterial({
        color: 0x7a0000, transparent: true, opacity: 0.85,
        depthWrite: false, side: THREE.DoubleSide
      });
      var dcMesh = new THREE.Mesh(decGeo, dcMat);
      dcMesh.visible = false;
      dcMesh.position.y = GROUND_Y;
      dcMesh.renderOrder = -1;
      scene.add(dcMesh);
      _decals.push(dcMesh);
      _decalBirths.push(0);
    }

    // mist particle pool
    var mistGeo = new THREE.SphereGeometry(0.5, 4, 3);
    for (var mi = 0; mi < MAX_MIST_PARTICLES; mi++) {
      var miMat  = new THREE.MeshBasicMaterial({
        color: 0x7a0000, transparent: true, opacity: 0.6
      });
      var miMesh = new THREE.Mesh(mistGeo, miMat);
      miMesh.visible = false;
      scene.add(miMesh);
      _mist.push(new MistParticle(miMesh));
    }

    // arterial stream pool
    for (var s = 0; s < MAX_STREAMS; s++) {
      _streams.push(new ArterialStream());
    }

    console.log('[GoreSim] Initialised — drops:' + MAX_BLOOD_DROPS +
      ' chunks:' + MAX_CHUNKS + ' decals:' + MAX_DECALS +
      ' mist:' + MAX_MIST_PARTICLES + ' streams:' + MAX_STREAMS);
  };

  /* ── onHit ──────────────────────────────────────────────────────────── */
  GoreSim.onHit = function (enemy, weaponType, hitPoint, hitNormal) {
    if (!_initialized || !_scene) return { organHit: null, organDead: false, wound: null };

    var profile = WEAPON_GORE[weaponType] || WEAPON_GORE.pistol;
    var state   = _getOrCreateState(enemy);
    var eType   = state.type;

    // resolve organ from hit Y position
    var localY = 0;
    if (hitPoint && enemy.mesh) {
      localY = (hitPoint.y - enemy.mesh.position.y);
      var eHeight = enemy.height || 2.0;
      localY = (localY / (eHeight * 0.5));
      if (localY < -1) localY = -1;
      if (localY > 1) localY = 1;
    }

    var organ     = state.getOrganAt(localY);
    var organDead = state.damageOrgan(organ, profile.organDmg);

    var bloodColor = _resolveBloodColor(eType);
    var visc       = _getViscosity(eType);

    var dropCount = Math.round(8 * profile.bloodVolume);

    if (profile.cauterizes) {
      dropCount = Math.max(1, Math.round(dropCount * 0.1));
    }

    var hp = hitPoint || (enemy.mesh ? enemy.mesh.position : _v1.set(0, 0, 0));
    var hn = hitNormal || _v2.set(0, 1, 0);

    _spawnBloodBurst(hp, hn, dropCount, profile, bloodColor, visc);

    if (profile.mistDensity > 0) {
      _spawnMistCloud(hp, profile.mistDensity, bloodColor);
    }

    // exit wound
    if (profile.exitWound && enemy.mesh) {
      _v3.copy(hn).negate().multiplyScalar(0.3);
      _v3.add(hp);
      var exitCount = Math.round(dropCount * profile.exitScale);
      _v4.copy(hn).negate();
      _spawnBloodBurst(_v3, _v4, exitCount, profile, bloodColor, visc);
    }

    // pellet spread (shotgun)
    if (profile.pelletCount) {
      var pellets = profile.pelletCount;
      var angleSpread = (profile.pelletAngle || 30) * (Math.PI / 180);
      for (var p = 0; p < pellets; p++) {
        _v3.set(
          hn.x + (Math.random() - 0.5) * angleSpread,
          hn.y + Math.random() * 0.3,
          hn.z + (Math.random() - 0.5) * angleSpread
        ).normalize();
        _v4.set(
          hp.x + (Math.random() - 0.5) * 0.15,
          hp.y + (Math.random() - 0.5) * 0.15,
          hp.z + (Math.random() - 0.5) * 0.15
        );
        _spawnBloodBurst(_v4, _v3, Math.round(dropCount / pellets) + 1, profile, bloodColor, visc);
      }
    }

    // arterial pump stream
    if (profile.pumpBlood && organ && organ.pumpBlood) {
      var stream = _getStream();
      if (stream) {
        stream.start(enemy, organ, bloodColor, PUMP_INTERVAL, 2.0 + Math.random() * 3.0);
      }
    }

    // explosive radial burst
    if (profile.isExplosive) {
      _spawnBloodBurst(hp, null, Math.round(dropCount * 3), profile, bloodColor, visc);
      _spawnMistCloud(hp, profile.mistDensity * 2, bloodColor);
      var blastChunks = _randInt(profile.chunkCount.min, profile.chunkCount.max);
      if (blastChunks > 0) {
        _spawnChunks(hp, blastChunks, null, profile.pushForce, enemy);
      }
    }

    // wound entry
    var wound = {
      localX: hitPoint ? (hitPoint.x - (enemy.mesh ? enemy.mesh.position.x : 0)) : 0,
      localY: hitPoint ? (hitPoint.y - (enemy.mesh ? enemy.mesh.position.y : 0)) : 0,
      localZ: hitPoint ? (hitPoint.z - (enemy.mesh ? enemy.mesh.position.z : 0)) : 0,
      radius: profile.woundRadius,
      organ: organ ? organ.name : 'unknown',
      life: 4.0 + Math.random() * 3.0,
      dripTimer: 0,
      color: bloodColor,
      viscosity: visc,
      bleedRate: organ ? organ.bleedRate : 0.3
    };
    state.addWound(wound);

    return {
      organHit: organ ? organ.name : null,
      organDead: organDead,
      wound: wound
    };
  };

  /* ── onKill ─────────────────────────────────────────────────────────── */
  GoreSim.onKill = function (enemy, weaponType, projectile) {
    if (!_initialized || !_scene) return;

    var profile = WEAPON_GORE[weaponType] || WEAPON_GORE.pistol;
    var id      = enemy._goreId;
    var state   = id !== undefined ? _enemyGoreMap.get(id) : null;

    // stop all active streams for this enemy
    for (var s = 0; s < _streams.length; s++) {
      if (_streams[s].active && _streams[s].enemy === enemy) {
        _streams[s].stop();
      }
    }

    var pos = (enemy.mesh ? enemy.mesh.position : null) ||
              (projectile && projectile.position ? projectile.position : _v1.set(0, 0.5, 0));

    _killExplosion(pos, profile, state ? state.killedBy : null, enemy);

    if (Math.random() < profile.chunkChance) {
      var chunkN = _randInt(profile.chunkCount.min, profile.chunkCount.max);
      if (chunkN > 0) {
        _spawnChunks(pos, chunkN, null, profile.pushForce, enemy);
      }
    }

    var bloodCol = _resolveBloodColor((enemy && enemy.enemyType) ? enemy.enemyType : 'default');
    _spawnDecal(pos, 0.5 + profile.woundRadius * 3, bloodCol);

    if (state) {
      state.cleanup();
    }
    if (id !== undefined) {
      _enemyGoreMap.delete(id);
    }
  };

  /* ── update ─────────────────────────────────────────────────────────── */
  GoreSim.update = function (dt) {
    if (!_initialized || !_scene) return;
    _time += dt;

    for (var d = 0; d < MAX_BLOOD_DROPS; d++) {
      _drops[d].update(dt);
    }

    for (var c = 0; c < MAX_CHUNKS; c++) {
      _chunks[c].update(dt);
    }

    for (var mi = 0; mi < MAX_MIST_PARTICLES; mi++) {
      _mist[mi].update(dt);
    }

    for (var s = 0; s < MAX_STREAMS; s++) {
      _streams[s].update(dt);
    }

    if (_enemyGoreMap) {
      _enemyGoreMap.forEach(function (state) {
        state.update(dt);
      });
    }

    for (var dc = 0; dc < MAX_DECALS; dc++) {
      if (!_decals[dc].visible) continue;
      var age = _time - _decalBirths[dc];
      if (age > DECAL_FADE_TIME) {
        _decals[dc].visible = false;
      } else if (age > DECAL_FADE_TIME * 0.6) {
        _decals[dc].material.opacity = 0.85 * (1.0 - (age - DECAL_FADE_TIME * 0.6) / (DECAL_FADE_TIME * 0.4));
      }
    }
  };

  /* ── reset ──────────────────────────────────────────────────────────── */
  GoreSim.reset = function () {
    for (var d = 0; d < _drops.length; d++) {
      _drops[d].deactivate();
    }
    _dropIdx = 0;

    for (var c = 0; c < _chunks.length; c++) {
      _chunks[c].deactivate();
    }
    _chunkIdx = 0;

    for (var m = 0; m < _mist.length; m++) {
      _mist[m].deactivate();
    }
    _mistIdx = 0;

    for (var dc = 0; dc < _decals.length; dc++) {
      _decals[dc].visible = false;
    }
    _decalIdx = 0;

    for (var s = 0; s < _streams.length; s++) {
      _streams[s].stop();
    }

    if (_enemyGoreMap) {
      _enemyGoreMap.forEach(function (state) { state.cleanup(); });
      _enemyGoreMap.clear();
    }

    _time = 0;
  };

  /* ── getKillDescription ─────────────────────────────────────────────── */
  GoreSim.getKillDescription = function (weaponType, organ) {
    var profile = WEAPON_GORE[weaponType] || WEAPON_GORE.pistol;
    var weaponDesc = profile.description || 'Unknown weapon effect.';
    var organDesc  = ORGAN_DESCRIPTIONS[organ] || 'Unknown region';
    var deathKey   = null;

    if (SLIME_ANATOMY[organ]) {
      deathKey = SLIME_ANATOMY[organ].deathReaction;
    } else if (CRAWLER_ANATOMY[organ]) {
      deathKey = CRAWLER_ANATOMY[organ].deathReaction;
    }

    var deathDesc = deathKey ? (DEATH_STRINGS[deathKey] || 'Target destroyed.') : 'Target destroyed.';

    return {
      weapon: weaponDesc,
      organ: organDesc,
      death: deathDesc
    };
  };

  /* ── expose data tables ─────────────────────────────────────────────── */
  GoreSim.WEAPON_GORE     = WEAPON_GORE;
  GoreSim.SLIME_ANATOMY   = SLIME_ANATOMY;
  GoreSim.CRAWLER_ANATOMY = CRAWLER_ANATOMY;

  /* ── expose on window ──────────────────────────────────────────────── */
  window.GoreSim = GoreSim;

})();
