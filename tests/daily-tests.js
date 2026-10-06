// 오늘의 도전·고스트(입력 재생) 검사. run-tests.js에서 호출한다.
'use strict';
const assert = require('assert');
const balance = require('../src/balance-r1.js');
const Simulation = require('../src/simulation.js');
const Replay = require('../src/replay.js');
const Save = require('../src/save.js');
const InputAdapter = require('../src/input-adapter.js');
const GameController = require('../src/game-controller.js');
const { createAutopilot, decisionToOps } = require('./autopilot.js');

const FRAME = 1000 / 60;
const DT = balance.world.fixedStepSeconds;

function makeCtl(store, day) {
  let d = day || '2026-10-06';
  const ctl = GameController.createGameController({ balance, store: store || Save.memoryStore(), today: () => d });
  ctl.setDay = v => { d = v; };
  ctl._now = 1000; ctl.frame(ctl._now);
  return ctl;
}
function frames(ctl, n) { for (let i = 0; i < n; i++) { ctl._now += FRAME; ctl.frame(ctl._now); } }

// 실제 입력 경로(InputAdapter)를 거치는 사람 흉내: 자동 조작 결정을 포인터 이벤트로 바꿔 넣는다. stopAfter 틱 뒤에는 손을 놓아 판을 끝낸다.
function playDaily(ctl, stopAfterTicks) {
  ctl.start('daily');
  const bot = createAutopilot(balance);
  let pressed = false, anchorX = 0, anchorWorld = 0;
  let f = 0;
  while (ctl.state === 'PLAYING' && f++ < 60 * 300) {
    const run = ctl.run;
    const d = run.tick < stopAfterTicks
      ? bot({ distance: run.distance, x: run.x, energy: run.energy, held: run.logicalHeld, speed: Simulation.currentSpeed(run, balance), gates: run.gates })
      : { held: false, targetX: null };
    if (d.held && !pressed) { anchorX = 1000; anchorWorld = run.x; ctl.pointerDown({ pointerId: 1, clientX: anchorX, surfaceWidth: 343 }); pressed = true; }
    if (d.held && d.targetX != null) ctl.pointerMove({ pointerId: 1, clientX: anchorX + (d.targetX - anchorWorld) * 343 / 360 });
    if (!d.held && pressed) { ctl.pointerUp({ pointerId: 1 }); pressed = false; }
    frames(ctl, 1);
  }
  frames(ctl, 60);
  return ctl.lastRecord;
}

module.exports = function registerDailyTests(test) {
  test('고스트 전제: 저장한 입력을 재생하면 같은 판이 정확히 재현됨', () => {
    const ctl = makeCtl();
    const rec = playDaily(ctl, 120 * 25);
    const rp = ctl.profile.daily.replay;
    assert.ok(rp && Replay.validReplay(rp), '고스트 저장');
    const run = Simulation.createRun({ balance, seed: rp.seed, rulesVersion: 'r1' });
    const player = Replay.createPlayer(rp);
    while (run.alive && run.tick < rp.ticks + 10) Simulation.step(run, player.frame(run.tick), DT, balance);
    assert.strictEqual(run.alive, false);
    assert.strictEqual(run.tick, rp.ticks);
    assert.strictEqual(Simulation.heightMeters(run, balance), rec.height);
    assert.strictEqual(run.passedCount, rec.passed);
    return `${rec.height} m · 통과 ${rec.passed} · 입력 ${rp.data.length / 3}개(${JSON.stringify(rp).length} B)`;
  });

  test('고스트: 다음 판에서 같은 입력이면 고스트와 플레이어가 매 프레임 같은 위치', () => {
    const store = Save.memoryStore();
    const ctl = makeCtl(store);
    playDaily(ctl, 120 * 15);
    ctl.start('daily');
    assert.ok(ctl.ghost, '고스트 생성');
    const rp = ctl.profile.daily.replay, player = Replay.createPlayer(rp);
    ctl.replaySource = (tick) => player.frame(tick); // 오늘 최고 판과 같은 입력
    let maxGap = 0, f = 0;
    while (ctl.state === 'PLAYING' && f++ < 60 * 120) {
      frames(ctl, 1);
      if (ctl.ghost.run.alive && ctl.run.alive) maxGap = Math.max(maxGap, Math.abs(ctl.ghost.run.distance - ctl.run.distance), Math.abs(ctl.ghost.run.x - ctl.run.x));
    }
    assert.strictEqual(maxGap, 0);
  });

  test('오늘의 도전: 같은 날 같은 코스, 날짜가 바뀌면 초기화, 첫 완주 보너스 하루 1회', () => {
    const store = Save.memoryStore();
    const ctl = makeCtl(store, '2026-10-06');
    const s1 = ctl.dailyInfo().seed;
    assert.strictEqual(s1, Replay.dateSeed('2026-10-06'));
    const r1 = playDaily(ctl, 120 * 6);
    assert.strictEqual(r1.dailyBonus, balance.daily.firstRunBonus);
    const r2 = playDaily(ctl, 120 * 6);
    assert.strictEqual(r2.dailyBonus, 0, '두 번째 판은 보너스 없음');
    assert.strictEqual(ctl.dailyInfo().attempts, 2);
    assert.deepStrictEqual(Object.keys(ctl.profile.records), [], '도전 모드 기록과 섞이지 않음');
    ctl.setDay('2026-10-07');
    const next = ctl.dailyInfo();
    assert.notStrictEqual(next.seed, s1);
    assert.deepStrictEqual([next.attempts, next.best, next.hasGhost, next.bonusAvailable], [0, null, false, true]);
    // 재실행 후에도 오늘 기록·고스트 유지(저장 → 검증 → 복원)
    ctl.setDay('2026-10-06');
    const restored = makeCtl(store, '2026-10-06');
    assert.strictEqual(restored.dailyInfo().attempts, 2);
    assert.ok(restored.dailyInfo().hasGhost, '고스트가 다시 불러와짐');
    assert.ok(restored.dailyInfo().best.height >= 0);
  });

  test('입력 좌표는 1/64 단위, 손상된 고스트 기록은 검증에서 버림', () => {
    const ia = InputAdapter.createInputAdapter(balance, { cancelAsRelease: false });
    ia.pointerDown({ pointerId: 1, clientX: 100, surfaceWidth: 343, worldX: 180.123456 });
    ia.pointerMove({ pointerId: 1, clientX: 117.77 });
    const t = ia.collect().ops.find(o => o.type === 'target');
    assert.strictEqual(t.x * 64, Math.round(t.x * 64));
    const p = Save.defaultProfile();
    p.daily = { date: '2026-10-06', best: { height: 10, passed: 2 }, attempts: 1, bonusClaimed: true, replay: { v: 1, seed: 1, ticks: 10, data: [5, 9, 0] } };
    const v = Save.validateSave(p);
    assert.strictEqual(v.profile.daily.replay, null);
    assert.strictEqual(v.profile.daily.best.height, 10);
  });
};
