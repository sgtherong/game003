// Node 검증 실행기. 의존성 없음:  node tests/run-tests.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const balance = require('../src/balance-r0.js');
const Simulation = require('../src/simulation.js');
const Collision = require('../src/collision.js');
const Generator = require('../src/generator.js');
const InputAdapter = require('../src/input-adapter.js');
const GameController = require('../src/game-controller.js');
const { loadReference, referenceSha, REF_SHA } = require('./reference-harness.js');
const { createAutopilot, decisionToOps } = require('./autopilot.js');

const DT = balance.world.fixedStepSeconds;
const TOL_POS = 0.05, TOL_ENERGY = 0.001;
const results = [];
function test(name, fn) {
  try { const note = fn(); results.push({ name, ok: true, note }); }
  catch (e) { results.push({ name, ok: false, note: e.message }); }
}

// ── 기준 시제품과 락스텝 실행 ────────────────────────────────
function applyOpsToReference(ref, ops, axis) {
  for (const op of ops) {
    if (op.type === 'hold') ref.setHeld(op.value);
    else if (op.type === 'target') ref.setTarget(ref.clampX(op.x));
    else if (op.type === 'snap') ref.snap();
  }
  ref.moveKeys.clear();
  if (axis > 0) ref.moveKeys.add('ArrowRight');
  if (axis < 0) ref.moveKeys.add('ArrowLeft');
}

function compareStates(ref, run, tick) {
  const g = ref.g;
  const pairs = [['dist', 'distance', TOL_POS], ['x', 'x', TOL_POS], ['targetX', 'targetX', TOL_POS], ['r', 'radius', TOL_POS], ['v', 'radialVelocity', TOL_POS], ['p', 'energy', TOL_ENERGY]];
  let maxErr = 0;
  for (const [a, b, tol] of pairs) {
    const err = Math.abs(g[a] - run[b]);
    maxErr = Math.max(maxErr, err);
    if (!(err <= tol)) throw new Error(`tick ${tick}: ${b} 불일치 ref=${g[a]} mine=${run[b]}`);
  }
  if (g.passed !== run.passedCount) throw new Error(`tick ${tick}: 통과 수 불일치 ${g.passed} vs ${run.passedCount}`);
  if (g.gates.length !== run.gates.length) throw new Error(`tick ${tick}: 장애물 수 불일치`);
  if ((ref.mode === 'play') !== run.alive) throw new Error(`tick ${tick}: 생존 상태 불일치 ref=${ref.mode}`);
  return maxErr;
}

// driver(obs, tick) → { ops, axis }
function lockstep(driver, maxTicks) {
  const ref = loadReference();
  ref.start();
  const run = Simulation.createRun({ balance, seed: balance.generator.seed });
  let maxErr = compareStates(ref, run, 0), deathEvent = null, t = 0;
  for (; t < maxTicks && run.alive; t++) {
    const { ops, axis } = driver(run, t);
    applyOpsToReference(ref, ops, axis);
    ref.step(DT);
    const events = Simulation.step(run, { ops, axis }, DT, balance);
    for (const e of events) if (e.type === 'death') deathEvent = e;
    maxErr = Math.max(maxErr, compareStates(ref, run, t + 1));
  }
  return { run, ref, ticks: t, maxErr, deathEvent };
}

function botDriver(params) {
  const bot = createAutopilot(balance, params);
  let lastTarget = null;
  return (run) => {
    const d = bot({ distance: run.distance, x: run.x, energy: run.energy, held: run.logicalHeld, speed: Simulation.currentSpeed(run, balance), gates: run.gates });
    const ops = decisionToOps(d, run.logicalHeld, lastTarget);
    lastTarget = d.held ? d.targetX : null;
    return { ops, axis: 0 };
  };
}

function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296); }

