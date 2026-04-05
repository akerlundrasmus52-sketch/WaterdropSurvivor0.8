// ============================================================
// COMPANION EXPLORATION MODE & TCG MINIGAME
// Annunaki/Occult/AI aesthetic — cyan/purple/gold theme
// ============================================================
'use strict';

// ── Rarity helpers ───────────────────────────────────────────
const EXPLO_RARITY_COLORS = {
  common:    '#aaaaaa',
  uncommon:  '#55cc55',
  rare:      '#44aaff',
  epic:      '#aa44ff',
  legendary: '#ffd700',
  mythic:    '#ff4444'
};

// ── Exploration destinations ─────────────────────────────────
const EXPLO_DESTINATIONS = [
  {
    id: 'forest', name: 'Forest Clearing', icon: '🌲',
    baseDuration: 30, difficulty: 1, region: 'forest',
    lootTable: [
      { item: 'Wood Bundle',     rarity: 'common',   weight: 40 },
      { item: 'Herb Bundle',     rarity: 'common',   weight: 35 },
      { item: 'Wolf Fang',       rarity: 'uncommon', weight: 20 },
      { item: 'Forest Essence',  rarity: 'rare',     weight: 8  },
      { item: 'Ancient Bark',    rarity: 'epic',     weight: 3  },
      { item: 'Spirit Wood',     rarity: 'legendary',weight: 1  }
    ],
    enemies: ['slimeBrute', 'stormwolfAlpha'],
    description: 'A lush clearing teeming with wildlife and ancient trees.'
  },
  {
    id: 'ruins', name: 'Ancient Ruins', icon: '🏛️',
    baseDuration: 60, difficulty: 2, region: 'ruins',
    lootTable: [
      { item: 'Stone Chunk',     rarity: 'common',   weight: 35 },
      { item: 'Iron Scrap',      rarity: 'common',   weight: 30 },
      { item: 'Rune Fragment',   rarity: 'uncommon', weight: 20 },
      { item: 'Cursed Idol',     rarity: 'rare',     weight: 10 },
      { item: 'Annunaki Shard',  rarity: 'epic',     weight: 5  },
      { item: 'Void Crystal',    rarity: 'legendary',weight: 2  },
      { item: 'Primordial Core', rarity: 'mythic',   weight: 0.5}
    ],
    enemies: ['annunakiDrone', 'skinwalker'],
    description: 'Crumbling relics of an ancient alien civilization pulse with residual power.'
  },
  {
    id: 'voidrift', name: 'Void Rift', icon: '🌀',
    baseDuration: 90, difficulty: 3, region: 'void',
    lootTable: [
      { item: 'Void Essence',    rarity: 'uncommon', weight: 30 },
      { item: 'Dark Crystal',    rarity: 'rare',     weight: 25 },
      { item: 'Rift Shard',      rarity: 'epic',     weight: 20 },
      { item: 'Void Idol',       rarity: 'legendary',weight: 10 },
      { item: 'Singularity Core',rarity: 'mythic',   weight: 3  }
    ],
    enemies: ['annunakiDrone', 'skinwalker'],
    description: 'A tear in reality leaking void energy. Extreme danger — extreme reward.'
  }
];

// ── Exploration event templates ───────────────────────────────
const EXPLO_EVENTS = {
  forest: [
    '{companion} spots a strange glow between the trees...',
    '{companion} follows a hidden trail deeper into the woods.',
    '{companion} discovers an ancient stone carving.',
    '{companion} chases a rustling in the undergrowth.',
    '{companion} rests by a moonlit stream.',
    '{companion} senses danger nearby... teeth bared.',
    '{companion} uncovers buried ruins beneath the roots.',
    '{companion} hears distant howling echo through the canopy.'
  ],
  ruins: [
    '{companion} deciphers alien glyphs on the walls.',
    '{companion} triggers an ancient trap — barely dodges!',
    '{companion} finds a sealed chamber behind a false wall.',
    '{companion} senses an energy signature pulsing below.',
    '{companion} encounters spectral guardians at the gate.',
    '{companion} unearths a hidden offering altar.',
    '{companion} activates a dormant holographic map.',
    '{companion} hears mechanical grinding deep in the tunnels.'
  ],
  void: [
    '{companion} steps through a shimmering dimensional tear.',
    '{companion} witnesses reality fracture around them.',
    '{companion} phases briefly into the void — returns changed.',
    '{companion} intercepts a void signal broadcast.',
    '{companion} encounters a crystallized time anomaly.',
    '{companion} discovers a cache sealed in temporal amber.',
    '{companion} faces a void entity at the rift boundary.',
    '{companion} absorbs residual void energy — power surges!'
  ]
};

// ── Loot roll ─────────────────────────────────────────────────
function _exploRollLoot(destination, exploLevel) {
  const tbl = destination.lootTable;
  const bonusRarityChance = Math.min(exploLevel * 0.02, 0.5);
  // Build weighted pool with exploration-level bonus to rarer tiers
  const pool = [];
  tbl.forEach(entry => {
    let w = entry.weight;
    if (entry.rarity === 'rare')      w *= (1 + bonusRarityChance * 0.5);
    if (entry.rarity === 'epic')      w *= (1 + bonusRarityChance);
    if (entry.rarity === 'legendary') w *= (1 + bonusRarityChance * 1.5);
    if (entry.rarity === 'mythic')    w *= (1 + bonusRarityChance * 2);
    pool.push({ ...entry, w });
  });
  const total = pool.reduce((s, e) => s + e.w, 0);
  let rand = Math.random() * total;
  for (const entry of pool) {
    rand -= entry.w;
    if (rand <= 0) return { item: entry.item, rarity: entry.rarity };
  }
  return { item: pool[0].item, rarity: pool[0].rarity };
}

// ── Exploration XP requirements ───────────────────────────────
function _exploXpToNext(level) {
  return Math.floor(100 * Math.pow(1.35, level - 1));
}

// ── Travel duration (seconds, reduced by exploration level) ───
function _exploDuration(baseDuration, exploLevel) {
  const reduction = Math.min(exploLevel * 0.04, 0.6); // Up to 60% faster
  return Math.max(10, Math.floor(baseDuration * (1 - reduction)));
}

// ── Catch rate for capturable enemies ─────────────────────────
function _exploBaseCatchRate(exploLevel) {
  return Math.min(0.15 + exploLevel * 0.025, 0.75);
}

