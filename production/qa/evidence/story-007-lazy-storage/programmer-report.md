# Story 007 — Lazy storage init + GLB size trim — Programmer Report

> **Engine programmer report** — 2026-11-04, branch `story-007-lazy-storage`
> **Status: BLOCKED** on one acceptance criterion (see "Blocker" below). All code work is
> complete and verified; the blocked criterion is the `index.html ≤ 3.8 MB` target, which is
> **mathematically unreachable with the approved transform recipe** — the payload is
> texture-dominated, not geometry-dominated.

## Provenance note

The working tree already contained an uncommitted, near-complete implementation of this story
from a prior attempt (diffs on `src/main.js`, `tools/build.mjs`, `package.json`,
`package-lock.json`, `index.html`). This session did not re-implement from scratch: every
change was audited line-by-line against the approved design (story-007 contract + Stage 1
brief), re-verified by re-running the build, the dependency check, the grep proof, and a
headed boot-marks probe, and is reported below. Nothing outside the pre-authorized file set
was touched. Changes remain uncommitted (no commit was requested).

## Files changed

- `src/main.js` — STORE section (§8.4) converted from a synchronous module-scope IIFE to a
  memoized `getStorage()` resolver; `readHighscore()` does a non-triggering pre-warm read
  (returns 0 until warmed); `writeHighscore()` and the reset-record path call `getStorage()`
  directly; boot() schedules the probe via `setTimeout(0)` AFTER `setPhase('title')` /
  `mark('title')`, then re-renders the HIGH SCORE line; `mark('bodyStart')`,
  `mark('storeStart')`, `mark('storeEnd')` removed from module scope (replaced by a
  story-007 comment; `mark('preBoot')` kept).
- `tools/build.mjs` — per-GLB transform step (weld → dedup → prune → quantize, defaults)
  using NodeIO from `@gltf-transform/core`; reads the staged `build/*.glb` from disk,
  transforms in memory, never rewrites the staged files; per-GLB before/after size log line
  added; final line still reports index.html size.
- `package.json` / `package-lock.json` — devDependencies added (npm install --save-dev, local).
- `index.html` — regenerated build output.

## npm versions installed (package.json lines)

```json
"devDependencies": {
  "@gltf-transform/core": "^4.5.1",
  "@gltf-transform/extensions": "^4.5.1",
  "@gltf-transform/functions": "^4.5.1",
  "esbuild": "0.28.2"
}
```

Resolved: core 4.5.1, extensions 4.5.1, functions 4.5.1. Import proof:
`node -e "import('@gltf-transform/core')..."` → `gltf-transform OK 50 exports`.

## Build size log

`npm run build` (succeeds, 450 ms):

```
prune: Removed types... Accessor (2)
[build] output.glb      1.33 MB → 1.20 MB  (weld+dedup+prune+quantize)
prune: Removed types... Accessor (2)
[build] rocket-old.glb  1.50 MB → 1.38 MB  (weld+dedup+prune+quantize)
[build] index.html  mode=bundle  4.32 MB  (450 ms)
```

Exact bytes:

| Asset | Before | After | Δ |
|---|---|---|---|
| build/output.glb | 1,398,196 | 1,258,068 | −140,128 |
| build/rocket-old.glb | 1,574,448 | 1,450,148 | −124,300 |
| index.html | 4,881,251 (4.66 MB) | 4,528,987 (4.32 MB) | −352,264 (−7.2%) |

The quantization itself works and is verified applied: all accessors in both output GLBs use
quantized component types (BYTE/UBYTE/SHORT/USHORT), and the output JSON carries
`"extensionsUsed":["KHR_mesh_quantization"]` + `extensionsRequired` (registered via
`io.registerExtensions([KHRMeshQuantization])` — see Deviations item 3). The headed probe
confirms decode: `rocket: glb`, `CONSOLE []`.

## Blocker: index.html ≤ 3.8 MB is unreachable via the approved recipe

Byte breakdown of the two staged GLBs (measured via the transform pipeline):

| | bytes | share of original |
|---|---|---|
| Embedded PNG textures (1024x1024, image/png) | 2,372,108 | **80%** |
| Mesh accessors (before transform) | 597,868 | 20% |
| Total original | 2,972,644 | 100% |
| Total after approved recipe | 2,708,216 | — |

