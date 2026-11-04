// STAGE TWO — entry, boot, composition root. Banners: BOOT / UI / ROCKET / SCENE / DEBUG / WIRING / GO.
// Story-011 (TD-003): the STORE, PHASES, INPUT and LOOP banners moved verbatim into src/store.js,
// src/phases.js, src/input.js and src/loop.js — wiring via ONE late-bound ctx object (WIRING below).
import { THREE, GLTFLoader, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } from 'stage-two-lib';
import * as LAUNCH from './launch.js';
import * as COMBAT from './combat.js';
import { audioUnlock, isAudioLive, setMuted, isMuted,
  musicState, loopsCount, alarmActive } from './audio.js';
import { adapterRows } from './ship-fix.js';
import { loadAssets, assetReport } from './assets.js';
import { getStorage, readHighscore, writeHighscore } from './store.js';
import { setPhase, initPhases } from './phases.js';
import { input, paused, attachInput, onTitleAction, initInput } from './input.js';
import { loop, fps, dprCtl, initLoop, composerIsDead } from './loop.js';

/* ============================== BOOT ============================== */
const qs = new URLSearchParams(location.search);
const IS_DEBUG = qs.get('debug') === '1';
const CORRUPT_GLB = qs.get('corruptGlb') === '1'; // guard §8.2 probe switch
const SPIN = qs.get('spin') === '1'; // SHIP1: closed orientation viewer — N/T cycle the axes
const GOTO = SPIN ? null : qs.get('goto'); // probe-only: auto-walks a phase path (ignored in SPIN)
// generator always splices this; an unspliced template leaves a placeholder-looking value — treat as unset
const RAW_MODE = (typeof globalThis.__BUILD_MODE === 'string') ? globalThis.__BUILD_MODE : '';
const BUILD_MODE = (!RAW_MODE || RAW_MODE.startsWith('{{')) ? 'bundle' : RAW_MODE;

const DT_CLAMP = 0.05; // §8.1 — a backgrounded tab never teleports the world
const ROCKET_HEIGHT = 1.6; // handoff §5: uniform-scaled hero size
const PERF_T0 = performance.now();
// story-006: boot-time breakdown, ms since module eval — read by tools/boot-marks.mjs (Gate A:
// the 55-60 s boot figure was headless-only; measure the premise where it actually runs)
const BOOT_MARKS = window.__BOOT = { t0: 0 };
BOOT_MARKS.navT0 = Math.round(PERF_T0); // story-006: navigation-start → module eval (HTML parse + bundled deps)
const mark = (k) => { BOOT_MARKS[k] = Math.round(performance.now() - PERF_T0); };
// story-007: storage is lazy — module-scope bodyStart/storeStart/storeEnd marks removed; the marks fire behind the rendered title (src/store.js)
const RESTART_N = Number(qs.get('restartProbe')) || 0; // probe: die→restart ×N baseline check

window.addEventListener('error', (e) => {
  // kee class 6 — failures must keep their evidence; never a bare catch-and-continue
  console.error('[stage2] window error:', e.message, '@', `${e.filename}:${e.lineno}:${e.colno}`);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[stage2] unhandled rejection:', e.reason);
});

/* ============================== UI ============================== */
const $ = (id) => document.getElementById(id);
const ui = {
  webglveil: $('webglveil'), loading: $('loading'), loadingNote: $('loading-note'),
  title: $('title'), hud: $('hud'), debug: $('debug'), toast: $('toast'),
  count: $('count'), tele: $('tele'), warn: $('warn'),
  hsLine: $('hs-line'), btnLaunch: $('btn-launch'), btnSkip: $('btn-skip'),
  hudBars: $('hud-bars'), hudScore: $('hud-score'), reticle: $('reticle'),
  gameover: $('gameover'), goScore: $('go-score'), goHs: $('go-hs'), victory: $('victory'), vicScore: $('vic-score'),
  goReplay: $('go-replay'), goSkip: $('go-skip'), pause: $('pause'), vicTime: $('vic-time'), vicReplay: $('vic-replay'), // story-014 win card
  btnControls: $('btn-controls'), btnReset: $('btn-reset'), btnSound: $('btn-sound'),
  btnCredits: $('btn-credits'), panel: $('panel'), panelTitle: $('panel-title'),
  panelBody: $('panel-body'), panelClose: $('panel-close'), tRec: $('t-rec'),
};

