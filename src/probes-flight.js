// STAGE TWO — stage-7 story 7.0 FLIGHT-BASELINE probe drive (one walk per file — the
// story-018 split precedent). Owns ?flightProbe=1 and NOTHING else. Measures the OLD flight
// model end-to-end so story 7.1/7.3's new asserts are provably red for the right reason
// (the honest-red witness — spec §7.0; the pitchProbe precedent inverted: this story's NEW
// asserts are green-on-old BY DESIGN, and the red-first debt transfers to 7.1/7.3 where
// these same asserts flip red on the pre-change build). ZERO gameplay change: the drive
// synthesizes keys into the REAL key set (pitchProbe pattern), parks/seats the ship
// (probe-owned precondition), and samples C state. No bolts spawned, no enemies used.
//
// Stages, in order (every stage has a deadline — a stuck stage reports honestly, never wedges):
//   0 settle (0.4 s) — field cleared, ship parked at O (heading 0 / pitch 0 / speed 0).
//   1 pitch-envelope (1.5 s) — R held; pitchMax = max C.pitch. OLD model: clamps at
//     PITCH_MAX 1.2566 (0.70 s to reach at PITCH_RATE 1.8) and STAYS. GOES RED IN 7.1
//     (the loop replaces the clamp — pitchMax would run toward 1.8·1.5 ≈ 2.7).
//   2 no-roll (1.5 s) — A held 0.8 s (bank → −0.7) then released 0.7 s: the pose up-vector
//     vs the heading/pitch-only reference up must differ by EXACTLY |bank| (roll is
//     bank-cosmetic only in the old YXZ euler write). rollTwist = max |twist − |bank_prev||;
//     bank_prev is the bank of the PREVIOUS tick because pose.rotation is written AFTER the
//     probe ticks (the one-frame lag pitchProbe rider R-g documented) — comparing against
//     the live bank would read the lerp's per-frame step (~0.08 early) and false-red.
//     GOES RED IN 7.1 (roll becomes real — pose up diverges beyond bank).
//   3 alignment A — W to cruise (≥16.5, timeout 2.5 s), then the yaw window opens ONCE.
//   4 alignment B — A held: at the first tick ≥ 1.0 s slip (deg, vel vs forward) + velMag
//     sampled (the story-015 grammar, copied not imported).
//   5 fov — S brake to speed < 1 (timeout 2.5 s) → fovRest; then W+Shift 2.0 s → fovBoost
//     sampled at the max-speed tick while boosting. OLD model: both 62 (constant).
//     GOES RED IN 7.1 (F8: speed FOV 62 → 74, monotone with |vel|).
//   6 camera-lag (3.2 s) — full-yaw sweep (A held 2π/TURN_RATE + margin) at cruise:
//     camLag = max angle (rad) between the RENDERED camera's up and the ship's up. OLD
//     model: the chase cam never rolls (lookAt + world-up) → camLag ≈ |bank| ≈ 0.7.
//     GOES RED IN 7.1 (F7: 0.4 roll-follow — residual twist drops to ~60% of bank).
//   7 clamp (7 s) — reseat at O, vel seated along the nose, W+Shift held: boost radially
//     out. maxR3 = max |pos − O| sampled (probes run after steer(), so the sample reads the
//     post-bleed post-clamp position). OLD model: hard stop at R_HARD 80 → maxR3 ≤ 81.
//     GOES RED IN 7.3 (F9: the clamp becomes conditional on boss presence — D-7.2).
// Report: window.__stage2.flightProbe = { pitchMax, rollTwist, slip, velMag, fovRest,
// fovBoost, camLag, maxR3 } (+ lastReport parity via api.report). flightProbeLive is the
// screenshot hook. Import rule unchanged: probes never import combat.js — the tick receives
// combat state + the pure helpers as arguments (R-e discipline).
import { THREE } from 'stage-two-lib';
import { cpFieldClear, cpPin } from './probes-common.js';

const FLIGHT_PROBE = new URLSearchParams(location.search).get('flightProbe') === '1';

