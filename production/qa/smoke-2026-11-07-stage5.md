# Smoke record — Stage 5 (ship prep) merged master

Run 2026-11-07 by the orchestrator, on merged master `df31d29` (== tag
`good-2026-11-07-c`). All numbers below are outputs of runs executed this session on
this exact tree; none are copied from earlier records.

## The documented run path, executed end-to-end

| Gate | Command | Result |
| --- | --- | --- |
| Build | `npm run build` | `index.html mode=bundle 4.41 MB (306 ms)` — regenerated, never hand-edited |
| Structure | `node tools/dep-check.mjs` | `PASS — acyclic, structural rules hold`; `main.js lines: 263 (limit 500)` |
| Regression | `node tools/flow-check.mjs` | `FLOW-CHECK PASS — 190 passed, 0 failed`, `CONSOLE []` on every page |
| Boot timing | `node tools/boot-marks.mjs` (headed) | `MODULE → TITLE (player wait) 1155 ms`, `CONSOLE []` |

Environment note: both harness binaries default to a pinned Edge path
(`EdgeCore\156.0.4314.58`) that is stale on this machine (installed:
`157.0.4341.42`); every run above used the documented override
`EDGE="C:/Program Files (x86)/Microsoft/EdgeCore/157.0.4341.42/msedge.exe"`. The pin
is a recorded known limitation (README "Known limitations"; backlog: dynamic
resolution).

## What this battery covers

- **story-020 settings persistence** (merged `93062ed`, tag `good-2026-11-07-b`):
  mute survives a reload through the guarded store — write-through at the `setMuted`
  choke point, lazy restore in the warm block, corrupt-reads-unmuted, restore-never-
  rewrites. Red-first record: red run 181/7 on the unmodified build, mutations A–D
  each red for the stated mechanism. flow-check 170 → 188.
- **Stage-5 riders A–D** (merged `df31d29`, tag `good-2026-11-07-c`): flake bands to
  99%+ exact coverage (drop-rate [9,28] = 99.14%; kind-split χ²(2) ≤ 9.210;
  OVERDRIVE bands kept with the deterministic-bounds derivation; both recorded
  mutations re-run RED), `E.lastRoll` diagnostic gated behind `?balanceProbe=1`
  (no production allocation; flag-ON behavior byte-identical), GDD §8.5 re-worded to
  hint-comprehension (doc-only), M-key label refresh (pre-existing defect,
  reviewer-ruled rider). Red-first + mutation records per rider. flow-check 188 → 190.

Boot-to-title samples this stage (documented variance envelope ≈ 0.3–2.5 s; the tail
is GLB parse variance under load): 279 / 1155 / 1450 / 1824 ms — all in envelope,
zero console errors on every page of every run.

The gates reduce risk; they do not prove the absence of bugs.
