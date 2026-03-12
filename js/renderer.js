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
  // Closer zoom like in camp for better character visibility and immersion
  cameraDistance: 10,
  // Camera world-space position (gives a balanced top-down isometric angle)
  cameraPositionX: 14,
  cameraPositionY: 13,
  cameraPositionZ: 14,
  // Scene fog distances (near/far clip for edge fog).
  // OPTIMIZED: Tightened further for ultra-compact world (60% reduction) — better FPS, fits smaller map
  fogNear: 15, // Reduced from 28 to 20, now 15 - fog starts closer
  fogFar: 28,  // Reduced from 45 to 35, now 28 - fog ends closer, hides edges of smaller world
  // Default shadow map size — 512 for faster GPU fill-rate (was 1024)
  defaultShadowMapSize: 512,
  // Directional light shadow frustum half-size — tightened to match closer view
  shadowFrustumHalfSize: 25, // Reduced from 30 for tighter shadow coverage
  // Directional light shadow quality settings
  shadowRadius: 2,   // Slightly less blur = faster shadow pass
  shadowBias: -0.0003, // Prevent shadow acne with better bias
  // Split-resolution: world/terrain renders at a reduced pixel ratio to boost baseline FPS.
  // UI and HTML overlays are unaffected (they always render at native device resolution).
  // antialias is now enabled; pixel ratio is capped at 2 to sharpen graphics on high-DPI
  // screens without destroying frame rate.
  worldPixelRatio: 2,      // 3D world render scale — capped at 2x DPR for crisp AA output
  uiPixelRatio: 1.0        // Reserved: HTML/CSS UI always renders at native resolution
};

window.GameRenderer = {
  RENDERER_CONFIG
};
