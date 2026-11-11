# STAGE TWO → "Deep Space" Master Plan, v2

This replaces v1. It keeps v1's stories, IDs and repo protocol. It changes the order, the gate, and the places where v1 would have built the same code twice.

I wrote it from the three session write-ups without the repo open. Anything that depends on code I have not read is marked **Check**.

## 1. Where things stand

- Branch `story-7.5`, workspace clean. Story 7.5 is mapped but not started.
- The smoke check is not green. It ended in `phase: gameover` (idle ship killed at about 24 fps, `deathBy: bolt`) where it expects `phase: combat`. Nothing counts as verified until task 0.3 lands.
- Headless boot took 60.6 s. Every battery run pays that, and nobody has measured what a player pays.
- Stage 6 already shipped the boss HP bar element, the wave banner, kill-only hit markers and spatial audio (listener and panner). Work on those is an upgrade.
- Nothing from the No Man's Sky proposal has been built.
- The stack stays three.js 0.187 + Web Audio + esbuild, with single-file output.

## 2. Decisions

D1–D5 are from v1. D6–D9 are new. The last column shows what each one holds up, so only D9 needs an answer before work starts.

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| D1 | Single-file build and its budget (`index.html` is 4.9 MB today) | Keep single-file. Set two caps: file size ≤ 12 MB, and a boot-time cap taken from the 0.5 baseline. The build fails when either is exceeded (0.6). | M3 |
| D2 | Lift "zero new art assets" and NO-NEW-DEPS | Procedural first; add a CC0 asset only where the procedural version fails your eye or ear. Each asset gets a `CREDITS.md` line with source, license and size. The extra addon is probably unnecessary (see V3). No physics engine. | M3 |
| D3 | Boundary: polish the 80 u sphere (7.6) or open space (7.3) | Do 7.6 small. Its warning logic becomes the outer-shell warning in 7.3. | M1 |
| D4 | How far "like No Man's Sky" goes | In: 6DOF flight, pulse drive, open space, scanning, heat encounters, mining, living skybox. Out: planet landing, on-foot, base building, multiplayer. | M4 |
| D5 | Who playtests | You, 5 minutes after each story. | all |
| D6 | What ships as 1.0 | M1–M3 (solid arena, flight v2, look and sound). The world loop ships as 1.1. It carries the most design risk and no release task depends on it. | Release |
| D7 | Reference machine and browsers | Name one machine and resolution for the 60 fps gate, and list the browsers you support. The browser list also sets the audio file format (A1). | 0.7, M3 |
| D8 | Key map | Space is boost today, and the proposal also puts pulse on Space. Keep Space as boost and give pulse its own key (Shift, if free). Put one binding table in the repo covering Q/E roll, Z flight assist, C scanner and pulse. **Check** the 12 existing bindings for clashes. | M2 |
| D9 | Do rocks stop bolts and enemies? | Bolts from both sides stop on rocks, so rocks become cover. Enemies ignore rocks for now; log that as a known tell. | 7.5 |

## 3. Order

Each milestone ends on a tagged build that could ship. If work stops after any of them, nothing is left half-done.

| Milestone | Stories | Ends with |
|---|---|---|
| Phase 0: a gate you can trust | 0.1–0.8 | Battery green with no env var set; baseline row in `LEDGER.md` |
| M1: Solid arena | 7.5, 7.6, 7.7a | Real rocks, no blue dome, HUD that scales |
| M2: Flight v2 | 7.1a, 7.1b, 7.7b, 7.2, V2, 7.3 | 6DOF, flight assist, open space, pulse |
| M3: Look and sound | S0, V1, V3–V9, A1–A4 | All effects on at 60 fps on the D7 machine |
| Release 1.0 | UI polish, W4–W7, TD sweep | Tag `release-1.0` |
| M4: World (1.1) | Loop spike, WD1–WD5 | Scan, heat, discovery, mining |

Within M3, the V stories and the A stories can run in parallel on separate branches, one writer per branch.

## 4. Rules for every story

Kept from v1:

- One story per session, on its own branch from the last good tag. Before code: the plan in 3 bullets, plus "what could break".
- Red first: the new check fails on the old build before the fix lands.
- Battery after every step: `npm run build` → `node tools/dep-check.mjs` → `node tools/flow-check.mjs` → smoke check → the story's own probe. Set `EDGE` to the 157 binary until 0.1 lands.
- `index.html` is build output only. No per-frame allocations. Restart-clean holds. `main.js` stays ≤ 500 lines.
- Never weaken an assert unless the story names it as a dated, sanctioned rewrite.
- Screenshots go to `build/shots/` and you judge them. Merge `--no-ff`, tag `good-YYYY-MM-DD-*`, update `LEDGER.md`.

