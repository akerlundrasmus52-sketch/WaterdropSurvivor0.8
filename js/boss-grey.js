// js/boss-grey.js — Grey Boss encounter system.
// Exposes window.GreyBossSystem with init(scene, camera, player) and update(delta).
// Requires THREE.js (global THREE). Designed for sandbox-loop.js (Engine 2.0).

(function () {
  'use strict';

  // ─── Internal state ──────────────────────────────────────────────────────────
  var _scene, _camera, _player;
  var _initialized = false;
  var _tick = 0;

  // Tuning constants
  var LASER_BOLT_DAMAGE  = 25;
  var LUNGE_HIT_RADIUS   = 1.2;
  var EGG_PICKUP_RADIUS  = 1.5;
  var BOSS_LOOK_HEIGHT   = 1.5;
  var INTRO_CAM_LERP     = 0.04;
  var INTRO_CAM_RETURN   = 0.05;

  // UFO crash site
  var _ufoGroup = null;
  var _eggMesh = null;
  var _eggAlive = true;

  // Boss mesh
  var _bossGroup = null;
  var _bossVisible = false;
  var _bossActive = false;
  var _bossHP = 100;
  var _phase2Triggered = false;
  var _phase3Triggered = false;

  // Animated body part refs
  var _torso = null;
  var _head = null;
  var _leftArm = null;
  var _rightArm = null;   // may become null after phase-3 detach
  var _rightArmGroup = null;
  var _leftLeg = null;
  var _rightLeg = null;
  var _gunMesh = null;
  var _stumpMesh = null;

  // Detached right arm (phase 3)
  var _detachedArm = null;
  var _detachedArmVel = { x: 0, y: 0, z: 0 };

  // Laser bolts
  var _laserBolts = [];   // { mesh, vel, life }

  // Shoulder particles (phase 3 burst)
  var _shoulderParticles = [];

  // State machine
  var STATES = {
    IDLE: 'IDLE',
    INTRO_CUTSCENE: 'INTRO_CUTSCENE',
    PHASE1: 'PHASE1',
    STRAFE_LEFT: 'STRAFE_LEFT',
    STRAFE_RIGHT: 'STRAFE_RIGHT',
    BACK_PEDAL: 'BACK_PEDAL',
    LUNGE: 'LUNGE',
    REPOSITION: 'REPOSITION',
    PHASE2_TRIGGER: 'PHASE2_TRIGGER',
    CIRCLE_SHOOT: 'CIRCLE_SHOOT',
    PHASE3_TRIGGER: 'PHASE3_TRIGGER',
    PHASE3_ATTACK: 'PHASE3_ATTACK',
    DEAD: 'DEAD'
  };
  var _state = STATES.IDLE;
  var _stateTimer = 0;

  // Phase 1 cycle
  var _phase1Cycle = [STATES.STRAFE_LEFT, STATES.STRAFE_RIGHT, STATES.BACK_PEDAL, STATES.LUNGE, STATES.REPOSITION];
  var _phase1Durations = { STRAFE_LEFT: 2.5, STRAFE_RIGHT: 2.5, BACK_PEDAL: 1.8, LUNGE: 0.9, REPOSITION: 1.2 };
  var _phase1CycleIdx = 0;

  // Lunge
  var _lungeDir = { x: 0, z: 0 };
  var _lungeEvasionWindow = false;
  var _lungeEvasionTimer = 0;

  // Player stun
  var _playerStunTimer = 0;

  // Phase 2 circle
  var _circleAngle = 0;
  var _circleLaps = 0;
  var _circlePrevAngle = 0;

  // Dash input tracking for lunge evasion
  var _dashPressedRecently = false;
  var _dashPressTimer = 0;
  var _dashPressedPrev = false;

  // Intro cutscene
  var _introPanel = null;
  var _introCamOrigPos = null;
  var _introTargetPos = null;
  var _introPhase = 0; // 0=not started, 1=lerping to boss, 2=panel shown, 3=lerping back, 4=done
  var _introTimer = 0;

  // World positions
  var _UFO_X = 45, _UFO_Y = 0, _UFO_Z = -30;
  var _SPAWN_X = _UFO_X + 3, _SPAWN_Y = 0.5, _SPAWN_Z = _UFO_Z + 5;

  // ─── UFO Crash Site ──────────────────────────────────────────────────────────
  function _buildUFO() {
    _ufoGroup = new THREE.Group();
    _ufoGroup.position.set(_UFO_X, _UFO_Y, _UFO_Z);

    // Main disk
    var diskGeo = new THREE.CylinderGeometry(4.5, 4.5, 0.6, 24);
    var diskMat = new THREE.MeshLambertMaterial({ color: 0x778877 });
    var disk = new THREE.Mesh(diskGeo, diskMat);
    disk.rotation.z = 0.3;
    disk.position.y = 0.6;
    disk.castShadow = true;
    _ufoGroup.add(disk);

    // Dome on top
    var domeGeo = new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    var domeMat = new THREE.MeshLambertMaterial({ color: 0x99aaaa, transparent: true, opacity: 0.7 });
    var dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.set(0.3, 1.1, 0.1);
    _ufoGroup.add(dome);

    // 4 burn-mark boxes
    var burnMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    var burnOffsets = [[3, 0, 0], [-3, 0, 0], [0, 0, 3], [0, 0, -3]];
    burnOffsets.forEach(function (p) {
      var bg = new THREE.BoxGeometry(1.1, 0.05, 0.75);
      var bm = new THREE.Mesh(bg, burnMat);
      bm.position.set(p[0], 0.02, p[2]);
      bm.rotation.y = Math.random() * Math.PI;
      _ufoGroup.add(bm);
    });

    _scene.add(_ufoGroup);

    // Egg mesh next to UFO
    var eggGeo = new THREE.SphereGeometry(0.35, 10, 8);
    var eggMat = new THREE.MeshLambertMaterial({ color: 0xddccaa, emissive: 0x332200 });
    _eggMesh = new THREE.Mesh(eggGeo, eggMat);
    _eggMesh.scale.set(1, 1.4, 1);
    _eggMesh.position.set(_UFO_X + 5, _UFO_Y + 0.49, _UFO_Z + 2);
    _eggMesh.castShadow = true;
    _scene.add(_eggMesh);
  }

  // ─── Grey Boss Mesh ──────────────────────────────────────────────────────────
  function _greyMat() {
    return new THREE.MeshLambertMaterial({ color: 0x8a9a8a });
  }

  function _buildBoss() {
    _bossGroup = new THREE.Group();

    // Torso
    var torsoGeo = new THREE.SphereGeometry(0.5, 12, 8);
    _torso = new THREE.Mesh(torsoGeo, _greyMat());
    _torso.scale.set(0.7, 1.4, 0.7);
    _torso.position.y = 0.9;
    _torso.castShadow = true;
    _bossGroup.add(_torso);

    // Neck
    var neckGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.25, 8);
    var neck = new THREE.Mesh(neckGeo, _greyMat());
    neck.position.y = 1.6;
    _bossGroup.add(neck);

    // Head
    var headGeo = new THREE.SphereGeometry(0.4, 14, 10);
    _head = new THREE.Mesh(headGeo, _greyMat());
    _head.scale.set(1.1, 1.3, 1.1);
    _head.position.y = 2.0;
    _head.castShadow = true;
    _bossGroup.add(_head);

    // Eyes
    var eyeMat = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: 0x0000aa });
    [-0.18, 0.18].forEach(function (xOff, idx) {
      var eGeo = new THREE.SphereGeometry(0.14, 10, 7);
      var eye = new THREE.Mesh(eGeo, eyeMat);
      eye.scale.set(1, 0.7, 0.15);
      eye.position.set(xOff, 2.04, 0.36);
      eye.rotation.z = (idx === 0 ? 1 : -1) * (25 * Math.PI / 180);
      _bossGroup.add(eye);
    });

    // Nostrils
    var nostrilMat = new THREE.MeshLambertMaterial({ color: 0x556655 });
    [-0.05, 0.05].forEach(function (xOff) {
      var ng = new THREE.SphereGeometry(0.04, 6, 6);
      var n = new THREE.Mesh(ng, nostrilMat);
      n.position.set(xOff, 1.88, 0.40);
      _bossGroup.add(n);
    });

    // Mouth
    var mouthGeo = new THREE.BoxGeometry(0.2, 0.02, 0.02);
    var mouth = new THREE.Mesh(mouthGeo, new THREE.MeshLambertMaterial({ color: 0x334433 }));
    mouth.position.set(0, 1.80, 0.40);
    _bossGroup.add(mouth);

    // Build arms (wrapped in groups for phase-3 detach)
    function buildArm(side) {
      var g = new THREE.Group();
      var xSign = side === 'left' ? -1 : 1;

      // Upper arm
      var uArmGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6);
      var uArm = new THREE.Mesh(uArmGeo, _greyMat());
      uArm.position.y = -0.35;
      g.add(uArm);

      // Forearm
      var fArmGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6);
      var fArm = new THREE.Mesh(fArmGeo, _greyMat());
      fArm.position.y = -0.85;
      g.add(fArm);

      // Three fingers
      [-0.25, 0, 0.25].forEach(function (angle) {
        var fg = new THREE.CylinderGeometry(0.025, 0.025, 0.35, 5);
        var finger = new THREE.Mesh(fg, _greyMat());
        finger.position.set(Math.sin(angle) * 0.1, -1.25, Math.cos(angle) * 0.05);
        finger.rotation.z = angle * xSign;
        g.add(finger);
      });

      g.position.set(xSign * 0.45, 1.3, 0);
      g.rotation.z = xSign * 0.3;
      _bossGroup.add(g);
      return g;
    }

    _rightArmGroup = buildArm('right');
    _rightArm = _rightArmGroup;
    _leftArm = buildArm('left');

    // Build legs
    function buildLeg(side) {
      var g = new THREE.Group();
      var xSign = side === 'left' ? -1 : 1;

      var ulg = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6);
      var upperLeg = new THREE.Mesh(ulg, _greyMat());
      upperLeg.position.y = -0.25;
      g.add(upperLeg);

      var llg = new THREE.CylinderGeometry(0.05, 0.05, 0.45, 6);
      var lowerLeg = new THREE.Mesh(llg, _greyMat());
      lowerLeg.position.y = -0.72;
      g.add(lowerLeg);

      var footGeo = new THREE.SphereGeometry(0.1, 8, 6);
      var foot = new THREE.Mesh(footGeo, _greyMat());
      foot.scale.set(1.3, 0.5, 1.8);
      foot.position.set(0, -1.0, 0.08);
      g.add(foot);

      g.position.set(xSign * 0.2, 0.45, 0);
      _bossGroup.add(g);
      return g;
    }

    _leftLeg = buildLeg('left');
    _rightLeg = buildLeg('right');

    _bossGroup.position.set(_SPAWN_X, _SPAWN_Y, _SPAWN_Z);
    _bossGroup.visible = false;
    _scene.add(_bossGroup);
  }

  // ─── Procedural animation ────────────────────────────────────────────────────
  function _animateBoss() {
    if (!_bossGroup || !_bossGroup.visible) return;
    _tick++;
    var t = _tick;

    if (_torso) _torso.scale.y = 1.4 * (1 + Math.sin(t * 0.04) * 0.02);
    if (_head) _head.rotation.z = Math.sin(t * 0.09) * 0.05;
    if (_leftLeg) _leftLeg.rotation.x = Math.sin(t * 0.18) * 0.6;
    if (_rightLeg) _rightLeg.rotation.x = Math.sin(t * 0.18 + Math.PI) * 0.6;

    if (_state === STATES.LUNGE) {
      if (_leftArm) _leftArm.rotation.x += (1.2 - _leftArm.rotation.x) * 0.15;
      if (_rightArm) _rightArm.rotation.x += (1.2 - _rightArm.rotation.x) * 0.15;
    } else {
      if (_leftArm) _leftArm.rotation.x = Math.sin(t * 0.18 + Math.PI) * 0.4;
      if (_rightArm) _rightArm.rotation.x = Math.sin(t * 0.18) * 0.4;
    }
  }

  // ─── Egg animation ───────────────────────────────────────────────────────────
  function _animateEgg(dt) {
    if (!_eggMesh || !_eggAlive) return;
    _eggMesh.rotation.y += dt * 0.4;
    var pulse = 1 + Math.sin(_tick * 0.05) * 0.04;
    _eggMesh.scale.set(pulse, 1.4 * pulse, pulse);
  }

  // ─── State helpers ────────────────────────────────────────────────────────────
  function _setState(s) {
    _state = s;
    _stateTimer = 0;
    if (s === STATES.LUNGE && _player && _player.mesh) {
      var dx = _player.mesh.position.x - _bossGroup.position.x;
      var dz = _player.mesh.position.z - _bossGroup.position.z;
      var len = Math.sqrt(dx * dx + dz * dz) || 1;
      _lungeDir.x = dx / len;
      _lungeDir.z = dz / len;
      _lungeEvasionWindow = true;
      _lungeEvasionTimer = 0.4;
    }
  }

  function _nextPhase1State() {
    _phase1CycleIdx = (_phase1CycleIdx + 1) % _phase1Cycle.length;
    _setState(_phase1Cycle[_phase1CycleIdx]);
  }

  function _distToPlayer() {
    if (!_player || !_player.mesh) return 999;
    var dx = _player.mesh.position.x - _bossGroup.position.x;
    var dz = _player.mesh.position.z - _bossGroup.position.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function _facePlayer() {
    if (!_player || !_player.mesh) return;
    var dx = _player.mesh.position.x - _bossGroup.position.x;
    var dz = _player.mesh.position.z - _bossGroup.position.z;
    _bossGroup.rotation.y = Math.atan2(dx, dz);
  }

  function _damagePlayer(amount) {
    if (!_player) return;
    if (typeof _player.takeDamage === 'function') {
      _player.takeDamage(amount);
    } else if (window.playerHP !== undefined) {
      window.playerHP = Math.max(0, (window.playerHP || 100) - amount);
    }
  }

  function _stunPlayer(duration) {
    _playerStunTimer = duration;
    window._bossStunActive = true;
  }

  // ─── Laser bolts ─────────────────────────────────────────────────────────────
  function _fireLaserBolt() {
    if (!_player || !_player.mesh) return;
    var boltGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.33, 6);
    var boltMat = new THREE.MeshLambertMaterial({ color: 0xff0000, emissive: 0xff0000 });
    var bolt = new THREE.Mesh(boltGeo, boltMat);
    bolt.rotation.x = Math.PI / 2;

    var startPos = _bossGroup.position.clone();
    startPos.y += 1.3;
    bolt.position.copy(startPos);

    var dx = _player.mesh.position.x - startPos.x;
    var dy = (_player.mesh.position.y + 0.5) - startPos.y;
    var dz = _player.mesh.position.z - startPos.z;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    var speed = 14;

    _scene.add(bolt);
    _laserBolts.push({
      mesh: bolt,
      vel: { x: (dx / len) * speed, y: (dy / len) * speed, z: (dz / len) * speed },
      life: 3.0
    });
  }

  function _updateLaserBolts(dt) {
    for (var i = _laserBolts.length - 1; i >= 0; i--) {
      var b = _laserBolts[i];
      b.mesh.position.x += b.vel.x * dt;
      b.mesh.position.y += b.vel.y * dt;
      b.mesh.position.z += b.vel.z * dt;
      b.life -= dt;
      if (b.life <= 0) {
        _scene.remove(b.mesh);
        _laserBolts.splice(i, 1);
        continue;
      }
      if (_player && _player.mesh) {
        var dx = _player.mesh.position.x - b.mesh.position.x;
        var dz = _player.mesh.position.z - b.mesh.position.z;
        if (Math.sqrt(dx * dx + dz * dz) < 0.7) {
          _damagePlayer(LASER_BOLT_DAMAGE);
          _scene.remove(b.mesh);
          _laserBolts.splice(i, 1);
        }
      }
    }
  }

  // ─── Gun mesh ────────────────────────────────────────────────────────────────
  function _addGun() {
    if (_gunMesh || !_rightArmGroup) return;
    var gunGeo = new THREE.BoxGeometry(0.08, 0.08, 0.4);
    var gunMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    _gunMesh = new THREE.Mesh(gunGeo, gunMat);
    _gunMesh.position.set(0, -1.4, 0.22);
    _rightArmGroup.add(_gunMesh);
  }

  // ─── Phase 3 arm detach ──────────────────────────────────────────────────────
  function _detachRightArm() {
    if (!_rightArmGroup) return;
    if (_gunMesh) { _rightArmGroup.remove(_gunMesh); _gunMesh = null; }

    // Capture world position, remove from boss, add to scene
    var worldPos = new THREE.Vector3();
    _rightArmGroup.getWorldPosition(worldPos);
    _bossGroup.remove(_rightArmGroup);
    _rightArmGroup.position.copy(worldPos);
    _scene.add(_rightArmGroup);
    _detachedArm = _rightArmGroup;
    _detachedArmVel = {
      x: (Math.random() - 0.5) * 3,
      y: 4,
      z: (Math.random() - 0.5) * 3
    };
    _rightArm = null;
    _rightArmGroup = null;

    // Red stump at right shoulder
    var stumpGeo = new THREE.CircleGeometry(0.07, 8);
    var stumpMat = new THREE.MeshLambertMaterial({ color: 0xcc1100, side: THREE.DoubleSide });
    _stumpMesh = new THREE.Mesh(stumpGeo, stumpMat);
    _stumpMesh.position.set(0.45, 1.3, 0);
    _stumpMesh.rotation.z = Math.PI / 2;
    _bossGroup.add(_stumpMesh);

    // Shoulder particle burst
    var pMat = new THREE.MeshLambertMaterial({ color: 0xff2200, emissive: 0xff0000 });
    for (var i = 0; i < 18; i++) {
      var pg = new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 5, 4);
      var pm = new THREE.Mesh(pg, pMat.clone());
      pm.position.copy(_bossGroup.position);
      pm.position.x += 0.45;
      pm.position.y += 1.3;
      var angle = Math.random() * Math.PI * 2;
      var spd = 1.5 + Math.random() * 2;
      _scene.add(pm);
      _shoulderParticles.push({
        mesh: pm,
        vel: { x: Math.cos(angle) * spd, y: 2 + Math.random() * 3, z: Math.sin(angle) * spd },
        life: 0.8 + Math.random() * 0.5
      });
    }
  }

  function _updateDetachedArm(dt) {
    if (!_detachedArm) return;
    _detachedArmVel.y -= 9.8 * dt;
    _detachedArm.position.x += _detachedArmVel.x * dt;
    _detachedArm.position.y += _detachedArmVel.y * dt;
    _detachedArm.position.z += _detachedArmVel.z * dt;
    _detachedArm.rotation.x += dt * 2.1;
    _detachedArm.rotation.z += dt * 1.5;
    if (_detachedArm.position.y < -2) {
      _scene.remove(_detachedArm);
      _detachedArm = null;
    }
  }

  function _updateShoulderParticles(dt) {
    for (var i = _shoulderParticles.length - 1; i >= 0; i--) {
      var p = _shoulderParticles[i];
      p.vel.y -= 9.8 * dt;
      p.mesh.position.x += p.vel.x * dt;
      p.mesh.position.y += p.vel.y * dt;
      p.mesh.position.z += p.vel.z * dt;
      p.life -= dt;
      if (p.life <= 0) {
        _scene.remove(p.mesh);
        _shoulderParticles.splice(i, 1);
      }
    }
  }

  // ─── Boss intro cutscene ─────────────────────────────────────────────────────
  function _startIntroCutscene() {
    if (_introPhase !== 0) return;
    _introPhase = 1;
    _introTimer = 0;
    window._bossIntroActive = true;

    // Disable player input
    if (window._inputDisabled !== undefined) window._inputDisabled = true;
    if (window.inputEnabled !== undefined) window.inputEnabled = false;

    _introCamOrigPos = _camera.position.clone();
    _introTargetPos = new THREE.Vector3(
      _bossGroup.position.x,
      _bossGroup.position.y + 4,
      _bossGroup.position.z + 6
    );
  }

  function _buildIntroPanel() {
    var panel = document.createElement('div');
    panel.id = 'boss-intro-panel';
    panel.style.cssText = [
      'position:fixed',
      'top:50%',
      'left:50%',
      'transform:translate(-50%,-50%) translateX(120%)',
      'background:rgba(0,0,0,0.82)',
      'padding:24px',
      'border:1px solid #446644',
      'z-index:9999',
      'text-align:center',
      'font-family:Arial,sans-serif',
      'transition:transform 0.5s ease',
      'border-radius:4px'
    ].join(';');

    // Canvas alien face
    var canvas = document.createElement('canvas');
    canvas.width = 60;
    canvas.height = 80;
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto 12px';
    var ctx = canvas.getContext('2d');

    // Oval grey head
    ctx.fillStyle = '#8a9a8a';
    ctx.beginPath();
    ctx.ellipse(30, 42, 22, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    // Large almond eyes
    ctx.fillStyle = '#000';
    [[18, 36, -0.4], [42, 36, 0.4]].forEach(function (e) {
      ctx.save();
      ctx.translate(e[0], e[1]);
      ctx.rotate(e[2]);
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Eye shimmer
    ctx.fillStyle = '#0000cc';
    [[18, 35, -0.4], [42, 35, 0.4]].forEach(function (e) {
      ctx.save(); ctx.translate(e[0], e[1]); ctx.rotate(e[2]);
      ctx.beginPath(); ctx.ellipse(0, 0, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // Nostril dots
    ctx.fillStyle = '#556655';
    [[27, 50], [33, 50]].forEach(function (p) {
      ctx.beginPath(); ctx.arc(p[0], p[1], 2, 0, Math.PI * 2); ctx.fill();
    });

    // Mouth
    ctx.strokeStyle = '#334433';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(22, 58); ctx.lineTo(38, 58);
    ctx.stroke();

    panel.appendChild(canvas);

    var title = document.createElement('div');
    title.textContent = 'THE LAST GREY';
    title.style.cssText = 'color:#fff;font-size:2.2rem;letter-spacing:0.18em;font-weight:bold;line-height:1.1;';
    panel.appendChild(title);

    var sub = document.createElement('div');
    sub.textContent = '— Boss —';
    sub.style.cssText = 'color:#cc3333;font-size:0.9rem;margin-top:6px;';
    panel.appendChild(sub);

    document.body.appendChild(panel);
    _introPanel = panel;

    // Trigger slide-in on next frame
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        panel.style.transform = 'translate(-50%,-50%) translateX(0)';
      });
    });
  }

  function _updateIntroCutscene(dt) {
    _introTimer += dt;

    if (_introPhase === 1) {
      // Lerp camera toward boss at 0.04/frame rate
      if (_introTargetPos) {
        _camera.position.lerp(_introTargetPos, INTRO_CAM_LERP);
        _camera.lookAt(_bossGroup.position.x, _bossGroup.position.y + BOSS_LOOK_HEIGHT, _bossGroup.position.z);
      }
      if (_introTimer >= 0.8 && !_introPanel) {
        _buildIntroPanel();
      }
      if (_introTimer >= 2.2 && _introPanel) {
        _introPanel.style.transform = 'translate(-50%,-50%) translateX(-120%)';
        _introPhase = 2;
        _introTimer = 0;
      }
    } else if (_introPhase === 2) {
      if (_introTimer >= 0.5) {
        if (_introPanel && _introPanel.parentNode) {
          _introPanel.parentNode.removeChild(_introPanel);
        }
        _introPanel = null;
        _introPhase = 3;
        _introTimer = 0;
      }
    } else if (_introPhase === 3) {
      // Lerp camera back over 1.0s
      if (_introCamOrigPos) _camera.position.lerp(_introCamOrigPos, INTRO_CAM_RETURN);
      if (_introTimer >= 1.0) {
        if (_introCamOrigPos) _camera.position.copy(_introCamOrigPos);
        window._bossIntroActive = false;
        if (window._inputDisabled !== undefined) window._inputDisabled = false;
        if (window.inputEnabled !== undefined) window.inputEnabled = true;
        _introPhase = 4;
        _setState(STATES.PHASE1);
        _bossActive = true;
      }
    }
  }

  // ─── Quest check ─────────────────────────────────────────────────────────────
  function _isQuestActive() {
    // Check via world quest system
    if (window._activeWorldQuest === 'investigate_ufo_crash' ||
        window._activeWorldQuest === 'retrieve_grey_egg') return true;
    if (Array.isArray(window.WORLD_QUESTS_ACTIVE)) {
      for (var i = 0; i < window.WORLD_QUESTS_ACTIVE.length; i++) {
        var q = window.WORLD_QUESTS_ACTIVE[i];
        if (q === 'investigate_ufo_crash' || q === 'retrieve_grey_egg') return true;
      }
    }
    // Fallback: check saveData tutorialQuests
    try {
      var sd = window.saveData;
      if (sd && sd.tutorialQuests) {
        var cur = sd.tutorialQuests.currentQuest;
        if (cur === 'investigate_ufo_crash' || cur === 'retrieve_grey_egg') return true;
      }
    } catch (e) {}
    return false;
  }

  // ─── Egg pickup ──────────────────────────────────────────────────────────────
  function _checkEggPickup() {
    if (!_eggAlive || !_eggMesh || _state !== STATES.DEAD) return;
    if (!_player || !_player.mesh) return;
    var dx = _player.mesh.position.x - _eggMesh.position.x;
    var dz = _player.mesh.position.z - _eggMesh.position.z;
    if (Math.sqrt(dx * dx + dz * dz) < EGG_PICKUP_RADIUS) {
      _eggAlive = false;
      _scene.remove(_eggMesh);
      _eggMesh = null;
      if (window.gameState && window.gameState.inventory) {
        window.gameState.inventory.push('grey_companion_egg');
      } else {
        if (!window.playerInventory) window.playerInventory = [];
        window.playerInventory.push('grey_companion_egg');
      }
      var msg = document.createElement('div');
      msg.textContent = 'You found the Grey Egg 🥚';
      msg.style.cssText = [
        'position:fixed',
        'bottom:120px',
        'left:50%',
        'transform:translateX(-50%)',
        'color:#fff',
        'font-family:Arial,sans-serif',
        'font-size:16px',
        'font-weight:bold',
        'background:rgba(0,0,0,0.7)',
        'padding:8px 16px',
        'border-radius:6px',
        'z-index:9998',
        'pointer-events:none'
      ].join(';');
      document.body.appendChild(msg);
      setTimeout(function () {
        if (msg.parentNode) msg.parentNode.removeChild(msg);
      }, 2000);
    }
  }

  // ─── Main update ─────────────────────────────────────────────────────────────
  function _update(dt) {
    if (!_initialized || !_scene) return;

    // Stun countdown
    if (_playerStunTimer > 0) {
      _playerStunTimer -= dt;
      if (_playerStunTimer <= 0) { _playerStunTimer = 0; window._bossStunActive = false; }
    }

    // Track dash input
    var dashNow = !!(window._spaceJustPressed || window._shiftJustPressed ||
      (window._dashPressed && !_dashPressedPrev));
    if (dashNow) { _dashPressedRecently = true; _dashPressTimer = 0.4; }
    if (_dashPressTimer > 0) { _dashPressTimer -= dt; if (_dashPressTimer <= 0) _dashPressedRecently = false; }
    _dashPressedPrev = !!window._dashPressed;

    // Egg animation runs always
    _animateEgg(dt);

    // Activate boss visibility when quest is active
    if (!_bossVisible && _isQuestActive()) {
      _bossVisible = true;
      if (_bossGroup) _bossGroup.visible = true;
    }

    if (!_bossGroup || !_bossGroup.visible) return;

    // Intro cutscene trigger
    if (_state === STATES.IDLE && _player && _player.mesh && _distToPlayer() < 18) {
      _setState(STATES.INTRO_CUTSCENE);
      _startIntroCutscene();
      return;
    }

    if (_state === STATES.INTRO_CUTSCENE) {
      _updateIntroCutscene(dt);
      _animateBoss();
      return;
    }

    if (_state === STATES.DEAD) {
      _animateBoss();
      _checkEggPickup();
      _updateShoulderParticles(dt);
      return;
    }

    if (!_bossActive) return;

    // Phase trigger checks (once each)
    if (!_phase2Triggered && _bossHP <= 50) {
      _phase2Triggered = true;
      _addGun();
      _setState(STATES.PHASE2_TRIGGER);
      _circleAngle = 0;
      _circleLaps = 0;
      _circlePrevAngle = 0;
    }
    if (!_phase3Triggered && _bossHP <= 15) {
      _phase3Triggered = true;
      _detachRightArm();
      _setState(STATES.PHASE3_TRIGGER);
    }

    _stateTimer += dt;

    // ── State logic ─────────────────────────────────────────────────────────
    switch (_state) {

      case STATES.PHASE1:
        _setState(STATES.STRAFE_LEFT);
        break;

      case STATES.STRAFE_LEFT: {
        _facePlayer();
        var r1 = { x: Math.cos(_bossGroup.rotation.y), z: -Math.sin(_bossGroup.rotation.y) };
        _bossGroup.position.x -= r1.x * 4.5 * dt;
        _bossGroup.position.z -= r1.z * 4.5 * dt;
        if (_stateTimer >= _phase1Durations.STRAFE_LEFT) _nextPhase1State();
        break;
      }

      case STATES.STRAFE_RIGHT: {
        _facePlayer();
        var r2 = { x: Math.cos(_bossGroup.rotation.y), z: -Math.sin(_bossGroup.rotation.y) };
        _bossGroup.position.x += r2.x * 4.5 * dt;
        _bossGroup.position.z += r2.z * 4.5 * dt;
        if (_stateTimer >= _phase1Durations.STRAFE_RIGHT) _nextPhase1State();
        break;
      }

      case STATES.BACK_PEDAL:
        _facePlayer();
        if (_player && _player.mesh) {
          var bpDx = _bossGroup.position.x - _player.mesh.position.x;
          var bpDz = _bossGroup.position.z - _player.mesh.position.z;
          var bpLen = Math.sqrt(bpDx * bpDx + bpDz * bpDz) || 1;
          _bossGroup.position.x += (bpDx / bpLen) * 3 * dt;
          _bossGroup.position.z += (bpDz / bpLen) * 3 * dt;
        }
        if (_stateTimer >= _phase1Durations.BACK_PEDAL) _nextPhase1State();
        break;

      case STATES.LUNGE: {
        var lungeDur = _phase3Triggered ? 0.45 : 0.9;
        var lungeDmg = _phase3Triggered ? 22 : 18;
        _bossGroup.position.x += _lungeDir.x * 9 * dt;
        _bossGroup.position.z += _lungeDir.z * 9 * dt;

        if (_lungeEvasionWindow) {
          _lungeEvasionTimer -= dt;
          if (_lungeEvasionTimer <= 0) _lungeEvasionWindow = false;
        }

        var dToPlayer = _distToPlayer();
        if (dToPlayer < LUNGE_HIT_RADIUS) {
          if (!_dashPressedRecently) {
            _damagePlayer(lungeDmg);
            _stunPlayer(0.6);
          }
          _nextPhase1State();
        } else if (_stateTimer >= lungeDur) {
          _nextPhase1State();
        }
        break;
      }

      case STATES.REPOSITION: {
        var repAngle = Math.atan2(
          _bossGroup.position.x - _UFO_X,
          _bossGroup.position.z - _UFO_Z
        ) + dt * 2.2;
        var repR = 7;
        _bossGroup.position.x = _UFO_X + Math.sin(repAngle) * repR;
        _bossGroup.position.z = _UFO_Z + Math.cos(repAngle) * repR;
        _facePlayer();
        if (_stateTimer >= _phase1Durations.REPOSITION) _nextPhase1State();
        break;
      }

      case STATES.PHASE2_TRIGGER: {
        // Circle around UFO for 3 laps
        var prevA = _circleAngle;
        _circleAngle += (6.5 / 6) * dt;
        _bossGroup.position.x = _UFO_X + Math.sin(_circleAngle) * 6;
        _bossGroup.position.z = _UFO_Z + Math.cos(_circleAngle) * 6;
        _facePlayer();
        // Count laps (angle wraps every 2π)
        if (Math.floor(_circleAngle / (Math.PI * 2)) > Math.floor(prevA / (Math.PI * 2))) {
          _circleLaps++;
        }
        if (_circleLaps >= 3) _setState(STATES.CIRCLE_SHOOT);
        break;
      }

      case STATES.CIRCLE_SHOOT: {
        _facePlayer();
        // Fire 2 bolts 50ms apart on entry
        if (_stateTimer < 0.016) _fireLaserBolt();
        if (_stateTimer >= 0.05 && _stateTimer < 0.066) _fireLaserBolt();
        if (_stateTimer >= 1.5) {
          _phase1CycleIdx = 0;
          _setState(STATES.STRAFE_LEFT);
        }
        break;
      }

      case STATES.PHASE3_TRIGGER:
        if (_stateTimer >= 0.5) _setState(STATES.PHASE3_ATTACK);
        break;

      case STATES.PHASE3_ATTACK:
        _facePlayer();
        if (_stateTimer >= 0.9) _setState(STATES.LUNGE);
        break;
    }

    _updateLaserBolts(dt);
    _updateDetachedArm(dt);
    _updateShoulderParticles(dt);
    _animateBoss();
  }

  // ─── Public API ──────────────────────────────────────────────────────────────
  window.GreyBossSystem = {
    init: function (scene, camera, player) {
      if (_initialized) return;
      _initialized = true;
      _scene = scene;
      _camera = camera;
      _player = player;
      try {
        _buildUFO();
        _buildBoss();
        console.log('[GreyBossSystem] Initialized — UFO crash site and boss ready');
      } catch (e) {
        console.error('[GreyBossSystem] Init error:', e);
      }
    },

    update: function (delta) {
      try {
        _update(delta || 0.016);
      } catch (e) {
        console.error('[GreyBossSystem] Update error:', e);
      }
    },

    /** External damage call (e.g. from weapon hits) */
    dealDamage: function (amount) {
      if (_state === STATES.DEAD || !_bossActive) return;
      _bossHP = Math.max(0, _bossHP - amount);
      if (_bossHP <= 0) {
        _setState(STATES.DEAD);
        _bossActive = false;
        console.log('[GreyBossSystem] Boss defeated!');
      }
    },

    getBossHP: function () { return _bossHP; },
    getBossGroup: function () { return _bossGroup; },
    getState: function () { return _state; }
  };
}());
