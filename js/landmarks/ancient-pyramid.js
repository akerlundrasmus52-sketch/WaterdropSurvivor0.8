;(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  //  Ancient Pyramid — Landmark for Waterdrop Survivor (Engine 2.0)
  //  World position (65, 0, -60) — far southeast corner of arena.
  //  Crumbling stepped pyramid, sand-coloured, glowing cyan apex crystal,
  //  intermittent energy beam, Eye of Horus above entrance, hieroglyph bands.
  //  No external assets — Three.js primitives only.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @param {THREE.Scene} scene  The Three.js scene to add geometry to.
   */
  function AncientPyramid(scene) {
    this.scene = scene;

    // ── Animation state ──────────────────────────────────────────────────────
    this.crystalTime      = 0;
    this.beamTimer        = 0;
    this.beamActive       = false;
    this.beamDuration     = 0;
    this.beamActiveTime   = 0;
    this.nextBeamInterval = 8 + Math.random() * 6;

    // Animated references — set during _build()
    this.crystal   = null;
    this.ring1     = null;
    this.ring2     = null;
    this.apexLight = null;
    this.beamMesh  = null;
    this.beamMat   = null;
    this.eyeLight  = null;
    this.eyeGlyphs = [];
    this.aura      = null;
    this.auraMat   = null;

    this._build();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Construction
  // ─────────────────────────────────────────────────────────────────────────
  AncientPyramid.prototype._build = function () {
    var scene = this.scene;
    var THREE = global.THREE;
    var PI    = Math.PI;

    // World-space anchor
    var PX = 65, PZ = -60;

    // ── Materials ──────────────────────────────────────────────────────────
    var stoneMat     = new THREE.MeshLambertMaterial({ color: 0xa8956a, emissive: 0x141008 });
    var darkStoneMat = new THREE.MeshLambertMaterial({ color: 0x8a7855, emissive: 0x0c0a06 });
    var goldMat      = new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0x442200 });
    var darkMat      = new THREE.MeshBasicMaterial({ color: 0x050505 });
    var crystalMat   = new THREE.MeshBasicMaterial({ color: 0x00ffee });
    var beamMat      = new THREE.MeshBasicMaterial({
      color: 0x00ffcc, transparent: true, opacity: 0, side: THREE.DoubleSide
    });
    this.beamMat = beamMat;

    // ── 5-Tier Stepped Pyramid ─────────────────────────────────────────────
    var tiers = [
      { w: 18, h: 1.8, y: -0.3, mat: stoneMat     },  // Tier 1 — partially buried
      { w: 14, h: 1.8, y:  2.5, mat: darkStoneMat },  // Tier 2
      { w: 10, h: 1.8, y:  4.2, mat: stoneMat     },  // Tier 3
      { w:  7, h: 1.8, y:  5.9, mat: darkStoneMat },  // Tier 4
      { w:  4, h: 1.6, y:  7.5, mat: stoneMat     },  // Tier 5
    ];

    tiers.forEach(function (t) {
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.w), t.mat);
      mesh.position.set(PX, t.y, PZ);
      scene.add(mesh);
    });

    // Pyramid cap — rotated 45° so corners align with cardinal faces
    var cap = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.2, 4), darkStoneMat);
    cap.position.set(PX, 9.6, PZ);
    cap.rotation.y = PI / 4;
    scene.add(cap);

    // ── Crumbling Chunks ───────────────────────────────────────────────────
    var chunkMat = new THREE.MeshLambertMaterial({ color: 0x9a8860, emissive: 0x100e08 });
    for (var c = 0; c < 10; c++) {
      var cw = 0.5 + Math.random() * 1.3;
      var ch = 0.4 + Math.random() * 0.8;
      var cd = 0.4 + Math.random() * 0.6;
      var chunk = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cd), chunkMat);
      var cAngle  = (c / 10) * PI * 2 + Math.random() * 0.5;
      var cRadius = 7 + Math.random() * 3;
      chunk.position.set(
        PX + Math.cos(cAngle) * cRadius,
        ch * 0.5,
        PZ + Math.sin(cAngle) * cRadius
      );
      chunk.rotation.set(
        (Math.random() - 0.5) * 0.6,
        Math.random() * PI * 2,
        (Math.random() - 0.5) * 0.6
      );
      scene.add(chunk);
    }

    // ── Buried Base Boulders ───────────────────────────────────────────────
    var buriedMat = new THREE.MeshLambertMaterial({ color: 0x6a5840, emissive: 0x0a0806 });
    for (var b = 0; b < 16; b++) {
      var br      = 0.4 + Math.random() * 0.5;
      var boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(br, 0), buriedMat);
      var bAngle  = (b / 16) * PI * 2 + Math.random() * 0.3;
      var bRadius = 9 + Math.random() * 2;
      boulder.position.set(
        PX + Math.cos(bAngle) * bRadius,
        -br * 0.5,
        PZ + Math.sin(bAngle) * bRadius
      );
      boulder.rotation.y = Math.random() * PI * 2;
      scene.add(boulder);
    }

    // ── Entrance ───────────────────────────────────────────────────────────
    // +Z face of Tier 1 (half-width = 9) faces the arena interior at z = PZ + 9
    var frontZ = PZ + 9;

    var doorway = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.5, 0.6), darkMat);
    doorway.position.set(PX, -0.3 + 3.5 / 2, frontZ - 0.32);
    scene.add(doorway);

    var entranceLight = new THREE.PointLight(0xcc8800, 0.6, 8);
    entranceLight.position.set(PX, 1.0, frontZ - 1.5);
    scene.add(entranceLight);

    // ── Eye of Horus ───────────────────────────────────────────────────────
    // Centred above the entrance, proud of the front face by 0.1 units
    var eyeZ = frontZ + 0.1;
    var eyeY = 5.0;

    var eyeGroup = new THREE.Group();
    eyeGroup.position.set(PX, eyeY, eyeZ);
    eyeGroup.scale.setScalar(2.5);

    // Eyeball — flattened sphere
    var eyeballMat = new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0x664400 });
    var eyeball    = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), eyeballMat);
    eyeball.scale.z = 0.15;
    eyeGroup.add(eyeball);

    // Upper lid
    var upperLid = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.06, 0.06), goldMat);
    upperLid.position.y = 0.30;
    eyeGroup.add(upperLid);

    // Lower lid
    var lowerLid = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.05), goldMat);
    lowerLid.position.y = -0.30;
    eyeGroup.add(lowerLid);

    // Brow
    var brow = new THREE.Mesh(new THREE.BoxGeometry(1.20, 0.08, 0.05), goldMat);
    brow.position.y = 0.55;
    eyeGroup.add(brow);

    // Left spiral
    var spiral = new THREE.Mesh(
      new THREE.TorusGeometry(0.20, 0.045, 4, 8, PI * 1.3), goldMat
    );
    spiral.position.set(-0.5, -0.25, 0);
    spiral.rotation.z = -0.5;
    eyeGroup.add(spiral);

    // Right wing sweep
    var wing = new THREE.Mesh(
      new THREE.TorusGeometry(0.30, 0.04, 4, 8, PI * 0.9), goldMat
    );
    wing.position.set(0.5, 0.10, 0);
    wing.rotation.z = 0.8;
    eyeGroup.add(wing);

    // Teardrop tail
    var teardrop = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 4), goldMat);
    teardrop.position.set(0.75, -0.35, 0);
    teardrop.rotation.z = -PI / 3;
    eyeGroup.add(teardrop);

    scene.add(eyeGroup);

    // Point light behind the eye
    var eyeLight = new THREE.PointLight(0xffaa00, 0.5, 6);
    eyeLight.position.set(PX, eyeY, eyeZ - 1.0);
    scene.add(eyeLight);

    this.eyeLight  = eyeLight;
    this.eyeGlyphs = [eyeballMat, goldMat];

    // ── Apex Crystal ───────────────────────────────────────────────────────
    var crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), crystalMat);
    crystal.position.set(PX, 11.2, PZ);
    scene.add(crystal);
    this.crystal = crystal;

    // Ring 1 — rotates on Y
    var ring1 = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.04, 5, 12),
      new THREE.MeshBasicMaterial({ color: 0x00ffee, transparent: true, opacity: 0.8 })
    );
    ring1.position.set(PX, 11.2, PZ);
    scene.add(ring1);
    this.ring1 = ring1;

    // Ring 2 — tilted 60°, counter-rotates
    var ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.03, 5, 10),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.7 })
    );
    ring2.position.set(PX, 11.2, PZ);
    ring2.rotation.x = PI / 3;
    scene.add(ring2);
    this.ring2 = ring2;

    // Apex point light
    var apexLight = new THREE.PointLight(0x00ffcc, 1.2, 15);
    apexLight.position.set(PX, 11.2, PZ);
    scene.add(apexLight);
    this.apexLight = apexLight;

    // ── Energy Beam ────────────────────────────────────────────────────────
    var beamMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.22, 35, 6, 1, true),
      beamMat
    );
    // Centre the beam above the apex so it shoots straight up
    beamMesh.position.set(PX, 11.2 + 35 / 2, PZ);
    scene.add(beamMesh);
    this.beamMesh = beamMesh;

    // ── Hieroglyph Bands ───────────────────────────────────────────────────
    // One row of 12 tiny marks on each of the 4 faces of every tier.
    // All marks share one InstancedMesh to minimise draw calls.
    var glyphMat = new THREE.MeshLambertMaterial({ color: 0xc8a84b, emissive: 0x1a1000 });
    var glyphGeo = new THREE.BoxGeometry(0.12, 0.18, 0.04);
    var tierDefs = [
      { y: -0.3, hw: 9   },
      { y:  2.5, hw: 7   },
      { y:  4.2, hw: 5   },
      { y:  5.9, hw: 3.5 },
      { y:  7.5, hw: 2   },
    ];

    var glyphsPerFace  = 12;
    var facesPerTier   = 4;
    var totalGlyphs    = tierDefs.length * facesPerTier * glyphsPerFace;
    var glyphInstanced = new THREE.InstancedMesh(glyphGeo, glyphMat, totalGlyphs);
    var glyphIndex     = 0;
    var glyphMatrix    = new THREE.Matrix4();
    var glyphPos       = new THREE.Vector3();
    var glyphQuat      = new THREE.Quaternion();
    var glyphEuler     = new THREE.Euler();
    var glyphScaleVec  = new THREE.Vector3(1, 1, 1);

    tierDefs.forEach(function (tier) {
      var hw  = tier.hw;
      var ty  = tier.y;
      var rng = hw * 1.7;  // spread of marks across face (leaves ~15 % margin)
      var g, localX, localZ;

      // +X face — marks run in Z, face normal is +X
      for (g = 0; g < glyphsPerFace; g++) {
        localZ = (g / (glyphsPerFace - 1) - 0.5) * rng;
        glyphPos.set(PX + hw + 0.02, ty, PZ + localZ);
        glyphEuler.set(0, PI / 2, (Math.random() - 0.5) * 0.6);
        glyphQuat.setFromEuler(glyphEuler);
        glyphMatrix.compose(glyphPos, glyphQuat, glyphScaleVec);
        glyphInstanced.setMatrixAt(glyphIndex++, glyphMatrix);
      }

      // -X face — marks run in Z, face normal is -X
      for (g = 0; g < glyphsPerFace; g++) {
        localZ = (g / (glyphsPerFace - 1) - 0.5) * rng;
        glyphPos.set(PX - hw - 0.02, ty, PZ + localZ);
        glyphEuler.set(0, -PI / 2, (Math.random() - 0.5) * 0.6);
        glyphQuat.setFromEuler(glyphEuler);
        glyphMatrix.compose(glyphPos, glyphQuat, glyphScaleVec);
        glyphInstanced.setMatrixAt(glyphIndex++, glyphMatrix);
      }

      // +Z face — marks run in X, face normal is +Z (entrance side)
      for (g = 0; g < glyphsPerFace; g++) {
        localX = (g / (glyphsPerFace - 1) - 0.5) * rng;
        glyphPos.set(PX + localX, ty, PZ + hw + 0.02);
        glyphEuler.set(0, 0, (Math.random() - 0.5) * 0.6);
        glyphQuat.setFromEuler(glyphEuler);
        glyphMatrix.compose(glyphPos, glyphQuat, glyphScaleVec);
        glyphInstanced.setMatrixAt(glyphIndex++, glyphMatrix);
      }

      // -Z face — marks run in X, face normal is -Z
      for (g = 0; g < glyphsPerFace; g++) {
        localX = (g / (glyphsPerFace - 1) - 0.5) * rng;
        glyphPos.set(PX + localX, ty, PZ - hw - 0.02);
        glyphEuler.set(0, 0, (Math.random() - 0.5) * 0.6);
        glyphQuat.setFromEuler(glyphEuler);
        glyphMatrix.compose(glyphPos, glyphQuat, glyphScaleVec);
        glyphInstanced.setMatrixAt(glyphIndex++, glyphMatrix);
      }
    });

    glyphInstanced.instanceMatrix.needsUpdate = true;
    scene.add(glyphInstanced);

    // ── Ground Aura ────────────────────────────────────────────────────────
    var auraMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc, transparent: true, opacity: 0.04, side: THREE.DoubleSide
    });
    var aura = new THREE.Mesh(new THREE.RingGeometry(9.5, 10.5, 32), auraMat);
    aura.rotation.x = -PI / 2;
    aura.position.set(PX, 0.05, PZ);
    scene.add(aura);
    this.aura    = aura;
    this.auraMat = auraMat;

    console.log('[AncientPyramid] \u2713 Built at (' + PX + ', 0, ' + PZ + ')');
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  Animation — called every frame from sandbox-loop.js
  // ─────────────────────────────────────────────────────────────────────────
  AncientPyramid.prototype.update = function (dt) {
    this.crystalTime += dt;
    var t = this.crystalTime;

    // ── Ring rotation ────────────────────────────────────────────────────
    this.ring1.rotation.y += dt * 0.8;
    this.ring2.rotation.x += dt * 0.6;
    this.ring2.rotation.y += dt * -0.5;

    // ── Crystal pulse ────────────────────────────────────────────────────
    var pulse = 0.7 + Math.sin(t * 2.2) * 0.3;
    this.apexLight.intensity = pulse * 1.2;
    this.crystal.scale.setScalar(1.0 + Math.sin(t * 3.1) * 0.08);

    // ── Energy beam cycle ────────────────────────────────────────────────
    this.beamTimer += dt;
    if (!this.beamActive && this.beamTimer > this.nextBeamInterval) {
      this.beamActive       = true;
      this.beamTimer        = 0;
      this.beamDuration     = 2 + Math.random() * 1.5;
      this.nextBeamInterval = 8 + Math.random() * 6;
      this.beamActiveTime   = 0;
    }

    if (this.beamActive) {
      this.beamActiveTime += dt;
      var fadeIn  = Math.min(1, this.beamActiveTime / 0.3);
      var fadeOut = Math.min(1, (this.beamDuration - this.beamActiveTime) / 0.4);
      var beamOpacity = Math.min(fadeIn, fadeOut) * 0.35
        + Math.sin(this.beamActiveTime * 18) * 0.06;
      this.beamMat.opacity = Math.max(0, Math.min(1, beamOpacity));
      this.apexLight.intensity = 2.0 + Math.sin(this.beamActiveTime * 12) * 0.8;
      if (this.beamActiveTime >= this.beamDuration) {
        this.beamActive      = false;
        this.beamMat.opacity = 0;
      }
    }

    // ── Eye pulse ────────────────────────────────────────────────────────
    var eyePulse = 0.4 + Math.sin(t * 0.7) * 0.2;
    this.eyeLight.intensity = eyePulse;
    var ep = eyePulse;
    this.eyeGlyphs.forEach(function (mat) {
      mat.emissiveIntensity = ep * 0.6;
    });

    // ── Ground aura pulse ────────────────────────────────────────────────
    this.auraMat.opacity = 0.04 + Math.sin(t * 0.5) * 0.04;
  };

  // ── Export ──────────────────────────────────────────────────────────────
  global.AncientPyramid = AncientPyramid;

})(window);
