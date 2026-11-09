# story-7.0 — feel baseline + flightProbe scaffold (Stage 7 opener)

**Two-line restatement:** build the `?flightProbe=1` deterministic drive measuring the OLD
flight model, and record the pre-Stage-7 baseline — so 7.1's new asserts are provably red
for the right reason and nothing about "before" is folklore.

**Size:** S. **Branch:** `s7-0-feel-baseline`.

## ALLOWED files
- `src/probes-flight.js` (NEW — the drive)
- `src/probes.js` (one re-export line + one reset call, the story-018 split pattern)
- `src/combat.js` (ONE line: the probe-tick call in tickCombat, after fireProbeTick)
- `tools/dep-check.mjs` (only if the leaf rule needs the new file registered)

FORBIDDEN: everything else. Zero gameplay change. flow-check MUST stay byte-identical.

## What the drive measures (stages, droneProbe pattern)

Query flag `?flightProbe=1`; report on `window.__stage2.flightProbe` + `api.report` parity;
`flightProbeLive` as the screenshot hook; state bag reset in `resetProbes()`.

1. **pitch-envelope stage** — hold `R` 1.5 s, sample max `C.pitch`. EXPECT (old model):
   clamps at `PITCH_MAX` 1.2566 and STAYS. This assert is written here and is EXPECTED TO
   GO RED in 7.1 (the loop replaces the clamp) — that is its purpose: an honest-red witness.
2. **no-roll stage** — sample `C.pose` up-vector vs ship-up: EXPECT roll ≡ bank-cosmetic
   only (|twist| < 0.05 rad beyond bank). Goes red in 7.1 (roll becomes real).
3. **alignment stage** — cruise + 1 s full yaw: slip deg + velMag (the story-015 grammar,
   copied, not imported — probes never import combat state beyond `env`).
4. **fov stage** — sample `C.camera.fov` at rest and at boost: EXPECT constant 62 both.
   Goes red in 7.1 (F8).
5. **camera-lag stage** — sample camera-up vs ship-up twist over a full-yaw sweep.
6. **clamp stage** — boost radially out: EXPECT hard stop at r3 ≤ 81. Goes red in 7.3 (F9).

Report shape: `{ pitchMax, rollTwist, slip, velMag, fovRest, fovBoost, camLag, maxR3 }`.

## Acceptance
- Probe runs clean on the current build: every stage reports; the three old-model asserts
  (1, 2, 4, 6) PASS on this build and are documented as the 7.1/7.3 red targets.
- Battery green, `CONSOLE []`, restartProbe clean (the probe adds no allocations).
- Baseline recorded in the report: flow-check assert count, build size, boot-marks, 3
  screenshots (`build/shots/s7-0-*.png`).

## Red-first note
This story's NEW asserts are green-on-old by design (they measure the old model). The
red-first debt transfers to 7.1/7.3, where these same asserts flip red on the pre-change
build — record those runs there. This is the pitchProbe precedent inverted and it must be
stated in the 7.1/7.3 cards (it is).
