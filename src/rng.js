// Rng — 기준 시제품과 동일한 LCG. 호출 순서까지 같아야 같은 코스가 나온다.
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.KKUK = root.KKUK || {}; root.KKUK.Rng = mod; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createRng(seed) {
    return { seed: seed >>> 0 };
  }

  // seed = (a × seed + c) mod 2³², random = seed / 2³²
  function nextFloat(rng, gen) {
    rng.seed = (Math.imul(rng.seed, gen.lcgMultiplier) + gen.lcgIncrement) >>> 0;
    return rng.seed / gen.lcgModulus;
  }

  return { createRng: createRng, nextFloat: nextFloat };
});
