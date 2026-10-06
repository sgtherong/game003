// R1(출시 규칙) 검사: FIX-01 ~ FIX-08. run-tests.js에서 호출한다.
'use strict';
const assert = require('assert');
const balanceR0 = require('../src/balance-r0.js');
const balance = require('../src/balance-r1.js');
const Simulation = require('../src/simulation.js');
const Generator = require('../src/generator.js');
const Save = require('../src/save.js');
const GameController = require('../src/game-controller.js');
const { createAutopilot, decisionToOps } = require('./autopilot.js');

const DT = balance.world.fixedStepSeconds;
const FRAME = 1000 / 60;

function makeCtl(extra) {
  const ctl = GameController.createGameController(Object.assign({ balance, store: Save.memoryStore(), seed: 12345 }, extra || {}));
  ctl._now = 1000;
  ctl.frame(ctl._now);
  return ctl;
}
function frames(ctl, n, ms) { for (let i = 0; i < n; i++) { ctl._now += ms || FRAME; ctl.frame(ctl._now); } }
function collectEvents(ctl) { const list = []; ctl.on(e => list.push(e)); return list; }
function snapshot(run) { return JSON.stringify({ d: run.distance, x: run.x, t: run.targetX, r: run.radius, v: run.radialVelocity, p: run.energy, h: run.logicalHeld, s: run.generator.rng.seed, n: run.passedCount, k: run.tick }); }
function playUntilDeath(ctl) { let guard = 0; while (ctl.state === 'PLAYING' && guard++ < 100000) frames(ctl, 1); frames(ctl, 60); }
function botObs(run, bal) { return { distance: run.distance, x: run.x, energy: run.energy, held: run.logicalHeld, speed: Simulation.currentSpeed(run, bal), gates: run.gates }; }

