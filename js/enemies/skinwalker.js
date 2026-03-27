/**
 * js/enemies/skinwalker.js
 * ========================
 * Fully hardcoded, self-contained Skinwalker enemy for a Three.js survivor game.
 * No external assets. Everything is built from Three.js geometry.
 *
 * Usage:
 *   const sw = SkinwalkerEnemy.acquire(scene, new THREE.Vector3(x, 0, z));
 *   sw.onAttack = (dmg) => { player.takeDamage(dmg); };
 *   sw.onDeath  = ()    => { SkinwalkerEnemy.release(sw); };
 *   // in game loop:
 *   sw.update(deltaTime, playerMesh.position);
 *   // on bullet hit:
 *   sw.takeDamage(amount);
 */
;(function (global) {
    'use strict';

    // =========================================================================
    // MATERIALS
    // =========================================================================
    var skinMat, darkMat, toothMat, eyeMat, clawMat;

    function _ensureMaterials() {
        if (skinMat) return;
        skinMat  = new THREE.MeshLambertMaterial({ color: 0xc8c7c0, emissive: 0x111110 });
        darkMat  = new THREE.MeshLambertMaterial({ color: 0x787870, emissive: 0x080808 });
        toothMat = new THREE.MeshLambertMaterial({ color: 0xe0d4a0, emissive: 0x151000 });
        eyeMat   = new THREE.MeshLambertMaterial({ color: 0x050505, emissive: 0x0a0a0a });
        clawMat  = new THREE.MeshLambertMaterial({ color: 0xb8a86a, emissive: 0x100e05 });
    }

    // =========================================================================
    // STATS
    // =========================================================================
    var STATS = {
        maxHP:          120,
        walkSpeed:      1.8,
        crawlSpeed:     3.5,
        detectRange:    22.0,
        crawlRange:     8.0,
        attackRange:    1.8,
        attackInterval: 1.8,
        uprightDamage:  12,
        crawlDamage:    18
    };

    // =========================================================================
    // SKINWALKER ENEMY CLASS
    // =========================================================================

    /**
     * SkinwalkerEnemy constructor.
     * @param {THREE.Scene} scene
     * @param {THREE.Vector3} position
     */
    function SkinwalkerEnemy(scene, position) {
        this.scene      = scene;
        this.dead       = false;
        this._pooled    = false;
        this.hp         = STATS.maxHP;
        this.state      = 'idle';
        this.animTime   = 0;
        this.stateTimer = 0;
        this._transitionProgress = 0; // crawl transition 0→1
        this._inCrawlTransition  = false;
        this._prevState = 'idle';

        // Callbacks
        this.onAttack = null;
        this.onDeath  = null;

        // Part references populated by _buildBody()
        this.parts = {};

        // Geometry list for disposal
        this._geometries  = [];

        // Scratch vector reused each frame to avoid GC pressure
        this._tmpVec3 = new THREE.Vector3();

        _ensureMaterials();
        this._buildBody();
        this.parts.root.position.copy(position);
        scene.add(this.parts.root);
    }

    // =========================================================================
    // GEOMETRY — _buildBody()
    // =========================================================================
    SkinwalkerEnemy.prototype._buildBody = function () {
        var p = this.parts;
        var g = this._geometries;

        // Per-instance material clones — independent so fade-out on one enemy
        // does not affect any other Skinwalker instance sharing the same templates.
        this._mats = {
            skin:  skinMat.clone(),
            dark:  darkMat.clone(),
            tooth: toothMat.clone(),
            eye:   eyeMat.clone(),
            claw:  clawMat.clone()
        };
        var iMat = this._mats;

        // Helper to create a mesh and register its geometry
        function mesh(geo, mat) {
            g.push(geo);
            return new THREE.Mesh(geo, mat);
        }

        // ---- ROOT GROUP (world space, Y=0 is ground) ----
        p.root = new THREE.Group();

        // ---- TORSO ----
        p.torso = mesh(new THREE.BoxGeometry(0.32, 0.55, 0.18), iMat.skin);
        p.torso.position.set(0, 1.05, 0);
        p.root.add(p.torso);

        // ---- PELVIS (attach leg pivots here) ----
        p.pelvis = mesh(new THREE.BoxGeometry(0.28, 0.16, 0.16), iMat.skin);
        p.pelvis.position.set(0, 0.72, 0);
        p.torso.add(p.pelvis);

        // ---- NECK ----
        p.neck = mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.22, 6), iMat.skin);
        p.neck.position.set(0, 0.30, 0);
        p.torso.add(p.neck);

        // Self-illumination point light attached to neck
        this.light = new THREE.PointLight(0x8899aa, 0.15, 4.0);
        p.neck.add(this.light);

        // ---- HEAD (skull-like, slightly oversized) ----
        p.head = mesh(new THREE.SphereGeometry(0.28, 10, 8), iMat.skin);
        p.head.position.set(0, 0.52, 0.02);
        p.head.scale.set(1.05, 1.0, 0.9);
        // Permanent head tilt
        p.head.rotation.z = 0.26;
        p.neck.add(p.head);

        // ---- JAW ----
        p.jaw = mesh(new THREE.BoxGeometry(0.22, 0.10, 0.18), iMat.skin);
        p.jaw.position.set(0, -0.18, 0.06);
        p.jaw.rotation.x = 0.18;
        p.head.add(p.jaw);

        // ---- TEETH (12 total) ----
        for (var t = 0; t < 12; t++) {
            var tooth = mesh(new THREE.BoxGeometry(0.018, 0.032, 0.012), iMat.tooth);
            var col   = t % 4;
            var row   = Math.floor(t / 4);
            tooth.position.set(
                (col - 1.5) * 0.038,
                -0.04 - row * 0.03,
                0.22
            );
            tooth.rotation.z = (Math.random() - 0.5) * 0.16;
            p.jaw.add(tooth);
        }

        // ---- EYES ----
        p.eye_L = mesh(new THREE.SphereGeometry(0.06, 6, 5), iMat.eye);
        p.eye_L.position.set(-0.10, 0.04, 0.22);
        p.head.add(p.eye_L);

        p.eye_R = mesh(new THREE.SphereGeometry(0.06, 6, 5), iMat.eye);
        p.eye_R.position.set(0.10, 0.04, 0.22);
        p.head.add(p.eye_R);

        // ---- RIBS — 5 per side ----
        for (var r = 0; r < 5; r++) {
            var yRib = 0.15 - r * 0.055;

            var ribL = mesh(new THREE.TorusGeometry(0.14, 0.012, 4, 8, Math.PI), iMat.dark);
            ribL.position.set(-0.01, yRib, -0.01);
            ribL.rotation.z = -0.30;
            ribL.rotation.y = Math.PI * 0.5;
            p.torso.add(ribL);

            var ribR = mesh(new THREE.TorusGeometry(0.14, 0.012, 4, 8, Math.PI), iMat.dark);
            ribR.position.set(0.01, yRib, -0.01);
            ribR.rotation.z = 0.30;
            ribR.rotation.y = -Math.PI * 0.5;
            p.torso.add(ribR);
        }

        // ---- SPINE BUMPS (6) ----
        for (var s = 0; s < 6; s++) {
            var spineBump = mesh(new THREE.SphereGeometry(0.025, 4, 4), iMat.dark);
            spineBump.position.set(0, 0.20 - s * 0.06, -0.09);
            p.torso.add(spineBump);
        }

        // ---- SHOULDER PIVOTS + ARMS (Left) ----
        p.shoulder_L = mesh(new THREE.SphereGeometry(0.07, 6, 5), iMat.dark);
        p.shoulder_L.position.set(-0.20, 0.22, 0);
        p.torso.add(p.shoulder_L);

        p.upper_arm_L = mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.52, 5), iMat.skin);
        p.upper_arm_L.position.set(0, -0.26, 0);
        p.upper_arm_L.rotation.z = -0.15;
        p.shoulder_L.add(p.upper_arm_L);

        p.forearm_L = mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.55, 5), iMat.skin);
        p.forearm_L.position.set(0, -0.52, 0);
        p.upper_arm_L.add(p.forearm_L);

        p.hand_L = mesh(new THREE.BoxGeometry(0.08, 0.04, 0.12), iMat.skin);
        p.hand_L.position.set(0, -0.55, 0);
        p.forearm_L.add(p.hand_L);

        this._buildFingers(p.hand_L);

        // ---- SHOULDER PIVOTS + ARMS (Right) ----
        p.shoulder_R = mesh(new THREE.SphereGeometry(0.07, 6, 5), iMat.dark);
        p.shoulder_R.position.set(0.20, 0.22, 0);
        p.torso.add(p.shoulder_R);

        p.upper_arm_R = mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.52, 5), iMat.skin);
        p.upper_arm_R.position.set(0, -0.26, 0);
        p.upper_arm_R.rotation.z = 0.15;
        p.shoulder_R.add(p.upper_arm_R);

        p.forearm_R = mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.55, 5), iMat.skin);
        p.forearm_R.position.set(0, -0.52, 0);
        p.upper_arm_R.add(p.forearm_R);

        p.hand_R = mesh(new THREE.BoxGeometry(0.08, 0.04, 0.12), iMat.skin);
        p.hand_R.position.set(0, -0.55, 0);
        p.forearm_R.add(p.hand_R);

        this._buildFingers(p.hand_R);

        // ---- LEGS (Left) ----
        p.upper_leg_L = mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.60, 6), iMat.skin);
        p.upper_leg_L.position.set(-0.10, -0.08, 0);
        p.upper_leg_L.rotation.z = 0.12;
        p.pelvis.add(p.upper_leg_L);

        p.lower_leg_L = mesh(new THREE.CylinderGeometry(0.042, 0.035, 0.58, 6), iMat.skin);
        p.lower_leg_L.position.set(0, -0.60, 0);
        p.upper_leg_L.add(p.lower_leg_L);

        p.foot_L = mesh(new THREE.BoxGeometry(0.10, 0.06, 0.28), iMat.skin);
        p.foot_L.position.set(0, -0.58, 0.08);
        p.lower_leg_L.add(p.foot_L);

        // ---- LEGS (Right) ----
        p.upper_leg_R = mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.60, 6), iMat.skin);
        p.upper_leg_R.position.set(0.10, -0.08, 0);
        p.upper_leg_R.rotation.z = -0.12;
        p.pelvis.add(p.upper_leg_R);

        p.lower_leg_R = mesh(new THREE.CylinderGeometry(0.042, 0.035, 0.58, 6), iMat.skin);
        p.lower_leg_R.position.set(0, -0.60, 0);
        p.upper_leg_R.add(p.lower_leg_R);

        p.foot_R = mesh(new THREE.BoxGeometry(0.10, 0.06, 0.28), iMat.skin);
        p.foot_R.position.set(0, -0.58, 0.08);
        p.lower_leg_R.add(p.foot_R);
    };

    /**
     * Build 4 fingers + claws on a hand mesh.
     * @param {THREE.Mesh} handMesh
     */
    SkinwalkerEnemy.prototype._buildFingers = function (handMesh) {
        var g    = this._geometries;
        var skin = this._mats.skin;
        var claw = this._mats.claw;
        function mesh(geo, mat) { g.push(geo); return new THREE.Mesh(geo, mat); }
        var xPositions = [-0.035, -0.012, 0.012, 0.035];
        for (var f = 0; f < 4; f++) {
            var finger = mesh(new THREE.CylinderGeometry(0.008, 0.005, 0.18, 4), skin);
            finger.position.set(xPositions[f], -0.09, 0);
            handMesh.add(finger);

            var clawTip = mesh(new THREE.ConeGeometry(0.008, 0.045, 4), claw);
            clawTip.position.set(0, -0.115, 0);
            finger.add(clawTip);
        }
    };

    // =========================================================================
    // AI / STATE MACHINE
    // =========================================================================

    /**
     * Main update — call every frame.
     * @param {number} dt  delta time in seconds
     * @param {THREE.Vector3} playerPos
     */
    SkinwalkerEnemy.prototype.update = function (dt, playerPos) {
        if (this.dead && this.state !== 'death') return;

        // animTime is advanced inside each animation method at state-specific rates
        this.stateTimer += dt;

        var dist = this.parts.root.position.distanceTo(playerPos);

        // ---- DEATH state — handle independently ----
        if (this.state === 'death') {
            this._animateDeath(dt);
            return;
        }

        // ---- HURT state — play through ----
        if (this.state === 'hurt') {
            this._animateHurt();
            if (this.stateTimer >= 0.5) {
                this._setState('crawl');
            }
            return;
        }

        // ---- ATTACK states ----
        if (this.state === 'attack_upright') {
            this._animateAttackUpright();
            if (this.stateTimer >= 1.1) {
                this._setState(this._prevState === 'crawl' ? 'crawl' : 'walk');
            }
            return;
        }
        if (this.state === 'attack_crawl') {
            this._animateAttackCrawl(dt, playerPos);
            if (this.stateTimer >= 0.75) {
                this._setState('crawl');
            }
            return;
        }

        // ---- OUT OF RANGE → idle ----
        if (dist > STATS.detectRange) {
            if (this.state !== 'idle') this._setState('idle');
            this._animateIdle(dt);
            return;
        }

        // ---- ATTACK CHECK ----
        if (dist < STATS.attackRange && this.stateTimer > STATS.attackInterval) {
            var attackState = (this.state === 'crawl') ? 'attack_crawl' : 'attack_upright';
            this._prevState = this.state;
            this._setState(attackState);
            this._dealDamage();
            return;
        }

        // ---- MOVEMENT ----
        var targetState = (dist < STATS.crawlRange) ? 'crawl' : 'walk';
        if (this.state !== targetState) {
            if (targetState === 'crawl' && this.state === 'walk') {
                this._beginCrawlTransition();
            } else {
                this._setState(targetState);
            }
        }
        this._moveToward(playerPos, dt);

        // ---- ANIMATION ----
        if (this._inCrawlTransition) {
            this._updateCrawlTransition(dt, playerPos);
        } else if (this.state === 'walk') {
            this._animateWalk(dt);
        } else if (this.state === 'crawl') {
            this._animateCrawl(dt, playerPos);
        } else {
            this._animateIdle(dt);
        }
    };

    SkinwalkerEnemy.prototype._setState = function (s) {
        this._resetPoseToRest();
        this.state      = s;
        this.stateTimer = 0;
    };

    /**
     * Reset all animated transforms to their rest/neutral pose.
     * Called on every state transition so no values leak between states.
     */
    SkinwalkerEnemy.prototype._resetPoseToRest = function () {
        var p = this.parts;
        // Preserve Y rotation (facing direction) and world Y position
        p.root.rotation.x = 0;
        p.root.rotation.z = 0;
        p.root.position.y = 0;

        p.torso.position.set(0, 1.05, 0);
        p.torso.rotation.set(0, 0, 0);

        p.neck.rotation.set(0, 0, 0);

        p.head.rotation.set(0, 0, 0.26); // 0.26 rad = permanent creepy head tilt

        p.jaw.rotation.x = 0.18;

        p.shoulder_L.position.set(-0.20, 0.22, 0);
        p.shoulder_R.position.set( 0.20, 0.22, 0);

        p.upper_arm_L.rotation.set(0, 0, -0.15);
        p.upper_arm_R.rotation.set(0, 0,  0.15);
        p.forearm_L.rotation.set(0, 0, 0);
        p.forearm_R.rotation.set(0, 0, 0);
        p.hand_L.rotation.set(0, 0, 0);
        p.hand_R.rotation.set(0, 0, 0);

        p.upper_leg_L.rotation.set(0, 0, 0.12);
        p.upper_leg_R.rotation.set(0, 0, -0.12);
        p.lower_leg_L.rotation.set(0, 0, 0);
        p.lower_leg_R.rotation.set(0, 0, 0);
        p.foot_L.rotation.set(0, 0, 0);
        p.foot_R.rotation.set(0, 0, 0);
    };

    SkinwalkerEnemy.prototype._moveToward = function (playerPos, dt) {
        var pos = this.parts.root.position;
        var dx  = playerPos.x - pos.x;
        var dz  = playerPos.z - pos.z;
        var len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.001) return;
        dx /= len;
        dz /= len;

        var speed = (this.state === 'crawl') ? STATS.crawlSpeed : STATS.walkSpeed;
        pos.x += dx * speed * dt;
        pos.z += dz * speed * dt;

        var targetY  = Math.atan2(dx, dz);
        var currentY = this.parts.root.rotation.y;
        var diff     = targetY - currentY;
        // Normalize to [-PI, PI]
        while (diff >  Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.parts.root.rotation.y += diff * Math.min(dt * 5.0, 1.0);
    };

    SkinwalkerEnemy.prototype._dealDamage = function () {
        if (typeof this.onAttack === 'function') {
            var dmg = (this.state === 'attack_crawl') ? STATS.crawlDamage : STATS.uprightDamage;
            this.onAttack(dmg);
        }
    };

    /**
     * Receive a hit from an external source.
     * @param {number} amount  damage amount
     */
    SkinwalkerEnemy.prototype.takeDamage = function (amount) {
        if (this.dead) return;
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp   = 0;
            this.dead = true;
            this._setState('death');
            return;
        }
        // Interrupt non-critical states
        if (this.state !== 'hurt' && this.state !== 'death') {
            this._setState('hurt');
        }
    };

    // =========================================================================
    // ANIMATION STATES
    // =========================================================================

    // ---- ANIMATION 1: IDLE ----
    SkinwalkerEnemy.prototype._animateIdle = function (dt) {
        this.animTime += dt;
        var t = this.animTime;
        var p = this.parts;
        p.torso.position.y  = 1.05 + Math.sin(t * 0.8) * 0.008;
        p.head.rotation.z   = 0.26 + Math.sin(t * 0.5) * 0.05;
        p.head.rotation.x   = Math.sin(t * 0.6) * 0.03;
        p.hand_L.rotation.z = Math.sin(t * 4.1) * 0.06 + Math.sin(t * 7.3) * 0.03;
        p.hand_R.rotation.z = Math.sin(t * 3.7) * 0.05 + Math.sin(t * 6.9) * 0.03;
        p.jaw.rotation.x    = 0.18 + Math.sin(t * 0.4) * 0.02;
    };

    // ---- ANIMATION 2: UPRIGHT WALK ----
    SkinwalkerEnemy.prototype._animateWalk = function (dt) {
        this.animTime += dt * 2.2;  // override base increment for walk speed
        var t = this.animTime;
        var p = this.parts;

        var step    = Math.sin(t);
        var stepAbs = Math.abs(step);

        p.head.rotation.z = 0.26 + Math.sin(t * 0.7) * 0.08;
        p.head.rotation.x = Math.sin(t * 1.1) * 0.05;
        p.neck.rotation.z = 0.12 + Math.sin(t * 0.7) * 0.04;

        p.torso.rotation.z  = Math.sin(t * 0.5) * 0.06;
        p.torso.position.y  = 1.05 + stepAbs * 0.018;
        p.torso.rotation.y  = Math.sin(t) * 0.08;

        // Left shoulder stays higher (creepy asymmetry)
        p.shoulder_L.position.y = 0.22 + Math.sin(t + 0.4) * 0.02 + 0.06;
        p.shoulder_R.position.y = 0.22 + Math.sin(t + 0.4) * 0.02;

        // CRITICAL: both arms swing in SAME direction
        var armSwing = Math.sin(t * 0.9) * 0.55;
        p.upper_arm_L.rotation.x = armSwing;
        p.upper_arm_R.rotation.x = armSwing + 0.15;
        p.forearm_L.rotation.x   = -0.3 + Math.sin(t * 0.9 + 0.3) * 0.25;
        p.forearm_R.rotation.x   = -0.3 + Math.sin(t * 0.9 + 0.5) * 0.25;
        p.hand_L.rotation.z      = Math.sin(t * 3.1) * 0.04;
        p.hand_R.rotation.z      = Math.sin(t * 2.8) * 0.04;

        // Legs — opposite phase
        p.upper_leg_L.rotation.x = Math.sin(t) * 0.45;
        p.upper_leg_L.rotation.z = 0.18;
        p.lower_leg_L.rotation.x = Math.max(0, -Math.sin(t) * 0.6 + 0.15);
        p.foot_L.rotation.x      = Math.sin(t) * 0.12;

        p.upper_leg_R.rotation.x = -Math.sin(t) * 0.45;
        p.upper_leg_R.rotation.z = -0.18;
        p.lower_leg_R.rotation.x = Math.max(0, Math.sin(t) * 0.6 + 0.15);
        p.foot_R.rotation.x      = -Math.sin(t) * 0.12;

        p.jaw.rotation.x = 0.18 + Math.sin(t * 1.3) * 0.04;
    };

    // ---- ANIMATION 3: CRAWL ----
    SkinwalkerEnemy.prototype._animateCrawl = function (dt, playerPos) {
        this.animTime += dt * 2.8;
        var t = this.animTime;
        var p = this.parts;
        var PI = Math.PI;

        // Body rocks side-to-side as weight shifts between limb pairs (half limb freq = 0.9)
        var bodySway = Math.sin(t * 0.9) * 0.06; // half-freq of limb cycle = subtle roll
        p.root.rotation.x  = PI * 0.38;
        p.root.rotation.z  = bodySway;
        p.torso.position.y = 0.60 + Math.abs(Math.sin(t * 2.8)) * 0.04; // slight vertical bounce
        p.torso.rotation.x = -0.35;
        p.torso.rotation.z = -bodySway * 0.5; // counter-rotate torso for natural feel

        // Head cranes up to stare at player despite body pitched forward
        p.head.rotation.x = -0.7;
        p.neck.rotation.x = -0.5;
        p.head.rotation.z = 0.22 + Math.sin(t * 0.8) * 0.10;

        // Head Y-rotation tracks player — reuse cached scratch vector (no GC)
        p.root.getWorldPosition(this._tmpVec3);
        var toPlayerX = playerPos.x - this._tmpVec3.x;
        var toPlayerZ = playerPos.z - this._tmpVec3.z;
        var targetAngleY = Math.atan2(toPlayerX, toPlayerZ);
        var diff = targetAngleY * 0.6 - p.head.rotation.y;
        while (diff >  PI) diff -= PI * 2;
        while (diff < -PI) diff += PI * 2;
        p.head.rotation.y += diff * Math.min(dt * 3.0, 1.0);

        // Arms — diagonal opposite pairs move together (FR+RL, FL+RR)
        // Left arm and right leg share phase; right arm and left leg share opposing phase
        var armPhaseL  = Math.sin(t * 1.8);           // left arm / right leg phase
        var armPhaseR  = Math.sin(t * 1.8 + PI);      // right arm / left leg phase (180° offset)
        var forearmBob = Math.sin(t * 1.8 * 2) * 0.1; // forearm micro-oscillation

        p.upper_arm_L.rotation.x = 1.0 + armPhaseL * 0.40;
        p.upper_arm_L.rotation.z = 0.55 + armPhaseL * 0.08;
        p.forearm_L.rotation.x   = -1.1 + forearmBob;

        p.upper_arm_R.rotation.x = 1.0 + armPhaseR * 0.40;
        p.upper_arm_R.rotation.z = -0.55 - armPhaseR * 0.08;
        p.forearm_R.rotation.x   = -1.1 - forearmBob;

        // Legs — diagonal gait: left leg moves with right arm (armPhaseR) and vice versa
        p.upper_leg_L.rotation.x = -0.5 + armPhaseR * 0.45;
        p.lower_leg_L.rotation.x = 1.6 + Math.max(0, armPhaseR) * 0.15;
        p.upper_leg_R.rotation.x = -0.5 + armPhaseL * 0.45;
        p.lower_leg_R.rotation.x = 1.6 + Math.max(0, armPhaseL) * 0.15;

        // Wrists bent back — claws dig in, slight claw-rake oscillation
        p.hand_L.rotation.x = 0.6 + armPhaseL * 0.12;
        p.hand_R.rotation.x = 0.6 + armPhaseR * 0.12;
    };

    // ---- CRAWL TRANSITION (walk→crawl over 0.4s) ----
    SkinwalkerEnemy.prototype._beginCrawlTransition = function () {
        this._inCrawlTransition  = true;
        this._transitionProgress = 0;
        this.state = 'walk'; // keep walk until transition done
    };

    SkinwalkerEnemy.prototype._updateCrawlTransition = function (dt, playerPos) {
        this._transitionProgress += dt / 0.4;
        if (this._transitionProgress >= 1) {
            this._transitionProgress   = 1;
            this._inCrawlTransition    = false;
            this._setState('crawl');
        }
        var prog = this._transitionProgress;
        // Smoothstep s = p²*(3-2p)
        var s = prog * prog * (3 - 2 * prog);
        var p = this.parts;
        p.torso.rotation.x = _lerp(0, -0.35, s);
        p.root.rotation.x  = _lerp(0, Math.PI * 0.38, s);
    };

    // ---- ANIMATION 4: ATTACK UPRIGHT ----
    SkinwalkerEnemy.prototype._animateAttackUpright = function () {
        var t  = this.stateTimer / 1.1; // normalised 0→1
        var p  = this.parts;

        if (t < 0.23) {
            // Phase: WINDUP
            var pP = t / 0.23;
            p.upper_arm_L.rotation.x = -pP * 1.8;
            p.upper_arm_R.rotation.x = -pP * 1.8;
            p.torso.rotation.x       = pP * 0.35;
            p.head.rotation.x        = -pP * 0.4;
            p.jaw.rotation.x         = 0.18 + pP * 0.55;
        } else if (t < 0.43) {
            // Phase: STRIKE (fast easeIn)
            var pS   = (t - 0.23) / 0.20;
            var ease = pS * pS;
            p.upper_arm_L.rotation.x = -1.8 + ease * 3.4;
            p.upper_arm_R.rotation.x = -1.8 + ease * 3.4;
            p.forearm_L.rotation.x   = ease * 0.6;
            p.forearm_R.rotation.x   = ease * 0.6;
            p.torso.rotation.x       = 0.35 - ease * 0.55;
            p.head.rotation.x        = -0.4 + ease * 0.6;
        } else if (t < 0.68) {
            // Phase: HOLD/STARE
            p.upper_arm_L.rotation.x = 1.6;
            p.upper_arm_R.rotation.x = 1.6;
            var pH = (t - 0.43) / 0.25;
            p.head.rotation.z = 0.35 * Math.sin(pH * Math.PI * 4) * (1 - pH);
        } else {
            // Phase: RECOVER
            var pR = (t - 0.68) / 0.42;
            p.upper_arm_L.rotation.x = _lerp(1.6, 0.55, pR);
            p.upper_arm_R.rotation.x = _lerp(1.6, 0.55, pR);
            p.torso.rotation.x       = _lerp(-0.20, 0, pR);
            p.jaw.rotation.x         = _lerp(0.73, 0.18, pR);
        }
    };

    // ---- ANIMATION 5: ATTACK CRAWL ----
    SkinwalkerEnemy.prototype._animateAttackCrawl = function (dt, playerPos) {
        var t  = this.stateTimer / 0.75; // normalised 0→1
        var p  = this.parts;
        var PI = Math.PI;

        if (t < 0.20) {
            // Phase: COIL — set rotation directly from crawl base + coil offset
            var pC = t / 0.20;
            p.root.rotation.x        = Math.PI * 0.38 + pC * 0.25;
            p.upper_arm_L.rotation.x  = -pC * 1.2;
            p.upper_arm_R.rotation.x  = -pC * 1.2;
            p.head.rotation.x         = -1.1 - pC * 0.3;
            p.jaw.rotation.x          = 0.18 + pC * 0.65;
        } else if (t < 0.38) {
            // Phase: LUNGE (explosive easeOut) — accumulate per-frame velocity
            var pL    = (t - 0.20) / 0.18;
            var pLPrev = Math.max(0, (t - dt / 0.75 - 0.20) / 0.18);
            var easeCur  = 1 - Math.pow(1 - Math.min(pL, 1), 3);
            var easePrev = 1 - Math.pow(1 - Math.min(pLPrev, 1), 3);
            var delta = (easeCur - easePrev) * 0.55;
            var fwdX  = -Math.sin(p.root.rotation.y);
            var fwdZ  = -Math.cos(p.root.rotation.y);
            p.root.position.x += fwdX * delta;
            p.root.position.z += fwdZ * delta;

            p.upper_arm_L.rotation.x = -1.2 + easeCur * 2.8;
            p.upper_arm_R.rotation.x = -1.2 + easeCur * 2.8;
            p.head.rotation.x        = -1.4 + easeCur * 0.8;
            p.jaw.rotation.x         = 0.83 - easeCur * 0.4;
        } else if (t < 0.58) {
            // Phase: RAKE
            var pRk = (t - 0.38) / 0.20;
            var rake = Math.sin(pRk * PI * 4);
            p.upper_arm_L.rotation.x = 1.6 + rake * 0.5;
            p.upper_arm_R.rotation.x = 1.6 - rake * 0.5;
            p.forearm_L.rotation.x   = -0.9 - rake * 0.3;
            p.forearm_R.rotation.x   = -0.9 + rake * 0.3;
        } else {
            // Phase: RESET to crawl pose
            var pReset = (t - 0.58) / 0.17;
            p.upper_arm_L.rotation.x = _lerp(1.6, 1.0, pReset);
            p.upper_arm_R.rotation.x = _lerp(1.6, 1.0, pReset);
            p.head.rotation.x        = _lerp(-0.6, -0.7, pReset);
        }
    };

    // ---- ANIMATION 6: HURT ----
    SkinwalkerEnemy.prototype._animateHurt = function () {
        var t  = this.stateTimer / 0.5; // normalised 0→1
        var p  = this.parts;
        p.root.rotation.z        = Math.sin(t * Math.PI * 2) * 0.22 * (1 - t);
        p.head.rotation.z        = 0.26 + Math.sin(t * Math.PI * 2) * 0.35;
        p.upper_arm_L.rotation.x = -0.5 + Math.sin(t * Math.PI) * 0.8;
        p.upper_arm_R.rotation.x = -0.5 - Math.sin(t * Math.PI) * 0.8;
    };

    // ---- ANIMATION 7: DEATH ----
    SkinwalkerEnemy.prototype._animateDeath = function (dt) {
        var p = this.parts;
        if (this.stateTimer < 1.2) {
            // Phase 1: topple forward
            var ease = (this.stateTimer / 1.2);
            ease = ease * ease;
            p.root.rotation.x  = ease * (Math.PI * 0.48);
            p.root.position.y  = -ease * 0.4;
            p.upper_arm_L.rotation.x = _lerp(p.upper_arm_L.rotation.x, 0.8, dt * 4);
            p.upper_arm_R.rotation.x = _lerp(p.upper_arm_R.rotation.x, 0.8, dt * 4);
            p.head.rotation.x  = ease * 0.6;
        } else {
            // Phase 2: fade out — update only this instance's own material clones,
            // never touching the module-level template singletons.
            var fadeP = Math.max(0, 1.0 - (this.stateTimer - 1.2) / 0.8);
            var m = this._mats;
            m.skin.transparent  = true;  m.skin.opacity  = fadeP;
            m.dark.transparent  = true;  m.dark.opacity  = fadeP;
            m.tooth.transparent = true;  m.tooth.opacity = fadeP;
            m.eye.transparent   = true;  m.eye.opacity   = fadeP;
            m.claw.transparent  = true;  m.claw.opacity  = fadeP;
            if (fadeP <= 0) {
                if (typeof this.onDeath === 'function') {
                    this.onDeath();
                } else {
                    this.dispose();
                }
            }
        }
    };

    // =========================================================================
    // DISPOSE
    // =========================================================================
    SkinwalkerEnemy.prototype.dispose = function () {
        if (this.parts.root.parent) {
            this.parts.root.parent.remove(this.parts.root);
        }
        // Dispose all geometry
        this.parts.root.traverse(function (obj) {
            if (obj.isMesh && obj.geometry) obj.geometry.dispose();
        });
        // Dispose per-instance materials
        var m = this._mats;
        if (m) {
            m.skin.dispose();
            m.dark.dispose();
            m.tooth.dispose();
            m.eye.dispose();
            m.claw.dispose();
        }
        if (this.light) {
            this.light.dispose();
        }
    };

    // =========================================================================
    // REVIVE (used by pool)
    // =========================================================================
    SkinwalkerEnemy.prototype._revive = function (position) {
        this.hp         = STATS.maxHP;
        this.dead       = false;
        this._pooled    = false;
        this._deathStartTime = 0;    // reset so stale timestamps don't cause premature timeout
        this._killProcessed  = false; // reset so _killSkinwalker can run again
        this.state      = 'idle';
        this.animTime   = 0;
        this.stateTimer = 0;
        this._transitionProgress = 0;
        this._inCrawlTransition  = false;
        this._prevState = 'idle';

        this.parts.root.position.copy(position);
        this.parts.root.rotation.set(0, 0, 0);
        this.parts.root.visible = true;

        // Reset part rotations to rest pose
        var p = this.parts;
        p.torso.position.set(0, 1.05, 0);
        p.torso.rotation.set(0, 0, 0);
        p.neck.rotation.set(0, 0, 0);
        p.head.rotation.set(0, 0, 0.26);
        p.head.scale.set(1.05, 1.0, 0.9);
        p.jaw.rotation.x = 0.18;
        p.upper_arm_L.rotation.set(0, 0, -0.15);
        p.upper_arm_R.rotation.set(0, 0, 0.15);
        p.forearm_L.rotation.set(0, 0, 0);
        p.forearm_R.rotation.set(0, 0, 0);
        p.hand_L.rotation.set(0, 0, 0);
        p.hand_R.rotation.set(0, 0, 0);
        p.upper_leg_L.rotation.set(0, 0, 0.12);
        p.upper_leg_R.rotation.set(0, 0, -0.12);
        p.lower_leg_L.rotation.set(0, 0, 0);
        p.lower_leg_R.rotation.set(0, 0, 0);
        p.foot_L.rotation.set(0, 0, 0);
        p.foot_R.rotation.set(0, 0, 0);
        p.shoulder_L.position.set(-0.20, 0.22, 0);
        p.shoulder_R.position.set( 0.20, 0.22, 0);

        // Reset per-instance materials — no scene traversal needed
        var m = this._mats;
        m.skin.transparent  = false;  m.skin.opacity  = 1.0;
        m.dark.transparent  = false;  m.dark.opacity  = 1.0;
        m.tooth.transparent = false;  m.tooth.opacity = 1.0;
        m.eye.transparent   = false;  m.eye.opacity   = 1.0;
        m.claw.transparent  = false;  m.claw.opacity  = 1.0;
    };

    // =========================================================================
    // OBJECT POOLING
    // =========================================================================
    SkinwalkerEnemy.pool    = [];
    SkinwalkerEnemy.maxPool = 8;

    /**
     * Acquire a SkinwalkerEnemy instance from the pool or create a new one.
     * @param {THREE.Scene} scene
     * @param {THREE.Vector3} position
     * @returns {SkinwalkerEnemy}
     */
    SkinwalkerEnemy.acquire = function (scene, position) {
        var pool = SkinwalkerEnemy.pool;
        for (var i = 0; i < pool.length; i++) {
            var candidate = pool[i];
            if (candidate._pooled && candidate.dead) {
                pool.splice(i, 1);
                candidate._revive(position);
                if (!candidate.parts.root.parent) {
                    scene.add(candidate.parts.root);
                }
                return candidate;
            }
        }
        return new SkinwalkerEnemy(scene, position);
    };

    /**
     * Return a SkinwalkerEnemy instance to the pool.
     * @param {SkinwalkerEnemy} sw
     */
    SkinwalkerEnemy.release = function (sw) {
        sw._pooled = true;
        sw.parts.root.visible = false;
        if (SkinwalkerEnemy.pool.length < SkinwalkerEnemy.maxPool) {
            SkinwalkerEnemy.pool.push(sw);
        } else {
            sw.dispose();
        }
    };

    // =========================================================================
    // UTILITY
    // =========================================================================
    function _lerp(a, b, t) {
        return a + (b - a) * t;
    }

    // =========================================================================
    // EXPORT
    // =========================================================================
    global.SkinwalkerEnemy = SkinwalkerEnemy;

})(window);
