// story-006 — boot timing on the REAL target. CLAUDE.md #3's "~55-60 s" boot figure was
// measured on HEADLESS Edge (software GL); Gate A says measure the premise where it actually
// runs. This harness runs HEADED by default (real GPU — the player's experience), polls the
// window.__BOOT marks main.js records, prints them with derived durations, and fails loudly
// if the title never lands. Run headless for the contrast number.
//   node tools/boot-marks.mjs [headed|headless] [timeoutMs]
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveEdge, rmProfile } from './edge-bin.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const EDGE = resolveEdge();
const PORT = 9330 + Math.floor(Math.random() * 100);
// own throwaway profile inside this tree (TD-008 discipline: never grow the main build/ litter);
// best-effort deleted on exit — a locked profile just survives, force:true keeps that silent
const PROFILE = path.join(ROOT, 'build', `.edge-profile-boot-${Date.now()}`);
const MODE = (process.argv[2] || 'headed').toLowerCase();
const TIMEOUT = Number(process.argv[3] || (MODE === 'headless' ? 120000 : 60000));
if (MODE !== 'headed' && MODE !== 'headless') {
  console.error(`[boot-marks] unknown mode "${MODE}" (use: headed | headless)`);
  process.exit(1);
}

const flags = [
  '--no-first-run', '--disable-background-networking', '--disable-sync', '--window-size=1280,800',
  `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`,
];
if (MODE === 'headless') flags.push('--headless=new', '--disable-gpu');
const url = pathToFileURL(path.join(ROOT, 'index.html')).href + '?debug=1';
const child = spawn(EDGE, [...flags, url], { stdio: 'ignore' });

let ws = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = () => {
  try { ws?.close(); } catch {}
  try { spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch {}
  rmProfile(PROFILE);
};

try {
  let targets = [];
  for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch {}
    await sleep(200);
  }
  const page = targets.find((t) => t.type === 'page' && t.url === url);
  if (!page) throw new Error('no matching file:// page target — Edge may have failed to open the game');

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });

  let id = 0; const pend = new Map();
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
  });
  ws.onmessage = (ev) => { // resolves send() — without this every CDP command hangs forever
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  };
  const errs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      errs.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    }
    if (m.method === 'Runtime.exceptionThrown') errs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  });

  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');

  // poll until the title mark exists (set-once marks persist, so a post-boot connection still reads them)
  const deadline = Date.now() + TIMEOUT;
  let boot = null;
  while (Date.now() < deadline) {
    const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__BOOT || null)', returnByValue: true });
    const v = JSON.parse(r.result.value);
    if (v && v.title != null) { boot = v; break; }
    await sleep(250);
  }
  if (!boot) {
    throw new Error(`boot never reached title within ${TIMEOUT} ms (mode ${MODE}) — ` +
      `if __BOOT was undefined the whole time, the build predates story-006 marks: run npm run build`);
  }

  const fin = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      phase: window.__stage2 && window.__stage2.phase,
      rocket: window.__stage2 && window.__stage2.rocket,
      fps: window.__stage2 && window.__stage2.fps,
      bootMs: window.__stage2 && window.__stage2.bootMs(),
      gpu: (() => { try { const c = document.createElement('canvas').getContext('webgl');
        const e = c.getExtension('WEBGL_debug_renderer_info');
        return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; } catch { return 'n/a'; } })(),
    })`,
    returnByValue: true,
  });
  const state = JSON.parse(fin.result.value);

  const at = (k) => (boot[k] != null ? boot[k] : null);
  const dur = (a, b) => (at(a) != null && at(b) != null ? at(b) - at(a) : null);
  console.log(`BOOT MARKS (${MODE}) — ms since module eval, url ${url}`);
  for (const k of ['t0', 'bodyStart', 'storeStart', 'storeEnd', 'uiEnd', 'preBoot', 'probe', 'bootStart', 'fonts', 'veilShown', 'rendererStart', 'renderer', 'heroB64Start', 'heroB64', 'heroParseStart', 'heroParse',
    'propB64Start', 'propB64', 'propParseStart', 'propParse', 'glbsDone', 'title', 'firstTick']) {
    const v = at(k);
    console.log(`  ${k.padEnd(14)} ${v == null ? '(never fired)' : v}`);
  }
  console.log('DERIVED');
  const row = (label, v) => console.log(`  ${label.padEnd(34)} ${v == null ? 'n/a' : v + ' ms'}`);
  row('module → WebGL device ready', at('renderer'));
  row('WebGL device creation', dur('rendererStart', 'renderer'));
  row('b64 decode (hero)', dur('heroB64Start', 'heroB64'));
  row('b64 decode (prop)', dur('propB64Start', 'propB64'));
  row('gltf.parse (hero)', dur('heroParseStart', 'heroParse'));
  row('gltf.parse (prop)', dur('propParseStart', 'propParse'));
  row('normals+texture sweep (both)', boot.normalsMs);
  row('post-parse → scene ready', dur('heroParse', 'glbsDone'));
  row('scene ready → title', dur('glbsDone', 'title'));
  row('MODULE → TITLE (player wait)', at('title'));
  row('TRUE wait (navigation → title)', boot.navT0 != null && boot.title != null ? boot.navT0 + boot.title : null);
  row('MODULE → FIRST TICK', at('firstTick'));
  console.log('STATE ' + JSON.stringify(state));
  console.log('CONSOLE ' + JSON.stringify(errs));
  if (state.phase !== 'title' || state.rocket !== 'glb') {
    console.error(`FAIL expected phase:title rocket:glb — got ${state.phase}/${state.rocket}`);
    process.exitCode = 1;
  }
  if (errs.length) process.exitCode = 1;
} catch (e) {
  console.error('FAIL ' + e.message);
  process.exitCode = 1;
} finally {
  cleanup();
}
