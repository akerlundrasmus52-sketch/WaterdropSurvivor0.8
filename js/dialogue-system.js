// Benny NPC Animated Dialogue System
// Provides dynamic speech bubbles with emotion-based shapes and typewriter animation.
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

  // Pre-built dialogue sequences for Benny NPC
  var DIALOGUES = {
    // 1. First run welcome (shown in game world before first run)
    firstRunWelcome: [
      { text: 'Heyyy dude! Welcome! 🌊 I\'m Benny, your guide!', emotion: 'happy' },
      { text: 'This is your first run — just vibe with it, explore, fight some enemies, and have fun!', emotion: 'task' },
      { text: 'Don\'t worry about dying, I\'ll be waiting for you back at camp! ✌️', emotion: 'happy' }
    ],
    // 2. First death / camp welcome (shown once on first camp visit)
    campWelcome: [
      { text: 'Hey... you made it back. 💧 Tough first run, huh?', emotion: 'sad' },
      { text: 'Don\'t sweat it! Every drop starts here. You\'ll get stronger every time! 💪', emotion: 'happy' },
      { text: 'Welcome to your camp! This place will grow as you do.', emotion: 'happy' },
      { text: 'Follow me, dude! Let\'s build the Quest Hall! 🔨', emotion: 'task' }
    ],
    // 3. Quest Hall building
    questHall: [
      { text: 'Here\'s the Quest Hall! 📜 This is where your missions live!', emotion: 'happy' },
      { text: 'Build the Quest Hall to start your adventure!', emotion: 'goal', isGoal: true },
      { text: 'Accept quests here and complete them on your runs! 🎯', emotion: 'task' }
    ],
    // 4. Skill Tree building
    skillTree: [
      { text: 'Oh dude, the Skill Tree! This is gonna be SO good for you! 😂', emotion: 'joking' },
      { text: 'Spend your skill points here to unlock epic abilities!', emotion: 'happy' },
      { text: 'Choose wisely — every upgrade changes your playstyle! 🌟', emotion: 'task' }
    ],
    // 5. Armory building
    armory: [
      { text: 'Welcome to the Armory! ⚔️ Weapons and gear all in one place!', emotion: 'happy' },
      { text: 'Hmm, which loadout would suit your style...?', emotion: 'thinking' },
      { text: 'Equip your best gear before each run for maximum power! 💥', emotion: 'task' }
    ],
    // 6. Special Attacks building
    specialAttacks: [
      { text: 'DUDE! Special Attacks! This changes EVERYTHING! 🔥', emotion: 'joking' },
      { text: 'These moves are so powerful the enemies won\'t know what hit \'em!', emotion: 'happy' },
      { text: 'Unlock and equip your specials here — use them wisely in battle! ⚡', emotion: 'task' }
    ],
    // 7. Forge building
    forge: [
      { text: 'Hmm... the Forge. Now we\'re talking serious crafting. 🔧', emotion: 'thinking' },
      { text: 'Bring your resources and craft powerful gear right here!', emotion: 'happy' },
      { text: 'Keep gathering materials on your runs and craft upgrades here! 🛠️', emotion: 'task' }
    ],
    // 8. Generic quest complete
    questComplete: [
      { text: 'YEAH DUDE! Quest complete! You absolutely crushed it! 🎉', emotion: 'happy' },
      { text: 'I knew you had it in you! Ready for the next challenge? 😎', emotion: 'joking' }
    ],
    // 9. Return from run (survived timer)
    returnAlive: [
      { text: 'You\'re back AND alive?! Look at you, a proper survivor! 🌊', emotion: 'happy' },
      { text: 'Time to upgrade — let\'s make the next run even better! 💪', emotion: 'task' }
    ],
    // 10. Return from run (died)
    returnDied: [
      { text: 'Ohhh... you didn\'t make it. But hey, that\'s okay. 😢', emotion: 'sad' },
      { text: 'Every death makes you tougher, dude — that\'s the vibe here! 😂', emotion: 'joking' },
      { text: 'Check your upgrades, gear up, and go again! You\'ve got this! 🔥', emotion: 'task' }
    ],
    // Generic build-unlock (used by bennyWalkToBuild)
    buildUnlock: [
      { text: 'Woah dude, you did it! 🔨 Building unlocked!', emotion: 'happy' }
    ],
    // Follow-me prompt (shown before Benny walks to a building)
    followMe: [
      { text: 'Follow me, dude! 🏃', emotion: 'task' }
    ],
    // Workshop / Forge building intro
    workshop: [
      { text: 'Time to build the Workshop! 🔧 This is where you craft your tools!', emotion: 'happy' },
      { text: 'Build the Workshop to start crafting!', emotion: 'goal', isGoal: true },
      { text: 'I\'ve got some free materials for you — let\'s get building! 🛠️', emotion: 'task' }
    ],
    // Tool showcase (after Workshop built)
    toolShowcase: [
      { text: 'Awesome! Now that you have tools, show me what you can do! 💪', emotion: 'happy' },
      { text: 'Harvest resources: chop trees, mine rocks, collect materials!', emotion: 'goal', isGoal: true },
      { text: 'Go on a run and gather resources for the next building! ⛏️', emotion: 'task' }
    ]
  };

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
      '<div class="ds-bubble-text" id="ds-bubble-text"></div>' +
      '<div class="ds-bubble-choices" id="ds-bubble-choices"></div>';
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
        i++;
        _twTimer = setTimeout(typeNext, 40);
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
   * show(dialogueArray, options)
   * Start a dialogue sequence.
   * dialogueArray: Array of { text, emotion, duration? }
   * options: { onComplete, x, y }
   */
  function show(dialogueArray, options) {
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
    show:       show,
    skip:       skip,
    dismiss:    dismiss,
    isActive:   isActive,
    setPosition: setPosition,
    showChoice: showChoice,
    DIALOGUES:  DIALOGUES
  };
}());
