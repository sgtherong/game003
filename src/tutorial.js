// Tutorial — 첫 실행 단계별 연습(명세서 12장). DOM·엔진 의존 없음.
// 물리(스프링·에너지·충돌)는 R1과 같다. 다른 점: 상승 속도가 느리고, 코스를 이 모듈이 배치하며, 기록하지 않는다.
//   1 press  : 장애물 없이 누르기·떼기
//   2 drag   : 좌우 드래그로 넓은 목표 영역 맞추기
//   3 gate   : 넓은 중앙 틈 하나 통과
//   4 energy : 에너지가 쌓이고, 몸을 펼쳐 해소되는 것 확인
//   5 done   : 실제 도전으로 전환
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var Simulation = isNode ? require('./simulation.js') : root.KKUK.Simulation;
  var mod = factory(Simulation);
  if (isNode) module.exports = mod;
  else { root.KKUK = root.KKUK || {}; root.KKUK.Tutorial = mod; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Simulation) {
  'use strict';

  var STEPS = ['press', 'drag', 'gate', 'energy', 'done'];

  // R1 설정에서 상승 속도만 바꾼 연습용 설정
  function practiceBalance(balance) {
    var b = JSON.parse(JSON.stringify(balance));
    b.ascent.baseSpeed = balance.tutorial.ascentSpeed;
    b.ascent.maxIncrease = 0;
    b.ascent.maxSpeed = balance.tutorial.ascentSpeed;
    b.profile = balance.profile + '-tutorial';
    return b;
  }

  function createTutorial(balance) {
    var cfg = balance.tutorial;
    var t = {
      stepIndex: 0,
      step: STEPS[0],
      releases: 0,
      zoneIndex: 0,
      zoneTime: 0,
      gateId: null,
      energyPeaked: false,
      retries: 0,
      done: false
    };

    function enter(run, index) {
      t.stepIndex = index;
      t.step = STEPS[index];
      t.zoneIndex = 0; t.zoneTime = 0; t.energyPeaked = false; t.releases = 0;
      if (t.step === 'gate') placeGate(run);
      if (t.step === 'done') t.done = true;
    }

    function placeGate(run) {
      var id = run.generator.nextGateId++;
      run.gates.push({ id: id, z: run.distance + cfg.gateAhead, h: cfg.gateHeight, gap: cfg.gateGap, kind: 'short', cx: 180, block: -1, passed: false, practice: true });
      t.gateId = id;
    }

    // 현재 단계의 목표 영역(drag 단계에서만)
    t.zone = function () {
      if (t.step !== 'drag') return null;
      return { x: cfg.zones[t.zoneIndex], halfWidth: cfg.zoneHalfWidth, progress: Math.min(1, t.zoneTime / cfg.zoneHoldSeconds) };
    };
    t.progress = function () { return { index: Math.min(t.stepIndex, 4), total: 4 }; };

    // 매 틱 호출. 반환: [{ type: 'tutorialStep' | 'tutorialRetry' | 'tutorialDone', ... }]
    t.update = function (run, events, dt) {
      var out = [];
      var prev = t.stepIndex;
      for (var i = 0; i < events.length; i++) {
        var e = events[i];
        if (e.type === 'death') {
          Simulation.reviveForPractice(run, balance);
          t.retries++;
          out.push({ type: 'tutorialRetry', step: t.step, reason: e.reason, x: e.x });
          enter(run, t.stepIndex); // 같은 단계를 다시 배치
          return out;
        }
        if (e.type === 'release' && t.step === 'press') t.releases++;
        if (e.type === 'gatePassed' && t.step === 'gate' && e.gateId === t.gateId) enter(run, t.stepIndex + 1);
      }

      if (t.step === 'press' && t.releases >= cfg.pressReleases) enter(run, t.stepIndex + 1);
      else if (t.step === 'drag') {
        var z = cfg.zones[t.zoneIndex];
        if (Math.abs(run.x - z) <= cfg.zoneHalfWidth) t.zoneTime += dt; else t.zoneTime = 0;
        if (t.zoneTime >= cfg.zoneHoldSeconds) {
          t.zoneIndex++; t.zoneTime = 0;
          out.push({ type: 'tutorialZone', index: t.zoneIndex });
          if (t.zoneIndex >= cfg.zones.length) enter(run, t.stepIndex + 1);
        }
      } else if (t.step === 'energy') {
        if (run.logicalHeld && run.energy >= cfg.energyGoal) t.energyPeaked = true;
        if (t.energyPeaked && !run.logicalHeld && run.energy <= cfg.energyCalm) enter(run, t.stepIndex + 1);
      }

      if (t.stepIndex !== prev) out.push({ type: t.done ? 'tutorialDone' : 'tutorialStep', step: t.step, index: t.stepIndex });
      return out;
    };

    return t;
  }

  return { STEPS: STEPS, createTutorial: createTutorial, practiceBalance: practiceBalance };
});
