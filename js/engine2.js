/**
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