// ── TCG Card definitions per companion ────────────────────────
const TCG_DECKS = {
  greyAlien: [
    { id: 'energyBolt',   name: 'Energy Bolt',    icon: '⚡', atk: 3, hp: 3, cost: 1, desc: 'A focused beam of alien energy.' },
    { id: 'mindBlast',    name: 'Mind Blast',     icon: '🧠', atk: 2, hp: 5, cost: 2, desc: 'Psychic overload — stuns the target.' },
    { id: 'voidShield',   name: 'Void Shield',    icon: '🛡️', atk: 0, hp: 8, cost: 1, desc: 'Defensive barrier absorbs damage.' },
    { id: 'alienProbe',   name: 'Alien Probe',    icon: '🛸', atk: 4, hp: 2, cost: 2, desc: 'Probes the enemy for weak points.' },
    { id: 'warpCore',     name: 'Warp Core',      icon: '🌀', atk: 6, hp: 1, cost: 3, desc: 'Unstable warp energy — massive burst.' }
  ],
  stormWolf: [
    { id: 'feralBite',    name: 'Feral Bite',     icon: '🐺', atk: 4, hp: 4, cost: 1, desc: 'A savage bite from lightning-charged jaws.' },
    { id: 'packHowl',     name: 'Pack Howl',      icon: '🌕', atk: 2, hp: 6, cost: 2, desc: 'A howl that bolsters your defense.' },
    { id: 'staticPaw',    name: 'Static Paw',     icon: '⚡', atk: 5, hp: 2, cost: 2, desc: 'Crackling paw strike channels lightning.' },
    { id: 'thunderCharge',name: 'Thunder Charge', icon: '💥', atk: 6, hp: 1, cost: 3, desc: 'Full-speed lightning bolt tackle.' },
    { id: 'alphaHowl',    name: 'Alpha Howl',     icon: '🐾', atk: 3, hp: 5, cost: 2, desc: 'Alpha dominance intimidates the enemy.' }
  ],
  skyFalcon: [
    { id: 'diveStrike',   name: 'Dive Strike',    icon: '🦅', atk: 5, hp: 2, cost: 2, desc: 'Plummet from the sky like a missile.' },
    { id: 'windGust',     name: 'Wind Gust',      icon: '💨', atk: 3, hp: 4, cost: 1, desc: 'A gust of wind buffets the foe.' },
    { id: 'eagleEye',     name: 'Eagle Eye',      icon: '👁️', atk: 2, hp: 5, cost: 1, desc: 'Perfect aim — never misses.' },
    { id: 'featherBlade', name: 'Feather Blade',  icon: '🪶', atk: 4, hp: 3, cost: 2, desc: 'Razor-sharp feathers slice through armor.' },
    { id: 'cyclone',      name: 'Cyclone',        icon: '🌪️', atk: 6, hp: 1, cost: 3, desc: 'A vortex of cutting wind tears everything apart.' }
  ],
  waterSpirit: [
    { id: 'tidalWave',    name: 'Tidal Wave',     icon: '🌊', atk: 4, hp: 4, cost: 2, desc: 'A wall of water crashes into the enemy.' },
    { id: 'healStream',   name: 'Healing Stream', icon: '💧', atk: 1, hp: 7, cost: 1, desc: 'Flowing water heals and fortifies.' },
    { id: 'whirlpool',    name: 'Whirlpool',      icon: '🌀', atk: 3, hp: 5, cost: 2, desc: 'A spinning vortex traps and damages.' },
    { id: 'iceShard',     name: 'Ice Shard',      icon: '❄️', atk: 5, hp: 2, cost: 2, desc: 'A frozen lance pierces through.' },
    { id: 'tsunami',      name: 'Tsunami',        icon: '🏄', atk: 7, hp: 1, cost: 3, desc: 'Catastrophic wave obliterates all.' }
  ]
};

// ── TCG Enemy definitions ──────────────────────────────────────
const TCG_ENEMIES = {
  slimeBrute: {
    name: 'Slime Brute', icon: '🟢', hp: 20,
    cards: [
      { id: 'slimeTackle', name: 'Slime Tackle', icon: '💚', atk: 3, hp: 4, desc: 'A heavy slam of slime mass.' },
      { id: 'acidSpit',    name: 'Acid Spit',    icon: '🫧', atk: 2, hp: 5, desc: 'Corrosive acid dissolves defenses.' },
      { id: 'bloat',       name: 'Bloat',        icon: '🫁', atk: 1, hp: 7, desc: 'Puffs up, making it harder to hit.' }
    ],
    capturable: false,
    reward: 'gold'
  },
  stormwolfAlpha: {
    name: 'Stormwolf Alpha', icon: '🐺⚡', hp: 25,
    cards: [
      { id: 'thunderfang', name: 'Thunderfang',  icon: '⚡🦷', atk: 5, hp: 3, desc: 'Electrified bite crackles with storm energy.' },
      { id: 'stormDash',   name: 'Storm Dash',   icon: '💨🐺', atk: 4, hp: 4, desc: 'Lightning-fast charge attack.' },
      { id: 'alphaHowl',   name: 'Alpha Howl',   icon: '🌕🐺', atk: 3, hp: 5, desc: 'Commanding howl terrifies enemies.' }
    ],
    capturable: true,
    captureCompanionId: 'stormWolf',
    reward: 'companion'
  },
  annunakiDrone: {
    name: 'Annunaki Drone', icon: '🤖', hp: 22,
    cards: [
      { id: 'laserBeam',   name: 'Laser Beam',   icon: '🔴', atk: 5, hp: 2, desc: 'High-energy photon beam.' },
      { id: 'forceShield', name: 'Force Shield', icon: '🛡️', atk: 1, hp: 8, desc: 'Kinetic energy field absorbs impacts.' },
      { id: 'plasmaShot',  name: 'Plasma Shot',  icon: '🟣', atk: 4, hp: 3, desc: 'Superheated plasma projectile.' }
    ],
    capturable: false,
    reward: 'rare_loot'
  },
  skinwalker: {
    name: 'Skinwalker', icon: '👤', hp: 28,
    cards: [
      { id: 'shadowClaw',  name: 'Shadow Claw',  icon: '🖤', atk: 4, hp: 3, desc: 'Claws forged from living shadow.' },
      { id: 'mindWarp',    name: 'Mind Warp',    icon: '🌀', atk: 3, hp: 5, desc: 'Distorts perception and reality.' },
      { id: 'darkShroud',  name: 'Dark Shroud',  icon: '🌑', atk: 2, hp: 6, desc: 'A veil of darkness conceals weak points.' }
    ],
    capturable: false,
    reward: 'epic_loot'
  }
};

// ── TCG battle state ───────────────────────────────────────────
let _tcgState = null;