/* ---------- title panels + record reset (G) ---------- */
const PANEL_HTML = {
  CONTROLS:
    '<p><b>W / S</b> — throttle &amp; brake &nbsp;·&nbsp; <b>A / D</b> — turn left / right</p>' +
    '<p><b>MOUSE</b> — steer &nbsp;·&nbsp; <b>LMB</b> — fire guns &nbsp;·&nbsp; <b>SPACE / SHIFT</b> — boost</p>' +
    '<p><b>P / ESC</b> — pause &nbsp;·&nbsp; <b>M</b> — mute &nbsp;·&nbsp; <b>ENTER</b> — launch</p>' +
    '<p class="t-note">Drones ram. Shields regen after 3 clean seconds. The field flows faster while you boost.</p>',
  CREDITS:
    '<p><b>MODELS</b> — hero ship + stage-one rocket made in <b>Vi3W</b> (app.vi3w.in)</p>' +
    '<p><b>FONTS</b> — Orbitron, Rajdhani (SIL OFL 1.1, Google Fonts)</p>' +
    '<p><b>SFX / MUSIC</b> — procedural synth; Kenney CC0 pack pending handoff</p>' +
    '<p class="t-note">Full license log: CREDITS.md in the repo.</p>',
};
function openPanel(name) {
  if (probs.phase !== 'title') return;
  ui.panelTitle.textContent = name;
  ui.panelBody.innerHTML = PANEL_HTML[name] || '';
  ui.panel.hidden = false;
}
function closePanel() { if (ui.panel) ui.panel.hidden = true; }
function refreshSoundButton() {
  if (ui.btnSound) ui.btnSound.textContent = `[ SOUND: ${isMuted() ? 'OFF' : 'ON'} ]`;
}
function refreshRecordLine() {
  if (ui.hsLine) ui.hsLine.textContent = `HIGH SCORE — ${readHighscore()}`;
  if (ui.tRec) ui.tRec.textContent = `RECORD ${readHighscore()}`;
}
let resetArmT = 0;
function onResetClick() { // arm-then-confirm — the saved record is never destroyed by one stray click
  if (probs.phase !== 'title') return;
  if (!ui.btnReset.classList.contains('armed')) {
    ui.btnReset.classList.add('armed');
    ui.btnReset.textContent = '[ SURE? CLICK AGAIN ]';
    window.clearTimeout(resetArmT);
    resetArmT = window.setTimeout(disarmReset, 3200);
    return;
  }
  disarmReset();
  writeHighscore(0);
  refreshRecordLine();
  toast('RECORD CLEARED');
}
function disarmReset() {
  window.clearTimeout(resetArmT);
  if (!ui.btnReset) return;
  ui.btnReset.classList.remove('armed');
  ui.btnReset.textContent = '[ RESET RECORD ]';
}

// overlay policy (story-001): a phase change hides EVERY overlay; the entering phase
// re-declares what it shows. Kills the stuck-layer class at the root — no phase can
// leave a stale layer up (title-on-SKIRMISH, the old death-card hide gap, ...).
const OVERLAY_ELMS = [ui.title, ui.hud, ui.gameover, ui.victory, ui.pause, ui.loading, ui.warn,
  $('combat-online'), $('go-logo'), $('flash')].filter(Boolean);

let toastTimer = 0;
function toast(msg, ms = 2400) {
  if (!ui.toast) return;
  ui.toast.textContent = msg;
  ui.toast.classList.add('on');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.remove('on'), ms);
}

