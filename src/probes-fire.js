// STAGE TWO — stage-6 W1 FIRE-PATH probe drive (one walk per file — the story-018 split
// precedent). Owns ?fireProbe=1 and NOTHING else. The drive SEEDS deterministic targets and
// captures real fired bolts — it never spawns a bolt itself. That is the whole point (the W1
// card's fire-path baseline): every pre-W1 probe bypassed spawnBolt (scriptedKill/pitchProbe/
// bossProbe/powerupProbe all place bolts via C.bolts.spawn or E.bolts directly), so the REAL
// trigger path (input.js onPointerDown → fireTick → spawnStreamShot → spawnBolt → boltsTick)
// had zero assert coverage. Here the trigger is REAL CDP pointer input: the drive raises a
// window.__stage2.fireArmN flag, the flow-check harness performs Input.dispatchMouseEvent
// mousePressed/mouseReleased (the same listener chain a player's click hits), and the drive
// reads the bolt pool (pool.update(0, …) — the ENEMIES.eachAlive trick) to capture
// b.userData.dir of the bolts that actually flew. Dir is FINAL at spawn (boltsTick never
// rewrites it), so the capture is exact.
//
// Stages (all targets probe-pinned at their seat — probe-owned precondition, the pitchProbe
// lockstep precedent; the rammer's seek/wobble would otherwise drift it off the bolt ray):
//   1  fire-path BASELINE — rammer seeded dead-ahead at 9 u on the nose axis; a real fired
//      bolt must fly along forward() (|dir−forward| ≤ ~1.1°) and kill the target. GREEN ON
//      THE PRE-W1 BUILD BY DESIGN (documented in flow-check + evidence) — this is the
//      invariant the W1 spawn bias must never break.
//   2  bias cap + hysteresis + dead-drop — target seeded dead-ahead (acquire ≤6°), then
//      parked at 8.5° (OUTSIDE acquire, INSIDE retain ~10°): the lock must retain, the fired
//      bolt must converge (≥5.5° off the nose — bias did work) but never exceed 6.3° (the 6°
//      bias cap), and the real bolt's kill must DROP the lock.
//   3  SPREAD fan + bias — target parked at +4° (in-cone), hp 999 probe-stamped (alive for
//      the whole window so the lock holds), C.effects.SPREAD = 8 (probe-stamped, the
//      powerupProbe precedent): the far fan bolt (−6°) must NOT fully converge (the 6° bias
//      clamp binds; unclamped it would land on the target) and every bolt stays ≤6.3° off the
//      nose (stage-scoped band: fresh-acquire geometry).
//   4  outside-cone never locks — target parked at 20° (outside acquire 6° and retain 10°):
//      lock stays false, fired bolts stay unbiased.
//   5  THE BOSS NEVER LOCKS — BOSS.spawnForProbe parks the boss dead-ahead 26 u (dead-center
//      in the acquire cone) for 2.2 s: lock stays false the whole window. The boss is excluded
//      from the candidate scan BY CONSTRUCTION (aim-assist.js header documents why: the
//      weak-point zone centers on the boss position, boss.js boltHit — a 6° cone would
//      automate the ×3 weak-point skill). spawnForProbe delays the first volley to 4.0 s
//      (boss.js) so the 2.2 s window is volley-free.
//   6  story 7.4 CAMERA-AXIS HIT WITNESS (RED-first, 2026-11-10) — a raider seated exactly ON
//      the camera axis at 16 / 24 / 34 u (seat = camPos + camForward·D, live-read from
//      C.camera): real fired bolts must kill it at all three ranges, and the lock must
//      acquire within ~1 frame of the seat entering the acquire cone. The pre-7.4 nose-aim
//      build MISSES all three (the camera sits 3.4 u above the ship and looks 4 u ahead while
//      bolts fly the nose — the two lines only cross 4 u out, so an on-axis target is hit
//      high: perpendicular miss 2.1 / 4.4 / 7.2 u against the 1.05 u kill sphere) and never
//      locks (the seat sits 8-12° off the NOSE, outside the old 6° acquire cone).
// Reports window.__stage2.fireProbe = { s1, s2, s3, s4, boss, s6, lockWasDefined, lockEverTrue }.
// lockWasDefined/lockEverTrue make the feature-absent build record honest reds (lock reads
// undefined there) instead of vacuous greens. Import rule unchanged: probes never import
// combat.js — the tick receives combat state + the pure helpers as arguments (R-e discipline);
// the lock state itself is read through the sanctioned window.__stage2.combatState() surface.
import { THREE } from 'stage-two-lib';
import * as ENEMIES from './enemies.js';
import * as BOSS from './boss.js';
import { cpFieldClear, cpPin } from './probes-common.js';

