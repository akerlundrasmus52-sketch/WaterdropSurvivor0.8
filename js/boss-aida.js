// js/boss-aida.js — Aida Final Boss System
// The true final boss revealed after defeating Annunaki
// Smaller, faster, more dangerous with resurrection mechanic

(function(global) {
'use strict';

// ════════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════════
var _active = false;
var _currentHP = 5000;
var _maxHP = 5000;
var _phase = 1; // 1: 100-50%, 2: 50-0%
var _lastAttackTime = 0;
var _attackCooldown = 2500; // ms
var _resurrectionUsed = false;
var _aidaDOM = null;
var _hpBarDOM = null;
var _phaseLabelDOM = null;
var _annunakiClone = null;

// Attack pattern state
var _burstCooldown = 0;
var _dashCooldown = 0;
var _drainCooldown = 0;

// ════════════════════════════════════════════════════════════
//  AIDA BOSS OBJECT
// ════════════════════════════════════════════════════════════
var AidaBoss = {
  /**
   * spawn() - Initialize Aida boss fight
   */
  spawn: function() {
    if (_active) return;
    _active = true;
    _currentHP = _maxHP;
    _phase = 1;
    _lastAttackTime = performance.now();
    _resurrectionUsed = false;

    _createAidaDOM();
    _showEntranceSequence();

    console.log('[AidaBoss] Aida spawned! HP:', _maxHP);
  },

  /**
   * update(dt) - Main update loop called from sandbox-loop.js
   */
  update: function(dt) {
    if (!_active) return;

    var now = performance.now();

    // Update attack timers
    _burstCooldown -= dt * 1000;
    _dashCooldown -= dt * 1000;
    _drainCooldown -= dt * 1000;

    // Attack pattern based on phase
    if (_phase === 1) {
      // Phase 1: Burst + Dash attacks
      if (_burstCooldown <= 0) {
        _attackEnergyBurst();
        _burstCooldown = 3000; // 3s cooldown
      }
      if (_dashCooldown <= 0) {
        _attackShadowDash();
        _dashCooldown = 4000; // 4s cooldown
      }
    } else if (_phase === 2) {
      // Phase 2: All attacks + Life Drain
      if (_burstCooldown <= 0) {
        _attackEnergyBurst();
        _burstCooldown = 2000; // Faster in phase 2
      }
      if (_dashCooldown <= 0) {
        _attackShadowDash();
        _dashCooldown = 2500; // Faster in phase 2
      }
      if (_drainCooldown <= 0) {
        _attackLifeDrain();
        _drainCooldown = 6000; // 6s cooldown
      }
    }

    // Update Annunaki clone if active
    if (_annunakiClone && _annunakiClone.active) {
      _updateAnnunakiClone(dt);
    }
  },

  /**
   * damage(amount) - Apply damage to Aida
   */
  damage: function(amount) {
    if (!_active || _currentHP <= 0) return;

    _currentHP -= amount;
    _updateHPBar();

    // Flash effect on hit
    if (_aidaDOM) {
      _aidaDOM.style.filter = 'brightness(1.8)';
      setTimeout(function() {
        if (_aidaDOM) _aidaDOM.style.filter = '';
      }, 100);
    }

    // Phase transition at 50% HP
    if (_phase === 1 && _currentHP <= _maxHP * 0.5) {
      _transitionToPhase2();
    }

    // Check for death
    if (_currentHP <= 0) {
      _currentHP = 0;
      _updateHPBar();
      _die();
    }
  },

  /**
   * isActive() - Check if boss is currently active
   */
  isActive: function() {
    return _active;
  },

  /**
   * despawn() - Clean up boss (called by completion screen)
   */
  despawn: function() {
    _active = false;
    if (_aidaDOM && _aidaDOM.parentNode) {
      _aidaDOM.parentNode.removeChild(_aidaDOM);
    }
    if (_hpBarDOM && _hpBarDOM.parentNode) {
      _hpBarDOM.parentNode.removeChild(_hpBarDOM);
    }
    if (_phaseLabelDOM && _phaseLabelDOM.parentNode) {
      _phaseLabelDOM.parentNode.removeChild(_phaseLabelDOM);
    }
    if (_annunakiClone) {
      _despawnAnnunakiClone();
    }
    _aidaDOM = null;
    _hpBarDOM = null;
    _phaseLabelDOM = null;
    console.log('[AidaBoss] Aida despawned');
  }
};

// ════════════════════════════════════════════════════════════
//  DOM CREATION
// ════════════════════════════════════════════════════════════
function _createAidaDOM() {
  // Main boss container
  _aidaDOM = document.createElement('div');
  _aidaDOM.id = 'aida-boss';
  _aidaDOM.style.cssText = 'position:fixed;bottom:0;left:50%;transform:translateX(-50%);' +
    'width:30vw;height:65vh;background:linear-gradient(180deg,#8b1a8b 0%,#dc143c 100%);' +
    'border-radius:50% 50% 0 0;border:4px solid #ff00ff;' +
    'box-shadow:0 0 60px rgba(255,0,255,0.8),inset 0 0 40px rgba(255,0,255,0.3);' +
    'z-index:499;pointer-events:none;opacity:0;transition:opacity 0.5s;';

  // Eyes
  var leftEye = document.createElement('div');
  leftEye.style.cssText = 'position:absolute;top:25%;left:25%;width:3vw;height:6vh;' +
    'background:#ff00ff;border-radius:50%;box-shadow:0 0 20px #ff00ff;';
  _aidaDOM.appendChild(leftEye);

  var rightEye = document.createElement('div');
  rightEye.style.cssText = 'position:absolute;top:25%;right:25%;width:3vw;height:6vh;' +
    'background:#ff00ff;border-radius:50%;box-shadow:0 0 20px #ff00ff;';
  _aidaDOM.appendChild(rightEye);

  // Aura effect
  var aura = document.createElement('div');
  aura.style.cssText = 'position:absolute;top:-10%;left:-10%;width:120%;height:120%;' +
    'border-radius:50%;background:radial-gradient(circle,rgba(255,0,255,0.4) 0%,transparent 70%);' +
    'animation:aida-aura-pulse 2s infinite;pointer-events:none;';
  _aidaDOM.appendChild(aura);

  document.body.appendChild(_aidaDOM);

  // HP Bar
  _hpBarDOM = document.createElement('div');
  _hpBarDOM.id = 'aida-hp-bar';
  _hpBarDOM.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);' +
    'width:600px;height:30px;background:rgba(0,0,0,0.8);border:2px solid #ff00ff;' +
    'border-radius:15px;overflow:hidden;z-index:1000;';

  var hpFill = document.createElement('div');
  hpFill.id = 'aida-hp-fill';
  hpFill.style.cssText = 'width:100%;height:100%;background:linear-gradient(90deg,#ff00ff,#dc143c);' +
    'transition:width 0.3s;box-shadow:0 0 20px #ff00ff;';
  _hpBarDOM.appendChild(hpFill);

  var hpText = document.createElement('div');
  hpText.id = 'aida-hp-text';
  hpText.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'color:#fff;font-size:14px;font-weight:bold;text-shadow:2px 2px 4px #000;pointer-events:none;';
  hpText.textContent = 'AIDA: ' + _currentHP + ' / ' + _maxHP;
  _hpBarDOM.appendChild(hpText);

  document.body.appendChild(_hpBarDOM);

  // Phase Label
  _phaseLabelDOM = document.createElement('div');
  _phaseLabelDOM.id = 'aida-phase-label';
  _phaseLabelDOM.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);' +
    'color:#ff00ff;font-size:16px;font-weight:bold;text-shadow:0 0 10px #ff00ff;z-index:1001;';
  _phaseLabelDOM.textContent = 'PHASE 1';
  document.body.appendChild(_phaseLabelDOM);
}