/* ============================== ROCKET ============================== */
const probs = { phase: 'boot', rocket: 'none', tex: 0, particles: 0, post: 'off' }; // post: story-008 bloom probe

// SHIP1 — orientation fix table. nose/top name the RAW GLB axes; the adapter rotation
// maps nose -> +Y and top -> -Z (combat tilt gives +Z forward / +Y up). ?debug=1&spin=1 cycles them.
const MODEL_FIX = { nose: '-Z', top: '+Y', metalness: 0.3, roughness: 0.6 }; // SHIP1 guess — human confirms
const activeFix = { ...MODEL_FIX }; // what the adapter applies right now (N/T update it)
let shipAdapter = null; // set by prepareRocket; N/T re-applies the fix to this group
const rocketShape = { size: null, center: null, metalness: null, roughness: null }; // metrics probe

function b64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function loadRocket() {
  mark('heroB64Start');
  let buffer = b64ToArrayBuffer(globalThis.__GLB_B64 ?? '');
  mark('heroB64'); // base64 → ArrayBuffer, kept separate from GLTF.parse cost
  if (CORRUPT_GLB) buffer = buffer.slice(0, 4096); // probe: loses the GLB magic → decode must fail loudly
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    mark('heroParseStart');
    loader.parse(buffer, '', (gltf) => {
      mark('heroParse'); // GLTF.parse main-thread decode only — prepare measured separately
      const root = gltf && gltf.scene ? gltf.scene : null;
      if (!root) { reject(new Error('GLB parsed but scene root missing')); return; }
      try { resolve(prepareRocket(root)); } catch (err) { reject(err); }
    }, (err) => reject(err instanceof Error ? err : new Error(String(err && err.message || err))));
  });
}

function applyShipFix(adapter, nose, top) {
  try {
    const r = adapterRows(nose, top); // row-major rows of the adapter rotation
    adapter.quaternion.setFromRotationMatrix(new THREE.Matrix4().set(
      r[0], r[1], r[2], 0,
      r[3], r[4], r[5], 0,
      r[6], r[7], r[8], 0,
      0, 0, 0, 1,
    ));
  } catch (err) { // a bad MODEL_FIX pair must never kill the game — identity + evidence
    console.error('[stage2] bad ship fix pair:', nose, top, '—', err.message, '(identity used)');
    adapter.quaternion.identity();
  }
}

function measureShip(wrap) { // wrap-frame metrics — position-independent, valid in any phase
  wrap.updateMatrixWorld(true);
  const b = new THREE.Box3();
  wrap.traverse((o) => { if (o.isMesh) b.expandByObject(o); }); // meshes only — the spin AxesHelper must not pollute the numbers
  if (b.isEmpty()) { rocketShape.size = null; rocketShape.center = null; return; }
  const s = b.getSize(new THREE.Vector3());
  rocketShape.size = [+s.x.toFixed(3), +s.y.toFixed(3), +s.z.toFixed(3)];
  rocketShape.center = b.getCenter(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3));
}

