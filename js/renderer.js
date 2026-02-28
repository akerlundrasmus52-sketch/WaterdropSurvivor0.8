// --- RENDERER / SCENE CONFIGURATION ---
// Extracted from game.js - loaded as a regular script before the game.js ES module
// Exposes window.GameRenderer for use by main.js
//
// Only pure configuration constants are extracted here. The actual Three.js
// renderer, camera, and lighting objects are created inside the init() function
// in main.js because they depend on the THREE module import and on each other
// (e.g. dirLight is added to scene, renderer is appended to the DOM). Those
// objects stay coupled to the main module scope.

const RENDERER_CONFIG = {
  // Orthographic camera distance (half-height of the view frustum)
  cameraDistance: 15,
  // Camera world-space position (gives a balanced top-down isometric angle)
  cameraPositionX: 18,
  cameraPositionY: 16,
  cameraPositionZ: 18,
  // Scene fog distances (near/far clip for edge fog).
  // fogNear must exceed player camera-depth (~25.6) so the player is never inside the fog.
  // fogFar is pushed to ~42 so objects just beyond the visible area are fully hidden.
  fogNear: 28,
  fogFar: 42,
  // Default shadow map size — balanced quality/performance
  defaultShadowMapSize: 1024,
  // Directional light shadow frustum half-size (covers visible area; shadow is re-anchored to player each frame)
  shadowFrustumHalfSize: 45,
  // Directional light shadow quality settings
  shadowRadius: 2,   // Soft shadow blur - cheaper to compute
  shadowBias: -0.0003, // Prevent shadow acne with better bias
  // Split-resolution: world/terrain renders at a reduced pixel ratio to boost baseline FPS.
  // UI and HTML overlays are unaffected (they always render at native device resolution).
  worldPixelRatio: 0.75,   // 3D world render scale (< 1.0 = lower resolution = faster)
  uiPixelRatio: 1.0        // Reserved: HTML/CSS UI always renders at native resolution
};

window.GameRenderer = {
  RENDERER_CONFIG
};
