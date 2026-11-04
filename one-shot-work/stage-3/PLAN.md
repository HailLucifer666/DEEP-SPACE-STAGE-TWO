# PLAN — Stage 3: full 3D flight (stories 015–017)

Three slices, STRICTLY SEQUENTIAL — no parallelism. 016 consumes 015's probe surface
(`combatState().{pitch, velMag}` + `?pitchProbe=1`) and deletes 015's band scaffold; 017
seats its dressing against 016's finished sphere (`O`/`R_HARD`). Sequencing mirrors the
approved scope line (`one-shot-work/stage-2/PROGRESS.md` L78-79): 015 → 016 → 017.

Per-slice method (carried from stage-2, see PROGRESS.md): story file → ONE
gameplay-programmer subagent → spec-compliance review → code-quality review → orchestrator
re-runs gates → merge --no-ff → flow-check on merged master → tag `good-YYYY-MM-DD-<letter>`.

---

## Slice 1 — story-015: pitch + drift (the keystone)

- **Goal**: the ship gains pitch (R/F + pointer-Y, direct convention, ±72° envelope) and
  drift (`vel` becomes persistent state realigning to the nose, ALIGN_RATE 4.5); `forward()`
  goes 3D and every consumer inherits the vertical component. Riding items: raider
  altitude-follow retune (`RAIDER_ALT_FOLLOW = 1.2/s`, the anti-camp hazard), the three
  XZ-only collision scans go 3D (GDD §5.4: enemies.js L113-114 bolt×player, combat.js
  L239-253 player-bolt×raider, enemies.js L179 ram), controls text in both places, and the
  temporary altitude band as an explicitly-deleted-in-016 scaffold (GDD §3.4).
- **Files touched**: `src/combat.js` (center of mass), `src/enemies.js` (2 scans +
  altitude-follow line), `src/main.js` (PANEL_HTML.CONTROLS only), `tools/index.template.html`
  (hint bar line only), `tools/flow-check.mjs` (pitchProbe block, 22 new asserts),
  `production/qa/evidence/story-015-pitch-drift/`. Zero `src/input.js` changes (mouse.y
  already recorded and unused).
- **Acceptance test**: SPEC.md S15-1…S15-13 red-first via `tools/flow-check.mjs` —
  `?pitchProbe=1` drive (droneProbe pattern); named asserts with GDD §8.1 numbers (Δφ 0.72
  ± 0.05 at R/0.4 s; slip 20-35°; radius 8.5-11.5 u; band ≤ 20.5 / ≤ 13 u/s; elevated-raider
  no-contact 2 s; altitude-follow ≤ 12 u in 3 s); 5 mutation probes recorded; the full
  story-004/005/012/013/014 keep-passing set stays green. Gate: flow-check 76 → 98,
  per-page `CONSOLE []`, restartProbe clean, dep-check PASS.
- **Risk**: architecture R1 (camera up-vector at high pitch — mitigated by the 72° clamp,
  lateral basis ≥ 0.31), R2 (drift vs the throttle model — `C.speed` stays the throttle
  scalar, SPD keeps showing it, `velMag` for the harness; TD-011 regression class guarded by
  the `W holds the nose` assert), R3 (frame-rate independence — drift is persistent state,
  integrate dt-scaled under DT_CLAMP 0.05 with the exp form). Estimate L — the largest
  slice: keystone + drift + camera + probe surface.

## Slice 2 — story-016: spherical arena

- **Goal**: the flat disc boundary becomes a soft sphere centered `O = (0, ARENA_Y, 0)` with
  the SAME numbers (R_SOFT 60 / R_HARD 80) and story-005's bleed feel (floor 3 u/s
  load-bearing, tangential preserved). Riding items: the 015 band scaffold deleted (flagged
  retirement — harness comment + story report, never a quiet edit) and the ONE-line boss
  `dashTarget` shell clamp to r3 ≤ 68 (GDD §5.3). Rim opacity + `#warn` go 3D; boundary
  probe rewrite.
