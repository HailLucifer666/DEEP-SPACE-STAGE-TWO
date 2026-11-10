// Scratch check tool: drives headless Edge over CDP (Node built-in WebSocket/fetch),
// captures console errors, and dumps game state JSON. Usage:
//   node tools/cdp-check.mjs "<url>" [waitMs]
import { spawn, spawnSync } from 'node:child_process';

import { resolveEdge, rmProfile } from './edge-bin.mjs';
const EDGE = resolveEdge();
const PORT = 9230 + Math.floor(Math.random() * 100);
const PROFILE = `E:\\Game Build\\build\\.edge-profile-cdp-${Date.now()}`;
const url = process.argv[2];
const waitMs = Number(process.argv[3] || 8000);

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
  '--disable-sync',
  `--user-data-dir=${PROFILE}`,
  `--remote-debugging-port=${PORT}`, url,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws = null;
const cleanup = () => {
  try { ws?.close(); } catch {}
  // taskkill /T nukes the whole browser tree — spawn-only kill leaks subprocesses
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
  ws.onmessage = (ev) => {
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
  await sleep(waitMs);

  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      href: location.href,
      stage2Type: typeof window.__stage2,
      bodyChildren: document.body.children.length,
      veilHidden: (document.getElementById('webglveil') || {}).hidden ?? null,
      title: document.title,
      stage2: window.__stage2 && { version: window.__stage2.version, phase: window.__stage2.phase,
        fps: window.__stage2.fps, rocket: window.__stage2.rocket,
        entities: window.__stage2.entities, particles: window.__stage2.particles,
        bootMs: window.__stage2.bootMs(), skipProbe: window.__stage2.skipProbe || null,
        combatEntries: window.__stage2.combatEntries || 0 },
      debug: (document.getElementById('debug') || {}).textContent || null,
      reticleHidden: document.getElementById('reticle')?.hidden ?? null,
      flashClass: document.getElementById('flash')?.className ?? null,
      combatOnlineHidden: (document.getElementById('combat-online') || {}).hidden ?? null,
      hudAssemble: document.getElementById('hud')?.classList.contains('assemble') ?? null,
      combat: window.__stage2.combatState ? window.__stage2.combatState() : null,
      lastReport: window.__stage2.lastReport || null,
      restartProbe: window.__stage2.restartProbe || null,
      hudBars: (document.getElementById('hud-bars') || {}).textContent || '',
      hudScore: (document.getElementById('hud-score') || {}).textContent || '',
      hitveilOn: document.getElementById('hitveil')?.classList.contains('on') ?? null,
      pauseHidden: document.getElementById('pause')?.hidden ?? null,
      gameoverHidden: document.getElementById('gameover')?.hidden ?? null,
      goScore: (document.getElementById('go-score') || {}).textContent || '',
    })`,
    returnByValue: true,
  });
  console.log('STATE ' + r.result.value);
  console.log('CONSOLE ' + JSON.stringify(errs));

  if (process.env.SHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.env.SHOT, Buffer.from(shot.data, 'base64'));
    console.log('SHOT ' + process.env.SHOT);
  }
} catch (e) {
  console.error('FAIL ' + e.message);
  process.exitCode = 1;
} finally {
  cleanup();
}
