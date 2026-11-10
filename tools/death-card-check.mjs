// TEMP repro harness for the death-card bug (deleted after use — never committed).
// Cells:
//   A  real click at screen center during the death slow-mo -> when does the card land?
//   C1 click 10px off the [SKIP TO COMBAT] pill -> must be a no-op
//   C2 click on the pill -> phase changes AND the card must hide (persist bug check)
//   D  MutationObserver ledger: exactly one card show per death + combatEntries
// Usage: node build/tmp-death-repro.mjs "<url>"
import { spawn, spawnSync } from 'node:child_process';

import { resolveEdge, rmProfile } from './edge-bin.mjs';
const EDGE = resolveEdge();
const PORT = 9430 + Math.floor(Math.random() * 100);
const PROFILE = `E:\\Game Build\\build\\.edge-profile-cdp-${Date.now()}`;
const url = process.argv[2] || 'file:///E:/Game%20Build/index.html?debug=1&goto=combat';

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-sync',
  `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, url,
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws = null;
const cleanup = () => { try { ws?.close(); } catch {} try { spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch {} };

try {
  let targets = [];
  for (let i = 0; i < 80; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch {}
    await sleep(250);
  }
  const page = targets.find((t) => t.type === 'page' && t.url === url);
  if (!page) throw new Error('no page target for ' + url);
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });

  let id = 0; const pend = new Map();
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const errs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      errs.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    }
    if (m.method === 'Runtime.exceptionThrown') errs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  });
  await send('Runtime.enable'); await send('Page.enable');

  const evl = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result?.value;
  };
  const j = async (expression) => JSON.parse(await evl(`JSON.stringify(${expression})`));
  const poll = async (expr, ok, timeout, every = 80) => {
    const t0 = Date.now();
    for (;;) {
      const v = await j(expr);
      if (ok(v)) return v;
      if (Date.now() - t0 > timeout) throw new Error('poll timeout: ' + expr);
      await sleep(every);
    }
  };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };

  await poll(`{p: window.__stage2 && __stage2.phase}`, (v) => v.p === 'combat', 120000, 250);
  const entries0 = await evl(`window.__stage2.combatEntries || 0`);
  await evl(`(() => { const go = document.getElementById('gameover');
    window.__go = { shows: 0, hides: 0 };
    new MutationObserver(() => { if (!go.hidden) window.__go.shows++; else window.__go.hides++; })
      .observe(go, { attributes: true, attributeFilter: ['hidden'] });
    return true; })()`);
  const vp = await j(`{w: window.innerWidth, h: window.innerHeight}`);

  // CELL A — click at screen center the moment death registers (slow-mo window)
  await poll(`{d: __stage2.combatState().dead}`, (v) => v.d, 90000, 40);
  const tDead = Date.now();
  await click(Math.round(vp.w / 2), Math.round(vp.h / 2));
  await poll(`{g: !document.getElementById('gameover').hidden}`, (v) => v.g, 20000, 30);
  const cellA = { cardAfterClickMs: Date.now() - tDead, phase: await evl(`__stage2.phase`) };

  // CELL C — card is up: 10px off the pill, then on the pill
  const r = await j(`(b => ({x: b.x, y: b.y, w: b.width, h: b.height}))(document.getElementById('go-skip').getBoundingClientRect())`);
  await click(Math.round(r.x - 10), Math.round(r.y + r.h / 2));
  await sleep(700);
  const cellC1 = await j(`({phase: __stage2.phase, entries: __stage2.combatEntries, goHidden: document.getElementById('gameover').hidden})`);
  await click(Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2));
  await sleep(700);
  const cellC2 = await j(`({phase: __stage2.phase, entries: __stage2.combatEntries, goHidden: document.getElementById('gameover').hidden})`);

  const cellD = await j(`({shows: __go.shows, hides: __go.hides, entries: __stage2.combatEntries, entries0: ${entries0}})`);

  console.log('CELL_A ' + JSON.stringify(cellA));
  console.log('CELL_C_OFF ' + JSON.stringify(cellC1));
  console.log('CELL_C_ON ' + JSON.stringify(cellC2));
  console.log('CELL_D ' + JSON.stringify(cellD));
  console.log('CONSOLE ' + JSON.stringify(errs));
} catch (e) {
  console.error('FAIL ' + e.message);
  process.exitCode = 1;
} finally {
  cleanup();
}