The story's 3.8 MB target (3,981,312 B) implies a GLB budget of ≤ 2,297,461 raw bytes
(non-GLB content — three + app JS + template — accounts for 918,031 B of index.html, and
base64 inflates GLB bytes by 4/3). **The textures alone (2,372,108 B) exceed that budget.**
Even reducing all mesh data to zero lands at ~4.1 MB. The story context attributed the
payload to "the 2.9 MB of base64 GLB payloads" as if geometry-dominated; it is 80% PNG
texture bytes, which the approved recipe (weld/dedup/prune/quantize — mesh accessors only)
cannot shrink. Per the brief ("STOP and report rather than improvising"), no out-of-recipe
transform was added.

Paths to the target, for the orchestrator's decision (none taken):
1. **Texture resize** — `@gltf-transform/functions` `resize()` to 512x512 ≈ −1.8 MB raw
   (−2.4 MB base64) → index.html ≈ 2.0–2.5 MB. Not in the approved recipe; changes visible
   texture quality, so it needs the Stage 1 screenshot guard's sign-off.
2. **KTX2/Basis** — explicitly out of scope this slice (needs a runtime transcoder; story defers it).
3. **Accept 4.32 MB** this slice; re-target the AC.

Everything else in the story is done and verified.

## Grep proof — localStorage is lazy

`grep -n "localStorage" src/main.js` — all six hits are inside `getStorage()` or its comment;
zero at module top level:

```
121:// story-007: storage is lazy. The first localStorage touch on a cold profile stalls the main
129:    window.localStorage.setItem('__s2_probe', '1');
130:    window.localStorage.removeItem('__s2_probe');
131:    storageImpl = { get: (k) => window.localStorage.getItem(k), set: (k, v) => window.localStorage.setItem(k, v) };
135:    console.warn('[stage2] localStorage blocked; high score is session-only:', e && e.message);
```

Line 121 is the comment; lines 129–135 are inside `getStorage()` (function body, lines
126–139). The memory-fallback branch and its `console.warn` are preserved verbatim.

## Headed boot-marks probe (extra evidence — orchestrator still runs both modes + flow-check)

`node tools/boot-marks.mjs headed 60000`:

```
storeStart  803    → fires AFTER title (486) — never before, bodyStart (never fired)
storeEnd    2772   → probe cost ~2.0 s lands behind the rendered title
title       486    → MODULE → TITLE 486 ms (AC target ≤ 2000 ms)
STATE  {"phase":"title","rocket":"glb",...}
CONSOLE []
```

The probe cost (~2.0 s here; 3.1–5.2 s on fully cold profiles) now lands after the title
renders. Quantized GLBs decode error-free with zero console output.

## Deviations from the brief

1. **`io.readBinary`/`io.writeBinary` instead of the brief's `io.readGLB`/`io.writeGLB`.**
   The brief's recipe names the v3 API; the installed package is v4.5.1, where read/writeGLB
   were replaced by readBinary/writeBinary (Uint8Array in/out). Same semantics: disk read,
   in-memory transform, base64 feed into the existing path; staged files never rewritten.
2. **`dedup` not `dedupe`.** v4 renamed the export; the recipe's `dedupe` does not exist in
   4.5.1 (`weld, dedup, prune, quantize` are the actual exports).
3. **`@gltf-transform/extensions` installed and `KHRMeshQuantization` registered on the IO.**
   The brief's install list named only core + functions, and the recipe did not mention
   registration. Without it, `quantize()` still quantizes the data but the writer emits no
   `KHR_mesh_quantization` declaration — accessors with quantized component types + a missing
   required-extension declaration, i.e. malformed glTF for any spec-conformant reader (three
   happens to decode it, but the story explicitly claims "KHR_mesh_quantization — natively
   supported"). Registering the extension is the minimal, recipe-faithful fix; verified
   present in the output JSON.
4. **No new test file** — per the brief, test evidence is waived at qa.level: minimal; the
   orchestrator's boot-marks + flow-check runs are the acceptance evidence. Not modified:
   `tools/boot-marks.mjs`, `tools/flow-check.mjs` (both untouched).

## Verification checklist

- [x] `npm run build` succeeds; size log captured (above).
- [x] `import('@gltf-transform/core')` resolves — `gltf-transform OK 50 exports`.
- [x] grep: no `localStorage` at module top level; all hits inside `getStorage()`/comment.
- [x] Headed boot-marks: no storage mark before `title`; MODULE → TITLE 486 ms; rocket glb;
      CONSOLE [].
- [ ] Orchestrator: boot-marks in both modes + flow-check 28/28 (per brief, not mine to run).
- [x] Full acceptance except: index.html 4.32 MB vs ≤ 3.8 MB — **BLOCKED** (see above).
