// STAGE TWO — entry, loop, phase machine. Banners: BOOT / UI / STORE / PHASES / ROCKET / SCENE / INPUT / LOOP / DEBUG.
// Slice 1 scope: boot spike, GLB rocket (with fallback), TITLE, LOADING overlay, debug overlay.
import { THREE, GLTFLoader } from 'stage-two-lib';
import * as LAUNCH from './launch.js';
import * as TRANSITION from './transition.js';
import * as COMBAT from './combat.js';
import { audioUnlock, isAudioLive, audioSuspend, audioResume, setMuted, isMuted } from './audio.js';
import { adapterRows, nextNose, nextTop } from './ship-fix.js';
import { loadAssets, assetReport } from './assets.js';

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
  gameover: $('gameover'), goScore: $('go-score'), goHs: $('go-hs'),
  goReplay: $('go-replay'), goSkip: $('go-skip'), pause: $('pause'),
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
const OVERLAY_ELMS = [ui.title, ui.hud, ui.gameover, ui.pause, ui.loading, ui.warn,
  $('combat-online'), $('go-logo'), $('flash')].filter(Boolean);

let toastTimer = 0;
function toast(msg, ms = 2400) {
  if (!ui.toast) return;
  ui.toast.textContent = msg;
  ui.toast.classList.add('on');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.remove('on'), ms);
}

/* ============================== STORE (§8.4) ============================== */
const storage = (() => {
  try {
    window.localStorage.setItem('__s2_probe', '1');
    window.localStorage.removeItem('__s2_probe');
    return { get: (k) => window.localStorage.getItem(k), set: (k, v) => window.localStorage.setItem(k, v) };
  } catch (e) {
    // private mode / blocked storage — session-only memory; never crash on storage
    const mem = new Map();
    console.warn('[stage2] localStorage blocked; high score is session-only:', e && e.message);
    return { get: (k) => (mem.has(k) ? mem.get(k) : null), set: (k, v) => { mem.set(k, String(v)); } };
  }
})();
const HIGHSCORE_KEY = 'stage2.highscore';
function readHighscore() {
  try {
    const n = Number(JSON.parse(storage.get(HIGHSCORE_KEY) ?? '0'));
    return Number.isFinite(n) && n >= 0 ? n : 0; // corrupt values read as 0, never NaN (§8.9)
  } catch { return 0; }
}
function writeHighscore(n) {
  try { storage.set(HIGHSCORE_KEY, String(Math.max(0, Math.floor(Number(n) || 0)))); } catch { /* memory already holds it */ }
}