Added:

- **Name asserts, don't number them.** v1 cites `flow-check:1167` and `combat.js:295-312`. Those line numbers go stale as soon as one story lands. Cite the assert's label or message string.
- **List sanctioned assert changes before coding**, with old and new values.
- **New probes go in their own file** (for example `tools/probes/<story>.mjs`), registered from flow-check. Parallel branches then stop colliding in one 1,700-line file. **Check** that the harness can load them this way.
- **`tickCombat` gains one-line hook calls only.** It is already the busiest node in the graph (25 edges). New systems are leaf modules, as `flight.js` is specified to be.
- **Budgets are asserts.** Payload size, `main.js` line count and boot marks are checked by a script in the battery.
- **Every effect has a kill-switch const** and respects the reduce-flash and reduce-shake settings from S0.

## 5. Phase 0: a gate you can trust

| ID | Task | Done when |
|---|---|---|
| 0.1 | Resolve the Edge binary dynamically (latest `EdgeCore\*\msedge.exe`; `EDGE` stays as an override) (TD-016) | Battery runs with no env var set |
| 0.2 | Delete the ~1 GB of `build/.edge-profile-*` litter, with your OK (TD-008). Clean the profile on harness exit. | Litter does not return after a battery run |
| 0.3 | Smoke check asserts that combat **was entered**, plus `rocket: glb` and `CONSOLE []`. It stops asserting the phase at the 65 s mark. | Passes whether or not the idle ship dies afterwards |
| 0.5 | Find where the 60 s boot goes, using `tools/boot-marks.mjs`. Measure a headed run with GPU as well as headless. | Both numbers recorded with the slowest step named |
| 0.6 | `tools/budget-check.mjs`: payload bytes, `main.js` lines, boot marks. Added to the battery. | Fails red when a cap is broken on purpose |
| 0.7 | Performance probe: headed, GPU on, scripted 60 s of combat. Records 95th-percentile frame time and worst frame. | Number recorded on the D7 machine |
| 0.8 | Three small robustness fixes pulled forward from v1's Phases 4 and 7, one story each: TD-015 (a Web Audio error can abort a phase change), TD-013 (composer render has no fallback), TD-010 (tunnel texture never disposed) | Each has a red-first check |
| 0.4 | Baseline row in `LEDGER.md`: boot (headed and headless), frame time, payload, assert count. Run this last. | Row written |

Notes:

- **0.3 replaces v1's `?invuln=1` idea.** A latched "combat was entered" check needs no cheat flag in the shipped file. If a debug flag is ever added, strip it with an esbuild `define` and assert that the string is absent from `index.html`.
- **0.5 may reorder everything.** If a headed boot on real hardware is also slow, that is a player-facing bug and comes before M1. If only headless is slow, it is a test-speed cost and can wait.
- **0.7 exists because headless runs at about 24 fps.** That cannot gate a 60 fps target, and v1 had no other measurement.

## 6. M1: Solid arena

### Story 7.5: asteroids that are real (current branch)

Mapped in the session and still valid:

- The ship moves by `C.pos += C.vel·dt`, and `C.vel` eases toward `forward·C.speed`. `C.vel` is the effective velocity.
- The ambient field group rotates at 0.005 rad/s about world Y. Collision rotates local rock positions by the group angle using cos/sin, with no allocation.
- Lane rocks are `L.rocksA` and `L.rocksB` in `launch.js`. The 3 far wrecks are separate and stay visible.

Steps:

1. **Field.** `AMBIENT_FIELD_COUNT` 120 → 40. Scale is `0.8 + rng()·2.7`. That uses one draw per rock, as before, and tops out at 3.5. v1's `Math.min(3.5, 0.8 + rng()·3.6)` would put a quarter of the rocks at exactly 3.5. Store each rock's collision radius. **Check** whether anything else draws from the same PRNG stream after the field. If so, 80 fewer rocks shifts its values; give the field its own seeded stream.
2. **Lane rocks.** Hide in `enterCombat`. Show again in `clearCombat` and `resetStage`. Never dispose.
3. **`collideRocks(pos, vel, now, onCrash)`**, called right after `steer(dt)`:
   - Test the frame's movement segment against each rock, as the bolts already do. An end-position overlap test lets small rocks pass between frames at 24 fps headless, and later at pulse speed.
   - Push the ship out every frame. Reflect velocity only when it points into the rock: restitution 0.4, keep 0.85.
   - Damage scales with the speed along the contact normal. Below a threshold it is a scrape: push out, no damage. v1's `clamp(v, 5, 25)` charges 5 hull for resting against a rock.
   - The 0.6 s cooldown applies to damage only.