// ── Exploration UI render ─────────────────────────────────────
function renderExplorationTab(container) {
  if (!window.saveData) return;
  const sd = window.saveData;

  // Ensure exploration data exists
  if (!sd.exploration) {
    sd.exploration = { level: 1, xp: 0, activeExpedition: null, history: [] };
  }
  if (!sd.exploration.history) sd.exploration.history = [];
  const explo = sd.exploration;
  const exploLevel = explo.level || 1;
  const exploXp    = explo.xp || 0;
  const exploXpMax = _exploXpToNext(exploLevel);
  const exploXpPct = Math.min(100, Math.floor((exploXp / exploXpMax) * 100));

  const companionId = sd.selectedCompanion || 'greyAlien';
  const companionInfo = (typeof COMPANIONS !== 'undefined' && COMPANIONS[companionId]) || { name: 'Companion', icon: '👽' };

  // Build destination buttons HTML
  const destButtons = EXPLO_DESTINATIONS.map(d => {
    const dur = _exploDuration(d.baseDuration, exploLevel);
    const minutes = Math.floor(dur / 60);
    const seconds = dur % 60;
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    return `
      <button class="explo-dest-btn" data-dest-id="${d.id}"
        style="flex:1;min-width:120px;background:rgba(0,255,255,0.05);border:1px solid rgba(0,255,255,0.25);
        border-radius:8px;padding:10px 6px;color:#fff;cursor:pointer;text-align:center;font-size:12px;
        transition:border-color 0.2s,background 0.2s;">
        <div style="font-size:26px;margin-bottom:4px;">${d.icon}</div>
        <div style="color:#00ffff;font-weight:bold;font-size:11px;">${d.name}</div>
        <div style="color:#888;font-size:10px;margin-top:2px;">${d.description.substring(0, 40)}...</div>
        <div style="color:#aa44ff;font-size:10px;margin-top:4px;">⏱ ${timeStr} · Diff: ${'★'.repeat(d.difficulty)}</div>
      </button>`;
  }).join('');

  const hasActive = !!explo.activeExpedition && !explo.activeExpedition.completed;

  container.innerHTML = `
    <div style="font-family:'Courier New',monospace;">

      <!-- Header with Exploration Level -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;
           background:linear-gradient(135deg,rgba(10,0,21,0.9),rgba(26,0,51,0.9));
           border:1px solid rgba(0,255,255,0.3);border-radius:10px;padding:12px 16px;">
        <div>
          <div style="color:#00ffff;font-size:16px;font-weight:bold;letter-spacing:2px;">
            🗺 EXPLORATION  <span style="color:#aa44ff;">LV.${exploLevel}</span>
          </div>
          <div style="color:#888;font-size:10px;margin-top:2px;">
            Faster travel & higher catch rates at higher levels
          </div>
        </div>
        <div style="text-align:right;min-width:120px;">
          <div style="color:#ffd700;font-size:11px;margin-bottom:3px;">XP: ${exploXp} / ${exploXpMax}</div>
          <div style="height:6px;background:#222;border-radius:3px;overflow:hidden;border:1px solid #333;">
            <div style="height:100%;width:${exploXpPct}%;background:linear-gradient(90deg,#aa44ff,#00ffff);
                 border-radius:3px;transition:width 0.4s;"></div>
          </div>
          <div style="color:#888;font-size:10px;margin-top:2px;">Catch Rate: ${Math.round(_exploBaseCatchRate(exploLevel)*100)}%</div>
        </div>
      </div>

      ${hasActive ? _renderActiveExpedition(explo.activeExpedition, companionInfo, exploLevel) : `
        <!-- Choose Destination -->
        <div style="color:#ffd700;font-size:13px;font-weight:bold;margin-bottom:10px;letter-spacing:1px;">
          📍 CHOOSE DESTINATION
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
          ${destButtons}
        </div>

        <!-- Companion info -->
        <div style="background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.2);
             border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#aaa;">
          <span style="color:#ffd700;">Active Companion:</span>
          ${companionInfo.icon} <span style="color:#fff;">${companionInfo.name}</span>
          — Deck based on this companion's type
        </div>

        <!-- Log history -->
        ${_renderExploHistory(explo)}
      `}
    </div>`;

  // Wire up destination buttons
  container.querySelectorAll('.explo-dest-btn').forEach(btn => {
    btn.addEventListener('mouseenter', function() {
      this.style.borderColor = '#00ffff';
      this.style.background  = 'rgba(0,255,255,0.12)';
    });
    btn.addEventListener('mouseleave', function() {
      this.style.borderColor = 'rgba(0,255,255,0.25)';
      this.style.background  = 'rgba(0,255,255,0.05)';
    });
    btn.addEventListener('click', function() {
      const destId = this.getAttribute('data-dest-id');
      startExpedition(destId);
    });
  });

  // Wire up active expedition controls (if any)
  const cancelBtn = container.querySelector('#explo-cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', cancelExpedition);
  }
  const battleBtn = container.querySelector('#explo-battle-btn');
  if (battleBtn) {
    battleBtn.addEventListener('click', function() {
      const enemyId = this.getAttribute('data-enemy-id');
      startTCGBattle(enemyId);
    });
  }
}

