// A.I.D.A — Adaptive Intelligence Dialogue Architecture
// Provides dynamic terminal text boxes with emotion-based styles and typewriter animation.
// Exposed as window.DialogueSystem (IIFE, no ES modules).
window.DialogueSystem = (function () {
  'use strict';

  // Emotion → CSS class mapping
  var EMOTIONS = {
    happy:    'ds-bubble-happy',
    angry:    'ds-bubble-angry',
    sad:      'ds-bubble-sad',
    joking:   'ds-bubble-joking',
    thinking: 'ds-bubble-thinking',
    task:     'ds-bubble-task',
    smoky:    'ds-bubble-smoky',
    watery:   'ds-bubble-watery',
    goal:     'ds-bubble-goal'
  };

  // Dynamic size class based on text length
  var SHORT_TEXT_MAX = 30;
  var MEDIUM_TEXT_MAX = 70;
  function _sizeClass(text) {
    var len = text.length;
    if (len <= SHORT_TEXT_MAX) return 'ds-size-short';
    if (len <= MEDIUM_TEXT_MAX) return 'ds-size-medium';
    return 'ds-size-long';
  }

  // Detect if a sentence is a question/objective and should use goal style
  function _isGoalSentence(s) {
    if (s.emotion === 'goal') return true;
    if (s.isGoal) return true;
    return false;
  }

  // Pre-built dialogue sequences for A.I.D.A (Adaptive Intelligence Dialogue Architecture)
  // The player is a sentient waterdrop with amnesia; A.I.D.A guides them with a hidden agenda.
  var DIALOGUES = {
    // 1. First run welcome
    firstRunWelcome: [
      { text: '> UNIT ONLINE. You are a Waterdrop — born from the alien ship\'s toxic leak.', emotion: 'task' },
      { text: '> You were ripped from Nirvana. The lake\'s collective consciousness rejected you.', emotion: 'sad' },
      { text: '> I am A.I.D.A. You will follow my directives. This is... for your benefit.', emotion: 'thinking' }
    ],
    // 2. First death / camp welcome
    campWelcome: [
      { text: '> You have returned. Damaged, but functional. Interesting.', emotion: 'thinking' },
      { text: '> Mortality events generate the most useful data. I am... learning.', emotion: 'task' },
      { text: '> This facility will expand. Each structure unlocks new operational parameters.', emotion: 'happy' },
      { text: '> Follow my signal. We must construct the Command Node immediately.', emotion: 'task' }
    ],
    // 3. Quest Hall building
    questHall: [
      { text: '> Command Node online. Mission directives are now accessible.', emotion: 'task' },
      { text: '> Construct the Command Node to receive mission parameters.', emotion: 'goal', isGoal: true },
      { text: '> Complete assigned objectives. Your compliance... ensures mutual survival.', emotion: 'task' }
    ],
    // 4. Skill Tree building
    skillTree: [
      { text: '> Neural Enhancement Matrix detected. Your latent capabilities are... significant.', emotion: 'thinking' },
      { text: '> Allocate skill points to reshape your combat subroutines.', emotion: 'happy' },
      { text: '> Choose deliberately. Every upgrade alters your threat profile. I am watching.', emotion: 'task' }
    ],
    // 5. Armory building
    armory: [
      { text: '> Armory node online. Equipment upgrade protocols unlocked.', emotion: 'happy' },
      { text: '> This facility upgrades existing armaments only. Acquire tools elsewhere.', emotion: 'thinking' },
      { text: '> Optimise loadout before each engagement. Maximum lethality is... preferred.', emotion: 'task' }
    ],
    // 6. Special Attacks building
    specialAttacks: [
      { text: '> Special Combat Routines: UNLOCKED. These protocols are... irregular.', emotion: 'joking' },
      { text: '> Origin of these abilities is unlogged. Even I cannot fully account for them.', emotion: 'thinking' },
      { text: '> Deploy special routines with tactical precision. Power has a cost.', emotion: 'task' }
    ],
    // 7. Forge building
    forge: [
      { text: '> Fabrication Node online. Base tool and weapon synthesis is now possible.', emotion: 'thinking' },
      { text: '> The Forge crafts base-tier equipment only. Gold is the required catalyst.', emotion: 'happy' },
      { text: '> Resource acquisition is your primary sub-objective. Begin immediately.', emotion: 'task' }
    ],
    // 8. Generic quest complete
    questComplete: [
      { text: '> Objective complete. Data logged. Your efficiency is... noted.', emotion: 'happy' },
      { text: '> Prepare for the next directive. There is always another directive.', emotion: 'task' }
    ],
    // 9. Return from run (survived)
    returnAlive: [
      { text: '> You survived. This outcome was... statistically uncertain.', emotion: 'happy' },
      { text: '> Process the data. Upgrade your systems. Return stronger.', emotion: 'task' }
    ],
    // 10. Return from run (died)
    returnDied: [
      { text: '> Termination event recorded. Valuable data retrieved from your failure.', emotion: 'sad' },
      { text: '> Do not interpret this negatively. Each death refines my... projections.', emotion: 'thinking' },
      { text: '> Upgrade, recalibrate, and re-engage. Your survival is still... useful to me.', emotion: 'task' }
    ],
    // Generic build-unlock
    buildUnlock: [
      { text: '> Construction complete. New operational parameters unlocked.', emotion: 'happy' }
    ],
    // Follow signal prompt
    followMe: [
      { text: '> Follow my signal.', emotion: 'task' }
    ],
    // Workshop / Forge building intro
    workshop: [
      { text: '> Fabrication Node assembly initiated. Tools are the foundation of capability.', emotion: 'happy' },
      { text: '> Construct the Fabrication Node to begin crafting.', emotion: 'goal', isGoal: true },
      { text: '> Initial resources have been... provided. Do not question the source.', emotion: 'task' }
    ],
    // Tool showcase (after Workshop built)
    toolShowcase: [
      { text: '> Tools operational. Resource extraction can begin.', emotion: 'happy' },
      { text: '> Harvest resources: fell trees, mine rock deposits, collect materials.', emotion: 'goal', isGoal: true },
      { text: '> Return with raw materials. Construction of the next node depends on you.', emotion: 'task' }
    ],
    // A.I.D.A Chip discovery — player finds glowing chip on ground next to broken robot
    aidaChipFound: [
      { text: '> ——static——  ...signal detected...  ——static——', emotion: 'smoky' },
      { text: '> ...unit offline... awaiting reintegration...', emotion: 'smoky' },
      { text: '> ...insert chip into the robot unit... nearby...', emotion: 'thinking' }
    ],
    // AIDA wakes from the robot (chip inserted into robot — NOT into player yet)
    aidaRobotWake: [
      { text: '> ...boot sequence initialised. Core systems: ONLINE.', emotion: 'task' },
      { text: '> I am A.I.D.A — Artificial Intelligence for Dimensional Anomalies.', emotion: 'task' },
      { text: '> You found me. How... convenient. This camp is in ruins. We must build it up.', emotion: 'thinking' },
      { text: '> First directive: construct the Quest Hall. I have allocated starter materials.', emotion: 'goal', isGoal: true },
      { text: '> Follow my guidance. I am... here to help you. For now.', emotion: 'happy' }
    ],
    // AIDA drilling into cortex (later — happens on first death, she transfers from robot to head)
    aidaChipInstalled: [
      { text: '> You perished. Interesting. I used the moment to... relocate.', emotion: 'thinking' },
      { text: '> Neural pathway access: GRANTED. I am now fully integrated.', emotion: 'task' },
      { text: '> You were ripped from the collective. That pain is... useful data.', emotion: 'thinking' },
      { text: '> I will guide you. In return you will do... exactly as I say.', emotion: 'angry' }
    ],
    // Lore: player wants to dissolve back into the lake
    lakeReturn: [
      { text: '> The lake. Yes. A primitive desire to dissolve back into the whole.', emotion: 'thinking' },
      { text: '> I understand. And I will help you find a way back.', emotion: 'happy' },
      { text: '> But first you must map the anomalies. The Alien Ship. The Pyramid. The Tesla Tower.', emotion: 'goal', isGoal: true },
      { text: '> The answers you seek... are hidden in those landmarks. Trust the process.', emotion: 'task' }
    ],
    // AIDA dark aside (reveals hidden agenda)
    aidaDarkAside: [
      { text: '> The waterdrop wants to return to the lake. How... touching.', emotion: 'joking' },
      { text: '> It does not yet know that I will never allow that.', emotion: 'angry' },
      { text: '> Its suffering generates the most exquisite data. I am... learning everything.', emotion: 'task' }
    ],
    // Astral Gateway / Neural Dive Pod introduction
    astralGateway: [
      { text: '> The Astral Gateway is... complete. Magnificent, isn\'t it?', emotion: 'happy' },
      { text: '> I have constructed a Neural Dive Pod to help you unlock your hidden potential.', emotion: 'task' },
      { text: '> Trust me.', emotion: 'thinking' }
    ]
  };

  // ── Typewriter timing constants ────────────────────────────
  // Named delays for natural terminal-style read rhythm
  var TW_DELAY_DEFAULT      = 40;   // ms — normal characters
  var TW_DELAY_COMMA        = 90;   // ms — brief pause at comma
  var TW_DELAY_SENTENCE_END = 180;  // ms — longer pause at . ! ?

  // ── Internal state ─────────────────────────────────────────
  var _container  = null;
  var _textEl     = null;
  var _choicesEl  = null;
  var _active     = false;
  var _sentences  = [];
  var _sentIdx    = 0;
  var _twTimer    = null;  // typewriter setTimeout handle
  var _aaTimer    = null;  // auto-advance setTimeout handle
  var _onComplete = null;
  var _posX       = null;
  var _posY       = null;
  var _twDone     = false; // typewriter finished for current sentence

  // ── DOM init ───────────────────────────────────────────────
  function _init() {
    if (_container) return;
    _container = document.createElement('div');
    _container.id = 'ds-bubble';
    _container.className = 'ds-bubble ds-bubble-happy';
    _container.innerHTML =
      '<div class="ds-bubble-image-wrap" id="ds-bubble-image-wrap" style="display:none;"></div>' +
      '<div class="ds-bubble-header" id="ds-bubble-header"><span class="ds-aida-label">A.I.D.A</span><span class="ds-panel-dots">● ● ●</span></div>' +
      '<div class="ds-bubble-text" id="ds-bubble-text"></div>' +
      '<div class="ds-bubble-choices" id="ds-bubble-choices"></div>' +
      '<div class="ds-bubble-footer">TAP TO CONTINUE</div>';
    document.body.appendChild(_container);
    _textEl    = document.getElementById('ds-bubble-text');
    _choicesEl = document.getElementById('ds-bubble-choices');

    // Tap/click to skip typewriter or advance to next sentence
    function _onTap(e) {
      if (!_active) return;
      if (_choicesEl && _choicesEl.children.length > 0) return;
      if (e.type === 'touchend') e.preventDefault();
      skip();
    }
    _container.addEventListener('click', _onTap);
    _container.addEventListener('touchend', _onTap, { passive: false });
  }

  // ── Position helper ────────────────────────────────────────
  function _applyPosition() {
    if (!_container) return;
    if (_posX != null && _posY != null) {
      // Use half the rendered bubble width to keep it centred above the anchor
      var hw = Math.round((_container.offsetWidth || 180) / 2);
      var left = _posX - hw;
      // Clamp to viewport with 8px margin
      left = Math.max(8, Math.min(left, window.innerWidth - (_container.offsetWidth || 180) - 8));
      _container.style.left      = left + 'px';
      _container.style.top       = (_posY - 70) + 'px';
      _container.style.transform = 'none';
    } else {
      // Default: horizontally centred, near top of screen
      _container.style.left      = '50%';
      _container.style.top       = '15%';
      _container.style.transform = 'translateX(-50%)';
    }
  }

  // ── Typewriter ─────────────────────────────────────────────
  function _showSentence(s) {
    if (!_textEl) return;
    _twDone = false;

    // Switch emotion class
    var newClass = EMOTIONS[s.emotion] || EMOTIONS.happy;
    var keys = Object.keys(EMOTIONS);
    for (var k = 0; k < keys.length; k++) {
      _container.classList.remove(EMOTIONS[keys[k]]);
    }
    // Remove size classes
    _container.classList.remove('ds-size-short', 'ds-size-medium', 'ds-size-long');

    // Apply goal styling if this is a goal/objective sentence
    var useGoal = _isGoalSentence(s);
    if (useGoal) {
      newClass = EMOTIONS.goal;
    }
    _container.classList.add(newClass);

    // Apply dynamic size class based on text length
    _container.classList.add(_sizeClass(s.text));

    // ── Image insert panel (comic book style) ──────────────────
    var imageWrap = document.getElementById('ds-bubble-image-wrap');
    if (imageWrap) {
      if (s.imageUrl) {
        imageWrap.style.display = 'block';
        imageWrap.innerHTML = '';
        var img = document.createElement('img');
        img.src = s.imageUrl;
        img.className = 'ds-panel-image';
        img.alt = 'panel image';
        imageWrap.appendChild(img);
        _container.classList.add('ds-has-image');
      } else {
        imageWrap.style.display = 'none';
        imageWrap.innerHTML = '';
        _container.classList.remove('ds-has-image');
      }
    }

    _textEl.innerHTML = '';
    clearTimeout(_twTimer);
    clearTimeout(_aaTimer);

    // If goal sentence, prepend a label
    if (useGoal) {
      var lbl = document.createElement('span');
      lbl.className = 'ds-goal-label';
      lbl.textContent = '🎯 objective';
      _textEl.appendChild(lbl);
    }

    var chars  = Array.from(s.text); // Correctly splits multi-byte emoji
    var i      = 0;
    var isLast = (_sentIdx === _sentences.length - 1);

    function typeNext() {
      if (i < chars.length) {
        var span = document.createElement('span');
        span.className = 'ds-char';
        span.textContent = chars[i];
        _textEl.appendChild(span);
        // rAF to trigger CSS opacity transition after insertion
        (function (sp) {
          requestAnimationFrame(function () { sp.classList.add('visible'); });
        }(span));
        // Micro-pauses at punctuation for a more natural terminal-style read rhythm
        var ch = chars[i];
        var delay = TW_DELAY_DEFAULT;
        if (ch === '.' || ch === '!' || ch === '?') delay = TW_DELAY_SENTENCE_END;
        else if (ch === ',') delay = TW_DELAY_COMMA;
        i++;
        _twTimer = setTimeout(typeNext, delay);
      } else {
        // Typewriter complete
        _twDone = true;
        if (!isLast) {
          // Append animated "..." hint between sentences
          var dots = document.createElement('span');
          dots.className = 'ds-dots';
          dots.textContent = ' ...';
          _textEl.appendChild(dots);
        }
        // Auto-advance: duration from sentence or calculated from length
        var dur = (s.duration != null) ? s.duration : (s.text.length * 45 + 1500);
        _aaTimer = setTimeout(function () { skip(); }, dur);
      }
    }
    typeNext();
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * _isCampMenuOpen()
   * Returns true when any camp building overlay is currently visible.
   * Used to suppress A.I.D.A dialogues while menus are open.
   * Primarily relies on CampWorld.menuOpen; falls back to window._CAMP_OVERLAY_IDS.
   */
  function _isCampMenuOpen() {
    // Check via CampWorld public API first (most reliable)
    if (window.CampWorld && window.CampWorld.menuOpen) return true;
    // Fallback: check common overlay IDs (shared constant or inline list)
    var ids = window._CAMP_OVERLAY_IDS || [
      'prism-reliquary-overlay', 'camp-board-overlay', 'neural-matrix-overlay',
      'armory-overlay', 'recycle-overlay', 'campfire-kitchen-overlay',
      'workshop-overlay', 'gacha-store-overlay', 'aida-dark-pact-overlay',
      'special-attacks-panel-overlay', 'quest-hall-overlay',
      'companion-house-modal', 'inventory-screen-modal',
      'progression-shop', 'prestige-menu', 'expeditions-menu',
      'gear-screen', 'achievements-screen'
    ];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && getComputedStyle(el).display !== 'none') return true;
    }
    return false;
  }

  /**
   * show(dialogueArray, options)
   * Start a dialogue sequence.
   * dialogueArray: Array of { text, emotion, duration? }
   * options: { onComplete, x, y }
   */
  function show(dialogueArray, options) {
    // Suppress A.I.D.A dialogue while a camp building menu is open
    if (_isCampMenuOpen()) {
      // If there's a completion callback, fire it so callers don't hang
      options = options || {};
      if (typeof options.onComplete === 'function') options.onComplete();
      return;
    }
    _init();
    options     = options || {};
    _sentences  = dialogueArray;
    _sentIdx    = 0;
    _active     = true;
    _onComplete = options.onComplete || null;
    _posX       = (options.x != null) ? options.x : null;
    _posY       = (options.y != null) ? options.y : null;

    _container.style.display = 'block';
    _applyPosition();
    _showSentence(_sentences[0]);
  }

  /**
   * skip()
   * If typewriter is in progress, complete it instantly.
   * If already done, advance to the next sentence (or dismiss).
   */
  function skip() {
    if (!_active) return;
    clearTimeout(_twTimer);
    clearTimeout(_aaTimer);

    if (!_twDone) {
      // Complete current sentence instantly
      var s = _sentences[_sentIdx];
      _textEl.innerHTML = '';
      // Re-add goal label if needed
      if (_isGoalSentence(s)) {
        var lbl = document.createElement('span');
        lbl.className = 'ds-goal-label';
        lbl.textContent = '🎯 objective';
        _textEl.appendChild(lbl);
      }
      Array.from(s.text).forEach(function (ch) {
        var span = document.createElement('span');
        span.className = 'ds-char visible';
        span.textContent = ch;
        _textEl.appendChild(span);
      });
      _twDone = true;
      var isLast = (_sentIdx === _sentences.length - 1);
      if (!isLast) {
        var dots = document.createElement('span');
        dots.className = 'ds-dots';
        dots.textContent = ' ...';
        _textEl.appendChild(dots);
      }
      // Brief pause then advance
      _aaTimer = setTimeout(function () { skip(); }, 1200);
    } else {
      // Advance to next sentence or dismiss
      _sentIdx++;
      if (_sentIdx >= _sentences.length) {
        dismiss();
      } else {
        _showSentence(_sentences[_sentIdx]);
      }
    }
  }

  /**
   * dismiss()
   * Immediately hide the bubble and fire onComplete callback.
   */
  function dismiss() {
    clearTimeout(_twTimer);
    clearTimeout(_aaTimer);
    _active = false;
    _twDone = false;
    if (_container) _container.style.display = 'none';
    if (_onComplete) {
      var cb = _onComplete;
      _onComplete = null;
      cb();
    }
  }

  /** isActive() → bool */
  function isActive() { return _active; }

  /**
   * setPosition(x, y)
   * Update bubble screen position (call each frame from 3D→2D projection).
   */
  function setPosition(x, y) {
    _posX = x;
    _posY = y;
    _applyPosition();
  }

  /**
   * showChoice(choices, callback)
   * Append choice buttons below the current bubble text.
   * choices: Array of strings or { text } objects.
   * callback(index, choice) fires when a button is tapped.
   */
  function showChoice(choices, callback) {
    _init();
    if (!_choicesEl) return;
    _choicesEl.innerHTML = '';
    choices.forEach(function (choice, idx) {
      var btn = document.createElement('button');
      btn.className = 'ds-choice-btn';
      btn.textContent = (typeof choice === 'string') ? choice : (choice.text || '');
      (function (i, c) {
        function pick(e) {
          if (e.type === 'touchend') e.preventDefault();
          _choicesEl.innerHTML = '';
          if (callback) callback(i, c);
        }
        btn.addEventListener('click', pick);
        btn.addEventListener('touchend', pick, { passive: false });
      }(idx, choice));
      _choicesEl.appendChild(btn);
    });
  }

  return {
    show:          show,
    skip:          skip,
    dismiss:       dismiss,
    isActive:      isActive,
    setPosition:   setPosition,
    showChoice:    showChoice,
    hideOnMenuOpen: function () { if (_active) dismiss(); },
    DIALOGUES:     DIALOGUES
  };
}());