function _showEntranceSequence() {
  // Title card
  var titleCard = document.createElement('div');
  titleCard.style.cssText = 'position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);' +
    'font-size:64px;font-weight:bold;color:#ff00ff;text-shadow:0 0 30px #ff00ff;' +
    'z-index:1002;opacity:0;transition:opacity 0.5s;pointer-events:none;';
  titleCard.textContent = 'AIDA';
  document.body.appendChild(titleCard);

  setTimeout(function() {
    titleCard.style.opacity = '1';
  }, 100);

  setTimeout(function() {
    titleCard.style.opacity = '0';
    setTimeout(function() {
      if (titleCard.parentNode) titleCard.parentNode.removeChild(titleCard);
    }, 500);
  }, 2500);

  // Fade in boss
  setTimeout(function() {
    if (_aidaDOM) {
      _aidaDOM.style.animation = 'aida-enter 1s forwards';
      _aidaDOM.style.opacity = '1';
    }
  }, 1000);
}

function _updateHPBar() {
  if (!_hpBarDOM) return;
  var fill = document.getElementById('aida-hp-fill');
  var text = document.getElementById('aida-hp-text');
  if (fill) {
    var percent = (_currentHP / _maxHP) * 100;
    fill.style.width = percent + '%';
  }
  if (text) {
    text.textContent = 'AIDA: ' + Math.max(0, Math.floor(_currentHP)) + ' / ' + _maxHP;
  }
}

