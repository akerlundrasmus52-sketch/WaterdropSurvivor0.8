// idle-statistics.js — Lifetime statistics tracker
window.GameStatistics = (function () {
  var STAT_DEFS = [
    { key: 'totalKills',                  name: 'Total Kills',                  icon: '⚔️' },
    { key: 'totalDeaths',                 name: 'Total Deaths',                 icon: '💀' },
    { key: 'totalGoldEarned',             name: 'Total Gold Earned',            icon: '💰' },
    { key: 'totalGoldSpent',              name: 'Total Gold Spent',             icon: '🛒' },
    { key: 'totalGemsFound',              name: 'Total Gems Found',             icon: '💎' },
    { key: 'totalGemsFused',              name: 'Total Gems Fused',             icon: '🔮' },
    { key: 'totalGemsMelted',             name: 'Total Gems Melted',            icon: '🌫️' },
    { key: 'totalGemDustEarned',          name: 'Total Gem Dust Earned',        icon: '✨' },
    { key: 'totalItemsCrafted',           name: 'Total Items Crafted',          icon: '🔨' },
    { key: 'totalItemsMelted',            name: 'Total Items Melted',           icon: '🔥' },
    { key: 'totalItemsBought',            name: 'Total Items Bought',           icon: '🏪' },
    { key: 'totalExpeditionsCompleted',   name: 'Expeditions Completed',        icon: '🗺️' },
    { key: 'totalExpeditionsFailed',      name: 'Expeditions Failed',           icon: '❌' },
    { key: 'highestLevelReached',         name: 'Highest Level Reached',        icon: '📈' },
    { key: 'totalAscensions',             name: 'Total Ascensions',             icon: '🌟' },
    { key: 'totalPrestigePoints',         name: 'Total Prestige Points',        icon: '🏆' },
    { key: 'totalClicksMade',             name: 'Total Clicks Made',            icon: '🖱️' },
    { key: 'totalEssenceEarned',          name: 'Total Essence Earned',         icon: '💜' },
    { key: 'totalPlaytimeSeconds',        name: 'Total Playtime',               icon: '⏱️', format: 'time' },
    { key: 'longestSurvivalSeconds',      name: 'Longest Survival',             icon: '🛡️', format: 'time' },
    { key: 'longestRunSeconds',           name: 'Longest Run',                  icon: '🏃', format: 'time' },
    { key: 'totalDailyQuestsCompleted',   name: 'Daily Quests Completed',       icon: '📋' },
    { key: 'totalDailyLoginsCollected',   name: 'Daily Logins Collected',       icon: '📅' },
    { key: 'totalWheelSpins',             name: 'Total Wheel Spins',            icon: '🎡' },
    { key: 'bestWheelPrize',              name: 'Best Wheel Prize',             icon: '🎁' },
    { key: 'totalAccountXPEarned',        name: 'Total Account XP Earned',      icon: '⭐' }
  ];

  function getStatisticsDefaults() {
    var obj = {};
    STAT_DEFS.forEach(function (s) { obj[s.key] = 0; });
    return obj;
  }

  function incrementStat(statName, amount, saveData) {
    if (!saveData.statistics) saveData.statistics = getStatisticsDefaults();
    var val = (saveData.statistics[statName] || 0) + (amount || 1);
    saveData.statistics[statName] = val;
  }

  function getStatistic(statName, saveData) {
    if (!saveData.statistics) return 0;
    return saveData.statistics[statName] || 0;
  }

  function getFormattedPlaytime(seconds) {
    seconds = Math.floor(seconds || 0);
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm ' + (seconds % 60) + 's';
  }

  function getAllStats(saveData) {
    if (!saveData.statistics) saveData.statistics = getStatisticsDefaults();
    return STAT_DEFS.map(function (s) {
      var val = saveData.statistics[s.key] || 0;
      var display = s.format === 'time' ? getFormattedPlaytime(val) : val.toLocaleString();
      return { name: s.name, value: display, icon: s.icon, key: s.key };
    });
  }

  function renderStatisticsPanel(saveData, container) {
    if (!saveData.statistics) saveData.statistics = getStatisticsDefaults();
    var stats = getAllStats(saveData);
    var html = '<div class="stats-panel"><h3>📊 Lifetime Statistics</h3><div class="stats-grid">';
    stats.forEach(function (s) {
      html += '<div class="stat-card"><span class="stat-icon">' + s.icon + '</span>';
      html += '<div class="stat-info"><div class="stat-name">' + s.name + '</div>';
      html += '<div class="stat-value">' + s.value + '</div></div></div>';
    });
    html += '</div></div>';
    container.innerHTML = html;
  }

  return {
    getStatisticsDefaults: getStatisticsDefaults,
    incrementStat: incrementStat,
    getStatistic: getStatistic,
    getFormattedPlaytime: getFormattedPlaytime,
    getAllStats: getAllStats,
    renderStatisticsPanel: renderStatisticsPanel
  };
})();
