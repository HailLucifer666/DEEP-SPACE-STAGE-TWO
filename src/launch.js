// STAGE TWO — deep-space launch: DRIFT (pad) → COUNTDOWN → IGNITION → CRUISE (ascent).
// Owns: the ship rig (persistent seat for the hero in every non-combat phase), the streaming
// asteroid field (two counter-rotating instanced rock bands + a wreck stream), the planet and
// the black hole, plume, drift/chase cameras, telemetry, audio recipes. The ship NEVER leaves
// the lane at the origin — the WORLD streams past it — so transition B1/B2 (origin-orbit camera)
// and the combat arena (origin-anchored) keep their staging untouched. Phase entry/exit resets
// ALL of its own state (§8.6 discipline). Vi3W showcase: stage-one rocket derelicts (seedWrecks).
import { THREE } from 'stage-two-lib';
import { beep, noiseBurst, loopStart, musicEvict, sweep } from './audio.js';

const COUNT_STEP = 0.95;
const IGNITION_DUR = 2.0;
// probe-only: ?ascent=N compresses the cruise so deterministic captures don't starve rAF
// probe-only: ?holdCount=1 freezes the countdown at its first numeral for single-frame visual checks
const qParams = new URLSearchParams(location.search);
const ascentQ = Number(qParams.get('ascent'));
const ASCENT_DUR = Number.isFinite(ascentQ) && ascentQ >= 1 && ascentQ <= 60 ? ascentQ : 24;
const ASCENT_COAST = 3.2; // post-burnout tele hold, then hand to TRANSITION (S3)
const HOLDCOUNT = qParams.get('holdCount') === '1';
const CRUISE_DIST = 660;  // world distance streamed over the cruise (planet sweeps mid-way, hole grows ahead)
const CRUISE_TOP = (2 * CRUISE_DIST) / ASCENT_DUR; // peak stream speed — ≈55 u/s at the 24 s cruise
const DRIFT_SPEED = 2.2;  // field drift while holding short of the countdown
const IGN_SPEED = 5;      // field drift while the drive spools
const BAND = 960;         // stream coverage; each group holds a 480-long band and recycles +BAND
const ROCK_N = 40;        // instances per rock band (× 2 counter-rotating bands)
const WRECK_N = 11;       // 8 in the stream + 3 far combat backdrop (Vi3W stage-one props)

const L = {
  ready: false, scene: null, camera: null, ui: null, go: null,
  rocket: null, shipRig: null, shipTilt: null, thruster: null, thrLight: null,
  starsA: null, starsB: null,
  streamA: null, streamB: null, wreckStream: null, wrecks: [], wrecksSeeded: 0,
  planet: null, bh: null, bhDisk: null,
  smoke: null, sparks: null, // idle pools — vacuum: no exhaust particles (probe surface stays honest at 0)
  rumbleBag: null, windBag: null, whooshBag: null,
  phaseT: 0, dist: 0, holdSeconds: 0, lastVelShown: 0,
  camPos: new THREE.Vector3(), tmp: new THREE.Vector3(),
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
const planetTex = () => canvasTex(256, 128, (g) => { // latitude bands: v runs pole to pole
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0.00, '#20304a'); gr.addColorStop(0.45, '#4a6a8f');
  gr.addColorStop(0.62, '#c98a5a'); gr.addColorStop(0.78, '#6e463a'); gr.addColorStop(1.00, '#101820');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  g.globalAlpha = 0.14; g.fillStyle = '#e8d8c0';
  for (const y of [34, 58, 82]) g.fillRect(0, y, 256, 3);
});