// ── Active expedition map display ─────────────────────────────
function _renderActiveExpedition(expedition, companionInfo, exploLevel) {
  const now = Date.now();
  const elapsed  = (now - expedition.startTime) / 1000;
  const duration = expedition.duration;
  const progress = Math.min(100, Math.floor((elapsed / duration) * 100));

  // Update progress in saveData
  if (window.saveData && window.saveData.exploration) {
    window.saveData.exploration.activeExpedition.progress = progress;
  }

  const dest = EXPLO_DESTINATIONS.find(d => d.id === expedition.destId) || EXPLO_DESTINATIONS[0];
  const isComplete = elapsed >= duration;
  const isBattlePending = expedition.battlePending && !expedition.battleDone;

  const statusColor = isBattlePending ? '#ff4444' : isComplete ? '#ffd700' : '#00ffff';
  const statusLabel = isBattlePending ? '⚔️ BATTLE PENDING' : isComplete ? '✅ ARRIVED — SEARCHING...' : `🚶 EN ROUTE (${progress}%)`;

  // Build log HTML (latest 10 events)
  const logEntries = (expedition.events || []).slice(-12).map(ev => {
    const color = ev.loot ? EXPLO_RARITY_COLORS[ev.loot.rarity] || '#aaa' : '#aaa';
    const icon  = ev.loot ? '💎' : ev.type === 'battle' ? '⚔️' : '📖';
    return `<div style="margin-bottom:4px;color:${color};font-size:10px;line-height:1.4;">
      ${icon} ${ev.text}
    </div>`;
  }).join('');

  // Companion position on map (0-100%)
  const companionLeft = Math.max(0, Math.min(88, progress));

  return `
    <!-- Active Expedition -->
    <div style="background:linear-gradient(135deg,rgba(10,0,21,0.95),rgba(26,0,51,0.95));
         border:1px solid ${statusColor};border-radius:12px;padding:14px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="color:${statusColor};font-size:13px;font-weight:bold;">${statusLabel}</div>
        <div style="color:#888;font-size:11px;">📍 ${dest.name} ${dest.icon}</div>
      </div>

      <!-- Map track -->
      <div style="position:relative;height:48px;background:rgba(0,0,0,0.5);border-radius:8px;
           border:1px solid rgba(0,255,255,0.2);overflow:visible;margin-bottom:10px;">
        <!-- Dashed path line -->
        <div style="position:absolute;top:50%;left:8px;right:8px;height:2px;
             background:repeating-linear-gradient(90deg,rgba(0,255,255,0.4) 0,rgba(0,255,255,0.4) 6px,transparent 6px,transparent 12px);
             transform:translateY(-50%);border-radius:1px;"></div>
        <!-- Progress filled path -->
        <div style="position:absolute;top:50%;left:8px;width:max(0px, calc(${Math.min(progress, 100)}% - 16px));height:2px;
             background:linear-gradient(90deg,#aa44ff,#00ffff);transform:translateY(-50%);border-radius:1px;
             transition:width 0.5s;box-shadow:0 0 8px rgba(0,255,255,0.6);"></div>
        <!-- Destination marker -->
        <div style="position:absolute;right:6px;top:50%;transform:translateY(-50%);
             font-size:22px;filter:drop-shadow(0 0 4px ${statusColor});">${dest.icon}</div>
        <!-- Companion marker -->
        <div style="position:absolute;left:calc(${companionLeft}% + 4px);top:50%;transform:translateY(-50%);
             font-size:26px;filter:drop-shadow(0 0 6px #aa44ff);transition:left 0.5s;
             animation:explo-bounce 1.2s ease-in-out infinite;">${companionInfo.icon || '👽'}</div>
      </div>

      <!-- Progress bar -->
      <div style="height:6px;background:#222;border-radius:3px;overflow:hidden;margin-bottom:10px;">
        <div style="height:100%;width:${progress}%;background:linear-gradient(90deg,#aa44ff,#00ffff);
             border-radius:3px;transition:width 0.5s;"></div>
      </div>

      <!-- Two-column layout: log + actions -->
      <div style="display:flex;gap:10px;">
        <!-- RPG text log -->
        <div style="flex:1;background:rgba(0,0,0,0.6);border:1px solid rgba(0,255,255,0.15);
             border-radius:8px;padding:10px;height:140px;overflow-y:auto;
             font-family:'Courier New',monospace;scrollbar-width:thin;scrollbar-color:#333 #000;">
          <div style="color:#ffd700;font-size:10px;letter-spacing:1px;margin-bottom:6px;border-bottom:1px solid #333;padding-bottom:4px;">
            📡 EXPEDITION LOG
          </div>
          ${logEntries || '<div style="color:#444;font-size:10px;font-style:italic;">Awaiting transmissions...</div>'}
        </div>

        <!-- Actions panel -->
        <div style="min-width:120px;display:flex;flex-direction:column;gap:6px;">
          ${isBattlePending ? `
            <button id="explo-battle-btn" data-enemy-id="${expedition.pendingEnemy}"
              style="background:linear-gradient(135deg,#ff4444,#aa0000);border:none;border-radius:8px;
              padding:10px;color:#fff;font-weight:bold;cursor:pointer;font-size:12px;
              box-shadow:0 0 12px rgba(255,68,68,0.5);animation:explo-pulse 1s ease-in-out infinite;">
              ⚔️ Battle!
            </button>` : ''}
          ${isComplete && !isBattlePending ? `
            <button onclick="completeExpedition()"
              style="background:linear-gradient(135deg,#ffd700,#ff8c00);border:none;border-radius:8px;
              padding:10px;color:#000;font-weight:bold;cursor:pointer;font-size:12px;">
              ✅ Return
            </button>` : ''}
          <button id="explo-cancel-btn"
            style="background:rgba(255,255,255,0.08);border:1px solid #555;border-radius:8px;
            padding:8px;color:#888;cursor:pointer;font-size:11px;">
            ✖ Abandon
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── Expedition log history ─────────────────────────────────────
function _renderExploHistory(explo) {
  const history = (explo.history || []).slice(-5).reverse();
  if (!history.length) return '';
  const rows = history.map(h => {
    const dest = EXPLO_DESTINATIONS.find(d => d.id === h.destId);
    const lootHTML = (h.loot || []).slice(0, 3).map(l =>
      `<span style="color:${EXPLO_RARITY_COLORS[l.rarity] || '#aaa'};font-size:10px;">${l.item}</span>`
    ).join(', ');
    return `
      <div style="background:rgba(255,255,255,0.03);border-radius:6px;padding:8px;margin-bottom:6px;font-size:11px;">
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#ffd700;">${dest ? dest.icon + ' ' + dest.name : 'Unknown'}</span>
          <span style="color:#555;font-size:10px;">${h.outcome || 'Completed'}</span>
        </div>
        <div style="color:#888;margin-top:3px;">Loot: ${lootHTML || '<span style="color:#555">None</span>'}</div>
      </div>`;
  }).join('');
  return `
    <div style="color:#888;font-size:11px;font-weight:bold;margin-bottom:6px;letter-spacing:1px;">RECENT EXPEDITIONS</div>
    ${rows}`;
}

// ── Start expedition ──────────────────────────────────────────
function startExpedition(destId) {
  if (!window.saveData) return;
  const sd = window.saveData;
  if (!sd.exploration) sd.exploration = { level: 1, xp: 0, activeExpedition: null, history: [] };
  if (!sd.exploration.history) sd.exploration.history = [];

  // Can't start if already active
  if (sd.exploration.activeExpedition && !sd.exploration.activeExpedition.completed) {
    if (typeof showStatChange === 'function') showStatChange('⚠️ Expedition already in progress!');
    return;
  }

  const dest = EXPLO_DESTINATIONS.find(d => d.id === destId);
  if (!dest) return;

  const companionId = sd.selectedCompanion || 'greyAlien';
  const companionInfo = (typeof COMPANIONS !== 'undefined' && COMPANIONS[companionId]) || { name: 'Companion', icon: '👽' };
  const exploLevel = sd.exploration.level || 1;
  const duration = _exploDuration(dest.baseDuration, exploLevel);

  sd.exploration.activeExpedition = {
    destId,
    companionId,
    startTime: Date.now(),
    duration,
    progress: 0,
    events: [],
    loot: [],
    battlePending: false,
    pendingEnemy: null,
    battleDone: false,
    completed: false
  };

  // Immediately log a departure event
  _appendExploEvent(sd.exploration.activeExpedition, companionInfo.name,
    `${companionInfo.icon} ${companionInfo.name} departs for ${dest.name}!`, dest, null);

  if (typeof saveSaveData === 'function') saveSaveData();
  if (typeof showStatChange === 'function') showStatChange(`🗺 ${companionInfo.name} sent on expedition!`);
  if (typeof playSound === 'function') playSound('collect');

  // Start the ticker
  _startExploTicker();

  // Re-render the companion house if it's open
  _refreshExploUI();
}
window.startExpedition = startExpedition;

// ── Expedition ticker ─────────────────────────────────────────
let _exploTickerInterval = null;

function _startExploTicker() {
  if (_exploTickerInterval) clearInterval(_exploTickerInterval);
  _exploTickerInterval = setInterval(_exploTick, 5000);
  _exploTick(); // Run once immediately
}

function _exploTick() {
  if (!window.saveData || !window.saveData.exploration) { clearInterval(_exploTickerInterval); return; }
  const explo = window.saveData.exploration;
  const expedition = explo.activeExpedition;
  if (!expedition || expedition.completed) { clearInterval(_exploTickerInterval); return; }
  if (expedition.battlePending && !expedition.battleDone) return; // Paused for battle

  const now = Date.now();
  const elapsed  = (now - expedition.startTime) / 1000;
  const duration = expedition.duration;
  const progress = Math.min(100, (elapsed / duration) * 100);
  expedition.progress = progress;

  const dest = EXPLO_DESTINATIONS.find(d => d.id === expedition.destId) || EXPLO_DESTINATIONS[0];
  const companionInfo = (typeof COMPANIONS !== 'undefined' && COMPANIONS[expedition.companionId]) || { name: 'Companion', icon: '👽' };

  // Generate a random event every tick if not yet arrived
  if (progress < 95) {
    const eventChance = 0.6;
    if (Math.random() < eventChance) {
      const evTemplates = EXPLO_EVENTS[dest.region] || EXPLO_EVENTS.forest;
      const template = evTemplates[Math.floor(Math.random() * evTemplates.length)];
      const text = template.replace('{companion}', companionInfo.name);

      // Random loot drop chance during travel (10%)
      let loot = null;
      if (Math.random() < 0.10) {
        loot = _exploRollLoot(dest, explo.level || 1);
        expedition.loot.push(loot);
      }
      _appendExploEvent(expedition, companionInfo.name, text, dest, loot);
    }
  }

  // Check if arrived
  if (progress >= 100 && !expedition.arrivalProcessed) {
    expedition.arrivalProcessed = true;

    // Arrival: generate loot burst (runs exactly once)
    const lootCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < lootCount; i++) {
      const loot = _exploRollLoot(dest, explo.level || 1);
      expedition.loot.push(loot);
      _appendExploEvent(expedition, companionInfo.name,
        `Found: ${loot.item}`, dest, loot);
    }

    // Random battle encounter on arrival (base 40%, increased by destination difficulty)
    const enemyPool = dest.enemies || ['slimeBrute'];
    const battleChance = 0.4 + (dest.difficulty - 1) * 0.2;
    if (Math.random() < battleChance) {
      const enemyId = enemyPool[Math.floor(Math.random() * enemyPool.length)];
      expedition.battlePending = true;
      expedition.pendingEnemy  = enemyId;
      const enemy = TCG_ENEMIES[enemyId];
      _appendExploEvent(expedition, companionInfo.name,
        `⚠️ ${companionInfo.name} encountered a ${enemy ? enemy.name : 'hostile'} — battle imminent!`, dest, null, 'battle');
    }
  }

  if (typeof saveSaveData === 'function') saveSaveData();
  _refreshExploUI();
}

function _appendExploEvent(expedition, companionName, text, dest, loot, type) {
  expedition.events = expedition.events || [];
  expedition.events.push({ text, loot: loot || null, type: type || 'travel', ts: Date.now() });
  // Keep to 30 events max
  if (expedition.events.length >= 30) expedition.events.shift();
}

// ── Complete expedition ───────────────────────────────────────
function completeExpedition() {
  if (!window.saveData || !window.saveData.exploration) return;
  const explo = window.saveData.exploration;
  const expedition = explo.activeExpedition;
  if (!expedition) return;

  const dest = EXPLO_DESTINATIONS.find(d => d.id === expedition.destId) || EXPLO_DESTINATIONS[0];
  const loot = expedition.loot || [];

  // Add to history
  explo.history = explo.history || [];
  explo.history.push({
    destId: expedition.destId,
    loot: loot.slice(0, 5),
    outcome: 'Completed',
    ts: Date.now()
  });
  if (explo.history.length > 10) explo.history.shift();

  // Grant exploration XP
  const xpGained = 10 + dest.difficulty * 10 + loot.length * 2;
  _grantExploXP(xpGained);

  // Grant gold for loot (simple conversion)
  const goldGained = loot.reduce((sum, l) => {
    const rarityGold = { common: 5, uncommon: 15, rare: 40, epic: 100, legendary: 300, mythic: 1000 };
    return sum + (rarityGold[l.rarity] || 5);
  }, 0);
  if (goldGained > 0 && window.saveData) {
    window.saveData.gold = (window.saveData.gold || 0) + goldGained;
    if (typeof showStatChange === 'function') showStatChange(`🪙 +${goldGained} Gold from expedition!`);
  }

  // Show loot summary
  if (loot.length > 0) {
    const lootStr = loot.slice(0, 3).map(l => l.item).join(', ');
    if (typeof showStatChange === 'function') showStatChange(`💎 Loot: ${lootStr}`);
  }

  explo.activeExpedition = null;
  if (_exploTickerInterval) clearInterval(_exploTickerInterval);
  if (typeof saveSaveData === 'function') saveSaveData();
  if (typeof playSound === 'function') playSound('collect');

  _refreshExploUI();
}
window.completeExpedition = completeExpedition;

// ── Cancel expedition ─────────────────────────────────────────
function cancelExpedition() {
  if (!window.saveData || !window.saveData.exploration) return;
  window.saveData.exploration.activeExpedition = null;
  if (_exploTickerInterval) clearInterval(_exploTickerInterval);
  if (typeof saveSaveData === 'function') saveSaveData();
  if (typeof showStatChange === 'function') showStatChange('✖ Expedition abandoned.');
  _refreshExploUI();
}
window.cancelExpedition = cancelExpedition;

// ── Grant exploration XP ──────────────────────────────────────
function _grantExploXP(amount) {
  if (!window.saveData || !window.saveData.exploration) return;
  const explo = window.saveData.exploration;
  explo.level = explo.level || 1;
  explo.xp = (explo.xp || 0) + amount;

  let xpMax = _exploXpToNext(explo.level);
  while (explo.xp >= xpMax) {
    explo.xp -= xpMax;
    explo.level += 1;
    if (typeof showStatChange === 'function') showStatChange(`🗺 Exploration Level Up! Now LV.${explo.level}`);
    if (typeof playSound === 'function') playSound('levelUp');
    xpMax = _exploXpToNext(explo.level);
  }
}

// ── Refresh exploration UI if companion house is open ──────────
function _refreshExploUI() {
  const container = document.getElementById('ch-tab-exploration');
  if (!container || container.style.display === 'none') return;
  renderExplorationTab(container);
}

// ============================================================
// TCG MINIGAME
// ============================================================

function startTCGBattle(enemyId) {
  const enemy = TCG_ENEMIES[enemyId];
  if (!enemy) return;

  const companionId = (window.saveData && window.saveData.selectedCompanion) || 'greyAlien';
  const companionInfo = (typeof COMPANIONS !== 'undefined' && COMPANIONS[companionId]) || { name: 'Companion', icon: '👽' };
  const deckKey = Object.keys(TCG_DECKS).includes(companionId) ? companionId : 'greyAlien';
  const playerDeck = TCG_DECKS[deckKey].map(c => ({ ...c, currentHp: c.hp }));
  const enemyDeck  = enemy.cards.map(c => ({ ...c, currentHp: c.hp }));

  _tcgState = {
    enemyId,
    enemy,
    companionId,
    companionInfo,
    playerDeck: _shuffle(playerDeck),
    enemyDeck:  _shuffle(enemyDeck),
    playerHand:  [],
    enemyHand:   [],
    playerBoard:  [],
    enemyBoard:   [],
    playerHp:  20,
    enemyHp:   enemy.hp,
    turn:      'player',
    phase:     'play',
    log:       [],
    energy:    2,
    maxEnergy: 3,
    roundNum:  1
  };

  // Draw opening hands (3 each)
  for (let i = 0; i < 3; i++) _tcgDraw('player');
  for (let i = 0; i < 3; i++) _tcgDraw('enemy');

  _renderTCGModal();
}
window.startTCGBattle = startTCGBattle;

function _shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function _tcgDraw(side) {
  if (!_tcgState) return;
  const deck = side === 'player' ? _tcgState.playerDeck : _tcgState.enemyDeck;
  const hand = side === 'player' ? _tcgState.playerHand : _tcgState.enemyHand;
  if (deck.length === 0) return;
  const card = deck.splice(0, 1)[0];
  hand.push({ ...card, currentHp: card.hp });
}

function _tcgLog(msg) {
  if (!_tcgState) return;
  _tcgState.log.push(msg);
  if (_tcgState.log.length > 8) _tcgState.log.shift();
}

// ── Play a card from player's hand ────────────────────────────
function tcgPlayCard(handIndex) {
  if (!_tcgState || _tcgState.turn !== 'player' || _tcgState.phase !== 'play') return;
  const card = _tcgState.playerHand[handIndex];
  if (!card) return;
  if (card.cost > _tcgState.energy) {
    _tcgLog('⚠️ Not enough energy!');
    _updateTCGUI();
    return;
  }
  _tcgState.energy -= card.cost;
  _tcgState.playerHand.splice(handIndex, 1);
  _tcgState.playerBoard.push({ ...card, exhausted: false });
  _tcgLog(`You played ${card.icon} ${card.name}`);
  _updateTCGUI();
}
window.tcgPlayCard = tcgPlayCard;

// ── Attack with a board card ───────────────────────────────────
function tcgAttack(boardIndex) {
  if (!_tcgState || _tcgState.turn !== 'player' || _tcgState.phase !== 'play') return;
  const attacker = _tcgState.playerBoard[boardIndex];
  if (!attacker || attacker.exhausted) return;

  // If enemy has board creatures, must attack them first
  if (_tcgState.enemyBoard.length > 0) {
    const target = _tcgState.enemyBoard[0];
    target.currentHp -= attacker.atk;
    attacker.currentHp -= target.atk;
    _tcgLog(`${attacker.icon} ${attacker.name} attacks ${target.icon} ${target.name}!`);
    if (target.currentHp <= 0) {
      _tcgState.enemyBoard.splice(0, 1);
      _tcgLog(`${target.name} destroyed!`);
    }
    if (attacker.currentHp <= 0) {
      _tcgState.playerBoard.splice(boardIndex, 1);
      _tcgLog(`${attacker.name} destroyed!`);
    } else {
      attacker.exhausted = true;
    }
  } else {
    // Attack enemy hero directly
    _tcgState.enemyHp -= attacker.atk;
    attacker.exhausted = true;
    _tcgLog(`${attacker.icon} ${attacker.name} strikes the ${_tcgState.enemy.name} for ${attacker.atk} dmg!`);
  }

  if (_tcgState.enemyHp <= 0) {
    _tcgEndBattle('player');
    return;
  }
  _updateTCGUI();
}
window.tcgAttack = tcgAttack;

// ── End player turn ────────────────────────────────────────────
function tcgEndTurn() {
  if (!_tcgState || _tcgState.turn !== 'player') return;
  _tcgState.turn = 'enemy';
  _tcgState.phase = 'play';
  _tcgLog('Enemy turn begins...');
  _updateTCGUI();

  // Enemy AI plays after a short delay
  setTimeout(_tcgEnemyTurn, 900);
}
window.tcgEndTurn = tcgEndTurn;

// ── Simple enemy AI ────────────────────────────────────────────
function _tcgEnemyTurn() {
  if (!_tcgState) return;

  // Draw
  _tcgDraw('enemy');

  // Reset energy
  _tcgState.energy = _tcgState.maxEnergy;
  _tcgState.roundNum++;
  if (_tcgState.roundNum % 2 === 0) _tcgState.maxEnergy = Math.min(10, _tcgState.maxEnergy + 1);

  // Play affordable cards
  let played = true;
  while (played && _tcgState.enemyHand.length > 0) {
    played = false;
    for (let i = 0; i < _tcgState.enemyHand.length; i++) {
      const c = _tcgState.enemyHand[i];
      if (c.cost <= _tcgState.energy) {
        _tcgState.energy -= c.cost;
        _tcgState.enemyHand.splice(i, 1);
        _tcgState.enemyBoard.push({ ...c, exhausted: false });
        _tcgLog(`Enemy played ${c.icon} ${c.name}`);
        played = true;
        break;
      }
    }
  }

  // Attack with all board creatures
  for (let i = _tcgState.enemyBoard.length - 1; i >= 0; i--) {
    const attacker = _tcgState.enemyBoard[i];
    if (_tcgState.playerBoard.length > 0) {
      const target = _tcgState.playerBoard[0];
      target.currentHp -= attacker.atk;
      attacker.currentHp -= target.atk;
      _tcgLog(`${attacker.icon} ${attacker.name} attacks ${target.icon} ${target.name}!`);
      if (target.currentHp <= 0) {
        _tcgState.playerBoard.splice(0, 1);
        _tcgLog(`${target.name} destroyed!`);
      }
      if (attacker.currentHp <= 0) {
        _tcgState.enemyBoard.splice(i, 1);
        _tcgLog(`${attacker.name} destroyed!`);
      }
    } else {
      _tcgState.playerHp -= attacker.atk;
      _tcgLog(`${attacker.name} deals ${attacker.atk} damage to you!`);
    }
    if (_tcgState.playerHp <= 0) {
      _tcgEndBattle('enemy');
      return;
    }
  }

  // Back to player turn
  _tcgState.turn = 'player';
  _tcgState.phase = 'play';
  _tcgState.energy = Math.min(10, _tcgState.maxEnergy);
  // Un-exhaust player cards
  _tcgState.playerBoard.forEach(c => c.exhausted = false);
  // Draw for player
  _tcgDraw('player');
  _tcgLog('--- Your Turn ---');
  _updateTCGUI();
}

// ── End the battle ─────────────────────────────────────────────
function _tcgEndBattle(winner) {
  if (!_tcgState) return;
  const isPlayerWin = winner === 'player';
  const enemy = _tcgState.enemy;

  if (isPlayerWin) {
    _tcgLog(`✅ Victory! ${enemy.name} defeated!`);

    // Mark battle as done in expedition
    if (window.saveData && window.saveData.exploration && window.saveData.exploration.activeExpedition) {
      const exp = window.saveData.exploration.activeExpedition;
      exp.battlePending = false;
      exp.battleDone = true;

      // Grant exploration XP for battle win
      _grantExploXP(15 + (EXPLO_DESTINATIONS.find(d => d.id === exp.destId) || {}).difficulty * 10 || 15);
    }

    // Check for capture
    if (enemy.capturable) {
      const catchRate = _exploBaseCatchRate((window.saveData && window.saveData.exploration && window.saveData.exploration.level) || 1);
      if (Math.random() < catchRate) {
        _tcgCaptureEnemy(enemy);
      } else {
        _tcgLog(`${enemy.name} fled before capture... (${Math.round(catchRate * 100)}% chance failed)`);
      }
    }

    if (typeof saveSaveData === 'function') saveSaveData();

    // Show victory overlay within modal
    _showTCGResult(true, enemy);
  } else {
    _tcgLog('💀 Defeated! The expedition ends early...');
    if (window.saveData && window.saveData.exploration && window.saveData.exploration.activeExpedition) {
      window.saveData.exploration.activeExpedition.completed = true;
      // Add to history as failed
      const exp = window.saveData.exploration.activeExpedition;
      if (!window.saveData.exploration.history) window.saveData.exploration.history = [];
      window.saveData.exploration.history.push({
        destId: exp.destId,
        loot: (exp.loot || []).slice(0, 3),
        outcome: 'Defeated',
        ts: Date.now()
      });
      window.saveData.exploration.activeExpedition = null;
    }
    if (typeof saveSaveData === 'function') saveSaveData();
    _showTCGResult(false, enemy);
  }
}

function _tcgCaptureEnemy(enemy) {
  if (!window.saveData || !enemy.captureCompanionId) return;
  const cId = enemy.captureCompanionId;
  if (!window.saveData.companions) return;
  if (!window.saveData.companions[cId]) {
    window.saveData.companions[cId] = { unlocked: false, level: 1, xp: 0, skills: {} };
  }
  if (!window.saveData.companions[cId].unlocked) {
    window.saveData.companions[cId].unlocked = true;
    _tcgLog(`🎉 ${enemy.name} CAPTURED! Added to your companion roster!`);
    if (typeof showStatChange === 'function') showStatChange(`🐺 ${enemy.name} captured & added to Companion House!`);
    // Progress wolf breeding quest if relevant
    if (window.saveData.tutorialQuests && window.saveData.tutorialQuests.currentQuest === 'quest34_breedWolf') {
      if (typeof progressTutorialQuest === 'function') progressTutorialQuest('quest34_breedWolf', true);
    }
  } else {
    _tcgLog(`${enemy.name} tried to join but you already have one!`);
  }
}

// ── Show TCG result overlay ────────────────────────────────────
function _showTCGResult(isWin, enemy) {
  const modal = document.getElementById('tcg-battle-modal');
  if (!modal) return;
  const color  = isWin ? '#ffd700' : '#ff4444';
  const title  = isWin ? '⚔️ VICTORY!' : '💀 DEFEATED';
  const subtitle = isWin
    ? `You overcame the ${enemy.name}!`
    : `The ${enemy.name} overwhelmed you.`;

  const resultDiv = document.createElement('div');
  resultDiv.style.cssText = `position:absolute;inset:0;background:rgba(0,0,0,0.88);display:flex;
    flex-direction:column;align-items:center;justify-content:center;border-radius:12px;z-index:10;`;
  resultDiv.innerHTML = `
    <div style="font-size:64px;margin-bottom:12px;filter:drop-shadow(0 0 20px ${color});">
      ${isWin ? '🏆' : '💀'}
    </div>
    <div style="font-family:'Bangers',cursive;font-size:36px;color:${color};letter-spacing:4px;
         text-shadow:0 0 20px ${color};">${title}</div>
    <div style="color:#aaa;font-size:13px;margin-top:6px;margin-bottom:20px;">${subtitle}</div>
    <div style="background:rgba(0,0,0,0.5);border:1px solid #333;border-radius:8px;
         padding:12px 20px;margin-bottom:16px;font-size:11px;color:#aaa;text-align:left;max-width:300px;">
      ${_tcgState && _tcgState.log.slice(-4).map(l => `<div>${l}</div>`).join('') || ''}
    </div>
    <button onclick="closeTCGBattle()"
      style="background:linear-gradient(135deg,${color},${isWin ? '#ff8c00' : '#880000'});
      border:none;border-radius:10px;padding:12px 32px;color:${isWin ? '#000' : '#fff'};
      font-weight:bold;cursor:pointer;font-size:14px;letter-spacing:1px;">
      ${isWin ? 'Continue Expedition →' : 'Return to Camp'}
    </button>`;
  modal.querySelector('.tcg-inner').appendChild(resultDiv);
}

// ── Close TCG battle modal ─────────────────────────────────────
function closeTCGBattle() {
  const modal = document.getElementById('tcg-battle-modal');
  if (modal) modal.remove();
  _tcgState = null;
  _refreshExploUI();
}
window.closeTCGBattle = closeTCGBattle;

// ── Render the full TCG modal ──────────────────────────────────
function _renderTCGModal() {
  const existing = document.getElementById('tcg-battle-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'tcg-battle-modal';
  modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.97);z-index:9000;
    display:flex;align-items:center;justify-content:center;font-family:'Courier New',monospace;`;

  modal.innerHTML = `
    <div class="tcg-inner" style="position:relative;width:100%;max-width:700px;max-height:90vh;
         background:linear-gradient(160deg,#0a0015,#1a0033);border:2px solid #aa44ff;border-radius:14px;
         padding:16px;overflow-y:auto;box-shadow:0 0 60px rgba(170,68,255,0.4);">
      ${_buildTCGHTML()}
    </div>`;

  document.body.appendChild(modal);
}

