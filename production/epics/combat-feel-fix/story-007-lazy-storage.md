# Story 007: lazy storage init + GLB size trim

> **Epic**: combat-feel-fix (Stage 1 — impression pass)
> **Status**: Complete
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

- [x] No synchronous localStorage access during module evaluation: in `boot-marks headed`,
      storage marks fire AFTER `title` (storeStart 514 > title 513), and MODULE → TITLE is
      **513 ms** on a cold profile (was 3,214–5,403 ms).
- [x] High-score behavior is unchanged: pre-warm reads render 0 then re-render the saved value
      when the warm-up lands; death writes persist; RESET RECORD arm-then-confirm untouched
      (flow-check death→REPLAY path green).
- [x] Quantized GLBs decode error-free: `rocket: glb+tex`, bounds unchanged
      `[1.418, 1.6, 0.651]`, `CONSOLE []`, ship visually correct — screenshot retained, player
      look passed 2026-11-04.
- [x] Build output shrinks: **4.66 → 4.32 MB**, build log reports both GLBs
      (output.glb 1.33→1.20 MB, rocket-old.glb 1.50→1.38 MB). *Retargeted by the player
      2026-11-04: the original ≤3.8 MB target was set on the wrong premise — 80% of GLB bytes
      are two 1024×1024 PNG textures that quantization cannot touch; texture resize/KTX2
      deferred to a Stage 2 texture story.*
- [x] Full flow-check 28/28 green (`CONSOLE []`); boot-marks passes BOTH modes — headed title
      513 ms, headless title 1,428 ms (was 3,991), headless TRUE wait 3.36 s (was 7.49 s).

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

**Status**: [x] Created — `production/qa/evidence/story-007-lazy-storage/` holds
`programmer-report.md` (implementation + verification log), `s7-quantized-title.png` (retained
screenshot, player-approved), `stamp.txt` (content hashes of all four changed files). Numbers:
headed boot-marks storeStart 514 / storeEnd 2809 / title 513 (stall lands behind rendered
title); headless title 1,428 ms; flow-check 28/28 `CONSOLE []` on the branch.

---

## Dependencies

- Depends on: story-006 (the measurement this fixes; marks + harness)
- Unlocks: Stage 1 slices 2–4 (smaller bundle benefits all; title wait is the Stage 1 metric)

---

## Completion Notes (story-done, 2026-11-04)

- The AC-4 retarget (≤3.8 MB → 4.32 MB accepted) is a **premise correction, not a compromise**:
  the story assumed geometry dominated the GLB payload; measurement showed textures do (2.37 of
  2.97 MB). The player chose to defer texture work to a Stage 2 story (KTX2 or resize) rather
  than accept a quality change inside this slice.
- Honest trade-off recorded: quantized (16-bit) accessors decode slower — hero parse 60→412 ms
  headed. Still paid before title and small; bought a 0.34 MB smaller file. Revisit only if
  boot regresses.
- The player's title screenshots surfaced a separate first-impression defect — the hero ship is
  nearly invisible behind the title text (pre-existing camera framing, not quantization) —
  recorded in EPIC.md, fix rides with story-008's visual pass.
- v4 API notes for the next agent: `io.readBinary`/`writeBinary` (not readGLB/writeGLB),
  `dedup` (not `dedupe`), and `@gltf-transform/extensions` must be installed with
  `KHRMeshQuantization` registered on the IO — unregistered, the writer emits quantized data
  with no extension declaration (malformed glTF).

