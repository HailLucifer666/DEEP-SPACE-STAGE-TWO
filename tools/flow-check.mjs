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

import { resolveEdge, rmProfile } from './edge-bin.mjs';
const EDGE = resolveEdge();
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
  // T1 (stage 6): inline SVG favicon in the template head — a data URL (no external file, no
  // network fetch on file://), and the head must stay console-silent about it (this page's
  // terminal CONSOLE [] assert is the witness). RED-FIRST 2026-11-08 (branch polish/stage6-
  // experience, product untouched — only this harness differs): the pre-T1 head has no
  // <link rel="icon"> — RED for absence. Transcript: production/qa/evidence/stage6-t1/flow-red-t1.txt.
  ok('T1: favicon link present in the head (inline SVG data URL)',
    await evl(`(/^data:image\\/svg\\+xml/.test((document.querySelector('link[rel="icon"]') || {}).href || ''))`) === true,
    await evl(`JSON.stringify((document.querySelector('link[rel="icon"]') || {}).href || null)`));

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
  ok('boss slot null before spawn (story-013 keep-passing)', cs12.boss === null, `boss=${JSON.stringify(cs12.boss)}`);

  /* --- stage-6 H1 (HUD rebuild): labeled meters + the wave banner at combat entry ---
     RED-FIRST 2026-11-08 (branch polish/stage6-experience, product untouched — only this
     harness + the probe drives differ): #hud-bars carried the story-004 text-stack markup
     (no .meter rows) and #wave-banner did not exist — every assert below records RED for
     absence (the sanctioned red class). Transcript: production/qa/evidence/stage6-h1/
     flow-red-h1.txt. The meters are a presentation-only restyle of the SAME change-gated
     writer values (honesty law: label + track + fill, no new values — the fill IS the value
     the text wrote). The banner is the #combat-online reveal grammar re-instanced at the top
     strip (input-events-none via #hud; never covers the reticle center — audit F3 budget). */
  const h1Entry = await J(`({
    meters: (() => { const bars = document.getElementById('hud-bars'); if (!bars) return null;
      const rows = [...bars.querySelectorAll('.meter')];
      return { n: rows.length,
        labels: rows.map((r) => (r.querySelector('.ml') || {}).textContent || ''),
        fills: rows.map((r) => { const i = r.querySelector('.mtrack i'); return i ? i.style.width : null; }) };
    })(),
    cs: __stage2.combatState(),
    banner: (() => { const el = document.getElementById('wave-banner');
      return el ? { hidden: el.hidden, text: el.textContent } : null; })(),
  })`);
  const h1m = h1Entry.meters || { n: 0, labels: [], fills: [] }, h1b = h1Entry.banner;
  ok('H1: labeled HULL/SHIELD/BOOST meter rows at combat entry — label + track + fill, fills equal the combatState values (honesty: same values the text stack wrote)',
    h1m.n === 3 && h1m.labels[0] === 'HULL 100' && h1m.labels[1] === 'SHIELD 50' && h1m.labels[2] === 'BOOST 100%' &&
    h1m.fills[0] === '100%' && h1m.fills[1] === '100%' && h1m.fills[2] === '100%' &&
    h1Entry.cs.hp === 100 && h1Entry.cs.shield === 50,
    JSON.stringify({ meters: h1m, cs: { hp: h1Entry.cs.hp, shield: h1Entry.cs.shield, boost: h1Entry.cs.boost } }));
  ok('H1: wave banner shows at the entry wave start (WAVE 1 — the #combat-online reveal grammar re-instance)',
    !!h1b && h1b.hidden === false && h1b.text === 'WAVE 1', JSON.stringify(h1b));
  let bannerHid = false;
  {
    const t0 = Date.now();
    for (;;) {
      const v = await J(`(() => { const el = document.getElementById('wave-banner'); return el ? { hidden: el.hidden } : null; })()`);
      if (v && v.hidden === true) { bannerHid = true; break; }
      if (Date.now() - t0 > 5000) break;
      await sleep(200);
    }
  }
  ok('H1: wave banner auto-hides within the ~2 s window (transient — not a permanent second score line)', bannerHid === true, `hid=${bannerHid}`);

  /* --- T1 pause card (stage 6): real keys + real element clicks, run while the fight is fresh ---
     The pause card ships two pills (RESUME / SOUND) with the cursor precondition from the
     polish audit (ux-audit F3 CRITICAL): pause does NOT change phase, and body.playing carries
     cursor:none — so setPaused must toggle a body class that restores the OS cursor for the
     card, and clear it on resume. The SOUND pill mirrors the session mute state and must
     live-refresh on BOTH toggle paths (the M key and the click — the rider-D rule the title
     pill already obeys). RESUME must unpause through input.js's setPaused(false) — the same
     code path P/ESC take. RED-FIRST 2026-11-08 (branch polish/stage6-experience, product
     untouched — only this harness differs): on the pre-T1 build the pause card is text-only —
     #pause-resume/#pause-sound are absent, body never gains .paused (computed cursor stays
     'none' — the audit-CRITICAL defect, buttons present but unseeable), and no in-card label
     can exist. Every assert below records RED for that absence reason; the runs are kept
     alive past each red with the KeyP fallback so every red gets recorded.
     Transcript: production/qa/evidence/stage6-t1/flow-red-t1.txt. */
  await key('KeyP', 'keydown'); await key('KeyP', 'keyup'); // REAL pause path (input.js setPaused)
  await poll(`({p: !document.getElementById('pause').hidden})`, (v) => v.p, 5000);
  const pzT1 = await J(`({
    paused: window.__stage2.paused,
    bodyPaused: document.body.classList.contains('paused'),
    bodyCursor: getComputedStyle(document.body).cursor,
    resume: (document.getElementById('pause-resume') || {}).textContent || null,
    sound: (document.getElementById('pause-sound') || {}).textContent || null,
    resumeCursor: document.getElementById('pause-resume') ? getComputedStyle(document.getElementById('pause-resume')).cursor : null,
    muted: window.__stage2.muted,
  })`);
  ok('T1 pause: card up with RESUME + SOUND pills (existing .pill grammar)',
    !!pzT1.resume && !!pzT1.sound && pzT1.resume.includes('RESUME') && pzT1.sound.startsWith('[ SOUND:'), JSON.stringify(pzT1));
  ok('T1 pause: body.paused restores the OS cursor (audit-CRITICAL — cursor:none must not own the card)',
    pzT1.bodyPaused === true && pzT1.bodyCursor === 'auto' && pzT1.resumeCursor === 'auto', JSON.stringify(pzT1));
  ok('T1 pause: SOUND pill label mirrors the session mute state (rider-D grammar, in-card)',
    pzT1.sound === `[ SOUND: ${pzT1.muted ? 'OFF' : 'ON'} ]`, JSON.stringify({ sound: pzT1.sound, muted: pzT1.muted }));
  await evl(`(document.getElementById('pause-resume') || { click(){} }).click()`); // the click path main.js wires
  await sleep(400);
  const rzT1a = await J(`({ p: window.__stage2.paused, h: document.getElementById('pause').hidden })`);
  if (rzT1a.p) { // red-run fallback: the pre-T1 build has no button — restore with the key path so the run lives on
    await key('KeyP', 'keydown'); await key('KeyP', 'keyup'); await sleep(300);
  }
  ok('T1 pause: RESUME click unpauses (same setPaused(false) path as P/ESC)',
    rzT1a.p === false && rzT1a.h === true, JSON.stringify(rzT1a));
  await key('KeyP', 'keydown'); await key('KeyP', 'keyup'); // pause again for the sound-pill battery
  await poll(`({p: !document.getElementById('pause').hidden})`, (v) => v.p, 5000);
  await evl(`(document.getElementById('pause-sound') || { click(){} }).click()`);
  await sleep(200);
  const s1T1 = await J(`({ m: window.__stage2.muted,
    pauseLabel: (document.getElementById('pause-sound') || {}).textContent || null,
    titleLabel: (document.getElementById('btn-sound') || {}).textContent || null })`);
  ok('T1 pause: SOUND click mutes in-session and live-syncs BOTH pills (pause + title)',
    s1T1.m === true && s1T1.pauseLabel === '[ SOUND: OFF ]' && s1T1.titleLabel === '[ SOUND: OFF ]', JSON.stringify(s1T1));
  await evl(`(document.getElementById('pause-sound') || { click(){} }).click()`);
  await sleep(200);
  const s2T1 = await J(`({ m: window.__stage2.muted,
    pauseLabel: (document.getElementById('pause-sound') || {}).textContent || null,
    titleLabel: (document.getElementById('btn-sound') || {}).textContent || null })`);
  ok('T1 pause: SOUND click unmutes (toggle both ways, labels re-sync)',
    s2T1.m === false && s2T1.pauseLabel === '[ SOUND: ON ]' && s2T1.titleLabel === '[ SOUND: ON ]', JSON.stringify(s2T1));
  await key('KeyM', 'keydown'); await key('KeyM', 'keyup'); await sleep(150); // the M path while paused — the label must follow (rider-D mirror)
  const s3T1 = await J(`({ m: window.__stage2.muted,
    pauseLabel: (document.getElementById('pause-sound') || {}).textContent || null })`);
  ok('T1 pause: M while paused live-refreshes the pause SOUND label (rider-D mirror, no click)',
    s3T1.m === true && s3T1.pauseLabel === '[ SOUND: OFF ]', JSON.stringify(s3T1));
  await key('KeyM', 'keydown'); await key('KeyM', 'keyup'); await sleep(150); // restore unmuted — the story-020 pages later in this run read the persisted raw key
  await evl(`(document.getElementById('pause-resume') || { click(){} }).click()`);
  await sleep(300);
  let rzT1b = await J(`({ p: window.__stage2.paused, h: document.getElementById('pause').hidden,
    bp: document.body.classList.contains('paused'), c: getComputedStyle(document.body).cursor })`);
  if (rzT1b.p) { // red-run fallback (pre-T1 build: no button)
    await key('KeyP', 'keydown'); await key('KeyP', 'keyup'); await sleep(300);
    rzT1b = await J(`({ p: window.__stage2.paused, h: document.getElementById('pause').hidden,
      bp: document.body.classList.contains('paused'), c: getComputedStyle(document.body).cursor })`);
  }
  ok('T1 pause: RESUME closes the card, clears body.paused, cursor re-hides into play',
    rzT1b.p === false && rzT1b.h === true && rzT1b.bp === false && rzT1b.c === 'none', JSON.stringify(rzT1b));

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
  const cs = async () => J(`({ s: __stage2.combatState().speed, h: __stage2.combatState().heading, x: __stage2.combatState().pos[0], y: __stage2.combatState().pos[1], z: __stage2.combatState().pos[2] })`);
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

  /* --- boundary probes (story-005 soft rim → story-016 SPHERE) ---
     FLAGGED RE-DERIVATION (story-016 record, never a quiet edit): the three story-005 probes
     keep their thresholds but their measurement goes 2D → 3D — r3 = |pos − O| with
     O = (0, ARENA_Y, 0) — and the sphere walk ADDS the pitched-clamp drive (S16 sphere section
     below). On the 015 build these re-derived asserts stay GREEN by design: their drives are
     planar (pitch 0, y ≡ 18) so r3 ≡ hypot(x,z) there; the r3 form is what lets the pitched
     drives discriminate (the 015 band build reached r3 ≈ 82.5 = hypot(80, 20) legally).
     STORY-016 MUTATION RECORDS (branch, post-green, 2026-11-05; each: mutate → npm run
     build → full flow-check → restore → rebuild; verified applied by reading the red output):
       1. combat.js `R_HARD 80 → 90` (predecessor) → RED `hard clamp under pitched boost`
          (maxR3 90.00). `boundary is a sphere` stays green: its 7b drive breaks at r3 ≥ 79
          before the inflated 90 clamp can be seen — the pitched-clamp assert is the one the
          threshold change discriminates (flow-mutation-rhard90.txt, 104/1).
       2. combat.js boundary floor `Math.max(3, …)` → 0 → RED `rim floor keeps progress at
          the deep shell` (deepRadial 1.63 < 2.5, 3 samples — the pure linear-cap asymptote
          returns). Adjacent keep-passing: `soft shell bleeds` + `boundary is a sphere` green
          (flow-mutation-floor3.txt, 104/1).
       3. combat.js hard spherical clamp REMOVED → RED `hard clamp under pitched boost`
          (maxR3 88.04). The run then ABORTS at the natural-death wait: with no clamp the
          ship leaves the bounded arena and outruns the ≤12 u/s raiders, so nothing kills it
          in 90 s. Same run with the clamp threshold 80 → 92 reds identically (maxR3 88.40)
          and aborts identically — no full-suite hard-clamp mutation exists; the abort is a
          structural side effect of any outward-breach mutation, not a product defect
          (flow-mutation-hardclamp.txt, 25 passed + target red + abort).
       4. combat.js tangential preservation removed (excess-subtraction → full-component
          zeroing, cap kept) → RED `rim slides along the shell` (carry 3.5 < 5) + two
          same-root downstream reds: with tangential dead the ship lingers on the shell, so
          the return dive never crosses r3<58∧dY>16 in its 10 s window → `#warn clears` and
          `rim ring opacity inside` also red (sample-miss). The cap-form asserts (`soft shell
          bleeds`, `rim floor`) stay green (flow-mutation-tangential.txt, 102/3).
       5. combat.js camera lift +3.4 → −6 (the down-side ceiling mechanism inverted) → RED
          `camera look-target rides the pitched nose` (down 46.46° > 35; up 12° inside — a
          single-bound red). Adjacent keep-passing: `rendered nose` + all else green
          (flow-mutation-camceil.txt, 104/1).
       6. enemies.js separation dy term dropped → NO RED (105/105 green — flow-mutation-
          raidersepdy.txt). BLOCKED finding: the R-f guard does not discriminate dy alone;
          disabling the WHOLE separation block drops maxPairDist to 0.49 (would red), so the
          guard tests separation, but live wave raiders in scratch push the co-located probe
          pair apart in XZ regardless of dy (the lockstep precondition does not hold on the
          live combat page). Surfaced in the story-016 report. */
  const r3Of = (p) => Math.hypot(p.x, p.y - 18, p.z);
  const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  // 7 — boosted straight out: (a) boost expiry BLEEDS, never snaps (review R2-1: the old branch
  // order snap-clamped 32→17 in one frame — assert drop rate ≤ 25 u/s², bleed is 22, snap ~38);
  // (b) radial speed bleeds inside the soft shell (design cap 17·(80−r3)/20 floored at 3 — old
  // build measured 29.8 here); (c) NEW (story-016): the 3 u/s floor is LOAD-BEARING at the deep
  // shell (r3 ≥ 77.8, where the linear cap alone drops below 3) — story-005 measured the pure
  // linear cap creeping 79.06 → 78.67 → 78.11 ("stuck" in softer clothing); the floor keeps
  // ≥ 2.5 u/s of outward progress there. alive() runs INSIDE the loop: a mid-probe death would
  // otherwise let slow-mo trivially pass all three (review R2-5).
  await alive('boundary probe');
  let maxRadial = 0, rimSamples = 0, maxDropRate = 0, maxDeepRadial = 0, deepSamples = 0,
    prev = await cs(), prevT = Date.now();
  await key('KeyW', 'keydown'); await key('Space', 'keydown');
  for (let i = 0; i < 20; i++) {
    await alive('boundary loop');
    await sleep(250);
    const s = await cs(); const t = Date.now();
    const dtS = (t - prevT) / 1000;
    const r3 = r3Of(s), pr3 = r3Of(prev);
    if (pr3 < 60) maxDropRate = Math.max(maxDropRate, Math.abs(s.s - prev.s) / dtS);
    if (pr3 > 65 && pr3 < 78 && r3 > pr3) { rimSamples++; maxRadial = Math.max(maxRadial, (r3 - pr3) / dtS); }
    if (pr3 >= 77.8 && r3 > pr3) { deepSamples++; maxDeepRadial = Math.max(maxDeepRadial, (r3 - pr3) / dtS); }
    prev = s; prevT = t;
    if (r3 >= 79) break;
  }
  await key('Space', 'keyup');
  ok('boost expiry bleeds (drop ≤25 u/s², no snap)', maxDropRate <= 25, `maxDropRate=${maxDropRate.toFixed(1)}`);
  ok('soft shell bleeds radial speed in 3D (≤13, sampled r3 65–78)', rimSamples > 0 && maxRadial <= 13, `maxRadial=${maxRadial.toFixed(1)} samples=${rimSamples}`);
  ok('rim floor keeps progress at the deep shell (≥2.5 u/s, sampled r3 ≥ 77.8)', deepSamples > 0 && maxDeepRadial >= 2.5, `deepRadial=${maxDeepRadial.toFixed(2)} samples=${deepSamples}`);

  // 7b — the hard clamp is a sphere: diagonal flight can't reach a corner
  await keyHold('KeyD', 4000); // W still held; new scheme arcs, old scheme pinned r≈113 here
  const p7 = await cs();
  ok('boundary is a sphere (r3 ≤ 81)', r3Of(p7) <= 81, `r3=${r3Of(p7).toFixed(1)}`);

  // 8 — shell slides, never pins. Deterministic rim approach (review R2-6: the 7b arc can end
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
    if (r3Of(s) >= 75) break;
  }
  await key('Space', 'keyup');
  const p8 = await cs();
  ok('rim precondition (ship at the rim, r3 ≥ 72)', r3Of(p8) >= 72, `r3=${r3Of(p8).toFixed(1)}`);
  await keyHold('KeyD', 300); // ~0.66 rad oblique
  const p8b = await cs();
  await sleep(1600); // W still held
  const q8 = await cs();
  await key('KeyW', 'keyup');
  ok('rim slides along the shell (carry >5u over 1.6s)', dist3(p8b, q8) > 5, `d=${dist3(p8b, q8).toFixed(1)}`);

  /* --- story-016 sphere walk: pitched-clamp drive + shell #warn + rim ring 3D opacity ---
     RED on the 015 build FOR REAL (flow-red-story016.txt): the band scaffold clamps XZ at 80
     and |y−18| at 20, so a pitched boost climb legally reaches r3 ≈ hypot(80, 20) ≈ 82.5 > 81;
     the band #warn grammar stays ON whenever |y−18| > 16 (never clears "inside the shell" at
     altitude); the rim opacity driver reads 2D proximity (0 at the 72°-climb hold where
     r3 ≥ 78 but r2D ≈ 24). The drive: recenter → full pitch + W + boost to the shell → 3 s
     hold at the clamp (peak + opacity sampled) → dive back inside (warn must CLEAR at
     r3 < 58 while dY > 16, opacity 0). */
  await alive('sphere recenter');
  await keyHold('KeyS', 1200);
  const sc0 = await cs();
  let dhIn = Math.atan2(-sc0.x, -sc0.z) - sc0.h; // heading that points at the center
  while (dhIn > Math.PI) dhIn -= 2 * Math.PI; while (dhIn < -Math.PI) dhIn += 2 * Math.PI;
  await keyHold(dhIn > 0 ? 'KeyA' : 'KeyD', Math.round(Math.abs(dhIn) / 2.2 * 1000) + 120);
  await key('KeyW', 'keydown'); await key('Space', 'keydown');
  for (let i = 0; i < 24; i++) {
    await alive('sphere recenter loop');
    await sleep(250);
    if (r3Of(await cs()) <= 15) break;
  }
  await key('Space', 'keyup'); await key('KeyW', 'keyup');
  await alive('pitched climb');
  await key('KeyW', 'keydown'); await key('Space', 'keydown'); await key('KeyR', 'keydown');
  let maxR3 = 0, warnSeen3D = false, opacityShell = null;
  for (let i = 0; i < 120; i++) { // ≤ ~42 s: the 015 build needs ~14 s to crawl to the band corner
    await alive('pitched climb loop');
    await sleep(250);
    const s = await cs(); const rv = r3Of(s);
    maxR3 = Math.max(maxR3, rv);
    if (rv > 62 && !(await evl(`document.getElementById('warn').hidden`))) warnSeen3D = true;
    if (rv >= 78) break;
  }
  for (let i = 0; i < 12; i++) { // 3 s hold AT the shell — the clamp state is steady; sample peak + opacity
    await sleep(250);
    const s = await cs(); const rv = r3Of(s);
    maxR3 = Math.max(maxR3, rv);
    if (rv >= 78) opacityShell = await evl(`__stage2.combatState().rimOpacity`);
  }
  await key('KeyR', 'keyup'); await key('Space', 'keyup'); await key('KeyW', 'keyup');
  ok('hard clamp under pitched boost (r3 ≤ 81)', maxR3 <= 81, `maxR3=${maxR3.toFixed(2)}`);
  ok('#warn fires entering the soft shell (visible at r3 > 62)',
    warnSeen3D === true, `seen=${warnSeen3D}`);
  await alive('sphere return');
  await keyHold('KeyF', 1400); // pitch +72° → −72° at 1.8 rad/s — dive
  const sc1 = await cs();
  let dhBack = Math.atan2(-sc1.x, -sc1.z) - sc1.h;
  while (dhBack > Math.PI) dhBack -= 2 * Math.PI; while (dhBack < -Math.PI) dhBack += 2 * Math.PI;
  await keyHold(dhBack > 0 ? 'KeyA' : 'KeyD', Math.round(Math.abs(dhBack) / 2.2 * 1000) + 120);
  let warnCleared = false, opacityInside = null, clearedAt = null;
  for (let i = 0; i < 40; i++) { // ≤ ~14 s: cruise (speed holds at 17) carries the ship inward-down
    await alive('sphere return loop');
    await sleep(250);
    const s = await cs(); const rv = r3Of(s); const dya = Math.abs(s.y - 18);
    if (rv < 58 && dya > 16) {
      warnCleared = (await evl(`document.getElementById('warn').hidden`)) === true;
      opacityInside = await evl(`__stage2.combatState().rimOpacity`);
      clearedAt = { r3: +rv.toFixed(1), dY: +dya.toFixed(1) };
      break;
    }
  }
  ok('#warn clears inside the shell (hidden at r3<58, dY>16 — band grammar cannot)', warnCleared === true, JSON.stringify(clearedAt));
  ok('rim ring opacity tracks 3D proximity (>0 at r3 ≥ 78, 0 inside)', opacityShell > 0 && opacityInside === 0, `shell=${opacityShell} inside=${opacityInside}`);

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
    teleText: document.getElementById('tele').textContent,
  })`);
  ok('REPLAY → pad: card/title hidden', rp.goHidden === true && rp.titleHidden === true, JSON.stringify(rp));
  ok('REPLAY → pad: hud visible, reticle off', rp.hudHidden === false && rp.reticleHidden === true, JSON.stringify(rp));
  ok('REPLAY → pad: #tele empty (TD-014)', rp.teleText === '', `tele=${JSON.stringify(rp.teleText)}`);

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
  // Stage-2 review (finding 2): the page-level CONSOLE asserts — the final "CONSOLE []" only
  // ever saw the LAST page (the fault pages reset the buffer), so pages 1-3's console output
  // was unchecked. Each clean page now asserts its own console before the next navigate.
  // SENSITIVITY MUTATION (2026-11-05, recorded): a temporary console.error('[stage2] probe')
  // injected at the top of enterCombat turned THIS assert red while everything else stayed
  // green (flow-mutation-consolepage.txt) — the assert measures what its name claims.
  ok('CONSOLE [] (flow page)', errs.length === 0, errs.join(' | '));
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

  /* --- story-013 boss probe (?bossProbe=1, second page over the SAME CDP session) ---
     Deterministic single-boss run: ?bossProbe=1 skips the wave-5 wait and spawns the boss
     26 u ahead 0.4 s into combat, then drives it end-to-end — 3 real bolts into the weak
     node vs 3 into the ring hull (equal streams; damage ratio must be 3×), scripted damage
     through the HP thresholds (orbit → charge → rage, in order), then hp 0 → slow-mo death
     cinematic → bossDefeated report. RED record 2026-11-04 (master build @ b0eff8d, product
     code untouched, only this harness differs): 10 of the 11 new boss asserts FAIL — no
     boss.js exists on master, ?bossProbe=1 is unread so window.__stage2.bossProbe never
     appears and the deadline expires (each probe assert records its red from the null
     probe). The 11th, `boss slot null before spawn`, is GREEN on master BY DESIGN — the
     story-012 field shape is the keep-passing guard (recorded in the entry block above).
     MUTATIONS (branch, post-green, each: mutate → npm run build → full flow-check → restore):
       1. boss.js WEAK_MULT 3 → 1          → RED `weak point 3× damage` (ratio 1)
       2. boss.js CHARGE_AT 0.66 → 0       → RED `phases entered in order` (charge never
                                             entered; phaseLog ["orbit","rage"])
       3. combat.js TD-014 #tele clear out → RED `REPLAY → pad: #tele empty` (stale SPD line)
       4. loop.js probs.post='direct' out  → RED `TD-013 composer throw degrades` (post
                                             stays 'bloom'; degrade itself still runs)
     Full outputs: production/qa/evidence/story-013-boss/flow-*.txt. */
  ok('CONSOLE [] (droneProbe page)', errs.length === 0, errs.join(' | '));
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat&bossProbe=1' });
  let bp = null;
  let hudBossSeen = false;
  let w1BossSamples = 0, w1BossKindLock = false; // stage-6 W1 rider (sampled below)
  {
    const t0 = Date.now();
    for (;;) {
      // guarded + thrown-tolerant (droneProbe pattern): across Page.navigate the old
      // execution context dies — raw reads throw and would kill the run before the asserts
      try {
        const csx = await J(`(window.__stage2 && __stage2.combatState) ? __stage2.combatState() : null`);
        if (csx && csx.boss) { // sample the boss BAR element while the boss lives — independent of the probe's own record
          // stage-6 H1 SANCTIONED REWRITE (2026-11-08, stage-5 precedent one-shot-work/stage-5/
          // GATE.md:18-22): this sampling read the #hud-bars TEXT for 'BOSS' (the story-013
          // text-line presentation of boss HP). H1 removes the text line from the writer's
          // string — the dedicated #boss-bar element owns boss HP now (polish-plan H1-1/2) —
          // so the sample reads the element's unhidden + labeled state instead. Exact coverage
          // preserved: the same alive-window visibility witness, surface moved text → element.
          const bb = await J(`(() => { const el = document.getElementById('boss-bar');
            return el ? { hidden: el.hidden, labeled: (el.textContent || '').includes('BOSS') } : null; })()`);
          if (bb && bb.hidden === false && bb.labeled) hudBossSeen = true;
          // stage-6 W1 rider: the lock surface, sampled live while the boss lives (it sweeps its
          // orbit through every azimuth — including the nose cone). The bracket must never
          // anchor the boss: raiders locking is legitimate and ignored; only a boss-kind target
          // reds. The DETERMINISTIC exclusion proof is the fireProbe walk's boss stage; this is
          // the in-the-wild second witness. Pre-W1 build: csx.lockTarget undefined → samples stay 0.
          if (csx.lockTarget !== undefined) { w1BossSamples++; if (csx.lockTarget && csx.lockTarget.kind === 'boss') w1BossKindLock = true; }
        }
        bp = await J(`(window.__stage2 && window.__stage2.bossProbe) || null`);
      } catch { bp = null; }
      if (bp) break;
      if (Date.now() - t0 > 90000) break; // deadline — the asserts below record the red
      await sleep(300);
    }
  }
  const bpX = bp || {};
  ok('bossProbe reports (story-013)', !!bp, JSON.stringify(bp));
  ok('boss forces immediately (spawned at wave 1, wait skipped)', bpX.spawnWave === 1, `spawnWave=${bpX.spawnWave}`);
  ok('boss phases entered in order orbit→charge→rage', JSON.stringify(bpX.phases) === '["orbit","charge","rage"]', JSON.stringify(bpX.phases || null));
  ok('weak point 3× damage (3 node bolts vs 3 hull bolts)', bpX.weakHits === 3 && bpX.bodyHits === 3 && bpX.ratio === 3,
    `w=${bpX.weakHits}hits/${bpX.weakDmg}dmg b=${bpX.bodyHits}hits/${bpX.bodyDmg}dmg r=${bpX.ratio}`);
  ok('charge dash launches and overshoots (no full stop)', bpX.chargeDash === true && bpX.overshoot === true,
    `dash=${bpX.chargeDash} over=${bpX.overshoot}`);
  /* --- story-016 boss dash shell guard (GDD §5.3) ---
     The drive now PARKS THE SHIP on the shell (r3 = 78, on the boss's spawn ray so the dash
     reads radial) at charge-stage entry — probe-owned precondition (pitchProbe re-seat
     precedent). An UNclamped dashTarget captured there sits at r3 78 and the 10 u OVERSHOOT
     carries the boss to r3 ≈ 88; the clamp (boss.js launchDash, the ONE story-016 line) pulls
     the captured target to r3 ≤ 68 = R_HARD − OVERSHOOT − 2, so the dash peaks at ≈ 78 and
     re-orbits inside. dashPeakR3 = max boss r3 sampled every drive tick across the charge
     stage (the dash IS the peak — the pre-dash orbit holds ≤ ~48 from the parked ship);
     reorbitR3 = boss r3 at rage-stage exit (death-stage entry), ~0.8 s after the dash ends.
     RED on the 015 build: the fields do not exist (015 probe pattern — red by absence).
     MUTATION (branch, post-green, 2026-11-05): boss.js launchDash clamp line removed → RED
     `boss dashTarget clamped inside the shell` (peak 87.99 > 80) AND `boss stays inside
     mid-dash and re-orbits inside` (reorbit 87.96 > 85 — the unclamped overshoot leaves the
     boss outside the shell past rage exit). Adjacent keep-passing: `boss phases entered in
     order`, weak-point ratio, overshoot, slow-mo all green (flow-mutation-bossdash.txt,
     103/2). */
  ok('boss dashTarget clamped inside the shell (dash peak r3 ≤ 80 = 68 + OVERSHOOT + margin)',
    typeof bpX.dashPeakR3 === 'number' && bpX.dashPeakR3 <= 80, `peak=${bpX.dashPeakR3} park=${bpX.parkR3}`);
  ok('boss stays inside mid-dash and re-orbits inside (peak ≤ 92, re-orbit r3 ≤ 85)',
    typeof bpX.reorbitR3 === 'number' && bpX.dashPeakR3 <= 92 && bpX.reorbitR3 <= 85, `peak=${bpX.dashPeakR3} reorbit=${bpX.reorbitR3}`);
  /* --- story-016 FIX PASS (quality-review finding 1): boss POLE-park dash guard ---
     The shell-guard drive above parks the ship on the EQUATOR (0,18,78); the operator-order bug
     in boss.js:179 (`.sub(ARENA_O)` mutates dashTarget before the setLength argument evaluates)
     happens to clamp the equator case correctly — measured |O − (P−O)| = 80.05 ≥ 68, so the
     clamp still fires. Verified on the buggy build: top-pole park (0,96,0) → the measured
     distance collapses to 60 < 68, so Math.min(60,68) + setLength(60) pulls the captured target
     INWARD to r3 60 instead of clamping to 68; mid-sphere (0,60,30) → measured 38.4 pulls
     inward to r3 51.6. The line works for exactly one point on the sphere. The drive stages a
     SECOND dash: after the equator dash completes it re-parks the ship at the top pole
     (0,96,0), waits out the boss's altitude-climb transient (1 s sustained < 20 u/s), then
     watches for the dash's 30 u/s burst (the pole dash launches from the top of the climb
     orbit, so the dash direction is flat). The captured value is the clamp's own computed
     radius — BOSS.probeStats().dashCapR3, set inside launchDash's clamp block (the probe seam;
     the dash's OBSERVABLE endpoint is invariant to the clamp in this geometry because the
     overshoot projection along the flat dash direction cancels the vertical target delta —
     peak clause deviation: the phase-wide boss r3 peak legitimately reaches ~105 during the
     post-arm orbit climb on the FIXED build too, so the ≤80 bound is only asserted for the
     equator dash above).
     RED-FIRST (2026-11-05): pole scenario added, current boss.js has no dashCapR3 seam → RED
     (targetR3 null — red by absence). POST-FIX mutation (restored buggy chain, seam kept) →
     RED with the real number: targetR3 60.0. flow-red-bosspole.txt / flow-mutation-bosspole.txt. */
  ok('boss pole-park dashTarget clamped inside the shell (captured r3 68 ±0.5 — operator-order bands 60 and 78 both red)',
    typeof bpX.poleDashCapR3 === 'number' && bpX.poleDashCapR3 >= 67.5 && bpX.poleDashCapR3 <= 68.5,
    `targetR3=${bpX.poleDashCapR3} peak=${bpX.poleDashPeakR3}`);
  ok('boss death slow-mo engaged', bpX.deathSlowmo === true, `slowmo=${bpX.deathSlowmo}`);
  ok('bossDefeated reported via api.report', bpX.bossDefeated && bpX.bossDefeated.slowmo === true,
    JSON.stringify(bpX.bossDefeated || null)); // the drive observed the death report (lastReport is single-slot; the probe carries what it saw)
  /* --- stage-6 H1 SANCTIONED ASSERT REWRITES (stage-5 precedent one-shot-work/stage-5/
     GATE.md:18-22) — REWRITTEN 2026-11-08, branch polish/stage6-experience.
     The two story-013 BOSS-line asserts read the #hud-bars TEXT LINE ('BOSS ▍▍▍ 62%'). H1
     moves boss HP to a dedicated #boss-bar element fed from BOSS.state() {hp,maxHp}
     (polish-plan H1-1/H1-2): the text line is removed from the writer's string, so the text
     asserts would keep pinning a removed presentation. Exact-coverage mapping:
       'BOSS HP line shows in #hud-bars while alive' → 'H1: BOSS HP bar element shows while
         alive' — the drive's BP.hud field AND this harness's independent sampling were
         rewritten to the same alive-window witness on the new surface (element unhidden +
         labeled). Coverage identical, surface text → element.
       'BOSS HP line gone from #hud-bars after death' → 'H1: BOSS HP bar element gone after
         death' — same post-death absence, read as the element's hidden state (the writer
         hides it the moment BOSS.state() drains; clearCombat drains it again).
     PRESERVED contract: the "never render BOSS 0% while dying" rule (boss.js:389's comment)
     is now ASSERTED — the drive samples the dying window and the bar must be absent (below).
     BYTE-INTACT: 'combatState().boss drains to null after death' (next assert) untouched;
     the W1 lock-sampling assert after it untouched.
     RED-FIRST 2026-11-08: on the pre-H1 build #boss-bar does not exist — every rewritten
     assert reads null/undefined → RED (element absence, the sanctioned red). Transcript:
     production/qa/evidence/stage6-h1/flow-red-h1.txt. */
  ok('H1: BOSS HP bar element shows while alive (unhidden + labeled; rewrites the story-013 BOSS text-line assert — sanctioned, see the block above)',
    bpX.hudLine === true || hudBossSeen, `probe=${bpX.hudLine} sampled=${hudBossSeen}`);
  ok('H1: BOSS HP bar element gone after death (hidden — rewrites the gone-from-#hud-bars assert; sanctioned, see the block above)',
    (await evl(`(document.getElementById('boss-bar') || { hidden: null }).hidden`)) === true);
  ok('H1: boss bar fill tracks hp (the 5%-stepped rounded fraction of BOSS.state() hp/maxHp, change-gated — the charge-meter pattern; the drive sampled the fill against its scripted hp state)',
    typeof bpX.barPct === 'number' && bpX.maxAtBar > 0 &&
    bpX.barPct === Math.round((bpX.hpAtBar / bpX.maxAtBar) * 20) * 5,
    `pct=${bpX.barPct} hp=${bpX.hpAtBar}/${bpX.maxAtBar}`);
  ok('H1: the bar never renders BOSS 0% while dying (mirror of boss.js barLine:389 — absent through the whole death cinematic; the drive sampled the dying window)',
    bpX.dyingSamples > 0 && bpX.barElSeen === true && bpX.dyingBarVisible !== true,
    `samples=${bpX.dyingSamples} elSeen=${bpX.barElSeen} visibleDuringDying=${bpX.dyingBarVisible}`);
  ok('H1: kill-only hit markers — the 6 real non-kill hits (weak+body ratio bolts) never mark, and the marker element exists',
    bpX.markSamples > 0 && bpX.markElSeen === true && bpX.markOnHit !== true,
    `samples=${bpX.markSamples} elSeen=${bpX.markElSeen} markedOnHit=${bpX.markOnHit}`);
  ok('combatState().boss drains to null after death', await evl(`__stage2.combatState().boss`) === null,
    JSON.stringify(await J(`__stage2.combatState().boss`)));
  // stage-6 W1 rider: the lock never brackets the boss while it lives (sampled above through the
  // boss's whole orbit sweep — the boss crosses the nose cone, where a lockable boss would be
  // acquired). RED on the pre-W1 build (lock surface absent → samples 0 — red by absence).
  ok('W1: lock never brackets the boss (bossProbe live sampling across the orbit sweep; lock surface exposed)',
    w1BossSamples > 0 && w1BossKindLock === false, `samples=${w1BossSamples} bossKindLock=${w1BossKindLock}`);

  /* --- story-014 victory card (same page: the bossDefeated signal lands victory mid-drive) ---
     Trigger path: combat.js's C.bossApi.report wrapper — the death cinematic's report lands
     through the EVENT path (report first, probe parity kept), then combat.js fires
     go('victory') guarded by !C.dead. Deliberately NOT a lastReport-slot poll: a player death
     during the 1.2 s cinematic tears combat down before any slot poll could run, orphaning
     the signal — the wrapper runs inside the report call itself, so nothing can orphan it.
     The bossProbe drive completes in the same frame (its death-stage check runs after
     BOSS.tickBoss), so the probe object and the victory card arrive together and every
     story-013 assert above still reads true.
     RED record 2026-11-04 (pre-victory build = story-013's committed index.html @ c916621,
     product code untouched, only this harness differs): 58 passed / 11 failed — 11 of the 13
     new asserts FAIL (the victory poll expires — the old build continued waves after boss
     death — and every dependent assert records its red from victoryLanded=false /
     padLanded=false; the freeze assert fails on df=null because combatState().time does not
     exist pre-story-014). Keep-passing on old BY DESIGN: `player death ... lands gameover`
     (the roaming wave-1 raiders killed the stationary player naturally inside the deadline
     window — the mutual-exclusion keep-passing holds on BOTH builds) and `no double-fire` is
     vacuous (no victory can exist on old).
     MUTATIONS (branch, post-green, each: mutate → npm run build → full flow-check → restore):
       1. combat.js bossApi.report wrapper's go('victory') removed → RED story-014 landing +
          card + REPLAY + second-run asserts (the drive then completes without victory, as on old)
       2. combat.js enterCombat `C.time = 0` removed → RED `second run baseline clean + clock
          reset` (the victory run's clock rides into the fresh combat)
       3. combat.js tickCombat freeze guard removed (`if (!C.dead)` → unconditional accrual) →
          RED `combat clock frozen while dead` (t2 − t1 ≈ 0.15 over 0.5 s of 0.3× slow-mo)
       4. main.js ui.victory dropped from OVERLAY_ELMS → RED `victory REPLAY → pad: cards
          hidden` (the sweep never hides the card; the pad keeps it up)
       5. combat.js clearCombat's edge-pip drain removed → RED `victory REPLAY → pad: edge
          pips drained` (combat's last-frame pip state rides the pad)
     Full outputs: production/qa/evidence/story-014-victory/flow-*.txt.
     FOUND-DEFECT FIX (in-story): the pre-fix pad capture (s14-replay-pad-stale-pip-prefix.png)
     shows a stale edge pip riding the pad after the victory REPLAY — combat's last-frame pip
     state was never drained (clearCombat resets #hud-bars/#tele/#warn but not the pips;
     pre-existing on master — the death-card REPLAY has the same leak). The natural stale pip
     depends on raider bearings at the final combat frame (flaky), so the assert paints every
     pip ON at the card and asserts the pad drained them — a deterministic proxy for
     "clearCombat clears pip state". */
  let vic = null;
  {
    const t0 = Date.now();
    for (;;) {
      try {
        const v = await J(`({ p: (window.__stage2 && __stage2.phase) || 'boot', n: (window.__stage2 && __stage2.victoryEntries) || 0 })`);
        if (v.p === 'victory') { vic = v; break; }
      } catch { vic = null; }
      if (Date.now() - t0 > 30000) break; // deadline — the asserts below record the red
      await sleep(250);
    }
  }
  const vicLanded = !!vic;
  ok('story-014: victory phase lands exactly once', vicLanded && vic.n === 1,
    vicLanded ? `entries=${vic.n}` : 'victory never landed (old build: waves continue after boss death)');
  const vicDom = vicLanded ? await J(`({
    vicHidden: document.getElementById('victory').hidden,
    goHidden: (document.getElementById('gameover') || {hidden: true}).hidden,
    score: document.getElementById('vic-score').textContent,
    time: document.getElementById('vic-time').textContent,
    clock: __stage2.combatState().time,
    internal: __stage2.combatState().score,
  })`) : null;
  const vx = vicDom || {};
  ok('story-014: victory card visible (gameover stays hidden)', vicLanded && vx.vicHidden === false && vx.goHidden === true,
    vicLanded ? JSON.stringify(vx) : 'victory never landed');
  ok('story-014: victory score text (SCORE — N)', vicLanded && /^SCORE — \d+$/.test(vx.score || ''),
    vicLanded ? `score=${JSON.stringify(vx.score)}` : 'victory never landed');
  ok('story-014: victory time text (TIME — M:SS)', vicLanded && /^TIME — \d+:\d\d$/.test(vx.time || ''),
    vicLanded ? `time=${JSON.stringify(vx.time)}` : 'victory never landed');
  ok('story-014: combat clock accrued (combatState().time > 0)', vicLanded && (vx.clock || 0) > 0,
    vicLanded ? `clock=${vx.clock}` : 'victory never landed');
  ok('review: bossDefeated reported exactly once (victory path)', (await evl(`window.__stage2.bossDefeatedReports || 0`)) === 1,
    `reports=${await evl(`window.__stage2.bossDefeatedReports || 0`)}`);
  // Stage-2 review (finding 3): the card froze its score BEFORE the same tick's wavesTick
  // granted the wave-clear bonus (+SCORE_WAVE × wave with the field now clear) — the card's
  // "final score" was not the internal final. RED on the pre-fix build (card 0 / internal
  // 900 with the drive's cleared field); GREEN once wavesTick yields to the victory frame.
  ok('review: victory card score equals the internal final score',
    vicLanded && (() => { const m = /^SCORE — (\d+)$/.exec(vx.score || ''); return !!m && Number(m[1]) === vx.internal; })(),
    vicLanded ? `card=${JSON.stringify(vx.score)} internal=${vx.internal}` : 'victory never landed');
  /* --- story-019: the locked flat boss reward (SCORE_BOSS = 1000) ---
     RED-FIRST (2026-11-06, story-018 gate build @ 37abb72 — product code untouched, only this
     harness differs): on that build the boss death awards NOTHING (combat.js's bossDefeated
     branch only counts reports and fires victory — the card freezes the PRE-award score), so
     `internal` reads 0 here and BOTH new asserts fail for exactly the missing-award reason.
     The drive's pre-boss score is deterministically 0: bossProbe clears the field at spawn,
     the alive boss blocks wave progression (no wave-clear bonus), nothing else scores.
     Record: production/qa/evidence/story-019-elites-waves-telemetry/flow-red-story019.txt. */
  ok('story-019: victory final score = pre-boss score + 1000 exactly (SCORE_BOSS, locked)',
    vicLanded && vx.internal === 1000,
    vicLanded ? `internal=${vx.internal} (pre-boss 0 + SCORE_BOSS 1000 expected)` : 'victory never landed');
  ok('story-019: +1000 writes through to the highscore (victory.enter writeHighscore, persist → read back)',
    vicLanded && (await evl(`window.__stage2.highscore`)) === 1000,
    vicLanded ? `highscore=${await evl(`window.__stage2.highscore`)}` : 'victory never landed');
  if (vicLanded) {
    // deterministic stale-pip proxy (see the block comment): paint every edge pip ON at the
    // card — the pad must not inherit combat's pip state (clearCombat drains it)
    await evl(`[...document.getElementById('hud').children].filter((c) => (c.style.clipPath || '').includes('polygon')).forEach((c) => { c.style.opacity = '1'; })`);
    await evl(`document.getElementById('vic-replay').click()`);
  }
  let rp14 = null;
  {
    const t0 = Date.now();
    for (;;) {
      try { rp14 = await J(`({ p: (window.__stage2 && __stage2.phase) || 'boot' })`); if (rp14.p === 'pad') break; } catch { rp14 = null; }
      if (Date.now() - t0 > 15000) break;
      await sleep(200);
    }
  }
  const padLanded = !!rp14 && rp14.p === 'pad';
  const vd = padLanded ? await J(`({
    vicHidden: document.getElementById('victory').hidden,
    goHidden: (document.getElementById('gameover') || {hidden: true}).hidden,
    titleHidden: document.getElementById('title').hidden,
    hudHidden: document.getElementById('hud').hidden,
    reticleHidden: document.getElementById('reticle').hidden,
    pipCount: [...document.getElementById('hud').children].filter((c) => (c.style.clipPath || '').includes('polygon')).length,
    pipsOn: [...document.getElementById('hud').children].filter((c) => (c.style.clipPath || '').includes('polygon')).filter((c) => c.style.opacity !== '0').length,
  })`) : null;
  const vdx = vd || {};
  ok('story-014: victory REPLAY → pad (same landing as the death card)', padLanded, padLanded ? 'pad' : 'no pad landing');
  ok('story-014: victory REPLAY → pad: cards hidden (sweep)', padLanded && vdx.vicHidden === true && vdx.goHidden === true && vdx.titleHidden === true,
    padLanded ? JSON.stringify(vdx) : 'no pad landing');
  ok('story-014: victory REPLAY → pad: hud visible, reticle off', padLanded && vdx.hudHidden === false && vdx.reticleHidden === true,
    padLanded ? JSON.stringify(vdx) : 'no pad landing');
  ok('story-014: victory REPLAY → pad: edge pips drained (no stale combat pip state)', padLanded && vdx.pipCount === 8 && vdx.pipsOn === 0,
    padLanded ? JSON.stringify(vdx) : 'no pad landing');
  // stage-6 W1 (hard build constraint 2): the pipper + lock bracket are combat's writes — the
  // pad must never inherit them (clearCombat reset list, same class as the pip drain above).
  // RED on the pre-W1 build: the elements do not exist (red by absence).
  const w1Pad = padLanded ? await J(`({ pip: !!document.getElementById('pipper') && document.getElementById('pipper').hidden,
    br: !!document.getElementById('lock-bracket') && document.getElementById('lock-bracket').hidden })`) : null;
  ok('W1: pad drains the pipper + lock bracket (clearCombat reset list)', !!w1Pad && w1Pad.pip === true && w1Pad.br === true, JSON.stringify(w1Pad));
  // stage-6 H1 (hard build constraint 2): the boss bar + wave banner + hit marker are ALSO
  // combat's writes — the pad never inherits them (clearCombat reset list extended beside the
  // W1 drain above, which stays byte-intact). RED on the pre-H1 build: the elements do not
  // exist (red by absence). bannerVisible false pins the honesty surface too.
  const h1Pad = padLanded ? await J(`({
    bb: (document.getElementById('boss-bar') || { hidden: null }).hidden,
    wb: (document.getElementById('wave-banner') || { hidden: null }).hidden,
    wbText: (document.getElementById('wave-banner') || { textContent: '' }).textContent,
    hm: (document.getElementById('hit-mark') || { hidden: null }).hidden,
    bannerVisible: (window.__stage2 && __stage2.combatState) ? __stage2.combatState().bannerVisible : 'none',
  })`) : null;
  ok('H1: pad drains the boss bar + wave banner + hit marker (clearCombat reset list extended; bannerVisible false)',
    !!h1Pad && h1Pad.bb === true && h1Pad.wb === true && h1Pad.wbText === '' && h1Pad.hm === true && h1Pad.bannerVisible === false,
    JSON.stringify(h1Pad));
  {
    let landed2 = false, cs14 = null, entries2 = 0;
    if (padLanded) {
      const t0 = Date.now();
      while (Date.now() - t0 < 120000) { // pad auto-advances (launch.js tickPad 2.6 s) → walk to combat
        let p = null;
        try { p = await evl(`(window.__stage2 && __stage2.phase) || 'boot'`); } catch {}
        if (p === 'combat') { landed2 = true; break; }
        await sleep(250);
      }
      if (landed2) {
        cs14 = await J(`__stage2.combatState()`);
        entries2 = await evl(`window.__stage2.combatEntries || 0`);
      }
    }
    ok('story-014: second run after REPLAY reaches combat', landed2,
      landed2 ? `entries=${entries2}` : (padLanded ? 'no combat landing' : 'REPLAY never landed'));
    ok('story-014: second run baseline clean + clock reset', !!cs14 && cs14.hp === 100 && cs14.shield === 50 &&
      cs14.score === 0 && cs14.wave === 1 && cs14.boss === null && cs14.time < 2, JSON.stringify(cs14 || null));
  }

  /* --- TD-013 (?composerFault=1, third page): never-crash render path ---
     loop.js renders through the composer; the fault switch throws INSIDE the guarded render
     call on its first attempt. Asserts: probs.post flips to 'direct' (honest probe surface),
     the game keeps running, and exactly ONE degrade line was logged. */
  ok('CONSOLE [] (bossProbe/victory page)', errs.length === 0, errs.join(' | '));

  /* --- story-015 pitch+drift probe (?pitchProbe=1, next page over the SAME CDP session) ---
     Deterministic full walk (droneProbe/bossProbe pattern): the in-page drive (combat.js
     pitchProbeTick) synthesizes R/F into the real key set, writes the pointer NDC the same
     object steer() reads, and measures — in order — pitch integration, pointer
     direct/mirror/deadzone, the ±72° clamp, drift slip/magnitude/recovery, the sustained-turn
     circle, a pitched bolt through the real spawn path, the 015 band scaffold, and the two
     raider retunes (3D scans + altitude follow). Reports window.__stage2.pitchProbe =
     { entryPitch, dPhi, slip, driftPath, boltRise, band, raiderScan, raiderFollow }
     (+ lastReport parity via api.report). RED record 2026-11-05 (stage-2 close build,
     product code untouched, only this harness differs): 21 of the 22 new asserts FAIL —
     ?pitchProbe=1 is unread so window.__stage2.pitchProbe never appears and the deadline
     expires (each probe assert records its red from the null probe — the exact droneProbe
     red pattern); combatState().pitch/.velMag are undefined (typeof 'undefined'). The 22nd,
     `CONSOLE [] (pitchProbe page)`, is GREEN on the red run BY DESIGN — the unmodified page
     ignores the unknown query flag and dies cleanly to the wave like every other idle-combat
     page. Full output: production/qa/evidence/story-015-pitch-drift/flow-red-story015.txt.
     MUTATIONS (branch, post-green, each: mutate → npm run build → full flow-check → restore;
     the mutation is VERIFIED applied by reading its red output — a silent no-op proves nothing):
       1. combat.js PITCH_RATE 1.8 → 0.9 (2026-11-05) → RED `R 0.4s pitches 0.72 rad`
          (Δφ ≈ 0.36). Adjacent keep-passing: `pitch and yaw independent` stays green — the
          mutation changes rate, not axis coupling.
       2. combat.js ALIGN_RATE 4.5 → 99 (2026-11-05) → RED `drift slip present (20-35°)`
          (slip collapses — ≥ 99 effectively disables drift, GDD §7). Adjacent keep-passing:
          `drift preserves magnitude` stays green (vel stays ≈ forward·speed).
       3. enemies.js bolt×player scan back to XZ (dy² term dropped) (2026-11-05) → RED
          `raider scans 3D` (the elevated raider's bolts hit through 20 u of pure vertical
          separation — the exact anti-camp regression this story fixes). Adjacent
          keep-passing: `raider altitude-follow` stays green.
       4. enemies.js RAIDER_ALT_FOLLOW 1.2 → 0 (2026-11-05) → RED `raider altitude-follow`
          (raiders never climb; the probe's 20 u offset never closes). Adjacent keep-passing:
          the wave-1 raider-count entry assert stays green (spawn logic untouched).
       5. combat.js band guards removed (soft bleed cap AND hard clamp; dY kept for #warn)
          (2026-11-05) → RED `altitude band holds` (maxYDev 34.22) + `band vertical speed
          ≤ 13` (maxVy 16.13). The soft cap alone cannot red assert 17 — the hard clamp is
          absolute (maxYDev stays 20.0), so the story's expected 17-18 pair requires both.
       6. enemies.js ram-contact scan back to XZ (dy² dropped) (2026-11-05, fix pass) → RED
          `raider scans 3D` (ramContact:true AND boltHit:true — the pinned rammer 20 u above
          rams through pure vertical separation, and the ram damage trips the window's
          damage signal). Adjacent keep-passing: `raider altitude-follow` green (meanΔ 5.41).
       7. combat.js look-target y re-pinned to ARENA_Y (2026-11-05, fix pass) → RED `camera
          look-target rides the pitched nose` (viewDirFromUp up 44.53 ≥ the 35° bound;
          down 23.87). REVIEW-DEVIATION, mutation-proven: the prescribed ≥10° floor ALONE
          was run against this mutation FIRST and stayed GREEN (up 44.06 / down 24.52 — the
          re-pin swings the view AWAY from vertical: 25.4→44.1 up, 17.7→24.5 down), so the
          shipped assert keeps the prescribed ≥10° floor in BOTH directions AND adds
          up ≤ 35°, the bound the re-pin violates. Clean-build steady: down 17.71, up 25.42.
     Full outputs: production/qa/evidence/story-015-pitch-drift/flow-mutation-*.txt.
     FIX PASS 2026-11-05 (quality review findings 1,2,3,6,7,11,12,14): slip speed denominator
     now sampled at the SAME tick as velMag (combat.js stage 9) with the floor lowered 0.9 →
     0.85 (drift-off still reads 1.0 — slip + radius remain the drift-off catchers);
     raiderFollow.followN ≥ 1 guard (provenance comment at its assert); viewDirFromUp R1
     camera guard + assert (comment above it); pp.scanG fireT pinned 0.5 (probe-owned
     precondition); probe page stops cruising at the report latch. 23 asserts in this block.
     FLAGGED RE-DERIVATION (assert 14, driftPath): GDD §4.3 / story AC predicted the
     sustained-turn radius GROWS 7.7 → 9-11 u; the approved formula traces it SHRINKING to
     |vel|/ω = 0.898·17/2.2 ≈ 6.94 u (drift reduces |vel| to 0.898·speed in a steady turn —
     simulated at dt 1/30, 1/60, 1/120: mean-to-centroid 7.03 u over one rev from an aligned
     entry, flat build 7.73). The assert encodes the measured build (6.5-7.3 u), NOT the
     predicted number — recorded in the programmer report, never a quiet edit. */
  // stage-6 W1: ?lock=0 forces the aim lock OFF for this page (the probe override) — the
  // pitched-bolt asserts below must see UNBIASED bolts (pre-W1 builds ignore the unknown flag).
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat&pitchProbe=1&lock=0' });
  let pp = null;
  {
    const t0 = Date.now();
    for (;;) {
      // guarded + thrown-tolerant (droneProbe pattern): across Page.navigate the old
      // execution context dies — raw reads throw and would kill the run before the asserts
      try { pp = await J(`(window.__stage2 && window.__stage2.pitchProbe) || null`); } catch { pp = null; }
      if (pp) break;
      if (Date.now() - t0 > 120000) break; // deadline — the asserts below record the red
      await sleep(300);
    }
  }
  const ppX = pp || {};
  const dP = ppX.dPhi || {}, sl = ppX.slip || {}, dpth = ppX.driftPath || {}, br = ppX.boltRise || {},
    spx = ppX.sep || {}, rs = ppX.raiderScan || {}, rf = ppX.raiderFollow || {}, cu = ppX.viewDirFromUp || {};
  const csp = await evl(`(window.__stage2 && __stage2.combatState) ? typeof __stage2.combatState().pitch : 'none'`);
  const csv = await evl(`(window.__stage2 && __stage2.combatState) ? typeof __stage2.combatState().velMag : 'none'`);
  ok('pitchProbe reports (story-015)', !!pp, JSON.stringify(pp));
  ok('combatState exposes pitch + velMag', csp === 'number' && csv === 'number', `pitch:${csp} velMag:${csv}`);
  ok('pitch resets to 0 on entry', ppX.entryPitch === 0, `entryPitch=${ppX.entryPitch}`);
  // story-015 review rider R-b (landed in 016): the 0.4 s window asserts are RATE-CONSISTENCY
  // form — the probe records the window's ACTUAL duration (rHold04s/fHold04s, pp.t − pp.mark,
  // which spans exactly the frames steer() integrated the key) and the assert measures
  // |Δφ − PITCH_RATE·Δt| < 0.02 (PITCH_RATE = 1.8, combat.js const, fixed-knob build). This is
  // fps-independent and tighter than the old absolute ±0.05. FLAGGED assert-form change
  // (story-016 report, rider R-b) — applied to the F mirror too (same assert class).
  ok('R 0.4s window tracks PITCH_RATE·Δt (|Δφ − 1.8·Δt| < 0.02)',
    typeof dP.rHold04 === 'number' && typeof dP.rHold04s === 'number' && Math.abs(dP.rHold04 - 1.8 * dP.rHold04s) < 0.02,
    `dPhi=${dP.rHold04} window=${dP.rHold04s}`);
  ok('pitch and yaw independent (|Δh|<0.02 during R hold)', typeof dP.headingDrift === 'number' && Math.abs(dP.headingDrift) < 0.02, `Δh=${dP.headingDrift}`);
  ok('pointer up pitches up (direct, ≥0.5 rad/1s)', dP.ptrUp >= 0.5, `dPhi=${dP.ptrUp}`);
  ok('pointer down mirrors (≤−0.5 rad)', dP.ptrDown <= -0.5, `dPhi=${dP.ptrDown}`);
  ok('pointer deadzone holds (|Δφ|<0.02 over 1s)', typeof dP.deadzone === 'number' && Math.abs(dP.deadzone) < 0.02, `dPhi=${dP.deadzone}`);
  ok('pitch envelope clamps at 72° (end ±2°, never above)', typeof dP.clampEnd === 'number' && Math.abs(dP.clampEnd - 1.2566) <= 0.035 && dP.clampMax <= 1.2567, `end=${dP.clampEnd} max=${dP.clampMax}`);
  ok('F 0.4s window tracks PITCH_RATE·Δt (|Δφ + 1.8·Δt| < 0.02)',
    typeof dP.fHold04 === 'number' && typeof dP.fHold04s === 'number' && Math.abs(dP.fHold04 + 1.8 * dP.fHold04s) < 0.02,
    `dPhi=${dP.fHold04} window=${dP.fHold04s}`);
  ok('drift slip present (20-35° at 1s full yaw)', typeof sl.deg === 'number' && sl.deg >= 20 && sl.deg <= 35, `slip=${sl.deg}`);
  ok('drift preserves magnitude (velMag ≥ 0.85·speed)', typeof sl.velMag === 'number' && typeof sl.speed === 'number' && sl.velMag >= 0.85 * sl.speed, `velMag=${sl.velMag} speed=${sl.speed}`);
  ok('drift recovers (<8° at 0.8s after release)', typeof sl.recoveredDeg === 'number' && sl.recoveredDeg < 8, `slip=${sl.recoveredDeg}`);
  ok('full-turn circle radius 6.5-7.3 u (FLAGGED: GDD predicted 8.5-11.5, formula traces 6.94 — see block comment + report)', typeof dpth.radius === 'number' && dpth.radius >= 6.5 && dpth.radius <= 7.3, `r=${dpth.radius} max=${dpth.radiusMax}`);
  ok('pitched bolt climbs (>5u over 0.5s)', br.dy > 5, `dy=${br.dy}`);
  // story 7.4: BOLT_SPEED 42 → 70 (weapons.js) — the assert formula reads the new constant (the
  // measured xzSpeed is BOLT_SPEED·cosφ by construction; ±10% band unchanged)
  ok('pitched bolt xz-speed honest (±10% of BOLT_SPEED·cosφ)', typeof br.xzSpeed === 'number' && typeof br.phi === 'number' && Math.abs(br.xzSpeed - 70 * Math.cos(br.phi)) <= 0.1 * 70 * Math.cos(br.phi), `xz=${br.xzSpeed} φ=${br.phi}`);
  // BAND SCAFFOLD RETIRED BY STORY-016 — sphere replaces it (FLAGGED, never a quiet edit).
  // Removed 2026-11-05 with the BAND_H/BAND_HH consts and the band bleed block in combat.js:
  // the three story-015 band asserts ('altitude band holds |y−18| ≤ 20.5', 'band vertical
  // speed ≤ 13 u/s (18-20 layer)', '#warn fires outside the band') are DELETED — the sphere
  // asserts above/below are their replacement. Record: story-016 programmer report
  // (production/qa/evidence/story-016-spherical-arena/) + story-015's pre-declared rider.
  ok('raider scans 3D (20u above: no ram, no bolt hit)', rs.ramContact === false && rs.boltHit === false, JSON.stringify(rs));
  // story-015 review rider R-f (landed in 016): raider separation gains the dy term — XZ-only
  // separation stacks raiders vertically now that altitude-follow (015) exists. The probe
  // spawns two rammers at ONE XZ, 0.5 u apart vertically, wobble phase pinned equal
  // (probe-owned precondition: identical steering + XZ-only separation = lockstep, so only the
  // dy term can part them) and measures the max pairwise 3D distance over the window.
  // HISTORY (2026-11-05): the ORIGINAL guard could not fail under its named mutation — dy
  // removal stayed 105/105 (flow-mutation-raidersepdy.txt) because the live combat page's wave
  // raiders in scratch pushed the co-located pair apart in XZ (3D metric rode the amplification;
  // maxPairDist 2.26 without dy). FIX PASS strengthened the probe: clear the enemy field at
  // window entry (ENEMIES.clearEnemies(), bossProbeTick precedent), bound the window to
  // 1.2 s < the ~1.02 s wave stagger + 55 u re-seed reach (a re-spawned raider cannot cross
  // SEP_RADIUS to the pair in-window), freeze the ship at the center, spawn the pair 50 u
  // ahead, and enforce the XZ lockstep per frame (post-tick snap of A onto B's XZ — the pool's
  // intra-tick order otherwise lets a sub-frame XZ offset appear and the separation force
  // amplifies it). With XZ forced coincident the measured 3D distance IS |Δy|.
  // TRUE STEADY (final tree): maxPairDist ≈ 1.90 (flow-green-rereview.txt — margin 0.40 over
  // 1.5). It saturates BELOW the SEP_RADIUS 2.4 cap because altitude-follow actively opposes
  // the push (A is pulled up, B down, toward the player's y = 18).
  // MUTATION (RE-REVIEW, 2026-11-05 — flow-mutation-raidersepdy3.txt): enemies.js separation
  // `sy` accumulation + y-application dropped → RED `raider separation 3D`, maxPairDist
  // 0.49 (samples 67; 105 passed / 1 failed, pole green). Deterministic: with sy gone the
  // pair's only y-motion is altitude-follow convergence (B.y decays 18.49 → 18.12 while A
  // pins at 18; the measured |Δy| max is the first-frame 0.49). This is the record that
  // evidences the dy isolation. NOTE: the earlier flow-mutation-raidersepdy2.txt (sep GREEN
  // 2.327, samples 73, boss-pole fail by absence targetR3=null) was captured on a NON-FINAL
  // build (pre-lockstep measurement regime) — it does NOT evidence the dy-drop outcome and is
  // retired from that claim. dy3 is the shipped truth.
  ok('raider separation 3D (coincident-stack pair separates > 1.5u)',
    typeof spx.maxPairDist === 'number' && spx.maxPairDist > 1.5, `maxPairDist=${spx.maxPairDist} samples=${spx.samples}`);
  // story-015 review rider R-g (landed in 016): the RENDERED nose sign — no state assert can
  // catch p.rotation.x = −C.pitch flipping, so the probe samples the pose's WORLD-space nose
  // direction (+Z through the pose quaternion) at the B1 R-hold: its y-component must be
  // positive (nose visually up under nose-up pitch). Mutation-proven: flipping the render sign
  // drives it negative (see the story-016 mutation record).
  ok('rendered nose rides the pitch sign (world nose.y > 0 under R hold)',
    typeof ppX.noseUpY === 'number' && ppX.noseUpY > 0, `noseUpY=${ppX.noseUpY}`);
  // followN ≥ 1 (review fix 8): if BOTH probe raiders die the survivor-mean is vacuous (the ÷1 guard reads 0.00).
  // Provenance: red-proof is the EXISTING mutation flow-mutation-altfollow0.txt (RAIDER_ALT_FOLLOW → 0 → meanΔ 20) — no new mutation run for this guard.
  ok('raider altitude-follow (mean Δy ≤ 12 over 3s, ≥1 survivor sample)', typeof rf.meanDelta === 'number' && rf.meanDelta <= 12 && (rf.followN || 0) >= 1, `meanΔ=${rf.meanDelta} offset0=${rf.offset0} followN=${rf.followN}`);
  // R1 regression guard (review fix 3): the chase-cam look-target must ride the pitched nose (story-015 unpin).
  // At max pitch the view direction stays ≥10° off the vertical axis in BOTH directions (measured steady
  // ≈15-18° down / ≈23-25° up). REVIEW-DEVIATION, mutation-proven: the prescribed ≥10° floor ALONE is
  // blind to the re-pin — with the look-target y re-pinned to ARENA_Y the view swings AWAY from vertical
  // (up-hold 25.4 → 44.1°, down-hold 17.7 → 24.5°; floor-only run recorded green, 2026-11-05) — so the
  // shipped assert adds up ≤ 35°, the bound the re-pin violates (flow-mutation-camup.txt). The floor
  // stays for the opposite-class regression (view driven TOWARD vertical).
  // STORY-016 RIDER R-a MUTATION (2026-11-05): camera lift +3.4 → −6 (the down-side ceiling
  // mechanism inverted — the camera sags below the ship at down pitch) → RED on the down
  // bound only: down 46.46° > 35° while up 12° stays inside (flow-mutation-camceil.txt,
  // 104/1). This is what proves the added down-ceiling half discriminates.
  ok('camera look-target rides the pitched nose (R1: view ≥10° off vertical at max pitch both ways, ≤35° up AND down — 016 rider R-a: the down-side ceiling closes the flatten-during-DOWN-pitch regression class)', typeof cu.down === 'number' && typeof cu.up === 'number' && cu.down >= 10 && cu.up >= 10 && cu.up <= 35 && cu.down <= 35, JSON.stringify(cu));
  ok('CONSOLE [] (pitchProbe page)', errs.length === 0, errs.join(' | '));

  /* --- story-017 world goes 3D (?dressingProbe=1): combat-only ambient field + shell visual ---
     Deterministic drive (pitchProbe pattern, in-page, src/probes-dressing.js
     dressingProbeTick — moved out of probes.js in c44f925, 2026-11-10, one-walk-per-file):
     reports window.__stage2.dressingProbe = { ambientCount, shellFill, clearance,
     shellRemoved, lifecycle, rockHit, laneHiddenInCombat, warn }:
       ambientCount — instanced rock instances on the combat-only ambient field (design 40
                     since story 7.5).
       shellFill   — sampled min/max radial distance from O across all instances (construction
                     band 25-75, fixed PRNG seed AMBIENT_FIELD_SEED — stable across runs).
       clearance   — nearest instance-to-ship distance min'd over a 10 s drive at cruise with a
                     full-yaw orbit + varied-pitch pulses (R/F). The orbit holds radius ≈7 u
                     around O (the drift circle), so the geometric margin to the field's inner
                     edge (25 u) is ~18 u; the assert requires > 10 u.
       shell       — (story-017 era, FIELD REMOVED) the wireframe shell died in story 7.6.
                     Task A 2026-11-10 replaced this entry with the MEASURED `shellRemoved`
                     witness and the `warn` samples; Task B 2026-11-10 added `rockHit` and
                     `laneHiddenInCombat`. Details live at the dated assert comments below
                     and in src/probes-dressing.js — this header no longer describes them.
       lifecycle   — shownOnEnter: the field visibility sampled at combat entry.
     The clear/re-show half of the lifecycle is a HARNESS-verified phase walk on this same
     page. NOTE (architecture §5 / phases.js): setPhase is exit-before-enter — the current
     phase's exit() runs before the target's enter(), and combat.exit() calls clearCombat().
     So clearCombat runs on ANY combat exit, including death-to-gameover (combat.js
     api.go('gameover')): the hide happens during the death transition itself, and combat
     scene state (rim ring included) does not persist behind the death card. The witnesses
     therefore sample at phase re-entry — the PAD after REPLAY (hidden) and combat re-entry
     after SKIP (re-shown) — not during the transition: probeDamagePlayer(500) → gameover →
     go-skip → combat (enterCombat re-shows: sample) → probeDamagePlayer(500) again → gameover
     → go-replay → pad (clearCombat ran at the death transition; still hidden: sample). Read
     via __stage2.dressingLive() (installed by arena-dressing.js at
     prepareDressing; main.js untouched), which mirrors the visibility flags at any phase.
     RED record 2026-11-05 (story-016 close build 6705142, product code untouched, only this
     harness differs): ?dressingProbe=1 is unread so window.__stage2.dressingProbe never
     appears and the deadline expires (each probe assert records its red from the null probe);
     dressingLive is absent so the lifecycle reads return null (red by absence). 7 of the 8
     new asserts FAIL for these reasons; the 8th (`CONSOLE []`) is green by design — the
     unmodified page ignores the unknown query flag. The existing 106 stay green.
     MUTATIONS (branch, post-green, each: mutate → npm run build → full flow-check → restore;
     the mutation is VERIFIED applied by reading its red output — a silent no-op proves nothing):
       1. combat.js AMBIENT_FIELD_COUNT 120 → 30 (2026-11-05) → RED `ambient field present`
          (count 30 < 100). Adjacent keep-passing: `field fills the shell` stays green (the
          survivors still fill the 25-75 band).
       2. combat.js hide-on-clear removed (hideDressing dropped from clearCombat)
          (2026-11-05) → RED `field lifecycle` (dressingLive().fieldVisible reads true at the
          pad after REPLAY — nothing hid it on the death transition) + same-root `shell visual
          exists in combat only` (shellVisible true at the pad). Adjacent keep-passing:
          restartProbe stays green — hiding is visual lifecycle, not pool drain; that separation
          is exactly what the mutation demonstrates.
       3. combat.js shell opacity driver zeroed (tickDressing opacity forced 0) (2026-11-05)
          → RED `shell opacity tracks 3D proximity` (opacityAt78 0). Adjacent keep-passing:
          `shell visual exists in combat only` stays green (the mesh exists; only its driver
          broke). */
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat&dressingProbe=1' });
  let dp17 = null;
  {
    const t0 = Date.now();
    for (;;) {
      // guarded + thrown-tolerant (droneProbe pattern): across Page.navigate the old
      // execution context dies — raw reads throw and would kill the run before the asserts
      try { dp17 = await J(`(window.__stage2 && window.__stage2.dressingProbe) || null`); } catch { dp17 = null; }
      if (dp17) break;
      if (Date.now() - t0 > 120000) break; // deadline — the asserts below record the red
      await sleep(300);
    }
  }
  // lifecycle half: death → gameover → SKIP → combat re-entry (re-shown), then death again →
  // gameover → REPLAY → pad (hidden after clearCombat — the hide runs on the death transition
  // via combat.exit; the pad sample confirms it). See the block comment for the
  // exit-before-enter machine (why the witnesses sample at re-entry, not during transitions).
  let lcSeen = { atReenter: null, atPad: null };
  await evl(`(window.__stage2 && __stage2.probeDamagePlayer) ? (__stage2.probeDamagePlayer(500), true) : false`);
  {
    const t0 = Date.now();
    for (;;) {
      try { if (await J(`(window.__stage2 && __stage2.phase) || 'boot'`) === 'gameover') break; } catch {}
      if (Date.now() - t0 > 20000) break; // deadline — the asserts below record the red
      await sleep(200);
    }
  }
  await evl(`document.getElementById('go-skip').click()`);
  {
    const t0 = Date.now();
    for (;;) {
      try {
        const g = await J(`({ p: (window.__stage2 && __stage2.phase) || 'boot', dl: (window.__stage2 && window.__stage2.dressingLive) ? __stage2.dressingLive() : null, lv: (window.__stage2 && typeof __stage2.laneVisible === 'boolean') ? __stage2.laneVisible : null })`);
        if (g.p === 'combat') { if (g.dl) lcSeen.atReenter = { fv: g.dl.fieldVisible, sv: g.dl.shellVisible, lv: g.lv }; break; } // lv: Task B 2026-11-10 — the launch lane mirror (story 7.5)
      } catch {}
      if (Date.now() - t0 > 20000) break; // deadline — the asserts below record the red
      await sleep(200);
    }
  }
  await evl(`(window.__stage2 && __stage2.probeDamagePlayer) ? (__stage2.probeDamagePlayer(500), true) : false`);
  {
    const t0 = Date.now();
    for (;;) {
      try { if (await J(`(window.__stage2 && __stage2.phase) || 'boot'`) === 'gameover') break; } catch {}
      if (Date.now() - t0 > 20000) break; // deadline — the asserts below record the red
      await sleep(200);
    }
  }
  await evl(`document.getElementById('go-replay').click()`);
  {
    const t0 = Date.now();
    for (;;) {
      try {
        const g = await J(`({ p: (window.__stage2 && __stage2.phase) || 'boot', dl: (window.__stage2 && window.__stage2.dressingLive) ? __stage2.dressingLive() : null, lv: (window.__stage2 && typeof __stage2.laneVisible === 'boolean') ? __stage2.laneVisible : null })`);
        if (g.p === 'pad') { if (g.dl) lcSeen.atPad = { fv: g.dl.fieldVisible, sv: g.dl.shellVisible, lv: g.lv }; break; } // lv: Task B 2026-11-10 — clearCombat restores the lane (combat.js setLaneVisible(true))
      } catch {}
      if (Date.now() - t0 > 20000) break; // deadline — the asserts below record the red
      await sleep(200);
    }
  }
  const dp17X = dp17 || {};
  // Task A follow-up 2026-11-10 (review finding 2): the sh/mt destructures (dp17X.shell →
  // sh.material) were orphaned by the Task A commit — the probe stopped reporting `shell`
  // when the story-7.6 shell removal made shellRemoved the measured witness. Dropped; the
  // probe still reports shellFill/clearance/lifecycle, and none of the asserts read sh/mt.
  const sf = dp17X.shellFill || {}, cl = dp17X.clearance || {}, lc = dp17X.lifecycle || {};
  ok('dressingProbe reports (story-017)', !!dp17, JSON.stringify(dp17));
  // Task A 2026-11-10: LABEL-ONLY fix — the label said "≥ 100" (the pre-story-7.5 field size)
  // while the assert reads === 40 (story 7.5 thinned AMBIENT_FIELD_COUNT to 40). The assert
  // expression is untouched; only the stale label text was corrected.
  ok('ambient field present (40 instances — story 7.5 thinned field)', dp17X.ambientCount === 40, `count=${dp17X.ambientCount}`);
  ok('field fills the shell (min ≥ 25, max ≤ 75)', typeof sf.minR3 === 'number' && sf.minR3 >= 25 && sf.maxR3 <= 75, JSON.stringify(sf));
  ok('field never crowds the ship (clearance > 10u over 10s varied-pitch drive)', typeof cl.min === 'number' && cl.min > 10, `minClear=${cl.min} samples=${cl.samples}`);
  // SANCTIONED REWRITE (Story 7.6 - Boundary): blue shell wireframe sphere removed.
  // Task A 2026-11-10: shellRemoved is now MEASURED in the probe (probes-dressing.js shellScan
  // — any wireframe-material MESH at shell scale fails; the walk + helper moved to that file in
  // the review follow-up split), not the literal `true` it replaced (tautology / false green).
  // MUTATION-PROVEN 2026-11-10, two recorded mutations, each verified applied by grepping the
  // built bundle before trusting the red:
  //   (a) a wireframe IcosahedronGeometry(78,2) MESH re-added inside dressingProbeTick → RED
  //       here with shellRemoved:false in the probe JSON below; restored → green. Adjacent
  //       keep-passing in that run: the ambient count / shell-fill / clearance asserts all
  //       stayed green (the mutation mesh touches nothing else the block measures).
  //   (b) review finding 3: the same shell re-added as THREE.LineSegments (a LINE, not a Mesh —
  //       line materials carry no wireframe flag, and a line cage is the most natural future
  //       boundary shape) → RED here with shellRemoved:false for that reason; restored → green.
  //       This mutation exists because the first cut witnessed only o.isMesh; the shellScan
  //       class is now closed (isLine || isLineSegments fail on the same 40 u radius floor).
  ok('boundary wireframe shell removed (story 7.6)', dp17X.shellRemoved === true, JSON.stringify(dp17X));
  // Task A 2026-11-10 (Story 7.6 Step 3 sanctioned #warn-text asserts): asserted against the
  // PLAN's sanctioned strings (docs/FIX_PLAN.md Story 7.6 Step 2) — verified byte-identical to
  // what src/combat.js steer writes (#warn textContent at r3 ≥ 72 / 60 < r3 < 72, lines 345-351).
  // A red here means the warn texts/classes drifted: fix combat.js, NEVER these strings —
  // rewriting the assert to match drifted code is exactly how the shell tautology happened.
  // MUTATION-PROVEN 2026-11-10: 'END OF COMBAT ZONE - TURN BACK' swapped in combat.js → RED
  // 'boundary warn END OF COMBAT ZONE - TURN BACK' (text mismatch in the JSON); the
  // APPROACHING and inside asserts stayed GREEN (adjacent-case control). Restore → green.
  const wr = dp17X.warn || {};
  ok('boundary warn APPROACHING ZONE EDGE at 60<=r<72 (visible, .danger absent — story 7.6)',
    !!wr.approaching && wr.approaching.visible === true && wr.approaching.text === 'APPROACHING ZONE EDGE' && wr.approaching.danger === false,
    JSON.stringify(wr.approaching || null));
  ok('boundary warn END OF COMBAT ZONE - TURN BACK at r>=72 (visible, .danger present — story 7.6)',
    !!wr.turnBack && wr.turnBack.visible === true && wr.turnBack.text === 'END OF COMBAT ZONE - TURN BACK' && wr.turnBack.danger === true,
    JSON.stringify(wr.turnBack || null));
  ok('boundary warn hidden back inside r<60 (story 7.6)',
    !!wr.inside && wr.inside.visible === false && wr.inside.danger === false,
    JSON.stringify(wr.inside || null));
  ok('field lifecycle: hidden on clearCombat (pad), re-shown on enterCombat',
    !!lcSeen.atPad && lcSeen.atPad.fv === false && !!lcSeen.atReenter && lcSeen.atReenter.fv === true,
    JSON.stringify(lcSeen));
  /* --- Task B 2026-11-10 (Story 7.5 Step 5 sanctioned rock asserts): the rockHit witness is
     now the REAL-ship drive (probes-dressing.js stage 2 — impact / graze / bolt windows),
     replacing the self-seeded center test that flow-check never read (ZERO rockHit asserts
     existed — rock collision had no battery coverage at all). Asserts read MEASURED probe
     values, each red by absence when the probe never reports. The damage witnesses read the
     probe's rock-accumulator counts (damageTaken.rock — only damagePlayer(...,'rock') writes
     it), immune to the boss volley the walk's wave cadence can seat mid-window.
     MUTATION-PROVEN 2026-11-10 (each verified applied by grepping the built bundle before
     trusting the red; restore → green):
       1. graze gate removed (combat.js: the damage condition dropped its vn<0 half — damage
          on ANY overlap again) → RED 'rock graze: zero closing speed drains nothing …'
          (graze.rockDmg 24, hpTicks 4 — the clamp minimum ~6 re-fired every 0.35 s on the
          pinned zero-closing-speed overlap: the audit's ~17 dps drain). Adjacent
          keep-passing: both impact asserts (the bounce still clears the overlap — exactly
          one impact tick, deflected), boltStopped, laneHidden (untouched mechanisms).
       2. steer()'s collideRocks ship call removed (pen forced 0 — no push-out/bounce/damage)
          → RED 'rock impact …' (hpTicks 0, rockDmg 0, hpDelta 0 — no collision block ran) +
          RED 'deflected' (minAxial < 0 — the ship flew THROUGH to the far side: the fixture's
          anti-fly-through discriminator, since endOverlapFree alone cannot witness it).
          Adjacent keep-passing: the graze assert (zero damage is EXPECTED there — the pinned
          ship simply never collides) and boltStopped (weapons.js holds its OWN collideRocks
          binding via initWeapons — the ship-call mutation cannot reach it).
       3. boltStopped's own mechanism (weapons.js rock-kill branch disabled — `false &&` folded
          the branch out of the bundle: signature position,.4,null absent, present after restore)
          → RED 'player bolt stops at the rock …' (travel 35, endDist 29.21 — the bolt flew
          CLEAN THROUGH; died:true there is the probe's window-end cleanup kill, which is why
          the assert conjuncts travel < 8 and endDist < radius+0.5 rather than trusting died
          alone). Adjacent keep-passing: impact, deflected, graze, laneHidden. */
  const rk = dp17X.rockHit || {};
  ok('rock impact: seat overlaps, exactly one damage tick, hp/shield dropped (story 7.5)',
    !!rk.impact && rk.impact.sawOverlap === true && rk.impact.hpTicks === 1 && rk.impact.rockDmg > 0 && rk.impact.hpDelta < 0,
    JSON.stringify(rk.impact || null));
  ok('rock impact: deflected — pushed out, ends overlap-free, never crossed the center (story 7.5)',
    !!rk.impact && rk.impact.deflected === true,
    JSON.stringify(rk.impact || null));
  ok('rock graze: zero closing speed drains nothing across the cooldown (story 7.5 gate — 2026-11-10 audit)',
    !!rk.graze && rk.graze.pinnedOverlapTicks >= 10 && rk.graze.rockDmg === 0 && rk.graze.hpTicks === 0,
    JSON.stringify(rk.graze || null));
  ok('player bolt stops at the rock — dies at the surface, no pass-through (story 7.5)',
    !!rk.boltStopped && rk.boltStopped.spawned === true && rk.boltStopped.died === true && rk.boltStopped.travel < 8 && typeof rk.boltStopped.endDist === 'number' && rk.radius > 0 && rk.boltStopped.endDist < rk.radius + 0.5,
    JSON.stringify(rk.boltStopped || null));
  ok('launch lane hidden in combat, restored on clearCombat (story 7.5)',
    dp17X.laneHiddenInCombat === true && !!lcSeen.atReenter && lcSeen.atReenter.lv === false && !!lcSeen.atPad && lcSeen.atPad.lv === true,
    JSON.stringify({ laneHiddenInCombat: dp17X.laneHiddenInCombat, atReenter: lcSeen.atReenter && lcSeen.atReenter.lv, atPad: lcSeen.atPad && lcSeen.atPad.lv }));
  ok('CONSOLE [] (dressingProbe page)', errs.length === 0, errs.join(' | '));
  /* --- story-018 charged shot (?chargeProbe=1, page over the SAME CDP session) ---
     Deterministic in-page drive (droneProbe pattern; src/probes-charge.js chargeProbeTick —
     review-fix split, one walk per file): the
     drive writes C.api.input.fire DIRECTLY (probe-owned precondition — the same class as
     pitchProbe's synthesized keys; input.js stays zero-diff) and reads combat state + the
     bolt pool (pool.update(0, …) — the ENEMIES.eachAlive trick). Field discipline per tick:
     enemies/orbs cleared at stage entries, wave pinned at 1 with a 99 s gap (wavesTick can
     never cycle), hp/shield healed — the walk cannot die mid-drive.
     Stages in order: tap 0.2 s (≥ 1 stream, 0 charged) → hold 1.0 s (exactly 1 charged on
     release, ≤ 6 stream all fired pre-threshold, charged identity captured from the live
     pool: scale ×3, amber 0xffc85a, dmg 6) → charged one-shot of a seeded gunner (hp 2) →
     of an elite-HP gunner (hp 6, probe-stamped — real elites are story-019 territory) →
     boss weak point 18 (6 × WEAK_MULT 3) via a probe-stamped charged bolt through
     hitBoss's dmg param (boss.js zero-diff — bossProbe's bossBolt placement pattern) →
     3-shot burst = exactly 3 charged bolts → pause cancel (harness-coordinated: the drive
     raises chargePauseArm mid-hold past the threshold, the harness presses the REAL pause
     keys — setPaused lives in input.js — then raises chargePauseGo) → death cancel (the
     drive raises chargeDeathArm, the harness fires __stage2.probeDamagePlayer(500), the
     drive releases and latches the report BEFORE the death card lands).
     RED-FIRST (2026-11-06, master build @ 27e4a61, product code untouched, only this
     harness differs): ?chargeProbe=1 is unread so window.__stage2.chargeProbe never
     appears and the deadline expires — every new assert records its red from the null
     probe (the exact droneProbe red pattern); combatState().charge/.charging are
     undefined; the exit-wipe walk still lands (gameover poll rides the natural AFK death)
     but reads undefined. Full output: production/qa/evidence/story-018-charged-shot-pickups/flow-red-story018.txt.
     MUTATIONS (branch, post-green, each: mutate → npm run build → full flow-check →
     restore → rebuild; the mutation is VERIFIED applied by reading its red output — a
     silent no-op proves nothing):
       1. combat.js T_CHARGE 0.6 → 0.06 (2026-11-06) → RED `tap 0.2s → stream fires, 0
          charged` (tap.charged 1 — a tap now crosses the threshold and fires a charged
          bolt; flow-mutation-tcharge.txt, 141/4). The 3 other reds are the same-root
          cascade (hold1 / charged identity / OVERDRIVE shot count all read the threshold).
          Adjacent keep-passing: `charged weak-point hit does 18` stays GREEN (delta 18 —
          the dmg param is independent of the threshold) + the one-shots, burst, pause and
          death cancels all green.
       2. powerups.js drop roll removed — maybeDrop returns false unconditionally
          (2026-11-06) → RED `drop rate p=0.18 within the binomial 95% band` with the real
          value {kills: 100, drops: 0} + the same-root `kind split χ²` ({drops: 0, timeout:
          true}) (flow-mutation-droproll.txt, 143/2). Adjacent keep-passing: the pickup
          radius / SPREAD fan / OVERDRIVE / SHIELD / refresh / chips / boss asserts stay
          GREEN — forceDropForProbe bypasses the roll, exactly the seam the mutation
          isolates. FIRST application record: the same mutation pre-watchdog went red-by-
          NULL (the drive hung in the 300-drop stage) — that hang is itself mutation
          evidence and drove commit 3's watchdogs (the second application reads by value).
     Full outputs: production/qa/evidence/story-018-charged-shot-pickups/. */
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat&chargeProbe=1&lock=0' }); // stage-6 W1: probe pages see unbiased bolts (?lock=0 — the probe override)
  let cp = null;
  {
    const t0 = Date.now();
    let pauseHandled = false, pauseHandled2 = false, deathHandled = false;
    for (;;) {
      // harness-coordinated cancels: setPaused + probeDamagePlayer live outside the drive's
      // reach (input.js owns pause; combat's damagePlayer is not exported to probes), so the
      // HARNESS acts on the drive's arm flags with real key events / the probe surface.
      try {
        if (!pauseHandled && await evl(`(window.__stage2 && window.__stage2.chargePauseArm) === true`)) {
          pauseHandled = true;
          await key('KeyP', 'keydown');
          await sleep(400);
          await key('KeyP', 'keydown'); // second press unpauses; the key set still holds KeyP for the drive's zeroing read
          await sleep(150);
          await key('KeyP', 'keyup');
          await evl(`window.__stage2.chargePauseGo = true`);
        }
        if (!pauseHandled2 && await evl(`(window.__stage2 && window.__stage2.chargePauseArm2) === true`)) {
          pauseHandled2 = true;
          await key('KeyP', 'keydown'); // pause mid-hold past the threshold
          await sleep(400);
          // REVIEW ordering: RELEASE LMB DURING the pause — the window pointerup flips
          // input.fire while tickCombat is halted; the accumulator must not survive to resume
          await evl(`window.dispatchEvent(new PointerEvent('pointerup', {button: 0, bubbles: true}))`);
          await sleep(150);
          await key('KeyP', 'keydown'); // unpause
          await sleep(150);
          await key('KeyP', 'keyup');
          await evl(`window.__stage2.chargePauseGo2 = true`);
        }
        if (!deathHandled && await evl(`(window.__stage2 && window.__stage2.chargeDeathArm) === true`)) {
          deathHandled = true;
          await evl(`(window.__stage2 && __stage2.probeDamagePlayer) ? __stage2.probeDamagePlayer(500) : 0`);
        }
        cp = await J(`(window.__stage2 && window.__stage2.chargeProbe) || null`);
      } catch { cp = null; }
      if (cp) break;
      if (Date.now() - t0 > 180000) break; // deadline — the asserts below record the red
      await sleep(200);
    }
  }
  const cpX = cp || {};
  const cpc = await evl(`(window.__stage2 && __stage2.combatState) ? JSON.stringify({
    charge: __stage2.combatState().charge, charging: __stage2.combatState().charging }) : null`);
  let cpcX = {};
  try { cpcX = JSON.parse(cpc || '{}'); } catch { cpcX = {}; }
  const tap = cpX.tap || {}, h1 = cpX.hold1 || {}, og = cpX.oneShotGunner || {}, oe = cpX.oneShotElite || {},
    wk = cpX.weak || {}, pz = cpX.pause || {}, pz2 = cpX.pauseRelease || {}, dt18 = cpX.death || {},
    cch = cpX.charge || {}, crt = cpX.reticle || {};
  ok('chargeProbe reports (story-018)', !!cp, JSON.stringify(cp));
  ok('combatState exposes charge (0..1) + charging (bool)', typeof cpcX.charge === 'number' && typeof cpcX.charging === 'boolean',
    `charge:${typeof cpcX.charge}=${cpcX.charge} charging:${typeof cpcX.charging}`);
  ok('tap 0.2s → stream fires, 0 charged', tap.stream >= 1 && tap.charged === 0, JSON.stringify(tap));
  ok('hold 1.0s → exactly 1 charged on release, ≤6 stream all pre-threshold',
    h1.charged === 1 && h1.stream >= 4 && h1.stream <= 6 && h1.streamAtCross === h1.stream, JSON.stringify(h1));
  ok('charged bolt identity (scale ×3, amber 0xffc85a, dmg 6, single)',
    h1.scale === 3 && h1.color === 0xffc85a && h1.dmg === 6, JSON.stringify(h1));
  ok('charged one-shots a gunner (hp 2) through the real kill path', og.killed === true && og.killsDelta === 1, JSON.stringify(og));
  ok('charged one-shots an elite-HP gunner (hp 6, probe-stamped)', oe.killed === true && oe.killsDelta === 1, JSON.stringify(oe));
  ok('charged weak-point hit does 18 (6 × WEAK_MULT 3 — the dmg param, boss.js untouched)',
    wk.delta === 18, JSON.stringify(wk));
  ok('3-shot burst = exactly 3 charged bolts (never 0, never >1 per release)', cpX.burst3 === 3, `burst3=${cpX.burst3}`);
  ok('charge state readable (charge rose to 1, charging seen)', cch.max >= 0.99 && cch.chargingSeen === true, JSON.stringify(cch));
  ok('charge meter rides the reticle (ring class + full flash)', crt.chargeClass === true && crt.full === true, JSON.stringify(crt));
  ok('pause cancel: accumulator zeroed (≤0.1 vs the ≥0.6 pre-pause hold), post-unpause release ≤1 stream / 0 charged',
    pz.chargeTAtResume <= 0.1 && pz.chargingAtResume === false && pz.chargedAfter === 0 && pz.streamAfter <= 1, JSON.stringify(pz));
  // REVIEW ordering (the red-first assert): hold past the threshold → pause → RELEASE LMB during
  // the pause → unpause. The window pointerup flips input.fire while tickCombat is halted, so
  // nothing zeroes the accumulator during the pause — a surviving accumulator fires the charged
  // bolt on the resume frame's release branch (the bug this assert pins; chargedAfter must read 0).
  ok('pause cancel #2 (review ordering): release LMB DURING the pause — resume fires nothing (accumulator wiped at pause)',
    pz2.chargeTAtResume <= 0.1 && pz2.chargingAtResume === false && pz2.chargedAfter === 0, JSON.stringify(pz2));
  ok('death cancel: accumulator zeroed, release fires nothing', dt18.chargedAfter === 0 && dt18.chargeTZeroed === true, JSON.stringify(dt18));
  {
    // exit-wipe: the death cancel left combat dying — ride it to gameover, SKIP back in;
    // the accumulator + fired counters must read zeroed (clearCombat + enterCombat reset)
    let goLanded = false;
    {
      const t0 = Date.now();
      for (;;) {
        try { if (await J(`__stage2.phase`) === 'gameover') { goLanded = true; break; } } catch {}
        if (Date.now() - t0 > 45000) break;
        await sleep(250);
      }
    }
    if (goLanded) await evl(`document.getElementById('go-skip').click()`);
    let back = false;
    {
      const t0 = Date.now();
      for (;;) {
        try { if (await J(`__stage2.phase`) === 'combat') { back = true; break; } } catch {}
        if (Date.now() - t0 > 20000) break;
        await sleep(200);
      }
    }
    const csExit = back ? await J(`__stage2.combatState()`) : null;
    ok('combat exit wipes the charge state (re-entry reads charge 0, fired 0)',
      !!csExit && csExit.charge === 0 && csExit.charging === false && !!csExit.fired &&
      csExit.fired.stream === 0 && csExit.fired.charged === 0, JSON.stringify(csExit));
  }
  ok('CONSOLE [] (chargeProbe page)', errs.length === 0, errs.join(' | '));

  /* --- story-018 pickups (?powerupProbe=1, next page over the SAME CDP session) ---
     Deterministic in-page drive (src/probes-powerup.js powerupProbeTick — review-fix split,
     one walk per file; imports powerups.js — acyclic). Stages: drop rate over N = 100 REAL bolt-path kills (spawnForProbe target +
     a probe bolt into it — the same kill site combat's boltsTick owns, so maybeDrop's real
     Math.random rolls are counted; FLAKE POLICY (player-approved 2026-11-07 — stage-4 GATE
     DECISION 1 + story-019 §11, Option A): every statistical band ≥ 99% per band (the measured
     joint false-red of the remaining 95% bands was ~14%/run; exact binomial arithmetic for
     p = 0.18, n = 100 recorded beside the assert — widen trials, never hand-widen bounds) →
     kind split over M = 300 more real rolls (uniform 1/3: joint χ² goodness-of-fit at 99% —
     χ²(2) ≤ 9.210, the three-independent-95%-band form flaked ~14%/run) → despawn 8 s + blink
     last 2 s
     (forced drop, tracked via POWERUPS.eachAlive) → pickup radius full-3D (1.3 picks up,
     1.6 does not, vertical-offset 1.345 picks up — the story-015 lesson) → SPREAD (one shot
     = 3 bolts at ±6° about the ship's local up; charged stays single) → OVERDRIVE (measured
     shot-to-shot interval ≈ 0.0568 ±10%; charged still 1; suppression still at T_CHARGE) →
     SHIELD (refill 50, immediate regen in-window, 3 s delay restored after expiry) →
     refresh-not-stack + concurrency → HUD chips (name + seconds, gone after expiry) →
     effects apply during the boss fight (boss exempt from drops — effects verified with
     BOSS.alive()). Reports window.__stage2.powerupProbe (+ api.report parity).
     RED-FIRST (2026-11-06, master build @ 27e4a61): ?powerupProbe=1 is unread — every new
     assert records its red from the null probe; the clearCombat-wipe walk lands but reads
     undefined effects. Same red output file as the charge block.
     MUTATIONS: recorded in the charge block above (mutation 2 = the drop roll). */
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat&powerupProbe=1&lock=0' }); // stage-6 W1: probe pages see unbiased bolts (?lock=0)
  let pu = null;
  {
    const t0 = Date.now();
    for (;;) {
      // guarded + thrown-tolerant (droneProbe pattern): across Page.navigate the old
      // execution context dies — raw reads throw and would kill the run before the asserts
      try { pu = await J(`(window.__stage2 && window.__stage2.powerupProbe) || null`); } catch { pu = null; }
      if (pu) break;
      if (Date.now() - t0 > 180000) break; // deadline — the asserts below record the red
      await sleep(250);
    }
  }
  const puX = pu || {};
  const puRate = puX.rate || {}, puKinds = puX.kinds || {}, puDs = puX.despawn || {}, puRad = puX.radius || {},
    puSpr = puX.spread || {}, puOd = puX.overdrive || {}, puSh = puX.shield || {}, puRf = puX.refresh || {},
    puBs = puX.boss || {};
  ok('powerupProbe reports (story-018)', !!pu, JSON.stringify(pu));
  // review-fix round (2026-11-06): the pickup pre-warm must add EXACTLY +6 to the entity
  // baseline — all PICKUP_POOL entities allocated at prepare, none mid-fight (§8.6 restart-clean).
  // baselinePickups is the pool's REAL allocation count captured at drive stage 0 (probes-powerup.js
  // — probes.js before the review split): at that point ONLY the pre-warm has run (drops need
  // kills; the drive hasn't killed anything yet), so it IS the pre-prepare → post-prepare entity
  // delta, measured at the allocation site (makePickup is the pool's only allocation path; the
  // harness has no scene access to diff countMeshes across prepare).
  // RED-FIRST (2026-11-06, branch 3bdd465 + instrumentation only): the old pre-warm loop
  // `for (…) pool.kill(pool.spawn())` created ONE entity — pool.js spawn() is reuse-first and
  // re-handed back the just-killed item every iteration, so the assert read +1 (up to 5 Groups
  // would have allocated MID-FIGHT at the high-water mark). Fixed to spawn-all-then-clear();
  // this assert went green at 147/0. baselineEntities (stage 0's countMeshes() read, previously
  // captured but never asserted) is read here alongside for provenance.
  ok('pickup pool pre-warm: entity-baseline delta exactly +6 (all PICKUP_POOL entities allocated at prepare — restarts allocate nothing new, §8.6)',
    puX.baselinePickups === 6 && puX.baselineEntities >= 6,
    JSON.stringify({ baselinePickups: puX.baselinePickups, baselineEntities: puX.baselineEntities }));
  // FLAKE POLICY (player-approved 2026-11-07: stage-4 GATE DECISION 1 + story-019 §11 —
  // Option A, every statistical band ≥ 99%): the old 95% band [11,25] covered 95.05% of the
  // exact binomial (n = 100, p = 0.18) and the measured joint false-red of the remaining 95%
  // bands was ~14%/run. Exact arithmetic (exact binomial pmf sums, computed offline 2026-11-07):
  //   [11,25] = 95.05%   (the old band)
  //   [ 9,27] = 98.71%   (the recorded exact-quantile band — NOT sufficient: still < 99%)
  //   [ 9,28] = 99.14%   (SHIPPED — the smallest interval clearing 99% that contains [9,27]:
  //                       the two one-step extensions are [8,27] = 98.95% (fails, P(X=8) = 0.24%)
  //                       and [9,28] = 99.14% (passes, P(X=28) = 0.44%))
  //   [ 8,28] = 99.39%   (the alternative — recorded, not shipped)
  // Tails at the shipped band: P(X ≤ 8) = 0.38%, P(X ≥ 29) = 0.48% (joint miss 0.86%/run).
  // Widen trials, never hand-widen bounds (house rule).
  // MUTATION RE-RUN under the new band (rider A, 2026-11-07): the drop-roll mutation
  // (powerups.js maybeDrop → unconditional `return false` — story-018's recorded mutation 2)
  // re-applied → npm run build → FULL flow-check → RED `drop rate p=0.18 within the binomial
  // 99% band [9,28]` reading {"kills":100,"drops":0} (0 < 9 — the new low edge holds
  // discrimination) + the same-root kind-split red (total 0 < 300): 186 passed, 2 failed.
  // Transcript: production/qa/evidence/stage-5-riders/flow-mutation-droproll-riderA.txt.
  ok('drop rate p=0.18 within the binomial 99% band [9,28] (100 real bolt-path kills; flake policy 2026-11-07)',
    puRate.kills === 100 && puRate.drops >= 9 && puRate.drops <= 28, JSON.stringify(puRate));
  ok('at most one drop per kill (100 kills → ≤ 100 drops)', puRate.kills === 100 && puRate.drops <= puRate.kills, JSON.stringify(puRate));
  // FLAKE POLICY (2026-11-07, same player-approved decision as the drop-rate band above):
  // χ²(2) threshold 5.991 (95%) → 9.210 (99%). dof-2 survival S(x) = exp(−x/2):
  // S(9.21034) = 0.01 exactly; 99.5% would be 10.59663 — NOT used (the policy is 99%).
  // Discrimination boundary, recorded honestly: a gross kind skew still reds (all-one-kind
  // reads χ² = 600 ≫ 9.210), while a mild 40/30/30 skew reads χ² ≈ 6.0 and is now GREEN by
  // policy — the approved cost of the 95→99 retightening. No dedicated kind-skew mutation is
  // recorded in any story ledger; the only recorded red on this assert is the drop-roll
  // mutation's same-root zero-drop red (total < 300, threshold-independent) — re-run
  // 2026-11-07, see the record beside the drop-rate assert above.
  ok('kind split ≈ 1/3 each — joint χ² goodness-of-fit at 99% over 300 real drops (χ²(2) ≤ 9.210; flake policy 2026-11-07)',
    (() => {
      const ks = [puKinds.SPREAD, puKinds.OVERDRIVE, puKinds.SHIELD];
      if (!ks.every((n) => typeof n === 'number' && n >= 0)) return false;
      const total = ks.reduce((a, b) => a + b, 0);
      if (total < 300) return false;
      const exp = total / 3;
      const x2 = ks.reduce((a, n) => a + (n - exp) * (n - exp) / exp, 0);
      return x2 <= 9.210;
    })(), JSON.stringify(puKinds));
  ok('despawn at 8 s (alive at 7.9, gone at 8.1)', puDs.aliveAt79 === true && puDs.goneAt81 === true, JSON.stringify(puDs));
  ok('blink during the last 2 s (off before 6.0 s, on after — blink starts at LIFE − BLINK = 6.0)', puDs.blinkAt55 === false && puDs.blinkAt65 === true, JSON.stringify(puDs));
  ok('pickup radius full-3D (1.3 picks up, 1.6 does not, vertical 1.345 picks up)',
    puRad.pickedAt13 === true && puRad.pickedAt3D === true && puRad.pickedAt16 === false, JSON.stringify(puRad));
  // story 7.4 REWRITE (was: anglePlus/angleMinus ≈ 6 and centerAngle ≤ 0.5 — the fan measured
  // against the NOSE forward, which was the old base). The fan base is the CAMERA-TRUE
  // converge aim now (?lock=0 on this page — nothing locked): the drive's angles-vs-forward
  // become geometry constants of the parked seat (centerAngle ≈16°, the camera offset; the
  // ±6° spread is perpendicular to that offset, so it barely moves the polar angles — the
  // fan's ±6° geometry is asserted where the real dirs are captured: the fireProbe stage-3
  // pairSpan assert). What THIS page can still prove: 3 fan bolts, the base is clearly off
  // the nose (camera-true — centerAngle ≥10 would read 0 on the old base), and charged stays
  // single. All three fan dirs sit within ±3° of the base's polar angle (bounded fan).
  ok('SPREAD: one shot = 3-bolt fan about the camera-true base (centerAngle ≈16° parked-seat camera offset, both outer bolts within 3° of it), charged stays single',
    puSpr.fan === 3 && typeof puSpr.centerAngle === 'number' && puSpr.centerAngle >= 10 && puSpr.centerAngle <= 19 &&
    typeof puSpr.anglePlus === 'number' && Math.abs(puSpr.anglePlus - puSpr.centerAngle) <= 3 &&
    typeof puSpr.angleMinus === 'number' && Math.abs(puSpr.angleMinus - puSpr.centerAngle) <= 3 &&
    puSpr.chargedSingle === 1, JSON.stringify(puSpr));
  // RE-REVIEW band widen (2026-11-06, test-only): shots floor 9 → 8. The reviewer's arithmetic,
  // recorded here: at dt ≳ 0.0238 the fire cadence quantizes to 3 frames ≈ 0.0714 s and
  // 0.617 s / 0.0714 ≈ 8.6 → 8 is the DETERMINISTIC low edge, not a miss (committed history:
  // shots 9,9,9,9,9,8; intervals 0.0667-0.0714 — all inside the honesty band below). This also
  // resolves the old floor's internal inconsistency (an interval of 0.0725-0.075 passed the
  // honest band while forcing shots = 8, under the old floor). Discrimination retained: a
  // missing OVERDRIVE reads ~5 — a 3-shot gap; the ceiling is untouched.
  /* RIDER A RE-DERIVATION (2026-11-07, stage-5 flake-policy rider): [8,12] is a MECHANICAL
     quantization band, not a frequency band — re-derived from the fire path's exact mechanism
     (src/weapons.js fireTick: C.fireT decrements FIRST each frame and resets to the FULL
     interval on fire — no overshoot carry — so the cadence quantizes to K = ceil(interval/dt)
     frames per shot; the burst window ends at the suppression frame m = ceil(T_CHARGE/dt);
     shots = 1 (the press-frame bolt) + floor((m − 1)/K), all in GAME time — PU.t and chargeT
     accumulate the SAME dt). Per-dt table (uniform dt):
       dt 0.0167 (60fps): K 4, m 36 → 9     dt 0.02 (50fps): K 3, m 30 → 10
       dt 0.0238 (42fps): K 3, m 26 → 9     dt 0.025 (40fps): K 3, m 24 → 8
       dt 0.0284:         K 2, m 22 → 11    dt 0.03  (33fps): K 2, m 20 → 10
       dt 0.04  (25fps):  K 2, m 15 → 8     dt 0.05 (clamp):  K 2, m 12 → 6
     Over the OBSERVED environment cadence band (committed history: intervals 0.0667-0.0714 s →
     dt ≈ 0.0167-0.0238 — the 2026-11-06 widen record's own basis) the deterministic range is
     [8, 11] ⊂ [8, 12] — coverage ≥ 99% BY CONSTRUCTION in-regime, so the band changes NOTHING
     (rider rule: no widening without arithmetic). The absolute honest max is 11 (each
     post-press shot is ≥ 0.0568 game-s apart; 10 gaps = 0.568 ≤ 0.6, an 11th gap = 0.625 > 0.6
     is unreachable), so the ceiling never masks a real bug. CAVEAT recorded honestly: a
     SUSTAINED ≤ 23 fps stall (dt ≥ 0.043 through the whole window — the FRAME-CAP note's
     ~15 fps class) reads 6-7, outside the band — but in that same regime the measured interval
     reads K·dt ≥ 0.086 > 0.075, so the interval assert (this same ok(), untouched by this
     rider) co-reds: the shot-count band is never the SOLE discriminator there. Recorded
     population: six burst samples (9,9,9,9,9,8) + boss-window samples 7-10 — zero sub-8
     observations; the stall class's frequency is unmeasured (arithmetic cannot establish ≥ 1%),
     so the band stays PUT. The old label's "+ DT_CLAMP stalls" claim was falsified by the
     dt-0.05 row (6 < 8) — label corrected, band untouched.
     MUTATION RE-RUN (rider A, 2026-11-07): the T_CHARGE mutation (weapons.js T_CHARGE 0.6 →
     0.06 — story-018's recorded mutation 1, the only recorded mutation whose red set includes
     the OVERDRIVE shot-count asserts) re-applied → npm run build → FULL flow-check → RED both
     OVERDRIVE asserts (burst {"suppressAt":0.067,"shots":1,"frameDt":0.0167}; boss window
     {"shots":1,"frameDt":0.0199} — 1 ≪ 8 / 1 ≪ 7, the unchanged bands hold discrimination) +
     the same-root tap/hold reds: 184 passed, 4 failed. Adjacent keep-passing: the drop-rate
     band read {"kills":100,"drops":15} — inside [9,28] (the rider A band change is
     behavior-neutral on honest rolls) and the kind split {98,103,100} green under 9.210.
     Transcript: production/qa/evidence/stage-5-riders/flow-mutation-tcharge-riderA.txt. */
  ok('OVERDRIVE: shot count over the 0.6 s pre-suppression burst matches the ÷2.2 interval (0.0568 s, band [8,12] — mechanical quantization band re-derived 2026-11-07, see above; a missing OVERDRIVE reads ~5 → red) + the timestamp interval honest + charged single + suppression unchanged at T_CHARGE',
    typeof puOd.shots === 'number' && puOd.shots >= 8 && puOd.shots <= 12 &&
    typeof puOd.interval === 'number' && puOd.interval >= 0.045 && puOd.interval <= 0.075 &&
    puOd.chargedSingle === 1 && typeof puOd.suppressAt === 'number' && Math.abs(puOd.suppressAt - 0.6) <= 0.1, JSON.stringify(puOd));
  ok('SHIELD: refill 50, immediate regen in-window, 3 s delay restored after expiry',
    puSh.refill50 === true && puSh.regenInWindow === true && puSh.delayRestored === true && puSh.regenResumed === true, JSON.stringify(puSh));
  ok('same-kind re-pickup refreshes to 8 s (never stacks); kinds run concurrently',
    puRf.refreshed === true && puRf.stacked === false && puRf.concurrent === true, JSON.stringify(puRf));
  ok('HUD chips: name + seconds while active (GDD §8.3 "name + seconds" — the \\d+s form), gone after expiry',
    typeof puRf.chipsActive === 'string' && puRf.chipsActive.includes('SPREAD') && /\d+s/.test(puRf.chipsActive) &&
    puRf.chipsGone === '', JSON.stringify(puRf));
  /* RIDER A RE-DERIVATION (2026-11-07, same no-carry cadence model as the burst assert
     above): window 0.5 s — it ends BEFORE suppression (T_CHARGE 0.6 caps only longer holds;
     the drive releases at 0.5 s), so m = ceil(0.5/dt) frames are all stream-eligible. Table:
       dt 0.0167: m 30, K 4 → 8    dt 0.02:  m 25, K 3 → 9    dt 0.0238: m 21, K 3 → 8
       dt 0.025:  m 20, K 3 → 7    dt 0.0284: m 18, K 2 → 9  dt 0.03:   m 17, K 2 → 9
       dt 0.04:   m 13, K 2 → 7    dt 0.05:  m 10, K 2 → 5 (sustained-stall class)
     Over the observed cadence band the deterministic range is [7, 9] ⊂ [7, 11] — coverage
     ≥ 99% BY CONSTRUCTION in-regime, band unchanged (no widening without arithmetic).
     Absolute honest max 9 (8 gaps × 0.0568 = 0.454 ≤ 0.5; 9 gaps = 0.511 > 0.5 — 10
     unreachable), so the 11 ceiling is pure margin over jitter. Same caveat as the burst: a
     sustained ≤ 23 fps stall reads 5-6, co-red by the interval band (K·dt ≥ 0.086 > 0.075);
     recorded population 7-10, zero sub-7 observations — band stays PUT. */
  ok('effects apply during the boss fight (boss itself never drops) — shot count over the 0.5 s window matches the ÷2.2 interval (band [7,11] — mechanical quantization band re-derived 2026-11-07, see above; a missing OVERDRIVE reads ~4-5 → red)',
    puBs.bossAliveAtPickup === true && typeof puBs.shots === 'number' && puBs.shots >= 7 && puBs.shots <= 11 &&
    typeof puBs.interval === 'number' && puBs.interval >= 0.045 && puBs.interval <= 0.075, JSON.stringify(puBs));
  {
    // clearCombat wipe: forced death → gameover → SKIP → combat re-entry — the effect
    // timers must read zeroed and the chips DOM empty (enterCombat reset + clearCombat)
    await evl(`(window.__stage2 && __stage2.probeDamagePlayer) ? __stage2.probeDamagePlayer(500) : 0`);
    let goLanded = false;
    {
      const t0 = Date.now();
      for (;;) {
        try { if (await J(`__stage2.phase`) === 'gameover') { goLanded = true; break; } } catch {}
        if (Date.now() - t0 > 30000) break;
        await sleep(250);
      }
    }
    if (goLanded) await evl(`document.getElementById('go-skip').click()`);
    let back = false;
    {
      const t0 = Date.now();
      for (;;) {
        try { if (await J(`__stage2.phase`) === 'combat') { back = true; break; } } catch {}
        if (Date.now() - t0 > 20000) break;
        await sleep(200);
      }
    }
    const csWipe = back ? await J(`__stage2.combatState()`) : null;
    const chipsAfter = back ? await evl(`document.getElementById('hud-chips') ? document.getElementById('hud-chips').textContent : null`) : null;
    ok('clearCombat wipes effect timers + chips (re-entry reads all 0 / empty)',
      !!csWipe && !!csWipe.effects && csWipe.effects.SPREAD === 0 && csWipe.effects.OVERDRIVE === 0 &&
      csWipe.effects.SHIELD === 0 && chipsAfter === '', `effects=${JSON.stringify(csWipe && csWipe.effects)} chips=${JSON.stringify(chipsAfter)}`);
  }
  ok('CONSOLE [] (powerupProbe page)', errs.length === 0, errs.join(' | '));

  /* --- story-019 balance probe (?balanceProbe=1, next page over the SAME CDP session) ---
     Deterministic in-page drive (droneProbe/chargeProbe pattern; src/probes-balance.js — the
     probes.js budget discipline keeps one walk per file, the story-018 split precedent). The
     drive walks, in order: elite stats (spawnRaiderForProbe wave 4 forced: HP ×3, speedMult
     ×1.15, scale ×1.35, tint 0xffa02f trim+glow, contact r = R_RAIDER × ELITE_SCALE) → the
     unconditional per-spawn reset pin (former elite killed, respawn at wave 3 reads normal)
     → elite score ×2 through the REAL bolt-kill path (+300, kills +1, telemetry kills/elite
     splits) → wave 3 produces 0 elites over 20 real spawns → the elite RATE as MECHANISM
     GATES + a 99.9% sanity band ([3,21]; the first cut was a 95% distribution gate —
     [6,16] at 94.19% coverage, then [6,17] at 95.99% — replaced after the merge-halt
     diagnosis proved the environment's Math.random batches at run level; NO seeded RNG
     exists — architecture §7.1 honest flag) → the waves
     1-5 composition table observed through the REAL spawn path (deterministic authored split
     per wave; totals equal the derived waveCount; wave 6 reads the derived fallback —
     boundary asserted both ways via waveComposition().source + the wave-6 spawn total) → a
     scripted telemetry run (real-fire stream kill of a rammer + charged one-shot of a gunner;
     kills/hits/shots/scoreBy deltas match the drive's own actions; hits ≤ shots per channel;
     no NaN/undefined) → the boss completion (pre-boss score + 1000 exactly; a FORCED second
     bossDefeated report through the same wrapper never double-awards — C.bossAwarded latched;
     bossDefeatedReports countable at 2 = 1 natural + 1 forced).
     RED-FIRST (2026-11-06, story-018 gate build @ 37abb72, product code untouched, only this
     harness differs): ?balanceProbe=1 is unread so window.__stage2.balanceProbe never
     appears and the deadline expires — every new assert records its red from the null probe
     (the exact droneProbe red pattern). Full output: flow-red-story019.txt.
     MUTATIONS (branch, post-green; each: mutate → npm run build → full flow-check → restore
     → rebuild; verified applied by reading its red output): recorded per assert below. */
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat&balanceProbe=1&lock=0' }); // stage-6 W1: probe pages see unbiased bolts (?lock=0)
  let bp19 = null;
  {
    const t0 = Date.now();
    for (;;) {
      // guarded + thrown-tolerant (droneProbe pattern): across Page.navigate the old
      // execution context dies — raw reads throw and would kill the run before the asserts
      try { bp19 = await J(`(window.__stage2 && window.__stage2.balanceProbe) || null`); } catch { bp19 = null; }
      if (bp19) break;
      if (Date.now() - t0 > 300000) break; // deadline — the asserts below record the red
      await sleep(300);
    }
  }
  const b19 = bp19 || {};
  const eG = b19.elite ? (b19.elite.gunner || {}) : {}, eR = b19.elite ? (b19.elite.rammer || {}) : {},
    rPin = b19.resetPin ? (b19.resetPin.after || {}) : {}, sX2 = b19.scoreX2 || {},
    w3z = b19.wave3 || {}, rt = b19.rate || {}, tb = b19.table || {}, tm = b19.telemetry || {},
    bs = b19.boss || {};
  ok('balanceProbe reports (story-019)', !!bp19, JSON.stringify(bp19));
  ok('elite gunner stats (hp 6 = 2×3, speedMult 1.15, scale 1.35, elite flag)',
    eG.kind === 'gunner' && eG.elite === true && eG.hp === 6 && eG.speedMult === 1.15 && eG.scale === 1.35, JSON.stringify(eG));
  ok('elite rammer stats (hp 3 = 1×3, speedMult 1.15, scale 1.35, elite flag)',
    eR.kind === 'rammer' && eR.elite === true && eR.hp === 3 && eR.speedMult === 1.15 && eR.scale === 1.35, JSON.stringify(eR));
  ok('elite trim/glow retinted 0xffa02f (and the base tints recorded for the reset pin)',
    eG.trimTint === 0xffa02f && eG.glowTint === 0xffa02f && eG.trimBase === 0xff3b2f && eG.glowBase === 0xff6a3c, JSON.stringify(eG));
  // QUALITY REVIEW (2026-11-07, orchestrator ruling): the radius is STAMPED + probe-visible
  // but NOT consumed by any collision scan yet — the bolt scan uses the fixed 1.1 radius²
  // (weapons.js) and ram contact (R_RAIDER + 0.9)² (enemies.js). Wiring it in is a DEFERRED
  // game-design decision (a bigger elite hitbox = a balance change) for the evidence-driven
  // balance pass this story's telemetry enables. The assert pins the stamp, not a behavior.
  ok('elite contact radius stamped (r = 1.215), probe-visible, not yet consumed',
    eG.r === 0.9 * 1.35, `r=${eG.r}`);
  // MUTATION (2026-11-06): enemies.js ELITE_CHANCE 0.22 → 0 → RED `elite rate within the
  // binomial 95% band` (elites 0 < 6) — adjacent keep-passing: wave-3 zeros stay green (the
  // band's low edge is the only discriminator the zero-chance mutates), stats asserts stay
  // green (spawnRaiderForProbe forceElite bypasses the roll — the seam the mutation isolates).
  // MERGE-HALT ROUND (2026-11-07, orchestrator ruling): the distribution gate is REPLACED by
  // mechanism gates + a sanity band. Why: the rate drew a confirmed 20/50 (P ≈ 0.1%) and a
  // reproduced instrumented 21/50 with meanDraw 0.4293 and mismatches 0 — the environment's
  // Math.random batches at run level (whole-run low-skewed batches of TRUE draws; the counted
  // flags always equal the draws' verdicts). A 95% band reds on such batches while the
  // mechanism is exact — the wrong gate for this failure class. The three gates that CANNOT
  // be defeated by batching: (a) mismatches === 0 — the recorded draw and the stamped flag
  // agree on EVERY spawn (kills the chance→0-lurking and double-stamp bug classes); (b)
  // killsFailed/aliveLeaks/notWave5 all 0 — the stage measured what it thinks it measured;
  // (c) the exact 99.9% central sanity interval [3,21] (coverage 99.912%, tails 0.0453% /
  // 0.0431%) purely to catch a mechanically broken roll: chance→0 reads 0 → RED; chance→1
  // reads 50 → RED. The instrumentation (draws/meanDraw/sibMeans/stream) rides the report as
  // the evidence surface; the flake-budget policy for ALL statistical asserts is the
  // stage-close decision item (report §11).
  ok('elite-rate mechanism exact + 99.9% sanity band ([3,21]: draw↔flag agreement on all 50 spawns, every spawn killed at wave 5, count sane)',
    rt.rolls === 50 && rt.mismatches === 0 && rt.killsFailed === 0 && rt.aliveLeaks === 0 && rt.notWave5 === 0 &&
    rt.elites >= 3 && rt.elites <= 21, JSON.stringify({ rolls: rt.rolls, elites: rt.elites, meanDraw: rt.meanDraw,
    mismatches: rt.mismatches, killsFailed: rt.killsFailed, aliveLeaks: rt.aliveLeaks, notWave5: rt.notWave5 }));
  ok('wave 3 produces zero elites (20 real spawns below ELITE_MIN_WAVE)',
    w3z.spawns === 20 && w3z.elites === 0, JSON.stringify(w3z));
  // MUTATION (2026-11-06): enemies.js spawnRaider's unconditional per-spawn reset block
  // removed → RED `former elite respawns normal` (after.elite true, scale 1.35, tint amber —
  // the reused pool slot leaks the elite skin). Adjacent keep-passing: elite stats asserts
  // stay green (stamping still works; only the reset is gone).
  ok('former elite respawns normal (unconditional per-spawn reset: flag/scale/hp/speedMult/tint/r)',
    rPin.elite === false && rPin.scale === 1 && rPin.speedMult === 1 && rPin.hp === (rPin.kind === 'gunner' ? 2 : 1) &&
    rPin.trimTint === 0xff3b2f && rPin.glowTint === 0xff6a3c && rPin.r === 0.9, JSON.stringify(rPin));
  // MUTATION (2026-11-06): weapons.js kill site ELITE_SCORE_MULT consumption removed (score
  // always base) → RED `elite kill pays ×2` (scoreDelta 150 ≠ 300). Adjacent keep-passing:
  // killsDelta + telemetry kill splits stay green (the kill path is intact; only the score
  // multiplier broke).
  ok('elite kill pays ×2 through the real bolt-kill path (gunner 150 × 2 = 300, kills +1)',
    sX2.scoreDelta === 300 && sX2.killsDelta === 1, JSON.stringify(sX2));
  ok('elite kill lands in the telemetry kill splits (kills.gunner +1, eliteKills.gunner +1)',
    sX2.tKillsGunner === 1 && sX2.tEliteGunner === 1, JSON.stringify(sX2));
  // MUTATION (2026-11-06): enemies.js startWave bypasses the table (always rolls rammerShare)
  // → RED `wave 1 composition is the authored table split` (the deterministic 1g/3r becomes a
  // stochastic roll; joint miss chance ≈ 0.03% across the five exact-split asserts — the
  // no-seeded-RNG caveat, architecture §7.1). Adjacent keep-passing: totals-equal-derived
  // stays green (the mutation preserves waveCount; only the KIND split broke).
  ok('wave 1 composition is the authored table split (1 gunner / 3 rammers, source table)',
    tb.rows && tb.rows[1] && tb.rows[1].gunner === 1 && tb.rows[1].rammer === 3 && tb.rows[1].source === 'table',
    JSON.stringify(tb.rows ? tb.rows[1] : null));
  ok('waves 2-5 composition is the authored table split (2g/4r, 3g/4r, 4g/5r, 5g/5r)',
    tb.rows && tb.rows[2] && tb.rows[2].gunner === 2 && tb.rows[2].rammer === 4 &&
    tb.rows[3] && tb.rows[3].gunner === 3 && tb.rows[3].rammer === 4 &&
    tb.rows[4] && tb.rows[4].gunner === 4 && tb.rows[4].rammer === 5 &&
    tb.rows[5] && tb.rows[5].gunner === 5 && tb.rows[5].rammer === 5,
    JSON.stringify(tb.rows || null));
  ok('table totals equal the derived waveCount exactly per wave (4,6,7,9,10 — the curve is unchanged)',
    tb.rows && [1, 2, 3, 4, 5].every((w) => tb.rows[w] && tb.rows[w].total === tb.waveCounts[w - 1] && tb.waveCounts[w - 1] === [4, 6, 7, 9, 10][w - 1]),
    JSON.stringify({ rows: tb.rows, waveCounts: tb.waveCounts }));
  ok('table↔derived boundary BOTH ways (wave 5 source table, wave 6+ derived; wave-6 spawn total = waveCount(6) = 12)',
    tb.rows && tb.rows[5] && tb.rows[5].source === 'table' && tb.w6 && tb.w6.source === 'derived' && tb.w6.total === 12,
    JSON.stringify({ w5: tb.rows ? tb.rows[5] : null, w6: tb.w6 }));
  ok('telemetry scripted run: stream kill matches the drive (shots ≥ 1, hits ≥ 1, hits ≤ shots, kills.rammer +1, scoreBy.rammer +100)',
    tm.rammerKill && tm.rammerKill.shotsStream >= 1 && tm.rammerKill.hitsStream >= 1 &&
    tm.rammerKill.hitsStream <= tm.rammerKill.shotsStream &&
    tm.rammerKill.killsRammer === 1 && tm.rammerKill.scoreRammer === 100, JSON.stringify(tm.rammerKill || null));
  ok('telemetry scripted run: charged one-shot matches the drive (shots.charged +1, kills.gunner +1, chargedKills +1, scoreBy.gunner +150)',
    tm.chargedKill && tm.chargedKill.shotsCharged === 1 && tm.chargedKill.killsGunner === 1 &&
    tm.chargedKill.chargedKills === 1 && tm.chargedKill.scoreGunner === 150, JSON.stringify(tm.chargedKill || null));
  // the dump is read LIVE from combatState().telemetry (the state is frozen — the boss stage landed victory): the drive never duplicates the dump shape
  const telDump = await J(`__stage2.combatState().telemetry`);
  ok('telemetry dump is complete and sane (every group present, numbers not NaN, no undefined — accuracy is read-derived, never stored)',
    !!telDump && (() => {
      const d = telDump;
      const groups = ['kills', 'eliteKills', 'shots', 'hits', 'damageTaken', 'scoreBy', 'waveTimes', 'pickups'];
      if (!groups.every((g) => d[g] !== undefined)) return false;
      if (typeof d.chargedKills !== 'number' || typeof d.waveReached !== 'number') return false;
      if (d.deathBy !== null && typeof d.deathBy !== 'string') return false;
      if (!Array.isArray(d.waveTimes) || d.waveTimes.length > 6) return false;
      const bad = JSON.stringify(d).match(/NaN|Infinity/);
      const walk = (o) => Object.values(o).some((v) => v === undefined || (typeof v === 'object' && v !== null && !Array.isArray(v) && walk(v)));
      return !bad && !walk(d);
    })(), JSON.stringify(telDump));
  // MUTATION (2026-11-06): combat.js enterCombat's telemetry zero line removed → RED
  // `telemetry zeroed on enterCombat` (the pre-restart run's counters ride the fresh entry —
  // restart parity breaks). Adjacent keep-passing: the score/kills zeroing (the L453 pattern)
  // is untouched — the existing second-run baseline assert stays green.
  // SPEC-REVIEW ROUND (2026-11-07): scoreBy.boss was a DEAD FIELD — the award wrote only
  // C.score (+ the latch), and the dump-sanity assert checks PRESENCE only, so boss:0 passed
  // vacuously on a run whose final score included the +1000. The strengthened clause reads
  // the frozen state live: the single award must read scoreBy.boss === 1000 exactly.
  // RED-BEFORE recorded (flow-red-reviewfix.txt: scoreByBoss 0 on the pre-fix branch build).
  const bossScoreBy = await J(`__stage2.combatState().telemetry.scoreBy.boss`);
  ok('boss reward: final score = pre-boss + 1000 exactly, exactly once (forced second completion never double-awards — bossAwarded latched, reports countable at 2, scoreBy.boss = the award itself)',
    bs.scoreAfter === bs.preScore + 1000 && bs.scoreAfter2 === bs.scoreAfter && bs.bossAwarded === true && bs.reports === 2 && bossScoreBy === 1000,
    JSON.stringify({ ...bs, scoreByBoss: bossScoreBy }));
  // SPEC-REVIEW ROUND (2026-11-07): renamed — this page performs NO reload; the assert reads
  // the ledger at balanceProbe latch time (typically stale-high from the earlier pages'
  // natural-death writes). The AC's substance (persist → read back = the +1000) is proven by
  // the victory-path assert: highscore === 1000 exactly after victory.enter's writeHighscore.
  ok('highscore ledger at balanceProbe time still carries the boss award (>= 1000; the exact persist→read-back is pinned on the victory path)',
    b19.highscore !== undefined && b19.highscore >= 1000, `highscore=${b19.highscore} finalScore=${bs.finalScore}`);
  // stage-6 H1: the wave banner re-arms at the NATURAL wave increment. The drive ran one
  // unpinned clear-field cycle (stage 8.5 — the only wavesTick advance in the whole battery;
  // every other drive pins the wave at 1): the field clears, wavesTick counts its 1.6 s gap
  // and increments to wave 2, and the banner writer re-arms at that increment point. The
  // wave-clear bonus that rides the same event is absorbed by the delta-based score/telemetry
  // asserts above (every mark is captured after this stage). RED on the pre-H1 build: no
  // banner state, no element (red by absence).
  ok('H1: wave banner re-arms on the natural wave increment (WAVE 2 — the drive observed the banner up at wave ≥ 2; element present + visible; hidden after the ~2 s window)',
    b19.banner && b19.banner.seen === true && b19.banner.wave === 2 && b19.banner.elSeen === true &&
    b19.banner.elVisible === true && b19.banner.hiddenAfter === true, JSON.stringify(b19.banner || null));
  ok('CONSOLE [] (balanceProbe page)', errs.length === 0, errs.join(' | '));
  {
    // telemetry restart parity (the zeroing mutation's red): the boss stage landed victory —
    // REPLAY → pad → walk to combat → the fresh entry's telemetry must read ALL ZERO.
    let parityChecked = false;
    if (bp19 && (await evl(`(window.__stage2 && __stage2.phase) || 'boot'`)) === 'victory') {
      await evl(`document.getElementById('vic-replay').click()`);
      let padLanded19 = false;
      {
        const t0 = Date.now();
        for (;;) {
          try { if (await J(`__stage2.phase`) === 'pad') { padLanded19 = true; break; } } catch {}
          if (Date.now() - t0 > 20000) break;
          await sleep(200);
        }
      }
      let combatLanded19 = false;
      if (padLanded19) {
        const t0 = Date.now();
        while (Date.now() - t0 < 120000) { // pad auto-advances through the launch walk
          let p = null;
          try { p = await evl(`(window.__stage2 && __stage2.phase) || 'boot'`); } catch {}
          if (p === 'combat') { combatLanded19 = true; break; }
          await sleep(250);
        }
      }
      const tel19 = combatLanded19 ? await J(`__stage2.combatState().telemetry`) : null;
      parityChecked = combatLanded19;
      const allZero = !!tel19 &&
        tel19.kills.gunner === 0 && tel19.kills.rammer === 0 && tel19.kills.orb === 0 &&
        tel19.eliteKills.gunner === 0 && tel19.eliteKills.rammer === 0 && tel19.chargedKills === 0 &&
        tel19.shots.stream === 0 && tel19.shots.charged === 0 &&
        tel19.hits.stream === 0 && tel19.hits.charged === 0 &&
        tel19.damageTaken.bolt === 0 && tel19.damageTaken.ram === 0 && tel19.damageTaken.dive === 0 && tel19.damageTaken.bossDash === 0 && tel19.damageTaken.rock === 0 &&
        tel19.deathBy === null &&
        tel19.scoreBy.gunner === 0 && tel19.scoreBy.rammer === 0 && tel19.scoreBy.orb === 0 &&
        tel19.scoreBy.waveBonus === 0 && tel19.scoreBy.boss === 0 &&
        tel19.waveReached === 1 && tel19.waveTimes.length === 0 &&
        tel19.pickups.dropped === 0 && tel19.pickups.picked === 0 && tel19.pickups.expired === 0 &&
        tel19.pickups.byKind.SPREAD === 0 && tel19.pickups.byKind.OVERDRIVE === 0 && tel19.pickups.byKind.SHIELD === 0;
      ok('telemetry zeroed on enterCombat (restart parity: fresh entry reads all zeros, waveReached 1)',
        allZero, JSON.stringify(tel19));
    }
    if (!parityChecked) ok('telemetry zeroed on enterCombat (restart parity: fresh entry reads all zeros, waveReached 1)',
      false, bp19 ? 'victory phase missing after the boss stage' : 'no balanceProbe report (old build: red by absence)');
  }


  /* --- stage-6 W1 aim overhaul (?fireProbe=1, next page over the SAME CDP session) ---
     The FIRE-PATH BASELINE + the aim-lock behavior battery, in the card's required order.
     The drive (src/probes-fire.js, one walk per file) SEEDS deterministic targets and captures
     b.userData.dir of real fired bolts — it never spawns a bolt itself. The trigger is REAL CDP
     pointer input: the drive raises window.__stage2.fireArmN, the harness performs
     Input.dispatchMouseEvent mousePressed/mouseReleased (input.js onPointerDown → input.fire →
     fireTick → spawnStreamShot → spawnBolt), closes the loop with a fireGoN flag, and the drive
     captures from the bolt pool. Every pre-W1 probe bypassed spawnBolt — that was the blind
     spot this page exists to close.
     RED-FIRST (branch polish/stage6-experience): the drive + ALL asserts below ran against the
     feature-less build (probe infrastructure only — NO aim-assist.js, no bias, no T, no
     pipper/bracket, combatState without .lock/.lockTarget). GREEN BY DESIGN there (recorded in
     the same transcript): the two fire-path baseline asserts + the report + the CONSOLE asserts
     — real fired bolts already fly along forward() and kill, exactly the invariant the W1 bias
     must not break, and the bias is a no-op at zero angle so both stay green post-feature.
     Everything else records RED for absence/behavior: fs2.lockSeen false (no lock), biasDeg 0
     (no convergence), lockAfterKill null (surface undefined), fs3 lockSeen false, fs4.lock null,
     boss stage lockWasDefined false, pipper/bracket elements absent, pad drain false, and the
     whole T battery (no KeyT handler, no __stage2.lock/lockRaw). Transcript:
     production/qa/evidence/stage6-w1/flow-red-w1.txt.
     THE FAN+BIAS SUM CLAMP (the card's "decide and DOCUMENT", restated here): the bias
     rotation is capped at 6° (BIAS_MAX_DEG, weapons-side call), the SPREAD fan is ±6°
     (SPREAD_ARC), and the STATED SUM MAX is 10° from nose-forward — the lock retain cone: both
     the pre-bias dir (≤6° = fan) and the locked-target dir (≤10° = retain) lie in the
     geodesically-convex 10° cap, and the biased dir lies ON the geodesic between them, so the
     final dir can never exceed 10° off the nose (≤ the naive 6°+6°=12° ceiling). Measured
     stage-scoped bands: the center-bolt stage reads exactly 6.0 (band [5.5,6.3]); the fresh-
     acquire fan stage reads ≤6.3 for every bolt.
     MUTATIONS (branch, post-green, each: mutate → npm run build → FULL flow-check → restore →
     rebuild; verified applied by reading the red output):
       (a) aim-assist.js bias clamp removed (Math.min(BIAS_MAX_RAD, ang) → ang) → RED
           `bias cap` (biasDeg 10.32 > 6.3 — the unclamped bolt rotates the FULL angle onto the
           retained 8.5°-parked target; the true nose sits at rocket-local +1.6, so the
           bolt-relative target angle is 10.32°, not the 9.5° the +1.0 estimate gave) AND RED
           `far fan bolt does NOT fully converge` (maxAngleToTarget 0.86 < 3 — the unclamped
           rotation swallows the whole 10.86° fan-to-target gap: every captured dir reads the
           target dir exactly). The DEAD-AHEAD baseline asserts stay green under (a) BY
           CONSTRUCTION (zero angle ⇒ zero rotation — the clamp is not load-bearing there); the
           generalized fire-path invariant that reds is this stage-2 cap assert. One
           environmental OVERDRIVE-interval flake co-occurred (0.0778 > 0.075 at frameDt 0.0207
           — the same headless timing-noise class the green run 1 recorded and green run 2
           cleared; unrelated to the mutation, whose named asserts both red). Transcript:
           flow-mutation-biasclamp.txt (229/3).
       (b) aim-assist.js ACQUIRE_DEG 6 → 180 → RED `outside-cone target never locks` ALONE
           (231/1: the 20° parked target acquires — locked true, lockEverTrue true, and the
           fired bolt reads 6° = the capped bias toward the now-locked target, fully
           consistent). Transcript: flow-mutation-cone180.txt.
     Full outputs: production/qa/evidence/stage6-w1/. */
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat&fireProbe=1' });
  let fp = null;
  {
    const t0 = Date.now();
    let arm1 = false, arm2 = false, arm3 = false, arm4 = false, arm6 = false, arm6b = false, arm6c = false;
    // the REAL trigger — CDP mouse input through input.js's own listener (the same chain a
    // player's click hits); the drive only watches for the fireGoN handshake
    const firePress = async (go) => {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 300, y: 200, button: 'left', clickCount: 1 });
      await sleep(500);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 300, y: 200, button: 'left', clickCount: 1 });
      await sleep(150);
      await evl(`window.__stage2.${go} = true`);
    };
    for (;;) {
      try {
        if (!arm1 && await evl(`(window.__stage2 && window.__stage2.fireArm) === true`)) { arm1 = true; await firePress('fireGo1'); }
        else if (arm1 && !arm2 && await evl(`(window.__stage2 && window.__stage2.fireArm2) === true`)) { arm2 = true; await firePress('fireGo2'); }
        else if (arm2 && !arm3 && await evl(`(window.__stage2 && window.__stage2.fireArm3) === true`)) { arm3 = true; await firePress('fireGo3'); }
        else if (arm3 && !arm4 && await evl(`(window.__stage2 && window.__stage2.fireArm4) === true`)) { arm4 = true; await firePress('fireGo4'); }
        // story 7.4: the camera-axis hit witness — one real press per seat (16/24/34 u)
        else if (arm4 && !arm6 && await evl(`(window.__stage2 && window.__stage2.fireArm6) === true`)) { arm6 = true; await firePress('fireGo6'); }
        else if (arm6 && !arm6b && await evl(`(window.__stage2 && window.__stage2.fireArm6b) === true`)) { arm6b = true; await firePress('fireGo6b'); }
        else if (arm6b && !arm6c && await evl(`(window.__stage2 && window.__stage2.fireArm6c) === true`)) { arm6c = true; await firePress('fireGo6c'); }
        fp = await J(`(window.__stage2 && window.__stage2.fireProbe) || null`);
      } catch { fp = null; }
      if (fp) break;
      if (Date.now() - t0 > 180000) break; // deadline — the asserts below record the red
      await sleep(200);
    }
  }
  const fpX = fp || {};
  const fs1 = fpX.s1 || {}, fs2 = fpX.s2 || {}, fs3 = fpX.s3 || {}, fs4 = fpX.s4 || {}, fs5 = fpX.boss || {};
  ok('fireProbe reports (stage-6 W1)', !!fp, JSON.stringify(fpX));
  // FIRE-PATH BASELINE — story 7.4 rewrite (was: dir vs forward ≤1.1°, the nose-alignment
  // invariant the W1 bias had to keep). With nothing on the field the lock is null, so the
  // first real bolt must be CAMERA-TRUE converge aim: dir == normalize(camPos+camFwd·28−muzzle)
  // within 0.5° (28 = AIMK.CONVERGE_DIST). The old metric rides the report as s1.dirDeg
  // (provenance only — under 7.4 it reads ~16°, the parked-seat camera offset, BY DESIGN).
  ok('7.4 fire-path baseline: with nothing locked the real fired bolt is camera-true converge aim (dir vs normalize(camPos+camFwd*28−muzzle) ≤0.5°)',
    fs1.boltCaptured === true && typeof fs1.convDeg === 'number' && fs1.convDeg <= 0.5, `convDeg=${fs1.convDeg} dirDeg=${fs1.dirDeg}`);
  ok('W1 fire-path baseline: the real fired bolt kills the seeded dead-ahead target (real trigger → spawnBolt → boltsTick)',
    fs1.killConfirmed === true, JSON.stringify(fs1));
  // stage-6 H1: the kill-only hit marker — the registered kill (this stage's real bolt kill,
  // the C.kills++ path) shows the marker; the element must exist (red-by-absence on the
  // pre-H1 build). The kill-ONLY law's negative half — non-kill hits never mark — is the
  // bossProbe page's 6-real-hit evidence.
  ok('H1: hit marker shows on the registered kill (stage-1 real-bolt kill; element present, seen visible ~150 ms)',
    fs1.markElSeen === true && fs1.killConfirmed === true && fs1.killMarkSeen === true, JSON.stringify(fs1));
  // story 7.4: the positive half of the pipper `locked` class — the stage-1 target is in-cone,
  // so the lock holds while the drive samples the element (the negative half is the empty-field
  // assert below).
  ok('7.4: pipper carries the `locked` class while a lock is held (stage-1 in-cone sample)',
    fs1.lockSeen === true && fs1.pipLockedSeen === true, JSON.stringify(fs1));
  ok('W1: lock acquires an in-cone target (dead-ahead seed)', fs2.lockSeen === true, JSON.stringify(fs2));
  // story 7.4 rewrite (was: parked 8.5° off the NOSE, outside acquire 6 / inside retain 10):
  // the park is now 16° off the CAMERA axis — outside acquire 12°, inside retain 20° (the same
  // hysteresis intent at the new cone numbers); parkDeg ≈16 recorded as the seat sanity.
  ok('7.4: hysteresis — the lock RETAINS a target parked at 16° off the camera axis (outside acquire 12°, inside retain 20°)',
    fs2.lockRetainedSeen === true && typeof fs2.parkDeg === 'number' && Math.abs(fs2.parkDeg - 16) <= 1, JSON.stringify(fs2));
  // story 7.4 rewrite (was: the bias-cap band ≥5.5 ≤6.3 — the capped spawn rotation). The bias
  // is retired: the fired bolt is LOCK-AIMED at the retained target (≈0° from the direct dir).
  ok('7.4: the fired bolt is lock-aimed on the retained target (dir vs the direct target dir ≤3°)',
    typeof fs2.convToTargetDeg === 'number' && fs2.convToTargetDeg <= 3, `convToTargetDeg=${fs2.convToTargetDeg}`);
  ok('W1: dead-target drops the lock (the real bolt kills the retained target; lock reads false after)',
    fs2.lockAfterKill === false, `lockAfterKill=${JSON.stringify(fs2.lockAfterKill)}`);
  // story 7.4 rewrites (were: 'far fan bolt does NOT fully converge' + 'every bolt ≤6.3° from
  // the nose' — both describe the retired bias clamp). The fan's base is the camera-true
  // lock-aim now and fan bolts HOME: the fan still spreads ±6° about that base (max pairwise
  // dir span at capture, narrowed only by the homing lerp) and a fan bolt converges ON the
  // locked target (min angle-to-target ≈0 — the center bolt is lock-aimed).
  ok('7.4: SPREAD fan — the fan still spreads ±6° about the camera-true base (max pairwise dir span 4-13° at capture)',
    fs3.lockSeen === true && fs3.spreadSeen === true && typeof fs3.pairSpan === 'number' && fs3.pairSpan >= 4 && fs3.pairSpan <= 13, JSON.stringify(fs3));
  ok('7.4: SPREAD fan — a fan bolt converges ON the locked target (min angle-to-target ≤2.5°; the center bolt is lock-aimed, homing sharpens the outers)',
    fs3.lockSeen === true && typeof fs3.minToTarget === 'number' && fs3.minToTarget <= 2.5, JSON.stringify(fs3));
  // story 7.4 rewrite (was: 20° off the NOSE, bolt stays nose-aligned ≤1.1°): the seat is 25°
  // off the CAMERA axis (outside acquire 12 AND retain 20) and the fired bolt is camera-true
  // converge aim ≤0.5° (the boltAngleToForward provenance field reads ~16° by design now).
  ok('7.4: outside-cone target never locks (25° off the camera axis; lock false the whole window)',
    fs4.locked === false && fs4.lockEverTrue === false, JSON.stringify(fs4));
  ok('7.4: with nothing locked the fired bolt is camera-true converge aim (dir vs normalize(camPos+camFwd*28−muzzle) ≤0.5°)',
    typeof fs4.boltConvDeg === 'number' && fs4.boltConvDeg <= 0.5, `boltConvDeg=${fs4.boltConvDeg}`);
  ok('W1: the boss never locks (boss parked dead-ahead 26u — dead-center in the acquire cone — for the whole window)',
    fs5.bossAliveSeen === true && fs5.bossInConeEver === true && fs5.bossLockSeen === false && fpX.lockWasDefined === true, JSON.stringify(fs5));

  /* --- story 7.4: camera-axis hit witness (RED-first 2026-11-10) ---
     The drive seats a raider exactly ON the camera axis (camPos + camForward·D, live-read from
     C.camera) at 16/24/34 u and fires real bolts per seat. The pre-7.4 nose-aim build misses
     all three (bolts fly the nose; the camera axis crosses it only 4 u out — perpendicular
     miss 2.1/4.4/7.2 u vs the 1.05 u kill sphere) and never locks the seat (8-12° off the
     NOSE, outside the old 6° acquire cone) — both asserts below record honest reds there.
     lockFrames counts DRIVE ticks from seat to first locked sample: 1 = the tick after the
     seat (lockTick precedes the probe in tickCombat — same-frame is structurally impossible);
     ≤3 tolerates a harness stall frame without weakening the no-delay contract. */
  const fs6 = fpX.s6 || {};
  ok('7.4 camera-axis hit witness: real fired bolts kill a raider seated ON the camera axis at 16/24/34u (pre-7.4 nose-aim misses all three)',
    !!fs6.d16 && typeof fs6.d16.seatDeg === 'number' && fs6.d16.killed === true &&
    !!fs6.d24 && fs6.d24.killed === true && !!fs6.d34 && fs6.d34.killed === true, JSON.stringify(fs6));
  ok('7.4: lock acquires the camera-axis seat within ~1 frame of it entering the acquire cone (all three seats; null = never locked)',
    !!fs6.d16 && fs6.d16.lockFrames >= 1 && fs6.d16.lockFrames <= 3 &&
    !!fs6.d24 && fs6.d24.lockFrames >= 1 && fs6.d24.lockFrames <= 3 &&
    !!fs6.d34 && fs6.d34.lockFrames >= 1 && fs6.d34.lockFrames <= 3, JSON.stringify(fs6));

  // pipper — story 7.4 REWRITE (was: renders ONLY while the reticle (pointer, px) diverges
  // past the 72px threshold — self-hides aligned; that rule and PIPPER_ON_PX are removed).
  // The pipper is ALWAYS visible while the combat HUD is on (screen-center anchor — with
  // camera-true aim it is the honest bolt-path marker at every range) and carries the
  // `locked` class iff a lock is held. The post-drive field is empty for ~99 s (the drive's
  // wave-gap pin), so "no lock" here is deterministic. Real pointer events.
  await evl(`window.dispatchEvent(new PointerEvent('pointermove', {clientX: Math.round(window.innerWidth/2), clientY: Math.round(window.innerHeight/2), bubbles: true}))`);
  await sleep(300);
  const w1PipC = await J(`({ el: !!document.getElementById('pipper'),
    hidden: document.getElementById('pipper') ? document.getElementById('pipper').hidden : null,
    locked: document.getElementById('pipper') ? document.getElementById('pipper').classList.contains('locked') : null })`);
  ok('7.4: pipper always visible in combat (center pointer — the 72px hide rule is gone)', w1PipC.el === true && w1PipC.hidden === false, JSON.stringify(w1PipC));
  ok('7.4: pipper `locked` class absent with nothing locked (post-drive field empty)', w1PipC.locked === false, JSON.stringify(w1PipC));
  await evl(`window.dispatchEvent(new PointerEvent('pointermove', {clientX: Math.round(window.innerWidth*0.75), clientY: Math.round(window.innerHeight/2), bubbles: true}))`);
  await sleep(300);
  const w1PipO = await J(`({ hidden: document.getElementById('pipper') ? document.getElementById('pipper').hidden : null,
    locked: document.getElementById('pipper') ? document.getElementById('pipper').classList.contains('locked') : null })`);
  ok('7.4: pipper stays visible while the reticle diverges (always-on law) and still unlocked on the empty field', w1PipO.hidden === false && w1PipO.locked === false, JSON.stringify(w1PipO));
  // stage-6 H1 pipper honesty rider (W1's chair flag): the pipper's visibility gate rides
  // pointer-divergence — the same input-state class as the pre-law reticle — so combatState()
  // now exposes the WRITER'S OWN stored state ({ visible, divergenceDeg }) and the harness can
  // read the pipper's render state the same way .lock/.lockTarget read the bracket (honesty
  // law). RED on the pre-H1 build (surface absent → red by absence).
  const h1Pip = await J(`({ cs: (window.__stage2 && __stage2.combatState) ? __stage2.combatState().pipper : 'none',
    elHidden: (document.getElementById('pipper') || { hidden: null }).hidden })`);
  ok('H1: pipper honesty surface — combatState().pipper {visible, divergenceDeg} agrees with the element while diverged',
    h1Pip.cs && h1Pip.cs !== 'none' && h1Pip.cs.visible === true && h1Pip.elHidden === false &&
    typeof h1Pip.cs.divergenceDeg === 'number' && h1Pip.cs.divergenceDeg > 2, JSON.stringify(h1Pip));
  await evl(`window.dispatchEvent(new PointerEvent('pointermove', {clientX: Math.round(window.innerWidth/2), clientY: Math.round(window.innerHeight/2), bubbles: true}))`);
  await sleep(300);
  const w1PipR = await J(`({ hidden: document.getElementById('pipper') ? document.getElementById('pipper').hidden : null })`);
  ok('7.4: pipper still visible on re-alignment (the always-on law — no self-hide)', w1PipR.hidden === false, JSON.stringify(w1PipR));
  // bracket — ONE element, the locked target only; hidden without a lock; honesty surface:
  // combatState().lockTarget must be null exactly when nothing is locked
  const w1Br = await J(`({ hidden: document.getElementById('lock-bracket') ? document.getElementById('lock-bracket').hidden : null,
    lt: (window.__stage2 && __stage2.combatState) ? __stage2.combatState().lockTarget : 'none' })`);
  ok('W1: bracket hidden without a lock (field empty; lockTarget null — the honesty surface agrees)', w1Br.hidden === true && w1Br.lt === null, JSON.stringify(w1Br));
  ok('W1: bracket renders ON the locked target (dead-ahead stage-1 lock; bracketOnLock sampled in-page beside the lock)',
    fs1.lockSeen === true && fs1.bracketOnLock === true, JSON.stringify(fs1));
  ok('CONSOLE [] (fireProbe page)', errs.length === 0, errs.join(' | '));

  /* --- stage-6 W1: T toggle + persistence (?debug=1&goto=combat pages over the SAME CDP
     session — the story-020 battery shape, mirrored for the aim-lock choice) ---
     The toggle is driven through the REAL key path: input.js's combat-branch KeyT →
     aim-assist toggleLock() → writeLock (the store.js pair — the MUTED_KEY mirror). Persistence
     rides REAL Page.navigate reloads over the same profile (localStorage genuinely persists —
     the story-020 mechanism). Default ON (the audit's opt-out-able assist, ux-audit F1b);
     corrupt seeds read OFF (the canonical-value clamp: only '1' is ON, so 'garbage'/'2'
     degrade to manual aim — the conservative fallback; an UNWRITTEN key boots ON) and survive
     boot byte-identical (restore reads, never rewrites).
     RED-FIRST: on the feature-less build __stage2.lock/lockRaw are absent (recorded null) and
     KeyT is a no-op — every assert below records RED (the story-020 red pattern). Same
     transcript as the fireProbe block: flow-red-w1.txt. */
  const w1Combat = async () => {
    await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat' });
    const t0 = Date.now();
    for (;;) { try { if (await J(`(window.__stage2 && __stage2.phase) || 'boot'`) === 'combat') break; } catch {} if (Date.now() - t0 > 60000) break; await sleep(300); }
  };
  const lockState = () => J(`({ lock: (window.__stage2 && __stage2.lock !== undefined) ? __stage2.lock : null,
    raw: (window.__stage2 && __stage2.lockRaw) ? __stage2.lockRaw() : null })`);
  await w1Combat();
  const lsA = await lockState();
  ok('W1: lock boots ON by default (no stored key — the audit opt-out-able assist)', lsA.lock === true && lsA.raw === null, JSON.stringify(lsA));
  await key('KeyT', 'keydown'); await key('KeyT', 'keyup'); await sleep(150);
  const lsB = await lockState();
  ok('W1: T toggles the lock OFF in-session (combat branch, the KeyM mirror)', lsB.lock === false, JSON.stringify(lsB));
  ok("W1: T write-through at the store (raw stage2.lock = '0')", lsB.raw === '0', `raw=${JSON.stringify(lsB.raw)}`);
  ok('CONSOLE [] (W1 toggle page)', errs.length === 0, errs.join(' | '));
  await w1Combat();
  const lsC = await lockState();
  ok('W1: lock OFF survives a real reload (persisted, not session-only)', lsC.lock === false && lsC.raw === '0', JSON.stringify(lsC));
  await key('KeyT', 'keydown'); await key('KeyT', 'keyup'); await sleep(150);
  const lsD = await lockState();
  ok('W1: T re-enables the lock ON in-session', lsD.lock === true, JSON.stringify(lsD));
  ok("W1: T write-through back to '1'", lsD.raw === '1', `raw=${JSON.stringify(lsD.raw)}`);
  await w1Combat();
  const lsE = await lockState();
  ok('W1: lock ON survives a real reload (persistence asserted BOTH ways)', lsE.lock === true && lsE.raw === '1', JSON.stringify(lsE));
  // corrupt-read safety (§8.9 proven, not assumed — the story-020 shape): the harness seeds the
  // raw key directly; the game has zero storage access outside store.js.
  await evl(`localStorage.setItem('stage2.lock', 'garbage')`);
  await w1Combat();
  const lsF = await lockState();
  ok("W1: corrupt 'garbage' boots OFF (canonical clamp — only '1' reads ON; corrupt degrades to manual aim)", lsF.lock === false, JSON.stringify(lsF));
  ok('W1: corrupt seed survives boot byte-identical (restore reads, never rewrites)', lsF.raw === 'garbage', `raw=${JSON.stringify(lsF.raw)}`);
  ok('CONSOLE [] (W1 corrupt page)', errs.length === 0, errs.join(' | '));
  await evl(`localStorage.setItem('stage2.lock', '2')`);
  await w1Combat();
  const lsG = await lockState();
  ok("W1: numeric garbage '2' boots OFF (the same canonical clamp)", lsG.lock === false, JSON.stringify(lsG));
  await evl(`localStorage.removeItem('stage2.lock')`); // hygiene: later pages boot the default (nothing after this battery reads the lock)


  /* --- R-c commit 4: SPIN N-key regression probe (?debug=1&spin=1, page over the SAME CDP session) ---
     input.js 30-31 dereferences ctx.activeFix (the SHIP1 closed-viewer N/T path), but story-011
     never wired the property onto ctx — pressing N on the title screen threw inside the keydown
     listener and the label never cycled. R-c commit 2 wires it: activeFix moves to src/rocket.js
     and main.js puts the imported object on ctx.
     RED on master 4b08fd0, 2026-11-06 — N press threw Uncaught TypeError: Cannot read properties
     of undefined (reading 'nose'); the activeFix wiring commit fixes it. Adjacent keep-passing:
     title phase, rocket:glb, rocketMetrics unchanged (verified identical on both sides: phase
     title, rocket glb, size [1.418,1.6,0.651], label initial axes 'nose=-Z top=+Y').
     RED-run mechanics: master checkout in the main tree + master `npm run build`, THIS exact
     harness file (scratch copy, byte-identical to the committed one) — the harness's fixed
     E:\Game Build paths load the main tree's index.html, so the master bundle is what runs.
     One new assert — the harness goes 114 → 115. */
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&spin=1' });
  let spin0 = null;
  {
    const t0 = Date.now();
    for (;;) {
      // guarded + thrown-tolerant (droneProbe pattern): across Page.navigate the old execution
      // context dies and the fresh document has no spin label until setupSpinViewer runs
      try { spin0 = await J(`({ label: document.getElementById('spin-label')?.textContent || null,
        phase: (window.__stage2 && __stage2.phase) || null,
        rocket: (window.__stage2 && __stage2.rocket) || null,
        size: (window.__stage2 && __stage2.rocketMetrics) ? __stage2.rocketMetrics().size : null })`); } catch { spin0 = null; }
      if (spin0 && spin0.label) break;
      if (Date.now() - t0 > 60000) break; // deadline — the assert below records the red
      await sleep(300);
    }
  }
  const errsBeforeSpin = errs.length;
  await key('KeyN', 'keydown');
  await key('KeyN', 'keyup');
  await sleep(200);
  const spin1 = await J(`({ label: document.getElementById('spin-label')?.textContent || null,
    shipFix: (window.__stage2 && __stage2.rocketMetrics) ? __stage2.rocketMetrics().shipFix : null })`);
  ok('SPIN N-key cycles the label, no console error (ctx.activeFix wired)',
    !!spin0 && !!spin0.label && spin0.label.startsWith('nose=-Z') && spin0.phase === 'title' && spin0.rocket === 'glb' &&
    Array.isArray(spin0.size) && spin0.size.length === 3 &&
    !!spin1.label && spin1.label !== spin0.label && !!spin1.shipFix && spin1.shipFix.nose !== '-Z' &&
    errs.length === errsBeforeSpin,
    JSON.stringify({ before: spin0, after: spin1, newErrs: errs.slice(errsBeforeSpin) }));

  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat&composerFault=1' });
  let td13 = null;
  {
    const t0 = Date.now();
    for (;;) {
      try {
        const ph = await evl(`window.__stage2 ? __stage2.phase : 'boot'`);
        if (ph === 'combat') { td13 = await J(`({ post: __stage2.post, fps: __stage2.fps, phase: __stage2.phase })`); break; }
      } catch {}
      if (Date.now() - t0 > 60000) break;
      await sleep(300);
    }
  }
  const d13 = td13 || {};
  ok(`TD-013 composer throw degrades post to 'direct'`, d13.post === 'direct', `post=${d13.post}`);
  ok('TD-013 game keeps running after degrade', d13.phase === 'combat' && (d13.fps || 0) > 10, JSON.stringify(d13));
  const d13warns = errs.filter((e) => e.includes('composer render threw'));
  ok('TD-013 one-line degrade logged once', d13warns.length === 1, JSON.stringify(d13warns));
  errs.length = 0; // the degrade line is the DESIGNED evidence — reset before the final CONSOLE []

  /* --- TD-015 (?musicFault=1, fourth page): a WebAudio throw can never abort a phase ---
     The fault switch makes the COMBAT bed build throw once, inside combat.enter's musicTo
     (a live phase-enter hook — audio is unlocked first with a real CDP key event so the
     deferred flush is out of the way). Asserts: the phase still lands, musicState() reads
     the honest 'none', one warn line, and no uncaught exception. */
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&musicFault=1' });
  let td15 = null;
  {
    const t0 = Date.now();
    for (;;) {
      try { if (await evl(`window.__stage2 ? __stage2.phase : 'boot'`) === 'title') break; } catch {}
      if (Date.now() - t0 > 60000) break;
      await sleep(300);
    }
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
    await sleep(800); // title bed builds via the deferred flush; the context is now live
    await evl(`document.getElementById('btn-skip').click()`);
  }
  {
    const t0 = Date.now();
    for (;;) {
      try {
        const ph = await evl(`window.__stage2 ? __stage2.phase : 'boot'`);
        if (ph === 'combat') { td15 = await J(`({ phase: __stage2.phase, music: __stage2.musicState() })`); break; }
      } catch {}
      if (Date.now() - t0 > 30000) break;
      await sleep(200);
    }
  }
  const d15 = td15 || {};
  ok('TD-015 phase lands despite musicTo throw', d15.phase === 'combat', JSON.stringify(d15));
  ok(`TD-015 musicState reflects 'none' after the fault`, d15.music === 'none', `music=${d15.music}`);
  const d15warns = errs.filter((e) => e.includes('music bed failed'));
  ok('TD-015 one-line warn logged', d15warns.length === 1, JSON.stringify(d15warns));
  ok('TD-015 no uncaught exception from the fault', !errs.some((e) => e.startsWith('EXCEPTION')),
    JSON.stringify(errs.filter((e) => e.startsWith('EXCEPTION'))));
  errs.length = 0; // the warn is the DESIGNED evidence — reset before the final CONSOLE []

  /* --- story-014 edge (fifth page): double-fire — the two card paths are mutually exclusive ---
     Deterministic drive: bossProbe runs to the death cinematic; the moment
     combatState().boss.phase reads 'dying' the harness WAITS 600 ms INTO the cinematic, then
     fires __stage2.probeDamagePlayer(500). Stage-2 review (finding 1): the early-hurt drive
     (< 0.2 s) always landed gameover BEFORE the cinematic completed, so the completion code
     path — and its re-fire class — was never exercised. The 600 ms delay guarantees
     completion-before-gameover (hurt ≤0.7 s → gameover ≤1.4 s; completion ≤1.2 s), which is
     the natural late-volley-bolt death. RED on the pre-fix build: the completion block never
     cleared B.dying, so it re-fired (report + explosion + audio) EVERY TICK until gameover —
     bossDefeatedReports ≈ 10-30 instead of 1. The player's 0.7 s death clock then expires:
     gameover must land ALONE — victory card never shows, victoryEntries stays 0, and the
     combat clock reads FROZEN while dead (t2 === t1 across 0.5 s of 0.3× slow-mo). */
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat&bossProbe=1' });
  let df = null;
  {
    const t0 = Date.now();
    let dyingSeen = 0, hurt = false;
    for (;;) {
      try {
        const csx = await J(`(window.__stage2 && __stage2.combatState) ? __stage2.combatState() : null`);
        if (csx && csx.boss && csx.boss.phase === 'dying' && !dyingSeen) dyingSeen = Date.now();
        if (dyingSeen && !hurt && Date.now() - dyingSeen >= 600) {
          const fired = await evl(`(window.__stage2 && typeof __stage2.probeDamagePlayer === 'function') ? (__stage2.probeDamagePlayer(500), true) : false`);
          if (fired) { hurt = true; continue; }
        }
        if (hurt && csx && csx.dead) {
          const t1 = csx.time;
          await sleep(500); // 0.5 s real inside the 0.3× slow-mo — a live clock accrues ~0.15
          const t2 = await J(`__stage2.combatState().time`);
          df = { t1, t2 };
          break;
        }
      } catch {}
      if (Date.now() - t0 > 45000) break; // deadline — the asserts below record the state
      await sleep(100);
    }
  }
  let g14 = null;
  {
    const t0 = Date.now();
    for (;;) {
      try {
        g14 = await J(`({
          p: (window.__stage2 && __stage2.phase) || 'boot',
          go: !(document.getElementById('gameover') || {hidden: true}).hidden,
          vic: !(document.getElementById('victory') || {hidden: true}).hidden,
          n: (window.__stage2 && __stage2.victoryEntries) || 0,
        })`);
        if (g14.p === 'gameover') break;
      } catch { g14 = null; }
      if (Date.now() - t0 > 30000) break;
      await sleep(200);
    }
  }
  const gx = g14 || {};
  ok('story-014: player death during the death cinematic lands gameover (not victory)', gx.p === 'gameover' && gx.go === true,
    JSON.stringify(gx));
  ok('story-014: no double-fire (victory card hidden, victoryEntries 0)', gx.vic === false && gx.n === 0,
    `vic=${gx.vic} entries=${gx.n}`);
  ok('story-014: combat clock frozen while dead (t2 === t1 over 0.5s slow-mo)',
    !!df && typeof df.t1 === 'number' && df.t1 === df.t2 && df.t1 > 0, JSON.stringify(df || null));
  ok('review: bossDefeated reported exactly once (completion re-fire class)',
    (await evl(`window.__stage2.bossDefeatedReports || 0`)) === 1,
    `reports=${await evl(`window.__stage2.bossDefeatedReports || 0`)}`);
  ok('CONSOLE [] (story-014 edge page)', errs.length === 0, errs.join(' | '));

  /* --- story-020 settings persistence (?debug=1&goto=combat, page over the SAME CDP session) ---
     The build's only user-facing setting is mute (M key in combat / the [ SOUND: ON/OFF ] title
     button — both funnel through audio.js setMuted, the single write choke point). Pre-story the
     flag lived in `let muted = false` with zero persistence: every reload reset it to unmuted.
     The fix: store.js gains the guarded MUTED_KEY pair (readMuted/writeMuted — mechanical mirrors
     of the highscore pair, same story-007 laziness contract, same §8.9 corrupt-reads-as-safe
     rule); setMuted writes through (both toggle paths covered by construction); boot()'s
     post-storage-warm block restores via restoreMuted(readMuted()) — restore READS, never writes
     — then refreshSoundButton(). The probe surface is window.__stage2: the live flag (the
     pre-existing `muted` getter) + the RAW stored value (`mutedRaw()` — through store.js's
     guarded readMutedRaw, so corrupt seeds are visible to the harness without touching
     internals). Reloads here are REAL Page.navigate reloads over the same profile, so
     localStorage genuinely persists — the same mechanism the highscore ledger rides.
     The toggle is driven through the REAL key path: input.js onKeydown's combat-branch KeyM →
     setMuted(!isMuted()) — synthetic KeyboardEvent on window, the same listener a player's M
     press hits. (The M key only reaches setMuted in COMBAT — hence ?goto=combat on every page.)
     RED-FIRST (2026-11-07, unmodified story-019 gate build — product code untouched, only this
     harness differs): 7 of the 18 new asserts FAIL for no-persistence reasons —
     `M-key write-through at the store` + `raw key still '1' after the reload` + `unmute
     write-through at the store` + `raw key '0' after the unmute reload` (mutedRaw absent → raw
     null; nothing ever wrote the key), `mute survives a real reload` (the in-memory flag resets
     to false at eval — the exact bug), `M-key unmute in-session` (m reads TRUE — the reload lost
     the mute, so this page's M press RE-MUTED: the toggle's baseline is itself
     persistence-dependent; on the fixed build the same press unmutes), and `corrupt seed
     survives boot byte-identical` (mutedRaw absent → null ≠ 'garbage' — red by absence, the
     droneProbe pattern). Green-by-design on the old build (keep-passing): the default /
     corrupt / numeric-garbage boot-state reads (old build ignores the key → boots unmuted — the
     safe-by-accident side), the in-session MUTE toggle assert (m:true — the first toggle always
     worked), the laziness marks (story-007's ordering predates this story), and the CONSOLE []
     pages. Pre-existing defect witnessed in the same record (reported, not fixed): the
     M-key path never calls refreshSoundButton — the in-session label reads `[ SOUND: ON ]`
     while muted (input.js's KeyM branch predates this story; the label only refreshes at the
     warm block and on btn-sound clicks). Full output:
     production/qa/evidence/story-020-settings-persistence/flow-red-story020.txt.
     MUTATIONS (branch, post-green, each: mutate → npm run build → FULL flow-check → git restore
     → rebuild; the mutation is VERIFIED applied by reading its red output — a silent no-op
     proves nothing):
       A. audio.js setMuted: the `writeMuted(muted)` write-through line removed (2026-11-07) →
          RED 182/6: `M-key write-through at the store` (raw null — nothing writes), `mute
          survives a real reload` (m:false — the in-memory flag lost at eval, the story's own
          bug re-created), `raw key still '1' after the reload` (null), `M-key unmute
          in-session` (m:true — the reload lost the mute, so the press RE-MUTED: the toggle's
          baseline is persistence-dependent, the same cascade the red-first run recorded),
          `unmute write-through` (raw null), `raw key '0' after the unmute reload` (null). The
          named adjacent keep-passing holds where it is meaningful: the in-session MUTE toggle
          stays GREEN (the toggle itself works — only persistence dies) alongside all 176
          non-story asserts. flow-mutation-a-writethrough-removed.txt.
       B. audio.js readMuted... (store.js readMuted): the `=== '1'` clamp replaced by the
          parsed string's truth — `!!Number(get(MUTED_KEY))`, no finite/0-1 clamp (2026-11-07)
          → RED `numeric garbage '2' boots unmuted` (boots MUTED-from-garbage: Number('2') = 2
          is truthy without the clamp). KNOWN DISCRIMINATION BOUND, recorded: the AC's
          'garbage' seed CANNOT red this mutation — Number('garbage') is NaN, falsy by accident,
          not by guard — so the block seeds '2' (numeric garbage) as the value the unclamped
          parse turns into mute state; the 'garbage' page stays green under B and its assert
          name says why. flow-mutation-b-unclamped-parse.txt.
       C. audio.js module top: `setMuted(readMuted());` — the restore moved to module eval (the
          pre-story naive wiring; readMuted IS called at eval) (2026-11-07) → flow-check RED
          183/5, ALL one root, and the root is worse than the naive wiring looks: the eval-time
          readMuted runs PRE-WARM (storageImpl null — the laziness guard legitimately returns
          false), and setMuted's write-through then PERSISTS that false — every page load
          CLOBBERS the stored value ('1' → '0'; the seeded 'garbage' → '0'). Reds: `mute
          survives a real reload` (m:false — the stored mute was destroyed before the warm read),
          `raw key still '1' after the reload` ('0'), `M-key unmute in-session` (m:true — the
          reload lost the mute, the press re-muted), `unmute write-through` ('1' — then '0' is
          what the NEXT eval clobbers it to), `corrupt seed survives boot byte-identical`
          ('garbage' → '0'). Keep-passing: the in-session MUTE toggle (page 1: m:true, raw '1'
          — the toggle itself works; only persistence dies). AND tools/boot-marks.mjs (cold
          profile): the capability probe fired at module eval — TRUE wait (navigation → title)
          11,420 ms vs the green build's 6,078-6,535 ms band (the story-007 cold stall moved IN
          FRONT of the title mark, inside navT0), and the storage-marks gap collapsed from
          4,238 ms (green: the probe behind title) to 0 ms (the probe already fired at eval —
          the warm getStorage() is a memoized no-op). MODULE → TITLE itself stays in band
          (138 ms — the marks are relative to PERF_T0, captured after the eval stall; TRUE wait
          is the witness). The marks-ORDERING assert stays green under C (main.js's warm marks
          are unconditional — the ordering cannot see an eval-time probe). 
          flow-mutation-c-eval-restore.txt + boot-marks-mutation-c.txt.
       D. main.js warm block: `restoreMuted(readMuted())` → `setMuted(readMuted())` (2026-11-07)
          → RED `corrupt seed survives boot byte-identical` ALONE (187/1): the warm
          setMuted(false) writes '0' over the seeded 'garbage' — boot rewrote what it just read.
          Persistence itself stays green (setMuted writes the same canonical values — the
          corrupt-read assert reads '0' → unmuted ✓). Only meaningful against a seeded
          non-default corrupt value: with '1' stored, setMuted(true) would rewrite '1'
          byte-identically and the assert could never red. (Mutation-craft note, recorded
          honestly: the first D application appended the comment INSIDE the setTimeout line and
          the `//` swallowed the `}, 0);` line-ender — build failed, caught by reading the build
          output before any run; re-applied with the line-ender intact.)
          flow-mutation-d-setmuted-restore.txt. */
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat' });
  {
    const t0 = Date.now();
    for (;;) {
      try { if (await J(`(window.__stage2 && __stage2.phase) || 'boot'`) === 'combat') break; } catch {}
      if (Date.now() - t0 > 60000) break;
      await sleep(300);
    }
  }
  // laziness re-run per build (story-007 contract, existing marks, no new tolerance): the warm
  // block fires storeStart/storeEnd in a setTimeout(0) scheduled AFTER mark('title') — the
  // marks must read behind the title mark on every build. A pre-title storeStart is the
  // eval-time-probe class (mutation C's boot-marks half is its timing witness; the ordering
  // here cannot see an eval probe — recorded in the mutation note above).
  let bm20 = null;
  {
    const t0 = Date.now();
    for (;;) {
      try { bm20 = await J(`({ t: (window.__BOOT && __BOOT.title) ?? null, s: (window.__BOOT && __BOOT.storeStart) ?? null, e: (window.__BOOT && __BOOT.storeEnd) ?? null })`); } catch { bm20 = null; }
      if (bm20 && bm20.t != null && bm20.s != null && bm20.e != null) break;
      if (Date.now() - t0 > 30000) break;
      await sleep(200);
    }
  }
  ok('story-020: warm-block marks fire after the title mark (placement pin — cannot see an eval-time probe; that class rides boot-marks + the C cascade)',
    !!bm20 && bm20.t != null && bm20.s != null && bm20.e != null && bm20.s >= bm20.t && bm20.e >= bm20.s, JSON.stringify(bm20));
  // one reader for the whole block: live flag (pre-existing __stage2.muted getter), the sound
  // button label (warm-restore refresh writes it before combat lands), the RAW stored value.
  const muteState20 = () => J(`({ m: (window.__stage2 && __stage2.muted) ?? null,
    label: (document.getElementById('btn-sound') || {}).textContent || null,
    raw: (window.__stage2 && __stage2.mutedRaw) ? __stage2.mutedRaw() : null })`);
  const d20a = await muteState20();
  ok('story-020: boots unmuted by default (muted false, [ SOUND: ON ])', d20a.m === false && d20a.label === '[ SOUND: ON ]', JSON.stringify(d20a));
  await key('KeyM', 'keydown');
  await key('KeyM', 'keyup');
  await sleep(150);
  const d20b = await muteState20();
  ok('story-020: M-key toggle mutes in-session (muted true)', d20b.m === true, JSON.stringify(d20b));
  ok("story-020: M-key write-through at the store (raw stage2.muted = '1')", d20b.raw === '1', `raw=${JSON.stringify(d20b.raw)}`);
  // RIDER B (2026-11-07): the E.lastRoll merge-halt diagnostic is GATED behind ?balanceProbe=1
  // (stage-4 GATE DECISION 3 + stage-4 PROGRESS finding 6 — pre-riders the per-spawn record
  // allocated unconditionally in production). This page runs WITHOUT balanceProbe and REAL
  // combat spawns have happened (wave 1's seed spawn fires at combat entry), so the harness
  // surface must read null here — while the flag-on balance page (earlier in this same run)
  // must still show all 50 recorded draws (the gate must never dim the on-path; the existing
  // mechanism-gate assert mismatches===0 pins it too). RED-FIRST (2026-11-07, rider A build @
  // 5425135 — product code byte-identical to master): RED — the record populated
  // unconditionally on every spawn and the __stage2.lastRoll surface was absent (undefined ≠
  // null). Transcript: production/qa/evidence/stage-5-riders/flow-red-riderB.txt. MUTATION
  // (2026-11-07): the gate removed in enemies.js (the record back to unconditional) → build →
  // FULL flow-check → RED again (the flag-off page reads a populated record). Transcript:
  // production/qa/evidence/stage-5-riders/flow-mutation-lastroll-gate-removed.txt.
  const flagOffLastRoll = await evl(`window.__stage2 ? (window.__stage2.lastRoll === undefined ? 'absent' : window.__stage2.lastRoll) : 'no __stage2'`);
  ok('rider B: E.lastRoll diagnostic gated — flag-off real-spawn page reads null AND the flag-on balance drive still recorded all 50 draws',
    flagOffLastRoll === null && !!rt.draws && rt.draws.length === 50 && rt.draws.every((d) => d != null),
    JSON.stringify({ flagOffLastRoll, flagOnDraws: rt.draws ? rt.draws.length : null }));
  // RIDER D (2026-11-07): the M-key path refreshes the button label IN-SESSION. The defect is
  // PRE-EXISTING (story-020 spec-review ruling, 2026-11-07: input.js's combat-branch KeyM line
  // never called refreshSoundButton — only main.js's btn-sound click path and the boot warm
  // block did; ruled out of story-020's locked scope, rider-sized), already WITNESSED in
  // story-020's own green transcript (production/qa/evidence/story-020-settings-persistence/
  // flow-green-final.txt L173: in-session `m:true, label "[ SOUND: ON ]"`). RED-FIRST
  // (2026-11-07, rider C build @ 3046252 — input.js byte-identical to master): RED — the
  // label stayed "[ SOUND: ON ]" while muted. Transcript:
  // production/qa/evidence/stage-5-riders/flow-red-riderD.txt. MUTATION (2026-11-07): the
  // refreshSoundButton() call removed from input.js's KeyM branch → build → FULL flow-check →
  // RED again. Transcript: production/qa/evidence/stage-5-riders/flow-mutation-mkey-refresh-removed.txt.
  ok('rider D: M press flips the label IN-SESSION (no reload — the KeyM path refreshes the button)',
    d20b.m === true && d20b.label === '[ SOUND: OFF ]', JSON.stringify(d20b));
  ok('CONSOLE [] (story-020 toggle page)', errs.length === 0, errs.join(' | '));
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat' });
  {
    const t0 = Date.now();
    for (;;) {
      try { if (await J(`(window.__stage2 && __stage2.phase) || 'boot'`) === 'combat') break; } catch {}
      if (Date.now() - t0 > 60000) break;
      await sleep(300);
    }
  }
  const d20c = await muteState20();
  ok('story-020: mute survives a real reload (boots muted, [ SOUND: OFF ])', d20c.m === true && d20c.label === '[ SOUND: OFF ]', JSON.stringify(d20c));
  ok("story-020: raw key still '1' after the reload (persisted, not session-only)", d20c.raw === '1', `raw=${JSON.stringify(d20c.raw)}`);
  await key('KeyM', 'keydown');
  await key('KeyM', 'keyup');
  await sleep(150);
  const d20d = await muteState20();
  ok('story-020: M-key unmute in-session (muted false)', d20d.m === false, JSON.stringify(d20d));
  ok("story-020: unmute write-through at the store (raw stage2.muted = '0')", d20d.raw === '0', `raw=${JSON.stringify(d20d.raw)}`);
  ok('CONSOLE [] (story-020 muted-reload page)', errs.length === 0, errs.join(' | '));
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat' });
  {
    const t0 = Date.now();
    for (;;) {
      try { if (await J(`(window.__stage2 && __stage2.phase) || 'boot'`) === 'combat') break; } catch {}
      if (Date.now() - t0 > 60000) break;
      await sleep(300);
    }
  }
  const d20e = await muteState20();
  ok('story-020: unmute survives a real reload (boots unmuted — persistence asserted BOTH ways)', d20e.m === false && d20e.label === '[ SOUND: ON ]', JSON.stringify(d20e));
  ok("story-020: raw key '0' after the unmute reload", d20e.raw === '0', `raw=${JSON.stringify(d20e.raw)}`);
  ok('CONSOLE [] (story-020 unmuted-reload page)', errs.length === 0, errs.join(' | '));
  // corrupt-read safety (§8.9 proven, not assumed): the HARNESS seeds the raw key directly —
  // the game itself has zero storage access outside store.js. The seed is a non-default,
  // non-canonical value, which is also what makes the byte-identical assert below
  // mutation-discriminable (a setMuted-based restore would rewrite it; see mutation D).
  await evl(`localStorage.setItem('stage2.muted', 'garbage')`);
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat' });
  {
    const t0 = Date.now();
    for (;;) {
      try { if (await J(`(window.__stage2 && __stage2.phase) || 'boot'`) === 'combat') break; } catch {}
      if (Date.now() - t0 > 60000) break;
      await sleep(300);
    }
  }
  const d20f = await muteState20();
  ok("story-020: corrupt value 'garbage' boots unmuted, no crash (§8.9 never truthy)", d20f.m === false && d20f.label === '[ SOUND: ON ]', JSON.stringify(d20f));
  ok("story-020: corrupt seed survives boot byte-identical (restore reads, never rewrites)", d20f.raw === 'garbage', `raw=${JSON.stringify(d20f.raw)}`);
  ok('CONSOLE [] (story-020 corrupt page)', errs.length === 0, errs.join(' | '));
  // numeric garbage: the value class the unclamped-parse mutation (B) turns into mute state —
  // Number('garbage') is NaN (falsy by accident), Number('2') is 2 (truthy without the clamp).
  await evl(`localStorage.setItem('stage2.muted', '2')`);
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat' });
  {
    const t0 = Date.now();
    for (;;) {
      try { if (await J(`(window.__stage2 && __stage2.phase) || 'boot'`) === 'combat') break; } catch {}
      if (Date.now() - t0 > 60000) break;
      await sleep(300);
    }
  }
  const d20g = await muteState20();
  ok("story-020: numeric garbage '2' boots unmuted (the 0-1 clamp — mutation B's discriminator)", d20g.m === false, JSON.stringify(d20g));

  /* --- stage-6 A1 (?audioProbe=1, then ?sfxFault=1): samples + buses + sequencer probe pages ---
     RED-FIRST 2026-11-08 (branch polish/stage6-experience, product untouched — only this harness
     differs): on the pre-A1 build the probe surface is absent and no sample is wired — every new
     assert records RED for absence (the sanctioned red class). Transcript:
     production/qa/evidence/stage6-a1/flow-red-a1.txt.
     audioProbe asserts (audio-audit.md §4 verification contract): every wired sample reads
     status 'decoded' with byte evidence (> 4096 per file, > 65536 total); a scripted 30-voice
     burst holds the voice cap (recorded peak = 24); the probe voice chain carries a
     StereoPannerNode; the same cue at far range records LESS gain than near; muting gates new
     voices; the sequencer note counter advances monotonically, stalls while muted, resumes in
     phase after unmute. sfxFault: every forced decode failure lands on the synth fallback PER
     CUE with ZERO console noise, and the phase still lands (boot → title → combat). */
  const a1Unlock = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
  };
  const a1WaitDone = async () => {
    const t1 = Date.now();
    let r = null;
    for (;;) {
      try {
        r = await J(`(window.__stage2 && __stage2.audioProbe) || null`);
        if (r && r.done) break;
      } catch { r = null; }
      if (Date.now() - t1 > 45000) break;
      await sleep(300);
    }
    return r;
  };
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat&audioProbe=1' });
  {
    const t0 = Date.now();
    for (;;) {
      try { if (await J(`(window.__stage2 && __stage2.phase) || 'boot'`) === 'combat') break; } catch {}
      if (Date.now() - t0 > 60000) break;
      await sleep(300);
    }
    await a1Unlock();
  }
  const apx = (await a1WaitDone()) || {};
  ok('A1 probe: drive completed (probe surface present, honest mode, no drive error)',
    apx.done === true && apx.err == null && apx.mode === 'audioProbe', JSON.stringify(apx).slice(0, 400));
  const apSamples = apx.samples || {};
  const smpNames = Object.keys(apSamples);
  ok('A1 probe: every wired sample decoded with byte evidence (> 4096 per file, > 65536 total)',
    smpNames.length === 6 && smpNames.every((n) => apSamples[n].status === 'decoded' &&
      apSamples[n].files.length > 0 && apSamples[n].files.every((f) => f.bytes > 4096)) &&
      smpNames.reduce((a, n) => a + apSamples[n].files.reduce((x, f) => x + f.bytes, 0), 0) > 65536,
    JSON.stringify(apSamples));
  ok('A1 probe: voice cap holds under a 30-voice burst (recorded peak = cap 24)',
    apx.cap === 24 && apx.capPeak === 24, JSON.stringify({ cap: apx.cap, capPeak: apx.capPeak }));
  ok('A1 probe: the probe voice chain carries a StereoPannerNode (gain → panner → bus)',
    Array.isArray(apx.chain) && apx.chain.some((t) => /stereopanner/i.test(t)), JSON.stringify(apx.chain || null));
  ok('A1 probe: distance attenuation (same cue far records LESS gain than near; near is full level)',
    !!apx.near && !!apx.far && apx.near.atten >= 0.99 && apx.far.atten < apx.near.atten,
    JSON.stringify({ near: apx.near, far: apx.far }));
  ok('A1 probe: mute gates new voices (voice count unchanged while muted)',
    !!apx.mute && apx.mute.unchanged === true, JSON.stringify(apx.mute || null));
  ok('A1 probe: sequencer note counter advances monotonically (reads ≥ 1 s apart, strictly greater)',
    !!apx.seq && apx.seq.b > apx.seq.a, JSON.stringify(apx.seq || null));
  ok('A1 probe: sequencer stalls while muted and resumes in phase after unmute',
    !!apx.seq && apx.seq.mutedB === apx.seq.b && apx.seq.resumed > apx.seq.mutedB, JSON.stringify(apx.seq || null));
  ok('CONSOLE [] (audioProbe page)', errs.length === 0, errs.join(' | '));

  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat&sfxFault=1' });
  {
    const t0 = Date.now();
    for (;;) {
      try { if (await J(`(window.__stage2 && __stage2.phase) || 'boot'`) === 'combat') break; } catch {}
      if (Date.now() - t0 > 60000) break;
      await sleep(300);
    }
    await a1Unlock();
  }
  const sfx = (await a1WaitDone()) || {};
  ok('A1 fault: drive completed on the fault page (honest mode, no drive error)',
    sfx.done === true && sfx.err == null && sfx.mode === 'sfxFault', JSON.stringify(sfx).slice(0, 300));
  const sfSamples = sfx.samples || {};
  ok('A1 fault: synth fallback fired PER CUE (every wired sample reads fallback, none decoded)',
    Object.keys(sfSamples).length === 6 && Object.keys(sfSamples).every((n) => sfSamples[n].status === 'fallback'),
    JSON.stringify(sfSamples));
  ok('A1 fault: the phase still lands (combat entered under the forced decode failures)',
    (await evl(`(window.__stage2 && __stage2.phase) || 'boot'`)) === 'combat');
  ok('CONSOLE [] (sfxFault page)', errs.length === 0, errs.join(' | '));

  /* --- T1 RECORD-0 suppression (observer page; one-time Page.addScriptToEvaluateOnNewDocument
     capability, registered here for THIS page only — the harness's page setup grows once,
     contained). A nonzero record is seeded RAW, the page is navigated, and an init-script
     observer records EVERY #t-rec/#hs-line paint from first parse to the read. visual-audit
     F2-6: the story-007 lazy store returns 0 pre-warm by design ("title renders 0, warm-up
     re-renders the real value"), so the title's first paint shows a false RECORD 0 on any
     warm profile. The fix holds a placeholder until the warm callback — the KEEP-PASSING
     contract ("F2-6 changes the initial paint, not this contract") is that the warm callback
     still re-renders the real value, asserted here explicitly.
     RED-FIRST 2026-11-08 (branch polish/stage6-experience, product untouched): on the pre-T1
     build title.enter's refreshRecordLine paints 'RECORD 0' with the store still cold — the
     observer sees it and the never-0 assert records RED; the warm re-render assert is GREEN
     on the old build BY DESIGN (keep-passing). Transcript:
     production/qa/evidence/stage6-t1/flow-red-t1.txt. */
  await evl(`localStorage.setItem('stage2.highscore', '4242')`); // raw seed — a nonzero record must never be painted over by a 0
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__t1rec = { rec: [], hs: [], err: null };
    try {
      const push = (arr, v) => { if (arr[arr.length - 1] !== v) arr.push(v); };
      const snap = () => {
        const r = document.getElementById('t-rec'), h = document.getElementById('hs-line');
        if (r) push(window.__t1rec.rec, r.textContent);
        if (h) push(window.__t1rec.hs, h.textContent);
      };
      new MutationObserver(snap).observe(document, { subtree: true, childList: true, characterData: true });
    } catch (e) { window.__t1rec.err = String((e && e.message) || e); }
  ` });
  await send('Page.navigate', { url: 'file:///E:/Game%20Build/index.html?debug=1&goto=combat' });
  {
    const t0 = Date.now();
    for (;;) {
      try { if (await J(`(window.__stage2 && __stage2.phase) || 'boot'`) === 'combat') break; } catch {}
      if (Date.now() - t0 > 60000) break;
      await sleep(300);
    }
  }
  let recT1 = null;
  {
    const t0 = Date.now();
    for (;;) {
      try { recT1 = await J(`window.__t1rec || null`); } catch { recT1 = null; }
      if (recT1 && recT1.err == null && recT1.rec.length >= 2) break; // placeholder paint + warm re-render must both have fired
      if (Date.now() - t0 > 30000) break;
      await sleep(200);
    }
  }
  const recX = recT1 || { rec: [], hs: [], err: 'observer absent' };
  ok('T1 record: observer captured every paint; pre-warm paint is the placeholder — RECORD 0 never paints over a nonzero record',
    recX.err == null && recX.rec.length >= 2 && recX.rec[0] === 'RECORD —' && recX.rec.every((v) => v !== 'RECORD 0') &&
    recX.hs.length >= 2 && recX.hs[0] === 'HIGH SCORE —' && recX.hs.every((v) => v !== 'HIGH SCORE — 0'),
    JSON.stringify(recX));
  ok('T1 record: warm callback re-renders the real seeded value (KEEP-PASSING contract intact)',
    recX.rec.includes('RECORD 4242') && recX.hs.includes('HIGH SCORE — 4242'), JSON.stringify(recX));

  ok('CONSOLE []', errs.length === 0, errs.join(' | '));
} catch (e) {
  console.error('FAIL ' + e.message);
  process.exitCode = 1;
} finally {
  cleanup();
  rmProfile(PROFILE); // throwaway profile never lingers
}

console.log(`\nFLOW-CHECK ${FAIL.length === 0 ? 'PASS' : 'FAIL'} — ${PASS.length} passed, ${FAIL.length} failed`);
if (FAIL.length) process.exitCode = 1;
