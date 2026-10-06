// Replay — 입력 틱 기록·재생(고스트용). 결정적 계산이라 같은 입력이면 같은 결과가 나온다.
// 저장 형식(평탄한 숫자 배열): [tick, code, value, tick, code, value, ...]
//   code 0 = 손 뗌, 1 = 누름, 2 = 목표 X(value = X × 64 정수), 3 = snap, 4 = 이동 축(value = -1|0|1)
// 목표 X는 입력 단계에서 이미 1/64 단위로 맞춰져 있으므로(InputAdapter) 기록·재생이 정확히 같다.
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.KKUK = root.KKUK || {}; root.KKUK.Replay = mod; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var Q = 64;
  var MAX_NUMBERS = 90000; // 30,000개 입력(약 1.5MB 미만) — 넘으면 저장하지 않음

  function createRecorder(meta) {
    var data = [];
    var lastAxis = 0;
    var overflow = false;
    return {
      // 한 틱에 소비한 입력(frame = { ops, axis })을 기록
      tick: function (tick, frame) {
        if (overflow) return;
        var ops = frame.ops || [];
        for (var i = 0; i < ops.length; i++) {
          var op = ops[i];
          // 같은 틱의 연속된 목표 X는 마지막 값만 의미가 있다
          if (op.type === 'target' && ops[i + 1] && ops[i + 1].type === 'target') continue;
          if (op.type === 'hold') data.push(tick, op.value ? 1 : 0, 0);
          else if (op.type === 'target') data.push(tick, 2, Math.round(op.x * Q));
          else if (op.type === 'snap') data.push(tick, 3, 0);
        }
        var axis = frame.axis || 0;
        if (axis !== lastAxis) { data.push(tick, 4, axis); lastAxis = axis; }
        if (data.length > MAX_NUMBERS) overflow = true;
      },
      finish: function (ticks) {
        if (overflow) return null;
        return { v: 1, seed: meta.seed, rulesVersion: meta.rulesVersion, balanceVersion: meta.balanceVersion, generatorVersion: meta.generatorVersion, ticks: ticks, data: data.slice() };
      }
    };
  }

  // 재생기: frame(tick)은 그 틱의 입력을 돌려준다(틱은 0부터 차례로 요청)
  function createPlayer(replay) {
    var d = replay.data, i = 0, axis = 0;
    return {
      frame: function (tick) {
        var ops = [];
        while (i < d.length && d[i] < tick) i += 3; // 건너뛴 틱 보호
        while (i < d.length && d[i] === tick) {
          var code = d[i + 1], v = d[i + 2];
          if (code === 0 || code === 1) ops.push({ type: 'hold', value: code === 1 });
          else if (code === 2) ops.push({ type: 'target', x: v / Q });
          else if (code === 3) ops.push({ type: 'snap' });
          else if (code === 4) axis = v;
          i += 3;
        }
        return { ops: ops, axis: axis };
      }
    };
  }

  function validReplay(r) {
    if (!r || typeof r !== 'object' || r.v !== 1 || !Array.isArray(r.data)) return false;
    if (r.data.length % 3 !== 0 || r.data.length > MAX_NUMBERS) return false;
    if (typeof r.seed !== 'number' || !isFinite(r.seed) || typeof r.ticks !== 'number' || !isFinite(r.ticks)) return false;
    for (var i = 0; i < r.data.length; i += 3) {
      var t = r.data[i], c = r.data[i + 1], v = r.data[i + 2];
      if (!Number.isInteger(t) || t < 0 || [0, 1, 2, 3, 4].indexOf(c) < 0 || !Number.isInteger(v) || Math.abs(v) > 1e6) return false;
      if (i > 0 && t < r.data[i - 3]) return false;
    }
    return true;
  }

  // 날짜 문자열(YYYY-MM-DD) → 시드(FNV-1a)
  function dateSeed(dateStr) {
    var h = 0x811c9dc5;
    for (var i = 0; i < dateStr.length; i++) { h ^= dateStr.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function localDate(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  return { Q: Q, MAX_NUMBERS: MAX_NUMBERS, createRecorder: createRecorder, createPlayer: createPlayer, validReplay: validReplay, dateSeed: dateSeed, localDate: localDate };
});
