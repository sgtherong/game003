// 성장 모드 검사. run-tests.js에서 호출한다.
'use strict';
const assert = require('assert');
const balance = require('../src/balance-r1.js');
const Simulation = require('../src/simulation.js');
const Save = require('../src/save.js');
const Growth = require('../src/growth.js');
const GameController = require('../src/game-controller.js');
const { createAutopilot, decisionToOps } = require('./autopilot.js');

const DT = balance.world.fixedStepSeconds;
const FRAME = 1000 / 60;
function makeCtl(store, seed) {
  const ctl = GameController.createGameController({ balance, store: store || Save.memoryStore(), seed: seed == null ? 4242 : seed });
  ctl._now = 1000; ctl.frame(ctl._now);
  return ctl;
}
function frames(ctl, n) { for (let i = 0; i < n; i++) { ctl._now += FRAME; ctl.frame(ctl._now); } }

// 구슬을 노리는 자동 조작: 장애물이 가까우면 기본 자동 조작, 아니면 다음 구슬 쪽으로(압축 중에만 이동)
function growthDriver(ctl) {
  const bot = createAutopilot(balance);
  let lastTarget = null;
  return (tick, run) => {
    const b = ctl.activeBalance();
    const d = bot({ distance: run.distance, x: run.x, energy: run.energy, held: run.logicalHeld, speed: Simulation.currentSpeed(run, b), gates: run.gates.filter(g => !g.broken) });
    if (!d.held && run.energy < 0.35) {
      const orb = ctl.growth.orbs.find(o => o.z > run.distance + 10 && o.z < run.distance + 140);
      const clear = run.gates.every(g => g.broken || g.z + g.h / 2 + 40 < run.distance || g.z - g.h / 2 - 70 > run.distance);
      if (orb && clear && Math.abs(orb.x - run.x) > 6) { d.held = true; d.targetX = orb.x; }
    }
    const ops = decisionToOps(d, run.logicalHeld, lastTarget);
    lastTarget = d.held ? d.targetX : null;
    return { ops, axis: 0 };
  };
}

// 레벨업 때마다 첫 카드를 고르며 진행
function playGrowth(ctl, maxFrames, pick) {
  ctl.start('growth');
  ctl.replaySource = growthDriver(ctl);
  let f = 0;
  const choices = [];
  while (f++ < maxFrames && ctl.state !== 'RESULT') {
    if (ctl.state === 'CHOOSING') { const idx = pick ? pick(ctl.growth.offers) : 0; choices.push(ctl.growth.offers[idx]); ctl.choose(idx); }
    frames(ctl, 1);
  }
  return choices;
}

