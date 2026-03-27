/**
 * js/boss-annunaki.js — Annunaki Final Boss System
 *
 * The Annunaki is an ancient giant humanoid boss triggered at wave 30.
 * Rendered as DOM element with CSS animations.
 *
 * Features:
 * - 3-phase boss fight (100%→60%→30%→0%)
 * - Multiple attack patterns (stomp, swipe, projectiles)
 * - Pure CSS animations for all movements
 * - Cinematic entrance and death sequences
 * - Triggers Aida reveal on death
 */

;(function(global) {
'use strict';

// ════════════════════════════════════════════════════════════
//  BOSS STATE
// ════════════════════════════════════════════════════════════
var _boss = null;
var _active = false;
var _currentHP = 0;
var _maxHP = 8000;
var _phase = 1; // 1, 2, or 3
var _attackTimer = 0;
var _stompInterval = 3.0;
var _swipeInterval = 5.0;
var _projectileInterval = 4.0;
var _lastStomp = 0;
var _lastSwipe = 0;
var _lastProjectile = 0;

// ════════════════════════════════════════════════════════════
//  PHASE THRESHOLDS
// ════════════════════════════════════════════════════════════
var PHASE_2_HP = 0.60; // 60%
var PHASE_3_HP = 0.30; // 30%

// ════════════════════════════════════════════════════════════
//  BOSS API
// ════════════════════════════════════════════════════════════
var AnnunakiBoss = {

  /**
   * Spawn the Annunaki boss at wave 30
   */
  spawn: function() {
    if (_active) return;
    _active = true;
    _currentHP = _maxHP;
    _phase = 1;
    _attackTimer = 0;
    _lastStomp = 0;
    _lastSwipe = 0;
    _lastProjectile = 0;

    // Show entrance title card
    _showTitleCard();

    // Spawn boss after title card (2s delay)
    setTimeout(function() {
      _createBossElement();
      _bossEntranceAnimation();
    }, 2000);
  },

  /**
   * Update boss AI and attacks (called each frame)
   */
  update: function(dt) {
    if (!_active || !_boss) return;

    _attackTimer += dt;

    // Phase 1 attacks
    if (_attackTimer - _lastStomp >= _stompInterval) {
      _doStompAttack();
      _lastStomp = _attackTimer;
    }

    if (_attackTimer - _lastSwipe >= _swipeInterval) {
      _doSwipeAttack();
      _lastSwipe = _attackTimer;
    }

    // Phase 2+ adds projectiles
    if (_phase >= 2 && _attackTimer - _lastProjectile >= _projectileInterval) {
      _doProjectileBarrage();
      _lastProjectile = _attackTimer;
    }

    // Phase 3 speeds up attacks (halved intervals)
    if (_phase === 3) {
      _stompInterval = 1.5;
      _swipeInterval = 2.5;
      _projectileInterval = 2.0;
    } else {
      _stompInterval = 3.0;
      _swipeInterval = 5.0;
      _projectileInterval = 4.0;
    }
  },

  /**
   * Deal damage to the boss
   */
  damage: function(amount) {
    if (!_active || _currentHP <= 0) return;

    _currentHP = Math.max(0, _currentHP - amount);
    _updateHPBar();

    // Check phase transitions
    var hpRatio = _currentHP / _maxHP;
    if (_phase === 1 && hpRatio <= PHASE_2_HP) {
      _enterPhase2();
    } else if (_phase === 2 && hpRatio <= PHASE_3_HP) {
      _enterPhase3();
    }

    // Check death
    if (_currentHP <= 0) {
      _onDeath();
    }
  },

  /**
   * Check if boss is active
   */
  isActive: function() {
    return _active;
  },

  /**
   * Get boss element (for hit detection)
   */
  getElement: function() {
    return _boss;
  },

  /**
   * Reset boss state
   */
  reset: function() {
    // Remove the main boss element from the DOM
    if (_boss && _boss.parentNode) {
      _boss.parentNode.removeChild(_boss);
    }

    // Also remove any boss-related UI elements created in _createBossElement()
    var hpBar = document.getElementById('annunaki-hp-bar');
    if (hpBar && hpBar.parentNode) {
      hpBar.parentNode.removeChild(hpBar);
    }

    var phaseLabel = document.getElementById('annunaki-phase-label');
    if (phaseLabel && phaseLabel.parentNode) {
      phaseLabel.parentNode.removeChild(phaseLabel);
    }

    // Reset internal state
    _boss = null;
    _active = false;
    _currentHP = 0;
    _phase = 1;
  }
};

// ════════════════════════════════════════════════════════════
//  INTERNAL FUNCTIONS
// ════════════════════════════════════════════════════════════

function _showTitleCard() {
  var card = document.createElement('div');
  card.id = 'annunaki-title';
  card.style.cssText = [
    'position:fixed',
    'top:0', 'left:0', 'right:0', 'bottom:0',
    'display:flex', 'align-items:center', 'justify-content:center',
    'background:rgba(0,0,0,0.85)',
    'z-index:10000',
    'animation:fadeIn 0.4s ease',
    'pointer-events:none'
  ].join(';');

  var text = document.createElement('div');
  text.style.cssText = [
    'font-size:clamp(24px,5vw,40px)',
    'color:#ffd700',
    'font-family:"Bangers",cursive',
    'letter-spacing:4px',
    'text-shadow:0 0 20px rgba(255,215,0,0.8)',
    'text-align:center'
  ].join(';');
  text.textContent = '⚡ THE ANNUNAKI AWAKENS ⚡';

  card.appendChild(text);
  document.body.appendChild(card);

  // Remove after 2s
  setTimeout(function() {
    card.style.animation = 'fadeOut 0.4s ease';
    setTimeout(function() {
      if (card.parentNode) card.parentNode.removeChild(card);
    }, 400);
  }, 1500);
}

function _createBossElement() {
  var container = document.getElementById('game-container') || document.body;

  // Main boss container
  _boss = document.createElement('div');
  _boss.id = 'annunaki-boss';
  _boss.style.cssText = [
    'position:fixed',
    'bottom:0',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:500',
    'pointer-events:none'
  ].join(';');

  // Aura
  var aura = document.createElement('div');
  aura.className = 'annunaki-aura';
  aura.style.cssText = [
    'position:absolute',
    'inset:-20px',
    'border-radius:inherit',
    'background:transparent',
    'border:2px solid rgba(212,175,55,0.4)',
    'animation:annunaki-aura-pulse 2s ease-in-out infinite',
    'pointer-events:none'
  ].join(';');

  // Body
  var body = document.createElement('div');
  body.className = 'annunaki-body';
  body.style.cssText = [
    'width:min(38vw,200px)',
    'height:min(80vh,500px)',
    'background:linear-gradient(180deg,#c8a600 0%,#8b6914 40%,#5a4010 100%)',
    'border-radius:8% 8% 0 0',
    'box-shadow:0 0 40px rgba(212,175,55,0.6),0 0 80px rgba(212,175,55,0.3)',
    'position:relative',
    'animation:annunaki-idle 3s ease-in-out infinite'
  ].join(';');

  // Head
  var head = document.createElement('div');
  head.className = 'annunaki-head';
  head.style.cssText = [
    'width:22%',
    'padding-bottom:22%',
    'background:radial-gradient(circle,#e8c832 0%,#a07820 60%,#6b4f10 100%)',
    'border-radius:50%',
    'position:absolute',
    'top:-11%',
    'left:50%',
    'transform:translateX(-50%)',
    'display:flex',
    'align-items:center',
    'justify-content:center'
  ].join(';');

  // Eyes
  var eye1 = document.createElement('div');
  eye1.className = 'annunaki-eye';
  eye1.style.cssText = [
    'width:20%',
    'height:30%',
    'background:#fff7a0',
    'border-radius:50%',
    'box-shadow:0 0 8px #fff200',
    'position:absolute',
    'top:40%',
    'left:30%'
  ].join(';');

  var eye2 = eye1.cloneNode();
  eye2.style.left = '60%';

  head.appendChild(eye1);
  head.appendChild(eye2);
  body.appendChild(head);
  body.appendChild(aura);
  _boss.appendChild(body);

  // HP Bar
  var hpBarContainer = document.createElement('div');
  hpBarContainer.id = 'annunaki-hp-bar';
  hpBarContainer.style.cssText = [
    'position:fixed',
    'top:20px',
    'left:50%',
    'transform:translateX(-50%)',
    'width:60vw',
    'height:12px',
    'background:#1a1a1a',
    'border:1px solid rgba(212,175,55,0.6)',
    'border-radius:6px',
    'z-index:9999'
  ].join(';');

  var hpFill = document.createElement('div');
  hpFill.id = 'annunaki-hp-fill';
  hpFill.style.cssText = [
    'width:100%',
    'height:100%',
    'background:linear-gradient(90deg,#8b6914,#ffd700,#8b6914)',
    'border-radius:6px',
    'transition:width 0.3s ease'
  ].join(';');

  var phaseLabel = document.createElement('div');
  phaseLabel.id = 'annunaki-phase-label';
  phaseLabel.style.cssText = [
    'position:fixed',
    'top:36px',
    'left:50%',
    'transform:translateX(-50%)',
    'font-size:11px',
    'color:rgba(212,175,55,0.8)',
    'text-align:center',
    'letter-spacing:2px',
    'z-index:9999',
    'font-family:"Rajdhani",sans-serif'
  ].join(';');
  phaseLabel.textContent = 'ANNUNAKI — PHASE 1';

  hpBarContainer.appendChild(hpFill);
  document.body.appendChild(hpBarContainer);
  document.body.appendChild(phaseLabel);
  container.appendChild(_boss);
}

function _bossEntranceAnimation() {
  _boss.style.animation = 'annunaki-enter 1.5s cubic-bezier(0.22,1,0.36,1) forwards';
}

function _updateHPBar() {
  var fill = document.getElementById('annunaki-hp-fill');
  if (fill) {
    var percent = (_currentHP / _maxHP) * 100;
    fill.style.width = percent + '%';
  }
}

function _enterPhase2() {
  _phase = 2;
  var label = document.getElementById('annunaki-phase-label');
  if (label) label.textContent = 'ANNUNAKI — PHASE 2';

  // Roar animation 3 times
  var body = _boss.querySelector('.annunaki-body');
  if (body) {
    body.classList.add('annunaki-roaring');
    setTimeout(function() { body.classList.remove('annunaki-roaring'); }, 300);
    setTimeout(function() { body.classList.add('annunaki-roaring'); }, 400);
    setTimeout(function() { body.classList.remove('annunaki-roaring'); }, 700);
    setTimeout(function() { body.classList.add('annunaki-roaring'); }, 800);
    setTimeout(function() { body.classList.remove('annunaki-roaring'); }, 1100);
  }

  // Flash screen
  _triggerPhaseFlash();
}

function _enterPhase3() {
  _phase = 3;
  var label = document.getElementById('annunaki-phase-label');
  if (label) label.textContent = 'ANNUNAKI — PHASE 3 (ENRAGED)';

  // Add enraged class (red aura)
  if (_boss) _boss.classList.add('annunaki-enraged');

  // Roar animation 3 times
  var body = _boss.querySelector('.annunaki-body');
  if (body) {
    body.classList.add('annunaki-roaring');
    setTimeout(function() { body.classList.remove('annunaki-roaring'); }, 300);
    setTimeout(function() { body.classList.add('annunaki-roaring'); }, 400);
    setTimeout(function() { body.classList.remove('annunaki-roaring'); }, 700);
    setTimeout(function() { body.classList.add('annunaki-roaring'); }, 800);
    setTimeout(function() { body.classList.remove('annunaki-roaring'); }, 1100);
  }

  // Flash screen
  _triggerPhaseFlash();
}

function _triggerPhaseFlash() {
  var flash = document.createElement('div');
  flash.style.cssText = [
    'position:fixed',
    'top:0', 'left:0', 'right:0', 'bottom:0',
    'background:rgba(212,175,55,0.15)',
    'z-index:9998',
    'animation:annunaki-phase-flash 0.6s ease-out',
    'pointer-events:none'
  ].join(';');
  document.body.appendChild(flash);
  setTimeout(function() {
    if (flash.parentNode) flash.parentNode.removeChild(flash);
  }, 600);
}

function _doStompAttack() {
  if (!_boss) return;
  _boss.classList.add('annunaki-stomping');
  setTimeout(function() {
    if (_boss) _boss.classList.remove('annunaki-stomping');
  }, 400);

  // Screen shake
  if (typeof window._triggerScreenShake === 'function') {
    window._triggerScreenShake(4);
  }

  // Spawn shockwave rings
  for (var i = 0; i < 3; i++) {
    setTimeout(function() {
      _spawnShockwave();
    }, i * 100);
  }
}

function _doSwipeAttack() {
  if (!_boss) return;
  var body = _boss.querySelector('.annunaki-body');
  if (body) {
    body.classList.add('annunaki-swiping');
    setTimeout(function() {
      body.classList.remove('annunaki-swiping');
    }, 500);
  }

  // Check player distance and deal damage
  if (typeof window.player !== 'undefined' && window.player && window.player.mesh) {
    var bossX = window.innerWidth / 2;
    // Compute a real screen-space X position for the player if possible
    var playerScreenX = window.innerWidth / 2;
    try {
      if (window.THREE && window.camera && typeof window.player.mesh.getWorldPosition === 'function') {
        var _annunakiTempVec = new window.THREE.Vector3();
        window.player.mesh.getWorldPosition(_annunakiTempVec);
        _annunakiTempVec.project(window.camera);
        // Convert normalized device coordinates (-1..1) to screen pixels
        playerScreenX = (_annunakiTempVec.x + 1) * 0.5 * window.innerWidth;
      }
    } catch (e) {
      // Fallback: keep playerScreenX at center if projection fails
    }
    var distance = Math.abs(playerScreenX - bossX);
    if (distance < window.innerWidth * 0.4) {
      // Player is within 40% of screen width - deal damage
      if (typeof window.player.takeDamage === 'function') {
        window.player.takeDamage(25);
      }
    }
  }
}

function _doProjectileBarrage() {
  if (!_boss) return;
  var body = _boss.querySelector('.annunaki-body');
  var rect = body ? body.getBoundingClientRect() : { left: window.innerWidth/2, top: window.innerHeight/2 };

  for (var i = 0; i < 3; i++) {
    setTimeout(function() {
      _spawnProjectile(rect.left + rect.width/2, rect.top + rect.height/3);
    }, i * 200);
  }
}

function _spawnShockwave() {
  if (!_boss) return;
  var ring = document.createElement('div');
  ring.className = 'annunaki-shockwave';
  ring.style.cssText = [
    'position:fixed',
    'bottom:0',
    'left:50%',
    'transform:translateX(-50%)',
    'width:0',
    'height:0',
    'border:2px solid rgba(212,175,55,0.6)',
    'border-radius:50%',
    'animation:annunaki-shockwave-expand 0.5s ease-out forwards',
    'pointer-events:none',
    'z-index:499'
  ].join(';');
  document.body.appendChild(ring);
  setTimeout(function() {
    if (ring.parentNode) ring.parentNode.removeChild(ring);
  }, 500);
}

function _spawnProjectile(x, y) {
  var proj = document.createElement('div');
  proj.className = 'annunaki-projectile';
  proj.style.cssText = [
    'position:fixed',
    'left:' + x + 'px',
    'top:' + y + 'px',
    'width:20px',
    'height:20px',
    'background:radial-gradient(#fff200,#c8a600)',
    'border-radius:50%',
    'box-shadow:0 0 10px #ffd700',
    'animation:annunaki-projectile 0.8s ease-in forwards',
    'pointer-events:none',
    'z-index:501'
  ].join(';');
  document.body.appendChild(proj);

  // Check collision after animation (0.8s)
  setTimeout(function() {
    // Check if player is near landing position
    if (typeof window.player !== 'undefined' && window.player && window.player.mesh) {
      // Simplified collision - would need proper calculation
      if (typeof window.player.takeDamage === 'function') {
        window.player.takeDamage(15);
      }
    }
    if (proj.parentNode) proj.parentNode.removeChild(proj);
  }, 800);
}

function _onDeath() {
  _active = false;
  if (!_boss) return;

  _boss.classList.add('annunaki-dying');

  setTimeout(function() {
    // Remove boss elements
    var hpBar = document.getElementById('annunaki-hp-bar');
    var label = document.getElementById('annunaki-phase-label');
    if (hpBar && hpBar.parentNode) hpBar.parentNode.removeChild(hpBar);
    if (label && label.parentNode) label.parentNode.removeChild(label);
    if (_boss && _boss.parentNode) _boss.parentNode.removeChild(_boss);
    _boss = null;

    // Complete quest
    if (typeof window.QuestSystem !== 'undefined' && window.QuestSystem.completeObjective) {
      window.QuestSystem.completeObjective('quest_defeatAnnunaki');
    }

    // Trigger Aida reveal after 2 seconds
    setTimeout(function() {
      _triggerAidaReveal();
    }, 2000);
  }, 1800);
}

function _triggerAidaReveal() {
  // Cinematic reveal sequence (Section 5A)
  var overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed',
    'top:0', 'left:0', 'right:0', 'bottom:0',
    'background:rgba(0,0,0,0)',
    'z-index:10000',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'transition:background 0.5s ease'
  ].join(';');

  var textEl = document.createElement('div');
  textEl.style.cssText = [
    'font-size:clamp(18px,4vw,28px)',
    'color:#fff',
    'font-family:"Rajdhani",sans-serif',
    'text-align:center',
    'opacity:0',
    'transition:opacity 0.4s ease'
  ].join(';');

  overlay.appendChild(textEl);
  document.body.appendChild(overlay);

  var lines = [
    'The Annunaki falls…',
    'But something stirs in the ashes…',
    'Aida…?',
    'She was the Annunaki all along.'
  ];

  var lineIndex = 0;

  function showNextLine() {
    if (lineIndex >= lines.length) {
      // Fade out overlay
      overlay.style.background = 'rgba(0,0,0,0)';
      textEl.style.opacity = '0';
      setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        // Complete quest and spawn Aida
        if (typeof window.QuestSystem !== 'undefined' && window.QuestSystem.completeObjective) {
          window.QuestSystem.completeObjective('quest_aida_revealed');
        }
        _spawnAida();
      }, 500);
      return;
    }

    var line = lines[lineIndex];
    textEl.textContent = line;
    if (lineIndex === 3) textEl.style.color = '#ff3333'; // Red for final line

    // Fade in
    setTimeout(function() {
      overlay.style.background = 'rgba(0,0,0,0.9)';
      textEl.style.opacity = '1';
    }, 100);

    // Hold then fade out
    setTimeout(function() {
      textEl.style.opacity = '0';
      setTimeout(function() {
        lineIndex++;
        showNextLine();
      }, 400);
    }, 1500);
  }

  showNextLine();
}

function _spawnAida() {
  console.log('[AnnunakiBoss] Aida reveal complete - spawning Aida boss');

  // Spawn Aida boss if available
  if (typeof AidaBoss !== 'undefined' && AidaBoss.spawn) {
    AidaBoss.spawn();
  } else {
    console.warn('[AnnunakiBoss] AidaBoss not found - ensure boss-aida.js is loaded');
  }
}

// ════════════════════════════════════════════════════════════
//  EXPORT
// ════════════════════════════════════════════════════════════
global.AnnunakiBoss = AnnunakiBoss;

})(window);
