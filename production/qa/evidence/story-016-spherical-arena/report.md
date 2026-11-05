# story-016 — spherical arena: the disc becomes a volume

> **Status**: DONE_WITH_CONCERNS (one BLOCKED guard finding — see §8.4; two mutation records
> with documented run limitations — see §8.1, §8.2)
> **Branch**: `story-016-spherical-arena` (head a5f2270 — implemented by predecessor; this
> session completed the protocol: mutation records, harness record comments, report, fresh gates)
> **Date**: 2026-11-05
> **Spec of record**: `production/epics/combat-feel-fix/story-016-spherical-arena.md` +
> `design/gdd/full-3d-flight.md` §3.5, §4.4–4.5, §5.3–5.4

## 1. What was implemented (per GDD section)

The implementation was landed by the predecessor at commit a5f2270 (`feat: story-016
spherical arena — 3D soft shell, boss dash guard, band scaffold retired`). This session
did not change product source — it completed the protocol's remaining deliverables
(mutation records, harness comment records, report, fresh gate battery). Per GDD section:

**§3.5/§4.4 — the sphere boundary** (`src/combat.js`). `O = (0, ARENA_Y, 0)` with
`ARENA_Y = 18` re-anchored as the sphere center's y; `R_SOFT = 60`, `R_HARD = 80` keep their
story-005 values (meaning widens from disc radius to sphere radius). Boundary math:
`r3 = |pos − O|`, outward normal `n = (pos − O)/r3`, radial component capped at
`max(3, MAX_SPEED·(R_HARD − r3)/(R_HARD − R_SOFT))` — story-005's formula with the 3D
normal, floor 3 carried into 3D unchanged (the load-bearing anti-mud floor). Only the excess
along `n` is subtracted, tangential preserved (slide, never pin). Hard clamp: past `R_HARD`,
`pos − O` scaled back onto the shell (the `r > R_HARD` block now carries its y term).
Per-frame ordering unchanged and load-bearing (§4.5): drift alignment → boundary bleed →
position integration → hard clamp — the boundary wins within one frame; equilibrium radial
speed equals cap(r3).

**§4.4/§5.5 — `#warn` and rim ring**: `#warn` ("EDGE OF SECTOR") fires entering the soft
shell (r3 > 60) and clears inside it; the equator rim ring stays as the ground reference and
its opacity driver switched from 2D `hypot(x,z)` proximity to 3D r3 proximity
(`clamp((r3 − R_SOFT)/(R_HARD − R_SOFT), 0, 1)·0.55`).

**§5.3 — boss dash shell guard** (`src/boss.js`): the ONE line in `launchDash` — the
captured `dashTarget` is clamped radially to `DASH_SHELL_R3 = 68 = R_HARD − OVERSHOOT − 2`
(10 u overshoot stays honest, measured from the clamped target). State machine otherwise
untouched; volley bolts stay flat (altitude-follow at rate 3/s converges in ~1 s).

**Riders (landed in 016, asserted in the harness)**: camera down-side ceiling (R-a, the
flatten-during-DOWN-pitch regression class — `viewDirFromUp.down ≤ 35°` added to the story-015
R1 assert); pitch-rate-consistency window form for R and F (R-b); rendered-nose pitch sign
(R-g); raider separation dy term (R-f); raider altitude-follow keep-passing (story-015).

## 2. FLAGGED RETIREMENT — the 015 band scaffold

`BAND_H`/`BAND_HH`, the band bleed block, the band `#warn` branch, and the three story-015
band asserts (`altitude band holds |y−18| ≤ 20.5`, `band vertical speed ≤ 13 u/s (18-20
layer)`, `#warn fires outside the band`) are DELETED in this story — a flagged semantics
change, never a quiet edit (GDD §3.4, §5.5). The retirement is stated in the harness comment
block (`tools/flow-check.mjs`, above the sphere asserts), in this report, and points at
story-015's record. Rationale: the sphere is the volume; the band (a flat altitude slab) is
superseded — its asserts measured slab grammar that cannot express the 3D shell, and their
presence would mislead (the 015 record's band asserts measured planar |y−18|, which the
sphere replaces with r3).

