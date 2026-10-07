// 튜토리얼·설정 검사. run-tests.js에서 호출한다.
'use strict';
const assert = require('assert');
const balance = require('../src/balance-r1.js');
const balanceR0 = require('../src/balance-r0.js');
const Simulation = require('../src/simulation.js');
const Save = require('../src/save.js');
const Tutorial = require('../src/tutorial.js');
const GameController = require('../src/game-controller.js');
const { createAutopilot } = require('./autopilot.js');

const FRAME = 1000 / 60;
function makeCtl(store) {
  const ctl = GameController.createGameController({ balance, store: store || Save.memoryStore(), seed: 1 });
  ctl._now = 1000; ctl.frame(ctl._now);
  return ctl;
}
function frames(ctl, n) { for (let i = 0; i < n; i++) { ctl._now += FRAME; ctl.frame(ctl._now); } }

// 터치 API만 사용하는 튜토리얼 진행 스크립트
function playTutorial(ctl, maxFrames) {
  const bot = createAutopilot(balance);
  let pressed = false, anchorWorld = 0, f = 0;
  const down = () => { if (!pressed) { ctl.pointerDown({ pointerId: 1, clientX: 0, surfaceWidth: 360 }); anchorWorld = ctl.run.x; pressed = true; } };
  const up = () => { if (pressed) { ctl.pointerUp({ pointerId: 1 }); pressed = false; } };
  while (ctl.mode === 'tutorial' && f++ < maxFrames) {
    const t = ctl.tutorial, run = ctl.run;
    if (t.step === 'press') { if (f % 40 < 15) down(); else up(); }
    else if (t.step === 'drag') { down(); ctl.pointerMove({ pointerId: 1, clientX: t.zone().x - anchorWorld }); }
    else if (t.step === 'gate') {
      const d = bot({ distance: run.distance, x: run.x, energy: run.energy, held: run.logicalHeld, speed: Simulation.currentSpeed(run, Tutorial.practiceBalance(balance)), gates: run.gates });
      if (d.held) { down(); ctl.pointerMove({ pointerId: 1, clientX: d.targetX - anchorWorld }); } else up();
    } else if (t.step === 'energy') { if (!t.energyPeaked) down(); else up(); }
    frames(ctl, 1);
  }
  up();
  return f;
}

module.exports = function registerTutorialTests(test) {
  test('튜토리얼: 5단계를 순서대로 완료 → 완료 저장, 기록 없음', () => {
    const store = Save.memoryStore();
    const ctl = makeCtl(store);
    const steps = []; ctl.on(e => { if (e.type === 'tutorialStep' || e.type === 'tutorialDone') steps.push(e.step); });
    assert.ok(ctl.needsTutorial());
    ctl.startTutorial();
    assert.strictEqual(ctl.phase(), 'TUTORIAL');
    const used = playTutorial(ctl, 60 * 120);
    assert.deepStrictEqual(steps, ['press', 'drag', 'gate', 'energy', 'done']);
    assert.strictEqual(ctl.state, 'READY');
    assert.strictEqual(ctl.mode, 'challenge');
    assert.deepStrictEqual(ctl.profile.records, {});
    assert.strictEqual(Save.load(store).profile.tutorialCompleted, true);
    assert.ok(!makeCtl(store).needsTutorial());
    return `${(used / 60).toFixed(1)}초에 완료`;
  });

  test('튜토리얼: 틈에 부딪히면 결과 화면 없이 같은 단계 재시도', () => {
    const ctl = makeCtl();
    const ev = []; ctl.on(e => ev.push(e));
    ctl.startTutorial();
    playTutorialUntil(ctl, 'gate');
    let f = 0;
    while (!ev.some(e => e.type === 'tutorialRetry') && f++ < 600) frames(ctl, 1); // 아무것도 안 하면 충돌
    const retry = ev.find(e => e.type === 'tutorialRetry');
    assert.ok(retry && retry.step === 'gate');
    assert.ok(!ev.some(e => e.type === 'death' || e.type === 'result'));
    assert.strictEqual(ctl.state, 'PLAYING');
    assert.strictEqual(ctl.tutorial.step, 'gate');
    assert.strictEqual(ctl.run.gates.length, 1, '틈을 다시 배치');
    assert.strictEqual(ctl.run.energy, 0);
  });

  test('튜토리얼: 연습 설정은 상승 속도만 다르고 물리는 R1과 동일, 무작위 생성 없음', () => {
    const p = Tutorial.practiceBalance(balance);
    assert.deepStrictEqual(p.spring, balance.spring);
    assert.deepStrictEqual(p.energy, balance.energy);
    assert.deepStrictEqual(p.player, balance.player);
    assert.strictEqual(Simulation.currentSpeed({ passedCount: 50 }, p), balance.tutorial.ascentSpeed);
    const ctl = makeCtl(); ctl.startTutorial(); frames(ctl, 600);
    assert.ok(ctl.run.gates.every(g => g.practice));
  });

  test('튜토리얼: 건너뛰기·재보기, 일시정지 후 재개 시 단계 유지', () => {
    const ctl = makeCtl();
    ctl.startTutorial(); frames(ctl, 5);
    ctl.pause('button'); assert.strictEqual(ctl.state, 'PAUSED');
    ctl.resume(); frames(ctl, 70);
    assert.strictEqual(ctl.phase(), 'TUTORIAL');
    ctl.pause('button'); ctl.exitToMenu();
    assert.strictEqual(ctl.state, 'READY');
    ctl.skipTutorial();
    assert.ok(!ctl.needsTutorial());
    assert.ok(ctl.startTutorial(), '재보기 가능');
    assert.strictEqual(GameController.createGameController({ balance: balanceR0 }).startTutorial(), false, 'R0에는 튜토리얼 없음');
  });

  test('설정: 변경 즉시 저장·복원, 잘못된 값은 기본값', () => {
    const store = Save.memoryStore();
    const ctl = makeCtl(store);
    ctl.updateSettings({ sfx: false, haptics: false, reducedEffects: true, language: 'en' });
    const again = makeCtl(store);
    assert.deepStrictEqual(again.profile.settings, { sfx: false, bgm: true, haptics: false, reducedEffects: true, language: 'en' });
    again.updateSettings({ language: 'xx', bgm: 'loud' });
    assert.strictEqual(again.profile.settings.language, 'ko');
    assert.strictEqual(again.profile.settings.bgm, true);
  });
};

function playTutorialUntil(ctl, step) {
  let f = 0, pressed = false, anchor = 0;
  while (ctl.tutorial.step !== step && f++ < 60 * 60) {
    const t = ctl.tutorial;
    if (t.step === 'press') {
      if (f % 40 < 15 && !pressed) { ctl.pointerDown({ pointerId: 1, clientX: 0, surfaceWidth: 360 }); pressed = true; }
      if (f % 40 >= 15 && pressed) { ctl.pointerUp({ pointerId: 1 }); pressed = false; }
    } else if (t.step === 'drag') {
      if (!pressed) { ctl.pointerDown({ pointerId: 1, clientX: 0, surfaceWidth: 360 }); anchor = ctl.run.x; pressed = true; }
      ctl.pointerMove({ pointerId: 1, clientX: t.zone().x - anchor });
    }
    frames(ctl, 1);
  }
  if (pressed) ctl.pointerUp({ pointerId: 1 });
  frames(ctl, 1);
}