/* ============================== PHASES ============================== */
const PHASES = {
  loading: { enter() { if (ui.title) ui.title.hidden = true; } },
  title: {
    enter() {
      if (ui.loading) ui.loading.hidden = true;
      if (ui.title) { ui.title.hidden = false; refreshRecordLine(); }
      closePanel();
      disarmReset();
      refreshSoundButton();
      if (ui.hud) ui.hud.hidden = true;
    },
  },
  pad: {
    enter() {
      COMBAT.clearCombat(); // death card REPLAY lands here — re-seat the rocket from the combat pose (§8.6)
      if (ui.gameover) ui.gameover.hidden = true; // setPhase is exit-before-enter: gameover.exit never runs on the way out
      ui.title.hidden = true; ui.hud.hidden = false; LAUNCH.enterPad(); TRANSITION.hudAssemble(false);
    },
  },
  countdown: { enter() { ui.hud.hidden = false; LAUNCH.enterCountdown(); } }, // sweep would orphan it — re-show (story-001)
  ignition: { enter() { ui.hud.hidden = false; LAUNCH.enterIgnition(); } },
  ascent: { enter() { ui.hud.hidden = false; LAUNCH.enterAscent(); } },
  transition: {
    enter() {
      ui.hud.hidden = false; // numerals/tele/reticle live inside #hud — the sweep must not orphan it
      TRANSITION.enterTransition(scene, camera, rocket, ui, {
        go: (n) => setPhase(n),
        report: (r) => { probs.sub = r; window.__stage2.lastReport = r; },
      });
    },
  },
  combat: {
    enter() {
      TRANSITION.clearTransition(); // central teardown — skip-mid-beat leaves nothing behind
      probs.sub = null;
      window.__stage2.combatEntries = (window.__stage2.combatEntries || 0) + 1;
      if (ui.gameover) ui.gameover.hidden = true; // death-card SKIP lands here — same exit-before-enter gap as pad.enter
      LAUNCH.ambience(true); // vacuum: stars on, dawn off
      if (ui.hud) ui.hud.hidden = false; // gameover/title hide it; combat owns the bars
      TRANSITION.hudAssemble(true); // SKIRMISH lands without beat B2 — the reticle assembles on entry (story-001)
      COMBAT.enterCombat(scene, camera, rocket, ui, combatApi());
      if (RESTART_N && RP.left > 0) window.setTimeout(rpOnCombat, 700);
    },
    exit() { COMBAT.clearCombat(); }, // any exit drains pools — no spawn-during-restart (§8.6)
  },
  gameover: {
    enter() {
      game.timeScale = 1; // card reads in real time; restarts must never inherit slow-mo
      const finalScore = COMBAT.combatState().score;
      writeHighscore(Math.max(finalScore, readHighscore()));
      if (ui.goScore) ui.goScore.textContent = `SCORE — ${finalScore}`;
      if (ui.goHs) ui.goHs.textContent = `HIGH SCORE — ${readHighscore()}`;
      if (ui.hud) ui.hud.hidden = true;
      if (ui.gameover) ui.gameover.hidden = false;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (RESTART_N && RP.left > 0) window.setTimeout(rpOnGameover, 400);
    },
    exit() { if (ui.gameover) ui.gameover.hidden = true; },
  },
};
function setPhase(name) {
  const hook = PHASES[name];
  if (!hook) { console.error(`[stage2] unknown phase "${name}" — refused`); return false; } // §10: a phase always lands
  if (hook.exit) hook.exit();
  probs.phase = name;
  for (const elm of OVERLAY_ELMS) elm.hidden = true; // overlay sweep (story-001)
  document.body.classList.toggle('playing', PLAYING_PHASES.has(name)); // cursor:none rides the play phases
  hook.enter?.();
  return true;
}
const PLAYING_PHASES = new Set(['pad', 'countdown', 'ignition', 'ascent', 'transition', 'combat']);

/* ---------- combat API + restart probe (?restartProbe=N) ---------- */
const RP = { left: RESTART_N, entries: [], ref: null };
function combatApi() {
  return {
    go: (n) => setPhase(n),
    report: (r) => { probs.sub = r; window.__stage2.lastReport = r; },
    input,
    setTimeScale: (v) => { game.timeScale = Number.isFinite(v) ? v : 1; },
    getTimeScale: () => game.timeScale,
  };
}
function rpOnCombat() { // fires 700 ms into a probed combat entry
  if (probs.phase !== 'combat') return;
  const cs = COMBAT.combatState();
  RP.entries.push({ hp: cs.hp, shield: cs.shield, score: cs.score, wave: cs.wave,
    particles: cs.particles, bolts: cs.bolts, entities: countMeshes() });
  if (!RP.ref) RP.ref = { entities: RP.entries[0].entities }; // run 1 only primes the lazy pools
  COMBAT.probeDamagePlayer(500); // forced death → slow-mo → gameover
}
function rpOnGameover() {
  if (probs.phase !== 'gameover') return;
  RP.left--;
  if (RP.left > 0) { setPhase('combat'); return; }
  const tail = RP.entries.slice(1);
  const clean = tail.length > 0 && tail.every((s) =>
    s.hp === 100 && s.shield === 50 && s.score === 0 && s.particles === 0 &&
    s.bolts === 0 && s.entities === RP.ref.entities);
  window.__stage2.restartProbe = { runs: RP.entries.length, left: RP.left, clean, entries: RP.entries };
  document.title = 'RESTART_PROBE ' + JSON.stringify({ runs: RP.entries.length, clean });
}

/* ============================== ROCKET ============================== */
const probs = { phase: 'boot', rocket: 'none', tex: 0, particles: 0 };

