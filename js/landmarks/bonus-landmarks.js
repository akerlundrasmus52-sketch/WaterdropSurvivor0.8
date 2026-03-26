;(function(global) {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════════
  // BonusLandmarks — Three.js landmark set for Waterdrop Survivor Engine 2.0
  // Contains 3 handcrafted world landmarks, no external assets, Three.js only.
  //   A — Ritual Fire Circle    at (-18, 0, -28)
  //   B — Alien Crash Debris    at (-30, 0, -55)
  //   C — Ancient Stone Well    at ( 10, 0,  25)
  // ════════════════════════════════════════════════════════════════════════════

  class BonusLandmarks {
    constructor(scene) {
      this.scene = scene;

      // Per-landmark time accumulators
      this.fireTime   = 0;
      this.debrisTime = 0;
      this.wellTime   = 0;

      // Animated object references (populated by build methods)
      this._fireFlamesMesh   = null;
      this._fireFlameData    = [];
      this._fireEmbers       = [];
      this._fireSmoke        = [];
      this._fireLight        = null;
      this._fireLight2       = null;

      this._debrisCores      = [];
      this._debrisCoreLights = [];
      this._debrisSteam      = [];

      this._wellRopeSegs     = [];
      this._wellGlowLight    = null;
      this._wellWaterMesh    = null;

      this._buildFireCircle();
      this._buildAlienCrash();
      this._buildStoneWell();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // LANDMARK A — RITUAL FIRE CIRCLE  (-18, 0, -28)
    // ══════════════════════════════════════════════════════════════════════════
    _buildFireCircle() {
      const THREE = global.THREE;
      const PI    = Math.PI;
      const rand  = Math.random.bind(Math);

      const root = new THREE.Group();
      root.position.set(-18, 0, -28);
      this.scene.add(root);

      // ── Ground dirt ring path ────────────────────────────────────────────
      const ringGeo  = new THREE.RingGeometry(4.0, 4.8, 9);
      const ringMat  = new THREE.MeshLambertMaterial({ color: 0x3a2e22, side: THREE.DoubleSide });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -PI / 2;
      ringMesh.position.y = 0.01;
      root.add(ringMesh);

      // ── Standing stones ──────────────────────────────────────────────────
      const stoneMat = new THREE.MeshLambertMaterial({ color: 0x6a5a4a, emissive: 0x080704 });

      const capIndices   = new Set();
      while (capIndices.size < 4) capIndices.add(Math.floor(rand() * 9));

      const lintelPairs  = [];
      const lintelCandidates = [0, 1, 3, 4, 6, 7];
      for (let k = 0; k < 3; k++) {
        const idx = lintelCandidates[k * 2];
        lintelPairs.push([idx, idx + 1]);
      }

      // Pre-compute stone heights so lintels can use the real neighbor heights
      const stoneHeights = Array.from({ length: 9 }, () => 1.8 + rand() * 0.6);

      for (let i = 0; i < 9; i++) {
        const angle = (i / 9) * PI * 2;
        const r     = 4.5;
        const sx    = Math.cos(angle) * r;
        const sz    = Math.sin(angle) * r;

        const w = 0.5 + rand() * 0.2;
        const h = stoneHeights[i];
        const d = 0.35 + rand() * 0.15;

        const stoneGeo  = new THREE.BoxGeometry(w, h, d);
        const stoneMesh = new THREE.Mesh(stoneGeo, stoneMat);
        stoneMesh.position.set(sx, h / 2, sz);
        stoneMesh.rotation.y = rand() * PI * 2;
        stoneMesh.rotation.z = (rand() * 0.2 - 0.1); // ±0.1 tilt
        root.add(stoneMesh);

        // Optional rough cap on top of some stones
        if (capIndices.has(i)) {
          const capGeo  = new THREE.BoxGeometry(0.4, 0.2, 0.3);
          const capMat  = new THREE.MeshLambertMaterial({ color: 0x6a5a4a, emissive: 0x080704 });
          const capMesh = new THREE.Mesh(capGeo, capMat);
          capMesh.position.set(sx, h + 0.1, sz);
          capMesh.rotation.y = rand() * PI * 2;
          root.add(capMesh);
        }

        // Check if this stone starts a lintel pair
        for (const pair of lintelPairs) {
          if (pair[0] === i) {
            const angle2   = ((i + 1) / 9) * PI * 2;
            const sx2      = Math.cos(angle2) * r;
            const sz2      = Math.sin(angle2) * r;
            const midX     = (sx + sx2) / 2;
            const midZ     = (sz + sz2) / 2;

            // Use the actual pre-computed height of the neighboring stone
            const h2 = stoneHeights[i + 1];
            const topY = Math.min(h, h2) + 0.175;

            const lintelGeo  = new THREE.BoxGeometry(1.2, 0.35, 0.4);
            const lintelMat  = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
            const lintelMesh = new THREE.Mesh(lintelGeo, lintelMat);
            lintelMesh.position.set(midX, topY, midZ);
            lintelMesh.rotation.y = angle + PI / 2;
            root.add(lintelMesh);
          }
        }
      }

      // ── Fire Pit ─────────────────────────────────────────────────────────
      // Perimeter stones
      const pitStoneMat = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
      for (let i = 0; i < 8; i++) {
        const a   = (i / 8) * PI * 2;
        const ps  = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), pitStoneMat);
        ps.position.set(Math.cos(a) * 0.7, -0.08, Math.sin(a) * 0.7);
        root.add(ps);
      }

      // Charred disc
      const charGeo  = new THREE.CircleGeometry(0.9, 12);
      const charMat  = new THREE.MeshLambertMaterial({ color: 0x1a1008, side: THREE.DoubleSide });
      const charMesh = new THREE.Mesh(charGeo, charMat);
      charMesh.rotation.x = -PI / 2;
      charMesh.position.y = 0.02;
      root.add(charMesh);

      // Inner glow sphere
      const glowGeo  = new THREE.SphereGeometry(0.3, 6, 5);
      const glowMat  = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.5 });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      glowMesh.position.y = 0.1;
      root.add(glowMesh);

      // ── Fire Flames (InstancedMesh) ───────────────────────────────────────
      const FLAME_COUNT = 20;
      const flameGeo    = new THREE.ConeGeometry(0.12, 0.4, 5, 1, true);
      const flameMat    = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
      const flamesMesh  = new THREE.InstancedMesh(flameGeo, flameMat, FLAME_COUNT);
      flamesMesh.position.y = 0;
      root.add(flamesMesh);

      this._fireFlamesMesh = flamesMesh;
      this._fireFlameData  = [];

      const dummy = new THREE.Object3D();
      for (let i = 0; i < FLAME_COUNT; i++) {
        const angle  = rand() * PI * 2;
        const radius = rand() * 0.3;
        const data   = {
          posX:  Math.cos(angle) * radius,
          posZ:  Math.sin(angle) * radius,
          phase: rand() * PI * 2,
          speed: 1.5 + rand() * 1.0
        };
        this._fireFlameData.push(data);

        dummy.position.set(data.posX, 0.1, data.posZ);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        flamesMesh.setMatrixAt(i, dummy.matrix);
      }
      flamesMesh.instanceMatrix.needsUpdate = true;

      // ── Ember particles ───────────────────────────────────────────────────
      const emberMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 1.0 });
      this._fireEmbers = [];
      for (let i = 0; i < 6; i++) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 3, 3), emberMat.clone());
        const angle = rand() * PI * 2;
        const r     = rand() * 0.35;
        e.position.set(Math.cos(angle) * r, rand() * 0.3, Math.sin(angle) * r);
        e.userData.life    = rand(); // 0–1 normalised progress
        e.userData.baseX   = e.position.x;
        e.userData.baseZ   = e.position.z;
        root.add(e);
        this._fireEmbers.push(e);
      }

      // ── Smoke particles ───────────────────────────────────────────────────
      const smokeMat = new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.4 });
      this._fireSmoke = [];
      for (let i = 0; i < 12; i++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), smokeMat.clone());
        const angle = rand() * PI * 2;
        const r     = rand() * 0.4;
        s.position.set(Math.cos(angle) * r, rand() * 2.5, Math.sin(angle) * r);
        s.userData.life      = rand(); // normalised 0–1 (fraction of 3s lifetime)
        s.userData.baseX     = s.position.x;
        s.userData.baseZ     = s.position.z;
        s.userData.driftPhase = rand() * PI * 2; // deterministic drift phase
        root.add(s);
        this._fireSmoke.push(s);
      }

      // ── Lights ────────────────────────────────────────────────────────────
      const fireLight  = new THREE.PointLight(0xff6600, 1.4, 12);
      fireLight.position.set(0, 0.8, 0);
      root.add(fireLight);
      this._fireLight = fireLight;

      const fireLight2 = new THREE.PointLight(0xff3300, 0.3, 6);
      fireLight2.position.set(0.4, 0.4, 0);
      root.add(fireLight2);
      this._fireLight2 = fireLight2;

      // Store root for potential cleanup
      this._fireRoot = root;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // LANDMARK B — ALIEN CRASH DEBRIS  (-30, 0, -55)
    // ══════════════════════════════════════════════════════════════════════════
    _buildAlienCrash() {
      const THREE = global.THREE;
      const PI    = Math.PI;
      const rand  = Math.random.bind(Math);

      const root = new THREE.Group();
      root.position.set(-30, 0, -55);
      this.scene.add(root);

      // ── Main hull ─────────────────────────────────────────────────────────
      const hullGeo = new THREE.CylinderGeometry(3.5, 4.2, 1.2, 8, 1, true);
      const hullMat = new THREE.MeshLambertMaterial({
        color: 0x1a2230, emissive: 0x060810, side: THREE.DoubleSide
      });
      const hull = new THREE.Mesh(hullGeo, hullMat);
      hull.position.set(0, 0.3, 0);
      hull.rotation.z = 1.2;
      root.add(hull);

      // ── Scattered debris pieces ───────────────────────────────────────────
      const debrisMat = new THREE.MeshLambertMaterial({ color: 0x1e2a3c, emissive: 0x050810 });
      const DEBRIS_COUNT = 10;
      for (let i = 0; i < DEBRIS_COUNT; i++) {
        const angle  = (i / DEBRIS_COUNT) * PI * 2 + rand() * 0.4;
        const radius = 3 + rand() * 5;
        const dx     = Math.cos(angle) * radius;
        const dz     = Math.sin(angle) * radius;

        let mesh;
        const type = i % 3;
        if (type === 0) {
          // Open curved hull section
          const sz   = 0.8 + rand() * 1.2;
          const geo  = new THREE.CylinderGeometry(sz * 0.8, sz, 0.8 + rand() * 0.6, 7, 1, true);
          const mat  = new THREE.MeshLambertMaterial({ color: rand() > 0.5 ? 0x1a2230 : 0x2a3548, emissive: 0x060810, side: THREE.DoubleSide });
          mesh       = new THREE.Mesh(geo, mat);
          mesh.rotation.set(rand() * PI, rand() * PI * 2, rand() * PI);
        } else if (type === 1) {
          // Flat panel, half-buried
          const geo  = new THREE.BoxGeometry(1.0 + rand() * 1.5, 0.08, 0.8 + rand() * 1.0);
          const mat  = new THREE.MeshLambertMaterial({ color: 0x222e40, emissive: 0x060810 });
          mesh       = new THREE.Mesh(geo, mat);
          mesh.rotation.set(rand() * 0.5 - 0.25, rand() * PI * 2, rand() * 0.8 - 0.4);
        } else {
          // Sphere pod with ring
          const podGeo  = new THREE.SphereGeometry(0.6, 8, 6);
          const podMat  = new THREE.MeshLambertMaterial({ color: 0x2a3548, emissive: 0x060810 });
          const pod     = new THREE.Mesh(podGeo, podMat);

          const rGeo = new THREE.RingGeometry(0.8, 1.0, 12);
          const rMat = new THREE.MeshLambertMaterial({ color: 0x1a2230, side: THREE.DoubleSide });
          const ring = new THREE.Mesh(rGeo, rMat);
          ring.rotation.x = rand() * 0.8 - 0.4;

          const grp = new THREE.Group();
          grp.add(pod);
          grp.add(ring);
          mesh = grp;
        }

        mesh.position.set(dx, -0.15 + rand() * 0.2, dz);
        root.add(mesh);
      }

      // ── Glowing tech cores ────────────────────────────────────────────────
      this._debrisCores      = [];
      this._debrisCoreLights = [];
      const CORE_COUNT = 4;
      for (let i = 0; i < CORE_COUNT; i++) {
        const angle  = (i / CORE_COUNT) * PI * 2 + 0.3;
        const radius = 2.0 + rand() * 3.0;
        const cx     = Math.cos(angle) * radius;
        const cz     = Math.sin(angle) * radius;

        const coreGeo  = new THREE.OctahedronGeometry(0.18, 0);
        const coreMat  = new THREE.MeshBasicMaterial({ color: 0x00aaff });
        const core     = new THREE.Mesh(coreGeo, coreMat);
        core.position.set(cx, 0.05, cz);
        root.add(core);
        this._debrisCores.push(core);

        const cLight = new THREE.PointLight(0x0088ff, 0.4, 4);
        cLight.position.set(cx, 0.3, cz);
        root.add(cLight);
        this._debrisCoreLights.push(cLight);
      }

      // ── Steam vents ───────────────────────────────────────────────────────
      this._debrisSteam = [];
      const VENT_COUNT = 4;
      const ventPositions = [
        [-1.5, 0, -1.5],
        [ 1.5, 0, -1.0],
        [-2.0, 0,  1.8],
        [ 2.5, 0,  1.0]
      ];
      for (let v = 0; v < VENT_COUNT; v++) {
        const [vx, vy, vz] = ventPositions[v];
        const ventParticles = [];
        const steamMat = new THREE.MeshBasicMaterial({ color: 0xddddff, transparent: true, opacity: 0.6 });
        for (let p = 0; p < 8; p++) {
          const sGeo  = new THREE.SphereGeometry(0.06, 4, 3);
          const sMesh = new THREE.Mesh(sGeo, steamMat.clone());
          sMesh.position.set(
            vx + (rand() - 0.5) * 0.2,
            vy + rand() * 2.5,
            vz + (rand() - 0.5) * 0.2
          );
          sMesh.userData.life = rand(); // normalised 0–1 over 2.5s
          sMesh.userData.baseX = vx;
          sMesh.userData.baseZ = vz;
          root.add(sMesh);
          ventParticles.push(sMesh);
        }
        this._debrisSteam.push(ventParticles);

        const vLight = new THREE.PointLight(0x4488ff, 0.2, 3);
        vLight.position.set(vx, vy + 0.3, vz);
        root.add(vLight);
      }

      // ── Warning panel ─────────────────────────────────────────────────────
      const panelGeo = new THREE.BoxGeometry(1.2, 0.8, 0.06);
      const panelMat = new THREE.MeshLambertMaterial({ color: 0x1a2230, emissive: 0x060810 });
      const panel    = new THREE.Mesh(panelGeo, panelMat);
      panel.position.set(-3.5, 0.15, 2.5);
      panel.rotation.set(0.4, 0.5, 0.2);
      root.add(panel);

      // Warning symbol — chevron shape made from boxes
      const symMat = new THREE.MeshBasicMaterial({ color: 0xcc2200 });
      const symOffsets = [
        { x: 0, y: 0.15, sx: 0.6, sy: 0.08, sz: 0.05 },
        { x: 0, y: -0.1, sx: 0.4, sy: 0.08, sz: 0.05 }
      ];
      for (const o of symOffsets) {
        const sGeo  = new THREE.BoxGeometry(o.sx, o.sy, o.sz);
        const sSymb = new THREE.Mesh(sGeo, symMat);
        sSymb.position.set(o.x, o.y, 0.06);
        panel.add(sSymb);
      }
      // Triangle indicator
      const triGeo  = new THREE.ConeGeometry(0.15, 0.25, 3);
      const triMesh = new THREE.Mesh(triGeo, symMat);
      triMesh.position.set(0, -0.22, 0.06);
      panel.add(triMesh);

      this._debrisRoot = root;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // LANDMARK C — ANCIENT STONE WELL  (10, 0, 25)
    // ══════════════════════════════════════════════════════════════════════════
    _buildStoneWell() {
      const THREE = global.THREE;
      const PI    = Math.PI;
      const rand  = Math.random.bind(Math);

      const root = new THREE.Group();
      root.position.set(10, 0, 25);
      this.scene.add(root);

      // ── Well body ─────────────────────────────────────────────────────────
      const outerGeo  = new THREE.CylinderGeometry(1.1, 1.2, 1.0, 12, 1, true);
      const outerMat  = new THREE.MeshLambertMaterial({ color: 0x7a6a55, emissive: 0x0a0906, side: THREE.DoubleSide });
      const outerWall = new THREE.Mesh(outerGeo, outerMat);
      outerWall.position.y = 0.5;
      root.add(outerWall);

      const voidGeo  = new THREE.CylinderGeometry(0.85, 0.85, 1.1, 12, 1, true);
      const voidMat  = new THREE.MeshBasicMaterial({ color: 0x020202, side: THREE.BackSide });
      const voidMesh = new THREE.Mesh(voidGeo, voidMat);
      voidMesh.position.y = 0.55;
      root.add(voidMesh);

      const capGeo  = new THREE.TorusGeometry(1.15, 0.18, 6, 12);
      const capMat  = new THREE.MeshLambertMaterial({ color: 0x8a7a62, emissive: 0x0a0906 });
      const capTorus = new THREE.Mesh(capGeo, capMat);
      capTorus.position.y = 1.0;
      root.add(capTorus);

      // Crumbling stones around base
      const csMat = new THREE.MeshLambertMaterial({ color: 0x6a5a48, emissive: 0x080704 });
      for (let i = 0; i < 4; i++) {
        const a   = (i / 4) * PI * 2 + rand() * 0.4;
        const r   = 1.3 + rand() * 0.5;
        const sz  = 0.22 + rand() * 0.13;
        const csGeo  = new THREE.DodecahedronGeometry(sz, 0);
        const csMesh = new THREE.Mesh(csGeo, csMat);
        csMesh.position.set(Math.cos(a) * r, sz * 0.4, Math.sin(a) * r);
        csMesh.rotation.y = rand() * PI * 2;
        root.add(csMesh);
      }

      // Moss patches on exterior
      const mossMat = new THREE.MeshLambertMaterial({ color: 0x1e3d10, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
      for (let i = 0; i < 4; i++) {
        const a    = (i / 4) * PI * 2;
        const r    = 1.15;
        const mSz  = 0.4 + rand() * 0.3;
        const mGeo  = new THREE.CircleGeometry(mSz, 8);
        const mMesh = new THREE.Mesh(mGeo, mossMat.clone());
        mMesh.position.set(Math.cos(a) * r, 0.3 + rand() * 0.4, Math.sin(a) * r);
        mMesh.rotation.y  = a + PI / 2;
        mMesh.rotation.x  = PI / 2;
        root.add(mMesh);
      }

      // ── Crossbeam ─────────────────────────────────────────────────────────
      const beamGeo  = new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6);
      const beamMat  = new THREE.MeshLambertMaterial({ color: 0x3a2510, emissive: 0x080400 });
      const beam     = new THREE.Mesh(beamGeo, beamMat);
      beam.rotation.z = PI / 2;
      beam.position.y = 1.25;
      root.add(beam);

      const winchGeo  = new THREE.TorusGeometry(0.2, 0.04, 5, 8);
      const winchMat  = new THREE.MeshLambertMaterial({ color: 0x4a3520, emissive: 0x080400 });
      const winch     = new THREE.Mesh(winchGeo, winchMat);
      winch.position.y = 1.25;
      root.add(winch);

      // ── Rope segments ─────────────────────────────────────────────────────
      const ropeMat  = new THREE.MeshLambertMaterial({ color: 0x8a7040 });
      this._wellRopeSegs = [];
      for (let i = 0; i < 8; i++) {
        const rGeo  = new THREE.CylinderGeometry(0.02, 0.02, 0.12, 4);
        const rMesh = new THREE.Mesh(rGeo, ropeMat);
        rMesh.position.set(0, 1.2 - i * 0.13, 0);
        root.add(rMesh);
        this._wellRopeSegs.push(rMesh);
      }

      // ── Mysterious glow ───────────────────────────────────────────────────
      const glowLight = new THREE.PointLight(0x0044ff, 0.3, 3);
      glowLight.position.set(0, -1.5, 0);
      root.add(glowLight);
      this._wellGlowLight = glowLight;

      const glowSphGeo = new THREE.SphereGeometry(0.3, 6, 5);
      const glowSphMat = new THREE.MeshBasicMaterial({ color: 0x0033aa, transparent: true, opacity: 0.12 });
      const glowSph    = new THREE.Mesh(glowSphGeo, glowSphMat);
      glowSph.position.set(0, 0.1, 0);
      root.add(glowSph);

      // ── Water surface ─────────────────────────────────────────────────────
      const waterGeo  = new THREE.CircleGeometry(0.78, 12);
      const waterMat  = new THREE.MeshLambertMaterial({
        color: 0x112233, transparent: true, opacity: 0.7, emissive: 0x000511, side: THREE.DoubleSide
      });
      const waterMesh = new THREE.Mesh(waterGeo, waterMat);
      waterMesh.rotation.x = -PI / 2;
      waterMesh.position.y = -0.2;
      root.add(waterMesh);
      this._wellWaterMesh = waterMesh;

      this._wellRoot = root;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // update(dt, playerPos) — called every frame from the sandbox animate loop
    // ══════════════════════════════════════════════════════════════════════════
    update(dt, playerPos) {
      const THREE = global.THREE;

      this.fireTime   += dt;
      this.debrisTime += dt;
      this.wellTime   += dt;

      // Performance: skip particle updates if player is too far away
      const MAX_PARTICLE_DIST = 60; // Only animate particles within 60 units
      const MAX_PARTICLE_DIST_SQ = MAX_PARTICLE_DIST * MAX_PARTICLE_DIST;

      // Fire Circle at (-18, 0, -28)
      var fireDistSq = Infinity;
      if (playerPos && typeof playerPos.x === 'number' && typeof playerPos.z === 'number') {
        var dx = -18 - playerPos.x;
        var dz = -28 - playerPos.z;
        fireDistSq = dx * dx + dz * dz;
      }
      if (fireDistSq < MAX_PARTICLE_DIST_SQ) {
        this._updateFireCircle(dt);
      } else {
        // Still update light flicker for distant fire
        if (this._fireLight) {
          const t = this.fireTime;
          const flicker = 1.0 + Math.sin(t * 8.5) * 0.25 + Math.sin(t * 13.2) * 0.12;
          this._fireLight.intensity = 1.4 * flicker;
          if (this._fireLight2) this._fireLight2.intensity = 0.3 * flicker;
        }
      }

      // Alien Crash at (-30, 0, -55)
      var debrisDistSq = Infinity;
      if (playerPos && typeof playerPos.x === 'number' && typeof playerPos.z === 'number') {
        var dx2 = -30 - playerPos.x;
        var dz2 = -55 - playerPos.z;
        debrisDistSq = dx2 * dx2 + dz2 * dz2;
      }
      if (debrisDistSq < MAX_PARTICLE_DIST_SQ) {
        this._updateAlienCrash(dt);
      }

      // Stone Well at (10, 0, 25)
      var wellDistSq = Infinity;
      if (playerPos && typeof playerPos.x === 'number' && typeof playerPos.z === 'number') {
        var dx3 = 10 - playerPos.x;
        var dz3 = 25 - playerPos.z;
        wellDistSq = dx3 * dx3 + dz3 * dz3;
      }
      if (wellDistSq < MAX_PARTICLE_DIST_SQ) {
        this._updateStoneWell(dt);
      }
    }

    // ── Fire Circle update ────────────────────────────────────────────────────
    _updateFireCircle(dt) {
      const THREE = global.THREE;
      const t     = this.fireTime;

      // Flame InstancedMesh
      if (this._fireFlamesMesh && this._fireFlameData.length > 0) {
        const dummy = new THREE.Object3D();
        for (let i = 0; i < this._fireFlameData.length; i++) {
          const d      = this._fireFlameData[i];
          const y      = 0.1 + Math.abs(Math.sin(t * d.speed + d.phase)) * 0.5;
          const scaleY = 0.6 + Math.sin(t * d.speed * 1.3 + d.phase) * 0.4;
          const scaleX = 0.8 + Math.cos(t * d.speed * 0.7) * 0.2;

          dummy.position.set(d.posX, y, d.posZ);
          dummy.scale.set(scaleX, scaleY, scaleX);
          dummy.rotation.y = t * 0.3;
          dummy.updateMatrix();
          this._fireFlamesMesh.setMatrixAt(i, dummy.matrix);
        }
        this._fireFlamesMesh.instanceMatrix.needsUpdate = true;
      }

      // Ember particles — drift up and fade, reset at base
      for (const e of this._fireEmbers) {
        e.userData.life += dt * 0.5; // drift speed: full cycle ~2 s
        if (e.userData.life >= 1.0) {
          e.userData.life = 0;
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 0.35;
          e.userData.baseX = Math.cos(a) * r;
          e.userData.baseZ = Math.sin(a) * r;
        }
        e.position.x = e.userData.baseX;
        e.position.y = e.userData.life * 1.5;
        e.position.z = e.userData.baseZ;
        e.material.opacity = Math.max(0, 1.0 - e.userData.life * 1.4);
      }

      // Smoke particles — drift up slowly over 3 s, fade, reset
      for (const s of this._fireSmoke) {
        s.userData.life += dt / 3.0;
        if (s.userData.life >= 1.0) {
          s.userData.life = 0;
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 0.4;
          s.userData.baseX = Math.cos(a) * r;
          s.userData.baseZ = Math.sin(a) * r;
        }
        // Deterministic drift using stored phase and current time
        const drift = Math.sin(t * 1.2 + s.userData.driftPhase) * 0.05;
        s.position.x = s.userData.baseX + drift;
        s.position.y = s.userData.life * 3.0;
        s.position.z = s.userData.baseZ + Math.cos(t * 0.9 + s.userData.driftPhase) * 0.05;
        s.material.opacity = Math.max(0, 0.4 * (1.0 - s.userData.life));
      }

      // Fire light flicker (both lights)
      if (this._fireLight) {
        const flicker = 1.0 + Math.sin(t * 8.5) * 0.25 + Math.sin(t * 13.2) * 0.12;
        this._fireLight.intensity = 1.4 * flicker;
        if (this._fireLight2) this._fireLight2.intensity = 0.3 * flicker;
      }
    }

    // ── Alien Crash update ────────────────────────────────────────────────────
    _updateAlienCrash(dt) {
      const t = this.debrisTime;

      // Pulse glowing tech cores
      for (let i = 0; i < this._debrisCores.length; i++) {
        const core  = this._debrisCores[i];
        const light = this._debrisCoreLights[i];
        const corePulse = 0.3 + Math.sin(t * 1.8 + i * 1.3) * 0.15;
        if (light) light.intensity = corePulse;
        core.scale.setScalar(1.0 + Math.sin(t * 2.4 + i) * 0.06);
      }

      // Steam vent particles — drift up over 2.5 s life, fade white→transparent, reset
      for (const ventParticles of this._debrisSteam) {
        for (const p of ventParticles) {
          p.userData.life += dt / 2.5;
          if (p.userData.life >= 1.0) {
            p.userData.life = 0;
            p.position.set(
              p.userData.baseX + (Math.random() - 0.5) * 0.2,
              0,
              p.userData.baseZ + (Math.random() - 0.5) * 0.2
            );
          }
          p.position.y = p.userData.life * 2.5;
          p.material.opacity = Math.max(0, 0.6 * (1.0 - p.userData.life));
        }
      }
    }

    // ── Stone Well update ─────────────────────────────────────────────────────
    _updateStoneWell(dt) {
      const t = this.wellTime;

      // Rope sway
      const ropeSway = Math.sin(t * 0.8) * 0.02;
      for (let i = 0; i < this._wellRopeSegs.length; i++) {
        this._wellRopeSegs[i].position.x = ropeSway * (i * 0.15);
      }

      // Mysterious glow pulse
      if (this._wellGlowLight) {
        const wellPulse = 0.2 + Math.sin(t * 0.6) * 0.15;
        this._wellGlowLight.intensity = wellPulse;
      }

      // Water surface slow rotation
      if (this._wellWaterMesh) {
        this._wellWaterMesh.rotation.z += dt * 0.05;
      }
    }
  }

  // Expose globally
  global.BonusLandmarks = BonusLandmarks;

})(window);
