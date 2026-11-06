# Architecture — STAGE TWO (as of Stage 2 close, 2026-11-05)

Written for **Stage 3 — full 3D flight** (story-015 pitch+drift → 016 spherical arena → 017
world goes 3D). Every claim below is grounded in the cited file read at Stage 2 close; items
not verified by code are marked UNVERIFIED. Scope line and conventions:
`one-shot-work/stage-2/PROGRESS.md` lines 74–80. Identity/pillars: `design/game-brief.md`.

**Stage 4 additions (2026-11-05, stage-4 open):** sections 6–8 below carry the R-c main.js
refactor plan (TD-003, the mandatory first Stage 4 merge) and the story-018/019 module
contracts. Sections 1–5 are the Stage 2/3 record — unedited.

## 1. Stack decision record (documented, not re-decided)

| Choice | Where | Why (one line) |
| --- | --- | --- |
| three.js **0.187.0**, no engine | `package.json` | only runtime dep; browser-first, file:// single-file constraint favors a vendored ES bundle over a framework. |
| Single import surface | `src/lib-entry.js` | esbuild absorbs three + exactly 5 addons (GLTFLoader, EffectComposer, RenderPass, UnrealBloomPass, OutputPass); importmap mode keeps only bare `three`. |
| Build = `npm run build` → `tools/build.mjs` | `tools/build.mjs` | regenerates ONE self-contained `index.html` (esbuild 0.28.2 bundle mode, minified); **never hand-edit index.html**. |
| GLB inline at build time | `tools/build.mjs` (weld/dedup/prune/quantize via @gltf-transform 4.5.1) | a file:// page cannot fetch siblings; hero/prop/drone GLBs ride as base64 tokens (`__GLB_B64`, `__ROCKET_OLD_B64`, `__DRONE_B64`) — asset swaps are BUILD decisions. |
| Flow harness `tools/flow-check.mjs` — **76 asserts** | PROGRESS.md line 69 | headless Edge CDP (port 9941, file:// url, per-page `CONSOLE []` asserts, line 651); drives the real UI; the never-regress net. Semantically NEVER altered (PROGRESS.md line 94). |
| Boot harness `tools/boot-marks.mjs` | `src/main.js` `__BOOT` marks | headed (real GPU) timing; the MODULE→TITLE gate lives there; also proves phase:title + rocket:glb. |
| Probes (query switches) | `src/combat.js` 67–71, `src/launch.js` 13–19, `src/transition.js` 14–16, `src/audio.js` 167, `src/loop.js` 36 | `goto`, `scriptedKill`, `droneProbe`, `bossProbe`, `bossShot`, `composerFault`, `musicFault`, `restartProbe`, `skipProbe`, `holdBeat`, `ascent`, `holdCount`, `spin`, `corruptGlb`, `debug` — deterministic drives reporting on `window.__stage2` (+ `lastReport` parity). |
| dep-check `tools/dep-check.mjs` | story-011 rules | acyclic import graph; store.js imports nothing; nothing imports main.js; main.js ≤ 500 lines. |
| Process | PROGRESS.md 74–94 | one story = one branch = red-first asserts + recorded mutation + keep-passing cases; merge on machine gates; tag `good-YYYY-MM-DD`; main always known-good. |

## 2. Module map (17 src modules; line counts as read at Stage 2 close)

| File | ~Lines | Responsibility | Stage 3 |
| --- | --- | --- | --- |
| `src/lib-entry.js` | 14 | three + addon re-export surface | none |
| `src/main.js` | 501 | composition root: boot, renderer/scene/camera/**bloom composer** (349–360), GLB decode, UI wiring, `ctx`, probe surface, lazy-storage warm (397) | 016/017 (probe fields, visual constants) |
| `src/store.js` | 37 | lazy highscore storage (probe deferred behind title) | none |
| `src/phases.js` | 177 | PHASES machine (exit-before-enter + overlay sweep), combatApi, restart probe, **combat SPD readout** (165–176) | 015/016 (SPD semantics) |
| `src/input.js` | 90 | listeners (keys/pointer/fire/boost/pause), stale-pointer clears | 015 (pitch binding) |
| `src/loop.js` | 117 | rAF loop, dt clamp, **renderFrame + TD-013 degrade latch** (39–55), fps, DPR ladder | 017 (if pass/geometry work) |
| `src/launch.js` | 411 | pad→countdown→ignition→ascent phases; ship rig; streaming field/planet/hole; **cruise VEL/THR/DIST telemetry** (384–392); `combatFlow` | 017 (stream/wrecks in 3D) |
| `src/transition.js` | 342 | rift→warp→logo beats; camera-relative rift/tunnel; FOV restore | 017 (verify only — camera-relative already) |
| `src/combat.js` | 725 | combat core: **`steer()`** (yaw+throttle+soft rim, 158–217), bolts, waves, damage, HUD, **chase cam** (599–607), probes | **015+016+017 (center of mass)** |
| `src/enemies.js` | 227 | raiders (XZ-plane steering only), derived wave math, e-bolts, `fireEBolt` | 016 (3D decision) |
| `src/drone.js` | 335 | orbiting diver, **full-3D vectors from day one** (160–184), build-time GLB swap | 016 (retune, not rewrite) |
| `src/boss.js` | 408 | 3-phase boss (orbit/charge/rage), weak node, slow-mo death, `bossDefeated` | 016 (patterns vs sphere) |
| `src/effects.js` | 98 | explosion pool, shake, hit veil | none |
| `src/pool.js` | 53 | lazy object pool (restarts allocate nothing new) | none |
| `src/audio.js` | 363 | procedural WebAudio synth + music beds (TD-015 guarded crossfade) | none |
| `src/ship-fix.js` | 73 | pure GLB orientation math (adapter rows) | none |
| `src/assets.js` | 33 | FontFace loading (data URLs) | none |

## 3. Data flow

**Boot** (`src/main.js`): module eval → `boot()` (renderer → scene/camera → composer try/catch → `attachInput`) → `setPhase('loading')` → both GLBs decode (`Promise.all`, 380–403) → `LAUNCH.prepareLaunch` → `setPhase('title')` → storage warm in a `setTimeout(0)` (397 — **after** the title mark; laziness contract). Failure paths: corrupt GLB → `makeFallbackRocket()` (267); no composer → direct render; blocked storage → memory map (`src/store.js` 14–21).

**Phase chain** (`src/phases.js` PHASES + `src/loop.js` TICKS): title → **pad** (`LAUNCH.tickPad`, 2.6 s) → countdown → ignition → **ascent/cruise** (24 s, `tickAscent`) → **transition** (rift/warp, 12.6 s, key-skippable) → **combat** (`tickCombat`, phases.js 173–176 wraps `COMBAT.tickCombat` + the SPD writer) → **victory** (bossDefeated event, story-014) or **gameover** (death slow-mo 0.7 s). Cards REPLAY → pad; death card also SKIP → combat. Every phase change: exit-before-enter + `OVERLAY_ELMS` sweep (`setPhase`, phases.js 116–125).

**Per-frame** (`src/loop.js` `loop`, 71–86): rAF → dt (clamp `DT_CLAMP` 0.05, main.js 26; NaN guard) → `paused` check → `sdt = dt * game.timeScale` → `TICKS[phase](sdt, game.time)` → fps meter → `dprTick` (bloom off before DPR drops) → `updateDebug` → `renderFrame()`.

**Render path / bloom composer**: built once in `main.js` `boot()` (349–360): EffectComposer + RenderPass + `UnrealBloomPass(w, h, 0.6, 0.4, 0.85)` + OutputPass; render call is `composer.render()` guarded by the TD-013 latch in `loop.js` `renderFrame()` — first render throw degrades to `renderer.render()` permanently (`probs.post: 'bloom'|'off'|'direct'`). Resize and `setDpr` route through the same latch (`loop.js` 96–103, `main.js` `onResize` 406–411).

**Where systems run (all inside `tickCombat`, `src/combat.js` 581–679):** input→`steer(dt)` (turn/throttle/rim/integration) → `fireTick`/`boltsTick` (player bolts × enemy/orb/boss scans) → `ENEMIES.tickEnemies` → `DRONES.tickDrones` → `BOSS.tickBoss` → `wavesTick` → probe ticks → regen → **pose+camera** (`p.rotation.y=heading`, `p.rotation.z=bank`; chase target = `pos − forward·(7.5+|vel|·0.22)`, y+3.4, lerp `1−exp(−5dt)`, `lookAt(x+fwd·4, ARENA_Y, z+fwd·4)`) → effects → `combatFlow` (field streaming) → audio (duck/alarm/proximity) → change-gated HUD → edge pips → death clock.

**Coordinate anchors:** the player flies on the flat plane **ARENA_Y = 18** (`combat.js` 18); `forward()` is planar `(sin h, 0, cos h)` (153–155); pose group is `YXZ` yaw→fixed π/2 tilt→roll (88–93). Launch phases keep the ship parked at the lane origin; the world streams past (`launch.js` header).

## 4. Stage 3 technical risk register

- **R1 — Camera up-vector at high pitch (015/017).** The chase cam is `position.lerp` + `lookAt` with three.js default up `(0,1,0)`, and the look target's y is **hard-pinned to ARENA_Y** (`combat.js` 607). With pitch, "behind the ship" gains a y component and at |pitch| → 90° the view direction approaches the up vector — `lookAt` degenerates and the camera snaps. Mitigation direction: clamp the commanded pitch band, or move the camera rig to a ship-relative frame (quaternion follow). The boss/probe `lookAt`s (`boss.js` 307/324 use horizontal-only lookAt) inherit nothing here but must be re-checked once the ship can be above/below them.
- **R2 — Drift vs the throttle model (015).** Today `vel ≡ forward · C.speed` exactly (`combat.js` 186) — the velocity-trail camera (story-002), the SPD readout (`phases.js` reads `C.speed`, the throttle state, not |vel| — story-004 review addendum), and `combatState().speed/heading` all lean on that identity. Drift (momentum decoupled from the nose) breaks it everywhere at once. Decide explicitly: `C.speed` stays the throttle scalar and the HUD asserts read it, or the probe surface gains a true-speed field — either way the story-004/005 assert block (`flow-check.mjs` 139–235) must stay green or be re-derived red-first. The TD-011 regression class ("W flips the view", velocity-derived heading) must not return through the back door.
- **R3 — Frame-rate independence of the new physics (015/016).** Every existing integrator is dt-scaled with exp smoothing (`1−exp(−k·dt)`: bank 216, camera 605, boss y-lerp 323, drone orbit 252). Drift inertia is a *persistent* state — it must be integrated dt-scaled under `DT_CLAMP` 0.05, never a per-frame multiplier. Note the harness measures wall-clock windows (2 s `keyHold`, flow-check 141), so drift changes the expected displacement of the *existing* movement asserts — budget for re-measuring, not just adding.
- **R4 — Spherical boundary rewrite (016).** The rim is XZ-only: `r = hypot(x,z)` bleed + hard clamp (`combat.js` 190–208), the visible rim is a flat `RingGeometry` at `ARENA_Y+0.5` (533–543), and the bleed **floor of 3 u/s is load-bearing** (story-005: the pure linear cap is asymptotic and re-creates the "stuck" feel). A sphere generalizes the radial math cleanly, but: R_SOFT/R_HARD re-scale to sphere radius, the raider spawn ring (55 off, `enemies.js` 82–85) must map onto/inside the sphere, `#warn` ("EDGE OF SECTOR") needs an inside-the-shell trigger, and the same floor lesson applies to any radial cap in 3D.
- **R5 — Boss plane-hugging patterns vs a spherical arena (016).** Boss orbit steering is XZ radial+tangential with y lerped to the player (`boss.js` 313–324); volleys are forced flat (`dir.y = 0`, 155) and the enemy-bolt player-hit check is XZ-only (`enemies.js` 113–115); the dash is full-3D but its 10 u overshoot can exit the sphere. The `bossProbe` asserts (phases in order, 3× weak ratio, overshoot, slow-mo) are keep-passing — a 3D retune that preserves relative-to-player behavior may keep them green, but any radius/geometry change to hold-ranges must re-prove them, red-first if semantics change.
- **R6 — Raider AI plane decision (016).** Raiders steer on XZ only (`enemies.js` 129–186). Cheapest coherent option: raiders plane-hug at the *player's current altitude* (they already track `playerPos`); full 3D retune is the drone's job (it was built full-3D in story-012 precisely so 016 retunes it — `drone.js` header). Pick one in story-016 and record it; mixing per-enemy frames silently breaks collision math (orb scans are full-3D, raider scans are not).
- **R7 — HUD SPD/THR/VEL semantics (015).** Cruise `VEL/THR` (`launch.js` 384–392) are theater numbers, unaffected. Combat `SPD` writes `C.speed` — the throttle state. With pitch, vertical velocity exists; with drift, |vel| ≠ speed. The HUD must state one honest meaning ("SPD" = throttle vs "VEL" = |vel|); the TD-014 `#tele` clear (`combat.js` 695) and the story-010 change-gated writer (`phases.js` 165–176) must keep their shapes.
- **R8 — Bloom composer interplay with new geometry (016/017).** All neon is additive/`depthWrite:false`; three past bloom-saturation fixes live in `launch.js` (thruster cone FrontSide 184, plume opacity 348/369, nozzle light range 189). A large additive sphere shell is a full-screen emitter — keep the shell at/below the 0.85 threshold or non-emissive, or it washes the frame and interacts with the DPR ladder (which drops bloom first, `loop.js` 109–115). TD-013's degrade latch is a safety net, not a design target.
- **Harness strategy (all three stories).** Follow the established growth pattern (28→37→56→70→76, PROGRESS.md): new asserts written **red-on-old** with the reason recorded (the droneProbe/bossProbe/victory blocks in `flow-check.mjs` each carry their red record inline); mutations recorded in the test file with outputs under `production/qa/evidence/<story>/`; adjacent keep-passing asserts ship alongside; **existing 76 asserts are never altered semantically** — if a Stage 3 change legitimately changes an old assert's expected numbers, that is a flagged semantics decision, not a quiet edit. New deterministic drives follow the probe pattern (query flag → scripted walk → report on `window.__stage2` + `api.report` parity → page-level `CONSOLE []` before navigate).

## 5. What Stage 3 must NOT break

1. **flow-check 76/76, every page-level `CONSOLE []` clean** (`tools/flow-check.mjs` 651 + the per-page asserts at 308/352/526; the final gate on merged master — PROGRESS.md 69).
2. **Headed boot MODULE→TITLE under 1000 ms** (`tools/boot-marks.mjs`; PROGRESS.md 20 measured 445 ms at story-011; GLB-decode variance band documented 158–2492 ms — 017's new build-time inlined geometry must not push module-eval cost, and new scene objects are created at `prepare*`, never per boot phase).
3. **restartProbe=3 `clean:true`** (phases.js 129–157; PROGRESS.md 16/48): pools drain via `clearCombat` (§8.6), entity baseline re-primes — any Stage 3 geometry joins the *baseline* (created once in `prepare*` like boss meshes), never per-entry allocation.
4. **Victory card behavior** (story-014 asserts, `flow-check.mjs` 390–520): lands exactly once (`bossDefeatedReports === 1`), card score == internal score, clock frozen while dead, REPLAY → pad sweep, pips drained, second run baseline clean + `C.time` reset.
5. **Boss fight behavior** (story-013 asserts, 333–388): orbit→charge→rage order, weak-point 3× ratio end-to-end, dash overshoot, slow-mo, BOSS HUD line present-then-gone, `combatState().boss` drains to null.
6. **Drone behavior envelope** (story-012 asserts, 286–331): yRange > 1 u, telegraph→dive, wave rule [0,0,1,2,3], `droneBuild` matches the token — 016 retunes knobs, not the contract.
7. **Boot laziness contract** (`src/store.js` 23–24, `src/main.js` 397): no `localStorage` touch before the title mark; `readHighscore()` pre-warm returns 0 and re-renders after warm-up.
8. **Never-crash edges**: TD-013 composer degrade latch (`loop.js`), TD-015 musicTo guard (`audio.js` 248–285), drone GLB degrade-to-proc (`drone.js` 129–150), corrupt-GLB fallback rocket (`main.js` 267) — new Stage 3 failure paths get the same one-line-degrade treatment.
9. **Overlay sweep + `playing` cursor contract** (`phases.js` 116–126): any new Stage 3 HUD element joins `OVERLAY_ELMS` or is phase-owned like `#tele`.

---

## 6. STAGE 4 — R-c: the main.js extraction plan (TD-003; the mandatory FIRST Stage 4 merge)

Written 2026-11-05 at stage-4 open from a full read of `src/main.js` (exactly 500 lines by
dep-check's metric — zero headroom), `src/phases.js`, `src/input.js`, `src/loop.js`,
`src/pool.js`, `src/combat.js`, `src/probes.js` and `tools/dep-check.mjs`. Story-011 already
moved STORE/PHASES/INPUT/LOOP out of main.js; TD-003's "PHASES+INPUT+LOOP could be modules" is
therefore satisfied history. R-c extracts what story-011 left: the **UI banner** and the
**ROCKET banner**.

### 6.1 The rule being satisfied (tools/dep-check.mjs, read 2026-11-05)

dep-check enforces exactly four structural rules: (1) the import graph is acyclic (DFS over the
static-import graph, exit 1 on any cycle — "ES import cycles are a defect even when they appear
to work"); (2) `store.js` imports nothing; (3) **nothing imports `main.js`** (main is the
composition root); (4) `main.js ≤ 500` physical lines by its own metric (`split('\n')` minus the
trailing newline — main.js read at exactly 500). It also rejects any bare import outside its
skip list (`stage-two-lib`, `three`, `three/…`, `../node_modules/…`). It does NOT enforce
function length — the < 50-line function rule is a review standard. Registered >50 offenders at
stage-3 close: tickCombat, tickAscent, tickTransition, steer; read now add boot() (~80 lines,
main.js 325–404) and the probe drives in probes.js. R-c must add no new offender and closes
boot() (commit 3).

### 6.2 Extraction plan — two new modules, everything else stays

| Block in main.js | Lines | Destination | Notes |
| --- | --- | --- | --- |
| `$` helper | 46 | **stays in main.js** | boot() needs `$('scene-canvas')`; one line kept |
| UI banner: `ui` map, PANEL_HTML, openPanel/closePanel, refreshSoundButton, refreshRecordLine, resetArmT/onResetClick/disarmReset, OVERLAY_ELMS, toast | 45, 47–122 | **src/hud.js (NEW)** | 77 lines out. OVERLAY_ELMS and the `ui` map move TOGETHER (OVERLAY_ELMS closes over `ui` at eval time) in the same internal build order. openPanel/onResetClick read `probs.phase` → via ctx (`initHud(ctx)` joins the WIRING line). resetArmT/toastTimer become hud.js module lets. Imports: store.js (readHighscore/writeHighscore) + audio.js (isMuted/setMuted) only. Its module body performs ZERO storage calls — the story-007 laziness contract (§5.7) survives because `readHighscore()` pre-warm still returns 0 and the warm call site (main.js 397) does not move. |
| `probs` declaration | 125 | **stays in main.js** | probs is boot/probe state (written by boot, phases, loop, rocket-prep; read by ctx, `__stage2`, debug). A naive whole-banner move would drag it and invert a dependency. Pinned: stays. |
| ROCKET banner: MODEL_FIX/activeFix/shipAdapter/rocketShape, b64ToArrayBuffer, loadRocket, applyShipFix, measureShip, prepareRocket, loadPropRocket, preparePropRocket, makeFallbackRocket, spin viewer (spinRig/setupSpinViewer/updateSpinLabel/applySpinFix) | 124, 126–311 | **src/rocket.js (NEW)** | 185 lines out. Imports: stage-two-lib (THREE + GLTFLoader — GLTFLoader leaves main.js's lib import line) + ship-fix.js (adapterRows — main.js drops that import line entirely). All `scene`/`rocket` reads become **ctx getter reads at call time** (see R-c3). `initRocket(ctx)` joins the WIRING line. Bindings read by main.js after the move: `activeFix`/`rocketShape` (updateDebug 429–431, `__stage2.rocketMetrics` 464–472, input.js via `ctx.activeFix`) are mutated, never reassigned → plain object exports; `spinRig` IS reassigned (`spinRig = { sway }`, 295) → `export let spinRig` live binding (ES spec-guaranteed; esbuild 0.28 materializes it), accessor-function fallback if review prefers mutation-only exports — pick one in review, never mix. |

main.js additions: the two import statements (+4 lines), `initRocket(ctx);` (+1). **Predicted
main.js after R-c: ≈ 240 lines** (band 235–255; dep-check prints the exact number) — under the
420 target with ~260 lines of Stage 4 headroom, though story-018's HUD work lands in hud.js, not
main.js, so main.js should stay roughly flat through Stage 4.

New files: `src/hud.js` ≈ 100–115 lines; `src/rocket.js` ≈ 205–220 (header + imports + moved
code + init). Both far under 800.

**Not extracted, deliberately:** the DEBUG banner (updateDebug/fmtN, ~23 lines — its ctx
plumbing outweighs 23 lines and it is consumed through ctx already); boot()'s GLB decode chain,
SCENE state, the `window.__stage2` surface, WIRING and GO (the composition root itself); and
combat.js / launch.js / transition.js / probes.js — R-c is a main.js refactor, the pre-existing
>50-line functions there are registered debt OUT of this merge's blast radius, and story-018/019
are about to edit combat.js heavily (a structural split immediately before that maximizes merge
pain for zero behavior gain).

### 6.3 Import graph after R-c (dep-check must print this shape, acyclic)

```
main.js   -> stage-two-lib, launch, combat, audio, assets, store, phases, input, loop, hud(NEW), rocket(NEW)
hud.js    -> store, audio                    (NEW leaf — only main.js imports it)
rocket.js -> stage-two-lib, ship-fix         (NEW leaf — only main.js imports it)
phases.js -> launch, transition, combat, audio, store
input.js  -> audio, combat, transition, ship-fix, phases
loop.js   -> launch, transition, phases, input
combat.js -> lib, enemies, drone, boss, effects, pool, audio, launch, probes, arena-dressing
probes.js -> enemies, drone, boss, arena-dressing        (story-018 adds powerups)
enemies.js -> lib, pool   ·  boss.js -> lib, enemies, audio  ·  store.js -> (none)
```

The wiring rule that keeps it acyclic: hud.js and rocket.js receive EVERYTHING through the ONE
ctx object (`initHud(ctx)`, `initRocket(ctx)`); neither ever imports main.js, phases.js,
input.js or loop.js. ctx itself needs NO new properties except `CORRUPT_GLB` (appended to the
existing SPIN/DT_CLAMP/RESTART_N line) — `ui`, `probs`, `mark`, `spinRig`, `applySpinFix`,
`activeFix` (via the existing getter semantics) and the scene getters are already there.

### 6.4 Hard constraints and their proof

- **ZERO behavior change** — `node tools/flow-check.mjs`: all **114 asserts GREEN with
  `tools/flow-check.mjs` byte-identical** to the gate commit (no assert edited, added, or
  removed; the diff review verifies). The moves are verbatim: same statements, same order, same
  comments.
- **main.js ≤ 420 target** — predicted ≈ 240; dep-check prints the number (and enforces ≤ 500).
- **All files < 800 lines** — trivially held (largest file in the tree after R-c stays combat.js
  at 628).
- **Functions < 50 lines** — no new offender; boot() (80) is decomposed in commit 3 (6.6).
- **Nothing imports main.js / store isolated / acyclic** — dep-check.

### 6.5 Eval-order and boot-gate risk register (the naive-extraction hazards)

- **R-c1 — OVERLAY_ELMS cannot move without the `ui` map.** It closes over
  `ui.title/hud/gameover/…` at eval time (main.js 112–113). They move together into hud.js in
  the same internal order. DOM readiness is unchanged: the bundle script already evaluates after
  DOM parse (today's main.js module body does getElementById at 47–58 and works), and moving
  code between modules of the SAME script tick does not cross the parse boundary — only
  within-script evaluation order changes.
- **R-c2 — PERF_T0 is the boot-marks epoch and sits AFTER the imports** (main.js 28). Two new
  leaf imports add function/const-declaration eval only (sub-millisecond). MODULE→TITLE is
  measured FROM PERF_T0 (`boot-marks.mjs` `at('title')`), so the < 1000 ms gate is immune by
  construction; TRUE-wait (`navT0 + title`) gains < 1 ms. Verified, not assumed: the boot-marks
  run in the battery, compared against the pre-move headed output.
- **R-c3 — scene/rocket reads inside the moved code must be CALL-TIME.** prepareRocket reads
  `scene.environment` (212) and setupSpinViewer reads `rocket`/`scene` (285–294) — module-scope
  lets that boot() assigns asynchronously. In rocket.js they become `ctx.scene`/`ctx.rocket`
  getter reads at call time (the story-011 "never a stale copy" rule). Snapshotting them into a
  const at init is the one bug class that passes dep-check and breaks boot.
- **R-c4 — hud.js module body must not touch storage.** Only refreshRecordLine calls
  readHighscore, which is pre-warm-safe (returns 0). The title mark → storeStart ordering
  (§5.7) is untouched because the warm call site does not move.
- **R-c5 — probs stays in main.js** (see 6.2). Dragging it into a new module would force the new
  module to hold main-owned state at eval time.
- **R-c6 — GLTFLoader's import moves main → rocket.js.** esbuild bundles it identically (no
  module-scope side effects in the lib); the lib import line in main.js slims, same line count.
- **R-c7 — live bindings across the bundle.** spinRig is the only REASSIGNED binding that
  crosses the boundary. `export let` is spec-correct and esbuild-correct; the in-house
  mutation-only precedent (loop.js `fps` container) is the fallback. Reviewer picks one; both
  are behavior-neutral.

### 6.6 Verification battery (named, in order, run on EVERY commit of the refactor)

1. `npm run build` — esbuild absorbs the new modules into the single `index.html` (never
   hand-edited).
2. `node tools/dep-check.mjs` — prints the graph; expect acyclic + main.js ≈ 240 (limit 500).
3. `node tools/flow-check.mjs` — real headless Edge CDP run (budget several minutes);
   **114/114 GREEN, test file byte-identical** to the gate commit.
4. `node tools/boot-marks.mjs` — HEADED run; MODULE→TITLE inside the documented band (445 ms at
   story-011; GLB-variance band 158–2492 ms documented in §5.2), `phase:title` + `rocket:glb`,
   `CONSOLE []` clean.

Red-first mapping for a pure refactor: the pre-move build's green 114/114 plus its headed
boot-marks output IS the recorded baseline; any post-move red means the move changed behavior —
revert and bisect by commit. Commit/merge protocol: one commit per extraction — (1) hud.js,
(2) rocket.js, (3) boot() decomposed into three private helpers with identical statement order
and identical mark timing (renderer+lights / composer try-catch / UI wiring; each ≤ 50 lines —
closes the last >50 function in main.js). Each commit runs the full battery; merge `--no-ff`
and tag `good-2026-11-05-g` per the stage ledger's chain. **story-018 may not add a line to
main.js or hud.js until this merge lands** (the gate commit's order).

## 7. STAGE 4 — story-018 contracts: charged shot + pickups (src/powerups.js NEW)

### 7.1 src/powerups.js — ownership and exports

Header constants (owning-module convention — combat keeps the charged-shot's CHARGE_* consts
AND the effect knobs SPREAD_ARC = 6 (±6° three-bolt fan) / OVERDRIVE_DIV = 2.2 (fire interval
÷ 2.2) in its own const block — GDD §7 places them with the consumer): `DROP_CHANCE = 0.18`,
`PICKUP_LIFE = 8`, `PICKUP_BLINK = 2` (blink during the LAST 2 s), `PICKUP_RADIUS = 1.4`,
`EFFECT_T = 8`, `PICKUP_POOL = 6` (GDD §7 number — saturation steals the oldest slot — pool.js
semantics), and the kind set { SPREAD, OVERDRIVE, SHIELD }.

- **Pool**: `makePool` (pool.js, reuse-first) created ONCE in `preparePowerups(scene)`, called
  from combat.js `prepareCombat` beside prepareEnemies/prepareDrones/prepareBoss/
  prepareDressing — pickups join the entity **baseline** (restartProbe `clean:true` preserved;
  the baseline count RISES by 6 — expected and recorded, same-build comparison per the story-017
  precedent). The pre-warm allocates ALL PICKUP_POOL entities at prepare — spawn the full pool
  alive, then `clear()` (hide-never-dispose keeps them in the scene). Review-fix round
  2026-11-06: the original spawn+kill loop created ONE entity, not six — pool.js `spawn()` is
  reuse-first and re-handed back the just-killed item every iteration, so up to 5 Groups would
  have allocated MID-FIGHT at the pool's high-water mark; the harness pins the +6 via the
  powerupProbe's `baselinePickups` (red-first record: it read 1 pre-fix, evidence §7). Entity: a
  rotating pickup sprite (additive, `depthWrite:false` — the neon convention), userData
  `{ alive, kind, t }`.
- **`maybeDrop(pos)`** — the roll `Math.random() < DROP_CHANCE`, uniform kind, pool spawn. Call
  sites: ONLY the two bolt-kill sites in combat.js `boltsTick` (raider kill ~302–307, orb kill
  ~319–324). The rammer's self-kill lives inside enemies.js (~196–201) and story-018's file
  list does NOT include enemies.js — so **ram deaths do not roll drops**; "on kill" is read as
  "player-killed". GDD may widen it later (needs an enemies.js api hook — open item, §8.5).
- **`tickPowerups(dt, playerPos, api)`** — age/spin/blink; despawn at PICKUP_LIFE
  (`pool.kill`); pickup detection = **FULL-3D squared distance < PICKUP_RADIUS²** (the
  story-015 lesson: never XZ-only); on overlap `pool.kill(it)` + `api.picked(kind)`. The api is
  composed by combat.js — powerups.js never reads combat state (acyclic by construction).
- **`forceDropForProbe(pos, kind)`** — probe-only deterministic spawn (spawnForProbe precedent)
  for the kind/effect asserts. The 18% RATE assert runs REAL rolls over N scripted kills
  (scriptedKill pattern) inside a binomial band — widen trials, never bounds.
- **`clearPowerups()`** — `pool.clear()`; rides `clearCombat` beside clearEnemies/clearDrones/
  clearBoss/clearEffects (§8.6). `enterCombat` needs no re-show: pickups are hidden until
  dropped, like bolts.
- **Seeded-RNG note (honest flag):** there is NO seedable combat RNG in the tree today (bare
  `Math.random` in combat.js/enemies.js/boss.js), despite the story's "the combat RNG is
  already seedable". The contract above (forced probe spawns for determinism + real-roll
  binomial bands for rates) achieves the story's determinism goals without inventing an RNG
  util; if the GDD insists on seeding, that is a new util module — flag it, never sneak it.

### 7.2 Effect timers — owner: combat.js (the story pins it: "timer state lives in the combat.js player object")

`C` gains `powerT: { SPREAD: 0, OVERDRIVE: 0, SHIELD: 0 }` (seconds remaining per kind).
powerups.js is ENTITY-side only (drop/despawn/pickup-detection); combat.js is EFFECT-side:

- `applyEffect(kind)` (the `api.picked` target): `C.powerT[kind] = EFFECT_T`; SHIELD
  additionally refills `C.shield = SHIELD_MAX`.
- `tickCombat`: after the regen block, decrement all three; while SHIELD is active the regen
  gate treats `SHIELD_REGEN_DELAY` as 0; on a timer crossing zero the expiry side-effects fire
  (combat.js plays the expire blip via its existing audio imports — powerups.js stays
  sound-free; pickup blip likewise at `api.picked`).
- `fireTick`: SPREAD active → spawn 3 bolts at ±SPREAD_ARC° (SAME bolt pool, same BOLT_LIFE —
  no baseline change); OVERDRIVE active → `FIRE_INTERVAL / OVERDRIVE_DIV`. The charged shot
  branches in this same function (C.chargeT + CHARGE_* consts in combat.js's header; parameters
  pending the GDD): release-after-hold fires exactly ONE charged bolt that reuses the C.bolts
  pool (a stamped/heavier bolt, NOT a new pool — restartProbe entities stay stable); charging
  cancels on death (damagePlayer), pause (tickCombat halts), and combat exit (the
  clearCombat/enterCombat reset block); whichever regular-fire behavior the GDD chooses
  (suppressed vs continues) is pinned by a probe assert before implementation.
- `clearCombat` wipes C.powerT alongside the pool drain; `enterCombat`'s reset block zeroes it
  beside score/kills (the L453 pattern).

### 7.3 Harness surface (probes, combatState, HUD)

- `combatState()` gains `charge` (GDD-shaped charge state) and the active-effect fields (e.g.
  `power: { SPREAD: seconds|0, OVERDRIVE: …, SHIELD: … }`) — they reach the harness through the
  EXISTING `window.__stage2.combatState()` surface in main.js: **zero main.js change**.
- New probe pages `?chargeProbe=1` / `?powerupProbe=1`: drive ticks live in probes.js
  (`chargeProbeTick` / `powerupProbeTick`, called from tickCombat beside the existing drives;
  probes.js gains an import of powerups.js — acyclic; powerups.js never imports probes.js),
  report `window.__stage2.chargeProbe` / `.powerupProbe` + `api.report` lastReport parity,
  state reset in `resetProbes()` with the stale-delete window hygiene, per-page `CONSOLE []`.
  Ordering probes per the story: charge release during death slow-mo; a pickup taken during the
  boss fight (boss drops are EXEMPT — no drop call site in the boss path — but effects must
  still apply; OVERDRIVE matters most there).
- HUD (post-R-c only): the charge meter + effect chips are combat DOM writes in the
  change-gated hudBars style (combat.js owns combat HUD writes); the CONTROLS panel text and
  the hint bar live in hud.js's PANEL_HTML and `tools/index.template.html` (index.html is
  build output — never hand-edited). Audio: charge whine + pickup/expire blips as named synth
  recipes in audio.js (audio-bag pattern), played from combat.js call sites.

**Module edges:** powerups.js imports stage-two-lib + pool.js. Imported by combat.js (+probes.js
for the probe drive). combat.js CONSUMES from powerups: prepare/maybeDrop/tick/clear + the probe
force; combat.js PROVIDES to powerups: the `picked` api. Nothing imports main.js; store.js stays
isolated; dep-check acyclic.

## 8. STAGE 4 — story-019 contracts: elites, wave tables, telemetry, boss reward

### 8.1 Boss reward — SCORE_BOSS = 1000, placement and re-fire safety

Const `SCORE_BOSS = 1000` in combat.js's score-constants block (~62–66, beside
SCORE_DRONE/GUNNER/WAVE/OR — a named const, never a literal). **Award call site: the
bossApi.report wrapper in combat.js prepareCombat (~130–141)** — the same handler that owns the
exactly-once counter and the victory guard:

```
if (r && r.bossDefeated) {
  window.__stage2.bossDefeatedReports = (window.__stage2.bossDefeatedReports || 0) + 1;
  if (!C.dead && !C.victoryFired) { C.score += SCORE_BOSS; C.victoryFired = true; C.api.go('victory'); }
}
```

- **Ordering**: victory.enter reads `cs.score` synchronously inside the `go('victory')` call
  stack (phases.js ~102–106), so the award lands BEFORE the card freezes it — same-frame
  visibility, probe-pinned.
- **Exactly-once**: boss.js reports once (deathTick's B.dead latch, ~241–251); the award
  additionally rides the `!C.victoryFired` guard, so a forced second victory trigger cannot
  double-award (the re-fire probe pins it). Re-entry after victory: enterCombat zeroes C.score
  (L453) — restart class starts at 0. Highscore: victory.enter's
  `writeHighscore(Math.max(finalScore, readHighscore()))` picks the +1000 up with zero card
  edits (phases.js untouched, per the story).
- **Deviation to record**: the story file lists `src/boss.js — award call site only`, but the
  wrapper in combat.js IS the call site, and combat.js's own design comment pins "boss.js stays
  a pure signal source" — boss.js has no score access, threading one through the api would
  extend the api surface and split const ownership, and boss.js must not import combat.js
  (that edge is a cycle). **Recommendation: boss.js zero-diff; the story report records the
  deviation.** The alternative (an `api.addScore` called from boss.js deathTick) is rejected
  for those reasons.

### 8.2 Elite variants — src/enemies.js

Header consts (owning-module convention): `ELITE_MIN_WAVE = 4`, `ELITE_CHANCE = 0.22`,
`ELITE_SCALE = 1.35`, `ELITE_TINT = 0xffa02f`, `ELITE_HP_MULT = 3`, `ELITE_SPEED_MULT = 1.15`,
`ELITE_SCORE_MULT = 2` (EXPORTED — combat.js imports it for the kill site; enemies.js is
already a combat.js dep, so no new edge). The chance derives from the wave number
(`w >= ELITE_MIN_WAVE` roll per spawn), never a hand-written list (acceptance #18).

Per-spawn stamps in spawnRaider's elite branch: `u.elite`, `u.hp × 3`, `u.speedMult`,
`scale.setScalar(ELITE_SCALE)`, trim retint — and because the pool REUSES instances, **every
spawn RESETS scale/tint/elite** (normal spawns restore emissive 0xff3b2f and scale 1) so reuse
never leaks an elite skin. Steering consumes `u.speedMult` at the two E.speed sites (gunner
vRadial/vTang, rammer sp) — non-elites multiply by 1, zero diff. Contact radius: the spec does
not list one — recommend `u.r = R_RAIDER × ELITE_SCALE` pending the GDD (a ×1.35 model with a
0.9 hitbox reads unfair; open item, §8.5). Score ×2 applies at the combat.js kill sites via the
imported ELITE_SCORE_MULT.

### 8.3 Per-wave composition tables — src/enemies.js

Shape: a `WAVE_TABLE` const for waves 1..N (fields per the GDD: counts and kind mix), with the
EXISTING derived formulas (waveCount/waveSpeed/waveStagger/waveWobble/rammerShare) untouched as
the fallback beyond the boundary: `table[w] ?? derived(w)`. The enemies.js header TODAY says
"there is no per-wave table anywhere" — story-019 REWRITES that sentence to state the
table↔derivation boundary (a table row is design data under review, not a hand-kept selector in
a guard — the acceptance-#18 resolution), and flow-check pins the boundary wave BOTH ways
(w = N resolves from the table, w = N+1 from the derivation). `startWave` consumes resolved
values only. Elite × table: table counts are read pre-elite, the elite roll is a per-spawn
modifier (recommendation; the GDD states it — a "2 gunners" row with per-spawn elite rolls
otherwise silently yields 2 × HP×3 sponges).

### 8.4 Balance telemetry — the accumulator lives in combat.js

A module-level `const T = { kills: {gunner, rammer, orb}, eliteKills: 0, shots: 0, hits: 0,
dmg: {raider: 0, orb: 0, boss: 0}, powerPicks: {SPREAD, OVERDRIVE, SHIELD}, scoreBySource:
{…}, waveReached: 0, duration: 0 }` (exact field list per the GDD's open item). Plain number
fields; **event-driven writes ONLY** — increments at existing event sites, never per-frame
allocations or work in the render loop (the story's own risk note):

- shots: fireTick spawns (+1 per bolt; +1 per charged release). hits: the three bolt-scan hit
  branches (raider/orb/boss). kills: the existing C.kills sites (elite kills also count in
  their kind bucket — elite is a flag, not a kind). powerPicks: story-018's `api.picked`.
- damage-by-source: the per-frame api object literals at tickCombat (~483–485) ALREADY allocate
  fresh `{ damagePlayer, explosion }` objects every frame — wrap damagePlayer per caller: the
  ENEMIES api counts 'raider', the DRONES api 'orb', the C.bossApi 'boss'. damagePlayer keeps
  its signature, so probeDamagePlayer/deathFastForward are untouched.
- waveReached / score-by-source / duration read LIVE C state in the dump (C.wave, the per-site
  score increments incl. the boss award, C.time) — no duplicate counters. Known granularity
  limit: boss volleys ride E.bolts through the ENEMIES api (tickBolts), so boss-volley damage
  lands in the 'raider' bucket unless the GDD pays for an enemies.js source hook (open item).
- **Zeroing**: enterCombat's reset block (the L453 pattern) zeroes T beside score/kills — the
  restart-parity assert reads it back; the mutation "forget to zero on enterCombat" goes RED
  via that assert.
- **Exposure**: `combatState()` gains `telemetry: { …T }` (probe surface only; player-facing UI
  unchanged) — flows through the existing `window.__stage2.combatState()`; the scripted probe
  asserts every field with counts matching its own actions, no NaN/undefined.

### 8.5 Open items that gate implementation (the GDD pass — recorded in the ledger)

Charged-shot parameters + binding model (hold-fire vs hold-to-charge — the load-bearing design
risk); composition-table shape + boundary wave + pre/post-elite counts; which kinds can be
elite; elite contact radius; telemetry field-list granularity (boss-volley vs raider-bolt share
one api bucket today); whether ram deaths roll drops (default NO — enemies.js is not in
story-018's file list).

### 8.6 Contract summary (who provides/consumes what)

- **combat.js PROVIDES**: enterCombat/tickCombat/clearCombat (phases.js), combatState +
  probeDamagePlayer + deathFastForward (window.__stage2), the bossApi (boss.js), per-frame api
  objects (ENEMIES/DRONES ticks), probeEnv (probes.js) — and NEW for Stage 4: the POWERUPS
  prepare/maybeDrop/tick/clear calls + the `picked` api + the telemetry accumulator.
- **combat.js CONSUMES**: ENEMIES (waves/bolts/kill helpers), DRONES, BOSS
  (state/boltHit/hitBoss/alive/eligible/barLine), EFFECTS, pool, audio, launch
  (stageShip/combatFlow), probes (the drives + resetProbes), DRESSING, POWERUPS (new).
- **powerups.js IMPORTS**: stage-two-lib, pool.js. IMPORTED BY: combat.js, probes.js.
- **enemies.js IMPORTS**: lib, pool (+ nothing new). **probes.js IMPORTS gain**: powerups.js.
- Probes report on `window.__stage2`: `.chargeProbe` / `.powerupProbe` (story-018),
  `.telemetry` inside `combatState()` (story-019), always with `lastReport` parity and
  `resetProbes()` stale-delete hygiene. Pickups join the baseline pool created once in
  prepareCombat; clearCombat drains them; `restartProbe` stays `clean:true` with the baseline
  rise recorded same-build.
