// three-bridge.js
// Imports THREE.js via the import map and exposes it on window.THREE
// so that regular (non-module) scripts like camp-world.js and blood-system.js
// can access it.
//
// This script also dynamically loads the scripts that depend on window.THREE,
// since ES modules are deferred and run after regular scripts.

import * as THREE from 'three';
window.THREE = THREE;
console.log('[three-bridge] THREE.js r' + THREE.REVISION + ' exposed on window.THREE');

// Dynamically load scripts that depend on window.THREE, in order.
// These were previously <script> tags in index.html but must run AFTER THREE is available.
const threeDepScripts = [
  'js/blood-system.js',
  'js/spawn-sequence.js',
  'js/camp-world.js'
];

// Use top-level await so that main.js (next module in document order)
// does NOT start until all THREE-dependent scripts are loaded and executed.
for (const src of threeDepScripts) {
  await new Promise(function (resolve) {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = function () {
      console.error('[three-bridge] Failed to load ' + src + ' — continuing with remaining scripts');
      resolve(); // resolve instead of reject so remaining scripts still load
    };
    document.body.appendChild(script);
  });
}

window.threeBridgeReady = true;
console.log('[three-bridge] All THREE-dependent scripts loaded');
