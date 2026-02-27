// Exposes window.GameIdleCSS for use by main.js
// Injects all CSS needed for idle UI into <head>

var IDLE_CSS = [
  /* Overlay / Modal */
  '.idle-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9000;}',
  '.idle-modal{background:#1a1a2e;border:2px solid #5DADE2;border-radius:10px;padding:24px 32px;min-width:300px;max-width:480px;color:#e0e0e0;box-shadow:0 0 30px rgba(93,173,226,0.4);}',
  '.idle-modal-title{color:#FFD700;margin:0 0 10px;font-size:1.4em;text-align:center;}',
  '.idle-reward-list{list-style:none;padding:0;margin:10px 0;}',
  '.idle-reward-list li{padding:4px 0;border-bottom:1px solid #2a2a4a;}',

  /* Shared text colours */
  '.idle-gold-text{color:#FFD700;}',
  '.idle-blue-text{color:#5DADE2;}',
  '.idle-muted{color:#888;font-size:0.9em;margin:2px 0;}',
  '.idle-combo-text{color:#E74C3C;font-weight:bold;min-height:1.2em;}',

  /* Buttons */
  '.idle-btn{background:#16213e;color:#e0e0e0;border:1px solid #5DADE2;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:0.9em;transition:background 0.15s;}',
  '.idle-btn:hover:not(:disabled){background:#5DADE2;color:#1a1a2e;}',
  '.idle-btn:disabled{opacity:0.45;cursor:default;}',

  /* Section titles */
  '.idle-section-title{color:#5DADE2;margin:0 0 10px;border-bottom:1px solid #2a2a4a;padding-bottom:4px;}',

  /* Cards */
  '.idle-card{background:#16213e;border:1px solid #2a2a4a;border-radius:8px;padding:12px;margin:8px 0;}',
  '.idle-card-title{color:#FFD700;margin:0 0 6px;font-size:1em;}',

  /* Select */
  '.idle-select{background:#16213e;color:#e0e0e0;border:1px solid #5DADE2;border-radius:4px;padding:4px 8px;margin:4px 4px 4px 0;}',

  /* Fountain */
  '.idle-fountain-wrap{display:flex;justify-content:center;margin:10px 0;}',
  '.idle-fountain-btn{font-size:3.5em;background:none;border:none;cursor:pointer;transition:transform 0.1s;filter:drop-shadow(0 0 8px #5DADE2);}',
  '.idle-fountain-btn:hover{transform:scale(1.1);}',
  '.idle-fountain-pop{animation:fountain-ripple 0.3s ease-out;}',

  /* Prestige skill grid */
  '.idle-skill-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-top:8px;}',
  '.idle-skill-card{background:#16213e;border:1px solid #2a2a4a;border-radius:8px;padding:10px;text-align:center;}',
  '.idle-skill-name{color:#FFD700;font-weight:bold;margin-bottom:2px;}',
  '.idle-skill-level{color:#5DADE2;font-size:0.9em;margin-bottom:4px;}',
  '.idle-maxed{color:#27AE60;font-weight:bold;}',

  /* Daily quests */
  '.idle-quest-card{background:#16213e;border:1px solid #2a2a4a;border-radius:8px;padding:10px;margin:6px 0;}',
  '.idle-quest-done{border-color:#27AE60;opacity:0.8;}',
  '.idle-quest-label{color:#e0e0e0;font-weight:bold;margin-bottom:4px;}',
  '.idle-done-badge{color:#27AE60;font-size:0.9em;margin-top:4px;display:inline-block;}',

  /* Progress bars */
  '.idle-progress-bar-wrap{background:#0d0d1a;border-radius:4px;height:8px;margin:6px 0;overflow:hidden;}',
  '.idle-progress-bar-fill{height:100%;background:linear-gradient(90deg,#5DADE2,#27AE60);border-radius:4px;transition:width 0.3s;min-width:2px;}',

  /* Prestige glow on ascend button */
  '.idle-prestige-glow{animation:prestige-glow 1.5s infinite alternate;}',

  /* Animations */
  '@keyframes fountain-ripple{0%{transform:scale(1);}50%{transform:scale(1.3);}100%{transform:scale(1);}}',
  '@keyframes gold-sparkle{0%,100%{opacity:1;}50%{opacity:0.5;color:#fff;}}',
  '@keyframes prestige-glow{from{box-shadow:0 0 6px #9B59B6;}to{box-shadow:0 0 20px #9B59B6;}}',
  '@keyframes progress-fill{from{width:0%;}to{width:100%;}}'
].join('\n');

function init() {
  if (document.getElementById('idle-injected-styles')) return;
  var style = document.createElement('style');
  style.id = 'idle-injected-styles';
  style.textContent = IDLE_CSS;
  document.head.appendChild(style);
}

window.GameIdleCSS = {
  init: init,
  IDLE_CSS: IDLE_CSS
};
