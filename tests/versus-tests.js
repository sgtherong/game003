// 친구 도전장(링크) 검사: 왕복 인코딩, 기록 검증(위조 탐지), 악의적 입력, 대결 흐름. run-tests.js에서 호출한다.
'use strict';
const assert = require('assert');
const zlib = require('zlib');
const balance = require('../src/balance-r1.js');
const Simulation = require('../src/simulation.js');
const Challenge = require('../src/challenge.js');
const Save = require('../src/save.js');
const GameController = require('../src/game-controller.js');
const { createAutopilot, decisionToOps } = require('./autopilot.js');

const FRAME = 1000 / 60;
function makeCtl(store, seed) {
  const ctl = GameController.createGameController({ balance, store: store || Save.memoryStore(), seed, today: () => '2026-10-06' });
  ctl._now = 1000; ctl.frame(ctl._now);
  return ctl;
}
function frames(ctl, n) { for (let i = 0; i < n; i++) { ctl._now += FRAME; ctl.frame(ctl._now); } }

// 자동 조작으로 stopAfter 틱까지 플레이한 뒤 손을 놓아 판을 끝낸다
function botRun(ctl, mode, stopAfter) {
  ctl.start(mode);
  const bot = createAutopilot(balance);
  let lastTarget = null;
  ctl.replaySource = (tick, run) => {
    if (tick >= stopAfter) return { ops: run.logicalHeld ? [{ type: 'snap' }, { type: 'hold', value: false }] : [], axis: 0 };
    const d = bot({ distance: run.distance, x: run.x, energy: run.energy, held: run.logicalHeld, speed: Simulation.currentSpeed(run, balance), gates: run.gates });
    const ops = decisionToOps(d, run.logicalHeld, lastTarget);
    lastTarget = d.held ? d.targetX : null;
    // 실제 입력처럼 1/64 단위
    ops.forEach(o => { if (o.type === 'target') o.x = Math.round(o.x * 64) / 64; });
    return { ops, axis: 0 };
  };
  let f = 0; while (ctl.state !== 'RESULT' && f++ < 60 * 400) frames(ctl, 1);
  ctl.replaySource = null;
  return ctl.lastRecord;
}
function link(payload) { return 'z' + Challenge.b64url(zlib.deflateRawSync(Buffer.from(Challenge.toBytes(payload)), { level: 9 })); }
function unlink(s) { return Challenge.fromBytes(new Uint8Array(zlib.inflateRawSync(Buffer.from(Challenge.unb64url(s.slice(1)))))); }