function _updateTCGUI() {
  const inner = document.querySelector('#tcg-battle-modal .tcg-inner');
  if (!inner) return;
  // Preserve any result overlay
  const resultOverlay = inner.querySelector('[style*="position:absolute"]');
  inner.innerHTML = _buildTCGHTML();
  if (resultOverlay) inner.appendChild(resultOverlay);
}

function _buildTCGHTML() {
  if (!_tcgState) return '';
  const s = _tcgState;
  const ci = s.companionInfo;

  const playerHpPct = Math.max(0, Math.min(100, (s.playerHp / 20) * 100));
  const enemyHpPct  = Math.max(0, Math.min(100, (s.enemyHp  / s.enemy.hp) * 100));

  const playerBoardHTML = s.playerBoard.map((c, i) =>
    `<div onclick="tcgAttack(${i})"
      style="background:${c.exhausted ? 'rgba(80,40,120,0.4)' : 'rgba(170,68,255,0.2)'};
      border:2px solid ${c.exhausted ? '#555' : '#aa44ff'};border-radius:8px;padding:8px;
      min-width:80px;text-align:center;cursor:${c.exhausted ? 'default' : 'pointer'};
      opacity:${c.exhausted ? 0.6 : 1};transition:transform 0.15s;
      ${!c.exhausted ? 'box-shadow:0 0 10px rgba(170,68,255,0.5);' : ''}"
      ${!c.exhausted ? `onmouseenter="this.style.transform='scale(1.05)'" onmouseleave="this.style.transform='scale(1)'"` : ''}>
      <div style="font-size:22px;">${c.icon}</div>
      <div style="font-size:9px;color:#fff;font-weight:bold;">${c.name}</div>
      <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;">
        <span style="color:#ff4444;">⚔${c.atk}</span>
        <span style="color:#44ff88;">❤${c.currentHp}</span>
      </div>
    </div>`
  ).join('');

  const enemyBoardHTML = s.enemyBoard.map((c, i) =>
    `<div style="background:rgba(255,68,68,0.15);border:2px solid #ff4444;border-radius:8px;
      padding:8px;min-width:80px;text-align:center;">
      <div style="font-size:22px;">${c.icon}</div>
      <div style="font-size:9px;color:#fff;font-weight:bold;">${c.name}</div>
      <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;">
        <span style="color:#ff4444;">⚔${c.atk}</span>
        <span style="color:#44ff88;">❤${c.currentHp}</span>
      </div>
    </div>`
  ).join('');

  const playerHandHTML = s.playerHand.map((c, i) =>
    `<div onclick="tcgPlayCard(${i})"
      style="background:linear-gradient(160deg,rgba(0,255,255,0.08),rgba(170,68,255,0.12));
      border:2px solid ${c.cost <= s.energy && s.turn === 'player' ? '#00ffff' : '#333'};
      border-radius:10px;padding:10px 8px;min-width:90px;text-align:center;cursor:pointer;
      transition:transform 0.15s,border-color 0.2s;position:relative;"
      onmouseenter="this.style.transform='translateY(-8px)'"
      onmouseleave="this.style.transform='translateY(0)'">
      <div style="position:absolute;top:-8px;right:-8px;background:#aa44ff;border-radius:50%;
           width:18px;height:18px;display:flex;align-items:center;justify-content:center;
           font-size:10px;color:#fff;font-weight:bold;">${c.cost}</div>
      <div style="font-size:28px;margin-bottom:4px;">${c.icon}</div>
      <div style="font-size:9px;color:#fff;font-weight:bold;margin-bottom:3px;">${c.name}</div>
      <div style="font-size:8px;color:#888;margin-bottom:5px;">${c.desc}</div>
      <div style="display:flex;justify-content:space-between;font-size:10px;">
        <span style="color:#ff4444;">⚔${c.atk}</span>
        <span style="color:#44ff88;">❤${c.hp}</span>
      </div>
    </div>`
  ).join('');

  const logHTML = s.log.map((l, i) =>
    `<div style="opacity:${0.5 + (i / s.log.length) * 0.5};font-size:10px;color:#ccc;
      margin-bottom:2px;${i === s.log.length - 1 ? 'color:#fff;font-weight:bold;' : ''}">${l}</div>`
  ).join('');

  return `
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;
         border-bottom:1px solid rgba(170,68,255,0.4);padding-bottom:10px;">
      <div style="font-family:'Bangers',cursive;font-size:22px;color:#aa44ff;letter-spacing:3px;">
        ⚔️ TCG BATTLE
      </div>
      <div style="display:flex;gap:16px;align-items:center;">
        <!-- Energy -->
        <div style="background:rgba(170,68,255,0.15);border:1px solid #aa44ff;border-radius:6px;
             padding:4px 10px;font-size:12px;color:#aa44ff;">
          ⚡ ${s.energy}/${s.maxEnergy}
        </div>
        <div style="color:#888;font-size:11px;">Round ${s.roundNum}</div>
      </div>
    </div>

    <!-- Enemy zone -->
    <div style="background:rgba(255,68,68,0.05);border:1px solid rgba(255,68,68,0.2);
         border-radius:10px;padding:10px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="color:#ff4444;font-size:13px;font-weight:bold;">${s.enemy.icon} ${s.enemy.name}</div>
        <div style="text-align:right;">
          <div style="color:#ff4444;font-size:11px;">HP: ${Math.max(0,s.enemyHp)} / ${s.enemy.hp}</div>
          <div style="width:120px;height:6px;background:#330;border-radius:3px;overflow:hidden;margin-top:2px;">
            <div style="height:100%;width:${enemyHpPct}%;background:#ff4444;border-radius:3px;transition:width 0.3s;"></div>
          </div>
        </div>
      </div>
      <!-- Enemy board -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;min-height:50px;align-items:center;">
        ${enemyBoardHTML || '<div style="color:#555;font-size:11px;font-style:italic;">No cards in play</div>'}
      </div>
    </div>

    <!-- Battle log -->
    <div style="background:rgba(0,0,0,0.6);border:1px solid #222;border-radius:8px;
         padding:8px 12px;margin-bottom:10px;height:80px;overflow-y:auto;scrollbar-width:thin;">
      ${logHTML || '<div style="color:#444;font-size:10px;font-style:italic;">Battle begins...</div>'}
    </div>

    <!-- Player board -->
    <div style="background:rgba(0,255,255,0.04);border:1px solid rgba(0,255,255,0.15);
         border-radius:10px;padding:10px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="color:#00ffff;font-size:13px;font-weight:bold;">${ci.icon || '👽'} ${ci.name || 'You'}</div>
        <div style="text-align:right;">
          <div style="color:#44ff88;font-size:11px;">HP: ${Math.max(0,s.playerHp)} / 20</div>
          <div style="width:120px;height:6px;background:#030;border-radius:3px;overflow:hidden;margin-top:2px;">
            <div style="height:100%;width:${playerHpPct}%;background:#44ff88;border-radius:3px;transition:width 0.3s;"></div>
          </div>
        </div>
      </div>
      <!-- Player board -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;min-height:50px;align-items:center;">
        ${playerBoardHTML || '<div style="color:#555;font-size:11px;font-style:italic;">No cards in play — play from hand below</div>'}
      </div>
    </div>

    <!-- Player hand -->
    <div style="margin-bottom:12px;">
      <div style="color:#888;font-size:10px;letter-spacing:1px;margin-bottom:6px;">YOUR HAND</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;min-height:60px;">
        ${playerHandHTML || '<div style="color:#444;font-size:11px;font-style:italic;">No cards in hand</div>'}
      </div>
    </div>

    <!-- Actions -->
    <div style="display:flex;gap:8px;justify-content:center;">
      <button onclick="tcgEndTurn()"
        style="background:linear-gradient(135deg,#00ffff,#aa44ff);border:none;border-radius:8px;
        padding:10px 28px;color:#000;font-weight:bold;cursor:pointer;font-size:13px;
        ${s.turn !== 'player' ? 'opacity:0.4;pointer-events:none;' : ''}">
        ${s.turn === 'player' ? '✅ End Turn' : '⏳ Enemy Turn...'}
      </button>
      <button onclick="closeTCGBattle()"
        style="background:rgba(255,255,255,0.08);border:1px solid #555;border-radius:8px;
        padding:10px 20px;color:#888;cursor:pointer;font-size:12px;">
        🏳 Surrender
      </button>
    </div>
  `;
}

