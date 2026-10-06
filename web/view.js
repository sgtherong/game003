// ViewAdapter(웹 캔버스) — 상태를 그리기만 한다. 물리 계산 없음.
// 파티클·파동·흔들림·잔상 같은 연출은 판정에 포함되지 않는다.
// 판정과 그림의 일치: 캐릭터 외곽은 판정 원 ±2.5% 안에서만 출렁이고, 벽은 판정 직사각형 안에만 질감을 그린다.
(function (root) {
  'use strict';
  var K = root.KKUK;

  // 고도 구간 테마(100 m마다). 마지막 다음은 처음으로 돌아간다.
  // tone: 이 배경 위의 HUD 글자 밝기 결정용
  var ZONES = [
    { id: 'dawn', top: '#ffd9bd', bottom: '#fff4e8', far: '#ffb58c', hill: '#f0a993', hill2: '#f7c9b2', mote: '#ffffff', sun: '#ffcf96', wall: '#2d3f52', wallDeep: '#1b2a3a', rim: '#7fd3cf', stars: 0, aurora: 0 },
    { id: 'sky', top: '#a9d8ff', bottom: '#eaf6ff', far: '#ffffff', hill: '#86b9dc', hill2: '#b8d9ef', mote: '#ffffff', sun: '#fff4c2', wall: '#2b4058', wallDeep: '#1a2b40', rim: '#7ee0d2', stars: 0, aurora: 0 },
    { id: 'sunset', top: '#ff8f72', bottom: '#ffd3a0', far: '#ff6f72', hill: '#c96579', hill2: '#e98f8a', mote: '#fff0d6', sun: '#ffe08a', wall: '#3a2f4f', wallDeep: '#241c36', rim: '#ffd27a', stars: 0.15, aurora: 0 },
    { id: 'night', top: '#151a46', bottom: '#352f6c', far: '#7c84e0', hill: '#232657', hill2: '#2e3270', mote: '#cfd6ff', sun: '#f4f0d2', wall: '#8f97d6', wallDeep: '#5a62a6', rim: '#a8f0ff', stars: 1, aurora: 0 },
    { id: 'aurora', top: '#082431', bottom: '#103a46', far: '#3fe0b2', hill: '#0b2c38', hill2: '#11404c', mote: '#bff6e6', sun: '#d9fff4', wall: '#7fc9c0', wallDeep: '#4b8f8f', rim: '#b6ff9e', stars: 0.8, aurora: 1 }
  ];
  var ZONE_KEYS = ['top', 'bottom', 'far', 'hill', 'hill2', 'mote', 'sun', 'wall', 'wallDeep', 'rim'];

  function hexToRgb(h) { var p = parseInt(h.slice(1), 16); return [(p >> 16) & 255, (p >> 8) & 255, p & 255]; }
  function rgbToHex(c) { return '#' + c.map(function (v) { var s = Math.round(Math.max(0, Math.min(255, v))).toString(16); return s.length < 2 ? '0' + s : s; }).join(''); }
  function lerpHex(a, b, t) { var x = hexToRgb(a), y = hexToRgb(b); return rgbToHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  function luminance(h) { var c = hexToRgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function createView(canvas, balance, strings) {
    var W = balance.world.width, H = balance.world.height, PY = balance.world.playerScreenY;
    var BASE = balance.player.baseRadius, UPM = balance.world.unitsPerMeter;
    var ZONE_LEN = UPM * 100, BLEND = UPM * 20;
    var ctx = canvas.getContext('2d');
    var colors = {};
    var effects = { waves: [], pops: [], sparks: [], passGlow: {}, impact: null, rings: [] };
    var reducedMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)');
    var lastNow = 0;
    var reducedSetting = false; // 설정의 연출 줄이기
    function reduced() { return reducedSetting || !!(reducedMotion && reducedMotion.matches); }
    var FONT = getComputedStyle(document.body).fontFamily;
    var darkTheme = false;
    var Z = null;           // 현재 프레임의 구간 팔레트(혼합 결과)
    var tone = 'light';
    var lastZoneIndex = 0, banner = null;
    var trail = [];
    var SN = 0;            // 속도 정규화(0 = 출발 속도, 1 = 최고 속도)

    function readPalette() {
      var cs = getComputedStyle(document.documentElement);
      ['bg-top', 'bg-bottom', 'ink', 'muted', 'line', 'wall', 'wall-deep', 'edge', 'mint', 'body', 'body-light', 'danger', 'panel-solid', 'track', 'gold', 'shield']
        .forEach(function (k) { colors[k] = cs.getPropertyValue('--' + k).trim(); });
      darkTheme = luminance(colors['bg-top']) < 0.2;
    }
    readPalette();
    if (root.matchMedia) root.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readPalette);

    function resize() {
      var rect = canvas.getBoundingClientRect();
      var dpr = Math.min(3, root.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    }

    function mix(a, b, t) { return lerpHex(a, b, t); }
    function alpha(hex, a) { var c = hexToRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
    function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

    // ── 구간 팔레트 ──
    function zoneAt(dist) {
      var i = Math.max(0, Math.floor(dist / ZONE_LEN));
      var into = dist - i * ZONE_LEN;
      var t = clamp01((into - (ZONE_LEN - BLEND)) / BLEND);
      var a = ZONES[i % ZONES.length], b = ZONES[(i + 1) % ZONES.length];
      var z = { index: i, id: t < 0.5 ? a.id : b.id };
      ZONE_KEYS.forEach(function (k) { z[k] = lerpHex(a[k], b[k], t); });
      z.stars = a.stars + (b.stars - a.stars) * t;
      z.aurora = a.aurora + (b.aurora - a.aurora) * t;
      if (darkTheme) { // 어두운 테마: 하늘을 어둡게 눌러 눈부심을 줄인다
        var k = 0.72 - 0.5 * z.stars;
        z.top = lerpHex(z.top, '#0a1630', k); z.bottom = lerpHex(z.bottom, '#132446', k);
        z.hill = lerpHex(z.hill, '#0a1426', k * 0.85); z.hill2 = lerpHex(z.hill2, '#0f1c36', k * 0.85);
        z.far = lerpHex(z.far, '#0c1628', k * 0.5);
        z.stars = Math.max(z.stars, 0.35);
      }
      var lum = (luminance(z.top) + luminance(z.bottom)) / 2;
      z.dark = lum < 0.32;
      if (z.dark && luminance(z.wall) < 0.15) { z.wall = lerpHex(z.wall, '#9aa3dd', 0.7); z.wallDeep = lerpHex(z.wallDeep, '#5b63a8', 0.7); }
      if (!z.dark && luminance(z.wall) > 0.25) { z.wall = lerpHex(z.wall, '#2b3d52', 0.8); z.wallDeep = lerpHex(z.wallDeep, '#1a2a3a', 0.8); }
      return z;
    }

    // ── 도메인 이벤트 → 연출 ──
    function onEvent(ev, ctl) {
      var run = ctl.run;
      if (ev.type === 'release') {
        var sk = K.Skins.get(ctl.equippedSkin ? ctl.equippedSkin() : 'base');
        effects.waves.push({ t: 0, e: ev.energy, x: run.x, r0: run.radius, c: sk.tint });
        var n = reduced() ? 0 : Math.round(4 + ev.energy * 10);
        for (var i = 0; i < n; i++) {
          var a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
          effects.sparks.push({ t: 0, life: 0.35 + Math.random() * 0.25, x: run.x, y: PY, vx: Math.cos(a) * (60 + ev.energy * 140), vy: Math.sin(a) * (60 + ev.energy * 140), hex: sk.spark });
        }
      } else if (ev.type === 'gatePassed') {
        // 같은 틱에 '아슬!'이 이미 떴으면 '+1'은 생략(이벤트 순서와 무관하게 겹침 방지)
        if (!effects.pops.some(function (q) { return q.t === 0 && q.big; })) effects.pops.push({ t: 0, x: run.x });
        effects.passGlow[ev.gateId] = 0;
        var ab = ctl.activeBalance ? ctl.activeBalance() : balance;
        var spd = K.Simulation.currentSpeed(run, ab);
        if (ev.count % 10 === 0 && ctl.mode !== 'tutorial' && spd < ab.ascent.baseSpeed + ab.ascent.maxIncrease + 0.01) {
          banner = { t: 0, text: (strings.speedUp || 'SPEED UP') + ' · ' + (spd / UPM).toFixed(1) + ' m/s', accent: true };
        }
      } else if (ev.type === 'death' || ev.type === 'tutorialRetry') {
        effects.impact = { t: 0, x: ev.x };
        for (var j = 0; j < (reduced() ? 0 : 14); j++) {
          var b = Math.random() * Math.PI * 2, s = 40 + Math.random() * 120;
          effects.sparks.push({ t: 0, life: 0.5 + Math.random() * 0.3, x: ev.x, y: PY, vx: Math.cos(b) * s, vy: Math.sin(b) * s, c: 'danger' });
        }
      } else if (ev.type === 'orbCollected') {
        var oy = PY - (ev.z - run.distance);
        effects.pops.push({ t: 0, x: ev.x, y: oy, text: '+1', c: 'gold' });
        for (var q = 0; q < (reduced() ? 0 : 6); q++) {
          var qa = Math.random() * Math.PI * 2;
          effects.sparks.push({ t: 0, life: 0.35, x: ev.x, y: oy, vx: Math.cos(qa) * 70, vy: Math.sin(qa) * 70, c: 'gold' });
        }
      } else if (ev.type === 'gateBroken') {
        var gy = PY - (ev.z - run.distance);
        effects.rings.push({ t: 0, x: run.x, y: PY, c: ev.cause === 'shield' ? 'shield' : 'gold' });
        for (var m = 0; m < (reduced() ? 0 : 18); m++) {
          var sx = Math.random() * W;
          effects.sparks.push({ t: 0, life: 0.6 + Math.random() * 0.3, x: sx, y: gy + (Math.random() - 0.5) * 16, vx: (sx - ev.x) * 0.8, vy: -40 - Math.random() * 120, c: 'shard', size: 3.2 });
        }
      } else if (ev.type === 'nearMiss') {
        // 같은 틱의 '+1'은 '아슬!'로 대체(겹침 방지)
        effects.pops = effects.pops.filter(function (p) { return !(p.t === 0 && !p.text); });
        effects.pops.push({ t: 0, x: run.x, y: PY - 18, text: strings.nearMissPop || 'Close!', c: 'gold', big: true });
        effects.rings.push({ t: 0, x: run.x, y: PY, c: 'gold' });
      } else if (ev.type === 'riskyRelease') {
        effects.pops.push({ t: 0, x: run.x, y: PY - 30, text: strings.riskyPop || 'Bold!', c: 'danger', big: true });
      } else if (ev.type === 'gateWidened') {
        effects.passGlow[ev.gateId] = 0;
      } else if (ev.type === 'levelUp') {
        effects.rings.push({ t: 0, x: run.x, y: PY, c: 'gold', big: true });
      } else if (ev.type === 'start') {
        effects = { waves: [], pops: [], sparks: [], passGlow: {}, impact: null, rings: [] };
        trail = []; banner = null; lastZoneIndex = 0;
      }
    }

    function tickEffects(dt, frozen) {
      if (banner && !frozen) { banner.t += dt; if (banner.t > 2.4) banner = null; }
      if (frozen) return;
      effects.waves = effects.waves.filter(function (w) { w.t += dt; return w.t < 0.5; });
      effects.pops = effects.pops.filter(function (p) { p.t += dt; return p.t < 0.7; });
      effects.rings = effects.rings.filter(function (r) { r.t += dt; return r.t < (r.big ? 0.7 : 0.5); });
      effects.sparks = effects.sparks.filter(function (s) {
        s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.9; s.vy *= 0.9; return s.t < s.life;
      });
      for (var id in effects.passGlow) { effects.passGlow[id] += dt; if (effects.passGlow[id] > 0.5) delete effects.passGlow[id]; }
      if (effects.impact) { effects.impact.t += dt; if (effects.impact.t > 0.8) effects.impact = null; }
    }

    // ── 배경 ──
    // 측면 절벽 실루엣의 폭(세계 좌표 기반 결정적 곡선)
    function ridge(w, seed) {
      return Math.sin(w * 0.018 + seed) * 10 + Math.sin(w * 0.047 + seed * 2.1) * 6 + Math.sin(w * 0.11 + seed * 3.7) * 3;
    }
    function drawCliff(dist, side, parallax, base, color, seed) {
      ctx.fillStyle = color;
      ctx.beginPath();
      var edgeX = side < 0 ? 0 : W;
      ctx.moveTo(edgeX, -20);
      for (var y = -20; y <= H + 20; y += 10) {
        var w = dist * parallax + (PY - y);
        var width = base + ridge(w, seed);
        ctx.lineTo(side < 0 ? width : W - width, y);
      }
      ctx.lineTo(edgeX, H + 20);
      ctx.closePath(); ctx.fill();
    }

    function drawBackground(dist, nowMs) {
      var grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, Z.top); grad.addColorStop(1, Z.bottom);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

      var t = reduced() ? 0 : nowMs / 1000;

      // 별
      if (Z.stars > 0.02) {
        for (var s = 0; s < 46; s++) {
          var sx = (s * 73.7 + 19) % W;
          var sy = ((s * 117.3 + dist * 0.03) % (H + 10)) - 5;
          var tw = 0.55 + 0.45 * Math.sin(t * (1.3 + (s % 5) * 0.4) + s);
          ctx.fillStyle = 'rgba(255,255,255,' + (Z.stars * tw * (s % 4 === 0 ? 0.9 : 0.5)).toFixed(3) + ')';
          ctx.fillRect(sx, sy, s % 4 === 0 ? 1.8 : 1.1, s % 4 === 0 ? 1.8 : 1.1);
        }
      }

      // 오로라 리본
      if (Z.aurora > 0.02) {
        for (var b = 0; b < 3; b++) {
          var ag = ctx.createLinearGradient(0, 40 + b * 40, 0, 140 + b * 40);
          ag.addColorStop(0, alpha(Z.far, 0)); ag.addColorStop(0.5, alpha(Z.far, 0.22 * Z.aurora)); ag.addColorStop(1, alpha(Z.far, 0));
          ctx.fillStyle = ag; ctx.beginPath();
          ctx.moveTo(0, 60 + b * 40);
          for (var x = 0; x <= W; x += 20) ctx.lineTo(x, 60 + b * 40 + Math.sin(x * 0.02 + t * 0.5 + b * 1.7) * 18);
          for (var x2 = W; x2 >= 0; x2 -= 20) ctx.lineTo(x2, 120 + b * 40 + Math.sin(x2 * 0.025 + t * 0.4 + b) * 14);
          ctx.closePath(); ctx.fill();
        }
      }

      // 해·달
      var sunX = W * 0.74, sunY = 112;
      var sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 70);
      sg.addColorStop(0, alpha(Z.sun, 0.55)); sg.addColorStop(1, alpha(Z.sun, 0));
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sunX, sunY, 70, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = alpha(Z.sun, 0.9); ctx.beginPath(); ctx.arc(sunX, sunY, 22, 0, Math.PI * 2); ctx.fill();

      // 먼 빛망울
      for (var i = 0; i < 9; i++) {
        var bx = (i * 131.7 + 40) % W;
        var by = ((i * 91.3 + dist * 0.08) % (H + 80)) - 40;
        var br = 10 + (i % 4) * 5;
        ctx.fillStyle = alpha(Z.far, 0.1);
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      }

      // 양옆 절벽 두 겹(먼 층은 느리게)
      drawCliff(dist, -1, 0.25, 30, alpha(Z.hill2, 0.55), 1.3);
      drawCliff(dist, 1, 0.25, 30, alpha(Z.hill2, 0.55), 4.1);
      drawCliff(dist, -1, 0.62, 14, alpha(Z.hill, 0.8), 0.2);
      drawCliff(dist, 1, 0.62, 14, alpha(Z.hill, 0.8), 2.6);

      // 떠다니는 먼지(위로 올라가는 느낌: 화면 아래로 흐름)
      for (var p = 0; p < 22; p++) {
        var mx = (p * 61.9 + 13) % W + (reduced() ? 0 : Math.sin(t * 0.8 + p) * 4);
        var my = ((p * 173.1 + dist * (0.75 + (p % 3) * 0.15)) % (H + 20)) - 10;
        var ml = reduced() ? 0 : 2 + SN * 12 * (0.6 + (p % 3) * 0.3);
        ctx.strokeStyle = alpha(Z.mote, 0.18 + (p % 3) * 0.1); ctx.lineCap = 'round';
        ctx.lineWidth = 1.2 + (p % 3) * 0.6;
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx, my - ml - 0.1); ctx.stroke();
      }

      drawSpeedLines(dist);

      // 가운데 안내선과 눈금(구간 밝기에 맞춘 색)
      var ruleInk = Z.dark ? '#ffffff' : colors.muted;
      ctx.strokeStyle = alpha(ruleInk, 0.14); ctx.lineWidth = 1; ctx.setLineDash([2, 9]);
      ctx.beginPath(); ctx.moveTo(W / 2, 72); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '600 9px ' + FONT;
      var step = UPM * 10;
      var first = Math.floor((dist - (H - PY)) / step) * step;
      for (var z = first; z < dist + PY + step; z += step) {
        if (z < 0) continue;
        var y = PY - (z - dist);
        var m = Math.round(z / UPM), major = m % 50 === 0;
        ctx.strokeStyle = alpha(ruleInk, major ? 0.5 : 0.25);
        ctx.beginPath(); ctx.moveTo(W - 6, y); ctx.lineTo(W - (major ? 16 : 11), y); ctx.stroke();
        if (major && m > 0 && y > 70) { ctx.fillStyle = alpha(ruleInk, 0.7); ctx.textAlign = 'right'; ctx.fillText(m + '', W - 19, y + 3); ctx.textAlign = 'left'; }
      }
    }

    // 속도선: 양옆에 몰린 빠른 줄기. 개수·길이·진하기가 속도에 비례
    function drawSpeedLines(dist) {
      var n = Math.round((reduced() ? 3 : 6) + SN * (reduced() ? 5 : 16));
      ctx.lineCap = 'round';
      for (var i = 0; i < n; i++) {
        var side = i % 2 ? 1 : -1;
        var off = ((i * 37.3) % 78) + 4;
        var x = side < 0 ? off : W - off;
        var len = 18 + SN * 56 + (i % 3) * 8;
        var sp = 1.6 + (i % 4) * 0.25;
        var y = ((i * 211.7 + dist * sp) % (H + len + 40)) - len - 20;
        var g = ctx.createLinearGradient(0, y, 0, y + len);
        var c = Z.dark ? '#ffffff' : Z.mote;
        g.addColorStop(0, alpha(c, 0)); g.addColorStop(1, alpha(c, 0.1 + SN * 0.22));
        ctx.strokeStyle = g; ctx.lineWidth = 1 + (i % 3) * 0.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
      }
    }

    function drawBestLine(dist, best) {
      if (best <= 0) return;
      var y = PY - (best * UPM - dist);
      if (y < 70 || y > H) return;
      ctx.strokeStyle = colors.mint; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(W - 20, y); ctx.stroke(); ctx.setLineDash([]);
      var label = strings.bestLine + ' ' + best + ' m';
      ctx.font = '700 10.5px ' + FONT;
      var tw = ctx.measureText(label).width + 16;
      ctx.fillStyle = colors.mint; rr(22, y - 22, tw, 18, 9); ctx.fill();
      ctx.fillStyle = colors['panel-solid']; ctx.fillText(label, 30, y - 9.5);
    }

    // ── 장애물: 판정 직사각형 안에 돌판 질감 ──
    function slab(x, y, w, h, radii) {
      var g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, mix(Z.wall, '#ffffff', 0.14)); g.addColorStop(0.35, Z.wall); g.addColorStop(1, Z.wallDeep);
      ctx.fillStyle = g; rr(x, y, w, h, radii); ctx.fill();
      // 질감: 사선 결(판 안쪽에만)
      ctx.save(); rr(x, y, w, h, radii); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.055)'; ctx.lineWidth = 2;
      for (var sx = x - h; sx < x + w; sx += 11) { ctx.beginPath(); ctx.moveTo(sx, y + h); ctx.lineTo(sx + h, y); ctx.stroke(); }
      if (h > 40) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x, y + h / 2 - 1, w, 2); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y + h / 2 + 1, w, 1); }
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x, y, w, 1.5);         // 윗면 반사
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x, y + h - 2, w, 2);          // 아래 모서리
      ctx.restore();
    }

    function drawGate(gate, dist) {
      var y = PY - (gate.z - dist) - gate.h / 2;
      if (y > H + 80 || y + gate.h < -80) return;
      var left = gate.cx - gate.gap / 2, right = gate.cx + gate.gap / 2;
      var cap = Math.min(7, gate.h / 2);
      var glow = effects.passGlow[gate.id];
      var rim = gate.widened ? colors.gold : glow !== undefined ? mix(Z.rim, colors.mint, 1 - glow / 0.5) : Z.rim;

      // 틈 사이 빛줄기
      var beam = ctx.createLinearGradient(0, y - 40, 0, y + gate.h + 40);
      beam.addColorStop(0, alpha(rim, 0)); beam.addColorStop(0.5, alpha(rim, 0.16)); beam.addColorStop(1, alpha(rim, 0));
      ctx.fillStyle = beam; ctx.fillRect(left, y - 40, right - left, gate.h + 80);

      // 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      rr(-12, y + 6, left + 12, gate.h, [0, cap, cap, 0]); ctx.fill();
      rr(right, y + 6, W - right + 12, gate.h, [cap, 0, 0, cap]); ctx.fill();

      slab(-12, y, left + 12, gate.h, [0, cap, cap, 0]);
      slab(right, y, W - right + 12, gate.h, [cap, 0, 0, cap]);

      // 틈 가장자리 발광
      ctx.save();
      ctx.shadowColor = rim; ctx.shadowBlur = reduced() ? 0 : 8;
      ctx.fillStyle = rim;
      rr(left - 3.5, y + 3, 3, gate.h - 6, 1.5); ctx.fill();
      rr(right + 0.5, y + 3, 3, gate.h - 6, 1.5); ctx.fill();
      ctx.restore();

      // 패턴 라벨(멀리 있을 때만)
      if (y > 78 && y < PY - 64 && left > 70) {
        var label = gate.practice ? strings.practice : gate.kind === 'long' ? strings.gateLong : gate.kind === 'double' ? strings.gateDouble : strings.gateShort;
        ctx.font = '700 10.5px ' + FONT;
        ctx.textAlign = 'right'; ctx.fillStyle = luminance(Z.wall) > 0.3 ? 'rgba(15,25,40,0.72)' : 'rgba(255,255,255,0.72)';
        ctx.fillText(label, left - 14, y + gate.h / 2 + 4); ctx.textAlign = 'left';
      }
    }

    // ── 캐릭터 ──
    function drawPlayer(run, state, nowMs, playing, skinId) {
      var tint = K.Skins.get(skinId).tint;
      var x = run.x, r = run.radius, p = run.energy, held = run.logicalHeld;
      var dead = state === 'DEAD' || state === 'RESULT';
      var danger = Math.max(0, Math.min(1, (p - 0.6) / 0.4));

      // 잔상(움직일 때)
      if (playing && !reduced()) {
        trail.unshift({ x: x, r: r });
        if (trail.length > 7) trail.length = 7;
        var moving = trail.length > 3 && Math.abs(trail[0].x - trail[3].x) > 2;
        for (var i = 1; i < trail.length; i++) {
          var tr = trail[i], a = (moving ? 0.16 : 0.07) * (1 - i / trail.length);
          ctx.fillStyle = alpha(tint, a);
          ctx.beginPath(); ctx.arc(tr.x, PY + i * (3.5 + SN * 4), tr.r * (1 - i * 0.04), 0, Math.PI * 2); ctx.fill();
        }
      } else if (!playing) trail = [];

      // 바람 자국: 빠를수록 몸 양옆으로 흐르는 곡선
      if (playing && !reduced() && SN > 0.15) {
        var wa = (SN - 0.15) / 0.85;
        ctx.strokeStyle = alpha(Z.dark ? '#ffffff' : '#ffffff', 0.18 + wa * 0.35); ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        var wph = (nowMs / 90) % 1;
        [-1, 1].forEach(function (s) {
          for (var k2 = 0; k2 < 2; k2++) {
            var y0 = PY - r * 0.5 + ((wph + k2 * 0.5) % 1) * r * 1.6;
            ctx.beginPath();
            ctx.moveTo(x + s * (r + 3), y0);
            ctx.quadraticCurveTo(x + s * (r + 7), y0 + 8 + wa * 10, x + s * (r + 4), y0 + 16 + wa * 18);
            ctx.stroke();
          }
        });
      }

      // 예상 반동 링
      if (held && p > 0.04) {
        ctx.strokeStyle = alpha(tint, 0.45); ctx.lineWidth = 1.2; ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.arc(x, PY, BASE + p * 12, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }

      // 발광
      var halo = ctx.createRadialGradient(x, PY, r * 0.6, x, PY, r * 1.9);
      halo.addColorStop(0, alpha(danger > 0.5 ? colors.danger : tint, 0.26 + danger * 0.2)); halo.addColorStop(1, alpha(tint, 0));
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, PY, r * 1.9, 0, Math.PI * 2); ctx.fill();

      // 몸·얼굴: 장착한 외형으로 그린다(판정 원 안에만). 반동 직후 크게, 평소엔 아주 약하게 출렁임
      var wob = reduced() || dead ? 0 : 0.006 + Math.min(1, Math.abs(run.radialVelocity) / 160) * 0.019;
      K.Skins.paint(skinId, {
        ctx: ctx, x: x, y: PY, r: r, held: held, energy: p, dead: dead, danger: danger,
        now: reduced() ? 0 : nowMs, wob: wob, phase: nowMs / 140,
        look: Math.max(-1, Math.min(1, (run.targetX - run.x) / 30)),
        blink: !reduced() && (nowMs % 3700) < 110,
        expanded: run.radius > BASE * 1.08,
        bodyColor: colors.body
      });
      // 땀(경고)
      if (!dead && p > 0.75) {
        var sx = x + r * 0.8, sy = PY - r * 0.55, ss = Math.max(2.5, r * 0.14);
        ctx.fillStyle = 'rgba(150,220,255,0.95)';
        ctx.beginPath(); ctx.moveTo(sx, sy - ss * 1.6); ctx.quadraticCurveTo(sx + ss, sy, sx, sy + ss * 0.6); ctx.quadraticCurveTo(sx - ss, sy, sx, sy - ss * 1.6); ctx.fill();
      }
    }

    function drawEffects(run) {
      effects.waves.forEach(function (w) {
        var k = w.t / 0.5;
        ctx.strokeStyle = alpha(w.c || colors.body, (1 - k) * (0.25 + w.e * 0.5));
        ctx.lineWidth = 2 + w.e * 3;
        ctx.beginPath(); ctx.arc(run.x, PY, run.radius + 4 + k * (18 + w.e * 46), 0, Math.PI * 2); ctx.stroke();
      });
      effects.sparks.forEach(function (s) {
        var k = s.t / s.life;
        var c = s.hex || (s.c === 'shard' ? Z.wall : colors[s.c]);
        ctx.fillStyle = alpha(c, 1 - k);
        if (s.size) { ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size); return; }
        ctx.beginPath(); ctx.arc(s.x, s.y, 2.2 * (1 - k) + 0.6, 0, Math.PI * 2); ctx.fill();
      });
      effects.pops.forEach(function (p) {
        var k = p.t / 0.7;
        ctx.globalAlpha = 1 - k * k;
        ctx.font = (p.big ? '900 19px ' : '800 16px ') + FONT;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        var py = (p.y != null ? p.y - 14 : PY - 52) - k * 34;
        ctx.strokeText(p.text || '+1', p.x, py);
        ctx.fillStyle = colors[p.c || 'mint'];
        ctx.fillText(p.text || '+1', p.x, py); ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      });
      effects.rings.forEach(function (r) {
        var life = r.big ? 0.7 : 0.5, k = r.t / life;
        ctx.strokeStyle = alpha(colors[r.c], (1 - k) * 0.8); ctx.lineWidth = r.big ? 4 : 3;
        ctx.beginPath(); ctx.arc(run.x, PY, run.radius + 6 + k * (r.big ? 90 : 50), 0, Math.PI * 2); ctx.stroke();
      });
      if (effects.impact && !reduced()) {
        var k = effects.impact.t / 0.8;
        ctx.strokeStyle = alpha(colors.danger, 0.7 * (1 - k)); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(effects.impact.x, PY, 14 + k * 50, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = alpha(colors.danger, 0.1 * (1 - k)); ctx.fillRect(0, 0, W, H);
      }
    }

    // 화면 가장자리를 살짝 어둡게
    function drawVignette() {
      var v = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.32, W / 2, H * 0.55, H * 0.85);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, Z.dark ? 'rgba(0,0,0,0.32)' : 'rgba(60,30,20,0.14)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }

    // 구간 진입 안내
    function drawBanner() {
      if (!banner) return;
      var k = banner.t, a = k < 0.3 ? k / 0.3 : k > 1.9 ? Math.max(0, (2.4 - k) / 0.5) : 1;
      var y = 150 - (1 - Math.min(1, k / 0.3)) * 8;
      ctx.globalAlpha = a;
      ctx.font = '800 13px ' + FONT;
      var tw = ctx.measureText(banner.text).width + 28;
      ctx.fillStyle = banner.accent ? alpha(colors.gold, 0.92) : Z.dark ? 'rgba(10,14,34,0.6)' : 'rgba(255,255,255,0.72)';
      rr(W / 2 - tw / 2, y - 15, tw, 28, 14); ctx.fill();
      ctx.fillStyle = banner.accent ? '#2a1d00' : Z.dark ? '#f4f6ff' : '#1d2833'; ctx.textAlign = 'center';
      ctx.fillText(banner.text, W / 2, y + 4); ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    // 튜토리얼 목표 영역(드래그 단계)
    function drawZone(ctl) {
      var z = ctl.mode === 'tutorial' && ctl.tutorial && ctl.tutorial.zone();
      if (!z) return;
      var x0 = z.x - z.halfWidth, w = z.halfWidth * 2, top = PY - 70, h = 120;
      var g = ctx.createLinearGradient(0, top, 0, top + h);
      g.addColorStop(0, alpha(colors.mint, 0)); g.addColorStop(0.5, alpha(colors.mint, 0.26)); g.addColorStop(1, alpha(colors.mint, 0));
      ctx.fillStyle = g; rr(x0, top, w, h, 12); ctx.fill();
      ctx.strokeStyle = alpha(colors.mint, 0.8); ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x0, top + 20); ctx.lineTo(x0, top + h - 20); ctx.moveTo(x0 + w, top + 20); ctx.lineTo(x0 + w, top + h - 20); ctx.stroke(); ctx.setLineDash([]);
      if (z.progress > 0) { ctx.fillStyle = colors.mint; rr(x0 + 4, top + h - 10, (w - 8) * z.progress, 4, 2); ctx.fill(); }
      var dir = Math.sign(z.x - ctl.run.x);
      if (Math.abs(z.x - ctl.run.x) > z.halfWidth) {
        var ax = ctl.run.x + dir * (ctl.run.radius + 16);
        ctx.strokeStyle = colors.mint; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(ax, PY - 7); ctx.lineTo(ax + dir * 7, PY); ctx.lineTo(ax, PY + 7); ctx.stroke();
      }
    }

    // ── 성장 모드 ──
    function drawOrbs(ctl, nowMs) {
      var gs = ctl.growth;
      if (!gs) return;
      var dist = ctl.run.distance, t = reduced() ? 0 : nowMs;
      for (var i = 0; i < gs.orbs.length; i++) {
        var o = gs.orbs[i];
        var y = PY - (o.z - dist);
        if (y < -20 || y > H + 20) continue;
        var cy = y + Math.sin(t / 260 + o.id) * 2;
        var halo = ctx.createRadialGradient(o.x, cy, 1, o.x, cy, 16);
        halo.addColorStop(0, alpha(colors.gold, 0.5)); halo.addColorStop(1, alpha(colors.gold, 0));
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(o.x, cy, 16, 0, Math.PI * 2); ctx.fill();
        var dg = ctx.createLinearGradient(o.x - 6, cy - 8, o.x + 6, cy + 8);
        dg.addColorStop(0, '#fff3c4'); dg.addColorStop(0.5, colors.gold); dg.addColorStop(1, mix(colors.gold, '#7a4a00', 0.35));
        ctx.fillStyle = dg;
        ctx.beginPath(); ctx.moveTo(o.x, cy - 7.5); ctx.lineTo(o.x + 5.5, cy); ctx.lineTo(o.x, cy + 7.5); ctx.lineTo(o.x - 5.5, cy); ctx.closePath(); ctx.fill();
        // 반짝임 십자
        var sp = 0.5 + 0.5 * Math.sin(t / 180 + o.id * 2);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + sp * 0.5).toFixed(2) + ')'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(o.x + 4, cy - 9 - sp * 3); ctx.lineTo(o.x + 4, cy - 3 + sp); ctx.moveTo(o.x + 1 - sp * 2, cy - 6); ctx.lineTo(o.x + 7 + sp * 2, cy - 6); ctx.stroke();
      }
      if (gs.stacks.magnet) {
        ctx.strokeStyle = alpha(colors.gold, 0.25); ctx.lineWidth = 1; ctx.setLineDash([2, 6]);
        ctx.beginPath(); ctx.arc(ctl.run.x, PY, ctl.run.radius + gs.pickupRadius(), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    function drawShields(ctl, nowMs) {
      var run = ctl.run;
      if (run.invulnerable > 0 && !reduced() && Math.floor(nowMs / 60) % 2) {
        ctx.fillStyle = alpha(colors.shield, 0.25); ctx.beginPath(); ctx.arc(run.x, PY, run.radius + 2, 0, Math.PI * 2); ctx.fill();
      }
      if (!run.shields) return;
      var R = run.radius + 5;
      ctx.save(); ctx.shadowColor = colors.shield; ctx.shadowBlur = reduced() ? 0 : 6;
      ctx.strokeStyle = alpha(colors.shield, 0.85); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      for (var i = 0; i < run.shields; i++) {
        var seg = (Math.PI * 2) / run.shields, a0 = -Math.PI / 2 + i * seg + 0.18, a1 = a0 + seg - 0.36;
        ctx.beginPath(); ctx.arc(run.x, PY, R, a0, a1); ctx.stroke();
      }
      ctx.restore();
    }

    // 예지: 화면 위 바깥의 다음 틈 위치를 위쪽 가장자리에 표시
    function drawForesight(ctl) {
      var gs = ctl.growth;
      if (!gs || !gs.foresight) return;
      var dist = ctl.run.distance, shown = 0;
      var ahead = ctl.run.gates.filter(function (g) { return !g.broken && PY - (g.z - dist) + g.h / 2 < 0; }).sort(function (a, b) { return a.z - b.z; });
      for (var i = 0; i < ahead.length && shown < gs.foresight; i++) {
        var g = ahead[i];
        ctx.fillStyle = alpha(colors.mint, shown === 0 ? 0.9 : 0.5);
        rr(g.cx - g.gap / 2, 9 + shown * 7, g.gap, 4, 2); ctx.fill();
        shown++;
      }
    }

    // 고스트(오늘 최고 판의 입력 재생): 반투명 실루엣. 화면 밖이면 가장자리에 거리 표시
    function drawGhost(ctl) {
      var g = ctl.ghost;
      if (!g) return;
      var gr = g.run, run = ctl.run;
      var y = PY - (gr.distance - run.distance);
      var diff = Math.round((gr.distance - run.distance) / UPM);
      var ink = Z.dark ? '#ffffff' : '#2b3a55';
      ctx.font = '800 10.5px ' + FONT; ctx.textAlign = 'center';
      if (y < 60 || y > H - 10) {
        if (!gr.alive && y > H) return;
        var top = y < 60, ey = top ? 70 : H - 18;
        var label = (g.label || strings.ghost) + ' ' + (diff > 0 ? '+' : '') + diff + ' m';
        var tw = ctx.measureText(label).width + 22, gx = Math.max(tw / 2 + 6, Math.min(W - tw / 2 - 6, gr.x));
        ctx.fillStyle = alpha(Z.dark ? '#0a0e22' : '#ffffff', 0.7); rr(gx - tw / 2, ey - 10, tw, 20, 10); ctx.fill();
        ctx.fillStyle = ink;
        ctx.beginPath(); var ax = gx - tw / 2 + 9;
        if (top) { ctx.moveTo(ax - 4, ey + 2); ctx.lineTo(ax, ey - 3); ctx.lineTo(ax + 4, ey + 2); } else { ctx.moveTo(ax - 4, ey - 2); ctx.lineTo(ax, ey + 3); ctx.lineTo(ax + 4, ey - 2); }
        ctx.fill();
        ctx.fillText(label, gx + 5, ey + 4); ctx.textAlign = 'left';
        return;
      }
      var a = gr.alive ? 0.42 : 0.2;
      ctx.fillStyle = alpha(Z.dark ? '#dfe7ff' : '#ffffff', a);
      ctx.beginPath(); ctx.arc(gr.x, y, gr.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = alpha(ink, a + 0.15); ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(gr.x, y, gr.radius, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = alpha(ink, a + 0.2);
      [-1, 1].forEach(function (s) { ctx.beginPath(); ctx.arc(gr.x + s * gr.radius * 0.3, y - gr.radius * 0.05, Math.max(1.2, gr.radius * 0.07), 0, Math.PI * 2); ctx.fill(); });
      ctx.fillText(g.label || strings.ghost, gr.x, y - gr.radius - 6); ctx.textAlign = 'left';
    }

    // 재개 준비 링(FIX-08): 남은 시간만큼 줄어드는 원
    function drawCountdown(ctl) {
      if (ctl.state !== 'RESUME_COUNTDOWN') return;
      var total = balance.world.resumeCountdownSeconds, k = Math.max(0, ctl.countdown / total);
      var x = ctl.run.x, R = Math.max(ctl.run.radius + 14, 36);
      ctx.fillStyle = Z.dark ? 'rgba(10,14,34,0.5)' : 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(x, PY, R + 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = alpha(colors.mint, 0.25); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, PY, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = colors.mint; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, PY, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      ctx.font = '800 13px ' + FONT; ctx.textAlign = 'center'; ctx.fillStyle = Z.dark ? '#f4f6ff' : '#1d2833';
      ctx.fillText(strings.ready, x, PY + R + 22); ctx.textAlign = 'left';
    }

    function render(ctl, nowMs) {
      var dt = lastNow ? Math.min(0.05, (nowMs - lastNow) / 1000) : 0;
      lastNow = nowMs;
      var frozen = ctl.state === 'PAUSED' || ctl.state === 'RESUME_COUNTDOWN' || ctl.state === 'CHOOSING';
      tickEffects(dt, frozen);
      var k = canvas.width / W;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      var run = ctl.run;
      Z = zoneAt(run.distance);
      var abal = ctl.activeBalance ? ctl.activeBalance() : balance;
      var a0 = abal.ascent.baseSpeed, a1 = a0 + abal.ascent.maxIncrease;
      SN = clamp01((K.Simulation.currentSpeed(run, abal) - a0) / Math.max(1, a1 - a0));
      tone = Z.dark ? 'dark' : 'light';
      var playing = ctl.state === 'PLAYING';
      if (playing && ctl.mode !== 'tutorial' && Z.index > lastZoneIndex) {
        var names = strings.zones || [];
        var zi = Z.index % ZONES.length;
        banner = { t: 0, text: (Z.index * 100) + ' m' + (names[zi] ? ' · ' + names[zi] : '') };
      }
      lastZoneIndex = Z.index;

      drawBackground(run.distance, nowMs);
      if (ctl.mode !== 'tutorial') drawBestLine(run.distance, ctl.best);
      for (var i = 0; i < run.gates.length; i++) if (!run.gates[i].broken) drawGate(run.gates[i], run.distance);
      drawZone(ctl);
      drawOrbs(ctl, nowMs);
      drawForesight(ctl);
      drawGhost(ctl);
      drawPlayer(run, ctl.state, nowMs, playing && !frozen, ctl.equippedSkin ? ctl.equippedSkin() : 'base');
      drawShields(ctl, nowMs);
      drawEffects(run);
      drawVignette();
      drawBanner();
      drawCountdown(ctl);
    }

    return {
      render: render, onEvent: onEvent, resize: resize, readPalette: readPalette,
      setStrings: function (s) { strings = s; },
      setReducedEffects: function (on) { reducedSetting = !!on; },
      tone: function () { return tone; }   // 'dark' | 'light' — HUD 글자색 결정용
    };
  }

  K.View = { createView: createView, ZONES: ZONES };
})(typeof globalThis !== 'undefined' ? globalThis : this);
