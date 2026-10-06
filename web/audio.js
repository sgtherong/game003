// AudioHapticsAdapter(웹) — 효과음·진동. 게임 규칙에 영향을 주지 않는다.
// 효과음은 Web Audio로 직접 합성한다(외부 음원 없음 → 별도 사용 권한 불필요).
// 브라우저 정책상 첫 사용자 입력 후에 소리를 켤 수 있다. 미지원·실패 시 조용히 무시한다.
(function (root) {
  'use strict';

  function createAudioHaptics(getSettings) {
    var ac = null, master = null, noiseBuf = null;
    var canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

    function unlock() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      try {
        ac = new AC();
        master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
        noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.3), ac.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ac = null; }
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

    return { unlock: unlock, onEvent: onEvent, canVibrate: canVibrate, setWind: setWind, play: function (n) { if (sounds[n]) sounds[n](0.5); } };
  }

  root.KKUK = root.KKUK || {};
  root.KKUK.AudioHaptics = { create: createAudioHaptics };
})(typeof globalThis !== 'undefined' ? globalThis : this);
