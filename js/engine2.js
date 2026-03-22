/**
 * ENGINE 2.0 SANDBOX
 *
 * Clean arena system with PBR ground and spawn hole.
 * Replaces old wave manager and infinite ground plane.
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
      this.loaded = true;
      console.log('[Engine2] Engine 2.0 arena initialized successfully');
    });
  }

  /**
   * Load ground PBR textures with enhanced fallbacks
   * Priority: mossy_brick_diff_4k.jpg > ground/color.jpg > ground_texture.png > procedural texture
   * CRITICAL FIX: Proper texture loading with comprehensive error logging
   */
  _loadTextures(callback) {
    const loader = new THREE.TextureLoader();
    let loadedCount = 0;
    const totalTextures = 1;

    const checkComplete = () => {
      loadedCount++;
      if (loadedCount >= totalTextures) {
        // Generate procedural normal map for depth even without texture
        this._generateProceduralNormalMap();
        callback();
      }
    };

    const applyTexture = (texture, label) => {
      console.log('='.repeat(60));
      console.log('[Engine2] ✓✓✓ SUCCESS! Loaded ground texture: ' + label);
      console.log('[Engine2] Texture dimensions: ' + texture.image.width + 'x' + texture.image.height);
      console.log('='.repeat(60));

      this.textures.diffuse = texture;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(40, 40);

      // Apply maximum anisotropic filtering for crisp texture at angles
      const maxAniso = (typeof renderer !== 'undefined' && renderer && renderer.capabilities &&
                        typeof renderer.capabilities.getMaxAnisotropy === 'function')
        ? renderer.capabilities.getMaxAnisotropy()
        : 16;
      texture.anisotropy = Math.min(maxAniso, 16);
      console.log('[Engine2] Applied anisotropic filtering: ' + texture.anisotropy);

      // CRITICAL: Set encoding to sRGB for proper color display
      if (typeof THREE.SRGBColorSpace !== 'undefined') {
        texture.colorSpace = THREE.SRGBColorSpace;
        console.log('[Engine2] Using SRGBColorSpace (modern THREE.js)');
      } else if (typeof THREE.sRGBEncoding !== 'undefined') {
        texture.encoding = THREE.sRGBEncoding;
        console.log('[Engine2] Using sRGBEncoding (legacy THREE.js)');
      } else {
        console.warn('[Engine2] WARNING: No sRGB color space available!');
      }

      texture.needsUpdate = true;
      checkComplete();
    };

    // Try loading textures in priority order
    console.log('='.repeat(60));
    console.log('[Engine2] LOADING GROUND TEXTURES...');
    console.log('='.repeat(60));

    // ATTEMPT 1: mossy_brick_diff_4k.jpg (PRIMARY - 4K mossy stone texture)
    const path1 = 'assets/textures/mossy_brick_diff_4k.jpg';
    console.log('[Engine2] ATTEMPT 1: ' + path1);
    loader.load(
      path1,
      (texture) => applyTexture(texture, 'mossy_brick_diff_4k.jpg [4K Quality Mossy Stone]'),
      (progress) => {
        if (progress.lengthComputable) {
          const percent = (progress.loaded / progress.total * 100).toFixed(0);
          console.log('[Engine2] Loading: ' + percent + '% (' + (progress.loaded / 1024 / 1024).toFixed(1) + ' MB)');
        }
      },
      (error1) => {
        console.error('[Engine2] ✗ FAILED: ' + path1);
        console.error('[Engine2] Error details:', error1);

        // ATTEMPT 2: ground/color.jpg (FALLBACK 1)
        const path2 = 'assets/textures/ground/color.jpg';
        console.log('[Engine2] ATTEMPT 2: ' + path2);
        loader.load(
          path2,
          (texture) => applyTexture(texture, 'ground/color.jpg [Fallback 1]'),
          undefined,
          (error2) => {
            console.error('[Engine2] ✗ FAILED: ' + path2);
            console.error('[Engine2] Error details:', error2);

            // ATTEMPT 3: UUID texture in root (FALLBACK 2)
            const path3 = '654811F9-1760-4A74-B977-73ECB1A92913.png';
            console.log('[Engine2] ATTEMPT 3: ' + path3);
            loader.load(
              path3,
              (texture) => applyTexture(texture, 'UUID Ground Texture [Fallback 2]'),
              undefined,
              (error3) => {
                console.error('[Engine2] ✗ FAILED: ' + path3);
                console.error('[Engine2] Error details:', error3);
                console.warn('[Engine2] All texture files failed - generating procedural texture...');

                // FALLBACK: procedural stone color
                if (this.groundMesh && this.groundMesh.material) {
                  this.groundMesh.material.color.setHex(0x667755);
                  this.groundMesh.material.roughness = 0.95;
                  this.groundMesh.material.needsUpdate = true;
                  console.log('[Engine2] Using procedural stone color fallback');
                }

                // FALLBACK 3: Generate procedural texture
                this._generateProceduralTexture();
                checkComplete();
              }
            );
          }
        );
      }
    );
  }

  /**
   * Generate a beautiful procedural stone/ground texture using canvas
   * Creates a realistic cobblestone or weathered stone effect
   */
  _generateProceduralTexture() {
    console.log('[Engine2] Generating high-quality procedural ground texture...');

    const canvas = document.createElement('canvas');
    const size = 1024; // High resolution for quality
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base layer - weathered stone color
    const baseColor = '#5a4a3a'; // Warm brownish-gray stone
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);

    // Add noise for texture variation
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 40;
      data[i] += noise;     // R
      data[i + 1] += noise; // G
      data[i + 2] += noise; // B
    }
    ctx.putImageData(imageData, 0, 0);

    // Add stone blocks/tiles pattern
    const tileSize = 128;
    const tilesX = Math.ceil(size / tileSize);
    const tilesY = Math.ceil(size / tileSize);

    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const x = tx * tileSize;
        const y = ty * tileSize;
        const variation = Math.random() * 30 - 15;

        // Draw tile with slight color variation
        const tileShade = 90 + variation;
        ctx.fillStyle = `rgba(${tileShade}, ${tileShade - 10}, ${tileShade - 20}, 0.3)`;
        ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);

        // Add cracks/grout lines between tiles
        ctx.strokeStyle = 'rgba(40, 30, 20, 0.8)';
        ctx.lineWidth = 3 + Math.random() * 2;
        ctx.strokeRect(x, y, tileSize, tileSize);
      }
    }

    // Add moss/dirt patches for realism
    const patchCount = 50;
    for (let i = 0; i < patchCount; i++) {
      const px = Math.random() * size;
      const py = Math.random() * size;
      const radius = 20 + Math.random() * 60;

      const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
      gradient.addColorStop(0, 'rgba(60, 80, 40, 0.4)'); // Mossy green
      gradient.addColorStop(0.5, 'rgba(50, 60, 30, 0.2)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    }

    // Add weathering stains
    const stainCount = 80;
    for (let i = 0; i < stainCount; i++) {
      const sx = Math.random() * size;
      const sy = Math.random() * size;
      const sRadius = 10 + Math.random() * 30;

      const stainGradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, sRadius);
      const darkness = Math.random() * 50;
      stainGradient.addColorStop(0, `rgba(${darkness}, ${darkness}, ${darkness}, 0.3)`);
      stainGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = stainGradient;
      ctx.fillRect(sx - sRadius, sy - sRadius, sRadius * 2, sRadius * 2);
    }

    // Create THREE.js texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(40, 40);
    texture.anisotropy = 16;

    if (typeof THREE.SRGBColorSpace !== 'undefined') {
      texture.colorSpace = THREE.SRGBColorSpace;
    } else {
      texture.encoding = THREE.sRGBEncoding;
    }

    this.textures.diffuse = texture;
    console.log('[Engine2] ✓ Procedural texture generated successfully');
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
