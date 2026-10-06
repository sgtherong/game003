// 아슬아슬·과감한 반동·미션 검사. run-tests.js에서 호출한다.
'use strict';
const assert = require('assert');
const balance = require('../src/balance-r1.js');
const Simulation = require('../src/simulation.js');
const Feats = require('../src/feats.js');
const Missions = require('../src/missions.js');
const Save = require('../src/save.js');
const GameController = require('../src/game-controller.js');

const DT = balance.world.fixedStepSeconds;
const FRAME = 1000 / 60;

// 캐릭터(손대지 않으면 반지름 24 → 판정 23)가 중앙으로 지나가며 틈 가장자리와의 간격이 margin이 되도록 배치
function passThrough(margin, extraGates, ticks) {
  const run = Simulation.createRun({ balance, rulesVersion: 'r1', withGates: false });
  const halfGap = (balance.player.baseRadius - balance.player.collisionInset) + margin;
  run.gates.push({ id: 1, z: 120, h: 24, cx: 180, gap: halfGap * 2, kind: 'short', block: 1, passed: false });
  (extraGates || []).forEach(g => run.gates.push(g));
  const tr = Feats.createFeatTracker(balance);
  const out = [];
  for (let i = 0; i < (ticks || 400) && run.alive; i++) out.push(...tr.observe(run, Simulation.step(run, { ops: [], axis: 0 }, DT, balance), DT));
  return { run, tr, out };
}

module.exports = function registerFeatTests(test) {
  test('아슬아슬: 벽과 간격 < 3이면 판정, 넉넉하면 없음(점수 영향 없음)', () => {
    const close = passThrough(2);
    assert.ok(close.run.alive);
    assert.strictEqual(close.out.filter(e => e.type === 'nearMiss').length, 1);
    assert.ok(Math.abs(close.out.find(e => e.type === 'nearMiss').margin - 2) < 0.6);
    const roomy = passThrough(5);
    assert.strictEqual(roomy.out.filter(e => e.type === 'nearMiss').length, 0);
    assert.strictEqual(close.run.passedCount, roomy.run.passedCount, '통과 수(점수)는 같음');
  });

  test('과감한 반동: 에너지 85% 이상에서 떼고 1초 생존하면 1회', () => {
    const run = Simulation.createRun({ balance, rulesVersion: 'r1', withGates: false });
    const tr = Feats.createFeatTracker(balance);
    const out = [];
    let i = 0;
    out.push(...tr.observe(run, Simulation.step(run, { ops: [{ type: 'hold', value: true }], axis: 0 }, DT, balance), DT));
    while (run.energy < 0.86) out.push(...tr.observe(run, Simulation.step(run, { ops: [], axis: 0 }, DT, balance), DT));
    out.push(...tr.observe(run, Simulation.step(run, { ops: [{ type: 'hold', value: false }], axis: 0 }, DT, balance), DT));
    for (i = 0; i < 100; i++) out.push(...tr.observe(run, Simulation.step(run, { ops: [], axis: 0 }, DT, balance), DT));
    assert.strictEqual(out.filter(e => e.type === 'riskyRelease').length, 0, '1초 전에는 아직');
    for (i = 0; i < 40; i++) out.push(...tr.observe(run, Simulation.step(run, { ops: [], axis: 0 }, DT, balance), DT));
    assert.strictEqual(tr.stats.riskyRelease, 1);
  });

  test('연속 틈은 두 띠를 모두 지나야 1회, 긴 틈 집계', () => {
    const half = balance.player.baseRadius + 10;
    const r = passThrough(10, [
      { id: 2, z: 300, h: 24, cx: 180, gap: half * 2, kind: 'double', block: 2, passed: false },
      { id: 3, z: 402, h: 24, cx: 180, gap: half * 2, kind: 'double', block: 2, passed: false },
      { id: 4, z: 600, h: 72, cx: 180, gap: half * 2, kind: 'long', block: 3, passed: false }
    ], 1400);
    assert.strictEqual(r.tr.stats.doublePassed, 1);
    assert.strictEqual(r.tr.stats.longPassed, 1);
  });

  test('미션: 누적·최고값 진행, 달성 시 별 지급·단계 상승·항상 3개 유지', () => {
    const cfg = balance.missions;
    const st = Missions.ensureActive(Missions.emptyState(), cfg);
    assert.strictEqual(st.active.length, 3);
    assert.strictEqual(new Set(st.active.map(a => a.id)).size, 3);
    const first = Missions.describe(st, cfg)[0];
    const def = cfg.pool.find(d => d.id === first.id);
    const big = { height: 9999, passed: 9999, nearMiss: 99, doublePassed: 99, longPassed: 99, riskyRelease: 99, growthLevel: 99, runs: 99 };
    const done = Missions.applyRun(st, cfg, big);
    assert.strictEqual(done.length, 3, '셋 다 달성');
    assert.strictEqual(st.active.length, 3, '새 미션으로 채움');
    assert.strictEqual(st.tiers[first.id], 1);
    assert.strictEqual(done.find(d => d.id === first.id).reward, def.rewards[0]);
    // 최고값 미션은 판마다 합산하지 않음
    const s2 = { active: [{ id: 'height', progress: 0 }], done: 0, tiers: {} };
    Missions.applyRun(s2, Object.assign({}, cfg, { activeCount: 1 }), { height: 60 });
    Missions.applyRun(s2, Object.assign({}, cfg, { activeCount: 1 }), { height: 50 });
    assert.strictEqual(s2.active[0].progress, 60);
    return done.map(d => d.id + ' +' + d.reward).join(', ');
  });

  test('미션: 판이 끝나면 반영·별 지급·저장, 알 수 없는 미션은 검증에서 제거', () => {
    const store = Save.memoryStore();
    const ctl = GameController.createGameController({ balance, store, seed: 3 });
    ctl._now = 1000; ctl.frame(ctl._now);
    const before = ctl.missionList();
    assert.strictEqual(before.length, 3);
    ctl.start('challenge');
    ctl.replaySource = () => ({ ops: [], axis: 0 });
    let f = 0; while (ctl.state !== 'RESULT' && f++ < 3000) { ctl._now += FRAME; ctl.frame(ctl._now); }
    const rec = ctl.lastRecord;
    assert.ok(rec.stats && rec.stats.runs === 1);
    const runsMission = before.find(m => m.id === 'runs');
    if (runsMission) assert.strictEqual(ctl.missionList().find(m => m.id === 'runs').progress, 1);
    const expected = rec.coinsEarned + rec.missionsDone.reduce((s, d) => s + d.reward, 0);
    assert.strictEqual(ctl.coins(), expected);
    const saved = Save.load(store).profile.missions;
    assert.deepStrictEqual(saved.active.map(a => a.id), ctl.profile.missions.active.map(a => a.id));
    const bad = JSON.parse(JSON.stringify(ctl.profile));
    bad.missions.active.push({ id: 'hack', progress: 5 }, { id: 'runs', progress: NaN });
    const v = Save.validateSave(bad);
    assert.ok(!v.profile.missions.active.some(a => a.id === 'hack' || Number.isNaN(a.progress)));
  });
};
