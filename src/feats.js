// Feats — 판 중 기술 관찰(점수·판정에 영향 없음, 연출·미션용).
//   nearMiss     : 틈을 통과할 때 벽과의 최소 간격이 nearMissMargin 미만
//   riskyRelease : 에너지 riskyEnergy 이상에서 떼고 riskySurviveSeconds 동안 생존
//   doublePassed : 연속 틈 두 띠를 모두 통과 / longPassed : 긴 틈 통과
// Simulation 상태를 읽기만 한다.
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var Collision = isNode ? require('./collision.js') : root.KKUK.Collision;
  var mod = factory(Collision);
  if (isNode) module.exports = mod;
  else { root.KKUK = root.KKUK || {}; root.KKUK.Feats = mod; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Collision) {
  'use strict';

  function createFeatTracker(balance) {
    var cfg = balance.feats;
    var inset = balance.player.collisionInset;
    var minClear = {};     // gateId → 통과 중 최소 간격
    var passedIds = {};
    var risky = [];        // 생존 대기 중인 과감한 반동 { t }
    var stats = { nearMiss: 0, riskyRelease: 0, doublePassed: 0, longPassed: 0 };

    function observe(run, events, dt) {
      var out = [];
      if (!cfg) return out;
      // 1) 통과 중인 벽과의 간격 갱신
      for (var i = 0; i < run.gates.length; i++) {
        var g = run.gates[i];
        if (g.passed || g.broken) continue;
        var dy = Collision.verticalDistance(g, run.distance);
        if (dy > run.radius + 4) continue;
        var clear = Math.hypot(Collision.horizontalDistance(g, run.x), dy) - Math.max(0, run.radius - inset);
        if (minClear[g.id] == null || clear < minClear[g.id]) minClear[g.id] = clear;
      }
      // 2) 이벤트 처리
      for (var j = 0; j < events.length; j++) {
        var e = events[j];
        if (e.type === 'gatePassed') {
          var gate = null;
          for (var k = 0; k < run.gates.length; k++) if (run.gates[k].id === e.gateId) { gate = run.gates[k]; break; }
          passedIds[e.gateId] = true;
          if (gate && !gate.broken && minClear[e.gateId] != null && minClear[e.gateId] < cfg.nearMissMargin) {
            stats.nearMiss++;
            out.push({ type: 'nearMiss', gateId: e.gateId, margin: minClear[e.gateId], count: stats.nearMiss });
          }
          if (gate && gate.kind === 'long') stats.longPassed++;
          if (gate && gate.kind === 'double') {
            var sibling = run.gates.filter(function (o) { return o.kind === 'double' && o.block === gate.block && o.id !== gate.id; })[0];
            if (sibling && passedIds[sibling.id] && sibling.id < gate.id) stats.doublePassed++;
          }
          delete minClear[e.gateId];
        } else if (e.type === 'release' && e.energy >= cfg.riskyEnergy) {
          risky.push({ t: 0 });
        }
      }
      // 3) 과감한 반동 생존 확인
      for (var r = risky.length - 1; r >= 0; r--) {
        risky[r].t += dt;
        if (risky[r].t >= cfg.riskySurviveSeconds) {
          risky.splice(r, 1);
          if (run.alive) { stats.riskyRelease++; out.push({ type: 'riskyRelease', count: stats.riskyRelease }); }
        }
      }
      return out;
    }

    return { observe: observe, stats: stats };
  }

  return { createFeatTracker: createFeatTracker };
});
