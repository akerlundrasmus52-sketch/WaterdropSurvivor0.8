/**
 * SANDBOX 2.0 DEBUG HELPER
 *
 * This script adds comprehensive logging and verification to help diagnose
 * why features might not be appearing in Sandbox 2.0.
 *
 * Include this AFTER sandbox-loop.js:
 * <script src="js/sandbox-debug.js"></script>
 */

(function() {
  'use strict';

  const DEBUG_PREFIX = '[🔍 SandboxDebug]';

  console.log(`${DEBUG_PREFIX} Sandbox Debug Helper loaded`);
  console.log(`${DEBUG_PREFIX} Waiting for DOM ready...`);

  function runDiagnostics() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${DEBUG_PREFIX} SANDBOX 2.0 DIAGNOSTIC REPORT`);
    console.log(`${'='.repeat(60)}\n`);

    // 1. Check if sandbox mode is active
    console.log(`${DEBUG_PREFIX} 1. SANDBOX MODE`);
    console.log(`   _engine2SandboxMode: ${window._engine2SandboxMode}`);
    console.log(`   isGameActive: ${window.isGameActive}`);
    console.log(`   isGameOver: ${window.isGameOver}`);
    console.log(`   isPaused: ${window.isPaused}\n`);

    // 2. Check THREE.js
    console.log(`${DEBUG_PREFIX} 2. THREE.JS`);
    console.log(`   THREE available: ${typeof THREE !== 'undefined'}`);
    if (typeof THREE !== 'undefined') {
      console.log(`   THREE.REVISION: ${THREE.REVISION || 'unknown'}`);
    }
    console.log('');

    // 3. Check core game objects
    console.log(`${DEBUG_PREFIX} 3. CORE GAME OBJECTS`);
    console.log(`   scene: ${typeof scene !== 'undefined' ? '✓' : '✗'}`);
    console.log(`   camera: ${typeof camera !== 'undefined' ? '✓' : '✗'}`);
    console.log(`   renderer: ${typeof renderer !== 'undefined' ? '✓' : '✗'}`);
    console.log(`   player: ${typeof player !== 'undefined' && player ? '✓' : '✗'}`);
    if (typeof player !== 'undefined' && player && player.mesh) {
      console.log(`   player.mesh.position: (${player.mesh.position.x.toFixed(2)}, ${player.mesh.position.y.toFixed(2)}, ${player.mesh.position.z.toFixed(2)})`);
    }
    console.log('');

    // 4. Check Engine2Sandbox
    console.log(`${DEBUG_PREFIX} 4. ENGINE2 SANDBOX`);
    console.log(`   Engine2Sandbox class: ${typeof Engine2Sandbox !== 'undefined' ? '✓' : '✗'}`);
    console.log(`   _engine2Instance: ${typeof window._engine2Instance !== 'undefined' && window._engine2Instance ? '✓' : '✗'}`);
    if (window._engine2Instance) {
      const e2 = window._engine2Instance;
      console.log(`   loaded: ${e2.loaded}`);
      console.log(`   groundMesh: ${e2.groundMesh ? '✓' : '✗'}`);
      if (e2.groundMesh && e2.groundMesh.material) {
        console.log(`   ground material.map: ${e2.groundMesh.material.map ? '✓ (texture loaded)' : '✗ (no texture)'}`);
        console.log(`   ground material.color: #${e2.groundMesh.material.color.getHexString()}`);
      }
    }
    console.log('');

    // 5. Check Blood/Gore Systems
    console.log(`${DEBUG_PREFIX} 5. BLOOD & GORE SYSTEMS`);
    console.log(`   BloodSystem: ${typeof BloodSystem !== 'undefined' ? '✓' : '✗'}`);
    console.log(`   BloodV2: ${typeof window.BloodV2 !== 'undefined' ? '✓' : '✗'}`);
    console.log(`   GoreSim: ${typeof window.GoreSim !== 'undefined' ? '✓' : '✗'}`);
    console.log(`   TraumaSystem: ${typeof TraumaSystem !== 'undefined' ? '✓' : '✗'}`);
    console.log('');

    // 6. Check Settings Button
    console.log(`${DEBUG_PREFIX} 6. SETTINGS BUTTON (Eye of Horus)`);
    const settingsBtn = document.getElementById('settings-btn');
    console.log(`   #settings-btn element: ${settingsBtn ? '✓' : '✗'}`);
    if (settingsBtn) {
      console.log(`   display: ${window.getComputedStyle(settingsBtn).display}`);
      console.log(`   visibility: ${window.getComputedStyle(settingsBtn).visibility}`);
      console.log(`   ::before content: ${window.getComputedStyle(settingsBtn, '::before').content}`);
      const rect = settingsBtn.getBoundingClientRect();
      console.log(`   position: top=${rect.top}px, right=${window.innerWidth - rect.right}px`);
    }
    console.log('');

    // 7. Check Spawn Animation
    console.log(`${DEBUG_PREFIX} 7. SPAWN ANIMATION`);
    // Note: These variables are in sandbox-loop.js closure, so we can't access them directly
    // But we can check if player is at starting position
    if (typeof player !== 'undefined' && player && player.mesh) {
      const startY = -1.5;
      const finalY = 0.5;
      const currentY = player.mesh.position.y;
      if (Math.abs(currentY - startY) < 0.1) {
        console.log(`   Player at start position (y=${currentY.toFixed(2)}) - animation should trigger`);
      } else if (Math.abs(currentY - finalY) < 0.1) {
        console.log(`   Player at final position (y=${currentY.toFixed(2)}) - animation completed`);
      } else {
        console.log(`   Player at intermediate position (y=${currentY.toFixed(2)}) - animation in progress`);
      }
    }
    console.log('');

    // 8. Check UI Layer
    console.log(`${DEBUG_PREFIX} 8. UI LAYER`);
    const uiLayer = document.getElementById('ui-layer');
    console.log(`   #ui-layer element: ${uiLayer ? '✓' : '✗'}`);
    if (uiLayer) {
      console.log(`   display: ${window.getComputedStyle(uiLayer).display}`);
    }
    const loadingScreen = document.getElementById('loading-screen');
    console.log(`   #loading-screen: ${loadingScreen ? '✓' : '✗'}`);
    if (loadingScreen) {
      console.log(`   display: ${window.getComputedStyle(loadingScreen).display}`);
    }
    console.log('');

    // 9. Check Canvas
    console.log(`${DEBUG_PREFIX} 9. CANVAS RENDERING`);
    const gameContainer = document.getElementById('game-container');
    console.log(`   #game-container: ${gameContainer ? '✓' : '✗'}`);
    if (gameContainer) {
      const canvas = gameContainer.querySelector('canvas');
      console.log(`   canvas element: ${canvas ? '✓' : '✗'}`);
      if (canvas) {
        console.log(`   canvas size: ${canvas.width}×${canvas.height}`);
        console.log(`   canvas display: ${window.getComputedStyle(canvas).display}`);
      }
    }
    console.log('');

    // 10. Check for JavaScript errors
    console.log(`${DEBUG_PREFIX} 10. ERROR CHECK`);
    console.log(`   Check console above for any RED error messages`);
    console.log(`   Common issues:`);
    console.log(`   - File not found (404) for textures/scripts`);
    console.log(`   - CORS errors (open via http:// not file://)`);
    console.log(`   - Undefined variable/function errors`);
    console.log('');

    console.log(`${'='.repeat(60)}`);
    console.log(`${DEBUG_PREFIX} END OF DIAGNOSTIC REPORT`);
    console.log(`${'='.repeat(60)}\n`);

    // Add helpful commands
    console.log(`${DEBUG_PREFIX} Helpful Commands:`);
    console.log(`   Type in console: checkTexture() - Check ground texture status`);
    console.log(`   Type in console: checkSpawn() - Check spawn animation status`);
    console.log(`   Type in console: checkBlood() - Check blood system status`);
    console.log(`   Type in console: forceSpawn() - Force trigger spawn animation`);
    console.log('');
  }

  // Helper functions accessible from console
  window.checkTexture = function() {
    if (window._engine2Instance && window._engine2Instance.groundMesh) {
      const mat = window._engine2Instance.groundMesh.material;
      console.log('Ground Material:', mat);
      console.log('Texture (map):', mat.map);
      console.log('Color:', '#' + mat.color.getHexString());
      if (mat.map) {
        console.log('Texture Image:', mat.map.image);
        console.log('Texture Size:', mat.map.image?.width, '×', mat.map.image?.height);
      }
    } else {
      console.log('Engine2 instance or ground mesh not found');
    }
  };

  window.checkSpawn = function() {
    if (typeof player !== 'undefined' && player && player.mesh) {
      console.log('Player position:', player.mesh.position);
      console.log('Player Y should be:');
      console.log('  -1.5 = start (underground)');
      console.log('  0.5 = final (surface)');
    } else {
      console.log('Player not found');
    }
  };

  window.checkBlood = function() {
    console.log('BloodSystem:', typeof BloodSystem !== 'undefined' ? BloodSystem : 'not loaded');
    console.log('BloodV2:', typeof window.BloodV2 !== 'undefined' ? window.BloodV2 : 'not loaded');
    console.log('GoreSim:', typeof window.GoreSim !== 'undefined' ? window.GoreSim : 'not loaded');
    console.log('TraumaSystem:', typeof TraumaSystem !== 'undefined' ? TraumaSystem : 'not loaded');
  };

  window.forceSpawn = function() {
    console.log('Note: Spawn animation state is in sandbox-loop.js closure');
    console.log('Try refreshing the page to restart the spawn animation');
    if (typeof player !== 'undefined' && player && player.mesh) {
      player.mesh.position.y = -1.5;
      console.log('Reset player to start position (y=-1.5)');
      console.log('Refresh page for full spawn animation');
    }
  };

  // Run diagnostics when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Wait a bit for everything to initialize
      setTimeout(runDiagnostics, 500);
    });
  } else {
    setTimeout(runDiagnostics, 500);
  }

  // Also expose a manual trigger
  window.runSandboxDiagnostics = runDiagnostics;

  console.log(`${DEBUG_PREFIX} Type runSandboxDiagnostics() to run diagnostics manually`);

})();
