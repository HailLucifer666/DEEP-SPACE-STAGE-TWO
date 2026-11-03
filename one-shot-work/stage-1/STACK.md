# STACK — Stage 1 (unchanged from the project, plus one devDependency)

- Runtime: vanilla ES2020 modules, three.js 0.187.0 (pinned in package.json — verified present
  in node_modules 2026-11-03), esbuild 0.28.2 build (`npm run build`, verified working
  2026-11-04: `import('esbuild') → 0.28.2`).
- NEW (story-007 only): `@gltf-transform/core` + `@gltf-transform/functions` as devDependencies —
  version verified at install time; justification: quantize/prune without any runtime decoder
  (KHR_mesh_quantization is native to three's GLTFLoader).
- Test harnesses (no test runner, by design): tools/flow-check.mjs (28 asserts),
  tools/boot-marks.mjs (headed-default boot timing), tools/cdp-check.mjs, tools/combat-probe.mjs,
  tools/death-card-check.mjs. Node built-in WebSocket/fetch over CDP; EdgeCore 156 binary.
- Constraint: zero internet at runtime — every asset base64-inlined by tools/build.mjs.