const qs = new URLSearchParams(location.search);
const FIRE_PROBE = qs.get('fireProbe') === '1'; // stage-6 W1: real-fire bolt-capture walk

// probe geometry (u, degrees): every seat is ship-relative at heading 0 / pitch 0, so the nose
// axis is +Z and a yaw seat is exactly (sin a · r, 0, cos a · r) off C.pos.
const SEAT_R = 9;
const PARK2_YAW = 8.5;   // inside retain (~10°), outside acquire (6°) — the hysteresis seat
const PARK3_YAW = 4;     // inside acquire — the SPREAD fan-clamp seat
const PARK4_YAW = 20;    // outside both cones — the never-locks seat
const BOSS_SEAT_R = 26;  // dead-ahead, dead-center in the acquire cone — the exclusion seat
const seat = (yawDeg, out) => out.set(Math.sin(yawDeg * Math.PI / 180) * SEAT_R, 0, Math.cos(yawDeg * Math.PI / 180) * SEAT_R);

// story 7.4 camera-axis seat constants + helper: seat = camPos + rotate(camFwd, degOff about
// WORLD_UP) · dist — the camera-relative form the new lock/aim model is measured against.
const CAM_AXIS_D = [16, 24, 34]; // stage-6 sub-phase seats (u from the camera, on the camera axis)
const CAM_SEAT_D = 16;           // re-seated stages 2-4 (u from the camera along the offset dir)
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// stage-6 W1 walk state (droneProbe pattern: plain state HERE, reset by resetFireProbe on combat entry)
const FP = {
  t: -1, stage: 0, sT: 0, mark: 0, done: false,
  target: null, boss: null, seen: null,
  s1: null, s2: null, s3: null, s4: null, s5: null, s6: null,
  lockDefined: false, lockEverTrue: false,
  parked: false, armed: false, killed: false, dirs: null,
};

// story 7.4 stage-6 sub-phase record factory (one per camera-axis seat)
const mkS6Rec = (d) => ({ d, seatDeg: null, lockFrames: null, frames: 0, armed: false, killed: false, timeout: false });

export function resetFireProbe() { // stale-delete hygiene (resetProbes calls this on every combat enter)
  Object.assign(FP, {
    t: -1, stage: 0, sT: 0, mark: 0, done: false,
    target: null, boss: null, seen: null,
    s1: null, s2: null, s3: null, s4: null, s5: null, s6: null,
    lockDefined: false, lockEverTrue: false,
    parked: false, armed: false, killed: false, dirs: null,
  });
  delete window.__stage2.fireProbe;
  delete window.__stage2.fireArm; // the REAL-input arm flags never survive an entry
  delete window.__stage2.fireGo1;
  delete window.__stage2.fireArm2;
  delete window.__stage2.fireGo2;
  delete window.__stage2.fireArm3;
  delete window.__stage2.fireGo3;
  delete window.__stage2.fireArm4;
  delete window.__stage2.fireGo4;
  delete window.__stage2.fireArm6;
  delete window.__stage2.fireGo6;
  delete window.__stage2.fireArm6b;
  delete window.__stage2.fireGo6b;
  delete window.__stage2.fireArm6c;
  delete window.__stage2.fireGo6c;
}