## 3. FLAGGED boundary re-derivations (probes 7/7b/8) — old vs new

The three story-005 boundary asserts keep their thresholds; only their measurement changes.
Re-derived red-first on the pre-016 branch build (recorded in `flow-red-story016.txt` and
the harness comment):

| Probe | Old (story-005, 2D) | New (story-016, 3D) |
| --- | --- | --- |
| 7 | `soft rim bleeds radial speed (≤13, sampled in r 65–78)` — `r = hypot(x,z)` | `soft shell bleeds radial speed in 3D (≤13, sampled r3 65–78)` — `r3 = |pos − O|`; + floor probe `rim floor keeps progress (≥2.5 u/s, sampled r3 ≥ 77.8)` |
| 7b | `boundary is a circle (r≤81)` | `boundary is a sphere (r3 ≤ 81)` |
| 8 | `rim slides (carry >5u over 1.6s)` — planar drives | `rim slides along the shell (carry >5u over 1.6s)` — full-3D drives, + the sphere walk's pitched-clamp drive (`hard clamp under pitched boost (r3 ≤ 81)`) |

On the 015 build the re-derived asserts stay green by design (their drives are planar there,
so `r3 ≡ hypot(x,z)`); the r3 form is what the pitched drives discriminate — the band build
reaches `r3 ≈ 82.5 = hypot(80, 20)` legally, which is the red recorded on `hard clamp under
pitched boost` (`flow-red-story016.txt`).

## 4. Red-first record

`flow-red-story016.txt` — the 015 close build (02d1ff2), product code untouched, only the
harness differing: **96 passed / 9 failed**. All 9 reds, each for the stated reason:

1. `hard clamp under pitched boost (r3 ≤ 81)` — maxR3 82.47: the band build clamps XZ at 80
   and |y−18| at 20, so pitched boost reaches r3 ≈ hypot(80, 20) legally.
2. `#warn clears inside the shell (hidden at r3<58, dY>16)` — the band `#warn` grammar keeps
   the warning on whenever |y−18| > 16 (it cannot clear "inside the shell" at altitude).
3. `rim ring opacity tracks 3D proximity (>0 at r3 ≥ 78, 0 inside)` — shell/inside
   `undefined`: the 2D driver reads a small `hypot(x,z)` at altitude, so opacity stays 0 at
   r3 ≥ 78.
4. `boss dashTarget clamped inside the shell` — `peak=undefined`: field absent on 015 (no clamp).
5. `boss stays inside mid-dash and re-orbits inside` — `peak/reorbit=undefined`: same.
6. `R 0.4s window tracks PITCH_RATE·Δt` — `window=undefined`: rider R-b form absent on 015.
7. `F 0.4s window tracks PITCH_RATE·Δt` — `window=undefined`: same.
8. `raider separation 3D (coincident-stack pair separates > 1.5u)` — `maxPairDist=undefined`:
   rider R-f field absent on 015.
9. `rendered nose rides the pitch sign (world nose.y > 0 under R hold)` — `noseUpY=undefined`:
   rider R-g field absent on 015.

Keep-passing on the red run: the entire pre-016 suite passed unchanged (96/9; the asserted
`CONSOLE []` blocks green by design).

## 5. Final gate outputs (fresh, this session — shipped build)

| Gate | Result |
| --- | --- |
| `node tools/flow-check.mjs` | **105 passed / 0 failed** (`flow-green-final.txt`), every page `CONSOLE []` (5/5) |
| `node tools/dep-check.mjs` | **PASS** — acyclic; main.js **500/500** |
| `?goto=combat&restartProbe=3` | **`{"runs":3,"left":0,"clean":true}`** — three identical entries `{hp:100, shield:50, score:0, wave:1, particles:0, bolts:0, entities:31}`, `CONSOLE []` |
| `tools/boot-marks.mjs` (headed, RTX 3060) | **MODULE → TITLE 414 ms** (< 1000 gate); `rocket:glb`; fps at boot ok; `CONSOLE []` |

