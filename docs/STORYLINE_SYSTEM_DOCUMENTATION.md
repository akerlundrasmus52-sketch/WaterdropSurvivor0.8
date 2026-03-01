# Storyline Quest System Documentation

## Overview
The Water Drop Survivor game features a comprehensive storyline quest system that guides players through progressive unlocking of buildings and features. The system is designed to teach players game mechanics while providing meaningful progression goals.

## System Architecture

### Quest Chain Flow
The storyline quest system follows a linear progression path with 9 main quests:

1. **Quest: First Steps** - Complete your first run
2. **Quest: Path to Power** - Unlock Skill Tree building (250 gold)
3. **Quest: Learn New Skills** - Use Skill Tree to unlock a skill
4. **Quest: Forge Your Arsenal** - Unlock Forge building (250 gold)
5. **Quest: Craft Your First Weapon** - Use Forge to craft a weapon
6. **Quest: Recycling Power** - Unlock Trash & Recycle building (300 gold)
7. **Quest: Scrap for Materials** - Use Trash & Recycle to scrap an item
8. **Quest: Gear Up** - Unlock Armory building (250 gold)
9. **Quest: Equip Your Gear** - Use Armory to equip or upgrade gear

## Building System

### Free Buildings (Auto-unlocked on first camp visit)
These buildings are unlocked automatically when the player first visits the camp after dying:

- **📜 Quest/Mission Hall** - Start main story quests
- **📦 Inventory** - Manage collected items
- **🏕️ Camp Hub** - Central navigation

### Paid Buildings (Progressive Unlocks)
These buildings must be purchased with gold earned during runs:

| Building | Cost | Max Level | Description |
|----------|------|-----------|-------------|
| Skill Tree | 250g | 10 | Unlock permanent skills and abilities |
| Forge | 250g | 10 | Craft and upgrade weapons |
| Trash & Recycle | 300g | 10 | Convert unwanted gear into materials |
| Armory | 250g | 10 | Equip and infuse gear with bonuses |
| Companion House | 250g | 10 | Unlock and upgrade companions |
| Training Hall | 250g | 10 | Train attributes (Endurance, Flexibility) |
| Temp Shop | 200g | 10 | Purchase temporary run-only items |

## Quest Progression Logic

### Quest State Management
```javascript
saveData.storyQuests = {
  welcomeShown: false,          // First camp popup shown
  mainBuildingUnlocked: false,  // Main/Quest building unlocked
  currentQuest: null,           // Current active story quest ID
  completedQuests: [],          // Array of completed quest IDs
  questProgress: {},            // Progress tracking for active quests
  buildingFirstUse: {           // Track first-time use of buildings
    skillTree: false,
    forge: false,
    armory: false,
    trashRecycle: false,
    companionHouse: false,
    trainingHall: false,
    tempShop: false
  }
}
```

### Quest Completion Flow

1. **Check Current State**: System checks `completedQuests` array
2. **Advance Chain**: `advanceQuestChain()` determines next quest
3. **Show Popup**: Quest popup displays objective to player
4. **Track Progress**: Player actions trigger `progressQuest()`
5. **Complete Quest**: Add quest ID to `completedQuests[]`
6. **Trigger Next**: Automatically advance to next quest in chain

### Building First-Use Tracking
The system tracks the first time a player uses each building:
- Prevents quest completion before actual interaction
- Ensures players learn building functionality
- Enables "use" quests to trigger properly

## Key Functions

### `advanceQuestChain()`
**Purpose**: Determines and displays the next quest in the chain
**Location**: Lines 7949-8037
**Called**: 
- When camp is first entered
- After completing a quest
- When a building is unlocked

### `progressQuest(questId, completed)`
**Purpose**: Updates quest progress and marks completion
**Location**: Lines 7932-7947
**Parameters**:
- `questId`: String identifier for the quest
- `completed`: Boolean indicating full completion

### `updateQuestTracker()`
**Purpose**: Updates the in-camp quest tracker UI
**Location**: Lines 8040-8069
**Shows**: Current active quest objective in camp screen

### `showQuestPopup(title, message, buttonText, onClose)`
**Purpose**: Displays quest information popup to player
**Location**: Lines 8072+
**Parameters**:
- `title`: Quest title (e.g., "📜 Quest: First Steps")
- `message`: HTML message with quest details
- `buttonText`: Text for confirmation button
- `onClose`: Optional callback after popup closes

### `hasQuestForBuilding(buildingId)`
**Purpose**: Checks if building has an active quest
**Location**: Lines 7912-7930
**Returns**: Boolean - true if building is needed for current quest
**Used**: To show `!` badge on buildings with active quests

## UI Integration