// ════════════════════════════════════════════════════════════
//  PHASE TRANSITIONS
// ════════════════════════════════════════════════════════════
function _transitionToPhase2() {
  _phase = 2;
  console.log('[AidaBoss] Phase 2 transition!');

  // Update phase label
  if (_phaseLabelDOM) {
    _phaseLabelDOM.textContent = 'PHASE 2 — ENRAGED';
    _phaseLabelDOM.style.color = '#ff0000';
  }

  // Visual effect
  if (_aidaDOM) {
    _aidaDOM.style.animation = 'aida-phase-transition 1s';
    _aidaDOM.style.boxShadow = '0 0 80px rgba(255,0,0,1),inset 0 0 60px rgba(255,0,0,0.5)';
  }

  // Screen flash
  var flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'background:#ff00ff;z-index:998;opacity:0;pointer-events:none;';
  document.body.appendChild(flash);

  setTimeout(function() {
    flash.style.transition = 'opacity 0.1s';
    flash.style.opacity = '0.6';
  }, 10);

  setTimeout(function() {
    flash.style.opacity = '0';
    setTimeout(function() {
      if (flash.parentNode) flash.parentNode.removeChild(flash);
    }, 300);
  }, 200);

  // Resurrect Annunaki clone if not already used
  if (!_resurrectionUsed) {
    _resurrectionUsed = true;
    setTimeout(function() {
      _resurrectAnnunakiClone();
    }, 1500);
  }
}

// ════════════════════════════════════════════════════════════
//  ATTACK PATTERNS
// ════════════════════════════════════════════════════════════

/**
 * Energy Burst - Spawns 5 projectiles in a spread pattern
 */
function _attackEnergyBurst() {
  if (!_aidaDOM || typeof player === 'undefined' || !player.mesh) return;

  console.log('[AidaBoss] Energy Burst attack!');

  var angles = [-30, -15, 0, 15, 30]; // Spread pattern
  for (var i = 0; i < angles.length; i++) {
    _spawnProjectile(angles[i]);
  }
}

