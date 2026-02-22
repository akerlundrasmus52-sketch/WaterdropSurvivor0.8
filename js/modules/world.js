// js/modules/world.js
// World generation, terrain, landmarks, ambient creatures
    import * as THREE from 'three';
    import { COLORS, GAME_CONFIG } from './constants.js';
    import { gs, gameSettings } from './state.js';
    import { playSound } from './audio.js';

    // --- WORLD GENERATION ---
    function createWorld() {
      // Ground - Unified green forest world
      const mapSize = 600;
      
      // Single lush green ground plane covering the whole map
      const mainGroundGeo = new THREE.PlaneGeometry(mapSize, mapSize);
      const mainGroundMat = new THREE.MeshToonMaterial({ color: COLORS.ground }); // Green grass
      const mainGround = new THREE.Mesh(mainGroundGeo, mainGroundMat);
      mainGround.rotation.x = -Math.PI / 2;
      mainGround.position.set(0, 0, 0);
      mainGround.receiveShadow = true;
      gs.scene.add(mainGround);
      
      // Darker forest floor ring around the fountain spawn area
      const forestRingMat = new THREE.MeshToonMaterial({ color: 0x2E5A1A }); // Dark forest green, no transparency needed
      const forestRingGeo = new THREE.RingGeometry(12, 45, 32);
      const forestRingMesh = new THREE.Mesh(forestRingGeo, forestRingMat);
      forestRingMesh.rotation.x = -Math.PI / 2;
      forestRingMesh.position.set(0, 0.005, 0);
      gs.scene.add(forestRingMesh);
      
      // NOTE: Lake defined later using enhanced reflective lake
      
      // Add water ripple effect
      const rippleGeo = new THREE.RingGeometry(14, 15, 16); // Reduced segments for performance
      const rippleMat = new THREE.MeshBasicMaterial({ color: 0x3399FF, transparent: true, opacity: 0.5 });
      const ripple = new THREE.Mesh(rippleGeo, rippleMat);
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.set(30, 0.02, -30);
      ripple.userData = { isWaterRipple: true, phase: 0 };
      gs.scene.add(ripple);

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
      gs.scene.add(rondel);
      
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
      
      // Helper function to create wagon road with grass strip in middle
      function createWagonRoad(startX, startZ, endX, endZ, roadWidth = 4) {
        const length = Math.sqrt((endX - startX) ** 2 + (endZ - startZ) ** 2);
        const angle = Math.atan2(endZ - startZ, endX - startX);
        const midX = (startX + endX) / 2;
        const midZ = (startZ + endZ) / 2;
        
        // Create main road (brown dirt)
        const roadGeo = new THREE.PlaneGeometry(roadWidth, length);
        const road = new THREE.Mesh(roadGeo, roadMat);
        road.rotation.x = -Math.PI/2;
        road.rotation.z = angle - Math.PI/2;
        road.position.set(midX, 0.02, midZ);
        road.receiveShadow = true;
        gs.scene.add(road);
        
        // Create grass strip in middle (1/3 width of road)
        const grassStripWidth = roadWidth / 3;
        const grassGeo = new THREE.PlaneGeometry(grassStripWidth, length);
        const grassStrip = new THREE.Mesh(grassGeo, grassStripMat);
        grassStrip.rotation.x = -Math.PI/2;
        grassStrip.rotation.z = angle - Math.PI/2;
        grassStrip.position.set(midX, 0.03, midZ); // Slightly above road
        grassStrip.receiveShadow = true;
        gs.scene.add(grassStrip);
      }
      
      // 3 Main Wagon Roads from Central Hub (Rondel) - only to key regions
      // Roads start from different points on the rondel edge based on direction
      
      // 1. Road to Stonehenge (60, 60) - Northeast direction
      createWagonRoad(rondelRadius * 0.707, rondelRadius * 0.707, 60, 60, 4);
      
      // 2. Road to Windmill (40, 40) - East direction
      createWagonRoad(rondelRadius * 0.9, rondelRadius * 0.436, 40, 40, 4);
      
      // 3. Road to Tesla Tower (-80, -80) - Southwest direction
      createWagonRoad(-rondelRadius * 0.707, -rondelRadius * 0.707, -80, -80, 4);
      
      // Spawn Portal - ground ring at gs.player spawn position (syncs with countdown)
      const spawnPortalOuter = new THREE.RingGeometry(1.8, 2.4, 24);
      const spawnPortalInner = new THREE.CircleGeometry(1.8, 24);
      const spawnPortalOuterMat = new THREE.MeshBasicMaterial({ color: 0x00FFCC, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
      const spawnPortalInnerMat = new THREE.MeshBasicMaterial({ color: 0x00FFCC, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
      const spawnPortalRing = new THREE.Mesh(spawnPortalOuter, spawnPortalOuterMat);
      const spawnPortalDisc = new THREE.Mesh(spawnPortalInner, spawnPortalInnerMat);
      spawnPortalRing.rotation.x = -Math.PI / 2;
      spawnPortalDisc.rotation.x = -Math.PI / 2;
      spawnPortalRing.position.set(12, 0.06, 0);
      spawnPortalDisc.position.set(12, 0.05, 0);
      gs.scene.add(spawnPortalRing);
      gs.scene.add(spawnPortalDisc);
      window.spawnPortal = { ring: spawnPortalRing, disc: spawnPortalDisc, ringMat: spawnPortalOuterMat, discMat: spawnPortalInnerMat, phase: 0, active: true };
      
      // Farm Fields - Fill empty spaces with farm texture
      // Create large farm field background (performance optimized - single large mesh)
      const farmFieldMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x6B8E23, // Olive drab green for farmland
        metalness: 0.0,
        roughness: 0.95,
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
        gs.scene.add(fieldMesh);
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
        gs.scene.add(post);
        window.breakableFences.push(post);
        
        // Fence rail
        if (i % 2 === 0) {
          const rail = new THREE.Mesh(railGeo, fenceMat.clone());
          rail.position.set(x, 1, z);
          rail.rotation.y = angle;
          rail.userData = { isFence: true, hp: 10, maxHp: 10, originalPosition: rail.position.clone(), railAngle: angle };
          gs.scene.add(rail);
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
      gs.scene.add(cabin);

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
      gs.scene.add(groundLight);
      
      const wmBlades = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 1), new THREE.MeshBasicMaterial({color: 0x8B4513})); // Brown
      wmBlades.position.set(0, 7, 2);
      wmBlades.castShadow = true;
      wmGroup.add(wmBlades);
      const wmBlades2 = wmBlades.clone();
      wmBlades2.rotation.z = Math.PI/2;
      wmBlades2.castShadow = true;
      wmGroup.add(wmBlades2);
      
      // Add broken/damaged blade (third blade bent and damaged)
      const brokenBlade = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 0.9), new THREE.MeshBasicMaterial({color: 0x654321})); // Darker brown (damaged)
      brokenBlade.position.set(-3, 7, 2);
      brokenBlade.rotation.z = Math.PI * 0.15; // Bent at angle
      brokenBlade.castShadow = true;
      wmGroup.add(brokenBlade);
      
      // Store blades reference for rotation animation
      wmGroup.userData = { isWindmill: true, blades: [wmBlades, wmBlades2], hp: 600, maxHp: 600, questActive: false, light: wmLight };
      gs.scene.add(wmGroup);
      
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
      
      gs.scene.add(signpostGroup);

      // Farmer NPC near windmill (between windmill and barn)
      (function() {
        const farmerGroup = new THREE.Group();
        farmerGroup.position.set(44, 0, 44); // Between windmill and barn
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
        gs.scene.add(farmerGroup);
        gs.farmerNPC = farmerGroup;
      })();
      
      // Barn adjacent to windmill (not connected - placed to the north-east)
      const barnGroup = new THREE.Group();
      barnGroup.position.set(50, 0, 30); // Adjacent to windmill, not connected
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
      gs.scene.add(barnGroup);
      
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
      gs.scene.add(windmillFieldGroup);
      
      // Mine
      const mineGeo = new THREE.DodecahedronGeometry(5);
      const mineMat = new THREE.MeshToonMaterial({ color: 0x555555 });
      const mine = new THREE.Mesh(mineGeo, mineMat);
      mine.position.set(-40, 2, 40);
      gs.scene.add(mine);
      const mineEnt = new THREE.Mesh(new THREE.CircleGeometry(2, 16), new THREE.MeshBasicMaterial({color: 0x000000}));
      mineEnt.position.set(-40, 2, 44);
      mineEnt.rotation.y = Math.PI;
      gs.scene.add(mineEnt);

      // Phase 4: Stonehenge - Circle of big rocks - Relocated to new mystical location
      const stonehengeGroup = new THREE.Group();
      stonehengeGroup.position.set(60, 0, 60); // New location - northeast area
      
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
      
      gs.scene.add(stonehengeGroup);
      
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
      stonehengeChestGroup.position.set(60, 1, 60); // On top of Stonehenge altar
      stonehengeChestGroup.userData = { 
        isStonehengeChest: true, 
        questItem: true,
        pickupRadius: 3 // 3 units proximity to auto-pickup
      };
      gs.scene.add(stonehengeChestGroup);
      window.stonehengeChest = stonehengeChestGroup; // Store reference for proximity check

      // Mayan Pyramid - Stepped pyramid - MADE MORE VISIBLE
      const mayanGroup = new THREE.Group();
      mayanGroup.position.set(50, 0, -50);
      
      const pyramidMat = new THREE.MeshToonMaterial({ color: 0xD2B48C }); // Tan/beige like ancient stone
      const pyramidSteps = 6; // Increased from 5
      
      for(let i=0; i<pyramidSteps; i++) {
        const stepSize = 14 - i * 2; // Increased from (10 - i * 1.5)
        const stepHeight = 2.5; // Increased from 2
        const stepGeo = new THREE.BoxGeometry(stepSize, stepHeight, stepSize);
        const step = new THREE.Mesh(stepGeo, pyramidMat);
        step.position.set(0, i * stepHeight + stepHeight/2, 0);
        step.castShadow = true;
        mayanGroup.add(step);
      }
      
      // Temple on top - MADE LARGER
      const templeGeo = new THREE.BoxGeometry(4, 4, 4); // Increased from (3, 3, 3)
      const templeMat = new THREE.MeshToonMaterial({ color: 0x8B7355 }); // Darker brown
      const temple = new THREE.Mesh(templeGeo, templeMat);
      temple.position.set(0, pyramidSteps * 2.5 + 2, 0); // Adjusted for new step height
      temple.castShadow = true;
      mayanGroup.add(temple);
      
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
      
      gs.scene.add(mayanGroup);

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
      
      gs.scene.add(illuminatiGroup);

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
      
      gs.scene.add(statueGroup);

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
      gs.scene.add(fountainBasin);

      // Fountain outer stone rim
      const fountainRimGeo = new THREE.TorusGeometry(5.5, 0.35, 8, 32);
      const fountainRimMat = new THREE.MeshToonMaterial({ color: 0xB0BEC5 }); // Light gray stone
      const fountainRim = new THREE.Mesh(fountainRimGeo, fountainRimMat);
      fountainRim.rotation.x = -Math.PI / 2;
      fountainRim.position.set(0, 0.35, 0);
      fountainRim.castShadow = true;
      gs.scene.add(fountainRim);

      // Inner stone ring around pedestal base
      const fountainInnerRimGeo = new THREE.TorusGeometry(3.5, 0.25, 8, 24);
      const fountainInnerRim = new THREE.Mesh(fountainInnerRimGeo, fountainRimMat);
      fountainInnerRim.rotation.x = -Math.PI / 2;
      fountainInnerRim.position.set(0, 0.25, 0);
      gs.scene.add(fountainInnerRim);

      // Fountain water jets (arcing streams from inner rim)
      window.fountainJets = [];
      for (let j = 0; j < 6; j++) {
        const jAngle = (j / 6) * Math.PI * 2;
        const jetGeo = new THREE.SphereGeometry(0.12, 6, 6);
        const jetMat = new THREE.MeshBasicMaterial({ color: 0xADD8E6, transparent: true, opacity: 0.7 });
        const jet = new THREE.Mesh(jetGeo, jetMat);
        jet.position.set(Math.cos(jAngle) * 3.5, 0.5, Math.sin(jAngle) * 3.5);
        jet.userData = { isFountainJet: true, angle: jAngle, phase: (j / 6) * Math.PI * 2 };
        gs.scene.add(jet);
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
        gs.scene.add(stem);

        // Flower head
        const petalGeo = new THREE.SphereGeometry(0.2, 6, 4);
        const petalMat = new THREE.MeshToonMaterial({ color: fColor });
        const petal = new THREE.Mesh(petalGeo, petalMat);
        petal.position.set(Math.cos(fAngle) * fDist, 0.65, Math.sin(fAngle) * fDist);
        petal.scale.y = 0.5;
        gs.scene.add(petal);

        // Flower center
        const centerGeo = new THREE.SphereGeometry(0.08, 6, 4);
        const centerMat = new THREE.MeshToonMaterial({ color: 0xFFFF00 });
        const center = new THREE.Mesh(centerGeo, centerMat);
        center.position.set(Math.cos(fAngle) * fDist, 0.68, Math.sin(fAngle) * fDist);
        gs.scene.add(center);
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
        gs.scene.add(grass);
      }

      // Comet Stone - Beside the lake where gs.player spawns (brings the water droplet to life)
      const cometGroup = new THREE.Group();
      cometGroup.position.set(37, 0, -30); // Right beside lake where gs.player spawns
      
      // Impact crater (dark brown ring)
      const craterGeo = new THREE.RingGeometry(2, 3, 16); // Reduced segments for performance
      const craterMat = new THREE.MeshToonMaterial({ color: 0x3E2723 }); // Dark brown
      const crater = new THREE.Mesh(craterGeo, craterMat);
      crater.rotation.x = -Math.PI/2;
      crater.position.y = 0.02;
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
      
      // Glowing gs.particles around comet stone
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
      
      gs.scene.add(cometGroup);

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
      
      gs.scene.add(farmGroup);

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
      
      gs.scene.add(crystalGroup);

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
      
      gs.scene.add(waterfallGroup);

      // Reflective Lake - Enhanced with realistic water properties
      const enhancedLakeGeo = new THREE.CircleGeometry(18, 32);
      const enhancedLakeMat = new THREE.MeshPhysicalMaterial({ 
        color: COLORS.lake,
        metalness: 0.5, // Increased for better reflectivity
        roughness: 0.1, // Decreased for smoother, clearer reflections
        transparent: true,
        opacity: 0.85,
        reflectivity: 0.9, // Increased for enhanced water reflections
        clearcoat: 1.0, // Add clearcoat for wet surface look
        clearcoatRoughness: 0.1 // Smooth clearcoat for better reflections
      });
      const enhancedLake = new THREE.Mesh(enhancedLakeGeo, enhancedLakeMat);
      enhancedLake.rotation.x = -Math.PI / 2;
      enhancedLake.position.set(30, 0.01, -30);
      enhancedLake.receiveShadow = true; // Receive shadows for better depth
      gs.scene.add(enhancedLake);
      
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
        gs.scene.add(sparkle);
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
      gs.scene.add(underwaterChestGroup);
      window.underwaterChest = underwaterChestGroup;

      // More fences around farm area
      for(let i=0; i<20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        const x = 35 + Math.cos(angle) * 15;
        const z = 35 + Math.sin(angle) * 15;
        
        const post = new THREE.Mesh(postGeo, fenceMat);
        post.position.set(x, 1, z);
        post.castShadow = true;
        gs.scene.add(post);
        
        if (i % 2 === 0) {
          const rail = new THREE.Mesh(railGeo, fenceMat);
          rail.position.set(x, 1, z);
          rail.rotation.y = angle;
          gs.scene.add(rail);
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
      
      gs.scene.add(montanaGroup);
      gs.montanaLandmark = montanaGroup; // Store reference for efficient distance checks

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
      
      gs.scene.add(eiffelGroup);
      gs.eiffelLandmark = eiffelGroup; // Store reference for efficient distance checks

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
      
      // Main tower structure - tall metal cylinder
      const teslaTowerGeo = new THREE.CylinderGeometry(1.2, 1.5, 25, 12);
      const teslaTowerMat = new THREE.MeshPhysicalMaterial({ 
        color: 0x888888, 
        metalness: 0.8,
        roughness: 0.3
      });
      const teslaTower = new THREE.Mesh(teslaTowerGeo, teslaTowerMat);
      teslaTower.position.y = 14.5;
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
        ring.position.y = i * 5 + 2;
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
      coil.position.y = 27;
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
      ball.position.y = 29;
      teslaGroup.add(ball);
      
      // Add glow effect around top ball
      const glowGeo = new THREE.SphereGeometry(1.5, 16, 16);
      const glowMat = new THREE.MeshBasicMaterial({ 
        color: 0x00FFFF, 
        transparent: true,
        opacity: 0.3
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.y = 29;
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
        topPosition: new THREE.Vector3(-80, 29, -80),
        arcLines: [] // Will store line meshes
      };
      
      gs.scene.add(teslaGroup);

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
      
      for (let i = 0; i < 120; i++) { // Increased from 50 to 120
        const group = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1;
        trunk.castShadow = true;
        
        // Randomly choose tree type
        const treeType = Math.floor(Math.random() * 3);
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
        
        group.add(trunk);
        group.add(leaves);
        // Note: shadows are cast by the dirLight shadow map - no duplicate blob shadow needed
        
        // Random pos in forest area and spread across map
        // Lake exclusion zone constants
        const LAKE_CENTER_X = 30;
        const LAKE_CENTER_Z = -30;
        const LAKE_EXCLUSION_RADIUS = 18; // Lake radius 15 + buffer 3
        const MAX_SPAWN_ATTEMPTS = 20;
        
        // Phase 5: Simple exclusion - just avoid rondel center
        function isInRondel(x, z) {
          const distToCenter = Math.sqrt(x * x + z * z);
          return distToCenter < (rondelRadius + 2); // Rondel radius + buffer
        }
        
        let tx, tz;
        let inLake = true;
        let inRondel = true;
        let attempts = 0;
        
        // Avoid spawning trees in lake area and rondel
        while ((inLake || inRondel) && attempts < MAX_SPAWN_ATTEMPTS) {
          if (i < 80) {
            // First 80 trees in forest area (Top Left quadrant mostly)
            tx = (Math.random() * 100) - 90;
            tz = (Math.random() * 100) - 90;
          } else {
            // Remaining 40 trees spread across entire map
            tx = (Math.random() * 180) - 90;
            tz = (Math.random() * 180) - 90;
          }
          
          // Check if tree would be in lake
          const distToLake = Math.sqrt((tx - LAKE_CENTER_X) * (tx - LAKE_CENTER_X) + (tz - LAKE_CENTER_Z) * (tz - LAKE_CENTER_Z));
          inLake = distToLake < LAKE_EXCLUSION_RADIUS;
          
          // Check if tree would be in rondel
          inRondel = isInRondel(tx, tz);
          
          attempts++;
        }
        
        // Only add tree if not in lake and not in rondel
        if (!inLake && !inRondel) {
          group.position.set(tx, 0, tz);
          gs.scene.add(group);
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
        // Skip trees in the gs.player spawn zone (gs.player spawns at x=12, z=0) or on roads
        if (fx > 8 && fx < 20 && Math.abs(fz) < 5) continue; // Exclusion: gs.player spawn portal at (12,0,0)
        const fGroup = new THREE.Group();
        const fTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.5, 6), forestTrunkMat2);
        fTrunk.position.y = 1.25;
        fTrunk.castShadow = true;
        const fLeaves = new THREE.Mesh(new THREE.SphereGeometry(1.2 + Math.random() * 0.5, 7, 6), forestLeavesMat2);
        fLeaves.position.y = 3.2;
        fLeaves.castShadow = true;
        fGroup.add(fTrunk);
        fGroup.add(fLeaves);
        fGroup.position.set(fx, 0, fz);
        gs.scene.add(fGroup);
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
      
      // Add flowing water gs.particles
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
      
      gs.scene.add(waterfallGroup2);
      
      // Scatter flowers around environment
      const flowerGeo = new THREE.ConeGeometry(0.2, 0.5, 6);
      const flowerColors = [0xFF69B4, 0xFFFF00, 0xFF0000, 0xFFA500, 0xFFFFFF];
      
      for(let i=0; i<250; i++) {
        const flower = new THREE.Mesh(flowerGeo, new THREE.MeshBasicMaterial({ 
          color: flowerColors[Math.floor(Math.random() * flowerColors.length)] 
        }));
        flower.position.set(
          (Math.random() - 0.5) * 160,
          0.25,
          (Math.random() - 0.5) * 160
        );
        flower.rotation.x = -Math.PI/2;
        gs.scene.add(flower);
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
          gs.scene.add(treeGroup);
          
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
          gs.scene.add(mesh);
          
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
          gs.scene.add(mesh);
          
          hp = 15;
          maxHp = 15;
        }
        
        return {
          type: type,
          mesh: mesh,
          hp: hp,
          maxHp: maxHp,
          destroyed: false,
          originalScale: mesh.scale.clone(),
          originalColor: type === 'tree' ? 
            { trunk: mesh.userData.trunk.material.color.clone(), leaves: mesh.userData.leaves.material.color.clone() } :
            mesh.material.color.clone()
        };
      }
      
      // Spawn Trees (120) - scattered across the map
      for (let i = 0; i < 120; i++) {
        const x = (Math.random() - 0.5) * 250; // Spread across map
        const z = (Math.random() - 0.5) * 250;
        // Avoid spawning too close to center (gs.player start)
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
    }

    // Performance: Cache animated objects to avoid gs.scene.traverse() every frame
    function cacheAnimatedObjects() {
      gs.animatedSceneObjects = {
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
      
      gs.scene.traverse(obj => {
        if (obj.userData.isWindmill) gs.animatedSceneObjects.windmills.push(obj);
        else if (obj.userData.isWaterRipple) gs.animatedSceneObjects.waterRipples.push(obj);
        else if (obj.userData.isSparkle) gs.animatedSceneObjects.sparkles.push(obj);
        else if (obj.userData.isCrystal) gs.animatedSceneObjects.crystals.push(obj);
        else if (obj.userData.isCometParticle) gs.animatedSceneObjects.cometParticles.push(obj);
        else if (obj.userData.isWaterfall) gs.animatedSceneObjects.waterfalls.push(obj);
        else if (obj.userData.isWaterDrop) gs.animatedSceneObjects.waterDrops.push(obj);
        else if (obj.userData.isSplash) gs.animatedSceneObjects.splashes.push(obj);
        else if (obj.userData.isTeslaTower) gs.animatedSceneObjects.teslaTowers.push(obj);
      });
    }

    // Apply graphics quality settings
    function applyGraphicsQuality(quality) {
      if (!gs.renderer || !window.dirLight) {
        console.warn('[Graphics Quality] Cannot apply settings: gs.renderer or dirLight not initialized. Call after init() completes.');
        return;
      }
      
      // Dispose existing shadow maps to ensure proper reinitialization
      if (window.dirLight.shadow.map) {
        window.dirLight.shadow.map.dispose();
        window.dirLight.shadow.map = null;
      }
      
      switch(quality) {
        case 'low':
          // Low quality: Basic shadows, lower resolution
          gs.renderer.shadowMap.enabled = true;
          gs.renderer.shadowMap.type = THREE.BasicShadowMap;
          window.dirLight.shadow.mapSize.width = 512;
          window.dirLight.shadow.mapSize.height = 512;
          // Fixed 1:1 ratio for maximum performance on low-end devices
          gs.renderer.setPixelRatio(1);
          break;
        
        case 'medium':
          // Medium quality: Soft shadows, balanced resolution
          gs.renderer.shadowMap.enabled = true;
          gs.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
          window.dirLight.shadow.mapSize.width = 1024;
          window.dirLight.shadow.mapSize.height = 1024;
          // Cap at 1.5x device ratio for balanced quality/performance
          gs.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
          break;
        
        case 'high':
          // High quality: Best shadows, highest resolution
          gs.renderer.shadowMap.enabled = true;
          gs.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
          window.dirLight.shadow.mapSize.width = 2048;
          window.dirLight.shadow.mapSize.height = 2048;
          // Cap at 2x device ratio for maximum visual quality
          gs.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          break;
      }
      
      // Force shadow map update
      gs.renderer.shadowMap.needsUpdate = true;
      console.log(`[Graphics Quality] Applied ${quality} quality settings`);
    }

    export { createWorld, cacheAnimatedObjects, applyGraphicsQuality };
