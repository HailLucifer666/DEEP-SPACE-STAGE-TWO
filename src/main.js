// STAGE TWO — entry, boot, composition root. Banners: BOOT / SCENE / DEBUG / WIRING / GO.
// Story-011 (TD-003): the STORE, PHASES, INPUT and LOOP banners moved verbatim into src/store.js,
// src/phases.js, src/input.js and src/loop.js — wiring via ONE late-bound ctx object (WIRING below).
// R-c (TD-003): the UI and ROCKET banners moved verbatim into src/hud.js (initHud) and
// src/rocket.js (initRocket) — the $ helper stays here for boot(); hud.js re-declares its own
// one-line copy for the ui map; ROCKET_HEIGHT rode along to rocket.js (both call sites moved).
// probs stays in main.js (§6.2): boot/probe state — written by boot(), phases, loop, rocket-prep.
import { THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } from 'stage-two-lib';
import * as LAUNCH from './launch.js';
import * as COMBAT from './combat.js';
import * as ENEMIES from './enemies.js'; // rider B (2026-11-07): lastRollProbe for the __stage2.lastRoll diagnostic surface (acyclic — enemies imports only stage-two-lib + pool; dep-check proves the new edge)
import { audioUnlock, isAudioLive, setMuted, isMuted, restoreMuted,
  musicState, loopsCount, alarmActive } from './audio.js';
import { loadAssets, assetReport } from './assets.js';
import { getStorage, readHighscore, readMuted, readMutedRaw, readLock, readLockRaw } from './store.js';
import { restoreLock, enabled as lockEnabled } from './aim-assist.js'; // stage-6 W1: the aim-lock choice restores beside the mute restore (same warm block — READ, never write; the muted/mutedRaw getter mirrors below)
import { setPhase, initPhases } from './phases.js';
import { input, paused, attachInput, onTitleAction, onPauseAction, initInput } from './input.js';
import { loop, fps, dprCtl, initLoop, composerIsDead } from './loop.js';
import { ui, openPanel, closePanel, refreshSoundButton, refreshRecordLine, onResetClick, disarmReset, OVERLAY_ELMS, initHud } from './hud.js';
import { loadRocket, loadPropRocket, makeFallbackRocket, setupSpinViewer, applySpinFix, activeFix, rocketShape, spinRig, initRocket } from './rocket.js';

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

const $ = (id) => document.getElementById(id);

const probs = { phase: 'boot', rocket: 'none', tex: 0, particles: 0, post: 'off' }; // post: story-008 bloom probe

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

/* ---------- boot() helpers (R-c commit 3): three private helpers, one statement block each —
   same statements, same order, same comments as the pre-split boot(); each is called
   synchronously from boot() in the original sequence, so every mark fires at the same point ---------- */
function setupRenderer() { // (a) renderer + scene + camera + lights
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
}

function setupComposer() { // (b) story-008: bloom post chain — high threshold so only emissive/additive content blooms.
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
}

function wireUi() { // (c) UI wiring
  attachInput(); // story-011: the same key/pointer/blur listeners, registered in the same order
  ui.btnLaunch?.addEventListener('click', () => onTitleAction('launch'));
  ui.btnSkip?.addEventListener('click', () => onTitleAction('skip'));
  ui.btnControls?.addEventListener('click', () => openPanel('CONTROLS'));
  ui.btnCredits?.addEventListener('click', () => openPanel('CREDITS'));
  ui.btnReset?.addEventListener('click', onResetClick);
  ui.btnSound?.addEventListener('click', () => { setMuted(!isMuted()); refreshSoundButton(); });
  // T1: the pause card's pills. RESUME rides input.js's setPaused(false) — the same path P/ESC
  // take; SOUND mirrors the btn-sound click line above, and refreshSoundButton now syncs BOTH
  // pills (rider-D rule: every toggle path refreshes the label in-session).
  ui.pauseResume?.addEventListener('click', (e) => { e.currentTarget.blur(); onPauseAction('resume'); });
  ui.pauseSound?.addEventListener('click', (e) => { e.currentTarget.blur(); setMuted(!isMuted()); refreshSoundButton(); });
  ui.panelClose?.addEventListener('click', closePanel);
  ui.goReplay?.addEventListener('click', () => setPhase('pad')); ui.vicReplay?.addEventListener('click', () => setPhase('pad')); // story-014: both cards' REPLAY — same pad landing
  ui.goSkip?.addEventListener('click', () => setPhase('combat'));
}

function boot() {
  mark('bootStart'); // story-006
  loadAssets(); // fonts register async — the system stack reads until they land (display: swap)
  if (document.fonts) document.fonts.ready.then(() => mark('fonts')); // story-006
  setupRenderer(); // R-c commit 3: (a) renderer + scene + camera + lights — identical statement order, identical mark timing

  setupComposer(); // R-c commit 3: (b) the try-catch post chain
  wireUi(); // R-c commit 3: (c) attachInput + title/gameover button wiring

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
    // story-020: the mute choice restores in the SAME post-warm block — restoreMuted READS the
    // stored value without writing (boot must not rewrite what it just read). This normally
    // precedes the first gesture, and ensure() reads `muted` when the context is first built, so
    // a persisted-muted boot comes up silent at the master gain; if a gesture during load beat
    // it, restoreMuted's context branch applies the gain to the live context.
    window.setTimeout(() => { mark('storeStart'); getStorage(); mark('storeEnd'); refreshRecordLine(); restoreMuted(readMuted()); restoreLock(readLock()); refreshSoundButton(); }, 0); // stage-6 W1: restoreLock rides the same warm block — READS the stored value, never writes (byte-identical survival)
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
  mutedRaw: () => readMutedRaw(), // story-020: the RAW stage2.muted value — corrupt seeds visible to the harness (store.js guarded read)
  get lock() { return lockEnabled(); }, // stage-6 W1: the live aim-lock flag (the muted getter's mirror; ?lock=0 reads OFF)
  lockRaw: () => readLockRaw(), // stage-6 W1: the RAW stage2.lock value — corrupt seeds visible to the harness (the mutedRaw mirror)
  get lastRoll() { return ENEMIES.lastRollProbe(); }, // rider B (2026-11-07): the elite-roll diagnostic surface for the harness — null when ?balanceProbe=1 is off (the record is gated in enemies.js), the last spawn's roll when on (the mutedRaw precedent)
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
  SPIN, DT_CLAMP, RESTART_N, CORRUPT_GLB, ui, probs, game, OVERLAY_ELMS, input, mark,
  countMeshes, closePanel, disarmReset, refreshRecordLine, refreshSoundButton, activeFix, applySpinFix, updateDebug,
  // activeFix rides ctx for input.js's SHIP1 N/T path (ctx.activeFix, input.js 30-31): the
  // dereference predates R-c, but the property itself was never wired — rocket.js owns the object.
  get scene() { return scene; }, get camera() { return camera; }, get rocket() { return rocket; },
  get renderer() { return renderer; }, get composer() { return composer; },
  get bloomPass() { return bloomPass; }, get spinRig() { return spinRig; },
};
initPhases(ctx); initInput(ctx); initLoop(ctx); initHud(ctx); initRocket(ctx);

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
