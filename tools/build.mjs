// STAGE TWO — loader. Reads template + bundle + GLB, splices one self-contained index.html.
// Modes: bundle (default) = everything inlined as one module script, no import map.
//        importmap       = three + this-file's lib as data-URL modules through an import map.
// Every slice regenerates index.html with this file — never hand-edit index.html.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // E:\Game Build
const SRC = path.join(ROOT, 'src');
const templatePath = path.join(ROOT, 'tools', 'index.template.html');
const outPath = path.join(ROOT, 'index.html');
const glbPath = path.join(ROOT, 'build', 'output.glb');

const mode = (process.argv[2] || 'bundle'); // bundle | importmap
if (mode !== 'bundle' && mode !== 'importmap') {
  console.error(`[build] unknown mode "${mode}" (use: bundle | importmap)`);
  process.exit(1);
}

const ES = {
  target: 'es2020',
  format: 'esm',
  minify: true,
  bundle: true,
  write: false,
  sourcemap: false,
  platform: 'browser',
  logLevel: 'warning',
};

// Escape the ONLY byte sequence that can terminate an inline <script> block.
// "<\/script" is semantics-identical inside JS string/template/regex contexts.
const escapeScript = (s) => s.replace(/<\/script/gi, '<\\/script');

async function js(entry, extra = {}) {
  const r = await esbuild.build({ entryPoints: [entry], ...ES, ...extra });
  return r.outputFiles[0].text;
}

async function main() {
  const t0 = Date.now();
  if (!fs.existsSync(glbPath)) { console.error(`[build] missing ${glbPath} — stage the GLB first`); process.exit(1); }

  const template = fs.readFileSync(templatePath, 'utf8');
  const glbB64 = fs.readFileSync(glbPath).toString('base64');
  const libPath = path.join(SRC, 'lib-entry.js');
  const mainPath = path.join(SRC, 'main.js');

  let importMapHtml = '';
  let appJs;

  if (mode === 'bundle') {
    // one self-contained module text: three + addons + game, zero runtime bare imports
    appJs = await js(mainPath, { alias: { 'stage-two-lib': libPath } });
  } else {
    // lib  = three + addons, with bare 'three' left for the import map (the spike premise)
    // app  = game code, with bare 'stage-two-lib' left for the import map
    const libJs = await js(libPath, { external: ['three'] });
    const app = await js(mainPath, { external: ['stage-two-lib'] });
    const threeJs = await js(path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.js'));
    const asDataUrl = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
    importMapHtml =
      '<script type="importmap">{"imports":{"three":"' + asDataUrl(threeJs) +
      '","stage-two-lib":"' + asDataUrl(libJs) + '"}}</script>';
    appJs = app;
  }

  const html = template
    .replace('/*{{IMPORTMAP}}*/', importMapHtml)
    .replace('window.__GLB_B64="{{GLB_B64}}"', `window.__GLB_B64="${glbB64}"`)
    .replace('window.__BUILD_MODE="{{MODE}}"', `window.__BUILD_MODE="${mode}"`)
    .replace('/*{{APP_JS}}*/', () => escapeScript(appJs));

  const leftovers = ['{{IMPORTMAP}}', '{{APP_JS}}', '{{GLB_B64}}', '{{MODE}}'].filter((t) => html.includes(t));
  if (leftovers.length) { console.error(`[build] unresolved template tokens: ${leftovers.join(', ')}`); process.exit(1); }
  fs.writeFileSync(outPath, html);
  console.log(`[build] index.html  mode=${mode}  ${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB  (${Date.now() - t0} ms)`);
}

await main();
