# ASSUMPTIONS

- Build location: MID-SESSION owner directive — "build the game here in this folder only: `E:\Game Build`". Overrides handoff §2's `E:\Skill-OneShot\stage-two\`; one-shot-work/ and all game files live directly under `E:\Game Build`. Nothing was built into E:\Skill-OneShot beyond a one-minute-old scaffold that was moved over.
- `one-shot-work\` lives inside `stage-two\` so the deliverable folder travels as one artifact (handoff names the folder but not the parent).
- Rocket nose points +Y until the S1 screenshot proves otherwise (handoff §3 explicitly flagged this as unverified).
- Modern desktop browser (current Chrome/Edge/Firefox) is a fair audience; ES2020 features + WebGL2 assumed; no legacy/IE compat and no mobile/touch (out of scope).
- Final artifact ~2.5–3 MB is acceptable for a take-home (owner locked single-file packaging, handoff §4.3).
- GLB facts from handoff §3 (measured 2026-11-02) are trusted; if the on-disk parse disagrees at build time, measured numbers win and this file records the delta.
- Exact sound recipes (frequencies/envelopes within handoff §6's sound list) are builder-tuned; handoff names the sounds, not the notes.
- Build-time internet available (handoff mandates a CDN/version check); runtime must be零-internet — esbuild/three fetched once into node_modules at build time only.
