/**
 * ENGINE 2.0 SANDBOX
 *
 * Clean arena system with PBR ground, spawn hole, and world landmarks.
 * Replaces old wave manager and infinite ground plane.
 *
 * GROUND TEXTURE STATUS: ✅ WORKING
 * - Primary texture: assets/textures/mossy_brick_diff_4k.jpg (11MB, 4096x4096)
 * - Fallback chain: mossy_brick → ground/color.jpg → UUID.png → procedural
 * - Texture confirmed loading and displaying properly as of 2026-03-23
 * - Material: PBR MeshStandardMaterial with 20x20 repeat, anisotropic filtering
 *
 * LANDMARKS STATUS: ✅ ADDED 2026-03-24
 * - UFO crash site at (-50, 25) with glowing engine lights + companion egg
 * - Annunaki Obelisk at (25, -35) with energy crystal, rotating rings, pylons
 * - Lake with waterfall at (30, -30) with sparkles and animated water
 * - All landmarks animated in sandbox-loop.js
 *
 * NEVER modify this file without understanding the texture loading flow.
 * See README.md section "🧪 SANDBOX 2.0 — TESTING ENVIRONMENT" for details.
 */

class Engine2Sandbox {
  constructor(scene, camera) {
    this.scene = scene || null;
    this.camera = camera || null;
    this.groundMesh = null;
    this.rimMesh = null;
    this.loaded = false;

    // Texture loading state
    this.textures = {
      diffuse: null,
      normal: null,
      roughness: null
    };
  }

  /**
   * Initialize the Engine 2.0 arena
   * Called when "Start Run" is triggered
   * @param {THREE.Scene} [sceneOverride] optional scene passed by caller
   */
  init(sceneOverride) {
    if (sceneOverride) this.scene = sceneOverride;
    if (!this.scene) {
      console.warn('[Engine2] init() called without a valid scene. Aborting arena build.');
      return;
    }

    console.log('[Engine2] Initializing Engine 2.0 Sandbox...');

    // Load textures and create arena
    this._loadTextures(() => {
      this._createArena();
      this._createLandmarks();
      this.loaded = true;
      console.log('[Engine2] Engine 2.0 arena initialized successfully');
    });
  }

  /**
   * Load ground textures - uses file-based textures with fallback chain
   */
  _loadTextures(callback) {
    console.log('[Engine2] Loading ground textures...');
    const loader = new THREE.TextureLoader();

    // Helper to configure texture properly
    const configureTexture = (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(20, 20);
      texture.anisotropy = 16; // High quality filtering

      // Set proper color space for correct display
      if (THREE.SRGBColorSpace !== undefined) {
        texture.colorSpace = THREE.SRGBColorSpace;
      } else if (THREE.sRGBEncoding !== undefined) {
        texture.encoding = THREE.sRGBEncoding;
      }

      return texture;
    };

    // Helper to apply texture to material
    const applyTexture = (texture) => {
      this.textures.diffuse = texture;
      if (this.groundMesh && this.groundMesh.material) {
        this.groundMesh.material.map = texture;
        this.groundMesh.material.color.setHex(0xffffff); // White base for natural texture color
        this.groundMesh.material.needsUpdate = true;
      }
      console.log('[Engine2] ✓ Texture applied successfully');
    };

    // Fallback chain: Try loading textures in order
    const tryLoadTexture = (paths, index = 0) => {
      if (index >= paths.length) {
        console.warn('[Engine2] All texture files failed to load, using procedural fallback');
        this._createProceduralTexture();
        this._generateProceduralNormalMap();
        callback();
        return;
      }

      const path = paths[index];
      console.log(`[Engine2] Attempting to load: ${path}`);

      loader.load(
        path,
        (texture) => {
          console.log(`[Engine2] ✓ Successfully loaded: ${path}`);
          configureTexture(texture);
          applyTexture(texture);
          this._generateProceduralNormalMap();
          callback();
        },
        undefined,
        (error) => {
          console.warn(`[Engine2] Failed to load ${path}:`, error);
          tryLoadTexture(paths, index + 1);
        }
      );
    };

    // Texture fallback paths in priority order
    const texturePaths = [
      'assets/textures/mossy_brick_diff_4k.jpg',
      'assets/textures/ground/color.jpg',
      '654811F9-1760-4A74-B977-73ECB1A92913.png'
    ];

    tryLoadTexture(texturePaths);
  }