- **Files touched**: `src/combat.js` (bleed/clamp 3D, band deleted, rim opacity, #warn,
  probe rewrite), `src/boss.js` (ONE line in `launchDash`), `tools/flow-check.mjs` (sphere
  asserts; probes 7/7b/8 re-derived r → r3 — flagged; 3 band asserts retired — flagged),
  `production/qa/evidence/story-016-spherical-arena/`.
- **Acceptance test**: SPEC.md S16-1…S16-8 red-first — the hard-clamp assert genuinely reds
  on the 015 build (pitched boost reaches r3 ≈ 88 > 81); boss-dash asserts ride the
  `?bossProbe=1` page; 4 mutation probes (R_HARD 90, floor 0, clamp line removed,
  tangential zeroed); keep-passing: the ENTIRE droneProbe + bossProbe + victory blocks
  (R5/R6 watch) plus the 015 pitchProbe block minus the retired band asserts. Gate:
  flow-check 98 → 103, per-page `CONSOLE []`, restartProbe clean.
- **Risk**: architecture R4 (spherical rewrite — the floor is load-bearing, mutation 2
  proves it in 3D; raider spawn ring 55 maps as today), R5 (boss keep-passing must stay
  green with the clamp line in; any hold-range change re-proves red-first), R6 (raider
  plane decision — resolved by 015's altitude-follow, re-verified in the sphere).
  Estimate M.

## Slice 3 — story-017: world goes 3D

- **Goal**: the sphere reads as a place — combat-only ambient field (~120 instanced rocks in
  a shell 25-75 u from O, group rotation ~0.005 rad/s, no collision) + a faint boundary
  shell visual (additive/transparent/depthWrite:false, max opacity 0.18, 3D proximity
  driver), both on the rim-ring lifecycle (created once in `prepareCombat`, shown in
  combat, hidden in `clearCombat`). **Zero `src/launch.js` changes** — launch phases and
  the lane stream are closed surfaces.
- **Files touched**: `src/combat.js` (or new `src/arena-dressing.js`, programmer's choice
  per GDD §6 — dep-check must stay acyclic if new), `tools/flow-check.mjs` (dressingProbe
  block, 8 new asserts), `production/qa/evidence/story-017-world-3d/`. Explicitly NOT:
  `src/launch.js`, `src/phases.js`, `src/audio.js` (the diff review verifies the
  launch zero-diff).
- **Acceptance test**: SPEC.md S17-1…S17-6 red-first via `?dressingProbe=1` (≥ 100
  instances; shell fill 25-75; lifecycle hidden/re-shown; 10 u clearance over a 10 s varied
  -pitch drive; shell opacity 0 at r3 ≤ 60, > 0 at r3 ≥ 78); 3 mutation probes; keep-passing:
  ALL launch/cruise/transition asserts (S17-4 cruise-untouched), restartProbe=3 clean:true
  with the baseline-growth figure recorded, boot-marks headed re-run. The backdrop
  screenshot + S3X experiential playtest are MANUAL gates collected at stage close
  (013/014 convention). Gate: flow-check 103 → 111, per-page `CONSOLE []`.
- **Risk**: architecture R8 (bloom — a full-screen additive emitter, capped at 0.18 with
  depthWrite:false; do not lean on the DPR ladder), M2 boot budget (procedural instanced
  geometry at `prepareCombat`, no new imports beyond three core), M3 baseline growth
  (expected, recorded). Estimate M.

---

## Stage close (after slice 3)

Independent review (read-only, kee discipline) → smoke record → changelog Stage 3 section →
`one-shot-work/stage-3/GATE.md`. The S3X experiential gate (GDD §8.4), the S17-5 backdrop
screenshot, and the open optional tuning items (ASSUMPTIONS e: boss inner-ring gap = stage-2
review NIT 11; drone-vs-drone separation) are collected at stage close per the full-auto
grant convention. Final tag `good-YYYY-MM-DD-<letter>`; scoreboard line updated in
PROGRESS.md.