function _spawnProjectile(angleOffset) {
  if (typeof player === 'undefined' || !player.mesh) return;

  var projectile = document.createElement('div');
  projectile.className = 'aida-projectile';
  projectile.style.cssText = 'position:fixed;width:30px;height:30px;border-radius:50%;' +
    'background:radial-gradient(circle,#ff00ff,#8b1a8b);box-shadow:0 0 20px #ff00ff;' +
    'z-index:498;pointer-events:none;';

  // Start at Aida's position (center bottom)
  var startX = window.innerWidth / 2;
  var startY = window.innerHeight;

  // Calculate direction toward player with angle offset
  var playerX = window.innerWidth / 2; // Simplified - player is centered
  var playerY = window.innerHeight / 2;

  var dx = playerX - startX;
  var dy = playerY - startY;
  var angle = Math.atan2(dy, dx) + (angleOffset * Math.PI / 180);

  projectile.style.left = startX + 'px';
  projectile.style.top = startY + 'px';

  document.body.appendChild(projectile);

  // Animate projectile
  var speed = 300; // pixels per second
  var lifetime = 0;
  var maxLifetime = 4000; // 4 seconds max

  var interval = setInterval(function() {
    lifetime += 16;
    if (lifetime >= maxLifetime || !projectile.parentNode) {
      clearInterval(interval);
      if (projectile.parentNode) projectile.parentNode.removeChild(projectile);
      return;
    }

    var x = parseFloat(projectile.style.left);
    var y = parseFloat(projectile.style.top);

    x += Math.cos(angle) * speed * 0.016;
    y += Math.sin(angle) * speed * 0.016;

    projectile.style.left = x + 'px';
    projectile.style.top = y + 'px';

    // Check collision with player
    if (typeof player !== 'undefined' && player.mesh && typeof takeDamage === 'function') {
      var pScreen = _worldToScreen(player.mesh.position);
      if (pScreen) {
        var dist = Math.sqrt(Math.pow(x - pScreen.x, 2) + Math.pow(y - pScreen.y, 2));
        if (dist < 40) {
          takeDamage(20, 'aida_projectile');
          clearInterval(interval);
          if (projectile.parentNode) projectile.parentNode.removeChild(projectile);
        }
      }
    }
  }, 16);
}

/**
 * Shadow Dash - Quick dash attack that damages player if hit
 */
function _attackShadowDash() {
  if (!_aidaDOM || typeof player === 'undefined' || !player.mesh) return;

  console.log('[AidaBoss] Shadow Dash attack!');

  // Visual telegraph
  _aidaDOM.style.filter = 'brightness(2) saturate(2)';

  setTimeout(function() {
    if (!_aidaDOM) return;

    // Dash animation
    _aidaDOM.style.transform = 'translateX(-50%) scale(1.3, 0.8)';
    _aidaDOM.style.transition = 'transform 0.15s';

    // Check if player is in danger zone (front 40% of screen)
    if (typeof player !== 'undefined' && player.mesh && typeof player.takeDamage === 'function') {
      var pScreen = _worldToScreen(player.mesh.position);
      if (pScreen && pScreen.y > window.innerHeight * 0.6) {
        player.takeDamage(30, 'aida_dash');
      }
    }

    setTimeout(function() {
      if (!_aidaDOM) return;
      _aidaDOM.style.transform = 'translateX(-50%)';
      _aidaDOM.style.filter = '';
      _aidaDOM.style.transition = '';
    }, 200);
  }, 500); // Telegraph delay
}

/**
 * Life Drain - Heals Aida while damaging player over time
 */
function _attackLifeDrain() {
  if (!_aidaDOM || typeof player === 'undefined' || !player.mesh) return;

  console.log('[AidaBoss] Life Drain attack!');

  // Visual effect - beam connecting Aida to player
  var beam = document.createElement('div');
  beam.style.cssText = 'position:fixed;bottom:50%;left:50%;width:4px;height:50%;' +
    'background:linear-gradient(0deg,#ff00ff,transparent);transform-origin:bottom;' +
    'z-index:497;pointer-events:none;animation:aida-drain-pulse 0.3s infinite;';
  document.body.appendChild(beam);

  // Drain effect over 3 seconds
  var drainTicks = 0;
  var drainInterval = setInterval(function() {
    drainTicks++;

    if (drainTicks > 10 || !_active) {
      clearInterval(drainInterval);
      if (beam.parentNode) beam.parentNode.removeChild(beam);
      return;
    }

    // Damage player and heal Aida
    if (typeof player !== 'undefined' && typeof player.takeDamage === 'function') {
      player.takeDamage(5);
      _currentHP = Math.min(_maxHP, _currentHP + 10);
      _updateHPBar();
    }
  }, 300); // Every 300ms for 3 seconds
}

