// story-012 both-paths prover — the committed evidence tool for the BUILD-TIME drone swap.
// A file:// page cannot probe sibling files at runtime, so the swap is a build decision; this
// script proves BOTH decisions out of the same probe surface (?droneProbe=1):
//   pass A 'glb'  — synthesizes a minimal VALID GLB (hand-built glTF 2.0 JSON + BIN chunk, one
//                   triangulated tetra — no new npm deps), stages build/drone.glb, rebuilds,
//                   probes: droneBuild must read 'glb' and meshParts must differ from proc.
//   pass B 'proc' — removes the GLB, rebuilds (the SHIPPED state), probes: droneBuild 'proc',
//                   and captures the retained screenshot of the procedural drone.
// Usage: node tools/drone-glb-probe.mjs   (sequential passes, one headless Edge at a time;
//         each pass gets its own throwaway profile — killed with taskkill /F /T in cleanup)
import { spawn, spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const GLB = path.join(ROOT, 'build', 'drone.glb');
const SHOT = path.join(ROOT, 'production', 'qa', 'evidence', 'story-012-drone', 's12-drone.png');
import { resolveEdge, rmProfile } from './edge-bin.mjs';
const EDGE = resolveEdge();
const PORT = 9947; // fixed per pass; passes run strictly sequentially
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- minimal valid GLB synthesis (glTF 2.0 spec: magic/version/length + JSON + BIN) ---------- */
function synthesizeTetraGlb() {
  // tetrahedron: 4 verts, 4 faces — indexed, with POSITION min/max (required by the spec)
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const indices = new Uint16Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
  const idxBytes = Buffer.from(indices.buffer);
  const posBytes = Buffer.from(positions.buffer);
  const binLength = idxBytes.length + posBytes.length; // 24 + 48 = 72, both offsets 4-byte aligned

  const gltf = {
    asset: { version: '2.0', generator: 'drone-glb-probe (throwaway swap-path evidence)' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'vi3w-drone-throwaway' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 1 }, indices: 0, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.3, 0.8, 1.0, 1], metallicFactor: 0.2, roughnessFactor: 0.5 } }],
    accessors: [
      { bufferView: 0, componentType: 5123, count: indices.length, type: 'SCALAR' }, // UNSIGNED_SHORT
      { bufferView: 1, componentType: 5126, count: positions.length / 3, type: 'VEC3', // FLOAT
        min: [0, 0, 0], max: [1, 1, 1] },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: idxBytes.length, target: 34963 }, // ELEMENT_ARRAY_BUFFER
      { buffer: 0, byteOffset: idxBytes.length, byteLength: posBytes.length, target: 34962 }, // ARRAY_BUFFER
    ],
    buffers: [{ byteLength: binLength }],
  };

  let jsonChunk = Buffer.from(JSON.stringify(gltf), 'utf8');
  if (jsonChunk.length % 4) jsonChunk = Buffer.concat([jsonChunk, Buffer.alloc(4 - (jsonChunk.length % 4), 0x20)]); // pad spaces
  let binChunk = Buffer.concat([idxBytes, posBytes]);
  if (binChunk.length % 4) binChunk = Buffer.concat([binChunk, Buffer.alloc(4 - (binChunk.length % 4), 0x00)]); // pad zeros
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);          // version
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8); // total length
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'
  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
}

