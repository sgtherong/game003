// 웹 실행기 — DOM 입력을 GameController로 전달하고 화면을 갱신한다.
// 게임 루프는 requestAnimationFrame 하나뿐이다. 규칙: R1 (출시 규칙)
(function (root) {
  'use strict';
  var K = root.KKUK, balance = K.balanceR1;
  var $ = function (id) { return document.getElementById(id); };

  var ui = {
    stage: $('stage'), canvas: $('canvas'), overlay: $('overlay'), card: $('card'),
    pause: $('pause-btn'), settings: $('settings-btn'), height: $('hud-height'), gates: $('hud-gates'),
    best: $('best-value'), bestLabel: $('best-label'), bestChip: $('best-chip'),
    meter: $('meter'), fill: $('meter-fill'), meterLabel: $('meter-label'), pct: $('meter-pct'), meterGoal: $('meter-goal'),
    meterHead: document.querySelector('.meter-head'),
    coach: $('coach'), coachDots: $('coach-dots'), coachTitle: $('coach-title'), coachHint: $('coach-hint'),
    pad: $('pad'), padLabel: $('pad-label'), note: $('note'),
    heightBox: document.querySelector('.hud-height'),
    xpbar: $('xpbar'), xpfill: $('xpfill')
  };

  // 저장 매체: localStorage. 막혀 있거나(사생활 보호 모드 등) 실패해도 게임은 그대로 진행한다.
  var storage = {
    read: function (k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } },
    write: function (k, v) { root.localStorage.setItem(k, v); }
  };

  var ctl = K.GameController.createGameController({ balance: balance, store: storage });
  // 처음 실행이면 기기 언어를 따른다(이후에는 설정에서 고른 언어 유지)
  if (ctl.loadInfo.source === 'new') {
    var lang = K.Save.pickLanguage(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]);
    if (K.stringsByLang[lang]) ctl.updateSettings({ language: lang });
  }
  var S = K.stringsByLang[ctl.profile.settings.language] || K.stringsByLang.ko;
  var view = K.View.createView(ui.canvas, balance, S);
  var audio = K.AudioHaptics.create(function () { return ctl.profile.settings; });
  ctl.on(view.onEvent);
  ctl.on(audio.onEvent);
  var reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function reduced() { return ctl.profile.settings.reducedEffects || reducedMotion.matches; }

  function fmt(s, n) { return s.replace('{n}', n); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ── 오버레이 카드 ──
  var ICON = {
    press: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="9" stroke-dasharray="2 3"/></svg>',
    drag: '<svg viewBox="0 0 24 24"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M3 12h18"/></svg>',
    release: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 1v2M12 21v2M1 12h2M21 12h2"/></svg>'
  };
  var ABILITY_ICON = {
    toughBody: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>',
    quickRecover: '<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v4h4"/>',
    cushion: '<path d="M3 15c3-4 6-4 9 0s6 4 9 0"/><path d="M3 9c3-4 6-4 9 0s6 4 9 0"/>',
    shockwave: '<circle cx="12" cy="12" r="3"/><path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
    slideFeet: '<path d="M4 16h11l5-5M4 12h7M4 8h4"/>',
    shield: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    foresight: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    focus: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4M6 8h4M14 8h4"/>',
    steelLungs: '<path d="M12 4v7M12 11c-2 0-6 1-6 6 0 2 1 3 3 3s3-2 3-5M12 11c2 0 6 1 6 6 0 2-1 3-3 3s-3-2-3-5"/>',
    reboundBlast: '<path d="M12 2l2 6 6-2-4 5 5 4-6 0 1 6-4-4-4 4 1-6-6 0 5-4-4-5 6 2z"/>',
    haste: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'
  };
  function abilityText(id) {
    var g = balance.growth, A = g.abilities, E = g.evolutions, t = S.ability[id];
    var v = {
      toughBody: [-A.toughBody.chargeMul * 100], quickRecover: [A.quickRecover.recoverMul * 100], cushion: [-A.cushion.impulseMul * 100],
      shockwave: [A.shockwave.minEnergy * 100, A.shockwave.gapBonus], slideFeet: [A.slideFeet.moveMul * 100], foresight: [A.foresight.gates],
      focus: [A.focus.threshold * 100, A.focus.speedMul], steelLungs: [E.steelLungs.failAt * 100], reboundBlast: [E.reboundBlast.minEnergy * 100],
      haste: [g.curse.speedMul * 100, 1 + g.curse.xpMul]
    }[id] || [];
    return { name: t.name, desc: t.desc.replace('{a}', Math.round(v[0] * 100) / 100).replace('{b}', v[1]) };
  }
  function icon(id) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ABILITY_ICON[id] || '') + '</svg>'; }

  var currentCard = null; // 설정을 닫을 때 돌아갈 카드

  // actions: { 'data-act 값': 함수 }
  function showCard(html, actions, extraClass) {
    ui.card.className = 'card' + (extraClass ? ' ' + extraClass : '');
    ui.overlay.classList.toggle('is-home', extraClass === 'home');
    ui.card.innerHTML = html;
    ui.overlay.hidden = false;
    ui.card.querySelectorAll('[data-act]').forEach(function (el) {
      el.addEventListener('click', function () { audio.unlock(); audio.play('tap'); actions[el.getAttribute('data-act')](el); });
    });
    var first = ui.card.querySelector('.btn-play, .btn-primary, .mode-tile, .offer') || ui.card.querySelector('button');
    // 키보드용 첫 포커스. 터치 기기에서는 포커스 테두리만 남으므로 하지 않는다
    if (first && !document.body.classList.contains('touch')) first.focus({ preventScroll: true });
  }
  function hideCard() { ui.overlay.hidden = true; currentCard = null; }
  function afterAction() { ui.pad.focus({ preventScroll: true }); }

  var menuActions = {
    start: function () { ctl.start('challenge'); afterAction(); },
    growth: function () { ctl.start('growth'); afterAction(); },
    daily: function () { ctl.start('daily'); afterAction(); },
    retry: function () { ctl.start(ctl.lastPlayMode); afterAction(); },
    tutorial: function () { ctl.startTutorial(); afterAction(); },
    skip: function () { ctl.skipTutorial(); },
    resume: function () { ctl.resume(); afterAction(); },
    home: function () { ctl.exitToMenu(); },
    settings: function () { settingsCard(); },
    share: function () { shareCard(); },
    rematch: function () { ctl.start('versus'); afterAction(); },
    accept: function () { ctl.start('versus'); afterAction(); },
    skins: function () { skinsCard(null); }
  };

  function missionsPanel() {
    var list = ctl.missionList();
    if (!list.length) return '';
    return '<div class="missions"><div class="m-head">' + S.missionsTitle + '</div>' + list.map(function (m) {
      var pct = Math.round(100 * m.progress / m.goal);
      var label = esc(S.missions[m.id].replace('{n}', m.goal));
      return '<div class="m-row"><span class="m-text" title="' + label + '">' + label + '</span>' +
        '<span class="m-rew">' + STAR + m.reward + '</span>' +
        '<span class="m-bar"><i style="width:' + pct + '%"></i></span><span class="m-prog">' + m.progress + '/' + m.goal + '</span></div>';
    }).join('') + '</div>';
  }
  function readyCard() {
    currentCard = readyCard;
    var first = ctl.needsTutorial();
    if (!first) { homeScreen(); return; }
    showCard(
      '<div class="card-mascot"><i></i></div>' +
      '<div class="card-title">' + S.title + '</div>' +
      '<div class="card-sub">' + (first ? S.tutorialFirst : S.tagline) + '</div>' +
      '<div class="steps">' +
        '<div class="step">' + ICON.press + '<b>' + S.stepPress + '</b><span>' + S.stepPressDetail + '</span></div>' +
        '<div class="step">' + ICON.drag + '<b>' + S.stepDrag + '</b><span>' + S.stepDragDetail + '</span></div>' +
        '<div class="step">' + ICON.release + '<b>' + S.stepRelease + '</b><span>' + S.stepReleaseDetail + '</span></div>' +
      '</div>' +
      (first
        ? '<button type="button" class="btn-primary" data-act="tutorial">' + S.tutorialStart + '</button>' +
          '<button type="button" class="btn-ghost" data-act="skip">' + S.skipTutorial + '</button>'
        : modeTiles() +
          '<div class="btn-row"><button type="button" class="btn-ghost" data-act="skins">' + STAR + ' ' + S.skinsTitle + ' · ' + ctl.coins() + '</button>' +
          '<button type="button" class="btn-ghost" data-act="settings">' + S.settings + '</button></div>'),
      menuActions);
  }
  // 시작 화면(튜토리얼 이후): 카드 대신 게임 타이틀 화면처럼 — 로고, 큰 시작 버튼, 다른 모드, 미션, 외형·설정
  function logoHtml() {
    // 로고 글씨는 손으로 그린 선(SVG) — 기기 글꼴과 무관하게 어디서나 같은 모양. 게임 이름은 모든 언어에서 'Boing!'
    return '<div class="logo" role="img" aria-label="' + esc(S.title) + '"><div class="logo-mascot" aria-hidden="true"><i></i></div>' + LOGO_SVG + '</div>';
  }
  var LOGO_SVG = '<svg class="logo-svg" viewBox="0 0 310 124" aria-hidden="true"><g class="lw" style="--i:0"><path class="lw-sh" d="M24 18V86M24 18H42a16 16 0 0 1 0 32H24M24 50H46a18 18 0 0 1 0 36H24"/><path class="lw-ol" d="M24 18V86M24 18H42a16 16 0 0 1 0 32H24M24 50H46a18 18 0 0 1 0 36H24"/><path class="lw-fi" d="M24 18V86M24 18H42a16 16 0 0 1 0 32H24M24 50H46a18 18 0 0 1 0 36H24"/><path class="lw-hi" d="M24 18V86M24 18H42a16 16 0 0 1 0 32H24M24 50H46a18 18 0 0 1 0 36H24"/></g><g class="lw" style="--i:1"><path class="lw-sh" d="M95 46a20 20 0 1 0 0.01 0"/><path class="lw-ol" d="M95 46a20 20 0 1 0 0.01 0"/><path class="lw-fi" d="M95 46a20 20 0 1 0 0.01 0"/><path class="lw-hi" d="M95 46a20 20 0 1 0 0.01 0"/></g><g class="lw" style="--i:2"><path class="lw-sh" d="M134 46V86M134 22v0.01"/><path class="lw-ol" d="M134 46V86M134 22v0.01"/><path class="lw-fi" d="M134 46V86M134 22v0.01"/><path class="lw-hi" d="M134 46V86M134 22v0.01"/></g><g class="lw" style="--i:3"><path class="lw-sh" d="M160 86V46M160 64a18 18 0 0 1 36 0V86"/><path class="lw-ol" d="M160 86V46M160 64a18 18 0 0 1 36 0V86"/><path class="lw-fi" d="M160 86V46M160 64a18 18 0 0 1 36 0V86"/><path class="lw-hi" d="M160 86V46M160 64a18 18 0 0 1 36 0V86"/></g><g class="lw" style="--i:4"><path class="lw-sh" d="M233 46a20 20 0 1 0 0.01 0M253 46V88a20 20 0 0 1 -37 10"/><path class="lw-ol" d="M233 46a20 20 0 1 0 0.01 0M253 46V88a20 20 0 0 1 -37 10"/><path class="lw-fi" d="M233 46a20 20 0 1 0 0.01 0M253 46V88a20 20 0 0 1 -37 10"/><path class="lw-hi" d="M233 46a20 20 0 1 0 0.01 0M253 46V88a20 20 0 0 1 -37 10"/></g><g class="lw" style="--i:5"><path class="lw-sh" d="M282 18V62M282 86v0.01"/><path class="lw-ol" d="M282 18V62M282 86v0.01"/><path class="lw-fi" d="M282 18V62M282 86v0.01"/><path class="lw-hi" d="M282 18V62M282 86v0.01"/></g></svg>';
  function homeScreen() {
    var di = ctl.hasGrowth() && ctl.dailyInfo ? ctl.dailyInfo() : null;
    showCard(
      logoHtml() +
      '<div class="home-tag">' + S.tagline + '</div>' +
      '<button type="button" class="btn-play" data-act="start"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg><span><b>' +
        (ctl.hasGrowth() ? S.modeChallenge : S.start) + '</b>' + (ctl.hasGrowth() ? '<small>' + S.modeChallengeDetail + '</small>' : '') + '</span></button>' +
      (ctl.hasGrowth() ? '<div class="modes">' +
        '<button type="button" class="mode-tile growth" data-act="growth"><b>' + S.modeGrowth + '</b><span>' + S.modeGrowthDetail + '</span></button>' +
        (di ? '<button type="button" class="mode-tile daily" data-act="daily"><b>' + S.modeDaily + '</b><span>' + (di.best ? S.dailyBestShort.replace('{n}', di.best.height) : S.modeDailyDetail) + '</span>' +
          (di.bonusAvailable ? '<em class="new">' + STAR + di.bonus + '</em>' : '') + '</button>' : '') +
        '</div>' : '') +
      missionsPanel() +
      '<div class="btn-row home-foot"><button type="button" class="btn-ghost" data-act="skins">' + STAR + ' ' + S.skinsTitle + ' · ' + ctl.coins() + '</button>' +
      '<button type="button" class="btn-ghost" data-act="settings">' + S.settings + '</button></div>',
      menuActions, 'home');
  }
  function modeTiles() {
    if (!ctl.hasGrowth()) return '<button type="button" class="btn-primary" data-act="start">' + S.start + '</button>';
    var di = ctl.dailyInfo ? ctl.dailyInfo() : null;
    return '<div class="modes' + (di ? ' three' : '') + '">' +
      '<button type="button" class="mode-tile" data-act="start"><b>' + S.modeChallenge + '</b><span>' + S.modeChallengeDetail + '</span></button>' +
      '<button type="button" class="mode-tile growth" data-act="growth"><b>' + S.modeGrowth + '</b><span>' + S.modeGrowthDetail + '</span></button>' +
      (di ? '<button type="button" class="mode-tile daily" data-act="daily"><b>' + S.modeDaily + '</b><span>' + (di.best ? S.dailyBestShort.replace('{n}', di.best.height) : S.modeDailyDetail) + '</span>' +
        (di.bonusAvailable ? '<em class="new">' + STAR + di.bonus + '</em>' : '') + '</button>' : '') +
      '</div>';
  }
  function tutorialDoneCard(skipped) {
    currentCard = function () { tutorialDoneCard(skipped); };
    showCard(
      '<div class="card-mascot"><i></i></div>' +
      '<div class="card-title">' + (skipped ? S.title : S.tutorial.doneTitle) + '</div>' +
      '<div class="card-sub">' + (skipped ? S.tutorial.skippedDetail : S.tutorial.doneDetail) + '</div>' +
      modeTiles(),
      menuActions);
  }
  function pausedCard(reason) {
    currentCard = function () { pausedCard(reason); };
    var why = S.pauseReason[reason] || '';
    var tut = ctl.mode === 'tutorial';
    showCard('<div class="card-title">' + S.pausedTitle + '</div>' +
      '<div class="card-sub">' + (why ? esc(why) + '\n' : '') + (ctl.run.logicalHeld ? S.pausedHeld : S.pausedDetail) + '</div>' +
      '<button type="button" class="btn-primary" data-act="resume">' + S.resume + '</button>' +
      '<div class="btn-row">' +
        (tut ? '<button type="button" class="btn-ghost" data-act="home">' + S.quitTutorial + '</button>' : '') +
        '<button type="button" class="btn-ghost" data-act="settings">' + S.settings + '</button></div>',
      menuActions);
  }
  function resultCard(rec) {
    currentCard = function () { resultCard(rec); };
    if (rec.versus) return versusResultCard(rec);
    var modeLabel = rec.playMode === 'daily' ? S.dailyPrefix : (rec.playMode === 'growth' ? S.growthPrefix + ' · ' : '') + S.mode[rec.inputMode];
    var picks = '';
    if (rec.growth) {
      picks = '<div class="picks"><span>' + S.level.replace('{n}', rec.growth.level) + '</span>' +
        rec.growth.picks.map(function (p) { var k = p.split(':'); return '<span class="' + k[0] + '">' + esc(abilityText(k[1]).name) + '</span>'; }).join('') + '</div>';
    }
    showCard(
      (rec.isBest && rec.height > 0 ? '<div class="badge">' + S.newBest + '</div>' : '') +
      '<div class="card-title"><span class="count">' + rec.height + '</span><small>m</small></div>' +
      '<div class="card-sub">' + esc(S.reason[rec.reason] || S.reason.unknown) + '</div>' +
      '<div class="stat-row"><div class="stat">' + S.passedLabel + '<b>' + rec.passed + '</b></div>' +
        (rec.stats && rec.stats.nearMiss ? '<div class="stat">' + S.nearMissLabel + '<b>' + rec.stats.nearMiss + '</b></div>' : '') +
        '<div class="stat">' + modeLabel + ' ' + S.best + '<b>' + rec.best + ' m</b></div></div>' +
      (rec.missionsDone && rec.missionsDone.length ? '<div class="m-done">' + rec.missionsDone.map(function (d) {
        return '<div>✓ ' + esc(S.missions[d.id].replace('{n}', d.goal)) + ' <b>' + STAR + '+' + d.reward + '</b></div>'; }).join('') + '</div>' : '') +
      picks +
      (rec.competitive ? '' : '<div class="card-warn">' + S.mixedNote + '</div>') +
      (rec.playMode === 'daily' && rec.daily ? '<div class="daily-line">' + S.dailyTitle + ' · ' + S.attemptN.replace('{n}', rec.daily.attempts) +
        (rec.dailyBonus ? ' · <b>' + STAR + S.dailyBonus.replace('{n}', rec.dailyBonus) + '</b>' : '') + '</div>' : '') +
      (rec.coinsEarned > 0 ? '<div class="earned">' + STAR + ' ' + S.earned.replace('{n}', rec.coinsEarned) + ' <small>· ' + rec.coins + '</small></div>' : '') +
      '<button type="button" class="btn-primary" data-act="retry">' + S.retry + '</button>' +
      '<div class="btn-row"><button type="button" class="btn-ghost" data-act="home">' + S.home + '</button>' +
      (rec.canShare ? '<button type="button" class="btn-ghost accent" data-act="share">' + S.challengeSend + '</button>'
        : '<button type="button" class="btn-ghost" data-act="skins">' + STAR + ' ' + S.skinsTitle + '</button>') + '</div>' +
      '<div class="card-hint kbd-only">' + S.retryHint + '<br><span class="mono">seed ' + rec.seed + ' · ' + rec.rulesVersion + '/' + rec.balanceVersion + '/' + rec.generatorVersion + '</span></div>',
      menuActions);
    // 처음 보여 줄 때만: 기록이 0부터 올라가고, 최고 기록이면 색종이(설정을 열었다 돌아올 때는 다시 하지 않음)
    if (!rec.shown) {
      rec.shown = true;
      countUp(ui.card.querySelector('.count'), rec.height);
      if (rec.isBest && rec.height > 0) confetti();
    }
  }

  function countUp(el, to) {
    if (!el || reduced() || to <= 0) return;
    var t0 = performance.now(), dur = Math.min(900, 350 + to * 4);
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = String(Math.round(to * e));
      if (k < 1) requestAnimationFrame(step); else { el.classList.remove('land'); void el.offsetWidth; el.classList.add('land'); }
    })(t0);
  }
  function confetti() {
    if (reduced()) return;
    var box = document.createElement('div'), cols = ['var(--gold)', 'var(--mint)', 'var(--body)', '#7c7cf0', '#ffffff'], html = '';
    box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 36; i++) {
      html += '<i style="left:' + (Math.random() * 100).toFixed(1) + '%;background:' + cols[i % cols.length] +
        ';--dx:' + ((Math.random() - 0.5) * 120).toFixed(0) + 'px;--r:' + ((Math.random() - 0.5) * 900).toFixed(0) + 'deg' +
        ';animation-delay:' + (Math.random() * 0.35).toFixed(2) + 's;animation-duration:' + (1.6 + Math.random() * 1.1).toFixed(2) + 's"></i>';
    }
    box.innerHTML = html;
    ui.stage.appendChild(box);
    setTimeout(function () { box.remove(); }, 3400);
  }

  // 문구 끝의 ' · 키보드 1 2 3' 같은 키보드 안내는 터치 기기에서 숨긴다(모든 언어가 마지막 ' · ' 뒤에 둠)
  function kbdTail(text) {
    var i = text.lastIndexOf(' · ');
    return i < 0 ? text : esc(text.slice(0, i)) + '<span class="kbd-only">' + esc(text.slice(i)) + '</span>';
  }
  // ── 성장 모드: 레벨업 카드 ──
  function levelUpCard(level, offers) {
    // 설정을 열었다 닫으면 이 카드로 돌아온다(시작 화면으로 가면 진행 중인 판을 잃는다)
    currentCard = function () { levelUpCard(level, offers); };
    var html = '<div class="card-title">' + S.levelUpTitle + '</div>' +
      '<div class="card-sub">' + S.level.replace('{n}', level) + ' · ' + kbdTail(S.levelUpSub) + '</div><div class="offers">';
    offers.forEach(function (o, i) {
      var t = abilityText(o.id);
      var tag = o.kind === 'evolution' ? S.evolution : o.kind === 'curse' ? S.curse : S.stackOf.replace('{n}', o.stacks + 1).replace('{m}', o.max);
      html += '<button type="button" class="offer ' + o.kind + '" data-act="pick" data-i="' + i + '">' +
        '<span class="ic">' + icon(o.id) + '</span>' +
        '<span><b><span class="key">' + (i + 1) + '</span>' + esc(t.name) + '<span class="tag">' + tag + '</span></b><small>' + esc(t.desc) + '</small></span></button>';
    });
    html += '</div>';
    showCard(html, { pick: function (el) { ctl.choose(Number(el.getAttribute('data-i'))); afterAction(); } }, 'levelup');
  }

  // ── 친구 도전장 ──
  var toastTimer = 0;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function isLocalHost() {
    var h = location.hostname;
    return location.protocol === 'file:' || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/.test(h) || h === '';
  }
  // 받은 링크 해독: 'r' = 압축 없음(짧은 링크), 'z' = deflate-raw 압축(이전 버전의 긴 링크)
  function streamBytes(bytes, Ctor, fmt) {
    return new Response(new Blob([bytes]).stream().pipeThrough(new Ctor(fmt))).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function decodeChallenge(code) {
    var body = K.Challenge.unb64url(code.slice(1));
    if (code[0] === 'r') return Promise.resolve(K.Challenge.fromBytes(body));
    if (code[0] !== 'z' || !root.DecompressionStream) return Promise.reject(new Error('format'));
    return streamBytes(body, root.DecompressionStream, 'deflate-raw').then(function (b) { return K.Challenge.fromBytes(b); });
  }
  // 공유 주소는 도전장 전용 안내 페이지(…/c/)로 보낸다. 그 페이지가 도전장 썸네일·제목을 미리보기로 보여 주고 게임으로 넘긴다.
  // 일반 공유는 '#코드'(서버로 전송되지 않음), 카카오 카드 버튼은 '?c=코드'(카카오가 # 뒤를 보장하지 않음)
  function challengeLink(code, asQuery) {
    var base = location.origin + location.pathname;
    var page = /web\/(index\.html)?$/;
    if (page.test(location.pathname)) return base.replace(page, 'c/') + (asQuery ? '?c=' : '#') + code;
    return base + (asQuery ? '?c=' : '#c=') + code;
  }

  // 카카오 SDK: 처음 쓸 때만, 무결성 검사를 붙여 불러온다
  var kakaoReady = null;
  function shareCfg() { return K.shareConfig || {}; }
  function kakaoEnabled() { return !!shareCfg().kakaoJsKey; }
  function loadKakao() {
    if (kakaoReady) return kakaoReady;
    kakaoReady = new Promise(function (resolve, reject) {
      if (root.Kakao) return resolve(root.Kakao);
      var sc = document.createElement('script');
      sc.src = shareCfg().kakaoSdk.src; sc.integrity = shareCfg().kakaoSdk.integrity; sc.crossOrigin = 'anonymous';
      sc.onload = function () { root.Kakao ? resolve(root.Kakao) : reject(new Error('sdk')); };
      sc.onerror = function () { kakaoReady = null; reject(new Error('sdk')); };
      document.head.appendChild(sc);
    }).then(function (Kakao) {
      if (!Kakao.isInitialized()) Kakao.init(shareCfg().kakaoJsKey);
      return Kakao;
    });
    return kakaoReady;
  }

  var shareBack = null;
  function shareCardCurrent() { shareCard(); }
  function shareCard() {
    // 설정을 열었다 닫아 다시 그릴 때도 처음 들어온 화면(결과 등)으로 돌아간다
    var back = currentCard && currentCard !== shareCardCurrent ? currentCard : (shareBack || readyCard);
    shareBack = back;
    var payload = ctl.challengePayload();
    if (!payload) return;
    var rec = ctl.lastRecord;
    showCard('<div class="card-title">' + (rec.versus ? S.challengeBack : S.challengeTitle) + '</div>' +
      '<button type="button" class="icon-btn small card-close" data-act="close" aria-label="' + esc(S.close) + '"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<div class="card-sub">' + esc(S.shareMsg.replace('{h}', rec.height)) + '</div>' +
      '<label class="name-field"><span>' + S.nameLabel + '</span><input id="nick" type="text" maxlength="12" autocomplete="nickname" placeholder="' + esc(S.namePlaceholder) + '" value="' + esc(ctl.nickname()) + '"></label>' +
      (isLocalHost() ? '<div class="card-warn local">' + S.localWarn + '</div>' : '') +
      '<div class="share-preview" aria-hidden="true"><img id="share-img" alt=""></div>' +
      (kakaoEnabled() ? '<button type="button" class="btn-kakao" data-act="kakao">' + S.kakaoBtn + '</button>' : '') +
      (kakaoEnabled()
        ? '<div class="btn-row"><button type="button" class="btn-ghost" data-act="send">' + S.otherBtn + '</button><button type="button" class="btn-ghost" data-act="copy">' + S.copyBtn + '</button></div>'
        : '<button type="button" class="btn-primary" data-act="send">' + S.shareBtn + '</button><button type="button" class="btn-ghost" data-act="copy">' + S.copyBtn + '</button>'), {
      close: function () { back(); },
      kakao: function () { doKakao(); },
      send: function () { doShare(true); },
      copy: function () { doShare(false); }
    }, 'share');
    if (kakaoEnabled()) loadKakao().catch(function () { /* 누를 때 다시 시도 */ });
    currentCard = shareCardCurrent;
    var input = $('nick');
    input.addEventListener('keydown', function (e) { e.stopPropagation(); }); // 이름 입력 중 게임 키 처리 안 함
    input.addEventListener('keyup', function (e) { e.stopPropagation(); });
    // 기록 카드 이미지: 미리보기로 보여 주고, 휴대폰 공유 창이 파일을 받으면 함께 보낸다(이름을 바꾸면 다시 그림)
    var imgBlob = null, imgTimer = 0;
    function refreshImage() {
      makeShareImage(rec, input.value.trim()).then(function (b) {
        imgBlob = b;
        var el = $('share-img'); if (!el) return;
        if (el.src) URL.revokeObjectURL(el.src);
        el.src = URL.createObjectURL(b);
      }).catch(function () { imgBlob = null; });
    }
    refreshImage();
    input.addEventListener('input', function () { clearTimeout(imgTimer); imgTimer = setTimeout(refreshImage, 350); });

    // 짧은 링크: 코스·기록·이름만 담는다(고스트 입력 기록은 넣지 않음 → 약 30자)
    function build(asQuery) {
      var p = ctl.challengePayload();
      p.name = ctl.setNickname(input.value);
      p.replay = null;
      return Promise.resolve(challengeLink('r' + K.Challenge.b64url(K.Challenge.toBytes(p)), asQuery));
    }
    // 카카오톡 카드: 문구 + 도전장 썸네일 + "도전 받기" 버튼(긴 링크는 버튼 안에만)
    function doKakao() {
      Promise.all([loadKakao(), build(true)]).then(function (r) {
        var Kakao = r[0], url = r[1], name = ctl.nickname();
        var title = (name ? S.cardTitleNamed.replace('{name}', name) : S.cardTitle).replace('{h}', rec.height);
        Kakao.Share.sendDefault({
          objectType: 'feed',
          content: { title: title, description: S.cardDesc, imageUrl: shareCfg().challengeImage, imageWidth: 1200, imageHeight: 630,
            link: { mobileWebUrl: url, webUrl: url } },
          buttons: [{ title: S.cardButton, link: { mobileWebUrl: url, webUrl: url } }]
        });
      }).catch(function () { toast(S.kakaoFail); });
    }
    function doShare(native) {
      build().then(function (url) {
        var text = S.shareMsg.replace('{h}', rec.height);
        if (native && navigator.share) {
          // 파일을 받는 공유 창이면 기록 카드 이미지를 붙인다. 일부 앱은 파일과 함께면 url을 버리므로 링크를 문구 안에도 넣는다
          var file = imgBlob && typeof File === 'function' ? new File([imgBlob], 'boing-' + rec.height + 'm.jpg', { type: 'image/jpeg' }) : null;
          var data = file && navigator.canShare && navigator.canShare({ files: [file] })
            ? { title: S.title, text: text + ' ' + url, files: [file] }
            : { title: S.title, text: text, url: url };
          return navigator.share(data).then(function () { toast(S.shared); }, function () { /* 사용자가 취소 */ });
        }
        return navigator.clipboard.writeText(text + ' ' + url).then(function () { toast(S.copied); });
      }).catch(function () { toast(S.shareFail); });
    }
  }

  // ── 기록 카드 이미지(1080×1350, 글자 없이 숫자·로고·이름만 → 언어 공용) ──
  // 기록 높이 구간의 하늘색, 장착한 외형의 웃는 얼굴, 큰 기록 숫자, 로고. 기기 안에서만 만들고 서버로 보내지 않는다.
  function logoImage() {
    var ds = [], re = /class="lw-sh" d="([^"]+)"/g, m;
    while ((m = re.exec(LOGO_SVG))) ds.push(m[1]);
    function layer(stroke, w, extra) { return ds.map(function (d) { return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '/>'; }).join(''); }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 310 124">' + layer('#3a0d05', 25, ' opacity="0.45" transform="translate(0 5)"') +
      layer('#c23a2c', 25) + layer('#fff7ec', 18) + '</svg>';
    return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  }
  function makeShareImage(rec, name) {
    var fontReady = document.fonts && document.fonts.load ? document.fonts.load('900 200px "Boing Num"').catch(function () {}) : Promise.resolve();
    return Promise.all([logoImage(), fontReady]).then(function (r) {
      var logo = r[0];
      var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var c = cv.getContext('2d'), Z = K.View.ZONES[Math.floor(rec.height / 100) % K.View.ZONES.length];
      var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, Z.top); g.addColorStop(1, Z.bottom);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      // 해·달 빛, 별(밤 구간)
      var sg = c.createRadialGradient(820, 330, 20, 820, 330, 300); sg.addColorStop(0, 'rgba(255,245,210,0.7)'); sg.addColorStop(1, 'rgba(255,245,210,0)');
      c.fillStyle = sg; c.fillRect(420, 0, 660, 700);
      for (var i = 0; i < 60 * Z.stars; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.3 + (i % 5) * 0.12) + ')'; c.fillRect((i * 173.3) % W, (i * 97.1) % (H * 0.7), 3, 3); }
      // 양옆 절벽
      [[-1, 70, Z.hill2, 0.55, 1.3], [1, 70, Z.hill2, 0.55, 4.1], [-1, 34, Z.hill, 0.85, 0.2], [1, 34, Z.hill, 0.85, 2.6]].forEach(function (q) {
        c.globalAlpha = q[3]; c.fillStyle = q[2]; c.beginPath(); var ex = q[0] < 0 ? 0 : W; c.moveTo(ex, 0);
        for (var y = 0; y <= H; y += 20) { var w = q[1] + Math.sin(y * 0.008 + q[4]) * 28 + Math.sin(y * 0.021 + q[4] * 2) * 12; c.lineTo(q[0] < 0 ? w : W - w, y); }
        c.lineTo(ex, H); c.closePath(); c.fill(); c.globalAlpha = 1;
      });
      // 돌판 두 개(틈)와 그 틈을 지나 솟는 캐릭터
      function rrect(x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); } // 오래된 iOS 대비
      function slab(x, y, w, h) {
        var sgr = c.createLinearGradient(0, y, 0, y + h); sgr.addColorStop(0, Z.wall); sgr.addColorStop(1, Z.wallDeep);
        c.fillStyle = 'rgba(0,0,0,0.18)'; rrect(x, y + 12, w, h, 22); c.fill();
        c.fillStyle = sgr; rrect(x, y, w, h, 22); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(x + 10, y, w - 20, 5);
      }
      slab(-40, 760, 420, 90); slab(700, 760, 420, 90);
      c.save(); c.shadowColor = Z.rim; c.shadowBlur = 20; c.fillStyle = Z.rim; c.fillRect(372, 770, 10, 70); c.fillRect(698, 770, 10, 70); c.restore();
      var skin = ctl.equippedSkin ? ctl.equippedSkin() : 'base';
      var halo = c.createRadialGradient(540, 640, 100, 540, 640, 300); halo.addColorStop(0, 'rgba(255,255,255,0.35)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = halo; c.beginPath(); c.arc(540, 640, 300, 0, Math.PI * 2); c.fill();
      c.lineCap = 'round';
      [[470, 820, 150], [540, 850, 180], [610, 820, 150]].forEach(function (l) {
        var lg = c.createLinearGradient(0, l[1], 0, l[1] + l[2]); lg.addColorStop(0, 'rgba(255,255,255,0.8)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        c.strokeStyle = lg; c.lineWidth = 16; c.beginPath(); c.moveTo(l[0], l[1]); c.lineTo(l[0], l[1] + l[2]); c.stroke();
      });
      K.Skins.paint(skin, { ctx: c, x: 540, y: 640, r: 170, held: false, energy: 0, dead: false, danger: 0, now: 0, wob: 0, phase: 0, look: 0, blink: false, expanded: false, mood: 'joy' });
      // 로고
      c.save(); c.shadowColor = 'rgba(60,20,10,0.25)'; c.shadowBlur = 24; c.drawImage(logo, 290, 70, 500, 200); c.restore();
      // 기록 숫자
      var ink = Z.stars > 0.5 ? '#ffffff' : '#1d2833';
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.font = '900 210px "Boing Num", ' + getComputedStyle(document.body).fontFamily;
      var num = String(rec.height), nw = c.measureText(num).width;
      c.font = '800 80px "Boing Num", ' + getComputedStyle(document.body).fontFamily; var mw = c.measureText('m').width;
      var x0 = 540 - (nw + 14 + mw) / 2, by = 1140;
      c.lineJoin = 'round'; c.lineWidth = 18; c.strokeStyle = Z.stars > 0.5 ? 'rgba(10,14,34,0.45)' : 'rgba(255,255,255,0.85)';
      c.textAlign = 'left';
      c.font = '900 210px "Boing Num", ' + getComputedStyle(document.body).fontFamily; c.strokeText(num, x0, by); c.fillStyle = ink; c.fillText(num, x0, by);
      c.font = '800 80px "Boing Num", ' + getComputedStyle(document.body).fontFamily; c.strokeText('m', x0 + nw + 14, by); c.fillText('m', x0 + nw + 14, by);
      // 통과 수(아이콘 + 숫자), 이름(있으면)
      c.textAlign = 'center'; c.font = '800 56px "Boing Num", ' + getComputedStyle(document.body).fontFamily;
      var sub = '▲ ' + rec.passed + (name ? '   ·   ' + name : '');
      c.lineWidth = 12; c.strokeText(sub, 540, 1240); c.fillStyle = ink; c.globalAlpha = 0.85; c.fillText(sub, 540, 1240); c.globalAlpha = 1;
      return new Promise(function (res, rej) { cv.toBlob(function (b) { if (b) res(b); else rej(new Error('blob')); }, 'image/jpeg', 0.9); }); // JPEG: 메신저로 보내기 가볍게(PNG의 약 1/4)
    });
  }

  var incoming = null;
  function incomingCard() {
    currentCard = incomingCard;
    var p = incoming.payload, st = incoming.check.status;
    var who = p.name ? S.incomingFrom.replace('{name}', p.name) : S.incomingFriend;
    var badge = { verified: S.statusVerified, unverified: S.statusUnverified, mismatch: S.statusMismatch, version: S.statusVersion }[st];
    showCard('<div class="card-mascot"><i></i></div>' +
      '<div class="card-title">' + S.incomingTitle + '</div>' +
      '<div class="card-sub">' + esc(who) + '</div>' +
      '<div class="vs-score">' + p.height + '<small>m</small> <span>· ' + S.passedLabel + ' ' + p.passed + '</span></div>' +
      '<div class="vs-status ' + st + '">' + esc(badge) + '</div>' +
      (st !== 'version' ? '<button type="button" class="btn-primary" data-act="accept">' + S.accept + '</button>' : '') +
      '<button type="button" class="btn-ghost" data-act="home">' + S.later + '</button>', menuActions);
  }

  function versusResultCard(rec) {
    var v = rec.versus, diff = Math.abs(rec.height - v.height);
    showCard('<div class="vs-result ' + v.result + '">' + S[v.result] + '</div>' +
      '<div class="card-title">' + rec.height + '<small>m</small></div>' +
      '<div class="card-sub">' + esc(S.vsLine.replace('{name}', v.name || S.vsPrefix).replace('{h}', v.height)) + (diff ? ' · ' + S.vsDiff.replace('{d}', diff) : '') + '</div>' +
      (rec.coinsEarned > 0 ? '<div class="earned">' + STAR + ' ' + S.earned.replace('{n}', rec.coinsEarned) + ' <small>· ' + rec.coins + '</small></div>' : '') +
      (rec.canShare ? '<button type="button" class="btn-primary" data-act="share">' + S.challengeBack + '</button>' : '') +
      '<div class="btn-row"><button type="button" class="btn-ghost" data-act="rematch">' + S.rematch + '</button>' +
      '<button type="button" class="btn-ghost" data-act="home">' + S.home + '</button></div>', menuActions);
  }

  // ── 외형 화면(명세서 16.2) ──
  var STAR = '<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/></svg>';
  function skinsCard(selected) {
    // 처음 들어올 때의 화면으로 돌아간다(외형 화면 안에서 다시 그릴 때는 기존 값을 유지)
    var back = currentCard && currentCard !== skinsCardCurrent ? currentCard : (skinsBack || readyCard);
    var list = ctl.skinCatalog();
    var sel = selected && list.filter(function (k) { return k.id === selected && !k.owned; })[0];
    var html = '<div class="card-title">' + S.skinsTitle + '</div>' +
      '<button type="button" class="icon-btn small card-close" data-act="close" aria-label="' + esc(S.close) + '"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<div class="coin-pill">' + STAR + ' <b>' + ctl.coins() + '</b> ' + S.coinUnit + '</div>' +
      '<div class="skin-grid">';
    list.forEach(function (k) {
      var status = k.equipped ? S.equipped : k.owned ? S.equip : STAR + k.price;
      html += '<button type="button" class="skin-tile' + (k.equipped ? ' on' : '') + (k.owned ? '' : ' locked') + (sel && sel.id === k.id ? ' sel' : '') + '" data-act="tile" data-id="' + k.id + '"' +
        ' aria-label="' + esc(S.skinNames[k.id]) + ' · ' + esc(k.equipped ? S.equipped : k.owned ? S.equip : S.unlockFor.replace('{n}', k.price)) + '">' +
        '<canvas data-skin="' + k.id + '"></canvas><b>' + esc(S.skinNames[k.id]) + '</b><span>' + status + '</span></button>';
    });
    html += '</div>';
    if (sel) {
      html += '<div class="buy-bar"><span>' + esc(S.skinNames[sel.id]) + '</span>' +
        (sel.affordable
          ? '<button type="button" class="btn-primary small" data-act="buy" data-id="' + sel.id + '">' + STAR + ' ' + sel.price + ' ' + S.unlockBtn + '</button>'
          : '<em>' + S.needMore.replace('{n}', sel.price - ctl.coins()) + '</em>') + '</div>';
    } else {
      html += '<div class="card-hint">' + S.coinsHint.replace('{p}', balance.cosmetics.reward.perPassed).replace('{m}', balance.cosmetics.reward.max) + '</div>';
    }
    showCard(html, {
      tile: function (el) {
        var id = el.getAttribute('data-id'), k = list.filter(function (q) { return q.id === id; })[0];
        if (k.owned) { ctl.equipSkin(id); skinsCard(null); } else skinsCard(id);
        var again = ui.card.querySelector('[data-id="' + id + '"]'); if (again) again.focus({ preventScroll: true });
      },
      buy: function (el) { var id = el.getAttribute('data-id'); if (ctl.buySkin(id) === 'ok') audio.play('fanfare'); skinsCard(null); },
      close: function () { back(); }
    }, 'skins');
    currentCard = skinsCardCurrent;
    skinsBack = back;
    ui.card.querySelectorAll('canvas[data-skin]').forEach(function (cv) { K.Skins.preview(cv, cv.getAttribute('data-skin'), { size: 48 }); });
  }
  var skinsBack = null;
  function skinsCardCurrent() { skinsCard(null); }

  // ── 설정 화면 ──
  function settingsCard() {
    var back = currentCard || readyCard;
    var st = ctl.profile.settings;
    function sw(key, label, detail, disabled) {
      return '<div class="set-row"><div><b>' + label + '</b>' + (detail ? '<small>' + detail + '</small>' : '') + '</div>' +
        '<button type="button" class="switch" role="switch" aria-label="' + esc(label) + '" aria-checked="' + (!!st[key] && !disabled) + '"' +
        (disabled ? ' disabled' : ' data-act="toggle" data-key="' + key + '"') + '></button></div>';
    }
    // 언어가 많아 목록 상자로 고른다(설정 순서는 save.js의 LANGUAGES)
    var langs = '<select class="lang-select" id="lang-select" aria-label="' + esc(S.language) + '">' + K.Save.LANGUAGES.filter(function (l) { return K.stringsByLang[l]; }).map(function (l) {
      return '<option value="' + l + '"' + (st.language === l ? ' selected' : '') + '>' + esc(K.stringsByLang[l].langName) + '</option>';
    }).join('') + '</select>';
    showCard(
      '<div class="card-title">' + S.settingsTitle + '</div>' +
      '<button type="button" class="icon-btn small card-close" data-act="close" aria-label="' + esc(S.close) + '"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      sw('sfx', S.sfx) +
      sw('bgm', S.music) +
      sw('haptics', S.haptics, audio.canVibrate ? '' : S.hapticsNone, !audio.canVibrate) +
      sw('reducedEffects', S.reducedEffects, S.reducedEffectsDetail) +
      '<div class="set-row"><div><b>' + S.language + '</b></div>' + langs + '</div>' +
      '<details class="privacy"><summary>' + S.privacy + '</summary>' + S.privacyBody + '</details>' +
      (ctl.state === 'READY' || ctl.state === 'RESULT'
        ? '<div class="set-row"><div><b>' + S.replayTutorial + '</b></div><button type="button" class="btn-ghost inline" data-act="tutorial">' + S.start + '</button></div>' : ''),
      {
        toggle: function (el) {
          var key = el.getAttribute('data-key'), patch = {};
          patch[key] = !ctl.profile.settings[key];
          ctl.updateSettings(patch);
          if (key === 'sfx' && patch.sfx) audio.play('chime');
          settingsCard(); currentCard = back;
          var again = ui.card.querySelector('[data-key="' + key + '"]'); if (again) again.focus({ preventScroll: true });
        },
        tutorial: function () { ctl.startTutorial(); afterAction(); },
        close: function () { back(); }
      }, 'settings');
    currentCard = back;
    var sel = $('lang-select');
    sel.addEventListener('change', function () {
      ctl.updateSettings({ language: sel.value }); applyLanguage(); settingsCard(); currentCard = back;
      var again = $('lang-select'); if (again) again.focus({ preventScroll: true });
    });
    sel.addEventListener('keydown', function (e) { e.stopPropagation(); }); // 목록에서 방향키는 게임 키가 아님
  }

  function applySettings() {
    view.setReducedEffects(ctl.profile.settings.reducedEffects);
    document.body.classList.toggle('reduced', !!ctl.profile.settings.reducedEffects);
  }
  function applyLanguage() {
    S = K.stringsByLang[ctl.profile.settings.language] || K.stringsByLang.ko;
    view.setStrings(S);
    document.documentElement.lang = ctl.profile.settings.language;
    document.title = S.title;
    ui.canvas.setAttribute('aria-label', S.canvasLabel);
    ui.pause.setAttribute('aria-label', S.pause);
    ui.settings.setAttribute('aria-label', S.settings);
    ui.bestChip.title = S.bestScope;
    hudCache = {};
    if (ctl.state === 'READY' || ctl.state === 'RESULT') ui.note.textContent = idleNote();
    renderBestChip();
    renderCoach();
  }

  function renderBestChip() {
    var mode = ctl.displayMode();
    var pm = ctl.mode === 'tutorial' ? ctl.lastPlayMode : ctl.state === 'READY' ? ctl.lastPlayMode : ctl.mode;
    if (pm === 'versus') { ui.bestLabel.textContent = S.vsPrefix; ui.best.innerHTML = ctl.getBest(mode, 'versus') + '<small>m</small>'; return; }
    ui.bestLabel.textContent = pm === 'daily' ? S.dailyPrefix + ' ' + S.best : (pm === 'growth' ? S.growthPrefix + ' · ' : '') + S.mode[mode] + ' ' + S.best;
    ui.best.innerHTML = ctl.getBest(mode, pm) + '<small>m</small>';
  }

  // ── 튜토리얼 안내 ──
  var coachFlashTimer = 0;
  function renderCoach(flash) {
    var t = ctl.mode === 'tutorial' && ctl.tutorial;
    ui.coach.hidden = !t || t.step === 'done';
    ui.meterGoal.hidden = !t || t.step !== 'energy';
    if (!t || t.step === 'done') return;
    var p = t.progress(), dots = '';
    for (var i = 0; i < p.total; i++) dots += '<i class="' + (i <= p.index ? 'on' : '') + '"></i>';
    ui.coachDots.innerHTML = dots;
    var text = S.tutorial[t.step];
    ui.coachTitle.textContent = (p.index + 1) + '/' + p.total + ' · ' + text.title;
    ui.coachHint.textContent = fmt(text.hint, Math.round(balance.tutorial.energyGoal * 100));
    ui.coachHint.classList.remove('warn');
    ui.meterGoal.style.left = (balance.tutorial.energyGoal * 100) + '%';
    if (flash) {
      ui.coach.classList.remove('retry', 'good'); void ui.coach.offsetWidth;
      ui.coach.classList.add(flash);
      clearTimeout(coachFlashTimer);
      coachFlashTimer = setTimeout(function () { ui.coach.classList.remove('retry', 'good'); }, 900);
    }
  }

  ctl.on(function (ev) {
    if (ev.type === 'start') {
      bestAtStart = ctl.best; celebrated = false; ui.heightBox.classList.remove('best');
      if (ctl.mode !== 'tutorial') { view.cue('GO!'); audio.play('go'); }
    }
    if (ev.type === 'gatePassed') bump();
    if (ev.type === 'start' || ev.type === 'resume') {
      hideCard(); ui.pause.disabled = false;
      ui.note.textContent = S.notePlaying;
      renderBestChip(); renderCoach();
    } else if (ev.type === 'pause') {
      ui.pause.disabled = true; pausedCard(ev.reason);
    } else if (ev.type === 'resumeCountdown') {
      // 준비 시간: 다음 틈이 보이도록 카드를 닫고, 캔버스가 캐릭터 주위에 준비 링을 그린다.
      hideCard(); ui.pause.disabled = false;
      ui.note.textContent = ctl.run.logicalHeld ? S.readyHeld : S.readyFree;
    } else if (ev.type === 'death') {
      ui.pause.disabled = true;
      ui.note.textContent = S.reason[ev.reason] || S.reason.unknown;
      renderBestChip();
    } else if (ev.type === 'result') {
      resultCard(ev.record);
    } else if (ev.type === 'tutorialStep') {
      renderCoach(ev.index > 0 ? 'good' : null);
    } else if (ev.type === 'tutorialZone') {
      renderCoach('good');
      ui.coachHint.textContent = S.tutorial.zone;
    } else if (ev.type === 'tutorialRetry') {
      renderCoach('retry');
      ui.coachHint.textContent = (S.reason[ev.reason] || S.reason.unknown) + ' ' + S.tutorial.retry;
      ui.coachHint.classList.add('warn');
    } else if (ev.type === 'tutorialComplete') {
      ui.pause.disabled = true; renderCoach(); tutorialDoneCard(ev.skipped);
      ui.note.textContent = idleNote();
    } else if (ev.type === 'menu') {
      ui.pause.disabled = true; renderCoach(); readyCard();
      ui.note.textContent = idleNote();
    } else if (ev.type === 'settings') {
      applySettings();
    } else if (ev.type === 'levelUp') {
      ui.pause.disabled = true;
      levelUpCard(ev.level, ev.offers);
    } else if (ev.type === 'gateBroken' && ev.cause === 'shield') {
      ui.note.textContent = S.shieldBroke;
    }
  });

  // 높이 숫자가 통과할 때마다 톡 튄다. 흔들림·번쩍임은 캔버스 카메라가 맡는다(view.js)
  function bump() {
    if (reduced()) return;
    ui.heightBox.classList.remove('bump'); void ui.heightBox.offsetWidth; ui.heightBox.classList.add('bump');
  }
  // 판 도중 이 모드의 최고 기록을 넘는 순간 한 번 축하(대결·튜토리얼 제외)
  var bestAtStart = 0, celebrated = false;
  function checkBestCrossed() {
    if (celebrated || ctl.state !== 'PLAYING' || bestAtStart <= 0 || ctl.mode === 'tutorial' || ctl.mode === 'versus') return;
    if (K.Simulation.heightMeters(ctl.run, balance) <= bestAtStart) return;
    celebrated = true;
    view.celebrate(S.newBest);
    audio.sting('best');
    ui.heightBox.classList.add('best');
  }

  // 키보드 안내는 마우스·키보드 기기에서만(터치폰에서는 의미 없는 글자)
  var coarse = root.matchMedia && root.matchMedia('(pointer: coarse)');
  function idleNote() { return coarse && coarse.matches ? '' : S.noteIdle; }
  document.body.classList.toggle('touch', !!(coarse && coarse.matches)); // 터치 기기: 키보드 안내·기술 정보 숨김

  // ── 입력 ──
  function bindPointer(el) {
    el.addEventListener('pointerdown', function (e) {
      audio.unlock();
      var ok = ctl.pointerDown({ pointerId: e.pointerId, clientX: e.clientX, button: e.button, surfaceWidth: el === ui.canvas ? view.worldWidthCss() : el.getBoundingClientRect().width });
      if (ok) { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (err) { /* 포인터가 이미 사라짐 */ } }
    });
    el.addEventListener('pointermove', function (e) { if (ctl.pointerMove({ pointerId: e.pointerId, clientX: e.clientX })) e.preventDefault(); });
    el.addEventListener('pointerup', function (e) { ctl.pointerUp({ pointerId: e.pointerId }); });
    // 취소·캡처 상실은 손 떼기가 아니다(FIX-03). 정상 해제 뒤 오는 lostpointercapture는 무시된다.
    el.addEventListener('pointercancel', function (e) { ctl.pointerCancel({ pointerId: e.pointerId }); });
    el.addEventListener('lostpointercapture', function (e) { ctl.pointerCancel({ pointerId: e.pointerId }); });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  bindPointer(ui.canvas);
  ui.pause.addEventListener('click', function () { ctl.pause('button'); });
  ui.settings.addEventListener('click', function () {
    audio.unlock();
    if (ctl.state === 'PLAYING' || ctl.state === 'RESUME_COUNTDOWN') ctl.pause('settings');
    if (ctl.state === 'DEAD') return;
    settingsCard();
  });

  // 카드 안의 버튼에 포커스가 있으면 Space/Enter는 그 버튼을 누른다(게임 키로 쓰지 않음).
  function onCardButton(e) { return !ui.overlay.hidden && e.target && e.target.closest && e.target.closest('.card') && e.target.tagName === 'BUTTON'; }
  window.addEventListener('keydown', function (e) {
    audio.unlock();
    if ((e.code === 'Space' || e.code === 'Enter') && onCardButton(e)) return;
    if (e.target === ui.pause && e.code !== 'Escape') return;
    if (ctl.keyDown({ code: e.code, repeat: e.repeat })) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'Space' && onCardButton(e)) return;
    if (ctl.keyUp({ code: e.code })) e.preventDefault();
  });
  window.addEventListener('blur', function () { ctl.pause('blur'); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) ctl.pause('hidden'); });

  // ── HUD ──
  var hudCache = {};
  function setText(el, key, value) { if (hudCache[key] !== value) { hudCache[key] = value; el.textContent = value; } }
  function renderHud() {
    var run = ctl.run;
    var tut = ctl.mode === 'tutorial';
    setText(ui.height, 'h', String(K.Simulation.heightMeters(run, balance)));
    var ab = ctl.activeBalance();
    var gs = ctl.mode === 'growth' ? ctl.growth : null;
    var mps = (K.Simulation.currentSpeed(run, ab) / balance.world.unitsPerMeter).toFixed(1);
    setText(ui.gates, 'g', tut ? S.practice : (gs ? S.level.replace('{n}', gs.level) + ' · ' : '') + fmt(S.passedHud, run.passedCount) + ' · ' + mps + ' m/s');
    var a0 = ab.ascent.baseSpeed, a1 = a0 + ab.ascent.maxIncrease;
    var sn = Math.max(0, Math.min(1, (K.Simulation.currentSpeed(run, ab) - a0) / Math.max(1, a1 - a0)));
    audio.setWind(ctl.state === 'PLAYING' && !tut ? 0.25 + sn * 0.75 : 0);
    // 배경음악: 플레이 중에는 속도에 따라 빨라지고, 멈춘 동안은 먹먹하게, 실패 순간에는 끊는다
    var st = ctl.state;
    // 곡: 시작·결과 화면 → menu, 성장 → quest, 오늘의 도전 → daily, 튜토리얼 → dawn, 그 밖에는 높이 구간(100 m마다, 화면 하늘색과 같은 순서)
    var track = st === 'READY' || st === 'RESULT' ? 'menu' : gs ? 'quest' : ctl.mode === 'daily' ? 'daily' : tut ? 'dawn'
      : K.View.ZONES[Math.floor(K.Simulation.heightMeters(run, balance) / 100) % K.View.ZONES.length].id;
    audio.setMusic(st === 'PLAYING' ? 'play' : st === 'DEAD' ? 'off' : st === 'READY' || st === 'RESULT' ? 'menu' : 'muffled', tut ? 0 : sn, track);
    if (hudCache.xpOn !== !!gs) { hudCache.xpOn = !!gs; ui.xpbar.hidden = !gs; }
    if (gs) { var xpw = Math.min(100, 100 * gs.xp / gs.xpToNext).toFixed(1) + '%'; if (hudCache.xpw !== xpw) { hudCache.xpw = xpw; ui.xpfill.style.width = xpw; } }
    var pct = Math.min(100, Math.floor(run.energy / ab.energy.failAt * 100)); // 한계 대비 비율(강철 폐면 한계 120%)
    var warn = run.energy > ab.energy.warningAbove * ab.energy.failAt;
    if (hudCache.pct !== pct) {
      hudCache.pct = pct;
      ui.pct.textContent = pct + '%';
      ui.fill.style.width = pct + '%';
      ui.meter.setAttribute('aria-valuenow', pct);
    }
    if (hudCache.warn !== warn) { hudCache.warn = warn; ui.fill.classList.toggle('warn', warn); ui.meterHead.classList.toggle('warn', warn); }
    setText(ui.meterLabel, 'ml', warn ? S.energyWarning : run.logicalHeld ? S.energyCharging : run.energy > 0.02 ? S.energyReleasing : S.energy);
    var held = (ctl.state === 'PLAYING' && run.logicalHeld) || (ctl.state === 'RESUME_COUNTDOWN' && ctl.input.physicalHeld());
    if (hudCache.held !== held) { hudCache.held = held; ui.pad.setAttribute('aria-pressed', String(held)); }
    setText(ui.padLabel, 'pl', held ? S.padHeld : S.padIdle);
  }

  // ── 크기: 회전·크기 변경 시 일시정지(입력 앵커는 일시정지에서 폐기, 다음 누름에서 배율 재계산) ──
  var lastSize = null;
  function resize() {
    var r = ui.canvas.getBoundingClientRect();
    var size = Math.round(r.width) + 'x' + Math.round(r.height);
    if (lastSize && size !== lastSize) ctl.pause('resize');
    lastSize = size;
    view.resize();
  }
  if (root.ResizeObserver) new ResizeObserver(resize).observe(ui.canvas); else window.addEventListener('resize', resize);
  resize();

  // ── 단일 루프 ──
  var lastTone = null, lastState = null;
  var splash = document.getElementById('splash'), bootAt = performance.now();
  function frame(now) {
    ctl.frame(now);
    renderHud();
    checkBestCrossed();
    view.render(ctl, now);
    if (splash) { var sp = splash; splash = null; setTimeout(function () { sp.classList.add('out'); setTimeout(function () { sp.remove(); }, 450); }, Math.max(0, 700 - (performance.now() - bootAt))); }
    // 배경 밝기에 맞춰 HUD 글자색 전환
    var tone = view.tone();
    if (tone !== lastTone) { lastTone = tone; ui.stage.classList.toggle('tone-dark', tone === 'dark'); ui.stage.classList.toggle('tone-light', tone !== 'dark'); }
    if (ctl.state !== lastState) { lastState = ctl.state; ui.stage.classList.toggle('playing', ctl.state === 'PLAYING'); ui.stage.classList.toggle('menu', ctl.state === 'READY' || ctl.state === 'RESULT'); }
    requestAnimationFrame(frame);
  }

  applySettings();
  applyLanguage();
  ui.note.textContent = idleNote();
  readyCard();

  // 도전장 링크(#c=...)로 열렸으면: 해독 → 직접 재계산으로 검증 → 도전장 화면. 처리 후 주소에서 지운다.
  var m = /[#&?]c=([A-Za-z0-9_-]{2,12000})/.exec(location.hash) || /[?&]c=([A-Za-z0-9_-]{2,12000})/.exec(location.search);
  if (m) {
    // 도전장 데이터는 주소에서 지운다(#c= 와 ?c= 모두). 다른 쿼리는 남긴다.
    try { var q = location.search.replace(/([?&])c=[^&]*&?/, '$1').replace(/[?&]$/, ''); history.replaceState(null, '', location.pathname + q); } catch (e) { /* 무시 */ }
    decodeChallenge(m[1]).then(function (payload) {
      var check = K.Challenge.verify(payload, balance);
      incoming = { payload: payload, check: check };
      if (check.status !== 'version') ctl.acceptChallenge(payload, check);
      incomingCard();
    }).catch(function () { toast(S.badLink); });
  }
  requestAnimationFrame(frame);

  // 디버그/검증용 핸들(읽기 전용 용도)
  root.KKUK.debug = { ctl: ctl, audio: audio, view: view, shareImage: makeShareImage };
})(typeof globalThis !== 'undefined' ? globalThis : this);
