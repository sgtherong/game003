// Growth — 성장 모드(판 안 성장) 규칙. DOM·엔진 의존 없음.
//   경험치 구슬 → 레벨업 → 능력 3지선다 → 능력이 이번 판의 수치를 덧씌움(유효 설정).
//   스프링·에너지·충돌 공식은 Simulation 그대로이며, 능력은 그 계수만 바꾼다.
//   구슬·카드 난수는 코스 난수와 분리된 스트림을 쓴다(능력을 골라도 코스는 같은 시드면 같다).
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var Rng = isNode ? require('./rng.js') : root.KKUK.Rng;
  var Simulation = isNode ? require('./simulation.js') : root.KKUK.Simulation;
  var mod = factory(Rng, Simulation);
  if (isNode) module.exports = mod;
  else { root.KKUK = root.KKUK || {}; root.KKUK.Growth = mod; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Rng, Simulation) {
  'use strict';

  var ORB_STREAM = 0x9e3779b9; // 코스 난수와 분리

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // 성장 모드의 기본 설정: R1 + 난이도 곡선 강화(능력으로 쉬워지는 만큼 틈이 더 빨리 좁아짐)
  function baseBalance(balance) {
    var b = clone(balance);
    var d = balance.growth.difficulty;
    b.generator.difficultyRampZ = d.difficultyRampZ;
    b.generator.gapDecrease = d.gapDecrease;
    b.generator.gapFloor = d.gapFloor;
    b.profile = balance.profile + '-growth';
    return b;
  }

  // 능력 스택 → 이번 판의 유효 설정
  function effectiveBalance(base, g, stacks, evolved, curse) {
    var b = clone(base);
    var A = g.abilities;
    var n = function (id) { return stacks[id] || 0; };
    b.energy.chargePerSecond *= Math.max(0.1, 1 + A.toughBody.chargeMul * n('toughBody'));
    b.energy.recoverPerSecond *= 1 + A.quickRecover.recoverMul * n('quickRecover');
    var imp = Math.max(0.2, 1 + A.cushion.impulseMul * n('cushion'));
    b.spring.releaseImpulseBase *= imp;
    b.spring.releaseImpulsePerEnergy *= imp;
    var move = 1 + A.slideFeet.moveMul * n('slideFeet');
    b.player.pointerSpeed *= move;
    b.player.keyboardSpeed *= move;
    if (n('focus')) { b.ascent.focusThreshold = A.focus.threshold; b.ascent.focusMultiplier = A.focus.speedMul; }
    if (curse) b.ascent.speedMultiplier = 1 + g.curse.speedMul * curse;
    if (evolved.steelLungs) {
      b.energy.failAt = g.evolutions.steelLungs.failAt;
      b.energy.storageCap = g.evolutions.steelLungs.failAt + 0.01;
    }
    return b;
  }

  function createGrowth(balance, runSeed) {
    var g = balance.growth;
    var base = baseBalance(balance);
    var gs = {
      level: 1,
      xp: 0,
      xpToNext: g.xp.first,
      stacks: {},
      evolved: {},
      curse: 0,
      orbs: [],
      offers: null,
      picks: [],
      seenBlocks: {},
      nextOrbId: 1,
      rng: Rng.createRng((runSeed ^ ORB_STREAM) >>> 0),
      balance: base,
      base: base,
      foresight: 0
    };

    function rand() { return Rng.nextFloat(gs.rng, balance.generator); }
    function recompute() { gs.balance = effectiveBalance(base, g, gs.stacks, gs.evolved, gs.curse); }

    gs.pickupRadius = function () { return g.orbs.pickupRadius + g.abilities.magnet.radiusAdd * (gs.stacks.magnet || 0); };
    gs.xpPerOrb = function () { return g.xp.orbValue * (1 + g.curse.xpMul * gs.curse); };

    // 새로 생성된 블록 사이에 구슬 배치: 직전 블록 위끝과 이번 블록 아래끝의 중간
    function placeOrbs(run) {
      var byBlock = {};
      for (var i = 0; i < run.gates.length; i++) {
        var gt = run.gates[i];
        if (gt.block == null || gt.block < 0) continue;
        var b = byBlock[gt.block] || (byBlock[gt.block] = { bottom: Infinity, top: -Infinity });
        b.bottom = Math.min(b.bottom, gt.z - gt.h / 2);
        b.top = Math.max(b.top, gt.z + gt.h / 2);
      }
      Object.keys(byBlock).map(Number).sort(function (a, b) { return a - b; }).forEach(function (blk) {
        if (gs.seenBlocks[blk]) return;
        gs.seenBlocks[blk] = true;
        var prev = byBlock[blk - 1];
        if (!prev) return; // 직전 블록이 이미 정리됐거나 첫 블록
        var mid = (prev.top + byBlock[blk].bottom) / 2;
        var count = 1 + Math.floor(rand() * g.orbs.perBlockMax);
        var lane = g.orbs.lanes[Math.floor(rand() * g.orbs.lanes.length)];
        for (var k = 0; k < count; k++) {
          var z = count === 1 ? mid : mid + (k === 0 ? -1 : 1) * g.orbs.pairOffset / 2;
          gs.orbs.push({ id: gs.nextOrbId++, x: lane, z: z, taken: false });
        }
      });
    }

    function makeOffers() {
      var offers = [];
      // 진화 조건을 만족하면 진화 카드를 반드시 포함
      Object.keys(g.evolutions).forEach(function (id) {
        var ev = g.evolutions[id];
        if (gs.evolved[id]) return;
        if (ev.requires.every(function (r) { return (gs.stacks[r] || 0) >= ev.requiresStacks; })) offers.push({ kind: 'evolution', id: id });
      });
      var pool = Object.keys(g.abilities).filter(function (id) { return (gs.stacks[id] || 0) < g.abilities[id].max; });
      while (offers.length < g.offerCount && pool.length) {
        var idx = Math.floor(rand() * pool.length);
        offers.push({ kind: 'ability', id: pool.splice(idx, 1)[0] });
      }
      // 저주 카드: 위험-보상(상승 속도↑, 구슬 경험치↑)
      if (gs.curse < g.curse.max && rand() < g.curse.chance) {
        var curseCard = { kind: 'curse', id: g.curse.id };
        if (offers.length >= g.offerCount) offers[offers.length - 1] = curseCard; else offers.push(curseCard);
      }
      offers.forEach(function (o) { o.stacks = o.kind === 'ability' ? (gs.stacks[o.id] || 0) : o.kind === 'curse' ? gs.curse : 0; o.max = o.kind === 'ability' ? g.abilities[o.id].max : o.kind === 'curse' ? g.curse.max : 1; });
      return offers;
    }

    // 매 틱 Simulation.step 직후 호출. 반환: 성장 이벤트 배열
    gs.afterStep = function (run, events) {
      var out = [];
      placeOrbs(run);

      for (var i = 0; i < events.length; i++) {
        var e = events[i];
        if (e.type !== 'release') continue;
        // 충격파: 강한 반동이면 앞의 벽 하나의 틈을 넓힘
        if ((gs.stacks.shockwave || 0) && e.energy >= g.abilities.shockwave.minEnergy) {
          var w = nextGateAhead(run, g.abilities.shockwave.reach, function (gt) { return !gt.widened; });
          if (w) { w.widened = true; w.gap += g.abilities.shockwave.gapBonus * gs.stacks.shockwave; out.push({ type: 'gateWidened', gateId: w.id }); }
        }
        // 반동 폭발(진화): 강한 반동이면 앞의 벽 하나를 부숨
        if (gs.evolved.reboundBlast && e.energy >= g.evolutions.reboundBlast.minEnergy) {
          var t = nextGateAhead(run, g.evolutions.reboundBlast.reach, function () { return true; });
          if (t) { var be = []; Simulation.breakGate(run, t, be, 'blast'); out = out.concat(be); }
        }
      }

      // 구슬 줍기
      var pr = gs.pickupRadius();
      for (var j = 0; j < gs.orbs.length; j++) {
        var o = gs.orbs[j];
        if (o.taken) continue;
        var dx = o.x - run.x, dz = o.z - run.distance, reach = run.radius + pr;
        if (dx * dx + dz * dz <= reach * reach) {
          o.taken = true;
          gs.xp += gs.xpPerOrb();
          out.push({ type: 'orbCollected', orbId: o.id, x: o.x, z: o.z, xp: gs.xp, xpToNext: gs.xpToNext });
        }
      }
      var cut = run.distance - balance.generator.cleanupBehind;
      gs.orbs = gs.orbs.filter(function (o) { return !o.taken && o.z > cut; });

      if (gs.xp >= gs.xpToNext && !gs.offers) {
        gs.xp -= gs.xpToNext;
        gs.level++;
        gs.xpToNext = g.xp.first + g.xp.perLevel * (gs.level - 1);
        gs.offers = makeOffers();
        out.push({ type: 'levelUp', level: gs.level, offers: gs.offers });
      }
      return out;
    };

    function nextGateAhead(run, reach, ok) {
      var best = null;
      for (var i = 0; i < run.gates.length; i++) {
        var gt = run.gates[i];
        if (gt.broken || gt.passed) continue;
        var bottom = gt.z - gt.h / 2;
        if (bottom < run.distance || bottom - run.distance > reach || !ok(gt)) continue;
        if (!best || gt.z < best.z) best = gt;
      }
      return best;
    }

    // 카드 선택. 반환: 선택한 카드(잘못된 번호면 null)
    gs.choose = function (run, index) {
      if (!gs.offers || !gs.offers[index]) return null;
      var card = gs.offers[index];
      if (card.kind === 'ability') {
        gs.stacks[card.id] = (gs.stacks[card.id] || 0) + 1;
        if (card.id === 'shield') run.shields++;
        if (card.id === 'foresight') gs.foresight = g.abilities.foresight.gates;
      } else if (card.kind === 'evolution') {
        gs.evolved[card.id] = true;
      } else if (card.kind === 'curse') {
        gs.curse++;
      }
      gs.picks.push(card.kind + ':' + card.id);
      gs.offers = null;
      recompute();
      return card;
    };

    gs.summary = function () {
      return { level: gs.level, picks: gs.picks.slice(), stacks: clone(gs.stacks), evolved: Object.keys(gs.evolved), curse: gs.curse };
    };

    return gs;
  }

  return { createGrowth: createGrowth, baseBalance: baseBalance, effectiveBalance: effectiveBalance };
});