// ── 테스트 ─────────────────────────────────────────────────
test('A. 기준 시제품 SHA-256 일치', () => {
  assert.strictEqual(referenceSha(), REF_SHA);
  return REF_SHA.slice(0, 16) + '…';
});

test('A. 설정 JSON ↔ src/balance-r0.js 동기화', () => {
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'balance-r0.json'), 'utf8'));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(balance)), json);
  assert.strictEqual(json.sourceSha256, REF_SHA);
});

test('B. 생성기: 시드 9173 첫 코스가 기준과 동일', () => {
  const ref = loadReference(); ref.start();
  const run = Simulation.createRun({ balance });
  assert.strictEqual(ref.g.gates.length, run.gates.length);
  ref.g.gates.forEach((rg, i) => {
    const mg = run.gates[i];
    assert.ok(rg.z === mg.z && rg.h === mg.h && rg.gap === mg.gap && rg.cx === mg.cx, `gate ${i}`);
  });
  assert.deepStrictEqual(run.gates.slice(0, 3).map(g => g.cx), [180, 100, 260]);
  assert.deepStrictEqual(run.gates.slice(0, 3).map(g => g.kind), ['short', 'long', 'short']);
  return `${run.gates.length}개 장애물 일치`;
});

test('B. 생성기: 실효 최소 틈 31, 연속 틈은 같은 X·102 간격', () => {
  const gs = Generator.createGeneratorState(balance.generator);
  const gates = [];
  Generator.fillAhead(gs, gates, 40000, balance.generator);
  const shortGaps = gates.filter(g => g.kind !== 'long').map(g => g.gap);
  assert.strictEqual(Math.min(...shortGaps), 31);
  const byBlock = {};
  gates.filter(g => g.kind === 'double').forEach(g => (byBlock[g.block] = byBlock[g.block] || []).push(g));
  for (const pair of Object.values(byBlock)) { assert.strictEqual(pair.length, 2); assert.strictEqual(pair[1].z - pair[0].z, 102); assert.strictEqual(pair[0].cx, pair[1].cx); }
  return `${gates.length}개 생성 검사`;
});

test('B. R0 락스텝: 자동 조작(터치 제약) 120개 통과 + 매 틱 기준 일치', () => {
  const r = lockstep(botDriver(), 120 * 60 * 10);
  assert.ok(r.run.passedCount >= 120, `통과 ${r.run.passedCount}개에서 ${r.deathEvent && r.deathEvent.reason}`);
  return `${r.run.passedCount}개 통과, ${r.ticks}틱, 최대 오차 ${r.maxErr}`;
});

test('B. R0 락스텝: 키보드 조작(압축 없이도 이동) — 스페이스 + 방향키', () => {
  const bot = createAutopilot(balance);
  const r = lockstep((run) => {
    const d = bot({ distance: run.distance, x: run.x, energy: run.energy, held: run.logicalHeld, speed: Simulation.currentSpeed(run, balance), gates: run.gates });
    const next = run.gates.find(g => run.distance < g.z + g.h / 2 + 45);
    const aim = next ? next.cx : 180;
    const axis = Math.abs(aim - run.x) < 3 ? 0 : Math.sign(aim - run.x); // 키보드는 압축 없이도 이동 가능
    const ops = d.held !== run.logicalHeld ? [{ type: 'hold', value: d.held }] : [];
    return { ops, axis };
  }, 120 * 60 * 3);
  return `${r.ticks}틱, 통과 ${r.run.passedCount}, 종료 ${r.deathEvent ? r.deathEvent.reason : '생존'}, 최대 오차 ${r.maxErr}`;
});

