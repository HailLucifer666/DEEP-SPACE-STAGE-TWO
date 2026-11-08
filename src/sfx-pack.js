// STAGE TWO — SFX pack manifest (stage-6 A1a). The Kenney Sci-Fi Sounds selection, CC0 —
// license verified verbatim in CREDITS.md (pack zip License.txt: "License: (Creative Commons
// Zero, CC0)"); per-file provenance, byte sizes and the selection rationale live in
// production/qa/evidence/stage6-a1/pack-manifest.md. Data-URL imports ride the esbuild
// '.ogg':'dataurl' loader (tools/build.mjs) — exactly the fonts pattern (src/assets.js): the
// loaders only apply to JS imports, data URLs decode offline (file:// safe). Raw budget per the
// audio-audit: ≤ 120 KB per file, ≤ 800 KB total — this selection is 201,258 B raw (≈ 268 KB as
// base64 ×4/3). The handoff's music loop.ogg was DROPPED by the recorded size decision —
// CREDITS.md records the drop; music stays procedural (the pads + the A1b sequencer).
// Round-robin pairs are SAME-FAMILY variants (Kenney variants are authored to intercut) —
// alternating them breaks the machine-gun sameness without changing the cue's identity.
import laserA from './assets/sfx/laser-a.ogg';
import laserB from './assets/sfx/laser-b.ogg';
import explosionA from './assets/sfx/explosion-a.ogg';
import explosionB from './assets/sfx/explosion-b.ogg';
import impact from './assets/sfx/impact.ogg';
import pickup from './assets/sfx/pickup.ogg';
import uiClick from './assets/sfx/ui-click.ogg';
import efireA from './assets/sfx/efire-a.ogg';
import efireB from './assets/sfx/efire-b.ogg';

export const SFX_PACK = {
  laser: { urls: [laserA, laserB], rr: 0 }, // player stream shot — round-robin ×2
  explosion: { urls: [explosionA, explosionB], rr: 0 }, // kills + boss hits — round-robin ×2
  hit: { urls: [impact], rr: 0 }, // player hurt (the four damagePlayer sources)
  pickup: { urls: [pickup], rr: 0 }, // powerup collect
  ui: { urls: [uiClick], rr: 0 }, // every button — title, pause pills, panels, end cards
  efire: { urls: [efireA, efireB], rr: 0 }, // gunner bolts + boss volley — ONE enemy-fire timbre
};
