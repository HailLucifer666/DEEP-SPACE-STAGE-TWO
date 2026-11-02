// STAGE TWO — TRANSITION: ascent exit → combat (4 beats + any-key skip).
// Beats: B1 ring punch (shockwave torus + white flash + plume cut/vacuum + blue re-light),
// B2 HUD lock-in assembly (reticle + telemetry stagger in), B3 warp tunnel (tube + streak
// particles), B4 slow-burn "COMBAT ONLINE". Any key skips to clean COMBAT landing at any beat
// (state-guarded; double-skip no-op). clear() teardown (§8.6): dispose beat objects, cancel
// overlay classes, stop audio — a phase exit leaves nothing running behind it.
import { THREE } from 'stage-two-lib';
import { beep, sweep, vacuumDrop, loopsStopAll } from './audio.js';
import { plumeSet } from './launch.js';

const BEAT_B1 = 0.05, BEAT_B2 = 2.6, BEAT_B3 = 5.4, BEAT_B4 = 8.9;
const END = 11.4;
const HOLD_BEAT = { 1: 1.25, 2: 3.4, 3: 6.4, 4: 9.7 }; // probe-freeze frames (mirrors ?holdCount)
const HOLD_BEAT_Q = Number(new URLSearchParams(location.search).get('holdBeat')) || 0;
const SKIP_PROBE = Number(new URLSearchParams(location.search).get('skipProbe')) || 0;

const T = {
  ready: false, scene: null, camera: null, rocket: null, ui: null, go: null, report: null,
  phaseT: 0, skipped: false, fired: new Set(), beat: '',
  ring: null, ringMat: null, tunnel: null, tunnelMat: null, tunnelRim: null, tunnelDir: null,
  streaksPos: null,
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const el = (id) => document.getElementById(id);

function fire(t, fn) { if (!T.fired.has(t)) { T.fired.add(t); fn(); } }

/* ---------- B1: flash overlay ---------- */
function flash(on) {
  const f = el('flash');
  if (!f) return;
  if (on) { f.hidden = false; void f.offsetWidth; f.classList.add('on'); }
  else f.classList.remove('on');
}

/* ---------- B2: HUD assembly ---------- */
export function hudAssemble(on) {
  const hud = (T.ui && T.ui.hud) || el('hud');
  const ret = el('reticle');
  if (on) {
    hud && hud.classList.add('assemble');
    if (ret) { ret.hidden = false; void ret.offsetWidth; }
  } else {
    hud && hud.classList.remove('assemble');
    if (ret) ret.hidden = true;
  }
}

/* ---------- B3: warp tunnel ---------- */
const tunnelTex = () => {
  const t = canvasTex(256, 256, (g) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, 'rgba(140,215,255,0)');
    gr.addColorStop(0.35, 'rgba(150,220,255,0.05)');
    gr.addColorStop(0.72, 'rgba(170,230,255,0.5)');
    gr.addColorStop(1, 'rgba(195,242,255,0.9)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(214,246,255,0.5)'; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2;
      g.beginPath(); g.moveTo(128, 128);
      g.lineTo(128 + Math.cos(a) * 126, 128 + Math.sin(a) * 126); g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

function makeStreaks() {
  const N = 160, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 16;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 16;
    pos[i * 3 + 2] = -60 + Math.random() * 130; // along tunnel axis (local Z)
  }
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x9fdcff, size: 0.22, sizeAttenuation: false, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  T.streaksPos = geo.attributes.position;
  return pts;
}

function spawnTunnel() {
  const dir = new THREE.Vector3();
  T.camera.getWorldDirection(dir);
  const g = new THREE.Group();
  g.position.copy(T.camera.position);
  g.lookAt(T.camera.position.clone().add(dir));
  const mat = new THREE.MeshBasicMaterial({
    map: tunnelTex(), side: THREE.BackSide, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 150, 32, 1, true), mat);
  cyl.rotation.x = Math.PI / 2; // cylinder axis → local Z
  const rimMat = new THREE.MeshBasicMaterial({
    color: 0x8fd8ff, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(7, 0.35, 8, 48), rimMat);
  rim.position.z = -70; // leading rim — the "mouth" rushing past
  g.add(cyl, rim, makeStreaks());
  T.scene.add(g);
  T.tunnel = g; T.tunnelMat = mat; T.tunnelRim = rim; T.tunnelDir = dir;
}

function tickTunnel(dt) {
  const p = T.phaseT;
  const fi = clamp((p - BEAT_B3) / 0.6, 0, 1);
  const fo = 1 - clamp((p - BEAT_B4 - 0.35) / 0.7, 0, 1);
  const vis = Math.min(fi, fo);
  T.tunnelMat.opacity = vis * 0.9;
  T.tunnelRim.material.opacity = vis * 0.7;
  const sp = 26 * dt;
  T.tunnel.position.addScaledVector(T.tunnelDir, sp);
  T.tunnelMat.map.offset.y -= dt * 1.4; // tube wall scrolls inward
  const arr = T.streaksPos.array;
  for (let i = 0; i < arr.length; i += 3) {
    arr[i + 2] -= 55 * dt;
    if (arr[i + 2] < -72) {
      arr[i + 2] = 72;
      arr[i] = (Math.random() - 0.5) * 16;
      arr[i + 1] = (Math.random() - 0.5) * 16;
    }
  }
  T.streaksPos.needsUpdate = true;
  // camera rides inside the tube, slight sway
  const sw = Math.sin(p * 1.7) * 0.06;
  T.camera.position.copy(T.tunnel.position).add(new THREE.Vector3(sw, Math.cos(p * 1.3) * 0.05, 0));
  T.camera.lookAt(T.tunnel.position.clone().addScaledVector(T.tunnelDir, 40));
}

/* ---------- B4: COMBAT ONLINE burn-in ---------- */
function burnText(on) {
  const b = el('combat-online');
  if (!b) return;
  if (on) { b.hidden = false; void b.offsetWidth; b.classList.add('on'); }
  else b.classList.remove('on');
}

/* ---------- phase API ---------- */
export function enterTransition(scene, camera, rocket, ui, api) {
  Object.assign(T, { scene, camera, rocket, ui, go: api.go, report: api.report || null, ready: true });
  T.phaseT = 0; T.skipped = false; T.fired.clear(); T.beat = 'B1';
  T.report && T.report({ beat: 'B1' });
  if (ui.count) ui.count.hidden = true;

  // B1 shockwave ring — expands from the rocket, faces the camera
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xdff4ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 12, 72), ringMat);
  ring.position.copy(rocket ? rocket.position : new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0));
  T.scene.add(ring);
  ring.lookAt(camera.position);
  T.ring = ring; T.ringMat = ringMat;

  // skip probe (?skipProbe=1|3): skip at a mid-beat frame, then skip again — the guard must
  // make the second call a no-op, and combat must be entered exactly once.
  if (SKIP_PROBE) {
    const at = SKIP_PROBE === 3 ? BEAT_B3 + 1.0 : BEAT_B1 + 0.45;
    fire(at, () => {
      transitionSkip(); transitionSkip();
      const entries = window.__stage2.combatEntries || 0;
      const res = { beat: SKIP_PROBE, attempted: 2, combatEntries: entries, doubleEnterGuard: entries === 1 };
      window.__stage2.skipProbe = res;
      document.title = 'SKIP_PROBE ' + JSON.stringify(res);
    });
  }
}

