// 자동 생성 파일 — 직접 수정 금지. 원본: config/balance-r0.json + config/balance-r1.overrides.json (npm run sync-config)
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else { root.KKUK = root.KKUK || {}; root.KKUK.balanceR1 = data; }
})(typeof globalThis !== 'undefined' ? globalThis : this, {
  "schemaVersion": 1,
  "profile": "release-r1",
  "source": "reference/kkuk-steering.fragment.html",
  "sourceSha256": "6fdee367e846654846030e4a806e6ba3b0f94a71202f1d8d2ab5534bed69f710",
  "status": "R1 release rules = balance-r0.json + these overrides. Values marked initial are starting points pending device/performance tests.",
  "world": {
    "width": 360,
    "height": 430,
    "playerScreenY": 316,
    "unitsPerMeter": 10,
    "fixedStepSeconds": 0.008333333333333333,
    "referenceFrameClampSeconds": 0.08,
    "maxTicksPerFrame": 12,
    "stallPauseSeconds": 0.25,
    "backlogPauseSeconds": 0.5,
    "resumeCountdownSeconds": 1
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
    "baseSpeed": 74,
    "increasePerPassedGate": 1.4,
    "maxIncrease": 56,
    "maxSpeed": 130,
    "note": "r1.1: slower start (78→74), higher top speed (122→130) reached after 40 gates. Initial values."
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
    "gapBase": 45,
    "gapDecrease": 14,
    "gapFloor": 30,
    "effectiveMinGap": 31,
    "firstPatternTypes": [
      "short",
      "short",
      "long"
    ],
    "firstCenters": [
      180,
      150,
      200
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
    },
    "version": "g2",
    "randomSeedPerRun": true,
    "connection": {
      "forbid": [
        {
          "prev": "*",
          "next": "double",
          "minShift": 180
        },
        {
          "prev": "long",
          "next": "long",
          "minShift": 180
        },
        {
          "prev": "*",
          "next": "*",
          "minShift": 180,
          "untilZ": 1500
        }
      ],
      "evidence": "tests/seed-sweep.js: *>double shift 180 (2026-10-01) and long>long shift 180 (2026-10-06, after the autopilot learned to release on the energy warning) were the course-dependent failure groups. untilZ rule = easy-start design choice."
    },
    "fallback": {
      "pattern": "short",
      "center": 180,
      "recoveryStride": 160
    },
    "patternUnlockZ": {
      "short": 0,
      "long": 600,
      "double": 2000
    },
    "easyStartNote": "r1.1: gap 45→31 over 900 m (was 40→31). Long gaps from 60 m, double from 200 m, full-width shifts from 150 m."
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
  "notes": [
    "Effective narrowest short/double gap is 31, not 30.",
    "A double block counts as two gates.",
    "L is based on the next block Z at generation time.",
    "Reference seed RNG call order must be preserved.",
    "Production changes in the specification intentionally supersede some R0 behavior."
  ],
  "balanceVersion": "r1.1",
  "rules": {
    "passClearance": 60
  },
  "tutorial": {
    "note": "Practice-only rules (spec 12). Not recorded. Physics (spring, energy, collision) identical to R1; only ascent speed and course differ. Initial values.",
    "ascentSpeed": 52,
    "pressReleases": 2,
    "zones": [
      260,
      100
    ],
    "zoneHalfWidth": 24,
    "zoneHoldSeconds": 0.35,
    "gateAhead": 230,
    "gateGap": 44,
    "gateHeight": 24,
    "energyGoal": 0.45,
    "energyCalm": 0.02
  },
  "growth": {
    "note": "Growth mode (roguelite) prototype. Separate records (rulesVersion r1-growth). Abilities overlay R1 numbers per run; spring/collision formulas unchanged. All values initial, untested with players.",
    "rulesTag": "growth",
    "difficulty": {
      "difficultyRampZ": 6000,
      "gapDecrease": 17,
      "gapFloor": 28
    },
    "xp": {
      "first": 3,
      "perLevel": 2,
      "orbValue": 1
    },
    "orbs": {
      "perBlockMax": 2,
      "pairOffset": 36,
      "pickupRadius": 10,
      "lanes": [
        90,
        135,
        180,
        225,
        270
      ]
    },
    "offerCount": 3,
    "abilities": {
      "toughBody": {
        "max": 3,
        "chargeMul": -0.15
      },
      "quickRecover": {
        "max": 3,
        "recoverMul": 0.25
      },
      "cushion": {
        "max": 2,
        "impulseMul": -0.2
      },
      "shockwave": {
        "max": 2,
        "minEnergy": 0.5,
        "gapBonus": 4,
        "reach": 420
      },
      "slideFeet": {
        "max": 3,
        "moveMul": 0.15
      },
      "shield": {
        "max": 5
      },
      "foresight": {
        "max": 1,
        "gates": 2
      },
      "focus": {
        "max": 1,
        "threshold": 0.75,
        "speedMul": 0.8
      },
      "magnet": {
        "max": 3,
        "radiusAdd": 14
      }
    },
    "evolutions": {
      "steelLungs": {
        "requires": [
          "toughBody",
          "quickRecover"
        ],
        "requiresStacks": 2,
        "failAt": 1.2
      },
      "reboundBlast": {
        "requires": [
          "cushion",
          "shockwave"
        ],
        "requiresStacks": 2,
        "minEnergy": 0.5,
        "reach": 420
      }
    },
    "curse": {
      "id": "haste",
      "max": 2,
      "chance": 0.25,
      "speedMul": 0.1,
      "xpMul": 1
    },
    "shieldInvulnerableSeconds": 0.6
  },
  "cosmetics": {
    "note": "Spec 16.2: cosmetic-only skins (no stat/hitbox difference). Earned per completed run: min(max, floor(passed / perPassed)). 2026-10-07: 16 skins, harder to earn (perPassed 3→5, max 20→12, prices raised ~1.6-5x). Prices are initial test values, not market data.",
    "reward": {
      "perPassed": 5,
      "max": 12
    },
    "skins": [
      {
        "id": "base",
        "price": 0
      },
      {
        "id": "slime",
        "price": 50
      },
      {
        "id": "orange",
        "price": 80
      },
      {
        "id": "watermelon",
        "price": 120
      },
      {
        "id": "strawberry",
        "price": 160
      },
      {
        "id": "puffer",
        "price": 200
      },
      {
        "id": "bee",
        "price": 250
      },
      {
        "id": "panda",
        "price": 300
      },
      {
        "id": "fur",
        "price": 360
      },
      {
        "id": "donut",
        "price": 420
      },
      {
        "id": "snow",
        "price": 500
      },
      {
        "id": "moon",
        "price": 600
      },
      {
        "id": "glass",
        "price": 720
      },
      {
        "id": "lava",
        "price": 860
      },
      {
        "id": "galaxy",
        "price": 1050
      },
      {
        "id": "gold",
        "price": 1300
      }
    ]
  },
  "feats": {
    "note": "Feedback-only feats (no score effect). nearMissMargin: clearance to wall in logical units when a gate is passed. Autopilot sample: 1.4% of passes under 3.0 (2026-10-06); humans expected higher. Initial values.",
    "nearMissMargin": 3,
    "riskyEnergy": 0.85,
    "riskySurviveSeconds": 1
  },
  "missions": {
    "note": "3 active missions; completing one grants stars and replaces it. Tier rises per completion of the same mission. Initial values.",
    "activeCount": 3,
    "pool": [
      {
        "id": "nearMiss",
        "kind": "sum",
        "stat": "nearMiss",
        "goals": [
          2,
          5,
          10
        ],
        "rewards": [
          6,
          10,
          15
        ]
      },
      {
        "id": "height",
        "kind": "max",
        "stat": "height",
        "goals": [
          80,
          150,
          250
        ],
        "rewards": [
          5,
          9,
          14
        ]
      },
      {
        "id": "gates",
        "kind": "sum",
        "stat": "passed",
        "goals": [
          30,
          80,
          160
        ],
        "rewards": [
          5,
          9,
          14
        ]
      },
      {
        "id": "double",
        "kind": "sum",
        "stat": "doublePassed",
        "goals": [
          2,
          5,
          10
        ],
        "rewards": [
          5,
          9,
          14
        ]
      },
      {
        "id": "long",
        "kind": "sum",
        "stat": "longPassed",
        "goals": [
          3,
          8,
          15
        ],
        "rewards": [
          5,
          9,
          14
        ]
      },
      {
        "id": "risky",
        "kind": "sum",
        "stat": "riskyRelease",
        "goals": [
          1,
          3,
          6
        ],
        "rewards": [
          6,
          10,
          15
        ]
      },
      {
        "id": "growthLevel",
        "kind": "max",
        "stat": "growthLevel",
        "goals": [
          3,
          5,
          7
        ],
        "rewards": [
          6,
          10,
          15
        ]
      },
      {
        "id": "runs",
        "kind": "sum",
        "stat": "runs",
        "goals": [
          3,
          8,
          15
        ],
        "rewards": [
          4,
          7,
          10
        ]
      }
    ]
  },
  "daily": {
    "note": "Daily challenge: course seed from local date (FNV-1a of YYYY-MM-DD). Separate daily best (not mixed with challenge records). First finished run of the day grants a bonus. Ghost = input replay of today's best.",
    "firstRunBonus": 5
  }
});
