// 자동 생성 파일 — 직접 수정 금지. 원본: config/balance-r0.json (npm run sync-config)
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else { root.KKUK = root.KKUK || {}; root.KKUK.balanceR0 = data; }
})(typeof globalThis !== 'undefined' ? globalThis : this, {
  "schemaVersion": 1,
  "profile": "reference-r0",
  "source": "reference/kkuk-steering.fragment.html",
  "sourceSha256": "6fdee367e846654846030e4a806e6ba3b0f94a71202f1d8d2ab5534bed69f710",
  "status": "Prototype reproduction values; not a complete commercial configuration",
  "world": {
    "width": 360,
    "height": 430,
    "playerScreenY": 316,
    "unitsPerMeter": 10,
    "fixedStepSeconds": 0.008333333333333333,
    "referenceFrameClampSeconds": 0.08
  },
  "player": {
    "startX": 180,
    "minX": 64,
    "maxX": 296,
    "baseRadius": 24,
    "minRadius": 9,
    "maxRadius": 60,
    "collisionInset": 1,
    "pointerSpeed": 240,
    "keyboardSpeed": 215
  },
  "energy": {
    "chargePerSecond": 0.31,
    "recoverPerSecond": 1.15,
    "recoverRadiusRatio": 0.92,
    "failAt": 1,
    "storageCap": 1.01,
    "warningAbove": 0.75
  },
  "spring": {
    "heldTarget": 9,
    "heldStiffness": 260,
    "heldDamping": 28,
    "releasedTarget": 24,
    "releasedStiffness": 110,
    "releasedDamping": 9,
    "releaseImpulseBase": 38,
    "releaseImpulsePerEnergy": 450
  },
  "ascent": {
    "baseSpeed": 78,
    "increasePerPassedGate": 1.15,
    "maxIncrease": 44,
    "maxSpeed": 122
  },
  "generator": {
    "seed": 9173,
    "lcgMultiplier": 1664525,
    "lcgIncrement": 1013904223,
    "lcgModulus": 4294967296,
    "firstZ": 235,
    "lookAhead": 1100,
    "cleanupBehind": 180,
    "difficultyRampZ": 9000,
    "gapBase": 40,
    "gapDecrease": 9,
    "gapFloor": 30,
    "effectiveMinGap": 31,
    "firstPatternTypes": [
      "short",
      "long",
      "short"
    ],
    "firstCenters": [
      180,
      100,
      260
    ],
    "laterCenters": [
      90,
      180,
      270
    ],
    "patterns": {
      "short": {
        "height": 24,
        "gapBonus": 0,
        "strideBase": 275,
        "strideReduction": 25
      },
      "long": {
        "height": 72,
        "gapBonus": 2,
        "strideBase": 325,
        "strideReduction": 25
      },
      "double": {
        "height": 24,
        "gapBonus": 0,
        "gateOffset": 102,
        "sharedCenter": true,
        "strideBase": 395,
        "strideReduction": 25
      }
    }
  },
  "referenceStepOrder": [
    "input transitions and release impulse",
    "time and distance",
    "horizontal movement",
    "energy",
    "radius integration and clamp",
    "overpressure death",
    "gate collision and current-radius pass checks",
    "cleanup and generation"
  ],
  "releaseChangesRequired": [
    "FIX-01 persistent versioned records",
    "FIX-02 preserve logical hold across pause",
    "FIX-03 cancellation freezes instead of releasing",
    "FIX-04 maximum-radius safe gate completion",
    "FIX-05 records separated by input mode",
    "FIX-06 interruption and backlog policy",
    "FIX-07 multiple seed and connection safety",
    "FIX-08 explicit resume countdown"
  ],
  "notes": [
    "Effective narrowest short/double gap is 31, not 30.",
    "A double block counts as two gates.",
    "L is based on the next block Z at generation time.",
    "Reference seed RNG call order must be preserved.",
    "Production changes in the specification intentionally supersede some R0 behavior."
  ]
});
