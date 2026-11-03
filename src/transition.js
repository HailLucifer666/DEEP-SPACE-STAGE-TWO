// STAGE TWO — TRANSITION: cruise exit → combat. The rift → through → warp → logo sequence.
// Beats: B1 the RIFT (screen-space tear opens in front of the camera, space darkens into it),
// B2 HUD lock-in while the rift hangs open, B3 punch-THROUGH (FOV kick, upgraded tunnel: tube +
// streaks + 6 rushing ring gates, speed ramp), LOGO ("STAGE TWO" glitch card inside the warp),
// B4 logo punch-out → "COMBAT ONLINE". Any key skips to a clean COMBAT landing at any beat
// (state-guarded; double-skip no-op). clear() teardown (§8.6): dispose beat objects, cancel
// overlay classes, stop audio, RESTORE THE FOV — a leaked kick would warp every later camera.
import { THREE } from 'stage-two-lib';
import { beep, sweep, vacuumDrop, musicEvict } from './audio.js';
import { plumeSet } from './launch.js';

const BEAT_B1 = 0.05, BEAT_B2 = 2.6, BEAT_B3 = 5.4, BEAT_LOGO = 7.6, BEAT_B4 = 9.6;
const END = 12.6;
const HOLD_BEAT = { 1: 1.4, 2: 3.4, 3: 6.4, 4: 8.6 }; // probe-freeze frames; 4 = mid-LOGO-hold (7.6–9.6 window)
const HOLD_BEAT_Q = Number(new URLSearchParams(location.search).get('holdBeat')) || 0;
const SKIP_PROBE = Number(new URLSearchParams(location.search).get('skipProbe')) || 0;
const FOV_BASE = 62;

const T = {
  ready: false, scene: null, camera: null, rocket: null, ui: null, go: null, report: null,
  phaseT: 0, skipped: false, fired: new Set(), beat: '',
  riftTear: null, riftPull: null, riftMatTear: null, riftMatPull: null,
  tunnel: null, tunnelMat: null, tunnelRim: null, tunnelDir: null, gates: [], streaksPos: null,
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const el = (id) => document.getElementById(id);

function fire(t, fn) { if (!T.fired.has(t)) { T.fired.add(t); fn(); } }

/* ---------- flash pulse (the rift flare; soft = short bright pop, never a white wash) ---------- */
function flash(on, soft) {
  const f = el('flash');
  if (!f) return;
  if (on) { f.hidden = false; void f.offsetWidth; f.classList.toggle('soft', !!soft); f.classList.add('on'); }
  else { f.classList.remove('on'); f.classList.remove('soft'); }
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

/* ---------- B1: the rift — screen-space tear, two quads parented to the camera ---------- */
const RIFT_VERT = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const jagLine = ` // the tear's wandering centerline — layered sines, no texture fetches
  float jag(vec2 uv, float t){
    return (sin(uv.y*9.0 + t*1.3) * 0.5 + sin(uv.y*23.0 - t*2.1) * 0.28 + sin(uv.y*4.0 + t*0.7) * 0.35)
      * (0.05 + uOpen*0.13);
  }`;
const tearFrag = `
  varying vec2 vUv;
  uniform float uOpen, uFlare, uT, uFade;
  ${jagLine}
  void main(){
    vec2 uv = vUv - 0.5;
    float dx = abs(uv.x*1.25 - jag(uv, uT));
    float w = 0.012 + uOpen * 0.10;
    float core = smoothstep(w*1.7, 0.0, dx);
    float rim = smoothstep(w*4.5, w*0.9, dx) * (1.0 - core);
    float flick = 0.82 + 0.18*sin(uT*31.0 + uv.y*40.0);
    vec3 col = vec3(0.82,0.96,1.0) * core * (1.1 + uFlare*2.2) * flick
             + vec3(0.22,0.62,1.0) * rim * (0.55 + uFlare*1.4);
    float a = clamp(core + rim*0.85, 0.0, 1.0) * uFade;
    gl_FragColor = vec4(col * a, a);
  }`;
const pullFrag = `
  varying vec2 vUv;
  uniform float uOpen, uT, uFade;
  ${jagLine}
  void main(){
    vec2 uv = vUv - 0.5;
    float dx = abs(uv.x*1.25 - jag(uv, uT));
    float near = smoothstep(0.85, 0.02, dx) * uOpen;
    float vig = smoothstep(1.15, 0.35, length(uv*vec2(1.4,1.0)));
    float a = clamp(near*0.55 + vig*0.25*uOpen, 0.0, 0.8) * uFade;
    gl_FragColor = vec4(vec3(0.0), a);
  }`;

function spawnRift() {
  const mk = (frag, blending) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: RIFT_VERT, fragmentShader: frag,
      uniforms: { uOpen: { value: 0 }, uFlare: { value: 0 }, uT: { value: 0 }, uFade: { value: 0 } },
      transparent: true, depthTest: false, depthWrite: false, blending,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.65), mat);
    mesh.position.z = -1.1; // in front of the camera, screen-fixed
    mesh.renderOrder = 90;
    mesh.frustumCulled = false;
    T.camera.add(mesh);
    return [mesh, mat];
  };
  [T.riftPull, T.riftMatPull] = mk(pullFrag, THREE.NormalBlending); // darkens space into the tear
  [T.riftTear, T.riftMatTear] = mk(tearFrag, THREE.AdditiveBlending); // the glowing tear itself
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
  T.gates = []; // rushing ring gates — the tunnel's heartbeat
  for (let i = 0; i < 6; i++) {
    const gate = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.09, 8, 40), rimMat.clone());
    gate.position.z = 62 - i * 25;
    g.add(gate);
    T.gates.push(gate);
  }
  T.scene.add(g);
  T.tunnel = g; T.tunnelMat = mat; T.tunnelRim = rim; T.tunnelDir = dir;
}

