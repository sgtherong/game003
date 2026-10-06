// Missions — 항상 3개의 미션이 활성. 판이 끝날 때 진행도를 반영하고, 달성하면 별을 주고 다음 미션으로 교체한다.
// 같은 미션을 다시 받으면 단계(tier)가 올라 목표가 커진다. 순수 함수(저장은 호출한 쪽에서).
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.KKUK = root.KKUK || {}; root.KKUK.Missions = mod; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function emptyState() { return { active: [], done: 0, tiers: {} }; }

  function def(cfg, id) { for (var i = 0; i < cfg.pool.length; i++) if (cfg.pool[i].id === id) return cfg.pool[i]; return null; }
  function tierOf(state, d) { return Math.min(d.goals.length - 1, state.tiers[d.id] || 0); }

  // 활성 미션을 activeCount개로 채운다(결정적 순서: 완료 횟수 기반 순환)
  function ensureActive(state, cfg) {
    var guard = 0;
    while (state.active.length < cfg.activeCount && guard++ < cfg.pool.length * 2) {
      var d = cfg.pool[(state.done * 3 + state.active.length * 5 + guard) % cfg.pool.length];
      if (state.active.some(function (a) { return a.id === d.id; })) continue;
      state.active.push({ id: d.id, progress: 0 });
    }
    return state;
  }

  // 화면 표시용 목록
  function describe(state, cfg) {
    return state.active.map(function (a) {
      var d = def(cfg, a.id), t = tierOf(state, d);
      return { id: a.id, tier: t, goal: d.goals[t], reward: d.rewards[t], progress: Math.min(a.progress, d.goals[t]) };
    });
  }

  // stats: { height, passed, nearMiss, doublePassed, longPassed, riskyRelease, growthLevel, runs }
  // 반환: 이번 판에 달성한 미션 목록 [{ id, tier, goal, reward }]
  function applyRun(state, cfg, stats) {
    var completed = [];
    for (var i = 0; i < state.active.length; i++) {
      var a = state.active[i], d = def(cfg, a.id);
      if (!d) continue;
      var v = stats[d.stat] || 0, t = tierOf(state, d);
      a.progress = d.kind === 'max' ? Math.max(a.progress, v) : a.progress + v;
      if (a.progress >= d.goals[t]) completed.push({ id: d.id, tier: t, goal: d.goals[t], reward: d.rewards[t], index: i });
    }
    // 달성한 미션 제거(뒤에서부터) → 단계 상승 → 새 미션 채우기
    completed.slice().sort(function (x, y) { return y.index - x.index; }).forEach(function (c) {
      state.active.splice(c.index, 1);
      state.tiers[c.id] = (state.tiers[c.id] || 0) + 1;
      state.done++;
    });
    ensureActive(state, cfg);
    return completed.map(function (c) { return { id: c.id, tier: c.tier, goal: c.goal, reward: c.reward }; });
  }

  return { emptyState: emptyState, ensureActive: ensureActive, describe: describe, applyRun: applyRun };
});
