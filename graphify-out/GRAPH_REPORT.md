# Graph Report - Game Build  (2026-11-09)

## Corpus Check
- 65 files · ~38,677 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 765 nodes · 1470 edges · 40 communities (36 shown, 4 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 84 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Audio synthesis engine
- Combat audio drivers
- Release & changelog history
- Balance probes & telemetry
- three.js engine internals
- Enemy pool & waves
- Boot & setting restore
- Boss fight entity
- Rocket model handling
- Launch sequence & ambience
- Arena dressing
- Drone entity
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39

## God Nodes (most connected - your core abstractions)
1. `beep()` - 26 edges
2. `tickCombat()` - 25 edges
3. `noiseBurst()` - 22 edges
4. `boot()` - 19 edges
5. `getC()` - 15 edges
6. `sweep()` - 13 edges
7. `tickTransition()` - 13 edges
8. `wireUi()` - 12 edges
9. `fireProbeTick()` - 12 edges
10. `Tech-debt register (TD-001..TD-020)` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Stage 6 changelog entry (experience polish)` --references--> `Stage 6 polish plan (chair synthesis)`  [INFERRED]
  CHANGELOG.md → production/polish/polish-plan.md
- `W1: aim overhaul` --references--> `Pillar: "controls that FEEL right"`  [INFERRED]
  production/polish/polish-plan.md → design/game-brief.md
- `GDD: Stage 4 balance + telemetry` --references--> `R-c main.js refactor (hud.js/rocket.js)`  [INFERRED]
  design/gdd/stage-4-balance.md → docs/architecture.md
- `Charged-shot threshold model` --references--> `Charged-shot threshold model (T_CHARGE 0.6 s, dmg 6)`  [INFERRED]
  README.md → design/gdd/stage-4-balance.md
- `Stage 6 chair scope (in/out of scope)` --references--> `Stage 6 experience scope note (supersession record)`  [INFERRED]
  production/polish/scope.md → design/gdd/stage-6-experience.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Stage-6 polish story set (T1/W1/H1/A1a/A1b)** — production_polish_polish_plan_t1, production_polish_polish_plan_w1, production_polish_polish_plan_h1, production_polish_polish_plan_a1a, production_polish_polish_plan_a1b [EXTRACTED 1.00]
- **Stage-3 full-3D-flight stories (015/016/017)** — design_gdd_full_3d_flight_story015, design_gdd_full_3d_flight_story016, design_gdd_full_3d_flight_story017 [EXTRACTED 1.00]
- **Stage-6 domain audit corpus (audio/UX/visual/scope)** — production_polish_audio_audit_audit, production_polish_ux_audit_audit, production_polish_visual_audit_audit, production_polish_scope_stage6_scope [EXTRACTED 1.00]

## Communities (40 total, 4 thin omitted)

### Community 0 - "Audio synthesis engine"
Cohesion: 0.06
Nodes (64): alarmActive(), beep(), bossStinger(), chargeRelease(), chargeWhine(), clamp01(), crossfadeTo(), dataUrlBytes() (+56 more)

### Community 1 - "Combat audio drivers"
Cohesion: 0.06
Nodes (48): alarmTick(), musicEvict(), musicSetDuck(), proximityTick(), setListener(), C, clamp(), clearCombat() (+40 more)

### Community 2 - "Release & changelog history"
Cohesion: 0.05
Nodes (41): Merge-halt finding (Math.random batch clustering), Stage 2 changelog entry (boss + victory), Stage 4 changelog entry (balance + telemetry), Stage 5 changelog entry (ship prep), Stage 6 changelog entry (experience polish), good-* known-good tag chain, Architecture map (src modules), Project instructions / studio setup (+33 more)

### Community 3 - "Balance probes & telemetry"
Cohesion: 0.08
Nodes (41): balanceProbeTick(), BL, freezeShip(), latchBalance(), noseSeat(), qs, readElite(), resetBalanceProbe() (+33 more)

### Community 4 - "three.js engine internals"
Cohesion: 0.06
Nodes (27): dependencies, three@0.187.0, description, devDependencies, esbuild@0.28.2, @gltf-transform/core@^4.5.1, @gltf-transform/extensions@^4.5.1, @gltf-transform/functions@^4.5.1 (+19 more)

### Community 5 - "Enemy pool & waves"
Cohesion: 0.08
Nodes (27): E, ELITE_CHANCE, ELITE_HP_MULT, ELITE_MIN_WAVE, ELITE_SCALE, ELITE_SCORE_MULT, ELITE_SPEED_MULT, ELITE_TINT (+19 more)

### Community 6 - "Boot & setting restore"
Cohesion: 0.09
Nodes (20): restoreLock(), isAudioLive(), restoreMuted(), composerIsDead(), boot(), countMeshes(), ctx, entities() (+12 more)

### Community 7 - "Boss fight entity"
Cohesion: 0.09
Nodes (19): applyDamage(), ARENA_O, B, BOSS_WAVE, buildBoss(), dashTick(), deathTick(), fireVolleyRound() (+11 more)

### Community 8 - "Rocket model handling"
Cohesion: 0.12
Nodes (26): activeFix, applyShipFix(), applySpinFix(), b64ToArrayBuffer(), initRocket(), loadPropRocket(), loadRocket(), makeFallbackRocket() (+18 more)

### Community 9 - "Launch sequence & ambience"
Cohesion: 0.14
Nodes (24): loopStart(), ascentQ, canvasTex(), clamp(), driftCam(), enterAscent(), enterCountdown(), enterIgnition() (+16 more)

### Community 10 - "Arena dressing"
Cohesion: 0.08
Nodes (7): D, mulberry32(), prepareDressing(), boomTex(), canvasTex(), FX, prepareEffects()

### Community 11 - "Drone entity"
Cohesion: 0.11
Nodes (18): b64ToBuffer(), buildProcDrone(), D, droneCountFor(), faceVelocity(), makeDrone(), prepareDrones(), prepTemplate() (+10 more)

### Community 12 - "Community 12"
Cohesion: 0.17
Nodes (21): audioResume(), audioSuspend(), audioUnlock(), ensure(), isMuted(), closePanel(), openPanel(), refreshSoundButton() (+13 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (20): disarmReset(), initHud(), onResetClick(), OVERLAY_ELMS, PANEL_HTML, refreshRecordLine(), toast(), ui (+12 more)

### Community 14 - "Community 14"
Cohesion: 0.19
Nodes (21): plumeSet(), burnLogo(), burnText(), canvasTex(), clamp(), clearTransition(), el(), enterTransition() (+13 more)

### Community 15 - "Community 15"
Cohesion: 0.16
Nodes (11): biasDir(), COS_ACQUIRE, COS_RETAIN, enabled(), hudTick(), lockTick(), pipDivergenceDeg(), qs (+3 more)

### Community 16 - "Community 16"
Cohesion: 0.14
Nodes (8): child, flags, MODE, PROFILE, ROOT, TIMEOUT, MIME, ROOT

### Community 17 - "Community 17"
Cohesion: 0.21
Nodes (12): Kenney Sci-Fi Sounds (CC0), SFX handoff (9 files, 201 KB raw), Stage-6 audio decisions (loop dropped, jingle cue), flow-check CDP harness (assert battery), Probe surface (?flags drive window.__stage2), Audio gaps ranked by player impact, Kenney CC0 sample integration (A1a), Mixing spec (buses, panner, voice cap 24, compressor) (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.27
Nodes (9): H1: HUD rebuild, Stage 6 polish plan (chair synthesis), Stage 6 chair scope (in/out of scope), F2: combat HUD readability, Stage 6 visual audit, F1: combat HUD thin text stack, F2: title-screen amateur tells, F3: element crowding at the reticle (+1 more)

### Community 19 - "Community 19"
Cohesion: 0.19
Nodes (10): initLoop(), combatApi(), initPhases(), PHASES, PLAYING_PHASES, RP, rpOnGameover(), setPhase() (+2 more)

### Community 20 - "Community 20"
Cohesion: 0.20
Nodes (8): Vi3W-generated hero/rocket models, Art/audio direction: procedural deep-space neon, Core loop: launch→warp→combat→death→retry, MVP scope set, Out-of-scope set (boss until assets, bloom, deploy), Reference games: Nova Drift / FTL warp moments, STAGE TWO (game project), Pitch command model (PITCH_MAX 72°)

### Community 22 - "Community 22"
Cohesion: 0.25
Nodes (8): paused, dprCtl, dprTick(), fps, loop(), renderFrame(), setDpr(), updateFps()

### Community 23 - "Community 23"
Cohesion: 0.27
Nodes (10): Stage 3 changelog entry (full 3D flight), Boss dashTarget shell clamp, Drift momentum model (ALIGN_RATE 4.5/s), forward() 3D keystone, Raider altitude-follow (anti-camp), Spherical soft-boundary arena (R_SOFT 60 / R_HARD 80), Story-015: pitch + drift, Story-016: spherical arena (+2 more)

### Community 25 - "Community 25"
Cohesion: 0.22
Nodes (8): color, failures, files, graph, mainText, SRC, stack, visit()

### Community 26 - "Community 26"
Cohesion: 0.25
Nodes (6): GLB, probePass(), results, ROOT, SHOT, sleep()

### Community 27 - "Community 27"
Cohesion: 0.25
Nodes (7): framework, last_upgraded, version, modes, automation, rigor, schema_version

### Community 28 - "Community 28"
Cohesion: 0.25
Nodes (4): assetReport(), FONTS, loadAssets(), report

### Community 29 - "Community 29"
Cohesion: 0.48
Nodes (6): drive(), publish(), qs, R, sleep(), waitFor()

### Community 30 - "Community 30"
Cohesion: 0.29
Nodes (3): child, FAIL, PASS

### Community 31 - "Community 31"
Cohesion: 0.53
Nodes (5): GDD errata 2026-11-05 (designer-adjudicated), GDD: full 3D flight (Stage 3), GDD: Stage 4 balance + telemetry, Stage 6 experience scope note (supersession record), TD-020: GDD stale controls-panel ref

### Community 33 - "Community 33"
Cohesion: 0.53
Nodes (6): T1: title/UX pro pass, UX audit — Stage 6, F3: pause card cursor-stuck, F4: T control must land in both text places, F5: death/victory cards are plain text, F6: RECORD 0 pre-warm flash

### Community 34 - "Community 34"
Cohesion: 0.33
Nodes (3): child, V, watchdog

### Community 36 - "Community 36"
Cohesion: 0.50
Nodes (4): Orbitron font (SIL OFL 1.1), Rajdhani font (SIL OFL 1.1), Stack decision record (three.js r187, single-file), Single-file build (file:// deliverable)

### Community 37 - "Community 37"
Cohesion: 1.00
Nodes (3): Auto-lock aim assist + gun pipper, W1: aim overhaul, F1: crosshair and bullets disagree (aim defect)

### Community 38 - "Community 38"
Cohesion: 0.50
Nodes (4): TD-015: musicTo unguarded phase-enter, 100% procedural WebAudio engine, Synth primitives (noiseBurst/beep/sweep/loopStart), Audio audit & spec (A1a + A1b)

### Community 39 - "Community 39"
Cohesion: 0.67
Nodes (3): Stage 1 changelog entry (impression pass), Guarded lazy storage (boot laziness), Guarded storage contract

## Knowledge Gaps
- **27 isolated node(s):** `Core loop: launch→warp→combat→death→retry`, `MVP scope set`, `Art/audio direction: procedural deep-space neon`, `Reference games: Nova Drift / FTL warp moments`, `Out-of-scope set (boss until assets, bloom, deploy)` (+22 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 287 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `beep()` connect `Audio synthesis engine` to `Combat audio drivers`, `Boss fight entity`, `Launch sequence & ambience`, `Drone entity`, `Community 14`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `Core loop: launch→warp→combat→death→retry`, `MVP scope set`, `Art/audio direction: procedural deep-space neon` to the rest of the system?**
  _27 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Audio synthesis engine` be split into smaller, more focused modules?**
  _Cohesion score 0.06034801925212884 - nodes in this community are weakly interconnected._
- **Why does `Stage 6 experience scope note (supersession record)` connect `Community 31` to `Community 17`, `Release & changelog history`, `Community 18`, `Community 37`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Should `Combat audio drivers` be split into smaller, more focused modules?**
  _Cohesion score 0.05536723163841808 - nodes in this community are weakly interconnected._
- **Should `Release & changelog history` be split into smaller, more focused modules?**
  _Cohesion score 0.05319148936170213 - nodes in this community are weakly interconnected._
- **Should `Balance probes & telemetry` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._