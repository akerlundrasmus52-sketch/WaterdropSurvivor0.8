// js/gem-classes.js — ExpGem, GoldCoin, and Chest pickup classes.
// Handles pickup animation, magnetism, collection effects.
// Depends on: THREE (CDN), variables from main.js

    class ExpGem {
      constructor(x, z) {
        // Use shared star geometry (created once)
        if (!_expGemStarGeometry) {
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
          _expGemStarGeometry = new THREE.ExtrudeGeometry(starShape, extrudeSettings);
          _expGemStarGeometry.center();
          _expGemStarMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x5DADE2,      // Match XP bar color exactly (#5DADE2)
            emissive: 0x2E86C1,   // Blue emissive glow matching XP bar
            emissiveIntensity: 0.4,
            metalness: 0.3,
            roughness: 0.05,
            clearcoat: 1.0,        // Glass-like shine layer
            clearcoatRoughness: 0.05,
            reflectivity: 0.8
          });
        }

        // Each gem gets its own material clone for per-instance emissive animation
        const starMaterial = _expGemStarMaterial.clone();

        this.mesh = new THREE.Mesh(_expGemStarGeometry, starMaterial);
        this.mesh.position.set(x, 0.5, z);

        // SM64-style: add black outline ring and yellow-edge highlight using a slightly larger dark mesh
        // Outline geometry is shared across all ExpGem instances (created once)
        if (!_expGemOutlineGeometry) {
          const s = new THREE.Shape();
          const pts = 5, outerO = 0.33, innerO = 0.14;
          for (let i = 0; i < pts * 2; i++) {
            const ang = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
            const r = i % 2 === 0 ? outerO : innerO;
            if (i === 0) s.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
            else s.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
          }
          s.closePath();
          _expGemOutlineGeometry = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false });
          _expGemOutlineGeometry.center();
        }
        const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const outlineMesh = new THREE.Mesh(_expGemOutlineGeometry, outlineMat);
        outlineMesh.position.z = -0.01;
        this._outlineMat = outlineMat; // Store per-instance material for disposal
        this.mesh.add(outlineMesh);
        
        // Black edge glow ring — thin, slightly larger than the star outline, glows subtly
        const glowRingMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.65 });
        const glowRingMesh = new THREE.Mesh(_expGemOutlineGeometry, glowRingMat);
        glowRingMesh.scale.set(1.08, 1.08, 0.5);
        glowRingMesh.position.z = -0.02;
        this._glowRingMat = glowRingMat;
        this.mesh.add(glowRingMesh);

        scene.add(this.mesh);

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
        
        // Pulsing black edge glow — sync with star's emissive intensity
        this.sparklePhase += 0.1;
        const pulse = 0.35 + Math.sin(this.sparklePhase) * 0.25;
        this.mesh.material.emissiveIntensity = pulse;
        // Also pulse the black glow ring opacity
        if (this._glowRingMat) {
          this._glowRingMat.opacity = 0.45 + Math.sin(this.sparklePhase + 0.5) * 0.2;
        }

        // Magnet
        const dx = playerPos.x - this.mesh.position.x;
        const dz = playerPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        if (dist < magnetRange) { // Use magnetRange variable
          this.mesh.position.x += (dx / dist) * 0.3;
          this.mesh.position.z += (dz / dist) * 0.3;
          
          // Visual Trail when pulled - lighter blue particles (PR #117)
          if (Math.random() < 0.3) {
             spawnParticles(this.mesh.position, 0x4FC3F7, 1);
          }
        }

        if (dist < 0.8) { // Collect
          this.collect();
        }
      }

      collect() {
        this.active = false;
        
        // SPLASH EFFECT: use pooled particles to avoid per-gem geometry/material allocation
        // and eliminate 20 separate requestAnimationFrame callbacks per gem (PR #117)
        spawnParticles(this.mesh.position, 0x4FC3F7, 8);
        
        // Screen flash effect - lighter blue tint (PR #117)
        const flash = document.createElement('div');
        flash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(79,195,247,0.18);pointer-events:none;z-index:500';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 100);
        
        scene.remove(this.mesh);
        // Geometry is shared across all ExpGem instances - do not dispose it
        this.mesh.material.dispose(); // Only dispose the per-instance cloned material
        if (this._outlineMat) this._outlineMat.dispose(); // Dispose per-instance outline material
        if (this._glowRingMat) this._glowRingMat.dispose(); // Dispose per-instance glow ring material
        
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
        spawnParticles(this.mesh ? this.mesh.position : new THREE.Vector3(x, 0.3, z), 0xFFD700, 8);
        spawnParticles(this.mesh ? this.mesh.position : new THREE.Vector3(x, 0.3, z), 0xFFFFFF, 2);
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
        scene.add(this.mesh);
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
          scene.add(coin);
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
        scene.add(group);
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
        scene.add(group);
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
        
        // NO MAGNET - player must walk over gold to collect it
        const dx = playerPos.x - this.mesh.position.x;
        const dz = playerPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        // Collect ONLY when player is very close
        if (dist < this.collectRange) {
          addGold(this.amount);
          playSound('coin');
          
          // Gold collect particles - 20 sparkles + flash
          spawnParticles(this.mesh.position, 0xFFD700, 8); // Reduced for performance
          spawnParticles(this.mesh.position, 0xFFFFFF, 3); // Reduced for performance
          
          // Flash effect - bright point light
          const flashLight = new THREE.PointLight(0xFFD700, 4, 8);
          flashLight.position.copy(this.mesh.position);
          flashLight.position.y += 1;
          scene.add(flashLight);
          flashLights.push(flashLight);
          const timeoutId = setTimeout(() => {
            scene.remove(flashLight);
            const idx = flashLights.indexOf(flashLight);
            if (idx > -1) flashLights.splice(idx, 1);
            const tidx = activeTimeouts.indexOf(timeoutId);
            if (tidx > -1) activeTimeouts.splice(tidx, 1);
          }, 100);
          activeTimeouts.push(timeoutId);
          
          this.destroy();
        }
      }
      
      destroy() {
        this.active = false;
        
        if (this.type === 'multiple' && this.coins) {
          // Clean up multiple coins
          this.coins.forEach(coinData => {
            scene.remove(coinData.mesh);
            coinData.mesh.geometry.dispose();
            coinData.mesh.material.dispose();
          });
        } else if (this.mesh) {
          // Clean up single mesh or group
          if (this.glowLight) {
            this.mesh.remove(this.glowLight);
          }
          scene.remove(this.mesh);
          
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
            particleColor: 0xFFFFFF, // White particles
            intensity: 1.0
          },
          uncommon: {
            bodyColor: 0x4A7C59,    // Dark Green
            lidColor: 0x6B8E23,     // Olive Green
            emissive: 0x00FF00,     // Green
            lightColor: 0x00FF00,   // Green light
            particleColor: 0x00FF00, // Green particles
            intensity: 1.3
          },
          rare: {
            bodyColor: 0x4169E1,    // Royal Blue
            lidColor: 0x1E90FF,     // Dodger Blue
            emissive: 0x0080FF,     // Blue
            lightColor: 0x0080FF,   // Blue light
            particleColor: 0x0080FF, // Blue particles
            intensity: 1.6
          },
          epic: {
            bodyColor: 0x8B00FF,    // Purple
            lidColor: 0xDA70D6,     // Orchid
            emissive: 0xA020F0,     // Purple
            lightColor: 0xA020F0,   // Purple light
            particleColor: 0xA020F0, // Purple particles
            intensity: 2.0
          },
          mythical: {
            bodyColor: 0xFF4500,    // Orange-Red
            lidColor: 0xFF6347,     // Tomato
            emissive: 0xFF0000,     // Red
            lightColor: 0xFF8C00,   // Dark Orange
            particleColor: 0xFF0000, // Red particles
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
        scene.add(this.mesh);
        
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
        spawnParticles(this.mesh.position, props.particleColor, 8); // Reduced for performance
        spawnParticles(this.mesh.position, 0xFFFFFF, 4); // Reduced for performance
        
        // Add glowing light effect with tier-specific color
        const glowLight = new THREE.PointLight(props.lightColor, props.intensity, 6);
        glowLight.position.copy(this.mesh.position);
        glowLight.position.y += 0.5;
        scene.add(glowLight);
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
        
        // Check if player is close enough to open
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
        
        // Explosion of particles
        spawnParticles(this.mesh.position, 0xFFD700, 15); // Reduced for performance
        spawnParticles(this.mesh.position, 0xFFFFFF, 8); // Reduced for performance
        spawnParticles(this.mesh.position, 0xFF69B4, 5); // Reduced for performance
        
        // Flash effect
        const flashLight = new THREE.PointLight(0xFFD700, 8, 15);
        flashLight.position.copy(this.mesh.position);
        flashLight.position.y += 2;
        scene.add(flashLight);
        flashLights.push(flashLight);
        const timeoutId = setTimeout(() => {
          scene.remove(flashLight);
          const idx = flashLights.indexOf(flashLight);
          if (idx > -1) flashLights.splice(idx, 1);
          const tidx = activeTimeouts.indexOf(timeoutId);
          if (tidx > -1) activeTimeouts.splice(tidx, 1);
        }, 200);
        activeTimeouts.push(timeoutId);
        
        // Give player reward
        this.giveReward();

        // Notify SSB of chest open with tier rarity
        if (window.pushSuperStatEvent) {
          const tr = this.tier === 'mythical' ? 'mythic' : (this.tier || 'common');
          window.pushSuperStatEvent(`🎁 ${(this.tier||'Common').toUpperCase()} Chest!`, tr, '🎁', 'success');
        }
        
        // Remove chest after short delay
        const destroyTimeoutId = setTimeout(() => {
          this.destroy();
        }, 2000);
        activeTimeouts.push(destroyTimeoutId);
      }
      
      giveReward() {
        // Determine reward type
        const rand = Math.random();
        // Rarity label for SSB notification color
        const tierRarity = this.tier === 'mythical' ? 'mythic' : (this.tier || 'common');
        
        if (rand < 0.35) {
          // Health restore (35% chance)
          const healAmount = 50;
          const prevHp = playerStats.hp;
          playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + healAmount);
          const actualHeal = playerStats.hp - prevHp;
          createFloatingText(`+${actualHeal} HP!`, this.mesh.position);
          showStatChange(`🎁 Chest: +${actualHeal} HP!`);
          if (window.pushSuperStatEvent) window.pushSuperStatEvent(`🎁 +${actualHeal} HP from ${(this.tier||'Common')} Chest`, tierRarity, '❤️', 'success');
          spawnParticles(this.mesh.position, 0xFF69B4, 10); // Reduced for performance
        } else if (rand < 0.6) {
          // Gold (25% chance)
          const goldAmount = 12 + Math.floor(Math.random() * 19); // 12-30 gold (reduced from 20-50)
          addGold(goldAmount);
          createFloatingText(`+${goldAmount} Gold!`, this.mesh.position);
          showStatChange(`🎁 Chest: +${goldAmount} Gold!`);
          if (window.pushSuperStatEvent) window.pushSuperStatEvent(`🎁 +${goldAmount} Gold!`, tierRarity, '💰', 'success');
        } else if (rand < 0.85) {
          // Random perk/stat boost (25% chance)
          this.applyRandomPerk();
        } else {
          // Weapon attachment or upgrade hint (15% chance)
          createFloatingText('Weapon Enhanced!', this.mesh.position);
          // Apply a small weapon boost - check if weapon exists
          if (weapons && weapons.gun && weapons.gun.active) {
            weapons.gun.damage += 5;
            showStatChange('🎁 Chest: Gun Damage +5');
            if (window.pushSuperStatEvent) window.pushSuperStatEvent('🎁 Gun Damage +5!', tierRarity, '🔫', 'success');
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
              showStatChange('Chest: +10% Move Speed');
            } else {
              showStatChange('Chest: Max Speed Reached');
            }
          }},
          { name: 'Damage Boost', apply: () => { 
            playerStats.strength += 0.1;
            showStatChange('Chest: +10% Damage');
          }},
          { name: 'Health Boost', apply: () => { 
            playerStats.maxHp += 20;
            playerStats.hp += 20;
            showStatChange('Chest: +20 Max HP');
          }},
          { name: 'Armor Boost', apply: () => { 
            playerStats.armor = Math.min(80, playerStats.armor + 8);
            showStatChange('Chest: +8% Armor');
          }},
          { name: 'Attack Speed', apply: () => {
            // Cap minimum cooldown at 300ms to prevent performance issues
            if (weapons.gun.cooldown > 300) {
              weapons.gun.cooldown *= 0.9;
              showStatChange('Chest: +10% Attack Speed');
            } else {
              showStatChange('Chest: Max Attack Speed');
            }
          }}
        ];
        
        const perk = perks[Math.floor(Math.random() * perks.length)];
        perk.apply();
        createFloatingText(perk.name + '!', this.mesh.position);
        const pRarity = this.tier === 'mythical' ? 'mythic' : (this.tier || 'common');
        if (window.pushSuperStatEvent) window.pushSuperStatEvent(`🎁 ${perk.name}!`, pRarity, '⭐', 'success');
      }
      
      destroy() {
        this.active = false;
        scene.remove(this.mesh);
        if (this.glowLight) {
          scene.remove(this.glowLight);
        }
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        if (this.lid) {
          this.lid.geometry.dispose();
          this.lid.material.dispose();
        }
      }
    }

