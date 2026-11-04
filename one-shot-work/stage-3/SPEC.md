# SPEC — Stage 3: full 3D flight (stories 015–017)

Skill: one-shot | Rigor: LEAN | Output type: game | Pipeline: CCGS (story file → ONE gameplay-programmer subagent → reviews → gates → merge per story) + kee discipline inside each story.

**Problem.** The combat ship is a turret with a thruster: it commands throttle and yaw on a
flat plane at ARENA_Y = 18 and flies exactly where the nose points (zero inertia). Stage 3
adds pitch (a second commanded rotation axis) and drift (velocity realigns toward the nose
instead of snapping to it), replaces the flat disc boundary with a soft spherical arena
using story-005's bleed feel, and fills the sphere with volumetric dressing. Design source
of record: `design/gdd/full-3d-flight.md` (no redesign — implementation only). Architecture
constraints: `docs/architecture.md` (risk register R1-R8, harness strategy, §5
must-not-break list).

**In scope.** Three stories, strictly sequential, each its own branch, evidence and merge:
1. story-015 pitch + drift (keystone `forward()` 3D, ±72° envelope, ALIGN_RATE 4.5,
   chase-cam unpin, raider altitude-follow + 3D collision scans, temporary altitude band)
2. story-016 spherical arena (O = (0, 18, 0), R_SOFT 60 / R_HARD 80, band scaffold deleted,
   boss dashTarget shell clamp — one line)
3. story-017 world goes 3D (ambient field ~120 instanced rocks, shell visual, rim-ring
   lifecycle; zero src/launch.js changes)

**Out of scope.** Roll control, loops, strafing, 6-DOF (anti-fantasy, GDD §2); SPD semantic
flip (player decision, ASSUMPTIONS c); engine-pitch audio; DRONE_SHELL_CLAMP (stays off
unless playtesting objects); boss inner-ring gap + drone-vs-drone separation tuning (open
optional items riding Stage 3 balance — ASSUMPTIONS e); launch phases (closed).

**Acceptance criteria.** The numbered criteria below are copied from GDD §8 (the contract);
every one must be [x] or explicitly DEFERRED with a reason before story-done closes it.
Machine-checkable items run against `tools/flow-check.mjs` (`ok(name, cond, extra)`,
`J()`/`poll()` on `window.__stage2`); experiential items gate at stage close (stories
013/014 full-auto convention).

## S15 — story-015: pitch + drift (GDD §8.1)

- S15-1. `?pitchProbe=1` reports `pitchProbe` on `window.__stage2` (droneProbe parity);
  `combatState()` exposes `pitch` and `velMag`.
- S15-2. Holding R for 0.4 s at zero throttle changes pitch by 0.72 rad ± 0.05; heading
  change |Δh| < 0.02 (axes independent).
- S15-3. Pointer at NDC y = +0.8, no keys → pitch increases ≥ 0.5 rad in 1.0 s (DIRECT:
  up = nose up); NDC −0.8 mirrors negative; pointer at |y| ≤ 0.08 → |Δpitch| < 0.02 over
  1.0 s (deadzone).
- S15-4. Sustained R for 1.5 s → pitch == PITCH_MAX ± 2° and never exceeds it; F mirrors.
- S15-5. Drift: after a 1.0 s full yaw command at cruise (speed 17 ± 1), the angle between
  forward3D and vel is 20°-35° (slip present), and `velMag` ≥ 0.9 · speed.
- S15-6. Drift recovery: 0.8 s after releasing the turn command, the slip angle is < 8°.
- S15-7. Sustained full-turn circle at cruise traces radius 8.5-11.5 u (flat baseline 7.7),
  sampled from `combatState().pos` over one full revolution.
- S15-8. Keep-passing: turn-in-place displacement < 3 u; cruise-hold ± 2 u/s; S brakes ≤ 3
  u/s; boost expiry bleed ≤ 25 u/s²; pointer-leave stops steering (the story-004 set).
- S15-9. Bolt fired at pitch +45° ± 5° rises: bolt y increases > 5 u over 0.5 s while
  xz-speed ≈ `BOLT_SPEED · cos φ`.
- S15-10. Altitude band: flying straight up at full pitch + W, `|pos.y − 18|` never exceeds
  20.5; vertical speed ≤ 13 u/s measured in the 16-20 band (story-005 parity numbers);
  `#warn` visible when outside the band. (Scaffold — retired by S16-6.)
- S15-11. Raider scans 3D: probe spawns a raider 20 u directly above a stationary ship →
  no ram contact and no bolt hit within 2 s (the XZ-only build hits — that is the red).
- S15-12. Raider altitude-follow: player teleports to +30 altitude for 3 s → live raider
  mean y within 12 u of the player's.
- S15-13. Full flow-check green (76 existing + new), per-page `CONSOLE []`; restartProbe
  clean; pitch resets to 0 on every `enterCombat`.

## S16 — story-016: spherical arena (GDD §8.2)

- S16-1. Ship position never exceeds r3 = 81 from O under any input combination, including
  pitched flight at boost (hard clamp); the soft force engages at r3 > 60.
