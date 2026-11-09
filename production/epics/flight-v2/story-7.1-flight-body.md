# story-7.1 — flight body: 6DOF quaternion + camera v2

**Two-line restatement:** replace the yaw/pitch-clamp/bank pose with a quaternion
orientation body (`src/flight.js`) and a ship-space spring-arm camera with damped roll +
speed FOV — the horizon stops being glued level and loops become possible. Aim geometry
is preserved by construction (roll never changes the nose direction).

**Size:** M (~240 lines net). **Branch:** `s7-1-flight-body`.
**Spec:** `one-shot-work/STAGE-7-FLIGHT-V2.md` §3 (the code there is normative).

## ALLOWED files
`src/flight.js` (NEW) · `src/combat.js` · `src/weapons.js` (fan basis ONLY) ·
`src/probes.js` + `src/probes-flight.js` (sanctioned rewrites) · `tools/flow-check.mjs`
(sanctioned rewrites) · `tools/dep-check.mjs` (leaf rule) · `tools/index.template.html` +
`src/hud.js` (controls text: Q/E roll in BOTH places — the forced rule).

FORBIDDEN: `enemies.js`, `boss.js`, `drone.js`, `powerups.js`, `audio.js`, `main.js`,
`launch.js`, `phases.js`, `store.js`, `aim-assist.js` logic (header comment note only).

## Implementation order (each step keeps the build green unless stated)

1. **flight.js** exactly per spec §3.1 (consts, orientTick, forward/shipUp/shipRight/quat,
   resetOrientation). dep-check: acyclic, leaf.
2. **combat.js seam:** `initFlight({ C, clamp })` at module scope (the initWeapons pattern —
   live C reference, call-time reads). In `steer()`: keep the input mapping verbatim
   (deadzones, 1.25× clamp, pointer NDC, W/S throttle) but replace the `C.heading +=
   …` / `C.pitch = clamp(…)` integration with `cmd = { yaw: turn, pitch: pitchCmd,
   roll: rollCmd }` where `rollCmd = (keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0)`.
   Then: `orientTick(dt, cmd)`; DERIVED reads per spec §3.3 (`C.heading`/`C.pitch` from the
   nose vector — do NOT delete the fields, the harness reads them).
3. **Pose write:** `C.pose.quaternion.copy(quat())` replaces the three euler writes;
   `C.tilt` (rotation.x = π/2) untouched; `C.bank` keeps its existing lean math (cosmetic).
4. **Camera** per spec §3.4: camTarget = pos + shipUp·3.4 − forward·(7.5 + |vel|·0.22);
   position lerp k=5; quaternion slerp to `camQuatTarget` k=6; FOV change-gated
   (`FOV_BASE + FOV_SPEED_GAIN·smooth(|vel|/MAX_SPEED·boostFactor)` — smooth = the C.flow
   exp pattern; only call updateProjectionMatrix when the rounded FOV changes).
5. **weapons.js fan basis:** WORLD_UP → ship-up through the seam (spec §3.2). The charged
   path and everything else in weapons.js is VERBATIM.
6. **Lifecycle:** `enterCombat`: `resetOrientation()` beside the `C.pos.set(0, ARENA_Y, 0)`
   reset; `clearCombat`: nothing new (orientation is per-fight state reset on entry);
   restartProbe must stay `clean:true`.
7. **Probes:** pitchProbe's `C.pitch = 0` writes become a probe seam call
   (`resetOrientation()`-equivalent or a flight-exposed `setPitchNdcForProbe`) — probes
   never write flight state directly. Sanctioned, dated.
8. **Controls text:** template hint bar + hud.js CONTROLS panel gain `Q/E ROLL`.

## RED-FIRST asserts (written BEFORE the flight.js change, seen red on the previous tag)

In `flightProbe` (extends 7.0's drive) + flow-check:
- F1 loop: hold R 3.2 s from level → nose passes 90° up and completes ≥ 300° of pitch travel
  (old build: clamped at 72° → RED).
- F2 roll: hold E 1 s → ship-up vs camera-up twist ≥ 0.5 rad while nose-forward self-dot
  > 0.99 (old build: no roll axis → RED).
- F3 yaw rate: derived heading integrates 1.75 rad/s ± 0.02 (old build: 2.2 rad/s → RED —
  rate change is part of this story; record the knob move in the report, it is a FEEL const
  in FLIGHT, not a balance knob).
- F4 latency: ω reaches 63% of commanded ≤ 0.12 s (old: instant snap → RED by measurement).
- F7 camera lag: camera-up twist trails ship-up twist; 63% in 0.15–0.4 s; no frame with
  degenerate basis (old: world-up cam → RED).
- F8 FOV: fov(Boost) − fov(rest) ≥ 8 (old: 0 → RED).
- Fan-at-roll: at roll 90°, SPREAD fan bolts stay ±6° ± 0.5° from nose (new case; the
  WORLD_UP mutation flips it red after implementation — record that mutation too).

## Mutations to record (each → named assert RED, output saved)
(a) `q.multiply(dq)` → `q.premultiply(dq)` → F1/F2 RED (world-frame integration).
(b) fan basis back to WORLD_UP → fan-at-roll RED.
(c) `CAM_ROLL_FOLLOW` 0.4 → 0 → F7 RED.
(d) derived heading dropped (stale C.heading) → story-004 turn assert RED (proves §3.3).

## Sanctioned rewrites (dated in-file, exact-coverage argument required)
- pitchProbe: PITCH_MAX clamp assert → the F1 loop assert (same window, new semantics).
- pitchProbe: `viewDirFromUp` bounds → the F7 basis-guard assert.
- flow-check: any assert reading `p.rotation` euler pose → reads `C.pose.quaternion`.
- Controls text (both places).

## KEEP-PASSING (run all, must stay green)
story-004 throttle/turn block · scriptedKill · droneProbe · bossProbe (all park/dash/pole
asserts) · charge/powerup/balance/fire probes · victory/gameover cards · restartProbe
clean · pipper/bracket/lock asserts · `CONSOLE []` on every page.

## Risks
- Sign errors: the spec §3.1 derivation is normative; a red sign assert means fix the
  constant sign, never loosen the assert.
- C.tmp clobber: flight.js uses ONLY its own scratch (spec S-discard rule); weapons.js
  seam hands ship-up as a fresh vector per call.
- Boot cost: flight.js is pure math, no allocation at prepare — boot-marks unchanged.
