// 외형·재화 검사. run-tests.js에서 호출한다.
'use strict';
const assert = require('assert');
const balance = require('../src/balance-r1.js');
const Save = require('../src/save.js');
const GameController = require('../src/game-controller.js');
const Skins = require('../web/skins.js');

const FRAME = 1000 / 60;
function makeCtl(store, seed) {
  const ctl = GameController.createGameController({ balance, store: store || Save.memoryStore(), seed: seed == null ? 5 : seed });
  ctl._now = 1000; ctl.frame(ctl._now);
  return ctl;
}
function frames(ctl, n) { for (let i = 0; i < n; i++) { ctl._now += FRAME; ctl.frame(ctl._now); } }

// 그리는 모든 점을 기록하는 가짜 2D 컨텍스트. clip 중인 그림은 원 밖이어도 잘려 보이지 않으므로 제외한다.
function recordingContext() {
  const pts = [];
  let clipDepth = 0, saveStack = [];
  const push = (x, y, extra) => { if (clipDepth === 0) pts.push({ x, y, extra: extra || 0 }); };
  const grad = { addColorStop() {} };
  return {
    pts,
    save() { saveStack.push(clipDepth); }, restore() { clipDepth = saveStack.pop() || 0; },
    clip() { clipDepth++; },
    beginPath() {}, closePath() {}, fill() {}, stroke() {},
    moveTo(x, y) { push(x, y); }, lineTo(x, y) { push(x, y); },
    quadraticCurveTo(cx, cy, x, y) { push(cx, cy); push(x, y); },
    arc(x, y, r) { push(x, y, r); },
    ellipse(x, y, rx, ry, rot) { // 회전을 반영해 둘레의 점을 표본으로 기록
      const c = Math.cos(rot || 0), s = Math.sin(rot || 0);
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
        push(x + ex * c - ey * s, y + ex * s + ey * c);
      }
    },
    fillRect(x, y, w, h) { push(x, y); push(x + w, y + h); },
    createRadialGradient() { return grad; }, createLinearGradient() { return grad; },
    set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {}, set lineCap(v) {}, set lineJoin(v) {}
  };
}

