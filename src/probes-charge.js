// STAGE TWO — story-018 CHARGE probe drive (review-fix split, story-018 review round): one walk
// per file — this module owns ?chargeProbe=1 and NOTHING else. VERBATIM move from src/probes.js
// (the R-e discipline): same statements, same order, same comments — zero behavior change. The
// two helpers shared with the powerup walk live in probes-common.js; the three charge-only
// helpers (boltTargetSeat/seedBoltTarget/captureChargedBolt) live here. Import rule unchanged:
// probes never import combat.js — the tick receives combat state + the pure helpers/constants
// as arguments; plain state lives HERE and resets via resetChargeProbe() (probes.js resetProbes
// calls it on every combat enter).
import * as ENEMIES from './enemies.js';
import * as BOSS from './boss.js';
import { cpFieldClear, cpPin } from './probes-common.js';

const qs = new URLSearchParams(location.search);
const CHARGE_PROBE = qs.get('chargeProbe') === '1'; // story-018: deterministic charged-shot walk

// story-018 walk state (droneProbe pattern: plain state HERE, reset by resetChargeProbe on combat entry)
const CP = {
  t: -1, stage: 0, mark: 0, done: false,
  tap: null, hold1: null, oneShotG: null, oneShotE: null, weak: null, burst3: 0,
  pause: null, pauseRelease: null, death: null, chargeMax: 0, chargingSeen: false, reticle: null,
  bStream: 0, bCharged: 0, killsMark: 0, target: null, bossHpMark: 0, armed: false,
  hold1StreamAtCross: 0, burstCycles: 0, burstDiag: [], pauseWall: 0, pauseWall2: 0, cycleB: 0,
};

export function resetChargeProbe() { // moved verbatim from resetProbes (review-fix split): this walk's state bag + report + the harness arm flags — stale-delete hygiene
  Object.assign(CP, {
    t: -1, stage: 0, mark: 0, done: false,
    tap: null, hold1: null, oneShotG: null, oneShotE: null, weak: null, burst3: 0,
    pause: null, pauseRelease: null, death: null, chargeMax: 0, chargingSeen: false, reticle: null,
    bStream: 0, bCharged: 0, killsMark: 0, target: null, bossHpMark: 0, armed: false,
    hold1StreamAtCross: 0, burstCycles: 0, burstDiag: [], pauseWall: 0, pauseWall2: 0, cycleB: 0,
  });
  delete window.__stage2.chargeProbe;
  delete window.__stage2.chargePauseArm; // harness-coordinated cancels: the arm flags never survive an entry
  delete window.__stage2.chargePauseGo;
  delete window.__stage2.chargePauseArm2;
  delete window.__stage2.chargePauseGo2;
  delete window.__stage2.chargeDeathArm;
}

function boltTargetSeat(C, env) { // the one-shot seat: 3 u along the ray FROM THE NOSE — the charged bolt spawns at noseWorld and flies along forward, so a target on that exact ray is a guaranteed scan hit (a ship-center seat sits 1.0 u off the ray, leaving a hit window narrower than one frame step — flaky); all pre-threshold stream bolts are already past 3 u at release (the last fires at chargeT ≤ 0.6, i.e. ≥ 4.2 u out), so the charged hit is cleanly the killing hit
  env.forward(C.tmp);
  env.noseWorld(C.tmp2);
  return C.tmp2.addScaledVector(C.tmp, 3);
}
function seedBoltTarget(C, env, hp, kind) {
  const d = ENEMIES.spawnForProbe(boltTargetSeat(C, env));
  d.userData.kind = kind;
  d.userData.hp = hp;
  d.position.copy(C.tmp2); // exact seat on the nose ray
  return d;
}
function captureChargedBolt(C) { // find the live charged bolt — identity for the harness assert
  let cap = null;
  C.bolts.update(0, (b) => {
    if (b.userData.charged && b.userData.alive && !cap) {
      cap = { scale: b.scale.x, color: b.material.color.getHex(), dmg: b.userData.dmg };
    }
  });
  return cap;
}

