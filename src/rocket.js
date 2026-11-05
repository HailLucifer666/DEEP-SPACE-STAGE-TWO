// STAGE TWO — rocket/ship model pipeline: GLB decode, SHIP1 orientation adapter, measurement,
// derelict props, primitive fallback, and the closed ?debug=1&spin=1 viewer. R-c (TD-003): the
// ROCKET banner moved here VERBATIM from main.js (comments included) — a move, not a rewrite.
// ROCKET_HEIGHT moved with it (reported move-table deviation, loop.js DPR precedent: both its
// call sites are here and ctx may not grow a property for it). Leaf module: imports ONLY
// stage-two-lib (THREE + GLTFLoader — the lib import leaves main.js) + ship-fix.js (adapterRows);
// everything else arrives through the ONE ctx object (initRocket) — it never imports main.js,
// phases.js, input.js or loop.js.
//
// Call-time state rule (R-c3): scene and rocket are boot()-assigned lets in main.js — they are
// NEVER captured here; every read goes through the ctx.scene / ctx.rocket getters AT CALL TIME.
// mark/probs/ui/SPIN/CORRUPT_GLB are stable bindings (consts or const objects) and BOOT_MARKS is
// the same object as main.js's const (window.__BOOT) — captured once in initRocket.
import { THREE, GLTFLoader } from 'stage-two-lib';
import { adapterRows } from './ship-fix.js';

let ctx = null;
let mark = null, probs = null, ui = null, BOOT_MARKS = null, SPIN = false, CORRUPT_GLB = false;
export function initRocket(context) {
  ctx = context;
  mark = context.mark; // const arrow fn (main.js BOOT banner) — stable for the module's lifetime
  probs = context.probs; // const object — mutated in place, never reassigned
  ui = context.ui; // hud.js's ui map — same object for the module's lifetime
  BOOT_MARKS = window.__BOOT; // main.js's const BOOT_MARKS IS window.__BOOT — one marks object
  SPIN = context.SPIN; CORRUPT_GLB = context.CORRUPT_GLB; // boot flags — fixed before WIRING runs
}

/* ============================== ROCKET ============================== */

const ROCKET_HEIGHT = 1.6; // handoff §5: uniform-scaled hero size

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
  if (!ctx.scene || !ctx.scene.environment) {
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
  if (!ctx.rocket) return;
  if (ui.title) ui.title.hidden = true;
  ctx.rocket.position.set(0, 0, 0);
  ctx.rocket.rotation.set(0, 0, 0);
  const sway = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.x = Math.PI / 2; // combat's map: adapter +Y nose -> +Z forward, -Z top -> +Y up
  sway.add(tilt);
  tilt.add(ctx.rocket); // the wrap; the plume welded to it stays invisible here
  ctx.scene.add(sway);
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
  if (ctx.rocket) measureShip(ctx.rocket);
  updateSpinLabel();
}

// exports consumed by main.js: boot()'s decode chain + the spin viewer + the metrics objects
// read by updateDebug / __stage2.rocketMetrics. activeFix/rocketShape are MUTATED, never
// reassigned -> plain object exports. spinRig IS reassigned (setupSpinViewer) -> exported as a
// let BINDING via export{} — the ES live-binding mechanism (same as `export let`): main.js's
// ctx.spinRig getter reads the CURRENT rig after every reassignment.
export { loadRocket, loadPropRocket, makeFallbackRocket, setupSpinViewer, applySpinFix, activeFix, rocketShape, spinRig };
