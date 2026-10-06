// Generator — 장애물 생성기.
//   r0: 기준 시제품 생성기(명세서 9.1). 시드 9173과 난수 호출 순서를 그대로 유지.
//   g1: 출시 생성 정책(명세서 9.2, FIX-07). 첫 세 블록 고정 + 실행별 시드 + 연결 규칙 + 대체 블록.
//   g2: g1 + 쉬운 시작 — patternUnlockZ(높이 전에는 해당 패턴 대신 짧은 틈), 연결 규칙의 untilZ(초반에만 적용).
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var Rng = isNode ? require('./rng.js') : root.KKUK.Rng;
  var mod = factory(Rng);
  if (isNode) module.exports = mod;
  else { root.KKUK = root.KKUK || {}; root.KKUK.Generator = mod; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Rng) {
  'use strict';

  // 기준 시제품의 선택지 순서: floor(random × 3) → 0 짧은 틈, 1 긴 틈, 2 연속 틈
  var R0_PATTERN_ORDER = ['short', 'long', 'double'];

  function createGeneratorState(gen, seed) {
    return {
      version: gen.version || 'r0',
      rng: Rng.createRng(seed == null ? gen.seed : seed),
      nextZ: gen.firstZ,
      blockIndex: 0,
      nextGateId: 1,
      prev: null,        // 직전 블록 { kind, cx }
      fallbacks: 0       // 대체 블록 사용 횟수(진단용)
    };
  }

  function pickIndex(gs, gen, count) {
    return Math.floor(Rng.nextFloat(gs.rng, gen) * count);
  }

  function makeGate(gs, z, pattern, gap, kind, cx, blockIndex, fallback) {
    return { id: gs.nextGateId++, z: z, h: pattern.height, gap: gap + pattern.gapBonus, kind: kind, cx: cx, block: blockIndex, passed: false, fallback: !!fallback };
  }

  function emitBlock(gs, gen, z, kind, cx, index, fallback) {
    var L = Math.min(1, z / gen.difficultyRampZ);
    var gap = Math.max(gen.gapFloor, gen.gapBase - gen.gapDecrease * L);
    var pattern = gen.patterns[kind];
    var gates = [makeGate(gs, z, pattern, gap, kind, cx, index, fallback)];
    if (kind === 'double') gates.push(makeGate(gs, z + pattern.gateOffset, pattern, gap, kind, cx, index, fallback));
    gs.nextZ = z + pattern.strideBase - pattern.strideReduction * L;
    gs.prev = { kind: kind, cx: cx };
    return gates;
  }

  // 블록 하나(게이트 1~2개)를 만들고 생성 상태를 전진시킨다.
  // 난수 호출 순서: 패턴 선택 → 중심 선택 (첫 세 블록은 둘 다 호출하지 않음)
  function createNextBlockR0(gs, gen) {
    var index = gs.blockIndex++;
    var fixed = index < gen.firstPatternTypes.length;
    var kind = fixed ? gen.firstPatternTypes[index] : R0_PATTERN_ORDER[pickIndex(gs, gen, R0_PATTERN_ORDER.length)];
    var cx = fixed ? gen.firstCenters[index] : gen.laterCenters[pickIndex(gs, gen, gen.laterCenters.length)];
    return emitBlock(gs, gen, gs.nextZ, kind, cx, index, false);
  }

  // 연결 규칙: connection.forbid = [{ prev, next, minShift, untilZ? }] ('*'는 모든 패턴)
  // 직전 블록 → 후보 블록의 X 이동량이 minShift 이상이면 금지. untilZ가 있으면 그 높이 전에만 적용.
  function isConnectionSafe(prev, kind, cx, gen, z) {
    if (!prev) return true;
    var rules = (gen.connection && gen.connection.forbid) || [];
    var shift = Math.abs(cx - prev.cx);
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.untilZ != null && z != null && z >= r.untilZ) continue;
      if ((r.prev === '*' || r.prev === prev.kind) && (r.next === '*' || r.next === kind) && shift >= r.minShift) return false;
    }
    return true;
  }

  function createNextBlockG1(gs, gen) {
    var index = gs.blockIndex++;
    if (index < gen.firstPatternTypes.length) {
      return emitBlock(gs, gen, gs.nextZ, gen.firstPatternTypes[index], gen.firstCenters[index], index, false);
    }
    var kind = R0_PATTERN_ORDER[pickIndex(gs, gen, R0_PATTERN_ORDER.length)];
    var cx = gen.laterCenters[pickIndex(gs, gen, gen.laterCenters.length)];
    // 쉬운 시작: 아직 해금되지 않은 패턴은 다시 뽑지 않고 짧은 틈으로
    if (gen.patternUnlockZ && gs.nextZ < (gen.patternUnlockZ[kind] || 0)) kind = 'short';
    if (isConnectionSafe(gs.prev, kind, cx, gen, gs.nextZ)) return emitBlock(gs, gen, gs.nextZ, kind, cx, index, false);
    // 불확실한 후보는 다시 뽑지 않고 넓은 회복 구간 후 중앙 짧은 틈으로 대체
    gs.fallbacks++;
    var f = gen.fallback;
    return emitBlock(gs, gen, gs.nextZ + f.recoveryStride, f.pattern, f.center, index, true);
  }

  function createNextBlock(gs, gen) {
    return gs.version === 'r0' ? createNextBlockR0(gs, gen) : createNextBlockG1(gs, gen);
  }

  function fillAhead(gs, gates, distance, gen) {
    while (gs.nextZ < distance + gen.lookAhead) {
      var block = createNextBlock(gs, gen);
      for (var i = 0; i < block.length; i++) gates.push(block[i]);
    }
  }

  return {
    R0_PATTERN_ORDER: R0_PATTERN_ORDER,
    createGeneratorState: createGeneratorState,
    createNextBlock: createNextBlock,
    isConnectionSafe: isConnectionSafe,
    fillAhead: fillAhead
  };
});
