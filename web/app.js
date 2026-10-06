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
    xpbar: $('xpbar'), xpfill: $('xpfill')
  };

  // 저장 매체: localStorage. 막혀 있거나(사생활 보호 모드 등) 실패해도 게임은 그대로 진행한다.
  var storage = {
    read: function (k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } },
    write: function (k, v) { root.localStorage.setItem(k, v); }
  };

  var ctl = K.GameController.createGameController({ balance: balance, store: storage });
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
    ui.card.innerHTML = html;
    ui.overlay.hidden = false;
    ui.card.querySelectorAll('[data-act]').forEach(function (el) {
      el.addEventListener('click', function () { audio.unlock(); actions[el.getAttribute('data-act')](el); });
    });
    var first = ui.card.querySelector('.btn-primary, .mode-tile, .offer') || ui.card.querySelector('button');
    if (first) first.focus({ preventScroll: true });
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
      return '<div class="m-row"><span class="m-text">' + esc(S.missions[m.id].replace('{n}', m.goal)) + '</span>' +
        '<span class="m-rew">' + STAR + m.reward + '</span>' +
        '<span class="m-bar"><i style="width:' + pct + '%"></i></span><span class="m-prog">' + m.progress + '/' + m.goal + '</span></div>';
    }).join('') + '</div>';
  }
  function readyCard() {
    currentCard = readyCard;
    var first = ctl.needsTutorial();
    if (!first && ctl.missionList().length) {
      // 튜토리얼을 마친 뒤에는 조작 설명 대신 미션을 보여 준다
      showCard('<div class="card-title">' + S.title + '</div>' + missionsPanel() + modeTiles() +
        '<div class="btn-row"><button type="button" class="btn-ghost" data-act="skins">' + STAR + ' ' + S.skinsTitle + ' · ' + ctl.coins() + '</button>' +
        '<button type="button" class="btn-ghost" data-act="settings">' + S.settings + '</button></div>', menuActions);
      return;
    }
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
      '<div class="card-title">' + rec.height + '<small>m</small></div>' +
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
      '<div class="card-hint">' + S.retryHint + '<br><span class="mono">seed ' + rec.seed + ' · ' + rec.rulesVersion + '/' + rec.balanceVersion + '/' + rec.generatorVersion + '</span></div>',
      menuActions);
  }

  // ── 성장 모드: 레벨업 카드 ──
  function levelUpCard(level, offers) {
    currentCard = null;
    var html = '<div class="card-title">' + S.levelUpTitle + '</div>' +
      '<div class="card-sub">' + S.level.replace('{n}', level) + ' · ' + S.levelUpSub + '</div><div class="offers">';
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
  // 압축: 브라우저 CompressionStream(deflate-raw) 지원 시 'z', 아니면 압축 없이 'r'
  function streamBytes(bytes, Ctor, fmt) {
    return new Response(new Blob([bytes]).stream().pipeThrough(new Ctor(fmt))).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function encodeChallenge(payload) {
    var raw = K.Challenge.toBytes(payload);
    if (!root.CompressionStream) return Promise.resolve('r' + K.Challenge.b64url(raw));
    return streamBytes(raw, root.CompressionStream, 'deflate-raw').then(function (z) { return 'z' + K.Challenge.b64url(z); });
  }
  function decodeChallenge(code) {
    var body = K.Challenge.unb64url(code.slice(1));
    if (code[0] === 'r') return Promise.resolve(K.Challenge.fromBytes(body));
    if (code[0] !== 'z' || !root.DecompressionStream) return Promise.reject(new Error('format'));
    return streamBytes(body, root.DecompressionStream, 'deflate-raw').then(function (b) { return K.Challenge.fromBytes(b); });
  }
  function challengeLink(code) { return location.origin + location.pathname + '#c=' + code; }

  function shareCard() {
    var back = currentCard || readyCard;
    var payload = ctl.challengePayload();
    if (!payload) return;
    var rec = ctl.lastRecord;
    showCard('<div class="card-title">' + (rec.versus ? S.challengeBack : S.challengeTitle) + '</div>' +
      '<button type="button" class="icon-btn small card-close" data-act="close" aria-label="' + esc(S.close) + '"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<div class="card-sub">' + esc(S.shareMsg.replace('{h}', rec.height)) + '</div>' +
      '<label class="name-field"><span>' + S.nameLabel + '</span><input id="nick" type="text" maxlength="12" autocomplete="nickname" placeholder="' + esc(S.namePlaceholder) + '" value="' + esc(ctl.nickname()) + '"></label>' +
      '<div class="share-note" id="share-note"></div>' +
      (isLocalHost() ? '<div class="card-warn local">' + S.localWarn + '</div>' : '') +
      '<button type="button" class="btn-primary" data-act="send">' + S.shareBtn + '</button>' +
      '<button type="button" class="btn-ghost" data-act="copy">' + S.copyBtn + '</button>', {
      close: function () { back(); },
      send: function () { doShare(true); },
      copy: function () { doShare(false); }
    }, 'share');
    currentCard = function () { shareCard(); };
    var input = $('nick');
    input.addEventListener('keydown', function (e) { e.stopPropagation(); }); // 이름 입력 중 게임 키 처리 안 함
    input.addEventListener('keyup', function (e) { e.stopPropagation(); });

    function build() {
      var p = ctl.challengePayload();
      p.name = ctl.setNickname(input.value);
      return encodeChallenge(p).then(function (code) {
        if (code.length > K.Challenge.MAX_LINK_CHARS) { // 너무 길면 고스트 없이
          p.replay = null; $('share-note').textContent = S.noGhostNote;
          return encodeChallenge(p);
        }
        return code;
      }).then(challengeLink);
    }
    function doShare(native) {
      build().then(function (url) {
        var text = S.shareMsg.replace('{h}', rec.height);
        if (native && navigator.share) {
          return navigator.share({ title: S.title, text: text, url: url }).then(function () { toast(S.shared); }, function () { /* 사용자가 취소 */ });
        }
        return navigator.clipboard.writeText(text + ' ' + url).then(function () { toast(S.copied); });
      }).catch(function () { toast(S.shareFail); });
    }
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
      html += '<div class="card-hint">' + S.coinsHint + '</div>';
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
    var langs = Object.keys(K.stringsByLang).map(function (l) {
      return '<button type="button" data-act="lang" data-lang="' + l + '" aria-pressed="' + (st.language === l) + '">' + K.stringsByLang[l].langName + '</button>';
    }).join('');
    showCard(
      '<div class="card-title">' + S.settingsTitle + '</div>' +
      '<button type="button" class="icon-btn small card-close" data-act="close" aria-label="' + esc(S.close) + '"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      sw('sfx', S.sfx) +
      sw('music', S.music, S.musicNone, true) +
      sw('haptics', S.haptics, audio.canVibrate ? '' : S.hapticsNone, !audio.canVibrate) +
      sw('reducedEffects', S.reducedEffects, S.reducedEffectsDetail) +
      '<div class="set-row"><div><b>' + S.language + '</b></div><div class="seg">' + langs + '</div></div>' +
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
        lang: function (el) { ctl.updateSettings({ language: el.getAttribute('data-lang') }); applyLanguage(); settingsCard(); currentCard = back; },
        tutorial: function () { ctl.startTutorial(); afterAction(); },
        close: function () { back(); }
      }, 'settings');
    currentCard = back;
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
    document.querySelector('.brand-name').textContent = S.title;
    hudCache = {};
    if (ctl.state === 'READY' || ctl.state === 'RESULT') ui.note.textContent = S.noteIdle;
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
      shake();
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
      shake();
    } else if (ev.type === 'tutorialComplete') {
      ui.pause.disabled = true; renderCoach(); tutorialDoneCard(ev.skipped);
      ui.note.textContent = S.noteIdle;
    } else if (ev.type === 'menu') {
      ui.pause.disabled = true; renderCoach(); readyCard();
      ui.note.textContent = S.noteIdle;
    } else if (ev.type === 'settings') {
      applySettings();
    } else if (ev.type === 'levelUp') {
      ui.pause.disabled = true;
      levelUpCard(ev.level, ev.offers);
    } else if (ev.type === 'gateBroken' && ev.cause === 'shield') {
      ui.note.textContent = S.shieldBroke;
    }
  });

  function shake() {
    if (reduced()) return;
    ui.stage.classList.remove('shake'); void ui.stage.offsetWidth; ui.stage.classList.add('shake');
  }

  // ── 입력 ──
  function bindPointer(el) {
    el.addEventListener('pointerdown', function (e) {
      audio.unlock();
      var ok = ctl.pointerDown({ pointerId: e.pointerId, clientX: e.clientX, button: e.button, surfaceWidth: el.getBoundingClientRect().width });
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
  bindPointer(ui.pad);
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
  var lastTone = null;
  function frame(now) {
    ctl.frame(now);
    renderHud();
    view.render(ctl, now);
    // 배경 밝기에 맞춰 HUD 글자색 전환
    var tone = view.tone();
    if (tone !== lastTone) { lastTone = tone; ui.stage.classList.toggle('tone-dark', tone === 'dark'); ui.stage.classList.toggle('tone-light', tone !== 'dark'); }
    requestAnimationFrame(frame);
  }

  applySettings();
  applyLanguage();
  ui.note.textContent = S.noteIdle;
  readyCard();

  // 도전장 링크(#c=...)로 열렸으면: 해독 → 직접 재계산으로 검증 → 도전장 화면. 처리 후 주소에서 지운다.
  var m = /[#&]c=([A-Za-z0-9_-]{2,12000})/.exec(location.hash);
  if (m) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 무시 */ }
    decodeChallenge(m[1]).then(function (payload) {
      var check = K.Challenge.verify(payload, balance);
      incoming = { payload: payload, check: check };
      if (check.status !== 'version') ctl.acceptChallenge(payload, check);
      incomingCard();
    }).catch(function () { toast(S.badLink); });
  }
  requestAnimationFrame(frame);

  // 디버그/검증용 핸들(읽기 전용 용도)
  root.KKUK.debug = { ctl: ctl, audio: audio };
})(typeof globalThis !== 'undefined' ? globalThis : this);
