# PLAN — Stage 1 slices

Slices are vertical: each lands playable, tested, and merged before the next starts.
One CCGS story per slice; programmer subagent per dev-story's table; kee discipline inside.

| # | Slice | Branch | Files touched | Acceptance test | Risk |
|---|---|---|---|---|---|
| 1 | story-007 lazy storage + GLB quantize | `story-007-lazy-storage` | src/main.js, tools/build.mjs, package.json | boot-marks headed: no storage mark before title, MODULE→TITLE ≤ 2000 ms; flow-check 28/28; screenshot | quantization vertex precision (screenshot guard); gltf-transform API drift (verify version at install) |
| 2 | story-008 bloom | `story-008-bloom` | src/main.js, src/lib-entry.js | `__stage2.post === 'bloom'`; resize probe; flow-check 28/28; screenshot + player verdict | render swap breaks asserts (guarded by flow-check); fps cost (dprTick ladder) |
| 3 | story-009 music + SFX | `story-009-music-sfx` | src/audio.js, src/main.js, src/combat.js, tools/build.mjs | probe: loop count/duck/alarm surfaces; combat-probe green; loop-leak probe; player ears | audio timing feels wrong (player verdict); Kenney conditional path untested if pack absent (then synth-only is the tested path) |
| 4 | story-010 speed readout + sag verdict | `story-010-speed-readout` | tools/index.template.html, src/main.js | speed probes (≥14/boost/≤3); gated-write review; flow-check 28/28; headed sag numbers recorded | none beyond HUD timing (gated writes are established practice) |

Merge cadence (user blanket grant, 2026-11-04): after flow-check green + the slice's
player-verdict gate (007 look, 008 look, 009 ears, 010 green+sag verdict), merge --no-ff to
master, test the merged result, tag. Revocable at any tag.

After slice 4: one code-review pass over the whole Stage 1 diff → smoke-check → GATE.md → changelog.