/* ---------- story-018 charge probe (?chargeProbe=1) ----------
 * Deterministic walk of the two-stage trigger (droneProbe pattern). The drive writes
 * C.api.input.fire DIRECTLY (probe-owned precondition — the same class as pitchProbe's
 * synthesized keys; input.js is zero-diff by design) and reads combat state + the bolt pool
 * (pool.update(0, …) — the ENEMIES.eachAlive trick). Stages in order:
 *   tap 0.2 s (≥1 stream, 0 charged) → hold 1.0 s (exactly 1 charged on release, ≤6 stream
 *   all pre-threshold — streamAtCross snapshots fired.stream the frame charging latches;
 *   charged identity captured from the live pool) → charged one-shot of a seeded gunner
 *   (hp 2) → of an elite-HP gunner (hp 6, probe-stamped — real elites are story-019) → boss
 *   weak point 18 (probe-stamped charged bolt through hitBoss's dmg param, bossBolt
 *   placement pattern — the release bolt is waited out first so exactly one hit lands) →
 *   3-shot burst = 3 → pause cancel (harness-coordinated: chargePauseArm raised mid-hold
 *   past the threshold; the harness presses the REAL pause keys — setPaused lives in
 *   input.js — and raises chargePauseGo; the drive is FROZEN during the pause like the
 *   game, so its first post-unpause tick reads the zeroed accumulator) → death cancel
 *   (chargeDeathArm → harness probeDamagePlayer(500) → the drive releases and latches the
 *   report BEFORE the death card lands — the dead block runs after the drives in
 *   tickCombat, so fire=false lands the same frame and the slow-mo clock runs its course).
 * Reports window.__stage2.chargeProbe (+ api.report lastReport parity). */