/* ---------- one probe pass over CDP ---------- */
async function probePass(wantBuild) {
  const profile = path.join(ROOT, 'build', `.edge-probe-drone-${Date.now()}`);
  const url = 'file:///E:/Game%20Build/index.html?debug=1&goto=combat&droneProbe=1';
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-sync',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, url,
  ], { stdio: 'ignore' });
  const cleanup = () => { try { ws?.close(); } catch {} try { spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch {} rmProfile(profile);;
  let ws = null;

  try {
    let targets = [];
    for (let i = 0; i < 240; i++) { // headless Edge binds the debug port on [::1] first (story-011 lesson)
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
    const errs = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      if (m.method === 'Runtime.exceptionThrown') errs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    });
    await send('Runtime.enable'); await send('Page.enable');
    const evl = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (r.exceptionDetails) throw new Error('eval threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result?.value;
    };

    // wait for the probe report — guarded read: the fresh document has no __stage2 for its
    // first seconds and the old context dies across navigations (flow-check red-run lesson)
    let probe = null;
    const t0 = Date.now();
    for (;;) {
      try { probe = await evl(`(window.__stage2 && window.__stage2.droneProbe) || null`); } catch { probe = null; }
      if (probe) break;
      if (Date.now() - t0 > 120000) throw new Error('deadline: window.__stage2.droneProbe never reported');
      await sleep(300);
    }
    const live = await evl(`window.__DRONE_B64 ? 'glb' : 'proc'`).catch(() => null);

    // screenshot pass (proc): the window is closed by the time the report lands, so shoot the
    // NEXT run's telegraph instead — reload and capture while droneProbeLive is open
    if (wantBuild === 'proc' && process.env.DRONE_SHOT !== '0') {
      await send('Page.navigate', { url });
      const t1 = Date.now();
      let liveFlag = false;
      for (;;) {
        try { liveFlag = await evl(`(window.__stage2 && window.__stage2.droneProbeLive) === true`); } catch { liveFlag = false; }
        if (liveFlag || Date.now() - t1 > 120000) break;
        await sleep(250);
      }
      if (liveFlag) {
        await sleep(1200); // mid-orbit → telegraph flare, drone ~12 u ahead in the chase-cam frame
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.mkdirSync(path.dirname(SHOT), { recursive: true });
        fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
        console.log(`SHOT ${SHOT} (${fs.statSync(SHOT).size} bytes)`);
      } else console.log('SHOT skipped — droneProbeLive never opened');
    }

    const verdict = {
      pass: wantBuild,
      droneBuild: probe.droneBuild,
      tokenBuild: live,
      yRange: probe.yRange,
      path3d: probe.path3d,
      telegraph: probe.telegraph,
      dive: probe.dive,
      contact: probe.contact,
      meshParts: probe.meshParts,
      waveRule: probe.waveRule,
      raiderRule: probe.raiderRule,
      consoleErrors: errs,
      ok: probe.droneBuild === wantBuild && probe.yRange > 1 && probe.telegraph === true && probe.dive === true && errs.length === 0,
    };
    console.log('RESULT ' + JSON.stringify(verdict));
    return verdict;
  } finally {
    cleanup();
  }
}

/* ---------- orchestrate: glb pass → restore → proc pass (shipped state) ---------- */
const build = () => execSync('node tools/build.mjs', { cwd: ROOT, stdio: 'pipe' }).toString().split('\n').filter((l) => l.includes('[build]')).join('\n');
let staged = false;
const results = [];
try {
  fs.writeFileSync(GLB, synthesizeTetraGlb());
  staged = true;
  console.log(`[drone-glb-probe] staged throwaway GLB at build/drone.glb (${fs.statSync(GLB).size} bytes)`);
  console.log(build());
  results.push(await probePass('glb'));
} finally {
  // the shipped state is the DEFAULT build — the GLB is removed and index.html restored no
  // matter how pass A ended (crash, deadline, assert failure)
  if (fs.existsSync(GLB)) { fs.rmSync(GLB, { force: true }); console.log('[drone-glb-probe] build/drone.glb removed — shipped state restored'); }
  if (staged) console.log(build());
}
results.push(await probePass('proc'));

const allOk = results.length === 2 && results.every((r) => r.ok) && results[0].droneBuild === 'glb' && results[1].droneBuild === 'proc' && results[0].meshParts !== results[1].meshParts;
console.log(`DRONE-GLB-PROBE ${allOk ? 'PASS' : 'FAIL'} — both paths ${allOk ? 'proven' : 'NOT proven'} (glb: ${results[0]?.droneBuild}/${results[0]?.meshParts} parts, proc: ${results[1]?.droneBuild}/${results[1]?.meshParts} parts)`);
if (!allOk) process.exitCode = 1;
