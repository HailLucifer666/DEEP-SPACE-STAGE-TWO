// STAGE TWO — flow regression harness (story-003). Drives the complete critical flow with
// element clicks + synthetic keys and asserts overlay state at every step — the "stuck
// window" class (title-on-SKIRMISH, death-card gaps) can never silently return.
// Usage: node tools/flow-check.mjs   (expects the built index.html; ~3-4 min headless)
// Repo state 2026-11-04: spawn a headless Edge with its own throwaway profile + a FIXED
// debug port 9941, wait for the /json/list via fetch http://127.0.0.1:9941, pick the page
// target = this exact URL, drive element clicks + key events, then taskkill /F /T on the
// spawned browser tree in cleanup().
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

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
  // IPv6 readiness: binds remote-debugging-port on [::1] blindly. Headless Edge binds the
  // remote-debugging-port on [::1] (IPv6 loopback, session 2026-11-04 §?); fetching it from
  // 127.0.0.1 (IPv4) gets ECONNREFUSED for the whole run — Node 21+ resolves 'localhost' and
  // also '127.0.0.1' per DoH... Break: no IPv6? Err on the side of IPv6, keep 127 fallback.
  const cdpBase = 'http://127.0.0.1:9941';
  const cdpBaseV6 = 'http://[::1]:9941';
  let targets = [];
  for (let i = 0; i < 240; i++) {
    try {
      targets = await (await fetch(cdpBaseV6 + '/json/list')).json();
      if (targets.length) break;
    } catch {}
    try {
      targets = await (await fetch(cdpBase + '/json/list')).json();
      if (targets.length) break;
    } catch {}
    await sleep(250);
  }
  const page = targets.find((t) => t.type === 'page' && t.url.startsWith('file:///E:/Game%20Build/index.html'));
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

  /* --- story-012 keep-passing (entry snapshot): raider composition untouched, zero drones ---
     Taken the instant SKIRMISH lands combat (wave 1, before the first raider stagger ~1.02 s):
     alive 1 + queued 3 = 4 raiders exactly, drones 0 (droneCountFor(1) = min(3, max(0, 1-2)) = 0). */
  const cs12 = await J(`__stage2.combatState()`);
  ok('wave 1 spawns zero drones (story-012)', cs12.drones === 0, `drones=${cs12.drones}`);
  ok('wave 1 raider count unchanged (4)', cs12.enemies === 4, `enemies=${cs12.enemies}`);

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
       soft rim bleeds        maxRadial=29.8 — full-speed radial at r≈70 (square does nothing before 80)
       boundary is a circle   r=101.2 — diagonal flight sat far outside any 80-circle
       rim slides             pinned dead at the corner, d=2.1 (no slide at all)
     All 9 red on old — the full set discriminates old from new (mutation run, 2026-11-03). */
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

  // 6 — mouse steer: pointer right of center turns the nose right, in place …
  await pointer(0.8);
  const p6 = await cs();
  await sleep(600);
  const q6 = await cs();
  ok('mouse right steers right in place (Δh≤−0.5, <3u)', q6.h - p6.h <= -0.5 && dist(p6, q6) < 3, `Δh=${(q6.h - p6.h).toFixed(2)} d=${dist(p6, q6).toFixed(1)}`);

  // 6b — …and a pointer that LEAVES the window stops steering (review R2-2: stale pointer was a
  // permanent full-rate turn; cursor is hidden in play so the player can't see it sitting there)
  await evl(`document.dispatchEvent(new PointerEvent('pointerout', {bubbles: true, relatedTarget: null}))`);
  await sleep(500);
  const q6b = await cs();
  ok('pointer leave stops steering (|Δh|<0.15 over 0.5s)', Math.abs(q6b.h - q6.h) < 0.15, `Δh=${(q6b.h - q6.h).toFixed(2)}`);
  await pointer(0); // neutralize for the next probes

  /* --- boundary probes (story-005 soft circular boundary) --- */
  // 7 — boosted straight out: (a) boost expiry BLEEDS, never snaps (review R2-1: the old branch
  // order snap-clamped 32→17 in one frame — assert drop rate ≤ 25 u/s², bleed is 22, snap ~38);
  // (b) radial speed bleeds inside the soft ring (design cap 17·(80−r)/20 floored at 3 — old
  // build measured 29.8 here). alive() runs INSIDE the loop: a mid-probe death would otherwise
  // let slow-mo trivially pass both (review R2-5).
  await alive('boundary probe');
  let maxRadial = 0, rimSamples = 0, maxDropRate = 0, prev = await cs(), prevT = Date.now();
  await key('KeyW', 'keydown'); await key('Space', 'keydown');
  for (let i = 0; i < 20; i++) {
    await alive('boundary loop');
    await sleep(250);
    const s = await cs(); const t = Date.now();
    const dtS = (t - prevT) / 1000;
    const r = Math.hypot(s.x, s.z), pr = Math.hypot(prev.x, prev.z);
    if (pr < 60) maxDropRate = Math.max(maxDropRate, Math.abs(s.s - prev.s) / dtS);
    if (pr > 65 && pr < 78 && r > pr) { rimSamples++; maxRadial = Math.max(maxRadial, (r - pr) / dtS); }
    prev = s; prevT = t;
    if (r >= 79) break;
  }
  await key('Space', 'keyup');
  ok('boost expiry bleeds (drop ≤25 u/s², no snap)', maxDropRate <= 25, `maxDropRate=${maxDropRate.toFixed(1)}`);
  ok('soft rim bleeds radial speed (≤13, sampled in r 65–78)', rimSamples > 0 && maxRadial <= 13, `maxRadial=${maxRadial.toFixed(1)} samples=${rimSamples}`);

  // 7b — the hard clamp is a circle: diagonal flight can't reach a square corner
  await keyHold('KeyD', 4000); // W still held; new scheme arcs, old scheme pinned r≈113 here
  const p7 = await cs();
  ok('boundary is a circle (r≤81)', Math.hypot(p7.x, p7.z) <= 81, `r=${Math.hypot(p7.x, p7.z).toFixed(1)}`);

  // 8 — rim slides, never pins. Deterministic rim approach (review R2-6: the 7b arc can end
  // anywhere, and a slide assert from mid-field proves nothing): brake, face outward, boost to
  // the rim, THEN measure the carry.
  await alive('rim approach');
  await keyHold('KeyS', 1200); // kill leftover speed from the 7b arc
  const aim = await cs();
  let dh = Math.atan2(aim.x, aim.z) - aim.h; // heading that points away from the center
  while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  await keyHold(dh > 0 ? 'KeyA' : 'KeyD', Math.round(Math.abs(dh) / 2.2 * 1000) + 120); // A=+Δh, D=−Δh
  await key('KeyW', 'keydown'); await key('Space', 'keydown'); // meter regened during 7b (~0.25/s)
  for (let i = 0; i < 24; i++) {
    await alive('rim approach loop');
    await sleep(300);
    const s = await cs();
    if (Math.hypot(s.x, s.z) >= 75) break;
  }
  await key('Space', 'keyup');
  const p8 = await cs();
  ok('rim precondition (ship at the rim, r≥72)', Math.hypot(p8.x, p8.z) >= 72, `r=${Math.hypot(p8.x, p8.z).toFixed(1)}`);
  await keyHold('KeyD', 300); // ~0.66 rad oblique
  const p8b = await cs();
  await sleep(1600); // W still held
  const q8 = await cs();
  await key('KeyW', 'keyup');
  ok('rim slides (carry >5u over 1.6s)', dist(p8b, q8) > 5, `d=${dist(p8b, q8).toFixed(1)}`);

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

  /* --- story-012 drone probe (?droneProbe=1, second page over the SAME CDP session) ---
     Page.navigate keeps the ws target; the fresh page boots with goto=combat and the probe
     spawns one deterministic drone 12 u ahead. RED record 2026-11-04 (master build @ fe3540b,
     product code untouched, only this harness differs): 8 of the 9 new asserts FAIL
     (29 passed / 8 failed total) — no drone.js exists on master, combatState() has no
     `drones` field (undefined !== 0), ?droneProbe=1 is unread so window.__stage2.droneProbe
     never appears and the deadline expires (each probe assert records its red from the null
     probe). The 9th, `raider count unchanged`, is GREEN on master BY DESIGN — keep-passing.
     MUTATIONS (branch, post-green, each: mutate → npm run build → full flow-check → restore):
       1. drone.js droneCountFor `w - 2` → `w - 1`  → RED `drone wave rule (0,0,1,2,3)`
          (waveRule reported [0,1,2,3,3]; the keep-passing entry assert stays green because
          wave 1 still maps to 0 — the pure-rule assert is what catches the flip).
       2. drone.js Y_AMP_MAX 6 → 0.001 → RED `drone 3D movement (yRange > 1u)`
          (yRange 0.08 < 1 — zeroed orbit-plane tilt flattens the ring into the XZ plane).
     Full outputs: production/qa/evidence/story-012-drone/flow-red-master.txt,
     flow-green-branch.txt, flow-mutation-spawnrule.txt, flow-mutation-yamp.txt. */
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat&droneProbe=1' });
  let dp = null;
  {
    const t0 = Date.now();
    for (;;) {
      // guarded + thrown-tolerant: across Page.navigate the old execution context dies and the
      // new document has no __stage2 for its first seconds — a raw read throws and would kill
      // the run before the asserts below get to record (first red run hit exactly this)
      try { dp = await J(`(window.__stage2 && window.__stage2.droneProbe) || null`); } catch { dp = null; }
      if (dp) break;
      if (Date.now() - t0 > 90000) break; // deadline — the asserts below record the red
      await sleep(300);
    }
  }
  const dpX = dp || {};
  const tokenBuild = await evl(`window.__DRONE_B64 ? 'glb' : 'proc'`);
  ok('droneProbe reports (story-012)', !!dp, JSON.stringify(dp));
  ok('drone 3D movement (yRange > 1u)', dpX.yRange > 1, `yRange=${dpX.yRange}`);
  ok('drone path spans all 3 axes', dpX.path3d && dpX.path3d.x > 0.5 && dpX.path3d.z > 0.5, JSON.stringify(dpX.path3d || null));
  ok('drone telegraphs then dives', dpX.telegraph === true && dpX.dive === true, `tele=${dpX.telegraph} dive=${dpX.dive}`);
  ok('droneBuild matches the build token', dpX.droneBuild === tokenBuild, `droneBuild=${dpX.droneBuild} token=${tokenBuild}`);
  ok('drone wave rule (0,0,1,2,3)', JSON.stringify(dpX.waveRule) === '[0,0,1,2,3]', JSON.stringify(dpX.waveRule || null));
  ok('raider wave rule unchanged (4,6,7,9)', JSON.stringify(dpX.raiderRule) === '[4,6,7,9]', JSON.stringify(dpX.raiderRule || null));

  ok('CONSOLE []', errs.length === 0, errs.join(' | '));
} catch (e) {
  console.error('FAIL ' + e.message);
  process.exitCode = 1;
} finally {
  cleanup();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {} // throwaway profile never lingers
}

console.log(`\nFLOW-CHECK ${FAIL.length === 0 ? 'PASS' : 'FAIL'} — ${PASS.length} passed, ${FAIL.length} failed`);
if (FAIL.length) process.exitCode = 1;
