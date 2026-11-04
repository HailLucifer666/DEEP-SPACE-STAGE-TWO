# Story 017: world goes 3D — the sphere reads as a place

> **Epic**: combat-feel-fix (Stage 3 — full 3D flight)
> **Status**: Pending
> **Layer**: Visual/Feel
> **Type**: Visual
> **Estimate**: M
> **Manifest Version**: N/A (minimal)
> **Last Updated**: 2026-11-05

## Goal

Fill the combat world with volumetric dressing so the sphere reads as a place rather than a
math bound. Two items, both combat-side only:

1. **Ambient combat field** — a combat-only InstancedMesh (~120 rocks) seeded in a spherical
   shell 25-75 u from O, created once in `prepareCombat`, shown in combat, hidden in
   `clearCombat` — the rim ring's exact lifecycle pattern (combat.js L533-543, L701). The
   group rotates as a whole slowly (~0.005 rad/s); no per-instance updates; no collision
   (the lane stream already has none).
2. **Boundary shell visual** — a faint additive sphere at `R_HARD` (same material family as
   the rim ring and the rift planes: additive/transparent/`depthWrite:false`), opacity
   driven by 3D proximity exactly like the ring's driver (L213), max 0.18. Reads under the
   existing bloom chain (main.js L349-359, threshold 0.85) without new post work.

**Zero `src/launch.js` changes.** The launch set-piece is untouched — the ship never leaves
the lane in pad/countdown/ignition/ascent (launch.js L5-7, L116-123) and those phases are
closed surfaces. The lane-stream rock bands serve the cruise, so they are NOT redistributed
— that would rewrite closed launch staging (GDD §3.6). Scope reading of "world goes 3D":
the combat DRESSING becomes volumetric.

Design source: `design/gdd/full-3d-flight.md` §3.6, §7 (shell opacity, field count knobs).

## Scope

- `src/combat.js` (or a small new `src/arena-dressing.js` if the programmer prefers — GDD
  §6 allows either; if a new module: dep-check must stay acyclic, nothing imports main.js):
  - Ambient InstancedMesh: ~120 instances (`ambient field count` knob, range 80-200), seeded
    in a spherical shell 25-75 u from O, static within the slowly rotating group; created
    ONCE in `prepareCombat` (baseline membership — restarts allocate nothing new), shown in
    `enterCombat`, hidden in `clearCombat`.
  - Shell visual: sphere mesh at `R_HARD`, additive/transparent/`depthWrite:false` (the rim
    ring / rift-plane material grammar, already proven under bloom), opacity 0 at r3 ≤ 60
    rising to max 0.18 (`shell visual max opacity` knob, range 0.1-0.3) at r3 ≥ 78 — the
    ring-and-#warn carry the warning, the shell confirms.
  - A `?dressingProbe=1` query flag reporting `{ ambientCount, shellFill, lifecycle,
    clearance, shell }` on `window.__stage2` (droneProbe/pitchProbe pattern).
- `tools/flow-check.mjs`: the dressingProbe assert block (8 new asserts — test plan below).

## Non-goals

- **Launch phases untouched** — `src/launch.js` zero-diff (the story's file list proves it
  by absence; the diff review checks it explicitly). Pad/countdown/ignition/ascent and the
  lane stream's `streamTick` groups and seeding are closed surfaces.
- Backdrops stay where they are: planet (−95, 26, 260) and black hole (48, 10, 950) sit
  outside the sphere and read as deep-space backdrop (launch.js L168-177); the sphere is a
  flight bound, not a visible wall.
- Stars untouched — already a full-sphere distribution, "there is no horizon any more"
  (launch.js L126-137); correct at any altitude, zero change.
- Edge pips untouched — already project full-3D (combat.js L648-672); they simply start being
  useful above the plane.
- No engine-pitch audio, no new post/bloom work, no shadows/SSAO.
- No collision for ambient rocks (the lane stream already has none — the clearance assert
  proves the field never crowds the ship instead).