  /**
   * Create procedural texture as fallback when file loading fails
   */
  _createProceduralTexture() {
    console.log('[Engine2] Creating procedural stone texture...');

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Base stone color (warm grey/brown)
    ctx.fillStyle = '#8B7D6B';
    ctx.fillRect(0, 0, 1024, 1024);

    // Add stone tile pattern
    const tileSize = 128;
    for (let y = 0; y < 1024; y += tileSize) {
      for (let x = 0; x < 1024; x += tileSize) {
        // Tile variation
        const colorVar = Math.floor(Math.random() * 30 - 15);
        const baseGrey = 139 + colorVar;
        ctx.fillStyle = `rgb(${baseGrey + 10}, ${baseGrey}, ${baseGrey - 10})`;
        ctx.fillRect(x, y, tileSize, tileSize);

        // Grout lines
        ctx.strokeStyle = '#5a4a3a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, tileSize, tileSize);

        // Surface weathering
        for (let i = 0; i < 100; i++) {
          const wx = x + Math.random() * tileSize;
          const wy = y + Math.random() * tileSize;
          const brightness = 100 + Math.random() * 80;
          ctx.fillStyle = `rgba(${brightness}, ${brightness - 10}, ${brightness - 20}, ${Math.random() * 0.3})`;
          ctx.fillRect(wx, wy, Math.random() * 2 + 1, Math.random() * 2 + 1);
        }
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(20, 20);
    texture.anisotropy = 16;
    texture.needsUpdate = true; // CRITICAL: Force texture upload to GPU

    this.textures.diffuse = texture;

    if (this.groundMesh && this.groundMesh.material) {
      this.groundMesh.material.map = texture;
      this.groundMesh.material.color.setHex(0xffffff);
      this.groundMesh.material.needsUpdate = true;
    }

    console.log('[Engine2] ✓ Procedural stone texture applied with needsUpdate=true');
  }

  /**
   * Generate a procedural normal map for surface depth and detail
   * This adds realistic lighting to the ground even with simple textures
   */
  _generateProceduralNormalMap() {
    console.log('[Engine2] Generating procedural normal map for enhanced depth...');

    const canvas = document.createElement('canvas');
    const size = 1024;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base flat normal (pointing up)
    ctx.fillStyle = 'rgb(128, 128, 255)'; // Normal pointing straight up
    ctx.fillRect(0, 0, size, size);

    // Add height variation for stone blocks
    const tileSize = 128;
    const tilesX = Math.ceil(size / tileSize);
    const tilesY = Math.ceil(size / tileSize);

    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const x = tx * tileSize;
        const y = ty * tileSize;

        // Slight height variation per tile
        const heightVar = Math.random() * 20 - 10;

        // Edge normals for depth between tiles
        ctx.strokeStyle = `rgb(${128 + heightVar}, ${128 - heightVar}, ${240 + heightVar})`;
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, tileSize, tileSize);

        // Add some surface bumps within tiles
        for (let i = 0; i < 5; i++) {
          const bx = x + Math.random() * tileSize;
          const by = y + Math.random() * tileSize;
          const bRadius = 10 + Math.random() * 20;

          const bumpGradient = ctx.createRadialGradient(bx, by, 0, bx, by, bRadius);
          const normalVariation = Math.random() * 30 - 15;
          bumpGradient.addColorStop(0, `rgb(${128 + normalVariation}, ${128 + normalVariation}, ${255})`);
          bumpGradient.addColorStop(1, 'rgb(128, 128, 255)');

          ctx.fillStyle = bumpGradient;
          ctx.fillRect(bx - bRadius, by - bRadius, bRadius * 2, bRadius * 2);
        }
      }
    }

    // Create normal map texture
    const normalTexture = new THREE.CanvasTexture(canvas);
    normalTexture.wrapS = normalTexture.wrapT = THREE.RepeatWrapping;
    normalTexture.repeat.set(40, 40);
    normalTexture.anisotropy = 16;

