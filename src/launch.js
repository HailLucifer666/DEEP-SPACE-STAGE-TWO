// STAGE TWO — pad world + COUNTDOWN / IGNITION / ASCENT phases (+ audio recipes).
// Owns: island, pad platform, gantry+swing arm, sky/stars/clouds, plume, smoke/spark pools,
// chase-cam + shake + max-Q, telemetry. Phase entry/exit reset ALL of its own state (§8.6 discipline).
import { THREE } from 'stage-two-lib';
import { beep, noiseBurst, loopStart, loopsStopAll, sweep } from './audio.js';

const PAD_TOP_Y = 0.62;
const ROCKET_BASE_Y = PAD_TOP_Y + 0.8;   // rocket wrap center: base sits on platform
const PAD_DUR = 2.6;
const COUNT_STEP = 0.95;
const IGNITION_DUR = 2.0;
// probe-only: ?ascent=N compresses the climb so deterministic captures don't starve rAF
// probe-only: ?holdCount=1 freezes the countdown at its first numeral ("3") for single-frame visual checks
const qParams = new URLSearchParams(location.search);
const ascentQ = Number(qParams.get('ascent'));
const ASCENT_DUR = Number.isFinite(ascentQ) && ascentQ >= 1 && ascentQ <= 60 ? ascentQ : 24;
const ASCENT_COAST = 3.2; // post-burnout tele hold, then hand to TRANSITION (S3)
const HOLDCOUNT = qParams.get('holdCount') === '1';
const MAX_CLIMB = 140;                   // world units climbed
const DRIFT_X = 46;                      // gravity-turn eastward drift at handoff
const MAXQ_LO = 0.3, MAXQ_HI = 0.46;     // shake peak window (fractions of ascent)