// ════════════════════════════════════════════════════════════
//  ANNUNAKI CLONE RESURRECTION
// ════════════════════════════════════════════════════════════
function _resurrectAnnunakiClone() {
  console.log('[AidaBoss] Resurrecting Annunaki clone!');

  // Show notification
  if (typeof _showWaveNotification !== 'undefined') {
    _showWaveNotification('💀 AIDA RESURRECTS ANNUNAKI! 💀', '#ff0000', 3000);
  }

  // Create weakened Annunaki clone (30% HP, half scale)
  _annunakiClone = {
    active: true,
    hp: 2400, // 30% of 8000
    maxHP: 2400,
    dom: null,
    hpBar: null,
    lastAttack: performance.now()
  };

  // Create DOM element
  var clone = document.createElement('div');
  clone.id = 'annunaki-clone';
  clone.style.cssText = 'position:fixed;bottom:0;right:10%;width:35vw;height:50vh;' +
    'background:linear-gradient(180deg,#2a2a2a 0%,#4a4a4a 40%,#1a1a1a 100%);' +
    'border-radius:50% 50% 0 0;border:3px solid rgba(255,215,0,0.5);' +
    'box-shadow:0 0 40px rgba(255,215,0,0.4);z-index:498;opacity:0;' +
    'transition:opacity 0.5s;pointer-events:none;';

  // Eyes
  var leftEye = document.createElement('div');
  leftEye.style.cssText = 'position:absolute;top:25%;left:20%;width:3vw;height:6vh;' +
    'background:#ff0000;border-radius:50%;box-shadow:0 0 15px #ff0000;opacity:0.5;';
  clone.appendChild(leftEye);

  var rightEye = document.createElement('div');
  rightEye.style.cssText = 'position:absolute;top:25%;right:20%;width:3vw;height:6vh;' +
    'background:#ff0000;border-radius:50%;box-shadow:0 0 15px #ff0000;opacity:0.5;';
  clone.appendChild(rightEye);

  document.body.appendChild(clone);
  _annunakiClone.dom = clone;

  // HP Bar
  var hpBar = document.createElement('div');
  hpBar.style.cssText = 'position:fixed;top:60px;right:20px;width:300px;height:20px;' +
    'background:rgba(0,0,0,0.8);border:2px solid rgba(255,215,0,0.5);border-radius:10px;' +
    'overflow:hidden;z-index:1000;';

  var hpFill = document.createElement('div');
  hpFill.id = 'clone-hp-fill';
  hpFill.style.cssText = 'width:100%;height:100%;background:rgba(255,215,0,0.5);transition:width 0.3s;';
  hpBar.appendChild(hpFill);

  var hpText = document.createElement('div');
  hpText.id = 'clone-hp-text';
  hpText.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'color:#fff;font-size:11px;font-weight:bold;text-shadow:1px 1px 2px #000;pointer-events:none;';
  hpText.textContent = 'CLONE: ' + _annunakiClone.hp;
  hpBar.appendChild(hpText);

  document.body.appendChild(hpBar);
  _annunakiClone.hpBar = hpBar;

  // Fade in
  setTimeout(function() {
    if (clone) clone.style.opacity = '1';
  }, 100);
}

function _updateAnnunakiClone(dt) {
  if (!_annunakiClone || !_annunakiClone.active) return;

  var now = performance.now();

  // Simple stomp attack every 4 seconds
  if (now - _annunakiClone.lastAttack > 4000) {
    _annunakiClone.lastAttack = now;

    // Stomp animation
    if (_annunakiClone.dom) {
      _annunakiClone.dom.style.animation = 'annunaki-stomp 0.6s';
      setTimeout(function() {
        if (_annunakiClone && _annunakiClone.dom) {
          _annunakiClone.dom.style.animation = '';
        }
      }, 600);
    }

    // Damage player if close
    if (typeof player !== 'undefined' && typeof takeDamage === 'function') {
      takeDamage(15, 'clone_stomp');
    }
  }
}

