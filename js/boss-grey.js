// js/boss-grey.js — Grey Alien Boss System
// Exposes window.GreyBossSystem with init(scene, camera, player) and update(delta).

(function () {
  'use strict';

  // ─── Internal state ───────────────────────────────────────────────────────────
  let _scene, _camera, _player;
  let _initialized = false;

  // UFO crash site
  let _ufoGroup = null;
  let _eggMesh  = null;

  // Boss
  let _bossGroup     = null;
  let _bossVisible   = false;
  let _bossHP        = 100;
  let _bossState     = 'IDLE';
  let _tick          = 0;       // incremented each frame for procedural animation
  let _stateTimer    = 0;       // seconds spent in current state

  // Phase flags
  let _phase2Triggered = false;
  let _phase3Triggered = false;

  // Intro cutscene
  let _introTriggered  = false;
  let _introActive     = false;
  let _introTimer      = 0;
  let _introPanel      = null;
  let _cameraSavedPos  = null;
  let _cameraSavedTarget = null;

  // Phase 2 circle run
  let _circleAngle     = 0;
  let _circleLaps      = 0;
  let _circleLapStart  = 0;

  // Laser bolts
  let _laserBolts      = [];
  let _laserShotTimer  = 0;

  // Detached right arm (phase 3)
  let _detachedArm     = null;
  let _detachedVelY    = 0;
  let _armStump        = null;

  // Lunge evade window
  let _dashTimestamp   = 0;     // last time player dashed (ms)
  let _playerStunRemaining = 0;

  // Mesh node references (set in _buildBossMesh)
  let _torso, _head, _leftArm, _rightArm, _leftLeg, _rightLeg;
  let _leftForearm, _rightForearm;
  let _gunMesh = null;

  // UFO world position
  const UFO_X = 45, UFO_Y = 0, UFO_Z = -30;

  // ─── Materials ────────────────────────────────────────────────────────────────
  const GREY_MAT = () => new THREE.MeshLambertMaterial({ color: 0x8a9a8a });

  // ─── Build UFO crash site ────────────────────────────────────────────────────
  function _buildUFOSite() {
    _ufoGroup = new THREE.Group();
    _ufoGroup.position.set(UFO_X, UFO_Y, UFO_Z);

    // Main disk
    const diskGeo = new THREE.CylinderGeometry(4.5, 4.5, 0.6, 24);
    const diskMat = new THREE.MeshLambertMaterial({ color: 0x778877 });
    const disk    = new THREE.Mesh(diskGeo, diskMat);
    disk.rotation.z = 0.3;
    disk.position.y = 0.3;
    _ufoGroup.add(disk);

    // Dome on top
    const domeGeo = new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.MeshLambertMaterial({
      color: 0x99aaaa,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = 0.7;
    _ufoGroup.add(dome);

    // 4 burn-mark boxes around the disk
    const burnMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const burnOffsets = [
      { x:  5, z:  0 },
      { x: -5, z:  0 },
      { x:  0, z:  5 },
      { x:  0, z: -5 }
    ];
    burnOffsets.forEach(function (o) {
      const bGeo = new THREE.BoxGeometry(1.2, 0.08, 1.2);
      const b    = new THREE.Mesh(bGeo, burnMat);
      b.position.set(o.x, 0.04, o.z);
      _ufoGroup.add(b);
    });

    _scene.add(_ufoGroup);

    // Egg mesh (placed next to the UFO)
    const eggGeo = new THREE.SphereGeometry(0.35, 10, 8);
    const eggMat = new THREE.MeshLambertMaterial({
      color:    0xddccaa,
      emissive: 0x332200
    });
    _eggMesh = new THREE.Mesh(eggGeo, eggMat);
    _eggMesh.scale.y = 1.4;
    _eggMesh.position.set(UFO_X + 6, 0.5, UFO_Z);
    _scene.add(_eggMesh);
  }

  // ─── Build boss mesh ─────────────────────────────────────────────────────────
  function _buildBossMesh() {
    _bossGroup = new THREE.Group();
    _bossGroup.visible = false;

    const greyMat = GREY_MAT();

    // Torso
    const bodyGeo = new THREE.SphereGeometry(0.5, 10, 8);
    _torso = new THREE.Mesh(bodyGeo, greyMat);
    _torso.scale.set(0.7, 1.4, 0.7);
    _torso.position.y = 0.9;
    _bossGroup.add(_torso);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.25, 8);
    const neck = new THREE.Mesh(neckGeo, greyMat);
    neck.position.y = 1.7;
    _bossGroup.add(neck);

    // Head
    const headGeo = new THREE.SphereGeometry(0.5, 12, 10);
    _head = new THREE.Mesh(headGeo, greyMat);
    _head.scale.set(1.1, 1.3, 1.1);
    _head.position.y = 2.1;
    _bossGroup.add(_head);

    // Eyes — flattened spheres, tilted inward 25 degrees
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: 0x0000aa });
    const eyeGeo = new THREE.SphereGeometry(0.18, 8, 6);
    const eyeL   = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.scale.set(1, 0.55, 0.15);
    eyeL.position.set(-0.22, 2.18, 0.38);
    eyeL.rotation.y =  0.44; // ~25 degrees inward
    _head.add(eyeL);

    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.scale.set(1, 0.55, 0.15);
    eyeR.position.set(0.22, 2.18, 0.38);
    eyeR.rotation.y = -0.44;
    _head.add(eyeR);

    // Nostrils
    const nostrilMat = new THREE.MeshLambertMaterial({ color: 0x445544 });
    const nostrilGeo = new THREE.SphereGeometry(0.04, 6, 6);
    [-0.07, 0.07].forEach(function (ox) {
      const n = new THREE.Mesh(nostrilGeo, nostrilMat);
      n.position.set(ox, 1.97, 0.46);
      _bossGroup.add(n);
    });

    // Mouth
    const mouthGeo = new THREE.BoxGeometry(0.2, 0.02, 0.02);
    const mouthMat = new THREE.MeshLambertMaterial({ color: 0x334433 });
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, 1.90, 0.47);
    _bossGroup.add(mouth);

    // ── Arms ──────────────────────────────────────────────────────────────────
    function _makeArm(side) {
      const armGroup = new THREE.Group();
      const xSign = (side === 'L') ? -1 : 1;

      // Upper arm
      const upperGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6);
      const upper     = new THREE.Mesh(upperGeo, greyMat);
      upper.position.set(xSign * 0.15, -0.3, 0);
      armGroup.add(upper);

      // Elbow pivot
      const forearmGroup = new THREE.Group();
      forearmGroup.position.set(xSign * 0.15, -0.65, 0);

      const forearmGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6);
      const forearm    = new THREE.Mesh(forearmGeo, greyMat);
      forearm.position.y = -0.25;
      forearmGroup.add(forearm);

      // 3 fingers spread like a claw
      const fingerGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.35, 5);
      const fingerAngles = [-0.3, 0, 0.3];
      fingerAngles.forEach(function (angle) {
        const finger = new THREE.Mesh(fingerGeo, greyMat);
        finger.position.set(Math.sin(angle) * 0.06, -0.67, Math.cos(angle) * 0.06 - 0.06);
        finger.rotation.x = 0.3 + Math.abs(angle) * 0.2;
        forearmGroup.add(finger);
      });

      armGroup.add(forearmGroup);
      armGroup.position.set(xSign * 0.52, 1.4, 0);

      if (side === 'L') {
        _leftForearm = forearmGroup;
      } else {
        _rightForearm = forearmGroup;
      }

      return armGroup;
    }

    _leftArm  = _makeArm('L');
    _rightArm = _makeArm('R');
    _bossGroup.add(_leftArm);
    _bossGroup.add(_rightArm);

    // ── Legs ──────────────────────────────────────────────────────────────────
    function _makeLeg(side) {
      const legGroup = new THREE.Group();
      const xSign = (side === 'L') ? -1 : 1;

      const upperGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6);
      const upper    = new THREE.Mesh(upperGeo, greyMat);
      upper.position.y = -0.25;
      legGroup.add(upper);

      // Lower leg
      const lowerGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.45, 6);
      const lower    = new THREE.Mesh(lowerGeo, greyMat);
      lower.position.y = -0.72;
      legGroup.add(lower);

      // Oval foot
      const footGeo = new THREE.SphereGeometry(0.1, 8, 6);
      const foot    = new THREE.Mesh(footGeo, greyMat);
      foot.scale.set(0.7, 0.35, 1.4);
      foot.position.set(xSign * 0.04, -0.98, 0.08);
      legGroup.add(foot);

      legGroup.position.set(xSign * 0.22, 0.5, 0);
      return legGroup;
    }

    _leftLeg  = _makeLeg('L');
    _rightLeg = _makeLeg('R');
    _bossGroup.add(_leftLeg);
    _bossGroup.add(_rightLeg);

    // Place boss at world position near UFO
    _bossGroup.position.set(UFO_X + 3, 0, UFO_Z + 4);
    _scene.add(_bossGroup);
  }

  // ─── Boss intro cutscene ─────────────────────────────────────────────────────
  function _startIntroCutscene() {
    _introActive = true;
    _introTimer  = 0;
    window._bossIntroActive = true;

    // Pause the game loop so player cannot move/attack during cutscene
    window.isPaused = true;

    // Save camera state
    _cameraSavedPos = _camera.position.clone();

    _introPanel = null;
  }

  function _tickIntroCutscene(dt) {
    _introTimer += dt;

    // Lerp camera toward boss position + offset
    const targetPos = new THREE.Vector3(
      _bossGroup.position.x,
      _bossGroup.position.y + 4,
      _bossGroup.position.z + 6
    );
    _camera.position.lerp(targetPos, 0.04);
    _camera.lookAt(_bossGroup.position);

    // After 0.8s show the intro panel
    if (_introTimer >= 0.8 && !_introPanel) {
      _showIntroBossPanel();
    }

    // After 2.2s slide panel out
    if (_introTimer >= 2.2 && _introPanel) {
      _introPanel.style.transition = 'transform 0.5s ease-in';
      _introPanel.style.transform  = 'translateX(-120%)';
      setTimeout(function () {
        if (_introPanel && _introPanel.parentNode) {
          _introPanel.parentNode.removeChild(_introPanel);
        }
        _introPanel = null;
      }, 500);
    }

    // After 3.0s lerp camera back and end cutscene
    if (_introTimer >= 3.0) {
      if (_cameraSavedPos) {
        _camera.position.lerp(_cameraSavedPos, 0.04);
      }
    }
    if (_introTimer >= 4.0) {
      _endIntroCutscene();
    }
  }

  function _showIntroBossPanel() {
    const panel = document.createElement('div');
    panel.id    = 'boss-intro-panel';
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
      'transition:transform 0.5s ease-out'
    ].join(';');

    // Canvas alien face
    const canvas = document.createElement('canvas');
    canvas.width  = 60;
    canvas.height = 80;
    canvas.style.display = 'block';
    canvas.style.margin  = '0 auto 12px';
    const ctx = canvas.getContext('2d');
    _drawAlienFaceOnCanvas(ctx, canvas.width, canvas.height);
    panel.appendChild(canvas);

    // Title
    const title = document.createElement('div');
    title.textContent = 'THE LAST GREY';
    title.style.cssText = 'color:#ffffff;font-size:2.2rem;letter-spacing:0.18em;font-family:monospace;';
    panel.appendChild(title);

    // Subtitle
    const sub = document.createElement('div');
    sub.textContent = '— Boss —';
    sub.style.cssText = 'color:#cc2222;font-size:0.9rem;margin-top:6px;font-family:monospace;';
    panel.appendChild(sub);

    document.body.appendChild(panel);
    _introPanel = panel;

    // Trigger slide-in
    requestAnimationFrame(function () {
      panel.style.transform = 'translate(-50%,-50%) translateX(0)';
    });
  }

  function _drawAlienFaceOnCanvas(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);

    // Oval head
    ctx.fillStyle = '#8a9a8a';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.45, w * 0.38, h * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();

    // Almond eyes
    ctx.fillStyle = '#000000';
    [[w * 0.32, h * 0.38], [w * 0.68, h * 0.38]].forEach(function (pos) {
      ctx.beginPath();
      ctx.ellipse(pos[0], pos[1], w * 0.13, h * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Nostril dots
    ctx.fillStyle = '#445544';
    [[w * 0.44, h * 0.52], [w * 0.56, h * 0.52]].forEach(function (pos) {
      ctx.beginPath();
      ctx.arc(pos[0], pos[1], 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Thin mouth
    ctx.strokeStyle = '#334433';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.38, h * 0.60);
    ctx.lineTo(w * 0.62, h * 0.60);
    ctx.stroke();
  }

  function _endIntroCutscene() {
    _introActive = false;
    window._bossIntroActive = false;

    // Resume the game loop
    window.isPaused = false;

    _setState('PHASE1');
  }

  // ─── State machine ───────────────────────────────────────────────────────────
  function _setState(newState) {
    _bossState  = newState;
    _stateTimer = 0;
  }

  // Phase 1 cycle: STRAFE_LEFT → STRAFE_RIGHT → BACK_PEDAL → LUNGE → REPOSITION
  function _nextPhase1State() {
    switch (_bossState) {
      case 'STRAFE_LEFT':   _setState('STRAFE_RIGHT');  break;
      case 'STRAFE_RIGHT':  _setState('BACK_PEDAL');    break;
      case 'BACK_PEDAL':    _setState('LUNGE');          break;
      case 'LUNGE':         _setState('REPOSITION');     break;
      case 'REPOSITION':    _setState('STRAFE_LEFT');    break;
      default:              _setState('STRAFE_LEFT');    break;
    }
  }

  // ─── Add gun to right hand ────────────────────────────────────────────────
  function _addGun() {
    if (_gunMesh || !_rightForearm) return;
    const gunGeo = new THREE.BoxGeometry(0.08, 0.08, 0.4);
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    _gunMesh = new THREE.Mesh(gunGeo, gunMat);
    _gunMesh.position.set(0, -0.8, 0.2);
    _rightForearm.add(_gunMesh);
  }

  function _removeGun() {
    if (!_gunMesh) return;
    if (_gunMesh.parent) _gunMesh.parent.remove(_gunMesh);
    _gunMesh = null;
  }

  // ─── Fire laser bolt ─────────────────────────────────────────────────────────
  function _fireLaser() {
    if (!_player || !_player.mesh) return;
    const origin = _bossGroup.position.clone();
    origin.y += 1.5;
    const dir = _player.mesh.position.clone().sub(origin).normalize();

    const boltGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.33, 6);
    const boltMat = new THREE.MeshLambertMaterial({ color: 0xff0000, emissive: 0xff0000 });
    const bolt    = new THREE.Mesh(boltGeo, boltMat);
    bolt.rotation.x = Math.PI / 2;
    bolt.position.copy(origin);

    const velocity = dir.multiplyScalar(18);
    _scene.add(bolt);
    _laserBolts.push({ mesh: bolt, vel: velocity, life: 3 });
  }

  // ─── Phase 3: detach right arm ────────────────────────────────────────────────
  function _detachRightArm() {
    if (!_rightArm || _detachedArm) return;

    // Remove from boss group, add directly to scene
    const worldPos = new THREE.Vector3();
    _rightArm.getWorldPosition(worldPos);
    _bossGroup.remove(_rightArm);
    _rightArm.position.copy(worldPos);
    _scene.add(_rightArm);
    _detachedArm = _rightArm;
    _detachedVelY = 2;
    _rightArm = null;
    _rightForearm = null;

    // Red particle burst at right shoulder
    _spawnRedBurst(worldPos);

    // Red CircleGeometry stump at right shoulder
    const stumpGeo = new THREE.CircleGeometry(0.12, 8);
    const stumpMat = new THREE.MeshLambertMaterial({ color: 0xcc1111, side: THREE.DoubleSide });
    _armStump = new THREE.Mesh(stumpGeo, stumpMat);
    _armStump.position.set(0.52, 1.4, 0);
    _armStump.rotation.z = Math.PI / 2;
    _bossGroup.add(_armStump);
  }

  function _spawnRedBurst(pos) {
    for (let i = 0; i < 12; i++) {
      const pGeo = new THREE.SphereGeometry(0.06, 4, 4);
      const pMat = new THREE.MeshLambertMaterial({ color: 0xff2200 });
      const p    = new THREE.Mesh(pGeo, pMat);
      p.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3,
        (Math.random() - 0.5) * 4
      );
      _scene.add(p);
      // Animate out and remove
      let life = 0.8;
      const tickFn = function (dt) {
        life -= dt;
        p.position.addScaledVector(vel, dt);
        vel.y -= 9.8 * dt;
        p.scale.setScalar(Math.max(0, life));
        if (life <= 0) {
          _scene.remove(p);
          p.geometry.dispose();
          p.material.dispose();
          return true; // signal done
        }
        return false;
      };
      _particleTickFns.push(tickFn);
    }
  }

  let _particleTickFns = [];

  // ─── Egg pickup HUD message ───────────────────────────────────────────────────
  function _showHUDMessage(text, durationMs) {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.cssText = [
      'position:fixed',
      'bottom:120px',
      'left:50%',
      'transform:translateX(-50%)',
      'color:#ffffff',
      'font-size:1.1rem',
      'font-family:monospace',
      'background:rgba(0,0,0,0.7)',
      'padding:8px 18px',
      'border-radius:8px',
      'z-index:9998',
      'pointer-events:none'
    ].join(';');
    document.body.appendChild(div);
    setTimeout(function () {
      if (div.parentNode) div.parentNode.removeChild(div);
    }, durationMs || 2000);
  }

  // ─── Check if boss should activate ───────────────────────────────────────────
  function _isQuestActive(questId) {
    // Check various quest storage locations
    try {
      if (window.gameState && window.gameState.activeQuests) {
        if (Array.isArray(window.gameState.activeQuests)) {
          return window.gameState.activeQuests.some(function (q) {
            return (q === questId) || (q && q.id === questId);
          });
        }
      }
      const sd = window.saveData || (window.SaveSystem && window.SaveSystem.load && window.SaveSystem.load());
      if (sd && sd.activeQuests) {
        if (Array.isArray(sd.activeQuests)) {
          return sd.activeQuests.some(function (q) {
            return (q === questId) || (q && q.id === questId);
          });
        }
      }
    } catch (e) {}
    return false;
  }

  function _shouldBossBeActive() {
    return _isQuestActive('investigate_ufo_crash') || _isQuestActive('retrieve_grey_egg');
  }

  // ─── Main update ──────────────────────────────────────────────────────────────
  function _update(delta) {
    if (!_initialized) return;
    const dt = delta || 0.016;
    _tick += 1;

    // Animate egg
    if (_eggMesh) {
      _eggMesh.rotation.y += dt * 0.6;
      const pulse = 1 + Math.sin(_tick * 0.07) * 0.04;
      _eggMesh.scale.set(pulse, 1.4 * pulse, pulse);
    }

    // Particle tick functions
    _particleTickFns = _particleTickFns.filter(function (fn) { return !fn(dt); });

    // Laser bolts
    _updateLaserBolts(dt);

    // Detached arm gravity/tumble — dt-seconds physics
    if (_detachedArm) {
      const DETACH_GRAVITY = -1.2; // ~0.02/frame at 60 FPS expressed as units/sec²
      _detachedVelY += DETACH_GRAVITY * dt;
      _detachedArm.position.y += _detachedVelY * dt;
      _detachedArm.rotation.x += dt * 2;
      _detachedArm.rotation.z += dt * 1.3;
      if (_detachedArm.position.y < -5) {
        _scene.remove(_detachedArm);
        _detachedArm = null;
      }
    }

    // Stun countdown
    if (_playerStunRemaining > 0) {
      _playerStunRemaining -= dt;
    }

    // Check boss activation — only when a relevant quest is active
    const bossShouldBeActive = _shouldBossBeActive();
    if (!_bossVisible && bossShouldBeActive) {
      _bossVisible = true;
      _bossGroup.visible = true;
    }

    // Dead boss: only allow egg pickup logic
    if (_bossState === 'DEAD') {
      _checkEggPickup(dt);
      return;
    }

    // Trigger intro when player first approaches (quest-gated)
    if (_bossState === 'IDLE' && bossShouldBeActive && !_introTriggered && _player && _player.mesh && _bossGroup) {
      const dist = _player.mesh.position.distanceTo(_bossGroup.position);
      if (dist < 18) {
        _introTriggered    = true;
        _bossVisible       = true;
        _bossGroup.visible = true;
        _startIntroCutscene();
        _setState('INTRO_CUTSCENE');
        return;
      }
    }

    // If the boss is not yet visible (quest not active), skip all combat logic
    if (!_bossVisible) {
      return;
    }

    _stateTimer += dt;

    // Intro cutscene tick
    if (_bossState === 'INTRO_CUTSCENE') {
      _tickIntroCutscene(dt);
      return;
    }

    // Procedural boss animations
    _animateBoss(dt);

    // Phase 2 trigger
    if (!_phase2Triggered && _bossHP <= 50 && _bossHP > 0) {
      _phase2Triggered = true;
      _circleAngle     = 0;
      _circleLaps      = 0;
      _circleLapStart  = _circleAngle;
      _addGun();
      _setState('PHASE2_TRIGGER');
    }

    // Phase 3 trigger
    if (!_phase3Triggered && _bossHP <= 15 && _bossHP > 0) {
      _phase3Triggered = true;
      _removeGun();
      _detachRightArm();
      _setState('PHASE3_TRIGGER');
    }

    // Run state
    _runState(dt);
  }

  function _animateBoss(dt) {
    // Leg alternation
    if (_leftLeg)  _leftLeg.rotation.x  =  Math.sin(_tick * 0.18) * 0.6;
    if (_rightLeg) _rightLeg.rotation.x = -Math.sin(_tick * 0.18) * 0.6;

    // Arms swing opposite
    if (_leftArm)  _leftArm.rotation.x  = -Math.sin(_tick * 0.18) * 0.6;
    if (_rightArm) _rightArm.rotation.x =  Math.sin(_tick * 0.18) * 0.6;

    // Torso breathe
    if (_torso) {
      _torso.scale.y = 1.4 * (1 + Math.sin(_tick * 0.04) * 0.02);
    }

    // Head sway
    if (_head) {
      _head.rotation.z = Math.sin(_tick * 0.09) * 0.05;
    }

    // LUNGE: arms lerp toward 1.2
    if (_bossState === 'LUNGE') {
      if (_leftArm) {
        _leftArm.rotation.x  += (1.2 - _leftArm.rotation.x)  * 0.15;
      }
      if (_rightArm) {
        _rightArm.rotation.x += (1.2 - _rightArm.rotation.x) * 0.15;
      }
    }
  }

  function _runState(dt) {
    if (!_player || !_player.mesh) return;

    const bPos  = _bossGroup.position;
    const pPos  = _player.mesh.position;
    const diff  = new THREE.Vector3().subVectors(pPos, bPos);
    diff.y      = 0;
    const dist  = diff.length();
    const dir   = diff.clone().normalize();
    const perp  = new THREE.Vector3(-dir.z, 0, dir.x);

    // Face player
    _bossGroup.lookAt(new THREE.Vector3(pPos.x, bPos.y, pPos.z));

    const lungeCooldown = _phase3Triggered ? 0.45 : 0.9;

    switch (_bossState) {
      case 'PHASE1':
        _setState('STRAFE_LEFT');
        break;

      case 'STRAFE_LEFT':
        bPos.addScaledVector(perp, -4.5 * dt);
        if (_stateTimer >= 2.5) _nextPhase1State();
        break;

      case 'STRAFE_RIGHT':
        bPos.addScaledVector(perp, 4.5 * dt);
        if (_stateTimer >= 2.5) _nextPhase1State();
        break;

      case 'BACK_PEDAL':
        bPos.addScaledVector(dir, -4.5 * dt);
        if (_stateTimer >= 1.8) _nextPhase1State();
        break;

      case 'LUNGE':
        bPos.addScaledVector(dir, 8 * dt);
        // Check impact
        if (dist < 1.2) {
          // Evasion check: player is actively dashing at moment of impact
          if (_isPlayerDashing()) {
            // Evaded!
            _nextPhase1State();
          } else {
            // Deal damage
            const dmg = _phase3Triggered ? 22 : 18;
            _dealDamageToPlayer(dmg);
            _playerStunRemaining = 0.6;
            _nextPhase1State();
          }
        }
        if (_stateTimer >= lungeCooldown) _nextPhase1State();
        break;

      case 'REPOSITION':
        // Circle around UFO origin
        {
          const ufoPos = new THREE.Vector3(UFO_X, 0, UFO_Z);
          const toUFO  = new THREE.Vector3().subVectors(ufoPos, bPos);
          toUFO.y = 0;
          bPos.addScaledVector(toUFO.normalize(), 3 * dt);
        }
        if (_stateTimer >= 1.2) _nextPhase1State();
        break;

      // ── Phase 2 ─────────────────────────────────────────────────────────────
      case 'PHASE2_TRIGGER':
        // Run 3 laps around UFO
        {
          const ufoPos = new THREE.Vector3(UFO_X, 0, UFO_Z);
          _circleAngle += (6.5 / 6) * dt; // angular speed = linear speed / radius
          if (_circleAngle - _circleLapStart >= Math.PI * 2) {
            _circleLaps++;
            _circleLapStart = _circleAngle;
          }
          const cx = ufoPos.x + Math.cos(_circleAngle) * 6;
          const cz = ufoPos.z + Math.sin(_circleAngle) * 6;
          bPos.set(cx, 0, cz);
          if (_circleLaps >= 3) {
            _setState('CIRCLE_SHOOT');
          }
        }
        break;

      case 'CIRCLE_SHOOT':
        // Shoot 2 laser bolts 50ms apart then do next phase 2 cycle
        _laserShotTimer += dt;
        if (_laserShotTimer >= 0.5) {
          _laserShotTimer = 0;
          _fireLaser();
          setTimeout(_fireLaser, 50);
          if (_phase2Triggered) {
            _setState('STRAFE_LEFT');
          }
        }
        break;

      // ── Phase 3 ─────────────────────────────────────────────────────────────
      case 'PHASE3_TRIGGER':
        // Short pause then enter phase 3 attacks
        if (_stateTimer >= 0.5) {
          _setState('PHASE3_ATTACK');
        }
        break;

      case 'PHASE3_ATTACK':
        // Same as LUNGE but single-arm
        bPos.addScaledVector(dir, 8 * dt);
        if (dist < 1.2) {
          if (!_isPlayerDashing()) {
            _dealDamageToPlayer(22);
            _playerStunRemaining = 0.6;
          }
          _setState('BACK_PEDAL');
        }
        if (_stateTimer >= 0.9) _setState('BACK_PEDAL');
        break;
    }
  }

  // ─── Laser bolt updates ───────────────────────────────────────────────────────
  function _updateLaserBolts(dt) {
    const alive = [];
    for (let i = 0; i < _laserBolts.length; i++) {
      const b = _laserBolts[i];
      b.mesh.position.addScaledVector(b.vel, dt);
      b.life -= dt;

      // Hit player check
      if (_player && _player.mesh) {
        const dist = b.mesh.position.distanceTo(_player.mesh.position);
        if (dist < 0.8) {
          _dealDamageToPlayer(25);
          _scene.remove(b.mesh);
          b.mesh.geometry.dispose();
          b.mesh.material.dispose();
          continue;
        }
      }

      if (b.life <= 0) {
        _scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        continue;
      }
      alive.push(b);
    }
    _laserBolts = alive;
  }

  // ─── Deal damage to player ────────────────────────────────────────────────────
  function _dealDamageToPlayer(amount) {
    try {
      if (_player && typeof _player.takeDamage === 'function') {
        _player.takeDamage(amount);
        return;
      }
      if (typeof window.playerHP !== 'undefined') {
        window.playerHP = Math.max(0, window.playerHP - amount);
      }
      if (typeof window._dealDamageToPlayer === 'function') {
        window._dealDamageToPlayer(amount);
      }
    } catch (e) {}
  }

  // ─── Deal damage to boss (called from sandbox-loop hit detection) ─────────────
  function _dealDamageToBoss(amount) {
    if (_bossState === 'DEAD') return;
    _bossHP -= amount;
    if (_bossHP <= 0) {
      _bossHP = 0;
      _onBossDead();
    }
  }

  function _onBossDead() {
    _setState('DEAD');
    // Play death effect
    if (_bossGroup) {
      _spawnRedBurst(_bossGroup.position.clone().add(new THREE.Vector3(0, 1, 0)));
    }
    // Collapse boss
    if (_bossGroup) {
      _bossGroup.rotation.z = Math.PI / 2;
    }
  }

  // ─── Egg pickup check ─────────────────────────────────────────────────────────
  function _checkEggPickup(dt) {
    if (!_eggMesh || !_player || !_player.mesh) return;
    const dist = _eggMesh.position.distanceTo(_player.mesh.position);
    if (dist < 1.5) {
      _scene.remove(_eggMesh);
      _eggMesh.geometry.dispose();
      _eggMesh.material.dispose();
      _eggMesh = null;

      // Add to inventory
      if (window.gameState && window.gameState.inventory) {
        if (Array.isArray(window.gameState.inventory)) {
          window.gameState.inventory.push('grey_companion_egg');
        }
      } else {
        if (!window.playerInventory) window.playerInventory = [];
        window.playerInventory.push('grey_companion_egg');
      }

      _showHUDMessage('You found The Grey Egg 🥚', 2000);
    }
  }

  // ─── Check whether the player is actively dashing ────────────────────────────
  // player-class.js exposes player.isDashing (boolean property at line 435).
  // Falls back to a recent-keydown timestamp when the property isn't available.
  function _isPlayerDashing() {
    if (_player) {
      // Prefer the actual isDashing flag from player-class.js
      if (typeof _player.isDashing === 'boolean') {
        return _player.isDashing;
      }
      // Fallback: check nested dash state objects
      if (_player.dash && typeof _player.dash === 'object') {
        if ('isActive' in _player.dash) return !!_player.dash.isActive;
        if ('active'   in _player.dash) return !!_player.dash.active;
      }
    }
    // Legacy fallback: treat any recent Space/Shift press (within 0.4s) as a dash
    return (performance.now() - _dashTimestamp) / 1000 <= 0.4;
  }

  // Keep a fallback timestamp for the legacy code path above
  function _initDashListener() {
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        _dashTimestamp = performance.now();
      }
    });
  }

  // ─── Public API ───────────────────────────────────────────────────────────────
  window.GreyBossSystem = {
    init: function (scene, camera, player) {
      if (_initialized) return;
      _scene  = scene;
      _camera = camera;
      _player = player;
      _initialized = true;

      _buildUFOSite();
      _buildBossMesh();
      _initDashListener();

      // Expose damage hook so sandbox hit-detection can call it
      window._greyBossTakeDamage = _dealDamageToBoss;
    },

    // Force-activate the boss, bypassing the quest gate (used by wave milestones)
    spawn: function () {
      if (!_initialized || _bossState === 'DEAD') return;
      _bossVisible = true;
      if (_bossGroup) _bossGroup.visible = true;
      if (!_introTriggered) {
        _introTriggered = true;
        _startIntroCutscene();
        _setState('INTRO_CUTSCENE');
      }
    },

    update: function (delta) {
      _update(delta);
    },

    // Read-only state accessors (useful for UI/debug)
    getHP:           function () { return _bossHP; },
    getState:        function () { return _bossState; },
    isDead:          function () { return _bossState === 'DEAD'; },
    getBossPosition: function () { return _bossGroup ? _bossGroup.position : null; }
  };

})();