Probe report (final green run, `flow-green-final.txt`): `maxRadial 11.0` (≤13),
`deepRadial 3.08` (≥2.5), sphere `r3 72.6` (≤81), `rim slides d 9.9` (>5), `maxR3
80.00` (≤81), warn seen + cleared at `{r3:58, dY:25.8}`, opacity `shell 0.55 / inside 0`,
boss `dashPeakR3 78.55 / reorbitR3 71.45` (≤80 / ≤85), `viewDirFromUp {down:18.15,
up:25.47}` (10–35 both ways). All inside tolerance.

## 6. Mutation record (mutate → `npm run build` → full flow-check → restore → rebuild; every
red VERIFIED by reading its output — a silent no-op proves nothing)

| # | Mutation | Output | Observed red |
| --- | --- | --- | --- |
| 1 | combat.js `R_HARD 80 → 90` (predecessor, 2026-11-05) | `flow-mutation-rhard90.txt` — **104/1** | `hard clamp under pitched boost` (**maxR3 90.00**). `boundary is a sphere` stays green: its 7b drive breaks at r3 ≥ 79 before the inflated 90 clamp can be seen — the pitched-clamp assert is the discriminator |
| 2 | combat.js boundary floor `Math.max(3, …) → 0` (2026-11-05) | `flow-mutation-floor3.txt` — **104/1** | `rim floor keeps progress at the deep shell` (**deepRadial 1.63 < 2.5**, 3 samples — the pure linear-cap asymptote returns; the floor's load-bearing role re-proven in 3D). Adjacent keep-passing: `soft shell bleeds` + `boundary is a sphere` green |
| 3 | combat.js hard spherical clamp REMOVED (2026-11-05) | `flow-mutation-hardclamp.txt` — **25 passed + target red + suite abort** | `hard clamp under pitched boost` (**maxR3 88.04** — escape). The run then ABORTS at the natural-death wait: with no clamp the ship leaves the bounded arena and outruns the ≤12 u/s raiders, so nothing kills it in 90 s. Deterministic (re-run identical); a threshold variant (clamp @ 92) reds identically (maxR3 88.40) and aborts identically. No full-suite hard-clamp mutation exists; the abort is a structural side effect of any outward-breach mutation, not a product defect. Upstream adjacency green (all 25 asserts before the abort) |
| 4 | combat.js tangential preservation removed (excess-subtraction → full-component zeroing, cap kept) (2026-11-05) | `flow-mutation-tangential.txt` — **102/3** | `rim slides along the shell` (**carry 3.5 < 5** — pins) + two same-root downstream reds: with tangential dead the ship lingers on the shell, so the return dive never crosses r3<58∧dY>16 in its 10 s window → `#warn clears` and `rim ring opacity inside` also red (sample-miss, not a product defect). The cap-form asserts (`soft shell bleeds`, `rim floor`) stay green |
| 5 | boss.js `launchDash` clamp line removed (2026-11-05) | `flow-mutation-bossdash.txt` — **103/2** | `boss dashTarget clamped inside the shell` (**peak 87.99 > 80**) + `boss stays inside mid-dash and re-orbits inside` (**reorbit 87.96 > 85** — the unclamped overshoot leaves the boss outside the shell past rage exit). Adjacent keep-passing: `boss phases entered in order`, weak-point ratio, overshoot, slow-mo all green |
| 6 | combat.js camera lift `+3.4 → −6` (the down-side ceiling mechanism inverted) (2026-11-05) | `flow-mutation-camceil.txt` — **104/1** | `camera look-target rides the pitched nose` (**down 46.46° > 35**, up 12° inside — a single-bound red). Adjacent keep-passing: `rendered nose` + all else green |
| 7 | enemies.js separation dy term dropped (2026-11-05) | `flow-mutation-raidersepdy.txt` — **105/105, NO RED** | See §8.4 — BLOCKED finding: this guard does not discriminate dy alone |

## 7. Files touched

- `src/combat.js` — the sphere boundary (3D normal, cap+floor, hard clamp with y term),
  `#warn`/rim opacity 3D, band scaffold deleted, boundary probe rewrite (pitched drives),
  pitchProbe riders (viewDirFromUp down ceiling, rate-consistency windows, rendered nose,
  separation pair stage). *(Predecessor; net-zero changes this session — all mutations
  restored exactly.)*
- `src/boss.js` — the ONE `dashTarget` shell clamp line in `launchDash`. *(Predecessor;
  restored exactly after the mutation run.)*
- `src/enemies.js` — (mutation runs only; restored exactly. No net change this session.)
- `tools/flow-check.mjs` — sphere asserts, re-derived probes 7/7b/8 (flagged), band-assert
  retirement record (flagged), rider asserts, and the story-016 mutation-record comment
  blocks added this session (comments only — harness semantics untouched).
- `index.html` — regenerated by `npm run build` (never hand-edited; content identical to
  HEAD byte-for-byte modulo line endings — see §8.3).
- `production/qa/evidence/story-016-spherical-arena/` — this report, `flow-red-story016.txt`,
  `flow-green-branch.txt`, `flow-green-final.txt`, `flow-mutation-rhard90.txt`,
  `flow-mutation-floor3.txt`, `flow-mutation-hardclamp.txt`, `flow-mutation-tangential.txt`,
  `flow-mutation-bossdash.txt`, `flow-mutation-camceil.txt`, `flow-mutation-raidersepdy.txt`.

NOT touched: `src/launch.js`, `src/audio.js`, `src/drone.js`, `src/input.js`, `src/main.js`,
`src/phases.js` — per the dispatch constraints. `tools/flow-check.mjs` changed only by
comments (mutation/comment records), never semantics.

## 8. Deviations and flagged items

1. **Mutation 1 (R_HARD 90) observed red differs from the plan's prediction.** The plan
   predicted asserts 1 and 4 both red (r3 reaches 88+ legally); observed: only assert 4 red.
   Assert 1 (`boundary is a sphere`)'s drive breaks at r3 ≥ 79 before the inflated 90 clamp
   can be seen, so it cannot fail under this mutation. The predecessor's record stands as-is;
   the hard-clamp guard's discrimination is fully proven by mutation 3 (removal) instead.
2. **Mutation 3 (hard-clamp removal) is an incomplete-suite record.** The target red is
   verified and deterministic; the suite aborts at the natural-death wait because the
   unclamped ship escapes and outruns the raiders. No full-suite hard-clamp record exists;
   every outward-breach variant we tried (exact removal; clamp threshold 92) aborts
   identically. Recorded honestly with the upstream adjacency.
3. **Mutation 4 (tangential) observed reds exceed the plan's prediction** (1 → 3). The two
   extras are same-root sample-misses of the return-dive asserts, not independent defects;
   the cap-form adjacency stayed green. The plan's literal form (zero the full radial
   component) would have been strictly worse — it pins the ship at r3 ≈ 60 before the
   sampled radii, redding the bleed and floor asserts too. The shipped form (strip tangential,
   keep the cap) is the cleanest faithful realization and is what we recorded.