- `DRONE_SHELL_CLAMP` stays off (story-016's accepted behavior stands).

## Implementation notes

- **Baseline membership is the load-bearing constraint** (architecture §5.3): any Stage 3
  geometry joins the BASELINE — created once in `prepareCombat` like the boss meshes, never
  per-entry allocation. `clearCombat` hides (does not dispose) both the field and the shell;
  `enterCombat` re-shows them. restartProbe=3 must read `clean:true`.
- **Bloom budget (R8)**: a large additive sphere shell is a full-screen emitter — keep max
  opacity at 0.18 (≤ the 0.85 threshold contribution) and `depthWrite:false`, or it washes
  the frame and interacts with the DPR ladder (which drops bloom first, loop.js L109-115).
  TD-013's degrade latch is a safety net, not a design target.
- **Boot budget (must-not-break 2)**: new scene objects are created at `prepareCombat`,
  never per boot phase; the instanced geometry is generated procedurally (no GLB, no build
  token), so module-eval cost and the MODULE→TITLE gate are untouched.
- **Group rotation** at ~0.005 rad/s is a single transform on the group — no per-instance
  matrix updates per frame; the field is static dressing, not gameplay geometry.
- **Seeding determinism**: seed with the combat RNG in a fixed range so probe asserts on
  shell fill (min ≥ 25, max ≤ 75) are stable across runs.

## Acceptance criteria

- [ ] Combat-only ambient field present: probe reports ≥ 100 ambient rock instances whose
      positions fill the shell (min radial distance from O ≥ 25, max ≤ 75, sampled); the
      group is hidden on `clearCombat` and re-shown on `enterCombat` (rim-ring lifecycle).
- [ ] The field never collides or obscures: no ambient instance within 10 u of the ship over
      a 10 s probe drive at varied pitch (clearance analog of the lane stream's 14 u,
      launch.js L141-142).
- [ ] Shell visual: a sphere mesh at `R_HARD` exists in combat only, additive/transparent,
      opacity > 0 at r3 ≥ 78 and == 0 at r3 ≤ 60.
- [ ] Cruise untouched: all existing pad/countdown/ignition/ascent/transition flow-check
      asserts keep passing unchanged; `streamTick` groups and seeding unmodified (diff
      review: no `src/launch.js` change in the story's file list).
- [ ] Backdrops intact: planet and black hole remain visible from a high-altitude vantage
      (screenshot assert, manual player gate — collected at stage close per the full-auto
      grant convention used by stories 013/014).
- [ ] Experiential (playtest, 3+ runs, collected at stage close per GDD §8.4): a player can
      find and dodge the boss charge by climbing; rim approach is noticed BEFORE the clamp
      (warn + ring + shell all seen); pitch never produces reported disorientation at 60°+;
      drift reads as weight, not lag.
- [ ] Full flow-check green, per-page `CONSOLE []`; restartProbe=3 `clean:true` (the field
      and shell in the baseline); boot-marks headed MODULE→TITLE inside the documented band.

## Test plan (red-first)

Harness: `tools/flow-check.mjs` — `ok(name, cond, extra)`, `J()`/`poll()` on
`window.__stage2`; the dressingProbe block runs on its own page navigate
(`?debug=1&goto=combat&dressingProbe=1`) with the guarded, thrown-tolerant poll pattern
( droneProbe/bossProbe/pitchProbe parity) and its own per-page `CONSOLE []` assert.

- **Red-on-016 record (before any product change)**: run the harness with the dressingProbe
  block against the story-016 close build. All probe-dependent asserts FAIL for the stated
  reason: `?dressingProbe=1` is unread so `window.__stage2.dressingProbe` never appears and
  the deadline expires (each probe assert records its red from the null probe);
  `ambientCount`/`shell` fields do not exist. Keep-passing asserts green by design. Record
  as `flow-red-016.txt`, reason inline in the harness comment.
- **New asserts (8) — named, expected numbers from GDD §8.3:**
  1. `dressingProbe reports (story-017)` — probe object present.
  2. `ambient field present (≥ 100 instances)` — probe ambientCount ≥ 100 (design 120).
  3. `field fills the shell (25-75 u)` — sampled min radial ≥ 25, max ≤ 75.
  4. `field lifecycle: hidden on clearCombat, re-shown on enterCombat` — visibility flag
     flips with the phase (rim-ring lifecycle, visible:false ↔ true).
  5. `field never crowds the ship` — no instance within 10 u of the ship over a 10 s drive
     at varied pitch.
  6. `shell visual exists in combat only` — additive/transparent/depthWrite:false, hidden
     with the combat lifecycle.
  7. `shell opacity tracks 3D proximity` — > 0 at r3 ≥ 78, == 0 at r3 ≤ 60 (the L213
     driver pattern, 3D).
  8. `CONSOLE [] (dressingProbe page)`.
  The backdrop screenshot and the experiential playtest (3+ runs) are MANUAL gates recorded
  in the programmer report at stage close — they are deliberately NOT machine asserts
  (stories 013/014 convention).
- **Mutation probes** (mutation + date in the test file; mutate → `npm run build` → full
  flow-check → restore; verify the mutation applied by reading its red output before
  recording):
  1. `ambient field count 120 → 30` (2026-11-05) → RED assert 2 (30 < 100). Adjacent
     keep-passing: assert 3 stays green (the survivors still fill the shell band).
  2. `hide-on-clear removed` (2026-11-05) → RED assert 4 (field stays visible after
     clearCombat). Adjacent keep-passing: restartProbe stays green — hiding is visual
     lifecycle, not pool drain; that separation is exactly what the mutation demonstrates.
  3. `shell opacity driver 2D → swapped to 3D-off` (2026-11-05) → RED assert 7 (opacity 0
     at r3 ≥ 78). Adjacent keep-passing: assert 6 stays green (the mesh exists; only its
     driver broke).
- **Keep-passing (existing asserts, unchanged)**: ALL launch/cruise/transition asserts (the
  cruise-untouched criterion — the harness walks the full launch chain every run), the
  story-004/005 movement+boundary blocks, the sphere asserts (016), the pitchProbe block
  (015), droneProbe (012), bossProbe (013), victory (014), `restartProbe=3 clean:true`, and
  the per-page `CONSOLE []` asserts. Boot-marks headed runs outside flow-check — re-run it
  and record the figure in the report.
- **kee discipline**: No merge without the red-first record; a mutation that silently fails
  looks exactly like a guard that works — diff the mutation.

## Files touched (pre-authorized — exactly the GDD §6 list)

- `src/combat.js` (or `src/arena-dressing.js`, new, programmer's choice) — ambient field +
  shell visual + dressingProbe, rim-ring lifecycle pattern.
- `tools/flow-check.mjs` — dressingProbe block (8 asserts) + red/mutation records inline.
- `production/qa/evidence/story-017-world-3d/` — report + red/mutation outputs +
  screenshots (incl. the backdrop vantage shot for the stage-close player gate).
- **Explicitly NOT touched**: `src/launch.js`, `src/phases.js`, `src/audio.js` — the diff
  review verifies the launch zero-diff.

## Risks

- **R8 (architecture) — bloom composer vs the new geometry**: the shell is a full-screen
  additive emitter; capped at 0.18 opacity with `depthWrite:false` (three past bloom
  saturation fixes live in launch.js — same lesson, combat side). Watch the frame on the
  headed run; the DPR ladder drops bloom first — do not lean on it.
- **Boot/module budget (must-not-break 2)**: procedural instanced geometry at
  `prepareCombat` — no new imports beyond `three` core (InstancedMesh), no GLB token, so
  module-eval and MODULE→TITLE stay inside the documented band. Verify with boot-marks.
- **restartProbe baseline growth**: the field and shell join the baseline — entities count
  rises from the story-016 close number; that is EXPECTED and recorded in the report (the
  clean:true comparison is N≥2 runs of the SAME build, not cross-build).
- **Seeding flake**: shell-fill sampling uses fixed ranges; if the assert proves flaky,
  widen the sample count, not the bounds.

## Unlocks

- Stage-3 close: independent review, smoke record, changelog, GATE.md (the experiential
  §8.4 gate and the backdrop screenshot land there, per the 013/014 grant convention).
- Stage 4 planning starts from a world that reads as a volume (per-wave tables story-019
  and any future combat dressing build on this field's lifecycle).