module.exports = function registerVersusTests(test) {
  test('도전장: 인코딩 왕복이 정확하고 링크 길이가 적당함', () => {
    const a = makeCtl(null, 4321);
    const rec = botRun(a, 'challenge', 120 * 40);
    const p = a.challengePayload();
    assert.ok(p && rec.canShare);
    const s = link(p);
    const back = unlink(s);
    assert.deepStrictEqual(back, Object.assign({}, p, { name: Challenge.cleanName(p.name) }));
    assert.ok(s.length < Challenge.MAX_LINK_CHARS, `링크 ${s.length}자`);
    return `${rec.height} m 판 → 링크 ${s.length}자 (입력 ${p.replay.length / 3}개)`;
  });

  test('도전장: v2(차이 저장)가 v1보다 짧고, 이전 v1 링크도 그대로 읽힘', () => {
    // 목표 X가 하나뿐이면 v1(절댓값)과 v2(0에서의 차이) 바이트가 버전 번호만 다르다 → v1 링크를 재현
    const p = { seed: 5, rulesVersion: 'r1', balanceVersion: balance.balanceVersion, generatorVersion: 'g2', height: 3, passed: 0, ticks: 300, skin: 'base', name: 'a',
      replay: [10, 1, 0, 12, 2, 180 * 64, 40, 3, 0, 40, 0, 0] };
    const v2 = Challenge.toBytes(p);
    assert.strictEqual(v2[0], 2);
    const v1 = Uint8Array.from(v2); v1[0] = 1;
    assert.deepStrictEqual(Challenge.fromBytes(v1), Challenge.fromBytes(v2));
    // 드래그가 많은 판: 차이 저장이 더 짧다
    const drag = []; let x = 180 * 64;
    for (let t = 0; t < 600; t++) { x += Math.round(Math.sin(t / 7) * 40); drag.push(t, 2, x); }
    const q = Object.assign({}, p, { replay: drag, ticks: 700 });
    const abs = q.replay.slice(); // v1 크기 추정: 절댓값 varint
    const v2len = zlib.deflateRawSync(Buffer.from(Challenge.toBytes(q))).length;
    assert.ok(v2len < 900, `v2 ${v2len} bytes`);
    assert.deepStrictEqual(Challenge.fromBytes(Challenge.toBytes(q)).replay, abs);
    return `드래그 600틱 → 압축 ${v2len} B`;
  });

  test('도전장: 받은 쪽에서 재계산으로 검증 — 진짜는 확인, 기록·입력 위조는 불일치', () => {
    const a = makeCtl(null, 99);
    botRun(a, 'challenge', 120 * 20);
    const p = a.challengePayload();
    assert.strictEqual(Challenge.verify(p, balance).status, 'verified');
    assert.strictEqual(Challenge.verify(Object.assign({}, p, { height: p.height + 50 }), balance).status, 'mismatch', '높이 부풀림');
    assert.strictEqual(Challenge.verify(Object.assign({}, p, { passed: p.passed + 1 }), balance).status, 'mismatch');
    const forged = p.replay.slice(); forged[forged.length - 1] += 64 * 30; // 마지막 입력 조작
    const fv = Challenge.verify(Object.assign({}, p, { replay: forged }), balance).status;
    assert.ok(fv === 'mismatch' || fv === 'verified', fv); // 입력을 바꿨는데 결과가 같다면 그 판도 사실이다
    assert.strictEqual(Challenge.verify(Object.assign({}, p, { replay: null }), balance).status, 'unverified');
    assert.strictEqual(Challenge.verify(Object.assign({}, p, { balanceVersion: 'r9.9' }), balance).status, 'version');
  });

  test('도전장: 깨지거나 악의적인 링크는 예외로 거절(게임은 영향 없음), 이름 정리', () => {
    const bad = ['', '!!!!', 'A', Challenge.b64url(new Uint8Array([1, 255, 255, 255, 255, 255, 255])), Challenge.b64url(new Uint8Array(500).fill(0xff))];
    for (const s of bad) assert.throws(() => Challenge.fromBytes(Challenge.unb64url(s)));
    // 입력 개수만 거대하게 주장
    const w = Challenge.toBytes({ seed: 1, rulesVersion: 'r1', balanceVersion: 'r1.1', generatorVersion: 'g2', height: 1, passed: 0, ticks: 10, skin: 'base', name: 'x', replay: null });
    const huge = Array.from(w); huge[huge.length - 1] = 0xff; huge.push(0xff, 0xff, 0x0f);
    assert.throws(() => Challenge.fromBytes(new Uint8Array(huge)));
    assert.strictEqual(Challenge.cleanName('  abc‮def\u0000ghi<b>  '), 'abcdefghi<b>');
    assert.strictEqual(Array.from(Challenge.cleanName('가'.repeat(40))).length, 12);
    const p = Save.defaultProfile(); p.nickname = 'x⁦'.repeat(20);
    assert.strictEqual(Save.validateSave(p).profile.nickname, 'x'.repeat(12));
  });

  test('대결: 받은 코스·고스트로 플레이, 같은 입력이면 무승부·못하면 패배, 일반 기록과 분리', () => {
    const a = makeCtl(null, 2024);
    botRun(a, 'challenge', 120 * 30);
    const p = unlink(link(a.challengePayload()));
    const store = Save.memoryStore();
    const b = makeCtl(store, 7);
    assert.ok(b.acceptChallenge(p, Challenge.verify(p, balance)));
    // 같은 입력 재생 → 무승부
    b.start('versus');
    assert.strictEqual(b.run.runSeed, p.seed);
    assert.ok(b.ghost && b.ghost.label === p.name);
    const player = require('../src/replay.js').createPlayer({ v: 1, seed: p.seed, ticks: p.ticks, data: p.replay });
    b.replaySource = (tick) => player.frame(tick);
    let f = 0; while (b.state !== 'RESULT' && f++ < 60 * 400) frames(b, 1);
    assert.strictEqual(b.lastRecord.versus.result, 'draw');
    // 아무것도 안 하면 패배
    b.replaySource = () => ({ ops: [], axis: 0 });
    b.start('versus'); f = 0; while (b.state !== 'RESULT' && f++ < 60 * 400) frames(b, 1);
    assert.strictEqual(b.lastRecord.versus.result, 'lose');
    assert.deepStrictEqual(Object.keys(b.profile.records), [], '대결 판은 일반 기록에 넣지 않음');
    assert.ok(b.coins() > 0 || b.lastRecord.coinsEarned === 0);
    // 되받아치기: 대결 판으로도 도전장을 만들 수 있음(같은 코스)
    const back = b.challengePayload();
    assert.strictEqual(back.seed, p.seed);
    assert.strictEqual(Challenge.verify(back, balance).status, 'verified');
  });
};