/* ---------- in-page helpers (no allocation per tick beyond the report) ---------- */
const V = { // scratch (module-level — no per-tick allocation)
  f: new THREE.Vector3(), camPos: new THREE.Vector3(), camFwd: new THREE.Vector3(),
  rot: new THREE.Vector3(), muzzle: new THREE.Vector3(), exp: new THREE.Vector3(),
};
function camSeat(c, degOff, dist, out) { // seat on a cone around the CAMERA axis: camPos + rotate(camFwd, degOff about WORLD_UP)·dist (c = the tick's live combat state — module scope has no C)
  c.camera.getWorldPosition(V.camPos);
  c.camera.getWorldDirection(V.camFwd);
  V.rot.copy(V.camFwd).applyAxisAngle(WORLD_UP, degOff * Math.PI / 180).normalize();
  return out.copy(V.camPos).addScaledVector(V.rot, dist);
}
function camStateSnap(c) { // refresh V.camPos/V.camFwd without seating (the expected-dir math reads these)
  c.camera.getWorldPosition(V.camPos);
  c.camera.getWorldDirection(V.camFwd);
}
function snapLock() { // the lock state through the sanctioned harness surface (probes never import combat.js)
  try {
    const cs = window.__stage2.combatState();
    // lockTarget is the ACQUISITION surface (null = nothing locked; undefined = the feature is
    // absent on a pre-W1 build — recorded so the reds are honest, never vacuous greens). The
    // toggle surface (combatState().lock) is the T battery's business, not the drive's.
    if (cs.lockTarget !== undefined) FP.lockDefined = true;
    if (cs.lockTarget) FP.lockEverTrue = true;
    return cs;
  } catch { return null; }
}
function lockedNow(cs) { // true = a target is locked; false = lock surface live but nothing locked; null = feature absent
  if (!cs) return null;
  if (cs.lockTarget === undefined) return null;
  return !!cs.lockTarget;
}
function angDeg(a, b) { // angle between two [x,y,z] triples, degrees
  const la = Math.hypot(a[0], a[1], a[2]), lb = Math.hypot(b[0], b[1], b[2]);
  if (la < 1e-9 || lb < 1e-9) return 0;
  const d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
}
function captureBolt(C, env) { // FIRST unseen live bolt → { dir, fwd } snapshots (dir is final at spawn — W1 bias included)
  let cap = null;
  C.bolts.update(0, (b) => {
    if (!cap && b.userData.alive && !FP.seen.has(b)) {
      FP.seen.add(b);
      const f = env.forward(V.f);
      cap = { dir: [b.userData.dir.x, b.userData.dir.y, b.userData.dir.z], fwd: [f.x, f.y, f.z] };
    }
  });
  return cap;
}
function captureAll(C, arr) { // EVERY unseen live bolt → dir triples (the fan stage captures all three sides)
  C.bolts.update(0, (b) => {
    if (b.userData.alive && !FP.seen.has(b)) {
      FP.seen.add(b);
      arr.push([b.userData.dir.x, b.userData.dir.y, b.userData.dir.z]);
    }
  });
}

