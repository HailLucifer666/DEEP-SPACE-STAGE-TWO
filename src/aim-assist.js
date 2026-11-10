// STAGE TWO — AIM ASSIST (stage-6 W1, ux-audit F1b; story 7.4 camera-axis model): the
// camera-axis lock scan + the camera-true aim source (aimDir/leadPoint — the locked target's
// lead point or the converge point — and the AIMK knobs the weapons homing reads) + the two
// aim HUD writers (pipper, lock bracket). The design contract lives in
// production/polish/ux-audit.md F1 and production/polish/polish-plan.md W1 (the story card).
//
// WHY THIS MODULE EXISTS AS ITS OWN FILE (import direction, dep-check-pinned): combat.js and
// weapons.js import THIS; it imports enemies.js/drone.js DIRECTLY (its own candidate scan —
// see below) and store.js (the persistence pair). It must NEVER import combat.js — the
// combat state arrives ONCE through the initWeapons-style live-reference seam below, and the
// reverse edge would be both a cycle and a layering break. tools/dep-check.mjs pins the rule.
//
// THE SEAM (the C-state contract — verbatim the weapons.js rules): initAimAssist() receives
// combat.js's LIVE state bag C + the LIVE forward closure ONCE; every C.* read here is a
// CALL-TIME read (C.pos/C.camera/C.api are assigned asynchronously in prepareCombat — never a
// snapshot). Deliberately NOT probeEnv: that object is the probes-only seam (probes.js never
// imports combat state beyond it, and the aim state is not probe plumbing).
//
// OWN SCAN — scanNearest is untouched: it returns a finite NUMBER (full-3D distance) that
// audio.js proximityTick consumes (combat.js:534 → audio.js:351-353); an object there would
// silently kill the proximity voice. The lock runs its OWN eachAlive scan below and returns
// nothing.
//
// THE BOSS IS EXCLUDED FROM LOCK — by construction, not by tuning. WHY (ux-audit F1, the
// audit-council CRITICAL ruling): the boss's weak-point zone centers on the boss position
// (boss.js boltHit: dx²+dy²+dz² < NODE_R² of B.boss.position — the node sits at the ring's
// center), and that node subtends ~1.8-2.7° of angular radius at the fight's hold ranges
// (NODE_R 0.95 at ORBIT_HOLD 30 / RAGE_HOLD 20, boss.js:38/:52). A 6° lock cone pointed at
// the boss would swallow the node whole: every stream bolt biased toward the boss position
// lands in the weak-point zone automatically, and the ×3 weak-point skill — the entire TTK
// test the boss fight exists for (stage-4 balance: 4 aimed charged hits) — is automated away.
// The boss is simply not a candidate: no BOSS.eachAlive read, no special case to unwind later.
//
// story 7.4 — THE AIM MODEL IS CAMERA-AXIS NOW (docs/FIX_PLAN.md story 7.4): the chase cam sits
// 3.4 u above the ship and looks 4 u ahead while bolts used to fly the ship's nose — the two
// lines only crossed 4 u out, so a target under the center pipper was hit high by every bolt
// and the nose-cone lock grabbed the wrong enemy. The lock cones are measured from the CAMERA
// axis (AIMK below: acquire 12°, retain 20°, range 80 u) and the lock is INSTANT — no lock
// delay of any kind — with a 0.35 s grace (LOCK_GRACE) after the target leaves the retain cone.
// The behind-the-SHIP guard is kept from the old scan (a target behind the ship can never be
// hit even while the camera still sees it); the behind-CAMERA case needs no guard — camCos
// returns ≤0 there and fails both cones. New bolts aim at what the camera sees (aimDir: the
// locked target's lead point, or the camera-true converge point at AIMK.CONVERGE_DIST), and
// stream bolts HOME (boltsTick steers at AIMK.HOMING_RATE toward the lead point). The old
// spawn-bias path (biasDir) is RETIRED by this story — it stays exported but has no caller.
// The bracket writer DOES use camera math (it projects to screen — the pip block's
// projection half).
//
// THE FAN+BIAS SUM CLAMP (historical, the W1 card's "decide and DOCUMENT") — MOOT under 7.4:
// the bias is retired (no caller), so the clamp below only bounds the retired function. The
// fan is ±6° (SPREAD_ARC, weapons.js) about the CAMERA-TRUE base now; the charged release is
// NEVER lock-aimed (weapons.js spawnBolt gates on `charged`) — the manual-aim reward per
// ux-audit F1 / stage-4-balance §4.1. Stream bolts homing is bounded by the lead point itself
// (the steer target IS the target), so the old fan+bias sum argument has no successor to prove.
//
// SCRATCH DISCIPLINE: everything below uses THIS module's vectors. NEVER C.tmp/C.tmp2 —
// spawnBolt's lookAt clobbers C.tmp (weapons.js), and aimDir runs inside spawnBolt (and inside
// spawnStreamShot for the fan base) before those lookAts — a C.tmp read here would race the
// clobber.
//
// PIPPER ANCHOR DECISION (story 7.4 contract): the pipper is ANALYTICALLY anchored at screen
// center and is ALWAYS VISIBLE while the combat HUD is on — hidden only while dead (the death
// card owns the screen). The 72px divergence threshold (reticle half-width 66 + 6) that used
// to gate visibility is GONE: with camera-true aim the pipper is the bolt-path marker the
// player aims with, and hiding it while the cursor sat on target hid it exactly when it
// mattered. The chase-cam construction still backs the anchor (the camera looks at
// pos + forward·4 from pos − forward·(7.5+trail) + 3.4 up — combat.js:523), and since story
// 7.4 tickCombat calls camera.updateMatrixWorld(true) right after the lookAt, every projection
// that runs later (the lock bracket, the pipper's divergence rider) reads THIS frame's camera.
//
// TOGGLE + PERSISTENCE (the muted-pair mirror, store.js): T in combat (input.js) toggles the
// live flag and writes through; default ON (restored at boot by main.js's warm block via
// restoreLock(readLock()) — READ, never write). ?lock=0 forces the lock OFF for a whole page
// (the probe override — T is a no-op there) so the existing probe pages see unbiased bolts.
import { THREE } from 'stage-two-lib';
import * as ENEMIES from './enemies.js';
import * as DRONES from './drone.js';
import { readLock, writeLock } from './store.js';

