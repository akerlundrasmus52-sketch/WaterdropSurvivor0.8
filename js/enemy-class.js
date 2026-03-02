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
        scene.add(this.mesh);

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
        this._lastPlayerPos = null; // For movement prediction
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
        if (this._lastPlayerPos) {
          this._playerVelocity.x = (playerPos.x - this._lastPlayerPos.x) / Math.max(dt, 0.016);
          this._playerVelocity.z = (playerPos.z - this._lastPlayerPos.z) / Math.max(dt, 0.016);
        }
        // Reuse cached object instead of creating new one each frame
        if (!this._lastPlayerPos) this._lastPlayerPos = { x: 0, z: 0 };
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
          this.mesh.lookAt(targetPos);
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
          this.mesh.lookAt(new THREE.Vector3(targetPos.x, this.mesh.position.y, targetPos.z));
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
          this.mesh.lookAt(new THREE.Vector3(targetPos.x, this.mesh.position.y, targetPos.z));
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
              const iceColor = new THREE.Color(0xB0E8FF);
              this.mesh.material.color.copy(this._originalColor).lerp(iceColor, freezeT);
              this.mesh.material.emissiveIntensity = 0.3 + Math.sin(gameTime * 8) * 0.15 * freezeT;
            }
            // Skip all movement below
          } else {
          
          // Base movement towards target
          let vx = (dx / dist) * this.speed;
          let vz = (dz / dist) * this.speed;
          
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
          this.mesh.lookAt(targetPos);

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
        // Track last damage type for death effects
        this.lastDamageType = damageType;
        
        // Phase 5: Hit impact particles (flesh/blood) on every hit - ENHANCED: Scale with HP remaining
        const hpRatio = this.hp / this.maxHp;
        const bloodParticleCount = Math.max(10, Math.floor((1 - hpRatio) * 28) + 8); // More blood as HP drops - increased intensity
        spawnParticles(this.mesh.position, 0x8B0000, Math.min(bloodParticleCount, 30)); // Blood particles scale with HP loss
        spawnParticles(this.mesh.position, 0x660000, Math.min(Math.floor(bloodParticleCount * 0.6), 14)); // Darker blood
        spawnParticles(this.mesh.position, 0xCC0000, Math.min(Math.floor(bloodParticleCount * 0.4), 10)); // Bright splatter
        // Spawn multiple ground blood decals for more brutal effect
        spawnBloodDecal(this.mesh.position);
        spawnBloodDecal(this.mesh.position); // Always at least 2 decals per hit
        spawnBloodDecal(this.mesh.position); // Extra decal for more violence
        if (hpRatio < 0.7) {
          spawnBloodDecal(this.mesh.position); // Start extra blood earlier
        }
        if (hpRatio < 0.5) {
          spawnBloodDecal(this.mesh.position); // Extra decal at half HP
          spawnBloodDecal(this.mesh.position); // Additional splatter
        }
        if (hpRatio < 0.25) {
          spawnBloodDecal(this.mesh.position); // Extra decal at low HP
          spawnBloodDecal(this.mesh.position); // Even more at critical HP
          spawnBloodDecal(this.mesh.position); // Enemy barely alive - covered in blood
        }
        
        // Progressive blood stain: blend enemy mesh color toward dark red as HP drops
        // This works on ALL enemy colors (including yellow/gold) by directly lerping the color
        if (this.mesh && this.mesh.material) {
          if (!this._originalColor) {
            this._originalColor = this.mesh.material.color.clone();
          }
          // Lerp factor: 0 at full HP → 0.85 near death (almost fully blood-covered)
          const bloodLerp = (1 - hpRatio) * 0.85;
          const bloodColor = new THREE.Color(0x8B0000);
          // Only update color if not frozen (freeze manages its own colour)
          if (!this.isFrozen) {
            this.mesh.material.color.copy(this._originalColor).lerp(bloodColor, bloodLerp);
          }
          // Also apply emissive for wet blood sheen
          if (!this.isFrozen && this.mesh.material.emissive !== undefined) {
            const bloodStainIntensity = (1 - hpRatio) * 0.4;
            this.mesh.material.emissive = new THREE.Color(0x6B0000);
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
          
          // Add visible wounds/holes
          for(let i=0; i<3; i++) {
            const holeGeo = new THREE.SphereGeometry(0.1, 6, 6);
            const holeMat = new THREE.MeshBasicMaterial({ color: 0x220000 }); // Dark red
            const hole = new THREE.Mesh(holeGeo, holeMat);
            hole.position.set(
              (Math.random() - 0.5) * 0.5,
              (Math.random() - 0.5) * 0.5,
              (Math.random() - 0.5) * 0.5
            );
            this.mesh.add(hole);
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
          spawnParticles(this.mesh.position, 0x8B0000, 20);
          spawnParticles(this.mesh.position, 0xCC0000, 15);
          spawnParticles(this.mesh.position, 0x660000, 10);
          spawnParticles(this.mesh.position, enemyColor, 6);
          
          // Blood spray decals around
          for (let i = 0; i < 6; i++) {
            spawnBloodDecal(this.mesh.position);
          }
          
          // Airborne blood bursts
          for (let b = 0; b < 5 && bloodDrips.length < MAX_BLOOD_DRIPS; b++) {
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
        
        // Enhanced squishy deformation on hit — only apply/schedule if not already squishing
        if (!this._squishTimer) {
          const squishScale = isCrit ? 0.7 : 0.85;
          this.mesh.scale.set(squishScale, 1.3, squishScale);
          this._squishTimer = setTimeout(() => {
            if (this.mesh) this.mesh.scale.set(1, 1, 1);
            this._squishTimer = null;
          }, 100);
        }

        if (this.hp <= 0) {
          this.die();
        }
      }

      die() {
        this.isDead = true;
        // Register kill for combat intensity tracking (dynamic shadow quality)
        if (typeof window.registerCombatKill === 'function') window.registerCombatKill();
        // Clear freeze state so no further update logic applies to dead enemy
        this.isFrozen = false;
        // Cancel pending squish timeout to prevent callback on dead enemy
        if (this._squishTimer) {
          clearTimeout(this._squishTimer);
          this._squishTimer = null;
        }
        
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
        
        // Blood spray on death - massive brutal blood explosion
        spawnParticles(this.mesh.position, 0x8B0000, 14); // Blood spray
        spawnParticles(this.mesh.position, 0xCC0000, 10); // Bright red splatter
        spawnParticles(this.mesh.position, 0x660000, 8); // Dark blood mist
        spawnParticles(this.mesh.position, 0x440000, 6); // Extra dark blood chunks
        // Advanced blood particle burst on death — heavy spray up in air
        if (window.BloodSystem) {
          window.BloodSystem.emitBurst(deathPos, this.isMiniBoss ? 900 : 500, { spreadXZ: 2.2, spreadY: 0.4, minSize: 0.03, maxSize: 0.16, minLife: 55, maxLife: 120 });
          // Extra micro-fountain mist that rains down as tiny droplets
          window.BloodSystem.emitBurst(deathPos, this.isMiniBoss ? 420 : 240, { spreadXZ: 1.8, spreadY: 0.25, minSize: 0.015, maxSize: 0.06, minLife: 60, maxLife: 110 });
          // Pulsating blood fountain after death — simulates heart still pumping
          window.BloodSystem.emitPulse(deathPos, { pulses: this.isMiniBoss ? 10 : 6, perPulse: this.isMiniBoss ? 750 : 420, interval: 160, spreadXZ: 2.2, minSize: 0.02, maxSize: 0.1, minLife: 55, maxLife: 110 });
        }
        // Airborne blood spray burst — sprays high in air, rains down tiny droplets
        for (let sb = 0; sb < 14 && bloodDrips.length < MAX_BLOOD_DRIPS; sb++) {
          const spraySize = 0.02 + Math.random() * 0.06;
          if (!_sharedBloodDripGeo && typeof THREE !== 'undefined') {
            _sharedBloodDripGeo = new THREE.SphereGeometry(1, 4, 4);
          }
          const spray = new THREE.Mesh(
            _sharedBloodDripGeo,
            new THREE.MeshBasicMaterial({ color: [0xAA0000, 0x8B0000, 0x660000, 0xCC0000][sb % 4] })
          );
          spray.scale.setScalar(spraySize);
          spray.position.copy(deathPos);
          spray.position.y += 0.3;
          scene.add(spray);
          bloodDrips.push({
            mesh: spray,
            velX: (Math.random() - 0.5) * 0.45,
            velZ: (Math.random() - 0.5) * 0.45,
            velY: 0.35 + Math.random() * 0.55,
            life: 55 + Math.floor(Math.random() * 30),
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
          pool.position.set(landX, 0.015, landZ);
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
        for (let i = 0; i < expMultiplier; i++) {
          const spread = i * (Math.PI * 2 / Math.max(expMultiplier, 1));
          const angle = xpPopAngle + spread;
          spawnExp(deathPos.x + Math.cos(angle) * xpPopDist, deathPos.z + Math.sin(angle) * xpPopDist);
        }
        
        // Dynamic death animation styles - brutal varied ragdoll falls
        const deathStyle = Math.floor(Math.random() * 6); // 0-5 different death types
        const fallSignX = (Math.random() < 0.5) ? 1 : -1;
        const fallSignZ = (Math.random() < 0.5) ? 1 : -1;
        const spinDir = (Math.random() < 0.5) ? 1 : -1;
        
        // Fall down animation: enemy falls dynamically, lies on ground, explodes into blood
        const FALL_FRAMES = wasFlying ? 50 : 35;
        const LINGER_FRAMES = 50; // Lie on ground lifeless before blood explosion
        const EXPLODE_FRAMES = 15; // Blood explosion phase
        const FADE_FRAMES = 15; // Fade out remains
        let fallFrame = 0;
        const startY = dyingMesh.position.y;
        const startScaleY = dyingMesh.scale.y;
        
        if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            fallFrame++;
            
            if (fallFrame <= FALL_FRAMES) {
              const progress = Math.min(fallFrame / FALL_FRAMES, 1);
              const eased = 1 - Math.pow(1 - progress, 3); // Ease-out cubic for natural fall
              
              if (deathStyle === 0) {
                // Face-plant: fall forward onto stomach
                dyingMesh.rotation.x = fallSignX * eased * (Math.PI / 2);
                dyingMesh.rotation.z = fallSignZ * eased * 0.15; // slight twist
                dyingMesh.position.y = startY * (1 - eased);
                dyingMesh.scale.y = startScaleY * (1 - eased * 0.6);
              } else if (deathStyle === 1) {
                // Side fall: topple sideways
                dyingMesh.rotation.z = fallSignZ * eased * (Math.PI / 2);
                dyingMesh.rotation.x = fallSignX * eased * 0.2;
                dyingMesh.position.y = startY * (1 - eased);
                dyingMesh.scale.y = startScaleY * (1 - eased * 0.4);
              } else if (deathStyle === 2) {
                // Back fall: fall backward
                dyingMesh.rotation.x = fallSignX * -1 * eased * (Math.PI / 2.2);
                dyingMesh.rotation.z = fallSignZ * eased * 0.1;
                dyingMesh.position.y = startY * (1 - eased);
                dyingMesh.scale.y = startScaleY * (1 - eased * 0.5);
              } else if (deathStyle === 3) {
                // Knees first: two-stage collapse - knees buckle then body falls
                if (progress < 0.4) {
                  const kneePhase = progress / 0.4;
                  dyingMesh.scale.y = startScaleY * (1 - kneePhase * 0.5); // compress down
                  dyingMesh.position.y = startY * (1 - kneePhase * 0.6);
                } else {
                  const bodyPhase = (progress - 0.4) / 0.6;
                  const bodyEased = 1 - Math.pow(1 - bodyPhase, 2);
                  dyingMesh.scale.y = startScaleY * 0.5 * (1 - bodyEased * 0.6);
                  dyingMesh.rotation.x = fallSignX * bodyEased * (Math.PI / 2);
                  dyingMesh.rotation.z = fallSignZ * bodyEased * 0.3;
                  dyingMesh.position.y = startY * 0.4 * (1 - bodyEased);
                }
              } else if (deathStyle === 4) {
                // Spin and collapse: enemy spins as they fall
                dyingMesh.rotation.y = spinDir * eased * Math.PI * 1.5;
                dyingMesh.rotation.x = fallSignX * eased * (Math.PI / 2.5);
                dyingMesh.position.y = startY * (1 - eased);
                dyingMesh.scale.y = startScaleY * (1 - eased * 0.55);
              } else {
                // Dramatic crumple: compress then topple
                if (progress < 0.3) {
                  const crumple = progress / 0.3;
                  dyingMesh.scale.y = startScaleY * (1 - crumple * 0.4);
                  dyingMesh.scale.x = startScaleY * (1 + crumple * 0.2);
                  dyingMesh.position.y = startY * (1 - crumple * 0.3);
                } else {
                  const topple = (progress - 0.3) / 0.7;
                  const toppleEased = 1 - Math.pow(1 - topple, 2);
                  dyingMesh.rotation.x = fallSignX * toppleEased * (Math.PI / 2);
                  dyingMesh.rotation.z = fallSignZ * toppleEased * (Math.PI / 4);
                  dyingMesh.scale.y = startScaleY * 0.6 * (1 - toppleEased * 0.4);
                  dyingMesh.position.y = startY * 0.7 * (1 - toppleEased);
                }
              }
              // Flying enemies: also tumble during fall
              if (wasFlying) {
                dyingMesh.rotation.y += 0.1;
                dyingMesh.position.y = Math.max(0, startY * (1 - eased));
              }
              // Bounce impact when hitting ground near end of fall
              if (progress > 0.85 && progress < 0.95) {
                spawnParticles(deathPos, 0x8B0000, 3);
                spawnBloodDecal(deathPos);
              }
            } else if (fallFrame <= FALL_FRAMES + LINGER_FRAMES) {
              // Phase 2: Lie on ground lifeless - slight settling
              const lingerProgress = (fallFrame - FALL_FRAMES) / LINGER_FRAMES;
              if (lingerProgress < 0.1) {
                // Small bounce/settle on impact
                const bounce = Math.sin(lingerProgress * Math.PI * 10) * 0.02 * (1 - lingerProgress * 10);
                dyingMesh.position.y = bounce;
              }
            } else if (fallFrame <= FALL_FRAMES + LINGER_FRAMES + EXPLODE_FRAMES) {
              // Phase 3: Blood explosion - body bursts into blood piles
              const explodeProgress = (fallFrame - FALL_FRAMES - LINGER_FRAMES) / EXPLODE_FRAMES;
              if (explodeProgress < 0.3) {
                // Burst blood spray
                spawnParticles(deathPos, 0x8B0000, 4);
                spawnParticles(deathPos, 0x660000, 3);
                spawnBloodDecal(deathPos);
                spawnBloodDecal(deathPos);
              }
              // Flatten and expand as body breaks apart
              if (dyingMesh.material) {
                dyingMesh.material.transparent = true;
                dyingMesh.material.opacity = 1 - explodeProgress * 0.7;
              }
              dyingMesh.scale.y *= 0.92;
              dyingMesh.scale.x *= 1.03;
              dyingMesh.scale.z *= 1.03;
            } else if (fallFrame <= FALL_FRAMES + LINGER_FRAMES + EXPLODE_FRAMES + FADE_FRAMES) {
              // Phase 4: Fade out remains
              const fadeProgress = (fallFrame - FALL_FRAMES - LINGER_FRAMES - EXPLODE_FRAMES) / FADE_FRAMES;
              if (dyingMesh.material) {
                dyingMesh.material.transparent = true;
                dyingMesh.material.opacity = Math.max(0, 0.3 * (1 - fadeProgress));
              }
            } else {
              // Phase 5: Remove corpse (XP star already spawned at death start)
              scene.remove(dyingMesh);
              if (dyingMesh.geometry) dyingMesh.geometry.dispose();
              if (dyingMesh.material) dyingMesh.material.dispose();
              if (_bulletHoles) _bulletHoles.forEach(h => { if (h.material) h.material.dispose(); });
              if (_bloodStains) _bloodStains.forEach(s => { if (s.geometry) s.geometry.dispose(); if (s.material) s.material.dispose(); });
              if (_leftEye) _leftEye.material.dispose();
              if (_rightEye) _rightEye.material.dispose();
              return false;
            }
            return true;
          }});
        } else {
          // Fallback: no animation slot available, remove immediately
          scene.remove(dyingMesh);
          setTimeout(() => {
            if (dyingMesh.geometry) dyingMesh.geometry.dispose();
            if (dyingMesh.material) dyingMesh.material.dispose();
            if (_bulletHoles) _bulletHoles.forEach(h => { if (h.material) h.material.dispose(); });
            if (_bloodStains) _bloodStains.forEach(s => { if (s.geometry) s.geometry.dispose(); if (s.material) s.material.dispose(); });
            if (_leftEye) _leftEye.material.dispose();
            if (_rightEye) _rightEye.material.dispose();
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
        // Harvesting: chance to drop Flesh
        if (window.GameHarvesting && this.mesh) window.GameHarvesting.onEnemyKilled(this.mesh.position);
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
        // Phase 5: Death Variety - Multiple death animation variations
        const deathVariation = Math.random();
        
        if (deathVariation < 0.25) {
          // BLOOD BURST DEATH: Intense blood explosion (no large flying pieces for performance)
          spawnParticles(this.mesh.position, 0x8B0000, 25); // Dark blood
          spawnParticles(this.mesh.position, 0xCC0000, 15); // Bright red splatter
          spawnParticles(this.mesh.position, 0xFF2200, 10); // Vivid gore
          // Small blood splatter marks on the ground
          for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const dist = 0.4 + Math.random() * 0.8;
            spawnBloodDecal({ x: this.mesh.position.x + Math.cos(angle) * dist, y: 0, z: this.mesh.position.z + Math.sin(angle) * dist });
          }
        } else if (deathVariation < 0.5) {
          // CORPSE DEATH: Leave a corpse sprite with blood pool
          spawnParticles(this.mesh.position, 0x8B0000, 8);
          spawnParticles(this.mesh.position, 0xCC0000, 4);
          
          // 3D body: a flattened sphere matching the enemy color, lying on the ground
          const corpseGeo = new THREE.SphereGeometry(0.45, 8, 6);
          const corpseMat = new THREE.MeshBasicMaterial({ 
            color: enemyColor, 
            transparent: true,
            opacity: 0.85
          });
          const corpse = new THREE.Mesh(corpseGeo, corpseMat);
          corpse.position.copy(this.mesh.position);
          corpse.position.y = 0.12;
          corpse.scale.y = 0.22; // Flatten into a pancake/body shape
          scene.add(corpse);
          
          // Blood pool
          const bloodGeo = new THREE.CircleGeometry(0.8, 16);
          const bloodMat = new THREE.MeshStandardMaterial({ 
            color: 0x8B0000, 
            transparent: true,
            opacity: 0.5,
            roughness: 0.3,
            metalness: 0.5, // Shine/reflection on blood pool
            side: THREE.DoubleSide
          });
          const bloodPool = new THREE.Mesh(bloodGeo, bloodMat);
          bloodPool.position.copy(this.mesh.position);
          bloodPool.position.y = 0.01;
          bloodPool.rotation.x = -Math.PI / 2;
          scene.add(bloodPool);
          
          // Fade out
          let corpseLife = 180;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            corpseLife--;
            corpse.material.opacity = (corpseLife / 180) * 0.7;
            bloodPool.material.opacity = (corpseLife / 180) * 0.5;
            if (corpseLife <= 0) {
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
        } else if (deathVariation < 0.75) {
          // BLOOD MIST DEATH: Enemy dissolves in a burst of blood mist (no large pieces for performance)
          spawnParticles(this.mesh.position, 0x8B0000, 20); // Dark blood cloud
          spawnParticles(this.mesh.position, 0xCC2200, 12); // Red mist
          spawnParticles(this.mesh.position, 0x660000, 8);  // Deep crimson
          // Scattered blood stains around death position
          for (let i = 0; i < 5; i++) {
            spawnBloodDecal({ x: this.mesh.position.x + (Math.random() - 0.5) * 3, y: 0, z: this.mesh.position.z + (Math.random() - 0.5) * 3 });
          }
        } else {
          // SPLATTER DEATH: Dramatic blood splatter effect
          spawnParticles(this.mesh.position, 0x8B0000, 25); // Lots of blood
          spawnParticles(this.mesh.position, 0xCC0000, 10); // Blood spray
          
          // Create blood splatter marks in random directions
          for(let i = 0; i < 8; i++) {
            const splatter = new THREE.Mesh(
              new THREE.CircleGeometry(0.3, 8),
              new THREE.MeshBasicMaterial({ 
                color: 0x8B0000, 
                transparent: true,
                opacity: 0.6,
                side: THREE.DoubleSide
              })
            );
            const angle = (i / 8) * Math.PI * 2;
            const dist = 0.5 + Math.random() * 0.5;
            splatter.position.set(
              this.mesh.position.x + Math.cos(angle) * dist,
              0.01,
              this.mesh.position.z + Math.sin(angle) * dist
            );
            splatter.rotation.x = -Math.PI / 2;
            scene.add(splatter);
            
            // Fade out
            let life = 100;
            if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
            managedAnimations.push({ update(_dt) {
              life--;
              splatter.material.opacity = (life / 100) * 0.6;
              if (life <= 0) {
                scene.remove(splatter);
                splatter.geometry.dispose();
                splatter.material.dispose();
                return false;
              }
              return true;
            }});
            } else {
              scene.remove(splatter);
              splatter.geometry.dispose(); splatter.material.dispose();
            }
          }
          
          // Central corpse piece - 3D flattened body matching enemy color
          const corpse = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 8, 6),
            new THREE.MeshBasicMaterial({ 
              color: enemyColor, 
              transparent: true,
              opacity: 0.85
            })
          );
          corpse.position.copy(this.mesh.position);
          corpse.position.y = 0.1;
          corpse.scale.y = 0.2; // Flattened body silhouette
          scene.add(corpse);
          
          let corpseLife = 120;
          if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
          managedAnimations.push({ update(_dt) {
            corpseLife--;
            corpse.material.opacity = (corpseLife / 120) * 0.8;
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
        burnMark.position.y = 0.01;
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
          water.position.set(deathPos.x, 0.015, deathPos.z);
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
        // Random slide direction (lower half glides backward, upper stands briefly)
        const slideAngle = Math.random() * Math.PI * 2;
        const slideSpd = 0.06 + Math.random() * 0.05;
        let upperVelY = 0.04;
        let lowerSlideX = Math.cos(slideAngle) * slideSpd;
        let lowerSlideZ = Math.sin(slideAngle) * slideSpd;
        let splitLife = 140;
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

            // Blood drag trail every 2 frames
            if (dragTimer % 2 === 0 && window.BloodSystem) {
              window.BloodSystem.emitDragTrail(lower.position, { x: lowerSlideX, y: 0, z: lowerSlideZ }, 8);
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
        bloodPool.position.y = 0.01;
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
        bloodPool.position.y = 0.01;
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
        // DRONE TURRET DEATH: Riddled with 15-20 tiny holes, blood-mist spray
        const deathPos = this.mesh.position.clone();
        spawnParticles(deathPos, 0xAA0000, 12);
        spawnParticles(deathPos, 0xCC2200, 8);
        if (window.BloodSystem) {
          const mistDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
          window.BloodSystem.emitDroneMist(deathPos, mistDir, 120, { lineLength: 0.6 });
          window.BloodSystem.emitBurst(deathPos, 80, { spreadXZ: 0.6, spreadY: 0.15, minSize: 0.01, maxSize: 0.04, minLife: 20, maxLife: 45 });
        }
        // 15-20 tiny bullet-hole decals scattered around death position
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
      }

      dieBySword(enemyColor) {
        // SWORD DEATH: Deep slash wound with immediate blood flow along the cut line
        const deathPos = this.mesh.position.clone();
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
      }

      dieByAura(enemyColor) {
        // AURA DEATH: Burnt flesh, boiling blood — intense energy damage
        const deathPos = this.mesh.position.clone();
        spawnParticles(deathPos, 0xFF4500, 12);
        spawnParticles(deathPos, 0x5DADE2, 10);
        spawnParticles(deathPos, 0x222222, 8);
        if (window.BloodSystem) {
          window.BloodSystem.emitAuraBurn(deathPos, 100);
          window.BloodSystem.emitBurst(deathPos, 40, { spreadXZ: 0.4, spreadY: 0.12, minSize: 0.02, maxSize: 0.06, color1: 0x550000, color2: 0x8B0000, minLife: 20, maxLife: 50 });
        }
        const burnGeo = new THREE.CircleGeometry(0.7, 12);
        const burnMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
        const burnMark = new THREE.Mesh(burnGeo, burnMat);
        burnMark.rotation.x = -Math.PI / 2;
        burnMark.position.set(deathPos.x, 0.01, deathPos.z);
        scene.add(burnMark);
        const corpseGeo = new THREE.SphereGeometry(0.45, 8, 6);
        const corpseMat = new THREE.MeshBasicMaterial({ color: 0x1a0a00, transparent: true, opacity: 0.85 });
        const corpse = new THREE.Mesh(corpseGeo, corpseMat);
        corpse.position.copy(deathPos);
        corpse.position.y = 0.1;
        corpse.scale.y = 0.2;
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
      }
    }
    // Lazily initialised on first use so the top-level script evaluation never calls THREE
    // before THREE.js has been loaded (mirrors the bulletHoleGeo/bulletHoleMat pattern).
    let projectileGeometryCache = null;
    let projectileMaterialCache = null;
    function ensureProjectileCaches() {
      if (projectileGeometryCache) return;
      projectileGeometryCache = {
        bullet:     new THREE.SphereGeometry(0.0625, 8, 8),
        bulletGlow: new THREE.SphereGeometry(0.0875, 6, 6)
      };
      projectileMaterialCache = {
        bullet: new THREE.MeshBasicMaterial({
          color: 0xFF4500,
          transparent: true,
          opacity: 0.95
        }),
        bulletGlow: new THREE.MeshBasicMaterial({
          color: 0xFF6347,
          transparent: true,
          opacity: 0.4
        })
      };
    }

    // Phase 5: Companion System - Simplified implementation for stable gameplay
