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
   * Load ground PBR textures — tries mossy brick diffuse first, falls back to color.jpg
   */
  _loadTextures(callback) {
    const loader = new THREE.TextureLoader();
    let loadedCount = 0;
    const totalTextures = 1; // Just diffuse for now

    const checkComplete = () => {
      loadedCount++;
      if (loadedCount >= totalTextures) {
        callback();
      }
    };

    const applyTexture = (texture, label) => {
      console.log('[Engine2] Loaded ground texture: ' + label);
      this.textures.diffuse = texture;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(40, 40); // Mossy brick tiled at 5-unit scale across 200x200 ground
      const maxAniso = (typeof renderer !== 'undefined' && renderer && renderer.capabilities &&
                        typeof renderer.capabilities.getMaxAnisotropy === 'function')
        ? renderer.capabilities.getMaxAnisotropy()
        : 1;
      texture.anisotropy = maxAniso;
      // Set encoding to sRGB for proper color display.
      if (typeof THREE.SRGBColorSpace !== 'undefined') {
        texture.colorSpace = THREE.SRGBColorSpace;
      } else {
        texture.encoding = THREE.sRGBEncoding;
      }
      texture.needsUpdate = true;
      checkComplete();
    };

    // Try mossy brick diffuse first (best quality), fall back to color.jpg then plain color
    loader.load(
      'assets/textures/mossy_brick_diff_4k.jpg',
      (texture) => applyTexture(texture, 'mossy_brick_diff_4k.jpg'),
      undefined,
      () => {
        // Fallback 1: ground/color.jpg
        loader.load(
          'assets/textures/ground/color.jpg',
          (texture) => applyTexture(texture, 'ground/color.jpg'),
          undefined,
          (error) => {
            console.warn('[Engine2] All ground textures failed, using fallback color:', error);
            checkComplete();
          }
        );
      }
    );
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

    // Create material with PBR textures for better visuals
    const materialOptions = {
      color: 0xFFFFFF, // White base color - allows texture to show natural colors
      roughness: 0.75,
      metalness: 0.05,
      envMapIntensity: 0.5
    };

    // Apply textures if loaded successfully
    if (this.textures.diffuse) {
      materialOptions.map = this.textures.diffuse;
      // Texture encoding already set during load (sRGB for proper color display)
      console.log('[Engine2] Using ground color texture');
    } else {
      // Fallback to green grass color if texture fails
      materialOptions.color = 0x4A8C2A;
      console.log('[Engine2] Using fallback grass color');
    }

    if (this.textures.roughness) {
      materialOptions.roughnessMap = this.textures.roughness;
      console.log('[Engine2] Using roughness texture');
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
    if (!this.scene) return;

    const rimGeometry = new THREE.TorusGeometry(radius, 0.15, 16, 64);
    const rimMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513, // Brown/rust color
      roughness: 0.7,
      metalness: 0.3
    });

    this.rimMesh = new THREE.Mesh(rimGeometry, rimMaterial);
    this.rimMesh.rotation.x = -Math.PI / 2;
    this.rimMesh.position.set(0, 0.05, 0); // Slightly above ground
    this.rimMesh.castShadow = true;
    this.rimMesh.receiveShadow = true;

    this.scene.add(this.rimMesh);
    console.log('[Engine2] Created hole rim');
  }

  /**
   * Cleanup method
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

    // Dispose textures
    if (this.textures.diffuse) this.textures.diffuse.dispose();
    if (this.textures.normal) this.textures.normal.dispose();
    if (this.textures.roughness) this.textures.roughness.dispose();

    this.loaded = false;
    console.log('[Engine2] Cleaned up Engine 2.0 arena');
  }
}

// Expose globally for non-module consumers
window.Engine2Sandbox = Engine2Sandbox;
