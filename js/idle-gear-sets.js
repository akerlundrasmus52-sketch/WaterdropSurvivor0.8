// Exposes window.GameGearSets for use by main.js
// Equipment set bonus system

var GEAR_SETS = [
  {
    id: 'warrior',
    name: 'Warrior Set',
    color: '#E74C3C',
    pieces: ['warrior_helm', 'warrior_chest', 'warrior_gloves', 'warrior_boots', 'warrior_belt', 'warrior_shoulders'],
    bonuses: [
      { pieces: 2, description: '+10% damage',      type: 'damage',     value: 0.10 },
      { pieces: 4, description: '+20% max HP',       type: 'maxHp',      value: 0.20 },
      { pieces: 6, description: '+30% crit damage',  type: 'critDamage', value: 0.30 }
    ]
  },
  {
    id: 'shadow',
    name: 'Shadow Set',
    color: '#8E44AD',
    pieces: ['shadow_helm', 'shadow_chest', 'shadow_gloves', 'shadow_boots', 'shadow_belt', 'shadow_shoulders'],
    bonuses: [
      { pieces: 2, description: '+15% speed',        type: 'speed',      value: 0.15 },
      { pieces: 4, description: '+25% crit chance',  type: 'critChance', value: 0.25 },
      { pieces: 6, description: 'Double dash',       type: 'doubleDash', value: 1 }
    ]
  },
  {
    id: 'guardian',
    name: 'Guardian Set',
    color: '#2ECC71',
    pieces: ['guardian_helm', 'guardian_chest', 'guardian_gloves', 'guardian_boots', 'guardian_belt', 'guardian_shoulders'],
    bonuses: [
      { pieces: 2, description: '+20% armor',        type: 'armor',      value: 0.20 },
      { pieces: 4, description: '+15% HP regen',     type: 'hpRegen',    value: 0.15 },
      { pieces: 6, description: 'Thorns 10%',        type: 'thorns',     value: 0.10 }
    ]
  },
  {
    id: 'fortune',
    name: 'Fortune Set',
    color: '#FFD700',
    pieces: ['fortune_helm', 'fortune_chest', 'fortune_gloves', 'fortune_boots', 'fortune_belt', 'fortune_shoulders'],
    bonuses: [
      { pieces: 2, description: '+20% gold',              type: 'gold',               value: 0.20 },
      { pieces: 4, description: '+30% essence',           type: 'essence',            value: 0.30 },
      { pieces: 6, description: '+50% expedition rewards', type: 'expeditionRewards', value: 0.50 }
    ]
  }
];

function getGearSetsDefaults() {
  return {
    equippedGear: []
  };
}

function checkSetBonuses(equippedGear) {
  var gear = equippedGear || [];
  var active = [];

  for (var s = 0; s < GEAR_SETS.length; s++) {
    var set = GEAR_SETS[s];
    var count = 0;
    for (var p = 0; p < set.pieces.length; p++) {
      if (gear.indexOf(set.pieces[p]) !== -1) count++;
    }
    if (count >= 2) {
      for (var b = 0; b < set.bonuses.length; b++) {
        if (count >= set.bonuses[b].pieces) {
          active.push({
            setId: set.id,
            setName: set.name,
            color: set.color,
            piecesEquipped: count,
            bonus: set.bonuses[b]
          });
        }
      }
    }
  }

  return active;
}

function getSetBonusMultipliers(equippedGear) {
  var active = checkSetBonuses(equippedGear);
  var mults = {};

  for (var i = 0; i < active.length; i++) {
    var b = active[i].bonus;
    mults[b.type] = (mults[b.type] || 0) + b.value;
  }

  return mults;
}

function renderGearSetsPanel(saveData, container) {
  if (!container) return;
  container.innerHTML = '';

  var gearData = saveData.gearSets || getGearSetsDefaults();
  var equipped = gearData.equippedGear || [];
  var active = checkSetBonuses(equipped);

  var title = document.createElement('h3');
  title.className = 'idle-section-title';
  title.textContent = '⚔️ Gear Sets';
  container.appendChild(title);

  for (var s = 0; s < GEAR_SETS.length; s++) {
    var set = GEAR_SETS[s];
    var count = 0;
    for (var p = 0; p < set.pieces.length; p++) {
      if (equipped.indexOf(set.pieces[p]) !== -1) count++;
    }

    var card = document.createElement('div');
    card.className = 'idle-card';

    var cardTitle = document.createElement('h4');
    cardTitle.className = 'idle-card-title';
    cardTitle.style.color = set.color;
    cardTitle.textContent = set.name + ' (' + count + '/' + set.pieces.length + ')';
    card.appendChild(cardTitle);

    for (var b = 0; b < set.bonuses.length; b++) {
      var bDef = set.bonuses[b];
      var bRow = document.createElement('p');
      var isActive = count >= bDef.pieces;
      bRow.style.color = isActive ? set.color : '#888';
      bRow.style.margin = '2px 0';
      bRow.textContent = (isActive ? '✓ ' : '○ ') + bDef.pieces + 'pc: ' + bDef.description;
      card.appendChild(bRow);
    }

    container.appendChild(card);
  }

  if (active.length === 0) {
    var none = document.createElement('p');
    none.className = 'idle-muted';
    none.textContent = 'No active set bonuses. Equip matching gear pieces to activate bonuses.';
    container.appendChild(none);
  }
}

window.GameGearSets = {
  GEAR_SETS: GEAR_SETS,
  getGearSetsDefaults: getGearSetsDefaults,
  checkSetBonuses: checkSetBonuses,
  getSetBonusMultipliers: getSetBonusMultipliers,
  renderGearSetsPanel: renderGearSetsPanel
};
