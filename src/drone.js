// STAGE TWO — VI3W drone (story-012): the third enemy, an ORBITING DIVER. Lives in its own
// module (combat integrates it at the WAVE layer — enemies.js's raider pool and its pure wave
// formula stay untouched; per-wave tables are story-019). Entity kind 'orb'.
//
// Full-3D from day one (the story's second half): raiders steer on XZ only; every velocity
// computation here carries y as a first-class component. Each drone owns a TILTED orbit ring
// around the player — ring radius 12–20 u, its plane tilted so the world y amplitude is
// exactly yAmp (≤ 6 u) around THE PLAYER'S altitude. No arena-altitude constant is imported
// or baked anywhere in this file: the player position is a parameter, so Stage 3's full-3D
// flight retunes this instead of rewriting it.
//
// Build-time swap: tools/build.mjs inlines build/drone.glb as window.__DRONE_B64 when staged;
// this module decodes it ONCE at prepare (async) and builds the pool from a clone of that
// template — mode 'glb'. Empty token or a failed decode falls back to the procedural ring +
// core + fins silhouette (mode 'proc'), matching the raiders' additive neon look. A file://
// page cannot probe sibling files, so the swap is a BUILD decision, never a runtime fetch.
// buildMode() always reports what actually flew.
import { THREE, GLTFLoader } from 'stage-two-lib';
import { makePool } from './pool.js';
import { beep } from './audio.js';

/* ---------- tuning knobs (design: production/epics/combat-feel-fix/story-012-vi3w-drone.md) ---------- */
const DRONE_POOL = 4;          // max 3 per wave (droneCountFor) + 1 probe spare
const DRONE_HP = 2;
const R_ORB = 1.05;            // contact radius (full-3D) — dive ram hits like a rammer (25)
const ORB_BOLT_R2 = 1.3 * 1.3; // bolt × orb hit radius² — full 3D, generous for the ring visual
const ORBIT_R_MIN = 12, ORBIT_R_MAX = 20;
const Y_AMP_MAX = 6;           // design: y ∈ player altitude ± 6
const ORBIT_SPEED = 0.42;      // rad/s along the ring
const ORBIT_MAX_SPEED = 9.5;   // u/s cap while orbiting (feed-forward + seek)
const SEEK = 2.2;              // radial seek gain toward the ring point
const DIVE_SPEED = 26;         // the dive should read distinctly faster than a raider ram
const DIVE_MAX_T = 1.7;        // s; ends the dive (drone returns to its ring)
const TELEGRAPH_T = 0.6;       // design: glow flare + audio tick ~0.6 s before the dive
const DIVE_EVERY = 4.5;        // orbit seconds between dives (first dive included)
const DIVE_JITTER = 2.5;
const SPAWN_DIST = 34;         // join distance — flies in and settles on its ring
const DRONE_STAGGER = 1.2;
const DRONE_SIZE = 1.7;        // GLB normalization (longest side); proc silhouette matches
const HALO_BASE = 1.15, HALO_FLARE = 2.4; // telegraph flare scale

const D = {
  ready: false, scene: null, pool: null,
  mode: 'proc',                // 'glb' | 'proc' — what the pool's maker actually builds
  template: null,              // decoded GLB wrap (off-scene); clones become pool items
  queued: 0, spawnT: 0, wave: 0,
  scratch: [],
};

// story-012 spawn rule — pure function of the wave number (drones join from wave 3, ≤ 3)
export const droneCountFor = (w) => Math.min(3, Math.max(0, w - 2));

/* ---------- procedural silhouette: ring + core + fins (NOT ship-shaped) ---------- */
function buildProcDrone() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x2b3a48, roughness: 0.35, metalness: 0.7, emissive: 0x14344a, emissiveIntensity: 0.5 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x7dd7ff, roughness: 0.4, metalness: 0.3, emissive: 0x3a86a8, emissiveIntensity: 0.65 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.08, 10, 26), hull); // hole along Z — lookAt faces flight, the ring reads as an eye
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), trim);
  const finGeo = new THREE.BoxGeometry(0.42, 0.05, 0.14);
  for (let i = 0; i < 3; i++) { // three fins on the ring at 120° — breaks the raider silhouette completely
    const fin = new THREE.Mesh(finGeo, trim);
    const a = (i / 3) * Math.PI * 2;
    fin.position.set(Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0);
    fin.rotation.z = a + Math.PI / 2;
    g.add(fin);
  }
  g.add(ring, core);
  g.userData.spin = ring;
  g.userData.pulse = core;
  return g;
}

