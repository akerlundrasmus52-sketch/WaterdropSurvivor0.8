// js/object-pool.js — Global ObjectPool for reusable Three.js meshes.
// Eliminates GC pressure from frequent geometry/material disposal during combat.
// Exposed as window.GameObjectPool — loaded before projectile-classes.js and game-loop.js.
//
// CRITICAL: Does NOT remove or alter geometries/materials. Meshes are hidden and
// returned to the pool instead of being disposed, eliminating GC stutter spikes.

window.GameObjectPool = (function () {
  'use strict';

  // ── Bullet Trail Pool ─────────────────────────────────────────────────────
  // Tiny sphere meshes dropped every 3 frames by each active projectile.
  // Previously: new SphereGeometry + new MeshBasicMaterial + dispose() every 150ms.
  // Now: a fixed set of meshes is reused — geometry/material live for the session.

  const _trailPool   = [];
  const TRAIL_POOL_MAX = 150; // supports ~16 simultaneous bullets firing at max rate

  function _makeTrailMesh() {
    const geo  = new THREE.SphereGeometry(0.035, 4, 4);
    const mat  = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, color: 0xffffff });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    return { mesh };
  }

  /**
   * Acquire a trail dot mesh from the pool (or create one if the pool is empty).
   * @param {number} color  - Hex colour (e.g. 0xFF2200 or bullet colour).
   * @param {THREE.Vector3} position - World position for this frame.
   * @returns {{ mesh: THREE.Mesh }}
   */
  function getTrail(color, position) {
    const entry = _trailPool.pop() || _makeTrailMesh();
    entry.mesh.material.color.setHex(color);
    entry.mesh.material.opacity = 0.55;
    entry.mesh.position.copy(position);
    entry.mesh.visible = true;
    return entry;
  }

  /**
   * Return a trail dot back to the pool.  geometry/material are NOT disposed.
   * @param {{ mesh: THREE.Mesh }} entry
   */
  function releaseTrail(entry) {
    entry.mesh.visible = false;
    if (_trailPool.length < TRAIL_POOL_MAX) {
      _trailPool.push(entry);
    }
    // If the pool is already full the mesh is simply orphaned (no dispose).
    // The THREE.js GC cost for a single abandoned mesh is negligible and
    // happens far less often than the constant create/dispose cycle it replaces.
  }

  // ── Meat Chunk Pool ───────────────────────────────────────────────────────
  // Flying gore pieces created on shotgun/explosive deaths (30 chunks per kill).
  // Previously: new geometry + new material, then geo.dispose() + mat.dispose()
  // after the ~1.5-2 second flight animation.
  // Now: chunks are removed from the scene but held in the pool, then reused.

  const _chunkPool     = [];
  const CHUNK_POOL_MAX  = 180; // 6 simultaneous shotgun deaths × 30 chunks each
  const CHUNK_RETURN_DELAY_MS = 5000; // wait 5 s after animation ends before pooling

  function _makeChunkEntry(isBox, size, color) {
    const geo  = isBox
      ? new THREE.BoxGeometry(size * 1.2, size * 0.8, size)
      : new THREE.SphereGeometry(size, 5, 4);
    const mat  = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    return { mesh, geo, mat };
  }

  /**
   * Acquire a chunk entry from the pool.  If the pool is empty a new mesh is created.
   * @param {boolean} isBox       - true → BoxGeometry, false → SphereGeometry.
   * @param {number}  size        - Base size (radius / half-extent) of the chunk.
   * @param {number}  color       - Hex colour.
   * @param {THREE.Vector3} position - Initial world position.
   * @returns {{ mesh: THREE.Mesh, geo: THREE.BufferGeometry, mat: THREE.Material }}
   */
  function getChunk(isBox, size, color, position) {
    const entry = _chunkPool.pop() || _makeChunkEntry(isBox, size, color);
    entry.mat.color.setHex(color);
    entry.mat.opacity = 0.95;
    entry.mesh.position.copy(position);
    entry.mesh.rotation.set(0, 0, 0);
    entry.mesh.scale.setScalar(1);
    entry.mesh.visible = true;
    return entry;
  }

  /**
   * Return a chunk to the pool after a 5-second delay so GC work is deferred
   * away from the busy death-animation window.  geometry/material are NOT disposed.
   * @param {{ mesh: THREE.Mesh, geo, mat }} entry
   */
  function releaseChunk(entry) {
    entry.mesh.visible = false;
    setTimeout(function () {
      if (_chunkPool.length < CHUNK_POOL_MAX) {
        _chunkPool.push(entry);
      }
    }, CHUNK_RETURN_DELAY_MS);
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  /** Pre-warm the trail pool so the first firefight has no allocation cost. */
  function prewarm() {
    const TRAIL_PREWARM = 40;
    for (let i = _trailPool.length; i < TRAIL_PREWARM; i++) {
      _trailPool.push(_makeTrailMesh());
    }
  }

  return {
    getTrail,
    releaseTrail,
    getChunk,
    releaseChunk,
    prewarm,
    get trailPoolSize()  { return _trailPool.length;  },
    get chunkPoolSize()  { return _chunkPool.length;  }
  };
}());