module.exports = function registerSkinTests(test) {
  test('외형: 설정의 모든 스킨에 그림이 있고, 그림은 판정 원 × 1.03 안', () => {
    const ids = balance.cosmetics.skins.map(s => s.id);
    assert.deepStrictEqual(ids.filter(id => Skins.ids.indexOf(id) < 0), [], '그림 없는 스킨');
    let worst = 0, worstId = '';
    const states = [
      { held: false, energy: 0, dead: false, danger: 0, expanded: false },
      { held: true, energy: 0.9, dead: false, danger: 0.8, expanded: false },
      { held: false, energy: 0.3, dead: true, danger: 0, expanded: false },
      { held: false, energy: 0, dead: false, danger: 0, expanded: true, blink: true }
    ];
    for (const id of ids) for (const r of [9, 24, 40, 60]) for (const st of states) for (const now of [0, 1234, 5678]) {
      const ctx = recordingContext();
      Skins.paint(id, Object.assign({ ctx, x: 100, y: 100, r, now, wob: 0.025, phase: now / 140, look: 1 }, st));
      for (const p of ctx.pts) {
        const d = (Math.hypot(p.x - 100, p.y - 100) + p.extra) / r;
        if (d > worst) { worst = d; worstId = id; }
      }
    }
    assert.ok(worst <= 1.031, `${worstId}: ${worst.toFixed(3)}r`);
    return `${ids.length}종 × 반지름 4 × 상태 4, 가장 바깥 ${worst.toFixed(3)}r (${worstId})`;
  });

  test('외형: 판 보상 = min(최대, 통과 수 ÷ perPassed), 판마다 한 번만', () => {
    const RW = balance.cosmetics.reward;
    const store = Save.memoryStore();
    const ctl = makeCtl(store);
    ctl.start('challenge');
    ctl.run.passedCount = 17; // 보상 계산만 확인
    ctl.replaySource = () => ({ ops: [], axis: 0 });
    let f = 0; while (ctl.state !== 'RESULT' && f++ < 2000) frames(ctl, 1);
    assert.strictEqual(ctl.lastRecord.coinsEarned, Math.min(RW.max, Math.floor(ctl.lastRecord.passed / RW.perPassed)));
    const coins = ctl.coins();
    frames(ctl, 200);
    assert.strictEqual(ctl.coins(), coins, '같은 판 보상 중복 없음');
    assert.strictEqual(Save.load(store).profile.softCurrency, coins, '저장됨');
    ctl.start('challenge'); ctl.run.passedCount = 300;
    f = 0; while (ctl.state !== 'RESULT' && f++ < 2000) frames(ctl, 1);
    assert.strictEqual(ctl.lastRecord.coinsEarned, RW.max, '한 판 최대');
    // 튜토리얼은 보상 없음
    const before = ctl.coins(); ctl.startTutorial(); frames(ctl, 600); ctl.pause('x'); ctl.exitToMenu();
    assert.strictEqual(ctl.coins(), before);
    return `통과 17→${Math.floor(17 / RW.perPassed)}별, 300→${RW.max}별`;
  });

  test('외형: 구매·장착 — 부족하면 실패, 사면 차감·해금·즉시 장착, 저장 후 복원', () => {
    const store = Save.memoryStore();
    const ctl = makeCtl(store);
    assert.deepStrictEqual(ctl.skinCatalog().filter(k => k.owned).map(k => k.id), ['base']);
    assert.strictEqual(ctl.buySkin('slime'), 'insufficient');
    assert.strictEqual(ctl.equipSkin('slime'), false, '잠긴 스킨 장착 불가');
    const price = balance.cosmetics.skins.find(k => k.id === 'slime').price;
    ctl.profile.softCurrency = price + 20;
    assert.strictEqual(ctl.buySkin('slime'), 'ok');
    assert.strictEqual(ctl.coins(), 20);
    assert.strictEqual(ctl.equippedSkin(), 'slime');
    assert.strictEqual(ctl.buySkin('slime'), 'owned');
    assert.strictEqual(ctl.buySkin('dragon'), 'unknown');
    assert.ok(ctl.equipSkin('base'));
    const again = makeCtl(store);
    assert.deepStrictEqual(again.profile.cosmetics, { unlocked: ['base', 'slime'], equipped: 'base' });
    assert.strictEqual(again.coins(), 20);
    // 설정 변경(검증 재실행)이 해금 목록을 지우지 않음
    again.updateSettings({ sfx: false });
    assert.deepStrictEqual(again.profile.cosmetics.unlocked, ['base', 'slime']);
  });

  test('외형: 가격은 기본(0)부터 오름차순, 이름은 두 언어 모두 있음', () => {
    const skins = balance.cosmetics.skins;
    assert.strictEqual(skins[0].id, 'base'); assert.strictEqual(skins[0].price, 0);
    for (let i = 1; i < skins.length; i++) assert.ok(skins[i].price > skins[i - 1].price, skins[i].id + ' 가격 순서');
    global.KKUK = global.KKUK || {};
    require('../web/strings.ko.js'); require('../web/strings.en.js');
    for (const lang of ['ko', 'en']) for (const k of skins) assert.ok(global.KKUK.stringsByLang[lang].skinNames[k.id], lang + ' 이름 없음: ' + k.id);
    const total = skins.reduce((a, k) => a + k.price, 0);
    return `${skins.length}종, 전체 ${total}별(한 판 최대 ${balance.cosmetics.reward.max}별)`;
  });

  test('외형: 스킨은 게임 계산에 영향 없음(같은 시드·입력이면 결과 동일)', () => {
    const results = ['base', 'glass'].map(skin => {
      const ctl = makeCtl(null, 77);
      ctl.profile.cosmetics.unlocked = ['base', 'glass']; ctl.equipSkin(skin);
      ctl.start('challenge');
      let t = 0;
      ctl.replaySource = (tick) => ({ ops: tick % 90 === 20 ? [{ type: 'hold', value: true }] : tick % 90 === 50 ? [{ type: 'hold', value: false }] : [], axis: 0 });
      while (ctl.state === 'PLAYING' && t++ < 3000) frames(ctl, 1);
      return JSON.stringify([ctl.run.tick, ctl.run.distance, ctl.run.x, ctl.run.radius, ctl.run.energy, ctl.run.passedCount]);
    });
    assert.strictEqual(results[0], results[1]);
  });
};
