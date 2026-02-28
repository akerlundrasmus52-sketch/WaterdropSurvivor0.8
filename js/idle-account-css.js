// idle-account-css.js — CSS for account panel and new systems
// Styled to match the game's 80s comic-magazine aesthetic
window.GameAccountCSS = (function () {
  var CSS = [
    /* Account panel tabs */
    '.acc-panel{font-family:Arial,sans-serif;max-width:640px;margin:0 auto}',
    '.acc-tabs{display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap}',
    '.acc-tab-btn{padding:6px 12px;border:2px solid rgba(255,215,0,0.4);background:rgba(255,215,0,0.06);color:#ccc;border-radius:4px;cursor:pointer;font-size:13px;font-family:Arial,sans-serif;}',
    '.acc-tab-btn:hover{background:rgba(255,215,0,0.15);}',
    '.acc-tab-active{background:linear-gradient(to bottom,#FFD700,#FFA500) !important;color:#000 !important;border-color:#000 !important;font-weight:bold;}',
    '.acc-tab-body{background:rgba(255,215,0,0.04);border:2px solid rgba(255,215,0,0.3);border-radius:6px;padding:12px;min-height:120px;}',
    '.acc-profile-card{text-align:center;padding:16px;}',
    '.acc-icon{font-size:48px;line-height:1;margin-bottom:6px;}',
    '.acc-name{font-size:20px;font-family:"Bangers",cursive;color:#FFD700;text-shadow:1px 1px 0 #000;}',
    '.acc-title{font-size:13px;color:#FFA500;margin-top:2px;}',
    '.acc-border{font-size:12px;color:#aaa;margin-top:2px;}',
    '.acc-edit-row{display:flex;gap:6px;margin-top:12px;justify-content:center;flex-wrap:wrap;}',
    '.acc-name-input,.acc-icon-input{padding:4px 8px;background:#0d1f3a;border:2px solid rgba(255,215,0,0.5);color:#fff;border-radius:4px;font-family:Arial,sans-serif;}',
    '.acc-icon-input{width:50px;text-align:center;}',
    '.acc-save-btn{padding:4px 14px;background:linear-gradient(to bottom,#FFD700,#FFA500);color:#000;border:2px solid #000;border-radius:4px;cursor:pointer;font-family:"Bangers",cursive;font-size:1em;letter-spacing:1px;}',
    '.acc-save-btn:hover{transform:translateY(-1px);}',
    '.acc-xp-bar-wrap{position:relative;background:rgba(0,0,0,0.5);border-radius:20px;height:22px;margin:10px 0;overflow:hidden;border:1px solid rgba(255,215,0,0.3);}',
    '.acc-xp-bar{height:100%;background:linear-gradient(90deg,#FFD700,#FFA500,#FFD700);background-size:200% 100%;animation:xpShimmer 2s linear infinite;border-radius:20px;transition:width .4s;}',
    '@keyframes xpShimmer{0%{background-position:0% 50%}100%{background-position:200% 50%}}',
    '.acc-xp-label{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:11px;color:#fff;white-space:nowrap;text-shadow:0 1px 2px #000;}',
    /* Stats table */
    '.acc-stats-table{width:100%;border-collapse:collapse;font-size:13px;}',
    '.acc-stats-table th{background:rgba(255,215,0,0.15);color:#FFD700;padding:6px 8px;text-align:left;border-bottom:2px solid rgba(255,215,0,0.3);font-family:"Bangers",cursive;letter-spacing:1px;}',
    '.acc-stats-table td{padding:5px 8px;border-bottom:1px solid rgba(255,215,0,0.1);color:#ddd;}',
    '.acc-stats-table tr:nth-child(even) td{background:rgba(255,215,0,0.04);}',
    '.acc-log{max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.4);border-radius:4px;padding:8px;font-family:monospace;font-size:12px;border:1px solid rgba(255,215,0,0.2);}',
    '.acc-log-entry{padding:2px 0;border-bottom:1px solid rgba(255,215,0,0.1);color:#bbb;}',
    '.acc-log-ts{color:#888;}.acc-log-xp{color:#FFD700;font-weight:bold;}',
    '.acc-milestones{display:flex;flex-direction:column;gap:6px;}',
    '.acc-milestone{padding:7px 10px;border-radius:4px;font-size:13px;}',
    '.milestone-unlocked{background:rgba(255,215,0,0.1);border:2px solid rgba(255,215,0,0.4);color:#FFD700;}',
    '.milestone-locked{background:rgba(0,0,0,0.3);border:1px solid rgba(255,215,0,0.1);color:#666;}',
    '.milestone-border{background:rgba(255,215,0,0.1);padding:1px 6px;border-radius:10px;font-size:11px;margin-left:6px;}',
    /* Gem inventory */
    '.gems-panel h3{margin:0 0 8px;font-size:16px;font-family:"Bangers",cursive;color:#FFD700;}',
    '.gem-dust-count{font-size:13px;color:#aaa;margin-left:10px;font-weight:normal;}',
    '.gem-grid{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;}',
    '.gem-card{padding:8px 10px;border-radius:6px;border:2px solid rgba(255,215,0,0.3);background:rgba(255,215,0,0.06);min-width:110px;text-align:center;font-size:12px;}',
    '.gem-card.gem-fire{border-color:#e74c3c;}.gem-card.gem-ice{border-color:#3498db;}',
    '.gem-card.gem-lightning{border-color:#f1c40f;}.gem-card.gem-void{border-color:#9b59b6;}.gem-card.gem-nature{border-color:#2ecc71;}',
    '.gem-card.tier-4{box-shadow:0 0 6px rgba(255,215,0,.4);}.gem-card.tier-5{box-shadow:0 0 10px rgba(255,215,0,.7);}',
    '.gem-icon{font-size:22px;display:block;margin-bottom:3px;}.gem-name{font-weight:bold;color:#FFD700;font-size:11px;}',
    '.gem-stat{color:#aaa;font-size:11px;margin:2px 0;}.gem-melt-btn{margin-top:4px;padding:2px 8px;background:#5a2a2a;border:1px solid #933;color:#faa;border-radius:3px;cursor:pointer;font-size:11px;}',
    '.gem-melt-btn:hover{background:#7a2a2a;}.gem-in-slot{color:#888;font-size:11px;}.gem-socketed{opacity:.7;}.gems-empty{color:#666;font-size:13px;}',
    '.gem-fusion{background:rgba(255,215,0,0.06);border:2px solid rgba(255,215,0,0.2);border-radius:6px;padding:10px;margin-top:6px;}',
    '.gem-fusion h4{margin:0 0 4px;font-size:14px;color:#FFD700;font-family:"Bangers",cursive;}',
    '.gem-fusion-hint{color:#888;font-size:12px;margin:0 0 6px;}',
    /* Shop */
    '.shop-panel{max-width:640px;}',
    '.shop-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}',
    '.shop-header h3{margin:0;font-size:16px;font-family:"Bangers",cursive;color:#FFD700;}',
    '.shop-gold{font-size:14px;color:#FFD700;font-weight:bold;}',
    '.shop-grid{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;}',
    '.shop-card{padding:10px;border:2px solid rgba(255,215,0,0.3);border-radius:8px;background:rgba(255,215,0,0.05);min-width:140px;max-width:180px;text-align:center;position:relative;flex:1;}',
    '.shop-featured{border-color:#FFD700;background:rgba(255,215,0,0.1);}',
    '.shop-sold{opacity:.45;pointer-events:none;}',
    '.shop-featured-badge{position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:#FFD700;color:#000;font-size:10px;padding:1px 8px;border-radius:10px;white-space:nowrap;font-family:"Bangers",cursive;}',
    '.shop-item-icon{font-size:28px;display:block;margin:8px 0 4px;}.shop-item-name{font-weight:bold;color:#FFD700;font-size:13px;font-family:"Bangers",cursive;}',
    '.shop-item-desc{color:#aaa;font-size:11px;margin:4px 0;}.shop-item-price{color:#FFD700;font-size:13px;margin:4px 0;}',
    '.shop-buy-btn{margin-top:6px;padding:4px 14px;background:linear-gradient(to bottom,#FFD700,#FFA500);color:#000;border:2px solid #000;border-radius:4px;cursor:pointer;font-size:12px;font-family:"Bangers",cursive;}',
    '.shop-buy-btn:hover:not([disabled]){transform:translateY(-1px);}.shop-buy-btn[disabled]{background:#444;cursor:not-allowed;color:#777;border-color:#555;}.shop-footer{color:#666;font-size:12px;}',
    /* Wheel */
    '.wheel-panel{max-width:400px;margin:0 auto;text-align:center;}.wheel-panel h3{margin:0 0 8px;font-size:18px;font-family:"Bangers",cursive;color:#FFD700;text-shadow:1px 1px 0 #000;}',
    '.wheel-free-badge{background:linear-gradient(to bottom,#2ecc71,#27ae60);color:#fff;padding:3px 12px;border-radius:12px;font-size:12px;margin-bottom:8px;display:inline-block;border:1px solid #000;}',
    '.wheel-visual{position:relative;display:inline-block;}.wheel-pointer{position:absolute;top:-8px;left:50%;transform:translateX(-50%);font-size:20px;color:#FFD700;line-height:1;}',
    '.wheel-btns{display:flex;gap:8px;justify-content:center;margin:10px 0;}',
    '.wheel-spin-free{padding:7px 18px;background:linear-gradient(to bottom,#FFD700,#FFA500);color:#000;border:2px solid #000;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;font-family:"Bangers",cursive;}',
    '.wheel-spin-free:hover{transform:translateY(-1px);}.wheel-spin-paid{padding:7px 18px;background:linear-gradient(to bottom,#5DADE2,#3498db);color:#fff;border:2px solid #000;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;font-family:"Bangers",cursive;}',
    '.wheel-spin-paid:hover:not([disabled]){transform:translateY(-1px);}.wheel-spin-paid[disabled]{background:#444;color:#777;cursor:not-allowed;border-color:#555;}',
    '.wheel-essence{font-size:13px;color:#FFD700;margin-bottom:8px;}.wheel-result{background:rgba(255,215,0,0.1);color:#FFD700;border-radius:6px;padding:8px 12px;font-size:14px;font-weight:bold;margin:6px 0;border:2px solid rgba(255,215,0,0.4);}',
    '.wheel-history{text-align:left;margin-top:10px;}.wheel-history h4{margin:0 0 4px;font-size:13px;color:#FFD700;font-family:"Bangers",cursive;}',
    '.wheel-history ul{list-style:none;padding:6px;margin:0;font-size:12px;max-height:160px;overflow-y:auto;background:rgba(0,0,0,0.4);border-radius:4px;border:1px solid rgba(255,215,0,0.2);}',
    '.wheel-history li{padding:2px 0;border-bottom:1px solid rgba(255,215,0,0.1);color:#bbb;}.wh-ts{color:#888;}.wheel-total{color:#666;font-size:11px;margin-top:6px;}',
    '@keyframes wheelSpin{0%{transform:rotate(0deg)}100%{transform:rotate(1440deg)}}',
    '.wheel-svg-spinning{animation:wheelSpin 1.5s cubic-bezier(0.17,0.67,0.12,1.0) forwards;transform-origin:center;transform-box:fill-box;}',
    /* Stats panel */
    /* Attribute point system */
    '.acc-attr-pts-header{background:linear-gradient(to right,rgba(255,215,0,0.15),rgba(255,165,0,0.08));border:2px solid rgba(255,215,0,0.5);border-radius:6px;padding:8px 12px;font-size:14px;font-weight:bold;color:#FFD700;font-family:"Bangers",cursive;letter-spacing:1px;margin-bottom:8px;text-align:center;}',
    '.acc-section-title{color:#5DADE2;font-size:12px;font-family:"Bangers",cursive;letter-spacing:1px;margin:4px 0 6px;padding:2px 0;border-bottom:1px solid rgba(93,173,226,0.3);}',
    '.acc-attrs-list{display:flex;flex-direction:column;gap:3px;margin-bottom:4px;}',
    '.acc-attr-row{display:flex;align-items:center;gap:6px;padding:4px 6px;background:rgba(255,215,0,0.04);border-radius:4px;border:1px solid rgba(255,215,0,0.1);}',
    '.acc-attr-icon{font-size:16px;min-width:22px;text-align:center;}',
    '.acc-attr-label{flex:1;font-size:12px;color:#ddd;font-weight:bold;}',
    '.acc-attr-level{font-size:12px;color:#FFD700;min-width:60px;text-align:right;}',
    '.acc-attr-plus{padding:2px 8px;background:linear-gradient(to bottom,#3498DB,#2C3E50);color:#fff;border:1px solid #5DADE2;border-radius:4px;cursor:pointer;font-size:12px;font-family:monospace;font-weight:bold;}',
    '.acc-attr-plus:hover{background:linear-gradient(to bottom,#5DADE2,#3498DB);}',
    '.acc-attr-plus-disabled{background:#444 !important;border-color:#666 !important;cursor:not-allowed !important;opacity:0.5;}',
    '.acc-attr-bonus{font-size:11px;color:#2ecc71;min-width:100px;text-align:right;}',
    /* Stats scroll */
    '.acc-stats-scroll{max-height:280px;overflow-y:auto;border:1px solid rgba(255,215,0,0.2);border-radius:4px;background:rgba(0,0,0,0.3);}',
    '.acc-stat-cat-header{background:rgba(93,173,226,0.12);border-bottom:1px solid rgba(93,173,226,0.2);padding:4px 8px;font-size:11px;font-family:"Bangers",cursive;letter-spacing:1px;color:#5DADE2;}',
    '.acc-stat-row{display:flex;align-items:center;padding:3px 8px;border-bottom:1px solid rgba(255,215,0,0.06);font-size:12px;}',
    '.acc-stat-row:nth-child(even){background:rgba(255,215,0,0.02);}',
    '.acc-stat-name{flex:1;color:#bbb;}',
    '.acc-stat-vals{min-width:120px;text-align:right;color:#ddd;}',
    '.acc-stat-vals b{color:#FFD700;}',
    '.acc-stat-diff{min-width:60px;text-align:right;font-size:11px;}',
    '.acc-stat-up{color:#2ecc71;}',
    '.acc-stat-down{color:#e74c3c;}'
  ].join('\n');

  function init() {
    if (document.getElementById('gameAccountCSS')) return;
    var style = document.createElement('style');
    style.id = 'gameAccountCSS';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  return { init: init };
})();