const L = {
  ready: false, scene: null, camera: null, ui: null, go: null,
  rocket: null, arm: null, armSwing: -1, spot: null, thruster: null, thrLight: null,
  sky: null, skyMat: null, starsA: null, starsB: null, cloudCloud: null,
  clouds: [], smoke: null, sparks: null, smokeAcc: 0, sparkAcc: 0, emitOn: false,
  rumbleBag: null, windBag: null, whooshBag: null,
  phaseT: 0, prevAlt: 0, holdSeconds: 0, lastVelShown: 0, camPos: new THREE.Vector3(), tmp: new THREE.Vector3(),
  emT: new THREE.Vector3(),
  shipPrev: null, shipV: { x: 0, y: 0 },
  lastNumeral: null,
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

/* ---------- procedural textures ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const smokeTex = () => canvasTex(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  r.addColorStop(0, 'rgba(255,255,255,.95)'); r.addColorStop(0.55, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
});
const sparkTex = () => canvasTex(32, 32, (g) => {
  const r = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  r.addColorStop(0, 'rgba(255,244,214,1)'); r.addColorStop(0.4, 'rgba(255,178,90,.9)'); r.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
});
const cloudTex = () => canvasTex(160, 128, (g) => {
  for (const [cx, cy, rr] of [[52, 74, 34], [86, 66, 30], [108, 78, 26], [70, 88, 30]]) {
    const r = g.createRadialGradient(cx, cy, 3, cx, cy, rr);
    r.addColorStop(0, 'rgba(255,244,238,.75)'); r.addColorStop(1, 'rgba(255,244,238,0)');
    g.fillStyle = r; g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.fill();
  }
});
const skyTex = () => canvasTex(64, 512, (g) => { // v0 = canvas top; warm band just above the equator (camera is island-bound)
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0.00, '#0a1120');
  gr.addColorStop(0.36, '#223b5d');
  gr.addColorStop(0.46, '#6f89ad');
  gr.addColorStop(0.50, '#e0985c');
  gr.addColorStop(0.54, '#ff8d3a');
  gr.addColorStop(0.58, '#3a2a2b');
  gr.addColorStop(0.66, '#151318');
  gr.addColorStop(1.00, '#151318');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 512);
});

/* ---------- pooled sprites ---------- */
function makePool(scene, tex, n) {
  const items = [];
  let idx = 0;
  let live = 0;
  for (let i = 0; i < n; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
    const s = new THREE.Sprite(m); s.visible = false; scene.add(s);
    items.push({ s, m, life: 0, ttl: 1, vx: 0, vy: 0, vz: 0, grav: 0, grow: 0, baseOp: 1, drag: 0 });
  }
  return {
    items,
    get live() { return live; }, // pool occupancy — debug/probe surface
    spawn(o) {
      const it = items[idx++ % n];
      it.life = it.ttl = o.ttl;
      it.vx = o.vx; it.vy = o.vy; it.vz = o.vz; it.grav = o.grav || 0;
      it.grow = o.grow || 0; it.baseOp = o.op || 1; it.drag = o.drag || 0;
      it.s.position.copy(o.p); it.s.scale.setScalar(o.size); it.s.material.rotation = Math.random() * 6.28;
      it.s.visible = true;
    },
    update(dt) {
      live = 0;
      for (const it of items) {
        if (it.life <= 0) { it.s.visible = false; continue; }
        live++;
        it.life -= dt;
        const u = 1 - it.life / it.ttl;
        it.vy += it.grav * dt;
        if (it.drag) { const d = 1 - Math.min(0.9, it.drag * dt); it.vx *= d; it.vz *= d; }
        it.s.position.x += it.vx * dt; it.s.position.y += it.vy * dt; it.s.position.z += it.vz * dt;
        const sc = it.s.scale.x + it.grow * dt; it.s.scale.setScalar(sc);
        it.m.opacity = it.baseOp * Math.min(1, u * 6) * (1 - u * u);
      }
    },
    clear() { for (const it of items) { it.life = 0; it.s.visible = false; } },
  };
}

/* ---------- world build (once) ---------- */
export function prepareLaunch(scene, camera, rocket, ui, go) {
  if (L.ready) return L;
  Object.assign(L, { scene, camera, rocket, ui, go });
  L.ready = true;

  // island + platform + clamps
  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(10.5, 16, 5, 26),
    new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 1 }));
  island.position.y = -2.5;
  const plat = new THREE.Mesh(
    new THREE.BoxGeometry(7, PAD_TOP_Y, 7),
    new THREE.MeshStandardMaterial({ color: 0x565a60, roughness: 0.8, metalness: 0.3 }));
  plat.position.y = PAD_TOP_Y / 2;
  scene.add(island, plat);
  const clampMat = new THREE.MeshStandardMaterial({ color: 0x2f3540, roughness: 0.7, metalness: 0.4 });
  for (const [cx, cz] of [[0.55, 0.55], [-0.55, 0.55], [0.55, -0.55], [-0.55, -0.55]]) {
    const cl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.22), clampMat);
    cl.position.set(cx, 0.28, cz); cl.rotation.y = Math.PI / 4; scene.add(cl);
  }

  // gantry tower + swing arm (clears mid-count)
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 13, 0.75),
    new THREE.MeshStandardMaterial({ color: 0x3c434d, roughness: 0.6, metalness: 0.5 }));
  tower.position.set(-4.1, 6.5, -0.3);
  const armPivot = new THREE.Group(); armPivot.position.set(-3.55, 11.8, 0);
  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 3.3, 10),
    new THREE.MeshStandardMaterial({ color: 0x50575f, roughness: 0.6, metalness: 0.5 }));
  arm.rotation.z = Math.PI / 2; arm.position.x = 1.6;
  armPivot.add(arm);
  scene.add(tower, armPivot);
  L.arm = armPivot; L.armSwing = -1;

  // floodlight aimed at the rocket (dawn drama)
  L.spot = new THREE.SpotLight(0xffe0b8, 140, 60, 0.55, 0.45, 1.4);
  L.spot.position.set(-4.0, 12.5, 0.4);
  L.spot.target.position.set(0, 2.2, 0);
  scene.add(L.spot, L.spot.target);

  // sky dome + stars (sky fades to 0 during ascent, stars fade in)
  L.skyMat = new THREE.MeshBasicMaterial({ map: skyTex(), side: THREE.BackSide, transparent: true, opacity: 1, depthWrite: false });
  L.sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 24, 16), L.skyMat);
  scene.add(L.sky);
  const starPositions = (count, rMax, rMin) => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(rMin + Math.random() * (rMax - rMin));
      a.set([v.x, Math.abs(v.y) * 0.85 + 40, v.z], i * 3); // mostly above the horizon
    }
    return a;
  };
  L.starsA = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPositions(900, 1150, 900), 3)),
    new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
  L.starsB = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPositions(380, 1150, 900), 3)),
    new THREE.PointsMaterial({ color: 0xffffff, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
  scene.add(L.starsA, L.starsB);

  // cloud shell (billboards whoosh past during ascent)
  L.cloudCloud = cloudTex();
  for (let i = 0; i < 18; i++) {
    const m = new THREE.SpriteMaterial({ map: L.cloudCloud, transparent: true, opacity: 0.55, depthWrite: false });
    const s = new THREE.Sprite(m);
    const a = Math.random() * Math.PI * 2, r = 42 + Math.random() * 98;
    s.position.set(Math.cos(a) * r, 26 + Math.random() * 74, Math.sin(a) * r);
    s.scale.setScalar(22 + Math.random() * 42);
    scene.add(s);
    L.clouds.push({ s, drift: (Math.random() * 2 - 1) * 0.7 });
  }

  // plume — pivot anchors the cone mouth at the nozzle so scale flicker keeps it welded
  L.thrPivot = new THREE.Group();
  L.thrPivot.position.set(0, -0.8, 0);
  L.thruster = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 2.2, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb469, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  L.thruster.rotation.x = Math.PI;
  L.thruster.position.set(0, -1.12, 0); // mouth ~0.02 below pivot ≈ nozzle lip
  L.thrPivot.add(L.thruster);
  L.thruster.visible = false;
  L.thrLight = new THREE.PointLight(0xffb469, 0, 40, 1.6);
  L.thrLight.position.set(0, -0.6, 0);
  L.thrLight.visible = false;
  rocket.add(L.thrPivot, L.thrLight); // plume rides the carrier

  // camera fill — the hull reads against space once the dawn lights drop away
  scene.add(camera);
  L.camLight = new THREE.PointLight(0xbfd8ff, 22, 20, 2);
  L.camLight.position.set(0, 0.4, 1.8);
  camera.add(L.camLight);
  resetStage(); // stage the rocket on the pad for TITLE (pad world is the title vista)

  // pools
  L.smoke = makePool(scene, smokeTex(), 60);
  L.sparks = makePool(scene, sparkTex(), 52);
}

/* ---------- shared helpers ---------- */
function resetStage() { // full phase-reset contract (§8.6)
  L.phaseT = 0; L.prevAlt = 0; L.holdSeconds = 0; L.lastVelShown = 0;
  L.smokeAcc = 0; L.sparkAcc = 0; L.emitOn = false; L.armSwing = -1; L.lastNumeral = null;
  if (L.rocket) { L.rocket.position.set(0, ROCKET_BASE_Y, 0); L.rocket.rotation.set(0, 0, 0); }
  if (L.thrPivot) { L.thruster.visible = false; L.thrPivot.scale.setScalar(1); L.thruster.material.opacity = 0.82; }
  if (L.thrLight) { L.thrLight.visible = false; L.thrLight.intensity = 0; }
  if (L.skyMat) L.skyMat.opacity = 1;
  if (L.starsA) { L.starsA.material.opacity = 0; L.starsB.material.opacity = 0; }
  if (L.spot) L.spot.intensity = 140;
  if (L.arm) L.arm.rotation.z = 0;
  L.smoke && L.smoke.clear(); L.sparks && L.sparks.clear();
  loopsStopAll(0.15);
}

function shakeApply(amp) {
  if (amp <= 0) return;
  const c = L.camera;
  c.position.x += (Math.random() * 2 - 1) * amp;
  c.position.y += (Math.random() * 2 - 1) * amp * 0.7;
  c.position.z += (Math.random() * 2 - 1) * amp;
}

function padCam(dt, t, close) {
  const a = 0.55 + t * 0.09;
  const r = close ? 5.6 : 6.6;
  L.camera.position.set(Math.cos(a) * r, (close ? 1.55 : 1.9) + Math.sin(t * 0.13) * 0.35, Math.sin(a) * r);
  L.camera.lookAt(0, close ? 2.0 : 2.15, 0);
}

/* ---------- PHASE: PAD (drift) ---------- */
export function enterPad() {
  resetStage();
  // HUD root visibility belongs to main's phase table; the pad shows no sub-elements,
  // so they are simply empty here (count cleared on phase exit, tele revealed in ascent)
  L.windBag = loopStart({ freq: 55, vol: 0.06, playback: 0.5 });
}
export function tickPad(dt, t) {
  L.phaseT += dt;
  padCam(dt, t, false);
  for (const c of L.clouds) c.s.position.x += c.drift * dt;
  if (L.phaseT >= PAD_DUR) L.go('countdown');
}

/* ---------- PHASE: COUNTDOWN ---------- */
export function enterCountdown() {
  resetStage();
  L.phaseT = 0;
  L.ui && (L.ui.count.hidden = false, L.ui.tele.hidden = true);
}
export function tickCountdown(dt, t) {
  L.phaseT += dt;
  if (HOLDCOUNT) L.phaseT = 1; // probe: parked inside the "3" window, phase never escapes
  padCam(dt, t, true);
  const step = Math.floor(L.phaseT / COUNT_STEP);
  const numeral = step < 3 ? String(3 - step) : '';
  if (numeral && numeral !== L.lastNumeral) {
    L.lastNumeral = numeral;
    L.ui.count.textContent = numeral;
    L.ui.count.classList.remove('pop'); void L.ui.count.offsetWidth; L.ui.count.classList.add('pop');
    beep({ freq: numeral === '1' ? 1320 : 880, vol: 0.3 });
  }
  // swing arm clears between the 3 and the 2
  const swU = clamp((L.phaseT - COUNT_STEP * 0.5) / (COUNT_STEP * 0.8), 0, 1);
  L.arm.rotation.z = swU * swU * (3 - 2 * swU) * 1.45;
  if (L.phaseT >= COUNT_STEP * 3 + 0.25) { if (L.ui.count) L.ui.count.hidden = true; L.go('ignition'); }
}

/* ---------- PHASE: IGNITION ---------- */
export function enterIgnition() {
  resetStage();
  L.phaseT = 0;
  L.emitOn = true;
  L.thruster.visible = true; L.thrLight.visible = true;
  noiseBurst({ dur: 1.1, vol: 0.8, f0: 140, f1: 700 });
  L.rumbleBag = loopStart({ freq: 78, vol: 0.16, playback: 0.55 });
}
/*
 * Engine-anchored emitters. The base tracks the nozzle through the rocket's local
 * space (localToWorld), so the trail follows the ship up — never the pad.
 * mode 'pad'  : heavy smoke + sparks (sheet across the pad, ignition drama)
 * mode 'flight': thin trail smoke only (sparks belong in atmosphere)
 */
function emit(dt, mode) {
  if (!L.rocket) return;
  const base = L.rocket.localToWorld(L.emT.set(0, -1.25, 0));
  const smokeRate = mode === 'flight' ? 16 : 30;
  L.smokeAcc += dt * smokeRate;
  while (L.smokeAcc >= 1) {
    L.smokeAcc -= 1;
    if (mode === 'flight') {
      // exhaust rides backward down the flight line: sprite velocity ≈ ship velocity × k,
      // so each puff falls behind the ship and stretches the trail along the path
      const k = 0.42 + Math.random() * 0.22;
      L.smoke.spawn({
        p: base.clone(), ttl: 0.55 + Math.random() * 0.45,
        vx: (L.shipV.x || 0) * k + (Math.random() * 2 - 1) * 1.5,
        vy: (L.shipV.y || 0) * k + (Math.random() * 2 - 1) * 1.5,
        vz: (Math.random() * 2 - 1) * 1.5, drag: 0.6,
        size: 0.5 + Math.random() * 0.4, grow: 0.9 + Math.random() * 0.5, op: 0.4,
      });
      continue;
    }
    const a = Math.random() * Math.PI * 2, sp = 2.5 + Math.random() * 5;
    L.smoke.spawn({
      p: base.clone(), ttl: 1.6 + Math.random() * 1.6,
      vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 0.6 + Math.random() * 1.2, drag: 1.1,
      size: 0.6 + Math.random() * 0.7, grow: 2.4 + Math.random() * 2, op: 0.5,
    });
  }
  if (mode === 'flight') return;
  L.sparkAcc += dt * 46;
  while (L.sparkAcc >= 1) {
    L.sparkAcc -= 1;
    const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 9;
    L.sparks.spawn({
      p: base.clone(), ttl: 0.35 + Math.random() * 0.5,
      vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: Math.random() * 3 - 0.5, grav: -14,
      size: 0.10 + Math.random() * 0.12, op: 1,
    });
  }
}
export function particleCount() { return (L.smoke ? L.smoke.live : 0) + (L.sparks ? L.sparks.live : 0); }
export function plumeSet({ visible, color } = {}) {
  if (L.thruster) L.thruster.visible = !!visible;
  if (L.thrLight) L.thrLight.visible = !!visible;
  if (color !== undefined && L.thruster) {
    L.thruster.material.color.setHex(color);
    L.thrLight.color.setHex(color);
  }
}
export function ambience(space) { // true → vacuum (stars, no dawn flood); false → pad dawn
  if (L.skyMat) L.skyMat.opacity = space ? 0 : 1;
  if (L.starsA) { L.starsA.material.opacity = space ? 1 : 0; L.starsB.material.opacity = space ? 1 : 0; }
  if (L.spot) L.spot.intensity = space ? 0 : 140;
}
export function tickIgnition(dt, t) {
  L.phaseT += dt;
  emit(dt, 'pad');
  L.smoke.update(dt); L.sparks.update(dt);
  padCam(dt, t, true);
  const flick = 0.75 + Math.random() * 0.5;
  L.thrPivot.scale.set((0.5 + L.phaseT * 0.25) * flick, (0.4 + L.phaseT * 0.3) * flick, (0.5 + L.phaseT * 0.25) * flick);
  L.thrLight.intensity = (26 + L.phaseT * 22) * flick;
  if (L.rumbleBag) L.rumbleBag.setVol(0.16 + L.phaseT * 0.09);
  const dist = L.camera.position.length();
  shakeApply(0.055 * clamp(9 / Math.max(1, dist), 0, 1.4));
  if (L.phaseT >= IGNITION_DUR) L.go('ascent');
}

/* ---------- PHASE: ASCENT ---------- */
export function enterAscent() {
  resetStage();
  L.phaseT = 0;
  L.thruster.visible = true; L.thrLight.visible = true; L.thrPivot.scale.setScalar(1);
  L.thruster.material.opacity = 0.82;
  L.thrLight.intensity = 34;
  L.ui.count.hidden = true; L.ui.tele.hidden = false;
  L.shipPrev = L.rocket ? L.rocket.position.clone() : new THREE.Vector3();
  L.shipV.x = 0; L.shipV.y = 0;
  noiseBurst({ dur: 0.8, vol: 0.5, f0: 500, f1: 1500 });
  L.rumbleBag = loopStart({ freq: 82, vol: 0.34, playback: 0.5 });
  L.whooshBag = loopStart({ freq: 320, type: 'bandpass', q: 2.2, vol: 0.06, playback: 0.9 });
  L.camPos.copy(L.camera.position);
}
export function tickAscent(dt, t) {
  L.phaseT += dt;
  const u = clamp(L.phaseT / ASCENT_DUR, 0, 1);
  const done = L.phaseT >= ASCENT_DUR;
  const uu = done ? 1 : u;

  // flight path + tilt
  const y = uu * uu * 1.25 * MAX_CLIMB;         // rises accelerating
  const x = uu * uu * 1.5 * DRIFT_X;
  if (!done) {
    L.rocket.position.set(x, ROCKET_BASE_Y + y, 0);
    L.rocket.rotation.z = -0.62 * Math.pow(uu, 1.12);
    // ship velocity (units/s) — flight-trail spread reads it
    if (dt > 0) {
      L.shipV.x = (x - L.shipPrev.x) / dt;
      L.shipV.y = (ROCKET_BASE_Y + y - L.shipPrev.y) / dt;
      L.shipPrev.set(x, ROCKET_BASE_Y + y, 0);
    }
  }
  // plume flicker — condensed in flight so the hero reads inside the glow
  const flic = 0.9 + Math.random() * 0.2;
  L.thrPivot.scale.set(0.62 * flic, (0.72 + Math.random() * 0.16) * flic, 0.62 * flic);
  L.thruster.material.opacity = 0.62;
  L.thrLight.intensity = 20 + Math.random() * 9;

  // camera: lagged spring chase, offset laterally so we ride beside the ship
  // (dead-center behind = straight into the cone throat)
  const ahead = (done ? 0.0001 : 0.004);
  const y2 = (uu + ahead) * (uu + ahead) * 1.25 * MAX_CLIMB;
  const x2 = (uu + ahead) * (uu + ahead) * 1.5 * DRIFT_X;
  L.tmp.set(x - x2, y - y2, done ? 0 : 2.6); // backward along the flight line, swung aside
  if (L.tmp.lengthSq() < 0.04) L.tmp.set(-0.9, -1.0, 2.2);
  L.tmp.setLength(done ? 7.6 : 8.2);
  const target = L.rocket.position;
  const k = 1 - Math.exp(-3.6 * dt);
  L.camPos.lerp(L.tmp.add(target), k);
  L.camera.position.copy(L.camPos);
  L.camera.lookAt(target.x + 0.4, target.y + 0.5, target.z);

  // max-Q shake peak mid-ascent
  const bump = 1 + 1.8 * smooth(MAXQ_LO, 0.36, u) * (1 - smooth(MAXQ_HI, MAXQ_HI + 0.08, u));
  shakeApply(0.03 + (bump - 1) * 0.26);

  // sky burn-off + stars + dawn light dying
  L.skyMat.opacity = 1 - smooth(0, 0.55, u);
  L.starsA.material.opacity = smooth(0.3, 0.78, u);
  L.starsB.material.opacity = smooth(0.3, 0.78, u);
  L.spot.intensity = 140 * (1 - smooth(0, 0.12, u));
  if (L.whooshBag) { L.whooshBag.setFreq(320 + u * 1500); L.whooshBag.setVol(0.06 + smooth(0, 0.3, u) * 0.2 - smooth(0.8, 1, u) * 0.2); }
  for (const c of L.clouds) c.s.position.x += c.drift * dt;

  // engine-anchored trail (atmosphere only; cutoff ends emission, fade continues)
  if (!done) emit(dt, 'flight');

  // telemetry (8 Hz)
  const altM = Math.max(0, Math.round((L.rocket.position.y - ROCKET_BASE_Y) * 410));
  const vel = done ? L.lastVelShown : Math.max(0, Math.round((altM - L.prevAlt) / Math.max(dt, 0.001)));
  if (!done) L.prevAlt = altM;
  if (L.ui.tele && (L.holdSeconds += dt) >= 0.125) {
    L.holdSeconds = 0;
    const jit = (n, w) => n + Math.round((Math.random() * 2 - 1) * w);
    const velOut = done ? L.lastVelShown : Math.max(0, jit(vel, 3));
    L.lastVelShown = velOut; // coast holds the burnout velocity — 000000 reads "dead", not "coasting"
    const thr = done ? 64 : clamp(Math.round(102 - u * 22 + jit(0, 1.6)), 35, 104);
    L.ui.tele.textContent =
      `ALT ${altM.toLocaleString('en-US')} m\nVEL ${String(velOut).padStart(6, '0')} m/s\nTHR ${thr} %`;
  }

  // pools still run briefly after cutoff (fading exhaust)
  L.smoke.update(dt); L.sparks.update(dt);

  // coast hold (tele freeze) ends → hand to TRANSITION (S3)
  if (done && L.phaseT >= ASCENT_DUR + ASCENT_COAST) L.go('transition');
}