export function chargeProbeTick(dt, C, env) {
  if (!CHARGE_PROBE || CP.done) return;
  CP.t += dt;
  cpPin(C, true);
  if (C.chargeT > CP.chargeMax) CP.chargeMax = C.chargeT;
  if (C.charging) CP.chargingSeen = true;
  const fire = C.api.input.fire;

  switch (CP.stage) {
    case 0: // settle, then baseline + tap
      if (CP.t >= 0.4) {
        cpFieldClear(C);
        C.vel.set(0, 0, 0); C.speed = 0; C.pitch = 0; C.heading = 0;
        CP.bStream = C.fired.stream; CP.bCharged = C.fired.charged;
        C.api.input.fire = true; CP.mark = CP.t; CP.stage = 1;
      }
      return;
    case 1: // tap window
      if (CP.t >= CP.mark + 0.2) {
        C.api.input.fire = false; CP.mark = CP.t; CP.stage = 2;
      }
      return;
    case 2: // tap settle → record
      if (CP.t >= CP.mark + 0.4) {
        CP.tap = { stream: C.fired.stream - CP.bStream, charged: C.fired.charged - CP.bCharged };
        cpFieldClear(C);
        CP.bStream = C.fired.stream; CP.bCharged = C.fired.charged;
        C.api.input.fire = true; CP.mark = CP.t; CP.stage = 3;
      }
      return;
    case 3: // hold 1.0 s — watch the crossing for streamAtCross + reticle evidence
      if (C.charging && !CP.hold1StreamAtCross) CP.hold1StreamAtCross = C.fired.stream - CP.bStream;
      if (!CP.reticle && C.charging && C.chargeT > 0.65) {
        // sampled a few frames PAST the crossing — combat's change-gated reticle write runs
        // after the drives in tickCombat, so the crossing frame's DOM still shows the pre-write state
        try {
          const r = document.getElementById('reticle');
          CP.reticle = {
            chargeClass: r.classList.contains('charge'),
            p: r.style.getPropertyValue('--p'),
            full: r.classList.contains('charge-full'),
          };
        } catch { CP.reticle = { chargeClass: false, p: '', full: false }; }
      }
      if (CP.t >= CP.mark + 1.0) {
        C.api.input.fire = false; CP.mark = CP.t; CP.stage = 4;
      }
      return;
    case 4: // charged bolt spawned on the release frame (+1) — capture identity
      if (C.fired.charged > CP.bCharged) {
        CP.hold1 = {
          stream: C.fired.stream - CP.bStream,
          charged: C.fired.charged - CP.bCharged,
          streamAtCross: CP.hold1StreamAtCross,
          ...(captureChargedBolt(C) || {}),
        };
        CP.mark = CP.t; CP.stage = 5;
      } else if (CP.t > CP.mark + 1.5) { CP.hold1 = { stream: C.fired.stream - CP.bStream, charged: 0, timeout: true }; CP.mark = CP.t; CP.stage = 5; }
      return;
    case 5: // settle → seed the gunner one-shot
      if (CP.t >= CP.mark + 0.4) {
        cpFieldClear(C);
        CP.bCharged = C.fired.charged; CP.killsMark = C.kills;
        CP.stage = 6;
      }
      return;
    case 6: // hold for the gunner one-shot
      if (CP.t >= CP.mark + 0.05) { C.api.input.fire = true; CP.mark = CP.t; CP.stage = 7; }
      return;
    case 7:
      if (CP.t >= CP.mark + 0.7) { C.api.input.fire = false; CP.mark = CP.t; CP.stage = 8; }
      return;
    case 8: // charged in flight — seed the gunner (hp 2) NOW: no stream bolt is inside 3 u (all pre-threshold bolts passed it before the release)
      if (C.fired.charged > CP.bCharged) {
        CP.target = seedBoltTarget(C, env, 2, 'gunner');
        CP.mark = CP.t; CP.stage = 9;
      } else if (CP.t > CP.mark + 1.5) { CP.oneShotG = { killed: false, killsDelta: 0, timeout: true }; CP.stage = 10; }
      return;
    case 9: // pin + wait for the kill
      if (CP.target) {
        env.forward(C.tmp);
        CP.target.position.copy(boltTargetSeat(C, env)); // re-pinned on the flight ray every tick
        if (!CP.target.userData.alive) {
          CP.oneShotG = { killed: true, killsDelta: C.kills - CP.killsMark };
          CP.target = null; CP.mark = CP.t; CP.stage = 10;
        } else if (CP.t > CP.mark + 1.5) {
          CP.oneShotG = { killed: false, killsDelta: C.kills - CP.killsMark, timeout: true };
          ENEMIES.hitDrone(CP.target, 99); CP.target = null; CP.mark = CP.t; CP.stage = 10;
        }
      }
      return;
    case 10: // settle → elite-HP one-shot (probe-stamped hp 6 — a stream bolt would NOT one-shot it)
      if (CP.t >= CP.mark + 0.4) {
        cpFieldClear(C);
        CP.bCharged = C.fired.charged; CP.killsMark = C.kills;
        CP.stage = 11;
      }
      return;
    case 11:
      if (CP.t >= CP.mark + 0.05) { C.api.input.fire = true; CP.mark = CP.t; CP.stage = 12; }
      return;
    case 12:
      if (CP.t >= CP.mark + 0.7) { C.api.input.fire = false; CP.mark = CP.t; CP.stage = 13; }
      return;
    case 13:
      if (C.fired.charged > CP.bCharged) {
        CP.target = seedBoltTarget(C, env, 6, 'gunner');
        CP.mark = CP.t; CP.stage = 14;
      } else if (CP.t > CP.mark + 1.5) { CP.oneShotE = { killed: false, killsDelta: 0, timeout: true }; CP.stage = 15; }
      return;
    case 14:
      if (CP.target) {
        env.forward(C.tmp);
        CP.target.position.copy(boltTargetSeat(C, env)); // re-pinned on the flight ray every tick
        if (!CP.target.userData.alive) {
          CP.oneShotE = { killed: true, killsDelta: C.kills - CP.killsMark };
          CP.target = null; CP.mark = CP.t; CP.stage = 15;
        } else if (CP.t > CP.mark + 1.5) {
          CP.oneShotE = { killed: false, killsDelta: C.kills - CP.killsMark, timeout: true };
          ENEMIES.hitDrone(CP.target, 99); CP.target = null; CP.mark = CP.t; CP.stage = 15;
        }
      }
      return;
    case 15: // settle → weak-point stage (release bolt waited out first: exactly one hit lands)
      if (CP.t >= CP.mark + 1.4) {
        cpFieldClear(C);
        env.forward(C.tmp);
        BOSS.spawnForProbe(C.tmp2.copy(C.pos).addScaledVector(C.tmp, 20).setY(env.ARENA_Y));
        BOSS.probeHold(true); // pinned — the drive owns the geometry end-to-end
        CP.bossHpMark = BOSS.state().hp;
        CP.stage = 16;
      }
      return;
    case 16: { // probe-stamped charged bolt into the weak node — the dmg param through hitBoss
      const t = BOSS.probeTargets(C.pos);
      const away = C.tmp.copy(C.pos).sub(t.node).normalize();
      const b = C.bolts.spawn();
      b.position.copy(t.node).addScaledVector(away, 3.0);
      b.userData.dir.copy(away).negate();
      b.userData.life = env.BOLT_LIFE;
      b.userData.dmg = 6; b.userData.charged = true; // the stamp fireTick's release path puts on real charged bolts
      b.lookAt(C.tmp2.copy(b.position).add(b.userData.dir));
      CP.mark = CP.t; CP.stage = 17;
      return;
    }
    case 17: // record the 18, release the boss
      if (BOSS.state() && BOSS.state().hp <= CP.bossHpMark - 18) {
        CP.weak = { delta: CP.bossHpMark - BOSS.state().hp };
        BOSS.clearBoss();
        cpFieldClear(C);
        CP.mark = CP.t; CP.stage = 18;
      } else if (CP.t > CP.mark + 1.5) {
        CP.weak = { delta: BOSS.state() ? CP.bossHpMark - BOSS.state().hp : 0, timeout: true };
        BOSS.clearBoss();
        cpFieldClear(C);
        CP.mark = CP.t; CP.stage = 18;
      }
      return;
    case 18: // 3-shot burst: 3 × (hold 0.75 s + release + confirm)
      cpFieldClear(C);
      CP.bCharged = C.fired.charged; // the STAGE baseline — never re-touched (the burst3 delta reads against it)
      CP.cycleB = CP.bCharged; // the per-cycle confirm baseline
      CP.burstCycles = 0; CP.mark = CP.t; CP.stage = 19;
      return;
    case 19:
      if (CP.burstCycles < 3) {
        if (!fire && !CP.armed) { C.api.input.fire = true; CP.mark = CP.t; CP.armed = true; }
        else if (CP.armed && CP.t >= CP.mark + 0.75) {
          // diagnostics: the accumulator state AT the release tick — discriminates "the hold
          // never charged" (chargeT < 0.6) from "the release path failed" (chargeT ≥ 0.6)
          CP.burstDiag.push({ chargeT: +C.chargeT.toFixed(3), charging: C.charging, stream: C.fired.stream });
          C.api.input.fire = false; CP.armed = false; CP.mark = CP.t; CP.stage = 20;
        }
      } else {
        CP.burst3 = C.fired.charged - CP.bCharged; // vs the STAGE baseline — 3 confirms = 3
        cpFieldClear(C); CP.mark = CP.t; CP.stage = 22;
      }
      return;
    case 20: // confirm exactly 1 charged this cycle, then next cycle (per-cycle baseline — the
      // stage baseline stays untouched; re-baselining bCharged here made burst3 read 0 on a
      // fully-working 3-bolt burst — the accounting bug the first green run caught)
      if (C.fired.charged > CP.cycleB) {
        CP.cycleB = C.fired.charged; CP.burstCycles++;
        CP.mark = CP.t; CP.stage = 19;
      } else if (CP.t > CP.mark + 1.0) { CP.cycleB = C.fired.charged; CP.burstCycles++; CP.mark = CP.t; CP.stage = 19; }
      return;
    case 22: // pause cancel — arm the harness at 0.7 s of hold (charging true, stream suppressed)
      cpFieldClear(C);
      CP.bStream = C.fired.stream; CP.bCharged = C.fired.charged;
      C.api.input.fire = true; CP.mark = CP.t; CP.stage = 23;
      return;
    case 23:
      if (CP.t >= CP.mark + 0.7) {
        window.__stage2.chargePauseArm = true; // the harness presses the REAL pause keys
        CP.pauseWall = performance.now(); // wall clock — CP.t FREEZES during the pause
        CP.mark = CP.t; CP.stage = 24;
      }
      return;
    case 24: // frozen during the pause (the loop halts tickCombat) — the trigger is the WALL-CLOCK
      // freeze (awake gap ≪ wall gap ⇒ tickCombat was halted), with Go as the explicit ack and
      // an awake-time timeout for the no-pause degenerate case
      if (window.__stage2.chargePauseGo ||
          (performance.now() - CP.pauseWall) - ((CP.t - CP.mark) * 1000) > 300 ||
          CP.t > CP.mark + 8) {
        // the FIRST post-unpause fireTick already zeroed the accumulator (the key set still
        // held KeyP) — record what the drive sees, then release IMMEDIATELY and count from here
        CP.pause = {
          armed: !!window.__stage2.chargePauseGo,
          chargeTAtResume: C.chargeT,
          chargingAtResume: C.charging,
        };
        window.__stage2.chargePauseGo = false;
        CP.bStream = C.fired.stream; // post-release window baseline (the release itself fires no stream)
        C.api.input.fire = false; CP.mark = CP.t; CP.stage = 25;
      }
      return;
    case 25: // post-unpause release: ≤1 stream in the post-release window, 0 charged — the load-bearing
      // triple is chargedAfter 0 + chargeTAtResume ≤ 0.1 + chargingAtResume false (had the ≥0.6
      // accumulator survived the pause, the release would have fired a charged bolt)
      if (CP.t >= CP.mark + 0.4) {
        CP.pause.chargedAfter = C.fired.charged - CP.bCharged;
        CP.pause.streamAfter = C.fired.stream - CP.bStream;
        CP.pause.streamWholeStage = CP.pause.streamAfter; // legacy field name kept for the harness extra
        cpFieldClear(C); CP.mark = CP.t; CP.stage = 45; // on to the RELEASE-DURING-PAUSE cancel
      }
      return;
    case 45: // pause cancel #2 — the REVIEW ordering: hold past the threshold → pause → RELEASE LMB
      // DURING the pause (the window pointerup flips input.fire while tickCombat is halted) →
      // unpause. The accumulator must never survive to a resume-release: chargedAfter must read 0.
      cpFieldClear(C);
      CP.bStream = C.fired.stream; CP.bCharged = C.fired.charged;
      C.api.input.fire = true; CP.mark = CP.t; CP.stage = 46;
      return;
    case 46:
      if (CP.t >= CP.mark + 0.7) {
        window.__stage2.chargePauseArm2 = true; // the harness pauses, RELEASES LMB mid-pause, unpauses
        CP.pauseWall2 = performance.now();
        CP.mark = CP.t; CP.stage = 47;
      }
      return;
    case 47: // frozen during the pause — the trigger is the wall-clock freeze (Go2 = the harness ack)
      if (window.__stage2.chargePauseGo2 ||
          (performance.now() - CP.pauseWall2) - ((CP.t - CP.mark) * 1000) > 300 ||
          CP.t > CP.mark + 8) {
        CP.pauseRelease = {
          armed: !!window.__stage2.chargePauseGo2,
          chargeTAtResume: C.chargeT,
          chargingAtResume: C.charging,
        };
        window.__stage2.chargePauseGo2 = false;
        CP.bStream = C.fired.stream;
        C.api.input.fire = false; // the LMB was released during the pause — mirror it defensively
        CP.mark = CP.t; CP.stage = 48;
      }
      return;
    case 48: // resume after the mid-pause release: 0 charged, 0 stream (fire was released)
      if (CP.t >= CP.mark + 0.4) {
        CP.pauseRelease.chargedAfter = C.fired.charged - CP.bCharged;
        CP.pauseRelease.streamAfter = C.fired.stream - CP.bStream;
        cpFieldClear(C); CP.mark = CP.t; CP.stage = 26; // on to the death cancel
      }
      return;
    case 26: // death cancel — arm the harness at 0.7 s of hold
      CP.bStream = C.fired.stream; CP.bCharged = C.fired.charged;
      C.api.input.fire = true; CP.mark = CP.t; CP.stage = 27;
      return;
    case 27:
      if (CP.t >= CP.mark + 0.7) {
        window.__stage2.chargeDeathArm = true; // the harness fires probeDamagePlayer(500)
        CP.mark = CP.t; CP.stage = 28;
      }
      return;
    case 28: // dead mid-hold — the accumulator is zeroed; release must fire NOTHING
      if (C.dead || CP.t > CP.mark + 8) {
        CP.armed = C.dead;
        C.api.input.fire = false;
        CP.mark = CP.t; CP.stage = 29;
      }
      return;
    case 29: // latch BEFORE the death card (the dead block runs after the drives in tickCombat)
      CP.death = {
        armed: CP.armed,
        chargedAfter: C.fired.charged - CP.bCharged,
        chargeTZeroed: C.chargeT === 0,
      };
      CP.done = true;
      {
        const probe = {
          tap: CP.tap, hold1: CP.hold1, oneShotGunner: CP.oneShotG, oneShotElite: CP.oneShotE,
          weak: CP.weak, burst3: CP.burst3, burstDiag: CP.burstDiag,
          pause: CP.pause, pauseRelease: CP.pauseRelease, death: CP.death,
          charge: { max: +Math.min(1, CP.chargeMax / 0.6).toFixed(3), chargingSeen: CP.chargingSeen },
          reticle: CP.reticle,
        };
        window.__stage2.chargeProbe = probe;
        C.api.report({ chargeProbe: probe }); // parity with scriptedKill/droneProbe — lands on lastReport too
      }
      return;
  }
}
