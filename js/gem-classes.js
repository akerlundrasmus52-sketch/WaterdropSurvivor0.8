// js/gem-classes.js — ExpGem, GoldCoin, GoldDrop, and Chest pickup classes.
// Handles pickup animation, magnetism, collection effects.
// Depends on: THREE (CDN), variables from main.js

    // Shared geometry/material caches for ExpGem (created once, reused across all instances)
    let _expGemStarGeometry = null;
    let _expGemStarMaterial = null;
    let _expGemOutlineGeometry = null;

    // Launch-style table — hoisted once to avoid per-gem allocations/GC churn
    // Weighted: 'pop' appears twice so it fires ~33% of the time
    const _GEM_LAUNCH_STYLES = ['pop', 'pop', 'lob', 'drop', 'tumble', 'overhead'];

    // EXP gem tier colours — colour-coded by enemy difficulty tier
    // Common (tier 0): Grey | Green (tier 1) | Blue (tier 2) | Purple (tier 3) | Orange (tier 4) | Red (tier 5) | Mythical (tier 6)
    const GEM_TIER_COLORS = [
      { color: 0xEEEEFF, emissive: 0xBBCCFF }, // 0 — Common  (Bright White-Grey)
      { color: 0x66FF88, emissive: 0x33AA44 }, // 1 — Uncommon (Bright Green)
      { color: 0x88CCFF, emissive: 0x4499DD }, // 2 — Rare (Bright Blue)
      { color: 0xCC88FF, emissive: 0x9933CC }, // 3 — Epic (Bright Purple)
      { color: 0xFFCC44, emissive: 0xFF8800 }, // 4 — Boss (Bright Gold/Orange)
      { color: 0xFF5555, emissive: 0xCC1100 }, // 5 — Legendary (Bright Red)
      { color: 0xFFDD00, emissive: 0xFF8C00 }  // 6 — Mythical (Bright Gold shimmer)
    ];

    // XP multiplier per gem tier — higher tiers give more EXP
    const GEM_TIER_XP_MULT = [1, 2, 3, 5, 10, 18, 40];

    // Map enemy type → gem tier
    function _gemTierForType(enemyType) {
      if (enemyType === 11) return 6;                               // FlyingBoss → Mythical
      if (enemyType === 10) return 5;                               // MiniBoss → Legendary (Red)
      if (enemyType === 9 || (enemyType >= 12 && enemyType <= 16)) return 3; // Elite + Bug variants (purple)
      if (enemyType >= 5 && enemyType <= 8) return 2;              // Flying/Hard variants (blue)
      if (enemyType === 3 || enemyType === 4) return 1;            // Slowing/Ranged (green)
      return 0; // Common: Tank(0), Fast(1), Balanced(2) — and unknown/null types
    }

    // Rarity colors based on gem value (overrides tier color).
    // Value 1-5: Common (White/Light Blue) | 6-15: Rare (Deep Blue) |
    // 16-30: Epic (Purple) | 31-49: Legendary (Gold) | 50+: Mythic (Red/Black pulsing)
    function _gemRarityColorForValue(value) {
      if (value >= 50) return { color: 0xFF5555, emissive: 0xCC1100, particle: 0xFF2200, mythic: true }; // Mythic - bright red
      if (value >= 31) return { color: 0xFFDD00, emissive: 0xFF8800, particle: 0xFFD700, mythic: false }; // Legendary - bright gold
      if (value >= 16) return { color: 0xCC88FF, emissive: 0x9933CC, particle: 0xBB66FF, mythic: false }; // Epic - bright purple
      if (value >=  6) return { color: 0x88CCFF, emissive: 0x4499DD, particle: 0x4488FF, mythic: false }; // Rare - bright blue
      return               { color: 0xEEEEFF, emissive: 0xBBCCFF, particle: 0xCCDDFF, mythic: false };    // Common - bright white-grey
    }

    class ExpGem {
      constructor(x, z, sourceWeapon, hitForce, enemyType) {
        // Use shared star geometry (created once) — 2.5x base size (100% bigger than previous 1.25x)
        if (!_expGemStarGeometry) {
          const starPoints = 5;
          const outerR = 0.28 * 0.4025 * 2.5; // 100% bigger than the 1.25x version
          const innerR = 0.12 * 0.4025 * 2.5;
          const starShape = new THREE.Shape();
          for (let i = 0; i < starPoints * 2; i++) {
            const angle = (i / (starPoints * 2)) * Math.PI * 2 - Math.PI / 2;
            const r = i % 2 === 0 ? outerR : innerR;
            if (i === 0) starShape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
            else starShape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
          }
          starShape.closePath();
          const extrudeSettings = { depth: 0.04025 * 2.5, bevelEnabled: true, bevelSize: 0.01265 * 2.5, bevelThickness: 0.01265 * 2.5, bevelSegments: 2 };
          _expGemStarGeometry = new THREE.ExtrudeGeometry(starShape, extrudeSettings);
          _expGemStarGeometry.center();
          _expGemStarMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x88CCFF,
            emissive: 0x4499DD,
            emissiveIntensity: 0.8,
            metalness: 0.2,
            roughness: 0.05,
            clearcoat: 1.0,
            clearcoatRoughness: 0.05,
            reflectivity: 0.8
          });
        }

        // Determine gem tier from enemy type, then compute base value so we can
        // choose rarity colour based on the value (Common/Rare/Epic/Legendary/Mythic).
        const tier = _gemTierForType(enemyType != null ? enemyType : -1);
        const _gemBaseValue = (typeof GAME_CONFIG !== 'undefined' ? GAME_CONFIG.expValue : 1) * (GEM_TIER_XP_MULT[tier] || 1);
        const _rarCol = _gemRarityColorForValue(_gemBaseValue);

        // Each gem gets its own material clone for per-instance emissive animation
        const starMaterial = _expGemStarMaterial.clone();
        starMaterial.color.setHex(_rarCol.color);
        starMaterial.emissive.setHex(_rarCol.emissive);
        // Store rarity data for update() pulsing and collect() particle matching
        this._rarityParticleColor = _rarCol.particle;
        this._isMythic = _rarCol.mythic;

        this.mesh = new THREE.Mesh(_expGemStarGeometry, starMaterial);

        // Pop out from enemy body in random direction — X/Z set now; Y after launch style
        // Initial horizontal offset 0.25–1.25 units from enemy (50% of previous 0.5–2.5)
        var popAngle = Math.random() * Math.PI * 2;
        var popDist  = 0.25 + Math.random() * 1.0; // 50% shorter: was 0.5-2.5
        var startX   = x + Math.cos(popAngle) * popDist;
        var startZ   = z + Math.sin(popAngle) * popDist;
        // Temporary position — Y will be overwritten after launch style selection
        this.mesh.position.set(startX, 0.5, startZ);
        this.mesh.scale.set(0.01, 0.01, 0.01);
        this._growTimer = 0;
        this._grown = false;

        // SM64-style: add black outline ring and yellow-edge highlight using a slightly larger dark mesh
        // Outline geometry is shared across all ExpGem instances (created once)
        if (!_expGemOutlineGeometry) {
          const s = new THREE.Shape();
          const pts = 5, outerO = 0.33 * 0.4025 * 2.5, innerO = 0.14 * 0.4025 * 2.5;
          for (let i = 0; i < pts * 2; i++) {
            const ang = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
            const r = i % 2 === 0 ? outerO : innerO;
            if (i === 0) s.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
            else s.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
          }
          s.closePath();
          _expGemOutlineGeometry = new THREE.ExtrudeGeometry(s, { depth: 0.0322, bevelEnabled: false });
          _expGemOutlineGeometry.center();
        }
        const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const outlineMesh = new THREE.Mesh(_expGemOutlineGeometry, outlineMat);
        outlineMesh.position.z = -0.005;
        this._outlineMat = outlineMat; // Store per-instance material for disposal
        this.mesh.add(outlineMesh);
        
        // Black edge glow ring — thin, slightly larger than the star outline, glows subtly
        const glowRingMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.65 });
        const glowRingMesh = new THREE.Mesh(_expGemOutlineGeometry, glowRingMat);
        glowRingMesh.scale.set(1.08, 1.08, 0.5);
        glowRingMesh.position.z = -0.008;
        this._glowRingMat = glowRingMat;
        this.mesh.add(glowRingMesh);

        // Use instanced rendering when available — avoids adding a separate mesh to the scene
        // for every gem, which would cause double-rendering with the InstancedMesh batch.
        if (window._instancedRenderer && window._instancedRenderer.active) {
          this._usesInstancing = true;
        } else {
          this._usesInstancing = false;
          scene.add(this.mesh);
        }

        this.active = true;

        // Dynamic spin based on weapon force — chaotic multi-axis tumble
        // Enhanced for more variety: every axis spins differently every time
        var force = hitForce || 1.0;
        var physForce = Math.min(force, 1.5); // Cap physics force to keep stars within visible/collectible range
        var isCritical = force > 1.5;
        var isExplosive = (sourceWeapon === 'homingMissile' || sourceWeapon === 'meteor' || sourceWeapon === 'fireball');
        var spinMult = isCritical ? 4.5 : isExplosive ? 6.0 : 3.0; // Increased spin multipliers
        // 50% chance of super-chaotic backwards/over-axis spin (increased from 30%)
        var extraChaos = Math.random() < 0.5 ? 2.8 : 1.0; // More chaos, more often
        // More variation in each axis — wider random ranges for truly unique spins
        this.rotSpeedX = (Math.random() * 0.35 + 0.15) * spinMult * extraChaos * (Math.random() < 0.5 ? 1 : -1);
        this.rotSpeedY = (Math.random() * 0.45 + 0.20) * spinMult * (Math.random() < 0.5 ? 1 : -1);
        this.rotSpeedZ = (Math.random() * 0.30 + 0.12) * spinMult * extraChaos * (Math.random() < 0.5 ? 1 : -1);

        // Random launch style — uses module-level table to avoid per-gem allocations
        // Adds variety: some fly over enemy head, some drop near, some tumble on ground
        var launchStyle = _GEM_LAUNCH_STYLES[Math.floor(Math.random() * _GEM_LAUNCH_STYLES.length)];
        this._launchStyle = launchStyle;

        var popSpeed, startY;
        if (launchStyle === 'lob' || launchStyle === 'overhead') {
          // High arc — flies upward to about enemy head height (~1.3-1.5 units, capped at physForce=1.5)
          popSpeed = (0.005 + Math.random() * 0.0075) * physForce; // 50% of original 0.01-0.025 range
          this.vy = (0.20 + Math.random() * 0.08) * physForce; // Keep vertical speed the same
          startY = 0.8 + Math.random() * 0.3; // Start higher
          this.gravity = -0.018; // Lighter gravity for smoother arc
          this.groundFriction = 0.50;
        } else if (launchStyle === 'drop') {
          // Mostly drops near enemy with slow "plopping" feel — varies speed
          popSpeed = (0.0025 + Math.random() * 0.006) * physForce; // 50% of original
          this.vy = (0.08 + Math.random() * 0.06) * physForce; // Low height
          startY = 1.0 + Math.random() * 0.5; // Variable start height
          this.gravity = -0.020; // Moderate gravity
          this.groundFriction = 0.45;
        } else if (launchStyle === 'tumble') {
          // Rolls along ground quickly with spinning rotation
          popSpeed = (0.01 + Math.random() * 0.015) * physForce; // 50% of original 0.02-0.05
          this.vy = (0.04 + Math.random() * 0.06) * physForce; // Very low arc
          startY = 0.3 + Math.random() * 0.2;
          this.gravity = -0.019;
          this.groundFriction = 0.72;
        } else {
          // 'pop' — classic burst with varied speed
          var speedVariation = Math.random(); // 0-1 for speed variance
          popSpeed = (0.0075 + speedVariation * 0.02) * physForce; // 50% of original 0.015-0.055
          this.vy = (0.12 + Math.random() * 0.10) * physForce; // Medium height (~1.0-1.4 units)
          startY = 0.6 + Math.random() * 0.4;
          this.gravity = -0.018;
          this.groundFriction = 0.58;
        }
        this.vx = Math.cos(popAngle) * popSpeed;
        this.vz = Math.sin(popAngle) * popSpeed;
        this.onGround = false;
        this._bounceCount = 0; // Track bounces for realistic settling
        // Apply startY — different launch styles start at different heights
        this.mesh.position.y = startY;

        this.bobPhase = Math.random() * Math.PI * 2;
        this.sparklePhase = Math.random() * Math.PI * 2;
        // Value already computed above for rarity colour selection
        this.value = _gemBaseValue;
      }

      update(playerPos) {
        if (!this.active) return;

        // Grow from invisible to full size
        if (!this._grown) {
          this._growTimer += 0.08;
          var s = Math.min(1.0, this._growTimer);
          this.mesh.scale.set(s, s, s);
          if (s >= 1.0) this._grown = true;
        }

        // Spin star in all 3 axes dynamically
        this.mesh.rotation.x += this.rotSpeedX;
        this.mesh.rotation.y += this.rotSpeedY;
        this.mesh.rotation.z += this.rotSpeedZ;

        // Gravity physics
        if (!this.onGround) {
          this.vy += this.gravity;
          this.mesh.position.x += this.vx;
          this.mesh.position.y += this.vy;
          this.mesh.position.z += this.vz;

          // Hit ground — bounce like a tumbling coin then settle
          if (this.mesh.position.y <= 0.08) {
            this.mesh.position.y = 0.08;
            this._bounceCount++;
            // Bounce: invert vertical velocity with damping coefficient
            this.vy = -this.vy * 0.38;
            this.vx *= this.groundFriction;
            this.vz *= this.groundFriction;
            // Keep spinning on X/Z during bounce — dramatic tumble feel
            if (this._bounceCount <= 2) {
              this.rotSpeedX *= 0.85;
              this.rotSpeedZ *= 0.85;
            }
            // Stop bouncing when velocity is negligible
            if (Math.abs(this.vy) < 0.006 || this._bounceCount > 4) {
              this.vy = 0;
              this.vx = 0;
              this.vz = 0;
              this.onGround = true;
              // Coin lands: kill X/Z spin gradually, keep gentle Y spin
              this.rotSpeedX = 0;
              this.rotSpeedZ = 0;
              this.rotSpeedY *= 0.25;
              // Tilt star to lay on its side on ground
              this.mesh.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.4;
              this.mesh.rotation.z = Math.random() * Math.PI * 2;
            }
          }
        } else {
          // On ground: gentle idle spin (Y only), lying flat
          this.mesh.rotation.y += this.rotSpeedY * 0.2;
        }
        
        // Pulsing emissive glow — brighter for visibility
        this.sparklePhase += 0.1;
        const pulse = 0.65 + Math.sin(this.sparklePhase) * 0.35; // 0.3–1.0 (brighter)
        this.mesh.material.emissiveIntensity = pulse;
        // Also pulse the black glow ring opacity
        if (this._glowRingMat) {
          this._glowRingMat.opacity = 0.45 + Math.sin(this.sparklePhase + 0.5) * 0.2;
        }
        // Mythic: pulse color between deep red and near-black for an ominous appearance
        if (this._isMythic) {
          const _mp = (Math.sin(this.sparklePhase * 1.8) + 1) * 0.5; // 0–1
          this.mesh.material.color.setHex(_mp > 0.5 ? 0xCC0000 : 0x220000);
          this.mesh.material.emissive.setHex(_mp > 0.5 ? 0x880000 : 0x110000);
          this.mesh.material.emissiveIntensity = 0.4 + _mp * 0.8;
        }

        // Magnet: smoothly accelerate toward player, lift off ground, fly in arc
        const dx = playerPos.x - this.mesh.position.x;
        const dz = playerPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        if (dist < magnetRange) { // Use magnetRange variable
          this.onGround = false; // lift off ground when pulled
          // Speed increases as gem gets closer (makes it feel snappy)
          var pullSpeed = 0.25 + (1 - Math.min(1, dist / magnetRange)) * 0.45;
          this.mesh.position.x += (dx / dist) * pullSpeed;
          this.mesh.position.z += (dz / dist) * pullSpeed;
          // Arc upward smoothly toward player pickup height
          var targetY = 0.4 + Math.min(1, dist / 3) * 0.4;
          var dy = targetY - this.mesh.position.y;
          this.mesh.position.y += dy * 0.18;
          // Clear ground-stall velocity so gem flies freely
          this.vx = 0;
          this.vz = 0;
          
          // Visual Trail when pulled — use gem's own rarity colour
          if (Math.random() < 0.3) {
             spawnParticles(this.mesh.position, this._rarityParticleColor || 0x4FC3F7, 1);
          }
        }

        if (dist < 0.8) { // Collect
          this.collect();
        }
      }

      collect() {
        if (!this.active) return; // guard against double-collect (important for pooled gems)
        this.active = false;
        
        // SPLASH EFFECT: particles match the gem's rarity colour
        const _pc = this._rarityParticleColor || 0x4FC3F7;
        spawnParticles(this.mesh.position, _pc, 8);

        // XP pickup screen flash REMOVED per user request
        // (Previously showed blue star flash on pickup)

        addExp(this.value);
        playSound('collect');

        if (this._pooled) {
          // Pooled: hide without disposing — mesh/materials are reused
          this.deactivate();
          if (typeof this._returnToPool === 'function') this._returnToPool(this);
        } else {
          if (!this._usesInstancing) scene.remove(this.mesh);
          // Geometry is shared across all ExpGem instances - do not dispose it
          this.mesh.material.dispose(); // Only dispose the per-instance cloned material
          if (this._outlineMat) this._outlineMat.dispose(); // Dispose per-instance outline material
          if (this._glowRingMat) this._glowRingMat.dispose(); // Dispose per-instance glow ring material
        }
      }

      /**
       * Hide the gem without removing from scene (for object-pool reuse).
       * Parks the mesh at y=-9999 so it is off-screen.
       */
      deactivate() {
        this.active = false;
        if (this.mesh) {
          this.mesh.visible = false;
          this.mesh.position.set(0, -9999, 0);
        }
      }

      /**
       * Reset gem state for re-use from an object pool.
       * Repositions, re-colours for the given enemy tier, and restarts physics.
       * Does NOT create new meshes or materials.
       */
      reset(x, z, sourceWeapon, hitForce, enemyType) {
        if (!this.mesh) return;

        // Re-compute tier / rarity colours
        const tier = _gemTierForType(enemyType != null ? enemyType : -1);
        const gemBaseValue = (typeof GAME_CONFIG !== 'undefined' ? GAME_CONFIG.expValue : 1)
          * (GEM_TIER_XP_MULT[tier] || 1);
        const rarCol = _gemRarityColorForValue(gemBaseValue);

        this.mesh.material.color.setHex(rarCol.color);
        this.mesh.material.emissive.setHex(rarCol.emissive);
        this._rarityParticleColor = rarCol.particle;
        this._isMythic = rarCol.mythic;
        this.value = gemBaseValue;

        // Reposition with pop — X/Z set now; Y will be set after launch-style is chosen
        // Initial offset 0.25–1.25 units from enemy (50% of previous 0.5–2.5)
        const popAngle = Math.random() * Math.PI * 2;
        const popDist  = 0.25 + Math.random() * 1.0; // 50% shorter: was 0.5-2.5
        const posX = x + Math.cos(popAngle) * popDist;
        const posZ = z + Math.sin(popAngle) * popDist;
        this.mesh.scale.set(0.01, 0.01, 0.01);
        this.mesh.visible = true;

        // Reset grow
        this._growTimer = 0;
        this._grown = false;

        // Reset spin based on weapon force
        // Enhanced for more variety: every axis spins differently every time
        const force = hitForce || 1.0;
        const physForce = Math.min(force, 1.5); // Cap physics force to keep stars within visible/collectible range
        const isCritical  = force > 1.5;
        const isExplosive = (sourceWeapon === 'homingMissile' || sourceWeapon === 'meteor' || sourceWeapon === 'fireball');
        const spinMult = isCritical ? 4.5 : isExplosive ? 6.0 : 3.0; // Increased spin multipliers
        const extraChaos = Math.random() < 0.5 ? 2.8 : 1.0; // More chaos, more often
        // More variation in each axis — wider random ranges for truly unique spins
        this.rotSpeedX = (Math.random() * 0.35 + 0.15) * spinMult * extraChaos * (Math.random() < 0.5 ? 1 : -1);
        this.rotSpeedY = (Math.random() * 0.45 + 0.20) * spinMult * (Math.random() < 0.5 ? 1 : -1);
        this.rotSpeedZ = (Math.random() * 0.30 + 0.12) * spinMult * extraChaos * (Math.random() < 0.5 ? 1 : -1);

        // Reset physics with varied launch styles — module-level table, no per-reset allocation
        const launchStyle = _GEM_LAUNCH_STYLES[Math.floor(Math.random() * _GEM_LAUNCH_STYLES.length)];
        this._launchStyle = launchStyle;
        let popSpeed, startY;
        if (launchStyle === 'lob' || launchStyle === 'overhead') {
          // High arc — flies upward to about enemy head height (~1.3-1.5 units, capped at physForce=1.5)
          popSpeed = (0.005 + Math.random() * 0.0075) * physForce; // 50% of original
          this.vy = (0.20 + Math.random() * 0.08) * physForce; // Keep vertical speed the same
          startY = 0.8 + Math.random() * 0.3; // Start higher
          this.gravity = -0.018; // Lighter gravity for smoother arc
          this.groundFriction = 0.50;
        } else if (launchStyle === 'drop') {
          // Mostly drops near enemy with slow "plopping" feel — varies speed
          popSpeed = (0.0025 + Math.random() * 0.006) * physForce; // 50% of original
          this.vy = (0.08 + Math.random() * 0.06) * physForce; // Low height
          startY = 1.0 + Math.random() * 0.5; // Variable start height
          this.gravity = -0.020; // Moderate gravity
          this.groundFriction = 0.45;
        } else if (launchStyle === 'tumble') {
          // Rolls along ground quickly with spinning rotation
          popSpeed = (0.01 + Math.random() * 0.015) * physForce; // 50% of original
          this.vy = (0.04 + Math.random() * 0.06) * physForce; // Very low arc
          startY = 0.3 + Math.random() * 0.2;
          this.gravity = -0.019;
          this.groundFriction = 0.72;
        } else {
          // 'pop' — classic burst with varied speed
          const speedVariation = Math.random(); // 0-1 for speed variance
          popSpeed = (0.0075 + speedVariation * 0.02) * physForce; // 50% of original
          this.vy = (0.12 + Math.random() * 0.10) * physForce; // Medium height (~1.0-1.4 units)
          startY = 0.6 + Math.random() * 0.4;
          this.gravity = -0.018;
          this.groundFriction = 0.58;
        }
        this.mesh.position.set(posX, startY, posZ);
        this.vx = Math.cos(popAngle) * popSpeed;
        this.vz = Math.sin(popAngle) * popSpeed;
        this.onGround     = false;
        this._bounceCount = 0;
        this.bobPhase     = Math.random() * Math.PI * 2;
        this.sparklePhase = Math.random() * Math.PI * 2;
        this.active       = true;
      }
    }
    // Different gold drop types based on amount
    class GoldCoin {
      constructor(x, z, amount) {
        this.amount = amount;
        this.active = true;
        this.magnetRange = 6.0;  // Base magnetic attraction range (world units)
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
          for (let i = 0; i < this.coins.length; i++) {
            const coinData = this.coins[i];
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
          }
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
        
        // Gold magnet: attracted toward player when within range
        // For 'multiple' type, measure from centerPos; for others, measure from mesh position
        const _coinOrigin = (this.type === 'multiple' && this.centerPos) ? this.centerPos : this.mesh.position;
        const dx = playerPos.x - _coinOrigin.x;
        const dz = playerPos.z - _coinOrigin.z;
        const dist = Math.sqrt(dx*dx + dz*dz);

        // Scale magnet range by player pickup stat (default 1.0)
        // playerStats.magnetRange is set by the Magnet Drop camp building (large override)
        const _ps = (typeof window.playerStats !== 'undefined' && window.playerStats) || null;
        const _pickupMult = (_ps && typeof _ps.pickupRange === 'number' && _ps.pickupRange > 0) ? _ps.pickupRange : 1.0;
        const _baseMagnetRange = this.magnetRange * _pickupMult;
        const _hasMagnetOverride = _ps && typeof _ps.magnetRange === 'number' && _ps.magnetRange > 0;
        const _magnetRange = (_hasMagnetOverride && _ps.magnetRange > _baseMagnetRange)
          ? _ps.magnetRange
          : _baseMagnetRange;

        if (dist < _magnetRange && dist > this.collectRange) {
          // Pull coin toward player (0.016 ≈ 1/60s fixed timestep approximation)
          const MAGNET_SPEED = 4.0;
          const FIXED_DT = 0.016;
          const norm = dist > 0.001 ? 1 / dist : 0;
          this.vx += dx * norm * MAGNET_SPEED * FIXED_DT;
          this.vz += dz * norm * MAGNET_SPEED * FIXED_DT;
          const speed = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
          if (speed > MAGNET_SPEED) { const sf = MAGNET_SPEED / speed; this.vx *= sf; this.vz *= sf; }
          // Move center anchor; individual coin meshes are repositioned relative to it in the animation block above
          const anchorRef = (this.type === 'multiple') ? this.centerPos : this.mesh.position;
          anchorRef.x += this.vx * FIXED_DT;
          anchorRef.z += this.vz * FIXED_DT;
        }

        // Collect when close enough
        if (dist < this.collectRange) {
          addGold(this.amount);
          playSound('coin');
          
          // Gold collect particles - sparkles + flash at pickup origin
          spawnParticles(_coinOrigin, 0xFFD700, 8); // Reduced for performance
          spawnParticles(_coinOrigin, 0xFFFFFF, 3); // Reduced for performance
          
          // Flash effect - bright point light
          const flashLight = new THREE.PointLight(0xFFD700, 4, 8);
          flashLight.position.copy(_coinOrigin);
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

    // ─── GoldDrop: Visual-only gold drop (5 tiers, purely cosmetic) ───
    // Gold is already added to player balance; these are rare visual feedback drops.
    // Tier 1: Gold Bit (tiny sparkle)   — goldAmount 1-5
    // Tier 2: Gold Coin (spinning coin) — goldAmount 6-15
    // Tier 3: Gold Stack (coin stack)   — goldAmount 16-25
    // Tier 4: Gold Pouch (small bag)    — goldAmount 26-40
    // Tier 5: Gold Pile (large pile)    — goldAmount 41+
    
    // Shared geometries for GoldDrop (created once)
    let _goldDropCoinGeo = null;
    let _goldDropBitGeo = null;

    class GoldDrop {
      constructor(x, z, goldAmount) {
        this.active = true;
        this.goldAmount = goldAmount;
        
        // Determine tier based on gold amount
        if (goldAmount >= 41) {
          this.tier = 5; // Gold Pile
        } else if (goldAmount >= 26) {
          this.tier = 4; // Gold Pouch
        } else if (goldAmount >= 16) {
          this.tier = 3; // Gold Stack
        } else if (goldAmount >= 6) {
          this.tier = 2; // Gold Coin
        } else {
          this.tier = 1; // Gold Bit
        }

        // Scale factor: higher tiers are visually larger
        const tierScales = [0, 0.5, 0.7, 0.9, 1.1, 1.4];
        this._baseScale = tierScales[this.tier];

        // Create shared geometries once
        if (!_goldDropCoinGeo) {
          _goldDropCoinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12);
        }
        if (!_goldDropBitGeo) {
          // Small diamond-like shape for gold bit
          _goldDropBitGeo = new THREE.OctahedronGeometry(0.12, 0);
        }

        // Build mesh based on tier
        this._buildMesh(x, z);
        
        // Pop out from death position (like XP stars)
        const popAngle = Math.random() * Math.PI * 2;
        const popSpeed = 0.02 + Math.random() * 0.025;
        this.vx = Math.cos(popAngle) * popSpeed;
        this.vy = 0.05 + Math.random() * 0.03;
        this.vz = Math.sin(popAngle) * popSpeed;
        this.gravity = -0.024; // tripled gravity (-0.008 × 3) — hits ground hard and fast
        this.onGround = false;
        this.groundFriction = 0.55; // increased drag (lower coefficient = stops faster on ground)

        // Spin speeds — all 3 axes
        this.rotSpeedX = (Math.random() * 0.08 + 0.03) * (Math.random() < 0.5 ? 1 : -1);
        this.rotSpeedY = (Math.random() * 0.12 + 0.08) * (Math.random() < 0.5 ? 1 : -1);
        this.rotSpeedZ = (Math.random() * 0.06 + 0.02) * (Math.random() < 0.5 ? 1 : -1);

        // Grow from invisible
        this.mesh.scale.set(0.01, 0.01, 0.01);
        this._growTimer = 0;
        this._grown = false;

        // Sparkle phase
        this.sparklePhase = Math.random() * Math.PI * 2;
        this.lifeTime = 0; // Track how long drop has been alive
        this.maxLife = 600; // Auto-fade after ~600 frames (approx 10s at 60fps, varies with frame rate)
      }

      _buildMesh(x, z) {
        const group = new THREE.Group();
        const goldColor = 0xFFD700;
        const darkGold = 0xDAA520;
        const brightGold = 0xFFEC8B;

        if (this.tier === 1) {
          // Tier 1: Gold Bit — tiny sparkling octahedron
          const mat = new THREE.MeshPhysicalMaterial({
            color: goldColor, emissive: 0xFFAA00, emissiveIntensity: 0.5,
            metalness: 0.95, roughness: 0.05, clearcoat: 1.0
          });
          const bit = new THREE.Mesh(_goldDropBitGeo, mat);
          group.add(bit);
          this._materials = [mat];

        } else if (this.tier === 2) {
          // Tier 2: Gold Coin — single spinning coin with rim detail
          const coinMat = new THREE.MeshPhysicalMaterial({
            color: goldColor, emissive: 0xFFAA00, emissiveIntensity: 0.4,
            metalness: 0.9, roughness: 0.1, clearcoat: 0.8
          });
          const coin = new THREE.Mesh(_goldDropCoinGeo, coinMat);
          coin.rotation.x = Math.PI / 2;
          group.add(coin);
          // Emblem on face (small darker circle)
          const emblemGeo = new THREE.CircleGeometry(0.1, 8);
          const emblemMat = new THREE.MeshBasicMaterial({ color: darkGold, side: THREE.DoubleSide });
          const emblem = new THREE.Mesh(emblemGeo, emblemMat);
          emblem.position.z = 0.035;
          group.add(emblem);
          this._materials = [coinMat, emblemMat];
          this._extraGeo = [emblemGeo];

        } else if (this.tier === 3) {
          // Tier 3: Gold Stack — 3 coins stacked with slight offset
          this._materials = [];
          for (let i = 0; i < 3; i++) {
            const stackMat = new THREE.MeshPhysicalMaterial({
              color: i === 2 ? brightGold : goldColor,
              emissive: 0xFFAA00, emissiveIntensity: 0.35 + i * 0.1,
              metalness: 0.9, roughness: 0.1
            });
            const stackCoin = new THREE.Mesh(_goldDropCoinGeo, stackMat);
            stackCoin.rotation.x = Math.PI / 2;
            stackCoin.position.y = i * 0.07;
            stackCoin.position.x = (Math.random() - 0.5) * 0.06;
            stackCoin.position.z = (Math.random() - 0.5) * 0.06;
            group.add(stackCoin);
            this._materials.push(stackMat);
          }

        } else if (this.tier === 4) {
          // Tier 4: Gold Pouch — round bag with coins peeking out
          const bagGeo = new THREE.SphereGeometry(0.22, 12, 12);
          const bagMat = new THREE.MeshPhysicalMaterial({
            color: 0xB8860B, metalness: 0.2, roughness: 0.8, emissive: 0x554400, emissiveIntensity: 0.2
          });
          const bag = new THREE.Mesh(bagGeo, bagMat);
          bag.scale.set(1, 1.1, 1);
          group.add(bag);
          // Knot at top
          const knotGeo = new THREE.SphereGeometry(0.09, 6, 6);
          const knotMat = new THREE.MeshBasicMaterial({ color: 0x8B6914 });
          const knot = new THREE.Mesh(knotGeo, knotMat);
          knot.position.y = 0.22;
          group.add(knot);
          // Coins peeking out
          for (let i = 0; i < 2; i++) {
            const peekMat = new THREE.MeshPhysicalMaterial({
              color: goldColor, metalness: 0.9, roughness: 0.1, emissive: 0xFFAA00, emissiveIntensity: 0.4
            });
            const peek = new THREE.Mesh(_goldDropCoinGeo, peekMat);
            peek.rotation.x = Math.PI / 2;
            peek.rotation.z = (i === 0 ? 0.4 : -0.4);
            peek.position.set(i === 0 ? -0.12 : 0.12, 0.18, 0);
            peek.scale.set(0.6, 0.6, 0.6);
            group.add(peek);
            this._materials = this._materials || [];
            this._materials.push(peekMat);
          }
          this._materials = this._materials || [];
          this._materials.push(bagMat, knotMat);
          this._extraGeo = [bagGeo, knotGeo];

        } else {
          // Tier 5: Gold Pile — large mound of gold with glow
          const pileGeo = new THREE.SphereGeometry(0.3, 10, 8);
          const pileMat = new THREE.MeshPhysicalMaterial({
            color: goldColor, emissive: 0xFFAA00, emissiveIntensity: 0.6,
            metalness: 0.95, roughness: 0.05, clearcoat: 1.0, clearcoatRoughness: 0.05
          });
          const pile = new THREE.Mesh(pileGeo, pileMat);
          pile.scale.set(1.3, 0.7, 1.3); // Flatten into pile shape
          group.add(pile);
          // Small coins scattered on top
          this._materials = [pileMat];
          this._extraGeo = [pileGeo];
          for (let i = 0; i < 4; i++) {
            const scatMat = new THREE.MeshPhysicalMaterial({
              color: brightGold, metalness: 0.9, roughness: 0.1,
              emissive: 0xFFD700, emissiveIntensity: 0.5
            });
            const scat = new THREE.Mesh(_goldDropCoinGeo, scatMat);
            const a = (i / 4) * Math.PI * 2;
            scat.position.set(Math.cos(a) * 0.15, 0.12 + Math.random() * 0.05, Math.sin(a) * 0.15);
            scat.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
            scat.scale.set(0.5, 0.5, 0.5);
            group.add(scat);
            this._materials.push(scatMat);
          }
          // Glow light for tier 5
          this._glowLight = new THREE.PointLight(0xFFD700, 1.5, 3);
          this._glowLight.position.set(0, 0.2, 0);
          group.add(this._glowLight);
        }

        // Position and add to scene
        group.position.set(x, 0.6 + Math.random() * 0.5, z);
        scene.add(group);
        this.mesh = group;
      }

      update(playerPos) {
        if (!this.active) return;

        this.lifeTime++;
        
        // Grow from invisible to full size
        if (!this._grown) {
          this._growTimer += 0.08;
          const s = Math.min(this._baseScale, this._growTimer * this._baseScale);
          this.mesh.scale.set(s, s, s);
          if (this._growTimer >= 1.0) {
            this._grown = true;
            this.mesh.scale.set(this._baseScale, this._baseScale, this._baseScale);
          }
        }

        // Spin in all 3 axes
        this.mesh.rotation.x += this.rotSpeedX;
        this.mesh.rotation.y += this.rotSpeedY;
        this.mesh.rotation.z += this.rotSpeedZ;

        // Gravity physics
        if (!this.onGround) {
          this.vy += this.gravity;
          this.mesh.position.x += this.vx;
          this.mesh.position.y += this.vy;
          this.mesh.position.z += this.vz;
          if (this.mesh.position.y <= 0.15) {
            this.mesh.position.y = 0.15;
            this.vy = 0;
            this.vx *= this.groundFriction;
            this.vz *= this.groundFriction;
            this.onGround = true;
            this.rotSpeedX *= 0.2;
            this.rotSpeedZ *= 0.2;
            this.rotSpeedY *= 0.4;
          }
        } else {
          // Gentle idle spin on ground
          this.mesh.rotation.y += this.rotSpeedY * 0.3;
        }

        // Pulsing gold emissive glow
        this.sparklePhase += 0.08;
        const pulse = 0.3 + Math.sin(this.sparklePhase) * 0.3;
        if (this._materials) {
          this._materials.forEach(m => {
            if (m.emissiveIntensity !== undefined) {
              m.emissiveIntensity = pulse;
            }
          });
        }
        // Glow light pulse (tier 5)
        if (this._glowLight) {
          this._glowLight.intensity = 1.0 + Math.sin(this.sparklePhase * 1.5) * 0.8;
        }

        // Sparkle particles (rare, more for higher tiers)
        if (this.onGround && Math.random() < 0.02 * this.tier) {
          spawnParticles(this.mesh.position, 0xFFD700, 1);
        }

        // Fade out near end of life
        if (this.lifeTime > this.maxLife - 60) {
          const fadeProgress = (this.lifeTime - (this.maxLife - 60)) / 60;
          const fadeScale = this._baseScale * (1 - fadeProgress);
          this.mesh.scale.set(fadeScale, fadeScale, fadeScale);
          if (this.lifeTime >= this.maxLife) {
            this.destroy();
            return;
          }
        }

        // Player pickup — walk over to collect (visual only, no gold added)
        const dx = playerPos.x - this.mesh.position.x;
        const dz = playerPos.z - this.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Light magnet pull when very close (direct position, no gravity reset)
        if (dist < 2.0) {
          this.mesh.position.x += (dx / dist) * 0.15;
          this.mesh.position.z += (dz / dist) * 0.15;
          const dy = 0.4 - this.mesh.position.y;
          this.mesh.position.y += dy * 0.08;
        }

        if (dist < 0.9) {
          this.collect();
        }
      }

      collect() {
        // Visual-only collection — gold was already added to balance
        spawnParticles(this.mesh.position, 0xFFD700, 6 + this.tier * 2);
        spawnParticles(this.mesh.position, 0xFFFFFF, 2);

        // Gold flash effect (stronger for higher tiers)
        const flash = document.createElement('div');
        const alpha = 0.08 + this.tier * 0.03;
        flash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,215,0,' + alpha + ');pointer-events:none;z-index:500';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 80);

        playSound('coin');
        this.destroy();
      }

      destroy() {
        this.active = false;
        if (this._glowLight) {
          this.mesh.remove(this._glowLight);
        }
        scene.remove(this.mesh);
        // Dispose per-instance materials
        if (this._materials) {
          this._materials.forEach(m => m.dispose());
        }
        // Dispose per-instance extra geometries
        if (this._extraGeo) {
          this._extraGeo.forEach(g => g.dispose());
        }
        // Traverse group children for any remaining
        this.mesh.traverse((child) => {
          if (child.geometry && child.geometry !== _goldDropCoinGeo && child.geometry !== _goldDropBitGeo) {
            child.geometry.dispose();
          }
        });
      }
    }