// SHIP1 — orientation fix table. nose/top name the RAW GLB axes; the adapter rotation
// maps nose -> +Y and top -> -Z (combat tilt then gives +Z forward / +Y up).
// Set via ?debug=1&spin=1 (N cycles nose, T cycles top); the confirmed pair lands here.
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
  let buffer = b64ToArrayBuffer(globalThis.__GLB_B64 ?? '');
  if (CORRUPT_GLB) buffer = buffer.slice(0, 4096); // probe: loses the GLB magic → decode must fail loudly
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(buffer, '', (gltf) => {
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
  root.traverse((o) => {
    if (o.isMesh && o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    if (o.isMesh && o.material?.map?.isTexture) probs.tex = 1;
  });
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
  const loader = new GLTFLoader();
  return new Promise((resolve) => {
    loader.parse(b64ToArrayBuffer(b64), '', (gltf) => {
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
const game = { time: 0, timeScale: 1 }; // timeScale <1 = death slow-mo (combat)

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function boot() {
  loadAssets(); // fonts register async — the system stack reads until they land (display: swap)
  renderer = new THREE.WebGLRenderer({
    canvas: $('scene-canvas'), antialias: true, alpha: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // §10: DPR cap 2 (auto-degrade below: dprTick)
  renderer.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', onResize);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 4000);
  camera.position.set(2.4, 0.9, 3.4);

  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x2a1c12, 1.05));
  const key = new THREE.DirectionalLight(0xfff2df, 1.6); key.position.set(2.5, 3, 2); scene.add(key);
  const rim = new THREE.DirectionalLight(0x7dd7ff, 0.5); rim.position.set(-2, 1.4, -2.5); scene.add(rim);
  const dawn = new THREE.DirectionalLight(0xff9d54, 0.9); dawn.position.set(-7, 1.4, 5); scene.add(dawn);

  window.addEventListener('keydown', onKeydown);
  window.addEventListener('keyup', onKeyup);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  ui.btnLaunch?.addEventListener('click', () => onTitleAction('launch'));
  ui.btnSkip?.addEventListener('click', () => onTitleAction('skip'));
  ui.btnControls?.addEventListener('click', () => openPanel('CONTROLS'));
  ui.btnCredits?.addEventListener('click', () => openPanel('CREDITS'));
  ui.btnReset?.addEventListener('click', onResetClick);
  ui.btnSound?.addEventListener('click', () => { setMuted(!isMuted()); refreshSoundButton(); });
  ui.panelClose?.addEventListener('click', closePanel);
  ui.goReplay?.addEventListener('click', () => setPhase('pad'));
  ui.goSkip?.addEventListener('click', () => setPhase('combat'));

  setPhase('loading');
  window.setTimeout(() => { // §6: LOADING only shows if decode takes perceptible time
    if (probs.phase === 'loading' && ui.loading) ui.loading.hidden = false;
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
    if (r) { rocket = r; probs.rocket = 'glb'; }
    else { probs.rocket = 'fallback'; rocket = makeFallbackRocket(); }
    scene.add(rocket);
    LAUNCH.prepareLaunch(scene, camera, rocket, ui, (name) => setPhase(name));
    if (prop) console.info(`[stage2] Vi3W derelicts seeded: ${LAUNCH.seedWrecks(prop)}`);
    setPhase('title');
    if (SPIN) setupSpinViewer(); // after title.enter — it re-hides the overlay (closed viewer)
    if (GOTO === 'launch') window.setTimeout(() => setPhase('pad'), 200);
    if (GOTO === 'transition') window.setTimeout(() => setPhase('transition'), 200);
    if (GOTO === 'combat') window.setTimeout(() => setPhase('combat'), 200);
    console.log(`[stage2] ready — mode:${BUILD_MODE} rocket:${probs.rocket} in ${(performance.now() - PERF_T0) | 0}ms`);
  });
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix(); // §8.5: composer+bloom resize land with the post chain (S4)
}

function countMeshes() { let n = 0; if (scene) scene.traverse((o) => { if (o.isMesh) n++; }); return n; }

/* ---------- DPR auto-degrade (feel: sustained slow frames step the buffer down) ---------- */
const dprCtl = { cap: Math.min(window.devicePixelRatio || 1, 2), cur: Math.min(window.devicePixelRatio || 1, 2), lowT: 0, highT: 0 };
function setDpr(v) {
  dprCtl.cur = v;
  renderer.setPixelRatio(v);
  renderer.setSize(window.innerWidth, window.innerHeight); // buffer size must be reapplied after a ratio change
}
function dprTick(dt) { // raw dt (unscaled) — slow-mo must not fake slowness
  const f = fps.read;
  if (f < 45) { dprCtl.lowT += dt; dprCtl.highT = 0; }
  else if (f >= 50) { dprCtl.highT += dt; dprCtl.lowT = 0; }
  else { dprCtl.lowT = 0; dprCtl.highT = 0; } // hold in the 45–50 band — only SUSTAINED dips degrade
  if (dprCtl.lowT >= 2 && dprCtl.cur > 1) { setDpr(Math.max(1, +(dprCtl.cur - 0.5).toFixed(1))); dprCtl.lowT = 0; }
  else if (dprCtl.highT >= 10 && dprCtl.cur < dprCtl.cap) { setDpr(Math.min(dprCtl.cap, +(dprCtl.cur + 0.5).toFixed(1))); dprCtl.highT = 0; }
}

/* ============================== INPUT ============================== */
// shared input state — combat consumes it; every listener only records, never interprets
const input = { keys: new Set(), mouse: { x: 0, y: 0 }, mouseActive: false, fire: false, boost: false, px: { x: 0, y: 0 } };
let paused = false;

function setPaused(p) {
  if (probs.phase !== 'combat') return;
  paused = p;
  if (ui.pause) ui.pause.hidden = !p;
  if (p) audioSuspend(); else audioResume(); // pause suspends the audio clock (spec #7)
}

function onKeydown(e) {
  input.keys.add(e.code);
  if (SPIN && probs.phase === 'title') { // closed viewer: N/T only — Enter can never launch
    if (e.code === 'KeyN') { Object.assign(activeFix, nextNose(activeFix.nose, activeFix.top)); applySpinFix(); }
    else if (e.code === 'KeyT') { Object.assign(activeFix, nextTop(activeFix.nose, activeFix.top)); applySpinFix(); }
    return;
  }
  if (probs.phase === 'combat') {
    if (COMBAT.combatState().dead) { // dying: only the card-skip listens — fire/pause stay dead (gofix 2026-11-03)
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); COMBAT.deathFastForward(); }
      return;
    }
    if (e.code === 'Space') { e.preventDefault(); input.boost = true; } // Space = boost (rebind 2026-11-03); fire is LMB-only
    if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); setPaused(!paused); }
    if (e.code === 'KeyM') setMuted(!isMuted());
    return;
  }
  if (probs.phase === 'transition') { e.preventDefault(); TRANSITION.transitionSkip(); return; }
  if (probs.phase === 'gameover' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); setPhase('combat'); return; }
  if (probs.phase === 'title') {
    if (e.code === 'Escape') { e.preventDefault(); closePanel(); return; } // panels never trap the keyboard
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); onTitleAction('launch'); }
  }
}
function onKeyup(e) {
  input.keys.delete(e.code);
  if (e.code === 'Space') input.boost = false;
}
function onPointerMove(e) {
  input.px.x = e.clientX; input.px.y = e.clientY; // client px — combat pins #reticle here (the hidden cursor's stand-in)
  input.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  input.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  input.mouseActive = true;
}
function onPointerDown(e) {
  if (probs.phase === 'combat' && e.button === 0) input.fire = true;
}
function onPointerUp(e) {
  if (e.button === 0) input.fire = false;
}
function onTitleAction(kind) {
  if (SPIN) return; // closed viewer — a mis-oriented ship never reaches pad/combat
  audioUnlock(); // first gesture hands the context to the world (§8.3)
  if (kind === 'launch') setPhase('pad');
  else setPhase('combat'); // SKIP TO COMBAT is a real path since S4
}

