# ASSUMPTIONS — Stage 1

- The user's feel-check notes were not attached at plan approval; the verdict on record is
  "mostly good, small notes" (2026-11-04). Notes can be added any time and land in the epic
  backlog; nothing in Stage 1 is blocked on them.
- The Kenney CC0 pack is NOT in src/assets/sfx/ yet — story-009 ships synth-only unless the
  pack appears before that slice's build.
- KHR_mesh_quantization is supported by three.js 0.187.0's GLTFLoader (supported since r133);
  verified at runtime by flow-check (`rocket: glb`) + visual check, not from memory alone.
- gltf-transform's current major version API is verified at install time (STACK.md), not from
  memory.
- "Blanket, gated" merge grant (2026-11-04) covers Stage 1 branches only; Stages 2+ re-ask.
