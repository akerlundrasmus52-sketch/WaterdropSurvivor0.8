/**
 * ENGINE 2.0 SANDBOX
 *
 * Clean arena system with PBR ground and spawn hole.
 * Replaces old wave manager and infinite ground plane.
 */

class Engine2Sandbox {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.groundMesh = null;
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
   */
  init() {
    console.log('[Engine2] Initializing Engine 2.0 Sandbox...');

    // Load textures and create arena
    this._loadTextures(() => {
      this._createArena();
      this.loaded = true;
      console.log('[Engine2] Engine 2.0 arena initialized successfully');
    });
  }

  /**
   * Load Mossy Brick PBR textures with fallback
   */
  _loadTextures(callback) {
    const loader = new THREE.TextureLoader();
    let loadedCount = 0;
    const totalTextures = 2; // diffuse and roughness (skipping normal for now as it's in .exr format)

    const checkComplete = () => {
      loadedCount++;
      if (loadedCount >= totalTextures) {
        callback();
      }
    };

    // Load diffuse texture (4k available)
    loader.load(
      'mossy_brick_diff_4k.jpg',
      (texture) => {
        console.log('[Engine2] Loaded diffuse texture');
        this.textures.diffuse = texture;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(40, 40); // Tile across 200x200 ground
        checkComplete();
      },
      undefined,
      (error) => {
        console.warn('[Engine2] Failed to load diffuse texture, using fallback:', error);
        checkComplete();
      }
    );

    // Load roughness texture (4k available, but it's .exr format which may not load directly)
    // Try loading it, but expect it might fail
    loader.load(
      'mossy_brick_rough_4k.exr',
      (texture) => {
        console.log('[Engine2] Loaded roughness texture');
        this.textures.roughness = texture;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(40, 40);
        checkComplete();
      },
      undefined,
      (error) => {
        console.warn('[Engine2] Failed to load roughness texture (expected for .exr), continuing without it:', error);
        checkComplete();
      }
    );
  }

  /**
   * Create the arena with ground plane and center hole
   */
  _createArena() {
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

    // Create material with PBR textures
    const materialOptions = {
      color: 0x3a3a3a, // Dark grey fallback color
      roughness: 0.85,
      metalness: 0.1
    };

    // Apply textures if loaded successfully
    if (this.textures.diffuse) {
      materialOptions.map = this.textures.diffuse;
      console.log('[Engine2] Using mossy brick diffuse texture');
    } else {
      console.log('[Engine2] Using fallback dark metallic grey color');
    }

    if (this.textures.roughness) {
      materialOptions.roughnessMap = this.textures.roughness;
      console.log('[Engine2] Using mossy brick roughness texture');
    }

    const groundMaterial = new THREE.MeshStandardMaterial(materialOptions);

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
   * Create a rim/edge around the spawn hole for visual clarity
   */
  _createHoleRim(radius) {
    const rimGeometry = new THREE.TorusGeometry(radius, 0.15, 16, 64);
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513, // Brown/rust color
      roughness: 0.7,
      metalness: 0.3
    });

    const rimMesh = new THREE.Mesh(rimGeometry, rimMaterial);
    rimMesh.rotation.x = -Math.PI / 2;
    rimMesh.position.set(0, 0.05, 0); // Slightly above ground
    rimMesh.castShadow = true;
    rimMesh.receiveShadow = true;

    this.scene.add(rimMesh);
    console.log('[Engine2] Created hole rim');
  }

  /**
   * Cleanup method
   */
  dispose() {
    if (this.groundMesh) {
      this.scene.remove(this.groundMesh);
      this.groundMesh.geometry.dispose();
      this.groundMesh.material.dispose();
      this.groundMesh = null;
    }

    // Dispose textures
    if (this.textures.diffuse) this.textures.diffuse.dispose();
    if (this.textures.normal) this.textures.normal.dispose();
    if (this.textures.roughness) this.textures.roughness.dispose();

    this.loaded = false;
    console.log('[Engine2] Cleaned up Engine 2.0 arena');
  }
}

// Export to global scope
window.Engine2Sandbox = Engine2Sandbox;
