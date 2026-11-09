# story-7.2 — inertia, flight-assist toggle (Z), strafe

**Two-line restatement:** make `C.vel` the real state — FA-on keeps the forgiving
nose-chasing drift law and adds ship-space strafe thrusters; `Z` toggles FA-off where
momentum is pure and W/S become thrust/brake along the nose. FA-on is the default (D-7.1).

**Size:** M (~120 lines net). **Branch:** `s7-2-inertia-fa`.
**Spec:** `one-shot-work/STAGE-7-FLIGHT-V2.md` §4 story 7.2.

## ALLOWED files
`src/flight.js` · `src/combat.js` · `src/hud.js` + `tools/index.template.html` (controls
text + a tiny FA state chip, honesty law: harness-readable) · `src/probes-flight.js` ·
`tools/flow-check.mjs` (new asserts only).

FORBIDDEN: everything else. NO balance numbers change (ACCEL/BRAKE/MAX_SPEED/BOOST_MULT
stay exactly as shipped).

## Model (normative)

- **FA-on (default):** the story-015 nose channel is KEPT verbatim —
  `vel.lerp(forward·speed, 1−exp(−FA_DAMP·dt))`. Strafe adds a lateral channel:
  `vel += shipRight·strafeX·STRAFE_A·dt + shipUp·strafeY·STRAFE_A·dt`, damped at 2.5/s
  (exp form, dt-scaled). Strafe keys: `A/D` stay TURN (unchanged); strafe rides
  `C`/`V` (lateral) — final binding decided on the card's one open key-map check against
  the existing set {W S A D R F Space Shift P Esc M T Q E}; if C/V collide with anything,
  use `Z`-plane alternates and record the pick. NO pointer strafe.
- **FA-off (`Z`):** skip the lerp. W applies `ACCEL` along the nose to `vel` directly;
  S applies `BRAKE` against `vel`'s nose-component; `C.speed` tracks |vel| (derived) so
  the SPD/HUD asserts keep one meaning; |vel| hard-capped at the boost ceiling.
- **Toggle:** `Z` in combat flips `C.flightAssist`; resets to `true` in `enterCombat`;
  persists NOTHING (per-fight choice, like boost). HUD chip `FA ON`/`FA OFF` (change-gated).

## RED-FIRST asserts
- F5: FA-off, reach cruise, release all keys 1.0 s → |Δvel| ≤ 2% (old build: lerp still
  active → RED).
- F6: FA-on, steady full-yaw slip ≤ 30° and < 8° within 0.8 s of release (keep-passing
  from story-015 — re-proven, not rewritten).
- Strafe: 1 s `C`-hold at cruise → lateral velocity component ≥ 5 u/s with heading AND
  nose-channel speed unchanged ±5%.
- Toggle: `Z` flips the chip + `combatState().flightAssist`; re-entry resets to ON.

## Mutations
(a) FA-off branch deleted → F5 RED. (b) strafe damping removed → strafe assert RED
(unbounded lateral growth). (c) enterCombat reset dropped → toggle-reset assert RED.

## KEEP-PASSING
story-004 block (throttle model unchanged in FA-on) · velocity-trail camera asserts ·
pitchProbe slip/drift-circle (FA-on identical) · all probes · restartProbe clean.
