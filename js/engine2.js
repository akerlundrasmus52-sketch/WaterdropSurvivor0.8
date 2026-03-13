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
 * engine2.js — Engine 2.0 Sandbox Foundation
 *
 * Provides `Engine2Sandbox`, a self-contained class that builds the new
 * high-fidelity arena: a large PBR-textured ground plane with a circular
 * spawn hole cut out of the centre.
 *
 * Usage:
 *   const sandbox = new Engine2Sandbox();
 *   sandbox.init(scene);   // adds the arena ground to the provided Three.js scene
 *   sandbox.dispose();     // cleans up geometries/materials when no longer needed
 *
 * NOTE: This file does NOT modify the Camp, minigames, or gore/blood systems.
 */

/* global THREE */

class Engine2Sandbox {
  constructor() {
    /** @type {THREE.Mesh|null} */
    this._groundMesh = null;
    /** @type {THREE.Scene|null} */
    this._scene = null;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Build and add the arena ground to `scene`.
   * @param {THREE.Scene} scene
   */
  init(scene) {
    if (!scene) {
      console.warn('[Engine2Sandbox] init() called without a valid scene.');
      return;
    }
    this._scene = scene;

    const ground = this._buildGround();
    scene.add(ground);
    this._groundMesh = ground;
  }

  /**
   * Remove the arena ground from the scene and free GPU resources.
   */
  dispose() {
    if (this._groundMesh) {
      if (this._scene) {
        this._scene.remove(this._groundMesh);
      }
      this._groundMesh.geometry.dispose();
      if (this._groundMesh.material) {
        const mat = this._groundMesh.material;
        ['map', 'normalMap', 'roughnessMap'].forEach((key) => {
          if (mat[key]) mat[key].dispose();
        });
        mat.dispose();
      }
      this._groundMesh = null;
    }
    this._scene = null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build the arena ground: a 200×200 flat plane with a circular hole (r≈3.5)
   * at the centre, textured with Mossy Brick PBR maps.
   * @returns {THREE.Mesh}
   */
  _buildGround() {
    // ── Geometry: large square with a circular hole in the centre ────────────
    const arenaSize = 200;
    const holeRadius = 3.5;
    // curveSegments applies to all curves in the shape (outer square corners and
    // the inner circular hole arc), giving the hole a smooth appearance.
    const curveSegments = 64;

    // Outer square boundary (counter-clockwise winding for front face)
    const half = arenaSize / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-half, -half);
    shape.lineTo( half, -half);
    shape.lineTo( half,  half);
    shape.lineTo(-half,  half);
    shape.lineTo(-half, -half);

    // Circular hole at origin (clockwise winding punches the hole)
    const holePath = new THREE.Path();
    holePath.absarc(0, 0, holeRadius, 0, Math.PI * 2, true /* clockwise */);
    shape.holes.push(holePath);

    const geometry = new THREE.ShapeGeometry(shape, curveSegments);

    // ── Material: PBR with Mossy Brick textures ───────────────────────────────
    const material = this._buildMaterial();

    // ── Mesh: rotate so the XZ plane becomes the visible floor ───────────────
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    mesh.name = 'Engine2Ground';

    return mesh;
  }

  /**
   * Create a `THREE.MeshStandardMaterial` loaded with Mossy Brick PBR textures.
   * Falls back gracefully to a dark metallic colour if the texture files 404.
   * @returns {THREE.MeshStandardMaterial}
   */
  _buildMaterial() {
    // Fallback/base material properties used whether or not textures load
    const material = new THREE.MeshStandardMaterial({
      color:     0x1a1a1a,
      metalness: 0.6,
      roughness: 0.4,
    });

    const loader = new THREE.TextureLoader();

    /**
     * Load a texture, apply repeat-wrapping settings, and assign it to
     * `material[slot]`.  Silently swallows 404 errors so the game never
     * crashes if an asset is missing.
     */
    const loadTex = (slot, url) => {
      loader.load(
        url,
        (tex) => {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(20, 20);
          material[slot] = tex;
          material.needsUpdate = true;
        },
        undefined, // onProgress (unused)
        (err) => {
          console.warn(
            `[Engine2Sandbox] Texture "${url}" failed to load (${err.message || err}). ` +
            'Fallback colour will be used.'
          );
        }
      );
    };

    loadTex('map',          'assets/textures/ground/color.jpg');
    loadTex('normalMap',    'assets/textures/ground/normal.jpg');
    loadTex('roughnessMap', 'assets/textures/ground/roughness.jpg');

    return material;
  }
}

// Expose globally so other modules can access it without ES-module imports
window.Engine2Sandbox = Engine2Sandbox;