/* ---------- the walk ---------- */
export function fireProbeTick(dt, C, env) {
  if (!FIRE_PROBE || FP.done) return;
  FP.t += dt; FP.sT += dt;
  cpPin(C, true); // wave pinned at 1 with a 99 s gap + healed — the walk cannot die mid-drive (probes-common)
  // ship parked at the origin seat: heading 0 / pitch 0 / speed 0 — the seat math above assumes
  // the nose axis is exactly +Z (probe-owned precondition; no pointer moves on this page)
  C.vel.set(0, 0, 0); C.speed = 0; C.pitch = 0; C.heading = 0;

  switch (FP.stage) {
    case 0: // settle, then open stage 1 — story 7.4: 1.6 s (was 0.4) so the chase cam is FULLY
      // settled (e^-8 ≈ 0.03% of any entry offset remains) before the camera-relative seat math
      // and the converge-aim measurement read the live camera
      if (FP.sT >= 1.6) {
        cpFieldClear(C);
        FP.seen = new Set(); FP.stage = 1; FP.sT = 0; FP.mark = 0;
        FP.s1 = { lockSeen: false, bracketOnLock: false, boltCaptured: false, dirDeg: null, convDeg: null, killConfirmed: false, markElSeen: false, killMarkSeen: false }; // stage-6 H1: kill-marker fields ride the stage record
      }
      return;

    case 1: { // BASELINE: dead-ahead seed, REAL CDP fire, bolt flies along forward and kills
      const cs = snapLock();
      if (lockedNow(cs) === true) FP.s1.lockSeen = true;
      if (!FP.target) {
        env.forward(C.tmp);
        FP.seatV = C.tmp2.copy(C.pos).addScaledVector(C.tmp, SEAT_R);
        FP.seat = [FP.seatV.x, FP.seatV.y, FP.seatV.z];
        FP.target = ENEMIES.spawnForProbe(C.tmp2);
        window.__stage2.fireArm = true; // harness: real mousePressed → 0.5 s hold → mouseReleased → fireGo1
        return;
      }
      if (FP.target.userData.alive) FP.target.position.set(FP.seat[0], FP.seat[1], FP.seat[2]); // pinned at the seat
      else FP.s1.killConfirmed = true;
      if (!FP.s1.boltCaptured) {
        const cap = captureBolt(C, env);
        if (cap) { FP.s1.boltCaptured = true; FP.s1.dirDeg = +angDeg(cap.dir, cap.fwd).toFixed(2); }
      }
      // bracket honesty sample: the dead-ahead target is in-cone, so on the W1 build the lock
      // acquires it and the bracket renders ON it (pre-W1 build: element absent → stays false)
      try {
        const el = document.getElementById('lock-bracket');
        if (el && el.hidden === false && FP.s1.lockSeen) FP.s1.bracketOnLock = true;
      } catch { /* DOM read is best-effort */ }
      // stage-6 H1: the kill-only hit marker — sampled beside the kill confirmation. The
      // writer runs later in the same tickCombat (the probe ticks precede the HUD block), so
      // the sticky sample catches the marker's visible ~150 ms window from the next tick.
      // Element-absent (pre-H1) records honestly via markElSeen.
      try {
        const hm = document.getElementById('hit-mark');
        if (hm) { FP.s1.markElSeen = true; if (FP.s1.killConfirmed && hm.hidden === false) FP.s1.killMarkSeen = true; }
      } catch { /* DOM read is best-effort */ }
      if (FP.sT >= 2.2) { // kill window done (press lands ~0.4 s + flight 0.2 s + margin)
        cpFieldClear(C); FP.target = null; FP.seen = new Set(); FP.stage = 2; FP.sT = 0; FP.mark = 0;
        C.bolts.clear(); // drain stage-1's leftover hold bolts — a live leftover would be captured as stage 2's "first bolt" (its unbiased dir would mask the bias measurement; RED-run finding, fixed before green)
        FP.s2 = { lockSeen: false, lockRetainedSeen: false, biasDeg: null, lockAfterKill: null, parked: false, armed: false };
      }
      return; }

    case 2: { // bias cap + hysteresis + dead-target drop
      const cs = snapLock();
      if (!FP.target) {
        env.forward(C.tmp);
        FP.target = ENEMIES.spawnForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, SEAT_R));
        return;
      }
      if (!FP.s2.parked) {
        if (lockedNow(cs) === true) FP.s2.lockSeen = true;
        if (FP.s2.lockSeen || FP.sT >= 2.0) { FP.s2.parked = true; FP.mark = FP.sT; } // pre-W1: 2 s timeout, park anyway — the red records honestly
        return;
      }
      // park at 8.5° yaw: OUTSIDE acquire (6°), INSIDE retain (~10°) — a retained lock must hold.
      // A dead slot is NEVER re-pinned (the pool's kill already retired it; pinning would resurrect it).
      if (FP.target.userData.alive) {
        seat(PARK2_YAW, C.tmp).add(C.pos);
        FP.target.position.copy(C.tmp);
      }
      if (!FP.s2.armed) {
        if (lockedNow(cs) === true) FP.s2.lockRetainedSeen = true;
        if (FP.sT - FP.mark >= 0.35) { FP.s2.armed = true; FP.mark = FP.sT; window.__stage2.fireArm2 = true; }
        return;
      }
      if (!window.__stage2.fireGo2) { // real hold in flight — capture the FIRST fired bolt only
        // (later shots ride past the killed target unbiased and must not overwrite the record —
        // the first capture IS the bias measurement; this overwrite was the RED-run-to-green
        // finding that biasDeg read 0 while the bolt demonstrably converged)
        const cap = captureBolt(C, env);
        if (cap && FP.s2.biasDeg === null) FP.s2.biasDeg = +angDeg(cap.dir, cap.fwd).toFixed(2);
        if (FP.sT - FP.mark >= 6) { FP.mark = FP.sT; window.__stage2.fireGo2 = true; } // deadline guard — record the honest red
        return;
      }
      // post-fire: the capped bolt converges 6° and still hits the parked target (0.24 < the
      // 1.1 kill-sphere² at closest approach) → the target dies → the lock must DROP
      if (!FP.target.userData.alive) FP.killed = true;
      if (FP.killed || FP.sT - FP.mark >= 1.2) {
        FP.s2.killed = FP.killed;
        FP.s2.lockAfterKill = lockedNow(cs); // feature: false (the lock dropped) · pre-W1: null (surface absent)
        cpFieldClear(C); FP.target = null; FP.killed = false; FP.seen = new Set();
        C.bolts.clear(); // drain stage-2's leftover hold bolts (post-kill shots fly unbiased — they must not pollute stage 3's fan capture)
        FP.stage = 3; FP.sT = 0; FP.mark = 0;
        FP.s3 = { lockSeen: false, spreadSeen: false, boltCount: 0, maxAngleToTarget: null, maxAngleToForward: null, dirs: [], tgt: null };
      }
      return; }

    case 3: { // SPREAD fan + bias: the far fan bolt must NOT fully converge (the clamp binds)
      const cs = snapLock();
      if (!FP.target) {
        C.effects.SPREAD = 8; // probe-stamped (powerupProbe precedent) — one shot = 3 fan bolts at ±6°
        env.forward(C.tmp);
        FP.target = ENEMIES.spawnForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, SEAT_R));
        FP.target.userData.hp = 999; // probe-stamped: alive for the whole window so the lock holds (this stage measures dirs, not the kill)
        seat(PARK3_YAW, C.tmp).add(C.pos);
        FP.target.position.copy(C.tmp);
        FP.s3.tgt = [FP.target.position.x, FP.target.position.y, FP.target.position.z];
        FP.s3.ship = [C.pos.x, C.pos.y, C.pos.z];
        return;
      }
      if (FP.target.userData.alive) FP.target.position.set(FP.s3.tgt[0], FP.s3.tgt[1], FP.s3.tgt[2]); // parked (never re-pin a dead slot)
      FP.s3.spreadSeen = FP.s3.spreadSeen || C.effects.SPREAD > 0;
      if (lockedNow(cs) === true) FP.s3.lockSeen = true;
      if (!FP.s3.armed) {
        if (FP.s3.lockSeen || FP.sT >= 2.0) { FP.s3.armed = true; FP.mark = FP.sT; window.__stage2.fireArm3 = true; }
        return;
      }
      if (!window.__stage2.fireGo3) {
        captureAll(C, FP.s3.dirs);
        if (FP.sT - FP.mark >= 6) { FP.mark = FP.sT; window.__stage2.fireGo3 = true; } // deadline guard
        return;
      }
      if (FP.sT - FP.mark < 0.3) return; // settle — let the last shot's bolts land in the capture
      captureAll(C, FP.s3.dirs);
      const f = env.forward(C.tmp);
      const fw = [f.x, f.y, f.z];
      const tdir = [FP.s3.tgt[0] - FP.s3.ship[0], FP.s3.tgt[1] - FP.s3.ship[1], FP.s3.tgt[2] - FP.s3.ship[2]]; // ship-relative (the cone definition)
      let maxT = 0, maxF = 0;
      for (const d of FP.s3.dirs) { maxT = Math.max(maxT, angDeg(d, tdir)); maxF = Math.max(maxF, angDeg(d, fw)); }
      FP.s3.boltCount = FP.s3.dirs.length;
      FP.s3.maxAngleToTarget = +maxT.toFixed(2);
      FP.s3.maxAngleToForward = +maxF.toFixed(2);
      C.effects.SPREAD = 0;
      cpFieldClear(C); FP.target = null; FP.seen = new Set();
      C.bolts.clear(); // drain stage-3's fan bolts (hp-999 target never dies — its bolts live past the transition)
      FP.stage = 4; FP.sT = 0; FP.mark = 0;
      FP.s4 = { locked: null, lockEverTrue: false, boltAngleToForward: null, armed: false };
      return; }

    case 4: { // outside-cone never locks
      const cs = snapLock();
      if (!FP.target) {
        env.forward(C.tmp);
        FP.target = ENEMIES.spawnForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, SEAT_R));
        seat(PARK4_YAW, C.tmp).add(C.pos);
        FP.target.position.copy(C.tmp);
        FP.park4 = [FP.target.position.x, FP.target.position.y, FP.target.position.z];
        return;
      }
      if (FP.target.userData.alive) FP.target.position.set(FP.park4[0], FP.park4[1], FP.park4[2]); // parked at 20° (never re-pin a dead slot)
      FP.s4.locked = lockedNow(cs); // feature: false expected · pre-W1: null (surface absent)
      if (lockedNow(cs) === true) FP.s4.lockEverTrue = true;
      if (!FP.s4.armed) {
        if (FP.sT >= 0.8) { FP.s4.armed = true; FP.mark = FP.sT; window.__stage2.fireArm4 = true; }
        return;
      }
      if (!window.__stage2.fireGo4) {
        const cap = captureBolt(C, env);
        if (cap && FP.s4.boltAngleToForward === null) FP.s4.boltAngleToForward = +angDeg(cap.dir, cap.fwd).toFixed(2); // first bolt only (all unbiased here — no lock — but record the first regardless)
        if (FP.sT - FP.mark >= 6) { FP.mark = FP.sT; window.__stage2.fireGo4 = true; } // deadline guard
        return;
      }
      if (FP.sT - FP.mark < 0.3) return;
      cpFieldClear(C); FP.target = null; FP.seen = new Set();
      C.bolts.clear(); // drain stage-4's hold bolts
      FP.stage = 5; FP.sT = 0; FP.mark = 0;
      FP.s5 = { bossAliveSeen: false, bossInConeEver: false, bossLockSeen: false };
      return; }

    case 5: { // THE BOSS NEVER LOCKS — parked dead-ahead, dead-center in the acquire cone
      const cs = snapLock();
      if (!FP.boss) {
        cpFieldClear(C);
        env.forward(C.tmp);
        FP.boss = BOSS.spawnForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, BOSS_SEAT_R));
        FP.bossSeat = [FP.boss.position.x, FP.boss.position.y, FP.boss.position.z];
        return;
      }
      FP.boss.position.set(FP.bossSeat[0], FP.bossSeat[1], FP.bossSeat[2]); // parked (defeats the orbit — probe-owned precondition)
      if (cs && cs.boss) FP.s5.bossAliveSeen = true;
      const bd = [FP.bossSeat[0] - C.pos.x, FP.bossSeat[1] - C.pos.y, FP.bossSeat[2] - C.pos.z];
      if (angDeg(bd, [0, 0, 1]) <= 6) FP.s5.bossInConeEver = true; // parked dead-ahead → true every tick (proves the seat was in-cone)
      if (lockedNow(cs) === true) FP.s5.bossLockSeen = true;
      if (FP.sT >= 2.2) {
        BOSS.clearBoss(); // the latch re-arms (§8.6) — the page's combat stays clean after the walk
        cpFieldClear(C); // also drains any volley bolts (they ride E.bolts)
        FP.stage = 6; FP.sT = 0; FP.mark = 0; FP.seen = new Set();
        FP.s6 = { phase: 0, rec: mkS6Rec(CAM_AXIS_D[0]), d16: null, d24: null, d34: null };
        try { // park the cursor at screen center for the stage (the same dispatch pattern the harness pipper asserts use)
          window.dispatchEvent(new PointerEvent('pointermove', { clientX: Math.round(window.innerWidth / 2), clientY: Math.round(window.innerHeight / 2), bubbles: true }));
        } catch { /* best-effort */ }
      }
      return; }

    case 6: { // story 7.4 CAMERA-AXIS HIT WITNESS — RED-first 2026-11-10:
      // seen RED against pre-7.4 nose-aim code: the camera sits 3.4 u above the ship and looks
      // 4 u ahead while bolts fly along the nose, so a raider seated exactly ON the camera axis
      // (camPos + camForward·D) is missed at every range (perpendicular miss 2.1/4.4/7.2 u vs
      // the 1.05 u kill sphere) and never locked (8-12° off the NOSE, outside the old 6° cone).
      // Three sequential sub-phases: seat at 16 / 24 / 34 u on the live camera axis, cursor
      // parked at screen center, real CDP fire per sub-phase, hit/miss + lock-latency recorded.
      const cs = snapLock();
      if (!FP.target) { // SEAT: camPos + camForward·D (live-read; the camera is settled by here)
        camSeat(C, 0, CAM_AXIS_D[FP.s6.phase], C.tmp2);
        FP.seat = [C.tmp2.x, C.tmp2.y, C.tmp2.z];
        FP.s6.rec.seatDeg = +angDeg(
          [C.tmp2.x - V.camPos.x, C.tmp2.y - V.camPos.y, C.tmp2.z - V.camPos.z],
          [V.camFwd.x, V.camFwd.y, V.camFwd.z]).toFixed(2); // seat sanity: ≈ 0 by construction
        FP.target = ENEMIES.spawnForProbe(C.tmp2);
        FP.target.position.set(FP.seat[0], FP.seat[1], FP.seat[2]); // pin at the seat (the rammer's seek would drift it)
        return;
      }
      if (FP.target.userData.alive) FP.target.position.set(FP.seat[0], FP.seat[1], FP.seat[2]); // pinned
      const rec = FP.s6.rec;
      rec.frames++;
      if (rec.lockFrames === null && lockedNow(cs) === true) rec.lockFrames = rec.frames; // 1 = the tick after the seat (lockTick runs before this probe in tickCombat)
      if (!rec.armed) {
        if (rec.frames >= 20) { rec.armed = true; window.__stage2[['fireArm6', 'fireArm6b', 'fireArm6c'][FP.s6.phase]] = true; } // lock sample landed; arm the real fire
        return;
      }
      if (!window.__stage2[['fireGo6', 'fireGo6b', 'fireGo6c'][FP.s6.phase]]) {
        if (rec.frames >= 20 + 360) window.__stage2[['fireGo6', 'fireGo6b', 'fireGo6c'][FP.s6.phase]] = true; // deadline guard — record the honest red
        return;
      }
      if (!FP.target.userData.alive) rec.killed = true;
      if (rec.killed || rec.frames >= 20 + 360 + 240) { // kill done or 4 s post-fire timeout
        rec.timeout = !rec.killed;
        FP.s6[['d16', 'd24', 'd34'][FP.s6.phase]] = rec;
        cpFieldClear(C); FP.target = null; FP.seen = new Set();
        C.bolts.clear(); // drain the hold's leftover bolts — a live leftover must not mask the next seat's capture
        FP.s6.phase++;
        if (FP.s6.phase >= CAM_AXIS_D.length) {
          FP.done = true;
          window.__stage2.fireProbe = {
            s1: FP.s1, s2: FP.s2, s3: FP.s3, s4: FP.s4, boss: FP.s5, s6: FP.s6,
            lockWasDefined: FP.lockDefined, lockEverTrue: FP.lockEverTrue,
          };
        } else {
          FP.s6.rec = mkS6Rec(CAM_AXIS_D[FP.s6.phase]);
        }
      }
      return; }
  }
}