function makeDrone() {
  const g = (D.mode === 'glb' && D.template) ? D.template.clone(true) : buildProcDrone();
  // per-instance halo — the additive neon glow (makeRaider glowMat pattern), and the flare
  // surface for the telegraph (per-instance material so a flare never leaks across the pool)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x7dd7ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(HALO_BASE);
  g.add(halo);
  g.userData.kind = 'orb';
  g.userData.halo = halo;
  g.userData.vel = new THREE.Vector3();
  g.userData.diveDir = new THREE.Vector3();
  g.userData.t = 0;
  return g;
}

/* ---------- GLB swap path (build-time decision, decoded once) ---------- */
function b64ToBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function prepTemplate(root) {
  root.traverse((o) => {
    if (o.isMesh && o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    o.userData = {}; // Object3D.clone JSON-copies userData — a THREE ref here would throw; refs are re-attached per clone
  });
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  const wrap = new THREE.Group();
  if (Number.isFinite(longest) && longest > 0) { // §8.2 spirit — a degenerate GLB still never scales 0/∞
    wrap.scale.setScalar(DRONE_SIZE / longest);
    root.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-1);
  }
  wrap.add(root);
  return wrap;
}

export function prepareDrones(scene) {
  if (D.ready) return;
  D.ready = true;
  D.scene = scene;
  const b64 = (typeof globalThis.__DRONE_B64 === 'string') ? globalThis.__DRONE_B64 : '';
  if (!b64) { // default shipped build — procedural pool, no decode pending
    D.mode = 'proc';
    D.pool = makePool(scene, makeDrone, DRONE_POOL);
    return;
  }
  // token present: the pool exists only once the decode settles — drones cannot spawn into a
  // half-built path (wave 3 arrives seconds later; the probe gate waits on poolReady()).
  new GLTFLoader().parse(b64ToBuffer(b64), '', (gltf) => {
    try {
      const root = gltf && gltf.scene ? gltf.scene : null;
      if (!root) throw new Error('drone GLB parsed but scene root missing');
      D.template = prepTemplate(root);
      D.mode = 'glb';
      D.pool = makePool(scene, makeDrone, DRONE_POOL);
    } catch (err) { // kee class 6 — a bad GLB degrades loudly to proc, never crashes combat
      console.error('[stage2] drone GLB unusable — procedural drone. reason:', err && (err.message || err));
      D.pool = makePool(scene, makeDrone, DRONE_POOL);
    }
  }, (err) => {
    console.error('[stage2] drone GLB decode failed — procedural drone. reason:', err && (err.message || err));
    D.pool = makePool(scene, makeDrone, DRONE_POOL);
  });
}

/* ---------- wave integration (combat calls this at the wave layer) ---------- */
export function startWave(w) {
  D.wave = w;
  D.queued = droneCountFor(w);
  D.spawnT = DRONE_STAGGER;
}

/* ---------- orbit-plane math (full 3D — y is never flattened) ----------
 * Ring-local circle (r·cos a, r·sin a, 0), tilted about X by u.tilt then yawed about Y by
 * u.yaw. The tilt is chosen at spawn so the WORLD y amplitude is exactly u.yAmp (cos θ =
 * yAmp / r) — design's y ∈ player altitude ± 6 without any arena constant. */
const V = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() }; // hoisted scratch — no per-frame allocation

