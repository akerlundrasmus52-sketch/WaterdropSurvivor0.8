// Exposes window.GameIdleCSS for use by main.js
// Injects all CSS needed for idle UI into <head>
// Styled to match the game's 80s comic-magazine aesthetic

var IDLE_CSS = [
  /* ── Overlay / Modal ─────────────────────────────────────────────────────── */
  '.idle-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.88);display:flex;align-items:center;justify-content:center;z-index:9000;}',
  '.idle-modal{background:linear-gradient(135deg,#1e3a5f 0%,#0d1f3a 100%);border:4px solid #FFD700;border-radius:10px;padding:24px 28px;min-width:300px;max-width:480px;color:#fff;box-shadow:0 0 30px rgba(255,215,0,0.4),inset 0 0 20px rgba(0,0,0,0.3);font-family:"Bangers",cursive;}',
  '.idle-modal-title{color:#FFD700;margin:0 0 10px;font-size:1.6em;text-align:center;text-shadow:2px 2px 0 #000,-1px -1px 0 #000;letter-spacing:1px;}',
  '.idle-reward-list{list-style:none;padding:0;margin:10px 0;font-family:Arial,sans-serif;}',
  '.idle-reward-list li{padding:5px 0;border-bottom:1px solid rgba(255,215,0,0.2);font-size:14px;}',

  /* ── Shared text colours ─────────────────────────────────────────────────── */
  '.idle-gold-text{color:#FFD700;font-weight:bold;}',
  '.idle-blue-text{color:#5DADE2;}',
  '.idle-muted{color:#aaa;font-size:0.9em;margin:2px 0;font-family:Arial,sans-serif;}',
  '.idle-combo-text{color:#FF4500;font-weight:bold;min-height:1.2em;font-family:"Bangers",cursive;}',

  /* ── Buttons (match game .btn style) ─────────────────────────────────────── */
  '.idle-btn{background:linear-gradient(to bottom,#FFD700,#FFA500);color:#000;border:2px solid #000;border-radius:4px;padding:6px 14px;cursor:pointer;font-family:"Bangers",cursive;font-size:1em;letter-spacing:1px;box-shadow:2px 2px 0 #000;transition:transform 0.1s,box-shadow 0.1s;}',
  '.idle-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:3px 3px 0 #000;}',
  '.idle-btn:active:not(:disabled){transform:translateY(1px);box-shadow:1px 1px 0 #000;}',
  '.idle-btn:disabled{opacity:0.45;cursor:default;}',

  /* ── Section titles ──────────────────────────────────────────────────────── */
  '.idle-section-title{color:#FFD700;margin:0 0 10px;border-bottom:2px solid #FFD700;padding-bottom:4px;font-family:"Bangers",cursive;font-size:1.3em;letter-spacing:1px;text-shadow:1px 1px 0 #000;}',

  /* ── Cards ───────────────────────────────────────────────────────────────── */
  '.idle-card{background:rgba(255,215,0,0.06);border:2px solid rgba(255,215,0,0.35);border-radius:8px;padding:12px;margin:8px 0;}',
  '.idle-card-title{color:#FFD700;margin:0 0 6px;font-size:1em;font-family:"Bangers",cursive;letter-spacing:1px;}',

  /* ── Select ──────────────────────────────────────────────────────────────── */
  '.idle-select{background:#0d1f3a;color:#fff;border:1px solid #FFD700;border-radius:4px;padding:4px 8px;margin:4px 4px 4px 0;font-family:Arial,sans-serif;}',

  /* ── Fountain ────────────────────────────────────────────────────────────── */
  '.idle-fountain-wrap{display:flex;justify-content:center;margin:10px 0;}',
  '.idle-fountain-btn{font-size:3.5em;background:none;border:none;cursor:pointer;transition:transform 0.1s;filter:drop-shadow(0 0 8px #FFD700);}',
  '.idle-fountain-btn:hover{transform:scale(1.1);}',
  '.idle-fountain-pop{animation:fountain-ripple 0.3s ease-out;}',

  /* ── Prestige skill grid ─────────────────────────────────────────────────── */
  '.idle-skill-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-top:8px;}',
  '.idle-skill-card{background:rgba(255,215,0,0.06);border:2px solid rgba(255,215,0,0.3);border-radius:8px;padding:10px;text-align:center;}',
  '.idle-skill-name{color:#FFD700;font-family:"Bangers",cursive;font-size:1.1em;margin-bottom:2px;}',
  '.idle-skill-level{color:#5DADE2;font-size:0.9em;margin-bottom:4px;}',
  '.idle-maxed{color:#2ecc71;font-weight:bold;}',

  /* ── Daily quests ────────────────────────────────────────────────────────── */
  '.idle-quest-card{background:rgba(255,215,0,0.06);border:2px solid rgba(255,215,0,0.3);border-radius:8px;padding:10px;margin:6px 0;}',
  '.idle-quest-done{border-color:#2ecc71;opacity:0.8;}',
  '.idle-quest-label{color:#fff;font-weight:bold;margin-bottom:4px;font-family:Arial,sans-serif;}',
  '.idle-done-badge{color:#2ecc71;font-size:0.9em;margin-top:4px;display:inline-block;}',

  /* ── Progress bars ───────────────────────────────────────────────────────── */
  '.idle-progress-bar-wrap{background:rgba(0,0,0,0.5);border-radius:4px;height:10px;margin:6px 0;overflow:hidden;border:1px solid rgba(255,215,0,0.2);}',
  '.idle-progress-bar-fill{height:100%;background:linear-gradient(90deg,#FFD700,#FFA500);border-radius:4px;transition:width 0.3s;min-width:2px;}',

  /* ── Prestige glow on ascend button ──────────────────────────────────────── */
  '.idle-prestige-glow{animation:prestige-glow 1.5s infinite alternate;}',

  /* ── NPC-style text bubble (matches farmer speech bubbles) ───────────────── */
  '.idle-bubble{background:#fffde7;border:3px solid #000;border-radius:12px;padding:10px 14px;color:#1a0f0a;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;position:relative;margin:8px 0;box-shadow:2px 2px 0 #000;}',
  '.idle-bubble::after{content:"";position:absolute;bottom:-14px;left:24px;border:7px solid transparent;border-top-color:#000;}',
  '.idle-bubble::before{content:"";position:absolute;bottom:-10px;left:25px;border:6px solid transparent;border-top-color:#fffde7;z-index:1;}',

  /* ── Animations ──────────────────────────────────────────────────────────── */
  '@keyframes fountain-ripple{0%{transform:scale(1);}50%{transform:scale(1.3);}100%{transform:scale(1);}}',
  '@keyframes gold-sparkle{0%,100%{opacity:1;}50%{opacity:0.5;color:#fff;}}',
  '@keyframes prestige-glow{from{box-shadow:0 0 6px #FFD700;}to{box-shadow:0 0 20px #FFD700;}}',
  '@keyframes progress-fill{from{width:0%;}to{width:100%;}}',
  '@keyframes wheel-bulb-pulse{0%,100%{opacity:0.9;filter:brightness(1);}50%{opacity:1;filter:brightness(1.5);}}',
  '@keyframes wheel-glow-ring{0%,100%{box-shadow:0 0 12px 4px rgba(255,215,0,0.3);}50%{box-shadow:0 0 24px 8px rgba(255,215,0,0.7);}}',

  /* ── Spin Wheel ──────────────────────────────────────────────────────────── */
  '.wheel-panel{text-align:center;color:#fff;font-family:"Bangers",cursive;}',
  '.wheel-panel h3{color:#FFD700;font-size:1.4em;margin:0 0 8px;text-shadow:2px 2px 0 #000;letter-spacing:2px;}',
  '.wheel-visual{position:relative;display:inline-block;margin:8px 0;}',
  '.wheel-3d-container{position:relative;display:inline-block;border-radius:50%;padding:6px;background:radial-gradient(ellipse at 30% 25%,rgba(255,255,255,0.12) 0%,rgba(0,0,0,0.6) 100%);box-shadow:0 8px 32px rgba(0,0,0,0.8),0 0 0 3px #555,inset 0 2px 4px rgba(255,255,255,0.1);animation:wheel-glow-ring 2s ease-in-out infinite;}',
  '.wheel-glow-ring{position:absolute;top:-4px;left:-4px;right:-4px;bottom:-4px;border-radius:50%;border:3px solid rgba(255,215,0,0.4);pointer-events:none;}',
  '.wheel-pointer{font-size:28px;color:#FFD700;text-shadow:0 0 12px rgba(255,215,0,0.9),2px 2px 0 #000;line-height:1;margin-top:2px;}',
  '.wheel-free-badge{background:linear-gradient(135deg,#2ecc71,#27ae60);color:#fff;border:2px solid #000;border-radius:8px;padding:4px 12px;font-size:0.9em;display:inline-block;margin-bottom:6px;box-shadow:2px 2px 0 #000;}',
  '.wheel-btns{display:flex;gap:8px;justify-content:center;margin:8px 0;flex-wrap:wrap;}',
  '.wheel-spin-free{background:linear-gradient(to bottom,#2ecc71,#27ae60);color:#fff;border:3px solid #000;border-radius:6px;padding:8px 18px;cursor:pointer;font-family:"Bangers",cursive;font-size:1em;letter-spacing:1px;box-shadow:3px 3px 0 #000;transition:transform 0.1s;}',
  '.wheel-spin-paid{background:linear-gradient(to bottom,#FFD700,#FFA500);color:#000;border:3px solid #000;border-radius:6px;padding:8px 18px;cursor:pointer;font-family:"Bangers",cursive;font-size:1em;letter-spacing:1px;box-shadow:3px 3px 0 #000;transition:transform 0.1s;}',
  '.wheel-spin-free:hover:not(:disabled),.wheel-spin-paid:hover:not(:disabled){transform:translateY(-2px);}',
  '.wheel-spin-free:disabled,.wheel-spin-paid:disabled{opacity:0.4;cursor:not-allowed;}',
  '.wheel-result{color:#FFD700;font-size:1.1em;min-height:1.4em;margin:4px 0;text-shadow:1px 1px 0 #000;}',
  '.wheel-essence{color:#5DADE2;font-size:0.9em;margin:4px 0;font-family:Arial,sans-serif;}',
  '.wheel-history h4{color:#FFD700;margin:8px 0 4px;font-size:1em;letter-spacing:1px;}',
  '.wheel-history ul{list-style:none;padding:0;margin:0;max-height:100px;overflow-y:auto;font-family:Arial,sans-serif;font-size:0.8em;}',
  '.wheel-history li{padding:2px 0;border-bottom:1px solid rgba(255,215,0,0.1);color:#ddd;}',
  '.wh-ts{color:#888;margin-right:4px;}',
  '.wheel-total{color:#666;font-size:0.8em;margin-top:4px;font-family:Arial,sans-serif;}'
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
