// GameController — 상태 머신 + 고정 간격 루프. 화면 표시는 하지 않는다.
// 상태: READY → PLAYING ⇄ PAUSED → RESUME_COUNTDOWN → PLAYING, PLAYING → DEAD → RESULT → PLAYING
// 물리 업데이트 루프는 이 컨트롤러의 frame() 하나뿐이다(엔진 프레임에서 한 번만 호출).
//
// 규칙 버전별 차이
//   r0: 기준 시제품 동작 그대로(비교·회귀용).
//   r1: FIX-01 저장 / FIX-02 압축 보존 / FIX-03 취소=일시정지 / FIX-05 입력 방식별 기록
//       FIX-06 정지·지연 정책 / FIX-07 실행별 시드 / FIX-08 재개 준비 시간
//       + 튜토리얼(mode 'tutorial': 같은 상태 머신, 기록하지 않음) + 설정 저장
//       + 성장 모드(mode 'growth': 레벨업 시 CHOOSING → 카드 선택 → RESUME_COUNTDOWN, 기록 키 'r1-growth')
//       + 외형(명세서 16.2): 판 보상 재화, 구매·장착. 외형은 Simulation에 전달되지 않는다(판정·속도·반동 동일).
//       + 오늘의 도전(mode 'daily'): 날짜 시드 코스, 별도 최고 기록, 오늘 최고 판의 입력 재생 고스트.
//       + 친구 도전장(mode 'versus'): 받은 링크의 코스·고스트로 대결. 일반 기록에는 섞지 않는다.
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var Simulation = isNode ? require('./simulation.js') : root.KKUK.Simulation;
  var InputAdapter = isNode ? require('./input-adapter.js') : root.KKUK.InputAdapter;
  var Save = isNode ? require('./save.js') : root.KKUK.Save;
  var Tutorial = isNode ? require('./tutorial.js') : root.KKUK.Tutorial;
  var Growth = isNode ? require('./growth.js') : root.KKUK.Growth;
  var Feats = isNode ? require('./feats.js') : root.KKUK.Feats;
  var Missions = isNode ? require('./missions.js') : root.KKUK.Missions;
  var Replay = isNode ? require('./replay.js') : root.KKUK.Replay;
  var Challenge = isNode ? require('./challenge.js') : root.KKUK.Challenge;
  var mod = factory(Simulation, InputAdapter, Save, Tutorial, Growth, Feats, Missions, Replay, Challenge);
  if (isNode) module.exports = mod;
  else { root.KKUK = root.KKUK || {}; root.KKUK.GameController = mod; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Simulation, InputAdapter, Save, Tutorial, Growth, Feats, Missions, Replay, Challenge) {
  'use strict';

  var DEAD_FEEDBACK_SECONDS = 0.55; // DEAD → RESULT 짧은 피드백(재시작은 즉시 가능)
  var EPS = 1e-9;
  var MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'];

  function defaultRandomSeed() {
    try {
      var a = new Uint32Array(1);
      (globalThis.crypto || require('crypto').webcrypto).getRandomValues(a);
      return a[0];
    } catch (e) {
      return Math.floor(Math.random() * 4294967296) >>> 0;
    }
  }

  // opts: { balance, rulesVersion?, seed?, store?, randomSeed?, nowIso? }
  function createGameController(opts) {
    var balance = opts.balance;
    var rules = opts.rulesVersion || (balance.generator.version ? Simulation.RULES_R1 : Simulation.RULES_R0);
    var r1 = rules !== Simulation.RULES_R0;
    var w = balance.world;
    var dtFixed = w.fixedStepSeconds;
    var balanceVersion = balance.balanceVersion || balance.profile;
    var input = InputAdapter.createInputAdapter(balance, { cancelAsRelease: !r1 });
    var store = opts.store || null;
    var randomSeed = opts.randomSeed || defaultRandomSeed;
    var nowIso = opts.nowIso || function () { return new Date().toISOString(); };
    var listeners = [];
    var runCounter = 0;

    var cosmetics = balance.cosmetics || null;
    if (cosmetics) Save.registerCosmetics(cosmetics.skins.map(function (k) { return k.id; })); // 저장 검증 전에 등록
    var missionCfg = balance.missions || null;
    if (missionCfg) Save.registerMissions(missionCfg.pool.map(function (d) { return d.id; }));
    var loaded = store ? Save.load(store) : { profile: Save.defaultProfile(), source: 'memory', repaired: [] };

    var ctl = {
      rulesVersion: rules,
      balanceVersion: balanceVersion,
      state: 'READY',
      run: null,
      profile: loaded.profile,
      loadInfo: { source: loaded.source, repaired: loaded.repaired },
      lastRecord: null,
      input: input,
      acc: 0,
      lastNow: 0,
      deadTimer: 0,
      countdown: 0,
      mode: 'challenge',   // 'challenge' | 'tutorial' | 'growth'
      tutorial: null,
      growth: null,
      lastPlayMode: 'challenge',
      replaySource: null // 입력 틱 리플레이(테스트·재현용). 지정 시 실제 입력 대신 사용
    };

    function seedForRun() {
      if (opts.seed != null) return opts.seed;
      return r1 && balance.generator.randomSeedPerRun ? randomSeed() : balance.generator.seed;
    }
    ctl.run = Simulation.createRun({ balance: balance, seed: seedForRun(), rulesVersion: rules, runId: 'run-0' });
    if (missionCfg) Missions.ensureActive(ctl.profile.missions, missionCfg);
    ctl.feats = null;
    ctl.missionList = function () { return missionCfg ? Missions.describe(ctl.profile.missions, missionCfg) : []; };

    function emit(ev) { for (var i = 0; i < listeners.length; i++) listeners[i](ev, ctl); }
    ctl.on = function (fn) { listeners.push(fn); return function () { listeners.splice(listeners.indexOf(fn), 1); }; };

    // ── 기록(FIX-01/05) ──
    ctl.displayMode = function () {
      if (ctl.state === 'PLAYING' || ctl.state === 'PAUSED' || ctl.state === 'RESUME_COUNTDOWN') {
        var m = input.inputMode();
        if (m !== 'touch' || input.hasPointer() || ctl.run.tick > 0) return m;
      }
      return ctl.profile.lastInputMode || 'touch';
    };
    var hasGrowth = r1 && !!balance.growth;
    function recordRules(playMode) { return playMode === 'growth' ? rules + '-' + balance.growth.rulesTag : rules; }
    ctl.getBest = function (mode, playMode) {
      var pm = playMode || (ctl.mode === 'tutorial' ? ctl.lastPlayMode : ctl.mode);
      if (pm === 'daily') { var di = ctl.dailyInfo(); return di && di.best ? di.best.height : 0; }
      if (pm === 'versus') return ctl.versus ? ctl.versus.height : 0;
      var rec = Save.getRecord(ctl.profile, recordRules(pm), balanceVersion, mode || ctl.displayMode());
      return rec ? rec.height : 0;
    };
    Object.defineProperty(ctl, 'best', { get: function () { return ctl.getBest(); } });

    ctl.saveProfile = function () { return store ? Save.save(store, ctl.profile) : false; };

    // 명세서의 상태 이름(TUTORIAL 포함)으로 현재 상태를 돌려준다.
    ctl.phase = function () { return ctl.mode === 'tutorial' && ctl.state === 'PLAYING' ? 'TUTORIAL' : ctl.state; };
    ctl.hasGrowth = function () { return hasGrowth; };
    // 현재 판에 적용 중인 설정(성장 모드는 능력이 덧씌워진 설정)
    ctl.activeBalance = function () { return ctl.mode === 'growth' && ctl.growth ? ctl.growth.balance : ctl.mode === 'tutorial' ? practice : balance; };

    // ── 설정 ──
    ctl.updateSettings = function (patch) {
      var next = JSON.parse(JSON.stringify(ctl.profile));
      for (var k in patch) next.settings[k] = patch[k];
      ctl.profile = Save.validateSave(next).profile; // 잘못된 값은 기본값으로
      ctl.saveProfile();
      emit({ type: 'settings', settings: ctl.profile.settings });
      return ctl.profile.settings;
    };

    // ── 튜토리얼 ──
    var practice = r1 && balance.tutorial ? Tutorial.practiceBalance(balance) : null;
    ctl.startTutorial = function () {
      if (!practice) return false;
      runCounter++;
      input.reset();
      input.resetModes();
      ctl.mode = 'tutorial';
      ctl.feats = null;
      ctl.recorder = null;
      ctl.ghost = null;
      ctl.run = Simulation.createRun({ balance: practice, seed: 0, rulesVersion: rules, withGates: false, runId: 'tutorial-' + runCounter });
      ctl.run.recorded = true; // 기록 대상 아님
      ctl.tutorial = Tutorial.createTutorial(balance);
      ctl.state = 'PLAYING';
      ctl.acc = 0;
      ctl.lastNow = 0;
      emit({ type: 'start', runId: ctl.run.runId, tutorial: true });
      emit({ type: 'tutorialStep', step: ctl.tutorial.step, index: 0 });
      return true;
    };
    function completeTutorial(skipped) {
      ctl.profile.tutorialCompleted = true;
      ctl.saveProfile();
      ctl.mode = 'challenge';
      ctl.tutorial = null;
      input.reset();
      ctl.state = 'READY';
      emit({ type: 'tutorialComplete', skipped: !!skipped });
    }
    ctl.skipTutorial = function () { completeTutorial(true); };
    ctl.needsTutorial = function () { return !!practice && !ctl.profile.tutorialCompleted; };
    ctl.exitToMenu = function () {
      if (ctl.state === 'PLAYING' || ctl.state === 'RESUME_COUNTDOWN') return false;
      input.reset();
      ctl.mode = 'challenge'; ctl.tutorial = null;
      ctl.state = 'READY';
      emit({ type: 'menu' });
      return true;
    };

    // ── 오늘의 도전 ──
    var dailyCfg = r1 ? balance.daily || null : null;
    var today = opts.today || function () { return Replay.localDate(new Date()); };
    ctl.ghost = null;
    ctl.hasDaily = function () { return !!dailyCfg; };
    function dailyState() {
      var d = today();
      if (!ctl.profile.daily || ctl.profile.daily.date !== d) ctl.profile.daily = { date: d, best: null, attempts: 0, bonusClaimed: false, replay: null };
      return ctl.profile.daily;
    }
    ctl.dailyInfo = function () {
      if (!dailyCfg) return null;
      var ds = dailyState();
      return { date: ds.date, best: ds.best, attempts: ds.attempts, hasGhost: !!ds.replay, bonusAvailable: !ds.bonusClaimed, bonus: dailyCfg.firstRunBonus, seed: Replay.dateSeed(ds.date) };
    };
    function ghostFor(seed) {
      var rp = dailyState().replay;
      if (!rp || !Replay.validReplay(rp) || rp.seed !== seed || rp.rulesVersion !== rules || rp.balanceVersion !== balanceVersion || rp.generatorVersion !== (balance.generator.version || 'r0')) return null;
      return { run: Simulation.createRun({ balance: balance, seed: seed, rulesVersion: rules, runId: 'ghost' }), player: Replay.createPlayer(rp), best: dailyState().best };
    }

    // ── 친구 도전장 ──
    ctl.versus = null;
    // payload: Challenge.fromBytes 결과, check: Challenge.verify 결과
    ctl.acceptChallenge = function (payload, check) {
      if (!r1 || !payload || (check && check.status === 'version')) return false;
      ctl.versus = { seed: payload.seed >>> 0, name: payload.name, height: payload.height, passed: payload.passed, skin: payload.skin,
        replay: check && check.status === 'verified' ? payload.replay : null, ticks: payload.ticks, status: check ? check.status : 'unverified' };
      return true;
    };
    function versusGhost() {
      var v = ctl.versus;
      if (!v || !v.replay) return null;
      return { run: Simulation.createRun({ balance: balance, seed: v.seed, rulesVersion: rules, runId: 'ghost' }),
        player: Replay.createPlayer({ v: 1, seed: v.seed, ticks: v.ticks, data: v.replay }), best: { height: v.height, passed: v.passed }, label: v.name };
    }
    ctl.nickname = function () { return ctl.profile.nickname || ''; };
    ctl.setNickname = function (name) {
      var next = JSON.parse(JSON.stringify(ctl.profile)); next.nickname = name;
      ctl.profile = Save.validateSave(next).profile; ctl.saveProfile();
      return ctl.profile.nickname;
    };
    // 직전 판으로 보낼 도전장 내용(성장 모드·튜토리얼은 불가)
    ctl.challengePayload = function () {
      var rec = ctl.lastRecord;
      if (!rec || !ctl.lastReplay || rec.playMode === 'growth') return null;
      return { seed: rec.seed, rulesVersion: rules, balanceVersion: balanceVersion, generatorVersion: rec.generatorVersion,
        height: rec.height, passed: rec.passed, ticks: ctl.lastReplay.ticks, skin: ctl.equippedSkin ? ctl.equippedSkin() : 'base',
        name: ctl.nickname(), replay: ctl.lastReplay.data };
    };

    // ── 외형·재화(명세서 16.2) ──
    ctl.coins = function () { return ctl.profile.softCurrency; };
    function runReward(passed) {
      if (!cosmetics) return 0;
      return Math.min(cosmetics.reward.max, Math.floor(passed / cosmetics.reward.perPassed));
    }
    ctl.skinCatalog = function () {
      if (!cosmetics) return [];
      var c = ctl.profile.cosmetics;
      return cosmetics.skins.map(function (k) {
        return { id: k.id, price: k.price, owned: c.unlocked.indexOf(k.id) >= 0, equipped: c.equipped === k.id, affordable: ctl.profile.softCurrency >= k.price };
      });
    };
    ctl.equippedSkin = function () { return ctl.profile.cosmetics.equipped; };
    // 반환: 'ok' | 'owned' | 'insufficient' | 'unknown'
    ctl.buySkin = function (id) {
      var item = cosmetics && cosmetics.skins.filter(function (k) { return k.id === id; })[0];
      if (!item) return 'unknown';
      var c = ctl.profile.cosmetics;
      if (c.unlocked.indexOf(id) >= 0) return 'owned';
      if (ctl.profile.softCurrency < item.price) return 'insufficient';
      ctl.profile.softCurrency -= item.price;
      c.unlocked.push(id);
      c.equipped = id; // 산 스킨은 바로 착용
      ctl.saveProfile();
      emit({ type: 'cosmetics', action: 'buy', id: id, coins: ctl.profile.softCurrency });
      return 'ok';
    };
    ctl.equipSkin = function (id) {
      var c = ctl.profile.cosmetics;
      if (c.unlocked.indexOf(id) < 0) return false;
      c.equipped = id;
      ctl.saveProfile();
      emit({ type: 'cosmetics', action: 'equip', id: id, coins: ctl.profile.softCurrency });
      return true;
    };

    // ── 상태 전이 ──
    // playMode: 'challenge'(기본) | 'growth'
    // versus: ctl.acceptChallenge(payload)로 받은 도전장을 먼저 설정한 뒤 start('versus')
    ctl.start = function (playMode) {
      var pm = playMode === 'growth' && hasGrowth ? 'growth' : playMode === 'daily' && dailyCfg ? 'daily' : playMode === 'versus' && ctl.versus ? 'versus' : 'challenge';
      runCounter++;
      ctl.mode = pm;
      ctl.lastPlayMode = pm;
      ctl.tutorial = null;
      input.reset();
      input.resetModes();
      var seed = pm === 'daily' ? Replay.dateSeed(dailyState().date) : pm === 'versus' ? ctl.versus.seed : seedForRun();
      ctl.growth = pm === 'growth' ? Growth.createGrowth(balance, seed) : null;
      ctl.run = Simulation.createRun({ balance: ctl.growth ? ctl.growth.balance : balance, seed: seed, rulesVersion: rules, runId: 'run-' + Date.now().toString(36) + '-' + runCounter });
      ctl.run.recorded = false;
      ctl.feats = balance.feats ? Feats.createFeatTracker(balance) : null;
      ctl.recorder = pm !== 'growth' ? Replay.createRecorder({ seed: seed, rulesVersion: rules, balanceVersion: balanceVersion, generatorVersion: ctl.run.generatorVersion }) : null;
      ctl.ghost = pm === 'daily' ? ghostFor(seed) : pm === 'versus' ? versusGhost() : null;
      ctl.state = 'PLAYING';
      ctl.acc = 0;
      ctl.lastNow = 0;
      emit({ type: 'start', runId: ctl.run.runId, seed: ctl.run.runSeed, rulesVersion: recordRules(pm), balanceVersion: balanceVersion, generatorVersion: ctl.run.generatorVersion, playMode: pm });
    };

    ctl.pause = function (reason) {
      if (ctl.state !== 'PLAYING' && ctl.state !== 'RESUME_COUNTDOWN') return false;
      ctl.state = 'PAUSED';
      // 물리 장치 상태(포인터 ID·키 목록)는 폐기한다.
      input.reset();
      // r0는 논리 압축을 반동 없이 해제(원본). r1은 held·r·vr·p·좌표·난수를 그대로 보존(FIX-02).
      if (!r1) Simulation.r0ClearHold(ctl.run);
      ctl.acc = 0;
      emit({ type: 'pause', reason: reason || 'button' });
      return true;
    };

    ctl.resume = function () {
      if (ctl.state !== 'PAUSED') return;
      if (!r1) { // r0: 준비 시간 없이 즉시 복귀
        ctl.state = 'PLAYING'; ctl.acc = 0; ctl.lastNow = 0;
        emit({ type: 'resume' });
        return;
      }
      // r1(FIX-08): 명시적 계속하기 → 준비 시간. 세계는 동결, 새 압축 입력은 받는다.
      ctl.state = 'RESUME_COUNTDOWN';
      ctl.countdown = w.resumeCountdownSeconds;
      input.reset();
      emit({ type: 'resumeCountdown', seconds: ctl.countdown });
    };

    function finishCountdown() {
      ctl.state = 'PLAYING';
      ctl.acc = 0;
      input.beginResume(ctl.run.logicalHeld); // 첫 틱에서 정상 전이 1회
      emit({ type: 'resume' });
    }

    ctl.primaryAction = function () {
      if (ctl.state === 'PAUSED') ctl.resume();
      else if (ctl.state === 'READY' || ctl.state === 'DEAD' || ctl.state === 'RESULT') ctl.start(ctl.lastPlayMode);
    };

    // ── 성장 모드: 카드 선택 ──
    ctl.choose = function (index) {
      if (ctl.state !== 'CHOOSING' || !ctl.growth) return null;
      var card = ctl.growth.choose(ctl.run, index);
      if (!card) return null;
      emit({ type: 'abilityChosen', card: card, level: ctl.growth.level });
      // 선택 후에는 일시정지 재개와 같은 준비 시간을 거친다(압축 상태 보존, FIX-02/08)
      ctl.state = 'RESUME_COUNTDOWN';
      ctl.countdown = w.resumeCountdownSeconds;
      input.reset();
      emit({ type: 'resumeCountdown', seconds: ctl.countdown });
      return card;
    };

    function finishRun(death) {
      var run = ctl.run;
      var height = Simulation.heightMeters(run, balance);
      var mode = input.inputMode();
      var outcome = { isBest: false, record: null };
      var rr = ctl.mode === 'daily' ? rules + '-daily' : ctl.mode === 'versus' ? rules + '-versus' : recordRules(ctl.mode);
      var reward = 0, runStats = null, missionsDone = [];
      var dailyBonus = 0;
      if (!run.recorded) { // 결과·보상은 runId당 한 번만 반영
        run.recorded = true;
        ctl.lastReplay = ctl.recorder ? ctl.recorder.finish(run.tick) : null;
        if (ctl.mode === 'versus') {
          outcome = { isBest: false, record: null };
        } else if (ctl.mode === 'daily') {
          var ds = dailyState();
          ds.attempts++;
          outcome = { isBest: !ds.best || height > ds.best.height, record: null };
          if (outcome.isBest) {
            ds.best = { height: height, passed: run.passedCount };
            if (ctl.lastReplay) ds.replay = ctl.lastReplay; // 너무 긴 기록이면 고스트는 이전 것을 유지
          }
          if (!ds.bonusClaimed) { ds.bonusClaimed = true; dailyBonus = dailyCfg.firstRunBonus; ctl.profile.softCurrency += dailyBonus; }
        } else {
          outcome = Save.applyRunResult(ctl.profile, { rulesVersion: rr, balanceVersion: balanceVersion, inputMode: mode, height: height, passed: run.passedCount }, nowIso());
        }
        reward = runReward(run.passedCount);
        ctl.profile.softCurrency += reward;
        var st = ctl.feats ? ctl.feats.stats : {};
        runStats = { height: height, passed: run.passedCount, nearMiss: st.nearMiss || 0, doublePassed: st.doublePassed || 0, longPassed: st.longPassed || 0,
          riskyRelease: st.riskyRelease || 0, growthLevel: ctl.growth ? ctl.growth.level : 0, runs: 1 };
        if (missionCfg) {
          missionsDone = Missions.applyRun(ctl.profile.missions, missionCfg, runStats);
          missionsDone.forEach(function (d) { ctl.profile.softCurrency += d.reward; });
        }
        ctl.saveProfile();
      }
      ctl.lastRecord = {
        runId: run.runId, height: height, passed: run.passedCount, reason: death.reason, isBest: outcome.isBest,
        inputMode: mode, competitive: mode !== 'mixed', best: ctl.getBest(mode, ctl.mode),
        seed: run.runSeed, rulesVersion: rr, balanceVersion: balanceVersion, generatorVersion: run.generatorVersion,
        playMode: ctl.mode, growth: ctl.growth ? ctl.growth.summary() : null,
        coinsEarned: reward, coins: ctl.profile.softCurrency, stats: runStats, missionsDone: missionsDone,
        dailyBonus: dailyBonus, daily: ctl.mode === 'daily' ? ctl.dailyInfo() : null,
        versus: ctl.mode === 'versus' ? { name: ctl.versus.name, height: ctl.versus.height, passed: ctl.versus.passed, status: ctl.versus.status,
          result: Challenge.compare({ height: height, passed: run.passedCount }, ctl.versus) } : null,
        canShare: ctl.mode !== 'growth' && !!ctl.lastReplay
      };
      input.reset();
      ctl.state = 'DEAD';
      ctl.deadTimer = DEAD_FEEDBACK_SECONDS;
    }

    function tick() {
      var frame = ctl.replaySource ? ctl.replaySource(ctl.run.tick, ctl.run) : input.collect();
      if (ctl.mode === 'tutorial') return tutorialTick(frame);
      if (ctl.mode === 'growth') return growthTick(frame);
      if (ctl.recorder) ctl.recorder.tick(ctl.run.tick, frame);
      var events = Simulation.step(ctl.run, frame, dtFixed, balance);
      if (ctl.ghost && ctl.ghost.run.alive) Simulation.step(ctl.ghost.run, ctl.ghost.player.frame(ctl.ghost.run.tick), dtFixed, balance);
      observeFeats(events);
      for (var i = 0; i < events.length; i++) {
        if (events[i].type === 'death') finishRun(events[i]);
        emit(events[i]);
      }
    }
    function observeFeats(events) {
      if (!ctl.feats) return;
      var extra = ctl.feats.observe(ctl.run, events, dtFixed);
      for (var k = 0; k < extra.length; k++) emit(extra[k]);
    }

    // 튜토리얼: 실패는 결과 화면 없이 같은 단계 재시도, 완료 시 READY로
    function tutorialTick(frame) {
      var events = Simulation.step(ctl.run, frame, dtFixed, practice);
      var tut = ctl.tutorial.update(ctl.run, events, dtFixed);
      for (var i = 0; i < events.length; i++) if (events[i].type !== 'death') emit(events[i]);
      for (var j = 0; j < tut.length; j++) {
        if (tut[j].type === 'tutorialRetry') input.beginResume(false); // 아직 누르고 있으면 압축 전이 1회
        if (tut[j].type === 'tutorialDone') { emit(tut[j]); completeTutorial(false); return; }
        emit(tut[j]);
      }
    }

    // 성장 모드: 능력이 적용된 설정으로 계산하고, 레벨업이면 CHOOSING으로 세계를 멈춘다
    function growthTick(frame) {
      var events = Simulation.step(ctl.run, frame, dtFixed, ctl.growth.balance);
      observeFeats(events);
      var died = false;
      for (var i = 0; i < events.length; i++) {
        if (events[i].type === 'death') { died = true; finishRun(events[i]); }
        emit(events[i]);
      }
      if (died) return;
      var extra = ctl.growth.afterStep(ctl.run, events);
      for (var j = 0; j < extra.length; j++) {
        emit(extra[j]);
        if (extra[j].type === 'levelUp') {
          ctl.state = 'CHOOSING';
          input.reset(); // 장치 상태만 폐기, 논리 압축은 보존
          ctl.acc = 0;
        }
      }
    }

    // nowMs: 렌더 프레임 시각(ms). 처리한 틱 수를 돌려준다.
    ctl.frame = function (nowMs) {
      var first = !ctl.lastNow;
      var gap = first ? 0 : (nowMs - ctl.lastNow) / 1000;
      ctl.lastNow = nowMs;
      if (!r1) return ctl.advance(Math.min(w.referenceFrameClampSeconds, gap));
      // r1(FIX-06): 긴 정지는 따라잡지 않고 자동 일시정지
      if (gap >= w.stallPauseSeconds && ctl.state === 'PLAYING') { ctl.pause('stall'); return 0; }
      return ctl.advance(gap);
    };

    ctl.advance = function (dt) {
      var ticks = 0;
      if (ctl.state === 'PLAYING') {
        ctl.acc += dt;
        var maxTicks = r1 ? w.maxTicksPerFrame : Infinity;
        while (ctl.acc >= dtFixed - EPS && ticks < maxTicks) {
          tick();
          ticks++;
          ctl.acc -= dtFixed;
          if (ctl.state !== 'PLAYING') { ctl.acc = 0; break; }
        }
        // r1: 미처리 누적분은 다음 프레임으로 넘긴다. 지연이 계속 쌓이면 자동 일시정지.
        if (r1 && ctl.state === 'PLAYING' && ctl.acc > w.backlogPauseSeconds) ctl.pause('lag');
      } else if (ctl.state === 'RESUME_COUNTDOWN') {
        ctl.countdown -= dt;
        if (ctl.countdown <= EPS) finishCountdown();
      } else if (ctl.state === 'DEAD') {
        ctl.deadTimer -= dt;
        if (ctl.deadTimer <= 0) { ctl.state = 'RESULT'; emit({ type: 'result', record: ctl.lastRecord }); }
      }
      return ticks;
    };

    // ── 입력 진입점 ──
    function accepting() { return ctl.state === 'PLAYING' || (r1 && ctl.state === 'RESUME_COUNTDOWN'); }

    ctl.pointerDown = function (e) {
      if (!accepting()) return false;
      e.worldX = ctl.run.x;
      return input.pointerDown(e);
    };
    ctl.pointerMove = function (e) { return accepting() && input.pointerMove(e); };
    ctl.pointerUp = function (e) { return input.pointerUp(e); };
    ctl.pointerCancel = function (e) {
      var wasActive = input.pointerCancel(e);
      if (r1 && wasActive) ctl.pause('pointercancel'); // FIX-03
      return wasActive;
    };

    // 반환: 브라우저 기본 동작을 막아야 하면 true
    ctl.keyDown = function (e) {
      if (e.code === 'Escape') { ctl.pause('key'); return true; }
      if (MOVE_KEYS.indexOf(e.code) >= 0) { if (accepting()) { input.keyDown(e); return true; } return false; }
      if (ctl.state === 'CHOOSING' && /^Digit[1-9]$/.test(e.code)) { ctl.choose(Number(e.code.slice(5)) - 1); return true; }
      if (e.code !== 'Space') return false;
      if (e.repeat) return true;
      if (ctl.state === 'READY' || ctl.state === 'DEAD' || ctl.state === 'RESULT') ctl.start(ctl.lastPlayMode);
      if (accepting()) input.keyDown(e);
      return true;
    };
    ctl.keyUp = function (e) { return input.keyUp(e); };

    return ctl;
  }

  return { createGameController: createGameController };
});
