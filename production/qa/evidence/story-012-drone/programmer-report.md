# Story 012 — Vi3W drone (third enemy, GLB-swap-ready) — programmer report

> Branch: `story-012-vi3w-drone` · Baseline: master fe3540b (== branch tip at start; the RED
> run therefore tested master's committed build) · Written 2026-11-04
> Status: **DONE** — all ACs machine-proven; both build paths probed; 2 mutations recorded.

## 1. What was implemented

1. **`src/drone.js` (new)** — the Vi3W drone, entity kind `'orb'`, own pool via `makePool`
   (pool.js untouched). Three parts per the story:
   - **Procedural silhouette**: torus ring (0.85 r) + octahedron core + 3 fins at 120° +
     a per-instance additive halo sprite (the `makeRaider` `glowMat` pattern). Cyan accents
     (0x7dd7ff) vs the raiders' orange — distinct at a glance by shape AND hue.
   - **Full-3D movement from day one**: velocity-first steering where y enters every term.
     Each drone owns a tilted orbit ring around the PLAYER — radius 12–20 u, plane tilted so
     the world y amplitude is exactly `yAmp` (tilt = acos(yAmp/r), yAmp ≤ 6 = design's
     `y ∈ ARENA_Y ± 6`), then telegraphed dives: flare + audio tick 0.6 s before the dive
     launches **along its orbit tangent** (tangent-heavy launch, aim-heavy 3D homing), dive
     contact = 25 damage (rammer rule, dies without score), HP 2, dive speed 26 u/s.
     **`grep -c ARENA_Y src/drone.js` = 0** — the player position is a parameter; no arena
     constant is baked into the module.
   - **Build-time swap**: `prepareDrones` reads `window.__DRONE_B64` once. Non-empty → decodes
     the GLB once (async), normalizes to 1.7 u, clones it as the pool maker — mode `'glb'`.
     Empty token or a failed/bad decode → procedural pool, logged loudly, never a crash.
     The pool exists only after the decode settles, so a session's drones are always ONE
     path — and `buildMode()` reports what actually flew.
2. **Wave integration (`src/combat.js`)** — drones join at the wave layer: `wavesTick` starts
   `DRONES.startWave(wave)` beside `ENEMIES.startWave`, the wave-clear condition now also
   waits on `DRONES.aliveCount()/queuedCount()`; **enemies.js's pure raider formula is
   untouched (file unmodified)**. Spawn rule `droneCountFor(w) = min(3, max(0, w−2))` — pure,
   exported, asserted through the probe surface. `combatState()` gains `drones` (live count,
   per AC) and `boss: null` (story-013's shape). Bolt×orb hit check is FULL 3D (the raiders'
   XZ check would hit a drone a ring-tilt above the bolt); kill = +200 (`SCORE_ORB`).
   `clearCombat` drains drones (`DRONES.clearDrones()`) on the same §8.6 path.
3. **Build swap (`tools/build.mjs` + one token in `tools/index.template.html`)** — when
   `build/drone.glb` exists it rides the same weld/dedup/prune/quantize `optimizeGlb`
   pipeline into `window.__DRONE_B64`; absent → empty token. `{{DRONE_B64}}` added to the
   leftover-token guard.
4. **Probe `?droneProbe=1`** — deterministic orb 12 u ahead of the nose at 0.4 s (fixed knobs
   r 14, yAmp 5, yaw 0, first dive 1.2 s), samples its full-3D path for ~3 s, reports on
   `window.__stage2.droneProbe`: `{ yRange, path3d{x,y,z,samples}, telegraph, dive, contact,
   droneBuild, meshParts, waveRule, raiderRule }` (+ `lastReport` via `api.report`, parity
   with scriptedKill). `droneProbeLive` is the screenshot runner's timing hook.
5. **`tools/drone-glb-probe.mjs` (committed evidence tool)** — synthesizes a minimal VALID
   GLB (hand-built glTF 2.0 JSON + BIN chunk, one triangulated tetra, no new npm deps),
   proves both paths end-to-end, restores the shipped state in a `finally`.

**Naming collision (pre-existing, left untouched per the story)**: enemies.js's `hitDrone`
(raider kill fn), `droneRadius` (raider radius) and combat.js's `SCORE_DRONE` (100 — the
raider rammer score) all predate the drone. The new module's kill fn is `hitOrb`, its score
`SCORE_ORB` (200), entity kind `'orb'` — no renames, no churn.

## 2. Both build paths — real probe outputs

Run: `node tools/drone-glb-probe.mjs` (full log: `drone-glb-both-paths.txt`).

**Path A — GLB staged** (`build/drone.glb` = synthesized 808-byte tetra, rebuilt):