/* ---------- knobs (story 7.4 — the camera-axis aim model, docs/FIX_PLAN.md story 7.4) ---------- */
export const AIMK = {
  CONVERGE_DIST: 28,  // u from the camera, used when nothing is locked
  ACQUIRE_DEG: 12,    // lock acquire cone, from the camera axis
  RETAIN_DEG: 20,     // lock keep cone
  LOCK_RANGE: 80,     // u from the camera
  LOCK_GRACE: 0.35,   // s to keep a lock after the target leaves the retain cone
  HOMING_RATE: 6      // bolt steering smoothing (higher = sharper)
};
// (the old nose-cone constants ACQUIRE_DEG 6 / RETAIN_DEG 10 / COS_ACQUIRE / COS_RETAIN are
// removed — orphaned by the 7.4 lockTick rewrite; no other module referenced them)
const BIAS_MAX_DEG = 6;                      // per-bolt bias rotation cap — biasDir is RETIRED by 7.4 (kept, uncalled, for API stability)
const BIAS_MAX_RAD = BIAS_MAX_DEG * Math.PI / 180;
// (PIPPER_ON_PX — the 72px divergence-hide threshold — is removed by story 7.4: the pipper is
// always visible while the combat HUD is on, see hudTick)

const qs = new URLSearchParams(location.search);
const LOCK_FORCED_OFF = qs.get('lock') === '0'; // probe override: ?lock=0 forces the lock OFF for the whole page (T no-ops)

/* ---------- the seam (see the header) ---------- */
let C = null; // combat.js's live state bag — set once by initAimAssist, read at CALL TIME
let forward = null; // combat.js's 3D forward closure (story-015 keystone) — live, never copied
let _cam = null; // story 7.4: the camera through the init seam — C.camera is assigned
// asynchronously in prepareCombat (the never-snapshot rule), so the bind is LAZY: camState
// captures the live reference on first use. prepareCombat builds the camera once and its
// identity never changes for the page's lifetime, so the capture is snapshot-safe by
// construction (the same argument as combat.js's const primitives).

export function initAimAssist(deps) {
  C = deps.C;
  forward = deps.forward;
  _cam = deps.camera || null; // story 7.4 seam rider — normally still undefined at this call (module-scope init, pre-prepareCombat); camState lazily binds C.camera
}