export function tickTransition(dt, t) {
  if (!T.ready) return;
  T.phaseT += dt;
  if (HOLD_BEAT_Q && HOLD_BEAT[HOLD_BEAT_Q]) T.phaseT = HOLD_BEAT[HOLD_BEAT_Q]; // probe freeze
  const p = T.phaseT;

  fire(BEAT_B1, () => flash(true));
  if (p >= 0.3) fire(0.3, () => { flash(false); plumeSet({ visible: false }); vacuumDrop(); });
  if (p >= 1.15) fire(1.15, () => plumeSet({ visible: true, color: 0x4dc9ff }));
  if (p >= BEAT_B2) fire(BEAT_B2, () => {
    T.beat = 'B2'; T.report && T.report({ beat: 'B2' });
    hudAssemble(true); beep({ freq: 660, vol: 0.2 });
  });
  if (p >= BEAT_B3) fire(BEAT_B3, () => {
    T.beat = 'B3'; T.report && T.report({ beat: 'B3' });
    spawnTunnel(); sweep({ f0: 320, f1: 1800, dur: 0.9, vol: 0.12, type: 'sine' });
  });
  if (p >= BEAT_B4) fire(BEAT_B4, () => {
    T.beat = 'B4'; T.report && T.report({ beat: 'B4' });
    burnText(true); sweep({ f0: 220, f1: 120, dur: 1.6, vol: 0.14, type: 'sine' });
  });
  if (p >= END && !T.skipped) fire(END, () => T.go && T.go('combat'));

  // B1 ring growth
  if (T.ring) {
    const u = clamp((p - BEAT_B1) / 1.85, 0, 1);
    T.ring.scale.setScalar(1 + u * 9);
    T.ringMat.opacity = Math.sin(Math.min(1, u) * Math.PI) * 0.85;
  }

  // B1/B2 camera: settle into a slow orbit around the rocket
  if (T.ring && p < BEAT_B3) {
    const a = t * 0.12;
    const tx = Math.cos(a) * 8.6, ty = (T.rocket ? T.rocket.position.y : 0) + 0.6 + Math.sin(t * 0.1) * 0.3;
    const tz = Math.sin(a) * 8.6;
    const k = 1 - Math.exp(-2.2 * dt);
    T.camera.position.x += (tx - T.camera.position.x) * k;
    T.camera.position.y += (ty - T.camera.position.y) * k;
    T.camera.position.z += (tz - T.camera.position.z) * k;
    const ry = T.rocket ? T.rocket.position.y : 0;
    T.camera.lookAt(0, ry + 0.5, 0);
  }

  if (T.tunnel) tickTunnel(dt);
}

export function transitionSkip() {
  if (!T.ready || T.skipped) return; // double-skip guard — one landing per phase
  T.skipped = true;
  T.go && T.go('combat');
}

export function clearTransition() {
  if (!T.ready) return;
  if (T.ring) { T.scene.remove(T.ring); T.ring.geometry.dispose(); T.ringMat.dispose(); }
  if (T.tunnel) {
    T.scene.remove(T.tunnel);
    for (const ch of T.tunnel.children) { ch.geometry && ch.geometry.dispose(); ch.material && ch.material.dispose(); }
    T.tunnelMat.dispose();
  }
  flash(false); burnText(false);
  loopsStopAll(0.2);
  T.ready = false; T.skipped = false; T.fired.clear();
  T.ring = null; T.ringMat = null; T.tunnel = null; T.tunnelMat = null; T.tunnelRim = null;
  T.tunnelDir = null; T.streaksPos = null;
}
