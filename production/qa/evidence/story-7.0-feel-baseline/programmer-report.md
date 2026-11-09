# story-7.0 — feel baseline + flightProbe scaffold — programmer report

**Date:** 2026-11-09 · **Branch:** `s7-0-feel-baseline` · **Status:** CLOSED (pending owner merge/tag go — executed per spec §7.5)

## What was built

`src/probes-flight.js` (NEW, ~180 lines) — the deterministic `?flightProbe=1` walk measuring
the OLD flight model (droneProbe/one-walk-per-file pattern). Seven stages: settle →
pitch-envelope → no-roll → alignment A/B → fov → camera-lag → clamp. Report shape exactly
per card: `{ pitchMax, rollTwist, slip, velMag, fovRest, fovBoost, camLag, maxR3 }` on
`window.__stage2.flightProbe` + `api.report` parity (lands `lastReport`); `flightProbeLive`
screenshot hook; `resetFlightProbe()` wired into `resetProbes()` (stale-delete hygiene).

Wiring: `src/probes.js` (import + re-export + reset call — the story-018 split pattern),
`src/combat.js` (one tick line after `fireProbeTick` + the one name added to the existing
probes import line — card-necessary alongside the "one line", stage-6 W1 precedent).

## The baseline (OLD model, measured 2026-11-09, headless Edge 157.0.4341.42)

```json
{"flightProbe":{"pitchMax":1.2566,"rollTwist":0,"slip":25.06,"velMag":15.344,
"fovRest":62,"fovBoost":62,"camLag":0.7976,"maxR3":80}}
```

| Field | Measured | OLD-model reading | Red target |
|---|---|---|---|
| pitchMax | 1.2566 | clamps at PITCH_MAX and STAYS | **7.1** (loop replaces clamp) |
| rollTwist | 0.0000 | roll ≡ bank-cosmetic only | **7.1** (roll becomes real) |
| slip / velMag | 25.06° / 15.344 | story-015 drift grammar intact | keep-passing (F6) |
| fovRest / fovBoost | 62 / 62 | FOV constant | **7.1** (F8 speed FOV) |
| camLag | 0.7976 rad | camera never rolls with the ship | **7.1** (F7 roll-follow) |
| maxR3 | 80 | hard stop at R_HARD (≤ 81) | **7.3** (F9 open space, D-7.2) |

All four old-model asserts (stages 1, 2, 4, 6) **PASS on this build** — green-on-old by
design. The red-first debt transfers to 7.1/7.3: those cards must run `?flightProbe=1` on
the PRE-change build and record these same fields flipping red (card note present).

## Red proof (n/a by design — documented)

This story's NEW asserts are green-on-old (the pitchProbe precedent inverted, per card).
The honest-red witness runs are OWED by 7.1 (pitchMax, rollTwist, fovBoost, camLag) and
7.3 (maxR3) on their pre-change builds.

## GREEN proof (raw)

- `npm run build` → `index.html mode=bundle 4.70 MB` (esbuild + GLB inline, 277 ms rebuild)
- `node tools/dep-check.mjs` → `[dep-check] PASS — acyclic, structural rules hold` (main.js 271/500)
- Smoke `cdp-check ?debug=1&goto=combat` 62000 → `rocket: glb`, `CONSOLE []`, combat reached
  (3 runs; see "machine notes" — idle ship dies to raider fire on warm boots, phase reads
  gameover after ~17 s of unsteered combat; death by bolt/ram = normal gameplay, zero errors)
- Probe run `?flightProbe=1` → report above, `CONSOLE []`, `phase: combat` at read
- `flow-check` → run 1: `254 passed, 1 failed` (TD-017 OVERDRIVE-interval stall class,
  frameDt 0.0262, shots 8 inside band [8,12] — the documented flake; bounds untouched) →
  idle-machine rerun per §9: **`FLOW-CHECK PASS — 255 passed, 0 failed`** (flow-green-final.txt)
- `boot-marks headless` → MODULE→TITLE 697 ms, `CONSOLE []`; `headed` → 193 ms (RTX 3060), `CONSOLE []`
- restartProbe clean: flow-check's restart walks (death→gameover→SKIP→combat re-entry) passed
  with `resetFlightProbe()` in the resetProbes path

## Screenshots (the human is the eyes)

- `build/shots/s7-0-baseline-early.png` (≈ pitch/roll stages)
- `build/shots/s7-0-baseline-mid.png` (≈ fov/camera stages)
- `build/shots/s7-0-baseline-clamp.png` (≈ clamp stage / post-report)
Copies in this evidence dir. No visual claim is made about them.

## Machine notes (found-but-not-fixed, backlog)

- B-NEW-1: tools' pinned Edge path `EdgeCore\156.0.4314.58` is stale (Edge auto-updated to
  157.0.4341.42) — every harness run needs `EDGE` env override. Owner call: update the
  defaults in tools/*.mjs (a tooling chore, not a story file).
- B-NEW-2: warm-boot idle smokes read `phase: gameover` (unsteered ship dies ~17 s game
  time under the headless stall's game-time race). The 62000 ms smoke expectation may need
  a documented footnote or a shorter read; owner call.

## WHAT THIS DOES NOT COVER

- No gameplay/balance change (NO-BALANCE law respected; flow-check byte-identical).
- Headed flow-check / stranger playtest not run (W7 business).
- The probe's 7.1-facing bounds (F1–F8 numbers) are NOT asserted here — 7.1 writes them.

## FOUND-BUT-NOT-FIXED (BACKLOG lines)

- B-NEW-1, B-NEW-2 above.
- Pre-existing untracked litter (.zcode/plans, build/.edge-profile-boot-*) untouched (TD-08 class).