test('B. R0 락스텝: 드래그·연타 퍼징 20회', () => {
  let totalTicks = 0, maxErr = 0;
  for (let s = 1; s <= 20; s++) {
    const rnd = lcg(s * 7919); let held = false;
    const r = lockstep((run) => {
      const ops = [];
      if (rnd() < 0.04) { held = !held; if (!held) ops.push({ type: 'snap' }); ops.push({ type: 'hold', value: held }); }
      if (held && rnd() < 0.2) ops.push({ type: 'target', x: run.x + (rnd() - 0.5) * 200 });
      if (rnd() < 0.005) { ops.push({ type: 'hold', value: !held }); ops.push({ type: 'hold', value: held }); } // 한 프레임 안의 탭
      return { ops, axis: 0 };
    }, 6000);
    totalTicks += r.ticks; maxErr = Math.max(maxErr, r.maxErr);
  }
  return `${totalTicks}틱, 최대 오차 ${maxErr}`;
});

test('QA-03 계속 누르기 → 약 3.23초 후 과압축 (기준과 동일 틱)', () => {
  const r = lockstep((run, t) => ({ ops: t === 0 ? [{ type: 'hold', value: true }] : [], axis: 0 }), 2000);
  assert.strictEqual(r.deathEvent && r.deathEvent.reason, 'overpressure');
  const sec = r.run.time;
  assert.ok(Math.abs(sec - 1 / 0.31) < 0.02, `${sec}s`);
  return `${sec.toFixed(3)}초 (${r.ticks}틱)`;
});

test('아무 입력 없음 → 첫 벽 충돌 (기준과 동일)', () => {
  const r = lockstep(() => ({ ops: [], axis: 0 }), 2000);
  assert.ok(r.deathEvent && r.deathEvent.reason !== 'overpressure');
  return `${r.deathEvent.reason}, ${r.run.time.toFixed(2)}초`;
});

function isolatedPeak(holdSeconds) {
  const body = { radius: balance.player.baseRadius, radialVelocity: 0, energy: 0 };
  const ticks = Math.round(holdSeconds / DT);
  for (let i = 0; i < ticks; i++) Simulation.stepBody(body, true, DT, balance);
  body.radialVelocity += Simulation.releaseImpulse(body.energy, balance);
  let peak = 0;
  for (let i = 0; i < 240; i++) { Simulation.stepBody(body, false, DT, balance); peak = Math.max(peak, body.radius); }
  return peak;
}

test('QA-01/02 격리 계산: 0.5초 압축 ≈28.33, 1.8초 ≈34.55, 긴 압축의 반동이 더 큼', () => {
  const a = isolatedPeak(0.5), b = isolatedPeak(1.8);
  assert.ok(Math.abs(a - 28.33) < 0.01, a);
  assert.ok(Math.abs(b - 34.55) < 0.01, b);
  assert.ok(b > a);
  return `${a.toFixed(3)} / ${b.toFixed(3)}`;
});

test('QA-01 반동 1회: 해제 전이마다 정확히 1회', () => {
  const run = Simulation.createRun({ balance, withGates: false });
  let releases = 0;
  const seq = [[{ type: 'hold', value: true }], [], [{ type: 'hold', value: false }], [{ type: 'hold', value: false }], [{ type: 'hold', value: true }, { type: 'hold', value: false }]];
  for (const ops of seq) releases += Simulation.step(run, { ops, axis: 0 }, DT, balance).filter(e => e.type === 'release').length;
  assert.strictEqual(releases, 2);
});

test('QA-04 연타로 에너지를 즉시 초기화할 수 없음', () => {
  const run = Simulation.createRun({ balance, withGates: false });
  let peakEnergy = 0;
  for (let i = 0; i < 360; i++) {
    const phase = i % 18; // 0.1초 누르고 0.05초 떼기
    const ops = phase === 0 ? [{ type: 'hold', value: true }] : phase === 12 ? [{ type: 'hold', value: false }] : [];
    Simulation.step(run, { ops, axis: 0 }, DT, balance);
    peakEnergy = Math.max(peakEnergy, run.energy);
  }
  assert.ok(run.energy > 0.2, `energy ${run.energy}`);
  return `3초 연타 후 에너지 ${run.energy.toFixed(3)}`;
});

