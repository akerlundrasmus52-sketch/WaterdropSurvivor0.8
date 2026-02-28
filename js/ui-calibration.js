// ============================================================
// ui-calibration.js  —  HUD UI Calibration / Customisation Mode
// ============================================================
// Lets the player drag-reposition and corner-resize every gameplay
// HUD element, then save or reset the layout.
//
// Usage (called from main.js):
//   window.UICalibration.enter()   — activates calibration mode
//   window.UICalibration.exit()    — closes calibration mode
//   window.UICalibration.applyLayout() — re-applies saved layout on startup
// ============================================================

(function () {
  'use strict';

  const STORAGE_KEY = 'wd_hud_layout_v1';
  const MIN_SCALE   = 0.4;
  const MAX_SCALE   = 2.5;

  // HUD elements that can be repositioned / resized.
  // Each entry specifies:
  //   selector   – CSS selector (first match used)
  //   label      – friendly name shown in calibration overlay
  //   defaultPos – {left, top, right, bottom} using the same side the element
  //                normally anchors to (px strings, null = not set)
  //   defaultScale – initial transform scale (1 = unchanged)
  const HUD_DEFS = [
    {
      selector: '#rage-hud',
      label: '⚡ Rage Meter',
      defaultPos: { left: '10px', bottom: '80px', right: null, top: null },
      defaultScale: 1,
    },
    {
      selector: '#special-attacks-hud',
      label: '🔥 Special Attacks',
      defaultPos: { left: '10px', bottom: '10px', right: null, top: null },
      defaultScale: 1,
    },
    {
      selector: '#minimap-container',
      label: '🗺️ Minimap',
      defaultPos: { right: '8px', bottom: '10px', left: null, top: null },
      defaultScale: 1,
    },
    {
      selector: '#melee-takedown-btn',
      label: '🔪 Melee Button',
      defaultPos: { right: '155px', bottom: '10px', left: null, top: null },
      defaultScale: 1,
    },
    {
      selector: '.hud-top',
      label: '❤️ Stat Bars',
      defaultPos: { left: '0px', top: '0px', right: null, bottom: null },
      defaultScale: 1,
    },
  ];

  let _active = false;
  let _overlay = null;
  let _handles = []; // { el, def, wrapper, resizeHandle } per active HUD element
  let _onExit = null; // optional callback when calibration is closed

  // ──────────────────────────────────────────────────────────
  // Public: enter calibration mode
  // ──────────────────────────────────────────────────────────
  function enter(onExitCb) {
    if (_active) return;
    _active = true;
    _onExit = typeof onExitCb === 'function' ? onExitCb : null;

    _buildOverlay();
    _attachHandles();
  }

  // ──────────────────────────────────────────────────────────
  // Public: exit calibration mode
  // ──────────────────────────────────────────────────────────
  function exit() {
    if (!_active) return;
    _active = false;

    _detachHandles();
    _removeOverlay();

    if (_onExit) { _onExit(); _onExit = null; }
  }

  // ──────────────────────────────────────────────────────────
  // Public: apply saved layout (called at game startup)
  // ──────────────────────────────────────────────────────────
  function applyLayout() {
    const saved = _loadLayout();
    if (!saved) return;

    for (const def of HUD_DEFS) {
      const entry = saved[def.selector];
      if (!entry) continue;
      const el = document.querySelector(def.selector);
      if (!el) continue;
      _applyEntryToElement(el, entry);
    }
  }

  // ──────────────────────────────────────────────────────────
  // Overlay (dim background + Save / Reset / Close buttons)
  // ──────────────────────────────────────────────────────────
  function _buildOverlay() {
    _overlay = document.createElement('div');
    _overlay.id = 'ui-calibration-overlay';
    _overlay.className = 'ui-cal-overlay';

    const title = document.createElement('div');
    title.className = 'ui-cal-title';
    title.textContent = '🎛️ UI CALIBRATION  —  Drag elements to reposition · Drag ◤ to resize';

    const btnRow = document.createElement('div');
    btnRow.className = 'ui-cal-btn-row';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'ui-cal-btn ui-cal-save-btn';
    saveBtn.textContent = '💾 Save Layout';
    saveBtn.addEventListener('click', _saveAndExit);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'ui-cal-btn ui-cal-reset-btn';
    resetBtn.textContent = '↩️ Reset to Default';
    resetBtn.addEventListener('click', _resetAndExit);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ui-cal-btn ui-cal-close-btn';
    closeBtn.textContent = '✕ Cancel';
    closeBtn.addEventListener('click', exit);

    btnRow.appendChild(saveBtn);
    btnRow.appendChild(resetBtn);
    btnRow.appendChild(closeBtn);

    _overlay.appendChild(title);
    _overlay.appendChild(btnRow);
    document.body.appendChild(_overlay);
  }

  function _removeOverlay() {
    if (_overlay && _overlay.parentNode) {
      _overlay.parentNode.removeChild(_overlay);
    }
    _overlay = null;
  }

  // ──────────────────────────────────────────────────────────
  // Attach drag + resize handles to each HUD element
  // ──────────────────────────────────────────────────────────
  function _attachHandles() {
    _handles = [];
    const saved = _loadLayout();

    for (const def of HUD_DEFS) {
      const el = document.querySelector(def.selector);
      if (!el) continue;

      // Ensure element is fixed-position so it can be freely moved
      _makeFixed(el, def);

      // Apply any previously-saved position/scale
      if (saved && saved[def.selector]) {
        _applyEntryToElement(el, saved[def.selector]);
      }

      // ── Label badge ──────────────────────────────────────
      const badge = document.createElement('div');
      badge.className = 'ui-cal-label-badge';
      badge.textContent = def.label;
      el.appendChild(badge);

      // ── Resize handle (upper-left corner ◤) ─────────────
      const rh = document.createElement('div');
      rh.className = 'ui-cal-resize-handle';
      rh.title = 'Drag to resize';
      rh.textContent = '◤';
      el.appendChild(rh);

      // Add edit-mode class for border highlight
      el.classList.add('ui-cal-active-element');

      const handle = { el, def, badge, rh };
      _handles.push(handle);

      _bindDrag(el, handle);
      _bindResize(rh, el, handle);
    }
  }

  function _detachHandles() {
    for (const h of _handles) {
      h.el.classList.remove('ui-cal-active-element');
      if (h.badge && h.badge.parentNode) h.badge.parentNode.removeChild(h.badge);
      if (h.rh && h.rh.parentNode) h.rh.parentNode.removeChild(h.rh);
    }
    _handles = [];
  }

  // ──────────────────────────────────────────────────────────
  // Convert an element to position: fixed if it isn't already
  // ──────────────────────────────────────────────────────────
  function _makeFixed(el, def) {
    const cs = window.getComputedStyle(el);
    if (cs.position !== 'fixed') {
      const rect = el.getBoundingClientRect();
      el.style.position = 'fixed';
      el.style.left = rect.left + 'px';
      el.style.top  = rect.top  + 'px';
      el.style.right  = '';
      el.style.bottom = '';
      el.style.margin = '0';
    }
  }

  // ──────────────────────────────────────────────────────────
  // Drag to reposition
  // ──────────────────────────────────────────────────────────
  function _bindDrag(el, handle) {
    let startX, startY, startLeft, startTop;
    let dragging = false;

    function onDown(e) {
      // Ignore if clicking the resize handle
      if (e.target === handle.rh) return;
      e.stopPropagation();
      e.preventDefault();
      dragging = true;
      const rect = el.getBoundingClientRect();
      const pt = _getPointer(e);
      startX    = pt.x;
      startY    = pt.y;
      startLeft = rect.left;
      startTop  = rect.top;
      el.style.cursor = 'grabbing';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup',   onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend',  onUp);
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      const pt = _getPointer(e);
      const dx = pt.x - startX;
      const dy = pt.y - startY;
      el.style.left   = (startLeft + dx) + 'px';
      el.style.top    = (startTop  + dy) + 'px';
      el.style.right  = '';
      el.style.bottom = '';
    }

    function onUp() {
      dragging = false;
      el.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onUp);
    }

    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, { passive: false });
  }

  // ──────────────────────────────────────────────────────────
  // Resize from upper-left corner handle
  // ──────────────────────────────────────────────────────────
  function _bindResize(rh, el) {
    let startX, startY, startScale, startW;
    let resizing = false;

    function onDown(e) {
      e.stopPropagation();
      e.preventDefault();
      resizing = true;
      const pt = _getPointer(e);
      startX = pt.x;
      startY = pt.y;
      // Read current scale from transform
      startScale = _getScale(el);
      startW     = el.getBoundingClientRect().width / startScale;

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup',   onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend',  onUp);
    }

    function onMove(e) {
      if (!resizing) return;
      e.preventDefault();
      const pt = _getPointer(e);
      // Dragging left/up increases size (negative delta = bigger)
      const dx = startX - pt.x;
      const dy = startY - pt.y;
      const delta = (dx + dy) / 2;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, startScale + delta / startW));
      el.style.transform = 'scale(' + newScale + ')';
      el.style.transformOrigin = 'top left';
    }

    function onUp() {
      resizing = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onUp);
    }

    rh.addEventListener('mousedown', onDown);
    rh.addEventListener('touchstart', onDown, { passive: false });
  }

  // ──────────────────────────────────────────────────────────
  // Save / Reset helpers
  // ──────────────────────────────────────────────────────────
  function _saveAndExit() {
    const layout = {};
    for (const h of _handles) {
      const el = h.el;
      layout[h.def.selector] = {
        left:      el.style.left   || null,
        top:       el.style.top    || null,
        right:     el.style.right  || null,
        bottom:    el.style.bottom || null,
        transform: el.style.transform || '',
        transformOrigin: el.style.transformOrigin || '',
      };
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch (e) {
      console.warn('[UICalibration] Could not save layout:', e);
    }
    exit();
  }

  function _resetAndExit() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    // Restore defaults immediately
    for (const h of _handles) {
      const el = h.el;
      const d = h.def.defaultPos;
      el.style.left      = d.left   || '';
      el.style.top       = d.top    || '';
      el.style.right     = d.right  || '';
      el.style.bottom    = d.bottom || '';
      el.style.transform = '';
      el.style.transformOrigin = '';
    }
    exit();
  }

  // ──────────────────────────────────────────────────────────
  // Persistence helpers
  // ──────────────────────────────────────────────────────────
  function _loadLayout() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function _applyEntryToElement(el, entry) {
    // Apply horizontal position — clear the opposing anchor to avoid conflicts
    if (entry.left !== undefined && entry.left !== null) {
      el.style.left  = entry.left;
      el.style.right = '';
    } else if (entry.right !== undefined && entry.right !== null) {
      el.style.right = entry.right;
      el.style.left  = '';
    }
    // Apply vertical position — clear the opposing anchor to avoid conflicts
    if (entry.top !== undefined && entry.top !== null) {
      el.style.top    = entry.top;
      el.style.bottom = '';
    } else if (entry.bottom !== undefined && entry.bottom !== null) {
      el.style.bottom = entry.bottom;
      el.style.top    = '';
    }
    if (entry.transform)       el.style.transform       = entry.transform;
    if (entry.transformOrigin) el.style.transformOrigin = entry.transformOrigin;
    // Ensure position is fixed so saved coords work regardless of which
    // anchoring side (left/top/right/bottom) was saved.
    if (entry.left || entry.top || entry.right || entry.bottom) {
      el.style.position = 'fixed';
    }
  }

  // ──────────────────────────────────────────────────────────
  // Utility
  // ──────────────────────────────────────────────────────────
  function _getPointer(e) {
    if (e.touches && e.touches.length) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches && e.changedTouches.length) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  function _getScale(el) {
    const t = el.style.transform;
    if (!t) return 1;
    const m = t.match(/scale\(([^)]+)\)/);
    return m ? parseFloat(m[1]) : 1;
  }

  // ──────────────────────────────────────────────────────────
  // Expose public API
  // ──────────────────────────────────────────────────────────
  window.UICalibration = {
    enter,
    exit,
    applyLayout,
    get isActive() { return _active; },
  };

})();
