// js/dopamine-system.js — Dopamine-driven level-up, fever mode & elastic damage numbers
// Loaded as a regular <script> before level-up-system.js.  Exposes window.DopamineSystem.

(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Time-dilation controller
  // -----------------------------------------------------------------------
  const TimeDilation = {
    _scale:       1.0,
    _targetScale: 1.0,
    _lerpSpeed:   4.0,

    /** Set the target time scale (0 = frozen, 1 = normal). */
    set(target, lerpSpeed) {
      this._targetScale = Math.max(0, Math.min(target, 2.0));
      if (lerpSpeed !== undefined) this._lerpSpeed = lerpSpeed;
    },

    /** Instantly snap time scale. */
    snap(value) {
      this._scale = this._targetScale = value;
    },

    /** Tick — returns the current time scale (call once per frame). */
    update(dt) {
      const diff = this._targetScale - this._scale;
      if (Math.abs(diff) < 0.001) {
        this._scale = this._targetScale;
      } else {
        this._scale += diff * Math.min(1, this._lerpSpeed * dt);
      }
      return this._scale;
    },

    get scale() { return this._scale; }
  };

  // -----------------------------------------------------------------------
  // Camera FX — zoom, DOF-like blur, chromatic aberration
  // -----------------------------------------------------------------------
  const CameraFX = {
    _baseZoom:    null,   // captured once
    _targetZoom:  null,
    _zoomLerp:    3.0,
    _aberration:  0,      // 0 – 1
    _dofBlur:     0,      // px for CSS backdrop-filter
    _overlay:     null,   // DOM overlay for post-fx
    _active:      false,

    /**
     * Initialise — call once from init() after camera is created.
     * @param {THREE.OrthographicCamera} camera
     */
    init(camera) {
      this._camera   = camera;
      this._baseZoom = camera.zoom;
      this._targetZoom = camera.zoom;

      // Create a transparent overlay for screen-space effects
      let overlay = document.getElementById('dopamine-fx-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'dopamine-fx-overlay';
        overlay.style.cssText =
          'position:fixed;top:0;left:0;width:100%;height:100%;' +
          'pointer-events:none;z-index:9998;transition:backdrop-filter 0.3s;';
        document.body.appendChild(overlay);
      }
      this._overlay = overlay;
      this._active = true;
    },

    /** Trigger a zoom-punch: quickly zoom out then smoothly return. */
    zoomPunch(factor, durationMs) {
      if (!this._camera) return;
      const cam = this._camera;
      this._targetZoom = this._baseZoom * factor;
      setTimeout(() => {
        this._targetZoom = this._baseZoom;
      }, durationMs || 400);
    },

    /** Apply chromatic aberration (0-1). Auto-fades out. */
    chromaticPulse(intensity, fadeMs) {
      this._aberration = Math.min(intensity, 1);
      const fadeStep = 16 / (fadeMs || 600);
      const fadeAberration = () => {
        this._aberration -= fadeStep;
        if (this._aberration > 0.01) requestAnimationFrame(fadeAberration);
        else this._aberration = 0;
      };
      requestAnimationFrame(fadeAberration);
    },

    /** Apply DOF-style blur (0 = none). Auto-fades. */
    dofPulse(blurPx, fadeMs) {
      this._dofBlur = blurPx;
      const fadeStep = 16 / (fadeMs || 500);
      const initial = blurPx;
      const fadeDOF = () => {
        this._dofBlur -= initial * fadeStep;
        if (this._dofBlur > 0.1) requestAnimationFrame(fadeDOF);
        else this._dofBlur = 0;
      };
      requestAnimationFrame(fadeDOF);
    },

    /** Per-frame update. */
    update(dt) {
      if (!this._active) return;

      // Smooth zoom
      const cam = this._camera;
      if (cam && this._targetZoom !== null) {
        cam.zoom += (this._targetZoom - cam.zoom) * Math.min(1, this._zoomLerp * dt);
        cam.updateProjectionMatrix();
      }

      // Overlay effects
      if (this._overlay) {
        const filters = [];
        if (this._dofBlur > 0.1) {
          filters.push('blur(' + this._dofBlur.toFixed(1) + 'px)');
        }
        this._overlay.style.backdropFilter = filters.length ? filters.join(' ') : 'none';
        this._overlay.style.webkitBackdropFilter = this._overlay.style.backdropFilter;

        // Chromatic aberration via box-shadow colour split
        if (this._aberration > 0.01) {
          const px = (this._aberration * 3).toFixed(1);
          this._overlay.style.boxShadow =
            'inset ' + px + 'px 0 0 rgba(255,0,0,0.15), ' +
            'inset -' + px + 'px 0 0 rgba(0,0,255,0.15)';
        } else {
          this._overlay.style.boxShadow = 'none';
        }
      }
    },

    reset() {
      if (this._camera) {
        this._camera.zoom = this._baseZoom || 1;
        this._camera.updateProjectionMatrix();
      }
      this._targetZoom = this._baseZoom;
      this._aberration = 0;
      this._dofBlur    = 0;
      if (this._overlay) {
        this._overlay.style.backdropFilter = 'none';
        this._overlay.style.boxShadow      = 'none';
      }
    }
  };

  // -----------------------------------------------------------------------
  // Level-up FX — cinematic camera + time dilation on level-up
  // -----------------------------------------------------------------------
  const LevelUpFX = {
    /**
     * Play the level-up cinematic.
     * Call this BEFORE showing the upgrade modal.
     * @param {Function} onComplete  Called when the intro is done and modal should appear.
     */
    play(onComplete) {
      // Slow time dramatically
      TimeDilation.set(0.15, 6);

      // Camera zoom-out + chromatic aberration
      CameraFX.zoomPunch(0.85, 600);
      CameraFX.chromaticPulse(0.6, 800);
      CameraFX.dofPulse(2.5, 1000);

      // Screen flash
      const flash = document.getElementById('dopamine-fx-overlay');
      if (flash) {
        flash.style.background = 'radial-gradient(circle, rgba(255,255,200,0.3) 0%, transparent 70%)';
        setTimeout(() => { flash.style.background = 'none'; }, 300);
      }

      // Restore time after a delay, then show modal
      setTimeout(() => {
        TimeDilation.set(1.0, 3);
        if (onComplete) onComplete();
      }, 500);
    }
  };

  // -----------------------------------------------------------------------
  // Animated Collector Cards — improved upgrade card presentation
  // -----------------------------------------------------------------------
  const CollectorCards = {
    /**
     * Enhance upgrade card elements with collector-card animations.
     * Call after the upgrade modal DOM is populated.
     * @param {NodeList|Array} cardElements  The upgrade option DOM elements.
     */
    animateEntrance(cardElements) {
      if (!cardElements || cardElements.length === 0) return;

      const cards = Array.from(cardElements);
      cards.forEach((card, i) => {
        // Initial state
        card.style.opacity   = '0';
        card.style.transform = 'scale(0.6) rotateY(15deg) translateY(40px)';
        card.style.transition = 'none';

        // Stagger reveal
        setTimeout(() => {
          card.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
          card.style.opacity   = '1';
          card.style.transform = 'scale(1) rotateY(0deg) translateY(0)';
        }, 80 + i * 120);
      });
    },

    /**
     * Play a "selected" animation on a card and dim others.
     * @param {HTMLElement} selected  The chosen card element.
     * @param {NodeList|Array} allCards
     * @param {Function} onComplete
     */
    animateSelection(selected, allCards, onComplete) {
      const cards = Array.from(allCards);
      cards.forEach(card => {
        if (card === selected) {
          card.style.transition = 'all 0.35s cubic-bezier(0.22, 1, 0.36, 1)';
          card.style.transform  = 'scale(1.15)';
          card.style.boxShadow  = '0 0 30px rgba(255,215,0,0.8)';
          card.style.zIndex     = '10';
        } else {
          card.style.transition = 'all 0.25s ease-out';
          card.style.opacity    = '0.3';
          card.style.transform  = 'scale(0.9) translateY(10px)';
          card.style.filter     = 'grayscale(0.6)';
        }
      });

      setTimeout(() => {
        if (onComplete) onComplete();
      }, 400);
    }
  };

  // -----------------------------------------------------------------------
  // Elastic Damage Numbers — spring-physics floating text for crits
  // -----------------------------------------------------------------------
  const ElasticNumbers = {
    _numbers: [],

    /**
     * Spawn an elastic damage number.
     * @param {number} amount     Damage value.
     * @param {{ x: number, y: number, z: number }} worldPos  3D position.
     * @param {THREE.Camera}  camera
     * @param {boolean}       isCrit
     * @param {boolean}       isHeadshot
     */
    spawn(amount, worldPos, camera, isCrit, isHeadshot) {
      const entry = {
        amount:    Math.floor(amount),
        x:         0, y: 0,        // screen coords (set below)
        vy:        isCrit ? -220 : -150,  // upward velocity (px/s)
        scaleVel:  isCrit ? 1.8 : 0,       // spring velocity
        scale:     isCrit ? 1.6 : 1.0,     // current scale
        targetScale: 1.0,
        opacity:   1,
        life:      0,
        maxLife:   isCrit ? 1.2 : 0.9,
        isCrit:    isCrit,
        isHeadshot: isHeadshot,
        el:        null
      };

      // Project 3D → 2D
      const pos = new THREE.Vector3(worldPos.x, worldPos.y + 1.5, worldPos.z);
      pos.project(camera);
      entry.x = (pos.x *  0.5 + 0.5) * window.innerWidth;
      entry.y = (pos.y * -0.5 + 0.5) * window.innerHeight;

      // Create DOM element
      const el = document.createElement('div');
      el.className = 'elastic-damage-number';
      el.textContent = entry.isCrit
        ? (entry.isHeadshot ? '💀 ' : '⚡ ') + entry.amount
        : String(entry.amount);

      if (isHeadshot)   el.classList.add('headshot');
      else if (isCrit)  el.classList.add('critical');

      el.style.left = entry.x + 'px';
      el.style.top  = entry.y + 'px';
      document.body.appendChild(el);
      entry.el = el;

      this._numbers.push(entry);
    },

    /** Per-frame update — spring physics on scale, float up, fade out. */
    update(dt) {
      for (let i = this._numbers.length - 1; i >= 0; i--) {
        const n = this._numbers[i];
        n.life += dt;

        if (n.life >= n.maxLife) {
          if (n.el && n.el.parentNode) n.el.parentNode.removeChild(n.el);
          this._numbers.splice(i, 1);
          continue;
        }

        // Float up
        n.y += n.vy * dt;
        n.vy *= 0.97; // drag

        // Spring physics for scale (crits bounce)
        if (n.isCrit) {
          const springK = 180, dampC = 12;
          const force = springK * (n.targetScale - n.scale) - dampC * n.scaleVel;
          n.scaleVel += force * dt;
          n.scale    += n.scaleVel * dt;
        }

        // Fade out in last 30%
        const t = n.life / n.maxLife;
        n.opacity = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;

        // Apply to DOM
        if (n.el) {
          n.el.style.transform = 'translate(-50%, -50%) scale(' + n.scale.toFixed(2) + ')';
          n.el.style.left    = n.x + 'px';
          n.el.style.top     = n.y + 'px';
          n.el.style.opacity = n.opacity.toFixed(2);
        }
      }
    },

    /** Clear all active numbers (e.g. on reset). */
    clear() {
      for (let i = 0; i < this._numbers.length; i++) {
        const n = this._numbers[i];
        if (n.el && n.el.parentNode) n.el.parentNode.removeChild(n.el);
      }
      this._numbers.length = 0;
    }
  };

  // -----------------------------------------------------------------------
  // Fever Mode — pulsing HUD + lighting when combo is high
  // -----------------------------------------------------------------------
  const FeverMode = {
    _active:    false,
    _intensity: 0,      // 0 – 1
    _hue:       0,
    _overlay:   null,

    /** Activate fever mode at a given intensity (0 – 1). */
    activate(intensity) {
      this._active    = true;
      this._intensity = Math.min(1, intensity);
      if (!this._overlay) {
        let el = document.getElementById('fever-overlay');
        if (!el) {
          el = document.createElement('div');
          el.id = 'fever-overlay';
          el.style.cssText =
            'position:fixed;top:0;left:0;width:100%;height:100%;' +
            'pointer-events:none;z-index:9990;opacity:0;' +
            'transition:opacity 0.3s;mix-blend-mode:screen;';
          document.body.appendChild(el);
        }
        this._overlay = el;
      }
    },

    /** Deactivate fever mode (smooth fade-out). */
    deactivate() {
      this._active = false;
    },

    /** Per-frame update. */
    update(dt) {
      if (this._active) {
        this._hue = (this._hue + dt * 120) % 360;  // rotate hue
        const alpha = (0.06 * this._intensity).toFixed(3);
        if (this._overlay) {
          this._overlay.style.opacity = '1';
          this._overlay.style.background =
            'radial-gradient(circle at 50% 50%, ' +
            'hsla(' + Math.round(this._hue) + ',100%,60%,' + alpha + ') 0%, transparent 70%)';
        }
        // Pulse HUD elements
        const hud = document.getElementById('hud');
        if (hud) {
          const pulse = Math.sin(performance.now() * 0.008) * 0.5 + 0.5;
          hud.style.filter = 'brightness(' + (1 + pulse * 0.15 * this._intensity).toFixed(2) + ')';
        }
      } else {
        // Fade out
        if (this._overlay) this._overlay.style.opacity = '0';
        const hud = document.getElementById('hud');
        if (hud) hud.style.filter = 'none';
        this._intensity *= 0.95;
      }
    },

    reset() {
      this._active = false;
      this._intensity = 0;
      if (this._overlay) this._overlay.style.opacity = '0';
      const hud = document.getElementById('hud');
      if (hud) hud.style.filter = 'none';
    }
  };

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------
  window.DopamineSystem = {
    TimeDilation:   TimeDilation,
    CameraFX:       CameraFX,
    LevelUpFX:      LevelUpFX,
    CollectorCards:  CollectorCards,
    ElasticNumbers:  ElasticNumbers,
    FeverMode:       FeverMode
  };
})();