test('QA-05 상대 드래그·속도 상한·경계·손 떼면 정지', () => {
  const ia = InputAdapter.createInputAdapter(balance);
  const run = Simulation.createRun({ balance, withGates: false });
  ia.pointerDown({ pointerId: 1, clientX: 500, surfaceWidth: 180, worldX: run.x }); // 화면 2배 축소 → scale 2
  ia.pointerMove({ pointerId: 1, clientX: 530 });
  let f = ia.collect();
  assert.deepStrictEqual(f.ops.map(o => o.type), ['hold', 'target']);
  assert.strictEqual(f.ops[1].x, 240); // 180 + 30×2, 누른 위치로 순간이동하지 않음
  Simulation.step(run, f, DT, balance);
  assert.ok(Math.abs(run.x - (180 + balance.player.pointerSpeed * DT)) < 1e-9);
  ia.pointerMove({ pointerId: 1, clientX: 5000 });
  for (let i = 0; i < 240; i++) Simulation.step(run, ia.collect(), DT, balance);
  assert.strictEqual(run.x, balance.player.maxX);
  ia.pointerMove({ pointerId: 1, clientX: -5000 });
  Simulation.step(run, ia.collect(), DT, balance);
  const xAtRelease = run.x;
  ia.pointerUp({ pointerId: 1 });
  for (let i = 0; i < 60; i++) Simulation.step(run, ia.collect(), DT, balance);
  assert.strictEqual(run.x, xAtRelease);
});

test('QA-06 두 번째 손가락·중복 release로 반동이 중복되지 않음', () => {
  const ia = InputAdapter.createInputAdapter(balance);
  const run = Simulation.createRun({ balance, withGates: false });
  assert.ok(ia.pointerDown({ pointerId: 1, clientX: 0, surfaceWidth: 360, worldX: 180 }));
  assert.ok(!ia.pointerDown({ pointerId: 2, clientX: 10, surfaceWidth: 360, worldX: 180 }));
  Simulation.step(run, ia.collect(), DT, balance);
  ia.pointerUp({ pointerId: 2 }); ia.pointerUp({ pointerId: 1 }); ia.pointerUp({ pointerId: 1 }); ia.pointerCancel({ pointerId: 1 });
  const rel = Simulation.step(run, ia.collect(), DT, balance).filter(e => e.type === 'release');
  assert.strictEqual(rel.length, 1);
});

test('QA-07 충돌: 틈 중앙 통과 / 벽 충돌 / 모서리 경계 / 좌우 대칭', () => {
  const gate = { z: 100, h: 24, cx: 180, gap: 40 };
  const hit = (x, r, d) => Collision.checkCollision({ x, r, distance: d }, gate, 1);
  assert.ok(!hit(180, 20, 100));   // 반지름-1 = 19 < 20
  assert.ok(hit(180, 21.5, 100));
  assert.ok(hit(100, 9, 100));     // 벽 안
  assert.ok(!hit(160, 24, 100 - 12 - 23.5)); // 틈 모서리(x=160) 바로 아래: 수직 거리 23.5 ≥ 23
  assert.ok(hit(160, 24, 100 - 12 - 22.9));
  assert.ok(!hit(180, 24, 100 - 12 - 15));   // 중앙이면 모서리까지 √(20²+15²)=25 ≥ 23
  for (const dx of [5, 10, 14, 17]) for (const r of [12, 16, 20]) assert.strictEqual(hit(180 - dx, r, 100), hit(180 + dx, r, 100));
});