module.exports = function registerR1Tests(test) {
  // ── FIX-01 ─────────────────────────────────────────────
  test('FIX-01 결과가 로컬 저장되고 재실행 시 복원', () => {
    const store = Save.memoryStore();
    const a = makeCtl({ store });
    a.start(); frames(a, 1);
    a.pointerDown({ pointerId: 1, clientX: 0, surfaceWidth: 360 });
    frames(a, 30); a.pointerUp({ pointerId: 1 });
    playUntilDeath(a);
    assert.strictEqual(a.state, 'RESULT');
    const h = a.lastRecord.height;
    assert.ok(h > 0);
    const b = makeCtl({ store });
    assert.strictEqual(b.loadInfo.source, 'primary');
    assert.strictEqual(b.getBest('touch'), h);
    return `${h} m 복원`;
  });

  test('FIX-01 손상 복구: JSON 깨짐 → 백업, 잘못된 항목만 기본값', () => {
    const good = Save.defaultProfile();
    good.records[Save.recordKey('r1', 'r1.0', 'touch')] = { height: 42, passed: 5, achievedAt: '2026-10-01T00:00:00.000Z' };
    const store = Save.memoryStore();
    Save.save(store, good);
    Save.save(store, good); // 두 번째 저장에서 첫 저장본이 백업으로 이동
    store.write(Save.PRIMARY_KEY, '{"schemaVersion":1, broken');
    const loaded = Save.load(store);
    assert.strictEqual(loaded.source, 'backup');
    assert.strictEqual(loaded.profile.records['r1|r1.0|touch'].height, 42);

    const bad = JSON.parse(JSON.stringify(good));
    bad.records['r1|r1.0|keyboard'] = { height: Infinity, passed: 1, achievedAt: 'x' };
    bad.records['r1|r1.0|joystick'] = { height: 3, passed: 1, achievedAt: '2026-10-01T00:00:00.000Z' };
    bad.settings.language = 'zz';
    bad.settings.sfx = 'yes';
    bad.softCurrency = NaN;
    bad.cosmetics = { unlocked: ['base', 'dragon'], equipped: 'dragon' };
    const v = Save.validateSave(bad);
    assert.strictEqual(v.profile.records['r1|r1.0|touch'].height, 42);
    assert.ok(!('r1|r1.0|keyboard' in v.profile.records) && !('r1|r1.0|joystick' in v.profile.records));
    assert.strictEqual(v.profile.settings.language, 'ko');
    assert.strictEqual(v.profile.settings.sfx, true);
    assert.strictEqual(v.profile.softCurrency, 0);
    assert.deepStrictEqual(v.profile.cosmetics, { unlocked: ['base'], equipped: 'base' });
    assert.strictEqual(Save.validateSave('nope').repaired[0], '*');
    return `복구 항목 ${v.repaired.length}개`;
  });

  test('FIX-01 결과는 runId당 1회 저장, 규칙 버전별 기록 분리', () => {
    const store = Save.memoryStore();
    let writes = 0; const write = store.write; store.write = (k, val) => { writes++; write(k, val); };
    const a = makeCtl({ store });
    a.start(); playUntilDeath(a); frames(a, 200);
    const writesAfter = writes;
    frames(a, 200);
    assert.strictEqual(writes, writesAfter);
    assert.ok(writesAfter >= 1 && writesAfter <= 2); // 주 저장본 + 백업
    const r0 = GameController.createGameController({ balance: balanceR0, store });
    assert.strictEqual(r0.getBest('touch'), 0, 'r0 기록과 r1 기록은 섞이지 않음');
  });

  // ── FIX-02 / FIX-08 ────────────────────────────────────
  function pressedRun() {
    const ctl = makeCtl();
    const ev = collectEvents(ctl);
    ctl.start(); frames(ctl, 1);
    ctl.pointerDown({ pointerId: 1, clientX: 100, surfaceWidth: 360 });
    frames(ctl, 30);
    return { ctl, ev };
  }

  test('FIX-02 일시정지 중 압축 보존, 재개 시 손을 뗀 상태면 반동 정확히 1회', () => {
    const { ctl, ev } = pressedRun();
    assert.ok(ctl.run.logicalHeld);
    ctl.pause('button');
    const frozen = snapshot(ctl.run);
    const energy = ctl.run.energy, vr = ctl.run.radialVelocity;
    frames(ctl, 120);
    assert.strictEqual(snapshot(ctl.run), frozen, 'PAUSED 동결');
    assert.ok(ctl.run.logicalHeld, 'held 보존');
    ctl.resume();
    frames(ctl, 30);
    assert.strictEqual(ctl.state, 'RESUME_COUNTDOWN');
    assert.strictEqual(snapshot(ctl.run), frozen, '준비 시간 동안 동결');
    const before = ev.filter(e => e.type === 'release').length;
    frames(ctl, 31);
    assert.strictEqual(ctl.state, 'PLAYING');
    frames(ctl, 1);
    const rel = ev.filter(e => e.type === 'release').slice(before);
    assert.strictEqual(rel.length, 1);
    assert.ok(Math.abs(rel[0].energy - energy) < 1e-12, '보존된 에너지로 반동');
    assert.ok(Math.abs(rel[0].impulse - Simulation.releaseImpulse(energy, balance)) < 1e-12);
    assert.ok(vr < 0 || vr >= 0);
    frames(ctl, 30);
    assert.strictEqual(ev.filter(e => e.type === 'release').length - before, 1);
    return `에너지 ${energy.toFixed(3)} 보존`;
  });

  test('FIX-02 재개 시 계속 누르고 있으면 반동 없이 압축 이어 감, 순간이동 없음', () => {
    const { ctl, ev } = pressedRun();
    ctl.pause('button');
    const x0 = ctl.run.x, p0 = ctl.run.energy;
    ctl.resume();
    ctl.pointerDown({ pointerId: 9, clientX: 340, surfaceWidth: 360 }); // 준비 시간 중 다른 위치를 누름
    frames(ctl, 61);
    const before = ev.filter(e => e.type === 'release').length;
    frames(ctl, 10);
    assert.strictEqual(ev.filter(e => e.type === 'release').length, before);
    assert.ok(ctl.run.logicalHeld);
    assert.ok(ctl.run.energy > p0);
    assert.strictEqual(ctl.run.x, x0, '누른 위치로 순간이동하지 않음');
  });

  test('FIX-02 반복 일시정지로 에너지 감소·반동 소멸·거리 증가 없음', () => {
    const { ctl, ev } = pressedRun();
    const frozen = snapshot(ctl.run);
    ctl.pause('button');
    for (let i = 0; i < 25; i++) { ctl.resume(); frames(ctl, 20); ctl.pause('button'); frames(ctl, 5); }
    assert.strictEqual(snapshot(ctl.run), frozen);
    assert.strictEqual(ev.filter(e => e.type === 'release').length, 0);
  });

  test('FIX-08 준비 시간 1초, 그 중 가림이 오면 다시 일시정지', () => {
    const { ctl, ev } = pressedRun();
    ctl.pause('button'); ctl.resume();
    assert.strictEqual(ev.filter(e => e.type === 'resumeCountdown').length, 1);
    frames(ctl, 54); // 0.9초
    assert.strictEqual(ctl.state, 'RESUME_COUNTDOWN');
    ctl.pause('hidden');
    assert.strictEqual(ctl.state, 'PAUSED');
    ctl.resume(); frames(ctl, 61);
    assert.strictEqual(ctl.state, 'PLAYING');
    ctl.primaryAction(); // PLAYING 중 계속하기 입력은 무시
    assert.strictEqual(ctl.state, 'PLAYING');
  });

  // ── FIX-03 ─────────────────────────────────────────────
  test('FIX-03 pointercancel → 반동 없이 일시정지, 정상 해제 후 lostpointercapture는 무시', () => {
    const { ctl, ev } = pressedRun();
    ctl.pointerCancel({ pointerId: 1 });
    assert.strictEqual(ctl.state, 'PAUSED');
    assert.ok(ctl.run.logicalHeld);
    frames(ctl, 5);
    assert.strictEqual(ev.filter(e => e.type === 'release').length, 0);
    assert.strictEqual(ev.find(e => e.type === 'pause').reason, 'pointercancel');

    const b = pressedRun();
    b.ctl.pointerUp({ pointerId: 1 });
    b.ctl.pointerCancel({ pointerId: 1 }); // 브라우저가 해제 뒤 보내는 lostpointercapture
    assert.strictEqual(b.ctl.state, 'PLAYING');
    frames(b.ctl, 2);
    assert.strictEqual(b.ev.filter(e => e.type === 'release').length, 1);
  });

  // ── FIX-04 ─────────────────────────────────────────────
  test('FIX-04 통과는 gate.z + h/2 + 60을 지난 뒤 정확히 1회', () => {
    const run = Simulation.createRun({ balance, rulesVersion: 'r1', withGates: false });
    run.generator.nextZ = 1e9; // 자동 생성 중지
    run.gates.push({ id: 1, z: 100, h: 24, cx: 180, gap: 200, passed: false });
    let passes = 0, passDistance = null;
    for (let i = 0; i < 400; i++) {
      for (const e of Simulation.step(run, { ops: [], axis: 0 }, DT, balance)) if (e.type === 'gatePassed') { passes++; passDistance = run.distance; }
    }
    assert.strictEqual(passes, 1);
    assert.ok(passDistance > 172 && passDistance < 172 + 2, passDistance);
    const r0run = Simulation.createRun({ balance: balanceR0, withGates: false });
    r0run.generator.nextZ = 1e9;
    r0run.gates.push({ id: 1, z: 100, h: 24, cx: 180, gap: 200, passed: false });
    let r0At = null;
    for (let i = 0; i < 400 && r0At === null; i++) for (const e of Simulation.step(r0run, { ops: [], axis: 0 }, DT, balanceR0)) if (e.type === 'gatePassed') r0At = r0run.distance;
    return `R1 ${passDistance.toFixed(2)} / R0 ${r0At.toFixed(2)}`;
  });

  test('FIX-04 충돌한 틱에는 신규 통과 없음(전체 충돌 먼저 검사)', () => {
    const run = Simulation.createRun({ balance, rulesVersion: 'r1', withGates: false });
    run.generator.nextZ = 1e9;
    const speed = Simulation.currentSpeed(run, balance);
    run.distance = 172 - speed * DT / 2; // 다음 틱에 첫 장애물 통과 기준을 넘는다
    run.gates.push({ id: 1, z: 100, h: 24, cx: 180, gap: 200, passed: false });
    run.gates.push({ id: 2, z: run.distance + speed * DT + 12 + 15, h: 24, cx: 180, gap: 20, passed: false }); // 같은 틱에 충돌
    const events = Simulation.step(run, { ops: [], axis: 0 }, DT, balance);
    assert.ok(events.some(e => e.type === 'death'));
    assert.strictEqual(run.passedCount, 0);
    assert.ok(!events.some(e => e.type === 'gatePassed'));
  });

  // ── FIX-05 ─────────────────────────────────────────────
  test('FIX-05 터치/키보드/혼합 기록 분리, mixed는 경쟁 제외', () => {
    const store = Save.memoryStore();
    const ctl = makeCtl({ store });
    ctl.start(); frames(ctl, 1);
    ctl.pointerDown({ pointerId: 1, clientX: 0, surfaceWidth: 360 }); frames(ctl, 20); ctl.pointerUp({ pointerId: 1 });
    playUntilDeath(ctl);
    const touch = ctl.lastRecord;
    ctl.keyDown({ code: 'Space' }); frames(ctl, 20); ctl.keyUp({ code: 'Space' });
    playUntilDeath(ctl);
    const kb = ctl.lastRecord;
    ctl.keyDown({ code: 'Space' }); frames(ctl, 2);
    ctl.pointerDown({ pointerId: 2, clientX: 0, surfaceWidth: 360 }); ctl.keyUp({ code: 'Space' }); frames(ctl, 20); ctl.pointerUp({ pointerId: 2 });
    playUntilDeath(ctl);
    const mixed = ctl.lastRecord;
    assert.deepStrictEqual([touch.inputMode, kb.inputMode, mixed.inputMode], ['touch', 'keyboard', 'mixed']);
    assert.strictEqual(mixed.competitive, false);
    const keys = Object.keys(ctl.profile.records).sort();
    const bv = balance.balanceVersion;
    assert.deepStrictEqual(keys, ['r1|' + bv + '|keyboard', 'r1|' + bv + '|mixed', 'r1|' + bv + '|touch']);
    assert.strictEqual(ctl.profile.lastInputMode, 'keyboard', 'mixed는 표시 모드를 바꾸지 않음');
    assert.strictEqual(ctl.getBest('touch'), touch.height);
  });

  // ── FIX-06 ─────────────────────────────────────────────
  test('FIX-06 250ms 이상 정지 → 따라잡지 않고 자동 일시정지', () => {
    const ctl = makeCtl();
    ctl.start(); frames(ctl, 10);
    const s = snapshot(ctl.run);
    ctl._now += 300; const ticks = ctl.frame(ctl._now);
    assert.strictEqual(ticks, 0);
    assert.strictEqual(ctl.state, 'PAUSED');
    assert.strictEqual(snapshot(ctl.run), s);
  });

  test('FIX-06 프레임당 최대 12틱, 미처리분 보존, 지연 누적 시 자동 일시정지', () => {
    const ctl = makeCtl();
    ctl.start(); frames(ctl, 1);
    const ev = collectEvents(ctl);
    let ticks = 0;
    ctl._now += 200; ticks = ctl.frame(ctl._now); // 24틱 분량
    assert.strictEqual(ticks, 12);
    assert.ok(Math.abs(ctl.acc - 0.1) < 1e-6, '남은 0.1초 보존');
    for (let i = 0; i < 5 && ctl.state === 'PLAYING'; i++) { ctl._now += 200; ctl.frame(ctl._now); }
    assert.strictEqual(ctl.state, 'PAUSED');
    assert.strictEqual(ev.find(e => e.type === 'pause').reason, 'lag');
  });

  test('FIX-06 저성능(25fps)에서도 게임 시간 = 실제 시간(느린 화면 이점 없음)', () => {
    const ctl = makeCtl();
    ctl.start(); frames(ctl, 1);
    const t0 = ctl.run.tick;
    ctl.replaySource = (tick, run) => ({ ops: tick === 0 ? [] : [], axis: 0 }); // 입력 없음
    frames(ctl, 50, 40); // 2초
    assert.ok(ctl.state !== 'PAUSED');
    const simulated = (ctl.run.tick - t0) * DT;
    assert.ok(Math.abs(simulated - 2) <= DT * 1.01 || ctl.state === 'DEAD' || ctl.state === 'RESULT', simulated);
    return `2초 → ${simulated.toFixed(3)}초 계산`;
  });

  // ── FIX-07 ─────────────────────────────────────────────
  function course(seed, blocks) {
    const gs = Generator.createGeneratorState(balance.generator, seed);
    const out = [];
    for (let i = 0; i < blocks; i++) out.push(Generator.createNextBlock(gs, balance.generator));
    return { blocks: out, gs };
  }

  test('FIX-07 같은 시드 = 같은 코스, 첫 세 블록 고정, 금지 연결 없음, 대체 블록', () => {
    const a = JSON.stringify(course(777, 150).blocks), b = JSON.stringify(course(777, 150).blocks);
    assert.strictEqual(a, b);
    assert.notStrictEqual(a, JSON.stringify(course(778, 150).blocks));
    let fallbacks = 0, total = 0;
    for (let s = 1; s <= 200; s++) {
      const { blocks, gs } = course((s * 2654435761) >>> 0, 120);
      assert.deepStrictEqual(blocks.slice(0, 3).map(bl => bl[0].kind + '@' + bl[0].cx), balance.generator.firstPatternTypes.map((k, i) => k + '@' + balance.generator.firstCenters[i]));
      for (let i = 1; i < blocks.length; i++) {
        const prev = blocks[i - 1][0], cur = blocks[i][0];
        assert.ok(Generator.isConnectionSafe({ kind: prev.kind, cx: prev.cx }, cur.kind, cur.cx, balance.generator, cur.z), `seed ${s} block ${i}`);
        const unlock = balance.generator.patternUnlockZ || {};
        assert.ok(cur.z >= (unlock[cur.kind] || 0) || i < 3, `seed ${s} block ${i}: ${cur.kind}가 해금 전 등장`);
        if (cur.fallback) {
          assert.strictEqual(cur.kind, balance.generator.fallback.pattern);
          assert.strictEqual(cur.cx, balance.generator.fallback.center);
        }
      }
      fallbacks += gs.fallbacks; total += blocks.length;
    }
    return `대체 블록 ${(100 * fallbacks / total).toFixed(1)}%`;
  });

  test('r1.1 쉬운 시작: 초반 넓은 틈, 패턴 단계적 해금, 초반 큰 이동 없음, 속도 74→130', () => {
    const gen = balance.generator;
    let minEarlyGap = Infinity, firstLong = Infinity, firstDouble = Infinity, firstBigShift = Infinity;
    for (let s = 1; s <= 200; s++) {
      const { blocks } = course((s * 2654435761) >>> 0, 60);
      for (let i = 0; i < blocks.length; i++) {
        const g = blocks[i][0];
        if (g.z < 3000 && g.kind !== 'long') minEarlyGap = Math.min(minEarlyGap, g.gap);
        if (g.kind === 'long' && i >= 3) firstLong = Math.min(firstLong, g.z);
        if (g.kind === 'double') firstDouble = Math.min(firstDouble, g.z);
        if (i > 0 && Math.abs(g.cx - blocks[i - 1][0].cx) >= 180) firstBigShift = Math.min(firstBigShift, g.z);
      }
    }
    assert.ok(minEarlyGap >= 40, `300 m 전 최소 틈 ${minEarlyGap}`);
    assert.ok(firstLong >= gen.patternUnlockZ.long && firstDouble >= gen.patternUnlockZ.double && firstBigShift >= 1500);
    const a = balance.ascent;
    assert.strictEqual(Simulation.currentSpeed({ passedCount: 0, energy: 0 }, balance), 74);
    assert.strictEqual(Simulation.currentSpeed({ passedCount: 999, energy: 0 }, balance), a.maxSpeed);
    // 마지막 단계의 최소 틈은 r1.0과 같은 31
    const late = course(99, 400).blocks.map(b => b[0]).filter(g => g.kind !== 'long' && !g.fallback);
    assert.strictEqual(Math.min(...late.map(g => g.gap)), 31);
    return `300 m 전 최소 틈 ${minEarlyGap.toFixed(1)}, 긴 틈 ${(firstLong / 10).toFixed(0)} m~, 연속 틈 ${(firstDouble / 10).toFixed(0)} m~, 큰 이동 ${(firstBigShift / 10).toFixed(0)} m~`;
  });

  test('FIX-07 실행마다 새 시드, 재현 정보(runSeed·버전) 기록', () => {
    let n = 0;
    const ctl = makeCtl({ seed: null, randomSeed: () => 1000 + (n++) });
    const ev = collectEvents(ctl);
    ctl.start(); const s1 = ctl.run.runSeed;
    ctl.start(); const s2 = ctl.run.runSeed;
    assert.notStrictEqual(s1, s2);
    const st = ev.filter(e => e.type === 'start')[1];
    assert.deepStrictEqual([st.seed, st.rulesVersion, st.balanceVersion, st.generatorVersion], [s2, 'r1', balance.balanceVersion, balance.generator.version]);
    const real = makeCtl({ seed: null });
    real.start(); const r1 = real.run.runSeed; real.start();
    assert.notStrictEqual(r1, real.run.runSeed);
  });

  test('FIX-07 오프라인 검사: 100 시드 × 200 장애물, 터치 제약 자동 조작', () => {
    const failures = [];
    let ticks = 0;
    for (let s = 1; s <= 100; s++) {
      const seed = (s * 2654435761) >>> 0;
      const run = Simulation.createRun({ balance, seed, rulesVersion: 'r1' });
      const bot = createAutopilot(balance); let lastTarget = null, death = null;
      while (run.alive && run.passedCount < 200) {
        const d = bot(botObs(run, balance));
        const ops = decisionToOps(d, run.logicalHeld, lastTarget);
        lastTarget = d.held ? d.targetX : null;
        for (const e of Simulation.step(run, { ops, axis: 0 }, DT, balance)) if (e.type === 'death') death = e;
      }
      ticks += run.tick;
      if (!run.alive) failures.push({ seed, tick: run.tick, passed: run.passedCount, reason: death.reason, gateId: death.gateId });
    }
    assert.deepStrictEqual(failures, []);
    return `100/100 시드 200개 통과 (${ticks}틱)`;
  });

  test('FIX-07 예고 시간: 최고 속도에서도 다음 틈이 1.5초 이상 전에 화면에 보임', () => {
    const visibleAhead = balance.world.playerScreenY; // 화면 위 끝까지의 논리 거리
    const sec = visibleAhead / balance.ascent.maxSpeed;
    assert.ok(sec >= 1.5, sec);
    assert.ok(balance.generator.lookAhead > visibleAhead);
    return `${sec.toFixed(2)}초 (설계 목표 1.5초, 실제 시인성은 기기 확인 필요)`;
  });
};
