// js/player-class.js — Player class: water droplet character, movement, dash, recoil, shooting.
// Depends on: THREE (CDN), variables from main.js (scene, camera, enemies, playerStats, etc.)


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
        scene.add(this.mesh);
        
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
        
        // Eyes — bold red to match spritesheet character design
        const eyeWhiteGeo = new THREE.SphereGeometry(0.10, 8, 8);
        const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        
        this.leftEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
        this.leftEyeWhite.position.set(-0.14, 0.08, 0.38);
        this.mesh.add(this.leftEyeWhite);
        
        this.rightEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
        this.rightEyeWhite.position.set(0.14, 0.08, 0.38);
        this.mesh.add(this.rightEyeWhite);
        
        const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xCC2222 }); // Red eyes matching spritesheet
        
        this.leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        this.leftEye.position.set(-0.14, 0.08, 0.42);
        this.mesh.add(this.leftEye);
        
        this.rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        this.rightEye.position.set(0.14, 0.08, 0.42);
        this.mesh.add(this.rightEye);
        
        // Pupils (dark centers)
        const pupilGeo = new THREE.SphereGeometry(0.04, 8, 8);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x220000 }); // Very dark red/black
        
        this.leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
        this.leftPupil.position.set(-0.14, 0.08, 0.46);
        this.mesh.add(this.leftPupil);
        
        this.rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
        this.rightPupil.position.set(0.14, 0.08, 0.46);
        this.mesh.add(this.rightPupil);
        
        // Angry brow — furrowed look matching spritesheet
        const browGeo = new THREE.BoxGeometry(0.12, 0.025, 0.04);
        const browMat = new THREE.MeshBasicMaterial({ color: 0x1a6fc4 }); // Darker blue brow
        this.leftBrow = new THREE.Mesh(browGeo, browMat);
        this.leftBrow.position.set(-0.14, 0.18, 0.40);
        this.leftBrow.rotation.z = 0.25; // Angled inward (angry)
        this.mesh.add(this.leftBrow);
        
        this.rightBrow = new THREE.Mesh(browGeo, browMat);
        this.rightBrow.position.set(0.14, 0.18, 0.40);
        this.rightBrow.rotation.z = -0.25;
        this.mesh.add(this.rightBrow);
        
        // Mouth — small determined frown
        const mouthGeo = new THREE.BoxGeometry(0.12, 0.025, 0.03);
        const mouthMat = new THREE.MeshBasicMaterial({ color: 0x1a3a5a });
        this.mouth = new THREE.Mesh(mouthGeo, mouthMat);
        this.mouth.position.set(0, -0.08, 0.42);
        this.mesh.add(this.mouth);
        
        // Head bandage wrap — wrapped cloth around head matching spritesheet
        const bandageMat = new THREE.MeshToonMaterial({ color: 0xF5DEB3 }); // Wheat/tan color like cloth
        // Main wrap band around head
        const wrapGeo = new THREE.TorusGeometry(0.42, 0.06, 6, 16);
        this.bandageWrap = new THREE.Mesh(wrapGeo, bandageMat);
        this.bandageWrap.position.set(0, 0.30, 0);
        this.bandageWrap.rotation.x = Math.PI / 2;
        this.bandageWrap.rotation.z = 0.15; // Slightly tilted for style
        this.mesh.add(this.bandageWrap);
        
        // Bandage tail hanging from wrap
        const tailGeo = new THREE.BoxGeometry(0.08, 0.25, 0.04);
        this.bandageTail = new THREE.Mesh(tailGeo, bandageMat);
        this.bandageTail.position.set(-0.30, 0.18, -0.20);
        this.bandageTail.rotation.z = 0.3;
        this.mesh.add(this.bandageTail);
        
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
        
        // Smoke particles timer
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
        
        // Aura Force Field (visible when aura weapon is active) - spiritual yellow-white energy sphere
        // Outer translucent sphere shell — spiritual force surrounding player
        const auraGeo = new THREE.SphereGeometry(2.0, 24, 16);
        const auraMat = new THREE.MeshBasicMaterial({ 
          color: 0xFFEE88, 
          transparent: true, 
          opacity: 0.08,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        this.auraCircle = new THREE.Mesh(auraGeo, auraMat);
        this.auraCircle.position.y = 0.5;
        this.auraCircle.visible = false;
        this.currentAuraRange = 2.0;
        scene.add(this.auraCircle);
        // Inner pulsing fog ring at feet level
        const auraFogGeo = new THREE.TorusGeometry(1.8, 0.3, 8, 24);
        const auraFogMat = new THREE.MeshBasicMaterial({
          color: 0xFFFFCC,
          transparent: true,
          opacity: 0.12,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        this.auraFogRing = new THREE.Mesh(auraFogGeo, auraFogMat);
        this.auraFogRing.rotation.x = -Math.PI / 2;
        this.auraFogRing.position.y = 0.15;
        this.auraFogRing.visible = false;
        scene.add(this.auraFogRing);
        
        // Fire Ring Orbs (visible when fireRing weapon is active)
        this.fireRingOrbs = [];
        this.fireRingAngle = 0;
        
        // Physics/Visuals
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.targetScale = new THREE.Vector3(1, 1, 1);
        this.trailTimer = 0;
        this.wobblePhase = 0;
        // Spring-damper for waterdrop deformation
        this.scaleYVel = 0;       // spring velocity for Y scale
        this.scaleXZVel = 0;      // spring velocity for XZ scale
        this.currentScaleY = 1.0;
        this.currentScaleXZ = 1.0;
        this.wobbleIntensity = 0; // spikes on direction change / dash
        this.prevVelDir = new THREE.Vector3(); // previous velocity direction for direction-change detection
        this.postDashSquish = 0;  // timer for post-dash bounce
        this.wasMoving = false;   // used to detect stopping transition for squish
        
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
        this._breathScale = 1.0; // Multiplier from breathing animation, applied on top of spring-damper
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
            // Add blue water particles trailing behind
            if (Math.random() < 0.5) {
              spawnParticles(this.mesh.position, COLORS.player, 1);
            }
          }
        }
        
        // Dash Logic
        if (this.isDashing) {
          this.dashTime -= dt;
          const t = 1 - (this.dashTime / this.dashDuration);
          // Dash distance uses the upgradeable dashDistance variable
          const dashSpeed = (dashDistance / this.dashDuration); // units per second
          const speed = Math.sin(t * Math.PI) * dashSpeed; // Slow-Fast-Slow curve
          this.mesh.position.x += this.dashVec.x * speed * dt;
          this.mesh.position.z += this.dashVec.z * speed * dt;
          
          // Enhanced splash effect trail during dash - MORE PARTICLES
          if (Math.random() < 0.7) { // Increased from 0.5
            spawnParticles(this.mesh.position, COLORS.player, 3); // Increased from 2
            spawnWaterDroplet(this.mesh.position);
            // Add white sparkle particles during dash
            if (Math.random() < 0.4) {
              spawnParticles(this.mesh.position, 0xFFFFFF, 2);
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
                  spawnParticles(pPos, 0x8B4513, 25);
                  spawnParticles(pPos, 0x228B22, 20);
                  // Tree falls and remains as debris (does not disappear)
                  const fallDir = Math.random() < 0.5 ? 1 : -1;
                  const fallAxis = Math.random() < 0.5 ? 'x' : 'z';
                  const fallDuration = 500;
                  const fallStart = Date.now();
                  if (prop.mesh.userData.leaves) prop.mesh.userData.leaves.visible = false;
                  const treeMesh = prop.mesh;
                  if (managedAnimations.length < MAX_MANAGED_ANIMATIONS) {
                    let dashFallTimer = 0;
                    const dashFallFrames = Math.ceil(fallDuration / 16);
                    managedAnimations.push({ update(_dt) {
                      dashFallTimer++;
                      const progress = Math.min(dashFallTimer / dashFallFrames, 1);
                      if (fallAxis === 'x') treeMesh.rotation.x = (Math.PI / 2) * progress * fallDir;
                      else treeMesh.rotation.z = (Math.PI / 2) * progress * fallDir;
                      treeMesh.position.y = -progress * 1.5;
                      return progress < 1;
                    }});
                  }
                } else if (prop.type === 'barrel') {
                  spawnParticles(pPos, 0xFF4500, 30);
                  spawnParticles(pPos, 0xFFFF00, 15);
                  // Leave broken debris on ground instead of removing
                  prop.mesh.scale.set(0.8, 0.3, 0.8);
                  prop.mesh.position.y = 0.15;
                  prop.mesh.rotation.x = (Math.random() - 0.5) * 0.8;
                  prop.mesh.rotation.z = (Math.random() - 0.5) * 0.8;
                  if (prop.mesh.material) prop.mesh.material.color.setHex(0x654321);
                  if (prop.mesh.material) prop.mesh.material.opacity = 0.7;
                } else {
                  spawnParticles(pPos, 0xD2691E, 20);
                  // Leave broken crate debris on ground
                  prop.mesh.scale.set(0.7, 0.25, 0.7);
                  prop.mesh.position.y = 0.12;
                  prop.mesh.rotation.x = (Math.random() - 0.5) * 1.0;
                  prop.mesh.rotation.z = (Math.random() - 0.5) * 1.0;
                  if (prop.mesh.material) prop.mesh.material.color.setHex(0x8B6914);
                  if (prop.mesh.material) prop.mesh.material.opacity = 0.6;
                }
                // Screen shake on big destruction
                if (window.triggerScreenShake) window.triggerScreenShake(0.3);
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
                spawnParticles(fence.position, 0x8B4513, 15);
                // Leave fence debris on ground instead of removing
                fence.scale.set(1, 0.2, 1);
                fence.position.y = 0.05;
                fence.rotation.x = (Math.random() - 0.5) * 1.5;
                if (fence.material) fence.material.opacity = 0.5;
              }
            }
          }
          // DASH DESTRUCTION: Break through trees and props when dashing
          if (window.destructibleProps) {
            for (let prop of window.destructibleProps) {
              if (prop.destroyed) continue;
              const pdx = this.mesh.position.x - prop.mesh.position.x;
              const pdz = this.mesh.position.z - prop.mesh.position.z;
              if (pdx * pdx + pdz * pdz < 2.5) {
                prop.hp = 0;
                prop.destroyed = true;
                spawnParticles(prop.mesh.position, prop.type === 'tree' ? 0x228B22 : 0x8B4513, 20);
                prop.mesh.scale.set(1, 0.2, 1);
                prop.mesh.position.y = 0.05;
                prop.mesh.rotation.x = (Math.random() - 0.5) * 1.5;
                if (prop.mesh.material) {
                  prop.mesh.material.transparent = true;
                  prop.mesh.material.opacity = 0.5;
                }
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
            const rageSpeedMult = this._rageSpeedMult || 1;
            const speed = GAME_CONFIG.playerSpeedBase * (playerStats.walkSpeed / 25) * 60 * rageSpeedMult; // Base speed for 60fps
            targetVel.x = joystickLeft.x * speed * dt; // Frame-rate independent
            targetVel.z = joystickLeft.y * speed * dt;
          }
          
          // Enhanced inertia: Smooth acceleration and deceleration with glide
          // Scale lerpFactor by dt*60 to normalize across frame rates and eliminate jitter
          // turnResponse (from flexibility training) scales acceleration, stopResponse scales deceleration
          const turnResp = (playerStats.turnResponse || 1.0);
          const stopResp = (playerStats.stopResponse || 1.0);
          const baseLerpFactor = joystickLeft.active ? GAME_CONFIG.accelLerpFactor * turnResp : GAME_CONFIG.decelLerpFactor * stopResp;
          const lerpFactor = Math.min(baseLerpFactor * (dt * 60), 1.0);
          this.velocity.lerp(targetVel, lerpFactor);
          
          // Apply velocity with inertia
          this.mesh.position.x += this.velocity.x;
          this.mesh.position.z += this.velocity.z;
          
          // Solid collision with map objects (trees, barrels, crates) — player bounces off
          if (window.destructibleProps) {
            for (let prop of window.destructibleProps) {
              if (prop.destroyed) continue;
              const collisionRadius = prop.type === 'tree' ? 1.0 : 0.7;
              const pdx = this.mesh.position.x - prop.mesh.position.x;
              const pdz = this.mesh.position.z - prop.mesh.position.z;
              const pdist = Math.sqrt(pdx * pdx + pdz * pdz);
              if (pdist < collisionRadius && pdist > 0.001) {
                // Push player out of object
                const pushX = (pdx / pdist) * collisionRadius;
                const pushZ = (pdz / pdist) * collisionRadius;
                this.mesh.position.x = prop.mesh.position.x + pushX;
                this.mesh.position.z = prop.mesh.position.z + pushZ;
                // Kill inward velocity
                const dot = this.velocity.x * pdx + this.velocity.z * pdz;
                if (dot < 0) {
                  this.velocity.x -= (dot / (pdist * pdist)) * pdx;
                  this.velocity.z -= (dot / (pdist * pdist)) * pdz;
                }
                // Wobble the object on collision
                if (!prop._wobbleTime) prop._wobbleTime = 0;
                prop._wobbleTime = 1.0; // Start wobble for 1 second
                if (!prop._wobbleDir) prop._wobbleDir = { x: -pdx / pdist, z: -pdz / pdist };
                else { prop._wobbleDir.x = -pdx / pdist; prop._wobbleDir.z = -pdz / pdist; }
              }
            }
          }
          // Solid collision with fences — also wobble on contact
          if (window.breakableFences) {
            for (let fence of window.breakableFences) {
              if (!fence.userData || !fence.userData.isFence || fence.userData.hp <= 0) continue;
              const fdx = this.mesh.position.x - fence.position.x;
              const fdz = this.mesh.position.z - fence.position.z;
              const fdist = Math.sqrt(fdx * fdx + fdz * fdz);
              if (fdist < 0.6 && fdist > 0.001) {
                this.mesh.position.x = fence.position.x + (fdx / fdist) * 0.6;
                this.mesh.position.z = fence.position.z + (fdz / fdist) * 0.6;
                // Wobble fence on collision
                if (!fence.userData._wobbleTime) fence.userData._wobbleTime = 0;
                fence.userData._wobbleTime = 0.8;
                if (!fence.userData._wobbleDir) fence.userData._wobbleDir = { x: -fdx / fdist, z: -fdz / fdist };
                else { fence.userData._wobbleDir.x = -fdx / fdist; fence.userData._wobbleDir.z = -fdz / fdist; }
              }
            }
          }

          // Solid collision with resource rocks/crystals — player cannot walk through them
          if (window.GameHarvesting && window.GameHarvesting.harvestNodes) {
            for (let node of window.GameHarvesting.harvestNodes) {
              if (node.depleted || !node.mesh) continue;
              const collRadius = 0.9; // Rocks are about 1.6 radius but use smaller collider
              const ndx = this.mesh.position.x - node.mesh.position.x;
              const ndz = this.mesh.position.z - node.mesh.position.z;
              const ndist = Math.sqrt(ndx * ndx + ndz * ndz);
              if (ndist < collRadius && ndist > 0.001) {
                // Push player out
                this.mesh.position.x = node.mesh.position.x + (ndx / ndist) * collRadius;
                this.mesh.position.z = node.mesh.position.z + (ndz / ndist) * collRadius;
                const dot = this.velocity.x * ndx + this.velocity.z * ndz;
                if (dot < 0) {
                  this.velocity.x -= (dot / (ndist * ndist)) * ndx;
                  this.velocity.z -= (dot / (ndist * ndist)) * ndz;
                }
                // Wobble the rock on collision
                node._wobbleTime = 0.7;
                if (!node._wobbleDir) node._wobbleDir = { x: -ndx / ndist, z: -ndz / ndist };
                else { node._wobbleDir.x = -ndx / ndist; node._wobbleDir.z = -ndz / ndist; }
              }
            }
          }

          // Enhanced water droplet trail when moving - MORE PARTICLES
          if (this.velocity.length() > 0.01) {
            this.trailTimer += dt;
            if (this.trailTimer > 0.12) { // Faster trail (was 0.15)
              this.trailTimer = 0;
              spawnWaterDroplet(this.mesh.position);
              // Add extra splash particles during movement
              if (Math.random() < 0.3) {
                spawnParticles(this.mesh.position, COLORS.player, 1);
              }
            }
          } else {
            // Idle
            this.trailTimer = 0;
          }
          
          // Add lean/tilt in direction of movement — more dynamic and responsive
          if (this.velocity.length() > 0.03) {
            const leanFactor = GAME_CONFIG.movementLeanFactor * (25 + this.wobbleIntensity * 25);
            const leanAngleX = -this.velocity.z * leanFactor;
            const leanAngleZ = this.velocity.x * leanFactor;
            // Faster response on direction changes, smooth in steady state
            const leanResponse = this.wobbleIntensity > 0.3 ? 0.7 : 0.5;
            const leanDt = Math.min(dt * 12, leanResponse);
            this.mesh.rotation.x += (leanAngleX - this.mesh.rotation.x) * leanDt;
            this.mesh.rotation.z += (leanAngleZ - this.mesh.rotation.z) * leanDt;
          } else {
            // Smooth return to upright when idle - more natural settle
            this.mesh.rotation.x *= 0.85;
            this.mesh.rotation.z *= 0.85;
          }
          
          // Rotation/Aiming with RIGHT stick (independent of movement)
          if (joystickRight.active) {
            // Manual aim: Turn to face the direction of right stick
            let angle = Math.atan2(joystickRight.x, joystickRight.y);
            
            // FRESH: Precision aiming - 15% nudge toward nearest enemy when right joystick active
            if (enemies && enemies.length > 0) {
              let nearestEnemy = null;
              let minDist = Infinity;
              enemies.forEach(e => {
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
                
                // Blend 85% player input + 15% toward enemy (subtle magnetism)
                let angleDiff = enemyAngle - angle;
                // Normalize angle difference to -PI to PI
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                
                angle = angle + angleDiff * 0.15; // 15% nudge
              }
            }
            
            this.mesh.rotation.y = angle;
          } else if (gameSettings.autoAim && enemies && enemies.length > 0) {
            // Auto-aim when enabled (works in any orientation)
            // Accuracy starts low and improves with dexterity/upgrades via autoAimAccuracy stat
            let nearestEnemy = null;
            let minDist = Infinity;
            enemies.forEach(e => {
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
              const perfectAngle = Math.atan2(dx, dz);
              // Apply accuracy: low accuracy adds a stable offset (updated every 150ms, not every frame)
              // This prevents per-frame random jitter that causes the character to wobble rapidly
              const accuracy = playerStats.autoAimAccuracy || 0.3;
              const maxError = (1 - accuracy) * (Math.PI / 4); // up to 45° off at 0% accuracy
              // Recalculate aim error every 150ms (not every frame) to prevent per-frame jitter
              if (!this._nextAimErrorUpdate || gameTime >= this._nextAimErrorUpdate) {
                this._nextAimErrorUpdate = gameTime + 0.15; // 150ms between aim-error updates
                this._currentAimError = (Math.random() - 0.5) * 2 * maxError;
              }
              const targetAngle = perfectAngle + (this._currentAimError || 0);
              // Lerp toward target angle to avoid snapping
              let angleDiff = targetAngle - this.mesh.rotation.y;
              while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
              while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
              this.mesh.rotation.y += angleDiff * Math.min(10 * dt, 1);
            }
          } else if (joystickLeft.active) {
            // If no right stick input and no auto-aim, rotate to face movement direction
            // Only update rotation if joystick has meaningful input (prevents jitter near center)
            if (targetVel.lengthSq() > 0.000001) {
              const angle = Math.atan2(targetVel.x, targetVel.z);
              this.mesh.rotation.y = angle;
            }
          }
        }
        
        const speedMag = this.velocity.length();
        
        // Waterdrop physics: spring-damper squish/bounce/wobble
        const dt2 = Math.min(dt, 0.05);
        
        // Detect direction changes to spike wobble intensity
        if (speedMag > 0.04) {
          const velDir = this.velocity.clone().normalize();
          const dirDot = velDir.dot(this.prevVelDir);
          const dirChange = 1 - dirDot;
          if (dirChange > 0.2) {
            // Over-exaggerate wobble on direction changes for dynamic feel
            this.wobbleIntensity = Math.min(1, this.wobbleIntensity + dirChange * 4.0);
            // Full reversal (dot < -0.5): dramatic stretch + water trail
            if (dirDot < -0.5 && speedMag > 0.06) {
              this.postDashSquish = Math.max(this.postDashSquish, 0.9);
              this.wobbleIntensity = 1;
              // Spawn water trail particles to show sliding
              for (let i = 0; i < 4; i++) spawnWaterParticle(this.mesh.position);
            }
          }
          this.prevVelDir.copy(velDir);
        }
        // Decay wobble intensity
        this.wobbleIntensity = Math.max(0, this.wobbleIntensity - dt2 * 3);
        
        // Stopping squish: detect transition from moving to fully stopped
        if (this.wasMoving && speedMag < 0.02 && !this.isDashing) {
          this.postDashSquish = Math.max(this.postDashSquish, 0.7);
          this.wobbleIntensity = Math.min(1, this.wobbleIntensity + 0.5);
        }
        this.wasMoving = speedMag > 0.02;

        // Post-dash / post-stop squish bounce timer
        if (!this.isDashing && this.postDashSquish > 0) {
          this.postDashSquish = Math.max(0, this.postDashSquish - dt2 * 4);
        }
        if (this.isDashing) {
          this.postDashSquish = 1.0;
          this.wobbleIntensity = Math.min(1, this.wobbleIntensity + 0.8);
        }
        
        // Compute target scales
        let targetScaleY, targetScaleXZ;
        if (this.isDashing) {
          // Dash START: quick squish then elongate (gives a "push-off" feel)
          const dashProg = 1 - (this.dashTime / this.dashDuration);
          if (dashProg < 0.2) {
            const t = dashProg / 0.2;
            targetScaleY = 1.0 - t * 0.55;   // 1.0 → 0.45 squish
            targetScaleXZ = 1.0 + t * 0.5;   // 1.0 → 1.5 expand
          } else {
            // Dash BODY: fully elongated in travel direction
            targetScaleY = 0.45;
            targetScaleXZ = 1.5;
          }
        } else if (this.postDashSquish > 0.01) {
          // Post-dash/stop/turn oscillating bounce — over-exaggerated for comic waterdrop feel
          const bounce = Math.sin(this.postDashSquish * Math.PI * 3.0) * 0.45 * this.postDashSquish;
          targetScaleY = 1.0 + bounce;
          targetScaleXZ = 1.0 - bounce * 0.6;
        } else if (speedMag > 0.05) {
          // Moving: vertical bounce oscillates — bigger range, more dramatic wobble
          this.wobblePhase += dt2 * speedMag * 120;  // slower phase for heavier, lower-frequency bounce
          const bounce = Math.sin(this.wobblePhase) * (0.14 + this.wobbleIntensity * 0.18);
          targetScaleY = 1.0 + bounce;
          const squishAmt = Math.min(speedMag * 1.5, 0.25);
          targetScaleXZ = 1.0 + squishAmt + Math.cos(this.wobblePhase) * (0.06 + this.wobbleIntensity * 0.10);
        } else {
          // Idle breathing
          this.wobblePhase += dt2 * 2.5;
          targetScaleY = 1.0 + Math.sin(this.wobblePhase) * 0.03;
          targetScaleXZ = 1.0 - Math.sin(this.wobblePhase) * 0.015;
        }
        
        // Spring-damper integration (k=200 stiffness, c=18 damping)
        const springK = 200, springC = 18;
        const forceY = springK * (targetScaleY - this.currentScaleY) - springC * this.scaleYVel;
        const forceXZ = springK * (targetScaleXZ - this.currentScaleXZ) - springC * this.scaleXZVel;
        this.scaleYVel += forceY * dt2;
        this.scaleXZVel += forceXZ * dt2;
        this.currentScaleY += this.scaleYVel * dt2;
        this.currentScaleXZ += this.scaleXZVel * dt2;
        // Clamp to sane range
        this.currentScaleY = Math.max(0.3, Math.min(2.0, this.currentScaleY));
        this.currentScaleXZ = Math.max(0.5, Math.min(2.0, this.currentScaleXZ));
        // Note: mesh.scale is applied after breathing section, combined with _breathScale
        
        // Shed water particles when moving fast
        if (speedMag > 0.4 && Math.random() < dt2 * speedMag * 3 && !this.isDashing) {
          const n = Math.floor(Math.random() * 2) + 1;
          for (let i = 0; i < n; i++) spawnWaterParticle(this.mesh.position);
        }
        
        // Animate water shine
        this.shine.rotation.y += 0.05;
        this.shine.rotation.x += 0.03;
        
        // Pulse highlight
        this.highlight.material.opacity = 0.6 + Math.sin(gameTime * 3) * 0.2;
        
        // Pulse glow effect
        this.glow.material.opacity = 0.15 + Math.sin(gameTime * 2) * 0.1;
        this.glow.scale.set(
          1 + Math.sin(gameTime * 2) * 0.05,
          1 + Math.sin(gameTime * 2) * 0.05,
          1 + Math.sin(gameTime * 2) * 0.05
        );
        
        // Animate arms and legs (walking animation when moving)
        if (speedMag > 0.1) {
          // Walking animation - swing arms and legs
          const walkPhase = gameTime * 8; // Walking speed
          this.leftArm.rotation.x = Math.sin(walkPhase) * 0.3;
          this.rightArm.rotation.x = -Math.sin(walkPhase) * 0.3;
          this.leftLeg.rotation.x = -Math.sin(walkPhase) * 0.4;
          this.rightLeg.rotation.x = Math.sin(walkPhase) * 0.4;
        } else {
          // Idle - gentle sway
          const idlePhase = gameTime * 2;
          this.leftArm.rotation.x = Math.sin(idlePhase) * 0.1;
          this.rightArm.rotation.x = Math.sin(idlePhase + Math.PI) * 0.1;
          this.leftLeg.rotation.x = 0;
          this.rightLeg.rotation.x = 0;
        }
        
        // Breathing animation (subtle body scaling)
        this._breathScale = 1.0;
        this.breathTimer += dt;
        const breathPhase = (this.breathTimer % this.breathCycle) / this.breathCycle;
        if (breathPhase < 0.4) {
          const inhaleProgress = breathPhase / 0.4;
          this._breathScale = 1 + inhaleProgress * 0.05;
        } else if (breathPhase < 0.5) {
          this._breathScale = 1.05;
        } else {
          const exhaleProgress = (breathPhase - 0.5) / 0.5;
          this._breathScale = 1.05 - exhaleProgress * 0.05;
        }
        
        // Apply spring-damper scale combined with breathing multiplier
        // Directional stretch: mesh local Z = forward (movement direction), local X = sideways
        // Over-exaggerated for comic waterdrop style — elongate in travel direction
        const dirStretch = this.isDashing
          ? 0.5
          : Math.min(speedMag * 2.0, 0.28);
        this.mesh.scale.y = this.currentScaleY * this._breathScale;
        this.mesh.scale.x = this.currentScaleXZ * (1.0 - dirStretch * 0.65) * this._breathScale;
        this.mesh.scale.z = this.currentScaleXZ * (1.0 + dirStretch * 0.55) * this._breathScale;
        
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
            if (this.leftEyeWhite) this.leftEyeWhite.scale.y = scale;
            if (this.rightEyeWhite) this.rightEyeWhite.scale.y = scale;
          } else {
            // Opening
            const scale = (blinkProgress - 0.5) * 2;
            this.leftEye.scale.y = scale;
            this.rightEye.scale.y = scale;
            this.leftPupil.scale.y = scale;
            this.rightPupil.scale.y = scale;
            if (this.leftEyeWhite) this.leftEyeWhite.scale.y = scale;
            if (this.rightEyeWhite) this.rightEyeWhite.scale.y = scale;
          }
          
          if (blinkProgress >= 1) {
            this.isBlinking = false;
            this.blinkTimer = 0;
            // Reset scale
            this.leftEye.scale.y = 1;
            this.rightEye.scale.y = 1;
            this.leftPupil.scale.y = 1;
            this.rightPupil.scale.y = 1;
            if (this.leftEyeWhite) this.leftEyeWhite.scale.y = 1;
            if (this.rightEyeWhite) this.rightEyeWhite.scale.y = 1;
          }
        }
        
        // Update aura force field — spiritual yellow-white pulsating sphere
        if (weapons.aura.active) {
          this.auraCircle.visible = true;
          this.auraFogRing.visible = true;
          this.auraCircle.position.x = this.mesh.position.x;
          this.auraCircle.position.z = this.mesh.position.z;
          this.auraFogRing.position.x = this.mesh.position.x;
          this.auraFogRing.position.z = this.mesh.position.z;
          
          // Scale based on aura range — sphere force field
          const scale = weapons.aura.range * 1.5;
          if (this.currentAuraRange !== scale) {
            this.currentAuraRange = scale;
            this.auraCircle.geometry.dispose();
            this.auraCircle.geometry = new THREE.SphereGeometry(scale, 24, 16);
            this.auraFogRing.geometry.dispose();
            this.auraFogRing.geometry = new THREE.TorusGeometry(scale * 0.9, 0.3, 8, 24);
          }
          
          // Fast pulsation — rapid spiritual energy waves
          const fastPulse = Math.sin(gameTime * 10) * 0.04;
          const slowPulse = Math.sin(gameTime * 3) * 0.02;
          this.auraCircle.material.opacity = 0.06 + fastPulse + slowPulse;
          // Scale pulsation — breathing force field
          const scalePulse = 1.0 + Math.sin(gameTime * 8) * 0.04;
          this.auraCircle.scale.setScalar(scalePulse);
          // Yellow-white color shift
          const colorShift = Math.sin(gameTime * 5) * 0.5 + 0.5;
          this.auraCircle.material.color.setRGB(
            1.0,
            0.92 + colorShift * 0.08,
            0.5 + colorShift * 0.3
          );
          // Fog ring: expand outward from feet with rotation
          this.auraFogRing.rotation.z += 0.05;
          const fogPulse = Math.sin(gameTime * 8) * 0.06;
          this.auraFogRing.material.opacity = 0.08 + fogPulse;
          const fogScale = 1.0 + Math.sin(gameTime * 6) * 0.08;
          this.auraFogRing.scale.setScalar(fogScale);
          this.auraFogRing.material.color.setRGB(
            1.0,
            1.0,
            0.7 + colorShift * 0.2
          );
        } else {
          this.auraCircle.visible = false;
          this.auraFogRing.visible = false;
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
            scene.add(orb);
            this.fireRingOrbs.push(orb);
          }
          
          // Remove extra orbs if downgraded (shouldn't happen but safety)
          while (this.fireRingOrbs.length > currentOrbCount) {
            const orb = this.fireRingOrbs.pop();
            scene.remove(orb);
            orb.geometry.dispose();
            orb.material.dispose();
          }
          
          // Update orb positions (orbit around player)
          this.fireRingAngle += weapons.fireRing.rotationSpeed * dt;
          const radius = weapons.fireRing.range;
          
          for (let i = 0; i < this.fireRingOrbs.length; i++) {
            const angle = this.fireRingAngle + (i * Math.PI * 2 / currentOrbCount);
            const orb = this.fireRingOrbs[i];
            orb.position.x = this.mesh.position.x + Math.cos(angle) * radius;
            orb.position.z = this.mesh.position.z + Math.sin(angle) * radius;
            orb.position.y = this.mesh.position.y + Math.sin(gameTime * 5 + i) * 0.3; // Bob up and down
            
            // Glow effect
            orb.material.opacity = 0.7 + Math.sin(gameTime * 8 + i) * 0.2;
            
            // Fire particles around each orb (throttled: every 3 frames)
            if (Math.floor(gameTime * 60) % 3 === i % 3) {
              spawnParticles(orb.position, 0xFF4500, 1);
            }
            if (Math.floor(gameTime * 60) % 7 === i % 7) {
              spawnParticles(orb.position, 0xFF8C00, 1);
            }
          }
        } else {
          // Hide orbs when weapon not active
          for (let orb of this.fireRingOrbs) {
            orb.visible = false;
          }
        }

        // Camera Follow (smooth, closer view for better immersion)
        camera.position.x = this.mesh.position.x;
        camera.position.z = this.mesh.position.z + 16; // Tighter isometric offset (was 20)
        camera.lookAt(this.mesh.position);

        // Bounds (Map is 400x400, from -200 to 200)
        this.mesh.position.x = Math.max(-195, Math.min(195, this.mesh.position.x));
        this.mesh.position.z = Math.max(-195, Math.min(195, this.mesh.position.z));
      }

      dash(dx, dz) {
        if (this.isDashing) return;
        this.isDashing = true;
        this.dashTime = this.dashDuration;
        
        // Splash effect on dash start - more dramatic
        spawnParticles(this.mesh.position, COLORS.player, 10); // Reduced for performance
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
        // Safety: do not process damage when game is not active or already over
        if (!isGameActive || isGameOver) return;
        // Prevent stray hits during boss kill-cam cinematics
        if (killCamActive) return;
        // Check invulnerability frames (hit-stun + dash invulnerability)
        if (this.invulnerable || dashInvulnerable) return;
        // Safety: ignore zero or negative damage to prevent phantom kills
        if (!amount || amount <= 0) return;

        // Dodge chance — chance to fully negate the hit
        if (playerStats.dodgeChance > 0 && Math.random() < playerStats.dodgeChance) {
          createFloatingText('DODGE!', this.mesh.position, '#00FFFF');
          spawnParticles(this.mesh.position, 0x00FFFF, 6);
          return;
        }

        // Armor reduction — delegated to GameCombat
        let reduced = calculateArmorReduction(amount, playerStats.armor);

        // Extra damage reduction from skill tree (additive with armor, after it)
        if (playerStats.damageReduction > 0) {
          reduced = Math.max(1, reduced * (1 - playerStats.damageReduction));
        }

        // Last Stand — survive a fatal hit once per run
        if (playerStats.hasLastStand && !playerStats.lastStandUsed && playerStats.hp - reduced <= 0) {
          playerStats.lastStandUsed = true;
          playerStats.hp = 1;
          createFloatingText('LAST STAND!', this.mesh.position, '#FFD700');
          spawnParticles(this.mesh.position, 0xFFD700, 20);
          updateHUD();
          playSound('levelup');
          return;
        }

        playerStats.hp -= reduced;
        updateHUD();
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
          if (this.leftEyeWhite) this.leftEyeWhite.visible = false;
          if (this.rightEyeWhite) this.rightEyeWhite.visible = false;
          
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
            if (this.leftEyeWhite) this.leftEyeWhite.visible = true;
            if (this.rightEyeWhite) this.rightEyeWhite.visible = true;
          }, 300);
        }
        
        // Show damage number for player (red color)
        const div = document.createElement('div');
        div.className = 'damage-number player-damage';
        div.innerText = `-${Math.floor(reduced)}`;
        div.style.color = '#FF4444';
        div.style.fontSize = '24px';
        div.style.fontWeight = 'bold';
        div.style.textShadow = '0 0 8px rgba(255,68,68,0.8), 2px 2px 4px #000';
        
        // Project 3D pos to 2D screen
        const vec = this.mesh.position.clone();
        vec.y += 2;
        vec.project(camera);
        
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
        
        // Water-themed blood effects for player (blue water droplets)
        // Spawn blue water particles (player's "blood")
        spawnParticles(this.mesh.position, COLORS.player, 8); // Blue water
        spawnParticles(this.mesh.position, 0x87CEEB, 5); // Light blue splash
        spawnParticles(this.mesh.position, 0xFFFFFF, 3); // White foam
        
        // Water droplets as player blood
        for(let i=0; i<5; i++) {
          spawnWaterDroplet(this.mesh.position);
        }
        
        // Squishy deformation on hit - drive spring-damper directly for smooth recovery
        this.currentScaleXZ = 1.4;
        this.currentScaleY = 0.6;
        this.scaleXZVel = 0;
        this.scaleYVel = 0;
        
        // FRESH IMPLEMENTATION: Screen shake scales with damage amount
        // Cancel any previous shake to prevent stacked RAF loops
        if (_cameraShakeRAF) {
          cancelAnimationFrame(_cameraShakeRAF);
          _cameraShakeRAF = null;
        }
        const originalCameraPos = { 
          x: camera.position.x, 
          y: camera.position.y, 
          z: camera.position.z 
        };
        let shakeTime = 0;
        const shakeDuration = 0.25 + (reduced / 100) * 0.15; // Duration scales with damage
        
        const shakeAnim = () => {
          shakeTime += 0.016;
          if (shakeTime < shakeDuration) {
            // Intensity scales with damage (0.5 base + up to 0.5 more based on damage)
            const baseIntensity = 0.5 + Math.min(reduced / 50, 1) * 0.5;
            const intensity = (1 - shakeTime / shakeDuration) * baseIntensity;
            camera.position.x = originalCameraPos.x + (Math.random() - 0.5) * intensity;
            camera.position.y = originalCameraPos.y + (Math.random() - 0.5) * intensity;
            camera.position.z = originalCameraPos.z + (Math.random() - 0.5) * intensity;
            _cameraShakeRAF = requestAnimationFrame(shakeAnim);
          } else {
            _cameraShakeRAF = null;
            camera.position.x = originalCameraPos.x;
            camera.position.y = originalCameraPos.y;
            camera.position.z = originalCameraPos.z;
          }
        };
        shakeAnim();

        if (playerStats.hp <= 0 && !isGameOver) {
          // ENHANCED Death splash: more particles + ground pool with fade
          spawnParticles(this.mesh.position, COLORS.player, 25); // Reduced for performance
          spawnParticles(this.mesh.position, 0xFFFFFF, 8); // Reduced for performance
          
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
          scene.add(pool);
          
          // Fade out pool over time
          const fadePool = () => {
            poolMat.opacity -= 0.01;
            if (poolMat.opacity > 0) {
              setTimeout(fadePool, 50);
            } else {
              scene.remove(pool);
              poolGeo.dispose();
              poolMat.dispose();
            }
          };
          setTimeout(fadePool, 500);
          
          gameOver();
        }
      }
    }

    // Cached deformed geometry for Hard Tank (performance optimization)
    // Note: All Hard Tank enemies share the same deformed shape for performance.
    // This is intentional - visual variety comes from animations and positioning.
