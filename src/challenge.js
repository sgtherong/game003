// Challenge — 친구 도전장(서버 없는 비동기 대결).
// 링크 = 코스 시드 + 기록 + (가능하면) 입력 기록. 받은 쪽은 입력 기록을 직접 재계산해 기록을 검증한다.
// 링크 내용은 신뢰할 수 없는 외부 입력이므로 모든 값을 범위·형식 검사한다. 실행 가능한 코드나 HTML은 담지 않는다.
//
// 바이너리 형식(v1): 모든 정수는 varint(부호 있는 값은 zigzag)
//   [1] seed rules balance generator height passed ticks skin name count (dtick code [value])*
// 문자열 = 길이 varint + UTF-8 바이트. 압축은 플랫폼 쪽(브라우저 CompressionStream, Node zlib)에서 한다.
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var Replay = isNode ? require('./replay.js') : root.KKUK.Replay;
  var Simulation = isNode ? require('./simulation.js') : root.KKUK.Simulation;
  var mod = factory(Replay, Simulation);
  if (isNode) module.exports = mod;
  else { root.KKUK = root.KKUK || {}; root.KKUK.Challenge = mod; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Replay, Simulation) {
  'use strict';

  var VERSION = 1;
  var MAX_LINK_CHARS = 7000;     // 이보다 길면 입력 기록을 빼고 기록만 보낸다
  var MAX_NAME = 12;
  var MAX_BYTES = 200000;        // 압축 해제 후 허용 크기
  var MAX_TICKS = 120 * 60 * 30; // 30분

  // ── UTF-8 ──
  function utf8Encode(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.codePointAt(i);
      if (c > 0xffff) i++;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function utf8Decode(bytes) {
    var s = '', i = 0;
    while (i < bytes.length) {
      var b = bytes[i++], c;
      if (b < 0x80) c = b;
      else if (b >= 0xf0) c = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
      else if (b >= 0xe0) c = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
      else c = ((b & 31) << 6) | (bytes[i++] & 63);
      s += String.fromCodePoint(c);
    }
    return s;
  }

  // 이름: 제어 문자 제거, 앞뒤 공백 제거, 최대 12자(코드 포인트 기준)
  // 표시를 깨거나 속일 수 있는 문자(제어 문자, 폭 없는 문자, 줄 구분자, 방향 제어 문자)
  function isUnsafeChar(c) {
    return c < 0x20 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069);
  }
  function cleanName(s) {
    if (typeof s !== 'string') return '';
    var t = Array.from(s).filter(function (ch) { return !isUnsafeChar(ch.codePointAt(0)); }).join('').trim();
    return Array.from(t).slice(0, MAX_NAME).join('');
  }

  // ── varint ──
  function Writer() { this.b = []; }
  Writer.prototype.uint = function (v) {
    if (!(v >= 0) || !isFinite(v) || v > 0xffffffff) throw new Error('uint range');
    v = Math.floor(v);
    while (v >= 0x80) { this.b.push((v % 0x80) | 0x80); v = Math.floor(v / 0x80); }
    this.b.push(v);
  };
  Writer.prototype.sint = function (v) { this.uint(v >= 0 ? v * 2 : -v * 2 - 1); };
  Writer.prototype.str = function (s) { var u = utf8Encode(s); this.uint(u.length); for (var i = 0; i < u.length; i++) this.b.push(u[i]); };

  function Reader(bytes) { this.b = bytes; this.i = 0; }
  Reader.prototype.uint = function () {
    var v = 0, mul = 1, n = 0;
    while (true) {
      if (this.i >= this.b.length || n++ > 5) throw new Error('varint');
      var x = this.b[this.i++];
      v += (x & 0x7f) * mul;
      if (!(x & 0x80)) break;
      mul *= 0x80;
    }
    if (v > 0xffffffff) throw new Error('varint range');
    return v;
  };
  Reader.prototype.sint = function () { var u = this.uint(); return u % 2 ? -(u + 1) / 2 : u / 2; };
  Reader.prototype.str = function (max) {
    var n = this.uint();
    if (n > max || this.i + n > this.b.length) throw new Error('string');
    var s = utf8Decode(this.b.slice(this.i, this.i + n)); this.i += n; return s;
  };

  // payload: { seed, rulesVersion, balanceVersion, generatorVersion, height, passed, ticks, skin, name, replay: number[] | null }
  function toBytes(p) {
    var w = new Writer();
    w.uint(VERSION); w.uint(p.seed >>> 0);
    w.str(p.rulesVersion); w.str(p.balanceVersion); w.str(p.generatorVersion);
    w.uint(p.height); w.uint(p.passed); w.uint(p.ticks);
    w.str(p.skin || 'base'); w.str(cleanName(p.name));
    var d = p.replay || [];
    w.uint(d.length / 3);
    var last = 0;
    for (var i = 0; i < d.length; i += 3) {
      w.uint(d[i] - last); last = d[i];
      w.uint(d[i + 1]);
      if (d[i + 1] === 2 || d[i + 1] === 4) w.sint(d[i + 2]);
    }
    return new Uint8Array(w.b);
  }

  function fromBytes(bytes) {
    if (!bytes || bytes.length > MAX_BYTES) throw new Error('size');
    var r = new Reader(bytes);
    if (r.uint() !== VERSION) throw new Error('version');
    var p = { seed: r.uint(), rulesVersion: r.str(16), balanceVersion: r.str(16), generatorVersion: r.str(16) };
    p.height = r.uint(); p.passed = r.uint(); p.ticks = r.uint();
    p.skin = r.str(24); p.name = cleanName(r.str(64));
    var n = r.uint();
    if (n > Replay.MAX_NUMBERS / 3) throw new Error('replay size');
    var d = [], tick = 0;
    for (var i = 0; i < n; i++) {
      tick += r.uint();
      var code = r.uint();
      if (code > 4) throw new Error('code');
      d.push(tick, code, code === 2 || code === 4 ? r.sint() : 0);
    }
    if (r.i !== bytes.length) throw new Error('trailing');
    if (p.ticks > MAX_TICKS || p.height > 1e6 || p.passed > 1e6) throw new Error('range');
    p.replay = n ? d : null;
    return p;
  }

  // ── base64url ──
  var ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      s += ALPH[(n >> 18) & 63] + ALPH[(n >> 12) & 63];
      if (i + 1 < bytes.length) s += ALPH[(n >> 6) & 63];
      if (i + 2 < bytes.length) s += ALPH[n & 63];
    }
    return s;
  }
  function unb64url(s) {
    if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) throw new Error('base64');
    var out = [];
    for (var i = 0; i < s.length; i += 4) {
      var n = (ALPH.indexOf(s[i]) << 18) | (ALPH.indexOf(s[i + 1]) << 12) | ((i + 2 < s.length ? ALPH.indexOf(s[i + 2]) : 0) << 6) | (i + 3 < s.length ? ALPH.indexOf(s[i + 3]) : 0);
      out.push((n >> 16) & 255);
      if (i + 2 < s.length) out.push((n >> 8) & 255);
      if (i + 3 < s.length) out.push(n & 255);
    }
    return new Uint8Array(out);
  }

  // ── 검증: 입력 기록을 직접 재계산해 주장한 기록과 비교 ──
  // 반환: { status: 'verified' | 'unverified' | 'mismatch' | 'version', height, passed }
  function verify(p, balance) {
    var gv = balance.generator.version || 'r0';
    var bv = balance.balanceVersion || balance.profile;
    if (p.rulesVersion !== 'r1' || p.balanceVersion !== bv || p.generatorVersion !== gv) return { status: 'version' };
    if (!p.replay) return { status: 'unverified' };
    var rp = { v: 1, seed: p.seed, ticks: p.ticks, data: p.replay };
    if (!Replay.validReplay(rp)) return { status: 'mismatch' };
    var run = Simulation.createRun({ balance: balance, seed: p.seed, rulesVersion: 'r1', runId: 'verify' });
    var player = Replay.createPlayer(rp);
    var dt = balance.world.fixedStepSeconds;
    while (run.alive && run.tick <= p.ticks + 2) Simulation.step(run, player.frame(run.tick), dt, balance);
    var h = Simulation.heightMeters(run, balance);
    var ok = !run.alive && run.tick === p.ticks && h === p.height && run.passedCount === p.passed;
    return { status: ok ? 'verified' : 'mismatch', height: h, passed: run.passedCount };
  }

  // 대결 결과: 높이 → 통과 수 순으로 비교
  function compare(mine, theirs) {
    if (mine.height !== theirs.height) return mine.height > theirs.height ? 'win' : 'lose';
    if (mine.passed !== theirs.passed) return mine.passed > theirs.passed ? 'win' : 'lose';
    return 'draw';
  }

  return {
    VERSION: VERSION, MAX_LINK_CHARS: MAX_LINK_CHARS, MAX_NAME: MAX_NAME,
    toBytes: toBytes, fromBytes: fromBytes, b64url: b64url, unb64url: unb64url,
    cleanName: cleanName, verify: verify, compare: compare
  };
});