```json
{"pass":"glb","droneBuild":"glb","tokenBuild":"glb","yRange":4.48,
 "path3d":{"x":6.66,"y":4.48,"z":12.8,"samples":82},"telegraph":true,"dive":true,
 "contact":true,"meshParts":1,"waveRule":[0,0,1,2,3],"raiderRule":[4,6,7,9],
 "consoleErrors":[],"ok":true}
```

**Path B — GLB removed, default build restored (the shipped state)**:

```json
{"pass":"proc","droneBuild":"proc","tokenBuild":"proc","yRange":4.27,
 "path3d":{"x":6.79,"y":4.27,"z":12.23,"samples":83},"telegraph":true,"dive":true,
 "contact":true,"meshParts":5,"waveRule":[0,0,1,2,3],"raiderRule":[4,6,7,9],
 "consoleErrors":[],"ok":true}
DRONE-GLB-PROBE PASS — both paths proven (glb: glb/1 parts, proc: proc/5 parts)
```

The **mesh visibly swaps**: `meshParts` 5 (ring+core+3 fins) → 1 (the GLB's mesh), with
`droneBuild`/token agreement asserted on both sides. The GLB here is the throwaway tetra
stand-in — the real Vi3W asset's look lands when the user exports `drone.glb` (out of scope
per the story). After pass B the GLB is removed and `index.html` is rebuilt from default
sources (`__DRONE_B64=""` verified in the shipped file; `build/drone.glb` absent).

## 3. kee red-before-green + mutations

**RED on master** — branch tip == master tip (fe3540b), so the first run tested master's
committed build with only the harness changed. Output: `flow-red-master.txt`
(**29 passed / 8 failed**). The 8 reds, each with its reason:
`wave 1 spawns zero drones` (drones=undefined — combatState has no drones field on master),
`droneProbe reports` (null — ?droneProbe unread, deadline expired), `drone 3D movement`
(undefined), `drone path spans` (null), `drone telegraphs then dives` (undefined),
`droneBuild matches` (undefined ≠ proc), `drone wave rule` (null), `raider wave rule` (null).
The 9th new assert, `wave 1 raider count unchanged (4)`, was **GREEN on master by design** —
the keep-passing guard. Harness note: the first red attempt crashed mid-run because a raw
`window.__stage2.droneProbe` read throws across `Page.navigate` (old context dies, new
document has no `__stage2` yet) — fixed with the same guarded pattern the boot poll uses;
no assert semantics changed.

**GREEN on branch**: `flow-green-branch.txt` **37 passed / 0 failed**, re-proven on the final
restored shipped build: `flow-green-final.txt` **37 passed / 0 failed** (28 original + 9 new).

**Mutations** (each: mutate → `npm run build` → full flow-check → revert → rebuild):

| # | Mutation (drone.js) | Result | Evidence |
| --- | --- | --- | --- |
| 1 | `droneCountFor`: `w − 2` → `w − 1` | RED `drone wave rule (0,0,1,2,3)` — waveRule `[0,1,2,3,3]`; keep-passing entry assert stays green (wave 1 still maps 0) — the pure-rule assert is what catches the flip | `flow-mutation-spawnrule.txt` (36 pass / 1 fail) |
| 2 | orbit tilt → `π/2` in BOTH spawn paths (ring flattened into XZ — y-amplitude zeroed) | RED `drone 3D movement (yRange > 1u)` — yRange `0` < 1; everything else green | `flow-mutation-yamp.txt` (36 pass / 1 fail) |

Both mutations were fully reverted and the final build re-gated (§ flow-green-final).

## 4. Probe set (all 2026-11-04, against the shipped build)