function tickTunnel(dt) {
  const p = T.phaseT;
  const ramp = clamp((p - BEAT_B3) / 2.5, 0, 1); // 26 → 55 u/s through the run
  const fi = clamp((p - BEAT_B3) / 0.5, 0, 1);
  const fo = 1 - clamp((p - BEAT_B4 - 0.35) / 0.7, 0, 1);
  const vis = Math.min(fi, fo);
  T.tunnelMat.opacity = vis * 0.9;
  T.tunnelRim.material.opacity = vis * 0.7;
  const sp = (26 + 29 * ramp) * dt;
  T.tunnel.position.addScaledVector(T.tunnelDir, sp);
  T.tunnelMat.map.offset.y -= dt * (1.4 + 1.2 * ramp); // tube wall scrolls inward, faster with the ramp
  const st = (55 + 55 * ramp) * dt;
  const arr = T.streaksPos.array;
  for (let i = 0; i < arr.length; i += 3) {
    arr[i + 2] -= st;
    if (arr[i + 2] < -72) {
      arr[i + 2] = 72;
      arr[i] = (Math.random() - 0.5) * 16;
      arr[i + 1] = (Math.random() - 0.5) * 16;
    }
  }
  T.streaksPos.needsUpdate = true;
  for (const gate of T.gates) { // gates rush past and recycle ahead
    gate.position.z -= st * 1.15;
    gate.rotation.z += dt * 0.9;
    gate.material.opacity = vis * 0.75 * clamp((gate.position.z + 70) / 30, 0.15, 1);
    if (gate.position.z < -74) gate.position.z += 150;
  }
  // camera rides inside the tube, sway + slow roll
  const sw = Math.sin(p * 1.7) * 0.06;
  T.camera.position.copy(T.tunnel.position).add(new THREE.Vector3(sw, Math.cos(p * 1.3) * 0.05, 0));
  T.camera.lookAt(T.tunnel.position.clone().addScaledVector(T.tunnelDir, 40));
  T.camera.rotateZ(Math.sin(p * 0.9) * 0.08);
}

