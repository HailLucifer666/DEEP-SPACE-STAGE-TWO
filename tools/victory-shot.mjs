// STAGE TWO — story-014 evidence capture: retained victory screenshots via CDP (boss-shot.mjs
// precedent). Drives ?goto=combat&bossProbe=1 — the bossDefeated report lands the victory card
// mid-drive — captures the card, clicks its REPLAY, and captures the pad landing.
// Usage: node tools/victory-shot.mjs   (writes production/qa/evidence/story-014-victory/s14-*.png)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

import { resolveEdge, rmProfile } from './edge-bin.mjs';
const EDGE = resolveEdge();
const PORT = 9941;
const PROFILE = `E:\\Game Build\\build\\.edge-profile-vicshots-${Date.now()}`;
const url = 'file:///E:/Game%20Build/index.html?debug=1&goto=combat&bossProbe=1';
const OUT = 'E:\\Game Build\\production\\qa\\evidence\\story-014-victory';
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
  const shot = async (file) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
    console.log(`captured → ${file}`);
  };

  // 1 — wait for the victory card (the drive's bossDefeated report lands it)
  let t0 = Date.now();
  for (;;) {
    const ph = await evl(`window.__stage2 ? __stage2.phase : 'boot'`);
    if (ph === 'victory') break;
    if (Date.now() - t0 > 90000) throw new Error('victory never landed');
    await sleep(200);
  }
  await sleep(800); // let the card settle (fonts, crossfade)
  const card = await evl(`JSON.stringify({
    vicHidden: document.getElementById('victory').hidden,
    score: document.getElementById('vic-score').textContent,
    time: document.getElementById('vic-time').textContent,
  })`);
  await shot(`${OUT}\\s14-victory-card.png`);
  console.log(`card state: ${card}`);

  // 2 — REPLAY → pad
  await evl(`document.getElementById('vic-replay').click()`);
  t0 = Date.now();
  for (;;) {
    const ph = await evl(`window.__stage2 ? __stage2.phase : 'boot'`);
    if (ph === 'pad') break;
    if (Date.now() - t0 > 15000) throw new Error('pad never landed');
    await sleep(200);
  }
  await sleep(600); // let the pad seat the rocket + HUD assemble
  const pad = await evl(`JSON.stringify({
    vicHidden: document.getElementById('victory').hidden,
    hudHidden: document.getElementById('hud').hidden,
  })`);
  await shot(`${OUT}\\s14-replay-pad.png`);
  console.log(`pad state: ${pad}`);
  console.log('VICTORY-SHOT PASS — 2 screenshots retained');
} catch (e) {
  console.error('FAIL ' + e.message);
  process.exitCode = 1;
} finally {
  cleanup();
}
