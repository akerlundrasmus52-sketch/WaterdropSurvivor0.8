// js/game-hud.js — HUD (health bar, XP, gold), quest arrow, region display, minimap,
// combo counter, farmer NPC dialogue, windmill/Montana/Eiffel quest UI,
// damage numbers, tutorial comic, enhanced notifications.
// Depends on: all previously loaded game files

    const WATERDROP_SVG_HEIGHT = 120; // Total SVG viewBox height
    const WATERDROP_FILL_TOP = 18;    // Top y-coordinate of fillable area (raised from 8 for compact shape)
    const WATERDROP_FILL_HEIGHT = 92; // Maximum fill height in SVG units (from y=18 to y=110)
    
    let lastHudUpdateMs = 0;
    function updateHUD() {
      const nowMs = Date.now();
      if (nowMs - lastHudUpdateMs < 100) return; // Throttle DOM updates to max 10/sec
      lastHudUpdateMs = nowMs;
      const hpPct = (playerStats.hp / playerStats.maxHp) * 100;
      document.getElementById('hp-fill').style.width = `${Math.max(0, hpPct)}%`;
      document.getElementById('hp-text').innerText = `HP: ${Math.max(0, Math.ceil(playerStats.hp))}/${playerStats.maxHp}`;
      
      // FRESH: Low HP warning vignette when HP < 30%
      const lowHpVignette = document.getElementById('low-hp-vignette');
      if (lowHpVignette) {
        if (hpPct < 30 && hpPct > 0) {
          // Show vignette, opacity scales with how low HP is (more intense as HP drops)
          const vignetteOpacity = (30 - hpPct) / 30; // 0 at 30%, 1 at 0%
          lowHpVignette.style.opacity = vignetteOpacity;
        } else {
          lowHpVignette.style.opacity = '0';
        }
      }
      
      const expPct = (playerStats.exp / playerStats.expReq) * 100;
      // Update EXP bar
      document.getElementById('exp-fill').style.width = `${Math.min(100, expPct)}%`;
      document.getElementById('exp-text').innerText = `EXP: ${Math.min(100, Math.ceil(expPct))}%`;
      
      // Update bottom bars (EXP bar and waterdrop level display)
      document.getElementById('bottom-exp-fill').style.width = `${Math.min(100, expPct)}%`;
      document.getElementById('bottom-exp-text').innerText = `EXP: ${Math.min(100, Math.ceil(expPct))}%`;
      
      // Update waterdrop level display
      document.getElementById('waterdrop-level-text').textContent = playerStats.lvl;
      
      // Update waterdrop EXP fill (fills from bottom to top like a thermometer)
      const waterdropFill = document.getElementById('waterdrop-exp-fill');
      const fillHeight = WATERDROP_FILL_HEIGHT * (expPct / 100);
      const fillY = WATERDROP_FILL_TOP + WATERDROP_FILL_HEIGHT - fillHeight;
      waterdropFill.setAttribute('y', fillY);
      waterdropFill.setAttribute('height', fillHeight);

      // Update unified rage bar in the top-left bar stack
      _updateUnifiedRageBar();
      
      // Update minimap
      updateMinimap();
      
      // REGION DISPLAY: Update current region based on player position
      updateRegionDisplay();

      // QUEST DIRECTION ARROW: Show animated directional arrow toward quest objective
      updateQuestArrow();
    }

    // Keep the unified rage bar in sync with the rage combat system
    function _updateUnifiedRageBar() {
      const rageFill = document.getElementById('rage-unified-fill');
      const rageText = document.getElementById('rage-unified-text');
      const rageContainer = document.getElementById('rage-bar-container');
      if (!rageFill || !rageText || !rageContainer) return;

      // Read rage values from the rage combat system (exposed on window)
      const rc = window.GameRageCombat;
      if (!rc) return;
      const meter = rc.rageMeter || 0;
      const isActive = rc.isRageActive || false;
      const pct = Math.round(meter);
      rageFill.style.width = pct + '%';

      // Style based on state
      rageContainer.classList.toggle('rage-bar-active', isActive);
      rageContainer.classList.toggle('rage-bar-ready', !isActive && meter >= 80);

      if (isActive) {
        rageText.innerText = '🔥 RAGING!';
        rageText.style.color = '#FFF';
      } else if (meter >= 80) {
        rageText.innerText = '⚡ RAGE: ' + pct + '%';
        rageText.style.color = '#FFD700';
      } else {
        rageText.innerText = '⚡ RAGE: ' + pct + '%';
        rageText.style.color = '#FF8800';
      }
    }

    // Quest direction arrow: points toward current quest objective position
    function updateQuestArrow() {
      const arrowEl = document.getElementById('quest-arrow');
      if (!arrowEl) return;

      if (!isGameActive || isPaused || isGameOver || !player || !player.mesh) {
        arrowEl.style.display = 'none';
        return;
      }

      // Determine quest objective world position
      const currentQuest = getCurrentQuest();
      if (!currentQuest || !currentQuest.questObjectivePos) {
        arrowEl.style.display = 'none';
        return;
      }

      const objPos = currentQuest.questObjectivePos;
      const px = player.mesh.position.x;
      const pz = player.mesh.position.z;
      const dx = objPos.x - px;
      const dz = objPos.z - pz;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Hide arrow when very close to objective
      if (dist < 10) {
        arrowEl.style.display = 'none';
        return;
      }

      // Calculate angle (atan2 in screen space: x→right, z→down)
      // Camera is top-down, x maps to screen right, z maps to screen down
      const angleDeg = Math.atan2(dz, dx) * (180 / Math.PI); // 0° = right, 90° = down

      // Screen dimensions
      const W = window.innerWidth;
      const H = window.innerHeight;
      const margin = 60;
      const cx = W / 2;
      const cy = H / 2;

      // Find intersection of direction ray with screen edge rectangle
      const angleRad = Math.atan2(dz, dx);
      let ax, ay;
      const tanA = Math.tan(angleRad);
      // Try left/right edges first
      if (Math.abs(Math.cos(angleRad)) > 0.001) {
        if (dx > 0) {
          ax = cx + (W / 2 - margin);
          ay = cy + tanA * (W / 2 - margin);
        } else {
          ax = cx - (W / 2 - margin);
          ay = cy - tanA * (W / 2 - margin);
        }
        // Clamp to top/bottom
        if (Math.abs(ay - cy) > H / 2 - margin) {
          ay = dz > 0 ? cy + H / 2 - margin : cy - H / 2 + margin;
          ax = Math.abs(tanA) > 0.001 ? cx + (ay - cy) / tanA : cx;
        }
      } else {
        ax = cx;
        ay = dz > 0 ? cy + H / 2 - margin : cy - H / 2 + margin;
      }

      arrowEl.style.display = 'block';
      arrowEl.style.left = (ax - 24) + 'px';
      arrowEl.style.top = (ay - 24) + 'px';
      arrowEl.style.transform = `rotate(${angleDeg}deg)`;
      // Update arrow label with distance
      const distLabel = dist > 100 ? `${Math.round(dist)}m` : `${Math.round(dist)}m`;
      arrowEl.innerHTML = `➤<span style="position:absolute;top:100%;left:50%;transform:translateX(-50%);font-size:10px;color:#FFD700;white-space:nowrap;">${distLabel}</span>`;
    }
    
    // Region display update function with slide-in/slide-out animation
    let currentRegion = '';
    function updateRegionDisplay() {
      if (!player || !player.mesh) return;
      
      const regionNameEl = document.getElementById('region-name');
      const regionDisplay = document.getElementById('region-display');
      if (!regionNameEl || !regionDisplay) return;
      
      const px = player.mesh.position.x;
      const pz = player.mesh.position.z;
      
      // Define regions based on map areas
      let region = 'Forest'; // Default
      
      if (Math.abs(px) < 15 && Math.abs(pz) < 15) {
        region = 'Central Plaza';
      } else if (px > 50 && pz > 50) {
        region = 'Stonehenge';
      } else if (px > 35 && pz > 35 && px < 50 && pz < 50) {
        region = 'Windmill';
      } else if (px < -30 && pz < -30) {
        region = 'Dark Woods';
      } else if (Math.abs(px - 30) < 15 && Math.abs(pz) < 15) {
        region = 'Eastern Forest';
      } else if (Math.abs(px + 30) < 15 && Math.abs(pz) < 15) {
        region = 'Western Forest';
      } else if (Math.abs(px) < 15 && pz > 20) {
        region = 'Northern Plains';
      } else if (Math.abs(px) < 15 && pz < -20) {
        region = 'Southern Woods';
      }
      
      // Update when region changes
      if (region !== currentRegion) {
        currentRegion = region;
        regionNameEl.textContent = region;
        regionDisplay.classList.add('region-visible');
        if (window.pushSuperStatEvent) window.pushSuperStatEvent('\uD83D\uDCCD ' + region, 'region', '\uD83D\uDCCD', 'neutral');
      }
    }
    
    // Minimap update function (with throttling for performance)
    let minimapLastUpdate = 0;
    const MINIMAP_UPDATE_INTERVAL = 200; // Update every 200ms instead of every frame
    
    function updateMinimap() {
      if (!player || !player.mesh) return;
      
      const minimap = document.getElementById('minimap');
      if (!minimap) return;
      
      // Throttle updates to every 200ms
      const now = Date.now();
      if (now - minimapLastUpdate < MINIMAP_UPDATE_INTERVAL) return;
      minimapLastUpdate = now;
      
      // Clear previous dots
      minimap.innerHTML = '';
      
      // Minimap scale - shows area of 100x100 units
      const mapSize = 100;
      const minimapSize = 120; // pixels
      
      // Add player dot (center)
      const playerDot = document.createElement('div');
      playerDot.className = 'minimap-dot minimap-player';
      playerDot.style.left = '50%';
      playerDot.style.top = '50%';
      minimap.appendChild(playerDot);
      
      // Add enemy dots (up to 20 closest enemies) - optimized
      if (enemies && enemies.length > 0) {
        const sortedEnemies = enemies
          .filter(e => e && !e.isDead)
          .map(e => ({
            enemy: e,
            dist: player.mesh.position.distanceTo(e.mesh.position)
          }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 20);
        
        sortedEnemies.forEach(({enemy}) => {
          const dx = enemy.mesh.position.x - player.mesh.position.x;
          const dz = enemy.mesh.position.z - player.mesh.position.z;
          
          // Only show enemies within map range
          if (Math.abs(dx) < mapSize / 2 && Math.abs(dz) < mapSize / 2) {
            const mapX = 50 + (dx / mapSize) * 100; // percentage
            const mapZ = 50 + (dz / mapSize) * 100; // percentage
            
            const enemyDot = document.createElement('div');
            enemyDot.className = 'minimap-dot minimap-enemy';
            enemyDot.style.left = `${mapX}%`;
            enemyDot.style.top = `${mapZ}%`;
            minimap.appendChild(enemyDot);
          }
        });
      }
      
      // Add landmark dots with region-specific icons
      const landmarks = [
        { pos: { x: 60, z: 40 }, name: 'windmill', icon: '⚙️' },
        { pos: { x: -50, z: -50 }, name: 'montana', icon: '⛰️' },
        { pos: { x: 70, z: -60 }, name: 'eiffel', icon: '⚡' },
        { pos: { x: -60, z: 60 }, name: 'stonehenge', icon: '🗿' }
      ];
      
      landmarks.forEach(landmark => {
        const dx = landmark.pos.x - player.mesh.position.x;
        const dz = landmark.pos.z - player.mesh.position.z;
        
        if (Math.abs(dx) < mapSize / 2 && Math.abs(dz) < mapSize / 2) {
          const mapX = 50 + (dx / mapSize) * 100;
          const mapZ = 50 + (dz / mapSize) * 100;
          
          // Add icon element for landmark
          const iconEl = document.createElement('div');
          iconEl.className = 'minimap-icon';
          iconEl.textContent = landmark.icon;
          iconEl.style.left = `${mapX}%`;
          iconEl.style.top = `${mapZ}%`;
          minimap.appendChild(iconEl);
          
          const landmarkDot = document.createElement('div');
          // Add quest-ready "?" indicator for windmill when quest available
          const isWindmillAvailable = landmark.name === 'windmill' && !windmillQuest.active && !windmillQuest.rewardGiven;
          landmarkDot.className = 'minimap-dot minimap-landmark' + (isWindmillAvailable ? ' quest-ready' : '');
          landmarkDot.style.left = `${mapX}%`;
          landmarkDot.style.top = `${mapZ}%`;
          minimap.appendChild(landmarkDot);
        }
      });

      // Show active quest location as yellow "?" on minimap
      const QUEST_LOCATIONS = {
        quest3_stonehengeGear: { x: -60, z: 60 },
        quest3_findStonehenge: { x: -60, z: 60 }
      };
      const currentQuest = getCurrentQuest ? getCurrentQuest() : null;
      if (currentQuest && QUEST_LOCATIONS[currentQuest.id]) {
        const qPos = QUEST_LOCATIONS[currentQuest.id];
        const qdx = qPos.x - player.mesh.position.x;
        const qdz = qPos.z - player.mesh.position.z;
        if (Math.abs(qdx) < mapSize / 2 && Math.abs(qdz) < mapSize / 2) {
          const qmapX = 50 + (qdx / mapSize) * 100;
          const qmapZ = 50 + (qdz / mapSize) * 100;
          const questDot = document.createElement('div');
          questDot.className = 'minimap-dot minimap-quest-location';
          questDot.style.left = `${qmapX}%`;
          questDot.style.top = `${qmapZ}%`;
          minimap.appendChild(questDot);
        }
      }
    }
    
    // Stats Bar removed - Users access stats via STATS button modal
    
    // Combo System - Red/Black Theme
    const COMBO_ANIMATION_DURATION = 500; // milliseconds - matches CSS animation duration
    const GODLIKE_COMBO_THRESHOLD = 20; // Combo count where GODLIKE is achieved (increased from 14 to 20 for harder difficulty)
    const MIN_COMBO_FOR_CHEST_ON_LOSS = 10; // Minimum combo to spawn chest when lost
    const CHEST_SPAWN_MILESTONES = [7, 9, 10, 12, 15, 20]; // Combo counts that spawn chests (updated to include 15 and 20)
    
    // Helper function to determine chest tier based on combo count

    let comboState = {
      count: 0,
      lastKillTime: 0,
      comboWindow: 2000, // 2 seconds between kills to maintain combo
      fadeTimer: null,
      topCombos: [], // Track top 3 combo achievements
      maxTopCombos: 3,
      shownMilestones: [], // Track which milestone texts have been shown to prevent repeats
      timerInterval: null // Track combo timer interval for cleanup
    };
    
    function updateComboCounter(newKill = false) {
      const currentTime = Date.now();
      
      if (newKill) {
        // Check if within combo window
        if (currentTime - comboState.lastKillTime <= comboState.comboWindow) {
          comboState.count++;
        } else {
          comboState.count = 1; // Reset to 1 for first kill
          comboState.shownMilestones = []; // Reset shown milestones when combo breaks
        }
        comboState.lastKillTime = currentTime;
        
        // Show combo if 5+ kills (updated to start at 5)
        if (comboState.count >= 5) {
          showCombo();
        }

        // Fever mode — activate when combo is high enough
        if (window.DopamineSystem && window.DopamineSystem.FeverMode) {
          if (comboState.count >= 10) {
            const intensity = Math.min(1, (comboState.count - 10) / 10);
            window.DopamineSystem.FeverMode.activate(intensity);
          }
        }
        
        // Spawn chest on specific combo milestones:
        // 7 kills: Common (white), 9 kills: Uncommon (green), 10 kills: Rare (blue)
        // 12 kills: Rare (blue), 15 kills: Epic (purple), 20 (GODLIKE): Mythical (special)
        const isMilestone = CHEST_SPAWN_MILESTONES.includes(comboState.count);
        
        if (isMilestone && !comboState.topCombos.includes(comboState.count)) {
          const chestTier = getChestTierForCombo(comboState.count);
          if (chestTier) {
            comboState.topCombos.push(comboState.count);
            const chestAngle = Math.random() * Math.PI * 2;
            const chestDist = 10 + Math.random() * 5;
            const cx = player.mesh.position.x + Math.cos(chestAngle) * chestDist;
            const cz = player.mesh.position.z + Math.sin(chestAngle) * chestDist;
            spawnChest(cx, cz, chestTier);
            showStatChange(`${chestTier.toUpperCase()} Chest Spawned!`);
            // Notify SSB with appropriate rarity
            if (window.pushSuperStatEvent) {
              let cr = 'uncommon';
              if      (comboState.count >= 20) cr = 'mythic';
              else if (comboState.count >= 15) cr = 'legendary';
              else if (comboState.count >= 10) cr = 'epic';
              else if (comboState.count >= 9)  cr = 'rare';
              window.pushSuperStatEvent(`🔥 x${comboState.count} Combo!`, cr, '🎁', 'success');
            }
          }
        }
        
        // Clear existing fade timer
        if (comboState.fadeTimer) {
          clearTimeout(comboState.fadeTimer);
        }
        
        // Set new fade timer - persist combo text until lost
        comboState.fadeTimer = setTimeout(() => {
          hideCombo();
        }, comboState.comboWindow);
        
        // Update combo timer display
        updateComboTimer();
      }
    }
    
    // Update the combo timer display in the status bar
    function updateComboTimer() {
      const comboTimerEl = document.getElementById('combo-timer');
      
      // Clear existing interval if any
      if (comboState.timerInterval) {
        clearInterval(comboState.timerInterval);
        comboState.timerInterval = null;
      }
      
      if (comboState.count >= 5) {
        comboTimerEl.style.display = 'block';
        
        // Start new interval to update timer display
        comboState.timerInterval = setInterval(() => {
          const currentTime = Date.now();
          const timeElapsed = currentTime - comboState.lastKillTime;
          const timeRemaining = Math.max(0, comboState.comboWindow - timeElapsed);
          const secondsRemaining = (timeRemaining / 1000).toFixed(1);
          
          comboTimerEl.innerText = `Combo Timer: ${secondsRemaining}s`;
          
          // Stop timer when combo expires
          if (timeRemaining <= 0) {
            if (comboState.timerInterval) {
              clearInterval(comboState.timerInterval);
              comboState.timerInterval = null;
            }
            comboTimerEl.style.display = 'none';
          }
        }, 200); // Update every 200ms for smooth countdown while minimizing CPU usage
      } else {
        comboTimerEl.style.display = 'none';
      }
    }
    
    function showCombo() {
      const comboEl = document.getElementById('combo-counter');
      const comboText = document.getElementById('combo-text');
      const comboMultiplier = document.getElementById('combo-multiplier');
      
      // Updated combo progression: x5=Multikill, x6=Rare, x7=Epic, x8=Legendary, x9=Mythical, 
      // x10=Amazing, x11=Unbelievable, x12=Fantastic, x13-19=Higher combos, x20=GODLIKE (configurable), x21+=GODLIKE x2, x3...
      let message = '';
      let comboLevel = 'normal'; // for styling classes
      let isMilestone = false;
      
      // Define milestones dynamically based on GODLIKE threshold
      // Include all combo values from 5 up to GODLIKE threshold
      const milestones = Array.from({length: GODLIKE_COMBO_THRESHOLD - 4}, (_, i) => i + 5);
      // Check if this is a new milestone that hasn't been shown yet
      if (milestones.includes(comboState.count) && !comboState.shownMilestones.includes(comboState.count)) {
        isMilestone = true;
        comboState.shownMilestones.push(comboState.count);
      }
      
      if (comboState.count >= GODLIKE_COMBO_THRESHOLD + 1) {
        // Fun random names after GODLIKE (using pre-defined constant array)
        const godlikeMultiplier = comboState.count - GODLIKE_COMBO_THRESHOLD;
        
        // Rotate through fun names, wrap around
        const nameIndex = (godlikeMultiplier - 1) % FUN_COMBO_NAMES.length;
        const funName = FUN_COMBO_NAMES[nameIndex];
        
        message = isMilestone ? funName.toUpperCase() : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === GODLIKE_COMBO_THRESHOLD) {
        message = isMilestone ? 'GODLIKE' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 19) {
        message = isMilestone ? 'Almost Godlike' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 18) {
        message = isMilestone ? 'Unstoppable' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 17) {
        message = isMilestone ? 'Dominating' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 16) {
        message = isMilestone ? 'Rampage' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 15) {
        message = isMilestone ? 'Monster Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 14) {
        message = isMilestone ? 'Insane Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 13) {
        message = isMilestone ? 'Almost Max Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 12) {
        message = isMilestone ? 'Fantastic Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 11) {
        message = isMilestone ? 'Unbelievable Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 10) {
        message = isMilestone ? 'Amazing Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 9) {
        message = isMilestone ? 'Mythical Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'mythical';
      } else if (comboState.count === 8) {
        message = isMilestone ? 'Legendary Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'high';
      } else if (comboState.count === 7) {
        message = isMilestone ? 'Epic Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'high';
      } else if (comboState.count === 6) {
        message = isMilestone ? 'Rare Combo' : `${comboState.count}x COMBO!`;
        comboLevel = 'high';
      } else if (comboState.count === 5) {
        message = isMilestone ? 'Multikill' : `${comboState.count}x COMBO!`;  // First combo message at 5 kills
        comboLevel = 'high';
      } else {
        message = comboState.count + 'x COMBO!';
      }
      
      comboText.innerText = message;
      comboMultiplier.innerText = isMilestone ? '' : `x${comboState.count}`; // Only show multiplier when not showing milestone text
      
      // Progressive scaling: smaller combo text over character head
      let textColor = '#FFFF00';
      let glowIntensity = 20;
      let fontSize = 14; // Much smaller base font
      let lightningCount = 0;
      
      if (comboState.count >= GODLIKE_COMBO_THRESHOLD + 1) {
        textColor = '#8B0000';
        glowIntensity = 50;
        fontSize = 28;
        lightningCount = 2;
      } else if (comboState.count === GODLIKE_COMBO_THRESHOLD) {
        textColor = '#8B0000';
        glowIntensity = 45;
        fontSize = 26;
        lightningCount = 2;
      } else if (comboState.count === 13) {
        textColor = '#A00000';
        glowIntensity = 42;
        fontSize = 24;
        lightningCount = 2;
      } else if (comboState.count === 12) {
        textColor = '#C00000';
        glowIntensity = 38;
        fontSize = 22;
        lightningCount = 1;
      } else if (comboState.count === 11) {
        textColor = '#C80000';
        glowIntensity = 36;
        fontSize = 21;
        lightningCount = 1;
      } else if (comboState.count === 10) {
        textColor = '#D00000';
        glowIntensity = 34;
        fontSize = 20;
        lightningCount = 1;
      } else if (comboState.count === 9) {
        textColor = '#D80000';
        glowIntensity = 32;
        fontSize = 19;
        lightningCount = 0;
      } else if (comboState.count === 8) {
        textColor = '#E00000';
        glowIntensity = 30;
        fontSize = 18;
        lightningCount = 0;
      } else if (comboState.count === 7) {
        textColor = '#E80000';
        glowIntensity = 28;
        fontSize = 17;
        lightningCount = 0;
      } else if (comboState.count === 6) {
        textColor = '#FF3333';
        glowIntensity = 25;
        fontSize = 16;
        lightningCount = 0;
      } else if (comboState.count === 5) {
        textColor = '#FFFF99';
        glowIntensity = 22;
        fontSize = 15;
        lightningCount = 0;
      }
      
      comboText.style.fontSize = `${fontSize}px`;
      comboText.style.color = textColor;
      
      // Build lightning effect with multiple layers
      let shadowLayers = `
        3px 3px 0 #000,
        -2px -2px 0 #000,
        2px -2px 0 #000,
        -2px 2px 0 #000`;
      
      // Add lightning glow layers based on combo count
      for (let i = 0; i < lightningCount; i++) {
        const spread = 10 + i * 15;
        shadowLayers += `,
        0 0 ${spread}px rgba(255,255,255,0.9),
        0 0 ${spread * 2}px rgba(255,200,0,0.7),
        0 0 ${spread * 3}px rgba(255,100,0,0.5)`;
      }
      
      comboText.style.textShadow = shadowLayers;
      comboMultiplier.style.color = textColor;
      comboMultiplier.style.fontSize = `${Math.floor(fontSize * 0.5)}px`; // Scale multiplier text
      
      // Show stat notification for all combos
      showStatChange(message, comboLevel);
      // Play multikill sound
      playSound('multikill');
      
      // Show with animation - scale grows with combo count
      comboEl.style.opacity = '1';
      comboEl.style.animation = `combo-bubble ${COMBO_ANIMATION_DURATION}ms ease-out`;
      
      // Reset animation after it completes
      setTimeout(() => {
        comboEl.style.animation = 'none';
      }, COMBO_ANIMATION_DURATION);
    }
    
    function hideCombo() {
      const comboEl = document.getElementById('combo-counter');
      const comboTimerEl = document.getElementById('combo-timer');
      comboEl.style.animation = `combo-fade-out ${COMBO_ANIMATION_DURATION}ms ease-out forwards`;
      
      // Clear combo timer interval
      if (comboState.timerInterval) {
        clearInterval(comboState.timerInterval);
        comboState.timerInterval = null;
      }

      // Deactivate fever mode when combo ends
      if (window.DopamineSystem && window.DopamineSystem.FeverMode) {
        window.DopamineSystem.FeverMode.deactivate();
      }
      
      setTimeout(() => {
        comboEl.style.opacity = '0';
        comboEl.style.animation = 'none';
        comboTimerEl.style.display = 'none'; // Hide timer when combo is lost
        
        // Spawn chest when combo is lost at minimum threshold
        if (comboState.count >= MIN_COMBO_FOR_CHEST_ON_LOSS) {
          const chestTier = getChestTierForCombo(comboState.count);
          if (chestTier) {
            const chestAngle = Math.random() * Math.PI * 2;
            const chestDist = 10 + Math.random() * 5;
            const cx = player.mesh.position.x + Math.cos(chestAngle) * chestDist;
            const cz = player.mesh.position.z + Math.sin(chestAngle) * chestDist;
            spawnChest(cx, cz, chestTier);
            // Show only in stat bar: "combo lost" and chest rarity (no text on main screen)
            const tierCapitalized = chestTier.charAt(0).toUpperCase() + chestTier.slice(1);
            showStatChange(`Combo lost - ${tierCapitalized} chest`);
          }
        }
        
        comboState.count = 0;
        comboState.topCombos = []; // Reset top combos for next combo sequence
        comboState.shownMilestones = []; // Reset shown milestones
      }, COMBO_ANIMATION_DURATION);
    }
    
    // ── Farmer NPC Dialogue System ──────────────────────────────────────────
    const FARMER_DIALOGUE = {
      intro: [
        "Howdy, stranger! Glad you came by the windmill.",
        "Those blasted raiders have been attackin' my fields and stealin' my crops!",
        "I need to head over to the barn and refill supplies before winter hits.",
        "Could ya protect the windmill while I'm gone? Keep those varmints away!",
        "Do this for me and I'll hand over my trusty double-barrel gun. Deal?"
      ],
      success: [
        "You did it! The windmill's still standin'!",
        "I'm so relieved — those crops are safe for the season.",
        "A deal's a deal. Here, take my double-barrel gun. You've earned it!"
      ],
      failure: [
        "Oh no... they got my crops again...",
        "I can't believe it — all that hard work, gone.",
        "I need some time to recover. Come back another day and we'll try again."
      ]
    };

    let farmerDialogueLines = [];
    let farmerDialoguePage = 0;

    function worldToScreen(worldPos) {
      const vec = worldPos.clone();
      vec.project(camera);
      return {
        x: (vec.x * 0.5 + 0.5) * window.innerWidth,
        y: (-(vec.y * 0.5) + 0.5) * window.innerHeight
      };
    }

    function showFarmerDialogue(lines, onComplete) {
      farmerDialogueLines = lines;
      farmerDialoguePage = 0;
      windmillQuest.dialogueOpen = true;
      setGamePaused(true); // Pause game while dialogue is showing

      const bubble = document.getElementById('farmer-speech-bubble');
      const textEl = document.getElementById('farmer-speech-bubble-text');
      const promptEl = document.getElementById('farmer-speech-bubble-prompt');

      function renderPage() {
        textEl.textContent = farmerDialogueLines[farmerDialoguePage];
        const isLast = farmerDialoguePage >= farmerDialogueLines.length - 1;
        promptEl.textContent = isLast ? '▶ tap to close' : '▶ tap to continue';
        bubble.style.display = 'block';
        if (farmerNPC) {
          const screen = worldToScreen(farmerNPC.position.clone().setY(farmerNPC.position.y + 3.5));
          bubble.style.left = screen.x + 'px';
          bubble.style.top = screen.y + 'px';
        }
      }

      function advancePage() {
        farmerDialoguePage++;
        if (farmerDialoguePage >= farmerDialogueLines.length) {
          hideFarmerDialogue();
          if (onComplete) onComplete();
        } else {
          renderPage();
        }
      }

      // Clean up previous listeners before adding new ones
      if (bubble._farmerClickHandler) {
        bubble.removeEventListener('click', bubble._farmerClickHandler);
      }
      if (bubble._farmerTouchHandler) {
        bubble.removeEventListener('touchend', bubble._farmerTouchHandler);
      }

      function touchHandler(e) {
        e.preventDefault(); // Prevent subsequent click event on touch devices
        advancePage();
      }

      bubble._farmerClickHandler = advancePage;
      bubble._farmerTouchHandler = touchHandler;
      bubble.addEventListener('click', advancePage);
      bubble.addEventListener('touchend', touchHandler);
      renderPage();
    }

    function hideFarmerDialogue() {
      windmillQuest.dialogueOpen = false;
      const bubble = document.getElementById('farmer-speech-bubble');
      bubble.style.display = 'none';
      if (bubble._farmerClickHandler) {
        bubble.removeEventListener('click', bubble._farmerClickHandler);
        bubble._farmerClickHandler = null;
      }
      if (bubble._farmerTouchHandler) {
        bubble.removeEventListener('touchend', bubble._farmerTouchHandler);
        bubble._farmerTouchHandler = null;
      }
      // Resume game after dialogue closes (if game is still active and no other overlay is open)
      if (isGameActive && !isGameOver) {
        const hasOpenOverlay =
          document.getElementById('levelup-modal')?.style.display === 'flex' ||
          document.getElementById('settings-modal')?.style.display === 'flex' ||
          document.getElementById('options-menu')?.style.display === 'flex' ||
          document.getElementById('stats-modal')?.style.display === 'flex' ||
          document.getElementById('comic-tutorial-modal')?.style.display === 'flex' ||
          document.getElementById('story-quest-modal')?.style.display === 'flex' ||
          document.getElementById('quest-popup-overlay') !== null;
        if (!hasOpenOverlay) {
          setGamePaused(false);
        }
      }
    }

    function updateFarmerNPCIndicator() {
      const indicator = document.getElementById('farmer-quest-indicator');
      if (!farmerNPC || !indicator) return;
      // Show "?" while quest is not started and reward not given yet
      const showIndicator = !windmillQuest.active && !windmillQuest.rewardGiven && !windmillQuest.dialogueOpen;
      if (showIndicator) {
        const screen = worldToScreen(farmerNPC.position.clone().setY(farmerNPC.position.y + 4.2));
        indicator.style.left = screen.x + 'px';
        indicator.style.top = screen.y + 'px';
        indicator.style.display = 'block';
      } else {
        indicator.style.display = 'none';
      }
    }

    function updateFarmerBubblePosition() {
      if (!windmillQuest.dialogueOpen || !farmerNPC) return;
      const bubble = document.getElementById('farmer-speech-bubble');
      if (bubble.style.display === 'none') return;
      const screen = worldToScreen(farmerNPC.position.clone().setY(farmerNPC.position.y + 3.5));
      bubble.style.left = screen.x + 'px';
      bubble.style.top = screen.y + 'px';
      // Apply dynamic animation based on player movement
      const jx = joystickLeft.x;
      const jy = joystickLeft.y;
      const moving = Math.abs(jx) > 0.2 || Math.abs(jy) > 0.2;
      bubble.classList.remove('moving-left', 'moving-right', 'moving-up', 'idle');
      if (moving) {
        if (Math.abs(jx) >= Math.abs(jy)) {
          bubble.classList.add(jx < 0 ? 'moving-left' : 'moving-right');
        } else {
          bubble.classList.add('moving-up');
        }
      } else {
        bubble.classList.add('idle');
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    function updateWindmillQuestUI() {
      if (!windmillQuest.active || !windmillQuest.windmill) return;
      
      const hp = windmillQuest.windmill.userData.hp;
      const maxHp = windmillQuest.windmill.userData.maxHp;
      const hpPct = (hp / maxHp) * 100;
      
      document.getElementById('windmill-hp-fill').style.width = `${Math.max(0, hpPct)}%`;
      document.getElementById('windmill-hp-text').innerText = `WINDMILL: ${Math.max(0, Math.ceil(hp))}/${maxHp}`;
      document.getElementById('windmill-timer-text').innerText = `DEFEND: ${Math.ceil(windmillQuest.timer)}s`;
    }
    
    function startWindmillQuest(windmill) {
      if (windmillQuest.hasCompleted || windmillQuest.active) return;
      
      windmillQuest.active = true;
      windmillQuest.timer = windmillQuest.duration;
      windmillQuest.windmill = windmill;
      windmillQuest.failed = false;
      windmill.userData.hp = 600;
      windmill.userData.maxHp = 600;
      
      document.getElementById('windmill-quest-ui').style.display = 'block';
      updateWindmillQuestUI();
      
      showStatChange('⚔️ Side Quest Activated: Defend the Windmill!');
    }
    
    function completeWindmillQuest() {
      windmillQuest.active = false;
      windmillQuest.hasCompleted = true;
      windmillQuest.rewardReady = true;
      document.getElementById('windmill-quest-ui').style.display = 'none';
      
      createFloatingText("QUEST COMPLETE!", windmillQuest.windmill.position);
      
      showEnhancedNotification(
        'quest',
        'QUEST COMPLETE!',
        'Return to the farmer for your reward!'
      );
      
      // Unlock lore
      unlockLore('landmarks', 'windmill');
      unlockLore('bosses', 'windmillBoss');
      
      // Progress windmill guide quest if active
      if (saveData.tutorialQuests && saveData.tutorialQuests.currentQuest === 'quest13_windmill') {
        progressTutorialQuest('quest13_windmill', true);
      }
      
      playSound('levelup');
      updateHUD();
    }

    function giveWindmillQuestReward() {
      windmillQuest.rewardReady = false;
      windmillQuest.rewardGiven = true;

      // Grant level up with proper upgrade modal (via awardLevels)
      awardLevels(1);

      // Unlock Double Barrel Gun — TEMPORARY for this run only (resets next run)
      weapons.doubleBarrel.active = true;
      weapons.doubleBarrel.level = 1;

      // Spawn a blue (rare) reward chest near the farmer as visual representation
      const chestX = farmerNPC ? farmerNPC.position.x + 1.5 : player.mesh.position.x + 2;
      const chestZ = farmerNPC ? farmerNPC.position.z + 1.5 : player.mesh.position.z + 2;
      spawnChest(chestX, chestZ, 'rare');

      createFloatingText("DOUBLE BARREL! (THIS RUN)", player.mesh.position);

      showEnhancedNotification(
        'unlock',
        'TEMP WEAPON UNLOCKED!',
        'Double Barrel Gun — for this run only! Defend the windmill again next run for another reward!'
      );

      playSound('levelup');
      updateHUD();
    }

    function failWindmillQuest() {
      windmillQuest.active = false;
      windmillQuest.failed = true;
      // Hide windmill quest UI immediately - no on-screen failure text
      const uiEl = document.getElementById('windmill-quest-ui');
      if (uiEl) uiEl.style.display = 'none';
      const timerEl = document.getElementById('windmill-timer-text');
      const hpEl = document.getElementById('windmill-hp-text');
      const hpFill = document.getElementById('windmill-hp-fill');
      if (timerEl) timerEl.innerText = 'DEFEND: 0s';
      if (hpEl) hpEl.innerText = 'WINDMILL: 0/600';
      if (hpFill) hpFill.style.width = '0%';
    }
    
    // Montana Quest Functions
    function updateMontanaQuestUI() {
      if (!montanaQuest.active) return;
      
      const timerPct = (montanaQuest.timer / montanaQuest.duration) * 100;
      document.getElementById('montana-timer-fill').style.width = `${Math.max(0, timerPct)}%`;
      document.getElementById('montana-timer-text').innerText = `SURVIVE: ${Math.ceil(montanaQuest.timer)}s`;
      document.getElementById('montana-kills-text').innerText = `KILLS: ${montanaQuest.kills}/${montanaQuest.killsNeeded}`;
    }
    
    function startMontanaQuest(landmark) {
      if (!landmark || montanaQuest.hasCompleted || montanaQuest.active) return; // Prevent race condition and validate landmark
      
      montanaQuest.active = true;
      montanaQuest.timer = montanaQuest.duration;
      montanaQuest.kills = 0;
      montanaQuest.landmark = landmark;
      
      document.getElementById('montana-quest-ui').style.display = 'block';
      updateMontanaQuestUI();
      
      showStatChange('⚔️ Side Quest Activated: Montana Survival!');
    }
    
    function completeMontanaQuest() {
      montanaQuest.active = false;
      montanaQuest.hasCompleted = true;
      document.getElementById('montana-quest-ui').style.display = 'none';
      
      createFloatingText("MONTANA COMPLETE!", montanaQuest.landmark.position);
      
      // Rewards: +2 levels (via proper level-up flow), +500 gold, +3 attr points
      playerStats.gold += 500;
      playerStats.attributePoints += 3;
      awardLevels(2);
      
      createFloatingText("+2 LEVELS!", player.mesh.position);
      createFloatingText("+500 GOLD!", player.mesh.position);
      createFloatingText("+3 ATTR POINTS!", player.mesh.position);
      
      // Unlock lore
      unlockLore('landmarks', 'montana');
      
      playSound('levelup');
      updateHUD();
    }
    
    // Eiffel Quest Functions
    function updateEiffelQuestUI() {
      if (!eiffelQuest.active) return;
      
      const timerPct = (eiffelQuest.timer / eiffelQuest.duration) * 100;
      document.getElementById('eiffel-timer-fill').style.width = `${Math.max(0, timerPct)}%`;
      document.getElementById('eiffel-timer-text').innerText = `SURVIVE: ${Math.ceil(eiffelQuest.timer)}s`;
      document.getElementById('eiffel-kills-text').innerText = `KILLS: ${eiffelQuest.kills}/${eiffelQuest.killsNeeded}`;
    }
    
    function startEiffelQuest(landmark) {
      if (!landmark || eiffelQuest.hasCompleted || eiffelQuest.active) return; // Prevent race condition and validate landmark
      
      eiffelQuest.active = true;
      eiffelQuest.timer = eiffelQuest.duration;
      eiffelQuest.kills = 0;
      eiffelQuest.landmark = landmark;
      
      document.getElementById('eiffel-quest-ui').style.display = 'block';
      updateEiffelQuestUI();
      
      showStatChange('⚔️ Side Quest Activated: Eiffel Tower Defense!');
    }
    
    function completeEiffelQuest() {
      eiffelQuest.active = false;
      eiffelQuest.hasCompleted = true;
      document.getElementById('eiffel-quest-ui').style.display = 'none';
      
      createFloatingText("EIFFEL COMPLETE!", eiffelQuest.landmark.position);
      
      // Rewards: +3 levels (via proper level-up flow), +1000 gold, +5 attr points, +20 gun damage
      playerStats.gold += 1000;
      playerStats.attributePoints += 5;
      weapons.gun.damage += 20;
      awardLevels(3);
      
      createFloatingText("+3 LEVELS!", player.mesh.position);
      createFloatingText("+1000 GOLD!", player.mesh.position);
      createFloatingText("+5 ATTR POINTS!", player.mesh.position);
      createFloatingText("+20 GUN DAMAGE!", player.mesh.position);
      playSound('levelup');
      updateHUD();
    }
    
    // Deferred disposal functions (PR #81) - prevent frame drops from bulk cleanup
    function queueDisposal(mesh) {
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
      disposalQueue.push({ geo: mesh.geometry, mat: mesh.material });
    }
    
    function processDisposalQueue() {
      let count = 0;
      while (disposalQueue.length > 0 && count < MAX_DISPOSALS_PER_FRAME) {
        const item = disposalQueue.shift();
        if (item.geo) {
          item.geo.dispose();
        }
        if (item.mat) {
          if (Array.isArray(item.mat)) {
            item.mat.forEach(m => {
              if (m && m.dispose) m.dispose();
            });
          } else if (item.mat && item.mat.dispose) {
            item.mat.dispose();
          }
        }
        count++;
      }
    }

    let _activeDamageNumbers = 0;
    const MAX_DAMAGE_NUMBERS = 12; // Cap to prevent DOM bloat during high-intensity combat

    function createDamageNumber(amount, pos, isCrit = false, isHeadshot = false) {
      // Cap visible damage numbers to prevent DOM bloat
      if (_activeDamageNumbers >= MAX_DAMAGE_NUMBERS) return;

      // Use elastic spring-physics damage numbers for crits/headshots
      if ((isCrit || isHeadshot) && window.DopamineSystem && window.DopamineSystem.ElasticNumbers) {
        _activeDamageNumbers++;
        window.DopamineSystem.ElasticNumbers.spawn(amount, pos, camera, isCrit, isHeadshot);
        setTimeout(() => { _activeDamageNumbers = Math.max(0, _activeDamageNumbers - 1); }, 1200);
        return;
      }

      _activeDamageNumbers++;

      const div = document.createElement('div');
      // Color code by damage type: headshot (red) > crit (gold) > normal (white)
      if (isHeadshot) {
        div.className = 'damage-number headshot';
        div.innerText = `HEADSHOT!\n${Math.floor(amount)}`;
      } else if (isCrit) {
        div.className = 'damage-number critical';
        div.innerText = `CRIT!\n${Math.floor(amount)}`;
      } else {
        div.className = 'damage-number normal';
        div.innerText = Math.floor(amount);
      }
      
      // Project 3D pos to 2D screen
      const vec = pos.clone();
      vec.y += 1.5;
      vec.project(camera);
      
      const x = (vec.x * .5 + .5) * window.innerWidth;
      const y = (-(vec.y * .5) + .5) * window.innerHeight;
      
      div.style.position = 'absolute';
      div.style.left = `${x}px`;
      div.style.top = `${y}px`;
      div.style.transform = 'translate(-50%, -50%)';
      div.style.whiteSpace = 'pre';
      div.style.textAlign = 'center';
      
      document.body.appendChild(div);
      setTimeout(() => { div.remove(); _activeDamageNumbers = Math.max(0, _activeDamageNumbers - 1); }, 1000);
    }
    
    // Message fade tracking to prevent memory leaks
    let statusMessageFadeInterval = null;
    let statusMessageFadeTimeout = null;
    
    // showStatChange and showStatusMessage are defined in ui.js → window.GameUI
    // (aliased at the top of this file — statNotificationQueue and the queue
    //  processing logic live in ui.js module scope)

    function showComicTutorial(step) {
      const modal = document.getElementById('comic-tutorial-modal');
      const title = document.getElementById('comic-title');
      const text = document.getElementById('comic-text');
      const btn = document.getElementById('comic-action-btn');
      
      if (!modal || !title || !text || !btn) return;
      // Guard: do not show again if the modal is already visible (prevents double-trigger)
      if (modal.style.display === 'flex') return;
      
      let tutorialData = {};
      
      switch(step) {
        case 'first_death':
          tutorialData = {
            title: '⚡ DROPLET DOWN! ⚡',
            text: '<strong style="color:#FFD700;">YOUR JOURNEY BEGINS NOW...</strong><br><br>Every hero falls. But only the <strong>BRAVE</strong> rise again!<br><br>Return to the <strong>⛺ CAMP</strong> to unlock your true potential.<br><br><strong>WARNING:</strong> Your progression is LOCKED until you complete your training!',
            button: '⛺ GO TO CAMP'
          };
          break;
        case 'unlock_dash':
          tutorialData = {
            title: '🎯 TRAINING PROTOCOL 1 🎯',
            text: '<strong>MISSION:</strong> Master Evasion<br><br>Navigate to the <strong>SKILL TREE</strong> building and unlock the <strong>DASH</strong> ability.<br><br>This combat maneuver is <strong>ESSENTIAL</strong> for survival against overwhelming enemy forces!<br><br><strong>⚠️ DO NOT PROCEED WITHOUT COMPLETING THIS STEP ⚠️</strong>',
            button: '✓ ACKNOWLEDGED'
          };
          break;
        case 'unlock_headshot':
          tutorialData = {
            title: '🎯 TRAINING PROTOCOL 2 🎯',
            text: '<strong>EXCELLENT WORK, DROPLET!</strong><br><br><strong>NEXT MISSION:</strong> Master Precision Combat<br><br>Return to the <strong>SKILL TREE</strong> and unlock a <strong>HEADSHOT/CRITICAL</strong> skill.<br><br>Combine DASH and PRECISION to become an <strong>UNSTOPPABLE FORCE!</strong><br><br><strong>⚠️ COMPLETE THIS TO FINISH TRAINING ⚠️</strong>',
            button: '✓ ON MY WAY'
          };
          break;
        case 'tutorial_complete':
          tutorialData = {
            title: '⚡ TRAINING COMPLETE! ⚡',
            text: '<strong style="font-size:28px;">CONGRATULATIONS, DROPLET!</strong><br><br>You have proven yourself worthy!<br><br>The camp is yours to explore. Unlock buildings, upgrade your arsenal, and prepare for the challenges ahead.<br><br><strong>THE NIGHT IS DARK... BUT YOU ARE READY!</strong><br><br>🦇 <em>Justice awaits no one...</em> 🦇',
            button: '⚡ BECOME LEGEND ⚡'
          };
          break;
      }
      
      title.textContent = tutorialData.title;
      text.innerHTML = tutorialData.text;
      btn.textContent = tutorialData.button;
      
      if (isGameActive && !isGameOver) setGamePaused(true);
      modal.style.display = 'flex';
      
      // Handle button click
      btn.onclick = () => {
        modal.style.display = 'none';
        if (isGameActive && !isGameOver) setGamePaused(false);
        
        // Update tutorial state
        if (step === 'first_death') {
          saveData.tutorial.currentStep = 'go_to_camp';
          saveSaveData();
          // Navigate to camp screen on first death
          const gameoverScreen = document.getElementById('gameover-screen');
          if (gameoverScreen) gameoverScreen.style.display = 'none';
          const campScreen = document.getElementById('camp-screen');
          if (campScreen) {
            campScreen.classList.remove('camp-subsection-active');
            campScreen.style.display = 'flex';
            // Ensure clean pause state before entering camp
            pauseOverlayCount = 0;
            window.pauseOverlayCount = 0;
            isPaused = false;
            window.isPaused = false;
            if (typeof _syncJoystickZone === 'function') _syncJoystickZone();
            // Activate 3D camp world immediately so there is no opaque-background flash
            try { updateCampScreen(); } catch(e) { console.error('[Camp] updateCampScreen error:', e); }
            // Deferred pass + safety retries for reliable 3D camp activation
            setTimeout(() => {
              try { updateCampScreen(); } catch(e) { console.error('[Camp] updateCampScreen retry error:', e); }
              // Safety retries for reliable 3D camp activation
              if (window.CampWorld && !window.CampWorld.isActive) {
                setTimeout(() => {
                  try { updateCampScreen(); } catch(e) { console.error('[Camp] Retry updateCampScreen error:', e); }
                }, 80);
              }
            }, 0);
          }
        } else if (step === 'unlock_dash') {
          saveData.tutorial.currentStep = 'unlock_dash';
          saveSaveData();
        } else if (step === 'unlock_headshot') {
          saveData.tutorial.currentStep = 'unlock_headshot';
          saveSaveData();
        } else if (step === 'tutorial_complete') {
          saveData.tutorial.completed = true;
          saveData.tutorial.currentStep = 'completed';
          saveSaveData();
        }
      };
    }

    // showStatChange, showStatusMessage, processStatNotificationQueue
    // are defined in ui.js → window.GameUI (aliased at top of this file)
    
    // FRESH IMPLEMENTATION: Enhanced Notification System —
    // Notifications appear under the XP bar (stat-bar cluster, top-right).
    // A queue prevents multiple events from overlapping.
    const _enhancedNotifQueue = [];
    let _enhancedNotifActive = false;

    function _runEnhancedNotifQueue() {
      if (_enhancedNotifQueue.length === 0) {
        _enhancedNotifActive = false;
        return;
      }
      _enhancedNotifActive = true;
      const { type, title, message } = _enhancedNotifQueue.shift();

      // Create notification element
      const notification = document.createElement('div');
      notification.className = 'enhanced-notification';

      // Icon and border colour based on type
      let icon = '';
      let borderColor = '#5DADE2';
      switch(type) {
        case 'quest':       icon = '📜'; borderColor = '#FFD700'; break;
        case 'achievement': icon = '🏆'; borderColor = '#F39C12'; break;
        case 'attribute':   icon = '⭐'; borderColor = '#9B59B6'; break;
        case 'unlock':      icon = '🔓'; borderColor = '#2ECC71'; break;
        default:            icon = '💧';
      }

      notification.style.borderColor = borderColor;
      notification.innerHTML = `
        <div class="notification-icon">${icon}</div>
        <div class="notification-title">${title}</div>
        <div class="notification-text">${message}</div>
      `;

      document.body.appendChild(notification);

      // Mirror to super stat bar
      if (window.pushSuperStatEvent) {
        const r = type === 'achievement' ? 'epic' : type === 'attribute' ? 'legendary' : type === 'quest' ? 'quest' : 'rare';
        window.pushSuperStatEvent(title, r, icon, 'success');
      }

      // Play sound
      playSound('waterdrop');

      // Auto-remove after 3 seconds, then process next in queue
      setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
          notification.remove();
          _runEnhancedNotifQueue();
        }, 300);
      }, 3000);
    }

    function showEnhancedNotification(type, title, message) {
      _enhancedNotifQueue.push({ type, title, message });
      if (!_enhancedNotifActive) {
        _runEnhancedNotifQueue();
      }
    }

    // Screen shake effect for big destructions and impacts
    window.screenShakeIntensity = 0;
    window.triggerScreenShake = function(intensity) {
      window.screenShakeIntensity = Math.max(window.screenShakeIntensity, intensity);
    };

