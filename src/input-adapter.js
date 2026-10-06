// InputAdapter — 화면/키보드 입력을 논리 입력 전이(ops)와 이동 축(axis)으로 변환.
// DOM에 의존하지 않는다. 브라우저·GDevelop 쪽에서 이벤트 값을 넘겨 호출한다.
//
// 상대 드래그(명세서 5.1):
//   pointerTargetX = pressAnchorWorldX + (clientX - pressAnchorClientX) × (worldWidth / surfaceWidth)
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.KKUK = root.KKUK || {}; root.KKUK.InputAdapter = mod; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LEFT = ['ArrowLeft', 'KeyA'];
  var RIGHT = ['ArrowRight', 'KeyD'];

  // options.cancelAsRelease: true = R0(취소를 손 떼기로 처리), false = R1(FIX-03, 취소는 입력 폐기)
  function createInputAdapter(balance, options) {
    var cancelAsRelease = !options || options.cancelAsRelease !== false;
    var worldWidth = balance.world.width;
    var pointerId = null;
    var anchorClientX = 0, anchorWorldX = 0, scale = 1;
    var keyHeld = false;
    var moveKeys = new Set();
    var ops = [];
    var held = false;
    var modesUsed = { touch: false, keyboard: false };

    function setHeld(on) {
      if (held === on) return;
      held = on;
      ops.push({ type: 'hold', value: on });
    }

    return {
      // worldX: 누른 순간의 캐릭터 X. surfaceWidth: 해당 입력 영역의 CSS 너비.
      pointerDown: function (e) {
        if (e.button !== undefined && e.button !== 0) return false;
        if (pointerId !== null) return false; // 두 번째 손가락은 무시
        pointerId = e.pointerId;
        anchorClientX = e.clientX;
        anchorWorldX = e.worldX;
        scale = worldWidth / e.surfaceWidth;
        modesUsed.touch = true;
        setHeld(true);
        return true;
      },
      pointerMove: function (e) {
        if (pointerId !== e.pointerId) return false;
        // 1/64 단위로 맞춘다(화면상 구분 불가). 고스트 기록·재생이 정확히 같아지도록 입력 단계에서 고정.
        ops.push({ type: 'target', x: Math.round((anchorWorldX + (e.clientX - anchorClientX) * scale) * 64) / 64 });
        return true;
      },
      pointerUp: function (e) {
        if (pointerId !== e.pointerId) return false;
        pointerId = null;
        ops.push({ type: 'snap' });
        setHeld(keyHeld);
        return true;
      },
      // R0: 취소 = 정상 해제. R1(FIX-03): 반동·snap 없이 포인터만 폐기하고 true를 돌려준다.
      // 호출한 쪽(컨트롤러)이 일시정지를 건다.
      pointerCancel: function (e) {
        if (cancelAsRelease) return this.pointerUp(e);
        if (pointerId !== e.pointerId) return false;
        pointerId = null;
        return true;
      },

      keyDown: function (e) {
        if (LEFT.indexOf(e.code) >= 0 || RIGHT.indexOf(e.code) >= 0) {
          moveKeys.add(e.code);
          modesUsed.keyboard = true;
          return true;
        }
        if (e.code === 'Space') {
          if (e.repeat) return true;
          keyHeld = true;
          modesUsed.keyboard = true;
          setHeld(true);
          return true;
        }
        return false;
      },
      keyUp: function (e) {
        if (moveKeys.delete(e.code)) return true;
        if (e.code === 'Space') {
          keyHeld = false;
          setHeld(pointerId !== null);
          return true;
        }
        return false;
      },

      axis: function () {
        var r = RIGHT.some(function (k) { return moveKeys.has(k); }) ? 1 : 0;
        var l = LEFT.some(function (k) { return moveKeys.has(k); }) ? 1 : 0;
        return r - l;
      },
      // 한 틱에 소비할 입력. ops는 첫 틱에서만 적용되도록 비운다.
      collect: function () {
        var frame = { ops: ops, axis: this.axis() };
        ops = [];
        return frame;
      },
      // 물리 장치 상태를 폐기한다(일시정지·사망·재시작).
      reset: function () {
        pointerId = null;
        keyHeld = false;
        moveKeys.clear();
        ops = [];
        held = false;
      },
      resetModes: function () { modesUsed = { touch: false, keyboard: false }; },
      inputMode: function () {
        if (modesUsed.touch && modesUsed.keyboard) return 'mixed';
        return modesUsed.keyboard ? 'keyboard' : 'touch';
      },
      isHeld: function () { return held; },
      physicalHeld: function () { return pointerId !== null || keyHeld; },
      // 재개(FIX-02/08): 대기 중 쌓인 전이는 버리고, 보존된 논리 압축과 현재 실제 입력을 비교해
      // 다르면 정상 전이 1회를 예약한다(첫 물리 틱에서 적용).
      beginResume: function (logicalHeld) {
        ops = [];
        held = !!logicalHeld;
        setHeld(this.physicalHeld());
      },
      hasPointer: function () { return pointerId !== null; },
      isKeyboardActive: function () { return keyHeld || moveKeys.size > 0; }
    };
  }

  return { createInputAdapter: createInputAdapter };
});
