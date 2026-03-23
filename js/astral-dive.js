// js/astral-dive.js — Astral Dive Minigame (2D Top-Down Shooter)
// A 2D "1945"-style vertical scrolling arcade shooter.
// Exposes: window.AstralDive.start()
// Rewards: saveData.astralEssence + saveData.neuralCores

(function () {
  'use strict';

  /* ================================================================
     CONSTANTS
  ================================================================ */
  const PLR_W = 32, PLR_H = 42;
  const BLT_W = 4, BLT_H = 14;
  const PLR_SPEED = 230;
  const BLT_SPEED = 420;
  const ENEM_BLT_SPEED = 170;
  const TOTAL_WAVES = 5;
  const BASE_SHOOT_CD = 0.22;
  const INVULN_TIME = 1.8;
  const WAVE_CLEAR_DELAY = 2.0;
  const MAX_LIVES = 3;

  /* ================================================================
     STATE
  ================================================================ */
  let _active = false;
  let _overlay = null;
  let _canvas = null;
  let _ctx = null;
  let _animId = null;
  let _lastTime = 0;
  let _paused = false;
  let _gameOver = false;
  let _waveClearing = false;
  let _waveClearTimer = 0;

  let _player = null;
  let _bullets = [];
  let _enemyBullets = [];
  let _enemies = [];
  let _collectibles = [];
  let _particles = [];
  let _stars = [];

  let _score = 0;
  let _wave = 0;
  let _essenceEarned = 0;
  let _coresEarned = 0;
  let _shootTimer = 0;
  let _bombCount = 0;
  let _gameTime = 0;
  let _pauseOverlay = null;

  let _keys = {};
  let _touch = { active: false, x: 0, y: 0, startX: 0, startY: 0 };
  let _skills = {};

  /* ================================================================
     AUDIO (Web Audio API — procedural, no asset files)
  ================================================================ */
  let _audioCtx = null;
  function _getAudio() {
    if (!_audioCtx) {
      try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return _audioCtx;
  }
  function _playTone(freq, type, dur, vol, delay) {
    const ctx = _getAudio();
    if (!ctx) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = type || 'sine';
      o.frequency.value = freq;
      const t = ctx.currentTime + (delay || 0);
      g.gain.setValueAtTime(vol || 0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.start(t); o.stop(t + dur);
    } catch(e) {}
  }
  function _sfxShoot()   { _playTone(780, 'square',   0.05, 0.06); }
  function _sfxHit()     { _playTone(200, 'sawtooth', 0.09, 0.12); }
  function _sfxCollect() { _playTone(1100, 'sine', 0.12, 0.09); _playTone(1500, 'sine', 0.08, 0.06, 0.05); }
  function _sfxDie()     { _playTone(100, 'sawtooth', 0.55, 0.15); _playTone(70, 'sine', 0.8, 0.1); }
  function _sfxExplode() { _playTone(140, 'square', 0.18, 0.1); _playTone(90, 'sawtooth', 0.22, 0.08); }
  function _sfxBomb()    { _playTone(55, 'square', 0.4, 0.2); _playTone(110, 'sawtooth', 0.3, 0.15); }
  function _sfxWave()    { _playTone(420, 'sine', 0.35, 0.1); _playTone(620, 'sine', 0.4, 0.1, 0.12); }

  /* ================================================================
     SCROLLING STAR BACKGROUND (3 parallax layers)
  ================================================================ */
  function _initStars() {
    _stars = [];
    const W = _canvas.width, H = _canvas.height;
    const layers = [
      { count: 50, speed: 25, size: 1.0 },
      { count: 35, speed: 65, size: 1.6 },
      { count: 20, speed: 120, size: 2.4 }
    ];
    for (const layer of layers) {
      for (let i = 0; i < layer.count; i++) {
        _stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          size: layer.size,
          speed: layer.speed,
          brightness: 0.35 + Math.random() * 0.65,
          color: Math.random() > 0.85 ? '#aaccff' : '#ffffff'
        });
      }
    }
  }
  function _updateStars(dt) {
    const H = _canvas.height;
    for (const s of _stars) {
      s.y += s.speed * dt;
      if (s.y > H + 4) s.y = -4;
    }
  }
  function _drawStars() {
    const ctx = _ctx;
    for (const s of _stars) {
      ctx.globalAlpha = s.brightness;
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  /* ================================================================
     PLAYER (water-droplet ship)
  ================================================================ */
  function _initPlayer() {
    const W = _canvas.width, H = _canvas.height;
    _player = {
      x: W / 2 - PLR_W / 2,
      y: H - 110,
      w: PLR_W, h: PLR_H,
      lives: MAX_LIVES,
      shield: _skills.shield ? 1 : 0,
      invuln: false, invulnTimer: 0,
      blinkTimer: 0
    };
  }
  function _drawPlayer() {
    if (!_player) return;
    const ctx = _ctx;
    const p = _player;
    if (p.invuln && (Math.floor(p.blinkTimer * 10) % 2 === 0)) return;
    const cx = p.x + p.w / 2;

    ctx.shadowColor = 'rgba(0,180,255,0.8)';
    ctx.shadowBlur = 16;

    // Droplet body
    ctx.fillStyle = '#00aaff';
    ctx.beginPath();
    ctx.moveTo(cx, p.y + 3);
    ctx.bezierCurveTo(cx + 15, p.y + p.h * 0.48, cx + 15, p.y + p.h * 0.85, cx, p.y + p.h - 3);
    ctx.bezierCurveTo(cx - 15, p.y + p.h * 0.85, cx - 15, p.y + p.h * 0.48, cx, p.y + 3);
    ctx.fill();

    // Highlight sheen
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.beginPath();
    ctx.ellipse(cx - 5, p.y + 11, 5, 9, -0.35, 0, Math.PI * 2);
    ctx.fill();

    // Engine exhaust
    const exhaustColors = ['#00ffff', '#0088ff', '#0044cc'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = exhaustColors[i];
      ctx.globalAlpha = 0.6 - i * 0.15;
      ctx.beginPath();
      ctx.ellipse(cx + (i - 1) * 7, p.y + p.h + 5 + i * 4, 2 + i, 4 + i * 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Shield bubble
    if (p.shield > 0) {
      ctx.strokeStyle = 'rgba(0,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(0,255,255,0.7)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.ellipse(cx, p.y + p.h / 2, p.w * 0.78, p.h * 0.68, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
  }

  /* ================================================================
     BULLETS
  ================================================================ */
  function _shoot() {
    if (_shootTimer > 0 || !_player || _gameOver || _paused) return;
    const cd = BASE_SHOOT_CD * (1 - Math.min(0.6, _skills.rapidFire || 0));
    _shootTimer = cd;
    _sfxShoot();
    const cx = _player.x + _player.w / 2;
    const by = _player.y + 4;
    const shots = 1 + (_skills.extraBullets || 0);
    const spreads = [0, -14, 14, -26, 26];
    for (let i = 0; i < shots; i++) {
      const ang = (spreads[i] || 0) * Math.PI / 180;
      _bullets.push({
        x: cx - BLT_W / 2 + Math.sin(ang) * 10,
        y: by,
        w: BLT_W, h: BLT_H,
        dx: Math.sin(ang) * BLT_SPEED,
        dy: -BLT_SPEED,
        damage: 1 * (1 + (_skills.damageMult || 0))
      });
    }
  }
  function _updateBullets(dt) {
    const H = _canvas.height;
    _bullets = _bullets.filter(b => {
      b.x += b.dx * dt;
      b.y += b.dy * dt;
      return b.y + b.h > -20;
    });
    _enemyBullets = _enemyBullets.filter(b => {
      b.x += b.dx * dt;
      b.y += b.dy * dt;
      return b.y < H + 20;
    });
  }
  function _drawBullets() {
    const ctx = _ctx;
    ctx.shadowColor = '#88ffff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#00ffff';
    for (const b of _bullets) ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ff6600';
    for (const b of _enemyBullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  /* ================================================================
     ENEMIES
  ================================================================ */
  const ENEMY_DEFS = {
    basic:   { w:34, h:30, hp:1,  speed:80,  color:'#ff4444', glow:'#ff2200', score:10,  essenceDrop:1, coreDrop:0, shootProb:0,   shootCD:3   },
    zigzag:  { w:34, h:30, hp:2,  speed:72,  color:'#ff8800', glow:'#ff5500', score:20,  essenceDrop:2, coreDrop:0, shootProb:0.3, shootCD:2.5 },
    tank:    { w:46, h:40, hp:5,  speed:44,  color:'#9900cc', glow:'#6600aa', score:50,  essenceDrop:4, coreDrop:1, shootProb:0.4, shootCD:2.2 },
    shooter: { w:30, h:30, hp:2,  speed:58,  color:'#cc3300', glow:'#aa2200', score:30,  essenceDrop:2, coreDrop:0, shootProb:0.9, shootCD:1.4 },
    boss:    { w:82, h:64, hp:20, speed:32,  color:'#7700ee', glow:'#4400bb', score:300, essenceDrop:15,coreDrop:3, shootProb:1.0, shootCD:1.1 }
  };

  function _spawnWave(waveNum) {
    const W = _canvas.width;
    _enemies = [];
    _wave = waveNum;
    _sfxWave();

    if (waveNum === TOTAL_WAVES) {
      const d = ENEMY_DEFS.boss;
      _enemies.push({
        x: W / 2 - d.w / 2, y: -d.h - 30,
        w: d.w, h: d.h, hp: d.hp, maxHp: d.hp,
        type: 'boss', def: d, dy: d.speed, patternTimer: 0,
        shootTimer: 1.5, hitFlash: 0
      });
      return;
    }

    const basicCount   = 3 + waveNum * 2;
    const zigzagCount  = Math.max(0, waveNum - 1);
    const tankCount    = Math.floor(waveNum / 2);
    const shooterCount = waveNum > 2 ? 2 : 0;
    const roster = [];
    for (let i = 0; i < basicCount; i++)   roster.push('basic');
    for (let i = 0; i < zigzagCount; i++)  roster.push('zigzag');
    for (let i = 0; i < tankCount; i++)    roster.push('tank');
    for (let i = 0; i < shooterCount; i++) roster.push('shooter');

    roster.forEach((type, idx) => {
      const d = ENEMY_DEFS[type];
      const col = idx % 5;
      const row = Math.floor(idx / 5);
      const spacing = 62;
      const totalW = spacing * 4 + d.w;
      const offsetX = (W - totalW) / 2;
      _enemies.push({
        x: offsetX + col * spacing,
        y: -90 - row * 60,
        w: d.w, h: d.h, hp: d.hp, maxHp: d.hp,
        type, def: d, dy: d.speed,
        patternTimer: Math.random() * Math.PI * 2,
        shootTimer: d.shootCD + Math.random() * 1.8,
        hitFlash: 0
      });
    });
  }

  function _updateEnemies(dt) {
    const W = _canvas.width, H = _canvas.height;
    for (const e of _enemies) {
      e.patternTimer += dt;
      if (e.hitFlash > 0) e.hitFlash -= dt;

      if (e.type === 'zigzag') {
        e.x += Math.sin(e.patternTimer * 2.2) * e.def.speed * 0.85 * dt;
        e.x = Math.max(0, Math.min(W - e.w, e.x));
      } else if (e.type === 'boss') {
        e.x += Math.sin(e.patternTimer * 0.7) * e.def.speed * dt;
        e.x = Math.max(0, Math.min(W - e.w, e.x));
      }
      e.y += e.dy * dt;

      if (e.def.shootProb > 0) {
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && e.y > 0) {
          e.shootTimer = e.def.shootCD + Math.random() * 1.2;
          if (Math.random() < e.def.shootProb) {
            const bx = e.x + e.w / 2;
            const by = e.y + e.h;
            const spread = e.type === 'boss' ? 3 : 1;
            for (let i = 0; i < spread; i++) {
              const ang = (i - Math.floor(spread / 2)) * 0.28;
              _enemyBullets.push({ x: bx, y: by, dx: Math.sin(ang) * ENEM_BLT_SPEED, dy: ENEM_BLT_SPEED });
            }
          }
        }
      }
    }
    _enemies = _enemies.filter(e => e.y < H + 120);
  }

  function _drawEnemies() {
    const ctx = _ctx;
    for (const e of _enemies) {
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      const flash = e.hitFlash > 0;

      ctx.shadowColor = flash ? '#ffffff' : e.def.glow;
      ctx.shadowBlur = flash ? 22 : 14;

      if (e.type === 'boss') {
        ctx.fillStyle = flash ? '#ffffff' : e.def.color;
        ctx.beginPath();
        ctx.moveTo(cx, e.y + 5);
        ctx.lineTo(e.x + e.w - 5, cy);
        ctx.lineTo(cx, e.y + e.h - 5);
        ctx.lineTo(e.x + 5, cy);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = flash ? '#ffaaff' : '#cc88ff';
        ctx.beginPath();
        ctx.moveTo(cx, e.y + 20);
        ctx.lineTo(e.x + e.w - 20, cy);
        ctx.lineTo(cx, e.y + e.h - 20);
        ctx.lineTo(e.x + 20, cy);
        ctx.closePath();
        ctx.fill();
      } else if (e.type === 'tank') {
        ctx.fillStyle = flash ? '#ffffff' : e.def.color;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2 - Math.PI / 6;
          const r = Math.min(e.w, e.h) / 2 - 3;
          if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = flash ? '#ffffff' : e.def.color;
        ctx.beginPath();
        ctx.moveTo(cx, e.y + e.h - 3);
        ctx.lineTo(e.x + 4, e.y + 5);
        ctx.lineTo(cx, e.y + 12);
        ctx.lineTo(e.x + e.w - 4, e.y + 5);
        ctx.closePath();
        ctx.fill();
      }

      ctx.shadowBlur = 0;

      // HP bars removed
    }
    ctx.lineWidth = 1;
  }

  /* ================================================================
     COLLECTIBLES (drop from defeated enemies)
  ================================================================ */
  function _spawnCollectible(x, y, type) {
    _collectibles.push({
      x, y, type,
      vy: 55 + Math.random() * 35,
      life: 7, timer: 0,
      size: type === 'core' ? 10 : 7,
      angle: Math.random() * Math.PI * 2
    });
  }
  function _updateCollectibles(dt) {
    const H = _canvas.height;
    const magnetRange = _skills.magnetRange || 0;
    _collectibles = _collectibles.filter(c => {
      c.y += c.vy * dt;
      c.timer += dt;
      c.angle += dt * 2.5;

      // Magnet skill: auto-attract to player
      if (magnetRange > 0 && _player) {
        const px = _player.x + _player.w / 2;
        const py = _player.y + _player.h / 2;
        const dist = Math.hypot(c.x - px, c.y - py);
        if (dist < magnetRange && dist > 2) {
          const spd = 280;
          c.x += (px - c.x) / dist * spd * dt;
          c.y += (py - c.y) / dist * spd * dt;
        }
      }

      if (c.timer > c.life || c.y > H + 30) return false;

      // Player pickup
      if (_player) {
        const pr = { x: c.x - 16, y: c.y - 16, w: 32, h: 32 };
        if (_rectsOverlap(pr, _player)) {
          if (c.type === 'essence') { _essenceEarned++; _score += 5; }
          else if (c.type === 'core') { _coresEarned++; _score += 20; }
          _sfxCollect();
          _spawnParticles(c.x, c.y, c.type === 'core' ? '#44ff88' : '#4488ff', 6, 80);
          _showFloatingText(c.x, c.y, c.type === 'core' ? '+💎 Core' : '+⚡', c.type === 'core' ? '#44ff88' : '#88aaff');
          return false;
        }
      }
      return true;
    });
  }
  function _drawCollectibles() {
    const ctx = _ctx;
    for (const c of _collectibles) {
      const alpha = c.timer > c.life - 1.5 ? (c.life - c.timer) / 1.5 : 1;
      ctx.globalAlpha = alpha;
      const col = c.type === 'core' ? '#44ff88' : '#4488ff';
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(c.x - c.size * 0.28, c.y - c.size * 0.28, c.size * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  /* ================================================================
     PARTICLES + FLOATING TEXT
  ================================================================ */
  let _floatingTexts = [];
  function _spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < (count || 8); i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = (Math.random() * 0.6 + 0.4) * (speed || 100);
      _particles.push({ x, y, color, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.5 + Math.random() * 0.4, maxLife: 0.9, size: 3 + Math.random() * 2 });
    }
  }
  function _spawnExplosion(x, y, big) {
    const count = big ? 22 : 10;
    const cols = ['#ff4400', '#ffaa00', '#ff8800', '#ffff00'];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 70 + Math.random() * (big ? 200 : 110);
      _particles.push({ x, y, color: cols[Math.floor(Math.random() * cols.length)], vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.5 + Math.random() * 0.55, maxLife: 1.05, size: big ? 5 : 3 });
    }
  }
  function _showFloatingText(x, y, text, color) {
    _floatingTexts.push({ x, y, text, color: color || '#ffffff', life: 1.1, timer: 0, vy: -55 });
  }
  function _updateParticles(dt) {
    _particles = _particles.filter(p => {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.91; p.vy *= 0.91;
      p.life -= dt;
      return p.life > 0;
    });
    _floatingTexts = _floatingTexts.filter(t => {
      t.y += t.vy * dt; t.timer += dt; t.life -= dt;
      return t.life > 0;
    });
  }
  function _drawParticles() {
    const ctx = _ctx;
    for (const p of _particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    for (const t of _floatingTexts) {
      ctx.globalAlpha = Math.min(1, t.life / 0.4);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  /* ================================================================
     COLLISION DETECTION
  ================================================================ */
  function _rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function _checkCollisions() {
    if (!_player) return;

    // Player bullets vs enemies
    for (const b of _bullets) {
      if (b.y < -20) continue;
      const br = { x: b.x, y: b.y, w: b.w, h: b.h };
      for (const e of _enemies) {
        if (_rectsOverlap(br, e)) {
          e.hp -= b.damage;
          e.hitFlash = 0.12;
          b.y = -9999;
          _spawnParticles(b.x + b.w / 2, b.y + b.h / 2, '#ffaaff', 4, 60);
          if (e.hp <= 0) {
            _score += e.def.score;
            _spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, e.type === 'boss');
            _sfxExplode();
            if (e.type === 'boss') _showFloatingText(e.x + e.w / 2, e.y, '★ BOSS DOWN! ★', '#ffff00');
            for (let i = 0; i < e.def.essenceDrop; i++) {
              if (Math.random() < 0.7) _spawnCollectible(e.x + Math.random() * e.w, e.y + e.h / 2, 'essence');
            }
            for (let i = 0; i < e.def.coreDrop; i++) {
              if (Math.random() < 0.85) _spawnCollectible(e.x + e.w / 2, e.y + e.h / 2, 'core');
            }
            e.hp = -9999;
          }
          break;
        }
      }
    }
    _enemies = _enemies.filter(e => e.hp > -100);
    _bullets  = _bullets.filter(b => b.y > -1000);

    // Enemy bullets vs player
    if (!_player.invuln) {
      for (const b of _enemyBullets) {
        const br = { x: b.x - 4, y: b.y - 4, w: 8, h: 8 };
        if (_rectsOverlap(br, _player)) {
          b.y = 99999;
          _hitPlayer();
          break;
        }
      }
    }
    _enemyBullets = _enemyBullets.filter(b => b.y < 9999);

    // Enemies vs player (collision)
    if (!_player.invuln) {
      for (const e of _enemies) {
        if (_rectsOverlap(e, _player)) {
          _hitPlayer();
          e.hp -= 2;
          if (e.hp <= 0) { e.hp = -9999; _spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, false); }
          break;
        }
      }
    }
  }

  function _hitPlayer() {
    if (!_player) return;
    if (_player.shield > 0) {
      _player.shield--;
      _sfxHit();
      _player.invuln = true;
      _player.invulnTimer = 0.8;
      _showFloatingText(_player.x + _player.w / 2, _player.y, 'SHIELD', '#00ffff');
      return;
    }
    _player.lives--;
    _sfxDie();
    _spawnExplosion(_player.x + _player.w / 2, _player.y + _player.h / 2, false);
    if (_player.lives <= 0) {
      _player.lives = 0;
      _gameOver = true;
    } else {
      _player.invuln = true;
      _player.invulnTimer = INVULN_TIME;
      _player.shield = _skills.shield ? 1 : 0;
      _showFloatingText(_player.x + _player.w / 2, _player.y, '💔 ' + _player.lives + ' LIVES', '#ff4444');
    }
  }

  /* ================================================================
     BOMB (screen-clear special)
  ================================================================ */
  function _useBomb() {
    if (_bombCount <= 0 || _paused || _gameOver) return;
    _bombCount--;
    _sfxBomb();
    for (const e of _enemies) {
      if (e.type !== 'boss') {
        _score += e.def.score;
        _spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, false);
      } else {
        e.hp -= 5;
      }
    }
    _enemies = _enemies.filter(e => e.type === 'boss');
    _enemyBullets = [];
    for (let i = 0; i < 14; i++) {
      setTimeout(() => {
        if (_canvas) _spawnExplosion(Math.random() * _canvas.width, Math.random() * _canvas.height * 0.7, false);
      }, i * 40);
    }
    _showFloatingText(_canvas.width / 2, _canvas.height / 2, '💣 BOMB!', '#ffaa00');
  }

  /* ================================================================
     HUD
  ================================================================ */
  function _drawHUD() {
    if (!_ctx || !_canvas) return;
    const ctx = _ctx;
    const W = _canvas.width, H = _canvas.height;

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left';

    // Score
    ctx.fillStyle = '#00ffff';
    ctx.fillText('SCORE: ' + _score, 12, 24);
    ctx.fillText('WAVE: ' + _wave + ' / ' + TOTAL_WAVES, 12, 44);

    // Lives (droplet icons)
    ctx.fillStyle = '#aaa';
    ctx.fillText('LIVES', 12, 66);
    for (let i = 0; i < MAX_LIVES; i++) {
      const alive = _player && i < _player.lives;
      ctx.fillStyle = alive ? '#00aaff' : 'rgba(0,100,180,0.25)';
      ctx.shadowColor = alive ? 'rgba(0,180,255,0.6)' : 'none';
      ctx.shadowBlur = alive ? 6 : 0;
      const hx = 62 + i * 18;
      ctx.beginPath();
      ctx.moveTo(hx + 6, 53);
      ctx.bezierCurveTo(hx + 12, 59, hx + 12, 65, hx + 6, 69);
      ctx.bezierCurveTo(hx, 65, hx, 59, hx + 6, 53);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Shield indicator
    if (_player && _player.shield > 0) {
      ctx.fillStyle = '#00ffff';
      ctx.fillText('🛡 SHIELD', 12, 88);
    }

    // Collectibles earned
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#4488ff';
    ctx.fillText('⚡ ' + _essenceEarned, 12, H - 36);
    ctx.fillStyle = '#44ff88';
    ctx.fillText('💎 ' + _coresEarned, 12, H - 16);

    // Bombs
    if (_bombCount > 0) {
      ctx.fillStyle = '#ffaa00';
      ctx.textAlign = 'right';
      ctx.fillText('💣 x' + _bombCount + '  [X]', W - 12, H - 16);
    }

    // Wave clear banner
    if (_waveClearing) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 28px monospace';
      ctx.fillStyle = '#ffff00';
      ctx.shadowColor = '#ffff00';
      ctx.shadowBlur = 24;
      const msg = _wave >= TOTAL_WAVES ? 'ALL WAVES CLEARED! 🏆' : 'WAVE ' + _wave + ' CLEARED!';
      ctx.fillText(msg, W / 2, H / 2);
      ctx.shadowBlur = 0;
    }
  }

  /* ================================================================
     PAUSE SCREEN
  ================================================================ */
  function _togglePause() {
    if (_gameOver) return;
    _paused = !_paused;
    if (_paused) {
      _pauseOverlay = document.createElement('div');
      _pauseOverlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,20,0.78);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;font-family:monospace;';
      _pauseOverlay.innerHTML = `
        <div style="color:#00ffff;font-size:clamp(20px,4vw,32px);font-weight:900;letter-spacing:5px;text-shadow:0 0 16px #00ffff;margin-bottom:28px;">⏸ PAUSED</div>
        <button id="ad2d-resume" style="margin:8px;padding:12px 44px;background:rgba(0,255,255,0.07);border:2px solid #00ffff;color:#00ffff;font-family:monospace;font-size:16px;letter-spacing:2px;cursor:pointer;border-radius:4px;">▶ RESUME</button>
        <button id="ad2d-exit" style="margin:8px;padding:12px 44px;background:rgba(255,50,50,0.07);border:2px solid #ff4444;color:#ff4444;font-family:monospace;font-size:16px;letter-spacing:2px;cursor:pointer;border-radius:4px;">✕ EXIT MINIGAME</button>
      `;
      _overlay.appendChild(_pauseOverlay);
      _pauseOverlay.querySelector('#ad2d-resume').onclick = () => _togglePause();
      _pauseOverlay.querySelector('#ad2d-exit').onclick   = () => _finish();
    } else {
      if (_pauseOverlay) { _pauseOverlay.remove(); _pauseOverlay = null; }
      _lastTime = performance.now();
    }
  }

  /* ================================================================
     RESULTS SCREEN
  ================================================================ */
  function _showResults() {
    if (!_overlay) return;
    const victory = _wave >= TOTAL_WAVES && !_gameOver;
    const res = document.createElement('div');
    res.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,20,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:15;color:#fff;font-family:monospace;text-align:center;padding:24px;box-sizing:border-box;';
    res.innerHTML = `
      <div style="font-size:clamp(22px,5vw,40px);font-weight:900;letter-spacing:4px;color:${victory ? '#ffff00' : '#ff4444'};text-shadow:0 0 22px currentColor;margin-bottom:18px;">${victory ? '🏆 VICTORY' : '💀 GAME OVER'}</div>
      <div style="font-size:clamp(13px,2.5vw,18px);line-height:2.2;margin-bottom:24px;">
        <div style="color:#00ffff;">SCORE: <b>${_score}</b></div>
        <div style="color:#aaa;">WAVES CLEARED: <b>${Math.min(_wave, TOTAL_WAVES)} / ${TOTAL_WAVES}</b></div>
        <div style="color:#4488ff;margin-top:8px;">⚡ ASTRAL ESSENCE: <b>+${_essenceEarned}</b></div>
        <div style="color:#44ff88;">💎 NEURAL CORES: <b>+${_coresEarned}</b></div>
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center;">
        <button id="ad2d-again" style="padding:11px 30px;background:rgba(0,255,255,0.07);border:2px solid #00ffff;color:#00ffff;font-family:monospace;font-size:15px;letter-spacing:2px;cursor:pointer;border-radius:4px;">PLAY AGAIN</button>
        <button id="ad2d-done" style="padding:11px 30px;background:rgba(255,100,50,0.07);border:2px solid #ff6644;color:#ff6644;font-family:monospace;font-size:15px;letter-spacing:2px;cursor:pointer;border-radius:4px;">EXIT</button>
      </div>
    `;
    _overlay.appendChild(res);
    res.querySelector('#ad2d-again').onclick = () => {
      _saveRewards();
      res.remove();
      _attachInput();
      _startGameLoop();
    };
    res.querySelector('#ad2d-done').onclick = () => _finish();
  }

  /* ================================================================
     INPUT
  ================================================================ */
  function _onKeyDown(e) {
    _keys[e.code] = true;
    if ((e.code === 'KeyX' || e.code === 'KeyB') && !_paused && !_gameOver) _useBomb();
    if (e.code === 'Escape') _togglePause();
    e.stopPropagation();
  }
  function _onKeyUp(e)   { _keys[e.code] = false; }

  function _onTouchStart(e) {
    if (e.changedTouches.length > 0) {
      const t = e.changedTouches[0];
      _touch.startX = t.clientX; _touch.startY = t.clientY;
      _touch.x = t.clientX; _touch.y = t.clientY;
      _touch.active = true;
    }
    e.preventDefault();
  }
  function _onTouchMove(e) {
    if (e.changedTouches.length > 0) {
      const t = e.changedTouches[0];
      _touch.x = t.clientX; _touch.y = t.clientY;
    }
    e.preventDefault();
  }
  function _onTouchEnd(e) {
    _touch.active = false;
    _touch.startX = _touch.x; _touch.startY = _touch.y;
    e.preventDefault();
  }
  function _attachInput() {
    window.addEventListener('keydown', _onKeyDown);
    window.addEventListener('keyup', _onKeyUp);
    if (_overlay) {
      _overlay.addEventListener('touchstart', _onTouchStart, { passive: false });
      _overlay.addEventListener('touchmove',  _onTouchMove,  { passive: false });
      _overlay.addEventListener('touchend',   _onTouchEnd,   { passive: false });
    }
  }
  function _detachInput() {
    window.removeEventListener('keydown', _onKeyDown);
    window.removeEventListener('keyup', _onKeyUp);
    if (_overlay) {
      _overlay.removeEventListener('touchstart', _onTouchStart);
      _overlay.removeEventListener('touchmove',  _onTouchMove);
      _overlay.removeEventListener('touchend',   _onTouchEnd);
    }
  }

  function _processInput(dt) {
    if (!_player || _paused || _gameOver || _waveClearing) return;
    const W = _canvas.width, H = _canvas.height;
    const spd = PLR_SPEED * (1 + (_skills.speedMult || 0));
    let dx = 0, dy = 0;

    if (_keys['ArrowLeft']  || _keys['KeyA']) dx -= 1;
    if (_keys['ArrowRight'] || _keys['KeyD']) dx += 1;
    if (_keys['ArrowUp']    || _keys['KeyW']) dy -= 1;
    if (_keys['ArrowDown']  || _keys['KeyS']) dy += 1;
    if (_keys['Space'] || _keys['KeyZ']) _shoot();

    if (_touch.active) {
      const tdx = _touch.x - _touch.startX;
      const tdy = _touch.y - _touch.startY;
      if (Math.abs(tdx) > 10) dx = tdx > 0 ? 1 : -1;
      if (Math.abs(tdy) > 10) dy = tdy > 0 ? 1 : -1;
      _shoot();
    } else {
      _shoot(); // auto-fire on non-touch
    }

    _player.x += dx * spd * dt;
    _player.y += dy * spd * dt;
    _player.x = Math.max(0, Math.min(W - _player.w, _player.x));
    _player.y = Math.max(0, Math.min(H - _player.h, _player.y));
  }

  /* ================================================================
     MAIN GAME LOOP
  ================================================================ */
  function _tick(ts) {
    if (!_active) return;
    _animId = requestAnimationFrame(_tick);
    const dt = Math.min((ts - _lastTime) / 1000, 0.05);
    _lastTime = ts;
    if (_paused) return;

    _gameTime += dt;
    _shootTimer = Math.max(0, _shootTimer - dt);

    if (_player) {
      _player.blinkTimer += dt;
      if (_player.invuln) {
        _player.invulnTimer -= dt;
        if (_player.invulnTimer <= 0) { _player.invuln = false; }
      }
    }

    _processInput(dt);
    _updateStars(dt);
    _updateBullets(dt);
    _updateEnemies(dt);
    _updateCollectibles(dt);
    _updateParticles(dt);
    if (!_gameOver && !_waveClearing) _checkCollisions();

    // Wave clear check
    if (!_waveClearing && !_gameOver && _enemies.length === 0 && _wave > 0) {
      _waveClearing = true;
      _waveClearTimer = WAVE_CLEAR_DELAY;
    }
    if (_waveClearing) {
      _waveClearTimer -= dt;
      if (_waveClearTimer <= 0) {
        _waveClearing = false;
        if (_wave >= TOTAL_WAVES) {
          _active = false;
          cancelAnimationFrame(_animId); _animId = null;
          _detachInput();
          _saveRewards();
          setTimeout(() => _showResults(), 300);
          return;
        }
        _spawnWave(_wave + 1);
      }
    }

    if (_gameOver) {
      _active = false;
      cancelAnimationFrame(_animId); _animId = null;
      _detachInput();
      _saveRewards();
      setTimeout(() => _showResults(), 900);
      return;
    }

    _render();
  }

  function _render() {
    if (!_ctx || !_canvas) return;
    const ctx = _ctx;
    const W = _canvas.width, H = _canvas.height;
    ctx.fillStyle = '#000818';
    ctx.fillRect(0, 0, W, H);
    _drawStars();
    _drawCollectibles();
    _drawParticles();
    _drawBullets();
    _drawEnemies();
    _drawPlayer();
    _drawHUD();
  }

  /* ================================================================
     SAVE REWARDS (accumulate until finish)
  ================================================================ */
  function _saveRewards() {
    if (typeof saveData !== 'undefined' && (_essenceEarned > 0 || _coresEarned > 0)) {
      saveData.astralEssence = (saveData.astralEssence || 0) + _essenceEarned;
      saveData.neuralCores   = (saveData.neuralCores   || 0) + _coresEarned;
      if (typeof saveSaveData === 'function') saveSaveData();
    }
    _essenceEarned = 0;
    _coresEarned = 0;
  }

  /* ================================================================
     START GAME LOOP (internal reset + kick-off)
  ================================================================ */
  function _startGameLoop() {
    _score = 0; _wave = 0;
    _essenceEarned = 0; _coresEarned = 0;
    _gameOver = false; _waveClearing = false;
    _waveClearTimer = 0; _shootTimer = 0; _gameTime = 0;
    _bullets = []; _enemyBullets = [];
    _enemies = []; _collectibles = [];
    _particles = []; _floatingTexts = [];
    _paused = false;
    _bombCount = _skills.startBombs || 0;
    _initPlayer();
    _initStars();
    _spawnWave(1 + (_skills.startWave || 0));
    _lastTime = performance.now();
    _active = true;
    _animId = requestAnimationFrame(_tick);
  }

  /* ================================================================
     FINISH (save & close overlay)
  ================================================================ */
  function _finish() {
    _active = false;
    if (_animId) { cancelAnimationFrame(_animId); _animId = null; }
    _detachInput();
    _saveRewards();

    if (typeof window.showNarratorLine === 'function') {
      const msg = _gameOver
        ? 'AIDA: "Organic instability detected. Synchronisation failed. Essence recovered: ' + (typeof saveData !== 'undefined' ? (saveData.astralEssence || 0) : 0) + '."'
        : 'AIDA: "Node purged. Synthesis continues. Astral Essence +' + (typeof saveData !== 'undefined' ? (saveData.astralEssence || 0) : 0) + '."';
      setTimeout(() => { try { window.showNarratorLine(msg, 4000); } catch(e) { console.warn('Narrator line failed:', e); } }, 800);
    }

    const overlayRef = _overlay;
    // Remove per-session resize listener to avoid accumulating listeners
    if (overlayRef && overlayRef._resizeHandler) {
      window.removeEventListener('resize', overlayRef._resizeHandler);
    }
    _overlay = _canvas = _ctx = _pauseOverlay = null;
    setTimeout(() => {
      if (overlayRef && overlayRef.parentNode) overlayRef.parentNode.removeChild(overlayRef);
      // Resume main game loop
      if (typeof animate === 'function' && !animationFrameId) {
        animationFrameId = requestAnimationFrame(animate);
      }
      // Force-resume camp world input in case _menuOpen was left true
      if (window.CampWorld && typeof window.CampWorld._forceResumeInput === 'function') {
        window.CampWorld._forceResumeInput();
      }
    }, 350);
  }

  /* ================================================================
     INTRO SCREEN
  ================================================================ */
  function _showIntro(onDone) {
    const intro = document.createElement('div');
    intro.style.cssText = 'position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,16,0.96);color:#00ffff;font-family:monospace;text-align:center;padding:32px;box-sizing:border-box;';
    intro.innerHTML = `
      <div style="font-size:clamp(24px,5vw,48px);font-weight:900;letter-spacing:6px;text-shadow:0 0 20px #00ffff,0 0 50px #0088ff;margin-bottom:18px;">ASTRAL DIVE</div>
      <div style="font-size:clamp(10px,1.8vw,15px);opacity:0.75;max-width:480px;line-height:2;margin-bottom:26px;">
        <b>ARROW KEYS / WASD</b> — move ship<br>
        <b>SPACE / Z</b> — shoot (or tap on mobile)<br>
        <b>X / B</b> — use bomb (if equipped)<br>
        <b>ESC</b> — pause / exit<br><br>
        <span style="color:#4488ff">⚡ Collect Astral Essence</span> — currency for Skill Tree<br>
        <span style="color:#44ff88">💎 Collect Neural Cores</span> — rare bonus rewards<br>
        <i style="opacity:0.5">Clear all ${TOTAL_WAVES} waves to win.</i>
      </div>
      <button id="ad2d-dive-btn" style="padding:14px 50px;font-size:18px;font-family:monospace;font-weight:900;background:transparent;border:2px solid #00ffff;color:#00ffff;cursor:pointer;letter-spacing:3px;text-shadow:0 0 10px #00ffff;box-shadow:0 0 20px #00ffff44;border-radius:4px;">DIVE IN</button>
    `;
    _overlay.appendChild(intro);
    const btn = intro.querySelector('#ad2d-dive-btn');
    btn.onmouseover = () => { btn.style.background = 'rgba(0,255,255,0.1)'; };
    btn.onmouseout  = () => { btn.style.background = 'transparent'; };
    btn.onclick = () => {
      intro.style.opacity = '0'; intro.style.transition = 'opacity 0.35s';
      setTimeout(() => { intro.remove(); onDone(); }, 360);
    };
  }

  /* ================================================================
     PUBLIC API
  ================================================================ */
  function start() {
    // Guard: if a session is still running with an active overlay, skip
    if (_active && _overlay) return;

    // Clean up any stale overlay from a previous session that wasn't fully removed
    const stale = document.getElementById('astral-dive-overlay');
    if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

    // Load minigame skill bonuses
    _skills = (typeof window.getMinigameSkillBonuses === 'function')
      ? window.getMinigameSkillBonuses()
      : {};

    // Build fullscreen overlay
    _overlay = document.createElement('div');
    _overlay.id = 'astral-dive-overlay';
    _overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000818;overflow:hidden;';

    _canvas = document.createElement('canvas');
    _canvas.style.cssText = 'width:100%;height:100%;display:block;';
    _canvas.width  = window.innerWidth;
    _canvas.height = window.innerHeight;
    _ctx = _canvas.getContext('2d');
    if (!_ctx) {
      console.error('[AstralDive] Failed to get 2D canvas context');
      return;
    }
    _overlay.appendChild(_canvas);

    // Pause button (top-right)
    const pauseBtn = document.createElement('button');
    pauseBtn.textContent = '⏸ PAUSE';
    pauseBtn.style.cssText = 'position:absolute;top:10px;right:12px;padding:6px 14px;background:rgba(0,0,0,0.52);border:1px solid rgba(0,255,255,0.4);color:#00ffff;font-family:monospace;font-size:13px;cursor:pointer;border-radius:4px;z-index:5;';
    pauseBtn.onclick = () => _togglePause();
    _overlay.appendChild(pauseBtn);

    document.body.appendChild(_overlay);

    const _resizeHandler = () => {
      if (!_canvas) return;
      _canvas.width  = window.innerWidth;
      _canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', _resizeHandler);
    // Store so _finish can remove it
    _overlay._resizeHandler = _resizeHandler;

    // Pause main game loop
    if (typeof animationFrameId !== 'undefined' && animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    // Release any frozen camp-world menu lock so controls resume after dive ends

    _attachInput();
    _showIntro(() => _startGameLoop());
  }

  /* ================================================================
     EXPOSE
  ================================================================ */
  window.AstralDive = { start };

})();