    this.textures.normal = normalTexture;
    console.log('[Engine2] ✓ Normal map generated for enhanced lighting');
  }

  /**
   * Create the arena with ground plane and center hole
   */
  _createArena() {
    if (!this.scene) return;

    // Create the shape for the ground (200x200 unit square)
    const groundSize = 200;
    const shape = new THREE.Shape();

    // Define outer square boundary
    const halfSize = groundSize / 2;
    shape.moveTo(-halfSize, -halfSize);
    shape.lineTo(halfSize, -halfSize);
    shape.lineTo(halfSize, halfSize);
    shape.lineTo(-halfSize, halfSize);
    shape.lineTo(-halfSize, -halfSize);

    // Create circular hole in the center (radius ~3)
    const holeRadius = 3;
    const holePath = new THREE.Path();
    holePath.absarc(0, 0, holeRadius, 0, Math.PI * 2, false);
    shape.holes.push(holePath);

    // Create geometry from shape
    const groundGeometry = new THREE.ShapeGeometry(shape, 64); // 64 segments for smooth hole

    // Create material with enhanced PBR properties for realistic lighting
    const materialOptions = {
      color: 0xFFFFFF, // White base - allows texture colors to show naturally
      roughness: 0.85, // Slightly rough for stone/concrete feel
      metalness: 0.02, // Minimal metalness for natural stone
      envMapIntensity: 0.6, // Subtle environment reflections
      flatShading: false, // Smooth shading for better appearance
    };

    // Apply color/albedo texture
    if (this.textures.diffuse) {
      materialOptions.map = this.textures.diffuse;
      console.log('[Engine2] ========================================');
      console.log('[Engine2] ✓✓✓ APPLYING TEXTURE TO MATERIAL ✓✓✓');
      console.log('[Engine2] Texture object:', this.textures.diffuse);
      console.log('[Engine2] Material will use WHITE base color (0xFFFFFF) to show texture naturally');
      console.log('[Engine2] ========================================');
    } else {
      // Fallback: warm stone color
      materialOptions.color = 0x6B5A4A;
      console.log('[Engine2] ⚠ WARNING: Using fallback stone color (no texture loaded)');
    }

    // Apply normal map for surface depth
    if (this.textures.normal) {
      materialOptions.normalMap = this.textures.normal;
      materialOptions.normalScale = new THREE.Vector2(0.5, 0.5); // Subtle depth
      console.log('[Engine2] ✓ Using normal map for enhanced depth and lighting');
    }

    // Apply roughness if available
    if (this.textures.roughness) {
      materialOptions.roughnessMap = this.textures.roughness;
      console.log('[Engine2] ✓ Using roughness map');
    }

    const groundMaterial = new THREE.MeshStandardMaterial(materialOptions);

    // Enable shadow receiving for atmospheric lighting
    groundMaterial.shadowSide = THREE.FrontSide;

    // Create the mesh
    this.groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);

    // Rotate to be horizontal (XZ plane)
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.set(0, 0, 0);
    this.groundMesh.receiveShadow = true;

    // Add to scene
    this.scene.add(this.groundMesh);

    console.log('[Engine2] Created 200x200 ground with center hole (radius 3)');

    // Add rim around the hole for visual clarity
    this._createHoleRim(holeRadius);
  }

  /**
   * Create an enhanced rim/edge around the spawn hole
   * Creates a dramatic stone ledge with depth and weathering
   */
  _createHoleRim(radius) {
    if (!this.scene) return;

    // Main rim - weathered stone edge
    const rimGeometry = new THREE.TorusGeometry(radius, 0.2, 24, 96);
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0x4A3C2E, // Dark weathered stone
      roughness: 0.9,
      metalness: 0.1,
      emissive: 0x1a1410, // Subtle warm glow
      emissiveIntensity: 0.05
    });

    this.rimMesh = new THREE.Mesh(rimGeometry, rimMaterial);
    this.rimMesh.rotation.x = -Math.PI / 2;
    this.rimMesh.position.set(0, 0.08, 0); // Slightly raised
    this.rimMesh.castShadow = true;
    this.rimMesh.receiveShadow = true;
    this.scene.add(this.rimMesh);

    // Inner dark ring - creates depth illusion
    const innerRingGeometry = new THREE.TorusGeometry(radius - 0.15, 0.12, 16, 64);
    const innerRingMaterial = new THREE.MeshStandardMaterial({
      color: 0x2A1F1A,
      roughness: 0.95,
      metalness: 0.05,
      emissive: 0x0a0505,
      emissiveIntensity: 0.1
    });

    const innerRing = new THREE.Mesh(innerRingGeometry, innerRingMaterial);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.set(0, 0.04, 0);
    innerRing.receiveShadow = true;
    this.scene.add(innerRing);

    // Store for cleanup
    if (!this.rimMeshes) this.rimMeshes = [];
    this.rimMeshes.push(innerRing);

    console.log('[Engine2] ✓ Created enhanced hole rim with depth detail');
  }

  /**
   * Create world landmarks (UFO, Obelisk, Lake) for Sandbox 2.0
   * These are the key landmarks from the old map, ported to Engine 2.0
   */
  _createLandmarks() {
    if (!this.scene) return;

    console.log('[Engine2] Creating world landmarks...');

    // Store references for animation
    if (!window._engine2Landmarks) window._engine2Landmarks = {};

    // ══════════════════════════════════════════════════════════════
    // 1. UFO CRASH SITE — Northwest area (-50, 25)
    // ══════════════════════════════════════════════════════════════
    const shipGroup = new THREE.Group();
    shipGroup.position.set(-50, 0, 25);
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

    // Glowing engine lights around disc edge
    const engineColors = [0x00FFCC, 0x00FF88, 0x44FFAA];
    const engineLights = [];
    const enginePointLights = [];

    for (let e = 0; e < 6; e++) {
      const eAngle = (e / 6) * Math.PI * 2;

      // Engine light mesh
      const engineLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 8, 8),
        new THREE.MeshBasicMaterial({ color: engineColors[e % 3] })
      );
      engineLight.position.set(Math.cos(eAngle) * 7.5, 1.5, Math.sin(eAngle) * 7.5);
      engineLight.userData = { isEngineLight: true, phase: (e / 6) * Math.PI * 2 };
      shipGroup.add(engineLight);
      engineLights.push(engineLight);

      // Point light for real glow
      const enginePointLight = new THREE.PointLight(engineColors[e % 3], 2.5, 12);
      enginePointLight.position.set(Math.cos(eAngle) * 7.5, 1.5, Math.sin(eAngle) * 7.5);
      enginePointLight.userData = { isEngineLight: true, phase: (e / 6) * Math.PI * 2 };
      shipGroup.add(enginePointLight);
      enginePointLights.push(enginePointLight);
    }

    // Tilt the ship (crashed angle)
    shipGroup.rotation.x = 0.25;
    shipGroup.rotation.z = -0.15;

    // Crash crater under ship
    const crashGeo = new THREE.RingGeometry(6, 10, 16);
    const crashMat = new THREE.MeshBasicMaterial({ color: 0x4A3728, transparent: true, opacity: 0.7 });
    const crashCrater = new THREE.Mesh(crashGeo, crashMat);
    crashCrater.rotation.x = -Math.PI / 2;
    crashCrater.position.set(-50, 0.01, 25);
    this.scene.add(crashCrater);
    this.scene.add(shipGroup);

    // Companion Egg near UFO (quest objective)
    const eggGroup = new THREE.Group();
    eggGroup.position.set(-32, 0, 25);
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

    const eggLight = new THREE.PointLight(0x00FFB4, 3, 8);
    eggLight.position.y = 1;
    eggGroup.add(eggLight);
    eggGroup.userData = { isCompanionEgg: true, pickupRadius: 4 };
    this.scene.add(eggGroup);
    window.companionEggObject = eggGroup;

    // Store UFO references for animation
    window._engine2Landmarks.ufo = {
      group: shipGroup,
      engineLights: engineLights,
      enginePointLights: enginePointLights
    };

    console.log('[Engine2] ✓ UFO crash site created at (-50, 25)');

    // ══════════════════════════════════════════════════════════════
    // 2. ANNUNAKI OBELISK — Southwest region (25, -35)
    // ══════════════════════════════════════════════════════════════
    const obeliskGroup = new THREE.Group();
    obeliskGroup.position.set(25, 0, -35);

    // Main obelisk shaft - tapered monolith
    const obeliskHeight = 18;
    const obeliskBaseSize = 2.5;
    const obeliskTopSize = 1.8;

    const obeliskGeometry = new THREE.CylinderGeometry(obeliskTopSize, obeliskBaseSize, obeliskHeight, 4);
    const obeliskMaterial = new THREE.MeshStandardMaterial({
      color: 0xD4AF37, // Rich gold
      metalness: 0.7,
      roughness: 0.3,
      emissive: 0xFFD700,
      emissiveIntensity: 0.3
    });
    const obeliskShaft = new THREE.Mesh(obeliskGeometry, obeliskMaterial);
    obeliskShaft.position.y = obeliskHeight / 2;
    obeliskShaft.castShadow = true;
    obeliskShaft.receiveShadow = true;
    obeliskGroup.add(obeliskShaft);

    // Pyramidion cap (pointed top)
    const capGeometry = new THREE.ConeGeometry(obeliskTopSize + 0.3, 3, 4);
    const capMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFD700, // Bright gold
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0xFFD700,
      emissiveIntensity: 0.5
    });
    const pyramidionCap = new THREE.Mesh(capGeometry, capMaterial);
    pyramidionCap.position.y = obeliskHeight + 1.5;
    pyramidionCap.castShadow = true;
    obeliskGroup.add(pyramidionCap);

    // Base platform - stepped stone pedestal
    const baseLevels = 3;
    const baseColors = [0xB8956A, 0xA8856A, 0x98754A];
    for (let i = 0; i < baseLevels; i++) {
      const levelSize = 5 - i * 0.8;
      const levelHeight = 0.6;
      const baseGeo = new THREE.BoxGeometry(levelSize, levelHeight, levelSize);
      const baseMat = new THREE.MeshStandardMaterial({
        color: baseColors[i],
        roughness: 0.95,
        metalness: 0.0
      });
      const baseLevel = new THREE.Mesh(baseGeo, baseMat);
      baseLevel.position.y = i * levelHeight + levelHeight / 2;
      baseLevel.castShadow = true;
      baseLevel.receiveShadow = true;
      obeliskGroup.add(baseLevel);
    }

    // Hieroglyphic panels
    const hieroglyphicMat = new THREE.MeshBasicMaterial({ color: 0x2C1810 });
    const symbolPositions = [
      { y: 4, rot: 0 },
      { y: 7, rot: Math.PI / 4 },
      { y: 10, rot: 0 },
      { y: 13, rot: Math.PI / 4 },
      { y: 16, rot: 0 }
    ];

    symbolPositions.forEach(pos => {
      for (let face = 0; face < 4; face++) {
        const angle = (face / 4) * Math.PI * 2;
        const distance = obeliskBaseSize - 0.5;

        const symbolGeo = new THREE.BoxGeometry(0.8, 0.6, 0.05);
        const symbol = new THREE.Mesh(symbolGeo, hieroglyphicMat);
        symbol.position.set(
          Math.cos(angle) * distance,
          pos.y,
          Math.sin(angle) * distance
        );
        symbol.rotation.y = angle + Math.PI / 2 + pos.rot;
        obeliskGroup.add(symbol);
      }
    });

    // Energy crystal at top
    const crystalGeo = new THREE.OctahedronGeometry(0.8, 0);
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x00FFFF,
      metalness: 0.1,
      roughness: 0.1,
      transparent: true,
      opacity: 0.85,
      emissive: 0x00FFFF,
      emissiveIntensity: 1.2
    });
    const energyCrystal = new THREE.Mesh(crystalGeo, crystalMat);
    energyCrystal.position.y = obeliskHeight + 3.2;
    energyCrystal.userData = { isObeliskCrystal: true, phase: 0 };
    obeliskGroup.add(energyCrystal);

    // Energy field rings
    const energyRings = [];
    for (let ring = 0; ring < 3; ring++) {
      const ringGeo = new THREE.TorusGeometry(3 + ring * 1.5, 0.15, 8, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00FFFF,
        transparent: true,
        opacity: 0.3 - ring * 0.08
      });
      const energyRing = new THREE.Mesh(ringGeo, ringMat);
      energyRing.position.y = obeliskHeight / 2 + ring * 2;
      energyRing.rotation.x = Math.PI / 2;
      energyRing.userData = { isEnergyRing: true, phase: ring * (Math.PI * 2 / 3), speed: 0.5 + ring * 0.2 };
      obeliskGroup.add(energyRing);
      energyRings.push(energyRing);
    }

    // Mystical lights
    const obeliskTopLight = new THREE.PointLight(0x00FFFF, 3, 30);
    obeliskTopLight.position.y = obeliskHeight + 3;
    obeliskGroup.add(obeliskTopLight);

    const obeliskBaseLight = new THREE.PointLight(0xFFD700, 1.5, 15);
    obeliskBaseLight.position.y = 2;
    obeliskGroup.add(obeliskBaseLight);

    // Power conduit pylons
    const pylonCrystals = [];
    for (let pylon = 0; pylon < 4; pylon++) {
      const pylonAngle = (pylon / 4) * Math.PI * 2;
      const pylonDist = 7;

      const pylonGeo = new THREE.CylinderGeometry(0.3, 0.4, 4, 6);
      const pylonMat = new THREE.MeshStandardMaterial({
        color: 0xB8956A,
        roughness: 0.8,
        metalness: 0.2,
        emissive: 0x00AAAA,
        emissiveIntensity: 0.2
      });
      const pylonMesh = new THREE.Mesh(pylonGeo, pylonMat);
      pylonMesh.position.set(
        Math.cos(pylonAngle) * pylonDist,
        2,
        Math.sin(pylonAngle) * pylonDist
      );
      pylonMesh.castShadow = true;
      obeliskGroup.add(pylonMesh);

      // Crystal tops on pylons
      const pylonCrystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.4, 0),
        new THREE.MeshBasicMaterial({ color: 0x00FFFF, transparent: true, opacity: 0.7 })
      );
      pylonCrystal.position.set(
        Math.cos(pylonAngle) * pylonDist,
        4.2,
        Math.sin(pylonAngle) * pylonDist
      );
      pylonCrystal.userData = { isPylonCrystal: true, phase: pylon * Math.PI / 2 };
      obeliskGroup.add(pylonCrystal);
      pylonCrystals.push(pylonCrystal);
    }

    this.scene.add(obeliskGroup);

    // Obelisk ground marker
    const obeliskCircleGeo = new THREE.RingGeometry(8, 9, 32);
    const obeliskCircleMat = new THREE.MeshStandardMaterial({
      color: 0xB8956A,
      roughness: 0.95,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const obeliskCircle = new THREE.Mesh(obeliskCircleGeo, obeliskCircleMat);
    obeliskCircle.rotation.x = -Math.PI / 2;
    obeliskCircle.position.set(25, 0.01, -35);
    obeliskCircle.receiveShadow = true;
    this.scene.add(obeliskCircle);

    // Ancient runes
    for (let rune = 0; rune < 8; rune++) {
      const runeAngle = (rune / 8) * Math.PI * 2;
      const runeGeo = new THREE.BoxGeometry(0.6, 0.1, 0.4);
      const runeMat = new THREE.MeshBasicMaterial({ color: 0x2C1810 });
      const runeBlock = new THREE.Mesh(runeGeo, runeMat);
      runeBlock.position.set(
        25 + Math.cos(runeAngle) * 8.5,
        0.02,
        -35 + Math.sin(runeAngle) * 8.5
      );
      runeBlock.rotation.y = runeAngle + Math.PI / 2;
      this.scene.add(runeBlock);
    }

    // Store obelisk references for animation
    window._engine2Landmarks.obelisk = {
      group: obeliskGroup,
      crystal: energyCrystal,
      topLight: obeliskTopLight,
      baseLight: obeliskBaseLight,
      rings: energyRings,
      pylonCrystals: pylonCrystals
    };

    console.log('[Engine2] ✓ Annunaki Obelisk created at (25, -35)');

    // ══════════════════════════════════════════════════════════════
    // 3. LAKE WITH WATERFALL — Southeast area (30, -30)
    // ══════════════════════════════════════════════════════════════

    // Reflective lake
    const enhancedLakeGeo = new THREE.CircleGeometry(8, 48);
    const enhancedLakeMat = new THREE.MeshPhysicalMaterial({
      color: 0x4ECDC4,
      metalness: 0.5,
      roughness: 0.1,
      transparent: true,
      opacity: 0.85,
      reflectivity: 0.9,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const enhancedLake = new THREE.Mesh(enhancedLakeGeo, enhancedLakeMat);
    enhancedLake.rotation.x = -Math.PI / 2;
    enhancedLake.position.set(30, 0.03, -30);
    enhancedLake.receiveShadow = true;
    this.scene.add(enhancedLake);

    // Sandy shore ring
    const shoreGeo = new THREE.RingGeometry(7.5, 10, 48);
    const shoreMat = new THREE.MeshStandardMaterial({
      color: 0xC2B280,
      roughness: 0.9,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const shore = new THREE.Mesh(shoreGeo, shoreMat);
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(30, 0.02, -30);
    shore.receiveShadow = true;
    this.scene.add(shore);

    // Sun sparkles on lake
    const sparkles = [];
    for (let i = 0; i < 10; i++) {
      const sparkleGeo = new THREE.CircleGeometry(0.3, 6);
      const sparkleMat = new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        transparent: true,
        opacity: 0.8
      });
      const sparkle = new THREE.Mesh(sparkleGeo, sparkleMat);
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 7;
      sparkle.position.set(
        30 + Math.cos(angle) * dist,
        0.02,
        -30 + Math.sin(angle) * dist
      );
      sparkle.rotation.x = -Math.PI / 2;
      sparkle.userData = {
        isSparkle: true,
        phase: Math.random() * Math.PI * 2,
        speed: 1 + Math.random() * 2
      };
      this.scene.add(sparkle);
      sparkles.push(sparkle);
    }

    // Waterfall group
    const waterfallGroup = new THREE.Group();

    // Cliff/rock formation
    const cliffGeo = new THREE.BoxGeometry(8, 12, 6);
    const cliffMat = new THREE.MeshToonMaterial({ color: 0x696969 });
    const cliff = new THREE.Mesh(cliffGeo, cliffMat);
    cliff.position.set(20, 6, -35);
    cliff.castShadow = true;
    waterfallGroup.add(cliff);

    // Waterfall
    const waterfallGeo = new THREE.PlaneGeometry(3, 12);
    const waterfallMat = new THREE.MeshBasicMaterial({
      color: 0x87CEEB,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    const waterfall = new THREE.Mesh(waterfallGeo, waterfallMat);
    waterfall.position.set(20, 6, -29);
    waterfall.rotation.x = -0.2;
    waterfall.userData = { isWaterfall: true, phase: 0 };
    waterfallGroup.add(waterfall);

    // Flowing water particles
    const waterDrops = [];
    for (let i = 0; i < 5; i++) {
      const dropGeo = new THREE.SphereGeometry(0.3, 8, 8);
      const dropMat = new THREE.MeshBasicMaterial({
        color: 0x4ECDC4,
        transparent: true,
        opacity: 0.7
      });
      const drop = new THREE.Mesh(dropGeo, dropMat);
      drop.position.set(30 + (Math.random() - 0.5) * 2, 12 - i * 2, -39);
      drop.userData = { isWaterDrop: true, speed: 0.1 + Math.random() * 0.1, startY: 12 - i * 2 };
      waterfallGroup.add(drop);
      waterDrops.push(drop);
    }

    // Splash at bottom
    const splashGeo = new THREE.CircleGeometry(2, 16);
    const splashMat = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.4
    });
    const splash = new THREE.Mesh(splashGeo, splashMat);
    splash.rotation.x = -Math.PI / 2;
    splash.position.set(20, 0.1, -23);
    splash.userData = { isSplash: true, phase: 0 };
    waterfallGroup.add(splash);

    this.scene.add(waterfallGroup);

    // Store lake/waterfall references for animation
    window._engine2Landmarks.lake = {
      sparkles: sparkles,
      waterfall: waterfall,
      waterDrops: waterDrops,
      splash: splash
    };

    console.log('[Engine2] ✓ Lake with waterfall created at (30, -30)');
    console.log('[Engine2] ✓ All landmarks created successfully');
  }

  /**
   * Cleanup method - disposes all arena resources
   */
  dispose() {
    if (this.groundMesh && this.scene) {
      this.scene.remove(this.groundMesh);
      this.groundMesh.geometry.dispose();
      this.groundMesh.material.dispose();
    }
    this.groundMesh = null;

    if (this.rimMesh && this.scene) {
      this.scene.remove(this.rimMesh);
      this.rimMesh.geometry.dispose();
      this.rimMesh.material.dispose();
    }
    this.rimMesh = null;

    // Clean up additional rim meshes
    if (this.rimMeshes && this.scene) {
      this.rimMeshes.forEach(mesh => {
        this.scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
      });
      this.rimMeshes = [];
    }

    // Dispose textures
    if (this.textures.diffuse) this.textures.diffuse.dispose();
    if (this.textures.normal) this.textures.normal.dispose();
    if (this.textures.roughness) this.textures.roughness.dispose();

    this.loaded = false;
    console.log('[Engine2] ✓ Cleaned up Engine 2.0 arena and all resources');
  }
}

// Expose globally for non-module consumers
window.Engine2Sandbox = Engine2Sandbox;
