# Smoke record — Stage 6 (experience polish) on branch polish/stage6-experience

Run 2026-11-09 by the orchestrator, on branch `polish/stage6-experience` HEAD `04716f2`
(T1 `0dfeacc` → W1 `2b22ba0` → H1 `51fd172` → A1 `04716f2`). All numbers below are
outputs of runs executed this session on this exact tree; none are copied from earlier
records or from the story builders' own runs.

## The documented run path, executed end-to-end

| Gate | Command | Result |
| --- | --- | --- |
| Build | `npm run build` | `index.html mode=bundle 4.70 MB (309 ms)` — regenerated, never hand-edited (stage-5 baseline 4.41 MB; +0.29 MB = 9 CC0 ogg samples, 25% of the 800 KB budget) |
| Structure | `node tools/dep-check.mjs` | `PASS — acyclic, structural rules hold`; `main.js lines: 271 (limit 500)`; new rule active: `aim-assist.js imports combat.js — forbidden` |
| Regression | `EDGE=…157.0.4341.42… node tools/flow-check.mjs` | `FLOW-CHECK PASS — 255 passed, 0 failed`, `CONSOLE []` on every page |
| Boot timing | `EDGE=… node tools/boot-marks.mjs` (headed) | `MODULE → TITLE (player wait) 478 ms`, TRUE wait 3335 ms, `CONSOLE []` |
| Real-input combat | `EDGE=… node tools/combat-probe.mjs` | 6/6 PASS (pause-freeze, pause-audio, resume, mute, holdfire, honest NaN-scan — scan list extended to the new HUD elements), `CONSOLE []` |

Environment note: unchanged from stage 5 — the harnesses pin a stale Edge default
(156.0.4314.58); every run used the override
`EDGE="C:/Program Files (x86)/Microsoft/EdgeCore/157.0.4341.42/msedge.exe"` (TD-016).

## Assert-chain growth this stage (every step red-first + mutation-proven)

190 (stage-5 close) → **201** (T1: +11) → **232** (W1: +31) → **242** (H1: +10, incl. 2
sanctioned in-place rewrites of the story-013 BOSS text-line asserts, the harness
`#hud-bars` sampling, and `probes.js` BP.hud — each with dated provenance) → **255**
(A1: +13). Sanctioned-change protocol: `one-shot-work/stage-5/GATE.md:18-22` precedent.

Red runs recorded (against the feature-less build, every new assert failing for its
absence reason): T1 192/9 · W1 207/25 · H1 230/12 · A1 244/11. Post-green mutations,
each `mutate → build → full flow-check → record → restore → rebuild`:
T1 cursor-class removal 200/1 · W1 bias-clamp removal 229/3 + cone→180° 231/1 ·
H1 fill-width removal 239/3 + hide-removal 240/2 (first mis-application kept on file
as `flow-mutation-bossdeath-removal-misapplied.txt`) · A1 sequencer-step removal 253/2
+ voice-cap removal 254/1 (first cap attempt discarded as vacuous — redone at the
single honest point inside `voiceBegin`).

Evidence: `production/qa/evidence/stage6-t1/`, `stage6-w1/` (incl. the fire-path
baseline — the first assert chain driving a REAL fired bolt through `spawnBolt` and
reading `b.userData.dir`; every prior probe bypassed that function), `stage6-h1/`,
`stage6-a1/` (incl. `pack-manifest.md`: 9 Kenney Sci-Fi Sounds 1.0 CC0 files,
201,258 B raw).

Boot-to-title samples this stage: 221 / 276 / 478 / 585 / 736 / 1086 ms across the
story runs and the close battery — all inside the documented ≈0.3–2.5 s variance
envelope; lazy sample decode keeps audio work out of the boot window entirely
(zero audio work before the title mark by construction). Known residual: the
OVERDRIVE interval band co-red class (TD-017) was observed twice in ~8 full runs
during A1 bring-up and zero times in the two consecutive closing greens — rerun
policy stands, no band widened.

The gates reduce risk; they do not prove the absence of bugs.