function ringPoint(out, u, p, a) {
  const ca = Math.cos(a) * u.r, sa = Math.sin(a) * u.r;
  const ct = Math.cos(u.tilt), st = Math.sin(u.tilt);
  const tx = ca, ty = sa * ct, tz = sa * st;
  const cy = Math.cos(u.yaw), sy = Math.sin(u.yaw);
  return out.set(p.x + tx * cy + tz * sy, p.y + ty, p.z - tx * sy + tz * cy);
}
function ringTangent(out, u, p, a) { // d(ringPoint)/da — magnitude r, direction sense applied by caller
  const ca = -Math.sin(a) * u.r, sa = Math.cos(a) * u.r;
  const ct = Math.cos(u.tilt), st = Math.sin(u.tilt);
  const tx = ca, ty = sa * ct, tz = sa * st;
  const cy = Math.cos(u.yaw), sy = Math.sin(u.yaw);
  return out.set(tx * cy + tz * sy, ty, -tx * sy + tz * cy);
}

function faceVelocity(d) {
  if (d.userData.vel.lengthSq() < 0.01) return;
  d.lookAt(V.a.copy(d.position).add(d.userData.vel));
}

function setFlare(d, k) { // k 0..1 — telegraph glow flare on the per-instance halo
  const halo = d.userData.halo;
  if (!halo) return;
  const c = Math.max(0, Math.min(1, k));
  halo.scale.setScalar(HALO_BASE + (HALO_FLARE - HALO_BASE) * c);
  halo.material.opacity = 0.55 + 0.4 * c;
}

function tickOrb(d, dt, playerPos, api) {
  const u = d.userData;
  u.t += dt;
  u.modeT -= dt;

  if (u.mode === 'dive') {
    u.diveT -= dt;
    // full-3D homing toward the ship — the dive crosses altitudes, so pursuit is 3D too
    V.a.copy(playerPos).sub(d.position);
    const dist = V.a.length() || 1; // NaN guard §8.9 — never divide by 0
    V.a.divideScalar(dist);
    u.diveDir.lerp(V.a, 1 - Math.exp(-3.5 * dt)).normalize();
    u.vel.copy(u.diveDir).multiplyScalar(DIVE_SPEED);
    d.position.addScaledVector(u.vel, dt);
    faceVelocity(d);
    if (dist < R_ORB + 0.9) { // dive contact — rammer rule: 25 damage, dies without score
      api.damagePlayer(25);
      api.explosion(d.position);
      D.pool.kill(d);
      return;
    }
    if (u.diveT <= 0) { // missed — back to station
      u.mode = 'orbit';
      u.modeT = DIVE_EVERY + Math.random() * DIVE_JITTER;
      setFlare(d, 0);
    }
    return;
  }

  if (u.mode === 'orbit' && u.modeT <= TELEGRAPH_T) { // design: flare + tick ~0.6 s before the dive
    u.mode = 'telegraph';
    beep({ freq: 1240, dur: 0.07, vol: 0.14, type: 'sine' });
    setFlare(d, 0);
  }
  if (u.mode === 'telegraph') {
    setFlare(d, 1 - u.modeT / TELEGRAPH_T); // flare grows toward the dive
    if (u.modeT <= 0) {
      u.mode = 'dive';
      u.diveT = DIVE_MAX_T;
      // leave the ring ALONG ITS ORBIT TANGENT, then hand over to homing — tangent-heavy
      // launch reads as a swoop through the player's position, not a dead-stop face-turn
      ringTangent(V.b, u, playerPos, u.a).normalize();
      if (u.orbitDir < 0) V.b.negate();
      V.c.copy(playerPos).sub(d.position).normalize();
      u.diveDir.copy(V.c).addScaledVector(V.b, 0.45).normalize();
      return;
    }
  }

  // orbit: advance the ring phase, chase the ring point — velocity-first steering where the
  // y component of BOTH the ring point and the tangent feeds every term
  u.a += u.orbitDir * ORBIT_SPEED * dt;
  ringPoint(V.a, u, playerPos, u.a);
  ringTangent(V.b, u, playerPos, u.a).multiplyScalar(ORBIT_SPEED);
  V.c.copy(V.a).sub(d.position).multiplyScalar(SEEK);
  V.b.add(V.c);
  const dl = V.b.length();
  if (dl > ORBIT_MAX_SPEED) V.b.multiplyScalar(ORBIT_MAX_SPEED / dl);
  u.vel.lerp(V.b, 1 - Math.exp(-6 * dt));
  d.position.addScaledVector(u.vel, dt);
  faceVelocity(d);
  if (u.spin) u.spin.rotation.z += dt * 2.2; // idle life — proc drones only (GLB owns its own look)
  if (u.pulse) u.pulse.scale.setScalar(1 + Math.sin(u.t * 6) * 0.12);
}

