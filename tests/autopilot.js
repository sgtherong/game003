// 자동 조작(테스트 전용). 터치 제약: 좌우 이동은 압축 중에만 한다.
// 관측값만 보고 {held, targetX}를 결정한다. 사람의 난이도·재미를 대변하지 않는다.
'use strict';

function createAutopilot(balance, params) {
  const P = Object.assign({ compressLead: 0.18, moveSlack: 0.02, clearBase: 10, clearPerEnergy: 12, leadExtra: 12 }, params || {});
  const pointerSpeed = balance.player.pointerSpeed;

  // obs: { distance, x, energy, held, speed, gates:[{z,h,cx,block}] }
  return function decide(obs) {
    let want = false, target = null;
    const clear = P.clearBase + P.clearPerEnergy * obs.energy;
    for (const g of obs.gates) {
      const top = g.z + g.h / 2, bottom = g.z - g.h / 2;
      if (obs.distance > top + clear) continue;
      const moveTime = Math.abs(obs.x - g.cx) / pointerSpeed;
      let lead = Math.max(P.compressLead, moveTime + P.moveSlack) * obs.speed + P.leadExtra;
      // 벽 바로 아래에서 접근하면(틈 밖) 기본 반지름 거리에서 이미 닿으므로 그만큼 일찍 누른다
      const reach = balance.player.baseRadius - balance.player.collisionInset;
      if (Math.abs(obs.x - g.cx) > g.gap / 2 - reach) lead = Math.max(lead, reach + (P.compressLead + moveTime) * obs.speed);
      if (obs.distance >= bottom - lead) { want = true; if (target === null) target = g.cx; }
    }
    // 에너지 경고: 벽 사이(틈 안이 아님)라면 손을 떼 과압축을 피한다(사람이 경고를 보고 하는 행동)
    if (want && obs.energy >= 0.88) {
      const reach = balance.player.baseRadius;
      const inside = obs.gates.some(g => obs.distance > g.z - g.h / 2 - reach && obs.distance < g.z + g.h / 2 + 4);
      if (!inside) want = false;
    }
    return { held: want, targetX: want ? target : null };
  };
}

// 결정 → 입력 전이(ops). 손을 떼면 잔여 이동 제거(snap).
function decisionToOps(decision, wasHeld, lastTarget) {
  const ops = [];
  if (decision.held && !wasHeld) ops.push({ type: 'hold', value: true });
  if (decision.held && decision.targetX !== null && decision.targetX !== lastTarget) ops.push({ type: 'target', x: decision.targetX });
  if (!decision.held && wasHeld) { ops.push({ type: 'snap' }); ops.push({ type: 'hold', value: false }); }
  return ops;
}

module.exports = { createAutopilot, decisionToOps };
