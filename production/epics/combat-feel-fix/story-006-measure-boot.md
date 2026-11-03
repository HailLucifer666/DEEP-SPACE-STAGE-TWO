# story-006 — measure-boot: real boot timings before optimizing (Gate A)

Epic: combat-feel-fix · Stage 1 (impression pass) · Branch: `story-006-measure-boot`
Date: 2026-11-04

## Why

CLAUDE.md hard rule 3 records "headless boot decodes two GLBs, ~55-60 s", and roadmap v1
treated that as the player-facing boot killer. But the number was measured on HEADLESS Edge
(software GL) — the player's target is a headed browser on a real GPU. Gate A: measure the
premise where it runs before building a stage on it. Our own notes even carry two figures
(27-29 s and 55-60 s) — both headless.

## Plan (3 bullets)

- `src/main.js`: ~15 lines of set-once marks (`window.__BOOT`, ms since module eval) at
  b64-decode / gltf.parse / normals sweep / fonts / veil / glbsDone / title / firstTick.
- `tools/boot-marks.mjs`: CDP harness, **headed by default** (real GPU), headless for
  contrast; polls `window.__BOOT`, prints marks + derived durations, exits non-zero if the
  title never lands or console is not clean.
- Record both numbers in this file; the delta decides story-007's scale (decode
  optimization vs deploy-size-only).

## What could break

- Marks in hot paths — none: every mark is set-once; `normalsMs` accumulates twice (both
  models) and only rounds.
- esbuild postinstall blocked by allow-scripts in the worktree — binary verified working
  (0.28.2) before build.
- Headed run pops a window on the user's desktop — expected; it IS the measurement.
- Harness profile dirs would grow the TD-008 litter — the harness creates its profile
  inside this worktree and best-effort deletes it on exit.

## Acceptance

- Both runs print ordered marks with `phase: title`, `rocket: glb`, `CONSOLE []`.
- Numbers recorded below; story-007 scoped by them.
- No behavior change: flow-check (28 asserts) must still pass against this build before
  merge (run at merge time against the main tree).

## Results (2026-11-04, RTX 3060, cold profile per run)

**Headed — the real target (D3D11, NVIDIA GeForce RTX 3060):**
- TRUE wait, navigation → title: **6.64 s**
- navigation → module eval (navT0: 4.66 MB HTML + bundle parse/eval): **3.42 s**
- localStorage capability probe (module body): **3.07 s** — `storeStart 1` → `storeEnd 3067`
- both GLBs (b64 + parse + normals): **~180 ms combined** — the 60-second-boot premise is dead
- WebGL device creation: 14 ms; fonts ~80 ms; scene-ready → title ~40 ms
- the 350 ms loading veil never fired (boot beats it); fps meter reads its default 60 —
  the headed CDP window is occluded so rAF throttles and `firstTick` lands late or never
  (harness reports it honestly; headless run confirms the loop itself is fine)

**Headless — the CLAUDE.md #3 environment (Microsoft Basic Render Driver):**
- TRUE wait 7.49 s; storage probe 3.84 s; GLBs ~215 ms; `firstTick` 3888 ms
- the ~55-60 s figure did **not** reproduce on EdgeCore 156 — the smoke-wait rule stays
  ≥62 s until re-measured with this harness, but the player-facing premise is corrected

**Decision feeding story-007 (re-scoped by these numbers):**
1. **Lazy storage init** — resolve the localStorage capability on first use, never during
   module eval. Kills a ~3 s main-thread stall that every first-time player currently
   eats during black screen (warm profiles pay <1 ms, which is why dev never saw it).
2. **Bundle/size trim** — the 3.4 s navT0 is HTML + bundle parse/eval; gltf-transform on
   the GLBs shrinks the base64 payload and pays off in deploy download size regardless.
3. **GLB decode optimization (meshopt/DRACO) deprioritized** — decode is not a real
   hardware cost here; the swap-ready loader still gets built with the boss (story-012).

## Verification

- `npm run build` clean (4.66 MB, ~280 ms) · both harness modes end `phase: title`,
  `rocket: glb`, `CONSOLE []` — boot behavior unchanged by the marks (set-once writes;
  `normalsMs` accumulates twice, rounding only).
- Full flow-check (28 asserts) runs at merge time against the main tree, per Stage-0
  discipline.
