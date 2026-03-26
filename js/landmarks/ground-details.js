// ─────────────────────────────────────────────────────────────────────────────
// ground-details.js  —  Waterdrop Survivor Engine 2.0
// Tall-grass patches, fallen logs, rock clusters, and scatter debris.
// No external assets — Three.js geometry only.
// Exposes: window.GroundDetails
// ─────────────────────────────────────────────────────────────────────────────
;(function (global) {
  'use strict';

  // ─── GRASS CONFIG ─────────────────────────────────────────────────────────

  // 18 grass patches: [x, z, bladeCount]
  var GRASS_PATCHES = [
    [-15, -18, 22], [18, 22, 18], [-28, 12, 25], [35, -18, 20],
    [-40, -45, 30], [50, 40, 16], [-55, 25, 22], [15, -50, 28],
    [-22, 48, 20], [42, -42, 24], [-62, -20, 18], [60, 10, 22],
    [8, 35, 15], [-35, 55, 26], [28, 58, 18], [-48, -62, 30],
    [65, -35, 20], [-12, -65, 22]
  ];

  var GRASS_SCATTER_RADIUS = 1.8;
  var GRASS_BLADE_WIDTH    = 0.06;
  var GRASS_BLADE_HEIGHT   = 0.5;

  // ─── LOG CONFIG ───────────────────────────────────────────────────────────

  // [x, z, rotY, length, radius, mossy]
  var LOG_DEFS = [
    [-25,  30, 0.8, 4.5, 0.28, true],
    [ 40, -25, 2.1, 3.8, 0.22, false],
    [-50, -15, 0.3, 5.2, 0.35, true],
    [ 30,  45, 1.4, 3.2, 0.20, false],
    [-15, -42, 2.8, 4.0, 0.25, true],
    [ 55,  55, 0.5, 3.5, 0.18, false],
    [-60,  40, 1.9, 4.8, 0.30, true],
    [ 20, -65, 3.2, 3.0, 0.24, false]
  ];

  // ─── ROCK CLUSTER CONFIG ──────────────────────────────────────────────────

  // [x, z, count, sizeKey]  sizeKey: 0=large, 1=medium, 2=small
  var ROCK_CLUSTERS = [
    [-32,  -8, 5, 0], [ 22,  38, 3, 1], [-18,  25, 4, 1], [ 48, -50, 6, 0],
    [-58,  50, 4, 1], [ 38,  10, 3, 2], [-42, -55, 5, 0], [ 65,  50, 3, 1],
    [ -8,  60, 4, 2], [ 15, -38, 3, 2]
  ];

  // Radius ranges per size key [min, max]
  var ROCK_SIZE_RANGE = [
    [0.45, 0.85],  // large
    [0.28, 0.55],  // medium
    [0.15, 0.30]   // small
  ];

  // ─── DEBRIS CONFIG ────────────────────────────────────────────────────────

  var BONE_POSITIONS    = [[-22, -28], [-42, 38], [-12, 20]];
  var ARTIFACT_POSITIONS = [[32, -12], [18, 42], [45, 22]];

  // ─── Helper ───────────────────────────────────────────────────────────────

  function rnd() { return Math.random(); }
  function rndRange(a, b) { return a + rnd() * (b - a); }

  // ─────────────────────────────────────────────────────────────────────────

  var GroundDetails = function (scene) {
    this.scene      = scene;
    this.globalTime = 0;
    this._frameCount = 0;

    // Grass state
    this._grassMesh  = null;  // THREE.InstancedMesh
    this._blades     = [];    // per-blade data

    // Reusable dummy Object3D for matrix computation
    this._dummy = new THREE.Object3D();

    this._init();
  };

  // ─── Init ──────────────────────────────────────────────────────────────────

  GroundDetails.prototype._init = function () {
    try { this._createGrass();   } catch (e) { console.warn('[GroundDetails] grass error:', e); }
    try { this._createLogs();    } catch (e) { console.warn('[GroundDetails] logs error:', e); }
    try { this._createRocks();   } catch (e) { console.warn('[GroundDetails] rocks error:', e); }
    try { this._createDebris();  } catch (e) { console.warn('[GroundDetails] debris error:', e); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PART 1 — GRASS
  // ─────────────────────────────────────────────────────────────────────────

  GroundDetails.prototype._createGrass = function () {
    if (!this.scene) return;

    // Count total blades
    var total = 0;
    for (var p = 0; p < GRASS_PATCHES.length; p++) {
      total += GRASS_PATCHES[p][2];
    }

    // Shared geometry — PlaneGeometry pivoted at bottom
    var geo = new THREE.PlaneGeometry(GRASS_BLADE_WIDTH, GRASS_BLADE_HEIGHT);
    // Shift vertices so the bottom sits at y=0 (enables base-pivot rotation)
    geo.translate(0, GRASS_BLADE_HEIGHT * 0.5, 0);

    // Base material — the InstancedMesh will use per-instance color
    var mat = new THREE.MeshLambertMaterial({
      color: 0x2d5a12,
      emissive: 0x081500,
      transparent: true,
      side: THREE.DoubleSide
    });

    var mesh = new THREE.InstancedMesh(geo, mat, total);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    // Assign per-instance colors and build blade data array
    var colorBase   = new THREE.Color(0x2d5a12);
    var colorDark   = new THREE.Color(0x1e3d0a);
    var colorDying  = new THREE.Color(0x4a6a1a);
    var tempColor   = new THREE.Color();

    var idx = 0;
    for (var pi = 0; pi < GRASS_PATCHES.length; pi++) {
      var patch = GRASS_PATCHES[pi];
      var cx = patch[0], cz = patch[1], count = patch[2];

      for (var bi = 0; bi < count; bi++) {
        // Scatter position within patch radius
        var angle  = rnd() * Math.PI * 2;
        var dist   = rnd() * GRASS_SCATTER_RADIUS;
        var px = cx + Math.cos(angle) * dist;
        var pz = cz + Math.sin(angle) * dist;

        // Random color assignment: 30% dark, 15% dying, 55% base
        var cr = rnd();
        if (cr < 0.30) {
          tempColor.copy(colorDark);
        } else if (cr < 0.45) {
          tempColor.copy(colorDying);
        } else {
          tempColor.copy(colorBase);
        }
        mesh.setColorAt(idx, tempColor);

        // Blade data
        this._blades.push({
          px: px,
          pz: pz,
          rotY: rnd() * Math.PI * 2,
          windPhase: rnd() * Math.PI * 2,
          disturbTime: 0,
          disturbDir: 0
        });

        idx++;
      }
    }

    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }

    // Initial matrix pass (all upright at t=0)
    var dummy = this._dummy;
    for (var i = 0; i < this._blades.length; i++) {
      var blade = this._blades[i];
      dummy.position.set(blade.px, 0, blade.pz);
      dummy.rotation.order = 'YXZ';
      dummy.rotation.y = blade.rotY;
      dummy.rotation.x = 0;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    this.scene.add(mesh);
    this._grassMesh = mesh;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PART 2 — FALLEN LOGS
  // ─────────────────────────────────────────────────────────────────────────

  GroundDetails.prototype._createLogs = function () {
    if (!this.scene) return;

    var matBark = new THREE.MeshLambertMaterial({ color: 0x4a3018, emissive: 0x060300 });
    var matEnd  = new THREE.MeshLambertMaterial({ color: 0x3d2510, emissive: 0x030100 });
    var matMoss = new THREE.MeshLambertMaterial({ color: 0x1e4010, emissive: 0x040a02 });
    var matRing = new THREE.MeshLambertMaterial({ color: 0x3d2510, emissive: 0x030100 });

    for (var li = 0; li < LOG_DEFS.length; li++) {
      var def = LOG_DEFS[li];
      var lx = def[0], lz = def[1], lRotY = def[2];
      var length = def[3], radius = def[4], mossy = def[5];

      var group = new THREE.Group();
      group.position.set(lx, radius, lz);
      group.rotation.y = lRotY;

      // ── Main log body (tapered cylinder) ──────────────────────────────
      var cyl = new THREE.CylinderGeometry(radius, radius * 0.85, length, 8);
      var logMesh = new THREE.Mesh(cyl, matBark);
      logMesh.rotation.z = Math.PI / 2;  // lie on side
      logMesh.castShadow = true;
      logMesh.receiveShadow = true;
      group.add(logMesh);

      // ── End caps & tree rings ─────────────────────────────────────────
      var ringCounts = [3, 4];
      for (var side = 0; side < 2; side++) {
        var xOff = side === 0 ? -length / 2 : length / 2;

        // End cap disc
        var capGeo = new THREE.CircleGeometry(radius, 8);
        var capMesh = new THREE.Mesh(capGeo, matEnd);
        capMesh.rotation.y = Math.PI / 2;
        capMesh.position.x = xOff;
        group.add(capMesh);

        // Torus tree rings (3-4 per end)
        var nRings = ringCounts[side];
        for (var ri = 0; ri < nRings; ri++) {
          var ringR = radius * (0.3 + (ri / nRings) * 0.65);
          var ringGeo = new THREE.TorusGeometry(ringR, 0.012, 4, 12);
          var ringMesh = new THREE.Mesh(ringGeo, matRing);
          ringMesh.rotation.y = Math.PI / 2;
          ringMesh.position.x = xOff + (side === 0 ? 0.01 : -0.01);
          group.add(ringMesh);
        }
      }

      // ── Bark strips ───────────────────────────────────────────────────
      var stripCount = Math.floor(rndRange(4, 7));
      for (var si = 0; si < stripCount; si++) {
        var sAngle = (si / stripCount) * Math.PI * 2 + rnd() * 0.3;
        var stripGeo = new THREE.BoxGeometry(0.04, length * 0.9, 0.04);
        var strip = new THREE.Mesh(stripGeo, matBark);
        // Log lies along X (rotation.z = π/2), so circumference is in YZ plane
        strip.position.set(
          0,
          Math.cos(sAngle) * radius * 1.01,
          Math.sin(sAngle) * radius * 1.01
        );
        strip.rotation.z = Math.PI / 2;
        group.add(strip);
      }

      // ── Moss patches (mossy logs only) ────────────────────────────────
      if (mossy) {
        var mossCount = Math.floor(rndRange(3, 5));
        for (var mi = 0; mi < mossCount; mi++) {
          var mossGeo = new THREE.CircleGeometry(rndRange(0.18, 0.35), 7);
          var mossMesh = new THREE.Mesh(mossGeo, matMoss);
          // Place moss along the log's length (X axis), slightly above the surface
          var mossT = rndRange(-length * 0.4, length * 0.4);
          mossMesh.position.set(mossT, radius + 0.01, 0);
          mossMesh.rotation.z = Math.PI / 2;
          mossMesh.rotation.y = rnd() * Math.PI * 2;
          group.add(mossMesh);
        }
      }

      // ── Broken stub at one end ────────────────────────────────────────
      var stubGeo = new THREE.ConeGeometry(radius * 0.7, 0.35, 7);
      var stub = new THREE.Mesh(stubGeo, matBark);
      stub.rotation.z = Math.PI / 2;
      stub.position.x = -length / 2 - 0.18;
      group.add(stub);

      this.scene.add(group);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PART 3 — ROCK CLUSTERS
  // ─────────────────────────────────────────────────────────────────────────

  GroundDetails.prototype._createRocks = function () {
    if (!this.scene) return;

    // Shared unit-radius geometry — each rock is scaled to the desired size
    var sharedRockGeo   = new THREE.DodecahedronGeometry(1, 0);
    var sharedPebbleGeo = new THREE.DodecahedronGeometry(1, 0);

    // Shared materials — one per color variant
    var matA    = new THREE.MeshLambertMaterial({ color: 0x6b6055 });
    var matB    = new THREE.MeshLambertMaterial({ color: 0x4a4440 });
    var matC    = new THREE.MeshLambertMaterial({ color: 0x8a7a6a });
    var matMoss = new THREE.MeshLambertMaterial({ color: 0x253a12, emissive: 0x081502 });
    var matPebb = matA; // pebbles reuse the neutral rock material

    for (var ci = 0; ci < ROCK_CLUSTERS.length; ci++) {
      var clust = ROCK_CLUSTERS[ci];
      var cx = clust[0], cz = clust[1], count = clust[2], sizeKey = clust[3];
      var sizeRange = ROCK_SIZE_RANGE[sizeKey];

      for (var ri = 0; ri < count; ri++) {
        var baseRadius = rndRange(sizeRange[0], sizeRange[1]);

        // Pick shared material by color variant
        var cr = rnd();
        var rockMat;
        if (cr < 0.30)      { rockMat = matB; }
        else if (cr < 0.50) { rockMat = matC; }
        else                { rockMat = matA; }

        var rock = new THREE.Mesh(sharedRockGeo, rockMat);

        // Scale to desired size (non-uniform for visual variety)
        rock.scale.set(
          baseRadius * rndRange(0.7, 1.3),
          baseRadius * rndRange(0.5, 0.9),
          baseRadius * rndRange(0.8, 1.2)
        );
        // Random rotation all axes
        rock.rotation.set(rnd() * Math.PI * 2, rnd() * Math.PI * 2, rnd() * Math.PI * 2);

        // Scatter position
        var angle = rnd() * Math.PI * 2;
        var dist  = rnd() * (sizeRange[1] * 2.5 + 0.5);
        var rx = cx + Math.cos(angle) * dist;
        var rz = cz + Math.sin(angle) * dist;
        // Half-bury: y between -0.1*radius and +0.3*radius
        var ry = rndRange(-0.1, 0.3) * baseRadius;
        rock.position.set(rx, ry, rz);
        rock.castShadow = true;
        rock.receiveShadow = true;
        this.scene.add(rock);

        // Moss on 50% of rocks
        if (rnd() < 0.5) {
          var mossGeo = new THREE.CircleGeometry(baseRadius * rndRange(0.3, 0.55), 6);
          var moss = new THREE.Mesh(mossGeo, matMoss);
          moss.position.set(rx, ry + baseRadius * rock.scale.y * 0.85, rz);
          moss.rotation.x = -Math.PI / 2;
          this.scene.add(moss);
        }
      }

      // ── Pebbles (6-10 per cluster) ────────────────────────────────────
      var pebbleCount = Math.floor(rndRange(6, 11));
      for (var pi = 0; pi < pebbleCount; pi++) {
        var pr = rndRange(0.05, 0.12);
        var pebble = new THREE.Mesh(sharedPebbleGeo, matPebb);
        pebble.scale.setScalar(pr);
        var pa = rnd() * Math.PI * 2;
        var pd = rnd() * 1.5;
        pebble.position.set(
          cx + Math.cos(pa) * pd,
          0,
          cz + Math.sin(pa) * pd
        );
        pebble.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
        this.scene.add(pebble);
      }
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PART 4 — SCATTER DEBRIS (bones + artifacts)
  // ─────────────────────────────────────────────────────────────────────────

  GroundDetails.prototype._createDebris = function () {
    if (!this.scene) return;

    var matBone     = new THREE.MeshLambertMaterial({ color: 0xd4c8a0 });
    var matArtifact = new THREE.MeshLambertMaterial({ color: 0x4a3820 });
    var matGold     = new THREE.MeshLambertMaterial({ color: 0xc8a84b, emissive: 0x4a3000 });

    // ── Bones ─────────────────────────────────────────────────────────────
    for (var bi = 0; bi < BONE_POSITIONS.length; bi++) {
      var bx = BONE_POSITIONS[bi][0], bz = BONE_POSITIONS[bi][1];
      var boneCount = Math.floor(rndRange(2, 4));

      for (var bc = 0; bc < boneCount; bc++) {
        var bGeo = new THREE.CylinderGeometry(0.025, 0.02, 0.4, 5);
        var bone = new THREE.Mesh(bGeo, matBone);
        bone.position.set(
          bx + rndRange(-0.4, 0.4),
          0.02,
          bz + rndRange(-0.4, 0.4)
        );
        // Lie flat at various angles
        bone.rotation.set(
          Math.PI / 2 + rndRange(-0.3, 0.3),
          rnd() * Math.PI * 2,
          rndRange(-0.5, 0.5)
        );
        this.scene.add(bone);
      }
    }

    // ── Artifacts ─────────────────────────────────────────────────────────
    for (var ai = 0; ai < ARTIFACT_POSITIONS.length; ai++) {
      var ax = ARTIFACT_POSITIONS[ai][0], az = ARTIFACT_POSITIONS[ai][1];

      // Half-buried box
      var aGeo = new THREE.BoxGeometry(0.18, 0.14, 0.18);
      var artifact = new THREE.Mesh(aGeo, matArtifact);
      artifact.position.set(ax, -0.04, az);  // half-buried
      artifact.rotation.y = rnd() * Math.PI * 2;
      this.scene.add(artifact);

      // Gold edge strips (4 edges) — parented to artifact so they follow its rotation
      for (var gs = 0; gs < 4; gs++) {
        var gAngle = (gs / 4) * Math.PI * 2 + Math.PI / 4;
        var gGeo = new THREE.BoxGeometry(0.03, 0.15, 0.03);
        var gStrip = new THREE.Mesh(gGeo, matGold);
        // Position and rotation in artifact-local space so strips follow artifact rotation
        gStrip.position.set(
          Math.cos(gAngle) * 0.085,
          0.02,  // relative to artifact center (-0.04 world y)
          Math.sin(gAngle) * 0.085
        );
        gStrip.rotation.y = gAngle;
        artifact.add(gStrip);
      }
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────────────────

  GroundDetails.prototype.update = function (dt, playerPos) {
    this.globalTime += dt;
    this._frameCount++;
    this._updateGrass(dt, playerPos);
  };

  // ─── Grass wind + disturbance ──────────────────────────────────────────────

  GroundDetails.prototype._updateGrass = function (dt, playerPos) {
    var mesh = this._grassMesh;
    if (!mesh) return;

    var dummy        = this._dummy;
    var blades       = this._blades;
    var t0           = this.globalTime;
    // Extra safety: check playerPos exists and has valid x/z properties
    var checkPlayer  = (this._frameCount % 4 === 0) &&
                       !!playerPos &&
                       typeof playerPos.x === 'number' &&
                       typeof playerPos.z === 'number';

    // Performance optimization: only update blades within reasonable distance
    var MAX_UPDATE_DIST_SQ = 80 * 80; // Only update grass within 80 units
    var px = playerPos ? playerPos.x : 0;
    var pz = playerPos ? playerPos.z : 0;

    for (var i = 0; i < blades.length; i++) {
      var blade = blades[i];

      // Skip distant blades for performance (static wind animation only)
      var distSq = 0;
      if (playerPos) {
        var dx_cam = blade.px - px;
        var dz_cam = blade.pz - pz;
        distSq = dx_cam * dx_cam + dz_cam * dz_cam;
      }

      // ── Player disturbance check (every 4 frames, only for nearby blades) ──
      if (checkPlayer && distSq < MAX_UPDATE_DIST_SQ) {
        var dx = blade.px - playerPos.x;
        var dz = blade.pz - playerPos.z;
        var d2 = dx * dx + dz * dz;
        if (d2 < 1.4 * 1.4) {
          blade.disturbTime = 1.2;
          blade.disturbDir  = dx >= 0 ? 1 : -1;  // sign(blade.x - player.x)
        }
      }

      // ── Decay disturbance ──────────────────────────────────────────────
      if (blade.disturbTime > 0) {
        blade.disturbTime -= dt;
        if (blade.disturbTime < 0) blade.disturbTime = 0;
      }

      // ── Wind sway ─────────────────────────────────────────────────────
      var t    = t0 + blade.windPhase;
      var sway = Math.sin(t * 1.2) * 0.12 + Math.sin(t * 2.3) * 0.05;

      // ── Disturbance lean ──────────────────────────────────────────────
      var lean = 0;
      if (blade.disturbTime > 0) {
        lean = (blade.disturbTime / 1.2) * 0.55 * blade.disturbDir;
      }

      // ── Build instance matrix (pivot at blade base) ───────────────────
      dummy.position.set(blade.px, 0, blade.pz);
      dummy.rotation.order = 'YXZ';
      dummy.rotation.y = blade.rotY;
      dummy.rotation.x = sway + lean;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  };

  // ─────────────────────────────────────────────────────────────────────────

  global.GroundDetails = GroundDetails;

})(window);
