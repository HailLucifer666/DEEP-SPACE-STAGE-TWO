// Scratch probe: interactive combat checks with REAL input events over CDP.
// Verdicts (one JSON line per scenario): pause-freeze, pause-audio, mute, holdfire, honest.
// Usage: node tools/combat-probe.mjs
import { spawn, spawnSync } from 'node:child_process';

import { resolveEdge, rmProfile } from './edge-bin.mjs';
const EDGE = resolveEdge();
const PORT = 9400 + Math.floor(Math.random() * 200);
const URL = 'file:///E:/Game%20Build/index.html?debug=1&goto=combat';
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-sync',
  `--user-data-dir=E:\\Game Build\\build\\.edge-probe-${Date.now()}`,
  `--remote-debugging-port=${PORT}`, URL,
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const watchdog = setTimeout(() => { console.log('FAIL watchdog-timeout', JSON.stringify(V)); process.exit(1); }, 90000);
const V = {};
const verdict = (k, ok, detail) => { V[k] = { ok, ...detail }; console.log(`${ok ? 'PASS' : 'FAIL'} ${k} ` + JSON.stringify(detail)); };

try {
  let targets = [];
  for (let i = 0; i < 40; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(2000) })).json();
      const p = targets.find((t) => t.type === 'page' && t.url === URL);
      if (p) break;
    } catch {}
    await sleep(250);
  }
  const page = targets.find((t) => t.type === 'page' && t.url === URL);
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
  let id = 0; const pend = new Map();
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
  const errs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    if (m.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  });
  await send('Runtime.enable');
  const evl = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
  const key = (code, type) => send('Input.dispatchKeyEvent', { type, code, key: code.length === 1 ? code : code, windowsVirtualKeyCode: 0 });
  const waitPhase = async (want, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await evl('window.__stage2.phase'); if (s === want) return true; await sleep(400); } return false; };

  // 0. wait for combat; unlock audio with a trusted key gesture
  await waitPhase('combat', 25000);
  await sleep(1200);
  await key('Z', 'keyDown'); await key('Z', 'keyUp'); // gesture → audioUnlock
  await sleep(800);
  const audioBefore = await evl('window.__stage2.audioLive()');

  // 1. pause: freeze + audio suspend
  await key('KeyP', 'keyDown'); await key('KeyP', 'keyUp');
  await sleep(400);
  const t1 = await evl('window.__stage2.time');
  const pausedFlag = await evl('window.__stage2.paused');
  const pauseHidden = await evl(`document.getElementById('pause').hidden`);
  await sleep(1500);
  const t2 = await evl('window.__stage2.time');
  const audioPaused = await evl('window.__stage2.audioLive()');
  verdict('pause-freeze', pausedFlag === true && pauseHidden === false && t1 === t2, { t1, t2, pausedFlag, pauseHidden });
  verdict('pause-audio', audioBefore === true && audioPaused === false, { audioBefore, audioPaused });

  // 2. resume
  await key('KeyP', 'keyDown'); await key('KeyP', 'keyUp');
  await sleep(700);
  const t3 = await evl('window.__stage2.time');
  const audioResumed = await evl('window.__stage2.audioLive()');
  verdict('resume', t3 > t2 && audioResumed === true, { t2, t3, audioResumed });

  // 3. mute toggle
  await key('KeyM', 'keyDown'); await key('KeyM', 'keyUp');
  await sleep(300);
  const muted1 = await evl('window.__stage2.muted');
  await key('KeyM', 'keyDown'); await key('KeyM', 'keyUp');
  await sleep(300);
  const muted2 = await evl('window.__stage2.muted');
  verdict('mute', muted1 === true && muted2 === false, { muted1, muted2 });

  // 4. hold-fire: move pointer to center, hold LMB 1.2 s → bolts spawn
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 400 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 400, button: 'left', clickCount: 1 });
  await sleep(1200);
  const cs1 = await evl('JSON.stringify(window.__stage2.combatState())');
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 400, button: 'left', clickCount: 1 });
  const c1 = JSON.parse(cs1);
  verdict('holdfire', c1.bolts > 0, { boltsAfterHold: c1.bolts });

  // 5. honest HUD values: no NaN/undefined anywhere in HUD text
  // stage-6 H1: the scan covers the new chrome too (boss bar, wave banner, hit marker) —
  // null-safe so a build without an element reads '' rather than failing the tool.
  const texts = await evl(`JSON.stringify([
    document.getElementById('hud-bars').textContent,
    document.getElementById('hud-score').textContent,
    document.getElementById('debug').textContent,
    (document.getElementById('boss-bar') || { textContent: '' }).textContent,
    (document.getElementById('wave-banner') || { textContent: '' }).textContent,
    (document.getElementById('hit-mark') || { textContent: '' }).textContent])`);
  const bad = JSON.parse(texts).filter((s) => /NaN|undefined|null/i.test(s));
  verdict('honest', bad.length === 0, { bad });

  console.log('CONSOLE ' + JSON.stringify(errs));
  clearTimeout(watchdog);
} catch (e) {
  console.error('FAIL fatal ' + e.message);
  process.exitCode = 1;
} finally {
  try { spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch {}
}