/* ---------- pooled sprites (idle in vacuum) ---------- */
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

  // ship rig — the persistent seat: rig (lane) → tilt (π/2: adapter +Y nose → +Z forward,
  // wrap −Z top → +Y up — the combat map) → rocket (wrap: scale + adapter + centered root)
  L.shipRig = new THREE.Group();
  L.shipTilt = new THREE.Group();
  L.shipTilt.rotation.x = Math.PI / 2;
  L.shipRig.add(L.shipTilt);
  L.shipTilt.add(rocket);
  scene.add(L.shipRig);

  // stars — deep space from the first frame; both layers burn at full strength
  const starPositions = (count, rMax, rMin) => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(rMin + Math.random() * (rMax - rMin));
      a.set([v.x, v.y, v.z], i * 3); // full sphere — there is no horizon any more
    }
    return a;
  };
  L.starsA = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPositions(900, 1150, 900), 3)),
    new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 1, depthWrite: false }));
  L.starsB = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPositions(380, 1150, 900), 3)),
    new THREE.PointsMaterial({ color: 0xffffff, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 1, depthWrite: false }));
  scene.add(L.starsA, L.starsB);

  // streaming rock field — two counter-rotating instanced bands; instances keep a radial
  // clearance ≥ 14 from the lane so nothing ever crosses the ship or the cameras
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6257, roughness: 0.95, metalness: 0.05 });
  L.streamA = new THREE.Group(); L.streamB = new THREE.Group();
  L.streamB.position.z = BAND / 2; // band B starts one band-length ahead
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const _e = new THREE.Euler(), _m = new THREE.Matrix4();
  const seedRocks = (mesh) => {
    for (let i = 0; i < ROCK_N; i++) {
      const a = Math.random() * Math.PI * 2, rad = 14 + Math.random() * 46;
      _p.set(Math.cos(a) * rad, Math.sin(a) * rad * 0.7, Math.random() * (BAND / 2));
      _e.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28); _q.setFromEuler(_e);
      _s.setScalar(0.8 + Math.random() * 3.6);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false; // instances spread ±60 — the origin bounds would cull the whole band
  };
  L.rocksA = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_N);
  L.rocksB = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_N);
  seedRocks(L.rocksA); seedRocks(L.rocksB);
  L.streamA.add(L.rocksA); L.streamB.add(L.rocksB);
  L.wreckStream = new THREE.Group();
  L.wreckStream.position.z = BAND / 2;
  scene.add(L.streamA, L.streamB, L.wreckStream);

  // planet (mid-cruise sweep, port side) + black hole (grows ahead through the whole cruise)
  L.planet = new THREE.Mesh(new THREE.SphereGeometry(60, 40, 28), new THREE.MeshBasicMaterial({ map: planetTex() }));
  L.planet.position.set(-95, 26, 260);
  L.bhDisk = new THREE.Mesh(new THREE.TorusGeometry(13, 2.6, 2, 64),
    new THREE.MeshBasicMaterial({ color: 0xffa04a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  L.bhDisk.rotation.x = 1.15;
  L.bhHole = new THREE.Mesh(new THREE.SphereGeometry(7, 32, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  L.bh = new THREE.Group();
  L.bh.add(L.bhHole, L.bhDisk);
  L.bh.position.set(48, 10, 950);
  scene.add(L.planet, L.bh);

  // plume — pivot anchors the cone mouth at the nozzle so scale flicker keeps it welded
  L.thrPivot = new THREE.Group();
  L.thrPivot.position.set(0, -0.8, 0);
  L.thruster = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 2.2, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb469, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide })); // bloom fix: was DoubleSide — both cone walls added together, saturating the core into a bloom halo
  L.thruster.rotation.x = Math.PI;
  L.thruster.position.set(0, -1.12, 0); // mouth ~0.02 below pivot ≈ nozzle lip
  L.thrPivot.add(L.thruster);
  L.thruster.visible = false;
  L.thrLight = new THREE.PointLight(0xffb469, 0, 14, 1.6); // bloom fix: range was 40 — the light washed the whole hull into the bloom halo
  L.thrLight.position.set(0, -0.6, 0);
  L.thrLight.visible = false;
  rocket.add(L.thrPivot, L.thrLight); // plume rides the carrier

  // camera fill — the hull reads against deep space
  scene.add(camera);
  L.camLight = new THREE.PointLight(0xbfd8ff, 22, 20, 2);
  L.camLight.position.set(0, 0.4, 1.8);
  camera.add(L.camLight);
  resetStage(); // seat the ship in the lane for TITLE

  // pools stay constructed but idle — vacuum (§8.6 probe surface keeps its shape)
  L.smoke = makePool(scene, smokeTex(), 60);
  L.sparks = makePool(scene, sparkTex(), 52);
}

/* ---------- shared helpers ---------- */
function resetStage() { // full phase-reset contract (§8.6) — restarts allocate nothing new
  L.phaseT = 0; L.dist = 0; L.holdSeconds = 0; L.lastVelShown = 0; L.lastNumeral = null;
  if (L.shipRig) { L.shipRig.position.set(0, 0, 0); L.shipRig.rotation.set(0, 0, 0); }
  if (L.rocket) { L.rocket.position.set(0, 0, 0); L.rocket.rotation.set(0, 0, 0); }
  if (L.thrPivot) { L.thruster.visible = false; L.thrPivot.scale.setScalar(1); L.thruster.material.opacity = 0.6; }
  if (L.thrLight) { L.thrLight.visible = false; L.thrLight.intensity = 0; }
  if (L.streamA) { L.streamA.position.z = 0; L.streamA.rotation.z = 0; L.streamB.position.z = BAND / 2; L.streamB.rotation.z = 0; L.wreckStream.position.z = BAND / 2; }
  if (L.planet) L.planet.position.set(-95, 26, 260);
  if (L.bh) L.bh.position.set(48, 10, 950);
  L.smoke && L.smoke.clear(); L.sparks && L.sparks.clear();
  musicEvict(0.15); // story-009: engine loops (wind/rumble/whoosh) die — the music bags survive (spec §7)
}

export function stageShip() { // the world-side seat for the hero — clearCombat (REPLAY/restart) lands here
  if (!L.ready || !L.rocket) return;
  L.shipTilt.add(L.rocket); // re-parent out of the combat pose back into the rig
  L.rocket.position.set(0, 0, 0);
  L.rocket.rotation.set(0, 0, 0);
  L.shipRig.position.set(0, 0, 0);
  L.shipRig.rotation.set(0, 0, 0);
  if (L.thruster) { L.thruster.visible = false; L.thrLight.visible = false; }
}

function shakeApply(amp) {
  if (amp <= 0) return;
  const c = L.camera;
  c.position.x += (Math.random() * 2 - 1) * amp;
  c.position.y += (Math.random() * 2 - 1) * amp * 0.7;
  c.position.z += (Math.random() * 2 - 1) * amp;
}

function driftCam(dt, t, close) { // slow orbit around the lane origin — the rig IS the landmark
  const a = 0.55 + t * 0.09;
  const r = close ? 6.4 : 7.4;
  L.camera.position.set(Math.cos(a) * r, (close ? 1.35 : 1.7) + Math.sin(t * 0.13) * 0.3, Math.sin(a) * r);
  L.camera.lookAt(0, 0.25, 0);
}

function streamTick(dt, speed) { // the world moves; the ship holds the lane
  const d = speed * dt;
  L.dist += d;
  L.streamA.position.z -= d; L.streamB.position.z -= d; L.wreckStream.position.z -= d;
  L.planet.position.z -= d; L.bh.position.z -= d;
  if (L.streamA.position.z < -BAND / 2) L.streamA.position.z += BAND; // recycle fully-behind bands — pop lands ≥ 480 out
  if (L.streamB.position.z < -BAND / 2) L.streamB.position.z += BAND;
  if (L.wreckStream.position.z < -BAND / 2) L.wreckStream.position.z += BAND;
  L.streamA.rotation.z += dt * 0.02; // counter-rotating bands — parallax without collisions
  L.streamB.rotation.z -= dt * 0.015;
  for (const w of L.wrecks) { w.g.rotation.x += w.rx * dt; w.g.rotation.y += w.ry * dt; w.g.rotation.z += w.rz * dt; }
  if (L.bhDisk) L.bhDisk.rotation.z += 0.4 * dt;
  if (L.planet) L.planet.rotation.y += 0.008 * dt;
}

/* ---------- Vi3W showcase: stage-one rocket derelicts ---------- */
export function seedWrecks(proto) { // idempotent; silent no-op without a decoded prop
  if (!proto || !L.ready || L.wrecksSeeded) return L.wrecksSeeded;
  const FAR = [[120, 35, 150], [-140, -25, 240], [60, -40, 90]]; // combat backdrop, off-lane, outside the stream
  for (let i = 0; i < WRECK_N; i++) {
    const w = proto.clone(true);
    const far = i >= WRECK_N - 3;
    if (far) {
      w.position.set(...FAR[i - (WRECK_N - 3)]);
      w.scale.multiplyScalar(1.6 + Math.random() * 1.2);
      L.scene.add(w);
    } else {
      const a = Math.random() * Math.PI * 2, rad = 16 + Math.random() * 40;
      w.position.set(Math.cos(a) * rad, Math.sin(a) * rad * 0.7, Math.random() * (BAND / 2));
      w.scale.multiplyScalar(0.8 + Math.random() * 0.9);
      L.wreckStream.add(w);
    }
    w.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 1.2, Math.random() * 6.28, Math.random() * 6.28);
    L.wrecks.push({ g: w, rx: (Math.random() - 0.5) * 0.5, ry: (Math.random() - 0.5) * 0.4, rz: (Math.random() - 0.5) * 0.3 });
  }
  L.wrecksSeeded = WRECK_N;
  return L.wrecksSeeded;
}
export function wreckCount() { return L.wrecksSeeded; }