// scratch — module-level, reused every tick (no per-frame allocation beyond the report)
const EU = new THREE.Euler(0, 0, 0, 'YXZ'); // the OLD model's pose composition, minus roll
const QU = new THREE.Quaternion();
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const REF_UP = new THREE.Vector3(); // heading/pitch-only up (the no-roll reference)
const POSE_UP = new THREE.Vector3(); // the rendered ship's up
const CAM_UP = new THREE.Vector3(); // the rendered camera's up

// walk state (droneProbe pattern: plain state HERE, reset by resetFlightProbe on combat entry)
const FL = {
  t: 0, stage: 0, mark: 0, done: false,
  pitchMax: 0, rollTwist: 0, prevBank: 0,
  slip: null, velMag: null,
  fovRest: null, fovBoost: null, boostSpeed: 0,
  camLag: 0, maxR3: 0,
};

export function resetFlightProbe() { // stale-delete hygiene (resetProbes calls this on every combat enter)
  Object.assign(FL, {
    t: 0, stage: 0, mark: 0, done: false,
    pitchMax: 0, rollTwist: 0, prevBank: 0,
    slip: null, velMag: null,
    fovRest: null, fovBoost: null, boostSpeed: 0,
    camLag: 0, maxR3: 0,
  });
  delete window.__stage2.flightProbe; // a fresh combat must never inherit the previous walk's report
  window.__stage2.flightProbeLive = false;
}

const upTwist = (upA, upB) => Math.acos(Math.max(-1, Math.min(1, upA.dot(upB)))); // rad

