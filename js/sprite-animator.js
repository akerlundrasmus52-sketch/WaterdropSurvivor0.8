// ============================================================
// sprite-animator.js — Spritesheet Animation System
// ============================================================
// Loads spritesheet PNGs and provides frame-by-frame animation
// for billboard-style character sprites in THREE.js scenes.
//
// The spritesheets are arranged in a grid layout:
//   IMG_1148.png — Walk (row 0-1) & Run (row 2-3)  animations
//   IMG_1150.png — Dash (row 0-1) & Slide (row 2-3) animations
//   IMG_1152.png — Shoot (row 0-1) & Knife (row 2-3) animations
//   IMG_1154.png — Chop (row 0-1) & Gather (row 2-3) animations
//
// Each sheet is 1024x1536 → 4 columns × 6 rows = 24 cells
// Each cell ≈ 256×256 pixels
// ============================================================

(function () {
  'use strict';

  const SHEET_COLS = 4;
  const SHEET_ROWS = 6;

  // Spritesheet file paths
  const SHEET_PATHS = [
    'sprite sheet/IMG_1148.png',  // sheet 0: walk + run
    'sprite sheet/IMG_1150.png',  // sheet 1: dash + slide
    'sprite sheet/IMG_1152.png',  // sheet 2: shoot + knife
    'sprite sheet/IMG_1154.png',  // sheet 3: chop + gather
  ];

  // Animation definitions: name → { sheet, frames: [{col, row}], fps, loop }
  // Each animation occupies ~2-3 rows in its spritesheet
  const ANIMATIONS = {
    idle:   { sheet: 0, frames: [{ c: 0, r: 0 }], fps: 1, loop: true },
    walk:   { sheet: 0, frames: [
      { c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 }, { c: 3, r: 0 },
      { c: 0, r: 1 }, { c: 1, r: 1 }, { c: 2, r: 1 }
    ], fps: 8, loop: true },
    run:    { sheet: 0, frames: [
      { c: 0, r: 3 }, { c: 1, r: 3 }, { c: 2, r: 3 }, { c: 3, r: 3 },
      { c: 0, r: 4 }, { c: 1, r: 4 }, { c: 2, r: 4 }, { c: 3, r: 4 }
    ], fps: 12, loop: true },
    dash:   { sheet: 1, frames: [
      { c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 }, { c: 3, r: 0 },
      { c: 0, r: 1 }, { c: 1, r: 1 }
    ], fps: 16, loop: false },
    slide:  { sheet: 1, frames: [
      { c: 0, r: 3 }, { c: 1, r: 3 }, { c: 2, r: 3 }, { c: 3, r: 3 },
      { c: 0, r: 4 }, { c: 1, r: 4 }
    ], fps: 10, loop: false },
    shoot:  { sheet: 2, frames: [
      { c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 }, { c: 3, r: 0 },
      { c: 0, r: 1 }, { c: 1, r: 1 }
    ], fps: 12, loop: false },
    knife:  { sheet: 2, frames: [
      { c: 0, r: 3 }, { c: 1, r: 3 }, { c: 2, r: 3 }, { c: 3, r: 3 },
      { c: 0, r: 4 }, { c: 1, r: 4 }
    ], fps: 10, loop: false },
    chop:   { sheet: 3, frames: [
      { c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 }, { c: 3, r: 0 },
      { c: 0, r: 1 }, { c: 1, r: 1 }, { c: 2, r: 1 }, { c: 3, r: 1 }
    ], fps: 8, loop: true },
    gather: { sheet: 3, frames: [
      { c: 0, r: 3 }, { c: 1, r: 3 }, { c: 2, r: 3 }, { c: 3, r: 3 },
      { c: 0, r: 4 }, { c: 1, r: 4 }, { c: 2, r: 4 }, { c: 3, r: 4 }
    ], fps: 6, loop: true },
    tool:   { sheet: 3, frames: [
      { c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 }, { c: 3, r: 0 },
      { c: 0, r: 1 }, { c: 1, r: 1 }
    ], fps: 8, loop: false },
  };

  /**
   * SpriteAnimator — manages spritesheet textures and frame animation
   * on a THREE.PlaneGeometry billboard mesh.
   */
  class SpriteAnimator {
    constructor(scene) {
      this._scene = scene;
      this._textures = [];      // loaded THREE.Texture per sheet
      this._loaded = false;
      this._currentAnim = 'idle';
      this._frameIndex = 0;
      this._frameTimer = 0;
      this._playing = true;
      this._onComplete = null;  // callback when non-loop anim ends
      this._mesh = null;        // the billboard PlaneGeometry mesh
      this._material = null;
    }

    /**
     * load() — load all spritesheet textures. Returns a Promise.
     */
    load() {
      const THREE = window.THREE;
      if (!THREE) return Promise.reject(new Error('THREE not available'));

      const loader = new THREE.TextureLoader();
      const promises = SHEET_PATHS.map(path =>
        new Promise((resolve) => {
          loader.load(path,
            (tex) => {
              tex.magFilter = THREE.NearestFilter;
              tex.minFilter = THREE.NearestFilter;
              tex.colorSpace = THREE.SRGBColorSpace;
              // Set repeat to show one cell at a time
              tex.repeat.set(1 / SHEET_COLS, 1 / SHEET_ROWS);
              tex.wrapS = THREE.ClampToEdgeWrapping;
              tex.wrapT = THREE.ClampToEdgeWrapping;
              resolve(tex);
            },
            undefined,
            () => {
              // On error, create a fallback blank texture
              console.warn('SpriteAnimator: failed to load', path);
              resolve(null);
            }
          );
        })
      );

      return Promise.all(promises).then(textures => {
        this._textures = textures;
        this._loaded = true;
        return this;
      });
    }

    /**
     * createMesh(size) — create the billboard plane mesh.
     * Returns the THREE.Mesh that should be added to the character group.
     */
    createMesh(size) {
      const THREE = window.THREE;
      if (!THREE) return null;

      const geo = new THREE.PlaneGeometry(size, size);
      this._material = new THREE.MeshBasicMaterial({
        transparent: true,
        alphaTest: 0.15,       // discard near-white background pixels
        side: THREE.DoubleSide,
        depthWrite: false
      });

      // Set initial texture
      if (this._textures[0]) {
        this._material.map = this._textures[0];
      }

      this._mesh = new THREE.Mesh(geo, this._material);
      this._mesh.renderOrder = 10; // render on top of 3D character
      return this._mesh;
    }

    /**
     * play(animName, onComplete) — switch to named animation
     */
    play(animName, onComplete) {
      if (!ANIMATIONS[animName]) return;
      if (this._currentAnim === animName && this._playing) return;
      this._currentAnim = animName;
      this._frameIndex = 0;
      this._frameTimer = 0;
      this._playing = true;
      this._onComplete = onComplete || null;
      this._applyFrame();
    }

    /**
     * update(dt) — advance frame timer
     */
    update(dt) {
      if (!this._loaded || !this._playing || !this._mesh) return;

      const anim = ANIMATIONS[this._currentAnim];
      if (!anim) return;

      this._frameTimer += dt;
      const frameDuration = 1 / anim.fps;

      if (this._frameTimer >= frameDuration) {
        this._frameTimer -= frameDuration;
        this._frameIndex++;

        if (this._frameIndex >= anim.frames.length) {
          if (anim.loop) {
            this._frameIndex = 0;
          } else {
            this._frameIndex = anim.frames.length - 1;
            this._playing = false;
            if (this._onComplete) this._onComplete();
            return;
          }
        }
        this._applyFrame();
      }
    }

    /**
     * isPlaying() — returns true if an animation is actively playing
     */
    isPlaying() { return this._playing; }

    /**
     * currentAnim() — returns name of current animation
     */
    currentAnim() { return this._currentAnim; }

    /**
     * setVisible(bool) — show/hide the sprite overlay
     */
    setVisible(v) {
      if (this._mesh) this._mesh.visible = v;
    }

    /**
     * _applyFrame() — set texture offset to current frame cell
     */
    _applyFrame() {
      const anim = ANIMATIONS[this._currentAnim];
      if (!anim || !this._material) return;

      const tex = this._textures[anim.sheet];
      if (!tex) return;

      // Swap texture if sheet changed
      if (this._material.map !== tex) {
        this._material.map = tex;
        this._material.needsUpdate = true;
      }

      const frame = anim.frames[this._frameIndex];
      // UV offset: bottom-left origin in THREE.js textures
      // Row 0 in our grid = top of image = high V
      tex.offset.set(
        frame.c / SHEET_COLS,
        1 - (frame.r + 1) / SHEET_ROWS
      );
    }

    /**
     * dispose() — clean up textures and geometry
     */
    dispose() {
      if (this._mesh) {
        if (this._mesh.geometry) this._mesh.geometry.dispose();
        if (this._material) this._material.dispose();
      }
      this._textures.forEach(t => { if (t) t.dispose(); });
      this._textures = [];
      this._mesh = null;
      this._material = null;
      this._loaded = false;
    }
  }

  // Export
  window.SpriteAnimator = SpriteAnimator;
  window.SPRITE_ANIMATIONS = ANIMATIONS;

})();