/* ---------- toggle state ---------- */
let lockOn = true; // the live toggle — restored from the store at boot (main.js warm block), never snapshotted
let lockTarget = null; // the locked entity (a pooled raider/orb mesh) or null — NEVER the boss (header)

export function enabled() { return lockOn && !LOCK_FORCED_OFF; } // the honest surface: ?lock=0 reads OFF
export function toggleLock() { // input.js KeyT — persists like setMuted (write-through)
  if (LOCK_FORCED_OFF) return; // the probe override wins for the whole page
  lockOn = !lockOn;
  if (!lockOn) lockTarget = null; // dropping the toggle drops the lock (the bracket is honest immediately)
  writeLock(lockOn);
}
export function restoreLock(v) { // main.js warm block — READS the stored value, never writes (byte-identical survival)
  lockOn = !!v;
  if (!lockOn) lockTarget = null;
}

/* ---------- scratch (NEVER C.tmp/C.tmp2 — see the header) ---------- */
const S = {
  fwd: new THREE.Vector3(), toT: new THREE.Vector3(), axis: new THREE.Vector3(),
  ndc: new THREE.Vector3(), camFwd: new THREE.Vector3(), q: new THREE.Quaternion(),
};

/* ---------- story 7.4 camera-state + lead/aim helpers (module temps — NEVER C.tmp/C.tmp2) ---------- */
const _cp = new THREE.Vector3(), _cf = new THREE.Vector3(); // camera world pos / forward
const _t = new THREE.Vector3(), _p = new THREE.Vector3();
const COS_ACQ = Math.cos(THREE.MathUtils.degToRad(AIMK.ACQUIRE_DEG));
const COS_RET = Math.cos(THREE.MathUtils.degToRad(AIMK.RETAIN_DEG));
const velMap = new WeakMap(); // locked-target smoothed velocity — one entry per entity, allocated ONCE per entity (never per frame). Pool meshes persist across restarts by design, so a stale entry can survive one; it SELF-HEALS on re-lock — trackVel re-lerps v toward the measured motion and re-pins s.p every tick
let graceT = 0; // s since the locked target left the retain cone (the LOCK_GRACE hold)

function camState() {
  if (!_cam && C && C.camera) _cam = C.camera; // lazy bind — see the seam note above
  _cam.getWorldPosition(_cp);
  _cam.getWorldDirection(_cf);
}

// cosine between the camera forward and the direction to point p; -1 if too close or too far
function camCos(p) {
  _t.copy(p).sub(_cp);
  const d = _t.length();
  if (d < 6 || d > AIMK.LOCK_RANGE) return -1;
  return _t.divideScalar(d).dot(_cf);
}

function trackVel(t, dt) { // smoothed velocity from position change (the homing lead's input)
  let s = velMap.get(t);
  if (!s) { s = { p: t.position.clone(), v: new THREE.Vector3() }; velMap.set(t, s); }
  if (dt > 1e-4) { _t.copy(t.position).sub(s.p).divideScalar(dt); s.v.lerp(_t, 0.35); }
  s.p.copy(t.position);
}

export function leadPoint(target, from, speed, out) { // where a bolt from `from` must aim to meet `target`
  const s = velMap.get(target);
  out.copy(target.position);
  if (!s) return out;
  for (let i = 0; i < 2; i++) {
    const tt = Math.min(from.distanceTo(out) / speed, 1.0);
    out.copy(target.position).addScaledVector(s.v, tt);
  }
  return out;
}

// Direction for a new bolt. Stream bolts: toward the locked target's lead point.
// Charged bolts: never lock-aimed (manual), but still camera-true. ?lock=0 leaves lockTarget
// null (the lockTick guard clears it) — the converge point IS the manual-aim path, so the
// probe override stays camera-true by the same fallthrough.
export function aimDir(muzzle, charged, speed, out) {
  camState();
  const lt = charged ? null : getLockTarget();
  if (lt) leadPoint(lt, muzzle, speed, _p);
  else _p.copy(_cp).addScaledVector(_cf, AIMK.CONVERGE_DIST);
  return out.copy(_p).sub(muzzle).normalize();
}
export function getLockTarget() { return lockTarget; }
export function targetAlive(t) { return !!(t && t.userData && t.userData.alive); } // the pool's alive flag (pool.js) — there is no alive() function to reuse