| Probe | Result |
| --- | --- |
| `node tools/flow-check.mjs` | **37/37 PASS**, `CONSOLE []` (twice: post-green + final) |
| `?goto=combat&restartProbe=3` | **`RESTART_PROBE {"runs":3,"clean":true}`**, entries all `{hp:100, shield:50, score:0, wave:1, particles:0, bolts:0, entities:25}` — the drone drain rides clearCombat; `restartProbe=1` shows clean:false BY DESIGN (run 1 primes the baseline) |
| `?goto=combat&scriptedKill=1` ×2 | scripted bolt kill lands both runs (`lastReport.scriptedKill` present); kills 2 / score 250 then kills 2 / score 200 — the volley's extra catches are pre-existing run-to-run RNG (the orb scan iterates an empty pool at drones 0; the raider scan is byte-identical to master) |
| `?goto=launch` | `phase:ascent`, `rocket:glb`, `CONSOLE []` |
| `?goto=transition` | walk completed into combat (`combatEntries:1`, lastReport beat B4), `CONSOLE []` (natural death inside the window — expected under live combat) |
| `?goto=combat` | combat entered, `CONSOLE []` (natural death inside the window — expected) |
| `?corruptGlb=1` | `rocket:fallback`, boots to title; 2 logged errors = the DESIGNED never-crash degrade (story-011 parity) |
| `?spin=1` | spin viewer on the GLB rocket, `CONSOLE []` |
| `tools/combat-probe.mjs` | pause-freeze, pause-audio, resume, mute, holdfire (8 bolts), honest HUD — **6/6 PASS**, `CONSOLE []` |
| `tools/death-card-check.mjs` | CELL_A 148 ms card, C_OFF no-op, C_ON → combat entries 2, CELL_D shows 1/hides 1 — `CONSOLE []` |
| `tools/boot-marks.mjs` (headed, RTX 3060) | MODULE → TITLE 2492 / 357 ms (GLB-parse cache variance band; master measured 1442 under the same variance), `storeStart` after `title` (story-007 contract), `CONSOLE []` |
| `node tools/dep-check.mjs` | **PASS** — acyclic; new edges `combat.js → drone.js`, `drone.js → audio.js, pool.js`; main.js 500/500 |

**droneProbe sample (branch, proc)**: `yRange 4.31–4.48` across runs (> 1 u = the 3D proof;
raiders never leave XZ), `path3d {x≈6.7, y≈4.3, z≈12.2, samples 81–103}`, `telegraph true`,
`dive true`, `contact true` (the probe drone dives through the stationary ship — the ram
contact works), `droneBuild 'proc'`, `meshParts 5`.

**Screenshot**: `s12-drone.png` — the procedural drone in frame (cyan ring + core + halo,
telegraph flare, ~13 u ahead against the planet), captured by `tools/drone-glb-probe.mjs`
pass B while `droneProbeLive` was open.

## 5. Files changed (exact paths)

- `src/drone.js` — **new**, the Vi3W drone module
- `src/combat.js` — wave-layer integration, orb bolt scan, drones/boss probe fields, drone probe, clear-drones drain
- `tools/build.mjs` — `build/drone.glb` build-time swap into `window.__DRONE_B64`
- `tools/index.template.html` — the `__DRONE_B64` token only
- `tools/flow-check.mjs` — 9 new asserts (2 entry keep-passing + 7 probe) + RED/mutation records
- `tools/drone-glb-probe.mjs` — **new**, committed both-paths evidence tool (GLB synthesizer included)
- `index.html` — regenerated by the build only (4.35 MB)
- `production/qa/evidence/story-012-drone/` — this report, 6 flow logs, both-paths log, screenshot

Untouched by design: `src/pool.js` (fenced), `src/enemies.js` (pure raider formula — file
unmodified), main.js (no ctx changes needed), story-013 boss work, story-019 tables.

## 6. Self-review findings / reported judgment calls

1. **`combatState().drones` is the LIVE count** (AC wording) while `enemies` counts
   alive+queued — the semantic difference is documented at the field; story-013 reads
   `boss: null` from this same shape.
2. **drone.js imports `beep` directly from audio.js** (enemies.js takes an `api` object
   instead) — the telegraph tick is part of the dive controller's own state machine;
   audio.js imports nothing local, dep-check stays acyclic. Reported, not silent.
3. **GLB drones get the halo flare but not the proc drones' spin/pulse idle animation** —
   part refs can't survive `Object3D.clone` (it JSON-copies userData; THREE refs would
   throw — the template is userData-scrubbed at prep). The GLB owns its own look; when the
   real Vi3W export lands, its animation comes with the asset.
4. **Drone-vs-drone separation is NOT implemented** (raiders push apart pairwise): ≤ 3 drones
   on independently tilted rings overlap only transiently, and the story doesn't ask for it.
   Flagged as a tuning follow-up if wave-3+ crowding reads badly.
5. **The dive is tangent-launched then 3D-homing** — the design's "dives through the player's
   position along its orbit tangent" is implemented as a tangent-heavy launch blended into
   aim-homing (a pure tangent can miss; a pure aim is a dead-stop face-turn).
6. **scriptedKill kill-count variance (2 vs the historical 1)** — pre-existing bolt-volley
   RNG, not a story-012 regression: the orb scan is inert at drones 0 and the raider scan is
   unchanged; verified by two runs on the same build (250 / 200) and by the code diff.
7. `restartProbe=1` shows `clean:false` BY DESIGN (run 1 primes the baseline) — the gate is
   `restartProbe=3` → `clean:true`, recorded above.
