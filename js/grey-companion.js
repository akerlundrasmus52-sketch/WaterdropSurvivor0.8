// js/grey-companion.js — Grey Alien Companion System for Sandbox 2.0
// Spawns and controls the adult Grey companion that fights alongside the player

(function() {
  'use strict';

  // ─── Internal state ───────────────────────────────────────────────────────────
  let _scene, _camera, _player;
  let _initialized = false;
  let _active = false;

  let _companionGroup = null;
  let _torso, _head, _leftArm, _rightArm, _leftLeg, _rightLeg;

  // Combat state
  let _companionHP = 100;
  let _maxHP = 100;
  let _attackCooldown = 0;
  let _attackInterval = 1.5; // seconds between attacks
  let _currentTarget = null;
  let _tick = 0;

  // Movement
  let _followDistance = 3.5;
  let _attackRange = 12;

  // Plasma bolts
  let _plasmaBolts = [];

  // ─── Materials ────────────────────────────────────────────────────────────────
  const GREY_MAT = () => new THREE.MeshLambertMaterial({ color: 0x8a9a8a });
  const PLASMA_MAT = () => new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.9 });

  // ─── Initialize ───────────────────────────────────────────────────────────────
  function init(scene, camera, player) {
    if (!scene || !camera || !player) {
      console.warn('[GreyCompanion] Missing scene, camera, or player');
      return;
    }

    _scene = scene;
    _camera = camera;
    _player = player;
    _initialized = true;

    console.log('[GreyCompanion] System initialized');
  }

  // ─── Check if companion should be active ─────────────────────────────────────
  function _shouldBeActive() {
    const sd = window.saveData;
    if (!sd) return false;

    // Check if adult Grey companion is unlocked
    if (sd.companions && sd.companions.greyAlien && sd.companions.greyAlien.unlocked) {
      return true;
    }

    // Also check incubator state for backward compatibility
    if (sd.incubatorState && sd.incubatorState.stage === 'adult') {
      return true;
    }

    return false;
  }

  // ─── Build companion mesh ────────────────────────────────────────────────────
  function _buildCompanionMesh() {
    _companionGroup = new THREE.Group();

    const greyMat = GREY_MAT();
    const scale = 0.65; // Smaller than the boss

    // Torso
    const bodyGeo = new THREE.SphereGeometry(0.5, 10, 8);
    _torso = new THREE.Mesh(bodyGeo, greyMat);
    _torso.scale.set(0.7 * scale, 1.4 * scale, 0.7 * scale);
    _torso.position.y = 0.9 * scale;
    _companionGroup.add(_torso);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 0.25 * scale, 8);
    const neck = new THREE.Mesh(neckGeo, greyMat);
    neck.position.y = 1.7 * scale;
    _companionGroup.add(neck);

    // Head
    const headGeo = new THREE.SphereGeometry(0.5, 12, 10);
    _head = new THREE.Mesh(headGeo, greyMat);
    _head.scale.set(1.1 * scale, 1.3 * scale, 1.1 * scale);
    _head.position.y = 2.1 * scale;
    _companionGroup.add(_head);

    // Eyes
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: 0x00ffaa });
    const eyeGeo = new THREE.SphereGeometry(0.18 * scale, 8, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.scale.set(1, 0.55, 0.15);
    eyeL.position.set(-0.22 * scale, 2.18 * scale, 0.38 * scale);
    eyeL.rotation.y = 0.44;
    _head.add(eyeL);

    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.scale.set(1, 0.55, 0.15);
    eyeR.position.set(0.22 * scale, 2.18 * scale, 0.38 * scale);
    eyeR.rotation.y = -0.44;
    _head.add(eyeR);

    // Arms
    const armGeo = new THREE.CylinderGeometry(0.07 * scale, 0.07 * scale, 0.6 * scale, 8);
    _leftArm = new THREE.Mesh(armGeo, greyMat);
    _leftArm.position.set(-0.5 * scale, 1.2 * scale, 0);
    _leftArm.rotation.z = 0.3;
    _companionGroup.add(_leftArm);

    _rightArm = new THREE.Mesh(armGeo, greyMat);
    _rightArm.position.set(0.5 * scale, 1.2 * scale, 0);
    _rightArm.rotation.z = -0.3;
    _companionGroup.add(_rightArm);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 0.7 * scale, 8);
    _leftLeg = new THREE.Mesh(legGeo, greyMat);
    _leftLeg.position.set(-0.18 * scale, 0.35 * scale, 0);
    _companionGroup.add(_leftLeg);

    _rightLeg = new THREE.Mesh(legGeo, greyMat);
    _rightLeg.position.set(0.18 * scale, 0.35 * scale, 0);
    _companionGroup.add(_rightLeg);

    // Position near player spawn
    if (_player && _player.mesh) {
      _companionGroup.position.set(
        _player.mesh.position.x + 2,
        0,
        _player.mesh.position.z + 2
      );
    } else {
      _companionGroup.position.set(2, 0, 2);
    }

    _scene.add(_companionGroup);
    console.log('[GreyCompanion] Companion spawned and ready for battle');
  }

  // ─── Animate companion ───────────────────────────────────────────────────────
  function _animateCompanion(dt) {
    if (!_companionGroup) return;

    _tick++;

    // Idle breathing
    const breathe = Math.sin(_tick * 0.05) * 0.03;
    if (_torso) _torso.scale.y = (1.4 * 0.65) + breathe;

    // Head bob
    if (_head) {
      _head.position.y = (2.1 * 0.65) + breathe * 0.5;
    }

    // Walking animation when moving
    const speed = 0.05;
    if (_leftLeg && _rightLeg) {
      _leftLeg.rotation.x = Math.sin(_tick * speed) * 0.3;
      _rightLeg.rotation.x = Math.sin(_tick * speed + Math.PI) * 0.3;
    }

    // Arms swing when walking
    if (_leftArm && _rightArm) {
      _leftArm.rotation.x = Math.sin(_tick * speed + Math.PI) * 0.2;
      _rightArm.rotation.x = Math.sin(_tick * speed) * 0.2;
    }
  }

  // ─── Follow player ───────────────────────────────────────────────────────────
  function _followPlayer(dt) {
    if (!_player || !_player.mesh || !_companionGroup) return;

    const playerPos = _player.mesh.position;
    const companionPos = _companionGroup.position;

    const dx = playerPos.x - companionPos.x;
    const dz = playerPos.z - companionPos.z;
    const distToPlayer = Math.sqrt(dx * dx + dz * dz);

    // Follow if too far from player
    if (distToPlayer > _followDistance) {
      const moveSpeed = 4.5 * dt;
      const dirX = dx / distToPlayer;
      const dirZ = dz / distToPlayer;

      companionPos.x += dirX * moveSpeed;
      companionPos.z += dirZ * moveSpeed;
    }

    // Face direction of movement or target
    if (_currentTarget && _currentTarget.mesh) {
      const targetPos = _currentTarget.mesh.position;
      const angle = Math.atan2(targetPos.x - companionPos.x, targetPos.z - companionPos.z);
      _companionGroup.rotation.y = angle;
    } else if (distToPlayer > _followDistance) {
      const angle = Math.atan2(dx, dz);
      _companionGroup.rotation.y = angle;
    }
  }

  // ─── Find nearest enemy ──────────────────────────────────────────────────────
  function _findNearestEnemy() {
    if (!_companionGroup) return null;

    const enemies = window.enemies || [];
    let nearest = null;
    let minDist = _attackRange;

    const companionPos = _companionGroup.position;

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy || !enemy.mesh || enemy.isDead) continue;

      const enemyPos = enemy.mesh.position;
      const dx = enemyPos.x - companionPos.x;
      const dz = enemyPos.z - companionPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < minDist) {
        minDist = dist;
        nearest = enemy;
      }
    }

    return nearest;
  }

  // ─── Attack enemy ────────────────────────────────────────────────────────────
  function _attackEnemy(dt) {
    _attackCooldown -= dt;

    if (_attackCooldown <= 0) {
      _currentTarget = _findNearestEnemy();

      if (_currentTarget && _currentTarget.mesh) {
        _fireP lasmaBolt();
        _attackCooldown = _attackInterval;
      }
    }
  }

  // ─── Fire plasma bolt ────────────────────────────────────────────────────────
  function _firePlasmaBolt() {
    if (!_companionGroup || !_currentTarget || !_currentTarget.mesh) return;

    const companionPos = _companionGroup.position;
    const targetPos = _currentTarget.mesh.position;

    // Calculate direction
    const dx = targetPos.x - companionPos.x;
    const dy = (targetPos.y + 0.5) - (companionPos.y + 1.2);
    const dz = targetPos.z - companionPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < 0.1) return;

    const dirX = dx / dist;
    const dirY = dy / dist;
    const dirZ = dz / dist;

    // Create plasma bolt mesh
    const boltGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const boltMat = PLASMA_MAT();
    const bolt = new THREE.Mesh(boltGeo, boltMat);

    bolt.position.set(
      companionPos.x,
      companionPos.y + 1.2,
      companionPos.z
    );

    _scene.add(bolt);

    // Add glow
    const glowGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.3
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    bolt.add(glow);

    _plasmaBolts.push({
      mesh: bolt,
      dirX: dirX,
      dirY: dirY,
      dirZ: dirZ,
      damage: 15,
      target: _currentTarget,
      lifetime: 3
    });

    console.log('[GreyCompanion] Plasma bolt fired');
  }

  // ─── Update plasma bolts ─────────────────────────────────────────────────────
  function _updatePlasmaBolts(dt) {
    const boltSpeed = 12;

    for (let i = _plasmaBolts.length - 1; i >= 0; i--) {
      const bolt = _plasmaBolts[i];

      // Move bolt
      bolt.mesh.position.x += bolt.dirX * boltSpeed * dt;
      bolt.mesh.position.y += bolt.dirY * boltSpeed * dt;
      bolt.mesh.position.z += bolt.dirZ * boltSpeed * dt;

      // Decrease lifetime
      bolt.lifetime -= dt;

      // Check collision with target
      let hit = false;
      if (bolt.target && bolt.target.mesh && !bolt.target.isDead) {
        const dx = bolt.mesh.position.x - bolt.target.mesh.position.x;
        const dy = bolt.mesh.position.y - (bolt.target.mesh.position.y + 0.5);
        const dz = bolt.mesh.position.z - bolt.target.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < 1.0) {
          // Apply damage
          if (typeof bolt.target.takeDamage === 'function') {
            bolt.target.takeDamage(bolt.damage);
          } else if (typeof bolt.target.hp !== 'undefined') {
            bolt.target.hp -= bolt.damage;
            if (bolt.target.hp <= 0) {
              bolt.target.isDead = true;
            }
          }
          hit = true;
        }
      }

      // Remove bolt if hit, expired, or out of bounds
      if (hit || bolt.lifetime <= 0 || Math.abs(bolt.mesh.position.y) > 50) {
        _scene.remove(bolt.mesh);
        bolt.mesh.geometry.dispose();
        bolt.mesh.material.dispose();
        if (bolt.mesh.children.length > 0) {
          bolt.mesh.children[0].geometry.dispose();
          bolt.mesh.children[0].material.dispose();
        }
        _plasmaBolts.splice(i, 1);
      }
    }
  }

  // ─── Main update ─────────────────────────────────────────────────────────────
  function update(delta) {
    if (!_initialized) return;

    const dt = delta || 0.016;

    // Check if companion should be active
    const shouldBeActive = _shouldBeActive();

    // Spawn companion if it should be active but hasn't been spawned
    if (shouldBeActive && !_active && !_companionGroup) {
      _buildCompanionMesh();
      _active = true;
    }

    // Despawn if it shouldn't be active
    if (!shouldBeActive && _active && _companionGroup) {
      _scene.remove(_companionGroup);
      _companionGroup = null;
      _active = false;
      console.log('[GreyCompanion] Companion despawned');
      return;
    }

    // Update companion if active
    if (_active && _companionGroup) {
      _animateCompanion(dt);
      _followPlayer(dt);
      _attackEnemy(dt);
      _updatePlasmaBolts(dt);
    }
  }

  // ─── Take damage ─────────────────────────────────────────────────────────────
  function takeDamage(amount) {
    if (!_active) return;

    _companionHP -= amount;
    console.log(`[GreyCompanion] Took ${amount} damage. HP: ${_companionHP}/${_maxHP}`);

    if (_companionHP <= 0) {
      _companionHP = 0;
      _die();
    }
  }

  // ─── Death ───────────────────────────────────────────────────────────────────
  function _die() {
    console.log('[GreyCompanion] Companion defeated');

    if (_companionGroup) {
      // Simple death animation - fade out and fall
      const fadeOut = () => {
        if (!_companionGroup) return;

        _companionGroup.position.y -= 0.02;
        _companionGroup.traverse((child) => {
          if (child.material) {
            child.material.opacity = Math.max(0, child.material.opacity - 0.02);
            child.material.transparent = true;
          }
        });

        if (_companionGroup.position.y < -2) {
          _scene.remove(_companionGroup);
          _companionGroup = null;
          _active = false;
        } else {
          requestAnimationFrame(fadeOut);
        }
      };
      fadeOut();
    }
  }

  // ─── Reset ───────────────────────────────────────────────────────────────────
  function reset() {
    if (_companionGroup) {
      _scene.remove(_companionGroup);
      _companionGroup = null;
    }

    // Clear plasma bolts
    for (let i = 0; i < _plasmaBolts.length; i++) {
      const bolt = _plasmaBolts[i];
      _scene.remove(bolt.mesh);
      bolt.mesh.geometry.dispose();
      bolt.mesh.material.dispose();
    }
    _plasmaBolts = [];

    _active = false;
    _companionHP = _maxHP;
    _attackCooldown = 0;
    _currentTarget = null;
    _tick = 0;

    console.log('[GreyCompanion] System reset');
  }

  // ─── Export ──────────────────────────────────────────────────────────────────
  window.GreyCompanion = {
    init: init,
    update: update,
    takeDamage: takeDamage,
    reset: reset
  };

  console.log('[GreyCompanion] Module loaded');
})();