// ── Enemy Object Pool ─────────────────────────────────────────────────────────
// Eliminates GC pressure caused by repeatedly creating / disposing Enemy meshes.
// Enemies that finish their death animation are hidden and parked at Y = -100
// instead of being scene.remove()'d and geometry.dispose()'d.  When a new enemy
// of the same type is needed, the parked instance is reset and reused.
//
// API:
//   window.enemyPool.acquireEnemy(type, x, z, level)
//       Returns a reset Enemy instance from the free list (or null if empty).
//   window.enemyPool._return(enemyInst)
//       Parks the enemy underground and pushes it onto the free list.

window.enemyPool = (function () {
  'use strict';

  const POOL_MAX_PER_TYPE = 20; // max parked enemies per type
  const _freeList = {};         // { [type]: Enemy[] }

  // Y position for parked enemies — well below any playfield geometry
  const PARK_Y = -100;

  /**
   * Attempt to acquire a pre-allocated Enemy of the given type.
   * Resets its position, HP/stats, visibility, and key AI flags.
   * Returns null when the free list for this type is empty.
   */
  function acquireEnemy(type, x, z, level) {
    const list = _freeList[type];
    if (!list || list.length === 0) return null;

    const enemy = list.pop();
    if (!enemy || !enemy.mesh) return null;

    // ── Restore gameplay state ────────────────────────────────────────────────
    enemy.isDead      = false;
    enemy.active      = true;
    enemy.isDamaged   = false;

    // ── Physics & Movement ───────────────────────────────────────────────────
    enemy._shotgunSlide        = null;
    enemy._playerVelocity      = { x: 0, z: 0 };
    enemy._lastPlayerPosValid  = false;
    // Clear stale extrapolation velocity so recycled enemies don't drift on
    // their first throttled frame with the old movement vector.
    enemy._lastMoveVX          = 0;
    enemy._lastMoveVZ          = 0;
    // Reset target rotation so throttle extrapolation uses the fresh spawn angle.
    enemy._targetRotY          = undefined;

    // ── Animation Timers ─────────────────────────────────────────────────────
    enemy._squishTimer         = 0;
    enemy._lastHitMeshTime     = 0;
    enemy._damageFlushTimer    = null;
    enemy._accumulatedDamage   = 0;
    enemy.lastAttackTime       = 0;
    enemy._aiTimer             = 0;
    enemy._lightningFlashTimer = null;
    enemy._droneShakeTimer     = null;
    enemy.lastDamageType       = null;
    // Reset blink animation so recycled enemies blink from a fresh state
    enemy.blinkTimer           = 0;
    enemy.isBlinking           = false;
    enemy.nextBlinkTime        = 1.5 + Math.random() * 3.5;
    // Reset head look-at interpolation so the head snaps to the correct forward
    // direction on first frame instead of tracking a stale target from last life.
    enemy._lerpedHeadTargetInit = false;

    // ── Gore / Visual State ──────────────────────────────────────────────────
    // Clear per-life gore flags so all critical-hit effects can trigger again.
    enemy._shotEye             = false;
    enemy._toreChunk           = false;
    enemy._decapitated         = false;
    enemy._charStartColor      = null;
    enemy._gutsExposed         = false;
    enemy._originalColor       = null;
    enemy._skipMainDeathAnim   = false;
    enemy._arterialSpurtFired  = false;
    enemy._inGeyserBleedout    = false;

    // ── Phasing State (level 60+ invincibility) ──────────────────────────────
    // Recycled enemies must not inherit the phasing state from their previous
    // life — _phaseIgnoreNext=true would make the first hit completely absorbed.
    enemy._isPhasing           = false;
    enemy._phaseIgnoreNext     = false;
    if (enemy._phaseClearTimer) {
      clearTimeout(enemy._phaseClearTimer);
      enemy._phaseClearTimer = null;
    }

    // ── Status Effects ───────────────────────────────────────────────────────
    enemy.isFrozen             = false;
    enemy.slowedUntil          = null;
    enemy._lightningFreezeUntil = null;
    enemy.frozenUntil          = null;
    enemy._freezeProgress      = 0;
    if (enemy.originalSpeed !== undefined) {
      enemy.speed = enemy.originalSpeed;
    }

    enemy.anatomy = { head: { hp: 100, attached: true },
                      torso: { hp: 100, attached: true },
                      base:  { hp: 100, attached: true } };

    // ── Per-type AI state timers ──────────────────────────────────────────────
    // These must be reset here because die() does not clear them, so a recycled
    // enemy would carry stale AI state from its previous life into the next run.
    enemy._deathThroeState      = false;  // prevents immediate death-throe VFX/audio
    enemy._deathThroeAudioTimer = 0;      // prevents instant scraping-audio trigger
    enemy._rangedShotTimer      = 0;      // prevents instant ranged fire on spawn
    enemy._annunakiTeleportTimer = 0;
    enemy._annunakiLaserTimer   = 0;
    enemy._annunakiLaserActive  = false;
    enemy._annunakiWarning      = false;
    enemy._rearingPhase         = 0;      // Daddy Longlegs rearing cycle
    enemy._rearingTimer         = 0;
    enemy._glitchTP             = 0;      // Source Glitch teleport accumulator
    enemy._gutsFrame            = 0;      // blood-drip frame counter
    // Clear any leaked freeze-shake interval (interval ref stored by die())
    if (enemy._shakeInterval) {
      clearInterval(enemy._shakeInterval);
      enemy._shakeInterval = null;
    }

    // Re-apply HP / speed / damage stats for the new player level
    const GE = window.GameEnemies;
    const GW = window.GameWorld;
    if (GE && GW) {
      const ls = GE.getEnemyLevelScaling(level);
      const stats = GE.getEnemyBaseStats(type, ls, GW.GAME_CONFIG.enemySpeedBase, level);
      Object.assign(enemy, stats);
    }
    // Sync originalSpeed to the freshly assigned stat speed so any previous
    // life's slow (e.g. death-throe halving) doesn't bleed into this one.
    enemy.originalSpeed = enemy.speed;

    // ── Restore mesh visibility and position ─────────────────────────────────
    const yPos = (type === 5 || type === 14 || type === 16 || type === 17) ? 2
               : (type === 11 ? 5 : (type === 19 ? 4 : (type === 20 ? 2 : 0.5)));
    enemy.mesh.position.set(x, yPos, z);
    // Face toward the player immediately so recycled enemies never appear backwards.
    const _pRef = window.player && window.player.mesh ? window.player.mesh.position : null;
    if (_pRef) {
      const _pdx = _pRef.x - x;
      const _pdz = _pRef.z - z;
      if (_pdx * _pdx + _pdz * _pdz > 0.01) {
        enemy.mesh.rotation.set(0, Math.atan2(_pdx, _pdz), 0);
      } else {
        enemy.mesh.rotation.set(0, 0, 0);
      }
    } else {
      enemy.mesh.rotation.set(0, 0, 0);
    }
    if (type === 11) {
      enemy.mesh.scale.set(1.8, 1.8, 1.8);
    } else {
      enemy.mesh.scale.set(1, 1, 1);
    }
    // ── Restore correct instancing mode ──────────────────────────────────────
    // When an instanced enemy (type 0, 1, 2) dies, die() calls scene.add(mesh)
    // and sets _usesInstancing=false so the death animation mesh is visible in
    // the scene.  On recycle we must undo that: remove the mesh from the scene
    // and restore _usesInstancing=true so rendering only goes through the
    // InstancedMesh batch.  Without this fix, recycled enemies are double-rendered
    // (regular scene mesh AND instanced batch at the same position), causing
    // Z-fighting, wrong colors, wrong size, and flickering every frame.
    const _enemyInstancingEnabled = window.ENEMY_INSTANCING_ENABLED === true;
    const _shouldUseInstancing = _enemyInstancingEnabled
      && (type === 0 || type === 1 || type === 2)
      && !!(window._instancedRenderer && window._instancedRenderer.active);
    if (_shouldUseInstancing && !enemy._usesInstancing) {
      // Mesh was added to scene during die() for the death animation — remove it.
      if (enemy.mesh.parent) enemy.mesh.parent.remove(enemy.mesh);
      enemy._usesInstancing = true;
    } else if (!_shouldUseInstancing && enemy._usesInstancing) {
      // Instancing no longer available (renderer disabled) — promote to regular mesh.
      if (typeof scene !== 'undefined' && scene && !enemy.mesh.parent) scene.add(enemy.mesh);
      enemy._usesInstancing = false;
    }
    enemy.mesh.visible = !enemy._usesInstancing;
    // Restore the original (non-disposed) material saved at construction time.
    // Damage events clone the shared material; die() disposes the clone — without
    // this restore, recycled enemies render black or invisible.
    if (enemy.defaultMaterial) {
      if (enemy.mesh.material !== enemy.defaultMaterial && !enemy.mesh.material._isShared && !enemy.mesh.material._isSpiderHitbox) {
        enemy.mesh.material.dispose();
      }
      enemy.mesh.material = enemy.defaultMaterial;
      enemy.mesh.material.needsUpdate = true;

      // CRITICAL FIX: Only mutate material properties if it's NOT shared
      // Shared materials are used by ALL enemies of the same type - mutating them
      // would break colors for all enemies on the map!
      if (!enemy.defaultMaterial._isShared && !enemy.defaultMaterial._isSpiderHitbox) {
        const _resetColorHex = window._ENEMY_COLORS ? (window._ENEMY_COLORS[type] !== undefined ? window._ENEMY_COLORS[type] : window._ENEMY_COLORS[0]) : 0x44AA44;
        const _emissiveIntensity = (type === 10 || type === 11) ? 0.3 : 0.15;
        enemy.defaultMaterial.color.setHex(_resetColorHex);
        enemy.defaultMaterial.transparent = (type === 18);
        enemy.defaultMaterial.opacity = (type === 18) ? 0.2 : 1.0;
        if (enemy.defaultMaterial.emissive) {
          enemy.defaultMaterial.emissive.setHex(_resetColorHex);
          enemy.defaultMaterial.emissiveIntensity = _emissiveIntensity;
        }
      }
    }

    // CRITICAL FIX: Restore base color for instanced enemies (types 0, 1, 2)
    // Instanced enemies use shared materials (white) but store their real color in
    // _baseColorHex. This must be restored when recycling so they render correctly.
    const _resetColorHex = window._ENEMY_COLORS ? (window._ENEMY_COLORS[type] !== undefined ? window._ENEMY_COLORS[type] : window._ENEMY_COLORS[0]) : 0x44AA44;
    enemy._baseColorHex = _resetColorHex;

    if (enemy.mesh.material && !enemy.mesh.material._isSpiderHitbox) {
      enemy.mesh.material.needsUpdate = true;
    }
    // Clear cached original color so it is re-captured on next freeze/damage
    enemy._originalColor = null;

    // ── Restore anatomy group visibility (hidden by dieGeyserRollover etc.) ──
    if (enemy.headGroup)  enemy.headGroup.visible  = true;
    if (enemy.torsoGroup) enemy.torsoGroup.visible = true;
    if (enemy.baseGroup)  enemy.baseGroup.visible  = true;

    // ── Restore headMesh transform — death/damage animations may have moved it ──
    // Reset position, scale, and rotation so the head sits correctly on the body.
    if (enemy.headMesh) {
      enemy.headMesh.visible = (type !== 15);
      enemy.headMesh.position.y = 0.95;
      enemy.headMesh.position.x = 0;
      enemy.headMesh.position.z = 0;
      enemy.headMesh.scale.set(1, 1, 1);
      enemy.headMesh.rotation.set(0, 0, 0);
    }
    // Sync the head-bob base Y to the restored head position.
    if (enemy._headGroupBaseY !== undefined) enemy._headGroupBaseY = 0.95;

    // ── Restore eyes for types that have them ─────────────────────────────────
    // die() nulls leftEye/rightEye but the eye meshes remain as children of
    // enemy.mesh (using shared geo/mat). Re-discover them so blink & tracking
    // animations work again. Also make them visible (die() hides them during fade).
    // After finding or recreating eyes, always reset their position/scale so that
    // damage-deformation or death-animation transforms don't carry over to the next life.
    const _eyeTypes = window.ENEMY_TYPES_WITH_EYES;
    const _eyeMat   = window.SHARED_EYE_MAT;
    if (_eyeTypes && _eyeTypes.has(type) && _eyeMat) {
      // Canonical eye layout for this type — single source of truth in enemy-class.js
      const _el = window.getEnemyEyeLayout ? window.getEnemyEyeLayout(type)
        : { scale: 0.85, yPos: 0.92, zPos: 0.42, xPos: 0.22 };

      // Scan mesh children to find the two eye meshes (identified by shared eye material)
      let _foundL = null, _foundR = null;
      for (let i = 0; i < enemy.mesh.children.length; i++) {
        const child = enemy.mesh.children[i];
        if (child.material === _eyeMat) {
          if (!_foundL) _foundL = child;
          else { _foundR = child; break; }
        }
      }
      if (_foundL && _foundR) {
        enemy.leftEye  = _foundL;
        enemy.rightEye = _foundR;
        _foundL.visible = true;
        _foundR.visible = true;
        // Fully reset eye transforms to canonical spawn values
        _foundL.scale.setScalar(_el.scale);
        _foundR.scale.setScalar(_el.scale);
        _foundL.position.set(-_el.xPos, _el.yPos, _el.zPos);
        _foundR.position.set( _el.xPos, _el.yPos, _el.zPos);
        _foundL.rotation.set(0, 0, 0);
        _foundR.rotation.set(0, 0, 0);
        // Ensure pupils are present as children of each eye
        const _pupilMat = window.SHARED_PUPIL_MAT;
        const _pupilGeo = window.SHARED_PUPIL_GEO;
        if (_pupilMat && _pupilGeo) {
          for (const _eye of [_foundL, _foundR]) {
            const _hasPupil = _eye.children.some(c => c.material === _pupilMat);
            if (!_hasPupil) {
              const _p = new THREE.Mesh(_pupilGeo, _pupilMat);
              _p.position.set(0, 0, 0.06);
              _eye.add(_p);
            }
          }
        }
      } else {
        // Fallback: recreate eyes if originals were lost
        const _eyeGeo = window.SHARED_EYE_GEO;
        if (_eyeGeo) {
          const _eyeL = new THREE.Mesh(_eyeGeo, _eyeMat);
          const _eyeR = new THREE.Mesh(_eyeGeo, _eyeMat);
          _eyeL.scale.setScalar(_el.scale);
          _eyeR.scale.setScalar(_el.scale);
          _eyeL.position.set(-_el.xPos, _el.yPos, _el.zPos);
          _eyeR.position.set( _el.xPos, _el.yPos, _el.zPos);
          // Add pupils to recreated eye meshes
          const _pupilMat = window.SHARED_PUPIL_MAT;
          const _pupilGeo = window.SHARED_PUPIL_GEO;
          if (_pupilMat && _pupilGeo) {
            const _pL = new THREE.Mesh(_pupilGeo, _pupilMat);
            const _pR = new THREE.Mesh(_pupilGeo, _pupilMat);
            _pL.position.set(0, 0, 0.06);
            _pR.position.set(0, 0, 0.06);
            _eyeL.add(_pL);
            _eyeR.add(_pR);
          }
          enemy.mesh.add(_eyeL);
          enemy.mesh.add(_eyeR);
          enemy.leftEye  = _eyeL;
          enemy.rightEye = _eyeR;
        }
      }
    } else {
      // Types without eyes: ensure references are null
      enemy.leftEye  = null;
      enemy.rightEye = null;
    }
    // Hide guts container for clean re-entry (it gets shown when torso HP drops)
    if (enemy._gutsContainer) {
      enemy._gutsContainer.visible = false;
      enemy._gutsContainer.rotation.set(0, 0, 0);
    }

    // ── Remove any lingering ice-crack overlay meshes ─────────────────────────
    if (enemy._iceCracks && enemy._iceCracks.length > 0) {
      for (const crack of enemy._iceCracks) {
        if (enemy.mesh) enemy.mesh.remove(crack);
        if (crack.geometry) crack.geometry.dispose();
        if (crack.material)  crack.material.dispose();
      }
      enemy._iceCracks = [];
    }

    // ── Restore blob shadow ───────────────────────────────────────────────────
    if (enemy.groundShadow) {
      enemy.groundShadow.position.set(x, 0.05, z);
      enemy.groundShadow.visible = true;
    }

    // ── Ensure anatomy sentinel disc is hidden for clean re-entry ────────────
    // die() restores _anatBaseMesh on the instance before returning to pool;
    // hide it here so it does not briefly appear before the enemy activates.
    if (enemy._anatBaseMesh) {
      enemy._anatBaseMesh.visible = false;
    }

    // ── Restore spider sprite (type 15) ──────────────────────────────────────
    // The death animation hides the sprite; restore it so the recycled enemy
    // is visible and playing the walk animation again.
    if (enemy._spiderSprite) {
      enemy._spiderSprite.visible = true;
      enemy._spiderSprite._dead   = false;
      enemy._spiderSprite.play('walk');
    }

    return enemy;
  }

  /**
   * Park a dead enemy underground and add it to the free list so it can be
   * reused by the next acquireEnemy() call for the same type.
   * Should be called after the death animation fully completes.
   */
  function _return(enemy) {
    if (!enemy || !enemy.mesh) return;

    // Cancel any pending damage-display timer to prevent it from firing against
    // a recycled enemy that has already been reset by acquireEnemy().
    if (enemy._damageFlushTimer) {
      clearTimeout(enemy._damageFlushTimer);
      enemy._damageFlushTimer = null;
    }
    enemy._accumulatedDamage = 0;

    // Move mesh underground and hide it (stays in Three.js scene graph to avoid
    // the cost of scene.remove + scene.add on every respawn cycle).
    enemy.mesh.position.set(0, PARK_Y, 0);
    enemy.mesh.visible = false;

    // Also hide the blob shadow
    if (enemy.groundShadow) {
      enemy.groundShadow.position.set(0, PARK_Y, 0);
      enemy.groundShadow.visible = false;
    }

    const type = enemy.type;
    if (!_freeList[type]) _freeList[type] = [];
    if (_freeList[type].length < POOL_MAX_PER_TYPE) {
      _freeList[type].push(enemy);
    } else {
      // Pool is full — remove and dispose this enemy's scene objects so they
      // don't accumulate as invisible hidden meshes in the Three.js scene graph.
      // Shared geometry and materials are flagged with _isShared and must NOT
      // be disposed (other living enemies still reference them).
      if (enemy.mesh.parent) enemy.mesh.parent.remove(enemy.mesh);
      if (enemy.mesh.geometry && !enemy.mesh.geometry._isShared) {
        enemy.mesh.geometry.dispose();
      }
      if (enemy.mesh.material) {
        const mats = Array.isArray(enemy.mesh.material) ? enemy.mesh.material : [enemy.mesh.material];
        // Skip _isShared (shared color-cache material) and _isSpiderHitbox (transparent
        // hitbox material created specifically for type 15 — not stored in the shared
        // cache, so the normal _isShared flag is absent, but it is safe to leak rather
        // than risk double-dispose since the enemy object itself is being dropped).
        mats.forEach(m => { if (m && !m._isShared && !m._isSpiderHitbox) m.dispose(); });
      }
      // Dispose blob shadow (always unique — never shared)
      if (enemy.groundShadow) {
        if (enemy.groundShadow.parent) enemy.groundShadow.parent.remove(enemy.groundShadow);
        if (enemy.groundShadow.geometry) enemy.groundShadow.geometry.dispose();
        if (enemy.groundShadow.material) enemy.groundShadow.material.dispose();
        enemy.groundShadow = null;
      }
    }
  }

  /** Diagnostic helper – returns total enemies currently in the pool. */
  function totalFree() {
    return Object.values(_freeList).reduce((s, a) => s + a.length, 0);
  }

  return { acquireEnemy, _return, get totalFree() { return totalFree(); } };
}());
