# Story 007: lazy storage init + GLB size trim

> **Epic**: combat-feel-fix (Stage 1 — impression pass)
> **Status**: In Progress
> **Layer**: Foundation
> **Type**: Logic
> **Estimate**: M
> **Manifest Version**: N/A (minimal)
> **Last Updated**: 2026-11-04

## Context

**GDD**: `design/game-brief.md` (MVP 1 — the first impression; roadmap Stage 1)
**Requirement**: story-006 measurement (`production/epics/combat-feel-fix/story-006-measure-boot.md`):
on a cold profile the localStorage capability probe stalls the main thread
**3.1–5.2 s** (`storeStart 1 → storeEnd 3067–5240`, 4/4 runs, headed and headless) because the
first `localStorage.setItem` on a fresh origin makes Chromium create its storage database
synchronously — during black screen. Warm profiles pay <1 ms, so dev never felt it. A second
~3.4 s block is navigation → module eval (HTML + bundle parse, driven by the 2.9 MB of base64
GLB payloads).
**ADR Governing Implementation**: N/A (minimal)

**Design decision:** storage resolves lazily — a memoized `getStorage()` runs the probe on first
real use and is warmed once after the title is visible, so the cost lands behind rendered content.
Both GLBs are re-emitted through a `gltf-transform` step (quantize to KHR_mesh_quantization —
natively supported by three's GLTFLoader, no runtime decoder — plus prune/dedupe) inside
`tools/build.mjs`, shrinking the base64 payload.

**Approved by the user** in the Stage 1 plan (2026-11-04): files touched, the lazy-storage
design, and the build-step addition.

---

## Acceptance Criteria

- [ ] No synchronous localStorage access during module evaluation: in `boot-marks headed`, no
      storage mark fires before `title`, and MODULE → TITLE ≤ 2000 ms on a cold profile
      (was 3.2–5.4 s).
- [ ] High-score behavior is unchanged: saved value renders at title; death writes persist across
      reload; RESET RECORD still arm-then-confirm (flow-check + element.click() probes).
- [ ] Quantized GLBs decode error-free: `rocket: glb`, texture present (`probs.tex === 1`),
      `CONSOLE []` (flow-check), ship visually correct (screenshot evidence + player look).
- [ ] Build output shrinks: `index.html` ≤ 3.8 MB (from 4.66 MB); build log reports both GLB sizes.
- [ ] Full flow-check 28/28 green; boot-marks passes in BOTH modes (its own assertions).

---

## Implementation Notes

- Replace the STORE IIFE (`src/main.js` ~lines 118–129 post-merge) with a memoized resolver;
  `readHighscore`/`writeHighscore` call it. Warm it via `setTimeout` after `title` fires.
- Keep the `storeStart`/`storeEnd` marks around the (now lazy) init so the harness can prove
  where the cost went; they must not fire before `title`.
- `tools/build.mjs`: `@gltf-transform/core` + `@gltf-transform/functions` as devDependencies
  (local install, project isolation); transform in memory, keep `build/*.glb` staged files as
  the canonical assets. NO basis/KTX2 this slice (needs a runtime transcoder — deferred).
- Quantization risk: vertex precision — the screenshot comparison is the guard.

## Out of Scope

- Meshopt/Draco compressed transfer (runtime decoder); KTX2 textures; lazy-loading models
  after title; localStorage schema changes; settings persistence (story-020).

---

## Files

- `src/main.js` (STORE section, boot warm-up, marks)
- `tools/build.mjs` (gltf-transform step, size log)
- `package.json` / `package-lock.json` (devDependencies)
- `index.html` (build output, regenerated)

---

## QA Test Cases

*N/A — boot-marks (both modes) + flow-check 28/28 are the acceptance evidence.*

---

## Test Evidence

**Status**: [ ] Created — pending

---

## Dependencies

- Depends on: story-006 (the measurement this fixes; marks + harness)
- Unlocks: Stage 1 slices 2–4 (smaller bundle benefits all; title wait is the Stage 1 metric)