/* ---------- the lock scan (called once per tickCombat, before the fire path; story 7.4: takes dt) ---------- */
export function lockTick(dt) {
  if (!C || !C.ready) return; // C.ready gates the pools too — enemies.js eachAlive has NO null-pool
  // guard (unlike drone.js:313); this tick only runs inside combat, after prepareCombat.
  if (!enabled() || C.dead) { lockTarget = null; return; }
  camState();
  if (lockTarget && targetAlive(lockTarget)) {
    trackVel(lockTarget, dt);
    if (camCos(lockTarget.position) > COS_RET) { graceT = 0; return; } // in the retain cone: hold, no re-scan
    graceT += dt;
    if (graceT < AIMK.LOCK_GRACE) return; // keep the lock briefly after the target leaves the cone
  }
  lockTarget = null; graceT = 0;
  // acquire — the best (smallest-angle) candidate within AIMK.ACQUIRE_DEG of the CAMERA axis.
  // Candidates: raiders/gunners/elites (ENEMIES.eachAlive) + orbs (DRONES.eachAlive). THE BOSS
  // IS NOT A CANDIDATE — the header documents the weak-point automation ruling. Behind-the-ship
  // candidates are skipped (the old nose-forward guard, kept). No lock delay: the scan runs
  // every tick and the best candidate locks THIS tick.
  const f = forward(S.fwd);
  let best = COS_ACQ;
  const cand = (d) => { // the pip-block math semantics (combat.js:591-599) on the ship axis, then camCos on the camera axis
    S.toT.set(d.position.x - C.pos.x, d.position.y - C.pos.y, d.position.z - C.pos.z);
    const len = S.toT.length();
    if (len < 1e-4) return;
    if ((S.toT.x / len) * f.x + (S.toT.y / len) * f.y + (S.toT.z / len) * f.z <= 0) return; // behind the ship never locks (old guard, kept — header)
    const c = camCos(d.position);
    if (c > best) { best = c; lockTarget = d; } // nearest-ANGLE wins (the aim metric)
  };
  ENEMIES.eachAlive(cand);
  DRONES.eachAlive(cand);
  if (lockTarget) trackVel(lockTarget, dt);
}

/* ---------- the spawn bias (RETIRED by story 7.4 — the plan keeps it exported but uncalled;
 * bolts now aim via aimDir and HOME in boltsTick; no module calls this anymore) ---------- */
export function biasDir(dir, fromPos) { // rotates dir ≤BIAS_MAX_DEG toward the locked target; final at spawn
  if (!C || !enabled() || !lockTarget || !lockTarget.userData || !lockTarget.userData.alive) return false;
  S.toT.copy(lockTarget.position).sub(fromPos); // bolt-relative: converge ON the target from where the bolt is
  const len = S.toT.length();
  if (len < 1e-4) return false;
  S.toT.multiplyScalar(1 / len);
  const ang = dir.angleTo(S.toT);
  if (ang < 1e-4) return false; // dead-ahead: bias is a no-op — the fire-path baseline invariant holds untouched
  const rot = Math.min(BIAS_MAX_RAD, ang); // THE CLAMP — mutation (a) removes this min() and the bias asserts red
  S.axis.copy(dir).cross(S.toT);
  if (S.axis.lengthSq() < 1e-8) return false; // (anti-)parallel — nothing to rotate
  S.axis.multiplyScalar(1 / S.axis.length());
  S.q.setFromAxisAngle(S.axis, rot);
  dir.applyQuaternion(S.q).normalize();
  return true;
}

/* ---------- HUD writers (change-gated; the card puts these here, combat hands camera via the seam) ---------- */
let pipShow = false; // last pipper gate
let pipLocked = false; // story 7.4: last pipper `locked`-class gate (change-gated — no per-frame DOM churn)
let pipDivDeg = 0; // stage-6 H1 honesty rider: the divergence the gate measured this tick (deg off the bolt path) — pipperState() reads THIS stored state, never recomputes
let brVis = false, brX = -1, brY = -1; // last bracket gates (integer-px change gate)