function prepareRocket(root) {
  // measured GLB truth (handoff §3): POSITION+TEXCOORD_0 present, NORMAL missing → compute
  const tNorm = performance.now(); // story-006: normals sweep cost, accumulated across both models
  root.traverse((o) => {
    if (o.isMesh && o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    if (o.isMesh && o.material?.map?.isTexture) probs.tex = 1;
  });
  BOOT_MARKS.normalsMs = (BOOT_MARKS.normalsMs || 0) + Math.round(performance.now() - tNorm);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const rawLongest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(rawLongest) || rawLongest <= 0) throw new Error('GLB bounds collapsed (no usable axis)');

  // SHIP1 adapter chain: wrap(scale) -> adapter(quaternion ONLY) -> root(centered, raw
  // frame). Scale and centering stay on the SAME nodes as before, so the plume welded
  // to the wrap by launch.js keeps both position and scale. Scale uses the RAW longest
  // side — a wrong nose guess can then never produce a 4x giant.
  const adapter = new THREE.Group();
  const wrap = new THREE.Group();
  adapter.add(root);
  wrap.add(adapter);
  applyShipFix(adapter, activeFix.nose, activeFix.top);
  shipAdapter = adapter;
  if (SPIN) adapter.add(new THREE.AxesHelper(0.5)); // SHIP1: arrows ride the raw frame
  root.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-1); // centered on origin
  wrap.scale.setScalar(ROCKET_HEIGHT / rawLongest); // uniform → longest side = 1.6, base at -0.8

  // glTF default metalness 1.0 + no scene.environment = a black hull under direct
  // lights only — retune this ship, and log the originals (patch 2e)
  if (!scene || !scene.environment) {
    root.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) {
        if (!m.isMeshStandardMaterial) continue;
        if (rocketShape.metalness === null) {
          console.info(`[stage2] ship material: metalness ${m.metalness} roughness ${m.roughness} -> ${MODEL_FIX.metalness}/${MODEL_FIX.roughness}`);
          rocketShape.metalness = MODEL_FIX.metalness;
          rocketShape.roughness = MODEL_FIX.roughness;
        }
        m.metalness = MODEL_FIX.metalness;
        m.roughness = MODEL_FIX.roughness;
      }
    });
  }

  measureShip(wrap);
  probs.rocket = 'glb';
  return wrap;
}

function loadPropRocket() { // Vi3W showcase prop — the stage-one rocket returns as derelicts.
  // Optional by design: missing token or a bad decode resolves null (empty sky), never a crash.
  const b64 = globalThis.__ROCKET_OLD_B64;
  if (!b64) return Promise.resolve(null);
  mark('propB64Start');
  const propBuffer = b64ToArrayBuffer(b64);
  mark('propB64');
  const loader = new GLTFLoader();
  return new Promise((resolve) => {
    mark('propParseStart');
    loader.parse(propBuffer, '', (gltf) => {
      mark('propParse');
      const root = gltf && gltf.scene ? gltf.scene : null;
      resolve(root ? preparePropRocket(root) : null);
    }, () => resolve(null));
  });
}

function preparePropRocket(root) { // same hygiene as the hero, no adapter: raw +Y nose, per-wreck rotations
  root.traverse((o) => {
    if (o.isMesh && o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
  });
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  const wrap = new THREE.Group();
  if (Number.isFinite(longest) && longest > 0) {
    wrap.scale.setScalar(ROCKET_HEIGHT / longest); // same 1.6 normalization as the hero
    root.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-1);
    wrap.add(root);
  } else wrap.add(root);
  return wrap;
}

function makeFallbackRocket() { // §8.2 — decode failure still ships a flyable rocket
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xd8dee8, roughness: 0.45, metalness: 0.15 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xff5238, roughness: 0.55 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.175, 1.0, 20), hull);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 20), trim); nose.position.y = 0.72;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.22, 0.15, 20), hull); skirt.position.y = -0.57;
  g.add(body, nose, skirt);
  for (const [x, z] of [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), trim);
    fin.position.set(x, -0.34, z); g.add(fin);
  }
  return g;
}

