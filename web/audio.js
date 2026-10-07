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
      soft: function () { tone(520, 420, 0.06, 'sine', 0.04); }
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
        case 'result': if (ev.record && ev.record.isBest && ev.record.height > 0) sounds.fanfare(); break;
        case 'resumeCountdown': sounds.tick(); break;
        case 'resume': sounds.go(); break;
        case 'pause': sounds.soft(); break;
        case 'nearMiss': tone(880, 1320, 0.07, 'triangle', 0.06); tone(1320, 1760, 0.08, 'sine', 0.05, 0.06); vibrate(10); break;
        case 'riskyRelease': tone(392, 784, 0.12, 'square', 0.035); tone(784, 1046, 0.12, 'triangle', 0.05, 0.08); break;
        case 'orbCollected': tone(1175 + Math.min(8, ev.xp) * 60, 1568 + Math.min(8, ev.xp) * 60, 0.06, 'sine', 0.04); break;
        case 'levelUp': sounds.fanfare(); break;
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

    // ── 배경음악: 직접 합성하는 8마디 반복곡(C–G–Am–F–C–G–F–G, 8분음표 64칸) ──
    // 모드: 'menu'(느리고 부드럽게, 북 없음) | 'play'(북 추가, 속도에 따라 116→140 BPM)
    //       'muffled'(일시정지·카드 선택: 같은 곡을 먹먹하게) | 'off'(실패 순간: 끊음)
    // 효과음보다 작게 깔리도록 음악 버스에서 음량을 따로 둔다. 설정의 배경음악(bgm)을 따른다.
    var MUSIC_VOL = 0.6;
    var CHORD = {
      C: { bass: 48, triad: [60, 64, 67] }, G: { bass: 43, triad: [59, 62, 67] },
      Am: { bass: 45, triad: [57, 60, 64] }, F: { bass: 41, triad: [57, 60, 65] }
    };
    var PROG = ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'];
    var BASS = [0, null, 12, null, 0, 0, 12, null];
    var ARP = [0, 1, 2, 1, 0, 1, 2, 1];
    // 멜로디: MIDI 음, -1 = 앞 음 이어서, 0 = 쉼표
    var MEL = [
      72, -1, 76, 79, 76, -1, 74, 72,   74, -1, 79, -1, 77, 76, 74, -1,
      72, -1, 76, 81, 79, -1, 76, -1,   77, 76, 74, 72, 74, -1, -1, 0,
      79, -1, 79, 81, 79, 76, 72, -1,   74, 76, 77, 79, 74, -1, 71, -1,
      77, 76, 77, 81, 79, -1, 77, 76,   74, -1, 71, 74, 79, -1, -1, 0
    ];
    var mus = { mode: 'off', on: false, sn: 0, step: 0, next: 0, timer: 0 };

    function stepDur() { return 30 / (mus.mode === 'menu' ? 96 : 116 + 24 * mus.sn); }
    function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    function mNote(midi, t, dur, type, gain) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = midiHz(midi);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(gain * 0.35, t + Math.max(0.02, dur * 0.7));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(musicFilter);
      o.start(t); o.stop(t + dur + 0.02);
    }
    function mNoise(t, dur, type, freq, gain) {
      var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(musicFilter);
      s.start(t, Math.random() * 0.2); s.stop(t + dur);
    }
    function mKick(t) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
      g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g); g.connect(musicFilter);
      o.start(t); o.stop(t + 0.16);
    }

    function playStep(i, t) {
      var s = i & 7, ch = CHORD[PROG[i >> 3]], d = stepDur();
      var active = mus.mode !== 'menu'; // play·muffled
      if (BASS[s] !== null) mNote(ch.bass + BASS[s], t, d * 0.9, 'triangle', 0.1);
      mNote(ch.triad[ARP[s]] + (active ? 12 : 0), t, d * 0.8, active ? 'square' : 'sine', active ? 0.014 : 0.035);
      var m = MEL[i];
      if (m > 0) {
        var len = 1;
        while (MEL[(i + len) % MEL.length] === -1) len++;
        mNote(m, t, d * len * 0.95, active ? 'square' : 'triangle', active ? 0.028 : 0.045);
      }
      if (!active) return;
      if (s === 0 || s === 4) mKick(t);
      if (s === 2 || s === 6) mNoise(t, 0.1, 'bandpass', 1800, 0.06);
      if (s & 1) mNoise(t, 0.03, 'highpass', 7000, 0.022);
      if (mus.sn > 0.55) mNoise(t + d / 2, 0.025, 'highpass', 8000, 0.014); // 빨라지면 16분 하이햇
    }

    function pump() {
      if (!ac || ac.state !== 'running') return;
      var now = ac.currentTime;
      if (mus.next < now - 0.05) mus.next = now + 0.02; // 멈췄다 돌아오면 밀린 음을 몰아 치지 않음
      while (mus.next < now + 0.12) {
        playStep(mus.step, mus.next);
        mus.next += stepDur();
        mus.step = (mus.step + 1) % MEL.length;
      }
    }

    // 매 프레임 호출해도 된다(바뀐 것만 반영). sn: 0(출발 속도)~1(최고 속도)
    function setMusic(mode, sn) {
      mus.sn = Math.max(0, Math.min(1, sn || 0));
      if (!ac || !musicBus) return;
      var on = !!getSettings().bgm && mode !== 'off';
      if (mode === mus.mode && on === mus.on) return;
      // 새 판·시작 화면은 곡 처음부터, 일시정지에서 돌아올 때는 이어서
      if ((mode === 'play' && mus.mode !== 'muffled') || (mode === 'menu' && mus.mode !== 'menu')) mus.step = 0;
      mus.mode = mode; mus.on = on;
      var now = ac.currentTime;
      var level = !on ? 0 : mode === 'menu' ? 0.55 : mode === 'muffled' ? 0.5 : 1;
      musicBus.gain.cancelScheduledValues(now);
      musicBus.gain.setTargetAtTime(level * MUSIC_VOL, now, on ? 0.25 : 0.06);
      musicFilter.frequency.setTargetAtTime(mode === 'muffled' ? 650 : mode === 'menu' ? 4000 : 16000, now, 0.12);
      if (on && !mus.timer) { mus.next = now + 0.06; mus.timer = setInterval(pump, 25); }
      else if (!on && mus.timer) { clearInterval(mus.timer); mus.timer = 0; }
    }

    return { unlock: unlock, onEvent: onEvent, canVibrate: canVibrate, setWind: setWind, setMusic: setMusic, play: function (n) { if (sounds[n]) sounds[n](0.5); } };
  }

  root.KKUK = root.KKUK || {};
  root.KKUK.AudioHaptics = { create: createAudioHaptics };
})(typeof globalThis !== 'undefined' ? globalThis : this);
