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
   * Load ground textures - using procedural grass texture
   */
  _loadTextures(callback) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 512;
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#3e7d39';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 1000; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * 512, Math.random() * 512);
      ctx.lineTo(Math.random() * 512, Math.random() * 512);
      ctx.stroke();
    }
    const groundTexture = new THREE.CanvasTexture(canvas);
    groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(20, 20);

    this.textures.diffuse = groundTexture;

    if (this.groundMesh && this.groundMesh.material) {
      this.groundMesh.material.map = groundTexture;
      this.groundMesh.material.color.setHex(0xffffff);
      this.groundMesh.material.needsUpdate = true;
    }
    console.log('[Engine2] Procedural grass texture applied');

    // Generate procedural normal map for depth even without texture
    this._generateProceduralNormalMap();
    callback();
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