/* ---------- LOGO beat + B4: burn-in ---------- */
function burnLogo(state) { // 'in' glitch card, 'out' punch-away, off hidden
  const l = el('go-logo');
  if (!l) return;
  if (state === 'in') { l.hidden = false; void l.offsetWidth; l.classList.add('on'); }
  else if (state === 'out') { l.classList.remove('on'); l.classList.add('out'); }
  else { l.classList.remove('on'); l.classList.remove('out'); l.hidden = true; }
}
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
  spawnRift();

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

  // rift life: open 0.05→1.45s, hold with flicker, flare at 5.0, pass through at B3
  if (T.riftMatTear) {
    const u = T.riftMatTear.uniforms;
    u.uOpen.value = smooth(BEAT_B1, 1.45, p) * 0.92 + smooth(4.6, BEAT_B3, p) * 0.08;
    u.uFlare.value = smooth(4.85, 5.15, p) * (1 - smooth(5.3, 5.8, p));
    u.uT.value = t;
    u.uFade.value = smooth(BEAT_B1, 0.35, p) * (1 - smooth(BEAT_B3, BEAT_B3 + 0.5, p));
    const u2 = T.riftMatPull.uniforms;
    u2.uOpen.value = u.uOpen.value;
    u2.uT.value = t;
    u2.uFade.value = u.uFade.value;
  }

  fire(BEAT_B1, () => vacuumDrop());
  if (p >= 0.3) fire(0.3, () => plumeSet({ visible: false }));
  if (p >= 1.15) fire(1.15, () => plumeSet({ visible: true, color: 0x4dc9ff }));
  if (p >= BEAT_B2) fire(BEAT_B2, () => {
    T.beat = 'B2'; T.report && T.report({ beat: 'B2' });
    hudAssemble(true); beep({ freq: 660, vol: 0.2 });
  });
  if (p >= 5.0) fire(5.0, () => { flash(true, true); sweep({ f0: 220, f1: 1400, dur: 0.7, vol: 0.14, type: 'sine' }); });
  if (p >= 5.45) fire(5.45, () => flash(false));
  if (p >= BEAT_B3) fire(BEAT_B3, () => {
    T.beat = 'B3'; T.report && T.report({ beat: 'B3' });
    spawnTunnel(); sweep({ f0: 320, f1: 1800, dur: 0.9, vol: 0.12, type: 'sine' });
  });
  if (p >= BEAT_LOGO) fire(BEAT_LOGO, () => {
    T.beat = 'LOGO'; T.report && T.report({ beat: 'LOGO' });
    burnLogo('in'); beep({ freq: 520, vol: 0.22, type: 'triangle' }); beep({ freq: 780, vol: 0.16, type: 'triangle', delay: 0.12 });
  });
  if (p >= BEAT_B4) fire(BEAT_B4, () => {
    T.beat = 'B4'; T.report && T.report({ beat: 'B4' });
    burnLogo('out'); burnText(true); sweep({ f0: 220, f1: 120, dur: 1.6, vol: 0.14, type: 'sine' });
  });
  if (p >= END && !T.skipped) fire(END, () => T.go && T.go('combat'));

  // B1/B2 camera: slow dolly toward the tear, slight roll as it opens
  if (T.riftTear && p < BEAT_B3) {
    const k = 1 - Math.exp(-1.6 * dt);
    T.camera.position.x += (0.9 + Math.sin(t * 0.21) * 0.18 - T.camera.position.x) * k;
    T.camera.position.y += (1.25 + Math.sin(t * 0.13) * 0.12 - T.camera.position.y) * k;
    T.camera.position.z += (-5.3 - T.camera.position.z) * k;
    T.camera.lookAt(0, 0.5, 3);
    T.camera.rotateZ(Math.sin(t * 0.4) * 0.04 + smooth(BEAT_B1, BEAT_B3, p) * 0.1);
  }

  if (T.tunnel) tickTunnel(dt);

  // FOV: kick through the tear (speed feel), settle back by B4 — combat always lands at base
  if (T.camera.fov !== undefined) {
    T.camera.fov = FOV_BASE + 16 * smooth(5.0, 6.2, p) * (1 - smooth(8.2, BEAT_B4, p));
    T.camera.updateProjectionMatrix();
  }
}

export function transitionSkip() {
  if (!T.ready || T.skipped) return; // double-skip guard — one landing per phase
  T.skipped = true;
  T.go && T.go('combat');
}

export function clearTransition() {
  if (!T.ready) return;
  for (const [mesh, mat] of [[T.riftTear, T.riftMatTear], [T.riftPull, T.riftMatPull]]) {
    if (mesh) { T.camera.remove(mesh); mesh.geometry.dispose(); mat.dispose(); }
  }
  if (T.tunnel) {
    T.scene.remove(T.tunnel);
    for (const ch of T.tunnel.children) { ch.geometry && ch.geometry.dispose(); ch.material && ch.material.dispose(); }
    T.tunnelMat.dispose();
  }
  for (const gate of T.gates) gate.material.dispose();
  flash(false); burnText(false); burnLogo(false);
  musicEvict(0.2); // story-009: engine loops still die here; the music bed survives the clear — combat.enter owns its swell (spec §7)
  if (T.camera) { T.camera.fov = FOV_BASE; T.camera.updateProjectionMatrix(); } // never leak the kick into combat
  T.ready = false; T.skipped = false; T.fired.clear();
  T.riftTear = null; T.riftPull = null; T.riftMatTear = null; T.riftMatPull = null;
  T.tunnel = null; T.tunnelMat = null; T.tunnelRim = null; T.tunnelDir = null; T.gates = []; T.streaksPos = null;
}