export function flightProbeTick(dt, C, env) {
  if (!FLIGHT_PROBE || FL.done) return;
  FL.t += dt;
  cpPin(C, true); // wave pinned at 1 with a 99 s gap + healed — the walk cannot die mid-drive (probes-common)
  cpFieldClear(C); // the field never crowds the walk — wave raiders respawn ~1.6 s after emptiness
  window.__stage2.flightProbeLive = true;
  const keys = C.api.input.keys;

  if (FL.stage === 0) { // settle — park the ship at O
    C.pos.set(0, env.ARENA_Y, 0); C.vel.set(0, 0, 0); C.speed = 0; C.pitch = 0; C.heading = 0;
    C.api.input.mouseActive = false; // pointer parked — no steering interference
    keys.delete('KeyW'); keys.delete('KeyA'); keys.delete('KeyD'); keys.delete('KeyS'); keys.delete('KeyR'); keys.delete('KeyF'); keys.delete('ShiftLeft'); keys.delete('ShiftRight');
    if (FL.t >= 0.4) { FL.stage = 1; FL.mark = FL.t; keys.add('KeyR'); }
    return;
  }

  if (FL.stage === 1) { // pitch-envelope: R held 1.5 s — clamps at PITCH_MAX and STAYS
    FL.pitchMax = Math.max(FL.pitchMax, C.pitch);
    if (FL.t >= FL.mark + 1.5) {
      keys.delete('KeyR');
      C.pitch = 0; FL.prevBank = C.bank; // stage 2 opens with the pose still showing bank ≈ 0
      FL.stage = 2; FL.mark = FL.t;
      keys.add('KeyA');
    }
    return;
  }

  if (FL.stage === 2) { // no-roll: pose up vs heading/pitch reference up — twist must equal |bank_prev|
    EU.set(-C.pitch, C.heading, 0); // the OLD model's euler WITHOUT the roll term
    QU.setFromEuler(EU);
    REF_UP.copy(AXIS_Y).applyQuaternion(QU);
    POSE_UP.copy(AXIS_Y).applyQuaternion(C.pose.quaternion); // previous frame's pose (see header)
    const twist = upTwist(POSE_UP, REF_UP);
    FL.rollTwist = Math.max(FL.rollTwist, Math.abs(twist - Math.abs(FL.prevBank)));
    FL.prevBank = C.bank; // this tick's bank is what NEXT tick's pose was written with
    if (FL.t >= FL.mark + 1.5) { // 0.8 s A hold (bank → −0.7) + 0.7 s release (bank → 0)
      keys.delete('KeyA');
      FL.stage = 3; FL.mark = FL.t;
      keys.add('KeyW'); // cruise for the alignment stage
    }
    return;
  }

  if (FL.stage === 3) { // alignment A: W to cruise (≥16.5, timeout 2.5 s) — then open the yaw window ONCE
    if (C.speed >= 16.5 || FL.t >= FL.mark + 2.5) {
      FL.mark = FL.t; keys.add('KeyA'); FL.stage = 4;
    }
    return;
  }

  if (FL.stage === 4) { // alignment B: 1.0 s full yaw — slip + velMag sampled at the first tick ≥ 1.0 s (story-015 grammar)
    if (FL.t >= FL.mark + 1.0) {
      keys.delete('KeyA');
      const f = env.forward(C.tmp);
      const dot = env.clamp(C.vel.dot(f) / Math.max(0.001, C.vel.length()), -1, 1);
      FL.slip = +(Math.acos(dot) * 180 / Math.PI).toFixed(2);
      FL.velMag = +C.vel.length().toFixed(3);
      keys.delete('KeyW'); keys.add('KeyS'); // brake for the fov stage
      FL.stage = 5; FL.mark = FL.t;
    }
    return;
  }

  if (FL.stage === 5) { // fov: rest sample, then boost sample at the max-speed tick
    if (FL.fovRest === null) {
      if (C.speed < 1 || FL.t >= FL.mark + 2.5) {
        FL.fovRest = +C.camera.fov.toFixed(2);
        keys.delete('KeyS'); keys.add('KeyW'); keys.add('ShiftLeft');
        FL.mark = FL.t;
      }
      return;
    }
    if (C.boosting && C.speed > FL.boostSpeed) { FL.boostSpeed = C.speed; FL.fovBoost = +C.camera.fov.toFixed(2); }
    if (FL.t >= FL.mark + 2.0) {
      keys.delete('ShiftLeft'); // W stays held — cruise into the camera-lag sweep
      FL.stage = 6; FL.mark = FL.t;
      keys.add('KeyA');
    }
    return;
  }

  if (FL.stage === 6) { // camera-lag: full-yaw sweep — rendered camera up vs ship up
    POSE_UP.copy(AXIS_Y).applyQuaternion(C.pose.quaternion);
    CAM_UP.copy(AXIS_Y).applyQuaternion(C.camera.quaternion);
    FL.camLag = Math.max(FL.camLag, upTwist(CAM_UP, POSE_UP));
    if (FL.t >= FL.mark + 2 * Math.PI / env.TURN_RATE + 0.3) {
      keys.delete('KeyA');
      // stage 7 seat: O, nose +z, vel along the nose — boost energy regened ~0.9 over the sweep
      C.pos.set(0, env.ARENA_Y, 0); C.heading = 0; C.pitch = 0;
      C.vel.copy(env.forward(C.tmp)).multiplyScalar(C.speed);
      keys.add('ShiftLeft');
      FL.stage = 7; FL.mark = FL.t;
    }
    return;
  }

  if (FL.stage === 7) { // clamp: boost radially out — hard stop at R_HARD
    const r3 = Math.hypot(C.pos.x, C.pos.y - env.ARENA_Y, C.pos.z);
    FL.maxR3 = Math.max(FL.maxR3, r3);
    if (FL.t >= FL.mark + 7.0) {
      keys.delete('KeyW'); keys.delete('ShiftLeft'); // the drive stops driving once the report latches
      FL.done = true;
      const probe = {
        pitchMax: +FL.pitchMax.toFixed(4),
        rollTwist: +FL.rollTwist.toFixed(4),
        slip: FL.slip, velMag: FL.velMag,
        fovRest: FL.fovRest, fovBoost: FL.fovBoost,
        camLag: +FL.camLag.toFixed(4),
        maxR3: +FL.maxR3.toFixed(2),
      };
      window.__stage2.flightProbe = probe;
      window.__stage2.flightProbeLive = false;
      C.api.report({ flightProbe: probe }); // parity with scriptedKill/droneProbe — lands on __stage2.lastReport too
    }
  }
}
