// js/astral-dive.js — Astral Dive Minigame
// A high-speed forward-scrolling 3D tube shooter inside the Astral Gateway.
// Uses Three.js (already loaded as window.THREE via js/three.min.js).
// Exposes: window.AstralDive.start()

(function () {
  'use strict';

  /* ================================================================
     CONSTANTS
  ================================================================ */
  var TUNNEL_RADIUS    = 6;
  var TUNNEL_SEGMENTS  = 32;
  var TUNNEL_RINGS     = 80;        // visible ring count
  var RING_SPACING     = 4;
  var SPEED_BASE       = 28;        // units/sec
  var SPEED_MAX        = 80;
  var SPEED_ACCEL      = 0.8;       // per sec
  var AVATAR_RANGE     = 3.6;       // max offset from centre
  var STEER_SPEED      = 7;
  var SHOOT_COOLDOWN   = 0.18;      // seconds
  var PULSE_SPEED      = 60;
  var ENEMY_ROWS       = 4;
  var ENEMY_SPAWN_DIST = 200;
  var COLLECT_RADIUS   = 1.0;
  var NODE_LENGTH      = 600;       // units before "Node complete"
  var LORE_LINES = [
    'Purging weak organic code. Synthesis imminent.',
    'DNA fragment 0x4F2A corrupted. Overwriting...',
    'Human emotion subroutines detected. Deleting.',
    'Neural pathways re-mapped. Compliance enforced.',
    'Soul integrity: 34% — acceptable loss.',
    'Biological noise reduced. Signal clarity: optimal.',
    'Memory fragments catalogued. Origin: suppressed.',
  ];

  /* ================================================================
     STATE
  ================================================================ */
  var _active   = false;
  var _renderer = null;
  var _scene    = null;
  var _camera   = null;
  var _overlay  = null;
  var _canvas   = null;
  var _animId   = null;
  var _lastTime = 0;

  // Avatar
  var _avatar   = null;
  var _avatarX  = 0;
  var _avatarY  = 0;
  var _avatarVX = 0;
  var _avatarVY = 0;

  // Game objects
  var _tunnelRings  = [];
  var _pulses       = [];
  var _enemies      = [];
  var _collectibles = [];
  var _particles    = [];

  // Tunnel scroll
  var _scrollZ      = 0;
  var _speed        = SPEED_BASE;
  var _shootTimer   = 0;

  // Stats
  var _score       = 0;
  var _essence     = 0;
  var _cores       = 0;
  var _nodeProgress= 0;
  var _crashed     = false;
  var _nodeComplete= false;
  var _exitTimer   = 0;
  var _hitFlash    = 0;

  // Lore
  var _loreTimer  = 0;
  var _loreIdx    = 0;
  var _loreEl     = null;

  // Input
  var _keys = {};
  var _touch = { active: false, startX: 0, startY: 0, dx: 0, dy: 0 };
  var _mouse = { active: false, x: 0, y: 0 };

  // Chromatic aberration / warp
  var _warpIntensity = 0;

  /* ================================================================
     COLOUR PALETTE
  ================================================================ */
  var NEON_COLORS = [0x00ffff, 0xff00ff, 0x00ff88, 0xff4400, 0x4444ff, 0xffff00, 0xff0088];

  function _rndNeon() { return NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)]; }

  /* ================================================================
     AUDIO  (Web Audio API — procedural, no asset files)
  ================================================================ */
  var _audioCtx = null;

  function _getAudio() {
    if (!_audioCtx) {
      try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    return _audioCtx;
  }

  function _playTone(freq, type, dur, vol, delay) {
    var ctx = _getAudio(); if (!ctx) return;
    try {
      var osc  = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + (delay || 0));
      gain.gain.setValueAtTime(vol || 0.15, ctx.currentTime + (delay || 0));
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (delay || 0) + dur);
      osc.start(ctx.currentTime + (delay || 0));
      osc.stop(ctx.currentTime  + (delay || 0) + dur);
    } catch (e) {}
  }

  function _playSfxShoot()  { _playTone(880,  'sawtooth', 0.06, 0.08); }
  function _playSfxHit()    {
    _playTone(220, 'square',   0.12, 0.12);
    _playTone(180, 'sawtooth', 0.18, 0.08, 0.04);
  }
  function _playSfxCollect(){ _playTone(1200, 'sine',    0.15, 0.10); _playTone(1600, 'sine', 0.1, 0.08, 0.06); }
  function _playSfxCrash()  {
    var ctx = _getAudio(); if (!ctx) return;
    try {
      var buf  = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < data.length; i++) {
        var envelope = 1 - i / data.length;
        data[i] = (Math.random() * 2 - 1) * envelope;
      }
      var src  = ctx.createBufferSource();
      var gain = ctx.createGain();
      src.buffer = buf;
      src.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      src.start();
    } catch (e) {}
  }

  // Pitch-shifted human scream (layered oscillators simulating distorted voice)
  function _playSfxScream() {
    var ctx = _getAudio(); if (!ctx) return;
    try {
      var freqs = [280, 560, 840, 1120];
      freqs.forEach(function(f, i) {
        var osc  = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = i % 2 === 0 ? 'sawtooth' : 'square';
        osc.frequency.setValueAtTime(f * (0.9 + Math.random() * 0.3), ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(f * 0.4, ctx.currentTime + 0.35);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      });
    } catch (e) {}
  }

  function _playSfxGasp() {
    var ctx = _getAudio(); if (!ctx) return;
    try {
      // White noise burst (gasp breath)
      var buf  = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < data.length; i++) {
        var env = i < ctx.sampleRate * 0.05 ? i / (ctx.sampleRate * 0.05) : 1 - (i - ctx.sampleRate * 0.05) / (ctx.sampleRate * 0.35);
        data[i] = (Math.random() * 2 - 1) * env;
      }
      var src  = ctx.createBufferSource();
      var flt  = ctx.createBiquadFilter();
      var gain = ctx.createGain();
      flt.type = 'bandpass'; flt.frequency.value = 1200; flt.Q.value = 2;
      src.buffer = buf; src.connect(flt); flt.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      src.start();
      // Heart-beat thud
      _playTone(60, 'sine', 0.2, 0.3, 0.1);
      _playTone(60, 'sine', 0.2, 0.2, 0.4);
    } catch (e) {}
  }

  /* ================================================================
     THREE.JS HELPERS
  ================================================================ */
  function _makeMat(col, emissive, wire) {
    var T = window.THREE;
    return new T.MeshStandardMaterial({
      color: col,
      emissive: emissive !== undefined ? emissive : col,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.82,
      wireframe: !!wire,
      side: T.DoubleSide
    });
  }

  /* ================================================================
     TUNNEL CONSTRUCTION
  ================================================================ */
  function _buildTunnelRing(zPos) {
    var T = window.THREE;
    var hue = (zPos * 0.003 + _scrollZ * 0.0002) % 1;
    var color = new T.Color().setHSL(hue, 1, 0.55);
    var geo   = new T.TorusGeometry(TUNNEL_RADIUS, 0.08, 8, TUNNEL_SEGMENTS);
    var mat   = _makeMat(color.getHex(), color.getHex(), false);
    var ring  = new T.Mesh(geo, mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.z = -zPos;

    // Accent spokes
    for (var s = 0; s < 8; s++) {
      var angle = (s / 8) * Math.PI * 2;
      var sg    = new T.CylinderGeometry(0.02, 0.02, TUNNEL_RADIUS * 0.9, 4);
      var sm    = _makeMat(color.getHex(), color.getHex());
      var spoke = new T.Mesh(sg, sm);
      spoke.position.set(
        Math.cos(angle) * TUNNEL_RADIUS * 0.45,
        Math.sin(angle) * TUNNEL_RADIUS * 0.45,
        0
      );
      spoke.rotation.z = angle + Math.PI / 2;
      ring.add(spoke);
    }

    _scene.add(ring);
    return ring;
  }

  function _initTunnel() {
    for (var i = 0; i < TUNNEL_RINGS; i++) {
      _tunnelRings.push(_buildTunnelRing(i * RING_SPACING));
    }
  }

  function _updateTunnel(dt) {
    var T = window.THREE;
    _scrollZ += _speed * dt;
    var maxZ  = TUNNEL_RINGS * RING_SPACING;

    _tunnelRings.forEach(function(ring, idx) {
      var baseZ = idx * RING_SPACING;
      var ringZ = ((baseZ - _scrollZ % maxZ) + maxZ) % maxZ;
      ring.position.z = -ringZ;

      // Pulse colour with time
      var hue = (ringZ * 0.01 + _scrollZ * 0.0008) % 1;
      var c   = new T.Color().setHSL(hue, 1, 0.5 + 0.2 * Math.sin(_scrollZ * 0.05 + idx));
      ring.material.color.set(c);
      ring.material.emissive.set(c);
      ring.rotation.z += dt * (0.3 + idx * 0.01);
    });
  }

  /* ================================================================
     AVATAR (Data-Spark)
  ================================================================ */
  function _buildAvatar() {
    var T = window.THREE;
    var g = new T.Group();

    // Core body — sleek diamond
    var bodyGeo = new T.OctahedronGeometry(0.35, 0);
    var bodyMat = _makeMat(0x00ffff, 0x00ffff);
    var body    = new T.Mesh(bodyGeo, bodyMat);
    g.add(body);

    // Wings
    [-1, 1].forEach(function(side) {
      var wg = new T.ConeGeometry(0.15, 0.8, 4);
      var wm = _makeMat(0xff00ff, 0xff00ff);
      var w  = new T.Mesh(wg, wm);
      w.rotation.z = side * Math.PI / 2;
      w.position.x = side * 0.55;
      g.add(w);
    });

    // Engine glow trail
    var trailGeo = new T.ConeGeometry(0.18, 0.9, 6);
    var trailMat = _makeMat(0xff4400, 0xff4400);
    trailMat.opacity = 0.6;
    var trail    = new T.Mesh(trailGeo, trailMat);
    trail.rotation.x = Math.PI;
    trail.position.z = 0.6;
    g.add(trail);

    // Point light on avatar
    var light = new T.PointLight(0x00ffff, 2, 6);
    g.add(light);

    g.position.set(0, 0, -1);
    _scene.add(g);
    _avatar = g;
  }

  /* ================================================================
     PROJECTILES (Digital Pulses)
  ================================================================ */
  function _spawnPulse() {
    var T = window.THREE;
    var geo = new T.SphereGeometry(0.18, 6, 6);
    var mat = _makeMat(0xffff00, 0xffff00);
    var mesh= new T.Mesh(geo, mat);
    mesh.position.set(_avatarX, _avatarY, _avatar.position.z - 2);
    _scene.add(mesh);
    _pulses.push({ mesh: mesh, life: 2.5 });
    _playSfxShoot();
  }

  function _updatePulses(dt) {
    _pulses = _pulses.filter(function(p) {
      p.mesh.position.z -= PULSE_SPEED * dt;
      p.life -= dt;
      if (p.life <= 0) { _scene.remove(p.mesh); return false; }
      return true;
    });
  }

  /* ================================================================
     ENEMIES (DNA Fragments / Firewalls)
  ================================================================ */
  var ENEMY_TYPES = [
    { col: 0xff0044, emissive: 0xff0044, shape: 'box',   hp: 1, essenceDrop: 3, coreDrop: 0 },
    { col: 0xff6600, emissive: 0xff6600, shape: 'torus',  hp: 2, essenceDrop: 5, coreDrop: 0 },
    { col: 0xcc00ff, emissive: 0xcc00ff, shape: 'ico',    hp: 3, essenceDrop: 8, coreDrop: 1 },
  ];

  function _spawnEnemyWave() {
    var T   = window.THREE;
    var row = Math.floor(Math.random() * ENEMY_ROWS);
    var angle = (row / ENEMY_ROWS) * Math.PI * 2;
    var r   = TUNNEL_RADIUS * (0.35 + Math.random() * 0.45);
    var ex  = Math.cos(angle) * r;
    var ey  = Math.sin(angle) * r;
    var et  = ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length)];
    var geo;
    if (et.shape === 'box')   geo = new T.BoxGeometry(0.7, 0.7, 0.7);
    else if (et.shape === 'torus') geo = new T.TorusGeometry(0.4, 0.15, 6, 12);
    else                      geo = new T.IcosahedronGeometry(0.5, 0);

    var mat  = _makeMat(et.col, et.emissive);
    var mesh = new T.Mesh(geo, mat);
    mesh.position.set(ex, ey, _avatar.position.z - ENEMY_SPAWN_DIST);

    // Pulse light
    var light = new T.PointLight(et.col, 1.5, 4);
    mesh.add(light);

    _scene.add(mesh);
    _enemies.push({
      mesh: mesh,
      hp: et.hp,
      essenceDrop: et.essenceDrop,
      coreDrop: et.coreDrop,
      x: ex,
      y: ey,
      speed: 4 + Math.random() * 6
    });
  }

  function _updateEnemies(dt) {
    var now = performance.now();
    _enemies = _enemies.filter(function(en) {
      en.mesh.position.z += en.speed * dt;
      en.mesh.rotation.x += dt * 1.5;
      en.mesh.rotation.y += dt * 2.0;

      // Collision with avatar
      var dx = en.mesh.position.x - _avatarX;
      var dy = en.mesh.position.y - _avatarY;
      var dz = en.mesh.position.z - _avatar.position.z;
      if (Math.sqrt(dx*dx + dy*dy + dz*dz) < 0.9 && !_crashed) {
        _takeDamage();
        _scene.remove(en.mesh);
        return false;
      }

      // Passed avatar — remove
      if (en.mesh.position.z > _avatar.position.z + 4) {
        _scene.remove(en.mesh);
        return false;
      }
      return true;
    });
  }

  /* ================================================================
     COLLECTIBLES (Astral Essence + Neural Cores)
  ================================================================ */
  function _spawnCollectible() {
    var T     = window.THREE;
    var isCore= Math.random() < 0.15;
    var col   = isCore ? 0x00ffaa : 0xffaa00;
    var geo   = isCore
      ? new T.OctahedronGeometry(0.4, 1)
      : new T.SphereGeometry(0.28, 8, 8);
    var mat   = _makeMat(col, col);
    mat.opacity = 0.95;
    var mesh  = new T.Mesh(geo, mat);
    var angle = Math.random() * Math.PI * 2;
    var r     = TUNNEL_RADIUS * Math.random() * 0.7;
    mesh.position.set(
      Math.cos(angle) * r,
      Math.sin(angle) * r,
      _avatar.position.z - ENEMY_SPAWN_DIST * 0.7
    );
    var light = new T.PointLight(col, 2, 5);
    mesh.add(light);
    _scene.add(mesh);
    _collectibles.push({ mesh: mesh, isCore: isCore });
  }

  function _updateCollectibles(dt) {
    _collectibles = _collectibles.filter(function(c) {
      c.mesh.position.z += _speed * 0.1 * dt;
      c.mesh.rotation.y += dt * 3;

      var dx = c.mesh.position.x - _avatarX;
      var dy = c.mesh.position.y - _avatarY;
      var dz = c.mesh.position.z - _avatar.position.z;
      var dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

      if (dist < COLLECT_RADIUS) {
        if (c.isCore) {
          _cores++;
          _score += 50;
        } else {
          _essence += 3;
          _score   += 10;
        }
        _playSfxCollect();
        _spawnCollectParticles(c.mesh.position, c.isCore ? 0x00ffaa : 0xffaa00);
        _scene.remove(c.mesh);
        _updateHUD();
        return false;
      }

      if (c.mesh.position.z > _avatar.position.z + 5) {
        _scene.remove(c.mesh);
        return false;
      }
      return true;
    });
  }

  /* ================================================================
     PARTICLES
  ================================================================ */
  function _spawnCollectParticles(pos, color) {
    var T = window.THREE;
    for (var i = 0; i < 14; i++) {
      var geo  = new T.SphereGeometry(0.07, 4, 4);
      var mat  = _makeMat(color, color);
      mat.opacity = 0.9;
      var mesh = new T.Mesh(geo, mat);
      mesh.position.copy(pos);
      _scene.add(mesh);
      var vx = (Math.random() - 0.5) * 8;
      var vy = (Math.random() - 0.5) * 8;
      var vz = (Math.random() - 0.5) * 8;
      _particles.push({ mesh: mesh, vx: vx, vy: vy, vz: vz, life: 0.5 + Math.random() * 0.3 });
    }
  }

  function _spawnDeathParticles(pos, color) {
    var T = window.THREE;
    for (var i = 0; i < 22; i++) {
      var geo  = new T.SphereGeometry(0.09, 4, 4);
      var mat  = _makeMat(color, color);
      mat.opacity = 1.0;
      var mesh = new T.Mesh(geo, mat);
      mesh.position.copy(pos);
      _scene.add(mesh);
      var spd  = 6 + Math.random() * 10;
      var ang  = Math.random() * Math.PI * 2;
      var ang2 = Math.random() * Math.PI * 2;
      _particles.push({
        mesh: mesh,
        vx: Math.sin(ang) * Math.cos(ang2) * spd,
        vy: Math.sin(ang) * Math.sin(ang2) * spd,
        vz: Math.cos(ang) * spd,
        life: 0.6 + Math.random() * 0.4
      });
    }
  }

  function _updateParticles(dt) {
    _particles = _particles.filter(function(p) {
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.life -= dt;
      p.mesh.material.opacity = Math.max(0, p.life * 1.5);
      if (p.life <= 0) { _scene.remove(p.mesh); return false; }
      return true;
    });
  }

  /* ================================================================
     PULSE vs ENEMY COLLISION
  ================================================================ */
  function _checkPulseCollisions() {
    var toRemovePulses   = [];
    var toRemoveEnemies  = [];

    _pulses.forEach(function(p, pi) {
      _enemies.forEach(function(en, ei) {
        var dx = p.mesh.position.x - en.mesh.position.x;
        var dy = p.mesh.position.y - en.mesh.position.y;
        var dz = p.mesh.position.z - en.mesh.position.z;
        if (Math.sqrt(dx*dx + dy*dy + dz*dz) < 0.7) {
          en.hp--;
          toRemovePulses.push(pi);
          if (en.hp <= 0) {
            toRemoveEnemies.push(ei);
          }
        }
      });
    });

    // Unique indices (deduplicate and sort descending so splice doesn't shift earlier indices)
    var deadEnemyIdx = Array.from(new Set(toRemoveEnemies)).sort(function(a,b){return b-a;});
    deadEnemyIdx.forEach(function(ei) {
      var en = _enemies[ei];
      _spawnDeathParticles(en.mesh.position, en.mesh.material.color.getHex());
      _playSfxScream();
      _essence += en.essenceDrop;
      _cores   += en.coreDrop;
      _score   += 20 + en.essenceDrop * 2;
      _scene.remove(en.mesh);
      _enemies.splice(ei, 1);
      _updateHUD();
    });

    var deadPulseIdx = Array.from(new Set(toRemovePulses)).sort(function(a,b){return b-a;});
    deadPulseIdx.forEach(function(pi) {
      _scene.remove(_pulses[pi].mesh);
      _pulses.splice(pi, 1);
    });
  }

  /* ================================================================
     AVATAR DAMAGE & CRASH
  ================================================================ */
  function _takeDamage() {
    _playSfxHit();
    _hitFlash = 0.4;
    _warpIntensity = 1.0;
    _crashed = true;
    _exitTimer = 1.8;
    _playSfxCrash();
  }

  /* ================================================================
     SPEED LINES (Post-process effect via canvas overlay)
  ================================================================ */
  var _speedLineCanvas = null;
  var _speedLineCtx    = null;

  function _initSpeedLines() {
    _speedLineCanvas = document.createElement('canvas');
    _speedLineCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2;';
    _overlay.appendChild(_speedLineCanvas);
    _speedLineCtx = _speedLineCanvas.getContext('2d');
  }

  function _renderSpeedLines() {
    var c   = _speedLineCtx;
    var w   = _speedLineCanvas.width  = _overlay.clientWidth;
    var h   = _speedLineCanvas.height = _overlay.clientHeight;
    var cx  = w / 2;
    var cy  = h / 2;
    var spd = Math.min(1, (_speed - SPEED_BASE) / (SPEED_MAX - SPEED_BASE));

    c.clearRect(0, 0, w, h);
    if (spd < 0.05) return;

    var count = Math.floor(spd * 80 + 10);
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var r0    = 20 + Math.random() * (Math.min(w, h) * 0.35);
      var len   = r0 * (0.1 + spd * 0.5) * (0.5 + Math.random() * 0.5);
      var x0    = cx + Math.cos(angle) * r0;
      var y0    = cy + Math.sin(angle) * r0;
      var x1    = cx + Math.cos(angle) * (r0 + len);
      var y1    = cy + Math.sin(angle) * (r0 + len);
      var alpha = spd * (0.3 + Math.random() * 0.4);
      var hue   = (Date.now() * 0.1 + i * 17) % 360;
      c.strokeStyle = 'hsla(' + hue + ',100%,70%,' + alpha + ')';
      c.lineWidth   = 0.5 + Math.random() * 1.5;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
  }

  /* ================================================================
     CHROMATIC ABERRATION (CSS filter)
  ================================================================ */
  function _renderChromatic(dt) {
    _warpIntensity = Math.max(0, _warpIntensity - dt * 1.2);
    var spd = Math.min(1, (_speed - SPEED_BASE) / (SPEED_MAX - SPEED_BASE));
    var total = _warpIntensity + spd * 0.4;
    if (total > 0.01) {
      var px = Math.round(total * 6);
      _canvas.style.filter = 'hue-rotate(' + Math.round(total * 40) + 'deg) saturate(' + (1 + total * 2) + ')';
    } else {
      _canvas.style.filter = '';
    }
  }

  /* ================================================================
     HIT FLASH (red overlay)
  ================================================================ */
  var _hitFlashEl = null;
  function _initHitFlash() {
    _hitFlashEl = document.createElement('div');
    _hitFlashEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:10;transition:opacity 0.1s;background:rgba(255,0,0,0);';
    _overlay.appendChild(_hitFlashEl);
  }
  function _updateHitFlash(dt) {
    _hitFlash = Math.max(0, _hitFlash - dt * 2.5);
    _hitFlashEl.style.background = 'rgba(255,0,0,' + (_hitFlash * 0.5) + ')';
  }

  /* ================================================================
     HUD
  ================================================================ */
  var _hudEl = null;

  function _buildHUD() {
    _hudEl = document.createElement('div');
    _hudEl.id = 'astral-dive-hud';
    _hudEl.innerHTML = [
      '<div class="ad-hud-bar">',
      '  <span class="ad-hud-score">SCORE: <b id="ad-score">0</b></span>',
      '  <span class="ad-hud-essence">⚡ ESSENCE: <b id="ad-essence">0</b></span>',
      '  <span class="ad-hud-cores">🔷 CORES: <b id="ad-cores">0</b></span>',
      '  <span class="ad-hud-node">NODE: <b id="ad-node">0</b>%</span>',
      '</div>',
      '<div id="ad-lore-line" class="ad-lore-line"></div>',
    ].join('');
    _overlay.appendChild(_hudEl);
    _loreEl = _hudEl.querySelector('#ad-lore-line');
  }

  function _updateHUD() {
    document.getElementById('ad-score').textContent   = _score;
    document.getElementById('ad-essence').textContent = _essence;
    document.getElementById('ad-cores').textContent   = _cores;
    document.getElementById('ad-node').textContent    = Math.min(100, Math.floor(_nodeProgress / NODE_LENGTH * 100));
  }

  /* ================================================================
     LORE FLASH
  ================================================================ */
  function _updateLore(dt) {
    _loreTimer -= dt;
    if (_loreTimer <= 0) {
      var line = LORE_LINES[_loreIdx % LORE_LINES.length];
      _loreIdx++;
      _loreEl.textContent = line;
      _loreEl.classList.remove('ad-lore-visible');
      void _loreEl.offsetWidth; // force reflow to restart the CSS animation from the beginning
      _loreEl.classList.add('ad-lore-visible');
      _loreTimer = 8 + Math.random() * 6;
    }
  }

  /* ================================================================
     INPUT
  ================================================================ */
  function _onKeyDown(e) { _keys[e.code] = true; }
  function _onKeyUp(e)   { _keys[e.code] = false; }

  function _onTouchStart(e) {
    e.preventDefault();
    var t = e.touches[0];
    _touch.active = true; _touch.startX = t.clientX; _touch.startY = t.clientY;
    _touch.dx = 0; _touch.dy = 0;
  }
  function _onTouchMove(e) {
    e.preventDefault();
    var t = e.touches[0];
    _touch.dx = t.clientX - _touch.startX;
    _touch.dy = t.clientY - _touch.startY;
  }
  function _onTouchEnd() { _touch.active = false; _touch.dx = 0; _touch.dy = 0; }

  function _onMouseMove(e) {
    if (!_mouse.active) return;
    var rect = _canvas.getBoundingClientRect();
    _mouse.x = ((e.clientX - rect.left) / rect.width  - 0.5) * 2;
    _mouse.y = ((e.clientY - rect.top)  / rect.height - 0.5) * -2;
  }
  function _onMouseDown(e) { _mouse.active = (e.button === 0); }
  function _onMouseUp()    { _mouse.active = false; }

  function _processInput(dt) {
    var ax = 0, ay = 0;

    if (_keys['ArrowLeft']  || _keys['KeyA']) ax -= 1;
    if (_keys['ArrowRight'] || _keys['KeyD']) ax += 1;
    if (_keys['ArrowUp']    || _keys['KeyW']) ay += 1;
    if (_keys['ArrowDown']  || _keys['KeyS']) ay -= 1;

    if (_touch.active) {
      ax += _touch.dx / 80;
      ay -= _touch.dy / 80;
    }

    if (_mouse.active) {
      ax = _mouse.x * 1.5;
      ay = _mouse.y * 1.5;
    }

    // Clamp
    ax = Math.max(-1, Math.min(1, ax));
    ay = Math.max(-1, Math.min(1, ay));

    _avatarVX += (ax * STEER_SPEED - _avatarVX) * Math.min(1, dt * 8);
    _avatarVY += (ay * STEER_SPEED - _avatarVY) * Math.min(1, dt * 8);

    _avatarX += _avatarVX * dt;
    _avatarY += _avatarVY * dt;

    // Clamp to tunnel radius (soft)
    var r = Math.sqrt(_avatarX * _avatarX + _avatarY * _avatarY);
    if (r > AVATAR_RANGE) {
      _avatarX = (_avatarX / r) * AVATAR_RANGE;
      _avatarY = (_avatarY / r) * AVATAR_RANGE;
      _avatarVX *= 0.5; _avatarVY *= 0.5;
    }

    _avatar.position.x = _avatarX;
    _avatar.position.y = _avatarY;
    // Tilt based on velocity
    _avatar.rotation.z = -_avatarVX * 0.06;
    _avatar.rotation.x =  _avatarVY * 0.04;

    // Shoot
    _shootTimer -= dt;
    var shooting = _keys['Space'] || _keys['KeyZ'] || _mouse.active;
    if (shooting && _shootTimer <= 0) {
      _shootTimer = SHOOT_COOLDOWN;
      _spawnPulse();
    }
  }

  /* ================================================================
     SPAWN SCHEDULE
  ================================================================ */
  var _enemySpawnTimer    = 0;
  var _collectSpawnTimer  = 0;

  function _updateSpawns(dt) {
    _enemySpawnTimer -= dt;
    if (_enemySpawnTimer <= 0) {
      _spawnEnemyWave();
      _enemySpawnTimer = 0.8 + Math.random() * 1.2;
    }
    _collectSpawnTimer -= dt;
    if (_collectSpawnTimer <= 0) {
      _spawnCollectible();
      _collectSpawnTimer = 1.5 + Math.random() * 2.0;
    }
  }

  /* ================================================================
     AMBIENT LIGHT PULSE
  ================================================================ */
  var _ambientLight = null;

  function _updateAmbient(dt) {
    if (!_ambientLight) return;
    var t   = performance.now() * 0.001;
    var hue = (t * 0.12) % 1;
    _ambientLight.color.setHSL(hue, 1, 0.3 + 0.1 * Math.sin(t * 3));
  }

  /* ================================================================
     MAIN LOOP
  ================================================================ */
  function _tick(now) {
    if (!_active) return;
    var dt = Math.min(0.05, (now - _lastTime) * 0.001);
    _lastTime = now;

    if (_crashed || _nodeComplete) {
      _exitTimer -= dt;
      // Still render / animate crash
      _updateTunnel(dt * 0.3);
      _updateParticles(dt);
      _updateHitFlash(dt);
      _renderChromatic(dt);
      _renderer.render(_scene, _camera);
      if (_exitTimer <= 0) {
        _finish();
        return;
      }
      _animId = requestAnimationFrame(_tick);
      return;
    }

    // Speed ramp
    _speed = Math.min(SPEED_MAX, _speed + SPEED_ACCEL * dt);

    // Node progress
    _nodeProgress += _speed * dt;
    if (_nodeProgress >= NODE_LENGTH) {
      _nodeComplete = true;
      _exitTimer    = 2.0;
    }

    _processInput(dt);
    _updateTunnel(dt);
    _updatePulses(dt);
    _updateEnemies(dt);
    _updateCollectibles(dt);
    _checkPulseCollisions();
    _updateParticles(dt);
    _updateSpawns(dt);
    _updateAmbient(dt);
    _updateLore(dt);
    _updateHitFlash(dt);
    _renderChromatic(dt);
    _renderSpeedLines();
    _updateHUD();

    _renderer.render(_scene, _camera);
    _animId = requestAnimationFrame(_tick);
  }

  /* ================================================================
     SETUP / TEARDOWN
  ================================================================ */
  function _buildScene() {
    var T = window.THREE;
    _scene    = new T.Scene();
    _scene.fog = new T.FogExp2(0x000010, 0.025);

    _camera   = new T.PerspectiveCamera(75, _canvas.clientWidth / _canvas.clientHeight, 0.1, 500);
    _camera.position.set(0, 0, 4);
    _camera.lookAt(0, 0, -10);

    _ambientLight = new T.AmbientLight(0x001133, 1.0);
    _scene.add(_ambientLight);
    var dirLight = new T.DirectionalLight(0xffffff, 0.3);
    dirLight.position.set(0, 10, 5);
    _scene.add(dirLight);

    _initTunnel();
    _buildAvatar();
  }

  function _attachInput() {
    document.addEventListener('keydown', _onKeyDown);
    document.addEventListener('keyup',   _onKeyUp);
    _canvas.addEventListener('touchstart', _onTouchStart, { passive: false });
    _canvas.addEventListener('touchmove',  _onTouchMove,  { passive: false });
    _canvas.addEventListener('touchend',   _onTouchEnd);
    _canvas.addEventListener('mousemove',  _onMouseMove);
    _canvas.addEventListener('mousedown',  _onMouseDown);
    _canvas.addEventListener('mouseup',    _onMouseUp);
  }

  function _detachInput() {
    document.removeEventListener('keydown', _onKeyDown);
    document.removeEventListener('keyup',   _onKeyUp);
  }

  function _disposeAll() {
    // Clear scene objects
    while (_scene && _scene.children.length > 0) {
      var obj = _scene.children[0];
      _scene.remove(obj);
    }
    _tunnelRings  = [];
    _pulses       = [];
    _enemies      = [];
    _collectibles = [];
    _particles    = [];
    _avatar       = null;
    _ambientLight = null;
  }

  /* ================================================================
     WAKE-UP TRANSITION (violent return to camp)
  ================================================================ */
  function _doWakeUp(onDone) {
    _playSfxGasp();

    var wake = document.createElement('div');
    wake.id = 'astral-wake-overlay';
    wake.style.cssText = [
      'position:fixed;inset:0;z-index:99999;pointer-events:none;',
      'background:white;opacity:1;',
      'animation:astralWakeFlash 1.4s ease-out forwards;',
    ].join('');
    document.body.appendChild(wake);

    // Screen shake on the main canvas container
    var gameContainer = document.getElementById('game-container') || document.body;
    gameContainer.classList.add('astral-screen-shake');

    setTimeout(function() {
      gameContainer.classList.remove('astral-screen-shake');
    }, 600);

    setTimeout(function() {
      wake.remove();
      if (onDone) onDone();
    }, 1500);
  }

  /* ================================================================
     FINISH — return rewards, close overlay
  ================================================================ */
  function _finish() {
    _active = false;
    cancelAnimationFrame(_animId);
    _detachInput();

    // Persist rewards to saveData
    if (typeof saveData !== 'undefined') {
      saveData.astralEssence  = (saveData.astralEssence  || 0) + _essence;
      saveData.neuralCores    = (saveData.neuralCores    || 0) + _cores;
      if (typeof saveSaveData === 'function') saveSaveData();
    }

    // Extreme reward visuals — dopamine blast for earned rewards
    if (!_crashed && (_essence > 0 || _cores > 0)) {
      setTimeout(function() {
        if (typeof window.triggerRewardBlast === 'function') {
          window.triggerRewardBlast({ essence: _essence, cores: _cores });
        }
      }, 600);
    }

    // Narrator line
    if (typeof window.showNarratorLine === 'function') {
      var msg = _crashed
        ? 'AIDA: "Organic instability detected. Synchronisation failed. Essence recovered: ' + _essence + '."'
        : 'AIDA: "Node purged. Synthesis continues. Astral Essence +' + _essence + ', Neural Cores +' + _cores + '."';
      setTimeout(function() { window.showNarratorLine(msg, 4000); }, 800);
    }

    // Remove Three.js renderer & overlay
    _disposeAll();
    if (_renderer) { _renderer.dispose(); _renderer = null; }

    var overlayRef = _overlay;
    _overlay = _canvas = _loreEl = _hudEl = _hitFlashEl = _speedLineCanvas = _speedLineCtx = null;

    _doWakeUp(function() {
      if (overlayRef && overlayRef.parentNode) overlayRef.parentNode.removeChild(overlayRef);
    });
  }

  /* ================================================================
     INTRO SEQUENCE
  ================================================================ */
  function _showIntro(onDone) {
    var intro = document.createElement('div');
    intro.style.cssText = [
      'position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;',
      'align-items:center;justify-content:center;background:rgba(0,0,16,0.95);',
      'color:#00ffff;font-family:monospace;text-align:center;padding:40px;',
    ].join('');
    intro.innerHTML = [
      '<div style="font-size:clamp(22px,4vw,42px);font-weight:900;letter-spacing:4px;',
        'text-shadow:0 0 20px #00ffff,0 0 50px #0088ff;margin-bottom:24px;">ASTRAL DIVE</div>',
      '<div style="font-size:clamp(11px,2vw,16px);opacity:0.7;max-width:500px;line-height:1.8;margin-bottom:32px;">',
        'Steer with <b>ARROW KEYS / WASD</b><br>',
        'Shoot with <b>SPACE / Z / MOUSE CLICK</b><br>',
        'Touch: drag to steer, tap to shoot<br><br>',
        '<span style="color:#ff4444">Destroy Firewalls</span> to collect <span style="color:#ffaa00">Astral Essence</span>.<br>',
        'Collect <span style="color:#00ffaa">Neural Cores</span> for bonus rewards.<br>',
        '<i style="opacity:0.5">Do not crash.</i>',
      '</div>',
      '<button id="ad-dive-btn" style="',
        'padding:14px 48px;font-size:18px;font-family:monospace;font-weight:900;',
        'background:transparent;border:2px solid #00ffff;color:#00ffff;cursor:pointer;',
        'letter-spacing:3px;text-shadow:0 0 10px #00ffff;box-shadow:0 0 20px #00ffff44;',
        'border-radius:4px;transition:all 0.2s;">DIVE IN</button>',
    ].join('');
    _overlay.appendChild(intro);

    var btn = intro.querySelector('#ad-dive-btn');
    btn.onmouseover = function() { btn.style.background = 'rgba(0,255,255,0.1)'; };
    btn.onmouseout  = function() { btn.style.background = 'transparent'; };
    btn.onclick     = function() {
      intro.style.opacity = '0'; intro.style.transition = 'opacity 0.4s';
      setTimeout(function() { intro.remove(); onDone(); }, 400);
    };
  }

  /* ================================================================
     PUBLIC API
  ================================================================ */
  function start() {
    if (_active) return;
    var T = window.THREE;
    if (!T) { console.error('AstralDive: THREE.js not loaded'); return; }

    // Reset state
    _active        = true;
    _crashed       = false;
    _nodeComplete  = false;
    _exitTimer     = 0;
    _score         = 0;
    _essence       = 0;
    _cores         = 0;
    _nodeProgress  = 0;
    _speed         = SPEED_BASE;
    _scrollZ       = 0;
    _avatarX       = 0; _avatarY = 0;
    _avatarVX      = 0; _avatarVY = 0;
    _hitFlash      = 0;
    _warpIntensity = 0;
    _keys          = {};
    _loreTimer     = 4;
    _loreIdx       = 0;
    _enemySpawnTimer   = 1.0;
    _collectSpawnTimer = 2.0;
    _shootTimer    = 0;
    _tunnelRings   = [];
    _pulses        = [];
    _enemies       = [];
    _collectibles  = [];
    _particles     = [];

    // Build full-screen overlay
    _overlay = document.createElement('div');
    _overlay.id = 'astral-dive-overlay';
    _overlay.style.cssText = [
      'position:fixed;inset:0;z-index:9999;background:#000008;',
      'display:flex;align-items:stretch;',
    ].join('');

    // Three.js canvas
    _canvas = document.createElement('canvas');
    _canvas.style.cssText = 'width:100%;height:100%;display:block;';
    _overlay.appendChild(_canvas);

    document.body.appendChild(_overlay);

    // Size canvas to pixel resolution
    _canvas.width  = _overlay.clientWidth  || window.innerWidth;
    _canvas.height = _overlay.clientHeight || window.innerHeight;

    // Renderer
    _renderer = new T.WebGLRenderer({
      canvas:     _canvas,
      antialias:  false,
      powerPreference: 'high-performance'
    });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    _renderer.setSize(_canvas.width, _canvas.height, false);
    _renderer.setClearColor(0x000008, 1);

    _buildScene();
    _buildHUD();
    _initHitFlash();
    _initSpeedLines();
    _attachInput();

    // Resize handler
    var _onResize = function() {
      if (!_renderer) return;
      var w = _overlay.clientWidth, h = _overlay.clientHeight;
      _camera.aspect = w / h;
      _camera.updateProjectionMatrix();
      _renderer.setSize(w, h, false);
    };
    window.addEventListener('resize', _onResize);

    _showIntro(function() {
      _lastTime = performance.now();
      _animId   = requestAnimationFrame(_tick);
    });
  }

  /* ================================================================
     EXPOSE
  ================================================================ */
  window.AstralDive = { start: start };

})();
