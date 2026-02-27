// idle-account-css.js — CSS for account panel and new systems
window.GameAccountCSS = (function () {
  var CSS = [
    /* Account panel tabs */
    '.acc-panel{font-family:inherit;max-width:640px;margin:0 auto}.acc-tabs{display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap}',
    '.acc-tab-btn{padding:6px 12px;border:1px solid #555;background:#2a2a2a;color:#ccc;border-radius:4px;cursor:pointer;font-size:13px}',
    '.acc-tab-btn:hover{background:#3a3a3a}.acc-tab-active{background:#4a90d9 !important;color:#fff !important;border-color:#4a90d9 !important}',
    '.acc-tab-body{background:#1e1e1e;border:1px solid #444;border-radius:6px;padding:12px;min-height:120px}',
    '.acc-profile-card{text-align:center;padding:16px}.acc-icon{font-size:48px;line-height:1;margin-bottom:6px}',
    '.acc-name{font-size:20px;font-weight:bold;color:#fff}.acc-title{font-size:13px;color:#f0c040;margin-top:2px}',
    '.acc-border{font-size:12px;color:#aaa;margin-top:2px}',
    '.acc-edit-row{display:flex;gap:6px;margin-top:12px;justify-content:center;flex-wrap:wrap}',
    '.acc-name-input,.acc-icon-input{padding:4px 8px;background:#2a2a2a;border:1px solid #555;color:#fff;border-radius:4px}',
    '.acc-icon-input{width:50px;text-align:center}.acc-save-btn{padding:4px 14px;background:#4a90d9;color:#fff;border:none;border-radius:4px;cursor:pointer}',
    '.acc-save-btn:hover{background:#357abd}
    '.acc-xp-bar-wrap{position:relative;background:#333;border-radius:20px;height:22px;margin:10px 0;overflow:hidden}',
    '.acc-xp-bar{height:100%;background:linear-gradient(90deg,#f0c040,#e07820,#f0c040);background-size:200% 100%;animation:xpShimmer 2s linear infinite;border-radius:20px;transition:width .4s}',
    '@keyframes xpShimmer{0%{background-position:0% 50%}100%{background-position:200% 50%}}',
    '.acc-xp-label{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:11px;color:#fff;white-space:nowrap;text-shadow:0 1px 2px #000}',
    /* Stats table */
    '.acc-stats-table{width:100%;border-collapse:collapse;font-size:13px}',
    '.acc-stats-table th{background:#2a2a2a;color:#f0c040;padding:6px 8px;text-align:left;border-bottom:1px solid #444}',
    '.acc-stats-table td{padding:5px 8px;border-bottom:1px solid #333;color:#ddd}',
    '.acc-stats-table tr:nth-child(even) td{background:#242424}',
    '.acc-log{max-height:200px;overflow-y:auto;background:#111;border-radius:4px;padding:8px;font-family:monospace;font-size:12px}',
    '.acc-log-entry{padding:2px 0;border-bottom:1px solid #222;color:#bbb}',
    '.acc-log-ts{color:#888}.acc-log-xp{color:#f0c040;font-weight:bold}',
    '.acc-milestones{display:flex;flex-direction:column;gap:6px}',
    '.acc-milestone{padding:7px 10px;border-radius:4px;font-size:13px}',
    '.milestone-unlocked{background:#1a3a1a;border:1px solid #2e7d32;color:#a5d6a7}',
    '.milestone-locked{background:#2a2a2a;border:1px solid #444;color:#666}',
    '.milestone-border{background:#333;padding:1px 6px;border-radius:10px;font-size:11px;margin-left:6px}',
    /* Gem inventory */
    '.gems-panel h3{margin:0 0 8px;font-size:16px}',
    '.gem-dust-count{font-size:13px;color:#aaa;margin-left:10px;font-weight:normal}',
    '.gem-grid{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}',
    '.gem-card{padding:8px 10px;border-radius:6px;border:2px solid #555;background:#1e1e1e;min-width:110px;text-align:center;font-size:12px}',
    '.gem-card.gem-fire{border-color:#e74c3c}.gem-card.gem-ice{border-color:#3498db}',
    '.gem-card.gem-lightning{border-color:#f1c40f}.gem-card.gem-void{border-color:#9b59b6}.gem-card.gem-nature{border-color:#2ecc71}',
    '.gem-card.tier-4{box-shadow:0 0 6px rgba(255,215,0,.4)}.gem-card.tier-5{box-shadow:0 0 10px rgba(255,215,0,.7)}',
    '.gem-icon{font-size:22px;display:block;margin-bottom:3px}.gem-name{font-weight:bold;color:#ddd;font-size:11px}',
    '.gem-stat{color:#aaa;font-size:11px;margin:2px 0}.gem-melt-btn{margin-top:4px;padding:2px 8px;background:#5a2a2a;border:1px solid #933;color:#faa;border-radius:3px;cursor:pointer;font-size:11px}',
    '.gem-melt-btn:hover{background:#7a2a2a}.gem-in-slot{color:#888;font-size:11px}.gem-socketed{opacity:.7}.gems-empty{color:#666;font-size:13px}',
    '.gem-fusion{background:#1a1a2e;border:1px solid #444;border-radius:6px;padding:10px;margin-top:6px}',
    '.gem-fusion h4{margin:0 0 4px;font-size:14px;color:#c0a0ff}',
    '.gem-fusion-hint{color:#888;font-size:12px;margin:0 0 6px}',
    /* Shop */
    '.shop-panel{max-width:640px}',
    '.shop-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}',
    '.shop-header h3{margin:0;font-size:16px}',
    '.shop-gold{font-size:14px;color:#f0c040;font-weight:bold}',
    '.shop-grid{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px}',
    '.shop-card{padding:10px;border:2px solid #444;border-radius:8px;background:#1e1e1e;min-width:140px;max-width:180px;text-align:center;position:relative;flex:1}',
    '.shop-featured{border-color:#f0c040;background:#1e1a0a}',
    '.shop-sold{opacity:.45;pointer-events:none}',
    '.shop-featured-badge{position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:#f0c040;color:#111;font-size:10px;padding:1px 8px;border-radius:10px;white-space:nowrap}',
    '.shop-item-icon{font-size:28px;display:block;margin:8px 0 4px}.shop-item-name{font-weight:bold;color:#ddd;font-size:13px}',
    '.shop-item-desc{color:#999;font-size:11px;margin:4px 0}.shop-item-price{color:#f0c040;font-size:13px;margin:4px 0}',
    '.shop-buy-btn{margin-top:6px;padding:4px 14px;background:#2e7d32;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px}',
    '.shop-buy-btn:hover:not([disabled]){background:#388e3c}.shop-buy-btn[disabled]{background:#444;cursor:not-allowed;color:#777}.shop-footer{color:#666;font-size:12px}',
    '.wheel-panel{max-width:400px;margin:0 auto;text-align:center}.wheel-panel h3{margin:0 0 8px;font-size:16px}',
    '.wheel-free-badge{background:#2e7d32;color:#a5d6a7;padding:3px 12px;border-radius:12px;font-size:12px;margin-bottom:8px;display:inline-block}',
    '.wheel-visual{position:relative;display:inline-block}.wheel-pointer{position:absolute;top:-8px;left:50%;transform:translateX(-50%);font-size:20px;color:#f0c040;line-height:1}',
    '.wheel-btns{display:flex;gap:8px;justify-content:center;margin:10px 0}',
    '.wheel-spin-free{padding:7px 18px;background:#2e7d32;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold}',
    '.wheel-spin-free:hover{background:#388e3c}.wheel-spin-paid{padding:7px 18px;background:#4a90d9;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold}',
    '.wheel-spin-paid:hover:not([disabled]){background:#357abd}.wheel-spin-paid[disabled]{background:#444;color:#777;cursor:not-allowed}',
    '.wheel-essence{font-size:13px;color:#c0a0ff;margin-bottom:8px}.wheel-result{background:#1a3a1a;color:#a5d6a7;border-radius:6px;padding:8px 12px;font-size:14px;font-weight:bold;margin:6px 0;border:1px solid #2e7d32}',
    '.wheel-history{text-align:left;margin-top:10px}.wheel-history h4{margin:0 0 4px;font-size:13px;color:#aaa}',
    '.wheel-history ul{list-style:none;padding:6px;margin:0;font-size:12px;max-height:160px;overflow-y:auto;background:#111;border-radius:4px}',
    '.wheel-history li{padding:2px 0;border-bottom:1px solid #222;color:#bbb}.wh-ts{color:#777}.wheel-total{color:#666;font-size:11px;margin-top:6px}',
    '.stats-panel h3{margin:0 0 10px;font-size:16px}.stats-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}',
    '.stat-card{display:flex;align-items:center;gap:8px;background:#1e1e1e;border:1px solid #333;border-radius:6px;padding:8px 10px}',
    '.stat-icon{font-size:20px;min-width:24px;text-align:center}.stat-name{font-size:11px;color:#999}.stat-value{font-size:15px;font-weight:bold;color:#fff}'
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