export function combatFlow(dt, boost01) { // combat keeps the lane — the field drifts past, boost rushes it
  streamTick(dt, 3 + 26 * clamp(boost01 || 0, 0, 1));
}

/* ---------- PHASE: PAD (drift) ---------- */
export function enterPad() {
  resetStage();
  L.windBag = loopStart({ freq: 55, vol: 0.06, playback: 0.5 });
}
export function tickPad(dt, t) {
  L.phaseT += dt;
  streamTick(dt, DRIFT_SPEED);
  driftCam(dt, t, false);
  if (L.phaseT >= 2.6) L.go('countdown');
}

/* ---------- PHASE: COUNTDOWN ---------- */
export function enterCountdown() {
  resetStage();
  L.phaseT = 0;
  L.ui && (L.ui.count.hidden = false, L.ui.tele.hidden = true);
}
export function tickCountdown(dt, t) {
  L.phaseT += dt;
  if (HOLDCOUNT) L.phaseT = 1; // probe: parked inside the first numeral window, phase never escapes
  streamTick(dt, 2.6);
  driftCam(dt, t, true);
  const step = Math.floor(L.phaseT / COUNT_STEP);
  const numeral = step < 3 ? String(3 - step) : '';
  if (numeral && numeral !== L.lastNumeral) {
    L.lastNumeral = numeral;
    L.ui.count.textContent = numeral;
    L.ui.count.classList.remove('pop'); void L.ui.count.offsetWidth; L.ui.count.classList.add('pop');
    beep({ freq: numeral === '1' ? 1320 : 880, vol: 0.3 });
  }
  if (L.phaseT >= COUNT_STEP * 3 + 0.25) { if (L.ui.count) L.ui.count.hidden = true; L.go('ignition'); }
}