4. **BLOCKED finding — the raider separation-dy guard (R-f) cannot be proven failing under
   its named mutation.** Dropping the dy term from the separation metric produced **no red**
   (105/105, `flow-mutation-raidersepdy.txt`). Disabling the WHOLE separation block drops
   `maxPairDist` to 0.49 (the assert would red), so the guard does test separation — but on
   the live combat page the probe's "lockstep" precondition does not hold: wave raiders in
   `E.scratch` (n=4 during the window) push the co-located probe pair apart in XZ once
   sub-frame offsets appear (measured `maxPairDist 2.26` with dy dropped, vs 2.0 green). The
   dy-specific term is therefore not the mechanism the assert measures in practice. We did
   not fabricate a red; the mutation's green run and the trajectory evidence are recorded
   (harness comment + this report). **Decision for orchestrator/designer:** either accept
   the guard as "separation discriminator" (weaker than its R-f claim) or re-derive the
   probe to quiesce wave interference (e.g., isolate the pair in a scratch-only run) so the
   dy term is the sole variable — a red-first re-derivation, not a quiet knob turn.
5. **Camera mutation iteration.** My first camceil design (flatten the camera trail to
   horizontal) proved invalid: it orphaned `C.tmp2`, which `lookAt` consumes right after, so
   the look target was corrupted (garbage 2.89° fold readings). Discarded. The recorded
   mutation (lift +3.4 → −6) is a one-number change that keeps the `forward()` call intact,
   and produces a clean single-bound red (down 46.46°), with the up side and all adjacency
   green.