test('QA-12 같은 입력 틱 리플레이는 30/60/120/144Hz에서 같은 결과', () => {
  const TARGET_TICK = 7200; // 60초
  const states = [30, 60, 120, 144].map(hz => {
    const ctl = GameController.createGameController({ balance });
    const drive = botDriver();
    const snap = {};
    ctl.start();
    ctl.replaySource = (tick, run) => {
      if (tick === TARGET_TICK) Object.assign(snap, { x: run.x, r: run.radius, d: run.distance, p: run.passedCount, e: run.energy });
      return drive(run);
    };
    let now = 1000; ctl.frame(now);
    while (ctl.state === 'PLAYING' && ctl.run.tick <= TARGET_TICK) { now += 1000 / hz; ctl.frame(now); }
    assert.ok('x' in snap, `${hz}Hz: ${TARGET_TICK}틱 전에 종료`);
    return snap;
  });
  for (const s of states.slice(1)) assert.deepStrictEqual(s, states[0]);
  return `${TARGET_TICK}틱 시점 4개 주사율 동일 (통과 ${states[0].p})`;
});

test('일시정지(R0): 동결 중 물리·거리·에너지 불변', () => {
  const ctl = GameController.createGameController({ balance });
  ctl.start();
  let now = 1000; ctl.frame(now);
  ctl.pointerDown({ pointerId: 1, clientX: 0, surfaceWidth: 360 });
  for (let i = 0; i < 20; i++) { now += 16.7; ctl.frame(now); }
  ctl.pause('test');
  const before = JSON.stringify(ctl.run);
  for (let i = 0; i < 200; i++) { now += 16.7; ctl.frame(now); }
  assert.strictEqual(JSON.stringify(ctl.run), before);
  assert.strictEqual(ctl.run.logicalHeld, false); // R0 원본 동작(FIX-02에서 보완)
  ctl.resume();
  now += 5000; ctl.frame(now); now += 16.7; ctl.frame(now);
  assert.ok(ctl.run.distance > JSON.parse(before).distance);
  assert.ok(ctl.run.distance - JSON.parse(before).distance < 3, '복귀 시 긴 경과 시간을 따라잡지 않음');
});

test('QA-14 재시작 100회: 장애물·리스너·점수 중복 없음', () => {
  const ctl = GameController.createGameController({ balance });
  let starts = 0; ctl.on(e => { if (e.type === 'start') starts++; });
  let now = 1000;
  const baseline = Simulation.createRun({ balance }).gates.length;
  for (let i = 0; i < 100; i++) {
    ctl.keyDown({ code: 'Space' }); // READY/RESULT에서 시작 + 압축
    for (let k = 0; k < 30; k++) { now += 16.7; ctl.frame(now); }
    ctl.keyUp({ code: 'Space' });
    while (ctl.state === 'PLAYING') { now += 16.7; ctl.frame(now); }
    assert.ok(ctl.run.gates.length <= baseline + 4);
  }
  ctl.keyDown({ code: 'Space' });
  assert.strictEqual(starts, 101);
  assert.strictEqual(ctl.run.passedCount, 0);
  assert.strictEqual(ctl.run.distance, 0);
});

test('입력 방식 기록: 터치+키보드 혼용 시 mixed', () => {
  const ctl = GameController.createGameController({ balance });
  ctl.start();
  ctl.pointerDown({ pointerId: 1, clientX: 0, surfaceWidth: 360 });
  assert.strictEqual(ctl.input.inputMode(), 'touch');
  ctl.keyDown({ code: 'ArrowLeft' });
  assert.strictEqual(ctl.input.inputMode(), 'mixed');
});

// ── R1 출시 규칙 ──────────────────────────────────────
require('./r1-tests.js')(test);
require('./tutorial-tests.js')(test);
require('./growth-tests.js')(test);
require('./skin-tests.js')(test);
require('./pwa-tests.js')(test);
require('./feats-tests.js')(test);
require('./daily-tests.js')(test);
require('./versus-tests.js')(test);

// ── 출력 ──────────────────────────────────────────────────
let fail = 0;
for (const r of results) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.note ? '  — ' + r.note : ''}`);
}
console.log(`\n${results.length - fail}/${results.length} 통과`);
process.exit(fail ? 1 : 0);
