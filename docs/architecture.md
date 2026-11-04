# Architecture — STAGE TWO (as of Stage 2 close, 2026-11-05)

Written for **Stage 3 — full 3D flight** (story-015 pitch+drift → 016 spherical arena → 017
world goes 3D). Every claim below is grounded in the cited file read at Stage 2 close; items
not verified by code are marked UNVERIFIED. Scope line and conventions:
`one-shot-work/stage-2/PROGRESS.md` lines 74–80. Identity/pillars: `design/game-brief.md`.

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
