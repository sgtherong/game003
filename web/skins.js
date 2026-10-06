// Skins — 캐릭터 외형(명세서 16.2). 보이는 모습만 바꾸며 판정·속도·반동은 모든 외형이 같다.
// 규칙: 모든 그림은 판정 원(반지름 r) 안, 최대 r × 1.03 이내에만 그린다(tests/skin-tests.js가 확인).
// 브라우저(window.KKUK.Skins)와 Node(require) 양쪽에서 쓸 수 있다. DOM 의존 없음(캔버스 2D 컨텍스트만 사용).
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.KKUK = root.KKUK || {}; root.KKUK.Skins = mod; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function hexToRgb(h) { var p = parseInt(h.slice(1), 16); return [(p >> 16) & 255, (p >> 8) & 255, p & 255]; }
  function alpha(hex, a) { var c = hexToRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(a, b, t) {
    var x = hexToRgb(a), y = hexToRgb(b);
    return '#' + [0, 1, 2].map(function (i) { var v = Math.round(x[i] + (y[i] - x[i]) * t).toString(16); return v.length < 2 ? '0' + v : v; }).join('');
  }
  // 결정적 의사 난수(무늬 위치 고정용)
  function hash(i) { var s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  // 출렁이는 외곽: 판정 원 ±amp(최대 2.5%)
  function blobPath(ctx, x, y, r, amp, phase) {
    ctx.beginPath();
    var N = 28;
    for (var i = 0; i <= N; i++) {
      var a = (i / N) * Math.PI * 2;
      var rr = r * (1 + amp * (Math.sin(a * 3 + phase) * 0.6 + Math.sin(a * 5 - phase * 1.3) * 0.4));
      var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function radialBody(api, light, mid, dark, a) {
    var ctx = api.ctx, x = api.x, y = api.y, r = api.r;
    var g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.08, x, y, r * 1.02);
    g.addColorStop(0, a == null ? light : alpha(light, a));
    g.addColorStop(0.5, a == null ? mid : alpha(mid, a));
    g.addColorStop(1, a == null ? dark : alpha(dark, a));
    ctx.fillStyle = g; blobPath(ctx, x, y, r, api.wob, api.phase); ctx.fill();
  }
  function gloss(api, strength) {
    var ctx = api.ctx, x = api.x, y = api.y, r = api.r;
    ctx.fillStyle = 'rgba(255,255,255,' + (strength || 0.55) + ')';
    ctx.beginPath(); ctx.ellipse(x - r * 0.34, y - r * 0.44, r * 0.22, r * 0.11, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - r * 0.08, y - r * 0.6, Math.max(0.8, r * 0.05), 0, Math.PI * 2); ctx.fill();
  }
  function rimLight(api, color) {
    var ctx = api.ctx;
    ctx.strokeStyle = color || 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, api.r * 0.08); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(api.x, api.y, api.r * 0.86, 0.15 * Math.PI, 0.6 * Math.PI); ctx.stroke();
  }
  function outline(api, color) {
    api.ctx.strokeStyle = color; api.ctx.lineWidth = 1.1;
    blobPath(api.ctx, api.x, api.y, api.r, api.wob, api.phase); api.ctx.stroke();
  }
  function clipBody(api) { api.ctx.save(); blobPath(api.ctx, api.x, api.y, api.r * 0.995, api.wob, api.phase); api.ctx.clip(); }
  function heatGlow(api, color) {
    if (!api.held || api.energy <= 0.05) return;
    var ctx = api.ctx;
    var ig = ctx.createRadialGradient(api.x, api.y + api.r * 0.1, 0, api.x, api.y, api.r);
    ig.addColorStop(0, alpha(color || '#fff0be', 0.18 + api.energy * 0.3)); ig.addColorStop(1, alpha(color || '#fff0be', 0));
    ctx.fillStyle = ig; blobPath(ctx, api.x, api.y, api.r, api.wob, api.phase); ctx.fill();
  }

  // ── 공통 얼굴 ──
  // opts: { ink, sclera, cheeks, mouth: 'smile'|'pucker', sleepy }
  function drawFace(api, opts) {
    var ctx = api.ctx, x = api.x, y = api.y, r = api.r, ink = opts.ink || '#1f1630';
    var ex = r * 0.32, ey = y - r * 0.04, es = Math.max(1.3, r * 0.075);
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.2, r * 0.07);
    var look = api.look || 0;
    if (api.dead) {
      [-1, 1].forEach(function (s) {
        var cx = x + s * ex;
        ctx.beginPath(); ctx.moveTo(cx - es, ey - es); ctx.lineTo(cx + es, ey + es); ctx.moveTo(cx + es, ey - es); ctx.lineTo(cx - es, ey + es); ctx.stroke();
      });
    } else if (api.held) {
      [-1, 1].forEach(function (s) {
        var cx = x + s * ex, w = es * 1.3;
        ctx.beginPath(); ctx.moveTo(cx - s * w, ey - w); ctx.lineTo(cx + s * w * 0.4, ey); ctx.lineTo(cx - s * w, ey + w); ctx.stroke();
      });
    } else if (api.blink || opts.sleepy) {
      [-1, 1].forEach(function (s) {
        ctx.beginPath();
        if (opts.sleepy && !api.blink) ctx.arc(x + s * ex, ey - es * 0.3, es * 1.1, 0.15 * Math.PI, 0.85 * Math.PI);
        else { ctx.moveTo(x + s * ex - es, ey); ctx.lineTo(x + s * ex + es, ey); }
        ctx.stroke();
      });
    } else if (!opts.sclera || r < 12) {
      [-1, 1].forEach(function (s) { ctx.beginPath(); ctx.arc(x + s * ex + look * r * 0.03, ey, es, 0, Math.PI * 2); ctx.fill(); });
    } else {
      [-1, 1].forEach(function (s) {
        var cx = x + s * ex;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(cx, ey, r * 0.13, r * 0.155, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ink;
        ctx.beginPath(); ctx.arc(cx + look * r * 0.045, ey + r * 0.02, r * 0.085, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(cx + look * r * 0.045 - r * 0.03, ey - r * 0.02, r * 0.028, 0, Math.PI * 2); ctx.fill();
      });
      ctx.fillStyle = ink;
    }
    var my = y + r * 0.26;
    if (api.dead) { ctx.beginPath(); ctx.arc(x, my + r * 0.08, r * 0.1, Math.PI, 0); ctx.stroke(); }
    else if (opts.mouth === 'pucker') { ctx.lineWidth = Math.max(1, r * 0.055); ctx.beginPath(); ctx.ellipse(x, my, r * (api.held ? 0.05 : 0.07), r * (api.held ? 0.05 : 0.08), 0, 0, Math.PI * 2); ctx.stroke(); }
    else if (api.held) { ctx.beginPath(); ctx.moveTo(x - r * 0.1, my); ctx.quadraticCurveTo(x, my - r * 0.05, x + r * 0.1, my); ctx.stroke(); }
    else if (api.expanded) { ctx.beginPath(); ctx.ellipse(x, my, r * 0.08, r * 0.1, 0, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(x, my - r * 0.04, r * 0.12, 0.15, Math.PI - 0.15); ctx.stroke(); }
    if (!api.dead && r > 13 && opts.cheeks) {
      var puff = opts.puff && api.held ? 1.5 : 1;
      ctx.fillStyle = opts.cheeks;
      [-1, 1].forEach(function (s) { ctx.beginPath(); ctx.ellipse(x + s * r * 0.56, y + r * 0.17, r * 0.13 * puff, r * 0.08 * puff, 0, 0, Math.PI * 2); ctx.fill(); });
    }
  }

  // ── 스킨 정의 ──
  // tint: 발광·잔상·파동 색, spark: 반동 파편 색
  var SKINS = {
    base: {
      tint: '#ff7658', spark: '#ffb59f',
      paint: function (api) {
        radialBody(api, '#ffb59f', api.bodyColor || '#ff7658', mix(api.bodyColor || '#ff7658', '#3a1020', 0.28));
        heatGlow(api); rimLight(api); outline(api, alpha(mix(api.bodyColor || '#ff7658', '#3a1020', 0.28), 0.45)); gloss(api);
        drawFace(api, { sclera: true, cheeks: 'rgba(255,90,110,0.26)' });
      }
    },
    slime: {
      tint: '#33c9a4', spark: '#9ff5dc',
      paint: function (api) {
        var ctx = api.ctx, x = api.x, y = api.y, r = api.r;
        radialBody(api, '#c4fbe9', '#3fd3ad', '#16806c', 0.86);
        clipBody(api);
        for (var i = 0; i < 6; i++) { // 몸 속 기포(압축하면 가운데로 모임)
          var a = hash(i) * Math.PI * 2 + api.now / (900 + i * 130);
          var d = (0.25 + hash(i + 9) * 0.45) * r * (api.held ? 0.45 : 1);
          var br = r * (0.06 + hash(i + 4) * 0.07);
          var by = y + Math.sin(a) * d - ((api.now / (30 + i * 7)) % (r * 0.4)) * 0.3;
          ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = Math.max(0.8, r * 0.025);
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, by, br, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
        heatGlow(api, '#e6fff6'); rimLight(api, 'rgba(255,255,255,0.5)'); outline(api, 'rgba(10,90,75,0.5)'); gloss(api, 0.7);
        drawFace(api, { ink: '#0e4d43', sclera: true, cheeks: 'rgba(255,140,170,0.25)' });
      }
    },
    orange: {
      tint: '#ff9a2e', spark: '#ffd27a',
      paint: function (api) {
        var ctx = api.ctx, x = api.x, y = api.y, r = api.r;
        radialBody(api, '#ffd98c', '#ff9a2e', '#d4600f');
        ctx.fillStyle = 'rgba(160,70,0,0.18)'; // 귤껍질 구멍
        for (var i = 0; i < 22; i++) {
          var a = hash(i) * Math.PI * 2, d = Math.sqrt(hash(i + 31)) * r * 0.85;
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.5, r * 0.03), 0, Math.PI * 2); ctx.fill();
        }
        heatGlow(api); rimLight(api); outline(api, 'rgba(150,60,0,0.45)'); gloss(api, 0.5);
        // 꼭지와 잎(원 안쪽 위)
        ctx.strokeStyle = '#6b4a1e'; ctx.lineWidth = Math.max(1, r * 0.05); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y - r * 0.92); ctx.lineTo(x + r * 0.03, y - r * 0.8); ctx.stroke();
        ctx.fillStyle = '#4caf50';
        ctx.beginPath(); ctx.ellipse(x + r * 0.2, y - r * 0.8, r * 0.18, r * 0.08, api.held ? 0.2 : -0.45, 0, Math.PI * 2); ctx.fill();
        drawFace(api, { ink: '#5a2a00', sclera: true, cheeks: 'rgba(255,80,60,0.25)' });
      }
    },
    watermelon: {
      tint: '#4fae3c', spark: '#2b1d14',
      paint: function (api) {
        var ctx = api.ctx, x = api.x, y = api.y, r = api.r;
        radialBody(api, '#9fdf7c', '#55b13d', '#2e7a24');
        clipBody(api);
        ctx.fillStyle = 'rgba(20,70,20,0.55)';
        for (var i = -2; i <= 2; i++) { // 줄무늬
          var sx = x + i * r * 0.42, w = r * (api.held ? 0.11 : 0.14);
          ctx.beginPath(); ctx.moveTo(sx - w, y - r);
          for (var t = 0; t <= 1.0001; t += 0.125) ctx.lineTo(sx - w + Math.sin(t * 9 + i) * r * 0.05 - i * r * 0.08 * Math.sin(t * Math.PI), y - r + t * 2 * r);
          for (var t2 = 1; t2 >= -0.0001; t2 -= 0.125) ctx.lineTo(sx + w + Math.sin(t2 * 9 + i) * r * 0.05 - i * r * 0.08 * Math.sin(t2 * Math.PI), y - r + t2 * 2 * r);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        heatGlow(api, '#ffd0d0'); rimLight(api); outline(api, 'rgba(20,60,20,0.5)'); gloss(api, 0.45);
        drawFace(api, { ink: '#1b2e14', sclera: true, cheeks: 'rgba(255,90,110,0.35)' });
      }
    },
    puffer: {
      tint: '#f5c04a', spark: '#fff1b8',
      paint: function (api) {
        var ctx = api.ctx, x = api.x, y = api.y, r = api.r;
        radialBody(api, '#fff0b3', '#f5c04a', '#c48a1c');
        ctx.fillStyle = 'rgba(255,248,225,0.75)'; // 밝은 배
        ctx.beginPath(); ctx.ellipse(x, y + r * 0.42, r * 0.62, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = api.held ? '#8a5a0c' : '#b07a1a'; // 가시: 원 안쪽 가장자리에서만
        var n = 14, tip = api.held ? 0.985 : 0.97, baseR = api.held ? 0.8 : 0.85;
        for (var i = 0; i < n; i++) {
          var a = (i / n) * Math.PI * 2 + 0.1, w = 0.11;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a - w) * r * baseR, y + Math.sin(a - w) * r * baseR);
          ctx.lineTo(x + Math.cos(a) * r * tip, y + Math.sin(a) * r * tip);
          ctx.lineTo(x + Math.cos(a + w) * r * baseR, y + Math.sin(a + w) * r * baseR);
          ctx.closePath(); ctx.fill();
        }
        heatGlow(api); outline(api, 'rgba(120,80,10,0.45)'); gloss(api, 0.5);
        drawFace(api, { ink: '#3b2a10', sclera: true, cheeks: 'rgba(255,120,120,0.35)', puff: true, mouth: 'pucker' });
      }
    },
    fur: {
      tint: '#a585f0', spark: '#e2d6ff',
      paint: function (api) {
        var ctx = api.ctx, x = api.x, y = api.y, r = api.r;
        radialBody(api, '#e6dcff', '#a585f0', '#6a4fc0');
        ctx.lineCap = 'round'; ctx.lineWidth = Math.max(0.8, r * 0.05);
        for (var i = 0; i < 44; i++) { // 잔털: 압축하면 곤두섬
          var a = (i / 44) * Math.PI * 2;
          var sway = api.held ? 0 : Math.sin(api.now / 400 + i) * 0.12;
          var r0 = r * 0.78, r1 = r * (api.held ? 0.985 : 0.95);
          ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,0.35)' : 'rgba(70,40,140,0.35)';
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
          ctx.lineTo(x + Math.cos(a + sway) * r1, y + Math.sin(a + sway) * r1);
          ctx.stroke();
        }
        heatGlow(api, '#fff2ff'); gloss(api, 0.4);
        drawFace(api, { ink: '#2a1850', sclera: true, cheeks: 'rgba(255,120,190,0.3)' });
      }
    },
    moon: {
      tint: '#f3e9b0', spark: '#fffbe0',
      paint: function (api) {
        var ctx = api.ctx, x = api.x, y = api.y, r = api.r;
        radialBody(api, '#fffbea', '#e9e2bf', '#aaa284');
        var craters = [[-0.35, 0.3, 0.2], [0.4, -0.25, 0.14], [0.15, 0.55, 0.11], [0.55, 0.3, 0.09], [-0.5, -0.2, 0.08]];
        craters.forEach(function (c) {
          ctx.fillStyle = 'rgba(120,110,80,0.22)';
          ctx.beginPath(); ctx.arc(x + c[0] * r, y + c[1] * r, c[2] * r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = Math.max(0.6, r * 0.025);
          ctx.beginPath(); ctx.arc(x + c[0] * r, y + c[1] * r, c[2] * r, 0.8 * Math.PI, 1.6 * Math.PI); ctx.stroke();
        });
        heatGlow(api, '#ffffff'); outline(api, 'rgba(120,110,80,0.4)'); gloss(api, 0.4);
        drawFace(api, { ink: '#4d4732', sclera: false, cheeks: 'rgba(255,150,140,0.3)', sleepy: true });
      }
    },
    glass: {
      tint: '#9cc8ff', spark: '#ffffff',
      paint: function (api) {
        var ctx = api.ctx, x = api.x, y = api.y, r = api.r;
        var g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.1, x, y, r);
        g.addColorStop(0, 'rgba(235,245,255,0.25)'); g.addColorStop(0.75, 'rgba(170,205,250,0.4)'); g.addColorStop(1, 'rgba(120,160,230,0.75)');
        ctx.fillStyle = g; blobPath(ctx, x, y, r, api.wob, api.phase); ctx.fill();
        clipBody(api);
        var bands = ['#ff6b6b', '#ffb84d', '#ffe66b', '#6be38a', '#5ab8ff', '#9b7bff'];
        ctx.lineWidth = Math.max(0.8, r * 0.05);
        bands.forEach(function (c, i) { // 안쪽 무지개
          ctx.strokeStyle = alpha(c, api.held ? 0.7 : 0.45);
          ctx.beginPath(); ctx.arc(x, y + r * 0.02, r * (0.82 - i * 0.055), Math.PI * 0.2, Math.PI * 0.8); ctx.stroke(); // 얼굴 아래 그릇 모양
        });
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(1, r * 0.06);
        blobPath(ctx, x, y, r * 0.96, api.wob, api.phase); ctx.stroke();
        gloss(api, 0.85);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.ellipse(x + r * 0.42, y + r * 0.42, r * 0.1, r * 0.05, -0.6, 0, Math.PI * 2); ctx.fill();
        drawFace(api, { ink: '#24365a', sclera: true, cheeks: 'rgba(255,140,190,0.3)' });
      }
    }
  };

  // 위험(과압축 근접) 붉은 기운: 모든 스킨에 공통
  function dangerTint(api) {
    if (!(api.danger > 0)) return;
    api.ctx.fillStyle = 'rgba(223,63,59,' + (api.danger * 0.4).toFixed(3) + ')';
    blobPath(api.ctx, api.x, api.y, api.r, api.wob, api.phase); api.ctx.fill();
  }

  function get(id) { return SKINS[id] || SKINS.base; }

  // api: { ctx, x, y, r, held, energy, dead, danger, now, wob, phase, look, blink, expanded, bodyColor? }
  function paint(id, api) {
    var skin = get(id);
    skin.paint(api);
    if (api.danger > 0 && !api.dead) {
      dangerTint(api);
      drawFace(api, { ink: '#1f1630', sclera: false }); // 붉은 기운 위로 얼굴을 다시 선명하게
    }
  }

  // 미리보기(외형 화면): 캔버스 가운데에 기본 상태로 그린다
  function preview(canvas, id, opts) {
    opts = opts || {};
    var dpr = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    var cssW = opts.size || 64;
    canvas.width = cssW * dpr; canvas.height = cssW * dpr;
    canvas.style.width = cssW + 'px'; canvas.style.height = cssW + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssW);
    var r = cssW * 0.36, c = cssW / 2, skin = get(id);
    var halo = ctx.createRadialGradient(c, c, r * 0.6, c, c, r * 1.35);
    halo.addColorStop(0, alpha(skin.tint, 0.3)); halo.addColorStop(1, alpha(skin.tint, 0));
    ctx.fillStyle = halo; ctx.fillRect(0, 0, cssW, cssW);
    paint(id, { ctx: ctx, x: c, y: c, r: r, held: !!opts.held, energy: opts.held ? 0.5 : 0, dead: false, danger: 0, now: opts.now || 0, wob: 0, phase: 0, look: 0, blink: false, expanded: false });
  }

  return {
    ids: Object.keys(SKINS),
    get: get,
    paint: paint,
    preview: preview,
    blobPath: blobPath
  };
});