/* ---------- PHASE: IGNITION ---------- */
export function enterIgnition() {
  resetStage();
  L.phaseT = 0;
  L.thruster.visible = true; L.thrLight.visible = true;
  noiseBurst({ dur: 1.1, vol: 0.8, f0: 140, f1: 700 });
  L.rumbleBag = loopStart({ freq: 78, vol: 0.16, playback: 0.55 });
}
export function tickIgnition(dt, t) {
  L.phaseT += dt;
  streamTick(dt, IGN_SPEED);
  driftCam(dt, t, true);
  const flick = 0.75 + Math.random() * 0.5;
  L.thrPivot.scale.set((0.5 + L.phaseT * 0.25) * flick, (0.4 + L.phaseT * 0.3) * flick, (0.5 + L.phaseT * 0.25) * flick);
  L.thrLight.intensity = (4 + L.phaseT * 4) * flick; // bloom fix: was (18 + 22·t) — physical light units since three r155 made this blinding
  if (L.rumbleBag) L.rumbleBag.setVol(0.16 + L.phaseT * 0.09);
  shakeApply(0.05);
  if (L.phaseT >= IGNITION_DUR) L.go('ascent');
}

/* ---------- PHASE: ASCENT — THE CRUISE ---------- */
export function enterAscent() {
  resetStage();
  L.phaseT = 0;
  L.thruster.visible = true; L.thrLight.visible = true; L.thrPivot.scale.setScalar(1);
  L.thruster.material.opacity = 0.4; // bloom fix: was 0.62 — the additive cone + nozzle light saturated under bloom
  L.thrLight.intensity = 3;
  L.ui.count.hidden = true; L.ui.tele.hidden = false;
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

  // the drive is lit and the field streams: 0 → CRUISE_TOP (≈55 u/s); the ship holds the lane
  streamTick(dt, done ? CRUISE_TOP : CRUISE_TOP * uu);
  L.shipRig.rotation.z = Math.sin(t * 0.4) * 0.05; // idle bank sway (rotation only — the lane is home)

  // plume flicker — condensed so the hero reads inside the glow
  const flic = 0.9 + Math.random() * 0.2;
  L.thrPivot.scale.set(0.62 * flic, (0.72 + Math.random() * 0.16) * flic, 0.62 * flic);
  L.thruster.material.opacity = 0.4; // bloom fix: was 0.62
  L.thrLight.intensity = 2 + Math.random(); // bloom fix: was 20 + rand*9 — the nozzle light bloomed the hull white

  // chase cam: lagged spring behind-and-above the stern, gentle lateral breathing
  L.tmp.set(Math.sin(t * 0.23) * 1.1, 2.3 + Math.sin(t * 0.31) * 0.2, -8.6);
  const k = 1 - Math.exp(-3.6 * dt);
  L.camPos.lerp(L.tmp, k);
  L.camera.position.copy(L.camPos);
  L.camera.lookAt(0, 0.4, 5); // slightly ahead of the ship — the oncoming field fills the frame

  shakeApply(0.02 * (1 - uu * 0.5)); // early-cruise tremor fading out
  if (L.whooshBag) { L.whooshBag.setFreq(320 + uu * 1500); L.whooshBag.setVol(0.06 + smooth(0, 0.3, uu) * 0.2 - smooth(0.8, 1, uu) * 0.2); }
  if (L.rumbleBag) L.rumbleBag.setVol(0.3 - uu * 0.1);

  // telemetry (8 Hz) — DIST/VEL/THR; the coast holds the burnout velocity — 000000 reads "dead"
  const velOut = done ? L.lastVelShown : Math.max(0, Math.round(CRUISE_TOP * uu * 400 + (Math.random() * 2 - 1) * 40));
  if (!done) L.lastVelShown = velOut;
  if (L.ui.tele && (L.holdSeconds += dt) >= 0.125) {
    L.holdSeconds = 0;
    const distKm = Math.round(L.dist * 0.41);
    const thr = done ? 64 : clamp(Math.round(102 - u * 22 + (Math.random() * 2 - 1) * 1.6), 35, 104);
    L.ui.tele.textContent =
      `DIST ${distKm.toLocaleString('en-US')} km\nVEL ${String(velOut).padStart(6, '0')} m/s\nTHR ${thr} %`;
  }

  // coast hold (tele freeze) ends → hand to TRANSITION (S3)
  if (done && L.phaseT >= ASCENT_DUR + ASCENT_COAST) L.go('transition');
}

/* ---------- cross-phase surfaces ---------- */
export function particleCount() { return (L.smoke ? L.smoke.live : 0) + (L.sparks ? L.sparks.live : 0); }
export function plumeSet({ visible, color } = {}) {
  if (L.thruster) L.thruster.visible = !!visible;
  if (L.thrLight) L.thrLight.visible = !!visible;
  if (color !== undefined && L.thruster) {
    L.thruster.material.color.setHex(color);
    L.thrLight.color.setHex(color);
  }
}
export function ambience() { // kept for combat's entry call — we live in vacuum from the first frame now
  if (L.starsA) { L.starsA.material.opacity = 1; L.starsB.material.opacity = 1; }
}
