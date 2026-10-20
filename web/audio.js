// AudioHapticsAdapter(웹) — 효과음·배경음악·진동. 게임 규칙에 영향을 주지 않는다.
// 효과음과 배경음악은 Web Audio로 직접 합성한다(외부 음원 없음 → 별도 사용 권한 불필요).
// 브라우저 정책상 첫 사용자 입력 후에 소리를 켤 수 있다. 미지원·실패 시 조용히 무시한다.
(function (root) {
  'use strict';

  function createAudioHaptics(getSettings) {
    var ac = null, master = null, noiseBuf = null, musicBus = null, musicFilter = null;
    var canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

    function unlock() {
      // iOS Safari는 전화·다른 앱 소리 뒤에 'interrupted' 상태가 되므로 running이 아니면 모두 재개한다
      if (ac) { if (ac.state !== 'running' && !document.hidden) ac.resume().catch(function () {}); return; }
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      try {
        ac = new AC();
        master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
        noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.3), ac.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        // 음악 버스: 음색 필터(멈춤 때 먹먹하게) → 음량 → master
        musicFilter = ac.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 16000; musicFilter.Q.value = 0.5;
        musicBus = ac.createGain(); musicBus.gain.value = 0;
        musicFilter.connect(musicBus); musicBus.connect(master);
      } catch (e) { ac = null; }
    }

    // 탭이 가려지면 소리를 멈춘다(그동안 화면 루프가 돌지 않아 바람 소리·음악이 마지막 상태로 계속 남는 문제).
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (!ac) return;
        if (document.hidden) ac.suspend().catch(function () {});
        else ac.resume().catch(function () {});
      });
    }

    function ok() { return ac && master && getSettings().sfx; }

    // 단음: f0 → f1 주파수 미끄러짐, 짧은 감쇠
    function tone(f0, f1, dur, type, gain, delay) {
      if (!ok()) return;
      var t = ac.currentTime + (delay || 0);
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    }

    function noise(dur, cutoff, gain) {
      if (!ok()) return;
      var t = ac.currentTime;
      var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = cutoff;
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); s.stop(t + dur);
    }

    function vibrate(ms) {
      if (!canVibrate || !getSettings().haptics) return;
      try { navigator.vibrate(ms); } catch (e) { /* 정책상 막힘 */ }
    }

    var sounds = {
      press: function () { tone(330, 230, 0.07, 'sine', 0.07); },
      release: function (e) {
        tone(240 + e * 260, 520 + e * 760, 0.09 + e * 0.08, 'triangle', 0.07 + e * 0.09);
        if (e > 0.35) vibrate(Math.round(10 + e * 18));
      },
      pass: function () { tone(988, 988, 0.05, 'sine', 0.05); tone(1319, 1319, 0.07, 'sine', 0.05, 0.05); },
      death: function () { noise(0.2, 900, 0.18); tone(180, 55, 0.28, 'sawtooth', 0.05); vibrate(45); },
      retry: function () { tone(260, 170, 0.16, 'triangle', 0.06); vibrate(25); },
      chime: function () { tone(660, 660, 0.08, 'sine', 0.05); tone(880, 880, 0.12, 'sine', 0.05, 0.07); },
      fanfare: function () { [660, 880, 1175].forEach(function (f, i) { tone(f, f, 0.14, 'sine', 0.06, i * 0.08); }); },
      tick: function () { tone(740, 740, 0.04, 'sine', 0.04); },
      go: function () { tone(990, 990, 0.06, 'sine', 0.05); },
      soft: function () { tone(520, 420, 0.06, 'sine', 0.04); },
      tap: function () { tone(620, 500, 0.035, 'sine', 0.035); vibrate(6); }
    };

    function onEvent(ev) {
      switch (ev.type) {
        case 'press': sounds.press(); break;
        case 'release': sounds.release(ev.energy); break;
        case 'gatePassed': sounds.pass(); break;
        case 'death': sounds.death(); break;
        case 'tutorialRetry': sounds.retry(); break;
        case 'tutorialStep': case 'tutorialZone': sounds.chime(); break;
        case 'tutorialDone': sounds.fanfare(); break;
        case 'result': if (ev.record && ev.record.height > 0) sting(ev.record.isBest ? 'best' : 'result'); break;
        case 'resumeCountdown': sounds.tick(); break;
        case 'resume': sounds.go(); break;
        case 'pause': sounds.soft(); break;
        case 'nearMiss': tone(880, 1320, 0.07, 'triangle', 0.06); tone(1320, 1760, 0.08, 'sine', 0.05, 0.06); vibrate(10); break;
        case 'riskyRelease': tone(392, 784, 0.12, 'square', 0.035); tone(784, 1046, 0.12, 'triangle', 0.05, 0.08); break;
        case 'orbCollected': tone(1175 + Math.min(8, ev.xp) * 60, 1568 + Math.min(8, ev.xp) * 60, 0.06, 'sine', 0.04); break;
        case 'levelUp': sting('level'); break;
        case 'abilityChosen': sounds.chime(); break;
        case 'gateBroken': noise(0.22, 2200, 0.12); tone(440, 220, 0.16, 'square', 0.03); vibrate(30); break;
        case 'gateWidened': tone(520, 780, 0.1, 'triangle', 0.04); break;
      }
    }

    // 바람 소리: 속도에 비례하는 은은한 잡음(효과음 설정을 따름)
    var wind = null;
    function setWind(level) {
      if (!ac || !master) return;
      var target = getSettings().sfx ? level * 0.07 : 0;
      if (!wind) {
        if (target <= 0) return;
        var src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.7;
        var g = ac.createGain(); g.gain.value = 0;
        src.connect(bp); bp.connect(g); g.connect(master); src.start();
        wind = { src: src, bp: bp, g: g, level: -1 };
      }
      if (Math.abs(wind.level - target) < 0.002) return;
      wind.level = target;
      wind.g.gain.setTargetAtTime(target, ac.currentTime, 0.25);
      wind.bp.frequency.setTargetAtTime(380 + level * 900, ac.currentTime, 0.4);
    }

    // ── 배경음악: 직접 합성(외부 음원 없음). 곡마다 8마디(8분음표 64칸) 반복 ──
    // 곡: menu(시작·결과 화면) · 높이 구간 5곡(dawn·sky·sunset·night·aurora, 100 m마다 바뀜, 화면 하늘색 구간과 같음)
    //     · quest(성장 모드) · daily(오늘의 도전)
    // 모드: 'menu'(느리고 부드럽게, 북 없음) | 'play'(속도에 따라 빨라지고, 오래 버틸수록 악기가 한 겹씩 더해짐)
    //       'muffled'(일시정지·카드 선택: 같은 곡을 먹먹하게) | 'off'(실패 순간: 끊음)
    // 곡이 바뀔 때는 마디 첫 박에 맞춰 넘어가고, 그 직전 마디 끝에 짧은 북 채우기를 넣는다.
    // 효과음보다 작게 깔리도록 음악 버스에서 음량을 따로 둔다. 설정의 배경음악(bgm)을 따른다.
    var MUSIC_VOL = 0.6;
    function ch(root, q) { // root: 베이스 음(MIDI), q: 'm'이면 단화음
      var t = root + 12; while (t < 55) t += 12;
      return { bass: root, triad: [t, t + (q === 'm' ? 3 : 4), t + 7] };
    }
    var CH = {
      C: ch(48), D: ch(50), Dm: ch(50, 'm'), E: ch(52), Em: ch(52, 'm'), F: ch(41), G: ch(43), Gm: ch(43, 'm'),
      A: ch(45), Am: ch(45, 'm'), Bb: ch(46), B: ch(47), Eb: ch(51)
    };
    // 베이스(근음에서 반음 거리, null = 쉼)·분산화음(화음 안 순번) 무늬, 한 마디 8칸
    var BP = {
      pulse: [0, null, 12, null, 0, 0, 12, null], walk: [0, null, 12, null, 7, null, 12, null],
      funk: [0, null, 12, 0, null, 0, 12, null], half: [0, null, null, null, 7, null, null, null],
      march: [0, null, 7, null, 0, null, 7, null], soft: [0, null, null, null, null, null, 7, null]
    };
    var AP = { up: [0, 1, 2, 1, 0, 1, 2, 1], roll: [0, 1, 2, 0, 1, 2, 0, 1], wide: [0, 2, 1, 2, 0, 2, 1, 2], sparse: [0, null, 2, null, 1, null, 2, null] };
    // 멜로디: MIDI 음, -1 = 앞 음 이어서, 0 = 쉼표. 한 줄 = 2마디
    var TRACKS = {
      menu: { bpm: [92, 92], prog: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G'], bass: 'soft', arp: 'sparse', lead: 'triangle', pad: true, drums: 'shaker', echo: 0.22, mel: [
        76, -1, 74, 72, 0, 72, 74, 76,   76, -1, -1, 74, 72, -1, 69, -1,
        72, -1, 74, 76, 77, -1, 76, 74,   74, -1, -1, -1, 0, 0, 71, 74,
        76, -1, 79, -1, 77, 76, 74, 76,   72, -1, -1, 69, 72, -1, 76, -1,
        74, -1, 77, -1, 76, 74, 72, 74,   71, -1, 74, -1, 72, -1, -1, 0] },
      dawn: { bpm: [104, 128], prog: ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C'], bass: 'walk', arp: 'roll', lead: 'triangle', pad: true, drums: 'four', mel: [
        69, -1, 72, -1, 77, -1, 76, 72,   76, -1, 72, -1, 67, -1, -1, 0,
        69, -1, 74, 72, 69, -1, 65, -1,   70, -1, 74, -1, 72, -1, 70, 69,
        69, 72, 77, -1, 76, 77, 79, -1,   76, -1, 72, -1, 74, 72, 67, -1,
        70, -1, 74, 77, 76, -1, 74, 72,   72, -1, -1, -1, 67, -1, 0, 0] },
      sky: { bpm: [116, 140], prog: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'], bass: 'pulse', arp: 'up', lead: 'square', drums: 'four', mel: [
        72, -1, 76, 79, 76, -1, 74, 72,   74, -1, 79, -1, 77, 76, 74, -1,
        72, -1, 76, 81, 79, -1, 76, -1,   77, 76, 74, 72, 74, -1, -1, 0,
        79, -1, 79, 81, 79, 76, 72, -1,   74, 76, 77, 79, 74, -1, 71, -1,
        77, 76, 77, 81, 79, -1, 77, 76,   74, -1, 71, 74, 79, -1, -1, 0] },
      sunset: { bpm: [112, 136], prog: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E'], bass: 'funk', arp: 'wide', lead: 'square', drums: 'funk', mel: [
        81, -1, 0, 79, 81, 0, 76, -1,   77, -1, 76, -1, 72, -1, 74, 76,
        79, -1, 0, 76, 79, 0, 84, -1,   83, -1, 81, 79, 74, -1, -1, 0,
        76, -1, 81, -1, 79, 76, 74, 76,   77, -1, -1, 81, 79, -1, 77, 76,
        74, -1, 79, -1, 77, 76, 74, 71,   68, -1, 71, -1, 76, -1, -1, 0] },
      night: { bpm: [100, 124], prog: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'], bass: 'half', arp: 'sparse', lead: 'sine', pad: true, drums: 'half', echo: 0.32, mel: [
        74, -1, -1, 77, 76, -1, 74, -1,   70, -1, -1, -1, 0, 0, 74, 77,
        81, -1, -1, 79, 77, -1, 76, -1,   72, -1, -1, -1, 0, 0, 0, 0,
        77, -1, 81, -1, 79, -1, 77, 74,   74, -1, -1, 70, 74, -1, 77, -1,
        79, -1, 77, -1, 74, -1, 70, -1,   73, -1, -1, -1, 76, -1, 0, 0] },
      aurora: { bpm: [108, 132], prog: ['Em', 'C', 'G', 'D', 'Em', 'C', 'D', 'B'], bass: 'soft', arp: 'roll', arpHigh: true, lead: 'triangle', pad: true, drums: 'half', echo: 0.36, mel: [
        79, -1, -1, 83, 81, -1, 79, -1,   76, -1, -1, -1, 79, -1, 84, -1,
        83, -1, 81, -1, 79, -1, 74, -1,   78, -1, -1, -1, 0, 0, 81, 83,
        86, -1, -1, 83, 79, -1, 76, -1,   79, -1, 84, -1, 83, -1, 79, -1,
        81, -1, 78, -1, 74, -1, 78, 81,   78, -1, -1, -1, 75, -1, 0, 0] },
      quest: { bpm: [120, 144], prog: ['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'D'], bass: 'march', arp: 'up', lead: 'square', drums: 'march', mel: [
        79, -1, 79, 81, 83, -1, 79, -1,   78, -1, 74, -1, 78, 81, 78, -1,
        76, -1, 79, -1, 83, -1, 81, 79,   76, -1, -1, -1, 72, 74, 76, 78,
        79, -1, 83, -1, 86, -1, 83, -1,   81, -1, 78, -1, 74, -1, 78, -1,
        76, 79, 84, -1, 83, -1, 81, -1,   78, -1, -1, 74, 78, -1, 81, 0] },
      daily: { bpm: [118, 142], prog: ['Bb', 'F', 'Gm', 'Eb', 'Bb', 'F', 'Eb', 'F'], bass: 'pulse', arp: 'wide', lead: 'square', drums: 'four', mel: [
        70, 74, 77, -1, 74, -1, 77, 82,   81, -1, 77, -1, 72, -1, 77, -1,
        79, -1, 74, -1, 70, 74, 79, -1,   75, -1, 79, -1, 82, -1, 79, 77,
        77, -1, 82, -1, 81, -1, 77, 74,   72, -1, 77, 81, 84, -1, 81, -1,
        79, -1, 75, -1, 79, 82, 79, 75,   77, -1, -1, -1, 72, -1, 0, 0] }
    };
    var mus = { mode: 'off', on: false, sn: 0, step: 0, next: 0, timer: 0, track: 'menu', want: 'menu', playStart: 0 };
    var echoIn = null, echoDelay = null;

    function bpmNow() { var tr = TRACKS[mus.track]; return mus.mode === 'menu' ? tr.bpm[0] : tr.bpm[0] + (tr.bpm[1] - tr.bpm[0]) * mus.sn; }
    function stepDur() { return 30 / bpmNow(); }
    function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    // 악기 겹 수: 0(베이스·분산화음·멜로디) → 1(+하이햇) → 2(+킥·스네어) → 3(+16분 하이햇·멜로디 옥타브 겹침)
    function layers() {
      if (mus.mode === 'menu') return 0;
      var t = ac.currentTime - mus.playStart;
      return mus.sn < 0.12 ? (t < 7 ? 0 : 1) : mus.sn < 0.35 ? 1 : mus.sn < 0.7 ? 2 : 3;
    }
    // 메아리(점 8분음표 간격): 밤·오로라·시작 화면 곡의 멜로디에만
    function ensureEcho() {
      if (echoIn) return;
      echoIn = ac.createGain(); echoDelay = ac.createDelay(1.5);
      var fb = ac.createGain(), wet = ac.createGain(), tone2 = ac.createBiquadFilter();
      fb.gain.value = 0.38; wet.gain.value = 0.55; tone2.type = 'lowpass'; tone2.frequency.value = 2600;
      echoIn.connect(echoDelay); echoDelay.connect(tone2); tone2.connect(fb); fb.connect(echoDelay); tone2.connect(wet); wet.connect(musicFilter);
    }
    function retuneEcho() { if (echoDelay) echoDelay.delayTime.setTargetAtTime(Math.min(1.4, stepDur() * 3), ac.currentTime, 0.05); }
    function mNote(midi, t, dur, type, gain, echo) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = midiHz(midi);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(gain * 0.35, t + Math.max(0.02, dur * 0.7));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(musicFilter);
      if (echo) { ensureEcho(); var e = ac.createGain(); e.gain.value = echo; g.connect(e); e.connect(echoIn); }
      o.start(t); o.stop(t + dur + 0.02);
    }
    function mNoise(t, dur, type, freq, gain) {
      var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(musicFilter);
      s.start(t, Math.random() * 0.2); s.stop(t + dur);
    }
    function mKick(t, gain) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
      g.gain.setValueAtTime(gain || 0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g); g.connect(musicFilter);
      o.start(t); o.stop(t + 0.16);
    }
    function snare(t, gain) { mNoise(t, 0.1, 'bandpass', 1800, gain || 0.06); }
    function hat(t, gain) { mNoise(t, 0.03, 'highpass', 7000, gain || 0.022); }

    function playStep(i, t) {
      var tr = TRACKS[mus.track], s = i & 7, chd = CH[tr.prog[i >> 3]], d = stepDur();
      var menu = mus.mode === 'menu', L = layers(), soft = tr.lead !== 'square';
      var b = BP[tr.bass][s];
      if (b !== null) mNote(chd.bass + b, t, d * 0.9, 'triangle', 0.1);
      if (tr.pad && s === 0) chd.triad.forEach(function (n) { mNote(n, t, d * 7.6, 'sine', 0.011); });   // 은은한 화음 바탕
      var a = AP[tr.arp][s];
      if (a !== null) mNote(chd.triad[a] + (menu ? 0 : 12) + (tr.arpHigh ? 12 : 0), t, d * 0.8, menu || soft ? 'sine' : 'square', menu ? 0.03 : soft ? 0.022 : 0.013);
      var m = tr.mel[i];
      if (m > 0) {
        var len = 1;
        while (tr.mel[(i + len) % tr.mel.length] === -1) len++;
        mNote(m, t, d * len * 0.95, menu && !soft ? 'triangle' : tr.lead, menu ? 0.045 : soft ? 0.05 : 0.028, tr.echo || 0);
        if (L >= 3) mNote(m - 12, t, d * len * 0.9, 'triangle', 0.016);
      }
      if (tr.drums === 'shaker') { if (s & 1) mNoise(t, 0.04, 'highpass', 6000, 0.012); return; }
      if (menu) return;
      var st = tr.drums;
      if (L >= 1) {
        if (st === 'funk') hat(t, s & 1 ? 0.022 : 0.012);
        else if (st === 'half') { if (!(s & 1)) hat(t, 0.018); }
        else if (s & 1) hat(t);
      }
      if (L >= 2) {
        if (st === 'four' || st === 'march') { if (s === 0 || s === 4) mKick(t); if (s === 2 || s === 6) snare(t); }
        else if (st === 'funk') { if (s === 0 || s === 3 || s === 5) mKick(t, s ? 0.17 : 0.22); if (s === 2 || s === 6) snare(t); }
        else if (st === 'half') { if (s === 0 || (L >= 3 && s === 5)) mKick(t); if (s === 4) snare(t, 0.07); }
        if (st === 'march' && (i >> 3) === 7 && s === 7) { snare(t, 0.05); snare(t + d / 3, 0.05); snare(t + 2 * d / 3, 0.06); }
      }
      if (L >= 3 && st !== 'half') hat(t + d / 2, 0.014);
      // 곡이 바뀌기 직전 마디 끝: 짧은 북 채우기
      if (mus.want !== mus.track && s >= 6 && L >= 1) { snare(t, 0.05); snare(t + d / 2, 0.065); }
    }

    function pump() {
      if (!ac || ac.state !== 'running') return;
      var now = ac.currentTime;
      if (mus.next < now - 0.05) mus.next = now + 0.02; // 멈췄다 돌아오면 밀린 음을 몰아 치지 않음
      while (mus.next < now + 0.12) {
        if ((mus.step & 7) === 0 && mus.want !== mus.track) { mus.track = mus.want; mus.step = 0; retuneEcho(); }
        playStep(mus.step, mus.next);
        mus.next += stepDur();
        mus.step = (mus.step + 1) % 64;
      }
    }

    function levelFor(mode, on) { return !on ? 0 : mode === 'menu' ? 0.55 : mode === 'muffled' ? 0.5 : 1; }
    // 매 프레임 호출해도 된다(바뀐 것만 반영). sn: 0(출발 속도)~1(최고 속도), track: 위 TRACKS의 이름
    function setMusic(mode, sn, track) {
      mus.sn = Math.max(0, Math.min(1, sn || 0));
      if (track && TRACKS[track]) mus.want = track;
      if (!ac || !musicBus) return;
      var on = !!getSettings().bgm && mode !== 'off';
      if (mode === mus.mode && on === mus.on) return;
      // 새 판·시작 화면은 원하는 곡의 처음부터 바로, 일시정지에서 돌아올 때는 이어서
      if ((mode === 'play' && mus.mode !== 'muffled') || (mode === 'menu' && mus.mode !== 'menu')) { mus.step = 0; mus.track = mus.want; }
      if (mode === 'play' && mus.mode !== 'muffled') mus.playStart = ac.currentTime;
      mus.mode = mode; mus.on = on;
      var now = ac.currentTime;
      musicBus.gain.cancelScheduledValues(now);
      musicBus.gain.setTargetAtTime(levelFor(mode, on) * MUSIC_VOL, now, on ? 0.25 : 0.06);
      musicFilter.frequency.setTargetAtTime(mode === 'muffled' ? 650 : mode === 'menu' ? 4000 : 16000, now, 0.12);
      retuneEcho();
      if (on && !mus.timer) { mus.next = now + 0.06; mus.timer = setInterval(pump, 25); }
      else if (!on && mus.timer) { clearInterval(mus.timer); mus.timer = 0; }
    }

    // ── 짧은 효과 음악(스팅): 최고 기록 돌파·레벨업·결과. 배경음악을 잠시 낮추고 위에 얹는다(효과음 설정을 따름) ──
    var STINGS = {
      best: [[72, 0], [76, 0.08], [79, 0.16], [84, 0.24], [83, 0.34], [84, 0.42], [88, 0.52, 0.55]],
      level: [[79, 0], [83, 0.06], [86, 0.12], [91, 0.2, 0.4]],
      result: [[67, 0], [72, 0.13], [76, 0.26, 0.45]]
    };
    function sting(name) {
      var seq = STINGS[name];
      if (!seq || !ok()) return;
      if (mus.on && musicBus) {
        var now = ac.currentTime;
        musicBus.gain.cancelScheduledValues(now);
        musicBus.gain.setTargetAtTime(levelFor(mus.mode, true) * MUSIC_VOL * 0.3, now, 0.03);
        musicBus.gain.setTargetAtTime(levelFor(mus.mode, mus.on) * MUSIC_VOL, now + 0.95, 0.3);
      }
      seq.forEach(function (n) {
        var f = midiHz(n[0]), dur = n[2] || 0.12;
        tone(f, f, dur, 'triangle', 0.075, n[1]);
        tone(f * 2, f * 2, dur * 0.7, 'sine', 0.022, n[1]);
      });
      if (name === 'best' || name === 'level') { tone(midiHz(48), midiHz(48), 0.5, 'triangle', 0.06, 0); }
    }

    return { unlock: unlock, onEvent: onEvent, canVibrate: canVibrate, setWind: setWind, setMusic: setMusic, sting: sting, play: function (n) { if (sounds[n]) sounds[n](0.5); } };
  }

  root.KKUK = root.KKUK || {};
  root.KKUK.AudioHaptics = { create: createAudioHaptics };
})(typeof globalThis !== 'undefined' ? globalThis : this);