- S16-2. Radial speed bleeds inside the soft shell: ≤ 13 u/s measured across r3 65-78 while
  holding W outward (story-005's measured parity, 8-shell-sample analog).
- S16-3. The shell slides: at r3 = 79 with oblique heading + W, the ship carries > 5 u
  along the shell in 1.6 s (no pin — story-005 rim-slide in 3D).
- S16-4. `#warn` fires entering the soft shell and clears inside it; equator rim ring
  opacity tracks 3D proximity (0 at r3 ≤ 60, > 0 at r3 ≥ 78).
- S16-5. Boss dash guard: with the player parked at r3 = 78 during charge phase, every
  captured `dashTarget` satisfies r3(dashTarget) ≤ 68; the boss never exceeds r3 =
  80 + OVERSHOOT tolerance (92) mid-dash and re-orbits inside.
- S16-6. The S15-10 band asserts are REMOVED and the removal is stated in the story report
  and the harness comment (no silent retirement); `BAND_H/BAND_HH` consts deleted.
- S16-7. Drones remain functional in the sphere: `?droneProbe=1` still reports yRange > 1,
  path3d all-axes movement, telegraph/dive/contact true (story-012 keep-passing — zero
  steering changes).
- S16-8. Full flow-check green, per-page `CONSOLE []`; restartProbe clean (restart baseline
  includes no new allocations).

## S17 — story-017: world goes 3D (GDD §8.3)

- S17-1. Combat-only ambient field present: probe reports ≥ 100 ambient rock instances
  whose positions fill the shell (min radial distance from O ≥ 25, max ≤ 75, sampled); the
  group is hidden on `clearCombat` and re-shown on `enterCombat` (rim-ring lifecycle).
- S17-2. The field never collides or obscures: no ambient instance within 10 u of the ship
  over a 10 s probe drive at varied pitch (clearance analog of the lane stream's 14 u).
- S17-3. Shell visual: a sphere mesh at R_HARD exists in combat only, additive/transparent,
  opacity > 0 at r3 ≥ 78 and == 0 at r3 ≤ 60.
- S17-4. Cruise untouched: all existing pad/countdown/ignition/ascent/transition flow-check
  asserts keep passing unchanged; `streamTick` groups and seeding unmodified (diff review:
  no `src/launch.js` change in the story's file list).
- S17-5. Backdrops intact: planet and black hole remain visible from a high-altitude vantage
  (screenshot assert, manual player gate — collected at stage close per the 013/014
  full-auto grant convention).
- S17-6. Experiential (playtest, 3+ runs): a player can find and dodge the boss charge by
  climbing; rim approach is noticed BEFORE the clamp (warn + ring + shell all seen); pitch
  never produces reported disorientation at 60°+; drift reads as weight, not lag.

## S3X — cross-story experiential gate (GDD §8.4, collected at stage close)

- S3X-1. First-climb moment: within 30 s of a new player's first combat, they pitch at
  least once unprompted (hint bar + panel text did the job — the "obvious controls" pillar).
- S3X-2. The boss fight's character changes, not its shape: orbit → charge → rage phase
  order and timings unchanged (story-013 asserts keep passing), but verticality shows up as
  new player-driven dodges, not as new boss behavior.
- S3X-3. Failure recovery unchanged: death → slow-mo → card → REPLAY loop identical
  (story-014 asserts keep passing).

## MUST-NOT-BREAK — architecture §5 as explicit criteria (every story, every merge)

- M1. flow-check 76/76 at stage open — every page-level `CONSOLE []` clean; the final gate
  re-run on merged master after every merge (`tools/flow-check.mjs` L651 + per-page asserts).
- M2. Headed boot MODULE→TITLE under 1000 ms (`tools/boot-marks.mjs`); 017's new geometry
  must not push module-eval cost, and new scene objects are created at `prepare*`, never per
  boot phase.
- M3. restartProbe=3 `clean:true` — pools drain via `clearCombat`; any Stage 3 geometry
  joins the baseline (created once in `prepare*`), never per-entry allocation.
- M4. Victory card behavior: lands exactly once (`bossDefeatedReports === 1`), card score ==
  internal score, clock frozen while dead, REPLAY → pad sweep, pips drained, second run
  baseline clean + `C.time` reset.
- M5. Boss fight behavior: orbit→charge→rage order, weak-point 3× ratio end-to-end, dash
  overshoot, slow-mo, BOSS HUD line present-then-gone, `combatState().boss` drains to null.
- M6. Drone behavior envelope: yRange > 1 u, telegraph→dive, wave rule [0,0,1,2,3],
  `droneBuild` matches the token — 016 retunes knobs, never the contract (and 015/016 touch
  no steering code).
- M7. Boot laziness contract: no `localStorage` touch before the title mark;
  `readHighscore()` pre-warm returns 0 and re-renders after warm-up.
- M8. Never-crash edges keep their one-line-degrade treatment (TD-013 composer latch, TD-015
  musicTo guard, drone GLB degrade, corrupt-GLB fallback rocket); new Stage 3 failure paths
  get the same.
- M9. Overlay sweep + `playing` cursor contract: any new Stage 3 HUD element joins
  `OVERLAY_ELMS` or is phase-owned like `#tele`.
- M10. Harness semantics never altered quietly (harness strategy, architecture §4): the
  existing 76 asserts are never re-numbered or re-thresholded without a FLAGGED semantics
  decision recorded in the story report + harness comment — the two planned exceptions are
  016's probes 7/7b/8 re-derivation (r → r3) and the 015 band-assert retirement, both
  pre-declared in the story files.

**Success criteria.** All 3 stories COMPLETE with evidence receipts; flow-check 76 → 111
green after every slice and on every merged master (98 after 015, 103 after 016, 111 after
017 — the 016 step is +8 new/re-derived − 3 band retirement); per-page `CONSOLE []` clean;
restartProbe and boot-marks inside their gates; M1-M10 hold at every merge; the S3X
experiential gate recorded at stage close; one-shot gate PASS.
