# story-018 — charged shot + pickups (programmer report)

> **Status**: DONE (with the flagged deviations in §5 — no blockers)
> **Branch**: `story-018-charged-shot-pickups` (from master @ `27e4a61`; NOT merged, NOT
> tagged, NOT pushed per the brief). Commits: `7127443` (charged shot) → `5ae021e` (pickups +
> probes/harness + HUD/audio/controls) → `b9a8af9` (drive watchdogs) → `0df4f39` (mutation
> records, comment-only) + the evidence commit.
> **NOTE — one foreign commit on this branch**: `0bc12b7` "docs: bootstrap LAUNCH-10-10
> master plan …" (author Arghya, docs-only: CLAUDE.md +2 / one-shot-work planning files)
> landed between my commits 2 and 3 — NOT part of this story, untouched by me, zero overlap
> with the story-018 file list. Disclosed for the diff review.
> **Date**: 2026-11-06
> **Spec of record**: `production/epics/combat-feel-fix/story-018-charged-shot-pickups.md`
> (amended) + `design/gdd/stage-4-balance.md` §3.1-3.3, §4, §5, §8.1-8.3, §9 (Decision 1
> resolved to the recommended shape) + `docs/architecture.md` §7

## 0. Plan (3 bullets) and what could break

- **Part A — charged shot**: rewrite `fireTick` (src/combat.js) as the threshold
  spray-then-charge model — stream bit-identical below `T_CHARGE = 0.6` s of continuous LMB
  hold, stream suppressed from the threshold (`SUPPRESS_STREAM = true`, design const), release
  fires exactly one charged bolt (`CHARGE_DAMAGE = 6`, scale ×3, amber `0xffc85a`, same
  `C.bolts` pool, stamped `userData.dmg/charged`). All three hit sites read the bolt's damage
  (probe-spawned unstamped bolts default to 1 via `|| 1` — keeps bossProbe's ratio-3 exact);
  `src/boss.js` stays zero-diff because `hitBoss(dmg, …)` already takes the dmg param. Cancels:
  death (the `!wantFire || C.dead` branch zeroes), pause (the fire path reads the raw key set —
  `KeyP`/`Escape` — the same grammar steer uses; the loop halts `tickCombat` while paused, so
  the first post-unpause tick still sees the key and zeroes), combat exit (`clearCombat` +
  `enterCombat` reset block).
- **Part B — pickups**: new `src/powerups.js` (imports stage-two-lib + pool.js ONLY) —
  `maybeDrop` (18% roll, uniform 1/3 kind), reuse-first pool of 6 pre-warmed at
  `preparePowerups` (entities join the baseline deterministically), `tickPowerups` (age/spin/
  blink-last-2s/despawn at 8 s/full-3D squared-distance pickup), `forceDropForProbe`,
  `clearPowerups`, `stats()` (the counters story-019's telemetry reads). Effect timers live in
  combat.js (`C.effects`, owner per architecture §7.2): apply on `api.picked`, tick on combat
  dt, SHIELD reads the regen delay as 0 in-window, refresh-not-stack, chips + charge meter are
  combat DOM writes.
- **Part D — harness**: `?chargeProbe=1` / `?powerupProbe=1` in-page drives (probes.js,
  importing powerups.js — acyclic), red-first against master's build (null probe), mutation
  records in the test file, the existing 115 asserts untouched (byte-identical outside the two
  new blocks).
- **What could break**: (1) the fire-path rewrite re-derives any assert that holds LMB —
  verified none does (grep: the harness only dispatches pointermove/pointerout; all probe
  bolts are pool-spawned, not fire-path); (2) the restartProbe baseline — pickup meshes are
  pre-warmed at prepare (+6, deterministic), but a THREE.Sprite pickup would be invisible to
  `countMeshes()` (isMesh-only), so the pickup entity is a mesh core + sprite halo — the
  architecture's "baseline RISES" contract wins over the GDD's "sprite" word (recorded in §7);
  (3) the 95% binomial bands are ~5% flaky by design (no seeded RNG exists — the story's own
  protocol: widen trials, never bounds); (4) SPREAD+OVERDRIVE bolt saturation — the
  orchestrator-accepted `BOLT_POOL` 24→36 rider; (5) the pause cancel depends on event-order
  details (keydown adds the key before `setPaused` flips the loop gate) — pinned by a
  harness-coordinated drive stage with a real KeyP press.

## 1. Red-first record (run BEFORE any implementation, on master's build)

Scratch harness `build/flow-check-018-red.mjs` = tools/flow-check.mjs + the two new blocks
(byte-identical elsewhere; the committed harness was untouched during the red phase). Run
against master's committed `index.html` @ `27e4a61`, product code untouched, only the harness
differing — the exact R-c red-run mechanics.

**Result: 117 passed / 28 failed** (raw output: `flow-red-story018.txt`).

All 28 new asserts FAIL, each for the stated absence reason (the droneProbe red pattern —
`?chargeProbe=1` / `?powerupProbe=1` are unread on master, so `window.__stage2.chargeProbe` /
`.powerupProbe` never appear, the deadlines expire, and every dependent assert records its red
from `null`/`{}`; `combatState().charge/.charging/.fired/.effects` are `undefined`):

- 13 chargeProbe asserts red (reports null; tap/hold/identity/one-shots/weak/burst = `{}`;
  burst3 undefined; pause/death = `{}`; exit-wipe reads a real combatState but `charge`
  undefined → strict `=== 0` fails).
- 13 powerupProbe asserts red (reports null; every field `{}`/undefined).
- 2 more red: the two exit-wipe walks read `charge`/`effects` undefined on master's
  combatState (the walks themselves LANDED — gameover → skip → combat — on both builds).

Keep-passing on the red run, BY DESIGN: all 115 existing asserts + the two new
`CONSOLE [] (chargeProbe page)` / `CONSOLE [] (powerupProbe page)` asserts — the unmodified
pages ignore the unknown query flags and die cleanly to the wave like every other
idle-combat page.

## 2. Commits + battery outputs

### Commit 1 — `7127443` "charged shot — threshold spray-then-charge fire path"
Scope: src/combat.js only (fire path + bolt dmg stamps + BOLT_POOL rider + combatState
charge/charging/fired + the three cancel wipes) + index.html. Battery, in order:
- `npm run build` — OK (index.html 4.38 MB, mode bundle).
- `node tools/dep-check.mjs` — **PASS — acyclic, structural rules hold; main.js lines: 255 (limit 500)**.
- `node tools/flow-check.mjs` — **FLOW-CHECK PASS — 115 passed, 0 failed** (`flow-green-c1.txt`).
  The charged-shot rewrite is dormant on every existing page (the harness never drives
  `input.fire`; all probe bolts are pool-spawned) — verified by grep before the run.
- `node tools/boot-marks.mjs headed` — **MODULE → TITLE 600 ms** (band < 1000 ms), CONSOLE [].

### Commit 2 — `5ae021e` "pickups + probes/harness + HUD/audio/controls" (slices 2-4 merged —
see the deviation note in §5)
Scope: src/powerups.js (NEW), src/combat.js (drop hooks + effect timers + SPREAD/OVERDRIVE +
HUD writes + audio call sites + the probe-tick wiring), src/probes.js (chargeProbeTick /
powerupProbeTick), tools/flow-check.mjs (the two new blocks — pure insertion, the 115 existing
asserts byte-identical), src/audio.js (4 named recipes), src/hud.js (ui map + CONTROLS text),
tools/index.template.html (#charge-ring meter + #hud-chips + hint bar), index.html.
Two intermediate battery runs were taken en route and recorded:
- pickups+probes code vs the OLD harness: **115 passed, 0 failed** (`flow-green-c2.txt`).
Final gates on the merged build:
- `npm run build` — OK (index.html 4.40 MB, mode bundle).
- `node tools/dep-check.mjs` — **PASS — acyclic, structural rules hold; main.js lines: 255 (limit 500)**.
- `node tools/flow-check.mjs` — **FLOW-CHECK PASS — 145 passed, 0 failed** (115 existing + 30 new;
  `flow-green-branch.txt`).
- `node tools/boot-marks.mjs headed` — **MODULE → TITLE 412 ms** (band < 1000 ms), CONSOLE [].

### Harness-assert-form notes (FLAGGED, mechanism documented in the harness comments)
1. **Kind split = joint χ² goodness-of-fit at 95% (χ²(2) ≤ 5.991) over 300 real drops** —
   not three independent binomial bands. Reason: three independent 95% bands flake ~14% of
   runs (the union of three 5% tail events), which breaks the suite's own green discipline;
   the χ² joint test is the textbook form of "the kinds land ≈ 1/3 each" and flakes 5% total.
   The per-kind counts are recorded in the report payload for diagnosis. Measured runs:
   110/95/95, 88/97/116, 112/93/96 — all pass.
2. **OVERDRIVE/boss interval = exact-counter shot count** (band [9,12] over the 0.6 s
   pre-suppression burst; [8,11] over the boss window's 0.5 s) with the timestamp-derived
   interval recorded in a wide honesty band [0.045, 0.075]. Reason: the 0.6 s suppression caps
   the burst at ~10-11 shots and frame quantization (headless dt 0.017-0.067 s vs the 0.0568
   interval) makes per-shot-timestamp means noisy (observed 0.067-0.071 on clean runs). A
   missing OVERDRIVE still reads ~5 shots / 0.125 s → red — the assert discriminates.
3. **Blink windows sampled at t ≥ 5.5 (off) / t ≥ 6.4 (on)** — the blink starts at
   PICKUP_LIFE − PICKUP_BLINK = 6.0 s; the original 6.5/7.0 pairing sampled INSIDE the blink
   window for both points (a false red).
4. **Pickup radius seats anchored on the SHIP CENTER** (1.3 / 1.6 / 1.345 full-3D) — the
   pickup check measures ship↔pickup; a nose-anchored 1.3 seat actually sits 1.64 away.

## 3. Mutation records (post-green, each verified applied by reading its red output)

**Mutation 1 — combat.js `T_CHARGE 0.6 → 0.06` (2026-11-06)** — `flow-mutation-tcharge.txt`:
**141 passed / 4 failed.** Target RED: `tap 0.2s → stream fires, 0 charged` with
`{stream: 1, charged: 1}` — a tap now crosses the threshold and fires a charged bolt. The 3
other reds are the same-root cascade (hold1 / charged identity / OVERDRIVE shot count all
read the threshold). Adjacent keep-passing VERIFIED GREEN: `charged weak-point hit does 18`
(delta 18 — the dmg param is independent of the threshold), both one-shots, the 3-shot burst
(burst3 3), the pause and death cancels. Restored → rebuilt.

**Mutation 2 — powerups.js drop roll removed (`maybeDrop` returns false unconditionally)
(2026-11-06)** — `flow-mutation-droproll.txt` (second application): **143 passed / 2 failed.**
Target RED: `drop rate p=0.18 within the binomial 95% band` with the real value
`{kills: 100, drops: 0}` + the same-root `kind split χ²` (`{drops: 0, timeout: true}`).
Adjacent keep-passing VERIFIED GREEN: pickup radius (1.3/1.6/3D), SPREAD fan, OVERDRIVE,
SHIELD, refresh, chips, boss — `forceDropForProbe` bypasses the roll, exactly the seam the
mutation isolates. Restored → rebuilt. **FIRST application record (honest note):** the same
mutation pre-watchdog went red-by-NULL — the drive hung in the 300-drop kind-split stage
(no watchdog) — that hang is itself mutation evidence and drove commit 3's watchdogs; the
second application reads by value. Both outputs kept (`flow-mutation-droproll.txt` holds the
by-value run; the by-null run preceded it in the same file's history — the kept file is the
by-value one, the by-null run is summarized here).

## 4. Files changed vs master / NOT-touched confirmation

Committed (branch `story-018-charged-shot-pickups`):
- `7127443` — src/combat.js, index.html (charged shot).
- `5ae021e` — src/powerups.js (NEW), src/combat.js, src/probes.js, tools/flow-check.mjs,
  src/audio.js, src/hud.js, tools/index.template.html, index.html.
- `b9a8af9` — src/probes.js, index.html (drive watchdogs).
- (pending) — tools/flow-check.mjs (the verified mutation records, comment-only).

**NOT-touched — verified zero-diff vs master:**
`src/launch.js`, `src/boss.js`, `src/enemies.js`, `src/drone.js`, `src/phases.js`,
`src/input.js`, `src/main.js`. Confirm with `git diff master --stat -- src/launch.js
src/boss.js src/enemies.js src/drone.js src/phases.js src/input.js src/main.js` → empty.
main.js is 255/500 (dep-check) — zero main.js change, as the spec expected.

Scratch (untracked, consistent with the build/ scratch convention): build/flow-check-018-red.mjs
(the red-first harness), build/flow018-blocks.js (the block source), build/pu-debug.mjs
(the single-page drive debugger), build/run-mutations.sh.

## 5. Self-review findings, deviations, what was NOT verified

**Deviations (all flagged, none silent):**
1. **Slices 2-4 merged into one commit** (5ae021e): the probe drives assert HUD/audio surfaces
   (chips, charge meter), so the harness blocks and the HUD must share one battery to keep
   every commit green; committing them separately would have shipped a red battery per slice.
2. **`BOLT_POOL` 24 → 36 landed in commit 1**, not the suggested commit 2 — a one-const change
   already in the fire-path file; noted here rather than re-slicing.
3. **The pickup entity is a MESH core (octahedron) + additive sprite halo, not a bare
   THREE.Sprite** — `countMeshes()` counts `isMesh` only, and the architecture's "pickups join
   the entity baseline (the baseline count RISES)" contract must be observable by restartProbe;
   a bare Sprite would be invisible to it. The GDD's "rotating pickup sprite" is honored by the
   additive/depthWrite:false neon grammar + the halo; the rotation is real (the group spins).
   The pool is pre-warmed (6 spawn+kill at prepare) so the +6 baseline is deterministic.
4. **Kind-split assert form = joint χ² goodness-of-fit at 95%** (not three independent binomial
   bands) — three 95% bands flake ~14% of runs; the χ² joint form is the textbook test of "the
   kinds land ≈ 1/3 each" and flakes 5% total. Per-kind counts are recorded for diagnosis.
5. **OVERDRIVE/boss interval asserted by exact shot COUNT** (the 0.6 s suppression caps the
   burst at ~10-11 shots; frame quantization at headless 15-60 fps makes timestamp means read
   0.067-0.071 on clean runs) with the timestamp interval recorded in a wide honesty band.
6. **SPREAD_ARC/OVERDRIVE_DIV live in combat.js** (GDD §7) — the dispatch brief's inline
   summary placed them in powerups.js; the brief's own rule (the GDD files win) resolved it.
   EFFECT_T stays in powerups.js (architecture §7.1) and combat.js imports it.
7. **Probe drives write `C.api.input.fire` directly** (probe-owned precondition, the
   pitchProbe-synthesized-keys class) — input.js stays zero-diff. The pause cancel reads the
   raw key set per the GDD's mechanism (the loop halts tickCombat while paused, so the first
   post-unpause tick still sees KeyP and zeroes the accumulator — pinned by a real KeyP press
   from the harness).
8. **`combatState()` also exposes `fired: { stream, charged }`** — a probe-surface counter
   pair (fire-path bolts spawned) that the drive asserts consume; story-019's telemetry
   supersedes it.

**Self-review findings caught and fixed during the green runs (each proven by a red):**
- the SPREAD fan's center bolt read `C.tmp` after `lookAt` clobbered it (a garbage-direction
  center bolt) — fixed by copying the center dir out of the scratch before the first spawn;
  the drive's angle assert (exactly 6.00°/6.00°, centerAngle 0) now proves the fan geometry.
- the probe drives were never wired into tickCombat (the first green run red-by-null on BOTH
  pages — 120/25) — fixed by the import + the two call sites.
- the burst accounting re-baselined per cycle (burst3 read 0 on a fully-working burst) —
  per-cycle baseline split from the stage baseline; the mutation-style catch came from reading
  the report data against the code.
- the one-shot targets sat 1.0 u off the bolt ray (a hit window narrower than one frame step —
  flaky) — re-seated ON the nose ray (the gunner missed / the elite hit in the same run: the
  flake made visible, then fixed).
- the radius seats were nose-anchored (nose+1.3 = 1.64 from the ship — never picked) —
  re-anchored on the ship center.
- the blink assert sampled both points inside the blink window — re-windowed at 5.5/6.4.
- the drive stages had two unbounded loops and a dead-end stage number — watchdogs + the
  dead-end fixed (commit 3).

## 6. Final battery (fresh runs on the final tree, in order)

1. `npm run build` — OK (index.html 4.40 MB, mode bundle).
2. `node tools/dep-check.mjs` — **PASS — acyclic, structural rules hold; main.js lines: 255 (limit 500)**.
3. `node tools/flow-check.mjs` — **FLOW-CHECK PASS — 145 passed, 0 failed** (`flow-green-final.txt`
   — the run on the final tree with the mutation records in place; 115 existing + 30 new;
   every probe page `CONSOLE []`).
4. `node tools/boot-marks.mjs headed` — **MODULE → TITLE 412 ms** (band < 1000 ms), CONSOLE [].

Evidence files in this directory:
`flow-red-story018.txt` (the red-first record, 117/28), `flow-green-c1.txt` (115/0),
`flow-green-c2.txt` (115/0), `flow-green-branch.txt` (145/0 — the first full green),
`flow-green-final.txt` (145/0 — the final tree), `flow-mutation-tcharge.txt` (141/4),
`flow-mutation-droproll.txt` (143/2), this `report.md`.

**What was NOT verified:**
- **Experiential criteria (GDD §8.5)** — discoverability without instructions, "the suppression
  must read as charging, not jamming", pickup legibility — these join the owed look/feel list
  at the stage close (playtest), per the story. No playtest was performed in this task.
- **Audio in-headless** — the whine/thump/blips play through the guarded WebAudio recipes but
  the headless harness cannot assert sound; the recipes follow the shipped synth patterns and
  the call sites are wired (crossing/release/pickup/expiry). A headed listen is a playtest item.
- **The binomial-band flake budget**: the drop-rate assert [11, 25] over N=100 carries ~5%
  per-run miss risk BY DESIGN (the GDD's own protocol; no seeded RNG exists to narrow it).
  The three green runs in this task measured 22, 25, 19 — 25 was at the bound once. If a
  future run reds on this assert alone, rerun before diagnosing, and widen trials per the
  protocol (never hand-widen the bounds).
- **The charged-bolt steal-oldest edge at BOLT_POOL saturation** (SPREAD+OVERDRIVE
  simultaneously at the pathological extreme) — accepted by the GDD §5; not probe-driven.
- **Alt-tab mid-hold** (input.fire survives blur — GDD §5's accepted shared input-state
  finding) — logged for the future polish list per the GDD; not fixed here (pre-existing class).