/* ---------- SHIP1 spin viewer (?debug=1&spin=1) — closed: title actions dead ---------- */
let spinRig = null;
function setupSpinViewer() {
  if (!rocket) return;
  if (ui.title) ui.title.hidden = true;
  rocket.position.set(0, 0, 0);
  rocket.rotation.set(0, 0, 0);
  const sway = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.x = Math.PI / 2; // combat's map: adapter +Y nose -> +Z forward, -Z top -> +Y up
  sway.add(tilt);
  tilt.add(rocket); // the wrap; the plume welded to it stays invisible here
  scene.add(sway);
  spinRig = { sway };
  const label = document.createElement('div'); // DOM label without touching the template
  label.id = 'spin-label';
  label.style.cssText = 'position:fixed;left:0;right:0;bottom:14px;text-align:center;' +
    'color:#bfe9ff;font:16px/1.5 monospace;text-shadow:0 1px 2px #000;z-index:30;pointer-events:none;';
  document.body.appendChild(label);
  updateSpinLabel();
}
function updateSpinLabel() {
  const el = document.getElementById('spin-label');
  if (el) el.textContent = `nose=${activeFix.nose} top=${activeFix.top}  [N] next nose  [T] next top`;
}
function applySpinFix() { // N/T: re-apply rotation, re-measure, refresh the label
  if (shipAdapter) applyShipFix(shipAdapter, activeFix.nose, activeFix.top);
  if (rocket) measureShip(rocket);
  updateSpinLabel();
}

/* ============================== SCENE ============================== */
let renderer, scene, camera, rocket = null;
let composer = null, bloomPass = null; // story-008: post chain — null keeps the direct-render fallback alive
const game = { time: 0, timeScale: 1 }; // timeScale <1 = death slow-mo (combat)

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function boot() {
  mark('bootStart'); // story-006
  loadAssets(); // fonts register async — the system stack reads until they land (display: swap)
  if (document.fonts) document.fonts.ready.then(() => mark('fonts')); // story-006
  mark('rendererStart'); // story-006: the 4.1 s pre-mark gap suspect — D3D/WebGL device creation
  renderer = new THREE.WebGLRenderer({
    canvas: $('scene-canvas'), antialias: true, alpha: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // §10: DPR cap 2 (auto-degrade below: dprTick)
  renderer.setSize(window.innerWidth, window.innerHeight);
  mark('renderer'); // story-006: WebGL/D3D device creation cost
  window.addEventListener('resize', onResize);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 4000);
  camera.position.set(2.4, 0.9, 3.4);

  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x2a1c12, 1.05));
  const key = new THREE.DirectionalLight(0xfff2df, 1.6); key.position.set(2.5, 3, 2); scene.add(key);
  const rim = new THREE.DirectionalLight(0x7dd7ff, 0.5); rim.position.set(-2, 1.4, -2.5); scene.add(rim);
  const dawn = new THREE.DirectionalLight(0xff9d54, 0.9); dawn.position.set(-7, 1.4, 5); scene.add(dawn);

  // story-008: bloom post chain — high threshold so only emissive/additive content blooms.
  // §8.3 never-crash: a composer failure (old GPU) logs once and keeps the direct-render path.
  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.4, 0.85); // strength/radius/threshold
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    probs.post = 'bloom';
  } catch (err) {
    composer = null;
    bloomPass = null;
    console.error('[stage2] post chain disabled — direct render fallback. reason:', err && (err.message || err));
  }

  attachInput(); // story-011: the same key/pointer/blur listeners, registered in the same order
  ui.btnLaunch?.addEventListener('click', () => onTitleAction('launch'));
  ui.btnSkip?.addEventListener('click', () => onTitleAction('skip'));
  ui.btnControls?.addEventListener('click', () => openPanel('CONTROLS'));
  ui.btnCredits?.addEventListener('click', () => openPanel('CREDITS'));
  ui.btnReset?.addEventListener('click', onResetClick);
  ui.btnSound?.addEventListener('click', () => { setMuted(!isMuted()); refreshSoundButton(); });
  ui.panelClose?.addEventListener('click', closePanel);
  ui.goReplay?.addEventListener('click', () => setPhase('pad')); ui.vicReplay?.addEventListener('click', () => setPhase('pad')); // story-014: both cards' REPLAY — same pad landing
  ui.goSkip?.addEventListener('click', () => setPhase('combat'));

  setPhase('loading');
  window.setTimeout(() => { // §6: LOADING only shows if decode takes perceptible time
    if (probs.phase === 'loading' && ui.loading) { ui.loading.hidden = false; mark('veilShown'); }
  }, 350);

  // both GLBs decode before any phase runs — the restart probe snapshots entity counts,
  // so the derelicts must exist before combat can ever be entered (deterministic probes)
  Promise.all([
    loadRocket().catch((err) => {
      console.error('[stage2] GLB decode failed — using primitive fallback. reason:', err && (err.message || err));
      return null;
    }),
    loadPropRocket(),
  ]).then(([r, prop]) => {
    mark('glbsDone'); // both decodes + preparation complete
    if (r) { rocket = r; probs.rocket = 'glb'; }
    else { probs.rocket = 'fallback'; rocket = makeFallbackRocket(); }
    scene.add(rocket);
    LAUNCH.prepareLaunch(scene, camera, rocket, ui, (name) => setPhase(name));
    if (prop) console.info(`[stage2] Vi3W derelicts seeded: ${LAUNCH.seedWrecks(prop)}`);
    setPhase('title');
    mark('title'); // title overlay live — the first thing a player can act on
    // story-007: warm storage behind the rendered title — the cold-profile probe (3-5 s) lands
    // after first paint, then the HIGH SCORE line re-renders with the saved value
    window.setTimeout(() => { mark('storeStart'); getStorage(); mark('storeEnd'); refreshRecordLine(); }, 0);
    if (SPIN) setupSpinViewer(); // after title.enter — it re-hides the overlay (closed viewer)
    if (GOTO === 'launch') window.setTimeout(() => setPhase('pad'), 200);
    if (GOTO === 'transition') window.setTimeout(() => setPhase('transition'), 200);
    if (GOTO === 'combat') window.setTimeout(() => setPhase('combat'), 200);
    console.log(`[stage2] ready — mode:${BUILD_MODE} rocket:${probs.rocket} in ${(performance.now() - PERF_T0) | 0}ms`);
  });
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer && !composerIsDead()) composer.setSize(window.innerWidth, window.innerHeight); // §8.5: post chain tracks the buffer (story-008); review finding 5: the TD-013 latch guards this touch too
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function countMeshes() { let n = 0; if (scene) scene.traverse((o) => { if (o.isMesh) n++; }); return n; }

