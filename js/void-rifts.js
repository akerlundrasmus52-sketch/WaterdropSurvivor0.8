// js/void-rifts.js — Asynchronous Void Rift expeditions for companions
// Exposes window.VoidRifts

(function () {
  var RIFTS = [
    { id: 'rift_scout', name: 'Shallow Rift Scout', duration: 30 * 60 * 1000, danger: 1, artifacts: ['Fractured Sigil'], materials: { min: 2, max: 4 } },
    { id: 'rift_assault', name: 'Abyssal Assault', duration: 45 * 60 * 1000, danger: 2, artifacts: ['Null Core', 'Blackened Lens'], materials: { min: 4, max: 8 } },
    { id: 'rift_siege', name: 'Eternal Siege', duration: 60 * 60 * 1000, danger: 3, artifacts: ['Chrono Anchor', 'Void Keystone'], materials: { min: 7, max: 12 } }
  ];

  var MAX_ACTIVE = 2;

  function _getDefaults() {
    return { active: [], pendingRewards: [], artifacts: [], history: [] };
  }

  function _getCompanions(saveData) {
    var list = [];
    if (saveData && saveData.companions) {
      var keys = Object.keys(saveData.companions);
      for (var i = 0; i < keys.length; i++) {
        var c = saveData.companions[keys[i]];
        if (c && c.unlocked) list.push({ id: keys[i], level: c.level || 1, name: c.name || keys[i] });
      }
    }
    if ((!list.length) && saveData && saveData.expeditions && saveData.expeditions.companions) {
      var expC = saveData.expeditions.companions;
      for (var j = 0; j < expC.length; j++) {
        if (expC[j] && (expC[j].unlocked === undefined || expC[j].unlocked)) {
          list.push({ id: expC[j].id, level: expC[j].level || 1, name: expC[j].name || expC[j].id });
        }
      }
    }
    return list;
  }

  function _findRift(id) {
    for (var i = 0; i < RIFTS.length; i++) {
      if (RIFTS[i].id === id) return RIFTS[i];
    }
    return null;
  }

  function _ensure(saveData) {
    if (!saveData.voidRifts) saveData.voidRifts = _getDefaults();
    if (!saveData.voidRifts.active) saveData.voidRifts.active = [];
    if (!saveData.voidRifts.pendingRewards) saveData.voidRifts.pendingRewards = [];
    if (!saveData.voidRifts.artifacts) saveData.voidRifts.artifacts = [];
    if (!saveData.voidRifts.history) saveData.voidRifts.history = [];
    return saveData.voidRifts;
  }

  function start(companionId, riftId, saveData) {
    var vr = _ensure(saveData);
    var companions = _getCompanions(saveData);
    if (vr.active.length >= MAX_ACTIVE) return { success: false, reason: 'All rift slots are occupied' };
    for (var i = 0; i < vr.active.length; i++) {
      if (vr.active[i].companionId === companionId) return { success: false, reason: 'Companion already inside a rift' };
    }
    var comp = companions.find(function (c) { return c.id === companionId; });
    if (!comp) return { success: false, reason: 'Unknown or locked companion' };
    var rift = _findRift(riftId);
    if (!rift) return { success: false, reason: 'Unknown rift' };

    var now = Date.now();
    vr.active.push({
      companionId: companionId,
      riftId: riftId,
      startTime: now,
      endTime: now + rift.duration
    });
    return { success: true, endTime: now + rift.duration, riftName: rift.name };
  }

  function _rollRewards(rift, companionLevel) {
    var level = companionLevel || 1;
    var artifactChance = 0.5 + (rift.danger * 0.1) + (level * 0.02);
    if (artifactChance > 0.9) artifactChance = 0.9;
    var rewards = { artifacts: [], materials: 0 };

    if (Math.random() < artifactChance && rift.artifacts.length) {
      var pick = rift.artifacts[Math.floor(Math.random() * rift.artifacts.length)];
      rewards.artifacts.push({ name: pick, rarity: 'artifact', source: rift.id });
    }

    var matRange = rift.materials.max - rift.materials.min;
    var matRoll = rift.materials.min + Math.random() * matRange;
    rewards.materials = Math.round(matRoll * (1 + (level - 1) * 0.05));
    return rewards;
  }

  function check(saveData) {
    var vr = _ensure(saveData);
    var companions = _getCompanions(saveData);
    var now = Date.now();
    var remaining = [];
    var completed = [];

    for (var i = 0; i < vr.active.length; i++) {
      var slot = vr.active[i];
      if (now >= slot.endTime) {
        var rift = _findRift(slot.riftId);
        if (!rift) {
          remaining.push(slot);
          continue;
        }
        var companionLevel = 1;
        for (var j = 0; j < companions.length; j++) {
          if (companions[j].id === slot.companionId) {
            companionLevel = companions[j].level || 1;
            break;
          }
        }
        var rew = _rollRewards(rift, companionLevel);
        var rewardEntry = {
          companionId: slot.companionId,
          riftId: slot.riftId,
          riftName: rift.name,
          rewards: rew,
          completedAt: now
        };
        vr.pendingRewards.push(rewardEntry);
        vr.history.push({ id: slot.riftId, completedAt: now });
        completed.push(rewardEntry);
      } else {
        remaining.push(slot);
      }
    }
    vr.active = remaining;
    if (vr.history.length > 50) vr.history = vr.history.slice(vr.history.length - 50);
    return completed;
  }

  function claimPending(saveData) {
    var vr = _ensure(saveData);
    var pending = vr.pendingRewards || [];
    for (var i = 0; i < pending.length; i++) {
      if (pending[i].rewards) {
        var r = pending[i].rewards;
        if (r.materials) {
          saveData.resources = saveData.resources || {};
          saveData.resources.voidEssence = (saveData.resources.voidEssence || 0) + r.materials;
        }
        if (r.artifacts && r.artifacts.length) {
          for (var j = 0; j < r.artifacts.length; j++) {
            vr.artifacts.push(r.artifacts[j]);
          }
        }
      }
    }
    vr.pendingRewards = [];
    return pending;
  }

  window.VoidRifts = {
    RIFTS: RIFTS,
    MAX_ACTIVE: MAX_ACTIVE,
    getDefaults: _getDefaults,
    getAvailableCompanions: _getCompanions,
    start: start,
    check: check,
    claimPending: claimPending
  };
})();
