# Phase 5: Implementation Highlights

## Key Code Changes

### 1. Object Pool Class (New)
```javascript
class ObjectPool {
  constructor(createFn, resetFn, initialSize = 100) {
    this.pool = [];
    this.activeSet = new Set(); // O(1) operations
    // Pre-allocate particles
  }
  get() { /* Get from pool or create */ }
  release(obj) { /* Return to pool */ }
}
```

### 2. Particle Class Enhancement
```javascript
class Particle {
  reset(pos, color) {
    // Reuse existing particle instead of creating new
    this.mesh.position.copy(pos);
    this.mesh.material.color.setHex(color);
    this.mesh.visible = true;
    scene.add(this.mesh);
    this.life = 30;
  }
}
```

### 3. Player Water Bleed
```javascript
// In Player.update():
if (healthPercent < 0.3) {
  this.waterBleedTimer += dt;
  if (this.waterBleedTimer > 0.08) {
    spawnWaterDroplet(this.mesh.position);
    spawnParticles(this.mesh.position, COLORS.player, 1);
  }
}
```

### 4. Enemy Hit Impact
```javascript
takeDamage(amount, isCrit = false) {
  // Phase 5: Hit impact particles on every hit
  spawnParticles(this.mesh.position, 0x8B0000, 3);
  // ... rest of damage logic
}
```

### 5. Enemy Death Variety
```javascript
die() {
  const explodeIntoPieces = Math.random() < 0.5;
  
  if (explodeIntoPieces) {
    // Explosion death with particles and flying pieces
  } else {
    // Corpse death - leave flat sprite with blood pool
    const corpse = new THREE.Mesh(corpseGeo, corpseMat);
    const bloodPool = new THREE.Mesh(bloodGeo, bloodMat);
    // Fade out over time
  }
}
```

### 6. Map Rondel
```javascript
const rondelMat = new THREE.MeshPhysicalMaterial({ 
  color: 0xA8A8A8, // Light gray
  roughness: 0.8,
});
const rondel = new THREE.Mesh(
  new THREE.CircleGeometry(10, 64), 
  rondelMat
);
scene.add(rondel);
```

### 7. Efficient Paths
```javascript
function createPath(startX, startZ, endX, endZ, width = 3) {
  const length = Math.sqrt((endX - startX) ** 2 + (endZ - startZ) ** 2);
  const angle = Math.atan2(endZ - startZ, endX - startX);
  
  // Single mesh per path (not tiled)
  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(width, length),
    pathMat
  );
  path.rotation.z = angle - Math.PI/2;
  scene.add(path);
}
```

### 8. Windmill Signpost
```javascript
// Create text on canvas
const canvas = document.createElement('canvas');
ctx.fillText('QUEST HERE', 256, 64);

// Create sprite from canvas
const texture = new THREE.CanvasTexture(canvas);
const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
signpostGroup.add(sprite);
```

## Performance Comparison

### Before Phase 5:
- Map: ~800 mesh objects (roads + grass strips)
- Particles: New object creation every spawn
- Tree spawning: 45-line complex calculation

### After Phase 5:
- Map: 9 mesh objects (1 rondel + 4 paths + 4 fields)
- Particles: Pooled and reused (100 pre-allocated)
- Tree spawning: Simple radius check

### Result:
- 99% reduction in map mesh count
- Zero GC from particle creation
- Faster tree placement
