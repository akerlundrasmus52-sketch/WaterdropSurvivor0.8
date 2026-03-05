// js/world-gen.js — 3D world generation (createWorld): terrain, landmarks, Stonehenge, Eiffel Tower,
// windmill, trees, rocks, water features. Also: animated object caching, graphics quality settings.
// Depends on: THREE (CDN), scene from main.js

    // --- WORLD GENERATION ---
    function createWorld() {
      // Ground - Unified green forest world with grass texture
      const mapSize = 600;
      
      // Generate procedural grass texture via canvas for visual depth
      const grassCanvas = document.createElement('canvas');
      grassCanvas.width = 256;
      grassCanvas.height = 256;
      const gctx = grassCanvas.getContext('2d');
      // Base color
      gctx.fillStyle = '#2D5A1A';
      gctx.fillRect(0, 0, 256, 256);
      // Scatter grass blades / noise for 3D feel
      for (let i = 0; i < 3000; i++) {
        const gx = Math.random() * 256;
        const gy = Math.random() * 256;
        const shade = Math.random();
        if (shade < 0.3) {
          gctx.fillStyle = 'rgba(40, 80, 20, 0.6)';  // darker patch
        } else if (shade < 0.7) {
          gctx.fillStyle = 'rgba(55, 110, 35, 0.5)';  // mid-green blade
        } else {
          gctx.fillStyle = 'rgba(80, 140, 50, 0.4)';  // lighter blade
        }
        gctx.fillRect(gx, gy, 1 + Math.random() * 2, 2 + Math.random() * 4);
      }
      // Scatter tiny flower dots
      for (let i = 0; i < 80; i++) {
        const fx = Math.random() * 256;
        const fy = Math.random() * 256;
        const fc = Math.random();
        if (fc < 0.3) gctx.fillStyle = 'rgba(255, 255, 100, 0.7)'; // yellow
        else if (fc < 0.6) gctx.fillStyle = 'rgba(255, 200, 200, 0.6)'; // pink
        else gctx.fillStyle = 'rgba(200, 200, 255, 0.5)'; // blue
        gctx.beginPath();
        gctx.arc(fx, fy, 1.5, 0, Math.PI * 2);
        gctx.fill();
      }
      const grassTexture = new THREE.CanvasTexture(grassCanvas);
      grassTexture.wrapS = THREE.RepeatWrapping;
      grassTexture.wrapT = THREE.RepeatWrapping;
      grassTexture.repeat.set(60, 60);
      
      // Single lush green ground plane covering the whole map
      const mainGroundGeo = new THREE.PlaneGeometry(mapSize, mapSize, 32, 32);
      const mainGroundMat = new THREE.MeshStandardMaterial({ map: grassTexture, roughness: 0.92, metalness: 0.0, vertexColors: true });

      // Per-vertex color variation for organic ground appearance
      const _gColors = [];
      const _gPos = mainGroundGeo.attributes.position;
      for (let _gi = 0; _gi < _gPos.count; _gi++) {
        const _gx = _gPos.getX(_gi);
        const _gPlaneY = _gPos.getY(_gi); // PlaneGeometry is in XY; this axis becomes -Z after rotation
        const _noise = (Math.sin(_gx * 0.3) * Math.cos(_gPlaneY * 0.3) + Math.sin(_gx * 0.7 + _gPlaneY * 0.5)) * 0.5 + 0.5;
        _gColors.push(0.18 + _noise * 0.08, 0.45 + _noise * 0.15, 0.1 + _noise * 0.05);
      }
      mainGroundGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(_gColors), 3));
      const mainGround = new THREE.Mesh(mainGroundGeo, mainGroundMat);
      mainGround.rotation.x = -Math.PI / 2;
      mainGround.position.set(0, 0, 0);
      mainGround.receiveShadow = true;
      scene.add(mainGround);

      // Decorative terrain hills/bumps for visual depth (low-profile so they don't block movement)
      const hillMat = new THREE.MeshStandardMaterial({ color: 0x2D5A1A, roughness: 0.96, metalness: 0.0 });
      const hillDataList = [
        { x: -60, z: 30, rx: 8, ry: 1.4, rz: 7 }, { x: 80, z: -20, rx: 10, ry: 1.6, rz: 8 },
        { x: -40, z: -70, rx: 12, ry: 1.8, rz: 10 }, { x: 70, z: 80, rx: 9, ry: 1.5, rz: 7 },
        { x: -80, z: 60, rx: 11, ry: 1.3, rz: 9 }, { x: 100, z: -60, rx: 7, ry: 1.2, rz: 6 },
        { x: 30, z: 90, rx: 8, ry: 1.4, rz: 7 }, { x: -100, z: -40, rx: 13, ry: 1.9, rz: 11 },
        { x: -20, z: 80, rx: 6, ry: 1.1, rz: 5 }, { x: 110, z: 40, rx: 9, ry: 1.3, rz: 8 },
      ];
      hillDataList.forEach(h => {
        const hillGeo = new THREE.SphereGeometry(1, 10, 8);
        const hillMesh = new THREE.Mesh(hillGeo, hillMat);
        hillMesh.scale.set(h.rx, h.ry, h.rz);
        hillMesh.position.set(h.x, 0, h.z);
        hillMesh.castShadow = true;
        hillMesh.receiveShadow = true;
        scene.add(hillMesh);
      });

      // === REGION GROUND TRANSITIONS ===
      // Desert region (east side) - sandy ground overlay with smooth blend
      const desertGradCanvas = document.createElement('canvas');
      desertGradCanvas.width = 128; desertGradCanvas.height = 128;
      const dCtx = desertGradCanvas.getContext('2d');
      const dGrad = dCtx.createRadialGradient(64, 64, 10, 64, 64, 64);
      dGrad.addColorStop(0, 'rgba(210,180,120,0.7)');
      dGrad.addColorStop(0.6, 'rgba(190,160,100,0.4)');
      dGrad.addColorStop(1, 'rgba(190,160,100,0)');
      dCtx.fillStyle = dGrad; dCtx.fillRect(0, 0, 128, 128);
      const desertTex = new THREE.CanvasTexture(desertGradCanvas);
      const desertOverlay = new THREE.Mesh(
        new THREE.PlaneGeometry(160, 160),
        new THREE.MeshStandardMaterial({ map: desertTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
      );
      desertOverlay.rotation.x = -Math.PI / 2;
      desertOverlay.position.set(120, 0.01, -80);
      scene.add(desertOverlay);

      // Snow region (northwest) - white ground overlay
      const snowGradCanvas = document.createElement('canvas');
      snowGradCanvas.width = 128; snowGradCanvas.height = 128;
      const sCtx = snowGradCanvas.getContext('2d');
      const sGrad = sCtx.createRadialGradient(64, 64, 10, 64, 64, 64);
      sGrad.addColorStop(0, 'rgba(230,240,255,0.65)');
      sGrad.addColorStop(0.6, 'rgba(220,230,240,0.35)');
      sGrad.addColorStop(1, 'rgba(220,230,240,0)');
      sCtx.fillStyle = sGrad; sCtx.fillRect(0, 0, 128, 128);
      const snowTex = new THREE.CanvasTexture(snowGradCanvas);
      const snowOverlay = new THREE.Mesh(
        new THREE.PlaneGeometry(160, 160),
        new THREE.MeshStandardMaterial({ map: snowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
      );
      snowOverlay.rotation.x = -Math.PI / 2;
      snowOverlay.position.set(-120, 0.01, -100);
      scene.add(snowOverlay);

      // Darker forest floor ring around the fountain spawn area
      const forestRingMat = new THREE.MeshStandardMaterial({ color: 0x2E5A1A, roughness: 0.9, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }); // Dark forest green with shading - polygon offset prevents z-fighting
      const forestRingGeo = new THREE.RingGeometry(12, 45, 32);
      const forestRingMesh = new THREE.Mesh(forestRingGeo, forestRingMat);
      forestRingMesh.rotation.x = -Math.PI / 2;
      forestRingMesh.position.set(0, 0.005, 0);
      forestRingMesh.receiveShadow = true;
      scene.add(forestRingMesh);
      
      // NOTE: Lake defined later using enhanced reflective lake
      
      // Add water ripple effect
      const rippleGeo = new THREE.RingGeometry(14, 15, 16); // Reduced segments for performance
      const rippleMat = new THREE.MeshBasicMaterial({ color: 0x3399FF, transparent: true, opacity: 0.5, depthWrite: false });
      const ripple = new THREE.Mesh(rippleGeo, rippleMat);
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.set(30, 0.04, -30); // raised from 0.02 → 0.04 to prevent z-fighting on mobile GPUs
      ripple.userData = { isWaterRipple: true, phase: 0 };
      scene.add(ripple);

      // Phase 5: New Map Design - Clean Rondel and Main Paths (replacing Wagon Roads)
      
      // Central Rondel - Circular paved/gravel area around statue
      const rondelMat = new THREE.MeshPhysicalMaterial({ 
        color: 0xB0C4DE, // Light steel blue - matches water theme
        metalness: 0.1,
        roughness: 0.7,
      });
      const rondelRadius = 10;
      const rondelGeo = new THREE.CircleGeometry(rondelRadius, 64);
      const rondel = new THREE.Mesh(rondelGeo, rondelMat);
      rondel.rotation.x = -Math.PI/2;
      rondel.position.set(0, 0.02, 0);
      rondel.receiveShadow = true;
      scene.add(rondel);
      
      // Path material - brown dirt road
      const roadMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x8B7355, // Brown dirt
        metalness: 0.0,
        roughness: 0.9,
      });
      
      // Grass strip material for middle of roads
      const grassStripMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x5A7D3C, // Darker green grass
        metalness: 0.0,
        roughness: 0.85,
      });
      
      // Helper function to create a narrow dirt trail to landmarks
      function createTrail(startX, startZ, endX, endZ) {
        const trailWidth = 1.5; // Narrow trail
        const length = Math.sqrt((endX - startX) ** 2 + (endZ - startZ) ** 2);
        const angle = Math.atan2(endZ - startZ, endX - startX);
        const midX = (startX + endX) / 2;
        const midZ = (startZ + endZ) / 2;
        
        // Create narrow dirt trail (no grass strip)
        const roadGeo = new THREE.PlaneGeometry(trailWidth, length);
        const road = new THREE.Mesh(roadGeo, roadMat);
        road.rotation.x = -Math.PI/2;
        road.rotation.z = angle - Math.PI/2;
        road.position.set(midX, 0.02, midZ);
        road.receiveShadow = true;
        scene.add(road);
      }
      
      // Narrow dirt trails from spawn rondel to key landmarks (no wagon roads)
      
      // 1. Trail to Stonehenge (60, 60) - Northeast direction
      createTrail(rondelRadius * 0.707, rondelRadius * 0.707, 60, 60);
      
      // 2. Trail to Windmill (40, 40) - East direction
      createTrail(rondelRadius * 0.9, rondelRadius * 0.436, 40, 40);
      
      // 3. Trail to Tesla Tower (-80, -80) - Southwest direction
      createTrail(-rondelRadius * 0.707, -rondelRadius * 0.707, -80, -80);
      
      // 4. Trail to Pyramid (50, -50) - Southeast direction
      createTrail(rondelRadius * 0.707, -rondelRadius * 0.707, 50, -50);
      
      // 5. Trail to Lake/Waterfall (30, -30) - South direction
      createTrail(rondelRadius * 0.5, -rondelRadius * 0.866, 30, -30);
      
      // Initialise fountain/lightning spawn sequence (replaces old circle portal)
      if (window.SpawnSequence) window.SpawnSequence.init(scene);
      
      // Farm Fields - Fill empty spaces with farm texture
      // Create large farm field background (performance optimized - single large mesh)
      const farmFieldMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x6B8E23, // Olive drab green for farmland
        metalness: 0.0,
        roughness: 0.95,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      
      // Create farm field patches in strategic locations
      const farmFields = [
        { x: 20, z: 20, size: 15 },   // Near windmill
        { x: -30, z: 20, size: 20 },  // Near mine
        { x: 20, z: -20, size: 15 },  // Near lake
        { x: 45, z: 45, size: 12 },   // Around stonehenge approach
      ];
      
      farmFields.forEach(field => {
        const fieldGeo = new THREE.PlaneGeometry(field.size, field.size);
        const fieldMesh = new THREE.Mesh(fieldGeo, farmFieldMat);
        fieldMesh.rotation.x = -Math.PI/2;
        fieldMesh.position.set(field.x, 0.01, field.z);
        fieldMesh.receiveShadow = true;
        scene.add(fieldMesh);
      });

      // Wooden fences around play area - now breakable!
      window.breakableFences = []; // Store all fences for collision/damage detection
      const fenceMat = new THREE.MeshToonMaterial({ color: 0x8B4513 });
      const postGeo = new THREE.BoxGeometry(0.3, 2, 0.3);
      const railGeo = new THREE.BoxGeometry(4, 0.2, 0.2);
      
      // Create fence segments around perimeter
      for(let i=0; i<40; i++) {
        const angle = (i / 40) * Math.PI * 2;
        const x = Math.cos(angle) * 85;
        const z = Math.sin(angle) * 85;
        
        // Fence post
        const post = new THREE.Mesh(postGeo, fenceMat.clone());
        post.position.set(x, 1, z);
        post.castShadow = true;
        post.userData = { isFence: true, hp: 15, maxHp: 15, originalPosition: post.position.clone() };
        scene.add(post);
        window.breakableFences.push(post);
        
        // Fence rail
        if (i % 2 === 0) {
          const rail = new THREE.Mesh(railGeo, fenceMat.clone());
          rail.position.set(x, 1, z);
          rail.rotation.y = angle;
          rail.userData = { isFence: true, hp: 10, maxHp: 10, originalPosition: rail.position.clone(), railAngle: angle };
          scene.add(rail);
          window.breakableFences.push(rail);
        }
      }

      // Cabin (Box)
      const cabinGeo = new THREE.BoxGeometry(6, 5, 6);
      const cabinMat = new THREE.MeshToonMaterial({ color: COLORS.cabin });
      const cabin = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.set(-20, 2.5, -20);
      cabin.castShadow = true;
      cabin.receiveShadow = true;
      scene.add(cabin);

      // Windmill with improvements
      const wmGroup = new THREE.Group();
      wmGroup.position.set(40, 0, 40);
      const wmBase = new THREE.Mesh(new THREE.CylinderGeometry(2, 3, 8, 8), new THREE.MeshToonMaterial({color: 0xD2B48C})); // Beige
      wmBase.position.y = 4;
      wmBase.castShadow = true;
      wmBase.receiveShadow = true;
      wmGroup.add(wmBase);
      
      // Add door to windmill
      const wmDoor = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 3, 0.3),
        new THREE.MeshToonMaterial({color: 0x3a2a1a})
      );
      wmDoor.position.set(0, 1.5, 2.8);
      wmGroup.add(wmDoor);
      
      // Add light on windmill (glowing sphere)
      const wmLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 16, 16),
        new THREE.MeshBasicMaterial({color: 0xFFFF00})
      );
      wmLight.position.set(0, 9, 0);
      wmGroup.add(wmLight);
      
      // Add ground light circle
      const groundLightGeo = new THREE.CircleGeometry(5, 32);
      const groundLightMat = new THREE.MeshBasicMaterial({
        color: 0xFFFFAA,
        transparent: true,
        opacity: 0.2
      });
      const groundLight = new THREE.Mesh(groundLightGeo, groundLightMat);
      groundLight.rotation.x = -Math.PI/2;
      groundLight.position.set(40, 0.05, 40);
      scene.add(groundLight);
      
      // Windmill hub
      const wmHub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.5, 8),
        new THREE.MeshToonMaterial({color: 0x5A3A1A})
      );
      wmHub.rotation.x = Math.PI / 2;
      wmHub.position.set(0, 7, 2.3);
      wmGroup.add(wmHub);

      // 4 windmill sails radiating from hub — proper sail shape with arm + canvas
      const armMat = new THREE.MeshToonMaterial({color: 0x8B4513}); // Dark wood arms
      const sailMat = new THREE.MeshToonMaterial({color: 0xF5F5DC, side: THREE.DoubleSide}); // Beige canvas sails
      const bladeGroup = new THREE.Group();
      bladeGroup.position.set(0, 7, 2.4);
      wmGroup.add(bladeGroup);
      const bLen = 5.5;
      for (let bi = 0; bi < 4; bi++) {
        const angle = (bi / 4) * Math.PI * 2;
        const singleBlade = new THREE.Group();
        // Wooden arm (thin beam)
        const arm = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, bLen, 0.12),
          armMat
        );
        arm.position.set(0, bLen * 0.5, 0);
        singleBlade.add(arm);
        // Canvas sail (tapered shape using custom geometry)
        const sailShape = new THREE.Shape();
        sailShape.moveTo(0.08, 0.3);      // Start near hub
        sailShape.lineTo(0.9, 1.2);       // Widen out
        sailShape.lineTo(0.7, bLen - 0.3); // Taper toward tip
        sailShape.lineTo(0.08, bLen - 0.1); // Narrow at tip
        sailShape.lineTo(0.08, 0.3);       // Close shape
        const sailGeo = new THREE.ShapeGeometry(sailShape);
        const sail = new THREE.Mesh(sailGeo, sailMat);
        sail.position.set(0, 0, 0.06);
        singleBlade.add(sail);
        // Cross-bars on sail
        for (let cb = 0; cb < 3; cb++) {
          const crossBar = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.06, 0.06),
            armMat
          );
          crossBar.position.set(0.4, 1.0 + cb * 1.5, 0);
          singleBlade.add(crossBar);
        }
        singleBlade.rotation.z = angle;
        singleBlade.castShadow = true;
        bladeGroup.add(singleBlade);
      }

      // Spinning shadow on the ground that rotates with blades
      const windmillShadowGeo = new THREE.PlaneGeometry(0.8, bLen);
      const windmillShadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false });
      const shadowGroup = new THREE.Group();
      shadowGroup.position.set(40, 0.03, 40);
      shadowGroup.rotation.x = -Math.PI / 2;
      for (let si = 0; si < 4; si++) {
        const shadowBlade = new THREE.Mesh(windmillShadowGeo, windmillShadowMat.clone());
        const sAngle = (si / 4) * Math.PI * 2;
        shadowBlade.position.set(Math.cos(sAngle) * bLen * 0.5, Math.sin(sAngle) * bLen * 0.5, 0);
        shadowBlade.rotation.z = sAngle;
        shadowGroup.add(shadowBlade);
      }
      scene.add(shadowGroup);

      // Store blades reference for rotation animation (includes ground shadow)
      wmGroup.userData = { isWindmill: true, blades: [bladeGroup], shadowGroup: shadowGroup, hp: 600, maxHp: 600, questActive: false, light: wmLight };
      scene.add(wmGroup);
      
      // Hay bales outside windmill
      const hayBaleMat = new THREE.MeshToonMaterial({ color: 0xD4A855 }); // Golden hay color
      const hayBaleGeo = new THREE.CylinderGeometry(0.8, 0.8, 1.2, 12);
      const hayBalePositions = [
        { x: 43, z: 43, ry: 0 },
        { x: 37, z: 42, ry: Math.PI / 4 },
        { x: 38, z: 38, ry: 0 },
        { x: 44, z: 37, ry: Math.PI / 3 },
      ];
      hayBalePositions.forEach(pos => {
        const hayBale = new THREE.Mesh(hayBaleGeo, hayBaleMat);
        hayBale.position.set(pos.x, 0.6, pos.z);
        hayBale.rotation.z = Math.PI / 2; // Lay on side
        hayBale.rotation.y = pos.ry;
        hayBale.castShadow = true;
        hayBale.receiveShadow = true;
        scene.add(hayBale);
      });
      
      // Phase 5: Add "QUEST HERE" signpost at Windmill entrance
      const signpostGroup = new THREE.Group();
      signpostGroup.position.set(40, 0, 45); // In front of windmill
      
      // Signpost pole
      const signPoleGeo = new THREE.CylinderGeometry(0.2, 0.2, 3, 8);
      const signPoleMat = new THREE.MeshToonMaterial({ color: 0x8B4513 }); // Brown wood
      const signPole = new THREE.Mesh(signPoleGeo, signPoleMat);
      signPole.position.y = 1.5;
      signpostGroup.add(signPole);
      
      // Signpost board
      const signBoardGeo = new THREE.BoxGeometry(4, 1.2, 0.2);
      const signBoardMat = new THREE.MeshToonMaterial({ color: 0xD2B48C }); // Tan wood
      const signBoard = new THREE.Mesh(signBoardGeo, signBoardMat);
      signBoard.position.y = 3.2;
      signpostGroup.add(signBoard);
      
      // Add text sprite for "QUEST HERE"
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#8B0000'; // Dark red text
      ctx.font = 'bold 60px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('QUEST HERE', 256, 64);
      
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(3.5, 0.875, 1);
      sprite.position.y = 3.2;
      signpostGroup.add(sprite);
      
      scene.add(signpostGroup);

      // Farmer NPC near windmill (between windmill and barn)
      (function() {
        const farmerGroup = new THREE.Group();
        farmerGroup.position.set(44, 0, 45); // East of windmill at (40, 0, 40) — visible and interactable
        // Body
        const bodyMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 1.2, 0.5),
          new THREE.MeshToonMaterial({ color: 0x8B4513 }) // brown shirt
        );
        bodyMesh.position.y = 1.4;
        bodyMesh.castShadow = true;
        farmerGroup.add(bodyMesh);
        // Legs
        const legMat = new THREE.MeshToonMaterial({ color: 0x4b3621 }); // dark brown trousers
        [-0.2, 0.2].forEach(xOff => {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.4), legMat);
          leg.position.set(xOff, 0.6, 0);
          leg.castShadow = true;
          farmerGroup.add(leg);
        });
        // Head
        const headMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.7, 0.7),
          new THREE.MeshToonMaterial({ color: 0xf5cba7 }) // skin tone
        );
        headMesh.position.y = 2.35;
        headMesh.castShadow = true;
        farmerGroup.add(headMesh);
        // Hat brim
        const hatBrimMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.6, 0.6, 0.1, 8),
          new THREE.MeshToonMaterial({ color: 0x5C3317 })
        );
        hatBrimMesh.position.y = 2.75;
        farmerGroup.add(hatBrimMesh);
        // Hat top
        const hatTopMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.42, 0.5, 8),
          new THREE.MeshToonMaterial({ color: 0x5C3317 })
        );
        hatTopMesh.position.y = 3.05;
        farmerGroup.add(hatTopMesh);

        farmerGroup.userData = { isFarmerNPC: true };
        scene.add(farmerGroup);
        farmerNPC = farmerGroup;
      })();
      
      // Barn adjacent to windmill (not connected - placed to the north-east)
      const barnGroup = new THREE.Group();
      barnGroup.position.set(50, 0, -10); // Farm area away from Stonehenge
      // Barn body
      const barnBodyGeo = new THREE.BoxGeometry(8, 5, 10);
      const barnBodyMat = new THREE.MeshToonMaterial({ color: 0xA0522D }); // Sienna red barn
      const barnBody = new THREE.Mesh(barnBodyGeo, barnBodyMat);
      barnBody.position.y = 2.5;
      barnBody.castShadow = true;
      barnGroup.add(barnBody);
      // Barn roof
      const barnRoofGeo = new THREE.CylinderGeometry(0.1, 6, 3.5, 4);
      const barnRoofMat = new THREE.MeshToonMaterial({ color: 0x5C3317 }); // Dark brown roof
      const barnRoof = new THREE.Mesh(barnRoofGeo, barnRoofMat);
      barnRoof.position.y = 6.75;
      barnRoof.rotation.y = Math.PI / 4;
      barnRoof.castShadow = true;
      barnGroup.add(barnRoof);
      // Barn door
      const barnDoorGeo = new THREE.BoxGeometry(3, 4, 0.2);
      const barnDoorMat = new THREE.MeshToonMaterial({ color: 0x3B1A08 });
      const barnDoor = new THREE.Mesh(barnDoorGeo, barnDoorMat);
      barnDoor.position.set(0, 2, 5.1);
      barnGroup.add(barnDoor);
      // Barn loft window
      const barnWindowGeo = new THREE.BoxGeometry(1.5, 1.5, 0.2);
      const barnWindowMat = new THREE.MeshToonMaterial({ color: 0xFFD700, emissive: 0xFFAA00, emissiveIntensity: 0.3 });
      const barnWindow = new THREE.Mesh(barnWindowGeo, barnWindowMat);
      barnWindow.position.set(0, 4.5, 5.1);
      barnGroup.add(barnWindow);
      scene.add(barnGroup);
      
      // Realistic farm fields: wide soil strips with crop rows, adjacent to barn+windmill
      const fieldSoilMat = new THREE.MeshToonMaterial({ color: 0x5C3A1A }); // Rich dark soil
      const cropMat = new THREE.MeshToonMaterial({ color: 0x7CBA3E }); // Crop green
      const windmillFieldGroup = new THREE.Group();
      windmillFieldGroup.position.set(55, 0, 42); // Adjacent to windmill+barn
      // Wide field base
      const fieldBaseMesh = new THREE.Mesh(new THREE.PlaneGeometry(18, 14), new THREE.MeshToonMaterial({ color: 0x5C3A1A }));
      fieldBaseMesh.rotation.x = -Math.PI / 2;
      fieldBaseMesh.position.set(0, 0.01, 0);
      windmillFieldGroup.add(fieldBaseMesh);
      // Plowed crop rows
      for (let row = 0; row < 7; row++) {
        // Soil row (darker strip)
        const rowMesh = new THREE.Mesh(new THREE.PlaneGeometry(18, 0.6), fieldSoilMat);
        rowMesh.rotation.x = -Math.PI / 2;
        rowMesh.position.set(0, 0.02, -4.5 + row * 1.5);
        windmillFieldGroup.add(rowMesh);
        // Crop plants along row
        for (let c = 0; c < 9; c++) {
          const cropGeo = new THREE.ConeGeometry(0.25, 0.8, 5);
          const crop = new THREE.Mesh(cropGeo, cropMat);
          crop.position.set(-8 + c * 2, 0.4, -4.5 + row * 1.5);
          windmillFieldGroup.add(crop);
        }
      }
      scene.add(windmillFieldGroup);
      
      // Mine
      const mineGeo = new THREE.DodecahedronGeometry(5);
      const mineMat = new THREE.MeshToonMaterial({ color: 0x555555 });
      const mine = new THREE.Mesh(mineGeo, mineMat);
      mine.position.set(-40, 2, 40);
      scene.add(mine);
      const mineEnt = new THREE.Mesh(new THREE.CircleGeometry(2, 16), new THREE.MeshBasicMaterial({color: 0x000000}));
      mineEnt.position.set(-40, 2, 44);
      mineEnt.rotation.y = Math.PI;
      scene.add(mineEnt);

      // Phase 4: Stonehenge - Circle of big rocks - Relocated to new mystical location
      const stonehengeGroup = new THREE.Group();
      stonehengeGroup.position.set(100, 0, 80); // Moved far northeast — separated from farm area
      
      const stoneMat = new THREE.MeshToonMaterial({ color: 0x808080 }); // Gray stone
      const numStones = 30; // Real Stonehenge has ~30 stones in outer circle
      const stoneRadius = 15; // Larger circle for more realistic proportions
      
      for(let i=0; i<numStones; i++) {
        const angle = (i / numStones) * Math.PI * 2;
        const x = Math.cos(angle) * stoneRadius;
        const z = Math.sin(angle) * stoneRadius;
        
        // Vertical standing stone - realistic proportions (approx 1.5m wide × 5m tall × 1m thick)
        const stoneGeo = new THREE.BoxGeometry(1.5, 5, 1); 
        const stone = new THREE.Mesh(stoneGeo, stoneMat);
        stone.position.set(x, 2.5, z);
        stone.rotation.y = angle + Math.PI/2; // Face center
        stone.castShadow = true;
        stonehengeGroup.add(stone);
        
        // Horizontal cap stone on top (placed on every 6th stone pair for sparse distribution)
        if (i % 6 === 0 && i < 24) { // Places 4 caps total (at indices 0, 6, 12, 18)
          const nextAngle = ((i + 1) / numStones) * Math.PI * 2;
          const nextX = Math.cos(nextAngle) * stoneRadius;
          const nextZ = Math.sin(nextAngle) * stoneRadius;
          
          const capGeo = new THREE.BoxGeometry(3, 0.8, 1);
          const cap = new THREE.Mesh(capGeo, stoneMat);
          cap.position.set((x + nextX)/2, 5.4, (z + nextZ)/2);
          cap.rotation.y = angle + Math.PI/2;
          cap.castShadow = true;
          stonehengeGroup.add(cap);
        }
      }
      
      // Central altar stone - restore missing rock
      const altarGeo = new THREE.BoxGeometry(2, 1, 3);
      const altar = new THREE.Mesh(altarGeo, stoneMat);
      altar.position.set(0, 0.5, 0); // Center of Stonehenge circle
      altar.castShadow = true;
      stonehengeGroup.add(altar);
      
      scene.add(stonehengeGroup);
      
      // QUEST 6: Stonehenge Chest - Blue glowing chest for cigar quest
      const stonehengeChestGroup = new THREE.Group();
      
      // Chest body (blue rarity)
      const stoneChestGeo = new THREE.BoxGeometry(0.6, 0.5, 0.5);
      const stoneChestMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x4169E1, // Royal blue
        transparent: true,
        opacity: 0.95,
        metalness: 0.9,
        roughness: 0.2,
        emissive: 0x4169E1,
        emissiveIntensity: 0.6
      });
      const stoneChest = new THREE.Mesh(stoneChestGeo, stoneChestMat);
      stoneChest.position.y = 0.25;
      stoneChest.castShadow = true;
      stonehengeChestGroup.add(stoneChest);
      
      // Chest lid (slightly open)
      const stoneLidGeo = new THREE.BoxGeometry(0.62, 0.12, 0.52);
      const stoneLidMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x1E90FF, // Dodger blue
        metalness: 0.8,
        roughness: 0.3,
        emissive: 0x4169E1,
        emissiveIntensity: 0.4
      });
      const stoneLid = new THREE.Mesh(stoneLidGeo, stoneLidMat);
      stoneLid.position.set(0, 0.5, -0.12);
      stoneLid.rotation.x = -0.4; // Open to show blue light
      stoneLid.castShadow = true;
      stonehengeChestGroup.add(stoneLid);
      
      // Blue glow light from inside
      const blueGlowLight = new THREE.PointLight(0x4169E1, 3, 5);
      blueGlowLight.position.set(0, 0.3, 0);
      stonehengeChestGroup.add(blueGlowLight);
      
      // Position on altar
      stonehengeChestGroup.position.set(100, 1, 80); // On top of Stonehenge altar
      stonehengeChestGroup.userData = { 
        isStonehengeChest: true, 
        questItem: true,
        pickupRadius: 3 // 3 units proximity to auto-pickup
      };
      scene.add(stonehengeChestGroup);
      window.stonehengeChest = stonehengeChestGroup; // Store reference for proximity check

      // Great Pyramid of Giza - Egyptian stepped pyramid
      const mayanGroup = new THREE.Group();
      mayanGroup.position.set(50, 0, -50);
      
      // Multi-material sandstone look with weathering
      const pyramidMatLight = new THREE.MeshStandardMaterial({ color: 0xE8D5A3, roughness: 0.92, metalness: 0.0 }); // Light sandstone face
      const pyramidMatMid = new THREE.MeshStandardMaterial({ color: 0xD4B483, roughness: 0.95, metalness: 0.0 });   // Mid sandstone
      const pyramidMatDark = new THREE.MeshStandardMaterial({ color: 0xBF9B5E, roughness: 0.98, metalness: 0.0 });  // Weathered dark face
      const pyramidSteps = 6;
      const pyramidMats = [pyramidMatLight, pyramidMatMid, pyramidMatDark, pyramidMatMid, pyramidMatLight, pyramidMatMid];
      
      for(let i=0; i<pyramidSteps; i++) {
        const stepSize = 14 - i * 2;
        const stepHeight = 2.5;
        const stepGeo = new THREE.BoxGeometry(stepSize, stepHeight, stepSize);
        const step = new THREE.Mesh(stepGeo, pyramidMats[i % pyramidMats.length]);
        step.position.set(0, i * stepHeight + stepHeight/2, 0);
        step.castShadow = true;
        step.receiveShadow = true;
        mayanGroup.add(step);
      }
      
      // Capstone at top
      const pyramidCapstoneGeo = new THREE.ConeGeometry(2, 3, 4);
      const pyramidCapstoneMat = new THREE.MeshStandardMaterial({ color: 0xC8A040, roughness: 0.6, metalness: 0.3 });
      const pyramidCapstone = new THREE.Mesh(pyramidCapstoneGeo, pyramidCapstoneMat);
      pyramidCapstone.position.set(0, pyramidSteps * 2.5 + 1.5, 0);
      pyramidCapstone.rotation.y = Math.PI / 4;
      pyramidCapstone.castShadow = true;
      mayanGroup.add(pyramidCapstone);

      // Entrance/doorway at base (south face)
      const doorwayGeo = new THREE.BoxGeometry(2.5, 3.5, 0.4);
      const doorwayMat = new THREE.MeshStandardMaterial({ color: 0x2A1F0A, roughness: 1.0, metalness: 0.0 });
      const doorway = new THREE.Mesh(doorwayGeo, doorwayMat);
      doorway.position.set(0, 1.75, 7.2);
      mayanGroup.add(doorway);

      // Doorway arch top (triangular lintel)
      const lintGeo = new THREE.BoxGeometry(3.0, 0.5, 0.4);
      const lintel = new THREE.Mesh(lintGeo, pyramidMatDark);
      lintel.position.set(0, 3.75, 7.2);
      mayanGroup.add(lintel);
      
      // Phase 4: Eye of Horus on Maya Pyramid
      const eyeOfHorusGroup = new THREE.Group();
      eyeOfHorusGroup.position.set(0, pyramidSteps * 2.5 + 4, 2.5); // Front of temple
      
      // Eye outline (oval)
      const eyeOutlineGeo = new THREE.CircleGeometry(0.6, 16);
      const eyeOutlineMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const eyeOutline = new THREE.Mesh(eyeOutlineGeo, eyeOutlineMat);
      eyeOfHorusGroup.add(eyeOutline);
      
      // Eye white/sclera
      const eyeWhiteGeo = new THREE.CircleGeometry(0.3, 16);
      const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
      const eyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
      eyeWhite.position.z = 0.01;
      eyeOfHorusGroup.add(eyeWhite);
      
      // Pupil
      const pupilGeo = new THREE.CircleGeometry(0.15, 16);
      const pupilMat = new THREE.MeshBasicMaterial({ color: 0xFFD700 }); // Gold
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.z = 0.02;
      eyeOfHorusGroup.add(pupil);
      
      mayanGroup.add(eyeOfHorusGroup);
      
      // Add some decorative blocks on sides - MADE LARGER
      for(let side=0; side<4; side++) {
        const angle = (side / 4) * Math.PI * 2;
        const decorGeo = new THREE.BoxGeometry(0.8, 1.5, 0.8); // Increased from (0.5, 1, 0.5)
        const decor = new THREE.Mesh(decorGeo, new THREE.MeshToonMaterial({ color: 0xFFD700 })); // Gold
        const decorDist = 2.5; // Increased from 2
        decor.position.set(
          Math.cos(angle) * decorDist,
          pyramidSteps * 2.5 + 2.5,
          Math.sin(angle) * decorDist
        );
        decor.castShadow = true;
        mayanGroup.add(decor);
      }
      
      scene.add(mayanGroup);

      // Sand dunes around pyramid base
      const pyramidDuneMat = new THREE.MeshStandardMaterial({ color: 0xE0C878, roughness: 0.99, metalness: 0.0 });
      const pyramidDunePositions = [
        { x: 58, z: -52, rx: 0.1, rz: 0.3, sx: 5, sy: 1.2, sz: 4 },
        { x: 42, z: -57, rx: 0.2, rz: -0.2, sx: 4, sy: 0.8, sz: 3.5 },
        { x: 55, z: -42, rx: 0.1, rz: 0.1, sx: 6, sy: 1.0, sz: 3 },
        { x: 44, z: -44, rx: 0.15, rz: 0.2, sx: 3.5, sy: 0.9, sz: 3 },
        { x: 62, z: -58, rx: 0.05, rz: 0.4, sx: 4.5, sy: 1.1, sz: 3.5 },
      ];
      pyramidDunePositions.forEach(d => {
        const duneGeo = new THREE.SphereGeometry(1, 8, 6);
        const dune = new THREE.Mesh(duneGeo, pyramidDuneMat);
        dune.position.set(d.x, d.sy * 0.3, d.z);
        dune.scale.set(d.sx, d.sy, d.sz);
        dune.rotation.set(d.rx, 0, d.rz);
        dune.receiveShadow = true;
        scene.add(dune);
      });
      
      // Pyramid scattered stones — partially destroyed look (scattered/fallen stone blocks)
      const pyramidScatterMat = new THREE.MeshStandardMaterial({ color: 0xBBA080, roughness: 0.9, metalness: 0.0 });
      const pyramidScatterPositions = [
        { x: 55, z: -55, ry: 0.3, sx: 1.5, sy: 0.8, sz: 1.2 },
        { x: 44, z: -44, ry: 1.1, sx: 1.0, sy: 0.6, sz: 1.0 },
        { x: 58, z: -44, ry: 0.7, sx: 1.8, sy: 0.7, sz: 1.4 },
        { x: 43, z: -56, ry: 0.2, sx: 1.2, sy: 0.5, sz: 0.9 },
        { x: 60, z: -50, ry: 1.5, sx: 0.8, sy: 0.6, sz: 1.0 },
        { x: 47, z: -60, ry: 0.9, sx: 1.3, sy: 0.7, sz: 1.1 },
        { x: 53, z: -42, ry: 0.4, sx: 0.6, sy: 0.4, sz: 0.8 },
      ];
      pyramidScatterPositions.forEach(pos => {
        const sGeo = new THREE.BoxGeometry(pos.sx, pos.sy, pos.sz);
        const sMesh = new THREE.Mesh(sGeo, pyramidScatterMat);
        sMesh.position.set(pos.x, pos.sy / 2, pos.z);
        sMesh.rotation.y = pos.ry;
        sMesh.castShadow = true;
        sMesh.receiveShadow = true;
        scene.add(sMesh);
      });

      // Phase 4: Illuminati Pyramid - Pyramid with All-Seeing Eye, Fences, and Men in Black guards
      const illuminatiGroup = new THREE.Group();
      illuminatiGroup.position.set(-70, 0, 50); // New landmark location
      
      // Pyramid base and steps
      const illuminatiPyramidMat = new THREE.MeshToonMaterial({ color: 0xC0C0C0 }); // Silver/gray stone
      const illuminatiSteps = 5;
      
      for(let i = 0; i < illuminatiSteps; i++) {
        const stepSize = 12 - i * 2;
        const stepHeight = 2;
        const stepGeo = new THREE.BoxGeometry(stepSize, stepHeight, stepSize);
        const step = new THREE.Mesh(stepGeo, illuminatiPyramidMat);
        step.position.set(0, i * stepHeight + stepHeight/2, 0);
        step.castShadow = true;
        illuminatiGroup.add(step);
      }
      
      // Capstone (floating slightly)
      const capstoneGeo = new THREE.ConeGeometry(2, 2, 4);
      const capstoneMat = new THREE.MeshPhysicalMaterial({ 
        color: 0xFFD700, // Gold
        metalness: 0.8,
        roughness: 0.2,
        emissive: 0xFFD700,
        emissiveIntensity: 0.3
      });
      const capstone = new THREE.Mesh(capstoneGeo, capstoneMat);
      capstone.position.set(0, illuminatiSteps * 2 + 1.5, 0);
      capstone.rotation.y = Math.PI / 4;
      capstone.castShadow = true;
      illuminatiGroup.add(capstone);
      
      // All-Seeing Eye (on capstone)
      const allSeeingEyeGroup = new THREE.Group();
      allSeeingEyeGroup.position.set(0, illuminatiSteps * 2 + 1.5, 1.2);
      
      // Eye background (triangle)
      const eyeTriGeo = new THREE.CircleGeometry(0.8, 3);
      const eyeTriMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const eyeTri = new THREE.Mesh(eyeTriGeo, eyeTriMat);
      allSeeingEyeGroup.add(eyeTri);
      
      // Eye pupil
      const eyePupilGeo = new THREE.CircleGeometry(0.4, 16);
      const eyePupilMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
      const eyePupil = new THREE.Mesh(eyePupilGeo, eyePupilMat);
      eyePupil.position.z = 0.01;
      allSeeingEyeGroup.add(eyePupil);
      
      // Inner pupil
      const innerPupilGeo = new THREE.CircleGeometry(0.15, 16);
      const innerPupilMat = new THREE.MeshBasicMaterial({ color: 0x0000FF }); // Blue eye
      const innerPupil = new THREE.Mesh(innerPupilGeo, innerPupilMat);
      innerPupil.position.z = 0.02;
      allSeeingEyeGroup.add(innerPupil);
      
      illuminatiGroup.add(allSeeingEyeGroup);

      // Glowing 3D All-Seeing Eye orb hovering above the capstone peak
      const eyeOrbGeo = new THREE.SphereGeometry(0.5, 8, 8);
      const eyeOrbMat = new THREE.MeshBasicMaterial({ color: 0xFFD700, transparent: true, opacity: 0.9 });
      const eyeOrbMesh = new THREE.Mesh(eyeOrbGeo, eyeOrbMat);
      // Peak of capstone: illuminatiSteps*2 + 1.5 (base) + 1 (half cone height) + 1.5 (float gap)
      eyeOrbMesh.position.set(0, illuminatiSteps * 2 + 4, 0);
      illuminatiGroup.add(eyeOrbMesh);

      // Gold point light emanating from the eye orb (world position: illuminatiGroup + orb offset)
      const eyeOrbLight = new THREE.PointLight(0xFFD700, 2, 18);
      eyeOrbLight.position.set(
        illuminatiGroup.position.x,
        illuminatiGroup.position.y + illuminatiSteps * 2 + 4,
        illuminatiGroup.position.z
      );
      scene.add(eyeOrbLight);

      // Store references for animation in game-loop
      window._eyeOfHorusMesh  = eyeOrbMesh;
      window._eyeOfHorusLight = eyeOrbLight;
      window._eyeOfHorusPhase = 0;
      
      // Fences around pyramid (4 sides)
      const illuminatiFenceMat = new THREE.MeshToonMaterial({ color: 0x8B4513 }); // Brown
      for (let side = 0; side < 4; side++) {
        for (let i = 0; i < 8; i++) {
          const fencePostGeo = new THREE.BoxGeometry(0.3, 2, 0.3);
          const fencePost = new THREE.Mesh(fencePostGeo, illuminatiFenceMat);
          
          let x, z;
          if (side === 0) { // North
            x = -8 + i * 2;
            z = 10;
          } else if (side === 1) { // East
            x = 8;
            z = -8 + i * 2;
          } else if (side === 2) { // South
            x = 8 - i * 2;
            z = -10;
          } else { // West
            x = -8;
            z = 8 - i * 2;
          }
          
          fencePost.position.set(x, 1, z);
          fencePost.castShadow = true;
          illuminatiGroup.add(fencePost);
        }
      }
      
      // Men in Black guards (2 static sprites/shapes)
      const guardMat = new THREE.MeshToonMaterial({ color: 0x000000 }); // Black
      const guardPositions = [
        [0, 0, 12],  // Guard 1 (front)
        [0, 0, -12]  // Guard 2 (back)
      ];
      
      guardPositions.forEach(pos => {
        // Guard body (rectangle)
        const guardBodyGeo = new THREE.BoxGeometry(1, 2, 0.5);
        const guardBody = new THREE.Mesh(guardBodyGeo, guardMat);
        guardBody.position.set(pos[0], 1, pos[2]);
        guardBody.castShadow = true;
        illuminatiGroup.add(guardBody);
        
        // Guard head
        const guardHeadGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const guardHead = new THREE.Mesh(guardHeadGeo, guardMat);
        guardHead.position.set(pos[0], 2.3, pos[2]);
        guardHead.castShadow = true;
        illuminatiGroup.add(guardHead);
        
        // Sunglasses (white rectangles)
        const sunglassesGeo = new THREE.PlaneGeometry(0.5, 0.15);
        const sunglassesMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        const sunglasses = new THREE.Mesh(sunglassesGeo, sunglassesMat);
        sunglasses.position.set(pos[0], 2.3, pos[2] + 0.35);
        illuminatiGroup.add(sunglasses);
      });
      
      scene.add(illuminatiGroup);

      // Water Statue in Center - Replace brown square
      const statueGroup = new THREE.Group();
      statueGroup.position.set(0, 0, 0); // Center of map
      
      // Pedestal
      const pedestalGeo = new THREE.CylinderGeometry(1.5, 2, 1.5, 8);
      const pedestalMat = new THREE.MeshToonMaterial({ color: 0x87CEEB }); // Sky blue - matches water theme
      const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
      pedestal.position.y = 0.75;
      pedestal.castShadow = true;
      statueGroup.add(pedestal);
      
      // Water droplet statue (large blue droplet)
      const statueGeo = new THREE.SphereGeometry(1, 16, 16);
      const statueMat = new THREE.MeshPhysicalMaterial({ 
        color: COLORS.player,
        metalness: 0.3,
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.1
      });
      const statue = new THREE.Mesh(statueGeo, statueMat);
      statue.position.y = 2.5;
      statue.scale.y = 1.3; // Elongate to droplet shape
      statue.castShadow = true;
      statueGroup.add(statue);
      
      scene.add(statueGroup);

      // === FOUNTAIN AROUND CENTRAL STATUE ===
      // Circular water basin surrounding the statue
      const fountainBasinGeo = new THREE.RingGeometry(3.5, 5.5, 32);
      const fountainBasinMat = new THREE.MeshPhysicalMaterial({
        color: 0x6BAED6, // Medium blue water
        metalness: 0.2,
        roughness: 0.1,
        transparent: true,
        opacity: 0.85,
        emissive: 0x4FC3F7,
        emissiveIntensity: 0.15
      });
      const fountainBasin = new THREE.Mesh(fountainBasinGeo, fountainBasinMat);
      fountainBasin.rotation.x = -Math.PI / 2;
      fountainBasin.position.set(0, 0.04, 0);
      fountainBasin.userData = { isFountainWater: true, phase: 0 };
      scene.add(fountainBasin);

      // Fountain outer stone rim
      const fountainRimGeo = new THREE.TorusGeometry(5.5, 0.35, 8, 32);
      const fountainRimMat = new THREE.MeshToonMaterial({ color: 0xB0BEC5 }); // Light gray stone
      const fountainRim = new THREE.Mesh(fountainRimGeo, fountainRimMat);
      fountainRim.rotation.x = -Math.PI / 2;
      fountainRim.position.set(0, 0.35, 0);
      fountainRim.castShadow = true;
      scene.add(fountainRim);

      // Inner stone ring around pedestal base
      const fountainInnerRimGeo = new THREE.TorusGeometry(3.5, 0.25, 8, 24);
      const fountainInnerRim = new THREE.Mesh(fountainInnerRimGeo, fountainRimMat);
      fountainInnerRim.rotation.x = -Math.PI / 2;
      fountainInnerRim.position.set(0, 0.25, 0);
      scene.add(fountainInnerRim);

      // Fountain water jets (arcing streams from inner rim)
      window.fountainJets = [];
      for (let j = 0; j < 6; j++) {
        const jAngle = (j / 6) * Math.PI * 2;
        const jetGeo = new THREE.SphereGeometry(0.12, 6, 6);
        const jetMat = new THREE.MeshBasicMaterial({ color: 0xADD8E6, transparent: true, opacity: 0.7 });
        const jet = new THREE.Mesh(jetGeo, jetMat);
        jet.position.set(Math.cos(jAngle) * 3.5, 0.5, Math.sin(jAngle) * 3.5);
        jet.userData = { isFountainJet: true, angle: jAngle, phase: (j / 6) * Math.PI * 2 };
        scene.add(jet);
        window.fountainJets.push(jet);
      }

      // Flowers planted around fountain (outside the rim)
      const fountainFlowerColors = [0xFF69B4, 0xFF6347, 0xFFD700, 0xFF1493, 0x9370DB];
      const stemMat = new THREE.MeshToonMaterial({ color: 0x2E7D32 });
      for (let f = 0; f < 16; f++) {
        const fAngle = (f / 16) * Math.PI * 2 + 0.2;
        const fDist = 6.5 + (f % 3) * 0.8; // Vary distance slightly
        const fColor = fountainFlowerColors[f % fountainFlowerColors.length];

        // Stem
        const stemGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 4);
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.set(Math.cos(fAngle) * fDist, 0.25, Math.sin(fAngle) * fDist);
        scene.add(stem);

        // Flower head
        const petalGeo = new THREE.SphereGeometry(0.2, 6, 4);
        const petalMat = new THREE.MeshToonMaterial({ color: fColor });
        const petal = new THREE.Mesh(petalGeo, petalMat);
        petal.position.set(Math.cos(fAngle) * fDist, 0.65, Math.sin(fAngle) * fDist);
        petal.scale.y = 0.5;
        scene.add(petal);

        // Flower center
        const centerGeo = new THREE.SphereGeometry(0.08, 6, 4);
        const centerMat = new THREE.MeshToonMaterial({ color: 0xFFFF00 });
        const center = new THREE.Mesh(centerGeo, centerMat);
        center.position.set(Math.cos(fAngle) * fDist, 0.68, Math.sin(fAngle) * fDist);
        scene.add(center);
      }

      // Grass patches between flowers around fountain
      const fountainGrassMat = new THREE.MeshToonMaterial({ color: 0x4CAF50 });
      for (let g = 0; g < 24; g++) {
        const gAngle = (g / 24) * Math.PI * 2;
        const gDist = 6.0 + Math.sin(g * 1.3) * 0.5;
        const gGeo = new THREE.ConeGeometry(0.1, 0.4, 3);
        const grass = new THREE.Mesh(gGeo, fountainGrassMat);
        grass.position.set(Math.cos(gAngle) * gDist, 0.2, Math.sin(gAngle) * gDist);
        grass.rotation.x = (Math.random() - 0.5) * 0.3;
        grass.rotation.z = (Math.random() - 0.5) * 0.3;
        scene.add(grass);
      }

      // Comet Stone - Beside the lake where player spawns (brings the water droplet to life)
      const cometGroup = new THREE.Group();
      cometGroup.position.set(37, 0, -30); // Right beside lake where player spawns
      
      // Impact crater (dark brown ring)
      const craterGeo = new THREE.RingGeometry(2, 3, 16); // Reduced segments for performance
      const craterMat = new THREE.MeshToonMaterial({ color: 0x3E2723, polygonOffset: true, polygonOffsetFactor: -1 }); // Dark brown
      const crater = new THREE.Mesh(craterGeo, craterMat);
      crater.rotation.x = -Math.PI/2;
      crater.position.y = 0.05; // raised to avoid z-fighting on older GPUs
      cometGroup.add(crater);
      
      // Comet stone (dark metallic rock with glow)
      const cometGeo = new THREE.DodecahedronGeometry(1.2, 1);
      const cometMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x1a1a1a, // Very dark gray, almost black
        metalness: 0.8,
        roughness: 0.3,
        emissive: 0x4FC3F7, // Blue glow
        emissiveIntensity: 0.3
      });
      const cometStone = new THREE.Mesh(cometGeo, cometMat);
      cometStone.position.y = 0.6;
      cometStone.castShadow = true;
      // Slight tilt for dramatic effect
      cometStone.rotation.x = 0.2;
      cometStone.rotation.z = 0.3;
      cometGroup.add(cometStone);
      
      // Glowing particles around comet stone
      for(let i=0; i<8; i++) {
        const particleGeo = new THREE.SphereGeometry(0.1, 8, 8);
        const particleMat = new THREE.MeshBasicMaterial({ 
          color: 0x4FC3F7,
          transparent: true,
          opacity: 0.6
        });
        const particle = new THREE.Mesh(particleGeo, particleMat);
        const angle = (i / 8) * Math.PI * 2;
        particle.position.set(
          Math.cos(angle) * 1.5,
          0.6 + Math.random() * 0.5,
          Math.sin(angle) * 1.5
        );
        particle.userData = { 
          isCometParticle: true,
          angle: angle,
          radius: 1.5,
          speed: 0.5 + Math.random() * 0.5,
          height: particle.position.y
        };
        cometGroup.add(particle);
      }
      
      scene.add(cometGroup);

      // Farm Area near windmill
      const farmGroup = new THREE.Group();
      farmGroup.position.set(50, 0, 35); // Moved further back from spawn
      
      // Wheat field (50 stalks)
      const wheatGeo = new THREE.ConeGeometry(0.1, 0.8, 4);
      const wheatMat = new THREE.MeshToonMaterial({ color: 0xF4A460 }); // Sandy brown
      for(let i=0; i<50; i++) {
        const wheat = new THREE.Mesh(wheatGeo, wheatMat);
        wheat.position.set(
          (Math.random() - 0.5) * 8,
          0.4,
          (Math.random() - 0.5) * 8
        );
        wheat.rotation.z = (Math.random() - 0.5) * 0.2;
        farmGroup.add(wheat);
      }
      
      // Barn (8x6x10)
      const barnGeo = new THREE.BoxGeometry(8, 6, 10);
      const barnMat = new THREE.MeshToonMaterial({ color: 0x8B0000 }); // Dark red
      const barn = new THREE.Mesh(barnGeo, barnMat);
      barn.position.set(12, 3, 0);
      barn.castShadow = true;
      farmGroup.add(barn);
      
      // Phase 4: Farm fields texture/area around barn (plowed field rows)
      const barnFieldMat = new THREE.MeshToonMaterial({ color: 0x654321 }); // Brown soil
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 8; col++) {
          const fieldPlot = new THREE.Mesh(
            new THREE.PlaneGeometry(1.5, 1.5),
            barnFieldMat
          );
          fieldPlot.rotation.x = -Math.PI / 2;
          fieldPlot.position.set(
            -2 + col * 2,
            0.02,
            -6 + row * 2
          );
          farmGroup.add(fieldPlot);
        }
      }
      
      // Barn roof
      const roofGeo = new THREE.ConeGeometry(7, 3, 4);
      const roofMat = new THREE.MeshToonMaterial({ color: 0x654321 }); // Brown
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(12, 7.5, 0);
      roof.rotation.y = Math.PI/4;
      farmGroup.add(roof);
      
      // Tractor with wheels
      const tractorBody = new THREE.Mesh(
        new THREE.BoxGeometry(2, 1.5, 3),
        new THREE.MeshToonMaterial({ color: 0x228B22 }) // Forest green
      );
      tractorBody.position.set(-8, 0.75, 0);
      farmGroup.add(tractorBody);
      
      // Tractor wheels (4 wheels)
      const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8);
      const wheelMat = new THREE.MeshToonMaterial({ color: 0x333333 });
      const wheelPositions = [
        [-8.8, 0.5, 1.2], [-8.8, 0.5, -1.2],
        [-7.2, 0.5, 1.2], [-7.2, 0.5, -1.2]
      ];
      wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(...pos);
        wheel.rotation.z = Math.PI/2;
        farmGroup.add(wheel);
      });
      
      scene.add(farmGroup);

      // Crystal Tower - 6 floating crystals with animation
      const crystalGroup = new THREE.Group();
      crystalGroup.position.set(-50, 0, 0);
      
      const crystalGeo = new THREE.OctahedronGeometry(1);
      for(let i=0; i<6; i++) {
        const crystalMat = new THREE.MeshPhysicalMaterial({
          color: 0x9B59B6, // Purple
          metalness: 0.5,
          roughness: 0.1,
          emissive: 0x9B59B6,
          emissiveIntensity: 0.3,
          transparent: true,
          opacity: 0.9
        });
        const crystal = new THREE.Mesh(crystalGeo, crystalMat);
        const angle = (i / 6) * Math.PI * 2;
        crystal.position.set(
          Math.cos(angle) * 5,
          3 + i * 1.5,
          Math.sin(angle) * 5
        );
        crystal.rotation.x = Math.random() * Math.PI;
        crystal.rotation.y = Math.random() * Math.PI;
        crystal.userData = { 
          isCrystal: true, 
          phase: i * Math.PI / 3,
          orbitSpeed: 0.5 + Math.random() * 0.5
        };
        crystal.castShadow = true;
        crystalGroup.add(crystal);
      }
      
      scene.add(crystalGroup);

      // Enhanced Waterfall - 3-tier cliffs with water drops and mist
      const waterfallGroup = new THREE.Group();
      waterfallGroup.position.set(20, 0, -50);
      
      // 3-tier cliffs
      const cliffMat = new THREE.MeshToonMaterial({ color: 0x708090 }); // Slate gray
      for(let tier=0; tier<3; tier++) {
        const cliffGeo = new THREE.BoxGeometry(10, 3, 2);
        const cliff = new THREE.Mesh(cliffGeo, cliffMat);
        cliff.position.set(0, tier * 3 + 1.5, tier * 2);
        cliff.castShadow = true;
        waterfallGroup.add(cliff);
        
        // Water flow (blue plane)
        const waterGeo = new THREE.PlaneGeometry(8, 3);
        const waterMat = new THREE.MeshBasicMaterial({ 
          color: COLORS.lake,
          transparent: true,
          opacity: 0.6
        });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.position.set(0, tier * 3 + 1.5, tier * 2 + 1.1);
        water.userData = { isWaterfall: true, tier: tier };
        waterfallGroup.add(water);
      }
      
      scene.add(waterfallGroup);

      // Reflective Lake - Enhanced with realistic water properties
      const enhancedLakeGeo = new THREE.CircleGeometry(18, 48); // More segments for smoother circle
      const enhancedLakeMat = new THREE.MeshPhysicalMaterial({ 
        color: COLORS.lake,
        metalness: 0.5,
        roughness: 0.1,
        transparent: true,
        opacity: 0.85,
        reflectivity: 0.9,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: -2, // Prevent z-fighting with ground
        polygonOffsetUnits: -2
      });
      const enhancedLake = new THREE.Mesh(enhancedLakeGeo, enhancedLakeMat);
      enhancedLake.rotation.x = -Math.PI / 2;
      enhancedLake.position.set(30, 0.03, -30); // Raised slightly above ground to prevent z-fighting
      enhancedLake.receiveShadow = true;
      scene.add(enhancedLake);
      
      // Sandy shore ring around lake for visual border
      const shoreGeo = new THREE.RingGeometry(17.5, 20, 48);
      const shoreMat = new THREE.MeshStandardMaterial({ color: 0xC2B280, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      const shore = new THREE.Mesh(shoreGeo, shoreMat);
      shore.rotation.x = -Math.PI / 2;
      shore.position.set(30, 0.02, -30);
      shore.receiveShadow = true;
      scene.add(shore);
      
      // Sun sparkles on lake
      for(let i=0; i<10; i++) {
        const sparkleGeo = new THREE.CircleGeometry(0.3, 6);
        const sparkleMat = new THREE.MeshBasicMaterial({ 
          color: 0xFFFFFF,
          transparent: true,
          opacity: 0.8
        });
        const sparkle = new THREE.Mesh(sparkleGeo, sparkleMat);
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 15;
        sparkle.position.set(
          30 + Math.cos(angle) * dist,
          0.02,
          -30 + Math.sin(angle) * dist
        );
        sparkle.rotation.x = -Math.PI/2;
        sparkle.userData = { 
          isSparkle: true,
          phase: Math.random() * Math.PI * 2,
          speed: 1 + Math.random() * 2
        };
        scene.add(sparkle);
      }

      // === UNDERWATER LEGENDARY CHEST ===
      // Glowing legendary chest at the bottom/center of the lake
      const underwaterChestGroup = new THREE.Group();
      
      // Chest body (legendary gold/orange)
      const uwChestBodyGeo = new THREE.BoxGeometry(1.0, 0.8, 0.8);
      const uwChestBodyMat = new THREE.MeshPhysicalMaterial({
        color: 0xFFD700,
        metalness: 0.9,
        roughness: 0.15,
        emissive: 0xFFAA00,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.95
      });
      const uwChestBody = new THREE.Mesh(uwChestBodyGeo, uwChestBodyMat);
      uwChestBody.position.y = 0.4;
      uwChestBody.castShadow = true;
      underwaterChestGroup.add(uwChestBody);
      
      // Chest lid (slightly open, glowing)
      const uwChestLidGeo = new THREE.BoxGeometry(1.02, 0.25, 0.82);
      const uwChestLidMat = new THREE.MeshPhysicalMaterial({
        color: 0xFFC200,
        metalness: 0.85,
        roughness: 0.2,
        emissive: 0xFF8C00,
        emissiveIntensity: 0.6
      });
      const uwChestLid = new THREE.Mesh(uwChestLidGeo, uwChestLidMat);
      uwChestLid.position.set(0, 0.83, -0.15);
      uwChestLid.rotation.x = -0.5;
      underwaterChestGroup.add(uwChestLid);

      // Legendary glow effect (gold point light)
      const uwGlowLight = new THREE.PointLight(0xFFD700, 4, 8);
      uwGlowLight.position.set(0, 0.5, 0);
      underwaterChestGroup.add(uwGlowLight);
      
      // Shimmer ring below water surface
      const shimmerRingGeo = new THREE.RingGeometry(1.5, 2.2, 24);
      const shimmerRingMat = new THREE.MeshBasicMaterial({
        color: 0xFFD700,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
      });
      const shimmerRing = new THREE.Mesh(shimmerRingGeo, shimmerRingMat);
      shimmerRing.rotation.x = -Math.PI / 2;
      shimmerRing.position.y = 0.05;
      shimmerRing.userData = { isShimmerRing: true, phase: 0 };
      underwaterChestGroup.add(shimmerRing);
      
      // Place chest at lake center, slightly submerged
      underwaterChestGroup.position.set(30, -0.4, -30);
      underwaterChestGroup.userData = {
        isUnderwaterChest: true,
        collected: false,
        collectRadius: 5,
        shimmerRing: shimmerRing,
        glowLight: uwGlowLight
      };
      scene.add(underwaterChestGroup);
      window.underwaterChest = underwaterChestGroup;

      // More fences around farm area
      for(let i=0; i<20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const x = 35 + Math.cos(angle) * 15;
        const z = 35 + Math.sin(angle) * 15;
        
        const post = new THREE.Mesh(postGeo, fenceMat);
        post.position.set(x, 1, z);
        post.castShadow = true;
        scene.add(post);
        
        if (i % 2 === 0) {
          const rail = new THREE.Mesh(railGeo, fenceMat);
          rail.position.set(x, 1, z);
          rail.rotation.y = angle;
          scene.add(rail);
        }
      }

      // Montana Landmark - Snowy area in the north (snow biome)
      const montanaGroup = new THREE.Group();
      montanaGroup.position.set(0, 0, -200); // North in snow biome
      
      // Base platform
      const montanaBaseMat = new THREE.MeshToonMaterial({ color: 0xD3D3D3 }); // Light gray
      const montanaBase = new THREE.Mesh(
        new THREE.CylinderGeometry(8, 10, 3, 8),
        montanaBaseMat
      );
      montanaBase.position.y = 1.5;
      montanaBase.castShadow = true;
      montanaGroup.add(montanaBase);
      
      // Snowy mountain peaks (3 peaks)
      const montanaSnowMat = new THREE.MeshToonMaterial({ color: 0xFFFAFA }); // Snow white
      const peakPositions = [[0, 0], [-6, -3], [6, -3]];
      peakPositions.forEach((pos, idx) => {
        const peakHeight = idx === 0 ? 12 : 8;
        const peakGeo = new THREE.ConeGeometry(4, peakHeight, 4);
        const peak = new THREE.Mesh(peakGeo, montanaSnowMat);
        peak.position.set(pos[0], peakHeight/2 + 3, pos[1]);
        peak.castShadow = true;
        montanaGroup.add(peak);
      });
      
      // Pine trees around base (snow-covered)
      const snowyPineMat = new THREE.MeshToonMaterial({ color: 0x1B5E20 }); // Dark green
      for(let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const dist = 12;
        const pineGeo = new THREE.ConeGeometry(1.5, 4, 6);
        const pine = new THREE.Mesh(pineGeo, snowyPineMat);
        pine.position.set(
          Math.cos(angle) * dist,
          2,
          Math.sin(angle) * dist
        );
        pine.castShadow = true;
        montanaGroup.add(pine);
        
        // Snow cap on pine
        const snowCapGeo = new THREE.ConeGeometry(1.5, 1, 6);
        const snowCap = new THREE.Mesh(snowCapGeo, montanaSnowMat);
        snowCap.position.set(
          Math.cos(angle) * dist,
          3.5,
          Math.sin(angle) * dist
        );
        montanaGroup.add(snowCap);
      }
      
      // Montana text sign
      const montanaCanvas = document.createElement('canvas');
      montanaCanvas.width = 512;
      montanaCanvas.height = 128;
      const montanaCtx = montanaCanvas.getContext('2d');
      montanaCtx.fillStyle = '#1a237e'; // Dark blue
      montanaCtx.font = 'bold 60px Arial';
      montanaCtx.textAlign = 'center';
      montanaCtx.textBaseline = 'middle';
      montanaCtx.fillText('MONTANA', 256, 64);
      
      const montanaTexture = new THREE.CanvasTexture(montanaCanvas);
      const montanaSpriteMat = new THREE.SpriteMaterial({ map: montanaTexture });
      const montanaSprite = new THREE.Sprite(montanaSpriteMat);
      montanaSprite.scale.set(8, 2, 1);
      montanaSprite.position.y = 15;
      montanaGroup.add(montanaSprite);
      
      // Quest signpost
      const montanaSignGeo = new THREE.BoxGeometry(5, 1.5, 0.3);
      const montanaSignMat = new THREE.MeshToonMaterial({ color: 0xD2B48C });
      const montanaSign = new THREE.Mesh(montanaSignGeo, montanaSignMat);
      montanaSign.position.set(0, 2, 12);
      montanaGroup.add(montanaSign);
      
      const montanaQuestCanvas = document.createElement('canvas');
      montanaQuestCanvas.width = 512;
      montanaQuestCanvas.height = 128;
      const montanaQuestCtx = montanaQuestCanvas.getContext('2d');
      montanaQuestCtx.fillStyle = '#8B0000';
      montanaQuestCtx.font = 'bold 50px Arial';
      montanaQuestCtx.textAlign = 'center';
      montanaQuestCtx.textBaseline = 'middle';
      montanaQuestCtx.fillText('QUEST HERE', 256, 64);
      
      const montanaQuestTexture = new THREE.CanvasTexture(montanaQuestCanvas);
      const montanaQuestSpriteMat = new THREE.SpriteMaterial({ map: montanaQuestTexture });
      const montanaQuestSprite = new THREE.Sprite(montanaQuestSpriteMat);
      montanaQuestSprite.scale.set(4.5, 1.125, 1);
      montanaQuestSprite.position.set(0, 2, 12.2);
      montanaGroup.add(montanaQuestSprite);
      
      // Store reference for quest system
      montanaGroup.userData = { 
        isMontana: true
      };
      
      scene.add(montanaGroup);
      montanaLandmark = montanaGroup; // Store reference for efficient distance checks

      // Eiffel Tower Landmark - In fields/desert transition area
      const eiffelGroup = new THREE.Group();
      eiffelGroup.position.set(-80, 0, 150); // South-west in desert/fields transition
      
      // Tower structure - 4 legs converging to top
      const eiffelMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x8B7355, // Brown/bronze
        metalness: 0.6,
        roughness: 0.3
      });
      
      // Base platform
      const eiffelBaseMat = new THREE.MeshToonMaterial({ color: 0x808080 });
      const eiffelBase = new THREE.Mesh(
        new THREE.CylinderGeometry(12, 14, 2, 8),
        eiffelBaseMat
      );
      eiffelBase.position.y = 1;
      eiffelBase.castShadow = true;
      eiffelGroup.add(eiffelBase);
      
      // Four legs (corner posts)
      const legPositions = [
        [10, 0, 10], [10, 0, -10], [-10, 0, 10], [-10, 0, -10]
      ];
      legPositions.forEach(pos => {
        const legGeo = new THREE.CylinderGeometry(0.8, 1.2, 20, 6);
        const leg = new THREE.Mesh(legGeo, eiffelMat);
        leg.position.set(pos[0], 10, pos[2]);
        // Tilt legs inward
        const angle = Math.atan2(pos[2], pos[0]);
        leg.rotation.z = Math.cos(angle) * 0.15;
        leg.rotation.x = Math.sin(angle) * 0.15;
        leg.castShadow = true;
        eiffelGroup.add(leg);
      });
      
      // Mid section (narrower)
      const midSectionGeo = new THREE.CylinderGeometry(4, 8, 15, 8);
      const midSection = new THREE.Mesh(midSectionGeo, eiffelMat);
      midSection.position.y = 27.5;
      midSection.castShadow = true;
      eiffelGroup.add(midSection);
      
      // Top section (spire)
      const topSectionGeo = new THREE.CylinderGeometry(1, 4, 20, 8);
      const topSection = new THREE.Mesh(topSectionGeo, eiffelMat);
      topSection.position.y = 45;
      topSection.castShadow = true;
      eiffelGroup.add(topSection);
      
      // Spire tip
      const spireGeo = new THREE.CylinderGeometry(0.3, 1, 8, 6);
      const spire = new THREE.Mesh(spireGeo, eiffelMat);
      spire.position.y = 59;
      spire.castShadow = true;
      eiffelGroup.add(spire);
      
      // Cross beams for structure
      for(let i = 0; i < 3; i++) {
        const beamGeo = new THREE.BoxGeometry(20, 0.5, 0.5);
        const beam1 = new THREE.Mesh(beamGeo, eiffelMat);
        beam1.position.y = 5 + i * 8;
        beam1.castShadow = true;
        eiffelGroup.add(beam1);
        
        const beam2 = new THREE.Mesh(beamGeo, eiffelMat);
        beam2.position.y = 5 + i * 8;
        beam2.rotation.y = Math.PI / 2;
        beam2.castShadow = true;
        eiffelGroup.add(beam2);
      }
      
      // Eiffel text sign
      const eiffelCanvas = document.createElement('canvas');
      eiffelCanvas.width = 512;
      eiffelCanvas.height = 128;
      const eiffelCtx = eiffelCanvas.getContext('2d');
      eiffelCtx.fillStyle = '#8B0000';
      eiffelCtx.font = 'bold 55px Arial';
      eiffelCtx.textAlign = 'center';
      eiffelCtx.textBaseline = 'middle';
      eiffelCtx.fillText('EIFFEL TOWER', 256, 64);
      
      const eiffelTexture = new THREE.CanvasTexture(eiffelCanvas);
      const eiffelSpriteMat = new THREE.SpriteMaterial({ map: eiffelTexture });
      const eiffelSprite = new THREE.Sprite(eiffelSpriteMat);
      eiffelSprite.scale.set(10, 2.5, 1);
      eiffelSprite.position.y = 65;
      eiffelGroup.add(eiffelSprite);
      
      // Quest signpost
      const eiffelSignGeo = new THREE.BoxGeometry(5, 1.5, 0.3);
      const eiffelSignMat = new THREE.MeshToonMaterial({ color: 0xD2B48C });
      const eiffelSign = new THREE.Mesh(eiffelSignGeo, eiffelSignMat);
      eiffelSign.position.set(0, 2, 16);
      eiffelGroup.add(eiffelSign);
      
      const eiffelQuestCanvas = document.createElement('canvas');
      eiffelQuestCanvas.width = 512;
      eiffelQuestCanvas.height = 128;
      const eiffelQuestCtx = eiffelQuestCanvas.getContext('2d');
      eiffelQuestCtx.fillStyle = '#8B0000';
      eiffelQuestCtx.font = 'bold 50px Arial';
      eiffelQuestCtx.textAlign = 'center';
      eiffelQuestCtx.textBaseline = 'middle';
      eiffelQuestCtx.fillText('QUEST HERE', 256, 64);
      
      const eiffelQuestTexture = new THREE.CanvasTexture(eiffelQuestCanvas);
      const eiffelQuestSpriteMat = new THREE.SpriteMaterial({ map: eiffelQuestTexture });
      const eiffelQuestSprite = new THREE.Sprite(eiffelQuestSpriteMat);
      eiffelQuestSprite.scale.set(4.5, 1.125, 1);
      eiffelQuestSprite.position.set(0, 2, 16.2);
      eiffelGroup.add(eiffelQuestSprite);
      
      // Store reference for quest system
      eiffelGroup.userData = { 
        isEiffel: true
      };
      
      scene.add(eiffelGroup);
      eiffelLandmark = eiffelGroup; // Store reference for efficient distance checks

      // FRESH IMPLEMENTATION: Tesla Tower with Active Lightning Arcs
      const teslaGroup = new THREE.Group();
      teslaGroup.position.set(-80, 0, -80); // Northwest corner, distant location
      
      // Tower base - wider platform
      const teslaBaseGeo = new THREE.CylinderGeometry(3, 4, 2, 8);
      const teslaBaseMat = new THREE.MeshToonMaterial({ color: 0x555555 }); // Dark gray
      const teslaBase = new THREE.Mesh(teslaBaseGeo, teslaBaseMat);
      teslaBase.position.y = 1;
      teslaBase.castShadow = true;
      teslaGroup.add(teslaBase);
      
      // Main tower structure - scaled down to fit screen
      const teslaTowerGeo = new THREE.CylinderGeometry(1.2, 1.5, 15, 12);
      const teslaTowerMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x888888, 
        metalness: 0.8,
        roughness: 0.3
      });
      const teslaTower = new THREE.Mesh(teslaTowerGeo, teslaTowerMat);
      teslaTower.position.y = 9.5;
      teslaTower.castShadow = true;
      teslaGroup.add(teslaTower);
      
      // Support rings along tower
      for (let i = 1; i <= 4; i++) {
        const ringGeo = new THREE.TorusGeometry(1.5, 0.15, 8, 16);
        const ringMat = new THREE.MeshPhysicalMaterial({ 
          color: 0xCC8800, 
          metalness: 0.9,
          roughness: 0.2
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = i * 3 + 2;
        ring.rotation.x = Math.PI / 2;
        teslaGroup.add(ring);
      }
      
      // Top coil - large torus
      const coilGeo = new THREE.TorusGeometry(2.5, 0.3, 12, 24);
      const coilMat = new THREE.MeshPhysicalMaterial({ 
        color: 0xFFCC00, 
        metalness: 1.0,
        roughness: 0.1,
        emissive: 0xFFCC00,
        emissiveIntensity: 0.5
      });
      const coil = new THREE.Mesh(coilGeo, coilMat);
      coil.position.y = 17;
      coil.rotation.x = Math.PI / 2;
      teslaGroup.add(coil);
      
      // Central ball on top - glowing sphere
      const ballGeo = new THREE.SphereGeometry(1, 16, 16);
      const ballMat = new THREE.MeshBasicMaterial({ 
        color: 0x00FFFF, 
        emissive: 0x00FFFF,
        emissiveIntensity: 1
      });
      const ball = new THREE.Mesh(ballGeo, ballMat);
      ball.position.y = 19;
      teslaGroup.add(ball);
      
      // Add glow effect around top ball
      const glowGeo = new THREE.SphereGeometry(1.5, 16, 16);
      const glowMat = new THREE.MeshBasicMaterial({ 
        color: 0x00FFFF, 
        transparent: true,
        opacity: 0.3
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.y = 19;
      teslaGroup.add(glow);
      
      // Lightning arc points (4 ground points around tower)
      const arcPoints = [
        new THREE.Vector3(-80 + 8, 0.5, -80),
        new THREE.Vector3(-80 - 8, 0.5, -80),
        new THREE.Vector3(-80, 0.5, -80 + 8),
        new THREE.Vector3(-80, 0.5, -80 - 8)
      ];
      
      // Store Tesla Tower data for animation
      teslaGroup.userData = { 
        isTeslaTower: true,
        arcPoints: arcPoints,
        topPosition: new THREE.Vector3(-80, 19, -80),
        arcLines: [] // Will store line meshes
      };
      
      scene.add(teslaGroup);

      // Forest (Various tree types with better shadows)
      const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 2, 6);
      const trunkMat = new THREE.MeshToonMaterial({ color: 0x8B4513 });
      const leavesGeo = new THREE.ConeGeometry(2.5, 5, 8);
      const treeMat = new THREE.MeshToonMaterial({ color: COLORS.forest });
      
      // Additional tree types
      const leavesGeo2 = new THREE.SphereGeometry(2, 8, 8); // Round tree
      const treeMat2 = new THREE.MeshToonMaterial({ color: 0x90EE90 }); // Light green
      const leavesGeo3 = new THREE.ConeGeometry(2, 6, 6); // Tall pine
      const treeMat3 = new THREE.MeshToonMaterial({ color: 0x228B22 }); // Forest green
      
      // Shadow circle under trees
      const shadowGeo = new THREE.CircleGeometry(2, 16);
      const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 });
      
      // Seeded pseudo-random for deterministic tree positions.
      // Uses sin-based hash: multiplying by a large prime-like constant (10000) spreads
      // the sin output across the fractional range for good distribution.
      function seededRandom(seed) {
        const SEED_MULTIPLIER = 10000; // Large constant for wide fractional distribution
        const x = Math.sin(seed + 1) * SEED_MULTIPLIER;
        return x - Math.floor(x);
      }

      for (let i = 0; i < 120; i++) { // Increased from 50 to 120
        const group = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        
        // Deterministic tree type based on index
        const treeType = Math.floor(seededRandom(i * 7) * 3);
        let leaves;
        if (treeType === 0) {
          leaves = new THREE.Mesh(leavesGeo, treeMat);
          leaves.position.y = 4;
        } else if (treeType === 1) {
          leaves = new THREE.Mesh(leavesGeo2, treeMat2);
          leaves.position.y = 3.5;
        } else {
          leaves = new THREE.Mesh(leavesGeo3, treeMat3);
          leaves.position.y = 5;
        }
        leaves.castShadow = true;
        leaves.receiveShadow = true;
        
        group.add(trunk);
        group.add(leaves);
        // Note: shadows are cast by the dirLight shadow map - no duplicate blob shadow needed
        
        // Random pos in forest area and spread across map
        // Lake exclusion zone constants
        const LAKE_CENTER_X = 30;
        const LAKE_CENTER_Z = -30;
        const LAKE_EXCLUSION_RADIUS = 22; // Lake radius 18 + buffer 4
        const MAX_SPAWN_ATTEMPTS = 20;
        
        // Helper: distance from point (px,pz) to line segment (x1,z1)→(x2,z2)
        function distToSegment(px, pz, x1, z1, x2, z2) {
          const dx = x2 - x1, dz = z2 - z1;
          const len2 = dx * dx + dz * dz;
          if (len2 === 0) return Math.sqrt((px - x1) * (px - x1) + (pz - z1) * (pz - z1));
          const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / len2));
          return Math.sqrt((px - (x1 + t * dx)) ** 2 + (pz - (z1 + t * dz)) ** 2);
        }
        
        // Comprehensive exclusion: lake, rondel, all paths, all buildings/landmarks
        function isPositionExcluded(x, z) {
          // Lake exclusion
          const distToLake = Math.sqrt((x - LAKE_CENTER_X) ** 2 + (z - LAKE_CENTER_Z) ** 2);
          if (distToLake < LAKE_EXCLUSION_RADIUS) return true;
          
          // Rondel center exclusion
          if (Math.sqrt(x * x + z * z) < (rondelRadius + 2)) return true;
          
          // Path exclusion (5-unit buffer on each side of trail)
          const PATH_WIDTH = 5;
          const r = rondelRadius;
          if (distToSegment(x, z, r * 0.707, r * 0.707, 60, 60)   < PATH_WIDTH) return true; // → Stonehenge
          if (distToSegment(x, z, r * 0.9,   r * 0.436, 40, 40)   < PATH_WIDTH) return true; // → Windmill
          if (distToSegment(x, z, -r * 0.707, -r * 0.707, -80, -80) < PATH_WIDTH) return true; // → Tesla Tower
          if (distToSegment(x, z, r * 0.707, -r * 0.707, 50, -50) < PATH_WIDTH) return true; // → Pyramid
          if (distToSegment(x, z, r * 0.5,   -r * 0.866, 30, -30) < PATH_WIDTH) return true; // → Lake
          
          // Building exclusion zones
          if (Math.sqrt((x - 40) ** 2 + (z - 40) ** 2)   < 8)  return true; // Windmill
          if (Math.sqrt((x + 20) ** 2 + (z + 20) ** 2)   < 8)  return true; // Cabin
          if (Math.sqrt((x + 40) ** 2 + (z - 40) ** 2)   < 8)  return true; // Mine entrance
          
          // Landmark exclusion zones
          if (Math.sqrt((x - 100) ** 2 + (z - 80) ** 2)  < 22) return true; // Stonehenge
          if (Math.sqrt((x - 50) ** 2  + (z + 50) ** 2)  < 22) return true; // Pyramid
          if (Math.sqrt((x + 80) ** 2  + (z + 80) ** 2)  < 27) return true; // Tesla Tower
          if (Math.sqrt((x + 80) ** 2  + (z - 150) ** 2) < 20) return true; // Eiffel Tower
          
          return false;
        }

        // Tree-specific placement validation: extends isPositionExcluded with the Colosseum exclusion zone
        function isTreePlacementValid(x, z) {
          if (isPositionExcluded(x, z)) return false;
          if (Math.sqrt((x + 25) ** 2 + (z - 25) ** 2) < 18) return false; // Colosseum
          return true;
        }
        
        let tx, tz;
        let excluded = true;
        let attempts = 0;
        
        // Avoid spawning trees in excluded areas
        while (excluded && attempts < MAX_SPAWN_ATTEMPTS) {
          if (i < 80) {
            // First 80 trees in forest area (Top Left quadrant mostly) - seeded deterministic
            tx = (seededRandom(i * 13 + attempts * 3) * 100) - 90;
            tz = (seededRandom(i * 17 + attempts * 5) * 100) - 90;
          } else {
            // Remaining 40 trees spread across entire map - seeded deterministic
            tx = (seededRandom(i * 19 + attempts * 7) * 180) - 90;
            tz = (seededRandom(i * 23 + attempts * 11) * 180) - 90;
          }
          
          excluded = !isTreePlacementValid(tx, tz);
          attempts++;
        }
        
        // Only add tree if position is valid
        if (!excluded) {
          group.position.set(tx, 0, tz);
          scene.add(group);
        }
      }
      
      // Extra forest trees in a ring around the fountain spawn area for the forest feel
      const forestTrunkMat2 = new THREE.MeshToonMaterial({ color: 0x4A2C0A });
      const forestLeavesMat2 = new THREE.MeshToonMaterial({ color: 0x1A5C1A });
      for (let f = 0; f < 28; f++) {
        const fAngle = (f / 28) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
        const fDist = 18 + Math.random() * 8; // Ring at 18-26 units from center
        const fx = Math.cos(fAngle) * fDist;
        const fz = Math.sin(fAngle) * fDist;
        // Skip trees in the player spawn zone (player spawns at x=12, z=0) or on roads
        if (fx > 8 && fx < 20 && Math.abs(fz) < 5) continue; // Exclusion: player spawn area at (12,0,0)
        const fGroup = new THREE.Group();
        const fTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.5, 6), forestTrunkMat2);
        fTrunk.position.y = 1.25;
        fTrunk.castShadow = true;
        fTrunk.receiveShadow = true;
        const fLeaves = new THREE.Mesh(new THREE.SphereGeometry(1.2 + Math.random() * 0.5, 7, 6), forestLeavesMat2);
        fLeaves.position.y = 3.2;
        fLeaves.castShadow = true;
        fLeaves.receiveShadow = true;
        fGroup.add(fTrunk);
        fGroup.add(fLeaves);
        fGroup.position.set(fx, 0, fz);
        scene.add(fGroup);
      }
      const waterfallGroup2 = new THREE.Group();
      
      // Cliff/rock formation
      const cliffGeo2 = new THREE.BoxGeometry(8, 12, 6);
      const cliffMat2 = new THREE.MeshToonMaterial({ color: 0x696969 }); // Dark gray
      const cliff2 = new THREE.Mesh(cliffGeo2, cliffMat2);
      cliff2.position.set(30, 6, -45); // Above and behind the lake
      cliff2.castShadow = true;
      waterfallGroup2.add(cliff2);
      
      // Waterfall - multiple planes to simulate water flow
      const waterfallGeo = new THREE.PlaneGeometry(3, 12);
      const waterfallMat = new THREE.MeshBasicMaterial({ 
        color: 0x87CEEB, 
        transparent: true, 
        opacity: 0.6,
        side: THREE.DoubleSide
      });
      
      const waterfall = new THREE.Mesh(waterfallGeo, waterfallMat);
      waterfall.position.set(30, 6, -39);
      waterfall.rotation.x = -0.2; // Slight angle
      waterfall.userData = { isWaterfall: true, phase: 0 };
      waterfallGroup2.add(waterfall);
      
      // Add flowing water particles
      for(let i=0; i<5; i++) {
        const dropGeo = new THREE.SphereGeometry(0.3, 8, 8);
        const dropMat = new THREE.MeshBasicMaterial({ 
          color: 0x4ECDC4, 
          transparent: true, 
          opacity: 0.7 
        });
        const drop = new THREE.Mesh(dropGeo, dropMat);
        drop.position.set(30 + (Math.random()-0.5)*2, 12 - i*2, -39);
        drop.userData = { isWaterDrop: true, speed: 0.1 + Math.random()*0.1, startY: 12 - i*2 };
        waterfallGroup2.add(drop);
      }
      
      // Splash at bottom
      const splashGeo = new THREE.CircleGeometry(2, 16);
      const splashMat = new THREE.MeshBasicMaterial({ 
        color: 0xFFFFFF, 
        transparent: true, 
        opacity: 0.4 
      });
      const splash = new THREE.Mesh(splashGeo, splashMat);
      splash.rotation.x = -Math.PI/2;
      splash.position.set(30, 0.1, -33);
      splash.userData = { isSplash: true, phase: 0 };
      waterfallGroup2.add(splash);
      
      scene.add(waterfallGroup2);
      
      // Scatter flowers around environment
      const flowerGeo = new THREE.ConeGeometry(0.2, 0.5, 6);
      const flowerColors = [0xFF69B4, 0xFFFF00, 0xFF0000, 0xFFA500, 0xFFFFFF];

      // Validate flower placement: avoid lake, spawn rondel, pyramid area, and roads
      function isFlowerPlacementValid(fx, fz) {
        if (Math.sqrt(fx * fx + fz * fz) < 10) return false; // spawn rondel
        if (Math.sqrt((fx - 30) ** 2 + (fz + 30) ** 2) < 22) return false; // lake
        if (Math.sqrt((fx - 50) ** 2 + (fz + 50) ** 2) < 18) return false; // Mayan pyramid
        if (Math.sqrt((fx + 70) ** 2 + (fz - 50) ** 2) < 15) return false; // Illuminati pyramid
        return true;
      }
      
      for(let i=0; i<250; i++) {
        const fx = (Math.random() - 0.5) * 160;
        const fz = (Math.random() - 0.5) * 160;
        if (!isFlowerPlacementValid(fx, fz)) continue;
        const flower = new THREE.Mesh(flowerGeo, new THREE.MeshBasicMaterial({ 
          color: flowerColors[Math.floor(Math.random() * flowerColors.length)] 
        }));
        flower.position.set(fx, 0.25, fz);
        flower.rotation.x = -Math.PI/2;
        scene.add(flower);
      }
      
      // Scatter rocks (big and small) across terrain for ground realism
      const rockMatGray = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9, metalness: 0.1 });
      const rockMatDark = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.95, metalness: 0.05 });
      // Big rocks
      for (let i = 0; i < 60; i++) {
        const scale = 0.6 + Math.random() * 1.2;
        const rockGeo = new THREE.DodecahedronGeometry(scale, 0);
        const rockMat = Math.random() < 0.5 ? rockMatGray : rockMatDark;
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.set(
          (Math.random() - 0.5) * 200,
          scale * 0.4,
          (Math.random() - 0.5) * 200
        );
        rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        rock.castShadow = true;
        rock.receiveShadow = true;
        if (Math.abs(rock.position.x) > 12 || Math.abs(rock.position.z) > 12) {
          scene.add(rock);
        }
      }
      // Small rocks (pebbles)
      for (let i = 0; i < 120; i++) {
        const scale = 0.1 + Math.random() * 0.35;
        const pebbleGeo = new THREE.DodecahedronGeometry(scale, 0);
        const pebble = new THREE.Mesh(pebbleGeo, rockMatGray);
        pebble.position.set(
          (Math.random() - 0.5) * 180,
          scale * 0.4,
          (Math.random() - 0.5) * 180
        );
        pebble.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        scene.add(pebble);
      }
      
      // FRESH IMPLEMENTATION: Destructible Environment System
      // Trees (120), Barrels (30), Crates (25) with HP and damage stages
      window.destructibleProps = [];
      
      // Helper function to create a destructible prop
      function createDestructibleProp(type, position) {
        let mesh, hp, maxHp;
        
        if (type === 'tree') {
          // Tree: trunk + leaves
          const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3, 8);
          const trunkMat = new THREE.MeshToonMaterial({ color: 0x8B4513 });
          const trunk = new THREE.Mesh(trunkGeo, trunkMat.clone()); // Clone material for individual instances
          trunk.position.y = 1.5;
          trunk.castShadow = true;
          
          const leavesGeo = new THREE.SphereGeometry(1.5, 8, 8);
          const leavesMat = new THREE.MeshToonMaterial({ color: 0x228B22 });
          const leaves = new THREE.Mesh(leavesGeo, leavesMat.clone()); // Clone material
          leaves.position.y = 3.5;
          leaves.castShadow = true;
          
          const treeGroup = new THREE.Group();
          treeGroup.add(trunk);
          treeGroup.add(leaves);
          treeGroup.position.copy(position);
          scene.add(treeGroup);
          
          mesh = treeGroup;
          hp = 50;
          maxHp = 50;
          mesh.userData.trunk = trunk;
          mesh.userData.leaves = leaves;
          // Add sway animation data
          mesh.userData.swayPhase = Math.random() * Math.PI * 2; // Random starting phase
          mesh.userData.swaySpeed = 0.5 + Math.random() * 0.5; // Random sway speed
          mesh.userData.swayAmount = 0.05 + Math.random() * 0.05; // Sway intensity
        } else if (type === 'barrel') {
          // Barrel: cylinder
          const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 1, 8);
          const barrelMat = new THREE.MeshToonMaterial({ color: 0xA0522D });
          mesh = new THREE.Mesh(barrelGeo, barrelMat.clone()); // Clone material
          mesh.position.copy(position);
          mesh.position.y = 0.5;
          mesh.castShadow = true;
          scene.add(mesh);
          
          hp = 20;
          maxHp = 20;
        } else if (type === 'crate') {
          // Crate: box
          const crateGeo = new THREE.BoxGeometry(1, 1, 1);
          const crateMat = new THREE.MeshToonMaterial({ color: 0xD2691E });
          mesh = new THREE.Mesh(crateGeo, crateMat.clone()); // Clone material
          mesh.position.copy(position);
          mesh.position.y = 0.5;
          mesh.castShadow = true;
          scene.add(mesh);
          
          hp = 15;
          maxHp = 15;
        }
        
        return {
          type: type,
          mesh: mesh,
          hp: hp,
          maxHp: maxHp,
          destroyed: false,
          originalPosition: mesh.position.clone(),
          originalScale: mesh.scale.clone(),
          originalColor: type === 'tree' ? 
            { trunk: mesh.userData.trunk.material.color.clone(), leaves: mesh.userData.leaves.material.color.clone() } :
            mesh.material.color.clone()
        };
      }
      // Expose createDestructibleProp so resetGame() can respawn destroyed props
      window._createDestructibleProp = createDestructibleProp;
      
      // Spawn Trees (120) - scattered across the map
      for (let i = 0; i < 120; i++) {
        const x = (Math.random() - 0.5) * 250; // Spread across map
        const z = (Math.random() - 0.5) * 250;
        // Avoid spawning too close to center (player start)
        if (Math.abs(x) < 15 && Math.abs(z) < 15) continue;
        
        const tree = createDestructibleProp('tree', new THREE.Vector3(x, 0, z));
        window.destructibleProps.push(tree);
      }
      
      // Spawn Barrels (30) - near landmarks and paths
      for (let i = 0; i < 30; i++) {
        const x = (Math.random() - 0.5) * 200;
        const z = (Math.random() - 0.5) * 200;
        // Avoid spawning too close to center
        if (Math.abs(x) < 15 && Math.abs(z) < 15) continue;
        
        const barrel = createDestructibleProp('barrel', new THREE.Vector3(x, 0, z));
        window.destructibleProps.push(barrel);
      }
      
      // Spawn Crates (25) - scattered around
      for (let i = 0; i < 25; i++) {
        const x = (Math.random() - 0.5) * 200;
        const z = (Math.random() - 0.5) * 200;
        // Avoid spawning too close to center
        if (Math.abs(x) < 15 && Math.abs(z) < 15) continue;
        
        const crate = createDestructibleProp('crate', new THREE.Vector3(x, 0, z));
        window.destructibleProps.push(crate);
      }

      // ===================================================================
      // REGIONAL CONTENT: Desert, Snowy Mountains, Forest, Sci-Fi/Alien
      // ===================================================================

      // --- DESERT REGION (x: 50-200, z: -200 to 0) ---
      // Camel props near pyramid
      function createCamel(cx, cz) {
        const camelGroup = new THREE.Group();
        camelGroup.position.set(cx, 0, cz);
        const camelMat = new THREE.MeshToonMaterial({ color: 0xC19A6B });
        // Body
        const bodyGeo = new THREE.BoxGeometry(3, 1.5, 1.2);
        const body = new THREE.Mesh(bodyGeo, camelMat);
        body.position.set(0, 1.5, 0);
        body.castShadow = true;
        camelGroup.add(body);
        // Hump
        const humpGeo = new THREE.SphereGeometry(0.6, 8, 8);
        const hump = new THREE.Mesh(humpGeo, camelMat);
        hump.position.set(0, 2.5, 0);
        hump.castShadow = true;
        camelGroup.add(hump);
        // Head
        const headGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
        const head = new THREE.Mesh(headGeo, camelMat);
        head.position.set(1.8, 2.3, 0);
        head.castShadow = true;
        camelGroup.add(head);
        // Neck
        const neckGeo = new THREE.CylinderGeometry(0.2, 0.3, 1.2, 6);
        const neck = new THREE.Mesh(neckGeo, camelMat);
        neck.position.set(1.3, 2.0, 0);
        neck.rotation.z = -0.4;
        neck.castShadow = true;
        camelGroup.add(neck);
        // Legs
        const legGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.2, 6);
        [[-1, 0.5], [-1, -0.5], [1, 0.5], [1, -0.5]].forEach(([lx, lz]) => {
          const leg = new THREE.Mesh(legGeo, camelMat);
          leg.position.set(lx, 0.6, lz);
          leg.castShadow = true;
          camelGroup.add(leg);
        });
        scene.add(camelGroup);
      }
      createCamel(80, -70);
      createCamel(120, -90);
      createCamel(95, -120);

      // Sand dunes in desert
      const sandMat = new THREE.MeshToonMaterial({ color: 0xE8C880 });
      const dunePositions = [
        { x: 100, z: -80, rx: 0.6, rz: 1.2 },
        { x: 140, z: -60, rx: 0.8, rz: 1.5 },
        { x: 120, z: -130, rx: 0.5, rz: 1.0 },
        { x: 160, z: -100, rx: 0.7, rz: 1.3 },
        { x: 90, z: -150, rx: 0.6, rz: 1.1 },
        { x: 170, z: -140, rx: 0.9, rz: 1.6 },
      ];
      dunePositions.forEach(d => {
        const duneGeo = new THREE.SphereGeometry(d.rx, 8, 6);
        const dune = new THREE.Mesh(duneGeo, sandMat);
        dune.position.set(d.x, 0, d.z);
        dune.scale.set(d.rz * 3, 0.4, d.rz * 2);
        dune.receiveShadow = true;
        scene.add(dune);
      });

      // Old rusty car in desert
      (function() {
        const carGroup = new THREE.Group();
        carGroup.position.set(110, 0, -80);
        carGroup.rotation.y = 0.7;
        const rustyMat = new THREE.MeshToonMaterial({ color: 0x8B4513 });
        // Car body
        const carBodyGeo = new THREE.BoxGeometry(4, 1.2, 2);
        const carBody = new THREE.Mesh(carBodyGeo, rustyMat);
        carBody.position.y = 0.9;
        carBody.castShadow = true;
        carGroup.add(carBody);
        // Car top
        const carTopGeo = new THREE.BoxGeometry(2.5, 0.9, 1.8);
        const carTop = new THREE.Mesh(carTopGeo, rustyMat);
        carTop.position.set(0.2, 2.05, 0);
        carTop.castShadow = true;
        carGroup.add(carTop);
        // Wheels (flat cylinders)
        const wheelGeo2 = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8);
        const wheelMat2 = new THREE.MeshToonMaterial({ color: 0x222222 });
        [[-1.5, 0.5, 0.9], [-1.5, 0.5, -0.9], [1.5, 0.5, 0.9], [1.5, 0.5, -0.9]].forEach(([wx, wy, wz]) => {
          const wheel = new THREE.Mesh(wheelGeo2, wheelMat2);
          wheel.position.set(wx, wy, wz);
          wheel.rotation.x = Math.PI / 2;
          carGroup.add(wheel);
        });
        scene.add(carGroup);
      })();

      // Sandy ground overlay for desert region
      const desertGroundMat = new THREE.MeshToonMaterial({ color: 0xDEB887, transparent: true, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      const desertGround = new THREE.Mesh(new THREE.PlaneGeometry(150, 200), desertGroundMat);
      desertGround.rotation.x = -Math.PI / 2;
      desertGround.position.set(125, 0.005, -100);
      scene.add(desertGround);

      // --- SNOWY MOUNTAINS REGION (x: -200 to 0, z: -200 to 0) ---
      // Volcano with glowing orange/red lava crater
      (function() {
        const volcanoGroup = new THREE.Group();
        volcanoGroup.position.set(-100, 0, -120);
        
        const volMat = new THREE.MeshStandardMaterial({ color: 0x4A3525, roughness: 0.95, metalness: 0.0 }); // Dark volcanic rock
        // Volcano base cone - SCALED DOWN so it fits on screen
        const baseGeo = new THREE.ConeGeometry(14, 13, 14);
        const base = new THREE.Mesh(baseGeo, volMat);
        base.position.y = 6.5;
        base.castShadow = true;
        volcanoGroup.add(base);

        // Middle rocky section for irregular shape
        const midMat = new THREE.MeshStandardMaterial({ color: 0x3D2E1E, roughness: 0.98, metalness: 0.0 });
        const midGeo = new THREE.ConeGeometry(8, 6, 10);
        const midSection = new THREE.Mesh(midGeo, midMat);
        midSection.position.y = 10;
        midSection.castShadow = true;
        volcanoGroup.add(midSection);
        
        // Inner lava crater (orange/red glow with emissive)
        const craterGeo = new THREE.ConeGeometry(4, 3, 12, 1, true);
        const craterMat = new THREE.MeshStandardMaterial({ 
          color: 0xFF4500, side: THREE.BackSide,
          emissive: 0xFF3300, emissiveIntensity: 0.8,
        });
        const crater = new THREE.Mesh(craterGeo, craterMat);
        crater.position.y = 12.5;
        volcanoGroup.add(crater);
        
        // Lava pool at top with emissive glow
        const lavaPoolGeo = new THREE.CircleGeometry(3.8, 16);
        const lavaPoolMat = new THREE.MeshStandardMaterial({ color: 0xFF6A00, emissive: 0xFF4400, emissiveIntensity: 1.0 });
        const lavaPool = new THREE.Mesh(lavaPoolGeo, lavaPoolMat);
        lavaPool.rotation.x = -Math.PI / 2;
        lavaPool.position.y = 13.2;
        lavaPool.userData = { isLavaPool: true, phase: 0 };
        volcanoGroup.add(lavaPool);
        
        // Lava flow channels down sides
        const lavaFlowMat = new THREE.MeshStandardMaterial({ color: 0xFF5500, emissive: 0xFF3300, emissiveIntensity: 0.6 });
        for (let lf = 0; lf < 3; lf++) {
          const lfAngle = (lf / 3) * Math.PI * 2 + 0.5;
          const lavaFlowGeo = new THREE.BoxGeometry(0.8, 5, 0.5);
          const lavaFlow = new THREE.Mesh(lavaFlowGeo, lavaFlowMat);
          lavaFlow.position.set(Math.cos(lfAngle) * 4, 8, Math.sin(lfAngle) * 4);
          lavaFlow.rotation.y = lfAngle;
          lavaFlow.rotation.x = -0.4;
          volcanoGroup.add(lavaFlow);
        }

        // Glowing orange point light inside crater
        const volcanoLight = new THREE.PointLight(0xFF4500, 4, 30);
        volcanoLight.position.set(0, 13, 0);
        volcanoLight.userData = { isVolcanoLight: true, phase: 0 };
        volcanoGroup.add(volcanoLight);
        
        // Lava rock chunks scattered around base
        const lavaRockMat = new THREE.MeshToonMaterial({ color: 0x3B2A2A });
        for (let r = 0; r < 12; r++) {
          const rAngle = (r / 12) * Math.PI * 2;
          const rDist = 16 + Math.sin(r * 2.3) * 4;
          const rockGeo = new THREE.DodecahedronGeometry(0.8 + Math.sin(r) * 0.4, 0);
          const rock = new THREE.Mesh(rockGeo, lavaRockMat);
          rock.position.set(Math.cos(rAngle) * rDist, 0.5, Math.sin(rAngle) * rDist);
          rock.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
          rock.castShadow = true;
          volcanoGroup.add(rock);
        }
        
        // Snow-covered rocks near volcano base (contrast)
        const snowRockMat = new THREE.MeshToonMaterial({ color: 0xF0F0F0 });
        for (let s = 0; s < 8; s++) {
          const sAngle = (s / 8) * Math.PI * 2 + 0.4;
          const sDist = 22 + s * 1.2;
          const snowRockGeo = new THREE.SphereGeometry(1.2 + s * 0.2, 7, 6);
          const snowRock = new THREE.Mesh(snowRockGeo, snowRockMat);
          snowRock.position.set(Math.cos(sAngle) * sDist, 0.8, Math.sin(sAngle) * sDist);
          snowRock.castShadow = true;
          volcanoGroup.add(snowRock);
        }
        
        scene.add(volcanoGroup);
        // Store for animation
        window.volcanoLight = volcanoLight;
        window.lavaPool = lavaPool;
      })();

      // Snowy ground overlay
      const snowGroundMat = new THREE.MeshToonMaterial({ color: 0xEEEEFF, transparent: true, opacity: 0.4, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      const snowGround = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), snowGroundMat);
      snowGround.rotation.x = -Math.PI / 2;
      snowGround.position.set(-100, 0.006, -100);
      snowGround.receiveShadow = true;
      scene.add(snowGround);

      // --- FOREST/GREEN REGION (x: 0-200, z: 0-200) - Extra trees and mushrooms near Stonehenge ---
      // Dense trees around Stonehenge (NOT inside the stone circle)
      const stonehengeTreeTrunkMat = new THREE.MeshToonMaterial({ color: 0x4A2C0A });
      const stonehengeTreeLeavesMat = new THREE.MeshToonMaterial({ color: 0x1A7A1A });
      const stonehengeDenseTreeData = [
        {x:78, z:62}, {x:80, z:55}, {x:76, z:70}, {x:85, z:65},
        {x:42, z:62}, {x:40, z:55}, {x:44, z:70}, {x:38, z:65},
        {x:62, z:42}, {x:55, z:40}, {x:70, z:44}, {x:65, z:38},
        {x:62, z:78}, {x:55, z:80}, {x:70, z:76}, {x:65, z:85},
      ];
      stonehengeDenseTreeData.forEach(td => {
        const tg = new THREE.Group();
        const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 6), stonehengeTreeTrunkMat);
        tt.position.y = 1.5; tt.castShadow = true;
        const tl = new THREE.Mesh(new THREE.SphereGeometry(1.8, 7, 6), stonehengeTreeLeavesMat);
        tl.position.y = 4; tl.castShadow = true;
        tg.add(tt); tg.add(tl);
        tg.position.set(td.x, 0, td.z);
        scene.add(tg);
      });

      // Mushrooms scattered in forest region
      const mushroomCapMat = new THREE.MeshToonMaterial({ color: 0xC0392B }); // Red mushroom cap
      const mushroomStemMat = new THREE.MeshToonMaterial({ color: 0xFFF8DC }); // Cream stem
      const mushroomData = [
        {x:75, z:75, s:1.0}, {x:85, z:80, s:0.7}, {x:90, z:70, s:1.2},
        {x:70, z:90, s:0.8}, {x:100, z:80, s:1.0}, {x:80, z:100, s:0.6},
        {x:110, z:70, s:1.3}, {x:65, z:110, s:0.9},
      ];
      mushroomData.forEach(m => {
        const mGroup = new THREE.Group();
        mGroup.position.set(m.x, 0, m.z);
        const stemGeo = new THREE.CylinderGeometry(0.15 * m.s, 0.2 * m.s, 0.7 * m.s, 8);
        const stem = new THREE.Mesh(stemGeo, mushroomStemMat);
        stem.position.y = 0.35 * m.s;
        mGroup.add(stem);
        const capGeo = new THREE.SphereGeometry(0.5 * m.s, 8, 6);
        const cap = new THREE.Mesh(capGeo, mushroomCapMat);
        cap.position.y = 0.9 * m.s;
        cap.scale.y = 0.6;
        mGroup.add(cap);
        scene.add(mGroup);
      });

      // --- SCI-FI/ALIEN REGION (x: -200 to 0, z: 0 to 200) ---
      // Area 51 building
      (function() {
        const area51Group = new THREE.Group();
        area51Group.position.set(-120, 0, 100);
        
        const a51Mat = new THREE.MeshToonMaterial({ color: 0x888888 }); // Flat grey
        // Main hangar building
        const hangarGeo = new THREE.BoxGeometry(25, 6, 15);
        const hangar = new THREE.Mesh(hangarGeo, a51Mat);
        hangar.position.y = 3;
        hangar.castShadow = true;
        hangar.receiveShadow = true;
        area51Group.add(hangar);
        
        // Hangar roof (slightly arched with cylinder)
        const roofGeo = new THREE.CylinderGeometry(0.1, 14, 4, 4);
        const roofMat = new THREE.MeshToonMaterial({ color: 0x666666 });
        const roofMesh = new THREE.Mesh(roofGeo, roofMat);
        roofMesh.position.y = 8;
        roofMesh.rotation.y = Math.PI / 4;
        roofMesh.castShadow = true;
        area51Group.add(roofMesh);
        
        // Side building
        const sideGeo = new THREE.BoxGeometry(10, 4, 8);
        const sideBuilding = new THREE.Mesh(sideGeo, a51Mat);
        sideBuilding.position.set(16, 2, 0);
        sideBuilding.castShadow = true;
        area51Group.add(sideBuilding);
        
        // Satellite dish
        const dishBase = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.3, 2, 6),
          new THREE.MeshToonMaterial({ color: 0x444444 })
        );
        dishBase.position.set(-8, 7, 0);
        area51Group.add(dishBase);
        const dishGeo = new THREE.SphereGeometry(2, 12, 6, 0, Math.PI);
        const dish = new THREE.Mesh(dishGeo, new THREE.MeshToonMaterial({ color: 0xBBBBBB }));
        dish.position.set(-8, 9, 0);
        dish.rotation.x = -Math.PI / 2;
        area51Group.add(dish);
        
        // Warning signs / "CLASSIFIED" on building
        const warningLight = new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xFF0000, transparent: true, opacity: 0.9 })
        );
        warningLight.position.set(0, 7, 7.5);
        warningLight.userData = { isWarningLight: true, phase: 0 };
        area51Group.add(warningLight);
        
        // "AREA 51" sign on main building wall
        const a51SignCanvas = document.createElement('canvas');
        a51SignCanvas.width = 512; a51SignCanvas.height = 128;
        const a51Ctx = a51SignCanvas.getContext('2d');
        a51Ctx.fillStyle = '#1A1A1A';
        a51Ctx.fillRect(0, 0, 512, 128);
        a51Ctx.fillStyle = '#FFD700';
        a51Ctx.font = 'bold 72px Arial';
        a51Ctx.textAlign = 'center';
        a51Ctx.textBaseline = 'middle';
        a51Ctx.fillText('AREA 51', 256, 64);
        const a51SignTex = new THREE.CanvasTexture(a51SignCanvas);
        const a51SignSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: a51SignTex }));
        a51SignSprite.scale.set(8, 2, 1);
        a51SignSprite.position.set(0, 6.5, 7.6);
        area51Group.add(a51SignSprite);

        // Perimeter fence posts with warning signs
        const a51FenceMat = new THREE.MeshToonMaterial({ color: 0x777777 });
        const warnCanvas = document.createElement('canvas');
        warnCanvas.width = 256; warnCanvas.height = 128;
        const wCtx = warnCanvas.getContext('2d');
        wCtx.fillStyle = '#FF0000';
        wCtx.fillRect(0, 0, 256, 128);
        wCtx.fillStyle = '#FFFFFF';
        wCtx.font = 'bold 18px Arial';
        wCtx.textAlign = 'center';
        wCtx.textBaseline = 'middle';
        wCtx.fillText('TRESPASSERS', 128, 38);
        wCtx.fillText('WILL BE KILLED', 128, 64);
        wCtx.fillText('⚠ AUTHORIZED', 128, 90);
        wCtx.fillText('PERSONNEL ONLY', 128, 110);
        const warnTex = new THREE.CanvasTexture(warnCanvas);

        const fenceRx = 20, fenceRz = 16;
        for (let f = 0; f < 24; f++) {
          const fAngle = (f / 24) * Math.PI * 2;
          const fPost = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), a51FenceMat);
          fPost.position.set(Math.cos(fAngle) * fenceRx, 1.5, Math.sin(fAngle) * fenceRz);
          area51Group.add(fPost);
          // Horizontal wire
          const wAngle = ((f + 1) / 24) * Math.PI * 2;
          const wireLenX = Math.cos(wAngle) * fenceRx - Math.cos(fAngle) * fenceRx;
          const wireLenZ = Math.sin(wAngle) * fenceRz - Math.sin(fAngle) * fenceRz;
          const wireLen = Math.sqrt(wireLenX * wireLenX + wireLenZ * wireLenZ);
          const wireMesh = new THREE.Mesh(new THREE.BoxGeometry(wireLen, 0.06, 0.06), a51FenceMat);
          wireMesh.position.set((Math.cos(fAngle) * fenceRx + Math.cos(wAngle) * fenceRx) * 0.5, 2.5, (Math.sin(fAngle) * fenceRz + Math.sin(wAngle) * fenceRz) * 0.5);
          wireMesh.rotation.y = Math.atan2(wireLenZ, wireLenX);
          area51Group.add(wireMesh);
          // Warning signs on every 4th post
          if (f % 4 === 0) {
            const warnSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: warnTex }));
            warnSprite.scale.set(2.5, 1.2, 1);
            warnSprite.position.set(Math.cos(fAngle) * fenceRx, 3.5, Math.sin(fAngle) * fenceRz);
            area51Group.add(warnSprite);
          }
        }
        
        scene.add(area51Group);
        window.warningLight = warningLight;
      })();

      // Crashed alien spaceship
      (function() {
        const shipGroup = new THREE.Group();
        shipGroup.position.set(-150, 0, 60);
        shipGroup.rotation.y = 0.8;
        
        // Disc body (saucer shape)
        const discGeo = new THREE.SphereGeometry(8, 16, 8);
        const discMat = new THREE.MeshPhysicalMaterial({ 
          color: 0x778899, metalness: 0.8, roughness: 0.3,
          emissive: 0x002244, emissiveIntensity: 0.2
        });
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.scale.set(1, 0.3, 1); // Flatten into disc
        disc.position.y = 1.5;
        disc.castShadow = true;
        shipGroup.add(disc);
        
        // Dome on top
        const domeGeo = new THREE.SphereGeometry(3.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMat = new THREE.MeshPhysicalMaterial({ 
          color: 0x88CCFF, transparent: true, opacity: 0.6,
          metalness: 0.1, roughness: 0.1
        });
        const dome = new THREE.Mesh(domeGeo, domeMat);
        dome.position.y = 2.4;
        dome.castShadow = true;
        shipGroup.add(dome);
        
        // Damage / cracked section
        const damagedGeo = new THREE.BoxGeometry(4, 0.8, 3);
        const damagedMat = new THREE.MeshToonMaterial({ color: 0x445566 });
        const damaged = new THREE.Mesh(damagedGeo, damagedMat);
        damaged.position.set(6, 1.2, 2);
        damaged.rotation.z = 0.3;
        damaged.castShadow = true;
        shipGroup.add(damaged);
        
        // Glowing engine lights around disc edge - STRONGER GLOW
        const engineColors = [0x00FFCC, 0x00FF88, 0x44FFAA];
        for (let e = 0; e < 6; e++) {
          const eAngle = (e / 6) * Math.PI * 2;
          const engineLight = new THREE.Mesh(
            new THREE.SphereGeometry(0.6, 8, 8),
            new THREE.MeshBasicMaterial({ color: engineColors[e % 3] })
          );
          engineLight.position.set(Math.cos(eAngle) * 7.5, 1.5, Math.sin(eAngle) * 7.5);
          engineLight.userData = { isEngineLight: true, phase: (e / 6) * Math.PI * 2 };
          shipGroup.add(engineLight);
          // Add point light for each engine for real glow
          const enginePointLight = new THREE.PointLight(engineColors[e % 3], 2.5, 12);
          enginePointLight.position.set(Math.cos(eAngle) * 7.5, 1.5, Math.sin(eAngle) * 7.5);
          enginePointLight.userData = { isEngineLight: true, phase: (e / 6) * Math.PI * 2 };
          shipGroup.add(enginePointLight);
        }
        
        // Tilt the ship (crashed angle)
        shipGroup.rotation.x = 0.25;
        shipGroup.rotation.z = -0.15;
        
        // Crash crater under ship
        const crashGeo = new THREE.RingGeometry(6, 10, 16);
        const crashMat = new THREE.MeshBasicMaterial({ color: 0x4A3728, transparent: true, opacity: 0.7 });
        const crashCrater = new THREE.Mesh(crashGeo, crashMat);
        crashCrater.rotation.x = -Math.PI / 2;
        crashCrater.position.set(-150, 0.01, 60);
        scene.add(crashCrater);
        
        scene.add(shipGroup);

        // Add a glowing Companion Egg near the UFO crash site (quest18 objective)
        const eggGroup = new THREE.Group();
        eggGroup.position.set(-148, 0, 58);
        const eggGeo = new THREE.SphereGeometry(0.7, 12, 10);
        eggGeo.scale(1, 1.3, 1);
        const eggMat = new THREE.MeshPhysicalMaterial({
          color: 0x00FFB4, emissive: 0x00CC88, emissiveIntensity: 0.6,
          transparent: true, opacity: 0.9, metalness: 0.2, roughness: 0.3
        });
        const eggMesh = new THREE.Mesh(eggGeo, eggMat);
        eggMesh.position.y = 0.9;
        eggMesh.castShadow = true;
        eggGroup.add(eggMesh);
        // Glow light
        const eggLight = new THREE.PointLight(0x00FFB4, 3, 8);
        eggLight.position.y = 1;
        eggGroup.add(eggLight);
        eggGroup.userData = { isCompanionEgg: true, pickupRadius: 4 };
        scene.add(eggGroup);
        window.companionEggObject = eggGroup;
      })();

      // Alien/sci-fi ground overlay
      const scifiGroundMat = new THREE.MeshToonMaterial({ color: 0x334433, transparent: true, opacity: 0.3, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      const scifiGround = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), scifiGroundMat);
      scifiGround.rotation.x = -Math.PI / 2;
      scifiGround.position.set(-100, 0.006, 100);
      scifiGround.receiveShadow = true;
      scene.add(scifiGround);

      // --- NEAR SPAWN: Roman Colosseum ---
      (function() {
        const colosseumGroup = new THREE.Group();
        colosseumGroup.position.set(-25, 0, 25);

        // Primary palette: warm beige/travertine limestone
        const stoneMat     = new THREE.MeshStandardMaterial({ color: 0xD4B896, roughness: 0.88, metalness: 0.0 });
        const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0xC4A882, roughness: 0.92, metalness: 0.0 });
        const columnMat    = new THREE.MeshStandardMaterial({ color: 0xE8D5B7, roughness: 0.80, metalness: 0.0 });
        const rubbleMat    = new THREE.MeshStandardMaterial({ color: 0xB09070, roughness: 1.00, metalness: 0.0 });
        const sandMat      = new THREE.MeshStandardMaterial({ color: 0xD4C4A0, roughness: 0.98, metalness: 0.0 });

        const outerRadius  = 13;   // circular outer wall radius
        const wallHeight   = 7;
        const wallThick    = 1.4;
        const numSections  = 24;   // 24-sided polygon → smooth circle

        // ── Outer wall ring (CylinderGeometry gives solid circular wall) ──
        const outerWallGeo = new THREE.CylinderGeometry(
          outerRadius + wallThick * 0.5,   // top outer radius
          outerRadius + wallThick * 0.5,   // bottom outer radius
          wallHeight, numSections, 1, true // open-ended cylinder = ring face
        );
        // Build as segmented BoxGeometry pieces so each arc-segment can be ruined independently
        for (let w = 0; w < numSections; w++) {
          const angle     = (w       / numSections) * Math.PI * 2;
          const angleNext = ((w + 1) / numSections) * Math.PI * 2;
          const mx = Math.cos((angle + angleNext) * 0.5) * outerRadius;
          const mz = Math.sin((angle + angleNext) * 0.5) * outerRadius;
          const segAngle = Math.atan2(mz, mx) + Math.PI * 0.5;
          const arcLen   = 2 * outerRadius * Math.sin(Math.PI / numSections) + 0.05;

          const isRuined = (w >= 4 && w <= 5) || (w >= 16 && w <= 17);
          const segH   = isRuined ? wallHeight * 0.40 : wallHeight;
          const segMat = isRuined ? darkStoneMat : stoneMat;

          const seg = new THREE.Mesh(new THREE.BoxGeometry(arcLen, segH, wallThick), segMat);
          seg.position.set(mx, segH * 0.5, mz);
          seg.rotation.y = segAngle;
          seg.castShadow = true;
          seg.receiveShadow = true;
          colosseumGroup.add(seg);
        }

        // ── Crenellated battlements on top of full-height sections ──
        for (let w = 0; w < numSections; w++) {
          const isRuined = (w >= 4 && w <= 5) || (w >= 16 && w <= 17);
          if (isRuined) continue;
          const angle  = ((w + 0.5) / numSections) * Math.PI * 2;
          const mx     = Math.cos(angle) * outerRadius;
          const mz     = Math.sin(angle) * outerRadius;
          const cren   = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, wallThick * 1.05), darkStoneMat);
          cren.position.set(mx, wallHeight + 0.45, mz);
          cren.rotation.y = angle + Math.PI * 0.5;
          cren.castShadow = true;
          colosseumGroup.add(cren);
        }

        // ── Inner second tier wall (smaller radius) ──
        const innerRadius = 9;
        const tier2Height = 3.8;
        const numInner    = 20;
        for (let w = 0; w < numInner; w++) {
          if (w === 3 || w === 12) continue; // gaps for ruins look
          const angle     = (w       / numInner) * Math.PI * 2;
          const angleNext = ((w + 1) / numInner) * Math.PI * 2;
          const mx        = Math.cos((angle + angleNext) * 0.5) * innerRadius;
          const mz        = Math.sin((angle + angleNext) * 0.5) * innerRadius;
          const segAngle  = Math.atan2(mz, mx) + Math.PI * 0.5;
          const arcLen    = 2 * innerRadius * Math.sin(Math.PI / numInner) + 0.05;

          const seg2 = new THREE.Mesh(new THREE.BoxGeometry(arcLen, tier2Height, 1.0), darkStoneMat);
          seg2.position.set(mx, wallHeight + tier2Height * 0.5, mz);
          seg2.rotation.y = segAngle;
          seg2.castShadow = true;
          colosseumGroup.add(seg2);
        }

        // ── Perimeter columns (CylinderGeometry, white/beige) ──
        const numColumns  = 16;
        const colRadius   = outerRadius + 0.1; // sit just outside the wall face
        for (let c = 0; c < numColumns; c++) {
          const angle = (c / numColumns) * Math.PI * 2;
          const cx    = Math.cos(angle) * colRadius;
          const cz    = Math.sin(angle) * colRadius;

          // Fluted column shaft
          const shaft = new THREE.Mesh(
            new THREE.CylinderGeometry(0.38, 0.45, wallHeight + 1.0, 8),
            columnMat
          );
          shaft.position.set(cx, (wallHeight + 1.0) * 0.5, cz);
          shaft.castShadow = true;
          shaft.receiveShadow = true;
          colosseumGroup.add(shaft);

          // Column capital (wider top)
          const capital = new THREE.Mesh(
            new THREE.CylinderGeometry(0.55, 0.40, 0.45, 8),
            stoneMat
          );
          capital.position.set(cx, wallHeight + 1.0 + 0.22, cz);
          capital.castShadow = true;
          colosseumGroup.add(capital);

          // Column base plinth
          const plinth = new THREE.Mesh(
            new THREE.CylinderGeometry(0.55, 0.60, 0.35, 8),
            stoneMat
          );
          plinth.position.set(cx, 0.18, cz);
          plinth.castShadow = true;
          plinth.receiveShadow = true;
          colosseumGroup.add(plinth);
        }

        // ── Arena floor — circular sandy disc ──
        const arenaFloor = new THREE.Mesh(
          new THREE.CircleGeometry(innerRadius - 1.2, 40),
          sandMat
        );
        arenaFloor.rotation.x = -Math.PI / 2;
        arenaFloor.position.y = 0.05;
        arenaFloor.receiveShadow = true;
        colosseumGroup.add(arenaFloor);

        // ── Ground ring between inner wall and outer wall (stone paving) ──
        const pavingGeo = new THREE.RingGeometry(innerRadius - 1.1, outerRadius - wallThick * 0.5, 40);
        const pavingMat = new THREE.MeshStandardMaterial({ color: 0xC8B090, roughness: 0.95, metalness: 0.0 });
        const paving = new THREE.Mesh(pavingGeo, pavingMat);
        paving.rotation.x = -Math.PI / 2;
        paving.position.y = 0.05;
        paving.receiveShadow = true;
        colosseumGroup.add(paving);

        // ── Scattered rubble at ruined sections ──
        const rubbleData = [
          { x: 11.5, z: 3.5, ry: 0.4 }, { x: -11,  z: 3,   ry: 0.8 },
          { x: 12.5, z: -2,  ry: 0.2 }, { x: -12,  z: -2,  ry: 1.1 },
          { x:  9.5, z: 5,   ry: 0.6 }, { x: -9.5, z: -4,  ry: 0.3 },
        ];
        rubbleData.forEach(r => {
          const rb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 1.1), rubbleMat);
          rb.position.set(r.x, 0.37, r.z);
          rb.rotation.y = r.ry;
          rb.castShadow = true;
          rb.receiveShadow = true;
          colosseumGroup.add(rb);
        });

        scene.add(colosseumGroup);
      })();

      // Ancient ruins near spawn (scattered pillars)
      (function() {
        const ruinsMat = new THREE.MeshToonMaterial({ color: 0x9E8C7A });
        const ruinPositions = [
          {x: 15, z: 25, h: 3, tilt: 0.1},  {x: 22, z: 18, h: 5, tilt: -0.15},
          {x: -15, z: 18, h: 4, tilt: 0.2}, {x: -20, z: 30, h: 2, tilt: -0.1},
          {x: 25, z: 35, h: 6, tilt: 0.05}, {x: -10, z: 35, h: 3.5, tilt: 0.3},
        ];
        ruinPositions.forEach(r => {
          const pillarGeo = new THREE.CylinderGeometry(0.5, 0.6, r.h, 8);
          const pillar = new THREE.Mesh(pillarGeo, ruinsMat);
          pillar.position.set(r.x, r.h / 2, r.z);
          pillar.rotation.z = r.tilt;
          pillar.castShadow = true;
          pillar.receiveShadow = true;
          scene.add(pillar);
        });
      })();

      // --- WATER LILIES on the lake ---
      const lilyMat = new THREE.MeshToonMaterial({ color: 0x228B22, side: THREE.DoubleSide });
      const lilyPositions = [
        {x:24, z:-26}, {x:33, z:-22}, {x:36, z:-35}, {x:27, z:-38},
        {x:22, z:-33}, {x:38, z:-28}, {x:29, z:-24}, {x:35, z:-40},
      ];
      lilyPositions.forEach((lp, lilyIdx) => {
        const lilyGeo = new THREE.CircleGeometry(0.7 + seededRandom(lilyIdx * 31) * 0.4, 8); // 31 = prime for varied lily sizes
        const lily = new THREE.Mesh(lilyGeo, lilyMat);
        lily.rotation.x = -Math.PI / 2;
        lily.position.set(lp.x, 0.03, lp.z);
        scene.add(lily);
        // Small flower on lily
        const flowerMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
        const flowerGeo = new THREE.SphereGeometry(0.18, 6, 4);
        const flower = new THREE.Mesh(flowerGeo, flowerMat);
        flower.position.set(lp.x, 0.1, lp.z);
        flower.scale.y = 0.5;
        scene.add(flower);
      });

      // --- RIVERS: 2 winding paths of flat blue planes ---
      const riverMat = new THREE.MeshBasicMaterial({ color: 0x4499CC, transparent: true, opacity: 0.65 });
      // River 1: from lake (30,-30) northeast toward Stonehenge direction
      const river1Points = [
        [30, -30], [25, -15], [20, 0], [15, 15], [25, 30]
      ];
      for (let r = 0; r < river1Points.length - 1; r++) {
        const [ax, az] = river1Points[r];
        const [bx, bz] = river1Points[r + 1];
        const len = Math.sqrt((bx-ax)**2 + (bz-az)**2);
        const riverGeo = new THREE.PlaneGeometry(1.5, len);
        const riverSeg = new THREE.Mesh(riverGeo, riverMat);
        riverSeg.rotation.x = -Math.PI / 2;
        const angle = Math.atan2(bz - az, bx - ax);
        riverSeg.rotation.z = angle - Math.PI / 2;
        riverSeg.position.set((ax + bx) / 2, 0.008, (az + bz) / 2);
        scene.add(riverSeg);
      }
      // River 2 removed — only one river flows through the map
      // Stone bridges over rivers
      const bridgeMat = new THREE.MeshToonMaterial({ color: 0x888880 });
      [[20, 0]].forEach(([bx, bz]) => {
        const bridgeGeo = new THREE.BoxGeometry(4, 0.3, 1.5);
        const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
        bridge.position.set(bx, 0.1, bz);
        bridge.castShadow = true;
        scene.add(bridge);
      });

      // --- MAP BORDER FENCE with Signs ---
      const borderFenceMat = new THREE.MeshToonMaterial({ color: 0x6B4226 });
      const borderPostGeo = new THREE.CylinderGeometry(0.2, 0.2, 2.5, 6);
      const signTexts = ['STOP', 'EDGE OF THE WORLD', 'No Trespassing'];
      const signTextures = signTexts.map(text => {
        const cv = document.createElement('canvas');
        cv.width = 256; cv.height = 64;
        const c = cv.getContext('2d');
        c.fillStyle = '#D2B48C';
        c.fillRect(0, 0, 256, 64);
        c.strokeStyle = '#8B4513';
        c.lineWidth = 3;
        c.strokeRect(2, 2, 252, 60);
        c.fillStyle = '#8B0000';
        c.font = 'bold 22px Arial';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(text, 128, 32);
        return new THREE.CanvasTexture(cv);
      });
      let signIdx = 0;
      const BORDER = 195;
      const FENCE_STEP = 10;
      // North & South edges
      [-BORDER, BORDER].forEach(edgeZ => {
        for (let x = -BORDER; x <= BORDER; x += FENCE_STEP) {
          const post = new THREE.Mesh(borderPostGeo, borderFenceMat.clone());
          post.position.set(x, 1.25, edgeZ);
          post.castShadow = true;
          post.userData = { isFence: true, hp: 20, maxHp: 20, originalPosition: post.position.clone() };
          scene.add(post);
          window.breakableFences.push(post);
          if (Math.abs(x + BORDER) % (FENCE_STEP * 3) < FENCE_STEP) {
            const signMesh = new THREE.Mesh(
              new THREE.BoxGeometry(3, 0.8, 0.1),
              new THREE.MeshBasicMaterial({ map: signTextures[signIdx % 3] })
            );
            signMesh.position.set(x, 2.8, edgeZ);
            scene.add(signMesh);
            signIdx++;
          }
        }
      });
      // East & West edges
      [-BORDER, BORDER].forEach(edgeX => {
        for (let z = -BORDER; z <= BORDER; z += FENCE_STEP) {
          const post = new THREE.Mesh(borderPostGeo, borderFenceMat.clone());
          post.position.set(edgeX, 1.25, z);
          post.castShadow = true;
          post.userData = { isFence: true, hp: 20, maxHp: 20, originalPosition: post.position.clone() };
          scene.add(post);
          window.breakableFences.push(post);
          if (Math.abs(z + BORDER) % (FENCE_STEP * 3) < FENCE_STEP) {
            const signMesh = new THREE.Mesh(
              new THREE.BoxGeometry(3, 0.8, 0.1),
              new THREE.MeshBasicMaterial({ map: signTextures[signIdx % 3] })
            );
            signMesh.position.set(edgeX, 2.8, z);
            signMesh.rotation.y = Math.PI / 2;
            scene.add(signMesh);
            signIdx++;
          }
        }
      });

      // --- Tesla Tower Point Light (blue/white) ---
      const teslaLight = new THREE.PointLight(0x00CCFF, 3, 30);
      teslaLight.position.set(-80, 18, -80);
      teslaLight.userData = { isTeslaLight: true, phase: 0 };
      scene.add(teslaLight);
      window.teslaPointLight = teslaLight;

      // === WILDLIFE SPAWNING ===
      // Spawn animals as simple colored meshes in their regions
      if (window.GameWorld && window.GameWorld.WILDLIFE) {
        const WILDLIFE = window.GameWorld.WILDLIFE;
        const regionCenters = {
          forest: { x: 0, z: 50, spread: 80 },
          desert: { x: 120, z: -80, spread: 60 },
          snow:   { x: -120, z: -100, spread: 60 }
        };
        const animalMeshes = [];
        for (const [animalId, animal] of Object.entries(WILDLIFE)) {
          const region = regionCenters[animal.region] || regionCenters.forest;
          const count = animal.passive ? 3 : 2;
          for (let i = 0; i < count; i++) {
            const ax = region.x + (Math.random() - 0.5) * region.spread;
            const az = region.z + (Math.random() - 0.5) * region.spread;
            // Skip if too close to player spawn
            if (Math.abs(ax) < 15 && Math.abs(az) < 15) continue;

            const size = animal.size || 0.5;
            const animalGroup = new THREE.Group();

            // Body
            const bodyGeo = new THREE.BoxGeometry(size * 0.8, size * 0.5, size * 0.4);
            const bodyColor = animal.passive ? 0x8B6914 : 0x8B0000;
            const bodyMat = new THREE.MeshToonMaterial({ color: bodyColor });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.y = size * 0.3;
            body.castShadow = true;
            animalGroup.add(body);

            // Head
            const headGeo = new THREE.BoxGeometry(size * 0.3, size * 0.3, size * 0.3);
            const head = new THREE.Mesh(headGeo, bodyMat);
            head.position.set(size * 0.4, size * 0.45, 0);
            head.castShadow = true;
            animalGroup.add(head);

            animalGroup.position.set(ax, 0, az);
            animalGroup.userData = {
              isWildlife: true,
              animalId: animalId,
              animalData: animal,
              hp: animal.hp,
              maxHp: animal.hp,
              gender: animal.gender === 'random' ? (Math.random() < 0.5 ? 'male' : 'female') : null,
              wanderTarget: { x: ax, z: az },
              wanderTimer: Math.random() * 5,
              alive: true
            };

            scene.add(animalGroup);
            animalMeshes.push(animalGroup);
          }
        }
        // Store wildlife meshes on window for game-loop access
        window._wildlifeAnimals = animalMeshes;
      }
    }

    // Performance: Cache animated objects to avoid scene.traverse() every frame
    function cacheAnimatedObjects() {
      animatedSceneObjects = {
        windmills: [],
        waterRipples: [],
        sparkles: [],
        crystals: [],
        cometParticles: [],
        waterfalls: [],
        waterDrops: [],
        splashes: [],
        teslaTowers: [] // FRESH: Tesla Tower animation
      };
      
      scene.traverse(obj => {
        if (obj.userData.isWindmill) animatedSceneObjects.windmills.push(obj);
        else if (obj.userData.isWaterRipple) animatedSceneObjects.waterRipples.push(obj);
        else if (obj.userData.isSparkle) animatedSceneObjects.sparkles.push(obj);
        else if (obj.userData.isCrystal) animatedSceneObjects.crystals.push(obj);
        else if (obj.userData.isCometParticle) animatedSceneObjects.cometParticles.push(obj);
        else if (obj.userData.isWaterfall) animatedSceneObjects.waterfalls.push(obj);
        else if (obj.userData.isWaterDrop) animatedSceneObjects.waterDrops.push(obj);
        else if (obj.userData.isSplash) animatedSceneObjects.splashes.push(obj);
        else if (obj.userData.isTeslaTower) animatedSceneObjects.teslaTowers.push(obj);
      });
    }

    // ── Quality Presets ─────────────────────────────────────────────────────
    // Ordered from lowest to highest. Each preset controls shadows, pixel ratio,
    // fog distance, and particle scale.  The dynamic FPS booster walks this list.
    const QUALITY_LEVELS = ['ultra-low','very-low','low','medium','high','very-high','ultra'];

    const QUALITY_PRESETS = {
      'ultra-low': { shadows: false, shadowType: 'Basic', shadowSize: 0,    pixelRatio: 0.4,  fogNear: 14, fogFar: 22, particleScale: 0.20 },
      'very-low':  { shadows: true,  shadowType: 'Basic', shadowSize: 256,  pixelRatio: 0.5,  fogNear: 16, fogFar: 26, particleScale: 0.35 },
      'low':       { shadows: true,  shadowType: 'Basic', shadowSize: 512,  pixelRatio: 0.6,  fogNear: 18, fogFar: 28, particleScale: 0.50 },
      'medium':    { shadows: true,  shadowType: 'PCFSoft', shadowSize: 1024, pixelRatio: 0.9,  fogNear: 20, fogFar: 32, particleScale: 0.75 },
      'high':      { shadows: true,  shadowType: 'PCFSoft', shadowSize: 2048, pixelRatio: 1.0,  fogNear: 22, fogFar: 36, particleScale: 1.00 },
      'very-high': { shadows: true,  shadowType: 'PCFSoft', shadowSize: 2048, pixelRatio: 1.0,  fogNear: 26, fogFar: 42, particleScale: 1.00 },
      'ultra':     { shadows: true,  shadowType: 'PCFSoft', shadowSize: 4096, pixelRatio: 1.0,  fogNear: 30, fogFar: 50, particleScale: 1.00 }
    };
    window.QUALITY_LEVELS  = QUALITY_LEVELS;
    window.QUALITY_PRESETS = QUALITY_PRESETS;

    // Apply graphics quality settings
    function applyGraphicsQuality(quality) {
      // 'auto' is handled by the dynamic FPS booster — don't apply directly
      if (quality === 'auto') return;

      if (!renderer || !window.dirLight) {
        console.warn('[Graphics Quality] Cannot apply settings: renderer or dirLight not initialized.');
        return;
      }

      const preset = QUALITY_PRESETS[quality];
      if (!preset) {
        console.warn('[Graphics Quality] Unknown quality level:', quality);
        return;
      }

      // Dispose existing shadow maps to ensure proper reinitialization
      if (window.dirLight.shadow.map) {
        window.dirLight.shadow.map.dispose();
        window.dirLight.shadow.map = null;
      }

      // ── Shadows ──
      renderer.shadowMap.enabled = preset.shadows;
      if (preset.shadows) {
        renderer.shadowMap.type = preset.shadowType === 'PCFSoft'
          ? THREE.PCFSoftShadowMap
          : THREE.BasicShadowMap;
        window.dirLight.shadow.mapSize.width  = preset.shadowSize;
        window.dirLight.shadow.mapSize.height = preset.shadowSize;
        window.dirLight.castShadow = true;
      } else {
        window.dirLight.castShadow = false;
      }

      // ── Pixel Ratio ──
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatio));

      // ── Fog Distance ──
      if (scene && scene.fog) {
        scene.fog.near = preset.fogNear;
        scene.fog.far  = preset.fogFar;
      }

      // ── Particle Scale (used by FPS watchdog throttle) ──
      if (window.performanceLog) {
        window.performanceLog.qualityParticleScale = preset.particleScale;
      }

      renderer.shadowMap.needsUpdate = true;
      console.log(`[Graphics Quality] Applied "${quality}" — shadows:${preset.shadows}, shadowSize:${preset.shadowSize}, pixelRatio:${preset.pixelRatio}, fog:${preset.fogNear}/${preset.fogFar}`);
    }

