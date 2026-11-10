// STAGE TWO — story-013 evidence capture: retained boss-phase screenshots via CDP.
// Drives ?bossProbe=1&bossShot=1 (the probe's evidence-capture variant: closer spawn,
// per-phase holds) and captures Page.captureScreenshot at each phase marker the probe
// exposes on window.__stage2.bossShotPhase ('orbit' → 'charge' → 'rage').
// Usage: node tools/boss-shot.mjs   (writes production/qa/evidence/story-013-boss/s13-boss-*.png)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

import { resolveEdge, rmProfile } from './edge-bin.mjs';
const EDGE = resolveEdge();
const PORT = 9941;
const PROFILE = `E:\\Game Build\\build\\.edge-profile-bossshots-${Date.now()}`;
const url = 'file:///E:/Game%20Build/index.html?debug=1&goto=combat&bossProbe=1&bossShot=1';
const OUT = 'E:\\Game Build\\production\\qa\\evidence\\story-013-boss';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-sync',
  `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, url,
], { stdio: 'ignore' });
const cleanup = () => {
  try { ws?.close(); } catch {}
  try { spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch {}
  rmProfile(PROFILE);
};

let ws = null;
try {
  let targets = [];
  for (let i = 0; i < 240; i++) {
    try { targets = await (await fetch(`http://[::1]:${PORT}/json/list`)).json(); if (targets.length) break; } catch {}
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch {}
    await sleep(250);
  }
  const page = targets.find((t) => t.type === 'page' && t.url.startsWith('file:///E:/Game%20Build/index.html'));
  if (!page) throw new Error('no page target');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
  await send('Page.enable');
  const evl = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    return r.result?.value;
  };

  const want = ['orbit', 'charge', 'rage'];
  const t0 = Date.now();
  const done = [];
  while (Date.now() - t0 < 120000 && done.length < want.length) {
    const phase = await evl(`window.__stage2 ? __stage2.bossShotPhase : null`);
    if (phase && want.indexOf(phase) === done.length) { // capture in phase order, one shot each
      await sleep(500); // let the probe's hold window settle the frame (flare/glow visible)
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const file = `${OUT}\\s13-boss-${phase}.png`;
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      done.push(phase);
      console.log(`captured ${phase} → ${file}`);
    }
    await sleep(200);
  }
  if (done.length !== want.length) throw new Error(`missing phase shots: got [${done}] want [${want}]`);
  console.log(`BOSS-SHOT PASS — ${done.length} screenshots retained`);
} catch (e) {
  console.error('FAIL ' + e.message);
  process.exitCode = 1;
} finally {
  cleanup();
}