/* ============================== DEBUG (§8.8) ============================== */
let dbgAccum = 0;
function updateDebug(dt, ts) {
  if (!IS_DEBUG) { return; }
  if (ui.debug && ui.debug.hidden) ui.debug.hidden = false;
  dbgAccum += dt;
  if (dbgAccum < 0.25) return;
  dbgAccum = 0;
  const sub = probs.sub && probs.sub.beat ? '/' + probs.sub.beat : '';
  let combatLine = '';
  if (probs.phase === 'combat' || probs.phase === 'gameover') {
    const cs = COMBAT.combatState();
    combatLine = `\nhull ${fmtN(cs.hp)} · shield ${fmtN(cs.shield)}\nscore ${fmtN(cs.score)} · wave ${fmtN(cs.wave)} · kills ${fmtN(cs.kills)}\nenemies ${fmtN(cs.enemies)} · bolts ${fmtN(cs.bolts)} · boom ${fmtN(cs.particles)}`;
  }
  const mLine = rocketShape.size
    ? `\nshipfix ${activeFix.nose}/${activeFix.top} size [${rocketShape.size.join(', ')}] center [${rocketShape.center.join(', ')}]`
    : '';
  if (ui.debug) ui.debug.textContent =
    `S4 v0.3.0 (${BUILD_MODE})\nfps ${fps.read}\nphase ${probs.phase}${sub}\nrocket ${probs.rocket}${probs.tex ? '+tex' : ''}${mLine}\n` +
    `entities ${countMeshes()} · wrecks ${LAUNCH.wreckCount ? LAUNCH.wreckCount() : 0} · particles ${LAUNCH.particleCount ? LAUNCH.particleCount() : 0}\naudio ${isAudioLive() ? 'live' : 'locked'} · post ${probs.post}${combatLine}`;
}

