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
  // Zoomed in from 15 → 11 for a tighter, more immersive view and higher FPS
  // (less geometry visible = less to render each frame)
  cameraDistance: 11,
  // Camera world-space position (gives a balanced top-down isometric angle)
  cameraPositionX: 14,
  cameraPositionY: 13,
  cameraPositionZ: 14,
  // Scene fog distances (near/far clip for edge fog).
  // Tightened to match the zoomed-in camera — hides distant objects sooner for FPS gain.
  fogNear: 20,
  fogFar: 32,
  // Default shadow map size — 512 for faster GPU fill-rate (was 1024)
  defaultShadowMapSize: 512,
  // Directional light shadow frustum half-size — tightened to match closer view
  shadowFrustumHalfSize: 30,
  // Directional light shadow quality settings
  shadowRadius: 2,   // Slightly less blur = faster shadow pass
  shadowBias: -0.0003, // Prevent shadow acne with better bias
  // Split-resolution: world/terrain renders at a reduced pixel ratio to boost baseline FPS.
  // UI and HTML overlays are unaffected (they always render at native device resolution).
  // Note: antialias is disabled in the renderer for major FPS gain; the higher pixel ratio
  // compensates for edge quality, and the net result is both sharper AND faster.
  worldPixelRatio: 1.0,    // 3D world render scale (raised from 0.85 since antialias is off)
  uiPixelRatio: 1.0        // Reserved: HTML/CSS UI always renders at native resolution
};

window.GameRenderer = {
  RENDERER_CONFIG
};