### Quest Tracker (Camp Screen)
- **Location**: Top of camp screen, below gold counter
- **Element**: `#quest-tracker`
- **Display**: Shows current quest objective
- **Hidden**: When no active quest

### Building Badges
Buildings with active quests display a pulsing `!` badge:
- Visual indicator of quest progression
- Helps players navigate quest objectives
- Updated dynamically as quests advance

### Quest Popups
- **Overlay**: Semi-transparent black background
- **Styling**: Gold border, gradient blue/dark background
- **Animation**: Fade in + pop effect
- **Blocking**: Pauses game until acknowledged
- **Purpose**: Clear communication of objectives

## Gold Economy & Progression Pacing

### Initial Runs
- **Run 1**: Players typically die early, earning 50-150 gold
  - Not enough for first building (250g)
  - Encourages learning gameplay mechanics
- **Run 2**: With knowledge, earn 250-400 gold
  - Can unlock first building (Skill Tree)
  - Begins progression loop

### Building Costs
Designed to create natural progression gates:
- **Early buildings**: 250g (Skill Tree, Forge, Armory)
- **Mid-tier**: 300g (Trash & Recycle)
- **Budget option**: 200g (Temp Shop)

### Upgrade Costs
Buildings can be upgraded to level 10:
- Costs scale progressively
- Provide stat bonuses at higher levels
- Long-term progression goal

## Building Functionality

### Skill Tree
- **Purpose**: Unlock permanent skills
- **Skills**: Combat Mastery, Survivalist, Wealth Hunter, Quick Learner, Fortification
- **Max Level**: 5 per skill
- **Cost**: Skill points (earned from runs)

### Forge
- **Purpose**: Craft and upgrade weapons
- **Features**: 
  - Craft new weapons from materials
  - Upgrade existing weapons
  - Rarity system (Common → Legendary)

### Armory
- **Purpose**: Equipment management
- **Features**:
  - 6 equipment slots (Weapon, Armor, Helmet, Boots, Ring, Amulet)
  - Gear infusion system
  - Stat previews
  - Comparison tooltips

### Trash & Recycle
- **Purpose**: Convert gear into materials
- **Features**:
  - Scrap unwanted gear
  - Receive materials based on rarity
  - Clean up inventory
  - Prepare for crafting

### Companion House
- **Purpose**: Unlock and upgrade companions
- **Companions**: Storm Wolf, Sky Falcon, Water Spirit
- **Features**: Level companions, unlock abilities

### Training Hall
- **Purpose**: Train permanent attributes
- **Attributes**: Endurance, Flexibility
- **Cost**: Training points (earned over time)

### Temp Shop
- **Purpose**: Purchase single-run consumables
- **Items**: Temporary power-ups for current run only
- **Cost**: Gold

## Performance Considerations

### Quest System Impact
- **Memory**: Minimal - uses simple save data structure
- **CPU**: Negligible - checks only on specific events
- **Rendering**: Quest tracker + badges add < 1% overhead

### Design Philosophy
- **Non-blocking**: Quest checks don't interrupt gameplay
- **Event-driven**: Triggers only on player actions
- **Efficient**: Uses cached state, minimal recalculation

## Testing Checklist

- [ ] Quest chain advances correctly
- [ ] Building unlocks work as expected
- [ ] First-use tracking prevents early completion
- [ ] Quest tracker updates properly
- [ ] Building badges appear/disappear correctly
- [ ] Gold costs are balanced
- [ ] Popups display with correct information
- [ ] Save/load preserves quest state
- [ ] Reset clears all quest progress

## Future Enhancements

Potential additions to the quest system:
- **Side Quests**: Optional challenges with rewards
- **Daily Quests**: Time-limited objectives
- **Achievement Integration**: Quests tied to achievements
- **Branching Paths**: Player choice in quest order
- **Legendary Chains**: High-level quest sequences

## Technical Notes

### Save Data Versioning
The system uses save data merging to maintain compatibility:
```javascript
saveData.storyQuests = { 
  ...defaultSaveData.storyQuests, 
  ...(saveData.storyQuests || {}) 
};
```

### Backward Compatibility
- Existing saves without quest data initialize to defaults
- Missing fields are gracefully handled
- No data loss during updates

### Error Handling
- Try-catch blocks on localStorage operations
- Null checks on UI elements
- Fallback values for missing data

## Summary

The storyline quest system provides:
1. **Guided Progression**: Natural learning curve for new players
2. **Clear Goals**: Always know what to work toward
3. **Building Unlocks**: Progressive access to features
4. **Economy Balance**: Gold requirements pace progression
5. **Player Engagement**: Meaningful objectives maintain interest

The system integrates seamlessly with the camp/building system, creating a cohesive roguelite progression experience where each run contributes to long-term advancement.
