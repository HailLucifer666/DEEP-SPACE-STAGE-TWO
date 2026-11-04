# CHANGELOG

All notable changes to STAGE TWO. Format: Keep-a-Changelog-ish, newest first.
Tagged states: see `git tag` (chain: good-s4 → good-gofix → good-feel → good-launch →
good-assets → good-controls → good-rift → good-title → good-arena → good-raiders →
good-pips → good-studio).

## [Unreleased]

### Stage 2 — boss + victory, the take-home P0 (2026-11-04/05, tags good-2026-11-04-h…good-2026-11-05-b)
- **story-011 main.js split (TD-003 closed)** — 791→500 lines: STORE/PHASES/INPUT/LOOP into
  `src/store.js`/`phases.js`/`input.js`/`loop.js`, ONE late-bound ctx object, zero behavior
  change (28/28 + full probe set green on branch and merged master); `tools/dep-check.mjs`
  enforces acyclic imports + the 500-line composition root mechanically.
- **story-012 Vi3W drone** — third enemy (ring+core+fins, additive neon), orbiting diver with
  FULL-3D steering (y first-class, no arena constant baked in — Stage 3 retunes, not rewrites);
  build-time GLB swap (`build/drone.glb` → `__DRONE_B64`, same quantize pipeline), BOTH paths
  machine-proven (glb 1 part / proc 5 parts); `?droneProbe=1` proves yRange > 1 u + telegraph.
- **story-013 boss fight** — the sector warden: orbit+volley → charge (0.8 s telegraph, 10 u
  overshoot — no ram-bait full stops) → rage; weak-point core node 3× damage (proven 9 vs 3
  dmg from equal 3-bolt streams); slow-mo death cinematic; BOSS HP line in the change-gated
  HUD bars; spawns once after wave 5. TD-013 closed (guarded render path, honest `post:
  'direct'` degrade), TD-014 closed (stale #tele cleared on REPLAY), TD-015 closed (musicTo
  can never abort a phase transition).
- **story-014 victory card** — `bossDefeated` lands the win phase exactly once (event-path
  trigger, mutually exclusive with gameover by the `!C.dead` guard); per-fight combat clock
  (M:SS on the card); `#victory` overlay in the gameover card discipline with the win-cyan
  accent; REPLAY → pad, second run clean. Found-defect fix: edge pips drained on REPLAY
  (pre-existing leak, death card included).
- **Stage-2 review** (independent, 0 CRITICAL / 2 IMPORTANT / 4 ADVISORY / 5 NIT — all
  dispositioned): bossDefeated re-fire latched, page-level CONSOLE gates added to flow-check
  (the final gate had only ever measured the last page), victory-score freeze fixed,
  composer-latch guards completed, zero-vector dash made unrepresentable. flow-check now
  **76 asserts** (was 28 at stage start).

### Stage 1 — the impression pass (2026-11-04, tags good-2026-11-04…good-2026-11-04-f+)
- **story-007 lazy storage + GLB quantize** — boot to title **513 ms headed** (was 3.2–5.4 s):
  the localStorage capability probe no longer runs at module eval (it made Chromium build its
  storage DB synchronously on cold profiles — 3–5 s of black screen every first-time player);
  GLBs weld+dedup+prune+quantize in the build (2.97→2.58 MB, index.html 4.66→4.32 MB).
- **story-008 bloom + title framing** — EffectComposer/UnrealBloomPass wired through both
  render paths (never-crash fallback), DPR ladder drops bloom first; the hero ship now sits
  below the title text instead of hiding behind it. Player-verified.
- **story-009 music bed + SFX** — procedural title/combat pads (musicBag on the loopStart
  contract), overlapping crossfades via musicTo, musicEvict replacing loopsStopAll at all four
  engine-teardown sites, boost ducking, low-hull alarm (880 Hz, re-arm hysteresis), proximity
  tick. Probe surfaces: musicState/loopsCount/alarmActive. Player-verified.
- **story-010 SPD readout + sag verdict** — change-gated speed line in the combat HUD (r2 UX
  advisory closed); gameover fps sag measured headed: artifact (143.2 vs 144.0 fps at vsync) —
  pinned, no fix. r2 advisory closed with data.
- **story-006 boot measurement** — window.__BOOT marks + headed boot-marks harness; the
  "55–60 s GLB decode" premise corrected (GLBs: ~0.18 s; real cost was storage + bundle parse).
- Stage 1 review: independent pass — 1 IMPORTANT (dishonest highscore-write catch) fixed
  same-day; 3 advisories accepted into the tech-debt register (TD-013/014/015) with named fixes.

### Added
- Claude-Code-Game-Studios framework (`.claude/`: 74 skills, 49 agents, docs+templates,
  hooks, rules; `project.yaml` rigor=minimal, automation=guided). 2026-11-03.

### Prior rounds (detail in git log)
- good-pips: edge threat pips, kill shake. good-raiders: ship-shaped raiders — gunners
  (orbit + dodgeable bolts) + rammers, separation, score by kind. good-arena: arena 3×
  (80), spawn ring 55, speed 17. good-title: pro start screen (chrome, panels, arm-confirm
  record reset). good-rift: rift→warp→logo transition (shader tear, FOV kick, gates).
  good-controls: Space=boost, LMB fire, flowing field, explosion-pool tick fix.
  good-assets: Orbitron/Rajdhani fonts (OFL). good-launch: cinematic deep-space cruise,
  Vi3W stage-one derelicts. good-feel: cursor:none, tracking reticle, DPR auto-degrade.
  good-gofix: death-card response fixes.