const fmtN = (n) => (Number.isFinite(n) ? Math.floor(n) : 0);

window.__stage2 = {
  version: 's4', mode: BUILD_MODE,
  get phase() { return probs.phase; },
  get fps() { return fps.read; },
  get dpr() { return dprCtl.cur; },
  get post() { return probs.post; }, // story-008: 'bloom' | 'off'
  assets: () => assetReport(),
  get rocket() { return probs.rocket; },
  hasTexture: () => probs.tex === 1,
  camPos: () => (camera ? camera.position.toArray().map((v) => +v.toFixed(3)) : null),
  rocketY: () => (rocket ? +rocket.position.y.toFixed(3) : null),
  audioLive: () => isAudioLive(),
  musicState: () => musicState(), // story-009: current music target 'title' | 'combat' | 'none'
  loopsCount: () => loopsCount(), // story-009: live loop bags — the leak probe's counter
  alarmActive: () => alarmActive(), // story-009: low-hull alarm latch
  get entities() { return countMeshes(); },
  get wrecks() { return LAUNCH.wreckCount ? LAUNCH.wreckCount() : 0; },
  get particles() { return LAUNCH.particleCount ? LAUNCH.particleCount() : probs.particles; },
  get highscore() { return readHighscore(); },
  combatState: () => (COMBAT.combatState ? COMBAT.combatState() : null), probeDamagePlayer: (n) => COMBAT.probeDamagePlayer(n), // story-014: forces the player death INSIDE the boss's 1.2 s death cinematic (double-fire assert)
  get time() { return game.time; },
  get paused() { return paused; },
  get muted() { return isMuted(); },
  bootMs: () => Math.round(performance.now() - PERF_T0),
  // SHIP1: numbers-only orientation check (patch C). plumeAnchorY lists the y of every
  // group riding the wrap — expect [-0.8] (the plume pivot) once launch.js welds it.
  rocketMetrics: () => ({
    size: rocketShape.size,
    center: rocketShape.center,
    metalness: rocketShape.metalness,
    roughness: rocketShape.roughness,
    shipFix: { ...activeFix },
    plumeAnchorY: rocket ? rocket.children.filter((c) => c.isGroup).map((c) => +c.position.y.toFixed(2)) : null,
  }),
};

/* ============================== WIRING (story-011) ============================== */
// ONE context object, filled once here and shared by the extracted modules (store.js needs
// none). Scene-owned values are getters: boot() assigns them asynchronously, so consumers
// read the CURRENT bindings at call time — never a stale copy.
const ctx = {
  SPIN, DT_CLAMP, RESTART_N, ui, probs, game, OVERLAY_ELMS, input, mark,
  countMeshes, closePanel, disarmReset, refreshRecordLine, refreshSoundButton, applySpinFix, updateDebug,
  get scene() { return scene; }, get camera() { return camera; }, get rocket() { return rocket; },
  get renderer() { return renderer; }, get composer() { return composer; },
  get bloomPass() { return bloomPass; }, get spinRig() { return spinRig; },
};
initPhases(ctx); initInput(ctx); initLoop(ctx);

/* ============================== GO ============================== */
mark('preBoot'); // story-006: end of module-body evaluation
if (!webglAvailable()) { // §8.10 — no GPU → friendly veil, nothing else runs
  if (ui.webglveil) ui.webglveil.hidden = false;
  console.warn('[stage2] no WebGL — veil shown, game not started');
} else {
  mark('probe'); // webglAvailable() done — canvas getContext probe measured
  boot();
  window.requestAnimationFrame(loop);
  const unlock = () => audioUnlock(); // any first gesture owns the audio contract
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}