/* ============================== LOOP ============================== */
const TICKS = {
  title: SPIN ? tickSpin : tickTitle, // SHIP1: in SPIN nothing else writes camera/rocket
  pad: LAUNCH.tickPad,
  countdown: LAUNCH.tickCountdown,
  ignition: LAUNCH.tickIgnition,
  ascent: LAUNCH.tickAscent,
  transition: TRANSITION.tickTransition,
  combat: COMBAT.tickCombat,
};
let last = 0, firstFrame = true;
const fps = { times: [], read: 60 };

function tickTitle(dt, t) {
  if (rocket) { rocket.rotation.y += dt * 0.45; } // gentle roll around the long axis; the rig owns the seat
  const a = 0.55 + t * 0.09; // orbit the rig — the ship sits nose-forward at the lane origin
  camera.position.set(Math.cos(a) * 6.8, 1.15 + Math.sin(t * 0.13) * 0.3, Math.sin(a) * 6.8);
  camera.lookAt(0, 0.3, 0);
}

function tickSpin(dt, t) { // SHIP1: combat-view preview of the orientation under test
  if (!spinRig) return;
  spinRig.sway.rotation.y = 0.44 * Math.sin(t * 0.5); // ±25° yaw sway
  camera.position.set(0, 2.1, -4.6); // behind-and-above, engine side (-Z when nose is -Z)
  camera.lookAt(0, 0.4, 0);
}

