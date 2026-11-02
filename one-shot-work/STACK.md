# STACK

| Layer | Choice | Version verified (date) | Reason | Alternative considered |
| --- | --- | --- | --- | --- |
| Runtime target | Modern desktop browser, ES2020, file:// double-click | n/a (humanplay) | Interview artifact; zero-internet constraint | Dev-server (forbidden by spec) |
| Engine | three.js (ESM + addons sources) | 0.187.0 (`npm view three version` → `0.187.0`, run 2026-11-02; installed pinned in package.json) | GLB hero asset + bloom post needed | hand-rolled WebGL (overkill) |
| Build bundling | esbuild (dev-only, node_modules, not shipped) | 0.28.2 (`npm view esbuild version` → `0.28.2`, run 2026-11-02) | real ESM graph resolver for shader-laden addon modules | hand-concatenating addons (fragile) |
| Build runtime | Node | v24.18.0 (`node --version` run 2026-11-02) | present; generator script | Python 3.14.2 (also present, unneeded) |
| Audio | WebAudio synthesis, no files | built-in | spec constraint | audio files (forbidden-ish: single-file) |
| Storage | localStorage guarded + in-memory fallback | built-in | private-mode safety (guard §8.4) | cookies (absurd) |
| GLB embedding | base64 → ArrayBuffer → `GLTFLoader.parse()` (no runtime file fetch; network log: 2 requests = page + internal blob) | verified by S1 network probe | self-contained over file:// | `file://` fetch hooks (browsers block) |
| Impl strategy | single inline module bundle (esbuild), importmap data-URL mode kept as pass-tested variant | bundle 2.77 MB · importmap 3.05 MB · both zero-error over file:// | fewer runtime parts wins; verdict in S1 spike section | imported-map ladder → both proven, bundle shipped |

## Spike verdict (S1 — measured 2026-11-02, headless Edge Core 156.0.4314.58 & live tab over file://)
- Premise: import map + data-URL module import over file://. RESULT: **WORKS** (zero resolution errors; GLB `rocket:glb` both modes; `[stage2] ready` logged in both).
- BUT adding real cost: importmap = 3.05 MB, bundle = 2.77 MB, bundle needs no import-map plumbing at runtime.
- **SHIPPED: bundle mode** (esbuild absorbs three + addons + game into one inline module; zero bare imports verified by grep of the artifact). importmap stayed implemented + pass-tested as documented fallback.
- Also measured: plain `three/addons/...` sources resolve `external:['three']` as subpath-matched externals (esbuild) — left 6 bare imports; fixed by relative addon imports in `src/lib-entry.js` (built importmap mode proves the artifact).
- Headless Edge: `C:\Program Files (x86)\Microsoft\EdgeCore\156.0.4314.58\msedge.exe --headless=new ... "file:///E:/Game%20Build/index.html?debug=1"` — screenshots + stderr console.
- OpenCode browser tabs are HTTP-only → same-engine live probes run against `py -m http.server` while file:// behavior is proven headless (evidence from both targets named, per kee "wrong target" rule).

## Verification evidence
- (commands + pasted output lines appended here as they run)
