;(function(global) {
  'use strict';

  // ── AnnunakiTablet ────────────────────────────────────────────────────────────
  // Massive ancient stone tablet standing upright at world position (-35, 0, 15).
  // Covered in Egyptian/Annunaki hieroglyphs, glowing with alien energy.
  // All geometry is hardcoded Three.js — no external assets or loaders.
  //
  // Architecture: the root group holds the slab and base structure.
  // All face elements (cracks, glyphs, glow lines, light, dust) are parented
  // directly to the `slab` mesh so they inherit its rotation.y / rotation.z.
  // Positions are given in slab-local space (Y = world-Y − 2.9, slab centre).

  function AnnunakiTablet(scene) {
    // ── Materials ─────────────────────────────────────────────────────────────
    var skinMat = new THREE.MeshLambertMaterial({ color: 0x8b7355, emissive: 0x1a1206 }); // sandstone
    var darkMat = new THREE.MeshLambertMaterial({ color: 0x7a6548, emissive: 0x0d0c08 }); // dark stone
    var goldMat = new THREE.MeshLambertMaterial({ color: 0xc8a84b, emissive: 0x2a1800 }); // gold glyphs
    var glowMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });                        // energy lines

    // ── Root group ───────────────────────────────────────────────────────────
    this.group = new THREE.Group();
    this.group.position.set(-35, 0, 15);
    scene.add(this.group);

    // ── Main slab (face elements are children of this) ───────────────────────
    // Slab centre sits at Y=2.9 in group space (base at ground).
    // All face-detail positions below are in slab-local space (Y offset = world-Y − 2.9).
    var slab = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 5.8, 0.55),
      skinMat
    );
    slab.position.y = 2.9;
    slab.rotation.z = 0.04;
    slab.rotation.y = -0.6;
    this.group.add(slab);

    // ── Base plinth ──────────────────────────────────────────────────────────
    var plinth = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.6, 1.2),
      darkMat
    );
    plinth.position.y = 0.3;
    this.group.add(plinth);

    // ── Side support stones ──────────────────────────────────────────────────
    var leftSupport = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 3.2, 0.4),
      darkMat
    );
    leftSupport.position.set(-1.8, 1.6, 0.1);
    leftSupport.rotation.z = 0.12;
    this.group.add(leftSupport);

    var rightSupport = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 2.8, 0.4),
      darkMat
    );
    rightSupport.position.set(1.8, 1.4, 0.1);
    rightSupport.rotation.z = -0.08;
    this.group.add(rightSupport);

    // ── Weathering cracks (children of slab) ────────────────────────────────
    var crackMat = new THREE.MeshLambertMaterial({ color: 0x2a1f10 });
    // Y values are slab-local (original group-local Y − 2.9)
    var crackData = [
      { x: -0.6, y: -0.80, h: 1.8 },
      { x:  0.3, y: -1.40, h: 2.2 },
      { x: -0.1, y: -2.10, h: 0.9 },
      { x:  0.9, y: -0.40, h: 1.1 },
      { x: -0.9, y: -2.50, h: 1.4 },
    ];
    for (var ci = 0; ci < crackData.length; ci++) {
      var cd = crackData[ci];
      var crack = new THREE.Mesh(new THREE.BoxGeometry(0.04, cd.h, 0.02), crackMat);
      crack.position.set(cd.x, cd.y, 0.285);
      slab.add(crack);
    }

    // ── Collect gold glyphs for shimmer animation ────────────────────────────
    this._goldGlyphs = [];
    var self = this;

    // Helper: stamp a glyph material with its original emissive for shimmer restore,
    // add the mesh to the slab and to the shimmer pool.
    function addGold(mesh) {
      mesh.material._origEmissive = mesh.material.emissive.clone();
      self._goldGlyphs.push(mesh);
      slab.add(mesh);
      return mesh;
    }

    // ── Section 1 — Eye of Horus (slab-local Y ≈ −0.45 to −0.32) ────────────
    var eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), goldMat.clone());
    eyeball.scale.z = 0.15;
    eyeball.position.set(0, -0.45, 0.285);
    addGold(eyeball);

    var irisMat = new THREE.MeshLambertMaterial({ color: 0x1a0f00, emissive: 0x000000 });
    var iris = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), irisMat);
    iris.scale.z = 0.2;
    iris.position.set(0, -0.45, 0.286);
    slab.add(iris);

    var upperLid = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.025), goldMat.clone());
    upperLid.position.set(0, -0.38, 0.286);
    addGold(upperLid);

    var lowerLid = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.022, 0.022), goldMat.clone());
    lowerLid.position.set(0, -0.52, 0.286);
    addGold(lowerLid);

    var leftSpiral = new THREE.Mesh(
      new THREE.TorusGeometry(0.08, 0.018, 4, 8, Math.PI * 1.3),
      goldMat.clone()
    );
    leftSpiral.position.set(-0.26, -0.52, 0.286);
    leftSpiral.rotation.z = -0.5;
    addGold(leftSpiral);

    var rightWing = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.022, 0.022), goldMat.clone());
    rightWing.position.set(0.28, -0.46, 0.286);
    rightWing.rotation.z = -0.25;
    addGold(rightWing);

    var teardropTail = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 5), goldMat.clone());
    teardropTail.position.set(0.35, -0.62, 0.286);
    teardropTail.rotation.z = -1.1;
    addGold(teardropTail);

    var brow = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.035, 0.022), goldMat.clone());
    brow.position.set(0, -0.32, 0.286);
    addGold(brow);

    // ── Section 2 — Winged Solar Disc (slab-local Y=−1.05) ───────────────────
    var solarDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.025, 10), goldMat.clone());
    solarDisc.rotation.x = Math.PI / 2;
    solarDisc.position.set(0, -1.05, 0.285);
    addGold(solarDisc);

    var leftWingBox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.025, 0.022), goldMat.clone());
    leftWingBox.position.set(-0.38, -1.05, 0.286);
    addGold(leftWingBox);

    // 3 feather lines each side
    var featherLengths = [0.38, 0.28, 0.18];
    for (var fi = 0; fi < 3; fi++) {
      var featherL = new THREE.Mesh(new THREE.BoxGeometry(featherLengths[fi], 0.018, 0.018), goldMat.clone());
      featherL.position.set(-0.22 - fi * 0.08, -1.05 + 0.04 * (fi + 1), 0.286);
      addGold(featherL);
      var featherR = new THREE.Mesh(new THREE.BoxGeometry(featherLengths[fi], 0.018, 0.018), goldMat.clone());
      featherR.position.set(0.22 + fi * 0.08, -1.05 + 0.04 * (fi + 1), 0.286);
      addGold(featherR);
    }

    var rightWingBox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.025, 0.022), goldMat.clone());
    rightWingBox.position.set(0.38, -1.05, 0.286);
    addGold(rightWingBox);

    var leftSerpent = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 7, Math.PI), goldMat.clone());
    leftSerpent.position.set(-0.70, -1.02, 0.286);
    addGold(leftSerpent);

    var rightSerpent = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 7, Math.PI), goldMat.clone());
    rightSerpent.position.set(0.70, -1.02, 0.286);
    rightSerpent.rotation.y = Math.PI;
    addGold(rightSerpent);

    // ── Section 3 — Cuneiform Rows (slab-local Y=−1.25 to −1.55) ────────────
    // These wedges use a distinct emissive base; _origEmissive is stored per material.
    var cuneiformAngles = [0.3, -0.5, 0.7, -0.2, 0.6, -0.8, 0.4, -0.3, 0.5];
    for (var row = 0; row < 3; row++) {
      var rowY = -1.25 - row * 0.15;
      for (var col = 0; col < 9; col++) {
        var cuneiformMat = new THREE.MeshLambertMaterial({ color: 0xb89040, emissive: 0x1a0e00 });
        var wedge = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.022), cuneiformMat);
        wedge.position.set(-0.8 + col * 0.2, rowY, 0.285);
        wedge.rotation.z = cuneiformAngles[col % cuneiformAngles.length] * (row % 2 === 0 ? 1 : -1);
        addGold(wedge);
      }
    }

    // ── Section 4 — Annunaki Figure Left (slab-local Y=−1.92 to −1.86) ───────
    var figHeadL = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 5), goldMat.clone());
    figHeadL.scale.z = 0.2;
    figHeadL.position.set(-0.7, -1.92, 0.285);
    addGold(figHeadL);

    var figBodyL = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.32, 0.022), goldMat.clone());
    figBodyL.position.set(-0.7, -2.18, 0.285);
    addGold(figBodyL);

    var figArmLL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.025, 0.022), goldMat.clone());
    figArmLL.position.set(-0.78, -2.10, 0.286);
    figArmLL.rotation.z = 0.4;
    addGold(figArmLL);

    var figArmRL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.022), goldMat.clone());
    figArmRL.position.set(-0.62, -2.12, 0.286);
    figArmRL.rotation.z = -0.55;
    addGold(figArmRL);

    var staffL = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.42, 0.022), goldMat.clone());
    staffL.position.set(-0.52, -2.28, 0.286);
    addGold(staffL);

    var pineconeL = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 5), goldMat.clone());
    pineconeL.position.set(-0.52, -2.02, 0.286);
    addGold(pineconeL);

    var headdressL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.045, 0.022), goldMat.clone());
    headdressL.position.set(-0.7, -1.86, 0.285);
    addGold(headdressL);

    // ── Section 5 — Waterdrop Symbol Center (slab-local Y=−2.38) ─────────────
    var dropBody = new THREE.Mesh(new THREE.SphereGeometry(0.085, 7, 6), goldMat.clone());
    dropBody.scale.z = 0.2;
    dropBody.position.set(0.05, -2.38, 0.285);
    addGold(dropBody);

    var dropTip = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.10, 5), goldMat.clone());
    dropTip.rotation.x = Math.PI;
    dropTip.position.set(0.05, -2.25, 0.285);
    addGold(dropTip);

    var orbitAngles = [0, Math.PI * 2 / 3, Math.PI * 4 / 3];
    for (var oi = 0; oi < 3; oi++) {
      var dot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 4), goldMat.clone());
      dot.scale.z = 0.3;
      dot.position.set(
        0.05 + Math.cos(orbitAngles[oi]) * 0.17,
        -2.38 + Math.sin(orbitAngles[oi]) * 0.17,
        0.285
      );
      addGold(dot);
    }

    // ── Section 6 — Annunaki Figure Right (slab-local X=+0.7, arm bent) ──────
    var figHeadR = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 5), goldMat.clone());
    figHeadR.scale.z = 0.2;
    figHeadR.position.set(0.7, -1.92, 0.285);
    addGold(figHeadR);

    var figBodyR = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.32, 0.022), goldMat.clone());
    figBodyR.position.set(0.7, -2.18, 0.285);
    addGold(figBodyR);

    // Arm bent at elbow (two segments)
    var figArmR1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.022), goldMat.clone());
    figArmR1.position.set(0.78, -2.08, 0.286);
    figArmR1.rotation.z = 0.55;
    addGold(figArmR1);

    var figArmR2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.022), goldMat.clone());
    figArmR2.position.set(0.88, -2.16, 0.286);
    figArmR2.rotation.z = -0.2;
    addGold(figArmR2);

    var figArmLR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.022), goldMat.clone());
    figArmLR.position.set(0.62, -2.12, 0.286);
    figArmLR.rotation.z = 0.55;
    addGold(figArmLR);

    var staffR = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.42, 0.022), goldMat.clone());
    staffR.position.set(0.52, -2.28, 0.286);
    addGold(staffR);

    var pineconeR = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 5), goldMat.clone());
    pineconeR.position.set(0.52, -2.02, 0.286);
    addGold(pineconeR);

    var headdressR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.045, 0.022), goldMat.clone());
    headdressR.position.set(0.7, -1.86, 0.285);
    addGold(headdressR);

    // ── Section 7 — Bottom Hieroglyphs (slab-local Y ≈ −2.78) ────────────────
    // Glyph X positions evenly spaced: -1.1, -0.55, 0, 0.55, 1.1
    var glyphX = [-1.1, -0.55, 0, 0.55, 1.1];
    var glyphY = -2.78; // 0.12 − 2.9

    // Ankh (cross + loop)
    var ankhV = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.13, 0.018), goldMat.clone());
    ankhV.position.set(glyphX[0], glyphY, 0.285);
    addGold(ankhV);
    var ankhH = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.018, 0.018), goldMat.clone());
    ankhH.position.set(glyphX[0], glyphY + 0.02, 0.285);
    addGold(ankhH);
    var ankhLoop = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.010, 4, 7), goldMat.clone());
    ankhLoop.position.set(glyphX[0], glyphY + 0.085, 0.285);
    addGold(ankhLoop);

    // Bird (two wedges + head)
    var birdBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.018), goldMat.clone());
    birdBody.position.set(glyphX[1], glyphY, 0.285);
    addGold(birdBody);
    var birdWing = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.018, 0.018), goldMat.clone());
    birdWing.position.set(glyphX[1] + 0.01, glyphY + 0.025, 0.285);
    birdWing.rotation.z = 0.4;
    addGold(birdWing);
    var birdHead = new THREE.Mesh(new THREE.SphereGeometry(0.018, 4, 4), goldMat.clone());
    birdHead.position.set(glyphX[1] + 0.048, glyphY + 0.018, 0.285);
    addGold(birdHead);

    // Snake
    var snakeMesh = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.010, 4, 9, Math.PI * 1.7), goldMat.clone());
    snakeMesh.position.set(glyphX[2], glyphY, 0.285);
    addGold(snakeMesh);

    // Seated figure (3 tiny boxes)
    var sfBody = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.065, 0.018), goldMat.clone());
    sfBody.position.set(glyphX[3], glyphY, 0.285);
    addGold(sfBody);
    var sfHead = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.018), goldMat.clone());
    sfHead.position.set(glyphX[3], glyphY + 0.055, 0.285);
    addGold(sfHead);
    var sfLeg = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.018, 0.018), goldMat.clone());
    sfLeg.position.set(glyphX[3] + 0.01, glyphY - 0.042, 0.285);
    sfLeg.rotation.z = 0.3;
    addGold(sfLeg);

    // Jar
    var jar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.08, 6), goldMat.clone());
    jar.position.set(glyphX[4], glyphY, 0.285);
    addGold(jar);

    // ── Energy glow lines (children of slab; Y=0 = slab centre) ─────────────
    var glowMatL = glowMat.clone();
    glowMatL.transparent = true;
    var glowLeft = new THREE.Mesh(new THREE.BoxGeometry(0.018, 5.4, 0.02), glowMatL);
    glowLeft.position.set(-1.55, 0.0, 0.287);
    slab.add(glowLeft);

    var glowMatR = glowMat.clone();
    glowMatR.transparent = true;
    var glowRight = new THREE.Mesh(new THREE.BoxGeometry(0.018, 5.4, 0.02), glowMatR);
    glowRight.position.set(1.55, 0.0, 0.287);
    slab.add(glowRight);

    this._glowLines = [glowLeft, glowRight];

    // ── Point light (child of slab; Y=−0.4 = 2.5 − 2.9 in group space) ──────
    this.glowLight = new THREE.PointLight(0x00ffcc, 0.4, 8);
    this.glowLight.position.set(0, -0.4, 0.8);
    slab.add(this.glowLight);

    // ── Floating dust motes (children of slab) ───────────────────────────────
    // startY in slab-local space: 0.3−2.9 = −2.6 base, up to +2.2 top.
    var dustMat = new THREE.MeshBasicMaterial({
      color: 0xc8a84b,
      transparent: true,
      opacity: 0.6
    });
    this._dustMotes = [];
    for (var di = 0; di < 8; di++) {
      var dust = new THREE.Mesh(new THREE.SphereGeometry(0.015, 4, 3), dustMat.clone());
      var startX = (Math.random() - 0.5) * 2.8;
      var startY = -2.6 + Math.random() * 4.8;
      var startZ = 0.29 + Math.random() * 0.05;
      dust.position.set(startX, startY, startZ);
      dust.userData.startY = startY;
      slab.add(dust);
      this._dustMotes.push(dust);
    }

    // ── Animation state ──────────────────────────────────────────────────────
    this.glowTime = 0;
    this._shimmerTimer = 0;
    this._shimmerTarget = null;
    this._shimmerPhase = 0;   // 0=idle, 1=rising, 2=falling
    this._shimmerT = 0;
    // Pre-allocated colors — no new THREE objects inside update()
    this._shimmerOrigColor = new THREE.Color(); // copy of target's _origEmissive
    this._shimmerBright    = new THREE.Color(0xc8a84b);
    this._shimmerColor     = new THREE.Color();
  }

  // ── update(dt) ────────────────────────────────────────────────────────────
  AnnunakiTablet.prototype.update = function(dt) {
    // 1. Glow pulse
    this.glowTime += dt;
    var pulse = 0.3 + Math.sin(this.glowTime * 1.4) * 0.2;
    this.glowLight.intensity = pulse;
    var glowOpacity = Math.max(0.05, Math.min(1, pulse * 1.5));
    for (var gi = 0; gi < this._glowLines.length; gi++) {
      this._glowLines[gi].material.opacity = glowOpacity;
    }

    // 2. Glyph shimmer — every 3.5 s, animate one random glyph 0→bright→0 over 0.6 s.
    //    Restores to each glyph's own _origEmissive so cuneiform and gold both look correct.
    this._shimmerTimer += dt;
    if (this._shimmerPhase === 0 && this._shimmerTimer >= 3.5) {
      this._shimmerTimer = 0;
      var idx = Math.floor(Math.random() * this._goldGlyphs.length);
      this._shimmerTarget = this._goldGlyphs[idx];
      // Cache the target's original emissive so update() never allocates
      this._shimmerOrigColor.copy(this._shimmerTarget.material._origEmissive);
      this._shimmerPhase = 1;
      this._shimmerT = 0;
    }
    if (this._shimmerPhase === 1 || this._shimmerPhase === 2) {
      this._shimmerT += dt;
      var halfDur = 0.3;
      var t;
      if (this._shimmerPhase === 1) {
        t = Math.min(this._shimmerT / halfDur, 1);
        if (this._shimmerT >= halfDur) {
          this._shimmerPhase = 2;
          this._shimmerT = 0;
        }
      } else {
        t = 1 - Math.min(this._shimmerT / halfDur, 1);
        if (this._shimmerT >= halfDur) {
          this._shimmerPhase = 0;
          t = 0;
        }
      }
      if (this._shimmerTarget && this._shimmerTarget.material) {
        this._shimmerColor.copy(this._shimmerOrigColor).lerp(this._shimmerBright, t);
        this._shimmerTarget.material.emissive.copy(this._shimmerColor);
      }
    }

    // 3. Floating dust motes
    var RISE = 1.2;
    for (var di = 0; di < this._dustMotes.length; di++) {
      var d = this._dustMotes[di];
      d.position.y += dt * 0.08;
      var traveled = d.position.y - d.userData.startY;
      d.material.opacity = Math.max(0, 0.6 * (1 - traveled / RISE));
      if (traveled >= RISE) {
        d.position.y = d.userData.startY;
        d.material.opacity = 0.6;
      }
    }
  };

  // ── Expose globally ───────────────────────────────────────────────────────
  global.AnnunakiTablet = AnnunakiTablet;

})(window);