function loop(ts) {
  window.requestAnimationFrame(loop);
  if (firstFrame) { last = ts; firstFrame = false; return; } // §8.1 first-frame skip
  let dt = (ts - last) / 1000;
  last = ts;
  if (!Number.isFinite(dt) || dt <= 0) dt = 0; // §8.9 NaN hygiene
  if (dt > DT_CLAMP) dt = DT_CLAMP;
  if (paused) { last = ts; renderer.render(scene, camera); return; } // frozen frame, clock held
  const sdt = dt * game.timeScale; // slow-mo scales the world, never the FPS meter
  game.time += sdt;
  TICKS[probs.phase]?.(sdt, game.time);
  updateFps(ts);
  dprTick(dt);
  updateDebug(dt, ts);
  renderer.render(scene, camera);
}

function updateFps(ts) {
  fps.times.push(ts);
  while (fps.times.length > 2 && ts - fps.times[0] > 1000) fps.times.shift();
  if (fps.times.length > 1) fps.read = Math.round(((fps.times.length - 1) * 1000) / (ts - fps.times[0]));
}

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
    `entities ${countMeshes()} · wrecks ${LAUNCH.wreckCount ? LAUNCH.wreckCount() : 0} · particles ${LAUNCH.particleCount ? LAUNCH.particleCount() : 0}\naudio ${isAudioLive() ? 'live' : 'locked'}${combatLine}`;
}

const fmtN = (n) => (Number.isFinite(n) ? Math.floor(n) : 0);

window.__stage2 = {
  version: 's4', mode: BUILD_MODE,
  get phase() { return probs.phase; },
  get fps() { return fps.read; },
  get dpr() { return dprCtl.cur; },
  assets: () => assetReport(),
  get rocket() { return probs.rocket; },
  hasTexture: () => probs.tex === 1,
  camPos: () => (camera ? camera.position.toArray().map((v) => +v.toFixed(3)) : null),
  rocketY: () => (rocket ? +rocket.position.y.toFixed(3) : null),
  audioLive: () => isAudioLive(),
  get entities() { return countMeshes(); },
  get wrecks() { return LAUNCH.wreckCount ? LAUNCH.wreckCount() : 0; },
  get particles() { return LAUNCH.particleCount ? LAUNCH.particleCount() : probs.particles; },
  get highscore() { return readHighscore(); },
  combatState: () => (COMBAT.combatState ? COMBAT.combatState() : null),
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

/* ============================== GO ============================== */
if (!webglAvailable()) { // §8.10 — no GPU → friendly veil, nothing else runs
  if (ui.webglveil) ui.webglveil.hidden = false;
  console.warn('[stage2] no WebGL — veil shown, game not started');
} else {
  boot();
  window.requestAnimationFrame(loop);
  const unlock = () => audioUnlock(); // any first gesture owns the audio contract
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}