function spawnDrone(playerPos) {
  const d = D.pool.spawn();
  const a = Math.random() * Math.PI * 2;
  d.position.set(
    playerPos.x + Math.cos(a) * SPAWN_DIST,
    playerPos.y + (Math.random() * Y_AMP_MAX - Y_AMP_MAX / 2), // joins in 3D too
    playerPos.z + Math.sin(a) * SPAWN_DIST);
  const u = d.userData;
  u.hp = DRONE_HP;
  u.r = ORBIT_R_MIN + Math.random() * (ORBIT_R_MAX - ORBIT_R_MIN);
  u.yAmp = 3 + Math.random() * (Y_AMP_MAX - 3); // ≤ Y_AMP_MAX by construction
  u.tilt = Math.acos(Math.min(1, u.yAmp / u.r)); // ⇒ world y amplitude = yAmp
  u.yaw = Math.random() * Math.PI * 2;
  u.a = Math.random() * Math.PI * 2;
  u.orbitDir = Math.random() < 0.5 ? 1 : -1;
  u.mode = 'orbit';
  u.modeT = DIVE_EVERY + Math.random() * DIVE_JITTER; // first dive delay
  u.diveT = 0;
  u.vel.set(0, 0, 0);
  u.diveDir.set(0, 0, 1);
  setFlare(d, 0);
  return d;
}

function spawnTick(dt, playerPos) {
  if (D.queued <= 0 || !D.pool) return; // pool pending the GLB decode — the queue holds
  D.spawnT -= dt;
  if (D.spawnT <= 0) {
    D.spawnT = DRONE_STAGGER;
    D.queued--;
    spawnDrone(playerPos);
  }
}

// dt already timeScaled by caller. api: { damagePlayer(n), explosion(pos) } — same shape as tickEnemies
export function tickDrones(dt, playerPos, api) {
  spawnTick(dt, playerPos);
  if (!D.pool) return;
  // frame-start snapshot of live orbs — same pool discipline as tickEnemies (§ pool.js contract)
  D.scratch.length = 0;
  D.pool.update(0, (o) => D.scratch.push(o));
  D.pool.update(dt, (d) => tickOrb(d, dt, playerPos, api));
}

// returns true if this hit killed the orb (bolt kill path in combat.js scores 200)
export function hitOrb(d, dmg = 1) {
  if (!d.userData.alive) return false;
  d.userData.hp -= dmg;
  if (d.userData.hp > 0) return false;
  D.pool.kill(d);
  return true;
}

/* ---------- probe surface helpers ---------- */
export function eachAlive(fn) { if (D.pool) D.pool.update(0, fn); }
export function aliveCount() { return D.pool ? D.pool.live : 0; }
export function queuedCount() { return D.queued; }
export function poolReady() { return !!D.pool; }
export function buildMode() { return D.mode; }
export const orbBoltR2 = () => ORB_BOLT_R2;
export function spawnForProbe(pos) { // deterministic orb: r 14, yAmp 5, yaw 0, first dive 1.2 s
  if (!D.pool) return null;
  const d = spawnDrone(pos);
  d.position.copy(pos);
  const u = d.userData;
  u.r = 14; u.yAmp = 5;
  u.tilt = Math.acos(u.yAmp / u.r);
  u.yaw = 0; u.a = Math.PI / 2; u.orbitDir = 1;
  u.mode = 'orbit'; u.modeT = 1.2; // telegraph at 0.6 s, dive launch at 1.2 s
  u.vel.set(0, 0, 0);
  return d;
}
export function clearDrones() { // §8.6 — rides the same clearCombat path as every other pool
  if (D.pool) D.pool.clear();
  D.queued = 0; D.spawnT = 0; D.wave = 0;
}
