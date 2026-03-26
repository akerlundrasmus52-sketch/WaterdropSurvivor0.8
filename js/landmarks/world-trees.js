// =============================================================================
// world-trees.js — WorldTrees landmark system for Waterdrop Survivor Engine 2.0
// 12 procedural trees scattered around the 200×200 arena.
// Three varieties: Ancient Oak, Alien Pine, Dead Ancient Tree.
// Wind sway, collision shake, leaf particle pool.
// =============================================================================
;(function(global) {
  'use strict';

  var PI = Math.PI;

  // ---------------------------------------------------------------------------
  // TREE DEFINITIONS — 12 hardcoded positions
  // ---------------------------------------------------------------------------
  var TREE_DEFS = [
    { x: -70, z: -60, scale: 1.0,  variety: 0 },
    { x: -55, z:  45, scale: 1.3,  variety: 1 },
    { x: -80, z:  10, scale: 0.85, variety: 0 },
    { x:  60, z: -55, scale: 1.1,  variety: 2 },
    { x:  75, z:  30, scale: 0.9,  variety: 1 },
    { x:  20, z: -75, scale: 1.2,  variety: 0 },
    { x: -20, z:  70, scale: 1.0,  variety: 2 },
    { x:  45, z:  65, scale: 1.4,  variety: 1 },
    { x: -45, z: -30, scale: 0.8,  variety: 0 },
    { x:  10, z:  50, scale: 1.1,  variety: 2 },
    { x: -60, z:  60, scale: 1.0,  variety: 1 },
    { x:  55, z: -20, scale: 1.2,  variety: 0 }
  ];

  // ---------------------------------------------------------------------------
  // COLLISION CONSTANTS
  // ---------------------------------------------------------------------------
  var COLLIDE_RADIUS = 1.2;

  // ---------------------------------------------------------------------------
  // LEAF PARTICLE POOL
  // ---------------------------------------------------------------------------
  var LEAF_POOL_SIZE = 60;

  // ==========================================================================
  // WorldTrees constructor
  // ==========================================================================
  function WorldTrees(scene) {
    this.scene = scene;
    this._trees = [];      // array of tree objects
    this._leaves = [];     // leaf particle pool

    this._initLeafPool();
    this._buildTrees();
  }

  // --------------------------------------------------------------------------
  // LEAF PARTICLE POOL — initialise 60 dormant leaf meshes
  // --------------------------------------------------------------------------
  WorldTrees.prototype._initLeafPool = function() {
    var geo = new THREE.PlaneGeometry(0.08, 0.06);
    var mat1 = new THREE.MeshBasicMaterial({
      color: 0x1a3d0a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0
    });
    var mat2 = new THREE.MeshBasicMaterial({
      color: 0x2d5a10,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0
    });

    for (var i = 0; i < LEAF_POOL_SIZE; i++) {
      var mat = (i % 2 === 0) ? mat1.clone() : mat2.clone();
      var mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.userData.active = false;
      this.scene.add(mesh);
      this._leaves.push({
        mesh: mesh,
        active: false,
        life: 0,
        vel: new THREE.Vector3(),
        spin: 0
      });
    }
  };

  // --------------------------------------------------------------------------
  // Spawn 5–8 leaves near a given world position
  // --------------------------------------------------------------------------
  WorldTrees.prototype._spawnLeaves = function(pos, count) {
    var spawned = 0;
    for (var i = 0; i < this._leaves.length && spawned < count; i++) {
      var lf = this._leaves[i];
      if (lf.active) continue;

      lf.active = true;
      lf.life = 2 + Math.random() * 1.5;

      lf.mesh.position.set(
        pos.x + (Math.random() - 0.5) * 2.4,
        pos.y + 2.5 + Math.random() * 1.5,
        pos.z + (Math.random() - 0.5) * 2.4
      );

      lf.vel.set(
        (Math.random() - 0.5) * 1.2,
        -0.4 - Math.random() * 0.6,
        (Math.random() - 0.5) * 1.2
      );
      lf.spin = (Math.random() - 0.5) * 4;

      lf.mesh.rotation.set(
        Math.random() * PI * 2,
        Math.random() * PI * 2,
        Math.random() * PI * 2
      );
      lf.mesh.visible = true;
      lf.mesh.material.opacity = 0;

      spawned++;
    }
  };

  // --------------------------------------------------------------------------
  // Update leaf pool each frame
  // --------------------------------------------------------------------------
  WorldTrees.prototype._updateLeaves = function(dt) {
    for (var i = 0; i < this._leaves.length; i++) {
      var lf = this._leaves[i];
      if (!lf.active) continue;

      lf.life -= dt;

      if (lf.life <= 0 || lf.mesh.position.y < 0.1) {
        lf.active = false;
        lf.mesh.visible = false;
        lf.mesh.material.opacity = 0;
        continue;
      }

      // Gravity + drag
      lf.vel.y -= 1.2 * dt;
      lf.vel.x *= (1 - 0.8 * dt);
      lf.vel.z *= (1 - 0.8 * dt);

      // Drift
      lf.mesh.position.x += lf.vel.x * dt + Math.sin(lf.life * 3) * 0.008;
      lf.mesh.position.y += lf.vel.y * dt;
      lf.mesh.position.z += lf.vel.z * dt;

      // Spin
      lf.mesh.rotation.z += lf.spin * dt;
      lf.spin *= 0.97;

      // Opacity fade-in / fade-out
      lf.mesh.material.opacity = Math.min(0.85, lf.life * 0.6);
    }
  };

  // ==========================================================================
  // BUILD ALL TREES
  // ==========================================================================
  WorldTrees.prototype._buildTrees = function() {
    for (var i = 0; i < TREE_DEFS.length; i++) {
      var def = TREE_DEFS[i];
      var treeObj = this._buildTree(def);
      this._trees.push(treeObj);
    }
  };

  WorldTrees.prototype._buildTree = function(def) {
    var root = new THREE.Group();
    root.position.set(def.x, 0, def.z);
    root.scale.setScalar(def.scale);
    this.scene.add(root);

    var foliageRoot = new THREE.Group();
    root.add(foliageRoot);

    var clusters = [];

    switch (def.variety) {
      case 0: this._buildOak(root, foliageRoot, clusters);   break;
      case 1: this._buildPine(root, foliageRoot, clusters);  break;
      case 2: this._buildDead(root, foliageRoot, clusters);  break;
    }

    return {
      root: root,
      foliageRoot: foliageRoot,
      clusters: clusters,
      windPhase: Math.random() * PI * 2,
      windTime: 0,
      shakeTime: 0,
      shakeIntensity: 0,
      pos: new THREE.Vector3(def.x, 0, def.z),
      scale: def.scale,
      variety: def.variety
    };
  };

  // ==========================================================================
  // VARIETY 0 — Ancient Gnarled Oak
  // ==========================================================================
  WorldTrees.prototype._buildOak = function(root, foliageRoot, clusters) {
    var trunkMat = new THREE.MeshLambertMaterial({
      color: 0x3d2810,
      emissive: new THREE.Color(0x050301)
    });

    // Trunk — 3 stacked tapered cylinders
    var baseGeo = new THREE.CylinderGeometry(0.38, 0.52, 1.4, 7);
    var baseMesh = new THREE.Mesh(baseGeo, trunkMat);
    baseMesh.position.y = 0.7;
    baseMesh.rotation.z = 0.04;
    root.add(baseMesh);

    var midGeo = new THREE.CylinderGeometry(0.28, 0.40, 1.6, 7);
    var midMesh = new THREE.Mesh(midGeo, trunkMat);
    midMesh.position.y = 2.1;
    midMesh.rotation.z = -0.06;
    midMesh.rotation.y = 0.3;
    root.add(midMesh);

    var topGeo = new THREE.CylinderGeometry(0.18, 0.30, 1.2, 6);
    var topMesh = new THREE.Mesh(topGeo, trunkMat);
    topMesh.position.y = 3.3;
    topMesh.rotation.z = 0.05;
    root.add(topMesh);

    // Root buttresses — 3 box fins at 120° spacing
    var buttMat = new THREE.MeshLambertMaterial({
      color: 0x3d2810,
      emissive: new THREE.Color(0x050301)
    });
    var buttGeo = new THREE.BoxGeometry(0.14, 0.55, 0.22);
    for (var b = 0; b < 3; b++) {
      var angle = (b / 3) * PI * 2;
      var butt = new THREE.Mesh(buttGeo, buttMat);
      butt.position.x = Math.cos(angle) * 0.35;
      butt.position.y = 0.275;
      butt.position.z = Math.sin(angle) * 0.35;
      butt.rotation.y = angle;
      butt.rotation.z = 0.5;
      root.add(butt);
    }

    // Branches — 3 main from trunk top, 2 sub-branches each
    var branchMat = new THREE.MeshLambertMaterial({
      color: 0x3d2810,
      emissive: new THREE.Color(0x050301)
    });
    var branchAngles = [-0.85, 0.80, -0.9];
    var branchDirs   = [0, PI * 0.67, PI * 1.33];

    for (var m = 0; m < 3; m++) {
      var bGeo = new THREE.CylinderGeometry(0.07, 0.14, 1.5, 5);
      var branch = new THREE.Mesh(bGeo, branchMat);
      branch.position.y = 3.8;
      branch.rotation.z = branchAngles[m];
      branch.rotation.y = branchDirs[m];
      root.add(branch);

      // 2 sub-branches
      for (var s = 0; s < 2; s++) {
        var sbGeo = new THREE.CylinderGeometry(0.04, 0.08, 1.0, 4);
        var sub = new THREE.Mesh(sbGeo, branchMat);
        var subSign = (s === 0) ? 1 : -1;
        sub.position.y = 3.9;
        sub.rotation.z = branchAngles[m] * 0.8 + subSign * 0.35;
        sub.rotation.y = branchDirs[m] + subSign * 0.5;
        root.add(sub);
      }
    }

    // Foliage — sphere clusters parented to foliageRoot
    var foliageMats = [
      new THREE.MeshLambertMaterial({ color: 0x1a3d0a, emissive: new THREE.Color(0x030800) }),
      new THREE.MeshLambertMaterial({ color: 0x0f2506, emissive: new THREE.Color(0x030800) })
    ];

    // 6 large
    var largeSpherePositions = [
      [-1.8,  5.2, -1.2],
      [ 1.5,  5.0,  1.4],
      [-1.0,  5.8,  1.8],
      [ 2.0,  5.5, -0.8],
      [-2.2,  4.8,  0.5],
      [ 0.3,  6.2, -2.0]
    ];
    for (var i = 0; i < largeSpherePositions.length; i++) {
      var p = largeSpherePositions[i];
      var cGeo = new THREE.SphereGeometry(1.1, 7, 6);
      var cMat = foliageMats[i % 2];
      var cluster = new THREE.Mesh(cGeo, cMat);
      cluster.position.set(p[0], p[1], p[2]);
      foliageRoot.add(cluster);
      clusters.push(cluster);
    }

    // 4 medium
    var medSpherePositions = [
      [-0.5,  4.6, -2.5],
      [ 2.8,  4.5,  0.3],
      [-2.8,  5.5, -0.8],
      [ 0.8,  4.2,  2.8]
    ];
    for (var j = 0; j < medSpherePositions.length; j++) {
      var q = medSpherePositions[j];
      var mGeo = new THREE.SphereGeometry(0.75, 6, 5);
      var mMat = foliageMats[(j + 1) % 2];
      var mCluster = new THREE.Mesh(mGeo, mMat);
      mCluster.position.set(q[0], q[1], q[2]);
      foliageRoot.add(mCluster);
      clusters.push(mCluster);
    }

    // 3 small dark
    var smallSpherePositions = [
      [ 1.2,  6.8, -0.5],
      [-1.5,  6.5,  1.3],
      [ 0.0,  7.2,  0.8]
    ];
    for (var k = 0; k < smallSpherePositions.length; k++) {
      var r = smallSpherePositions[k];
      var sGeo = new THREE.SphereGeometry(0.55, 5, 4);
      var sMat = new THREE.MeshLambertMaterial({ color: 0x0f2506, emissive: new THREE.Color(0x030800) });
      var sCluster = new THREE.Mesh(sGeo, sMat);
      sCluster.position.set(r[0], r[1], r[2]);
      foliageRoot.add(sCluster);
      clusters.push(sCluster);
    }
  };

  // ==========================================================================
  // VARIETY 1 — Alien Pine
  // ==========================================================================
  WorldTrees.prototype._buildPine = function(root, foliageRoot, clusters) {
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x2d1e0e });

    // Trunk
    var trunkGeo = new THREE.CylinderGeometry(0.12, 0.32, 5.5, 8);
    var trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.75;
    root.add(trunk);

    // 5 cone tiers
    var tierData = [
      { r: 2.2, h: 1.4, s: 7, y: 2.8 },
      { r: 1.8, h: 1.3, s: 7, y: 3.8 },
      { r: 1.4, h: 1.2, s: 6, y: 4.7 },
      { r: 1.0, h: 1.0, s: 6, y: 5.5 },
      { r: 0.6, h: 0.9, s: 5, y: 6.2 }
    ];

    var coneMat = new THREE.MeshLambertMaterial({
      color: 0x0d2218,
      emissive: new THREE.Color(0x001a08)
    });

    for (var t = 0; t < tierData.length; t++) {
      var td = tierData[t];
      var cGeo = new THREE.ConeGeometry(td.r, td.h, td.s);
      var cone = new THREE.Mesh(cGeo, coneMat);
      cone.position.y = td.y;
      cone.rotation.y = t * 0.4;
      foliageRoot.add(cone);
      clusters.push(cone);
    }

    // 12 bioluminescent tip dots
    var dotMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.15
    });
    var dotGeo = new THREE.SphereGeometry(0.04, 4, 3);

    for (var d = 0; d < 12; d++) {
      var dotAngle = (d / 12) * PI * 2;
      var dotTier = d % 5;
      var dotRadius = tierData[dotTier].r * 0.85;
      var dot = new THREE.Mesh(dotGeo, dotMat.clone());
      dot.position.set(
        Math.cos(dotAngle) * dotRadius,
        tierData[dotTier].y - tierData[dotTier].h * 0.3,
        Math.sin(dotAngle) * dotRadius
      );
      root.add(dot);
    }

    // PointLight at tree top
    var light = new THREE.PointLight(0x00ff88, 0.08, 5);
    light.position.set(0, 7.0, 0);
    root.add(light);
  };

  // ==========================================================================
  // VARIETY 2 — Dead Ancient Tree
  // ==========================================================================
  WorldTrees.prototype._buildDead = function(root, foliageRoot, clusters) {
    var deadMat = new THREE.MeshLambertMaterial({
      color: 0x5c4a35,
      emissive: new THREE.Color(0x080500)
    });

    // Trunk — 2 tapered cylinders with irregular Y rotations
    var lowerGeo = new THREE.CylinderGeometry(0.30, 0.48, 2.2, 7);
    var lower = new THREE.Mesh(lowerGeo, deadMat);
    lower.position.y = 1.1;
    lower.rotation.y = 0.25;
    lower.rotation.z = 0.06;
    root.add(lower);

    var upperGeo = new THREE.CylinderGeometry(0.18, 0.32, 1.8, 6);
    var upper = new THREE.Mesh(upperGeo, deadMat);
    upper.position.y = 3.1;
    upper.rotation.y = -0.4;
    upper.rotation.z = -0.08;
    root.add(upper);

    // 5–7 bare branches spiraling outward at various angles
    var numBranches = 6;
    for (var b = 0; b < numBranches; b++) {
      var baseAngle = (b / numBranches) * PI * 2 + b * 0.2;
      var baseLength = 1.4 + Math.random() * 0.8;
      var branchGeo = new THREE.CylinderGeometry(0.04, 0.10, baseLength, 4);
      var branch = new THREE.Mesh(branchGeo, deadMat);
      var tiltZ = 0.7 + (b % 3) * 0.25;
      var heightY = 3.5 + (b * 0.25);
      branch.position.y = heightY;
      branch.rotation.z = (b % 2 === 0) ? tiltZ : -tiltZ;
      branch.rotation.y = baseAngle;
      root.add(branch);

      // 2–3 sub-branches per main branch
      var numSubs = 2 + (b % 2);
      for (var s = 0; s < numSubs; s++) {
        var subLength = 0.7 + Math.random() * 0.4;
        var subGeo = new THREE.CylinderGeometry(0.02, 0.05, subLength, 3);
        var sub = new THREE.Mesh(subGeo, deadMat);
        var subSign = (s % 2 === 0) ? 1 : -1;
        sub.position.y = heightY + 0.3;
        sub.rotation.z = (b % 2 === 0) ? tiltZ + subSign * 0.4 : -(tiltZ + subSign * 0.4);
        sub.rotation.y = baseAngle + subSign * 0.6;
        root.add(sub);

        // Knot at tip
        var knotGeo = new THREE.SphereGeometry(0.04, 4, 3);
        var knotMat = new THREE.MeshLambertMaterial({
          color: 0x5c4a35,
          emissive: new THREE.Color(0x080500)
        });
        var knot = new THREE.Mesh(knotGeo, knotMat);
        // Place knot at approximate tip position
        var kAngle = sub.rotation.y;
        var kTilt  = Math.abs(sub.rotation.z);
        knot.position.set(
          Math.cos(kAngle) * Math.sin(kTilt) * subLength * 0.5,
          heightY + Math.cos(kTilt) * subLength * 0.5 + 0.5,
          Math.sin(kAngle) * Math.sin(kTilt) * subLength * 0.5
        );
        root.add(knot);
      }
    }

    // Moss patches on lower trunk — flat circles
    var mossMat = new THREE.MeshLambertMaterial({
      color: 0x1a2a0a,
      emissive: new THREE.Color(0x040800),
      side: THREE.DoubleSide
    });
    var mossPositions = [
      { angle: 0.0,   y: 0.7  },
      { angle: 2.1,   y: 1.4  },
      { angle: 4.2,   y: 0.5  }
    ];
    for (var mp = 0; mp < mossPositions.length; mp++) {
      var mGeo = new THREE.CircleGeometry(0.35 + Math.random() * 0.15, 6);
      var moss = new THREE.Mesh(mGeo, mossMat);
      var mAngle = mossPositions[mp].angle;
      var mY = mossPositions[mp].y;
      var mR = 0.40;
      moss.position.set(
        Math.cos(mAngle) * mR,
        mY,
        Math.sin(mAngle) * mR
      );
      // Face outward from trunk
      moss.rotation.y = mAngle;
      moss.rotation.x = PI / 2 + 0.1;
      root.add(moss);
    }

    // Dead tree has no foliage — foliageRoot stays empty but wind still sways the bare branches slightly
    // Add bare branch tips to clusters for micro-sway
    // (clusters array stays empty so no leaf spawning for dead trees)
  };

  // ==========================================================================
  // UPDATE — called each frame from sandbox-loop.js
  // ==========================================================================
  WorldTrees.prototype.update = function(dt, playerPos) {
    // Performance: skip every other frame for distant tree updates
    this._frameSkip = (this._frameSkip || 0) + 1;
    var skipFrame = (this._frameSkip % 2 === 0);

    for (var i = 0; i < this._trees.length; i++) {
      var tree = this._trees[i];

      // Calculate distance to player for LOD
      var distToPlayerSq = Infinity;
      if (playerPos && typeof playerPos.x === 'number' && typeof playerPos.z === 'number') {
        var dx_player = tree.pos.x - playerPos.x;
        var dz_player = tree.pos.z - playerPos.z;
        distToPlayerSq = dx_player * dx_player + dz_player * dz_player;
      }
      var isNear = distToPlayerSq < 50 * 50; // Within 50 units

      // ── Wind sway ──────────────────────────────────────────────────────────
      tree.windTime += dt;
      var t = tree.windTime + tree.windPhase;

      var windX = Math.sin(t * 0.7) * 0.028 + Math.sin(t * 1.3) * 0.014;
      var windZ = Math.cos(t * 0.6) * 0.022 + Math.cos(t * 1.1) * 0.010;

      tree.foliageRoot.rotation.x = windX;
      tree.foliageRoot.rotation.z = windZ;

      // Per-cluster micro-sway (skip for distant trees on alternating frames)
      if (isNear || !skipFrame) {
        var clusterTime = tree.windTime * tree.scale;
        for (var c = 0; c < tree.clusters.length; c++) {
          var ct = clusterTime + c * 0.45;
          tree.clusters[c].rotation.x = Math.sin(ct * 1.8) * 0.018;
          tree.clusters[c].rotation.z = Math.cos(ct * 1.5) * 0.015;
        }
      }

      // ── Collision shake ────────────────────────────────────────────────────
      // Extra safety: check playerPos exists and has valid x/z properties
      if (playerPos && typeof playerPos.x === 'number' && typeof playerPos.z === 'number') {
        var dx = playerPos.x - tree.pos.x;
        var dz = playerPos.z - tree.pos.z;
        var collideDistSq = (dx * dx + dz * dz) / (tree.scale * tree.scale);
        var collideSq = COLLIDE_RADIUS * COLLIDE_RADIUS;

        if (collideDistSq < collideSq && tree.shakeTime <= 0) {
          tree.shakeTime = 0.8;
          tree.shakeIntensity = 0.12;

          // Spawn 5–8 leaves only for trees that have foliage (varieties 0 and 1)
          if (tree.variety !== 2) {
            var leafCount = 5 + Math.floor(Math.random() * 4);
            this._spawnLeaves(tree.pos, leafCount);
          }
        }
      }

      if (tree.shakeTime > 0) {
        tree.shakeTime -= dt;
        if (tree.shakeTime < 0) tree.shakeTime = 0;

        var shake = Math.sin(tree.shakeTime * 22.0) * tree.shakeIntensity * (tree.shakeTime / 0.8);
        tree.foliageRoot.rotation.x += shake;
        tree.foliageRoot.rotation.z += shake * 0.7;
        tree.shakeIntensity *= 0.98;
      }
    }

    // ── Leaf particles ────────────────────────────────────────────────────────
    this._updateLeaves(dt);
  };

  // ==========================================================================
  // Expose to global
  // ==========================================================================
  global.WorldTrees = WorldTrees;

})(window);