4. **`onRockCrash`:** `damagePlayer(amount, 'rock')`, `shake(0.6)`, pooled explosion at the contact point (module-level temp vector, never `C.tmp`), `C.speed *= 0.5`. Add `rock: 0` to `damageTaken`.
5. **Bolts stop on rocks** if D9 is yes. Otherwise log it in the tech-debt register.
6. **Tests** (sanctioned rewrite: ambient count assert ≥ 100 → ≥ 40):
   - Crash probe: ship ends outside the rock, shield or hull dropped, no second damage within 0.6 s. Read the rock's world position from the game at probe time, because the field rotates.
   - Held-throttle probe: fly into a rock and hold throttle for 2 s. The velocity ease pulls `C.vel` back toward the nose within about a quarter of a second, so the bounce alone will not keep the ship off the rock. Assert it never ends a frame inside the rock and takes no more than the cooldown allows.
   - Large-step probe: one 100 ms step at top speed does not pass through a rock.
   - `flightProbe` and `pitchProbe` finish with `damageTaken.rock === 0`. **Check** that their paths stay clear at any field angle, since the angle depends on elapsed time.
   - The asserts that enumerate `damageTaken` keys still pass with the fifth key.

### Story 7.6: boundary, small version (per D3)

- Remove the additive blue shell mesh and its driver. Keep the rim ring, the bleed and the hard clamp.
- Two-stage `#warn`: `APPROACHING ZONE EDGE` (r 60–72), then `END OF COMBAT ZONE — TURN BACK` with a `.danger` class (r ≥ 72).
- Thresholds are named constants so 7.3 can point them at the outer shell.
- Add a small gap between on and off (on at 60, off at 57) so the text does not flicker when the ship skims the edge.
- Tests: remove the shell-only asserts (sanctioned). Assert the stage-one text at r = 65 and the `TURN BACK` text at r = 75.

### Story 7.7a: HUD that scales

The parts of v1's 7.7 that do not depend on the camera: `--u` responsive units, dark glass panels and text outlines, numbers on the meters, `#tele` showing real speed `|vel|`. Update the element-budget rule if needed (sanctioned).

The gun sight, lock bracket and charge ring move to 7.7b in M2. Story 7.1 changes the camera they are drawn against, so building them now means verifying them twice.

## 7. M2: Flight v2 (per `STAGE-7-FLIGHT-V2.md`)

| Story | Scope | Feel contract |
|---|---|---|
| 7.1a | Move input reading and camera pose out of `combat.js` into leaf modules. No behaviour change, no assert changes. | Battery identical |
| 7.1b | `src/flight.js`: quaternion 6DOF, full loops, Q/E roll, camera follows 40% of roll, speed FOV 62 → 74° | F1–F4, F7, F8 |
| 7.7b | Gun sight: pipper with an amber `.locked` state, reticle secondary, charge ring in its own colour with `CHARGING` text, lock bracket sized to the target with a distance readout | Human verdict |
| 7.2 | Inertia and Flight Assist toggle (Z). FA-off keeps ≥ 98% speed. Strafe thrusters. | F5, F6 |
| V2 | Space dust: one `Points` cloud wrapped around the camera, stretching into streaks at speed | Human verdict |
| 7.3 | Open space and pulse drive: no clamp outside the boss room, outer bleed at 3000 u, 0 → 240 u/s in ≤ 3 s, cancelled by damage | F9, F10 |

Notes:

- **7.1a is new.** 7.1b replaces both input and camera. If the extraction and the replacement land together and the battery goes red, there is no telling which one broke it. **Check** whether the Stage 7 spec already splits it this way.
- **7.1b supersedes FIX_PLAN rule 5** (do not touch camera geometry). Record that in the story. Re-verify the 7.4 aim (camera-axis lock, 28 u converge) against the new camera. v1's 7.4 follow-ups belong here too: boss point-sample sweep, homing and grace mutation tests, the elite hitbox decision.
- **7.2 changes the rock bounce.** With flight assist off, nothing eases velocity back to the nose, so the 7.5 bounce plays out in full. Retune and rerun the crash probes.
- **V2 comes before 7.3.** Empty space gives no visual reference for 240 u/s, so the pulse cannot get a fair feel verdict without dust.