function _damageAnnunakiClone(amount) {
  if (!_annunakiClone || !_annunakiClone.active) return;

  _annunakiClone.hp -= amount;

  // Update HP bar
  if (_annunakiClone.hpBar) {
    var fill = document.getElementById('clone-hp-fill');
    var text = document.getElementById('clone-hp-text');
    if (fill) {
      var percent = (_annunakiClone.hp / _annunakiClone.maxHP) * 100;
      fill.style.width = percent + '%';
    }
    if (text) {
      text.textContent = 'CLONE: ' + Math.max(0, Math.floor(_annunakiClone.hp));
    }
  }

  // Flash on hit
  if (_annunakiClone.dom) {
    _annunakiClone.dom.style.filter = 'brightness(1.5)';
    setTimeout(function() {
      if (_annunakiClone && _annunakiClone.dom) {
        _annunakiClone.dom.style.filter = '';
      }
    }, 100);
  }

  // Check for death
  if (_annunakiClone.hp <= 0) {
    _despawnAnnunakiClone();
  }
}

function _despawnAnnunakiClone() {
  if (!_annunakiClone) return;

  console.log('[AidaBoss] Annunaki clone defeated!');

  _annunakiClone.active = false;

  // Death animation
  if (_annunakiClone.dom) {
    _annunakiClone.dom.style.animation = 'annunaki-death 1.5s forwards';
    setTimeout(function() {
      if (_annunakiClone && _annunakiClone.dom && _annunakiClone.dom.parentNode) {
        _annunakiClone.dom.parentNode.removeChild(_annunakiClone.dom);
      }
    }, 1500);
  }

  if (_annunakiClone.hpBar && _annunakiClone.hpBar.parentNode) {
    _annunakiClone.hpBar.parentNode.removeChild(_annunakiClone.hpBar);
  }

  _annunakiClone = null;
}

// ════════════════════════════════════════════════════════════
//  DEATH SEQUENCE
// ════════════════════════════════════════════════════════════
function _die() {
  if (!_active) return;

  console.log('[AidaBoss] Aida defeated!');
  _active = false;

  // Complete quest
  if (typeof QuestSystem !== 'undefined' && QuestSystem.completeObjective) {
    QuestSystem.completeObjective('quest_defeatAida');
  }

  // Death animation
  if (_aidaDOM) {
    _aidaDOM.style.animation = 'aida-death 2s forwards';
  }

  // Clean up clone if still alive
  if (_annunakiClone && _annunakiClone.active) {
    _despawnAnnunakiClone();
  }

  // Show completion screen after delay
  setTimeout(function() {
    AidaBoss.despawn();
    if (typeof CompletionScreen !== 'undefined' && CompletionScreen.show) {
      CompletionScreen.show();
    }
  }, 2500);
}

// ════════════════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════════════════
function _worldToScreen(worldPos) {
  if (typeof camera === 'undefined' || typeof renderer === 'undefined') return null;

  var vector = worldPos.clone();
  vector.project(camera);

  var widthHalf = renderer.domElement.width / 2;
  var heightHalf = renderer.domElement.height / 2;

  return {
    x: (vector.x * widthHalf) + widthHalf,
    y: -(vector.y * heightHalf) + heightHalf
  };
}

// ════════════════════════════════════════════════════════════
//  EXPORTS
// ════════════════════════════════════════════════════════════
global.AidaBoss = AidaBoss;

// Export clone damage function for projectile hit detection
global._damageAidaBoss = function(amount) {
  if (AidaBoss.isActive()) {
    AidaBoss.damage(amount);
  }
};

global._damageAnnunakiClone = _damageAnnunakiClone;

})(window);
