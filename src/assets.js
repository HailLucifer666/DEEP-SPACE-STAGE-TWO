// STAGE TWO — downloaded assets. Fonts register through the CSS FontFace API HERE, never the
// static template: esbuild data-URL loaders only apply to files imported from JS, and the
// template bypasses esbuild entirely. Data URLs decode offline (file:// safe); a failed face
// degrades to the system font stack, never an error. SFX/music stay procedural (synth) until
// the Kenney pack lands — see CREDITS.md handoff.
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
