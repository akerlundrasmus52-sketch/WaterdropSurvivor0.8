// --- GAME STATE NAMESPACE ---
// Extracted from game.js - loaded as a regular script before game.js (module)
// Provides window.GameState as a shared namespace for game state
// Note: actual state variables remain in game.js (module scope) due to THREE.js
// dependencies and complex reassignment semantics; this namespace is available
// for future incremental migration.

window.GameState = {};
