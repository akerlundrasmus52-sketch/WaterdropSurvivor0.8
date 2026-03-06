// js/enemy-class.js — DroneTurret helper, water particle pool, and Enemy class.
// Contains all enemy AI, pathfinding, attack logic, death effects, and hard-mode tank enemies.
// Depends on: THREE (CDN), variables from main.js and player-class.js

    let hardTankGeometryCache = null;

    // Water particle pool for player physics effects
    const waterParticlePool = [];
    const MAX_WATER_PARTICLES = 20;
    let waterParticleGeom = null;
    let waterParticleMat = null;

    // Pre-allocated constants for enemy update() — avoids per-frame Set/allocation
    const _ENEMY_FLYING_TYPES = new Set([5, 11, 14, 16]);
    const _TREE_COLL_R = 1.0;
    const _PROP_COLL_R = 0.7;
    const _FENCE_COLL_R = 0.6;
    // Shared blood stain geometry (avoids per-hit CircleGeometry creation)
    let _sharedBloodStainGeo = null;
    // Shared blood drip geometry (avoids per-hit SphereGeometry creation)
    let _sharedBloodDripGeo = null;
    // Module-scoped temp vector for takeDamage() blood/hit direction — avoids per-hit allocation
    const _tmpHitDir = new THREE.Vector3();

    function spawnWaterParticle(pos) {
      if (!scene) return;
      let p = waterParticlePool.find(x => !x.active);
      if (!p) {
        if (waterParticlePool.length >= MAX_WATER_PARTICLES) return;
        if (!waterParticleGeom) waterParticleGeom = new THREE.SphereGeometry(0.12, 4, 4);
        if (!waterParticleMat) waterParticleMat = new THREE.MeshBasicMaterial({ color: 0x44aabb, transparent: true, opacity: 0.7 });
        const mesh = new THREE.Mesh(waterParticleGeom, waterParticleMat.clone());
        p = { mesh, active: false, life: 0, vx: 0, vy: 0, vz: 0 };
        scene.add(p.mesh);
        waterParticlePool.push(p);
      }
      p.active = true;
      p.life = 0.5;
      p.mesh.position.set(pos.x + (Math.random()-0.5)*0.5, pos.y + Math.random()*0.5, pos.z + (Math.random()-0.5)*0.5);
      p.mesh.scale.setScalar(1);
      p.mesh.material.opacity = 0.7;
      p.vx = (Math.random()-0.5)*4;
      p.vy = Math.random()*3+1;
      p.vz = (Math.random()-0.5)*4;
      p.mesh.visible = true;
    }

    function updateWaterParticles(delta) {
      for (const p of waterParticlePool) {
        if (!p.active) continue;
        p.life -= delta;
        if (p.life <= 0) { p.active = false; p.mesh.visible = false; continue; }
        p.mesh.position.x += p.vx * delta;
        p.mesh.position.y += p.vy * delta;
        p.mesh.position.z += p.vz * delta;
        p.vy -= 9.8 * delta;
        const lifeFrac = p.life / 0.5;
        p.mesh.scale.setScalar(lifeFrac * 0.8);
        p.mesh.material.opacity = lifeFrac * 0.7;
      }
    }
    function getHardTankGeometry() {
      if (!hardTankGeometryCache) {
        const geometry = new THREE.SphereGeometry(0.6, 8, 8);
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          const y = positions.getY(i);
          const z = positions.getZ(i);
          const noiseX = 1 + (Math.random() - 0.5) * 0.3;
          const noiseY = 1 + (Math.random() - 0.5) * 0.3;
          const noiseZ = 1 + (Math.random() - 0.5) * 0.3;
          positions.setX(i, x * noiseX);
          positions.setY(i, y * noiseY);
          positions.setZ(i, z * noiseZ);
        }
        geometry.computeVertexNormals();
        hardTankGeometryCache = geometry;
      }
      return hardTankGeometryCache;
    }

    // Drone Turret class - New weapon replacing Lightning
    class DroneTurret {
      constructor(player) {
        this.player = player;
        this.offset = new THREE.Vector3(2, 1.5, 0); // Initial hover position relative to player
        this.wobblePhase = Math.random() * Math.PI * 2; // Random starting phase
        
        // Create drone body - small mechanical unit
        const bodyGeo = new THREE.BoxGeometry(0.4, 0.3, 0.4);
        const bodyMat = new THREE.MeshToonMaterial({ 
          color: 0x808080, // Gray metallic
          emissive: 0x404040,
          emissiveIntensity: 0.3
        });
        this.mesh = new THREE.Mesh(bodyGeo, bodyMat);
        scene.add(this.mesh);
        
        // Add glowing core
        const coreGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const coreMat = new THREE.MeshBasicMaterial({ 
          color: 0x00FFFF, // Cyan glow
          transparent: true,
          opacity: 0.8
        });
        this.core = new THREE.Mesh(coreGeo, coreMat);
        this.core.position.y = 0;
        this.mesh.add(this.core);
        
        // Add propellers/rotors on top
        const propGeo = new THREE.BoxGeometry(0.6, 0.05, 0.1);
        const propMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
        this.propeller1 = new THREE.Mesh(propGeo, propMat);
        this.propeller1.position.y = 0.2;
        this.mesh.add(this.propeller1);
        
        this.propeller2 = new THREE.Mesh(propGeo, propMat);
        this.propeller2.position.y = 0.2;
        this.propeller2.rotation.y = Math.PI / 2;
        this.mesh.add(this.propeller2);
        
        // Add small barrel/gun
        const barrelGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6);
        const barrelMat = new THREE.MeshToonMaterial({ color: 0x222222 });
        this.barrel = new THREE.Mesh(barrelGeo, barrelMat);
        this.barrel.rotation.x = Math.PI / 2;
        this.barrel.position.z = 0.3;
        this.barrel.position.y = -0.1;
        this.mesh.add(this.barrel);
        
        this.active = true;
        this.shootTimer = 0;
      }
      
      update(dt) {
        if (!this.active) {
          this.mesh.visible = false;
          return;
        }
        
        this.mesh.visible = true;
        
        // Hover near player with smooth bobbing motion
        this.wobblePhase += dt * 3;
        const bobHeight = Math.sin(this.wobblePhase) * 0.2;
        
        // Target position relative to player
        const targetX = this.player.mesh.position.x + this.offset.x;
        const targetY = this.player.mesh.position.y + this.offset.y + bobHeight;
        const targetZ = this.player.mesh.position.z + this.offset.z;
        
        // Smooth follow with lerp (frame-rate independent)
        const lerpSpeed = 0.1 / dt; // Normalize for frame rate
        const lerpFactor = Math.min(1, dt * 6); // Cap at 1.0, smooth at 60fps
        this.mesh.position.x += (targetX - this.mesh.position.x) * lerpFactor;
        this.mesh.position.y += (targetY - this.mesh.position.y) * lerpFactor;
        this.mesh.position.z += (targetZ - this.mesh.position.z) * lerpFactor;
        
        // Rotate propellers (frame-rate independent)
        this.propeller1.rotation.y += 0.3 * dt * 60; // Normalized for 60fps
        this.propeller2.rotation.y += 0.3 * dt * 60;
        
        // Pulse core
        this.core.material.opacity = 0.6 + Math.sin(gameTime * 5) * 0.2;
        
        // Find and track nearest enemy (squared distance avoids sqrt)
        let nearestEnemy = null;
        let minDistSq = weapons.droneTurret.range * weapons.droneTurret.range;
        
        for (let e of enemies) {
          if (e.isDead) continue;
          const distSq = this.mesh.position.distanceToSquared(e.mesh.position);
          if (distSq < minDistSq) {
            minDistSq = distSq;
            nearestEnemy = e;
          }
        }
        
        // Aim barrel at target
        if (nearestEnemy) {
          const dx = nearestEnemy.mesh.position.x - this.mesh.position.x;
          const dz = nearestEnemy.mesh.position.z - this.mesh.position.z;
          const angle = Math.atan2(dx, dz);
          this.mesh.rotation.y = angle;
        }
      }
      
      destroy() {
        if (this.mesh) {
          scene.remove(this.mesh);
          this.mesh.geometry.dispose();
          this.mesh.material.dispose();
          if (this.core) {
            this.core.geometry.dispose();
            this.core.material.dispose();
          }
          if (this.propeller1) {
            this.propeller1.geometry.dispose();
            this.propeller1.material.dispose();
          }
          if (this.propeller2) {
            this.propeller2.geometry.dispose();
            this.propeller2.material.dispose();
          }
          if (this.barrel) {
            this.barrel.geometry.dispose();
            this.barrel.material.dispose();
          }
        }
      }
    }

    class Enemy {
      constructor(type, x, z, playerLevel = 1) {
        this.type = type; // 0: Tank, 1: Fast, 2: Balanced, 3: Slowing, 4: Ranged, 5: Flying, 6: Hard Tank, 7: Hard Fast, 8: Hard Balanced, 9: Elite, 10: MiniBoss, 11: FlyingBoss, 12: BugRanged, 13: BugSlow, 14: BugFast
        let geometry;
        let color;
        
        // Enemy scaling based on player level - NOT SPEED, just HP and DAMAGE
        // Progressive difficulty: 20% per level to force use of all upgrades
        const levelScaling = 1 + (playerLevel - 1) * 0.20;
        
        if (type === 0) {
          // Bacteria/Amoeba - Squishy organic blob shape
          geometry = new THREE.SphereGeometry(0.6, 8, 8);
          // Modify geometry to make it irregular/organic
          const positions = geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);
            // Add different randomness for each axis for truly organic look
            const noiseX = 1 + (Math.random() - 0.5) * 0.3;
            const noiseY = 1 + (Math.random() - 0.5) * 0.3;
            const noiseZ = 1 + (Math.random() - 0.5) * 0.3;
            positions.setX(i, x * noiseX);
            positions.setY(i, y * noiseY);
            positions.setZ(i, z * noiseZ);
          }
          geometry.computeVertexNormals();
          color = COLORS.enemySquare; // Pink/Hot Pink - Tanky
        } else if (type === 1) {
          // Water Bug - Elongated with segments
          geometry = new THREE.CapsuleGeometry(0.3, 0.8, 6, 8);
          color = COLORS.enemyTriangle; // Gold - Fast
        } else if (type === 2) {
          // Microbe - Round squishy
          geometry = new THREE.DodecahedronGeometry(0.5, 0);
          color = COLORS.enemyRound; // Purple - Balanced
        } else if (type === 3) {
          // Slowing Enemy - Spiky/icy appearance
          geometry = new THREE.IcosahedronGeometry(0.55, 0);
          color = 0x00FFFF; // Cyan - Slowing
        } else if (type === 4) {
          // Ranged Enemy - Different shape, angular
          geometry = new THREE.TetrahedronGeometry(0.6, 0);
          color = 0xFF6347; // Tomato red - Ranged
        } else if (type === 5) {
          // Flying Enemy - Octahedron
          geometry = new THREE.OctahedronGeometry(0.5, 1);
          color = 0x87CEEB; // Sky blue - Flying
        } else if (type === 6) {
          // Hard Tank - use cached deformed geometry for performance
          geometry = getHardTankGeometry();
          color = 0xFF1493; // Deep pink - Hard Tank
        } else if (type === 7) {
          // Hard Fast
          geometry = new THREE.CapsuleGeometry(0.3, 0.8, 6, 8);
          color = 0xFFD700; // Gold - Hard Fast
        } else if (type === 8) {
          // Hard Balanced
          geometry = new THREE.DodecahedronGeometry(0.5, 0);
          color = 0x9932CC; // Dark orchid - Hard Balanced
        } else if (type === 9) {
          // Elite
          geometry = new THREE.IcosahedronGeometry(0.6, 0);
          color = 0xFF0000; // Red - Elite
        } else if (type === 10) {
          // MiniBoss
          geometry = new THREE.DodecahedronGeometry(1.0, 1);
          color = 0xFFD700; // Gold - MiniBoss
        } else if (type === 11) {
          // Flying Boss — large, imposing, multi-winged form
          geometry = new THREE.IcosahedronGeometry(2.5, 1);
          color = 0x8B008B; // Dark magenta — menacing flying boss
        } else if (type === 12) {
          // Bug Ranged — insect-like body with compound eyes
          geometry = new THREE.CapsuleGeometry(0.35, 0.6, 6, 8);
          color = 0x556B2F; // Dark olive green — bug colour
        } else if (type === 13) {
          // Bug Slow — bulky armoured beetle-like body
          geometry = new THREE.SphereGeometry(0.7, 10, 10);
          color = 0x2F4F2F; // Very dark green — armoured beetle
        } else if (type === 14) {
          // Bug Fast — small dart-like flying bug
          geometry = new THREE.OctahedronGeometry(0.35, 1);
          color = 0x9ACD32; // Yellow-green — quick bug
        } else if (type === 15) {
          // Daddy Longlegs — small round spider body
          geometry = new THREE.SphereGeometry(0.28, 10, 10);
          color = 0x8B4513; // Brown spider body
        } else if (type === 16) {
          // Sweeping Swarm — small fast diamond shape
          geometry = new THREE.OctahedronGeometry(0.22, 0);
          color = 0xFFAA00; // Amber swarm colour
        }

        const material = new THREE.MeshPhysicalMaterial({ 
          color: color,
          transparent: true,
          opacity: 0.85,
          metalness: (type === 10 || type === 11) ? 0.4 : (type === 13 ? 0.3 : 0.1),
          roughness: type === 13 ? 0.8 : 0.6,
          transmission: 0.2,
          thickness: 0.5,
          emissive: (type === 10 || type === 11) ? color : 0x000000,
          emissiveIntensity: type === 10 ? 0.3 : (type === 11 ? 0.5 : 0)
        });
        this.mesh = new THREE.Mesh(geometry, material);
        // Flying enemies hover higher; Flying Boss is enormous and hovers high
        const yPos = (type === 5 || type === 14 || type === 16) ? 2 : (type === 11 ? 5 : 0.5);
        this.mesh.position.set(x, yPos, z);
        // Flying Boss is scaled large enough to be dramatic but still mostly visible on screen
        if (type === 11) this.mesh.scale.set(1.8, 1.8, 1.8);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        // For the three most common enemy types the InstancedRenderer owns the draw call.
        // Adding the individual mesh to the scene as well would cause double-rendering.
        const _instancingTypes = (type === 0 || type === 1 || type === 2);
        this._usesInstancing = _instancingTypes && !!(window._instancedRenderer && window._instancedRenderer.active);
        if (!this._usesInstancing) {
          scene.add(this.mesh);
        }

        // Add legs to Daddy Longlegs spider
        if (type === 15) {
          const legMat = new THREE.MeshLambertMaterial({ color: 0x5C3317 });
          for (let leg = 0; leg < 8; leg++) {
            const legAngle = (leg / 8) * Math.PI * 2;
            const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4);
            const legMesh = new THREE.Mesh(legGeo, legMat);
            legMesh.rotation.z = Math.PI / 2 - 0.4;
            legMesh.rotation.y = legAngle;
            legMesh.position.set(Math.cos(legAngle) * 0.35, -0.1, Math.sin(legAngle) * 0.35);
            this.mesh.add(legMesh);
          }
          this._rearingPhase = 0; // 0=walking 1=rearing up 2=attacking
          this._rearingTimer = 0;
        }

        // Ground shadow for flying enemies
        this.groundShadow = null;
        if (type === 5 || type === 11 || type === 14 || type === 16) {
          const shadowRadius = type === 11 ? 2.0 : (type === 5 ? 0.6 : 0.35);
          const shadowGeo = new THREE.CircleGeometry(shadowRadius, 12);
          const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });
          this.groundShadow = new THREE.Mesh(shadowGeo, shadowMat);
          this.groundShadow.rotation.x = -Math.PI / 2;
          this.groundShadow.position.set(x, 0.05, z);
          scene.add(this.groundShadow);
        }

        // Stats based on type — delegated to GameEnemies.getEnemyBaseStats
        Object.assign(this, getEnemyBaseStats(type, levelScaling, GAME_CONFIG.enemySpeedBase, playerLevel));
        this.isDead = false;
        this.isDamaged = false; // Track if enemy has been visually damaged
        this.pulsePhase = Math.random() * Math.PI;
        this.wobbleOffset = Math.random() * 100;
        this.lastAttackTime = 0;
        this.attackCooldown = 1000; // 1 second cooldown
        // AI state for smarter behaviors
        this._aiState = 'approach'; // approach, flank, retreat, dive, wait
        this._aiTimer = 0;
        this._aiCooldown = 1.0 + Math.random() * 2.0; // Randomize decision intervals
        this._lastPlayerPos = { x: 0, z: 0 }; // For movement prediction (pre-allocated)
        this._lastPlayerPosValid = false; // Skip velocity calc on first frame
        this._playerVelocity = { x: 0, z: 0 }; // Estimated player velocity
        this._flankAngle = (Math.random() > 0.5 ? 1 : -1) * (Math.PI * 0.3 + Math.random() * Math.PI * 0.4);
        this._packRush = false; // Pack behavior: periodic group rush flag
        // Armor defaults to 0 if not set (only MiniBoss has armor = 0.25)
        
        // Add glowing eyes to enemy (VFX) with realistic pupils
        const eyeRadius = type === 10 ? 0.12 : (type === 11 ? 0.28 : (type === 13 ? 0.10 : 0.07));
        const eyeColor = type === 4 ? 0xFF3300 : (type === 10 ? 0xFF0000 : (type === 11 ? 0xFF0000 : (type >= 12 ? 0xFF6600 : 0xFF2222)));
        const eGeo = new THREE.SphereGeometry(eyeRadius, 6, 6);
        const eMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF }); // White sclera
        const eyeSpread = type === 10 ? 0.3 : (type === 11 ? 0.7 : (type === 13 ? 0.25 : 0.18));
        const eyeForward = type === 5 ? 0.45 : (type === 11 ? 2.0 : (type === 14 ? 0.3 : 0.42));
        this.leftEye = new THREE.Mesh(eGeo, eMat);
        this.leftEye.position.set(-eyeSpread, 0.1, eyeForward);
        this.mesh.add(this.leftEye);
        this.rightEye = new THREE.Mesh(eGeo, eMat.clone());
        this.rightEye.position.set(eyeSpread, 0.1, eyeForward);
        this.mesh.add(this.rightEye);
        // Add colored iris + dark pupil for realistic eyes
        const pupilRadius = eyeRadius * 0.55;
        const pupilGeo = new THREE.SphereGeometry(pupilRadius, 5, 5);
        const irisMat = new THREE.MeshBasicMaterial({ color: eyeColor });
        const leftIris = new THREE.Mesh(pupilGeo, irisMat);
        leftIris.position.set(0, 0, eyeRadius * 0.55);
        this.leftEye.add(leftIris);
        const rightIris = new THREE.Mesh(pupilGeo, irisMat.clone());
        rightIris.position.set(0, 0, eyeRadius * 0.55);
        this.rightEye.add(rightIris);
        // Inner dark pupil
        const innerPupilGeo = new THREE.SphereGeometry(pupilRadius * 0.5, 4, 4);
        const innerPupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const leftPupil = new THREE.Mesh(innerPupilGeo, innerPupilMat);
        leftPupil.position.set(0, 0, pupilRadius * 0.4);
        leftIris.add(leftPupil);
        const rightPupil = new THREE.Mesh(innerPupilGeo, innerPupilMat.clone());
        rightPupil.position.set(0, 0, pupilRadius * 0.4);
        rightIris.add(rightPupil);
        // Blink timer
        this.blinkTimer = 0;
        this.blinkDuration = 0.08;
        this.nextBlinkTime = 1.5 + Math.random() * 3.5;
        this.isBlinking = false;
      }

      update(dt, playerPos) {
        if (this.isDead) return;

        // Shotgun slide physics — enemy knocked back by double barrel glides on ground
        if (this._shotgunSlide) {
          const sl = this._shotgunSlide;
          sl.frame++;
          const friction = 0.9;
          sl.vx *= friction;
          sl.vz *= friction;
          this.mesh.position.x += sl.vx;
          this.mesh.position.z += sl.vz;
          // Leave blood smear trail on ground while sliding
          if (sl.frame % 2 === 0 && window.BloodSystem) {
            window.BloodSystem.emitDragTrail(this.mesh.position, { x: sl.vx, y: 0, z: sl.vz }, 6);
          }
          if (sl.frame % 3 === 0) {
            spawnBloodDecal(this.mesh.position);
          }

          // ── Knockback Domino Effect ──────────────────────────────────────────────────
          // When a sliding enemy collides with another, transfer kinetic energy — the
          // secondary enemy takes minor damage and receives a small secondary knockback.
          const slideSpeed = Math.sqrt(sl.vx * sl.vx + sl.vz * sl.vz);
          if (slideSpeed > 0.05 && sl.frame % 2 === 0) {
            // Energy transfer fraction and damage multiplier for the domino chain
            const DOMINO_RADIUS           = 1.2; // collision detection radius (world units)
            const DOMINO_TRANSFER_FACTOR  = 0.4; // 40 % of kinetic energy passed to secondary
            const DOMINO_DMG_MULTIPLIER   = 8;   // damage = slideSpeed × this multiplier
            const candidates = window._enemySpatialHash
              ? window._enemySpatialHash.query(this.mesh.position.x, this.mesh.position.z, DOMINO_RADIUS)
              : (typeof enemies !== 'undefined' ? enemies : []);
            for (let _di = 0; _di < candidates.length; _di++) {
              const other = candidates[_di];
              if (other === this || other.isDead || other._shotgunSlide) continue;
              const odx = other.mesh.position.x - this.mesh.position.x;
              const odz = other.mesh.position.z - this.mesh.position.z;
              const odistSq = odx * odx + odz * odz;
              if (odistSq < DOMINO_RADIUS * DOMINO_RADIUS) {
                // Transfer kinetic energy as secondary knockback
                other._shotgunSlide = {
                  vx: sl.vx * DOMINO_TRANSFER_FACTOR,
                  vz: sl.vz * DOMINO_TRANSFER_FACTOR,
                  frames: 8,
                  frame: 0
                };
                // Minor collision damage (scales with slide speed)
                const dominoDmg = Math.max(1, Math.floor(slideSpeed * DOMINO_DMG_MULTIPLIER));
                other.takeDamage(dominoDmg, false, 'knockback');
                // Absorb some momentum from the primary slider
                sl.vx *= (1 - DOMINO_TRANSFER_FACTOR * 0.5);
                sl.vz *= (1 - DOMINO_TRANSFER_FACTOR * 0.5);
                if (spawnParticles) spawnParticles(other.mesh.position, 0xFFCC44, 5);
              }
            }
          }
          // ────────────────────────────────────────────────────────────────────────────

          if (sl.frame >= sl.frames || (Math.abs(sl.vx) < 0.01 && Math.abs(sl.vz) < 0.01)) {
            this._shotgunSlide = null;
          }
          return; // Skip normal movement while sliding
        }

        // Windmill Quest: Attack windmill instead of player
        let targetPos = playerPos;
        if (windmillQuest.active && windmillQuest.windmill) {
          targetPos = windmillQuest.windmill.position;
        }

        // Move towards target
        const dx = targetPos.x - this.mesh.position.x;
        const dz = targetPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);

        // Estimate player velocity for prediction AI
        if (this._lastPlayerPosValid) {
          this._playerVelocity.x = (playerPos.x - this._lastPlayerPos.x) / Math.max(dt, 0.016);
          this._playerVelocity.z = (playerPos.z - this._lastPlayerPos.z) / Math.max(dt, 0.016);
        } else {
          this._lastPlayerPosValid = true;
        }
        this._lastPlayerPos.x = playerPos.x;
        this._lastPlayerPos.z = playerPos.z;
        
        // AI decision timer
        this._aiTimer += dt;

        // Ranged Enemy behavior - stop at range, strafe, and shoot
        if (this.type === 4 && dist < this.attackRange) {
          const now = Date.now();
          if (now - this.lastAttackTime > this.attackCooldown) {
            this.fireProjectile(targetPos);
            this.lastAttackTime = now;
          }
          // Smart retreat - predict player direction and dodge accordingly
          if (dist < 3.0) {
            const retreatX = -(dx / dist) + this._playerVelocity.x * 0.3;
            const retreatZ = -(dz / dist) + this._playerVelocity.z * 0.3;
            const rMag = Math.sqrt(retreatX*retreatX + retreatZ*retreatZ) || 1;
            this.mesh.position.x += (retreatX / rMag) * this.speed * 1.8;
            this.mesh.position.z += (retreatZ / rMag) * this.speed * 1.8;
          } else {
            // Strafe while shooting - vary pattern
            const strafeDir = Math.sin(gameTime * 3 + this.wobbleOffset) > 0 ? 1 : -1;
            const perpX = -dz / dist;
            const perpZ =  dx / dist;
            this.mesh.position.x += perpX * this.speed * 0.5 * strafeDir;
            this.mesh.position.z += perpZ * this.speed * 0.5 * strafeDir;
          }
          this.mesh.rotation.y = Math.atan2(dx, dz);
        } else if (this.type === 12 && dist < this.attackRange) {
          // Bug Ranged — strafe sideways while firing, retreat if too close
          const now = Date.now();
          if (now - this.lastAttackTime > 1800) {
            this.fireProjectile(targetPos);
            this.lastAttackTime = now;
          }
          if (dist < 4.0) {
            this.mesh.position.x -= (dx / dist) * this.speed * 1.2;
            this.mesh.position.z -= (dz / dist) * this.speed * 1.2;
          } else {
            const perpX = -dz / dist;
            const perpZ =  dx / dist;
            this.mesh.position.x += perpX * this.speed * 0.7;
            this.mesh.position.z += perpZ * this.speed * 0.7;
          }
          this.mesh.rotation.y = Math.atan2(dx, dz);
        } else if (this.isFlyingBoss && dist < this.attackRange) {
          // Flying Boss — orbit player and fire powerful projectiles
          const now = Date.now();
          if (now - this.lastAttackTime > 2000) {
            this.fireProjectile(targetPos);
            this.lastAttackTime = now;
          }
          // Orbit with varying radius
          const orbitSpeed = 0.012;
          const angle = Math.atan2(this.mesh.position.z - targetPos.z, this.mesh.position.x - targetPos.x);
          const newAngle = angle + orbitSpeed;
          const orbitR = this.attackRange * (0.6 + Math.sin(gameTime * 0.5) * 0.2);
          this.mesh.position.x = targetPos.x + Math.cos(newAngle) * orbitR;
          this.mesh.position.z = targetPos.z + Math.sin(newAngle) * orbitR;
          // Face the player using atan2 for correct orientation
          this.mesh.rotation.y = Math.atan2(dx, dz);
        } else if (dist > 0.5) {
          // Check if slow/freeze effect expired
          const nowMs = Date.now();
          if (this.slowedUntil && this.slowedUntil < nowMs) {
            this.speed = this.originalSpeed || this.speed;
            this.slowedUntil = null;
          }
          // Handle freeze expiry: thaw enemy, restore color and speed
          if (this.isFrozen && this.frozenUntil < nowMs) {
            this.isFrozen = false;
            this._freezeProgress = 0;
            this.speed = this.originalSpeed || this.speed;
            if (this.mesh && this.mesh.material && this._originalColor) {
              this.mesh.material.color.copy(this._originalColor);
              if (this.mesh.material.emissive) {
                this.mesh.material.emissive.setHex(0x000000);
                this.mesh.material.emissiveIntensity = 0;
              }
              this.mesh.material.needsUpdate = true;
            }
            // Remove ice crack overlays on thaw
            if (this._iceCracks && this._iceCracks.length > 0) {
              for (const crack of this._iceCracks) {
                this.mesh.remove(crack);
                crack.geometry.dispose();
                crack.material.dispose();
              }
              this._iceCracks = [];
            }
            // Shatter ice: spawn ice chips flying outward
            spawnParticles(this.mesh.position, 0xAEEEFF, 6);
            spawnParticles(this.mesh.position, 0xFFFFFF, 4);
            // Ice crack particles + water pool on ground
            if (window.BloodSystem) {
              window.BloodSystem.emitBurst(this.mesh.position, 30, { spreadXZ: 0.6, spreadY: 0.4, color1: 0xAEEEFF, color2: 0xFFFFFF, minSize: 0.05, maxSize: 0.14 });
            }
            // Brief shaking struggle: enemy wiggles before breaking free
            let shakeCount = 0;
            const origX = this.mesh.position.x;
            const origZ = this.mesh.position.z;
            const shakeInterval = setInterval(() => {
              shakeCount++;
              if (!this.mesh || this.isDead) { clearInterval(shakeInterval); return; }
              if (this.mesh) {
                this.mesh.position.x = origX + (Math.random() - 0.5) * 0.12;
                this.mesh.position.z = origZ + (Math.random() - 0.5) * 0.12;
              }
              if (shakeCount >= 8) {
                clearInterval(shakeInterval);
                if (this.mesh) { this.mesh.position.x = origX; this.mesh.position.z = origZ; }
              }
            }, 40);
          }
          
          // Frozen enemies stop moving
          if (this.isFrozen) {
            // Gradual freeze visual: lerp from original → ice blue based on freeze progress
            if (this.mesh && this.mesh.material && this._originalColor && this.frozenUntil) {
              const totalFreezeDur = this._freezeDuration || 2500;
              const elapsed = Math.max(0, nowMs - (this.frozenUntil - totalFreezeDur));
              const freezeT = Math.min(1, elapsed / 600); // 600ms to reach full ice
              if (!Enemy._iceColor) Enemy._iceColor = new THREE.Color(0xB0E8FF);
              this.mesh.material.color.copy(this._originalColor).lerp(Enemy._iceColor, freezeT);
              this.mesh.material.emissiveIntensity = 0.3 + Math.sin(gameTime * 8) * 0.15 * freezeT;
            }
            // Skip all movement below
          } else {
          
          // Base movement towards target — with slight prediction for smoother interception
          // speed * 60 estimates distance-per-second at ~60fps; +1 avoids division by zero

          // ── RAGE FLEE: When player's Rage Mode is active, ALL enemies turn tail and run ──
          // Invert velocity direction so they flee from the player.
          const _isRageFlee = window.GameRageCombat && window.GameRageCombat.isRageActive;

          const _predictT = _isRageFlee ? 0 : Math.min(dist / (this.speed * 60 + 1), 0.8);
          const _predX = targetPos.x + this._playerVelocity.x * _predictT * 0.3;
          const _predZ = targetPos.z + this._playerVelocity.z * _predictT * 0.3;
          const _pdx = _isRageFlee ? -(dx / (dist || 1)) : (_predX - this.mesh.position.x);
          const _pdz = _isRageFlee ? -(dz / (dist || 1)) : (_predZ - this.mesh.position.z);
          const _pdist = _isRageFlee ? 1 : (Math.sqrt(_pdx * _pdx + _pdz * _pdz) || 1);
          let vx = (_pdx / _pdist) * this.speed;
          let vz = (_pdz / _pdist) * this.speed;

          // When fleeing, face away from player (inverted angle)
          if (_isRageFlee) {
            this.mesh.rotation.y = Math.atan2(-dx, -dz);
          }
          
          // Add enemy avoidance to prevent stacking/trains (optimized — squared distance to skip sqrt)
          let avoidX = 0, avoidZ = 0;
          let avoidanceCount = 0;
          const maxAvoidanceChecks = 5;
          const avoidRadiusSq = 1.5 * 1.5;
          for (let other of enemies) {
            if (other === this || other.isDead) continue;
            if (avoidanceCount >= maxAvoidanceChecks) break;
            const odx = this.mesh.position.x - other.mesh.position.x;
            const odz = this.mesh.position.z - other.mesh.position.z;
            const odistSq = odx*odx + odz*odz;
            
            if (odistSq < avoidRadiusSq && odistSq > 0.0001) {
              const odist = Math.sqrt(odistSq);
              const repulsion = 0.02;
              avoidX += (odx / odist) * repulsion;
              avoidZ += (odz / odist) * repulsion;
              avoidanceCount++;
            }
          }
          const avoidMag = Math.sqrt(avoidX*avoidX + avoidZ*avoidZ);
          if (avoidMag > this.speed * 0.6) {
            const scale = (this.speed * 0.6) / avoidMag;
            avoidX *= scale;
            avoidZ *= scale;
          }
          vx += avoidX;
          vz += avoidZ;
          
          // AI Behavior System - each enemy type acts differently
          const behavior = this.aiBehavior || 'approach';
          
          if (behavior === 'interceptor') {
            // Predict where the player will be and move to intercept
            const predictTime = Math.min(dist / (this.speed * 60), 1.5);
            const predictX = targetPos.x + this._playerVelocity.x * predictTime * 0.5;
            const predictZ = targetPos.z + this._playerVelocity.z * predictTime * 0.5;
            const pdx = predictX - this.mesh.position.x;
            const pdz = predictZ - this.mesh.position.z;
            const pdist = Math.sqrt(pdx*pdx + pdz*pdz) || 1;
            vx = (pdx / pdist) * this.speed;
            vz = (pdz / pdist) * this.speed;
            // Charge when close
            if (dist < 5 && dist > 1.5 && !this._charging) {
              if (Math.random() < 0.008) {
                this._charging = true;
                this._chargeTime = 0.5;
              }
            }
            if (this._charging) {
              this._chargeTime -= dt;
              vx = (dx / dist) * this.speed * 3;
              vz = (dz / dist) * this.speed * 3;
              if (this._chargeTime <= 0) this._charging = false;
            }
          } else if (behavior === 'flanker') {
            // Approach from the side/behind the player, blend with forward movement to ensure closure
            if (this._aiTimer > this._aiCooldown) {
              this._aiTimer = 0;
              this._flankAngle = (Math.random() > 0.5 ? 1 : -1) * (Math.PI * 0.25 + Math.random() * Math.PI * 0.35);
              this._aiCooldown = 0.8 + Math.random() * 1.5;
            }
            const flankX = dx * Math.cos(this._flankAngle) - dz * Math.sin(this._flankAngle);
            const flankZ = dx * Math.sin(this._flankAngle) + dz * Math.cos(this._flankAngle);
            const fMag = Math.sqrt(flankX*flankX + flankZ*flankZ) || 1;
            if (dist > 3) {
              // Blend flank direction with direct approach so enemies always close distance
              const blend = Math.min(1, (dist - 3) / 5);
              vx = (flankX / fMag) * this.speed * (1 - blend * 0.4) + (dx / dist) * this.speed * blend * 0.4;
              vz = (flankZ / fMag) * this.speed * (1 - blend * 0.4) + (dz / dist) * this.speed * blend * 0.4;
            } else {
              // Close range: dash straight at player
              vx = (dx / dist) * this.speed * 1.6;
              vz = (dz / dist) * this.speed * 1.6;
            }
          } else if (behavior === 'pack') {
            // Spread out and surround the player, then rush together
            const surroundDist = 3 + Math.sin(this.wobbleOffset) * 1.5;
            // Periodically force a group rush to prevent endless circling
            if (this._aiTimer > this._aiCooldown) {
              this._aiTimer = 0;
              this._aiCooldown = 1.5 + Math.random() * 2.0;
              this._packRush = true;
            }
            if (this._packRush) {
              // Rush straight at player
              vx = (dx / dist) * this.speed * 1.4;
              vz = (dz / dist) * this.speed * 1.4;
              if (dist < 1.5) this._packRush = false;
            } else if (dist > surroundDist + 1) {
              // Move towards player with slight weave
              vx = (dx / dist) * this.speed;
              vz = (dz / dist) * this.speed;
              const weave = Math.sin(gameTime * 4 + this.wobbleOffset) * 0.06;
              vx += weave * (-dz/dist);
              vz += weave * (dx/dist);
            } else if (dist > 1.5) {
              // Circle around player — always maintain inward pull to prevent endless orbit
              const perpX = -dz / dist;
              const perpZ =  dx / dist;
              const circleDir = this.wobbleOffset > 50 ? 1 : -1;
              vx = perpX * this.speed * 0.5 * circleDir + (dx / dist) * this.speed * 0.5;
              vz = perpZ * this.speed * 0.5 * circleDir + (dz / dist) * this.speed * 0.5;
            }
          } else if (behavior === 'ambusher') {
            // Wait at medium range then dash in
            if (this._aiState === 'approach' && dist < 6) {
              this._aiState = 'wait';
              this._aiTimer = 0;
            }
            if (this._aiState === 'wait') {
              // Hold position, slight drift
              vx *= 0.1;
              vz *= 0.1;
              if (this._aiTimer > 1.5 + Math.random()) {
                this._aiState = 'dash';
                this._aiTimer = 0;
              }
            } else if (this._aiState === 'dash') {
              vx = (dx / dist) * this.speed * 2.5;
              vz = (dz / dist) * this.speed * 2.5;
              if (dist < 1.2 || this._aiTimer > 0.6) {
                this._aiState = 'retreat';
                this._aiTimer = 0;
              }
            } else if (this._aiState === 'retreat') {
              vx = -(dx / dist) * this.speed * 1.2;
              vz = -(dz / dist) * this.speed * 1.2;
              if (this._aiTimer > 0.8 || dist > 7) {
                this._aiState = 'approach';
                this._aiTimer = 0;
              }
            }
          } else if (behavior === 'kiter') {
            // Maintain optimal range, retreat when player approaches
            const optimalRange = this.attackRange ? this.attackRange * 0.7 : 6;
            if (dist < optimalRange - 1) {
              // Too close - back away
              vx = -(dx / dist) * this.speed * 1.5;
              vz = -(dz / dist) * this.speed * 1.5;
            } else if (dist < optimalRange + 2) {
              // At range - strafe
              const perpX = -dz / dist;
              const perpZ =  dx / dist;
              const sDir = Math.sin(gameTime * 2 + this.wobbleOffset) > 0 ? 1 : -1;
              vx = perpX * this.speed * 0.6 * sDir;
              vz = perpZ * this.speed * 0.6 * sDir;
            }
            // else: approach normally (default vx/vz)
          } else if (behavior === 'divebomber') {
            // Swoop in fast then pull away
            if (this._aiState === 'approach' && dist < 5) {
              this._aiState = 'dive';
              this._aiTimer = 0;
            }
            if (this._aiState === 'dive') {
              vx = (dx / dist) * this.speed * 2.0;
              vz = (dz / dist) * this.speed * 2.0;
              if (dist < 1.5 || this._aiTimer > 0.5) {
                this._aiState = 'pullup';
                this._aiTimer = 0;
              }
            } else if (this._aiState === 'pullup') {
              // Fly away at angle
              const escAngle = Math.atan2(dz, dx) + Math.PI + this._flankAngle * 0.5;
              vx = Math.cos(escAngle) * this.speed * 1.5;
              vz = Math.sin(escAngle) * this.speed * 1.5;
              if (this._aiTimer > 1.0 || dist > 8) {
                this._aiState = 'approach';
                this._aiTimer = 0;
              }
            }
          } else if (behavior === 'stalker') {
            // Circle at medium range, strike when player is fighting others
            // Only count nearby attackers (limit check count for performance)
            let nearbyAttacking = 0;
            for (let i = 0, count = 0; i < enemies.length && count < 8; i++) {
              const e = enemies[i];
              if (e === this || e.isDead) continue;
              count++;
              const edx = e.mesh.position.x - playerPos.x;
              const edz = e.mesh.position.z - playerPos.z;
              if (edx*edx + edz*edz < 9) nearbyAttacking++;
            }
            
            if (nearbyAttacking >= 2 || dist < 2) {
              // Player is distracted - rush in
              vx = (dx / dist) * this.speed * 1.8;
              vz = (dz / dist) * this.speed * 1.8;
            } else if (dist < 8) {
              // Circle at medium range
              const perpX = -dz / dist;
              const perpZ =  dx / dist;
              vx = perpX * this.speed * 0.5 + (dx / dist) * this.speed * 0.15;
              vz = perpZ * this.speed * 0.5 + (dz / dist) * this.speed * 0.15;
            }
          } else if (behavior === 'rearing') {
            // Daddy Longlegs: creep toward player, then rear up and attack
            if (!this._rearingPhase) this._rearingPhase = 0;
            if (!this._rearingTimer) this._rearingTimer = 0;
            this._rearingTimer += dt;
            if (this._rearingPhase === 0) {
              // Walking phase: approach slowly
              if (dist > this.attackRange) {
                vx = (dx / dist) * this.speed * 0.8;
                vz = (dz / dist) * this.speed * 0.8;
              } else if (this._rearingTimer > 1.0) {
                // Close enough — start rearing
                this._rearingPhase = 1;
                this._rearingTimer = 0;
              }
            } else if (this._rearingPhase === 1) {
              // Rearing up: lift body, legs spread wide (animated via Y position)
              this.mesh.position.y = 0.5 + Math.sin(this._rearingTimer * 4) * 0.4;
              if (this._rearingTimer > 0.8) {
                this._rearingPhase = 2;
                this._rearingTimer = 0;
              }
            } else if (this._rearingPhase === 2) {
              // Attack lunge
              vx = (dx / dist) * this.speed * 3.0;
              vz = (dz / dist) * this.speed * 3.0;
              if (this._rearingTimer > 0.4) {
                this._rearingPhase = 0;
                this._rearingTimer = 0;
                this.mesh.position.y = 0.5;
              }
            }
          } else if (behavior === 'sweep') {
            // Sweeping Swarm: flies rapidly in wide arcs across the map
            if (!this._sweepDir) this._sweepDir = (Math.random() > 0.5) ? 1 : -1;
            if (!this._sweepTimer) this._sweepTimer = 0;
            this._sweepTimer += dt;
            // Sweep side to side with a sinusoidal path
            const sweepSpeed = this.speed * 2.5;
            const perpX = -dz / (dist || 1);
            const perpZ =  dx / (dist || 1);
            vx = (dx / dist) * sweepSpeed * 0.3 + perpX * Math.sin(this._sweepTimer * 2) * sweepSpeed;
            vz = (dz / dist) * sweepSpeed * 0.3 + perpZ * Math.sin(this._sweepTimer * 2) * sweepSpeed;
            // Reverse direction occasionally
            if (this._sweepTimer > 2.5 + Math.random() * 1.5) {
              this._sweepDir *= -1;
              this._sweepTimer = 0;
            }
          }
          
          // Flying height behavior
          if (this.type === 5 || this.type === 14 || this.type === 16) {
            const wavePhase = gameTime * 5 + this.wobbleOffset;
            const wave = Math.sin(wavePhase) * 0.08;
            vx += wave * (dz/(dist||1));
            vz -= wave * (dx/(dist||1));
            const baseHeight = this._aiState === 'dive' ? 0.8 : (this.type === 16 ? 1.5 : 2);
            this.mesh.position.y = baseHeight + Math.sin(gameTime * 3 + this.wobbleOffset) * 0.5;
          }
          
          this.mesh.position.x += vx;
          this.mesh.position.z += vz;
          // Proper player-facing using atan2 — avoids backwards/sideways artifacts that
          // lookAt+PI can cause when the model's natural orientation differs from THREE.js convention.
          // dx/dz = direction from this enemy toward the player.
          // Skip if rage-flee already set a fleeing rotation.
          if (!_isRageFlee) {
            this.mesh.rotation.y = Math.atan2(dx, dz);
          }
          // Collision with environment props (trees, barrels, crates) — ground enemies bounce off
          // Skip flying enemy types: 5=Flying, 11=FlyingBoss, 14=BugFast(fly), 16=SweepingSwarm
          const _isFlying = _ENEMY_FLYING_TYPES.has(this.type);
          if (!_isFlying && window.destructibleProps) {
            for (let prop of window.destructibleProps) {
              if (!prop || !prop.mesh || prop.destroyed) continue;
              const edx = this.mesh.position.x - prop.mesh.position.x;
              const edz = this.mesh.position.z - prop.mesh.position.z;
              const eDist = Math.sqrt(edx*edx + edz*edz);
              const eRadius = prop.type === 'tree' ? _TREE_COLL_R : _PROP_COLL_R;
              if (eDist < eRadius && eDist > 0.001) {
                this.mesh.position.x = prop.mesh.position.x + (edx / eDist) * eRadius;
                this.mesh.position.z = prop.mesh.position.z + (edz / eDist) * eRadius;
                // Wobble the prop on enemy impact
                if (!prop._wobbleTime) prop._wobbleTime = 0;
                if (prop._wobbleTime <= 0) {
                  prop._wobbleTime = 0.6;
                  if (!prop._wobbleDir) prop._wobbleDir = { x: edx / eDist, z: edz / eDist };
                  else { prop._wobbleDir.x = edx / eDist; prop._wobbleDir.z = edz / eDist; }
                }
              }
            }
          }
          // Collision with fences (also skip for flying enemies)
          if (!_isFlying && window.breakableFences) {
            for (let fence of window.breakableFences) {
              if (!fence.userData || !fence.userData.isFence || fence.userData.hp <= 0) continue;
              const efdx = this.mesh.position.x - fence.position.x;
              const efdz = this.mesh.position.z - fence.position.z;
              const efDist = Math.sqrt(efdx*efdx + efdz*efdz);
              if (efDist < _FENCE_COLL_R && efDist > 0.001) {
                this.mesh.position.x = fence.position.x + (efdx / efDist) * _FENCE_COLL_R;
                this.mesh.position.z = fence.position.z + (efdz / efDist) * _FENCE_COLL_R;
                if (!fence.userData._wobbleTime) fence.userData._wobbleTime = 0;
                if (fence.userData._wobbleTime <= 0) {
                  fence.userData._wobbleTime = 0.5;
                  if (!fence.userData._wobbleDir) fence.userData._wobbleDir = { x: efdx / efDist, z: efdz / efDist };
                  else { fence.userData._wobbleDir.x = efdx / efDist; fence.userData._wobbleDir.z = efdz / efDist; }
                }
              }
            }
          }
          } // end else (!isFrozen) movement block
        }

        // Collision with target
        if (windmillQuest.active && windmillQuest.windmill && dist < 3.0) {
          // Attack windmill with cooldown
          const now = Date.now();
          if (now - this.lastAttackTime > this.attackCooldown) {
            windmillQuest.windmill.userData.hp -= this.damage;
            updateWindmillQuestUI();
            this.lastAttackTime = now;
            playSound('hit');
          }
          // Knockback
          this.mesh.position.x -= (dx / dist) * 2;
          this.mesh.position.z -= (dz / dist) * 2;
          
          if (windmillQuest.windmill.userData.hp <= 0) {
            failWindmillQuest();
          }
        } else if (dist < 1.0 && this.type !== 4) { // Ranged enemies don't melee attack
          // Attack player with cooldown to prevent instant death
          const now = Date.now();
          if (now - this.lastAttackTime > this.attackCooldown) {
            player.takeDamage(this.damage);
            this.lastAttackTime = now;
            
            // Thorns damage - reflect damage back to enemy if still alive
            if (playerStats.thornsPercent > 0 && !this.isDead) {
              const thornsDamage = this.damage * playerStats.thornsPercent;
              this.takeDamage(thornsDamage, false);
              createDamageNumber(thornsDamage, this.mesh.position, false);
              spawnParticles(this.mesh.position, 0xFF6347, 8); // Tomato red thorns
            }
            
            // Slowing enemy slows player on hit
            if (this.type === 3) {
              playerStats.walkSpeed *= this.slowAmount;
              // Remove slow after duration
              setTimeout(() => {
                playerStats.walkSpeed /= this.slowAmount;
              }, this.slowDuration);
              // Visual effect for slow
              spawnParticles(player.mesh.position, 0x00FFFF, 10);
            }
          }
          
          // Knockback (always apply to prevent enemies from stacking)
          this.mesh.position.x -= (dx / dist) * 2;
          this.mesh.position.z -= (dz / dist) * 2;
        }

        // Squishy idle with more gravity-based wobble
        this.pulsePhase += dt * 6; // Slightly faster
        const squish = Math.sin(this.pulsePhase) * 0.08; // More pronounced from 0.05
        
        // MiniBoss glowing effect
        if (this.isMiniBoss) {
          const glowIntensity = 0.3 + Math.sin(this.pulsePhase * 2) * 0.2;
          this.mesh.material.emissiveIntensity = glowIntensity;
          // Larger breathing effect for mini-boss
          this.mesh.scale.set(1+squish*2, 1-squish*2, 1+squish*2);
        } else if (this.isFlyingBoss) {
          // Flying Boss — dramatic pulsing glow and slow rotation
          const fbGlow = 0.5 + Math.sin(this.pulsePhase * 1.5) * 0.3;
          this.mesh.material.emissiveIntensity = fbGlow;
          this.mesh.rotation.y += dt * 0.8; // Slow menacing spin
          this.mesh.scale.set(1.8 + squish, 1.8 + squish, 1.8 + squish);
        } else if (this.type === 0 || this.type === 3 || this.type === 6) {
           // Tank, Slowing, and Hard Tank breathe more dramatically
           this.mesh.scale.set(1+squish*1.5, 1-squish*1.5, 1+squish*1.5);
        } else {
           this.mesh.scale.set(1-squish, 1+squish*1.5, 1-squish);
        }
        
        // Blinking eyes animation
        if (this.leftEye && this.rightEye) {
          this.blinkTimer += dt;
          if (this.blinkTimer >= this.nextBlinkTime) {
            this.isBlinking = true;
            this.blinkTimer = 0;
            this.nextBlinkTime = 1.5 + Math.random() * 3.5;
          }
          if (this.isBlinking) {
            const bp = Math.min(1, this.blinkTimer / this.blinkDuration);
            const eyeScale = bp < 0.5 ? 1 - bp * 2 : (bp - 0.5) * 2;
            this.leftEye.scale.y = Math.max(0.05, eyeScale);
            this.rightEye.scale.y = Math.max(0.05, eyeScale);
            if (bp >= 1) {
              this.isBlinking = false;
              this.blinkTimer = 0;
              this.leftEye.scale.y = 1;
              this.rightEye.scale.y = 1;
            }
          }
        }
        
        // Update ground shadow position for flying enemies
        if (this.groundShadow) {
          this.groundShadow.position.x = this.mesh.position.x;
          this.groundShadow.position.z = this.mesh.position.z;
          // Shadow opacity scales with height
          this.groundShadow.material.opacity = Math.max(0.08, 0.25 - (this.mesh.position.y - 0.5) * 0.03);
        }
      }

      fireProjectile(targetPos) {
        // Create enemy projectile
        const projectile = {
          startPos: this.mesh.position.clone(),
          targetPos: targetPos.clone(),
          mesh: null,
          speed: this.projectileSpeed,
          damage: this.damage,
          lifetime: 100, // frames
          isEnemyProjectile: true
        };
        
        // Create visual
        const geo = new THREE.SphereGeometry(0.2, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xFF6347 });
        projectile.mesh = new THREE.Mesh(geo, mat);
        projectile.mesh.position.copy(this.mesh.position);
        projectile.mesh.position.y = 0.5;
        scene.add(projectile.mesh);
        
        // Direction
        const dx = targetPos.x - this.mesh.position.x;
        const dz = targetPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        projectile.direction = new THREE.Vector3(dx/dist, 0, dz/dist);
        
        // Add to projectiles array (will be updated in main loop)
        projectiles.push(projectile);
        
        playSound('shoot');
      }

      /**
       * Apply damage to the enemy
       * @param {number} amount - Damage amount
       * @param {boolean} isCrit - Whether this is a critical hit
       * @param {string} damageType - Type of damage: 'physical', 'fire', 'ice', 'lightning', 'shotgun', 'headshot', 'gun', 'doubleBarrel', 'drone'
       */
      takeDamage(amount, isCrit = false, damageType = 'physical') {
        // Track last damage type and crit state for death effects
        this.lastDamageType = damageType;
        this.lastCrit = isCrit;
        
        // Damage type sets for cleaner conditional checks
        const HEAVY_HIT_TYPES = ['doubleBarrel', 'shotgun', 'pumpShotgun', 'autoShotgun', 'sniperRifle', 'homingMissile', 'fireball'];
        const SHOTGUN_TYPES = ['doubleBarrel', 'shotgun', 'pumpShotgun', 'autoShotgun'];

        // Phase 5: Hit impact particles (flesh/blood) on every hit — scaled with HP ratio
        const hpRatio = this.hp / this.maxHp;
        const isHeavyHit = HEAVY_HIT_TYPES.includes(damageType) || isCrit;
        const bloodParticleCount = Math.max(5, Math.floor((1 - hpRatio) * 18) + 5);
        spawnParticles(this.mesh.position, 0x8B0000, Math.min(bloodParticleCount, 20)); // Blood particles
        spawnParticles(this.mesh.position, 0x660000, Math.min(Math.floor(bloodParticleCount * 0.5), 8)); // Darker blood
        if (isHeavyHit) {
          spawnParticles(this.mesh.position, 0xCC0000, 6); // Bright red burst for heavy hits
          spawnParticles(this.mesh.position, 0xAA0000, 4);
        }
        // Ground blood decal — more on heavy hits
        spawnBloodDecal(this.mesh.position);
        if (isHeavyHit) {
          spawnBloodDecal(this.mesh.position);
          spawnBloodDecal({ x: this.mesh.position.x + (Math.random()-0.5)*0.5, y: 0, z: this.mesh.position.z + (Math.random()-0.5)*0.5 });
        }
        if (hpRatio < 0.5) {
          spawnBloodDecal(this.mesh.position); // Extra blood when low HP
        }
        if (hpRatio < 0.25) {
          spawnBloodDecal(this.mesh.position); // Extra decal at critical HP
          spawnBloodDecal({ x: this.mesh.position.x + (Math.random()-0.5)*0.8, y: 0, z: this.mesh.position.z + (Math.random()-0.5)*0.8 });
          // Arterial spurt at critically low HP — continuous pumping wound
          if (window.BloodSystem && window.BloodSystem.emitArterialSpurt && !this._arterialSpurtFired) {
            this._arterialSpurtFired = true; // fire only once per HP threshold crossing
            const artDir = { x: Math.cos(Math.random() * Math.PI * 2), y: 0, z: Math.sin(Math.random() * Math.PI * 2) };
            window.BloodSystem.emitArterialSpurt(this.mesh.position, artDir, {
              pulses: 5, perPulse: 50, interval: 180, intensity: 0.7, coneAngle: 0.3
            });
          }
        }
        // Blood system: directional spray on heavy hits
        if (window.BloodSystem && isHeavyHit) {
          const isShotgunHit = SHOTGUN_TYPES.includes(damageType);
          window.BloodSystem.emitBurst(this.mesh.position, isShotgunHit ? 60 : 30, { spreadXZ: 0.8, spreadY: 0.2, minSize: 0.01, maxSize: 0.06, minLife: 20, maxLife: 50 });
        }
        // Weapon-level-based blood effects — higher levels produce more brutal hits
        if (window.BloodSystem) {
          const wl = (typeof weapons !== 'undefined' && weapons) || {};
          const gunLvl = (wl.gun && wl.gun.level) || 1;
          const droneLvl = (wl.droneTurret && wl.droneTurret.level) || 1;
          const swordLvl = (wl.sword && wl.sword.level) || 1;
          const auraLvl = (wl.aura && wl.aura.level) || 1;

          if (damageType === 'gun' || damageType === 'physical') {
            // Gun: Level 1 = small entry wound only; Level 2+ = exit wound spray
            window.BloodSystem.emitBurst(this.mesh.position, 10 + gunLvl * 8, { spreadXZ: 0.3 + gunLvl * 0.15, spreadY: 0.1 + gunLvl * 0.05 });
            if (gunLvl >= 2) {
              _tmpHitDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
              window.BloodSystem.emitExitWound(this.mesh.position, _tmpHitDir, 15 + gunLvl * 10, { speed: 0.2 + gunLvl * 0.05 });
            }
            if (gunLvl >= 3) {
              window.BloodSystem.emitHeartbeatWound(this.mesh.position, { pulses: 2, perPulse: 30 + gunLvl * 15, interval: 250 });
            }
          } else if (damageType === 'drone') {
            // Drone: Level 1 = entry only, Level 3+ = go through with exit mist
            _tmpHitDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            window.BloodSystem.emitDroneMist(this.mesh.position, _tmpHitDir, 20 + droneLvl * 15);
            if (droneLvl >= 3) {
              window.BloodSystem.emitExitWound(this.mesh.position, _tmpHitDir, 20 + droneLvl * 8, { speed: 0.25 });
            }
          } else if (damageType === 'sword') {
            // Sword: slash lines with blood pouring — higher levels = deeper cuts
            _tmpHitDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            window.BloodSystem.emitSwordSlash(this.mesh.position, _tmpHitDir, 20 + swordLvl * 12);
            if (swordLvl >= 2) {
              window.BloodSystem.emitPulse(this.mesh.position, { pulses: 2, perPulse: 40 + swordLvl * 20, interval: 200, arcDir: _tmpHitDir, spreadXZ: 0.4 });
            }
          } else if (damageType === 'aura') {
            // Aura: energy burns escalate with level
            window.BloodSystem.emitAuraBurn(this.mesh.position, 15 + auraLvl * 10);
            if (auraLvl >= 2) {
              window.BloodSystem.emitBurst(this.mesh.position, 10 + auraLvl * 8, { spreadXZ: 0.3, spreadY: 0.15, color1: 0x2A0000, color2: 0xFF4500, minSize: 0.02, maxSize: 0.06 });
            }
          } else if (damageType === 'headshot') {
            // Headshot: always dramatic blood spray from head
            window.BloodSystem.emitHeadBleed(this.mesh.position, { intensity: 0.5, duration: 3 });
            window.BloodSystem.emitBurst(this.mesh.position, 80, { spreadXZ: 1.2, spreadY: 0.4 });
          } else if (damageType === 'shotgun' || damageType === 'doubleBarrel' || damageType === 'pumpShotgun' || damageType === 'autoShotgun') {
            // Shotgun variants: massive burst — exit wounds + guts at high power
            window.BloodSystem.emitBurst(this.mesh.position, 80, { spreadXZ: 1.5, spreadY: 0.3 });
            window.BloodSystem.emitGuts(this.mesh.position, { count: 15 });
            _tmpHitDir.set(Math.random()-0.5, 0, Math.random()-0.5).normalize();
            window.BloodSystem.emitExitWound(this.mesh.position, _tmpHitDir, 40, { speed: 0.35 });
          } else if (damageType === 'samuraiSword' || damageType === 'teslaSaber') {
            // Bladed weapons: deep slashing wounds
            _tmpHitDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            window.BloodSystem.emitSwordSlash(this.mesh.position, _tmpHitDir, 35);
            window.BloodSystem.emitPulse(this.mesh.position, { pulses: 2, perPulse: 50, interval: 200, arcDir: _tmpHitDir, spreadXZ: 0.5 });
            if (damageType === 'teslaSaber') {
              spawnParticles(this.mesh.position, 0x00CCFF, 8); // Electric sparks
              spawnParticles(this.mesh.position, 0xFFFFFF, 4);
            }
          } else if (damageType === 'whip') {
            // Whip: lash marks
            window.BloodSystem.emitBurst(this.mesh.position, 25, { spreadXZ: 0.6, spreadY: 0.1 });
            spawnParticles(this.mesh.position, 0xCC8844, 5);
          } else if (damageType === 'sniperRifle' || damageType === '50cal') {
            // Sniper: massive through-and-through
            _tmpHitDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            window.BloodSystem.emitBurst(this.mesh.position, 100, { spreadXZ: 2.0, spreadY: 0.5 });
            window.BloodSystem.emitExitWound(this.mesh.position, _tmpHitDir, 60, { speed: 0.5 });
            window.BloodSystem.emitGuts(this.mesh.position, { count: 8 });
          } else if (damageType === 'minigun' || damageType === 'uzi') {
            // Rapid fire: small frequent blood spurts
            window.BloodSystem.emitBurst(this.mesh.position, 15, { spreadXZ: 0.3, spreadY: 0.1 });
          } else if (damageType === 'bow') {
            // Arrow: pin wound + blood trickle
            window.BloodSystem.emitBurst(this.mesh.position, 20, { spreadXZ: 0.4, spreadY: 0.15 });
            spawnParticles(this.mesh.position, 0x8B4513, 3); // Wood splinter particles
          } else if (damageType === 'boomerang' || damageType === 'shuriken') {
            // Thrown weapons: slicing cuts
            _tmpHitDir.set(Math.random()-0.5, 0, Math.random()-0.5).normalize();
            window.BloodSystem.emitSwordSlash(this.mesh.position, _tmpHitDir, 25);
            spawnParticles(this.mesh.position, 0xCCCCCC, 4); // Metal spark
          } else if (damageType === 'nanoSwarm' || damageType === 'special') {
            // Nano/special: small precise wounds
            window.BloodSystem.emitBurst(this.mesh.position, 12, { spreadXZ: 0.2, spreadY: 0.1 });
            spawnParticles(this.mesh.position, 0x6688FF, 3);
          } else if (damageType === 'homingMissile' || damageType === 'fireball') {
            // Explosive: massive blast
            window.BloodSystem.emitBurst(this.mesh.position, 90, { spreadXZ: 2.0, spreadY: 0.5 });
            window.BloodSystem.emitGuts(this.mesh.position, { count: 12 });
            spawnParticles(this.mesh.position, 0xFF4400, 10);
          } else if (damageType === 'lightning') {
            // Lightning: charring + electric sparks
            window.BloodSystem.emitAuraBurn(this.mesh.position, 30);
            spawnParticles(this.mesh.position, 0x00CCFF, 6);
            spawnParticles(this.mesh.position, 0xFFFF00, 4);
          } else if (damageType === 'poison') {
            // Poison: toxic dissolve particles
            window.BloodSystem.emitBurst(this.mesh.position, 15, { spreadXZ: 0.3, spreadY: 0.1, color1: 0x00AA00, color2: 0x44FF44 });
            spawnParticles(this.mesh.position, 0x00FF00, 5);
          }
        }
        // Pulsating wound blood drips — gravity-based spray from hit location
        if (bloodDrips.length < MAX_BLOOD_DRIPS && (isHeavyHit || hpRatio < 0.5)) {
          const dripCount = isHeavyHit ? (3 + Math.floor(Math.random() * 3)) : (1 + Math.floor(Math.random() * 2));
          for (let bd = 0; bd < dripCount && bloodDrips.length < MAX_BLOOD_DRIPS; bd++) {
            if (!_sharedBloodDripGeo && typeof THREE !== 'undefined') _sharedBloodDripGeo = new THREE.SphereGeometry(1, 4, 4);
            const dripSize = 0.015 + Math.random() * 0.04;
            const dripMesh = new THREE.Mesh(_sharedBloodDripGeo, new THREE.MeshBasicMaterial({ color: [0x8B0000, 0xAA0000, 0x660000, 0xCC0000][bd % 4] }));
            dripMesh.scale.setScalar(dripSize);
            dripMesh.position.copy(this.mesh.position);
            dripMesh.position.y += 0.2 + Math.random() * 0.4;
            scene.add(dripMesh);
            bloodDrips.push({
              mesh: dripMesh,
              velX: (Math.random() - 0.5) * (isHeavyHit ? 0.25 : 0.1),
              velZ: (Math.random() - 0.5) * (isHeavyHit ? 0.25 : 0.1),
              velY: 0.08 + Math.random() * 0.2,
              life: 40 + Math.floor(Math.random() * 25),
              _sharedGeo: true
            });
          }
        }
        // Blood splatter on nearby enemies (stain them red)
        if (isHeavyHit && enemies) {
          const hitPos = this.mesh.position;
          for (let ne = 0; ne < enemies.length; ne++) {
            const other = enemies[ne];
            if (other === this || other.isDead || !other.mesh) continue;
            const dx = other.mesh.position.x - hitPos.x;
            const dz = other.mesh.position.z - hitPos.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < 4.0) { // Within 2 units
              // Stain the nearby enemy with blood
              if (other.mesh.material && other.mesh.material.color) {
                if (!other._originalColor) other._originalColor = other.mesh.material.color.clone();
                const stainAmt = Math.max(0, 0.15 * (1 - Math.sqrt(distSq) / 2));
                if (!Enemy._bloodColor) Enemy._bloodColor = new THREE.Color(0x8B0000);
                other.mesh.material.color.lerp(Enemy._bloodColor, stainAmt);
              }
            }
          }
        }
        
        // Progressive blood stain: blend enemy mesh color toward dark red as HP drops
        // This works on ALL enemy colors (including yellow/gold) by directly lerping the color
        if (this.mesh && this.mesh.material) {
          if (!this._originalColor) {
            this._originalColor = this.mesh.material.color.clone();
          }
          // Lerp factor: 0 at full HP → 0.85 near death (almost fully blood-covered)
          const bloodLerp = (1 - hpRatio) * 0.85;
          // Cached blood colors to avoid per-hit allocation
          if (!Enemy._bloodColor) Enemy._bloodColor = new THREE.Color(0x8B0000);
          if (!Enemy._emissiveBloodColor) Enemy._emissiveBloodColor = new THREE.Color(0x6B0000);
          // Only update color if not frozen (freeze manages its own colour)
          if (!this.isFrozen) {
            this.mesh.material.color.copy(this._originalColor).lerp(Enemy._bloodColor, bloodLerp);
          }
          // Also apply emissive for wet blood sheen
          if (!this.isFrozen && this.mesh.material.emissive !== undefined) {
            const bloodStainIntensity = (1 - hpRatio) * 0.4;
            this.mesh.material.emissive.copy(Enemy._emissiveBloodColor);
            this.mesh.material.emissiveIntensity = bloodStainIntensity;
          }
        }
        
        // Throttle expensive new-mesh creation (blood stains, drips, holes) to at most
        // once every 120 ms to avoid creating dozens of objects during rapid drone fire.
        const nowHit = Date.now();
        const canSpawnMeshes = !this._lastHitMeshTime || (nowHit - this._lastHitMeshTime) > 120;
        if (canSpawnMeshes) {
          this._lastHitMeshTime = nowHit;

        // Add blood stain meshes directly on enemy body (visible on all colors)
        if (!this._bloodStains) this._bloodStains = [];
        const MAX_BODY_BLOOD_STAINS = 12;
        if (this._bloodStains.length < MAX_BODY_BLOOD_STAINS) {
          const stainCount = hpRatio < 0.25 ? 3 : (hpRatio < 0.5 ? 2 : 1);
          // Lazy-init shared stain geometry (unit-size, scale per instance)
          if (!_sharedBloodStainGeo && typeof THREE !== 'undefined') {
            _sharedBloodStainGeo = new THREE.CircleGeometry(1, 6);
          }
          for (let s = 0; s < stainCount && this._bloodStains.length < MAX_BODY_BLOOD_STAINS; s++) {
            const stainSize = 0.08 + Math.random() * 0.15;
            const stain = new THREE.Mesh(
              _sharedBloodStainGeo,
              new THREE.MeshStandardMaterial({
                color: 0x5a0000,
                emissive: 0x1a0000,
                emissiveIntensity: 0.25,
                roughness: 0.22,
                metalness: 0.5,
                transparent: true,
                opacity: 0.82,
                side: THREE.DoubleSide,
                depthWrite: false
              })
            );
            stain.scale.setScalar(stainSize);
            // Place on enemy surface
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const r = 0.49;
            stain.position.set(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
            stain.lookAt(stain.position.clone().multiplyScalar(2));
            this.mesh.add(stain);
            this._bloodStains.push(stain);
          }
        }
        
        // Blood drip: small drops fall from wounded enemy to ground (managed in main loop)
        // More blood drips from first shot onward, increasing with damage
        if (scene && bloodDrips.length < MAX_BLOOD_DRIPS) {
          // Lazy-init shared drip geometry (unit-size, scale per instance)
          if (!_sharedBloodDripGeo && typeof THREE !== 'undefined') {
            _sharedBloodDripGeo = new THREE.SphereGeometry(1, 4, 4);
          }
          const dripCount = hpRatio < 0.25 ? 6 : (hpRatio < 0.5 ? 4 : 3); // Blood from every hit
          for (let d = 0; d < dripCount && bloodDrips.length < MAX_BLOOD_DRIPS; d++) {
            const dripSize = 0.03 + Math.random() * 0.05;
            const drip = new THREE.Mesh(
              _sharedBloodDripGeo,
              new THREE.MeshBasicMaterial({ color: 0x8B0000 })
            );
            drip.scale.setScalar(dripSize);
            drip.position.set(
              this.mesh.position.x + (Math.random() - 0.5) * 0.5,
              this.mesh.position.y + (Math.random() - 0.5) * 0.3,
              this.mesh.position.z + (Math.random() - 0.5) * 0.5
            );
            scene.add(drip);
            bloodDrips.push({ mesh: drip, velY: 0, life: 30 + Math.floor(Math.random() * 20), _sharedGeo: true });
          }
        }
        
        // Bullet-hole decal that sticks to enemy surface (visible bloody wound)
        if (!this.bulletHoles) this.bulletHoles = [];
        const MAX_ENEMY_BULLET_HOLES = 12;
        if (this.bulletHoles.length < MAX_ENEMY_BULLET_HOLES) {
          // Reuse shared geometry; clone shared material for per-hole opacity control
          ensureBulletHoleMaterials();
          if (bulletHoleGeo && bulletHoleMat) {
          const holeDecal = new THREE.Mesh(bulletHoleGeo, bulletHoleMat.clone());
          // Place on enemy surface (random position on sphere surface)
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.random() * Math.PI;
          const nx = Math.sin(phi) * Math.cos(theta);
          const ny = Math.sin(phi) * Math.sin(theta);
          const nz = Math.cos(phi);
          holeDecal.position.set(nx * 0.54, ny * 0.54, nz * 0.54);
          // Face outward from center
          holeDecal.lookAt(new THREE.Vector3(nx * 2, ny * 2, nz * 2));
          this.mesh.add(holeDecal);
          this.bulletHoles.push(holeDecal);
          }
        }
        } // end canSpawnMeshes throttle
        
        // Airborne blood splatter - throttled alongside other mesh creation
        if (canSpawnMeshes) {
        const burstCount = isCrit ? 5 : 3; // More airborne blood per shot
        for (let b = 0; b < burstCount && bloodDrips.length < MAX_BLOOD_DRIPS; b++) {
          const bSize = 0.03 + Math.random() * 0.05;
          if (!_sharedBloodDripGeo && typeof THREE !== 'undefined') {
            _sharedBloodDripGeo = new THREE.SphereGeometry(1, 4, 4);
          }
          const p = new THREE.Mesh(
            _sharedBloodDripGeo,
            new THREE.MeshBasicMaterial({ color: 0xAA0000 })
          );
          p.scale.setScalar(bSize);
          p.position.set(
            this.mesh.position.x + (Math.random() - 0.5) * 0.4,
            this.mesh.position.y + 0.1,
            this.mesh.position.z + (Math.random() - 0.5) * 0.4
          );
          scene.add(p);
          bloodDrips.push({
            mesh: p,
            velX: (Math.random() - 0.5) * 0.08,
            velZ: (Math.random() - 0.5) * 0.08,
            velY: 0.12 + Math.random() * 0.22, // initial upward burst
            life: 35 + Math.floor(Math.random() * 15),
            _sharedGeo: true
          });
        }
        } // end airborne blood throttle
        
        // Phase 3: Apply armor reduction for MiniBoss/FlyingBoss — delegated to GameCombat
        let finalAmount = amount;
        if (this.armor > 0) {
          // Apply player's armor penetration: reduces effective enemy armor
          const effectiveArmor = this.armor * (1 - (playerStats.armorPenetration || 0));
          finalAmount = calculateEnemyArmorReduction(amount, effectiveArmor);
          // Show armor reduction effect
          if (this.isMiniBoss || this.isFlyingBoss) {
            createFloatingText(`-${Math.floor(amount * effectiveArmor)}`, this.mesh.position, '#FFD700');
          }
        }

        // Apply elemental resistance/vulnerability based on damage type
        if (damageType && this.elementalResistance) {
          const resistKey = damageType === 'gun' || damageType === 'sword' || damageType === 'drone' || damageType === 'shotgun' || damageType === 'doubleBarrel'
            ? 'physical' : damageType;
          const resist = this.elementalResistance[resistKey] || 0;
          if (resist !== 0) finalAmount *= (1 - resist);
        }

        // Frozen enemies take double damage after armor — freeze bonus applies on top of armor
        if (this.isFrozen) finalAmount *= 2;

        // Execute bonus: extra damage vs enemies below 30% HP
        if (playerStats.executeDamage > 0 && this.hp / this.maxHp < 0.30) {
          finalAmount *= (1 + playerStats.executeDamage);
        }
        
        const oldHp = this.hp;
        this.hp -= finalAmount;
        createDamageNumber(Math.floor(finalAmount), this.mesh.position, isCrit);

        // ── 5 BRUTAL GORE STATES on critical hits ──
        // Randomly apply one of 5 visual states so each crit feels uniquely brutal.
        if (isCrit && !this.isDead && this.mesh) {
          const goreState = Math.floor(Math.random() * 5);
          switch (goreState) {
            case 0: // Shoot off an eye — remove one eye instance (handled visually by hiding via scale)
              if (!this._shotEye) {
                this._shotEye = true;
                // Spawn a tiny sphere flying off sideways — geometry/material disposed after animation to avoid leaks
                if (scene) {
                  const eyeGeo = new THREE.SphereGeometry(0.07, 4, 4);
                  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
                  const flyEye = new THREE.Mesh(eyeGeo, eyeMat);
                  flyEye.position.copy(this.mesh.position);
                  flyEye.position.y += 0.5;
                  scene.add(flyEye);
                  const evx = (Math.random() - 0.5) * 0.25, evz = (Math.random() - 0.5) * 0.25;
                  let ef = 0;
                  const _animEye = () => {
                    if (++ef > 20 || !flyEye.parent) return;
                    flyEye.position.x += evx; flyEye.position.z += evz; flyEye.position.y += 0.05 - ef * 0.005;
                    requestAnimationFrame(_animEye);
                  };
                  _animEye();
                  // Dispose geometry and material after 400ms to prevent memory leaks
                  setTimeout(() => { if (flyEye.parent) scene.remove(flyEye); eyeGeo.dispose(); eyeMat.dispose(); }, 400);
                }
              }
              break;
            case 1: // Blast a hole through — add a dark hole decal on the enemy front face
              if (this.mesh && (!this.bulletHoles || this.bulletHoles.length < 8)) {
                if (!this.bulletHoles) this.bulletHoles = [];
                const holeGeo = new THREE.CircleGeometry(0.1 + Math.random() * 0.07, 8);
                const holeMat = new THREE.MeshBasicMaterial({ color: 0x0A0000, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false });
                const hole = new THREE.Mesh(holeGeo, holeMat);
                hole.position.set((Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3, 0.52);
                this.mesh.add(hole);
                this.bulletHoles.push(hole);
              }
              break;
            case 2: // Tear off a side chunk — squish/shear the enemy scale temporarily
              if (this.mesh && !this._toreChunk) {
                this._toreChunk = true;
                this.mesh.scale.set(0.82, 1.12, 0.88);
                setTimeout(() => { if (this.mesh && !this.isDead) this.mesh.scale.set(1, 1, 1); }, 300);
              }
              break;
            case 3: // Decapitate top half — shrink Y scale to squish upper body
              if (this.mesh && !this._decapitated) {
                this._decapitated = true;
                this.mesh.scale.y = 0.65;
                spawnParticles({ x: this.mesh.position.x, y: this.mesh.position.y + 0.8, z: this.mesh.position.z }, 0x8B0000, 12);
              }
              break;
            case 4: // Extreme arterial spurt — force an immediate spurt regardless of HP
              if (window.BloodSystem && window.BloodSystem.emitArterialSpurt) {
                const aDir = { x: Math.cos(Math.random() * Math.PI * 2), y: 0, z: Math.sin(Math.random() * Math.PI * 2) };
                window.BloodSystem.emitArterialSpurt(this.mesh.position, aDir, { pulses: 4, perPulse: 60, interval: 120, intensity: 1.0, coneAngle: 0.5 });
              } else {
                // Fallback: lots of blood particles
                spawnParticles(this.mesh.position, 0xFF0000, 20);
                spawnParticles({ x: this.mesh.position.x, y: this.mesh.position.y + 0.6, z: this.mesh.position.z }, 0xCC0000, 15);
              }
              break;
          }
        }

        // Knockback chain reaction — strong hits propagate to nearby enemies
        if (window.AdvancedPhysics && window.AdvancedPhysics.KnockbackChain && finalAmount > 10) {
          const knockForce = Math.min(finalAmount * 0.15, 8);
          window.AdvancedPhysics.KnockbackChain.add(this.mesh.position, knockForce, 3, 2);
        }

        // Multi-hit: chance to strike again for 50% damage
        if (playerStats.multiHitChance > 0 && !this.isDead && this.hp > 0 && Math.random() < playerStats.multiHitChance) {
          const multiHitDmg = Math.max(1, Math.floor(finalAmount * 0.5));
          this.hp -= multiHitDmg;
          createDamageNumber(multiHitDmg, this.mesh.position, false);
        }

        // Life steal: heal player for a % of damage dealt
        if (playerStats.lifeStealPercent > 0) {
          const lifeStealHeal = finalAmount * playerStats.lifeStealPercent;
          playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + lifeStealHeal);
          updateHUD();
        }

        // Vampire class drain: handled via lifeStealPercent (set in level-up-system.js)
        // Additional drain for _vampireClass in case it was applied without lifeStealPercent
        if (window._vampireClass && !(playerStats.lifeStealPercent > 0) && playerStats.hp < playerStats.maxHp) {
          const drain = finalAmount * 0.08;
          playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + drain);
          updateHUD();
        }

        // Record damage dealt for milestone tracking
        if (window.GameMilestones) window.GameMilestones.recordDamageDealt(finalAmount);

        const hpPercent = this.hp / this.maxHp;
        const oldHpPercent = oldHp / this.maxHp;
        
        // 75% HP: Blood spots, darken color by 20%
        if (oldHpPercent >= 0.75 && hpPercent < 0.75 && !this.stage1Damage) {
          this.stage1Damage = true;
          
          // Darken color
          const currentColor = this.mesh.material.color;
          currentColor.r *= 0.8;
          currentColor.g *= 0.8;
          currentColor.b *= 0.8;
          
          // Blood spots (small red particles)
          spawnParticles(this.mesh.position, 0x8B0000, 10);
          playSound('hit');
        }
        
        // 50% HP: Add flesh/hole meshes
        if (oldHpPercent >= 0.5 && hpPercent < 0.5 && !this.stage2Damage) {
          this.stage2Damage = true;
          
          // Add visible wounds/holes; for instanced enemies place at world pos since
          // the individual mesh isn't in the scene during combat
          for(let i=0; i<3; i++) {
            const holeGeo = new THREE.SphereGeometry(0.1, 6, 6);
            const holeMat = new THREE.MeshBasicMaterial({ color: 0x220000 }); // Dark red
            const hole = new THREE.Mesh(holeGeo, holeMat);
            if (this._usesInstancing) {
              hole.position.set(
                this.mesh.position.x + (Math.random() - 0.5) * 0.5,
                this.mesh.position.y + (Math.random() - 0.5) * 0.5,
                this.mesh.position.z + (Math.random() - 0.5) * 0.5
              );
              scene.add(hole);
              // Fade out wound decal over time so it doesn't linger after death cleanup
              const _hm = holeMat;
              _hm.transparent = true;
              setTimeout(() => { if (hole.parent) { scene.remove(hole); holeGeo.dispose(); _hm.dispose(); } }, 8000);
            } else {
              hole.position.set(
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5
              );
              this.mesh.add(hole);
            }
          }
          
          spawnParticles(this.mesh.position, 0x8B0000, 8); // Reduced for performance
          playSound('hit');
        }
        
        // 25% HP: Heavy blood spray, walkSpeed *= 0.6
        if (oldHpPercent >= 0.25 && hpPercent < 0.25 && !this.stage3Damage) {
          this.stage3Damage = true;
          
          // Reduce speed
          this.speed *= 0.6;
          
          // Massive blood spray instead of big limb pieces
          const enemyColor = this.mesh.material.color.getHex();
          spawnParticles(this.mesh.position, 0x8B0000, 10);
          spawnParticles(this.mesh.position, 0xCC0000, 6);
          spawnParticles(this.mesh.position, 0x660000, 4);
          spawnParticles(this.mesh.position, enemyColor, 3);
          
          // Blood spray decals around (reduced for FPS)
          for (let i = 0; i < 3; i++) {
            spawnBloodDecal(this.mesh.position);
          }
          
          // Airborne blood bursts
          for (let b = 0; b < 3 && bloodDrips.length < MAX_BLOOD_DRIPS; b++) {
            const p = new THREE.Mesh(
              new THREE.SphereGeometry(0.03 + Math.random() * 0.04, 4, 4),
              new THREE.MeshBasicMaterial({ color: 0xAA0000 })
            );
            p.position.set(
              this.mesh.position.x + (Math.random() - 0.5) * 0.5,
              this.mesh.position.y + 0.2,
              this.mesh.position.z + (Math.random() - 0.5) * 0.5
            );
            scene.add(p);
            bloodDrips.push({
              mesh: p,
              velY: 0.18 + Math.random() * 0.25,
              life: 35 + Math.floor(Math.random() * 15)
            });
          }
          
          playSound('hit');
        }
        
        // Destruction effect at 20% HP threshold — covered in blood, near death
        if (oldHpPercent >= 0.2 && hpPercent < 0.2 && !this.isDamaged) {
          this.isDamaged = true;
          
          // Visually damage the enemy - make smaller
          const damagePercent = 0.35 + Math.random() * 0.15; // 35-50%
          const newScale = 1 - damagePercent;
          this.mesh.scale.multiplyScalar(newScale);
          
          // Heavy blood spray instead of big broken pieces
          spawnParticles(this.mesh.position, 0x8B0000, 18);
          spawnParticles(this.mesh.position, 0xCC0000, 12);
          spawnParticles(this.mesh.position, 0x440000, 8);
          
          // Blood pools around enemy
          for (let i = 0; i < 8; i++) {
            spawnBloodDecal(this.mesh.position);
          }
          
          playSound('hit');
        }
        
        // Enhanced splash particles using enemy's own color
        const enemyColor = this.mesh.material.color.getHex();
        const particleCount = isCrit ? 8 : 3;
        spawnParticles(this.mesh.position, enemyColor, particleCount);
        
        // Blood spray on every hit — more blood as enemy takes more damage
        const bloodIntensity = Math.ceil((1 - hpPercent) * 6) + 1;
        spawnParticles(this.mesh.position, 0x8B0000, Math.min(bloodIntensity, 6));
        if (hpPercent < 0.6) {
          spawnBloodDecal(this.mesh.position);
        }
        if (hpPercent < 0.3) {
          spawnBloodDecal(this.mesh.position);
          spawnParticles(this.mesh.position, 0xCC0000, 3);
        }
        
        // Additional impact particles
        if (isCrit) {
          spawnParticles(this.mesh.position, enemyColor, 5);
          spawnParticles(this.mesh.position, 0xFFFFFF, 3);
          spawnBloodDecal(this.mesh.position);
        }
        
        // Varied hit reaction animations — 10 different reactions, weapon-specific, more dramatic
        if (!this._squishTimer) {
          const hitReaction = Math.floor(Math.random() * 10);
          const isShotgun = damageType === 'doubleBarrel' || damageType === 'shotgun';
          const isSword = damageType === 'sword';
          const isHeavy = isCrit || isShotgun;
          const knockStr = isHeavy ? 1.5 : 1.0;
          
          if (hitReaction === 0 || (isHeavy && hitReaction < 2)) {
            // Stumble backward — body rocks back hard
            const stDir = (Math.random() < 0.5) ? 1 : -1;
            this.mesh.rotation.x = stDir * (isHeavy ? 0.7 : 0.35) * knockStr;
            this.mesh.position.y += isHeavy ? 0.12 : 0.05;
            if (isShotgun) { this.mesh.position.x += (Math.random()-0.5) * 0.3; this.mesh.position.z += (Math.random()-0.5) * 0.3; }
            this._squishTimer = setTimeout(() => {
              if (this.mesh && !this.isDead) { this.mesh.rotation.x = 0; this.mesh.position.y = 0.5; }
              this._squishTimer = null;
            }, isHeavy ? 300 : 180);
          } else if (hitReaction === 1) {
            // Side stagger — tilt sideways dramatically
            const sDir = (Math.random() < 0.5) ? 1 : -1;
            this.mesh.rotation.z = sDir * (isHeavy ? 0.8 : 0.4);
            this.mesh.position.y -= 0.06;
            this._squishTimer = setTimeout(() => {
              if (this.mesh && !this.isDead) { this.mesh.rotation.z = 0; this.mesh.position.y = 0.5; }
              this._squishTimer = null;
            }, isHeavy ? 250 : 170);
          } else if (hitReaction === 2) {
            // Flinch down — body compresses hard from impact
            const squishScale = isCrit ? 0.55 : 0.7;
            this.mesh.scale.set(1.25, squishScale, 1.25);
            this.mesh.position.y -= 0.08;
            this._squishTimer = setTimeout(() => {
              if (this.mesh && !this.isDead) { this.mesh.scale.set(1, 1, 1); this.mesh.position.y = 0.5; }
              this._squishTimer = null;
            }, 150);
          } else if (hitReaction === 3) {
            // Jerk/twitch — rapid displacement + rotation
            const jx = (Math.random() - 0.5) * 0.25;
            const jz = (Math.random() - 0.5) * 0.25;
            this.mesh.position.x += jx;
            this.mesh.position.z += jz;
            this.mesh.scale.set(0.85, 1.15, 0.85);
            this.mesh.rotation.y += (Math.random()-0.5) * 0.4;
            this._squishTimer = setTimeout(() => {
              if (this.mesh && !this.isDead) { this.mesh.scale.set(1, 1, 1); this.mesh.rotation.y = 0; }
              this._squishTimer = null;
            }, 120);
          } else if (hitReaction === 4) {
            // Limp collapse — enemy drops lower with wobble
            this.mesh.position.y = Math.max(0.15, this.mesh.position.y - 0.2);
            this.mesh.rotation.z = (Math.random() - 0.5) * 0.5;
            this.mesh.rotation.x = (Math.random() - 0.5) * 0.2;
            this._squishTimer = setTimeout(() => {
              if (this.mesh && !this.isDead) {
                this.mesh.position.y = 0.5;
                this.mesh.rotation.z = 0;
                this.mesh.rotation.x = 0;
              }
              this._squishTimer = null;
            }, 220);
          } else if (hitReaction === 5) {
            // Impact bounce — springs up then crashes down
            this.mesh.position.y += isHeavy ? 0.35 : 0.2;
            this.mesh.scale.set(0.8, 1.3, 0.8);
            this._squishTimer = setTimeout(() => {
              if (this.mesh && !this.isDead) {
                this.mesh.position.y = 0.5;
                this.mesh.scale.set(1, 1, 1);
              }
              this._squishTimer = null;
            }, 180);
          } else if (hitReaction === 6) {
            // Classic squish deformation — dramatic
            const squishScale = isCrit ? 0.6 : 0.75;
            this.mesh.scale.set(squishScale, 1.4, squishScale);
            this._squishTimer = setTimeout(() => {
              if (this.mesh && !this.isDead) this.mesh.scale.set(1, 1, 1);
              this._squishTimer = null;
            }, 140);
          } else if (hitReaction === 7) {
            // Spin hit — enemy spins from impact force
            const spinDir = (Math.random() < 0.5) ? 1 : -1;
            this.mesh.rotation.y += spinDir * (isHeavy ? 1.2 : 0.6);
            this.mesh.position.y += 0.08;
            this._squishTimer = setTimeout(() => {
              if (this.mesh && !this.isDead) { this.mesh.rotation.y = 0; this.mesh.position.y = 0.5; }
              this._squishTimer = null;
            }, 200);
          } else if (hitReaction === 8) {
            // Gut punch — compress forward, rebound
            this.mesh.scale.set(1.1, 0.7, 1.3);
            this.mesh.rotation.x = 0.4;
            this.mesh.position.y -= 0.1;
            this._squishTimer = setTimeout(() => {
              if (this.mesh && !this.isDead) { this.mesh.scale.set(1, 1, 1); this.mesh.rotation.x = 0; this.mesh.position.y = 0.5; }
              this._squishTimer = null;
            }, 160);
          } else {
            // Violent knockback — whole body displaced
            const kbAngle = Math.random() * Math.PI * 2;
            const kbDist = isHeavy ? 0.35 : 0.15;
            this.mesh.position.x += Math.cos(kbAngle) * kbDist;
            this.mesh.position.z += Math.sin(kbAngle) * kbDist;
            this.mesh.rotation.z = (Math.random()-0.5) * 0.5;
            this.mesh.scale.set(0.9, 1.05, 0.9);
            this._squishTimer = setTimeout(() => {
              if (this.mesh && !this.isDead) { this.mesh.scale.set(1, 1, 1); this.mesh.rotation.z = 0; }
              this._squishTimer = null;
            }, 160);
          }
          // Extra blood spray on heavy hits
          if (isHeavy) {
            spawnParticles(this.mesh.position, 0xAA0000, 4);
            spawnBloodDecal(this.mesh.position);
          }
        }

        if (this.hp <= 0) {
          this.die();
        }
      }

      die() {
        this.isDead = true;
        this._deathTimestamp = Date.now();
        // Register kill for combat intensity tracking (dynamic shadow quality)
        if (typeof window.registerCombatKill === 'function') window.registerCombatKill();
        // Record kill milestone progress
        if (window.GameMilestones) window.GameMilestones.recordKill();
        // Clear freeze state so no further update logic applies to dead enemy
        this.isFrozen = false;
        // Cancel pending squish timeout to prevent callback on dead enemy
        if (this._squishTimer) {
          clearTimeout(this._squishTimer);
          this._squishTimer = null;
        }
        // Cancel pending drone shake interval to prevent timer leak
        if (this._droneShakeTimer) {
          clearInterval(this._droneShakeTimer);
          this._droneShakeTimer = null;
        }
        // Cancel shotgun slide to prevent movement on dead enemy
        this._shotgunSlide = null;
        
        // Clean up ground shadow
        if (this.groundShadow) {
          scene.remove(this.groundShadow);
          this.groundShadow.geometry.dispose();
          this.groundShadow.material.dispose();
          this.groundShadow = null;
        }
        
        // Clone position NOW before any mesh removal or disposal to prevent
        // race condition where position becomes undefined after scene.remove/dispose
        if (!this.mesh) return;
        // If this enemy was rendered via instancing, add its mesh to the scene
        // now so the death animation (fall/splatter) is visible.
        if (this._usesInstancing) {
          scene.add(this.mesh);
          this._usesInstancing = false;
        }
        const deathPos = this.mesh.position.clone();
        
        // Track kills for active quests
        if (montanaQuest.active) {
          montanaQuest.kills++;
          updateMontanaQuestUI();
        }
        if (eiffelQuest.active) {
          eiffelQuest.kills++;
          updateEiffelQuestUI();
        }
        
        // Determine death effect based on damage type and health when dying
        const damageType = this.lastDamageType || 'physical';
        const enemyColor = this.mesh.material.color.getHex();
        // Detect yellow/gold enemy for special spin death (type 7=HardFast gold, type 10=MiniBoss gold)
        const isYellowEnemy = (this.type === 7 || this.type === 10);
        
        // Trigger kill cam effect for varied visual feedback
        triggerKillCam(this.mesh.position, this.isMiniBoss, damageType);
        
        // Arterial spurt on death — blood jets pump from the neck/chest wound
        if (window.BloodSystem && window.BloodSystem.emitArterialSpurt) {
          const spurtDir = { x: Math.cos(Math.random() * Math.PI * 2), y: 0, z: Math.sin(Math.random() * Math.PI * 2) };
          // Miniboss/boss get more dramatic spurts
          const spurtPulses   = (this.isMiniBoss || this.isFlyingBoss) ? 12 : 8;
          const spurtPerPulse = (this.isMiniBoss || this.isFlyingBoss) ? 150 : 80;
          window.BloodSystem.emitArterialSpurt(deathPos, spurtDir, {
            pulses: spurtPulses, perPulse: spurtPerPulse, interval: 160, intensity: 1.0
          });
        }

        // Special death effects based on damage type
        if (isYellowEnemy && damageType !== 'ice' && damageType !== 'fire' && damageType !== 'headshot') {
          // Yellow enemies: 180-degree spin death with continuous neck blood arc
          this.dieBySpinDeath(enemyColor);
        } else if (damageType === 'fire') {
          // Fire death: Char and ash
          this.dieByFire(enemyColor);
        } else if (damageType === 'ice') {
          // Ice death: Shatter into ice shards
          this.dieByIce(enemyColor);
        } else if (damageType === 'lightning') {
          // Lightning death: Blackened and smoke
          this.dieByLightning(enemyColor);
        } else if (damageType === 'shotgun' || damageType === 'doubleBarrel') {
          // Shotgun / double barrel / homing missile death: Massive gibs explosion
          this.dieByShotgun(enemyColor);
        } else if (damageType === 'headshot') {
          // Headshot: Specific head explosion
          this.dieByHeadshot(enemyColor);
        } else if (damageType === 'drone') {
          // Drone death: riddled with tiny holes and blood mist spray
          this.dieByDrone(enemyColor);
        } else if (damageType === 'sword') {
          // Sword death: slash wounds with immediate blood flow
          this.dieBySword(enemyColor);
        } else if (damageType === 'aura') {
          // Aura death: burnt flesh, boiling blood effects
          this.dieByAura(enemyColor);
        } else if (damageType === 'poison') {
          // Poison death: dissolve in green toxic melt
          this.dieByPoison(enemyColor);
        } else {
          // Standard death (bullet/physical/gun)
          this.dieStandard(enemyColor);
        }
        
        // Screen flash on kill (dopamine boost) - stronger flash for mini-boss
        const flash = document.createElement('div');
        flash.style.position = 'fixed';
        flash.style.top = '0';
        flash.style.left = '0';
        flash.style.width = '100%';
        flash.style.height = '100%';
        flash.style.background = this.isFlyingBoss ? 'rgba(139, 0, 139, 0.4)' : (this.isMiniBoss ? 'rgba(255, 215, 0, 0.3)' : 'rgba(255, 255, 255, 0.2)');
        flash.style.pointerEvents = 'none';
        flash.style.zIndex = '500';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), (this.isMiniBoss || this.isFlyingBoss) ? 100 : 50);
        // Hit-stop: mini-boss and flying-boss deaths get the longest freeze
        if ((this.isMiniBoss || this.isFlyingBoss) && window.triggerHitStop) window.triggerHitStop(80);
        
        // Blood spray on death — visceral pumping wound blood
        const isShotgunKill = damageType === 'shotgun' || damageType === 'doubleBarrel';
        const isHeadshotKill = damageType === 'headshot';
        const deathBloodMult = this.isMiniBoss ? 2.0 : (isShotgunKill ? 1.8 : 1.0);
        spawnParticles(this.mesh.position, 0x8B0000, Math.floor(14 * deathBloodMult));
        spawnParticles(this.mesh.position, 0xCC0000, Math.floor(8 * deathBloodMult));
        spawnParticles(this.mesh.position, 0x660000, Math.floor(6 * deathBloodMult));
        spawnParticles(this.mesh.position, 0xAA0000, Math.floor(4 * deathBloodMult));
        // Wound blood burst — directional spray
        if (window.BloodSystem) {
          window.BloodSystem.emitBurst(deathPos, Math.floor((this.isMiniBoss ? 600 : 350) * deathBloodMult), { spreadXZ: 2.0, spreadY: 0.5, minSize: 0.02, maxSize: 0.12, minLife: 50, maxLife: 100 });
          // Pumping blood — pulses simulating heartbeat pumping out
          window.BloodSystem.emitPulse(deathPos, { pulses: this.isMiniBoss ? 10 : 6, perPulse: Math.floor((this.isMiniBoss ? 500 : 280) * deathBloodMult), interval: 180, spreadXZ: 1.5, minSize: 0.015, maxSize: 0.09, minLife: 45, maxLife: 90 });
          // Extra guts for shotgun/explosive kills
          if (isShotgunKill && typeof window.BloodSystem.emitGuts === 'function') {
            window.BloodSystem.emitGuts(deathPos, 30);
          }
          // Blood skid mark — elongated streak in the knockback direction
          if (isShotgunKill && typeof spawnBloodSkidMark === 'function') {
            const pdx = deathPos.x - (player ? player.mesh.position.x : 0);
            const pdz = deathPos.z - (player ? player.mesh.position.z : 0);
            const pdist = Math.sqrt(pdx * pdx + pdz * pdz) || 1;
            spawnBloodSkidMark(deathPos, pdx / pdist, pdz / pdist);
          }
          // Growing blood pool — forms gradually at death position
          if (typeof window.BloodSystem.emitPoolGrow === 'function') {
            window.BloodSystem.emitPoolGrow(deathPos, { maxRadius: this.isMiniBoss ? 2.5 : 1.5 });
          }
        }
        // Airborne blood spray burst — sprays high in air, rains down varied droplets
        const sprayCount = Math.floor(18 * deathBloodMult);
        for (let sb = 0; sb < sprayCount && bloodDrips.length < MAX_BLOOD_DRIPS; sb++) {
          const spraySize = 0.015 + Math.random() * 0.08;
          if (!_sharedBloodDripGeo && typeof THREE !== 'undefined') {
            _sharedBloodDripGeo = new THREE.SphereGeometry(1, 4, 4);
          }
          const spray = new THREE.Mesh(
            _sharedBloodDripGeo,
            new THREE.MeshBasicMaterial({ color: [0xAA0000, 0x8B0000, 0x660000, 0xCC0000, 0x990000, 0x550000][sb % 6] })
          );
          spray.scale.setScalar(spraySize);
          spray.position.copy(deathPos);
          spray.position.y += 0.2 + Math.random() * 0.4;
          scene.add(spray);
          bloodDrips.push({
            mesh: spray,
            velX: (Math.random() - 0.5) * (isShotgunKill ? 0.7 : 0.5),
            velZ: (Math.random() - 0.5) * (isShotgunKill ? 0.7 : 0.5),
            velY: 0.25 + Math.random() * 0.65,
            life: 60 + Math.floor(Math.random() * 40),
            _sharedGeo: true
          });
        }
        // Dynamic blood pools: more pools with bigger sizes
        const airBloodCount = this.isMiniBoss ? 24 : 16;
        for (let ab = 0; ab < airBloodCount; ab++) {
          if (managedAnimations.length >= MAX_MANAGED_ANIMATIONS) break;
          const landX = deathPos.x + (Math.random() - 0.5) * 5;
          const landZ = deathPos.z + (Math.random() - 0.5) * 5;
          // Dynamic sizing: small drips (0.05), drops (0.15), pools (0.4+)
          const sizeRoll = Math.random();
          const r = sizeRoll < 0.3 ? (0.04 + Math.random() * 0.1) :  // 30% tiny drips
                    sizeRoll < 0.55 ? (0.12 + Math.random() * 0.2) :  // 25% drops
                    sizeRoll < 0.8 ? (0.25 + Math.random() * 0.3) :   // 25% medium pools
                                     (0.4 + Math.random() * 0.4);     // 20% big pools
          const poolGeo = new THREE.CircleGeometry(r, r > 0.2 ? 12 : 6);
          const poolMat = new THREE.MeshStandardMaterial({ 
            color: sizeRoll < 0.5 ? 0x8B0000 : 0x6B0000, 
            transparent: true, opacity: 0,
            roughness: 0.15, metalness: 0.5
          });
          const pool = new THREE.Mesh(poolGeo, poolMat);
          pool.rotation.x = -Math.PI / 2;
          pool.position.set(landX, 0.05, landZ);
          scene.add(pool);
          const delayFrames = 3 + Math.floor(Math.random() * 15);
          const maxOpacity = 0.5 + Math.random() * 0.35;
          const WAIT_FRAMES = 480;
          const FADE_FRAMES = 60;
          let abTimer = 0;
          managedAnimations.push({
            update(_dt) {
              abTimer++;
              if (abTimer === delayFrames) poolMat.opacity = maxOpacity;
              if (abTimer > WAIT_FRAMES) {
                poolMat.opacity = Math.max(0, maxOpacity * (1 - (abTimer - WAIT_FRAMES) / FADE_FRAMES));
              }
              if (abTimer >= WAIT_FRAMES + FADE_FRAMES) {
                if (pool.parent) scene.remove(pool);
                poolGeo.dispose();
                poolMat.dispose();
                return false;
              }
              return true;
            },
            cleanup() {
              if (pool.parent) scene.remove(pool);
              poolGeo.dispose();
              poolMat.dispose();
            }
          });
        }
        for (let db = 0; db < (this.isMiniBoss ? 18 : 12); db++) {
          spawnBloodDecal(this.mesh.position);
        }
        
        // Enemy death animation: fall lifeless to ground, then spawn XP star separately
        const dyingMesh = this.mesh;
        const _bulletHoles = this.bulletHoles;
        const _bloodStains = this._bloodStains;
        const _leftEye = this.leftEye;
        const _rightEye = this.rightEye;
        this.bulletHoles = [];
        this._bloodStains = [];
        this.leftEye = null;
        this.rightEye = null;
        
        // XP scaling by enemy type - stronger enemies give more XP
        let expMultiplier = 1;
        if (this.isFlyingBoss) {
          expMultiplier = 5;
        } else if (this.isMiniBoss) {
          expMultiplier = 3;
        } else if (this.type === 9) { // Elite
          expMultiplier = 2;
        } else if (this.type >= 6 && this.type <= 8) { // Hard variants
          expMultiplier = 2;
        } else if (this.type === 0 || this.type === 3 || this.type === 5) { // Tank, Slowing, Flying
          expMultiplier = 1;
        } else if (this.type === 13) { // Bug Slow (tanky)
          expMultiplier = 2;
        } else {
          expMultiplier = 1; // Fast, Balanced, Ranged, Bug Fast, Bug Ranged
        }
        const wasFlying = this.isFlying;
        
        // XP star pops out immediately on death, flying slightly away from the body
        // so it is visible during the death animation and can be collected right away.
        const xpPopAngle = Math.random() * Math.PI * 2;
        const xpPopDist = 0.8 + Math.random() * 0.6; // 0.8–1.4 units away
        var _isCrit = this.lastCrit || false;
        var _isExplosive = (damageType === 'shotgun' || damageType === 'doubleBarrel' || damageType === 'lightning' || damageType === 'homingMissile' || damageType === 'meteor' || damageType === 'fireball');
        var xpHitForce = _isCrit ? 2.0 : (_isExplosive ? 2.5 : 1.0);
        for (let i = 0; i < expMultiplier; i++) {
          const spread = i * (Math.PI * 2 / Math.max(expMultiplier, 1));
          const angle = xpPopAngle + spread;
          spawnExp(deathPos.x + Math.cos(angle) * xpPopDist, deathPos.z + Math.sin(angle) * xpPopDist, damageType, xpHitForce, this.type);
        }
        
        // Dynamic death animation styles - weapon-dependent with variation
        // 0=collapse, 1=spin fall, 2=backward fall, 3=forward collapse, 4=side fall,
        // 5=ragdoll tumble, 6=explosion knockback, 7=splatter, 8=split in half,
        // 9=gut spill, 10=crawl & collapse
        let deathStyle;
        if (isShotgunDeath || damageType === 'pumpShotgun' || damageType === 'autoShotgun') {
          // Shotgun variants: knockback-heavy deaths
          deathStyle = [2, 5, 6, 7, 9][Math.floor(Math.random() * 5)];
        } else if (damageType === 'sniperRifle' || damageType === '50cal') {
          // Sniper: violent backward knockback, split or ragdoll
          deathStyle = [2, 5, 6, 8][Math.floor(Math.random() * 4)];
        } else if (damageType === 'minigun' || damageType === 'uzi') {
          // Rapid fire: riddled with bullets, ragdoll tumble
          deathStyle = [0, 1, 5, 7][Math.floor(Math.random() * 4)];
        } else if (damageType === 'samuraiSword' || damageType === 'teslaSaber') {
          // Bladed melee: clean cuts, split, collapse
          deathStyle = [0, 3, 4, 8, 10][Math.floor(Math.random() * 5)];
        } else if (damageType === 'whip') {
          // Whip: dramatic side falls, collapse
          deathStyle = [0, 3, 4, 10][Math.floor(Math.random() * 4)];
        } else if (damageType === 'bow') {
          // Arrow: pin and fall backward
          deathStyle = [2, 3, 4][Math.floor(Math.random() * 3)];
        } else if (damageType === 'boomerang' || damageType === 'shuriken') {
          // Thrown weapons: spin deaths
          deathStyle = [1, 4, 5][Math.floor(Math.random() * 3)];
        } else if (damageType === 'nanoSwarm') {
          // Nano: dissolve/crumple
          deathStyle = [0, 3, 7][Math.floor(Math.random() * 3)];
        } else if (damageType === 'homingMissile' || damageType === 'fireball') {
          // Explosive: massive knockback, splatter
          deathStyle = [5, 6, 7, 9][Math.floor(Math.random() * 4)];
        } else if (damageType === 'lightning' || damageType === 'special') {
          // Lightning/special: dramatic spin or explosion deaths
          deathStyle = [1, 5, 6][Math.floor(Math.random() * 3)];
        } else if (damageType === 'poison') {
          // Poison: slow collapse, crawl
          deathStyle = [0, 3, 10][Math.floor(Math.random() * 3)];
        } else if (damageType === 'melee' || damageType === 'knife') {
          // Melee: collapse or forward fall
          deathStyle = [0, 2, 3, 4, 10][Math.floor(Math.random() * 5)];
        } else if (damageType === 'headshot') {
          // Headshot: dramatic backward fall
          deathStyle = [2, 5, 8][Math.floor(Math.random() * 3)];
        } else {
          // Gun/default: any animation
          deathStyle = Math.floor(Math.random() * 11);
        }
        const fallSignX = (Math.random() < 0.5) ? 1 : -1;
        const fallSignZ = (Math.random() < 0.5) ? 1 : -1;
        const spinDir = (Math.random() < 0.5) ? 1 : -1;
        const isShotgunDeath = damageType === 'shotgun' || damageType === 'doubleBarrel' || damageType === 'pumpShotgun' || damageType === 'autoShotgun';
        const isExplosiveDeath = isShotgunDeath || damageType === 'lightning' || damageType === 'homingMissile' || damageType === 'fireball' || damageType === 'sniperRifle';
        const isCritDeath = this.lastCrit || false;
        
        // Fall down animation: enemy falls dynamically, lies on ground, explodes into blood
        // LINGER_FRAMES extended to keep corpse visible for ~10 seconds total (at 60fps):
        //   FALL(40) + LINGER(500) + EXPLODE(20) + FADE(40) = 600 frames ≈ 10 s
        const FALL_FRAMES = wasFlying ? 55 : 40;
        const LINGER_FRAMES = 500; // Corpse lingers on ground for ~8 seconds
        const EXPLODE_FRAMES = 20; // Blood explosion phase
        const FADE_FRAMES = 40;    // Smooth 0.67-second fade out
        let fallFrame = 0;
        const startY = dyingMesh.position.y;
        const startScaleY = dyingMesh.scale.y;
        
        // Spawn detached body parts for heavy kills (dismemberment)
        const SHOTGUN_CHUNK_MIN = 3, SHOTGUN_CHUNK_EXTRA = 4;
        const NORMAL_CHUNK_MIN = 1, NORMAL_CHUNK_EXTRA = 3;
        const CHUNK_SIZE_MIN = 0.08, CHUNK_SIZE_RANGE = 0.18;
        const GROUND_Y = 0.05, BOUNCE_DAMPEN = 0.3;
        const _deathChunks = [];
        if (isExplosiveDeath || (isCritDeath && Math.random() < 0.5)) {
          const chunkCount = isShotgunDeath ? (SHOTGUN_CHUNK_MIN + Math.floor(Math.random() * SHOTGUN_CHUNK_EXTRA)) : (NORMAL_CHUNK_MIN + Math.floor(Math.random() * NORMAL_CHUNK_EXTRA));
          for (let ci = 0; ci < chunkCount; ci++) {
            const chunkSize = CHUNK_SIZE_MIN + Math.random() * CHUNK_SIZE_RANGE;
            const chunkGeo = Math.random() < 0.5 ? new THREE.SphereGeometry(chunkSize, 5, 4) : new THREE.BoxGeometry(chunkSize, chunkSize * 0.6, chunkSize * 0.8);
            // Use realistic gore colors (dark reds, maroon) instead of enemy color to avoid pink bubbles
            const goreColors = [0x8B0000, 0x660000, 0x4A0000, 0x550011, 0x3D0000, 0x800000];
            const chunkColor = goreColors[Math.floor(Math.random() * goreColors.length)];
            const chunkMat = new THREE.MeshBasicMaterial({ color: chunkColor, transparent: true, opacity: 0.9 });
            const chunk = new THREE.Mesh(chunkGeo, chunkMat);
            chunk.position.copy(deathPos);
            chunk.position.y += 0.3 + Math.random() * 0.3;
            scene.add(chunk);
            _deathChunks.push({
              mesh: chunk, geo: chunkGeo, mat: chunkMat,
              vx: (Math.random() - 0.5) * (isShotgunDeath ? 0.35 : 0.2),
              vy: 0.15 + Math.random() * 0.25,
              vz: (Math.random() - 0.5) * (isShotgunDeath ? 0.35 : 0.2),
              rotX: (Math.random() - 0.5) * 0.3,
              rotZ: (Math.random() - 0.5) * 0.3,
              life: 80 + Math.floor(Math.random() * 40)
            });
          }
        }
        
        // Head roll for headshot or lucky heavy kills
        let _headRoll = null;
        if (damageType === 'headshot' || (isExplosiveDeath && Math.random() < 0.4)) {
          const headGeo = new THREE.SphereGeometry(0.15, 6, 5);
          const headMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.9 });
          const head = new THREE.Mesh(headGeo, headMat);
          head.position.copy(deathPos);
          head.position.y = 0.4;
          scene.add(head);
          _headRoll = {
            mesh: head, geo: headGeo, mat: headMat,
            vx: (Math.random() - 0.5) * 0.12,
            vz: (Math.random() - 0.5) * 0.12,
            vy: 0.08,
            rotX: 0.15 + Math.random() * 0.2,
            rotZ: (Math.random() - 0.5) * 0.1,
            life: 120, bloodTimer: 0
          };
        }
        
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            fallFrame++;
            
            // Animate detached body chunks (gravity + rotation + blood trail)
            for (let ci = _deathChunks.length - 1; ci >= 0; ci--) {
              const c = _deathChunks[ci];
              c.life--;
              c.vy -= 0.012; // gravity
              c.mesh.position.x += c.vx;
              c.mesh.position.y += c.vy;
              c.mesh.position.z += c.vz;
              c.mesh.rotation.x += c.rotX;
              c.mesh.rotation.z += c.rotZ;
              // Bounce off ground
              if (c.mesh.position.y < GROUND_Y) {
                c.mesh.position.y = GROUND_Y;
                c.vy = Math.abs(c.vy) * BOUNCE_DAMPEN;
                c.vx *= 0.7; c.vz *= 0.7;
                if (Math.random() < 0.5) spawnBloodDecal(c.mesh.position);
              }
              // Blood trail from chunks
              if (c.life % 6 === 0 && c.mesh.position.y > 0.1) {
                spawnBloodDecal({ x: c.mesh.position.x, y: 0, z: c.mesh.position.z });
              }
              c.mat.opacity = Math.max(0, (c.life / 60) * 0.9);
              if (c.life <= 0) {
                scene.remove(c.mesh); c.geo.dispose(); c.mat.dispose();
                _deathChunks.splice(ci, 1);
              }
            }
            
            // Animate rolling head with blood trail
            if (_headRoll) {
              _headRoll.life--;
              _headRoll.vy -= 0.006; // slower gravity for rolling
              _headRoll.mesh.position.x += _headRoll.vx;
              _headRoll.mesh.position.y += _headRoll.vy;
              _headRoll.mesh.position.z += _headRoll.vz;
              _headRoll.mesh.rotation.x += _headRoll.rotX;
              _headRoll.mesh.rotation.z += _headRoll.rotZ;
              // Bounce/roll on ground
              if (_headRoll.mesh.position.y < 0.15) {
                _headRoll.mesh.position.y = 0.15;
                _headRoll.vy = Math.abs(_headRoll.vy) * 0.2;
                _headRoll.vx *= 0.92; _headRoll.vz *= 0.92; // friction
              }
              // Pumping blood from neck stump
              _headRoll.bloodTimer++;
              if (_headRoll.bloodTimer % 5 === 0) {
                spawnBloodDecal({ x: _headRoll.mesh.position.x, y: 0, z: _headRoll.mesh.position.z });
              }
              if (_headRoll.bloodTimer % 12 === 0 && _headRoll.life > 40) {
                spawnParticles(_headRoll.mesh.position, 0x8B0000, 2);
              }
              _headRoll.mat.opacity = Math.max(0, (_headRoll.life / 80) * 0.9);
              if (_headRoll.life <= 0) {
                scene.remove(_headRoll.mesh); _headRoll.geo.dispose(); _headRoll.mat.dispose();
                _headRoll = null;
              }
            }
            
            if (fallFrame <= FALL_FRAMES) {
              const progress = Math.min(fallFrame / FALL_FRAMES, 1);
              const eased = 1 - Math.pow(1 - progress, 3); // Ease-out cubic for natural fall
              
              if (deathStyle === 0) {
                // Face-plant: fall forward onto stomach with bounce
                dyingMesh.rotation.x = fallSignX * eased * (Math.PI / 2);
                dyingMesh.rotation.z = fallSignZ * eased * 0.2;
                dyingMesh.position.y = startY * (1 - eased);
                dyingMesh.scale.y = startScaleY * (1 - eased * 0.65);
              } else if (deathStyle === 1) {
                // Side fall: topple sideways dramatically
                dyingMesh.rotation.z = fallSignZ * eased * (Math.PI / 2);
                dyingMesh.rotation.x = fallSignX * eased * 0.3;
                dyingMesh.position.y = startY * (1 - eased);
                dyingMesh.scale.y = startScaleY * (1 - eased * 0.45);
              } else if (deathStyle === 2) {
                // Back fall: fall backward with arms spread
                dyingMesh.rotation.x = fallSignX * -1 * eased * (Math.PI / 2.2);
                dyingMesh.rotation.z = fallSignZ * eased * 0.15;
                dyingMesh.position.y = startY * (1 - eased);
                dyingMesh.scale.y = startScaleY * (1 - eased * 0.5);
                dyingMesh.scale.x = startScaleY * (1 + eased * 0.15);
              } else if (deathStyle === 3) {
                // Knees first: two-stage collapse — knees buckle then body falls forward
                if (progress < 0.4) {
                  const kneePhase = progress / 0.4;
                  dyingMesh.scale.y = startScaleY * (1 - kneePhase * 0.55);
                  dyingMesh.position.y = startY * (1 - kneePhase * 0.65);
                } else {
                  const bodyPhase = (progress - 0.4) / 0.6;
                  const bodyEased = 1 - Math.pow(1 - bodyPhase, 2);
                  dyingMesh.scale.y = startScaleY * 0.45 * (1 - bodyEased * 0.6);
                  dyingMesh.rotation.x = fallSignX * bodyEased * (Math.PI / 2);
                  dyingMesh.rotation.z = fallSignZ * bodyEased * 0.35;
                  dyingMesh.position.y = startY * 0.35 * (1 - bodyEased);
                }
              } else if (deathStyle === 4) {
                // Spin and collapse: enemy spins violently as they fall
                dyingMesh.rotation.y = spinDir * eased * Math.PI * 2.0;
                dyingMesh.rotation.x = fallSignX * eased * (Math.PI / 2.5);
                dyingMesh.position.y = startY * (1 - eased);
                dyingMesh.scale.y = startScaleY * (1 - eased * 0.6);
              } else if (deathStyle === 5) {
                // Dramatic crumple: compress vertically then topple
                if (progress < 0.3) {
                  const crumple = progress / 0.3;
                  dyingMesh.scale.y = startScaleY * (1 - crumple * 0.45);
                  dyingMesh.scale.x = startScaleY * (1 + crumple * 0.25);
                  dyingMesh.position.y = startY * (1 - crumple * 0.35);
                } else {
                  const topple = (progress - 0.3) / 0.7;
                  const toppleEased = 1 - Math.pow(1 - topple, 2);
                  dyingMesh.rotation.x = fallSignX * toppleEased * (Math.PI / 2);
                  dyingMesh.rotation.z = fallSignZ * toppleEased * (Math.PI / 3);
                  dyingMesh.scale.y = startScaleY * 0.55 * (1 - toppleEased * 0.45);
                  dyingMesh.position.y = startY * 0.65 * (1 - toppleEased);
                }
              } else if (deathStyle === 6) {
                // Ragdoll flip — launched up slightly then crashes
                if (progress < 0.25) {
                  const launchPhase = progress / 0.25;
                  dyingMesh.position.y = startY + launchPhase * 0.4;
                  dyingMesh.rotation.x = fallSignX * launchPhase * 0.5;
                } else {
                  const crashPhase = (progress - 0.25) / 0.75;
                  const crashEased = 1 - Math.pow(1 - crashPhase, 3);
                  dyingMesh.position.y = (startY + 0.4) * (1 - crashEased);
                  dyingMesh.rotation.x = fallSignX * (0.5 + crashEased * (Math.PI / 2));
                  dyingMesh.rotation.z = fallSignZ * crashEased * 0.4;
                  dyingMesh.scale.y = startScaleY * (1 - crashEased * 0.55);
                }
              } else if (deathStyle === 8) {
                // Crawl and Collapse — fall to knees, crawl forward, collapse face-down
                if (progress < 0.25) {
                  const kneePhase = progress / 0.25;
                  dyingMesh.scale.y = startScaleY * (1 - kneePhase * 0.5);
                  dyingMesh.position.y = startY * (1 - kneePhase * 0.6);
                  dyingMesh.rotation.x = fallSignX * kneePhase * 0.3;
                } else if (progress < 0.75) {
                  const crawlPhase = (progress - 0.25) / 0.5;
                  dyingMesh.scale.y = startScaleY * 0.5;
                  dyingMesh.position.y = startY * 0.4;
                  dyingMesh.position.x = deathPos.x + fallSignX * crawlPhase * 2.5;
                  dyingMesh.position.z = deathPos.z + fallSignZ * crawlPhase * 1.5;
                  dyingMesh.rotation.x = fallSignX * (0.3 + crawlPhase * 0.15 * Math.sin(crawlPhase * 12));
                  if (window.BloodSystem && window.BloodSystem.emitCrawlTrail) {
                    window.BloodSystem.emitCrawlTrail(dyingMesh.position, { x: fallSignX, y: 0, z: fallSignZ });
                  }
                  if (fallFrame % 6 === 0) spawnBloodDecal(dyingMesh.position);
                } else {
                  const collapsePhase = (progress - 0.75) / 0.25;
                  const collapseEased = 1 - Math.pow(1 - collapsePhase, 2);
                  dyingMesh.scale.y = startScaleY * 0.5 * (1 - collapseEased * 0.6);
                  dyingMesh.position.y = startY * 0.4 * (1 - collapseEased);
                  dyingMesh.rotation.x = fallSignX * (0.45 + collapseEased * (Math.PI / 2));
                  spawnBloodDecal(dyingMesh.position);
                }
              } else if (deathStyle === 9) {
                // Split in Half — left/right halves slide apart with blood in the gap
                if (progress < 0.15) {
                  const stagger = progress / 0.15;
                  dyingMesh.rotation.z = fallSignZ * stagger * 0.1;
                  dyingMesh.position.y = startY * (1 - stagger * 0.1);
                } else {
                  const splitPhase = (progress - 0.15) / 0.85;
                  const splitEased = 1 - Math.pow(1 - splitPhase, 2);
                  dyingMesh.scale.x = startScaleY * (1 - splitEased * 0.48);
                  dyingMesh.position.x = deathPos.x + fallSignX * splitEased * 0.6;
                  dyingMesh.position.y = startY * (1 - splitEased);
                  dyingMesh.rotation.z = fallSignZ * splitEased * (Math.PI / 4);
                  dyingMesh.scale.y = startScaleY * (1 - splitEased * 0.55);
                  if (splitPhase > 0.2 && !dyingMesh._splitProxy && managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
                    const proxyGeo = dyingMesh.geometry.clone();
                    const proxyMat = dyingMesh.material.clone();
                    const proxy = new THREE.Mesh(proxyGeo, proxyMat);
                    proxy.position.copy(dyingMesh.position);
                    proxy.position.x = deathPos.x - fallSignX * splitEased * 0.6;
                    proxy.rotation.copy(dyingMesh.rotation);
                    proxy.rotation.z = -fallSignZ * splitEased * (Math.PI / 4);
                    proxy.scale.copy(dyingMesh.scale);
                    scene.add(proxy);
                    dyingMesh._splitProxy = { mesh: proxy, geo: proxyGeo, mat: proxyMat };
                  }
                  if (dyingMesh._splitProxy) {
                    const p = dyingMesh._splitProxy;
                    p.mesh.position.x = deathPos.x - fallSignX * splitEased * 0.6;
                    p.mesh.position.y = startY * (1 - splitEased);
                    p.mesh.rotation.z = -fallSignZ * splitEased * (Math.PI / 4);
                    p.mesh.scale.copy(dyingMesh.scale);
                    p.mat.opacity = dyingMesh.material.opacity;
                  }
                  if (fallFrame % 4 === 0) {
                    spawnBloodDecal({ x: deathPos.x, y: 0, z: deathPos.z });
                  }
                }
              } else if (deathStyle === 10) {
                // Gut Spill — stagger, bend forward, guts fall out, body collapses on top
                if (progress < 0.2) {
                  const stagger = progress / 0.2;
                  dyingMesh.position.x = deathPos.x + Math.sin(stagger * 8) * 0.08;
                  dyingMesh.position.y = startY * (1 - stagger * 0.1);
                } else if (progress < 0.5) {
                  const bendPhase = (progress - 0.2) / 0.3;
                  const bendEased = 1 - Math.pow(1 - bendPhase, 2);
                  dyingMesh.rotation.x = fallSignX * bendEased * (Math.PI / 3);
                  dyingMesh.position.y = startY * (0.9 - bendEased * 0.25);
                  dyingMesh.scale.y = startScaleY * (1 - bendEased * 0.2);
                  if (bendPhase > 0.5 && !dyingMesh._gutsSpawned && managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
                    dyingMesh._gutsSpawned = true;
                    if (window.BloodSystem && window.BloodSystem.emitGuts) {
                      window.BloodSystem.emitGuts(dyingMesh.position);
                    }
                    for (let gi = 0; gi < 4; gi++) {
                      const gutGeo = new THREE.CylinderGeometry(0.04 + Math.random() * 0.03, 0.03, 0.15 + Math.random() * 0.15, 6);
                      const gutMat = new THREE.MeshStandardMaterial({ color: gi < 2 ? 0xCC3344 : 0xDD7788, transparent: true, opacity: 0.9 });
                      const gutMesh = new THREE.Mesh(gutGeo, gutMat);
                      gutMesh.position.copy(dyingMesh.position);
                      gutMesh.position.y = startY * 0.5;
                      scene.add(gutMesh);
                      _deathChunks.push({ mesh: gutMesh, geo: gutGeo, mat: gutMat,
                        vx: (Math.random() - 0.5) * 0.06, vz: fallSignX * (0.02 + Math.random() * 0.04),
                        vy: 0.04 + Math.random() * 0.03, rotX: Math.random() * 0.1, rotZ: Math.random() * 0.1,
                        life: 100, bloodTimer: 0
                      });
                    }
                  }
                } else {
                  const collapsePhase = (progress - 0.5) / 0.5;
                  const collapseEased = 1 - Math.pow(1 - collapsePhase, 3);
                  dyingMesh.rotation.x = fallSignX * (Math.PI / 3 + collapseEased * (Math.PI / 6));
                  dyingMesh.position.y = startY * 0.65 * (1 - collapseEased);
                  dyingMesh.scale.y = startScaleY * 0.8 * (1 - collapseEased * 0.55);
                  if (collapsePhase > 0.7) spawnBloodDecal(deathPos);
                }
              } else {
                // Violent twist — wrench sideways with full rotation
                dyingMesh.rotation.y = spinDir * eased * Math.PI;
                dyingMesh.rotation.z = fallSignZ * eased * (Math.PI / 2.5);
                dyingMesh.position.y = startY * (1 - eased);
                dyingMesh.scale.y = startScaleY * (1 - eased * 0.5);
                dyingMesh.scale.x = startScaleY * (1 + eased * 0.2);
              }
              // Flying enemies: also tumble during fall
              if (wasFlying) {
                dyingMesh.rotation.y += 0.12;
                dyingMesh.position.y = Math.max(0, startY * (1 - eased));
              }
              // Blood spray during fall
              if (progress > 0.3 && fallFrame % 4 === 0) {
                spawnBloodDecal(deathPos);
              }
              // Bounce impact when hitting ground near end of fall
              if (progress > 0.82 && progress < 0.95) {
                spawnParticles(deathPos, 0x8B0000, 4);
                spawnParticles(deathPos, 0x660000, 2);
                spawnBloodDecal(deathPos);
                spawnBloodDecal({ x: deathPos.x + (Math.random()-0.5)*0.8, y: 0, z: deathPos.z + (Math.random()-0.5)*0.8 });
              }
            } else if (fallFrame <= FALL_FRAMES + LINGER_FRAMES) {
              // Phase 2: Lie on ground lifeless - pooling blood beneath
              const lingerProgress = (fallFrame - FALL_FRAMES) / LINGER_FRAMES;
              if (lingerProgress < 0.15) {
                // Impact bounce/settle
                const bounce = Math.sin(lingerProgress * Math.PI * 8) * 0.03 * (1 - lingerProgress * 7);
                dyingMesh.position.y = bounce;
              }
              // Continuous blood pooling with heartbeat pulsation while body lies there
              if (fallFrame % 10 === 0 && lingerProgress < 0.6) {
                spawnBloodDecal({ x: deathPos.x + (Math.random()-0.5)*0.6, y: 0, z: deathPos.z + (Math.random()-0.5)*0.6 });
              }
              // Heartbeat blood pump — rhythmic spurts from wound
              const heartbeatPhase = Math.sin(lingerProgress * Math.PI * 12); // ~6 beats
              if (heartbeatPhase > 0.8 && lingerProgress < 0.7 && fallFrame % 3 === 0) {
                spawnParticles(deathPos, 0x8B0000, 2);
                if (bloodDrips.length < MAX_BLOOD_DRIPS) {
                  if (!_sharedBloodDripGeo) _sharedBloodDripGeo = new THREE.SphereGeometry(1, 4, 4);
                  const pumpDrip = new THREE.Mesh(_sharedBloodDripGeo, new THREE.MeshBasicMaterial({ color: 0xAA0000 }));
                  pumpDrip.scale.setScalar(0.02 + Math.random() * 0.03);
                  pumpDrip.position.copy(deathPos);
                  pumpDrip.position.y += 0.1;
                  scene.add(pumpDrip);
                  bloodDrips.push({
                    mesh: pumpDrip,
                    velX: (Math.random()-0.5) * 0.08,
                    velZ: (Math.random()-0.5) * 0.08,
                    velY: 0.06 + Math.random() * 0.1,
                    life: 30 + Math.floor(Math.random() * 15),
                    _sharedGeo: true
                  });
                }
              }
            } else if (fallFrame <= FALL_FRAMES + LINGER_FRAMES + EXPLODE_FRAMES) {
              // Phase 3: Blood explosion - body bursts
              const explodeProgress = (fallFrame - FALL_FRAMES - LINGER_FRAMES) / EXPLODE_FRAMES;
              if (explodeProgress < 0.4) {
                spawnParticles(deathPos, 0x8B0000, 5);
                spawnParticles(deathPos, 0x660000, 3);
                spawnBloodDecal(deathPos);
                spawnBloodDecal({ x: deathPos.x + (Math.random()-0.5)*1.5, y: 0, z: deathPos.z + (Math.random()-0.5)*1.5 });
              }
              // Flatten and expand as body breaks apart
              if (dyingMesh.material) {
                dyingMesh.material.transparent = true;
                dyingMesh.material.opacity = 1 - explodeProgress * 0.75;
              }
              dyingMesh.scale.y *= 0.9;
              dyingMesh.scale.x *= 1.04;
              dyingMesh.scale.z *= 1.04;
            } else if (fallFrame <= FALL_FRAMES + LINGER_FRAMES + EXPLODE_FRAMES + FADE_FRAMES) {
              // Phase 4: Fade out remains
              const fadeProgress = (fallFrame - FALL_FRAMES - LINGER_FRAMES - EXPLODE_FRAMES) / FADE_FRAMES;
              if (dyingMesh.material) {
                dyingMesh.material.transparent = true;
                dyingMesh.material.opacity = Math.max(0, 0.25 * (1 - fadeProgress));
              }
            } else {
              // Phase 5: Remove corpse
              scene.remove(dyingMesh);
              if (dyingMesh.geometry) dyingMesh.geometry.dispose();
              if (dyingMesh.material) dyingMesh.material.dispose();
              // bullet holes use shared geometry — only dispose per-hole cloned materials
              if (_bulletHoles) _bulletHoles.forEach(h => { if (h.material) h.material.dispose(); });
              // blood stains use shared geometry — only dispose per-stain materials
              if (_bloodStains) _bloodStains.forEach(s => { if (s.material) s.material.dispose(); });
              if (_leftEye) { scene.remove(_leftEye); if (_leftEye.geometry) _leftEye.geometry.dispose(); if (_leftEye.material) _leftEye.material.dispose(); }
              if (_rightEye) { scene.remove(_rightEye); if (_rightEye.geometry) _rightEye.geometry.dispose(); if (_rightEye.material) _rightEye.material.dispose(); }
              // Clean up remaining chunks
              _deathChunks.forEach(c => { scene.remove(c.mesh); c.geo.dispose(); c.mat.dispose(); });
              if (_headRoll) { scene.remove(_headRoll.mesh); _headRoll.geo.dispose(); _headRoll.mat.dispose(); }
              if (dyingMesh._splitProxy) { scene.remove(dyingMesh._splitProxy.mesh); dyingMesh._splitProxy.geo.dispose(); dyingMesh._splitProxy.mat.dispose(); }
              return false;
            }
            return true;
          },
          cleanup() {
            // Called by resetGame when the animation is still in-progress.
            // Force-remove the dying mesh and all sub-resources from the scene.
            if (dyingMesh.parent) scene.remove(dyingMesh);
            if (dyingMesh.geometry) dyingMesh.geometry.dispose();
            if (dyingMesh.material) dyingMesh.material.dispose();
            // bullet holes / blood stains use shared geometry — only dispose per-hole materials
            if (_bulletHoles) _bulletHoles.forEach(h => { if (h.material) h.material.dispose(); });
            if (_bloodStains) _bloodStains.forEach(s => { if (s.material) s.material.dispose(); });
            if (_leftEye) { if (_leftEye.parent) scene.remove(_leftEye); if (_leftEye.geometry) _leftEye.geometry.dispose(); if (_leftEye.material) _leftEye.material.dispose(); }
            if (_rightEye) { if (_rightEye.parent) scene.remove(_rightEye); if (_rightEye.geometry) _rightEye.geometry.dispose(); if (_rightEye.material) _rightEye.material.dispose(); }
            _deathChunks.forEach(c => { if (c.mesh.parent) scene.remove(c.mesh); c.geo.dispose(); c.mat.dispose(); });
            if (_headRoll) { if (_headRoll.mesh.parent) scene.remove(_headRoll.mesh); _headRoll.geo.dispose(); _headRoll.mat.dispose(); }
            if (dyingMesh._splitProxy) { if (dyingMesh._splitProxy.mesh.parent) scene.remove(dyingMesh._splitProxy.mesh); dyingMesh._splitProxy.geo.dispose(); dyingMesh._splitProxy.mat.dispose(); }
          }
        });
        } else {
          // Fallback: no animation slot available, remove immediately
          scene.remove(dyingMesh);
          setTimeout(() => {
            if (dyingMesh.geometry) dyingMesh.geometry.dispose();
            if (dyingMesh.material) dyingMesh.material.dispose();
            // bullet holes / blood stains use shared geometry — only dispose per-hole materials
            if (_bulletHoles) _bulletHoles.forEach(h => { if (h.material) h.material.dispose(); });
            if (_bloodStains) _bloodStains.forEach(s => { if (s.material) s.material.dispose(); });
            if (_leftEye) { scene.remove(_leftEye); if (_leftEye.geometry) _leftEye.geometry.dispose(); if (_leftEye.material) _leftEye.material.dispose(); }
            if (_rightEye) { scene.remove(_rightEye); if (_rightEye.geometry) _rightEye.geometry.dispose(); if (_rightEye.material) _rightEye.material.dispose(); }
          }, 100);
          // XP already spawned above; nothing extra needed in this fallback
        }
        
        // PR #117: Drop GOLD - Reduced drop rate (chest-like rarity), bigger amounts
        let goldAmount = 0;
        let dropChance = 0;
        
        if (this.isFlyingBoss) {
          // Flying Boss: guaranteed large gold reward
          goldAmount = 100 + Math.floor(Math.random() * 101); // 100-200 gold
          dropChance = 1.0;
        } else if (this.isMiniBoss) {
          // MiniBoss: guaranteed 50-100 gold (increased from 30-60)
          goldAmount = 50 + Math.floor(Math.random() * 51);
          dropChance = 1.0; // 100% for mini-boss
        } else {
          // Regular enemies: MUCH lower drop rate (5-10% instead of 100%)
          dropChance = 0.05 + Math.random() * 0.05; // 5-10% chance
          
          if (Math.random() < dropChance) {
            // When they DO drop, drop MUCH more gold
            if (this.type === 0) { // Tank
              goldAmount = 8 + Math.floor(Math.random() * 5); // 8-12 gold (was 2-3)
            } else if (this.type === 1) { // Fast
              goldAmount = 5 + Math.floor(Math.random() * 3); // 5-7 gold (was 1)
            } else if (this.type === 2) { // Balanced
              goldAmount = 6 + Math.floor(Math.random() * 4); // 6-9 gold (was 1-2)
            } else if (this.type === 3) { // Slowing
              goldAmount = 8 + Math.floor(Math.random() * 5); // 8-12 gold (was 2-3)
            } else if (this.type === 4) { // Ranged
              goldAmount = 6 + Math.floor(Math.random() * 4); // 6-9 gold (was 1-2)
            } else if (this.type === 5) { // Flying
              goldAmount = 8 + Math.floor(Math.random() * 5); // 8-12 gold (was 2-3)
            } else if (this.type === 6) { // Hard Tank
              goldAmount = 15 + Math.floor(Math.random() * 11); // 15-25 gold (was 3-5)
            } else if (this.type === 7) { // Hard Fast
              goldAmount = 10 + Math.floor(Math.random() * 11); // 10-20 gold (was 2-4)
            } else if (this.type === 8) { // Hard Balanced
              goldAmount = 15 + Math.floor(Math.random() * 11); // 15-25 gold (was 3-5)
            } else if (this.type === 9) { // Elite
              goldAmount = 25 + Math.floor(Math.random() * 26); // 25-50 gold (was 5-8)
            } else if (this.type === 12) { // Bug Ranged
              goldAmount = 8 + Math.floor(Math.random() * 7);  // 8-14 gold
            } else if (this.type === 13) { // Bug Slow
              goldAmount = 12 + Math.floor(Math.random() * 9); // 12-20 gold
            } else if (this.type === 14) { // Bug Fast
              goldAmount = 5 + Math.floor(Math.random() * 5);  // 5-9 gold
            } else if (this.type === 15) { // Daddy Longlegs — easy early enemy, small reward
              goldAmount = 3 + Math.floor(Math.random() * 4);  // 3-6 gold
            } else if (this.type === 16) { // Sweeping Swarm — minimal reward
              goldAmount = 2 + Math.floor(Math.random() * 3);  // 2-4 gold
            } else {
              goldAmount = 5 + Math.floor(Math.random() * 6); // 5-10 gold (was 1-2)
            }
          }
        }
        
        // Only spawn gold if amount > 0
        if (goldAmount > 0) {
          spawnGold(deathPos.x, deathPos.z, goldAmount);
          // Rare visual-only gold drop animation (~12% chance)
          if (Math.random() < 0.12) {
            spawnGoldDrop(deathPos.x, deathPos.z, goldAmount);
          }
        }
        
        // Phase 1: Gear drop system - enemies have a chance to drop gear
        let gearDropChance = 0;
        if (this.isFlyingBoss) {
          gearDropChance = 0.75; // 75% for flying boss
        } else if (this.isMiniBoss) {
          gearDropChance = 0.5; // 50% for mini-boss
        } else {
          // Regular enemies: 3-8% chance (scales with enemy type 0-9)
          // Enemy types 0-9 add 0-0.05% additional chance
          gearDropChance = 0.03 + Math.min(this.type * 0.005, 0.05); // 3-8% cap
        }
        
        if (Math.random() < gearDropChance) {
          const newGear = generateRandomGear();
          saveData.inventory.push(newGear);
          saveSaveData();
          
          // Show notification
          const rarityColors = {
            common: '#AAAAAA',
            uncommon: '#00FF00',
            rare: '#5DADE2',
            epic: '#9B59B6',
            legendary: '#F39C12'
          };
          createFloatingText(`+${newGear.name}`, deathPos, rarityColors[newGear.rarity] || '#FFFFFF');
          playSound('coin');

          // Notify SSB with gear drop rarity
          if (window.pushSuperStatEvent) {
            const gr = newGear.rarity || 'common';
            window.pushSuperStatEvent(`📦 ${newGear.name}`, gr, '📦', 'success');
          }
          
          console.log('[Phase 1 Gear Drop]', newGear.name, '-', newGear.rarity);
          
          // Quest progression: lake chest quest (triggered by first item collection)
          if (saveData.storyQuests.currentQuest === 'discoverLakeChest' && saveData.inventory.length === 1) {
            // This is the first item - treat it as finding the lake chest
            setTimeout(() => {
              progressQuest('discoverLakeChest', true);
            }, 2000); // Small delay to let player see the item notification
          }
        }
        
        playerStats.kills++;

        // Heal on kill (Bloodlust skill and similar)
        if (playerStats.healOnKill > 0) {
          playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + playerStats.healOnKill);
          updateHUD();
        }

        // Tutorial Quest: Track kills this run
        if (saveData.tutorialQuests) {
          saveData.tutorialQuests.killsThisRun = playerStats.kills;
          updateQuestTracker();
          
          // Quest 1: Kill 3 enemies
          const currentQuest = getCurrentQuest();
          if (currentQuest && currentQuest.id === 'quest1_kill3' && playerStats.kills >= 3) {
            progressTutorialQuest('quest1_kill3', true);
            // Guard: only set pending notification if quest1 is now in readyToClaim
            if (saveData.tutorialQuests.readyToClaim.includes('quest1_kill3')) {
              saveData.tutorialQuests.pendingMissionNotification = 'quest1_kill3';
            }
          }
          // Quest kill tracking — notify mid-run when objective reached
          if (currentQuest && currentQuest.id === 'quest8_kill10' && playerStats.kills >= 10 &&
              !saveData.tutorialQuests.readyToClaim.includes('quest8_kill10')) {
            showStatChange('⚔️ 10 Kills! Return to camp after this run!');
          }
          // Kill 15 enemies
          if (currentQuest && currentQuest.id === 'quest10_kill15' && playerStats.kills >= 15 &&
              !saveData.tutorialQuests.readyToClaim.includes('quest10_kill15')) {
            showStatChange('⚔️ 15 Kills! Return to camp to claim your reward!');
          }
          // Kill 25 enemies
          if (currentQuest && currentQuest.id === 'quest14_kill25' && playerStats.kills >= 25 &&
              !saveData.tutorialQuests.readyToClaim.includes('quest14_kill25')) {
            progressTutorialQuest('quest14_kill25', true);
            showStatChange('⚔️ 25 Kills! Return to camp to claim your reward!');
          }
          // Kill 20 enemies (Trash & Recycle unlock)
          if (currentQuest && currentQuest.id === 'quest26_kill20' && playerStats.kills >= 20 &&
              !saveData.tutorialQuests.readyToClaim.includes('quest26_kill20')) {
            showStatChange('⚔️ 20 Kills! Return to camp to claim your reward!');
          }
          // Kill 12 enemies (alternation run quest)
          if (currentQuest && currentQuest.id === 'quest15b_runKill12' && playerStats.kills >= 12 &&
              !saveData.tutorialQuests.readyToClaim.includes('quest15b_runKill12')) {
            showStatChange('⚔️ 12 Kills! Return to camp to claim your reward!');
          }
          // Kill 8 enemies (grow companion to adult)
          if (currentQuest && currentQuest.id === 'quest19c_growAdult' && playerStats.kills >= 8 &&
              !saveData.tutorialQuests.readyToClaim.includes('quest19c_growAdult')) {
            showStatChange('🐺 8 Kills! Your companion is growing stronger!');
          }
        }
        
        // Track side challenge progress
        if (saveData.sideChallenges.kill10Enemies && !saveData.sideChallenges.kill10Enemies.completed) {
          saveData.sideChallenges.kill10Enemies.progress++;
          if (saveData.sideChallenges.kill10Enemies.progress >= saveData.sideChallenges.kill10Enemies.target) {
            saveData.sideChallenges.kill10Enemies.completed = true;
            // Award gold before saving to prevent loss on crash
            saveData.gold += 50;
            saveSaveData();
            createFloatingText("Side Quest Complete: Kill 10 Enemies! +50 Gold", deathPos, '#FFD700');
          }
        }
        
        // Track mini-boss defeats for achievements
        if (this.isMiniBoss) {
          playerStats.miniBossesDefeated++;
          createFloatingText("MINI-BOSS DEFEATED! 🏆", deathPos);
          // Track first boss defeat for quest_pushingLimits
          if (saveData.tutorialQuests && !saveData.tutorialQuests.firstBossDefeated) {
            saveData.tutorialQuests.firstBossDefeated = true;
            saveSaveData();
          }
          // Clean up any surviving minions spawned with this mini-boss
          // Stagger deaths to prevent simultaneous death effect overload (freeze fix)
          let minionDelay = 0;
          for (const e of enemies) {
            if (!e.isDead && e.isMiniBossMinion) {
              const minionRef = e;
              setTimeout(() => { if (!minionRef.isDead) minionRef.die(); }, minionDelay);
              minionDelay += 150; // 150ms between each minion death
            }
          }
        }
        if (this.isFlyingBoss) {
          playerStats.miniBossesDefeated++;
          createFloatingText("⚡ FLYING BOSS DEFEATED! ⚡", deathPos, '#FF00FF');
          showEnhancedNotification('achievement', '⚡ FLYING BOSS SLAIN!', 'You defeated the Level 15 Flying Boss!');
        }
        
        updateHUD();
        updateComboCounter(true); // Phase 2: Track combo on kill
        checkAchievements(); // Check for achievements after kill
        // Rage Mode: add rage on kill
        if (window.GameRageCombat) window.GameRageCombat.addRage(8);
        // Special Atk Points: earn 1 point per 10 kills
        if (playerStats.kills % 10 === 0) {
          saveData.specialAtkPoints = (saveData.specialAtkPoints || 0) + 1;
        }
        // Harvesting: chance to drop Flesh, and spawn skinnable carcass for animal-type enemies
        if (window.GameHarvesting && this.mesh) window.GameHarvesting.onEnemyKilled(this.mesh.position, this.type);
        // Kill 7 achievement check
        if (playerStats.kills === 7 && (!saveData.achievementQuests || !saveData.achievementQuests.kill7Unlocked)) {
          if (!saveData.achievementQuests) saveData.achievementQuests = { kill7Unlocked: false, kill7Quest: 'none' };
          saveData.achievementQuests.kill7Unlocked = true;
          saveData.achievementQuests.kill7Quest = 'active';
          saveSaveData();
          showEnhancedNotification('achievement', '🏆 ACHIEVEMENT UNLOCKED: Kill 7 Enemies!', 'Visit the Achievement Building in Camp to claim your reward!');
          updateStatBar();
        }
      }
      
      // Specialized death effects by damage type
      dieStandard(enemyColor) {
        // 7 varied death animations — realistic gun kills with pumping blood
        const deathVariation = Math.floor(Math.random() * 10);
        const deathPos = this.mesh.position.clone();
        
        if (deathVariation === 0) {
          // BLOOD BURST — intense spray, wound pumps blood in pulses
          spawnParticles(deathPos, 0x8B0000, 18);
          spawnParticles(deathPos, 0xCC0000, 10);
          for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            const dist = 0.4 + Math.random() * 0.8;
            spawnBloodDecal({ x: deathPos.x + Math.cos(angle) * dist, y: 0, z: deathPos.z + Math.sin(angle) * dist });
          }
          // Pumping blood: pulses of decreasing size spray from wound
          if (window.BloodSystem) {
            window.BloodSystem.emitPulse(deathPos, { pulses: 5, perPulse: 120, interval: 200, spreadXZ: 1.0, minSize: 0.02, maxSize: 0.08 });
          }
        } else if (deathVariation === 1) {
          // CORPSE WITH POOLING BLOOD — body falls, blood pools slowly
          spawnParticles(deathPos, 0x8B0000, 8);
          spawnParticles(deathPos, 0xCC0000, 4);
          const corpseGeo = new THREE.SphereGeometry(0.45, 8, 6);
          const corpseMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const corpse = new THREE.Mesh(corpseGeo, corpseMat);
          corpse.position.copy(deathPos); corpse.position.y = 0.12; corpse.scale.y = 0.22;
          scene.add(corpse);
          const bloodGeo = new THREE.CircleGeometry(0.8, 16);
          const bloodMat = new THREE.MeshStandardMaterial({ color: 0x8B0000, transparent: true, opacity: 0, roughness: 0.3, metalness: 0.5, side: THREE.DoubleSide, depthWrite: false });
          const bloodPool = new THREE.Mesh(bloodGeo, bloodMat);
          bloodPool.position.set(deathPos.x, 0.05, deathPos.z); bloodPool.rotation.x = -Math.PI / 2;
          scene.add(bloodPool);
          let corpseLife = 600; // ~10 seconds at 60fps
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              corpseLife--;
              // Blood pool grows (first 0.5s) then stays full, fades only at the end
              if (corpseLife > 540) bloodMat.opacity = Math.min(0.6, (600 - corpseLife) / 60 * 0.6);
              else if (corpseLife > 60) bloodMat.opacity = 0.6;
              else bloodMat.opacity = (corpseLife / 60) * 0.6;
              corpse.material.opacity = corpseLife > 60 ? 0.85 : (corpseLife / 60) * 0.85;
              if (corpseLife <= 0) {
                scene.remove(corpse); scene.remove(bloodPool);
                corpseGeo.dispose(); corpseMat.dispose(); bloodGeo.dispose(); bloodMat.dispose();
                return false;
              }
              return true;
            }});
          } else {
            scene.remove(corpse); scene.remove(bloodPool);
            corpseGeo.dispose(); corpseMat.dispose(); bloodGeo.dispose(); bloodMat.dispose();
          }
        } else if (deathVariation === 2) {
          // BLOOD MIST — dissolves in cloud of blood particles
          spawnParticles(deathPos, 0x8B0000, 15);
          spawnParticles(deathPos, 0xCC2200, 10);
          spawnParticles(deathPos, 0x660000, 6);
          for (let i = 0; i < 4; i++) {
            spawnBloodDecal({ x: deathPos.x + (Math.random()-0.5)*2.5, y: 0, z: deathPos.z + (Math.random()-0.5)*2.5 });
          }
        } else if (deathVariation === 3) {
          // SPLATTER — blood splashes radially, corpse flattened
          spawnParticles(deathPos, 0x8B0000, 18);
          spawnParticles(deathPos, 0xCC0000, 8);
          for (let i = 0; i < 6; i++) {
            const splatter = new THREE.Mesh(
              new THREE.CircleGeometry(0.15 + Math.random() * 0.25, 8),
              new THREE.MeshBasicMaterial({ color: 0x8B0000, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
            );
            const angle = (i / 6) * Math.PI * 2;
            const dist = 0.4 + Math.random() * 0.6;
            splatter.position.set(deathPos.x + Math.cos(angle)*dist, 0.05, deathPos.z + Math.sin(angle)*dist);
            splatter.rotation.x = -Math.PI / 2;
            scene.add(splatter);
            let life = 100;
            if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
              managedAnimations.push({ update(_dt) {
                life--;
                splatter.material.opacity = (life/100) * 0.55;
                if (life <= 0) { scene.remove(splatter); splatter.geometry.dispose(); splatter.material.dispose(); return false; }
                return true;
              }});
            } else { scene.remove(splatter); splatter.geometry.dispose(); splatter.material.dispose(); }
          }
        } else if (deathVariation === 4) {
          // EXIT WOUND SPRAY — blood flies 1m+ out from back, pumping decaying pulses
          spawnParticles(deathPos, 0x8B0000, 12);
          spawnParticles(deathPos, 0xCC0000, 8);
          if (window.BloodSystem) {
            const exitDir = new THREE.Vector3((Math.random()-0.5)*2, 0, (Math.random()-0.5)*2).normalize();
            const exitPos = deathPos.clone();
            exitPos.x += exitDir.x * 0.5; exitPos.z += exitDir.z * 0.5;
            window.BloodSystem.emitExitWound(exitPos, exitDir, 80, { spread: 0.6, speed: 0.4 });
            // Pumping — smaller and smaller pulses
            window.BloodSystem.emitPulse(exitPos, { pulses: 4, perPulse: 60, interval: 250, spreadXZ: 0.8, minSize: 0.015, maxSize: 0.06 });
          }
          for (let i = 0; i < 4; i++) spawnBloodDecal(deathPos);
        } else if (deathVariation === 5) {
          // WOUND BLEED — large entry/exit wounds with blood streaming down and pooling
          spawnParticles(deathPos, 0x8B0000, 14);
          spawnParticles(deathPos, 0x660000, 8);
          // Blood drips streaming down from wound position
          for (let d = 0; d < 4 && bloodDrips.length < MAX_BLOOD_DRIPS; d++) {
            if (!_sharedBloodDripGeo && typeof THREE !== 'undefined') _sharedBloodDripGeo = new THREE.SphereGeometry(1, 4, 4);
            const drip = new THREE.Mesh(_sharedBloodDripGeo, new THREE.MeshBasicMaterial({ color: [0x8B0000, 0xAA0000, 0x660000, 0xCC0000][d%4] }));
            drip.scale.setScalar(0.04 + Math.random() * 0.04);
            drip.position.set(deathPos.x + (Math.random()-0.5)*0.3, deathPos.y + 0.3, deathPos.z + (Math.random()-0.5)*0.3);
            scene.add(drip);
            bloodDrips.push({ mesh: drip, velX: (Math.random()-0.5)*0.02, velZ: (Math.random()-0.5)*0.02, velY: -0.03, life: 50 + Math.floor(Math.random()*20), _sharedGeo: true });
          }
          for (let i = 0; i < 5; i++) spawnBloodDecal(deathPos);
        } else if (deathVariation === 6) {
          // STAIN DEATH — multiple ground stains in varied sizes (small to large)
          spawnParticles(deathPos, 0x8B0000, 12);
          spawnParticles(deathPos, 0xCC0000, 6);
          for (let i = 0; i < 7; i++) {
            const sizeRoll = Math.random();
            const r = sizeRoll < 0.4 ? 0.05 + Math.random()*0.1 : sizeRoll < 0.7 ? 0.15 + Math.random()*0.2 : 0.3 + Math.random()*0.3;
            const stainGeo = new THREE.CircleGeometry(r, r > 0.15 ? 10 : 6);
            const stainMat = new THREE.MeshBasicMaterial({ color: sizeRoll < 0.5 ? 0x8B0000 : 0x6B0000, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
            const stain = new THREE.Mesh(stainGeo, stainMat);
            stain.position.set(deathPos.x + (Math.random()-0.5)*2, 0.05, deathPos.z + (Math.random()-0.5)*2);
            stain.rotation.x = -Math.PI / 2;
            scene.add(stain);
            let life = 120;
            if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
              managedAnimations.push({ update(_dt) {
                life--;
                stain.material.opacity = (life/120) * 0.5;
                if (life <= 0) { scene.remove(stain); stainGeo.dispose(); stainMat.dispose(); return false; }
                return true;
              }});
            } else { scene.remove(stain); stainGeo.dispose(); stainMat.dispose(); }
          }
        } else if (deathVariation === 7) {
          // CRAWL TRAIL — crawls forward leaving blood trail then face-plants
          spawnParticles(deathPos, 0x8B0000, 10);
          spawnParticles(deathPos, 0xAA0000, 6);
          const crawlGeo = new THREE.SphereGeometry(0.4, 8, 6);
          const crawlMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const crawlBody = new THREE.Mesh(crawlGeo, crawlMat);
          crawlBody.position.copy(deathPos);
          crawlBody.position.y = 0.15;
          crawlBody.scale.y = 0.3;
          scene.add(crawlBody);
          const crawlDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
          let crawlLife = 80;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              crawlLife--;
              if (crawlLife > 30) {
                crawlBody.position.x += crawlDir.x * 0.015;
                crawlBody.position.z += crawlDir.z * 0.015;
                if (crawlLife % 5 === 0) {
                  spawnBloodDecal({ x: crawlBody.position.x, y: 0, z: crawlBody.position.z });
                }
                if (window.BloodSystem && window.BloodSystem.emitCrawlTrail) {
                  window.BloodSystem.emitCrawlTrail(crawlBody.position, { x: crawlDir.x, y: 0, z: crawlDir.z });
                }
              } else if (crawlLife === 30) {
                crawlBody.scale.y = 0.15;
                crawlBody.position.y = 0.08;
                spawnParticles(crawlBody.position, 0x8B0000, 8);
              }
              if (crawlLife < 30) {
                crawlBody.material.opacity = (crawlLife / 30) * 0.85;
              }
              if (crawlLife <= 0) {
                scene.remove(crawlBody); crawlBody.geometry.dispose(); crawlBody.material.dispose();
                return false;
              }
              return true;
            }});
          } else {
            scene.remove(crawlBody); crawlBody.geometry.dispose(); crawlBody.material.dispose();
          }
        } else if (deathVariation === 8) {
          // ROLL OVER — body rolls sideways with tumbling animation
          spawnParticles(deathPos, 0x8B0000, 12);
          spawnParticles(deathPos, 0xCC0000, 6);
          const rollGeo = new THREE.SphereGeometry(0.4, 8, 6);
          const rollMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const rollBody = new THREE.Mesh(rollGeo, rollMat);
          rollBody.position.copy(deathPos);
          rollBody.position.y = 0.2;
          rollBody.scale.y = 0.35;
          scene.add(rollBody);
          const rollDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
          let rollLife = 90;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              rollLife--;
              if (rollLife > 30) {
                rollBody.position.x += rollDir.x * 0.02;
                rollBody.position.z += rollDir.z * 0.02;
                rollBody.rotation.z += Math.PI * 2 / 60;
                if (rollLife % 4 === 0) {
                  spawnBloodDecal({ x: rollBody.position.x, y: 0, z: rollBody.position.z });
                  spawnParticles(rollBody.position, 0x8B0000, 2);
                }
              } else if (rollLife === 30) {
                rollBody.position.y = 0.08;
                rollBody.scale.y = 0.18;
                spawnParticles(rollBody.position, 0x660000, 6);
              }
              if (rollLife < 30) {
                rollBody.material.opacity = (rollLife / 30) * 0.85;
              }
              if (rollLife <= 0) {
                scene.remove(rollBody); rollBody.geometry.dispose(); rollBody.material.dispose();
                return false;
              }
              return true;
            }});
          } else {
            scene.remove(rollBody); rollBody.geometry.dispose(); rollBody.material.dispose();
          }
        } else if (deathVariation === 9) {
          // STAGGER & DROP — staggers 3 steps left/right then drops
          spawnParticles(deathPos, 0x8B0000, 14);
          spawnParticles(deathPos, 0xCC0000, 8);
          const staggerGeo = new THREE.SphereGeometry(0.45, 8, 6);
          const staggerMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const staggerBody = new THREE.Mesh(staggerGeo, staggerMat);
          staggerBody.position.copy(deathPos);
          staggerBody.position.y = 0.3;
          staggerBody.scale.y = 0.4;
          scene.add(staggerBody);
          let staggerLife = 100;
          const staggerSign = Math.random() < 0.5 ? 1 : -1;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              staggerLife--;
              if (staggerLife > 40) {
                const phase = (100 - staggerLife) / 20;
                staggerBody.position.x = deathPos.x + Math.sin(phase * Math.PI) * 0.3 * staggerSign;
                staggerBody.position.z = deathPos.z + Math.cos(phase * Math.PI * 0.5) * 0.1;
                if (staggerLife % 8 === 0) spawnParticles(staggerBody.position, 0x8B0000, 3);
              } else if (staggerLife === 40) {
                staggerBody.position.y = 0.08;
                staggerBody.scale.y = 0.18;
                spawnParticles(staggerBody.position, 0x660000, 10);
                const poolGeo = new THREE.CircleGeometry(0.7, 12);
                const poolMat = new THREE.MeshBasicMaterial({ color: 0x8B0000, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
                const pool = new THREE.Mesh(poolGeo, poolMat);
                pool.position.set(staggerBody.position.x, 0.05, staggerBody.position.z);
                pool.rotation.x = -Math.PI / 2;
                scene.add(pool);
                let poolLife = 100;
                if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
                  managedAnimations.push({ update(_dt) {
                    poolLife--;
                    pool.material.opacity = (poolLife / 100) * 0.6;
                    if (poolLife <= 0) { scene.remove(pool); poolGeo.dispose(); poolMat.dispose(); return false; }
                    return true;
                  }});
                } else { scene.remove(pool); poolGeo.dispose(); poolMat.dispose(); }
                for (let i = 0; i < 5; i++) spawnBloodDecal({ x: staggerBody.position.x + (Math.random()-0.5)*0.8, y: 0, z: staggerBody.position.z + (Math.random()-0.5)*0.8 });
              }
              if (staggerLife < 40) {
                staggerBody.material.opacity = (staggerLife / 40) * 0.85;
              }
              if (staggerLife <= 0) {
                scene.remove(staggerBody); staggerBody.geometry.dispose(); staggerBody.material.dispose();
                return false;
              }
              return true;
            }});
          } else {
            scene.remove(staggerBody); staggerBody.geometry.dispose(); staggerBody.material.dispose();
          }
        }
      }
      
      dieByFire(enemyColor) {
        // Fire death: Char and burn to ash
        spawnParticles(this.mesh.position, 0xFF4500, 20); // Orange fire
        spawnParticles(this.mesh.position, 0xFFFF00, 10); // Yellow flames
        spawnParticles(this.mesh.position, 0x222222, 8); // Black smoke
        
        // Charred corpse - 3D flattened body shape
        const corpseGeo = new THREE.SphereGeometry(0.5, 8, 6);
        const corpseMat = new THREE.MeshBasicMaterial({ 
          color: 0x222222, // Charred black
          transparent: true,
          opacity: 0.8
        });
        const corpse = new THREE.Mesh(corpseGeo, corpseMat);
        corpse.position.copy(this.mesh.position);
        corpse.position.y = 0.11;
        corpse.scale.y = 0.2; // Flat charred body
        scene.add(corpse);
        
        // Burn mark on ground
        const burnGeo = new THREE.CircleGeometry(0.9, 16);
        const burnMat = new THREE.MeshBasicMaterial({ 
          color: 0x111111, 
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide
        });
        const burnMark = new THREE.Mesh(burnGeo, burnMat);
        burnMark.position.copy(this.mesh.position);
        burnMark.position.y = 0.05;
        burnMark.rotation.x = -Math.PI / 2;
        scene.add(burnMark);
        
        // Fade to ash
        let life = 120;
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
        managedAnimations.push({ update(_dt) {
          life--;
          corpse.material.opacity = (life / 120) * 0.8;
          corpse.scale.multiplyScalar(0.995);
          if (life <= 0) {
            scene.remove(corpse);
            scene.remove(burnMark);
            corpse.geometry.dispose();
            corpse.material.dispose();
            burnMark.geometry.dispose();
            burnMark.material.dispose();
            return false;
          }
          return true;
        }});
        } else {
          scene.remove(corpse); scene.remove(burnMark);
          corpse.geometry.dispose(); corpse.material.dispose();
          burnMark.geometry.dispose(); burnMark.material.dispose();
        }
      }
      
      dieByIce(enemyColor) {
        // Enhanced ice death: crack → struggle → shatter, leaves ice chunks + water pools
        const deathPos = this.mesh.position.clone();
        spawnParticles(deathPos, 0x87CEEB, 15); // Light blue ice
        spawnParticles(deathPos, 0xFFFFFF, 12); // White frost
        // Ice crack particles
        if (window.BloodSystem) {
          window.BloodSystem.emitBurst(deathPos, 40, { spreadXZ: 0.5, spreadY: 0.4, color1: 0xAEEEFF, color2: 0xFFFFFF, minSize: 0.05, maxSize: 0.14, minLife: 30, maxLife: 60 });
        }

        // Brief struggle: body shakes before shattering
        let struggleCount = 0;
        const sx = deathPos.x, sz = deathPos.z;
        const struggleInterval = setInterval(() => {
          struggleCount++;
          if (this.mesh) {
            this.mesh.position.x = sx + (Math.random()-0.5) * (struggleCount < 4 ? 0.06 : 0.12);
            this.mesh.position.z = sz + (Math.random()-0.5) * (struggleCount < 4 ? 0.06 : 0.12);
            this.mesh.rotation.y += (Math.random()-0.5) * 0.3;
          }
          if (struggleCount >= 10) clearInterval(struggleInterval);
        }, 40);

        // Shatter into ice shards (with slight delay for drama)
        const shardCount = 10;
        for(let i = 0; i < shardCount; i++) {
          const shardGeo = new THREE.ConeGeometry(0.1, 0.3, 4);
          const shardMat = new THREE.MeshBasicMaterial({ 
            color: 0xADD8E6, // Light ice blue
            transparent: true,
            opacity: 0.7
          });
          const shard = new THREE.Mesh(shardGeo, shardMat);
          shard.position.copy(deathPos);
          scene.add(shard);
          
          const angle = (i / shardCount) * Math.PI * 2;
          const vel = new THREE.Vector3(
            Math.cos(angle) * 0.3,
            0.4 + Math.random() * 0.2,
            Math.sin(angle) * 0.3
          );
          
          let life = 60;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              shard.position.add(vel);
              vel.y -= 0.03;
              shard.rotation.x += 0.2;
              shard.rotation.z += 0.15;
              shard.material.opacity = (life / 60) * 0.7;
              if (life <= 0 || shard.position.y < 0) {
                scene.remove(shard);
                shard.geometry.dispose();
                shard.material.dispose();
                return false;
              }
              return true;
            }});
          } else {
            scene.remove(shard);
            shard.geometry.dispose();
            shard.material.dispose();
          }
        }

        // Water pool left on ground after ice melts
        setTimeout(() => {
          if (!scene) return;
          const waterGeo = new THREE.CircleGeometry(0.6 + Math.random() * 0.3, 12);
          const waterMat = new THREE.MeshStandardMaterial({ color: 0x88CCFF, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.3, depthWrite: false });
          const water = new THREE.Mesh(waterGeo, waterMat);
          water.rotation.x = -Math.PI / 2;
          water.position.set(deathPos.x, 0.05, deathPos.z);
          scene.add(water);
          let wLife = 180;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              wLife--;
              water.material.opacity = (wLife / 180) * 0.55;
              if (wLife <= 0) { scene.remove(water); water.geometry.dispose(); water.material.dispose(); return false; }
              return true;
            }, cleanup() { scene.remove(water); water.geometry.dispose(); water.material.dispose(); }});
          } else {
            scene.remove(water); water.geometry.dispose(); water.material.dispose();
          }
        }, 300);
      }
      
      dieByLightning(enemyColor) {
        // Lightning death: Blackened and smoking
        spawnParticles(this.mesh.position, 0xFFFF00, 15); // Yellow lightning
        spawnParticles(this.mesh.position, 0xFFFFFF, 10); // White flash
        spawnParticles(this.mesh.position, 0x444444, 8); // Gray smoke
        
        // Blackened corpse - 3D flattened body shape
        const corpseGeo = new THREE.SphereGeometry(0.5, 8, 6);
        const corpseMat = new THREE.MeshBasicMaterial({ 
          color: 0x1a1a1a, // Very dark gray
          transparent: true,
          opacity: 0.9
        });
        const corpse = new THREE.Mesh(corpseGeo, corpseMat);
        corpse.position.copy(this.mesh.position);
        corpse.position.y = 0.11;
        corpse.scale.y = 0.2; // Flat blackened body
        scene.add(corpse);
        
        // Smoke particles rising - use managedAnimations instead of setInterval to prevent timer accumulation
        const deathPos = this.mesh.position.clone();
        let smokeSpawnCount = 8;
        let smokeSpawnTimer = 0;
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            smokeSpawnTimer++;
            if (smokeSpawnTimer % 6 === 0) { // ~100ms at 60fps
              smokeSpawnCount--;
              if (smokeSpawnCount <= 0 || !scene) return false;
              if (smokeParticles.length < MAX_SMOKE_PARTICLES) {
                const smokeGeo = new THREE.SphereGeometry(0.1, 6, 6);
                const smokeMat = new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.4 });
                const smoke = new THREE.Mesh(smokeGeo, smokeMat);
                smoke.position.copy(deathPos);
                smoke.position.y = 0.1;
                scene.add(smoke);
                smokeParticles.push({ mesh: smoke, material: smokeMat, geometry: smokeGeo,
                  velocity: { x: (Math.random()-0.5)*0.02, y: 0.03, z: (Math.random()-0.5)*0.02 },
                  life: 40, maxLife: 40 });
              }
            }
            return smokeSpawnCount > 0;
          }});
        }
        
        // Fade corpse
        let corpseLife = 120;
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
        managedAnimations.push({ update(_dt) {
          corpseLife--;
          corpse.material.opacity = (corpseLife / 120) * 0.9;
          if (corpseLife <= 0) {
            scene.remove(corpse);
            corpse.geometry.dispose();
            corpse.material.dispose();
            return false;
          }
          return true;
        }});
        } else {
          scene.remove(corpse);
          corpse.geometry.dispose(); corpse.material.dispose();
        }
      }
      
      dieByShotgun(enemyColor) {
        // DISMEMBERMENT: Body splits into upper/lower halves with gore physics
        const deathPos = this.mesh.position.clone();
        spawnParticles(deathPos, 0x8B0000, 30); // Lots of blood
        spawnParticles(deathPos, 0xCC0000, 20); // Bright splatter
        spawnParticles(deathPos, 0xFF2200, 10); // Vivid gore
        // Advanced blood burst + viscera for heavy shotgun damage
        if (window.BloodSystem) {
          window.BloodSystem.emitBurst(deathPos, 800, { spreadXZ: 2.2, spreadY: 0.4 });
          window.BloodSystem.emitGuts(deathPos);
          // Meteor explosion effect for massive blast
          if (window.BloodSystem.emitMeteorExplosion) {
            window.BloodSystem.emitMeteorExplosion(deathPos, 200, { radius: 3.0 });
          }
          // Heartbeat blood pumping from severed body
          if (window.BloodSystem.emitHeartbeatWound) {
            window.BloodSystem.emitHeartbeatWound(deathPos, { pulses: 4, perPulse: 150, interval: 300 });
          }
          // Growing blood pool beneath
          if (window.BloodSystem.emitPoolGrow) {
            window.BloodSystem.emitPoolGrow(deathPos, { maxRadius: 2.0, growSpeed: 0.03 });
          }
        }

        // Scatter blood decals in a wide radius
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * Math.PI * 2;
          const dist = 0.3 + Math.random() * 1.5;
          spawnBloodDecal({ x: deathPos.x + Math.cos(angle) * dist, y: 0, z: deathPos.z + Math.sin(angle) * dist });
        }

        // ── Upper body ─────────────────────────────────────────────────────────
        const upperGeo = new THREE.SphereGeometry(0.35, 8, 8);
        const upperMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 1 });
        const upper = new THREE.Mesh(upperGeo, upperMat);
        upper.position.copy(deathPos);
        upper.position.y += 0.4;
        scene.add(upper);
        // Intestine strands hanging from upper half (dark pink cylinder)
        for (let g = 0; g < 3; g++) {
          const gutGeo = new THREE.CylinderGeometry(0.025, 0.015, 0.3 + Math.random() * 0.2, 4);
          const gutMat = new THREE.MeshBasicMaterial({ color: [0xFF69B4, 0xCC2244, 0x8B1A1A][g % 3] });
          const gut = new THREE.Mesh(gutGeo, gutMat);
          gut.position.set((Math.random() - 0.5) * 0.2, -0.25, (Math.random() - 0.5) * 0.2);
          gut.rotation.z = (Math.random() - 0.5) * 0.5;
          upper.add(gut);
        }

        // ── Lower body ─────────────────────────────────────────────────────────
        const lowerGeo = new THREE.CylinderGeometry(0.3, 0.25, 0.35, 7);
        const lowerMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 1 });
        const lower = new THREE.Mesh(lowerGeo, lowerMat);
        lower.position.copy(deathPos);
        lower.position.y += 0.15;
        scene.add(lower);
        // Intestines from lower half too
        for (let g = 0; g < 2; g++) {
          const gutGeo = new THREE.CylinderGeometry(0.025, 0.015, 0.25 + Math.random() * 0.15, 4);
          const gutMat = new THREE.MeshBasicMaterial({ color: [0xFF69B4, 0x8B1A1A][g % 2] });
          const gut = new THREE.Mesh(gutGeo, gutMat);
          gut.position.set((Math.random() - 0.5) * 0.15, 0.22, (Math.random() - 0.5) * 0.15);
          lower.add(gut);
        }

        // ── Physics ────────────────────────────────────────────────────────────
        // Body flies backward and glides on ground leaving blood smear trail
        const slideAngle = Math.random() * Math.PI * 2;
        const slideSpd = 0.12 + Math.random() * 0.08; // Faster slide from shotgun power
        let upperVelY = 0.06;
        let lowerSlideX = Math.cos(slideAngle) * slideSpd;
        let lowerSlideZ = Math.sin(slideAngle) * slideSpd;
        let splitLife = 160;
        let dragTimer = 0;

        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            splitLife--;
            dragTimer++;

            // Lower half slides/glides backward, leaving blood trail
            lower.position.x += lowerSlideX;
            lower.position.z += lowerSlideZ;
            lowerSlideX *= 0.95; // Friction
            lowerSlideZ *= 0.95;

            // Blood drag trail every 2 frames — heavy blood smear on ground where body glides
            if (dragTimer % 2 === 0 && window.BloodSystem) {
              window.BloodSystem.emitDragTrail(lower.position, { x: lowerSlideX, y: 0, z: lowerSlideZ }, 12);
            }
            // Ground blood stain smears along glide path
            if (dragTimer % 3 === 0) {
              spawnBloodDecal(lower.position);
            }

            // Upper half: drop organs after brief pause, then collapse
            if (splitLife < 100) {
              upperVelY -= 0.012;
              upper.position.y += upperVelY;
              upper.rotation.x += 0.04;
              upper.rotation.z += 0.03;
              if (upper.position.y < 0.1) upper.position.y = 0.1;
            }

            if (splitLife < 30) {
              upper.material.opacity = splitLife / 30;
              lower.material.opacity = splitLife / 30;
            }

            if (splitLife <= 0) {
              scene.remove(upper); scene.remove(lower);
              upper.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
              lower.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
              return false;
            }
            return true;
          }, cleanup() {
            scene.remove(upper); scene.remove(lower);
            upper.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
            lower.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
          }});
        } else {
          scene.remove(upper); scene.remove(lower);
          upper.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
          lower.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        }

        // Large blood pool at split point
        const bloodGeo = new THREE.CircleGeometry(1.2, 16);
        const bloodMat = new THREE.MeshBasicMaterial({ 
          color: 0x8B0000, 
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide
        });
        const bloodPool = new THREE.Mesh(bloodGeo, bloodMat);
        bloodPool.position.copy(deathPos);
        bloodPool.position.y = 0.05;
        bloodPool.rotation.x = -Math.PI / 2;
        scene.add(bloodPool);
        
        // Fade blood pool
        let life = 150;
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
        managedAnimations.push({ update(_dt) {
          life--;
          bloodPool.material.opacity = (life / 150) * 0.7;
          if (life <= 0) {
            scene.remove(bloodPool);
            bloodPool.geometry.dispose();
            bloodPool.material.dispose();
            return false;
          }
          return true;
        }, cleanup() { scene.remove(bloodPool); bloodPool.geometry.dispose(); bloodPool.material.dispose(); }});
        } else {
          scene.remove(bloodPool);
          bloodPool.geometry.dispose(); bloodPool.material.dispose();
        }
      }
      
      dieBySpinDeath(enemyColor) {
        // Yellow enemy: 180-degree spin with continuous neck blood arc trail
        const deathPos = this.mesh.position.clone();
        spawnParticles(deathPos, 0x8B0000, 20);
        spawnParticles(deathPos, 0xCC0000, 10);

        // Create spinning body proxy
        const bodyGeo = new THREE.SphereGeometry(0.4, 8, 8);
        const bodyMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 1 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.copy(deathPos);
        scene.add(body);

        let spinAngle = 0;
        let spinLife = 90; // ~1.5 seconds at 60fps
        const spinSpeed = (Math.PI) / 30; // 180° in ~30 frames, then continues

        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            spinLife--;
            spinAngle += spinSpeed;
            body.rotation.y = spinAngle;

            // Blood spray from neck following the spin
            if (window.BloodSystem && spinLife > 15) {
              window.BloodSystem.emitSpinTrail(body.position, spinAngle, 4);
            }

            // Scatter blood decal spots on ground as it spins
            if (spinLife % 5 === 0) {
              const splatAngle = spinAngle;
              const dist = 0.5 + Math.random() * 1.5;
              spawnBloodDecal({ x: deathPos.x + Math.cos(splatAngle) * dist, y: 0, z: deathPos.z + Math.sin(splatAngle) * dist });
            }

            if (spinLife < 25) {
              body.material.opacity = spinLife / 25;
            }
            if (spinLife <= 0) {
              scene.remove(body);
              body.geometry.dispose(); body.material.dispose();
              return false;
            }
            return true;
          }, cleanup() {
            scene.remove(body);
            body.geometry.dispose(); body.material.dispose();
          }});
        } else {
          scene.remove(body);
          body.geometry.dispose(); body.material.dispose();
        }
      }
      
      dieByHeadshot(enemyColor) {
        // FRESH IMPLEMENTATION: Enhanced headshot with actual head detachment
        // Headshot: Blood spray (reduced enemy color particles, more blood)
        spawnParticles(this.mesh.position, 0xDC143C, 20); // Crimson blood
        spawnParticles(this.mesh.position, 0x8B0000, 15); // Dark red blood
        spawnParticles(this.mesh.position, 0xCC0000, 10); // Bright blood spray
        // Advanced headshot: pulsating blood from neck/head in 180-degree spread
        if (window.BloodSystem) {
          const neckPos = this.mesh.position.clone();
          neckPos.y += 0.6;
          window.BloodSystem.emitPulse(neckPos, { pulses: 4, perPulse: 400, interval: 200, spreadXZ: 1.8, color1: 0x8B0000, color2: 0xDC143C });
          // Neck stump blood fountain
          if (window.BloodSystem.emitThroatSpray) {
            const neckDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            window.BloodSystem.emitThroatSpray(neckPos, neckDir, { pulses: 5, perPulse: 200, arcHeight: 1.0 });
          }
          // Head bleed fountain
          if (window.BloodSystem.emitHeadBleed) {
            window.BloodSystem.emitHeadBleed(neckPos, { intensity: 1.2, duration: 6 });
          }
        }
        
        // Create detached head that flies off with enhanced rotation
        const headGeo = new THREE.SphereGeometry(0.3, 12, 12);
        const headMat = new THREE.MeshBasicMaterial({ 
          color: enemyColor, 
          transparent: true,
          opacity: 1
        });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.copy(this.mesh.position);
        head.position.y += 0.5; // Start from head height
        scene.add(head);
        
        // Head velocity (flies backward and up with spin)
        const headVel = new THREE.Vector3(
          (Math.random() - 0.5) * 0.6,
          0.8 + Math.random() * 0.4, // Upward
          (Math.random() - 0.5) * 0.6
        );
        
        // Enhanced rotation speeds for dramatic spinning
        const rotSpeed = {
          x: 0.15 + Math.random() * 0.1,
          y: 0.2 + Math.random() * 0.15,
          z: 0.1 + Math.random() * 0.1
        };
        
        // Blood spray trail from neck
        let headLife = 80;
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
        managedAnimations.push({ update(_dt) {
          headLife--;
          head.position.add(headVel);
          headVel.y -= 0.025;
          head.rotation.x += rotSpeed.x;
          head.rotation.y += rotSpeed.y;
          head.rotation.z += rotSpeed.z;
          if (headLife % 2 === 0 && headLife > 20) {
            spawnParticles(head.position, 0xDC143C, 3);
          }
          if (headLife < 20) {
            head.material.opacity = headLife / 20;
          }
          if (headLife <= 0 || head.position.y < 0) {
            scene.remove(head);
            head.geometry.dispose();
            head.material.dispose();
            return false;
          }
          return true;
        }});
        } else {
          scene.remove(head);
          head.geometry.dispose(); head.material.dispose();
        }
        
        // Body falls (corpse without head) - 3D flattened body matching enemy color
        const corpseGeo = new THREE.SphereGeometry(0.5, 8, 6);
        const corpseMat = new THREE.MeshBasicMaterial({ 
          color: enemyColor, 
          transparent: true,
          opacity: 0.85
        });
        const corpse = new THREE.Mesh(corpseGeo, corpseMat);
        corpse.position.copy(this.mesh.position);
        corpse.position.y = 0.11;
        corpse.scale.y = 0.22; // Flat headless body
        scene.add(corpse);
        
        // Large blood splatter pool (crimson, not white!)
        const bloodGeo = new THREE.CircleGeometry(1.2, 16); // Larger pool
        const bloodMat = new THREE.MeshBasicMaterial({ 
          color: 0xDC143C, // Crimson blood
          transparent: true,
          opacity: 0.7, // More visible
          side: THREE.DoubleSide
        });
        const bloodPool = new THREE.Mesh(bloodGeo, bloodMat);
        bloodPool.position.copy(this.mesh.position);
        bloodPool.position.y = 0.05;
        bloodPool.rotation.x = -Math.PI / 2;
        scene.add(bloodPool);
        
        // Extra blood particles instead of large gore pieces (better performance)
        spawnParticles(this.mesh.position, 0xDC143C, 12); // Crimson blood burst
        spawnParticles(this.mesh.position, 0x8B0000, 8);  // Dark blood
        for (let i = 0; i < 5; i++) {
          const angle = (i / 5) * Math.PI * 2;
          spawnBloodDecal({ x: this.mesh.position.x + Math.cos(angle) * (0.5 + Math.random() * 0.8), y: 0, z: this.mesh.position.z + Math.sin(angle) * (0.5 + Math.random() * 0.8) });
        }
        
        // Fade corpse
        let life = 120;
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
        managedAnimations.push({ update(_dt) {
          life--;
          corpse.material.opacity = (life / 120) * 0.8;
          bloodPool.material.opacity = (life / 120) * 0.6;
          if (life <= 0) {
            scene.remove(corpse);
            scene.remove(bloodPool);
            corpse.geometry.dispose();
            corpse.material.dispose();
            bloodPool.geometry.dispose();
            bloodPool.material.dispose();
            return false;
          }
          return true;
        }});
        } else {
          scene.remove(corpse); scene.remove(bloodPool);
          corpse.geometry.dispose(); corpse.material.dispose();
          bloodPool.geometry.dispose(); bloodPool.material.dispose();
        }
      }

      dieByDrone(enemyColor) {
        const variation = Math.floor(Math.random() * 3);
        const deathPos = this.mesh.position.clone();

        if (variation === 0) {
          // RIDDLED WITH HOLES — blood mist spray (original)
          spawnParticles(deathPos, 0xAA0000, 12);
          spawnParticles(deathPos, 0xCC2200, 8);
          if (window.BloodSystem) {
            const mistDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            window.BloodSystem.emitDroneMist(deathPos, mistDir, 120, { lineLength: 0.6 });
            window.BloodSystem.emitBurst(deathPos, 80, { spreadXZ: 0.6, spreadY: 0.15, minSize: 0.01, maxSize: 0.04, minLife: 20, maxLife: 45 });
          }
          const holeCount = 15 + Math.floor(Math.random() * 6);
          for (let h = 0; h < holeCount; h++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 0.9;
            spawnBloodDecal({ x: deathPos.x + Math.cos(angle) * dist, y: 0, z: deathPos.z + Math.sin(angle) * dist });
          }
          const corpseGeo = new THREE.SphereGeometry(0.4, 8, 6);
          const corpseMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.8 });
          const corpse = new THREE.Mesh(corpseGeo, corpseMat);
          corpse.position.copy(deathPos);
          corpse.position.y = 0.1;
          corpse.scale.y = 0.2;
          scene.add(corpse);
          let life = 120;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              corpse.material.opacity = (life / 120) * 0.8;
              if (life <= 0) { scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose(); return false; }
              return true;
            }, cleanup() { scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose(); }});
          } else {
            scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose();
          }
        } else if (variation === 1) {
          // SWISS CHEESE — more holes, blood streams, body puffs up then deflates
          spawnParticles(deathPos, 0xAA0000, 16);
          spawnParticles(deathPos, 0xCC2200, 10);
          if (window.BloodSystem) {
            window.BloodSystem.emitBurst(deathPos, 100, { spreadXZ: 0.8, spreadY: 0.3, minSize: 0.01, maxSize: 0.05, minLife: 25, maxLife: 55 });
          }
          const holeCount = 22 + Math.floor(Math.random() * 8);
          const holePositions = [];
          for (let h = 0; h < holeCount; h++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 1.0;
            const hx = deathPos.x + Math.cos(angle) * dist;
            const hz = deathPos.z + Math.sin(angle) * dist;
            holePositions.push({ x: hx, z: hz });
            spawnBloodDecal({ x: hx, y: 0, z: hz });
          }
          const corpseGeo = new THREE.SphereGeometry(0.4, 8, 6);
          const corpseMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const corpse = new THREE.Mesh(corpseGeo, corpseMat);
          corpse.position.copy(deathPos);
          corpse.position.y = 0.15;
          corpse.scale.y = 0.25;
          scene.add(corpse);
          let life = 100;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              if (life > 70) {
                const puff = 1 + (100 - life) * 0.01;
                corpse.scale.set(puff, 0.25 * puff, puff);
              } else if (life > 40) {
                const deflate = (life - 40) / 30;
                corpse.scale.set(1.3 * deflate + 0.7, 0.25 * deflate + 0.1, 1.3 * deflate + 0.7);
              }
              if (life % 6 === 0 && life > 30 && holePositions.length > 0) {
                const hp = holePositions[life % holePositions.length];
                spawnParticles({ x: hp.x, y: 0.15, z: hp.z }, 0x8B0000, 2);
              }
              corpse.material.opacity = Math.min(0.85, (life / 100) * 0.85);
              if (life <= 0) { scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose(); return false; }
              return true;
            }, cleanup() { scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose(); }});
          } else {
            scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose();
          }
        } else {
          // OVERWHELMED COLLAPSE — tiny blood geysers, body tips sideways
          spawnParticles(deathPos, 0xAA0000, 14);
          spawnParticles(deathPos, 0x880000, 8);
          if (window.BloodSystem) {
            window.BloodSystem.emitBurst(deathPos, 60, { spreadXZ: 0.5, spreadY: 0.4, minSize: 0.01, maxSize: 0.04, minLife: 20, maxLife: 50 });
          }
          const woundPoints = [];
          for (let w = 0; w < 6; w++) {
            woundPoints.push({
              x: deathPos.x + (Math.random() - 0.5) * 0.6,
              z: deathPos.z + (Math.random() - 0.5) * 0.6
            });
            spawnBloodDecal({ x: woundPoints[w].x, y: 0, z: woundPoints[w].z });
          }
          const corpseGeo = new THREE.SphereGeometry(0.4, 8, 6);
          const corpseMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.8 });
          const corpse = new THREE.Mesh(corpseGeo, corpseMat);
          corpse.position.copy(deathPos);
          corpse.position.y = 0.2;
          corpse.scale.y = 0.25;
          scene.add(corpse);
          const tipDir = Math.random() < 0.5 ? 1 : -1;
          let life = 110;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              if (life > 60) {
                corpse.rotation.z += tipDir * 0.02;
                corpse.position.y = Math.max(0.08, corpse.position.y - 0.002);
              }
              if (life % 8 === 0 && life > 30) {
                const wp = woundPoints[life % woundPoints.length];
                spawnParticles({ x: wp.x, y: 0.1, z: wp.z }, 0xAA0000, 3);
              }
              if (life < 40) {
                corpse.material.opacity = (life / 40) * 0.8;
              }
              if (life <= 0) { scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose(); return false; }
              return true;
            }, cleanup() { scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose(); }});
          } else {
            scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose();
          }
        }
      }

      dieBySword(enemyColor) {
        const variation = Math.floor(Math.random() * 3);
        const deathPos = this.mesh.position.clone();

        if (variation === 0) {
          // DEEP SLASH — blood flow along the cut line (original)
          spawnParticles(deathPos, 0x8B0000, 18);
          spawnParticles(deathPos, 0xCC0000, 10);
          if (window.BloodSystem) {
            const slashAngle = Math.random() * Math.PI * 2;
            const slashDir = new THREE.Vector3(Math.cos(slashAngle), 0, Math.sin(slashAngle)).normalize();
            window.BloodSystem.emitSwordSlash(deathPos, slashDir, 120);
            window.BloodSystem.emitBurst(deathPos, 60, { spreadXZ: 0.8, spreadY: 0.2, minSize: 0.03, maxSize: 0.09, minLife: 30, maxLife: 70 });
            window.BloodSystem.emitPulse(deathPos, { pulses: 3, perPulse: 80, interval: 200, spreadXZ: 0.5, arcDir: slashDir });
          }
          for (let i = 0; i < 4; i++) {
            const a = Math.random() * Math.PI * 2;
            spawnBloodDecal({ x: deathPos.x + Math.cos(a) * (0.3 + Math.random() * 0.7), y: 0, z: deathPos.z + Math.sin(a) * (0.3 + Math.random() * 0.7) });
          }
          const corpseGeo = new THREE.SphereGeometry(0.45, 8, 6);
          const corpseMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const corpse = new THREE.Mesh(corpseGeo, corpseMat);
          corpse.position.copy(deathPos);
          corpse.position.y = 0.1;
          corpse.scale.y = 0.22;
          scene.add(corpse);
          let life = 130;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              corpse.material.opacity = (life / 130) * 0.85;
              if (life <= 0) { scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose(); return false; }
              return true;
            }, cleanup() { scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose(); }});
          } else {
            scene.remove(corpse); corpse.geometry.dispose(); corpse.material.dispose();
          }
        } else if (variation === 1) {
          // CLEAN CUT — body splits along slash line, halves slide apart
          spawnParticles(deathPos, 0x8B0000, 20);
          spawnParticles(deathPos, 0xCC0000, 12);
          const slashAngle = Math.random() * Math.PI * 2;
          const slashDir = new THREE.Vector3(Math.cos(slashAngle), 0, Math.sin(slashAngle)).normalize();
          if (window.BloodSystem) {
            window.BloodSystem.emitSwordSlash(deathPos, slashDir, 150);
            window.BloodSystem.emitBurst(deathPos, 80, { spreadXZ: 1.0, spreadY: 0.3, minSize: 0.03, maxSize: 0.1, minLife: 30, maxLife: 80 });
          }
          const halfGeo = new THREE.SphereGeometry(0.3, 6, 4);
          const halfMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const half1 = new THREE.Mesh(halfGeo, halfMat);
          const half2 = new THREE.Mesh(halfGeo, halfMat);
          half1.position.copy(deathPos); half1.position.y = 0.12;
          half2.position.copy(deathPos); half2.position.y = 0.12;
          half1.scale.y = 0.25; half2.scale.y = 0.25;
          scene.add(half1); scene.add(half2);
          const perpX = -slashDir.z;
          const perpZ = slashDir.x;
          for (let i = 0; i < 5; i++) spawnBloodDecal({ x: deathPos.x + (Math.random()-0.5)*1.0, y: 0, z: deathPos.z + (Math.random()-0.5)*1.0 });
          let life = 120;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              if (life > 80) {
                half1.position.x += perpX * 0.01;
                half1.position.z += perpZ * 0.01;
                half2.position.x -= perpX * 0.01;
                half2.position.z -= perpZ * 0.01;
                if (life % 4 === 0) spawnParticles(deathPos, 0x8B0000, 2);
              }
              if (life < 40) {
                half1.material.opacity = (life / 40) * 0.85;
                half2.material.opacity = (life / 40) * 0.85;
              }
              if (life <= 0) {
                scene.remove(half1); scene.remove(half2);
                halfGeo.dispose(); halfMat.dispose();
                return false;
              }
              return true;
            }, cleanup() {
              scene.remove(half1); scene.remove(half2);
              halfGeo.dispose(); halfMat.dispose();
            }});
          } else {
            scene.remove(half1); scene.remove(half2);
            halfGeo.dispose(); halfMat.dispose();
          }
        } else {
          // MULTIPLE CUTS — 3 slash lines, blood pours from each, body collapses in segments
          spawnParticles(deathPos, 0x8B0000, 22);
          spawnParticles(deathPos, 0xCC0000, 14);
          const slashDirs = [];
          for (let s = 0; s < 3; s++) {
            const a = Math.random() * Math.PI * 2;
            slashDirs.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).normalize());
            if (window.BloodSystem) {
              window.BloodSystem.emitSwordSlash(
                { x: deathPos.x + (Math.random()-0.5)*0.3, y: deathPos.y, z: deathPos.z + (Math.random()-0.5)*0.3 },
                slashDirs[s], 100
              );
            }
          }
          if (window.BloodSystem) {
            window.BloodSystem.emitBurst(deathPos, 90, { spreadXZ: 0.9, spreadY: 0.25, minSize: 0.03, maxSize: 0.09, minLife: 25, maxLife: 65 });
          }
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            spawnBloodDecal({ x: deathPos.x + Math.cos(a) * (0.3 + Math.random() * 0.8), y: 0, z: deathPos.z + Math.sin(a) * (0.3 + Math.random() * 0.8) });
          }
          const segGeo = new THREE.SphereGeometry(0.25, 6, 4);
          const segMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const segments = [];
          for (let s = 0; s < 3; s++) {
            const seg = new THREE.Mesh(segGeo, segMat);
            seg.position.set(deathPos.x + (s - 1) * 0.2, 0.12, deathPos.z + (Math.random()-0.5)*0.2);
            seg.scale.y = 0.22;
            scene.add(seg);
            segments.push(seg);
          }
          let life = 130;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              for (let s = 0; s < segments.length; s++) {
                if (life > 90 - s * 15) {
                  segments[s].position.y = Math.max(0.05, segments[s].position.y - 0.002);
                }
                if (life % 7 === 0 && life > 30) spawnParticles(segments[s].position, 0x8B0000, 2);
              }
              if (life < 40) {
                segMat.opacity = (life / 40) * 0.85;
              }
              if (life <= 0) {
                for (const seg of segments) { scene.remove(seg); }
                segGeo.dispose(); segMat.dispose();
                return false;
              }
              return true;
            }, cleanup() {
              for (const seg of segments) { scene.remove(seg); }
              segGeo.dispose(); segMat.dispose();
            }});
          } else {
            for (const seg of segments) { scene.remove(seg); }
            segGeo.dispose(); segMat.dispose();
          }
        }
      }

      dieByAura(enemyColor) {
        const variation = Math.floor(Math.random() * 3);
        const deathPos = this.mesh.position.clone();

        if (variation === 0) {
          // ENERGY DISSIPATION — yellow-white spiritual overwhelm (original)
          spawnParticles(deathPos, 0xFFEE88, 12);
          spawnParticles(deathPos, 0xFFFFCC, 8);
          spawnParticles(deathPos, 0x8B0000, 6);
          if (window.BloodSystem) {
            window.BloodSystem.emitAuraBurn(deathPos, 60);
            window.BloodSystem.emitBurst(deathPos, 30, { spreadXZ: 0.3, spreadY: 0.1, minSize: 0.015, maxSize: 0.05, minLife: 15, maxLife: 40 });
          }
          const burnGeo = new THREE.CircleGeometry(0.6, 12);
          const burnMat = new THREE.MeshBasicMaterial({ color: 0x332200, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
          const burnMark = new THREE.Mesh(burnGeo, burnMat);
          burnMark.rotation.x = -Math.PI / 2;
          burnMark.position.set(deathPos.x, 0.01, deathPos.z);
          scene.add(burnMark);
          for (let i = 0; i < 3; i++) spawnBloodDecal({ x: deathPos.x + (Math.random()-0.5)*0.5, y: 0, z: deathPos.z + (Math.random()-0.5)*0.5 });
          const corpseGeo = new THREE.SphereGeometry(0.45, 8, 6);
          const corpseMat = new THREE.MeshBasicMaterial({ color: 0x2a1a00, transparent: true, opacity: 0.7 });
          const corpse = new THREE.Mesh(corpseGeo, corpseMat);
          corpse.position.copy(deathPos); corpse.position.y = 0.1; corpse.scale.y = 0.2;
          scene.add(corpse);
          let life = 120;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              corpse.material.opacity = (life / 120) * 0.85;
              burnMat.opacity = (life / 120) * 0.55;
              if (life <= 0) {
                scene.remove(corpse); scene.remove(burnMark);
                corpse.geometry.dispose(); corpse.material.dispose();
                burnGeo.dispose(); burnMat.dispose();
                return false;
              }
              return true;
            }, cleanup() {
              scene.remove(corpse); scene.remove(burnMark);
              corpse.geometry.dispose(); corpse.material.dispose();
              burnGeo.dispose(); burnMat.dispose();
            }});
          } else {
            scene.remove(corpse); scene.remove(burnMark);
            corpse.geometry.dispose(); corpse.material.dispose();
            burnGeo.dispose(); burnMat.dispose();
          }
        } else if (variation === 1) {
          // DISINTEGRATE FROM BELOW — body erodes from feet upward with rising particles
          spawnParticles(deathPos, 0xFFEE88, 14);
          spawnParticles(deathPos, 0xFFFFCC, 10);
          if (window.BloodSystem) {
            window.BloodSystem.emitAuraBurn(deathPos, 80);
          }
          const stumpGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.8, 8);
          const stumpMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const stump = new THREE.Mesh(stumpGeo, stumpMat);
          stump.position.copy(deathPos);
          stump.position.y = 0.4;
          scene.add(stump);
          const burnGeo = new THREE.CircleGeometry(0.5, 10);
          const burnMat = new THREE.MeshBasicMaterial({ color: 0x332200, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
          const burnMark = new THREE.Mesh(burnGeo, burnMat);
          burnMark.rotation.x = -Math.PI / 2;
          burnMark.position.set(deathPos.x, 0.01, deathPos.z);
          scene.add(burnMark);
          let life = 100;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              const erode = life / 100;
              stump.scale.y = Math.max(0.05, erode);
              stump.position.y = 0.4 * erode;
              stump.material.opacity = erode * 0.85;
              if (life % 4 === 0 && life > 10) {
                spawnParticles({ x: deathPos.x + (Math.random()-0.5)*0.3, y: stump.position.y, z: deathPos.z + (Math.random()-0.5)*0.3 }, 0xFFEE88, 3);
              }
              burnMat.opacity = (life / 100) * 0.4;
              if (life <= 0) {
                scene.remove(stump); scene.remove(burnMark);
                stumpGeo.dispose(); stumpMat.dispose();
                burnGeo.dispose(); burnMat.dispose();
                return false;
              }
              return true;
            }, cleanup() {
              scene.remove(stump); scene.remove(burnMark);
              stumpGeo.dispose(); stumpMat.dispose();
              burnGeo.dispose(); burnMat.dispose();
            }});
          } else {
            scene.remove(stump); scene.remove(burnMark);
            stumpGeo.dispose(); stumpMat.dispose();
            burnGeo.dispose(); burnMat.dispose();
          }
        } else {
          // PULSE OVERLOAD — body pulses 3 times with energy wisps then bursts
          spawnParticles(deathPos, 0xFFEE88, 10);
          spawnParticles(deathPos, 0xFFFFCC, 6);
          if (window.BloodSystem) {
            window.BloodSystem.emitAuraBurn(deathPos, 50);
          }
          const pulseGeo = new THREE.SphereGeometry(0.4, 8, 6);
          const pulseMat = new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true, opacity: 0.85 });
          const pulseBody = new THREE.Mesh(pulseGeo, pulseMat);
          pulseBody.position.copy(deathPos);
          pulseBody.position.y = 0.2;
          scene.add(pulseBody);
          for (let i = 0; i < 3; i++) spawnBloodDecal({ x: deathPos.x + (Math.random()-0.5)*0.5, y: 0, z: deathPos.z + (Math.random()-0.5)*0.5 });
          let life = 90;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              if (life > 30) {
                const pulsePhase = Math.sin((90 - life) * 0.15) * 0.3;
                pulseBody.scale.setScalar(1 + pulsePhase);
                if (life % 10 === 0) {
                  spawnParticles(pulseBody.position, 0xFFEE88, 4);
                  spawnParticles(pulseBody.position, 0xFFFFCC, 2);
                }
              } else if (life === 30) {
                spawnParticles(deathPos, 0xFFEE88, 20);
                spawnParticles(deathPos, 0xFFFFCC, 15);
                spawnParticles(deathPos, 0x8B0000, 8);
                if (window.BloodSystem) {
                  window.BloodSystem.emitBurst(deathPos, 60, { spreadXZ: 1.0, spreadY: 0.5, minSize: 0.02, maxSize: 0.08, minLife: 20, maxLife: 50 });
                }
                pulseBody.scale.setScalar(0.5);
              }
              if (life < 30) {
                pulseBody.material.opacity = (life / 30) * 0.85;
                pulseBody.scale.multiplyScalar(0.97);
              }
              if (life <= 0) {
                scene.remove(pulseBody); pulseBody.geometry.dispose(); pulseBody.material.dispose();
                return false;
              }
              return true;
            }, cleanup() {
              scene.remove(pulseBody); pulseBody.geometry.dispose(); pulseBody.material.dispose();
            }});
          } else {
            scene.remove(pulseBody); pulseBody.geometry.dispose(); pulseBody.material.dispose();
          }
        }
      }
      
      dieByPoison(enemyColor) {
        // POISON DEATH: Toxic melt — green bubbling dissolution with blood
        const deathPos = this.mesh.position.clone();
        spawnParticles(deathPos, 0x00FF00, 14); // Bright green toxic
        spawnParticles(deathPos, 0x44FF44, 8);  // Light green bubbles
        spawnParticles(deathPos, 0x006600, 6);  // Dark green ooze
        spawnParticles(deathPos, 0x8B0000, 8);  // Blood mixed in
        if (window.BloodSystem) {
          window.BloodSystem.emitBurst(deathPos, 40, { spreadXZ: 0.6, spreadY: 0.3, minSize: 0.02, maxSize: 0.08, minLife: 30, maxLife: 70 });
        }
        // Toxic puddle on ground
        const puddleGeo = new THREE.CircleGeometry(0.7, 12);
        const puddleMat = new THREE.MeshBasicMaterial({ color: 0x116611, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const puddle = new THREE.Mesh(puddleGeo, puddleMat);
        puddle.rotation.x = -Math.PI / 2;
        puddle.position.set(deathPos.x, 0.01, deathPos.z);
        scene.add(puddle);
        for (let i = 0; i < 4; i++) spawnBloodDecal({ x: deathPos.x + (Math.random()-0.5)*0.6, y: 0, z: deathPos.z + (Math.random()-0.5)*0.6 });
        // Melting corpse remnant
        const corpseGeo = new THREE.SphereGeometry(0.4, 8, 6);
        const corpseMat = new THREE.MeshBasicMaterial({ color: 0x225522, transparent: true, opacity: 0.7 });
        const corpse = new THREE.Mesh(corpseGeo, corpseMat);
        corpse.position.copy(deathPos); corpse.position.y = 0.1; corpse.scale.y = 0.2;
        scene.add(corpse);
        let life = 100;
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            life--;
            corpse.material.opacity = (life / 100) * 0.7;
            corpse.scale.x *= 1.005; corpse.scale.z *= 1.005; // melting outward
            puddleMat.opacity = (life / 100) * 0.5;
            if (life % 8 === 0 && life > 40) spawnParticles(deathPos, 0x44FF44, 1);
            if (life <= 0) {
              scene.remove(corpse); scene.remove(puddle);
              corpseGeo.dispose(); corpseMat.dispose();
              puddleGeo.dispose(); puddleMat.dispose();
              return false;
            }
            return true;
          }, cleanup() {
            scene.remove(corpse); scene.remove(puddle);
            corpseGeo.dispose(); corpseMat.dispose();
            puddleGeo.dispose(); puddleMat.dispose();
          }});
        } else {
          scene.remove(corpse); scene.remove(puddle);
          corpseGeo.dispose(); corpseMat.dispose();
          puddleGeo.dispose(); puddleMat.dispose();
        }
      }
    }
    // Lazily initialised on first use so the top-level script evaluation never calls THREE
    // before THREE.js has been loaded (mirrors the bulletHoleGeo/bulletHoleMat pattern).
    let projectileGeometryCache = null;
    let projectileMaterialCache = null;
    let _cachedProjSizeMultiplier = null;
    function ensureProjectileCaches() {
      const sizeMultiplier = window._projSizeMultiplier || 1.0;
      // Rebuild cache when size multiplier changes so new pool slots get correctly-sized geometry
      if (projectileGeometryCache && _cachedProjSizeMultiplier === sizeMultiplier) return;
      _cachedProjSizeMultiplier = sizeMultiplier;
      const baseRadius = 0.03125 * sizeMultiplier; // 50% smaller than original 0.0625
      projectileGeometryCache = {
        bullet:     new THREE.SphereGeometry(baseRadius, 8, 8),
        bulletGlow: new THREE.SphereGeometry(baseRadius * 1.4, 6, 6)
      };
      projectileMaterialCache = {
        bullet: new THREE.MeshBasicMaterial({
          color: 0xFFFF00,      // Bright yellow — original snappy gun bullet colour
          transparent: true,
          opacity: 0.95
        }),
        bulletGlow: new THREE.MeshBasicMaterial({
          color: 0xFFFF88,      // Pale yellow glow
          transparent: true,
          opacity: 0.4
        })
      };
    }

    // Phase 5: Companion System - Simplified implementation for stable gameplay