Write these into the 7.3 story before any code:

1. **Rocks at pulse speed.** 240 u/s is 4 u per frame at 60 fps and 10 u at 24 fps, against rocks of radius 0.8–3.5. Rerun the 7.5 large-step probe at pulse speed.
2. **Celestial bodies.** At 240 u/s the ship covers 3000 u in 12.5 s. Decide what happens when the player flies at the gas planet, the black hole and the far wrecks: either they are drawn at a fixed distance from the camera and can never be reached, or they get a collision or kill volume. **Check** where they sit today.
3. **Encounter rules.** Raider behaviour was tuned inside an 80 u sphere. State where waves spawn relative to the player, what enemies do when outrun, and whether pulse is available while a wave is alive. **Check** the Stage 7 spec; if it is silent, write the rule first.
4. **Rock field.** 40 rocks in the 80 u arena leaves the rest of a 3000 u space empty. Either the field follows the player (recycle rocks that fall behind, pooled) or open space is deliberately empty between points of interest.
5. **Key map** (D8).

## 8. M3: Look and sound (needs D1, D2, D7)

One story per row. Each records before and after frame time from the 0.7 probe, and a before and after screenshot.

**S0, first:** settings flags for reduce-flash, reduce-shake and volume, read from `store.js`. This is the data half of v1's W4. Doing it now means V5 and V6 respect the flags as they are built. The settings screen stays in Release.

| ID | Upgrade | Approach |
|---|---|---|
| V1 | Living skybox: nebula, dense stars, galaxy band | Procedural fbm shader, baked once at boot into a cube render target so it costs nothing per frame. If you want a photo sky instead, use one JPG or WebP under 500 KB. Not KTX2: it needs the Basis transcoder inlined and another addon. |
| V3 | Metal that reflects | PMREM environment map generated from the V1 cube. `PMREMGenerator` is in three core, so this needs no new addon. **Check** that hull and drone materials are standard PBR materials. |
| V4 | Bolt trails and muzzle flash | Pooled ribbons in one shared geometry (one draw call for all bolts); additive flash sprite at the hardpoints |
| V5 | Explosions in 4 stages | Core flash → additive shockwave ring → spark debris with drag → brief point light. All pooled. The lights are a fixed pool of 2 that stay in the scene at intensity 0. Adding or removing a light changes the light count and makes three.js recompile shaders, which shows as a hitch. |
| V6 | Hit-stop and juice | 30–50 ms freeze of simulation time (not audio, not rendering) on charged hits, elite kills and boss-node hits. No retrigger within 150 ms, so overdrive kills do not stutter. Off under probes and under reduce-flash. Small FOV kick on boost. |
| V7 | Engine plume | Animated shader jet scaled by throttle, boost and pulse |
| V8 | Asteroid look | Vertex-noise-deformed geometry in 3 variants (zero bytes), or CC0 textures from ambientCG. The collision radius from 7.5 must still enclose the deformed mesh. |
| V9 | Post stack tune | Bloom retune, tone-mapping exposure, subtle vignette and grain. Do this last, against the full effect load. |

| ID | Upgrade | Approach |
|---|---|---|
| A1 | Music: cruise pads crossfading to combat arps, boss and victory cues | Extend the procedural `music-seq.js` with layers driven by one intensity value (zero bytes). Add CC0 loops only if that fails a listen test. Choose the file format from the D7 browser list; OGG support in Safari depends on the version. |
| A2 | Sub-bass on explosions, pulse ignition and crashes | 40–80 Hz sine thump layered on the existing sounds |
| A3 | Low-hull muffle below 25% hull, plus heartbeat | `BiquadFilter` low-pass on the existing bus |
| A4 | Spatial upgrade for enemy fire, fly-bys and rock crashes | Reuse the Stage 6 listener feed |

A5 from v1 (TD-015) moved to 0.8.

M3 exit: all effects on, 95th-percentile frame time within the 60 fps budget on the D7 machine, DPR auto-degrade still working, TD-009 (per-frame pip strings) fixed.

## 9. Release 1.0 (LAUNCH-10-10 W4–W7)

UI polish, each small and independent:

- Favicon. Remove the `BUILD S4 · VI3W POWERED` dev chip. Controls hint as key-cap chips, using the D8 table. Pause card in the same chrome as the other cards.
- Death and victory cards: animated score tally, stats from telemetry (accuracy, kills by type), new-record flourish.
- Show `—` instead of `RECORD 0` until storage warms.
- Directional damage chevrons pointing at the attacker.
- Boss bar: full width with phase ticks (the element exists).
- Stale `#tele` after REPLAY (TD-014).

Then:

- W4 (story-020): settings screen and accessibility on top of S0: volume sliders, invert pitch, flight-assist default, reduced flashing and shake.
- W5: stage close gate.
- W6: README, public build, screenshots and GIF.
- TD-018/019/020: doc and content sweep.
- TD-007: rewrite the git identity. This changes every commit hash and invalidates existing tags. Do it once, with no story branches open, after a backup.
- W7: release-lead and auditors, then tag `release-1.0`.

## 10. M4: World and discovery (1.1, needs D4)

v1 numbered these W1–W5, which collides with the launch items W4–W7. They are WD1–WD5 here.

v1 lists features without saying how they connect. Scanning, mining and heat need a reason to exist, or they are a checklist. Before building anything, write the loop in one paragraph and get your sign-off. Suggested minimum, with no new economy: scan to find a point of interest → going there raises heat → the reward is ore, which feeds the powerups and score that already exist → heat thresholds bring the harder fights.

Then build WD1 and WD3 as a throwaway spike and play it. Commit to the rest only if the loop is fun.

| ID | Feature | Contract |
|---|---|---|
| WD1 | Scanner ping (C): expanding sphere pulse that tags wrecks, ore rocks and beacons with HUD markers | F12 (scan) |
| WD3 | Heat encounters: each kill adds heat; thresholds 3/6/9 spawn patrol, wing, warden once per crossing | F11 |
| WD2 | Discovery catalogue that survives reload and shows on the title screen. Add a version field to the `store.js` save data first, with a migration for existing high scores. | F12 (persist) |
| WD5 | Points of interest: derelict freighter, beacon and station silhouettes, placed by seeded PRNG | Deterministic seed |
| WD4 | Mining: ore rocks take bolt damage, break into chunks, drop pickups. New scope; needs your OK. | New probe |

## 11. Risks

| Risk | Where | Mitigation |
|---|---|---|
| Flight v2 breaks the 7.4 aim | 7.1b | 7.1a isolates the change; aim probes rerun; human verdict |
| Timing-dependent probes flake at 24 fps headless | 7.5 onward | Probes read live positions; large-step probe; 0.7 covers real frame rate |
| Payload and boot time creep | M3 | 0.6 fails the build; procedural first (D2) |
| Shader recompile hitches | V5 | Fixed light pool |
| `combat.js` and `main.js` grow past their limits | every story | One-line hooks, leaf modules, line count in 0.6 |
| Open space breaks enemy behaviour | 7.3 | Encounter rules written before code |
| World features are not fun together | M4 | Loop paragraph and spike before commitment |

## 12. Gate at each milestone

- Full battery green with raw output shown; red-first proof recorded per story.
- Smoke check passes under 0.3; budget check passes; frame time recorded.
- You play 5 minutes and give a verdict (PASS / TUNE / FAIL).
- `LEDGER.md` row with boot, frame time and payload against the 0.4 baseline.

## 13. What changed from v1

1. Release moved ahead of the world features (D6). In v1 it came after everything, including the features with no defined loop.
2. 7.7 is split so the gun sight is built once, after the camera changes.
3. 7.1 is split into an extraction with no behaviour change and the quaternion swap.
4. Dust (V2) moved ahead of pulse (7.3), which needs it to be judged.
5. The smoke check asserts that combat was entered, with no invulnerability flag in the shipped file.
6. Phase 0 gained a boot-time investigation, budget asserts, a headed performance probe and three crash-risk fixes.
7. 7.5 gained a swept collision test, impact-based damage, an even rock-size spread, and probes for held throttle and large steps.
8. 7.3 gained five preconditions: rocks at pulse speed, reachable celestial bodies, encounter rules, the rock field, and the key map.
9. Four new decisions: what 1.0 is, the reference machine, the key map, and whether rocks block bolts.
10. Visual and audio stories default to procedural, which may make the D2 addon exception unnecessary.
11. Effort estimates are dropped. The order and the per-milestone cut lines replace them.