6. **`index.html` line endings.** Rebuilds produce LF; HEAD stores CRLF. Content is
   byte-identical ignoring `\r` (verified by hash); `git diff` shows no textual change. Not
   committed as a content change beyond the regeneration.

## 9. Harness record notes

The mutation records are written into `tools/flow-check.mjs` comment blocks in the house
format (mutation + date + observed red + adjacency), per the story's test plan and the kee
prime rule: the sphere-block record list (items 1–6 above), the boss-guard record, the R-f
BLOCKED note, and the R-a camera note. The band-retirement record was already present.

---

**STATUS: DONE_WITH_CONCERNS** — implementation verified per story-016 (the predecessor's
a5f2270), all gates green this session (flow 105/105 with every page CONSOLE [], dep-check
PASS, restartProbe=3 clean:true, boot 414 ms), 6 mutation records plus the predecessor's
R_HARD record exist with verified reds (the two run-limited records documented above), keep-
passing untouched, and the red-first record intact. The one concern is §8.4: the R-f raider
separation-dy guard cannot be proven failing under its named mutation (no red — the live-wave
XZ pushes part the probe pair regardless of dy) — surfaced as a BLOCKED finding for
orchestrator/designer decision; no source change was made without sign-off.

## 10. R-e extraction — probe drives moved to src/probes.js

Rider R-e (the only spec gap found on the otherwise-compliant story-016 implementation) is
now closed: the three probe drives are extracted out of `src/combat.js` into a new
`src/probes.js`. STRICTLY behavior-neutral — no game-behavior change; moved verbatim.

**What moved** (from `src/combat.js` → `src/probes.js`):
- The three probe ticks: `droneProbeTick` (story-012), `bossProbeTick` (story-013, with its
  `bossBolt` helper), `pitchProbeTick` (story-015, the large ~263-line drive).
- All probe-owned state: the former `C.dp*` / `C.bp*` / `C.pp` fields → module-level state
  in probes.js (`DP` / `BP` / `PP`), reset via exported `resetProbes()` (called from
  `enterCombat`, replacing the inline resets; identical window hygiene).
- The query-flag wiring: `?droneProbe=1`, `?bossProbe=1`, `?bossShot=1`, `?pitchProbe=1`
  parsing moved with the ticks.

**Import direction** (house dep-check, acyclic): `probes.js` imports only `enemies.js`,
`drone.js`, `boss.js` — it does NOT import `combat.js`. `combat.js` imports `probes.js`
and calls the ticks with `(dt, C, probeEnv)` — combat state plus the pure helpers/constants
the ticks close over (`forward`, `noseWorld`, `clamp`, `ARENA_Y`, `BOLT_LIFE`,
`TURN_RATE`, `HP_MAX`, `SHIELD_MAX`), the same context-passing pattern
`ENEMIES.tickEnemies` / `BOSS.tickBoss` already use. Graph: probes → (boss/drone/enemies),
combat → probes; no cycle.

**Proof — two green runs on identical semantics:**
- Baseline (before extraction, head 203e090): `node tools/flow-check.mjs` → FLOW-CHECK PASS
  **105 passed, 0 failed**, every page CONSOLE [] (recorded in
  `flow-green-r-e-baseline.txt`).
- After extraction: `node tools/flow-check.mjs` → FLOW-CHECK PASS **105 passed, 0 failed**,
  every page CONSOLE [] — identical asserts, zero diff on `tools/flow-check.mjs`.
- `node tools/dep-check.mjs` → PASS — acyclic, structural rules hold (main.js 500/500).
- `npm run build` green both times (index.html regenerated).

**Line counts:** `src/combat.js` 1100 → 614 lines (the three drives + probe state + query
flags removed); `src/probes.js` new, 513 lines.

**Prime-rule note:** no new behavior was introduced — this is a pure move (extraction), so
no regression test is required; the proof is the identical 105/105 flow-check and PASS
dep-check on both sides of the move.