// ── CSS animations injection ───────────────────────────────────
(function _injectExploCSS() {
  if (document.getElementById('explo-css')) return;
  const style = document.createElement('style');
  style.id = 'explo-css';
  style.textContent = `
    @keyframes explo-bounce {
      0%,100% { transform: translateY(-50%) translateX(0); }
      50%      { transform: translateY(-60%) translateX(0); }
    }
    @keyframes explo-pulse {
      0%,100% { box-shadow: 0 0 8px rgba(255,68,68,0.5); }
      50%      { box-shadow: 0 0 20px rgba(255,68,68,0.9); }
    }
  `;
  document.head.appendChild(style);
})();

// ── Resume expedition ticker on page load ─────────────────────
(function _resumeOnLoad() {
  function _tryResume() {
    if (!window.saveData || !window.saveData.exploration) return;
    const exp = window.saveData.exploration.activeExpedition;
    if (exp && !exp.completed && !exp.battlePending) {
      _startExploTicker();
    }
  }
  // Wait for saveData to be ready
  if (window.saveData) {
    _tryResume();
  } else {
    window.addEventListener('saveDataReady', _tryResume, { once: true });
    // Fallback: try after 2s
    setTimeout(_tryResume, 2000);
  }
})();

// ── Test hooks for deterministic exploration helpers ──────────
const COMPANION_EXPLORATION_TEST_API = Object.freeze({
  _exploXpToNext,
  _exploDuration,
  _exploBaseCatchRate
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports.__companionExplorationTestApi = COMPANION_EXPLORATION_TEST_API;
}

if (typeof globalThis !== 'undefined') {
  globalThis.__companionExplorationTestApi = COMPANION_EXPLORATION_TEST_API;
}
