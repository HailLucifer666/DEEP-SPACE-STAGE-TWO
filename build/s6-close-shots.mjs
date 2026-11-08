// STAGE TWO — stage-6 close evidence: headed-surface screenshots via CDP (victory-shot.mjs
// precedent). Drives the built game through title / combat HUD / lock+pipper / boss bar /
// pause card / victory card and captures each new Stage-6 surface.
// Usage: EDGE=<msedge.exe> node build/s6-close-shots.mjs
//   → writes production/qa/evidence/stage6-close/s6-*.png
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\EdgeCore\\157.0.4341.42\\msedge.exe';
const PORT = 9941;
const PROFILE = `E:\\Game Build\\build\\.edge-profile-s6close-${Date.now()}`;
const BASE = 'file:///E:/Game%20Build/index.html';
const OUT = 'E:\\Game Build\\production\\qa\\evidence\\stage6-close';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-sync',
  `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, `${BASE}?debug=1`,
], { stdio: 'ignore' });
const cleanup = () => {
  try { ws?.close(); } catch {}
  try { spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
};

let ws = null;
const notes = [];
try {
  let targets = [];
  for (let i = 0; i < 240; i++) {
    try { targets = await (await fetch(`http://[::1]:${PORT}/json/list`)).json(); if (targets.length) break; } catch {}
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch {}
    await sleep(250);
  }
  const page = targets.find((t) => t.type === 'page' && t.url.startsWith(BASE));
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
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${OUT}\\${name}`, Buffer.from(s.data, 'base64'));
    console.log(`captured → ${name}`);
  };
  const goto = async (urlSuffix) => {
    await send('Page.navigate', { url: `${BASE}${urlSuffix}` });
    await sleep(1200);
  };
  const waitPhase = async (phase, timeout = 30000) => {
    const t0 = Date.now();
    for (;;) {
      const ph = await evl(`window.__stage2 ? __stage2.phase : 'boot'`);
      if (ph === phase) return true;
      if (Date.now() - t0 > timeout) return false;
      await sleep(200);
    }
  };
  const key = async (code, vk) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.replace(/^Key/, '').toLowerCase(), windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code.replace(/^Key/, '').toLowerCase(), windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  };
  const mouseTo = async (fx, fy) => {
    const dim = await evl(`JSON.stringify({w: innerWidth, h: innerHeight})`);
    const { w, h } = JSON.parse(dim);
    const x = Math.round(w * fx), y = Math.round(h * fy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    return { x, y };
  };
  const fireTap = async (fx, fy) => {
    const dim = await evl(`JSON.stringify({w: innerWidth, h: innerHeight})`);
    const { w, h } = JSON.parse(dim);
    const x = Math.round(w * fx), y = Math.round(h * fy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(120);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };

  // ── 1 · TITLE: new chrome (chip reword, two-column hints, styled cards behind) ──
  await goto('?debug=1');
  if (await waitPhase('title')) {
    await sleep(800);
    const t = await evl(`JSON.stringify({
      favicon: !!document.querySelector('link[rel="icon"]'),
      chip: (document.querySelector('.topbar, header, #topbar') || document.body).innerText.match(/PROTOCOL[^\\n]*/)?.[0] || 'n/a',
      hintCols: getComputedStyle(document.querySelector('.hints') || document.body).gridTemplateColumns || 'none',
      rec: document.getElementById('t-rec')?.textContent,
    })`);
    notes.push(`title: ${t}`);
    await shot('s6-title.png');
  } else { notes.push('title: PHASE TIMEOUT'); }

  // ── 2 · COMBAT HUD + LOCK + PIPPER (droneProbe: targets present; lock defaults ON) ──
  await goto('?debug=1&goto=combat&droneProbe=1');
  if (await waitPhase('combat')) {
    await sleep(2500); // drones settle, lock scan gets frames
    await mouseTo(0.62, 0.40); // offset the pointer so reticle ≠ center → pipper divergence shows
    await fireTap(0.62, 0.40);
    await sleep(400);
    const c = await evl(`JSON.stringify({
      lock: __stage2.lock !== undefined ? __stage2.lock : 'n/a',
      lockTarget: __stage2.lockTarget !== undefined ? __stage2.lockTarget : 'n/a',
      pipper: __stage2.pipperState ? __stage2.pipperState() : (__stage2.combatState ? __stage2.combatState().pipper : 'n/a'),
      bossBarHidden: document.getElementById('boss-bar')?.hidden,
      meters: (document.getElementById('hud-bars')?.textContent || '').slice(0, 60),
      banner: document.getElementById('wave-banner')?.textContent,
    })`);
    notes.push(`combat: ${c}`);
    await shot('s6-combat-hud-lock-pipper.png');
    // ── 2b · PAUSE CARD (RESUME/SOUND pills; class proves the cursor restore) ──
    await key('KeyP', 80);
    await sleep(700);
    const p = await evl(`JSON.stringify({
      pausedClass: document.body.classList.contains('paused'),
      playingClass: document.body.classList.contains('playing'),
      cursor: getComputedStyle(document.body).cursor,
      pauseText: (document.getElementById('pause')?.textContent || '').replace(/\\s+/g, ' ').slice(0, 80),
    })`);
    notes.push(`pause: ${p}`);
    await shot('s6-pause-card.png');
    await key('KeyP', 80); // resume
    await sleep(400);
  } else { notes.push('combat: PHASE TIMEOUT'); }

  // ── 3 · BOSS BAR + VICTORY CARD (bossProbe drive: bar while alive, card on defeat) ──
  await goto('?debug=1&goto=combat&bossProbe=1');
  if (await waitPhase('combat')) {
    // capture the bar as early as the boss exists
    let barSeen = null;
    for (let i = 0; i < 120; i++) {
      barSeen = await evl(`JSON.stringify({
        bossBarHidden: document.getElementById('boss-bar')?.hidden,
        barText: (document.getElementById('boss-bar')?.textContent || '').replace(/\\s+/g, ' ').slice(0, 40),
        boss: __stage2.combatState ? (__stage2.combatState().boss ? 'alive' : 'none') : 'n/a',
      })`);
      const bj = JSON.parse(barSeen);
      if (bj.boss === 'alive' && bj.bossBarHidden === false) break;
      await sleep(250);
    }
    notes.push(`boss bar: ${barSeen}`);
    await shot('s6-boss-bar.png');
    // ride the drive to the victory card (victory-shot.mjs pattern)
    if (await waitPhase('victory', 90000)) {
      await sleep(800);
      notes.push('victory: card landed');
      await shot('s6-victory-card.png');
    } else notes.push('victory: did not land in 90 s (drive-dependent) — card asserts already machine-proven');
  } else { notes.push('boss page: PHASE TIMEOUT'); }

  console.log('--- NOTES ---');
  for (const n of notes) console.log(n);
  console.log('S6-CLOSE-SHOTS DONE');
} catch (e) {
  console.error('FAIL ' + e.message);
  process.exitCode = 1;
} finally {
  cleanup();
}
