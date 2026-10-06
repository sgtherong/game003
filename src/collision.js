// Collision — 원(캐릭터)과 좌우 벽 띠(장애물)의 거리 판정. 명세서 8장.
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.KKUK = root.KKUK || {}; root.KKUK.Collision = mod; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function verticalDistance(gate, distance) {
    return Math.max(0, Math.abs(gate.z - distance) - gate.h / 2);
  }

  // gate.gap 은 틈 전체 너비다(반너비 아님).
  function horizontalDistance(gate, x) {
    var left = gate.cx - gate.gap / 2;
    var right = gate.cx + gate.gap / 2;
    return Math.min(Math.max(0, x - left), Math.max(0, right - x));
  }

  // player: { x, r, distance }
  function checkCollision(player, gate, inset) {
    var dy = verticalDistance(gate, player.distance);
    var dx = horizontalDistance(gate, player.x);
    var cr = Math.max(0, player.r - inset);
    return dx * dx + dy * dy < cr * cr;
  }

  return {
    verticalDistance: verticalDistance,
    horizontalDistance: horizontalDistance,
    checkCollision: checkCollision
  };
});