module.exports = function registerGrowthTests(test) {
  test('성장: 구슬 → 레벨업 → CHOOSING(세계 동결) → 선택 → 준비 시간 → PLAYING', () => {
    const ctl = makeCtl();
    const ev = []; ctl.on(e => ev.push(e));
    ctl.start('growth');
    ctl.replaySource = growthDriver(ctl);
    let f = 0;
    while (ctl.state !== 'CHOOSING' && f++ < 60 * 120 && ctl.state !== 'RESULT') frames(ctl, 1);
    assert.strictEqual(ctl.state, 'CHOOSING', '구슬로 레벨업 도달');
    assert.ok(ev.filter(e => e.type === 'orbCollected').length >= balance.growth.xp.first);
    const lv = ev.find(e => e.type === 'levelUp');
    assert.strictEqual(lv.level, 2);
    assert.strictEqual(lv.offers.length, 3);
    assert.strictEqual(new Set(lv.offers.map(o => o.id)).size, 3, '카드 중복 없음');
    const snap = JSON.stringify([ctl.run.distance, ctl.run.x, ctl.run.radius, ctl.run.energy, ctl.run.logicalHeld]);
    frames(ctl, 120);
    assert.strictEqual(JSON.stringify([ctl.run.distance, ctl.run.x, ctl.run.radius, ctl.run.energy, ctl.run.logicalHeld]), snap, '선택 중 동결');
    ctl.pause('blur'); assert.strictEqual(ctl.state, 'CHOOSING', '선택 화면은 일시정지로 바뀌지 않음');
    assert.strictEqual(ctl.choose(7), null);
    const card = ctl.choose(0);
    assert.ok(card);
    assert.strictEqual(ctl.state, 'RESUME_COUNTDOWN');
    frames(ctl, 61);
    assert.strictEqual(ctl.state, 'PLAYING');
    return `${(f / 60).toFixed(1)}초에 Lv2, 카드: ${lv.offers.map(o => o.id).join(', ')}`;
  });

  test('성장: 능력이 이번 판 수치만 바꾸고 R1 기본 설정은 그대로', () => {
    const before = JSON.stringify(balance);
    const g = balance.growth, base = Growth.baseBalance(balance);
    const eff = Growth.effectiveBalance(base, g, { toughBody: 2, quickRecover: 1, cushion: 1, slideFeet: 3, focus: 1 }, { steelLungs: true }, 1);
    assert.ok(Math.abs(eff.energy.chargePerSecond - balance.energy.chargePerSecond * 0.7) < 1e-12);
    assert.ok(Math.abs(eff.energy.recoverPerSecond - balance.energy.recoverPerSecond * 1.25) < 1e-12);
    assert.ok(Math.abs(eff.spring.releaseImpulsePerEnergy - balance.spring.releaseImpulsePerEnergy * 0.8) < 1e-12);
    assert.ok(Math.abs(eff.player.pointerSpeed - balance.player.pointerSpeed * 1.45) < 1e-12);
    assert.strictEqual(eff.energy.failAt, 1.2);
    assert.deepStrictEqual([eff.spring.heldStiffness, eff.spring.releasedStiffness, eff.spring.heldDamping], [balance.spring.heldStiffness, balance.spring.releasedStiffness, balance.spring.heldDamping], '스프링 공식 계수 불변');
    const run = { passedCount: 0, energy: 0.9 };
    assert.ok(Math.abs(Simulation.currentSpeed(run, eff) - balance.ascent.baseSpeed * 1.1 * 0.8) < 1e-9, '저주 1.1배 × 집중 0.8배');
    assert.strictEqual(Simulation.currentSpeed(run, balance), balance.ascent.baseSpeed, '도전 모드 속도 불변');
    assert.strictEqual(JSON.stringify(balance), before);
    assert.strictEqual(base.generator.gapFloor, 28);
  });

  test('성장: 보호막은 벽 충돌 1회를 막고 벽을 부숨, 두 번째는 실패', () => {
    const b = Growth.baseBalance(balance);
    const run = Simulation.createRun({ balance: b, rulesVersion: 'r1', withGates: false });
    run.shields = 1;
    run.gates.push({ id: 1, z: 40, h: 24, cx: 180, gap: 20, passed: false });
    run.gates.push({ id: 2, z: 200, h: 24, cx: 180, gap: 20, passed: false });
    const ev = [];
    for (let i = 0; i < 600 && run.alive; i++) ev.push(...Simulation.step(run, { ops: [], axis: 0 }, DT, b));
    const broken = ev.filter(e => e.type === 'gateBroken');
    assert.strictEqual(broken.length, 1);
    assert.strictEqual(broken[0].cause, 'shield');
    assert.strictEqual(run.shields, 0);
    assert.ok(!run.alive && run.deathGateId === 2);
    assert.strictEqual(run.passedCount, 1, '부순 벽은 통과로 셈');
  });

  test('성장: 진화 조건을 채우면 진화 카드가 반드시 제시됨', () => {
    const gs = Growth.createGrowth(balance, 1);
    gs.stacks = { toughBody: 2, quickRecover: 2 };
    const run = Simulation.createRun({ balance: gs.balance, rulesVersion: 'r1', withGates: false });
    gs.xp = gs.xpToNext;
    const out = gs.afterStep(run, []);
    const lv = out.find(e => e.type === 'levelUp');
    assert.ok(lv.offers.some(o => o.kind === 'evolution' && o.id === 'steelLungs'));
    const idx = lv.offers.findIndex(o => o.id === 'steelLungs');
    gs.choose(run, idx);
    assert.strictEqual(gs.balance.energy.failAt, 1.2);
  });

  test('성장: 충격파·반동 폭발은 강한 반동에서만 앞의 벽에 작용', () => {
    const gs = Growth.createGrowth(balance, 1);
    gs.stacks = { shockwave: 1 };
    const run = Simulation.createRun({ balance: gs.balance, rulesVersion: 'r1', withGates: false });
    run.gates.push({ id: 1, z: 200, h: 24, cx: 180, gap: 30, passed: false, block: 1 });
    gs.afterStep(run, [{ type: 'release', energy: 0.3 }]);
    assert.strictEqual(run.gates[0].gap, 30, '약한 반동은 효과 없음');
    gs.afterStep(run, [{ type: 'release', energy: 0.6 }]);
    assert.strictEqual(run.gates[0].gap, 34);
    gs.afterStep(run, [{ type: 'release', energy: 0.9 }]);
    assert.strictEqual(run.gates[0].gap, 34, '같은 벽은 한 번만 넓힘');
    gs.evolved.reboundBlast = true;
    const out = gs.afterStep(run, [{ type: 'release', energy: 0.6 }]);
    assert.ok(out.some(e => e.type === 'gateBroken' && e.cause === 'blast'));
    assert.strictEqual(run.passedCount, 1);
  });

  test('성장: 같은 시드·같은 선택이면 같은 결과, 능력을 골라도 코스는 같음', () => {
    const a = makeCtl(null, 777), b = makeCtl(null, 777);
    const ca = playGrowth(a, 60 * 90), cb = playGrowth(b, 60 * 90);
    assert.deepStrictEqual(ca.map(c => c.id), cb.map(c => c.id));
    assert.strictEqual(a.run.distance, b.run.distance);
    const c = makeCtl(null, 777);
    playGrowth(c, 60 * 90, offers => offers.length - 1); // 다른 카드 선택
    const course = ctl => ctl.run.generator.rng.seed;
    const gs = require('../src/generator.js');
    const g1 = gs.createGeneratorState(Growth.baseBalance(balance).generator, 777), g2 = gs.createGeneratorState(Growth.baseBalance(balance).generator, 777);
    const x = [], y = []; gs.fillAhead(g1, x, 5000, Growth.baseBalance(balance).generator); gs.fillAhead(g2, y, 5000, Growth.baseBalance(balance).generator);
    assert.strictEqual(JSON.stringify(x), JSON.stringify(y));
    return `선택 ${ca.length}회: ${ca.map(c => c.id).join(' → ')}`;
  });

  test('성장: 기록은 r1-growth 키로 분리, 도전 모드 기록 영향 없음', () => {
    const store = Save.memoryStore();
    const ctl = makeCtl(store);
    playGrowth(ctl, 60 * 30);
    ctl.replaySource = () => ({ ops: [], axis: 0 }); // 30초 뒤 손을 놓아 판을 끝냄
    let f = 0;
    while (ctl.state !== 'RESULT' && f++ < 60 * 60) { if (ctl.state === 'CHOOSING') ctl.choose(0); frames(ctl, 1); }
    assert.strictEqual(ctl.state, 'RESULT');
    assert.strictEqual(ctl.lastRecord.playMode, 'growth');
    assert.ok(ctl.lastRecord.growth.level >= 1);
    const keys = Object.keys(ctl.profile.records);
    assert.deepStrictEqual(keys, ['r1-growth|' + balance.balanceVersion + '|touch']);
    assert.strictEqual(ctl.getBest('touch', 'challenge'), 0);
    assert.strictEqual(ctl.getBest('touch', 'growth'), ctl.lastRecord.height);
    ctl.primaryAction();
    assert.strictEqual(ctl.mode, 'growth', '다시 하기는 같은 모드');
    return `${ctl.lastRecord.height} m, Lv ${ctl.lastRecord.growth.level}, ${ctl.lastRecord.growth.picks.join(', ')}`;
  });

  test('성장: 키보드 1~3으로 카드 선택', () => {
    const ctl = makeCtl();
    ctl.start('growth');
    ctl.run.distance = 0;
    ctl.growth.xp = ctl.growth.xpToNext;
    ctl.replaySource = () => ({ ops: [], axis: 0 });
    frames(ctl, 2);
    assert.strictEqual(ctl.state, 'CHOOSING');
    assert.ok(ctl.keyDown({ code: 'Digit2' }));
    assert.strictEqual(ctl.state, 'RESUME_COUNTDOWN');
    assert.strictEqual(ctl.growth.picks.length, 1);
  });
};
