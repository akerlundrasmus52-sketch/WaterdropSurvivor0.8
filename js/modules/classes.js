// js/modules/classes.js
// Game entity classes: Player, Enemy, Bullet, Particle, ObjectPool, Chest, ExpGem, GoldCoin
    import * as THREE from 'three';
    import { COLORS, GAME_CONFIG, MAX_BLOOD_DRIPS } from './constants.js';
    import { gs, gameSettings, playerStats, weapons, joystickLeft, joystickRight, bulletHoleGeo, bulletHoleMat, disposalQueue, setGamePaused } from './state.js';
    import { playSound } from './audio.js';

    // --- CLASSES ---

    class Player {
      constructor() {
        // Create water droplet shape (teardrop)
        const geometry = new THREE.SphereGeometry(0.5, 16, 16); // Reduced segments for performance
        
        // Modify geometry to make it more teardrop-shaped
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const y = positions.getY(i);
          const x = positions.getX(i);
          const z = positions.getZ(i);
          
          // Stretch top to make teardrop
          if (y > 0) {
            positions.setY(i, y * 1.2);
            const squeeze = 1 - (y / 0.5) * 0.3;
            positions.setX(i, x * squeeze);
            positions.setZ(i, z * squeeze);
          }
        }
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshPhysicalMaterial({ 
          color: COLORS.player,
          transparent: true,
          opacity: 0.75,
          metalness: 0.1,
          roughness: 0.2,
          transmission: 0.3,
          thickness: 0.5,
          envMapIntensity: 1,
          clearcoat: 1,
          clearcoatRoughness: 0.1
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.y = 0.5;
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        gs.scene.add(this.mesh);
        
        // Add water shine effect (multiple layers)
        const shineGeo = new THREE.SphereGeometry(0.52, 16, 16);
        const shineMat = new THREE.MeshBasicMaterial({ 
          color: 0xFFFFFF, 
          transparent: true, 
          opacity: 0.25,
          side: THREE.BackSide
        });
        this.shine = new THREE.Mesh(shineGeo, shineMat);
        this.mesh.add(this.shine);
        
        // Add reflection highlight
        const highlightGeo = new THREE.SphereGeometry(0.15, 16, 16);
        const highlightMat = new THREE.MeshBasicMaterial({ 
          color: 0xFFFFFF, 
          transparent: true, 
          opacity: 0.8
        });
        this.highlight = new THREE.Mesh(highlightGeo, highlightMat);
        this.highlight.position.set(-0.2, 0.3, 0.2);
        this.mesh.add(this.highlight);
        
        // Add gs.player face: eyes with friendly appearance (matching main menu art style)
        // REMOVED RED EYES - using blue/cyan to match waterdrop theme
        const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x5DADE2 }); // Cyan/blue eyes to match waterdrop
        
        this.leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        this.leftEye.position.set(-0.12, 0.1, 0.4);
        this.mesh.add(this.leftEye);
        
        this.rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        this.rightEye.position.set(0.12, 0.1, 0.4);
        this.mesh.add(this.rightEye);
        
        // Pupils (darker blue for depth - matches waterdrop theme)
        const pupilGeo = new THREE.SphereGeometry(0.04, 8, 8);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x2874A6 }); // Dark blue to match waterdrop
        
        this.leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
        this.leftPupil.position.set(-0.12, 0.1, 0.45);
        this.mesh.add(this.leftPupil);
        
        this.rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
        this.rightPupil.position.set(0.12, 0.1, 0.45);
        this.mesh.add(this.rightPupil);
        
        // Smile (curved shape using torus segment)
        const smileGeo = new THREE.TorusGeometry(0.15, 0.02, 8, 16, Math.PI);
        const smileMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.smile = new THREE.Mesh(smileGeo, smileMat);
        this.smile.position.set(0, -0.05, 0.4);
        this.smile.rotation.x = Math.PI / 2;
        this.smile.rotation.z = Math.PI;
        this.mesh.add(this.smile);
        
        // Cigar accessory with glowing tip
        const cigarGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.25, 8);
        const cigarMat = new THREE.MeshToonMaterial({ color: 0x8B4513 }); // Brown
        this.cigar = new THREE.Mesh(cigarGeo, cigarMat);
        this.cigar.position.set(0.2, -0.1, 0.35);
        this.cigar.rotation.z = -Math.PI / 6; // Angled
        this.mesh.add(this.cigar);
        
        // Glowing cigar tip
        const tipGeo = new THREE.SphereGeometry(0.03, 8, 8);
        const tipMat = new THREE.MeshBasicMaterial({ 
          color: 0xFF4500, // Orange-red
          transparent: true,
          opacity: 1
        });
        this.cigarTip = new THREE.Mesh(tipGeo, tipMat);
        this.cigarTip.position.set(0.28, -0.05, 0.35);
        this.mesh.add(this.cigarTip);
        
        // Bandage accessory (white cross-shaped bandage on head)
        const bandageGeo = new THREE.BoxGeometry(0.3, 0.05, 0.05);
        const bandageMat = new THREE.MeshToonMaterial({ color: 0xFFFFFF }); // White
        this.bandage = new THREE.Mesh(bandageGeo, bandageMat);
        this.bandage.position.set(0, 0.35, 0);
        this.mesh.add(this.bandage);
        
        // Vertical bandage piece
        const bandageVertGeo = new THREE.BoxGeometry(0.05, 0.3, 0.05);
        this.bandageVert = new THREE.Mesh(bandageVertGeo, bandageMat);
        this.bandageVert.position.set(0, 0.35, 0);
        this.mesh.add(this.bandageVert);
        
        // Eye blink animation timer
        this.blinkTimer = 0;
        this.blinkDuration = 0.1; // 100ms blink
        this.nextBlinkTime = 2 + Math.random() * 3; // Random 2-5 seconds
        this.isBlinking = false;
        
        // Arms (simple cylinders attached to body)
        const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8);
        const limbMaterial = new THREE.MeshToonMaterial({ color: COLORS.player, opacity: 0.85, transparent: true });
        
        // Left arm
        this.leftArm = new THREE.Mesh(armGeo, limbMaterial);
        this.leftArm.position.set(-0.35, 0, 0);
        this.leftArm.rotation.z = Math.PI / 6; // Angled outward
        this.mesh.add(this.leftArm);
        
        // Right arm (holding gun)
        this.rightArm = new THREE.Mesh(armGeo, limbMaterial);
        this.rightArm.position.set(0.35, 0, 0);
        this.rightArm.rotation.z = -Math.PI / 6; // Angled outward
        this.mesh.add(this.rightArm);
        
        // Gun visual (held by right arm) - enhanced for better visibility
        const gunBodyGeo = new THREE.BoxGeometry(0.12, 0.16, 0.35); // Larger gun body
        const gunMat = new THREE.MeshToonMaterial({ color: 0x333333 }); // Slightly lighter dark gray
        this.gunBody = new THREE.Mesh(gunBodyGeo, gunMat);
        this.gunBody.position.set(0.42, -0.05, 0.35);
        this.mesh.add(this.gunBody);
        
        // Gun barrel - longer and thicker
        const barrelGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.3, 8);
        const barrelMat = new THREE.MeshToonMaterial({ color: 0x1a1a1a }); // Black barrel
        this.gunBarrel = new THREE.Mesh(barrelGeo, barrelMat);
        this.gunBarrel.rotation.x = Math.PI / 2;
        this.gunBarrel.position.set(0.42, -0.05, 0.56);
        this.mesh.add(this.gunBarrel);
        
        // Gun scope / sight for visibility
        const sightGeo = new THREE.BoxGeometry(0.04, 0.05, 0.06);
        const sightMat = new THREE.MeshToonMaterial({ color: 0x666666 });
        this.gunSight = new THREE.Mesh(sightGeo, sightMat);
        this.gunSight.position.set(0.42, 0.04, 0.35);
        this.mesh.add(this.gunSight);
        
        // Gun handle
        const handleGeo = new THREE.BoxGeometry(0.07, 0.18, 0.10);
        const handleMat = new THREE.MeshToonMaterial({ color: 0x8B4513 }); // Brown handle
        this.gunHandle = new THREE.Mesh(handleGeo, handleMat);
        this.gunHandle.position.set(0.42, -0.22, 0.25);
        this.gunHandle.rotation.z = -Math.PI / 6;
        this.mesh.add(this.gunHandle);
        
        // Legs (simple cylinders below body)
        const legGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.4, 8);
        
        // Left leg
        this.leftLeg = new THREE.Mesh(legGeo, limbMaterial);
        this.leftLeg.position.set(-0.15, -0.45, 0);
        this.mesh.add(this.leftLeg);
        
        // Right leg
        this.rightLeg = new THREE.Mesh(legGeo, limbMaterial);
        this.rightLeg.position.set(0.15, -0.45, 0);
        this.mesh.add(this.rightLeg);
        
        // Smoke gs.particles timer
        this.smokeTimer = 0;
        
        // Breathing animation states (breath-in with cigar glow, breath-out with smoke)
        this.breathTimer = 0;
        this.breathCycle = 4.0; // 4 seconds per breath cycle
        this.isBreathingIn = false;
        
        // Pulsing glow
        const glowGeo = new THREE.SphereGeometry(0.55, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({ 
          color: 0x4FC3F7, 
          transparent: true, 
          opacity: 0.2,
          side: THREE.BackSide
        });
        this.glow = new THREE.Mesh(glowGeo, glowMat);
        this.mesh.add(this.glow);
        
        // Aura Circle (visible when aura weapon is active)
        const auraGeo = new THREE.RingGeometry(2.5, 3, 16); // Reduced segments for performance
        const auraMat = new THREE.MeshBasicMaterial({ 
          color: 0x5DADE2, 
          transparent: true, 
          opacity: 0.3,
          side: THREE.DoubleSide
        });
        this.auraCircle = new THREE.Mesh(auraGeo, auraMat);
        this.auraCircle.rotation.x = -Math.PI / 2; // Lay flat on ground
        this.auraCircle.position.y = 0.1;
        this.auraCircle.visible = false;
        this.currentAuraRange = 3; // Initial geometry scale matches default aura range * 2
        gs.scene.add(this.auraCircle);
        
        // Fire Ring Orbs (visible when fireRing weapon is active)
        this.fireRingOrbs = [];
        this.fireRingAngle = 0;
        
        // Physics/Visuals
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.targetScale = new THREE.Vector3(1, 1, 1);
        this.trailTimer = 0;
        this.wobblePhase = 0;
        
        // Phase 5: Low health water bleed timer
        this.waterBleedTimer = 0;
        
        // Dash
        this.isDashing = false;
        this.dashTime = 0;
        this.dashDuration = 0.2;
        this.dashVec = new THREE.Vector3();
        
        // Invulnerability frames to prevent instant death
        this.invulnerable = false;
        this.invulnerabilityTime = 0;
        this.invulnerabilityDuration = 0.5; // 500ms of invulnerability after taking damage
        
        // X eyes effect when hit
        this.xEyesActive = false;
        this.xEyes = [];
        
        // Store base scale for breathing animation efficiency
        this.baseScale = 1.0;
      }

      update(dt) {
        // Update invulnerability timer
        const INVULNERABILITY_FLASH_FREQUENCY = 20; // Flash 20 times per second during invulnerability
        if (this.invulnerable) {
          this.invulnerabilityTime += dt;
          if (this.invulnerabilityTime >= this.invulnerabilityDuration) {
            this.invulnerable = false;
            this.invulnerabilityTime = 0;
          }
          // Flash effect during invulnerability
          if (Math.floor(this.invulnerabilityTime * INVULNERABILITY_FLASH_FREQUENCY) % 2 === 0) {
            this.mesh.material.opacity = 0.5;
          } else {
            this.mesh.material.opacity = 0.75;
          }
        } else {
          this.mesh.material.opacity = 0.75; // Normal opacity
        }
        
        // Phase 5: Water bleed effect when health < 30%
        const healthPercent = playerStats.hp / playerStats.maxHp;
        if (healthPercent < 0.3) {
          this.waterBleedTimer += dt;
          if (this.waterBleedTimer > 0.08) { // Fast drip
            this.waterBleedTimer = 0;
            spawnWaterDroplet(this.mesh.position);
            // Add blue water gs.particles trailing behind
            if (Math.random() < 0.5) {
              gs.spawnParticles(this.mesh.position, COLORS.player, 1);
            }
          }
        }
        
        // Dash Logic
        if (this.isDashing) {
          this.dashTime -= dt;
          const t = 1 - (this.dashTime / this.dashDuration);
          // Dash distance uses the upgradeable gs.dashDistance variable
          const dashSpeed = (gs.dashDistance / this.dashDuration); // units per second
          const speed = Math.sin(t * Math.PI) * dashSpeed; // Slow-Fast-Slow curve
          this.mesh.position.x += this.dashVec.x * speed * dt;
          this.mesh.position.z += this.dashVec.z * speed * dt;
          
          // Enhanced splash effect trail during dash - MORE PARTICLES
          if (Math.random() < 0.7) { // Increased from 0.5
            gs.spawnParticles(this.mesh.position, COLORS.player, 3); // Increased from 2
            spawnWaterDroplet(this.mesh.position);
            // Add white sparkle gs.particles during dash
            if (Math.random() < 0.4) {
              gs.spawnParticles(this.mesh.position, 0xFFFFFF, 2);
            }
          }
          
          // DASH DESTRUCTION: Destroy any destructible prop dashed into
          if (window.destructibleProps) {
            for (let prop of window.destructibleProps) {
              if (prop.destroyed) continue;
              const ddx = this.mesh.position.x - prop.mesh.position.x;
              const ddz = this.mesh.position.z - prop.mesh.position.z;
              const ddist2 = ddx * ddx + ddz * ddz;
              if (ddist2 < 4) { // Within 2 units - destroy on dash
                prop.destroyed = true;
                // Big destruction effect
                const pPos = prop.mesh.position;
                if (prop.type === 'tree') {
                  gs.spawnParticles(pPos, 0x8B4513, 25);
                  gs.spawnParticles(pPos, 0x228B22, 20);
                } else if (prop.type === 'barrel') {
                  gs.spawnParticles(pPos, 0xFF4500, 30);
                  gs.spawnParticles(pPos, 0xFFFF00, 15);
                } else {
                  gs.spawnParticles(pPos, 0xD2691E, 20);
                }
                // Screen shake on big destruction
                if (window.triggerScreenShake) window.triggerScreenShake(0.3);
                gs.scene.remove(prop.mesh);
                if (prop.mesh.userData.trunk) {
                  prop.mesh.userData.trunk.geometry.dispose();
                  prop.mesh.userData.trunk.material.dispose();
                  prop.mesh.userData.leaves.geometry.dispose();
                  prop.mesh.userData.leaves.material.dispose();
                } else if (prop.mesh.geometry) {
                  prop.mesh.geometry.dispose();
                  prop.mesh.material.dispose();
                }
              }
            }
          }
          
          // DASH DESTRUCTION: Destroy fences dashed into
          if (window.breakableFences) {
            for (let fence of window.breakableFences) {
              if (!fence.userData.isFence || fence.userData.hp <= 0) continue;
              const fdx = this.mesh.position.x - fence.position.x;
              const fdz = this.mesh.position.z - fence.position.z;
              if (fdx * fdx + fdz * fdz < 4) {
                fence.userData.hp = 0;
                gs.spawnParticles(fence.position, 0x8B4513, 15);
                gs.scene.remove(fence);
                if (fence.geometry) fence.geometry.dispose();
                if (fence.material) fence.material.dispose();
              }
            }
          }
          
          if (this.dashTime <= 0) {
            this.isDashing = false;
          }
        }
        // Movement
        else {
          const targetVel = new THREE.Vector3(0, 0, 0);
        
          // Movement with LEFT stick
          if (joystickLeft.active) {
            const speed = GAME_CONFIG.playerSpeedBase * (playerStats.walkSpeed / 25) * 60; // Base speed for 60fps
            targetVel.x = joystickLeft.x * speed * dt; // Frame-rate independent
            targetVel.z = joystickLeft.y * speed * dt;
          }
          
          // Enhanced inertia: Smooth acceleration and deceleration with glide
          const lerpFactor = joystickLeft.active ? GAME_CONFIG.accelLerpFactor : GAME_CONFIG.decelLerpFactor;
          this.velocity.lerp(targetVel, lerpFactor);
          
          // Apply velocity with inertia
          this.mesh.position.x += this.velocity.x;
          this.mesh.position.z += this.velocity.z;

          // Enhanced water droplet trail when moving - MORE PARTICLES
          if (this.velocity.length() > 0.01) {
            this.trailTimer += dt;
            if (this.trailTimer > 0.12) { // Faster trail (was 0.15)
              this.trailTimer = 0;
              spawnWaterDroplet(this.mesh.position);
              // Add extra splash gs.particles during movement
              if (Math.random() < 0.3) {
                gs.spawnParticles(this.mesh.position, COLORS.player, 1);
              }
            }
          } else {
            // Idle
            this.trailTimer = 0;
          }
          
          // Add lean/tilt in direction of movement
          if (this.velocity.length() > 0.05) {
            const leanAngleX = -this.velocity.z * GAME_CONFIG.movementLeanFactor;
            const leanAngleZ = this.velocity.x * GAME_CONFIG.movementLeanFactor;
            this.mesh.rotation.x = leanAngleX;
            this.mesh.rotation.z = leanAngleZ;
          } else {
            // Return to upright when idle
            this.mesh.rotation.x *= 0.9;
            this.mesh.rotation.z *= 0.9;
          }
          
          // Rotation/Aiming with RIGHT stick (independent of movement)
          if (joystickRight.active) {
            // Manual aim: Turn to face the direction of right stick
            let angle = Math.atan2(joystickRight.x, joystickRight.y);
            
            // FRESH: Precision aiming - 15% nudge toward nearest enemy when right joystick active
            if (gs.enemies && gs.enemies.length > 0) {
              let nearestEnemy = null;
              let minDist = Infinity;
              gs.enemies.forEach(e => {
                if (e && !e.isDead) {
                  const dist = this.mesh.position.distanceTo(e.mesh.position);
                  if (dist < minDist && dist < 15) { // Only nudge if enemy within reasonable range
                    minDist = dist;
                    nearestEnemy = e;
                  }
                }
              });
              
              if (nearestEnemy) {
                const dx = nearestEnemy.mesh.position.x - this.mesh.position.x;
                const dz = nearestEnemy.mesh.position.z - this.mesh.position.z;
                const enemyAngle = Math.atan2(dx, dz);
                
                // Blend 85% gs.player input + 15% toward enemy (subtle magnetism)
                let angleDiff = enemyAngle - angle;
                // Normalize angle difference to -PI to PI
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                
                angle = angle + angleDiff * 0.15; // 15% nudge
              }
            }
            
            this.mesh.rotation.y = angle;
          } else if (gameSettings.autoAim && gs.enemies && gs.enemies.length > 0) {
            // Auto-aim when enabled (works in any orientation)
            let nearestEnemy = null;
            let minDist = Infinity;
            gs.enemies.forEach(e => {
              if (e && !e.isDead) {
                const dist = this.mesh.position.distanceTo(e.mesh.position);
                if (dist < minDist) {
                  minDist = dist;
                  nearestEnemy = e;
                }
              }
            });
            if (nearestEnemy) {
              const dx = nearestEnemy.mesh.position.x - this.mesh.position.x;
              const dz = nearestEnemy.mesh.position.z - this.mesh.position.z;
              const angle = Math.atan2(dx, dz);
              this.mesh.rotation.y = angle;
            }
          } else if (joystickLeft.active) {
            // If no right stick input and no auto-aim, rotate to face movement direction
            const angle = Math.atan2(targetVel.x, targetVel.z);
            this.mesh.rotation.y = angle;
          }
        }
        
        const speedMag = this.velocity.length();
        
        // Waterdrop physics: squish/bounce/wobble
        const dt2 = Math.min(dt, 0.05);
        let targetScaleY = 1.0;
        let targetScaleXZ = 1.0;
        if (speedMag > 0.05) {
          const squishAmt = Math.min(speedMag * 0.04, 0.18);
          targetScaleY = 1.0 - squishAmt;
          targetScaleXZ = 1.0 + squishAmt * 0.7;
          this.wobblePhase += dt2 * speedMag * 8;
          targetScaleY += Math.sin(this.wobblePhase) * 0.03;
        } else {
          this.wobblePhase += dt2 * 2;
          targetScaleY = 1.0 + Math.sin(this.wobblePhase) * 0.02;
        }
        if (this.isDashing) {
          targetScaleY = 0.6;
          targetScaleXZ = 1.4;
        }
        const scaleLerp = Math.min(dt2 * 12, 1);
        this.mesh.scale.y = this.mesh.scale.y + (targetScaleY - this.mesh.scale.y) * scaleLerp;
        this.mesh.scale.x = this.mesh.scale.x + (targetScaleXZ - this.mesh.scale.x) * scaleLerp;
        this.mesh.scale.z = this.mesh.scale.z + (targetScaleXZ - this.mesh.scale.z) * scaleLerp;
        // Shed water gs.particles when moving fast
        if (speedMag > 0.4 && Math.random() < dt2 * speedMag * 3 && !this.isDashing) {
          const n = Math.floor(Math.random() * 2) + 1;
          for (let i = 0; i < n; i++) spawnWaterParticle(this.mesh.position);
        }
        
        // Animate water shine
        this.shine.rotation.y += 0.05;
        this.shine.rotation.x += 0.03;
        
        // Pulse highlight
        this.highlight.material.opacity = 0.6 + Math.sin(gs.gameTime * 3) * 0.2;
        
        // Pulse glow effect
        this.glow.material.opacity = 0.15 + Math.sin(gs.gameTime * 2) * 0.1;
        this.glow.scale.set(
          1 + Math.sin(gs.gameTime * 2) * 0.05,
          1 + Math.sin(gs.gameTime * 2) * 0.05,
          1 + Math.sin(gs.gameTime * 2) * 0.05
        );
        
        // Animate arms and legs (walking animation when moving)
        if (speedMag > 0.1) {
          // Walking animation - swing arms and legs
          const walkPhase = gs.gameTime * 8; // Walking speed
          this.leftArm.rotation.x = Math.sin(walkPhase) * 0.3;
          this.rightArm.rotation.x = -Math.sin(walkPhase) * 0.3;
          this.leftLeg.rotation.x = -Math.sin(walkPhase) * 0.4;
          this.rightLeg.rotation.x = Math.sin(walkPhase) * 0.4;
        } else {
          // Idle - gentle sway
          const idlePhase = gs.gameTime * 2;
          this.leftArm.rotation.x = Math.sin(idlePhase) * 0.1;
          this.rightArm.rotation.x = Math.sin(idlePhase + Math.PI) * 0.1;
          this.leftLeg.rotation.x = 0;
          this.rightLeg.rotation.x = 0;
        }
        
        // Animate cigar tip with breathing animation (breath-in/breath-out cycle)
        if (this.cigarTip) {
          // Breathing animation cycle
          this.breathTimer += dt;
          const breathPhase = (this.breathTimer % this.breathCycle) / this.breathCycle; // 0 to 1
          
          // Breath-in: 0 to 0.4 (1.6s), Hold: 0.4 to 0.5 (0.4s), Breath-out: 0.5 to 1.0 (2s)
          if (breathPhase < 0.4) {
            // Breathing in - cigar tip glows brighter
            this.isBreathingIn = true;
            const inhaleProgress = breathPhase / 0.4;
            const tipBrightness = 0.7 + inhaleProgress * 0.3 + Math.sin(gs.gameTime * 8) * 0.1;
            this.cigarTip.material.opacity = tipBrightness;
            this.cigarTip.scale.set(1 + inhaleProgress * 0.3, 1 + inhaleProgress * 0.3, 1 + inhaleProgress * 0.3);
            
            // Subtle body scaling during inhale - efficient approach
            const targetScale = this.baseScale * (1 + inhaleProgress * 0.05);
            this.mesh.scale.set(targetScale, targetScale, targetScale);
          } else if (breathPhase < 0.5) {
            // Holding breath
            this.isBreathingIn = false;
            this.cigarTip.material.opacity = 1.0;
            this.cigarTip.scale.set(1.3, 1.3, 1.3);
            this.mesh.scale.set(this.baseScale * 1.05, this.baseScale * 1.05, this.baseScale * 1.05);
          } else {
            // Breathing out - emit smoke from mouth
            this.isBreathingIn = false;
            const exhaleProgress = (breathPhase - 0.5) / 0.5;
            const tipBrightness = 1.0 - exhaleProgress * 0.3 + Math.sin(gs.gameTime * 8) * 0.1;
            const targetScale = this.baseScale * (1.05 - exhaleProgress * 0.05);
            this.mesh.scale.set(targetScale, targetScale, targetScale);
            this.cigarTip.material.opacity = tipBrightness;
            this.cigarTip.scale.set(1.3 - exhaleProgress * 0.3, 1.3 - exhaleProgress * 0.3, 1.3 - exhaleProgress * 0.3);
            
            // Emit smoke from mouth during exhale
            this.smokeTimer += dt;
            if (this.smokeTimer > 0.15) { // Faster smoke during exhale
              this.smokeTimer = 0;
              
              // Get current lighting intensity for smoke color
              const lightIntensity = window.dirLight ? window.dirLight.intensity : 0.8;
              const smokeColor = new THREE.Color().lerpColors(
                new THREE.Color(0x555555), // Dark gray in night
                new THREE.Color(0xCCCCCC), // Light gray in day
                lightIntensity
              );
              
              // Create smoke particle from mouth
              const smokeGeo = new THREE.SphereGeometry(0.08, 6, 6);
              const smokeMat = new THREE.MeshBasicMaterial({ 
                color: smokeColor,
                transparent: true,
                opacity: 0.6
              });
              const smoke = new THREE.Mesh(smokeGeo, smokeMat);
              
              // Position at mouth (slightly in front of face)
              smoke.position.set(
                this.mesh.position.x,
                this.mesh.position.y - 0.05,
                this.mesh.position.z + 0.45
              );
              gs.scene.add(smoke);
              
              // Animate smoke rising and drifting forward
              let smokeLife = 100;
              const updateSmoke = () => {
                smokeLife--;
                smoke.position.y += 0.02; // Rise up
                smoke.position.z += 0.03; // Drift forward
                smoke.position.x += (Math.random() - 0.5) * 0.02; // Random drift
                smoke.scale.multiplyScalar(1.03); // Expand faster
                smoke.material.opacity = (smokeLife / 100) * 0.6; // Fade out
                
                if (smokeLife <= 0) {
                  gs.scene.remove(smoke);
                  smoke.geometry.dispose();
                  smoke.material.dispose();
                } else {
                  requestAnimationFrame(updateSmoke);
                }
              };
              updateSmoke();
            }
          }
        }
        
        // Blinking eyes animation
        this.blinkTimer += dt;
        if (this.blinkTimer >= this.nextBlinkTime) {
          this.isBlinking = true;
          this.blinkTimer = 0;
          this.nextBlinkTime = 2 + Math.random() * 3; // Next blink in 2-5 seconds
        }
        
        if (this.isBlinking) {
          // Scale eyes down vertically for blink effect
          const blinkProgress = Math.min(1, this.blinkTimer / this.blinkDuration);
          if (blinkProgress < 0.5) {
            // Closing
            const scale = 1 - (blinkProgress * 2);
            this.leftEye.scale.y = scale;
            this.rightEye.scale.y = scale;
            this.leftPupil.scale.y = scale;
            this.rightPupil.scale.y = scale;
          } else {
            // Opening
            const scale = (blinkProgress - 0.5) * 2;
            this.leftEye.scale.y = scale;
            this.rightEye.scale.y = scale;
            this.leftPupil.scale.y = scale;
            this.rightPupil.scale.y = scale;
          }
          
          if (blinkProgress >= 1) {
            this.isBlinking = false;
            this.blinkTimer = 0;
            // Reset scale
            this.leftEye.scale.y = 1;
            this.rightEye.scale.y = 1;
            this.leftPupil.scale.y = 1;
            this.rightPupil.scale.y = 1;
          }
        }
        
        // Update aura circle
        if (weapons.aura.active) {
          this.auraCircle.visible = true;
          this.auraCircle.position.x = this.mesh.position.x;
          this.auraCircle.position.z = this.mesh.position.z;
          
          // Scale based on aura range - only recreate geometry if range changed
          const scale = weapons.aura.range * 2;
          if (this.currentAuraRange !== scale) {
            this.currentAuraRange = scale;
            this.auraCircle.geometry.dispose();
            this.auraCircle.geometry = new THREE.RingGeometry(scale - 0.5, scale, 16); // Reduced segments for performance
          }
          
          // Rotate and pulse
          this.auraCircle.rotation.z += 0.02;
          this.auraCircle.material.opacity = 0.25 + Math.sin(gs.gameTime * 4) * 0.15;
        } else {
          this.auraCircle.visible = false;
        }
        
        // Update fire ring orbs
        if (weapons.fireRing.active) {
          const currentOrbCount = weapons.fireRing.orbs;
          
          // Add orbs if needed
          while (this.fireRingOrbs.length < currentOrbCount) {
            const geo = new THREE.SphereGeometry(0.3, 8, 8);
            const mat = new THREE.MeshBasicMaterial({ 
              color: 0xFF4500, 
              transparent: true, 
              opacity: 0.8 
            });
            const orb = new THREE.Mesh(geo, mat);
            gs.scene.add(orb);
            this.fireRingOrbs.push(orb);
          }
          
          // Remove extra orbs if downgraded (shouldn't happen but safety)
          while (this.fireRingOrbs.length > currentOrbCount) {
            const orb = this.fireRingOrbs.pop();
            gs.scene.remove(orb);
            orb.geometry.dispose();
            orb.material.dispose();
          }
          
          // Update orb positions (orbit around gs.player)
          this.fireRingAngle += weapons.fireRing.rotationSpeed * dt;
          const radius = weapons.fireRing.range;
          
          for (let i = 0; i < this.fireRingOrbs.length; i++) {
            const angle = this.fireRingAngle + (i * Math.PI * 2 / currentOrbCount);
            const orb = this.fireRingOrbs[i];
            orb.position.x = this.mesh.position.x + Math.cos(angle) * radius;
            orb.position.z = this.mesh.position.z + Math.sin(angle) * radius;
            orb.position.y = this.mesh.position.y + Math.sin(gs.gameTime * 5 + i) * 0.3; // Bob up and down
            
            // Glow effect
            orb.material.opacity = 0.7 + Math.sin(gs.gameTime * 8 + i) * 0.2;
          }
        } else {
          // Hide orbs when weapon not active
          for (let orb of this.fireRingOrbs) {
            orb.visible = false;
          }
        }

        // Camera Follow
        gs.camera.position.x = this.mesh.position.x;
        gs.camera.position.z = this.mesh.position.z + 20; // Isometric offset
        gs.camera.lookAt(this.mesh.position);

        // Bounds (Map is 400x400, from -200 to 200)
        this.mesh.position.x = Math.max(-195, Math.min(195, this.mesh.position.x));
        this.mesh.position.z = Math.max(-195, Math.min(195, this.mesh.position.z));
      }

      dash(dx, dz) {
        if (this.isDashing) return;
        this.isDashing = true;
        this.dashTime = this.dashDuration;
        
        // Splash effect on dash start - more dramatic
        gs.spawnParticles(this.mesh.position, COLORS.player, 10); // Reduced for performance
        for(let i=0; i<8; i++) {
          spawnWaterDroplet(this.mesh.position);
        }
        
        // Direct mapping: Screen coordinates to World coordinates
        // Screen X-axis maps to World X-axis
        // Screen Y-axis maps to World Z-axis
        this.dashVec.set(dx, 0, dz).normalize();
        
        // Add dramatic lean/tilt in dash direction
        const dashAngleX = -dz * GAME_CONFIG.dashLeanFactor;
        const dashAngleZ = dx * GAME_CONFIG.dashLeanFactor;
        
        // Animate tilt during dash
        const originalRotX = this.mesh.rotation.x;
        const originalRotZ = this.mesh.rotation.z;
        
        // Quick tilt into dash
        this.mesh.rotation.x = dashAngleX;
        this.mesh.rotation.z = dashAngleZ;
        
        // Return to normal after dash with smooth animation
        setTimeout(() => {
          let returnProgress = 0;
          const returnDuration = GAME_CONFIG.dashLeanReturnDuration;
          const returnAnim = () => {
            returnProgress += 16; // ~16ms per frame
            const t = Math.min(returnProgress / returnDuration, 1);
            this.mesh.rotation.x = dashAngleX * (1 - t);
            this.mesh.rotation.z = dashAngleZ * (1 - t);
            if (t < 1) {
              requestAnimationFrame(returnAnim);
            }
          };
          returnAnim();
        }, this.dashDuration * 1000);
        
        // Water splash sound
        playSound('splash');
      }

      takeDamage(amount) {
        // Check invulnerability frames
        if (this.invulnerable) return;
        
        // Armor reduction
        const reduced = Math.max(1, amount * (1 - playerStats.armor / 100));
        playerStats.hp -= reduced;
        if (window.updateHUD) window.updateHUD();
        playSound('hit');
        
        // Trigger waterdrop UI attack animation
        const waterdropContainer = document.getElementById('waterdrop-container');
        if (waterdropContainer) {
          waterdropContainer.classList.add('attacked');
          setTimeout(() => {
            waterdropContainer.classList.remove('attacked');
          }, 400);
        }
        
        // Show "X" eyes when hit
        if (!this.xEyesActive) {
          this.xEyesActive = true;
          // Hide normal eyes
          this.leftEye.visible = false;
          this.rightEye.visible = false;
          this.leftPupil.visible = false;
          this.rightPupil.visible = false;
          
          // Create X shapes for eyes
          const xMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
          this.xEyes = [];
          
          // Left X
          const leftX1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.01), xMaterial);
          leftX1.position.set(-0.12, 0.1, 0.4);
          leftX1.rotation.z = Math.PI / 4;
          this.mesh.add(leftX1);
          this.xEyes.push(leftX1);
          
          const leftX2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.01), xMaterial);
          leftX2.position.set(-0.12, 0.1, 0.4);
          leftX2.rotation.z = -Math.PI / 4;
          this.mesh.add(leftX2);
          this.xEyes.push(leftX2);
          
          // Right X
          const rightX1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.01), xMaterial);
          rightX1.position.set(0.12, 0.1, 0.4);
          rightX1.rotation.z = Math.PI / 4;
          this.mesh.add(rightX1);
          this.xEyes.push(rightX1);
          
          const rightX2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.01), xMaterial);
          rightX2.position.set(0.12, 0.1, 0.4);
          rightX2.rotation.z = -Math.PI / 4;
          this.mesh.add(rightX2);
          this.xEyes.push(rightX2);
          
          // Remove X eyes after 300ms and restore normal eyes
          setTimeout(() => {
            this.xEyesActive = false;
            this.xEyes.forEach(x => this.mesh.remove(x));
            this.xEyes = [];
            this.leftEye.visible = true;
            this.rightEye.visible = true;
            this.leftPupil.visible = true;
            this.rightPupil.visible = true;
          }, 300);
        }
        
        // Show damage number for gs.player (red color)
        const div = document.createElement('div');
        div.className = 'damage-number gs.player-damage';
        div.innerText = `-${Math.floor(reduced)}`;
        div.style.color = '#FF4444';
        div.style.fontSize = '24px';
        div.style.fontWeight = 'bold';
        div.style.textShadow = '0 0 8px rgba(255,68,68,0.8), 2px 2px 4px #000';
        
        // Project 3D pos to 2D screen
        const vec = this.mesh.position.clone();
        vec.y += 2;
        vec.project(gs.camera);
        
        const x = (vec.x * .5 + .5) * window.innerWidth;
        const y = (-(vec.y * .5) + .5) * window.innerHeight;
        
        div.style.position = 'absolute';
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
        div.style.transform = 'translate(-50%, -50%)';
        div.style.pointerEvents = 'none';
        div.style.zIndex = '1000';
        
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 1000);
        
        // Set invulnerability
        this.invulnerable = true;
        this.invulnerabilityTime = 0;
        
        // Visual flash
        this.mesh.material.color.setHex(0xFF0000);
        setTimeout(() => {
          this.mesh.material.color.setHex(COLORS.player);
        }, 100);
        
        // Water-themed blood effects for gs.player (blue water droplets)
        // Spawn blue water gs.particles (gs.player's "blood")
        gs.spawnParticles(this.mesh.position, COLORS.player, 8); // Blue water
        gs.spawnParticles(this.mesh.position, 0x87CEEB, 5); // Light blue splash
        gs.spawnParticles(this.mesh.position, 0xFFFFFF, 3); // White foam
        
        // Water droplets as gs.player blood
        for(let i=0; i<5; i++) {
          spawnWaterDroplet(this.mesh.position);
        }
        
        // More dramatic squishy deformation animation
        this.mesh.scale.set(1.4, 0.6, 1.4); // More squished
        setTimeout(() => {
          this.mesh.scale.set(0.7, 1.3, 0.7); // More stretched
          setTimeout(() => {
            this.mesh.scale.set(1, 1, 1);
          }, 50);
        }, 50);
        
        // FRESH IMPLEMENTATION: Screen shake scales with damage amount
        const originalCameraPos = { 
          x: gs.camera.position.x, 
          y: gs.camera.position.y, 
          z: gs.camera.position.z 
        };
        let shakeTime = 0;
        const shakeDuration = 0.25 + (reduced / 100) * 0.15; // Duration scales with damage
        
        const shakeAnim = () => {
          shakeTime += 0.016;
          if (shakeTime < shakeDuration) {
            // Intensity scales with damage (0.5 base + up to 0.5 more based on damage)
            const baseIntensity = 0.5 + Math.min(reduced / 50, 1) * 0.5;
            const intensity = (1 - shakeTime / shakeDuration) * baseIntensity;
            gs.camera.position.x = originalCameraPos.x + (Math.random() - 0.5) * intensity;
            gs.camera.position.y = originalCameraPos.y + (Math.random() - 0.5) * intensity;
            gs.camera.position.z = originalCameraPos.z + (Math.random() - 0.5) * intensity;
            requestAnimationFrame(shakeAnim);
          } else {
            gs.camera.position.x = originalCameraPos.x;
            gs.camera.position.y = originalCameraPos.y;
            gs.camera.position.z = originalCameraPos.z;
          }
        };
        shakeAnim();

        if (playerStats.hp <= 0) {
          // ENHANCED Death splash: more gs.particles + ground pool with fade
          gs.spawnParticles(this.mesh.position, COLORS.player, 25); // Reduced for performance
          gs.spawnParticles(this.mesh.position, 0xFFFFFF, 8); // Reduced for performance
          
          // Create ground pool (flat circle that fades out)
          const poolGeo = new THREE.CircleGeometry(1.5, 16);
          const poolMat = new THREE.MeshBasicMaterial({ 
            color: COLORS.player, 
            transparent: true, 
            opacity: 0.6,
            side: THREE.DoubleSide
          });
          const pool = new THREE.Mesh(poolGeo, poolMat);
          pool.rotation.x = -Math.PI / 2;
          pool.position.set(this.mesh.position.x, 0.05, this.mesh.position.z);
          gs.scene.add(pool);
          
          // Fade out pool over time
          const fadePool = () => {
            poolMat.opacity -= 0.01;
            if (poolMat.opacity > 0) {
              setTimeout(fadePool, 50);
            } else {
              gs.scene.remove(pool);
              poolGeo.dispose();
              poolMat.dispose();
            }
          };
          setTimeout(fadePool, 500);
          
          if (window.gameOver) window.gameOver();
        }
    // Note: All Hard Tank gs.enemies share the same deformed shape for performance.
    // This is intentional - visual variety comes from animations and positioning.

    // Water particle pool for gs.player physics effects
    const waterParticlePool = [];
    const MAX_WATER_PARTICLES = 20;

    function spawnWaterParticle(pos) {
      if (!gs.scene) return;
      let p = waterParticlePool.find(x => !x.active);
      if (!p) {
        if (waterParticlePool.length >= MAX_WATER_PARTICLES) return;
        if (!gs.waterParticleGeom) gs.waterParticleGeom = new THREE.SphereGeometry(0.12, 4, 4);
        if (!gs.waterParticleMat) gs.waterParticleMat = new THREE.MeshBasicMaterial({ color: 0x44aabb, transparent: true, opacity: 0.7 });
        const mesh = new THREE.Mesh(gs.waterParticleGeom, gs.waterParticleMat.clone());
        p = { mesh, active: false, life: 0, vx: 0, vy: 0, vz: 0 };
        gs.scene.add(p.mesh);
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
      if (!gs.hardTankGeometryCache) {
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
        gs.hardTankGeometryCache = geometry;
      }
      return gs.hardTankGeometryCache;
    }

    // Drone Turret class - New weapon replacing Lightning
    class DroneTurret {
      constructor(player) {
        this.player = gs.player;
        this.offset = new THREE.Vector3(2, 1.5, 0); // Initial hover position relative to gs.player
        this.wobblePhase = Math.random() * Math.PI * 2; // Random starting phase
        
        // Create drone body - small mechanical unit
        const bodyGeo = new THREE.BoxGeometry(0.4, 0.3, 0.4);
        const bodyMat = new THREE.MeshToonMaterial({ 
          color: 0x808080, // Gray metallic
          emissive: 0x404040,
          emissiveIntensity: 0.3
        });
        this.mesh = new THREE.Mesh(bodyGeo, bodyMat);
        gs.scene.add(this.mesh);
        
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
        
        // Hover near gs.player with smooth bobbing motion
        this.wobblePhase += dt * 3;
        const bobHeight = Math.sin(this.wobblePhase) * 0.2;
        
        // Target position relative to gs.player
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
        this.core.material.opacity = 0.6 + Math.sin(gs.gameTime * 5) * 0.2;
        
        // Find and track nearest enemy
        let nearestEnemy = null;
        let minDist = Infinity;
        
        for (let e of gs.enemies) {
          if (e.isDead) continue;
          const dist = this.mesh.position.distanceTo(e.mesh.position);
          if (dist < weapons.droneTurret.range && dist < minDist) {
            minDist = dist;
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
          gs.scene.remove(this.mesh);
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
        this.type = type; // 0: Tank, 1: Fast, 2: Balanced, 3: Slowing, 4: Ranged, 5: Flying, 6: Hard Tank, 7: Hard Fast, 8: Hard Balanced, 9: Elite, 10: MiniBoss
        let geometry;
        let color;
        
        // Enemy scaling based on gs.player level - NOT SPEED, just HP and DAMAGE
        // Phase 3: Increased difficulty - 15% per level (was 10%)
        const levelScaling = 1 + (playerLevel - 1) * 0.15;
        
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
        }

        const material = new THREE.MeshPhysicalMaterial({ 
          color: color,
          transparent: true,
          opacity: 0.85,
          metalness: type === 10 ? 0.4 : 0.1,
          roughness: 0.6,
          transmission: 0.2,
          thickness: 0.5,
          emissive: type === 10 ? color : 0x000000,
          emissiveIntensity: type === 10 ? 0.3 : 0
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, type === 5 ? 2 : 0.5, z);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        gs.scene.add(this.mesh);

        // Stats based on type - SCALED BY LEVEL (Rebalanced for better gameplay - reduced HP for more rewarding kills)
        if (type === 0) { // Tank
          this.hp = 100 * levelScaling; // Reduced from 150
          this.speed = GAME_CONFIG.enemySpeedBase * 0.6; // Speed NOT scaled
        } else if (type === 1) { // Fast, Low HP
          this.hp = 30 * levelScaling; // Reduced from 40
          this.speed = GAME_CONFIG.enemySpeedBase * 1.6; // Speed NOT scaled
        } else if (type === 2) { // Balanced
          this.hp = 60 * levelScaling; // Reduced from 80
          this.speed = GAME_CONFIG.enemySpeedBase; // Speed NOT scaled
        } else if (type === 3) { // Slowing
          this.hp = 75 * levelScaling; // Reduced from 100
          this.speed = GAME_CONFIG.enemySpeedBase * 0.8; // Speed NOT scaled
          this.slowDuration = 2000; // 2 seconds slow
          this.slowAmount = 0.5; // 50% slow
        } else if (type === 4) { // Ranged
          this.hp = 50 * levelScaling; // Reduced from 60
          this.speed = GAME_CONFIG.enemySpeedBase * 0.7; // Speed NOT scaled
          this.attackRange = 8; // Range for ranged attacks
          this.projectileSpeed = 0.15;
        } else if (type === 5) { // Flying
          this.hp = 60 * levelScaling;
          this.speed = GAME_CONFIG.enemySpeedBase * 1.3;
          this.isFlying = true;
        } else if (type === 6) { // Hard Tank
          this.hp = 180 * levelScaling;
          this.speed = GAME_CONFIG.enemySpeedBase * 0.65;
        } else if (type === 7) { // Hard Fast
          this.hp = 55 * levelScaling;
          this.speed = GAME_CONFIG.enemySpeedBase * 1.8;
        } else if (type === 8) { // Hard Balanced
          this.hp = 110 * levelScaling;
          this.speed = GAME_CONFIG.enemySpeedBase * 1.1;
        } else if (type === 9) { // Elite
          this.hp = 200 * levelScaling;
          this.speed = GAME_CONFIG.enemySpeedBase * 0.9;
        } else if (type === 10) { // MiniBoss
          const miniBossStartLevel = 10;
          // Phase 3: Double MiniBoss hitpoints for increased difficulty
          this.hp = 1000 * (1 + (playerLevel - miniBossStartLevel) * 0.15);
          this.speed = GAME_CONFIG.enemySpeedBase * 0.5;
          this.isMiniBoss = true;
          // Phase 3: Add armor stat (damage reduction)
          this.armor = 0.25; // 25% damage reduction
        }
        
        this.maxHp = this.hp;
        // Early game difficulty: Higher base damage (50 instead of 25)
        // At 100 HP start, this means ~2 hits to die without upgrades (hard as hell)
        // Armor upgrades become critical for survival
        this.damage = (type === 9 ? 50 * 1.5 : 50) * levelScaling; // Elite does 1.5x damage
        if (type === 10) this.damage = 75 * levelScaling; // MiniBoss damage - even more threatening
        this.isDead = false;
        this.isDamaged = false; // Track if enemy has been visually damaged
        this.pulsePhase = Math.random() * Math.PI;
        this.wobbleOffset = Math.random() * 100;
        this.lastAttackTime = 0;
        this.attackCooldown = 1000; // 1 second cooldown
        // Armor defaults to 0 if not set (only MiniBoss has armor = 0.25)
        
        // Add glowing eyes to enemy (VFX)
        const eyeRadius = type === 10 ? 0.12 : 0.07;
        const eyeColor = type === 4 ? 0xFF3300 : (type === 10 ? 0xFF0000 : 0xFF2222);
        const eGeo = new THREE.SphereGeometry(eyeRadius, 6, 6);
        const eMat = new THREE.MeshBasicMaterial({ color: eyeColor });
        const eyeSpread = type === 10 ? 0.3 : 0.18;
        const eyeForward = type === 5 ? 0.45 : 0.42;
        this.leftEye = new THREE.Mesh(eGeo, eMat);
        this.leftEye.position.set(-eyeSpread, 0.1, eyeForward);
        this.mesh.add(this.leftEye);
        this.rightEye = new THREE.Mesh(eGeo, eMat.clone()); // share geometry, clone material
        this.rightEye.position.set(eyeSpread, 0.1, eyeForward);
        this.mesh.add(this.rightEye);
        // Blink timer
        this.blinkTimer = 0;
        this.blinkDuration = 0.08;
        this.nextBlinkTime = 1.5 + Math.random() * 3.5;
        this.isBlinking = false;
      }

      update(dt, playerPos) {
        if (this.isDead) return;

        // Windmill Quest: Attack windmill instead of gs.player
        let targetPos = playerPos;
        if (gs.windmillQuest.active && gs.windmillQuest.windmill) {
          targetPos = gs.windmillQuest.windmill.position;
        }

        // Move towards target
        const dx = targetPos.x - this.mesh.position.x;
        const dz = targetPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);

        // Ranged Enemy behavior - stop at range and shoot
        if (this.type === 4 && dist < this.attackRange) {
          // Stop moving and attack from range
          const now = Date.now();
          if (now - this.lastAttackTime > this.attackCooldown) {
            // Fire projectile at gs.player
            this.fireProjectile(targetPos);
            this.lastAttackTime = now;
          }
          this.mesh.lookAt(targetPos);
        } else if (dist > 0.5) {
          // Check if slow effect expired
          if (this.slowedUntil && this.slowedUntil < Date.now()) {
            this.speed = this.originalSpeed || this.speed;
            this.slowedUntil = null;
          }
          
          // Move towards target
          let vx = (dx / dist) * this.speed;
          let vz = (dz / dist) * this.speed;
          
          // Add enemy avoidance to prevent stacking/trains (optimized)
          // Only check nearby gs.enemies to avoid O(n²) performance issues
          let avoidX = 0, avoidZ = 0;
          let avoidanceCount = 0;
          const maxAvoidanceChecks = 5; // Limit checks to nearest gs.enemies
          for (let other of gs.enemies) {
            if (other === this || other.isDead || avoidanceCount >= maxAvoidanceChecks) continue;
            const odx = this.mesh.position.x - other.mesh.position.x;
            const odz = this.mesh.position.z - other.mesh.position.z;
            const odist = Math.sqrt(odx*odx + odz*odz);
            
            // If too close to another enemy, push away
            if (odist < 1.5 && odist > 0.01) {
              const repulsion = 0.015; // Gentle push (kept smaller than forward speed)
              avoidX += (odx / odist) * repulsion;
              avoidZ += (odz / odist) * repulsion;
              avoidanceCount++;
            }
          }
          // Blend avoidance as secondary force - cap so it doesn't overpower forward movement
          const avoidMag = Math.sqrt(avoidX*avoidX + avoidZ*avoidZ);
          if (avoidMag > this.speed * 0.6) {
            const scale = (this.speed * 0.6) / avoidMag;
            avoidX *= scale;
            avoidZ *= scale;
          }
          vx += avoidX;
          vz += avoidZ;
          
          // Type 1 (Fast) - Zigzag perpendicular oscillation
          if (this.type === 1) {
            const wobble = Math.sin(gs.gameTime * 12 + this.wobbleOffset) * 0.06;
            vx += wobble * (dz/dist); // Perpendicular oscillation
            vz -= wobble * (dx/dist);
          }
          
          // Type 2 (Balanced) - Slight weaving instead of circle strafe
          if (this.type === 2) {
            const weavePhase = gs.gameTime * 4 + this.wobbleOffset;
            const weave = Math.sin(weavePhase) * 0.04;
            vx += weave * (-dz/dist);
            vz += weave * (dx/dist);
          }
          
          // Type 0 (Tank/Slow) - Weaving approach pattern
          if (this.type === 0) {
            const weavePhase = gs.gameTime * 3 + this.wobbleOffset;
            const weave = Math.sin(weavePhase) * 0.04;
            vx += weave * (-dz/dist); // Weave side to side
            vz += weave * (dx/dist);
          }
          
          // Type 5 (Flying) - Wavy flying pattern
          if (this.type === 5) {
            const wavePhase = gs.gameTime * 5 + this.wobbleOffset;
            const wave = Math.sin(wavePhase) * 0.08;
            vx += wave * (dz/dist);
            vz -= wave * (dx/dist);
            // Flying height with sin wave
            this.mesh.position.y = 2 + Math.sin(gs.gameTime * 3 + this.wobbleOffset) * 0.5;
          }
          
          this.mesh.position.x += vx;
          this.mesh.position.z += vz;
          this.mesh.lookAt(targetPos);
        }

        // Collision with target
        if (gs.windmillQuest.active && gs.windmillQuest.windmill && dist < 3.0) {
          // Attack windmill with cooldown
          const now = Date.now();
          if (now - this.lastAttackTime > this.attackCooldown) {
            gs.windmillQuest.windmill.userData.hp -= this.damage;
            updateWindmillQuestUI();
            this.lastAttackTime = now;
            playSound('hit');
          }
          // Knockback
          this.mesh.position.x -= (dx / dist) * 2;
          this.mesh.position.z -= (dz / dist) * 2;
          
          if (gs.windmillQuest.windmill.userData.hp <= 0) {
            failWindmillQuest();
          }
        } else if (dist < 1.0 && this.type !== 4) { // Ranged gs.enemies don't melee attack
          // Attack gs.player with cooldown to prevent instant death
          const now = Date.now();
          if (now - this.lastAttackTime > this.attackCooldown) {
            gs.player.takeDamage(this.damage);
            this.lastAttackTime = now;
            
            // Thorns damage - reflect damage back to enemy if still alive
            if (playerStats.thornsPercent > 0 && !this.isDead) {
              const thornsDamage = this.damage * playerStats.thornsPercent;
              this.takeDamage(thornsDamage, false);
              createDamageNumber(thornsDamage, this.mesh.position, false);
              gs.spawnParticles(this.mesh.position, 0xFF6347, 8); // Tomato red thorns
            }
            
            // Slowing enemy slows gs.player on hit
            if (this.type === 3) {
              playerStats.walkSpeed *= this.slowAmount;
              // Remove slow after duration
              setTimeout(() => {
                playerStats.walkSpeed /= this.slowAmount;
              }, this.slowDuration);
              // Visual effect for slow
              gs.spawnParticles(gs.player.mesh.position, 0x00FFFF, 10);
            }
          }
          
          // Knockback (always apply to prevent gs.enemies from stacking)
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
        gs.scene.add(projectile.mesh);
        
        // Direction
        const dx = targetPos.x - this.mesh.position.x;
        const dz = targetPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        projectile.direction = new THREE.Vector3(dx/dist, 0, dz/dist);
        
        // Add to gs.projectiles array (will be updated in main loop)
        gs.projectiles.push(projectile);
        
        playSound('shoot');
      }

      /**
       * Apply damage to the enemy
       * @param {number} amount - Damage amount
       * @param {boolean} isCrit - Whether this is a critical hit
       * @param {string} damageType - Type of damage: 'physical', 'fire', 'ice', 'lightning', 'shotgun', 'headshot'
       */
      takeDamage(amount, isCrit = false, damageType = 'physical') {
        // Track last damage type for death effects
        this.lastDamageType = damageType;
        
        // Phase 5: Hit impact gs.particles (flesh/blood) on every hit - ENHANCED: Scale with HP remaining
        const hpRatio = this.hp / this.maxHp;
        const bloodParticleCount = Math.max(8, Math.floor((1 - hpRatio) * 22) + 6); // More blood as HP drops - increased intensity
        gs.spawnParticles(this.mesh.position, 0x8B0000, Math.min(bloodParticleCount, 30)); // Blood gs.particles scale with HP loss
        gs.spawnParticles(this.mesh.position, 0x660000, Math.min(Math.floor(bloodParticleCount * 0.6), 14)); // Darker blood
        gs.spawnParticles(this.mesh.position, 0xCC0000, Math.min(Math.floor(bloodParticleCount * 0.3), 8)); // Bright splatter
        // Spawn multiple ground blood decals for more brutal effect
        spawnBloodDecal(this.mesh.position);
        spawnBloodDecal(this.mesh.position); // Always at least 2 decals per hit
        if (hpRatio < 0.5) {
          spawnBloodDecal(this.mesh.position); // Extra decal at half HP
          spawnBloodDecal(this.mesh.position); // Additional splatter
        }
        if (hpRatio < 0.25) {
          spawnBloodDecal(this.mesh.position); // Extra decal at low HP
          spawnBloodDecal(this.mesh.position); // Even more at critical HP
          spawnBloodDecal(this.mesh.position); // Enemy barely alive - covered in blood
        }
        
        // Blood drip: small drops fall from wounded enemy to ground (managed in main loop)
        if (hpRatio < 0.5 && gs.scene && gs.bloodDrips.length < MAX_BLOOD_DRIPS) {
          const dripCount = hpRatio < 0.25 ? 3 : 2; // More drips at low HP
          for (let d = 0; d < dripCount && gs.bloodDrips.length < MAX_BLOOD_DRIPS; d++) {
            const drip = new THREE.Mesh(
              new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 4, 4),
              new THREE.MeshBasicMaterial({ color: 0x8B0000 })
            );
            drip.position.set(
              this.mesh.position.x + (Math.random() - 0.5) * 0.4,
              this.mesh.position.y + (Math.random() - 0.5) * 0.2,
              this.mesh.position.z + (Math.random() - 0.5) * 0.4
            );
            gs.scene.add(drip);
            gs.bloodDrips.push({ mesh: drip, velY: 0, life: 25 + Math.floor(Math.random() * 15) });
          }
        }
        
        // Bullet-hole decal that sticks to enemy surface (visible bloody wound)
        if (!this.bulletHoles) this.bulletHoles = [];
        const MAX_ENEMY_BULLET_HOLES = 8;
        if (this.bulletHoles.length < MAX_ENEMY_BULLET_HOLES) {
          // Reuse shared geometry; clone shared material for per-hole opacity control
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
        
        // Airborne blood splatter - arcs up then falls under gravity (managed in main loop via gs.bloodDrips)
        const burstCount = isCrit ? 3 : 1;
        for (let b = 0; b < burstCount && gs.bloodDrips.length < MAX_BLOOD_DRIPS; b++) {
          const p = new THREE.Mesh(
            new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 4, 4),
            new THREE.MeshBasicMaterial({ color: 0xAA0000 })
          );
          p.position.set(
            this.mesh.position.x + (Math.random() - 0.5) * 0.3,
            this.mesh.position.y + 0.1,
            this.mesh.position.z + (Math.random() - 0.5) * 0.3
          );
          gs.scene.add(p);
          gs.bloodDrips.push({
            mesh: p,
            velY: 0.15 + Math.random() * 0.2, // initial upward burst
            life: 30 + Math.floor(Math.random() * 15)
          });
        }
        
        // Phase 3: Apply armor reduction for MiniBoss
        let finalAmount = amount;
        if (this.armor > 0) {
          finalAmount = amount * (1 - this.armor);
          // Show armor reduction effect
          if (this.isMiniBoss) {
            window.createFloatingText(`-${Math.floor(amount * this.armor)}`, this.mesh.position, '#FFD700');
          }
        }
        
        const oldHp = this.hp;
        this.hp -= finalAmount;
        createDamageNumber(Math.floor(finalAmount), this.mesh.position, isCrit);
        
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
          
          // Blood spots (small red gs.particles)
          gs.spawnParticles(this.mesh.position, 0x8B0000, 10);
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
          
          gs.spawnParticles(this.mesh.position, 0x8B0000, 8); // Reduced for performance
          playSound('hit');
        }
        
        // 25% HP: More limbs fly off, walkSpeed *= 0.6 - ENHANCED
        if (oldHpPercent >= 0.25 && hpPercent < 0.25 && !this.stage3Damage) {
          this.stage3Damage = true;
          
          // Reduce speed
          this.speed *= 0.6;
          
          // Spawn more limb pieces - ENHANCED
          const enemyColor = this.mesh.material.color.getHex();
          for(let i = 0; i < 8; i++) { // Increased from 4 to 8
            const limbSize = Math.random() * 0.2 + 0.2; // Varied limb sizes
            const limb = new THREE.Mesh(
              new THREE.BoxGeometry(limbSize, limbSize * 0.5, limbSize * 0.5),
              new THREE.MeshBasicMaterial({ color: enemyColor })
            );
            limb.position.copy(this.mesh.position);
            gs.scene.add(limb);
            
            const vel = new THREE.Vector3(
              (Math.random() - 0.5) * 0.5, // Increased velocity
              Math.random() * 0.6,
              (Math.random() - 0.5) * 0.5
            );
            
            let life = 60; // Increased lifetime
            const updateLimb = () => {
              life--;
              limb.position.add(vel);
              vel.y -= 0.02; // Gravity
              limb.rotation.x += 0.15;
              limb.rotation.y += 0.15;
              
              if (life <= 0 || limb.position.y < 0) {
                gs.scene.remove(limb);
                limb.geometry.dispose();
                limb.material.dispose();
              } else {
                requestAnimationFrame(updateLimb);
              }
            };
            updateLimb();
          }
          
          gs.spawnParticles(this.mesh.position, enemyColor, 12); // Reduced for performance
          gs.spawnParticles(this.mesh.position, 0x8B0000, 5); // Reduced for performance
          playSound('hit');
        }
        
        // Destruction effect at 20% HP threshold (keep existing behavior)
        if (oldHpPercent >= 0.2 && hpPercent < 0.2 && !this.isDamaged) {
          this.isDamaged = true;
          
          // Visually damage the enemy - make smaller and break off pieces
          const damagePercent = 0.35 + Math.random() * 0.15; // 35-50%
          const newScale = 1 - damagePercent;
          this.mesh.scale.multiplyScalar(newScale);
          
          // Spawn broken pieces
          const enemyColor = this.mesh.material.color.getHex();
          for(let i = 0; i < 5; i++) {
            const piece = new THREE.Mesh(
              new THREE.BoxGeometry(0.2, 0.2, 0.2),
              new THREE.MeshBasicMaterial({ color: enemyColor })
            );
            piece.position.copy(this.mesh.position);
            gs.scene.add(piece);
            
            const vel = new THREE.Vector3(
              (Math.random() - 0.5) * 0.3,
              Math.random() * 0.4,
              (Math.random() - 0.5) * 0.3
            );
            
            let life = 40;
            const updatePiece = () => {
              life--;
              piece.position.add(vel);
              vel.y -= 0.02; // Gravity
              piece.rotation.x += 0.1;
              piece.rotation.y += 0.1;
              
              if (life <= 0 || piece.position.y < 0) {
                gs.scene.remove(piece);
                piece.geometry.dispose();
                piece.material.dispose();
              } else {
                requestAnimationFrame(updatePiece);
              }
            };
            updatePiece();
          }
          
          // Enhanced gs.particles for destruction
          gs.spawnParticles(this.mesh.position, enemyColor, 8); // Reduced for performance
          playSound('hit');
        }
        
        // Enhanced splash gs.particles using enemy's own color
        const enemyColor = this.mesh.material.color.getHex();
        const particleCount = isCrit ? 8 : 3;
        gs.spawnParticles(this.mesh.position, enemyColor, particleCount);
        
        // Additional impact gs.particles
        if (isCrit) {
          gs.spawnParticles(this.mesh.position, enemyColor, 5);
          gs.spawnParticles(this.mesh.position, 0xFFFFFF, 3);
        }
        
        // Enhanced squishy deformation on hit
        const squishScale = isCrit ? 0.7 : 0.85;
        this.mesh.scale.set(squishScale, 1.3, squishScale);
        setTimeout(() => {
          this.mesh.scale.set(1, 1, 1);
        }, 100);

        if (this.hp <= 0) {
          this.die();
        }
      }

      die() {
        this.isDead = true;
        
        // Track kills for active quests
        if (gs.montanaQuest.active) {
          gs.montanaQuest.kills++;
          updateMontanaQuestUI();
        }
        if (gs.eiffelQuest.active) {
          gs.eiffelQuest.kills++;
          updateEiffelQuestUI();
        }
        
        // Determine death effect based on damage type and health when dying
        const damageType = this.lastDamageType || 'physical';
        const enemyColor = this.mesh.material.color.getHex();
        
        // Trigger kill cam effect for varied visual feedback
        triggerKillCam(this.mesh.position, this.isMiniBoss, damageType);
        
        // Special death effects based on damage type
        if (damageType === 'fire') {
          // Fire death: Char and ash
          this.dieByFire(enemyColor);
        } else if (damageType === 'ice') {
          // Ice death: Shatter into ice shards
          this.dieByIce(enemyColor);
        } else if (damageType === 'lightning') {
          // Lightning death: Blackened and smoke
          this.dieByLightning(enemyColor);
        } else if (damageType === 'shotgun') {
          // Shotgun death: Massive gibs explosion
          this.dieByShotgun(enemyColor);
        } else if (damageType === 'headshot') {
          // Headshot: Specific head explosion
          this.dieByHeadshot(enemyColor);
        } else {
          // Standard death (bullet/physical)
          this.dieStandard(enemyColor);
        }
        
        // Flying gs.enemies fall to ground
        if (this.isFlying) {
          const fallDuration = 60;
          let fallTimer = 0;
          const startY = this.mesh.position.y;
          const fallAnim = () => {
            if (fallTimer < fallDuration && this.mesh.parent) {
              fallTimer++;
              this.mesh.position.y = startY * (1 - fallTimer / fallDuration);
              this.mesh.rotation.x += 0.1;
              this.mesh.rotation.z += 0.15;
              requestAnimationFrame(fallAnim);
            }
          };
          fallAnim();
        }
        
        // Screen flash on kill (dopamine boost) - stronger flash for mini-boss
        const flash = document.createElement('div');
        flash.style.position = 'fixed';
        flash.style.top = '0';
        flash.style.left = '0';
        flash.style.width = '100%';
        flash.style.height = '100%';
        flash.style.background = this.isMiniBoss ? 'rgba(255, 215, 0, 0.3)' : 'rgba(255, 255, 255, 0.2)';
        flash.style.pointerEvents = 'none';
        flash.style.zIndex = '500';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), this.isMiniBoss ? 100 : 50);
        
        // DEATH BLOOD BURST - violent explosion of blood gs.particles
        const deathBloodCount = this.isMiniBoss ? 60 : 35; // Enhanced gore
        gs.spawnParticles(this.mesh.position, 0x8B0000, deathBloodCount);
        gs.spawnParticles(this.mesh.position, 0x6B0000, Math.floor(deathBloodCount * 0.7));
        gs.spawnParticles(this.mesh.position, 0xCC0000, Math.floor(deathBloodCount * 0.5)); // Bright red splatter in air
        // Airborne blood droplets that land and form small pools
        const airBloodCount = this.isMiniBoss ? 12 : 6;
        for (let ab = 0; ab < airBloodCount; ab++) {
          const landX = this.mesh.position.x + (Math.random() - 0.5) * 4;
          const landZ = this.mesh.position.z + (Math.random() - 0.5) * 4;
          const delay = 80 + Math.floor(Math.random() * 200);
          setTimeout(() => {
            if (!gs.scene) return;
            const r = 0.15 + Math.random() * 0.25;
            const poolGeo = new THREE.CircleGeometry(r, 8);
            const poolMat = new THREE.MeshStandardMaterial({ color: 0x7A0000, roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.75 });
            const pool = new THREE.Mesh(poolGeo, poolMat);
            pool.rotation.x = -Math.PI / 2;
            pool.position.set(landX, 0.015, landZ);
            gs.scene.add(pool);
            gs.bloodDecals.push(pool);
            // Fade after 8 seconds
            setTimeout(() => {
              let op = 0.75;
              let disposed = false;
              const fade = setInterval(() => {
                if (disposed) { clearInterval(fade); return; }
                op -= 0.025;
                poolMat.opacity = Math.max(0, op);
                if (op <= 0) {
                  clearInterval(fade);
                  disposed = true;
                  if (pool.parent) gs.scene.remove(pool);
                  poolGeo.dispose();
                  poolMat.dispose();
                }
              }, 100);
              pool.userData.fadeInterval = fade; // Store for external cleanup if needed
            }, 8000);
          }, delay);
        }
        for (let db = 0; db < (this.isMiniBoss ? 10 : 6); db++) {
          spawnBloodDecal(this.mesh.position);
        }
        
        gs.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        // Dispose cloned bullet-hole materials to prevent memory leaks
        if (this.bulletHoles) {
          this.bulletHoles.forEach(h => h.material.dispose());
          this.bulletHoles = [];
        }
        // Dispose eye geometry (shared) and materials
        if (this.leftEye) { this.leftEye.material.dispose(); this.leftEye = null; }
        if (this.rightEye) { this.rightEye.material.dispose(); this.rightEye = null; }
        
        // Drop EXP
        const expMultiplier = this.isMiniBoss ? 3 : 1;
        for (let i = 0; i < expMultiplier; i++) {
          spawnExp(this.mesh.position.x, this.mesh.position.z);
        }
        
        // PR #117: Drop GOLD - Reduced drop rate (chest-like rarity), bigger amounts
        let goldAmount = 0;
        let dropChance = 0;
        
        if (this.isMiniBoss) {
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
            } else {
              goldAmount = 5 + Math.floor(Math.random() * 6); // 5-10 gold (was 1-2)
            }
          }
        }
        
        // Only spawn gold if amount > 0
        if (goldAmount > 0) {
          spawnGold(this.mesh.position.x, this.mesh.position.z, goldAmount);
        }
        
        // Phase 1: Gear drop system - gs.enemies have a chance to drop gear
        let gearDropChance = 0;
        if (this.isMiniBoss) {
          gearDropChance = 0.5; // 50% for mini-boss
        } else {
          // Regular enemies: 3-8% chance (scales with enemy type 0-9)
          // Enemy types 0-9 add 0-0.05% additional chance
          gearDropChance = 0.03 + Math.min(this.type * 0.005, 0.05); // 3-8% cap
        }
        
        if (Math.random() < gearDropChance) {
          const newGear = generateRandomGear();
          gs.saveData.inventory.push(newGear);
          saveSaveData();
          
          // Show notification
          const rarityColors = {
            common: '#AAAAAA',
            uncommon: '#00FF00',
            rare: '#5DADE2',
            epic: '#9B59B6',
            legendary: '#F39C12'
          };
          window.createFloatingText(`+${newGear.name}`, this.mesh.position, rarityColors[newGear.rarity] || '#FFFFFF');
          playSound('coin');
          
          console.log('[Phase 1 Gear Drop]', newGear.name, '-', newGear.rarity);
          
          // Quest progression: lake chest quest (triggered by first item collection)
          if (gs.saveData.storyQuests.currentQuest === 'discoverLakeChest' && gs.saveData.inventory.length === 1) {
            // This is the first item - treat it as finding the lake chest
            setTimeout(() => {
              window.progressQuest('discoverLakeChest', true);
            }, 2000); // Small delay to let gs.player see the item notification
          }
        }
        
        playerStats.kills++;
        
        // Tutorial Quest: Track kills this run
        if (gs.saveData.tutorialQuests) {
          gs.saveData.tutorialQuests.killsThisRun = playerStats.kills;
          updateQuestTracker();
          
          // Quest 1: Kill 3 gs.enemies
          const currentQuest = getCurrentQuest();
          if (currentQuest && currentQuest.id === 'quest1_kill3' && playerStats.kills >= 3) {
            window.progressTutorialQuest('quest1_kill3', true);
            // Guard: only set pending notification if quest1 is now in readyToClaim
            if (gs.saveData.tutorialQuests.readyToClaim.includes('quest1_kill3')) {
              gs.saveData.tutorialQuests.pendingMissionNotification = 'quest1_kill3';
            }
          }
          // Quest 6: Kill 10 gs.enemies — notify mid-run when objective reached
          if (currentQuest && currentQuest.id === 'quest6_kill10' && playerStats.kills >= 10 &&
              !gs.saveData.tutorialQuests.readyToClaim.includes('quest6_kill10')) {
            window.showStatChange('⚔️ 10 Kills! Return to camp after this run!');
          }
          // Quest 7 (new): Kill 15 gs.enemies — notify mid-run when objective reached
          if (currentQuest && currentQuest.id === 'quest7_kill10' && playerStats.kills >= 15 &&
              !gs.saveData.tutorialQuests.readyToClaim.includes('quest7_kill10')) {
            window.showStatChange('⚔️ 15 Kills! Return to camp to claim your reward!');
          }
        }
        
        // Track side challenge progress
        if (gs.saveData.sideChallenges.kill10Enemies && !gs.saveData.sideChallenges.kill10Enemies.completed) {
          gs.saveData.sideChallenges.kill10Enemies.progress++;
          if (gs.saveData.sideChallenges.kill10Enemies.progress >= gs.saveData.sideChallenges.kill10Enemies.target) {
            gs.saveData.sideChallenges.kill10Enemies.completed = true;
            // Award gold before saving to prevent loss on crash
            gs.saveData.gold += 50;
            saveSaveData();
            window.createFloatingText("Side Quest Complete: Kill 10 Enemies! +50 Gold", this.mesh.position, '#FFD700');
          }
        }
        
        // Track mini-boss defeats for achievements
        if (this.isMiniBoss) {
          playerStats.miniBossesDefeated++;
          window.createFloatingText("MINI-BOSS DEFEATED! 🏆", this.mesh.position);
        }
        
        if (window.updateHUD) window.updateHUD();
        updateComboCounter(true); // Phase 2: Track combo on kill
        checkAchievements(); // Check for achievements after kill
        // Kill 7 achievement check
        if (playerStats.kills === 7 && (!gs.saveData.achievementQuests || !gs.saveData.achievementQuests.kill7Unlocked)) {
          if (!gs.saveData.achievementQuests) gs.saveData.achievementQuests = { kill7Unlocked: false, kill7Quest: 'none' };
          gs.saveData.achievementQuests.kill7Unlocked = true;
          gs.saveData.achievementQuests.kill7Quest = 'active';
          saveSaveData();
          setGamePaused(true);
          showEnhancedNotification('achievement', '🏆 ACHIEVEMENT UNLOCKED: Kill 7 Enemies!', 'Visit the Achievement Building in Camp to claim your reward!');
          setTimeout(() => { setGamePaused(false); }, 3000);
          updateStatBar();
        }
      }
      
      // Specialized death effects by damage type
      dieStandard(enemyColor) {
        // Phase 5: Death Variety - Multiple death animation variations
        const deathVariation = Math.random();
        
        if (deathVariation < 0.25) {
          // EXPLOSION DEATH: Main explosion (death ring removed per requirements)
          gs.spawnParticles(this.mesh.position, enemyColor, 30);
          gs.spawnParticles(this.mesh.position, 0xFFFFFF, 10);
          gs.spawnParticles(this.mesh.position, 0x8B0000, 25); // More blood
          gs.spawnParticles(this.mesh.position, 0xFF2200, 15); // Bright red gore pieces
          
          // Explode into pieces (NO death ring)
          const pieceCount = this.isMiniBoss ? 40 : 22;
          for(let i = 0; i < pieceCount; i++) {
            const piece = new THREE.Mesh(
              new THREE.BoxGeometry(0.3, 0.3, 0.3),
              new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true })
            );
            piece.position.copy(this.mesh.position);
            gs.scene.add(piece);
            
            const angle = (i / pieceCount) * Math.PI * 2;
            const speed = this.isMiniBoss ? 0.6 : 0.4;
            const vel = new THREE.Vector3(
              Math.cos(angle) * speed,
              0.3 + Math.random() * 0.3,
              Math.sin(angle) * speed
            );
            
            let life = 80;  // Increased from 50 for more visible death animation
            const updatePiece = () => {
              life--;
              piece.position.add(vel);
              vel.y -= 0.02; // Gravity
              piece.rotation.x += 0.15;
              piece.rotation.y += 0.15;
              piece.material.opacity = life / 80;  // Update divisor to match new life
              
              if (life <= 0 || piece.position.y < 0) {
                gs.scene.remove(piece);
                piece.geometry.dispose();
                piece.material.dispose();
              } else {
                requestAnimationFrame(updatePiece);
              }
            };
            updatePiece();
          }
        } else if (deathVariation < 0.5) {
          // CORPSE DEATH: Leave a corpse sprite with blood pool
          gs.spawnParticles(this.mesh.position, enemyColor, 8);
          gs.spawnParticles(this.mesh.position, 0x8B0000, 4);
          
          // Corpse sprite
          const corpseGeo = new THREE.CircleGeometry(0.6, 16);
          const corpseMat = new THREE.MeshBasicMaterial({ 
            color: enemyColor, 
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
          });
          const corpse = new THREE.Mesh(corpseGeo, corpseMat);
          corpse.position.copy(this.mesh.position);
          corpse.position.y = 0.02;
          corpse.rotation.x = -Math.PI / 2;
          gs.scene.add(corpse);
          
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
          gs.scene.add(bloodPool);
          
          // Fade out
          let corpseLife = 180;  // Increased from 120 for longer visible corpse
          const fadeCorpse = () => {
            corpseLife--;
            corpse.material.opacity = (corpseLife / 180) * 0.7;  // Update divisor
            bloodPool.material.opacity = (corpseLife / 180) * 0.5;  // Update divisor
            
            if (corpseLife <= 0) {
              gs.scene.remove(corpse);
              gs.scene.remove(bloodPool);
              corpse.geometry.dispose();
              corpse.material.dispose();
              bloodPool.geometry.dispose();
              bloodPool.material.dispose();
            } else {
              requestAnimationFrame(fadeCorpse);
            }
          };
          fadeCorpse();
        } else if (deathVariation < 0.75) {
          // DISINTEGRATION DEATH: Enemy dissolves into gs.particles
          gs.spawnParticles(this.mesh.position, enemyColor, 30);
          gs.spawnParticles(this.mesh.position, 0x444444, 10); // Dark gs.particles
          
          // Create dissolving pieces that shrink as they fall
          for(let i = 0; i < 12; i++) {
            const piece = new THREE.Mesh(
              new THREE.SphereGeometry(0.15, 8, 8),
              new THREE.MeshBasicMaterial({ color: enemyColor, transparent: true })
            );
            piece.position.copy(this.mesh.position);
            gs.scene.add(piece);
            
            const vel = new THREE.Vector3(
              (Math.random() - 0.5) * 0.2,
              Math.random() * 0.2,
              (Math.random() - 0.5) * 0.2
            );
            
            let life = 40;
            const updatePiece = () => {
              life--;
              piece.position.add(vel);
              vel.y -= 0.01; // Gentle gravity
              piece.scale.multiplyScalar(0.95); // Shrink
              piece.material.opacity = life / 40;
              
              if (life <= 0 || piece.scale.x < 0.01) {
                gs.scene.remove(piece);
                piece.geometry.dispose();
                piece.material.dispose();
              } else {
                requestAnimationFrame(updatePiece);
              }
            };
            updatePiece();
          }
        } else {
          // SPLATTER DEATH: Dramatic blood splatter effect
          gs.spawnParticles(this.mesh.position, 0x8B0000, 25); // Lots of blood
          gs.spawnParticles(this.mesh.position, enemyColor, 10);
          
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
            gs.scene.add(splatter);
            
            // Fade out
            let life = 100;
            const fadeSplatter = () => {
              life--;
              splatter.material.opacity = (life / 100) * 0.6;
              
              if (life <= 0) {
                gs.scene.remove(splatter);
                splatter.geometry.dispose();
                splatter.material.dispose();
              } else {
                requestAnimationFrame(fadeSplatter);
              }
            };
            fadeSplatter();
          }
          
          // Central corpse piece
          const corpse = new THREE.Mesh(
            new THREE.CircleGeometry(0.4, 16),
            new THREE.MeshBasicMaterial({ 
              color: enemyColor, 
              transparent: true,
              opacity: 0.8,
              side: THREE.DoubleSide
            })
          );
          corpse.position.copy(this.mesh.position);
          corpse.position.y = 0.02;
          corpse.rotation.x = -Math.PI / 2;
          gs.scene.add(corpse);
          
          let corpseLife = 120;
          const fadeCorpse = () => {
            corpseLife--;
            corpse.material.opacity = (corpseLife / 120) * 0.8;
            if (corpseLife <= 0) {
              gs.scene.remove(corpse);
              corpse.geometry.dispose();
              corpse.material.dispose();
            } else {
              requestAnimationFrame(fadeCorpse);
            }
          };
          fadeCorpse();
        }
      }
      
      dieByFire(enemyColor) {
        // Fire death: Char and burn to ash
        gs.spawnParticles(this.mesh.position, 0xFF4500, 20); // Orange fire
        gs.spawnParticles(this.mesh.position, 0xFFFF00, 10); // Yellow flames
        gs.spawnParticles(this.mesh.position, 0x222222, 8); // Black smoke
        
        // Charred corpse
        const corpseGeo = new THREE.CircleGeometry(0.6, 16);
        const corpseMat = new THREE.MeshBasicMaterial({ 
          color: 0x222222, // Charred black
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide
        });
        const corpse = new THREE.Mesh(corpseGeo, corpseMat);
        corpse.position.copy(this.mesh.position);
        corpse.position.y = 0.02;
        corpse.rotation.x = -Math.PI / 2;
        gs.scene.add(corpse);
        
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
        gs.scene.add(burnMark);
        
        // Fade to ash
        let life = 120;
        const fadeToAsh = () => {
          life--;
          corpse.material.opacity = (life / 120) * 0.8;
          corpse.scale.multiplyScalar(0.995); // Shrink
          
          if (life <= 0) {
            gs.scene.remove(corpse);
            gs.scene.remove(burnMark);
            corpse.geometry.dispose();
            corpse.material.dispose();
            burnMark.geometry.dispose();
            burnMark.material.dispose();
          } else {
            requestAnimationFrame(fadeToAsh);
          }
        };
        fadeToAsh();
      }
      
      dieByIce(enemyColor) {
        // Ice death: Shatter into ice crystals
        gs.spawnParticles(this.mesh.position, 0x87CEEB, 15); // Light blue ice
        gs.spawnParticles(this.mesh.position, 0xFFFFFF, 12); // White frost
        
        // Shatter into ice shards
        const shardCount = 20;
        for(let i = 0; i < shardCount; i++) {
          const shardGeo = new THREE.ConeGeometry(0.1, 0.3, 4);
          const shardMat = new THREE.MeshBasicMaterial({ 
            color: 0xADD8E6, // Light ice blue
            transparent: true,
            opacity: 0.7
          });
          const shard = new THREE.Mesh(shardGeo, shardMat);
          shard.position.copy(this.mesh.position);
          gs.scene.add(shard);
          
          const angle = (i / shardCount) * Math.PI * 2;
          const vel = new THREE.Vector3(
            Math.cos(angle) * 0.3,
            0.4 + Math.random() * 0.2,
            Math.sin(angle) * 0.3
          );
          
          let life = 60;
          const updateShard = () => {
            life--;
            shard.position.add(vel);
            vel.y -= 0.03; // Gravity
            shard.rotation.x += 0.2;
            shard.rotation.z += 0.15;
            shard.material.opacity = (life / 60) * 0.7;
            
            if (life <= 0 || shard.position.y < 0) {
              gs.scene.remove(shard);
              shard.geometry.dispose();
              shard.material.dispose();
            } else {
              requestAnimationFrame(updateShard);
            }
          };
          updateShard();
        }
      }
      
      dieByLightning(enemyColor) {
        // Lightning death: Blackened and smoking
        gs.spawnParticles(this.mesh.position, 0xFFFF00, 15); // Yellow lightning
        gs.spawnParticles(this.mesh.position, 0xFFFFFF, 10); // White flash
        gs.spawnParticles(this.mesh.position, 0x444444, 8); // Gray smoke
        
        // Blackened corpse
        const corpseGeo = new THREE.CircleGeometry(0.6, 16);
        const corpseMat = new THREE.MeshBasicMaterial({ 
          color: 0x1a1a1a, // Very dark gray
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide
        });
        const corpse = new THREE.Mesh(corpseGeo, corpseMat);
        corpse.position.copy(this.mesh.position);
        corpse.position.y = 0.02;
        corpse.rotation.x = -Math.PI / 2;
        gs.scene.add(corpse);
        
        // Smoke gs.particles rising
        let smokeLife = 80;
        const createSmoke = () => {
          if (smokeLife > 0) {
            smokeLife--;
            const smokeGeo = new THREE.SphereGeometry(0.1, 6, 6);
            const smokeMat = new THREE.MeshBasicMaterial({ 
              color: 0x666666,
              transparent: true,
              opacity: 0.4
            });
            const smoke = new THREE.Mesh(smokeGeo, smokeMat);
            smoke.position.copy(this.mesh.position);
            smoke.position.y = 0.1;
            gs.scene.add(smoke);
            
            let life = 40;
            const updateSmoke = () => {
              life--;
              smoke.position.y += 0.03;
              smoke.position.x += (Math.random() - 0.5) * 0.02;
              smoke.position.z += (Math.random() - 0.5) * 0.02;
              smoke.scale.multiplyScalar(1.03);
              smoke.material.opacity = (life / 40) * 0.4;
              
              if (life <= 0) {
                gs.scene.remove(smoke);
                smoke.geometry.dispose();
                smoke.material.dispose();
              } else {
                requestAnimationFrame(updateSmoke);
              }
            };
            updateSmoke();
            
            setTimeout(createSmoke, 100);
          }
        };
        createSmoke();
        
        // Fade corpse
        let corpseLife = 120;
        const fadeCorpse = () => {
          corpseLife--;
          corpse.material.opacity = (corpseLife / 120) * 0.9;
          
          if (corpseLife <= 0) {
            gs.scene.remove(corpse);
            corpse.geometry.dispose();
            corpse.material.dispose();
          } else {
            requestAnimationFrame(fadeCorpse);
          }
        };
        fadeCorpse();
      }
      
      dieByShotgun(enemyColor) {
        // Shotgun death: Massive explosion of gibs
        gs.spawnParticles(this.mesh.position, enemyColor, 30);
        gs.spawnParticles(this.mesh.position, 0x8B0000, 20); // Lots of blood
        gs.spawnParticles(this.mesh.position, 0xFFFFFF, 10);
        
        // Massive gib explosion
        const gibCount = 40;
        for(let i = 0; i < gibCount; i++) {
          const gibSize = 0.1 + Math.random() * 0.2;
          const gibGeo = new THREE.BoxGeometry(gibSize, gibSize, gibSize);
          const gibMat = new THREE.MeshBasicMaterial({ 
            color: i % 3 === 0 ? 0x8B0000 : enemyColor,
            transparent: true
          });
          const gib = new THREE.Mesh(gibGeo, gibMat);
          gib.position.copy(this.mesh.position);
          gs.scene.add(gib);
          
          const angle = (i / gibCount) * Math.PI * 2;
          const speed = 0.5 + Math.random() * 0.3;
          const vel = new THREE.Vector3(
            Math.cos(angle) * speed,
            0.4 + Math.random() * 0.4,
            Math.sin(angle) * speed
          );
          
          let life = 60;
          const updateGib = () => {
            life--;
            gib.position.add(vel);
            vel.y -= 0.025; // Gravity
            gib.rotation.x += 0.25;
            gib.rotation.y += 0.2;
            gib.material.opacity = life / 60;
            
            if (life <= 0 || gib.position.y < 0) {
              gs.scene.remove(gib);
              gib.geometry.dispose();
              gib.material.dispose();
            } else {
              requestAnimationFrame(updateGib);
            }
          };
          updateGib();
        }
        
        // Large blood pool
        const bloodGeo = new THREE.CircleGeometry(1.2, 16);
        const bloodMat = new THREE.MeshBasicMaterial({ 
          color: 0x8B0000, 
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide
        });
        const bloodPool = new THREE.Mesh(bloodGeo, bloodMat);
        bloodPool.position.copy(this.mesh.position);
        bloodPool.position.y = 0.01;
        bloodPool.rotation.x = -Math.PI / 2;
        gs.scene.add(bloodPool);
        
        // Fade blood
        let life = 150;
        const fadeBlood = () => {
          life--;
          bloodPool.material.opacity = (life / 150) * 0.7;
          
          if (life <= 0) {
            gs.scene.remove(bloodPool);
            bloodPool.geometry.dispose();
            bloodPool.material.dispose();
          } else {
            requestAnimationFrame(fadeBlood);
          }
        };
        fadeBlood();
      }
      
      dieByHeadshot(enemyColor) {
        // FRESH IMPLEMENTATION: Enhanced headshot with actual head detachment
        // Headshot: Dramatic head explosion with visible detached head
        gs.spawnParticles(this.mesh.position, enemyColor, 25);
        gs.spawnParticles(this.mesh.position, 0xDC143C, 20); // Crimson blood (not white!)
        gs.spawnParticles(this.mesh.position, 0x8B0000, 15); // Dark red blood
        gs.spawnParticles(this.mesh.position, 0xFFFFFF, 5);
        
        // Blood stream gs.particles (continuous stream effect)
        for (let i = 0; i < 8; i++) {
          setTimeout(() => {
            const streamPos = this.mesh.position.clone();
            streamPos.y += 0.8;
            gs.spawnParticles(streamPos, 0xDC143C, 5);
          }, i * 50);
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
        gs.scene.add(head);
        
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
        const updateHead = () => {
          headLife--;
          head.position.add(headVel);
          headVel.y -= 0.025; // Gravity
          
          // Enhanced rotation with varying speeds for more dramatic effect
          head.rotation.x += rotSpeed.x;
          head.rotation.y += rotSpeed.y;
          head.rotation.z += rotSpeed.z;
          
          // Blood stream trail from severed neck
          if (headLife % 2 === 0 && headLife > 20) {
            // Crimson blood, not white!
            gs.spawnParticles(head.position, 0xDC143C, 3);
          }
          
          // Fade out near end
          if (headLife < 20) {
            head.material.opacity = headLife / 20;
          }
          
          if (headLife <= 0 || head.position.y < 0) {
            gs.scene.remove(head);
            head.geometry.dispose();
            head.material.dispose();
          } else {
            requestAnimationFrame(updateHead);
          }
        };
        updateHead();
        
        // Body falls (corpse without head)
        const corpseGeo = new THREE.CircleGeometry(0.6, 16);
        const corpseMat = new THREE.MeshBasicMaterial({ 
          color: enemyColor, 
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide
        });
        const corpse = new THREE.Mesh(corpseGeo, corpseMat);
        corpse.position.copy(this.mesh.position);
        corpse.position.y = 0.02;
        corpse.rotation.x = -Math.PI / 2;
        gs.scene.add(corpse);
        
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
        gs.scene.add(bloodPool);
        
        // Extra gore pieces (bone/skull fragments) with proper coloring
        for(let i = 0; i < 12; i++) {
          const pieceSize = 0.1 + Math.random() * 0.1;
          const piece = new THREE.Mesh(
            new THREE.BoxGeometry(pieceSize, pieceSize, pieceSize),
            new THREE.MeshBasicMaterial({ 
              color: i % 3 === 0 ? 0xFFFFFF : (i % 3 === 1 ? 0x8B0000 : enemyColor), 
              transparent: true 
            })
          );
          piece.position.copy(this.mesh.position);
          piece.position.y += 0.5; // Start from head height
          gs.scene.add(piece);
          
          const vel = new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            0.5 + Math.random() * 0.4,
            (Math.random() - 0.5) * 0.5
          );
          
          let life = 60;
          const updatePiece = () => {
            life--;
            piece.position.add(vel);
            vel.y -= 0.03;
            piece.rotation.x += 0.2;
            piece.rotation.y += 0.25;
            piece.material.opacity = life / 60;
            
            if (life <= 0 || piece.position.y < 0) {
              gs.scene.remove(piece);
              piece.geometry.dispose();
              piece.material.dispose();
            } else {
              requestAnimationFrame(updatePiece);
            }
          };
          updatePiece();
        }
        
        // Fade corpse
        let life = 120;
        const fadeCorpse = () => {
          life--;
          corpse.material.opacity = (life / 120) * 0.8;
          bloodPool.material.opacity = (life / 120) * 0.6;
          
          if (life <= 0) {
            gs.scene.remove(corpse);
            gs.scene.remove(bloodPool);
            corpse.geometry.dispose();
            corpse.material.dispose();
            bloodPool.geometry.dispose();
            bloodPool.material.dispose();
          } else {
            requestAnimationFrame(fadeCorpse);
          }
        };
        fadeCorpse();
      }
    }

    // Performance: Cached geometries and materials for gs.projectiles (reused across instances)
    const projectileGeometryCache = {
      bullet: new THREE.SphereGeometry(0.0625, 8, 8),  // 75% smaller radius (0.25 → 0.0625 is 25% of original)
      bulletGlow: new THREE.SphereGeometry(0.0875, 6, 6)  // 75% smaller radius (0.35 → 0.0875 is 25% of original)
    };
    const projectileMaterialCache = {
      bullet: new THREE.MeshBasicMaterial({ 
        color: 0xFF4500,  // Red-orange starting color
        transparent: true,
        opacity: 0.95
      }),
      bulletGlow: new THREE.MeshBasicMaterial({
        color: 0xFF6347,  // Tomato red-orange for glow
        transparent: true,
        opacity: 0.4
      })
    };

    // Phase 5: Companion System - Simplified implementation for stable gameplay
    class Companion {
      constructor(companionId) {
        this.companionId = companionId;
        this.data = COMPANIONS[companionId];
        this.companionData = gs.saveData.companions[companionId];
        
        // Stats based on level
        const isEvolved = this.companionData.level >= 10;
        const stats = isEvolved ? this.data.evolvedStats : this.data.baseStats;
        
        this.damage = stats.damage;
        this.attackSpeed = stats.attackSpeed;
        this.maxHp = stats.health;
        this.hp = this.maxHp;
        this.isDead = false;
        this.respawnTimer = 0;
        this.lastAttackTime = 0;
        
        // Create visual representation
        const icon = isEvolved ? this.data.evolvedIcon : this.data.icon;
        const size = 0.8;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({ 
          color: this.data.type === 'melee' ? 0x8B4513 : 
                 this.data.type === 'ranged' ? 0x4169E1 : 0x00CED1
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        gs.scene.add(this.mesh);
        
        // Position near gs.player
        this.mesh.position.copy(gs.player.mesh.position);
        this.mesh.position.x += 2;
      }
      
      update(dt) {
        if (this.isDead) {
          this.respawnTimer -= dt;
          if (this.respawnTimer <= 0) {
            this.respawn();
          }
          return;
        }
        
        if (!gs.player || !gs.player.mesh) return;
        
        // Follow gs.player with simple AI
        const dx = gs.player.mesh.position.x - this.mesh.position.x;
        const dz = gs.player.mesh.position.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        // Keep distance from gs.player (melee closer, others farther)
        const targetDist = this.data.type === 'melee' ? 2 : 3;
        
        if (dist > targetDist + 0.5) {
          // Move toward gs.player
          const moveSpeed = 0.15;
          this.mesh.position.x += (dx / dist) * moveSpeed;
          this.mesh.position.z += (dz / dist) * moveSpeed;
        } else if (dist < targetDist - 0.5) {
          // Move away from gs.player
          const moveSpeed = 0.1;
          this.mesh.position.x -= (dx / dist) * moveSpeed;
          this.mesh.position.z -= (dz / dist) * moveSpeed;
        }
        
        // Attack nearest enemy
        const now = Date.now();
        if (gs.enemies.length > 0 && now - this.lastAttackTime > this.attackSpeed * 1000) {
          let nearest = null;
          let nearestDist = Infinity;
          
          for (const enemy of gs.enemies) {
            const ex = enemy.mesh.position.x - this.mesh.position.x;
            const ez = enemy.mesh.position.z - this.mesh.position.z;
            const d = ex*ex + ez*ez;
            if (d < nearestDist && d < 100) { // Range check
              nearestDist = d;
              nearest = enemy;
            }
          }
          
          if (nearest) {
            // Attack
            const damageMultiplier = 1 + (this.companionData.level - 1) * 0.1; // +10% per level
            const finalDamage = Math.floor(this.damage * damageMultiplier * playerStats.strength);
            nearest.takeDamage(finalDamage, false);
            gs.spawnParticles(nearest.mesh.position, 0xFF6347, 3);
            this.lastAttackTime = now;
          }
        }
        
        // Bob animation
        this.mesh.position.y = 0.5 + Math.sin(Date.now() * 0.003) * 0.1;
      }
      
      takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
          this.die();
        }
      }
      
      die() {
        this.isDead = true;
        this.mesh.visible = false;
        this.respawnTimer = 10; // 10 second respawn
        window.createFloatingText('Companion down!', this.mesh.position, '#FF6347');
      }
      
      respawn() {
        this.isDead = false;
        this.hp = this.maxHp;
        this.mesh.visible = true;
        this.mesh.position.copy(gs.player.mesh.position);
        this.mesh.position.x += 2;
        window.createFloatingText('Companion respawned!', this.mesh.position, '#00FF00');
      }
      
      addXP(amount) {
        // Companions gain 10% of all XP awarded to the gs.player
        const companionXP = Math.floor(amount * 0.1);
        this.companionData.xp += companionXP;
        
        // Level up check (simplified progression)
        const xpRequired = [0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 4000];
        if (this.companionData.level < 10 && this.companionData.xp >= xpRequired[this.companionData.level]) {
          this.companionData.level++;
          gs.saveData.companions[this.companionId] = this.companionData;
          saveSaveData();
          
          if (this.companionData.level === 10) {
            window.createFloatingText('⭐ COMPANION EVOLVED! ⭐', this.mesh.position, '#FFD700');
            // Update stats to evolved form
            const stats = this.data.evolvedStats;
            this.damage = stats.damage;
            this.attackSpeed = stats.attackSpeed;
            this.maxHp = stats.health;
            this.hp = this.maxHp;
          } else {
            window.createFloatingText(`Level ${this.companionData.level}!`, this.mesh.position, '#00FF00');
          }
        }
      }
      
      destroy() {
        gs.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
      }
    }

    class Projectile {
      constructor(x, z, target) {
        // Performance: Reuse cached geometry but clone materials for independent color transitions
        this.mesh = new THREE.Mesh(
          projectileGeometryCache.bullet, 
          projectileMaterialCache.bullet.clone()  // Clone material for independent color
        );
        this.mesh.position.set(x, 0.5, z);
        gs.scene.add(this.mesh);
        
        // Add glowing trail effect with cloned material
        this.glow = new THREE.Mesh(
          projectileGeometryCache.bulletGlow, 
          projectileMaterialCache.bulletGlow.clone()  // Clone material for independent color
        );
        this.glow.position.copy(this.mesh.position);
        gs.scene.add(this.glow);

        this.speed = 0.5; // Increased from 0.4 (25% faster)
        this.active = true;
        this.life = 60; // Frames
        this.maxLife = 60; // Track max life for color transition
        
        // Piercing support: track gs.enemies already hit
        this.hitEnemies = new Set();
        this.maxHits = (playerStats.pierceCount || 0) + 1; // Total gs.enemies this bullet can hit (1 + pierce count)

        // Calculate direction
        const dx = target.x - x;
        const dz = target.z - z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        this.vx = (dx / dist) * this.speed;
        this.vz = (dz / dist) * this.speed;
      }

      update() {
        if (!this.active) return;
        
        // Handle enemy gs.projectiles separately
        if (this.isEnemyProjectile) {
          this.mesh.position.add(this.direction.clone().multiplyScalar(this.speed));
          this.lifetime--;
          
          if (this.lifetime <= 0) {
            this.destroy();
            return;
          }
          
          // Check collision with gs.player
          const dx = this.mesh.position.x - gs.player.mesh.position.x;
          const dz = this.mesh.position.z - gs.player.mesh.position.z;
          if (dx*dx + dz*dz < 0.8) { // Hit radius
            gs.player.takeDamage(this.damage);
            gs.spawnParticles(gs.player.mesh.position, 0xFF6347, 5);
            this.destroy();
            playSound('hit');
          }
          return;
        }
        
        // Player gs.projectiles
        this.mesh.position.x += this.vx;
        this.mesh.position.z += this.vz;
        
        // Color transition: red-orange (start) → copper (end)
        // Progress: 1.0 (just fired) → 0.0 (about to expire)
        const progress = this.life / this.maxLife;
        
        // Red-orange: 0xFF4500 (RGB: 255, 69, 0)
        // Copper: 0xB87333 (RGB: 184, 115, 51)
        const startColor = { r: 255, g: 69, b: 0 };
        const endColor = { r: 184, g: 115, b: 51 };
        
        const r = Math.floor(startColor.r * progress + endColor.r * (1 - progress));
        const g = Math.floor(startColor.g * progress + endColor.g * (1 - progress));
        const b = Math.floor(startColor.b * progress + endColor.b * (1 - progress));
        
        const currentColor = (r << 16) | (g << 8) | b;
        this.mesh.material.color.setHex(currentColor);
        
        // Update glow position and fade it
        if (this.glow) {
          this.glow.position.copy(this.mesh.position);
          this.glow.material.opacity = 0.4 * (this.life / 60);
          // Also update glow color to match bullet
          this.glow.material.color.setHex(currentColor);
        }
        
        this.life--;

        if (this.life <= 0) {
          this.destroy();
          return;
        }

        // Collision Check - with piercing support
        for (let enemy of gs.enemies) {
          if (enemy.isDead) continue;
          if (this.hitEnemies.has(enemy)) continue; // Skip already-hit gs.enemies
          
          const dx = this.mesh.position.x - enemy.mesh.position.x;
          const dz = this.mesh.position.z - enemy.mesh.position.z;
          if (dx*dx + dz*dz < 0.6) { // Hit radius
            // Calculate Damage
            let dmg = weapons.gun.damage * playerStats.damage * playerStats.strength;
            
            // Double barrel uses its own damage
            if (weapons.doubleBarrel.active && this.isDoubleBarrel) {
              dmg = weapons.doubleBarrel.damage * playerStats.damage * playerStats.strength;
            }
            
            // Drone turret uses its own damage
            if (weapons.droneTurret.active && this.isDroneTurret) {
              dmg = weapons.droneTurret.damage * playerStats.damage * playerStats.strength;
            }
            
            // HEADSHOT SYSTEM: Double-crit check for headshot (instant kill)
            const isCrit = Math.random() < playerStats.critChance;
            const isDoubleCrit = isCrit && Math.random() < playerStats.critChance; // Second crit check
            
            if (isDoubleCrit && playerStats.headshotUnlocked) {
              // HEADSHOT! Instant kill
              enemy.hp = 0;
              
              // Create floating HEADSHOT text - THINNER FONT
              const div = document.createElement('div');
              div.style.position = 'absolute';
              div.style.color = '#FF0000';
              div.style.fontSize = '32px';
              div.style.fontWeight = '500'; // Reduced from 600 to 500 for thinner font
              div.style.fontFamily = 'Bangers, cursive';
              div.style.textShadow = '0 0 20px #FF0000, 2px 2px 4px #000';
              div.style.pointerEvents = 'none';
              div.style.zIndex = '1000';
              div.innerText = 'HEADSHOT!';
              
              const vec = enemy.mesh.position.clone();
              vec.y += 2;
              vec.project(gs.camera);
              
              // Convert NDC (-1 to 1) to screen coordinates (0 to width/height)
              const NDC_CENTER_OFFSET = 0.5; // Offset to center NDC coordinates
              const x = (vec.x * NDC_CENTER_OFFSET + NDC_CENTER_OFFSET) * window.innerWidth;
              const y = (-(vec.y * NDC_CENTER_OFFSET) + NDC_CENTER_OFFSET) * window.innerHeight;
              
              div.style.left = `${x}px`;
              div.style.top = `${y}px`;
              div.style.transform = 'translate(-50%, -50%)';
              
              document.body.appendChild(div);
              setTimeout(() => div.remove(), 1500);
              
              // Blood particle effect
              gs.spawnParticles(enemy.mesh.position, 0x8B0000, 30); // Dark red blood
              gs.spawnParticles(enemy.mesh.position, 0xFF0000, 20); // Bright red blood
              
              // Flash effect
              const headshotLight = new THREE.PointLight(0xFF0000, 12, 20);
              headshotLight.position.copy(enemy.mesh.position);
              headshotLight.position.y += 2;
              gs.scene.add(headshotLight);
              setTimeout(() => {
                gs.scene.remove(headshotLight);
              }, 200);
            } else if (isCrit) {
              // Normal crit
              dmg *= playerStats.critDmg;
              enemy.takeDamage(Math.floor(dmg), isCrit);
              
              // FRESH: Critical hit effects - gold gs.particles, brief light flash
              gs.spawnParticles(enemy.mesh.position, 0xFFD700, 15); // Gold gs.particles
              gs.spawnParticles(enemy.mesh.position, 0xFFA500, 10); // Orange gs.particles
              
              // Brief golden light flash
              const critLight = new THREE.PointLight(0xFFD700, 8, 15);
              critLight.position.copy(enemy.mesh.position);
              critLight.position.y += 1;
              gs.scene.add(critLight);
              setTimeout(() => {
                gs.scene.remove(critLight);
              }, 150);
            } else {
              // Normal hit (explicitly false for clarity)
              enemy.takeDamage(Math.floor(dmg), false);
            }
            
            // Knockback effect - scales with weapon level
            let knockbackForce = 0.5 * (1 + (weapons.gun.level - 1) * 0.25);
            if (weapons.doubleBarrel.active && this.isDoubleBarrel) {
              // Double barrel: heavy knockback with partial topple effect
              knockbackForce = 1.8 * (1 + (weapons.doubleBarrel.level - 1) * 0.2);
              // Topple: tilt enemy mesh briefly on impact
              const toppleAngle = (Math.random() - 0.5) * 0.6;
              enemy.mesh.rotation.x = toppleAngle;
              enemy.mesh.rotation.z = toppleAngle * 0.5;
              setTimeout(() => {
                if (enemy.mesh) { enemy.mesh.rotation.x = 0; enemy.mesh.rotation.z = 0; }
              }, 300);
            }
            enemy.mesh.position.x += this.vx * knockbackForce;
            enemy.mesh.position.z += this.vz * knockbackForce;
            
            // Water splash effect on hit
            gs.spawnParticles(enemy.mesh.position, COLORS.player, 5);
            gs.spawnParticles(enemy.mesh.position, 0xFFFFFF, 3);
            
            // Mark this enemy as hit
            this.hitEnemies.add(enemy);
            
            // Check if bullet should be destroyed or continue piercing
            if (this.hitEnemies.size >= this.maxHits) {
              // Hit maximum number of gs.enemies, destroy bullet
              this.destroy();
              playSound('hit');
              break;
            } else {
              // Continue piercing (haven't reached max hits yet)
              playSound('hit');
              // Don't break - allow bullet to continue
            }
          }
        }
        
        // FRESH IMPLEMENTATION: Destructible Props Collision
        if (window.destructibleProps) {
          for (let prop of window.destructibleProps) {
            if (prop.destroyed) continue;
            const dx = this.mesh.position.x - prop.mesh.position.x;
            const dz = this.mesh.position.z - prop.mesh.position.z;
            if (dx*dx + dz*dz < 1.5) { // Hit radius for props
              // Calculate damage (use base weapon damage)
              let dmg = weapons.gun.damage * playerStats.damage * playerStats.strength * 0.5; // Half damage to props
              
              if (weapons.doubleBarrel.active && this.isDoubleBarrel) {
                dmg = weapons.doubleBarrel.damage * playerStats.damage * playerStats.strength * 0.5;
              }
              
              if (weapons.droneTurret.active && this.isDroneTurret) {
                dmg = weapons.droneTurret.damage * playerStats.damage * playerStats.strength * 0.5;
              }
              
              prop.hp -= dmg;
              
              // Visual damage stages
              const hpPercent = prop.hp / prop.maxHp;
              
              if (hpPercent <= 0.5 && hpPercent > 0.25 && !prop.darkenedStage1) {
                // 50% HP: Darken (only once)
                prop.darkenedStage1 = true;
                if (prop.type === 'tree') {
                  prop.mesh.userData.trunk.material.color.copy(prop.originalColor.trunk).multiplyScalar(0.8);
                  prop.mesh.userData.leaves.material.color.copy(prop.originalColor.leaves).multiplyScalar(0.8);
                } else {
                  prop.mesh.material.color.copy(prop.originalColor).multiplyScalar(0.8);
                }
              } else if (hpPercent <= 0.25 && hpPercent > 0 && !prop.darkenedStage2) {
                // 25% HP: Darken more + Shrink (only once)
                prop.darkenedStage2 = true;
                if (prop.type === 'tree') {
                  prop.mesh.userData.trunk.material.color.copy(prop.originalColor.trunk).multiplyScalar(0.6);
                  prop.mesh.userData.leaves.material.color.copy(prop.originalColor.leaves).multiplyScalar(0.6);
                } else {
                  prop.mesh.material.color.copy(prop.originalColor).multiplyScalar(0.6);
                }
                prop.mesh.scale.copy(prop.originalScale).multiplyScalar(0.8);
              } else if (prop.hp <= 0) {
                // 0 HP: Destroy with debris
                prop.destroyed = true;
                
                // Explosion effect based on type
                if (prop.type === 'barrel') {
                  // Barrel explodes
                  gs.spawnParticles(prop.mesh.position, 0xFF4500, 30); // Orange explosion
                  gs.spawnParticles(prop.mesh.position, 0xFFFF00, 15); // Yellow fire
                  playSound('hit');
                } else if (prop.type === 'tree') {
                  // Tree breaks apart
                  gs.spawnParticles(prop.mesh.position, 0x8B4513, 20); // Brown wood
                  gs.spawnParticles(prop.mesh.position, 0x228B22, 15); // Green leaves
                } else if (prop.type === 'crate') {
                  // Crate breaks
                  gs.spawnParticles(prop.mesh.position, 0xD2691E, 20); // Wood gs.particles
                }
                
                // Remove from gs.scene
                gs.scene.remove(prop.mesh);
                if (prop.mesh.userData.trunk) {
                  prop.mesh.userData.trunk.geometry.dispose();
                  prop.mesh.userData.trunk.material.dispose();
                  prop.mesh.userData.leaves.geometry.dispose();
                  prop.mesh.userData.leaves.material.dispose();
                } else {
                  prop.mesh.geometry.dispose();
                  prop.mesh.material.dispose();
                }
              } else {
                // Tree movement on hit (shake/sway from impact)
                if (prop.type === 'tree' && prop.mesh.userData.swayPhase !== undefined) {
                  // Add extra sway from bullet impact
                  prop.mesh.userData.swayAmount = Math.min(0.3, prop.mesh.userData.swayAmount + 0.1);
                  // Gradually reduce sway back to normal
                  setTimeout(() => {
                    if (!prop.destroyed && prop.mesh.userData.swayAmount) {
                      prop.mesh.userData.swayAmount = Math.max(0.05, prop.mesh.userData.swayAmount - 0.05);
                    }
                  }, 500);
                }
              }
              
              // Small particle effect on hit
              gs.spawnParticles(prop.mesh.position, 0x888888, 3);
              
              this.destroy();
              break;
            }
          }
        }
        
        // FRESH: Fence collision - fences can be damaged and broken by bullets
        if (window.breakableFences) {
          for (let fence of window.breakableFences) {
            if (!fence.userData.isFence || fence.userData.hp <= 0) continue;
            const dx = this.mesh.position.x - fence.position.x;
            const dz = this.mesh.position.z - fence.position.z;
            if (dx*dx + dz*dz < 1.5) { // Hit radius
              // Damage fence
              const dmg = weapons.gun.damage * 0.3; // Fences take less damage
              fence.userData.hp -= dmg;
              
              // Shake effect on hit
              fence.rotation.x = (Math.random() - 0.5) * 0.3;
              fence.rotation.z = (Math.random() - 0.5) * 0.3;
              
              // Visual damage
              const hpPercent = fence.userData.hp / fence.userData.maxHp;
              if (hpPercent < 0.5) {
                fence.material.color.setHex(0x654321); // Darken when damaged
              }
              
              if (fence.userData.hp <= 0) {
                // Fence broken! Create debris
                gs.spawnParticles(fence.position, 0x8B4513, 15); // Brown wood debris
                gs.spawnParticles(fence.position, 0x654321, 10);
                
                // Animate fence falling
                const fallDirection = Math.random() < 0.5 ? 1 : -1;
                const startRotX = fence.rotation.x;
                const fallDuration = 500;
                const fallStart = Date.now();
                
                const fallInterval = setInterval(() => {
                  const elapsed = Date.now() - fallStart;
                  const progress = Math.min(elapsed / fallDuration, 1);
                  fence.rotation.x = startRotX + (Math.PI / 2) * progress * fallDirection;
                  fence.position.y = 1 - progress * 0.8; // Sink down
                  
                  if (progress >= 1) {
                    clearInterval(fallInterval);
                    gs.scene.remove(fence);
                    fence.geometry.dispose();
                    fence.material.dispose();
                  }
                }, 16);
              }
              
              // Bullet destroyed on fence hit
              this.destroy();
              playSound('hit');
              break;
            }
          }
        }
      }

      destroy() {
        this.active = false;
        gs.scene.remove(this.mesh);
        // Dispose cloned materials (not geometry, which is shared)
        if (this.mesh.material) {
          this.mesh.material.dispose();
        }
        
        // Remove glow if it exists
        if (this.glow) {
          gs.scene.remove(this.glow);
          // Dispose cloned glow material
          if (this.glow.material) {
            this.glow.material.dispose();
          }
        }
      }
    }

    class SwordSlash {
      constructor(x, z, angle) {
        // Arc geometry
        const geometry = new THREE.RingGeometry(1.5, 2.5, 8, 1, -Math.PI/4, Math.PI/2);
        const material = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.rotation.z = angle - Math.PI/4; // Adjust for arc center
        this.mesh.position.set(x, 0.6, z);
        gs.scene.add(this.mesh);
        
        this.life = 10; // frames
        this.maxLife = 10;
        
        // Deal damage immediately
        const dmg = weapons.sword.damage * playerStats.strength * playerStats.damage;
        
        gs.enemies.forEach(e => {
          const dx = e.mesh.position.x - x;
          const dz = e.mesh.position.z - z;
          const dist = Math.sqrt(dx*dx + dz*dz);
          
          if (dist < 3.5) {
            // Check angle
            const eAngle = Math.atan2(dz, dx); // -PI to PI
            // Normalize angles
            let diff = eAngle - angle;
            while (diff < -Math.PI) diff += Math.PI*2;
            while (diff > Math.PI) diff -= Math.PI*2;
            
            if (Math.abs(diff) < Math.PI/3) {
              e.takeDamage(dmg);
            }
          }
        });
      }
      
      update() {
        this.life--;
        this.mesh.material.opacity = this.life / this.maxLife;
        if (this.life <= 0) {
          gs.scene.remove(this.mesh);
          this.mesh.geometry.dispose();
          this.mesh.material.dispose();
          return false;
        }
        return true;
      }
    }

    class IceSpear {
      constructor(x, z, target) {
        // Ice spear shape - elongated diamond
        const geometry = new THREE.ConeGeometry(0.15, 0.6, 4);
        const material = new THREE.MeshBasicMaterial({ color: 0x87CEEB, transparent: true, opacity: 0.9 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, 0.5, z);
        gs.scene.add(this.mesh);

        this.speed = 0.35;
        this.active = true;
        this.life = 70; // Frames - longer range than normal projectile

        // Calculate direction
        const dx = target.x - x;
        const dz = target.z - z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        this.vx = (dx / dist) * this.speed;
        this.vz = (dz / dist) * this.speed;
        
        // Rotate spear to face direction
        this.mesh.rotation.z = -Math.atan2(dz, dx) + Math.PI/2;
        this.mesh.rotation.x = Math.PI/2;
        
        // Trailing gs.particles
        this.particleTimer = 0;
      }

      update() {
        if (!this.active) return false;
        
        this.mesh.position.x += this.vx;
        this.mesh.position.z += this.vz;
        this.life--;
        
        // Ice trail gs.particles
        this.particleTimer++;
        if (this.particleTimer % 3 === 0) {
          gs.spawnParticles(this.mesh.position, 0x87CEEB, 2);
        }

        if (this.life <= 0) {
          this.destroy();
          return false;
        }

        // Collision Check
        for (let enemy of gs.enemies) {
          if (enemy.isDead) continue;
          const dx = this.mesh.position.x - enemy.mesh.position.x;
          const dz = this.mesh.position.z - enemy.mesh.position.z;
          if (dx*dx + dz*dz < 0.6) {
            // Calculate Damage
            let dmg = weapons.iceSpear.damage * playerStats.damage * playerStats.strength;
            const isCrit = Math.random() < playerStats.critChance;
            if (isCrit) dmg *= playerStats.critDmg;
            
            enemy.takeDamage(Math.floor(dmg), isCrit);
            
            // Apply slow effect
            if (!enemy.slowedUntil || enemy.slowedUntil < Date.now()) {
              enemy.originalSpeed = enemy.speed;
            }
            enemy.slowedUntil = Date.now() + weapons.iceSpear.slowDuration;
            enemy.speed = enemy.originalSpeed * (1 - weapons.iceSpear.slowPercent);
            
            // Ice impact gs.particles
            gs.spawnParticles(enemy.mesh.position, 0x87CEEB, 8);
            gs.spawnParticles(enemy.mesh.position, 0xFFFFFF, 5);
            
            // Visual ice effect on enemy
            if (enemy.mesh.material.color) {
              const originalColor = enemy.mesh.material.color.getHex();
              enemy.mesh.material.color.setHex(0xADD8E6); // Light blue
              setTimeout(() => {
                if (enemy.mesh.material.color) {
                  enemy.mesh.material.color.setHex(originalColor);
                }
              }, 200);
            }
            
            this.destroy();
            playSound('hit');
            break;
          }
        }
        return true;
      }

      destroy() {
        this.active = false;
        gs.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
      }
    }

    class Meteor {
      constructor(targetX, targetZ) {
        this.target = new THREE.Vector3(targetX, 0, targetZ);
        
        // Falling sphere
        const geo = new THREE.DodecahedronGeometry(1.5);
        const mat = new THREE.MeshToonMaterial({ color: 0xFF4500, emissive: 0x8B0000 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(targetX, 20, targetZ);
        gs.scene.add(this.mesh);
        
        // Shadow indicator
        const shadowGeo = new THREE.CircleGeometry(2.5, 16);
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.3, transparent: true });
        this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
        this.shadow.rotation.x = -Math.PI/2;
        this.shadow.position.set(targetX, 0.1, targetZ);
        gs.scene.add(this.shadow);
        
        this.speed = 0.5;
        this.active = true;
      }
      
      update() {
        if (!this.active) return false;
        
        this.mesh.position.y -= this.speed;
        this.speed += 0.05; // Gravity
        
        if (this.mesh.position.y <= 0) {
          this.explode();
          return false;
        }
        return true;
      }
      
      explode() {
        this.active = false;
        gs.scene.remove(this.mesh);
        gs.scene.remove(this.shadow);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.shadow.geometry.dispose();
        this.shadow.material.dispose();
        
        // AOE Damage with knockback
        const range = weapons.meteor.area;
        const dmg = weapons.meteor.damage * playerStats.strength;
        
        gs.enemies.forEach(e => {
          const d = e.mesh.position.distanceTo(this.target);
          if (d < range) {
            e.takeDamage(dmg);
            
            // Apply knockback to gs.enemies
            const knockbackDir = new THREE.Vector3(
              e.mesh.position.x - this.target.x,
              0,
              e.mesh.position.z - this.target.z
            ).normalize();
            
            // Knockback strength inversely proportional to distance
            const knockbackStrength = (1 - d / range) * GAME_CONFIG.meteorKnockbackMultiplier;
            e.mesh.position.x += knockbackDir.x * knockbackStrength;
            e.mesh.position.z += knockbackDir.z * knockbackStrength;
            
            // Add visual bounce effect
            const originalY = e.mesh.position.y;
            e.mesh.position.y = originalY + 0.5 * (1 - d / range);
            setTimeout(() => {
              e.mesh.position.y = originalY;
            }, 200);
          }
        });
        
        // Enhanced visuals - thinner, more realistic explosion
        gs.spawnParticles(this.target, 0xFF4500, 8); // Reduced count for thinner look
        gs.spawnParticles(this.target, 0xFFFF00, 4);
        gs.spawnParticles(this.target, 0xFF8C00, 6); // Dark orange
        spawnMuzzleSmoke(this.target, 10); // Add smoke cloud
        
        // Camera shake for explosion
        const shakeIntensity = GAME_CONFIG.explosionShakeIntensity;
        const originalCameraPos = gs.camera.position.clone();
        let shakeTime = 0;
        const shakeDuration = 0.3;
        
        const shakeAnim = () => {
          shakeTime += 0.016;
          if (shakeTime < shakeDuration) {
            const intensity = (1 - shakeTime / shakeDuration) * shakeIntensity;
            gs.camera.position.x = originalCameraPos.x + (Math.random() - 0.5) * intensity;
            gs.camera.position.y = originalCameraPos.y + (Math.random() - 0.5) * intensity;
            gs.camera.position.z = originalCameraPos.z + (Math.random() - 0.5) * intensity;
            requestAnimationFrame(shakeAnim);
          } else {
            gs.camera.position.copy(originalCameraPos);
          }
        };
        shakeAnim();
        
        playSound('meteor'); // Explosive boom sound
      }
    }

    // Phase 5: Object Pooling System for Particles (Performance Critical)
    class ObjectPool {
      constructor(createFn, resetFn, initialSize = 100) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.pool = [];
        this.activeSet = new Set(); // Use Set for O(1) lookups instead of array
        
        // Pre-allocate initial pool
        for (let i = 0; i < initialSize; i++) {
          this.pool.push(this.createFn());
        }
      }
      
      get() {
        let obj;
        if (this.pool.length > 0) {
          obj = this.pool.pop();
        } else {
          obj = this.createFn();
        }
        this.activeSet.add(obj);
        return obj;
      }
      
      release(obj) {
        if (this.activeSet.has(obj)) {
          this.activeSet.delete(obj);
          this.resetFn(obj);
          this.pool.push(obj);
        }
      }
      
      clear() {
        // Clean up all objects
        for (const obj of this.activeSet) {
          if (obj.mesh && obj.mesh.parent) {
            gs.scene.remove(obj.mesh);
          }
        }
        this.activeSet.clear();
      }
    }

    class Particle {
      static MAX_LIFETIME = 28; // Lifetime in frames before removal
      static INITIAL_OPACITY = 0.92; // Maximum opacity for gs.particles
      static VEL_XZ_RANGE = 0.35; // Horizontal velocity spread
      static VEL_Y_MIN = 0.08;    // Minimum upward velocity
      static VEL_Y_RANGE = 0.5;   // Additional random upward velocity
      
      constructor(pos, color) {
        const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
        const mat = new THREE.MeshStandardMaterial({ 
          color: color,
          transparent: true,
          opacity: Particle.INITIAL_OPACITY,
          emissive: color,
          emissiveIntensity: 0.5,
          roughness: 0.5,
          metalness: 0.15
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(pos);
        
        this.vel = new THREE.Vector3(
          (Math.random() - 0.5) * Particle.VEL_XZ_RANGE,
          Particle.VEL_Y_MIN + Math.random() * Particle.VEL_Y_RANGE,
          (Math.random() - 0.5) * Particle.VEL_XZ_RANGE
        );
        
        gs.scene.add(this.mesh);
        this.life = Particle.MAX_LIFETIME;
      }
      
      reset(pos, color) {
        // Reuse existing particle
        this.mesh.position.copy(pos);
        this.mesh.material.color.setHex(color);
        this.mesh.material.emissive.setHex(color);
        // Blood gs.particles (dark red) get smaller, faster, more splatter-like behavior
        const isBlood = (color === 0x8B0000 || color === 0x6B0000);
        const velScale = isBlood ? 1.5 : 1.0;
        this.vel.set(
          (Math.random() - 0.5) * Particle.VEL_XZ_RANGE * velScale,
          (isBlood ? 0.05 : Particle.VEL_Y_MIN) + Math.random() * Particle.VEL_Y_RANGE * (isBlood ? 0.5 : 1.0),
          (Math.random() - 0.5) * Particle.VEL_XZ_RANGE * velScale
        );
        // Blood gs.particles should be smaller scale
        const sizeScale = isBlood ? 0.4 + Math.random() * 0.4 : 1.0;
        this.mesh.scale.setScalar(sizeScale);
        this.mesh.rotation.set(0, 0, 0);
        this.mesh.visible = true;
        gs.scene.add(this.mesh);
        this.life = isBlood ? Math.floor(Particle.MAX_LIFETIME * 0.6) : Particle.MAX_LIFETIME;
      }
      
      update() {
        this.life--;
        this.mesh.position.add(this.vel);
        this.vel.y -= 0.02; // Gravity
        this.mesh.rotation.x += 0.1;
        this.mesh.rotation.y += 0.1;
        
        // Fade out based on life remaining (more realistic smoke/fog effect)
        this.mesh.material.opacity = (this.life / Particle.MAX_LIFETIME) * Particle.INITIAL_OPACITY;
        
        if (this.mesh.position.y < 0) {
          this.mesh.position.y = 0;
          this.vel.y = 0;
          this.vel.x *= 0.8;
          this.vel.z *= 0.8;
        }
        
        if (this.life <= 0) {
          gs.scene.remove(this.mesh);
          this.mesh.visible = false;
          this.mesh.scale.setScalar(1); // Reset scale for pool reuse
          return false;
        }
        return true;
      }
      
      dispose() {
        // Only called on final cleanup
        if (this.mesh) {
          gs.scene.remove(this.mesh);
          this.mesh.geometry.dispose();
          this.mesh.material.dispose();
        }
      }
    }

    // Shared star geometry for all ExpGem instances (created once, reused for performance)

    class ExpGem {
      constructor(x, z) {
        // Use shared star geometry (created once)
        if (!gs._expGemStarGeometry) {
          const starPoints = 5;
          const outerR = 0.28;
          const innerR = 0.12;
          const starShape = new THREE.Shape();
          for (let i = 0; i < starPoints * 2; i++) {
            const angle = (i / (starPoints * 2)) * Math.PI * 2 - Math.PI / 2;
            const r = i % 2 === 0 ? outerR : innerR;
            if (i === 0) starShape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
            else starShape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
          }
          starShape.closePath();
          const extrudeSettings = { depth: 0.10, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 };
          gs._expGemStarGeometry = new THREE.ExtrudeGeometry(starShape, extrudeSettings);
          gs._expGemStarGeometry.center();
          gs._expGemStarMaterial = new THREE.MeshStandardMaterial({
            color: 0x1E90FF,      // SM64-style blue star
            emissive: 0x0055CC,   // Deep blue glow
            emissiveIntensity: 0.7,
            metalness: 0.5,
            roughness: 0.2
          });
        }

        // Each gem gets its own material clone for per-instance emissive animation
        const starMaterial = gs._expGemStarMaterial.clone();

        this.mesh = new THREE.Mesh(gs._expGemStarGeometry, starMaterial);
        this.mesh.position.set(x, 0.5, z);

        // SM64-style: add black outline ring and yellow-edge highlight using a slightly larger dark mesh
        const outlineGeo = new THREE.ExtrudeGeometry((() => {
          const s = new THREE.Shape();
          const pts = 5, outerO = 0.33, innerO = 0.14;
          for (let i = 0; i < pts * 2; i++) {
            const ang = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
            const r = i % 2 === 0 ? outerO : innerO;
            if (i === 0) s.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
            else s.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
          }
          s.closePath();
          return s;
        })(), { depth: 0.08, bevelEnabled: false });
        outlineGeo.center();
        const outlineMesh = new THREE.Mesh(outlineGeo, new THREE.MeshBasicMaterial({ color: 0x000000 }));
        outlineMesh.position.z = -0.01;
        this.mesh.add(outlineMesh);

        gs.scene.add(this.mesh);

        this.active = true;
        // Spin fast on Y axis (star spinning over its axis as required)
        this.rotSpeedY = (Math.random() * 0.15 + 0.10) * (Math.random() < 0.5 ? 1 : -1);
        this.bobPhase = Math.random() * Math.PI * 2;
        this.sparklePhase = Math.random() * Math.PI * 2;
        this.value = GAME_CONFIG.expValue;
      }

      update(playerPos) {
        if (!this.active) return;

        // Spin star over its Y axis (fast)
        this.mesh.rotation.y += this.rotSpeedY;

        // Bob up and down
        this.bobPhase += 0.05;
        this.mesh.position.y = 0.5 + Math.sin(this.bobPhase) * 0.1;
        
        // Pulsing gold glow
        this.sparklePhase += 0.1;
        this.mesh.material.emissiveIntensity = 0.5 + Math.sin(this.sparklePhase) * 0.3;

        // Magnet
        const dx = playerPos.x - this.mesh.position.x;
        const dz = playerPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        if (dist < gs.magnetRange) { // Use gs.magnetRange variable
          this.mesh.position.x += (dx / dist) * 0.3;
          this.mesh.position.z += (dz / dist) * 0.3;
          
          // Visual Trail when pulled - blue gs.particles with sparkle (PR #117)
          if (Math.random() < 0.3) {
             gs.spawnParticles(this.mesh.position, 0x3498DB, 1);
          }
        }

        if (dist < 0.8) { // Collect
          this.collect();
        }
      }

      collect() {
        this.active = false;
        
        // SPLASH EFFECT when collected - blue star-burst (PR #117)
        const splashPos = this.mesh.position.clone();
        const SPLASH_PARTICLE_COUNT = 20;
        
        // Blue star-shaped splash gs.particles
        for(let i=0; i<SPLASH_PARTICLE_COUNT; i++) {
          const angle = (i / SPLASH_PARTICLE_COUNT) * Math.PI * 2;
          const speed = 0.15 + Math.random() * 0.2;
          const particle = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 8, 8),
            new THREE.MeshBasicMaterial({ 
              color: 0x3498DB, // Blue color (PR #117)
              transparent: true, 
              opacity: 0.9
            })
          );
          particle.position.copy(splashPos);
          gs.scene.add(particle);
          
          const vel = new THREE.Vector3(
            Math.cos(angle) * speed,
            0.2 + Math.random() * 0.15,
            Math.sin(angle) * speed
          );
          
          let life = 30;
          const updateParticle = () => {
            life--;
            particle.position.add(vel);
            vel.y -= 0.02; // Gravity
            particle.material.opacity = life / 30;
            
            if (life <= 0 || particle.position.y < 0.05) {
              gs.scene.remove(particle);
              particle.geometry.dispose();
              particle.material.dispose();
            } else {
              requestAnimationFrame(updateParticle);
            }
          };
          updateParticle();
        }
        
        // Screen flash effect - blue tint (PR #117)
        const flash = document.createElement('div');
        flash.style.position = 'fixed';
        flash.style.top = '0';
        flash.style.left = '0';
        flash.style.width = '100%';
        flash.style.height = '100%';
        flash.style.background = 'rgba(52, 152, 219, 0.2)'; // Blue flash
        flash.style.pointerEvents = 'none';
        flash.style.zIndex = '500';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 100);
        
        gs.scene.remove(this.mesh);
        // Geometry is shared across all ExpGem instances - do not dispose it
        this.mesh.material.dispose(); // Only dispose the per-instance cloned material
        
        addExp(this.value);
        playSound('collect');
      }
    }
    // Different gold drop types based on amount
    class GoldCoin {
      constructor(x, z, amount) {
        this.amount = amount;
        this.active = true;
        this.magnetRange = 4;
        this.collectRange = 0.8;
        this.vx = 0;
        this.vz = 0;
        this.wobblePhase = Math.random() * Math.PI * 2;
        this.bounceTime = 0;
        
        // Create appropriate visual based on amount
        if (amount >= 50) {
          // 50+ gold: Gold chest glowing from inside
          this.createGoldChest(x, z);
        } else if (amount >= 25) {
          // 25+ gold: Leather bag with knot
          this.createLeatherBag(x, z);
        } else if (amount >= 10) {
          // 10 coins: 3 spinning coins around center
          this.createMultipleCoins(x, z, 3);
        } else {
          // 5 coins: 1 spinning gold coin
          this.createSingleCoin(x, z);
        }
        
        // Play gold drop sound
        playSound('coinDrop');
        
        // Spawn sparkles on creation
        gs.spawnParticles(this.mesh ? this.mesh.position : new THREE.Vector3(x, 0.3, z), 0xFFD700, 8);
        gs.spawnParticles(this.mesh ? this.mesh.position : new THREE.Vector3(x, 0.3, z), 0xFFFFFF, 2);
      }
      
      createSingleCoin(x, z) {
        // Single large spinning coin
        const geometry = new THREE.CylinderGeometry(0.3, 0.3, 0.12, 16);
        const material = new THREE.MeshPhysicalMaterial({ 
          color: 0xFFD700,
          transparent: true,
          opacity: 0.95,
          metalness: 0.9,
          roughness: 0.1,
          emissive: 0xFFAA00,
          emissiveIntensity: 0.3
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, 0.4, z);
        this.mesh.rotation.x = Math.PI / 2;
        gs.scene.add(this.mesh);
        this.type = 'single';
      }
      
      createMultipleCoins(x, z, count) {
        // Multiple coins orbiting around center
        this.coins = [];
        this.centerPos = new THREE.Vector3(x, 0.4, z);
        const radius = 0.4;
        
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const geometry = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 12);
          const material = new THREE.MeshPhysicalMaterial({ 
            color: 0xFFD700,
            transparent: true,
            opacity: 0.95,
            metalness: 0.9,
            roughness: 0.1,
            emissive: 0xFFAA00,
            emissiveIntensity: 0.3
          });
          const coin = new THREE.Mesh(geometry, material);
          coin.position.set(
            x + Math.cos(angle) * radius,
            0.4,
            z + Math.sin(angle) * radius
          );
          coin.rotation.x = Math.PI / 2;
          gs.scene.add(coin);
          this.coins.push({ mesh: coin, angle: angle });
        }
        this.mesh = this.coins[0].mesh; // Reference for position
        this.type = 'multiple';
        this.orbitSpeed = 0.05;
      }
      
      createLeatherBag(x, z) {
        // Leather bag with knot - using sphere for bag, smaller sphere for knot
        const group = new THREE.Group();
        
        // Bag body
        const bagGeo = new THREE.SphereGeometry(0.35, 16, 16);
        bagGeo.scale(1, 1.2, 1); // Slightly taller
        const bagMat = new THREE.MeshPhysicalMaterial({ 
          color: 0x8B4513, // Brown leather
          transparent: true,
          opacity: 0.95,
          metalness: 0.1,
          roughness: 0.9
        });
        const bag = new THREE.Mesh(bagGeo, bagMat);
        bag.position.y = 0;
        group.add(bag);
        
        // Knot at top
        const knotGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const knotMat = new THREE.MeshBasicMaterial({ color: 0x654321 }); // Darker brown
        const knot = new THREE.Mesh(knotGeo, knotMat);
        knot.position.y = 0.35;
        group.add(knot);
        
        // Gold coins texture (simple circles on the bag)
        const coinGeo = new THREE.CircleGeometry(0.08, 8);
        const coinMat = new THREE.MeshBasicMaterial({ 
          color: 0xFFD700,
          side: THREE.DoubleSide
        });
        for (let i = 0; i < 3; i++) {
          const coin = new THREE.Mesh(coinGeo, coinMat);
          const angle = (i / 3) * Math.PI * 2;
          coin.position.set(
            Math.cos(angle) * 0.25,
            -0.1 + Math.random() * 0.2,
            Math.sin(angle) * 0.25
          );
          coin.lookAt(group.position);
          group.add(coin);
        }
        
        group.position.set(x, 0.4, z);
        gs.scene.add(group);
        this.mesh = group;
        this.type = 'bag';
      }
      
      createGoldChest(x, z) {
        // Gold chest glowing from inside
        const group = new THREE.Group();
        
        // Chest body
        const chestGeo = new THREE.BoxGeometry(0.5, 0.4, 0.4);
        const chestMat = new THREE.MeshPhysicalMaterial({ 
          color: 0xFFD700,
          transparent: true,
          opacity: 0.95,
          metalness: 0.9,
          roughness: 0.2,
          emissive: 0xFFD700,
          emissiveIntensity: 0.5
        });
        const chest = new THREE.Mesh(chestGeo, chestMat);
        chest.position.y = 0;
        group.add(chest);
        
        // Chest lid (slightly open)
        const lidGeo = new THREE.BoxGeometry(0.52, 0.1, 0.42);
        const lidMat = new THREE.MeshPhysicalMaterial({ 
          color: 0xDAA520, // Goldenrod
          metalness: 0.8,
          roughness: 0.3,
          emissive: 0xFFD700,
          emissiveIntensity: 0.3
        });
        const lid = new THREE.Mesh(lidGeo, lidMat);
        lid.position.set(0, 0.25, -0.1);
        lid.rotation.x = -0.3; // Slightly open
        group.add(lid);
        
        // Inner glow light
        const glowLight = new THREE.PointLight(0xFFD700, 2, 3);
        glowLight.position.set(0, 0.1, 0);
        group.add(glowLight);
        this.glowLight = glowLight;
        
        group.position.set(x, 0.4, z);
        gs.scene.add(group);
        this.mesh = group;
        this.type = 'chest';
      }
      
      update(playerPos) {
        if (!this.active) return;
        
        // Type-specific animations
        if (this.type === 'single') {
          // Single coin spinning
          this.mesh.rotation.y += 0.15;
        } else if (this.type === 'multiple') {
          // Multiple coins orbiting and spinning
          this.coins.forEach((coinData, i) => {
            coinData.angle += this.orbitSpeed;
            const radius = 0.4;
            coinData.mesh.position.x = this.centerPos.x + Math.cos(coinData.angle) * radius;
            coinData.mesh.position.z = this.centerPos.z + Math.sin(coinData.angle) * radius;
            coinData.mesh.rotation.y += 0.15;
            
            // Update Y position for bouncing
            if (this.bounceTime < 1) {
              coinData.mesh.position.y = 0.4 + Math.abs(Math.sin(this.bounceTime * Math.PI * 3)) * 0.5 * (1 - this.bounceTime);
            } else {
              const baseY = 0.3;
              coinData.mesh.position.y = baseY + Math.sin(this.wobblePhase) * 0.1;
            }
          });
        } else if (this.type === 'bag') {
          // Bag swaying
          this.mesh.rotation.z = Math.sin(this.wobblePhase) * 0.1;
          this.wobblePhase += 0.05;
        } else if (this.type === 'chest') {
          // Chest glowing pulse
          if (this.glowLight) {
            this.glowLight.intensity = 2 + Math.sin(this.wobblePhase * 2) * 0.5;
          }
          this.wobblePhase += 0.05;
        }
        
        // Bounce physics on spawn (for single, bag, chest types)
        if (this.type !== 'multiple') {
          if (this.bounceTime < 1) {
            this.mesh.position.y = 0.4 + Math.abs(Math.sin(this.bounceTime * Math.PI * 3)) * 0.5 * (1 - this.bounceTime);
            this.bounceTime += 0.02;
          } else {
            // Wobble after bounce
            this.wobblePhase += 0.05;
            const baseY = this.type === 'chest' || this.type === 'bag' ? 0.4 : 0.3;
            this.mesh.position.y = baseY + Math.sin(this.wobblePhase) * 0.1;
          }
        } else {
          // Multiple coins handle bounce in their loop
          if (this.bounceTime < 1) {
            this.bounceTime += 0.02;
          } else {
            this.wobblePhase += 0.05;
          }
        }
        
        // NO MAGNET - gs.player must walk over gold to collect it
        const dx = playerPos.x - this.mesh.position.x;
        const dz = playerPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        // Collect ONLY when gs.player is very close
        if (dist < this.collectRange) {
          window.addGold(this.amount);
          playSound('coin');
          
          // Gold collect gs.particles - 20 sparkles + flash
          gs.spawnParticles(this.mesh.position, 0xFFD700, 8); // Reduced for performance
          gs.spawnParticles(this.mesh.position, 0xFFFFFF, 3); // Reduced for performance
          
          // Flash effect - bright point light
          const flashLight = new THREE.PointLight(0xFFD700, 4, 8);
          flashLight.position.copy(this.mesh.position);
          flashLight.position.y += 1;
          gs.scene.add(flashLight);
          gs.flashLights.push(flashLight);
          const timeoutId = setTimeout(() => {
            gs.scene.remove(flashLight);
            const idx = gs.flashLights.indexOf(flashLight);
            if (idx > -1) gs.flashLights.splice(idx, 1);
            const tidx = gs.activeTimeouts.indexOf(timeoutId);
            if (tidx > -1) gs.activeTimeouts.splice(tidx, 1);
          }, 100);
          gs.activeTimeouts.push(timeoutId);
          
          this.destroy();
        }
      }
      
      destroy() {
        this.active = false;
        
        if (this.type === 'multiple' && this.coins) {
          // Clean up multiple coins
          this.coins.forEach(coinData => {
            gs.scene.remove(coinData.mesh);
            coinData.mesh.geometry.dispose();
            coinData.mesh.material.dispose();
          });
        } else if (this.mesh) {
          // Clean up single mesh or group
          if (this.glowLight) {
            this.mesh.remove(this.glowLight);
          }
          gs.scene.remove(this.mesh);
          
          // Dispose geometries and materials recursively
          this.mesh.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(mat => mat.dispose());
              } else {
                child.material.dispose();
              }
            }
          });
        }
      }
    }

    class Chest {
      constructor(x, z, tier = 'common') {
        this.tier = tier;
        
        // Define chest tier properties
        const tierProps = {
          common: {
            bodyColor: 0x8B7355,    // Brown
            lidColor: 0xC0C0C0,     // Silver
            emissive: 0xFFFFFF,     // White
            lightColor: 0xFFFFFF,   // White light
            particleColor: 0xFFFFFF, // White gs.particles
            intensity: 1.0
          },
          uncommon: {
            bodyColor: 0x4A7C59,    // Dark Green
            lidColor: 0x6B8E23,     // Olive Green
            emissive: 0x00FF00,     // Green
            lightColor: 0x00FF00,   // Green light
            particleColor: 0x00FF00, // Green gs.particles
            intensity: 1.3
          },
          rare: {
            bodyColor: 0x4169E1,    // Royal Blue
            lidColor: 0x1E90FF,     // Dodger Blue
            emissive: 0x0080FF,     // Blue
            lightColor: 0x0080FF,   // Blue light
            particleColor: 0x0080FF, // Blue gs.particles
            intensity: 1.6
          },
          epic: {
            bodyColor: 0x8B00FF,    // Purple
            lidColor: 0xDA70D6,     // Orchid
            emissive: 0xA020F0,     // Purple
            lightColor: 0xA020F0,   // Purple light
            particleColor: 0xA020F0, // Purple gs.particles
            intensity: 2.0
          },
          mythical: {
            bodyColor: 0xFF4500,    // Orange-Red
            lidColor: 0xFF6347,     // Tomato
            emissive: 0xFF0000,     // Red
            lightColor: 0xFF8C00,   // Dark Orange
            particleColor: 0xFF0000, // Red gs.particles
            intensity: 2.5
          }
        };
        
        const props = tierProps[tier] || tierProps.common;
        
        // Create chest mesh - simple box with tier-specific color
        const geometry = new THREE.BoxGeometry(0.8, 0.6, 0.6);
        const material = new THREE.MeshPhysicalMaterial({ 
          color: props.bodyColor,
          metalness: 0.7,
          roughness: 0.3,
          emissive: props.emissive,
          emissiveIntensity: 0.2
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, 0.3, z);
        gs.scene.add(this.mesh);
        
        // Add lid (different color)
        const lidGeo = new THREE.BoxGeometry(0.85, 0.1, 0.65);
        const lidMat = new THREE.MeshPhysicalMaterial({ 
          color: props.lidColor,
          metalness: 0.8,
          roughness: 0.2
        });
        this.lid = new THREE.Mesh(lidGeo, lidMat);
        this.lid.position.set(0, 0.35, 0);
        this.mesh.add(this.lid);
        
        this.active = true;
        this.opened = false;
        this.collectRange = 1.5;
        this.wobblePhase = Math.random() * Math.PI * 2;
        
        // Spawn sparkles around chest with tier-specific colors
        gs.spawnParticles(this.mesh.position, props.particleColor, 8); // Reduced for performance
        gs.spawnParticles(this.mesh.position, 0xFFFFFF, 4); // Reduced for performance
        
        // Add glowing light effect with tier-specific color
        const glowLight = new THREE.PointLight(props.lightColor, props.intensity, 6);
        glowLight.position.copy(this.mesh.position);
        glowLight.position.y += 0.5;
        gs.scene.add(glowLight);
        this.glowLight = glowLight;
      }
      
      update(playerPos) {
        if (!this.active) return;
        
        // Bobbing animation
        this.wobblePhase += 0.05;
        this.mesh.position.y = 0.3 + Math.sin(this.wobblePhase) * 0.1;
        
        // Slow rotation
        this.mesh.rotation.y += 0.01;
        
        // Update glow light position
        if (this.glowLight) {
          this.glowLight.position.copy(this.mesh.position);
          this.glowLight.position.y += 0.5;
          // Pulsing glow
          this.glowLight.intensity = 1.5 + Math.sin(this.wobblePhase * 2) * 0.5;
        }
        
        // Check if gs.player is close enough to open
        const dx = playerPos.x - this.mesh.position.x;
        const dz = playerPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        if (dist < this.collectRange && !this.opened) {
          this.open();
        }
      }
      
      open() {
        this.opened = true;
        
        // Animate lid opening
        let openProgress = 0;
        const animateLid = () => {
          openProgress += 0.05;
          if (openProgress < 1) {
            this.lid.rotation.x = -openProgress * Math.PI * 0.7; // Open 70%
            this.lid.position.z = -openProgress * 0.2; // Slide back slightly
            requestAnimationFrame(animateLid);
          }
        };
        animateLid();
        
        // Play sound and effects
        playSound('coin'); // Reuse coin sound
        
        // Explosion of gs.particles
        gs.spawnParticles(this.mesh.position, 0xFFD700, 15); // Reduced for performance
        gs.spawnParticles(this.mesh.position, 0xFFFFFF, 8); // Reduced for performance
        gs.spawnParticles(this.mesh.position, 0xFF69B4, 5); // Reduced for performance
        
        // Flash effect
        const flashLight = new THREE.PointLight(0xFFD700, 8, 15);
        flashLight.position.copy(this.mesh.position);
        flashLight.position.y += 2;
        gs.scene.add(flashLight);
        gs.flashLights.push(flashLight);
        const timeoutId = setTimeout(() => {
          gs.scene.remove(flashLight);
          const idx = gs.flashLights.indexOf(flashLight);
          if (idx > -1) gs.flashLights.splice(idx, 1);
          const tidx = gs.activeTimeouts.indexOf(timeoutId);
          if (tidx > -1) gs.activeTimeouts.splice(tidx, 1);
        }, 200);
        gs.activeTimeouts.push(timeoutId);
        
        // Give gs.player reward
        this.giveReward();
        
        // Remove chest after short delay
        const destroyTimeoutId = setTimeout(() => {
          this.destroy();
        }, 2000);
        gs.activeTimeouts.push(destroyTimeoutId);
      }
      
      giveReward() {
        // Determine reward type
        const rand = Math.random();
        
        if (rand < 0.35) {
          // Health restore (35% chance)
          const healAmount = 50;
          const prevHp = playerStats.hp;
          playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + healAmount);
          const actualHeal = playerStats.hp - prevHp;
          window.createFloatingText(`+${actualHeal} HP!`, this.mesh.position);
          window.showStatChange(`Chest: +${actualHeal} HP!`);
          gs.spawnParticles(this.mesh.position, 0xFF69B4, 10); // Reduced for performance
        } else if (rand < 0.6) {
          // Gold (25% chance)
          const goldAmount = 12 + Math.floor(Math.random() * 19); // 12-30 gold (reduced from 20-50)
          window.addGold(goldAmount);
          window.createFloatingText(`+${goldAmount} Gold!`, this.mesh.position);
          window.showStatChange(`Chest: +${goldAmount} Gold!`);
        } else if (rand < 0.85) {
          // Random perk/stat boost (25% chance)
          this.applyRandomPerk();
        } else {
          // Weapon attachment or upgrade hint (15% chance)
          window.createFloatingText('Weapon Enhanced!', this.mesh.position);
          // Apply a small weapon boost - check if weapon exists
          if (weapons && weapons.gun && weapons.gun.active) {
            weapons.gun.damage += 5;
            window.showStatChange('Chest: Gun Damage +5');
          }
        }
      }
      
      applyRandomPerk() {
        const perks = [
          { name: 'Speed Boost', apply: () => { 
            // Cap max speed at 2x initial walkSpeed (50) to prevent breaking physics
            const maxWalkSpeed = 50; // 2x the initial 25
            if (playerStats.walkSpeed < maxWalkSpeed) {
              playerStats.walkSpeed *= 1.1;
              window.showStatChange('Chest: +10% Move Speed');
            } else {
              window.showStatChange('Chest: Max Speed Reached');
            }
          }},
          { name: 'Damage Boost', apply: () => { 
            playerStats.strength += 0.1;
            window.showStatChange('Chest: +10% Damage');
          }},
          { name: 'Health Boost', apply: () => { 
            playerStats.maxHp += 20;
            playerStats.hp += 20;
            window.showStatChange('Chest: +20 Max HP');
          }},
          { name: 'Armor Boost', apply: () => { 
            playerStats.armor = Math.min(80, playerStats.armor + 8);
            window.showStatChange('Chest: +8% Armor');
          }},
          { name: 'Attack Speed', apply: () => {
            // Cap minimum cooldown at 300ms to prevent performance issues
            if (weapons.gun.cooldown > 300) {
              weapons.gun.cooldown *= 0.9;
              window.showStatChange('Chest: +10% Attack Speed');
            } else {
              window.showStatChange('Chest: Max Attack Speed');
            }
          }}
        ];
        
        const perk = perks[Math.floor(Math.random() * perks.length)];
        perk.apply();
        window.createFloatingText(perk.name + '!', this.mesh.position);
      }
      
      destroy() {
        this.active = false;
        gs.scene.remove(this.mesh);
        if (this.glowLight) {
          gs.scene.remove(this.glowLight);
        }
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        if (this.lid) {
          this.lid.geometry.dispose();
          this.lid.material.dispose();
        }
      }
    }


    export { Player, Enemy, Projectile, SwordSlash, IceSpear, Meteor, Particle, ObjectPool, Chest, ExpGem, GoldCoin, DroneTurret, Companion, updateWaterParticles };
