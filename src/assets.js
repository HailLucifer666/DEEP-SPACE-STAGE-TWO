// STAGE TWO — downloaded assets. Fonts register through the CSS FontFace API HERE, never the
// static template: esbuild data-URL loaders only apply to files imported from JS, and the
// template bypasses esbuild entirely. Data URLs decode offline (file:// safe); a failed face
// degrades to the system font stack, never an error. stage-6 A1a: the Kenney CC0 SFX samples
// landed — they import through src/sfx-pack.js (same data-URL loader pattern, '.ogg' added to
// tools/build.mjs) with LAZY decode + synth fallback in audio.js. Music stays procedural by
// design (the handoff's loop.ogg was DROPPED by the recorded size decision — CREDITS.md).
import orbitron700 from './assets/fonts/orbitron-700.woff2';
import rajdhani500 from './assets/fonts/rajdhani-500.woff2';
import rajdhani700 from './assets/fonts/rajdhani-700.woff2';

const FONTS = [
  ['Orbitron', '700', orbitron700],
  ['Rajdhani', '500', rajdhani500],
  ['Rajdhani', '700', rajdhani700],
];
const report = { fonts: [], failed: [] };

export function loadAssets() { // idempotent-ish: called once at boot
  for (const [family, weight, dataUrl] of FONTS) {
    const face = new FontFace(family, `url(${dataUrl})`, { weight, display: 'swap' });
    face.load().then(() => {
      document.fonts.add(face);
      report.fonts.push(`${family} ${weight}`);
    }).catch((err) => {
      report.failed.push(`${family} ${weight}: ${(err && err.message) || err}`); // keep the evidence (kee class 6)
    });
  }
  return report;
}

export function assetReport() {
  return { fonts: [...report.fonts], failed: [...report.failed] };
}
