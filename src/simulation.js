// Simulation — 순수 게임 규칙. DOM·GDevelop·광고 API에 의존하지 않는다.
// 규칙 버전
//   r0: 기준 시제품(reference/kkuk-steering.fragment.html)과 같은 계산.
//   r1: 출시 규칙. FIX-04(안전 이탈 통과 확정)를 적용. 그 외 r0와 같은 수식.
//   성장 모드 훅(r1에서만): shields(벽 충돌 1회 무효), invulnerable(무적 시간), gate.broken(부서진 벽),
//   ascent.speedMultiplier / focusThreshold·focusMultiplier. 기본 R1 설정에는 없으므로 도전 모드는 그대로다.
//
// 성능을 위해 step()은 state를 제자리에서 갱신하고 도메인 이벤트 배열을 돌려준다.
// state는 Simulation만 수정한다. 화면/엔진 쪽은 읽기만 한다.
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var Collision = isNode ? require('./collision.js') : root.KKUK.Collision;
  var Generator = isNode ? require('./generator.js') : root.KKUK.Generator;
  var mod = factory(Collision, Generator);
  if (isNode) module.exports = mod;
  else { root.KKUK = root.KKUK || {}; root.KKUK.Simulation = mod; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Collision, Generator) {
  'use strict';

  var RULES_R0 = 'r0';
  var RULES_R1 = 'r1';

  // 실패 문구 분류용 R0 휴리스틱(판정 자체에는 쓰지 않음)
  var R0_MISALIGN_MARGIN = 8;
  var R0_EARLY_EXPAND_VELOCITY = 8;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function createRun(opts) {
    var balance = opts.balance;
    var p = balance.player;
    var state = {
      runId: opts.runId || 'run-' + Date.now().toString(36),
      rulesVersion: opts.rulesVersion || RULES_R0,
      balanceProfile: balance.profile,
      balanceVersion: balance.balanceVersion || balance.profile,
      generatorVersion: balance.generator.version || 'r0',
      inputMode: opts.inputMode || 'touch',
      runSeed: opts.seed == null ? balance.generator.seed : opts.seed,
      tick: 0,
      time: 0,
      distance: 0,
      x: p.startX,
      targetX: p.startX,
      radius: p.baseRadius,
      radialVelocity: 0,
      energy: 0,
      logicalHeld: false,
      passedCount: 0,
      gates: [],
      generator: null,
      generateAhead: opts.withGates !== false, // false: 코스를 외부(튜토리얼)가 배치
      shields: 0,
      invulnerable: 0,
      alive: true,
      deathReason: null,
      deathGateId: null
    };
    state.generator = Generator.createGeneratorState(balance.generator, state.runSeed);
    if (opts.withGates !== false) Generator.fillAhead(state.generator, state.gates, state.distance, balance.generator);
    return state;
  }

  function currentSpeed(state, balance) {
    var a = balance.ascent;
    var speed = a.baseSpeed + Math.min(a.maxIncrease, state.passedCount * a.increasePerPassedGate);
    if (a.speedMultiplier) speed *= a.speedMultiplier;
    if (a.focusThreshold != null && state.energy > a.focusThreshold) speed *= a.focusMultiplier;
    return speed;
  }

  function releaseImpulse(energy, balance) {
    return balance.spring.releaseImpulseBase + balance.spring.releaseImpulsePerEnergy * energy;
  }

  // 1) 예약된 입력 전이를 순서대로 적용. held true→false 마다 반동 정확히 1회.
  function applyOps(state, ops, balance, events) {
    var p = balance.player;
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.type === 'hold') {
        if (state.logicalHeld && !op.value) {
          var impulse = releaseImpulse(state.energy, balance);
          state.radialVelocity += impulse;
          events.push({ type: 'release', energy: state.energy, impulse: impulse });
        } else if (!state.logicalHeld && op.value) {
          events.push({ type: 'press', energy: state.energy });
        }
        state.logicalHeld = !!op.value;
      } else if (op.type === 'target') {
        state.targetX = clamp(op.x, p.minX, p.maxX);
      } else if (op.type === 'snap') {
        state.targetX = state.x;
      }
    }
  }

  // 반지름 스프링 한 틱. 장애물 없이도 쓸 수 있도록 분리한다.
  function stepBody(body, held, dt, balance) {
    var s = balance.spring, p = balance.player, e = balance.energy;
    if (held) body.energy = Math.min(e.storageCap, body.energy + dt * e.chargePerSecond);
    else if (body.radius >= p.baseRadius * e.recoverRadiusRatio) body.energy = Math.max(0, body.energy - dt * e.recoverPerSecond);

    var target = held ? s.heldTarget : s.releasedTarget;
    var k = held ? s.heldStiffness : s.releasedStiffness;
    var c = held ? s.heldDamping : s.releasedDamping;
    body.radialVelocity += (k * (target - body.radius) - c * body.radialVelocity) * dt;
    body.radius += body.radialVelocity * dt;
    if (body.radius < p.minRadius) { body.radius = p.minRadius; body.radialVelocity = Math.max(0, body.radialVelocity); }
    if (body.radius > p.maxRadius) { body.radius = p.maxRadius; body.radialVelocity = Math.min(0, body.radialVelocity); }
  }

  function markPassed(state, gate, events) {
    gate.passed = true;
    state.passedCount++;
    events.push({ type: 'gatePassed', gateId: gate.id, count: state.passedCount });
  }

  // 성장 모드: 벽을 부순다(보호막·반동 폭발). 아직 통과 전이면 통과로 센다.
  function breakGate(state, gate, events, cause) {
    if (gate.broken) return;
    gate.broken = true;
    events.push({ type: 'gateBroken', gateId: gate.id, cause: cause, x: gate.cx, z: gate.z });
    if (!gate.passed) markPassed(state, gate, events);
  }

  function classifyDeath(state, gate) {
    if (Math.abs(state.x - gate.cx) > gate.gap / 2 - R0_MISALIGN_MARGIN) return 'misaligned';
    if (state.radialVelocity > R0_EARLY_EXPAND_VELOCITY && !state.logicalHeld) return 'expanded_too_early';
    return 'insufficient_compression';
  }

  function kill(state, reason, gate, events) {
    state.alive = false;
    state.deathReason = reason;
    state.deathGateId = gate ? gate.id : null;
    state.logicalHeld = false;
    events.push({ type: 'death', reason: reason, gateId: state.deathGateId, x: state.x, distance: state.distance, radius: state.radius, energy: state.energy });
  }

  // input: { ops: [...], axis: -1|0|1 }
  function step(state, input, dt, balance) {
    var events = [];
    if (!state.alive) return events;
    var p = balance.player;

    applyOps(state, input.ops || [], balance, events);                       // 1
    state.tick++;
    state.time += dt;
    state.distance += currentSpeed(state, balance) * dt;                      // 2

    var axis = input.axis || 0;                                               // 3
    if (axis) {
      state.x = clamp(state.x + axis * p.keyboardSpeed * dt, p.minX, p.maxX);
      state.targetX = state.x;
    } else {
      var delta = state.targetX - state.x;
      state.x = clamp(state.x + Math.sign(delta) * Math.min(Math.abs(delta), p.pointerSpeed * dt), p.minX, p.maxX);
    }

    stepBody(state, state.logicalHeld, dt, balance);                          // 4, 5

    if (state.energy >= balance.energy.failAt) {                              // 6
      kill(state, 'overpressure', null, events);
      return events;
    }

    var probe = { x: state.x, r: state.radius, distance: state.distance };   // 7
    var i, gate;
    if (state.rulesVersion === RULES_R0) {
      // R0: 장애물마다 충돌 → 현재 반지름 기준 통과를 번갈아 판정
      for (i = 0; i < state.gates.length; i++) {
        gate = state.gates[i];
        if (Collision.checkCollision(probe, gate, p.collisionInset)) { kill(state, classifyDeath(state, gate), gate, events); return events; }
        if (!gate.passed && state.distance > gate.z + gate.h / 2 + state.radius) markPassed(state, gate, events);
      }
    } else {
      // R1 (FIX-04): 전체 충돌을 먼저 검사하고, 살아 있을 때만 통과를 확정.
      // 최대 반지름으로 되팽창해도 닿을 수 없는 거리(passClearance)를 지나야 1회 확정.
      if (state.invulnerable > 0) state.invulnerable = Math.max(0, state.invulnerable - dt);
      for (i = 0; i < state.gates.length && state.invulnerable <= 0; i++) {
        gate = state.gates[i];
        if (gate.broken || !Collision.checkCollision(probe, gate, p.collisionInset)) continue;
        if (state.shields > 0) { // 성장 모드: 보호막이 충돌 1회를 대신 받고 벽을 부순다
          state.shields--;
          breakGate(state, gate, events, 'shield');
          state.invulnerable = (balance.growth && balance.growth.shieldInvulnerableSeconds) || 0;
          continue;
        }
        kill(state, classifyDeath(state, gate), gate, events); return events;
      }
      var clearance = balance.rules.passClearance;
      for (i = 0; i < state.gates.length; i++) {
        gate = state.gates[i];
        if (!gate.passed && state.distance > gate.z + gate.h / 2 + clearance) markPassed(state, gate, events);
      }
    }

    var gen = balance.generator;                                               // 8
    var cut = state.distance - gen.cleanupBehind;
    state.gates = state.gates.filter(function (g) { return g.z > cut && !g.broken; });
    if (state.generateAhead) Generator.fillAhead(state.generator, state.gates, state.distance, gen);
    return events;
  }

  // R0 일시정지/사망 시 동작: 논리 압축을 반동 없이 해제하고 잔여 이동을 없앤다.
  // FIX-02에서 R1 규칙으로 교체할 대상이다.
  function r0ClearHold(state) {
    state.logicalHeld = false;
    state.targetX = state.x;
  }

  // 튜토리얼 전용: 실패 지점에서 몸 상태만 초기화해 같은 단계를 다시 시도한다(기록 대상 아님).
  function reviveForPractice(state, balance) {
    var p = balance.player;
    state.alive = true;
    state.deathReason = null;
    state.deathGateId = null;
    state.logicalHeld = false;
    state.radius = p.baseRadius;
    state.radialVelocity = 0;
    state.energy = 0;
    state.x = p.startX;
    state.targetX = p.startX;
    state.gates = [];
  }

  function heightMeters(state, balance) {
    return Math.floor(state.distance / balance.world.unitsPerMeter);
  }

  return {
    RULES_R0: RULES_R0,
    RULES_R1: RULES_R1,
    createRun: createRun,
    step: step,
    stepBody: stepBody,
    currentSpeed: currentSpeed,
    releaseImpulse: releaseImpulse,
    r0ClearHold: r0ClearHold,
    reviveForPractice: reviveForPractice,
    breakGate: breakGate,
    heightMeters: heightMeters
  };
});
