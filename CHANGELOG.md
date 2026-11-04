# CHANGELOG

All notable changes to STAGE TWO. Format: Keep-a-Changelog-ish, newest first.
Tagged states: see `git tag` (chain: good-s4 → good-gofix → good-feel → good-launch →
good-assets → good-controls → good-rift → good-title → good-arena → good-raiders →
good-pips → good-studio).

## [Unreleased]

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