// stage-6 H1 honesty rider (W1's chair flag): the pointer-divergence from the bolt path in
// DEGREES, computed from the same pointer read the old visibility gate used — NDC pointer →
// angular via the live camera frustum (fov vertical, aspect-scaled horizontal). story 7.4: the
// VISIBILITY gate no longer rides it (the pipper is always visible in combat); this stays the
// honest companion the harness reads through combatState().pipper.
function pipDivergenceDeg(inp) {
  if (!C.camera || !Number.isFinite(C.camera.fov) || !Number.isFinite(C.camera.aspect)) return 0;
  const t = Math.tan(C.camera.fov * Math.PI / 360);
  return +(Math.atan(Math.hypot(inp.mouse.x * t * C.camera.aspect, inp.mouse.y * t)) * 180 / Math.PI).toFixed(2);
}

export function hudTick() { // called once per tickCombat, after the edge-pip block
  if (!C || !C.ready) return;
  // pipper — story 7.4: ALWAYS visible while the combat HUD is on, analytic anchor ≈ screen
  // center (header decision). With camera-true aim the pipper is the honest bolt-path marker
  // at every range — the old 72px divergence hide (PIPPER_ON_PX, removed) hid the one marker
  // that told the player where the bolts actually go. Hidden while dead (the death card owns
  // the screen). The H1 divergence rider still measures the pointer angle. The `locked` class
  // marks an active lock (change-gated). No clip-path (flow-check counts #hud clip-path
  // children — the 8 edge pips).
  if (C.ui.pipper) {
    const inp = C.api.input;
    pipDivDeg = 0;
    if (!C.dead && inp.mouseActive) pipDivDeg = pipDivergenceDeg(inp);
    const show = !C.dead;
    if (show !== pipShow) { C.ui.pipper.hidden = !show; pipShow = show; }
    const lk = !!lockTarget; // getLockTarget() — the module's own lock variable
    if (lk !== pipLocked) {
      pipLocked = lk;
      C.ui.pipper.classList.toggle('locked', lk);
    }
  }
  // bracket — ONE element, the locked target's screen anchor (pip-block projection: in-front
  // dot with the CAMERA forward, then .project). Change-gated on visibility + integer px —
  // no per-frame innerHTML churn (hard build constraint 1). Cyan: amber is elite/boss
  // language (scope.md color rule).
  if (C.ui.lockBr) {
    let vis = false, kx = 0, ky = 0;
    if (!C.dead && lockTarget && lockTarget.userData && lockTarget.userData.alive) {
      C.camera.getWorldDirection(S.camFwd);
      S.toT.copy(lockTarget.position).sub(C.camera.position);
      if (S.toT.dot(S.camFwd) > 0) { // behind-camera never brackets (no honest projection exists)
        S.ndc.copy(lockTarget.position).project(C.camera);
        kx = Math.round(((S.ndc.x + 1) / 2) * window.innerWidth);
        ky = Math.round((1 - (S.ndc.y + 1) / 2) * window.innerHeight);
        vis = true;
      }
    }
    if (vis !== brVis || (vis && (kx !== brX || ky !== brY))) {
      C.ui.lockBr.hidden = !vis;
      if (vis) C.ui.lockBr.style.transform = `translate(${kx}px, ${ky}px)`;
      brVis = vis; brX = kx; brY = ky;
    }
  }
}

export function resetAimHud() { // clearCombat drain (§8.6): the pad never inherits combat's aim HUD
  lockTarget = null;
  if (C && C.ui) {
    if (C.ui.pipper) { C.ui.pipper.hidden = true; C.ui.pipper.classList.remove('locked'); }
    if (C.ui.lockBr) C.ui.lockBr.hidden = true;
  }
  pipShow = false; pipLocked = false; brVis = false; brX = -1; brY = -1;
}

/* ---------- honesty surface (combatState reads these — the harness-visible lock state) ---------- */
export function lockState() { // null or a fresh { kind, x, y, z } — the bracket's anchor, never a live reference
  if (!lockTarget || !lockTarget.userData || !lockTarget.userData.alive) return null;
  const p = lockTarget.position;
  return { kind: lockTarget.userData.kind || 'orb', x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) };
}
export function pipperState() { // stage-6 H1 honesty rider: the pipper's real render state — the
  // writer's OWN stored gate + the divergence it measured (never recomputed here, so this can
  // never disagree with the element the way a second gate could). Zero-state before the first
  // hudTick (not ready / never in combat): { visible: false, divergenceDeg: 0 }.
  return { visible: pipShow, divergenceDeg: pipDivDeg };
}
