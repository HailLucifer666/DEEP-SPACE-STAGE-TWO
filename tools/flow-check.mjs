// STAGE TWO — flow regression harness (story-003). Drives the complete critical flow with
// element clicks + synthetic keys and asserts overlay state at every step — the "stuck
// window" class (title-on-SKIRMISH, death-card gaps) can never silently return.
// Usage: node tools/flow-check.mjs   (expects the built index.html; ~3-4 min headless)
import { spawn, spawnSync } from 'node:child_process';

const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\EdgeCore\\156.0.4314.58\\msedge.exe';
const PORT = 9941;
const PROFILE = `E:\\Game Build\\build\\.edge-profile-cdp-${Date.now()}`;
const url = 'file:///E:/Game%20Build/index.html?debug=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-sync',
  `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, url,
], { stdio: 'ignore' });

let ws = null;
const cleanup = () => { try { ws?.close(); } catch {} try { spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch {} };

const PASS = [];
const FAIL = [];
const ok = (name, cond, extra = '') => {
  if (cond) PASS.push(name);
  else FAIL.push(name + ' — ' + extra);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
};

try {
  let targets = [];
  for (let i = 0; i < 240; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch {}
    await sleep(250);
  }
  const page = targets.find((t) => t.type === 'page' && t.url === url);
  if (!page) throw new Error('no page target');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
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
  const J = async (expression) => JSON.parse(await evl(`JSON.stringify(${expression})`));
  const poll = async (expr, okFn, timeout, every = 200) => {
    const t0 = Date.now();
    for (;;) {
      const v = await J(expr);
      if (okFn(v)) return v;
      if (Date.now() - t0 > timeout) throw new Error('poll timeout: ' + expr);
      await sleep(every);
    }
  };
  const key = async (code, type) => {
    await evl(`window.dispatchEvent(new KeyboardEvent('${type}', {code: '${code}', bubbles: true, cancelable: true}))`);
  };

  await poll(`({p: window.__stage2 && __stage2.phase})`, (v) => v.p === 'title', 140000, 400);
  ok('boot → title', await evl(`!document.getElementById('title').hidden`) === true);

  /* --- SKIRMISH path --- */
  await evl(`document.getElementById('btn-skip').click()`);
  await poll(`({p: __stage2.phase})`, (v) => v.p === 'combat', 30000);
  const sk = await J(`({
    titleHidden: document.getElementById('title').hidden,
    hudHidden: document.getElementById('hud').hidden,
    reticleHidden: document.getElementById('reticle').hidden,
    assembled: document.getElementById('hud').classList.contains('assemble'),
    playing: document.body.classList.contains('playing'),
  })`);
  ok('SKIRMISH → combat', sk.titleHidden === true && sk.hudHidden === false, JSON.stringify(sk));
  ok('SKIRMISH reticle assembled', sk.reticleHidden === false && sk.assembled === true, JSON.stringify(sk));
  ok('SKIRMISH body.playing', sk.playing === true);

  /* --- WASD + boundary probes (story-004 throttle+turn / story-005 soft boundary) ---
     Mutation evidence 2026-11-03: this full probe set ran against the story-002 build
     (world-axis strafe, velocity-derived heading) with a 2-line combatState instrument
     (speed: C.vel.length(), heading: C.heading). Recorded reds, each for the stated
     reason (full output: production/qa/evidence/story-004-nms-controls/):
       W holds the nose       heading flipped to π (nose copied velocity)
       cruise holds speed     speed decayed toward 0 (no keys → pursuit of own position)
       S brakes               speed stayed ~17 (S is world +z strafe, not a brake)
       A turns in place       strafed −x ~8u, heading −π/2 (sign inverted vs new scheme)
       D turns in place       mirrored (+π/2)
       mouse steer            translated toward pointer, heading sign inverted
     Boundary probes (maxRadial=29.8, r=101.2, pin d=2.1 — all red on old) land with
     story-005's soft-circle commit; full record in production/qa/evidence/story-004-nms-controls/. */
  const keyHold = async (code, ms) => { await key(code, 'keydown'); await sleep(ms); await key(code, 'keyup'); };
  const cs = async () => J(`({ s: __stage2.combatState().speed, h: __stage2.combatState().heading, x: __stage2.combatState().pos[0], z: __stage2.combatState().pos[2] })`);
  const alive = async (at) => { if (await evl(`__stage2.combatState().dead`)) throw new Error('player died during probes at ' + at); };
  const pointer = async (ndcX) => {
    await evl(`window.dispatchEvent(new PointerEvent('pointermove', {clientX: Math.round((${ndcX} + 1) / 2 * window.innerWidth), clientY: Math.round(window.innerHeight / 2), bubbles: true}))`);
  };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  // 1 — W accelerates AND holds the nose (the shipped complaint: W used to flip the view 180°)
  await alive('W probe');
  const p1 = await cs();
  await keyHold('KeyW', 2000);
  const q1 = await cs();
  ok('W accelerates ≥14 u/s', q1.s >= 14, `speed=${q1.s.toFixed(1)}`);
  ok('W moves ship ≥15u', dist(p1, q1) >= 15, `d=${dist(p1, q1).toFixed(1)}`);
  ok('W holds the nose (|Δh|<0.2)', Math.abs(q1.h - p1.h) < 0.2, `Δh=${(q1.h - p1.h).toFixed(2)}`);

  // 2 — cruise: neither W nor S → speed holds (throttle model, not pursuit decay)
  await sleep(500);
  const p2 = await cs();
  ok('cruise holds speed ±2', Math.abs(p2.s - q1.s) <= 2, `Δs=${Math.abs(p2.s - q1.s).toFixed(1)}`);

  // 3 — S brakes
  await keyHold('KeyS', 1500);
  const p3 = await cs();
  ok('S brakes to ≤3', p3.s <= 3, `speed=${p3.s.toFixed(1)}`);

  // 4/5 — A/D turn in place (≈no thrust): A → Δh ≥ +0.5, D → Δh ≤ −0.5, both move <3u
  await alive('A/D probe');
  const p4 = await cs();
  await keyHold('KeyA', 600);
  const q4 = await cs();
  ok('A turns left in place (Δh≥+0.5, <3u)', q4.h - p4.h >= 0.5 && dist(p4, q4) < 3, `Δh=${(q4.h - p4.h).toFixed(2)} d=${dist(p4, q4).toFixed(1)}`);
  await keyHold('KeyD', 600);
  const q5 = await cs();
  ok('D turns right in place (Δh≤−0.5, <3u)', q5.h - q4.h <= -0.5 && dist(q4, q5) < 3, `Δh=${(q5.h - q4.h).toFixed(2)} d=${dist(q4, q5).toFixed(1)}`);

  // 6 — mouse steer: pointer right of center turns the nose right, in place
  await pointer(0.8);
  const p6 = await cs();
  await sleep(600);
  const q6 = await cs();
  await pointer(0); // neutralize steering
  ok('mouse right steers right in place (Δh≤−0.5, <3u)', q6.h - p6.h <= -0.5 && dist(p6, q6) < 3, `Δh=${(q6.h - p6.h).toFixed(2)} d=${dist(p6, q6).toFixed(1)}`);

  /* --- natural death → REPLAY path --- */
  await poll(`({d: __stage2.combatState().dead})`, (v) => v.d, 90000, 300);
  await poll(`({g: !document.getElementById('gameover').hidden})`, (v) => v.g, 20000, 150);
  ok('death card appears', true);
  await evl(`document.getElementById('go-replay').click()`);
  await poll(`({p: __stage2.phase})`, (v) => v.p === 'pad', 15000);
  const rp = await J(`({
    goHidden: document.getElementById('gameover').hidden,
    titleHidden: document.getElementById('title').hidden,
    hudHidden: document.getElementById('hud').hidden,
    reticleHidden: document.getElementById('reticle').hidden,
    warnHidden: document.getElementById('warn').hidden,
  })`);
  ok('REPLAY → pad: card/title hidden', rp.goHidden === true && rp.titleHidden === true, JSON.stringify(rp));
  ok('REPLAY → pad: hud visible, reticle off', rp.hudHidden === false && rp.reticleHidden === true, JSON.stringify(rp));

  /* --- full launch walk: pad → countdown → ignition → ascent → transition (hud never orphans) --- */
  const entriesBeforeWalk = await evl(`window.__stage2.combatEntries || 0`);
  const seen = new Set();
  const tStart = Date.now();
  while (Date.now() - tStart < 120000) {
    const p = await evl(`__stage2.phase`);
    if (p === 'transition' || p === 'combat') break;
    if (p !== 'loading' && p !== 'title') {
      if (!seen.has(p)) {
        seen.add(p);
        ok(`hud visible at ${p}`, await evl(`!document.getElementById('hud').hidden`) === true);
      }
    }
    await sleep(250);
  }
  await poll(`({p: __stage2.phase})`, (v) => v.p === 'combat', 40000, 400);
  const entriesAfterWalk = await evl(`window.__stage2.combatEntries || 0`);
  ok('walk lands combat exactly once', entriesAfterWalk - entriesBeforeWalk === 1, `Δentries=${entriesAfterWalk - entriesBeforeWalk}`);

  /* --- death → SKIP path --- */
  await poll(`({d: __stage2.combatState().dead})`, (v) => v.d, 90000, 300);
  await poll(`({g: !document.getElementById('gameover').hidden})`, (v) => v.g, 20000, 150);
  await evl(`document.getElementById('go-skip').click()`);
  await poll(`({p: __stage2.phase})`, (v) => v.p === 'combat', 15000);
  const sp = await J(`({
    goHidden: document.getElementById('gameover').hidden,
    reticleHidden: document.getElementById('reticle').hidden,
    assembled: document.getElementById('hud').classList.contains('assemble'),
  })`);
  ok('SKIP → combat: card hidden, reticle assembled', sp.goHidden === true && sp.reticleHidden === false && sp.assembled === true, JSON.stringify(sp));

  ok('CONSOLE []', errs.length === 0, errs.join(' | '));
} catch (e) {
  console.error('FAIL ' + e.message);
  process.exitCode = 1;
} finally {
  cleanup();
}

console.log(`\nFLOW-CHECK ${FAIL.length === 0 ? 'PASS' : 'FAIL'} — ${PASS.length} passed, ${FAIL.length} failed`);
if (FAIL.length) process.exitCode = 1;
